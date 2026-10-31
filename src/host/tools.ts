/**
 * Model-facing tools for the task centre.
 *
 * A conversation is a first-class way to create and manage tasks: these tools
 * call the *same* engine methods and validation the form uses, so a task made in
 * chat lands in the very same store and shows up in the very same panel.
 *
 * The definitions are compiled here instead of importing `defineTool`, because
 * this plugin deliberately carries no `@deepseek-ai/*` runtime dependency. The
 * shape below is exactly what `ctx.tools.register` consumes: parameters as a JSON
 * Schema, plus `output.schema` and `output.render`, with `execute` returning the
 * raw value (the registry renders and freezes it).
 */

import type { Run, ScheduleSpec, Task } from '../shared/types.ts'
import type { TaskEngine } from './engine.ts'
import { listTimeZones, hostTimeZone } from './time.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyCtx = any

export interface ToolDeps {
  engine: TaskEngine
  ctx: AnyCtx
}

interface CompiledTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: { schema: Record<string, unknown>; render: (args: any, value: any) => unknown }
  execute: (args: any, exec: any) => Promise<unknown>
  presentCall: (args: any) => unknown
}

const TEXT_SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }

/** Same compiled shape `defineTool` produces, minus the import. */
function tool(spec: {
  name: string
  description: string
  parameters: Record<string, unknown>
  schema: Record<string, unknown>
  render: (value: any) => string
  execute: (args: any, exec: any) => Promise<unknown>
}): CompiledTool {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.schema,
      // The registry hands this back as the model-visible result.
      render: (_args: any, value: any) => [{ type: 'text', text: spec.render(value) }],
    },
    execute: spec.execute,
    presentCall: (args: any) => ({
      card: 'generic',
      title: spec.name,
      kind: spec.name,
      rawInput: args,
    }),
  }
}

const SCHEDULE_PARAMS = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['once', 'interval', 'daily', 'weekly', 'cron'],
      description: 'once=单次 / interval=固定间隔 / daily=每天 / weekly=每周 / cron=Cron 表达式',
    },
    time: { type: 'string', description: 'daily/weekly 的本地时间，24 小时制 HH:mm，例如 09:00' },
    everyMinutes: { type: 'number', description: 'interval 的间隔分钟数' },
    weekdays: { type: 'array', items: { type: 'number' }, description: 'weekly 的星期几，1=周一 … 7=周日' },
    cron: { type: 'string', description: '五字段 Vixie cron，例如 "0 9 * * 1-5"' },
    at: { type: 'string', description: 'once 的绝对时间（ISO 8601，含时区偏移或 Z）' },
  },
  additionalProperties: false,
}

const TASK_ROW_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    enabled: { type: 'boolean' },
    schedule: { type: 'string' },
    timeZone: { type: 'string' },
    nextRunAt: { type: 'string' },
    lastRunStatus: { type: 'string' },
    model: { type: 'string' },
    modelSource: { type: 'string' },
    workspace: { type: 'string' },
    workspaceSource: { type: 'string' },
    permission: { type: 'string' },
    sessionMode: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['id', 'name', 'enabled'],
  additionalProperties: false,
}

export interface TaskRow {
  id: string
  name: string
  enabled: boolean
  schedule: string
  timeZone: string
  nextRunAt: string
  lastRunStatus: string
  model: string
  modelSource: string
  workspace: string
  workspaceSource: string
  permission: string
  sessionMode: string
  notes: string
}

