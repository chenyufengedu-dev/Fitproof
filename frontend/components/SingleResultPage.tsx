'use client'

import { useState } from 'react'
import type { Claim, SingleAnalyzeResponse, VerifyResult } from '@/types'
import VerifyResultCard from '@/components/VerifyResultCard'

interface SingleResultPageProps {
  data: SingleAnalyzeResponse
  topic: string
  onBack: () => void
  onVerifyClaim: (claim: Claim, index: number) => Promise<VerifyResult>
}

function signalClass(signal: string) {
  if (signal === '较公认') return 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]'
  if (signal === '疑似夸大') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function SourceLine({ claim }: { claim: Claim }) {
  if (!claim.video_refs || claim.video_refs.length === 0) return null
  return (
    <p className="mt-2 text-xs text-slate-400">
      出处：{claim.video_refs.map((r) => `视频${r.id} · ${r.time}`).join('、')}
    </p>
  )
}

export default function SingleResultPage({ data, topic, onBack, onVerifyClaim }: SingleResultPageProps) {
  const [selected, setSelected] = useState<{ claim: Claim; index: number } | null>(null)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function verify(claim: Claim, index: number) {
    setSelected({ claim, index })
    setResult(null)
    setError('')
    setLoading(true)
    try {
      const next = await onVerifyClaim(claim, index)
      setResult(next)
    } catch {
      setError('核验失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  function backToClaims() {
    setSelected(null)
    setResult(null)
    setError('')
    setLoading(false)
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7fffd] px-4 py-5 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={selected ? backToClaims : onBack}
            className="rounded-full border border-[#20CDB6]/20 bg-white px-3 py-1.5 text-sm font-medium text-[#0B6E63] shadow-sm transition hover:border-[#20CDB6]"
          >
            {selected ? '‹ 返回主张' : '‹ 返回输入'}
          </button>
          <div className="min-w-0 rounded-full border border-[#20CDB6]/15 bg-white px-3 py-1 text-sm font-semibold text-[#0B6E63] shadow-sm">
            <span className="mr-1 text-[#20CDB6]">●</span>
            <span className="inline-block max-w-[12rem] truncate align-bottom">{topic || data.topic || '单视频核验'}</span>
          </div>
        </header>

        {!selected && (
          <>
            <section className="rounded-[30px] border border-[#20CDB6]/20 bg-white p-5 shadow-[0_22px_70px_rgba(18,116,103,0.12)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">FitProof 单视频核验</p>
              <h1 className="mt-2 text-2xl font-semibold leading-snug text-slate-950">选择一条想核验的主张</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {data.reference.author} · {data.reference.title}
              </p>
              {data.reference.url && (
                <a
                  href={data.reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all text-xs text-[#0B6E63] underline"
                >
                  {data.reference.url}
                </a>
              )}
            </section>

            <section className="mt-4 space-y-3">
              {data.claims.map((claim, i) => (
                <button
                  key={`${claim.claim}-${i}`}
                  type="button"
                  onClick={() => void verify(claim, i)}
                  className="w-full rounded-[26px] border border-[#20CDB6]/15 bg-white p-4 text-left shadow-sm transition hover:border-[#20CDB6] hover:shadow-[0_16px_45px_rgba(18,116,103,0.12)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${signalClass(claim.signal)}`}>
                      {claim.signal}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">点击核验</span>
                  </div>
                  <p className="mt-3 text-[16px] font-semibold leading-relaxed text-slate-900">{claim.claim}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{claim.why}</p>
                  <SourceLine claim={claim} />
                </button>
              ))}
            </section>
          </>
        )}

        {selected && (
          <section className="rounded-[30px] border border-[#20CDB6]/20 bg-white p-5 shadow-[0_22px_70px_rgba(18,116,103,0.12)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">单条主张核验</p>
            <h1 className="mt-2 text-xl font-semibold leading-relaxed text-slate-950">{selected.claim.claim}</h1>
            <SourceLine claim={selected.claim} />

            {loading && (
              <div className="mt-5 rounded-2xl border border-[#20CDB6]/20 bg-[#f3fbf9] px-4 py-5 text-sm font-medium text-[#0B6E63]">
                正在检索证据并核验…
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {result && !loading && <div className="mt-5"><VerifyResultCard result={result} /></div>}
          </section>
        )}
      </div>
    </main>
  )
}
