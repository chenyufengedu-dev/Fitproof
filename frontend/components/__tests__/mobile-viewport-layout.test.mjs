import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('mobile shell uses one dynamic viewport and one shared bottom inset', async () => {
  const [layout, page, nav, input, css] = await Promise.all([
    read('app/layout.tsx'),
    read('app/page.tsx'),
    read('components/BottomNav.tsx'),
    read('components/InputPage.tsx'),
    read('app/globals.css'),
  ])

  assert.match(layout, /export const viewport/)
  assert.match(layout, /viewportFit:\s*['"]cover['"]/)
  assert.match(css, /--bottom-nav-height:\s*54px/)
  assert.match(css, /--bottom-app-inset:/)
  assert.match(page, /pb-\[var\(--bottom-app-inset\)\]/)
  assert.match(nav, /h-\[var\(--bottom-nav-height\)\]/)
  assert.match(nav, /pb-\[var\(--bottom-safe-area\)\]/)
  assert.doesNotMatch(input, /min-h-screen/)
  assert.doesNotMatch(input, /100vh/)
  assert.match(input, /fitproof-input-page/)
  assert.match(css, /@media \(max-height: 779px\) and \(max-width: 639px\)/)
  assert.match(css, /@media \(max-height: 639px\) and \(max-width: 639px\)/)
})
