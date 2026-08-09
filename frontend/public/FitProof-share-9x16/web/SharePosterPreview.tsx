'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_POSTER_FILENAME, downloadPoster, sharePoster, shouldShowLongPressHint } from './shareBrowser'
import type { SharePreviewStatus } from './types'
import './SharePosterPreview.css'

export interface SharePosterPreviewProps {
  open: boolean
  status: SharePreviewStatus
  imageBlob?: Blob | null
  error?: string
  filename?: string
  onRetry?: () => void
  onClose: () => void
}

export function SharePosterPreview({
  open,
  status,
  imageBlob,
  error = '分享图片生成失败，请重试',
  filename = DEFAULT_POSTER_FILENAME,
  onRetry,
  onClose,
}: SharePosterPreviewProps) {
  const [imageUrl, setImageUrl] = useState('')
  const [message, setMessage] = useState('')
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!imageBlob) {
      setImageUrl('')
      return
    }
    const url = URL.createObjectURL(imageBlob)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageBlob])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  useEffect(() => {
    if (!open) setMessage('')
  }, [open])

  if (!open) return null

  async function handleShare() {
    if (!imageBlob || sharing) return
    setSharing(true)
    setMessage('')
    try {
      const result = await sharePoster(imageBlob, filename)
      if (result === 'unsupported') setMessage('当前浏览器不支持直接分享图片，请先保存，再从相册分享。')
    } catch {
      setMessage('系统分享未完成，图片仍保留在预览中。')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="fitproof-share-preview" role="dialog" aria-modal="true" aria-label="FitProof 分享图片预览">
      <button type="button" className="fitproof-share-preview__close" onClick={onClose} aria-label="关闭预览">×</button>

      <div className="fitproof-share-preview__canvas">
        {status === 'generating' && <p className="fitproof-share-preview__state">正在生成分享图片…</p>}
        {status === 'error' && (
          <div className="fitproof-share-preview__state">
            <p>{error}</p>
            {onRetry && <button type="button" onClick={onRetry}>重新生成</button>}
          </div>
        )}
        {status === 'ready' && imageUrl && (
          <img src={imageUrl} alt="FitProof 健康核验分享图片" className="fitproof-share-preview__image" />
        )}
      </div>

      {status === 'ready' && imageBlob && (
        <div className="fitproof-share-preview__actions">
          <button type="button" onClick={() => downloadPoster(imageBlob, filename)}>保存图片</button>
          <button type="button" onClick={() => void handleShare()} disabled={sharing}>
            {sharing ? '正在打开分享…' : '分享给好友'}
          </button>
        </div>
      )}

      {message && <p className="fitproof-share-preview__message" role="status">{message}</p>}
      {status === 'ready' && imageUrl && shouldShowLongPressHint() && (
        <p className="fitproof-share-preview__hint">也可以长按图片保存</p>
      )}
    </div>
  )
}
