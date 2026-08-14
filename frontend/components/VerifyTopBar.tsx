import type { ReactNode } from 'react'

interface VerifyTopBarProps {
  topic: string
  page: number
  total: number
  onBack: () => void
  hideProgress?: boolean
  /** 右侧附加动作（如分享按钮），放在页码/占位之前。只在需要的页面传。 */
  rightAction?: ReactNode
}

/** 单、双视频核验共用的页面顶栏，避免两套页面在间距与字号上继续漂移。 */
export default function VerifyTopBar({ topic, page, total, onBack, hideProgress = false, rightAction }: VerifyTopBarProps) {
  return (
    <header className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-5 py-2">
      <button type="button" onClick={onBack} className="inline-flex h-8 shrink-0 items-center rounded-full bg-white/75 px-3 text-[13px] font-medium text-[#128f80] shadow-sm backdrop-blur transition hover:bg-[#20CDB6] hover:text-white">‹ 返回</button>
      <div className="inline-flex h-8 min-w-0 max-w-[42%] items-center truncate rounded-full border border-[#20CDB6]/15 bg-white/75 px-3 text-center text-[13px] font-semibold text-[#128f80] shadow-sm backdrop-blur">
        <span className="mr-1 text-[#20CDB6]">●</span>
        {topic}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {rightAction}
        {hideProgress ? (rightAction ? null : <span className="w-[62px]" aria-hidden="true" />) : <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-[#20CDB6]/25 bg-white/75 px-3 text-[15px] font-bold text-[#078C7E] shadow-sm backdrop-blur">{page} / {total}</span>}
      </div>
    </header>
  )
}
