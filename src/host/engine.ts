/**
 * The execution engine: task definitions → planned occurrences → real runs →
 * delivered artifacts. These four layers stay separate on purpose, because a
 * scheduled message that reached a Session inbox is *not* a completed job.
 *
 * Owns:
 *  - the wall-clock scheduler (one re-armed timer, never a timer per task)
 *  - the run queue (bounded concurrency, one run per task at a time)
 *  - the Session lifecycle for both session modes
 *  - turn observation: real status, tool list, output text, artifacts, errors
 *  - catch-up for runs missed while DSH was closed, and failure retries
 */

import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type {
  ApiErr,
  ApiResult,
  ModelCatalogEntry,
  PermissionEntry,
  Run,
  RunFilter,
  RunStatus,
  RunTrigger,
  StateSnapshot,
  Task,
  WorkspaceEntry,
} from '../shared/types.ts'
import { scanArtifacts } from './artifacts.ts'
import type { TaskStore } from './store.ts'
import { TEMPLATES } from './templates.ts'
import {
  describeSchedule,
  formatInstant,
  hostTimeZone,
  nextOccurrence,
  previousOccurrence,
  withinWindow,
} from './time.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyCtx = any

/** Host catalogs a save validates against; `null` means "could not read". */
export interface TaskDefaults {
  model: { provider: string; model: string; reasoningEffort: string | null } | null
  workspaceIds: Set<string> | null
  presets: string[] | null
  presetSpecs: Record<string, { sandbox: string; approval: string }>
}

export interface EngineOptions {
  maxConcurrentRuns: number
  runHistory: number
  defaultTimeoutMinutes: number
  /** A tick this late still counts as the on-time occurrence. */
  graceSeconds: number
  /** Folder for per-task cross-run data when the task has no working folder. */
  dataRoot: string
  log: (level: 'info' | 'warn' | 'error', text: string) => void
  clock?: () => number
}

interface QueueItem {
  runId: string
  taskId: string
  trigger: RunTrigger
  scheduledFor: string | null
  attempt: number
  /** True once we told the user this trigger is waiting for the active run. */
  deferred?: boolean
}

interface ActiveRun {
  runId: string
  taskId: string
  /** Engine generation that owns this run; an older generation must not write. */
  generation: number
  sessionId: string
  sessionMode: Task['sessionMode']
  turnId: string | null
  workspace: string
  startedMs: number
  timeout: ReturnType<typeof setTimeout> | null
  cancelTimeout: ReturnType<typeof setTimeout> | null
  /**
   * Why we asked to cancel: a manual stop and a timeout end in different
   * statuses even though both surface as an aborted turn.
   */
  cancelReason: 'user' | 'timeout' | null
  texts: string[]
  tools: Array<{ name: string; title: string }>
}

const MAX_OUTPUT_CHARS = 4000
const MODEL_CACHE_MS = 60_000
const TIMER_CEILING_MS = 30_000
const RETRY_BACKOFF_MS = 60_000

export class TaskEngine {
  private readonly ctx: AnyCtx
  private readonly store: TaskStore
  private readonly options: EngineOptions
  private readonly now: () => number

  private readonly active = new Map<string, ActiveRun>()
  private readonly activeByTask = new Map<string, string>()
  private readonly bySession = new Map<string, string>()
  private queue: QueueItem[] = []
  /** Triggers waiting for their task's active run to end (never dropped). */
  private deferred: QueueItem[] = []
  private generation = 0
  private retries = new Set<ReturnType<typeof setTimeout>>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()
  private models: ModelCatalogEntry[] = []
  private modelsAt = 0
  private started = false
  private disposed = false
  private stopListening: Array<() => void> = []

  constructor(ctx: AnyCtx, store: TaskStore, options: EngineOptions) {
    this.ctx = ctx
    this.store = store
    this.options = options
    this.now = options.clock ?? (() => Date.now())
  }

  /* ------------------------------------------------------------------ life */

