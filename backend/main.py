import os
import re
import json
import asyncio
import tempfile
import subprocess
import traceback
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from openai import OpenAI

try:
    import evidence_store
except ImportError:
    from backend import evidence_store

load_dotenv()

TIKHUB_TOKEN = os.getenv("TIKHUB_TOKEN", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_FAST_MODEL = os.getenv("DEEPSEEK_FAST_MODEL", "deepseek-v4-flash")
DEEPSEEK_REASONING_MODEL = os.getenv("DEEPSEEK_REASONING_MODEL", "deepseek-v4-pro")
DASHSCOPE_ASR_MODEL = os.getenv("DASHSCOPE_ASR_MODEL", "paraformer-v2")
DASHSCOPE_ASR_SAMPLE_RATE = int(os.getenv("DASHSCOPE_ASR_SAMPLE_RATE", "16000"))
DASHSCOPE_ASR_WAIT_TIMEOUT = int(os.getenv("DASHSCOPE_ASR_WAIT_TIMEOUT", "120"))

# 关键帧多模态：默认开启，可在 .env 设 ENABLE_KEYFRAMES=0 关闭
ENABLE_KEYFRAMES = os.getenv("ENABLE_KEYFRAMES", "1") not in ("0", "false", "False", "")
MAX_KEYFRAMES = int(os.getenv("MAX_KEYFRAMES", "3"))

PRESETS_DIR = os.path.join(os.path.dirname(__file__), "presets")

app = FastAPI(title="观点地图 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------
_whisper_model = None
_llm_client = None
_ocr_engine = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        import whisper
        _whisper_model = whisper.load_model("base")
    return _whisper_model


def get_ocr():
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr_engine = RapidOCR()
    return _ocr_engine


def get_llm_client() -> OpenAI:
    global _llm_client
    if _llm_client is None:
        _llm_client = OpenAI(
            api_key=DEEPSEEK_API_KEY,
            base_url=DEEPSEEK_BASE_URL,
            max_retries=3,
            timeout=60,
        )
    return _llm_client


# 注意：deepseek-v4-pro 是「推理模型」，会先消耗 token 做隐藏推理(reasoning_content)，
# 之后才输出 content。max_tokens 给太小会导致 content 为空（finish_reason=length），
# 因此所有调用都要给足额度（推理预算 + 答案预算）。
def llm_chat(
    prompt: str,
    max_tokens: int = 8192,
    json_mode: bool = False,
    retries: int = 3,
    model: str | None = None,
) -> str:
    client = get_llm_client()
    kwargs = {
        "model": model or DEEPSEEK_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    last_err = None
    for attempt in range(retries):
        try:
            resp = client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content or ""
        except Exception as e:
            last_err = e
            print(f"[llm] 第 {attempt + 1}/{retries} 次调用失败: {str(e)[:120]}")
    raise RuntimeError(f"DeepSeek 调用失败（已重试 {retries} 次）: {last_err}")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    links: list[str]
    topic: str = ""


class AnalyzeSingleRequest(BaseModel):
    link: str
    topic: str = ""


class VideoRefModel(BaseModel):
    id: int = 1
    time: str


class VerifyClaimRequest(BaseModel):
    claim: str
    topic: str = ""
    video_refs: list[VideoRefModel] = Field(default_factory=list)
    top_k: int = 5


class ChatMessage(BaseModel):
    role: str
    content: str


class FollowupRequest(BaseModel):
    analysis: dict
    question: str
    history: list[ChatMessage] = []


# ---------------------------------------------------------------------------
# Video extraction helpers
# ---------------------------------------------------------------------------
def resolve_url(link: str) -> str:
    if "v.douyin.com" in link:
        try:
            r = requests.get(link, allow_redirects=True, timeout=30)
            return r.url
        except Exception:
            return link
    return link


def extract_aweme_id(url: str) -> str | None:
    m = re.search(r"/video/(\d+)", url)
    if m:
        return m.group(1)
    m = re.search(r"(\d{6,})", url)
    return m.group(1) if m else None


def fetch_video_detail(aweme_id: str) -> dict:
    headers = {"Authorization": f"Bearer {TIKHUB_TOKEN}"}
    params = {"aweme_id": aweme_id}
    resp = requests.get(
        "https://api.tikhub.io/api/v1/douyin/web/fetch_one_video",
        headers=headers,
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    detail = resp.json()["data"]["aweme_detail"]
    title = detail.get("item_title") or detail.get("desc") or "未命名视频"
    author = detail["author"]["nickname"]
    audio_url = detail["music"]["play_url"]["uri"]
    video_urls = (detail.get("video", {}).get("play_addr", {}) or {}).get("url_list") or []
    video_url = video_urls[0] if video_urls else None
    return {
        "title": title,
        "author": author,
        "audio_url": audio_url,
        "video_url": video_url,
    }


BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Referer": "https://www.douyin.com/",
}


def http_get_retry(url: str, retries: int = 4, timeout: int = 60, min_bytes: int = 0) -> bytes:
    """抖音 CDN 偶发 SSL EOF / 连接重置 / 限流短响应，带重试和浏览器 UA 重新下载。
    min_bytes>0 时，小于该大小的响应视为限流/错误页，触发重试。"""
    last_err = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=BROWSER_HEADERS, timeout=timeout)
            r.raise_for_status()
            size = len(r.content)
            if size >= min_bytes and size > 0:
                return r.content
            last_err = ValueError(f"响应过小（{size} bytes，疑似限流），重试")
            print(f"[download] 第 {attempt + 1}/{retries} 次：{last_err}")
        except Exception as e:
            last_err = e
            print(f"[download] 第 {attempt + 1}/{retries} 次失败: {str(e)[:120]}")
    raise RuntimeError(f"下载失败（已重试 {retries} 次）: {last_err}")


def download_mp3(audio_url: str) -> str:
    # 真实语音音频通常 > 100KB；限流时 CDN 会返回很短的 200 响应导致转写为空
    content = http_get_retry(audio_url, min_bytes=50_000)
    print(f"[download] mp3 大小 {round(len(content) / 1024, 1)}KB")
    fd, path = tempfile.mkstemp(suffix=".mp3")
    with os.fdopen(fd, "wb") as f:
        f.write(content)
    return path


def fmt_time(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 60}:{sec % 60:02d}"


def get_asr_provider() -> str:
    return (os.getenv("ASR_PROVIDER", "local") or "local").strip().lower()


def transcribe(path: str, audio_url: str | None = None) -> tuple[str, list[dict]]:
    provider = get_asr_provider()
    if provider == "local":
        return transcribe_local(path)
    if provider == "dashscope":
        return transcribe_dashscope(path, audio_url=audio_url)
    raise RuntimeError(f"未知 ASR_PROVIDER={provider!r}，请设为 local 或 dashscope")


def transcribe_local(path: str) -> tuple[str, list[dict]]:
    model = get_whisper_model()
    result = model.transcribe(path, language="zh")
    text = (result.get("text") or "").strip()
    segments = [
        {"start": float(s["start"]), "text": (s.get("text") or "").strip()}
        for s in result.get("segments", [])
    ]
    return text, segments


def transcribe_dashscope(path: str, audio_url: str | None = None) -> tuple[str, list[dict]]:
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ASR_PROVIDER=dashscope 时必须设置 DASHSCOPE_API_KEY")

    try:
        from dashscope.audio.asr import Transcription
    except ImportError as exc:
        raise RuntimeError("缺少 dashscope 依赖，请先安装 requirements.txt") from exc

    last_err: Exception | None = None
    if audio_url:
        try:
            print("[asr] dashscope 录音文件识别：URL 直传")
            return _transcribe_dashscope_recorded(Transcription, [audio_url], api_key)
        except Exception as exc:
            last_err = exc
            print(f"[asr] dashscope URL 直传失败，准备回退: {str(exc)[:200]}")

    if path and os.path.exists(path):
        try:
            print("[asr] dashscope 录音文件识别：尝试本地文件路径")
            return _transcribe_dashscope_recorded(Transcription, [path], api_key)
        except Exception as exc:
            last_err = exc
            print(f"[asr] dashscope 本地文件提交失败，回退 local Whisper: {str(exc)[:200]}")
            return transcribe_local(path)

    if last_err:
        raise RuntimeError(f"DashScope ASR 失败且无本地音频可回退: {last_err}") from last_err
    raise RuntimeError("DashScope ASR 需要 audio_url 或本地音频路径")


def _transcribe_dashscope_recorded(Transcription: Any, file_urls: list[str], api_key: str) -> tuple[str, list[dict]]:
    task = Transcription.async_call(
        model=os.getenv("DASHSCOPE_ASR_MODEL", DASHSCOPE_ASR_MODEL),
        file_urls=file_urls,
        api_key=api_key,
        language_hints=["zh", "en"],
        timestamp_alignment_enabled=True,
    )
    _raise_for_dashscope_response(task, "提交")
    result = Transcription.wait(
        task,
        api_key=api_key,
        wait_timeout=int(os.getenv("DASHSCOPE_ASR_WAIT_TIMEOUT", str(DASHSCOPE_ASR_WAIT_TIMEOUT))),
    )
    _raise_for_dashscope_response(result, "轮询")
    payload = _dashscope_transcription_payload(result)
    text, segments = _extract_dashscope_text_and_segments(payload)
    if not text:
        raise RuntimeError("DashScope 录音文件识别未返回可用文本")
    return text, segments


def _raise_for_dashscope_response(response: Any, stage: str) -> None:
    status_code = getattr(response, "status_code", None)
    if status_code not in (None, 200, "200"):
        message = getattr(response, "message", "") or getattr(response, "error_message", "") or str(response)
        raise RuntimeError(f"DashScope ASR {stage}失败: {message}")


def _dashscope_transcription_payload(result: Any) -> Any:
    plain = _object_to_plain(result)
    output = plain.get("output", plain) if isinstance(plain, dict) else plain
    if isinstance(output, dict):
        results = output.get("results")
        if isinstance(results, list):
            payloads = []
            errors = []
            for item in results:
                if not isinstance(item, dict):
                    continue
                status = str(item.get("subtask_status") or item.get("status") or "").upper()
                if status and status not in ("SUCCEEDED", "SUCCESS"):
                    errors.append(item.get("message") or item.get("error_message") or status)
                    continue
                url = item.get("transcription_url") or item.get("url")
                if url:
                    resp = requests.get(url, timeout=30)
                    resp.raise_for_status()
                    payloads.extend(_normalize_dashscope_transcripts(resp.json()))
            if payloads:
                return {"transcripts": payloads}
            if errors:
                raise RuntimeError(f"DashScope 子任务失败: {'; '.join(str(e) for e in errors)}")
        if output.get("transcription_url"):
            resp = requests.get(output["transcription_url"], timeout=30)
            resp.raise_for_status()
            return resp.json()
    return output


def _normalize_dashscope_transcripts(payload: Any) -> list[dict]:
    plain = _object_to_plain(payload)
    if isinstance(plain, dict):
        transcripts = plain.get("transcripts")
        if isinstance(transcripts, list):
            return [item for item in transcripts if isinstance(item, dict)]
        sentences = plain.get("sentences")
        if isinstance(sentences, list):
            return [plain]
    if isinstance(plain, list):
        return [item for item in plain if isinstance(item, dict)]
    return []


def _object_to_plain(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_object_to_plain(item) for item in value]
    if isinstance(value, tuple):
        return [_object_to_plain(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _object_to_plain(v) for k, v in value.items()}
    if hasattr(value, "to_dict"):
        return _object_to_plain(value.to_dict())
    if hasattr(value, "__dict__"):
        return _object_to_plain(vars(value))
    return str(value)


def _extract_dashscope_text_and_segments(payload: Any) -> tuple[str, list[dict]]:
    plain = _object_to_plain(payload)
    sentence_items = _find_sentence_items(plain)
    segments = [_dashscope_sentence_to_segment(item) for item in sentence_items]
    segments = [segment for segment in segments if segment["text"]]
    text = "".join(segment["text"] for segment in segments).strip()
    if text:
        return text, segments
    return _find_text_value(plain).strip(), []


def _find_sentence_items(value: Any) -> list[Any]:
    if isinstance(value, list):
        if any(isinstance(item, dict) and _find_text_value(item) and _has_time_key(item) for item in value):
            return value
        items: list[Any] = []
        for item in value:
            items.extend(_find_sentence_items(item))
        return items
    if isinstance(value, dict):
        for key in ("sentences", "sentence", "sentence_list", "segments"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
        for nested in value.values():
            items = _find_sentence_items(nested)
            if items:
                return items
    return []


def _has_time_key(value: dict) -> bool:
    return any(key in value for key in ("begin_time", "start_time", "start", "begin"))


def _dashscope_sentence_to_segment(item: Any) -> dict:
    plain = _object_to_plain(item)
    text = _find_text_value(plain).strip()
    start = 0.0
    if isinstance(plain, dict):
        for key in ("begin_time", "start_time", "start", "begin"):
            if key in plain:
                start = _dashscope_time_to_seconds(plain[key], key)
                break
    return {"start": start, "text": text}


def _find_text_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(_find_text_value(item) for item in value)
    if isinstance(value, dict):
        for key in ("text", "sentence", "transcription", "result"):
            nested = value.get(key)
            if isinstance(nested, str) and nested.strip():
                return nested
        for nested in value.values():
            text = _find_text_value(nested)
            if text.strip():
                return text
    return ""


def _dashscope_time_to_seconds(value: Any, key: str = "") -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    if "time" in key or numeric > 100:
        return numeric / 1000.0
    return numeric


def clean_transcript(raw_text: str) -> str:
    prompt = (
        "将以下语音转录文本加上标点、去除明显口头语、纠正错别字。\n"
        "要求：不改变原意，不总结，不删减任何观点，只输出修正后的文本。\n\n"
        f"{raw_text}"
    )
    try:
        cleaned = llm_chat(prompt, max_tokens=8192).strip()
        # 推理模型偶发返回空 content，此时退回原始转写，保证不丢内容
        return cleaned if cleaned else raw_text
    except Exception as e:
        print(f"[clean] 清洗失败，退回原始转写: {str(e)[:120]}")
        return raw_text


# ---------------------------------------------------------------------------
# 关键帧多模态：按转写时间戳，让 AI 选关键时刻 → ffmpeg 抽帧 → OCR 读屏幕文字
# ---------------------------------------------------------------------------
def pick_keyframe_times(segments: list[dict]) -> list[dict]:
    """让 DeepSeek 从带时间戳的转写里，挑出画面可能含关键视觉信息的时间点。"""
    lines = [f"[{int(s['start'])}s] {s['text']}" for s in segments if s["text"]]
    if not lines:
        return []
    transcript = "\n".join(lines)
    prompt = f"""下面是一段视频的语音转写，每行开头是该句出现的时间（秒）。
请找出最多 {MAX_KEYFRAMES} 个“画面里很可能出现关键视觉信息”的时间点，
比如出现表格、数据图、成分表、排行榜、对比、字幕总结、引用来源等
（说话人常用“如图/这张表/如下/数据显示/总结/对比/榜单/成分”等词）。

只输出 JSON，格式：
{{"frames": [{{"time": 时间秒数(整数), "reason": "为什么这一帧可能重要", "quote": "对应的原话"}}]}}
如果整段都没有值得截图的画面，返回 {{"frames": []}}。

【转写】
{transcript}"""
    try:
        raw = llm_chat(prompt, max_tokens=8192, json_mode=True)
        data = parse_json_loose(raw) or {}
        frames = data.get("frames", [])
        out = []
        for f in frames[:MAX_KEYFRAMES]:
            t = f.get("time")
            if isinstance(t, (int, float)):
                out.append({"time": int(t), "reason": f.get("reason", ""), "quote": f.get("quote", "")})
        print(f"[keyframe] AI 选出 {len(out)} 个时间点: {[p['time'] for p in out]}")
        return out
    except Exception as e:
        print(f"[keyframe] 选点失败: {e}")
        return []


def grab_frame(video_url: str, t: int) -> str | None:
    """用 ffmpeg 直接对视频 URL 按时间点拉单帧（HTTP Range，不下载整段）。"""
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    cmd = [
        "ffmpeg", "-y",
        "-headers", f"User-Agent: {BROWSER_HEADERS['User-Agent']}\r\nReferer: https://www.douyin.com/\r\n",
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-ss", str(t),
        "-i", video_url,
        "-frames:v", "1",
        path,
    ]
    for attempt in range(2):
        try:
            subprocess.run(cmd, capture_output=True, timeout=60)
        except Exception as e:
            print(f"[keyframe] 抽帧失败 t={t} (第{attempt + 1}次): {e}")
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path
    try:
        os.remove(path)
    except OSError:
        pass
    return None


def ocr_image(path: str) -> str:
    ocr = get_ocr()
    res, _ = ocr(path)
    if not res:
        return ""
    return " ".join(line[1] for line in res).strip()


def extract_keyframes(video_url: str, segments: list[dict]) -> list[dict]:
    """完整关键帧流程，best-effort：任何环节失败都跳过、不阻断主分析。"""
    picks = pick_keyframe_times(segments)
    out = []
    for p in picks:
        fp = grab_frame(video_url, p["time"])
        if not fp:
            print(f"[keyframe] t={p['time']}s 抽帧失败，跳过")
            continue
        print(f"[keyframe] t={p['time']}s 抽帧成功，OCR 中…")
        try:
            text = ocr_image(fp)
        except Exception as e:
            print(f"[keyframe] OCR 失败: {e}")
            text = ""
        finally:
            try:
                os.remove(fp)
            except OSError:
                pass
        if text:
            out.append({"time": p["time"], "reason": p["reason"], "screen_text": text})
    return out


def extract_one_video(index: int, link: str) -> dict:
    """同步阻塞流程，外层用 asyncio.to_thread 包裹。返回视频文本结构。"""
    full_url = resolve_url(link)
    aweme_id = extract_aweme_id(full_url)
    if not aweme_id:
        raise ValueError(f"无法从链接提取视频ID: {link}")
    detail = fetch_video_detail(aweme_id)
    mp3_path = ""
    if get_asr_provider() == "dashscope":
        try:
            raw_text, segments = transcribe("", audio_url=detail["audio_url"])
        except Exception as e:
            print(f"[asr] URL 直传失败，下载音频后重试/回退: {str(e)[:200]}")
            mp3_path = download_mp3(detail["audio_url"])
            try:
                raw_text, segments = transcribe(mp3_path)
            finally:
                try:
                    os.remove(mp3_path)
                except OSError:
                    pass
    else:
        mp3_path = download_mp3(detail["audio_url"])
        try:
            raw_text, segments = transcribe(mp3_path)
        finally:
            try:
                os.remove(mp3_path)
            except OSError:
                pass
    print(f"[extract] 视频{index} 转写 raw_text={len(raw_text)} 字 segments={len(segments)} 段")
    clean_text = clean_transcript(raw_text) if raw_text else ""
    print(f"[extract] 视频{index} 清洗后 clean_text={len(clean_text)} 字")

    keyframes: list[dict] = []
    if ENABLE_KEYFRAMES and detail.get("video_url") and segments:
        try:
            keyframes = extract_keyframes(detail["video_url"], segments)
        except Exception as e:
            print(f"[keyframe] 视频 {index} 关键帧流程失败: {e}")

    return {
        "id": index,
        "author": detail["author"],
        "title": detail["title"],
        "url": full_url,
        "clean_text": clean_text,
        "segments": segments,
        "keyframes": keyframes,
    }


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
ANALYSIS_FIELDS = ["one_line_summary", "consensus", "conflicts", "recommendations", "references"]


def build_analysis_prompt(topic: str, videos: list[dict]) -> str:
    blocks = []
    for v in videos:
        # 带时间戳的逐句转写，供模型为每条观点标注出自该视频的大致时间
        segs = v.get("segments") or []
        timed = "\n".join(f"  [{fmt_time(s['start'])}] {s['text']}" for s in segs if s["text"])
        block = (
            f"视频{v['id']}（{v['author']}，标题：{v['title']}）\n"
            f"整体内容：{v['clean_text']}\n"
            f"带时间戳逐句转写（用于标注出处时间 time）：\n{timed}"
        )
        kfs = v.get("keyframes") or []
        if kfs:
            screen = "；".join(f"[{fmt_time(k['time'])} 画面]{k['screen_text']}" for k in kfs)
            block += f"\n该视频画面中识别到的关键文字（音频未必读出，请一并参考）：{screen}"
        blocks.append(block)
    content = "\n\n".join(blocks)
    return f"""你是一个严谨的运动健康领域信息分析师，面向健身/运动人群。
以下是 {len(videos)} 条关于「{topic}」的视频内容。这些视频可能来自营销号，存在互相矛盾、夸大甚至错误的说法。
你的任务不是简单总结，而是：把分散甚至互相冲突的视频，重构成用户能判断的观点地图，并依据**主流运动医学/营养学证据**指出哪些说法可信、哪些可能有误。

【视频内容】
{content}

请完成：
1. 提取核心主张，找出共识、分歧、按情境给出可执行建议（建议要有明确边界条件，不空泛）。
2. 【视频出处 video_refs】每条共识/分歧立场/建议/可能错误，都要标注它来自哪条视频、以及在该视频的**大致时间**（用上面带时间戳的逐句转写来定位，格式 "分:秒"，如 "1:23"）。
   video_refs 是数组，元素形如 {{"id": 视频号, "time": "1:23"}}。这是“某句话来自视频几分几秒”的依据，不要写成参考文献。
3. 【可能不准确的说法 misleading】对照主流运动医学/营养学证据，挑出视频里与权威共识相悖或被夸大的说法，给出更准确的说法。
4. 【权威背书 authorities】**仅在纠正错误、或给出“主流证据”判断时**，列出支撑你的权威来源（如 ACSM 美国运动医学会指南、ISSN 国际运动营养学会立场声明、WHO 身体活动指南、权威期刊系统综述等）。
   要求：只引用你高度确信真实存在的权威机构/指南/立场声明，**宁可笼统也不要编造具体论文标题、年份或 DOI**。把它们列在 authorities，并在相应条目用 authority_ids 引用其 id（如 ["A1"]）。普通的视频观点**不需要** authority_ids。
5. 如果某条目主要依据了上面的「画面文字」（音频没说、只在画面出现），加 "screen_evidence"，格式："视频{{n}} {{时间}} 画面：{{识别到的关键文字}}"。没用到就不加。

严格按以下 JSON 输出，不输出任何其他内容（authority_ids / screen_evidence 为可选，仅在确有依据时出现）：
{{
  "one_line_summary": "一句话总结整体判断，体现共识、分歧或适用边界",
  "consensus": [ {{ "point": "共识观点", "video_refs": [{{"id":1,"time":"1:23"}},{{"id":2,"time":"0:40"}}], "screen_evidence": "视频2 1:21 画面：……" }} ],
  "conflicts": [ {{
      "topic": "争议点标题",
      "pro": {{ "argument": "支持方观点和理由", "video_refs": [{{"id":1,"time":"0:30"}}] }},
      "con": {{ "argument": "反对方观点和理由", "video_refs": [{{"id":2,"time":"2:10"}}] }},
      "evidence_note": "主流证据更支持哪一方，一句话说明",
      "authority_ids": ["A1"]
  }} ],
  "recommendations": [ {{
      "condition": "如果你是 XX 情况",
      "advice": "具体可执行建议，有明确边界条件",
      "video_refs": [{{"id":1,"time":"1:05"}}],
      "authority_ids": ["A2"]
  }} ],
  "misleading": [ {{
      "claim": "视频中可能不准确或被夸大的说法",
      "video_refs": [{{"id":1,"time":"0:50"}}],
      "correction": "更准确的说法（依据主流证据）",
      "authority_ids": ["A1"]
  }} ],
  "authorities": [ {{
      "id": "A1", "name": "权威机构/指南/立场声明名称（真实存在）", "note": "它支持的结论一句话"
  }} ],
  "references": [ {{
      "id": 1, "author": "作者名", "title": "视频标题",
      "claim": "该视频核心主张一句话", "url": "原链接"
  }} ]
}}"""


def parse_json_loose(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
        return None


def run_analysis(topic: str, videos: list[dict]) -> dict:
    prompt = build_analysis_prompt(topic, videos)
    raw = llm_chat(prompt, json_mode=True)
    data = parse_json_loose(raw)

    if data is None or not all(k in data for k in ANALYSIS_FIELDS):
        repair_prompt = (
            "下面的内容应该是一个合法 JSON，但格式有误。请只输出修复后的合法 JSON，"
            "保持原有数据，不要添加说明：\n\n" + raw
        )
        raw2 = llm_chat(repair_prompt, json_mode=True)
        data = parse_json_loose(raw2)

    if data is None or not all(k in data for k in ANALYSIS_FIELDS):
        raise HTTPException(status_code=500, detail="AI 返回的分析结果格式无效")

    # 用真实提取到的视频信息回填 references，保证可溯源
    if videos:
        data["references"] = [
            {
                "id": v["id"],
                "author": v["author"],
                "title": v["title"],
                "claim": next(
                    (r.get("claim", "") for r in data.get("references", [])
                     if r.get("id") == v["id"]),
                    "",
                ),
                "url": v["url"],
            }
            for v in videos
        ]
    return data


# ---------------------------------------------------------------------------
# Single-video claim extraction + RAG verification
# ---------------------------------------------------------------------------
CLAIM_SIGNALS = {"疑似夸大", "有条件", "较公认", "有争议"}
VERIFY_FIELDS = ["verdict", "risk_level", "confidence", "strength", "correction", "cited_evidence_ids"]


def video_to_claim_prompt(topic: str, video: dict) -> str:
    segs = video.get("segments") or []
    timed = "\n".join(f"  [{fmt_time(s['start'])}] {s['text']}" for s in segs if s.get("text"))
    kfs = video.get("keyframes") or []
    screen = "\n".join(f"  [{fmt_time(k['time'])} 画面] {k.get('screen_text', '')}" for k in kfs)
    screen_block = screen if screen else "  无可用画面文字"
    return f"""你是 FitProof 的健康短视频信息拆解助手。请从单条视频中拆出 3~5 条「可核验主张」。
较公认的说法也要列出，不能只挑刺；目标是让用户选择自己最想核验的一条。

【话题】
{topic or "健康信息"}

【视频信息】
作者：{video.get('author', '')}
标题：{video.get('title', '')}
整体转写：{video.get('clean_text', '')}

【带时间戳逐句转写】
{timed}

【画面 OCR】
{screen_block}

要求：
1. 每条 claim 尽量保留视频原话或接近原话，不要改写成学术结论。
2. video_refs 标出该主张来自视频1的大致时间，格式 {{"id":1,"time":"0:12"}}。
3. signal 只能从 ["疑似夸大","有条件","较公认","有争议"] 中选择。
4. why 用一句话说明为什么值得核验。
5. 只输出 JSON，不输出解释。

JSON 格式：
{{"claims":[
  {{"claim":"主张原话","video_refs":[{{"id":1,"time":"0:12"}}],"signal":"较公认","why":"为什么值得核验"}}
]}}"""


def normalize_claims(data: dict) -> list[dict]:
    claims = data.get("claims", [])
    if not isinstance(claims, list):
        return []
    normalized = []
    for item in claims[:5]:
        if not isinstance(item, dict):
            continue
        claim = str(item.get("claim") or "").strip()
        if not claim:
            continue
        refs = item.get("video_refs") or []
        good_refs = []
        if isinstance(refs, list):
            for ref in refs:
                if not isinstance(ref, dict):
                    continue
                time_value = str(ref.get("time") or "").strip()
                if time_value:
                    good_refs.append({"id": int(ref.get("id") or 1), "time": time_value})
        signal = str(item.get("signal") or "").strip()
        if signal not in CLAIM_SIGNALS:
            signal = "有条件"
        normalized.append({
            "claim": claim,
            "video_refs": good_refs,
            "signal": signal,
            "why": str(item.get("why") or "").strip(),
        })
    return normalized


def extract_claims_from_video(video: dict, topic: str = "") -> dict:
    prompt = video_to_claim_prompt(topic, video)
    raw = llm_chat(prompt, max_tokens=4096, json_mode=True, model=DEEPSEEK_FAST_MODEL)
    data = parse_json_loose(raw) or {}
    claims = normalize_claims(data)
    if not claims:
        raise HTTPException(status_code=500, detail="AI 未能拆出可核验主张")
    reference = {
        "id": video.get("id", 1),
        "author": video.get("author", ""),
        "title": video.get("title", ""),
        "url": video.get("url", ""),
    }
    return {
        "reference": reference,
        "claims": claims,
        "keyframes": video.get("keyframes") or [],
    }


def search_evidence_for_claim(claim: str, topic: str = "", top_k: int = 5) -> tuple[list[dict], str]:
    topic = topic.strip()
    if topic:
        hits = evidence_store.search(claim, topic=topic, top_k=top_k)
        if hits:
            return hits, "matched"
    hits = evidence_store.search(claim, topic="", top_k=top_k)
    return (hits, "matched") if hits else ([], "not_found")


def evidence_prompt_block(evidence: list[dict]) -> str:
    if not evidence:
        return "未命中已收录权威依据。以下只能作为 AI 常识判断，必须明确标注这一点，并把 strength/依据强度降为低。"
    lines = []
    for item in evidence:
        lines.append(
            "\n".join([
                f"证据ID：{item.get('id', '')}",
                f"结论：{item.get('claim', '')}",
                f"章节：{item.get('section', '')}",
                f"强度：{item.get('strength', '')}",
                f"来源：{item.get('source_doc', '')} / {item.get('org', '')} / {item.get('year', '')}",
                f"页码：{item.get('page', '')}",
                f"URL：{item.get('url', '')}",
            ])
        )
    return "\n\n".join(lines)


def build_verify_prompt(claim: str, topic: str, evidence: list[dict], video_refs: list[dict] | None = None) -> str:
    allowed_ids = [item.get("id", "") for item in evidence]
    refs_text = json.dumps(video_refs or [], ensure_ascii=False)
    return f"""你是严谨的健康信息核验助手。请核验用户从短视频中选择的一条主张。

【用户选择的主张】
{claim}

【话题】
{topic or "健康信息"}

【视频出处 video_refs】
{refs_text}

【已检索到的真实权威证据】
{evidence_prompt_block(evidence)}

规则：
1. verdict、risk_level、confidence、strength 必须由你基于证据判断后输出，不能依赖关键词模板。
2. 如果有证据，只能引用上方注入的证据ID：{allowed_ids}；cited_evidence_ids 不得出现其它ID。
3. 不得编造指南、论文、年份、DOI 或 URL。证据不足就说证据不足。
4. 如果未命中已收录权威依据，correction 必须包含“未命中已收录权威依据，以下为AI常识判断”，并把 strength 设为“低”。
5. 只输出 JSON，不输出解释。

JSON 格式：
{{
  "verdict": "可信/基本可信/需加条件/证据不足/不建议采纳 等简短判定",
  "risk_level": "低/中/高",
  "confidence": "低/中/高",
  "strength": "低/中/高",
  "correction": "更准确的说法，说明适用边界",
  "cited_evidence_ids": ["证据ID"]
}}"""


def parse_verify_result(raw: str, evidence: list[dict]) -> dict:
    data = parse_json_loose(raw) or {}
    missing = [k for k in VERIFY_FIELDS if k not in data]
    if missing:
        raise HTTPException(status_code=500, detail=f"AI 核验结果缺少字段: {', '.join(missing)}")
    allowed = {item.get("id") for item in evidence}
    cited = data.get("cited_evidence_ids") or []
    if not isinstance(cited, list):
        cited = []
    data["cited_evidence_ids"] = [str(cid) for cid in cited if cid in allowed]
    return data


def verify_single_claim(
    claim: str,
    topic: str = "",
    video_refs: list[dict] | None = None,
    top_k: int = 5,
) -> dict:
    evidence, evidence_status = search_evidence_for_claim(claim, topic=topic, top_k=top_k)
    prompt = build_verify_prompt(claim, topic, evidence, video_refs=video_refs)
    raw = llm_chat(prompt, max_tokens=8192, json_mode=True, model=DEEPSEEK_REASONING_MODEL)
    data = parse_verify_result(raw, evidence)
    if evidence_status == "not_found":
        data["strength"] = "低"
        data["cited_evidence_ids"] = []
    data.update({
        "claim": claim,
        "topic": topic,
        "video_refs": video_refs or [],
        "evidence_status": evidence_status,
        "evidence": evidence,
    })
    return data


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/preset/{preset_id}")
def get_preset(preset_id: str):
    if preset_id not in {"1", "2", "3", "5"}:
        raise HTTPException(status_code=404, detail="预置话题不存在")
    path = os.path.join(PRESETS_DIR, f"{preset_id}.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="预置数据文件不存在")
    except Exception:
        raise HTTPException(status_code=500, detail="读取预置数据失败")


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    if not (2 <= len(req.links) <= 5):
        raise HTTPException(status_code=400, detail="请提供 2-5 条链接")

    async def safe_extract(idx: int, link: str):
        try:
            return await asyncio.to_thread(extract_one_video, idx, link)
        except Exception as e:
            print(f"[analyze] 视频 {idx} 提取失败: {e}")
            traceback.print_exc()
            return None

    results = await asyncio.gather(
        *[safe_extract(i + 1, link) for i, link in enumerate(req.links)]
    )
    videos = [v for v in results if v and v.get("clean_text")]

    # 重新编号，保证 sources 连续
    for new_id, v in enumerate(videos, start=1):
        v["id"] = new_id

    if not videos:
        raise HTTPException(
            status_code=502,
            detail="所有视频内容提取失败，请改用预置话题体验完整流程",
        )

    try:
        analysis = await asyncio.to_thread(run_analysis, req.topic or "该话题", videos)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[analyze] 分析失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="AI 分析失败，请重试或使用预置话题")

    # 附带每条视频提取到的关键帧（含画面文字），供前端展示「AI 看了画面」的创新点
    analysis["keyframes"] = [
        {
            "video_id": v["id"],
            "author": v["author"],
            "title": v["title"],
            "frames": v.get("keyframes") or [],
        }
        for v in videos
        if v.get("keyframes")
    ]
    return analysis


@app.post("/api/analyze_single")
async def analyze_single(req: AnalyzeSingleRequest):
    if not req.link.strip():
        raise HTTPException(status_code=400, detail="请提供一条视频链接")
    try:
        video = await asyncio.to_thread(extract_one_video, 1, req.link)
    except Exception as e:
        print(f"[analyze_single] 视频提取失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=502, detail="视频内容提取失败，请检查链接或稍后重试")

    if not video.get("clean_text"):
        raise HTTPException(status_code=502, detail="未能提取到视频文本内容")

    try:
        result = await asyncio.to_thread(extract_claims_from_video, video, req.topic)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[analyze_single] 主张拆解失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="AI 拆解主张失败，请重试")

    result["topic"] = req.topic
    return result


@app.post("/api/verify_claim")
async def verify_claim(req: VerifyClaimRequest):
    claim = req.claim.strip()
    if not claim:
        raise HTTPException(status_code=400, detail="请提供要核验的主张")
    top_k = max(1, min(req.top_k, 10))
    video_refs = [r.model_dump() if hasattr(r, "model_dump") else r.dict() for r in req.video_refs]
    try:
        return await asyncio.to_thread(
            verify_single_claim,
            claim,
            req.topic,
            video_refs,
            top_k,
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[verify_claim] 核验失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="AI 核验失败，请重试")


@app.post("/api/followup")
async def followup(req: FollowupRequest):
    history_text = "\n".join(f"{m.role}: {m.content}" for m in req.history)
    prompt = f"""你是这组视频分析的讲解助手，话题围绕「运动健康」。下面是已分析内容：
{json.dumps(req.analysis, ensure_ascii=False)}

对话历史：
{history_text}

用户问题：
{req.question}

回答要求：
1. 优先依据上面的已分析内容回答；如果引用了某条视频的观点，用来源编号标注，例如 [1]、[2]。
2. 如果用户是想**理解视频里出现的概念或术语**（例如"什么是高强度间歇训练 HIIT""低 GI 碳水是什么"），
   请用通俗、准确的方式做名词解释/科普，帮助用户看懂，可以补充必要的常识性背景知识。
3. 如果用户问的是与本话题相关的延伸问题，结合已分析内容尽量解答，并指出哪些有视频支撑、哪些是通用常识。
4. 只有当问题与该运动健康话题**完全无关**时（例如问天气、问股票），才回复：这个问题和当前分析的视频话题无关哦。
5. 回答简洁清楚，避免空话。"""
    try:
        answer = await asyncio.to_thread(llm_chat, prompt, 8192)
    except Exception as e:
        print(f"[followup] 失败: {e}")
        raise HTTPException(status_code=500, detail="追问失败，请重试")
    return {"answer": answer.strip()}
