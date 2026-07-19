'use client'

import { useEffect, useMemo, useState } from 'react'
import communitySamplesJson from '@/data/community-samples.json'
import FitProofCat from '@/components/FitProofCat'
import type { EvidenceEntry, SingleSampleData, VerifyResult } from '@/types'

type SourceType = 'official' | 'user' | 'expert'
type EvidenceLevel = 'guideline' | 'full_text' | 'ai_general'
type CommunityView = 'feed' | 'detail'
type FeedMode = 'featured' | 'latest'

interface CommunityEvidence {
  id: string
  level: EvidenceLevel
  sourceTitle: string
  organization?: string
  year?: string
  summary: string
  chapter?: string
  page?: string
  officialUrl?: string
}

interface CommunityClaim {
  claim: string
  time: string
  signal: string
  verdict: string
  risk: string
  correction: string
}

interface CommunityKeyframe {
  time: number
  image?: string
  imageUrl?: string
  sourceUrl?: string
  screenText: string
}

interface CommunityCase {
  caseId: string
  sourceType: SourceType
  publisher: { displayName: string; badge: string }
  title: string
  topic: string
  categoryIds: string[]
  publishTime: string
  video: {
    coverLabel: string
    coverEmoji?: string
    coverImage?: string
    sourceUrl?: string
    duration: number
    sourceName: string
    timepoints: number[]
    keyframes?: CommunityKeyframe[]
  }
  originalClaim: string
  signal: string
  verdict: { type: string; label: string; summary: string }
  risk: { level: 'low' | 'medium' | 'high'; label: string }
  correctedExpression: string
  evidence: CommunityEvidence[]
  analysisSnapshot: {
    snapshotId: string
    claimCount: number
    reviewedAt: string
    evidenceVersion: string
    reviewStatus: string
  }
  claims: CommunityClaim[]
  reportNotes?: {
    detailExplanation?: string
    scopeAndExceptions?: string
    evidenceIds?: string[]
  }
  // Backward-compatible static sample field. New API data should use reportNotes.
  discussion?: { role: string; content: string; evidenceIds?: string[] }[]
  allowComments: boolean
}

interface InteractionState {
  helped: string[]
  collected: string[]
}

interface CommunityTabProps {
  onOpenVerifiedCase: (sample: SingleSampleData) => void
}

const communitySamples = communitySamplesJson as CommunityCase[]
const categories = ['全部', '婴幼儿', '孕期', '运动', '饮食', '中老年']
const interactionKey = 'fitproof.community.interactions.v1'

function Icon({ name, className = 'h-5 w-5' }: { name: 'search' | 'shield' | 'heart' | 'chat' | 'bookmark' | 'share' | 'arrow' | 'clock' | 'book' | 'check' | 'back' | 'alert' | 'bars' | 'bulb' | 'user' | 'quote'; className?: string }) {
  const common = { className, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, viewBox: '0 0 24 24', 'aria-hidden': true as const }
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
  if (name === 'shield') return <svg {...common}><path d="M12 3 5 6v5c0 4.7 2.9 8.1 7 10 4.1-1.9 7-5.3 7-10V6l-7-3Z" /><path d="m8.8 12 2 2 4.6-4.6" /></svg>
  if (name === 'heart') return <svg {...common}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
  if (name === 'chat') return <svg {...common}><path d="M21 12a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 21l1.9-5A8 8 0 1 1 21 12Z" /></svg>
  if (name === 'bookmark') return <svg {...common}><path d="M6 4h12v17l-6-4-6 4V4Z" /></svg>
  if (name === 'share') return <svg {...common}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></svg>
  if (name === 'arrow') return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  if (name === 'book') return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" /></svg>
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>
  if (name === 'alert') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
  if (name === 'bars') return <svg {...common}><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></svg>
  if (name === 'bulb') return <svg {...common}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.2 14.8a6 6 0 1 1 7.6 0c-.8.6-1.3 1.5-1.3 2.5h-5c0-1-.5-1.9-1.3-2.5Z" /></svg>
  if (name === 'user') return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
  if (name === 'quote') return <svg {...common}><path d="M8 10H5.5A2.5 2.5 0 0 0 3 12.5V17h5v-7Z" /><path d="M19 10h-2.5a2.5 2.5 0 0 0-2.5 2.5V17h5v-7Z" /></svg>
  return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function buildVideoUrlWithTime(sourceUrl: string, timeSeconds: number) {
  try {
    const url = new URL(sourceUrl)
    const host = url.hostname.toLowerCase()
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      url.searchParams.set('t', `${timeSeconds}s`)
      return url.toString()
    }
    if (host.includes('bilibili.com')) {
      url.searchParams.set('t', String(timeSeconds))
      return url.toString()
    }
  } catch {
    // If the saved source is not a full URL, fall back to opening it as-is.
  }
  return sourceUrl
}

