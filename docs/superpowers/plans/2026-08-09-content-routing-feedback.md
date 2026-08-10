# Content Routing Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject invalid Douyin URLs before media work, stop clearly unrelated videos from metadata before ASR, and show successful scope rejections in an accessible centered modal.

**Architecture:** Add pure, independently tested URL and metadata-routing helpers, then connect them at the FastAPI boundary and immediately after platform metadata retrieval. Keep the existing transcript/visual router as the deep second level. On the frontend, validate extracted URLs before loading and replace the inline rejection notice with one focused modal component.

**Tech Stack:** Python 3, FastAPI, unittest, Next.js 14, React 18, TypeScript/JavaScript, Node test runner, Tailwind CSS.

---

## File map

- Create `backend/douyin_links.py`: extract and validate supported Douyin video URLs without network access.
- Create `backend/test_douyin_links.py`: pure URL parser coverage.
- Modify `backend/content_router.py`: metadata prompt and strict fail-open normalization.
- Modify `backend/test_content_router.py`: metadata router contract coverage.
- Modify `backend/main.py`: API URL guard, fast metadata LLM call, and pipeline ordering.
- Modify `backend/test_keyframe_pipeline.py`: prove metadata rejection occurs before ASR and visual work.
- Create `frontend/lib/douyinLink.mjs`: browser-side URL extraction/validation.
- Create `frontend/lib/douyinLink.d.ts`: typed contract for TypeScript consumers.
- Create `frontend/lib/__tests__/douyin-link.test.mjs`: real frontend URL parsing tests.
- Create `frontend/components/ContentRejectionModal.tsx`: accessible centered rejection result.
- Modify `frontend/components/InputPage.tsx`: validate before submit and show a field-level error.
- Modify `frontend/app/page.tsx`: hold rejected result and render the modal.
- Modify `frontend/components/__tests__/single-analysis-routing.test.mjs`: modal integration source contract.

### Task 1: Backend Douyin video URL validation

**Files:**
- Create: `backend/douyin_links.py`
- Create: `backend/test_douyin_links.py`

- [ ] **Step 1: Write failing parser tests**

```python
import unittest

from backend.douyin_links import extract_douyin_video_url


class DouyinLinkTests(unittest.TestCase):
    def test_extracts_short_link_from_share_text(self):
        text = "复制打开抖音 https://v.douyin.com/Dn8_yKgnK2Q/ 立即观看"
        self.assertEqual(extract_douyin_video_url(text), "https://v.douyin.com/Dn8_yKgnK2Q/")

    def test_accepts_canonical_video_url(self):
        url = "https://www.douyin.com/video/7531234567890123456"
        self.assertEqual(extract_douyin_video_url(url), url)

    def test_rejects_home_and_recommendation_pages(self):
        self.assertIsNone(extract_douyin_video_url("https://www.douyin.com/?recommend=1"))
        self.assertIsNone(extract_douyin_video_url("https://www.douyin.com/"))
```

- [ ] **Step 2: Run the test and verify RED**

Run: `python -m unittest discover -s backend -p "test_douyin_links.py" -v`

Expected: FAIL because `backend.douyin_links` does not exist.

- [ ] **Step 3: Implement the pure parser**

```python
import re
from urllib.parse import urlsplit, urlunsplit

URL_PATTERN = re.compile(r'https?://[^\s"\'<>，。！？、；）】]+', re.IGNORECASE)


def extract_douyin_video_url(text: str) -> str | None:
    for raw in URL_PATTERN.findall(text or ""):
        candidate = raw.rstrip(".,;:!?)]}")
        parsed = urlsplit(candidate)
        host = (parsed.hostname or "").lower()
        path = parsed.path or "/"
        if host == "v.douyin.com" and path.strip("/"):
            return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))
        if host in {"douyin.com", "www.douyin.com"} and re.fullmatch(r"/video/\d+/?", path):
            return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))
        if host in {"iesdouyin.com", "www.iesdouyin.com"} and re.fullmatch(r"/share/video/\d+/?", path):
            return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))
    return None
```

- [ ] **Step 4: Run the parser tests and verify GREEN**

Run: `python -m unittest discover -s backend -p "test_douyin_links.py" -v`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/douyin_links.py backend/test_douyin_links.py
git commit -m "feat: validate Douyin video links"
```

### Task 2: Guard the API before media fetching

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/test_single_video_pipeline.py`

- [ ] **Step 1: Write failing endpoint-boundary tests**

Add tests for a pure guard used by the endpoint:

