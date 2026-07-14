'use client'

import { useState } from 'react'
import type { Claim, EvidenceEntry, SingleAnalyzeResponse, VerifyResult } from '@/types'
import { citedEvidence, isEvidenceDowngraded } from '@/lib/single'

interface SingleResultPageProps {
  data: SingleAnalyzeResponse
  topic: string
  onBack: () => void
  onVerifyClaim: (claim: Claim, index: number) => Promise<VerifyResult>
}

interface DrawerData {
  title: string
  evidence: EvidenceEntry
}

function signalClass(signal: string) {
  if (signal === '较公认') return 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]'
  if (signal === '疑似夸大') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function levelClass(level: string) {
  if (/高|可信|低风险/.test(level)) return 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]'
  if (/中|需|条件/.test(level)) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className={`rounded-2xl border px-3 py-2 ${levelClass(value)}`}>
      <p className="text-[11px] opacity-75">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-none">{value || '待定'}</p>
    </div>
  )
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
  const [drawer, setDrawer] = useState<DrawerData | null>(null)

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

  const supportEvidence = citedEvidence(result)
  const downgraded = isEvidenceDowngraded(result)

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

            {result && !loading && (
              <div className="mt-5 space-y-4">
                <div className="rounded-3xl border border-[#20CDB6]/20 bg-[#f3fbf9] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B6E63]">FitProof 判定</p>
                  <p className="mt-2 text-2xl font-bold leading-snug text-slate-950">{result.verdict}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <MetricPill label="误导风险" value={result.risk_level} />
                    <MetricPill label="可信度" value={result.confidence} />
                    <MetricPill label="依据强度" value={result.strength} />
                  </div>
                </div>

                <div className="rounded-3xl border border-[#20CDB6]/15 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B6E63]">更准确的说法</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{result.correction}</p>
                </div>

                <div className="rounded-3xl border border-[#20CDB6]/15 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">模型采纳的依据</p>
                    <span className="rounded-full bg-[#f3fbf9] px-2.5 py-1 text-xs font-semibold text-[#0B6E63]">
                      {supportEvidence.length} 条
                    </span>
                  </div>

                  {downgraded ? (
                    <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
                      未命中已收录权威依据，以下为 AI 常识判断。当前结果不伪装成有指南支撑。
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {supportEvidence.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setDrawer({ title: item.id, evidence: item })}
                          className="w-full rounded-2xl border border-[#20CDB6]/15 bg-[#f3fbf9] p-4 text-left transition hover:border-[#20CDB6] hover:bg-white"
                        >
                          <p className="text-xs font-semibold text-[#0B6E63]">{item.id}</p>
                          <p className="mt-1 text-sm font-medium leading-relaxed text-slate-900">{item.claim}</p>
                          <p className="mt-2 text-xs leading-relaxed text-slate-500">
                            {item.source_doc}
                            {item.page ? ` · ${item.page}` : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 animate-fadeIn bg-black/40" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slideUp relative z-50 max-h-[72vh] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-5"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <p className="mb-3 text-sm font-semibold text-slate-900">权威依据 · {drawer.title}</p>
            <div className="rounded-2xl bg-[#f3fbf9] px-4 py-3">
              <p className="text-[15px] leading-relaxed text-slate-900">{drawer.evidence.claim}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                {drawer.evidence.source_doc}
                {drawer.evidence.org ? ` · ${drawer.evidence.org}` : ''}
                {drawer.evidence.year ? ` · ${drawer.evidence.year}` : ''}
                {drawer.evidence.page ? ` · 页码 ${drawer.evidence.page}` : ''}
              </p>
              {drawer.evidence.url && (
                <a
                  href={drawer.evidence.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block break-all text-sm font-medium text-[#0B6E63] underline"
                >
                  打开官方来源
                </a>
              )}
            </div>
            <button
              onClick={() => setDrawer(null)}
              className="mt-5 w-full rounded-full bg-slate-100 py-2.5 text-sm font-medium text-slate-600"
            >
              收起
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
