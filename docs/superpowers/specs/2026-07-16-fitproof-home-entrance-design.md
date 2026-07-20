# FitProof 首页入场动画设计

## 目标

为首页的 FitProof 品牌区增加一次性、克制的入场动画，同时保持标题文字为可索引、可朗读的真实 HTML。

## 视觉与时间线

- `Fit` 与 `Proof` 是同一个 `h1` 中的两个内联文本片段；每片包在固定行高的裁切容器中，分别从下方显现并轻微上移落定。`Proof` 比 `Fit` 晚 100ms。
- 副标题“让 AI 替你多看一步”在主标题落定前后以低幅度淡入。
- 右侧透明 Lottie 场景只包含问号与小猫：问号轻微弹出，小猫抬起并回到静止。动画总时长 1.2 秒且仅播放一次。
- 静态版与动画版共用固定的容器尺寸；不使用测量、延迟插入或位移占位，因此桌面和移动端均不产生布局偏移。

## 实现边界

- 新的 `HomeEntranceMark` 组件持有 `h1`、副标题和 Lottie `<canvas>` 容器。标题本身始终是可见于 DOM 的文本，而 Lottie 不复制品牌文字。
- Lottie JSON 放在 `frontend/public/projects/fitproof-home-entrance/scene-1/lottie.json`，背景透明，供首页通过 Skottie 播放器包装组件加载。
- CSS keyframes 仅负责文本进场与无动画回退；`prefers-reduced-motion: reduce` 下所有元素直接呈现最终状态，Lottie 不播放。
- 页面加载后使用 `IntersectionObserver` 添加一次已播放状态；首屏当前可见时立即播放，离开后重新进入不再播放。

## 验证

- 以 JSON 解析、Skottie 固定帧检查（首帧、中点、末帧）验证 Lottie。
- 在桌面与移动视口截图检查标题裁切、猫的位置及无重排；同时检查减弱动态媒体条件。
- 运行前端 lint/build 以确认集成无类型或构建错误。
