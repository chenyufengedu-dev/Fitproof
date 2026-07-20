"use client"

import { useEffect, useState } from "react"

interface ThinkingCatAnimationProps {
  className?: string
}

const poseSequence = [0, 0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1]
const poseSources = Array.from(
  { length: 8 },
  (_, pose) => `/brand/cat-thinking-poses/pose-${pose}.svg`,
)

/** 首页 FitProof 标题旁的思考小猫。素材由 FitProof-thinking 交付包提供。 */
export default function ThinkingCatAnimation({ className = "h-24 w-20" }: ThinkingCatAnimationProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    poseSources.forEach((source) => {
      const image = new Image()
      image.src = source
    })
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % poseSequence.length)
    }, 115)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <span
      className={`block shrink-0 overflow-visible ${className}`}
      role="img"
      aria-label="FitProof 小猫摸下巴并摆动尾巴"
    >
      <img
        src={poseSources[poseSequence[frame]]}
        className="pointer-events-none absolute left-0 top-0 h-[200%] w-[200%] max-w-none origin-top-left scale-50 object-contain [image-rendering:auto]"
        alt=""
        decoding="sync"
        draggable={false}
      />
    </span>
  )
}
