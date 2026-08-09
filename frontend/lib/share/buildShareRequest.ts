import type { ShareActionAdvice, ShareSourceData, ShareSummaryRequest, ShareVerifyState } from './types'

export function isShareReady(states: ShareVerifyState[], actionsLoading: boolean, actionsSucceeded: boolean) {
  return states.length > 0
    && states.every((state) => state.status === 'done' && Boolean(state.result))
    && actionsSucceeded
    && !actionsLoading
}

export function buildShareRequest(
  data: ShareSourceData,
  states: ShareVerifyState[],
  actions: ShareActionAdvice[],
): ShareSummaryRequest {
  const evidenceById = new Map<string, ShareSummaryRequest['evidence_catalog'][number]>()
  const claims = data.claims.flatMap((claim, index) => {
    const state = states[index]
    const result = state?.status === 'done' ? state.result : undefined
    if (!result) return []

    const sourceQuote = claim.source_kind === 'transcript' ? (claim.source_quote || '').trim() : ''
    const sourceIds = (claim.source_ids || []).filter(Boolean)
    const sourceTime = (claim.source_time || '').trim()
    if (!sourceQuote || sourceIds.length === 0 || !sourceTime) return []

    for (const evidence of result.evidence || []) {
      if (!evidence.id || evidenceById.has(evidence.id)) continue
      evidenceById.set(evidence.id, {
        evidence_id: evidence.id,
        organization: evidence.org || '',
        document_title: evidence.source_doc || '',
        year: evidence.year || '',
      })
    }

    return [{
      index,
      time: sourceTime,
      original_claim: sourceQuote,
      source_quote: sourceQuote,
      source_kind: 'transcript' as const,
      source_ids: sourceIds,
      verdict: result.verdict,
      risk_level: result.risk_level,
      evidence_strength: result.strength || result.confidence || '',
      correction: result.correction,
      evidence_ids: result.cited_evidence_ids || [],
    }]
  })

  return {
    topic: data.topic || '',
    video: {
      author: data.reference.author,
      title: data.reference.title,
      url: data.reference.url,
      cover_image: data.keyframes.find((frame) => Boolean(frame.image))?.image || '',
    },
    claims,
    actions,
    evidence_catalog: [...evidenceById.values()],
  }
}

export function shareCacheKey(payload: ShareSummaryRequest) {
  return JSON.stringify(payload)
}
