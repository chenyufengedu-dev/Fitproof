'use client'

import { useEffect, useMemo, useState } from 'react'
import VerifyResultCard from '@/components/VerifyResultCard'
import { loadHistory, type HistoryRecord } from '@/lib/history'
import { loadCommunityShares, type CommunityShareRecord, type CommunityShareStatus } from '@/lib/communityShares'

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

function shareStatusMeta(status: CommunityShareStatus) {
  if (status === 'published') return { label: '已发布', className: 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#0B6E63]' }
  if (status === 'featured') return { label: '已精选', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (status === 'rejected') return { label: '未通过', className: 'border-rose-200 bg-rose-50 text-rose-700' }
  if (status === 'removed') return { label: '已下架', className: 'border-slate-200 bg-slate-50 text-slate-600' }
  return { label: '待审核', className: 'border-amber-200 bg-amber-50 text-amber-700' }
}

function firstShareFrame(share: CommunityShareRecord) {
  return share.report?.keyframes?.find((frame) => frame.image) || share.report?.keyframes?.[0]
}

export default function ProfileTab() {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [shares, setShares] = useState<CommunityShareRecord[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    setRecords(loadHistory())
    setShares(loadCommunityShares())
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
            <h2 className="text-base font-semibold text-slate-900">我的分享</h2>
            {shares.length > 0 && <span className="text-xs text-slate-400">审核通过后展示到社区</span>}
          </div>

          {shares.length === 0 ? (
            <div className="rounded-3xl border border-[#20CDB6]/15 bg-white px-5 py-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">还没有提交到社区的核验报告</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">完成单条视频核验后，在总结页点击“分享到社区”，系统会直接提交审核。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {shares.map((share) => {
                const meta = shareStatusMeta(share.status)
                const frame = firstShareFrame(share)
                return (
                  <article key={share.id} className="rounded-3xl border border-[#20CDB6]/15 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>
                      <span className="shrink-0 text-xs text-slate-400">{formatDate(share.createdAt)}</span>
                    </div>
                    <div className="mt-3 flex gap-3">
                      <div className="relative h-[74px] w-[96px] shrink-0 overflow-hidden rounded-2xl bg-[#E7FAF6]">
                        {frame?.image ? (
                          <img src={frame.image} alt="已解析的视频关键帧" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] font-semibold leading-snug text-[#0B6E63]">关键帧待补充</div>
                        )}
                        {frame && <span className="absolute bottom-1 right-1 rounded-md bg-[#142723]/75 px-1.5 py-0.5 text-[10px] font-medium text-white">{Math.floor(frame.time / 60).toString().padStart(2, '0')}:{Math.floor(frame.time % 60).toString().padStart(2, '0')}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold text-slate-900">{share.title}</p>
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">{share.summary}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                      <span className="min-w-0 truncate">{share.displayName} 推荐 · {share.topic}</span>
                      <span className="shrink-0">{share.verifiedCount}/{share.claimsCount} 条已核验</span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
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