```python
def test_require_douyin_video_link_rejects_recommendation_page(self):
    from backend import main
    with self.assertRaises(main.HTTPException) as raised:
        main.require_douyin_video_link("https://www.douyin.com/?recommend=1")
    self.assertEqual(raised.exception.status_code, 400)
    self.assertIn("不是具体的抖音视频链接", raised.exception.detail)

def test_require_douyin_video_link_extracts_share_text(self):
    from backend import main
    result = main.require_douyin_video_link("文案 https://v.douyin.com/Dn8_yKgnK2Q/ 复制打开")
    self.assertEqual(result, "https://v.douyin.com/Dn8_yKgnK2Q/")
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `python -m unittest discover -s backend -p "test_single_video_pipeline.py" -v`

Expected: FAIL because `require_douyin_video_link` is missing.

- [ ] **Step 3: Add the guard and call it before `extract_one_video`**

```python
try:
    from douyin_links import extract_douyin_video_url
except ImportError:
    from backend.douyin_links import extract_douyin_video_url


def require_douyin_video_link(value: str) -> str:
    link = extract_douyin_video_url(value)
    if not link:
        raise HTTPException(
            status_code=400,
            detail="这不是具体的抖音视频链接，请粘贴视频分享链接或 /video/数字ID 地址",
        )
    return link
```

At the start of `analyze_single`, replace the empty-only check with:

```python
link = require_douyin_video_link(req.link)
video = await asyncio.to_thread(extract_one_video, 1, link)
```

- [ ] **Step 4: Run the focused and complete backend suites**

Run: `python -m unittest discover -s backend -p "test_single_video_pipeline.py" -v`

Expected: focused suite PASS.

Run: `python -m unittest discover -s backend -p "test_*.py" -v`

Expected: complete backend suite PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/main.py backend/test_single_video_pipeline.py
git commit -m "fix: reject non-video Douyin URLs"
```

### Task 3: Fast metadata model router

**Files:**
- Modify: `backend/content_router.py`
- Modify: `backend/test_content_router.py`

- [ ] **Step 1: Write failing normalization tests**

```python
def test_metadata_route_stops_grounded_high_confidence_unrelated_content(self):
    result = normalize_metadata_route({
        "decision": "stop",
        "scope": "unrelated",
        "confidence": "high",
        "reason": "网站开发教程",
        "quotes": ["如何 Vibe Coding 一个有设计感的个人网站"],
    }, "如何 Vibe Coding 一个有设计感的个人网站")
    self.assertEqual(result["decision"], "stop")

def test_metadata_route_continues_when_health_or_uncertain(self):
    result = normalize_metadata_route({
        "decision": "continue_deep",
        "scope": "potential_health",
        "confidence": "medium",
        "reason": "涉及减脂饮食",
        "quotes": ["减脂期我每天这样吃"],
    }, "减脂期我每天这样吃")
    self.assertIsNone(result)

def test_metadata_route_rejects_ungrounded_stop(self):
    with self.assertRaises(ContentRoutingError):
        normalize_metadata_route({
            "decision": "stop", "scope": "unrelated", "confidence": "high",
            "reason": "编程教程", "quotes": ["输入中没有的文字"],
        }, "个人网站教程")
```

- [ ] **Step 2: Run and verify RED**

Run: `python -m unittest discover -s backend -p "test_content_router.py" -v`

Expected: FAIL because the metadata prompt and normalizer are missing.

- [ ] **Step 3: Add strict prompt and normalizer**

```python
def build_metadata_route_prompt(media: dict[str, Any]) -> str:
    return f"""你是 FitProof 一级内容门卫，只看元信息判断是否明确与健康信息核验无关。
只有标题或描述明确属于编程、网站设计、影视、游戏、旅游、娱乐、赛事等非健康主题时，才返回 stop/unrelated/high。
健康相关或任何不确定情况必须返回 continue_deep。不得根据作者昵称猜测。
quotes 必须逐字来自标题、描述或分类。

标题：{media.get('title', '')}
描述：{media.get('description', '')}
分类：{media.get('category', '')}

输出严格 JSON：
{{"decision":"continue_deep","scope":"uncertain","confidence":"low","reason":"信息不足","quotes":[]}}"""


def normalize_metadata_route(data: Any, source_text: str) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        raise ContentRoutingError("元信息路由返回不是对象")
    decision = data.get("decision")
    scope = data.get("scope")
    confidence = data.get("confidence")
    quotes = data.get("quotes", [])
    if decision not in {"stop", "continue_deep"} or confidence not in {"low", "medium", "high"}:
        raise ContentRoutingError("元信息路由枚举非法")
    if not isinstance(quotes, list):
        raise ContentRoutingError("元信息引用格式非法")
    grounded = [str(item).strip() for item in quotes if str(item).strip()]
    if any(item not in source_text for item in grounded):
        raise ContentRoutingError("元信息路由引用不落地")
    if decision == "continue_deep":
        return None
    if scope != "unrelated" or confidence != "high" or not grounded:
        raise ContentRoutingError("元信息停止条件不足")
    return {
        "scope": "unrelated", "decision": "stop", "need_visual": False,
        "reason": str(data.get("reason") or "明确为非健康内容")[:120],
        "quotes": grounded[:3],
    }
```