  /** Wire host events, restore pending schedules, and fire any missed run. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.generation += 1
    this.stopListening.push(this.ctx.on('session/event', (session: any, event: any) => this.onSessionEvent(session, event)))
    // Migration and orphan cleanup both touch stored records. A surprise in
    // either must not stop the scheduler from arming: an un-armed engine would
    // silently stop every task until the next restart.
    try {
      await this.migrateLegacy()
    } catch (error) {
      this.log('error', `迁移旧任务失败，已跳过：${(error as Error).message}`)
    }
    try {
      this.reconcileOrphans()
    } catch (error) {
      this.log('error', `收尾上次未完成的运行失败：${(error as Error).message}`)
    }
    this.arm()
    this.log('info', `任务中心已启动：${this.store.tasks.length} 个任务，${this.store.runs.length} 条运行记录`)
    try {
      await this.tick()
    } catch (error) {
      // The first evaluation is already best-effort: a poisoned record must not
      // turn "started, one task is broken" into "did not start at all".
      this.log('error', `首次排期失败，已跳过：${(error as Error).message}`)
    }
  }

  dispose(): void {
    this.disposed = true
    this.generation += 1
    for (const off of this.stopListening.splice(0)) {
      try {
        off()
      } catch {
        /* listener already gone */
      }
    }
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    for (const handle of this.retries) clearTimeout(handle)
    this.retries.clear()
    for (const run of this.active.values()) {
      if (run.timeout !== null) clearTimeout(run.timeout)
      if (run.cancelTimeout !== null) clearTimeout(run.cancelTimeout)
      // Best effort: stop the turn we started so a reload cannot leave it burning.
      if (run.sessionId !== '') {
        try {
          void Promise.resolve(this.ctx.sessionController?.cancel?.({ sessionId: run.sessionId })).catch(() => {})
        } catch {
          /* the session may already be gone */
        }
      }
    }
    this.active.clear()
    this.activeByTask.clear()
    this.bySession.clear()
    this.queue = []
    this.deferred = []
    this.listeners.clear()
  }

  /**
   * A fresh engine cannot own a run that a previous process started: nothing is
   * live anymore. Close those records honestly instead of leaving them
   * "running" forever, and drop whatever was still queued.
   */
  private reconcileOrphans(): void {
    const nowIso = new Date(this.now()).toISOString()
    let touched = false
    for (const run of this.store.runs) {
      if (run.status !== 'queued' && run.status !== 'running' && run.status !== 'waiting-approval') continue
      const startedMs = run.startedAt === null ? null : Date.parse(run.startedAt)
      run.status = 'failed'
      run.endedAt = nowIso
      run.durationMs = startedMs === null ? null : Math.max(0, this.now() - startedMs)
      run.error = { message: '宿主在执行过程中退出或插件被重载，本次运行未完成', code: 'interrupted' }
      run.log.push({ at: nowIso, level: 'error', text: '启动时发现上次运行没有结局，标记为中断' })
      if (startedMs !== null) {
        try {
          run.artifacts = scanArtifacts(this.workspaceOf(run.taskId), { sinceMs: startedMs, exclude: this.internalPaths() })
        } catch {
          /* the folder may be gone */
        }
      }
      touched = true
    }
    this.queue = []
    if (touched) {
      this.persist()
      this.notify()
      this.log('warn', '上次退出时有运行没有结局，已按「中断」收尾')
    }
  }

  /** Paths that belong to the plugin itself rather than to a run's deliverables. */
  private internalPaths(): string[] {
    return [join(this.options.dataRoot, 'state.json'), join(this.options.dataRoot, 'tasks')]
  }

  private workspaceOf(taskId: string): string {
    const task = this.store.tasks.find((entry) => entry.id === taskId)
    if (task === undefined) return this.options.dataRoot
    try {
      return this.resolveWorkspace(task)
    } catch {
      return task.workspace ?? this.options.dataRoot
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* a broken subscriber must not break the engine */
      }
    }
  }

  private log(level: 'info' | 'warn' | 'error', text: string): void {
    this.options.log(level, text)
  }

  private persist(): void {
    // An unloaded engine must not rewrite the store: the fresh engine owns it now.
    if (this.disposed) return
    try {
      this.store.flush()
    } catch (error) {
      this.log('error', `写入任务存储失败：${(error as Error).message}`)
    }
  }

  /* -------------------------------------------------------------- snapshot */

  async snapshot(): Promise<StateSnapshot> {
    const models = await this.refreshModels()
    return {
      now: new Date(this.now()).toISOString(),
      timeZone: hostTimeZone(),
      tasks: [...this.store.tasks].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      runs: [...this.store.runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      models,
      templates: TEMPLATES,
      ready: true,
      limits: { maxConcurrentRuns: this.options.maxConcurrentRuns, runHistory: this.options.runHistory },
      // Native reminders are merged in by the transport, not by the engine:
      // this engine owns only its own tasks and runs.
      reminders: [],
      reminderError: null,
      ...this.hostCatalogs(),
    }
  }

  /**
   * Workspace + permission catalogs the editor renders from. Each read is
   * isolated: a broken Host seam must not take the whole page down, it becomes
   * an inline retry hint instead.
   */
  private hostCatalogs(): Pick<
    StateSnapshot,
    'workspaces' | 'workspaceDefault' | 'permissions' | 'permissionDefault' | 'workspaceError' | 'permissionError'
  > {
    let workspaces: WorkspaceEntry[] = []
    let workspaceDefault: string | null = null
    let workspaceError: string | null = null
    try {
      workspaces = this.workspaceList()
      const working = this.capability('workingDirectory')
      const fallback = working?.defaultDirectory
      workspaceDefault = typeof fallback === 'string' && fallback.length > 0 ? fallback : null
    } catch (error) {
      workspaceError = `读取宿主工作区失败：${(error as Error).message}`
    }
    let permissions: PermissionEntry[] = []
    let permissionDefault: string | null = null
    let permissionError: string | null = null
    try {
      const catalog = this.permissionCatalogUnsafe()
      permissions = catalog.options
      permissionDefault = catalog.defaultPreset
    } catch (error) {
      permissionError = `读取宿主权限预设失败：${(error as Error).message}`
    }
    return { workspaces, workspaceDefault, permissions, permissionDefault, workspaceError, permissionError }
  }

  /**
   * Catalogues on their own, for the form: the page must be able to render the
   * workspace and permission pickers even while the rest of the snapshot loads.
   */
  catalogs(): {
    workspaces: WorkspaceEntry[]
    workspaceDefault: string | null
    permissions: PermissionEntry[]
    permissionDefault: string | null
  } {
    const catalogs = this.hostCatalogs()
    return {
      workspaces: catalogs.workspaces,
      workspaceDefault: catalogs.workspaceDefault,
      permissions: catalogs.permissions,
      permissionDefault: catalogs.permissionDefault,
    }
  }

  /**
   * Register a folder as a Host workspace (idempotent) and return its id, so a
   * task can bind to the registry instead of an unmanaged absolute path.
   */
  async registerWorkspace(path: string): Promise<{ workspaceId: string; path: string }> {
    const registry = this.capability('workspaceRegistry')
    if (registry === undefined || registry === null) {
      throw new Error('宿主没有 workspaceRegistry 服务，无法登记工作区')
    }
    const target = path.trim()
    if (target === '') throw new Error('工作区路径不能为空')
    let existing: any
    if (typeof registry.resolveByPath === 'function') existing = await registry.resolveByPath(target)
    if (existing !== undefined && existing !== null && typeof existing.id === 'string') {
      return { workspaceId: existing.id, path: String(existing.path ?? target) }
    }
    if (typeof registry.create !== 'function') throw new Error('宿主 workspaceRegistry 不支持登记工作区')
    let created: any
    try {
      created = await registry.create(target)
    } catch (error) {
      throw new Error(`登记工作区失败：${(error as Error).message}`)
    }
    if (created === undefined || created === null || typeof created.id !== 'string') {
      throw new Error('宿主没有返回工作区 id')
    }
    return { workspaceId: created.id, path: String(created.path ?? target) }
  }

  /**
   * The permission state a Task Session actually carries, read back from the
   * Host's own preset service — evidence for what the run really got.
   */
  async sessionPermission(sessionId: string): Promise<{ preset: string | null; state: unknown }> {
    const agent = await this.resolveLiveAgent(sessionId)
    const presets = this.capability('permissionPresets')
    if (presets === undefined || presets === null) return { preset: null, state: null }
    const preset = typeof presets.current === 'function' ? presets.current(agent?.session) : null
    const state = typeof presets.permissionState === 'function' ? presets.permissionState(agent?.session) : null
    return { preset: preset === undefined ? null : preset, state }
  }

  /** Registered Host workspaces, in registry order. Throws when the seam is broken. */
  private workspaceList(): WorkspaceEntry[] {
    const registry = this.capability('workspaceRegistry')
    if (registry === undefined || registry === null || typeof registry.list !== 'function') {
      throw new Error('宿主没有 workspaceRegistry 服务')
    }
    const items = registry.list()
    const listed = Array.isArray(items) ? items : []
    return listed
      .map((item: any) => ({
        id: String(item?.id ?? ''),
        title: String(item?.title ?? item?.id ?? ''),
        path: String(item?.path ?? ''),
      }))
      .filter((item: WorkspaceEntry) => item.id.length > 0 && item.path.length > 0)
  }

  /** Native permission presets exactly as the Host publishes them. */
  private permissionCatalog(): { options: PermissionEntry[]; defaultPreset: string | null } {
    return this.permissionCatalogUnsafe()
  }

  private permissionCatalogUnsafe(): { options: PermissionEntry[]; defaultPreset: string | null } {
    const presets = this.capability('permissionPresets')
    if (presets === undefined || presets === null || typeof presets.catalog !== 'function') {
      throw new Error('宿主没有 permissionPresets 服务')
    }
    const catalog = presets.catalog()
    const raw = Array.isArray(catalog?.options) ? catalog.options : []
    const options: PermissionEntry[] = raw
      .map((option: any) => ({
        value: String(option?.value ?? ''),
        name: String(option?.name ?? option?.value ?? ''),
        ...(typeof option?.description === 'string' && option.description.length > 0 ? { description: option.description } : {}),
      }))
      .filter((option: PermissionEntry) => option.value.length > 0)
    const fallback = catalog?.defaultPreset
    return { options, defaultPreset: typeof fallback === 'string' && fallback.length > 0 ? fallback : null }
  }

  /**
   * Freeze the Host default model so a later change of that default cannot move
   * an existing task onto a different model.
   */
  private defaultSelection(): { provider: string; model: string; reasoningEffort: string | null } | null {
    const service = this.capability('agentDefaultModel')
    try {
      const current = service?.currentSelection?.()
      if (current === undefined || current === null) return null
      const provider = typeof current.provider === 'string' ? current.provider.trim() : ''
      const model = typeof current.model === 'string' ? current.model.trim() : ''
      if (provider.length === 0 || model.length === 0) return null
      return {
        provider,
        model,
        reasoningEffort: typeof current.reasoningEffort === 'string' && current.reasoningEffort.length > 0 ? current.reasoningEffort : null,
      }
    } catch {
      return null
    }
  }

  private async refreshModels(): Promise<ModelCatalogEntry[]> {
    const fresh = this.now() - this.modelsAt < MODEL_CACHE_MS
    if (fresh && this.models.length > 0) return this.models
    try {
      const catalog = await this.ctx.sessionController?.modelCatalog?.()
      this.models = normalizeCatalog(catalog)
      this.modelsAt = this.now()
    } catch (error) {
      this.log('warn', `读取模型目录失败：${(error as Error).message}`)
    }
    return this.models
  }

  /**
   * What the editor's catalog says right now, used to validate a save. A
   * failing seam yields `null` (= "cannot check"), never an empty allow-list
   * that would reject perfectly good ids.
   */
  private taskDefaults(): TaskDefaults {
    let workspaceIds: Set<string> | null = null
    try {
      workspaceIds = new Set(this.workspaceList().map((entry) => entry.id))
    } catch {
      workspaceIds = null
    }
    let presets: string[] | null = null
    const presetSpecs: Record<string, { sandbox: string; approval: string }> = {}
    try {
      const catalog = this.permissionCatalog()
      presets = catalog.options.map((option) => option.value)
      const service = this.capability('permissionPresets')
      for (const name of presets) {
        try {
          const spec = service?.resolve?.(name)
          if (spec !== undefined && spec !== null) {
            presetSpecs[name] = { sandbox: String(spec.sandbox ?? ''), approval: String(spec.approval ?? '') }
          }
        } catch {
          /* a preset that does not resolve is simply not mirrored */
        }
      }
    } catch {
      presets = null
    }
    return { model: this.defaultSelection(), workspaceIds, presets, presetSpecs }
  }

  /**
   * Bring pre-v2 tasks up to date without changing what they do.
   *
   * Rules: a legacy knob pair that matches a Host preset becomes that preset
   * (identical behaviour); one that matches nothing keeps its raw values and is
   * flagged for the editor; a plain path that the registry already knows
   * becomes a workspaceId; a task with no model stays "follow the default" and
   * says so. The state file is copied aside before the first migrated write.
   */
  private async migrateLegacy(): Promise<void> {
    const defaults = this.taskDefaults()
    let changed = false
    for (const task of this.store.tasks) {
      const issues: string[] = []
      // --- permission ---------------------------------------------------
      if (task.permissionPreset === null) {
        const pair = task.permission ?? { approval: 'never', sandbox: 'workspace-write' }
        const matched =
          defaults.presets === null
            ? null
            : (defaults.presets.find((name) => {
                const spec = defaults.presetSpecs[name]
                return spec !== undefined && spec.sandbox === pair.sandbox && spec.approval === pair.approval
              }) ?? null)
        if (matched !== null) {
          task.permissionPreset = matched
          task.permissionSource = 'preset'
          changed = true
        } else {
          task.permissionSource = 'legacy'
          issues.push(`权限组合（沙箱 ${pair.sandbox} / 审批 ${pair.approval}）不对应任何宿主预设，请重新选择`)
        }
      }
      // --- workspace ----------------------------------------------------
      if (task.workspaceId === null && task.workspace !== null && task.workspace.trim() !== '') {
        const registry = this.capability('workspaceRegistry')
        let found: any
        try {
          found = await registry?.resolveByPath?.(task.workspace)
        } catch {
          found = undefined
        }
        if (found !== undefined && found !== null && typeof found.id === 'string') {
          task.workspaceId = found.id
          task.workspaceSource = 'workspace'
          task.workspace = String(found.path ?? task.workspace)
          changed = true
        } else {
          task.workspaceSource = 'custom'
          issues.push(`工作文件夹是原始路径 ${task.workspace}，未登记为宿主工作区`)
        }
      } else if (task.workspaceId === null && (task.workspace === null || task.workspace.trim() === '')) {
        task.workspaceSource = 'task-dir'
      }
      // --- model --------------------------------------------------------
      if (task.model === null) {
        task.modelSource = 'legacy'
        issues.push('模型未固化（老任务，运行时跟随宿主默认模型）')
      }
      if (JSON.stringify(task.legacyIssues ?? []) !== JSON.stringify(issues)) {
        task.legacyIssues = issues
        changed = true
      }
    }
    if (!changed) return
    try {
      if (existsSync(this.store.file)) {
        copyFileSync(this.store.file, `${this.store.file}.pre-workspace-${this.now()}.bak`)
      }
    } catch (error) {
      this.log('warn', `迁移前备份失败（继续，数据未改）：${(error as Error).message}`)
    }
    this.persist()
    this.notify()
    this.log('info', '已按宿主工作区与权限预设迁移老任务：行为保持不变，需确认的项目已标在卡片的提示里')
  }

  /* ------------------------------------------------------------------ tasks */

  /** Validate + persist one task definition (create or update). */
  saveTask(input: Task): ApiResult<Task> {
    const existing = this.store.tasks.find((task) => task.id === input.id)
    let task: Task
    try {
      task = normalizeTask(input, existing, this.options, this.taskDefaults())
    } catch (error) {
      return { ok: false, code: 'invalid_task', message: (error as Error).message }
    }
    // Editing the schedule rules invalidates the cached occurrence.
    const scheduleChanged =
      existing === undefined ||
      JSON.stringify(existing.schedule) !== JSON.stringify(task.schedule) ||
      existing.timeZone !== task.timeZone ||
      existing.startAt !== task.startAt ||
      existing.endAt !== task.endAt ||
      existing.enabled !== task.enabled
    task.updatedAt = new Date(this.now()).toISOString()
    const tasks = this.store.tasks.filter((entry) => entry.id !== task.id)
    tasks.push(task)
    this.store.replace(mergeTaskOrder(tasks), this.store.runs)
    if (scheduleChanged) this.recompute(task, this.now())
    this.persist()
    this.notify()
    this.arm()
    return { ok: true, value: task }
  }

  deleteTask(id: string): ApiResult<{ id: string }> {
    const task = this.store.tasks.find((entry) => entry.id === id)
    if (task === undefined) return { ok: false, code: 'task_not_found', message: '任务不存在' }
    // A running task keeps its run record; the definition goes away.
    const activeRunId = this.activeByTask.get(id)
    this.clearRetriesOf(id, '任务已删除')
    this.store.replace(
      this.store.tasks.filter((entry) => entry.id !== id),
      this.store.runs,
    )
    this.persist()
    this.notify()
    this.arm()
    return { ok: true, value: { id, ...(activeRunId === undefined ? {} : { activeRunId }) } }
  }

  setEnabled(id: string, enabled: boolean): ApiResult<Task> {
    const task = this.store.tasks.find((entry) => entry.id === id)
    if (task === undefined) return { ok: false, code: 'task_not_found', message: '任务不存在' }
    task.enabled = enabled
    if (!enabled) this.clearRetriesOf(id, '任务已暂停')
    task.updatedAt = new Date(this.now()).toISOString()
    this.recompute(task, this.now())
    this.persist()
    this.notify()
    this.arm()
    return { ok: true, value: task }
  }

  bulk(ids: string[], action: 'enable' | 'pause' | 'delete'): ApiResult<{ affected: number }> {
    let affected = 0
    for (const id of ids) {
      const result =
        action === 'delete' ? this.deleteTask(id) : this.setEnabled(id, action === 'enable')
      if (result.ok) affected += 1
    }
    return { ok: true, value: { affected } }
  }

  duplicate(id: string): ApiResult<Task> {
    const task = this.store.tasks.find((entry) => entry.id === id)
    if (task === undefined) return { ok: false, code: 'task_not_found', message: '任务不存在' }
    const copy: Task = {
      ...structuredClone(task),
      id: randomUUID(),
      name: `${task.name}（副本）`,
      sessionId: null,
      enabled: false,
      createdAt: new Date(this.now()).toISOString(),
      updatedAt: new Date(this.now()).toISOString(),
      nextRunAt: null,
      lastRunAt: null,
      lastRunStatus: null,
      lastError: null,
    }
    return this.saveTask(copy)
  }

  /* ------------------------------------------------------------------ runs */

  /** Manual run: ignores the schedule but still respects the queue and timeout. */
  runNow(id: string): ApiResult<Run> {
    const task = this.store.tasks.find((entry) => entry.id === id)
    if (task === undefined) return { ok: false, code: 'task_not_found', message: '任务不存在' }
    // A run that is already going does not reject a new request: the queue keeps
    // one poller per task and the second request waits its turn.
    const run = this.enqueue(task, 'manual', null, this.nextAttemptOf(id))
    return { ok: true, value: run }
  }

  /** 1 for the first try, or one past the newest attempt of that task. */
  private nextAttemptOf(taskId: string): number {
    let max = 0
    for (const run of this.store.runs) {
      if (run.taskId === taskId && run.attempt > max) max = run.attempt
    }
    for (const item of [...this.queue, ...this.deferred]) {
      if (item.taskId === taskId && item.attempt > max) max = item.attempt
    }
    return max + 1
  }

  cancelRun(runId: string): ApiResult<{ runId: string }> {
    const active = this.active.get(runId)
    if (active === undefined) {
      // Also allow cancelling something still queued or waiting for its task to
      // go idle — a trigger the user can see must always be cancellable.
      const before = this.queue.length + this.deferred.length
      this.queue = this.queue.filter((item) => item.runId !== runId)
      this.deferred = this.deferred.filter((item) => item.runId !== runId)
      if (this.queue.length + this.deferred.length !== before) {
        this.patchRun(runId, (run) => {
          run.status = 'cancelled'
          run.endedAt = new Date(this.now()).toISOString()
          run.error = { message: '排队中被取消', code: 'cancelled_in_queue' }
        })
        this.persist()
        this.notify()
        return { ok: true, value: { runId } }
      }
      return { ok: false, code: 'run_not_active', message: '该运行已结束' }
    }
    active.cancelReason = 'user'
    this.patchRun(runId, (run) => {
      run.log.push({ at: new Date(this.now()).toISOString(), level: 'warn', text: '收到停止请求，正在取消当前轮次' })
    })
    this.notify()
    // Do not wait forever for an aborted turn that never reports back.
    if (active.cancelTimeout === null) {
      active.cancelTimeout = setTimeout(() => {
        active.cancelTimeout = null
        void this.finish(active, 'cancelled', { message: '已手动停止（未收到轮次结束事件）', code: 'cancelled' })
      }, 15_000)
      ;(active.cancelTimeout as unknown as { unref?: () => void }).unref?.()
    }
    this.requestCancellation(active)
    return { ok: true, value: { runId } }
  }

  /** Both synchronous and asynchronous Host cancellation failures are observable. */
  private requestCancellation(active: ActiveRun): void {
    if (active.sessionId === '') return
    try {
      void Promise.resolve(this.ctx.sessionController?.cancel?.({ sessionId: active.sessionId })).catch(
        (error: Error) => this.log('warn', `取消运行失败：${error.message}`),
      )
    } catch (error) {
      this.log('warn', `取消运行失败：${(error as Error).message}`)
    }
  }

  retryRun(runId: string): ApiResult<Run> {
    const run = this.store.runs.find((entry) => entry.id === runId)
    if (run === undefined) return { ok: false, code: 'run_not_found', message: '运行记录不存在' }
    const task = this.store.tasks.find((entry) => entry.id === run.taskId)
    if (task === undefined) return { ok: false, code: 'task_not_found', message: '任务已被删除，无法重跑' }
    if (this.activeByTask.has(task.id)) return { ok: false, code: 'task_busy', message: '该任务正在运行' }
    const next = this.enqueue(task, 'retry', null, run.attempt + 1)
    return { ok: true, value: next }
  }

  clearRuns(): ApiResult<{ removed: number }> {
    const keep = this.store.runs.filter((run) => this.isLive(run))
    const removed = this.store.runs.length - keep.length
    this.store.replace(this.store.tasks, keep)
    this.persist()
    this.notify()
    return { ok: true, value: { removed } }
  }

  /** Resolve a task by id, exact name, or an unambiguous name fragment. */
  taskByIdOrName(key: string): Task | null {
    const wanted = key.trim()
    if (wanted.length === 0) return null
    const byId = this.store.tasks.find((task) => task.id === wanted)
    if (byId !== undefined) return byId
    const lower = wanted.toLowerCase()
    const exact = this.store.tasks.filter((task) => task.name.toLowerCase() === lower)
    if (exact.length === 1) return exact[0] as Task
    const partial = this.store.tasks.filter((task) => task.name.toLowerCase().includes(lower))
    return partial.length === 1 ? (partial[0] as Task) : null
  }

  findRun(runId: string): Run | null {
    return this.store.runs.find((run) => run.id === runId) ?? null
  }

  /** Run history, newest first, filtered for the 运行记录 tab. */
  listRuns(filter?: RunFilter): Run[] {
    let runs = [...this.store.runs]
    if (filter?.status !== undefined && filter.status !== 'all') {
      runs = runs.filter((run) => run.status === filter.status)
    }
    if (filter?.trigger !== undefined && filter.trigger !== 'all') {
      runs = runs.filter((run) => run.trigger === filter.trigger)
    }
    if (filter?.taskId !== undefined && filter.taskId !== 'all') {
      runs = runs.filter((run) => run.taskId === filter.taskId)
    }
    runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return runs.slice(0, filter?.limit ?? 200)
  }

  /* -------------------------------------------------------------- scheduler */

  /** Evaluate every enabled task once; safe to call from a timer or a test. */
  async tick(nowMs?: number): Promise<void> {
    const now = nowMs ?? this.now()
    let changed = false
    changed = this.processDueRetries(now) || changed
    for (const task of this.store.tasks) {
      // The file loader rejects unusable records, but the array is also touched by
      // the UI and by migration: never let one bad entry stop the others.
      if (task === null || typeof task !== 'object') continue
      if (!task.enabled) {
        if (task.nextRunAt !== null) {
          task.nextRunAt = null
          changed = true
        }
        continue
      }
      const scheduled = task.nextRunAt === null ? Number.NaN : Date.parse(task.nextRunAt)
      if (!Number.isFinite(scheduled)) {
        this.recompute(task, now)
        changed = true
        continue
      }
      if (scheduled > now) continue
      if (!withinWindow(now, task.startAt, task.endAt)) {
        this.log('info', `任务「${task.name}」超出有效期窗口，停止排期`)
        this.recompute(task, now)
        changed = true
        continue
      }
      const lateMs = now - scheduled
      if (lateMs <= this.options.graceSeconds * 1000) {
        this.enqueue(task, 'schedule', task.nextRunAt, 1)
      } else if (task.missedPolicy === 'catchup') {
        const missed = this.latestMissed(task, now)
        this.log('info', `任务「${task.name}」补跑最近一次漏跑（计划 ${missed ?? task.nextRunAt}）`)
        this.enqueue(task, 'catchup', missed ?? task.nextRunAt, 1)
      } else {
        this.log('info', `任务「${task.name}」错过一次计划执行，策略为跳过`)
      }
      this.recompute(task, now)
      changed = true
    }
    if (changed) {
      this.persist()
      this.notify()
    }
    this.arm()
  }

  /**
   * Due failure retries, read from the persisted `retryAt` marks so they survive
   * a restart. A retry is cancelled — and says so in the record — when the task
   * was deleted, paused, left its validity window, or is already running.
   */
  private processDueRetries(now: number): boolean {
    let changed = false
    for (const run of [...this.store.runs]) {
      if (run.retryAt === null) continue
      const due = Date.parse(run.retryAt)
      if (!Number.isFinite(due) || due > now) continue
      const task = this.store.tasks.find((entry) => entry.id === run.taskId)
      const blocked =
        task === undefined
          ? '任务已删除'
          : !task.enabled
            ? '任务已暂停'
            : !withinWindow(now, task.startAt, task.endAt)
              ? '任务已超出有效期'
              : this.activeByTask.has(task.id)
                ? '同一任务仍在运行'
                : null
      run.retryAt = null
      changed = true
      if (blocked !== null) {
        run.log.push({
          at: new Date(now).toISOString(),
          level: 'warn',
          text: `自动重试已取消：${blocked}`,
        })
        this.log('info', `自动重试已取消：${blocked}`)
        continue
      }
      if (task === undefined) continue
      this.log('info', `任务「${task.name}」第 ${run.attempt + 1} 次尝试（自动重试）`)
      this.enqueue(task, 'retry', run.scheduledFor, run.attempt + 1)
    }
    return changed
  }

  /** Last occurrence at or before `now` — catch-up runs the newest one only. */
  private latestMissed(task: Task, now: number): string | null {
    const previous = previousOccurrence({
      spec: task.schedule,
      timeZone: task.timeZone,
      atMs: now,
      anchorMs: Date.parse(task.createdAt),
    })
    if (previous === null) return null
    if (task.startAt !== null && previous < Date.parse(task.startAt)) return null
    return new Date(previous).toISOString()
  }

  /** Recompute the cached next occurrence from `fromMs`. */
  recompute(task: Task, fromMs: number): void {
    if (!task.enabled) {
      task.nextRunAt = null
      return
    }
    const startBound = task.startAt === null ? null : Date.parse(task.startAt)
    // Start one millisecond before the window opens: an occurrence that lands
    // exactly on `startAt` is part of the window, not something to skip past.
    // `nextOccurrence` is strictly-after, so a window that opens exactly on an
    // occurrence must search from one millisecond earlier to keep it.
    const from = startBound === null ? fromMs : fromMs <= startBound ? startBound - 1 : fromMs
    try {
      const next = nextOccurrence({
        spec: task.schedule,
        timeZone: task.timeZone,
        fromMs: from,
        anchorMs: Date.parse(task.createdAt),
      })
      if (next === null || !withinWindow(next, task.startAt, task.endAt)) {
        task.nextRunAt = null
        return
      }
      task.nextRunAt = new Date(next).toISOString()
    } catch (error) {
      task.nextRunAt = null
      task.lastError = { message: `调度规则无法计算：${(error as Error).message}`, at: new Date(this.now()).toISOString() }
    }
  }

  /** One timer for the whole engine, re-armed at the nearest occurrence. */
  private arm(): void {
    if (this.disposed) return
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    let nearest = Number.POSITIVE_INFINITY
    for (const task of this.store.tasks) {
      if (task === null || typeof task !== 'object') continue
      if (!task.enabled || task.nextRunAt === null) continue
      const at = Date.parse(task.nextRunAt)
      if (Number.isFinite(at) && at < nearest) nearest = at
    }
    for (const run of this.store.runs) {
      if (run.retryAt === null) continue
      const at = Date.parse(run.retryAt)
      if (Number.isFinite(at) && at < nearest) nearest = at
    }
    const now = this.now()
    const delay =
      Number.isFinite(nearest) && nearest > now
        ? Math.min(nearest - now + 250, TIMER_CEILING_MS)
        : Math.min(TIMER_CEILING_MS, 5_000)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.tick().catch((error: Error) => this.log('error', `调度循环异常：${error.message}`))
    }, Math.max(delay, 500))
    // A pending timer must never keep the Host process alive on its own.
    ;(this.timer as unknown as { unref?: () => void }).unref?.()
  }

  /* ------------------------------------------------------------- run queue */

  private enqueue(task: Task, trigger: RunTrigger, scheduledFor: string | null, attempt: number): Run {
    const at = new Date(this.now()).toISOString()
    const run: Run = {
      id: randomUUID(),
      taskId: task.id,
      taskName: task.name,
      status: 'queued',
      trigger,
      scheduledFor,
      createdAt: at,
      startedAt: null,
      endedAt: null,
      durationMs: null,
      sessionId: null,
      sessionMode: task.sessionMode,
      workspace: this.resolveWorkspaceQuietly(task),
      modelSnapshot: null,
      permissionPreset: task.permissionPreset,
      attempt,
      retryAt: null,
      error: null,
      output: null,
      artifacts: [],
      tools: [],
      log: [{ at, level: 'info', text: `已入队（触发：${describeTrigger(trigger)}${scheduledFor === null ? '' : `，计划 ${formatInstant(Date.parse(scheduledFor), task.timeZone)}`}）` }],
    }
    this.store.replace(
      this.store.tasks,
      pruneRuns([run, ...this.store.runs], this.options.runHistory, (entry) => this.isLive(entry)),
    )
    this.queue.push({ runId: run.id, taskId: task.id, trigger, scheduledFor, attempt })
    this.persist()
    this.notify()
    this.pump()
    return run
  }

  private pump(): void {
    if (this.disposed) return
    this.releaseDeferred()
    while (this.active.size < this.options.maxConcurrentRuns && this.queue.length > 0) {
      const item = this.queue.shift() as QueueItem
      if (this.activeByTask.has(item.taskId)) {
        // Same-task serialization keeps the trigger: dropping it here used to
        // cancel a real occurrence without the user ever seeing why.
        this.deferred.push({ ...item, deferred: true })
        if (item.deferred !== true) {
          this.patchRun(item.runId, (run) => {
            run.log.push({
              at: new Date(this.now()).toISOString(),
              level: 'info',
              text: '同一任务正在运行，本次触发排队等待（不会丢弃）',
            })
          })
          this.notify()
        }
        continue
      }
      void this.execute(item)
    }
  }

  /** Move deferred triggers back once their task is idle again. */
  private releaseDeferred(): void {
    if (this.deferred.length === 0) return
    const waiting: QueueItem[] = []
    for (const item of this.deferred) {
      if (this.activeByTask.has(item.taskId)) {
        waiting.push(item)
        continue
      }
      this.queue.push(item)
    }
    this.deferred = waiting
  }

  /* -------------------------------------------------------------- execution */

  private async execute(item: QueueItem): Promise<void> {
    const task = this.store.tasks.find((entry) => entry.id === item.taskId)
    const run = this.store.runs.find((entry) => entry.id === item.runId)
    if (task === undefined || run === undefined) return
    if (this.disposed) return

    let workspace: string
    try {
      workspace = this.ensureWorkspace(task)
    } catch (error) {
      // A workspace the Host no longer exposes (deleted, renamed away, unplugged)
      // fails the run loudly. Running somewhere else would write deliverables
      // into a folder the user never chose.
      this.failBeforeStart(task, run, (error as Error).message)
      return
    }
    run.workspace = workspace
    const active: ActiveRun = {
      runId: run.id,
      taskId: task.id,
      generation: this.generation,
      sessionId: '',
      sessionMode: task.sessionMode,
      turnId: null,
      workspace,
      startedMs: this.now(),
      timeout: null,
      cancelTimeout: null,
      cancelReason: null,
      texts: [],
      tools: [],
    }
    this.active.set(run.id, active)
    this.activeByTask.set(task.id, run.id)
    run.status = 'running'
    run.startedAt = new Date(this.now()).toISOString()
    run.log.push({ at: run.startedAt, level: 'info', text: `开始执行（工作文件夹 ${workspace}）` })
    this.persist()
    this.notify()

    // Arm the deadline before any preparation. Creating or resuming a Session,
    // pinning a model and pushing permission events are Host calls that can hang
    // exactly like a turn can, so they belong inside the timeout too.
    const timeoutMs = Math.max(20, Math.round(Math.max(0.02, task.timeoutMinutes) * 60_000))
    active.timeout = setTimeout(() => {
      active.timeout = null
      void this.onTimeout(active, run.id)
    }, timeoutMs)
    ;(active.timeout as unknown as { unref?: () => void }).unref?.()

    try {
      const sessionId = await this.ensureSession(task, workspace)
      if (!this.isCurrent(active)) return
      active.sessionId = sessionId
      run.sessionId = sessionId
      run.log.push({ at: new Date(this.now()).toISOString(), level: 'info', text: `会话 ${sessionId}（${task.sessionMode === 'persistent' ? '持续会话' : '独立会话'}）` })
      await this.applyModel(task, sessionId, run)
      if (!this.isCurrent(active)) return
      await this.applyPermission(task, sessionId, run)
      if (!this.isCurrent(active)) return
      this.bySession.set(sessionId, run.id)
      this.persist()
      this.notify()

      const controller = new AbortController()
      await this.ctx.sessionController.prompt(
        {
          sessionId,
          content: [{ type: 'text', text: this.buildPrompt(task, item, workspace) }],
          mode: 'queue',
          requestId: run.id,
          clientTimeZone: task.timeZone,
        },
        controller.signal,
      )
    } catch (error) {
      if (!this.isCurrent(active)) return
      await this.finish(active, 'failed', { message: (error as Error).message, code: 'prompt_failed' })
    }
  }

  /**
   * Whether this run still owns the engine: not disposed, still registered as
   * active, and from the current generation. Every await is followed by this
   * check so a stopped, timed-out or reloaded run cannot keep going.
   */
  private isCurrent(active: ActiveRun): boolean {
    return !this.disposed && active.generation === this.generation && this.active.get(active.runId) === active
  }

  /**
   * The folder one task runs in, resolved through the Host registry when the
   * task points at a registered workspace. A workspace that disappeared is an
   * error, never a silent fallback to some other directory.
   */
  private resolveWorkspace(task: Task): string {
    if (task.workspaceId !== null) {
      const registry = this.capability('workspaceRegistry')
      if (registry === undefined || registry === null || typeof registry.get !== 'function') {
        throw new Error('宿主没有 workspaceRegistry 服务，无法解析任务绑定的工作区')
      }
      let found: any
      try {
        found = registry.get(task.workspaceId)
      } catch (error) {
        throw new Error(`读取工作区 ${task.workspaceId} 失败：${(error as Error).message}`)
      }
      if (found === undefined || found === null) {
        throw new Error(`任务绑定的工作区 ${task.workspaceId} 已不在宿主里（可能被删除），请在编辑里重新选择`)
      }
      const path = String(found.path ?? '').trim()
      if (path.length === 0) throw new Error(`工作区 ${task.workspaceId} 没有可用路径`)
      if (task.workspace !== path) {
        // Follow a rename/move of the registered workspace instead of the stale copy.
        task.workspace = path
        this.persist()
      }
      return path
    }
    if (task.workspace !== null && task.workspace.trim() !== '') return task.workspace
    // Explicit per-task folder: isolated by default, still a real choice.
    return join(this.options.dataRoot, 'workspaces', task.id)
  }

  /** Enqueue-time path: recorded on the run without throwing a trigger away. */
  private resolveWorkspaceQuietly(task: Task): string {
    try {
      return this.resolveWorkspace(task)
    } catch (error) {
      this.log('warn', `(task ${task.name}) ${(error as Error).message}`)
      return task.workspace ?? join(this.options.dataRoot, 'workspaces', task.id)
    }
  }

  /** Create the working folder if needed and return its absolute path. */
  private ensureWorkspace(task: Task): string {
    const dir = this.resolveWorkspace(task)
    if (task.workspaceId !== null && !existsSync(dir)) {
      throw new Error(`工作区目录不存在：${dir}（工作区可能被移动或删除，请修复或在编辑里重新选择）`)
    }
    try {
      mkdirSync(dir, { recursive: true })
    } catch (error) {
      this.log('warn', `工作文件夹不可用（${dir}）：${(error as Error).message}`)
    }
    return dir
  }

  /** Close a run that could not even reach its working folder. */
  private failBeforeStart(task: Task, run: Run, message: string): void {
    const at = new Date(this.now()).toISOString()
    run.status = 'failed'
    run.startedAt = at
    run.endedAt = at
    run.durationMs = 0
    run.error = { message, code: 'workspace_unavailable' }
    run.log.push({ at, level: 'error', text: message })
    task.lastRunAt = at
    task.lastRunStatus = 'failed'
    task.lastError = { message, at }
    this.persist()
    this.notify()
  }

  /** Per-task cross-run data folder: the agent's own notebook between runs. */
  private dataDir(task: Task, workspace: string): string {
    const base = task.workspace === null && task.workspaceId === null ? this.options.dataRoot : join(workspace, '.dsh-task-center')
    const dir = join(base, task.id)
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      /* the prompt only tells the agent where to write */
    }
    return dir
  }

  private async ensureSession(task: Task, workspace: string): Promise<string> {
    const controller = this.ctx.sessionController
    if (task.sessionMode === 'persistent' && task.sessionId !== null) {
      let reusable = false
      try {
        const agent = await this.resolveLiveAgent(task.sessionId)
        const cwd = agent?.session?.header?.cwd
        if (typeof cwd === 'string' && cwd.length > 0 && resolve(cwd) !== resolve(workspace)) {
          this.log('warn', `持续会话的工作文件夹是 ${cwd}，与任务要求的 ${workspace} 不同，改用新会话`)
        } else if (task.sessionModelKey !== modelKey(task)) {
          // A Session keeps the model of its last request, so a changed pin (or a
          // switch back to "follow the Host default") only takes effect in a new
          // Session. Saying so beats silently running with the old model.
          this.log('info', '任务的模型设置已变化，持续会话改用新会话以便生效')
        } else {
          reusable = true
        }
      } catch {
        this.log('warn', `持续会话 ${task.sessionId} 已不可用，改为新建`)
      }
      if (!reusable) {
        task.sessionId = null
        this.persist()
      } else {
        return task.sessionId
      }
    }
    const created = await controller.create({ cwd: workspace })
    const sessionId = created?.sessionId ?? created?.id
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new Error('宿主未返回会话 id')
    }
    if (task.sessionMode === 'persistent') {
      task.sessionId = sessionId
      task.sessionModelKey = modelKey(task)
      this.persist()
    }
    return sessionId
  }

  /**
   * `sessionController.resolveAgent` answers either a live Agent, a `{ agent }`
   * wrapper (the resume path) or `{ error }`. Only the Agent has `.session`, so
   * every caller has to unwrap it before touching the log.
   */
  private async resolveLiveAgent(sessionId: string): Promise<any> {
    const resolved = await this.ctx.sessionController.resolveAgent(sessionId)
    if (resolved === undefined || resolved === null) throw new Error('会话不可用')
    if (resolved.error !== undefined) {
      throw new Error(String(resolved.error?.message ?? '会话不可用'))
    }
    return resolved.agent ?? resolved
  }

  /**
   * Pin the task's model on its own Session only.
   *
   * `sessionController.selectModel` also writes the choice into the Host-wide
   * default model, which a scheduled task has no business doing. There is no
   * fallback to it: when the per-agent seam is missing the run fails loudly
   * instead of quietly switching models (or switching the user's default).
   */
  private async applyModel(task: Task, sessionId: string, run: Run): Promise<void> {
    const at = (): string => new Date(this.now()).toISOString()
    const choice = task.model
    if (choice === null) {
      // Pre-pin task: it keeps following the Host default, and the run records
      // exactly what that was so the history is not a guess.
      const effective = this.defaultSelection()
      run.modelSnapshot = effective
      run.log.push({
        at: at(),
        level: 'info',
        text:
          effective === null
            ? '任务未固化模型，本次跟随宿主默认模型'
            : `任务未固化模型，本次跟随宿主默认模型 ${effective.provider}/${effective.model}`,
      })
      return
    }
    const label = `${choice.provider}/${choice.model}${task.reasoningEffort === null ? '' : ` · ${task.reasoningEffort}`}`
    try {
      const controller = this.ctx.sessionController
      const agent = await this.resolveLiveAgent(sessionId)
      let selected: { provider: string; model: string; reasoningEffort?: string } = {
        provider: choice.provider,
        model: choice.model,
        ...(task.reasoningEffort === null ? {} : { reasoningEffort: task.reasoningEffort }),
      }
      const llm = this.ctx.get?.('llm', false)
      if (llm !== undefined && llm !== null && typeof llm.resolveCallConfig === 'function') {
        const resolved = await llm.resolveCallConfig({
          provider: choice.provider,
          model: choice.model,
          ...(task.reasoningEffort === null ? {} : { reasoningEffort: task.reasoningEffort }),
        })
        selected = {
          provider: resolved.provider,
          model: resolved.model,
          ...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort }),
        }
      }
      const agents = controller.agents
      if (agent === undefined || agent === null || typeof agents?.selectForNextRequest !== 'function') {
        throw new Error('宿主缺少 agents.selectForNextRequest，无法把模型钉在本会话（不退回会改全局默认的接口）')
      }
      agents.selectForNextRequest(agent, selected)
      run.modelSnapshot = {
        provider: selected.provider,
        model: selected.model,
        reasoningEffort: selected.reasoningEffort ?? null,
      }
      run.log.push({ at: at(), level: 'info', text: `使用模型 ${label}（仅作用于本会话，不改宿主默认模型）` })
    } catch (error) {
      run.modelSnapshot = null
      throw new Error(`指定模型 ${label} 不可用：${(error as Error).message}`)
    }
  }

  /**
   * Read an optional Host capability without tripping Cordis' inject guard:
   * a missing service must read as `undefined`, not throw on property access.
   */
  private capability(name: string): any {
    const holder = this.ctx as { get?: (name: string, strict?: boolean) => any }
    if (typeof holder.get === 'function') {
      try {
        const viaGet = holder.get.call(this.ctx, name, false)
        if (viaGet !== undefined) return viaGet
      } catch {
        /* fall through to the property read */
      }
    }
    try {
      return (holder as Record<string, any>)[name]
    } catch {
      return undefined
    }
  }

  /**
   * Apply the task's permission to its Session.
   *
   * A preset task uses the Host's own `permissionPresets.set`, so the sandbox
   * mode and approval policy are exactly the native three-mode behaviour — one
   * call, no hand-rolled combination. Legacy tasks keep their recorded pair so
   * an old task never silently gains or loses access.
   */
  private async applyPermission(task: Task, sessionId: string, run: Run): Promise<void> {
    const at = (): string => new Date(this.now()).toISOString()
    try {
      const agent = await this.resolveLiveAgent(sessionId)
      const session = agent?.session
      if (task.permissionPreset !== null) {
        const presets = this.capability('permissionPresets')
        if (presets === undefined || presets === null || typeof presets.set !== 'function') {
          throw new Error('宿主没有 permissionPresets 服务，无法应用权限预设')
        }
        // Resolve first: an unknown preset must fail here, not half-apply.
        presets.resolve(task.permissionPreset)
        presets.set(session, task.permissionPreset)
        run.permissionPreset = task.permissionPreset
        run.log.push({ at: at(), level: 'info', text: `权限预设 ${task.permissionPreset}（沿用宿主原生三档）` })
        return
      }
      // Legacy pair: unchanged behaviour for tasks created before presets.
      if (session !== undefined && session !== null && typeof session.append === 'function') {
        session.append('sandbox/mode', { mode: task.permission.sandbox })
      }
      if (agent !== undefined && agent !== null) {
        const approval = this.capability('approval')
        if (approval === undefined) throw new Error('宿主没有 approval 服务，无法下发审批策略')
        approval.setPolicy(agent, task.permission.approval)
      }
      run.permissionPreset = null
      run.log.push({
        at: at(),
        level: 'warn',
        text: `权限沿用旧组合（沙箱 ${task.permission.sandbox} / 审批 ${task.permission.approval}），建议在编辑里改选宿主预设`,
      })
    } catch (error) {
      // A dead Session here would let the run proceed with permissions nobody
      // applied — fail loudly instead of degrading silently.
      throw new Error(`无法下发任务权限：${(error as Error).message}`)
    }
  }

  /** The user message one run sends: bounded context, never the whole history. */
  private buildPrompt(task: Task, item: QueueItem, workspace: string): string {
    const now = new Date(this.now())
    const data = this.dataDir(task, workspace)
    const targetMs = item.scheduledFor === null ? now.getTime() : Date.parse(item.scheduledFor)
    const targetDate = formatInstant(targetMs, task.timeZone).slice(0, 10)
    const lines = [
      '这是一次由「自动化任务中心」触发的自动运行，不是交互式对话：没有人会回答提问，请独立完成并把结果写入工作文件夹。',
      '',
      `任务：${task.name}`,
      `触发方式：${describeTrigger(item.trigger)}`,
      `计划时间：${item.scheduledFor === null ? '—' : formatInstant(Date.parse(item.scheduledFor), task.timeZone)}（${task.timeZone}）`,
      `当前时间：${formatInstant(now.getTime(), task.timeZone)}（${task.timeZone}）`,
      `本次运行对应的日期：${targetDate}（按任务时区算；产物文件名与页面标题里的日期请用这一天）`,
      `工作文件夹：${workspace}`,
      `跨次数据目录：${data}（你自己的记事本，跨运行保留；需要记住“已处理过什么”就写在这里，下次运行要先读取它，避免重复劳动。不要删除该目录。）`,
      `调度规则：${describeSchedule(task.schedule, task.timeZone)}`,
      '',
    ]
    if (task.attachments.length > 0) {
      lines.push('参考附件：', ...task.attachments.map((path) => `- ${path}`), '')
    }
    lines.push('任务内容：', task.prompt)
    return lines.join('\n')
  }

  private async onTimeout(active: ActiveRun, runId: string): Promise<void> {
    if (!this.active.has(runId)) return
    active.cancelReason = 'timeout'
    this.patchRun(runId, (run) => {
      run.log.push({ at: new Date(this.now()).toISOString(), level: 'error', text: '超过运行时限，正在取消当前轮次' })
    })
    this.notify()
    // Close the record first: a provider that ignores the abort must not leave
    // the run "running" forever. Cancelling is a fire-and-forget follow-up.
    await this.finish(active, 'timeout', { message: '运行超过时限，已取消', code: 'timeout' })
    this.requestCancellation(active)
  }

  /* ------------------------------------------------------------- turn watch */

  private onSessionEvent(session: any, event: any): void {
    const sessionId = session?.id
    if (typeof sessionId !== 'string') return
    const runId = this.bySession.get(sessionId)
    if (runId === undefined) return
    const active = this.active.get(runId)
    if (active === undefined) return
    const type = event?.type
    const data = event?.data ?? {}

    if (type === 'turn/start') {
      if (active.turnId === null) {
        active.turnId = data.turn ?? null
        this.patchRun(runId, (run) => {
          run.log.push({ at: new Date(this.now()).toISOString(), level: 'info', text: '模型轮次开始' })
        })
        this.notify()
      }
      return
    }

    const mine = active.turnId === null || data.turn === undefined || data.turn === active.turnId
    if (!mine) return

    if (type === 'tool/call') {
      const name = String(data.name ?? 'tool')
      active.tools.push({ name, title: typeof data.arguments?.description === 'string' ? data.arguments.description : name })
      this.patchRun(runId, (run) => {
        run.tools = dedupeTools(active.tools)
      })
      this.notify()
      return
    }

    if (type === 'assistant/message') {
      const text = extractText(data.message)
      if (text.length > 0) {
        active.texts.push(text)
        this.patchRun(runId, (run) => {
          run.output = clip(active.texts.join('\n\n'))
        })
        this.notify()
      }
      return
    }

    if (type === 'approval/asked') {
      this.patchRun(runId, (run) => {
        if (run.status === 'running') run.status = 'waiting-approval'
        run.log.push({ at: new Date(this.now()).toISOString(), level: 'warn', text: `等待审批：${String(data.title ?? data.tool ?? '需要授权')}` })
      })
      this.notify()
      return
    }

    if (type === 'approval/decided') {
      this.patchRun(runId, (run) => {
        if (run.status === 'waiting-approval') run.status = 'running'
        run.log.push({ at: new Date(this.now()).toISOString(), level: 'info', text: `审批结果：${String(data.outcome ?? 'unknown')}` })
      })
      this.notify()
      return
    }

    if (type === 'turn/end') {
      const reason = data.reason ?? {}
      if (reason.kind === 'completed') {
        void this.finish(active, 'succeeded', null)
        return
      }
      if (reason.kind === 'aborted') {
        const cancelled = active.cancelReason === 'user'
        void this.finish(
          active,
          cancelled ? 'cancelled' : 'timeout',
          {
            message: cancelled ? '已手动停止' : '运行超时或被宿主中止',
            code: cancelled ? 'cancelled' : 'aborted',
          },
        )
        return
      }
      if (reason.kind === 'error') {
        const message = String(reason.error?.message ?? '模型轮次失败')
        void this.finish(active, 'failed', { message, code: reason.error?.code ?? 'turn_error' })
        return
      }
      void this.finish(active, 'cancelled', { message: `轮次被中断（${String(reason.kind)}）`, code: String(reason.kind) })
    }
  }

  /* -------------------------------------------------------------- finishing */

  private async finish(
    active: ActiveRun,
    status: RunStatus,
    error: { message: string; code: string | null } | null,
  ): Promise<void> {
    if (!this.active.has(active.runId)) return
    if (active.generation !== this.generation) return
    this.active.delete(active.runId)
    this.activeByTask.delete(active.taskId)
    if (active.sessionId !== '') this.bySession.delete(active.sessionId)
    if (active.timeout !== null) clearTimeout(active.timeout)
    if (active.cancelTimeout !== null) clearTimeout(active.cancelTimeout)

    const run = this.store.runs.find((entry) => entry.id === active.runId)
    const task = this.store.tasks.find((entry) => entry.id === active.taskId)
    const nowIso = new Date(this.now()).toISOString()
    if (run !== undefined) {
      run.status = status
      run.endedAt = nowIso
      run.durationMs = this.now() - active.startedMs
      run.error = error
      run.tools = dedupeTools(active.tools)
      if (active.texts.length > 0) run.output = clip(active.texts.join('\n\n'))
      run.artifacts = scanArtifacts(active.workspace, { sinceMs: active.startedMs, exclude: this.internalPaths() })
      run.log.push({
        at: nowIso,
        level: status === 'succeeded' ? 'info' : 'error',
        text:
          status === 'succeeded'
            ? `执行成功，产物 ${run.artifacts.length} 个`
            : `执行结束：${status}${error === null ? '' : ` — ${error.message}`}`,
      })
    }
    if (task !== undefined) {
      task.lastRunAt = nowIso
      task.lastRunStatus = status
      task.lastError =
        status === 'succeeded' || error === null ? null : { message: error.message, at: nowIso }
      // A manual run must not consume the pending schedule: leaving `nextRunAt`
      // alone keeps the due occurrence due, so the plan still fires.
      if (run === undefined || run.trigger !== 'manual') this.recompute(task, this.now())
    }
    if (run !== undefined) run.retryAt = null
    this.persist()
    this.notify()
    this.arm()
    this.pump()

    if (task !== undefined && run !== undefined && (status === 'failed' || status === 'timeout')) {
      this.scheduleRetry(task, run)
    }
  }

  /**
   * Failure retries are separate from missed-run catch-up and bounded. The
   * deadline is persisted on the run, so a restart keeps the pending retry
   * instead of forgetting it — and `tick` re-checks pause/delete/expiry before
   * it ever fires.
   */
  private scheduleRetry(task: Task, run: Run): void {
    if (!task.enabled) return
    if (run.attempt > task.maxRetries) return
    const delay = RETRY_BACKOFF_MS * run.attempt
    run.retryAt = new Date(this.now() + delay).toISOString()
    run.log.push({
      at: new Date(this.now()).toISOString(),
      level: 'info',
      text: `将在 ${formatInstant(Date.parse(run.retryAt), task.timeZone)}（${task.timeZone}）自动重试第 ${run.attempt + 1} 次`,
    })
    this.persist()
    this.notify()
    this.arm()
  }

  /** Drop persisted retry marks for one task, leaving a note in each record. */
  private clearRetriesOf(taskId: string, reason: string): void {
    const stamp = new Date(this.now()).toISOString()
    let cancelled = 0
    for (const run of this.store.runs) {
      if (run.taskId !== taskId || run.retryAt === null) continue
      run.retryAt = null
      run.log.push({ at: stamp, level: 'warn', text: `自动重试已取消：${reason}` })
      cancelled += 1
    }
    if (cancelled > 0) this.log('info', `自动重试已取消：${reason}（${cancelled} 条）`)
  }

  /** Runs the engine still owns: in flight, or queued and waiting for a slot. */
  private isLive(run: Run): boolean {
    if (this.active.has(run.id)) return true
    if (this.queue.some((item) => item.runId === run.id)) return true
    return this.deferred.some((item) => item.runId === run.id)
  }

  private patchRun(runId: string, mutate: (run: Run) => void): void {
    const run = this.store.runs.find((entry) => entry.id === runId)
    if (run === undefined) return
    mutate(run)
    this.persist()
  }
}

