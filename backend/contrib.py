# -*- coding: utf-8 -*-
"""用户自愿贡献的待审记录。

这张表与权威文献库完全隔离：复核通过只改变本表状态，绝不写入 evidence/
或向量缓存。client_id 是浏览器本地生成的匿名随机值，不是用户身份。
"""
from __future__ import annotations

import html
import json
import os
import sqlite3
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, StrictStr, field_validator

router = APIRouter()

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "contributions.db")
_RATE_LIMIT = 5
_RATE_WINDOW_SECONDS = 60
_submission_times: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = threading.Lock()

_TEXT_LIMITS = {
    "topic": 200,
    "claim": 500,
    "verdict": 80,
    "risk_level": 80,
    "correction": 2_000,
    "source_url": 2_000,
    "client_id": 128,
}


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_review (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            topic TEXT NOT NULL,
            claim TEXT NOT NULL,
            verdict TEXT NOT NULL,
            risk_level TEXT NOT NULL,
            correction TEXT NOT NULL,
            evidence_ids TEXT NOT NULL,
            source_url TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
            reviewer_note TEXT,
            client_id TEXT NOT NULL
        )
        """
    )
    return connection


class ContributionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    topic: StrictStr = ""
    claim: StrictStr
    verdict: StrictStr = ""
    risk_level: StrictStr = ""
    correction: StrictStr = ""
    evidence_ids: list[StrictStr] = []
    source_url: StrictStr = ""
    client_id: StrictStr

    @field_validator("topic", "claim", "verdict", "risk_level", "correction", "source_url", "client_id")
    @classmethod
    def validate_text(cls, value: str, info):
        cleaned = value.strip()
        limit = _TEXT_LIMITS[info.field_name]
        if len(cleaned) > limit:
            raise ValueError(f"{info.field_name} 长度不能超过 {limit} 个字符")
        if info.field_name in {"claim", "client_id"} and not cleaned:
            raise ValueError(f"{info.field_name} 不能为空")
        return cleaned

    @field_validator("evidence_ids")
    @classmethod
    def validate_evidence_ids(cls, values: list[str]) -> list[str]:
        if len(values) > 30:
            raise ValueError("evidence_ids 最多 30 条")
        cleaned: list[str] = []
        for value in values:
            item = value.strip()
            if not item or len(item) > 160:
                raise ValueError("evidence_ids 必须是长度不超过 160 的非空字符串")
            cleaned.append(item)
        return cleaned


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    action: Literal["approve", "reject"]
    note: StrictStr = ""

    @field_validator("note")
    @classmethod
    def validate_note(cls, value: str) -> str:
        value = value.strip()
        if len(value) > 1_000:
            raise ValueError("note 长度不能超过 1000 个字符")
        return value


def _check_rate_limit(client_id: str) -> None:
    now = time.monotonic()
    with _rate_lock:
        timestamps = _submission_times[client_id]
        while timestamps and now - timestamps[0] >= _RATE_WINDOW_SECONDS:
            timestamps.popleft()
        if len(timestamps) >= _RATE_LIMIT:
            raise HTTPException(status_code=429, detail="每分钟最多提交 5 条贡献")
        timestamps.append(now)


def _serialize(row: sqlite3.Row) -> dict:
    try:
        evidence_ids = json.loads(row["evidence_ids"])
    except json.JSONDecodeError:
        evidence_ids = []
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "topic": row["topic"],
        "claim": row["claim"],
        "verdict": row["verdict"],
        "risk_level": row["risk_level"],
        "correction": row["correction"],
        "evidence_ids": evidence_ids,
        "source_url": row["source_url"],
        "status": row["status"],
        "reviewer_note": row["reviewer_note"],
    }


@router.post("/api/contrib")
def create_contribution(payload: ContributionCreate) -> dict[str, str]:
    _check_rate_limit(payload.client_id)
    contribution_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO pending_review (
                id, created_at, topic, claim, verdict, risk_level, correction,
                evidence_ids, source_url, status, reviewer_note, client_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
            """,
            (
                contribution_id,
                created_at,
                payload.topic,
                payload.claim,
                payload.verdict,
                payload.risk_level,
                payload.correction,
                json.dumps(payload.evidence_ids, ensure_ascii=False),
                payload.source_url,
                payload.client_id,
            ),
        )
    return {"id": contribution_id, "status": "pending"}


@router.get("/api/contrib")
def list_contributions(client_id: Annotated[str, Query(min_length=1, max_length=128)]) -> dict:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT * FROM pending_review WHERE client_id = ? ORDER BY created_at DESC",
            (client_id.strip(),),
        ).fetchall()
    return {"records": [_serialize(row) for row in rows]}


@router.get("/api/contrib/stats")
def contribution_stats() -> dict[str, int]:
    with _connect() as connection:
        counts = {
            row["status"]: row["count"]
            for row in connection.execute(
                "SELECT status, COUNT(*) AS count FROM pending_review GROUP BY status"
            ).fetchall()
        }
    return {"pending": counts.get("pending", 0), "approved": counts.get("approved", 0)}


@router.post("/api/contrib/{contribution_id}/review")
def review_contribution(contribution_id: str, payload: ReviewRequest) -> dict[str, str]:
    if len(contribution_id) > 64:
        raise HTTPException(status_code=400, detail="无效的贡献 ID")
    status = "approved" if payload.action == "approve" else "rejected"
    with _connect() as connection:
        result = connection.execute(
            "UPDATE pending_review SET status = ?, reviewer_note = ? WHERE id = ?",
            (status, payload.note or None, contribution_id),
        )
    if result.rowcount != 1:
        raise HTTPException(status_code=404, detail="未找到该贡献")
    return {"id": contribution_id, "status": status}


@router.get("/api/contrib/review-page", response_class=HTMLResponse)
def review_page() -> str:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT * FROM pending_review WHERE status = 'pending' ORDER BY created_at ASC"
        ).fetchall()
    items = "".join(
        f"""<article data-id=\"{html.escape(row['id'])}\">
<p><strong>{html.escape(row['claim'])}</strong></p>
<p>话题：{html.escape(row['topic']) or '未分类'} · {html.escape(row['created_at'])}</p>
<p>模型判定：{html.escape(row['verdict'])}；修正：{html.escape(row['correction'])}</p>
<input aria-label=\"复核意见\" placeholder=\"复核意见（可选）\">
<button data-action=\"approve\">通过</button><button data-action=\"reject\">驳回</button>
</article>"""
        for row in rows
    ) or "<p>暂无待审核贡献。</p>"
    return f"""<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>FitProof 贡献复核</title>
<style>body{{font:16px system-ui;max-width:760px;margin:32px auto;padding:0 16px;color:#18312c}}article{{border:1px solid #d8e5e1;border-radius:10px;margin:12px 0;padding:14px}}input{{width:60%;padding:7px;margin-right:8px}}button{{margin-right:6px;padding:7px 12px}}</style></head>
<body><h1>用户贡献待审核</h1>{items}<script>document.addEventListener('click',async e=>{{const b=e.target;if(!(b instanceof HTMLButtonElement))return;const a=b.dataset.action;if(!a)return;const card=b.closest('article');const note=card.querySelector('input').value;const r=await fetch('/api/contrib/'+card.dataset.id+'/review',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{action:a,note}})}});if(r.ok)card.remove();else alert('操作失败');}})</script></body></html>"""
