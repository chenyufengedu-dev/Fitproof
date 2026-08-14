'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveKnowledgeSwipe, visibleKnowledgeIndexes, wrapKnowledgeIndex } from './loadingKnowledgeCarousel.mjs'

interface LoadingPageProps {
  topic: string
  mode?: 'single' | 'dual'
  /** 分析起始时间戳（由父组件持有，切 Tab 重挂载后进度可续算）。0/缺省时退回本地起点。 */
  startedAt?: number
}

// 由「已过去的毫秒」推算假进度：与旧的 +4/560ms→56、+2/560ms→88 曲线等价。
// 因为只依赖 startedAt，组件被卸载再挂载也会算回同一个值，不会归零。
function computeProgress(elapsedMs: number) {
  const ticks = elapsedMs / 560
  const p = ticks <= 9.5 ? 18 + ticks * 4 : 56 + (ticks - 9.5) * 2
  return Math.min(88, Math.max(18, Math.round(p)))
}

const STEPS = ['读取视频文字稿与时间点', '抽取争议说法与核心论据', '对照运动医学证据来源', '计算风险边界', '生成 FitProof 核验报告']
const STEP_SHORT_NAMES = ['提取观点', '交叉验证', '验证证据', '风险判断', '生成报告']

const KNOWLEDGE_CARDS = [
  {
    title: '蓝莓含有花青素',
    body: '花青素属于天然植物色素；把蓝莓作为多样水果的一部分即可。',
    image: '/knowledge-cards/blueberries.webp',
    alt: '一碗新鲜蓝莓',
  },
  {
    title: '燕麦是全谷物的一种',
    body: '燕麦可提供膳食纤维，搭配水果和坚果能让早餐更丰富。',
    image: '/knowledge-cards/oats.webp',
    alt: '香蕉核桃燕麦碗',
  },
  {
    title: '一盘蔬菜要有多种颜色',
    body: '深浅不同的蔬菜搭配，有助于让日常饮食更丰富、更多样。',
    image: '/knowledge-cards/salad.webp',
    alt: '含牛油果和番茄的蔬菜沙拉',
  },
  {
    title: '喝水可以从清淡开始',
    body: '白水是日常补水的基础；加入柠檬或薄荷可增加清新口感。',
    image: '/knowledge-cards/lemon-water.webp',
    alt: '柠檬薄荷水',
  },
]

