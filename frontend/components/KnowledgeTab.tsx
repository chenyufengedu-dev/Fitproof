'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadHistory } from '@/lib/history'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

interface KnowledgeDoc {
  doc: string
  org: string
  year: string
  url: string
  pages: string
  topic: string
  entry_count: number
  previews: string[]
}

interface KnowledgeLibrary {
  stats: { docs: number; orgs: number }
  coverage: { scope: { name: string; count: number }[]; note: string }
  orgs: { name: string; count: number }[]
  topics: string[]
  docs: KnowledgeDoc[]
}

const svgBase = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const ICONS: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z" /></>,
  back: <path d="m15 5-7 7 7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  // 区块标题
  scope: <><path d="M12 3.5 19 6v5c0 4.3-2.8 7.7-7 9.5-4.2-1.8-7-5.2-7-9.5V6l7-2.5Z" /><path d="m9 12 2 2 4-4" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  // 详情页字段
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  page: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>,
  tag: <><path d="M3 12.5V5a2 2 0 0 1 2-2h7.5L21 11.5 12.5 20 3 12.5Z" /><circle cx="8" cy="8" r="1.4" /></>,
  bookmark: <path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1Z" />,
  // 收录领域
  nutrition: <><path d="M4 11h16a8 8 0 0 1-16 0Z" /><path d="M3.5 19h17" /><path d="M12 4v3M9.5 5.5v1.5M14.5 5.5v1.5" /></>,
  fitness: <><path d="M5 9v6M8 7v10M16 7v10M19 9v6" /><path d="M8 12h8" /></>,
  maternity: <><circle cx="12" cy="5" r="2.2" /><path d="M12 8c-2 0-3 1.4-3 3v3c0 2.5 1.3 4 3 4s3.4-1.3 3.4-3.6c0-2-1.2-3-2.4-3.2" /><path d="M9.5 18.5 8.5 21M14 18.5l1 2.5" /></>,
  chronic: <><path d="M20.5 8.6c0 5-8.5 10-8.5 10s-8.5-5-8.5-10a4.6 4.6 0 0 1 8.5-2.5 4.6 4.6 0 0 1 8.5 2.5Z" /></>,
  baby: <><circle cx="12" cy="9" r="5.2" /><path d="M9.8 8.4v.1M14.2 8.4v.1M10.2 11.4c.5.6 1.1.9 1.8.9s1.3-.3 1.8-.9" /><path d="M8 15.5 7 21M16 15.5l1 5.5" /></>,
  weight: <><circle cx="12" cy="12" r="8.5" /><path d="M12 12 8.8 8.2" /><path d="M12 3.5v1.6M20.5 12h-1.6M12 20.5v-1.6M3.5 12h1.6" /></>,
  cancer: <><path d="M12 21c-4.4 0-8-3.4-8-7.6C4 9 7.6 6 12 3c4.4 3 8 6 8 10.4 0 4.2-3.6 7.6-8 7.6Z" /><path d="M12 17c-1.9 0-3.4-1.4-3.4-3.2 0-1.9 1.5-3.2 3.4-4.4 1.9 1.2 3.4 2.5 3.4 4.4 0 1.8-1.5 3.2-3.4 3.2Z" /></>,
  supplement: <><path d="M8.2 5.2a4.2 4.2 0 0 1 5.9 0l4.7 4.7a4.2 4.2 0 1 1-5.9 5.9l-4.7-4.7a4.2 4.2 0 0 1 0-5.9Z" /><path d="m9.1 14.9 5.8-5.8" /></>,
  pill: <><rect x="3.5" y="9" width="17" height="6" rx="3" /><path d="M12 9v6" /></>,
  sleep: <><path d="M13.2 4.5A7.4 7.4 0 1 0 19.5 15 6.2 6.2 0 0 1 13.2 4.5Z" /><path d="M16 5h3l-3 3h3" /></>,
}

function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  return <svg className={className} {...svgBase}>{ICONS[name]}</svg>
}

/**
 * 机构图标：古典建筑（三角楣 + 四根柱子 + 基座台阶）。
 * 之前那版只是「屋顶 + 竖线」，细看根本不像建筑。
 */
function BankIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 21 8H3l9-5Z" />
      <path d="M5.5 8v9M9.2 8v9M14.8 8v9M18.5 8v9" />
      <path d="M3.6 17h16.8" />
      <path d="M2.6 20.4h18.8" />
    </svg>
  )
}

/** 列表项图标：合着的书（外框 + 书脊竖线），比摊开的书更适合小尺寸的条目前缀。 */
function ClosedBookIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.2" y="3.2" width="15.6" height="17.6" rx="2.4" />
      <path d="M8.6 3.2v17.6" />
    </svg>
  )
}

/**
 * 目录图标：摊开的书，中缝 + 左右两页各带一道内页线。
 * 之前那版是「单页 + 折角」，和参考图的对开书完全是两个东西。
 */
function OpenBookIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6.6C10.4 5.2 8 4.5 4.2 4.5A1 1 0 0 0 3.2 5.5v11.2a1 1 0 0 0 1 1c3.7 0 6.1.7 7.8 2.1" />
      <path d="M12 6.6c1.6-1.4 4-2.1 7.8-2.1a1 1 0 0 1 1 1v11.2a1 1 0 0 1-1 1c-3.7 0-6.1.7-7.8 2.1" />
      <path d="M12 6.6v13.2" />
    </svg>
  )
}

/**
 * 收录领域图标：实心填充。1.8px 描边版在 14px 尺寸下只剩几根淡线，
 * 挤在胶囊里既看不清也不好看，填充版才有分量。
 */
const SCOPE_ICON_PATHS: Record<string, ReactNode> = {
  nutrition: <><path d="M3.2 10.6h17.6a8.8 8.8 0 0 1-17.6 0Z" /><rect x="2.6" y="19.4" width="18.8" height="1.9" rx=".95" /><path d="M11.2 3.4h1.6v3.4h-1.6zM8.5 5.1h1.5v1.7H8.5zM14 5.1h1.5v1.7H14z" /></>,
  fitness: <><rect x="3" y="9.4" width="2.6" height="5.2" rx="1.1" /><rect x="18.4" y="9.4" width="2.6" height="5.2" rx="1.1" /><rect x="6.1" y="7.2" width="2.8" height="9.6" rx="1.2" /><rect x="15.1" y="7.2" width="2.8" height="9.6" rx="1.2" /><rect x="8.6" y="10.9" width="6.8" height="2.2" rx="1.1" /></>,
  maternity: <><circle cx="11.6" cy="4.4" r="2.5" /><path d="M11.4 7.6c-2.3 0-3.6 1.7-3.6 3.8v2.9c0 2.9 1.7 4.9 3.9 4.9 2.3 0 4.1-1.7 4.1-4.2 0-2.3-1.5-3.6-3-3.9v-1.9c0-.9-.5-1.6-1.4-1.6Z" /><path d="M9.1 19.2 7.9 22h1.9l1-2.3zM14.2 19.2l1 2.8h1.9l-1.2-2.6z" /></>,
  chronic: <path d="M12 21s-8.6-5.1-8.6-11A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 8.6 3.4c0 5.9-8.6 11-8.6 11Z" />,
  baby: <><circle cx="12" cy="8.6" r="5.6" /><circle cx="9.9" cy="8" r=".95" fill="#fff" /><circle cx="14.1" cy="8" r=".95" fill="#fff" /><path d="M10.1 10.8a2.6 2.6 0 0 0 3.8 0" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round" /><path d="M8.4 14.9 7.2 21.4h2l1-5.4zM15.6 14.9l1.2 6.5h-2l-1-5.4z" /></>,
  weight: <><path d="M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2Zm0 1.9a6.7 6.7 0 1 1 0 13.4 6.7 6.7 0 0 1 0-13.4Z" /><path d="M12.9 11.4 9.6 8.1a.9.9 0 0 0-1.3 1.3l3.3 3.3a.9.9 0 0 0 1.3-1.3Z" /></>,
  cancer: <><path d="M12 2.4c4.6 3.2 8.4 6.3 8.4 11a8.4 8.4 0 1 1-16.8 0c0-4.7 3.8-7.8 8.4-11Zm0 6.4c-2.1 1.4-3.7 2.8-3.7 4.9a3.7 3.7 0 1 0 7.4 0c0-2.1-1.6-3.5-3.7-4.9Z" /></>,
  supplement: <><path d="M13.5 4.5a4.5 4.5 0 0 1 6.4 6.4l-3.2 3.2-6.4-6.4 3.2-3.2Z" /><path d="M9.2 8.8l6 6-3.2 3.2a4.5 4.5 0 0 1-6.4-6.4l3.6-2.8Z" opacity=".55" /></>,
  pill: <><rect x="2.6" y="8.6" width="18.8" height="6.8" rx="3.4" /><path d="M11.2 8.6h1.6v6.8h-1.6z" fill="#fff" /></>,
  sleep: <><path d="M13.4 3.4A7.9 7.9 0 1 0 20.6 14 6.7 6.7 0 0 1 13.4 3.4Z" /><path d="M15.6 4.1h4.1l-3.1 3.2h3.1v1.5h-5.6l3.1-3.2h-3.1z" /></>,
  scope: <><path d="M12 2.6 20.4 5.6v5.6c0 4.9-3.4 8.9-8.4 10.6-5-1.7-8.4-5.7-8.4-10.6V5.6L12 2.6Zm-1.4 13.6 6.2-6.2-1.6-1.6-4.6 4.6-2-2-1.6 1.6 3.6 3.6Z" /></>,
}

