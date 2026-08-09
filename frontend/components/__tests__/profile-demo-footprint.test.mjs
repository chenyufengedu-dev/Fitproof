import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../ProfileTab.tsx', import.meta.url), 'utf8')
const demoSource = readFileSync(new URL('../../lib/profileDemo.ts', import.meta.url), 'utf8')

test('profile demo data enriches the footprint, day details, and topic podium', () => {
  assert.match(source, /import \{ demoFootprintHistory, demoHistory \} from '@\/lib\/profileDemo'/)
  assert.match(source, /const demoFootprintRecords = useMemo\(\(\) => demoFootprintHistory\(\), \[\]\)/)
  assert.match(source, /const footprintRecords = useMemo\(\(\) => \[\.\.\.records, \.\.\.demoFootprintRecords\], \[records, demoFootprintRecords\]\)/)
  assert.match(source, /const grid = useMemo\(\(\) => heatmap\(footprintRecords\), \[footprintRecords\]\)/)
  assert.match(source, /const demoTopicRecords = useMemo\(\(\) => demoHistory\(\), \[\]\)/)
  assert.match(source, /const topicRecords = useMemo\(\(\) => \[\.\.\.records, \.\.\.demoTopicRecords\], \[records, demoTopicRecords\]\)/)
  assert.match(source, /const topics = useMemo\(\(\) => topicStats\(topicRecords\), \[topicRecords\]\)/)
  assert.match(source, /footprintRecords\s*\.filter\(\(record\) => record\.createdAt\.slice\(0, 10\) === dayCell\.date\)/s)
  assert.match(source, /const stats = \[/)
  assert.match(source, /value: records\.length/)
})

test('demo footprint contains varied daily intensity instead of a single flat shade', () => {
  const days = [...demoSource.matchAll(/daysAgo: (\d+)/g)].map((match) => Number(match[1]))
  const frequencies = days.reduce((map, day) => map.set(day, (map.get(day) || 0) + 1), new Map())
  assert.ok(Math.max(...frequencies.values()) >= 3)
  assert.ok([...frequencies.values()].some((count) => count === 2))
  assert.match(demoSource, /export function demoFootprintHistory\(\): HistoryRecord\[\]/)
  assert.match(demoSource, /const EXTRA_ACTIVITY_DAYS/)
})
