// UI 体检：在真实页面上跑可量化的检查项，输出带定位的问题清单。
// 用法: node scripts/ui-audit.mjs [baseUrl]
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://47.98.132.1:8080/'

const AUDIT = () => {
  const out = { contrast: [], tapTarget: [], truncated: [], a11y: [], fonts: {} }

  const parseRgb = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(',').map((x) => parseFloat(x))
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = (c) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
  // 往上找到第一个不透明的背景色
  const bgOf = (el) => {
    let n = el
    while (n && n !== document.documentElement) {
      const c = parseRgb(getComputedStyle(n).backgroundColor)
      if (c && c.a === 1) return c
      n = n.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  const label = (el) => {
    const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || ''))
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : ''}`
  }
  const textOf = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)

  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue

    // 直接含文本的元素才算
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ')
    if (ownText) {
      const size = parseFloat(cs.fontSize)
      const weight = parseInt(cs.fontWeight) || 400
      AUDIT_FONTS[size] = (AUDIT_FONTS[size] || 0) + 1
      const fg = parseRgb(cs.color)
      if (fg && fg.a > 0.1) {
        const bg = bgOf(el)
        const cr = ratio(fg, bg)
        // WCAG AA: 正文 4.5，大字(>=18.66px 且粗体，或 >=24px) 3.0
        const large = size >= 24 || (size >= 18.66 && weight >= 700)
        const need = large ? 3 : 4.5
        if (cr < need) out.contrast.push({ el: label(el), text: ownText.slice(0, 26), size, weight, ratio: +cr.toFixed(2), need, color: cs.color })
      }
      // 文字被截断。注意 text-overflow 的默认值就是 clip，光看它会把「溢出但可见」
      // 的元素也算进来（例如热力图月份标签故意溢到相邻空格子里）。必须确认自己或某个
      // 祖先真的在裁剪。
      // sr-only 是给读屏用的隐藏文本，被 clip 是它的实现方式，不是缺陷
      if (el.scrollWidth > el.clientWidth + 1 && !el.matches('.sr-only')) {
        const clipsSelf = cs.textOverflow === 'ellipsis' || /hidden|clip|auto|scroll/.test(cs.overflowX)
        let clipped = clipsSelf
        for (let n = el.parentElement; n && !clipped && n !== document.body; n = n.parentElement) {
          if (/hidden|clip/.test(getComputedStyle(n).overflowX)) clipped = true
        }
        // 多行夹断（line-clamp）是有意为之，不算问题
        const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none'
        if (clipped && !clamped) out.truncated.push({ el: label(el), text: ownText.slice(0, 30), shown: el.clientWidth, needed: el.scrollWidth })
      }
    }

    // 点击热区。量盒子不够：热区可能由伪元素扩出来，盒子看不见。
    // 改成真实探测——从中心往外 20px 处看命中的还是不是同一个按钮
    // （用 20 而不是 22：44px 热区的边界正好在 22，取边界值会被判成没命中）。
    const clickable = el.matches('button, a, [role="button"], input:not([type=hidden]), select, textarea, label[for]')
    if (clickable && !el.matches('.sr-only')) {
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const owns = (x, y) => {
        const hit = document.elementFromPoint(x, y)
        return !!hit && hit.closest('button, a, [role="button"], label') === el.closest('button, a, [role="button"], label')
      }
      const inView = cy > 0 && cy < innerHeight && cx > 0 && cx < innerWidth
      const hitH = !inView ? r.height : (owns(cx, cy - 20) && owns(cx, cy + 20) ? Math.max(44, r.height) : r.height)
      const hitW = !inView ? r.width : (owns(cx - 20, cy) && owns(cx + 20, cy) ? Math.max(44, r.width) : r.width)
      if (hitH < 24 || hitW < 24) {
        out.tapTarget.push({ el: label(el), text: textOf(el), w: Math.round(r.width), h: Math.round(r.height), hitW: Math.round(hitW), hitH: Math.round(hitH), offscreen: !inView })
      }
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || textOf(el) || el.getAttribute('alt') || '').trim()
      if (!name) out.a11y.push({ kind: '可点击元素没有可读名称', el: label(el) })
    }
    if (el.tagName === 'IMG' && el.getAttribute('alt') === null) out.a11y.push({ kind: 'img 缺少 alt 属性', el: label(el), src: (el.getAttribute('src') || '').slice(-40) })
  }
  out.fonts = AUDIT_FONTS
  return out
}

const pages = [
  { name: '首页', go: async () => {} },
  { name: '知识库', go: async (p) => { await p.locator('nav[aria-label="主导航"] button').nth(1).click(); await p.waitForTimeout(2600) } },
  { name: '我的', go: async (p) => { await p.locator('nav[aria-label="主导航"] button').nth(2).click(); await p.waitForTimeout(2200) } },
  {
    name: '说法全景', go: async (p) => {
      await p.locator('nav[aria-label="主导航"] button').nth(0).click(); await p.waitForTimeout(1200)
      await p.getByRole('button', { name: '用样例数据' }).click(); await p.waitForTimeout(5500)
    },
  },
]

const browser = await chromium.launch()
const all = {}
for (const page of pages) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1800)
  await page.go(p)
  const r = await p.evaluate(`(() => { const AUDIT_FONTS = {}; return (${AUDIT.toString()})() })()`)
  all[page.name] = r
  await ctx.close()
}
await browser.close()

const dedup = (arr, keyf) => {
  const m = new Map()
  for (const x of arr) { const k = keyf(x); if (!m.has(k)) m.set(k, { ...x, n: 0 }); m.get(k).n++ }
  return [...m.values()]
}

for (const [name, r] of Object.entries(all)) {
  console.log(`\n${'='.repeat(58)}\n【${name}】`)
  const c = dedup(r.contrast, (x) => x.color + '|' + x.size).sort((a, b) => a.ratio - b.ratio)
  console.log(`\n对比度不足 (WCAG AA)  —— ${r.contrast.length} 处，去重后 ${c.length} 类`)
  c.slice(0, 6).forEach((x) => console.log(`   ${x.ratio} : 1 (需 ${x.need})  ${x.size}px ${x.color}  ×${x.n}  「${x.text}」`))
  const t = dedup(r.tapTarget, (x) => x.el + x.w + x.h).sort((a, b) => a.w * a.h - b.w * b.h)
  console.log(`\n点击热区小于 24×24 (WCAG 2.5.8 AA)  —— ${r.tapTarget.length} 处，去重后 ${t.length} 类`)
  t.slice(0, 8).forEach((x) => console.log(`   盒子 ${x.w}×${x.h} 热区 ${x.hitW}×${x.hitH}${x.offscreen ? '(视口外)' : ''}  ×${x.n}  「${x.text}」  ${x.el.slice(0, 42)}`))
  console.log(`\n文字被截断 —— ${r.truncated.length} 处`)
  r.truncated.slice(0, 5).forEach((x) => console.log(`   显示 ${x.shown}px / 需要 ${x.needed}px  「${x.text}」`))
  const a = dedup(r.a11y, (x) => x.kind + x.el)
  console.log(`\n无障碍 —— ${r.a11y.length} 处`)
  a.slice(0, 5).forEach((x) => console.log(`   ${x.kind}  ×${x.n}  ${x.el.slice(0, 50)}`))
  const fonts = Object.entries(r.fonts).map(([k, v]) => [parseFloat(k), v]).sort((x, y) => y[1] - x[1])
  console.log(`\n用到的字号 —— ${fonts.length} 种: ${fonts.map(([s, n]) => `${s}px×${n}`).join(', ')}`)
}
