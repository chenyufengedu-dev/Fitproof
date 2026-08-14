import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { singleResultSource } from './_singleSource.mjs'

const liveModule = await import('../verify/liveVerification.mjs').catch(() => null)
const pageSource = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8')
const resultSource = singleResultSource
const apiSource = readFileSync(new URL('../../lib/api.ts', import.meta.url), 'utf8')

test('working and completed events update one real trace row', () => {
  assert.ok(liveModule, 'liveVerification.mjs should provide trace event merging')
  const working = { step: 'reasoning_model', label: '调用推理模型', status: 'working' }
  const completed = { step: 'reasoning_model', label: '调用推理模型', status: 'done', detail: '3771.9 ms' }
  const first = liveModule.mergeTraceStep([], working)
  const second = liveModule.mergeTraceStep(first, completed)
  assert.equal(second.length, 1)
  assert.deepEqual(second[0], completed)
})

test('page exposes a dedicated real streaming rerun without sample cache or non-stream fallback', () => {
  assert.match(pageSource, /function handleReverifySingleClaim/)
  assert.match(pageSource, /onReverifyClaim=\{handleReverifySingleClaim\}/)
  const rerun = pageSource.slice(
    pageSource.indexOf('function handleReverifySingleClaim'),
    pageSource.indexOf('function renderVerifyContent'),
  )
  assert.match(rerun, /verifyClaimStream/)
  assert.doesNotMatch(rerun, /sampleVerifyResults|verifyClaim\(/)
})

test('first diagnostic visit consumes live SSE state instead of cached replay timers', () => {
  assert.match(resultSource, /onReverifyClaim:/)
  assert.match(resultSource, /freshVerifyStates/)
  assert.match(resultSource, /function runFreshClaim/)
  assert.match(resultSource, /onReverifyClaim\(claim, index/)
  assert.match(resultSource, /mergeTraceStep/)
  assert.doesNotMatch(resultSource, /scheduleTraceReplay|visibleTraceCount|visibleTraceSteps/)
})

test('successful rerun replaces the canonical claim and queues derived refresh', () => {
  assert.match(resultSource, /function promoteFreshResult/)
  assert.match(resultSource, /statesRef\.current = nextStates/)
  assert.match(resultSource, /queueActionRefresh\(nextStates, true\)/)
  assert.match(resultSource, /setShareBlob\(null\)/)
  assert.match(resultSource, /setRevealedClaims/)
})

test('action advice remains visible while a shared refresh promise runs', () => {
  assert.match(resultSource, /actionsRefreshPromiseRef/)
  assert.match(resultSource, /singleActionsRef/)
  assert.match(resultSource, /function queueActionRefresh/)
  assert.doesNotMatch(resultSource, /setSingleActions\(\[\]\)/)
})

test('share stays clickable and waits for live verification and latest actions', () => {
  assert.match(resultSource, /freshRunPromisesRef/)
  assert.match(resultSource, /await Promise\.allSettled/)
  assert.match(resultSource, /await actionsRefreshPromiseRef\.current/)
  assert.match(resultSource, /buildShareRequest\(source, statesRef\.current, singleActionsRef\.current\)/)
  assert.doesNotMatch(resultSource, /disabled=\{!shareReady \|\| shareBusy\}/)
})

test('SSE parser preserves stage identity and working status', () => {
  assert.match(apiSource, /step: event\.step/)
  assert.match(apiSource, /status: event\.step\?\.endsWith\('_start'\) \? 'working' : 'done'/)
})
