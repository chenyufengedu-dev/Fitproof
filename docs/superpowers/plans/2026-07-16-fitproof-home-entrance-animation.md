# FitProof Home Entrance Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stable, accessible 1.2-second FitProof homepage entrance animation with a Skottie-verified cat and question-mark accent.

**Architecture:** A client component renders semantic HTML text and observes its own visibility once. CSS owns text masking and reduced-motion fallbacks. A transparent Lottie scene owns only the decorative cat/question motion and is loaded by a focused Skottie canvas wrapper.

**Tech Stack:** Next.js 14, React 18, TypeScript, CSS, Lottie JSON, Skia Skottie.

---

### Task 1: Define and verify the transparent Lottie accent

**Files:**
- Create: `frontend/public/projects/fitproof-home-entrance/scene-1/lottie.json`
- Create: `frontend/public/projects/fitproof-home-entrance/scene-1/controls.json`

- [ ] **Step 1: Write the failing scene-contract check**

Create `frontend/scripts/check-home-entrance-lottie.mjs` with checks that the scene has transparent dimensions, a 36 fps / 43 frame timeline, and named `cat` and `question` layers.

- [ ] **Step 2: Run the check to verify it fails**

Run: `node frontend/scripts/check-home-entrance-lottie.mjs`

Expected: `ENOENT` for `lottie.json`.

- [ ] **Step 3: Create the Lottie scene and controls**

Author a transparent 240×220 Bodymovin composition where the question rises and settles in frames 8–20 and the cat makes one 5° tilt/lift in frames 14–36; no text, blur, glow, or looping layers.

- [ ] **Step 4: Run the scene-contract check again**

Run: `node frontend/scripts/check-home-entrance-lottie.mjs`

Expected: `Lottie scene contract passed`.

- [ ] **Step 5: Verify in the official Skottie player**

Open `/fitproof-home-entrance/scene-1?frame=0`, `?frame=21`, and `?frame=42`; confirm transparent background, full cat silhouette, and a settled final frame.

### Task 2: Create a semantic one-shot entrance component

**Files:**
- Create: `frontend/components/HomeEntranceMark.tsx`
- Create: `frontend/components/HomeEntranceMark.test.tsx`

- [ ] **Step 1: Write failing component tests**

Test that the component renders one level-one heading whose text content is `FitProof`, preserves the Chinese subtitle, and marks its animation state as complete when the observer reports intersection.

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npm test -- HomeEntranceMark.test.tsx`

Expected: test runner reports the module does not exist.

- [ ] **Step 3: Implement the component**

Render `Fit` and `Proof` inside presentational span wrappers under one `h1`; attach one `IntersectionObserver`, disconnect after the first intersecting entry, and skip observer animation when reduced motion is requested.

- [ ] **Step 4: Re-run the component test**

Run: `npm test -- HomeEntranceMark.test.tsx`

Expected: all three assertions pass.

### Task 3: Add CSS choreography and integrate the homepage

**Files:**
- Modify: `frontend/components/InputPage.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Write the failing static source check**

Extend `frontend/scripts/check-home-entrance-lottie.mjs` to assert `InputPage.tsx` imports `HomeEntranceMark` and the stylesheet includes `prefers-reduced-motion` fallback selectors.

- [ ] **Step 2: Run the check to verify it fails**

Run: `node frontend/scripts/check-home-entrance-lottie.mjs`

Expected: source check reports missing `HomeEntranceMark` integration.

- [ ] **Step 3: Replace the existing heading block**

Use `HomeEntranceMark` in the existing card without changing its outer padding, radius, content order, or responsive typography. Add keyframes that reveal the two fixed-line-height spans from below, delay `Proof` by 100ms, fade the subtitle, and set animation-fill-mode to `both`.

- [ ] **Step 4: Re-run the source check**

Run: `node frontend/scripts/check-home-entrance-lottie.mjs`

Expected: `Lottie scene contract passed` and `Home entrance integration contract passed`.

### Task 4: Verify build and rendered behavior

**Files:**
- Verify: `frontend/components/HomeEntranceMark.tsx`
- Verify: `frontend/public/projects/fitproof-home-entrance/scene-1/lottie.json`

- [ ] **Step 1: Run production build**

Run: `npm run build`

Expected: Next.js completes with exit code 0.

- [ ] **Step 2: Inspect actual desktop and mobile renders**

Run the local Next server, capture initial and settled screenshots at 1440×900 and 390×844, and confirm the card and title occupy the same geometry across frames.

- [ ] **Step 3: Inspect reduced-motion rendering**

Emulate `prefers-reduced-motion: reduce`, reload, and confirm final title, subtitle, question, and cat appear without transition.

- [ ] **Step 4: Commit only the animation files**

Run: `git add frontend/components/HomeEntranceMark.tsx frontend/components/HomeEntranceMark.test.tsx frontend/components/InputPage.tsx frontend/app/globals.css frontend/public/projects/fitproof-home-entrance frontend/scripts/check-home-entrance-lottie.mjs && git commit -m "feat: animate FitProof homepage entrance"`

Expected: one commit containing only the new entrance-animation implementation.
