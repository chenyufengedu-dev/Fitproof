import type { SingleAnalyzeResponse, VerifyResult, VideoRef } from '@/types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('无法连接分析服务，请确认后端已启动，或稍后重试')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || '请求失败，请稍后重试')
  }
  return res.json() as Promise<T>
}

export function analyzeSingle(link: string, topic: string): Promise<SingleAnalyzeResponse> {
  return postJson<SingleAnalyzeResponse>('/api/analyze_single', { link, topic })
}

export function verifyClaim(
  claim: string,
  topic: string,
  video_refs: VideoRef[] = [],
  top_k = 5,
): Promise<VerifyResult> {
  return postJson<VerifyResult>('/api/verify_claim', { claim, topic, video_refs, top_k })
}

export function followupSingle(payload: {
  reference: { author: string; title: string; url: string }
  topic: string
  claims: { claim: string; signal: string; verdict: string; correction: string }[]
  question: string
  history: { role: string; content: string }[]
}): Promise<{ answer: string }> {
  return postJson<{ answer: string }>('/api/followup_single', payload)
}
