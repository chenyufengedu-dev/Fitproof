import type { Claim, EvidenceEntry, Keyframe } from '@/types'
import { citedEvidence, isEvidenceDowngraded } from '@/lib/single'
import { uniqueEvidenceById } from '@/components/verify/EvidenceCitation'
import ReasoningTrace, { type ReasoningStep } from '@/components/verify/ReasoningTrace'
import AuthorityDiagnosisCard from '@/components/single/AuthorityDiagnosisCard'
import { ClaimIcon, claimGroupsLabel, closestFrame, formatFrameTime, proxiedImg, signalClass, videoTimeUrl, type VerifyState } from '@/components/single/shared'

export default function ConfrontationCard({ claim, state, keyframes, onRetry, onEvidence, onOpenImage, claimCount, claimIndex, videoUrl, animate = false }: { claim: Claim; state: VerifyState; keyframes: Keyframe[]; onRetry: () => void; onEvidence: (evidence: EvidenceEntry[]) => void; onOpenImage: (frame: Keyframe) => void; claimCount: number; claimIndex: number; videoUrl: string; animate?: boolean }) {
  const result = state.status === 'done' ? state.result : undefined
  const supportEvidence = result ? citedEvidence(result) : []
  const citations = uniqueEvidenceById(supportEvidence)
  const downgraded = result ? isEvidenceDowngraded(result) : false
  const sourceDocs = new Set(supportEvidence.map((item) => item.source_doc).filter(Boolean))
  const orgs = new Set(supportEvidence.map((item) => item.org).filter(Boolean))
  // 命中文献展示名（机构《文献》，去重），给 fallback 步骤的胶囊用；对齐后端 sources 格式。
  // 取「检索到的」result.evidence 而非「引用的」citedEvidence —— 降级案例里模型没引用
  // 任何一篇，用 citedEvidence 会得到空数组、胶囊不显示（与 #2「已查阅 0 篇」同源）。
  const sourceNames = Array.from(new Map((result?.evidence || [])
    .filter((item) => item.source_doc)
    .map((item) => {
      const doc = item.source_doc.startsWith('《') ? item.source_doc : `《${item.source_doc}》`
      const name = item.org ? `${item.org}${doc}` : doc
      return [name, name] as const
    })).values())
  const fallbackTraceSteps: ReasoningStep[] = result ? [
    { label: '提取视频观点', detail: `拆出 ${claimCount} 条可核验说法`, tone: 'ok', icon: 'extract', status: 'done' },
    { label: '检索相关文献', detail: downgraded ? '当前未命中已收录权威依据' : `命中 ${supportEvidence.length} 条依据`, tone: downgraded ? 'warn' : 'ok', icon: 'search', status: 'done', sources: sourceNames },
    { label: `比对 ${claimCount} 条核心观点`, detail: downgraded ? '无法完成权威依据交叉比对' : `涉及 ${sourceDocs.size} 篇文献、${orgs.size} 家机构`, tone: downgraded ? 'warn' : 'ok', icon: 'compare', status: 'done' },
    { label: '生成核验结论', detail: downgraded ? '结论已明确标注为辅助判断' : '综合证据与适用条件输出结论', tone: downgraded ? 'warn' : 'ok', icon: 'verdict', status: 'done' },
  ] : []
  // 流式步骤来自后端真实 trace；核验结束后也必须保留，不能被前端摘要四步覆盖。
  const traceSteps = state.streamSteps && state.streamSteps.length > 0 ? state.streamSteps : fallbackTraceSteps
  // 「已查阅」= 检索到的文献数(result.evidence)，不是模型最终引用的(citedEvidence)。
  // 降级案例里检索命中若干篇但模型未引用，用 citedEvidence 会错显示「0 篇」。
  const reviewedDocs = new Set((result?.evidence || []).map((item) => item.source_doc).filter(Boolean))
  const traceSummary = `已查阅 ${reviewedDocs.size} 篇文献｜分析 ${claimCount} 条观点`

  const showConclusion = Boolean(result)

  return (
    <div className="space-y-3 pb-2">
      <section className="-mt-3 rounded-[16px] bg-white px-1 pt-1">
        <div className="flex items-center gap-3">
          <h1 className="text-[17px] font-black tracking-[-0.035em] text-[#17243B]">视频观点 {claimIndex + 1}</h1>
          <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${signalClass(claim.signal)}`}>{claimGroupsLabel(claim)}</span>
        </div>
        {claim.video_refs?.[0]?.time ? <a href={videoTimeUrl(videoUrl, claim.video_refs[0].time)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4C7890]" aria-label={`在原视频打开 ${claim.video_refs[0].time} 片段`}><svg className="h-4 w-4 text-[#07766B]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="7.2" /><path d="m8.4 6.9 5 3.1-5 3.1V6.9Z" fill="currentColor" stroke="none" /></svg>视频片段&nbsp;{claim.video_refs[0].time}</a> : null}
        <div className="relative mt-1.5 rounded-[12px] border border-[#DCE5E5] bg-[#FCFEFE] px-4 py-3">
          <span className="absolute left-3 top-3 select-none text-[46px] font-black leading-none text-[#087F76]" aria-hidden="true">“</span>
          <p className="pl-8 text-[15px] font-semibold leading-[1.6] tracking-[-0.015em] text-[#23334B]">{claim.claim}</p>
        </div>
      </section>

      {state.status === 'error' ? <section className="mt-5 rounded-[10px] border border-slate-200 bg-white px-4 py-3"><p className="t-label text-slate-700">核验失败</p><button type="button" onClick={onRetry} className="t-label mt-3 rounded-[6px] border border-slate-300 px-3 py-2 text-slate-700">重新核验这一条</button></section> : null}
      {state.status !== 'error' ? <ReasoningTrace summary={showConclusion ? traceSummary : state.streamSteps?.length ? '正在核验 · 实时工作过程' : state.status === 'pending' ? '等待开始' : '准备核验…'} steps={traceSteps} completed={showConclusion} forceExpanded={!showConclusion} footer={showConclusion && downgraded ? <p className="mt-2 whitespace-nowrap border-t border-dashed border-[#E8C894] pt-2 text-[11px] leading-tight text-[#B56A12]">未命中权威数据库：以下为 AI 辅助归纳，非权威依据。</p> : null} /> : null}
      {showConclusion && result ? <AuthorityDiagnosisCard result={result} citations={citations} origin={result.claim_origin || undefined} onOpenEvidence={onEvidence} animate={animate} /> : null}
    </div>
  )
}
