/** macOS desktop Host probe: bounded boot, optional idle observation, owned-process cleanup. */
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [profileArg, timeoutArg = '20000', observeArg = '30000'] = process.argv.slice(2)
const timeoutMs = Number(timeoutArg)
const observeMs = Number(observeArg)
if (!profileArg || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 ||
    !Number.isInteger(observeMs) || observeMs < 0 || observeMs > 120000) {
  console.error('Usage: npm run verify:boot -- PROFILE [bootTimeoutMs=20000] [observeMs=30000]')
  process.exit(1)
}
if (process.platform !== 'darwin') throw new Error('This probe uses the macOS desktop Host and ps.')

const profile = resolve(profileArg)
const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
const enabled = manifest.dsh?.profile?.bundles?.includes('@dsh-external/dsh-task-center') === true
if (enabled) {
  const plugin = realpathSync(join(profile, 'node_modules/@dsh-external/dsh-task-center'))
  for (const file of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/impl.js', 'lib/client.js']) {
    const path = join(plugin, file)
    // SF_DATALESS is available from stat without reading/hydrating the file.
    const flags = Number(execFileSync('/usr/bin/stat', ['-L', '-f', '%f', path], { encoding: 'utf8' }).trim())
    if ((flags & 0x40000000) !== 0) {
      console.error(`UNAVAILABLE_FILE ${path}: iCloud placeholder; download it before starting the Host.`)
      process.exit(1)
    }
  }
}

const app = process.env.DSH_DESKTOP_APP ?? '/Applications/DeepSeek Harness.app'
const executable = join(app, 'Contents/MacOS/DeepSeek Harness')
const runtime = join(app, 'Contents/Resources/app.asar/dsh')
const primary = join(app, 'Contents/Resources/runtime/primary-runtime')
const bin = join(app, 'Contents/Resources/runtime/bin')
const started = performance.now()
let verdict = 'HANG', readyMs = null, stopping = false, highCpuSeconds = 0
let stopTimer, forceTimer
const samples = []
const child = spawn(executable, [
  '--expose-internals', join(runtime, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'),
  runtime, profile, primary, join(primary, 'dependencies/pnpm/bin/pnpm.mjs'), bin,
], {
  cwd: profile,
  detached: true,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_NODE_EXECUTABLE: executable,
    DSH_CLIENT_VERSION: '0.2.1-rc.5',
    PATH: `${bin}:${process.env.PATH ?? ''}`,
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
})
console.log(`HOST_PID ${child.pid}`)
const output = (chunk) => process.stdout.write(chunk.toString().replace(/([?&]token=)[^\s"'<>]+/g, '$1<REDACTED>'))
child.stdout.on('data', output)
child.stderr.on('data', output)

function signalOwnedGroup(signal) {
  if (!child.pid) return
  try { process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error }
}
function stop() {
  if (stopping) return
  stopping = true
  clearTimeout(bootTimer)
  clearTimeout(stopTimer)
  clearInterval(cpuTimer)
  signalOwnedGroup('SIGTERM')
  forceTimer = setTimeout(() => signalOwnedGroup('SIGKILL'), 1500)
}
const bootTimer = setTimeout(() => {
  console.error(`HANG: no ready within ${timeoutMs}ms`)
  stop()
}, timeoutMs)
const cpuTimer = setInterval(() => {
  try {
    const cpu = Number(execFileSync('/bin/ps', ['-p', String(child.pid), '-o', '%cpu='], { encoding: 'utf8' }).trim())
    samples.push({ ms: Math.round(performance.now() - started), cpu })
    if (readyMs !== null && performance.now() - started - readyMs >= 5000) {
      highCpuSeconds = cpu >= 90 ? highCpuSeconds + 1 : 0
      if (highCpuSeconds >= 5) {
        verdict = 'CPU_SPIN'
        stop()
      }
    }
  } catch { /* The close handler reports an exited Host. */ }
}, 1000)
child.on('message', async (message) => {
  if (message.type === 'fatal') {
    verdict = 'FATAL'
    output(`${message.message}\n`)
    stop()
  } else if (message.type === 'ready' && readyMs === null && !stopping) {
    readyMs = Math.round(performance.now() - started)
    verdict = 'READY'
    clearTimeout(bootTimer)
    console.log(`READY after ${readyMs}ms`)
    if (enabled) {
      try {
        const url = new URL('/dsh-task-center/ping', message.url)
        url.search = new URL(message.url).search
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (!response.ok || (await response.json()).value?.pong !== true) throw new Error('plugin ping failed')
        console.log('PLUGIN_PING 200 pong=true')
      } catch (error) {
        verdict = 'PLUGIN_API_FAILED'
        console.error(error.message)
        stop()
        return
      }
    }
    if (!stopping) stopTimer = setTimeout(stop, observeMs)
  }
})
child.on('error', (error) => {
  verdict = 'ERROR'
  console.error(error.message)
  stop()
})
child.on('close', () => {
  clearTimeout(bootTimer)
  clearTimeout(stopTimer)
  clearTimeout(forceTimer)
  clearInterval(cpuTimer)
  // Reap any descendants that outlived the Host; only this probe's group is targeted.
  signalOwnedGroup('SIGKILL')
  console.log(JSON.stringify({ verdict, readyMs, elapsedMs: Math.round(performance.now() - started), samples }))
  process.exitCode = verdict === 'READY' ? 0 : 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { verdict = 'INTERRUPTED'; stop() })
