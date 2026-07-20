# FitProof 会话状态交接（给下一个窗口的主AI）

> **先读 `docs/HANDOFF_主AI交接.md`（角色+方法），再读本文件，然后才动手。**
> 更新：**2026-07-19**。
> **比赛日程：7/20 开赛，7/23 提交——只剩 4 天。**
> **当前分支：`feat/claim-icons`**（工作树有 86 个改动文件，全部未提交）

---

## 一、⚠️ 最重要：多 AI 并行，动手前先看谁在改什么

**先 `git status`，只碰自己的文件。**

| 角色 | 负责 | 文件范围 | 状态 |
|---|---|---|---|
| **A** | 双视频行动建议卡 | `backend/main.py`、`ResultPage.tsx`、`types.ts`、`presets/` | main.py 已完成 |
| **另一 AI** | **单视频行动建议卡** | **`SingleResultPage.tsx`** | 🔴 **进行中，别碰** |
| **程序员 B** | 社区功能摘取 | 见 `docs/TASK_程序员B_社区功能摘取.md` | 待开始 |
| **主AI（你）** | 「我的」Tab、知识库 Tab、图标 | `ProfileTab.tsx`、`KnowledgeTab.tsx`、`knowledge.py`、`StepIcon.tsx`、`lib/profile.ts` | 见第三节 |

**并行纪律：**
1. **不跑 `rm -rf .next`、不重启别人的 dev server**
2. **不执行 git 写操作**（commit/checkout分支/stash/reset）——所有人改动在同一工作树
3. `npx tsc --noEmit` 报 `public/FitProof-thinking/...` 的错是**历史遗留**（有人把完整子项目放进了 `public/`），不是你造成的，忽略
4. 新功能优先新建文件，天然零冲突

---

## 二、🔴 唯一没做、且最该做的事：宣判卡在盖 AI 没做过的判定

**位置**：`frontend/components/SingleResultPage.tsx:635` 的 `summaryVerdictTone`

它用正则从 `verdict` 反推，然后**用写死的字符串覆盖模型原话**：

| 模型实际输出 | 宣判卡盖的章 |
|---|---|
| 证据不足 · 风险高 | **不建议采纳** |
| 证据不足 · 风险中 | **需要加条件** |
| 可信 · 风险低（signal=疑似夸大） | **需要加条件** |

**8 个真实场景 7 个盖错。** 三个最要命的：
1. 模型说「证据不足」（我查不到）→ 卡片盖「不建议采纳」。两件完全不同的事，而"查不到就诚实说"是产品最硬的卖点
2. 核验说「可信·低风险」，却因快模型初判 `signal` 是"疑似夸大"就盖「需要加条件」——**初判压过核验结论，方向反了**
3. `:654` 的 `result.risk_level || '中'`——风险为空时**凭空编一个"中"**

违反铁律4。**宣判卡可截图分享**，等于把伪造判定传出去。对质卡显示 `result.verdict` 原话，所以**同一次核验两张卡自相矛盾**。

**而且现在更刺眼**：知识库 Tab 首屏写着「全部由人工收录、逐条拆解，**不由 FitProof 自行推导**」——这句话和那段代码不能同时为真。

**修法**：章面直接用 `result.verdict`，颜色由 `risk_level` 三档映射（复用同文件已有的 `stampTone`），**去掉 signal 参数**。同文件 `VerdictStamp`（约 :93）已是正确做法，照它改。约 30 分钟。

⚠️ **但该文件现在被另一个 AI 占用**（正在加单视频行动建议卡）。两个选择：
- 等他收工后第一时间改
- 把上面的修法直接转给他，让他顺手改

---

## 三、本轮（7/19）完成的工作

