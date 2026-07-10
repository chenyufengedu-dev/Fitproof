# FitProof 项目交接文档 · 给 Codex

> 本文档是交接文档，交接给 Codex 继续协作。请完整阅读后再开始改代码——里面记录了不少踩过的坑，重复踩会浪费时间。

## 背景与现状
这是一个原本为"抖音精选-内容重构"赛道做的 48 小时项目，**已获得二等奖晋级，现在进入大区赛阶段**，需要继续打磨产品、可能要应对更高强度的评审和演示要求。用户（项目负责人，非全职工程师，但能读懂代码、会用终端）会继续和你协作开发。

**沟通风格提示**：用户喜欢被直接告知问题根因和清楚的操作步骤（"做什么、为什么、怎么验证"），不喜欢被绕弯子；涉及风险操作（部署、删除、覆盖）习惯先确认。之前的协作模式是：先解释清楚原因 → 给方案 → 动手改 → 用 `tsc --noEmit` / `curl` 自查再回报，而不是改完就甩给用户测。建议延续。

---

## 一、项目是什么

**FitProof** —— 运动健康短视频争议辨析工具。

用户粘贴多条抖音视频链接，AI 跨视频提取观点、识别共识与分歧、对照运动医学证据（ACSM/ISSN/ADA 等真实权威机构）纠正可能不准确的说法，输出结构化「核验报告」。核心表达：**让 AI 替你多看一步**。

定位是**专业医疗风**（不是营销号风），主色 `#20CDB6`（医疗青绿），参考小荷 AI 医生类产品的视觉语言：白底、留白、克制配色、临床符号（心电图线、核验印章），明确**反对**大面积渐变/紫色/玻璃拟态/AI 模板味。

---

## 二、目录结构

```
D:\PointMap\
├── frontend/                  ← Next.js 14 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── page.tsx                ← 顶层状态机：input/loading/result/refs
│   │   ├── layout.tsx
│   │   ├── globals.css             ← 含自定义 keyframes（slideUp/fadeIn/猫漂浮等）
│   │   └── api/                    ← Next 云函数（仅 Vercel 云端用）
│   │       ├── preset/[id]/route.ts    ← 读打包进前端的预置 JSON
│   │       ├── followup/route.ts       ← 调 DeepSeek 做云端答疑
│   │       └── analyze/route.ts        ← 云端直接返回 501（真实分析仅本地支持）
│   ├── components/
│   │   ├── InputPage.tsx           ← 输入页（链接/话题输入 + 预置按钮）
│   │   ├── LoadingPage.tsx         ← 加载页（环形进度+分步清单，已重做过两次）
│   │   ├── ResultPage.tsx          ← 核心页！横向单卡滑动，本文档重点解释的文件
│   │   └── RefsPage.tsx            ← 「来源详情」页：参考文献(权威) + 视频源列表
│   ├── data/presets/               ← 预置数据 JSON（打包进前端，云端靠这个跑demo）
│   │   ├── 1.json  ← 空腹有氧好不好，唯一一个有**真实抖音视频数据**的话题
│   │   ├── 2.json  ← 简历该写几页（演示数据，质量一般）
│   │   ├── 3.json  ← 跑步伤不伤膝盖/空腹运动（演示数据）
│   │   └── 5.json  ← 鱼油是不是智商税（演示数据）
│   ├── types.ts                    ← 全部类型定义，改数据结构先看这个文件
│   └── vercel.json                 ← {"framework":"nextjs"}，强制识别，否则部署报错
├── backend/
│   ├── main.py                     ← FastAPI 单文件，全部后端逻辑都在这
│   ├── ingest.py                   ← 离线灌库脚本：真实链接→转写→分析→写 presets/*.json
│   ├── ingest_config.json          ← 灌库用的话题+链接配置
│   ├── presets/1-5.json            ← 后端版预置数据（和 frontend/data/presets 内容应同步）
│   ├── .env                        ← 真实密钥，已 gitignore，绝不上传
│   ├── .env.example                ← 占位模板，会上传
│   └── requirements.txt
├── poster/                         ← 比赛海报（HTML/CSS 可编辑版），大区赛可能还要用到
├── .gitignore
└── DEPLOY.md                       ← GitHub+Vercel 部署手册
```

---

## 三、技术栈与关键约束

