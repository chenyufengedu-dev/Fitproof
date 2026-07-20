// 视频出处：某条观点出自哪条视频的几分几秒（点击弹提示框，不进参考文献）
export interface VideoRef {
  id: number
  time: string
}

export interface Consensus {
  point: string
  video_refs?: VideoRef[]
  authority_ids?: string[]
  screen_evidence?: string
}

export interface ConflictPosition {
  argument: string
  video_refs?: VideoRef[]
  screen_evidence?: string
}

export interface Conflict {
  topic: string
  pro: ConflictPosition
  con: ConflictPosition
  evidence_note?: string
  authority_ids?: string[]
}

export interface Recommendation {
  condition: string
  advice: string
  steps?: Array<string | { text: string; icon?: string }>
  /** 推荐的具体做法（快走/慢跑/血糖监测）。没有可选做法的话题为空数组。 */
  methods?: Array<string | { text: string; icon?: string }>
  /** 适用分档，决定卡片配色。后端已做白名单校验，异常值回落「谨慎理解」。 */
  tier?: '适用参考' | '谨慎理解' | string
  cautions?: string[]
  video_refs?: VideoRef[]
  authority_ids?: string[]
  screen_evidence?: string
}

export interface Misleading {
  claim: string
  video_refs?: VideoRef[]
  correction: string
  authority_ids?: string[]
}

export interface Authority {
  id: string
  name: string
  note: string
}

export interface Reference {
  id: number
  author: string
  title: string
  claim: string
  url: string
}

export interface Claim {
  claim: string
  video_refs: VideoRef[]
  signal: '疑似夸大' | '有条件' | '较公认' | '有争议' | string
  /** 语义配图标签，对应 public/claim-icons/{icon}.webp。老数据可能没有，前端回落 general。 */
  icon?: string
  why: string
}

export interface EvidenceEntry {
  id: string
  claim: string
  section?: string
  strength?: string
  topics?: string[]
  source_doc: string
  org?: string
  year?: string
  url: string
  page?: string
  score?: number
  evidence_tier?: '结论' | '全文' | '无' | string
}

export interface VerifyResult {
  verdict: string
  risk_level: string
  confidence: string
  strength: string
  correction: string
  cited_evidence_ids: string[]
  evidence: EvidenceEntry[]
  evidence_status: 'matched' | 'not_found' | string
  evidence_tier?: '结论' | '全文' | '无' | string
  claim?: string
  topic?: string
  video_refs?: VideoRef[]
}

export interface SingleActionStep {
  title: string
  note?: string
  icon?: string
}

export interface SingleActionAdvice {
  level: 'normal' | 'caution' | 'urgent' | string
  condition: string
  steps: SingleActionStep[]
  caution?: string
  claim_indices: number[]
  evidence_ids: string[]
}

export interface Keyframe {
  time: number
  screen_text: string
  image?: string
}

export interface SingleAnalyzeResponse {
  reference: Omit<Reference, 'claim'> & { claim?: string }
  claims: Claim[]
  keyframes: Keyframe[]
  topic: string
}

export interface SingleSampleData extends SingleAnalyzeResponse {
  sample_verify_results: VerifyResult[]
  sample_verified_claim_index?: number
  sample_verify_result?: VerifyResult
}

export interface Analysis {
  one_line_summary: string
  consensus: Consensus[]
  conflicts: Conflict[]
  recommendations: Recommendation[]
  references: Reference[]
  misleading?: Misleading[]
  authorities?: Authority[]
}

export interface PresetData {
  topic: string
  links: string[]
  analysis: Analysis
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type PageState = 'input' | 'loading' | 'result' | 'refs' | 'singleClaims' | 'singleVerify'