function verdictClass(label: string) {
  if (/可信/.test(label) && !/不/.test(label)) return 'bg-[#EAF7F0] text-[#27855A]'
  if (/条件|部分/.test(label)) return 'bg-[#FFF3DE] text-[#A86408]'
  if (/不准确|不建议/.test(label)) return 'bg-[#FFF0F0] text-[#C94242]'
  return 'bg-[#EFF3F2] text-[#60716D]'
}

function riskClass(level: string) {
  if (/高/.test(level)) return 'bg-[#FFF0F0] text-[#C94242]'
  if (/中/.test(level)) return 'bg-[#FFF3DE] text-[#A86408]'
  return 'bg-[#EAF7F0] text-[#27855A]'
}

function judgementTone(label: string) {
  if (/不建议|不可信|不准确|错误|高风险/.test(label)) return 'red'
  if (/条件|有条件|需要|需|部分|争议|中风险/.test(label)) return 'yellow'
  if (/可信|可采纳|低风险/.test(label)) return 'green'
  return 'green'
}

function toneTextClass(tone: string) {
  if (tone === 'red') return 'text-[#C94242]'
  if (tone === 'yellow') return 'text-[#B36B00]'
  return 'text-[#008E7D]'
}

function getRiskSummary(verdictLabel: string, riskLabel: string) {
  const verdictTone = judgementTone(verdictLabel)
  if (verdictTone === 'red') return { label: '风险高', tone: 'red' }
  if (verdictTone === 'yellow') return { label: '需结合情况', tone: 'yellow' }
  if (/高|警惕|夸大/.test(riskLabel)) return { label: '风险高', tone: 'red' }
  if (/中|条件|争议/.test(riskLabel)) return { label: '需结合情况', tone: 'yellow' }
  return { label: '风险可控', tone: 'green' }
}

function getReferenceSupport(count: number) {
  if (count >= 2) return { label: '较充分', tone: 'green', width: '72%' }
  if (count === 1) return { label: '有限', tone: 'yellow', width: '48%' }
  return { label: '待补充', tone: 'red', width: '28%' }
}

function toEvidenceEntry(evidence: CommunityEvidence): EvidenceEntry {
  return {
    id: evidence.id,
    claim: evidence.summary,
    section: evidence.chapter,
    strength: '指南推荐',
    topics: [],
    source_doc: evidence.sourceTitle,
    org: evidence.organization,
    year: evidence.year,
    url: evidence.officialUrl || '',
    page: evidence.page,
    evidence_tier: evidence.level === 'guideline' ? '结论' : evidence.level === 'full_text' ? '全文' : '无',
  }
}

function toVerifiedResult(item: CommunityCase, claim: CommunityClaim, index: number): VerifyResult {
  const evidenceIds = index === 0
    ? item.evidence.map((entry) => entry.id)
    : index === 1
      ? item.evidence.slice(0, 1).map((entry) => entry.id)
      : index === 2
        ? item.evidence.slice(1, 2).map((entry) => entry.id)
        : item.evidence.map((entry) => entry.id)

  return {
    verdict: claim.verdict,
    risk_level: claim.risk.replace('风险', ''),
    confidence: '高',
    strength: '高',
    correction: claim.correction,
    cited_evidence_ids: evidenceIds,
    evidence: item.evidence.map(toEvidenceEntry),
    evidence_status: 'matched',
    evidence_tier: '结论',
    claim: claim.claim,
    topic: item.topic,
    video_refs: [{ id: 1, time: claim.time }],
  }
}

