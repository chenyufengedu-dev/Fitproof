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
