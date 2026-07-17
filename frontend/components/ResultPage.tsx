'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Analysis, Authority, ChatMessage, Misleading, Reference, VideoRef } from '@/types'

interface ResultPageProps {
  analysis: Analysis
  topic: string
  history: ChatMessage[]
  onFollowup: (question: string) => Promise<void>
  onViewRefs: (focusId?: number) => void
  onBack: () => void
}

interface DrawerItem {
  main: string
  sub?: string
  href?: string
  hrefLabel?: string
}
interface DrawerData {
  title: string
  items: DrawerItem[]
}

function authorityIndexForId(id: string, authorities: Authority[]) {
  const direct = authorities.findIndex((a) => a.id === id)
  if (direct >= 0) return direct

  const numeric = id.match(/\d+/)?.[0]
  if (!numeric) return -1
  const byNumber = Number(numeric) - 1
  return byNumber >= 0 && byNumber < authorities.length ? byNumber : -1
}

/* ---------- 引用小标签：点击弹底部抽屉 ---------- */
function VideoChip({ refs, onOpen }: { refs?: VideoRef[]; onOpen: (r: VideoRef[]) => void }) {
  if (!refs || refs.length === 0) return null
  return (
    <button
      onClick={() => onOpen(refs)}
      className="ml-1 inline-flex items-center rounded-full border border-zinc-200 px-2 py-0.5 align-middle text-[11px] text-zinc-500 transition hover:border-zinc-900 hover:text-zinc-900"
    >
      出处
    </button>
  )
}

function AuthChips({
  ids,
  authorities,
  onOpen,
}: {
  ids?: string[]
  authorities: Authority[]
  onOpen: (n: number) => void
}) {
  if (!ids || ids.length === 0) return null
  const nums = ids
    .map((id) => authorityIndexForId(id, authorities))
    .filter((i) => i >= 0)
    .map((i) => i + 1)
  if (nums.length === 0) return null
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-top">
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => onOpen(n)}
          className="relative -top-1 inline-flex min-w-[1.35rem] items-center justify-center rounded-full border border-[#20CDB6]/30 bg-[#e9fbf8] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#0b6e63] shadow-sm transition hover:border-[#128f80] hover:bg-[#20CDB6] hover:text-white"
        >
          [{n}]
        </button>
      ))}
    </span>
  )
}

function ScreenChip({ text, onOpen }: { text?: string; onOpen: (t: string) => void }) {
  if (!text) return null
  return (
    <button
      onClick={() => onOpen(text)}
      className="ml-1 inline-flex items-center rounded-full border border-violet-200 px-2 py-0.5 align-middle text-[11px] text-violet-600 transition hover:border-violet-500"
    >
      画面
    </button>
  )
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button,a,input,textarea,select,[role="button"]'))
}

type SupportLevel = '高' | '中' | '低'

const SUPPORT_META: Record<SupportLevel, { color: string; track: string; description: string }> = {
  高: {
    color: '#20CDB6',
    track: '#dcefed',
    description: '证据支持度较高，视频出处、专业依据与说法一致性较充分。',
  },
  中: {
    color: '#F4B740',
    track: '#f7ead0',
    description: '证据支持度中等，部分说法仍需结合适用条件理解。',
  },
  低: {
    color: '#F05D5E',
    track: '#f8dddd',
    description: '证据支持度较低，当前材料不足以形成稳定判断。',
  },
}

function EvidenceGauge({ level, label }: { level: SupportLevel; label: string }) {
  const meta = SUPPORT_META[level]
  const sweep = level === '高' ? 300 : level === '中' ? 230 : 150
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${meta.color} ${sweep}deg, ${meta.track} 0deg)`,
        }}
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-white">
          <span className="text-xl font-bold" style={{ color: meta.color }}>
            {level}
          </span>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: meta.color }}>
          {label}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{meta.description}</p>
      </div>
    </div>
  )
}

function MetricCard({ label, value, tone = 'teal' }: { label: string; value: string; tone?: 'teal' | 'dark' | 'amber' }) {
  const cls =
    tone === 'teal'
      ? 'border-[#20CDB6]/25 bg-[#20CDB6]/10 text-[#117f73]'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-[#0B6E63] bg-[#0B6E63] text-white'
  return (
    <div className={`rounded-2xl border px-3 py-3 ${cls}`}>
      <p className="text-[11px] opacity-75">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
    </div>
  )
}

function VideoSourceMark({
  label,
  tone = 'teal',
}: {
  label: string
  align?: 'left' | 'right'
  tone?: 'teal' | 'blue'
}) {
  const cls =
    tone === 'teal'
      ? 'border-[#20CDB6]/30 bg-[#20CDB6]/10 text-[#128f80]'
      : 'border-sky-200 bg-sky-50 text-sky-700'
  const src = tone === 'teal' ? '/brand/portrait-teal.png' : '/brand/portrait-blue.png'
  return (
    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border shadow-sm ${cls}`}>
      <img src={src} alt="" aria-hidden className="h-9 w-9 object-contain" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

