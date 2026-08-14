// 无障碍静态扫描：直接读 tsx 源码，覆盖所有组件（浏览器只能覆盖点得到的页面）。
// 查三类：img 缺 alt、可点击元素没有可读名称、输入框没有关联标签。
import fs from 'node:fs'
import path from 'node:path'

const roots = ['app', 'components']
const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.next', '__tests__'].includes(e.name)) continue
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.tsx')) files.push(p)
  }
}
for (const r of roots) if (fs.existsSync(r)) walk(r)

// 抓出一个标签的完整开标签文本（处理嵌套的 {} 和引号）
function openTags(src, tagName) {
  const out = []
  const re = new RegExp(`<${tagName}(?=[\\s/>])`, 'g')
  let m
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    let depth = 0
    let quote = null
    while (i < src.length) {
      const ch = src[i]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
      else if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
      i++
    }
    const attrs = src.slice(m.index, i + 1)
    const line = src.slice(0, m.index).split('\n').length
    // 自闭合的没有子节点
    const selfClosing = /\/>$/.test(attrs.trim())
    let children = ''
    if (!selfClosing) {
      const close = src.indexOf(`</${tagName}>`, i)
      children = close === -1 ? '' : src.slice(i + 1, close)
    }
    out.push({ attrs, children, line, selfClosing })
  }
  return out
}

const has = (attrs, name) => new RegExp(`(^|\\s)${name}[=\\s/>]`).test(attrs)
// 子节点里有没有可能渲染出文字（排除纯 svg / 图标组件）
const hasText = (children) => {
  const stripped = children
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<(Icon|BankIcon|ActionIcon|StepIcon|LoadingDots)[^>]*\/?>/g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(stripped.replace(/<[^>]+>/g, ''))
    || /\{[^}]*\}/.test(stripped)
}

const findings = { img: [], clickable: [], input: [] }

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = f.split(path.sep).join('/')

  for (const t of openTags(src, 'img')) {
    if (!has(t.attrs, 'alt')) findings.img.push(`${rel}:${t.line}`)
  }
  for (const t of openTags(src, 'button')) {
    if (has(t.attrs, 'aria-label') || has(t.attrs, 'title') || has(t.attrs, 'aria-labelledby')) continue
    if (!hasText(t.children)) findings.clickable.push(`${rel}:${t.line}  ${t.attrs.replace(/\s+/g, ' ').slice(0, 70)}`)
  }
  // 被有文字的 <label> 包着就已经有可读名称了，不算缺陷
  const wrappedByLabel = (src, at) => {
    const open = src.lastIndexOf('<label', at)
    if (open === -1) return false
    const close = src.lastIndexOf('</label>', at)
    if (close > open) return false
    const end = src.indexOf('</label>', at)
    if (end === -1) return false
    return hasText(src.slice(open, end).replace(/<input[\s\S]*?\/>/g, ''))
  }

  for (const tag of ['input', 'textarea']) {
    for (const t of openTags(src, tag)) {
      if (/type=("|')(hidden|checkbox|radio)/.test(t.attrs)) continue
      if (has(t.attrs, 'aria-label') || has(t.attrs, 'id') || has(t.attrs, 'aria-labelledby')) continue
      if (wrappedByLabel(src, src.indexOf(t.attrs))) continue
      findings.input.push(`${rel}:${t.line}  ${(t.attrs.match(/placeholder="[^"]*"/) || [''])[0]}`)
    }
  }
}

const show = (title, arr) => {
  console.log(`\n${title} —— ${arr.length} 处`)
  arr.forEach((x) => console.log('   ' + x))
}
console.log(`扫描 ${files.length} 个 tsx 文件`)
show('img 缺少 alt（读屏会念出文件名）', findings.img)
show('按钮没有可读名称（读屏只念"按钮"）', findings.clickable)
show('输入框没有关联标签', findings.input)
const total = findings.img.length + findings.clickable.length + findings.input.length
console.log(`\n合计 ${total} 处`)
process.exit(total ? 1 : 0)
