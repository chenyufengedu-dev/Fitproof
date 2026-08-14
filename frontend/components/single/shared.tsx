// 结果页各卡片共用的辅助函数、类型与小组件。
// 从 SingleResultPage.tsx 原样搬出，实现未作任何改动 —— 那个文件曾有 16 个组件挤在
// 一起，多人并行改不同的卡就会在同一个文件上冲突。
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { Claim, EvidenceEntry, Keyframe, SingleActionAdvice, VerifyResult } from '@/types'
import type { ReasoningStep } from '@/components/verify/ReasoningTrace'

export const SINGLE_API_BASE = process.env.NEXT_PUBLIC_API_URL || ''
// 抖音封面/头像走后端图片代理，绕过 CDN 防盗链稳定显示；base64/本地图与无后端时原样返回。
export function proxiedImg(url?: string | null): string | undefined {
  if (!url) return undefined
  if (!/^https?:\/\//i.test(url)) return url
  if (!SINGLE_API_BASE) return url
  return `${SINGLE_API_BASE}/api/img_proxy?url=${encodeURIComponent(url)}`
}

export type VerifyStatus = 'pending' | 'loading' | 'done' | 'error'

export interface VerifyState {
  status: VerifyStatus
  result?: VerifyResult
  streamSteps?: ReasoningStep[]
}

export function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button,a,input,textarea,select,[role="button"]'))
}

export interface DrawerData {
  evidence: EvidenceEntry[]
}

export interface VisualImage {
  image: string
  screenText: string
  time: number
}

export interface FollowupMessage {
  role: 'user' | 'assistant'
  content: string
}

// 与后端 CLAIM_ICONS 白名单保持一致。模型输出的 icon 落在这里才用，否则回落 general。
const CLAIM_ICON_SET = new Set([
  'egg', 'milk', 'meat', 'veggie', 'grain', 'oil-salt-sugar', 'water', 'tea-coffee',
  'alcohol', 'pill', 'vaccine', 'lab-report', 'blood-pressure', 'blood-sugar', 'heart',
  'exercise', 'sleep', 'weight', 'pregnancy', 'baby', 'elderly', 'supplement', 'cancer',
  'bath', 'bone-joint', 'eye', 'fever-cold', 'hair', 'headache', 'immunity', 'mood',
  'pain', 'skin', 'stomach', 'teeth',
  'general',
])

const CLAIM_ICON_RULES: Array<[RegExp, string]> = [
  [/胎儿|新生儿|婴儿|宝宝|黄疸/, 'baby'],
  [/胆固醇|血脂|心脏|心血管/, 'heart'],
  [/血压|高血压|低血压/, 'blood-pressure'],
  [/血糖|糖尿病/, 'blood-sugar'],
  [/鱼|禽|瘦肉|蛋白质|肉类/, 'meat'],
  [/鸡蛋|蛋黄|蛋清/, 'egg'],
  [/孕妇|孕期|产前|产后/, 'pregnancy'],
  [/洗澡|淋浴|泡澡/, 'bath'],
  [/骨|关节|腰|颈椎/, 'bone-joint'],
  [/感冒|发烧|发热|着凉/, 'fever-cold'],
  [/头痛|偏头痛/, 'headache'],
  [/疼痛|疼|痛风/, 'pain'],
  [/胃|肠|消化|腹泻|便秘/, 'stomach'],
  [/皮肤|湿疹|过敏/, 'skin'],
  [/头发|脱发|洗头/, 'hair'],
  [/睡眠|失眠|熬夜/, 'sleep'],
  [/运动|跑步|锻炼|健身/, 'exercise'],
  [/体重|减肥|肥胖/, 'weight'],
  [/牛奶|乳制品|奶粉/, 'milk'],
  [/蔬菜|绿叶菜|水果/, 'veggie'],
  [/米饭|主食|谷物|碳水/, 'grain'],
  [/喝水|饮水|补水/, 'water'],
  [/维生素|补充剂|营养素/, 'supplement'],
]