- **前端**：Next.js 14 App Router + TypeScript + Tailwind。导出长图用 `html2canvas`。
- **后端**：Python + FastAPI，单文件 `main.py`。
- **大模型**：DeepSeek，OpenAI 兼容接口，用 `openai` Python SDK / fetch 调用。
  - ⚠️ **最重要的坑**：项目用的 `deepseek-v4-pro` 是**推理模型**，会先把 token 花在隐藏的 `reasoning_content` 上，再输出真正的 `content`。如果 `max_tokens` 给太小（比如 1024、2048），推理就把额度耗尽，`content` 返回**空字符串**、`finish_reason: "length"`。**所有调用必须设 `max_tokens >= 8192`**，已在 `main.py` 和 `frontend/app/api/followup/route.ts` 里统一改过，新增调用处也要遵守。
- **视频提取**：TikHub API（`https://api.tikhub.io/api/v1/douyin/web/fetch_one_video`），需要 `TIKHUB_TOKEN`。
- **语音转写**：本地 `openai-whisper`（CPU，FP32，会有 UserWarning 提示不支持 FP16，正常忽略）+ ffmpeg（必须装在系统 PATH，否则 Whisper 解码报 `WinError 2`）。
- **OCR**：`rapidocr-onnxruntime`，本地纯 Python 跑，识别关键帧画面文字（不依赖外部 API）。
- **部署**：GitHub（私有代码）+ Vercel（云端 demo），本地用 Python 后端跑完整功能。

### 环境变量
`backend/.env`（不上传 GitHub）：
```
TIKHUB_TOKEN=...
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
```
Vercel 项目环境变量：同上三个 `DEEPSEEK_*`（不需要 TIKHUB，云端没有真实分析）。

### 线上地址
**https://fitproof-11cs.vercel.app/** —— 云端只支持预置话题浏览 + AI 答疑；真实链接分析在云端会返回 501，提示"仅本地完整版支持"。

---

## 四、后端接口（main.py）

- `GET /api/health` → `{"ok": true}`
- `GET /api/preset/{id}`（id ∈ 1/2/3/5）→ 读 `backend/presets/{id}.json`
- `POST /api/analyze` → 完整流程：解析抖音短链 → TikHub 取视频信息 → 下载音频 → Whisper 转写（带时间戳 segments）→ 关键帧时间点由 DeepSeek 从转写里挑选 → ffmpeg 截帧 → RapidOCR 识别画面文字 → 把转写+画面文字一起喂给 DeepSeek 做最终结构化分析。**仅本地可跑**，耗时约 1-3 分钟/请求。
- `POST /api/followup` → 基于已生成的 analysis JSON，调 DeepSeek 做追问/答疑，要求引用编号、不能编造分析之外的内容。

`ingest.py` 是批量化版本：给定话题名+链接列表，跑完整 analyze 流程后直接写入 `presets/{id}.json`，用于离线准备预置数据，避免现场依赖网络稳定性。

---

## 五、核心数据结构（frontend/types.ts）

```typescript
interface VideoRef { id: number; time: string }   // 某观点出自哪个视频的第几分几秒

interface Consensus {
  point: string
  video_refs?: VideoRef[]      // 视频出处：点击 → 底部抽屉显示"来自视频X，第xx秒"，不进参考文献
  authority_ids?: string[]     // 权威依据：渲染成 [n] 编号，点击跳到「来源详情」页
  screen_evidence?: string     // 来自画面 OCR（而非语音）识别到的文字证据
}
interface ConflictPosition { argument: string; video_refs?: VideoRef[]; screen_evidence?: string }
interface Conflict {
  topic: string; pro: ConflictPosition; con: ConflictPosition
  evidence_note?: string       // 主流证据更支持哪一方的一句话说明
  authority_ids?: string[]
}
interface Recommendation { condition: string; advice: string; video_refs?: VideoRef[]; authority_ids?: string[] }
interface Misleading { claim: string; video_refs?: VideoRef[]; correction: string; authority_ids?: string[] }
interface Authority { id: string; name: string; note: string }   // 真实存在的权威机构/指南
interface Reference { id: number; author: string; title: string; claim: string; url: string }  // 视频来源

interface Analysis {
  one_line_summary: string
  consensus: Consensus[]
  conflicts: Conflict[]
  recommendations: Recommendation[]
  references: Reference[]
  misleading?: Misleading[]    // "可能不准确的说法"卡片用
  authorities?: Authority[]    // "权威依据"列表，用于 [n] 引用解析
}
```

