# Mobile Viewport Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FitProof input page responsive to real mobile viewport height while keeping the primary analysis action visible on ordinary phones and clear of the fixed bottom navigation.

**Architecture:** Define viewport and bottom-inset values once at the application shell, consume them in the fixed navigation and page content, and add semantic CSS hooks for height-based density changes in `InputPage`. Verify structural contracts with Node tests and actual geometry with a Playwright viewport script.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, CSS media queries, Node test runner, Playwright Chromium.

---

## File map

- Modify `frontend/app/layout.tsx`: export the mobile viewport configuration.
- Modify `frontend/app/globals.css`: own shared navigation/safe-area variables and height-density rules.
- Modify `frontend/app/page.tsx`: reserve the exact application bottom inset.
- Modify `frontend/components/BottomNav.tsx`: consume the shared height and safe-area variables.
- Modify `frontend/components/InputPage.tsx`: remove nested `100vh` sizing and add semantic density hooks.
- Create `frontend/components/__tests__/mobile-viewport-layout.test.mjs`: source-level layout contract tests.
- Create `frontend/scripts/check-mobile-layout.mjs`: geometry checks across required phone viewports.
- Modify `frontend/package.json`: expose the mobile geometry check command.

### Task 1: Lock the viewport and safe-area contract with a failing test

**Files:**
- Create: `frontend/components/__tests__/mobile-viewport-layout.test.mjs`

