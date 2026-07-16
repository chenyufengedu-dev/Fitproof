# FitProof 项目交接文档 · 给新 AI（Codex / Claude 等）

> 交接文档。请完整读完再动代码——里面记录了大量踩过的坑和"为什么这么写"的原因，重复踩会浪费时间。遇到看起来奇怪的代码（比如 `renderCard` 不是组件、`max_tokens` 写 8192），先在本文档里找解释，大概率是有意为之。

## 背景与现状
FitProof 原是"抖音精选-内容重构"赛道的 48 小时比赛项目，**初赛已获二等奖并晋级，现进入大区赛阶段，正式比赛日 2026-07-20**（允许提前制作打磨）。项目负责人（下称"用户"）**不是程序员、几乎不手写代码，整个项目都是靠 AI 辅助完成的**——所以你要负责把控代码质量、架构一致性和风险，用户负责产品判断和方向。

**沟通风格**：用户要"直接说根因 + 清楚的操作步骤（做什么/为什么/怎么验证）"，不要绕弯。风险操作（部署、删除、覆盖、push）先确认。协作节奏：解释原因 → 给方案 → 动手 → 用 `tsc --noEmit` / `curl` 自查 → 再回报，别改完就甩给用户测。用户看得懂中文解释，但看不懂太底层的黑话，术语要顺带解释。

---

## 一、项目是什么
**FitProof —— 运动健康短视频争议辨析工具。** 用户粘贴多条抖音运动健康视频链接，AI 跨视频提取观点、识别共识与分歧、对照运动医学证据（ACSM/ISSN/ADA/WHO 等真实权威机构）纠正可能不准确/被夸大的说法，输出结构化「核验报告」。核心表达：**让 AI 替你多看一步**。

**产品定位=专业医疗风**（不是营销号风）。主色 `#20CDB6`（医疗青绿），深青文字 `#0B6E63`，浅青卡片底 `#f3fbf9`。参考小荷 AI 医生类视觉：白底、留白、克制、临床符号（心电图线、核验印章）。**明确反对**大面积渐变 / 紫色 / 玻璃拟态 / Inter 字体那种"AI 模板味"。

---

## 二、目录结构
```
D:\PointMap\
├── frontend/                  ← Next.js 14 + TypeScript + Tailwind
│   ├── app/
│   │   ├── page.tsx                ← 顶层状态机：input/loading/result/refs
│   │   ├── layout.tsx / globals.css (自定义 keyframes: slideUp/fadeIn/cat-float)
│   │   └── api/                    ← Next 云函数（仅 Vercel 云端用）
│   │       ├── preset/[id]/route.ts   读打包进前端的预置 JSON
│   │       ├── followup/route.ts      调 DeepSeek 云端答疑
│   │       └── analyze/route.ts       云端直接返回 501（真实分析仅本地）
│   ├── components/
│   │   ├── InputPage.tsx           输入页
│   │   ├── LoadingPage.tsx         加载页（环形进度+分步清单+品牌猫）
│   │   ├── ResultPage.tsx          ★核心页！横向单卡滑动，踩坑最多
│   │   └── RefsPage.tsx            「来源详情」页（参考文献[权威] + 视频源）
│   ├── data/presets/1|2|3|5.json   预置数据（打包进前端，云端 demo 靠它）
│   ├── public/brand/               品牌猫等静态图（如 cat-checking.png）
│   ├── types.ts                    ★全部类型定义，改数据结构先看它
│   └── vercel.json                 {"framework":"nextjs"} 强制识别，否则部署报错
├── backend/
│   ├── main.py                     FastAPI 单文件，全部后端逻辑
│   ├── ingest.py                   离线灌库：真实链接→转写→分析→写 presets/*.json
│   ├── ingest_config.json          灌库话题+链接配置
│   ├── presets/1-5.json            后端版预置数据（与 frontend/data/presets 内容同步）
│   ├── .env(不上传) / .env.example(占位) / requirements.txt
├── poster/                         比赛海报（HTML/CSS 可编辑版）
├── README.md                       组员上手指南
├── DEPLOY.md                       GitHub+Vercel 部署手册
├── CONTEXT_FOR_NEW_AI.md           本文件
└── .gitignore
```

