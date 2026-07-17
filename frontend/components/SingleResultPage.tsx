'use client'

import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Claim, EvidenceEntry, Keyframe, SingleAnalyzeResponse, VerifyResult } from '@/types'
import { citedEvidence, isEvidenceDowngraded } from '@/lib/single'
import { followupSingle } from '@/lib/api'
import CourtCardShell from '@/components/CourtCardShell'
import FitProofCat from '@/components/FitProofCat'

interface SingleResultPageProps {
  data: SingleAnalyzeResponse
  topic: string
  onBack: () => void
  onVerifyClaim: (claim: Claim, index: number) => Promise<VerifyResult>
}

type VerifyStatus = 'pending' | 'loading' | 'done' | 'error'

interface VerifyState {
  status: VerifyStatus
  result?: VerifyResult
}

type CardDescriptor =
  | { kind: 'profile' }
  | { kind: 'overview' }
  | { kind: 'confrontation'; claimIndex: number }
  | { kind: 'summary' }
  | { kind: 'followup' }

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
  'general',
])

/** 说法语义配图。双重兜底：字段缺失/不在白名单 → general；图片 404 → general。 */
function ClaimIcon({ icon, className }: { icon?: string; className?: string }) {
  const initial = icon && CLAIM_ICON_SET.has(icon) ? icon : 'general'
  const [src, setSrc] = useState(initial)
  useEffect(() => { setSrc(initial) }, [initial])
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#D8F1EC] bg-[#EEF9F6] ${className || ''}`}>
      <img
        src={`/claim-icons/${src}.webp`}
        alt=""
        aria-hidden="true"
        className="h-[76%] w-[76%] object-contain"
        onError={() => { if (src !== 'general') setSrc('general') }}
      />
    </span>
  )
}

const SIGNAL_STYLES = {
  common: 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]',
  exaggerated: 'border-amber-200 bg-amber-50 text-amber-700',
  conditional: 'border-slate-200 bg-slate-50 text-slate-600',
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

function verdictStampClass(result: VerifyResult) {
  if (result.risk_level.includes('高') || result.verdict.includes('不建议')) return 'border-[#A32D2D] text-[#A32D2D]'
  if (result.risk_level.includes('中') || result.verdict.includes('条件')) return 'border-[#854F0B] text-[#854F0B]'
  return 'border-[#0B6E63] text-[#0B6E63]'
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

/**
 * 核验结果印章。章面文字直接盖模型输出的 verdict 原文（「证据不足」就盖「证据不足」），
 * 不做「建议采纳/不建议采纳」的二值映射 —— verdict 是自由文本（提示词写的是
 * 「可信/基本可信/需加条件/证据不足/不建议采纳 等」），二值化会把「证据不足」
 * 盖成「建议采纳」，与卡片上并排显示的原文自相矛盾，也违反「判定由模型输出」的铁律。
 */
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
      viewBox="0 0 100 100"
      className="fitproof-stamp pointer-events-none h-[68px] w-[68px] shrink-0 opacity-[0.82]"
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
    <span className="inline-flex h-4 items-end gap-1" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#20CDB6]"
          style={{ animationDelay: `${dot * 140}ms` }}
        />
      ))}
    </span>
  )
}

function ShieldAvatar() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E1F5EE] text-[#0B6E63]">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.7 2.9 8.1 7 10 4.1-1.9 7-5.3 7-10V6l-7-3Z" />
        <path d="m8.7 12 2.1 2.1 4.6-4.6" />
      </svg>
    </span>
  )
}

function VideoSourceAvatar() {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="video-speaking-ring flex h-12 w-12 items-center justify-center rounded-full border border-[#EDB96F]/65 p-[2px]">
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#FFF7EA] text-[#C87518]">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="12" cy="8" r="3.3" />
            <path d="M5.5 20c.8-3.6 3.1-5.5 6.5-5.5s5.7 1.9 6.5 5.5" strokeLinecap="round" />
          </svg>
        </span>
      </span>
      <span className="whitespace-nowrap text-[10px] font-semibold text-[#D97706]">视频里说</span>
    </div>
  )
}

function EvidenceSourceAvatar() {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="evidence-speaking-ring flex h-12 w-12 items-center justify-center rounded-full border border-[#75D3C8]/65 p-[2px]">
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#EAF9F6] text-[#078C7E]">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 3 5.5 6v5c0 4.5 2.8 7.8 6.5 9.5 3.7-1.7 6.5-5 6.5-9.5V6L12 3Z" />
            <path d="m8.7 12 2.1 2.1 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      <span className="whitespace-nowrap text-[10px] font-semibold text-[#078C7E]">数据库依据</span>
    </div>
  )
}

