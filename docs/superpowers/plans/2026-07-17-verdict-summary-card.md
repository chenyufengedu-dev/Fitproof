# Verdict Summary Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the single-video verdict card as a data-driven, dual-section adjudication layout that matches the approved reference while leaving semantic icon artwork as an empty mint placeholder.

**Architecture:** Keep `SummaryCard` as the page-level component and introduce small local presentation helpers in `SingleResultPage.tsx`: one mapper for verdict appearance and one renderer for an individual summary item. They consume existing `Claim` and `VerifyResult` data, so neither the API nor other cards change.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS.

---

### Task 1: Define data-driven verdict presentation

**Files:**
- Modify: `D:\PointMap\frontend\components\SingleResultPage.tsx` near `SummaryCard`
- Test: `D:\PointMap\frontend` TypeScript compilation

- [ ] **Step 1: Add a verdict appearance helper**

```ts
function summaryVerdictTone(result: VerifyResult, signal: Claim['signal']) {
  const rejected = /不建议|不可信|夸大|误导/.test(result.verdict) || /高|误导/.test(result.risk_level)
  const conditional = !rejected && (/条件|争议/.test(result.verdict) || /有条件|有争议/.test(signal))
  return rejected
    ? { label: '需要打折听', stamp: `不建议采纳 · 误导风险${result.risk_level}`, stampClass: 'border-[#B86A12] text-[#A65D11]' }
    : conditional
      ? { label: '以情况而定', stamp: '以情况而定', stampClass: 'border-[#567DB7] text-[#466EAA]' }
      : { label: '基本可信', stamp: '建议采纳', stampClass: 'border-[#169C89] text-[#078C7E]' }
}
```

- [ ] **Step 2: Run a compiler check before the visual refactor**

Run: `cd D:\PointMap\frontend; npx tsc --noEmit`

Expected: exit code `0`.

### Task 2: Replace each plain result article with the approved dual-section card

**Files:**
- Modify: `D:\PointMap\frontend\components\SingleResultPage.tsx` in `SummaryCard`
- Test: `D:\PointMap\frontend` TypeScript compilation

- [ ] **Step 1: Add a local `VerdictSummaryItem` renderer**

The renderer must include:

```tsx
<article className="rounded-[16px] border border-slate-200/80 bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.045)]">
  <div className="flex gap-3">
    <span className="flex h-12 w-12 shrink-0 rounded-full border border-[#D8F1EC] bg-[#EEF9F6]" aria-label="语义图标占位" />
    {/* label, source claim, and angled verdict stamp */}
  </div>
  <div className="mt-3 flex gap-3 rounded-[13px] border border-[#CDEDE7] bg-[#F0FBF8] px-3 py-3">
    {/* generic teal correction icon, heading, correction */}
  </div>
</article>
```

- [ ] **Step 2: Bind the item to `claim.claim`, `result.correction`, and the presentation helper**

Only existing verification results may determine the label, stamp, and text. Do not use topic-specific food names or images.

- [ ] **Step 3: Replace `featuredDangerous` with a representative ordered list**

Render all completed high-risk and conditional results first; add accepted results until at most three items are visible. The content region remains scrollable for additional results.

- [ ] **Step 4: Run compiler check**

Run: `cd D:\PointMap\frontend; npx tsc --noEmit`

Expected: exit code `0`.

### Task 3: Match the verdict page header and empty states

**Files:**
- Modify: `D:\PointMap\frontend\components\SingleResultPage.tsx` in `SummaryCard`
- Test: `D:\PointMap\frontend` TypeScript compilation

- [ ] **Step 1: Rebuild the internal header as a bordered verdict banner**

Use the existing text `避坑总结`, `宣判`, and `FitProof / 健康说法核验` inside a white banner with a pale mint border; do not alter the outer fixed `CourtCardShell` header or its `07` sequence label.

- [ ] **Step 2: Keep reviewing and no-risk states in the new visual language**

The reviewing notice and no-risk panel must retain their current data conditions, with mint border/background and no fabricated verdict.

- [ ] **Step 3: Run final static checks**

Run: `cd D:\PointMap\frontend; npx tsc --noEmit; cd D:\PointMap; git diff --check`

Expected: TypeScript exits `0`; diff check reports no whitespace errors (line-ending notices are acceptable).
