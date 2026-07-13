"""证据库灌库脚本：把权威指南 PDF 拆成结构化「结论条目」。

支持两类 PDF：
  - 文字版：直接抽取文字层
  - 扫描版（图片型，无文字层）：渲染每页 → RapidOCR 识别

流程：PDF → 逐页文字（带页码，OCR 结果会缓存）→ 按页窗口喂 DeepSeek
      → 抽成结论条目（claim/section/strength/topics...）→ 写 evidence/entries/{名}.json

用法：
  python ingest_evidence.py "evidence/raw/xxx.pdf" --org "中国营养学会" \
      --doc "中国居民膳食指南（2022）" --year 2022 \
      --url "https://..." --topic "日常膳食" [--pages 35-60] [--dpi 200]

只跑一小段先看效果：加 --pages 35-50
"""

import os
import re
import sys
import json
import time
import argparse

import fitz  # pymupdf
from dotenv import load_dotenv
from openai import OpenAI

sys.stdout.reconfigure(encoding="utf-8")
load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
# 拆条是机械的“阅读理解+结构化”，不需要推理模型。
# 默认强制用快模型 deepseek-chat（非推理），比 .env 里的 deepseek-v4-pro 快很多、省很多 token。
# 若确需换模型，用命令行 --model 覆盖。
INGEST_MODEL = os.getenv("INGEST_MODEL", "deepseek-chat")

BASE = os.path.dirname(__file__)
CACHE_DIR = os.path.join(BASE, "evidence", "cache")   # OCR 文字缓存
ENTRIES_DIR = os.path.join(BASE, "evidence", "entries")
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(ENTRIES_DIR, exist_ok=True)

_client = None
_ocr = None


def client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL,
                         max_retries=3, timeout=120)
    return _client


def ocr_engine():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr = RapidOCR()
    return _ocr


# 用快模型（非推理）做拆条：max_tokens 4096 足够，不会有推理模型的空 content 问题
def llm(prompt: str, model: str, max_tokens: int = 4096) -> str:
    resp = client().chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content or ""


def parse_page_range(s: str, total: int):
    if not s:
        return list(range(total))
    m = re.match(r"^(\d+)-(\d+)$", s.strip())
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return [i for i in range(a, b + 1) if 0 <= i < total]
    return [int(x) for x in s.split(",") if x.strip().isdigit() and int(x) < total]


def page_text(doc, pno: int, cache_key: str, dpi: int) -> str:
    """取某页文字：优先文字层，没有则 OCR（结果按页缓存）。"""
    direct = doc[pno].get_text().strip()
    if len(direct) > 20:
        return direct
    cache = os.path.join(CACHE_DIR, f"{cache_key}_p{pno}.txt")
    if os.path.exists(cache):
        with open(cache, "r", encoding="utf-8") as f:
            return f.read()
    import tempfile
    pix = doc[pno].get_pixmap(dpi=dpi)
    tmp = os.path.join(tempfile.gettempdir(), f"_ev_{pno}.png")
    pix.save(tmp)
    try:
        res, _ = ocr_engine()(tmp)
        text = " ".join(l[1] for l in res).strip() if res else ""
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def extract_prompt(meta: dict, window_text: str, page_label: str) -> str:
    return f"""你是循证医学资料员。下面是《{meta['doc']}》（{meta['org']}，{meta['year']}）第 {page_label} 页的正文（可能含 OCR 噪声，请理解语义、忽略明显的识别错字）。

请从中抽取【可用于核验健康说法的结论条目】。只抽取「指南给出明确立场/推荐/结论」的内容，忽略：目录、前言、致谢、纯背景介绍、无结论的叙述。

每条要求：
- claim：把指南的结论改写成一句**面向核验**的明确陈述（如"健康成人每天可摄入 1 个鸡蛋，蛋黄无需丢弃"）。不要照抄整段，提炼成可判断的结论。
- section：该结论所在的准则/章节名（从文中判断，不确定就留空）。
- strength：证据/推荐强度，从 ["指南推荐","指南建议","一般共识","背景说明"] 里选最贴切的。
- topics：2~5 个关键词标签（如 ["鸡蛋","胆固醇","蛋白质"]），供检索用。
本页没有任何可抽取的结论就返回空数组。**不要编造原文没有的内容。**

严格只输出 JSON：
{{"entries": [
  {{"claim": "...", "section": "...", "strength": "指南推荐", "topics": ["...","..."]}}
]}}

【正文】
{window_text}"""


def slugify(name: str) -> str:
    return re.sub(r"[^\w]+", "-", name).strip("-").lower() or "doc"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--org", required=True)
    ap.add_argument("--doc", required=True)
    ap.add_argument("--year", default="")
    ap.add_argument("--url", default="")
    ap.add_argument("--topic", default="", help="领域标签，会写进每条")
    ap.add_argument("--pages", default="", help="页范围如 35-60，缺省全书")
    ap.add_argument("--window", type=int, default=3, help="每几页合并成一个抽取窗口（越大调用越少越快）")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--model", default=INGEST_MODEL,
                    help=f"拆条模型，默认 {INGEST_MODEL}（快模型）。不建议用推理模型，慢且费 token")
    args = ap.parse_args()

    pdf_path = args.pdf if os.path.isabs(args.pdf) else os.path.join(BASE, args.pdf)
    doc = fitz.open(pdf_path)
    pages = parse_page_range(args.pages, doc.page_count)
    cache_key = slugify(args.doc)
    meta = {"org": args.org, "doc": args.doc, "year": args.year}
    print(f"[ingest] 《{args.doc}》 共 {doc.page_count} 页，本次处理 {len(pages)} 页，窗口 {args.window} 页，模型 {args.model}")

    # 1) 逐页取文字（OCR 有缓存）
    texts = {}
    for k, pno in enumerate(pages):
        t = page_text(doc, pno, cache_key, args.dpi)
        texts[pno] = t
        print(f"  p{pno}: {len(t)} 字", end="\r")
    print()

    # 2) 按窗口喂 LLM 抽条
    entries = []
    idx = 0
    prefix = slugify(args.doc)[:12]
    for i in range(0, len(pages), args.window):
        win_pages = pages[i:i + args.window]
        window_text = "\n".join(texts[p] for p in win_pages if texts[p].strip())
        if len(window_text.strip()) < 40:
            continue
        page_label = f"{win_pages[0] + 1}-{win_pages[-1] + 1}"
        try:
            raw = llm(extract_prompt(meta, window_text, page_label), model=args.model)
            data = json.loads(raw)
        except Exception as e:
            print(f"  [warn] 页 {page_label} 抽取失败: {str(e)[:80]}")
            continue
        for e in data.get("entries", []):
            claim = (e.get("claim") or "").strip()
            if not claim:
                continue
            idx += 1
            entries.append({
                "id": f"E-{prefix}-{idx:03d}",
                "claim": claim,
                "section": (e.get("section") or "").strip(),
                "strength": e.get("strength") or "一般共识",
                "topics": ([args.topic] if args.topic else []) + (e.get("topics") or []),
                "source_doc": args.doc,
                "org": args.org,
                "year": args.year,
                "url": args.url,
                "page": page_label,
            })
        print(f"  页 {page_label}: 累计 {len(entries)} 条")
        time.sleep(0.3)

    out = os.path.join(ENTRIES_DIR, f"{cache_key}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"doc": args.doc, "org": args.org, "year": args.year,
                   "url": args.url, "count": len(entries), "entries": entries},
                  f, ensure_ascii=False, indent=2)
    print(f"\n[ingest] 完成，共 {len(entries)} 条 → {out}")


if __name__ == "__main__":
    main()
