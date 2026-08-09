import type { PosterData, ShareSummary } from './types'

export function buildPosterData(summary: ShareSummary): PosterData {
  const claims = summary.featured_claims.slice(0, 3)
  const actions = (summary.actions || []).slice(0, 3).map((action) => ({
    icon: action.icon || 'general',
    title: action.title,
    desc: action.desc,
  }))

  return {
    video: {
      title: summary.video.title,
      cover: summary.video.cover_image || '',
      duration: '—',
      author: summary.video.author || '未提供',
      intro: summary.video_intro || `${summary.video.title}的健康说法核验摘要`,
    },
    coreConclusion: { text: claims[0]?.correction || summary.headline },
    claims: claims.map((claim) => ({
      time: claim.time || '—',
      quote: claim.original_claim,
      conclusion: claim.correction,
      status: claim.verdict,
      riskLevel: claim.risk_level,
    })),
    actions,
    actionNote: [summary.action_condition, summary.action_caution].filter(Boolean).join('；'),
    references: summary.references.slice(0, 3).map((reference) => (
      [reference.organization, reference.document_title, reference.year].filter(Boolean).join(' ')
    )),
  }
}
