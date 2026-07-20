import type { Claim, Keyframe, SingleAnalyzeResponse, VerifyResult } from '@/types'

const COMMUNITY_SHARE_KEY = 'fitproof.community-shares.v1'
const COMMUNITY_SHARE_LIMIT = 50

export type CommunityShareStatus = 'pending' | 'published' | 'rejected' | 'featured' | 'removed'

export interface CommunityShareRecord {
  id: string
  title: string
  author: string
  topic: string
  url: string
  status: CommunityShareStatus
  displayName: string
  createdAt: string
  updatedAt: string
  claimsCount: number
  verifiedCount: number
  summary: string
  report: {
    reference: SingleAnalyzeResponse['reference']
    claims: Claim[]
    keyframes: Keyframe[]
    topic: string
    verifyResults: VerifyResult[]
  }
}

function makeShareId(data: SingleAnalyzeResponse) {
  const raw = data.reference.url || `${data.reference.author}-${data.reference.title}`
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0
  }
  return `share-${hash.toString(36)}`
}

function summarize(results: VerifyResult[]) {
  const highRisk = results.find((item) => /高|误导|夸大|不建议/.test(`${item.risk_level}${item.verdict}`))
  const first = highRisk || results[0]
  return first?.correction || first?.verdict || '这是一份已完成的 FitProof 核验报告。'
}

export function loadCommunityShares(): CommunityShareRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(COMMUNITY_SHARE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function findCommunityShare(data: SingleAnalyzeResponse): CommunityShareRecord | null {
  const id = makeShareId(data)
  return loadCommunityShares().find((item) => item.id === id) || null
}

export function submitCommunityShare(data: SingleAnalyzeResponse, topic: string, results: VerifyResult[]): CommunityShareRecord {
  const now = new Date().toISOString()
  const id = makeShareId(data)
  const existing = loadCommunityShares().find((item) => item.id === id)
  const nextRecord: CommunityShareRecord = {
    id,
    title: data.reference.title || '标题未标注',
    author: data.reference.author || '作者未标注',
    topic: topic || data.topic || '未分类话题',
    url: data.reference.url || '',
    status: existing?.status || 'pending',
    displayName: existing?.displayName || 'FitProof 用户',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    claimsCount: data.claims.length,
    verifiedCount: results.length,
    summary: summarize(results),
    report: {
      reference: data.reference,
      claims: data.claims,
      keyframes: data.keyframes,
      topic: topic || data.topic || '',
      verifyResults: results,
    },
  }
  const next = [nextRecord, ...loadCommunityShares().filter((item) => item.id !== id)].slice(0, COMMUNITY_SHARE_LIMIT)
  try {
    window.localStorage.setItem(COMMUNITY_SHARE_KEY, JSON.stringify(next))
  } catch {
    // Sharing is best-effort in the local prototype; storage errors should not break verification.
  }
  return nextRecord
}
