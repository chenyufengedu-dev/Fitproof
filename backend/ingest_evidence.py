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
from openai import OpenAI

sys.stdout.reconfigure(encoding="utf-8")

# ============================================================
#  在下面引号中间填入你的 DeepSeek API 密钥，然后保存本文件即可。
#  （去 https://platform.deepseek.com 注册→充值→创建 API Key）
API_KEY = ""      # 例如： API_KEY = "sk-1234567890abcdef"
# ============================================================

BASE = os.path.dirname(os.path.abspath(__file__))

# 读 .env（若脚本同目录下有 .env 就加载；没装 python-dotenv 或没有 .env 也不报错，可用其它方式给密钥）
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE, ".env"))
    load_dotenv()  # 再兜底找当前工作目录
except Exception:
    pass

DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
# 拆条是机械的“阅读理解+结构化”，不需要推理模型，默认快模型（非推理）。
INGEST_MODEL = os.getenv("INGEST_MODEL", "deepseek-v4-flash")

# 目录自适应：仓库里用 backend/evidence/*，脚本单独放一个文件夹时用同目录 ./cache ./entries
_evid = os.path.join(BASE, "evidence")
if os.path.isdir(_evid):
    CACHE_DIR = os.path.join(_evid, "cache")
    ENTRIES_DIR = os.path.join(_evid, "entries")
else:
    CACHE_DIR = os.path.join(BASE, "cache")
    ENTRIES_DIR = os.path.join(BASE, "entries")
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(ENTRIES_DIR, exist_ok=True)

_client = None
_ocr = None
_api_key = ""


def resolve_api_key(cli_key: str = "") -> str:
    """密钥来源优先级：命令行 --api-key > 文件顶部 API_KEY > 环境变量/.env > 同目录 key.txt。
    最简单的方式：直接在本文件顶部的 API_KEY = "" 里填。脚本可脱离项目独立运行。"""
    key = (cli_key or API_KEY or os.getenv("DEEPSEEK_API_KEY", "")).strip()
    if not key:
        kt = os.path.join(BASE, "key.txt")
        if os.path.exists(kt):
            key = open(kt, encoding="utf-8").read().strip()
    if not key:
        raise SystemExit(
            "缺少 DeepSeek API 密钥。最简单：打开本脚本，在顶部 API_KEY = \"\" 的引号里填入密钥后保存。\n"
            "（申请：https://platform.deepseek.com）"
        )
    return key


def client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=_api_key, base_url=DEEPSEEK_BASE_URL,
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


def resolve_pdf(pdf: str) -> str:
    """在多个可能位置找 PDF，兼容"脚本单独一个文件夹"和"仓库结构"两种摆法。"""
    if os.path.isabs(pdf) and os.path.exists(pdf):
        return pdf
    fn = os.path.basename(pdf)
    candidates = [
        pdf,                                        # 相对当前工作目录
        os.path.join(BASE, pdf),                    # 相对脚本目录
        os.path.join(BASE, fn),                     # 脚本同目录直接放 PDF
        os.path.join(BASE, "raw", fn),              # 脚本同目录 raw/
        os.path.join(BASE, "evidence", "raw", fn),  # 仓库结构 evidence/raw/
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return pdf  # 都找不到，返回原值让调用方报"找不到"


def ingest_one(pdf, org, doc_name, year="", url="", topic="", pages="",
               window=3, dpi=200, model=INGEST_MODEL, force=False):
    """拆一份 PDF → 写 entries/{名}.json，返回条数。已拆过的默认跳过（除非 force）。"""
    pdf_path = resolve_pdf(pdf)
    if not os.path.exists(pdf_path):
        print(f"[skip] 找不到文件：{pdf}（把 PDF 放到脚本同目录，或同目录的 raw/ 文件夹）")
        return 0
    # 跳过已处理：entries/{名}.json 已存在且有内容就不重复跑（省时省 token）
    out_existing = os.path.join(ENTRIES_DIR, f"{slugify(doc_name)}.json")
    if not force and os.path.exists(out_existing):
        try:
            prev = json.load(open(out_existing, encoding="utf-8"))
            if prev.get("count", 0) > 0:
                print(f"[skip] 《{doc_name}》已拆过（{prev['count']} 条），跳过。要重拆加 --force")
                return 0
        except Exception:
            pass
    doc = fitz.open(pdf_path)
    page_list = parse_page_range(pages, doc.page_count)
    cache_key = slugify(doc_name)
    meta = {"org": org, "doc": doc_name, "year": year}
    print(f"[ingest] 《{doc_name}》 共 {doc.page_count} 页，处理 {len(page_list)} 页，窗口 {window}，模型 {model}")

    texts = {}
    for pno in page_list:
        texts[pno] = page_text(doc, pno, cache_key, dpi)
        print(f"  p{pno}: {len(texts[pno])} 字", end="\r")
    print()

    entries = []
    idx = 0
    prefix = slugify(doc_name)[:12]
    for i in range(0, len(page_list), window):
        win_pages = page_list[i:i + window]
        window_text = "\n".join(texts[p] for p in win_pages if texts[p].strip())
        if len(window_text.strip()) < 40:
            continue
        page_label = f"{win_pages[0] + 1}-{win_pages[-1] + 1}"
        try:
            raw = llm(extract_prompt(meta, window_text, page_label), model=model)
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
                "topics": ([topic] if topic else []) + (e.get("topics") or []),
                "source_doc": doc_name, "org": org, "year": year,
                "url": url, "page": page_label,
            })
        print(f"  页 {page_label}: 累计 {len(entries)} 条")
        time.sleep(0.3)

    out = os.path.join(ENTRIES_DIR, f"{cache_key}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"doc": doc_name, "org": org, "year": year, "url": url,
                   "count": len(entries), "entries": entries}, f, ensure_ascii=False, indent=2)
    print(f"[ingest] 完成，共 {len(entries)} 条 → {out}\n")
    return len(entries)