function toSingleSample(item: CommunityCase): SingleSampleData {
  return {
    topic: item.topic,
    reference: {
      id: 1,
      author: item.video.sourceName,
      title: item.title,
      url: '',
    },
    keyframes: item.video.timepoints.slice(0, 1).map((time) => ({
      time,
      screen_text: item.video.coverLabel,
    })),
    claims: item.claims.map((claim) => ({
      claim: claim.claim,
      video_refs: [{ id: 1, time: claim.time }],
      signal: claim.signal,
      why: '该说法已在官方案例入库时完成拆解，适合结合已保存的权威证据继续核验。',
    })),
    sample_verify_results: item.claims.map((claim, index) => toVerifiedResult(item, claim, index)),
  }
}

function timeToSeconds(value: string) {
  const parts = value.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) return parts[0] * 60 + parts[1]
  if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function findClaimByTime(item: CommunityCase, time: number) {
  return item.claims.find((claim) => timeToSeconds(claim.time) === time) || item.claims[0]
}

function findKeyframeByTime(item: CommunityCase, time?: number) {
  if (time === undefined) return undefined
  return item.video.keyframes?.find((frame) => frame.time === time)
}

function CommunityCover({ item, large = false, selectedTime, activeClaim, className, enableSourceLink = false, onOpenSource }: { item: CommunityCase; large?: boolean; selectedTime?: number; activeClaim?: CommunityClaim; className?: string; enableSourceLink?: boolean; onOpenSource?: () => void }) {
  const keyframe = findKeyframeByTime(item, selectedTime)
  const frameText = keyframe?.screenText || activeClaim?.claim || item.video.coverLabel
  const frameImage = keyframe?.imageUrl || keyframe?.image || item.video.coverImage
  const timeLabel = large && selectedTime !== undefined ? formatTime(selectedTime) : formatTime(item.video.duration)
  const content = (
    <>
      {frameImage ? (
        <img src={frameImage} alt={`视频 ${formatTime(keyframe?.time ?? selectedTime ?? item.video.duration)} 关键帧`} className="h-full w-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(13,148,136,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(13,148,136,.12) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.92)_0,rgba(255,255,255,0.72)_19%,transparent_20%),linear-gradient(135deg,#E5F8F4_0%,#CFF1EA_100%)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`flex items-center justify-center rounded-full border border-white/75 bg-white/55 shadow-sm ${large ? 'h-[88px] w-[88px] text-[44px]' : 'h-11 w-11 text-2xl'}`} aria-hidden>{item.video.coverEmoji || '🥚'}</div>
          </div>
        </>
      )}
      {large && <p className="absolute left-3 top-3 flex h-6 items-center rounded-[8px] bg-[#008E7D]/90 px-2.5 text-[10px] font-bold text-white shadow-sm">视频关键帧</p>}
      <span className="absolute bottom-2 right-2 flex h-[19px] items-center rounded-md bg-[#18322E]/85 px-1.5 text-[9px] font-medium leading-none text-white">{timeLabel}</span>
    </>
  )
  return (
    enableSourceLink ? (
      <button type="button" onClick={onOpenSource} aria-label={`打开原视频 ${timeLabel} 位置`} title="打开原视频对应时间点" className={`relative block overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.92)_0,rgba(255,255,255,0.72)_19%,transparent_20%),linear-gradient(135deg,#E5F8F4_0%,#CFF1EA_100%)] text-left transition active:opacity-85 ${large ? 'aspect-[16/6] w-full rounded-[15px]' : className ?? 'h-[76px] w-[98px] shrink-0 rounded-[16px]'}`}>{content}</button>
    ) : (
      <div className={`relative overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.92)_0,rgba(255,255,255,0.72)_19%,transparent_20%),linear-gradient(135deg,#E5F8F4_0%,#CFF1EA_100%)] ${large ? 'aspect-[16/6] w-full rounded-[15px]' : className ?? 'h-[76px] w-[98px] shrink-0 rounded-[16px]'}`}>{content}</div>
    )
  )
}

function InlineCitation({ index, onClick }: { index: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="relative -top-[3px] ml-1 whitespace-nowrap text-[9px] font-semibold leading-none text-[#008E7D]">
      [{index}]
    </button>
  )
}

