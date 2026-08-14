import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { singleResultSource } from './_singleSource.mjs'

const diagnosisSource = singleResultSource
const authoritySource = diagnosisSource.slice(
  diagnosisSource.indexOf('function AuthorityDiagnosisCard'),
  diagnosisSource.indexOf('function ConfrontationCard'),
)
const strengthSource = readFileSync(new URL('../verify/EvidenceStrength.tsx', import.meta.url), 'utf8')
const originSource = readFileSync(new URL('../verify/ClaimOrigin.tsx', import.meta.url), 'utf8')

test('authority diagnosis expands the evidence-insufficient verdict into an actionable summary', () => {
  assert.match(diagnosisSource, /证据不足，不建议采纳/)
})

test('authority diagnosis keeps the verdict stamp without adding a decorative authority badge', () => {
  assert.match(diagnosisSource, /data-verdict-stamp/)
  assert.match(diagnosisSource, /h-\[84px\] w-\[84px\]/)
  assert.doesNotMatch(authoritySource, /data-authority-shield/)
})

test('retrieval ladder separates rows and supports neutral clinical and teal default selected badges', () => {
  assert.match(strengthSource, /divide-y divide-\[#E5EBEA\]/)
  assert.match(strengthSource, /clinical \? 'bg-\[#E9EDF1\] text-\[#425166\]' : 'bg-\[#E2F5F1\] text-\[#0B6E63\]'/)
  assert.match(strengthSource, /clinical \? '#586779' : '#10B89F'/)
})

test('claim origin has a semantic icon and separates mechanism metadata from explanation', () => {
  assert.match(originSource, /data-origin-icon/)
  assert.match(originSource, /data-icon-variant="document-search"/)
  assert.match(originSource, /bg-\[#E8F7F4\][^"\n]*text-\[#087F76\]/)
  assert.match(originSource, /data-origin-mechanism/)
  assert.match(originSource, /data-origin-mechanism className="mt-2 flex min-w-0 items-center/)
  assert.doesNotMatch(originSource, /data-origin-mechanism className="[^"]*border/)
  assert.match(originSource, /clinical \? 'border-\[#AEB8C2\] text-\[#435160\]' : 'border-\[#8DDDD2\] text-\[#4A5A70\]'/)
})

test('corrected wording is a plain report section without another icon tile', () => {
  assert.match(diagnosisSource, /data-correction-icon/)
  assert.doesNotMatch(authoritySource, /data-correction-icon[^\n]*<svg/)
  assert.match(diagnosisSource, /shadow-\[0_4px_14px_rgba\(38,50,63,0\.06\)\]/)
})

test('authority evidence is presented as a flat clinical record instead of a nested AI dashboard', () => {
  assert.match(diagnosisSource, /data-clinical-report/)
  assert.match(diagnosisSource, /data-report-conclusion/)
  assert.match(diagnosisSource, /核验结论/)
  assert.doesNotMatch(authoritySource, /证据评估报告/)
  assert.doesNotMatch(authoritySource, /权威诊断 · 数据库结论/)
  assert.doesNotMatch(authoritySource, /uppercase tracking-\[0\.2em\]/)
  assert.match(diagnosisSource, /data-clinical-citations/)
  assert.match(diagnosisSource, /variant="clinical"/)
  assert.match(strengthSource, /variant\?: 'default' \| 'clinical'/)
  assert.match(strengthSource, /clinical \? '#586779'/)
})

test('display verdict uses exactly the same risk color as the stamp', () => {
  assert.match(diagnosisSource, /data-diagnosis-verdict/)
  assert.match(authoritySource, /const riskColor = stampTone\(result\.risk_level\)/)
  assert.match(authoritySource, /data-diagnosis-verdict[^\n]*style=\{\{ color: riskColor \}\}/)
})

test('the complete diagnosis report uses one neutral clinical palette below the verdict', () => {
  assert.match(diagnosisSource, /<ClaimOrigin origin=\{origin\} embedded variant="clinical"/)
  assert.match(originSource, /variant\?: 'default' \| 'clinical'/)
  assert.match(originSource, /推断性解释，非权威依据/)
  assert.doesNotMatch(authoritySource, /data-correction-icon[^\n]*rounded/)
  assert.match(diagnosisSource, /更准确的说法<\/p>/)
  assert.doesNotMatch(authoritySource, /const tone =/)
})

test('clinical report uses a quiet paper surface above the decorative page particles', () => {
  assert.match(diagnosisSource, /data-clinical-report className="relative z-\[1\][^"\n]*bg-\[#FFFEFC\]/)
  assert.doesNotMatch(authoritySource, /rounded-\[6px\] border border-\[#D6DCE1\] bg-white py-2/)
})
