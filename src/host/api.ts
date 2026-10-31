/**
 * The browser↔Host transport for the manager UI.
 *
 * A single same-origin JSON endpoint keeps the plugin independent of the
 * Host's Remote codegen: the client POSTs an `ApiRequest`, the Host answers an
 * `ApiResult`. A second prefix route serves produced artifacts so a generated
 * HTML brief can be opened straight from the run record.
 */

import { createReadStream, realpathSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

import type { ApiRequest, ApiResult } from '../shared/types.ts'
import type { TaskEngine } from './engine.ts'
import { fail } from './engine.ts'
import { deleteReminder, readHistory, readReminders, updateReminder } from './reminders.ts'
import type { TaskStore } from './store.ts'
import { listTimeZones } from './time.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyCtx = any

export const API_PREFIX = '/dsh-task-center'
const MAX_BODY_BYTES = 2 * 1024 * 1024

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
}

export interface ApiDeps {
  engine: TaskEngine
  store: TaskStore
  dataRoot: string
  log: (level: 'info' | 'warn' | 'error', text: string) => void
  /** The plugin's own Cordis context: trust checks and diagnostics read it. */
  ctx?: AnyCtx
  /** Off by default. Some probes create sessions or invoke a paid model. */
  diagnostics?: boolean
}

/** Mount the API routes; the returned disposer unmounts them again. */
export function registerApi(ctx: AnyCtx, deps: ApiDeps): () => void {
  const webServer = ctx.webServer
  if (webServer === undefined || webServer === null) {
    deps.log('error', '宿主没有提供 webServer，管理界面接口未挂载')
    return () => {}
  }
  deps.ctx = ctx
  const disposers: Array<() => void> = []
  disposers.push(
    webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: (req: any, res: any) => handle(deps, req, res),
    }),
  )
  deps.log('info', `管理接口已挂载：POST ${API_PREFIX}/api`)
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* already released by a reload */
      }
    }
  }
}

async function handle(deps: ApiDeps, req: any, res: any): Promise<void> {
  let url: URL
  try {
    url = new URL(req.url ?? '/', 'http://127.0.0.1')
  } catch {
    sendText(res, 400, 'bad url')
    return
  }
  const path = url.pathname
  // The Host's own request-trust rule, the same one the DSH web endpoints apply:
  // a request from an untrusted authority never reaches the task book.
  const trusted = requestTrusted(deps, req)
  if (trusted !== true) {
    sendText(res, trusted === null ? 503 : 403, 'forbidden: untrusted Host request')
    return
  }
  try {
    if (path === `${API_PREFIX}/api` && (req.method === 'POST' || req.method === 'GET')) {
      await handleApi(deps, req, res)
      return
    }
    if (path === `${API_PREFIX}/artifact` && req.method === 'GET') {
      handleArtifact(deps, url, res)
      return
    }
    if (path === `${API_PREFIX}/ping`) {
      sendJson(res, 200, { ok: true, value: { pong: true, version: 2, marker: 'b2' } })
      return
    }
    sendText(res, 404, 'not found')
  } catch (error) {
    deps.log('error', `接口异常：${(error as Error).message}`)
    sendJson(res, 500, { ok: false, code: 'internal', message: (error as Error).message })
  }
}

/** The only operations a GET may run: a query string must never mutate state. */
const READ_ONLY_OPS = new Set<string>([
  'state',
  'models',
  'timezones',
  'runs.list',
  'run.detail',
  'workspaces',
  'permissions',
  'debug',
  'graph',
])

const DIAGNOSTIC_OPS = new Set<string>([
  'debug', 'graph', 'tools', 'session.permission', 'tick', 'verify.chat',
])

