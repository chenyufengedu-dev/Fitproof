import type { ShareSummaryRequest } from './types'
import { createAnonymousClientId } from '../clientId.mjs'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''
const CONTRIBUTION_CLIENT_ID_KEY = 'fitproof.contrib.client_id'

function contributionClientId() {
  const existing = window.localStorage.getItem(CONTRIBUTION_CLIENT_ID_KEY)
  if (existing) return existing
  const clientId = createAnonymousClientId()
  window.localStorage.setItem(CONTRIBUTION_CLIENT_ID_KEY, clientId)
  return clientId
}

/** 只提交核验文本与证据 ID；不发送头像、昵称、浏览历史等个人信息。 */
export async function submitShareContributions(payload: ShareSummaryRequest) {
  const clientId = contributionClientId()
  let submitted = 0
  for (const claim of payload.claims) {
    const response = await fetch(`${API_BASE_URL}/api/contrib`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: payload.topic,
        claim: claim.original_claim,
        verdict: claim.verdict,
        risk_level: claim.risk_level,
        correction: claim.correction,
        evidence_ids: claim.evidence_ids,
        source_url: payload.video.url,
        client_id: clientId,
      }),
    })
    if (!response.ok) throw new Error(`贡献提交失败（${response.status}）`)
    submitted += 1
  }
  return submitted
}