---

## 三、技术栈与关键约束
- **前端**：Next.js 14 App Router + TS + Tailwind；长图导出 `html2canvas`。
- **后端**：Python + FastAPI，单文件 `main.py`。
- **大模型**：DeepSeek（OpenAI 兼容接口，Python 用 `openai` SDK，Next 云函数用 fetch）。
  - ⚠️ **头号坑**：模型 `deepseek-v4-pro` 是**推理模型**，先花 token 在隐藏 `reasoning_content` 上再输出 `content`。`max_tokens` 给小了（1024/2048）→ 推理耗尽额度 → `content` 返回**空字符串**、`finish_reason:"length"`。**所有调用一律 `max_tokens >= 8192`**，新增调用处也必须遵守。
- **视频提取**：TikHub API（`api.tikhub.io/api/v1/douyin/web/fetch_one_video`），需 `TIKHUB_TOKEN`。
- **语音转写**：本地 `openai-whisper`（CPU/FP32，会打 FP16 警告，忽略即可）+ ffmpeg（须在系统 PATH，否则报 `WinError 2`；用 `conda install -c conda-forge ffmpeg` 装的）。
- **关键帧 OCR**：`rapidocr-onnxruntime`，纯本地 Python，不依赖外部 API。
- **部署**：GitHub 仓库 `chenyufengedu-dev/fitproof`（已设 **Public**）+ Vercel。线上 **https://fitproof-11cs.vercel.app/**（云端只支持预置话题浏览 + AI 答疑；真实链接分析返回 501）。

### 环境变量
`backend/.env`（gitignore，不上传）：
```
TIKHUB_TOKEN=...
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
```
Vercel 项目环境变量：同上三个 `DEEPSEEK_*`（云端无 TIKHUB）。
本地跑完整版要在 `frontend/.env.local` 设 `NEXT_PUBLIC_API_URL=http://localhost:8000`（有值→连本地 Python 后端；无值→走 Vercel 云函数）。

---

## 四、后端接口（main.py）
- `GET /api/health` → `{"ok":true}`
- `GET /api/preset/{id}`（1/2/3/5）→ 读 `backend/presets/{id}.json`
- `POST /api/analyze`（仅本地，约 1-3 分钟/次）→ 解析抖音短链 → TikHub 取信息 → 下音频 → Whisper 带时间戳转写 → DeepSeek 从转写挑关键帧时间点 → ffmpeg 截帧 → RapidOCR 读画面文字 → 转写+画面文字一起喂 DeepSeek 出结构化分析。
- `POST /api/followup` → 基于已生成 analysis 做答疑，要求引用编号、不编造分析外内容。

`ingest.py`：批量版，给话题+链接列表跑完整流程直接写 `presets/{id}.json`，用于离线备好预置数据。

---

