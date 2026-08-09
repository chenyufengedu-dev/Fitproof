import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveKnowledgeSwipe, visibleKnowledgeIndexes, wrapKnowledgeIndex } from '../loadingKnowledgeCarousel.mjs'

const source = readFileSync(new URL('../LoadingPage.tsx', import.meta.url), 'utf8')

test('knowledge carousel moves image and copy on one composited track', () => {
  assert.match(source, /data-knowledge-track/)
  assert.match(source, /translate3d/)
  assert.match(source, /will-change-transform/)
  assert.match(source, /visibleKnowledgeCards\.map/)
})

test('knowledge carousel follows pointer movement and settles on transition end', () => {
  assert.match(source, /onPointerMove=/)
  assert.match(source, /onTransitionEnd=/)
  assert.match(source, /setPointerCapture/)
  assert.match(source, /knowledgeSettlingRef/)
  assert.match(source, /!event\.isPrimary/)
})

test('knowledge card images are eagerly preloaded and decoded', () => {
  assert.match(source, /new Image\(\)/)
  assert.match(source, /image\.decode\(\)/)
  assert.match(source, /decoding="async"/)
  assert.match(source, /loading="eager"/)
  assert.match(source, /knowledge-cards\/blueberries\.webp/)
  assert.doesNotMatch(source, /knowledge-cards\/[^'\"]+\.png/)
})

test('knowledge carousel stays gated until every image has finished decoding', () => {
  assert.match(source, /knowledgeAssetsReady/)
  assert.match(source, /Promise\.all\(preloads\)/)
  assert.match(source, /aria-busy=\{!knowledgeAssetsReady\}/)
  assert.match(source, /if \(!knowledgeAssetsReady\) return/)
  assert.match(source, /!knowledgeAssetsReady \|\| !event\.isPrimary/)
})

test('automatic rotation uses a resettable timeout instead of a fixed interval', () => {
  assert.match(source, /window\.setTimeout/)
  assert.doesNotMatch(source, /setInterval\(\(\) => \{\s*setKnowledgeIndex/)
})

test('knowledge carousel wraps both directions and keeps previous/current/next ordered', () => {
  assert.equal(wrapKnowledgeIndex(3, 1, 4), 0)
  assert.equal(wrapKnowledgeIndex(0, -1, 4), 3)
  assert.deepEqual(visibleKnowledgeIndexes(0, 4), [3, 0, 1])
  assert.deepEqual(visibleKnowledgeIndexes(3, 4), [2, 3, 0])
})

test('knowledge swipe commits only past the threshold and cancellation always settles', () => {
  assert.equal(resolveKnowledgeSwipe(-38, false), 1)
  assert.equal(resolveKnowledgeSwipe(38, false), -1)
  assert.equal(resolveKnowledgeSwipe(37, false), 0)
  assert.equal(resolveKnowledgeSwipe(-90, true), 0)
})
