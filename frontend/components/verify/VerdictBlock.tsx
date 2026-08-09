import type { ReactNode } from 'react'

interface VerdictBlockProps {
  verdict: string
  riskLevel: string
  correction: string
  stamp: ReactNode
  showCorrection?: boolean
}

export default function VerdictBlock({ verdict, riskLevel, correction, stamp, showCorrection = true }: VerdictBlockProps) {
  const riskHigh = riskLevel.includes('高')
  const riskMid = riskLevel.includes('中')
  const tone = riskHigh
    ? { panel: 'border-[#F9D8D8] bg-[#FFF8F8] text-[#C73A3A]', divider: 'border-[#FBE3E3] bg-[#FFF1F1] text-[#AD6666]' }
    : riskMid
      ? { panel: 'border-[#F5E0BC] bg-[#FFFBF3] text-[#9A5B08]', divider: 'border-[#F8E8CC] bg-[#FFF7EA] text-[#A2733A]' }
      : { panel: 'border-[#CBEDE7] bg-[#F7FCFA] text-[#078C7E]', divider: 'border-[#DDF3EE] bg-[#EEF9F6] text-[#4E8D84]' }

  return (
    <section className={`relative overflow-hidden rounded-[22px] border shadow-[0_9px_24px_rgba(15,60,58,0.055)] ${tone.panel}`}>
      <div className="flex items-start gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold tracking-[0.08em] opacity-70">核验结论</p>
          <p className="mt-2 text-[21px] font-black leading-tight tracking-[-0.03em]">{verdict}</p>
          <p className="mt-1.5 text-[12px] opacity-70">误导风险{riskLevel || '未标注'} · 建议结合个体情况判断</p>
        </div>
        {stamp}
      </div>
      {showCorrection ? <div className={`border-t px-4 py-3.5 ${tone.divider}`}>
        <p className="text-[13px] font-bold opacity-80">更准确的说法</p>
        <p className="mt-1.5 text-[14px] leading-relaxed">{correction}</p>
      </div> : null}
    </section>
  )
}