- [ ] **Step 1: Write the failing source contract test**

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('mobile shell uses one dynamic viewport and one shared bottom inset', async () => {
  const [layout, page, nav, input, css] = await Promise.all([
    read('app/layout.tsx'),
    read('app/page.tsx'),
    read('components/BottomNav.tsx'),
    read('components/InputPage.tsx'),
    read('app/globals.css'),
  ])

  assert.match(layout, /export const viewport/)
  assert.match(layout, /viewportFit:\s*['"]cover['"]/)
  assert.match(css, /--bottom-nav-height:\s*54px/)
  assert.match(css, /--bottom-app-inset:/)
  assert.match(page, /pb-\[var\(--bottom-app-inset\)\]/)
  assert.match(nav, /h-\[var\(--bottom-nav-height\)\]/)
  assert.match(nav, /pb-\[var\(--bottom-safe-area\)\]/)
  assert.doesNotMatch(input, /min-h-screen/)
  assert.doesNotMatch(input, /100vh/)
  assert.match(input, /fitproof-input-page/)
  assert.match(css, /@media \(max-height: 779px\) and \(max-width: 639px\)/)
  assert.match(css, /@media \(max-height: 639px\) and \(max-width: 639px\)/)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test frontend/components/__tests__/mobile-viewport-layout.test.mjs`

Expected: FAIL because `viewport`, shared CSS variables, and semantic input-page hooks do not yet exist.

- [ ] **Step 3: Commit the failing test**

```powershell
git add frontend/components/__tests__/mobile-viewport-layout.test.mjs
git commit -m "test: define mobile viewport layout contract"
```

### Task 2: Establish one application viewport and bottom inset

**Files:**
- Modify: `frontend/app/layout.tsx:1-12`
- Modify: `frontend/app/globals.css:5-11`
- Modify: `frontend/app/page.tsx:140-147`
- Modify: `frontend/components/BottomNav.tsx:35-39`

- [ ] **Step 1: Export an accessible edge-to-edge viewport**

Replace the type import and add the viewport export in `frontend/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
```

Do not set `maximumScale` or `userScalable`; browser zoom must remain available.

- [ ] **Step 2: Define shared bottom measurements**

Add this at the start of `frontend/app/globals.css`, after the Tailwind directives:

```css
:root {
  --bottom-nav-height: 54px;
  --bottom-safe-area: env(safe-area-inset-bottom, 0px);
  --bottom-app-inset: calc(var(--bottom-nav-height) + var(--bottom-safe-area));
}

html,
body {
  min-height: 100%;
  overflow-x: clip;
}
```

Keep the existing padding, margin, font-family, and font-smoothing declarations in the same `html, body` rule.

- [ ] **Step 3: Make page content reserve the shared inset**

Replace the wrapper in `frontend/app/page.tsx` with:

```tsx
<div className="min-h-screen min-h-[100dvh] bg-white">
  <div className="pb-[var(--bottom-app-inset)]">
    {activeTab === 'verify' ? renderVerifyContent()
      : activeTab === 'knowledge' ? <KnowledgeTab />
      : <ProfileTab />}
  </div>
  <BottomNav activeTab={activeTab} onChange={setActiveTab} />
</div>
```

- [ ] **Step 4: Make the navigation consume the same variables**

Replace the opening navigation elements in `frontend/components/BottomNav.tsx` with:

```tsx
<nav
  className="fixed inset-x-0 bottom-0 z-50 border-t border-[#D8F0EC] bg-white pb-[var(--bottom-safe-area)]"
  aria-label="主导航"
>
  <div className="mx-auto grid h-[var(--bottom-nav-height)] max-w-lg grid-cols-3">
```

- [ ] **Step 5: Run the focused contract test**

Run: `node --test frontend/components/__tests__/mobile-viewport-layout.test.mjs`

Expected: still FAIL only on the missing `InputPage` hooks and height media queries.

- [ ] **Step 6: Commit the application-shell change**

```powershell
git add frontend/app/layout.tsx frontend/app/globals.css frontend/app/page.tsx frontend/components/BottomNav.tsx
git commit -m "fix: unify mobile viewport and safe area"
```

### Task 3: Add height-responsive density to the input page

**Files:**
- Modify: `frontend/components/InputPage.tsx:128-245`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Replace nested viewport sizing with semantic hooks**

Apply these class changes in `InputPage.tsx` while preserving the existing content and event handlers:

```tsx
<main className="fitproof-input-page bg-[#f7fffd] px-4 py-4 text-slate-950 sm:px-5 sm:py-8">
  <div className="fitproof-input-shell mx-auto flex max-w-2xl flex-col justify-start sm:justify-center">
    <div className="fitproof-input-badge mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[#20CDB6]/25 bg-white px-3 py-1.5 text-xs font-medium text-[#0B6E63] shadow-sm sm:mb-5">
```

Add `fitproof-input-brand-card` to the brand `<section>`, `fitproof-input-tagline` to the tagline, `fitproof-input-description` to the explanatory paragraph, `fitproof-input-features` to the three-feature row, and `fitproof-input-form-card` to the input `<section>`.

Change the action grid to:

```tsx
<div className="fitproof-input-actions grid grid-cols-1 gap-2 min-[350px]:grid-cols-2">
```

The primary and sample buttons retain their existing labels, handlers, and minimum touch height.

- [ ] **Step 2: Add the dynamic shell and ordinary-phone density rules**

Append to `frontend/app/globals.css`:

```css
.fitproof-input-page {
  min-height: calc(100dvh - var(--bottom-app-inset));
}

.fitproof-input-shell {
  min-height: calc(100dvh - var(--bottom-app-inset) - 2rem);
}

@media (max-height: 779px) and (max-width: 639px) {
  .fitproof-input-page { padding-top: 0.75rem; padding-bottom: 0.75rem; }
  .fitproof-input-shell { min-height: calc(100dvh - var(--bottom-app-inset) - 1.5rem); }
  .fitproof-input-badge { margin-bottom: 0.5rem; }
  .fitproof-input-brand-card { padding: 1rem; border-radius: 1.5rem; }
  .fitproof-input-tagline { margin-top: 0.5rem; }
  .fitproof-input-description { margin-top: 0.5rem; line-height: 1.5; }
  .fitproof-input-features { margin-top: 0.75rem; }
  .fitproof-input-form-card { margin-top: 0.5rem; padding: 0.75rem; }
}

@media (max-height: 639px) and (max-width: 639px) {
  .fitproof-input-page { padding-top: 0.5rem; padding-bottom: 0.5rem; }
  .fitproof-input-shell { min-height: auto; }
  .fitproof-input-badge { margin-bottom: 0.375rem; }
  .fitproof-input-brand-card { padding: 0.75rem; border-radius: 1.25rem; }
  .fitproof-input-tagline { display: inline; margin-left: 0.5rem; font-size: 1rem; }
  .fitproof-input-description { margin-top: 0.375rem; font-size: 0.8125rem; }
  .fitproof-input-features { margin-top: 0.5rem; }
  .fitproof-input-form-card { margin-top: 0.375rem; padding: 0.625rem; border-radius: 1.25rem; }
}
```

Do not reduce input/button text below the existing sizes. If a 320px-wide action label wraps, allow the page to grow rather than clipping it.

- [ ] **Step 3: Run the contract and existing frontend tests**

Run: `node --test frontend/components/__tests__/mobile-viewport-layout.test.mjs frontend/components/__tests__/*.test.mjs`

Expected: PASS for the new contract and all existing component tests.

- [ ] **Step 4: Commit the responsive input layout**

```powershell
git add frontend/components/InputPage.tsx frontend/app/globals.css
git commit -m "fix: adapt input layout to short mobile screens"
```

### Task 4: Add automated viewport geometry checks

**Files:**
- Create: `frontend/scripts/check-mobile-layout.mjs`
- Modify: `frontend/package.json`

- [ ] **Step 1: Create the Playwright checker**

```js
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseURL = process.env.FITPROOF_URL || 'http://127.0.0.1:3000'
const cases = [
  { name: 'small', width: 320, height: 568, requireCtaInView: false },
  { name: 'ordinary', width: 360, height: 640, requireCtaInView: true },
  { name: 'iphone', width: 390, height: 844, requireCtaInView: true },
  { name: 'large', width: 430, height: 932, requireCtaInView: true },
  { name: 'landscape', width: 844, height: 390, requireCtaInView: false },
]

const browser = await chromium.launch({ headless: true })
try {
  for (const entry of cases) {
    const page = await browser.newPage({ viewport: { width: entry.width, height: entry.height } })
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    const geometry = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.textContent?.includes('分析单视频'))
      const nav = document.querySelector('nav[aria-label="主导航"]')
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        button: button?.getBoundingClientRect().toJSON(),
        navTop: nav?.getBoundingClientRect().top,
      }
    })
    assert.ok(geometry.scrollWidth <= geometry.clientWidth, `${entry.name}: horizontal overflow`)
    assert.ok(geometry.button, `${entry.name}: analysis button missing`)
    if (entry.requireCtaInView) {
      assert.ok(geometry.button.bottom <= geometry.navTop, `${entry.name}: CTA is below or behind nav`)
    }
    await page.close()
  }
} finally {
  await browser.close()
}
```

- [ ] **Step 2: Add the package script**

Add to `frontend/package.json` scripts:

```json
"test:mobile-layout": "node scripts/check-mobile-layout.mjs"
```

- [ ] **Step 3: Run the geometry check against a local production build**

Terminal A:

```powershell
Set-Location frontend
npm run build
npm run start
```

Terminal B:

```powershell
Set-Location frontend
npm run test:mobile-layout
```

Expected: command exits 0 with no assertion errors for all five viewports.

- [ ] **Step 4: Commit the geometry checker**

```powershell
git add frontend/scripts/check-mobile-layout.mjs frontend/package.json
git commit -m "test: verify FitProof mobile viewport geometry"
```

### Task 5: Final mobile-layout verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all component tests and the production build**

Run:

```powershell
node --test frontend/components/__tests__/*.test.mjs
Set-Location frontend
npm run build
```

Expected: all Node tests PASS and Next.js build exits 0.

- [ ] **Step 2: Perform real-device checks**

Open the deployed or LAN-accessible build on one iOS Safari device and one Android Chrome device. Confirm address-bar expansion/collapse, keyboard opening, increased system text, portrait, and landscape do not create horizontal scrolling or bottom-nav overlap. Record device/browser versions and any exceptions in the implementation handoff.

- [ ] **Step 3: Confirm the worktree contains only intended mobile-layout changes**

Run: `git status --short`

Expected: no uncommitted files from this plan; pre-existing unrelated user changes may remain unstaged.