- [ ] **Step 4: Run and verify GREEN**

Run: `python -m unittest discover -s backend -p "test_content_router.py" -v`

Expected: metadata and existing deep-router tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/content_router.py backend/test_content_router.py
git commit -m "feat: define fast metadata content router"
```

### Task 4: Run metadata routing before ASR

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/test_keyframe_pipeline.py`
- Modify: other `extract_one_video` tests that patch external calls.

- [ ] **Step 1: Write failing pipeline tests**

```python
def test_extract_one_video_stops_from_metadata_before_asr(self):
    from backend import main
    media = {
        "source": "tikhub", "title": "Vibe Coding 个人网站", "author": "作者",
        "audio_url": "https://audio.test/file", "cleanup_paths": [],
    }
    stopped = {
        "scope": "unrelated", "decision": "stop", "need_visual": False,
        "reason": "网站开发教程", "quotes": ["Vibe Coding 个人网站"],
    }
    with patch.object(main, "route_video_metadata", return_value=stopped), \
         patch.object(main, "transcribe") as transcribe, \
         patch.object(main, "route_video_content") as deep_route:
        result = main.extract_one_video(1, "", media)
    transcribe.assert_not_called()
    deep_route.assert_not_called()
    self.assertEqual(result["content_route"], stopped)
```

Add a second test where `route_video_metadata` returns `None` and assert ASR and `route_video_content` still run.

- [ ] **Step 2: Run and verify RED**

Run: `python -m unittest discover -s backend -p "test_keyframe_pipeline.py" -v`

Expected: FAIL because `route_video_metadata` is missing and `metadata_precheck` is still called directly.

- [ ] **Step 3: Add fail-open metadata orchestration**

```python
def route_video_metadata(media: dict) -> dict | None:
    deterministic = metadata_precheck(media)
    if deterministic is not None:
        return deterministic
    if str(media.get("source") or "").lower() == "upload":
        return None
    source_text = "\n".join(str(media.get(key) or "") for key in ("title", "description", "category"))
    if not source_text.strip():
        return None
    try:
        raw = llm_chat(
            build_metadata_route_prompt(media),
            max_tokens=256,
            json_mode=True,
            model=DEEPSEEK_FAST_MODEL,
        )
        return normalize_metadata_route(parse_json_loose(raw), source_text)
    except Exception as exc:
        print(f"[metadata-route] 无法可靠提前判断，进入深度路由: {str(exc)[:160]}")
        return None
```

In `extract_one_video`, replace `metadata_precheck(media)` with `route_video_metadata(media)` before `run_audio_line()`.

- [ ] **Step 4: Run focused and complete backend suites**

Run: `python -m unittest discover -s backend -p "test_keyframe_pipeline.py" -v`

Expected: focused suite PASS.

Run: `python -m unittest discover -s backend -p "test_*.py" -v`

Expected: all backend tests PASS without live LLM calls.

- [ ] **Step 5: Commit**

```powershell
git add backend/main.py backend/test_keyframe_pipeline.py backend/test_asr_provider.py backend/test_media_fetcher.py
git commit -m "feat: route metadata before transcript extraction"
```

### Task 5: Frontend URL guard and centered rejection modal

**Files:**
- Create: `frontend/lib/douyinLink.mjs`
- Create: `frontend/lib/douyinLink.d.ts`
- Create: `frontend/lib/__tests__/douyin-link.test.mjs`
- Create: `frontend/components/ContentRejectionModal.tsx`
- Modify: `frontend/components/InputPage.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/components/__tests__/single-analysis-routing.test.mjs`

- [ ] **Step 1: Write failing real parser and source-contract tests**

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'
import { extractDouyinVideoLink } from '../douyinLink.mjs'

test('extracts a valid short video link from share text', () => {
  assert.equal(
    extractDouyinVideoLink('文案 https://v.douyin.com/Dn8_yKgnK2Q/ 复制打开'),
    'https://v.douyin.com/Dn8_yKgnK2Q/',
  )
})

test('rejects the Douyin recommendation page', () => {
  assert.equal(extractDouyinVideoLink('https://www.douyin.com/?recommend=1'), '')
})
```

Update `single-analysis-routing.test.mjs` to require `ContentRejectionModal`, `role="dialog"`, `aria-modal="true"`, `换一个视频`, and to reject the old `initialNotice` integration.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --test lib/__tests__/douyin-link.test.mjs components/__tests__/single-analysis-routing.test.mjs
```

