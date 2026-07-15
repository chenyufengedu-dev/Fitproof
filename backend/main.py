import os
import re
import json
import asyncio
import base64
import tempfile
import subprocess
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
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
DASHSCOPE_BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
DASHSCOPE_VL_MODEL = os.getenv("DASHSCOPE_VL_MODEL", "qwen3-vl-flash")
MEDIA_FETCH_ORDER = os.getenv("MEDIA_FETCH_ORDER", "tikhub,upload")

# 关键帧多模态：默认开启，可在 .env 设 ENABLE_KEYFRAMES=0 关闭
ENABLE_KEYFRAMES = os.getenv("ENABLE_KEYFRAMES", "1") not in ("0", "false", "False", "")
ENABLE_KEYFRAME_GATE = os.getenv("ENABLE_KEYFRAME_GATE", "1") not in ("0", "false", "False", "")
KEYFRAME_INTERVAL = int(os.getenv("KEYFRAME_INTERVAL", "5"))
KEYFRAME_MAX = int(os.getenv("KEYFRAME_MAX", os.getenv("MAX_KEYFRAMES", "8")))
KEYFRAME_SAMPLE_LIMIT = int(os.getenv("KEYFRAME_SAMPLE_LIMIT", "120"))
KEYFRAME_PER_MIN = int(os.getenv("KEYFRAME_PER_MIN", "2"))
KEYFRAME_HARD_CAP = int(os.getenv("KEYFRAME_HARD_CAP", "15"))
KEYFRAME_PHASH_THRESHOLD = int(os.getenv("KEYFRAME_PHASH_THRESHOLD", "8"))
KEYFRAME_WORKERS = int(os.getenv("KEYFRAME_WORKERS", "16"))
KEYFRAME_FFMPEG_TIMEOUT = int(os.getenv("KEYFRAME_FFMPEG_TIMEOUT", "5"))
KEYFRAME_GRAB_RETRIES = int(os.getenv("KEYFRAME_GRAB_RETRIES", "1"))
KEYFRAME_OCR_FALLBACK = os.getenv("KEYFRAME_OCR_FALLBACK", "0") in ("1", "true", "True")
MAX_KEYFRAMES = KEYFRAME_MAX

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
_dashscope_vl_client = None
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


def get_dashscope_vl_client() -> OpenAI:
    global _dashscope_vl_client
    if _dashscope_vl_client is None:
        api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("关键帧视觉解读需要设置 DASHSCOPE_API_KEY")
        _dashscope_vl_client = OpenAI(
            api_key=api_key,
            base_url=os.getenv("DASHSCOPE_BASE_URL", DASHSCOPE_BASE_URL),
            max_retries=2,
            timeout=45,
        )
    return _dashscope_vl_client


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
    duration_raw = (
        detail.get("duration")
        or (detail.get("video", {}) or {}).get("duration")
        or (detail.get("video", {}) or {}).get("duration_ms")
    )
    duration = None
    if isinstance(duration_raw, (int, float)) and duration_raw > 0:
        duration = float(duration_raw) / 1000 if duration_raw > 1000 else float(duration_raw)
    return {
        "title": title,
        "author": author,
        "audio_url": audio_url,
        "video_url": video_url,
        "duration": duration,
    }


def fetch_media_tikhub(link: str) -> dict:
    """主获取层：保留 TikHub URL 获取逻辑。"""
    full_url = resolve_url(link)
    aweme_id = extract_aweme_id(full_url)
    if not aweme_id:
        raise ValueError(f"无法从链接提取视频ID: {link}")
    detail = fetch_video_detail(aweme_id)
    detail["source"] = "tikhub"
    detail["cleanup_paths"] = []
    return detail


def fetch_media_upload_placeholder(link: str) -> dict:
    raise RuntimeError("文件上传获取层尚未接入")


def fetch_media(link: str) -> dict:
    """统一媒体获取接口：TikHub → 文件上传占位。"""
    fetchers = {
        "tikhub": fetch_media_tikhub,
        "upload": fetch_media_upload_placeholder,
        "file": fetch_media_upload_placeholder,
    }
    errors = []
    order = os.getenv("MEDIA_FETCH_ORDER", MEDIA_FETCH_ORDER)
    for name in [item.strip() for item in order.split(",") if item.strip()]:
        fetcher = fetchers.get(name)
        if not fetcher:
            continue
        try:
            media = fetcher(link)
            print(f"[media] {name} 获取成功")
            return media
        except Exception as e:
            reason = f"{name}: {str(e)[:200]}"
            errors.append(reason)
            print(f"[media] {name} 获取失败，切换下一个: {str(e)[:200]}")
    raise RuntimeError("所有媒体获取方式均失败：" + " | ".join(errors))


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