function ScopeIcon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {SCOPE_ICON_PATHS[name] || SCOPE_ICON_PATHS.scope}
    </svg>
  )
}

/**
 * 收录领域 -> 图标。领域名来自 registry 的 topic 列，是组员手填的自由文本，
 * 所以用关键词匹配而不是精确映射 —— 新增领域也能自动配上图，命中不了退回盾牌。
 */
const SCOPE_ICON_RULES: [RegExp, string][] = [
  [/孕|产|哺乳|月子/, 'maternity'],
  [/婴|幼儿|儿童|喂养/, 'baby'],
  [/运动|健身|锻炼/, 'fitness'],
  [/减肥|代谢|体重|肥胖/, 'weight'],
  [/癌|肿瘤/, 'cancer'],
  [/补充剂|保健品|维生素/, 'supplement'],
  [/用药|药物|处方/, 'pill'],
  [/睡眠|失眠/, 'sleep'],
  [/慢病|血压|血糖|心血管/, 'chronic'],
  [/营养|膳食|饮食|食物/, 'nutrition'],
]

function scopeIcon(name: string): string {
  for (const [pattern, icon] of SCOPE_ICON_RULES) if (pattern.test(name)) return icon
  return 'scope'
}

/** 机构名形如「世界卫生组织 (WHO)」，列表里空间紧，优先显示缩写。 */
function shortOrg(org: string): string {
  const match = org.match(/\(([^)]+)\)\s*$/)
  return match ? match[1] : org
}

/**
 * 目录整份缓存在模块作用域。切走 Tab 会卸载组件，不缓存的话每次切回来
 * 都要重新拉 146KB 并重读 274 份文件，表现为「点进去卡一下」。
 * 文献目录在一次会话里不会变，缓存没有过期问题。
 */
let cachedLibrary: KnowledgeLibrary | null = null

