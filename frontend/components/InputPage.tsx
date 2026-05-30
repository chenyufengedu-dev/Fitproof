'use client'

import { useState } from 'react'
import type { Analysis, PresetData } from '@/types'

interface InputPageProps {
  apiBaseUrl: string
  onAnalyze: (links: string[], topic: string) => Promise<void>
  onPresetLoaded: (analysis: Analysis, topic: string) => void
  initialError?: string
}

const PRESETS = [
  { id: '1', label: '空腹有氧好不好' },
]

export default function InputPage({
  apiBaseUrl,
  onAnalyze,
  onPresetLoaded,
  initialError,
}: InputPageProps) {
  const [topic, setTopic] = useState('')
  const [linksText, setLinksText] = useState('')
  const [error, setError] = useState(initialError || '')
  const [submitting, setSubmitting] = useState(false)
  const [presetLoading, setPresetLoading] = useState<string | null>(null)

  async function handleSubmit() {
    setError('')
    const links = linksText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (links.length < 2 || links.length > 5) {
      setError('请粘贴 2-5 条抖音视频链接')
      return
    }
    if (!links.every((l) => l.includes('douyin.com'))) {
      setError('每条链接都必须是抖音链接（包含 douyin.com）')
      return
    }

    setSubmitting(true)
    try {
      await onAnalyze(links, topic.trim() || '该话题')
    } finally {
      setSubmitting(false)
    }
  }

  async function loadPreset(id: string, label: string) {
    setError('')
    setPresetLoading(id)
    try {
      const res = await fetch(`${apiBaseUrl}/api/preset/${id}`)
      if (!res.ok) throw new Error('预置话题加载失败')
      const data: PresetData = await res.json()
      onPresetLoaded(data.analysis, data.topic || label)
    } catch (e) {
      setError(e instanceof Error ? e.message : '预置话题加载失败')
    } finally {
      setPresetLoading(null)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,rgba(32,205,182,0.18),transparent_42%),linear-gradient(180deg,#f7fffd_0%,#eef8f6_100%)] px-4 py-8 text-slate-950 sm:px-5 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center">
        <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-[#20CDB6]/25 bg-white/80 px-3 py-1.5 text-xs font-medium text-[#158a7c] shadow-sm">
          <span className="h-2 w-2 rounded-full bg-[#20CDB6]" />
          运动健康争议 · AI 证据校验
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-white bg-white/85 p-6 shadow-[0_24px_80px_rgba(18,116,103,0.16)] backdrop-blur">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border-[18px] border-[#20CDB6]/10" />
          <div className="pointer-events-none absolute right-6 top-6 h-20 w-28 opacity-70">
            <div className="absolute left-2 top-1/2 h-px w-24 -translate-y-1/2 bg-[#20CDB6]/20" />
            <div className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-[#20CDB6]/35 bg-[#20CDB6]/10" />
            <div className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-[#20CDB6]/35 bg-[#20CDB6]/10" />
            <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#20CDB6]/20 bg-white/60">
              <div className="h-8 w-8 rounded-full border border-dashed border-[#20CDB6]/45" />
              <span className="absolute text-sm font-semibold text-[#20CDB6]/70">✓</span>
            </div>
          </div>
          <h1 className="text-6xl font-bold leading-none tracking-tight text-[#13b8a5] drop-shadow-[0_10px_26px_rgba(32,205,182,0.20)] sm:text-7xl">
            FitProof
          </h1>
          <p className="mt-4 text-xl font-semibold text-slate-800">让 AI 替你多看一步</p>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
            对照运动医学指南、专业文献与视频出处，判断相互冲突的运动健康说法是否可靠。
          </p>

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-[#d6b58f] drop-shadow-[0_1px_0_rgba(255,255,255,0.95)]">
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[#e2c39f]">✦</span>
              <span>医学文献依据</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[#e2c39f]">✚</span>
              <span>风险分层提示</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[#e2c39f]">●</span>
              <span>AI多源核验</span>
            </div>
          </div>
        </div>

      <div className="mt-5 space-y-3 rounded-[28px] border border-white bg-white/75 p-4 shadow-[0_16px_60px_rgba(18,116,103,0.10)] backdrop-blur">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="输入运动话题，如：空腹有氧到底好不好"
          className="w-full rounded-2xl border border-[#20CDB6]/20 bg-white px-4 py-3 outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
        />
        <textarea
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
          rows={5}
          placeholder="每行粘贴一条观点相冲突的抖音运动健康视频链接，支持 2-5 条"
          className="w-full resize-none rounded-2xl border border-[#20CDB6]/20 bg-white px-4 py-3 outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-2xl bg-[#20CDB6] px-4 py-3 font-semibold text-white shadow-[0_14px_34px_rgba(32,205,182,0.35)] transition hover:bg-[#19b8a4] disabled:opacity-50"
        >
          {submitting ? '正在核验证据…' : '⌕ 开始核验'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="mt-10">
        <p className="text-sm text-slate-500">
          不知道从哪里开始？点击下方示例话题，先体验一下吧！
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => loadPreset(p.id, p.label)}
              disabled={presetLoading !== null}
              className="rounded-full border border-[#20CDB6]/30 bg-white px-4 py-2 text-sm font-medium text-[#128f80] shadow-sm transition hover:border-[#20CDB6] hover:bg-[#20CDB6] hover:text-white disabled:opacity-50"
            >
              {presetLoading === p.id ? '加载中…' : p.label}
            </button>
          ))}
        </div>
      </div>
      </div>
    </main>
  )
}
