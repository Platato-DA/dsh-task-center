/**
 * Test runner: esbuild bundles the TypeScript test entry into one ESM file and
 * node runs it. Uses the same esbuild lookup as scripts/build.mjs, so the tests
 * need no install step of their own.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEsbuild } from './esbuild-bin.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const esbuild = resolveEsbuild(root)

const outDir = join(root, 'tests', 'out')
mkdirSync(outDir, { recursive: true })

// Every suite is bundled and run in its own process, so one failing file cannot
// hide the results of another and the exit code aggregates.
const suites = ['tests/engine.test.ts', 'tests/api.test.ts']
let failed = 0
for (const suite of suites) {
  const outfile = join(outDir, `${basename(suite, '.ts')}.mjs`)
  execFileSync(
    esbuild,
    [
      suite,
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--target=node20',
      '--packages=external',
      `--outfile=${outfile}`,
      '--log-level=warning',
    ],
    { stdio: 'inherit', cwd: root },
  )
  console.log(`\n▶ ${suite}`)
  try {
    execFileSync('node', [outfile], { stdio: 'inherit', cwd: root })
  } catch {
    failed += 1
  }
}
if (failed > 0) {
  console.error(`\n${failed} 个测试文件未通过`)
  process.exit(1)
}