### 1. 知识库 Tab（全新，从零做完）
- 后端独立成 **`backend/knowledge.py`**（`main.py` 只加 3 行挂载，避开 A 的改动）
- 两个接口：`/api/knowledge`（目录，146KB）、`/api/knowledge/entries?doc=`（某文献全部结论）
- **只暴露元信息 + 原文结论摘录，不暴露我们的观点**（产品决策：借 WHO 的信用，不用自己的）
- 前端 `KnowledgeTab.tsx`（新文件）：标题栏 / 主张卡 / 收录范围 / 来源机构 / 文献目录 / 文献详情
- `BottomNav` 3 Tab → **4 Tab**，`page.tsx` 接线
- 目录整份**模块级缓存**，切走再回来不重新请求（原来每次切回卡一下）
- 现状：**353 份文献 · 70 家机构 · 13 个领域**

### 2. 证据数据治理
- **机构名归一化**：`normalize_org.py` 补了 33 条映射并 `--apply`，org 种类 **91 → 74**；WHO 从 **9 种写法合并成 3 种**（主体 142 条）
- 脚本自动删了向量缓存（org 参与 embedding 但 fingerprint 不含它，是交接文档记的技术债）
- registry 已备份 `registry.csv.bak-org-20260719-090435`
- **发现并在读取侧修复**：registry 274 份里只有 17 份页码是好的，**149 份被 Excel 转成了日期**（`1-30` → `1月30日`）。`knowledge.py` 的 `_fix_pages()` 做了还原，**但源文件仍是脏的**

### 3. 图标
- 36 张说法图标（`public/claim-icons/`）：20MB → **190KB**，`CLAIM_ICONS` 白名单扩到 36 个，提示词同步
- **`StepIcon.tsx` 重写**：1.8px 描边 → **实心填充**，25 个图标，双视频/单视频**合并成一份**（原来同一个"喝水"画了两遍）
- 导出 `StepIcon` 和 `ActionIcon`（同一个组件）
- 3D 徽章 `public/knowledge/library-badge.webp`

### 4. 「我的」Tab 精修（约 10 轮）
四指标卡、13周热力图（可点看当天明细）、关注话题金银铜牌、核验历史（整页详情，非内联展开）、站内确认弹窗（非原生 confirm）、等级说明弹窗、「我的分享」占位卡

### 5. 顺带修的 bug
- `lib/single.ts` 的 `citedEvidence` 缺字段直接崩 → 整页白屏，已加防御
- 详情页 z-index 与底部导航同为 `z-50` 被压住 → 改 `z-[55]`（ProfileTab 和 KnowledgeTab 两处）
- `ProfileTab` 满级时进度条整块消失 → 布局塌陷

---

## 四、待办（按优先级）

| 优先级 | 事项 | 说明 |
|---|---|---|
| 🔴 | **修宣判卡** | 见第二节，等文件释放 |
| 🔴 | **演示兜底** | 录演示视频、盲测、打 stable tag、赛前功能冻结。**一件没做** |
| 🟠 | 社区功能摘取 | 已写好 `docs/TASK_程序员B_社区功能摘取.md`，交给 B |
| 🟠 | 单视频图标切换 | 让改 `SingleResultPage.tsx` 的 AI 把 `SingleActionIcon` 换成 `import { ActionIcon } from '@/components/StepIcon'`（prop 从 `icon` 改 `name`）。**25 个图标已覆盖它需要的全部 14 个** |
| 🟠 | 修 registry 的 filename 列 | 14 份文件**没丢**，只是文件名对不上（冒号被 Windows 删、全角半角混用、前缀写错、末尾多空格）。修完那 12 份未拆条的就能拆 |
| 🟡 | 新图标 | 规范已写好 `docs/SPEC_图标生成规范.md` |
| 🟡 | 部署 + 防滥用 | 一个配置文件都没有；摊位本机演示可不做 |
| 🟢 | registry 源文件页码清洗 | 读取侧已兜住，源文件脏 |

---

## 五、⚠️ 操作坑

**本轮新踩的：**

1. **多个前端 dev server 共用同一个 `frontend/.next`** —— 3000/3001/3005 互相覆盖构建产物。我用 `Stop-Process -Force` 强杀 node 导致 webpack 缓存写坏，报 `from pack: Error: incorrect data check`，整个前端起不来。**修法：停掉所有前端 → 删 `frontend\.next` → 只起一个**。**别用 -Force 杀正在写缓存的 node**

