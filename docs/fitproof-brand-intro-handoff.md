# FitProof 首页品牌动画交付

本交付对应首页白色品牌卡片中的 `FitProof`、AI 放大镜、小猫、下划线以及标题联动动画。

## 文件清单

| 文件 | 用途 |
| --- | --- |
| `frontend/components/FitProofIntroAnimation.tsx` | 动画时间轴、Logo 字母、放大镜、下划线与小猫的组合逻辑。 |
| `frontend/components/AiMagnifier.tsx` | 放大镜 SVG 图形与颜色。 |
| `frontend/components/FitProofTitleAnimation.tsx` | 首页使用的兼容包装组件。 |
| `frontend/components/InputPage.tsx` | 首页品牌卡片的接入位置与动画阶段状态。 |
| `frontend/app/globals.css` | 以 `Homepage brand entrance: V4 AI scan generation` 注释开始的动画样式与关键帧。 |
| `frontend/public/brand/fitproof-cat-companion-cropped.png` | 当前品牌动画实际使用的小猫素材。 |
| `frontend/components/__tests__/fitproof-brand-intro.test.mjs` | 品牌动画结构回归测试。 |

## 本版行为

1. `FitProof` 逐字出现。
2. 放大镜从左向右扫过文字；扫到的字母短暂放大、提亮并呈现轻微青绿色折射。
3. 下划线与扫描进度同步从左向右生成，宽度随文字实际测量值对齐。
4. 小猫在后段进入并停留。

## 本地验证

在 `frontend` 目录运行：

```powershell
node --test components\__tests__\fitproof-brand-intro.test.mjs
npm.cmd run build
```

## 运行

```powershell
cd frontend
npm.cmd run dev -- -p 3001
```

打开 `http://127.0.0.1:3001/`。首次进入或浏览器刷新会播放启动动画；同一会话内再次进入会停在最终状态。