function ProfileCard({ data, onOpenClaim }: { data: SingleAnalyzeResponse; onOpenClaim: (index: number) => void }) {
  // 说明：这里读的是快模型拆主张时的初步归类 claim.signal，不是核验结论。
  // 核验结论在 verifyStates 里，属于卡02及以后 —— 故此处一律用中性分类图标与措辞。
  const groups = [
    {
      key: '较公认',
      label: '较公认',
      row: 'border-[#20CDB6]/25 bg-[#20CDB6]/[0.08] text-[#0B6E63]',
      icon: (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#20CDB6]" aria-hidden="true">
          <svg className="h-3 w-3 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.8">
            <path d="m3.6 8.2 2.7 2.7 6.1-6.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ),
    },
    {
      key: '疑似夸大',
      label: '疑似夸大',
      row: 'border-amber-300/60 bg-amber-50 text-amber-700',
      icon: (
        <svg className="h-5 w-5 shrink-0" viewBox="2 2 20 18" aria-hidden="true">
          <path d="M10.5 3.7a1.75 1.75 0 0 1 3 0l7.05 12.2A1.75 1.75 0 0 1 19.03 18.5H4.97a1.75 1.75 0 0 1-1.52-2.6L10.5 3.7Z" fill="#FFB84D" />
          <path d="M12 8.1v4.55M12 15.45v.12" stroke="white" strokeWidth="2.7" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: '有条件/有争议',
      label: '有条件/有争议',
      row: 'border-slate-300/60 bg-slate-100 text-slate-600',
      icon: (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#64748B]" aria-hidden="true">
          <svg className="h-3 w-3 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5.4 5.55a2.7 2.7 0 1 1 4.05 2.34c-.9.48-1.45 1.04-1.45 2.11" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 12.7v.1" strokeLinecap="round" />
          </svg>
        </span>
      ),
    },
  ]
  const stats = groups
    .map((group) => {
      const matched = data.claims
        .map((claim, index) => ({ claim, index }))
        .filter(({ claim }) => (
          group.key === '有条件/有争议'
            ? claim.signal !== '较公认' && claim.signal !== '疑似夸大'
            : claim.signal === group.key
        ))
      return { ...group, count: matched.length, firstIndex: matched[0]?.index ?? -1 }
    })
    .filter((item) => item.count > 0)
  const posterFrame = data.keyframes.find((frame) => typeof frame.image === 'string' && frame.image.length > 0)
  const hasVideoUrl = Boolean(data.reference.url)
  const author = data.reference.author || '作者未标注'
  const rawTitle = data.reference.title || '标题未标注'
  const topicTags = (rawTitle.match(/#\S+/g) || []).map((tag) => tag.slice(1))
  const cleanTitle = rawTitle.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim() || rawTitle
  // 抖音只有一段文案（正文+话题标签混在一起），没有「标题 + 副文案」两个字段。
  // 这里按首个句末标点把同一段原文切成两行显示，纯排版，不增删原文一个字。
  const breakAt = cleanTitle.search(/[！!。？?]/)
  const headline = breakAt >= 0 ? cleanTitle.slice(0, breakAt + 1) : cleanTitle
  const subCopy = breakAt >= 0 ? cleanTitle.slice(breakAt + 1).trim() : ''
  const poster = (
    <div className="relative aspect-[2/1] overflow-hidden rounded-t-[16px] bg-[#E1F5EE]">
      {posterFrame?.image ? (
        <>
          {/* 抖音是 9:16 竖屏，塞进横框只有两条路：裁掉大半(object-cover 会放大 3 倍多)，
              或完整显示但两侧留白。这里用同一帧的模糊放大版当底衬填掉留白，
              前景 object-contain 完整呈现、不裁不放大。 */}
          <img src={posterFrame.image} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl saturate-150" />
          <div className="absolute inset-0 bg-slate-900/15" />
          <img src={posterFrame.image} alt="视频关键帧封面" className="relative h-full w-full object-contain" />
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

        <div className="rounded-b-[16px] border-x border-b border-[#CDEDEA]">
        <div className="px-2.5 pb-3.5 pt-3">
          <h1 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-950">{headline}</h1>
          {subCopy && <p className="mt-0.5 truncate text-[12px] leading-tight text-slate-400">{subCopy}</p>}
          {topicTags.length > 0 && (
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto whitespace-nowrap">
              {topicTags.map((tag, index) => (
                <span key={`${tag}-${index}`} className="shrink-0 rounded-full bg-slate-100/90 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                  <span className="text-slate-600">#</span> {tag}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-start justify-center overflow-hidden rounded-full bg-[#E1F5EE]">
              <FitProofCat pose="thinking" size={55} className="-mt-1" title="FitProof 小猫" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold leading-tight text-slate-700">{author}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-slate-400">视频作者</p>
            </div>
          </div>
        </div>

        <div className="mx-2 border-t border-dashed border-slate-200 pb-2.5 pt-2.5">
          {/* 诚实边界：这三行读的是拆主张阶段的初步归类 claim.signal，不是核验判定。
              核验判定在卡02及以后的 verifyStates 里。 */}
          <p className="flex items-center gap-1 text-[14px] font-bold text-slate-900">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-[#10B9A8]" aria-hidden="true">
              <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.75">
                <path d="M5.25 5.5h9.5M5.25 10h9.5M5.25 14.5h6.2" strokeLinecap="round" />
              </svg>
            </span>
            本视频说法总结
            <svg className="h-5 w-5 shrink-0 text-[#42CFC1]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 0.8c.7 4.9 3.1 7.5 8.2 8.2-5.1.7-7.5 3.1-8.2 8.2C9.3 12.1 6.9 9.7 1.8 9 6.9 8.3 9.3 5.9 10 .8Z" />
            </svg>
          </p>
          {data.claims.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {stats.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onOpenClaim(item.firstIndex)}
                  className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-1 text-left transition hover:brightness-[0.97] ${item.row}`}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
                    <span className="text-[14px] font-bold">{item.count}</span> 条{item.label}
                  </span>
                  <svg className="h-4 w-4 shrink-0 opacity-55" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                    <path d="m5.5 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-500">这条视频没有拆出可核验说法。</p>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

function OverviewCard({ data, onOpenClaim }: { data: SingleAnalyzeResponse; onOpenClaim: (index: number) => void }) {
  const filters = [
    { key: '全部', label: '全部', style: 'border-[#20CDB6] bg-[#F5FCFB] text-[#0B6E63] shadow-[0_6px_16px_rgba(32,205,182,0.12)]', inactive: 'border-[#BEEBE4] bg-white text-[#0B8D7D]' },
    { key: '较公认', label: '较公认', style: 'border-transparent bg-[#EAF9F6] text-[#078C7E]', inactive: 'border-transparent bg-[#F5FCFB] text-[#5A9C94]' },
    { key: '疑似夸大', label: '疑似夸大', style: 'border-transparent bg-[#FFF1E2] text-[#ED7A00]', inactive: 'border-transparent bg-[#FFF8F0] text-[#E58A22]' },
    { key: '有条件/争议', label: '有条件/争议', style: 'border-transparent bg-[#EEF1F8] text-[#62759B]', inactive: 'border-transparent bg-[#F6F7FB] text-[#7D8DA9]' },
  ] as const
  type FilterKey = typeof filters[number]['key']
  const [activeFilter, setActiveFilter] = useState<FilterKey>('全部')
  const claimGroups = (claim: Claim): Exclude<FilterKey, '全部'> => {
    if (claim.signal === '较公认') return '较公认'
    if (claim.signal === '疑似夸大') return '疑似夸大'
    return '有条件/争议'
  }
  const countFor = (key: FilterKey) => key === '全部'
    ? data.claims.length
    : data.claims.filter((claim) => claimGroups(claim) === key).length
  const visibleClaims = data.claims
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => activeFilter === '全部' || claimGroups(claim) === activeFilter)

  return (
    <div className="pb-1">
      {data.claims.length === 0 ? (
        <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">这条视频没有提取到可核验说法。</p>
      ) : (
        <>
          <div className="no-scrollbar mt-1 flex gap-2 overflow-x-auto pb-1">
            {filters.map((filter) => {
              const active = activeFilter === filter.key
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${active ? filter.style : filter.inactive}`}
                >
                  {filter.label} {countFor(filter.key)}
                </button>
              )
            })}
          </div>

          <div className="mt-3 space-y-2.5">
            {visibleClaims.map(({ claim, index }) => (
              <button
                key={`${claim.claim}-${index}`}
                type="button"
                onClick={() => onOpenClaim(index)}
                className="w-full rounded-[18px] bg-white p-3.5 text-left shadow-[0_8px_22px_rgba(26,112,103,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(26,112,103,0.14)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-7 min-w-7 items-center justify-center rounded-[10px] text-[13px] font-bold ${claimGroups(claim) === '较公认' ? 'bg-[#E8F8F5] text-[#078C7E]' : claimGroups(claim) === '疑似夸大' ? 'bg-[#FFF2E2] text-[#D97706]' : 'bg-[#EEF1F8] text-[#62759B]'}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className={`inline-flex h-7 items-center rounded-[10px] px-2.5 text-[11px] font-semibold ${overviewSignalClass(claim.signal)}`}>{claimGroups(claim)}</span>
                </div>
                <p className="mt-2.5 line-clamp-2 text-[14px] font-semibold leading-relaxed text-slate-950">{claim.claim}</p>
                <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[#7888A7]">
                  <span>出处&nbsp; {firstTime(claim)}</span>
                  <span className="flex shrink-0 items-center gap-1 font-medium">查看依据
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5.5 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EvidenceReply({ state, onRetry, onEvidence }: { state: VerifyState; onRetry: () => void; onEvidence: (evidence: EvidenceEntry[]) => void }) {
  if (state.status === 'error') {
    return (
      <div>
        <p className="font-semibold text-[#A32D2D]">核验失败</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-[#A32D2D]/30 bg-white px-3 py-2 text-sm font-semibold text-[#A32D2D]">重新核验这一条</button>
      </div>
    )
  }

  if (state.status !== 'done' || !state.result) {
    return (
      <div className="flex items-center gap-3 text-sm font-medium text-[#0B6E63]">
        <LoadingDots />
        <span>{state.status === 'pending' ? '正在排队检索证据库…' : '正在检索证据库…'}</span>
      </div>
    )
  }

  const result = state.result
  const supportEvidence = citedEvidence(result)
  const downgraded = isEvidenceDowngraded(result)
  return (
    <div>
      <p className="text-[15px] leading-relaxed text-slate-800">{result.correction}</p>
      {downgraded ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M9 18h6M10 21h4M8.2 14.5A6.2 6.2 0 1 1 15.8 14.5c-.9.7-1.3 1.5-1.3 2.5H9.5c0-1-.4-1.8-1.3-2.5Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 3V1.8M4.3 5.2l-.9-.9M19.7 5.2l.9-.9M2.5 12H1.2M22.8 12h-1.3" strokeLinecap="round" /></svg>
          <span>库中未收录相关权威依据，以下为 AI 常识判断，不伪装成有指南支撑</span>
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {supportEvidence.map((evidence) => (
            <button key={evidence.id} type="button" onClick={() => onEvidence(supportEvidence)} className="w-full rounded-xl bg-white px-3 py-2.5 text-left shadow-[0_5px_18px_rgba(11,110,99,0.08)] transition hover:ring-1 hover:ring-[#20CDB6]/40">
              <p className="text-xs font-semibold leading-relaxed text-[#0B6E63]">《{evidence.source_doc}》{evidence.org ? ` · ${evidence.org}` : ''}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{evidence.id}{evidence.page ? ` · 页码 ${evidence.page}` : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ConfrontationCard({ claim, claimIndex, total, state, keyframes, onRetry, onEvidence, onOpenImage }: { claim: Claim; claimIndex: number; total: number; state: VerifyState; keyframes: Keyframe[]; onRetry: () => void; onEvidence: (evidence: EvidenceEntry[]) => void; onOpenImage: (frame: Keyframe) => void }) {
  const matchedFrame = closestFrame(claim, keyframes)
  // 配色只跟 risk_level（低/中/高，受约束字段）走，不再用正则从 verdict 反推「采纳/不采纳」。
  // 旧写法会把「证据不足」「需加条件」这类判定当成 false 分支盖上绿色「建议采纳」，
  // 与旁边并排显示的 verdict 原文自相矛盾。
  const risk = (state.status === 'done' && state.result?.risk_level) || ''
  const riskHigh = risk.includes('高')
  const riskMid = risk.includes('中')
  const verdictTone = riskHigh
    ? { panel: 'border-[#F9D8D8] bg-[#FFF8F8] text-[#C73A3A]', divider: 'border-[#FBE3E3] bg-[#FFF1F1] text-[#AD6666]', accent: 'bg-[#E35555]' }
    : riskMid
      ? { panel: 'border-[#F5E0BC] bg-[#FFFBF3] text-[#9A5B08]', divider: 'border-[#F8E8CC] bg-[#FFF7EA] text-[#A2733A]', accent: 'bg-[#E0A028]' }
      : { panel: 'border-[#CBEDE7] bg-[#F7FCFA] text-[#078C7E]', divider: 'border-[#DDF3EE] bg-[#EEF9F6] text-[#4E8D84]', accent: 'bg-[#20B9A8]' }

  return (
    <div className="pb-2">
      <section>
        <div className="flex items-start gap-3">
          <VideoSourceAvatar />
          <div className="min-w-0 flex-1">
            <div className="relative rounded-[16px] border border-[#F3D9B8] bg-white px-4 py-3 shadow-[0_5px_16px_rgba(173,105,23,0.06)] before:absolute before:-left-2 before:top-5 before:h-3 before:w-3 before:rotate-45 before:border-b before:border-l before:border-[#F3D9B8] before:bg-white before:content-['']">
              <p className="text-[16px] font-medium leading-relaxed text-slate-900">{claim.claim} <span className="font-semibold text-[#0B9F91] underline underline-offset-2">[1]</span></p>
            </div>
            {matchedFrame?.image && (
              <button type="button" onClick={() => onOpenImage(matchedFrame)} className="mt-2 block w-[116px] overflow-hidden rounded-xl bg-slate-100" aria-label={`放大查看 ${formatFrameTime(matchedFrame.time)} 画面`}>
                <img src={matchedFrame.image} alt="与这条说法时间相近的视频关键帧" className="aspect-video w-full object-cover" />
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-start justify-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="relative rounded-[16px] border border-[#BFECE5] bg-[#EFFBF8] px-4 py-3.5 before:absolute before:-right-2 before:top-5 before:h-3 before:w-3 before:rotate-45 before:border-r before:border-t before:border-[#BFECE5] before:bg-[#EFFBF8] before:content-['']">
              <EvidenceReply state={state} onRetry={onRetry} onEvidence={onEvidence} />
            </div>
          </div>
          <EvidenceSourceAvatar />
        </div>
      </section>

      {state.status === 'done' && state.result && (
        <section className={`relative mt-7 overflow-hidden rounded-[10px] border ${verdictTone.panel}`}>
          <div className="px-3 pt-2">
            <p className="flex items-center gap-1.5 text-[10px] font-bold"><span className={`h-3 w-0.5 rounded-full ${verdictTone.accent}`} />核验结论</p>
          </div>
          <div className="relative flex items-center gap-2.5 px-3 pb-2.5 pt-1.5">
            {riskHigh || riskMid ? (
              <svg className={`h-8 w-8 shrink-0 ${riskHigh ? 'text-[#D95D5D]' : 'text-[#D08A1E]'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                <path d="M12 2.7 5.1 5.8v5.3c0 4.3 2.7 7.8 6.9 9.9 4.2-2.1 6.9-5.6 6.9-9.9V5.8L12 2.7Z" fill={riskHigh ? '#FFE5E5' : '#FFF3DC'} strokeLinejoin="round" />
                <path d="M12 8.1v5.1M12 16.3v.1" strokeLinecap="round" strokeWidth="3" />
              </svg>
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E4F8F3] text-[#078C7E]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" aria-hidden="true"><path d="m5.5 12.2 4.1 4.1 8.9-8.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            )}
            <div className="min-w-0 flex-1 pr-1">
              <p className="text-[13px] font-black leading-tight">{state.result.verdict} · 误导风险{state.result.risk_level}</p>
              <p className="mt-1 line-clamp-1 text-[9px] leading-relaxed opacity-75">该说法建议结合个体情况与权威建议谨慎判断</p>
            </div>
            <VerdictStamp verdict={state.result.verdict} riskLevel={state.result.risk_level} />
          </div>
          <div className={`flex items-center gap-1.5 border-t px-3 py-1.5 text-[9px] ${verdictTone.divider}`}>
            <span className="shrink-0 font-bold">更准确的说法：</span>
            <span className="min-w-0 flex-1 truncate">{state.result.correction}</span>
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 6 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </section>
      )}
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

function VerdictSummaryItem({ claim, result, expanded, onToggleCorrection }: { claim: Claim; result: VerifyResult; expanded: boolean; onToggleCorrection: () => void }) {
  const tone = summaryVerdictTone(result, claim.signal)

  return (
    <article className="rounded-[15px] border border-slate-200/80 bg-white p-[10px] shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-2.5">
        <ClaimIcon icon={claim.icon} className="mt-1 h-11 w-11" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone.labelClass}`}>{tone.label}</span>
            <span className={`inline-block shrink-0 -rotate-2 rounded-[8px] border-2 bg-white px-2 py-1 text-[10px] font-black leading-tight ${tone.stampClass}`}>{tone.stamp}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[15px] font-bold leading-[1.45] text-slate-950">“{claim.claim}”</p>
        </div>
      </div>
      <button type="button" onClick={onToggleCorrection} aria-expanded={expanded} className="mt-2 flex w-full items-start gap-2.5 rounded-[12px] border border-[#CDEDE7] bg-[#F0FBF8] px-2.5 py-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[#078C7E]" aria-hidden="true">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 5.5 6v5c0 4.5 2.8 7.8 6.5 9.5 3.7-1.7 6.5-5 6.5-9.5V6L12 3Z" strokeLinejoin="round" /><path d="m8.8 12 2.1 2.1 4.4-4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2 text-[13px] font-black text-[#078C7E]">更准确的说法
            <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span
            className="mt-0.5 block text-[13px] leading-[1.5] text-slate-600"
            style={expanded ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden' }}
          >
            {result.correction}
          </span>
        </span>
      </button>
    </article>
  )
}

function SummaryCard({ claims, states }: { claims: Claim[]; states: VerifyState[] }) {
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
        {isReviewing && claims.length > 0 && (
          <p className="mb-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            审理中，已核验 {completedCount} / {claims.length}，结论将陆续给出
          </p>
        )}
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
                expanded={expandedCorrections.includes(index)}
                onToggleCorrection={() => setExpandedCorrections((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#20CDB6]/25 bg-[#E1F5EE] px-4 py-6 text-center">
            <p className="text-base font-bold text-[#0B6E63]">
              {isReviewing ? '已核验部分暂未发现明显误导' : '这条视频整体较稳，未发现明显误导'}
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

function FollowupAvatar({ compact = false }: { compact?: boolean }) {
  return <span className={`relative z-10 inline-flex shrink-0 rounded-full border border-[#BFECE5] bg-[#EEF9F6] ${compact ? 'h-9 w-9' : 'h-16 w-16'}`} aria-label="FitProof AI 头像占位" />
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

    setMessages((current) => [...current, { role: 'user', content: question }])
    setInput('')
    setLoading(true)
    try {
      const response = await followupSingle({
        reference: {
          author: data.reference.author,
          title: data.reference.title,
          url: data.reference.url,
        },
        topic: topic || data.topic,
        claims: verifiedClaims,
        question,
        history,
      })
      if (aliveRef.current) {
        setMessages((current) => [...current, { role: 'assistant', content: response.answer }])
      }
    } catch {
      if (aliveRef.current) {
        setMessages((current) => [...current, { role: 'assistant', content: '追问失败，请重试' }])
      }
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex flex-1 flex-col overflow-hidden pr-1">
      {!hasConversation && (
        <section>
          <h1 className="truncate text-[17px] font-bold leading-tight text-slate-950">就这条视频和已核验的结论，继续问我</h1>
          <p className="mt-1 truncate text-[12px] leading-tight text-[#7888A7]">AI 会结合已核验内容、医学数据库和权威文献回答你。</p>
        </section>
      )}

      <section className={`${hasConversation ? 'followup-ai-reposition mt-0' : 'mt-2'} flex shrink-0 items-center`}>
        <span className="relative z-10"><FollowupAvatar /></span>
        <div className="relative -ml-8 h-[52px] min-w-0 flex-1 rounded-r-[17px] rounded-l-none border border-l-0 border-[#BFECE5] bg-[#F8FEFC] pl-10 pr-10">
          <div className="flex h-full min-w-0 flex-col justify-center">
            <div className="flex items-center gap-2 whitespace-nowrap leading-[18px]">
              <p className="text-[17px] font-black leading-[18px] text-[#078C7E]">FitProof AI</p>
              <span className="rounded-full bg-[#E6F8F4] px-2 py-0.5 text-[9px] font-normal text-[#078C7E]">数据库辅助回答</span>
            </div>
            <p className="mt-[3px] truncate text-[10px] leading-[10px] text-[#7888A7]">基于科学证据，为你提供更可靠的解答。</p>
          </div>
          <span className="absolute right-3 top-1/2 h-7 w-8 -translate-y-1/2" aria-hidden="true">
            <span className="absolute left-0 top-2 text-[22px] leading-none text-[#9BE3DA]">✦</span>
            <span className="absolute left-4 top-0 text-[10px] leading-none text-[#9BE3DA]">✦</span>
          </span>
        </div>
      </section>

      {!hasConversation && (
        <div className="mt-0 shrink-0">
          <section className="rounded-[15px] border border-[#BFECE5] bg-[#F7FEFC] p-2">
            <p className="px-1 text-[14px] font-semibold text-slate-900">你可以这样问</p>
            <div className="mt-1.5 space-y-1">
              {examples.map((example, index) => (
                <button key={example} type="button" onClick={() => void sendQuestion(example)} disabled={loading} className="flex w-full items-center gap-2 rounded-[12px] border border-[#CDEDE7] bg-white px-2.5 py-1.5 text-left shadow-[0_3px_9px_rgba(11,110,99,0.04)] disabled:opacity-50">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EDF9F7] text-[#078C7E]" aria-hidden="true">
                    {index === 0 ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.8" cy="10.8" r="6.7" /><path d="m16 16 4.4 4.4" strokeLinecap="round" /></svg> : index === 1 ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8.2" cy="8" r="3.2" /><circle cx="16.5" cy="7.2" r="2.5" /><path d="M2.8 20c.7-3.7 2.7-5.6 5.4-5.6s4.7 1.9 5.4 5.6M14.2 14.3c2.8.1 4.8 2 5.2 5" strokeLinecap="round" /></svg> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 5.5 6v5c0 4.5 2.8 7.8 6.5 9.5 3.7-1.7 6.5-5 6.5-9.5V6L12 3Z" /><path d="m8.8 12 2.1 2.1 4.4-4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-normal leading-tight text-[#078C7E]">{example}</span>
                  <svg className="h-4 w-4 shrink-0 text-[#A8CCC7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {hasConversation && (
        <div className="followup-scroll-area -mr-2 mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto pr-4">
          {messages.map((message, index) => message.role === 'user' ? (
            <div key={`${message.role}-${index}`} className="flex justify-end">
              <div className="max-w-[82%] rounded-[14px_14px_4px_14px] bg-[#20CDB6] px-4 py-3 text-sm leading-relaxed text-white">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={`${message.role}-${index}`} className="flex items-end gap-2.5">
              <FollowupAvatar compact />
              <div className="max-w-[calc(100%-2.625rem)] rounded-[14px_14px_14px_4px] border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
                {message.content}
              </div>
            </div>
          ))}

        {loading && (
          <div className="flex items-end gap-2.5">
            <FollowupAvatar compact />
            <div className="flex items-center gap-2 rounded-[14px_14px_14px_4px] border border-slate-200 bg-white px-4 py-3 text-sm text-[#0B6E63] shadow-sm">
              <LoadingDots />
              <span>思考中…</span>
            </div>
          </div>
        )}
        </div>
      )}

      </div>
      <form className="mt-0 flex shrink-0 items-center gap-2 bg-white py-0.5" onSubmit={(event) => { event.preventDefault(); void sendQuestion(input) }}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} rows={1} placeholder="输入你想继续问的问题" className="h-10 min-w-0 flex-1 resize-none rounded-[15px] border border-[#A8DFD8] bg-white px-3 py-2 text-sm leading-tight text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#20CDB6] disabled:bg-slate-50" />
        <button type="submit" disabled={loading || !input.trim()} className="h-10 shrink-0 rounded-[15px] bg-[#20CDB6] px-4 text-[14px] font-black text-white shadow-[0_5px_12px_rgba(32,205,182,0.22)] disabled:bg-slate-200 disabled:text-slate-400">
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
          scrollbar-color: #82d8ce transparent;
          scrollbar-gutter: stable;
        }
        .followup-scroll-area::-webkit-scrollbar { width: 6px; }
        .followup-scroll-area::-webkit-scrollbar-track {
          background: #f3fbf9;
          border-radius: 999px;
        }
        .followup-scroll-area::-webkit-scrollbar-thumb {
          background: #82d8ce;
          border: 1px solid #e9f8f5;
          border-radius: 999px;
        }
      `}</style>
    </div>
  )
}

export default function SingleResultPage({ data, topic, onBack, onVerifyClaim }: SingleResultPageProps) {
  const initialStates = () => data.claims.map<VerifyState>(() => ({ status: 'pending' }))
  const [verifyStates, setVerifyStates] = useState<VerifyState[]>(initialStates)
  const [cardIndex, setCardIndex] = useState(0)
  const [drawer, setDrawer] = useState<DrawerData | null>(null)
  const [visualImage, setVisualImage] = useState<VisualImage | null>(null)
  const [slideDirection, setSlideDirection] = useState<'next' | 'previous' | null>(null)

  const mountedRef = useRef(false)
  const startedRef = useRef(false)
  const activeCountRef = useRef(0)
  const nextIndexRef = useRef(0)
  const retryQueueRef = useRef<number[]>([])
  const statesRef = useRef<VerifyState[]>(initialStates())
  const pumpRef = useRef<() => void>(() => undefined)
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  const cards: CardDescriptor[] = [
    { kind: 'profile' },
    { kind: 'overview' },
    ...data.claims.map((_, claimIndex) => ({ kind: 'confrontation' as const, claimIndex })),
    { kind: 'summary' },
    { kind: 'followup' },
  ]
  const totalCards = cards.length
  const currentCard = cards[Math.min(cardIndex, totalCards - 1)]
  const currentCardLabel = currentCard.kind === 'profile'
    ? '视频档案'
    : currentCard.kind === 'overview'
      ? '说法全景'
        : currentCard.kind === 'confrontation'
        ? `对质 ${currentCard.claimIndex + 1}`
        : currentCard.kind === 'summary'
          ? '避坑总结'
          : '继续追问'
  const confrontationClaim = currentCard.kind === 'confrontation' ? data.claims[currentCard.claimIndex] : null

  function updateVerifyState(index: number, next: VerifyState) {
    statesRef.current = statesRef.current.map((state, stateIndex) => stateIndex === index ? next : state)
    if (mountedRef.current) setVerifyStates(statesRef.current)
  }

  function takeNextIndex() {
    while (retryQueueRef.current.length > 0) {
      const retryIndex = retryQueueRef.current.shift()
      if (retryIndex !== undefined && statesRef.current[retryIndex]?.status === 'pending') return retryIndex
    }
    while (nextIndexRef.current < data.claims.length) {
      const index = nextIndexRef.current
      nextIndexRef.current += 1
      if (statesRef.current[index]?.status === 'pending') return index
    }
    return null
  }

  function runClaim(index: number) {
    const claim = data.claims[index]
    if (!claim || !mountedRef.current) return
    activeCountRef.current += 1
    updateVerifyState(index, { status: 'loading' })
    void Promise.resolve(onVerifyClaim(claim, index))
      .then((result) => updateVerifyState(index, { status: 'done', result }))
      .catch(() => updateVerifyState(index, { status: 'error' }))
      .finally(() => {
        activeCountRef.current = Math.max(0, activeCountRef.current - 1)
        pumpRef.current()
      })
  }

  function pumpQueue() {
    if (!mountedRef.current) return
    while (activeCountRef.current < 2) {
      const index = takeNextIndex()
      if (index === null) break
      runClaim(index)
    }
  }
  pumpRef.current = pumpQueue

  useEffect(() => {
    mountedRef.current = true
    if (!startedRef.current) {
      startedRef.current = true
      pumpRef.current()
    }
    return () => {
      mountedRef.current = false
    }
  }, [])

  function retryClaim(index: number) {
    if (statesRef.current[index]?.status !== 'error') return
    updateVerifyState(index, { status: 'pending' })
    retryQueueRef.current.push(index)
    pumpRef.current()
  }

  function goToCard(nextIndex: number) {
    const boundedIndex = Math.max(0, Math.min(totalCards - 1, nextIndex))
    if (boundedIndex === cardIndex) return
    setSlideDirection(boundedIndex > cardIndex ? 'next' : 'previous')
    setCardIndex(boundedIndex)
  }

  function openClaimFromOverview(claimIndex: number) {
    goToCard(2 + claimIndex)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    gestureStartRef.current = { x: event.clientX, y: event.clientY }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = gestureStartRef.current
    gestureStartRef.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) <= 50) return

    suppressClickRef.current = true
    goToCard(dx < 0 ? cardIndex + 1 : cardIndex - 1)
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  return (
    <main className="fitproof-particle-field relative flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(32,205,182,0.18),transparent_42%),linear-gradient(180deg,#f7fffd_0%,#eef8f6_100%)] px-3 pt-4 text-slate-950">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <header className="relative z-10 mb-4 flex shrink-0 items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="shrink-0 rounded-full bg-white/75 px-3 py-1.5 text-sm font-medium text-[#128f80] shadow-sm backdrop-blur transition hover:bg-[#20CDB6] hover:text-white">‹ 返回</button>
          <div className="min-w-0 max-w-[42%] truncate rounded-full border border-[#20CDB6]/15 bg-white/75 px-3 py-1 text-center text-sm font-semibold text-[#128f80] shadow-sm backdrop-blur">
            <span className="mr-1 text-[#20CDB6]">●</span>
            {topic || data.topic || '单视频核验'}
          </div>
          <span className="shrink-0 rounded-full bg-white/75 px-3 py-1.5 text-sm font-bold text-[#0B6E63] shadow-sm backdrop-blur">{cardIndex + 1} / {totalCards}</span>
        </header>

        <div
          className="flex min-h-0 flex-1 touch-pan-y"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { gestureStartRef.current = null }}
          onClickCapture={handleClickCapture}
        >
          <div key={cardIndex} className={`h-full w-full ${slideDirection === 'next' ? 'card-slide-from-right' : slideDirection === 'previous' ? 'card-slide-from-left' : ''}`}>
            <CourtCardShell
              label={currentCardLabel}
              index={cardIndex + 1}
              subtitle={currentCard.kind === 'profile' ? '来自抖音的单条视频' : currentCard.kind === 'overview' ? '逐条查看本视频拆出的说法' : confrontationClaim ? `视频片段 ${firstTime(confrontationClaim)}` : undefined}
              subtitleLeading={confrontationClaim ? <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-[#20CDB6] bg-white text-[#20CDB6]"><svg className="ml-px h-1.5 w-1.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M2 1.4 8.2 5 2 8.6V1.4Z" /></svg></span> : undefined}
              headerBadge={confrontationClaim ? <span className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold ${overviewSignalClass(confrontationClaim.signal)}`}>{claimGroupsLabel(confrontationClaim)}</span> : undefined}
              hideIndex={Boolean(confrontationClaim)}
              contentScrollable={currentCard.kind !== 'followup'}
            >
            {currentCard.kind === 'profile' && <ProfileCard data={data} onOpenClaim={(index) => goToCard(2 + index)} />}
            {currentCard.kind === 'overview' && <OverviewCard data={data} onOpenClaim={openClaimFromOverview} />}
            {currentCard.kind === 'confrontation' && (
              <ConfrontationCard
                claim={data.claims[currentCard.claimIndex]}
                claimIndex={currentCard.claimIndex}
                total={data.claims.length}
                state={verifyStates[currentCard.claimIndex] || { status: 'pending' }}
                keyframes={data.keyframes}
                onRetry={() => retryClaim(currentCard.claimIndex)}
                onEvidence={(evidence) => setDrawer({ evidence })}
                onOpenImage={(frame) => frame.image && setVisualImage({ image: frame.image, screenText: frame.screen_text, time: frame.time })}
              />
            )}
            {currentCard.kind === 'summary' && <SummaryCard claims={data.claims} states={verifyStates} />}
            {currentCard.kind === 'followup' && <FollowupCard data={data} topic={topic} claims={data.claims} states={verifyStates} />}
            </CourtCardShell>
          </div>
        </div>

        <div className="mt-4 flex shrink-0 flex-col items-center gap-2" aria-label={`当前第 ${cardIndex + 1} 张，共 ${totalCards} 张`}>
          <div className="flex max-w-full flex-wrap justify-center gap-1.5" aria-hidden="true">
            {cards.map((card, index) => (
              <span key={`${card.kind}-${index}`} className={`h-2 w-2 rounded-full ${index === cardIndex ? 'bg-[#20CDB6]' : 'bg-[#D8F0EC]'}`} />
            ))}
          </div>
          <p className="text-[11px] text-slate-400">← 左右滑动翻页 →</p>
        </div>
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

      {drawer && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={(event) => event.stopPropagation()} className="relative z-10 max-h-[72vh] overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-4 shadow-[0_-10px_30px_rgba(15,23,42,0.10)]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <p className="mb-3 text-[16px] font-black tracking-wide text-slate-900">参考文献（{drawer.evidence.length}）</p>
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
            <button type="button" onClick={() => setDrawer(null)} className="mt-5 w-full rounded-full bg-slate-100 py-2.5 text-sm font-medium text-slate-600">收起</button>
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
    </main>
  )
}
