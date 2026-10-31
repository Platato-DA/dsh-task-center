/** Real elapsed-time verification of the actual engine; no DSH or model calls. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEsbuild } from './esbuild-bin.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const raw = process.argv.find((arg) => arg.startsWith('--minutes='))?.slice('--minutes='.length) ?? '20'
const minutes = Number(raw)
if (!Number.isFinite(minutes) || minutes < 0.02 || minutes > 60) {
  throw new Error('Use --minutes=<0.02..60>; the default is a real 20-minute wait')
}
mkdirSync(join(root, '.local'), { recursive: true })
const output = mkdtempSync(join(root, '.local', 'timeout-wall-clock-'))
const entry = join(output, 'verification.mjs')
execFileSync(resolveEsbuild(root), [
  'tests/timeout-wall-clock.ts', '--bundle', '--platform=node', '--format=esm',
  '--target=node22', '--packages=external', `--outfile=${entry}`, '--log-level=warning',
], { cwd: root, stdio: 'inherit' })
const sourceSha = createHash('sha256').update(readFileSync(join(root, 'src/host/engine.ts'))).digest('hex')
console.log(`Real elapsed-time check: ${minutes} minutes; no provider/network calls. Evidence: ${output}`)
execFileSync(process.execPath, [entry, String(minutes), output, sourceSha], { cwd: root, stdio: 'inherit' })