export default function KnowledgeTab() {
  const [library, setLibrary] = useState<KnowledgeLibrary | null>(cachedLibrary)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [detail, setDetail] = useState<KnowledgeDoc | null>(null)
  const [citedIds, setCitedIds] = useState<string[]>([])
  const [fullEntries, setFullEntries] = useState<string[] | null>(null)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [shownEntries, setShownEntries] = useState(50)
  const [showOrgSheet, setShowOrgSheet] = useState(false)
  const [showTopicSheet, setShowTopicSheet] = useState(false)

  useEffect(() => {
    if (cachedLibrary) return
    let alive = true
    fetch(`${API_BASE_URL}/api/knowledge`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data: KnowledgeLibrary) => {
        cachedLibrary = data
        if (alive) setLibrary(data)
      })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : '加载失败') })
    return () => { alive = false }
  }, [])

  // 用户自己核验时引用过的证据 ID，用来在详情里显示「你有 N 条核验引用了这份文献」
  useEffect(() => {
    const ids = loadHistory().flatMap((record) => record.result?.cited_evidence_ids || [])
    setCitedIds(ids)
  }, [])

  const visible = useMemo(() => {
    if (!library) return []
    const keyword = query.trim().toLowerCase()
    return library.docs.filter((item) => {
      if (orgFilter && item.org !== orgFilter) return false
      if (topicFilter && item.topic !== topicFilter) return false
      if (!keyword) return true
      return `${item.doc} ${item.org} ${item.topic}`.toLowerCase().includes(keyword)
    })
  }, [library, query, orgFilter, topicFilter])

  /** 证据 ID 形如 E-中国居民膳食指南-001，用文献名前缀反查它支撑过用户几次核验。 */
  const detailCitedCount = useMemo(() => {
    if (!detail) return 0
    const stem = detail.doc.slice(0, 8)
    return citedIds.filter((id) => id.includes(stem)).length
  }, [detail, citedIds])

  /** 换一份文献就要丢掉上一份的全量结论，否则会串台。 */
  function openDetail(item: KnowledgeDoc) {
    setDetail(item)
    setFullEntries(null)
    setShownEntries(50)
  }

  async function loadAllEntries() {
    if (!detail) return
    setLoadingEntries(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge/entries?doc=${encodeURIComponent(detail.doc)}`)
      const data = await response.json()
      setFullEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch {
      setFullEntries([])
    } finally {
      setLoadingEntries(false)
    }
  }

  if (error) {
    return (
      <main className="min-h-[calc(100dvh-4rem)] bg-white px-4 py-10 text-center">
        <p className="text-[14px] font-bold text-slate-900">知识库暂时打不开</p>
        <p className="mx-auto mt-2 max-w-[17rem] text-[12px] leading-relaxed text-slate-500">
          需要后端服务运行中（{error}）。核验功能不受影响。
        </p>
      </main>
    )
  }

  if (!library) {
    return (
      <main className="min-h-[calc(100dvh-4rem)] bg-white px-4 py-10 text-center">
        <p className="text-[12.5px] text-slate-400">正在载入文献目录…</p>
      </main>
    )
  }

  // 整页纯白。卡片同为白色，靠 1px 描边分层，不再用灰底衬托
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-white pb-3 text-slate-950">
      <div className="mx-auto max-w-2xl px-3 pt-2">

        {/* 页面标题栏 */}
        <header className="px-1">
          <h1 className="text-[18px] font-extrabold leading-tight tracking-tight text-slate-900">知识库</h1>
          <p className="mt-0.5 text-[11px] leading-tight text-slate-500">基于权威文献，给出可靠、可溯源的健康依据</p>
        </header>

        {/* 主张卡：左列固定给图标，右列所有内容左边界对齐 */}
        <section className="mt-2.5 flex items-start gap-3.5 rounded-[18px] border border-[#E4F1ED] bg-gradient-to-br from-[#EDF8F5] via-[#F5FBFA] to-[#FCFDFD] px-3.5 py-3">
          <img
            src="/knowledge/library-badge.webp"
            alt=""
            className="mt-2 h-[58px] w-[58px] shrink-0 object-contain"
          />

          {/* 右列：标题、正文、机构胶囊、统计全部同一左边界，不越界到图标那一列 */}
          <div className="min-w-0 flex-1">
            <h2 className="text-[14.5px] font-extrabold leading-snug tracking-tight text-slate-900">
              FitProof 的判定，只基于权威文献
            </h2>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
              全部由人工收录、逐条拆解，不由 FitProof 自行推导。
            </p>

            {/* 机构胶囊：固定 3+3 两行。交给 flex-wrap 自动折行会排成 2+4 之类的
                参差形状，因为机构名长短不一 —— 分成两组各自成行才稳定。 */}
            <div className="mt-2 space-y-1">
              {[library.orgs.slice(0, 3), library.orgs.slice(3, 6)].map((row, index) => (
                <div key={index} className="flex gap-1">
                  {row.map((item) => (
                    <span
                      key={item.name}
                      className="inline-flex min-w-0 items-center gap-1 rounded-full bg-white px-2 py-[3px] text-[10px] font-bold leading-none text-[#0B6E63] shadow-[0_1px_2px_rgba(11,110,99,0.08)]"
                    >
                      <BankIcon className="h-[11px] w-[11px] shrink-0 text-[#3FB49C]" />
                      <span className="truncate">{shortOrg(item.name)}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
              共 {library.stats.docs} 份文献 · {library.stats.orgs} 家机构
            </p>
          </div>
        </section>

        {/* 收录范围 */}
        <section className="mt-2.5 rounded-[18px] border border-[#EDF3F2] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(11,110,99,0.04)]">
          <h2 className="flex items-center gap-1.5 text-[13.5px] font-extrabold tracking-tight text-slate-900">
            <Icon name="scope" className="h-4 w-4 text-[#3FB49C]" />
            收录范围
          </h2>
          {/* pl 对齐标题文字（图标 14px + gap 6px），不跟图标顶格。
              严格两行：领域名是组员手填的，长的到 13 个字，所以既限量也给 chip 封顶宽度。 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-[20px]">
            {library.coverage.scope.slice(0, 4).map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setTopicFilter(topicFilter === item.name ? '' : item.name)}
                className={`inline-flex min-w-0 max-w-[9.5rem] items-center gap-1 rounded-full border px-2 py-[3px] text-[10.5px] font-semibold leading-none transition ${
                  topicFilter === item.name
                    ? 'border-[#0B6E63] bg-[#0B6E63] text-white'
                    : 'border-[#CFEAE3] bg-[#F5FCFA] text-[#0B6E63]'
                }`}
              >
                <ScopeIcon name={scopeIcon(item.name)} className={`h-[13px] w-[13px] shrink-0 ${topicFilter === item.name ? 'text-white' : 'text-[#3FB49C]'}`} />
                <span className="truncate">{item.name}</span>
              </button>
            ))}
            {library.coverage.scope.length > 4 && (
              <button
                type="button"
                onClick={() => setShowTopicSheet(true)}
                aria-label={`查看全部 ${library.coverage.scope.length} 个领域`}
                className="shrink-0 px-1.5 text-[13px] font-bold leading-none text-[#0B6E63]"
              >
                …
              </button>
            )}
          </div>
          <p className="mt-1.5 pl-[20px] text-[10px] leading-relaxed text-slate-400">{library.coverage.note}</p>
        </section>

        {/* 来源机构 */}
        <section className="mt-2.5 rounded-[18px] border border-[#EDF3F2] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(11,110,99,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-extrabold tracking-tight text-slate-900">
              <BankIcon className="h-4 w-4 text-[#3FB49C]" />
              来源机构
            </h2>
            <button
              type="button"
              onClick={() => setShowOrgSheet(true)}
              className="flex shrink-0 items-center gap-0.5 text-[10.5px] font-bold text-[#0B6E63]"
            >
              全部 {library.stats.orgs} 家
              <Icon name="chevron" className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 space-y-[5px]">
            {library.orgs.slice(0, 6).map((item) => {
              const active = orgFilter === item.name
              const ratio = item.count / library.orgs[0].count
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setOrgFilter(active ? '' : item.name)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className={`w-[82px] shrink-0 truncate text-[10px] font-semibold ${active ? 'text-[#0B6E63]' : 'text-slate-600'}`} title={item.name}>
                    {shortOrg(item.name)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF4F3]">
                    <i className={`block h-full rounded-full ${active ? 'bg-[#0B6E63]' : 'bg-[#45C0A8]'}`} style={{ width: `${Math.max(ratio * 100, 4)}%` }} />
                  </span>
                  <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-slate-500">{item.count}</span>
                </button>
              )
            })}
          </div>
          {orgFilter && (
            <button type="button" onClick={() => setOrgFilter('')} className="mt-2 text-[10.5px] font-bold text-[#0B6E63]">
              清除机构筛选
            </button>
          )}
        </section>

        {/* 文献目录 */}
        <section className="mt-2.5 rounded-[18px] border border-[#EDF3F2] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(11,110,99,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-extrabold tracking-tight text-slate-900">
              <OpenBookIcon className="h-4 w-4 text-[#3FB49C]" />
              文献目录
            </h2>
            <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">{visible.length} 份</span>
          </div>

          <label className="mt-2.5 flex items-center gap-2 rounded-[12px] bg-[#F3F7F6] px-3 py-2.5">
            <Icon name="search" className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文献名、机构或关键词"
              className="w-full bg-transparent text-[12px] outline-none placeholder:text-slate-400"
            />
          </label>

          {/* 领域筛选：横滑够快，但滑动看不全，右侧补一个展开全部的入口 */}
          <div className="mt-2 flex items-center gap-1.5">
            <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setTopicFilter('')}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[10.5px] font-bold transition ${
                  topicFilter === '' ? 'border-[#0B6E63] bg-[#0B6E63] text-white' : 'border-[#E3EDEA] bg-white text-slate-500'
                }`}
              >
                全部
              </button>
              {library.topics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setTopicFilter(topicFilter === topic ? '' : topic)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[10.5px] font-bold transition ${
                    topicFilter === topic ? 'border-[#0B6E63] bg-[#0B6E63] text-white' : 'border-[#E3EDEA] bg-white text-slate-500'
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowTopicSheet(true)}
              aria-label="查看全部领域"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[#E3EDEA] bg-white text-slate-500 transition hover:text-[#0B6E63]"
            >
              <Icon name="filter" className="h-4 w-4" />
            </button>
          </div>


          <div className="mt-1">
            {visible.slice(0, 10).map((item) => (
              <button
                key={item.doc}
                type="button"
                onClick={() => openDetail(item)}
                className="mt-2 block w-full rounded-[14px] bg-[#FAFCFC] px-3 py-3 text-left transition hover:bg-[#F2F9F8]"
              >
                <div className="flex items-start gap-2.5">
                  <ClosedBookIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#5FC9B6]" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-900">{item.doc}</p>
                    <p className="mt-1 truncate text-[10.5px] text-slate-400">
                      {shortOrg(item.org)}{item.year ? ` · ${item.year}` : ''}{item.pages ? ` · 第 ${item.pages} 页` : ''}
                    </p>
                  </div>
                  <span className="flex shrink-0 flex-col items-center rounded-[9px] bg-[#E6F7F4] px-2 py-1 leading-none text-[#0B6E63]">
                    <b className="text-[12px] font-black tabular-nums">{item.entry_count}</b>
                    <span className="mt-[2px] text-[8px] font-semibold">条依据</span>
                  </span>
                  <Icon name="chevron" className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                </div>
                {item.previews[0] && (
                  <p className="mt-1.5 line-clamp-2 rounded-[9px] bg-white px-2.5 py-1.5 text-[10.5px] leading-relaxed text-slate-500">
                    “{item.previews[0]}”
                  </p>
                )}
              </button>
            ))}
            {visible.length === 0 && (
              <p className="py-8 text-center text-[11.5px] text-slate-400">没有匹配的文献</p>
            )}
            {visible.length > 10 && (
              <p className="mt-2 py-2 text-center text-[10.5px] text-slate-400">
                共 {visible.length} 份，仅显示前 10 份 · 用搜索或分类缩小范围
              </p>
            )}
          </div>
        </section>

        <p className="mt-3 px-4 text-center text-[10px] leading-relaxed text-slate-400">
          文献版权归原机构所有，本页仅提供索引与官方页面跳转。
        </p>
      </div>

      {/* 全部机构：可滚动的底部卡片 */}
      {showOrgSheet && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
          <button type="button" aria-label="关闭" className="absolute inset-0 cursor-default bg-slate-900/35" onClick={() => setShowOrgSheet(false)} />
          <div className="relative flex max-h-[72vh] flex-col rounded-t-[20px] bg-white">
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
              <h3 className="text-[15px] font-extrabold tracking-tight text-slate-900">全部来源机构</h3>
              <button type="button" onClick={() => setShowOrgSheet(false)} aria-label="关闭" className="grid h-7 w-7 place-items-center rounded-full text-slate-400">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <p className="shrink-0 px-4 pb-2 text-[10.5px] text-slate-400">
              共 {library.stats.orgs} 家机构 · {library.stats.docs} 份文献，点击可筛选目录
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
              {library.orgs.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => { setOrgFilter(item.name); setShowOrgSheet(false) }}
                  className={`mt-1.5 flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition ${
                    orgFilter === item.name ? 'bg-[#E6F7F4]' : 'bg-[#FAFCFC] hover:bg-[#F2F9F8]'
                  }`}
                >
                  <BankIcon className="h-4 w-4 shrink-0 text-[#3FB49C]" />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">{item.name}</span>
                  <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10.5px] font-black tabular-nums text-[#0B6E63]">
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 全部领域 */}
      {showTopicSheet && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
          <button type="button" aria-label="关闭" className="absolute inset-0 cursor-default bg-slate-900/35" onClick={() => setShowTopicSheet(false)} />
          <div className="relative flex max-h-[72vh] flex-col rounded-t-[20px] bg-white">
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
              <h3 className="text-[15px] font-extrabold tracking-tight text-slate-900">按领域筛选</h3>
              <button type="button" onClick={() => setShowTopicSheet(false)} aria-label="关闭" className="grid h-7 w-7 place-items-center rounded-full text-slate-400">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
              <button
                type="button"
                onClick={() => { setTopicFilter(''); setShowTopicSheet(false) }}
                className={`mt-1.5 flex w-full items-center justify-between gap-2 rounded-[12px] px-3 py-2.5 text-left transition ${
                  topicFilter === '' ? 'bg-[#E6F7F4]' : 'bg-[#FAFCFC]'
                }`}
              >
                <span className="text-[12px] font-semibold text-slate-700">全部领域</span>
                <span className="text-[10.5px] font-black tabular-nums text-[#0B6E63]">{library.docs.length}</span>
              </button>
              {library.topics.map((topic) => {
                const count = library.docs.filter((item) => item.topic === topic).length
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => { setTopicFilter(topic); setShowTopicSheet(false) }}
                    className={`mt-1.5 flex w-full items-center justify-between gap-2 rounded-[12px] px-3 py-2.5 text-left transition ${
                      topicFilter === topic ? 'bg-[#E6F7F4]' : 'bg-[#FAFCFC] hover:bg-[#F2F9F8]'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">{topic}</span>
                    <span className="shrink-0 text-[10.5px] font-black tabular-nums text-[#0B6E63]">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 文献详情。z 必须高于底部导航的 z-50：同层级时 DOM 靠后的导航会压住底部内容 */}
      {detail && (
        <div className="fixed inset-0 z-[55] flex flex-col bg-white">
          <header className="flex shrink-0 items-center gap-2 border-b border-[#E3EDEA] bg-white px-3 py-3">
            <button
              type="button"
              onClick={() => setDetail(null)}
              aria-label="返回"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-[#F3F7F6]"
            >
              <Icon name="back" className="h-5 w-5" />
            </button>
            <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold tracking-tight text-slate-900">文献详情</p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <section className="rounded-[16px] border border-[#EDF3F2] bg-white px-3.5 py-3">
              <p className="text-[14px] font-extrabold leading-snug text-slate-900">{detail.doc}</p>
              <dl className="mt-2">
                {([
                  ['bankIcon', '发布机构', detail.org],
                  ['calendar', '发布年份', detail.year],
                  ['page', '收录页码', detail.pages ? `第 ${detail.pages} 页` : ''],
                  ['tag', '分类', detail.topic],
                  ['bookmark', '本库提取', `${detail.entry_count} 条依据`],
                ] as [string, string, string][]).filter(([, , value]) => value).map(([icon, label, value]) => (
                  <div key={label} className="flex items-center gap-2 border-b border-[#F0F5F4] py-1.5 last:border-b-0 last:pb-0">
                    {icon === 'bankIcon'
                      ? <BankIcon className="h-3.5 w-3.5 shrink-0 text-[#3FB49C]" />
                      : <Icon name={icon} className="h-3.5 w-3.5 shrink-0 text-[#3FB49C]" />}
                    <dt className="w-[60px] shrink-0 text-[11.5px] text-slate-400">{label}</dt>
                    <dd className="min-w-0 flex-1 text-[11.5px] font-semibold text-slate-700">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {detail.previews.length > 0 && (() => {
              const list = fullEntries ?? detail.previews
              const visibleList = list.slice(0, shownEntries)
              return (
                <section className="mt-3 rounded-[16px] border border-[#EDF3F2] bg-white px-3.5 py-3">
                  <h3 className="text-[12.5px] font-extrabold tracking-tight text-slate-900">原文结论摘录</h3>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">
                    {fullEntries
                      ? `本库从这份文献拆出的全部 ${list.length} 条依据，逐字摘自原文，不是 FitProof 的判断。`
                      : `以下 ${detail.previews.length} 条摘自这份文献拆出的 ${detail.entry_count} 条依据，逐字摘自原文，不是 FitProof 的判断。`}
                  </p>
                  <ul className="mt-2.5 space-y-1.5">
                    {visibleList.map((text, index) => (
                      <li key={index} className="flex gap-2 rounded-[10px] bg-[#F7FBFA] px-2.5 py-2">
                        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md bg-[#DDF2ED] text-[10px] font-black tabular-nums text-[#0B6E63]">
                          {index + 1}
                        </span>
                        <span className="text-[11.5px] leading-relaxed text-slate-600">{text}</span>
                      </li>
                    ))}
                  </ul>

                  {/* 一次渲染 600 多条会明显卡顿，分批放出来 */}
                  {fullEntries && list.length > shownEntries && (
                    <button
                      type="button"
                      onClick={() => setShownEntries((n) => n + 50)}
                      className="mt-2.5 w-full rounded-[10px] border border-[#E3EDEA] py-2 text-[11.5px] font-bold text-[#0B6E63]"
                    >
                      继续展开（还剩 {list.length - shownEntries} 条）
                    </button>
                  )}

                  {!fullEntries && detail.entry_count > detail.previews.length && (
                    <button
                      type="button"
                      onClick={loadAllEntries}
                      disabled={loadingEntries}
                      className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-[10px] border border-[#E3EDEA] py-2 text-[11.5px] font-bold text-[#0B6E63] disabled:opacity-50"
                    >
                      {loadingEntries ? '载入中…' : `查看全部 ${detail.entry_count} 条`}
                      {!loadingEntries && <Icon name="chevron" className="h-3 w-3" />}
                    </button>
                  )}
                </section>
              )
            })()}

            {detailCitedCount > 0 && (
              <section className="mt-3 rounded-[16px] bg-[#E6F7F4] px-4 py-3">
                <p className="text-[12px] font-bold text-[#0B6E63]">
                  你有 {detailCitedCount} 条核验引用了这份文献
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[#3E8C81]">
                  统计自本机「我的 · 核验历史」，不上传服务器。在「我的」里可以看到是哪几条。
                </p>
              </section>
            )}

            {detail.url ? (
              <a
                href={detail.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-[#12BFA6] bg-white py-3 text-[13px] font-bold text-[#089480] transition hover:bg-[#F2FBF9]"
              >
                <Icon name="external" className="h-4 w-4" />
                前往官方页面
              </a>
            ) : (
              <p className="mt-3 rounded-[12px] bg-white px-4 py-3 text-center text-[11.5px] text-slate-400">
                这份文献暂无公开链接，可凭上方信息自行检索
              </p>
            )}

            <p className="mt-3 px-4 pb-2 text-center text-[10px] leading-relaxed text-slate-400">
              链接指向机构官方页面，部分文献可能需要注册或订阅才能查看全文。
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
