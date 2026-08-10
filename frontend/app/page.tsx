'use client'

import { useState, type ReactNode } from 'react'
import type { Claim, PageState, SingleAnalyzeRejectedResponse, SingleAnalyzeResponse, SingleSampleData, VerifyResult } from '@/types'
import InputPage from '@/components/InputPage'
import ContentRejectionModal from '@/components/ContentRejectionModal'
import LoadingPage from '@/components/LoadingPage'
import SingleResultPage from '@/components/SingleResultPage'
import { analyzeSingle, analyzeSingleUpload, verifyClaim, verifyClaimStream } from '@/lib/api'
import BottomNav from '@/components/BottomNav'
import KnowledgeTab from '@/components/KnowledgeTab'
import ProfileTab from '@/components/ProfileTab'
import { appendHistory } from '@/lib/history'

// 本地完整版：.env.local 设 NEXT_PUBLIC_API_URL=http://localhost:8000，走 Python 后端（含真实链接分析）
// 云端（Vercel）：不设该变量，走同源的 Next 云函数 /api/*（预置话题 + AI 答疑）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''
type TabId = 'verify' | 'knowledge' | 'profile'

export default function Home() {
  const [pageState, setPageState] = useState<PageState>('input')
  const [topic, setTopic] = useState('')
  const [inputError, setInputError] = useState<string>('')
  const [rejection, setRejection] = useState<SingleAnalyzeRejectedResponse | null>(null)
  const [singleData, setSingleData] = useState<SingleAnalyzeResponse | null>(null)
  const [sampleVerifyResults, setSampleVerifyResults] = useState<VerifyResult[] | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('verify')
  // 加载进度起点：由永不卸载的 Home 持有，切 Tab 再回来进度条能续算而非归零
  const [loadingStartedAt, setLoadingStartedAt] = useState<number>(0)

  async function handleAnalyzeSingle(link: string, topicName: string) {
    setInputError('')
    setRejection(null)
    setTopic(topicName)
    setSingleData(null)
    setSampleVerifyResults(null)
    setLoadingStartedAt(Date.now())
    setPageState('loading')
    try {
      const data = await analyzeSingle(link, topicName)
      if (data.status === 'rejected') {
        setRejection(data)
        setPageState('input')
        return
      }
      setSingleData(data)
      setTopic(data.topic || topicName)
      setPageState('singleClaims')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '单视频分析失败，请稍后重试'
      setInputError(msg.includes('不是具体的抖音视频链接')
        ? msg
        : `${msg}。若链接反复失败，可点下方「从相册选择视频」上传本地文件分析。`)
      setPageState('input')
    }
  }

  async function handleAnalyzeUpload(file: File, topicName: string) {
    setInputError('')
    setRejection(null)
    setTopic(topicName)
    setSingleData(null)
    setSampleVerifyResults(null)
    setLoadingStartedAt(Date.now())
    setPageState('loading')
    try {
      const data = await analyzeSingleUpload(file, topicName)
      if (data.status === 'rejected') {
        setRejection(data)
        setPageState('input')
        return
      }
      setSingleData(data)
      setTopic(data.topic || topicName)
      setPageState('singleClaims')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '本地视频分析失败，请稍后重试'
      setInputError(msg)
      setPageState('input')
    }
  }

  function handleSingleSampleLoaded(sample: SingleSampleData) {
    setInputError('')
    setRejection(null)
    setTopic(sample.topic)
    setSingleData({
      status: 'accepted',
      scope: sample.scope || 'explicit_claim',
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

  async function handleVerifySingleClaim(claim: Claim, index: number, onStep?: (step: { label: string; detail?: string; tone?: 'ok' | 'warn'; sources?: string[] }) => void, onResult?: (result: VerifyResult) => void): Promise<VerifyResult> {
    const sampleResult = sampleVerifyResults?.[index]
    try {
      const result = sampleResult || await verifyClaimStream(claim.claim, topic, claim.video_refs, 5, onStep, onResult).catch(() => verifyClaim(claim.claim, topic, claim.video_refs, 5))
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

  async function handleReverifySingleClaim(claim: Claim, index: number, onStep?: (step: { step?: string; label: string; detail?: string; tone?: 'ok' | 'warn'; status?: 'done' | 'working'; sources?: string[] }) => void): Promise<VerifyResult> {
    try {
      const result = await verifyClaimStream(claim.claim, topic, claim.video_refs, 5, onStep)
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
      throw new Error(e instanceof Error ? e.message : `第 ${index + 1} 条观点核验失败，请重试`)
    }
  }

  function renderVerifyContent(): ReactNode {
    if (pageState === 'loading') return <LoadingPage topic={topic} mode="single" startedAt={loadingStartedAt} />
    if (pageState === 'singleClaims' && singleData) {
      return <SingleResultPage data={singleData} topic={topic} onBack={() => setPageState('input')} onVerifyClaim={handleVerifySingleClaim} onReverifyClaim={handleReverifySingleClaim} />
    }
    return <InputPage apiBaseUrl={API_BASE_URL} onAnalyzeSingle={handleAnalyzeSingle} onAnalyzeUpload={handleAnalyzeUpload} onSingleSampleLoaded={handleSingleSampleLoaded} initialError={inputError} />
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-white">
      <div className="pb-[var(--bottom-app-inset)]">
        {activeTab === 'verify' ? renderVerifyContent()
          : activeTab === 'knowledge' ? <KnowledgeTab />
          : <ProfileTab />}
      </div>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      {rejection && <ContentRejectionModal result={rejection} onClose={() => setRejection(null)} />}
    </div>
  )
}
