'use client'

import { useEffect, useRef } from 'react'
import type { Authority, Reference } from '@/types'

interface RefsPageProps {
  references: Reference[]
  authorities?: Authority[]
  topic: string
  focusId?: number | null
  onBack: () => void
}

export default function RefsPage({
  references,
  authorities = [],
  focusId,
  onBack,
}: RefsPageProps) {
  const itemRefs = useRef<Record<number, HTMLLIElement | null>>({})

  useEffect(() => {
    if (focusId != null && itemRefs.current[focusId]) {
      itemRefs.current[focusId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [focusId])

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-5 sm:py-8">
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900">
        ← 返回观点地图
      </button>

      <h1 className="mt-4 text-2xl font-bold">来源详情</h1>

      {/* 参考文献：权威依据（[n] 引用对应这里） */}
      <h2 className="mt-5 text-lg font-semibold">参考文献（权威依据）</h2>
      <p className="text-sm text-slate-500">纠错与“主流证据”判断所依据的权威来源，正文 [n] 对应此处</p>
      {authorities.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {authorities.map((a, i) => {
            const num = i + 1
            return (
              <li
                key={a.id}
                ref={(el) => {
                  itemRefs.current[num] = el
                }}
                className={`rounded-lg border p-3 text-sm leading-relaxed transition sm:p-4 ${
                  focusId === num ? 'border-slate-900 bg-yellow-50' : 'border-emerald-200 bg-emerald-50/40'
                }`}
              >
                <span className="font-medium">[{num}]</span> {a.name}. {a.note}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-slate-400">本话题暂无需要权威背书的纠错或证据判断。</p>
      )}

      {/* 分析的视频源：不计入参考文献编号，仅供溯源 */}
      <h2 className="mt-8 text-lg font-semibold">分析的视频源</h2>
      <p className="text-sm text-slate-500">共 {references.length} 条视频，正文中标“🎬 出处”可看具体时间点</p>
      <ul className="mt-4 space-y-3">
        {references.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm leading-relaxed sm:p-4">
            <span className="font-medium">视频{r.id}</span> · {r.author}.{' '}
            <span className="italic">{r.title}</span>. {r.claim}.{' '}
            <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
              访问原视频
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}
