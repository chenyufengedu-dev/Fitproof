# 观点地图 · AI实现提示词

把以下内容完整发给 AI（Claude 或 Cursor），让它生成整个项目。

---

## 提示词正文

请帮我创建一个完整的全栈项目，项目名叫「观点地图」。

这是一个参加「赛道二 · 抖音精选-内容重构：让视频成为你的生活搭子」的比赛项目。项目重点不是做普通视频总结器，而是把同一话题下多条抖音视频中的观点、共识、分歧和适用建议，重构成用户能看懂、能判断、能追问、能溯源的「观点地图」。

核心表达：

> 当同一个问题被不同视频说得互相矛盾时，观点地图帮你看清共识、分歧和适合自己的判断路径。

---

## 一、项目目标

用户粘贴 2-5 条抖音视频链接，后端提取视频音频，使用 Whisper 转录，再调用 Claude 分析，输出结构化的「观点地图」。

观点地图必须包含：

- 一句话结论
- 共识列表
- 分歧列表
- AI 建议
- 可点击的参考来源编号
- 继续追问
- 鸟瞰图
- 保存为长图

比赛现场必须优先保证 Demo 可体验，所以项目需要同时支持：

1. **预置话题主路径**：评委点击预置话题后，可以稳定体验完整流程。
2. **真实链接分析加分路径**：用户粘贴真实抖音链接后，后端尝试实时分析；失败时给出友好提示，不影响预置话题体验。

---

## 二、技术栈

- 前端：Next.js 14 App Router + TypeScript + Tailwind CSS
- 后端：Python + FastAPI，所有接口集中在单文件 `main.py`
- 项目结构：两个独立项目，分别放在 `frontend/` 和 `backend/`
- 前端长图导出：`html2canvas`
- 后端视频信息：TikHub API
- 后端语音转文字：openai-whisper
- 后端大模型：Anthropic Claude

---

## 三、项目文件结构

```text
opinion-map/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── InputPage.tsx
│   │   ├── LoadingPage.tsx
│   │   ├── ResultPage.tsx
│   │   └── RefsPage.tsx
│   ├── types.ts
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── .env.local
├── backend/
│   ├── main.py
│   ├── presets/
│   │   ├── 1.json
│   │   ├── 2.json
│   │   └── 3.json
│   ├── .env
│   ├── .env.example
│   └── requirements.txt
└── README.md
```

---

## 四、类型定义（frontend/types.ts）

```typescript
export interface Consensus {
  point: string
  sources: number[]
}

export interface ConflictPosition {
  argument: string
  sources: number[]
}

export interface Conflict {
  topic: string
  pro: ConflictPosition
  con: ConflictPosition
}

export interface Recommendation {
  condition: string
  advice: string
  sources: number[]
}

export interface Reference {
  id: number
  author: string
  title: string
  claim: string
  url: string
}

export interface Analysis {
  one_line_summary: string
  consensus: Consensus[]
  conflicts: Conflict[]
  recommendations: Recommendation[]
  references: Reference[]
}

export interface PresetData {
  topic: string
  links: string[]
  analysis: Analysis
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type PageState = 'input' | 'loading' | 'result' | 'refs'
```

注意：所有来源统一用数字编号，例如 `[1]`、`[2]`。前端展示时把 `sources: [1, 3]` 渲染成可点击的 `[1] [3]`，点击后进入参考来源页并定位到对应来源。

---

## 五、前端实现要求

### 1. app/page.tsx

使用 `useState` 管理页面状态：

- `pageState: PageState`
- `analysis: Analysis | null`
- `topic: string`
- `refsFocusId: number | null`

页面路由逻辑：

- `input`：渲染 `InputPage`
- `loading`：渲染 `LoadingPage`
- `result`：渲染 `ResultPage`
- `refs`：渲染 `RefsPage`

