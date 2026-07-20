'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import VerifyResultCard from '@/components/VerifyResultCard'
import FitProofCat from '@/components/FitProofCat'
import { clearHistory, loadHistory, removeHistory, type HistoryRecord } from '@/lib/history'
import {
  bucketOf,
  heatmap,
  LEVELS,
  levelOf,
  type HeatCell,
  loadIdentity,
  saveIdentity,
  streakDays,
  topicStats,
  type Identity,
  type VerdictBucket,
} from '@/lib/profile'

type Filter = '全部' | VerdictBucket

const BUCKETS: VerdictBucket[] = ['不实', '需留意', '站得住脚']

/** 三档配色全局唯一来源：筛选、条目竖条、话题分段条都从这里取，避免各处各画一套。 */
const BUCKET_STYLE: Record<VerdictBucket, { bar: string; text: string; chip: string }> = {
  不实: { bar: 'bg-[#E1703A]', text: 'text-[#C2540F]', chip: 'bg-[#FDF1EA] text-[#C2540F]' },
  需留意: { bar: 'bg-[#EFB748]', text: 'text-[#A8760B]', chip: 'bg-[#FDF7EA] text-[#A8760B]' },
  站得住脚: { bar: 'bg-[#34C7AE]', text: 'text-[#0B6E63]', chip: 'bg-[#E6F7F4] text-[#0B6E63]' },
}

const svgBase = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const ICONS: Record<string, ReactNode> = {
  shield: <><path d="M12 3.5 19 6v5c0 4.3-2.8 7.7-7 9.5-4.2-1.8-7-5.2-7-9.5V6l7-2.5Z" /><path d="m8.8 12.1 2.1 2.1 4.2-4.3" /></>,
  upload: <><path d="M12 16V5" /><path d="m8 9 4-4 4 4" /><path d="M5 16v3h14v-3" /></>,
  trash: <><path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
  leaf: <><path d="M20 4S8 4 6 11c-1.4 4.8 1.2 8 1.2 8" /><path d="M7.2 19s9.8-1.5 11.6-11" /></>,
  back: <path d="m15 5-7 7 7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
}

function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  return <svg className={className} {...svgBase}>{ICONS[name]}</svg>
}

/** 指标图标用实心填充：描边版在小尺寸下太细太淡，跟参考图完全不是一个分量。 */
const STAT_ICONS: Record<string, ReactNode> = {
  doc: <path d="M13.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5L13.5 2Zm-.5 7V3.8L18.2 9H13Zm-4 3h6v1.6H9V12Zm0 3.4h4V17H9v-1.6Z" />,
  alert: <path d="M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3v4l4.5-4H20a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-9 3.2h2v5h-2v-5Zm1 8.6a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z" />,
  shieldFill: <path d="M12 1.8 3.5 4.9v6.4c0 5.2 3.6 9.4 8.5 11.1 4.9-1.7 8.5-5.9 8.5-11.1V4.9L12 1.8Zm-1.3 14.5-3.6-3.6 1.7-1.7 1.9 1.9 5-5 1.7 1.7-6.7 6.7Z" />,
  calendar: <path d="M18 3.5h-1V1.8h-2.2v1.7H9.2V1.8H7v1.7H6a2 2 0 0 0-2 2V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5.5a2 2 0 0 0-2-2ZM18 20H6V9.8h12V20Z" />,
}

