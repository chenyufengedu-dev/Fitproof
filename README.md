# FitProof · 运动健康短视频争议辨析工具

> 让 AI 替你多看一步。粘贴多条抖音运动健康视频链接，AI 跨视频提取观点、识别共识与分歧、对照运动医学证据（ACSM/ISSN/ADA 等）纠正可能不准确的说法，输出结构化「核验报告」。

**线上体验（示例话题）**：https://fitproof-11cs.vercel.app/

---

## 给组员：怎么把项目跑起来

### 你需要准备
- **Node.js 18+**（跑前端）
- **Python 3.10+**（跑后端；本机开发用 3.13 也可）
- **ffmpeg**（后端语音转写要用，建议 `conda install -c conda-forge ffmpeg`）
- **自己的 API Key**：DeepSeek（必填，用于分析/答疑）、TikHub（选填，用于真实链接分析）
  - 没有 key 也能看前端 UI + 预置话题，只是不能跑真实链接分析。

### 前端（只想看 UI / 改界面的组员，跑这个就够）
```bash
cd frontend
npm install
npm run dev
# 打开 http://localhost:3000
```
> 不设 `NEXT_PUBLIC_API_URL` 时，前端走内置的示例数据 + 云函数逻辑，能完整浏览预置话题和界面。

### 后端（要跑真实链接分析的组员）
```bash
cd backend
pip install -r requirements.txt
# 复制 .env.example 为 .env，填入自己的密钥
copy .env.example .env    # Windows
python -m uvicorn main:app --port 8000
```
然后在 `frontend/.env.local` 里加一行，让前端连本地后端：
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
再 `npm run dev`，即可体验含真实抖音链接分析的完整版。

---

## 目录速览
```
frontend/    Next.js 14 + TS + Tailwind，界面全在这
backend/     FastAPI 单文件 main.py，AI 分析流程全在这
CONTEXT_FOR_NEW_AI.md   ← 最重要！项目设计决策、踩坑记录、开发约定，改代码前先读
DEPLOY.md    GitHub + Vercel 部署手册
```

> **改代码前请先读 [`CONTEXT_FOR_NEW_AI.md`](CONTEXT_FOR_NEW_AI.md)**，里面写清了：为什么某些代码要这么写（比如 DeepSeek 的 max_tokens 必须≥8192、核心页拖拽为什么用命令式 DOM、引用体系的两套设计等）。遇到看着奇怪的代码，大概率是有意为之。

---

## 协作方式（重要）
1. **不要直接改 main**。各自建分支：`git checkout -b 你的名字/想做的功能`，改完 `git push -u origin 你的名字/xxx`。
2. 在 GitHub 上发起 **Pull Request**，由项目负责人 review 后择优合并。
3. **绝不提交密钥**：`.env` 已被 `.gitignore` 忽略，填 key 请只改本地 `.env`，不要改 `.env.example`。
4. 有好想法/好效果，PR 里描述清楚 + 截图，方便统一评估合并。

---

## 技术栈
前端 Next.js 14 / TypeScript / Tailwind；后端 Python + FastAPI；大模型 DeepSeek（OpenAI 兼容）；视频信息 TikHub；语音转写 openai-whisper；关键帧 OCR RapidOCR；部署 Vercel。
