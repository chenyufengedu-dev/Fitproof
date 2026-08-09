import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const resultSource = readFileSync(new URL('../SingleResultPage.tsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8')
const followupSource = resultSource.slice(
  resultSource.indexOf('function FollowupCard'),
  resultSource.indexOf('export default function SingleResultPage'),
)

test('site metadata uses the doctor cat brand image as its icon', () => {
  assert.match(layoutSource, /icons:\s*\{/)
  assert.match(layoutSource, /\/brand\/cat-doctor-favicon\.png/)
})

test('diagnostic overlay remains mounted for a directional exit animation', () => {
  assert.match(resultSource, /diagnosticExitDirection/)
  assert.match(resultSource, /translateX\(\$\{direction \* width \* 1\.06\}px\)/)
  assert.match(resultSource, /rotate\(\$\{direction \* 9\}deg\)/)
  assert.match(resultSource, /setTimeout\([^]*setDiagnosticIndex\(null\)/)
})

test('diagnostic overlay follows the pointer before flying out or springing back', () => {
  assert.match(resultSource, /diagOverlayRef/)
  assert.match(resultSource, /function handleDiagnosticPointerMove/)
  assert.match(resultSource, /translateX\(\$\{x\}px\)/)
  assert.match(resultSource, /function springDiagnosticBack/)
  assert.match(resultSource, /onPointerMove=\{handleDiagnosticPointerMove\}/)
  assert.match(resultSource, /onPointerCancel=\{springDiagnosticBack\}/)
})

test('summary claim icons accept the complete asset vocabulary and infer old iconless data', () => {
  for (const icon of ['bath', 'bone-joint', 'fever-cold', 'headache', 'immunity', 'pain', 'skin']) {
    assert.match(resultSource, new RegExp(`'${icon}'`))
  }
  assert.match(resultSource, /function resolvedClaimIcon/)
  assert.match(resultSource, /resolvedClaimIcon\(claim\)/)
})

test('follow-up brand panel is inside the same scroll area as the conversation', () => {
  assert.match(followupSource, /data-followup-scroll[^>]*overflow-y-auto/)
  assert.match(followupSource, /data-followup-brand/)
  assert.ok(followupSource.indexOf('data-followup-scroll') < followupSource.indexOf('data-followup-brand'))
  assert.ok(followupSource.indexOf('data-followup-brand') < followupSource.indexOf('<form'))
})
