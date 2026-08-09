import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sample = JSON.parse(readFileSync(new URL('../../data/single-sample.json', import.meta.url), 'utf8'))

test('single sample claims and verification results stay aligned', () => {
  assert.equal(sample.claims.length, 5)
  assert.equal(sample.sample_verify_results.length, sample.claims.length)
  sample.claims.forEach((claim, index) => {
    assert.equal(sample.sample_verify_results[index].claim, claim.claim)
  })
})

test('matched sample results contain only evidence actually cited by the diagnosis', () => {
  for (const result of sample.sample_verify_results.filter((item) => item.evidence_status === 'matched')) {
    assert.deepEqual(
      result.evidence.map((item) => item.id).sort(),
      [...result.cited_evidence_ids].sort(),
      result.claim,
    )
  }
})

test('not-found sample demonstrates an honest AI common-sense downgrade', () => {
  const result = sample.sample_verify_results.find((item) => item.evidence_status === 'not_found')
  assert.ok(result)
  assert.deepEqual(result.evidence, [])
  assert.deepEqual(result.cited_evidence_ids, [])
  assert.equal(result.strength, '低')
  assert.match(result.correction, /未命中已收录权威依据，以下为 AI 常识判断/)
  assert.ok(result.trace.some((step) => step.step === 'downgrade_common_sense' && step.tone === 'warn'))
})
