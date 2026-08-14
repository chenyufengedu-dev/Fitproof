import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../ProfileTab.tsx', import.meta.url), 'utf8')
const demoSource = readFileSync(new URL('../../lib/profileDemo.ts', import.meta.url), 'utf8')

// 这一组断言守的是「同源」：统计、等级、连续天数、话题、足迹、历史必须读同一份记录。
// 之前统计和历史读真实记录、话题和足迹读掺了演示数据的记录，于是页面上同时出现
// 「累计核验 0 条 / 还没有核验记录」和「话题各 4 条 + 满格足迹图」。
test('profile reads one record set for every derived number', () => {
  assert.match(source, /const isDemo = records\.length === 0/)
  assert.match(source, /const viewRecords = isDemo \? demoRecords : records/)

  for (const derived of [
    /const streak = useMemo\(\(\) => streakDays\(viewRecords\)/,
    /const level = useMemo\(\(\) => levelOf\(viewRecords\.length\)/,
    /const topics = useMemo\(\(\) => topicStats\(viewRecords\)/,
    /const grid = useMemo\(\(\) => heatmap\(viewRecords\)/,
    /全部: viewRecords\.length/,
    /value: viewRecords\.length/,
    /\{viewRecords\.length === 0 \? \(/,
    /viewRecords\s*\.filter\(\(record\) => record\.createdAt\.slice\(0, 10\) === dayCell\.date\)/s,
  ]) assert.match(source, derived)

  // 派生数字里不允许再直接读 records，否则又会分叉
  const forbidden = source.match(/(?:streakDays|levelOf|topicStats|heatmap)\(records/g)
  assert.equal(forbidden, null, `派生数字仍在直接读 records: ${forbidden}`)
})

// 导出和清空写的是真实 localStorage，演示态下无事可做，必须继续只看真实记录。
test('export and clear stay bound to the real records', () => {
  assert.match(source, /JSON\.stringify\(records, null, 2\)/)
  assert.match(source, /disabled=\{records\.length === 0\}/)
  assert.match(source, /清空全部 \$\{records\.length\} 条记录/)
})

// 演示态必须自报身份，否则「33 条记录却导不出」看着像功能坏了。
test('demo mode is labelled on screen', () => {
  assert.match(source, /\{isDemo && \(/)
  assert.match(source, /演示数据/)
})

test('demo seeds spread across days so the footprint shows varied intensity', () => {
  const days = [...demoSource.matchAll(/daysAgo: (\d+)/g)].map((match) => Number(match[1]))
  const frequencies = days.reduce((map, day) => map.set(day, (map.get(day) || 0) + 1), new Map())
  assert.ok(Math.max(...frequencies.values()) >= 2, '至少要有某一天出现多条，热力图才有深浅')
  assert.ok(days.length >= 30, '演示记录太少，统计和足迹都会显得空')
  assert.ok(Math.max(...days) >= 90, '演示记录要覆盖到较早的日期，最近 18 周才填得满')
})
