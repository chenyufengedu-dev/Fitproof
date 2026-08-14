'use client'

import { useEffect, useState, type ReactNode } from 'react'

export interface ReasoningStep {
  step?: string
  label: string
  detail?: string
  tone?: 'ok' | 'warn'
  icon?: 'extract' | 'search' | 'compare' | 'verdict'
  status?: 'done' | 'working'
  sources?: string[]
}

interface ReasoningTraceProps {
  summary: string
  steps: ReasoningStep[]
  forceExpanded?: boolean
  footer?: ReactNode
  completed?: boolean
}

/**
 * 真实核验事件的审计轨迹。它只负责呈现调用方给出的 trace，
 * 不推导、不补写任何步骤或来源。
 */
export default function ReasoningTrace({ summary, steps, forceExpanded = false, footer, completed = false }: ReasoningTraceProps) {
  const [expanded, setExpanded] = useState(true)
  const isExpanded = expanded || forceExpanded

  useEffect(() => {
    if (completed) setExpanded(true)
  }, [completed])

  return (
    <section className="rounded-[14px] border border-[#DCE6E8] bg-white px-4 py-2.5">
      <button
        type="button"
        onClick={() => { if (!forceExpanded) setExpanded((value) => !value) }}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={isExpanded}
      >
        <span className="flex min-w-0 items-center gap-1">
          <svg className="h-4 w-4 shrink-0 text-[#527083]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M6.5 3.5h8.2l3 3v14H6.5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6.5 3.5Z" strokeLinejoin="round" />
            <path d="M14.7 3.7v3h2.8M8.5 11h6.8M8.5 14.5h6.8" strokeLinecap="round" />
          </svg>
          <span className="t-label text-slate-700">核验过程</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {!completed ? <span className="-translate-y-0.5 inline-flex h-3 shrink-0 items-end gap-1" aria-label="核验处理中">
            {[0, 1, 2].map((dot) => <span key={dot} className="trace-loading-dot h-[5px] w-[5px] rounded-full bg-[#527083]" style={{ animationDelay: `${dot * 150}ms` }} />)}
          </span> : null}
          <span className="t-meta truncate text-slate-400">{summary}</span>
          <svg className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {isExpanded && (
        <>
          {steps.length > 0 ? <ol className="relative mt-1 border-t border-[#E5ECEE] pt-0.5 before:absolute before:bottom-2 before:left-[5.5px] before:top-3.5 before:w-px before:bg-[#D6E2E5]">
            {steps.map((step, index) => {
              const working = !completed && (step.status === 'working' || index === steps.length - 1)
              return (
                <li key={`${step.label}-${index}`} className="relative flex gap-2 py-0.5 first:pt-0.5 last:pb-0.5">
                  <span className="relative z-10 mt-[2px] flex h-3 w-3 shrink-0 items-center justify-center" aria-label={working ? '核验进行中' : '核验完成'}>
                    {working ? <span className="h-[7px] w-[7px] rounded-full bg-[#527083] shadow-[0_0_0_2px_rgba(82,112,131,0.14)] animate-pulse" /> : <span className="grid h-3 w-3 place-items-center rounded-full bg-[#527083] text-white"><svg className="h-2 w-2 -translate-x-[0.5px] translate-y-[0.5px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m2.5 6.1 2.1 2.1 4.9-4.9" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
                  </span>
                  <span className="min-w-0">
                    <span className="t-label block leading-tight text-slate-700">{step.label}</span>
                    {step.detail ? <span className="t-meta mt-0 block leading-tight text-slate-400">{step.detail}</span> : null}
                    {/* 命中文献做成胶囊，一篇一颗，而不是 · 拼接的一长串灰字 */}
                    {step.sources?.length ? <span className="mt-1.5 flex flex-col gap-1">{step.sources.map((source) => <span key={source} className="font-cite block break-words rounded-[8px] bg-[#EAF9F6] px-2 py-1 text-[11px] leading-snug text-[#0B8D7D]">{source}</span>)}</span> : null}
                  </span>
                </li>
              )
            })}
          </ol> : null}
          {footer}
        </>
      )}
      <style jsx>{`
        .trace-loading-dot {
          animation: trace-dot-bounce 850ms cubic-bezier(.36,.07,.19,.97) infinite;
          transform-origin: center bottom;
        }
        @keyframes trace-dot-bounce {
          0%, 58%, 100% { transform: translateY(0); opacity: .55; }
          28% { transform: translateY(-5px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .trace-loading-dot { animation: none; opacity: .8; }
        }
      `}</style>
    </section>
  )
}
