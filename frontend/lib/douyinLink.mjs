const URL_PATTERN = /https?:\/\/[^\s"'<>，。！？、；）】]+/gi

export function extractDouyinVideoLink(text) {
  const candidates = String(text || '').match(URL_PATTERN) || []
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate)
      const host = url.hostname.toLowerCase().replace(/^www\./, '')
      const path = url.pathname
      const isShortVideo = host === 'v.douyin.com' && /^\/[^/]+\/?$/.test(path)
      const isCanonicalVideo = host === 'douyin.com' && /^\/video\/\d+\/?$/.test(path)
      const isSharedVideo = host === 'iesdouyin.com' && /^\/share\/video\/\d+\/?$/.test(path)
      if (isShortVideo || isCanonicalVideo || isSharedVideo) return candidate
    } catch {
      // Keep scanning other URLs in pasted share text.
    }
  }
  return ''
}
