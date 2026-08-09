import os
import re
import json
import asyncio
import base64
import tempfile
import subprocess
import traceback
import time
from datetime import datetime, timezone
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from openai import OpenAI

try:
    import evidence_store
except ImportError:
    from backend import evidence_store

try:
    from content_router import (
        ContentRoutingError,
        build_content_route_prompt,
        metadata_precheck,
        normalize_content_route,
    )
except ImportError:
    from backend.content_router import (
        ContentRoutingError,
        build_content_route_prompt,
        metadata_precheck,
        normalize_content_route,
    )

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
# VL 解读是网络请求，并发越高越快 —— 这个值只给 _describe_frames_parallel 用。
KEYFRAME_WORKERS = int(os.getenv("KEYFRAME_WORKERS", "16"))
# 抽帧是本地 CPU/磁盘活，和 VL 相反：并发高了 ffmpeg 互相抢资源、集体超时被丢帧。
# 实测同一条 76s 视频抽 10 帧：并发10 只活 1 帧(5.2s)，并发3 全活(3.9s)，串行全活(5.5s)。
KEYFRAME_GRAB_WORKERS = int(os.getenv("KEYFRAME_GRAB_WORKERS", "3"))
# 超时只在异常时起作用，给足余量；太小会让慢机器静默丢帧（正常一帧约 0.5s）。
KEYFRAME_FFMPEG_TIMEOUT = int(os.getenv("KEYFRAME_FFMPEG_TIMEOUT", "20"))
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

# 知识库目录接口独立在 knowledge.py，这里只挂载
from knowledge import router as knowledge_router  # noqa: E402
from contrib import router as contrib_router  # noqa: E402

app.include_router(knowledge_router)
app.include_router(contrib_router)


@app.on_event("startup")
def warm_evidence_embedding_model() -> None:
    try:
        evidence_store.search("预热", top_k=1)
        print("[startup] 证据库 embedding 预热完成")
    except Exception as e:
        print(f"[startup] 证据库 embedding 预热失败: {e}")


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


class BuildSingleActionsRequest(BaseModel):
    reference: dict = Field(default_factory=dict)
    topic: str = ""
    claims: list[dict] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: str
    content: str


class FollowupRequest(BaseModel):
    analysis: dict
    question: str
    history: list[ChatMessage] = []


class FollowupSingleRequest(BaseModel):
    reference: dict = Field(default_factory=dict)
    topic: str = ""
    claims: list[dict] = Field(default_factory=list)
    question: str
    history: list[ChatMessage] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Video extraction helpers
# ---------------------------------------------------------------------------
def resolve_url(link: str) -> str:
    match = re.search(r"https?://[^\s]+", link or "")
    if match:
        link = match.group(0)
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
    author_data = detail.get("author") or {}
    author = author_data.get("nickname") or "作者未标注"
    avatar_urls = (author_data.get("avatar_thumb") or {}).get("url_list") or []
    author_avatar_url = next((url for url in avatar_urls if isinstance(url, str) and url.startswith(("http://", "https://"))), None)
    audio_url = detail["music"]["play_url"]["uri"]
    video_obj = detail.get("video", {}) or {}
    video_urls = (video_obj.get("play_addr", {}) or {}).get("url_list") or []
    video_url = video_urls[0] if video_urls else None
    # 抖音详情自带封面图 URL：优先用它做卡1封面，就不必下载整段视频再抽帧
    cover_url = None
    for cover_key in ("origin_cover", "cover", "dynamic_cover"):
        cover_list = (video_obj.get(cover_key) or {}).get("url_list") or []
        cover_url = next((u for u in cover_list if isinstance(u, str) and u.startswith(("http://", "https://"))), None)
        if cover_url:
            break
    duration_raw = (
        detail.get("duration")
        or (detail.get("video", {}) or {}).get("duration")
        or (detail.get("video", {}) or {}).get("duration_ms")
    )
    duration = None
    if isinstance(duration_raw, (int, float)) and duration_raw > 0:
        duration = float(duration_raw) / 1000 if duration_raw > 1000 else float(duration_raw)
    published_at = None
    try:
        created_at = float(detail.get("create_time"))
        if created_at > 0:
            published_at = datetime.fromtimestamp(created_at, tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError, OverflowError):
        pass
    return {
        "title": title,
        "author": author,
        "author_avatar_url": author_avatar_url,
        "audio_url": audio_url,
        "video_url": video_url,
        "cover_url": cover_url,
        "duration": duration,
        "published_at": published_at,
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


def extract_audio_from_video(video_path: str) -> str:
    """用 ffmpeg 从本地视频抽出单声道音频，供 ASR 使用。返回临时音频路径。"""
    fd, audio_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn",
        "-ar", str(DASHSCOPE_ASR_SAMPLE_RATE),
        "-ac", "1",
        audio_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=180)
    except subprocess.TimeoutExpired as exc:
        remove_file_quietly(audio_path)
        raise RuntimeError("从上传视频提取音频超时") from exc
    if proc.returncode != 0:
        lines = (proc.stderr or b"").decode("utf-8", "replace").strip().splitlines()
        reason = lines[-1].strip() if lines else f"ffmpeg 退出码 {proc.returncode}"
        remove_file_quietly(audio_path)
        raise RuntimeError(f"从上传视频提取音频失败: {reason[:200]}")
    return audio_path


def probe_video_duration(video_path: str) -> float | None:
    """用 ffprobe 读取视频时长（秒）。失败返回 None，不阻断主流程。"""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", video_path],
            capture_output=True, timeout=30,
        )
        val = (out.stdout or b"").decode("utf-8", "replace").strip()
        return float(val) if val else None
    except Exception:
        return None


