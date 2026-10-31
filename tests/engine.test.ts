/**
 * Deterministic tests for the scheduler + run engine, with a controllable clock
 * and a fake Host. No DSH, no network, no real model: every assertion here is
 * about *our* state machine (occurrence math, catch-up, retry, timeout,
 * serialization, restart recovery), which is exactly what must not be tested by
 * vibe-checking a live run.
 *
 *   node scripts/test.mjs
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TaskEngine } from '../src/host/engine.ts'
import { TaskStore } from '../src/host/store.ts'
import { registerTools } from '../src/host/tools.ts'
import { readHistory, readReminders, deleteReminder, updateReminder } from '../src/host/reminders.ts'
import { describeSchedule, nextOccurrence, parseCron, previousOccurrence, withinWindow } from '../src/host/time.ts'
import type { Run, Task } from '../src/shared/types.ts'

/* ------------------------------------------------------------------ harness */

let failures = 0
let passes = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passes += 1
    console.log(`  ✓ ${name}`)
    return
  }
  failures += 1
  console.log(`  ✗ ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

function eq(name: string, actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  check(name, left === right, `期望 ${right}，实际 ${left}`)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface FakeSession {
  id: string
  cwd: string
  header: { cwd: string }
  appended: Array<{ type: string; data: unknown }>
  append: (type: string, data: unknown) => void
}

/** A Host stand-in that can complete, fail, hang, or time out a turn. */
class FakeHost {
  handlers = new Map<string, Array<(...args: any[]) => void>>()
  sessions = new Map<string, FakeSession>()
  promptCount = 0
  cancels = 0
  private counter = 0
  /** What the next turn does: complete, fail, or hang until cancelled. */
  behaviour: 'complete' | 'fail' | 'hang' | 'approval' = 'complete'
  /** Files the fake agent writes into its working folder. */
  written: string[] = []
  policyCalls: Array<{ sessionId: string; policy: string }> = []
  /** Mirror the real controller: `{ agent }` wrappers and `{ error }` replies. */
  wrapAgent = false
  /** When set, resolveAgent answers `{ error: { message } }` like a dead Session. */
  resolveError: string | null = null
  /** Make session creation hang, standing in for a slow Session resume. */
  hangCreate = false
  /** Model pins the engine applied per agent (the real seam, not the global one). */
  modelPins: Array<{ sessionId: string; provider: string; model: string }> = []
  /** Display name the fake catalog publishes for each model (real reasoning shape). */
  catalogModels: Array<{
    id: string
    name: string
    reasoning?: { efforts: Array<{ id: string; name: string; description?: string }>; defaultEffort?: string }
  }> = [
    { id: 'model-a', name: 'Model A' },
    {
      id: 'model-b',
      name: 'Model B',
      reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'high' },
    },
  ]
  /** Host default model at the moment a task is created. */
  defaultSelection: { provider: string; model: string; reasoningEffort?: string } = { provider: 'fake', model: 'model-a' }
  /** Registered Host workspaces (id/title/path). */
  workspaces: Array<{ id: string; title: string; path: string }> = []
  /** Native permission presets as the Host publishes them. */
  presetCatalog: Array<{ value: string; name: string; description?: string }> = [
    { value: 'read-only', name: '仅可查看' },
    { value: 'workspace-write', name: '工作区内修改' },
    { value: 'danger-full-access', name: '完全权限' },
  ]
  presetSpecs: Record<string, { sandbox: string; approval: string }> = {
    'read-only': { sandbox: 'read-only', approval: 'ask' },
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
    'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
  }
  /** Presets the engine applied to a task Session. */
  presetSets: Array<{ sessionId: string; preset: string }> = []
  /** Set to make the per-agent pin seam disappear, like a Host without it. */
  noAgentPin = false
  /** How often the global（write-back）selectModel was used — must stay 0. */
  selectModelCalls = 0

  on(event: string, listener: (...args: any[]) => void): () => void {
    const list = this.handlers.get(event) ?? []
    list.push(listener)
    this.handlers.set(event, list)
    return () => {
      const index = list.indexOf(listener)
      if (index >= 0) list.splice(index, 1)
    }
  }

  emit(event: string, ...args: any[]): void {
    for (const listener of this.handlers.get(event) ?? []) listener(...args)
  }

  get(name: string, _strict?: boolean): unknown {
    if (name === 'agentDefaultModel') {
      return { currentSelection: () => this.defaultSelection }
    }
    if (name === 'workspaceRegistry') {
      return {
        list: () => this.workspaces,
        get: (id: string) => this.workspaces.find((entry) => entry.id === id),
        resolveByPath: async (path: string) => this.workspaces.find((entry) => entry.path === path) ?? null,
        create: async (path: string) => {
          const entry = { id: `ws-${this.workspaces.length + 1}`, title: path.split('/').pop() ?? path, path }
          this.workspaces.push(entry)
          return entry
        },
      }
    }
    if (name === 'permissionPresets') {
      return {
        catalog: () => ({ options: this.presetCatalog, defaultOptions: this.presetCatalog, defaultPreset: 'workspace-write' }),
        resolve: (preset: string) => {
          const spec = this.presetSpecs[preset]
          if (spec === undefined) throw new Error(`permission: unknown preset "${preset}"`)
          return spec
        },
        set: (session: { id: string }, preset: string) => {
          this.presetSets.push({ sessionId: session.id, preset })
        },
        current: () => 'custom',
      }
    }
    if (name === 'workingDirectory') return { defaultDirectory: '/host/default-workspace' }
    return undefined
  }

  approval = {
    setPolicy: (agent: { session: FakeSession }, policy: string): void => {
      this.policyCalls.push({ sessionId: agent.session.id, policy })
    },
  }

  sessionController = {
    create: async (request: { cwd?: string }): Promise<{ sessionId: string }> => {
      if (this.hangCreate) return new Promise<never>(() => {})
      this.counter += 1
      const id = `session-${this.counter}`
      const cwd = request.cwd ?? '/tmp'
      const session: FakeSession = {
        id,
        cwd,
        header: { cwd },
        appended: [],
        append: (type: string, data: unknown) => {
          session.appended.push({ type, data })
        },
      }
      this.sessions.set(id, session)
      return { sessionId: id }
    },
    resolveAgent: async (sessionId: string): Promise<unknown> => {
      if (this.resolveError !== null) return { error: { message: this.resolveError } }
      const session = this.sessions.get(sessionId)
      if (session === undefined) return { error: { message: `session ${sessionId} not found` } }
      return this.wrapAgent ? { agent: { session } } : { session }
    },
    selectModel: async (): Promise<unknown> => {
      this.selectModelCalls += 1
      return { ok: true }
    },
    agents: {
      // Tests delete this property to mimic a Host without the per-agent seam.
      selectForNextRequest: (agent: { session: FakeSession }, selection: { provider: string; model: string }): void => {
        if (this.noAgentPin) return
        this.modelPins.push({ sessionId: agent.session.id, provider: selection.provider, model: selection.model })
      },
    },
    modelCatalog: async (): Promise<unknown> => ({
      default: { provider: 'fake', model: 'model-a' },
      routableProviders: ['fake'],
      groups: [{ id: 'fake', name: 'Fake', models: this.catalogModels }],
      failures: [],
    }),
    cancel: async ({ sessionId }: { sessionId: string }): Promise<unknown> => {
      this.cancels += 1
      const session = this.sessions.get(sessionId)
      queueMicrotask(() => {
        if (session !== undefined) {
          this.emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } })
        }
      })
      return { sessionId }
    },
    prompt: async (request: { sessionId: string }): Promise<unknown> => {
      this.promptCount += 1
      const session = this.sessions.get(request.sessionId)
      if (session === undefined) throw new Error('no session')
      const behaviour = this.behaviour
      const written = [...this.written]
      setTimeout(() => {
        this.emit('session/event', session, { type: 'turn/start', data: { turn: 1 } })
        this.emit('session/event', session, {
          type: 'tool/call',
          data: { turn: 1, step: 1, callId: 'c1', name: 'web_search', arguments: { query: 'ai' } },
        })
        this.emit('session/event', session, {
          type: 'assistant/message',
          data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '完成了一轮工作' }] } },
        })
        for (const path of written) {
          try {
            writeFileSync(path, '<html>artifacts</html>', 'utf8')
          } catch {
            /* the folder may be gone */
          }
        }
        if (behaviour === 'hang') return
        if (behaviour === 'approval') {
          // A run that must ask first: the engine has to record the wait, then
          // resume when the answer arrives, and still finish normally.
          this.emit('session/event', session, {
            type: 'approval/asked',
            data: { turn: 1, callId: 'c1', title: '运行命令需要授权' },
          })
          setTimeout(() => {
            this.emit('session/event', session, {
              type: 'approval/decided',
              data: { turn: 1, callId: 'c1', outcome: 'allowed-once' },
            })
            this.emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
          }, 30)
          return
        }
        this.emit('session/event', session, {
          type: 'turn/end',
          data:
            behaviour === 'fail'
              ? { turn: 1, reason: { kind: 'error', error: { message: '假模型错误', code: 'boom' } } }
              : { turn: 1, reason: { kind: 'completed' } },
        })
      }, 5)
      return { accepted: true }
    },
  }

  logger = {
    info: (): void => {},
    warn: (): void => {},
    error: (): void => {},
  }
}

interface Harness {
  engine: TaskEngine
  store: TaskStore
  host: FakeHost
  dir: string
  clock: { now: number }
  logs: string[]
  cleanup: () => void
}

function makeHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'task-center-test-'))
  const store = new TaskStore(join(dir, 'state.json'))
  store.load()
  const host = new FakeHost()
  const logs: string[] = []
  const clock = { now: Date.parse('2026-03-01T12:00:00.000Z') }
  const engine = new TaskEngine(host as never, store, {
    maxConcurrentRuns: 2,
    runHistory: 50,
    defaultTimeoutMinutes: 20,
    graceSeconds: 90,
    dataRoot: join(dir, 'data'),
    log: (level, text) => logs.push(`${level}: ${text}`),
    clock: () => clock.now,
  })
  return {
    engine,
    store,
    host,
    dir,
    clock,
    logs,
    cleanup: () => {
      engine.dispose()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function baseTask(overrides: Partial<Task> = {}): Task {
  const nowIso = '2026-03-01T12:00:00.000Z'
  return {
    id: 'task-1',
    name: '测试任务',
    prompt: '做点事情',
    attachments: [],
    model: null,
    reasoningEffort: null,
    workspace: null,
    sessionMode: 'independent',
    sessionId: null,
    sessionModelKey: null,
    permission: { approval: 'never', sandbox: 'workspace-write' },
    permissionPreset: 'workspace-write',
    permissionSource: 'preset',
    modelSource: 'legacy',
    workspaceId: null,
    workspaceSource: 'task-dir',
    legacyIssues: [],
    schedule: { kind: 'daily', time: '09:00' },
    timeZone: 'America/New_York',
    startAt: null,
    endAt: null,
    missedPolicy: 'catchup',
    enabled: true,
    maxRetries: 0,
    timeoutMinutes: 20,
    createdAt: nowIso,
    updatedAt: nowIso,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastError: null,
    templateId: null,
    ...overrides,
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(5)
  }
  return predicate()
}

/* --------------------------------------------------------- occurrence math */

console.log('\n时区与调度算术')
{
  const at = nextOccurrence({ spec: { kind: 'daily', time: '09:00' }, timeZone: 'Asia/Shanghai', fromMs: Date.parse('2026-03-01T00:30:00.000Z') })
  eq('每天 09:00（上海）→ 2026-03-01T09:00+08:00', new Date(at as number).toISOString(), '2026-03-01T01:00:00.000Z')

  const once = nextOccurrence({ spec: { kind: 'once', at: '2026-04-01T00:00:00.000Z' }, timeZone: 'UTC', fromMs: Date.parse('2026-03-01T00:00:00.000Z') })
  eq('单次任务只发生一次', once, Date.parse('2026-04-01T00:00:00.000Z'))
  eq('单次任务过去后不再发生', nextOccurrence({ spec: { kind: 'once', at: '2026-02-01T00:00:00.000Z' }, timeZone: 'UTC', fromMs: Date.parse('2026-03-01T00:00:00.000Z') }), null)

  const interval = nextOccurrence({
    spec: { kind: 'interval', everyMinutes: 90 },
    timeZone: 'UTC',
    fromMs: Date.parse('2026-03-01T00:00:00.000Z'),
    anchorMs: Date.parse('2026-03-01T00:00:00.000Z'),
  })
  eq('固定间隔保持锚点相位', interval, Date.parse('2026-03-01T01:30:00.000Z'))

  const weekly = nextOccurrence({
    spec: { kind: 'weekly', time: '18:00', weekdays: [5] },
    timeZone: 'Europe/Lisbon',
    fromMs: Date.parse('2026-03-03T00:00:00.000Z'),
  })
  eq('每周五 18:00（里斯本）→ 2026-03-06', new Date(weekly as number).toISOString(), '2026-03-06T18:00:00.000Z')

  // Spring forward in New York: 2026-03-08 02:00 → 03:00, so 02:30 does not exist.
  const gap = nextOccurrence({
    spec: { kind: 'daily', time: '02:30' },
    timeZone: 'America/New_York',
    fromMs: Date.parse('2026-03-07T12:00:00.000Z'),
  })
  eq('DST 空洞（02:30 不存在）跳过该日', new Date(gap as number).toISOString(), '2026-03-09T06:30:00.000Z')

  const normal = nextOccurrence({
    spec: { kind: 'daily', time: '09:00' },
    timeZone: 'America/New_York',
    fromMs: Date.parse('2026-03-07T12:00:00.000Z'),
  })
  eq('DST 切换日 09:00 仍然准时（EST→EDT）', new Date(normal as number).toISOString(), '2026-03-07T14:00:00.000Z')

  const cron = parseCron('*/15 9-17 * * 1-5')
  check('cron 解析 */15', cron.minutes.size === 4, `${cron.minutes.size}`)
  check('cron 解析 9-17', cron.hours.size === 9, `${cron.hours.size}`)
  check('cron 解析 1-5 工作日', cron.daysOfWeek.size === 5, `${cron.daysOfWeek.size}`)
  eq('cron 别名展开', parseCron('@daily').hours.size, 1)
  eq('cron 落地时间', new Date(
    nextOccurrence({ spec: { kind: 'cron', cron: '0 9 * * *' }, timeZone: 'UTC', fromMs: Date.parse('2026-03-01T10:00:00.000Z') }) as number,
  ).toISOString(), '2026-03-02T09:00:00.000Z')

  let threw = false
  try {
    parseCron('* * * *')
  } catch {
    threw = true
  }
  check('cron 字段数不足会报错', threw)

  check('有效期窗口判断', withinWindow(Date.parse('2026-03-01T00:00:00Z'), '2026-02-01T00:00:00Z', '2026-04-01T00:00:00Z'))
  check('过期窗口拒绝', !withinWindow(Date.parse('2026-05-01T00:00:00Z'), '2026-02-01T00:00:00Z', '2026-04-01T00:00:00Z'))
  check('人话描述可读', describeSchedule({ kind: 'daily', time: '09:00' }, 'Asia/Shanghai').includes('09:00'))
}

/* --------------------------------------------------------------- run engine */

console.log('\n运行生命周期')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.written = [join(h.dir, 'report.html')]
  const saved = h.engine.saveTask(baseTask({ workspace: h.dir, permissionPreset: null, permissionSource: 'legacy' }))
  check('保存任务成功', saved.ok)
  const task = saved.ok ? saved.value : baseTask()
  eq('创建时固化宿主默认模型', task.model, { provider: 'fake', model: 'model-a' })
  eq('固化来源标记', task.modelSource, 'default')
  eq('未选预设时沿用旧权限组合', h.host.presetSets.length, 0)

  const run = h.engine.runNow(task.id)
  check('立即运行被接受', run.ok)
  const runId = run.ok ? run.value.id : ''
  await waitFor(() => h.engine.findRun(runId)?.status === 'succeeded')
  const finished = h.engine.findRun(runId) as Run
  eq('手动触发标记', finished.trigger, 'manual')
  eq('执行成功', finished.status, 'succeeded')
  check('记录真实耗时', (finished.durationMs ?? 0) >= 0)
  eq('采集到工具调用', finished.tools.map((tool) => tool.name), ['web_search'])
  check('关联产物', finished.artifacts.some((artifact) => artifact.path.endsWith('report.html')), JSON.stringify(finished.artifacts))
  check('输出文本已记录', (finished.output ?? '').includes('完成了一轮工作'))
  eq('独立会话每次新建', h.host.promptCount, 1)
  eq('审批策略下发', h.host.policyCalls.length, 1)
  h.cleanup()
}

console.log('\n失败与重试')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'fail'
  const saved = h.engine.saveTask(baseTask({ maxRetries: 1, workspace: h.dir }))
  const task = saved.ok ? saved.value : baseTask()
  const run = h.engine.runNow(task.id)
  const runId = run.ok ? run.value.id : ''
  await waitFor(() => h.engine.findRun(runId)?.status === 'failed')
  const failed = h.engine.findRun(runId) as Run
  eq('失败状态', failed.status, 'failed')
  eq('错误信息带 code', failed.error?.code, 'boom')
  check('任务卡片记录异常提示', h.store.tasks[0].lastError !== null)
  h.cleanup()
}

console.log('\n超时与停止')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  const saved = h.engine.saveTask(baseTask({ timeoutMinutes: 0.02, workspace: h.dir }))
  const task = saved.ok ? saved.value : baseTask()
  const run = h.engine.runNow(task.id)
  const runId = run.ok ? run.value.id : ''
  await waitFor(() => h.engine.findRun(runId)?.status === 'timeout', 5000)
  const timedOut = h.engine.findRun(runId) as Run
  eq('超时状态可区分', timedOut.status, 'timeout')
  check('超时会真的取消会话', h.host.cancels >= 1)
  h.cleanup()
}

console.log('\n计划触发与补跑')
{
  const h = makeHarness()
  await h.engine.start()
  h.clock.now = Date.parse('2026-03-01T13:55:00.000Z') // 08:55 New York
  const saved = h.engine.saveTask(baseTask({ workspace: h.dir }))
  const task = saved.ok ? saved.value : baseTask()
  eq('下一次执行时间已算出', task.nextRunAt, '2026-03-01T14:00:00.000Z')

  h.clock.now = Date.parse('2026-03-01T14:00:20.000Z') // 20s late → on time
  await h.engine.tick()
  await waitFor(() => h.store.runs.length === 1 && h.store.runs[0].status === 'succeeded')
  eq('准点触发记为定时', h.store.runs[0]?.trigger, 'schedule')
  eq('触发后重新排下一次', h.store.tasks[0].nextRunAt, '2026-03-02T14:00:00.000Z')
  h.cleanup()
}

console.log('\n漏跑策略')
{
  const h = makeHarness()
  await h.engine.start()
  h.clock.now = Date.parse('2026-03-01T13:55:00.000Z')
  const saved = h.engine.saveTask(baseTask({ workspace: h.dir, missedPolicy: 'catchup' }))
  const task = saved.ok ? saved.value : baseTask()
  // Jump three days ahead: three occurrences were missed.
  h.clock.now = Date.parse('2026-03-04T15:30:00.000Z')
  await h.engine.tick()
  await waitFor(() => h.store.runs.length === 1 && h.store.runs[0].status === 'succeeded')
  eq('补跑只跑一次', h.store.runs.length, 1)
  eq('补跑标记为 catchup', h.store.runs[0]?.trigger, 'catchup')
  eq('补跑取最近一次漏跑', h.store.runs[0]?.scheduledFor, '2026-03-04T14:00:00.000Z')
  eq('补跑后重新排下一次', h.store.tasks[0].nextRunAt, '2026-03-05T14:00:00.000Z')
  void task
  h.cleanup()
}
{
  const h = makeHarness()
  await h.engine.start()
  h.clock.now = Date.parse('2026-03-01T13:55:00.000Z')
  h.engine.saveTask(baseTask({ workspace: h.dir, missedPolicy: 'skip' }))
  h.clock.now = Date.parse('2026-03-04T15:30:00.000Z')
  await h.engine.tick()
  await sleep(60)
  eq('skip 策略不补跑', h.store.runs.length, 0)
  eq('skip 策略仍排下一次', h.store.tasks[0].nextRunAt, '2026-03-05T14:00:00.000Z')
  h.cleanup()
}

console.log('\n暂停 / 有效期 / 串行 / 持久会话')
{
  const h = makeHarness()
  await h.engine.start()
  h.clock.now = Date.parse('2026-03-01T13:55:00.000Z')
  const saved = h.engine.saveTask(baseTask({ workspace: h.dir, enabled: false }))
  const task = saved.ok ? saved.value : baseTask()
  eq('暂停任务没有下次时间', task.nextRunAt, null)
  h.clock.now = Date.parse('2026-03-04T15:30:00.000Z')
  await h.engine.tick()
  await sleep(50)
  eq('暂停任务不会被触发', h.store.runs.length, 0)

  const enabled = h.engine.setEnabled(task.id, true)
  check('恢复启用后重算时间', enabled.ok && enabled.value.nextRunAt !== null)
  const paused = h.engine.setEnabled(task.id, false)
  eq('再次暂停清空时间', paused.ok ? paused.value.nextRunAt : 'x', null)
  h.cleanup()
}
{
  const h = makeHarness()
  await h.engine.start()
  h.clock.now = Date.parse('2026-03-01T13:55:00.000Z')
  const saved = h.engine.saveTask(
    baseTask({ workspace: h.dir, startAt: '2026-03-01T00:00:00.000Z', endAt: '2026-03-02T00:00:00.000Z' }),
  )
  const task = saved.ok ? saved.value : baseTask()
  eq('有效期内排下一次', task.nextRunAt, '2026-03-01T14:00:00.000Z')
  h.clock.now = Date.parse('2026-03-03T15:00:00.000Z')
  await h.engine.tick()
  await sleep(50)
  eq('过期后不再触发', h.store.runs.length, 0)
  eq('过期后清空下次时间', h.store.tasks[0].nextRunAt, null)
  h.cleanup()
}
{
  const h = makeHarness()
  await h.engine.start()
  const saved = h.engine.saveTask(baseTask({ workspace: h.dir, sessionMode: 'persistent' }))
  const task = saved.ok ? saved.value : baseTask()
  const first = h.engine.runNow(task.id)
  const firstId = first.ok ? first.value.id : ''
  await waitFor(() => h.engine.findRun(firstId)?.status === 'succeeded')
  const second = h.engine.runNow(task.id)
  const secondId = second.ok ? second.value.id : ''
  await waitFor(() => h.engine.findRun(secondId)?.status === 'succeeded')
  const runs = h.store.runs.filter((run) => run.id === firstId || run.id === secondId)
  eq('持续会话两次复用同一会话', new Set(runs.map((run) => run.sessionId)).size, 1)
  eq('持续会话只建一次', h.host.sessions.size, 1)
  h.cleanup()
}
{
  const h = makeHarness()
  await h.engine.start()
  const saved = h.engine.saveTask(baseTask({ workspace: h.dir }))
  const task = saved.ok ? saved.value : baseTask()
  const first = h.engine.runNow(task.id)
  const second = h.engine.runNow(task.id)
  // 排队而不是拒绝：两次触发都保留，串行由队列保证。
  check('同一任务串行：第二次进入队列而不是被拒绝', first.ok && second.ok)
  h.cleanup()
}

console.log('\n重启恢复')
{
  const dir = mkdtempSync(join(tmpdir(), 'task-center-restart-'))
  const file = join(dir, 'state.json')
  const clock = { now: Date.parse('2026-03-01T13:55:00.000Z') }
  const host = new FakeHost()
  const store = new TaskStore(file)
  store.load()
  const options = {
    maxConcurrentRuns: 2,
    runHistory: 50,
    defaultTimeoutMinutes: 20,
    graceSeconds: 90,
    dataRoot: join(dir, 'data'),
    log: (): void => {},
    clock: () => clock.now,
  }
  const first = new TaskEngine(host as never, store, options)
  first.saveTask(baseTask({ workspace: dir }))
  first.dispose()

  // Simulate DSH being closed over three days, then reopened.
  const reloaded = new TaskStore(file)
  const report = reloaded.load()
  check('重启后读到任务', reloaded.tasks.length === 1 && !report.recovered)
  clock.now = Date.parse('2026-03-04T15:30:00.000Z')
  const second = new TaskEngine(host as never, reloaded, options)
  await second.start()
  await waitFor(() => reloaded.runs.length === 1 && reloaded.runs[0].status === 'succeeded')
  eq('重启后补跑一次漏跑', reloaded.runs[0]?.trigger, 'catchup')
  eq('重启后不重复执行', reloaded.runs.length, 1)
  second.dispose()
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n等待审批')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'approval'
  const saved = h.engine.saveTask(baseTask({ workspace: h.dir }))
  const taskId = saved.ok ? saved.value.id : ''
  const seen = new Set<string>()
  h.engine.onChange(() => {
    const run = h.store.runs.find((entry) => entry.taskId === taskId)
    if (run !== undefined) seen.add(run.status)
  })
  h.engine.runNow(taskId)
  const done = await waitFor(() => h.store.runs.some((run) => run.status === 'succeeded'))
  check('审批后仍能跑完', done)
  check('运行中被标记为等待审批', seen.has('waiting-approval'), [...seen].join(','))
  const run = h.store.runs[0]
  check('日志记录了审批等待与结果',
    run.log.some((entry) => entry.text.includes('等待审批')) && run.log.some((entry) => entry.text.includes('allowed-once')))
  h.cleanup()
}

console.log('\n存储健壮性')
{
  const dir = mkdtempSync(join(tmpdir(), 'task-center-store-'))
  const file = join(dir, 'state.json')
  const store = new TaskStore(file)
  store.load()
  store.replace([baseTask()], [])
  const reread = new TaskStore(file)
  reread.load()
  eq('原子写可回读', reread.tasks.length, 1)
  writeFileSync(file, '{ this is not json', 'utf8')
  const broken = new TaskStore(file)
  const outcome = broken.load()
  check('损坏文件被隔离而不是覆盖', outcome.recovered && broken.tasks.length === 0)
  rmSync(dir, { recursive: true, force: true })
}


console.log('\n自动重试：暂停 / 删除 / 有效期 / 重启恢复')
{
  // A failure schedules a retry, and pausing the task must cancel it.
  {
    const h = makeHarness()
    await h.engine.start()
    h.host.behaviour = 'fail'
    const saved = h.engine.saveTask(baseTask({ id: 'retry-1', maxRetries: 2, enabled: true, schedule: { kind: 'once', at: '2030-01-01T00:00:00.000Z' } }))
    check('任务已创建', saved.ok)
    h.engine.runNow('retry-1')
    const failed = await waitFor(() => h.store.runs.some((run) => run.status === 'failed'))
    check('首次运行失败', failed)
    const first = h.store.runs[0] as Run
    check('失败后写入了重试到期时间', typeof first.retryAt === 'string' && first.retryAt !== null, String(first.retryAt))
    h.engine.setEnabled('retry-1', false)
    eq('暂停后重试被清空', h.store.runs[0]?.retryAt ?? null, null)
    check('暂停后日志说明了原因', h.logs.some((line) => line.includes('自动重试已取消')))
    h.cleanup()
  }

  // Deleting the task cancels its retry too.
  {
    const h = makeHarness()
    await h.engine.start()
    h.host.behaviour = 'fail'
    h.engine.saveTask(baseTask({ id: 'retry-2', maxRetries: 2, enabled: true, schedule: { kind: 'once', at: '2030-01-01T00:00:00.000Z' } }))
    h.engine.runNow('retry-2')
    await waitFor(() => h.store.runs.some((run) => run.status === 'failed'))
    h.engine.deleteTask('retry-2')
    eq('删除任务后重试被清空', h.store.runs[0]?.retryAt ?? null, null)
    h.cleanup()
  }

  // An expired validity window cancels the retry as well.
  {
    const h = makeHarness()
    await h.engine.start()
    h.host.behaviour = 'fail'
    h.engine.saveTask(
      baseTask({
        id: 'retry-3',
        maxRetries: 2,
        enabled: true,
        schedule: { kind: 'once', at: '2030-01-01T00:00:00.000Z' },
        startAt: '2026-01-01T00:00:00.000Z',
        endAt: '2026-01-02T00:00:00.000Z',
      }),
    )
    h.engine.runNow('retry-3')
    await waitFor(() => h.store.runs.some((run) => run.status === 'failed'))
    const retryAt = h.store.runs[0]?.retryAt ?? null
    check('有效期内的失败仍排了重试', retryAt !== null)
    if (retryAt !== null) h.engine.tick(Date.parse(retryAt) + 1000)
    eq('超出有效期后不再重试', h.store.runs.filter((run) => run.trigger === 'retry').length, 0)
    check('日志说明有效期原因', h.logs.some((line) => line.includes('自动重试已取消')))
    h.cleanup()
  }

  // retryAt is durable: a fresh engine over the same store continues it.
  {
    const h = makeHarness()
    await h.engine.start()
    h.host.behaviour = 'fail'
    h.engine.saveTask(baseTask({ id: 'retry-4', maxRetries: 2, enabled: true, schedule: { kind: 'once', at: '2030-01-01T00:00:00.000Z' } }))
    h.engine.runNow('retry-4')
    await waitFor(() => h.store.runs.some((run) => run.status === 'failed'))
    const retryAt = Date.parse(String(h.store.runs.find((run) => run.attempt === 1)?.retryAt))
    check('重启前已排重试', Number.isFinite(retryAt))
    h.engine.dispose()
    h.host.behaviour = 'complete'
    const revived = new TaskEngine(h.host as never, h.store, {
      maxConcurrentRuns: 2,
      runHistory: 50,
      defaultTimeoutMinutes: 20,
      graceSeconds: 90,
      dataRoot: join(h.dir, 'data'),
      log: () => {},
      clock: () => retryAt + 1000,
    })
    await revived.start()
    revived.tick(retryAt + 1000)
    const resumed = await waitFor(() => h.store.runs.some((run) => run.trigger === 'retry' && run.status === 'succeeded'))
    check('重启后按持久化的 retryAt 继续重试', resumed)
    revived.dispose()
    h.cleanup()
  }
}

console.log('\n历史裁剪保留进行中的记录')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: 'keep-1', timeoutMinutes: 5 }))
  h.engine.runNow('keep-1')
  await waitFor(() => h.store.runs.some((run) => run.status === 'running'))
  const liveRun = h.store.runs.find((run) => run.status === 'running') as Run
  // Force far more historical runs than the retention limit.
  for (let index = 0; index < 40; index += 1) {
    h.engine.saveTask(baseTask({ id: `filler-${index}`, enabled: false }))
  }
  const stillThere = h.store.runs.some((run) => run.id === liveRun.id)
  check('裁剪不会丢掉正在运行的记录', stillThere)
  check('正在运行的记录仍在活动表', h.store.runs.filter((run) => run.status === 'running').length >= 1)
  h.cleanup()
}

console.log('\n同一任务串行：排队而不丢弃')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: 'serial-1', timeoutMinutes: 5 }))
  h.engine.runNow('serial-1')
  await waitFor(() => h.store.runs.some((run) => run.status === 'running'))
  const second = h.engine.runNow('serial-1')
  check('任务忙时手动运行被接受', second.ok)
  const queued = await waitFor(() => h.store.runs.filter((run) => run.taskId === 'serial-1').length === 2)
  check('第二次触发进入队列而不是被丢弃', queued)
  const statuses = h.store.runs.filter((run) => run.taskId === 'serial-1').map((run) => run.status)
  check('排队中的那次状态是 queued', statuses.includes('queued'), JSON.stringify(statuses))
  const queuedRun = h.store.runs.find((run) => run.status === 'queued')
  check(
    '记录里说明了排队等待',
    queuedRun !== undefined && queuedRun.log.some((entry) => entry.text.includes('排队等待')),
  )
  h.cleanup()
}

console.log('\n超时覆盖异步预处理')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.hangCreate = true // creating the Session never settles
  h.engine.saveTask(baseTask({ id: 'timeout-prep', timeoutMinutes: 0.02 }))
  h.engine.runNow('timeout-prep')
  const timedOut = await waitFor(() => h.store.runs.some((run) => run.status === 'timeout'), 4000)
  check('会话创建卡住时也会超时收尾', timedOut)
  const run = h.store.runs[0] as Run
  eq('超时记录的错误码', run.error?.code ?? null, 'timeout')
  check('超时记录仍然保存', h.store.runs.length === 1)
  h.cleanup()
}

console.log('\n旧代在卸载后不再写入')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: 'gen-1', timeoutMinutes: 5 }))
  h.engine.runNow('gen-1')
  await waitFor(() => h.store.runs.some((run) => run.status === 'running'))
  const runId = String(h.store.runs[0]?.id)
  const run = h.store.runs.find((entry) => entry.id === runId) as Run
  const sessionId = String(run.sessionId)
  const session = h.host.sessions.get(sessionId) as FakeSession
  h.engine.dispose()
  const snapshotOf = (): string => JSON.stringify(h.store.runs.find((entry) => entry.id === runId) ?? null)
  const before = snapshotOf()
  h.host.emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(30)
  eq('卸载后旧代的轮次结束不会改写记录', snapshotOf(), before)
  const revived = new TaskEngine(h.host as never, h.store, {
    maxConcurrentRuns: 2,
    runHistory: 50,
    defaultTimeoutMinutes: 20,
    graceSeconds: 90,
    dataRoot: join(h.dir, 'data'),
    log: () => {},
    clock: () => Date.now(),
  })
  await revived.start()
  const reconciled = h.store.runs.find((entry) => entry.id === runId) as Run
  eq('新一代启动时把孤儿记录收尾', reconciled.status, 'failed')
  eq('收尾错误码', reconciled.error?.code ?? null, 'interrupted')
  revived.dispose()
  h.cleanup()
}

console.log('\n手动运行不吞掉计划')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'complete'
  const at = Date.parse('2030-05-01T13:00:00.000Z')
  h.engine.saveTask(baseTask({ id: 'manual-1', schedule: { kind: 'once', at: new Date(at).toISOString() } }))
  const planned = h.store.tasks[0]?.nextRunAt ?? null
  h.engine.runNow('manual-1')
  const done = await waitFor(() => h.store.runs.some((run) => run.status === 'succeeded'))
  check('手动运行成功', done)
  eq('手动运行后计划时间保持不变', h.store.tasks[0]?.nextRunAt ?? null, planned)
  h.cleanup()
}

console.log('\n稀疏 Cron / startAt 边界 / 反向查找')
{
  const leap = nextOccurrence({
    spec: { kind: 'cron', cron: '0 0 29 2 *' },
    timeZone: 'UTC',
    fromMs: Date.parse('2026-03-01T00:00:00.000Z'),
  })
  eq('闰年 2 月 29 日能被算出来（不因扫描上限漏掉）', new Date(leap as number).toISOString(), '2028-02-29T00:00:00.000Z')

  const boundary = Date.parse('2026-03-01T14:00:00.000Z') // = 09:00 in New York (EST)
  const h = makeHarness()
  await h.engine.start()
  h.clock.now = boundary
  h.engine.saveTask(
    baseTask({ id: 'start-1', startAt: new Date(boundary).toISOString(), schedule: { kind: 'daily', time: '09:00' } }),
  )
  eq('startAt 恰好落在触发点时不被跳过', h.store.tasks[0]?.nextRunAt ?? null, new Date(boundary).toISOString())
  h.cleanup()

  const latest = previousOccurrence({
    spec: { kind: 'daily', time: '09:00' },
    timeZone: 'America/New_York',
    atMs: Date.parse('2029-06-01T20:00:00.000Z'),
  })
  eq('反向查找直接给出最近一次', new Date(latest as number).toISOString(), '2029-06-01T13:00:00.000Z')

  const sparseLatest = previousOccurrence({
    spec: { kind: 'cron', cron: '0 0 29 2 *' },
    timeZone: 'UTC',
    atMs: Date.parse('2029-06-01T00:00:00.000Z'),
  })
  eq('稀疏 cron 的反向查找不被上限截断', new Date(sparseLatest as number).toISOString(), '2028-02-29T00:00:00.000Z')
}

console.log('\n持续会话：失效 / 工作区变化 / 模型变化')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'complete'
  h.engine.saveTask(
    baseTask({ id: 'persist-1', sessionMode: 'persistent', workspace: join(h.dir, 'ws-a') }),
  )
  h.engine.runNow('persist-1')
  await waitFor(() => h.host.sessions.size === 1 && h.store.runs[0]?.status === 'succeeded')
  const firstSession = h.store.tasks[0]?.sessionId ?? null
  check('持续会话被记住', typeof firstSession === 'string')

  // Changing the working folder must not reuse the old cwd.
  const task = h.store.tasks[0] as Task
  h.engine.saveTask({ ...task, workspace: join(h.dir, 'ws-b') })
  h.engine.runNow('persist-1')
  await waitFor(() => h.host.sessions.size === 2)
  check('改了工作文件夹就换会话', h.host.sessions.size === 2)
  check('日志说明了工作文件夹不同', h.logs.some((line) => line.includes('工作文件夹是')))
  const secondSession = h.store.tasks[0]?.sessionId ?? null
  check('会话 id 已更新', secondSession !== firstSession)

  // Switching the pinned model (and back to default) also needs a fresh Session.
  h.engine.saveTask({ ...(h.store.tasks[0] as Task), model: { provider: 'fake', model: 'model-b' }, reasoningEffort: 'high' })
  h.engine.runNow('persist-1')
  await waitFor(() => h.host.sessions.size === 3)
  check('改了模型就换会话', h.host.sessions.size === 3)
  check('模型钉在本会话而不是全局', h.host.modelPins.length >= 1 && h.host.modelPins.every((pin) => pin.provider === 'fake'))

  h.host.resolveError = '会话已被删除'
  h.engine.runNow('persist-1')
  await waitFor(() => h.host.sessions.size === 4)
  check('持续会话失效时自动新建', h.host.sessions.size === 4)
  h.host.resolveError = null
  h.cleanup()
}

console.log('\nresolveAgent 返回错误对象时不会崩溃')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'complete'
  h.host.wrapAgent = true
  h.engine.saveTask(baseTask({ id: 'wrap-1' }))
  h.host.resolveError = '会话解析失败'
  h.engine.runNow('wrap-1')
  const settled = await waitFor(() => h.store.runs.some((run) => run.status !== 'running' && run.status !== 'queued'))
  check('运行以失败结束而不是卡住', settled)
  const run = h.store.runs[0] as Run
  check('错误信息来自宿主返回的 error', String(run.error?.message ?? '').includes('会话解析失败'), String(run.error?.message))
  h.cleanup()
}


console.log('\n对话工具与表单共用同一条业务路径')
{
  const h = makeHarness()
  await h.engine.start()
  const registered = new Map<string, any>()
  const fakeCtx = {
    tools: {
      register: (definition: any): (() => void) => {
        registered.set(definition.name, definition)
        return () => registered.delete(definition.name)
      },
    },
  }
  const disposeTools = registerTools(fakeCtx as never, { engine: h.engine, ctx: fakeCtx as never })
  eq('注册了 9 个任务工具', registered.size, 9)
  check(
    '工具名覆盖创建/查询/改/启停/运行/删除/记录',
    ['task_create', 'task_list', 'task_get', 'task_update', 'task_enabled', 'task_run', 'task_delete', 'run_list', 'run_cancel'].every(
      (name) => registered.has(name),
    ),
  )

  const create = registered.get('task_create')
  check('工具定义了 output.schema 与 render', typeof create.output?.schema === 'object' && typeof create.output?.render === 'function')
  eq('参数根 schema 是 object', String(create.parameters?.type), 'object')
  check('参数声明了 additionalProperties:false', create.parameters?.additionalProperties === false)

  const exec = { agent: { session: { id: 'session-x', requestHeader: () => ({}) } }, signal: undefined }
  const created = await create.execute(
    {
      name: '对话创建的任务',
      prompt: '搜索 AI 新闻并生成 HTML',
      kind: 'daily',
      time: '09:00',
      timeZone: 'Asia/Shanghai',
      maxRetries: 1,
    },
    exec,
  )
  check('对话创建返回了任务 id', typeof created?.task?.id === 'string')
  const inStore = h.store.tasks.find((task) => task.name === '对话创建的任务')
  check('对话创建的任务进入了同一个 store', inStore !== undefined)
  eq('创建后算出了下次运行时间', typeof inStore?.nextRunAt, 'string')
  const rendered = create.output.render({}, created)
  check('render 产出模型可见文本', Array.isArray(rendered) && String(rendered[0]?.text ?? '').includes('对话创建的任务'))

  // 表单与工具都走 engine.saveTask：同一 id 在两边都能改。
  const listed = await registered.get('task_list').execute({}, exec)
  check('task_list 能看到刚创建的任务', JSON.stringify(listed).includes('对话创建的任务'))
  const considered = await registered.get('task_update').execute(
    { idOrName: '对话创建的任务', name: '对话创建的任务（改）' },
    exec,
  )
  check('按名字也能定位并改名', JSON.stringify(considered).includes('（改）'))
  eq('改名落到了同一个 store', h.store.tasks.find((task) => task.id === inStore?.id)?.name, '对话创建的任务（改）')

  const disabled = await registered.get('task_enabled').execute({ idOrName: inStore?.id, enabled: false }, exec)
  check('工具可以暂停任务', disabled?.task?.enabled === false)
  eq('暂停后 nextRunAt 清空', h.store.tasks.find((task) => task.id === inStore?.id)?.nextRunAt ?? null, null)

  // 校验与表单一致：坏规则在工具层就被拒。
  let rejected: string | null = null
  try {
    await create.execute({ name: '坏任务', prompt: 'x', kind: 'once' }, exec)
  } catch (error) {
    rejected = (error as Error).message
  }
  check('单次任务缺 at 会被拒绝', rejected !== null && rejected.includes('at'), String(rejected))

  let badModel: string | null = null
  try {
    await create.execute({ name: '坏模型', prompt: 'x', kind: 'daily', time: '09:00', model: 'nope/model' }, exec)
  } catch (error) {
    badModel = (error as Error).message
  }
  check('不存在的模型会被拒绝', badModel !== null && badModel.includes('不在可用列表'), String(badModel))

  // 立即运行走的是同一个队列。
  const ran = await registered.get('task_run').execute({ idOrName: inStore?.id }, exec)
  check('工具立即运行返回排队记录', typeof ran?.run?.id === 'string' || typeof ran?.id === 'string')
  const ran2 = await waitFor(() => h.store.runs.length >= 1)
  check('运行记录进入同一个历史', ran2)
  const runs = await registered.get('run_list').execute({}, exec)
  check('run_list 能看到这条运行', JSON.stringify(runs).includes('对话创建的任务') || JSON.stringify(runs).includes('run'))
  disposeTools()
  eq('卸载后工具全部注销', registered.size, 0)
  h.cleanup()
}

/* ------------------------------------- 权限能力缺失与思考档位规范化 */

{
  const h = makeHarness()
  await h.engine.start()
  const savedTask = h.engine.saveTask({
    ...baseTask(),
    id: 'task-approval-missing',
    name: '权限缺失',
    prompt: '随便',
    schedule: { kind: 'daily', time: '09:00' },
    timeZone: 'UTC',
    permission: { approval: 'ask', sandbox: 'workspace-write' },
    permissionPreset: null,
    permissionSource: 'legacy',
    timeoutMinutes: 5,
  })
  check('权限缺失用例的任务已建立', savedTask.ok, JSON.stringify(savedTask).slice(0, 120))
  const task = savedTask.ok ? savedTask.value : null
  if (task === null) throw new Error('任务创建失败，无法继续该用例')
  // 宿主没有 approval 服务时，必须失败并说清楚，而不是静默放行。
  delete (h.host as unknown as Record<string, unknown>)['approval']
  const started = h.engine.runNow(task.id)
  check('立即运行被受理', started.ok, JSON.stringify(started).slice(0, 120))
  const run = started.ok ? started.value : null
  if (run === null) throw new Error('运行未受理，无法继续该用例')
  await waitFor(() => h.store.runs.find((entry) => entry.id === run.id)?.status !== 'running')
  const finished = h.store.runs.find((entry) => entry.id === run.id)
  eq('缺少 approval 服务时运行失败', finished?.status, 'failed')
  check(
    '错误信息指明权限下发失败',
    String(finished?.error?.message ?? '').includes('无法下发任务权限'),
    String(finished?.error?.message ?? ''),
  )
  check('失败后不会留下等待审批的假状态', finished?.status !== 'waiting-approval')

  const effortCases: Array<{ input: unknown; expected: string | null }> = [
    { input: 'undefined', expected: null },
    { input: 'null', expected: null },
    { input: '   ', expected: null },
    { input: null, expected: null },
    { input: 'high', expected: 'high' },
    { input: '  low  ', expected: 'low' },
  ]
  for (const entry of effortCases) {
    const saved = h.engine.saveTask({
      ...baseTask(),
      id: `task-effort-${JSON.stringify(entry.input)}`,
      name: '档位',
      prompt: 'x',
      schedule: { kind: 'daily', time: '09:00' },
      timeZone: 'UTC',
      model: { provider: 'fake', model: 'model-b' },
      reasoningEffort: entry.input as never,
    })
    eq(`思考档位 ${JSON.stringify(entry.input)} 归一化`, saved.ok ? saved.value.reasoningEffort : saved, entry.expected)
  }
  h.cleanup()
}

/* ------------------------------------------------------- native reminders */

console.log('\n原生提醒适配层（融合列表）')

function reminderEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rem-1',
    sessionId: 'session-a',
    title: '每天看一次新闻',
    prompt: '把今天的新闻念给我听',
    kind: 'daily',
    time: '09:00',
    timeZone: 'Asia/Shanghai',
    scheduledAt: '2026-11-01T01:00:00.000Z',
    status: 'active',
    lastDelivery: { deliveredAt: '2026-10-31T01:00:02.000Z', messageId: 'msg-1' },
    ...overrides,
  }
}

function fakeSchedule(entries: unknown[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const calls: Record<string, unknown>[] = []
  const service: Record<string, unknown> = {
    calls,
    async catalog() {
      return entries
    },
    async list(request: Record<string, unknown>) {
      calls.push({ method: 'list', request })
      return entries.filter((entry) => (entry as { sessionId?: string }).sessionId === request.sessionId)
    },
    async history(request: Record<string, unknown>) {
      calls.push({ method: 'history', request })
      return {
        id: request.id,
        records: [{ scheduledAt: '2026-10-31T01:00:00.000Z', deliveredAt: '2026-10-31T01:00:02.000Z', messageId: 'msg-1' }],
        earlierRecordsUnavailable: false,
        earlierRecordsPruned: true,
        retention: { days: 30, records: 200 },
        nextBefore: null,
      }
    },
    async update(request: Record<string, unknown>) {
      calls.push({ method: 'update', request })
      return { id: request.id, updated: true, record: { ...(request.expected as object), ...(request.change === undefined ? {} : {}) } }
    },
    async delete(request: Record<string, unknown>) {
      calls.push({ method: 'delete', request })
      // The Host answers a miss with `deleted:false` plus the reason code.
      return request.id === 'rem-1'
        ? { id: request.id, deleted: true }
        : { id: request.id, deleted: false, code: 'schedule_not_found' }
    },
    ...overrides,
  }
  return service
}

{
  const safe = await readReminders({ get: (name: string) => (name === 'schedule' ? fakeSchedule([reminderEntry()]) : undefined) })
  eq('读取成功时不带错误', safe.error, null)
  eq('稳定身份用来源+原始 id', safe.rows[0]?.key, 'reminder:rem-1')
  eq('规则文案带时区', safe.rows[0]?.rule, '每天 09:00（Asia/Shanghai）')
  eq('投递时间被归一化', safe.rows[0]?.lastDeliveredAt, '2026-10-31T01:00:02.000Z')
  eq('状态映射为 active', safe.rows[0]?.status, 'active')

  const sorted = await readReminders({
    get: () => fakeSchedule([
      reminderEntry({ id: 'rem-late', scheduledAt: '2026-12-01T01:00:00.000Z' }),
      reminderEntry({ id: 'rem-early', scheduledAt: '2026-11-01T01:00:00.000Z' }),
    ]),
  })
  eq('按下次触发时间升序', sorted.rows.map((row) => row.id), ['rem-early', 'rem-late'])

  const broken = await readReminders({
    get: () => fakeSchedule([], {
      async catalog() {
        throw new Error('boom')
      },
    }),
  })
  eq('读取失败时不伪装成空列表', broken.error, '读取原生提醒失败：boom')
  eq('读取失败时不返回任何行', broken.rows.length, 0)

  const missing = await readReminders({ get: () => undefined })
  eq('缺少服务时给出明确原因', missing.error, '宿主没有 schedule 服务，原生提醒不可用')

  const history = await readHistory({ get: () => fakeSchedule([reminderEntry()]) }, 'rem-1', 'session-a', 500)
  eq('投递记录条数', history.records.length, 1)
  eq('保留策略被读出', history.retention, { days: 30, records: 200 })
  eq('更早记录被清理标志', history.earlierRecordsPruned, true)
  const clamped = fakeSchedule([])
  await readHistory({ get: () => clamped }, 'rem-1', 'session-a', 500)
  const historyCall = (clamped.calls as Record<string, unknown>[]).find((call) => call.method === 'history')
  eq('投递记录条数被夹到宿主允许的上限', (historyCall?.request as { limit?: number }).limit, 100)

  const updated = await updateReminder(
    { get: () => fakeSchedule([reminderEntry()]) },
    { id: 'rem-1', sessionId: 'session-a', title: '新名字', prompt: '新内容' },
  )
  check('编辑成功后返回记录', typeof updated === 'object' && updated !== null)

  const conflict = fakeSchedule([reminderEntry()], {
    async update() {
      return { id: 'rem-1', updated: false, code: 'schedule_conflict' }
    },
  })
  const conflictMessage = await updateReminder({ get: () => conflict }, { id: 'rem-1', sessionId: 'session-a', title: 'x' }).then(
    () => '（未报错）',
    (error: Error) => error.message,
  )
  eq('并发改动被拒绝而不是覆盖', conflictMessage, '提醒刚刚被改动过，请刷新后再试')

  const gone = fakeSchedule([], {
    async list() {
      return []
    },
    async catalog() {
      return []
    },
  })
  const goneMessage = await updateReminder({ get: () => gone }, { id: 'rem-x', sessionId: 'session-a' }).then(
    () => '（未报错）',
    (error: Error) => error.message,
  )
  eq('不存在时给出可读错误', goneMessage, '提醒已不存在（可能已被删除）')

  const removed = await deleteReminder({ get: () => fakeSchedule([reminderEntry()]) }, 'rem-1', 'session-a')
  eq('删除成功', removed.deleted, true)
  const notRemoved = await deleteReminder(
    { get: () => fakeSchedule([reminderEntry()]) },
    'rem-404',
    'session-a',
  ).then(
    () => '（未报错）',
    (error: Error) => error.message,
  )
  eq('删除不存在的提醒给出可读错误', notRemoved, '提醒已不存在（可能已被删除）')
}

/* --------------------------------------------- models / workspaces / perms */

console.log('\n模型固化与隔离')
{
  const h = makeHarness()
  await h.engine.start()

  // Creation freezes whatever the Host default is *now*, including the effort.
  h.host.defaultSelection = { provider: 'fake', model: 'model-b', reasoningEffort: 'high' }
  const first = h.engine.saveTask(baseTask({ id: 'task-freeze', name: '固化', prompt: 'x' }))
  check('创建成功', first.ok, first.ok ? '' : first.message)
  eq('固化 provider/model', first.ok ? first.value.model : null, { provider: 'fake', model: 'model-b' })
  eq('固化思考档位', first.ok ? first.value.reasoningEffort : null, 'high')
  eq('来源标记 explicit 之外记 default', first.ok ? first.value.modelSource : null, 'default')

  // The Host default moves afterwards: the task must not move with it.
  h.host.defaultSelection = { provider: 'fake', model: 'model-a' }
  const again = h.engine.saveTask({ ...(first.ok ? first.value : baseTask()), name: '固化（改名）' })
  eq('编辑不重新捕获宿主默认', again.ok ? again.value.model : null, { provider: 'fake', model: 'model-b' })
  eq('编辑也不改写档位', again.ok ? again.value.reasoningEffort : null, 'high')

  // A real run pins per agent and records the snapshot; the global default is untouched.
  const run = h.engine.runNow('task-freeze')
  const runId = run.ok ? run.value.id : ''
  await waitFor(() => h.engine.findRun(runId)?.status === 'succeeded')
  const finished = h.engine.findRun(runId) as Run
  eq('运行成功', finished.status, 'succeeded')
  eq('按任务模型钉在本会话', h.host.modelPins.at(-1), {
    sessionId: finished.sessionId as string,
    provider: 'fake',
    model: 'model-b',
  })
  eq('运行记录保存实际配置快照', finished.modelSnapshot, { provider: 'fake', model: 'model-b', reasoningEffort: 'high' })
  eq('从未调用会写回全局默认的 selectModel', h.host.selectModelCalls, 0)
  eq('宿主默认模型保持不变', h.host.defaultSelection.model, 'model-a')
  h.cleanup()
}

{
  // Without the per-agent seam the run must fail loudly instead of silently
  // switching models — that is the whole point of "strict isolation".
  const h = makeHarness()
  await h.engine.start()
  const saved = h.engine.saveTask(baseTask({ id: 'task-nopin', name: '无隔离缝', prompt: 'x' }))
  check('任务已保存', saved.ok)
  delete (h.host.sessionController.agents as { selectForNextRequest?: unknown }).selectForNextRequest
  const run = h.engine.runNow('task-nopin')
  const runId = run.ok ? run.value.id : ''
  await waitFor(() => ['failed', 'timeout'].includes(h.engine.findRun(runId)?.status ?? ''))
  const finished = h.engine.findRun(runId) as Run
  eq('缺少隔离接口时明确失败', finished.status, 'failed')
  check('失败信息点明原因', (finished.error?.message ?? '').includes('selectForNextRequest'), finished.error?.message ?? '')
  eq('仍然没有退回全局接口', h.host.selectModelCalls, 0)
  h.cleanup()
}

{
  const h = makeHarness()
  await h.engine.start()
  const saved = h.engine.saveTask(
    baseTask({ id: 'task-effort-shape', name: '档位', prompt: 'x', model: { provider: 'fake', model: 'model-b' } }),
  )
  check('保存成功', saved.ok)
  const snapshot = await h.engine.snapshot()
  const entry = snapshot.models.find((model) => model.model === 'model-b')
  eq('目录带真实 efforts', entry?.reasoning?.efforts.map((effort) => effort.id), ['low', 'high'])
  eq('目录带 defaultEffort', entry?.reasoning?.defaultEffort, 'high')
  eq('未公布档位的模型为空', snapshot.models.find((model) => model.model === 'model-a')?.reasoning, null)
  h.cleanup()
}

console.log('\n工作区绑定')
{
  const h = makeHarness()
  await h.engine.start()
  const root = join(h.dir, 'proj')
  h.host.workspaces = [{ id: 'ws-1', title: 'proj', path: root }]
  mkdirSync(root, { recursive: true })

  const saved = h.engine.saveTask(baseTask({ id: 'task-ws', name: '工作区', prompt: 'x', workspaceId: 'ws-1', workspace: root }))
  check('绑定宿主工作区成功', saved.ok, saved.ok ? '' : saved.message)
  eq('来源标记 workspace', saved.ok ? saved.value.workspaceSource : null, 'workspace')
  eq('路径来自宿主', saved.ok ? saved.value.workspace : null, root)

  // Rename/move inside the Host: the task follows the registry, not the stale copy.
  const moved = join(h.dir, 'proj-renamed')
  mkdirSync(moved, { recursive: true })
  h.host.workspaces = [{ id: 'ws-1', title: 'proj', path: moved }]
  const run = h.engine.runNow('task-ws')
  const runId = run.ok ? run.value.id : ''
  await waitFor(() => ['succeeded', 'failed'].includes(h.engine.findRun(runId)?.status ?? ''))
  eq('按宿主最新路径执行', h.engine.findRun(runId)?.workspace, moved)

  // Deleting the workspace must fail the run, never silently run elsewhere.
  h.host.workspaces = []
  const broken = h.engine.runNow('task-ws')
  const brokenId = broken.ok ? broken.value.id : ''
  await waitFor(() => ['succeeded', 'failed'].includes(h.engine.findRun(brokenId)?.status ?? ''))
  const failedRun = h.engine.findRun(brokenId) as Run
  eq('工作区被删除时运行失败', failedRun.status, 'failed')
  check('失败信息指向工作区', (failedRun.error?.message ?? '').includes('工作区'), failedRun.error?.message ?? '')
  h.cleanup()
}

{
  const h = makeHarness()
  await h.engine.start()
  h.host.workspaces = [{ id: 'ws-gone', title: 'gone', path: join(h.dir, 'missing') }]
  const saved = h.engine.saveTask(
    baseTask({ id: 'task-missing', name: '缺失目录', prompt: 'x', workspaceId: 'ws-gone', workspace: join(h.dir, 'missing') }),
  )
  check('登记了但目录不存在', saved.ok)
  const run = h.engine.runNow('task-missing')
  const runId = run.ok ? run.value.id : ''
  await waitFor(() => ['succeeded', 'failed'].includes(h.engine.findRun(runId)?.status ?? ''))
  const finished = h.engine.findRun(runId) as Run
  eq('目录缺失直接失败', finished.status, 'failed')
  eq('错误码可辨认', finished.error?.code, 'workspace_unavailable')
  check('提示修复而不是静默换目录', (finished.error?.message ?? '').includes('不存在'), finished.error?.message ?? '')
  h.cleanup()
}

console.log('\n权限三档对齐')
{
  const h = makeHarness()
  await h.engine.start()
  const listed = await h.engine.snapshot()
  eq('权限目录来自宿主', listed.permissions.map((entry) => entry.value), ['read-only', 'workspace-write', 'danger-full-access'])
  eq('权限默认档来自宿主', listed.permissionDefault, 'workspace-write')

  const saved = h.engine.saveTask(baseTask({ id: 'task-perm', name: '权限', prompt: 'x', permissionPreset: 'read-only' }))
  check('保存预设任务', saved.ok, saved.ok ? '' : saved.message)
  eq('预设反推沙箱值', saved.ok ? saved.value.permission.sandbox : null, 'read-only')

  const run = h.engine.runNow('task-perm')
  const runId = run.ok ? run.value.id : ''
  await waitFor(() => ['succeeded', 'failed'].includes(h.engine.findRun(runId)?.status ?? ''))
  eq('执行时应用到任务会话', h.host.presetSets.at(-1)?.preset, 'read-only')
  eq('运行记录带预设', h.engine.findRun(runId)?.permissionPreset, 'read-only')

  const rejected = h.engine.saveTask(
    baseTask({ id: 'task-bad-perm', name: '坏预设', prompt: 'x', permissionPreset: 'nope' }),
  )
  check('未知预设被拒绝', !rejected.ok && rejected.message.includes('不在宿主目录里'), rejected.ok ? '（竟然通过）' : rejected.message)
  h.cleanup()
}

console.log('\n旧数据迁移')
{
  const h = makeHarness()
  const root = join(h.dir, 'legacy-proj')
  mkdirSync(root, { recursive: true })
  h.host.workspaces = [{ id: 'ws-legacy', title: 'legacy', path: root }]
  // Simulate a store written by the previous version: no preset, no workspaceId,
  // no frozen model, and a permission pair that *does* match a native preset.
  h.store.replace(
    [
      {
        ...baseTask({ id: 'task-legacy', name: '老任务', prompt: 'x' }),
        model: null,
        modelSource: 'legacy',
        workspace: root,
        workspaceId: null,
        workspaceSource: 'custom',
        permission: { approval: 'ask', sandbox: 'workspace-write' },
        permissionPreset: null,
        permissionSource: 'legacy',
        legacyIssues: [],
      },
      {
        ...baseTask({ id: 'task-legacy-odd', name: '怪组合', prompt: 'x' }),
        model: null,
        modelSource: 'legacy',
        workspace: join(h.dir, 'not-registered'),
        workspaceId: null,
        workspaceSource: 'custom',
        permission: { approval: 'never', sandbox: 'read-only' },
        permissionPreset: null,
        permissionSource: 'legacy',
        legacyIssues: [],
      },
    ],
    [],
  )
  await h.engine.start()
  const tasks = h.store.tasks
  const migrated = tasks.find((task) => task.id === 'task-legacy') as Task
  eq('匹配到原生预设的旧组合升级为预设', migrated.permissionPreset, 'workspace-write')
  eq('已登记的旧路径补上 workspaceId', migrated.workspaceId, 'ws-legacy')
  check(
    '为迁移写了备份',
    readdirSync(h.dir).some((entry) => entry.includes('.pre-workspace-') && entry.endsWith('.bak')),
    readdirSync(h.dir).join(','),
  )
  check('老任务的未固化模型被标注', migrated.legacyIssues.some((issue) => issue.includes('模型未固化')), JSON.stringify(migrated.legacyIssues))

  const odd = tasks.find((task) => task.id === 'task-legacy-odd') as Task
  eq('不匹配任何预设的组合保持待确认', odd.permissionPreset, null)
  eq('并标记为 legacy', odd.permissionSource, 'legacy')
  check('给出待确认提示', odd.legacyIssues.some((issue) => issue.includes('不对应任何宿主预设')), JSON.stringify(odd.legacyIssues))
  check('未登记路径也提示', odd.legacyIssues.some((issue) => issue.includes('未登记为宿主工作区')), JSON.stringify(odd.legacyIssues))
  h.cleanup()
}

console.log('\n对话工具的模型/工作区/权限参数')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.defaultSelection = { provider: 'fake', model: 'model-b', reasoningEffort: 'low' }
  const root = join(h.dir, 'tool-ws')
  mkdirSync(root, { recursive: true })
  h.host.workspaces = [{ id: 'ws-tool', title: 'tool', path: root }]
  const definitions = new Map<string, any>()
  const dispose = registerTools({ get: () => undefined, tools: { register: (definition: any) => {
    definitions.set(definition.name, definition)
    return () => {}
  } } } as never, { engine: h.engine, ctx: h.host as never })
  const create = definitions.get('task_create') as any
  const row = await create.execute({
    name: '对话建的工作区任务',
    prompt: 'x',
    schedule: { kind: 'daily', time: '09:00' },
    timeZone: 'UTC',
    workspaceId: 'ws-tool',
    permissionPreset: 'read-only',
  })
  check('工具创建时同样固化默认模型', row.task.model.includes('fake/model-b') && row.task.model.includes('low'), row.task.model)
  check('工具能绑定宿主工作区', row.task.workspace === root || row.message.includes('ws-tool'), `${row.task.workspace} / ${row.message}`)
  eq('工具能保存权限预设', row.task.permission, 'read-only')
  const bad = await create
    .execute({ name: '坏工作区', prompt: 'x', schedule: { kind: 'daily', time: '09:00' }, timeZone: 'UTC', workspaceId: 'nope' })
    .then(() => '（未报错）', (error: Error) => error.message)
  check('不存在的工作区被拒绝', bad.includes('不在宿主的工作区列表里'), bad)
  const badPreset = await create
    .execute({ name: '坏权限', prompt: 'x', schedule: { kind: 'daily', time: '09:00' }, timeZone: 'UTC', permissionPreset: 'zzz' })
    .then(() => '（未报错）', (error: Error) => error.message)
  check('不存在的权限预设被拒绝', badPreset.includes('不在宿主目录里'), badPreset)
  dispose()
  h.cleanup()
}

console.log('\n编辑任务时的思考档位归属')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.defaultSelection = { provider: 'fake', model: 'model-a', reasoningEffort: 'high' }
  const pinned = h.engine.saveTask(baseTask({ id: 'effort-pin', name: '固化档位', prompt: 'x' }))
  eq('新建时固化默认档位', pinned.ok ? pinned.value.reasoningEffort : null, 'high')

  // The editor sends the whole task: null must clear, not fall back to the old value.
  const cleared = h.engine.saveTask({ ...(pinned.ok ? pinned.value : baseTask()), reasoningEffort: null })
  eq('显式清空为模型默认', cleared.ok ? cleared.value.reasoningEffort : null, null)

  const explicitModel = h.engine.saveTask({
    ...baseTask({ id: 'effort-explicit', name: '自选模型', prompt: 'x' }),
    model: { provider: 'fake', model: 'model-b' },
    reasoningEffort: null,
  })
  eq('自选模型不继承宿主默认档位', explicitModel.ok ? explicitModel.value.reasoningEffort : null, null)
  h.cleanup()
}

console.log('\n排队等待中的触发可以被取消')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: 'defer-1', timeoutMinutes: 5 }))
  h.engine.runNow('defer-1')
  await waitFor(() => h.store.runs.some((run) => run.status === 'running'))
  const second = h.engine.runNow('defer-1')
  const secondId = second.ok ? second.value.id : ''
  await waitFor(() => h.store.runs.some((run) => run.id === secondId && run.status === 'queued'))
  const cancelled = h.engine.cancelRun(secondId)
  check('等待中的触发可以被取消', cancelled.ok, cancelled.ok ? '' : cancelled.message)
  eq('取消后状态为 cancelled', h.store.runs.find((run) => run.id === secondId)?.status, 'cancelled')
  check('正在运行的那次不受影响', h.store.runs.some((run) => run.status === 'running'))
  h.cleanup()
}

console.log('\n损坏的相邻记录不会让调度停摆')
{
  const h = makeHarness()
  h.engine.saveTask(baseTask({ id: 'arm-1', name: '排期任务', prompt: 'x', enabled: true }))
  // An engine that is already running must survive a record the loader would now
  // reject: migration failing used to mean the scheduler never armed at all.
  ;(h.store.tasks as unknown[]).push(null)
  let threw: Error | null = null
  try {
    await h.engine.start()
  } catch (error) {
    threw = error as Error
  }
  check('开始执行不会因为坏记录抛出', threw === null, threw?.message ?? '')
  const armed = h.store.tasks.find((task) => task?.id === 'arm-1')
  check('调度仍然算出下次执行时间', armed !== null && armed !== undefined && armed.nextRunAt !== null, String(armed?.nextRunAt))
  h.cleanup()
}

console.log('\n停止运行：宿主取消失败不会变成未处理异常')
for (const mode of ['sync', 'async'] as const) {
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: `cancel-${mode}`, timeoutMinutes: 5 }))
  const result = h.engine.runNow(`cancel-${mode}`)
  const runId = result.ok ? result.value.id : ''
  await waitFor(() => h.host.promptCount === 1)
  h.host.sessionController.cancel = () => {
    if (mode === 'sync') throw new Error('cancel sync failure')
    return Promise.reject(new Error('cancel async failure'))
  }
  let thrown: unknown = null
  try {
    check(`${mode} 停止请求被接受`, h.engine.cancelRun(runId).ok)
  } catch (error) {
    thrown = error
  }
  await sleep(10)
  check(`${mode} 取消失败没有向调用者抛出`, thrown === null)
  check(`${mode} 取消失败有日志可查`, h.logs.some((line) => line.includes(`cancel ${mode} failure`)))
  h.cleanup()
}

console.log('\n长任务截止时间：回调延迟不能让逾期结果变成成功')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: 'late-result', timeoutMinutes: 20, enabled: false }))
  const result = h.engine.runNow('late-result')
  const id = result.ok ? result.value.id : ''
  await waitFor(() => h.host.promptCount === 1)
  const session = h.host.sessions.get(String(h.engine.findRun(id)?.sessionId)) as FakeSession
  h.clock.now += 20 * 60_000 + 1
  h.host.emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  eq('超过截止时间的完成事件按 timeout 收尾', h.engine.findRun(id)?.status, 'timeout')
  h.cleanup()
}
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: 'watchdog', timeoutMinutes: 20, enabled: false }))
  const result = h.engine.runNow('watchdog')
  const id = result.ok ? result.value.id : ''
  await waitFor(() => h.host.promptCount === 1)
  h.clock.now += 20 * 60_000 + 1
  await h.engine.tick()
  eq('调度恢复时收尾已逾期运行，不只等待原定时器', h.engine.findRun(id)?.status, 'timeout')
  h.cleanup()
}
{
  const h = makeHarness()
  await h.engine.start()
  const originalCreate = h.host.sessionController.create
  let resume: (() => void) | undefined
  h.host.sessionController.create = async (request) => {
    await new Promise<void>((resolve) => { resume = resolve })
    return originalCreate(request)
  }
  h.engine.saveTask(baseTask({ id: 'late-session', timeoutMinutes: 20, enabled: false }))
  const result = h.engine.runNow('late-session')
  const id = result.ok ? result.value.id : ''
  await waitFor(() => resume !== undefined)
  h.clock.now += 20 * 60_000 + 1
  resume?.()
  await sleep(30)
  eq('准备返回时已逾期则收尾为 timeout', h.engine.findRun(id)?.status, 'timeout')
  eq('逾期准备不会再调用模型', h.host.promptCount, 0)
  h.cleanup()
}

console.log('\n超时后的持续会话：迟到的取消事件不能影响下一次运行')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.host.sessionController.cancel = async () => { h.host.cancels += 1; return {} }
  h.engine.saveTask(baseTask({ id: 'late-cancel-event', timeoutMinutes: 20, sessionMode: 'persistent', enabled: false }))
  const first = h.engine.runNow('late-cancel-event')
  const firstId = first.ok ? first.value.id : ''
  await waitFor(() => h.host.promptCount === 1)
  const oldSession = h.host.sessions.get(String(h.engine.findRun(firstId)?.sessionId)) as FakeSession
  const second = h.engine.runNow('late-cancel-event')
  const secondId = second.ok ? second.value.id : ''
  h.clock.now += 20 * 60_000 + 1
  await h.engine.tick()
  await waitFor(() => h.host.promptCount === 2)
  check('超时后新的持续运行使用新会话', h.engine.findRun(secondId)?.sessionId !== oldSession.id)
  h.host.emit('session/event', oldSession, { type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } })
  eq('上次运行迟到的取消不影响新运行', h.engine.findRun(secondId)?.status, 'running')
  h.cleanup()
}

console.log('\n20 分钟期限的边界与证据')
for (const [elapsed, expected] of [[989032, 'succeeded'], [1_199_999, 'succeeded'], [1_200_000, 'timeout']] as const) {
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: `boundary-${elapsed}`, timeoutMinutes: 20, enabled: false }))
  const started = h.clock.now
  const result = h.engine.runNow(`boundary-${elapsed}`)
  const id = result.ok ? result.value.id : ''
  await waitFor(() => h.host.promptCount === 1)
  const session = h.host.sessions.get(String(h.engine.findRun(id)?.sessionId)) as FakeSession
  h.clock.now += elapsed
  h.host.emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  const run = h.engine.findRun(id)
  eq(`${elapsed}ms 时的实际完成状态`, run?.status, expected)
  eq('保存实际生效的 20 分钟设置', run?.timeoutMinutes, 20)
  eq('保存从开始执行起算的明确截止时间', run?.timeoutAt, new Date(started + 1_200_000).toISOString())
  const restored = new TaskStore(h.store.file)
  restored.load()
  eq('截止时间随运行历史持久保存', restored.runs[0]?.timeoutAt, run?.timeoutAt)
  h.cleanup()
}
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: 'fixed-deadline', timeoutMinutes: 20, enabled: false }))
  const result = h.engine.runNow('fixed-deadline')
  const id = result.ok ? result.value.id : ''
  await waitFor(() => h.host.promptCount === 1)
  await h.engine.tick(h.clock.now + 3_600_000)
  eq('仅模拟调度时间不会让真实运行提前超时', h.engine.findRun(id)?.status, 'running')
  const updated = h.engine.saveTask({ ...h.store.tasks[0], timeoutMinutes: 0.02 })
  check('运行期间可编辑将来任务的超时设置', updated.ok)
  h.clock.now += 60_000
  const session = h.host.sessions.get(String(h.engine.findRun(id)?.sessionId)) as FakeSession
  h.host.emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  eq('编辑不会追溯缩短已经开始的运行', h.engine.findRun(id)?.status, 'succeeded')
  eq('历史记录仍保存原来实际生效的设置', h.engine.findRun(id)?.timeoutMinutes, 20)
  h.cleanup()
}
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.host.sessionController.cancel = () => new Promise(() => {})
  h.engine.saveTask(baseTask({ id: 'cancel-hangs', timeoutMinutes: 20, enabled: false }))
  const result = h.engine.runNow('cancel-hangs')
  const id = result.ok ? result.value.id : ''
  await waitFor(() => h.host.promptCount === 1)
  h.clock.now += 1_200_000
  let returned = false
  void h.engine.tick().then(() => { returned = true })
  await sleep(15)
  check('取消永不返回也不会卡住调度', returned)
  eq('取消永不返回仍记为 timeout', h.engine.findRun(id)?.status, 'timeout')
  h.cleanup()
}

console.log('\n超时准备的迟到返回不能改写新运行的持续会话')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  const originalCreate = h.host.sessionController.create
  let release: (() => void) | undefined
  let calls = 0
  h.host.sessionController.create = async (request) => {
    const created = await originalCreate(request)
    calls += 1
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve })
    return created
  }
  h.engine.saveTask(baseTask({ id: 'late-persistent-create', sessionMode: 'persistent', timeoutMinutes: 20, enabled: false }))
  const first = h.engine.runNow('late-persistent-create')
  const firstId = first.ok ? first.value.id : ''
  await waitFor(() => release !== undefined)
  const second = h.engine.runNow('late-persistent-create')
  const secondId = second.ok ? second.value.id : ''
  h.clock.now += 1_200_001
  await h.engine.tick()
  await waitFor(() => h.host.promptCount === 1)
  const currentSession = String(h.engine.findRun(secondId)?.sessionId)
  release?.()
  await sleep(20)
  eq('迟到的旧 create 不覆盖新会话引用', h.store.tasks[0]?.sessionId, currentSession)
  eq('超时准备没有调用模型', h.engine.findRun(firstId)?.status, 'timeout')
  const live = h.host.sessions.get(currentSession) as FakeSession
  h.host.emit('session/event', live, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  const third = h.engine.runNow('late-persistent-create')
  const thirdId = third.ok ? third.value.id : ''
  await waitFor(() => h.host.promptCount === 2)
  eq('后续运行保留新会话的连续上下文', h.engine.findRun(thirdId)?.sessionId, currentSession)
  h.cleanup()
}
console.log('\n卸载不能被一个挂起的超时检查反向写入')
{
  const h = makeHarness()
  await h.engine.start()
  h.host.behaviour = 'hang'
  h.engine.saveTask(baseTask({ id: 'watchdog-owner', timeoutMinutes: 20, enabled: false }))
  h.engine.saveTask(baseTask({ id: 'due-after-owner', schedule: { kind: 'once', at: new Date(h.clock.now + 1_200_000).toISOString() } }))
  h.engine.runNow('watchdog-owner')
  await waitFor(() => h.host.promptCount === 1)
  h.clock.now += 1_200_001
  const pending = h.engine.tick()
  h.engine.dispose()
  const writes = h.store.stats.writes
  await pending
  eq('已卸载的检查不再产生新排队运行', h.store.runs.filter((run) => run.taskId === 'due-after-owner').length, 0)
  eq('已卸载的检查不再写入存储', h.store.stats.writes, writes)
  h.cleanup()
}

console.log(`\n结果：${passes} 通过，${failures} 失败`)
if (failures > 0) process.exitCode = 1
