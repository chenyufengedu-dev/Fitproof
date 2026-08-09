'use client'

import { useState } from 'react'
import type { Claim, EvidenceEntry } from '@/types'

interface MisleadingRiskCardProps {
  claim: Claim
  riskLevel: string
  correction: string
  evidence: EvidenceEntry[]
  onOpenEvidence?: (evidence: EvidenceEntry[]) => void
}

export default function MisleadingRiskCard({ claim, riskLevel, correction, evidence, onOpenEvidence }: MisleadingRiskCardProps) {
  const [expanded, setExpanded] = useState(false)
  const evidenceLabel = evidence.length > 0 ? `相关依据（${evidence.length} 条）` : '相关依据（未命中）'

  return (
    <section className="relative overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className="absolute inset-y-0 left-0 w-[2px] bg-[#C2740B]" aria-hidden="true" />
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="t-micro uppercase tracking-[0.09em] text-slate-500">原视频说法</p>
          <span className="t-micro text-[#9A5B08]">误导风险{riskLevel || '待定'}</span>
        </div>
        <p className="t-body mt-2 text-slate-900">{claim.claim}</p>
      </div>
      <div className="border-t border-slate-100 px-4 py-3">
        <p className="t-label text-[#078C7E]">✓ 更准确的说法</p>
        <p className="t-body mt-2 text-slate-700">{correction}</p>
      </div>
      <div className="border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="t-label flex w-full items-center justify-between gap-3 text-left text-slate-600"
        >
          <span className="t-label">{evidenceLabel}</span>
          <span className="t-micro">{expanded ? '收起' : '展开'}</span>
        </button>
        {expanded && (evidence.length > 0
          ? <div className="mt-3 overflow-hidden rounded-[6px] border border-slate-200">
            <p className="t-micro border-b border-slate-100 px-3 py-2 text-slate-500">权威依据（数据库结论）</p>
            {evidence.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenEvidence?.(evidence)}
                className="t-body block w-full border-b border-slate-100 bg-white px-3 py-3 text-left last:border-b-0 hover:bg-slate-50"
              >
                <span className="block text-slate-800">{item.claim}</span>
                <span className="t-label mt-2 block text-slate-800">《{item.source_doc}》</span>
                <span className="t-meta mt-1 block text-slate-500">{item.org || '来源机构未标注'} · [{index + 1}]{item.page ? ` · p.${item.page}` : ''}</span>
              </button>
            ))}
          </div>
          : <p className="t-meta mt-2 text-slate-500">未命中已收录权威依据，不将常识判断伪装成专业依据。</p>
        )}
      </div>
    </section>
  )
}
