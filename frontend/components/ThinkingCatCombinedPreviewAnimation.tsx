"use client"

import ThinkingCatAnimation from "@/components/ThinkingCatAnimation"

interface ThinkingCatCombinedPreviewAnimationProps {
  className?: string
}

/** 交付包审批页使用的别名，正式首页与预览页共享同一套 8 姿势动画。 */
export default function ThinkingCatCombinedPreviewAnimation({ className }: ThinkingCatCombinedPreviewAnimationProps) {
  return <ThinkingCatAnimation className={className} />
}
