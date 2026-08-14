// 抓结果页 5 张卡的 DOM 结构快照，用于重构前后逐字节比对。
// 用法: node scripts/dom-snapshot.mjs <输出文件>
import { chromium } from 'playwright'
import fs from 'node:fs'

const out = process.argv[2]
if (!out) throw new Error('需要指定输出文件')

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://localhost:3005/', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForTimeout(2200)
await page.getByRole('button', { name: '用样例数据' }).click()
await page.waitForTimeout(5500)

// React 每次渲染会换掉 styled-jsx 的哈希类名和一些随机 key，比对前要抹掉
const normalise = (html) => html
  .replace(/jsx-\d+/g, 'jsx-X')
  .replace(/data-reactroot="[^"]*"/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const snapshot = {}
const bars = page.locator('footer[aria-label*="当前第"] button')
for (let i = 0; i < 5; i++) {
  if (i > 0) {
    await bars.nth(i).click()
    await page.waitForTimeout(1300)
  }
  const html = await page.evaluate(() => {
    const main = document.querySelector('main')
    return main ? main.innerHTML : ''
  })
  snapshot[`card-${i + 1}`] = normalise(html)
}

fs.writeFileSync(out, JSON.stringify(snapshot, null, 1), 'utf8')
const total = Object.values(snapshot).reduce((a, s) => a + s.length, 0)
console.log(`已写入 ${out}`)
for (const [k, v] of Object.entries(snapshot)) console.log(`  ${k}: ${v.length} 字符`)
console.log(`合计 ${total} 字符`)
await browser.close()
