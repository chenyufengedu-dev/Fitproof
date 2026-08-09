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
      <div className="flex h-[18px] w-full max-w-[264px] items-center gap-2 rounded-full border border-white/60 bg-white/[0.64] px-3 shadow-sm backdrop-blur">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={`${labels[index] || '卡片'}-${index}`}
            type="button"
            onClick={() => onSelect?.(index)}
            aria-label={labels[index] || `第 ${index + 1} 张`}
            className={`h-1 flex-1 rounded-full transition-all ${index === activeIndex ? 'bg-[#20CDB6] shadow-[0_0_8px_rgba(32,205,182,0.38)]' : 'bg-[#20CDB6]/[0.20]'}`}
          />
        ))}
      </div>
    </footer>
  )
}
