'use client'

import type { EvidenceEntry } from '@/types'

interface EvidenceCitationProps {
  evidence: EvidenceEntry[]
  conclusion?: string
  onOpenEvidence?: (evidence: EvidenceEntry[]) => void
}

export function uniqueEvidenceById(evidence: EvidenceEntry[]) {
  const seen = new Set<string>()
  return evidence.filter((item) => {
    const key = [item.source_doc, item.org, item.year, item.page].filter(Boolean).join('|') || item.id
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default function EvidenceCitation({ evidence, conclusion, onOpenEvidence }: EvidenceCitationProps) {
  const citations = uniqueEvidenceById(evidence)

  if (citations.length === 0) return null

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-[#AEE4DD] bg-[linear-gradient(145deg,#FFFFFF_10%,#F8FFFD_100%)] px-4 py-4 shadow-[0_10px_26px_rgba(11,110,99,0.06)]">
      <header className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(135deg,#53D8CB,#13AFA4)] text-white shadow-[0_7px_14px_rgba(20,185,170,0.22)]"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <path d="M12 3 5.5 6v5c0 4.5 2.8 7.8 6.5 9.5 3.7-1.7 6.5-5 6.5-9.5V6L12 3Z" />
          <path d="m8.7 12 2.1 2.1 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg></span>
        <h3 className="text-[18px] font-black tracking-[-0.025em] text-[#087F76]">权威依据 <span className="text-[14px] font-semibold">（数据库结论）</span></h3>
      </header>
      {conclusion ? <p className="mt-4 text-[16px] font-semibold leading-[1.72] text-[#17243B]">{conclusion}</p> : null}
      <div className="mt-4 border-t border-dashed border-[#CDE9E5] pt-3">
        <p className="mb-2 text-[13px] font-bold text-[#0B9F91]"><span className="mr-2 inline-block h-4 w-1 rounded-full bg-[#20CDB6] align-[-2px]" />依据出处</p>
        <div className="overflow-hidden rounded-[14px] border border-[#E1EEEC] bg-white">
          {citations.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenEvidence?.(citations)}
              className="flex w-full items-center gap-3 border-b border-[#EDF4F3] bg-white px-3 py-3 text-left last:border-b-0 hover:bg-[#F7FCFB]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#EAF9F6] text-[13px] font-black text-[#0B9F91]">[{index + 1}]</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-bold text-[#17243B]">《{item.source_doc}》</span><span className="mt-1 block truncate text-[12px] text-[#7183A4]">{item.org || '来源机构未标注'}{item.year ? ` · ${item.year}` : ''}{item.page ? ` · P.${item.page}` : ''}</span></span>
              <svg className="h-4 w-4 shrink-0 text-[#8EA9B7]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
