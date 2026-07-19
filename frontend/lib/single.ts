import type { EvidenceEntry, VerifyResult } from '@/types'

export function citedEvidence(result: VerifyResult | null): EvidenceEntry[] {
  if (!result || result.cited_evidence_ids.length === 0) return []
  const cited = new Set(result.cited_evidence_ids)
  return result.evidence.filter((item) => cited.has(item.id))
}

export function isEvidenceDowngraded(result: VerifyResult | null) {
  if (!result) return false
  return result.cited_evidence_ids.length === 0 || result.evidence_status === 'not_found'
}

export function evidenceTraceLabel(result: VerifyResult | null) {
  if (!result) return ''
  const support = citedEvidence(result)
  if (support.length === 0 || result.evidence_tier === '无' || result.evidence_status === 'not_found') {
    return '可信度低 · 未收录依据，AI常识判断'
  }

  const first = support[0]
  const doc = first.source_doc || '权威资料'
  if (result.evidence_tier === '全文' || first.evidence_tier === '全文' || first.id.startsWith('F-')) {
    return `可信度中 · 来自《${doc}》原文段落`
  }

  const strength = first.strength || '指南推荐'
  return `可信度高 · 依据《${doc}》${strength}`
}
