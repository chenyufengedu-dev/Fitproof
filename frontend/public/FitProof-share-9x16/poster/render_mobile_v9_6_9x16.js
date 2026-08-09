const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { renderMobileV94CompactTemplate } = require('./render_mobile_v9_4_compact')

const OVERRIDE_STYLESHEET = '<link rel="stylesheet" href="poster_mobile_v9_6_9x16.css" />'
const REPORT_QR = '<img class="qr qr-image" src="assets/fitproof-report-qr.jpg" alt="扫码查看完整报告" />'

function renderMobileV969x16Template(data) {
  return renderMobileV94CompactTemplate(data)
    .replace('</head>', `  ${OVERRIDE_STYLESHEET}\n</head>`)
    .replace(/<div class="qr">[\s\S]*?<\/div>/, REPORT_QR)
    .replaceAll('<img class="action-arrow" src="assets/arrowhead.svg" alt="" />', '')
    .replace('<div class="section-heading"><h2>重点核验</h2></div>', '<div class="section-heading"><h2>视频解析出的重点说法</h2><span>逐句转写 · 原文定位</span></div>')
    .replaceAll('<div class="claim-content"><p class="quote">', '<div class="claim-content"><span class="quote-source">视频口播原文</span><p class="quote">')
    .replaceAll('<b>科学结论</b>', '<b>核验结论</b>')
    .replace('AI 核验完成', '核验已完成')
    .replace('<div class="tagline"><strong>让 AI 替你多看一步</strong><span>识别视频里的健康误导</span></div>', '<div class="tagline"><strong>把视频说法看清楚</strong><span>逐句定位 · 依据核验</span></div>')
}

async function generateMobileV969x16Poster(data, options = {}) {
  const { chromium } = require('playwright')
  const file = path.join(__dirname, `.mobile-v96-9x16-${randomUUID()}.html`)
  let browser
  try {
    fs.writeFileSync(file, renderMobileV969x16Template(data), 'utf8')
    // --no-sandbox 必需：Linux 服务器以 root 跑时，Chromium 不加此参会拒绝启动（本地 Windows 无影响）
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage({ viewport: { width: 900, height: 1600 }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' })
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready })
    return await page.locator('.poster').screenshot({ path: options.outputPath, type: 'png' })
  } finally {
    if (browser) await browser.close()
    fs.rmSync(file, { force: true })
  }
}

if (require.main === module) {
  const chunks = []
  process.stdin.on('data', (chunk) => chunks.push(chunk))
  process.stdin.on('end', () => generateMobileV969x16Poster(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    .then((png) => process.stdout.write(png))
    .catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1 }))
}

module.exports = { renderMobileV969x16Template, generateMobileV969x16Poster }
