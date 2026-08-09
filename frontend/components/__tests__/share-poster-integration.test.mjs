import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const resultPage = readFileSync(new URL('../SingleResultPage.tsx', import.meta.url), 'utf8')
const previewPath = new URL('../share/SharePosterPreview.tsx', import.meta.url)
const routePath = new URL('../../app/api/share-poster/route.ts', import.meta.url)
const shareBrowserPath = new URL('../../lib/share/shareBrowser.ts', import.meta.url)

test('single result page exposes the teammate share-poster flow', () => {
  assert.match(resultPage, /分享这份核验/)
  assert.match(resultPage, /buildShareRequest/)
  assert.match(resultPage, /SharePosterPreview/)
})

test('share entry is a quiet top-bar action with an explicitly sized icon', () => {
  assert.match(resultPage, /aria-label="分享这份核验，生成 9:16 长图"/)
  assert.match(resultPage, /className="h-4 w-4 shrink-0"/)
  assert.match(resultPage, /shareStatus === 'generating' \? '生成中' : '分享'/)
  assert.doesNotMatch(resultPage, /shareReady \? '生成分享长图'/)
})

test('share preview asks for explicit evidence-library consent and defaults it off', () => {
  assert.equal(existsSync(previewPath), true)
  const preview = readFileSync(previewPath, 'utf8')
  assert.match(preview, /useState\(false\)/)
  assert.match(preview, /同意将这条核验\(不含个人信息\)提交至证据库审核/)
  assert.match(preview, /type="checkbox"/)
  assert.match(preview, /if \(!evidenceConsent \|\| evidenceSubmitted \|\| !onContribute\) return/)
  assert.match(preview, /setEvidenceConsent\(false\)/)
})

test('share preview closes only from the dark backdrop', () => {
  const preview = readFileSync(previewPath, 'utf8')
  assert.match(preview, /data-share-backdrop[^>]*onClick=\{onClose\}/s)
  assert.match(preview, /data-share-poster[^>]*onClick=\{\(event\) => event\.stopPropagation\(\)\}/s)
  assert.match(preview, /data-share-actions[^>]*onClick=\{\(event\) => event\.stopPropagation\(\)\}/s)
  assert.match(preview, /aria-label="关闭预览"[^>]*onClick=\{\(event\) => \{ event\.stopPropagation\(\); onClose\(\) \}\}/s)
})

test('share preview shows submitted state and mobile long-press wording', () => {
  const preview = readFileSync(previewPath, 'utf8')
  assert.match(preview, /evidenceSubmitted && .*✓ 已提交/s)
  assert.match(preview, /shouldShowLongPressHint\(\) \? '长按上方图片保存' : '保存图片'/)
})

test('poster filename removes unsafe characters and carries the topic', async () => {
  const source = readFileSync(shareBrowserPath, 'utf8')
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
  const { posterFilename, DEFAULT_POSTER_FILENAME } = await import(moduleUrl)
  assert.equal(posterFilename(' 月子 / 洗头? '), 'FitProof-月子洗头核验.png')
  assert.equal(posterFilename(''), DEFAULT_POSTER_FILENAME)
  assert.equal(posterFilename('一二三四五六七八九十一二三四五六七八九十二三四五六'), 'FitProof-一二三四五六七八九十一二三四五六七八九十二三四五核验.png')
})

test('single result page supplies the topic-aware poster filename', () => {
  assert.match(resultPage, /filename=\{posterFilename\(topic \|\| data\.topic \|\| data\.reference\.title\)\}/)
})

test('poster API uses the integrated 9x16 renderer', () => {
  assert.equal(existsSync(routePath), true)
  const route = readFileSync(routePath, 'utf8')
  assert.match(route, /generateMobileV969x16Poster/)
  assert.match(route, /image\/png/)
})
