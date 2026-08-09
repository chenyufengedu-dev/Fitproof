import assert from 'node:assert/strict'
import test from 'node:test'

import { createAnonymousClientId } from '../../lib/clientId.mjs'

test('creates an anonymous client id when randomUUID is unavailable on an HTTP origin', () => {
  let next = 0
  const cryptoLike = {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = next++
      return bytes
    },
  }

  const clientId = createAnonymousClientId(cryptoLike)

  assert.match(clientId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('uses randomUUID when the browser provides it', () => {
  const expected = '123e4567-e89b-42d3-a456-426614174000'
  assert.equal(createAnonymousClientId({ randomUUID: () => expected }), expected)
})
