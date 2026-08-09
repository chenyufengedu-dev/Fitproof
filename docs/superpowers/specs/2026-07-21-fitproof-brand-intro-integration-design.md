# FitProof 首页品牌动画接入设计

## 目标

把 `frontend/public/fitproof-brand-intro-handoff` 中的标题进入动画接入正式首页品牌卡，同时保持当前右侧 `ThinkingCatAnimation` 的组件、素材、位置、尺寸与循环行为不变。handoff 目录后续可整体删除，正式功能不得引用其中任何路径。

## 视觉与行为

首页继续使用现有品牌卡布局。静态 `FitProof` 标题替换为一次性的品牌进入动画：

1. `FitProof` 字母依次生成。
2. AI 放大镜从左向右扫描字标。
3. 下划线随扫描进度生成。
4. 副标题“让 AI 替你多看一步”在扫描完成后短暂强调。
5. 现有右侧动态小猫始终由 `ThinkingCatAnimation` 渲染，不使用 handoff 的静态 companion 小猫。

动画只在浏览器会话首次进入或页面刷新时播放。同一会话切换底部 Tab 后再回到首页时，直接展示最终状态。用户启用 `prefers-reduced-motion` 时也直接展示最终状态。

## 正式文件归属

- `frontend/components/brand/FitProofBrandIntro.tsx`：管理播放阶段、字标测量和整体动画 DOM。
- `frontend/components/brand/AiMagnifier.tsx`：只负责放大镜 SVG。
- `frontend/components/InputPage.tsx`：接入新标题组件，保留原有 `ThinkingCatAnimation` 节点及其 className。
- `frontend/app/globals.css`：加入以 `fitproof-brand-intro-` 为前缀的局部动画样式。
- `frontend/components/__tests__/fitproof-brand-intro.test.mjs`：检查正式路径、接入结构、播放策略、动效降级和现有小猫保留约束。

不复制 `fitproof-cat-companion-cropped.png`，因为正式方案不使用它。正式代码不得 import 或引用 `fitproof-brand-intro-handoff`。

## 组件边界

`FitProofBrandIntro` 只渲染标题、放大镜和下划线，并通过 `onPhaseChange` 告知 `InputPage` 当前阶段。它不渲染小猫、不控制品牌卡内容，也不操作页面导航。

`InputPage` 保留当前品牌卡和 `ThinkingCatAnimation`。它仅新增 intro phase 状态，把阶段 class 提供给品牌卡和副标题，实现副标题联动。

动画使用 CSS keyframes，不引入 Framer Motion、Lottie 或新的运行时依赖。

## 状态与容错

- 初始阶段为 `preparing`，避免 hydration 时闪现最终标题。
- 允许播放时，下一帧进入 `playing`，约 4.2 秒后进入 `complete`。
- sessionStorage 不可用时不得阻止首页渲染；回退为本次播放。
- 组件卸载时清理 `requestAnimationFrame`、timeout 和 resize listener。
- 字体加载完成与窗口尺寸变化时重新测量字标宽度，使下划线与扫描终点跟随真实文字宽度。

## 测试与验收

- 先添加结构回归测试，并确认它因正式组件尚不存在而失败。
- 实现后运行 Node 结构测试和 `npx tsc --noEmit`。
- 检查 production code 不包含 handoff 路径或静态 companion 图片路径。
- 浏览器验证手机与桌面宽度：字标不裁切、下划线对齐、现有动态小猫位置与大小不变、动画结束后输入区可立即使用。
- 浏览器验证刷新会播放，同一会话切换 Tab 后返回不重播，reduced-motion 直接显示完成状态。
