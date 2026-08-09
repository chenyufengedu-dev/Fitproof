import type { SingleActionAdvice, SingleAnalyzeResponse, VerifyResult, VideoRef } from '@/types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

async function postJson<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
  const controller = timeoutMs ? new AbortController() : undefined
  const timer = timeoutMs && controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller?.signal,
    })
  } catch {
    if (controller?.signal.aborted) throw new Error('生成超时，请重试')
    throw new Error('无法连接分析服务，请确认后端已启动，或稍后重试')
  } finally {
    if (timer) clearTimeout(timer)
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

export async function analyzeSingleUpload(file: File, topic: string): Promise<SingleAnalyzeResponse> {
  const form = new FormData()
  form.append('topic', topic)
  form.append('file', file)
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/analyze_single_upload`, { method: 'POST', body: form })
  } catch {
    throw new Error('无法连接分析服务，本地视频分析需要连接后端')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || '本地视频分析失败，请稍后重试')
  }
  return res.json() as Promise<SingleAnalyzeResponse>
}

export function verifyClaim(
  claim: string,
  topic: string,
  video_refs: VideoRef[] = [],
  top_k = 5,
): Promise<VerifyResult> {
  return postJson<VerifyResult>('/api/verify_claim', { claim, topic, video_refs, top_k })
}

export async function verifyClaimStream(
  claim: string,
  topic: string,
  video_refs: VideoRef[] = [],
  top_k = 5,
  onStep?: (step: { step?: string; label: string; detail?: string; tone?: 'ok' | 'warn'; status?: 'done' | 'working'; sources?: string[] }) => void,
  onResult?: (result: VerifyResult) => void,
  signal?: AbortSignal,
): Promise<VerifyResult> {
  const response = await fetch(`${API_BASE_URL}/api/verify_claim/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ claim, topic, video_refs, top_k }),
  })
  if (!response.ok || !response.body) throw new Error('流式核验不可用')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: VerifyResult | null = null
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''
    for (const frame of frames) {
      const line = frame.split('\n').find((item) => item.startsWith('data: '))
      if (!line) continue
      const event = JSON.parse(line.slice(6))
      if (event.type === 'step') onStep?.({ step: event.step?.endsWith('_start') ? event.step.slice(0, -6) : event.step, label: event.label, detail: event.ms ? `${event.ms} ms` : undefined, tone: event.tone, status: event.step?.endsWith('_start') ? 'working' : 'done', sources: Array.isArray(event.sources) && event.sources.length ? event.sources : undefined })
      if (event.type === 'result') { result = event.result as VerifyResult; onResult?.(result) }
      if (event.type === 'claim_origin' && result) {
        onStep?.({ step: 'claim_origin', label: '分析说法流传成因', status: 'done' })
        return { ...result, claim_origin: event.origin || null }
      }
      if (event.type === 'error') throw new Error(event.message || '流式核验失败')
    }
    if (done) break
  }
  if (result) return result
  throw new Error('流式核验未返回结果')
}

export function buildSingleActions(payload: {
  reference: { author: string; title: string; url: string }
  topic: string
  claims: Array<{
    claim_index: number
    claim: string
    verdict: string
    risk_level: string
    correction: string
    cited_evidence_ids: string[]
    video_refs: VideoRef[]
  }>
}): Promise<{ actions: SingleActionAdvice[] }> {
  // 行动建议是一次 LLM 生成，给 90s 上限：后端卡住时能明确失败并让用户重试，而非无限转圈
  return postJson<{ actions: SingleActionAdvice[] }>('/api/build_single_actions', payload, 90_000)
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

export async function followupSingleStream(
  payload: {
    reference: { author: string; title: string; url: string }
    topic: string
    claims: { claim: string; signal: string; verdict: string; correction: string }[]
    question: string
    history: { role: string; content: string }[]
  },
  onDelta: (delta: string, answer: string) => void,
): Promise<{ answer: string }> {
  const response = await fetch(`${API_BASE_URL}/api/followup_single_stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok || !response.body) throw new Error('流式答疑不可用')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  const consumeFrame = (frame: string) => {
    const line = frame.split('\n').find((item) => item.startsWith('data: '))
    if (!line) return
    const event = JSON.parse(line.slice(6))
    if (event.type === 'delta' && typeof event.content === 'string') {
      answer += event.content
      onDelta(event.content, answer)
    }
    if (event.type === 'error') throw new Error(event.message || '流式答疑失败')
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''
    for (const frame of frames) consumeFrame(frame)
    if (done) break
  }
  if (buffer.trim()) consumeFrame(buffer)
  if (!answer.trim()) throw new Error('流式答疑未返回内容')
  return { answer: answer.trim() }
}