## 五、核心数据结构（frontend/types.ts）
```typescript
interface VideoRef { id: number; time: string }   // 某观点出自哪个视频第几分几秒
interface Consensus { point: string; video_refs?: VideoRef[]; authority_ids?: string[]; screen_evidence?: string }
interface ConflictPosition { argument: string; video_refs?: VideoRef[]; screen_evidence?: string }
interface Conflict { topic: string; pro: ConflictPosition; con: ConflictPosition; evidence_note?: string; authority_ids?: string[] }
interface Recommendation { condition: string; advice: string; video_refs?: VideoRef[]; authority_ids?: string[] }
interface Misleading { claim: string; video_refs?: VideoRef[]; correction: string; authority_ids?: string[] }
interface Authority { id: string; name: string; note: string }         // 真实存在的机构/指南
interface Reference { id: number; author: string; title: string; claim: string; url: string }  // 视频来源
interface Analysis {
  one_line_summary: string
  consensus: Consensus[]; conflicts: Conflict[]; recommendations: Recommendation[]
  references: Reference[]; misleading?: Misleading[]; authorities?: Authority[]
}
```
**两套引用体系，绝不能混：**
1. `video_refs`（视频出处）→ 点击**只弹底部抽屉**显示"视频几+时间点"，**不计入参考文献编号**（只是溯源，不是学术引用）。
2. `authority_ids`（权威依据）→ 正文渲染成 `[1][2]…`，编号来自 `authorities` 数组顺序，点击弹抽屉/跳「来源详情」。**绝不能编造论文标题/年份/DOI**，只引用真实机构名（ACSM/ISSN/ADA/WHO 等）；所有相关 prompt 都反复强调这条，新增/修改 prompt 务必保留。

---

## 六、前端核心页 ResultPage.tsx（踩坑最多，重点看）
**交互=横向单卡滑动（类探探）**：任意时刻只显示**一张卡**，左右拖拽切上一/下一张。**不是横排多卡滚动**（做错过，被纠正）。6 张卡固定顺序：**核验结论 → 共识提取 → 分歧对照 → 适用边界 → 说法校验 → AI 答疑**。

**两个必须保留的实现细节（改错会复现已修 bug）：**
1. **拖拽用命令式 DOM**：拖动时直接 `frontRef.current.style.transform=...`，不 `setState`；否则每帧重渲染 → 卡顿（用户报过"很卡"）。只有松手决定切卡才 `setIndex`。`useLayoutEffect` 监听 `index` 变化复位 transform/opacity，防"飞出的卡残留"。
2. **卡片用普通函数渲染不是组件**：现为 `const renderCard=(section)=>{…}`，用 `{renderCard(cur)}` **不是** `<Card .../>`。写成组件的话，输入框 onChange 的 setState 会让 React 把 Card 当新组件类型 → 卸载重建 → **输入框打一个字就失焦**（用户报过，根因就是这个）。

**底部抽屉**：所有引用交互（视频出处/权威/画面）统一从底部滑出，不跳页、不打断阅读（`animate-slideUp`/`animate-fadeIn`）。

**视觉规范**：无渐变/无紫色/非 Inter 模板味；警示信息只用**小标签**（琥珀胶囊），不做大面积警告色块（"判定"曾整块黄底被要求改小）；"专业依据"指标卡不用纯黑底（曾被嫌抢眼，已改深青 `#0B6E63`）；分歧卡 A/B 视频播放三角**统一朝右**不镜像（左右差异靠气泡位置+编号）。

**分歧对照卡固定结构**（产品高潮页，顺序别乱）：分歧问题 → 视频说法A（带出处）→ VS 分隔 → 视频说法B → 分歧根源（从数据一句话归纳，不写死）→ FitProof 核验判断卡（判定 / 误导风险小标签 / 依据强度条 / 主流证据说明 + `[n]`）。

**AI 答疑卡**（曾叫"追问"，用户明确**不许叫"问医生"**——是 AI 不是医生）：能对视频里的名词做通俗解释（如"什么是 HIIT"），别机械回"未涉及"（这条 prompt 约束别退回去，之前太死板被报 bug）。有"快捷问题"按钮降低门槛。

**通用性铁律**：所有卡片内容必须从 `analysis` 数据动态渲染，**绝不为某一话题写死文案**（预置话题有多个，写死只对一个生效=bug）。用户反复强调。

---

## 七、GitHub 协作机制（大区赛阶段新增，重要）
仓库 `chenyufengedu-dev/fitproof` 已设 **Public**，main 分支加了 **Ruleset 保护**（Require a pull request before merging；Required approvals=0；Restrict deletions + Block force pushes）。**用户本人（Repository admin）已加入 Bypass list**，所以**用户能直接 push main，组员不能**。