API base URL：

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
```

真实链接分析流程：

1. 用户在 `InputPage` 点击「开始分析」
2. `page.tsx` 先切换到 `loading`
3. 调用 `POST /api/analyze`
4. 成功后进入 `result`
5. 失败后回到 `input` 并显示错误提示

预置话题流程：

1. 用户点击预置话题
2. `InputPage` 调用 `GET /api/preset/{id}`
3. 加载成功后可以短暂展示 `loading` 页面 1-2 秒，模拟完整 AI 分析过程
4. 然后进入 `result`

---

### 2. InputPage.tsx

Props：

```typescript
interface InputPageProps {
  onAnalyze: (links: string[], topic: string) => Promise<void>
  onPresetLoaded: (analysis: Analysis, topic: string) => void
  initialError?: string
}
```

页面内容：

- 大标题：「观点地图」
- 副标题：「把互相冲突的视频，整理成你能判断的地图」
- 话题名称输入框，placeholder：「给这组视频起个话题名，如：鱼油到底有没有用」
- 多行链接输入框，placeholder：「每行粘贴一条抖音视频链接，支持 2-5 条」
- 主按钮：「开始生成观点地图」
- 三个预置话题按钮：
  - 「鱼油到底有没有用」
  - 「简历该写几页」
  - 「空腹运动好不好」

校验规则：

- 按换行分割链接，过滤空行
- 链接数量必须为 2-5 条
- 每条链接必须包含 `douyin.com`
- 校验失败时，在按钮下方显示红色错误提示

预置话题说明：

- 按钮附近显示一行小字：「比赛 Demo 可直接体验，也支持粘贴真实链接分析」
- 预置话题是比赛稳定主路径，必须可用

---

### 3. LoadingPage.tsx

Props：

```typescript
interface LoadingPageProps {
  topic: string
}
```

不要只显示一个 spinner，要做成四步进度，让评委感受到 AI 正在做「内容重构」。

四步文案：

1. 正在提取视频内容
2. 正在识别核心观点
3. 正在交叉对比共识与分歧
4. 正在生成观点地图

实现要求：

- 使用 `useEffect` 每隔 700-1000ms 激活下一步
- 已完成步骤显示勾选状态
- 当前步骤显示 Tailwind `animate-pulse` 或 `animate-spin`
- 页面显示话题名
- 文案：「正在把分散的视频观点重构成一张地图」

---

### 4. ResultPage.tsx

Props：

```typescript
interface ResultPageProps {
  analysis: Analysis
  topic: string
  onViewRefs: (focusId?: number) => void
  onBack: () => void
}
```

顶部：

- 显示话题名
- 显示一句定位文案：「从刷到内容，到获得判断」
- 右侧或下方提供模式切换：
  - 「卡片流」
  - 「鸟瞰图」
- 提供「重新输入」按钮

#### 卡片流模式

卡片流是核心展示页，必须看起来像「观点地图」，不能只是普通摘要。

用一个 `ref` 包住可导出的区域，导出范围包含：

1. 一句话结论
2. 共识区
3. 分歧区
4. AI 建议

不要把继续追问区默认导出。如果用户已经追问过，可以在导出按钮旁边提供 checkbox：「导出时包含追问记录」。

五个区块：

**区块 1：一句话结论**

- 展示 `analysis.one_line_summary`
- 视觉上作为整张地图的总判断

**区块 2：共识区**

- 标题：「共识区」
- 渲染 `analysis.consensus`
- 每条展示：
  - 观点文字
  - 来源编号，例如 `[1] [3]`
- 来源编号必须可点击，点击后调用 `onViewRefs(id)`

**区块 3：分歧区**

- 标题：「分歧区」
- 渲染 `analysis.conflicts`
- 每个争议点展示：
  - 争议标题
  - 支持方观点
  - 反对方观点
  - 双方来源编号
- 支持方和反对方用不同颜色区分

**区块 4：AI 建议**

- 标题：「AI 建议」
- 渲染 `analysis.recommendations`
- 每条展示：
  - 条件
  - 建议
  - 来源编号
- 建议必须强调边界条件，不能写成空泛鸡汤

**区块 5：继续追问**

- 标题：「继续追问」
- 提示：「只基于以上视频分析回答，不引入外部信息」
- 输入框 + 发送按钮
- 对话历史列表
- 发送时调用 `POST /api/followup`
- 维护 `history: ChatMessage[]`
- loading 时禁用按钮
- 失败时显示错误提示

底部操作：

- 「查看参考来源」按钮
- 「保存为长图」按钮

#### 保存为长图

使用 `html2canvas`：

- 导出卡片流核心区域
- 文件名使用 `${topic}-观点地图.png`
- 导出中显示 loading 状态
- 如果导出失败，显示错误提示

#### 鸟瞰图模式

用纯 HTML + CSS + SVG 实现，不引入 D3。

布局：

- 一个 `relative` 容器，高度约 500px，桌面端可更高，移动端自适应
- 中心节点：共识区，显示「共识区」和共识条数
- 周围节点：每个争议点一个节点，显示争议标题
- SVG 连线：从中心连到每个争议点

节点位置用三角函数计算：

```typescript
const total = analysis.conflicts.length
const angle = (2 * Math.PI * index) / total - Math.PI / 2
const x = 50 + 35 * Math.cos(angle)
const y = 50 + 35 * Math.sin(angle)
```

交互：

- 点击中心节点，切回卡片流并滚动到共识区
- 点击争议节点，切回卡片流并滚动到对应分歧卡片
- 鸟瞰图下方同时展示选中争议点的简要详情

---

### 5. RefsPage.tsx

Props：

```typescript
interface RefsPageProps {
  references: Reference[]
  topic: string
  focusId?: number | null
  onBack: () => void
}
```

页面要求：

- 顶部按钮：「返回观点地图」
- 标题：「参考来源」
- 副标题：「共 N 条视频，所有观点均可回溯到原视频」
- 列表采用类似论文参考文献的紧凑格式

每条格式：

```text
[1] 作者名. 视频标题. 核心主张. 访问原视频
```

交互：

- 如果 `focusId` 有值，页面加载后滚动到对应来源
- 被定位的来源高亮显示
- 「访问原视频」用 `<a>` 外链打开，`target="_blank"`，`rel="noreferrer"`

---

## 六、后端实现要求（backend/main.py）

使用 FastAPI，加 CORS 中间件允许所有来源。

从 `.env` 读取：

```env
TIKHUB_TOKEN=在这里填入你的 TikHub token
ANTHROPIC_API_KEY=在这里填入你的 Anthropic API key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### 接口列表