def run_manifest(path, window, dpi, model, force=False):
    """批量模式：读 CSV 清单，逐行拆条。CSV 列：filename,org,doc,year,url,topic,pages
    已拆过的文档自动跳过，所以后续往 CSV 加新行、重跑本命令，只会处理新文档。"""
    import csv
    path = path if os.path.isabs(path) else os.path.join(BASE, path)
    with open(path, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print(f"[manifest] 读到 {len(rows)} 行任务：{path}\n")
    total = 0
    for r in rows:
        fn = (r.get("filename") or "").strip()
        if not fn or fn.startswith("#"):
            continue
        total += ingest_one(
            pdf=fn,
            org=(r.get("org") or "").strip(),
            doc_name=(r.get("doc") or fn).strip(),
            year=(r.get("year") or "").strip(),
            url=(r.get("url") or "").strip(),
            topic=(r.get("topic") or "").strip(),
            pages=(r.get("pages") or "").strip(),
            window=window, dpi=dpi, model=model, force=force,
        )
    print(f"[manifest] 本次新增 {total} 条（已拆过的自动跳过）")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", nargs="?", help="单份 PDF 路径；用 --manifest 时可省略")
    ap.add_argument("--manifest", default="", help="批量：CSV 清单路径，如 evidence/registry.csv")
    ap.add_argument("--org", default="")
    ap.add_argument("--doc", default="")
    ap.add_argument("--year", default="")
    ap.add_argument("--url", default="")
    ap.add_argument("--topic", default="", help="领域标签，会写进每条")
    ap.add_argument("--pages", default="", help="页范围如 35-60，缺省全书")
    ap.add_argument("--window", type=int, default=3, help="每几页合并成一个抽取窗口（越大调用越少越快）")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--model", default=INGEST_MODEL,
                    help=f"拆条模型，默认 {INGEST_MODEL}（快模型）。不建议用推理模型，慢且费 token")
    ap.add_argument("--force", action="store_true", help="强制重拆已处理过的文档")
    ap.add_argument("--api-key", default="", help="DeepSeek 密钥；也可用 .env / key.txt 提供")
    args = ap.parse_args()

    global _api_key
    _api_key = resolve_api_key(args.api_key)

    if args.manifest:
        run_manifest(args.manifest, args.window, args.dpi, args.model, args.force)
    elif args.pdf:
        ingest_one(args.pdf, args.org, args.doc or os.path.basename(args.pdf),
                   args.year, args.url, args.topic, args.pages,
                   args.window, args.dpi, args.model, force=args.force)
    else:
        ap.error("请提供单份 PDF 路径，或用 --manifest 指定 CSV 清单")


if __name__ == "__main__":
    main()
