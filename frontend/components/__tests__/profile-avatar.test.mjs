import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../ProfileTab.tsx', import.meta.url), 'utf8')

test('profile header uses the doctor cat inside the existing mint avatar frame', () => {
  assert.match(source, /src="\/brand\/cat-doctor-transparent\.png"/)
  assert.match(source, /bg-\[#DCF0EC\]/)
  assert.match(source, /overflow-hidden/)
  assert.match(source, /h-\[92px\] w-\[92px\]/)
  assert.match(source, /-translate-x-\[11\.5px\]/)
})