def fetch_media_upload(video_path: str, title: str | None = None) -> dict:
    """本地上传获取层：把已落盘的视频文件包装成与 TikHub 同结构的 media dict。
    下游 transcribe()/grab_frame() 本就支持本地路径，故管线其余部分零改动。"""
    audio_path = extract_audio_from_video(video_path)
    return {
        "author": "本地上传",
        "author_avatar_url": None,
        "title": (title or os.path.basename(video_path) or "本地视频").strip(),
        "url": "",
        "audio_path": audio_path,
        "video_path": video_path,
        "duration": probe_video_duration(video_path),
        "published_at": None,
        "source": "upload",
        # 音频是临时抽取的，视频是上传落盘的，用完都交给上层 finally 清理
        "cleanup_paths": [audio_path, video_path],
    }


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


def build_media_timeline(segments: list[dict] | None, keyframes: list[dict] | None) -> str:
    """将口播与画面文字按时间交错渲染为统一时间线。"""
    events = []
    for segment in segments or []:
        text = str(segment.get("text") or "").strip()
        start = segment.get("start")
        if not text or not isinstance(start, (int, float)):
            continue
        events.append((float(start), 0, f"[{fmt_time(start)}] 口播：{text}"))
    for keyframe in keyframes or []:
        text = str(keyframe.get("screen_text") or "").strip()
        timestamp = keyframe.get("time")
        if not text or not isinstance(timestamp, (int, float)):
            continue
        events.append((float(timestamp), 1, f"[{fmt_time(timestamp)}] 画面：{text}"))
    events.sort(key=lambda event: (event[0], event[1]))
    return "\n".join(event[2] for event in events)


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
            proc = subprocess.run(cmd, capture_output=True, timeout=ffmpeg_timeout)
            if proc.returncode != 0:
                # 以前这里不看 returncode/stderr，抽帧全失败也只打一行没信息的日志，
                # 导致画面线整条静默失效很久没被发现。
                lines = (proc.stderr or b"").decode("utf-8", "replace").strip().splitlines()
                reason = lines[-1].strip() if lines else f"ffmpeg 退出码 {proc.returncode}"
                print(f"[keyframe] 抽帧失败 t={t} (第{attempt + 1}次): {reason[:160]}")
        except subprocess.TimeoutExpired:
            remove_file_quietly(path)
            print(
                f"[keyframe] 抽帧超时 t={t} (第{attempt + 1}次)：ffmpeg 超过 {ffmpeg_timeout}s 未返回。"
                f"并发过高会让 ffmpeg 互相抢资源集体超时，见 KEYFRAME_GRAB_WORKERS"
            )
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
    workers = min(KEYFRAME_GRAB_WORKERS, max(1, len(picks)))

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


def encode_frame_image(path: str) -> str | None:
    try:
        import io
        from PIL import Image

        with Image.open(path) as source:
            image = source.convert("RGB")
            if image.width > 480:
                height = max(1, round(image.height * 480 / image.width))
                image = image.resize((480, height), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=55, optimize=True)
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"
    except Exception as e:
        print(f"[keyframe] 图片压缩编码失败，保留文字结果: {str(e)[:160]}")
        return None


