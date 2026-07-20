import type { ReactNode } from 'react'

interface CourtCardShellProps {
  label: string
  index: number
  /** 卡头标题下的一行小字。给了就贴在标题下方，并省掉标题与内容之间的分隔线。 */
  subtitle?: string
  subtitleLeading?: ReactNode
  hideHeader?: boolean
  hideIndex?: boolean
  headerBadge?: ReactNode
  contentScrollable?: boolean
  /** 单视频复用双视频外壳比例；不影响双视频自己的卡片实现。 */
  visualVariant?: 'default' | 'dual'
  children: ReactNode
}

export default function CourtCardShell({ label, index, subtitle, subtitleLeading, hideHeader = false, hideIndex = false, headerBadge, contentScrollable = true, visualVariant = 'default', children }: CourtCardShellProps) {
  const dualShell = visualVariant === 'dual'
  return (
    <div className={`flex h-full w-full flex-col overflow-hidden bg-white ${dualShell ? 'rounded-[28px] border border-[#CDEDE7] shadow-[0_18px_52px_rgba(18,116,103,0.14)]' : 'rounded-[24px]'}`}>
      <div className="h-1.5 bg-gradient-to-r from-[#20CDB6] via-[#20CDB6]/75 to-[#20CDB6]/10" />
      {/* 卡头与内容区用同一个 px-4：卡头左右缘正好压在下方卡片的左右边上。
          标题与 01 放在同一行并垂直居中，两者等高对齐；副标题另起一行挂在下面。 */}
      {!hideHeader && (
        <div className={dualShell ? 'px-5 pt-3' : 'px-4 pt-2.5'}>
        <div className="flex items-start justify-between gap-3">
          <div className={`mt-[2px] min-w-0 ${headerBadge && !hideIndex ? 'min-h-[74px]' : 'min-h-[46px]'}`}>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={dualShell ? 'h-2 w-2 shrink-0 rounded-full bg-[#20CDB6] shadow-[0_0_16px_rgba(32,205,182,0.65)]' : 'h-1.5 w-1.5 shrink-0 rounded-full bg-[#20CDB6]'} />
              <h2 className="truncate text-[18px] font-bold leading-[23px] tracking-wide text-slate-950">{label}</h2>
            </div>
            <div className="min-w-0">
              {subtitle && <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] leading-[14px] text-slate-400">{subtitleLeading}{subtitle}</p>}
            </div>
          </div>
            <div className={`flex shrink-0 flex-col items-end gap-1 ${hideIndex ? 'mt-[10px]' : ''}`}>
              {!hideIndex && <span className={`${dualShell ? 'text-[25px]' : 'text-[46px]'} font-black leading-none tracking-tight text-[#20CDB6]/25`}>
                {String(index).padStart(2, '0')}
              </span>}
              {headerBadge}
            </div>
          </div>
        </div>
      )}
      {!hideHeader && !subtitle && <div className={`${dualShell ? 'mx-5 mt-1' : 'mx-4 mt-2'} h-px bg-[#20CDB6]/10`} />}
      <div className={`min-h-0 flex-1 ${contentScrollable ? 'overflow-y-auto' : 'overflow-hidden'} ${hideHeader ? 'px-5 pb-4 pt-5' : dualShell ? 'px-5 pb-2 pt-3' : 'px-4 pb-2 pt-2'}`}>
        {children}
      </div>
      {/* 免责声明压成一行：删掉「本产品用于健康说法核验」这句自我介绍（顶栏胶囊已写），
          保留真正有法律意义的半句，给上面的内容腾高度。 */}
      <div className={`${dualShell ? 'mx-5' : 'mx-4'} border-t border-[#20CDB6]/10 py-2`}>
        <p className="flex items-center justify-center gap-1.5 text-center text-[10px] leading-tight text-slate-400">
          <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M10 2.5 4 5v4.5c0 3.6 2.5 6.9 6 8 3.5-1.1 6-4.4 6-8V5l-6-2.5Z" strokeLinejoin="round" />
            <path d="m7.3 10 1.8 1.8 3.8-3.8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
          <span>不构成医疗诊断或个体化治疗建议</span>
        </p>
      </div>
    </div>
  )
}
