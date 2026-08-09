import type { ShareSummary, ShareSummaryRequest } from './types'

const safeText = (value: string, limit: number, overflow: string) => {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  return text.length <= limit ? text : overflow
}

const priority = (claim: ShareSummaryRequest['claims'][number]) => {
  let score = claim.index * -1
  if (claim.risk_level.includes('高')) score += 400
  else if (claim.risk_level.includes('中')) score += 100
  if (/不建议|不可信|误导/.test(claim.verdict)) score += 300
  else if (/条件|不足/.test(claim.verdict)) score += 200
  return score
}

export function buildFallbackShareSummary(payload: ShareSummaryRequest): ShareSummary {
  const selected = [...payload.claims].sort((left, right) => priority(right) - priority(left)).slice(0, 2)
  const allowedEvidence = new Set(selected.flatMap((claim) => claim.evidence_ids))
  const seenDocuments = new Set<string>()
  const references = payload.evidence_catalog.flatMap((evidence) => {
    if (!allowedEvidence.has(evidence.evidence_id)) return []
    const key = `${evidence.organization}\u0000${evidence.document_title}\u0000${evidence.year}`
    if (seenDocuments.has(key)) return []
    seenDocuments.add(key)
    return [{
      organization: safeText(evidence.organization, 30, '来源机构请查看完整报告'),
      document_title: safeText(evidence.document_title, 44, '资料名称请查看完整报告'),
      year: evidence.year,
    }]
  }).slice(0, 2)

  const firstAction = payload.actions[0]
  const actionSource = firstAction
    ? [
        `适用情境：${firstAction.condition}；${firstAction.steps.map((step) => (
          step.note ? `${step.title}（${step.note}）` : step.title
        )).join('，')}`,
        firstAction.caution ? `注意：${firstAction.caution}` : '',
      ].filter(Boolean).join('；')
    : ''

  return {
    headline: safeText(`${payload.topic || '健康说法核验'}，重点结论`, 24, '健康说法核验，重点结论'),
    claim_count: payload.claims.length,
    video: {
      author: safeText(payload.video.author, 24, '作者请查看完整报告'),
      title: safeText(payload.video.title, 48, '视频标题请查看完整报告'),
      cover_image: payload.video.cover_image,
    },
    featured_claims: selected.map((claim) => ({
      source_index: claim.index,
      time: claim.time,
      original_claim: claim.source_quote,
      verdict: claim.verdict,
      risk_level: claim.risk_level,
      evidence_strength: claim.evidence_strength,
      correction: safeText(claim.correction, 100, '纠正结论含较多限定条件，请查看完整报告原文。'),
    })),
    action_tip: safeText(actionSource, 100, '行动建议内容较长，请查看完整报告原文。'),
    action_condition: firstAction ? safeText(firstAction.condition, 50, '适用情境请查看完整报告') : '',
    action_caution: firstAction ? safeText(firstAction.caution || '', 80, '注意事项请查看完整报告') : '',
    actions: firstAction ? firstAction.steps.slice(0, 3).map((step) => ({
      icon: step.icon || 'general',
      title: safeText(step.title, 24, '具体步骤请查看完整报告'),
      desc: safeText(step.note || '', 42, '步骤说明请查看完整报告'),
    })) : [],
    references,
    used_fallback: true,
  }
}
