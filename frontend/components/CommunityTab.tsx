'use client'

import { useState } from 'react'
import communitySamplesJson from '@/data/community-samples.json'
import VerifyResultCard from '@/components/VerifyResultCard'
import type { VerifyResult } from '@/types'

interface CommunitySample {
  id: string
  hook: string
  claim: string
  signal: string
  topic: string
  reference: { author: string; title: string; url: string }
  result: VerifyResult
}

const communitySamples = communitySamplesJson as CommunitySample[]

function signalClass(signal: string) {
  if (signal === '较公认') return 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]'
  if (signal === '疑似夸大') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function riskClass(level: string) {
  if (/高|误导/.test(level)) return 'border-amber-200 bg-amber-50 text-amber-700'
  if (/中|需|条件/.test(level)) return 'border-slate-200 bg-slate-50 text-slate-600'
  return 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]'
}

export default function CommunityTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f7fffd] px-4 py-5 pb-24 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">FitProof 社区</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">社区精选</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">大家都在核验什么。每一条都保留了原始主张与可追溯依据。</p>
        </header>

        {communitySamples.length === 0 ? (
          <section className="rounded-3xl border border-[#20CDB6]/20 bg-white px-5 py-12 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E7FAF6] text-[#0B6E63]">✓</div>
            <p className="mt-4 font-semibold text-slate-900">精选核验正在整理</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">很快会有来自真实核验的案例在这里出现。</p>
          </section>
        ) : (
          <section className="space-y-3">
            {communitySamples.map((sample) => {
              const expanded = expandedId === sample.id
              return (
                <article key={sample.id} className="rounded-3xl border border-[#20CDB6]/15 bg-white p-4 shadow-sm">
                  <button type="button" onClick={() => setExpandedId(expanded ? null : sample.id)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${signalClass(sample.signal)}`}>{sample.signal}</span>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${riskClass(sample.result.risk_level)}`}>{sample.result.risk_level}风险</span>
                    </div>
                    <h2 className="mt-3 text-[17px] font-semibold leading-relaxed text-slate-950">{sample.hook}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">“{sample.claim}”</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-500">{sample.topic}</span>
                      <span className="shrink-0 font-medium text-[#0B6E63]">{sample.result.verdict} {expanded ? '⌃' : '›'}</span>
                    </div>
                  </button>
                  {expanded && <div className="mt-5 border-t border-[#D8F0EC] pt-5"><VerifyResultCard result={sample.result} /></div>}
                </article>
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