/* ---------------------------------------------------------------- helpers */

function normalizeTask(input: Task, existing: Task | undefined, options: EngineOptions, defaults: TaskDefaults): Task {
  const name = String(input.name ?? '').trim()
  if (name.length === 0) throw new Error('请填写任务名称')
  const prompt = String(input.prompt ?? '').trim()
  if (prompt.length === 0) throw new Error('请填写任务提示词')
  if (typeof input.timeZone !== 'string' || input.timeZone.length === 0) throw new Error('请选择任务时区')
  const timeoutMinutes = Number(input.timeoutMinutes ?? options.defaultTimeoutMinutes)
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) throw new Error('运行超时必须大于 0 分钟')
  const maxRetries = Number(input.maxRetries ?? 1)
  if (!Number.isFinite(maxRetries) || maxRetries < 0 || maxRetries > 5) throw new Error('重试次数需在 0–5 之间')
  const startAt = input.startAt ?? null
  const endAt = input.endAt ?? null
  if (startAt !== null && endAt !== null && Date.parse(startAt) >= Date.parse(endAt)) {
    throw new Error('有效期结束时间必须晚于开始时间')
  }
  const nowIso = new Date().toISOString()
  const creating = existing === undefined
  const requested = normalizeModel(input.model)
  const model = requested ?? (creating ? null : (existing?.model ?? null))
  // A new task freezes the Host default here; an edit keeps whatever the task
  // already pinned, so changing the default later never moves an old task.
  const pinnedModel = model ?? (creating && defaults.model !== null ? { provider: defaults.model.provider, model: defaults.model.model } : null)
  const modelSource: Task['modelSource'] =
    requested !== null ? 'explicit' : pinnedModel === null ? 'legacy' : creating ? 'default' : (existing?.modelSource ?? 'default')
  // Only the frozen *default* carries the Host's effort along with it. An
  // explicitly chosen model keeps whatever effort the user picked, otherwise
  // null — silently inheriting another model's effort is wrong.
  // The editor sends the whole task, so an explicit null means "provider
  // default" and must win — otherwise a pinned effort could never be cleared.
  // Only a *new* task that freezes the Host default inherits the Host effort.
  const askedEffort = normalizeEffort(input.reasoningEffort)
  const pinnedEffort =
    creating
      ? (askedEffort ?? (requested === null ? (defaults.model?.reasoningEffort ?? null) : null))
      : askedEffort
  const workspaceId =
    typeof input.workspaceId === 'string' && input.workspaceId.trim().length > 0 ? input.workspaceId.trim() : null
  if (workspaceId !== null && defaults.workspaceIds !== null && !defaults.workspaceIds.has(workspaceId)) {
    throw new Error(`工作区 ${workspaceId} 不在宿主的工作区列表里，请重新选择`)
  }
  const workspacePath =
    typeof input.workspace === 'string' && input.workspace.trim().length > 0 ? input.workspace.trim() : null
  const permissionPreset =
    typeof input.permissionPreset === 'string' && input.permissionPreset.trim().length > 0
      ? input.permissionPreset.trim()
      : null
  if (permissionPreset !== null && defaults.presets !== null && !defaults.presets.includes(permissionPreset)) {
    throw new Error(`权限预设 ${permissionPreset} 不在宿主目录里，请重新选择`)
  }
  const presetSpec = permissionPreset === null ? undefined : defaults.presetSpecs[permissionPreset]
  const legacyKnobs = {
    approval: input.permission?.approval === 'ask' ? ('ask' as const) : ('never' as const),
    sandbox:
      input.permission?.sandbox === 'danger-full-access' || input.permission?.sandbox === 'read-only'
        ? input.permission.sandbox
        : ('workspace-write' as const),
  }
  const knobs =
    permissionPreset !== null && presetSpec !== undefined
      ? {
          approval: presetSpec.approval === 'ask' ? ('ask' as const) : ('never' as const),
          sandbox:
            presetSpec.sandbox === 'danger-full-access' || presetSpec.sandbox === 'read-only'
              ? (presetSpec.sandbox as 'danger-full-access' | 'read-only')
              : ('workspace-write' as const),
        }
      : legacyKnobs
  const legacyIssues = (input.legacyIssues ?? existing?.legacyIssues ?? []).filter((issue) => {
    if (typeof issue !== 'string') return false
    if (pinnedModel !== null && issue.startsWith('模型未固化')) return false
    if (permissionPreset !== null && issue.startsWith('权限组合')) return false
    if (workspaceId !== null && issue.startsWith('工作文件夹是原始路径')) return false
    return true
  })
  const task: Task = {
    id: typeof input.id === 'string' && input.id.length > 0 ? input.id : randomUUID(),
    name,
    prompt,
    attachments: Array.isArray(input.attachments) ? input.attachments.filter((path) => typeof path === 'string' && path.length > 0) : [],
    model: pinnedModel,
    modelSource: pinnedModel === null ? 'legacy' : modelSource,
    reasoningEffort: pinnedModel === null ? null : pinnedEffort,
    workspaceId,
    workspace: workspacePath,
    workspaceSource: workspaceId !== null ? 'workspace' : workspacePath !== null ? 'custom' : 'task-dir',
    permissionPreset,
    permissionSource: permissionPreset !== null ? 'preset' : 'legacy',
    legacyIssues,
    sessionMode: input.sessionMode === 'persistent' ? 'persistent' : 'independent',
    sessionId: input.sessionMode === 'persistent' ? (existing?.sessionId ?? input.sessionId ?? null) : null,
    sessionModelKey:
      input.sessionMode === 'persistent'
        ? (existing?.sessionId === (input.sessionId ?? existing?.sessionId) ? (existing?.sessionModelKey ?? null) : null)
        : null,
    permission: knobs,
    schedule: { ...input.schedule },
    timeZone: input.timeZone,
    startAt,
    endAt,
    missedPolicy: input.missedPolicy === 'skip' ? 'skip' : 'catchup',
    enabled: input.enabled !== false,
    maxRetries,
    timeoutMinutes,
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    nextRunAt: existing?.nextRunAt ?? null,
    lastRunAt: existing?.lastRunAt ?? null,
    lastRunStatus: existing?.lastRunStatus ?? null,
    lastError: existing?.lastError ?? null,
    templateId: input.templateId ?? null,
  }
  // Validate the schedule eagerly so a bad cron never reaches the scheduler.
  nextOccurrence({ spec: task.schedule, timeZone: task.timeZone, fromMs: Date.now() - 1000 })
  if (!existsSync(options.dataRoot)) {
    try {
      mkdirSync(options.dataRoot, { recursive: true })
    } catch {
      /* created lazily per run */
    }
  }
  return task
}

