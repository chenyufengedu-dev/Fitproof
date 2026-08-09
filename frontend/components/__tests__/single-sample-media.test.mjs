import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const sample = JSON.parse(readFileSync(new URL('../../data/single-sample.json', import.meta.url), 'utf8'))
const publicRoot = new URL('../../public/', import.meta.url)

function localAssetPath(value) {
  assert.match(value, /^\/[a-z0-9/_-]+\.(?:png|webp|svg)$/i)
  return new URL(value.slice(1), publicRoot)
}

test('offline sample includes deployable local avatar and cover assets', () => {
  const avatar = sample.reference.author_avatar_url
  const cover = sample.keyframes.find((frame) => frame.image)?.image

  assert.ok(avatar, 'sample author avatar is required')
  assert.ok(cover, 'sample cover image is required')
  assert.equal(existsSync(localAssetPath(avatar)), true, `missing avatar asset: ${avatar}`)
  assert.equal(existsSync(localAssetPath(cover)), true, `missing cover asset: ${cover}`)
})
