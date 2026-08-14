import type { ReactNode } from 'react'

interface StateBlockProps {
  /** error 会换成暖色描边，其余情况用中性色 */
  tone?: 'neutral' | 'error'
  /** 插画或图标，没有就只显示文字 */
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  className?: string
}

/**
 * 空态与错误态的统一外观。
 *
 * 之前这类块在五个地方各写各的：标题 15/16/18px 三种、容器灰底/青底/白底渐变/无容器四种、
 * 有的带插画有的没有，同一件事看起来像五个不同的产品。这里收敛成一套。
 *
 * 错误态只说人话。技术细节（HTTP 状态码、异常消息）留给 console，
 * 用户看到「知识库暂时打不开（HTTP 404）」既无从下手，也显得产品没做完。
 */
export default function StateBlock({ tone = 'neutral', icon, title, description, action, className = '' }: StateBlockProps) {
  const border = tone === 'error' ? 'border-[#F3D6A6] bg-[#FFFBF4]' : 'border-[#D9E7E7] bg-[linear-gradient(135deg,#FFFFFF,#F8FCFC)]'
  return (
    <div className={`rounded-[18px] border px-4 py-7 text-center ${border} ${className}`}>
      {icon && <div className="mb-3 flex justify-center">{icon}</div>}
      <p className="text-[15px] font-black text-slate-900">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-[17rem] text-[12px] leading-relaxed text-slate-600">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#20CDB6] px-5 py-2.5 text-[13px] font-bold text-[#06403A] shadow-[0_8px_20px_rgba(32,205,182,0.28)] transition hover:brightness-[1.03]"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