def _poster_only_keyframe(frames: list[dict]) -> list[dict]:
    """不做视觉解读时，仍留一帧中间帧当封面图（零 API 成本，不含画面描述）。"""
    if not frames:
        return []
    frame = frames[len(frames) // 2]
    image = encode_frame_image(frame["path"])
    if not image:
        return []
    return [{"time": frame["time"], "image": image, "screen_text": ""}]


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
        result = {"time": frame["time"], "screen_text": text}
        image = encode_frame_image(frame["path"])
        if image:
            result["image"] = image
        return result

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


def route_video_content(
    media: dict,
    clean_text: str,
    keyframes: list[dict] | None = None,
) -> dict:
    """Route a video using grounded title, transcript, and optional visual evidence."""
    prompt = build_content_route_prompt(media, clean_text, keyframes)
    raw = llm_chat(prompt, max_tokens=512, json_mode=True, model=DEEPSEEK_FAST_MODEL)
    data = parse_json_loose(raw)
    source_text = "\n".join(
        [
            str(media.get("title") or ""),
            str(media.get("description") or ""),
            clean_text,
            *[str(item.get("screen_text") or "") for item in (keyframes or [])],
        ]
    )
    return normalize_content_route(data, source_text)


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


def extract_one_video(index: int, link: str, media: dict | None = None) -> dict:
    """同步阻塞流程，外层用 asyncio.to_thread 包裹。返回视频文本结构。
    传入 media 时跳过链接获取层（供本地上传等已备好媒体的场景复用同一条管线）。"""
    if media is None:
        full_url = resolve_url(link)
        media = fetch_media(link)
    else:
        full_url = media.get("url") or link or ""

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

    def grab_and_sample() -> list[dict]:
        """下载/定位视频并抽帧去重。仅在确实需要画面（视觉解读，或无现成封面兜底）时才调。"""
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
            print(f"[keyframe] 视频 {index} 抽帧流程失败: {e}")
            return []
        finally:
            if temp_video_path:
                remove_file_quietly(temp_video_path)

    def build_keyframes(need_visual: bool) -> list[dict]:
        if not ENABLE_KEYFRAMES:
            return []

        # 只要封面、且 TikHub 有现成封面：直接用其 URL，零下载零抽帧（最快路径）
        if not need_visual and media.get("cover_url"):
            print(f"[keyframe] 视频 {index} 用现成封面 URL，跳过视频下载与抽帧")
            return [{"time": 0, "image": media["cover_url"], "screen_text": ""}]

        # 需要视觉解读，或无现成封面需回退抽帧：才下载/抽帧
        deduped_frames = grab_and_sample()
        if not deduped_frames:
            return []
        try:
            if need_visual:
                return _describe_frames_parallel(deduped_frames)
            kf = _poster_only_keyframe(deduped_frames)
            print(f"[keyframe] 视频 {index} 无现成封面，抽一帧兜底做封面（不解读），保留 {len(kf)} 帧")
            return kf
        finally:
            for frame in deduped_frames:
                remove_file_quietly(frame.get("path"))

    clean_text = ""
    segments: list[dict] = []
    raw_text = ""
    keyframes: list[dict] = []
    content_route: dict | None = None
    try:
        content_route = metadata_precheck(media)
        if content_route is None:
            clean_text, segments, raw_text = run_audio_line()
            content_route = route_video_content(media, clean_text)
            if content_route["decision"] == "inspect_visual":
                keyframes = build_keyframes(True)
                if not keyframes:
                    raise ContentRoutingError("内容路由需要画面，但未能提取有效画面")
                content_route = route_video_content(media, clean_text, keyframes)
                if content_route["decision"] == "inspect_visual":
                    raise ContentRoutingError("查看画面后仍无法判断内容范围")
            elif content_route["decision"] == "continue":
                keyframes = build_keyframes(False)
        print(
            f"[content-route] 视频 {index} scope={content_route['scope']} "
            f"decision={content_route['decision']}；{content_route['reason']}"
        )
    finally:
        for path in media.get("cleanup_paths") or []:
            remove_file_quietly(path)

    return {
        "id": index,
        "author": media["author"],
        "author_avatar_url": media.get("author_avatar_url"),
        "title": media["title"],
        "url": full_url,
        "clean_text": clean_text,
        "segments": segments,
        "keyframes": keyframes,
        "duration_seconds": media.get("duration"),
        "published_at": media.get("published_at"),
        "content_route": content_route,
    }


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
ANALYSIS_FIELDS = ["one_line_summary", "consensus", "conflicts", "recommendations", "references"]


def build_analysis_prompt(topic: str, videos: list[dict]) -> str:
    blocks = []
    for v in videos:
        timeline = build_media_timeline(v.get("segments"), v.get("keyframes"))
        block = (
            f"视频{v['id']}（{v['author']}，标题：{v['title']}）\n"
            f"整体内容：{v['clean_text']}\n"
            f"按时间轴交错的转写与画面（画面是音频未必读出的补充，请一并参考；用于标注出处时间 time）：\n{timeline}"
        )
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
N. recommendations 中的 steps 是这条建议的具体操作步骤，必须按实际时间或操作先后顺序排列，最多 3 条；每条 text 只写动作核心（≤8字），不要写成完整句子。正确示例："先补水" / "40分钟慢跑" / "运动后进食"；错误示例："起床后喝一杯水或黑咖啡"。如果一条建议超过 3 步，合并成最关键的 3 步；不足以支撑步骤时输出空数组 []，绝对不要为了填满而编造。steps 的每项必须给 icon，且 icon 只能从下列标签中选择，务必挑与该步骤动作最贴切的那个，不要一律填 general：water（喝水）、food（进食）、fruit（水果/加餐）、pill（服药）、run（跑步）、walk（快走）、bike（骑行）、stretch（拉伸）、rest（休息）、sleep（睡觉）、time（计时/控制时长）、measure（测量监测）、carry（随身携带）、check（检查/咨询医生）、shower（洗澡/冲洗）、hairdryer（吹干/保持干燥）、tub（泡澡）、bandage（护理伤口/包扎）、thermometer（测体温）、hospital（就医）、doctor（咨询医生）、home（居家）、stop（避免/停止某行为）、general（实在无对应时才用）。icon 表示这一步在做什么，尽量精确匹配动作语义。
N+1. recommendations 中的 methods 是这条建议**推荐的具体做法/方式**，每项必须为 {{"text": "方式名称", "icon": "动作标签"}}，每条 text 2~6 字（如"快走"、"慢跑"、"血糖监测"），icon 必须复用上面的 STEP_ICONS 白名单。只有当话题本身存在可选做法时才填；像"要不要吃某种食物"这类没有"方式"可言的话题，一律输出空数组 []。
N+2. recommendations 中的 tier 表示这条建议对该人群的适用程度，**只能二选一**：
   - "适用参考"：该人群按此执行风险低，属于常规可参考的做法。
   - "谨慎理解"：该人群存在健康风险、需先咨询专业人员、或证据不足以放心推荐。
   有慢病、孕产、儿童、用药等风险因素的人群建议，通常应为"谨慎理解"。拿不准时填"谨慎理解"。

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
      "steps": [{{"text": "按先后排列的动作核心（≤8字）", "icon": "water"}}],
      "methods": [{{"text": "推荐方式（2~6字）", "icon": "walk"}}],
      "tier": "适用参考 或 谨慎理解",
      "cautions": ["需要注意的边界条件或身体反应，每条不超过20字"],
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


# 建议的适用分档。前端用它决定卡片配色，取值必须受约束，不能让模型自由发挥。
RECOMMENDATION_TIERS = {"适用参考", "谨慎理解"}
STEP_ICONS = {
    "water", "food", "fruit", "pill", "run", "walk", "bike", "stretch",
    "rest", "sleep", "time", "measure", "carry", "check", "general",
}
SINGLE_ACTION_LEVELS = {"normal", "caution", "urgent"}
# 图标校验集 = 提示词活动词表(STEP_ICONS) ∪ 生活场景词表。二者取并集，
# 避免模型选了合法图标却因不在小子集里被打回 general（图标全变"通用"的根因）。
SINGLE_ACTION_ICONS = STEP_ICONS | {
    "home", "shower", "hairdryer", "bandage", "tub", "doctor",
    "stop", "thermometer", "hospital", "elliptical", "firstAid",
    "glucose", "jog", "snack", "toast",
}


def normalize_recommendations(items: Any) -> list[dict]:
    """Keep model-provided recommendation structure safe without deriving new content."""
    if not isinstance(items, list):
        return []

    def clean_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [text for text in (str(item).strip() for item in value) if text][:4]

    def clean_steps(value: Any, limit: int = 3) -> list[dict[str, str]]:
        """Accept legacy strings while keeping new step icons in a safe whitelist."""
        if not isinstance(value, list):
            return []
        cleaned: list[dict[str, str]] = []
        for item in value:
            if isinstance(item, str):
                text = item.strip()
                icon = "general"
            elif isinstance(item, dict):
                text = str(item.get("text") or "").strip()
                icon = str(item.get("icon") or "").strip()
                if icon not in STEP_ICONS:
                    icon = "general"
            else:
                continue
            if text:
                cleaned.append({"text": text, "icon": icon})
            if len(cleaned) == limit:
                break
        return cleaned

    normalized: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        copy = dict(item)
        copy["steps"] = clean_steps(item.get("steps"))
        copy["methods"] = clean_steps(item.get("methods"), limit=4)
        copy["cautions"] = clean_list(item.get("cautions"))
        # tier 决定卡片配色，必须是受约束取值。模型给了别的词就回落到更保守的一档，
        # 宁可显示「谨慎理解」，也不要把有风险的人群标成「适用参考」。
        tier = str(item.get("tier") or "").strip()
        copy["tier"] = tier if tier in RECOMMENDATION_TIERS else "谨慎理解"
        normalized.append(copy)
    return normalized


def normalize_single_actions(items: Any) -> list[dict]:
    """Normalize model-provided single-video actions without deriving content."""
    if not isinstance(items, list):
        return []
    normalized: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        condition = str(item.get("condition") or "").strip()
        if not condition:
            continue
        steps: list[dict[str, str]] = []
        raw_steps = item.get("steps")
        if isinstance(raw_steps, list):
            for raw_step in raw_steps:
                if not isinstance(raw_step, dict):
                    continue
                title = str(raw_step.get("title") or "").strip()
                if not title:
                    continue
                icon = str(raw_step.get("icon") or "").strip()
                steps.append({
                    "title": title,
                    "note": str(raw_step.get("note") or "").strip(),
                    "icon": icon if icon in SINGLE_ACTION_ICONS else "general",
                })
                if len(steps) == 3:
                    break
        claim_indices = []
        for value in item.get("claim_indices") if isinstance(item.get("claim_indices"), list) else []:
            if isinstance(value, int) and value >= 0:
                claim_indices.append(value)
        if not claim_indices:
            continue
        evidence_ids = [str(value).strip() for value in item.get("evidence_ids") if str(value).strip()] if isinstance(item.get("evidence_ids"), list) else []
        level = str(item.get("level") or "").strip()
        normalized.append({
            "level": level if level in SINGLE_ACTION_LEVELS else "caution",
            "condition": condition,
            "steps": steps,
            "caution": str(item.get("caution") or "").strip(),
            "claim_indices": claim_indices,
            "evidence_ids": evidence_ids,
        })
        if len(normalized) == 3:
            break
    return normalized


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

    data["recommendations"] = normalize_recommendations(data.get("recommendations"))

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
# 说法配图的语义标签白名单。前端拿这个词查 public/claim-icons/{icon}.webp。
# 模型只需从这里选一个「这条说法在讲什么东西」，不在白名单内一律回落 general。
# 只表示名词主体，不含好坏判断（判断由 signal 和核验负责）。
CLAIM_ICONS = {
    # 食物饮品
    "egg", "milk", "meat", "veggie", "grain", "oil-salt-sugar", "water", "tea-coffee", "alcohol",
    # 医疗健康
    "pill", "vaccine", "lab-report", "blood-pressure", "blood-sugar", "heart", "supplement",
    # 人群
    "pregnancy", "baby", "elderly", "cancer",
    # 身体部位
    "skin", "hair", "eye", "teeth", "stomach", "bone-joint",
    # 症状不适
    "headache", "fever-cold", "pain", "immunity", "mood",
    # 生活行为
    "exercise", "sleep", "weight", "bath",
    # 兜底
    "general",
}
VERIFY_FIELDS = ["verdict", "risk_level", "confidence", "strength", "correction", "cited_evidence_ids"]
CLAIM_ORIGIN_TYPES = {
    "traditional",
    "outdated_science",
    "concept_confusion",
    "overgeneralized",
    "commercial",
}
CLAIM_ORIGIN_FORBIDDEN_PATTERN = re.compile(
    r"[0-9０-９]|doi|https?://|《|》|研究|论文|机构|协会|委员会|大学|医院|研究所",
    re.IGNORECASE,
)


def video_to_claim_prompt(topic: str, video: dict) -> str:
    timeline = build_media_timeline(video.get("segments"), video.get("keyframes")) or "  无可用时间线内容"
    return f"""你是 FitProof 的健康短视频信息拆解助手。请从单条视频中拆出 3~5 条「可核验主张」。
较公认的说法也要列出，不能只挑刺；目标是让用户选择自己最想核验的一条。

【话题】
{topic or "健康信息"}

【视频信息】
作者：{video.get('author', '')}
标题：{video.get('title', '')}
整体转写：{video.get('clean_text', '')}

【按时间轴交错的转写与画面】
（画面是音频未必读出的补充，请一并参考）
{timeline}

要求：
1. 每条 claim 尽量保留视频原话或接近原话，不要改写成学术结论。
2. video_refs 标出该主张来自视频1的大致时间，格式 {{"id":1,"time":"0:12"}}。
3. signal 只能从 ["疑似夸大","有条件","较公认","有争议"] 中选择。
4. why 用一句话说明为什么值得核验。
5. icon 表示「这条说法主要在讲什么东西」，只能从下面清单里选一个，拿不准就填 general：
   egg(蛋) milk(奶) meat(肉禽鱼) veggie(蔬菜水果) grain(米面主食) oil-salt-sugar(油盐糖)
   water(水/饮料) tea-coffee(茶/咖啡) alcohol(酒) pill(药丸/吃药) vaccine(打针/疫苗)
   lab-report(化验单/指标报告) blood-pressure(血压) blood-sugar(血糖) heart(心脏/心血管)
   supplement(保健品/补剂) pregnancy(孕产) baby(婴幼儿) elderly(中老年) cancer(癌症/肿瘤)
   skin(皮肤/美白祛痘) hair(头发/脱发) eye(眼睛/视力) teeth(牙齿/口腔)
   stomach(肠胃/消化) bone-joint(骨骼/关节) headache(头痛) fever-cold(感冒/发烧)
   pain(疼痛/酸痛) immunity(免疫力/抵抗力) mood(情绪/压力/焦虑)
   exercise(运动/健身) sleep(睡眠) weight(体重/减肥) bath(洗澡/洗头/清洁)
   general(其它/通用)
   icon 只表示话题对象，不代表好坏。
6. 只输出 JSON，不输出解释。

JSON 格式：
{{"claims":[
  {{"claim":"主张原话","video_refs":[{{"id":1,"time":"0:12"}}],"signal":"较公认","icon":"egg","why":"为什么值得核验"}}
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
        # 白名单校验：模型迟早会自创一个词，不在清单内一律回落 general
        icon = str(item.get("icon") or "").strip().lower()
        if icon not in CLAIM_ICONS:
            icon = "general"
        normalized.append({
            "claim": claim,
            "video_refs": good_refs,
            "signal": signal,
            "icon": icon,
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
        "author_avatar_url": video.get("author_avatar_url"),
        "title": video.get("title", ""),
        "url": video.get("url", ""),
        "duration_seconds": video.get("duration_seconds"),
        "published_at": video.get("published_at"),
    }
    return {
        "reference": reference,
        "claims": claims,
        "keyframes": video.get("keyframes") or [],
    }


def search_evidence_for_claim(claim: str, topic: str = "", top_k: int = 5, on_event=None) -> tuple[list[dict], str, str, list[dict]]:
    topic = topic.strip()
    trace: list[dict] = []

    def retrieve(step: str, label: str, search_fn, search_topic: str) -> list[dict]:
        started = time.perf_counter()
        hits = search_fn(claim, topic=search_topic, top_k=top_k)
        event = {
            "step": step,
            "label": label,
            "hit_count": len(hits),
            "ms": round((time.perf_counter() - started) * 1000, 2),
            "tone": "ok" if hits else "miss",
        }
        trace.append(event)
        if on_event:
            on_event(event)
        return hits

    def stop_after_hit(tier: str) -> None:
        event = {
            "step": "retrieval_stop",
            "label": f"{tier}库命中，无需继续向下检索",
            "tone": "ok",
        }
        trace.append(event)
        if on_event:
            on_event(event)

    if topic:
        hits = retrieve("retrieve_conclusion_topic", "检索话题内结论库", evidence_store.search, topic)
        if hits:
            stop_after_hit("结论")
            return hits, "matched", "结论", trace
    hits = retrieve("retrieve_conclusion_all", "检索全库结论", evidence_store.search, "")
    if hits:
        stop_after_hit("结论")
        return hits, "matched", "结论", trace

    if topic:
        chunk_hits = retrieve("retrieve_fulltext_topic", "检索话题内全文块", evidence_store.search_fulltext, topic)
        if chunk_hits:
            stop_after_hit("全文")
            return chunk_hits, "matched", "全文", trace
    chunk_hits = retrieve("retrieve_fulltext_all", "检索全库全文块", evidence_store.search_fulltext, "")
    if chunk_hits:
        stop_after_hit("全文")
        return chunk_hits, "matched", "全文", trace
    return [], "not_found", "无", trace


def evidence_source_names(evidence: list[dict]) -> list[str]:
    """命中文献的展示名列表（去重、保序）："机构《文献名》"。用于前端胶囊逐条显示。"""
    names: list[str] = []
    seen: set[tuple[str, str]] = set()
    for item in evidence:
        source_doc = str(item.get("source_doc") or "").strip()
        if not source_doc:
            continue
        org = str(item.get("org") or "").strip()
        key = (org, source_doc)
        if key in seen:
            continue
        seen.add(key)
        quoted_doc = source_doc if source_doc.startswith("《") and source_doc.endswith("》") else f"《{source_doc}》"
        names.append(f"{org}{quoted_doc}" if org else quoted_doc)
    return names


def format_evidence_summary_label(evidence: list[dict]) -> str:
    if not evidence:
        return "未命中已收录权威依据"
    documents = evidence_source_names(evidence)
    if not documents:
        return f"检索到 {len(evidence)} 条相关依据，未提供可展示的文献名"
    # 用「检索到」而非「命中」：这是相似检索找到的候选，是否采信由模型研判。
    # 避免与下游「证据不足/未命中权威依据」的诊断措辞自相矛盾。
    return f"检索到 {len(documents)} 篇相关文献"


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


def should_generate_claim_origin(result: dict) -> bool:
    verdict = str(result.get("verdict") or "").strip()
    risk_level = str(result.get("risk_level") or "").strip()
    if risk_level == "高":
        return True
    return any(keyword in verdict for keyword in ("不建议", "不可信", "夸大", "误导", "证据不足"))


def parse_claim_origin(data: Any) -> dict | None:
    if not isinstance(data, dict):
        return None
    origin_type = str(data.get("type") or "").strip()
    explanation = str(data.get("explanation") or "").strip()
    if origin_type not in CLAIM_ORIGIN_TYPES or not explanation or len(explanation) > 80:
        return None
    if CLAIM_ORIGIN_FORBIDDEN_PATTERN.search(explanation):
        return None
    return {"type": origin_type, "explanation": explanation}


def generate_claim_origin(claim: str, verdict: str, correction: str) -> dict | None:
    prompt = f"""你是健康短视频谬误的说法溯源助手。仅从一般常识角度，解释一个不准确说法可能为何流传；这不是权威依据，不能当作事实或引用。

【待解释说法】
{claim}

【核验判定】
{verdict}

【更准确的说法】
{correction}

只能在有把握时输出一个可能成因；没把握时必须输出空字符串。
type 只能从以下五项中选择：traditional、outdated_science、concept_confusion、overgeneralized、commercial。
explanation 必须不超过60个汉字，只解释可能的传播机制，不陈述未经证实的历史事实。

最重要：严禁输出任何年份、日期、数字、研究名称、机构名、论文标题、DOI、URL、书名号或引用标记。不要提及任何研究、论文、机构或具体史实。违反任一项时，宁可输出空字符串。
再次强调：本段不是权威依据；不得伪造来源，不得使用看似可核验的细节。

只输出 JSON：
{{"type":"五选一或空字符串","explanation":"不超过60字，没把握则空字符串"}}"""
    # 校验偏严(禁数字/研究名/机构)，模型偶尔一次踩线被拒 → 重试一次再放弃，减少「有的卡没溯源」
    for attempt in range(2):
        try:
            raw = llm_chat(prompt, max_tokens=8192, json_mode=True, model=DEEPSEEK_FAST_MODEL)
            parsed = parse_claim_origin(parse_json_loose(raw))
            if parsed:
                return parsed
        except Exception as e:
            print(f"[claim-origin] 第{attempt + 1}次生成失败: {str(e)[:160]}")
    return None


def verify_single_claim(
    claim: str,
    topic: str = "",
    video_refs: list[dict] | None = None,
    top_k: int = 5,
    on_event=None,
    include_claim_origin: bool = True,
) -> dict:
    evidence, evidence_status, evidence_tier, trace = search_evidence_for_claim(claim, topic=topic, top_k=top_k, on_event=on_event)
    entries, _ = evidence_store.get_store()._ensure_index()
    # 文献和机构数必须与 /api/knowledge 同源，不能从向量条目的 source_doc 猜测：
    # 同一份文献可能没有可检索结论，或以不同标题进入条目库。
    from knowledge import load_library
    library_stats = load_library()["stats"]
    scale_event = {
        "step": "evidence_library_scale",
        "label": f"当前证据库：{len(entries)} 条依据，{library_stats['docs']} 份文献、{library_stats['orgs']} 家机构",
        "tone": "ok",
    }
    trace.append(scale_event)
    if on_event:
        on_event(scale_event)
    prompt = build_verify_prompt(claim, topic, evidence, video_refs=video_refs)
    model_started = time.perf_counter()
    if on_event:
        on_event({"step": "reasoning_model_start", "label": f"调用推理模型：{DEEPSEEK_REASONING_MODEL}", "tone": "ok"})
    raw = llm_chat(prompt, max_tokens=8192, json_mode=True, model=DEEPSEEK_REASONING_MODEL)
    model_event = {
        "step": "reasoning_model",
        "label": f"调用推理模型：{DEEPSEEK_REASONING_MODEL}",
        "ms": round((time.perf_counter() - model_started) * 1000, 2),
        "tone": "ok",
    }
    trace.append(model_event)
    if on_event:
        on_event(model_event)
    data = parse_verify_result(raw, evidence)
    claim_origin = None
    if include_claim_origin and should_generate_claim_origin(data):
        claim_origin = generate_claim_origin(claim, str(data.get("verdict") or ""), str(data.get("correction") or ""))
    summary_event = {
        "step": "evidence_summary",
        "label": format_evidence_summary_label(evidence),
        "tone": "ok" if evidence else "miss",
        "sources": evidence_source_names(evidence),
    }
    trace.append(summary_event)
    if on_event:
        on_event(summary_event)
    if evidence_status == "not_found":
        data["strength"] = "低"
        data["cited_evidence_ids"] = []
        downgrade_event = {"step": "downgrade_common_sense", "label": "库中未收录相关权威依据，转为 AI 常识判断", "tone": "warn"}
        trace.append(downgrade_event)
        if on_event:
            on_event(downgrade_event)
    elif evidence_tier == "全文" and str(data.get("strength", "")) == "高":
        data["strength"] = "中"
        downgrade_event = {"step": "downgrade_tier", "label": "仅命中原文段落，依据强度由高降为中", "tone": "warn"}
        trace.append(downgrade_event)
        if on_event:
            on_event(downgrade_event)
    data.update({
        "claim": claim,
        "topic": topic,
        "video_refs": video_refs or [],
        "evidence_status": evidence_status,
        "evidence_tier": evidence_tier,
        "evidence": evidence,
        "trace": trace,
        "claim_origin": claim_origin,
    })
    return data


def build_single_actions_prompt(req: BuildSingleActionsRequest, verified_claims: list[dict]) -> str:
    """Ask for actions only from already-verified material supplied by the caller."""
    return f"""你是 FitProof 健康信息核验助手。请只根据下面“已完成核验”的内容，生成用户可执行的行动建议。

【视频信息】
{json.dumps(req.reference, ensure_ascii=False)}

【话题】
{req.topic or "健康信息"}

【已完成核验】
{json.dumps(verified_claims, ensure_ascii=False)}

严格规则：
1. 只能使用上方已完成核验的 claim、correction、风险等级与证据；不得使用未核验内容，不得补充猜测性医疗建议。
2. 证据不足、说法之间无法形成具体行动建议时，输出空数组 []；宁可少，不可编。
3. 每条建议必须列出它依据的 claim_indices，索引必须来自上方数据；没有依据索引的建议不得输出。
4. level 只能是 normal（常规可参考）、caution（需要谨慎）、urgent（应停止/就医等高风险提醒）之一。
5. steps 最多 3 条，按先后顺序；每项 title 不超过 10 个字，note 不超过 10 个字。icon 仅表示动作，不表示风险等级，务必选择语义最贴近的图标，不要一律使用 general。icon 只能从以下标签选择：home（居家）、shower（洗澡/冲洗）、hairdryer（吹干/保持干燥）、bandage（护理伤口/包扎）、tub（泡澡）、doctor（咨询医生）、stop（避免/停止）、thermometer（测体温）、hospital（就医）、water（喝水）、food（正餐/进食）、fruit（水果）、pill（服药）、run（跑步）、walk（步行/快走）、bike（骑行）、stretch（拉伸）、rest（休息）、sleep（睡觉）、time（计时/控制时长）、measure（一般测量）、carry（随身携带）、check（检查/核对）、elliptical（椭圆机）、firstAid（急救处理）、glucose（测血糖）、jog（慢跑）、snack（加餐）、toast（面包/吐司）、general（实在无对应图标时才用）。
6. caution 仅写一条最重要边界或身体反应；没有则为空字符串。
7. evidence_ids 只能填写上方已完成核验中已有的证据 ID；没有则为空数组。

只输出 JSON：
{{
  "actions": [
    {{
      "level": "normal",
      "condition": "适合谁/什么情境",
      "steps": [{{"title":"动作","note":"补充说明","icon":"general"}}],
      "caution": "需要注意的边界",
      "claim_indices": [0],
      "evidence_ids": ["E1"]
    }}
  ]
}}"""


def generate_single_actions(req: BuildSingleActionsRequest) -> list[dict]:
    verified_claims: list[dict] = []
    for index, item in enumerate(req.claims):
        if not isinstance(item, dict):
            continue
        correction = str(item.get("correction") or "").strip()
        claim = str(item.get("claim") or "").strip()
        if not claim or not correction:
            continue
        source_index = item.get("claim_index")
        source_index = source_index if isinstance(source_index, int) and source_index >= 0 else index
        verified_claims.append({
            "index": source_index,
            "claim": claim,
            "verdict": str(item.get("verdict") or "").strip(),
            "risk_level": str(item.get("risk_level") or "").strip(),
            "correction": correction,
            "video_refs": item.get("video_refs") if isinstance(item.get("video_refs"), list) else [],
            "cited_evidence_ids": item.get("cited_evidence_ids") if isinstance(item.get("cited_evidence_ids"), list) else [],
        })
    if not verified_claims:
        return []
    raw = llm_chat(build_single_actions_prompt(req, verified_claims), max_tokens=4096, json_mode=True, model=DEEPSEEK_REASONING_MODEL)
    data = parse_json_loose(raw) or {}
    actions = normalize_single_actions(data.get("actions"))
    allowed_indices = {item["index"] for item in verified_claims}
    allowed_evidence = {str(evidence_id) for item in verified_claims for evidence_id in item["cited_evidence_ids"]}
    safe_actions: list[dict] = []
    for action in actions:
        claim_indices = [index for index in action["claim_indices"] if index in allowed_indices]
        if not claim_indices:
            continue
        action["claim_indices"] = claim_indices
        action["evidence_ids"] = [evidence_id for evidence_id in action["evidence_ids"] if evidence_id in allowed_evidence]
        safe_actions.append(action)
    return safe_actions


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


# 抖音/字节系图片 CDN 域名白名单：只代理这些来源，避免被当成任意 URL 代理(SSRF)
_IMG_PROXY_HOST_TAGS = ("douyinpic", "douyinvod", "byteimg", "pstatp", "bytedance",
                        "douyin", "amemv", "bytecdn", "ixigua", "snssdk", "ibyteimg", "byteacctimg")


# 图片代理的服务器内存缓存：抓过的封面/头像存内存，同一图后续请求秒回。
# 带上限，满了淘汰最旧的，避免吃满内存(200 张小图约几十 MB)。
_IMG_CACHE: "OrderedDict[str, tuple[bytes, str]]" = OrderedDict()
_IMG_CACHE_MAX = 200


@app.get("/api/img_proxy")
def img_proxy(url: str):
    """代拉抖音封面/头像图，绕过 CDN 防盗链(Referer 校验)，稳定显示。仅限白名单来源。带内存缓存。"""
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="无效图片地址")
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").lower()
    if not any(tag in host for tag in _IMG_PROXY_HOST_TAGS):
        raise HTTPException(status_code=403, detail="不允许的图片来源")
    cached = _IMG_CACHE.get(url)
    if cached is not None:
        _IMG_CACHE.move_to_end(url)  # 命中即刷新为最近使用
        content, media = cached
        return Response(content=content, media_type=media, headers={"Cache-Control": "public, max-age=86400", "X-Cache": "HIT"})
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": BROWSER_HEADERS["User-Agent"], "Referer": "https://www.douyin.com/"},
            timeout=15,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"[img_proxy] 获取失败: {str(e)[:160]}")
        raise HTTPException(status_code=502, detail="图片获取失败")
    media = resp.headers.get("Content-Type", "image/jpeg")
    if not media.startswith("image/"):
        media = "image/jpeg"
    _IMG_CACHE[url] = (resp.content, media)
    _IMG_CACHE.move_to_end(url)
    while len(_IMG_CACHE) > _IMG_CACHE_MAX:
        _IMG_CACHE.popitem(last=False)  # 淘汰最旧
    return Response(content=resp.content, media_type=media, headers={"Cache-Control": "public, max-age=86400", "X-Cache": "MISS"})


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


@app.post("/api/analyze_single_upload")
async def analyze_single_upload(topic: str = Form(...), file: UploadFile = File(...)):
    """本地视频上传：与 /api/analyze_single 相同的产物，只是媒体来自上传文件而非链接。"""
    topic = (topic or "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="请提供话题")

    suffix = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    if suffix not in (".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".flv", ".ts"):
        raise HTTPException(status_code=400, detail="仅支持常见视频格式（mp4/mov/webm 等）")

    limit_mb = int(os.getenv("UPLOAD_MAX_MB", "200"))
    limit = limit_mb * 1024 * 1024
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    size = 0
    try:
        with open(tmp_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    raise HTTPException(status_code=413, detail=f"文件过大，上限 {limit_mb}MB")
                out.write(chunk)
    except HTTPException:
        remove_file_quietly(tmp_path)
        raise
    except Exception as e:
        remove_file_quietly(tmp_path)
        raise HTTPException(status_code=400, detail=f"文件接收失败: {str(e)[:120]}")
    if size == 0:
        remove_file_quietly(tmp_path)
        raise HTTPException(status_code=400, detail="上传文件为空")

    try:
        media = fetch_media_upload(tmp_path, title=file.filename)
    except Exception as e:
        remove_file_quietly(tmp_path)
        print(f"[analyze_single_upload] 媒体处理失败: {e}")
        raise HTTPException(status_code=502, detail="上传视频处理失败（服务器需安装 ffmpeg）")

    try:
        # media 已含 cleanup_paths（含上传文件与临时音频），由 extract_one_video 的 finally 统一清理
        video = await asyncio.to_thread(extract_one_video, 1, "", media)
    except Exception as e:
        print(f"[analyze_single_upload] 视频提取失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=502, detail="视频内容提取失败，请重试")

    if not video.get("clean_text"):
        raise HTTPException(status_code=502, detail="未能从视频中提取到语音文本（可能是纯画面无口播）")

    try:
        result = await asyncio.to_thread(extract_claims_from_video, video, topic)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[analyze_single_upload] 主张拆解失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="AI 拆解主张失败，请重试")

    result["topic"] = topic
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


@app.post("/api/verify_claim/stream")
async def verify_claim_stream(req: VerifyClaimRequest, request: Request):
    claim = req.claim.strip()
    if not claim:
        raise HTTPException(status_code=400, detail="请提供要核验的主张")
    top_k = max(1, min(req.top_k, 10))
    video_refs = [r.model_dump() if hasattr(r, "model_dump") else r.dict() for r in req.video_refs]

    async def event_stream():
        loop = asyncio.get_running_loop()
        events: asyncio.Queue[dict] = asyncio.Queue()

        def emit(event: dict):
            loop.call_soon_threadsafe(events.put_nowait, event)

        task = asyncio.create_task(asyncio.to_thread(verify_single_claim, claim, req.topic, video_refs, top_k, emit, False))
        try:
            while not task.done() or not events.empty():
                if await request.is_disconnected():
                    task.cancel()
                    return
                try:
                    event = await asyncio.wait_for(events.get(), timeout=15)
                    yield f"data: {json.dumps({'type': 'step', **event}, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
            result = await task
            yield f"data: {json.dumps({'type': 'result', 'result': result}, ensure_ascii=False)}\n\n"
            if should_generate_claim_origin(result):
                yield f"data: {json.dumps({'type': 'step', 'step': 'claim_origin_start', 'label': '分析说法流传成因', 'tone': 'ok'}, ensure_ascii=False)}\n\n"
                origin = await asyncio.to_thread(generate_claim_origin, claim, str(result.get('verdict') or ''), str(result.get('correction') or ''))
                yield f"data: {json.dumps({'type': 'claim_origin', 'origin': origin}, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'claim_origin', 'origin': None}, ensure_ascii=False)}\n\n"
        except asyncio.CancelledError:
            task.cancel()
            raise
        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': exc.detail}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            print(f"[verify_claim_stream] 核验失败: {exc}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'AI 核验失败，请重试'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/build_single_actions")
async def build_single_actions(req: BuildSingleActionsRequest):
    if not any(isinstance(item, dict) and str(item.get("correction") or "").strip() for item in req.claims):
        return {"actions": []}
    try:
        return {"actions": await asyncio.to_thread(generate_single_actions, req)}
    except Exception as e:
        print(f"[build_single_actions] 生成失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="行动建议生成失败，请稍后重试")


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
5. 回答简洁清楚，避免空话。
6. 可适度使用 Markdown 提升可读性：仅用 **加粗** 标出关键结论、用 - 列出要点；不要输出 HTML、表格或复杂标题。"""
    try:
        answer = await asyncio.to_thread(llm_chat, prompt, 8192)
    except Exception as e:
        print(f"[followup] 失败: {e}")
        raise HTTPException(status_code=500, detail="追问失败，请重试")
    return {"answer": answer.strip()}


def build_followup_single_prompt(req: FollowupSingleRequest) -> str:
    history_text = "\n".join(f"{message.role}: {message.content}" for message in req.history) or "（暂无）"
    return f"""你是 FitProof 健康核验助手，只围绕用户看的这一条健康视频及其已核验结论答疑。

视频信息：
{json.dumps(req.reference, ensure_ascii=False)}

视频话题：
{req.topic or "（未指定）"}

已核验的说法与结论：
{json.dumps(req.claims, ensure_ascii=False)}

对话历史：
{history_text}

用户问题：
{req.question}

回答要求：
1. 优先依据上面已核验的结论和证据回答，不得改变已有判定或虚构新的核验结果。
2. 若问题超出已核验范围，可以做通俗的名词或常识解释，但必须明确说明这部分没有权威证据支撑、属于常识判断。
3. 绝不编造机构、指南、论文、数据、证据编号或来源；没有依据时要诚实说明。
4. 只有问题与这条视频的健康话题完全无关时，例如天气或股票，才回复：这个问题和当前视频无关哦。
5. 使用简洁、清楚的中文回答。
6. 可适度使用 Markdown 提升可读性：仅用 **加粗** 标出关键结论、用 - 列出要点；不要输出 HTML、表格或复杂标题。"""


@app.post("/api/followup_single")
async def followup_single(req: FollowupSingleRequest):
    prompt = build_followup_single_prompt(req)
    try:
        answer = await asyncio.to_thread(llm_chat, prompt, 8192)
    except Exception as e:
        print(f"[followup_single] 失败: {e}")
        raise HTTPException(status_code=500, detail="追问失败，请重试")
    return {"answer": answer.strip()}


@app.post("/api/followup_single_stream")
async def followup_single_stream(req: FollowupSingleRequest):
    prompt = build_followup_single_prompt(req)

    def event_stream():
        emitted = False
        try:
            stream = get_llm_client().chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=8192,
                temperature=0.3,
                stream=True,
            )
            for chunk in stream:
                content = chunk.choices[0].delta.content if chunk.choices else None
                if not content:
                    continue
                emitted = True
                yield f"data: {json.dumps({'type': 'delta', 'content': content}, ensure_ascii=False)}\n\n"
            if emitted:
                yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': 'AI 未返回回答，请重试'}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            print(f"[followup_single_stream] 失败: {exc}")
            yield f"data: {json.dumps({'type': 'error', 'message': '追问失败，请重试'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
