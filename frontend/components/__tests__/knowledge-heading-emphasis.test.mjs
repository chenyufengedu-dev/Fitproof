import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../KnowledgeTab.tsx', import.meta.url), 'utf8')

test('knowledge heading and approved contribution count use the theme color', () => {
  assert.match(source, /data-knowledge-title[^>]*className="[^"]*text-\[#0B6E63\]/s)
  assert.match(source, /data-approved-contribution-count[^>]*className="[^"]*t-body[^"]*font-black[^"]*text-\[#0B6E63\]/s)
  assert.match(source, /data-approved-contribution-count[^>]*>\{contributionStats\.approved\}<\/span>/s)
})
