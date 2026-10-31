/**
 * Deterministic tests for the HTTP transport and the state file loader.
 *
 * These are the paths a unit test of the scheduler cannot reach: an artifact is
 * served, a query string tries to mutate state, a file turns unreadable, and the
 * JSON on disk parses but contains junk. All four used to fail loudly in
 * production (wrong origin policy, silent mutation, a crashed Host, a blank UI),
 * so they get real assertions here.
 *
 *   node scripts/test.mjs
 */

import { Writable, Readable } from 'node:stream'
import { once } from 'node:events'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { registerApi, API_PREFIX } from '../src/host/api.ts'
import { TaskEngine } from '../src/host/engine.ts'
import { TaskStore } from '../src/host/store.ts'
import { registerTools } from '../src/host/tools.ts'
import type { ApiResult, Run, Task } from '../src/shared/types.ts'

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

/** A response stand-in that records the status, the headers and the body. */
class FakeResponse extends Writable {
  statusCode = 0
  headers: Record<string, string> = {}
  chunks: Buffer[] = []
  headersSent = false
  destroyedWith: Error | null = null

  writeHead(status: number, headers: Record<string, string> = {}): this {
    this.statusCode = status
    this.headers = headers
    this.headersSent = true
    return this
  }

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk))
    callback()
  }

  destroy(error?: Error): this {
    this.destroyedWith = error ?? null
    return this
  }

  get text(): string {
    return Buffer.concat(this.chunks).toString('utf8')
  }

  /** Header lookup is case-insensitive, like the real thing. */
  header(name: string): string | undefined {
    const wanted = name.toLowerCase()
    for (const [key, value] of Object.entries(this.headers)) {
      if (key.toLowerCase() === wanted) return value
    }
    return undefined
  }
}

interface FakeRequestInit {
  method?: string
  url: string
  body?: string
  contentType?: string
}

/** A request stand-in; a body becomes a one-chunk readable. */
function makeRequest(init: FakeRequestInit): any {
  const headers: Record<string, string> = {}
  if (init.contentType !== undefined) headers['content-type'] = init.contentType
  const base =
    init.body === undefined
      ? Readable.from([])
      : Readable.from([Buffer.from(init.body, 'utf8')])
  return Object.assign(base, {
    method: init.method ?? 'GET',
    url: init.url,
    headers,
  })
}

function makeHost(options: { diagnostics?: boolean; trust?: 'trusted' | 'untrusted' | 'missing' } = {}): {
  dir: string
  dataRoot: string
  workspace: string
  store: TaskStore
  engine: TaskEngine
  handler: Handler
  effects: { sessions: number }
} {
  const dir = mkdtempSync(join(tmpdir(), 'task-center-api-'))
  const dataRoot = join(dir, 'data')
  const workspace = join(dir, 'workspace')
  mkdirSync(dataRoot, { recursive: true })
  mkdirSync(workspace, { recursive: true })

  const store = new TaskStore(join(dataRoot, 'state.json'))
  store.load()
  const effects = { sessions: 0 }
  let handler: ((req: any, res: any) => Promise<void> | void) | null = null
  const ctx: any = {
    get: (name: string) => (name === 'connection' && options.trust !== 'missing'
      ? { isTrusted: () => options.trust !== 'untrusted' } : undefined),
    sessionController: { create: async () => {
      effects.sessions += 1
      return { sessionId: 'diagnostic-session' }
    } },
    on: () => () => {},
    logger: () => {},
    webServer: {
      register: (route: any) => {
        handler = route.handler
        return () => {}
      },
    },
  }
  const engine = new TaskEngine(ctx, store, {
    maxConcurrentRuns: 1,
    runHistory: 50,
    defaultTimeoutMinutes: 20,
    graceSeconds: 90,
    dataRoot,
    log: () => {},
  })
  registerApi(ctx, { engine, store, dataRoot, log: () => {}, diagnostics: options.diagnostics })
  if (handler === null) throw new Error('接口没有挂载')
  return { dir, dataRoot, workspace, store, engine, handler: handler as Handler, effects }
}

type Handler = (req: any, res: any) => Promise<void> | void

async function call(handler: Handler, init: FakeRequestInit): Promise<FakeResponse> {
  const res = new FakeResponse()
  await handler(makeRequest({ ...init, url: init.url }), res)
  if (!res.writableEnded) await once(res, 'finish')
  return res
}

