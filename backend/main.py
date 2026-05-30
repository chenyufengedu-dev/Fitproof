import os
import re
import json
import asyncio
import tempfile
import subprocess
import traceback

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

load_dotenv()

TIKHUB_TOKEN = os.getenv("TIKHUB_TOKEN", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

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
def llm_chat(prompt: str, max_tokens: int = 8192, json_mode: bool = False, retries: int = 3) -> str:
    client = get_llm_client()
    kwargs = {
        "model": DEEPSEEK_MODEL,
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


def transcribe(path: str) -> tuple[str, list[dict]]:
    model = get_whisper_model()
    result = model.transcribe(path, language="zh")
    text = (result.get("text") or "").strip()
    segments = [
        {"start": float(s["start"]), "text": (s.get("text") or "").strip()}
        for s in result.get("segments", [])
    ]
    return text, segments


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
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/preset/{preset_id}")
def get_preset(preset_id: str):
    if preset_id not in {"1", "2", "3"}:
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
        answer = await asyncio.to_thread(llm_chat, prompt, 4096)
    except Exception as e:
        print(f"[followup] 失败: {e}")
        raise HTTPException(status_code=500, detail="追问失败，请重试")
    return {"answer": answer.strip()}
