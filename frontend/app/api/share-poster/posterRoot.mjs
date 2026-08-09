import { existsSync } from 'node:fs'
import path from 'node:path'

const RENDERER_PARTS = [
  'public',
  'FitProof-share-9x16',
  'poster',
  'render_mobile_v9_6_9x16.js',
]

/** Resolve both flattened deployments and repository-root development starts. */
export function resolvePosterFrontendRoot(cwd, exists = existsSync) {
  const candidates = [cwd, path.join(cwd, 'frontend')]
  return candidates.find((candidate) => exists(path.join(candidate, ...RENDERER_PARTS))) || cwd
}
