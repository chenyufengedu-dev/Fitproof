import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 3120
const baseURL = process.env.FITPROOF_URL || `http://127.0.0.1:${port}`
const cases = [
  { name: 'small', width: 320, height: 568, requireCtaInView: false },
  { name: 'ordinary', width: 360, height: 640, requireCtaInView: true },
  { name: 'iphone', width: 390, height: 844, requireCtaInView: true },
  { name: 'large', width: 430, height: 932, requireCtaInView: true },
  { name: 'landscape', width: 844, height: 390, requireCtaInView: false },
]

async function waitForServer(url) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`FitProof server did not become ready: ${url}`)
}

const server = process.env.FITPROOF_URL
  ? null
  : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

if (server) await waitForServer(baseURL)
const browser = await chromium.launch({ headless: true })
try {
  for (const entry of cases) {
    const page = await browser.newPage({ viewport: { width: entry.width, height: entry.height } })
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    const geometry = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.textContent?.includes('分析单视频'))
      const nav = document.querySelector('nav[aria-label="主导航"]')
      const buttonRect = button?.getBoundingClientRect()
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        button: buttonRect ? { top: buttonRect.top, bottom: buttonRect.bottom } : null,
        navTop: nav?.getBoundingClientRect().top ?? null,
      }
    })
    assert.ok(geometry.scrollWidth <= geometry.clientWidth, `${entry.name}: horizontal overflow`)
    assert.ok(geometry.button, `${entry.name}: analysis button missing`)
    assert.ok(geometry.navTop !== null, `${entry.name}: bottom nav missing`)
    if (entry.requireCtaInView) {
      assert.ok(geometry.button.bottom <= geometry.navTop, `${entry.name}: CTA is below or behind nav`)
    }
    console.log(`${entry.name}: ${entry.width}x${entry.height} ok`)
    await page.close()
  }
} finally {
  await browser.close()
  server?.kill()
}
