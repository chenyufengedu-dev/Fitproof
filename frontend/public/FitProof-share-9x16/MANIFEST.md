# 交付清单

## 图片生成

- `poster/render_mobile_v9_6_9x16.js`：最终 900 × 1600 入口。
- `poster/render_mobile_v9_4_compact.js`：安全模板注入与动作图标解析。
- `poster/stamp.js`：三色核验印章。
- `poster/action-icon-resolver.js`：SVG 遍历、英文名、别名、语义与通用回退。
- `poster/fitproof_share_poster_v9_4_compact.html`：最终模板结构。
- `poster/poster_mobile_v9_4_compact.css`、`poster/poster_mobile_v9_3_background_fix.css`、`poster/poster_mobile_v9_6_9x16.css`：最终样式链。
- `poster/assets/shield.svg`：页眉盾牌与核心结论水印。
- `poster/assets/fitproof-report-qr.jpg`：当前真实二维码。
- `poster/assets/towel.svg`、`dryer.svg`、`sleep.svg`：旧英文名称兼容资源。
- `poster/assets/action-icons/*.svg`：15 枚动作 SVG 主集。

## Web 端

- `web/types.ts`：独立输入输出类型。
- `web/buildShareRequest.ts`：分享可用状态、口播来源锁定、输入组装和内存缓存键。
- `web/buildFallbackShareSummary.ts`：无需接口或模型的确定性摘要。
- `web/buildPosterData.ts`：`ShareSummary → PosterData` 纯映射。
- `web/shareBrowser.ts`：PNG 下载与文件分享。
- `web/SharePosterPreview.tsx`、`.css`：全屏预览、保存、分享和关闭。
- `web/styles.d.ts`：CSS 模块类型声明。
- `web/index.ts`：统一导出。

## 示例与说明

- `renderer/render.js`：文件式本地渲染命令。
- `examples/poster-data.json`：完整输入示例。
- `docs/preview.png`：恢复水印后的最终比例预览。
- `README.md`：负责人接手说明。

## 排除项

本包不含 API route、后端、模型、数据库、鉴权、业务页接线、测试、密钥、环境文件、依赖目录、缓存、历史 PNG 或旧海报版本。