function normalizeModel(model: Task['model'] | undefined): Task['model'] {
  if (model === null || model === undefined) return null
  const provider = String(model.provider ?? '').trim()
  const name = String(model.model ?? '').trim()
  if (provider.length === 0 || name.length === 0) return null
  return { provider, model: name }
}

function normalizeCatalog(catalog: any): ModelCatalogEntry[] {
  // Real shape (dsh-api-session-controller buildModelCatalog):
  // { default, routableProviders, groups: [{ id, name, models: [{ id, name }] }], failures }
  const entries: ModelCatalogEntry[] = []
  const groups = Array.isArray(catalog?.groups) ? catalog.groups : []
  for (const group of groups) {
    const provider = String(group?.id ?? '').trim()
    if (provider.length === 0) continue
    const models = Array.isArray(group?.models) ? group.models : []
    for (const model of models) {
      const id = String(model?.id ?? '').trim()
      if (id.length === 0) continue
      entries.push({ provider, model: id, label: String(model?.name ?? id), reasoning: normalizeReasoning(model?.reasoning) })
    }
  }
  // Tolerate a flat list too, in case a future Host flattens the catalog.
  const flat = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.models) ? catalog.models : []
  for (const item of flat) {
    if (item === null || typeof item !== 'object') continue
    const provider = String(item.provider ?? item.providerId ?? '').trim()
    const model = String(item.model ?? item.modelId ?? item.id ?? '').trim()
    if (provider.length === 0 || model.length === 0) continue
    entries.push({
      provider,
      model,
      label: String(item.label ?? item.name ?? model),
      reasoning: normalizeReasoning(item.reasoning),
    })
  }
  const seen = new Set<string>()
  return entries
    .filter((entry) => {
      const key = `${entry.provider}/${entry.model}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => `${left.provider}/${left.label}`.localeCompare(`${right.provider}/${right.label}`))
}

/** The provider's own thinking-level table; never invented, never flattened. */
function normalizeReasoning(input: unknown): ModelCatalogEntry['reasoning'] {
  if (input === null || input === undefined || typeof input !== 'object') return null
  const raw = input as { efforts?: unknown; defaultEffort?: unknown }
  const listed = Array.isArray(raw.efforts) ? raw.efforts : []
  const efforts = listed
    .map((effort) => {
      if (effort === null || typeof effort !== 'object') return null
      const entry = effort as { id?: unknown; name?: unknown; description?: unknown }
      const id = String(entry.id ?? '').trim()
      if (id.length === 0) return null
      return {
        id,
        name: String(entry.name ?? id),
        ...(typeof entry.description === 'string' && entry.description.length > 0 ? { description: entry.description } : {}),
      }
    })
    .filter((effort): effort is { id: string; name: string; description?: string } => effort !== null)
  if (efforts.length === 0) return null
  const defaultEffort = typeof raw.defaultEffort === 'string' && raw.defaultEffort.length > 0 ? raw.defaultEffort : undefined
  return { efforts, ...(defaultEffort === undefined ? {} : { defaultEffort }) }
}

function mergeTaskOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

/**
 * Trim run history without ever dropping a run the engine still owns: an
 * in-flight or queued record has to survive trimming, otherwise its queue item
 * becomes an orphan and the trigger disappears silently.
 */
function pruneRuns(runs: Run[], limit: number, isLive: (run: Run) => boolean): Run[] {
  const ordered = [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const live = ordered.filter((run) => isLive(run))
  const liveIds = new Set(live.map((run) => run.id))
  const keep = ordered.filter((run) => !liveIds.has(run.id)).slice(0, Math.max(limit, 20))
  return [...live, ...keep].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

/** The model a task asked for, in a comparable form (empty = follow default). */
/** Coerce the wire value: the UI can send the literal strings "undefined"/"null". */
function normalizeEffort(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return null
  return trimmed
}

function modelKey(task: Task): string | null {
  if (task.model === null) return null
  return `${task.model.provider}/${task.model.model}${task.reasoningEffort === null ? '' : `@${task.reasoningEffort}`}`
}

function dedupeTools(tools: Array<{ name: string; title: string }>): Array<{ name: string; title: string }> {
  const seen = new Set<string>()
  const listed: Array<{ name: string; title: string }> = []
  for (const tool of tools) {
    if (seen.has(tool.name)) continue
    seen.add(tool.name)
    listed.push(tool)
  }
  return listed
}

function extractText(message: any): string {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n').trim()
}

function clip(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n…（已截断）`
}

export function describeTrigger(trigger: RunTrigger): string {
  switch (trigger) {
    case 'schedule':
      return '定时'
    case 'catchup':
      return '补跑'
    case 'manual':
      return '手动'
    case 'retry':
      return '重试'
    default:
      return trigger
  }
}

/** Small helper so the API layer can map engine errors to the wire shape. */
export function fail(code: string, message: string): ApiErr {
  return { ok: false, code, message }
}
