import { useState } from 'react'
import type { Claim, SingleAnalyzeResponse } from '@/types'
import CourtCardShell from '@/components/CourtCardShell'
import StateBlock from '@/components/StateBlock'
import { isEvidenceDowngraded } from '@/lib/single'
import { ClaimIcon, LoadingDots, claimGroupsLabel, firstTime, overviewSignalClass, resolvedClaimIcon, signalClass, type VerifyState } from '@/components/single/shared'

export default function OverviewCard({ data, states, revealed, onOpenClaim }: { data: SingleAnalyzeResponse; states: VerifyState[]; revealed: boolean[]; onOpenClaim: (index: number) => void }) {
  const allFilters = [
    { key: '全部', label: '全部' },
    { key: '较公认', label: '较公认' },
    { key: '疑似夸大', label: '疑似夸大' },
    { key: '有条件/争议', label: '有条件/争议' },
  ] as const
  type FilterKey = typeof allFilters[number]['key']
  const [activeFilter, setActiveFilter] = useState<FilterKey>('全部')
  const claimGroups = (claim: Claim): Exclude<FilterKey, '全部'> => {
    if (claim.signal === '较公认') return '较公认'
    if (claim.signal === '疑似夸大') return '疑似夸大'
    return '有条件/争议'
  }
  const countFor = (key: FilterKey) => key === '全部'
    ? data.claims.length
    : data.claims.filter((claim) => claimGroups(claim) === key).length
  // 空筛选（count 为 0）直接隐藏 —— 点进去是空列表的死按钮，且徒增一排撞色胶囊。
  const filters = allFilters.filter((filter) => countFor(filter.key) > 0)
  const visibleClaims = data.claims
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => activeFilter === '全部' || claimGroups(claim) === activeFilter)

  return (
    <div className="pb-1">
      {data.claims.length === 0 ? (
        <StateBlock className="mt-2" title="没有提取到可核验说法" description="这条视频里没有找到可以对照指南核验的健康主张，换一条试试。" />
      ) : (
        <>
          {/* 筛选：每一类始终保留对应颜色与描边，选中态仅加强底色。 */}
          <div className="no-scrollbar mt-1 flex gap-1.5 overflow-x-auto pb-1">
            {filters.map((filter) => {
              const active = activeFilter === filter.key
              // 文字色都按 WCAG AA 4.5:1 校准过（对各自的底色）。「全部」原来是唯一
              // 用白字压青底的（2.46:1），也是唯一不遵循「浅底 + 深字」的一个，改回来。
              const tone = filter.key === '较公认'
                ? { idle: 'border-[#BFECE5] bg-[#F8FCFB] text-[#067A6D]', active: 'border-[#8EDDD2] bg-[#EAF9F6] text-[#066B60]' }
                : filter.key === '疑似夸大'
                  ? { idle: 'border-[#F6D8A9] bg-[#FFFCF7] text-[#9A5A0C]', active: 'border-[#E9B65D] bg-[#FFE6C1] text-[#8F4F04] shadow-[0_2px_6px_rgba(218,139,20,0.13)]' }
                  : filter.key === '有条件/争议'
                    ? { idle: 'border-[#D6E0EC] bg-[#FAFCFE] text-[#57647A]', active: 'border-[#9EB2C8] bg-[#E3EBF4] text-[#435975] shadow-[0_2px_6px_rgba(82,100,122,0.12)]' }
                    : { idle: 'border-[#BFECE5] bg-[#F8FCFB] text-[#0B6E63]', active: 'border-[#0FAF9C] bg-[#D7F3EE] text-[#075E55] shadow-[0_3px_8px_rgba(15,185,169,0.18)]' }
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`t-meta shrink-0 rounded-full border px-2.5 py-1 transition ${active ? tone.active : tone.idle}`}
                >
                  {filter.label} {countFor(filter.key)}
                </button>
              )
            })}
          </div>

          {/* 独立观点卡：顶部状态、正文与真实核验切入点分层，不用左侧色条。 */}
          <div className="mt-2 space-y-2">
            {visibleClaims.map(({ claim, index }) => {
              const group = claimGroups(claim)
              const c = group === '较公认'
                ? { number: 'border-[#BFECE5] bg-white text-[#0B6E63]', tag: 'bg-[#EAF9F6] text-[#0B6E63]', text: 'text-[#0B6E63]' }
                : group === '疑似夸大'
                  ? { number: 'border-[#F6D8A9] bg-white text-[#9A5A0C]', tag: 'bg-[#FFF4E5] text-[#9A5A0C]', text: 'text-[#9A5A0C]' }
                  : { number: 'border-[#D6E0EC] bg-white text-[#57647A]', tag: 'bg-[#F1F5F9] text-[#57647A]', text: 'text-[#57647A]' }
              return (
                <button
                  key={`${claim.claim}-${index}`}
                  type="button"
                  onClick={() => onOpenClaim(index)}
                  className="w-full rounded-[16px] border border-[#E6EEF0] bg-white px-3 py-2.5 text-left shadow-[0_3px_10px_rgba(15,60,58,0.04)] transition hover:border-[#D5E4E4] hover:shadow-[0_5px_14px_rgba(15,60,58,0.06)]"
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold tabular-nums ${c.number}`}>{String(index + 1).padStart(2, '0')}</span>
                    <span className={`t-micro shrink-0 rounded-md px-1.5 py-0.5 font-semibold ${c.tag}`}>{group}</span>
                    <span className="min-w-0 flex-1" />
                    {(() => {
                      const state = states[index]
                      // Option B：后台已核验也先显示「尚未核验」，用户点开看过实时过程后才亮出结论。
                      const shown = revealed[index]
                      if (!shown) return <span className="t-micro flex shrink-0 items-center gap-1.5 text-slate-600"><i className="relative flex h-2 w-2 shrink-0"><i className="absolute inset-0 animate-ping rounded-full bg-slate-400/55" /><i className="relative h-2 w-2 animate-pulse rounded-full bg-slate-500" /></i>尚未核验</span>
                      if (state?.status === 'loading') return <span className="t-micro flex shrink-0 items-center gap-1 text-slate-600"><LoadingDots />核验中…</span>
                      if (state?.status === 'error') return <span className="t-micro shrink-0 text-amber-700">核验失败</span>
                      if (state?.status === 'done' && state.result) {
                        const downgraded = isEvidenceDowngraded(state.result)
                        const statusDot = downgraded
                          ? 'bg-amber-500'
                          : state.result.risk_level.includes('高')
                            ? 'bg-red-500'
                            : state.result.risk_level.includes('中')
                              ? 'bg-amber-500'
                              : 'bg-[#20CDB6]'
                        return <span className="t-micro flex max-w-[36%] shrink-0 items-center gap-1 truncate font-semibold text-slate-600"><i className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />{state.result.verdict}</span>
                      }
                      return <span className="t-micro flex shrink-0 items-center gap-1.5 text-slate-600"><i className="relative flex h-2 w-2 shrink-0"><i className="absolute inset-0 animate-ping rounded-full bg-slate-400/55" /><i className="relative h-2 w-2 animate-pulse rounded-full bg-slate-500" /></i>尚未核验</span>
                    })()}
                    <svg className="h-4 w-4 shrink-0 text-slate-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5.5 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                  <p className="t-body mt-1.5 line-clamp-2 font-semibold leading-relaxed text-slate-900">{claim.claim}</p>
                  <div className="mt-1.5 grid grid-cols-2 border-t border-dashed border-[#E7EEF0] pt-1.5">
                    <span className="flex min-w-0 items-center gap-1.5 border-r border-slate-100 pr-2"><i className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#E9EEF5] text-[#7F8EA8]"><svg className="h-3 w-3 translate-x-px" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.7 3.2c0-.8.9-1.3 1.6-.8l6.1 4.3c.9.6.9 2 0 2.6l-6.1 4.3c-.7.5-1.6 0-1.6-.8V3.2Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" /></svg></i><span className="min-w-0"><span className="t-micro block truncate text-slate-600">视频片段</span><span className="t-micro block truncate font-semibold text-slate-600">{firstTime(claim)}</span></span></span>
                    <span className="flex min-w-0 items-center gap-1.5 pl-2"><svg className="h-5 w-5 shrink-0 text-[#8191AA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v18M4 7h16M6.5 7 3.8 13h5.4L6.5 7ZM17.5 7l-2.7 6h5.4l-2.7-6ZM5 20h14" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="min-w-0"><span className="t-micro block truncate text-slate-600">初步判断</span><span className={`t-micro block truncate font-semibold ${c.text}`}>{group}</span></span></span>
                  </div>
                  {/* 切入点独占一行：挤在第三列时只有 62px，整句被截成 4 个字，读不出任何信息 */}
                  <div className="mt-1.5 flex items-start gap-1.5 border-t border-dashed border-[#E7EEF0] pt-1.5"><svg className="h-5 w-5 shrink-0 text-[#8191AA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden="true"><rect x="5.2" y="3.4" width="13.6" height="17.2" rx="2" /><path d="M9 3.4h6v3H9zM8.8 11h6.4M8.8 14.5h6.4" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="min-w-0 flex-1"><span className="t-micro block text-slate-600">核验切入点</span><span className="t-micro block line-clamp-2 font-semibold leading-snug text-slate-600">{claim.why || '未标注核验切入点'}</span></span></div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