- `GET /api/health`
- `GET /api/preset/{preset_id}`
- `POST /api/analyze`
- `POST /api/followup`

---

### 1. GET /api/health

返回：

```json
{ "ok": true }
```

---

### 2. GET /api/preset/{preset_id}

读取 `backend/presets/{preset_id}.json` 并返回。

要求：

- `preset_id` 只允许 `1`、`2`、`3`
- 其他 ID 返回 404
- 文件读取失败返回 500

---

### 3. POST /api/analyze

请求体：

```json
{
  "links": ["https://www.douyin.com/video/xxx"],
  "topic": "鱼油到底有没有用"
}
```

返回：

```json
{
  "one_line_summary": "...",
  "consensus": [],
  "conflicts": [],
  "recommendations": [],
  "references": []
}
```

处理流程：

**步骤 1：并行提取所有视频**

使用 `asyncio.gather` 并行处理 2-5 条链接。

对每条链接：

1. 如果包含 `v.douyin.com`，用 `requests.get(..., allow_redirects=True)` 拿重定向后的完整 URL
2. 从完整 URL 中提取视频 ID，优先匹配 `/video/数字`，兜底匹配最后一段纯数字
3. 调用 TikHub API：

```python
headers = {"Authorization": f"Bearer {TIKHUB_TOKEN}"}
params = {"aweme_id": video_id}
resp = requests.get(
    "https://api.tikhub.io/api/v1/douyin/web/fetch_one_video",
    headers=headers,
    params=params,
    timeout=30
)
detail = resp.json()["data"]["aweme_detail"]
title = detail.get("item_title") or detail.get("desc") or "未命名视频"
author = detail["author"]["nickname"]
audio_url = detail["music"]["play_url"]["uri"]
```

4. 下载 MP3 到临时文件
5. Whisper 转录：

```python
model = get_whisper_model()
result = model.transcribe(tmp_path, language="zh")
raw_text = result["text"]
```

6. Claude 清洁文字：

```text
将以下语音转录文本加上标点、去除明显口头语、纠正错别字。
要求：不改变原意，不总结，不删减任何观点，只输出修正后的文本。

{raw_text}
```

注意：

- Whisper 模型要全局懒加载并复用，不要每条视频重复加载
- 某条视频失败时捕获异常，记录错误，跳过该视频，继续处理其余视频
- 如果所有视频都失败，返回 502，并提示用户使用预置话题
- 同步的 requests 和 Whisper 操作可以用 `asyncio.to_thread` 包起来

**步骤 2：Claude 生成分析 JSON**

把所有视频的清洁文字拼入以下 Prompt，要求只输出 JSON：

```text
你是一个专业的信息分析师。以下是 {N} 条关于「{topic}」的视频文字内容。

你的任务不是简单总结，而是把这些分散甚至互相冲突的视频，重构成用户能判断的观点地图。

【视频内容】
视频1（{author}，标题：{title}）：{clean_text}
视频2（{author}，标题：{title}）：{clean_text}
...

请完成：
1. 提取每条视频的核心主张。
2. 找出多数视频都认同的共识。
3. 找出存在对立或适用条件不同的分歧。
4. 根据不同用户情境给出可执行建议。
5. 所有观点必须标注来源编号，例如 sources 使用 [1, 3]。

严格按以下 JSON 格式输出，不输出任何其他内容：

{
  "one_line_summary": "一句话总结整体判断，必须体现共识、分歧或适用边界",
  "consensus": [
    {
      "point": "共识观点",
      "sources": [1, 3]
    }
  ],
  "conflicts": [
    {
      "topic": "争议点标题",
      "pro": {
        "argument": "支持方观点和理由",
        "sources": [2]
      },
      "con": {
        "argument": "反对方观点和理由",
        "sources": [3]
      }
    }
  ],
  "recommendations": [
    {
      "condition": "如果你是 XX 情况",
      "advice": "具体可执行建议，必须有明确边界条件，不能泛泛而谈",
      "sources": [1, 2]
    }
  ],
  "references": [
    {
      "id": 1,
      "author": "作者名",
      "title": "视频标题",
      "claim": "该视频核心主张一句话",
      "url": "原链接"
    }
  ]
}
```

