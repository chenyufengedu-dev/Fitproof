import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { singleResultSource } from './_singleSource.mjs'

const source = singleResultSource

test('action header uses a circular audience icon and smaller condition title', () => {
  assert.match(source, /data-action-audience-icon[^>]*rounded-full/s)
  assert.match(source, /data-action-audience-icon[^>]*h-8 w-8/s)
  assert.match(source, /data-action-condition[^>]*className="[^"]*t-body/s)
  assert.match(source, /ActionIcon name=\{step\.icon\} className=\{"mx-auto h-8 w-8/s)
})

test('action intro exposes the three generation principles', () => {
  assert.match(source, /data-action-principles[^>]*className="[^"]*divide-x[^"]*overflow-hidden/s)
  assert.match(source, /按人群区分/)
  assert.match(source, /按目标匹配/)
  assert.match(source, /关注身体反应/)
})

test('caution and evidence rows reuse the same circular marker', () => {
  assert.match(source, /function ActionSectionMarker/)
  assert.match(source, /<ActionSectionMarker \/>\s*需要注意/s)
  assert.match(source, /<ActionSectionMarker \/>\s*查看依据/s)
  assert.match(source, /data-action-caution-text[^>]*className="[^"]*text-\[#C75B36\]/s)
})

test('action cards use a quiet gray border and do not invent recommended methods', () => {
  assert.match(source, /<section[^>]*border-slate-200\/90/s)
  assert.match(source, /<section[^>]*shadow-\[0_6px_18px_rgba\(15,80,74,0\.10\)\]/s)
  assert.doesNotMatch(source, /data-action-methods/)
  assert.doesNotMatch(source, /推荐方式/)
  assert.doesNotMatch(source, /recommended_methods/)
})
