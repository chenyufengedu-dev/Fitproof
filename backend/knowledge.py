# -*- coding: utf-8 -*-
"""知识库 Tab 的数据源：只暴露「收录了哪些权威文献」，不暴露我们拆出来的结论正文。

这个边界是刻意的。展示 3282 条结论等于展示我们的二次加工，读者只能选择相信
我们没有断章取义；展示「我们收录了 WHO 的这 118 份文档」借的是 WHO 的信用，
而且每一条都能让读者自己去官网核对。后者主张更弱，但立得住。

独立成模块而不是塞进 main.py，是因为 main.py 同时有别人在改。
"""
from __future__ import annotations

import csv
import glob
import json
import os
import re
from functools import lru_cache
from typing import Any

from fastapi import APIRouter

router = APIRouter()

EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), "evidence")
ENTRIES_DIR = os.path.join(EVIDENCE_DIR, "entries")
REGISTRY_CSV = os.path.join(EVIDENCE_DIR, "registry.csv")

# 收录范围直接来自 registry 里真实存在的 topic，不再手写 —— 手写的清单会和
# 实际数据漂移（曾经写死过 4 个领域，而库里实际有 9 个）。组员新增领域会自动出现。
COVERAGE_NOTE = "文献结论均为原文摘录，FitProof 不改写、不提供医疗建议。"


def _read_registry() -> dict[str, dict[str, str]]:
    """registry 只用来补 pages / topic，主数据以 entries 为准。"""
    if not os.path.exists(REGISTRY_CSV):
        return {}
    with open(REGISTRY_CSV, encoding="utf-8-sig") as handle:
        return {
            (row.get("doc") or "").strip(): row
            for row in csv.DictReader(handle)
            if (row.get("doc") or "").strip()
        }


def _fix_pages(raw: str) -> str:
    """还原被 Excel 吃掉的页码范围。

    registry.csv 用 Excel 编辑过，它把 "3-11"（第 3 到 11 页）自作主张识别成日期，
    存成了 "3月11日"，274 份里有 149 份中招。页码范围只会从小到大，不存在歧义，
    所以这里可以安全地还原回 "3-11"。源文件的问题另外修，读取侧先兜住。
    """
    text = (raw or "").strip()
    match = re.fullmatch(r"(\d{1,3})月(\d{1,3})日", text)
    return f"{match.group(1)}-{match.group(2)}" if match else text


def _entry_count(payload: dict[str, Any]) -> int:
    """count 字段是拆条时写入的字符串，不可全信，能数就以实际条目数为准。"""
    entries = payload.get("entries")
    if isinstance(entries, list):
        return len(entries)
    try:
        return int(str(payload.get("count") or "0").strip())
    except ValueError:
        return 0


def _previews(payload: dict[str, Any], limit: int = 3) -> list[str]:
    """取几条原文结论做预览，让用户知道这份文献在讲什么。

    这不是「我们的观点」—— 是逐条摘录的原文结论，前端必须标注清楚它的性质，
    否则就变成了拿我们的二次加工冒充权威。只给示例、不给全量，
    要看全部仍然要去官方页面。
    """
    entries = payload.get("entries")
    if not isinstance(entries, list):
        return []
    out: list[str] = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        text = str(item.get("claim") or item.get("conclusion") or "").strip()
        if not text:
            continue
        out.append(text if len(text) <= 60 else text[:60] + "…")
        if len(out) >= limit:
            break
    return out


@lru_cache(maxsize=1)
def load_library() -> dict[str, Any]:
    registry = _read_registry()
    docs: list[dict[str, Any]] = []

    for path in sorted(glob.glob(os.path.join(ENTRIES_DIR, "*.json"))):
        try:
            with open(path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            # 单份文档坏掉不该让整个知识库打不开
            continue
        if not isinstance(payload, dict):
            continue

        title = str(payload.get("doc") or "").strip()
        if not title:
            continue
        meta = registry.get(title, {})
        docs.append(
            {
                "doc": title,
                "org": str(payload.get("org") or meta.get("org") or "").strip(),
                "year": str(payload.get("year") or meta.get("year") or "").strip(),
                "url": str(payload.get("url") or meta.get("url") or "").strip(),
                "pages": _fix_pages(str(meta.get("pages") or "")),
                "topic": str(meta.get("topic") or "").strip(),
                "entry_count": _entry_count(payload),
                "previews": _previews(payload),
            }
        )

    org_counts: dict[str, int] = {}
    for item in docs:
        if item["org"]:
            org_counts[item["org"]] = org_counts.get(item["org"], 0) + 1
    orgs = [
        {"name": name, "count": count}
        for name, count in sorted(org_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    topics = sorted({item["topic"] for item in docs if item["topic"]})

    # 收录量大的机构排前面，用户先看到认得出的名字（WHO、Cochrane…），
    # 而不是先看到一个自己没有感觉的数字。
    docs.sort(key=lambda item: (-item["entry_count"], item["doc"]))

    # 收录范围按文献数排序，让最主要的领域排在前面
    topic_counts: dict[str, int] = {}
    for item in docs:
        if item["topic"]:
            topic_counts[item["topic"]] = topic_counts.get(item["topic"], 0) + 1
    scope = [
        {"name": name, "count": count}
        for name, count in sorted(topic_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    return {
        "stats": {"docs": len(docs), "orgs": len(orgs)},
        "coverage": {"scope": scope, "note": COVERAGE_NOTE},
        "orgs": orgs,
        "topics": topics,
        "docs": docs,
    }


@lru_cache(maxsize=1)
def _entries_by_doc() -> dict[str, list[str]]:
    """文献名 -> 全部结论原文。列表接口只带 3 条预览，全量走这里按需取。

    全部 3282 条一次塞进目录接口会让首屏多背上 1MB 以上，
    而用户一次只会展开一两份文献。
    """
    table: dict[str, list[str]] = {}
    for path in glob.glob(os.path.join(ENTRIES_DIR, "*.json")):
        try:
            with open(path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(payload, dict):
            continue
        title = str(payload.get("doc") or "").strip()
        entries = payload.get("entries")
        if not title or not isinstance(entries, list):
            continue
        texts = []
        for item in entries:
            if not isinstance(item, dict):
                continue
            text = str(item.get("claim") or item.get("conclusion") or "").strip()
            if text:
                texts.append(text)
        table[title] = texts
    return table


@router.get("/api/knowledge")
def get_knowledge() -> dict[str, Any]:
    """整个文献目录一次返回。274 份的元信息约 150KB，不值得为它做分页。"""
    return load_library()


@router.get("/api/knowledge/entries")
def get_doc_entries(doc: str) -> dict[str, Any]:
    """某一份文献拆出的全部结论原文。"""
    entries = _entries_by_doc().get(doc.strip(), [])
    return {"doc": doc, "count": len(entries), "entries": entries}