function StatIcon({ name, className = 'h-[15px] w-[15px]' }: { name: string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{STAT_ICONS[name]}</svg>
}

/**
 * 话题图标：topic 是用户自由输入的文本，没有模型打标，这里用关键词映射复用
 * public/claim-icons 里已有的 24 张图。命中不了就用 general —— 宁可通用，
 * 也不要给「喝柠檬水」配一张药丸图。顺序敏感：更具体的词必须排在前面
 * （「水果」要先于「水」，否则水果会被当成饮水）。
 */
const TOPIC_ICON_RULES: [RegExp, string][] = [
  [/蛋黄|鸡蛋|蛋白质/, 'egg'],
  [/孕|备孕|产后|月子|哺乳/, 'pregnancy'],
  [/婴|宝宝|儿童|辅食/, 'baby'],
  [/水果|蔬菜|果蔬/, 'veggie'],
  [/跑步|运动|健身|有氧|拉伸|锻炼/, 'exercise'],
  [/减肥|体重|肥胖|减脂/, 'weight'],
  [/睡眠|失眠|熬夜/, 'sleep'],
  [/咖啡|喝茶|茶叶/, 'tea-coffee'],
  [/牛奶|酸奶|奶制品/, 'milk'],
  [/喝水|饮水|柠檬水|白开水/, 'water'],
  [/血糖|糖尿病/, 'blood-sugar'],
  [/血压/, 'blood-pressure'],
  [/血脂|胆固醇|心脏|心血管/, 'heart'],
  [/癌|肿瘤/, 'cancer'],
  [/维生素|保健品|补剂/, 'supplement'],
  [/吃药|服药|抗生素|药物/, 'pill'],
  [/红肉|海鲜|吃鱼|吃肉/, 'meat'],
  [/主食|粗粮|碳水|米饭|面食/, 'grain'],
  [/食用油|吃盐|吃糖|控糖/, 'oil-salt-sugar'],
  [/老年|中老年/, 'elderly'],
  [/喝酒|饮酒|酒精/, 'alcohol'],
  [/疫苗|打针|接种/, 'vaccine'],
  [/体检|化验|报告单/, 'lab-report'],
  [/感冒|发烧|发热|流感/, 'fever-cold'],
  [/头痛|偏头痛|头疼/, 'headache'],
  [/免疫|抵抗力/, 'immunity'],
  [/情绪|压力|焦虑|抑郁|心情/, 'mood'],
  [/肠胃|肠道|消化|便秘|胃/, 'stomach'],
  [/骨|关节|膝盖|颈椎|腰/, 'bone-joint'],
  [/皮肤|美白|祛痘|痘|防晒/, 'skin'],
  [/头发|脱发|白发|生发/, 'hair'],
  [/眼睛|视力|近视|护眼/, 'eye'],
  [/牙|口腔/, 'teeth'],
  [/洗澡|洗头|清洁/, 'bath'],
  [/酸痛|疼痛|疼/, 'pain'],
]

function topicIcon(topic: string): string {
  for (const [pattern, icon] of TOPIC_ICON_RULES) if (pattern.test(topic)) return icon
  return 'general'
}

/** 金/银/铜牌名次：靠渐变 + 高光边做出金属感，纯色圆点读不出「奖牌」。 */
const MEDALS = [
  'bg-[linear-gradient(145deg,#FFE08A,#F0B23C_55%,#D9922A)] ring-[#FFF3D0]',
  'bg-[linear-gradient(145deg,#F1F5F9,#C3CFDB_55%,#A3B2C1)] ring-[#F4F8FB]',
  'bg-[linear-gradient(145deg,#F2C79C,#D08C55_55%,#B4703C)] ring-[#FBEBDA]',
]

function Medal({ rank, className = '' }: { rank: 1 | 2 | 3; className?: string }) {
  return (
    <span
      className={`grid h-[19px] w-[19px] place-items-center rounded-full text-[10px] font-black text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] ring-2 ${MEDALS[rank - 1]} ${className}`}
    >
      {rank}
    </span>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

const HEAT_SCALE = ['bg-[#EAF2F0]', 'bg-[#C3E8E0]', 'bg-[#8AD8C8]', 'bg-[#45BFA9]', 'bg-[#0F8877]']

function heatClass(count: number) {
  if (count < 0) return 'bg-transparent'
  return HEAT_SCALE[Math.min(count, 4)]
}

interface ConfirmState {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
}

/** 站内确认框。原生 window.confirm 长着浏览器的脸、样式不可控，出现在演示里很突兀。 */
function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-8" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭" className="absolute inset-0 cursor-default bg-slate-900/35" onClick={onClose} />
      <div className="relative w-full max-w-[19rem] rounded-[18px] bg-white px-5 py-4 shadow-[0_12px_32px_rgba(11,45,40,0.22)]">
        <p className="text-[15px] font-extrabold tracking-tight text-slate-900">{state.title}</p>
        <p className="mt-2 max-h-32 overflow-y-auto text-[12px] leading-relaxed text-slate-500">{state.message}</p>
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[11px] border-[1.5px] border-[#E3EDEA] bg-white py-2.5 text-[12.5px] font-bold text-slate-600 transition hover:bg-[#F3F7F6]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => { state.onConfirm(); onClose() }}
            className="flex-1 rounded-[11px] bg-[#E23D22] py-2.5 text-[12.5px] font-bold text-white transition hover:bg-[#C93318]"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 通用信息弹窗（等级说明、某天的核验明细都用它），只有一个「知道了」出口。 */
function InfoDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭" className="absolute inset-0 cursor-default bg-slate-900/35" onClick={onClose} />
      <div className="relative flex max-h-[75vh] w-full max-w-[20rem] flex-col rounded-[18px] bg-white shadow-[0_12px_32px_rgba(11,45,40,0.22)]">
        <p className="shrink-0 px-5 pb-2 pt-4 text-[15px] font-extrabold tracking-tight text-slate-900">{title}</p>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">{children}</div>
        <div className="shrink-0 px-5 pb-4 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[11px] bg-[#0B6E63] py-2.5 text-[12.5px] font-bold text-white transition hover:bg-[#095A51]"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`mt-3 rounded-[18px] bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(11,110,99,0.06)] ${className}`}>{children}</section>
}

const MENU_TITLE_ICONS: Record<string, ReactNode> = {
  // 婴儿脚印：四个脚趾自左上向右下递减排列，脚掌是上宽下窄的肾形、左下收出足弓。
  // 关键在脚趾的「递减 + 弧线排布」和脚掌左侧那道内凹，缺了就不像脚。
  footprint: <>
    <ellipse cx="8.9" cy="5.5" rx="3.6" ry="3.85" transform="rotate(-10 8.9 5.5)" />
    <ellipse cx="15.6" cy="5.2" rx="2.3" ry="2.45" transform="rotate(6 15.6 5.2)" />
    <ellipse cx="20.9" cy="7.4" rx="2" ry="2.15" transform="rotate(22 20.9 7.4)" />
    <ellipse cx="25.1" cy="11.1" rx="1.75" ry="1.9" transform="rotate(34 25.1 11.1)" />
    <path d="M15.5 9.3c-4.4 0-8.1 3-8.8 7-.5 3 1.5 4.9 3.1 6.2 1.2 1 1.5 2.5 1.7 4.3.3 2.1 2.3 3.6 4.8 3.6 4 0 7.3-3.4 8.1-8.4.7-4.6-1.3-9.6-4.8-11.7-1.2-.8-2.6-1-4.1-1Z" />
  </>,
  // 标签：实心主体 + 左上白孔，右侧再叠一层同形标签，两者之间留白缝分层。
  tag: <>
    <path d="M2.6 6.1A3.4 3.4 0 0 1 6 2.7h11.7l9.2 9.2a4.1 4.1 0 0 1 0 5.8l-8.4 8.4a4.1 4.1 0 0 1-5.8 0L2.6 16.6V6.1Z" />
    <circle cx="9.1" cy="9.1" r="2.5" fill="white" />
    <path d="m20.9 2.7 9.2 9.2a4.1 4.1 0 0 1 0 5.8l-8.4 8.4" fill="none" stroke="white" strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m20.9 2.7 9.2 9.2a4.1 4.1 0 0 1 0 5.8l-8.4 8.4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 6.8v5.4l3.7 2.1" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
  lock: <><path d="M6.3 10.2h11.4c.8 0 1.5.7 1.5 1.5v7.8c0 .8-.7 1.5-1.5 1.5H6.3c-.8 0-1.5-.7-1.5-1.5v-7.8c0-.8.7-1.5 1.5-1.5Z" /><path d="M8.1 10.2V7.5a3.9 3.9 0 0 1 7.8 0v2.7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /></>,
  share: <><path d="M14.8 3.2 21 9.4l-6.2 6.2v-4h-3.1c-3.2 0-5.6 1.8-7.5 4.7.5-5.6 3.3-8.7 8.4-8.7h2.2v-4.4Z" /><path d="M4.5 18.4v1.1c0 .8.7 1.5 1.5 1.5h10.1c.8 0 1.5-.7 1.5-1.5v-1.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
}

function MenuTitleIcon({ name }: { name: string }) {
  // 三个图标要「等重」而不是「等大」：history 是实心圆，密度最高；
  // 脚印由 5 个分离形状组成、留白多，同尺寸下会显得小，所以放大一档；
  // 标签是整块实心，反而要收小、并把叠层缝加宽，否则显得臃肿。
  const viewBox = name === 'footprint' ? '0 0 32 32' : name === 'tag' ? '0 0 33 29' : '0 0 24 24'
  const size = name === 'footprint' ? 'h-[20px] w-[20px]' : name === 'tag' ? 'h-[16px] w-[18px]' : 'h-[18px] w-[18px]'
  return <svg className={`relative -top-px shrink-0 text-[#078C7E] ${size}`} viewBox={viewBox} fill="currentColor" aria-hidden="true">{MENU_TITLE_ICONS[name]}</svg>
}

function CardTitle({ title, note, extra, icon }: { title: string; note?: ReactNode; extra?: ReactNode; icon?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon && <MenuTitleIcon name={icon} />}
        <h2 className="shrink-0 text-[14px] font-extrabold tracking-tight text-slate-900">{title}</h2>
        {note && <span className="flex min-w-0 items-center gap-1 truncate text-[10.5px] text-slate-400">{note}</span>}
      </div>
      {extra}
    </div>
  )
}

export default function ProfileTab() {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [identity, setIdentity] = useState<Identity>({ nickname: '求真的你', pose: 'checking' })
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [showLevels, setShowLevels] = useState(false)
  const [dayCell, setDayCell] = useState<HeatCell | null>(null)
  const [filter, setFilter] = useState<Filter>('全部')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setRecords(loadHistory())
    setIdentity(loadIdentity())
  }, [])

  const streak = useMemo(() => streakDays(records), [records])
  const level = useMemo(() => levelOf(records.length), [records.length])
  const topics = useMemo(() => topicStats(records), [records])
  const grid = useMemo(() => heatmap(records), [records])
  const counts = useMemo(() => ({
    全部: records.length,
    不实: records.filter((r) => bucketOf(r) === '不实').length,
    需留意: records.filter((r) => bucketOf(r) === '需留意').length,
    站得住脚: records.filter((r) => bucketOf(r) === '站得住脚').length,
  }), [records])
  const visible = useMemo(
    () => (filter === '全部' ? records : records.filter((record) => bucketOf(record) === filter)),
    [records, filter],
  )
  const shown = showAll ? visible : visible.slice(0, 5)
  const detail = useMemo(() => records.find((record) => record.id === detailId) || null, [records, detailId])

  // 详情页打开时锁滚动，否则底层列表会跟着手指一起动
  useEffect(() => {
    if (!detail) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [detail])

  // 每列取周一那天，月份和前一列不同就打标签 —— 让 13 周的格子有时间锚点。
  const monthMarks = useMemo(() => {
    let last = ''
    return grid.map((week) => {
      const month = week[0]?.date.slice(0, 7) || ''
      if (month && month !== last) {
        last = month
        return `${Number(month.slice(5))}月`
      }
      return ''
    })
  }, [grid])

  function commitName() {
    const nickname = draftName.trim()
    setIdentity(saveIdentity({ ...identity, nickname: nickname || identity.nickname }))
    setEditingName(false)
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fitproof-核验记录-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 「识别争议」= 不实 + 需留意。两档都是「这条别照着做」，合起来才是用户真正避开的坑。
  const disputed = counts.不实 + counts.需留意
  // 四个图标统一青色系，只靠明度拉开层次 —— 橙/蓝/绿混在一张卡里太跳，
  // 而且会让人误以为颜色在编码某种状态（其实没有）。
  const stats = [
    { key: 'doc', label: '累计核验', value: records.length, unit: '条', tint: 'bg-[#E4F6F2] text-[#0FA48F]' },
    { key: 'alert', label: '识别争议', value: disputed, unit: '条', tint: 'bg-[#E4F6F2] text-[#0FA48F]' },
    { key: 'shieldFill', label: '可借鉴', value: counts.站得住脚, unit: '条', tint: 'bg-[#E4F6F2] text-[#0FA48F]' },
    { key: 'calendar', label: '连续天数', value: streak, unit: '天', tint: 'bg-[#E4F6F2] text-[#0FA48F]' },
  ]

  return (
    // 外层容器已有 pb-16 给固定导航让位，这里只补一点呼吸 —— 再叠一个 pb-24 就是页面末尾那块突兀的空白
    <main className="min-h-[calc(100dvh-4rem)] bg-[#F3F7F6] pb-3 text-slate-950">
      <div className="mx-auto max-w-2xl px-3 pt-3">

        {/* 求真档案：头像 + 等级 + 四个指标同处一张大卡 */}
        <section className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-[#E1F4EF] via-[#F0FAF8] to-[#FBFDFD] px-4 py-4 shadow-[0_1px_3px_rgba(11,110,99,0.06)]">
          {/* 背景水印：两层径向光晕托底，盾牌本身保持锐利轮廓（单层实心渐变，
              不加内描边和高光 —— 那会把边缘糊掉）。对勾走浅青渐变。 */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 360 150" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
            <defs>
              <radialGradient id="fp-glow-a" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="fp-glow-b" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#BFE8DE" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#BFE8DE" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="300" cy="44" r="86" fill="url(#fp-glow-a)" />
            <circle cx="240" cy="88" r="70" fill="url(#fp-glow-b)" />
          </svg>

          {/* 盾牌独立成固定尺寸的一层：跟着上面那张 slice 缩放的背景走的话，
              卡片一变高盾牌就跟着放大，尺寸永远调不准。 */}
          <svg
            className="pointer-events-none absolute right-3 top-2.5 h-[62px] w-[55px]"
            viewBox="3 1.5 17.6 20.3"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="fp-shield" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.62" />
              </linearGradient>
              <linearGradient id="fp-check" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F2FBF9" />
                <stop offset="100%" stopColor="#D6EFE7" />
              </linearGradient>
            </defs>
            {/* 顶部三个尖角（左肩 / 顶点 / 右肩）全部用直线段收口，不留任何圆角；
                只有底部收成尖端时才用曲线。 */}
            <path
              d="M12 1.8 20.8 4.8 20.8 11C20.8 16.2 17 19.8 12 21.8 7 19.8 3.2 16.2 3.2 11L3.2 4.8Z"
              fill="url(#fp-shield)"
              strokeLinejoin="miter"
            />
            {/* 对勾：细、淡，只是水印上的一层暗示 */}
            <path d="m8.4 11.9 2.5 2.5 4.8-4.9" fill="none" stroke="url(#fp-check)" strokeWidth="1.3" strokeOpacity="0.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <div className="relative flex items-start gap-3">
            {/* 头像内容待定，先只做白色外框和底 */}
            <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full border-[3px] border-white bg-[#DCF0EC] shadow-[0_2px_10px_rgba(11,110,99,0.14)]" aria-label="头像占位" />
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {editingName ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitName() }}
                    maxLength={16}
                    className="w-full rounded-lg border border-[#CFDEDB] px-2 py-0.5 text-[15px] font-extrabold outline-none focus:border-[#20CDB6]"
                    aria-label="修改昵称"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { setDraftName(identity.nickname); setEditingName(true) }}
                      className="min-w-0 shrink truncate text-left text-[15px] font-extrabold tracking-tight"
                    >
                      {identity.nickname}
                    </button>
                    {/* 等级和成就名都是查看等级表的入口 —— 用户想了解称号时最先点的就是它们 */}
                    <button
                      type="button"
                      onClick={() => setShowLevels(true)}
                      aria-label="查看等级与成就"
                      className="flex shrink-0 items-center gap-1.5"
                    >
                      <span className="rounded-md bg-[#0B6E63] px-1.5 py-[3px] text-[9.5px] font-black leading-none text-white">Lv.{level.index}</span>
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[#0B6E63]">
                        <Icon name="shield" className="h-3.5 w-3.5" />
                        {level.name}
                      </span>
                    </button>
                  </>
                )}
              </div>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10.5px] font-semibold text-[#0B6E63] shadow-[0_1px_2px_rgba(11,110,99,0.08)]">
                <Icon name="leaf" className="h-3 w-3" />
                持续学习 · 理性生活
              </span>
            </div>
          </div>

          {/* 满级时 level.next 为空，但进度条整块不能跟着消失 —— 那会让最高等级
              反而比中间等级少一块内容，布局突然塌陷，看着像出了故障。 */}
          <div className="relative mt-3">
            <div className="h-[4px] overflow-hidden rounded-full bg-white/80">
              <div className="h-full rounded-full bg-[#2FB4A1] transition-[width] duration-500" style={{ width: `${Math.round(level.progress * 100)}%` }} />
            </div>
            <button
              type="button"
              onClick={() => setShowLevels(true)}
              className="mt-1.5 flex items-center gap-1 text-[10.5px] text-slate-500 transition hover:text-[#0B6E63]"
            >
              {level.next
                ? `再 ${level.next.need} 条解锁「${level.next.name}」`
                : `已解锁全部成就 · 累计核验 ${records.length} 条`}
              <Icon name="chevron" className="h-3 w-3" />
            </button>
          </div>

          {/* 图标竖直居中于整块，标签和数字叠在右侧一列 —— 天然左对齐，不用再算缩进 */}
          <div className="relative mt-3 grid grid-cols-4 gap-2">
            {stats.map((item) => (
              <div key={item.key} className="flex items-center gap-1.5 rounded-[12px] bg-white/85 px-1.5 py-1.5 shadow-[0_1px_2px_rgba(11,110,99,0.06)]">
                <span className={`grid h-[21px] w-[21px] shrink-0 place-items-center rounded-[7px] ${item.tint}`}>
                  <StatIcon name={item.key} className="h-[13px] w-[13px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] font-semibold leading-tight text-slate-500">{item.label}</p>
                  <p className="mt-0.5 flex items-baseline gap-0.5">
                    <b className="text-[17px] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">{item.value}</b>
                    <span className="text-[9px] text-slate-400">{item.unit}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 核验足迹 */}
        <Card>
          <CardTitle icon="footprint" title="核验足迹" note={<span className="truncate">最近 18 周</span>} />
          <div className="mt-2">
            {/* 月份标签与格子共用同一套列，保证标签落在对的那一周上 */}
            <div className="grid auto-cols-fr grid-flow-col gap-[2.5px] pl-[19px]">
              {monthMarks.map((mark, index) => (
                <span key={index} className="overflow-visible whitespace-nowrap text-[9px] font-semibold text-slate-400">{mark}</span>
              ))}
            </div>
            <div className="mt-1 flex gap-[3px]">
              <div className="grid shrink-0 grid-rows-7 gap-[2.5px] text-[8px] text-slate-400">
                {['一', '', '三', '', '五', '', '日'].map((day, index) => (
                  <span key={index} className="flex h-[10px] w-4 items-center justify-end leading-none">{day}</span>
                ))}
              </div>
              {/* 一列 = 一周（周一至周日），一行 = 同一个星期几。格子压扁，整块才不会顶成方阵 */}
              <div className="grid flex-1 auto-cols-fr grid-flow-col grid-rows-7 gap-[2.5px]">
                {grid.map((week) => week.map((cell) => (
                  cell.count < 0 ? (
                    <span key={cell.date} className="h-[10px] w-full rounded-[3px] bg-transparent" />
                  ) : (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => setDayCell(cell)}
                      aria-label={`${cell.date}，${cell.count} 条核验`}
                      className={`h-[10px] w-full rounded-[3px] transition hover:ring-2 hover:ring-[#0B6E63]/40 ${heatClass(cell.count)}`}
                    />
                  )
                )))}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[9.5px] text-slate-400">
            <span>较少</span>
            {HEAT_SCALE.map((cls) => <i key={cls} className={`h-2.5 w-2.5 rounded-[2.5px] ${cls}`} />)}
            <span>较多</span>
          </div>
        </Card>

        {/* 关注话题 */}
        <Card>
          <CardTitle icon="tag" title="关注话题" extra={<span className="shrink-0 text-[10.5px] text-slate-400">按核验量</span>} />
          {topics.length === 0 ? (
            <p className="py-5 text-center text-[11.5px] text-slate-400">暂无 · 核验后这里会自动归类你关注的话题</p>
          ) : (
            <>
              {topics.slice(0, 1).map((stat) => (
                <div key={stat.topic} className="relative mt-2.5 rounded-[14px] bg-[#F7FBFA] py-2.5 pl-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    <span className="relative shrink-0">
                      <span className="grid h-[46px] w-[46px] place-items-center rounded-full border-2 border-white bg-[#DDF2ED] shadow-[0_1px_3px_rgba(11,110,99,0.12)]">
                        <img
                          src={`/claim-icons/${topicIcon(stat.topic)}.webp`}
                          alt=""
                          className="h-[34px] w-[34px] object-contain"
                          onError={(event) => { event.currentTarget.src = '/claim-icons/general.webp' }}
                        />
                      </span>
                      <Medal rank={1} className="absolute -left-1 -top-1" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-900" title={stat.topic}>{stat.topic}</span>
                        <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500">{stat.total} 条</span>
                      </div>
                      {/* 分段之间留空隙、每段独立圆角：flex-grow 按条数分配，gap 才不会把总宽撑爆 */}
                      <span className="mt-1.5 flex h-2.5 gap-[3px]">
                        {BUCKETS.map((bucket) => stat[bucket] > 0 && (
                          <i key={bucket} className={`block h-full rounded-[4px] ${BUCKET_STYLE[bucket].bar}`} style={{ flexGrow: stat[bucket] }} />
                        ))}
                      </span>
                      <p className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-slate-500">
                        {BUCKETS.map((bucket) => (
                          <span key={bucket} className="flex items-center gap-1">
                            <i className={`h-2 w-2 rounded-[2px] ${BUCKET_STYLE[bucket].bar}`} />
                            {bucket} {stat[bucket]}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {topics.length > 1 && (
                <div className="mt-2 flex gap-2">
                  {topics.slice(1, 3).map((stat, index) => (
                    <div key={stat.topic} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[12px] bg-[#F3F7F6] px-2 py-1.5">
                      <Medal rank={(index + 2) as 2 | 3} />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700" title={stat.topic}>{stat.topic}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{stat.total} 条</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>

        {/* 核验历史 —— 一条 = 一个被核验的说法，不是一个视频 */}
        <Card>
          <CardTitle icon="history" title="核验历史" extra={records.length > 0 ? <span className="shrink-0 text-[10.5px] text-slate-400">最近 50 条</span> : undefined} />

          {records.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FitProofCat pose="empty" size={88} className="mx-auto" title="还没有记录" />
              <p className="mt-3 text-[14.5px] font-bold text-slate-900">还没有核验记录</p>
              <p className="mx-auto mt-1.5 max-w-[15rem] text-[11.5px] leading-relaxed text-slate-500">
                去「核验」贴一条健康短视频链接，结论和可追溯依据会保存在这里。
              </p>
            </div>
          ) : (
            <>
              <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto">
                {(['全部', ...BUCKETS] as Filter[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setFilter(key); setShowAll(false) }}
                    aria-pressed={filter === key}
                    className={`shrink-0 rounded-[10px] border px-3 py-1.5 text-[11px] font-bold transition ${
                      filter === key
                        ? 'border-[#0B6E63] bg-[#0B6E63] text-white'
                        : 'border-[#E3EDEA] bg-white text-slate-500'
                    }`}
                  >
                    {key} {counts[key]}
                  </button>
                ))}
              </div>

              <div className="mt-2">
                {shown.map((record) => {
                  const bucket = bucketOf(record)
                  const style = BUCKET_STYLE[bucket]
                  return (
                    <article key={record.id} className="mt-2 overflow-hidden rounded-[12px] bg-[#FAFCFC]">
                      <div className="flex gap-2.5">
                        <span className={`w-[3.5px] shrink-0 ${style.bar}`} />
                        <div className="min-w-0 flex-1 py-2.5 pr-2.5">
                          <div className="flex items-start justify-between gap-2">
                            {/* 标签用三档归类，和筛选完全对齐；模型 verdict 原话在详情页 */}
                            <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${style.chip}`}>{bucket}</span>
                            <button
                              type="button"
                              onClick={() => setDetailId(record.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-900">“{record.claim}”</p>
                            </button>
                            <span className="shrink-0 text-[9.5px] tabular-nums text-slate-400">{formatDate(record.createdAt)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 pl-[38px] text-[10.5px]">
                            <span className="min-w-0 truncate text-slate-400">{record.topic || record.reference?.title || '未分类'}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <button type="button" onClick={() => setDetailId(record.id)} className="font-bold text-[#0B6E63]">
                                看依据 ›
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmState({
                                  title: '删除这条核验记录？',
                                  message: `“${record.claim}”\n\n删除后无法恢复。`,
                                  confirmLabel: '删除',
                                  onConfirm: () => setRecords(removeHistory(record.id)),
                                })}
                                aria-label="删除这条记录"
                                className="text-slate-300 transition hover:text-[#B8402F]"
                              >
                                ✕
                              </button>
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
                {visible.length === 0 && (
                  <p className="py-8 text-center text-[11.5px] text-slate-400">这个分类下还没有记录</p>
                )}
                {visible.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="mt-2 w-full py-2 text-center text-[11.5px] font-bold text-[#0B6E63]"
                  >
                    {showAll ? '收起 ⌃' : `查看全部 ${visible.length} 条 ›`}
                  </button>
                )}
              </div>
            </>
          )}
        </Card>

        {/* 我的分享 —— 占位。社区目前是只读静态 JSON，没有分享功能，
            数据结构里也没有「分享者」字段。这里先摆好位置和空态，
            等分享功能落地后把 records 换成真实分享数据即可，绝不用假数据占坑。 */}
        <Card>
          <CardTitle icon="share" title="我的分享" extra={<span className="shrink-0 text-[10.5px] text-slate-400">分享到社区</span>} />
          <div className="mt-2 rounded-[14px] border border-dashed border-[#D3E5E1] bg-[#F9FCFB] px-4 py-6 text-center">
            <p className="text-[12.5px] font-bold text-slate-600">还没有分享过</p>
            <p className="mx-auto mt-1.5 max-w-[16rem] text-[11px] leading-relaxed text-slate-400">
              分享功能还在开发中。做好之后，你分享到社区的核验会出现在这里。
            </p>
          </div>
        </Card>

        {/* 数据与隐私 */}
        <Card className="!py-3">
          <CardTitle
            icon="lock"
            title="数据与隐私"
            extra={<span className="flex shrink-0 items-center gap-1 text-[10.5px] text-slate-400">本机存储<Icon name="shield" className="h-3.5 w-3.5" /></span>}
          />
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
            核验记录只保存在这台设备上，不会上传服务器，我们也不收集你关注了哪些健康话题。
          </p>
          <div className="mt-2.5 flex gap-2.5">
            <button
              type="button"
              onClick={handleExport}
              disabled={records.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-[#12BFA6] bg-white py-2.5 text-[12.5px] font-bold text-[#089480] transition hover:bg-[#F2FBF9] disabled:opacity-40"
            >
              <Icon name="upload" className="h-4 w-4" />
              导出记录
            </button>
            <button
              type="button"
              onClick={() => {
                if (records.length === 0) return
                setConfirmState({
                  title: `清空全部 ${records.length} 条记录？`,
                  message: '你的核验历史、关注话题和核验足迹都会一并清空，且无法恢复。建议先导出备份。',
                  confirmLabel: '全部清空',
                  onConfirm: () => { clearHistory(); setRecords([]) },
                })
              }}
              disabled={records.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-[#F0644B] bg-white py-2.5 text-[12.5px] font-bold text-[#E23D22] transition hover:bg-[#FDF5F3] disabled:opacity-40"
            >
              <Icon name="trash" className="h-4 w-4" />
              清空全部
            </button>
          </div>
        </Card>

        <p className="mt-3 flex items-center justify-center gap-1.5 px-4 text-center text-[10px] leading-relaxed text-slate-400">
          <Icon name="shield" className="h-3.5 w-3.5 shrink-0" />
          本产品用于健康内容辨析，不构成医疗诊断或个体化治疗建议。
        </p>

      </div>

      {/* 核验详情：整页覆盖。z 必须高于底部导航的 z-50 —— 同层级时 DOM 靠后的导航会压住底部内容 */}
      {detail && (
        <div className="fixed inset-0 z-[55] flex flex-col bg-[#F3F7F6]">
          <header className="flex shrink-0 items-center gap-2 border-b border-[#E3EDEA] bg-white px-3 py-3">
            <button
              type="button"
              onClick={() => setDetailId(null)}
              aria-label="返回"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-[#F3F7F6]"
            >
              <Icon name="back" className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-extrabold tracking-tight text-slate-900">核验详情</p>
              <p className="truncate text-[10.5px] text-slate-400">
                {detail.topic || detail.reference?.title || '未分类'} · {formatDate(detail.createdAt)}
              </p>
            </div>
            <span className={`shrink-0 rounded-md px-2 py-1 text-[10.5px] font-black ${BUCKET_STYLE[bucketOf(detail)].chip}`}>
              {bucketOf(detail)}
            </span>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <VerifyResultCard result={detail.result} claimTitle={`“${detail.claim}”`} />
            {detail.reference?.url && (
              <a
                href={detail.reference.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center justify-between gap-2 rounded-[14px] bg-white px-4 py-3 text-[12px] font-semibold text-[#0B6E63] shadow-[0_1px_3px_rgba(11,110,99,0.06)]"
              >
                <span className="min-w-0 truncate">
                  来源视频{detail.reference.author ? ` · ${detail.reference.author}` : ''}
                </span>
                <span className="shrink-0">打开 ›</span>
              </a>
            )}
            <p className="mt-3 px-4 pb-2 text-center text-[10px] leading-relaxed text-slate-400">
              本产品用于健康内容辨析，不构成医疗诊断或个体化治疗建议。
            </p>
          </div>
        </div>
      )}

      {showLevels && (
        <InfoDialog title="等级与成就" onClose={() => setShowLevels(false)}>
          <p className="pb-2 text-[11px] leading-relaxed text-slate-500">
            等级只看你完成过多少条核验，不看结论对错 —— 查证本身就值得记一笔。
          </p>
          <ul className="space-y-1.5 pb-1">
            {LEVELS.map((item, index) => {
              const reached = records.length >= item.min
              const current = level.index === index + 1
              return (
                <li
                  key={item.name}
                  className={`flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 ${current ? 'bg-[#E6F7F4] ring-1 ring-[#20CDB6]' : 'bg-[#F7FBFA]'}`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black ${reached ? 'bg-[#0B6E63] text-white' : 'bg-[#DCE7E4] text-slate-500'}`}>
                    Lv{index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
                      {item.name}
                      {current && <span className="rounded bg-[#0B6E63] px-1.5 py-0.5 text-[9px] font-black text-white">当前</span>}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] text-slate-400">{item.blurb}</p>
                  </div>
                  <span className="shrink-0 text-[10.5px] font-bold tabular-nums text-slate-500">
                    {item.min === 0 ? '默认' : `${item.min} 条`}
                  </span>
                </li>
              )
            })}
          </ul>
        </InfoDialog>
      )}

      {dayCell && (
        <InfoDialog title={dayCell.date.replace(/-/g, '/')} onClose={() => setDayCell(null)}>
          {dayCell.count === 0 ? (
            <p className="pb-1 text-[12px] leading-relaxed text-slate-500">这天没有核验记录。</p>
          ) : (
            <>
              <p className="pb-2 text-[12px] text-slate-500">
                这天核验了 <b className="text-[15px] font-extrabold tabular-nums text-[#0B6E63]">{dayCell.count}</b> 条
              </p>
              <ul className="space-y-1.5 pb-1">
                {records
                  .filter((record) => record.createdAt.slice(0, 10) === dayCell.date)
                  .map((record) => {
                    const bucket = bucketOf(record)
                    return (
                      <li key={record.id} className="flex gap-2 rounded-[10px] bg-[#F7FBFA] px-2.5 py-2">
                        <span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-black ${BUCKET_STYLE[bucket].chip}`}>{bucket}</span>
                        <span className="line-clamp-2 text-[11.5px] leading-snug text-slate-700">{record.claim}</span>
                      </li>
                    )
                  })}
              </ul>
            </>
          )}
        </InfoDialog>
      )}

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}
    </main>
  )
}
