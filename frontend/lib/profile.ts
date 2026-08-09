import type { FitProofCatPose } from '@/components/FitProofCat'
import type { HistoryRecord } from '@/lib/history'

const IDENTITY_KEY = 'fitproof.identity.v1'

export const AVATAR_POSES: FitProofCatPose[] = ['checking', 'thinking', 'result', 'empty', 'error']

export interface Identity {
  nickname: string
  pose: FitProofCatPose
}

const DEFAULT_IDENTITY: Identity = { nickname: '求真的你', pose: 'checking' }

export function loadIdentity(): Identity {
  if (typeof window === 'undefined') return DEFAULT_IDENTITY
  try {
    const raw = JSON.parse(window.localStorage.getItem(IDENTITY_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return DEFAULT_IDENTITY
    const nickname = typeof raw.nickname === 'string' && raw.nickname.trim() ? raw.nickname.trim() : DEFAULT_IDENTITY.nickname
    const pose = AVATAR_POSES.includes(raw.pose) ? raw.pose : DEFAULT_IDENTITY.pose
    return { nickname, pose }
  } catch {
    return DEFAULT_IDENTITY
  }
}

export function saveIdentity(identity: Identity): Identity {
  if (typeof window === 'undefined') return identity
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  } catch {
    // 隐私模式下 localStorage 可能不可用，身份丢失不影响核验功能。
  }
  return identity
}

/**
 * 一条记录是否算「识破不实」。
 *
 * 只看核验结论（result），不看 claim.signal —— signal 是拆主张阶段快模型在
 * 没有查任何证据时的初步归类，核验的意义正是纠正它。用 signal 计数会出现
 * 「核验结论是可信·低风险，却因为初判疑似夸大被算成识破一条」，
 * 数字只会往「帮你避开了很多坑」的方向虚高，正是最不该虚的方向。
 */
export function isDebunked(record: HistoryRecord): boolean {
  const verdict = record.result?.verdict || ''
  const risk = record.result?.risk_level || ''
  return /不建议|不可信|夸大|错误/.test(verdict) || /高/.test(risk)
}

export interface Level {
  name: string
  min: number
  /** 1 起算的等级序号，用于「Lv.N」徽章 —— 不要拿 min 当序号，那是解锁阈值。 */
  index: number
  next?: { name: string; need: number }
  progress: number
}

/** 等级表。导出是为了「等级说明」弹窗能直接渲染它 —— 别在组件里另抄一份，会和这里漂移。 */
export const LEVELS = [
  { name: '求真新手', min: 0, blurb: '开始核验你看到的健康说法' },
  { name: '求真达人', min: 5, blurb: '已经养成查证的习惯' },
  { name: '火眼金睛', min: 20, blurb: '能一眼看出可疑的说法' },
  { name: '证据猎人', min: 50, blurb: '凡事都要找到原始依据' },
]

export function levelOf(count: number): Level {
  let index = 0
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (count >= LEVELS[i].min) index = i
  }
  const current = LEVELS[index]
  const upcoming = LEVELS[index + 1]
  if (!upcoming) return { name: current.name, min: current.min, index: index + 1, progress: 1 }
  const span = upcoming.min - current.min
  return {
    name: current.name,
    min: current.min,
    index: index + 1,
    next: { name: upcoming.name, need: upcoming.min - count },
    progress: span > 0 ? Math.min(1, (count - current.min) / span) : 1,
  }
}

export type VerdictBucket = '不实' | '需留意' | '站得住脚'

/**
 * 把一条记录归到三档之一。列表筛选、话题分段条、统计数字都必须走这里，
 * 否则会出现「筛选说不实 1 条、条目标签写不建议采纳」这种对不上的情况。
 * 归档只是分类，不替代判定 —— verdict 原话仍由核验卡完整呈现。
 */
export function bucketOf(record: HistoryRecord): VerdictBucket {
  if (isDebunked(record)) return '不实'
  if (/中/.test(record.result?.risk_level || '')) return '需留意'
  return '站得住脚'
}

export interface TopicStat {
  topic: string
  total: number
  不实: number
  需留意: number
  站得住脚: number
}

/** 按话题聚合历史。topic 是用户输入的自由文本，空的归到「未分类」。 */
export function topicStats(records: HistoryRecord[]): TopicStat[] {
  const map = new Map<string, TopicStat>()
  for (const record of records) {
    const topic = (record.topic || '').trim() || '未分类'
    const stat = map.get(topic) || { topic, total: 0, 不实: 0, 需留意: 0, 站得住脚: 0 }
    stat.total += 1
    stat[bucketOf(record)] += 1
    map.set(topic, stat)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

/**
 * 连续核验天数。今天还没核验不算断档 —— 从昨天起算，
 * 否则用户一睁眼就看到连续天数被清零，而他其实什么都没做错。
 */
export function streakDays(records: HistoryRecord[]): number {
  const days = new Set<string>()
  for (const record of records) {
    const date = new Date(record.createdAt)
    if (!Number.isNaN(date.getTime())) days.add(toKey(date))
  }
  if (days.size === 0) return 0

  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!days.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (days.has(toKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface HeatCell {
  date: string
  count: number
}

/**
 * 近 N 周的核验足迹，按周分列、每列 7 天（周一到周日），末列为本周。
 * 做 18 周（约 4 个月）：列数够多，格子才能压扁、不至于一格顶到 20px 像色块；
 * 但也不做 GitHub 那种一年 —— 核验是低频行为，一年期会有三百多个空格子，
 * 看起来不是「我很活跃」而是「这产品没人用」。
 */
export function heatmap(records: HistoryRecord[], weeks = 18): HeatCell[][] {
  const counts = new Map<string, number>()
  for (const record of records) {
    const date = new Date(record.createdAt)
    if (Number.isNaN(date.getTime())) continue
    const key = toKey(date)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // 回退到本周周一，保证每列都是完整的周一~周日
  const weekday = (today.getDay() + 6) % 7
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() - weekday)

  const grid: HeatCell[][] = []
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const column: HeatCell[] = []
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(thisMonday)
      day.setDate(thisMonday.getDate() - w * 7 + d)
      const key = toKey(day)
      column.push({ date: key, count: day > today ? -1 : counts.get(key) || 0 })
    }
    grid.push(column)
  }
  return grid
}

function toKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