export function resolvedClaimIcon(claim: Claim): string {
  if (claim.icon && CLAIM_ICON_SET.has(claim.icon) && claim.icon !== 'general') return claim.icon
  const matched = CLAIM_ICON_RULES.find(([pattern]) => pattern.test(claim.claim))
  return matched?.[1] || 'general'
}

/** 说法语义配图。双重兜底：字段缺失/不在白名单 → general；图片 404 → general。 */
export function ClaimIcon({ icon, className, borderless = false, imageClassName }: { icon?: string; className?: string; borderless?: boolean; imageClassName?: string }) {
  const initial = icon && CLAIM_ICON_SET.has(icon) ? icon : 'general'
  const [src, setSrc] = useState(initial)
  useEffect(() => { setSrc(initial) }, [initial])
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EEF9F6] ${borderless ? '' : 'border border-[#D8F1EC]'} ${className || ''}`}>
      <img
        src={`/claim-icons/${src}.webp`}
        alt=""
        aria-hidden="true"
        className={`${imageClassName || 'h-[76%] w-[76%]'} object-contain`}
        onError={() => { if (src !== 'general') setSrc('general') }}
      />
    </span>
  )
}

export const SIGNAL_STYLES = {
  common: 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]',
  exaggerated: 'border-amber-200 bg-amber-50 text-amber-700',
  conditional: 'border-[#C8D4EE] bg-[#F0F4FC] text-[#5276B5]',
}

export function signalClass(signal: string) {
  if (signal === '较公认') return SIGNAL_STYLES.common
  if (signal === '疑似夸大') return SIGNAL_STYLES.exaggerated
  return SIGNAL_STYLES.conditional
}

export function overviewSignalClass(signal: string) {
  if (signal === '较公认') return 'bg-[#EAF9F6] text-[#0B6E63]'
  if (signal === '疑似夸大') return 'bg-[#FFF1E2] text-[#ED7A00]'
  return 'bg-[#EEF1F8] text-[#62759B]'
}

export function claimGroupsLabel(claim: Claim) {
  if (claim.signal === '较公认' || claim.signal === '疑似夸大') return claim.signal
  return '有条件/争议'
}

/** 章面颜色只由 risk_level 决定。提示词里 risk_level 就是「低/中/高」三选一，
 *  这是受约束字段的 1:1 视觉映射，不是在前端重新推导判定。取值意外时退回中性灰。 */
export function stampTone(riskLevel: string) {
  const risk = riskLevel || ''
  if (risk.includes('高')) return '#C0392B'
  if (risk.includes('中')) return '#C2740B'
  if (risk.includes('低')) return '#0B8F82'
  return '#64748B'
}

export const STAR_PATH = 'M0,-1L0.225,-0.309L0.951,-0.309L0.363,0.118L0.588,0.809L0,0.382L-0.588,0.809L-0.363,0.118L-0.951,-0.309L-0.225,-0.309Z'

/** 核验结果印章。章面文字使用诊断卡的展示结论，颜色仍只跟随后端风险等级。 */
export function VerdictStamp({ verdict, riskLevel }: { verdict: string; riskLevel: string }) {
  const uid = useId().replace(/:/g, '')
  const text = (verdict || '').trim()
  if (!text) return null
  const color = stampTone(riskLevel)
  const len = Array.from(text).length
  // 判定字数不定，字号随长度自适应，防止撑破中间的横幅
  const fontSize = len <= 2 ? 21 : len === 3 ? 17 : len === 4 ? 14 : len === 5 ? 11.5 : len === 6 ? 9.5 : 8
  const stars = [38, 50, 62]

  return (
    <svg
      data-verdict-stamp
      viewBox="0 0 100 100"
      className="fitproof-stamp pointer-events-none h-[84px] w-[84px] shrink-0 opacity-[0.84]"
      role="img"
      aria-label={`核验结果印章：${text}`}
    >
      <defs>
        {/* 做旧毛边：用噪声位移把线条打毛，模拟橡皮章蘸印泥的质感 */}
        <filter id={`grunge-${uid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <path id={`arc-${uid}`} d="M 23 50 A 27 27 0 0 1 77 50" fill="none" />
        {/* 横幅所在区域把双环挖空，这样不依赖卡片底色也能盖住环线 */}
        <mask id={`band-${uid}`}>
          <rect x="0" y="0" width="100" height="100" fill="white" />
          <rect x="2" y="37" width="96" height="26" rx="4" fill="black" transform="rotate(-12 50 50)" />
        </mask>
      </defs>

      <g filter={`url(#grunge-${uid})`} fill="none" stroke={color}>
        <g mask={`url(#band-${uid})`}>
          <circle cx="50" cy="50" r="45.5" strokeWidth="2.4" />
          <circle cx="50" cy="50" r="41" strokeWidth="1.1" />
          <text fill={color} stroke="none" fontSize="9.5" fontWeight="700" letterSpacing="2.6">
            <textPath href={`#arc-${uid}`} startOffset="50%" textAnchor="middle">核验结果</textPath>
          </text>
          {stars.map((x) => (
            <path key={x} d={STAR_PATH} fill={color} stroke="none" transform={`translate(${x} 77) scale(3.2)`} />
          ))}
        </g>
        <rect x="2" y="37" width="96" height="26" rx="4" strokeWidth="2.3" transform="rotate(-12 50 50)" />
        <text
          x="50"
          y="50"
          fill={color}
          stroke="none"
          fontSize={fontSize}
          fontWeight="900"
          textAnchor="middle"
          dominantBaseline="central"
          transform="rotate(-12 50 50)"
        >
          {text}
        </text>
      </g>
    </svg>
  )
}

