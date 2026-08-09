export interface ShareFeaturedClaim {
  source_index: number
  time: string
  original_claim: string
  verdict: string
  risk_level: string
  evidence_strength: string
  correction: string
}

export interface ShareSummary {
  headline: string
  video_intro?: string
  claim_count: number
  video: { author: string; title: string; cover_image?: string }
  featured_claims: ShareFeaturedClaim[]
  action_tip: string
  action_condition: string
  action_caution: string
  actions: Array<{ icon: string; title: string; desc: string }>
  references: Array<{ organization: string; document_title: string; year: string }>
  used_fallback?: boolean
}

export interface SourceClaim {
  claim: string
  source_quote?: string
  source_kind?: 'transcript' | string
  source_ids?: string[]
  source_time?: string
}

export interface ShareVerifyState {
  status: 'pending' | 'loading' | 'done' | 'error'
  result?: {
    verdict: string
    risk_level: string
    confidence?: string
    strength?: string
    correction: string
    cited_evidence_ids?: string[]
    evidence?: Array<{ id: string; org?: string; source_doc: string; year?: string }>
  }
}

export interface ShareActionAdvice {
  level: 'normal' | 'caution' | 'urgent' | string
  condition: string
  steps: Array<{ title: string; note?: string; icon?: string }>
  caution?: string
  claim_indices: number[]
  evidence_ids: string[]
}

export interface ShareSourceData {
  reference: { author: string; title: string; url: string }
  claims: SourceClaim[]
  keyframes: Array<{ image?: string }>
  topic: string
}

export interface ShareSummaryRequest {
  topic: string
  video: { author: string; title: string; url: string; cover_image?: string }
  claims: Array<{
    index: number
    time: string
    original_claim: string
    source_quote: string
    source_kind: 'transcript'
    source_ids: string[]
    verdict: string
    risk_level: string
    evidence_strength: string
    correction: string
    evidence_ids: string[]
  }>
  actions: ShareActionAdvice[]
  evidence_catalog: Array<{
    evidence_id: string
    organization: string
    document_title: string
    year: string
  }>
}

export interface PosterData {
  video: { title: string; cover: string; duration: string; author: string; intro: string }
  coreConclusion: { text: string }
  claims: Array<{ time: string; quote: string; conclusion: string; status: string; riskLevel?: string }>
  actions: Array<{ icon: string; title: string; desc: string }>
  actionNote: string
  references: string[]
}

export type ShareFileResult = 'shared' | 'unsupported' | 'cancelled'
export type SharePreviewStatus = 'idle' | 'generating' | 'ready' | 'error'
