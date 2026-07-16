'use client'

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Claim, EvidenceEntry, Keyframe, SingleAnalyzeResponse, VerifyResult } from '@/types'
import { citedEvidence, isEvidenceDowngraded } from '@/lib/single'
import { followupSingle } from '@/lib/api'

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

function ProfileCard({ data, onOpenImage }: { data: SingleAnalyzeResponse; onOpenImage: (frame: Keyframe) => void }) {
  const counts = data.claims.reduce(
    (acc, claim) => {
      if (claim.signal === '较公认') acc.common += 1
      else if (claim.signal === '疑似夸大') acc.exaggerated += 1
      else acc.conditional += 1
      return acc
    },
    { common: 0, exaggerated: 0, conditional: 0 },
  )
  const stats = [
    { label: '较公认', count: counts.common, color: '#20CDB6' },
    { label: '疑似夸大', count: counts.exaggerated, color: '#F59E0B' },
    { label: '有条件/有争议', count: counts.conditional, color: '#94A3B8' },
  ].filter((item) => item.count > 0)
  const visibleFrames = data.keyframes.filter((frame) => typeof frame.screen_text === 'string' && frame.screen_text.trim())
  const posterFrame = data.keyframes.find((frame) => typeof frame.image === 'string' && frame.image.length > 0)
  const hasVideoUrl = Boolean(data.reference.url)
  const author = data.reference.author || '作者未标注'
  const poster = (
    <div className="relative aspect-video overflow-hidden bg-[#E1F5EE]">
      {posterFrame?.image ? (
        <img src={posterFrame.image} alt="视频关键帧封面" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-[#0B6E63]">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#20CDB6]/30 bg-white/80" aria-hidden="true">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="6" width="13" height="12" rx="2" />
              <path d="m16 10 5-3v10l-5-3" />
            </svg>
          </span>
          <span className="mt-2 text-xs font-medium">{hasVideoUrl ? '在抖音查看原视频' : '视频封面暂不可用'}</span>
        </div>
      )}
      {hasVideoUrl && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/70 bg-black/55 pl-1 text-xl text-white shadow-lg">▶</span>
        </span>
      )}
    </div>
  )

  return (
    <section className="overflow-hidden rounded-[26px] border border-[#20CDB6]/20 bg-white shadow-[0_18px_55px_rgba(18,116,103,0.10)]">
      <div className="px-5 pb-3 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">卡 01 · 视频档案</p>
        <p className="mt-1 text-xs text-slate-400">开庭：被告是谁</p>
      </div>

      <div className="mx-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        {hasVideoUrl ? (
          <a href={data.reference.url} target="_blank" rel="noreferrer" className="block" aria-label="在抖音打开原视频">
            {poster}
          </a>
        ) : poster}
      </div>

      <div className="px-5 pb-5 pt-4">
        <h1 className="line-clamp-2 text-lg font-bold leading-relaxed text-slate-950">{data.reference.title || '标题未标注'}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E1F5EE] text-xs font-bold text-[#0B6E63]">{author.trim().charAt(0) || '博'}</span>
          <span className="truncate">{author}</span>
        </div>

        <div className="mt-4 rounded-2xl border border-[#20CDB6]/15 bg-[#f7fffd] px-4 py-3">
          {data.claims.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm leading-relaxed text-slate-700">
              <span>这条视频拆出 {data.claims.length} 条说法：</span>
              {stats.map((item, index) => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.count} 条{item.label}
                  {index < stats.length - 1 && <span className="ml-0.5 text-slate-300">·</span>}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-sm text-slate-500">这条视频没有拆出可核验说法。</p>
          )}
        </div>

        {visibleFrames.length > 0 && (
          <div className="mt-5">
            <h2 className="text-sm font-semibold text-slate-900">AI 从画面里看到的</h2>
            <div className="mt-2 space-y-2">
              {visibleFrames.map((frame, index) => {
                const time = formatFrameTime(frame.time)
                const hasImage = typeof frame.image === 'string' && frame.image.length > 0
                return (
                  <div key={`${String(frame.time)}-${index}`} className="flex gap-3 rounded-2xl border border-[#20CDB6]/15 bg-white px-3 py-3">
                    {hasImage ? (
                      <>
                        <button type="button" onClick={() => onOpenImage(frame)} className="h-16 w-[72px] shrink-0 overflow-hidden rounded-xl bg-slate-100" aria-label={`放大查看 ${time || '关键帧'} 画面`}>
                          <img src={frame.image} alt="AI 抓取的视频关键帧" className="h-full w-full object-cover" />
                        </button>
                        <div className="min-w-0 flex-1">
                          {time && <span className="inline-block rounded-lg bg-[#E1F5EE] px-2 py-1 text-xs font-semibold text-[#0B6E63]">{time}</span>}
                          <p className={`${time ? 'mt-1.5' : ''} text-sm leading-relaxed text-slate-600`}>{String(frame.screen_text)}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        {time && <span className="shrink-0 rounded-lg bg-[#E1F5EE] px-2 py-1 text-xs font-semibold text-[#0B6E63]">{time}</span>}
                        <p className="min-w-0 text-sm leading-relaxed text-slate-600">{String(frame.screen_text)}</p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function ClaimStatus({ state }: { state: VerifyState }) {
  if (state.status === 'done') return <span className="max-w-[6.5rem] truncate text-xs font-semibold text-[#0B6E63]">{state.result?.verdict}</span>
  if (state.status === 'error') return <span className="text-xs font-semibold text-[#A32D2D]">↻ 重试</span>
  if (state.status === 'loading') return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0B6E63]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#20CDB6]/30 border-t-[#20CDB6]" />核验中</span>
  return <span className="text-xs text-slate-400">等待中</span>
}

function OverviewCard({ data, states, onOpenClaim }: { data: SingleAnalyzeResponse; states: VerifyState[]; onOpenClaim: (index: number) => void }) {
  return (
    <section className="rounded-[26px] border border-[#20CDB6]/20 bg-white p-5 shadow-[0_18px_55px_rgba(18,116,103,0.10)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">卡 02 · 说法全景</p>
      <h1 className="mt-1 text-xl font-semibold text-slate-950">宣读起诉书</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">每条说法正在依次对照权威证据，点击可直接查看对质。</p>

      {data.claims.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">这条视频没有提取到可核验说法。</p>
      ) : (
        <div className="mt-5 space-y-2.5">
          {data.claims.map((claim, index) => (
            <button key={`${claim.claim}-${index}`} type="button" onClick={() => onOpenClaim(index)} className="w-full rounded-2xl border border-[#20CDB6]/15 bg-[#f7fffd] p-3.5 text-left transition hover:border-[#20CDB6] hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <span className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold ${signalClass(claim.signal)}`}>{claim.signal}</span>
                <ClaimStatus state={states[index] || { status: 'pending' }} />
              </div>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-900">{claim.claim}</p>
              <p className="mt-2 text-xs text-slate-400">出处 {firstTime(claim)}</p>
            </button>
          ))}
        </div>
      )}
    </section>
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
    <section className="rounded-[26px] border border-[#20CDB6]/20 bg-white p-4 shadow-[0_18px_55px_rgba(18,116,103,0.10)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#D8F0EC] pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B6E63]">对质 {claimIndex + 1} / {total}</p>
          <p className="mt-1 text-xs text-slate-400">出自视频 {firstTime(claim)}</p>
        </div>
        <span className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${signalClass(claim.signal)}`}>{claim.signal}</span>
      </div>

      <div className="mt-5 space-y-5">
        <div className="flex items-end gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-800">博</span>
          <div className="max-w-[calc(100%-2.625rem)]">
            <p className="mb-1.5 text-[11px] font-medium text-slate-400">视频里说</p>
            <div className="rounded-[14px_14px_14px_4px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[15px] font-medium leading-relaxed text-slate-900">“{claim.claim}”</p>
            </div>
            {matchedFrame?.image && (
              <div className="mt-2">
                <button type="button" onClick={() => onOpenImage(matchedFrame)} className="block w-[120px] overflow-hidden rounded-xl bg-slate-100" aria-label={`放大查看 ${formatFrameTime(matchedFrame.time)} 画面`}>
                  <img src={matchedFrame.image} alt="与这条说法时间相近的视频关键帧" className="aspect-video w-full object-cover" />
                </button>
                <p className="mt-1 text-[11px] text-slate-400">AI 抓到的画面 {formatFrameTime(matchedFrame.time)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end justify-end gap-2.5">
          <div className="max-w-[calc(100%-2.625rem)]">
            <p className="mb-1.5 text-right text-[11px] font-medium text-[#0B6E63]">权威证据库</p>
            <div className="rounded-[14px_14px_4px_14px] bg-[#E1F5EE] px-4 py-3">
              <EvidenceReply state={state} onRetry={onRetry} onEvidence={onEvidence} />
            </div>
          </div>
          <ShieldAvatar />
        </div>
      </div>

      {state.status === 'done' && state.result && (
        <div className="mt-7 flex justify-center overflow-hidden px-1 py-2">
          <div className={`max-w-full -rotate-3 whitespace-nowrap rounded-lg border-2 px-3 py-2 text-center text-xs font-black ${verdictStampClass(state.result)}`}>
            {state.result.verdict} · 误导风险{state.result.risk_level}
          </div>
        </div>
      )}
    </section>
  )
}

function SummaryCard({ claims, states }: { claims: Claim[]; states: VerifyState[] }) {
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
    <section className="overflow-hidden rounded-[26px] border border-[#20CDB6]/25 bg-white shadow-[0_18px_55px_rgba(18,116,103,0.10)]">
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
      </div>
    </section>
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
    <section className="rounded-[26px] border border-[#20CDB6]/20 bg-white p-4 shadow-[0_18px_55px_rgba(18,116,103,0.10)]">
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
    </section>
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
    <main className="min-h-[100dvh] bg-[#f7fffd] px-4 pb-24 pt-4 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="shrink-0 rounded-full border border-[#20CDB6]/20 bg-white px-3 py-1.5 text-sm font-medium text-[#0B6E63] shadow-sm">‹ 返回</button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold text-slate-800">{topic || data.topic || '单视频核验'}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">庭审卡组</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#E1F5EE] px-3 py-1.5 text-sm font-bold text-[#0B6E63]">{cardIndex + 1} / {totalCards}</span>
        </header>

        <div
          className="touch-pan-y"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { gestureStartRef.current = null }}
          onClickCapture={handleClickCapture}
        >
          <div key={cardIndex} className={slideDirection === 'next' ? 'card-slide-from-right' : slideDirection === 'previous' ? 'card-slide-from-left' : ''}>
            {currentCard.kind === 'profile' && <ProfileCard data={data} onOpenImage={(frame) => frame.image && setVisualImage({ image: frame.image, screenText: frame.screen_text, time: frame.time })} />}
            {currentCard.kind === 'overview' && <OverviewCard data={data} states={verifyStates} onOpenClaim={(index) => goToCard(2 + index)} />}
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
            {currentCard.kind === 'summary' && <SummaryCard claims={data.claims} states={verifyStates} />}
            {currentCard.kind === 'followup' && <FollowupCard data={data} topic={topic} claims={data.claims} states={verifyStates} />}
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-2" aria-label={`当前第 ${cardIndex + 1} 张，共 ${totalCards} 张`}>
          <div className="flex max-w-full flex-wrap justify-center gap-1.5" aria-hidden="true">
            {cards.map((card, index) => (
              <span key={`${card.kind}-${index}`} className={`h-2 w-2 rounded-full border ${index === cardIndex ? 'border-[#0B6E63] bg-[#20CDB6]' : 'border-[#20CDB6]/20 bg-[#D8F0EC]'}`} />
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
