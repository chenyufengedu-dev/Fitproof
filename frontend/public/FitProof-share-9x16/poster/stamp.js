const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

function stampLabel(status) {
  const value = String(status || '').trim()
  if (/高风险/.test(value)) return '高风险'
  if (/不可信|错误|误导|夸大/.test(value)) return '不可信'
  if (/不建议/.test(value)) return '不建议采纳'
  if (/需加条件|需要条件|有条件|条件成立/.test(value)) return '需加条件'
  if (/证据不足|待核验|不确定/.test(value)) return '证据不足'
  if (/需谨慎|谨慎|中风险/.test(value)) return '需谨慎'
  if (/基本可行|可行/.test(value)) return '基本可行'
  if (/可信/.test(value)) return '基本可信'
  if (/低风险/.test(value)) return '低风险'
  return '证据不足'
}

function stampColor(status) {
  const value = String(status || '')
  if (/不可信|不建议|高风险|错误|误导|夸大/.test(value)) return '#D64545'
  if (/可信|基本可行|可行|低风险/.test(value)) return '#0B8F82'
  return '#D58A00'
}

function stampSvg(status, index, riskLevel = '') {
  const label = escapeHtml(stampLabel(status))
  const color = stampColor(`${status || ''} ${riskLevel || ''}`)
  const fontSize = Array.from(label).length <= 2 ? 21 : Array.from(label).length <= 4 ? 14 : 10.5
  const uid = `seal-${index}`
  return `<svg viewBox="0 0 100 100" class="claim-stamp" role="img" aria-label="核验结果：${label}"><defs><path id="${uid}-arc" d="M 23 50 A 27 27 0 0 1 77 50" fill="none"/><mask id="${uid}-mask"><rect width="100" height="100" fill="white"/><rect x="2" y="37" width="96" height="26" rx="4" fill="black" transform="rotate(-12 50 50)"/></mask></defs><g fill="none" stroke="${color}"><g mask="url(#${uid}-mask)"><circle cx="50" cy="50" r="45.5" stroke-width="2.4"/><circle cx="50" cy="50" r="41" stroke-width="1.1"/><text fill="${color}" stroke="none" font-size="9.5" font-weight="700" letter-spacing="2.6"><textPath href="#${uid}-arc" startOffset="50%" text-anchor="middle">核验结论</textPath></text><path d="M38 77l1.1 2.3 2.5.3-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.3ZM50 77l1.1 2.3 2.5.3-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.3ZM62 77l1.1 2.3 2.5.3-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.3Z" fill="${color}" stroke="none"/></g><rect x="2" y="37" width="96" height="26" rx="4" stroke-width="2.3" transform="rotate(-12 50 50)"/><text x="50" y="50" fill="${color}" stroke="none" font-size="${fontSize}" font-weight="900" text-anchor="middle" dominant-baseline="central" transform="rotate(-12 50 50)">${label}</text></g></svg>`
}

module.exports = { stampSvg, stampLabel, stampColor }