export default function CommunityTab({ onOpenVerifiedCase }: CommunityTabProps) {
  const [view, setView] = useState<CommunityView>('feed')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(communitySamples[0]?.caseId ?? null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [feedMode, setFeedMode] = useState<FeedMode>('featured')
  const [selectedTime, setSelectedTime] = useState(communitySamples[0]?.video.timepoints[0] ?? 0)
  const [referencesOpen, setReferencesOpen] = useState(false)
  const [highlightEvidenceIndex, setHighlightEvidenceIndex] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [interactions, setInteractions] = useState<InteractionState>({ helped: [], collected: [] })

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(interactionKey)
      if (saved) setInteractions(JSON.parse(saved) as InteractionState)
    } catch {
      // Local interaction state is optional; the community remains usable without it.
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 1800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const selectedCase = communitySamples.find((item) => item.caseId === selectedCaseId) ?? communitySamples[0]
  const filteredCases = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const filtered = communitySamples.filter((item) => {
      const categoryMatch = category === '全部' || item.categoryIds.includes(category)
      const searchText = [item.title, item.originalClaim, item.verdict.label, item.correctedExpression, ...item.categoryIds, ...item.evidence.map((e) => e.sourceTitle)].join(' ').toLowerCase()
      return categoryMatch && (!keyword || searchText.includes(keyword))
    })
    return feedMode === 'latest' ? [...filtered].sort((a, b) => b.publishTime.localeCompare(a.publishTime)) : filtered
  }, [category, feedMode, query])

  function persistInteractions(next: InteractionState) {
    setInteractions(next)
    try {
      window.localStorage.setItem(interactionKey, JSON.stringify(next))
    } catch {
      // Ignore storage restrictions; the current session still reflects the action.
    }
  }

  function toggleInteraction(kind: keyof InteractionState, caseId: string) {
    const active = interactions[kind].includes(caseId)
    persistInteractions({ ...interactions, [kind]: active ? interactions[kind].filter((id) => id !== caseId) : [...interactions[kind], caseId] })
    setToast(kind === 'helped' ? (active ? '已取消“有帮助”' : '感谢你的反馈') : (active ? '已取消收藏' : '已收藏到本机'))
  }

  async function shareCase(item: CommunityCase) {
    const text = `${item.title}\nFitProof 核验：${item.verdict.label}\n${item.correctedExpression}`
    try {
      if (navigator.share) await navigator.share({ title: item.title, text })
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setToast('案例摘要已复制')
      } else setToast('当前浏览器暂不支持分享')
    } catch {
      // Closing the native share sheet is not an error the user needs to see.
    }
  }

  function openDetail(item: CommunityCase) {
    setSelectedCaseId(item.caseId)
    setSelectedTime(item.video.timepoints[0] ?? 0)
    setView('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openPrecomputed() {
    onOpenVerifiedCase(toSingleSample(selectedCase))
  }

  function openOriginalVideoAtSelectedTime() {
    const keyframe = findKeyframeByTime(selectedCase, selectedTime)
    const sourceUrl = keyframe?.sourceUrl || selectedCase.video.sourceUrl
    if (!sourceUrl) {
      setToast('暂未接入原视频链接')
      return
    }
    window.open(buildVideoUrlWithTime(sourceUrl, selectedTime), '_blank', 'noreferrer')
  }

  function evidenceLabel(ids?: string[]) {
    const matched = (ids || []).map((id) => selectedCase.evidence.find((item) => item.id === id)).filter(Boolean) as CommunityEvidence[]
    if (matched.length === 0) return '依据：本案例核验报告与权威知识库'
    return `依据：${matched.map((item) => `${item.sourceTitle}${item.page ? ` p.${item.page}` : ''}`).join('；')}`
  }

  if (!selectedCase) return null

  if (view === 'detail') {
    const activeClaim = findClaimByTime(selectedCase, selectedTime)
    const firstEvidence = selectedCase.evidence[0]
    const legacyNotes = selectedCase.discussion || []
    const reportNotes = selectedCase.reportNotes || {
      detailExplanation: legacyNotes[0]?.content,
      scopeAndExceptions: legacyNotes[1]?.content,
      evidenceIds: [...(legacyNotes[0]?.evidenceIds || []), ...(legacyNotes[1]?.evidenceIds || [])],
    }
    const detailNote = reportNotes.detailExplanation || selectedCase.verdict.summary
    const caveatNote = reportNotes.scopeAndExceptions || selectedCase.correctedExpression
    const evidenceCount = selectedCase.evidence.length
    const verdictLabel = activeClaim?.verdict || selectedCase.verdict.label
    const verdictTone = judgementTone(verdictLabel)
    const riskSummary = getRiskSummary(verdictLabel, activeClaim?.risk || selectedCase.risk.label)
    const activeReferenceCount = Math.min(evidenceCount, selectedCase.evidence[1] ? 2 : firstEvidence ? 1 : 0)
    const referenceSupport = getReferenceSupport(activeReferenceCount)
    const openReferences = (index: number) => {
      setReferencesOpen(true)
      setHighlightEvidenceIndex(index)
      window.setTimeout(() => document.getElementById(`community-reference-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      window.setTimeout(() => setHighlightEvidenceIndex((current) => current === index ? null : current), 1200)
    }
    const citation = (index: number) => <InlineCitation index={index} onClick={() => openReferences(index)} />
    return (
      <main className="min-h-[calc(100dvh-4rem)] bg-[#F3F7F6] pb-24 text-[#0B1F1B] antialiased" style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","HarmonyOS Sans SC",MiSans,"Noto Sans SC","Microsoft YaHei",sans-serif', textRendering: 'optimizeLegibility' }}>
        <div className="mx-auto max-w-[430px]">
          <header className="sticky top-0 z-30 grid h-14 grid-cols-[44px_1fr_44px] items-center border-b border-[#E7EEEC] bg-white/95 px-3 backdrop-blur">
            <button type="button" onClick={() => setView('feed')} className="flex h-11 w-11 items-center justify-center rounded-full text-[#176E64]" aria-label="返回社区"><Icon name="back" className="h-5 w-5" /></button>
            <h1 className="text-center text-[14px] font-bold leading-5 text-[#0B1F1B]">案例详情</h1>
            <button type="button" onClick={() => void shareCase(selectedCase)} className="flex h-11 w-11 items-center justify-center rounded-full text-[#087F72]" aria-label="分享案例"><Icon name="share" className="h-5 w-5" /></button>
          </header>

          <article className="m-3 rounded-[22px] border border-[#E4ECE9] bg-white px-4 pb-5 pt-2.5 shadow-[0_8px_22px_rgba(15,48,42,0.055)] max-[370px]:m-2.5 max-[370px]:px-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex h-6 items-center gap-[4px] rounded-full bg-[#EAF7F4] px-2 text-[10px] font-semibold text-[#008E7D]"><Icon name="shield" className="h-[12px] w-[12px]" />{selectedCase.publisher.displayName}</span>
              <span className="shrink-0 text-[9px] leading-[14px] text-[#87938F]">{selectedCase.publishTime}</span>
            </div>

            <h2 className="mt-2 text-[18px] font-bold leading-[24px] tracking-[-0.2px] text-[#071F1B] break-words">{selectedCase.title}</h2>

            <div className="mt-2"><CommunityCover item={selectedCase} large selectedTime={selectedTime} activeClaim={activeClaim} enableSourceLink onOpenSource={openOriginalVideoAtSelectedTime} /></div>

            <div className="mt-1 flex items-center justify-between gap-3 text-[10px] leading-4">
              <span className="min-w-0 truncate text-[#74827E]">视频出处：{selectedCase.video.sourceName}</span>
              <button type="button" onClick={openOriginalVideoAtSelectedTime} className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#008E7D]">关键时间 {formatTime(selectedTime)}<Icon name="arrow" className="h-3 w-3" /></button>
            </div>

            <div className="mt-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              <div className="flex w-max min-w-full justify-center gap-3.5 max-[360px]:gap-2.5">
                {selectedCase.video.timepoints.map((time) => <button key={time} type="button" onClick={() => setSelectedTime(time)} className={`h-7 min-w-[56px] shrink-0 rounded-full px-3 text-[10px] font-semibold ${selectedTime === time ? 'bg-[#079989] text-white' : 'bg-[#EEF3F2] text-[#65736F]'}`}>{formatTime(time)}</button>)}
              </div>
            </div>

            <section id="community-verification" className="mt-2 border-t border-[#DDEBE8] pt-2">
              <div>
                <p className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-[#008E7D]"><span className="h-[27px] w-1 shrink-0 rounded-full bg-[#0AA58F]" />{formatTime(selectedTime)} · 节点判读</p>

                <div className="mt-2 rounded-r-[11px] border-l-[3px] border-[#0BAE9A] bg-[#F1F9F7] px-3 pb-[10px] pt-[9px]">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-semibold leading-4 text-[#008E7D]"><Icon name="check" className="h-[11px] w-[11px] shrink-0" />更准确结论</h4>
                  <p className="mt-1 break-words text-[12px] font-medium leading-[19px] tracking-normal text-[#17312C]">{activeClaim?.correction || selectedCase.correctedExpression}{firstEvidence && citation(1)}{selectedCase.evidence[1] && citation(2)}</p>
                </div>

                <div className="mt-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold leading-4 text-[#687773]"><span className="h-[3px] w-[11px] shrink-0 rounded-full bg-[#58A79C]" />视频原话</p>
                  <h3 className="mt-1 break-words pl-[17px] text-[12px] font-normal leading-[19px] tracking-normal text-[#334640]">“{activeClaim?.claim || selectedCase.originalClaim}”</h3>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-y border-solid border-[#DCEBE7] py-2.5">
                <div className="flex min-w-0 flex-col items-center text-center">
                  <p className="flex min-h-[15px] items-center justify-center gap-1 text-[9.5px] font-normal leading-[14px] text-[#73817D]"><Icon name="shield" className="h-3 w-3 shrink-0 text-[#0F766E]" />判定</p>
                  <p className={`mt-1 text-[10.5px] font-semibold leading-4 ${toneTextClass(verdictTone)}`}>{verdictLabel}</p>
                </div>
                <div className="flex min-w-0 flex-col items-center text-center">
                  <p className="flex min-h-[15px] items-center justify-center gap-1 text-[9.5px] font-normal leading-[14px] text-[#73817D]"><Icon name="alert" className="h-3 w-3 shrink-0 text-[#0F766E]" />误导风险</p>
                  <p className={`mt-1 text-[10.5px] font-semibold leading-4 ${toneTextClass(riskSummary.tone)}`}>{riskSummary.label}</p>
                </div>
                <div className="flex min-w-0 flex-col items-center text-center">
                  <p className="flex min-h-[15px] items-center justify-center gap-1 text-[9.5px] font-normal leading-[14px] text-[#73817D]"><Icon name="book" className="h-3 w-3 shrink-0 text-[#0F766E]" />引用依据</p>
                  <div className="mt-2 h-1 w-[78%] overflow-hidden rounded-full bg-[#D9EBE6]"><div className="h-full rounded-full bg-[#0DA896]" style={{ width: referenceSupport.width }} /></div>
                </div>
              </div>

              <div className="border-b border-[#E4EEEB] py-2">
                <h3 className="flex items-center gap-1.5 text-[11px] font-bold leading-4 text-[#0B1F1B]"><Icon name="bulb" className="h-[11px] w-[11px] text-[#0F766E]" />判断依据</h3>
                <p className="mt-1.5 text-[10.5px] font-normal leading-[18px] text-[#465550]">{detailNote}{firstEvidence && citation(1)}</p>
              </div>
            </section>

            <section className="border-b border-[#E4EEEB] py-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold leading-4 text-[#008E7D]"><Icon name="user" className="h-[11px] w-[11px]" />适用范围与例外</h3>
              <p className="mt-1.5 text-[10.5px] font-normal leading-[18px] text-[#465550]">{caveatNote}{selectedCase.evidence[1] && citation(2)}</p>
            </section>

            <section id="community-references" className="pt-2">
              <button type="button" onClick={() => setReferencesOpen((open) => !open)} className="flex h-11 w-full items-center justify-between rounded-[12px] border border-[#DDE9E6] px-3 text-left text-[12px] font-bold text-[#0B1F1B]">
                <span className="flex items-center gap-1.5"><Icon name="book" className="h-[16px] w-[16px] text-[#0F766E]" />参考文献 · {evidenceCount}篇</span>
                <Icon name="arrow" className={`h-4 w-4 text-[#526966] transition-transform ${referencesOpen ? 'rotate-90' : ''}`} />
              </button>
              {referencesOpen && (
                <div className="space-y-2 py-3 text-[10px] leading-[17px] text-[#667570]">
                  {selectedCase.evidence.map((evidence, index) => evidence.officialUrl ? (
                    <a id={`community-reference-${index + 1}`} key={evidence.id} href={evidence.officialUrl} target="_blank" rel="noreferrer" className={`block rounded-md px-1.5 py-1 text-left underline-offset-2 transition-colors hover:underline ${highlightEvidenceIndex === index + 1 ? 'bg-[#EAF7F4] text-[#087F72]' : ''}`}>[{index + 1}] {evidence.sourceTitle}。支持内容：{evidence.summary}</a>
                  ) : (
                    <p id={`community-reference-${index + 1}`} key={evidence.id} className={`rounded-md px-1.5 py-1 transition-colors ${highlightEvidenceIndex === index + 1 ? 'bg-[#EAF7F4] text-[#087F72]' : ''}`}>[{index + 1}] {evidence.sourceTitle}。支持内容：{evidence.summary}</p>
                  ))}
                </div>
              )}
            </section>

            <p className="mt-2 text-center text-[9px] leading-[15px] text-[#98A39F]">内容仅用于健康信息核验，不能替代专业医疗建议。如有不适或特殊健康情况，请及时咨询专业医务人员。</p>
          </article>
        </div>

        <div className="fixed inset-x-0 bottom-16 z-40 bg-gradient-to-t from-[#F3F7F6] via-[#F3F7F6]/95 to-[#F3F7F6]/0 px-4 pb-3 pt-5">
          <div className="mx-auto max-w-[430px]">
            <button type="button" onClick={openPrecomputed} className="flex h-11 w-full items-center justify-center rounded-full bg-[#079989] px-4 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(7,153,137,0.20)] active:bg-[#087F72]">
              用 FitProof 核验这条视频
            </button>
          </div>
        </div>

        {toast && <Toast text={toast} />}
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#F5F8F7] px-3 pb-24 pt-5 text-[#182321] max-[360px]:px-0">
      <div className="mx-auto max-w-2xl">
        <header className="text-center"><h1 className="text-2xl font-semibold">社区</h1><p className="mt-1 text-sm text-[#71807C]">每一次核验，都会成为下一次判断的依据</p></header>

        <div className="mt-5 flex h-11 items-center gap-2 rounded-full bg-[#EEF3F2] px-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0D9488]/30"><Icon name="search" className="h-5 w-5 text-[#78908B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索健康说法或话题" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8B9894]" />{query && <button type="button" onClick={() => setQuery('')} className="text-xs font-medium text-[#087A72]">取消</button>}</div>

        <div className="-mx-3 mt-4 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] max-[360px]:mx-0 max-[360px]:px-0">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`h-8 shrink-0 rounded-full border px-3 text-xs font-medium ${category === item ? 'border-[#BFE7DE] bg-[#E5F6F2] text-[#087A72]' : 'border-[#E2ECE9] bg-white text-[#66736F]'}`}>{item}</button>)}</div>

        <div className="mt-5 grid grid-cols-2 border-b border-[#E1EAE8]">{([{ id: 'featured', label: '官方精选' }, { id: 'latest', label: '最新核验' }] as const).map((item) => <button key={item.id} type="button" onClick={() => setFeedMode(item.id)} className={`relative pb-3 text-sm ${feedMode === item.id ? 'font-semibold text-[#087A72]' : 'text-[#71807C]'}`}>{item.label}{feedMode === item.id && <span className="absolute bottom-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-[#0D9488]" />}</button>)}</div>

        {filteredCases.length === 0 ? (
          <section className="mt-5 rounded-3xl border border-[#E5EEEC] bg-white px-5 py-10 text-center shadow-sm"><FitProofCat pose="empty" size={110} className="mx-auto" /><p className="mt-3 font-semibold">还没有找到相关核验案例</p><p className="mt-2 text-sm leading-relaxed text-[#71807C]">换个关键词或分类试试，新的官方案例会在完成审核后出现。</p><button type="button" onClick={() => { setQuery(''); setCategory('全部') }} className="mt-4 rounded-full bg-[#E5F6F2] px-5 py-2.5 text-sm font-semibold text-[#087A72]">查看全部案例</button></section>
        ) : (
          <section className="mt-3 space-y-3">{filteredCases.map((item) => {
            const helped = interactions.helped.includes(item.caseId)
            const collected = interactions.collected.includes(item.caseId)
            const evidenceCount = item.evidence.length
            return <article key={item.caseId} className="mx-0 overflow-hidden rounded-[20px] border border-[rgba(18,54,48,0.06)] bg-white shadow-[0_5px_18px_rgba(18,54,48,0.05)]">
              <button type="button" onClick={() => openDetail(item)} className="group w-full text-left">
                <div className="flex h-[42px] items-center justify-between gap-3 px-3.5">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-[#008D74]"><Icon name="shield" className="h-4 w-4" />{item.publisher.displayName}</span>
                  <span className="text-[12px] font-normal leading-4 text-[#74817E]">{item.publishTime.slice(5)}</span>
                </div>
                <div className="flex gap-3 px-3.5 pb-3 pt-1">
                  <CommunityCover item={item} className="h-[70px] w-[112px] shrink-0 rounded-xl" />
                  <div className="flex h-[70px] min-w-0 flex-1 basis-0 flex-col">
                    <h2 className="truncate text-[16px] font-semibold leading-[22px] text-[#17211F]">{item.title}</h2>
                    <div className="mt-1.5 flex items-center gap-[7px] text-[12.5px] font-semibold leading-[18px] text-[#168466]">
                      <span className="inline-flex items-center gap-1"><Icon name="shield" className="h-[14px] w-[14px]" />{item.verdict.label}</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-[#168466]" />
                      <span>{item.risk.label}</span>
                    </div>
                    <p className="mt-1.5 truncate text-[12.5px] font-normal leading-[18px] text-[#697875]">{item.correctedExpression}</p>
                  </div>
                </div>
                <div className="flex h-[34px] items-center justify-between border-t border-[#E8EFED] px-3.5 transition-colors group-active:bg-[#F7FAF9]">
                  <span className="inline-flex h-full items-center gap-1.5 text-[12px] font-normal leading-none text-[#65736F]"><Icon name="book" className="h-[15px] w-[15px] text-[#008D74]" />权威依据 {evidenceCount} 项</span>
                  <span className="inline-flex h-full items-center gap-1 text-[12px] font-semibold leading-none text-[#008D74]">查看完整核验 <Icon name="arrow" className="h-3 w-3" /></span>
                </div>
              </button>
              <div className="grid h-[38px] grid-cols-3 items-center border-t border-[#E8EFED] text-[12px] font-normal leading-none text-[#53635F]">
                <button type="button" onClick={(event) => { event.stopPropagation(); toggleInteraction('helped', item.caseId) }} className={`flex h-full min-w-0 items-center justify-center gap-1.5 transition-colors active:bg-[#F3F8F6] ${helped ? 'font-semibold text-[#008D74]' : ''}`}><Icon name="heart" className="h-[16px] w-[16px]" />有帮助</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); toggleInteraction('collected', item.caseId) }} className={`flex h-full min-w-0 items-center justify-center gap-1.5 border-x border-[#E8EFED] transition-colors active:bg-[#F3F8F6] ${collected ? 'font-semibold text-[#008D74]' : ''}`}><Icon name="bookmark" className="h-[16px] w-[16px]" />收藏</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); void shareCase(item) }} className="flex h-full min-w-0 items-center justify-center gap-1.5 transition-colors active:bg-[#F3F8F6]"><Icon name="share" className="h-[16px] w-[16px]" />分享</button>
              </div>
            </article>
          })}</section>
        )}
      </div>
      {toast && <Toast text={toast} />}
    </main>
  )
}

function Toast({ text }: { text: string }) {
  return <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#18312C] px-4 py-2 text-xs font-medium text-white shadow-lg">{text}</div>
}
