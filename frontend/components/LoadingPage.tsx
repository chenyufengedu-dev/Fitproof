'use client'

import { useEffect, useState } from 'react'

interface LoadingPageProps {
  topic: string
}

const STEPS = [
  '读取视频文字稿与时间点',
  '抽取争议说法与核心论据',
  '对照运动医学证据来源',
  '计算置信度与风险边界',
  '生成 FitProof 核验报告',
]

export default function LoadingPage({ topic }: LoadingPageProps) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (active >= STEPS.length - 1) return
    const t = setTimeout(() => setActive((a) => a + 1), 900)
    return () => clearTimeout(t)
  }, [active])

  const pct = Math.round(((active + 1) / STEPS.length) * 100)

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f3fbf9] px-5">
      <section className="w-full max-w-md rounded-[28px] border border-[#20CDB6]/15 bg-white p-7 shadow-[0_20px_60px_rgba(18,116,103,0.10)]">
        {/* 品牌行 */}
        <div className="mb-7 flex items-center justify-between">
          <span className="text-sm font-bold tracking-wide text-[#0B6E63]">FitProof</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#20CDB6]/10 px-2.5 py-1 text-[11px] font-medium text-[#128f80]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#20CDB6]" />
            证据核验中
          </span>
        </div>

        {/* 圆环进度 */}
        <div className="relative mx-auto mb-6 h-40 w-40">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: `conic-gradient(#20CDB6 ${pct * 3.6}deg, #E6F6F3 0deg)` }}
          />
          <div className="absolute inset-[13px] rounded-full bg-white" />
          <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-[#20CDB6]/70" />
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[34px] font-bold leading-none text-[#0B6E63]">{pct}%</p>
              <p className="mt-1 text-[11px] tracking-widest text-slate-400">已核验</p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">正在核验</p>
        <h2 className="mb-7 text-center text-lg font-semibold text-slate-900">{topic}</h2>

        {/* 分步清单 */}
        <ul className="space-y-3.5">
          {STEPS.map((step, i) => {
            const done = i < active
            const current = i === active
            return (
              <li key={step} className="flex items-center gap-3">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] transition ${
                    done
                      ? 'bg-[#20CDB6] text-white'
                      : current
                        ? 'border-2 border-[#20CDB6]'
                        : 'bg-slate-100 text-slate-300'
                  }`}
                >
                  {done ? '✓' : current ? <span className="h-2 w-2 animate-ping rounded-full bg-[#20CDB6]" /> : i + 1}
                </span>
                <span
                  className={`text-sm transition ${
                    current ? 'font-medium text-slate-900' : done ? 'text-slate-500' : 'text-slate-300'
                  }`}
                >
                  {step}
                </span>
                {current && <span className="ml-auto animate-pulse text-[11px] text-[#20CDB6]">处理中</span>}
              </li>
            )
          })}
        </ul>

        <p className="mt-7 text-center text-[11px] leading-relaxed text-slate-400">
          AI 正在对照运动医学证据逐条核验，请稍候
        </p>
      </section>
    </main>
  )
}
