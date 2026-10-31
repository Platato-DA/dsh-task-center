import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Locate esbuild without hard-coding a machine-specific path: an explicit
 * ESBUILD_BIN wins, then the project's own install, then a local bin on PATH.
 */
export function resolveEsbuild(root = process.cwd()) {
  if (process.env.ESBUILD_BIN) return process.env.ESBUILD_BIN
  const local = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild')
  if (existsSync(local)) return local
  return process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'
}