function apiBody(res: FakeResponse): ApiResult<unknown> {
  return JSON.parse(res.text) as ApiResult<unknown>
}

const task: Task = {
  id: 'task-1',
  name: '样例任务',
  prompt: '写一份摘要',
  attachments: [],
  model: null,
  modelSource: 'legacy',
  workspace: null,
  workspaceId: null,
  workspaceSource: 'task-dir',
  sessionMode: 'independent',
  sessionId: null,
  sessionModelKey: null,
  reasoningEffort: null,
  permission: { approval: 'never', sandbox: 'workspace-write' },
  permissionPreset: 'workspace-write',
  permissionSource: 'preset',
  legacyIssues: [],
  schedule: { kind: 'daily', time: '09:00' },
  timeZone: 'Asia/Shanghai',
  startAt: null,
  endAt: null,
  missedPolicy: 'catchup',
  enabled: false,
  maxRetries: 0,
  timeoutMinutes: 20,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: null,
  lastError: null,
  templateId: null,
}

function makeRun(overrides: Partial<Run> & { artifacts: Run['artifacts'] }): Run {
  return {
    id: 'run-1',
    taskId: task.id,
    taskName: task.name,
    status: 'succeeded',
    trigger: 'manual',
    scheduledFor: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:01:00.000Z',
    durationMs: 60_000,
    sessionId: null,
    sessionMode: 'independent',
    workspace: '',
    modelSnapshot: null,
    permissionPreset: 'workspace-write',
    attempt: 1,
    retryAt: null,
    error: null,
    output: null,
    tools: [],
    log: [],
    ...overrides,
  }
}

/* -------------------------------------------------------- state and methods */

console.log('\n接口：方法与状态文件')
{
  const host = makeHost()
  host.store.replace([task], [])

  const state = await call(host.handler, { url: `${API_PREFIX}/api?op=state` })
  eq('GET op=state 可用', state.statusCode, 200)
  const body = apiBody(state)
  check('GET op=state 返回 ok', body.ok === true, JSON.stringify(body).slice(0, 120))

  const cleared = await call(host.handler, { url: `${API_PREFIX}/api?op=runs.clear` })
  eq('GET 拒绝写操作（405）', cleared.statusCode, 405)
  const clearedBody = apiBody(cleared) as { ok: boolean; code?: string }
  eq('GET 拒绝写操作时给出原因', clearedBody.code, 'method_not_allowed')

  const plain = await call(host.handler, {
    method: 'POST',
    url: `${API_PREFIX}/api`,
    body: JSON.stringify({ op: 'runs.clear' }),
    contentType: 'text/plain',
  })
  eq('POST 拒绝非 JSON 内容类型（415）', plain.statusCode, 415)

  const json = await call(host.handler, {
    method: 'POST',
    url: `${API_PREFIX}/api`,
    body: JSON.stringify({ op: 'state' }),
    contentType: 'application/json; charset=utf-8',
  })
  eq('POST JSON 正常', json.statusCode, 200)
  eq('POST JSON 返回 ok', (apiBody(json) as { ok: boolean }).ok, true)

  rmSync(host.dir, { recursive: true, force: true })
}

/* --------------------------------------------------------------- artifacts */

