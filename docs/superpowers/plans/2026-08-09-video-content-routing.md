# Video Content Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop non-health videos before claim extraction while continuing to analyze explicit health claims and goal-directed, imitable health guidance such as “减脂期我每天这样吃”.

**Architecture:** Add a pure `content_router` module for metadata precheck, prompt construction, and strict route normalization. Integrate it into the existing ASR/keyframe pipeline so the current fast-model gate becomes a structured content router; expose accepted/rejected API outcomes as a discriminated union and render rejected outcomes as neutral input-page notices.

**Tech Stack:** Python 3.10+, FastAPI, unittest, DeepSeek OpenAI-compatible API, Next.js 14, React 18, TypeScript, Node test runner.

---

## File map

- Create `backend/content_router.py`: pure metadata precheck, routing prompt, enums, and normalization.
- Create `backend/test_content_router.py`: deterministic unit tests for scope boundaries and invalid outputs.
- Modify `backend/main.py`: call the router, conditionally inspect frames, and return accepted/rejected outcomes.
- Modify `backend/test_keyframe_pipeline.py`: verify ASR → route → optional visual flow.
- Modify `backend/test_single_video_pipeline.py`: verify stopped content never reaches claim extraction.
- Modify `frontend/types.ts`: add the accepted/rejected response union.
- Modify `frontend/lib/api.ts`: return the union for link and upload analysis.
- Modify `frontend/app/page.tsx`: branch on rejected outcomes and retain accepted behavior.
- Modify `frontend/components/InputPage.tsx`: render a neutral rejection notice with no override.
- Create `frontend/components/__tests__/single-analysis-routing.test.mjs`: frontend contract tests.

### Task 1: Build the pure content-routing boundary

**Files:**
- Create: `backend/content_router.py`
- Create: `backend/test_content_router.py`

- [ ] **Step 1: Write failing tests for metadata precheck and route normalization**

```python
import unittest

from backend.content_router import (
    ContentRoutingError,
    metadata_precheck,
    normalize_content_route,
)


class ContentRouterTests(unittest.TestCase):
    def test_metadata_precheck_stops_explicit_non_health_formats(self):
        result = metadata_precheck({
            "source": "tikhub",
            "title": "世界杯比赛集锦：最后一分钟绝杀",
            "description": "完整赛事回放",
        })
        self.assertEqual(result["scope"], "unrelated")
        self.assertEqual(result["decision"], "stop")

    def test_metadata_precheck_abstains_when_health_goal_is_present(self):
        result = metadata_precheck({
            "source": "tikhub",
            "title": "足球运动员膝盖伤病康复训练",
            "description": "三个恢复动作",
        })
        self.assertIsNone(result)

    def test_metadata_precheck_never_rejects_upload_filename(self):
        self.assertIsNone(metadata_precheck({
            "source": "upload",
            "title": "比赛集锦.mp4",
        }))

    def test_normalizes_implicit_guidance(self):
        result = normalize_content_route({
            "scope": "implicit_guidance",
            "decision": "continue",
            "need_visual": True,
            "reason": "围绕减脂展示饮食方案",
            "quotes": ["减脂期我每天这样吃"],
        }, source_text="减脂期我每天这样吃")
        self.assertEqual(result["scope"], "implicit_guidance")
        self.assertEqual(result["quotes"], ["减脂期我每天这样吃"])

    def test_rejects_invalid_scope_or_decision_pair(self):
        with self.assertRaises(ContentRoutingError):
            normalize_content_route({
                "scope": "unrelated",
                "decision": "continue",
                "need_visual": False,
                "reason": "冲突结果",
                "quotes": [],
            }, source_text="比赛集锦")

    def test_rejects_quote_that_is_not_in_the_input(self):
        with self.assertRaises(ContentRoutingError):
            normalize_content_route({
                "scope": "explicit_claim",
                "decision": "continue",
                "need_visual": False,
                "reason": "明确健康主张",
                "quotes": ["每天吃三个鸡蛋"],
            }, source_text="每天可以吃一个鸡蛋")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `python -m unittest backend.test_content_router -v`

Expected: ERROR because `backend.content_router` does not exist.

- [ ] **Step 3: Implement the pure router module**

Create `backend/content_router.py` with these complete public contracts:

```python
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
    "赛事直播", "比赛直播", "比赛集锦", "赛事集锦",
    "影视剪辑", "电影解说", "游戏实况", "旅游攻略", "搞笑段子",
)
HEALTH_HINTS = (
    "减脂", "减肥", "增肌", "训练", "饮食", "营养", "睡眠",
    "症状", "疾病", "治疗", "用药", "康复", "疼痛", "健康",
)


