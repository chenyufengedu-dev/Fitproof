'use client'

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Claim, EvidenceEntry, Keyframe, SingleAnalyzeResponse, VerifyResult } from '@/types'
import { citedEvidence, isEvidenceDowngraded } from '@/lib/single'
import { followupSingle } from '@/lib/api'
import { findCommunityShare, submitCommunityShare, type CommunityShareStatus } from '@/lib/communityShares'
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

type ShareStatus = CommunityShareStatus | 'idle'

type CardDescriptor =
  | { kind: 'profile' }
  | { kind: 'overview' }
  | { kind: 'confrontation'; claimIndex: number }
  | { kind: 'summary' }
  | { kind: 'followup' }

interface DrawerData {
  title: string
  evidence: EvidenceEntry
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

function EvidenceReply({ state, onRetry, onEvidence }: { state: VerifyState; onRetry: () => void; onEvidence: (evidence: EvidenceEntry) => void }) {
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
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
          库中未收录相关权威依据，以下为 AI 常识判断，不伪装成有指南支撑
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {supportEvidence.map((evidence) => (
            <button key={evidence.id} type="button" onClick={() => onEvidence(evidence)} className="w-full rounded-xl bg-white px-3 py-2.5 text-left shadow-[0_5px_18px_rgba(11,110,99,0.08)] transition hover:ring-1 hover:ring-[#20CDB6]/40">
              <p className="text-xs font-semibold leading-relaxed text-[#0B6E63]">《{evidence.source_doc}》{evidence.org ? ` · ${evidence.org}` : ''}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{evidence.id}{evidence.page ? ` · 页码 ${evidence.page}` : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ConfrontationCard({ claim, claimIndex, total, state, keyframes, onRetry, onEvidence, onOpenImage }: { claim: Claim; claimIndex: number; total: number; state: VerifyState; keyframes: Keyframe[]; onRetry: () => void; onEvidence: (evidence: EvidenceEntry) => void; onOpenImage: (frame: Keyframe) => void }) {
  const matchedFrame = closestFrame(claim, keyframes)

  return (
    <div className="pb-2">
      <section>
        <p className="inline-flex rounded-xl bg-[#FFF3E4] px-3 py-1.5 text-[13px] font-bold text-[#D97706]">1　视频里说</p>
        <div className="mt-4 flex items-end gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#F6D5A8] bg-[#FFF8EE] text-[15px] font-bold text-[#C87518]">视</span>
          <div className="min-w-0 flex-1">
            <div className="rounded-[18px_18px_18px_5px] border border-[#F5DFC3] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(173,105,23,0.07)]">
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
        <div className="flex justify-end"><p className="inline-flex rounded-xl bg-[#EAF9F6] px-3 py-1.5 text-[13px] font-bold text-[#078C7E]">2　数据库依据</p></div>
        <div className="mt-3 flex items-end justify-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="rounded-[18px_18px_5px_18px] border border-[#BFECE5] bg-[#F0FBF8] px-4 py-3.5">
              <EvidenceReply state={state} onRetry={onRetry} onEvidence={onEvidence} />
            </div>
          </div>
          <ShieldAvatar />
        </div>
      </section>

      {state.status === 'done' && state.result && (
        <section className="mt-7">
          <p className="inline-flex rounded-xl bg-[#FFF0F0] px-3 py-1.5 text-[13px] font-bold text-[#C73A3A]">3　核验结论</p>
          <div className={`mt-3 flex items-center gap-3 rounded-[16px] border px-4 py-3.5 ${verdictStampClass(state.result)} bg-white`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current text-lg">!</span>
            <p className="text-[16px] font-bold leading-relaxed">{state.result.verdict} · 误导风险{state.result.risk_level}</p>
            <span className="ml-auto shrink-0 rounded-full border border-current/30 px-2 py-1 text-[10px] font-bold opacity-35">核验</span>
          </div>
        </section>
      )}
    </div>
  )
}

function shareButtonLabel(status: ShareStatus) {
  if (status === 'pending') return '已提交审核'
  if (status === 'published') return '已发布到社区'
  if (status === 'featured') return '已入选社区精选'
  if (status === 'rejected') return '未通过审核'
  if (status === 'removed') return '已下架'
  return '分享到社区'
}

function SummaryCard({ claims, states, shareStatus, onShare }: { claims: Claim[]; states: VerifyState[]; shareStatus: ShareStatus; onShare: () => void }) {
  const completedCount = states.filter((state) => state.status === 'done').length
  const isReviewing = completedCount < claims.length
  const dangerous = states
    .map((state, index) => ({ state, claim: claims[index], index }))
    .filter(({ state, claim }) => state.status === 'done' && state.result && claim && (
      state.result.risk_level.includes('高')
      || state.result.risk_level.includes('误导')
      || state.result.verdict.includes('不建议')
      || state.result.verdict.includes('夸大')
      || claim.signal === '疑似夸大'
    ))
    .sort((left, right) => {
      const leftHighRisk = left.state.result?.risk_level.includes('高') ? 1 : 0
      const rightHighRisk = right.state.result?.risk_level.includes('高') ? 1 : 0
      return rightHighRisk - leftHighRisk || left.index - right.index
    })
  const featuredDangerous = dangerous.slice(0, 2)

  return (
    <div>
      <div className="border-b border-[#D8F0EC] bg-[#f7fffd] px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">避坑总结</p>
            <h1 className="mt-1 text-3xl font-black text-slate-950">宣判</h1>
          </div>
          <div className="rounded-xl border border-[#20CDB6]/25 bg-white px-3 py-2 text-right">
            <p className="text-sm font-black text-[#0B6E63]">FitProof</p>
            <p className="mt-0.5 text-[10px] text-slate-400">健康说法核验</p>
          </div>
        </div>

        {isReviewing && claims.length > 0 && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            审理中，已核验 {completedCount} / {claims.length}，结论将陆续给出
          </p>
        )}
      </div>

      <div className="p-5">
        {claims.length === 0 ? (
          <div className="rounded-2xl border border-[#20CDB6]/20 bg-[#E1F5EE] px-4 py-6 text-center">
            <p className="text-base font-semibold text-[#0B6E63]">无可核验说法</p>
            <p className="mt-1 text-sm text-slate-500">这条视频没有提取出可供证据核验的主张。</p>
          </div>
        ) : featuredDangerous.length > 0 ? (
          <div className="space-y-4">
            {featuredDangerous.map(({ claim, state, index }) => {
              const result = state.result as VerifyResult
              return (
                <article key={`${claim.claim}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-semibold text-slate-400">需要打折听</p>
                  <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-slate-950">“{claim.claim}”</p>
                  <div className="mt-3 overflow-hidden px-1 py-1">
                    <span className={`inline-block max-w-full -rotate-2 rounded-lg border-2 px-2.5 py-1.5 text-xs font-black ${verdictStampClass(result)}`}>
                      {result.verdict} · 误导风险{result.risk_level}
                    </span>
                  </div>
                  <div className="mt-3 rounded-xl bg-[#E1F5EE] px-3 py-3">
                    <p className="text-[11px] font-semibold text-[#0B6E63]">更准确的说法</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">{result.correction}</p>
                  </div>
                </article>
              )
            })}
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
          <div className="mt-5 border-t border-[#D8F0EC] pt-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B6E63]">求真结论</p>
            <p className="mt-1.5 text-base font-bold text-slate-900">
              共 {claims.length} 条说法，其中 {dangerous.length} 条需要打折听
            </p>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-[#D8F0EC] bg-white p-4 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E7FAF6] text-[#0B6E63]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="m16 6-4-4-4 4" /><path d="M12 2v14" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-950">分享这份核验报告</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">点击后提交含关键帧、原始说法、核验结论和依据的报告快照。通过审核后会出现在社区。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onShare}
            disabled={isReviewing || shareStatus !== 'idle'}
            className="mt-3 h-11 w-full rounded-full bg-[#0D9488] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(13,148,136,0.22)] disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            {isReviewing ? `核验完成后可分享（${completedCount}/${claims.length}）` : shareButtonLabel(shareStatus)}
          </button>
          {shareStatus === 'pending' && <p className="mt-2 text-center text-xs text-[#0B6E63]">已进入审核，通过后自动展示在社区。</p>}
        </div>
      </div>
    </div>
  )
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
    <div>
      <div className="border-b border-[#D8F0EC] pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">继续追问</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">就这条视频和已核验的结论，继续问我</h1>
      </div>

      <div className="mt-4 max-h-[44vh] min-h-52 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-[#20CDB6]/15 bg-[#f7fffd] p-4">
            <p className="text-sm font-medium text-slate-600">你可以这样问</p>
            <div className="mt-3 space-y-2">
              {examples.map((example) => (
                <button key={example} type="button" onClick={() => void sendQuestion(example)} disabled={loading} className="w-full rounded-xl border border-[#20CDB6]/20 bg-white px-3 py-2.5 text-left text-sm leading-relaxed text-[#0B6E63] disabled:opacity-50">
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => message.role === 'user' ? (
            <div key={`${message.role}-${index}`} className="flex justify-end">
              <div className="max-w-[82%] rounded-[14px_14px_4px_14px] bg-[#20CDB6] px-4 py-3 text-sm leading-relaxed text-white">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={`${message.role}-${index}`} className="flex items-end gap-2.5">
              <ShieldAvatar />
              <div className="max-w-[calc(100%-2.625rem)] rounded-[14px_14px_14px_4px] border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
                {message.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-end gap-2.5">
            <ShieldAvatar />
            <div className="flex items-center gap-2 rounded-[14px_14px_14px_4px] border border-slate-200 bg-white px-4 py-3 text-sm text-[#0B6E63] shadow-sm">
              <LoadingDots />
              <span>思考中…</span>
            </div>
          </div>
        )}
      </div>

      <form className="mt-4 flex items-end gap-2 border-t border-[#D8F0EC] pt-4" onSubmit={(event) => { event.preventDefault(); void sendQuestion(input) }}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} rows={2} placeholder="输入你想继续问的问题" className="min-h-[48px] min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#20CDB6] disabled:bg-slate-50" />
        <button type="submit" disabled={loading || !input.trim()} className="h-12 shrink-0 rounded-2xl bg-[#20CDB6] px-4 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400">
          发送
        </button>
      </form>
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
  const [shareStatus, setShareStatus] = useState<ShareStatus>('idle')

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
          ? '宣判'
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
    setShareStatus(findCommunityShare(data)?.status || 'idle')
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

  function handleShareToCommunity() {
    const results = statesRef.current.flatMap((state) => state.status === 'done' && state.result ? [state.result] : [])
    if (results.length < data.claims.length) return
    const record = submitCommunityShare(data, topic, results)
    setShareStatus(record.status)
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
              headerBadge={confrontationClaim ? <span className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold ${overviewSignalClass(confrontationClaim.signal)}`}>{claimGroupsLabel(confrontationClaim)}</span> : undefined}
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
                onEvidence={(evidence) => setDrawer({ title: evidence.id, evidence })}
                onOpenImage={(frame) => frame.image && setVisualImage({ image: frame.image, screenText: frame.screen_text, time: frame.time })}
              />
            )}
            {currentCard.kind === 'summary' && <SummaryCard claims={data.claims} states={verifyStates} shareStatus={shareStatus} onShare={handleShareToCommunity} />}
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
          <div onClick={(event) => event.stopPropagation()} className="relative z-10 max-h-[72vh] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-5">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <p className="mb-3 text-sm font-semibold text-slate-900">权威依据 · {drawer.title}</p>
            <div className="rounded-2xl bg-[#E1F5EE] px-4 py-3">
              <p className="text-[15px] leading-relaxed text-slate-900">{drawer.evidence.claim}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                {drawer.evidence.source_doc}
                {drawer.evidence.org ? ` · ${drawer.evidence.org}` : ''}
                {drawer.evidence.year ? ` · ${drawer.evidence.year}` : ''}
                {drawer.evidence.page ? ` · 页码 ${drawer.evidence.page}` : ''}
              </p>
              {drawer.evidence.url && <a href={drawer.evidence.url} target="_blank" rel="noreferrer" className="mt-3 inline-block break-all text-sm font-medium text-[#0B6E63] underline">打开官方来源</a>}
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