Expected: FAIL because parser and modal do not exist and the page still uses `initialNotice`.

- [ ] **Step 3: Implement frontend URL extraction**

```javascript
const URL_PATTERN = /https?:\/\/[^\s"'<>，。！？、；）】]+/gi

export function extractDouyinVideoLink(text) {
  for (const raw of String(text || '').match(URL_PATTERN) || []) {
    const candidate = raw.replace(/[.,;:!?\)\]\}]+$/g, '')
    let parsed
    try { parsed = new URL(candidate) } catch { continue }
    const host = parsed.hostname.toLowerCase()
    if (host === 'v.douyin.com' && parsed.pathname.replaceAll('/', '')) return candidate
    if ((host === 'douyin.com' || host === 'www.douyin.com') && /^\/video\/\d+\/?$/.test(parsed.pathname)) return candidate
    if ((host === 'iesdouyin.com' || host === 'www.iesdouyin.com') && /^\/share\/video\/\d+\/?$/.test(parsed.pathname)) return candidate
  }
  return ''
}
```

In `InputPage`, replace `findDouyinLink` with the shared parser. If no valid video URL exists, set a dedicated field error to:

```text
这不是具体的抖音视频链接，请粘贴视频分享链接或 /video/数字ID 地址
```

Return before setting submitting state or invoking `onAnalyzeSingle`.

- [ ] **Step 4: Implement modal and replace inline notice state**

Modal contract:

```tsx
interface ContentRejectionModalProps {
  result: SingleAnalyzeRejectedResponse
  onClose: () => void
}

export default function ContentRejectionModal({ result, onClose }: ContentRejectionModalProps) {
  const unrelated = result.scope === 'unrelated'
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/35 px-5" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="content-rejection-title" className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center shadow-2xl">
        <h2 id="content-rejection-title">{unrelated ? '暂不支持分析这段视频' : '这段视频暂无可核验的健康说法'}</h2>
        <p>{result.reason}</p>
        {result.matched_text[0] && <blockquote>“{result.matched_text[0]}”</blockquote>}
        <button type="button" autoFocus onClick={onClose}>换一个视频</button>
      </section>
    </div>
  )
}
```

Add an Escape-key effect inside the component. In `Home`, replace `inputNotice` with:

```tsx
const [rejection, setRejection] = useState<SingleAnalyzeRejectedResponse | null>(null)
```

When API data is rejected, set the result and return to `input`. Render the modal after the app shell and clear it with `setRejection(null)`. Remove `initialNotice` from `InputPage`.

- [ ] **Step 5: Run focused tests, all frontend tests, build, and mobile geometry**

Run focused tests:

```powershell
node --test lib/__tests__/douyin-link.test.mjs components/__tests__/single-analysis-routing.test.mjs
```

Expected: focused tests PASS.

Run all tests:

```powershell
$tests = Get-ChildItem -Path . -Recurse -Filter *.test.mjs | Where-Object { $_.FullName -notlike '*\node_modules\*' } | ForEach-Object { $_.FullName }; node --test $tests
```

Expected: all frontend tests PASS.

Run: `npm run build`

Expected: Next.js production build succeeds.

Run: `npm run test:mobile-layout`

Expected: 320x568, 360x640, 390x844, 430x932, and 844x390 all report `ok`.

- [ ] **Step 6: Commit**

```powershell
git add frontend/lib/douyinLink.mjs frontend/lib/douyinLink.d.ts frontend/lib/__tests__/douyin-link.test.mjs frontend/components/ContentRejectionModal.tsx frontend/components/InputPage.tsx frontend/app/page.tsx frontend/components/__tests__/single-analysis-routing.test.mjs
git commit -m "feat: clarify invalid and unsupported video feedback"
```

### Task 6: Final verification and live smoke test

**Files:**
- Verify only; no planned production changes.

- [ ] **Step 1: Run final backend suite**

Run: `python -m unittest discover -s backend -p "test_*.py" -v`

Expected: all backend tests PASS.

- [ ] **Step 2: Run final frontend suite and production build**

Run the complete Node test command from Task 5, then `npm run build`.

Expected: zero test failures and successful build.

- [ ] **Step 3: Run mobile geometry test**

Run: `npm run test:mobile-layout`

Expected: all five viewport cases report `ok`.

- [ ] **Step 4: Smoke-test the two reported cases**

With local frontend and backend running:

1. Submit `https://www.douyin.com/?recommend=1`; verify field-level validation appears immediately and the loading page does not open.
2. Stub or use an unrelated rejected result; verify the centered modal appears with no force-continue action.
3. Submit a valid `v.douyin.com/<id>/` URL; verify the request reaches the backend.

- [ ] **Step 5: Inspect final repository state**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only the user's pre-existing unrelated working-tree changes remain outside the feature commits.