class ContentRoutingError(ValueError):
    pass


def metadata_precheck(media: dict[str, Any]) -> dict[str, Any] | None:
    if str(media.get("source") or "").lower() == "upload":
        return None
    text = " ".join(str(media.get(key) or "") for key in ("title", "description", "category"))
    if not text or not any(marker in text for marker in NON_HEALTH_FORMATS):
        return None
    if any(marker in text for marker in HEALTH_HINTS):
        return None
    return {
        "scope": "unrelated",
        "decision": "stop",
        "need_visual": False,
        "reason": "媒体信息明确指向非健康内容",
        "quotes": [str(media.get("title") or "").strip()][:1],
    }


def build_content_route_prompt(
    media: dict[str, Any],
    clean_text: str,
    keyframes: list[dict[str, Any]] | None = None,
) -> str:
    frames = "\n".join(
        f"[{item.get('time', 0)}秒] {item.get('screen_text', '')}"
        for item in (keyframes or []) if str(item.get("screen_text") or "").strip()
    ) or "无已解读画面"
    return f"""你是 FitProof 视频内容路由器。只根据给定标题、转写和画面，输出严格 JSON。

scope 只能是 explicit_claim、implicit_guidance、health_context_only、unrelated、pending_visual。
decision 只能是 continue、stop、inspect_visual。
明确健康主张和健康目标导向的可模仿方案继续；仅健康场景或完全无关停止。
“减脂期我每天这样吃”属于 implicit_guidance。普通生活记录不自动视为建议。
只有必须查看尚未解读的动作、食物、报告或图表才能判断时才使用 pending_visual/inspect_visual。
quotes 必须逐字来自输入，不得补写。

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
    need_visual = bool(data.get("need_visual"))
    if need_visual != (decision == "inspect_visual"):
        raise ContentRoutingError("画面判断与路由决定冲突")
    quotes = [str(item).strip() for item in data.get("quotes", []) if str(item).strip()]
    if any(quote not in source_text for quote in quotes):
        raise ContentRoutingError("内容路由引用了输入中不存在的原话")
    return {
        "scope": scope,
        "decision": decision,
        "need_visual": need_visual,
        "reason": str(data.get("reason") or "").strip()[:120],
        "quotes": quotes[:3],
    }
```

- [ ] **Step 4: Run the pure-router tests**

Run: `python -m unittest backend.test_content_router -v`

Expected: all six tests PASS.

- [ ] **Step 5: Commit the pure routing boundary**

```powershell
git add backend/content_router.py backend/test_content_router.py
git commit -m "feat: define health video content router"
```

### Task 2: Replace the keyframe boolean gate with structured routing

**Files:**
- Modify: `backend/main.py:994-1013,1061-1176`
- Modify: `backend/test_keyframe_pipeline.py:101-191`
- Modify: `backend/test_single_video_pipeline.py:204-241`

- [ ] **Step 1: Rewrite the gate tests to expect structured routes**

Replace the three `should_describe_keyframes` tests in `backend/test_single_video_pipeline.py` with tests for:

```python
def test_content_router_accepts_explicit_health_claim(self):
    from backend import main
    with patch.object(main, "llm_chat", return_value=json.dumps({
        "scope": "explicit_claim",
        "decision": "continue",
        "need_visual": False,
        "reason": "明确健康功效主张",
        "quotes": ["每天走路半小时有助于心血管健康"],
    }, ensure_ascii=False)):
        route = main.route_video_content(
            {"title": "走路科普"},
            "每天走路半小时有助于心血管健康。",
        )
    self.assertEqual(route["scope"], "explicit_claim")
    self.assertEqual(route["decision"], "continue")
    self.assertFalse(route["need_visual"])

def test_content_router_accepts_implicit_guidance(self):
    from backend import main
    with patch.object(main, "llm_chat", return_value=json.dumps({
        "scope": "implicit_guidance",
        "decision": "inspect_visual",
        "need_visual": True,
        "reason": "需查看具体食物",
        "quotes": ["减脂期我每天这样吃"],
    }, ensure_ascii=False)):
        route = main.route_video_content(
            {"title": "减脂饮食"},
            "减脂期我每天这样吃。",
        )
    self.assertEqual(route["scope"], "implicit_guidance")
    self.assertTrue(route["need_visual"])

def test_content_router_fails_closed_on_unparseable_response(self):
    from backend import main
    with patch.object(main, "llm_chat", return_value="无法判断"):
        with self.assertRaises(main.ContentRoutingError):
            main.route_video_content({"title": "视频"}, "普通口播文本")
```

- [ ] **Step 2: Run the rewritten tests and verify failure**

Run: `python -m unittest backend.test_single_video_pipeline -v`

Expected: FAIL because `route_video_content` is not defined.

- [ ] **Step 3: Add the main-module adapter**

Import the pure functions with the same package/script compatibility pattern used by the backend, then expose this adapter in `backend/main.py`:

```python
try:
    from .content_router import (
        ContentRoutingError,
        build_content_route_prompt,
        metadata_precheck,
        normalize_content_route,
    )
except ImportError:
    from content_router import (
        ContentRoutingError,
        build_content_route_prompt,
        metadata_precheck,
        normalize_content_route,
    )


def route_video_content(
    media: dict,
    clean_text: str,
    keyframes: list[dict] | None = None,
) -> dict:
    prompt = build_content_route_prompt(media, clean_text, keyframes)
    raw = llm_chat(prompt, max_tokens=512, json_mode=True, model=DEEPSEEK_FAST_MODEL)
    source_text = "\n".join([
        str(media.get("title") or ""),
        str(media.get("description") or ""),
        clean_text,
        *(str(item.get("screen_text") or "") for item in (keyframes or [])),
    ])
    return normalize_content_route(parse_json_loose(raw), source_text=source_text)
```

Remove `should_describe_keyframes`; it must have no remaining production callers.

- [ ] **Step 4: Integrate the route into `extract_one_video`**

Restructure `extract_one_video` so its `try/finally` still removes every `cleanup_path`, with this ordering:

```python
precheck = metadata_precheck(media)
if precheck:
    clean_text, segments, raw_text, keyframes, content_route = "", [], "", [], precheck
else:
    clean_text, segments, raw_text = run_audio_line()
    content_route = route_video_content(media, clean_text)
    keyframes = []
    if content_route["decision"] == "inspect_visual":
        keyframes = build_keyframes(need_visual=True)
        if not keyframes:
            raise ContentRoutingError("需要画面才能判断，但关键帧不可用")
        content_route = route_video_content(media, clean_text, keyframes)
        if content_route["decision"] == "inspect_visual":
            raise ContentRoutingError("画面解读后仍无法判断内容范围")
    elif content_route["decision"] == "continue":
        keyframes = build_keyframes(need_visual=False)
```

Change `build_keyframes` to accept `need_visual: bool` rather than calling a gate internally. Return the existing video fields plus:

```python
"content_route": content_route,
```

`build_keyframes(need_visual=False)` must retain the existing cover-only fast path: use `cover_url` without downloading the video, or sample one poster frame only when no cover exists. For a `stop` route, do not download video or describe frames.

- [ ] **Step 5: Update keyframe ordering tests**

In `backend/test_keyframe_pipeline.py`, patch `route_video_content` instead of `should_describe_keyframes`. Assert the event order for a visual case is:

```python
self.assertEqual(events, [
    "asr",
    ("route", "原始文本", False),
    "sample_keyframes",
    ("route", "原始文本", True),
])
```

Add a stopped-content case that asserts `sample_keyframes` and `_describe_frames_parallel` are not called.

- [ ] **Step 6: Run routing and keyframe tests**

Run:

```powershell
python -m unittest backend.test_content_router backend.test_keyframe_pipeline backend.test_single_video_pipeline -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit the pipeline integration**

```powershell
git add backend/main.py backend/test_keyframe_pipeline.py backend/test_single_video_pipeline.py
git commit -m "feat: route video scope before claim extraction"
```

### Task 3: Return accepted and rejected API outcomes

**Files:**
- Modify: `backend/main.py:1537-1557,2032-2123`
- Modify: `backend/test_single_video_pipeline.py`

- [ ] **Step 1: Write failing business-outcome tests**

Add tests that exercise a shared completion helper:

```python
def test_finish_single_analysis_rejects_unrelated_without_claim_extraction(self):
    from backend import main
    video = {
        "id": 1, "author": "作者", "title": "比赛集锦", "url": "https://example.test/v",
        "clean_text": "", "keyframes": [],
        "content_route": {
            "scope": "unrelated", "decision": "stop", "need_visual": False,
            "reason": "媒体信息明确指向非健康内容", "quotes": ["比赛集锦"],
        },
    }
    with patch.object(main, "extract_claims_from_video") as extract_claims:
        result = main.finish_single_analysis(video, "健康说法核验")
    extract_claims.assert_not_called()
    self.assertEqual(result["status"], "rejected")
    self.assertEqual(result["scope"], "unrelated")

def test_finish_single_analysis_accepts_health_video(self):
    from backend import main
    video = {
        "id": 1, "author": "作者", "title": "减脂饮食", "url": "https://example.test/v",
        "clean_text": "减脂期我每天这样吃", "keyframes": [],
        "content_route": {
            "scope": "implicit_guidance", "decision": "continue", "need_visual": False,
            "reason": "健康目标导向方案", "quotes": ["减脂期我每天这样吃"],
        },
    }
    accepted = {"reference": {}, "claims": [{"claim": "示例"}], "keyframes": []}
    with patch.object(main, "extract_claims_from_video", return_value=accepted):
        result = main.finish_single_analysis(video, "健康说法核验")
    self.assertEqual(result["status"], "accepted")
    self.assertEqual(result["scope"], "implicit_guidance")
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `python -m unittest backend.test_single_video_pipeline -v`

Expected: FAIL because `finish_single_analysis` does not exist.

- [ ] **Step 3: Extract reference construction and implement the helper**

Add to `backend/main.py`:

```python
def video_reference(video: dict) -> dict:
    return {
        "id": video.get("id", 1),
        "author": video.get("author", ""),
        "author_avatar_url": video.get("author_avatar_url"),
        "title": video.get("title", ""),
        "url": video.get("url", ""),
        "duration_seconds": video.get("duration_seconds"),
        "published_at": video.get("published_at"),
    }


def finish_single_analysis(video: dict, topic: str) -> dict:
    route = video.get("content_route") or {}
    if route.get("decision") == "stop":
        return {
            "status": "rejected",
            "scope": route.get("scope"),
            "reason": route.get("reason", ""),
            "matched_text": route.get("quotes") or [],
            "reference": video_reference(video),
        }
    if not video.get("clean_text"):
        raise HTTPException(status_code=502, detail="未能提取到视频文本内容")
    result = extract_claims_from_video(video, topic)
    result.update({"status": "accepted", "scope": route.get("scope"), "topic": topic})
    return result
```

Make `extract_claims_from_video` call `video_reference(video)` instead of constructing the same dictionary inline.

- [ ] **Step 4: Use the helper in both endpoints**

After `extract_one_video`, both `/api/analyze_single` and `/api/analyze_single_upload` must call:

```python
result = await asyncio.to_thread(finish_single_analysis, video, topic)
return result
```

Catch `ContentRoutingError` separately around both `extract_one_video` and `finish_single_analysis`, and return HTTP 503 with:

```python
detail="暂时无法判断视频是否属于核验范围，请重试"
```

Do not append the generic “AI 拆解主张失败” message to routing errors.

- [ ] **Step 5: Run backend regression tests**

Run: `python -m unittest discover -s backend -p "test_*.py" -v`

Expected: all backend tests PASS; rejected tests confirm claim extraction was not called.

- [ ] **Step 6: Commit API outcomes**

```powershell
git add backend/main.py backend/test_single_video_pipeline.py
git commit -m "feat: expose rejected video analysis outcomes"
```

### Task 4: Add the frontend discriminated union and neutral rejection state

**Files:**
- Create: `frontend/components/__tests__/single-analysis-routing.test.mjs`
- Modify: `frontend/types.ts:138-155`
- Modify: `frontend/lib/api.ts:1-49`
- Modify: `frontend/app/page.tsx:3-65,132-138`
- Modify: `frontend/components/InputPage.tsx:8-14,21-35,240-243`

- [ ] **Step 1: Write the failing frontend contract test**

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('single analysis handles rejected outcomes as neutral notices', async () => {
  const [types, api, page, input] = await Promise.all([
    read('types.ts'), read('lib/api.ts'), read('app/page.tsx'), read('components/InputPage.tsx'),
  ])
  assert.match(types, /SingleAnalyzeRejectedResponse/)
  assert.match(types, /status:\s*'accepted'/)
  assert.match(types, /status:\s*'rejected'/)
  assert.match(api, /Promise<SingleAnalyzeResult>/)
  assert.match(page, /data\.status === 'rejected'/)
  assert.match(page, /setInputNotice/)
  assert.match(input, /initialNotice/)
  assert.match(input, /bg-amber-50/)
  assert.doesNotMatch(input, /仍然分析/)
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test frontend/components/__tests__/single-analysis-routing.test.mjs`

Expected: FAIL because the response union and notice state do not exist.

- [ ] **Step 3: Define the response union**

Add to `frontend/types.ts`:

```ts
export type ContentScope =
  | 'explicit_claim'
  | 'implicit_guidance'
  | 'health_context_only'
  | 'unrelated'

export interface SingleAnalyzeAcceptedResponse extends SingleAnalyzeResponse {
  status: 'accepted'
  scope: Extract<ContentScope, 'explicit_claim' | 'implicit_guidance'>
}

export interface SingleAnalyzeRejectedResponse {
  status: 'rejected'
  scope: Extract<ContentScope, 'health_context_only' | 'unrelated'>
  reason: string
  matched_text: string[]
  reference: Omit<Reference, 'claim'> & { claim?: string }
}

export type SingleAnalyzeResult = SingleAnalyzeAcceptedResponse | SingleAnalyzeRejectedResponse
```

Keep `SingleAnalyzeResponse` and `SingleSampleData` unchanged so bundled sample JSON remains valid.

- [ ] **Step 4: Return the union from the API layer**

Import `SingleAnalyzeResult` and change both signatures in `frontend/lib/api.ts`:

```ts
export function analyzeSingle(link: string, topic: string): Promise<SingleAnalyzeResult> {
  return postJson<SingleAnalyzeResult>('/api/analyze_single', { link, topic })
}

export async function analyzeSingleUpload(file: File, topic: string): Promise<SingleAnalyzeResult> {
  // preserve existing FormData, fetch, and error handling
  return res.json() as Promise<SingleAnalyzeResult>
}
```

- [ ] **Step 5: Branch rejected outcomes before setting result data**

In `frontend/app/page.tsx`, add:

```tsx
type InputNotice = { title: string; message: string }
const [inputNotice, setInputNotice] = useState<InputNotice | null>(null)

function rejectionNotice(data: SingleAnalyzeRejectedResponse): InputNotice {
  return data.scope === 'health_context_only'
    ? {
        title: '没有识别到可核验的健康内容',
        message: '视频涉及健康场景，但没有识别到明确健康主张或可模仿方案。',
      }
    : {
        title: '不属于健康信息核验范围',
        message: '这段视频不属于健康信息核验范围，FitProof 暂不进行分析。',
      }
}
```

At the start of both analysis handlers call `setInputNotice(null)`. Immediately after each API response:

```tsx
if (data.status === 'rejected') {
  setInputNotice(rejectionNotice(data))
  setPageState('input')
  return
}
```

Only the accepted branch calls `setSingleData`, reads `data.topic`, and enters `singleClaims`. Pass `initialNotice={inputNotice}` to `InputPage`.

- [ ] **Step 6: Render the neutral notice**

Extend `InputPageProps`:

```ts
initialNotice?: { title: string; message: string } | null
```

Destructure it and render before the red technical error block:

```tsx
{initialNotice && (
  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950" role="status">
    <p className="text-sm font-semibold">{initialNotice.title}</p>
    <p className="mt-1 text-sm leading-relaxed text-amber-800">{initialNotice.message}</p>
    <p className="mt-2 text-xs text-amber-700">请重新选择视频或粘贴其他链接。</p>
  </div>
)}
```

Do not add an override button.

- [ ] **Step 7: Run frontend tests and type/build checks**

Run:

```powershell
node --test frontend/components/__tests__/*.test.mjs
Set-Location frontend
npm run build
```

Expected: all Node tests PASS and Next.js build exits 0 with no TypeScript errors.

- [ ] **Step 8: Commit the frontend outcome handling**

```powershell
git add frontend/types.ts frontend/lib/api.ts frontend/app/page.tsx frontend/components/InputPage.tsx frontend/components/__tests__/single-analysis-routing.test.mjs
git commit -m "feat: show neutral notices for rejected videos"
```

### Task 5: Full routing verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all backend tests**

Run: `python -m unittest discover -s backend -p "test_*.py" -v`

Expected: all tests PASS.

- [ ] **Step 2: Run all frontend tests and production build**

Run:

```powershell
node --test frontend/components/__tests__/*.test.mjs
Set-Location frontend
npm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 3: Exercise the five acceptance fixtures with mocked model output**

Verify these routes through automated tests or a local backend request with the LLM call patched:

```text
每天吃两个鸡蛋不会升高胆固醇 → explicit_claim / accepted
减脂期我每天这样吃 → implicit_guidance / accepted
今天来健身房打卡 → health_context_only / rejected
今天这场足球比赛太精彩了 → unrelated / rejected
大家看我这个动作 → inspect visual, then a final non-pending route
```

Expected: rejected fixtures never call `extract_claims_from_video`.

- [ ] **Step 4: Confirm no override path exists and inspect the worktree**

Run:

```powershell
rg -n "仍然分析|强制继续" frontend backend
git status --short
```

Expected: no production override copy or handler; only pre-existing unrelated user changes may remain unstaged.
