# 单视频视频档案卡紧凑化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让单视频「视频档案」卡的标题、编号、内容区对齐，并以更紧凑的扁平化层级呈现视频信息与说法摘要。

**Architecture:** 仅调整共享卡壳的标题几何关系，以及 `ProfileCard` 的视觉间距、字号和汇总行密度；不改 `claims` 的数据筛选规则、跳转行为或核验队列。保留「分类数量为零则不显示该行」的现有逻辑，防止显示无意义的空类别。

**Tech Stack:** Next.js 14、React、TypeScript、Tailwind CSS。

---

### Task 1: 收紧视频档案的共享卡壳

**Files:**
- Modify: `frontend/components/CourtCardShell.tsx`
- Test: `frontend` TypeScript compiler

- [x] **Step 1: 检查现有标题与编号容器**

确认标题与编号都在同一 `flex items-center` 行，卡壳外层不再带边框或阴影，并且卡头与内容区均使用 `px-4`。

- [x] **Step 2: 以最小 Tailwind 调整实现对齐**

保留现有结构，仅通过卡头行高、字号和内容上边距使标题基线与编号视觉居中，并维持内容区与卡头相同的左右内边距。

- [x] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`

Expected: exit code 0。

### Task 2: 收紧视频档案内容与说法摘要

**Files:**
- Modify: `frontend/components/SingleResultPage.tsx:119-256`
- Test: `frontend` TypeScript compiler

- [x] **Step 1: 保持既有数据行为**

保留 `stats.filter((item) => item.count > 0)`：只有当前视频实际存在的初筛分类才渲染；不要添加「共 4 条待核验说法」文案。

- [x] **Step 2: 以最小 Tailwind 调整实现紧凑排版**

缩小封面与标题的垂直间距，降低标题、解释、标签、作者、视频作者及摘要标题字号；收紧摘要行内外间距，减小圆角，并使右侧箭头的字号与同一行文字一致。保持封面、信息区和摘要区无边框、无发光、无阴影。

- [x] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`

Expected: exit code 0。
