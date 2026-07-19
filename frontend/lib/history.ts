import type { VerifyResult } from '@/types'

const HISTORY_KEY = 'fitproof.verify-history.v1'
const HISTORY_LIMIT = 50

export interface HistoryRecord {
  id: string
  claim: string
  signal: string
  topic: string
  reference: {
    author: string
    title: string
    url: string
  }
  result: VerifyResult
  createdAt: string
}

export function loadHistory(): HistoryRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function appendHistory(record: HistoryRecord): HistoryRecord[] {
  if (typeof window === 'undefined') return []
  const next = [record, ...loadHistory().filter((item) => item.claim !== record.claim)].slice(0, HISTORY_LIMIT)
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // Local storage can be unavailable in private browsing; verification must still finish.
  }
  return next
}

export function clearHistory() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(HISTORY_KEY)
  } catch {
    // Keep this best-effort so a storage error cannot break the Profile tab.
  }
}
