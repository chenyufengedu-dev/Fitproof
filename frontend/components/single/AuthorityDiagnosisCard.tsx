import { useLayoutEffect, useRef, useState } from 'react'
import type { EvidenceEntry, VerifyResult } from '@/types'
import EvidenceStrength from '@/components/verify/EvidenceStrength'
import VerdictBlock from '@/components/verify/VerdictBlock'
import ClaimOrigin from '@/components/verify/ClaimOrigin'
import { uniqueEvidenceById } from '@/components/verify/EvidenceCitation'
import { VerdictStamp, stampTone } from '@/components/single/shared'

export default function AuthorityDiagnosisCard({ result, citations, origin, onOpenEvidence, animate = false }: { result: VerifyResult; citations: EvidenceEntry[]; origin?: NonNullable<VerifyResult['claim_origin']>; onOpenEvidence: (evidence: EvidenceEntry[]) => void; animate?: boolean }) {
  // 检索到但未被采信的文献（降级案例）：按 source_doc 去重，用于「未命中出处」处诚实列出，
  // 解释「检索到了、但研判不足以支撑」，避免与思考过程「检索到 N 篇」自相矛盾。
  const reviewedDocs = Array.from(
    new Map((result.evidence || []).filter((item) => item.source_doc).map((item) => [item.source_doc, item] as const)).values()
  )
  const displayVerdict = result.verdict.trim() === '证据不足' ? '证据不足，不建议采纳' : result.verdict
  const verdictCharacters = Array.from(displayVerdict)
  const correctionCharacters = Array.from(result.correction)
  const totalCharacters = verdictCharacters.length + correctionCharacters.length
  const [revealedCount, setRevealedCount] = useState(0)
  const [revealComplete, setRevealComplete] = useState(false)
  const cardRef = useRef<HTMLElement | null>(null)

  // 揭示不在挂载时就跑 —— 诊断卡结果一到就渲染，但常在屏幕下方，
  // 用户还在上面看核验过程，等滑下来揭示早演完了（只剩盖章）。
  // 改为 IntersectionObserver：卡片真正进入视口才开始，保证从头看到逐字。
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // animate=false：该说法在打开诊断前已核验完成 → 直接静态呈现完整结论，
    // 不再逐字"揭示"一遍（对已完成的结果重放打字机是无意义的特效，反而不可信）。
    // 只有打开时还在实时核验（未完成）才逐字揭示，那是真实进行中的过程。
    if (!animate || reducedMotion || totalCharacters === 0) {
      setRevealedCount(totalCharacters)
      setRevealComplete(true)
      return
    }
    setRevealedCount(0)
    setRevealComplete(false)

    const timers: number[] = []
    let started = false
    // 分段揭示：先逐字出 verdict → 停顿 → 逐字出 correction → 停顿 → 盖章。
    // 每字 48ms（比原来慢），加两处停顿，让用户看清每一段而不是一闪而过。
    const CHAR_MS = 48
    const PAUSE_AFTER_VERDICT = 450
    const PAUSE_BEFORE_STAMP = 550
    const vLen = verdictCharacters.length
    const startReveal = () => {
      if (started) return
      started = true
      const revealRange = (from: number, to: number, onDone: () => void) => {
        let count = from
        const t = window.setInterval(() => {
          count += 1
          setRevealedCount(count)
          if (count >= to) { window.clearInterval(t); onDone() }
        }, CHAR_MS)
        timers.push(t)
      }
      revealRange(0, vLen, () => {
        timers.push(window.setTimeout(() => {
          revealRange(vLen, totalCharacters, () => {
            timers.push(window.setTimeout(() => setRevealComplete(true), PAUSE_BEFORE_STAMP))
          })
        }, PAUSE_AFTER_VERDICT))
      })
    }

    // 用滚动监听 + getBoundingClientRect 判断卡片是否进入视口，而不是
    // IntersectionObserver —— IO 在这个 fixed 覆盖层 + 内部滚动的上下文里不触发。
    // capture:true 让 window 也能收到内部滚动容器冒泡上来的 scroll。
    const node = cardRef.current
    const inView = () => {
      if (!node) return true
      const rect = node.getBoundingClientRect()
      const vh = window.innerHeight || document.documentElement.clientHeight
      return rect.top < vh * 0.85 && rect.bottom > vh * 0.15
    }
    const check = () => { if (inView()) { cleanup(); startReveal() } }
    const cleanup = () => {
      window.removeEventListener('scroll', check, true)
      window.removeEventListener('resize', check)
    }
    if (!node || inView()) {
      startReveal()
    } else {
      window.addEventListener('scroll', check, true)
      window.addEventListener('resize', check)
      // 兜底：万一滚动事件收不到，最迟 6s 后也开始，绝不让文字永远空着。
      // 设得足够长，避免用户还在上面看核验过程时就提前把揭示演掉。
      timers.push(window.setTimeout(startReveal, 6000))
    }
    return () => { cleanup(); timers.forEach((id) => { window.clearInterval(id); window.clearTimeout(id) }) }
  }, [displayVerdict, result.correction, totalCharacters, animate])

  const revealedVerdict = verdictCharacters.slice(0, Math.min(revealedCount, verdictCharacters.length)).join('')
  const revealedCorrection = correctionCharacters.slice(0, Math.max(0, revealedCount - verdictCharacters.length)).join('')
  const verdictComplete = revealedCount >= verdictCharacters.length
  const riskColor = stampTone(result.risk_level)
  return <section ref={cardRef} data-clinical-report className="relative z-[1] overflow-hidden rounded-[8px] border border-[#D7DEDF] bg-[#FFFEFC] shadow-[0_4px_14px_rgba(38,50,63,0.06)]">
    <div data-report-conclusion className="relative px-4 pb-3.5 pt-4" style={{ borderTop: `3px solid ${riskColor}` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="t-label font-semibold text-[#526171]">核验结论</p>
          <p data-diagnosis-verdict className="font-report t-verdict relative mt-1 font-bold leading-snug tracking-[0.01em]" aria-label={verdictComplete ? undefined : displayVerdict} style={{ color: riskColor }}>{verdictComplete ? displayVerdict : <><span aria-hidden="true" style={{ visibility: 'hidden' }}>{displayVerdict}</span><span aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>{revealedVerdict}</span></>}</p>
          <p className="font-report t-meta mt-1.5 text-[#67748A]">风险等级：{result.risk_level || '未标注'}　依据当前检索结果</p>
        </div>
        {revealComplete ? <VerdictStamp verdict={displayVerdict} riskLevel={result.risk_level} /> : <span aria-hidden="true" className="h-[84px] w-[84px] shrink-0" />}
      </div>
    </div>
    <div className="border-t border-[#D9DEDF] px-4 py-3.5">
      <p className="t-label mb-2.5 font-semibold text-[#3F4D5C]">判断依据</p>
      <EvidenceStrength embedded variant="clinical" tier={result.evidence_tier || '无'} strength={result.strength || ''} org={citations[0]?.org} sourceDoc={citations[0]?.source_doc} />
      {citations.length > 0 ? <div data-clinical-citations className="mt-3 border-t border-[#D9DEDF] pt-2.5"><div className="divide-y divide-[#E2E6E7]">{citations.map((item, index) => <button key={[item.source_doc, item.org, item.page, index].join('|')} type="button" onClick={() => onOpenEvidence(citations)} className="flex w-full items-center gap-2.5 py-2.5 text-left"><span className="font-cite t-meta shrink-0 text-[#73808D]">[{index + 1}]</span><span className="min-w-0 flex-1"><span className="font-cite t-label block truncate font-semibold text-[#253242]">《{item.source_doc}》</span><span className="font-cite t-meta mt-0.5 block truncate text-[#67748A]">{item.org || '来源机构未标注'}{item.year ? ` · ${item.year}` : ''}{item.page ? ` · P.${item.page}` : ''}</span></span><span className="text-[#929EAA]">›</span></button>)}</div></div> : reviewedDocs.length > 0 ? <div data-clinical-citations className="mt-3 border-t border-[#D9DEDF] pt-2.5"><p className="t-meta mb-1.5 leading-relaxed text-[#667586]">检索到相关文献，但不足以直接支撑该说法：</p><div className="divide-y divide-[#E2E6E7]">{reviewedDocs.map((item, index) => <button key={[item.source_doc, item.org, index].join('|')} type="button" onClick={() => onOpenEvidence(reviewedDocs)} className="flex w-full items-start gap-2.5 py-2.5 text-left"><span className="font-cite t-meta mt-0.5 shrink-0 text-[#73808D]">[{index + 1}]</span><span className="min-w-0 flex-1"><span className="font-cite t-label line-clamp-2 font-semibold text-[#394757]">《{item.source_doc}》</span><span className="font-cite t-meta mt-0.5 block truncate text-[#7A8794]">{item.org || '来源机构未标注'}{item.year ? ` · ${item.year}` : ''}{item.page ? ` · P.${item.page}` : ''}</span></span><span className="mt-1 shrink-0 text-[#9BA6B0]">›</span></button>)}</div></div> : <p data-clinical-citations className="t-meta mt-3 border-t border-[#D9DEDF] pt-2.5 leading-relaxed text-[#667586]">当前未检索到相关权威文献。</p>}
      {origin ? <ClaimOrigin origin={origin} embedded variant="clinical" /> : null}
      <div className="mt-3 border-t border-[#D9DEDF] pt-3"><p data-correction-icon className="t-label font-semibold text-[#3F4D5C]">更准确的说法</p><p className="font-report t-label mt-2 text-[13px] leading-[1.7] text-[#394757]" aria-label={revealComplete ? undefined : result.correction} style={revealComplete ? undefined : { position: 'relative' }}>{revealComplete ? result.correction : <><span aria-hidden="true" style={{ visibility: 'hidden' }}>{result.correction}</span><span aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>{revealedCorrection}</span></>}</p></div>
    </div>
  </section>
}
