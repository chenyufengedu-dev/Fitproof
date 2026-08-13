'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Claim, EvidenceEntry, Keyframe, SingleActionAdvice, SingleAnalyzeResponse, VerifyResult } from '@/types'
import { citedEvidence, isEvidenceDowngraded } from '@/lib/single'
import { buildSingleActions, followupSingle, followupSingleStream } from '@/lib/api'
import ChatMarkdown from '@/components/ChatMarkdown'
import { ActionIcon } from '@/components/StepIcon'
import CourtCardShell from '@/components/CourtCardShell'
import FitProofCat from '@/components/FitProofCat'
import VerifyTopBar from '@/components/VerifyTopBar'
import CardPager from '@/components/CardPager'
import { uniqueEvidenceById } from '@/components/verify/EvidenceCitation'
import ReasoningTrace, { type ReasoningStep } from '@/components/verify/ReasoningTrace'
import { mergeTraceStep } from '@/components/verify/liveVerification.mjs'
import VerdictBlock from '@/components/verify/VerdictBlock'
import EvidenceStrength from '@/components/verify/EvidenceStrength'
import ClaimOrigin from '@/components/verify/ClaimOrigin'
import SharePosterPreview from '@/components/share/SharePosterPreview'
import {
  buildFallbackShareSummary,
  buildPosterData,
  buildShareRequest,
  posterFilename,
  submitShareContributions,
  type SharePreviewStatus,
  type ShareSourceData,
  type ShareSummaryRequest,
} from '@/lib/share'

const SINGLE_API_BASE = process.env.NEXT_PUBLIC_API_URL || ''
// 抖音封面/头像走后端图片代理，绕过 CDN 防盗链稳定显示；base64/本地图与无后端时原样返回。
function proxiedImg(url?: string | null): string | undefined {
  if (!url) return undefined
  if (!/^https?:\/\//i.test(url)) return url
  if (!SINGLE_API_BASE) return url
  return `${SINGLE_API_BASE}/api/img_proxy?url=${encodeURIComponent(url)}`
}

interface SingleResultPageProps {
  data: SingleAnalyzeResponse
  topic: string
  onBack: () => void
  onVerifyClaim: (claim: Claim, index: number, onStep?: (step: ReasoningStep) => void, onResult?: (result: VerifyResult) => void) => Promise<VerifyResult>
  onReverifyClaim: (claim: Claim, index: number, onStep?: (step: ReasoningStep) => void) => Promise<VerifyResult>
}

type VerifyStatus = 'pending' | 'loading' | 'done' | 'error'

interface VerifyState {
  status: VerifyStatus
  result?: VerifyResult
  streamSteps?: ReasoningStep[]
}

type CardDescriptor =
  | { kind: 'profile' }
  | { kind: 'overview' }
  | { kind: 'actions' }
  | { kind: 'summary' }
  | { kind: 'followup' }

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button,a,input,textarea,select,[role="button"]'))
}

interface DrawerData {
  evidence: EvidenceEntry[]
}

interface VisualImage {
  image: string
  screenText: string
  time: number
}

