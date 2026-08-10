import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('single analysis models accepted and rejected routing results', async () => {
  const [types, api, page, input, modal] = await Promise.all([
    read('types.ts'),
    read('lib/api.ts'),
    read('app/page.tsx'),
    read('components/InputPage.tsx'),
    read('components/ContentRejectionModal.tsx'),
  ])

  assert.match(types, /status:\s*['"]accepted['"]/)
  assert.match(types, /status:\s*['"]rejected['"]/)
  assert.match(types, /SingleAnalyzeResult/)
  assert.match(api, /Promise<SingleAnalyzeResult>/)
  assert.match(page, /data\.status === ['"]rejected['"]/)
  assert.match(page, /ContentRejectionModal/)
  assert.doesNotMatch(page, /initialNotice=/)
  assert.doesNotMatch(input, /initialNotice\?:/)
  assert.match(modal, /role=["']dialog["']/)
  assert.match(modal, /aria-modal=["']true["']/)
  assert.match(modal, /换一个视频/)
  assert.doesNotMatch(modal, /继续分析/)
})
