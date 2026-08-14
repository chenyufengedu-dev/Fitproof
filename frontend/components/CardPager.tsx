interface CardPagerProps {
  count: number
  activeIndex: number
  labels: string[]
  onSelect?: (index: number) => void
}

/** 轻量分页条：外层使用页面底部同色，只有分页胶囊本身是白色。 */
export default function CardPager({ count, activeIndex, labels, onSelect }: CardPagerProps) {
  return (
    <footer className="relative z-10 flex shrink-0 justify-center bg-[#eef8f6] px-5 pb-0 pt-1" aria-label={`当前第 ${activeIndex + 1} 张，共 ${count} 张`}>
      <div className="flex w-full max-w-[264px] items-center gap-2 rounded-full border border-white/60 bg-white/[0.64] px-3 shadow-sm backdrop-blur">
        {Array.from({ length: count }, (_, index) => (
          // 指示条本身只有 4px 高，手指几乎按不中。按钮用内边距把可点区域撑到 24px
          // （WCAG 2.5.8 AA 的下限），撑出来的部分是透明的，视觉仍是那根细条。
          <button
            key={`${labels[index] || '卡片'}-${index}`}
            type="button"
            onClick={() => onSelect?.(index)}
            aria-label={labels[index] || `第 ${index + 1} 张`}
            className="flex flex-1 items-center py-2.5"
          >
            <span
              className={`block h-1 w-full rounded-full transition-all ${index === activeIndex ? 'bg-[#20CDB6] shadow-[0_0_8px_rgba(32,205,182,0.38)]' : 'bg-[#20CDB6]/[0.20]'}`}
            />
          </button>
        ))}
      </div>
    </footer>
  )
}
