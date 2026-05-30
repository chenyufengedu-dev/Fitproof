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

export type PageState = 'input' | 'loading' | 'result' | 'refs'