JSON 解析：

- 第一次解析失败时，调用 Claude 重试一次
- 重试 Prompt 要求它修复为合法 JSON
- 再失败返回 500
- 返回前做基本字段校验，确保包含五个顶层字段

Claude API：

```python
model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
max_tokens = 4096
```

---

### 4. POST /api/followup

请求体：

```json
{
  "analysis": {},
  "question": "我适合吃鱼油吗？",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

返回：

```json
{ "answer": "..." }
```

Prompt：

```text
已分析内容：
{json.dumps(analysis, ensure_ascii=False)}

对话历史：
{history}

用户问题：
{question}

请只基于已分析内容回答。
如果引用视频，必须使用来源编号，例如 [1]、[2]。
如果已分析内容没有涉及，直接回复：被分析的视频中没有涉及这个问题。
不要补充任何外部知识。
```

---

## 七、预置数据（backend/presets）

生成三个预置文件：

- `1.json`：鱼油到底有没有用
- `2.json`：简历该写几页
- `3.json`：空腹运动好不好

每个文件格式：

```json
{
  "topic": "话题名称",
  "links": [
    "https://www.douyin.com/video/demo-1",
    "https://www.douyin.com/video/demo-2",
    "https://www.douyin.com/video/demo-3"
  ],
  "analysis": {
    "one_line_summary": "...",
    "consensus": [],
    "conflicts": [],
    "recommendations": [],
    "references": []
  }
}
```

预置数据要求：

- 每个话题至少 3 条参考来源
- 每个话题至少 2 条共识
- 每个话题至少 2 个争议点
- 每个话题至少 3 条针对不同情境的建议
- 所有 `sources` 都必须对应 `references.id`
- 如果没有真实抖音视频来源，不要伪造真实作者和真实链接；可以明确使用「演示数据」作者和 demo 链接
- 内容要真实可信，观点要符合常识，避免明显医学、法律、职业建议风险

---

## 八、环境变量

### backend/.env

```env
TIKHUB_TOKEN=在这里填入你的 TikHub token
ANTHROPIC_API_KEY=在这里填入你的 Anthropic API key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### backend/.env.example

```env
TIKHUB_TOKEN=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### frontend/.env.local

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 九、requirements.txt

```text
fastapi
uvicorn
python-dotenv
requests
anthropic
openai-whisper
ffmpeg-python
```

---

## 十、frontend/package.json

需要包含：

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "html2canvas": "^1.4.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5"
  }
}
```

---

## 十一、启动方式

后端：

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

前端：

```bash
cd frontend
npm install
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

---

## 十二、README.md 内容要求

README 需要说明：

- 项目简介
- 赛道二匹配点
- 技术架构
- API 说明
- 环境变量配置
- 启动方式
- Demo 建议路径：
  1. 打开首页
  2. 点击预置话题「鱼油到底有没有用」
  3. 查看卡片流
  4. 切换鸟瞰图
  5. 点击来源编号查看参考来源
  6. 回到结果页继续追问
  7. 保存为长图

---

## 十三、最终要求

1. 所有代码必须直接可运行，不留 TODO。
2. 预置话题必须稳定可用，这是比赛 Demo 主路径。
3. 真实链接分析失败时不能白屏，要有友好错误提示并引导使用预置话题。
4. 前端每个请求都要有 loading、error、disabled 状态。
5. 类型定义完整，不使用 `any`。
6. UI 用 Tailwind 基础样式即可，但要突出「共识」「分歧」「来源」「地图」四个关键词。
7. 结果页必须体现内容重构，不要做成普通摘要页面。
8. 所有来源编号必须可点击并能跳转到参考来源页。
9. 必须实现保存为长图。
10. 必须实现四步加载进度。
11. 必须实现鸟瞰图与卡片流的联动。
12. 代码结构要简洁，方便 48 小时比赛内继续修改。
