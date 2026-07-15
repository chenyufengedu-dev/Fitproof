'use client'

import { useState } from 'react'
import type { EvidenceEntry, VerifyResult } from '@/types'
import { citedEvidence, evidenceTraceLabel, isEvidenceDowngraded } from '@/lib/single'

interface DrawerData {
  title: string
  evidence: EvidenceEntry
}

interface VerifyResultCardProps {
  result: VerifyResult
  claimTitle?: string
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

export default function VerifyResultCard({ result, claimTitle }: VerifyResultCardProps) {
  const [drawer, setDrawer] = useState<DrawerData | null>(null)
  const supportEvidence = citedEvidence(result)
  const downgraded = isEvidenceDowngraded(result)
  const traceLabel = evidenceTraceLabel(result)

  return (
    <>
      <div className="space-y-4">
        {claimTitle && <h2 className="text-xl font-semibold leading-relaxed text-slate-950">{claimTitle}</h2>}
        <div className="rounded-3xl border border-[#20CDB6]/20 bg-[#f3fbf9] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B6E63]">FitProof 判定</p>
          <p className="mt-2 text-2xl font-bold leading-snug text-slate-950">{result.verdict}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MetricPill label="误导风险" value={result.risk_level} />
            <MetricPill label="可信度" value={result.confidence} />
            <MetricPill label="依据强度" value={result.strength} />
          </div>
          {traceLabel && (
            <p className="mt-3 rounded-2xl border border-[#20CDB6]/15 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#0B6E63]">
              {traceLabel}
            </p>
          )}
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
                    {item.org ? ` · ${item.org}` : ''}
                    {item.strength ? ` · ${item.strength}` : ''}
                    {item.page ? ` · ${item.page}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 animate-fadeIn bg-black/40" />
          <div onClick={(e) => e.stopPropagation()} className="animate-slideUp relative z-50 max-h-[72vh] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-5">
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
              {drawer.evidence.url && <a href={drawer.evidence.url} target="_blank" rel="noreferrer" className="mt-3 inline-block break-all text-sm font-medium text-[#0B6E63] underline">打开官方来源</a>}
            </div>
            <button onClick={() => setDrawer(null)} className="mt-5 w-full rounded-full bg-slate-100 py-2.5 text-sm font-medium text-slate-600">收起</button>
          </div>
        </div>
      )}
    </>
  )
}
