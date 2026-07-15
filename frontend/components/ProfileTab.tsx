'use client'

import { useEffect, useMemo, useState } from 'react'
import VerifyResultCard from '@/components/VerifyResultCard'
import { loadHistory, type HistoryRecord } from '@/lib/history'

function riskClass(level: string) {
  if (/高|误导/.test(level)) return 'border-amber-200 bg-amber-50 text-amber-700'
  if (/中|需|条件/.test(level)) return 'border-slate-200 bg-slate-50 text-slate-600'
  return 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]'
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function ProfileTab() {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    setRecords(loadHistory())
  }, [])

  const misleadingCount = useMemo(
    () => records.filter((record) => record.signal === '疑似夸大' || /高|误导/.test(record.result.risk_level)).length,
    [records],
  )

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f7fffd] px-4 py-5 pb-24 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B6E63]">FitProof</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">我的</h1>
          <p className="mt-1 text-sm text-slate-500">你的核验记录，只保存在这台设备上。</p>
        </header>

        <section className="grid grid-cols-2 gap-3" aria-label="求真成就">
          <div className="rounded-3xl border border-[#20CDB6]/20 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#0B6E63]">已核验</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{records.length}<span className="ml-1 text-sm font-medium text-slate-500">条</span></p>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-amber-700">避开可能误导</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{misleadingCount}<span className="ml-1 text-sm font-medium text-slate-500">条</span></p>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">核验历史</h2>
            {records.length > 0 && <span className="text-xs text-slate-400">最近 50 条</span>}
          </div>

          {records.length === 0 ? (
            <div className="rounded-3xl border border-[#20CDB6]/20 bg-white px-5 py-12 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E7FAF6] text-[#0B6E63]">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6" /><path d="M4 4h16v16H4z" /></svg>
              </div>
              <p className="mt-4 font-semibold text-slate-900">还没有核验记录，去核验一条吧</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">完成核验后，这里会保留主张、结论和可追溯依据。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => {
                const expanded = expandedId === record.id
                return (
                  <article key={record.id} className="rounded-3xl border border-[#20CDB6]/15 bg-white p-4 shadow-sm">
                    <button type="button" onClick={() => setExpandedId(expanded ? null : record.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskClass(record.result.risk_level)}`}>{record.result.risk_level || '风险待定'}</span>
                        <span className="shrink-0 text-xs text-slate-400">{formatDate(record.createdAt)}</span>
                      </div>
                      <p className="mt-3 text-[16px] font-semibold leading-relaxed text-slate-900">{record.claim}</p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-slate-500">{record.topic || record.reference.title || '未分类话题'}</span>
                        <span className="shrink-0 font-medium text-[#0B6E63]">{record.result.verdict} {expanded ? '⌃' : '›'}</span>
                      </div>
                    </button>
                    {expanded && <div className="mt-5 border-t border-[#D8F0EC] pt-5"><VerifyResultCard result={record.result} /></div>}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
