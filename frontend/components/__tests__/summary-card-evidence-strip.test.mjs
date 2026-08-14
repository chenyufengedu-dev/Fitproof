import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { singleResultSource } from './_singleSource.mjs'

const source = singleResultSource

test('summary claim art is borderless, larger, and uses quiet quote typography', () => {
  assert.match(source, /borderless imageClassName="h-\[88%\] w-\[88%\]"/)
  assert.match(source, /data-summary-quote/)
  assert.match(source, /data-summary-quote-mark/)
  assert.match(source, /text-\[#20B8A8\]/)
  assert.match(source, /data-summary-quote-mark[^>]*className="[^"]*t-verdict/s)
  assert.match(source, /data-summary-quote-mark[^>]*style=\{\{ fontWeight: 900 \}\}/s)
  assert.match(source, /data-summary-quote[^>]*className="[^"]*t-label/s)
})

test('accurate wording uses the larger reference shield and smaller copy', () => {
  assert.match(source, /data-accurate-shield/)
  assert.match(source, /data-accurate-shield[^>]*className="h-8 w-8/s)
  assert.match(source, /data-accurate-copy[^>]*className="[^"]*t-meta/s)
  assert.match(source, /data-accurate-title[^>]*className="[^"]*t-meta/s)
})

test('each summary card exposes three real-data facts', () => {
  assert.match(source, /data-summary-evidence/)
  assert.match(source, /data-summary-status/)
  assert.match(source, /data-summary-action/)
  assert.match(source, /result\.evidence\?\.\[0\]/)
  assert.match(source, /result\.evidence_status === 'not_found'/)
  assert.match(source, /action\.claim_indices\.includes\(index\)/)
  assert.match(source, /relatedAction\?\.steps\?\.\[0\]\?\.title/)
})

test('summary receives generated actions without inventing a new backend field', () => {
  assert.match(source, /<SummaryCard[^>]*actions=\{singleActions\}[^>]*actionsLoading=\{actionsLoading\}/s)
  assert.doesNotMatch(source, /applicableConditionCount/)
})

test('summary completion bar and compact cards follow the approved hierarchy', () => {
  assert.match(source, /data-summary-completion/)
  assert.match(source, /已完成高风险筛查与纠偏建议整理/)
  assert.match(source, /输出重点误导风险/)
  assert.match(source, /<article className="rounded-\[10px\]/)
})

test('three evidence facts are centered and share the cyan icon-title color', () => {
  assert.match(source, /data-summary-fact/)
  assert.match(source, /data-summary-fact[^>]*className="[^"]*justify-center/s)
  assert.match(source, /data-summary-fact-label[^>]*className="[^"]*text-\[#0BAA98\]/s)
  assert.match(source, /data-summary-fact-label[^>]*className="[^"]*text-left/s)
  assert.match(source, /data-summary-fact-value[^>]*className="[^"]*text-left/s)
})

test('summary avatar aligns with the diagnosis pill and the pill has a leading cue icon', () => {
  assert.match(source, /data-summary-diagnosis-icon/)
  assert.match(source, /<ClaimIcon icon=\{resolvedClaimIcon\(claim\)\} borderless imageClassName="h-\[88%\] w-\[88%\]" className="[^"]*shadow-\[/)
})

test('each footer fact centers its icon and text as one intrinsic group', () => {
  assert.match(source, /data-summary-fact[^>]*className="[^"]*w-fit[^"]*max-w-full[^"]*items-start/s)
  assert.match(source, /data-summary-evidence className="[^"]*justify-center/s)
  assert.match(source, /data-summary-status className="[^"]*justify-center/s)
  assert.match(source, /data-summary-action className="[^"]*justify-center/s)
})