def download_video(video_url: str) -> str:
    # 抖音视频 CDN 对 ffmpeg Range seek 很敏感；完整下载后本地 seek 更稳
    content = http_get_retry(video_url, min_bytes=100_000)
    print(f"[download] video 大小 {round(len(content) / 1024 / 1024, 2)}MB")
    fd, path = tempfile.mkstemp(suffix=".mp4")
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
        # 清洗是机械的加标点/纠错，用快模型即可（不用推理模型，省一半时间）
        cleaned = llm_chat(prompt, max_tokens=4096, model=DEEPSEEK_FAST_MODEL).strip()
        return cleaned if cleaned else raw_text
    except Exception as e:
        print(f"[clean] 清洗失败，退回原始转写: {str(e)[:120]}")
        return raw_text


# ---------------------------------------------------------------------------
# 关键帧多模态：定时采样 → HTTP Range 抽帧 → pHash 去重 → Qwen-VL 解读
# ---------------------------------------------------------------------------
def estimate_video_duration(segments: list[dict] | None = None, duration: float | None = None) -> float:
    if isinstance(duration, (int, float)) and duration > 0:
        return float(duration)
    starts = []
    for s in segments or []:
        for key in ("end", "start"):
            value = s.get(key)
            if isinstance(value, (int, float)):
                starts.append(float(value))
                break
    return max(starts) if starts else float(KEYFRAME_SAMPLE_LIMIT)


