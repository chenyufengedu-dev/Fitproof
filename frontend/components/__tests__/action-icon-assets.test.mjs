import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../StepIcon.tsx', import.meta.url), 'utf8')

const actionIcons = [
  'home',
  'shower',
  'hairdryer',
  'bandage',
  'tub',
  'doctor',
  'stop',
  'thermometer',
  'hospital',
  'water',
  'food',
  'rest',
  'check',
  'general',
  'elliptical',
  'firstAid',
  'glucose',
  'jog',
  'snack',
  'toast',
]

test('single-video ActionIcon uses the icon-raw whitelist instead of the inline StepIcon alias', () => {
  assert.doesNotMatch(source, /export const ActionIcon = StepIcon/)
  assert.match(source, /const ACTION_ICON_ASSETS/)

  for (const icon of actionIcons) {
    assert.match(source, new RegExp(`${icon}: '/icon-raw/${icon}\\.svg'`))
    assert.equal(existsSync(new URL(`../../public/icon-raw/${icon}.svg`, import.meta.url)), true)
  }
})

test('ActionIcon colors raw SVG masks with the existing currentColor theme', () => {
  assert.match(source, /maskImage: `url\("\$\{asset\}"\)`/)
  assert.match(source, /WebkitMaskImage: `url\("\$\{asset\}"\)`/)
  assert.match(source, /backgroundColor: 'currentColor'/)
  assert.match(source, /maskRepeat: 'no-repeat'/)
  assert.match(source, /maskPosition: 'center'/)
  assert.match(source, /maskSize: 'contain'/)
})

test('the shared StepIcon keeps its existing inline SVG implementation', () => {
  assert.match(source, /export function StepIcon[\s\S]*?<svg className=\{className\}/)
  assert.match(source, /ICON_PATHS\[name \|\| 'general'\] \|\| ICON_PATHS\.general/)
})