export function taskRow(engine: TaskEngine, task: Task): TaskRow {
  void engine
  return {
    id: task.id,
    name: task.name,
    enabled: task.enabled,
    schedule: describeScheduleShort(task),
    timeZone: task.timeZone,
    nextRunAt: task.nextRunAt ?? '',
    lastRunStatus: task.lastRunStatus ?? '',
    model:
      task.model === null
        ? '（跟随宿主默认）'
        : `${task.model.provider}/${task.model.model}${task.reasoningEffort === null ? '' : ` · ${task.reasoningEffort}`}`,
    modelSource:
      task.modelSource === 'default' ? '创建时固化的默认模型' : task.modelSource === 'explicit' ? '显式选择' : '未固化（跟随宿主默认）',
    workspace: task.workspace ?? (task.workspaceId === null ? '' : task.workspaceId),
    workspaceSource:
      task.workspaceSource === 'workspace' ? '宿主工作区' : task.workspaceSource === 'custom' ? '自定义路径' : '任务独立目录',
    permission: task.permissionPreset ?? `旧组合：沙箱 ${task.permission.sandbox} / 审批 ${task.permission.approval}`,
    sessionMode: task.sessionMode === 'persistent' ? '持续会话' : '独立会话',
    notes: task.legacyIssues.length === 0 ? '' : task.legacyIssues.join('；'),
  }
}

/** Reject a preset the Host does not publish, listing what it does publish. */
async function resolvePreset(engine: TaskEngine, raw: unknown): Promise<string | null> {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const wanted = String(raw).trim()
  // Enabling full access is a human decision with its own confirmation gate in
  // the manager UI. A chat tool must not be able to skip that gate, otherwise a
  // prompt that talks the agent into `task_create` + `task_run` would execute
  // arbitrary commands with no approval at all.
  if (wanted === 'danger-full-access') {
    throw new Error(
      '完全权限（danger-full-access）不能在对话里直接开启，请到任务中心的编辑表单里手动确认后再启用',
    )
  }
  const snapshot = await engine.snapshot()
  const available = snapshot.permissions.map((entry) => entry.value)
  if (available.includes(wanted)) return wanted
  throw new Error(
    available.length === 0
      ? '宿主没有可用的权限预设'
      : `权限预设 ${wanted} 不在宿主目录里。可选：${available.join(' / ')}`,
  )
}

function describeScheduleShort(task: Task): string {
  const spec = task.schedule
  switch (spec.kind) {
    case 'once':
      return `单次 ${spec.at ?? '—'}`
    case 'interval':
      return `每 ${spec.everyMinutes ?? '?'} 分钟`
    case 'daily':
      return `每天 ${spec.time ?? '—'}`
    case 'weekly':
      return `每周 ${(spec.weekdays ?? []).join(',')} 的 ${spec.time ?? '—'}`
    case 'cron':
      return `cron ${spec.cron ?? '—'}`
    default:
      return String(spec.kind)
  }
}

/** Compose a schedule spec from tool arguments, rejecting half-filled shapes. */
function scheduleFrom(args: any): ScheduleSpec {
  const kind = String(args.kind ?? '')
  switch (kind) {
    case 'once':
      if (typeof args.at !== 'string' || !Number.isFinite(Date.parse(args.at))) {
        throw new Error('kind=once 需要 at（ISO 8601 时间）')
      }
      return { kind, at: args.at }
    case 'interval': {
      const every = Number(args.everyMinutes)
      if (!Number.isFinite(every) || every < 1) throw new Error('kind=interval 需要 everyMinutes（≥1）')
      return { kind, everyMinutes: every }
    }
    case 'daily':
      if (typeof args.time !== 'string') throw new Error('kind=daily 需要 time（HH:mm）')
      return { kind, time: args.time }
    case 'weekly': {
      if (typeof args.time !== 'string') throw new Error('kind=weekly 需要 time（HH:mm）')
      const days = Array.isArray(args.weekdays) ? args.weekdays.map((day: unknown) => Number(day)) : []
      if (days.length === 0 || days.some((day: number) => !Number.isFinite(day) || day < 1 || day > 7)) {
        throw new Error('kind=weekly 需要 weekdays（1=周一 … 7=周日）')
      }
      return { kind, time: args.time, weekdays: days }
    }
    case 'cron':
      if (typeof args.cron !== 'string' || args.cron.trim().length === 0) {
        throw new Error('kind=cron 需要 cron（五字段表达式）')
      }
      return { kind, cron: args.cron.trim() }
    default:
      throw new Error('kind 必须是 once / interval / daily / weekly / cron 之一')
  }
}