def keyframe_budget(duration: float | None) -> int:
    duration_sec = max(0.0, float(duration or 0))
    return max(1, min(KEYFRAME_HARD_CAP, KEYFRAME_MAX + KEYFRAME_PER_MIN * int(duration_sec // 60)))


def pick_keyframe_times(
    segments: list[dict] | None,
    interval: int | None = None,
    sample_limit: int | None = None,
    duration: float | None = None,
) -> list[dict]:
    """在全片时长内均匀采样；抽帧失败由调用方按 best-effort 处理。"""
    duration_sec = estimate_video_duration(segments, duration=duration)
    if duration_sec <= 0:
        return []
    target = keyframe_budget(duration_sec)
    times = [duration_sec * (i + 0.5) / target for i in range(target)]
    print(f"[keyframe] 定时采样 {len(times)} 个时间点: {times}")
    return [{"time": t} for t in times]


def grab_frame(video_url: str, t: int) -> str | None:
    """用 ffmpeg 从本地视频或 URL 按时间点抽单帧。"""
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    ffmpeg_timeout = max(2, int(os.getenv("KEYFRAME_FFMPEG_TIMEOUT", str(KEYFRAME_FFMPEG_TIMEOUT))))
    is_remote = re.match(r"https?://", video_url or "") is not None
    if is_remote:
        cmd = [
            "ffmpeg", "-y",
            "-headers", f"User-Agent: {BROWSER_HEADERS['User-Agent']}\r\nReferer: https://www.douyin.com/\r\n",
            "-reconnect", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5",
            "-ss", str(t),
            "-rw_timeout", str(ffmpeg_timeout * 1_000_000),
            "-i", video_url,
            "-frames:v", "1",
            path,
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(t),
            "-i", video_url,
            "-frames:v", "1",
            path,
        ]
    retries = max(1, int(os.getenv("KEYFRAME_GRAB_RETRIES", str(KEYFRAME_GRAB_RETRIES))))
    for attempt in range(retries):
        try:
            subprocess.run(cmd, capture_output=True, timeout=ffmpeg_timeout)
        except Exception as e:
            remove_file_quietly(path)
            print(f"[keyframe] 抽帧失败 t={t} (第{attempt + 1}次): {str(e)[:120]}")
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path
    remove_file_quietly(path)
    return None


def remove_file_quietly(path: str | None) -> None:
    if not path:
        return
    try:
        if os.path.isdir(path):
            os.rmdir(path)
        else:
            os.remove(path)
    except OSError:
        pass


def image_phash(path: str) -> int:
    """计算 64-bit pHash。失败交给上层 best-effort 跳过该帧。"""
    from PIL import Image
    import numpy as np

    with Image.open(path) as img:
        gray = img.convert("L").resize((32, 32))
        pixels = np.asarray(gray, dtype=float)
    n = 32
    k = 8
    x = np.arange(n)
    u = np.arange(k).reshape(-1, 1)
    basis = np.cos(((2 * x + 1) * u * np.pi) / (2 * n))
    basis[0, :] *= 1 / np.sqrt(2)
    dct = (basis @ pixels @ basis.T) / 4
    low = dct[:8, :8].flatten()
    median = float(np.median(low[1:]))
    bits = low > median
    value = 0
    for bit in bits:
        value = (value << 1) | int(bool(bit))
    return value


def phash_distance(a: int, b: int) -> int:
    return int((a ^ b).bit_count())


def _is_none_visual_description(text: str) -> bool:
    normalized = re.sub(r"[\s。.!！,，；;：:]+", "", (text or "").strip())
    return normalized in {"", "无", "沒有", "没有", "无关"}


def _image_data_url(path: str) -> str:
    with open(path, "rb") as f:
        payload = base64.b64encode(f.read()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"


def describe_frame(path: str) -> str:
    """用 Qwen-VL 解读单帧；无关画面按提示返回“无”。"""
    client = get_dashscope_vl_client()
    prompt = (
        "描述这帧里与健康说法相关的信息——文字/表格数据/图表趋势/动作示范；"
        "若只是人脸、转场、与健康无关，只回“无”。"
    )
    resp = client.chat.completions.create(
        model=os.getenv("DASHSCOPE_VL_MODEL", DASHSCOPE_VL_MODEL),
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": _image_data_url(path)}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        temperature=0.1,
        max_tokens=512,
    )
    return (resp.choices[0].message.content or "").strip()


def ocr_image(path: str) -> str:
    ocr = get_ocr()
    res, _ = ocr(path)
    if not res:
        return ""
    return " ".join(line[1] for line in res).strip()


def _grab_frames_parallel(video_url: str, picks: list[dict]) -> list[dict]:
    if not picks:
        return []
    workers = min(KEYFRAME_WORKERS, max(1, len(picks)))

    def one(pick: dict) -> dict | None:
        t = int(pick["time"])
        fp = grab_frame(video_url, t)
        if not fp:
            print(f"[keyframe] t={t}s 抽帧失败，跳过")
            return None
        return {"time": t, "path": fp}

    frames = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, p) for p in picks]
        for future in as_completed(futures):
            try:
                frame = future.result()
                if frame:
                    frames.append(frame)
            except Exception as e:
                print(f"[keyframe] 并行抽帧失败: {e}")
    return sorted(frames, key=lambda item: item["time"])


def dedupe_frames_by_phash(frames: list[dict], threshold: int | None = None) -> list[dict]:
    threshold = KEYFRAME_PHASH_THRESHOLD if threshold is None else int(threshold)
    deduped = []
    last_hash: int | None = None
    for frame in frames:
        try:
            current_hash = image_phash(frame["path"])
        except Exception as e:
            print(f"[keyframe] t={frame['time']}s pHash 失败，跳过: {e}")
            remove_file_quietly(frame.get("path"))
            continue
        if last_hash is not None and phash_distance(last_hash, current_hash) <= threshold:
            print(f"[keyframe] t={frame['time']}s 与上一帧相似，合并")
            remove_file_quietly(frame.get("path"))
            continue
        frame["phash"] = current_hash
        deduped.append(frame)
        last_hash = current_hash
    return deduped


def _describe_frames_parallel(frames: list[dict]) -> list[dict]:
    if not frames:
        return []
    workers = min(KEYFRAME_WORKERS, max(1, len(frames)))

    def one(frame: dict) -> dict | None:
        try:
            text = describe_frame(frame["path"])
        except Exception as e:
            print(f"[keyframe] t={frame['time']}s 视觉解读失败，跳过: {e}")
            if not KEYFRAME_OCR_FALLBACK:
                return None
            try:
                text = ocr_image(frame["path"])
            except Exception as ocr_exc:
                print(f"[keyframe] t={frame['time']}s OCR 兜底失败，跳过: {ocr_exc}")
                return None
        if _is_none_visual_description(text):
            return None
        return {"time": frame["time"], "screen_text": text}

    out = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, frame) for frame in frames]
        for future in as_completed(futures):
            try:
                item = future.result()
                if item:
                    out.append(item)
            except Exception as e:
                print(f"[keyframe] 并行视觉解读失败: {e}")
    return sorted(out, key=lambda item: item["time"])


