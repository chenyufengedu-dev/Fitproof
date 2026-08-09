import type { ShareFileResult } from './types'

export const DEFAULT_POSTER_FILENAME = 'FitProof-健康核验海报.png'

export function posterFilename(topicOrTitle?: string): string {
  const clean = (topicOrTitle || '').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 24)
  return clean ? `FitProof-${clean}核验.png` : DEFAULT_POSTER_FILENAME
}

export function downloadPoster(image: Blob, filename = DEFAULT_POSTER_FILENAME) {
  const url = URL.createObjectURL(image)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function sharePoster(
  image: Blob,
  filename = DEFAULT_POSTER_FILENAME,
  title = 'FitProof 健康核验',
): Promise<ShareFileResult> {
  const file = new File([image], filename, { type: 'image/png' })
  const payload: ShareData = { title, files: [file] }
  if (!navigator.share || !navigator.canShare?.(payload)) return 'unsupported'
  try {
    await navigator.share(payload)
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}

export function shouldShowLongPressHint(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /iPhone|iPad|iPod|MicroMessenger/i.test(userAgent)
}
