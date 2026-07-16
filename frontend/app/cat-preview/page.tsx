import FitProofCat, { type FitProofCatPose } from '@/components/FitProofCat'

const POSES: Array<{ pose: FitProofCatPose; title: string; caption: string }> = [
  { pose: 'checking', title: '核验中', caption: '放大镜与资料板' },
  { pose: 'thinking', title: '认真思考', caption: '诚实降级 / 需要更多证据' },
  { pose: 'result', title: '核验完成', caption: '结论牌与点赞' },
  { pose: 'empty', title: '暂时为空', caption: '抱着空文件夹摊手' },
  { pose: 'error', title: '出了点状况', caption: '被线缆绊住的无奈' },
]

export default function CatPreviewPage() {
  return (
    <main className="min-h-[100dvh] bg-[#E1F5EE] px-4 py-8 text-[#1a1a1a]">
      <section className="mx-auto max-w-sm">
        <p className="mb-1 text-xs font-bold tracking-[0.16em] text-[#0B6E63]">FITPROOF MASCOT</p>
        <h1 className="text-3xl font-black tracking-tight">小猫姿态预览</h1>
        <p className="mt-2 text-sm leading-6 text-[#0B6E63]">375px 手机优先尺寸。每张卡片使用同一套头、身体、尾巴与五官骨架。</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {POSES.map(({ pose, title, caption }) => (
            <article key={pose} className="rounded-3xl border-2 border-[#1a1a1a] bg-white p-3 shadow-[4px_4px_0_#20CDB6]">
              <FitProofCat pose={pose} size={142} className="mx-auto block" />
              <h2 className="mt-1 text-sm font-black">{title}</h2>
              <p className="mt-1 text-[11px] leading-4 text-[#0B6E63]">{caption}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
