import type { ClaimOrigin as ClaimOriginData } from '@/types'

const ORIGIN_LABELS: Record<ClaimOriginData['type'], string> = {
  traditional: '传统经验流传',
  outdated_science: '早期认识滞后',
  concept_confusion: '概念混淆',
  overgeneralized: '个体经验泛化',
  commercial: '商业营销放大',
}

export default function ClaimOrigin({ origin, embedded = false, variant = 'default' }: { origin: ClaimOriginData; embedded?: boolean; variant?: 'default' | 'clinical' }) {
  const clinical = variant === 'clinical'
  if (clinical) {
    return (
      <section className={embedded ? 'mt-3 border-t border-[#D9DEDF] pt-3' : 'mt-5 rounded-[10px] border border-[#D9DEDF] bg-[#FFFEFC] px-4 py-3'}>
        <p className="t-label font-semibold text-[#3F4D5C]">说法溯源</p>
        <p data-origin-mechanism className="t-meta mt-1.5 text-[#667586]">
          可能机制：{ORIGIN_LABELS[origin.type]} · 推断性解释，非权威依据
        </p>
        <p className="t-label mt-2 leading-[1.7] text-[#435160]">{origin.explanation}</p>
      </section>
    )
  }
  return (
    <section className={`${embedded ? `mt-3 border-t pt-3 ${clinical ? 'border-[#D4D9DE]' : 'border-dashed border-[#D9E7EB]'}` : 'mt-5 rounded-[10px] bg-slate-100 px-4 py-3'}`}>
      <div className="flex items-center gap-2">
        <span data-origin-icon data-icon-variant="document-search" className={`grid h-7 w-7 shrink-0 place-items-center rounded-[6px] ${clinical ? 'bg-[#E9EDF1] text-[#526171]' : 'bg-[#E8F7F4] text-[#087F76]'}`}>
          <svg className="h-[20px] w-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M5.2 3.4h8.1l4 4v7.5H6.8a1.6 1.6 0 0 1-1.6-1.6V3.4Z" strokeWidth="1.75" strokeLinejoin="round" />
            <path d="M13.2 3.7v4h3.9M8.1 8.4h2.6M8.1 11h3.7" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="16.3" cy="16.2" r="3.5" fill={clinical ? '#E9EDF1' : '#E8F7F4'} strokeWidth="1.85" />
            <path d="m18.9 18.8 2 2" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <p className={`t-label font-semibold ${clinical ? 'text-[#4B596A]' : 'text-[#087F76]'}`}>说法溯源</p>
      </div>
      <div data-origin-mechanism className="mt-2 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] leading-none">
        <span className={`shrink-0 px-2 py-1 font-semibold ${clinical ? 'rounded-[4px] border border-[#D5DBE0] bg-[#EEF1F3] text-[#526171]' : 'rounded-full bg-[#DFF3EF] text-[#087F76]'}`}>可能机制</span>
        <span className={`shrink-0 font-medium ${clinical ? 'text-[#596879]' : 'text-[#607187]'}`}>{ORIGIN_LABELS[origin.type]}</span>
        <span className={clinical ? 'text-[#BCC4CB]' : 'text-slate-600'}>·</span>
        <span className={`min-w-0 truncate ${clinical ? 'text-[#7A8794]' : 'text-slate-600'}`}>AI 常识推断，非权威依据</span>
      </div>
      <p className={`t-meta mt-2 border-l-2 pl-3 leading-[1.7] ${clinical ? 'border-[#AEB8C2] text-[#435160]' : 'border-[#8DDDD2] text-[#4A5A70]'}`}>{origin.explanation}</p>
    </section>
  )
}