def should_describe_keyframes(clean_text: str) -> tuple[bool, str]:
    """用快模型激进判断转写是否需要画面核验；失败时保守保留视觉。"""
    prompt = f"""你是健康视频画面核验闸门。根据下面的语音转录，严格输出 JSON：
{{"need_visual": true 或 false, "reason": "不超过20字的理由"}}

这是激进省时策略：只有转录中出现明确需要看画面的线索才填 true，例如“看这张图/如图/报告单/化验单/成分表/配料表/数据/数值/百分比/图表/趋势/示范动作”。
普通口播、泛泛提及健康知识、没有明确画面线索时一律填 false。不要猜测视频可能有画面，不要输出 JSON 以外内容。

转录：
{clean_text}"""
    try:
        raw = llm_chat(prompt, max_tokens=256, json_mode=True, model=DEEPSEEK_FAST_MODEL)
        data = parse_json_loose(raw)
        if not isinstance(data, dict) or not isinstance(data.get("need_visual"), bool):
            return True, "闸门返回解析失败，保守保留视觉"
        reason = str(data.get("reason") or "模型未提供理由").strip()[:80]
        return data["need_visual"], reason
    except Exception as e:
        print(f"[keyframe-gate] 调用失败，保守保留视觉: {str(e)[:160]}")
        return True, "闸门调用异常，保守保留视觉"


def sample_keyframes(
    video_ref: str,
    segments: list[dict] | None = None,
    *,
    duration: float | None = None,
    max_frames: int | None = None,
    phash_threshold: int | None = None,
) -> list[dict]:
    """仅做定时采样、抽帧和去重；调用方负责视觉解读与清理临时帧。"""
    duration_sec = estimate_video_duration(segments or [], duration=duration)
    max_frames = max(1, int(max_frames)) if max_frames is not None else keyframe_budget(duration_sec)
    picks = pick_keyframe_times(segments or [], duration=duration)
    grabbed = _grab_frames_parallel(video_ref, picks)
    deduped_all = dedupe_frames_by_phash(grabbed, threshold=phash_threshold)
    deduped = deduped_all[:max_frames]
    for frame in deduped_all[max_frames:]:
        remove_file_quietly(frame.get("path"))
    print(f"[keyframe] 抽到 {len(grabbed)} 帧，去重后保留 {len(deduped)} 帧")
    return deduped


def extract_keyframes(
    video_url: str,
    segments: list[dict] | None = None,
    *,
    duration: float | None = None,
    max_frames: int | None = None,
    phash_threshold: int | None = None,
) -> list[dict]:
    """完整关键帧流程，best-effort：任何环节失败都跳过、不阻断主分析。"""
    deduped = sample_keyframes(
        video_url,
        segments,
        duration=duration,
        max_frames=max_frames,
        phash_threshold=phash_threshold,
    )
    print(f"[keyframe] 开始视觉解读 {len(deduped)} 帧")
    try:
        return _describe_frames_parallel(deduped)
    finally:
        for frame in deduped:
            remove_file_quietly(frame.get("path"))