2. **JSX 注释不能放在 `return (` 或 `map(() => (` 的正后面** —— 我这个会话犯了 **3 次**，每次 13 个编译错误。`{/* */}` 是 JSX 子元素语法，放在表达式返回位置必炸。**注释要放在 `return` 之前，用 `//`**

3. **`main.py` 没有 `--reload` 曾坑了三次** —— 已在 `.claude/launch.json` 给两个 backend 配置加上

4. **Windows GBK 管道** —— `curl | python` 输出中文会 UnicodeEncodeError。改用 `urllib.request` 直连
5. **PowerShell 里 `python -c "..."` 含引号嵌套易碎** —— 复杂脚本写到 scratchpad 再执行

**老的仍有效：**

6. **截图工具（computer screenshot）稳定 30s 超时** —— 验收前端只能用 `javascript_tool` 读 DOM/计算样式 + `get_page_text`
7. **视觉层级不能靠几何位置判断** —— 我曾用"末行 Y < 导航 Y"断定"没被遮挡"，是错的。**要用 `document.elementFromPoint(x, y)` 看真实最顶层元素**
8. **测量布局要用中心点分组，不能用 top** —— 无边框元素高度不同，用 top 会把同一行误判成两行
9. **Windows 控制台是 GBK** —— Python 打印中文前 `sys.stdout.reconfigure(encoding="utf-8")`
10. **测试数据污染是真实风险** —— 改任何 sample/preset 必须还原 + `git status` 确认

**演示前必须清理：**
- `public/materials/`（20MB 原始 PNG，已处理完）
- `public/claim-icons-v2/`（190KB 中间产物，已部署）
- 浏览器 localStorage 里的演示数据（「我的」页面点「清空全部」）

---

## 六、关键文件地图

- 知识库：`KnowledgeTab.tsx` + `backend/knowledge.py`
- 我的：`ProfileTab.tsx` + `lib/profile.ts` + `lib/history.ts`
- 单视频：`SingleResultPage.tsx`（**别人占用**，含待修的 `summaryVerdictTone:635`）
- 双视频：`ResultPage.tsx`（**A 占用**）
- 图标：`StepIcon.tsx`（25 个实心 SVG）、`public/claim-icons/`（36 张 webp）
- 后端：`main.py`（`CLAIM_ICONS`、`normalize_recommendations`）、`knowledge.py`、`evidence_store.py`
- 数据工具：`normalize_org.py`、`cleanup_evidence.py`、`ingest_evidence.py`
- 图标处理：`frontend/scripts/process-icons.py`

---

## 七、组员数据拆条（B 机 `D:\FitProof\backend`）

```bash
python ingest_evidence.py --manifest evidence/registry.csv
```
自动跳过已拆的，只拆新增。**三个坑**：
1. **绝不用 Excel 编辑 registry.csv**（149 份页码已被毁过一次，用记事本）
2. **密钥别填进 `ingest_evidence.py`**（仓库是 PUBLIC），用 `.env` 的 `DEEPSEEK_API_KEY`
3. 拆完 `entries/` 和 `registry.csv` **要一起同步回来**，然后重启后端

---

## 八、埋着的技术债

- `evidence_store._entry_text` 把 org 喂进 embedding，但 `_fingerprint` **不含 org** —— 改 org 必须删 `evidence/cache/*.npz`（`normalize_org.py` 已自动处理）
- `docs/EVIDENCE_INGEST_SPEC.md:19` 教组员把密钥填进被 git 跟踪的文件，**仓库是 PUBLIC**
- `public/FitProof-thinking/` 是个完整子项目被放进了 `public/`，导致全项目 `tsc` 报错
- registry.csv 源文件页码仍是脏的（读取侧已兜）
- `verdictStampClass`（`SingleResultPage.tsx:69`）是死代码

---

**接手第一步**：`git status` 看谁在改什么 → 确认 `SingleResultPage.tsx` 是否已释放 → **优先修第二节那个宣判卡 bug** → 然后演示兜底。视觉已经磨得很细了，剩下 4 天该收口了。
