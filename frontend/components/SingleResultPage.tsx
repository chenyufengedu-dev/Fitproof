'use client'

import { useEffect, useRef, useState } from 'react'
import type { Claim, EvidenceEntry, SingleAnalyzeResponse, VerifyResult } from '@/types'
import { citedEvidence, isEvidenceDowngraded } from '@/lib/single'

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

interface DrawerData {
  title: string
  evidence: EvidenceEntry
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

function signalColor(signal: string) {
  if (signal === '较公认') return '#20CDB6'
  if (signal === '疑似夸大') return '#F59E0B'
  return '#94A3B8'
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

function ProfileCard({ data }: { data: SingleAnalyzeResponse }) {
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
  ]
  const visibleFrames = data.keyframes.filter((frame) => typeof frame.screen_text === 'string' && frame.screen_text.trim())

  return (
    <section className="rounded-[26px] border border-[#20CDB6]/20 bg-white p-5 shadow-[0_18px_55px_rgba(18,116,103,0.10)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">卡 01 · 视频档案</p>
      <p className="mt-1 text-xs text-slate-400">开庭：被告是谁</p>

      <div className="mt-5 border-l-4 border-[#20CDB6] pl-4">
        <p className="text-sm font-semibold text-[#0B6E63]">{data.reference.author || '作者未标注'}</p>
        <h1 className="mt-1 text-xl font-semibold leading-relaxed text-slate-950">{data.reference.title || '标题未标注'}</h1>
        {data.reference.url && (
          <a href={data.reference.url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-xs font-medium text-[#0B6E63] underline">
            打开原视频
          </a>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-[#20CDB6]/15 bg-[#f7fffd] p-4">
        <p className="text-sm font-semibold text-slate-900">共 {data.claims.length} 条说法</p>
        {data.claims.length > 0 && (
          <>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label="说法类型比例">
              {stats.filter((item) => item.count > 0).map((item) => (
                <span key={item.label} style={{ width: `${(item.count / data.claims.length) * 100}%`, backgroundColor: item.color }} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
              {stats.filter((item) => item.count > 0).map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
                  {item.count} {item.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {visibleFrames.length > 0 && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold text-slate-900">AI 从画面里看到的</h2>
          <div className="mt-2 space-y-2">
            {visibleFrames.map((frame, index) => {
              const time = formatFrameTime(frame.time)
              return (
                <div key={`${String(frame.time)}-${index}`} className="flex gap-3 rounded-2xl border border-[#20CDB6]/15 bg-white px-3 py-3">
                  {time && <span className="shrink-0 rounded-lg bg-[#E1F5EE] px-2 py-1 text-xs font-semibold text-[#0B6E63]">{time}</span>}
                  <p className="min-w-0 text-sm leading-relaxed text-slate-600">{String(frame.screen_text)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
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

function ConfrontationCard({ claim, claimIndex, total, state, onRetry, onEvidence }: { claim: Claim; claimIndex: number; total: number; state: VerifyState; onRetry: () => void; onEvidence: (evidence: EvidenceEntry) => void }) {
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

export default function SingleResultPage({ data, topic, onBack, onVerifyClaim }: SingleResultPageProps) {
  const initialStates = () => data.claims.map<VerifyState>(() => ({ status: 'pending' }))
  const [verifyStates, setVerifyStates] = useState<VerifyState[]>(initialStates)
  const [cardIndex, setCardIndex] = useState(0)
  const [drawer, setDrawer] = useState<DrawerData | null>(null)

  const mountedRef = useRef(false)
  const startedRef = useRef(false)
  const activeCountRef = useRef(0)
  const nextIndexRef = useRef(0)
  const retryQueueRef = useRef<number[]>([])
  const statesRef = useRef<VerifyState[]>(initialStates())
  const pumpRef = useRef<() => void>(() => undefined)

  const cards: CardDescriptor[] = [
    { kind: 'profile' },
    { kind: 'overview' },
    ...data.claims.map((_, claimIndex) => ({ kind: 'confrontation' as const, claimIndex })),
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

  function moveCard(delta: number) {
    setCardIndex((current) => Math.max(0, Math.min(totalCards - 1, current + delta)))
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7fffd] px-4 pb-40 pt-4 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="shrink-0 rounded-full border border-[#20CDB6]/20 bg-white px-3 py-1.5 text-sm font-medium text-[#0B6E63] shadow-sm">‹ 返回</button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold text-slate-800">{topic || data.topic || '单视频核验'}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">庭审卡组</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#E1F5EE] px-3 py-1.5 text-sm font-bold text-[#0B6E63]">{cardIndex + 1} / {totalCards}</span>
        </header>

        {currentCard.kind === 'profile' && <ProfileCard data={data} />}
        {currentCard.kind === 'overview' && <OverviewCard data={data} states={verifyStates} onOpenClaim={(index) => setCardIndex(2 + index)} />}
        {currentCard.kind === 'confrontation' && (
          <ConfrontationCard
            claim={data.claims[currentCard.claimIndex]}
            claimIndex={currentCard.claimIndex}
            total={data.claims.length}
            state={verifyStates[currentCard.claimIndex] || { status: 'pending' }}
            onRetry={() => retryClaim(currentCard.claimIndex)}
            onEvidence={(evidence) => setDrawer({ title: evidence.id, evidence })}
          />
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-16 z-30 border-t border-[#D8F0EC] bg-[#f7fffd] px-4 py-3" aria-label="庭审卡片切换">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3">
          <button type="button" onClick={() => moveCard(-1)} disabled={cardIndex === 0} className="rounded-2xl border border-[#20CDB6]/25 bg-white px-4 py-3 text-sm font-semibold text-[#0B6E63] shadow-sm disabled:border-slate-200 disabled:text-slate-300 disabled:shadow-none">‹ 上一张</button>
          <button type="button" onClick={() => moveCard(1)} disabled={cardIndex === totalCards - 1} className="rounded-2xl bg-[#20CDB6] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(32,205,182,0.25)] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">下一张 ›</button>
        </div>
      </nav>

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
    </main>
  )
}