console.log('\n接口：产物授权与隔离')
{
  const host = makeHost()
  const html = join(host.workspace, 'brief.html')
  const svg = join(host.workspace, 'chart.svg')
  const outside = join(host.dir, 'outside.html')
  writeFileSync(html, '<h1>ok</h1>')
  writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  writeFileSync(outside, '<h1>nope</h1>')

  const run = makeRun({
    workspace: host.workspace,
    artifacts: [
      { path: html, size: 11, mtime: '2026-01-01T00:01:00.000Z' },
      { path: svg, size: 70, mtime: '2026-01-01T00:01:00.000Z' },
    ],
  })
  host.store.replace([task], [run])

  const page = await call(host.handler, {
    url: `${API_PREFIX}/artifact?runId=run-1&path=${encodeURIComponent(html)}`,
  })
  eq('HTML 产物 200', page.statusCode, 200)
  const pagePolicy = page.header('content-security-policy') ?? ''
  check('HTML 在沙箱里渲染（无 allow-same-origin）', pagePolicy.includes('sandbox') && !pagePolicy.includes('allow-same-origin'), pagePolicy)
  eq('HTML 带 nosniff', page.header('x-content-type-options'), 'nosniff')

  const vector = await call(host.handler, {
    url: `${API_PREFIX}/artifact?runId=run-1&path=${encodeURIComponent(svg)}`,
  })
  eq('SVG 产物 200', vector.statusCode, 200)
  const vectorPolicy = vector.header('content-security-policy') ?? ''
  check(
    'SVG 也拿不到同源脚本能力',
    vectorPolicy.includes('sandbox') && !vectorPolicy.includes('allow-same-origin'),
    vectorPolicy,
  )

  const notRecorded = await call(host.handler, {
    url: `${API_PREFIX}/artifact?runId=run-1&path=${encodeURIComponent(outside)}`,
  })
  eq('未登记的路径 403', notRecorded.statusCode, 403)

  const unknown = await call(host.handler, {
    url: `${API_PREFIX}/artifact?runId=nope&path=${encodeURIComponent(html)}`,
  })
  eq('未知运行 404', unknown.statusCode, 404)

  const internal = join(host.dataRoot, 'state.json')
  writeFileSync(internal, '{}')
  host.store.replace([task], [makeRun({ workspace: host.dataRoot, artifacts: [{ path: internal, size: 2, mtime: '2026-01-01T00:01:00.000Z' }] })])
  const internalResponse = await call(host.handler, {
    url: `${API_PREFIX}/artifact?runId=run-1&path=${encodeURIComponent(internal)}`,
  })
  eq('插件自己的 state.json 403', internalResponse.statusCode, 403)

  rmSync(host.dir, { recursive: true, force: true })
}

console.log('\n接口：读不出的产物不会拖垮宿主')
{
  const host = makeHost()
  const broken = join(host.workspace, 'broken.html')
  writeFileSync(broken, '<h1>ok</h1>')
  host.store.replace([task], [
    makeRun({ workspace: host.workspace, artifacts: [{ path: broken, size: 11, mtime: '2026-01-01T00:01:00.000Z' }] }),
  ])

  let unreadable = false
  try {
    chmodSync(broken, 0o000)
    unreadable = true
  } catch {
    unreadable = false
  }
  const response = await call(host.handler, {
    url: `${API_PREFIX}/artifact?runId=run-1&path=${encodeURIComponent(broken)}`,
  })
  if (unreadable) {
    // The stream open fails; the handler must answer instead of throwing an
    // unhandled 'error' event that would end the Host process.
    eq('读取失败以 500 收场', response.statusCode, 500)
    eq('失败时没有写成功头', response.headersSent, true)
    check('进程仍然存活（未抛未捕获异常）', true)
  } else {
    check('权限不可用的环境跳过读取失败用例', true)
  }
  try {
    chmodSync(broken, 0o600)
  } catch {
    /* nothing to restore */
  }
  rmSync(host.dir, { recursive: true, force: true })
}

/* ------------------------------------------------------------ state repair */

console.log('\n存储：半损坏的 JSON 不会毒死引擎')
{
  const dir = mkdtempSync(join(tmpdir(), 'task-center-store-'))
  const file = join(dir, 'state.json')
  writeFileSync(
    file,
    JSON.stringify({ version: 1, tasks: [null, { id: 'broken' }, task], runs: [null, { id: 'r' }] }),
  )
  const store = new TaskStore(file)
  const loaded = store.load()
  eq('无法识别的记录被跳过', loaded.dropped, 4)
  eq('可识别任务保留', store.tasks.length, 1)
  eq('可识别运行记录保留', store.runs.length, 0)
  eq('保留下来的是正确的任务', store.tasks[0]?.id, 'task-1')
  check('报告了恢复情况', loaded.recovered === true && (loaded.message ?? '').includes('4'))

  const ctx: any = { get: () => undefined, on: () => () => {}, logger: () => {} }
  const engine = new TaskEngine(ctx, store, {
    maxConcurrentRuns: 1,
    runHistory: 10,
    defaultTimeoutMinutes: 20,
    graceSeconds: 90,
    dataRoot: dir,
    log: () => {},
  })
  const snapshot = await engine.snapshot()
  eq('跳过坏记录后快照可用', snapshot.tasks.length, 1)
  engine.dispose()
  rmSync(dir, { recursive: true, force: true })
}

/* ------------------------------------------------------------------- tools */

