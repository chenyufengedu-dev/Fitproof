# 任务：从 `origin/community-ui-upload` 摘取社区功能

> 给程序员 B。**先完整读一遍再动手。**这个任务的难点不是写代码，是「只拿想要的、不碰其他任何东西」。

---

## 一、背景：为什么不能直接合并

组员在 `origin/community-ui-upload` 分支上传了一个**完整的老版本项目**（commit 信息就是 "Upload FitProof project with community UI"），不是基于当前代码改的。

```
git diff HEAD...origin/community-ui-upload
→ fatal: no merge base
```

**没有共同祖先。** `git merge` / `git rebase` / `git cherry-pick` 全都不能用，一旦合并会用老版本覆盖掉这几天所有工作（知识库 Tab、我的 Tab 重做、36 个图标、353 份文献数据…）。

**只能单文件摘取。**

---

## 二、要摘的文件（只有 3 个）

| 文件 | 我们现状 | 他们的 | 说明 |
|---|---|---|---|
| `frontend/lib/communityShares.ts` | **不存在** | 92 行 | 纯新增，零冲突。分享功能的核心：`CommunityShareRecord` 类型 + pending/published/featured 状态机 + localStorage 持久化 |
| `frontend/components/CommunityTab.tsx` | 69 行空壳 | 580 行 | 完整社区 UI |
| `frontend/data/community-samples.json` | 1 条 | 2 条 | **必须一起拿**，见下面的坑 |

### ⚠️ 为什么 json 必须一起拿

两边 schema **完全不同**：

- 我们的：`id / hook / claim / signal / topic / reference / result`
- 他们的：`caseId / sourceType / publisher / title / categoryIds / publishTime / video / originalClaim / signal / verdict / risk / correctedExpression / evidence / analysisSnapshot / claims / discussion / allowComments`

只拿组件不拿数据 → 组件读不到字段 → 页面崩。

**换掉是安全的**：已确认 `community-samples.json` 全项目**只有 `CommunityTab.tsx` 一个读者**，没有任何其他代码依赖它。

---

## 三、依赖已核验过，不用再查

他们这两个文件的全部 import：

```
react                        ← 外部包，有
@/components/FitProofCat     ← 我们有
@/types                      ← 我们有
@/data/community-samples.json ← 跟着一起摘
```

类型兼容性也核验过：
- `SingleAnalyzeResponse`、`VerifyResult`、`Keyframe`、`EvidenceEntry`、`SingleSampleData` —— 字段**完全一致**
- `Claim` —— 他们多一个可选字段 `why`，不影响

**结论：三个文件自足，不需要连带摘其他任何文件。**

---

## 四、操作步骤

### 1. 先备份（必做）

```bash
cd D:\PointMap
copy frontend\components\CommunityTab.tsx frontend\components\CommunityTab.tsx.bak
copy frontend\data\community-samples.json frontend\data\community-samples.json.bak
```

### 2. 摘文件

```bash
git checkout origin/community-ui-upload -- frontend/lib/communityShares.ts
git checkout origin/community-ui-upload -- frontend/components/CommunityTab.tsx
git checkout origin/community-ui-upload -- frontend/data/community-samples.json
```

`git checkout <branch> -- <path>` 只把指定文件拉进工作区，**不切分支、不合并、不动 HEAD**。

### 3. 接线（唯一的集成点）

他们的组件签名带一个 prop：

```tsx
CommunityTab({ onOpenVerifiedCase }: { onOpenVerifiedCase: (sample: SingleSampleData) => void })
```

我们现在是 `<CommunityTab />` 无参数调用。在 `frontend/app/page.tsx` 里补上：

```tsx
// 现在（约 181 行）
: activeTab === 'community' ? <CommunityTab />

// 改成
: activeTab === 'community' ? <CommunityTab onOpenVerifiedCase={handleOpenVerifiedCase} />
```

`handleOpenVerifiedCase` 的作用是「点社区里的案例 → 跳到单视频结果页看完整核验」。`page.tsx` 里已经有加载样例数据的现成逻辑（搜 `sample` 或 `setSingleData`），照着写一个即可。

**如果一时接不上，先传一个空函数 `() => {}` 让页面能跑起来**，再慢慢接——但别忘了回来补。

### 4. 验证

```bash
cd D:\PointMap\frontend
npx tsc --noEmit          # 必须 0 错误
```

然后浏览器（http://localhost:3000）**逐个 Tab 点一遍**：

- [ ] 社区 Tab 正常显示，不报错
- [ ] **核验 Tab 正常**（单视频 + 双视频预置都要试）
- [ ] **知识库 Tab 正常**（应显示「353 份文献 · 70 家机构」）
- [ ] **我的 Tab 正常**
- [ ] 底部导航四个 Tab 切换都不白屏

---

## 五、🔴 绝对不要碰的东西

**只允许改动上面列的 3 个文件 + `page.tsx` 那一行。** 其他任何文件的改动都是错的。

特别是这些**绝对不能**从那个分支摘（会覆盖大量新工作）：

| 文件 | 为什么 |
|---|---|
| `frontend/types.ts` | 有人在改双视频字段 |
| `frontend/components/ResultPage.tsx` | 双视频卡组，有人在改 |
| `frontend/components/SingleResultPage.tsx` | **另一个 AI 正在改**，加单视频行动建议卡 |
| `frontend/components/ProfileTab.tsx` | 「我的」Tab 已完全重做 |
| `frontend/components/KnowledgeTab.tsx` | 知识库 Tab，老分支根本没有 |
| `frontend/components/BottomNav.tsx` | 已从 3 Tab 改成 4 Tab |
| `backend/**` 任何文件 | 后端有知识库接口 + 353 份文献数据 |
| `backend/evidence/**` | **数据已归一化过，覆盖会毁掉** |

摘完后**必须**跑一次确认没有误伤：

```bash
git status --short
```

输出里应该**只有** `communityShares.ts`、`CommunityTab.tsx`、`community-samples.json`、`page.tsx` 这四个是你改的。如果出现别的文件，立刻 `git checkout -- <那个文件>` 还原。

---

## 六、其他纪律

1. **不要执行 git 写操作**（commit / checkout 分支 / stash / reset）——工作树上还有另外两个 AI 在改，一动就可能吞掉别人的东西。`git checkout <branch> -- <file>` 是例外，它只影响指定文件
2. **不要删 `.next`、不要重启 dev server** —— 会打断其他人
3. **不要跑 `npm install`** —— 依赖没变
4. 遇到 `npx tsc --noEmit` 报 `public/FitProof-thinking/...` 的错，那是**已知的历史遗留问题**（有人把一个完整子项目放进了 `public/`），不是你造成的，忽略即可

---

## 七、完成后回报什么

1. `npx tsc --noEmit` 的输出（应为空）
2. `git status --short` 的输出（确认只动了 4 个文件）
3. 四个 Tab 各截一张图 or 说明是否正常
4. `handleOpenVerifiedCase` 是真接上了还是先放了空函数
