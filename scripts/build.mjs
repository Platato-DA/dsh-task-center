/**
 * Two-artifact build, no dsh checkout required.
 *
 *  - lib/impl.js    … Host plugin: one ESM file, every dependency external.
 *  - lib/client.js  … Browser plugin: one CJS file wrapped in the Host's
 *                     `window.__ModuleLoader__.load({ id, factory })` envelope,
 *                     with React left to the shared registry.
 *
 * esbuild is looked up through $ESBUILD_BIN or the project's own install
 * checkout, so this works on a machine without a DSH source checkout.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEsbuild } from './esbuild-bin.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const pkg = manifest.name
const outDir = join(root, 'lib')
mkdirSync(outDir, { recursive: true })

const esbuild = resolveEsbuild(root)

const clientOnly = process.argv.includes('--client-only')

function run(args) {
  execFileSync(esbuild, args, { stdio: 'inherit', cwd: root })
}

/**
 * The Host entry is a stable two-file pair:
 *   lib/index.js … never-changing shim that imports the implementation with a
 *                  per-load query (Node's ESM registry caches by URL, so this
 *                  is what makes a rebuild visible without restarting DSH).
 *   lib/impl.js  … the real plugin, rebuilt on every `npm run build`.
 */
const shim = `// Stable Host entry: the implementation is imported with a per-load query so a
// rebuild is picked up on the next load without restarting DSH (Node's ESM
// registry caches modules by URL). Keep this file's exports stable.
export const name = 'dsh-task-center'
export { inject } from './impl.js'

const impl = await import(new URL(\`./impl.js?v=\${Date.now()}\`, import.meta.url).href)

export const apply = impl.apply
`

if (!clientOnly) {
  run([
    'src/index.ts',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    '--packages=external',
    '--sourcemap',
    `--outfile=${join(outDir, 'impl.js')}`,
    '--log-level=warning',
  ])
  writeFileSync(join(outDir, 'index.js'), shim, 'utf8')
  console.log('✓ lib/impl.js + lib/index.js')
}

// The client is built to memory so the loader envelope can be added verbatim.
execFileSync(
  esbuild,
  [
    'src/client/index.tsx',
    '--bundle',
    '--platform=browser',
    '--format=cjs',
    '--target=es2020',
    '--jsx=automatic',
    '--define:process.env.NODE_ENV="production"',
    '--external:react',
    '--external:react-dom',
    '--external:react/jsx-runtime',
    `--outfile=${join(outDir, 'client.js')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit', cwd: root },
)

const built = execFileSync('node', [
  '-e',
  `const fs=require('node:fs');const p=${JSON.stringify(join(outDir, 'client.js'))};process.stdout.write(fs.readFileSync(p,'utf8'))`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const envelope = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${built
  .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
  .split('\n')
  .map((line) => (line.length === 0 ? '' : `\t\t${line}`))
  .join('\n')}
\t\treturn module.exports;
\t}
});
`
writeFileSync(join(outDir, 'client.js'), envelope, 'utf8')
console.log('✓ lib/client.js')
