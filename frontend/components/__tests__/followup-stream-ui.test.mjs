import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { singleResultSource } from './_singleSource.mjs'

const cardSource = singleResultSource
const apiSource = readFileSync(new URL('../../lib/api.ts', import.meta.url), 'utf8')

test('AI answer bubbles do not render a companion avatar', () => {
  assert.doesNotMatch(cardSource, /function FollowupAvatar/)
  assert.doesNotMatch(cardSource, /<FollowupAvatar/)
})

test('single-video follow-up consumes incremental stream updates', () => {
  assert.match(apiSource, /followupSingleStream/)
  assert.match(cardSource, /followupSingleStream\(payload, \(_delta, answer\)/)
  assert.match(cardSource, /content: answer/)
  assert.match(cardSource, /updateAnswer\(currentAnswer\)/)
})