**协作哲学（关键，别搞错）**：用户是"唯一整合者"，组员是"创意/原型实验室"。组员各自用自己的 AI 在**分支或 fork** 上折腾，通过 **PR** 给用户看。但组员的 AI 生成代码风格/命名/框架往往和主项目不一致——所以**不要求把组员的代码直接合并进 main**。用户的做法是：好想法要么直接合并（风格干净时），要么**当参考，由你（主 AI）照主项目风格重新实现**，保证 main 始终一套统一代码。你协助用户时：帮他读 PR 的 diff、判断值不值得采纳、需要时把某个效果"翻译"进主项目风格。

**日常同步**：用户改完自己的（AI 辅助）代码要同步 GitHub 时：`git add . && git commit -m "…" && git push`（他在 bypass list，能直接推 main）。已确认 `.env` 密钥不会上传。

---

## 八、开发约定（务必遵守）
1. 数据驱动，不写死文案——组件对任意 `analysis` JSON 都要正确渲染。
2. 不编造权威来源——只引用真实机构/指南名，不编论文/DOI。
3. DeepSeek 所有调用 `max_tokens >= 8192`。
4. 密钥安全——`backend/.env` 已 gitignore，新建含密钥文件前先 `git add -A -n` 预演确认不会被追踪。
5. 本地 vs 云端——靠 `NEXT_PUBLIC_API_URL` 有无值切换。
6. 改前端跑 `npx tsc --noEmit` 自查；改后端至少 `python -c "import main"` 确认能 import，再回报。
7. `.next` 缓存损坏报 `Cannot find module './xxx.js'`：先停 dev server、删 `.next`、重启 `npm run dev`；**别在 dev server 运行时跑 `next build`**（会写坏缓存，踩过）。

## 九、Windows 环境注意
- 终端默认 GBK，Python 打印中文/emoji 会乱码或 `UnicodeEncodeError`：脚本开头 `sys.stdout.reconfigure(encoding="utf-8")`，或 print 里别用 emoji/✓✗ 等符号。
- 抖音 CDN（`*.douyinstatic.com`）偶发 SSL EOF/限流短响应：下载逻辑已加**重试 + 浏览器 UA + 最小字节校验（<50KB 视为限流重试）**，别删这层保护。

---

## 十、当前状态与可继续方向
**已完成且稳定**：后端真实视频完整流程；前端 6 张卡统一 teal 医学风、拖拽流畅、已知 bug（失焦/卡顿/残留）全修；Vercel 云端可用；GitHub Public + 分支保护 + 组员协作已就绪；话题 1（空腹有氧）是唯一跑过真实抖音数据的预置话题（演示优先用它）。

**大区赛可继续打磨的方向（用户定优先级）**：
1. 预置话题质量——2/3/5 是演示数据，若评审深究真实性，用真实链接跑 `python backend/ingest.py` 补全。
2. 桌面端/大屏体验——目前主攻手机端横向单卡；宽屏布局、鸟瞰图（曾做过又收起）若要大屏演示需补。
3. 真实链接分析体验——流程对但慢（1-3 分钟），若现场演示真实链接需考虑加速/更好等待态。
4. 输入页、来源详情页细节打磨（之前精力集中在结果页）。
5. 置信度/依据强度目前是前端启发式计算（非模型输出），若评审追问算法，考虑改由 DeepSeek 输出更可信（曾提出但比赛期未做）。

---

## 十一、启动方式（本地完整版）
```bash
# 后端（终端1）
cd D:\PointMap\backend
python -m uvicorn main:app --port 8000

# 前端（终端2）— 需 frontend/.env.local 里有 NEXT_PUBLIC_API_URL=http://localhost:8000
cd D:\PointMap\frontend
npm run dev            # http://localhost:3000
```

祝大区赛顺利。有拿不准的设计决策，先查本文档；文档没写到的，先问用户再动手，别自作主张改动核心交互或推翻既有风格约定。
