"use client"

import { useEffect, useState } from "react"

interface ThinkingCatAnimationProps {
  className?: string
}

const poseSequence = [0, 0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1]
// 原来 8 个 pose-N.svg 各 480KB，它们的 <defs> 段逐字节相同（整套动画被下载 8 遍）。
// 现在只下一份 cat-thinking-sprite.svg（同样的 defs），把它注入文档后用 <use> 切帧。
const spriteUrl = "/brand/cat-thinking-sprite.svg"
const spriteHostId = "fitproof-cat-sprite"
// 每帧尾巴的摆动角度，取自原来各 pose 文件末尾的 rotate()。
const tailAngles = [5, 3.5, 2, 0.5, -0.5, -2, -3.5, -5]

let spritePromise: Promise<void> | null = null

/** 整页只注入一次雪碧图；<use> 靠同文档内的 id 引用，跨文件引用浏览器不支持。 */
function ensureSprite(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve()
  if (spritePromise) return spritePromise
  spritePromise = fetch(spriteUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.text()
    })
    .then((markup) => {
      if (document.getElementById(spriteHostId)) return
      const host = document.createElement("div")
      host.id = spriteHostId
      host.setAttribute("aria-hidden", "true")
      host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"
      host.innerHTML = markup
      document.body.appendChild(host)
    })
    .catch(() => {
      spritePromise = null
    })
  return spritePromise
}

/** 首页 FitProof 标题旁的思考小猫。素材由 FitProof-thinking 交付包提供。 */
export default function ThinkingCatAnimation({ className = "h-24 w-20" }: ThinkingCatAnimationProps) {
  const [frame, setFrame] = useState(0)
  const [spriteReady, setSpriteReady] = useState(false)

  useEffect(() => {
    let alive = true
    void ensureSprite().then(() => {
      if (alive) setSpriteReady(true)
    })
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % poseSequence.length)
    }, 115)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const pose = poseSequence[frame]

  return (
    <span
      className={`block shrink-0 overflow-visible ${className}`}
      role="img"
      aria-label="FitProof 小猫摸下巴并摆动尾巴"
    >
      {spriteReady && (
        <svg
          viewBox="0 0 618 762"
          shapeRendering="geometricPrecision"
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-[200%] w-[200%] max-w-none origin-top-left scale-50"
        >
          <g transform="translate(6 4) scale(.98) translate(-17 -17)">
            <g transform={`rotate(${tailAngles[pose]} 150 650)`} clipPath="url(#tail-source)">
              <use href="#fixed-cat" />
            </g>
            <use href="#fixed-cat" clipPath="url(#body-without-tail)" />
            <use href={`#pose-${pose}`} />
          </g>
        </svg>
      )}
    </span>
  )
}
