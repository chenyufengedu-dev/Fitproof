import { useEffect, useState } from 'react'
import type { SingleAnalyzeResponse } from '@/types'
import CourtCardShell from '@/components/CourtCardShell'
import FitProofCat from '@/components/FitProofCat'
import { ExpandableHighlight, formatFrameTime, parseVideoTime, proxiedImg } from '@/components/single/shared'

export default function ProfileCard({ data, onOpenOverview }: { data: SingleAnalyzeResponse; onOpenOverview: () => void }) {
  // 说明：这里读的是快模型拆主张时的初步归类 claim.signal，不是核验结论。
  // 核验结论在 verifyStates 里，属于卡02及以后 —— 故此处一律用中性分类图标与措辞。
  const durationSeconds = data.reference.duration_seconds
  const durationLabel = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? (() => { const total = Math.round(durationSeconds); const minutes = Math.floor(total / 60); const seconds = total % 60; return `${minutes}:${String(seconds).padStart(2, '0')}` })()
    : null
  const publishedAt = typeof data.reference.published_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.reference.published_at)
    ? data.reference.published_at
    : null
  const posterFrame = data.keyframes.find((frame) => typeof frame.image === 'string' && frame.image.length > 0)
  const hasVideoUrl = Boolean(data.reference.url)
  const author = data.reference.author || '作者未标注'
  const authorAvatarUrl = data.reference.author_avatar_url
  const [authorAvatarFailed, setAuthorAvatarFailed] = useState(false)
  useEffect(() => setAuthorAvatarFailed(false), [authorAvatarUrl])
  const rawTitle = data.reference.title || '标题未标注'
  const topicTags = (rawTitle.match(/#\S+/g) || []).map((tag) => tag.slice(1))
  const cleanTitle = rawTitle.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim() || rawTitle
  // 抖音只有一段文案（正文+话题标签混在一起），没有「标题 + 副文案」两个字段。
  // 这里按首个句末标点把同一段原文切成两行显示，纯排版，不增删原文一个字。
  const breakAt = cleanTitle.search(/[！!。？?]/)
  const headline = breakAt >= 0 ? cleanTitle.slice(0, breakAt + 1) : cleanTitle
  const subCopy = breakAt >= 0 ? cleanTitle.slice(breakAt + 1).trim() : ''
  // 成分统计（核验前就有的 claim.signal，不是核验判定）。用于成分条 + 核心看点。
  const countAccepted = data.claims.filter((c) => c.signal === '较公认').length
  const countExagg = data.claims.filter((c) => c.signal === '疑似夸大').length
  const countConditional = data.claims.length - countAccepted - countExagg
  const totalClaims = data.claims.length
  const mainClaim = (data.claims.find((c) => c.signal === '较公认') || data.claims[0])?.claim || ''
  const needsScrutiny = countExagg + countConditional
  const attentionText = needsScrutiny > 0
    ? `${needsScrutiny} 条说法存疑或需加条件，建议逐条查证`
    : '初步归类均较公认，仍建议逐条查证'
  const verificationMethodText = '逐条比对权威指南库，命中哪一级如实标注，查不到直说'
  const compositionSegments = [
    { key: '较公认', count: countAccepted, color: '#20CDB6' },
    { key: '疑似夸大', count: countExagg, color: '#F5A524' },
    { key: '有条件', count: countConditional, color: '#94A3B8' },
  ].filter((s) => s.count > 0)
  const poster = (
    <div className="relative aspect-[2/1] overflow-hidden rounded-[16px] bg-[#E1F5EE]">
      {posterFrame?.image ? (
        <>
          {/* 抖音是 9:16 竖屏，塞进横框只有两条路：裁掉大半(object-cover 会放大 3 倍多)，
              或完整显示但两侧留白。这里用同一帧的模糊放大版当底衬填掉留白，
              前景 object-contain 完整呈现、不裁不放大。 */}
          <img src={proxiedImg(posterFrame.image)} alt="" aria-hidden="true" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl saturate-150" />
          <div className="absolute inset-0 bg-slate-900/15" />
          <img src={proxiedImg(posterFrame.image)} alt="视频关键帧封面" referrerPolicy="no-referrer" className="relative h-full w-full object-contain" />
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <span className="text-[11px] font-medium leading-relaxed text-[#0B6E63]">
            {hasVideoUrl ? '封面暂不可用，点击在抖音看原视频' : '视频封面暂不可用'}
          </span>
        </div>
      )}
      {hasVideoUrl && (
        <span className="absolute right-2 top-2 rounded-full bg-slate-900/75 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          点击查看视频
        </span>
      )}
      {posterFrame?.image && hasVideoUrl && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white pl-0.5 text-lg text-[#0B6E63] shadow-lg">▶</span>
        </span>
      )}
    </div>
  )

  return (
    <div>
      {/* 卡头（青点+「视频档案」+ 副标题 + 01 水印）与底部免责声明由 CourtCardShell 统一渲染 */}
      {/* 封面与下方信息同属一个容器：扁平化，无边框无发光，封面上圆下方直接压在信息块顶上 */}
      <div className="bg-white">
        {hasVideoUrl ? (
          <a href={data.reference.url} target="_blank" rel="noreferrer" className="block" aria-label="在抖音打开原视频">
            {poster}
          </a>
        ) : poster}

        <div>
        <div className="pb-3.5 pt-3">
          <h1 className="t-display line-clamp-2 text-slate-950">{headline}</h1>
          {subCopy && <p className="t-meta mt-1 truncate text-slate-600">{subCopy}</p>}
          {topicTags.length > 0 && (
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto whitespace-nowrap">
              {topicTags.map((tag, index) => (
                <span key={`${tag}-${index}`} className="shrink-0 rounded-md border border-[#E4E8EE] bg-[#F8FAFC] px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  <span className="text-slate-600">#</span> {tag}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2.5 border-b border-[#DCEFEB] pb-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#E1F5EE] shadow-[0_1px_4px_rgba(15,23,42,0.12)]">
              {authorAvatarUrl && !authorAvatarFailed ? (
                <img src={proxiedImg(authorAvatarUrl)} alt={`${author} 的头像`} className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setAuthorAvatarFailed(true)} />
              ) : (
                <FitProofCat pose="thinking" size={55} className="-mt-1" title="FitProof 小猫" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-[12px] font-semibold leading-tight text-slate-700">{author}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-slate-600">视频作者</p>
            </div>
            {(durationLabel || publishedAt) && <div className="flex shrink-0 translate-y-[9px] items-center gap-3 whitespace-nowrap text-[11px] leading-tight text-slate-600">{durationLabel && <span className="inline-flex items-center gap-1"><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="5.25" /><path d="M8 4.9v3.35l2.25 1.35" strokeLinecap="round" strokeLinejoin="round" /></svg>时长 {durationLabel}</span>}{publishedAt && <span className="inline-flex items-center gap-1"><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.75" y="3.5" width="10.5" height="9.25" rx="1.25" /><path d="M5.25 2.5v2M10.75 2.5v2M2.75 6.25h10.5" strokeLinecap="round" /></svg>发布 {publishedAt}</span>}</div>}
          </div>
          {/* 成分条：把 signal 分布做成一根横向堆叠条，一眼看懂「几分靠谱几分存疑」。
              这是核验前已有数据的可视化，不与卡02的可点击明细列表重复。
              三色是同一个功能元素（成分构成），算作本屏唯一的饱和色块。 */}
          {totalClaims > 0 && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <p className="t-label text-slate-800">共 {totalClaims} 条可核验说法</p>
                <p className="t-meta text-slate-600">拆条初步归类</p>
              </div>
              <div className="mt-2 flex h-2 w-full gap-1">
                {compositionSegments.map((seg) => (
                  <span key={seg.key} className="rounded-full" style={{ width: `${(seg.count / totalClaims) * 100}%`, backgroundColor: seg.color }} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {compositionSegments.map((seg) => (
                  <span key={seg.key} className="t-meta inline-flex items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
                    {seg.key} {seg.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 核心看点：固定三行骨架（主要主张 / 需要留意 / 核验方式），每行都保证有内容，
              不随成分变化而增减。数据来自拆条阶段的 claim.signal 与原文，或真实核验机制，
              核验前即可得出，不编造，也不与卡02重复。 */}
          {/* 连接线放在实心圆底之后：视觉上连续，但不会透过任何图标。 */}
          <div className="relative mt-4 space-y-3.5 rounded-2xl bg-[linear-gradient(135deg,#FFFFFF_0%,#FBFEFD_100%)] px-3 py-3 shadow-[0_4px_12px_rgba(15,90,82,0.07)] before:absolute before:left-7 before:top-11 before:bottom-11 before:w-px before:bg-[#BFEDEA]">
            <div className="relative flex items-start gap-3">
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DDF4F1]" aria-hidden="true">
                <svg className="h-[18px] w-[18px] scale-y-[.88]" viewBox="0 0 64 64" fill="none">
                  <defs>
                    <linearGradient id="claim-quote-bubble" x1="10" y1="7" x2="56" y2="57" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#1FCBC6" />
                      <stop offset="1" stopColor="#18B8B5" />
                    </linearGradient>
                  </defs>
                  {/* 近圆形气泡 + 左下三角尾巴，轮廓直接取自参考图的比例。 */}
                  <path transform="translate(-2.56 0) scale(1.08 1)" d="M32 3C15.7 3 3 15.4 3 31c0 7.5 2.9 14.2 7.7 19.2L4.2 60.4c-.8 1.3.6 2.9 2 2.4l14.3-5.1c3.6 1.6 7.5 2.4 11.5 2.4 16.3 0 29-12.5 29-28.1S48.3 3 32 3Z" fill="url(#claim-quote-bubble)" />
                  {/* 缩小并左移后的扁平开引号。 */}
                  <g transform="translate(-1 4.8) scale(.9 .85)">
                    <path d="M29.6 22.1C31.1 21 33 22.4 32 24.1c-2.4 3-3.8 6-3.8 8.5 0 1.5.8 2.3 2.6 2.9 2.9 1 4.5 3 4.5 5.3 0 3.1-2.4 5.2-5.8 5.2-3.8 0-6.1-2.7-6.1-6.8 0-6.2 3-11.9 6.2-17.1Z" fill="white" />
                    <path d="M45.8 22.1c1.5-1.1 3.4.3 2.4 2-2.4 3-3.8 6-3.8 8.5 0 1.5.8 2.3 2.6 2.9 2.9 1 4.5 3 4.5 5.3 0 3.1-2.4 5.2-5.8 5.2-3.8 0-6.1-2.7-6.1-6.8 0-6.2 3-11.9 6.2-17.1Z" fill="white" />
                  </g>
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight text-[#07766B]">主要主张</p>
                <ExpandableHighlight text={mainClaim || '视频未拆出明确主张'} label="主要主张" />
              </div>
            </div>
            <div className="relative flex items-start gap-3">
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF1D8]" aria-hidden="true">
                <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" stroke="#D98A0B" strokeWidth="1.7">
                  <path d="M10.7 4.2a1.5 1.5 0 0 1 2.6 0l6.7 11.8a1.5 1.5 0 0 1-1.3 2.2H5.3a1.5 1.5 0 0 1-1.3-2.2L10.7 4.2Z" strokeLinejoin="round" />
                  <path d="M12 9.4v3.1" strokeLinecap="round" />
                  <circle cx="12" cy="15" r=".55" fill="#D98A0B" stroke="none" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-tight text-[#9A5A0C]">需要留意</p>
                <ExpandableHighlight text={attentionText} label="需要留意" />
              </div>
            </div>
            <div className="relative flex items-start gap-3">
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F1FB]" aria-hidden="true">
                <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" stroke="#3E7BC4" strokeWidth="1.8"><path d="M12 2.6 5 5.2v5.3c0 4.1 2.8 7.2 7 8.9 4.2-1.7 7-4.8 7-8.9V5.2L12 2.6Z" strokeLinejoin="round" /><path d="m8.6 11.6 2.4 2.4 4.4-4.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-tight text-[#2F63A6]">核验方式</p>
                <ExpandableHighlight text={verificationMethodText} label="核验方式" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-0.5 pb-2.5 pt-0.5">
          {/* 诚实边界：这三行读的是拆主张阶段的初步归类 claim.signal，不是核验判定。
              核验判定在卡02及以后的 verifyStates 里。 */}
          <button type="button" onClick={onOpenOverview} className="t-meta flex w-full items-center gap-2 rounded-lg bg-[#F3FBF9] px-3 py-2 text-left text-[#4C7774] shadow-[0_2px_8px_rgba(15,90,82,0.08)] transition hover:bg-[#EAF8F5]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white text-[#4C7774] shadow-[0_1px_3px_rgba(15,90,82,0.10)]" aria-hidden="true">
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.2 11.8 11.8 4.2M6 4.2h5.8V10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span className="min-w-0 flex-1">到「说法全景」点选任一条开始核验</span>
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