async function handleApi(deps: ApiDeps, req: any, res: any): Promise<void> {
  let request: ApiRequest
  if (req.method === 'GET') {
    // A convenient read-only probe: /api?op=state. Mutating operations stay
    // POST-only so a link, a prefetch or a stray address-bar hit cannot clear the
    // run history or push the scheduler forward.
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const op = url.searchParams.get('op') ?? 'state'
    if (!READ_ONLY_OPS.has(op)) {
      sendJson(res, 405, { ok: false, code: 'method_not_allowed', message: `${op} 只能通过 POST 调用` })
      return
    }
    request = { op } as ApiRequest
  } else {
    const contentType = String(req.headers?.['content-type'] ?? '').toLowerCase()
    // A cross-site <form> can only send text/plain, urlencoded or multipart, so
    // anything but JSON is refused instead of being parsed as a command.
    if (contentType !== '' && !contentType.includes('application/json')) {
      sendJson(res, 415, { ok: false, code: 'unsupported_media_type', message: '请求体必须是 application/json' })
      return
    }
    const body = await readBody(req)
    try {
      request = JSON.parse(body) as ApiRequest
    } catch {
      sendJson(res, 200, { ok: false, code: 'bad_json', message: '请求体不是合法 JSON' })
      return
    }
  }
  const result = await dispatch(deps, request)
  sendJson(res, 200, result)
}

