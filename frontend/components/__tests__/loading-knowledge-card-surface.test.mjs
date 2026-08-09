import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../LoadingPage.tsx', import.meta.url), 'utf8')
const cardMatch = source.match(/<section\s+className="([^"]+)"\s+aria-label="小知识内容区域，可左右滑动切换"/)

test('knowledge card uses a borderless elevated surface without changing its geometry', () => {
  assert.ok(cardMatch, 'knowledge card root classes should be discoverable')
  const classes = cardMatch[1].split(/\s+/)

  assert.ok(classes.includes('h-[126px]'))
  assert.ok(classes.includes('rounded-[18px]'))
  assert.equal(classes.some((name) => name === 'border' || name.startsWith('border-') || name.startsWith('border[')), false)
  assert.match(cardMatch[1], /bg-\[linear-gradient\(145deg,rgba\(255,255,255,0\.98\)/)
  assert.match(cardMatch[1], /shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.95\),0_3px_10px_rgba\(18,116,103,0\.045\),0_12px_28px_rgba\(18,116,103,0\.075\)\]/)
})
