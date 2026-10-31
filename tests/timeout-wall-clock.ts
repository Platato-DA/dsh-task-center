/** Opt-in verification with real timers and controlled, nonresponsive Host seams. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { TaskEngine } from '../src/host/engine.ts'
import { TaskStore } from '../src/host/store.ts'
import type { Task } from '../src/shared/types.ts'

const minutes = Number(process.argv[2])
const output = process.argv[3] as string
const engineSourceSha256 = process.argv[4]
const durationMs = Math.round(minutes * 60_000)
assert.ok(Number.isFinite(durationMs) && durationMs >= 1200)
const started = performance.now()
const startedAt = new Date().toISOString()
const handlers = new Set<(session: unknown, event: unknown) => void>()
const requests = { sessions: 0, prompts: 0, cancels: 0, network: 0 }
const session = { id: 'instrumented-session', header: { cwd: output }, append: () => {} }
const never = (): Promise<never> => new Promise(() => {})
const host = {
  on: (_event: string, listener: (session: unknown, event: unknown) => void) => {
    handlers.add(listener)
    return () => { handlers.delete(listener) }
  },
  get: () => undefined,
  approval: { setPolicy: () => {} },
  sessionController: {
    create: async (request: { cwd: string }) => {
      requests.sessions += 1
      if (request.cwd.endsWith('preparation-hang')) return never()
      return { sessionId: session.id }
    },
    resolveAgent: async () => ({ session }),
    prompt: async () => { requests.prompts += 1; return never() },
    cancel: async () => { requests.cancels += 1; return never() },
  },
}
const store = new TaskStore(join(output, 'state.json'))
store.load()
const engine = new TaskEngine(host, store, {
  maxConcurrentRuns: 2, runHistory: 10, defaultTimeoutMinutes: minutes,
  graceSeconds: 90, dataRoot: output,
  log: (level, message) => {
    if (level === 'error') console.error(message)
  },
})

let concluding = false
let guard: ReturnType<typeof setTimeout>
let heartbeat: ReturnType<typeof setInterval>

async function conclude(guardExpired = false): Promise<void> {
  if (concluding) return
  concluding = true
  clearTimeout(guard)
  clearInterval(heartbeat)
  // finish() persists/notifies before making its best-effort cancellation call.
  await new Promise<void>((resolve) => setImmediate(resolve))
  const elapsedMs = performance.now() - started
  let error: string | null = null
  try {
    assert.equal(guardExpired, false, 'Verification exceeded the timeout plus safety margin')
    assert.equal(store.runs.length, 2)
    assert.ok(store.runs.every((run) => run.status === 'timeout'))
    assert.ok(store.runs.every((run) => run.error?.code === 'timeout'))
    assert.ok(store.runs.every((run) => (run.durationMs ?? 0) >= durationMs - 5), 'Must not expire early')
    assert.ok(store.runs.every((run) => (run.durationMs ?? Infinity) <= durationMs + 10_000), 'Unexpected timer lateness')
    assert.ok(store.runs.every((run) => Date.parse(String(run.timeoutAt)) - Date.parse(String(run.startedAt)) === durationMs))
    assert.equal(requests.prompts, 1, 'The preparation-hang scenario must never reach prompt')
    assert.equal(requests.cancels, 1, 'Only the scenario with a session should request cancellation')
    assert.equal(requests.network, 0)
    const persisted = JSON.parse(readFileSync(store.file, 'utf8')) as { runs: Array<{ status: string }> }
    assert.ok(persisted.runs.every((run) => run.status === 'timeout'), 'Outcomes must be durable even if cancel never returns')
  } catch (problem) {
    error = (problem as Error).message
    process.exitCode = 1
  }
  engine.dispose()
  const evidence = {
    ok: error === null, error, startedAt, endedAt: new Date().toISOString(), elapsedMs,
    minutes, node: process.version, engineSourceSha256,
    environment: 'Actual TaskEngine with instrumented Host seams; no real DSH or model provider',
    requests,
    runs: store.runs.map((run) => ({
      taskName: run.taskName, status: run.status, startedAt: run.startedAt,
      endedAt: run.endedAt, durationMs: run.durationMs, timeoutMinutes: run.timeoutMinutes,
      timeoutAt: run.timeoutAt, error: run.error,
    })),
    listenersAfterDispose: handlers.size,
  }
  writeFileSync(join(output, 'result.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence, null, 2))
}

await engine.start()
engine.onChange(() => {
  if (store.runs.length === 2 && store.runs.every((run) => run.status === 'timeout')) void conclude()
})
// Referenced observer keeps this opt-in process alive; engine timers use unref().
heartbeat = setInterval(() => {
  const elapsedMs = Math.round(performance.now() - started)
  writeFileSync(join(output, 'progress.json'), JSON.stringify({ elapsedMs, statuses: store.runs.map((run) => run.status) }) + '\n')
}, 1000)
guard = setTimeout(() => { void conclude(true) }, durationMs + 30_000)

for (const name of ['provider-hang', 'preparation-hang']) {
  const workspace = join(output, name)
  mkdirSync(workspace)
  const task: Task = {
    id: name, name, prompt: 'Instrumented timeout verification; no external provider',
    attachments: [], model: null, modelSource: 'legacy', reasoningEffort: null,
    workspace, workspaceId: null, workspaceSource: 'custom', sessionMode: 'independent',
    sessionId: null, sessionModelKey: null, permissionPreset: null, permissionSource: 'legacy',
    permission: { approval: 'never', sandbox: 'workspace-write' }, legacyIssues: [],
    schedule: { kind: 'daily', time: '09:00' }, timeZone: 'UTC', startAt: null, endAt: null,
    missedPolicy: 'skip', enabled: false, maxRetries: 0, timeoutMinutes: minutes,
    createdAt: startedAt, updatedAt: startedAt, nextRunAt: null, lastRunAt: null,
    lastRunStatus: null, lastError: null, templateId: null,
  }
  const saved = engine.saveTask(task)
  assert.ok(saved.ok, saved.ok ? '' : saved.message)
  assert.ok(engine.runNow(name).ok)
}