async function dispatch(deps: ApiDeps, request: ApiRequest): Promise<ApiResult<unknown>> {
  if (DIAGNOSTIC_OPS.has(request?.op) && deps.diagnostics !== true) {
    return fail('diagnostics_disabled', '诊断接口默认关闭；仅在明确需要时启用 diagnostics 配置')
  }
  const engine = deps.engine
  const ctx = deps.ctx
  switch (request?.op) {
    case 'state': {
      // Two independent sources, one payload: a failing reminder read must not
      // blank the task list, and vice versa.
      const snapshot = await engine.snapshot()
      const reminders = await readReminders(ctx)
      return {
        ok: true,
        value: { ...snapshot, reminders: reminders.rows, reminderError: reminders.error },
      }
    }
    case 'reminder.history': {
      try {
        const history = await readHistory(ctx, request.id, request.sessionId, request.limit)
        return { ok: true, value: history }
      } catch (error) {
        return fail('reminder_history_failed', (error as Error).message)
      }
    }
    case 'reminder.update': {
      try {
        const record = await updateReminder(ctx, {
          id: request.id,
          sessionId: request.sessionId,
          title: request.title,
          prompt: request.prompt,
          change: request.change,
        })
        const reminders = await readReminders(ctx)
        return {
          ok: true,
          value: { record, reminders: reminders.rows, reminderError: reminders.error },
        }
      } catch (error) {
        return fail('reminder_update_failed', (error as Error).message)
      }
    }
    case 'reminder.delete': {
      try {
        const result = await deleteReminder(ctx, request.id, request.sessionId)
        const reminders = await readReminders(ctx)
        return {
          ok: true,
          value: { deleted: result.deleted, reminders: reminders.rows, reminderError: reminders.error },
        }
      } catch (error) {
        return fail('reminder_delete_failed', (error as Error).message)
      }
    }
    case 'task.save':
      return engine.saveTask(request.task)
    case 'task.delete':
      return engine.deleteTask(request.id)
    case 'task.enabled':
      return engine.setEnabled(request.id, request.enabled)
    case 'task.bulk':
      return engine.bulk(request.ids, request.action)
    case 'task.duplicate':
      return engine.duplicate(request.id)
    case 'run.now':
      return engine.runNow(request.id)
    case 'run.cancel':
      return engine.cancelRun(request.runId)
    case 'run.retry':
      return engine.retryRun(request.runId)
    case 'runs.list':
      return { ok: true, value: engine.listRuns(request.filter) }
    case 'run.detail': {
      const run = engine.findRun(request.runId)
      return run === null
        ? { ok: false, code: 'run_not_found', message: '运行记录不存在' }
        : { ok: true, value: run }
    }
    case 'runs.clear':
      return engine.clearRuns()
    case 'models': {
      const snapshot = await engine.snapshot()
      return { ok: true, value: snapshot.models }
    }
    case 'session.permission': {
      try {
        return { ok: true, value: await engine.sessionPermission(request.sessionId) }
      } catch (error) {
        return fail('session_permission_failed', (error as Error).message)
      }
    }
    case 'workspaces': {
      return { ok: true, value: engine.catalogs().workspaces }
    }
    case 'permissions': {
      const catalogs = engine.catalogs()
      return { ok: true, value: { options: catalogs.permissions, defaultPreset: catalogs.permissionDefault } }
    }
    case 'workspace.create': {
      try {
        return { ok: true, value: await engine.registerWorkspace(request.path) }
      } catch (error) {
        return fail('workspace_create_failed', (error as Error).message)
      }
    }
    case 'timezones':
      return { ok: true, value: listTimeZones() }
    case 'tick': {
      const at = typeof request.now === 'string' ? Date.parse(request.now) : Number.NaN
      await engine.tick(Number.isFinite(at) ? at : undefined)
      return { ok: true, value: await engine.snapshot() }
    }
    case 'debug': {
      const ctx = deps.ctx
      const optional = (name: string): any => {
        try {
          return ctx?.get?.(name, false)
        } catch {
          return undefined
        }
      }
      const out: Record<string, unknown> = { dataRoot: deps.dataRoot, store: deps.store.stats }
      try {
        const sessionController = ctx?.sessionController
        out.sessionController = sessionController !== undefined
        out.modelCatalogFn = typeof sessionController?.modelCatalog
        const raw = await sessionController?.modelCatalog?.()
        out.rawCatalog = raw === undefined ? null : JSON.parse(JSON.stringify(raw))
      } catch (error) {
        out.catalogError = (error as Error).message
      }
      try {
        const clientModules = optional('clientModules')
        out.clientModules = clientModules !== undefined
        out.clientPath = clientModules?.clientPath?.('@dsh-external/dsh-task-center') ?? null
      } catch (error) {
        out.clientModulesError = (error as Error).message
      }
      try {
        out.agentDefaultModel = optional('agentDefaultModel')?.currentSelection?.() ?? null
      } catch (error) {
        out.defaultModelError = (error as Error).message
      }
      return { ok: true, value: out }
    }
    case 'graph': {
      // Diagnostic: which client batch URL serves this plugin's UI bundle?
      try {
        const clientModules = (ctx as { get?: (name: string, strict?: boolean) => any }).get?.('clientModules', false)
        const graph = clientModules?.graph?.() ?? {}
        const batches = Array.isArray(graph.batches) ? graph.batches : []
        const rows = batches.map((batch: any) => ({
          phase: batch?.phase ?? null,
          url: batch?.url ?? null,
          ids: Array.isArray(batch?.ids) ? batch.ids : [],
        }))
        return { ok: true, value: { clientPath: clientModules?.clientPath?.('@dsh-external/dsh-task-center') ?? null, rows } }
      } catch (error) {
        return { ok: false, code: 'graph_unavailable', message: (error as Error).message }
      }
    }
    case 'tools': {
      // Diagnostic: does a real session's agent see the plugin tools?
      const ctx = deps.ctx
      const tools = (ctx as { get?: (name: string, strict?: boolean) => any }).get?.('tools', false)
      try {
        const globalNames = (tools?.schemas?.() ?? []).map((schema: any) => String(schema?.name ?? ''))
        let sessionId = typeof request.sessionId === 'string' ? request.sessionId : null
        let sessionNames: string[] | null = null
        let error: string | null = null
        if (sessionId === null) {
          const created = await ctx?.sessionController?.create?.({ cwd: deps.dataRoot })
          sessionId = created?.sessionId ?? null
        }
        if (sessionId !== null) {
          try {
            const agent = await ctx?.sessionController?.resolveAgent?.(sessionId)
            const live = agent?.agent ?? agent
            sessionNames = (tools?.schemas?.(live) ?? []).map((schema: any) => String(schema?.name ?? ''))
          } catch (problem) {
            error = (problem as Error).message
          }
        }
        return { ok: true, value: { globalNames, sessionId, sessionNames, error } }
      } catch (problem) {
        return { ok: false, code: 'tools_unavailable', message: (problem as Error).message }
      }
    }
    case 'verify.chat': {
      // End-to-end proof that a plain session can create a task by talking.
      const ctx = deps.ctx
      const controller = ctx?.sessionController
      const name = typeof request.name === 'string' && request.name.trim() !== '' ? request.name.trim() : '聊天创建验收'
      const created = await controller?.create?.({ cwd: deps.dataRoot })
      const sessionId: string | null = created?.sessionId ?? null
      if (sessionId === null) return { ok: false, code: 'session_unavailable', message: '无法创建会话' }
      const calls: string[] = []
      let done = false
      const off = ctx?.on?.('session/event', (session: any, event: any) => {
        if (session?.id !== sessionId) return
        if (event?.type === 'tool/call') calls.push(String(event?.data?.name ?? ''))
        if (event?.type === 'turn/end') done = true
      })
      const prompt =
        typeof request.prompt === 'string' && request.prompt.trim() !== ''
          ? request.prompt.trim()
          : `请用 task_create 工具创建这个定时任务，不要用别的办法：名称「${name}」，` +
            '每天 09:00 执行（时区 Asia/Shanghai），提示词「生成一份测试用 HTML 日报」。' +
            '创建成功后只回复任务 id 和名称。'
      await controller?.prompt?.(
        { sessionId, content: [{ type: 'text', text: prompt }], mode: 'queue', requestId: `verify-chat-${Date.now()}` },
        new AbortController().signal,
      )
      const deadline = Date.now() + 240_000
      while (!done && Date.now() < deadline) await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
      off?.()
      const task = deps.store.tasks.find((entry) => entry.name === name) ?? null
      return {
        ok: true,
        value: {
          sessionId,
          finished: done,
          calls,
          usedTaskCreate: calls.includes('task_create'),
          taskCreated: task === null ? null : { id: task.id, name: task.name, schedule: task.schedule, timeZone: task.timeZone },
        },
      }
    }
    case 'open.run': {
      const run = engine.findRun(request.runId)
      return run === null
        ? { ok: false, code: 'run_not_found', message: '运行记录不存在' }
        : { ok: true, value: { sessionId: run.sessionId } }
    }
    default:
      return { ok: false, code: 'unknown_op', message: `未知操作 ${String((request as { op?: string })?.op)}` }
  }
}