/** The time zone a chat request should default to: the caller's own. */
function callerTimeZone(exec: any): string {
  try {
    const session = exec?.agent?.session
    const header = session?.requestHeader?.()
    const zone = header?.clientTimeZone
    if (typeof zone === 'string' && zone.length > 0) return zone
  } catch {
    /* fall through to the Host zone */
  }
  return hostTimeZone()
}

/** Resolve "provider/model" against the live catalog so chat creation fails fast. */
async function resolveModel(engine: TaskEngine, raw: unknown): Promise<{ provider: string; model: string } | null> {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') throw new Error('model 需要写成 "provider/model"')
  const wanted = raw.trim()
  const snapshot = await engine.snapshot()
  const entry = snapshot.models.find(
    (item) => `${item.provider}/${item.model}` === wanted || item.model === wanted,
  )
  if (entry === undefined) {
    const preview = snapshot.models
      .slice(0, 6)
      .map((item) => `${item.provider}/${item.model}`)
      .join('、')
    throw new Error(`模型 ${wanted} 不在可用列表里。可选示例：${preview}`)
  }
  return { provider: entry.provider, model: entry.model }
}

function findTask(engine: TaskEngine, idOrName: string): Task {
  const key = idOrName.trim()
  const found = engine.taskByIdOrName(key)
  if (found === null) throw new Error(`找不到任务「${key}」（可用 task_list 查看全部任务）`)
  return found
}

function renderTaskLine(row: TaskRow): string {
  const flags = [
    row.enabled ? '已启用' : '已暂停',
    row.schedule,
    `${row.timeZone}`,
    row.nextRunAt === '' ? '无下次执行' : `下次 ${row.nextRunAt}`,
    row.lastRunStatus === '' ? '从未运行' : `上次 ${row.lastRunStatus}`,
    `模型 ${row.model}`,
    row.sessionMode,
  ]
  return `- ${row.name}（${row.id}）｜${flags.join('｜')}`
}

/* ------------------------------------------------------------------ tools */