**两套引用体系，千万别混**：
1. `video_refs`（视频出处）—— 点击只**弹底部抽屉**展示"视频几+时间点"，**不计入参考文献编号**，因为这只是溯源到原视频，不是学术引用。
2. `authority_ids`（权威依据）—— 渲染成正文里的 `[1][2]...`，编号体系来自 `authorities` 数组在「来源详情」页里的顺序，点击会跳转/抽屉展示该权威机构名称和结论。**绝不能编造不存在的期刊论文/DOI**，只能引用真实存在的机构名称（ACSM/ISSN/ADA/WHO 等），sprompt 里已经反复强调这一点，新增 prompt 时务必保留这条约束。

---

## 六、前端核心页面：ResultPage.tsx（重点，踩坑最多的文件）

### 交互形态
**横向单卡滑动**，类似探探：屏幕上任意时刻只显示**一张卡片**（不是横向排列的卡片列表），用户左右拖拽手势切换到上一张/下一张。**不要把它做成多卡横排滚动**——之前有版本做错过，被用户纠正过。

6 张卡片固定顺序：**核验结论 → 共识提取 → 分歧对照 → 适用边界 → 说法校验 → AI 答疑**。

### 两个关键实现细节（必须保留，否则会复现已修复的 bug）

**1. 拖拽用命令式 DOM 操作，不要用 React state 驱动每一帧。**
拖拽过程中直接写 `frontRef.current.style.transform = ...`，不要 `setState` 触发 re-render——否则每帧重渲染整棵子树，会明显卡顿（用户反馈过"很卡，一点也不顺滑"）。只有"松手后决定切到哪张卡"才调用 `setIndex`。`useLayoutEffect` 监听 `index` 变化，在卡片切换瞬间把 transform/opacity 复位，避免"飞出去的卡片卡在画面里没消失"的问题。

**2. 渲染卡片内容用普通函数调用，不要用 JSX 组件。**
当前实现是 `const renderCard = (section) => {...}`，使用处是 `{renderCard(cur)}`，**不是** `<Card section={cur} />`。这是因为如果写成组件形式，每次输入框 `onChange` 触发的 `setState`（比如打字）都会让 React 把 `Card` 当作"新的组件类型"，整棵子树卸载重建，导致**输入框失去焦点、打一个字就掉**（用户报过这个 bug，根因就是这个，已修复，别改回组件形式）。

### 底部抽屉
所有引用类交互（视频出处、权威依据、画面证据）统一用**从底部滑出的抽屉**展示详情，不跳转页面、不打断阅读体验。CSS 用 `globals.css` 里的 `animate-slideUp` / `animate-fadeIn`。

### 视觉规范
- 不用渐变、不用紫色、不用 Inter 字体那种"AI 模板味"。
- 主色 `#20CDB6`，配深青文字 `#0B6E63`，浅青底卡片 `#f3fbf9`。
- 警示/风险类信息只用**小标签**（琥珀色胶囊），不要做成大面积警告色块——之前有版本把"判定"做成整块黄色背景，被要求改小。
- "专业依据"指标卡之前是纯黑底，被反馈"太抢眼"，已换成深青 `#0B6E63` 实底。
- A/B 对照（分歧卡）里的视频播放图标，三角形**统一朝右**，不要做镜像（之前镜像过，被要求统一方向，左右差异交给气泡位置/编号体现）。

### 「分歧对照」卡片的固定结构（这是产品的高潮页，逻辑顺序不要乱）
分歧问题 → 视频说法 A（带视频出处） → VS 分隔 → 视频说法 B → 分歧根源（一句话归纳双方差异，从数据生成，不要写死） → FitProof 核验判断卡（判定 / 误导风险小标签 / 依据强度条 / 主流证据说明 + `[n]` 引用）。

### 通用性铁律
**所有卡片内容必须从 `analysis` 数据动态读取渲染，不能为某一个具体话题（比如"空腹有氧"）写死任何文案**。用户多次强调这一点，因为预置话题有好几个，写死文案只对一个话题适用就是 bug。

---

## 七、AI 答疑卡片（曾叫"追问"→改名为"AI 答疑"）

- 用户明确说过**不能叫"问医生"**，因为这是 AI 不是医生，容易误导，最终定名"AI 答疑"。
- 功能：用户可以问视频里出现的专业名词（比如"什么是高强度间歇训练 HIIT"），AI 基于已分析内容 + 通用知识做名词解释，而不是机械地说"未在分析中提及"。如果改答疑相关 prompt，记得保留"愿意做名词解释"这条要求，之前默认 prompt 太死板导致任何问题都回复"未涉及"，被用户报过 bug 并修复。
- 有"快捷问题"按钮（如"这些说法我该信谁""帮我大白话总结一下"），降低用户输入门槛。

