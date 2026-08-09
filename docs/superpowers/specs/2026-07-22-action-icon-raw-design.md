# 行动建议卡原始图标替换设计

## 目标

将单视频“行动建议”卡中的动作图标替换为 `frontend/public/icon-raw/` 下的真实 SVG 资源，同时保持当前卡片尺寸、颜色、间距、布局和数据生成逻辑不变。

## 改动边界

- 只修改 `frontend/components/StepIcon.tsx`。
- 保留现有 `StepIcon` 和 `ICON_PATHS`，避免影响 `ResultPage.tsx`。
- 将当前别名形式的 `ActionIcon = StepIcon` 改为单独实现。
- 不修改 `SingleResultPage.tsx`、后端提示词、动作步骤数据或全局 CSS。

## 实现方式

1. 为单视频动作白名单建立静态文件映射：
   `home`、`shower`、`hairdryer`、`bandage`、`tub`、`doctor`、`stop`、`thermometer`、`hospital`、`water`、`food`、`rest`、`check`、`general`。
2. `ActionIcon` 渲染一个语义上为装饰性的 `span`，用 CSS `mask-image` 和 `-webkit-mask-image` 引用 `/icon-raw/<name>.svg`。
3. 使用 `background-color: currentColor`，继续继承行动卡现有主题色。
4. 未知、空值或非法名称统一回落到 `/icon-raw/general.svg`，不拼接未经白名单验证的 URL。
5. 透传现有 `className`，保持调用处的 `h-9 w-9`、居中和颜色类不变。

## 验证

- `npx tsc --noEmit` 退出码为 0；若存在范围外错误，单独报告并对目标组件做等价类型检查。
- 浏览器确认行动建议步骤使用 `/icon-raw/*.svg`，不再渲染原内联动作 SVG。
- 确认图标继承卡片主题色，尺寸和布局未变化。
- 确认 `ResultPage` 继续使用原有 `StepIcon`，没有视觉回归。
- 控制台没有由图标资源或组件产生的错误。

## 并发安全

本改动不触碰当前多人高频修改的 `SingleResultPage.tsx`、`ResultPage.tsx`、后端文件和全局样式。提交时只暂存本设计文档；实现阶段只暂存 `StepIcon.tsx`。