/* -------------------------------------------------------------- transport */

function readBody(req: any): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', (error: Error) => reject(error))
  })
}

function sendJson(res: any, status: number, payload: unknown): void {
  const text = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function sendText(res: any, status: number, text: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(text)
}

/**
 * Serve one recorded artifact of one run.
 *
 * Authorization is the run record, not a path prefix: the requested file must be
 * an artifact *that run* registered, its real path must stay inside the folder
 * that run executed in, and plugin-internal files are never served. Handing out a
 * generated HTML brief then cannot be turned into a file-read primitive.
 */
function handleArtifact(deps: ApiDeps, url: URL, res: any): void {
  const runId = url.searchParams.get('runId')
  const raw = url.searchParams.get('path')
  if (runId === null || runId.length === 0) {
    sendText(res, 400, 'missing runId')
    return
  }
  if (raw === null || raw.length === 0) {
    sendText(res, 400, 'missing path')
    return
  }
  const run = deps.engine.findRun(runId)
  if (run === null) {
    sendText(res, 404, 'run not found')
    return
  }
  const recorded = run.artifacts.some((artifact) => artifact.path === raw)
  if (!recorded) {
    sendText(res, 403, 'not a recorded artifact of this run')
    return
  }
  let target: string
  let stat: ReturnType<typeof statSync>
  try {
    // Resolve symlinks before the boundary check, so a link cannot walk out.
    target = realpathSync(raw)
    stat = statSync(target)
  } catch {
    sendText(res, 404, 'not found')
    return
  }
  if (!stat.isFile()) {
    sendText(res, 400, 'not a file')
    return
  }
  const root = runRoot(deps, run)
  if (root !== null) {
    let realRoot: string
    try {
      realRoot = realpathSync(root)
    } catch {
      sendText(res, 409, 'workspace no longer exists')
      return
    }
    if (target !== realRoot && !target.startsWith(`${realRoot}${sep}`)) {
      sendText(res, 403, 'artifact outside the run workspace')
      return
    }
  }
  if (isInternalFile(target, deps)) {
    sendText(res, 403, 'plugin state is not a deliverable')
    return
  }
  const type = CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream'
  const stream = createReadStream(target)
  // The file can disappear or become unreadable between stat and open. An
  // unhandled 'error' on that stream would take the whole Host process down, so
  // it is always answered — and the success headers are only written once the
  // file is really open, so a failure cannot look like a truncated 200 either.
  stream.once('open', () => {
    res.writeHead(200, {
      'content-type': type,
      'content-length': stat.size,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...previewPolicy(target, type),
    })
    stream.pipe(res)
  })
  stream.on('error', (error: Error) => {
    deps.log('warn', `读取产物失败：${error.message}`)
    if (!res.headersSent) {
      sendText(res, 500, 'cannot read artifact')
      return
    }
    res.destroy(error)
  })
  res.on('close', () => {
    // Nobody is reading any more: stop pumping bytes into a dead socket.
    stream.destroy()
  })
}

/**
 * A generated HTML page is shown in an opaque origin (`sandbox` without
 * `allow-same-origin`), so it cannot read DSH cookies, storage or the task API
 * even though it is served from the same host. Its own inline styles still work.
 */
function previewPolicy(target: string, type: string): Record<string, string> {
  const extension = extname(target).toLowerCase()
  // HTML is not the only active content: an SVG opened directly runs its own
  // scripts in this origin, so it gets the same opaque-origin cage as a page.
  const active =
    type.startsWith('text/html') ||
    type === 'image/svg+xml' ||
    type.startsWith('text/xml') ||
    type.startsWith('application/xml') ||
    extension === '.htm' ||
    extension === '.svg' ||
    extension === '.xml' ||
    extension === '.xhtml' ||
    extension === '.mhtml'
  if (!active) return {}
  return {
    'content-security-policy':
      "sandbox allow-popups allow-popups-to-escape-sandbox allow-downloads; default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; media-src data: blob:",
    'cross-origin-resource-policy': 'same-origin',
  }
}

/** The folder a run executed in; falls back to the task's folder for old records. */
function runRoot(deps: ApiDeps, run: { workspace?: string; taskId: string }): string | null {
  if (typeof run.workspace === 'string' && run.workspace.length > 0) return run.workspace
  const task = deps.store.tasks.find((entry) => entry.id === run.taskId)
  return task?.workspace ?? null
}

/** Plugin bookkeeping (state.json, per-task data folders) is never a deliverable. */
function isInternalFile(target: string, deps: ApiDeps): boolean {
  // The artifact path is already a realpath, so the bookkeeping folders have to
  // be compared in their real form too: on macOS `/var/...` is really
  // `/private/var/...`, and that difference used to hide `state.json`.
  const configured = resolve(deps.dataRoot)
  const roots = [configured]
  try {
    const real = realpathSync(configured)
    if (real !== configured) roots.push(real)
  } catch {
    /* the folder may not exist yet */
  }
  for (const root of roots) {
    if (target === join(root, 'state.json')) return true
    const tasks = join(root, 'tasks')
    if (target === tasks || target.startsWith(`${tasks}${sep}`)) return true
  }
  return target.split(sep).includes('.dsh-task-center')
}

/**
 * Ask the Host whether this request may be trusted.
 * @returns true/false when the capability exists, `null` when it is absent.
 */
function requestTrusted(deps: ApiDeps, req: any): boolean | null {
  const ctx = deps.ctx as { get?: (name: string, strict?: boolean) => any } | undefined
  let connection: any
  try {
    connection = ctx?.get?.('connection', false)
  } catch {
    return null
  }
  if (connection === undefined || connection === null || typeof connection.isTrusted !== 'function') return null
  try {
    return connection.isTrusted(req) === true
  } catch {
    return false
  }
}
