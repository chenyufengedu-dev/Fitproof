from __future__ import annotations

from typing import Any


CONTENT_SCOPES = {
    "explicit_claim",
    "implicit_guidance",
    "health_context_only",
    "unrelated",
    "pending_visual",
}
CONTENT_DECISIONS = {"continue", "stop", "inspect_visual"}

NON_HEALTH_FORMATS = (
    "赛事直播",
    "比赛直播",
    "比赛集锦",
    "赛事集锦",
    "影视剪辑",
    "电影解说",
    "游戏实况",
    "旅游攻略",
    "搞笑段子",
)
HEALTH_HINTS = (
    "减脂",
    "减肥",
    "增肌",
    "训练",
    "饮食",
    "营养",
    "睡眠",
    "症状",
    "疾病",
    "治疗",
    "用药",
    "康复",
    "疼痛",
    "健康",
)


class ContentRoutingError(ValueError):
    pass


def metadata_precheck(media: dict[str, Any]) -> dict[str, Any] | None:
    """Reject only explicit non-health formats; otherwise abstain."""
    if str(media.get("source") or "").lower() == "upload":
        return None
    text = " ".join(str(media.get(key) or "") for key in ("title", "description", "category"))
    if not text or not any(marker in text for marker in NON_HEALTH_FORMATS):
        return None
    if any(marker in text for marker in HEALTH_HINTS):
        return None
    title = str(media.get("title") or "").strip()
    return {
        "scope": "unrelated",
        "decision": "stop",
        "need_visual": False,
        "reason": "媒体信息明确指向非健康内容",
        "quotes": [title] if title else [],
    }


def build_metadata_route_prompt(media: dict[str, Any]) -> str:
    return f"""你是 FitProof 一级内容门卫，只看视频元信息判断是否明确与健康信息核验无关。

你只负责提前停止非常明确的无关主题，不负责判断健康说法真假。
只有标题、描述或分类明确属于编程、网站设计、影视、游戏、旅游、娱乐、赛事等非健康主题时，才返回 stop / unrelated / high。
只要涉及饮食、减脂、运动、康复、疾病、睡眠、用药等健康线索，必须返回 continue_deep / potential_health。
如果信息不足或无法确定，必须返回 continue_deep / uncertain，不能猜测。
quotes 必须逐字来自标题、描述或分类；不得根据作者昵称推断主题。

标题：{media.get('title', '')}
描述：{media.get('description', '')}
分类：{media.get('category', '')}

输出严格 JSON，不要输出其他内容：
{{"decision":"continue_deep","scope":"uncertain","confidence":"low","reason":"信息不足","quotes":[]}}"""


def normalize_metadata_route(data: Any, source_text: str) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        raise ContentRoutingError("元信息路由返回不是对象")
    decision = str(data.get("decision") or "").strip()
    scope = str(data.get("scope") or "").strip()
    confidence = str(data.get("confidence") or "").strip()
    if decision not in {"stop", "continue_deep"}:
        raise ContentRoutingError("元信息路由决定非法")
    if scope not in {"unrelated", "potential_health", "uncertain"}:
        raise ContentRoutingError("元信息路由范围非法")
    if confidence not in {"low", "medium", "high"}:
        raise ContentRoutingError("元信息路由置信度非法")
    raw_quotes = data.get("quotes", [])
    if not isinstance(raw_quotes, list):
        raise ContentRoutingError("元信息引用格式非法")
    quotes = [str(item).strip() for item in raw_quotes if str(item).strip()]
    if any(quote not in source_text for quote in quotes):
        raise ContentRoutingError("元信息路由引用不落地")
    if decision == "continue_deep":
        if scope not in {"potential_health", "uncertain"}:
            raise ContentRoutingError("元信息继续决定与范围冲突")
        return None
    if scope != "unrelated" or confidence != "high" or not quotes:
        raise ContentRoutingError("元信息停止条件不足")
    return {
        "scope": "unrelated",
        "decision": "stop",
        "need_visual": False,
        "reason": str(data.get("reason") or "明确为非健康内容").strip()[:120],
        "quotes": quotes[:3],
    }


def build_content_route_prompt(
    media: dict[str, Any],
    clean_text: str,
    keyframes: list[dict[str, Any]] | None = None,
) -> str:
    frames = "\n".join(
        f"[{item.get('time', 0)}秒] {item.get('screen_text', '')}"
        for item in (keyframes or [])
        if str(item.get("screen_text") or "").strip()
    ) or "无已解读画面"
    return f"""你是 FitProof 视频内容路由器。只根据给定标题、转写和画面，输出严格 JSON。

scope 只能是 explicit_claim、implicit_guidance、health_context_only、unrelated、pending_visual。
decision 只能是 continue、stop、inspect_visual。
明确健康主张和健康目标导向的可模仿方案继续；仅健康场景或完全无关停止。
“减脂期我每天这样吃”属于 implicit_guidance。普通生活记录不自动视为建议。
只有必须查看尚未解读的动作、食物、报告或图表才能判断时才使用 pending_visual/inspect_visual。
quotes 必须逐字来自输入，不得补写；没有可引用原话时返回空数组。
need_visual 只有在 decision 为 inspect_visual 时才为 true，其他决定必须为 false。

标题：{media.get('title', '')}
描述：{media.get('description', '')}
转写：{clean_text}
画面：{frames}

输出格式：
{{"scope":"explicit_claim","decision":"continue","need_visual":false,"reason":"不超过40字","quotes":["输入原文"]}}"""


def normalize_content_route(data: Any, source_text: str) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ContentRoutingError("内容路由返回不是对象")
    scope = str(data.get("scope") or "").strip()
    decision = str(data.get("decision") or "").strip()
    if scope not in CONTENT_SCOPES or decision not in CONTENT_DECISIONS:
        raise ContentRoutingError("内容路由枚举非法")
    allowed = {
        "explicit_claim": {"continue", "inspect_visual"},
        "implicit_guidance": {"continue", "inspect_visual"},
        "health_context_only": {"stop"},
        "unrelated": {"stop"},
        "pending_visual": {"inspect_visual"},
    }
    if decision not in allowed[scope]:
        raise ContentRoutingError("内容路由类别与决定冲突")
    if not isinstance(data.get("need_visual"), bool):
        raise ContentRoutingError("画面判断必须是布尔值")
    need_visual = data["need_visual"]
    if need_visual != (decision == "inspect_visual"):
        raise ContentRoutingError("画面判断与路由决定冲突")
    raw_quotes = data.get("quotes")
    if raw_quotes is None:
        raw_quotes = []
    if not isinstance(raw_quotes, list):
        raise ContentRoutingError("内容路由引用格式非法")
    quotes = [str(item).strip() for item in raw_quotes if str(item).strip()]
    if any(quote not in source_text for quote in quotes):
        raise ContentRoutingError("内容路由引用了输入中不存在的原话")
    return {
        "scope": scope,
        "decision": decision,
        "need_visual": need_visual,
        "reason": str(data.get("reason") or "").strip()[:120],
        "quotes": quotes[:3],
    }
