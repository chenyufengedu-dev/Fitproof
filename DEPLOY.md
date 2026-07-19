# FitProof 部署到 GitHub + Vercel（让用户扫码体验）

云端版只跑「示例话题 + AI 答疑」（无需 Python/Whisper）。真实链接分析仅本地完整版可用。

## 一、把代码传到 GitHub

> ⚠️ 先确认 `backend/.env`（含真实密钥）不会被上传——本仓库已用 `.gitignore` 排除，照下面做即可。

在 `D:\PointMap` 目录下：

```bash
git init
git add .
git commit -m "FitProof demo"
# 在 GitHub 网站新建一个空仓库，拿到地址后：
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

提交前可执行 `git status` 确认 **没有出现 `backend/.env`**（应被忽略）。

## 二、在 Vercel 部署

1. 打开 https://vercel.com ，用 GitHub 账号登录。
2. **Add New → Project**，选刚才的仓库 **Import**。
3. 关键设置：
   - **Root Directory** 选 `frontend`（项目在子目录里，必须改这个）。
   - Framework 会自动识别为 Next.js。
4. 展开 **Environment Variables**，添加三个（值用你本地 `backend/.env` 里的）：
   | Name | Value |
   |---|---|
   | `DEEPSEEK_API_KEY` | 你的 DeepSeek 密钥 |
   | `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
   | `DEEPSEEK_MODEL` | `deepseek-v4-pro` |
   > 不要设置 `NEXT_PUBLIC_API_URL`（留空，云端才会走内置云函数）。
5. **Deploy**，等 1–2 分钟，得到网址，例如 `https://你的项目.vercel.app`。

## 三、生成二维码放进海报

把上面的 Vercel 网址填进 `poster/poster.html` 里的 `DEMO_URL`，二维码会自动生成（见 poster 文件顶部说明）。

## 四、现场引导

- 用户扫码 → 打开网页 → 点示例话题「空腹有氧好不好」→ 浏览卡片、看分歧对照、AI 答疑。
- 真实链接分析在云端会提示"仅支持示例话题"，需要演示真实分析时用本地完整版。

## 本地完整版（含真实链接分析）启动方式不变

```bash
# 后端
cd backend
python -m uvicorn main:app --port 8000
# 前端（需在 frontend/.env.local 设 NEXT_PUBLIC_API_URL=http://localhost:8000）
cd frontend
npm run dev
```