def extract_one_video(index: int, link: str) -> dict:
    """同步阻塞流程，外层用 asyncio.to_thread 包裹。返回视频文本结构。"""
    full_url = resolve_url(link)
    media = fetch_media(link)

    def run_audio_line() -> tuple[str, list[dict], str]:
        mp3_path = ""
        audio_path = media.get("audio_path")
        audio_url = media.get("audio_url")
        if audio_path:
            raw, segs = transcribe(audio_path)
        elif get_asr_provider() == "dashscope" and audio_url:
            try:
                raw, segs = transcribe("", audio_url=audio_url)
            except Exception as e:
                print(f"[asr] URL 直传失败，下载音频后重试/回退: {str(e)[:200]}")
                mp3_path = download_mp3(audio_url)
                try:
                    raw, segs = transcribe(mp3_path)
                finally:
                    remove_file_quietly(mp3_path)
        elif audio_url:
            mp3_path = download_mp3(audio_url)
            try:
                raw, segs = transcribe(mp3_path)
            finally:
                remove_file_quietly(mp3_path)
        else:
            raise RuntimeError("媒体获取结果缺少 audio_path/audio_url")
        print(f"[extract] 视频{index} 转写 raw_text={len(raw)} 字 segments={len(segs)} 段")
        # 云 ASR 返回的文本已带标点、已干净，跳过清洗省 ~20s；本地 Whisper 才需要清洗
        if not raw:
            cleaned = ""
        elif get_asr_provider() == "dashscope":
            cleaned = raw
            print(f"[extract] 视频{index} 云ASR文本已干净，跳过清洗")
        else:
            cleaned = clean_transcript(raw)
            print(f"[extract] 视频{index} 清洗后 clean_text={len(cleaned)} 字")
        return cleaned, segs, raw

    def run_visual_line() -> list[dict]:
        if not ENABLE_KEYFRAMES:
            return []
        video_ref = media.get("video_path")
        temp_video_path = ""
        try:
            if not video_ref:
                video_url = media.get("video_url")
                if not video_url:
                    return []
                temp_video_path = download_video(video_url)
                video_ref = temp_video_path
            duration_segment = [{"start": float(media["duration"])}] if media.get("duration") else []
            return sample_keyframes(video_ref, duration_segment)
        except Exception as e:
            print(f"[keyframe] 视频 {index} 关键帧流程失败: {e}")
            return []
        finally:
            if temp_video_path:
                remove_file_quietly(temp_video_path)

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            audio_future = pool.submit(run_audio_line)
            keyframe_future = pool.submit(run_visual_line)
            clean_text, segments, raw_text = audio_future.result()
            try:
                deduped_frames = keyframe_future.result()
            except Exception as e:
                print(f"[keyframe] 视频 {index} 关键帧流程失败: {e}")
                deduped_frames = []

        keyframes = []
        if deduped_frames:
            need_visual = True
            reason = "闸门关闭，按原行为解读"
            if ENABLE_KEYFRAME_GATE:
                need_visual, reason = should_describe_keyframes(clean_text)
            print(f"[keyframe-gate] 视频 {index} need_visual={need_visual}；{reason}")
            try:
                if need_visual:
                    keyframes = _describe_frames_parallel(deduped_frames)
                else:
                    print(f"[keyframe] 视频 {index} 闸门跳过视觉解读，丢弃 {len(deduped_frames)} 帧")
            finally:
                for frame in deduped_frames:
                    remove_file_quietly(frame.get("path"))
    finally:
        for path in media.get("cleanup_paths") or []:
            remove_file_quietly(path)

    return {
        "id": index,
        "author": media["author"],
        "title": media["title"],
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


def search_evidence_for_claim(claim: str, topic: str = "", top_k: int = 5) -> tuple[list[dict], str, str]:
    topic = topic.strip()
    if topic:
        hits = evidence_store.search(claim, topic=topic, top_k=top_k)
        if hits:
            return hits, "matched", "结论"
    hits = evidence_store.search(claim, topic="", top_k=top_k)
    if hits:
        return hits, "matched", "结论"

    if topic:
        chunk_hits = evidence_store.search_fulltext(claim, topic=topic, top_k=top_k)
        if chunk_hits:
            return chunk_hits, "matched", "全文"
    chunk_hits = evidence_store.search_fulltext(claim, topic="", top_k=top_k)
    if chunk_hits:
        return chunk_hits, "matched", "全文"
    return [], "not_found", "无"


def evidence_prompt_block(evidence: list[dict]) -> str:
    if not evidence:
        return "未命中已收录权威依据。以下只能作为 AI 常识判断，必须明确标注这一点，并把 strength/依据强度降为低。"
    lines = []
    for item in evidence:
        is_fulltext = item.get("evidence_tier") == "全文" or str(item.get("id", "")).startswith("F-")
        claim_label = "原文段落" if is_fulltext else "结论"
        strength_label = item.get("strength", "")
        lines.append(
            "\n".join([
                f"证据ID：{item.get('id', '')}",
                f"{claim_label}：{item.get('claim', '')}",
                f"章节：{item.get('section', '')}",
                f"强度：{strength_label}",
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
3. 如果证据ID以 F- 开头，它来自指南全文原文段落，不是已抽取结论；可以引用，但 strength/confidence 不要高于“中”，除非原文段落非常直接。
4. 不得编造指南、论文、年份、DOI 或 URL。证据不足就说证据不足。
5. 如果未命中已收录权威依据，correction 必须包含“未命中已收录权威依据，以下为AI常识判断”，并把 strength 设为“低”。
6. 只输出 JSON，不输出解释。

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
    evidence, evidence_status, evidence_tier = search_evidence_for_claim(claim, topic=topic, top_k=top_k)
    prompt = build_verify_prompt(claim, topic, evidence, video_refs=video_refs)
    raw = llm_chat(prompt, max_tokens=8192, json_mode=True, model=DEEPSEEK_REASONING_MODEL)
    data = parse_verify_result(raw, evidence)
    if evidence_status == "not_found":
        data["strength"] = "低"
        data["cited_evidence_ids"] = []
    elif evidence_tier == "全文" and str(data.get("strength", "")) == "高":
        data["strength"] = "中"
    data.update({
        "claim": claim,
        "topic": topic,
        "video_refs": video_refs or [],
        "evidence_status": evidence_status,
        "evidence_tier": evidence_tier,
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
