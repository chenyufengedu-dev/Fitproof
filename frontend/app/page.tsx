'use client'

import { useState } from 'react'
import type { Analysis, ChatMessage, Claim, PageState, SingleAnalyzeResponse, SingleSampleData, VerifyResult } from '@/types'
import InputPage from '@/components/InputPage'
import LoadingPage from '@/components/LoadingPage'
import ResultPage from '@/components/ResultPage'
import RefsPage from '@/components/RefsPage'
import { analyzeSingle, verifyClaim } from '@/lib/api'
import { citedEvidence, isEvidenceDowngraded } from '@/lib/single'

// 本地完整版：.env.local 设 NEXT_PUBLIC_API_URL=http://localhost:8000，走 Python 后端（含真实链接分析）
// 云端（Vercel）：不设该变量，走同源的 Next 云函数 /api/*（预置话题 + AI 答疑）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''
const MIN_LOADING_MS = 5600

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function Home() {
  const [pageState, setPageState] = useState<PageState>('input')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [topic, setTopic] = useState('')
  const [refsFocusId, setRefsFocusId] = useState<number | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [inputError, setInputError] = useState<string>('')
  const [singleData, setSingleData] = useState<SingleAnalyzeResponse | null>(null)
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [singleError, setSingleError] = useState('')
  const [sampleVerify, setSampleVerify] = useState<{
    claimIndex: number
    result: VerifyResult
  } | null>(null)

  async function handleAnalyze(links: string[], topicName: string) {
    setInputError('')
    setTopic(topicName)
    setHistory([])
    setPageState('loading')
    const loadingStartedAt = Date.now()
    try {
      const res = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links, topic: topicName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || '分析失败，请稍后重试')
      }
      const data: Analysis = await res.json()
      await wait(Math.max(0, MIN_LOADING_MS - (Date.now() - loadingStartedAt)))
      setAnalysis(data)
      setPageState('result')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '分析失败，请改用预置话题体验'
      setInputError(msg)
      setPageState('input')
    }
  }

  function handlePresetLoaded(data: Analysis, topicName: string) {
    setInputError('')
    setTopic(topicName)
    setHistory([])
    setAnalysis(data)
    setPageState('loading')
    // 展示完整的模拟核验流程，避免 demo 中只闪过前几步
    setTimeout(() => setPageState('result'), MIN_LOADING_MS)
  }

  async function handleAnalyzeSingle(link: string, topicName: string) {
    setInputError('')
    setSingleError('')
    setTopic(topicName)
    setHistory([])
    setSingleData(null)
    setSelectedClaim(null)
    setVerifyResult(null)
    setSampleVerify(null)
    setPageState('loading')
    try {
      const data = await analyzeSingle(link, topicName)
      setSingleData(data)
      setTopic(data.topic || topicName)
      setPageState('singleClaims')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '单视频分析失败，请稍后重试'
      setInputError(msg)
      setPageState('input')
    }
  }

  function handleSingleSampleLoaded(sample: SingleSampleData) {
    setInputError('')
    setSingleError('')
    setTopic(sample.topic)
    setHistory([])
    setSingleData({
      reference: sample.reference,
      claims: sample.claims,
      keyframes: sample.keyframes,
      topic: sample.topic,
    })
    setSelectedClaim(null)
    setVerifyResult(null)
    setSampleVerify({
      claimIndex: sample.sample_verified_claim_index,
      result: sample.sample_verify_result,
    })
    setPageState('singleClaims')
  }

  async function handleVerifySingleClaim(claim: Claim, index: number) {
    setSingleError('')
    setSelectedClaim(claim)
    setVerifyResult(null)
    if (sampleVerify && index === sampleVerify.claimIndex) {
      setVerifyResult(sampleVerify.result)
      setPageState('singleVerify')
      return
    }
    setPageState('loading')
    try {
      const result = await verifyClaim(claim.claim, topic, claim.video_refs, 5)
      setVerifyResult(result)
      setPageState('singleVerify')
    } catch (e) {
      setSingleError(e instanceof Error ? e.message : '核验失败，请重试')
      setPageState('singleClaims')
    }
  }

  async function handleFollowup(question: string) {
    if (!analysis) return
    const userMsg: ChatMessage = { role: 'user', content: question }
    const nextHistory = [...history, userMsg]
    setHistory(nextHistory)
    try {
      const res = await fetch(`${API_BASE_URL}/api/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, question, history }),
      })
      if (!res.ok) throw new Error('追问失败，请重试')
      const data: { answer: string } = await res.json()
      setHistory([...nextHistory, { role: 'assistant', content: data.answer }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : '追问失败，请重试'
      setHistory([...nextHistory, { role: 'assistant', content: msg }])
    }
  }

  function viewRefs(focusId?: number) {
    setRefsFocusId(focusId ?? null)
    setPageState('refs')
  }

  if (pageState === 'loading') {
    return <LoadingPage topic={topic} />
  }

  if (pageState === 'result' && analysis) {
    return (
      <ResultPage
        analysis={analysis}
        topic={topic}
        history={history}
        onFollowup={handleFollowup}
        onViewRefs={viewRefs}
        onBack={() => setPageState('input')}
      />
    )
  }

  if (pageState === 'refs' && analysis) {
    return (
      <RefsPage
        references={analysis.references}
        authorities={analysis.authorities}
        topic={topic}
        focusId={refsFocusId}
        onBack={() => setPageState('result')}
      />
    )
  }

  if (pageState === 'singleClaims' && singleData) {
    return (
      <main className="min-h-screen bg-[#f7fffd] px-4 py-6 text-slate-950">
        <div className="mx-auto max-w-2xl">
          <button onClick={() => setPageState('input')} className="mb-4 text-sm text-slate-500 hover:text-slate-900">
            ‹ 返回输入
          </button>
          <div className="rounded-3xl border border-[#20CDB6]/20 bg-white p-5 shadow-[0_18px_50px_rgba(18,116,103,0.12)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#128f80]">单视频主张清单</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">{topic || '单视频核验'}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {singleData.reference.author} · {singleData.reference.title}
            </p>
            {singleData.reference.url && (
              <a
                href={singleData.reference.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block break-all text-xs text-[#128f80] underline"
              >
                {singleData.reference.url}
              </a>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {singleData.claims.map((claim, i) => (
              <button
                key={`${claim.claim}-${i}`}
                type="button"
                onClick={() => void handleVerifySingleClaim(claim, i)}
                className="w-full rounded-3xl border border-[#20CDB6]/15 bg-white p-4 text-left shadow-sm transition hover:border-[#20CDB6] hover:shadow-[0_14px_40px_rgba(18,116,103,0.12)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-[#20CDB6]/10 px-2.5 py-1 text-xs font-semibold text-[#128f80]">
                    {claim.signal}
                  </span>
                  <span className="text-xs text-slate-400">点击核验</span>
                </div>
                <p className="mt-3 text-[16px] font-semibold leading-relaxed text-slate-900">{claim.claim}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{claim.why}</p>
                {claim.video_refs.length > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    出处：{claim.video_refs.map((r) => `视频${r.id} ${r.time}`).join('、')}
                  </p>
                )}
              </button>
            ))}
          </div>
          {singleError && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{singleError}</p>}
        </div>
      </main>
    )
  }

  if (pageState === 'singleVerify' && selectedClaim && verifyResult) {
    const supportEvidence = citedEvidence(verifyResult)
    const downgraded = isEvidenceDowngraded(verifyResult)
    return (
      <main className="min-h-screen bg-[#f7fffd] px-4 py-6 text-slate-950">
        <div className="mx-auto max-w-2xl">
          <button onClick={() => setPageState('singleClaims')} className="mb-4 text-sm text-slate-500 hover:text-slate-900">
            ‹ 返回主张清单
          </button>
          <div className="rounded-3xl border border-[#20CDB6]/20 bg-white p-5 shadow-[0_18px_50px_rgba(18,116,103,0.12)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#128f80]">单条主张核验</p>
            <h1 className="mt-2 text-xl font-semibold leading-relaxed text-slate-950">{selectedClaim.claim}</h1>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-[#20CDB6]/10 p-3">
                <p className="text-xs text-[#128f80]">判定</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{verifyResult.verdict}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-xs text-amber-700">误导风险</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{verifyResult.risk_level}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">依据强度</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{verifyResult.strength}</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[#20CDB6]/15 bg-[#f3fbf9] p-4">
              <p className="text-xs font-semibold text-[#128f80]">更准确的说法</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{verifyResult.correction}</p>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-white bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-slate-900">模型采纳的依据</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                {supportEvidence.length} 条
              </span>
            </div>
            {downgraded ? (
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
                cited_evidence_ids 为空或未命中已收录依据，本次按证据不足/降级结果呈现。
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {supportEvidence.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-[#20CDB6]/15 bg-[#f3fbf9] p-4 transition hover:border-[#20CDB6]"
                  >
                    <p className="text-xs font-semibold text-[#128f80]">{item.id}</p>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-slate-900">{item.claim}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {item.source_doc}
                      {item.page ? ` · ${item.page}` : ''}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <InputPage
      apiBaseUrl={API_BASE_URL}
      onAnalyze={handleAnalyze}
      onPresetLoaded={handlePresetLoaded}
      onAnalyzeSingle={handleAnalyzeSingle}
      onSingleSampleLoaded={handleSingleSampleLoaded}
      initialError={inputError}
    />
  )
}
