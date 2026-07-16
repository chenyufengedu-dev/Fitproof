'use client'

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
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] select-none items-center justify-center bg-[#f3fbf9] px-5 py-8">
      <section className="w-full max-w-md rounded-[28px] border border-[#20CDB6]/15 bg-white p-7 shadow-[0_20px_60px_rgba(18,116,103,0.10)]">
        {/* 品牌行 */}
        <div className="mb-7 flex items-center justify-between">
          <span className="text-sm font-bold tracking-wide text-[#0B6E63]">FitProof</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#20CDB6]/10 px-2.5 py-1 text-[11px] font-medium text-[#128f80]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#20CDB6]" />
            证据核验中
          </span>
        </div>

        {/* 不定量加载：真实分析没有可用的百分比进度 */}
        <div className="relative mx-auto mb-6 h-36 w-36">
          <div className="absolute inset-0 animate-spin rounded-full border-[6px] border-[#D8F0EC] border-t-[#20CDB6]" />
          <div className="absolute inset-[15px] rounded-full border border-[#20CDB6]/10 bg-white" />
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <span className="mx-auto block h-2.5 w-2.5 animate-pulse rounded-full bg-[#20CDB6]" />
              <p className="mt-2 text-sm font-semibold text-[#0B6E63]">核验进行中</p>
            </div>
          </div>
        </div>

        <div className="mb-7 flex items-center gap-4 rounded-3xl border border-[#20CDB6]/10 bg-[#f3fbf9] px-5 py-3">
          <img
            src="/brand/cat-checking.png"
            alt=""
            aria-hidden
            className="fitproof-cat-float pointer-events-none w-14 shrink-0 drop-shadow-[0_12px_20px_rgba(15,118,110,0.16)]"
          />
          <div className="min-w-0">
            <p className="text-xs text-slate-400">正在核验</p>
            <h2 className="truncate text-lg font-semibold text-slate-900">{topic}</h2>
          </div>
        </div>

        {/* 分步清单 */}
        <ul className="space-y-3.5">
          {STEPS.map((step, i) => {
            return (
              <li key={step} className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#20CDB6]/25 bg-[#E1F5EE] text-[11px] font-semibold text-[#0B6E63]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm text-slate-700">{step}</span>
                <span className="shrink-0 text-[10px] text-slate-400">进行中 / 排队</span>
              </li>
            )
          })}
        </ul>

        <p className="mt-7 text-center text-xs leading-relaxed text-slate-500">
          真实视频分析需要转写 + 画面识别 + 逐条核验，通常 30 秒到 2 分钟，请稍候
        </p>
      </section>
    </main>
  )
}
