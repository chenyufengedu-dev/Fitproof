'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_POSTER_FILENAME, downloadPoster, sharePoster, shouldShowLongPressHint } from '@/lib/share/shareBrowser'
import type { SharePreviewStatus } from '@/lib/share/types'

interface SharePosterPreviewProps {
  open: boolean
  status: SharePreviewStatus
  imageBlob?: Blob | null
  error?: string
  filename?: string
  onRetry?: () => void
  onClose: () => void
  onContribute?: () => Promise<number>
}

export default function SharePosterPreview({
  open,
  status,
  imageBlob,
  error = '分享图片生成失败，请重试。',
  filename = DEFAULT_POSTER_FILENAME,
  onRetry,
  onClose,
  onContribute,
}: SharePosterPreviewProps) {
  const [imageUrl, setImageUrl] = useState('')
  const [sharing, setSharing] = useState(false)
  const [message, setMessage] = useState('')
  const [evidenceConsent, setEvidenceConsent] = useState(false)
  const [evidenceSubmitting, setEvidenceSubmitting] = useState(false)
  const [evidenceSubmitted, setEvidenceSubmitted] = useState(false)

  useEffect(() => {
    if (!imageBlob) {
      setImageUrl('')
      return
    }
    const nextUrl = URL.createObjectURL(imageBlob)
    setImageUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [imageBlob])

  useEffect(() => {
    if (!open) return
    setEvidenceConsent(false)
    setEvidenceSubmitting(false)
    setEvidenceSubmitted(false)
    setMessage('')
  }, [open, imageBlob])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function submitWithConsent() {
    if (!evidenceConsent || evidenceSubmitted || !onContribute) return
    setEvidenceSubmitting(true)
    try {
      const count = await onContribute()
      setEvidenceSubmitted(true)
      setMessage(`已匿名提交 ${count} 条说法，等待证据库审核。`)
    } catch {
      setMessage('图片仍可正常分享；证据库提交失败，请稍后重试。')
    } finally {
      setEvidenceSubmitting(false)
    }
  }

  async function handleDownload() {
    if (!imageBlob || evidenceSubmitting) return
    await submitWithConsent()
    downloadPoster(imageBlob, filename)
  }

  async function handleShare() {
    if (!imageBlob || sharing || evidenceSubmitting) return
    setSharing(true)
    if (!evidenceConsent) setMessage('')
    try {
      await submitWithConsent()
      const result = await sharePoster(imageBlob, filename)
      if (result === 'unsupported') setMessage('当前浏览器不支持直接分享图片，请先保存，再从相册分享。')
    } catch {
      setMessage('系统分享未完成，图片仍保留在预览中。')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div data-share-backdrop className="fixed inset-0 z-[1000] flex flex-col bg-[#051412]/95 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] text-white animate-fadeIn" role="dialog" aria-modal="true" aria-label="FitProof 分享图片预览" onClick={onClose}>
      <button type="button" className="absolute right-3.5 top-[max(12px,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white" aria-label="关闭预览" onClick={(event) => { event.stopPropagation(); onClose() }}><svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" /></svg></button>

      <div className="grid min-h-0 flex-1 place-items-center overflow-hidden">
        {status === 'generating' && (
          <div className="flex w-full max-w-[min(72%,300px)] flex-col items-center">
            <div className="relative aspect-[9/16] w-full animate-pulse overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.05]">
              <span className="absolute inset-0 grid place-items-center">
                <svg className="h-9 w-9 animate-spin text-[#20CDB6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" strokeLinecap="round" /></svg>
              </span>
            </div>
            <p className="t-label mt-4 text-white">正在生成 9:16 分享长图…</p>
            <p className="t-micro mt-1 text-white/50">约 1–2 秒，请稍候</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex max-w-sm flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-[#FFB4A2]"><svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M10.3 3.9 2.6 17.4c-.6 1 .1 2.3 1.3 2.3h15.6c1.2 0 1.9-1.3 1.3-2.3L13.7 3.9c-.6-1.1-2.1-1.1-2.7 0Z" strokeLinejoin="round" /><path d="M12 8.5v4.5M12 16.4h.01" strokeLinecap="round" /></svg></span>
            <p className="t-label mt-3 leading-relaxed text-white">{error}</p>
            {onRetry && <button type="button" className="mt-4 min-h-11 rounded-full bg-[#20CDB6] px-6 t-label text-[#06403A] transition active:scale-[0.98]" onClick={onRetry}>重新生成</button>}
          </div>
        )}
        {status === 'ready' && imageUrl && <img data-share-poster src={imageUrl} alt="FitProof 健康核验分享长图" className="block max-h-full max-w-[min(100%,520px)] rounded-[14px] object-contain shadow-[0_18px_48px_rgba(0,0,0,.38)]" onClick={(event) => event.stopPropagation()} />}
      </div>

      {status === 'ready' && imageBlob && (
        <div data-share-actions className="mx-auto mt-3 w-full max-w-[520px]" onClick={(event) => event.stopPropagation()}>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-white/15 bg-white/10 px-3 py-2.5 text-left">
            <input
              type="checkbox"
              checked={evidenceConsent}
              disabled={evidenceSubmitting || evidenceSubmitted}
              onChange={(event) => { setEvidenceConsent(event.target.checked); setMessage('') }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#20CDB6]"
            />
            <span className="min-w-0">
              <span className="t-meta block leading-5 text-white">同意将这条核验(不含个人信息)提交至证据库审核</span>
              <span className="t-micro mt-0.5 block text-white/55">勾选后，将在保存或分享时匿名提交；默认不勾选。</span>
            </span>
            {evidenceSubmitted && <span data-evidence-submitted className="t-micro ml-auto shrink-0 whitespace-nowrap text-[#20CDB6]">✓ 已提交</span>}
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => void handleDownload()} disabled={evidenceSubmitting} className="min-h-12 rounded-full bg-white px-5 t-label text-[#087F72] disabled:opacity-60">{evidenceSubmitting ? '正在提交…' : shouldShowLongPressHint() ? '长按上方图片保存' : '保存图片'}</button>
            <button type="button" onClick={() => void handleShare()} disabled={sharing || evidenceSubmitting} className="min-h-12 rounded-full bg-[#20CDB6] px-5 t-label text-[#06403A] disabled:opacity-60">{sharing ? '正在打开分享…' : '分享给好友'}</button>
          </div>
        </div>
      )}

      {message && <p className="t-micro mx-auto mt-2 text-center text-[#FFE1A8]" role="status">{message}</p>}
      {status === 'ready' && imageUrl && shouldShowLongPressHint() && <p className="t-micro mx-auto mt-2 text-center text-white/60">也可以长按图片保存</p>}
    </div>
  )
}