interface FollowupMessage {
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

function resolvedClaimIcon(claim: Claim): string {
  if (claim.icon && CLAIM_ICON_SET.has(claim.icon) && claim.icon !== 'general') return claim.icon
  const matched = CLAIM_ICON_RULES.find(([pattern]) => pattern.test(claim.claim))
  return matched?.[1] || 'general'
}

/** 说法语义配图。双重兜底：字段缺失/不在白名单 → general；图片 404 → general。 */
function ClaimIcon({ icon, className, borderless = false, imageClassName }: { icon?: string; className?: string; borderless?: boolean; imageClassName?: string }) {
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

const SIGNAL_STYLES = {
  common: 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]',
  exaggerated: 'border-amber-200 bg-amber-50 text-amber-700',
  conditional: 'border-[#C8D4EE] bg-[#F0F4FC] text-[#5276B5]',
}

function signalClass(signal: string) {
  if (signal === '较公认') return SIGNAL_STYLES.common
  if (signal === '疑似夸大') return SIGNAL_STYLES.exaggerated
  return SIGNAL_STYLES.conditional
}

function overviewSignalClass(signal: string) {
  if (signal === '较公认') return 'bg-[#EAF9F6] text-[#078C7E]'
  if (signal === '疑似夸大') return 'bg-[#FFF1E2] text-[#ED7A00]'
  return 'bg-[#EEF1F8] text-[#62759B]'
}

function claimGroupsLabel(claim: Claim) {
  if (claim.signal === '较公认' || claim.signal === '疑似夸大') return claim.signal
  return '有条件/争议'
}

/** 章面颜色只由 risk_level 决定。提示词里 risk_level 就是「低/中/高」三选一，
 *  这是受约束字段的 1:1 视觉映射，不是在前端重新推导判定。取值意外时退回中性灰。 */
function stampTone(riskLevel: string) {
  const risk = riskLevel || ''
  if (risk.includes('高')) return '#C0392B'
  if (risk.includes('中')) return '#C2740B'
  if (risk.includes('低')) return '#0B8F82'
  return '#64748B'
}

const STAR_PATH = 'M0,-1L0.225,-0.309L0.951,-0.309L0.363,0.118L0.588,0.809L0,0.382L-0.588,0.809L-0.363,0.118L-0.951,-0.309L-0.225,-0.309Z'

/** 核验结果印章。章面文字使用诊断卡的展示结论，颜色仍只跟随后端风险等级。 */
function VerdictStamp({ verdict, riskLevel }: { verdict: string; riskLevel: string }) {
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

function firstTime(claim: Claim) {
  return claim.video_refs?.[0]?.time || '时间未标注'
}

function formatFrameTime(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function parseVideoTime(value: string) {
  const parts = value.split(':').map(Number)
  if (parts.length < 1 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function closestFrame(claim: Claim, keyframes: Keyframe[]) {
  const claimTime = parseVideoTime(claim.video_refs?.[0]?.time || '')
  if (claimTime === null) return null
  const candidates = keyframes.filter((frame) => typeof frame.image === 'string' && frame.image.length > 0)
  if (candidates.length === 0) return null
  const closest = candidates.reduce((best, frame) => (
    Math.abs(frame.time - claimTime) < Math.abs(best.time - claimTime) ? frame : best
  ))
  return Math.abs(closest.time - claimTime) <= 10 ? closest : null
}

function LoadingDots() {
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

function ExpandableHighlight({ text, label }: { text: string; label: string }) {
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
    <button type="button" className="mt-1 flex w-full items-start gap-1 text-left" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} aria-label={`${expanded ? '收起' : '展开'}${label}完整内容`}>
      <span ref={textRef} className={`t-meta min-w-0 flex-1 text-slate-700 ${expanded ? 'break-words leading-relaxed' : 'truncate'}`}>{text}</span>
      <svg className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function ProfileCard({ data, onOpenOverview }: { data: SingleAnalyzeResponse; onOpenOverview: () => void }) {
  // 说明：这里读的是快模型拆主张时的初步归类 claim.signal，不是核验结论。
  // 核验结论在 verifyStates 里，属于卡02及以后 —— 故此处一律用中性分类图标与措辞。
  const durationSeconds = data.reference.duration_seconds
  const durationLabel = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? (() => { const total = Math.round(durationSeconds); const minutes = Math.floor(total / 60); const seconds = total % 60; return `${minutes}:${String(seconds).padStart(2, '0')}` })()
    : null
  const publishedAt = typeof data.reference.published_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.reference.published_at)
    ? data.reference.published_at
    : null
  const posterFrame = data.keyframes.find((frame) => typeof frame.image === 'string' && frame.image.length > 0)
  const hasVideoUrl = Boolean(data.reference.url)
  const author = data.reference.author || '作者未标注'
  const authorAvatarUrl = data.reference.author_avatar_url
  const [authorAvatarFailed, setAuthorAvatarFailed] = useState(false)
  useEffect(() => setAuthorAvatarFailed(false), [authorAvatarUrl])
  const rawTitle = data.reference.title || '标题未标注'
  const topicTags = (rawTitle.match(/#\S+/g) || []).map((tag) => tag.slice(1))
  const cleanTitle = rawTitle.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim() || rawTitle
  // 抖音只有一段文案（正文+话题标签混在一起），没有「标题 + 副文案」两个字段。
  // 这里按首个句末标点把同一段原文切成两行显示，纯排版，不增删原文一个字。
  const breakAt = cleanTitle.search(/[！!。？?]/)
  const headline = breakAt >= 0 ? cleanTitle.slice(0, breakAt + 1) : cleanTitle
  const subCopy = breakAt >= 0 ? cleanTitle.slice(breakAt + 1).trim() : ''
  // 成分统计（核验前就有的 claim.signal，不是核验判定）。用于成分条 + 核心看点。
  const countAccepted = data.claims.filter((c) => c.signal === '较公认').length
  const countExagg = data.claims.filter((c) => c.signal === '疑似夸大').length
  const countConditional = data.claims.length - countAccepted - countExagg
  const totalClaims = data.claims.length
  const mainClaim = (data.claims.find((c) => c.signal === '较公认') || data.claims[0])?.claim || ''
  const needsScrutiny = countExagg + countConditional
  const attentionText = needsScrutiny > 0
    ? `${needsScrutiny} 条说法存疑或需加条件，建议逐条查证`
    : '初步归类均较公认，仍建议逐条查证'
  const verificationMethodText = '逐条比对权威指南库，命中哪一级如实标注，查不到直说'
  const compositionSegments = [
    { key: '较公认', count: countAccepted, color: '#20CDB6' },
    { key: '疑似夸大', count: countExagg, color: '#F5A524' },
    { key: '有条件', count: countConditional, color: '#94A3B8' },
  ].filter((s) => s.count > 0)
  const poster = (
    <div className="relative aspect-[2/1] overflow-hidden rounded-[16px] bg-[#E1F5EE]">
      {posterFrame?.image ? (
        <>
          {/* 抖音是 9:16 竖屏，塞进横框只有两条路：裁掉大半(object-cover 会放大 3 倍多)，
              或完整显示但两侧留白。这里用同一帧的模糊放大版当底衬填掉留白，
              前景 object-contain 完整呈现、不裁不放大。 */}
          <img src={proxiedImg(posterFrame.image)} alt="" aria-hidden="true" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl saturate-150" />
          <div className="absolute inset-0 bg-slate-900/15" />
          <img src={proxiedImg(posterFrame.image)} alt="视频关键帧封面" referrerPolicy="no-referrer" className="relative h-full w-full object-contain" />
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <span className="text-[11px] font-medium leading-relaxed text-[#0B6E63]">
            {hasVideoUrl ? '封面暂不可用，点击在抖音看原视频' : '视频封面暂不可用'}
          </span>
        </div>
      )}
      {hasVideoUrl && (
        <span className="absolute right-2 top-2 rounded-full bg-slate-900/75 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          点击查看视频
        </span>
      )}
      {posterFrame?.image && hasVideoUrl && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white pl-0.5 text-lg text-[#0B6E63] shadow-lg">▶</span>
        </span>
      )}
    </div>
  )

  return (
    <div>
      {/* 卡头（青点+「视频档案」+ 副标题 + 01 水印）与底部免责声明由 CourtCardShell 统一渲染 */}
      {/* 封面与下方信息同属一个容器：扁平化，无边框无发光，封面上圆下方直接压在信息块顶上 */}
      <div className="bg-white">
        {hasVideoUrl ? (
          <a href={data.reference.url} target="_blank" rel="noreferrer" className="block" aria-label="在抖音打开原视频">
            {poster}
          </a>
        ) : poster}

        <div>
        <div className="pb-3.5 pt-3">
          <h1 className="t-display line-clamp-2 text-slate-950">{headline}</h1>
          {subCopy && <p className="t-meta mt-1 truncate text-slate-400">{subCopy}</p>}
          {topicTags.length > 0 && (
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto whitespace-nowrap">
              {topicTags.map((tag, index) => (
                <span key={`${tag}-${index}`} className="shrink-0 rounded-md border border-[#E4E8EE] bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-medium text-slate-700">
                  <span className="text-slate-600">#</span> {tag}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2.5 border-b border-[#DCEFEB] pb-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#E1F5EE] shadow-[0_1px_4px_rgba(15,23,42,0.12)]">
              {authorAvatarUrl && !authorAvatarFailed ? (
                <img src={proxiedImg(authorAvatarUrl)} alt={`${author} 的头像`} className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setAuthorAvatarFailed(true)} />
              ) : (
                <FitProofCat pose="thinking" size={55} className="-mt-1" title="FitProof 小猫" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-[12px] font-semibold leading-tight text-slate-700">{author}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-slate-400">视频作者</p>
            </div>
            {(durationLabel || publishedAt) && <div className="flex shrink-0 translate-y-[9px] items-center gap-3 whitespace-nowrap text-[10px] leading-tight text-slate-400">{durationLabel && <span className="inline-flex items-center gap-1"><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="5.25" /><path d="M8 4.9v3.35l2.25 1.35" strokeLinecap="round" strokeLinejoin="round" /></svg>时长 {durationLabel}</span>}{publishedAt && <span className="inline-flex items-center gap-1"><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.75" y="3.5" width="10.5" height="9.25" rx="1.25" /><path d="M5.25 2.5v2M10.75 2.5v2M2.75 6.25h10.5" strokeLinecap="round" /></svg>发布 {publishedAt}</span>}</div>}
          </div>
          {/* 成分条：把 signal 分布做成一根横向堆叠条，一眼看懂「几分靠谱几分存疑」。
              这是核验前已有数据的可视化，不与卡02的可点击明细列表重复。
              三色是同一个功能元素（成分构成），算作本屏唯一的饱和色块。 */}
          {totalClaims > 0 && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <p className="t-label text-slate-800">共 {totalClaims} 条可核验说法</p>
                <p className="t-meta text-slate-400">拆条初步归类</p>
              </div>
              <div className="mt-2 flex h-2 w-full gap-1">
                {compositionSegments.map((seg) => (
                  <span key={seg.key} className="rounded-full" style={{ width: `${(seg.count / totalClaims) * 100}%`, backgroundColor: seg.color }} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {compositionSegments.map((seg) => (
                  <span key={seg.key} className="t-meta inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
                    {seg.key} {seg.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 核心看点：固定三行骨架（主要主张 / 需要留意 / 核验方式），每行都保证有内容，
              不随成分变化而增减。数据来自拆条阶段的 claim.signal 与原文，或真实核验机制，
              核验前即可得出，不编造，也不与卡02重复。 */}
          {/* 连接线放在实心圆底之后：视觉上连续，但不会透过任何图标。 */}
          <div className="relative mt-4 space-y-3.5 rounded-2xl bg-[linear-gradient(135deg,#FFFFFF_0%,#FBFEFD_100%)] px-3 py-3 shadow-[0_4px_12px_rgba(15,90,82,0.07)] before:absolute before:left-7 before:top-11 before:bottom-11 before:w-px before:bg-[#BFEDEA]">
            <div className="relative flex items-start gap-3">
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DDF4F1]" aria-hidden="true">
                <svg className="h-[18px] w-[18px] scale-y-[.88]" viewBox="0 0 64 64" fill="none">
                  <defs>
                    <linearGradient id="claim-quote-bubble" x1="10" y1="7" x2="56" y2="57" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#1FCBC6" />
                      <stop offset="1" stopColor="#18B8B5" />
                    </linearGradient>
                  </defs>
                  {/* 近圆形气泡 + 左下三角尾巴，轮廓直接取自参考图的比例。 */}
                  <path transform="translate(-2.56 0) scale(1.08 1)" d="M32 3C15.7 3 3 15.4 3 31c0 7.5 2.9 14.2 7.7 19.2L4.2 60.4c-.8 1.3.6 2.9 2 2.4l14.3-5.1c3.6 1.6 7.5 2.4 11.5 2.4 16.3 0 29-12.5 29-28.1S48.3 3 32 3Z" fill="url(#claim-quote-bubble)" />
                  {/* 缩小并左移后的扁平开引号。 */}
                  <g transform="translate(-1 4.8) scale(.9 .85)">
                    <path d="M29.6 22.1C31.1 21 33 22.4 32 24.1c-2.4 3-3.8 6-3.8 8.5 0 1.5.8 2.3 2.6 2.9 2.9 1 4.5 3 4.5 5.3 0 3.1-2.4 5.2-5.8 5.2-3.8 0-6.1-2.7-6.1-6.8 0-6.2 3-11.9 6.2-17.1Z" fill="white" />
                    <path d="M45.8 22.1c1.5-1.1 3.4.3 2.4 2-2.4 3-3.8 6-3.8 8.5 0 1.5.8 2.3 2.6 2.9 2.9 1 4.5 3 4.5 5.3 0 3.1-2.4 5.2-5.8 5.2-3.8 0-6.1-2.7-6.1-6.8 0-6.2 3-11.9 6.2-17.1Z" fill="white" />
                  </g>
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-tight text-[#0B9F91]">主要主张</p>
                <ExpandableHighlight text={mainClaim || '视频未拆出明确主张'} label="主要主张" />
              </div>
            </div>
            <div className="relative flex items-start gap-3">
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF1D8]" aria-hidden="true">
                <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" stroke="#D98A0B" strokeWidth="1.7">
                  <path d="M10.7 4.2a1.5 1.5 0 0 1 2.6 0l6.7 11.8a1.5 1.5 0 0 1-1.3 2.2H5.3a1.5 1.5 0 0 1-1.3-2.2L10.7 4.2Z" strokeLinejoin="round" />
                  <path d="M12 9.4v3.1" strokeLinecap="round" />
                  <circle cx="12" cy="15" r=".55" fill="#D98A0B" stroke="none" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-tight text-[#C77A16]">需要留意</p>
                <ExpandableHighlight text={attentionText} label="需要留意" />
              </div>
            </div>
            <div className="relative flex items-start gap-3">
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F1FB]" aria-hidden="true">
                <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" stroke="#3E7BC4" strokeWidth="1.8"><path d="M12 2.6 5 5.2v5.3c0 4.1 2.8 7.2 7 8.9 4.2-1.7 7-4.8 7-8.9V5.2L12 2.6Z" strokeLinejoin="round" /><path d="m8.6 11.6 2.4 2.4 4.4-4.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-tight text-[#3E7BC4]">核验方式</p>
                <ExpandableHighlight text={verificationMethodText} label="核验方式" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-0.5 pb-2.5 pt-0.5">
          {/* 诚实边界：这三行读的是拆主张阶段的初步归类 claim.signal，不是核验判定。
              核验判定在卡02及以后的 verifyStates 里。 */}
          <button type="button" onClick={onOpenOverview} className="t-meta flex w-full items-center gap-2 rounded-lg bg-[#F3FBF9] px-3 py-2 text-left text-[#4C7774] shadow-[0_2px_8px_rgba(15,90,82,0.08)] transition hover:bg-[#EAF8F5]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white text-[#4C7774] shadow-[0_1px_3px_rgba(15,90,82,0.10)]" aria-hidden="true">
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.2 11.8 11.8 4.2M6 4.2h5.8V10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span className="min-w-0 flex-1">到「说法全景」点选任一条开始核验</span>
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}

function OverviewCard({ data, states, revealed, onOpenClaim }: { data: SingleAnalyzeResponse; states: VerifyState[]; revealed: boolean[]; onOpenClaim: (index: number) => void }) {
  const allFilters = [
    { key: '全部', label: '全部' },
    { key: '较公认', label: '较公认' },
    { key: '疑似夸大', label: '疑似夸大' },
    { key: '有条件/争议', label: '有条件/争议' },
  ] as const
  type FilterKey = typeof allFilters[number]['key']
  const [activeFilter, setActiveFilter] = useState<FilterKey>('全部')
  const claimGroups = (claim: Claim): Exclude<FilterKey, '全部'> => {
    if (claim.signal === '较公认') return '较公认'
    if (claim.signal === '疑似夸大') return '疑似夸大'
    return '有条件/争议'
  }
  const countFor = (key: FilterKey) => key === '全部'
    ? data.claims.length
    : data.claims.filter((claim) => claimGroups(claim) === key).length
  // 空筛选（count 为 0）直接隐藏 —— 点进去是空列表的死按钮，且徒增一排撞色胶囊。
  const filters = allFilters.filter((filter) => countFor(filter.key) > 0)
  const visibleClaims = data.claims
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => activeFilter === '全部' || claimGroups(claim) === activeFilter)

  return (
    <div className="pb-1">
      {data.claims.length === 0 ? (
        <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">这条视频没有提取到可核验说法。</p>
      ) : (
        <>
          {/* 筛选：每一类始终保留对应颜色与描边，选中态仅加强底色。 */}
          <div className="no-scrollbar mt-1 flex gap-1.5 overflow-x-auto pb-1">
            {filters.map((filter) => {
              const active = activeFilter === filter.key
              const tone = filter.key === '较公认'
                ? { idle: 'border-[#BFECE5] bg-[#F8FCFB] text-[#0B9F91]', active: 'border-[#8EDDD2] bg-[#EAF9F6] text-[#078C7E]' }
                : filter.key === '疑似夸大'
                  ? { idle: 'border-[#F6D8A9] bg-[#FFFCF7] text-[#C77A16]', active: 'border-[#E9B65D] bg-[#FFE6C1] text-[#A95F06] shadow-[0_2px_6px_rgba(218,139,20,0.13)]' }
                  : filter.key === '有条件/争议'
                    ? { idle: 'border-[#D6E0EC] bg-[#FAFCFE] text-[#64748B]', active: 'border-[#9EB2C8] bg-[#E3EBF4] text-[#435975] shadow-[0_2px_6px_rgba(82,100,122,0.12)]' }
                    : { idle: 'border-[#BFECE5] bg-[#F8FCFB] text-[#078C7E]', active: 'border-[#0FAF9C] bg-[#15B9A9] text-white shadow-[0_3px_8px_rgba(15,185,169,0.18)]' }
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`t-meta shrink-0 rounded-full border px-2.5 py-1 transition ${active ? tone.active : tone.idle}`}
                >
                  {filter.label} {countFor(filter.key)}
                </button>
              )
            })}
          </div>

          {/* 独立观点卡：顶部状态、正文与真实核验切入点分层，不用左侧色条。 */}
          <div className="mt-2 space-y-2">
            {visibleClaims.map(({ claim, index }) => {
              const group = claimGroups(claim)
              const c = group === '较公认'
                ? { number: 'border-[#BFECE5] bg-white text-[#0B8D7D]', tag: 'bg-[#EAF9F6] text-[#0B8D7D]', text: 'text-[#0B8D7D]' }
                : group === '疑似夸大'
                  ? { number: 'border-[#F6D8A9] bg-white text-[#C77A16]', tag: 'bg-[#FFF4E5] text-[#C77A16]', text: 'text-[#C77A16]' }
                  : { number: 'border-[#D6E0EC] bg-white text-[#64748B]', tag: 'bg-[#F1F5F9] text-[#64748B]', text: 'text-[#64748B]' }
              return (
                <button
                  key={`${claim.claim}-${index}`}
                  type="button"
                  onClick={() => onOpenClaim(index)}
                  className="w-full rounded-[16px] border border-[#E6EEF0] bg-white px-3 py-2.5 text-left shadow-[0_3px_10px_rgba(15,60,58,0.04)] transition hover:border-[#D5E4E4] hover:shadow-[0_5px_14px_rgba(15,60,58,0.06)]"
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold tabular-nums ${c.number}`}>{String(index + 1).padStart(2, '0')}</span>
                    <span className={`t-micro shrink-0 rounded-md px-1.5 py-0.5 font-semibold ${c.tag}`}>{group}</span>
                    <span className="min-w-0 flex-1" />
                    {(() => {
                      const state = states[index]
                      // Option B：后台已核验也先显示「尚未核验」，用户点开看过实时过程后才亮出结论。
                      const shown = revealed[index]
                      if (!shown) return <span className="t-micro flex shrink-0 items-center gap-1.5 text-slate-400"><i className="relative flex h-2 w-2 shrink-0"><i className="absolute inset-0 animate-ping rounded-full bg-slate-400/55" /><i className="relative h-2 w-2 animate-pulse rounded-full bg-slate-500" /></i>尚未核验</span>
                      if (state?.status === 'loading') return <span className="t-micro flex shrink-0 items-center gap-1 text-slate-400"><LoadingDots />核验中…</span>
                      if (state?.status === 'error') return <span className="t-micro shrink-0 text-amber-700">核验失败</span>
                      if (state?.status === 'done' && state.result) {
                        const downgraded = isEvidenceDowngraded(state.result)
                        const statusDot = downgraded
                          ? 'bg-amber-500'
                          : state.result.risk_level.includes('高')
                            ? 'bg-red-500'
                            : state.result.risk_level.includes('中')
                              ? 'bg-amber-500'
                              : 'bg-[#20CDB6]'
                        return <span className="t-micro flex max-w-[36%] shrink-0 items-center gap-1 truncate font-semibold text-slate-600"><i className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />{state.result.verdict}</span>
                      }
                      return <span className="t-micro flex shrink-0 items-center gap-1.5 text-slate-400"><i className="relative flex h-2 w-2 shrink-0"><i className="absolute inset-0 animate-ping rounded-full bg-slate-400/55" /><i className="relative h-2 w-2 animate-pulse rounded-full bg-slate-500" /></i>尚未核验</span>
                    })()}
                    <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5.5 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                  <p className="t-body mt-1.5 line-clamp-2 font-semibold leading-relaxed text-slate-900">{claim.claim}</p>
                  <div className="mt-1.5 grid grid-cols-[88px_98px_minmax(0,1fr)] border-t border-dashed border-[#E7EEF0] pt-1.5">
                    <span className="flex min-w-0 items-center gap-1.5 border-r border-slate-100 pr-2"><i className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#E9EEF5] text-[#7F8EA8]"><svg className="h-3 w-3 translate-x-px" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.7 3.2c0-.8.9-1.3 1.6-.8l6.1 4.3c.9.6.9 2 0 2.6l-6.1 4.3c-.7.5-1.6 0-1.6-.8V3.2Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" /></svg></i><span className="min-w-0"><span className="t-micro block truncate text-slate-400">视频片段</span><span className="t-micro block truncate font-semibold text-slate-500">{firstTime(claim)}</span></span></span>
                    <span className="flex min-w-0 items-center gap-1.5 border-r border-slate-100 px-2"><svg className="h-5 w-5 shrink-0 text-[#8191AA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v18M4 7h16M6.5 7 3.8 13h5.4L6.5 7ZM17.5 7l-2.7 6h5.4l-2.7-6ZM5 20h14" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="min-w-0"><span className="t-micro block truncate text-slate-400">初步判断</span><span className={`t-micro block truncate font-semibold ${c.text}`}>{group}</span></span></span>
                    <span className="flex min-w-0 items-center gap-1.5 pl-2"><svg className="h-5 w-5 shrink-0 text-[#8191AA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden="true"><rect x="5.2" y="3.4" width="13.6" height="17.2" rx="2" /><path d="M9 3.4h6v3H9zM8.8 11h6.4M8.8 14.5h6.4" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="min-w-0"><span className="t-micro block truncate text-slate-400">核验切入点</span><span className="t-micro block truncate font-semibold text-slate-500">{claim.why || '未标注核验切入点'}</span></span></span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function videoTimeUrl(url: string, time?: string) {
  if (!url || !time) return url
  const parts = time.split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return url
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return `${url}${url.includes('#') ? '&' : '#'}t=${seconds}`
}

function AuthorityDiagnosisCard({ result, citations, origin, onOpenEvidence, animate = false }: { result: VerifyResult; citations: EvidenceEntry[]; origin?: NonNullable<VerifyResult['claim_origin']>; onOpenEvidence: (evidence: EvidenceEntry[]) => void; animate?: boolean }) {
  // 检索到但未被采信的文献（降级案例）：按 source_doc 去重，用于「未命中出处」处诚实列出，
  // 解释「检索到了、但研判不足以支撑」，避免与思考过程「检索到 N 篇」自相矛盾。
  const reviewedDocs = Array.from(
    new Map((result.evidence || []).filter((item) => item.source_doc).map((item) => [item.source_doc, item] as const)).values()
  )
  const displayVerdict = result.verdict.trim() === '证据不足' ? '证据不足，不建议采纳' : result.verdict
  const verdictCharacters = Array.from(displayVerdict)
  const correctionCharacters = Array.from(result.correction)
  const totalCharacters = verdictCharacters.length + correctionCharacters.length
  const [revealedCount, setRevealedCount] = useState(0)
  const [revealComplete, setRevealComplete] = useState(false)
  const cardRef = useRef<HTMLElement | null>(null)

  // 揭示不在挂载时就跑 —— 诊断卡结果一到就渲染，但常在屏幕下方，
  // 用户还在上面看核验过程，等滑下来揭示早演完了（只剩盖章）。
  // 改为 IntersectionObserver：卡片真正进入视口才开始，保证从头看到逐字。
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // animate=false：该说法在打开诊断前已核验完成 → 直接静态呈现完整结论，
    // 不再逐字"揭示"一遍（对已完成的结果重放打字机是无意义的特效，反而不可信）。
    // 只有打开时还在实时核验（未完成）才逐字揭示，那是真实进行中的过程。
    if (!animate || reducedMotion || totalCharacters === 0) {
      setRevealedCount(totalCharacters)
      setRevealComplete(true)
      return
    }
    setRevealedCount(0)
    setRevealComplete(false)

    const timers: number[] = []
    let started = false
    // 分段揭示：先逐字出 verdict → 停顿 → 逐字出 correction → 停顿 → 盖章。
    // 每字 48ms（比原来慢），加两处停顿，让用户看清每一段而不是一闪而过。
    const CHAR_MS = 48
    const PAUSE_AFTER_VERDICT = 450
    const PAUSE_BEFORE_STAMP = 550
    const vLen = verdictCharacters.length
    const startReveal = () => {
      if (started) return
      started = true
      const revealRange = (from: number, to: number, onDone: () => void) => {
        let count = from
        const t = window.setInterval(() => {
          count += 1
          setRevealedCount(count)
          if (count >= to) { window.clearInterval(t); onDone() }
        }, CHAR_MS)
        timers.push(t)
      }
      revealRange(0, vLen, () => {
        timers.push(window.setTimeout(() => {
          revealRange(vLen, totalCharacters, () => {
            timers.push(window.setTimeout(() => setRevealComplete(true), PAUSE_BEFORE_STAMP))
          })
        }, PAUSE_AFTER_VERDICT))
      })
    }

    // 用滚动监听 + getBoundingClientRect 判断卡片是否进入视口，而不是
    // IntersectionObserver —— IO 在这个 fixed 覆盖层 + 内部滚动的上下文里不触发。
    // capture:true 让 window 也能收到内部滚动容器冒泡上来的 scroll。
    const node = cardRef.current
    const inView = () => {
      if (!node) return true
      const rect = node.getBoundingClientRect()
      const vh = window.innerHeight || document.documentElement.clientHeight
      return rect.top < vh * 0.85 && rect.bottom > vh * 0.15
    }
    const check = () => { if (inView()) { cleanup(); startReveal() } }
    const cleanup = () => {
      window.removeEventListener('scroll', check, true)
      window.removeEventListener('resize', check)
    }
    if (!node || inView()) {
      startReveal()
    } else {
      window.addEventListener('scroll', check, true)
      window.addEventListener('resize', check)
      // 兜底：万一滚动事件收不到，最迟 6s 后也开始，绝不让文字永远空着。
      // 设得足够长，避免用户还在上面看核验过程时就提前把揭示演掉。
      timers.push(window.setTimeout(startReveal, 6000))
    }
    return () => { cleanup(); timers.forEach((id) => { window.clearInterval(id); window.clearTimeout(id) }) }
  }, [displayVerdict, result.correction, totalCharacters, animate])

  const revealedVerdict = verdictCharacters.slice(0, Math.min(revealedCount, verdictCharacters.length)).join('')
  const revealedCorrection = correctionCharacters.slice(0, Math.max(0, revealedCount - verdictCharacters.length)).join('')
  const verdictComplete = revealedCount >= verdictCharacters.length
  const riskColor = stampTone(result.risk_level)
  return <section ref={cardRef} data-clinical-report className="relative z-[1] overflow-hidden rounded-[8px] border border-[#D7DEDF] bg-[#FFFEFC] shadow-[0_4px_14px_rgba(38,50,63,0.06)]">
    <div data-report-conclusion className="relative px-4 pb-3.5 pt-4" style={{ borderTop: `3px solid ${riskColor}` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="t-label font-semibold text-[#526171]">核验结论</p>
          <p data-diagnosis-verdict className="font-report t-verdict relative mt-1 font-bold leading-snug tracking-[0.01em]" aria-label={verdictComplete ? undefined : displayVerdict} style={{ color: riskColor }}>{verdictComplete ? displayVerdict : <><span aria-hidden="true" style={{ visibility: 'hidden' }}>{displayVerdict}</span><span aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>{revealedVerdict}</span></>}</p>
          <p className="font-report t-meta mt-1.5 text-[#758292]">风险等级：{result.risk_level || '未标注'}　依据当前检索结果</p>
        </div>
        {revealComplete ? <VerdictStamp verdict={displayVerdict} riskLevel={result.risk_level} /> : <span aria-hidden="true" className="h-[84px] w-[84px] shrink-0" />}
      </div>
    </div>
    <div className="border-t border-[#D9DEDF] px-4 py-3.5">
      <p className="t-label mb-2.5 font-semibold text-[#3F4D5C]">判断依据</p>
      <EvidenceStrength embedded variant="clinical" tier={result.evidence_tier || '无'} strength={result.strength || ''} org={citations[0]?.org} sourceDoc={citations[0]?.source_doc} />
      {citations.length > 0 ? <div data-clinical-citations className="mt-3 border-t border-[#D9DEDF] pt-2.5"><div className="divide-y divide-[#E2E6E7]">{citations.map((item, index) => <button key={[item.source_doc, item.org, item.page, index].join('|')} type="button" onClick={() => onOpenEvidence(citations)} className="flex w-full items-center gap-2.5 py-2.5 text-left"><span className="font-cite t-meta shrink-0 text-[#73808D]">[{index + 1}]</span><span className="min-w-0 flex-1"><span className="font-cite t-label block truncate font-semibold text-[#253242]">《{item.source_doc}》</span><span className="font-cite t-meta mt-0.5 block truncate text-[#758292]">{item.org || '来源机构未标注'}{item.year ? ` · ${item.year}` : ''}{item.page ? ` · P.${item.page}` : ''}</span></span><span className="text-[#929EAA]">›</span></button>)}</div></div> : reviewedDocs.length > 0 ? <div data-clinical-citations className="mt-3 border-t border-[#D9DEDF] pt-2.5"><p className="t-meta mb-1.5 leading-relaxed text-[#667586]">检索到相关文献，但不足以直接支撑该说法：</p><div className="divide-y divide-[#E2E6E7]">{reviewedDocs.map((item, index) => <button key={[item.source_doc, item.org, index].join('|')} type="button" onClick={() => onOpenEvidence(reviewedDocs)} className="flex w-full items-start gap-2.5 py-2.5 text-left"><span className="font-cite t-meta mt-0.5 shrink-0 text-[#73808D]">[{index + 1}]</span><span className="min-w-0 flex-1"><span className="font-cite t-label line-clamp-2 font-semibold text-[#394757]">《{item.source_doc}》</span><span className="font-cite t-meta mt-0.5 block truncate text-[#7A8794]">{item.org || '来源机构未标注'}{item.year ? ` · ${item.year}` : ''}{item.page ? ` · P.${item.page}` : ''}</span></span><span className="mt-1 shrink-0 text-[#9BA6B0]">›</span></button>)}</div></div> : <p data-clinical-citations className="t-meta mt-3 border-t border-[#D9DEDF] pt-2.5 leading-relaxed text-[#667586]">当前未检索到相关权威文献。</p>}
      {origin ? <ClaimOrigin origin={origin} embedded variant="clinical" /> : null}
      <div className="mt-3 border-t border-[#D9DEDF] pt-3"><p data-correction-icon className="t-label font-semibold text-[#3F4D5C]">更准确的说法</p><p className="font-report t-label mt-2 text-[13.5px] leading-[1.7] text-[#394757]" aria-label={revealComplete ? undefined : result.correction} style={revealComplete ? undefined : { position: 'relative' }}>{revealComplete ? result.correction : <><span aria-hidden="true" style={{ visibility: 'hidden' }}>{result.correction}</span><span aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>{revealedCorrection}</span></>}</p></div>
    </div>
  </section>
}

function ConfrontationCard({ claim, state, keyframes, onRetry, onEvidence, onOpenImage, claimCount, claimIndex, videoUrl, animate = false }: { claim: Claim; state: VerifyState; keyframes: Keyframe[]; onRetry: () => void; onEvidence: (evidence: EvidenceEntry[]) => void; onOpenImage: (frame: Keyframe) => void; claimCount: number; claimIndex: number; videoUrl: string; animate?: boolean }) {
  const result = state.status === 'done' ? state.result : undefined
  const supportEvidence = result ? citedEvidence(result) : []
  const citations = uniqueEvidenceById(supportEvidence)
  const downgraded = result ? isEvidenceDowngraded(result) : false
  const sourceDocs = new Set(supportEvidence.map((item) => item.source_doc).filter(Boolean))
  const orgs = new Set(supportEvidence.map((item) => item.org).filter(Boolean))
  // 命中文献展示名（机构《文献》，去重），给 fallback 步骤的胶囊用；对齐后端 sources 格式。
  // 取「检索到的」result.evidence 而非「引用的」citedEvidence —— 降级案例里模型没引用
  // 任何一篇，用 citedEvidence 会得到空数组、胶囊不显示（与 #2「已查阅 0 篇」同源）。
  const sourceNames = Array.from(new Map((result?.evidence || [])
    .filter((item) => item.source_doc)
    .map((item) => {
      const doc = item.source_doc.startsWith('《') ? item.source_doc : `《${item.source_doc}》`
      const name = item.org ? `${item.org}${doc}` : doc
      return [name, name] as const
    })).values())
  const fallbackTraceSteps: ReasoningStep[] = result ? [
    { label: '提取视频观点', detail: `拆出 ${claimCount} 条可核验说法`, tone: 'ok', icon: 'extract', status: 'done' },
    { label: '检索相关文献', detail: downgraded ? '当前未命中已收录权威依据' : `命中 ${supportEvidence.length} 条依据`, tone: downgraded ? 'warn' : 'ok', icon: 'search', status: 'done', sources: sourceNames },
    { label: `比对 ${claimCount} 条核心观点`, detail: downgraded ? '无法完成权威依据交叉比对' : `涉及 ${sourceDocs.size} 篇文献、${orgs.size} 家机构`, tone: downgraded ? 'warn' : 'ok', icon: 'compare', status: 'done' },
    { label: '生成核验结论', detail: downgraded ? '结论已明确标注为辅助判断' : '综合证据与适用条件输出结论', tone: downgraded ? 'warn' : 'ok', icon: 'verdict', status: 'done' },
  ] : []
  // 流式步骤来自后端真实 trace；核验结束后也必须保留，不能被前端摘要四步覆盖。
  const traceSteps = state.streamSteps && state.streamSteps.length > 0 ? state.streamSteps : fallbackTraceSteps
  // 「已查阅」= 检索到的文献数(result.evidence)，不是模型最终引用的(citedEvidence)。
  // 降级案例里检索命中若干篇但模型未引用，用 citedEvidence 会错显示「0 篇」。
  const reviewedDocs = new Set((result?.evidence || []).map((item) => item.source_doc).filter(Boolean))
  const traceSummary = `已查阅 ${reviewedDocs.size} 篇文献｜分析 ${claimCount} 条观点`

  const showConclusion = Boolean(result)

  return (
    <div className="space-y-3 pb-2">
      <section className="-mt-3 rounded-[16px] bg-white px-1 pt-1">
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-black tracking-[-0.035em] text-[#17243B]">视频观点 {claimIndex + 1}</h1>
          <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${signalClass(claim.signal)}`}>{claimGroupsLabel(claim)}</span>
        </div>
        {claim.video_refs?.[0]?.time ? <a href={videoTimeUrl(videoUrl, claim.video_refs[0].time)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4C7890]" aria-label={`在原视频打开 ${claim.video_refs[0].time} 片段`}><svg className="h-4 w-4 text-[#0B9F91]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="7.2" /><path d="m8.4 6.9 5 3.1-5 3.1V6.9Z" fill="currentColor" stroke="none" /></svg>视频片段&nbsp;{claim.video_refs[0].time}</a> : null}
        <div className="relative mt-1.5 rounded-[12px] border border-[#DCE5E5] bg-[#FCFEFE] px-4 py-3">
          <span className="absolute left-3 top-3 select-none text-[46px] font-black leading-none text-[#087F76]" aria-hidden="true">“</span>
          <p className="pl-8 text-[14px] font-semibold leading-[1.6] tracking-[-0.015em] text-[#23334B]">{claim.claim}</p>
        </div>
      </section>

      {state.status === 'error' ? <section className="mt-5 rounded-[10px] border border-slate-200 bg-white px-4 py-3"><p className="t-label text-slate-700">核验失败</p><button type="button" onClick={onRetry} className="t-label mt-3 rounded-[6px] border border-slate-300 px-3 py-2 text-slate-700">重新核验这一条</button></section> : null}
      {state.status !== 'error' ? <ReasoningTrace summary={showConclusion ? traceSummary : state.streamSteps?.length ? '正在核验 · 实时工作过程' : state.status === 'pending' ? '等待开始' : '准备核验…'} steps={traceSteps} completed={showConclusion} forceExpanded={!showConclusion} footer={showConclusion && downgraded ? <p className="mt-2 whitespace-nowrap border-t border-dashed border-[#E8C894] pt-2 text-[10px] leading-tight text-[#B56A12]">未命中权威数据库：以下为 AI 辅助归纳，非权威依据。</p> : null} /> : null}
      {showConclusion && result ? <AuthorityDiagnosisCard result={result} citations={citations} origin={result.claim_origin || undefined} onOpenEvidence={onEvidence} animate={animate} /> : null}
    </div>
  )
}

function summaryVerdictTone(result: VerifyResult, signal: Claim['signal']) {
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
      labelClass: 'bg-[#EAF9F6] text-[#078C7E]',
      stamp: '以情况而定',
      stampClass: 'border-[#527DBB] text-[#466FAA]',
    }
  }
  return {
    kind: 'accepted',
    label: '基本可信',
    labelClass: 'bg-[#EAF9F6] text-[#078C7E]',
    stamp: '建议采纳',
    stampClass: 'border-[#1AA28F] text-[#078C7E]',
  }
}

function SummaryFact({
  kind,
  label,
  value,
}: {
  kind: 'evidence' | 'status' | 'action'
  label: string
  value: string
}) {
  const icon = kind === 'evidence' ? (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3.75 5.25h5.1A3.15 3.15 0 0 1 12 8.4v10.35a3.15 3.15 0 0 0-3.15-3.15h-5.1V5.25Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M20.25 5.25h-5.1A3.15 3.15 0 0 0 12 8.4v10.35a3.15 3.15 0 0 1 3.15-3.15h5.1V5.25Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 8.4v10.35" strokeLinecap="round" /></svg>
  ) : kind === 'status' ? (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4.25 19V13.5h3V19m2.5 0V9.5h3V19m2.5 0V5h3v14" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 19.5h18" strokeLinecap="round" /></svg>
  ) : (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.75" /><path d="m8.15 12.05 2.45 2.45 5.25-5.35" strokeLinecap="round" strokeLinejoin="round" /></svg>
  )

  return (
    <div data-summary-fact className="mx-auto flex w-fit max-w-full min-w-0 items-start justify-center gap-1.5 px-1 text-center">
      <span className="shrink-0 text-[#0BAA98]">{icon}</span>
      <span className="min-w-0 text-left">
        <span data-summary-fact-label className="t-micro block truncate text-left font-bold text-[#0BAA98]">{label}</span>
        <span data-summary-fact-value className="t-micro block truncate text-left text-slate-500" title={value}>{value}</span>
      </span>
    </div>
  )
}

function VerdictSummaryItem({ claim, result, relatedAction, actionsLoading, expanded, onToggleCorrection }: { claim: Claim; result: VerifyResult; relatedAction?: SingleActionAdvice; actionsLoading: boolean; expanded: boolean; onToggleCorrection: () => void }) {
  const tone = summaryVerdictTone(result, claim.signal)
  const firstEvidence = result.evidence?.[0]
  const evidenceBasis = firstEvidence
    ? [firstEvidence.org, firstEvidence.source_doc].filter(Boolean).join(' · ')
    : '未命中已收录依据'
  const evidenceState = result.evidence_status === 'not_found'
    ? '库中未收录'
    : `${result.strength || '已匹配'} · ${result.evidence?.length || 0} 条`
  const actionText = actionsLoading
    ? '建议生成中'
    : relatedAction?.steps?.[0]?.title || relatedAction?.condition || '暂无专项建议'

  return (
    <article className="rounded-[10px] border border-slate-200/80 bg-white p-[10px] shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-2.5">
        <ClaimIcon icon={resolvedClaimIcon(claim)} borderless imageClassName="h-[88%] w-[88%]" className="h-11 w-11 shadow-[0_3px_8px_rgba(15,80,74,0.12)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone.labelClass}`}>
              <svg data-summary-diagnosis-icon className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 7.1v3.4M8 4.75v.1" strokeLinecap="round" /></svg>
              {tone.label}
            </span>
            <span className={`inline-block shrink-0 -rotate-2 rounded-[8px] border-2 bg-white px-2 py-1 text-[10px] font-black leading-tight ${tone.stampClass}`}>{tone.stamp}</span>
          </div>
          <p data-summary-quote className="t-label mt-1.5 line-clamp-2 font-bold leading-[1.45] text-slate-950">
            <span data-summary-quote-mark className="t-verdict mr-0.5 text-[#20B8A8]" style={{ fontWeight: 900 }}>“</span>{claim.claim}<span data-summary-quote-mark className="t-verdict ml-0.5 text-[#20B8A8]" style={{ fontWeight: 900 }}>”</span>
          </p>
        </div>
      </div>
      <button type="button" onClick={onToggleCorrection} aria-expanded={expanded} className="mt-2 flex w-full items-start gap-2.5 rounded-[12px] border border-[#CDEDE7] bg-[#F0FBF8] px-2.5 py-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[#078C7E]" aria-hidden="true">
          <svg data-accurate-shield className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 2.75 4.75 6v5.45c0 4.72 2.98 8.2 7.25 10.05 4.27-1.85 7.25-5.33 7.25-10.05V6L12 2.75Z" strokeLinejoin="round" /><path d="m8.35 12.1 2.25 2.25 5.05-5.05" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span data-accurate-title className="t-meta flex items-center justify-between gap-2 font-black text-[#078C7E]">更准确的说法
            <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span
            data-accurate-copy
            className="t-meta mt-0.5 block leading-[1.5] text-slate-600"
            style={expanded ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden' }}
          >
            {result.correction}
          </span>
        </span>
      </button>
      <div className="mt-2.5 grid grid-cols-3 divide-x divide-slate-200/80 border-t border-dashed border-slate-200 pt-2">
        <div data-summary-evidence className="flex min-w-0 justify-center"><SummaryFact kind="evidence" label="判断依据" value={evidenceBasis} /></div>
        <div data-summary-status className="flex min-w-0 justify-center"><SummaryFact kind="status" label="证据状态" value={evidenceState} /></div>
        <div data-summary-action className="flex min-w-0 justify-center"><SummaryFact kind="action" label="建议" value={actionText} /></div>
      </div>
    </article>
  )
}

function SummaryCard({ claims, states, actions, actionsLoading, shareReady, shareBusy, onShare }: { claims: Claim[]; states: VerifyState[]; actions: SingleActionAdvice[]; actionsLoading: boolean; shareReady: boolean; shareBusy: boolean; onShare: () => void }) {
  const [expandedCorrections, setExpandedCorrections] = useState<number[]>([])
  const completedCount = states.filter((state) => state.status === 'done').length
  const isReviewing = completedCount < claims.length
  const completed = states
    .map((state, index) => ({ state, claim: claims[index], index }))
    .filter((item): item is { state: VerifyState & { status: 'done'; result: VerifyResult }; claim: Claim; index: number } => item.state.status === 'done' && Boolean(item.state.result) && Boolean(item.claim))
  const cautionary = completed.filter(({ claim, state }) => {
    const tone = summaryVerdictTone(state.result, claim.signal)
    return tone.kind !== 'accepted'
  })
  const accepted = completed.filter(({ claim, state }) => summaryVerdictTone(state.result, claim.signal).kind === 'accepted')
  const featured = [...cautionary, ...accepted.slice(0, Math.max(0, 3 - cautionary.length))]

  return (
    <div className="pb-2">
      <div className="pt-1">
        <div data-summary-completion className="mb-3 flex items-center justify-between gap-2 rounded-[10px] border border-[#BDE8E1] bg-[#F1FBF8] px-2.5 py-2 shadow-[0_2px_7px_rgba(11,110,99,0.035)]">
          <span className="flex min-w-0 items-center gap-1.5 text-[#078C7E]">
            <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.75" /><path d="m8.2 12.05 2.4 2.4 5.2-5.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="t-micro truncate font-bold">{isReviewing ? '正在筛查高风险说法与纠偏建议' : '已完成高风险筛查与纠偏建议整理'}</span>
          </span>
          <span className="t-micro shrink-0 text-right text-slate-500">{isReviewing ? `已核验 ${completedCount} / ${claims.length} 条` : `已核验 ${completedCount} 条说法 · 输出重点误导风险`}</span>
        </div>
        {claims.length === 0 ? (
          <div className="rounded-2xl border border-[#20CDB6]/20 bg-[#E1F5EE] px-4 py-6 text-center">
            <p className="text-base font-semibold text-[#0B6E63]">无可核验说法</p>
            <p className="mt-1 text-sm text-slate-500">这条视频没有提取出可供证据核验的主张。</p>
          </div>
        ) : featured.length > 0 ? (
          <div className="space-y-2.5">
            {featured.map(({ claim, state, index }) => (
              <VerdictSummaryItem
                key={`${claim.claim}-${index}`}
                claim={claim}
                result={state.result}
                relatedAction={actions.find((action) => action.claim_indices.includes(index))}
                actionsLoading={actionsLoading}
                expanded={expandedCorrections.includes(index)}
                onToggleCorrection={() => setExpandedCorrections((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#20CDB6]/25 bg-[#E1F5EE] px-4 py-6 text-center">
            <p className="text-base font-bold text-[#0B6E63]">
              {completedCount === 0 ? '去说法全景选一条开始核验' : isReviewing ? '已核验部分暂未发现明显误导' : '这条视频整体较稳，未发现明显误导'}
            </p>
            {isReviewing && <p className="mt-1.5 text-xs text-slate-500">其余说法仍在审理中</p>}
          </div>
        )}

        {claims.length > 0 && (
          <div className="mt-4 border-t border-[#D8F0EC] pt-3 text-center">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#0B6E63]">求真结论</p>
            <p className="mt-1 text-[13px] font-bold text-slate-900">
              共 {claims.length} 条说法，其中 {cautionary.length} 条需要谨慎判断
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

const SINGLE_ACTION_TONES = {
  normal: { border: 'border-[#9FE4D9]', text: 'text-[#078C7E]', soft: 'bg-[#EAF8F5]', dot: 'bg-[#20CDB6]' },
  caution: { border: 'border-[#F6CF8C]', text: 'text-[#C87608]', soft: 'bg-[#FFF6E7]', dot: 'bg-[#F2A11C]' },
  urgent: { border: 'border-[#F5B2B6]', text: 'text-[#C53B43]', soft: 'bg-[#FFF0F1]', dot: 'bg-[#E6535B]' },
}

function ActionSectionMarker() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ActionPrinciples() {
  const items = [
    { label: '按人群区分', icon: <><circle cx="7" cy="7" r="2.2" /><circle cx="15.5" cy="7.5" r="1.8" /><path d="M2.8 17c.5-3.3 2.4-5.1 5.2-5.1s4.7 1.8 5.2 5.1M13 13c2.5-.4 4.3.8 5 3.5" strokeLinecap="round" /></> },
    { label: '按目标匹配', icon: <><circle cx="11" cy="11" r="7.2" /><circle cx="11" cy="11" r="3.6" /><path d="m11 11 6-6m0 0v3.5M17 5h-3.5" strokeLinecap="round" strokeLinejoin="round" /></> },
    { label: '关注身体反应', icon: <><path d="M4 11h3l1.8-4 3.3 8 2.1-4H20" strokeLinecap="round" strokeLinejoin="round" /><path d="M11.8 20C6.4 16.8 3.5 13.9 3.5 9.7A4.2 4.2 0 0 1 11 7.1a4.2 4.2 0 0 1 7.5 2.6c0 4.2-2.9 7.1-8.3 10.3" strokeLinecap="round" strokeLinejoin="round" /></> },
  ]
  return (
    <div data-action-principles className="mt-2 grid grid-cols-3 divide-x divide-[#D6ECE8] overflow-hidden rounded-[9px] border border-[#CDEAE5] bg-white">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 items-center justify-center gap-1 px-1.5 py-1.5 text-[#079888]">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{item.icon}</svg>
          <span className="t-micro truncate font-bold">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function ActionAdviceCard({ actions, claims, states, loading, requested, error, onGenerate, onVerifyAll, onEvidence }: { actions: SingleActionAdvice[]; claims: Claim[]; states: VerifyState[]; loading: boolean; requested: boolean; error: boolean; onGenerate: () => void; onVerifyAll: () => void; onEvidence: (evidence: EvidenceEntry[]) => void }) {
  const verifiedCount = states.filter((state) => state.status === 'done' && state.result).length
  const verifyingCount = states.filter((state) => state.status === 'loading').length
  const evidenceFor = (action: SingleActionAdvice) => uniqueEvidenceById(action.evidence_ids.flatMap((id) => states.flatMap((state) => state.result?.evidence || []).filter((item) => item.id === id)))
  const locked = verifiedCount === 0
  const verificationSettled = states.every((state) => state.status === 'done' || state.status === 'error')
  useEffect(() => {
    if (!locked && verificationSettled && !loading && !requested && actions.length === 0) onGenerate()
  }, [actions.length, loading, locked, onGenerate, requested, verificationSettled])
  return <div className="action-advice-density space-y-2.5">
    <div>
      <div className="inline-flex items-center rounded-full bg-[#EAF8F5] px-3 py-1 text-[13px] font-black text-[#078C7E]">基于你已核验的 {verifiedCount} 条说法</div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-relaxed text-[#71839E]"><svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3.5 19 6v5c0 4.3-2.8 7.7-7 9.5-4.2-1.8-7-5.2-7-9.5V6l7-2.5Z" /><path d="m8.8 12.1 2.1 2.1 4.2-4.3" /></svg>{locked ? '至少完成 1 条说法核验后，再根据已核验内容生成建议；不输出猜测性内容。' : '建议只基于已核验说法与对应证据生成，不包含未核验内容。'}</p>
      <ActionPrinciples />
    </div>
    {locked ? <div className="rounded-[18px] border border-[#D9E7E7] bg-[linear-gradient(135deg,#FFFFFF,#F8FCFC)] px-4 py-6 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#EFF8F7] text-[#0B8F82]"><svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3.5 19 6v5c0 4.3-2.8 7.7-7 9.5-4.2-1.8-7-5.2-7-9.5V6l7-2.5Z" /><path d="m8.8 12.1 2.1 2.1 4.2-4.3" /></svg></div><p className="mt-3 text-[18px] font-black text-slate-900">生成你的专属行动建议</p><p className="mt-1 px-2 text-[13px] leading-relaxed text-slate-400">行动建议只依据已核验的说法，避免给出没有根据的健康建议。一键核验全部说法即可生成。</p>{verifyingCount > 0 ? <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#EAF8F5] px-4 py-2.5 text-[14px] font-black text-[#0B6E63]"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></svg>正在核验全部说法…</div> : <button type="button" onClick={onVerifyAll} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#20CDB6] px-5 py-2.5 text-[14px] font-black text-white shadow-[0_8px_20px_rgba(32,205,182,0.28)] transition hover:brightness-[1.03]"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3.5 19 6v5c0 4.3-2.8 7.7-7 9.5-4.2-1.8-7-5.2-7-9.5V6l7-2.5Z" strokeLinejoin="round" /><path d="m8.8 12.1 2.1 2.1 4.2-4.3" strokeLinecap="round" strokeLinejoin="round" /></svg>一键核验全部并生成建议</button>}<p className="mt-3 text-[11px] text-slate-400">也可以只核验你关心的几条，回到「说法全景」逐条点选。</p></div> : actions.length === 0 && loading ? <div className="rounded-[18px] border border-[#91DDD1] bg-[linear-gradient(135deg,#FFFFFF,#F0FBF8)] px-4 py-7 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#E7F8F4] text-[#078C7E]"><svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></svg></span><span className="mt-3 block text-[17px] font-black text-[#0B6E63]">正在生成行动建议…</span></div> : actions.length === 0 && error ? <div className="rounded-[18px] border border-[#F3D6A6] bg-[#FFFBF4] px-4 py-7 text-center"><p className="text-[17px] font-black text-slate-900">行动建议生成失败</p><p className="mt-1 text-sm text-slate-400">可能是网络波动或服务繁忙，已核验内容仍在。</p><button type="button" onClick={onGenerate} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#20CDB6] px-5 py-2.5 text-[14px] font-black text-white shadow-[0_8px_20px_rgba(32,205,182,0.28)] transition hover:brightness-[1.03]"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></svg>点此重试</button></div> : actions.length === 0 && requested ? <div className="rounded-[18px] border border-[#D9E7E7] bg-white px-4 py-7 text-center"><p className="text-[17px] font-black text-slate-900">当前尚无可用建议</p><p className="mt-1 text-sm text-slate-400">已核验内容不足以形成具体行动建议。</p></div> : actions.length === 0 ? <div className="rounded-[18px] border border-[#D9E7E7] bg-white px-4 py-7 text-center"><p className="text-[16px] font-black text-[#0B6E63]">正在等待核验完成…</p></div> : actions.map((action, actionIndex) => { const tone = SINGLE_ACTION_TONES[action.level as keyof typeof SINGLE_ACTION_TONES] || SINGLE_ACTION_TONES.caution; const evidence = evidenceFor(action); return <section key={`${action.condition}-${actionIndex}`} className="rounded-[18px] border border-slate-200/90 bg-white p-3 shadow-[0_6px_18px_rgba(15,80,74,0.10)]"><header className="flex items-center gap-2"><span data-action-audience-icon className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${tone.dot}`}><svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M6.5 19c.7-3.5 2.6-5.3 5.5-5.3s4.8 1.8 5.5 5.3" strokeLinecap="round" /></svg></span><h3 data-action-condition className="t-body min-w-0 flex-1 font-black text-slate-900">{action.condition}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-black ${tone.soft} ${tone.text}`}>适合谁</span></header>{action.steps.length > 0 && <div className="mt-3 border-y border-slate-100 py-3"><p className={`text-[12px] font-black ${tone.text}`}>› 建议动作</p><div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{action.steps.map((step, index) => <div key={`${step.title}-${index}`} className="flex shrink-0 items-center gap-2"><div className="w-[92px] text-center"><ActionIcon name={step.icon} className={"mx-auto h-8 w-8 " + tone.text} /><div className="mt-1 flex items-start justify-center gap-1"><span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-black text-white ${tone.dot}`}>{index + 1}</span><span className="text-left text-[11px] font-bold leading-tight text-slate-700">{step.title}<small className="mt-0.5 block text-[9px] font-normal text-slate-400">{step.note}</small></span></div></div>{index < action.steps.length - 1 && <span className={`text-xl ${tone.text}`}>›</span>}</div>)}</div></div>}{action.caution && <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-600"><span className={`inline-flex shrink-0 items-center gap-1 font-black ${tone.text}`}><ActionSectionMarker /> 需要注意</span><span data-action-caution-text className="text-[#C75B36]">{action.caution}</span></div>}<div className="mt-2 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-black ${tone.text}`}><ActionSectionMarker /> 查看依据</span>{action.claim_indices.map((claimIndex) => claims[claimIndex] && <span key={claimIndex} className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${tone.soft} ${tone.text}`}>已核验说法 {claimIndex + 1}</span>)}{evidence.map((item) => <button key={item.id} type="button" onClick={() => onEvidence([item])} className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${tone.soft} ${tone.text}`}>[{item.id}]</button>)}</div></section> })}
    <style jsx global>{`
      .action-advice-density > section { padding: 0.625rem 0.75rem; }
      .action-advice-density > section > header { gap: 0.375rem; }
      .action-advice-density > section > .border-y { margin-top: 0.5rem; padding-top: 0.5rem; padding-bottom: 0.5rem; }
      .action-advice-density > section > .border-y > div { margin-top: 0.375rem; gap: 0.375rem; padding-bottom: 0.125rem; }
      .action-advice-density > section > .border-y > div > div { gap: 0.375rem; }
      .action-advice-density > section > .border-y > div > div > div > div { margin-top: 0.125rem; }
      .action-advice-density > section > .text-slate-600 { margin-top: 0.375rem; gap: 0.375rem; }
      .action-advice-density > section > .border-t { margin-top: 0.375rem; padding-top: 0.375rem; gap: 0.25rem; }
    `}</style>
  </div>
}

function FollowupCard({ data, topic, claims, states }: { data: SingleAnalyzeResponse; topic: string; claims: Claim[]; states: VerifyState[] }) {
  const [messages, setMessages] = useState<FollowupMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const examples = [
    '这条视频里最需要注意哪一点？',
    '哪些人需要更谨慎地看待这些说法？',
    '日常照着做时，怎样会更稳妥？',
  ]
  const hasConversation = messages.length > 0 || loading

  async function sendQuestion(rawQuestion: string) {
    const question = rawQuestion.trim()
    if (!question || loading) return

    const history = messages.map((message) => ({ role: message.role, content: message.content }))
    const verifiedClaims = states.flatMap((state, index) => {
      const claim = claims[index]
      if (state.status !== 'done' || !state.result || !claim) return []
      return [{
        claim: claim.claim,
        signal: claim.signal,
        verdict: state.result.verdict,
        correction: state.result.correction,
      }]
    })

    setMessages((current) => [...current, { role: 'user', content: question }, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    let currentAnswer = ''
    const updateAnswer = (answer: string) => {
      if (!aliveRef.current) return
      setMessages((current) => {
        const next = [...current]
        const lastIndex = next.length - 1
        if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
          next[lastIndex] = { role: 'assistant', content: answer }
        }
        return next
      })
    }
    try {
      const payload = {
        reference: {
          author: data.reference.author,
          title: data.reference.title,
          url: data.reference.url,
        },
        topic: topic || data.topic,
        claims: verifiedClaims,
        question,
        history,
      }
      try {
        await followupSingleStream(payload, (_delta, answer) => {
          currentAnswer = answer
          updateAnswer(currentAnswer)
        })
      } catch {
        if (currentAnswer) throw new Error('stream-interrupted')
        const response = await followupSingle(payload)
        currentAnswer = response.answer
        updateAnswer(currentAnswer)
      }
    } catch {
      if (aliveRef.current) {
        updateAnswer(currentAnswer ? `${currentAnswer}\n\n回答意外中断，请重试。` : '追问失败，请重试')
      }
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-followup-scroll className="followup-scroll-area fitproof-scrollbar min-h-0 flex-1 overflow-y-auto pr-2">
      {!hasConversation && (
        <section>
          <p className="truncate text-[12px] leading-relaxed text-slate-500">基于数据库与权威文献回答，不引入无关外部信息。</p>
        </section>
      )}

      <section data-followup-brand className={`${hasConversation ? 'followup-ai-reposition mt-0' : 'mt-2'} rounded-[22px] border border-[#CDEDE7] bg-[#EFFAF8] px-3.5 py-2`}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold tracking-[-0.02em] text-[#17243B]">FitProof AI <span className="text-[#20CDB6]">✦</span></p>
            <p className="mt-1.5 text-[12px] leading-[1.55] text-[#52627E]">你的健康知识助手，结合医学数据库<br />与权威文献为你答疑解惑。</p>
          </div>
          <div role="img" aria-label="FitProof 小猫正在思考" className="fitproof-answer-cat pointer-events-none mt-1 shrink-0 self-center" />
        </div>
        <div className="mt-2 flex w-full flex-nowrap justify-between gap-1 text-[9px] font-medium text-[#078C7E]">
          <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-[#BFECE5] bg-white/80 px-1 py-1 whitespace-nowrap"><svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><path d="m12 3 7 3v5c0 4.2-2.8 8-7 10-4.2-2-7-5.8-7-10V6l7-3Z" strokeLinejoin="round" /><path d="m8.5 12 2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" /></svg>已核验内容</span>
          <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-[#BFECE5] bg-white/80 px-1 py-1 whitespace-nowrap"><svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><ellipse cx="12" cy="5.5" rx="6.5" ry="2.5" /><path d="M5.5 5.5v6c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-6M5.5 11.5v6C5.5 18.9 8.4 20 12 20s6.5-1.1 6.5-2.5v-6" /></svg>医学数据库</span>
          <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-[#BFECE5] bg-white/80 px-1 py-1 whitespace-nowrap"><svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 5.5c2.5-1.2 5.1-.9 8 1v12c-2.9-1.9-5.5-2.2-8-1V5.5ZM20 5.5c-2.5-1.2-5.1-.9-8 1v12c2.9-1.9 5.5-2.2 8-1V5.5Z" strokeLinejoin="round" /></svg>权威文献</span>
        </div>
      </section>

      {!hasConversation && (
        <div className="mt-2 space-y-2">
            <p className="flex items-center gap-2 px-1 text-[15px] font-black text-[#17243B]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(135deg,#3BD6C6,#17B8AD)] text-white shadow-[0_5px_10px_rgba(32,205,182,0.20)]"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 18.5 3.5 21l3.2-.9A8.5 8.5 0 1 0 5 18.5Z" strokeLinejoin="round" /><circle cx="8" cy="12" r=".7" fill="currentColor" /><circle cx="12" cy="12" r=".7" fill="currentColor" /><circle cx="16" cy="12" r=".7" fill="currentColor" /></svg></span>你可以这样问</p>
            <div className="space-y-2">
              {examples.map((example, index) => (
                <button key={example} type="button" onClick={() => void sendQuestion(example)} disabled={loading} className="flex w-full items-center gap-2.5 rounded-[15px] border border-[#CDEDE7] bg-white px-3 py-0.5 text-left text-[13px] text-[#52627E] shadow-[0_4px_12px_rgba(11,110,99,0.04)] disabled:opacity-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#F9FFFE_0%,#DDF7F2_68%,#C9EEE8_100%)] text-[#16B8AC]" aria-hidden="true">
                    {index === 0 ? <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true"><text x="12" y="10" fill="currentColor" fontSize="10" fontWeight="900" textAnchor="middle">?</text><circle cx="7.2" cy="15.2" r="2.45" fill="currentColor" opacity=".9" /><circle cx="16.8" cy="15.2" r="2.45" fill="currentColor" opacity=".9" /><path fill="currentColor" d="M3.7 21c.5-2.2 1.7-3.3 3.5-3.3s3 1.1 3.5 3.3H3.7Zm9.6 0c.5-2.2 1.7-3.3 3.5-3.3s3 1.1 3.5 3.3h-7.0Z" opacity=".9" /></svg> : index === 1 ? <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="11" r="4.8" fill="currentColor" /><path fill="currentColor" d="M9.2 15h5.6v3H9.2zM10.2 19h3.6l-.8 1.3h-2l-.8-1.3Z" /><path d="M12 2.4v1.8M4.8 5.4l1.3 1.3M19.2 5.4l-1.3 1.3M2.4 12h1.8M19.8 12h1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> : <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M3 5.3c2.8-.9 5.7-.4 8.5 1.2v10.9c-2.7-1.5-5.6-1.9-8.5-1V5.3Zm18 0c-2.8-.9-5.7-.4-8.5 1.2v10.9c2.7-1.5 5.6-1.9 8.5-1V5.3Z" /><path d="M12 6.5v10.1" stroke="white" strokeOpacity=".68" strokeWidth="1.25" /></svg>}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{example}</span>
                  <svg className="h-5 w-5 shrink-0 text-[#20CDB6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
        </div>
      )}

      {hasConversation && (
        <div className="mt-3 space-y-4 pb-2">
          {messages.map((message, index) => message.role === 'user' ? (
            <div key={`${message.role}-${index}`} className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#20CDB6] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                <ChatMarkdown content={message.content} />
              </div>
          ) : message.content ? (
            <div key={`${message.role}-${index}`} className="mr-auto max-w-[94%]">
              <div className="min-w-0 rounded-2xl rounded-bl-md border border-[#20CDB6]/20 bg-[#F3FBF9] px-3.5 py-2.5 text-sm leading-relaxed text-slate-700">
                <ChatMarkdown content={message.content} stripCitations />
              </div>
            </div>
          ) : null)}

        {loading && !messages[messages.length - 1]?.content && (
          <div className="mr-auto">
            <div className="rounded-2xl rounded-bl-md border border-[#20CDB6]/20 bg-[#F3FBF9] px-3.5 py-2.5 text-sm text-slate-400">正在核验回答…</div>
          </div>
        )}
        </div>
      )}

      </div>
      <form className="mt-0 flex shrink-0 translate-y-1.5 gap-2" onSubmit={(event) => { event.preventDefault(); void sendQuestion(input) }}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} rows={1} placeholder="输入你的疑问" className="h-10 min-w-0 flex-1 resize-none rounded-full border border-[#20CDB6]/25 bg-white px-4 py-2 text-base leading-tight text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10 disabled:bg-slate-50" />
        <button type="submit" disabled={loading || !input.trim()} className="h-10 shrink-0 rounded-full bg-[#20CDB6] px-5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(32,205,182,0.30)] transition hover:bg-[#19b8a4] disabled:opacity-40">
          发送
        </button>
      </form>
      <style jsx>{`
        @keyframes followup-ai-reposition {
          from { opacity: 0.35; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .followup-ai-reposition { animation: followup-ai-reposition 260ms cubic-bezier(.2,.8,.2,1); }
        .followup-scroll-area {
          scrollbar-width: thin;
          scrollbar-color: #56C6BB transparent;
          scrollbar-gutter: stable;
        }
        .followup-scroll-area::-webkit-scrollbar { width: 8px; }
        .followup-scroll-area::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 999px;
        }
        .followup-scroll-area::-webkit-scrollbar-thumb {
          background: #56C6BB;
          background-clip: padding-box;
          border: 2px solid transparent;
          border-radius: 999px;
        }
      `}</style>
    </div>
  )
}

export default function SingleResultPage({ data, topic, onBack, onVerifyClaim, onReverifyClaim }: SingleResultPageProps) {
  const initialStates = () => data.claims.map<VerifyState>(() => ({ status: 'pending' }))
  const [verifyStates, setVerifyStates] = useState<VerifyState[]>(initialStates)
  const [freshVerifyStates, setFreshVerifyStates] = useState<VerifyState[]>(initialStates)
  const [cardIndex, setCardIndex] = useState(0)
  const [drawer, setDrawer] = useState<DrawerData | null>(null)
  const [visualImage, setVisualImage] = useState<VisualImage | null>(null)
  const [dragDir, setDragDir] = useState<-1 | 1 | null>(null)
  const [singleActions, setSingleActions] = useState<SingleActionAdvice[]>([])
  const [actionsLoading, setActionsLoading] = useState(false)
  const [actionsRequested, setActionsRequested] = useState(false)
  const [actionsError, setActionsError] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState<SharePreviewStatus>('idle')
  const [shareBlob, setShareBlob] = useState<Blob | null>(null)
  const [shareError, setShareError] = useState('')
  const [sharePayload, setSharePayload] = useState<ShareSummaryRequest | null>(null)
  const [diagnosticIndex, setDiagnosticIndex] = useState<number | null>(null)
  const [diagnosticExitDirection, setDiagnosticExitDirection] = useState<-1 | 1 | null>(null)
  // 打开诊断时该说法是否还在实时核验：只有实时核验才逐字揭示结论；已核验的静态直出。
  const [diagnosticLiveReveal, setDiagnosticLiveReveal] = useState(false)
  // Option B：后台已核验，但说法全景默认显示「尚未核验」；用户点开看过实时过程的说法才亮结论。
  const [revealedClaims, setRevealedClaims] = useState<boolean[]>(() => data.claims.map(() => false))
  const diagOverlayRef = useRef<HTMLDivElement | null>(null)
  const diagStartXRef = useRef(0)
  const diagStartYRef = useRef(0)
  const diagMoveXRef = useRef(0)
  const diagAxisLockRef = useRef<'x' | 'y' | null>(null)
  const diagDraggingRef = useRef(false)
  const diagAnimatingRef = useRef(false)
  const diagnosticExitTimerRef = useRef<number | null>(null)
  const overviewScrollRef = useRef<HTMLDivElement | null>(null)
  const overviewScrollTopRef = useRef(0)

  const mountedRef = useRef(false)
  const statesRef = useRef<VerifyState[]>(initialStates())
  const freshStatesRef = useRef<VerifyState[]>(initialStates())
  const freshRunPromisesRef = useRef<Map<number, Promise<VerifyResult>>>(new Map())
  const freshPromotedRef = useRef<boolean[]>(data.claims.map(() => false))
  const singleActionsRef = useRef<SingleActionAdvice[]>([])
  const actionsRefreshPromiseRef = useRef<Promise<SingleActionAdvice[]> | null>(null)
  const derivedRefreshNeededRef = useRef(false)
  const frontRef = useRef<HTMLDivElement | null>(null)
  const behindRef = useRef<HTMLDivElement | null>(null)
  const dragDirRef = useRef<-1 | 1 | null>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const moveXRef = useRef(0)
  const axisLockRef = useRef<'x' | 'y' | null>(null)
  const draggingRef = useRef(false)
  const animatingRef = useRef(false)

  const cards: CardDescriptor[] = [
    { kind: 'profile' },
    { kind: 'overview' },
    { kind: 'summary' },
    { kind: 'actions' },
    { kind: 'followup' },
  ]
  const totalCards = cards.length
  const behindCard = dragDir === 1 ? cards[cardIndex - 1] : cards[cardIndex + 1]
  const shareReady = verifyStates.some((state) => state.status === 'done' && state.result)

  async function generateSharePoster() {
    setShareOpen(true)
    setShareStatus('generating')
    setShareError('')
    try {
      await Promise.allSettled([...freshRunPromisesRef.current.values()])
      if (actionsRefreshPromiseRef.current) await actionsRefreshPromiseRef.current
      if (derivedRefreshNeededRef.current || singleActionsRef.current.length === 0) {
        await queueActionRefresh(statesRef.current, true)
      }
      const source: ShareSourceData = {
        reference: data.reference,
        topic: topic || data.topic,
        keyframes: data.keyframes,
        // Claim 是从视频转写中逐条抽取的，video_refs 是后端给出的原视频定位。
        // 这里显式补成分享模块的数据边界，不从模型另造“原话”或时间戳。
        claims: data.claims.map((claim) => ({
          claim: claim.claim,
          source_quote: claim.claim,
          source_kind: 'transcript',
          source_ids: (claim.video_refs || []).map((ref) => `video-${ref.id}`),
          source_time: claim.video_refs?.[0]?.time || '',
        })),
      }
      const payload = buildShareRequest(source, statesRef.current, singleActionsRef.current)
      if (payload.claims.length === 0) throw new Error('没有带视频原文定位的已核验说法，暂时无法生成分享图。')
      const posterData = buildPosterData(buildFallbackShareSummary(payload))
      const response = await fetch('/api/share-poster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(posterData),
      })
      if (!response.ok) throw new Error('分享长图生成失败，请稍后重试。')
      const blob = await response.blob()
      if (!blob.type.includes('image/png') || blob.size === 0) throw new Error('分享长图内容异常，请重试。')
      setSharePayload(payload)
      setShareBlob(blob)
      setShareStatus('ready')
    } catch (error) {
      setShareBlob(null)
      setSharePayload(null)
      setShareError(error instanceof Error ? error.message : '分享长图生成失败，请重试。')
      setShareStatus('error')
    }
  }

  function openSharePoster() {
    if (shareBlob) {
      setShareOpen(true)
      setShareStatus('ready')
      return
    }
    void generateSharePoster()
  }

  function updateVerifyState(index: number, next: VerifyState) {
    statesRef.current = statesRef.current.map((state, stateIndex) => stateIndex === index ? next : state)
    if (mountedRef.current) setVerifyStates(statesRef.current)
  }

  function updateFreshVerifyState(index: number, next: VerifyState) {
    freshStatesRef.current = freshStatesRef.current.map((state, stateIndex) => stateIndex === index ? next : state)
    if (mountedRef.current) setFreshVerifyStates(freshStatesRef.current)
  }

  function promoteFreshResult(index: number, result: VerifyResult, streamSteps: ReasoningStep[]) {
    freshPromotedRef.current[index] = true
    updateFreshVerifyState(index, { status: 'done', result, streamSteps })
    const nextStates = statesRef.current.map((state, stateIndex) => stateIndex === index
      ? { status: 'done' as const, result, streamSteps }
      : state)
    statesRef.current = nextStates
    if (mountedRef.current) setVerifyStates(nextStates)
    setRevealedClaims((previous) => previous.map((value, claimIndex) => claimIndex === index ? true : value))
    derivedRefreshNeededRef.current = true
    setShareBlob(null)
    setSharePayload(null)
    setShareStatus('idle')
    setShareError('')
    void queueActionRefresh(nextStates, true).catch(() => undefined)
  }

  function runFreshClaim(index: number): Promise<VerifyResult> {
    const existing = freshRunPromisesRef.current.get(index)
    if (existing) return existing
    const claim = data.claims[index]
    if (!claim) return Promise.reject(new Error('观点不存在'))

    // 从点击起就让旧海报失效；分享若在核验中触发，会进入等待态而不是展示旧图。
    setShareBlob(null)
    setSharePayload(null)
    setShareStatus('idle')
    setShareError('')
    updateFreshVerifyState(index, { status: 'loading', streamSteps: [] })
    const request = onReverifyClaim(claim, index, (step) => {
      const current = freshStatesRef.current[index] || { status: 'loading', streamSteps: [] }
      updateFreshVerifyState(index, {
        ...current,
        status: 'loading',
        streamSteps: mergeTraceStep(current.streamSteps || [], step),
      })
    }).then((result) => {
      const steps = freshStatesRef.current[index]?.streamSteps || []
      promoteFreshResult(index, result, steps)
      return result
    }).catch((error) => {
      const current = freshStatesRef.current[index]
      updateFreshVerifyState(index, { ...current, status: 'error' })
      throw error
    }).finally(() => {
      freshRunPromisesRef.current.delete(index)
    })
    freshRunPromisesRef.current.set(index, request)
    return request
  }

  function runClaim(index: number) {
    const claim = data.claims[index]
    if (!claim || !mountedRef.current || statesRef.current[index]?.status === 'loading' || statesRef.current[index]?.status === 'done') return
    updateVerifyState(index, { status: 'loading', streamSteps: [] })
    void Promise.resolve(onVerifyClaim(claim, index, (step) => {
      if (freshPromotedRef.current[index]) return
      const current = statesRef.current[index]
      updateVerifyState(index, { ...current, status: 'loading', streamSteps: [...(current.streamSteps || []), step] })
    }, (result) => {
      if (freshPromotedRef.current[index]) return
      const current = statesRef.current[index]
      updateVerifyState(index, { ...current, status: 'done', result })
    }))
      .then((result) => {
        if (freshPromotedRef.current[index]) return
        const current = statesRef.current[index]
        updateVerifyState(index, { ...current, status: 'done', result })
      })
      .catch(() => { if (!freshPromotedRef.current[index]) updateVerifyState(index, { status: 'error' }) })
      .finally(() => undefined)
  }

  useEffect(() => {
    mountedRef.current = true
    // 进页即自动核验全部说法：避坑总结/行动建议无需用户逐条点选就能呈现完整内容。
    // 样例数据走预置结果瞬时返回；真实链接会一次触发全部核验。
    data.claims.forEach((_, index) => {
      if (statesRef.current[index]?.status === 'pending') runClaim(index)
    })
    return () => {
      mountedRef.current = false
      if (diagnosticExitTimerRef.current !== null) window.clearTimeout(diagnosticExitTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function retryClaim(index: number) {
    if (statesRef.current[index]?.status !== 'error') return
    updateVerifyState(index, { status: 'pending' })
    runClaim(index)
  }

  // 用户在行动建议/避坑总结里主动选择「核验全部」时用。按需核验仍是默认，
  // 这只是把「被迫核验」变成「一键自愿」——健康建议必须有据，前提不放宽。
  function verifyAllClaims() {
    data.claims.forEach((_, index) => {
      const status = statesRef.current[index]?.status
      if (status === 'pending' || status === 'error') runClaim(index)
    })
  }

  function goToCard(nextIndex: number) {
    const boundedIndex = Math.max(0, Math.min(totalCards - 1, nextIndex))
    if (boundedIndex === cardIndex) return
    setCardIndex(boundedIndex)
  }

  function openClaimFromOverview(claimIndex: number) {
    overviewScrollTopRef.current = overviewScrollRef.current?.scrollTop || 0
    // 首次打开真实重跑流式核验；成功后该观点改为静态直出最新结果。
    const shouldRunFresh = !revealedClaims[claimIndex]
    setDiagnosticLiveReveal(shouldRunFresh)
    setDiagnosticExitDirection(null)
    diagDraggingRef.current = false
    diagAnimatingRef.current = false
    diagMoveXRef.current = 0
    diagAxisLockRef.current = null
    setDiagnosticIndex(claimIndex)
    if (shouldRunFresh) void runFreshClaim(claimIndex).catch(() => undefined)
  }

  function closeDiagnostic(direction: -1 | 1 = 1) {
    if (diagnosticIndex === null || diagAnimatingRef.current) return
    diagAnimatingRef.current = true
    diagDraggingRef.current = false
    diagMoveXRef.current = 0
    diagAxisLockRef.current = null
    setDiagnosticExitDirection(direction)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const overlay = diagOverlayRef.current
    if (overlay) {
      const width = Math.max(overlay.getBoundingClientRect().width, window.innerWidth)
      overlay.style.transition = reducedMotion ? 'none' : 'transform 220ms ease-out, opacity 220ms ease-out'
      // 甩出时倾斜飞出，和主卡 fling 同款（rotate ±9deg）
      overlay.style.transform = `translateX(${direction * width * 1.06}px) rotate(${direction * 9}deg)`
      overlay.style.opacity = '0'
    }
    if (diagnosticExitTimerRef.current !== null) window.clearTimeout(diagnosticExitTimerRef.current)
    diagnosticExitTimerRef.current = window.setTimeout(() => {
      setDiagnosticIndex(null)
      setDiagnosticExitDirection(null)
      diagAnimatingRef.current = false
      diagnosticExitTimerRef.current = null
      window.requestAnimationFrame(() => { if (overviewScrollRef.current) overviewScrollRef.current.scrollTop = overviewScrollTopRef.current })
    }, reducedMotion ? 0 : 220)
  }

  function springDiagnosticBack() {
    if (!diagDraggingRef.current || diagAnimatingRef.current) return
    const overlay = diagOverlayRef.current
    if (overlay) {
      overlay.style.transition = 'transform 260ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease-out'
      overlay.style.transform = 'translateX(0px) rotate(0deg)'
      overlay.style.opacity = '1'
    }
    diagDraggingRef.current = false
    diagMoveXRef.current = 0
    diagAxisLockRef.current = null
  }

  function handleDiagnosticPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (diagAnimatingRef.current || isInteractiveTarget(event.target)) return
    diagStartXRef.current = event.clientX
    diagStartYRef.current = event.clientY
    diagMoveXRef.current = 0
    diagAxisLockRef.current = null
    diagDraggingRef.current = true
    if (diagOverlayRef.current) diagOverlayRef.current.style.transition = 'none'
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handleDiagnosticPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!diagDraggingRef.current || diagAnimatingRef.current) return
    const x = event.clientX - diagStartXRef.current
    const y = event.clientY - diagStartYRef.current
    if (diagAxisLockRef.current === null && (Math.abs(x) > 6 || Math.abs(y) > 6)) {
      diagAxisLockRef.current = Math.abs(x) > Math.abs(y) ? 'x' : 'y'
    }
    if (diagAxisLockRef.current !== 'x') return
    diagMoveXRef.current = x
    const overlay = diagOverlayRef.current
    if (overlay) {
      const width = Math.max(overlay.getBoundingClientRect().width, 1)
      // 跟手时轻微倾斜，和主卡拖拽同款手感
      overlay.style.transform = `translateX(${x}px) rotate(${x * 0.018}deg)`
      overlay.style.opacity = String(Math.max(0.72, 1 - Math.abs(x) / (width * 1.8)))
    }
  }

  function handleDiagnosticPointerUp() {
    if (!diagDraggingRef.current) return
    if (diagAxisLockRef.current === 'x' && Math.abs(diagMoveXRef.current) >= 70) {
      closeDiagnostic(diagMoveXRef.current > 0 ? 1 : -1)
      return
    }
    springDiagnosticBack()
  }

  function queueActionRefresh(statesSnapshot: VerifyState[] = statesRef.current, force = false): Promise<SingleActionAdvice[]> {
    const existing = actionsRefreshPromiseRef.current
    if (!force && existing) return existing
    if (!force && actionsRequested && !derivedRefreshNeededRef.current) return Promise.resolve(singleActionsRef.current)

    const verifiedClaims = data.claims.flatMap((claim, index) => {
      const result = statesSnapshot[index]?.result
      if (!result || statesSnapshot[index]?.status !== 'done') return []
      return [{
        claim_index: index,
        claim: claim.claim,
        verdict: result.verdict,
        risk_level: result.risk_level,
        correction: result.correction,
        cited_evidence_ids: result.cited_evidence_ids || [],
        video_refs: claim.video_refs || [],
      }]
    })
    if (verifiedClaims.length === 0) return Promise.resolve(singleActionsRef.current)

    setActionsLoading(true)
    setActionsRequested(true)
    setActionsError(false)
    const waitForPrevious = existing ? existing.catch(() => singleActionsRef.current) : Promise.resolve(singleActionsRef.current)
    const task = waitForPrevious.then(async () => {
      const result = await buildSingleActions({ reference: data.reference, topic: topic || data.topic, claims: verifiedClaims })
      const nextActions = Array.isArray(result.actions) ? result.actions : []
      if (actionsRefreshPromiseRef.current === task) {
        singleActionsRef.current = nextActions
        setSingleActions(nextActions)
        derivedRefreshNeededRef.current = false
      }
      return nextActions
    }).catch((error) => {
      setActionsError(true)
      throw error
    }).finally(() => {
      if (actionsRefreshPromiseRef.current === task) {
        actionsRefreshPromiseRef.current = null
        setActionsLoading(false)
      }
    })
    actionsRefreshPromiseRef.current = task
    return task
  }

  async function generateActions() {
    try {
      await queueActionRefresh(statesRef.current, actionsError)
    } catch {
      // 后端超时/失败：旧行动建议继续保留，卡片显示可点的「重试」。
    }
  }

  // 提前生成：后台核验一settled就开始生成行动建议，不等用户翻到第4张卡才触发，
  // 这样翻到时大概率已经好了，减少「正在生成…」的等待。
  useEffect(() => {
    const settled = verifyStates.length > 0 && verifyStates.every((s) => s.status === 'done' || s.status === 'error')
    const anyDone = verifyStates.some((s) => s.status === 'done' && s.result)
    if (settled && anyDone && !actionsRequested && !actionsLoading && singleActions.length === 0) {
      void generateActions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyStates, actionsRequested, actionsLoading, singleActions.length])

  const BEHIND_BASE = 'scale(0.94) translateY(12px)'

  function setBehindDirection(direction: -1 | 1 | null) {
    if (dragDirRef.current === direction) return
    dragDirRef.current = direction
    setDragDir(direction)
  }

  useLayoutEffect(() => {
    if (frontRef.current) {
      frontRef.current.style.transition = 'none'
      frontRef.current.style.transform = 'translateX(0px) rotate(0deg)'
      frontRef.current.style.opacity = '1'
    }
    if (behindRef.current) {
      behindRef.current.style.transition = 'none'
      behindRef.current.style.transform = BEHIND_BASE
    }
    draggingRef.current = false
    moveXRef.current = 0
    axisLockRef.current = null
    setBehindDirection(null)
  }, [cardIndex])

  function setFront(x: number) {
    if (frontRef.current) frontRef.current.style.transform = `translateX(${x}px) rotate(${x * 0.02}deg)`
    if (behindRef.current) {
      const progress = Math.min(Math.abs(x) / 240, 1)
      behindRef.current.style.transform = `scale(${0.94 + 0.06 * progress}) translateY(${12 * (1 - progress)}px)`
    }
  }

  function springBack() {
    if (!draggingRef.current && !animatingRef.current) return
    if (frontRef.current) {
      frontRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22,1,0.36,1)'
      frontRef.current.style.transform = 'translateX(0px) rotate(0deg)'
    }
    if (behindRef.current) {
      behindRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22,1,0.36,1)'
      behindRef.current.style.transform = BEHIND_BASE
    }
    draggingRef.current = false
    moveXRef.current = 0
    axisLockRef.current = null
    window.setTimeout(() => setBehindDirection(null), 280)
  }

  function flyOff(direction: -1 | 1) {
    if (animatingRef.current) return
    animatingRef.current = true
    const width = typeof window !== 'undefined' ? window.innerWidth : 480
    if (frontRef.current) {
      frontRef.current.style.transition = 'transform 0.24s ease-out, opacity 0.24s ease-out'
      frontRef.current.style.transform = `translateX(${direction * width * 1.1}px) rotate(${direction * 10}deg)`
      frontRef.current.style.opacity = '0'
    }
    if (behindRef.current) {
      behindRef.current.style.transition = 'transform 0.24s ease-out'
      behindRef.current.style.transform = 'scale(1) translateY(0px)'
    }
    window.setTimeout(() => {
      setCardIndex((current) => direction < 0 ? Math.min(current + 1, totalCards - 1) : Math.max(current - 1, 0))
      draggingRef.current = false
      moveXRef.current = 0
      axisLockRef.current = null
      setBehindDirection(null)
      animatingRef.current = false
    }, 230)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (animatingRef.current || isInteractiveTarget(event.target)) return
    startXRef.current = event.clientX
    startYRef.current = event.clientY
    moveXRef.current = 0
    axisLockRef.current = null
    draggingRef.current = true
    setBehindDirection(null)
    if (frontRef.current) frontRef.current.style.transition = 'none'
    if (behindRef.current) behindRef.current.style.transition = 'none'
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || event.buttons === 0 || animatingRef.current) return
    const x = event.clientX - startXRef.current
    const y = event.clientY - startYRef.current
    if (axisLockRef.current === null && (Math.abs(x) > 6 || Math.abs(y) > 6)) axisLockRef.current = Math.abs(x) > Math.abs(y) ? 'x' : 'y'
    if (axisLockRef.current !== 'x') return
    moveXRef.current = x
    if (x < -4 && cardIndex < totalCards - 1) setBehindDirection(-1)
    else if (x > 4 && cardIndex > 0) setBehindDirection(1)
    else setBehindDirection(null)
    setFront(x)
  }

  function handlePointerUp() {
    if (!draggingRef.current) return
    const threshold = 70
    if (axisLockRef.current === 'x' && moveXRef.current <= -threshold && cardIndex < totalCards - 1) return flyOff(-1)
    if (axisLockRef.current === 'x' && moveXRef.current >= threshold && cardIndex > 0) return flyOff(1)
    springBack()
  }

  function renderCard(card: CardDescriptor, displayIndex: number) {
    const label = card.kind === 'profile'
      ? '视频档案'
      : card.kind === 'overview'
        ? '说法全景'
        : card.kind === 'actions'
            ? '行动建议'
            : card.kind === 'summary'
              ? '避坑总结'
              : 'AI 答疑'
    return (
      <CourtCardShell
        label={label}
        index={displayIndex + 1}
        subtitle={card.kind === 'profile' ? '来自抖音的单条视频' : card.kind === 'overview' ? '点击你感兴趣的观点进行核验' : undefined}
        contentScrollable={card.kind !== 'followup'}
        visualVariant="dual"
      >
        {card.kind === 'profile' && <ProfileCard data={data} onOpenOverview={() => goToCard(1)} />}
        {card.kind === 'overview' && <div ref={overviewScrollRef} className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><OverviewCard data={data} states={verifyStates} revealed={revealedClaims} onOpenClaim={openClaimFromOverview} /></div>}
        {card.kind === 'actions' && <ActionAdviceCard actions={singleActions} claims={data.claims} states={verifyStates} loading={actionsLoading} requested={actionsRequested} error={actionsError} onGenerate={() => void generateActions()} onVerifyAll={verifyAllClaims} onEvidence={(evidence) => setDrawer({ evidence })} />}
        {card.kind === 'summary' && <SummaryCard claims={data.claims} states={verifyStates} actions={singleActions} actionsLoading={actionsLoading} shareReady={shareReady} shareBusy={shareStatus === 'generating'} onShare={openSharePoster} />}
        {card.kind === 'followup' && <FollowupCard data={data} topic={topic} claims={data.claims} states={verifyStates} />}
      </CourtCardShell>
    )
  }

  return (
    <main className="fitproof-particle-field relative flex h-[calc(100dvh-54px)] flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(32,205,182,0.18),transparent_42%),linear-gradient(180deg,#f7fffd_0%,#eef8f6_100%)] text-slate-950">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <VerifyTopBar
          topic={topic || data.topic || '单视频核验'}
          page={cardIndex + 1}
          total={totalCards}
          onBack={onBack}
          rightAction={shareReady ? (
            <button
              type="button"
              onClick={openSharePoster}
              disabled={shareStatus === 'generating'}
              aria-label="分享这份核验，生成 9:16 长图"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/75 px-3 text-sm font-medium text-[#128f80] shadow-sm backdrop-blur transition hover:bg-[#20CDB6] hover:text-white disabled:opacity-50"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 10.8 16 6.2M8 13.2l8 4.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" /><circle cx="18" cy="5" r="2.9" /><circle cx="6" cy="12" r="2.9" /><circle cx="18" cy="19" r="2.9" /></svg>
              {shareStatus === 'generating' ? '生成中' : '分享'}
            </button>
          ) : undefined}
        />

        <div className="relative z-10 min-h-0 flex-1 overflow-hidden px-5 py-0">
          {behindCard && (
            <div ref={behindRef} className="absolute inset-x-5 inset-y-0 opacity-75 will-change-transform" style={{ transform: BEHIND_BASE }}>
              {renderCard(behindCard, dragDir === 1 ? cardIndex - 1 : cardIndex + 1)}
            </div>
          )}
          <div
            ref={frontRef}
            className="absolute inset-x-5 inset-y-0 cursor-grab touch-pan-y will-change-transform active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={springBack}
          >
            {renderCard(cards[cardIndex], cardIndex)}
          </div>
        </div>

        <CardPager count={totalCards} activeIndex={cardIndex} labels={cards.map((card) => card.kind)} onSelect={setCardIndex} />
      </div>

      <style jsx>{`
        @keyframes card-slide-from-right {
          from { opacity: 0.45; transform: translateX(28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes card-slide-from-left {
          from { opacity: 0.45; transform: translateX(-28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .card-slide-from-right { animation: card-slide-from-right 220ms ease-out; }
        .card-slide-from-left { animation: card-slide-from-left 220ms ease-out; }
      `}</style>

      <SharePosterPreview
        open={shareOpen}
        status={shareStatus}
        imageBlob={shareBlob}
        filename={posterFilename(topic || data.topic || data.reference.title)}
        error={shareError}
        onRetry={() => void generateSharePoster()}
        onClose={() => setShareOpen(false)}
        onContribute={async () => {
          if (!sharePayload) throw new Error('分享数据尚未生成')
          return submitShareContributions(sharePayload)
        }}
      />

      {drawer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5 animate-fadeIn" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/45" />
          <div onClick={(event) => event.stopPropagation()} className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <p className="text-[16px] font-black tracking-wide text-slate-900">参考文献（{drawer.evidence.length}）</p>
              <button type="button" onClick={() => setDrawer(null)} aria-label="关闭" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg></button>
            </div>
            <div className="fitproof-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-2">
              {drawer.evidence.map((evidence) => {
                const documentType = evidence.strength || evidence.evidence_tier || '参考文献'
                return (
                  <a
                    key={evidence.id}
                    href={evidence.url || undefined}
                    target={evidence.url ? '_blank' : undefined}
                    rel={evidence.url ? 'noreferrer' : undefined}
                    onClick={(event) => { if (!evidence.url) event.preventDefault() }}
                    className="flex items-center gap-3 rounded-[12px] border border-[#DDE9ED] bg-white px-3 py-2.5 shadow-[0_3px_10px_rgba(11,110,99,0.035)] transition active:scale-[0.99]"
                    aria-label={`查看文献：${evidence.source_doc}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#ECFBF8] text-[#14B9AA]">
                      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M6.2 2.8h7.1l4.5 4.6v12.2c0 .9-.7 1.6-1.6 1.6H6.2c-.9 0-1.6-.7-1.6-1.6V4.4c0-.9.7-1.6 1.6-1.6Z" strokeLinejoin="round" />
                        <path d="M13.2 2.9v4.6h4.5M8.1 12h7.8M8.1 15.5h5.6M8.1 8.6h2.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold leading-5 text-slate-900">{evidence.source_doc}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] leading-4 text-slate-500">
                        <span className="rounded-md bg-slate-50 px-1.5 py-0.5">{evidence.org || '来源机构未标注'}</span>
                        <span className="rounded-md bg-slate-50 px-1.5 py-0.5">{evidence.year || '年份未标注'}</span>
                        <span className="rounded-md bg-slate-50 px-1.5 py-0.5">{evidence.page ? `P.${evidence.page}` : '页码未标注'}</span>
                        <span className="rounded-md bg-[#EAF9F6] px-1.5 py-0.5 font-semibold text-[#078C7E]">{documentType}</span>
                      </span>
                      <span className="mt-1.5 block truncate rounded-md bg-[#F5F7F9] px-2 py-1 text-[10px] leading-4 text-slate-600">证据摘要：{evidence.claim}</span>
                    </span>
                    <svg className="h-5 w-5 shrink-0 text-[#7183A4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </a>
                )
              })}
            </div>
            </div>
          </div>
        </div>
      )}

      {visualImage && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" onClick={() => setVisualImage(null)}>
          <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <div className="relative overflow-hidden rounded-2xl bg-white p-3 shadow-2xl">
              <button type="button" onClick={() => setVisualImage(null)} className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-xl leading-none text-white" aria-label="关闭大图">×</button>
              <img src={visualImage.image} alt="放大的视频关键帧" className="max-h-[70vh] w-full rounded-xl object-contain" />
              <div className="px-1 pb-1 pt-3">
                <p className="text-xs font-semibold text-[#0B6E63]">画面 {formatFrameTime(visualImage.time)}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{visualImage.screenText}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {diagnosticIndex !== null && data.claims[diagnosticIndex] && (
        <div
          data-diagnostic-overlay
          className="fitproof-particle-field fixed inset-0 z-[55] animate-fadeIn overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(32,205,182,0.18),transparent_42%),linear-gradient(180deg,#f7fffd_0%,#eef8f6_100%)]"
        >
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
            {/* 顶栏与提示固定不动，只有下方的卡片会被拖拽/倾斜/滑出 */}
            <VerifyTopBar topic={`观点 ${diagnosticIndex + 1} 诊断报告`} page={0} total={0} hideProgress onBack={() => closeDiagnostic(1)} />
            <p className="shrink-0 px-5 pb-1 text-center text-[11px] text-[#8AA0A0]">左右滑动 或 点左上角「返回」可退出报告</p>
            <div
              ref={diagOverlayRef}
              data-exit-direction={diagnosticExitDirection || undefined}
              className="min-h-0 flex-1 touch-pan-y px-5 pb-4 transform-gpu will-change-transform motion-reduce:transition-none"
              onPointerDown={handleDiagnosticPointerDown}
              onPointerMove={handleDiagnosticPointerMove}
              onPointerUp={handleDiagnosticPointerUp}
              onPointerCancel={springDiagnosticBack}
            >
              <CourtCardShell label={`观点 ${diagnosticIndex + 1} 诊断报告`} index={diagnosticIndex + 1} hideHeader contentScrollable visualVariant="dual">
            <ConfrontationCard
              claim={data.claims[diagnosticIndex]}
              claimCount={data.claims.length}
              claimIndex={diagnosticIndex}
              videoUrl={data.reference.url}
              state={(diagnosticLiveReveal ? freshVerifyStates[diagnosticIndex] : verifyStates[diagnosticIndex]) || { status: 'pending' }}
              keyframes={data.keyframes}
              onRetry={() => diagnosticLiveReveal
                ? void runFreshClaim(diagnosticIndex).catch(() => undefined)
                : retryClaim(diagnosticIndex)}
              onEvidence={(evidence) => setDrawer({ evidence })}
              onOpenImage={(frame) => frame.image && setVisualImage({ image: frame.image, screenText: frame.screen_text, time: frame.time })}
              animate={diagnosticLiveReveal}
            />
              </CourtCardShell>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
