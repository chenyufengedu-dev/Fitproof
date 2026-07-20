import type { EvidenceEntry, VerifyResult } from '@/types'

/**
 * 「我的」里的历史记录是存在 localStorage 里的旧快照，字段随版本演进会缺失。
 * 这里不能假设 evidence / cited_evidence_ids 一定存在 —— 少一个字段就抛异常的话，
 * 用户点一下「看依据」整个页面直接白屏，是最难看的失败方式。缺依据按「查不到」处理。
 */
export function citedEvidence(result: VerifyResult | null): EvidenceEntry[] {
  if (!result || !Array.isArray(result.evidence) || !result.cited_evidence_ids?.length) return []
  const cited = new Set(result.cited_evidence_ids)
  return result.evidence.filter((item) => cited.has(item.id))
}

export function isEvidenceDowngraded(result: VerifyResult | null) {
  if (!result) return false
  return !result.cited_evidence_ids?.length || result.evidence_status === 'not_found'
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