export function buildTools(deps: ToolDeps): CompiledTool[] {
  const { engine } = deps

  return [
    tool({
      name: 'task_create',
      description:
        '在「自动化任务中心」创建一个会真正执行的定时任务（到点由 DSH 自己跑一轮 Agent，把产物写进工作文件夹）。' +
        '与界面里的手工表单共用同一份存储与校验，创建后可在「自动化任务」面板交叉编辑。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '任务名称，简短可辨认' },
          prompt: { type: 'string', description: '到点后要执行的完整指令（写清产出文件与格式）' },
          schedule: SCHEDULE_PARAMS,
          timeZone: { type: 'string', description: 'IANA 时区，例如 Asia/Shanghai；省略时用调用方所在时区' },
          workspaceId: { type: 'string', description: '宿主已注册工作区的 id（推荐）；与 workspace 互斥' },
          workspace: { type: 'string', description: '可选，自定义执行文件夹绝对路径；省略且无 workspaceId 时用任务独立目录' },
          model: { type: 'string', description: '可选，"provider/model"；省略则固化调用时的宿主默认模型' },
          reasoningEffort: { type: 'string', description: '可选思考档位，需所选模型支持' },
          permissionPreset: { type: 'string', description: '宿主权限预设，例如 workspace-write / read-only；完全权限只能在任务中心界面里手动确认' },
          sessionMode: { type: 'string', enum: ['independent', 'persistent'] },
          missedPolicy: { type: 'string', enum: ['catchup', 'skip'] },
          maxRetries: { type: 'number' },
          timeoutMinutes: { type: 'number' },
          enabled: { type: 'boolean' },
        },
        required: ['name', 'prompt', 'schedule'],
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: { task: TASK_ROW_SCHEMA, message: { type: 'string' } },
        required: ['task', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any, exec: any) => {
        const zone = typeof args.timeZone === 'string' && args.timeZone.trim().length > 0 ? args.timeZone.trim() : callerTimeZone(exec)
        if (!listTimeZones().includes(zone)) throw new Error(`未知时区 ${zone}，请使用 IANA 名称，例如 Asia/Shanghai`)
        const model = await resolveModel(engine, args.model)
        const preset = await resolvePreset(engine, args.permissionPreset)
        const draft: Task = {
          id: '',
          name: String(args.name ?? '').trim(),
          prompt: String(args.prompt ?? ''),
          attachments: [],
          model,
          modelSource: model === null ? 'legacy' : 'explicit',
          reasoningEffort: typeof args.reasoningEffort === 'string' ? args.reasoningEffort : null,
          workspaceId: typeof args.workspaceId === 'string' && args.workspaceId.trim() !== '' ? args.workspaceId.trim() : null,
          workspace: typeof args.workspace === 'string' && args.workspace.trim() !== '' ? args.workspace.trim() : null,
          workspaceSource: typeof args.workspaceId === 'string' && args.workspaceId.trim() !== '' ? 'workspace' : 'custom',
          sessionMode: args.sessionMode === 'persistent' ? 'persistent' : 'independent',
          sessionId: null,
          sessionModelKey: null,
          permissionPreset: preset,
          permissionSource: preset === null ? 'legacy' : 'preset',
          permission: { approval: 'never', sandbox: 'workspace-write' },
          legacyIssues: [],
          schedule: scheduleFrom(args.schedule ?? args),
          timeZone: zone,
          startAt: null,
          endAt: null,
          missedPolicy: args.missedPolicy === 'skip' ? 'skip' : 'catchup',
          enabled: args.enabled !== false,
          maxRetries: args.maxRetries === undefined ? 1 : Number(args.maxRetries),
          timeoutMinutes: args.timeoutMinutes === undefined ? 20 : Number(args.timeoutMinutes),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          nextRunAt: null,
          lastRunAt: null,
          lastRunStatus: null,
          lastError: null,
          templateId: null,
        }
        const saved = engine.saveTask(draft)
        if (!saved.ok) throw new Error(saved.message)
        const row = taskRow(engine, saved.value)
        return {
          task: row,
          message:
            `已创建任务「${row.name}」（${row.id}）。\n` +
            `规则：${row.schedule}｜时区：${row.timeZone}｜${row.enabled ? '已启用' : '已暂停'}\n` +
            `${row.nextRunAt === '' ? '下次执行：暂无（已暂停或超出有效期）' : `下次执行：${row.nextRunAt}`}\n` +
            `模型：${row.model}（${row.modelSource}）｜权限：${row.permission}｜${row.sessionMode}\n` +
            `工作文件夹：${row.workspace === '' ? '（任务独立目录）' : row.workspace}（${row.workspaceSource}）` +
            (row.notes === '' ? '' : `\n注意：${row.notes}`),
        }
      },
    }),

    tool({
      name: 'task_list',
      description: '列出「自动化任务中心」里的任务（名称、规则、下次执行、上次结果）。用于回答“我有哪些定时任务”。',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['all', 'enabled', 'paused'], description: '默认 all' },
          query: { type: 'string', description: '可选，按名称或提示词模糊匹配' },
        },
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: { tasks: { type: 'array', items: TASK_ROW_SCHEMA }, message: { type: 'string' } },
        required: ['tasks', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any) => {
        const filter = args.filter === 'enabled' || args.filter === 'paused' ? args.filter : 'all'
        const needle = typeof args.query === 'string' && args.query.trim().length > 0 ? args.query.trim().toLowerCase() : null
        const snapshot = await engine.snapshot()
        const rows = snapshot.tasks
          .filter((task) => (filter === 'enabled' ? task.enabled : filter === 'paused' ? !task.enabled : true))
          .filter((task) => (needle === null ? true : `${task.name}\n${task.prompt}`.toLowerCase().includes(needle)))
          .map((task) => taskRow(engine, task))
        return {
          tasks: rows,
          message:
            rows.length === 0
              ? '当前没有符合条件的任务。'
              : `共 ${rows.length} 个任务：\n${rows.map(renderTaskLine).join('\n')}`,
        }
      },
    }),

    tool({
      name: 'task_get',
      description: '读取一个任务的完整配置（提示词、调度、时区、模型、工作文件夹、权限、最近一次运行）。',
      parameters: {
        type: 'object',
        properties: { idOrName: { type: 'string', description: '任务 id 或任务名称' } },
        required: ['idOrName'],
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: { task: TASK_ROW_SCHEMA, prompt: { type: 'string' }, message: { type: 'string' } },
        required: ['task', 'prompt', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any) => {
        const task = findTask(engine, String(args.idOrName ?? ''))
        const row = taskRow(engine, task)
        return {
          task: row,
          prompt: task.prompt,
          message:
            `${renderTaskLine(row)}\n` +
            `漏跑策略：${task.missedPolicy === 'catchup' ? '补跑最近一次' : '跳过'}｜重试：${task.maxRetries} 次｜超时：${task.timeoutMinutes} 分钟\n` +
            `权限：approval=${task.permission.approval}，sandbox=${task.permission.sandbox}\n` +
            `提示词：\n${task.prompt}`,
        }
      },
    }),

    tool({
      name: 'task_update',
      description:
        '修改一个已存在的任务（只传要改的字段）。与界面里的编辑表单共用同一份校验；改调度或启用状态会重算下次执行时间。',
      parameters: {
        type: 'object',
        properties: {
          idOrName: { type: 'string', description: '任务 id 或任务名称' },
          name: { type: 'string' },
          prompt: { type: 'string' },
          schedule: SCHEDULE_PARAMS,
          timeZone: { type: 'string' },
          workspaceId: { type: 'string', description: '宿主已注册工作区 id；传 "" 清空' },
          workspace: { type: 'string', description: '自定义路径；传 "" 清空' },
          model: { type: 'string', description: '写成 "provider/model"' },
          reasoningEffort: { type: 'string' },
          permissionPreset: { type: 'string', description: '宿主权限预设名；必须是宿主目录里的值（完全权限不允许在对话里设置）' },
          sessionMode: { type: 'string', enum: ['independent', 'persistent'] },
          missedPolicy: { type: 'string', enum: ['catchup', 'skip'] },
          maxRetries: { type: 'number' },
          timeoutMinutes: { type: 'number' },
          enabled: { type: 'boolean' },
        },
        required: ['idOrName'],
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: { task: TASK_ROW_SCHEMA, message: { type: 'string' } },
        required: ['task', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any) => {
        const current = findTask(engine, String(args.idOrName ?? ''))
        const next: Task = structuredClone(current)
        if (typeof args.name === 'string') next.name = args.name
        if (typeof args.prompt === 'string') next.prompt = args.prompt
        if (args.schedule !== undefined && args.schedule !== null) next.schedule = scheduleFrom(args.schedule)
        if (typeof args.timeZone === 'string') {
          if (!listTimeZones().includes(args.timeZone)) throw new Error(`未知时区 ${args.timeZone}`)
          next.timeZone = args.timeZone
        }
        if (typeof args.workspaceId === 'string') {
          next.workspaceId = args.workspaceId.trim() === '' ? null : args.workspaceId.trim()
          next.workspaceSource = next.workspaceId === null ? 'custom' : 'workspace'
        }
        if (typeof args.workspace === 'string') {
          next.workspace = args.workspace.trim() === '' ? null : args.workspace.trim()
          next.workspaceSource = next.workspace === null ? 'task-dir' : 'custom'
        }
        if (typeof args.permissionPreset === 'string') {
          // Same gate as `task_create`: a chat tool cannot promote a task to full
          // access, only the manager UI (with its confirmation) can.
          next.permissionPreset = await resolvePreset(engine, args.permissionPreset)
          next.permissionSource = next.permissionPreset === null ? 'legacy' : 'preset'
        }
        if (args.model !== undefined) {
          next.model = args.model === 'default' || args.model === null ? null : await resolveModel(engine, args.model)
          if (next.model === null) next.reasoningEffort = null
        }
        if (typeof args.reasoningEffort === 'string') next.reasoningEffort = args.reasoningEffort
        if (args.sessionMode === 'persistent' || args.sessionMode === 'independent') next.sessionMode = args.sessionMode
        if (args.missedPolicy === 'catchup' || args.missedPolicy === 'skip') next.missedPolicy = args.missedPolicy
        if (args.maxRetries !== undefined) next.maxRetries = Number(args.maxRetries)
        if (args.timeoutMinutes !== undefined) next.timeoutMinutes = Number(args.timeoutMinutes)
        if (typeof args.enabled === 'boolean') next.enabled = args.enabled
        const saved = engine.saveTask(next)
        if (!saved.ok) throw new Error(saved.message)
        const row = taskRow(engine, saved.value)
        return {
          task: row,
          message: `已更新任务「${row.name}」。\n${renderTaskLine(row)}`,
        }
      },
    }),

    tool({
      name: 'task_enabled',
      description: '启用或暂停一个任务。暂停后不再触发新的运行，正在运行的那次不受影响（用 run_cancel 停止）。',
      parameters: {
        type: 'object',
        properties: {
          idOrName: { type: 'string', description: '任务 id 或任务名称' },
          enabled: { type: 'boolean', description: 'true=启用，false=暂停' },
        },
        required: ['idOrName', 'enabled'],
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: { task: TASK_ROW_SCHEMA, message: { type: 'string' } },
        required: ['task', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any) => {
        const task = findTask(engine, String(args.idOrName ?? ''))
        const result = engine.setEnabled(task.id, args.enabled === true)
        if (!result.ok) throw new Error(result.message)
        const row = taskRow(engine, result.value)
        return {
          task: row,
          message: `任务「${row.name}」已${row.enabled ? '启用' : '暂停'}。${
            row.enabled ? (row.nextRunAt === '' ? '（当前无下次执行，请检查有效期）' : `下次执行：${row.nextRunAt}`) : ''
          }`,
        }
      },
    }),

    tool({
      name: 'task_run',
      description: '立即运行一个任务（不等计划时间）。会真实启动一轮 Agent，运行记录在「运行记录」里可查。',
      parameters: {
        type: 'object',
        properties: { idOrName: { type: 'string', description: '任务 id 或任务名称' } },
        required: ['idOrName'],
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: {
          run: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              taskId: { type: 'string' },
              status: { type: 'string' },
              trigger: { type: 'string' },
            },
            required: ['id', 'taskId', 'status', 'trigger'],
            additionalProperties: false,
          },
          message: { type: 'string' },
        },
        required: ['run', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any) => {
        const task = findTask(engine, String(args.idOrName ?? ''))
        const result = engine.runNow(task.id)
        if (!result.ok) throw new Error(result.message)
        const run = result.value
        return {
          run: { id: run.id, taskId: run.taskId, status: run.status, trigger: run.trigger },
          message: `已把任务「${task.name}」加入运行队列（运行 ${run.id}，状态 ${run.status}）。在「自动化任务 → 运行记录」可看实时状态、工具与产物。`,
        }
      },
    }),

    tool({
      name: 'task_delete',
      description: '删除一个任务。历史运行记录会保留，便于追溯（记录里不含提示词内容）。',
      parameters: {
        type: 'object',
        properties: { idOrName: { type: 'string', description: '任务 id 或任务名称' } },
        required: ['idOrName'],
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: { id: { type: 'string' }, message: { type: 'string' } },
        required: ['id', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any) => {
        const task = findTask(engine, String(args.idOrName ?? ''))
        const result = engine.deleteTask(task.id)
        if (!result.ok) throw new Error(result.message)
        return { id: task.id, message: `已删除任务「${task.name}」。运行历史仍然保留。` }
      },
    }),

    tool({
      name: 'run_list',
      description: '查看运行记录（状态、触发方式、耗时、产物数量）。用于回答“昨天那个任务跑成功了吗”。',
      parameters: {
        type: 'object',
        properties: {
          idOrName: { type: 'string', description: '可选，只看某个任务' },
          status: {
            type: 'string',
            enum: ['all', 'queued', 'running', 'waiting-approval', 'succeeded', 'failed', 'cancelled', 'timeout'],
          },
          limit: { type: 'number', description: '最多返回几条，默认 10' },
        },
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: {
          runs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                taskName: { type: 'string' },
                status: { type: 'string' },
                trigger: { type: 'string' },
                startedAt: { type: 'string' },
                durationMs: { type: 'number' },
                artifacts: { type: 'number' },
                error: { type: 'string' },
              },
              required: ['id', 'taskName', 'status', 'trigger', 'startedAt', 'durationMs', 'artifacts', 'error'],
              additionalProperties: false,
            },
          },
          message: { type: 'string' },
        },
        required: ['runs', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any) => {
        const task = typeof args.idOrName === 'string' && args.idOrName.trim() !== '' ? findTask(engine, args.idOrName) : null
        const runs = engine.listRuns({
          ...(task === null ? {} : { taskId: task.id }),
          ...(typeof args.status === 'string' ? { status: args.status as Run['status'] } : {}),
          ...(args.limit === undefined ? {} : { limit: Math.max(1, Math.min(50, Number(args.limit))) }),
        })
        const rows = runs.map((run) => ({
          id: run.id,
          taskName: run.taskName,
          status: run.status,
          trigger: run.trigger,
          startedAt: run.startedAt ?? run.createdAt,
          durationMs: run.durationMs ?? 0,
          artifacts: run.artifacts.length,
          error: run.error?.message ?? '',
        }))
        return {
          runs: rows,
          message:
            rows.length === 0
              ? '没有符合条件的运行记录。'
              : rows
                  .map(
                    (row) =>
                      `- ${row.startedAt}｜${row.taskName}｜${row.status}（${
                        row.trigger === 'schedule' ? '定时' : row.trigger === 'catchup' ? '补跑' : row.trigger === 'manual' ? '手动' : '重试'
                      }）｜${Math.round(row.durationMs / 1000)}s｜产物 ${row.artifacts}${
                        row.error === '' ? '' : `｜错误：${row.error}`
                      }`,
                  )
                  .join('\n'),
        }
      },
    }),

    tool({
      name: 'run_cancel',
      description: '停止一次正在运行（或排队中）的运行。已结束的记录不会被改动。',
      parameters: {
        type: 'object',
        properties: { runId: { type: 'string', description: '运行记录 id（run_list 可查）' } },
        required: ['runId'],
        additionalProperties: false,
      },
      schema: {
        type: 'object',
        properties: { runId: { type: 'string' }, message: { type: 'string' } },
        required: ['runId', 'message'],
        additionalProperties: false,
      },
      render: (value: any) => value.message,
      execute: async (args: any) => {
        const runId = String(args.runId ?? '')
        const result = engine.cancelRun(runId)
        if (!result.ok) throw new Error(result.message)
        return { runId, message: `已请求停止运行 ${runId}，状态会在记录里更新。` }
      },
    }),
  ]
}

/** Register every tool on the Host tool service; returns a disposer. */
export function registerTools(ctx: AnyCtx, deps: ToolDeps): () => void {
  const disposers: Array<() => void> = []
  for (const definition of buildTools(deps)) {
    disposers.push(ctx.tools.register(definition))
  }
  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* already released by a reload */
      }
    }
  }
}

export { TEXT_SCHEMA }
