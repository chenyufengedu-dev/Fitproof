import { useState } from 'react'
import type { Claim, SingleActionAdvice, VerifyResult } from '@/types'
import CourtCardShell from '@/components/CourtCardShell'
import StateBlock from '@/components/StateBlock'
import { ClaimIcon, VerdictStamp, resolvedClaimIcon, summaryVerdictTone, type VerifyState } from '@/components/single/shared'

export function SummaryFact({
  kind,
  label,
  value,
}: {
  kind: 'evidence' | 'status' | 'action'
  label: string
  value: string
}) {
  const icon = kind === 'evidence' ? (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3.75 5.25h5.1A3.15 3.15 0 0 1 12 8.4v10.35a3.15 3.15 0 0 0-3.15-3.15h-5.1V5.25Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M20.25 5.25h-5.1A3.15 3.15 0 0 0 12 8.4v10.35a3.15 3.15 0 0 1 3.15-3.15h5.1V5.25Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 8.4v10.35" strokeLinecap="round" /></svg>
  ) : kind === 'status' ? (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4.25 19V13.5h3V19m2.5 0V9.5h3V19m2.5 0V5h3v14" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 19.5h18" strokeLinecap="round" /></svg>
  ) : (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.75" /><path d="m8.15 12.05 2.45 2.45 5.25-5.35" strokeLinecap="round" strokeLinejoin="round" /></svg>
  )

  return (
    <div data-summary-fact className="mx-auto flex w-fit max-w-full min-w-0 items-start justify-center gap-1.5 px-1 text-center">
      <span className="shrink-0 text-[#0BAA98]">{icon}</span>
      <span className="min-w-0 text-left">
        <span data-summary-fact-label className="t-micro block truncate text-left font-bold text-[#0BAA98]">{label}</span>
        <span data-summary-fact-value className="t-micro block truncate text-left text-slate-600" title={value}>{value}</span>
      </span>
    </div>
  )
}

export function VerdictSummaryItem({ claim, result, relatedAction, actionsLoading, expanded, onToggleCorrection }: { claim: Claim; result: VerifyResult; relatedAction?: SingleActionAdvice; actionsLoading: boolean; expanded: boolean; onToggleCorrection: () => void }) {
  const tone = summaryVerdictTone(result, claim.signal)
  const firstEvidence = result.evidence?.[0]
  const evidenceBasis = firstEvidence
    ? [firstEvidence.org, firstEvidence.source_doc].filter(Boolean).join(' · ')
    : '未命中已收录依据'
  const evidenceState = result.evidence_status === 'not_found'
    ? '库中未收录'
    : `${result.strength || '已匹配'} · ${result.evidence?.length || 0} 条`
  const actionText = actionsLoading
    ? '建议生成中'
    : relatedAction?.steps?.[0]?.title || relatedAction?.condition || '暂无专项建议'

  return (
    <article className="rounded-[10px] border border-slate-200/80 bg-white p-[10px] shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-2.5">
        <ClaimIcon icon={resolvedClaimIcon(claim)} borderless imageClassName="h-[88%] w-[88%]" className="h-11 w-11 shadow-[0_3px_8px_rgba(15,80,74,0.12)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone.labelClass}`}>
              <svg data-summary-diagnosis-icon className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 7.1v3.4M8 4.75v.1" strokeLinecap="round" /></svg>
              {tone.label}
            </span>
            <span className={`inline-block shrink-0 -rotate-2 rounded-[8px] border-2 bg-white px-2 py-1 text-[11px] font-black leading-tight ${tone.stampClass}`}>{tone.stamp}</span>
          </div>
          <p data-summary-quote className="t-label mt-1.5 line-clamp-2 font-bold leading-[1.45] text-slate-950">
            <span data-summary-quote-mark className="t-verdict mr-0.5 text-[#20B8A8]" style={{ fontWeight: 900 }}>“</span>{claim.claim}<span data-summary-quote-mark className="t-verdict ml-0.5 text-[#20B8A8]" style={{ fontWeight: 900 }}>”</span>
          </p>
        </div>
      </div>
      <button type="button" onClick={onToggleCorrection} aria-expanded={expanded} className="mt-2 flex w-full items-start gap-2.5 rounded-[12px] border border-[#CDEDE7] bg-[#F0FBF8] px-2.5 py-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[#0B6E63]" aria-hidden="true">
          <svg data-accurate-shield className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 2.75 4.75 6v5.45c0 4.72 2.98 8.2 7.25 10.05 4.27-1.85 7.25-5.33 7.25-10.05V6L12 2.75Z" strokeLinejoin="round" /><path d="m8.35 12.1 2.25 2.25 5.05-5.05" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span data-accurate-title className="t-meta flex items-center justify-between gap-2 font-black text-[#0B6E63]">更准确的说法
            <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span
            data-accurate-copy
            className="t-meta mt-0.5 block leading-[1.5] text-slate-600"
            style={expanded ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, overflow: 'hidden' }}
          >
            {result.correction}
          </span>
        </span>
      </button>
      <div className="mt-2.5 grid grid-cols-3 divide-x divide-slate-200/80 border-t border-dashed border-slate-200 pt-2">
        <div data-summary-evidence className="flex min-w-0 justify-center"><SummaryFact kind="evidence" label="判断依据" value={evidenceBasis} /></div>
        <div data-summary-status className="flex min-w-0 justify-center"><SummaryFact kind="status" label="证据状态" value={evidenceState} /></div>
        <div data-summary-action className="flex min-w-0 justify-center"><SummaryFact kind="action" label="建议" value={actionText} /></div>
      </div>
    </article>
  )
}