function ComparisonVideoTile({ label, reference, tone }: { label: string; reference?: Reference; tone: 'teal' | 'blue' }) {
  const palette = tone === 'teal'
    ? 'border-[#CDEDE7] bg-[#F4FCFA] text-[#078C7E]'
    : 'border-[#DCE8F8] bg-[#F5F9FF] text-[#5C7EB4]'
  return (
    <div className={`min-w-0 rounded-[13px] border p-1 ${palette}`}>
      <p className="text-[10px] font-black">{label}</p>
      <div className="mt-0.5 flex items-stretch gap-1">
        <span className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-[9px] border bg-white/80 ${tone === 'teal' ? 'border-[#BFECE5]' : 'border-sky-200'}`} aria-label={`${label} 画面占位`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="m10 8 5 4-5 4V8Z" fill="currentColor" stroke="none" /></svg>
        </span>
        <p className="h-[30px] min-w-0 flex-1 overflow-hidden text-[10px] font-medium leading-[15px] text-slate-800" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{shortVideoPoint(reference?.claim || reference?.title || '视频观点待补充')}</p>
      </div>
    </div>
  )
}

function shortVideoPoint(text: string) {
  const compact = text.replace(/\s+/g, '').replace(/[。；;，,].*$/, '').trim()
  return Array.from(compact).length > 12 ? `${Array.from(compact).slice(0, 12).join('')}…` : compact
}

function ConclusionMetric({ label, value, tone, icon }: { label: string; value: string; tone: 'teal' | 'dark' | 'amber' | 'blue'; icon: React.ReactNode }) {
  const cls = tone === 'dark' ? 'border-[#CDEDE7] bg-[#E8F8F5] text-[#078C7E]' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700' : tone === 'blue' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-[#CDEDE7] bg-[#F3FBF9] text-[#078C7E]'
  return <div className={`flex min-w-0 items-center justify-center gap-1 rounded-[9px] border px-1 py-1.5 ${cls}`}><span className="shrink-0">{icon}</span><span className="min-w-0"><span className="block truncate text-[8px] leading-none opacity-80">{label}</span><span className="mt-0.5 block text-[13px] font-black leading-none">{value}</span></span></div>
}

export default function ResultPage({
  analysis,
  topic,
  history,
  onFollowup,
  onBack,
}: ResultPageProps) {
  const [index, setIndex] = useState(0)
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [drawer, setDrawer] = useState<DrawerData | null>(null)
  const [dragDir, setDragDir] = useState<-1 | 1 | null>(null)
  const [expandedConclusion, setExpandedConclusion] = useState(false)
  const [expandedConsensus, setExpandedConsensus] = useState<Record<number, boolean>>({})
  const [expandedConflictDetail, setExpandedConflictDetail] = useState<Record<string, boolean>>({})

  const exportRef = useRef<HTMLDivElement>(null)
  const frontRef = useRef<HTMLDivElement>(null)
  const behindRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const mxRef = useRef(0)
  const axisLock = useRef<null | 'x' | 'y'>(null)
  const dragActive = useRef(false)
  const dragDirRef = useRef<-1 | 1 | null>(null)
  const animating = useRef(false)

  const authorities = analysis.authorities || []
  const misleading = analysis.misleading || []
  const evidenceSupportLevel: SupportLevel =
    authorities.length >= 2 && analysis.references.length >= 2
      ? '高'
      : authorities.length >= 1 || analysis.references.length >= 2
        ? '中'
        : '低'
  const firstReference = analysis.references[0]
  const secondReference = analysis.references[1]
  const conclusionScore = Math.max(58, Math.min(92, 62 + authorities.length * 6 + analysis.references.length * 4 + analysis.consensus.length * 3 - analysis.conflicts.length * 3 - misleading.length * 2))
  const conclusionVerdict = analysis.conflicts.length > 0
    ? '部分成立'
    : misleading.length > 0
      ? '需要条件理解'
      : '基本成立'
  const roughConclusion = analysis.conflicts.length > 0
    ? '两种说法均部分成立'
    : misleading.length > 0
      ? '视频观点需谨慎理解'
      : '两种说法基本一致'
  const decisionBasis = [
    { label: '减脂目标', text: analysis.consensus[0]?.point || '两条视频均提供了与减脂相关的观点。', tone: 'teal' },
    { label: '主要分歧', text: analysis.conflicts[0]?.topic || '当前未识别到需要单列的核心分歧。', tone: 'blue' },
    { label: '适用前提', text: analysis.recommendations[0]?.condition || '建议结合运动强度、目标和个人身体状态理解。', tone: 'teal' },
    { label: '风险提示', text: misleading[0]?.claim || '如有不适或基础疾病，应优先结合专业建议判断。', tone: 'amber' },
  ]
  const refById = useMemo(() => {
    const m: Record<number, Reference> = {}
    for (const r of analysis.references) m[r.id] = r
    return m
  }, [analysis.references])

  const openVideo = (refs: VideoRef[]) =>
    setDrawer({
      title: '视频出处',
      items: refs.map((r) => {
        const v = refById[r.id]
        return {
          main: `视频${r.id}${v ? `《${v.title}》` : ''}`,
          sub: `${v ? v.author + ' · ' : ''}第 ${r.time}`,
          href: v?.url,
          hrefLabel: '看原视频',
        }
      }),
    })
  const openAuthority = (num: number) => {
    const a = authorities[num - 1]
    if (!a) return
    setDrawer({ title: `参考文献 [${num}]`, items: [{ main: a.name, sub: a.note }] })
  }
  const openScreen = (text: string) =>
    setDrawer({ title: 'AI 从画面识别到的信息', items: [{ main: text }] })

  const makeVideoItems = (refs: VideoRef[]): DrawerItem[] => {
    const seen = new Set<string>()
    return refs
      .filter((r) => {
        const key = `${r.id}-${r.time}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((r) => {
        const v = refById[r.id]
        return {
          main: `视频${r.id}${v ? `《${v.title}》` : ''}`,
          sub: `${v ? `${v.author} · ` : ''}第 ${r.time}`,
          href: v?.url,
          hrefLabel: '看原视频',
        }
      })
  }

  const makeAuthorityItems = (ids: string[]): DrawerItem[] => {
    const seen = new Set<number>()
    return ids
      .map((id) => authorityIndexForId(id, authorities))
      .filter((i) => {
        if (i < 0 || seen.has(i)) return false
        seen.add(i)
        return true
      })
      .map((i) => {
        const a = authorities[i]
        return {
          main: `[E${i + 1}] ${a.name}`,
          sub: a.note,
        }
      })
  }

  const makeEvidenceItems = ({
    videoRefs = [],
    authorityIds = [],
    all = false,
  }: {
    videoRefs?: VideoRef[]
    authorityIds?: string[]
    all?: boolean
  }) => {
    const videoItems: DrawerItem[] = all
      ? analysis.references.map((r) => ({
          main: `视频${r.id}《${r.title}》`,
          sub: `${r.author} · 核心主张：${r.claim}`,
          href: r.url,
          hrefLabel: '看原视频',
        }))
      : makeVideoItems(videoRefs)
    const authorityItems: DrawerItem[] = all
      ? authorities.map((a, i) => ({
          main: `[E${i + 1}] ${a.name}`,
          sub: a.note,
        }))
      : makeAuthorityItems(authorityIds)
    return [
      ...(videoItems.length ? [{ main: '视频出处', sub: '来自待核验短视频的作者、标题、核心主张与原链接。' }] : []),
      ...videoItems,
      ...(authorityItems.length ? [{ main: '专业依据', sub: '用于辅助判断运动健康说法的指南、文献或机构建议。' }] : []),
      ...authorityItems,
    ]
  }

  const openEvidenceItems = (title: string, items: DrawerItem[]) => {
    if (items.length === 0) return
    setDrawer({
      title,
      items,
    })
  }

  function conflictConfidence(authorityCount: number, videoRefCount: number, hasEvidenceNote: boolean) {
    return Math.min(95, 62 + authorityCount * 10 + videoRefCount * 4 + (hasEvidenceNote ? 8 : 0))
  }

  function conflictSupportLevel(authorityCount: number, videoRefCount: number, hasEvidenceNote: boolean) {
    const score = conflictConfidence(authorityCount, videoRefCount, hasEvidenceNote)
    if (score >= 82) return '较高'
    if (score >= 68) return '中等'
    return '较低'
  }

  function conflictRisk(note?: string) {
    if (!note) return '待核验'
    if (/低血糖|危险|风险|不建议|晕厥|夸大/.test(note)) return '需谨慎'
    return '风险可控'
  }

  function conflictDecision(note?: string) {
    if (!note) return '待补充依据'
    if (/低血糖|危险|风险|不建议|晕厥|夸大/.test(note)) return '需要加条件'
    return '结合边界理解'
  }

  // 通用：从某一方的视频出处取真实“视频N · 作者”标签（任意话题适用，无写死文案）
  function sideLabel(refs?: VideoRef[]) {
    if (!refs || refs.length === 0) return '视频说法'
    const v = refById[refs[0].id]
    return `视频${refs[0].id}${v ? ' · ' + v.author : ''}`
  }

  function shortenArgument(text: string) {
    const cleaned = text.replace(/[。；;，,]/g, ' ').replace(/\s+/g, ' ').trim()
    return cleaned.length > 28 ? `${cleaned.slice(0, 28)}…` : cleaned
  }

  function boundaryTone(text: string) {
    return /不建议|不要|避免|风险|低血糖|谨慎|咨询/.test(text) ? '谨慎理解' : '适用参考'
  }

  function riskPointForMisleading(item: Misleading) {
    const text = `${item.claim} ${item.correction}`
    if (/低血糖|晕厥|发慌|乏力/.test(text)) {
      return '可能低估低血糖等安全风险，让用户在不适时继续运动。'
    }
    if (/必须|一定|马上|立即|否则/.test(text)) {
      return '把条件性建议说成绝对要求，容易忽略运动强度、目标和个体差异。'
    }
    if (/肌肉|掉肌肉|糖原|蛋白质分解/.test(text)) {
      return '可能夸大短时中低强度运动带来的肌肉流失风险。'
    }
    if (/高强度|提高强度|运动量提上去/.test(text)) {
      return '可能把高风险处理方式包装成通用做法，不适合直接照搬。'
    }
    return '表达可能过于绝对，容易让用户忽略适用人群、运动强度和自身状态。'
  }

  function actionAttention(advice: string) {
    if (/低血糖|发慌|乏力|糖尿病/.test(advice)) {
      return '优先关注血糖和不适反应，出现异常应停止运动并及时补充能量。'
    }
    if (/不建议|不要|避免/.test(advice)) {
      return '这类情况不适合直接照搬视频做法，应先降低强度或换更稳妥方式。'
    }
    if (/咨询|医生|疾病|患者/.test(advice)) {
      return '如果已有疾病、用药或反复不适，应结合专业人员建议再行动。'
    }
    if (/风险|谨慎/.test(advice)) {
      return '先从低强度和短时长开始，观察身体反馈后再调整。'
    }
    return '保持中低强度、循序渐进，并根据身体反馈调整。'
  }

  async function ask(text: string) {
    const q = text.trim()
    if (!q || sending) return
    setSending(true)
    setQuestion('')
    try {
      await onFollowup(q)
    } finally {
      setSending(false)
    }
  }
  function handleSend() {
    void ask(question)
  }

  // 通用建议问题（与具体话题无关，任意 demo 适用）
  const QUICK_QUESTIONS = ['这些说法我到底该信谁？', '帮我用大白话总结一下', '里面有哪些我可能不懂的概念？']

  async function handleExport() {
    setExportError('')
    if (!exportRef.current) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(exportRef.current, { backgroundColor: '#f3fbf9', scale: 2 })
      const link = document.createElement('a')
      link.download = `${topic}-FitProof核验报告.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      setExportError('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  /* ---------- 各区块内容 ---------- */
  type Section = {
    key: string
    label: string
    node: React.ReactNode
    exportable: boolean
    evidenceItems?: DrawerItem[]
    evidenceLabel?: string
    evidenceTitle?: string
  }
  const sections: Section[] = []

  sections.push({
    key: 'conclusion',
    label: '核验结论',
    exportable: true,
    evidenceItems: makeEvidenceItems({ all: true }),
    evidenceLabel: '查看全部依据',
    evidenceTitle: '全部依据',
    node: (
      <div className="space-y-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-1">
          <ComparisonVideoTile label="视频 A" reference={firstReference} tone="teal" />
          <svg className="h-4 w-4 justify-self-center text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="视频观点对照"><path d="M3 8h13m0 0-3-3m3 3-3 3M21 16H8m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <ComparisonVideoTile label="视频 B" reference={secondReference} tone="blue" />
        </div>

        <section className="rounded-[16px] border border-[#CDEDE7] bg-white px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-[#078C7E] px-2 py-0.5 text-[9px] font-black tracking-wide text-white">AI 综合结论</span>
            <span className="rounded-full bg-[#E6F8F4] px-2 py-0.5 text-[9px] font-black text-[#078C7E]">{conclusionVerdict}</span>
          </div>
          <p className="mt-1 text-[16px] font-black leading-[1.25] text-slate-950">{roughConclusion}</p>
          <div className="mt-0.5 flex items-end gap-1">
            <p className="min-w-0 flex-1 text-[10px] leading-[1.35] text-[#64748B]" style={expandedConclusion ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>更准确的结论：{analysis.one_line_summary}</p>
            {Array.from(analysis.one_line_summary).length > 42 && <button type="button" onClick={() => setExpandedConclusion((open) => !open)} className="mb-0.5 shrink-0 p-0.5 text-[#078C7E]" aria-label={expandedConclusion ? '收起完整结论' : '展开完整结论'}><svg className={`h-3.5 w-3.5 transition-transform ${expandedConclusion ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
          </div>
        </section>

        <section className="flex items-center gap-2.5 rounded-[15px] border border-[#CDEDE7] bg-white px-2.5 py-1.5">
          <div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#20CDB6 ${conclusionScore * 3.6}deg, #DCEFED 0deg)` }}>
            <div className="flex h-[39px] w-[39px] flex-col items-center justify-center rounded-full bg-white text-center"><span className="text-[15px] font-black leading-none text-[#078C7E]">{conclusionScore}<small className="text-[8px]">%</small></span><span className="mt-0.5 text-[7px] leading-none text-slate-400">结论信度</span></div>
          </div>
          <p className="border-l border-[#BFECE5] pl-2.5 text-[10px] leading-[1.35] text-[#5E6E89]">依据视频出处、专业依据与分歧情况综合判断；信度会随证据完整度动态变化。</p>
        </section>

        <div className="grid grid-cols-4 gap-1.5">
          <ConclusionMetric label="视频观点" value={`${analysis.references.length} 条`} tone="teal" icon={<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5.5h11A3.5 3.5 0 0 1 18.5 9v5A3.5 3.5 0 0 1 15 17.5H9l-4.5 3v-3.8A3.5 3.5 0 0 1 2 13.5V9A3.5 3.5 0 0 1 5.5 5.5Z" /></svg>} />
          <ConclusionMetric label="专业依据" value={`${authorities.length} 条`} tone="dark" icon={<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" /></svg>} />
          <ConclusionMetric label="风险提示" value={`${misleading.length} 项`} tone="amber" icon={<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 4 3.5 19h17L12 4Z" strokeLinejoin="round" /><path d="M12 9v4M12 16v.1" strokeLinecap="round" /></svg>} />
          <ConclusionMetric label="适用条件" value={`${analysis.recommendations.length} 项`} tone="blue" icon={<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3" /><path d="M5.5 21c.7-4.1 3.1-6.2 6.5-6.2s5.8 2.1 6.5 6.2" strokeLinecap="round" /></svg>} />
        </div>

        <section className="rounded-[15px] border border-[#CDEDE7] bg-white p-2">
          <p className="flex items-center gap-1.5 text-[13px] font-black text-slate-900"><span className="grid h-5 w-5 place-items-center rounded-[6px] bg-[#E6F8F4] text-[#078C7E]"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>判断依据</p>
          <div className="mt-1 space-y-1">
            {decisionBasis.map((item, index) => <div key={item.label} className="flex items-center gap-1.5 rounded-[8px] bg-[#F7FBFB] px-1.5 py-1"><span className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full ${item.tone === 'amber' ? 'bg-amber-100 text-amber-600' : item.tone === 'blue' ? 'bg-sky-100 text-sky-600' : 'bg-[#E6F8F4] text-[#078C7E]'}`}>{index === 0 ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" /></svg> : index === 1 ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8h12m0 0-3-3m3 3-3 3M20 16H8m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" /></svg> : index === 2 ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3" /><path d="M6.5 20c.7-3.5 2.5-5.2 5.5-5.2s4.8 1.7 5.5 5.2" strokeLinecap="round" /></svg> : <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5 4.5 19h15L12 5Z" strokeLinejoin="round" /><path d="M12 10v4M12 16v.1" strokeLinecap="round" /></svg>}</span><p className="min-w-0 truncate text-[9px] leading-tight text-[#5E6E89]"><b className="text-slate-800">{item.label}：</b>{item.text}</p></div>)}
          </div>
        </section>

        <section className="flex items-center gap-1.5 overflow-hidden rounded-[14px] border border-[#CDEDE7] bg-white px-2 py-1.5"><span className="flex shrink-0 items-center gap-1 text-[11px] font-black text-slate-900"><svg className="h-3.5 w-3.5 text-[#20CDB6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" /></svg>核心提示</span><span className="core-tip-tags flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap" style={{ scrollbarWidth: 'none' }}><span className="rounded-full bg-[#E6F8F4] px-1.5 py-0.5 text-[9px] font-medium text-[#078C7E]">结合条件采用</span><span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">注意风险边界</span><span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-medium text-sky-700">重视运动后恢复</span></span></section>
      </div>
    ),
  })

  sections.push({
    key: 'consensus',
      label: '共识基础',
    exportable: true,
    evidenceItems: makeEvidenceItems({
      videoRefs: analysis.consensus.flatMap((c) => c.video_refs || []),
      authorityIds: analysis.consensus.flatMap((c) => c.authority_ids || []),
    }),
    node: (
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-medium">
          <span className="rounded-full border border-[#E2EAF0] bg-[#F8FAFC] px-2.5 py-1 text-[#64748B]">视频观点</span>
          <span className="h-px flex-1 border-t border-dashed border-[#BFECE5]" />
          <span className="rounded-full bg-[#E6F8F4] px-2.5 py-1 text-[#078C7E]">AI 对齐</span>
          <span className="h-px flex-1 border-t border-dashed border-[#BFECE5]" />
          <span className="rounded-full bg-[#078C7E] px-2.5 py-1 text-white">共同基础</span>
        </div>
        <p className="px-0.5 text-[11px] leading-[1.55] text-[#64748B]">AI 提取两个视频中相对一致且成立的部分，作为后续判断争议与风险的共同基础。</p>

        <div className="space-y-2.5">
          {analysis.consensus.map((c, i) => {
            const sourceCount = c.video_refs?.length || 0
            const authorityCount = c.authority_ids?.length || 0
            const support = authorityCount > 1 ? '高' : authorityCount > 0 ? '中高' : '中'
            const isOpen = Boolean(expandedConsensus[i])
            const canExpand = Array.from(c.point).length > 38
            return (
              <section key={i} className="rounded-[18px] border border-[#DCEFED] bg-white px-3 py-3 shadow-[0_8px_20px_rgba(18,116,103,0.06)]">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E6F8F4] text-[#078C7E]">
                    {i % 2 === 0 ? <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 7 3v5c0 4.2-2.8 8-7 10-4.2-2-7-5.8-7-10V6l7-3Z" strokeLinejoin="round" /><path d="m8.5 12 2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" /></svg> : <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" strokeLinecap="round" /></svg>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-black text-[#078C7E]">共识 {i + 1}</p>
                      <span className="flex items-center gap-1 text-[10px] text-[#64748B]">支持度 <b className="text-[#078C7E]">{support}</b><span className="flex items-end gap-0.5 text-[#20CDB6]"><i className="h-2 w-1 rounded-sm bg-current" /><i className="h-3 w-1 rounded-sm bg-current" /><i className="h-4 w-1 rounded-sm bg-current" /><i className={`h-5 w-1 rounded-sm ${support === '高' ? 'bg-current' : 'bg-slate-200'}`} /></span></span>
                    </div>
                    <div className="mt-1 flex items-end gap-1">
                      <p className="min-w-0 flex-1 text-[14px] font-medium leading-[1.45] text-slate-900" style={isOpen ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{c.point}</p>
                      {canExpand && <button type="button" onClick={() => setExpandedConsensus((current) => ({ ...current, [i]: !current[i] }))} aria-label={isOpen ? '收起完整共识' : '展开完整共识'} className="mb-0.5 shrink-0 p-0.5 text-[#078C7E]"><svg className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button type="button" onClick={() => c.video_refs && c.video_refs.length > 0 && openVideo(c.video_refs)} disabled={!sourceCount} className="flex shrink-0 items-center gap-1 rounded-full border border-[#CDEDE7] bg-[#F3FBF9] px-2 py-1 text-[9px] text-[#078C7E]"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7V5Z" /></svg>{sourceCount > 0 ? `来自 ${sourceCount} 处视频观点` : '视频观点待补充'}</button>
                  <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] ${authorityCount ? 'border-[#CDEDE7] bg-white text-[#078C7E]' : 'border-amber-200 bg-amber-50 text-amber-700'}`}><svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 7 3v5c0 4.2-2.8 8-7 10-4.2-2-7-5.8-7-10V6l7-3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" /></svg>{authorityCount ? `来自 ${authorityCount} 处文献/资料支持` : '缺少文献支持 · AI 常识判断'}</span>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    ),
  })

  if (analysis.conflicts.length > 0) {
    sections.push({
      key: 'conflicts',
      label: '分歧诊断',
      exportable: true,
      evidenceItems: makeEvidenceItems({
        videoRefs: analysis.conflicts.flatMap((c) => [
          ...(c.pro.video_refs || []),
          ...(c.con.video_refs || []),
        ]),
        authorityIds: analysis.conflicts.flatMap((c) => c.authority_ids || []),
      }),
      evidenceTitle: '分歧诊断依据',
      node: (
        <div className="space-y-5" data-fitproof-conflict-debate>
          {analysis.conflicts.map((c, i) => {
            const videoRefCount = (c.pro.video_refs?.length || 0) + (c.con.video_refs?.length || 0)
            const authCount = c.authority_ids?.length || 0
            const supportLevel = conflictSupportLevel(authCount, videoRefCount, Boolean(c.evidence_note))
            const strength = conflictConfidence(authCount, videoRefCount, Boolean(c.evidence_note))
            const risk = conflictRisk(c.evidence_note)
            const decision = conflictDecision(c.evidence_note)
            const caution = /需谨慎|待核验/.test(risk)
            const positions = [
              { position: c.pro, tone: 'teal' as const, fallback: '正' },
              { position: c.con, tone: 'blue' as const, fallback: '反' },
            ].sort((a, b) => (a.position.video_refs?.[0]?.id ?? 99) - (b.position.video_refs?.[0]?.id ?? 99))
            const first = positions[0]
            const second = positions[1]
            const firstCreator = first.position.video_refs?.[0] ? refById[first.position.video_refs[0].id]?.author || '视频博主' : '视频博主'
            const secondCreator = second.position.video_refs?.[0] ? refById[second.position.video_refs[0].id]?.author || '视频博主' : '视频博主'
            return (
            <div key={i} className="overflow-hidden rounded-[20px] border border-[#DCEFED] bg-white p-3 shadow-[0_8px_20px_rgba(18,116,103,0.05)]">
              <div className="mb-3 flex items-start gap-2">
                <span className="shrink-0 rounded-full bg-[#E6F8F4] px-2 py-1 text-[10px] font-black text-[#078C7E]">
                  分歧 {i + 1}
                </span>
                <p className="pt-0.5 text-[14px] font-semibold leading-snug text-slate-950">{c.topic}</p>
              </div>

              <div className="space-y-3 text-[13px] leading-relaxed">
                <div className="flex items-start gap-2">
                  <div className="flex w-11 shrink-0 flex-col items-center gap-1 pt-0.5"><VideoSourceMark label={String(first.position.video_refs?.[0]?.id ?? first.fallback)} tone={first.tone} /><span className="max-w-full truncate text-[8px] text-[#078C7E]">{firstCreator}</span></div>
                  <div className="relative min-w-0 flex-1 rounded-[18px] rounded-tl-[6px] border border-[#BFECE5] bg-[#F4FCFA] px-3 py-2.5 shadow-sm"><span className="absolute -left-2 top-4 h-3 w-3 rotate-45 border-b border-l border-[#BFECE5] bg-[#F4FCFA]" />
                    <p className="text-slate-800">{first.position.argument}</p>
                    <div className="relative mt-1.5 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => first.position.video_refs && first.position.video_refs.length > 0 && openVideo(first.position.video_refs)}
                        disabled={!first.position.video_refs || first.position.video_refs.length === 0}
                        className="rounded-full border border-[#BFECE5] bg-white px-2 py-0.5 text-[9px] font-medium text-[#078C7E] transition hover:bg-[#20CDB6] hover:text-white disabled:cursor-default disabled:opacity-60"
                      >
                        查看出处
                      </button>
                      <ScreenChip text={first.position.screen_evidence} onOpen={openScreen} />
                    </div>
                  </div>
                </div>

                <div className="flex items-start justify-end gap-2">
                  <div className="relative min-w-0 flex-1 rounded-[18px] rounded-tr-[6px] border border-sky-200 bg-[#F5F9FF] px-3 py-2.5 text-left shadow-sm"><span className="absolute -right-2 top-4 h-3 w-3 rotate-45 border-r border-t border-sky-200 bg-[#F5F9FF]" />
                    <p className="text-slate-800">{second.position.argument}</p>
                    <div className="relative mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                      <ScreenChip text={second.position.screen_evidence} onOpen={openScreen} />
                      <button
                        type="button"
                        onClick={() => second.position.video_refs && second.position.video_refs.length > 0 && openVideo(second.position.video_refs)}
                        disabled={!second.position.video_refs || second.position.video_refs.length === 0}
                        className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[9px] font-medium text-sky-700 transition hover:bg-sky-500 hover:text-white disabled:cursor-default disabled:opacity-60"
                      >
                        查看出处
                      </button>
                    </div>
                  </div>
                  <div className="flex w-11 shrink-0 flex-col items-center gap-1 pt-0.5"><VideoSourceMark label={String(second.position.video_refs?.[0]?.id ?? second.fallback)} tone={second.tone} /><span className="max-w-full truncate text-[8px] text-sky-700">{secondCreator}</span></div>
                </div>

                {/* 分歧根源 */}
                <div className="rounded-[15px] border border-[#DCE7F2] bg-[#F8FAFC] px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[12px] font-black text-slate-800"><svg className="h-4 w-4 text-[#64748B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18h6M10 22h4M8 14h8c0-2.1 2-3.1 2-6a6 6 0 0 0-12 0c0 2.9 2 3.9 2 6Z" strokeLinecap="round" strokeLinejoin="round" /></svg>分歧根源</p>
                  <div className="mt-1 flex items-end gap-1"><p className="min-w-0 flex-1 text-[11px] leading-[1.55] text-[#52627E]" style={expandedConflictDetail[`${i}-root`] ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }}>一方强调“{first.position.argument}”，另一方强调“{second.position.argument}”，核心差异主要来自适用人群、运动目标、运动强度与风险边界不同。</p><button type="button" onClick={() => setExpandedConflictDetail((current) => ({ ...current, [`${i}-root`]: !current[`${i}-root`] }))} className="mb-0.5 shrink-0 text-[#64748B]" aria-label="展开或收起分歧根源"><svg className={`h-3.5 w-3.5 ${expandedConflictDetail[`${i}-root`] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></div>
                </div>

                {/* FitProof 核验判断：浅青绿医学报告风 */}
                <div className="rounded-[16px] border border-[#BFECE5] bg-[#f3fbf9] px-3 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#20CDB6]" />
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#128f80]">
                      FitProof 核验判断
                    </p>
                  </div>

                  <dl className="space-y-1.5 text-[11px]">
                    <div className="flex items-center gap-2">
                      <dt className="w-16 shrink-0 text-slate-400">判定</dt>
                      <dd className="font-medium text-slate-900">{decision}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="w-16 shrink-0 text-slate-400">误导风险</dt>
                      <dd>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            caution ? 'bg-amber-100 text-amber-700' : 'bg-[#20CDB6]/15 text-[#128f80]'
                          }`}
                        >
                          {risk}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="w-16 shrink-0 text-slate-400">依据强度</dt>
                      <dd className="flex flex-1 items-center gap-2">
                        <span className="font-medium text-[#128f80]">{supportLevel}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#20CDB6]/15">
                          <span className="block h-1.5 rounded-full bg-[#20CDB6]" style={{ width: `${strength}%` }} />
                        </span>
                      </dd>
                    </div>
                  </dl>

                  {c.evidence_note && (
                    <div className="mt-2 border-t border-[#20CDB6]/15 pt-2">
                      <p className="mb-1 text-[10px] font-medium text-slate-400">主流证据说明</p>
                      <div className="flex items-end gap-1"><p className="min-w-0 flex-1 text-[11px] leading-[1.5] text-slate-700" style={expandedConflictDetail[`${i}-evidence`] ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }}>
                        {c.evidence_note}
                        <AuthChips ids={c.authority_ids} authorities={authorities} onOpen={openAuthority} />
                      </p><button type="button" onClick={() => setExpandedConflictDetail((current) => ({ ...current, [`${i}-evidence`]: !current[`${i}-evidence`] }))} className="mb-0.5 shrink-0 text-[#078C7E]" aria-label="展开或收起证据说明"><svg className={`h-3.5 w-3.5 ${expandedConflictDetail[`${i}-evidence`] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )})}
        </div>
      ),
    })
  }

  sections.push({
    key: 'recommendations',
      label: '行动建议',
    exportable: true,
    evidenceItems: makeEvidenceItems({
      videoRefs: analysis.recommendations.flatMap((r) => r.video_refs || []),
      authorityIds: analysis.recommendations.flatMap((r) => r.authority_ids || []),
    }),
    node: (
      <div className="space-y-4">
        <p className="px-1 text-sm leading-relaxed text-slate-500">
          根据视频内容与专业依据，FitProof 将建议按人群和目标拆开。请结合自身健康状况理解。
        </p>
        <div className="space-y-3">
          {analysis.recommendations.map((r, i) => {
            const tone = boundaryTone(`${r.condition} ${r.advice}`)
            const cautious = tone === '谨慎理解'
            return (
              <div
                key={i}
                className={`rounded-[24px] border p-4 shadow-sm ${
                  cautious ? 'border-amber-200 bg-amber-50/70' : 'border-[#20CDB6]/15 bg-white'
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      人群建议 {i + 1}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      cautious ? 'bg-amber-100 text-amber-800' : 'bg-[#20CDB6]/10 text-[#128f80]'
                    }`}
                  >
                    {tone}
                  </span>
                </div>
                <div className="space-y-3 text-[14px] leading-relaxed">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-400">适合谁</p>
                    <p className="font-medium text-slate-950">{r.condition}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-400">建议怎么做</p>
                    <p className="text-slate-700">{r.advice}</p>
                  </div>
                  <div className="rounded-2xl border border-[#20CDB6]/15 bg-[#f3fbf9] px-3 py-2.5">
                    <p className="mb-1 text-[11px] font-semibold text-[#128f80]">需要注意</p>
                    <p className="text-[13px] text-slate-600">{actionAttention(r.advice)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => r.video_refs && r.video_refs.length > 0 && openVideo(r.video_refs)}
                    disabled={!r.video_refs || r.video_refs.length === 0}
                    className="rounded-full border border-[#20CDB6]/20 bg-[#20CDB6]/10 px-2.5 py-1 text-[#128f80] transition hover:border-[#20CDB6] hover:bg-[#20CDB6] hover:text-white disabled:cursor-default disabled:opacity-60"
                  >
                    {r.video_refs && r.video_refs.length > 0 ? '查看视频依据' : '视频依据待展开'}
                  </button>
                  {r.authority_ids && r.authority_ids.length > 0 && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500">
                      含专业依据
                    </span>
                  )}
                  {r.screen_evidence && (
                    <button
                      type="button"
                      onClick={() => openScreen(r.screen_evidence || '')}
                      className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-600 transition hover:border-violet-500"
                    >
                      含画面依据
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    ),
  })

  sections.push({
    key: 'misleading',
    label: '误导风险',
    exportable: true,
    evidenceItems: makeEvidenceItems({
      videoRefs: misleading.flatMap((m) => m.video_refs || []),
      authorityIds: misleading.flatMap((m) => m.authority_ids || []),
    }),
    node: (
      <div className="space-y-4">
        <p className="px-1 text-[13px] leading-relaxed text-slate-500">
          这里单独标出视频中可能被夸大、说得过满或存在风险的表达，帮助你避开误解。
        </p>
        {misleading.length === 0 ? (
          <div className="rounded-3xl border border-[#20CDB6]/15 bg-white px-4 py-5 text-sm leading-relaxed text-slate-500 shadow-sm">
            当前材料中未识别到需要单独标出的高风险表达，可继续查看行动建议。
          </div>
        ) : (
          misleading.map((m, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-[#20CDB6]/15 bg-white p-3 shadow-sm">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                    <span>⚠</span>原视频说法
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                    疑似不准确
                  </span>
                </div>
                <p className="text-[14px] leading-relaxed text-slate-500 line-through decoration-amber-400/70">
                  {m.claim}
                </p>
                {m.video_refs && m.video_refs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openVideo(m.video_refs!)}
                    className="mt-2.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 shadow-sm transition hover:bg-amber-500 hover:text-white"
                  >
                    查看出处
                  </button>
                )}
              </div>

              <div className="my-2 rounded-2xl border border-amber-200/70 bg-white px-4 py-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                  风险点
                </p>
                <p className="text-[13px] leading-relaxed text-slate-700">{riskPointForMisleading(m)}</p>
              </div>

              <div className="rounded-2xl border border-[#20CDB6]/25 bg-[#f3fbf9] px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#20CDB6] text-[11px] text-white">
                    ✓
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#128f80]">
                    更准确的说法
                  </span>
                </div>
                <p className="text-[14px] leading-relaxed text-slate-800">
                  {m.correction}
                  <AuthChips ids={m.authority_ids} authorities={authorities} onOpen={openAuthority} />
                </p>
              </div>
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  相关依据
                </p>
                <p className="text-[13px] leading-relaxed text-slate-600">
                  {m.video_refs && m.video_refs.length > 0 ? `涉及 ${m.video_refs.length} 处视频出处` : '视频出处待补充'}
                  {m.authority_ids && m.authority_ids.length > 0 ? '，含专业依据' : '，暂无专业依据编号'}
                  <AuthChips ids={m.authority_ids} authorities={authorities} onOpen={openAuthority} />
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    ),
  })

  sections.push({
    key: 'followup',
    label: 'AI 答疑',
    exportable: false,
    node: (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-[13px] leading-relaxed text-slate-500">
          只基于以上已核验内容作答，不引入外部信息；看不懂的概念可以直接问。
        </p>

        <div className="flex-1 space-y-2.5 overflow-y-auto">
          {history.length === 0 && (
            <div className="space-y-2.5">
              <div className="flex items-end justify-between gap-3 px-1">
                <p className="pb-1 text-[12px] text-slate-400">试试这些问题：</p>
                <img
                  src="/brand/cat-lie.png"
                  alt=""
                  aria-hidden
                  className="fitproof-cat-float pointer-events-none w-20 shrink-0 drop-shadow-[0_12px_18px_rgba(15,118,110,0.12)]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => void ask(q)}
                    disabled={sending}
                    className="rounded-full border border-[#20CDB6]/25 bg-[#20CDB6]/[0.08] px-3 py-1.5 text-[13px] text-[#128f80] transition hover:bg-[#20CDB6] hover:text-white disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((m, i) => (
            <div
              key={i}
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'ml-auto rounded-br-md bg-[#20CDB6] text-white'
                  : 'mr-auto rounded-bl-md border border-[#20CDB6]/20 bg-[#f3fbf9] text-slate-700'
              }`}
            >
              {m.content}
            </div>
          ))}

          {sending && (
            <div className="mr-auto rounded-2xl rounded-bl-md border border-[#20CDB6]/20 bg-[#f3fbf9] px-3.5 py-2.5 text-sm text-slate-400">
              正在核验回答…
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入你的疑问，如某个名词是什么意思…"
            className="flex-1 select-text rounded-full border border-[#20CDB6]/25 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
          />
          <button
            onClick={handleSend}
            disabled={sending}
            className="rounded-full bg-[#20CDB6] px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(32,205,182,0.30)] transition hover:bg-[#19b8a4] disabled:opacity-40"
          >
            {sending ? '…' : '发送'}
          </button>
        </div>
      </div>
    ),
  })

  const sectionOrder = ['conclusion', 'consensus', 'conflicts', 'misleading', 'recommendations', 'followup']
  sections.sort((a, b) => sectionOrder.indexOf(a.key) - sectionOrder.indexOf(b.key))

  const n = sections.length
  const cur = sections[index]
  const prev = sections[index - 1]
  const next = sections[index + 1]
  const behind = dragDir === 1 ? prev : next

  /* ---------- 命令式拖拽（不触发逐帧重渲染，丝滑） ---------- */
  const BEHIND_BASE = 'scale(0.94) translateY(12px)'

  function setBehindDirection(dir: -1 | 1 | null) {
    if (dragDirRef.current === dir) return
    dragDirRef.current = dir
    setDragDir(dir)
  }

  // 切换卡片后，把 front 复位到中央、behind 复位到景深位
  useLayoutEffect(() => {
    if (frontRef.current) {
      frontRef.current.style.transition = 'none'
      frontRef.current.style.transform = 'translateX(0px) rotate(0deg)'
      frontRef.current.style.opacity = '1'
    }
    if (behindRef.current) {
      behindRef.current.style.transition = 'none'
      behindRef.current.style.transform = BEHIND_BASE
    }
    dragActive.current = false
    mxRef.current = 0
    axisLock.current = null
    setBehindDirection(null)
  }, [index])

  function setFront(x: number) {
    if (frontRef.current) {
      frontRef.current.style.transform = `translateX(${x}px) rotate(${x * 0.02}deg)`
    }
    if (behindRef.current) {
      const p = Math.min(Math.abs(x) / 240, 1)
      behindRef.current.style.transform = `scale(${0.94 + 0.06 * p}) translateY(${12 * (1 - p)}px)`
    }
  }

  function springBack() {
    if (!dragActive.current && !animating.current) return
    if (frontRef.current) {
      frontRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22,1,0.36,1)'
      frontRef.current.style.transform = 'translateX(0px) rotate(0deg)'
    }
    if (behindRef.current) {
      behindRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22,1,0.36,1)'
      behindRef.current.style.transform = BEHIND_BASE
    }
    dragActive.current = false
    mxRef.current = 0
    axisLock.current = null
    window.setTimeout(() => setBehindDirection(null), 280)
  }

  function flyOff(dir: -1 | 1) {
    if (animating.current) return
    animating.current = true
    const w = typeof window !== 'undefined' ? window.innerWidth : 480
    if (frontRef.current) {
      frontRef.current.style.transition = 'transform 0.24s ease-out, opacity 0.24s ease-out'
      frontRef.current.style.transform = `translateX(${dir * w * 1.1}px) rotate(${dir * 10}deg)`
      frontRef.current.style.opacity = '0'
    }
    if (behindRef.current) {
      behindRef.current.style.transition = 'transform 0.24s ease-out'
      behindRef.current.style.transform = 'scale(1) translateY(0px)'
    }
    window.setTimeout(() => {
      setIndex((i) => (dir < 0 ? Math.min(i + 1, n - 1) : Math.max(i - 1, 0)))
      dragActive.current = false
      mxRef.current = 0
      axisLock.current = null
      setBehindDirection(null)
      animating.current = false
    }, 230)
  }

  function onPointerDown(e: React.PointerEvent) {
    dragActive.current = false
    if (animating.current) return
    if (isInteractiveTarget(e.target)) return
    startX.current = e.clientX
    startY.current = e.clientY
    axisLock.current = null
    mxRef.current = 0
    dragActive.current = true
    setBehindDirection(null)
    if (frontRef.current) frontRef.current.style.transition = 'none'
    if (behindRef.current) behindRef.current.style.transition = 'none'
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragActive.current || e.buttons === 0 || animating.current) return
    const mx = e.clientX - startX.current
    const my = e.clientY - startY.current
    if (axisLock.current === null) {
      if (Math.abs(mx) > 6 || Math.abs(my) > 6) axisLock.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
    }
    if (axisLock.current === 'x') {
      mxRef.current = mx
      if (mx < -4 && index < n - 1) setBehindDirection(-1)
      else if (mx > 4 && index > 0) setBehindDirection(1)
      else setBehindDirection(null)
      setFront(mx)
    }
  }
  function onPointerUp() {
    if (!dragActive.current) return
    const mx = mxRef.current
    const threshold = 70
    if (axisLock.current === 'x' && mx <= -threshold && index < n - 1) return flyOff(-1)
    if (axisLock.current === 'x' && mx >= threshold && index > 0) return flyOff(1)
    springBack()
  }

  function onContentPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    onPointerDown(e)
  }

  function onContentPointerMove(e: React.PointerEvent) {
    e.stopPropagation()
    onPointerMove(e)
  }

  function onContentPointerUp(e: React.PointerEvent) {
    e.stopPropagation()
    onPointerUp()
  }

  // 注意：用普通函数渲染而非 <Card/> 组件，避免每次 setState 重建组件类型导致输入框失焦
  const renderCard = (section: Section) => {
    return (
      <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-[28px] border border-[#CDEDE7] bg-white shadow-[0_18px_52px_rgba(18,116,103,0.14)]">
        <div className="h-1.5 bg-gradient-to-r from-[#20CDB6] via-[#20CDB6]/75 to-[#20CDB6]/10" />
        <div className="flex items-start justify-between px-5 pt-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#20CDB6] shadow-[0_0_16px_rgba(32,205,182,0.65)]" />
            <h2 className="text-[18px] font-bold tracking-wide text-slate-950">{section.label}</h2>
          </div>
          <span className="text-[25px] font-black leading-none tracking-tight text-[#20CDB6]/25">
            {String(sections.indexOf(section) + 1).padStart(2, '0')}
          </span>
        </div>
        <div className="mx-5 mt-1 h-px bg-[#20CDB6]/10" />
        <div
          className="flex-1 touch-pan-y overflow-y-auto px-5 pb-4 pt-3"
          onPointerDown={onContentPointerDown}
          onPointerMove={onContentPointerMove}
          onPointerUp={onContentPointerUp}
          onPointerCancel={springBack}
        >
          {section.node}
        </div>
        {section.evidenceItems && section.evidenceItems.length > 0 && (
          <div className="mx-5 border-t border-[#20CDB6]/10 py-2">
            <button
              type="button"
              onClick={() => openEvidenceItems(section.evidenceTitle || `${section.label}依据`, section.evidenceItems || [])}
              className="flex w-full items-center justify-center gap-1 rounded-[16px] border border-[#20CDB6]/50 bg-white px-3 py-2 text-[13px] font-bold text-[#128f80] transition hover:border-[#20CDB6] hover:bg-[#20CDB6] hover:text-white"
            >
              {section.evidenceLabel || '查看本页依据'}
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
        <div className="mx-5 border-t border-[#20CDB6]/10 py-2">
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

  return (
    <main className="fitproof-particle-field relative flex h-[100dvh] flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(32,205,182,0.18),transparent_42%),linear-gradient(180deg,#f7fffd_0%,#eef8f6_100%)]">
      <header className="relative z-10 flex items-center justify-between px-5 py-3">
        <button onClick={onBack} aria-label="返回" className="flex h-10 w-10 items-center justify-center rounded-full text-[#078C7E] transition hover:bg-white/70">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m14.5 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="max-w-[42%] truncate rounded-full border border-[#20CDB6]/15 bg-white/75 px-3 py-1 text-sm font-semibold text-[#128f80] shadow-sm backdrop-blur">
          <span className="mr-1 text-[#20CDB6]">●</span>
          {topic}
        </div>
        <span className="rounded-full border border-[#20CDB6]/25 bg-white/75 px-4 py-1.5 text-[17px] font-black text-[#078C7E] shadow-sm backdrop-blur">{index + 1} / {sections.length}</span>
      </header>

      {/* 单卡拖拽区 */}
      <div className="relative z-10 flex-1 overflow-hidden px-5 py-2">
        {behind && (
          <div
            ref={behindRef}
            className="absolute inset-x-5 inset-y-2 opacity-75 will-change-transform"
            style={{ transform: BEHIND_BASE }}
          >
            {renderCard(behind)}
          </div>
        )}
        <div
          ref={frontRef}
          className="absolute inset-x-5 inset-y-2 cursor-grab touch-pan-y will-change-transform active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={springBack}
        >
          {renderCard(cur)}
        </div>
      </div>

      <footer className="relative z-10 flex flex-col items-center gap-1.5 px-5 pb-3 pt-1">
        <div className="flex w-full max-w-[300px] items-center gap-2 rounded-full border border-white/70 bg-white/[0.70] px-3 py-2 shadow-sm backdrop-blur">
          {sections.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIndex(i)}
              aria-label={s.label}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i === index ? 'bg-[#20CDB6] shadow-[0_0_10px_rgba(32,205,182,0.45)]' : 'bg-[#20CDB6]/[0.18]'
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-slate-400">← 左右滑动翻页 →</span>
        {exportError && <p className="text-xs text-red-600">{exportError}</p>}
      </footer>

      {/* 底部抽屉 */}
      {drawer && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 animate-fadeIn bg-black/40" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slideUp relative z-50 max-h-[70vh] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-5"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-200" />
            <p className="mb-3 text-sm font-medium text-zinc-900">{drawer.title}</p>
            <ul className="space-y-3">
              {drawer.items.map((it, i) => (
                <li key={i} className="rounded-2xl bg-zinc-50 px-4 py-3">
                  <p className="text-[15px] text-zinc-800">{it.main}</p>
                  {it.sub && <p className="mt-0.5 text-sm text-zinc-500">{it.sub}</p>}
                  {it.href && (
                    <a
                      href={it.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-sm text-blue-600 underline"
                    >
                      {it.hrefLabel || '打开链接'} ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setDrawer(null)}
              className="mt-5 w-full rounded-full bg-zinc-100 py-2.5 text-sm font-medium text-zinc-600"
            >
              收起
            </button>
          </div>
        </div>
      )}

      {/* 隐藏的竖向长图导出容器 */}
      <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden>
        <div ref={exportRef} className="w-[400px] space-y-3 bg-[#f3fbf9] p-4">
          <p className="px-1 text-lg font-semibold text-slate-950">{topic} · FitProof 核验报告</p>
          {sections
            .filter((s) => s.exportable)
            .map((s) => (
              <div key={s.key} className="rounded-3xl border border-[#20CDB6]/15 bg-white p-6">
                <h2 className="mb-3 text-base font-semibold text-slate-950">{s.label}</h2>
                {s.node}
                <div className="mt-5 border-t border-[#20CDB6]/10 pt-3">
                  <p className="text-center text-[11px] leading-relaxed text-slate-400">
                    本产品用于运动健康内容辨析，不构成医疗诊断或个体化治疗建议。
                  </p>
                </div>
              </div>
            ))}
          {history.length > 0 && (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <h2 className="mb-2 text-base font-medium text-zinc-900">追问记录</h2>
              <div className="space-y-1 text-sm">
                {history.map((m, i) => (
                  <p key={i} className={m.role === 'user' ? 'text-zinc-900' : 'text-zinc-500'}>
                    <b>{m.role === 'user' ? '问：' : '答：'}</b>
                    {m.content}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
