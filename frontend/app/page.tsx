'use client'

import { useState, type ReactNode } from 'react'
import type { Analysis, ChatMessage, Claim, PageState, SingleAnalyzeResponse, SingleSampleData, VerifyResult } from '@/types'
import InputPage from '@/components/InputPage'
import LoadingPage from '@/components/LoadingPage'
import ResultPage from '@/components/ResultPage'
import RefsPage from '@/components/RefsPage'
import SingleResultPage from '@/components/SingleResultPage'
import { analyzeSingle, verifyClaim } from '@/lib/api'
import BottomNav from '@/components/BottomNav'
import CommunityTab from '@/components/CommunityTab'
import ProfileTab from '@/components/ProfileTab'
import { appendHistory } from '@/lib/history'

// 本地完整版：.env.local 设 NEXT_PUBLIC_API_URL=http://localhost:8000，走 Python 后端（含真实链接分析）
// 云端（Vercel）：不设该变量，走同源的 Next 云函数 /api/*（预置话题 + AI 答疑）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''
const MIN_LOADING_MS = 5600
type TabId = 'verify' | 'community' | 'profile'

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
  const [sampleVerifyResults, setSampleVerifyResults] = useState<VerifyResult[] | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('verify')

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
    setTopic(topicName)
    setHistory([])
    setSingleData(null)
    setSampleVerifyResults(null)
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
    setTopic(sample.topic)
    setHistory([])
    setSingleData({
      reference: sample.reference,
      claims: sample.claims,
      keyframes: sample.keyframes,
      topic: sample.topic,
    })
    setSampleVerifyResults(
      sample.sample_verify_results ||
        (sample.sample_verify_result ? [sample.sample_verify_result] : []),
    )
    setPageState('singleClaims')
  }

  async function handleVerifySingleClaim(claim: Claim, index: number): Promise<VerifyResult> {
    const sampleResult = sampleVerifyResults?.[index]
    try {
      const result = sampleResult || await verifyClaim(claim.claim, topic, claim.video_refs, 5)
      if (singleData) {
        appendHistory({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          claim: claim.claim,
          signal: claim.signal,
          topic,
          reference: {
            author: singleData.reference.author,
            title: singleData.reference.title,
            url: singleData.reference.url,
          },
          result,
          createdAt: new Date().toISOString(),
        })
      }
      return result
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '核验失败，请重试')
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

  function renderVerifyContent(): ReactNode {
    if (pageState === 'loading') return <LoadingPage topic={topic} />
    if (pageState === 'result' && analysis) {
      return <ResultPage analysis={analysis} topic={topic} history={history} onFollowup={handleFollowup} onViewRefs={viewRefs} onBack={() => setPageState('input')} />
    }
    if (pageState === 'refs' && analysis) {
      return <RefsPage references={analysis.references} authorities={analysis.authorities} topic={topic} focusId={refsFocusId} onBack={() => setPageState('result')} />
    }
    if (pageState === 'singleClaims' && singleData) {
      return <SingleResultPage data={singleData} topic={topic} onBack={() => setPageState('input')} onVerifyClaim={handleVerifySingleClaim} />
    }
    return <InputPage apiBaseUrl={API_BASE_URL} onAnalyze={handleAnalyze} onPresetLoaded={handlePresetLoaded} onAnalyzeSingle={handleAnalyzeSingle} onSingleSampleLoaded={handleSingleSampleLoaded} initialError={inputError} />
  }

  return (
    <div className="min-h-[100dvh] bg-white">
      <div className="pb-16">
        {activeTab === 'verify' ? renderVerifyContent() : activeTab === 'community' ? <CommunityTab /> : <ProfileTab />}
      </div>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  )
}
