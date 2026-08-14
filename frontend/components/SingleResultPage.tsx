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
import StateBlock from '@/components/StateBlock'
import ProfileCard from '@/components/single/ProfileCard'
import OverviewCard from '@/components/single/OverviewCard'
import AuthorityDiagnosisCard from '@/components/single/AuthorityDiagnosisCard'
import ConfrontationCard from '@/components/single/ConfrontationCard'
import SummaryCard from '@/components/single/SummaryCard'
import ActionAdviceCard from '@/components/single/ActionAdviceCard'
import FollowupCard from '@/components/single/FollowupCard'

import {
  ActionPrinciples,
  ActionSectionMarker,
  ClaimIcon,
  ExpandableHighlight,
  LoadingDots,
  SIGNAL_STYLES,
  SINGLE_ACTION_TONES,
  SINGLE_API_BASE,
  STAR_PATH,
  VerdictStamp,
  claimGroupsLabel,
  closestFrame,
  firstTime,
  formatFrameTime,
  isInteractiveTarget,
  overviewSignalClass,
  parseVideoTime,
  proxiedImg,
  resolvedClaimIcon,
  signalClass,
  stampTone,
  summaryVerdictTone,
  videoTimeUrl,
  type DrawerData,
  type FollowupMessage,
  type VerifyState,
  type VerifyStatus,
  type VisualImage,
} from '@/components/single/shared'

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

interface SingleResultPageProps {
  data: SingleAnalyzeResponse
  topic: string
  onBack: () => void
  onVerifyClaim: (claim: Claim, index: number, onStep?: (step: ReasoningStep) => void, onResult?: (result: VerifyResult) => void) => Promise<VerifyResult>
  onReverifyClaim: (claim: Claim, index: number, onStep?: (step: ReasoningStep) => void) => Promise<VerifyResult>
}

type CardDescriptor =
  | { kind: 'profile' }
  | { kind: 'overview' }
  | { kind: 'actions' }
  | { kind: 'summary' }
  | { kind: 'followup' }

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
    if (!claim) return Promise.reject(new Error('这条说法不存在'))

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
    // 首次打开真实重跑流式核验；成功后该说法改为静态直出最新结果。
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
        subtitle={card.kind === 'profile' ? '来自抖音的单条视频' : card.kind === 'overview' ? '点击你感兴趣的说法进行核验' : undefined}
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
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/75 px-3 text-[13px] font-medium text-[#0B6E63] shadow-sm backdrop-blur transition hover:bg-[#20CDB6] hover:text-[#06403A] disabled:opacity-50"
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
              <button type="button" onClick={() => setDrawer(null)} aria-label="关闭" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg></button>
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
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] leading-4 text-slate-600">
                        <span className="rounded-md bg-slate-50 px-1.5 py-0.5">{evidence.org || '来源机构未标注'}</span>
                        <span className="rounded-md bg-slate-50 px-1.5 py-0.5">{evidence.year || '年份未标注'}</span>
                        <span className="rounded-md bg-slate-50 px-1.5 py-0.5">{evidence.page ? `P.${evidence.page}` : '页码未标注'}</span>
                        <span className="rounded-md bg-[#EAF9F6] px-1.5 py-0.5 font-semibold text-[#0B6E63]">{documentType}</span>
                      </span>
                      <span className="mt-1.5 block truncate rounded-md bg-[#F5F7F9] px-2 py-1 text-[11px] leading-4 text-slate-600">证据摘要：{evidence.claim}</span>
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
                <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{visualImage.screenText}</p>
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
            <VerifyTopBar topic={`说法 ${diagnosticIndex + 1} 诊断报告`} page={0} total={0} hideProgress onBack={() => closeDiagnostic(1)} />
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
              <CourtCardShell label={`说法 ${diagnosticIndex + 1} 诊断报告`} index={diagnosticIndex + 1} hideHeader contentScrollable visualVariant="dual">
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
