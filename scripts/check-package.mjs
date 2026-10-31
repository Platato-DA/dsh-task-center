/** Verify the exact installable package, without starting DSH or calling a model. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = mkdtempSync(join(tmpdir(), 'dsh-task-center-package-'))
try {
  const [packed] = JSON.parse(execFileSync('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', temporary,
  ], { cwd: root, encoding: 'utf8' }))
  const required = [
    'package.json', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.en.md',
    'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md',
    'lib/index.js', 'lib/impl.js', 'lib/impl.js.map', 'lib/client.js',
  ]
  const paths = packed.files.map((file) => file.path).sort()
  assert.deepEqual(paths, required.sort(), 'The release must contain only the reviewed runtime and documentation files')
  execFileSync('tar', ['-xzf', join(temporary, packed.filename), '-C', temporary])
  const extracted = join(temporary, 'package')
  const manifest = JSON.parse(readFileSync(join(extracted, 'package.json'), 'utf8'))
  assert.ok(existsSync(join(extracted, manifest.main)))
  assert.ok(existsSync(join(extracted, manifest.dsh.bundle.patch)))
  assert.equal(manifest.license, 'BSD-3-Clause')
  assert.equal(manifest.engines.dsh, '0.2.1-rc.5')
  assert.ok(!manifest.scripts.prepare && !manifest.scripts.install && !manifest.scripts.postinstall,
    'Installing the prebuilt package must not run a build script')
  const plugin = await import(pathToFileURL(join(extracted, manifest.main)).href)
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(plugin.inject.includes('approval'))
  const map = JSON.parse(readFileSync(join(extracted, 'lib/impl.js.map'), 'utf8'))
  assert.ok(map.sources.every((source) => !source.startsWith('/') && !/^[A-Za-z]:/.test(source)),
    'Source maps must not contain absolute local paths')
  console.log(`Package verified: ${packed.filename} (${paths.length} files, ${packed.size} bytes)`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
