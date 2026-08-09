'use client'

import { useState } from 'react'

/**
 * 证据强度指数（方案 B：分档点阵，不用百分比）。
 *
 * 为什么不用「85%」这类百分比圆环：百分号 + 小数会被读成「经验准确率」，
 * 但我们没有做过样本验证，那种精度是不存在的。分档点阵表达的是「证据有多强」
 * 的相对刻度（同 GRADE 证据分级思路），不谎称精度，且规则完全公开、可点开看构成。
 *
 * 指数是已有结果字段的纯函数（不调后端、不碰流式）：
 *   输入 = evidence_tier（命中哪一级）+ strength（模型给的依据强度，已受 tier 约束）
 *   规则（确定、可复现）：
 *     结论级 · 强  → 5 档   结论级 · 中 → 4 档   结论级 · 弱 → 3 档
 *     原文级 · 中  → 3 档   原文级 · 弱 → 2 档
 *     AI 常识（未命中，strength 已被强制为「低」） → 1 档
 *   档位 → 定性标签：4–5=高 / 2–3=中 / 1=参考
 *
 * ⚠️ 检索路径当前实际只跑通 结论 → 原文 → AI常识 三级；「用户沉淀库」尚未接入检索，
 * 故阶梯里把它标为「即将上线」，不点亮 —— 不冒充一个没在用的层级。
 */

type Tier = '结论' | '全文' | '无' | string

function levelFromTier(tier: Tier): 'conclusion' | 'fulltext' | 'commonsense' {
  if (tier === '结论') return 'conclusion'
  if (tier === '全文') return 'fulltext'
  return 'commonsense'
}

function scoreOf(tier: Tier, strength: string): number {
  const strong = strength.includes('高')
  const mid = strength.includes('中')
  const level = levelFromTier(tier)
  if (level === 'conclusion') return strong ? 5 : mid ? 4 : 3
  if (level === 'fulltext') return mid ? 3 : 2
  return 1
}

function qualitativeLabel(score: number): string {
  if (score >= 4) return '高'
  if (score >= 2) return '中'
  return '参考'
}

const LADDER: { key: 'conclusion' | 'fulltext' | 'sediment' | 'commonsense'; name: string; note?: string }[] = [
  { key: 'conclusion', name: '结论库', note: '权威指南已抽取的结论' },
  { key: 'fulltext', name: '原文库', note: '指南全文段落' },
  { key: 'sediment', name: '用户沉淀库', note: '即将上线' },
  { key: 'commonsense', name: 'AI 常识', note: '无权威依据兜底' },
]

interface EvidenceStrengthProps {
  tier: Tier
  strength: string
  org?: string
  sourceDoc?: string
  embedded?: boolean
  variant?: 'default' | 'clinical'
}

export default function EvidenceStrength({ tier, strength, org, sourceDoc, embedded = false, variant = 'default' }: EvidenceStrengthProps) {
  const [open, setOpen] = useState(false)
  const score = scoreOf(tier, strength)
  const label = qualitativeLabel(score)
  const level = levelFromTier(tier)
  const clinical = variant === 'clinical'
  const dimmed = level === 'commonsense'
  const accent = clinical ? '#586779' : dimmed ? '#94A3B8' : score >= 4 ? '#0B9F91' : '#C58B2A'
  const currentName = level === 'conclusion' ? '结论库' : level === 'fulltext' ? '原文库' : 'AI 常识'

  const content = <>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <span className="t-micro shrink-0 uppercase tracking-[0.09em] text-slate-400">证据强度</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: n <= score ? accent : clinical ? '#E1E5E8' : '#E7ECEA' }}
            />
          ))}
        </span>
        <span className="t-label shrink-0" style={{ color: accent }}>{label}</span>
        <span className="ml-auto t-meta shrink-0 text-slate-400">{currentName}</span>
        <svg className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {open ? (
        <div className="animate-fadeIn mt-3 border-t border-[#DDE2E6] pt-3">
          <p className="t-micro mb-2 uppercase tracking-[0.09em] text-slate-400">检索层级（自上而下，命中即止）</p>
          <ul className="divide-y divide-[#E5EBEA]">
            {LADDER.map((row) => {
              const hit = (row.key === 'conclusion' && level === 'conclusion')
                || (row.key === 'fulltext' && level === 'fulltext')
                || (row.key === 'commonsense' && level === 'commonsense')
              return (
                <li key={row.key} className="flex min-h-10 items-center gap-2.5 py-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hit ? (clinical ? '#586779' : '#10B89F') : '#B8C3CC' }} />
                  <span className={`t-meta ${hit ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{row.name}</span>
                  {hit ? <span className={`t-micro rounded-full px-2 py-1 font-semibold ${clinical ? 'bg-[#E9EDF1] text-[#425166]' : 'bg-[#E2F5F1] text-[#078C7E]'}`}>本条命中</span> : null}
                  <span className="t-micro ml-auto text-right text-slate-400">{row.note}</span>
                </li>
              )
            })}
          </ul>
          <p className="t-meta mt-3 leading-relaxed text-slate-500">
            规则：结论级最高 5 档、原文级最高 3 档、AI 常识 1 档，再按模型评定的依据强度（{strength || '未评级'}）微调。
            {sourceDoc ? `本条来源：${org ? `${org} · ` : ''}《${sourceDoc}》。` : '本条未命中权威依据，为 AI 常识判断。'}
          </p>
        </div>
      ) : null}
    </>
  return embedded ? <div>{content}</div> : <section className="rounded-[10px] border border-slate-200 bg-white px-4 py-3">{content}</section>
}