export default function LoadingPage({ topic, mode = 'dual', startedAt }: LoadingPageProps) {
  // startedAt 为 0/缺省时退回「本次挂载时刻」，行为与旧版一致
  const startRef = useRef<number>(startedAt && startedAt > 0 ? startedAt : Date.now())
  if (startedAt && startedAt > 0) startRef.current = startedAt
  const [progress, setProgress] = useState(() => computeProgress(Date.now() - startRef.current))
  const [knowledgeIndex, setKnowledgeIndex] = useState(0)
  const [knowledgeDirection, setKnowledgeDirection] = useState<-1 | 0 | 1>(0)
  const [knowledgeDragX, setKnowledgeDragX] = useState(0)
  const [knowledgeDragging, setKnowledgeDragging] = useState(false)
  const [knowledgeTransition, setKnowledgeTransition] = useState(true)
  const [knowledgeAssetsReady, setKnowledgeAssetsReady] = useState(false)
  const [knowledgeRotationCycle, setKnowledgeRotationCycle] = useState(0)
  const knowledgeDirectionRef = useRef<-1 | 0 | 1>(0)
  const knowledgeDraggingRef = useRef(false)
  const knowledgeSettlingRef = useRef(false)
  const knowledgeDragXRef = useRef(0)
  const knowledgePointer = useRef<{ id: number; x: number; y: number; axis: 'x' | 'y' | null } | null>(null)

  useEffect(() => {
    let active = true
    const images: HTMLImageElement[] = []
    const preloads = KNOWLEDGE_CARDS.map(async (card) => {
      const image = new Image()
      images.push(image)
      image.decoding = 'async'
      await new Promise<void>((resolve) => {
        image.onload = () => resolve()
        image.onerror = () => resolve()
        image.src = card.image
      })
      try { await image.decode() } catch { /* load/error has settled; the rendered image owns fallback UI */ }
    })
    void Promise.all(preloads).then(() => { if (active) setKnowledgeAssetsReady(true) })
    return () => {
      active = false
      images.forEach((image) => { image.onload = null; image.onerror = null })
    }
  }, [])

  useEffect(() => {
    if (!knowledgeAssetsReady) return
    const timer = window.setTimeout(() => {
      if (knowledgeDirectionRef.current === 0 && !knowledgeDraggingRef.current) {
        knowledgeDirectionRef.current = 1
        setKnowledgeTransition(true)
        setKnowledgeDirection(1)
      } else {
        setKnowledgeRotationCycle((cycle) => cycle + 1)
      }
    }, 4200)
    return () => window.clearTimeout(timer)
  }, [knowledgeAssetsReady, knowledgeIndex, knowledgeRotationCycle])

  useEffect(() => {
    const timer = window.setInterval(() => setProgress(computeProgress(Date.now() - startRef.current)), 560)
    return () => window.clearInterval(timer)
  }, [])

  const headline = mode === 'single' ? '正在分析视频内容…' : '正在分析双视频内容…'
  const activeStep = useMemo(() => Math.min(STEPS.length - 1, Math.floor(progress / 20)), [progress])
  const visibleKnowledgeCards = useMemo(() => visibleKnowledgeIndexes(knowledgeIndex, KNOWLEDGE_CARDS.length).map((index) => (
    KNOWLEDGE_CARDS[index]
  )), [knowledgeIndex])
  const knowledgeTrackX = knowledgeDirection === 1
    ? '-66.666667%'
    : knowledgeDirection === -1
      ? '0%'
      : `calc(-33.333333% + ${knowledgeDragX}px)`

  const finishKnowledgeDrag = (cancelled = false) => {
    const dragX = knowledgeDragXRef.current
    const direction = resolveKnowledgeSwipe(dragX, cancelled) as -1 | 0 | 1
    knowledgeSettlingRef.current = direction === 0 && Math.abs(dragX) > 0.5
    knowledgeDraggingRef.current = false
    knowledgePointer.current = null
    knowledgeDirectionRef.current = direction
    knowledgeDragXRef.current = 0
    setKnowledgeDragging(false)
    setKnowledgeTransition(true)
    setKnowledgeDragX(0)
    setKnowledgeDirection(direction)
    setKnowledgeRotationCycle((cycle) => cycle + 1)
  }

  const completeKnowledgeSlide = () => {
    if (knowledgeDirection === 0) {
      knowledgeSettlingRef.current = false
      return
    }
    const direction = knowledgeDirection
    setKnowledgeTransition(false)
    setKnowledgeIndex((current) => wrapKnowledgeIndex(current, direction, KNOWLEDGE_CARDS.length))
    knowledgeDirectionRef.current = 0
    setKnowledgeDirection(0)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setKnowledgeTransition(true)))
  }

  return (
    <main className="h-[calc(100dvh-54px)] overflow-hidden select-none bg-[#F4FCFA] px-3 py-2">
      <section className="mx-auto flex h-full w-full max-w-[520px] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white px-5 py-4 shadow-[0_18px_52px_rgba(18,116,103,0.10)]">
        <header className="flex items-center justify-between">
          <span className="text-[20px] font-black tracking-[-0.04em] text-[#069F8E]">FitProof</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#EAF8F5] px-3.5 py-1.5 text-[13px] font-bold text-[#078C7E]">
            <span className="fitproof-status-breathe h-2.5 w-2.5 rounded-full bg-[#15BDAE]" />分析中
          </span>
        </header>

        <section className="mt-3 shrink-0 text-center">
          <h1 className="text-[clamp(22px,6.5vw,28px)] font-black tracking-[-0.04em] text-[#163848]">{headline}</h1>
          <p className="mt-1.5 text-[13px] font-medium text-[#60768B]">正在等待本次核验的真实结果</p>
        </section>

        <section className="relative mt-3 h-[132px] shrink-0 overflow-hidden" aria-label="FitProof 小猫正在沿分析路径奔跑">
          <div className="fitproof-cloud absolute left-[10%] top-0"><i /><i /><i /></div>
          <div className="fitproof-cloud fitproof-cloud-small absolute right-[8%] top-3"><i /><i /><i /></div>
          <span className="absolute -bottom-14 left-[-15%] h-[112px] w-[130%] rounded-[50%] border-t border-[#C8EEE7] bg-[linear-gradient(180deg,rgba(216,247,241,.92),rgba(249,255,253,.3)_58%,rgba(255,255,255,0)_100%)]" />
          <div className="fitproof-grass fitproof-grass-left absolute bottom-[47px] left-[7%]"><i /><i /><i /><i /><i /></div>
          <div className="fitproof-grass fitproof-grass-right absolute bottom-[47px] right-[7%]"><i /><i /><i /><i /><i /></div>
          <div className="fitproof-loading-cat-run absolute bottom-2 left-0">
            <span className="fitproof-cat-wind"><i /><i /><i /></span>
            <span className="fitproof-cat-sprite-run relative z-10 block" />
          </div>
        </section>

        <section className="mt-2 shrink-0">
          <div className="flex items-center justify-between gap-3"><p className="text-[14px] font-black text-[#163848]">{STEPS[activeStep]}中…</p><span className="text-[16px] font-black text-[#0AB39F]">{progress}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E1F4F0]"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#08B9A5,#08A98E)] transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
          <div className="relative mt-4 flex items-start justify-between before:absolute before:left-0 before:right-0 before:top-[9px] before:h-px before:bg-[#D8F0EC]">
            {STEP_SHORT_NAMES.map((name, index) => <div key={name} className={`relative z-10 flex flex-col text-center ${index === 0 ? 'items-start text-left' : index === STEP_SHORT_NAMES.length - 1 ? 'items-end text-right' : 'items-center'}`}><span className="grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-[#D8E1E8] bg-white text-[11px] font-black text-[#08B9A5]">{index < activeStep ? '✓' : index === activeStep ? '●' : '•'}</span><span className="mt-1 text-[11px] font-bold leading-tight text-[#079B8B]">{name}</span></div>)}
          </div>
        </section>

        <section
          className="mt-2.5 h-[126px] w-full shrink-0 touch-pan-y overflow-hidden rounded-[18px] bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(247,253,251,0.96)_54%,rgba(239,249,246,0.94)_100%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_3px_10px_rgba(18,116,103,0.045),0_12px_28px_rgba(18,116,103,0.075)]"
          aria-label="小知识内容区域，可左右滑动切换"
          aria-busy={!knowledgeAssetsReady}
          onPointerDown={(event) => {
            if (!knowledgeAssetsReady || !event.isPrimary || knowledgePointer.current || knowledgeDirectionRef.current !== 0 || knowledgeSettlingRef.current) return
            event.currentTarget.setPointerCapture(event.pointerId)
            knowledgePointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null }
            knowledgeDraggingRef.current = true
            setKnowledgeDragging(true)
            setKnowledgeTransition(false)
          }}
          onPointerMove={(event) => {
            const pointer = knowledgePointer.current
            if (!pointer || pointer.id !== event.pointerId) return
            const deltaX = event.clientX - pointer.x
            const deltaY = event.clientY - pointer.y
            if (pointer.axis === null && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) pointer.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
            if (pointer.axis !== 'x') return
            const resistedX = Math.max(-110, Math.min(110, deltaX))
            knowledgeDragXRef.current = resistedX
            setKnowledgeDragX(resistedX)
          }}
          onPointerUp={(event) => {
            if (knowledgePointer.current?.id !== event.pointerId) return
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            finishKnowledgeDrag()
          }}
          onPointerCancel={() => finishKnowledgeDrag(true)}
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F8F4] px-2 py-1 text-[11px] font-bold text-[#079B8B]">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 15.5c-1.3-.9-2.2-2.4-2.2-4.1a5.7 5.7 0 0 1 11.4 0c0 1.7-.9 3.2-2.2 4.1-.8.6-1.2 1.3-1.3 2.1H9.8c-.1-.8-.5-1.5-1.3-2.1Z" strokeLinejoin="round" /><path d="M9.5 20h5M12 2v2" strokeLinecap="round" /></svg>
            小知识
          </span>
          <div className="relative mt-1.5 overflow-hidden">
            {!knowledgeAssetsReady ? <div className="absolute inset-0 z-10 flex animate-pulse items-start gap-3 bg-[#F5FCFA]" aria-label="正在准备小知识图片"><span className="h-[62px] w-[62px] shrink-0 rounded-[13px] bg-[#DDEFEA]" /><span className="min-w-0 flex-1 pt-1"><span className="block h-3 w-2/3 rounded-full bg-[#DDEFEA]" /><span className="mt-2 block h-2 w-full rounded-full bg-[#E7F3F0]" /><span className="mt-1.5 block h-2 w-4/5 rounded-full bg-[#E7F3F0]" /></span></div> : null}
            <div
              data-knowledge-track
              className={`flex w-[300%] will-change-transform ${knowledgeAssetsReady ? 'opacity-100' : 'opacity-0'} ${knowledgeTransition && !knowledgeDragging ? 'transition-transform duration-[420ms] ease-[cubic-bezier(.22,.78,.22,1)]' : ''}`}
              style={{ transform: `translate3d(${knowledgeTrackX}, 0, 0)` }}
              onTransitionEnd={(event) => { if (event.currentTarget === event.target && event.propertyName === 'transform') completeKnowledgeSlide() }}
            >
              {visibleKnowledgeCards.map((card, slot) => (
                <div key={`${card.title}-${slot}`} className="flex w-1/3 shrink-0 items-start gap-3 px-px">
                  <img src={card.image} alt={card.alt} loading="eager" decoding="async" draggable={false} className="h-[62px] w-[62px] shrink-0 rounded-[13px] bg-white object-cover shadow-[0_6px_15px_rgba(18,116,103,.07)]" />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[14px] font-black leading-snug text-[#101C2C]">{card.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.4] text-[#26384A]">{card.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex justify-center gap-1" aria-label="小知识轮播进度">{KNOWLEDGE_CARDS.map((card, index) => <span key={card.title} className={`fitproof-knowledge-dot ${index === knowledgeIndex ? 'fitproof-knowledge-dot-active' : ''}`} />)}</div>
        </section>

        <p className="mt-2 flex shrink-0 items-center justify-center gap-1.5 text-center text-[11px] text-[#92A2B5]">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 2.5 4 5v4.5c0 3.6 2.5 6.9 6 8 3.5-1.1 6-4.4 6-8V5l-6-2.5Z" strokeLinejoin="round" /><path d="m7.3 10 1.8 1.8 3.8-3.8" strokeLinecap="round" /></svg>
          分析结果仅供参考，不能替代专业医疗建议
        </p>
      </section>
      <style jsx>{`
        .fitproof-loading-cat-run { animation: fitproof-cat-run-across 5.6s linear infinite; }
        .fitproof-status-breathe { animation:fitproof-status-breathe 1.8s ease-in-out infinite; }
        .fitproof-step-breathe { animation:fitproof-step-breathe 1.45s ease-in-out infinite; }
        .fitproof-knowledge-dot { width:5px; height:5px; border-radius:999px; background:#D8F0EC; transition:transform .28s ease, background-color .28s ease; }
        .fitproof-knowledge-dot-active { transform:scale(1.45); background:#10B8A5; }
        .fitproof-cloud { display:flex; align-items:flex-end; height:22px; gap:0; opacity:.92; filter:drop-shadow(0 3px 5px rgba(132,222,210,.12)); }
        .fitproof-cloud i { display:block; width:22px; height:13px; border-radius:999px 999px 8px 8px; background:linear-gradient(180deg,#F3FFFD,#DDF7F2); }
        .fitproof-cloud i:nth-child(2) { width:28px; height:22px; margin-left:-9px; }
        .fitproof-cloud i:nth-child(3) { width:21px; height:16px; margin-left:-8px; }
        .fitproof-cloud-small { transform:scale(.72); transform-origin:right top; }
        .fitproof-grass { display:flex; align-items:flex-end; height:34px; width:56px; }
        .fitproof-grass i { display:block; width:10px; height:31px; border-radius:100% 0 100% 0; background:linear-gradient(180deg,#BCEAE0,#E7FAF6); transform:rotate(-38deg); transform-origin:bottom; }
        .fitproof-grass i:nth-child(2) { height:25px; margin-left:-5px; transform:rotate(-16deg); }
        .fitproof-grass i:nth-child(3) { height:34px; margin-left:-5px; transform:rotate(2deg); }
        .fitproof-grass i:nth-child(4) { height:23px; margin-left:-5px; transform:rotate(22deg); }
        .fitproof-grass i:nth-child(5) { height:28px; margin-left:-5px; transform:rotate(42deg); }
        .fitproof-grass-right { transform:scaleX(-1); }
        .fitproof-cat-wind { position:absolute; z-index:0; left:-42px; top:31px; width:42px; height:25px; opacity:.8; }
        .fitproof-cat-wind i { position:absolute; right:0; height:2px; border-radius:999px; background:#BCEBE3; animation: fitproof-cat-wind 700ms ease-out infinite; }
        .fitproof-cat-wind i:nth-child(1) { top:2px; width:18px; }
        .fitproof-cat-wind i:nth-child(2) { top:10px; width:35px; animation-delay:120ms; }
        .fitproof-cat-wind i:nth-child(3) { top:18px; width:25px; animation-delay:240ms; }
        .fitproof-cat-sprite-run {
          width: 68px;
          aspect-ratio: 3 / 4;
          background-image: url('/animations/fitproof-loading-cat-run.png');
          background-repeat: no-repeat;
          background-size: 400% 200%;
          background-position: 0 0;
          animation: fitproof-cat-sprite-run 720ms linear infinite;
        }
        @keyframes fitproof-cat-sprite-run {
          0%, 12.499% { background-position: 0% 0%; }
          12.5%, 24.999% { background-position: 33.333333% 0%; }
          25%, 37.499% { background-position: 66.666667% 0%; }
          37.5%, 49.999% { background-position: 100% 0%; }
          50%, 62.499% { background-position: 0% 100%; }
          62.5%, 74.999% { background-position: 33.333333% 100%; }
          75%, 87.499% { background-position: 66.666667% 100%; }
          87.5%, 100% { background-position: 100% 100%; }
        }
        @keyframes fitproof-cat-run-across {
          0% { transform: translate(-78px, 16px); }
          48% { transform: translate(calc(50vw - 70px), -8px); }
          100% { transform: translate(calc(min(520px, 100vw) - 4rem), 14px); }
        }
        @keyframes fitproof-cat-wind {
          from { transform:translateX(8px); opacity:0; }
          35% { opacity:.85; }
          to { transform:translateX(-8px); opacity:0; }
        }
        @keyframes fitproof-status-breathe {
          0%, 100% { transform:scale(.86); box-shadow:0 0 0 0 rgba(21,189,174,.14); opacity:.7; }
          50% { transform:scale(1.12); box-shadow:0 0 0 6px rgba(21,189,174,.08); opacity:1; }
        }
        @keyframes fitproof-step-breathe {
          0%, 100% { transform:scale(.72); opacity:.6; box-shadow:0 0 0 0 rgba(8,185,165,.1); }
          50% { transform:scale(1.2); opacity:1; box-shadow:0 0 0 5px rgba(8,185,165,.1); }
        }
      `}</style>
    </main>
  )
}
