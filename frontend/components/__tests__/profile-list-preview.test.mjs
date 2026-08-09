import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../ProfileTab.tsx', import.meta.url), 'utf8')

test('profile history defaults to three records and can expand', () => {
  assert.match(source, /const HISTORY_PREVIEW_LIMIT = 3/)
  assert.match(source, /showAll \? visible : visible\.slice\(0, HISTORY_PREVIEW_LIMIT\)/)
  assert.match(source, /visible\.length > HISTORY_PREVIEW_LIMIT/)
  assert.match(source, /data-profile-history-list/)
})

test('profile contributions default to three records and can expand independently', () => {
  assert.match(source, /const CONTRIBUTION_PREVIEW_LIMIT = 3/)
  assert.match(source, /const \[showAllContributions, setShowAllContributions\] = useState\(false\)/)
  assert.match(source, /showAllContributions \? contributions : contributions\.slice\(0, CONTRIBUTION_PREVIEW_LIMIT\)/)
  assert.match(source, /contributions\.length > CONTRIBUTION_PREVIEW_LIMIT/)
  assert.match(source, /data-profile-contribution-list/)
  assert.match(source, /aria-expanded=\{showAllContributions\}/)
})