export default function SummaryCard({ claims, states, actions, actionsLoading, shareReady, shareBusy, onShare }: { claims: Claim[]; states: VerifyState[]; actions: SingleActionAdvice[]; actionsLoading: boolean; shareReady: boolean; shareBusy: boolean; onShare: () => void }) {
  const [expandedCorrections, setExpandedCorrections] = useState<number[]>([])
  const completedCount = states.filter((state) => state.status === 'done').length
  const isReviewing = completedCount < claims.length
  const completed = states
    .map((state, index) => ({ state, claim: claims[index], index }))
    .filter((item): item is { state: VerifyState & { status: 'done'; result: VerifyResult }; claim: Claim; index: number } => item.state.status === 'done' && Boolean(item.state.result) && Boolean(item.claim))
  const cautionary = completed.filter(({ claim, state }) => {
    const tone = summaryVerdictTone(state.result, claim.signal)
    return tone.kind !== 'accepted'
  })
  const accepted = completed.filter(({ claim, state }) => summaryVerdictTone(state.result, claim.signal).kind === 'accepted')
  const featured = [...cautionary, ...accepted.slice(0, Math.max(0, 3 - cautionary.length))]

  return (
    <div className="pb-2">
      <div className="pt-1">
        <div data-summary-completion className="mb-3 flex items-center justify-between gap-2 rounded-[10px] border border-[#BDE8E1] bg-[#F1FBF8] px-2.5 py-2 shadow-[0_2px_7px_rgba(11,110,99,0.035)]">
          <span className="flex min-w-0 items-center gap-1.5 text-[#0B6E63]">
            <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.75" /><path d="m8.2 12.05 2.4 2.4 5.2-5.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="t-micro truncate font-bold">{isReviewing ? '正在筛查高风险说法与纠偏建议' : '已完成高风险筛查与纠偏建议整理'}</span>
          </span>
          <span className="t-micro shrink-0 text-right text-slate-600">{isReviewing ? `已核验 ${completedCount} / ${claims.length} 条` : `已核验 ${completedCount} 条说法 · 输出重点误导风险`}</span>
        </div>
        {claims.length === 0 ? (
          <StateBlock title="没有可核验的说法" description="这条视频里没有提取出可以对照证据核验的说法。" />
        ) : featured.length > 0 ? (
          <div className="space-y-2.5">
            {featured.map(({ claim, state, index }) => (
              <VerdictSummaryItem
                key={`${claim.claim}-${index}`}
                claim={claim}
                result={state.result}
                relatedAction={actions.find((action) => action.claim_indices.includes(index))}
                actionsLoading={actionsLoading}
                expanded={expandedCorrections.includes(index)}
                onToggleCorrection={() => setExpandedCorrections((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#20CDB6]/25 bg-[#E1F5EE] px-4 py-6 text-center">
            <p className="text-base font-bold text-[#0B6E63]">
              {completedCount === 0 ? '去说法全景选一条开始核验' : isReviewing ? '已核验部分暂未发现明显误导' : '这条视频整体较稳，未发现明显误导'}
            </p>
            {isReviewing && <p className="mt-1.5 text-xs text-slate-600">其余说法仍在审理中</p>}
          </div>
        )}

        {claims.length > 0 && (
          <div className="mt-4 border-t border-[#D8F0EC] pt-3 text-center">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#0B6E63]">求真结论</p>
            <p className="mt-1 text-[13px] font-bold text-slate-900">
              共 {claims.length} 条说法，其中 {cautionary.length} 条需要谨慎判断
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
