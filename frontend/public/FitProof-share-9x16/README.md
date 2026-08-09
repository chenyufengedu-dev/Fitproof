# FitProof 9:16 分享功能交付包

这是已经确认的 9:16 版本，输出固定为 **900 × 1600 PNG**。包内只包含分享海报的数据映射、图片生成、预览、保存与系统分享能力；不包含 API 路由、后端接口、模型调用、测试代码或业务页面接线。

## 包内能力

- 保留页眉品牌盾牌和核心结论区的浅色盾牌水印。
- 保留视频信息、重点说法来源标识、三色核验印章、真实二维码和纵向“更稳妥的做法”。
- 动作图标优先按上游英文 `icon` 名称匹配本地 SVG。
- 英文名未命中时，根据动作标题与说明的中英文语义匹配 SVG。
- 仍未命中时使用 `general.svg`；即使该文件误缺，也有内嵌通用 SVG 最终兜底。
- Web 端提供全屏预览、下载 PNG、支持设备上的文件分享，以及微信 / iPhone 长按保存提示。

## 目录

```text
FitProof-share-9x16/
├─ poster/                 9:16 HTML/CSS/Playwright 图片生成器
│  └─ assets/action-icons/ 动作 SVG 主目录
├─ renderer/render.js      本地文件输入/输出命令
├─ web/                    纯数据映射、预览、保存和系统分享
├─ examples/poster-data.json
├─ docs/preview.png
├─ package.json
└─ MANIFEST.md
```

## 安装图片生成依赖

要求 Node.js 18 或更高版本。

```bash
npm install
npx playwright install chromium
```

Linux 服务器还应安装可用的中文字体，例如 Noto Sans CJK。图片生成时会在 `poster/` 内短暂创建 `.mobile-*.html`，因此该目录需要写权限；生成结束后临时文件会自动删除。

## 生成示例图片

```bash
npm run render:example
```

输出位置为 `docs/preview.png`。

也可以指定输入和输出文件：

```bash
node renderer/render.js examples/poster-data.json result.png
```

## Node.js 中直接生成

```js
const { generateMobileV969x16Poster } = require('./poster/render_mobile_v9_6_9x16')

const pngBuffer = await generateMobileV969x16Poster(posterData)
// 由宿主决定写入文件、返回响应或交给原生桥接；本包不提供 API route。
```

`posterData` 的完整结构见 `web/types.ts` 和 `examples/poster-data.json`。生成器最多展示 3 条重点说法和 3 条真实动作，且至少需要 1 条说法；没有动作时显示明确空态，不补写建议。

## 从分享摘要映射海报数据

```ts
import { buildPosterData } from './web/buildPosterData'

const posterData = buildPosterData(shareSummary)
```

如果负责人暂时不接摘要接口，也可以使用包内的确定性纯函数跑通完整数据链：

```ts
import { buildShareRequest, buildFallbackShareSummary, buildPosterData } from './web'

const request = buildShareRequest(reportData, verifyStates, actions)
const summary = buildFallbackShareSummary(request)
const posterData = buildPosterData(summary)
```

这条链路不发送网络请求；没有合法口播来源的说法会在 `buildShareRequest` 阶段被排除。

映射层会保留 `actions[].icon` 的英文名称，不再按位置固定成三张图。建议上游直接传以下英文名之一：

`bandage`, `check`, `doctor`, `food`, `general`, `hairdryer`, `home`, `hospital`, `pill`, `rest`, `shower`, `stop`, `thermometer`, `tub`, `water`

兼容旧名称 `towel`, `dryer`, `sleep`，也兼容 `dry`, `blow-dry`, `medicine`, `clinic`, `hydrate`, `egg`, `milk`, `meat`, `veggie`, `grain` 等别名。解析器会遍历包内及同一项目目录中的 SVG，但只把规范化后的英文文件名作为候选，不接受调用方提供的文件路径。

匹配顺序固定为：

1. `icon` 英文文件名精确匹配；
2. 英文别名匹配；
3. `title + desc` 文案语义匹配；
4. `general.svg`；
5. 内嵌通用 SVG。

## 预览、保存与系统分享

`web/SharePosterPreview.tsx` 是独立 React 客户端组件，不请求任何接口。宿主只需传入已经生成的 PNG `Blob`：

该目录面向已有的 React 18+ Web 项目，组件样式由同目录 `SharePosterPreview.css` 提供。

```tsx
<SharePosterPreview
  open={previewOpen}
  status="ready"
  imageBlob={posterBlob}
  filename="FitProof-健康核验海报.png"
  onClose={() => setPreviewOpen(false)}
/>
```

组件会清理 Blob URL，并在支持 `navigator.canShare({ files })` 的设备上分享真实 PNG 文件。若浏览器不支持文件分享，预览会保留并提示先保存；部分微信 WebView 与 iPhone 浏览器不可靠时，可长按预览图保存，正式 App / 小程序也可把同一个 Blob 接到宿主原生保存或分享桥接。

## 数据与事实边界

- `featured_claims[].original_claim` 必须来自视频转写原文，不能在分享阶段重写。
- 建议宿主在进入本模块前校验：`source_kind === 'transcript'`，且 `source_quote`、`source_ids`、`source_time` 均非空，并保证展示原话等于 `source_quote`。
- 本包不读取数据库、不检索证据、不调用模型，也不会补写新的医疗结论。
- 远程视频封面依赖运行环境网络；为避免图片生成受网络波动影响，优先传 `data:image/...` URL，空封面会使用内置占位图。
- `references[]` 只展示真实传入的前两项；为空时显示“完整依据请查看报告”，不会写死机构或指南名称。
- 动作只展示真实输入的 0–3 条；不会为凑版式补写行动建议。高风险会优先使用红色印章，但印章文字仍保留原 verdict。

## 二维码说明

当前二维码是 `poster/assets/fitproof-report-qr.jpg`，实际指向 `http://47.97.70.128:8080/`。本包不包含二维码接口或动态生成逻辑；正式地址变化时，由负责人直接替换这张同尺寸图片。

原始 900 × 1600 PNG 可正常识别二维码；若聊天平台把整张海报实际压缩到约 450px 宽以下，扫码成功率会明显下降，交付时应尽量发送原图。

## 明确未包含

- Next.js / FastAPI API 路由及 `fetch` 接线；
- 后端摘要、模型调用、鉴权、数据库与环境变量；
- `SingleResultPage` 等业务页面；
- 单元测试、端到端测试与历史测试截图；
- `node_modules`、缓存、日志和旧版海报实现。
