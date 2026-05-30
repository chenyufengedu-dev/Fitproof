'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Analysis, Authority, ChatMessage, Reference, VideoRef } from '@/types'

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
    .map((id) => authorities.findIndex((a) => a.id === id))
    .filter((i) => i >= 0)
    .map((i) => i + 1)
  if (nums.length === 0) return null
  return (
    <span className="ml-0.5 inline-flex flex-wrap gap-0.5 align-middle">
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => onOpen(n)}
          className="align-super text-[11px] text-emerald-700 transition hover:text-emerald-900"
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

// 短视频播放语义图标：播放三角始终朝右（不左右镜像），左右差异交给气泡位置与编号体现
function VideoSourceMark({ label }: { label: string; align?: 'left' | 'right' }) {
  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#20CDB6]/25 bg-white text-[#128f80] shadow-sm">
      <div className="grid h-6 w-7 place-items-center rounded-md border-2 border-current bg-[#20CDB6]/10">
        <span className="h-0 w-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-current" />
      </div>
      <span className="absolute -right-1 -top-1 rounded-full bg-[#20CDB6] px-1 text-[9px] font-bold text-white">
        {label}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export default function ResultPage({
  analysis,
  topic,
  history,
  onFollowup,
  onViewRefs,
  onBack,
}: ResultPageProps) {
  const [index, setIndex] = useState(0)
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [drawer, setDrawer] = useState<DrawerData | null>(null)

  const exportRef = useRef<HTMLDivElement>(null)
  const frontRef = useRef<HTMLDivElement>(null)
  const behindRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const mxRef = useRef(0)
  const axisLock = useRef<null | 'x' | 'y'>(null)
  const animating = useRef(false)

  const authorities = analysis.authorities || []
  const misleading = analysis.misleading || []
  const evidenceSupportLevel: SupportLevel =
    authorities.length >= 2 && analysis.references.length >= 2
      ? '高'
      : authorities.length >= 1 || analysis.references.length >= 2
        ? '中'
        : '低'
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
  type Section = { key: string; label: string; node: React.ReactNode; exportable: boolean }
  const sections: Section[] = []

  sections.push({
    key: 'conclusion',
    label: '核验结论',
    exportable: true,
    node: (
      <div className="space-y-7">
        <div className="rounded-[28px] border border-[#20CDB6]/20 bg-[#f0fffc] p-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#128f80]">
            FitProof 核验结果
          </p>
          <p className="text-[22px] font-semibold leading-[1.55] text-slate-950">{analysis.one_line_summary}</p>
        </div>
        <EvidenceGauge level={evidenceSupportLevel} label="证据支持度" />
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="视频来源" value={`${analysis.references.length} 条`} />
          <MetricCard label="专业依据" value={`${authorities.length} 条`} tone="dark" />
          <MetricCard label="风险提示" value={misleading.length > 0 ? `${misleading.length} 项` : '低'} tone="amber" />
        </div>
      </div>
    ),
  })

  sections.push({
    key: 'consensus',
      label: '共识提取',
    exportable: true,
    node: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="rounded-full bg-white px-2 py-1 shadow-sm">视频观点</span>
          <span className="h-px flex-1 bg-[#20CDB6]/15" />
          <span className="rounded-full bg-[#20CDB6]/10 px-2 py-1 text-[#128f80]">AI 对齐</span>
          <span className="h-px flex-1 bg-[#20CDB6]/15" />
          <span className="rounded-full bg-[#128f80] px-2 py-1 text-white">共同基础</span>
        </div>
        <div className="px-1 text-sm leading-relaxed text-slate-500">
          在有争议的视频中，AI 先提取双方都较认可的部分，作为后续校验的共同基础。
        </div>

        <div className="space-y-3">
          {analysis.consensus.map((c, i) => {
            const sourceCount = c.video_refs?.length || 0
            return (
              <div key={i} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#20CDB6]/10 text-[#128f80]">
                    ✓
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      共识 {i + 1}
                    </p>
                    <p className="mt-1 text-[15px] font-medium leading-relaxed text-slate-900">
                      {c.point}
                      <AuthChips ids={c.authority_ids} authorities={authorities} onOpen={openAuthority} />
                      <ScreenChip text={c.screen_evidence} onOpen={openScreen} />
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => c.video_refs && c.video_refs.length > 0 && openVideo(c.video_refs)}
                    disabled={!c.video_refs || c.video_refs.length === 0}
                    className="rounded-full border border-[#20CDB6]/20 bg-[#20CDB6]/10 px-2.5 py-1 text-[#128f80] transition hover:border-[#20CDB6] hover:bg-[#20CDB6] hover:text-white disabled:cursor-default disabled:hover:border-[#20CDB6]/20 disabled:hover:bg-[#20CDB6]/10 disabled:hover:text-[#128f80]"
                  >
                    {sourceCount > 0 ? `来自 ${sourceCount} 处视频依据` : '视频依据待展开'}
                  </button>
                  {c.authority_ids && c.authority_ids.length > 0 && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500">
                      含专业依据
                    </span>
                  )}
                  {c.screen_evidence && (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-600">
                      含画面依据
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    ),
  })

  if (analysis.conflicts.length > 0) {
    sections.push({
      key: 'conflicts',
      label: '分歧对照',
      exportable: true,
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
            const proLabel = sideLabel(c.pro.video_refs)
            const conLabel = sideLabel(c.con.video_refs)
            return (
            <div key={i} className="overflow-hidden rounded-3xl border border-[#20CDB6]/15 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[15px] font-semibold leading-snug text-slate-950">{c.topic}</p>
                <span className="shrink-0 rounded-full bg-[#20CDB6]/10 px-2.5 py-1 text-[10px] font-semibold text-[#128f80]">
                  分歧 {i + 1}
                </span>
              </div>

              <div className="space-y-4 text-[14px] leading-relaxed">
                <div className="flex items-start gap-3">
                  <VideoSourceMark label={String(c.pro.video_refs?.[0]?.id ?? '正')} />
                  <div className="max-w-[82%] rounded-[22px] rounded-tl-md border border-[#20CDB6]/20 bg-[#f5fffc] px-4 py-3 shadow-sm">
                    <p className="mb-1 text-[11px] font-semibold text-[#128f80]">{proLabel}</p>
                    <p className="text-slate-800">{c.pro.argument}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => c.pro.video_refs && c.pro.video_refs.length > 0 && openVideo(c.pro.video_refs)}
                        disabled={!c.pro.video_refs || c.pro.video_refs.length === 0}
                        className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#128f80] shadow-sm transition hover:bg-[#20CDB6] hover:text-white disabled:cursor-default disabled:opacity-60"
                      >
                        查看出处
                      </button>
                      <ScreenChip text={c.pro.screen_evidence} onOpen={openScreen} />
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <span className="rounded-full border border-[#20CDB6]/20 bg-white px-3 py-1 text-[11px] font-semibold text-[#128f80] shadow-sm">
                    VS · 分歧点
                  </span>
                </div>

                <div className="flex items-start justify-end gap-3">
                  <div className="max-w-[82%] rounded-[22px] rounded-tr-md border border-sky-200 bg-sky-50 px-4 py-3 text-left shadow-sm">
                    <p className="mb-1 text-[11px] font-semibold text-sky-700">{conLabel}</p>
                    <p className="text-slate-800">{c.con.argument}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <ScreenChip text={c.con.screen_evidence} onOpen={openScreen} />
                      <button
                        type="button"
                        onClick={() => c.con.video_refs && c.con.video_refs.length > 0 && openVideo(c.con.video_refs)}
                        disabled={!c.con.video_refs || c.con.video_refs.length === 0}
                        className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-sky-700 shadow-sm transition hover:bg-sky-500 hover:text-white disabled:cursor-default disabled:opacity-60"
                      >
                        查看出处
                      </button>
                    </div>
                  </div>
                  <VideoSourceMark label={String(c.con.video_refs?.[0]?.id ?? '反')} align="right" />
                </div>

                {/* 分歧根源 */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    分歧根源
                  </p>
                  <p className="text-[13px] leading-relaxed text-slate-700">
                    一方强调“{shortenArgument(c.pro.argument)}”，另一方强调“{shortenArgument(c.con.argument)}”，核心差异多在适用人群、运动目标或风险边界。
                  </p>
                </div>

                {/* FitProof 核验判断：浅青绿医学报告风 */}
                <div className="rounded-2xl border border-[#20CDB6]/25 bg-[#f3fbf9] px-4 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#20CDB6]" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#128f80]">
                      FitProof 核验判断
                    </p>
                  </div>

                  <dl className="space-y-2 text-[13px]">
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
                    <div className="mt-3 border-t border-[#20CDB6]/15 pt-3">
                      <p className="mb-1 text-[11px] font-medium text-slate-400">主流证据说明</p>
                      <p className="text-[13px] leading-relaxed text-slate-700">
                        {c.evidence_note}
                        <AuthChips ids={c.authority_ids} authorities={authorities} onOpen={openAuthority} />
                      </p>
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
      label: '适用边界',
    exportable: true,
    node: (
      <div className="space-y-4">
        <p className="px-1 text-sm leading-relaxed text-slate-500">
          同一个运动健康说法，对不同人群、训练目标和风险状态的适用边界不同。
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
                      适用对象 {i + 1}
                    </p>
                    <p className="mt-1 text-[15px] font-semibold leading-relaxed text-slate-950">
                      {r.condition}
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
                <p className="text-[14px] leading-relaxed text-slate-600">{r.advice}</p>

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

  if (misleading.length > 0) {
    sections.push({
      key: 'misleading',
      label: '说法校验',
      exportable: true,
      node: (
        <div className="space-y-4">
          <p className="px-1 text-[13px] leading-relaxed text-slate-500">
            对照运动医学证据，逐条核验视频里可能被夸大或不准确的说法。
          </p>
          {misleading.map((m, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-[#20CDB6]/15 bg-white p-3 shadow-sm">
              {/* 原视频说法（待核验） */}
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

              {/* 核验分隔 */}
              <div className="flex items-center justify-center gap-2 py-2 text-[11px] font-semibold text-[#128f80]">
                <span className="h-px w-8 bg-[#20CDB6]/30" />
                FitProof 核验
                <span className="h-px w-8 bg-[#20CDB6]/30" />
              </div>

              {/* 更准确的说法（核验结论） */}
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
            </div>
          ))}
        </div>
      ),
    })
  }

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
              <p className="text-[12px] text-slate-400">试试这些问题：</p>
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
            className="flex-1 rounded-full border border-[#20CDB6]/25 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
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

  const n = sections.length
  const cur = sections[index]
  const next = sections[index + 1]

  /* ---------- 命令式拖拽（不触发逐帧重渲染，丝滑） ---------- */
  const BEHIND_BASE = 'scale(0.94) translateY(12px)'

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
    if (frontRef.current) {
      frontRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22,1,0.36,1)'
      frontRef.current.style.transform = 'translateX(0px) rotate(0deg)'
    }
    if (behindRef.current) {
      behindRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22,1,0.36,1)'
      behindRef.current.style.transform = BEHIND_BASE
    }
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
      animating.current = false
    }, 230)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (animating.current) return
    startX.current = e.clientX
    startY.current = e.clientY
    axisLock.current = null
    mxRef.current = 0
    if (frontRef.current) frontRef.current.style.transition = 'none'
    if (behindRef.current) behindRef.current.style.transition = 'none'
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (e.buttons === 0 || animating.current) return
    const mx = e.clientX - startX.current
    const my = e.clientY - startY.current
    if (axisLock.current === null) {
      if (Math.abs(mx) > 6 || Math.abs(my) > 6) axisLock.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
    }
    if (axisLock.current === 'x') {
      mxRef.current = mx
      setFront(mx)
    }
  }
  function onPointerUp() {
    const mx = mxRef.current
    const threshold = 70
    if (axisLock.current === 'x' && mx <= -threshold && index < n - 1) return flyOff(-1)
    if (axisLock.current === 'x' && mx >= threshold && index > 0) return flyOff(1)
    springBack()
  }

  // 注意：用普通函数渲染而非 <Card/> 组件，避免每次 setState 重建组件类型导致输入框失焦
  const renderCard = (section: Section) => {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[30px] border border-[#20CDB6]/20 bg-white/[0.92] shadow-[0_26px_90px_rgba(18,116,103,0.18)] backdrop-blur-xl">
        <div className="h-1.5 bg-gradient-to-r from-[#20CDB6] via-[#20CDB6]/75 to-[#20CDB6]/10" />
        <div className="flex items-baseline justify-between px-7 pt-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#20CDB6] shadow-[0_0_16px_rgba(32,205,182,0.65)]" />
            <h2 className="text-base font-semibold tracking-wide text-slate-950">{section.label}</h2>
          </div>
          <span className="text-3xl font-bold leading-none text-[#20CDB6]/20">
            {String(sections.indexOf(section) + 1).padStart(2, '0')}
          </span>
        </div>
        <div className="mx-7 mt-3 h-px bg-[#20CDB6]/10" />
        <div className="flex-1 overflow-y-auto px-7 pb-7 pt-5">{section.node}</div>
        <div className="mx-7 border-t border-[#20CDB6]/10 py-3">
          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            本产品用于运动健康内容辨析，不构成医疗诊断或个体化治疗建议。
          </p>
        </div>
      </div>
    )
  }

  return (
    <main className="fitproof-particle-field relative flex h-[100dvh] flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(32,205,182,0.18),transparent_42%),linear-gradient(180deg,#f7fffd_0%,#eef8f6_100%)]">
      <header className="relative z-10 flex items-center justify-between px-5 py-3">
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-900">
          ‹ 返回
        </button>
        <div className="max-w-[42%] truncate rounded-full border border-[#20CDB6]/15 bg-white/75 px-3 py-1 text-sm font-semibold text-[#128f80] shadow-sm backdrop-blur">
          <span className="mr-1 text-[#20CDB6]">●</span>
          {topic}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-full border border-[#20CDB6]/20 bg-white/75 px-3 py-1.5 font-medium text-[#128f80] shadow-sm backdrop-blur transition hover:bg-[#20CDB6] hover:text-white disabled:opacity-40"
          >
            {exporting ? '保存中' : '保存结果'}
          </button>
          <button
            onClick={() => onViewRefs()}
            className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 font-medium text-slate-500 shadow-sm backdrop-blur transition hover:border-[#20CDB6]/35 hover:text-[#128f80]"
          >
            查看依据
          </button>
        </div>
      </header>

      {/* 单卡拖拽区 */}
      <div className="relative z-10 flex-1 overflow-hidden px-6 py-3">
        {next && (
          <div
            ref={behindRef}
            className="absolute inset-x-6 inset-y-3 opacity-75 will-change-transform"
            style={{ transform: BEHIND_BASE }}
          >
            {renderCard(next)}
          </div>
        )}
        <div
          ref={frontRef}
          className="absolute inset-x-6 inset-y-3 cursor-grab touch-pan-y will-change-transform active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={springBack}
        >
          {renderCard(cur)}
        </div>
      </div>

      <footer className="relative z-10 flex flex-col items-center gap-2 px-5 pb-4 pt-1">
        <div className="flex w-full max-w-[260px] items-center gap-1.5 rounded-full border border-white/70 bg-white/[0.55] px-2 py-1.5 shadow-sm backdrop-blur">
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
        <span className="text-xs text-slate-400">{cur?.label} · 左右查看</span>
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
