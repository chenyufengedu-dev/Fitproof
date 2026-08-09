import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { resolvePosterFrontendRoot } from '../../app/api/share-poster/posterRoot.mjs'

const rendererParts = ['public', 'FitProof-share-9x16', 'poster', 'render_mobile_v9_6_9x16.js']

test('poster renderer resolves from a flattened production frontend directory', () => {
  const cwd = path.join(path.parse(process.cwd()).root, 'root', 'fitproof')
  const renderer = path.join(cwd, ...rendererParts)
  assert.equal(resolvePosterFrontendRoot(cwd, (candidate) => candidate === renderer), cwd)
})

test('poster renderer resolves from the frontend child when started at repository root', () => {
  const cwd = path.join(path.parse(process.cwd()).root, 'workspace', 'PointMap')
  const frontend = path.join(cwd, 'frontend')
  const renderer = path.join(frontend, ...rendererParts)
  assert.equal(resolvePosterFrontendRoot(cwd, (candidate) => candidate === renderer), frontend)
})
