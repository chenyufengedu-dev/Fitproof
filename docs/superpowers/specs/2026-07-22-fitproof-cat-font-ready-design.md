# FitProof 小猫字体就绪淡入设计

## 问题与根因

品牌标题初始以 226px 默认宽度渲染，随后在 `document.fonts.ready` 完成后重新测量真实 wordmark 宽度。小猫使用 `left: calc(100% + 1.75rem)` 锚定标题容器，因此容器宽度变化会让已显示的小猫横向跳位。

## 选定方案

采用方案①：字体和最终宽度尚未就绪时，小猫保持 `opacity: 0`；字体就绪后重新测量一次真实宽度，提交该宽度后发出 layout-ready 信号，小猫再于最终锚点淡入。

- 保留 `ThinkingCatAnimation` 组件、素材、尺寸、循环帧和最终位置不变。
- 新增 `onLayoutReady` 回调，由 `FitProofBrandIntro` 在字体就绪后的最终测量完成时触发。
- `InputPage` 在回调前使用 `opacity-0`，回调后切换为 `opacity-90`，仅添加约 300ms 的透明度过渡。
- 字体加载 Promise 失败或浏览器不支持 FontFaceSet 时也要完成一次测量并解除隐藏，不能永久隐藏小猫。
- 组件卸载后不得继续测量或触发 ready 回调。

## 不变项

首次 4.2 秒标题动画、完成后每 14 秒触发的 1.8 秒轻扫描、页面可见性暂停、reduced-motion 逻辑均不修改。小猫最终仍保持当前上移和右移后的对齐位置。

## 验收

- 自动测试证明：初次测量后、字体 Promise 未完成前不发 ready；Promise 完成后再次测量并发 ready；卸载后不再回调。
- 结构测试证明：小猫 ready 前透明、ready 后 `opacity-90` 且具有淡入过渡。
- `node --test frontend/components/__tests__/fitproof-brand-intro.test.mjs` 全部通过。
- `npx tsc --noEmit` 通过。
- 浏览器冷启动截图/采样确认小猫只在最终位置出现，标题循环扫描节奏不变。