---

## 八、开发约定（务必遵守）

1. **数据驱动，不写死文案** —— 所有组件对任意话题的 `analysis` JSON 都要能正确渲染。
2. **不编造权威来源** —— 只能引用真实存在的机构/指南名称，不编具体论文标题/年份/DOI。
3. **DeepSeek 调用 `max_tokens >= 8192`**，无一例外。
4. **密钥安全** —— `backend/.env` 已加入 `.gitignore`，新建任何含密钥的文件前先检查会不会被 git 追踪（`git add -A -n` 预演一下）。
5. **本地 vs 云端切换** —— `frontend/.env.local` 设了 `NEXT_PUBLIC_API_URL` 就连本地 Python 后端（功能完整，含真实分析）；不设就走 Vercel 自带的 Next 云函数（仅预置话题+答疑）。
6. **改完前端代码，跑 `npx tsc --noEmit` 自查**，再跟用户说"改完了"。改完后端，至少跑一下 `python -c "import main"` 确认能正常 import。
7. 改 `.next` 缓存损坏报 `Cannot find module './xxx.js'` 这类诡异错误时，**先停掉 dev server、删 `.next`、重新 `npm run dev`**，不要在 dev server 运行时跑 `next build`（会冲突写坏缓存，踩过这个坑）。

---

## 九、Windows 环境注意事项
- 终端默认 GBK 编码，Python 脚本打印中文/emoji 会乱码或报 `UnicodeEncodeError`。写新脚本时记得 `sys.stdout.reconfigure(encoding="utf-8")`，或者干脆避免在 print 里用 emoji/特殊符号。
- ffmpeg 用 `conda install -c conda-forge ffmpeg` 装的，确认它在 PATH（`where ffmpeg`）。
- 抖音 CDN（`*.douyinstatic.com`）偶发 SSL EOF / 限流短响应，下载逻辑里已加了重试 + 浏览器 UA + 最小字节数校验（小于 50KB 视为限流，重试），别删掉这层保护。

---

## 十、当前进度

### 已完成且稳定
- 后端完整真实视频处理流程（验证过端到端跑通）。
- 前端 6 张卡片视觉统一、拖拽流畅、所有已知 bug（失焦、卡顿、残留动画）已修复。
- Vercel 云端部署成功且可用。
- 话题 1（空腹有氧好不好）是唯一一个跑过真实抖音视频数据的预置话题，质量较高，建议演示优先用它。
- `poster/poster.html` 是可编辑海报草稿（HTML/CSS），大区赛如果还要交海报可以在这基础上改。

### 待办 / 可能要继续做的（按建议优先级）
1. **预置话题质量**：话题 2/3/5 目前是演示数据（非真实视频），如果大区赛评审会深究内容真实性，建议找真实抖音链接跑 `python backend/ingest.py` 补全。
2. **桌面端体验**：目前主攻手机端（横向单卡滑动），桌面宽屏布局基本没做，鸟瞰图功能之前做过又主动收起，如果大区赛要在大屏演示，这块要补。
3. **真实链接分析体验**：流程正确但慢（1-3分钟/2条视频），如果大区赛要求现场演示真实链接，要考虑要不要做并行加速或更好的等待态。
4. 输入页、来源详情页可以进一步打磨细节（之前主要精力在结果页）。
5. 如果大区赛要求更新海报/项目介绍文案，注意现在不是初赛了，介绍角度可能要调整为"已获二等奖晋级、产品经过迭代打磨"的叙事。

---

## 十一、启动方式

```bash
# 后端（终端1）
cd D:\PointMap\backend
python -m uvicorn main:app --port 8000

# 前端（终端2，本地完整版）
cd D:\PointMap\frontend
npm run dev
# 浏览器打开 http://localhost:3000
```

如果 `frontend/.env.local` 里没设 `NEXT_PUBLIC_API_URL=http://localhost:8000`，前端会走云函数逻辑（仅预置话题+答疑，没有真实分析），本地调试完整功能记得设置这个变量。

---

祝大区赛顺利。这份文档已经把目前所有已知的坑和设计决策的"为什么"写清楚了，遇到看起来奇怪的代码（比如 `renderCard` 不是组件、`max_tokens` 写 8192）先来看这份文档，大概率不是 bug 而是有意为之。
