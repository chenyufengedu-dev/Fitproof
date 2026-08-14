import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { singleResultSource } from './_singleSource.mjs'

const source = singleResultSource

test('action advice cards use compact vertical rhythm without shrinking their content', () => {
  assert.match(source, /return <div className="action-advice-density space-y-2\.5">/)
  assert.match(source, /\.action-advice-density > section \{ padding: 0\.625rem 0\.75rem; \}/)
  assert.match(source, /\.action-advice-density > section > header \{ gap: 0\.375rem; \}/)
  assert.match(source, /\.action-advice-density > section > \.border-y \{ margin-top: 0\.5rem; padding-top: 0\.5rem; padding-bottom: 0\.5rem; \}/)
  assert.match(source, /\.action-advice-density > section > \.border-y > div \{ margin-top: 0\.375rem; gap: 0\.375rem; padding-bottom: 0\.125rem; \}/)
  assert.match(source, /\.action-advice-density > section > \.border-y > div > div \{ gap: 0\.375rem; \}/)
  assert.match(source, /\.action-advice-density > section > \.border-y > div > div > div > div \{ margin-top: 0\.125rem; \}/)
  assert.match(source, /\.action-advice-density > section > \.text-slate-600 \{ margin-top: 0\.375rem; gap: 0\.375rem; \}/)
  assert.match(source, /\.action-advice-density > section > \.border-t \{ margin-top: 0\.375rem; padding-top: 0\.375rem; gap: 0\.25rem; \}/)

  assert.match(source, /<ActionIcon name=\{step\.icon\} className=\{"mx-auto h-8 w-8 " \+ tone\.text\}/)
  assert.match(source, /data-action-condition className="t-body min-w-0 flex-1 font-black text-slate-900"/)
})
