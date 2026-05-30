'use client'

import { useState } from 'react'
import type { Analysis, ChatMessage, PageState } from '@/types'
import InputPage from '@/components/InputPage'
import LoadingPage from '@/components/LoadingPage'
import ResultPage from '@/components/ResultPage'
import RefsPage from '@/components/RefsPage'

// 本地完整版：.env.local 设 NEXT_PUBLIC_API_URL=http://localhost:8000，走 Python 后端（含真实链接分析）
// 云端（Vercel）：不设该变量，走同源的 Next 云函数 /api/*（预置话题 + AI 答疑）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

export default function Home() {
  const [pageState, setPageState] = useState<PageState>('input')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [topic, setTopic] = useState('')
  const [refsFocusId, setRefsFocusId] = useState<number | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [inputError, setInputError] = useState<string>('')

  async function handleAnalyze(links: string[], topicName: string) {
    setInputError('')
    setTopic(topicName)
    setHistory([])
    setPageState('loading')
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
    // 短暂展示加载页，模拟完整 AI 分析过程
    setTimeout(() => setPageState('result'), 1800)
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

  return (
    <InputPage
      apiBaseUrl={API_BASE_URL}
      onAnalyze={handleAnalyze}
      onPresetLoaded={handlePresetLoaded}
      initialError={inputError}
    />
  )
}