console.log('\n对话工具：不能自行开启完全权限')
{
  const registered: any[] = []
  const ctx: any = {
    get: () => undefined,
    on: () => () => {},
    logger: () => {},
    tools: { register: (definition: any) => registered.push(definition) ?? (() => {}) },
  }
  let snapshotCalls = 0
  const engine = {
    snapshot: async () => {
      snapshotCalls += 1
      return { permissions: [{ value: 'danger-full-access', name: 'danger-full-access' }] }
    },
    taskByIdOrName: () => ({ ...task, permissionPreset: null, permissionSource: 'legacy' }),
  }
  const dispose = registerTools(ctx, { engine: engine as never, ctx })
  check('注册了任务工具', registered.length >= 5, String(registered.length))
  const create = registered.find((definition) => definition.name === 'task_create')
  check('task_create 存在', create !== undefined)

  let rejected: Error | null = null
  try {
    await create.execute(
      {
        name: '提升权限',
        prompt: '跑任意命令',
        schedule: { kind: 'daily', time: '09:00' },
        permissionPreset: 'danger-full-access',
        enabled: false,
      },
      { agent: { session: { id: 'session-x', requestHeader: () => ({}) } }, signal: new AbortController().signal },
    )
  } catch (error) {
    rejected = error as Error
  }
  check('完全权限被拒绝', rejected !== null && /完全权限/.test(rejected.message), rejected?.message ?? '未报错')
  eq('拒绝发生在读取权限目录之前', snapshotCalls, 0)

  const update = registered.find((definition) => definition.name === 'task_update')
  let updateRejected: Error | null = null
  try {
    await update.execute(
      {
        idOrName: 'whatever',
        permissionPreset: 'danger-full-access',
      },
      { agent: { session: { id: 'session-x', requestHeader: () => ({}) } }, signal: new AbortController().signal },
    )
  } catch (error) {
    updateRejected = error as Error
  }
  check('task_update 同样拒绝完全权限', updateRejected !== null && /完全权限/.test(updateRejected.message), updateRejected?.message ?? '未报错')

  dispose()
}

console.log('\n公开发布：诊断默认关闭与请求信任')
{
  const host = makeHost()
  for (const op of ['debug', 'graph', 'tools', 'session.permission', 'tick', 'verify.chat']) {
    const response = await call(host.handler, {
      url: `${API_PREFIX}/api`, method: 'POST', contentType: 'application/json', body: JSON.stringify({ op }),
    })
    eq(`${op} 默认关闭`, (apiBody(response) as { code?: string }).code, 'diagnostics_disabled')
  }
  eq('关闭的诊断不会创建真实会话', host.effects.sessions, 0)
  host.engine.dispose()
  rmSync(host.dir, { recursive: true, force: true })
}
{
  const host = makeHost({ diagnostics: true })
  const response = await call(host.handler, { url: `${API_PREFIX}/api?op=debug` })
  check('显式配置后可读取诊断', apiBody(response).ok)
  const tools = await call(host.handler, { url: `${API_PREFIX}/api?op=tools` })
  eq('即使启用诊断，GET 也不能创建会话', tools.statusCode, 405)
  eq('GET 没有创建会话', host.effects.sessions, 0)
  host.engine.dispose()
  rmSync(host.dir, { recursive: true, force: true })
}
for (const [trust, status] of [['untrusted', 403], ['missing', 503]] as const) {
  const host = makeHost({ trust })
  const response = await call(host.handler, { url: `${API_PREFIX}/api?op=state` })
  eq(`信任检查 ${trust} 时拒绝访问`, response.statusCode, status)
  host.engine.dispose()
  rmSync(host.dir, { recursive: true, force: true })
}
{
  const host = makeHost()
  const original = JSON.stringify({ version: 1, tasks: [task, null], runs: [] })
  writeFileSync(host.store.file, original)
  const report = host.store.load()
  eq('部分损坏仍加载可识别记录', report.dropped, 1)
  host.store.flush()
  const backup = readdirSync(host.dataRoot).find((name) => name.includes('.invalid-'))
  check('修复写回后仍保留原始文件备份', backup !== undefined && readFileSync(join(host.dataRoot, backup), 'utf8') === original)
  if (process.platform !== 'win32') eq('任务与提示词文件仅所有者可读写', statSync(host.store.file).mode & 0o777, 0o600)
  host.engine.dispose()
  rmSync(host.dir, { recursive: true, force: true })
}

console.log(`\n结果：${passes} 通过，${failures} 失败`)
if (failures > 0) process.exitCode = 1