export function firstTime(claim: Claim) {
  return claim.video_refs?.[0]?.time || '时间未标注'
}

export function formatFrameTime(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function parseVideoTime(value: string) {
  const parts = value.split(':').map(Number)
  if (parts.length < 1 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

export function closestFrame(claim: Claim, keyframes: Keyframe[]) {
  const claimTime = parseVideoTime(claim.video_refs?.[0]?.time || '')
  if (claimTime === null) return null
  const candidates = keyframes.filter((frame) => typeof frame.image === 'string' && frame.image.length > 0)
  if (candidates.length === 0) return null
  const closest = candidates.reduce((best, frame) => (
    Math.abs(frame.time - claimTime) < Math.abs(best.time - claimTime) ? frame : best
  ))
  return Math.abs(closest.time - claimTime) <= 10 ? closest : null
}

export function LoadingDots() {
  return (
    <span className="inline-flex h-3 items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-1 w-1 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${dot * 140}ms` }}
        />
      ))}
    </span>
  )
}

export function ExpandableHighlight({ text, label }: { text: string; label: string }) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    if (expanded) return
    const node = textRef.current
    if (!node) return
    const checkOverflow = () => setIsOverflowing(node.scrollWidth > node.clientWidth + 1)
    checkOverflow()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(checkOverflow)
    observer?.observe(node)
    return () => observer?.disconnect()
  }, [expanded, isOverflowing, text])

  if (!isOverflowing) {
    return <span ref={textRef} className="t-meta mt-1 block truncate text-slate-700">{text}</span>
  }

  return (
    <button type="button" className="mt-1 flex w-full items-start gap-1 py-1 text-left" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} aria-label={`${expanded ? '收起' : '展开'}${label}完整内容`}>
      <span ref={textRef} className={`t-meta min-w-0 flex-1 text-slate-700 ${expanded ? 'break-words leading-relaxed' : 'truncate'}`}>{text}</span>
      <svg className={`mt-0.5 h-4 w-4 shrink-0 text-slate-600 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export function videoTimeUrl(url: string, time?: string) {
  if (!url || !time) return url
  const parts = time.split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return url
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return `${url}${url.includes('#') ? '&' : '#'}t=${seconds}`
}

export function summaryVerdictTone(result: VerifyResult, signal: Claim['signal']) {
  const rejected = /不建议|不可信|夸大|误导/.test(result.verdict) || /高|误导/.test(result.risk_level)
  const needsDiscount = !rejected && (/中/.test(result.risk_level) || /证据不足|需加条件/.test(result.verdict) || signal === '疑似夸大')
  const conditional = !rejected && !needsDiscount && (/条件|争议/.test(result.verdict) || /有条件|有争议/.test(signal))

  if (rejected) {
    return {
      kind: 'rejected',
      label: '需要打折听',
      labelClass: 'bg-[#F1F4FA] text-[#7182A5]',
      stamp: `不建议采纳 · 误导风险${result.risk_level}`,
      stampClass: 'border-[#C56B12] text-[#A95D0D]',
    }
  }
  if (needsDiscount) {
    return {
      kind: 'needs-discount',
      label: '需要打折听',
      labelClass: 'bg-[#F1F4FA] text-[#7182A5]',
      stamp: `需要加条件 · 风险${result.risk_level || '中'}`,
      stampClass: 'border-[#C56B12] text-[#A95D0D]',
    }
  }
  if (conditional) {
    return {
      kind: 'conditional',
      label: '以情况而定',
      labelClass: 'bg-[#EAF9F6] text-[#0B6E63]',
      stamp: '以情况而定',
      stampClass: 'border-[#527DBB] text-[#466FAA]',
    }
  }
  return {
    kind: 'accepted',
    label: '基本可信',
    labelClass: 'bg-[#EAF9F6] text-[#0B6E63]',
    stamp: '建议采纳',
    stampClass: 'border-[#1AA28F] text-[#0B6E63]',
  }
}

export const SINGLE_ACTION_TONES = {
  normal: { border: 'border-[#9FE4D9]', text: 'text-[#0B6E63]', soft: 'bg-[#EAF8F5]', dot: 'bg-[#20CDB6]' },
  caution: { border: 'border-[#F6CF8C]', text: 'text-[#C87608]', soft: 'bg-[#FFF6E7]', dot: 'bg-[#F2A11C]' },
  urgent: { border: 'border-[#F5B2B6]', text: 'text-[#C53B43]', soft: 'bg-[#FFF0F1]', dot: 'bg-[#E6535B]' },
}

export function ActionSectionMarker() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ActionPrinciples() {
  const items = [
    { label: '按人群区分', icon: <><circle cx="7" cy="7" r="2.2" /><circle cx="15.5" cy="7.5" r="1.8" /><path d="M2.8 17c.5-3.3 2.4-5.1 5.2-5.1s4.7 1.8 5.2 5.1M13 13c2.5-.4 4.3.8 5 3.5" strokeLinecap="round" /></> },
    { label: '按目标匹配', icon: <><circle cx="11" cy="11" r="7.2" /><circle cx="11" cy="11" r="3.6" /><path d="m11 11 6-6m0 0v3.5M17 5h-3.5" strokeLinecap="round" strokeLinejoin="round" /></> },
    { label: '关注身体反应', icon: <><path d="M4 11h3l1.8-4 3.3 8 2.1-4H20" strokeLinecap="round" strokeLinejoin="round" /><path d="M11.8 20C6.4 16.8 3.5 13.9 3.5 9.7A4.2 4.2 0 0 1 11 7.1a4.2 4.2 0 0 1 7.5 2.6c0 4.2-2.9 7.1-8.3 10.3" strokeLinecap="round" strokeLinejoin="round" /></> },
  ]
  return (
    <div data-action-principles className="mt-2 grid grid-cols-3 divide-x divide-[#D6ECE8] overflow-hidden rounded-[9px] border border-[#CDEAE5] bg-white">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 items-center justify-center gap-1 px-1.5 py-1.5 text-[#0B6E63]">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{item.icon}</svg>
          <span className="t-micro truncate font-bold">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

