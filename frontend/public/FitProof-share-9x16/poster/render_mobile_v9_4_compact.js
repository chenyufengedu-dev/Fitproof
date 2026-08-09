const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { stampSvg } = require('./stamp')
const { resolveActionIcon } = require('./action-icon-resolver')

const ROOT = __dirname
const TEMPLATE = path.join(ROOT, 'fitproof_share_poster_v9_4_compact.html')
const EMPTY_COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"%3E%3Crect width="16" height="9" fill="%23e8f1ef"/%3E%3C/svg%3E'
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

function validate(data) {
  if (!data?.video || !data?.coreConclusion || !Array.isArray(data.claims) || !Array.isArray(data.actions) || !Array.isArray(data.references)) throw new TypeError('invalid poster data')
  if (data.claims.length < 1) throw new TypeError('at least one claim is required')
  return data
}
function statusClass(status) {
  if (/不建议采纳|中风险/.test(status || '')) return 'risk'
  if (/需加条件/.test(status || '')) return 'warn'
  return 'neutral'
}
function block(html, name, values) {
  const match = html.match(new RegExp(`\\{\\{#${name}\\}\\}([\\s\\S]*?)\\{\\{\\/${name}\\}\\}`))
  if (!match) throw new Error(`missing ${name} block`)
  return html.replace(match[0], values.map((value) => match[1].replace(/\{\{([\w_]+)\}\}/g, (_, key) => value[key] ?? '')).join(''))
}
function renderMobileV94CompactTemplate(input) {
  const data = validate(input)
  const claims = data.claims.slice(0, 3)
  const actions = data.actions.slice(0, 3)
  let html = fs.readFileSync(TEMPLATE, 'utf8')
  html = block(html, 'claims', claims.map((claim, index) => ({ claim_number: index + 1, claim_time: escapeHtml(claim.time || '—'), claim_quote: escapeHtml(claim.quote), claim_conclusion: escapeHtml(claim.conclusion), claim_stamp: stampSvg(claim.status, index + 1, claim.riskLevel) })))
  html = block(html, 'actions', actions.map((action, index) => ({ action_number: index + 1, action_icon_src: escapeHtml(resolveActionIcon(action)), action_title: escapeHtml(action.title), action_desc: escapeHtml(action.desc) })))
  html = html.replace('{{actions_empty}}', actions.length ? '' : '<p class="action-empty">当前未形成可执行建议</p>')
  html = html.replace('{{qr_cells}}', '<span></span>'.repeat(64))
  const referencesText = input.references.map((reference) => String(reference || '').trim()).filter(Boolean).slice(0, 2).join(' · ')
  const fields = { video_title: input.video.title, video_cover_url: input.video.cover || EMPTY_COVER, video_duration: input.video.duration || '—', author: input.video.author || '未提供', video_intro: input.video.intro || '', core_conclusion: input.coreConclusion.text, claims_count: claims.length, action_count: actions.length, action_note: input.actionNote || (actions.length ? '根据当前证据，优先采用更稳妥、可执行的做法。' : '当前核验材料不足以形成具体建议。'), references_text: referencesText || '完整依据请查看报告' }
  return html.replace(/\{\{([\w_]+)\}\}/g, (_, key) => escapeHtml(fields[key] ?? ''))
}
async function generateMobileV94CompactPoster(data, options = {}) {
  const { chromium } = require('playwright')
  const file = path.join(ROOT, `.mobile-v94-compact-${randomUUID()}.html`)
  let browser
  try {
    fs.writeFileSync(file, renderMobileV94CompactTemplate(data), 'utf8')
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 900, height: 1600 }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' })
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready })
    return await page.locator('.poster').screenshot({ path: options.outputPath, type: 'png' })
  } finally { if (browser) await browser.close(); fs.rmSync(file, { force: true }) }
}
if (require.main === module) {
  const chunks = []
  process.stdin.on('data', (chunk) => chunks.push(chunk))
  process.stdin.on('end', () => generateMobileV94CompactPoster(JSON.parse(Buffer.concat(chunks).toString('utf8'))).then((png) => process.stdout.write(png)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1 }))
}
module.exports = { renderMobileV94CompactTemplate, generateMobileV94CompactPoster }
