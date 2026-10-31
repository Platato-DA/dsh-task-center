/**
 * Adapter over the Host's own reminder service (`schedule`).
 *
 * The native reminders keep their own storage, their own scheduler and their own
 * delivery semantics: a reminder is *delivered into a Session inbox*, which is
 * not the same thing as a job that ran and produced a result. This module only
 * reads and proxies them so one list can show both kinds side by side — it never
 * copies a reminder into our store, never re-schedules it, and never rewrites it.
 *
 * Identity rule: every unified row carries `source` plus the untouched original
 * id, so an action always routes back to the service that owns it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyCtx = any

/** One native reminder, normalized for the merged list. */
export interface ReminderRow {
  readonly source: 'reminder'
  /** Stable unified identity: `reminder:<native id>`. */
  readonly key: string
  readonly id: string
  readonly sessionId: string
  readonly title: string
  readonly prompt: string
  /** `active` when the reminder can still fire, `inactive` once it ended. */
  readonly status: 'active' | 'inactive'
  readonly kind: 'at' | 'after' | 'every' | 'daily' | 'weekly' | 'cron'
  /** The reminder's own next (or only) fire time, as the Host computed it. */
  readonly scheduledAt: string
  readonly timeZone: string | null
  /** Human rule text, e.g. `每天 09:00`, `每周 五 18:00`, or a Cron expression. */
  readonly rule: string
  readonly lastDeliveredAt: string | null
  readonly lastMessageId: string | null
}

export interface ReminderDelivery {
  readonly scheduledAt: string
  readonly deliveredAt: string
  readonly messageId: string
  readonly prompt: string | null
}

export interface ReminderHistory {
  readonly records: ReminderDelivery[]
  readonly earlierRecordsUnavailable: boolean
  readonly earlierRecordsPruned: boolean
  readonly retention: { days: number; records: number } | null
  readonly nextBefore: string | null
}

export interface ReminderRead {
  readonly rows: ReminderRow[]
  /** Non-null when the Host reminder service failed; the list stays usable. */
  readonly error: string | null
}

/** What the client may change on a native reminder: name, text, and timing. */
export interface ReminderTimingChange {
  readonly kind: 'at' | 'every' | 'daily' | 'weekly' | 'cron'
  readonly at?: { date: string; time: string; time_zone: string } | string
  readonly every_seconds?: number
  readonly daily?: { time: string; time_zone: string }
  readonly weekly?: { time: string; time_zone: string; weekdays: number[] }
  readonly cron?: { expression: string; time_zone: string }
}

export interface ReminderUpdateInput {
  readonly id: string
  readonly sessionId: string
  readonly title?: string
  readonly prompt?: string
  readonly change?: ReminderTimingChange
}

const DEFAULT_HISTORY_LIMIT = 50

/** Read the optional Host reminder service without tripping the inject guard. */
export function reminderService(ctx: AnyCtx): any {
  const holder = ctx as { get?: (name: string, strict?: boolean) => any }
  if (typeof holder.get === 'function') {
    try {
      const viaGet = holder.get.call(ctx, 'schedule', false)
      if (viaGet !== undefined) return viaGet
    } catch {
      /* fall through to the property read */
    }
  }
  try {
    return (holder as Record<string, any>).schedule
  } catch {
    return undefined
  }
}

export function unifiedKey(id: string): string {
  return `reminder:${id}`
}

/** The Host stores `08:30:00.000`; show `08:30` and keep real seconds. */
function clockText(value: unknown): string {
  const raw = typeof value === 'string' ? value : ''
  const match = /^(\d{2}:\d{2})(?::00(?:\.0+)?)?$/.exec(raw)
  return match === null ? raw : match[1]
}

/** One-line rule text in the task's own time zone. */
export function describeReminder(record: any): string {
  switch (record?.kind) {
    case 'at':
      return `单次 ${record.scheduledAt}`
    case 'after':
      return `一次性 · 创建后 ${record.afterSeconds} 秒`
    case 'every': {
      const seconds = Number(record.everySeconds)
      if (!Number.isFinite(seconds) || seconds <= 0) return '固定间隔'
      if (seconds % 3600 === 0) return `每 ${seconds / 3600} 小时`
      if (seconds % 60 === 0) return `每 ${seconds / 60} 分钟`
      return `每 ${seconds} 秒`
    }
    case 'daily':
      return `每天 ${clockText(record.time)}（${record.timeZone}）`
    case 'weekly': {
      const weekdays = Array.isArray(record.weekdays) ? [...record.weekdays] : []
      const names = ['一', '二', '三', '四', '五', '六', '日']
      const days = weekdays
        .sort((a, b) => a - b)
        .map((day) => names[(Number(day) + 6) % 7] ?? String(day))
        .join('、')
      return `每周${days === '' ? '' : ` ${days}`} ${clockText(record.time)}（${record.timeZone}）`
    }
    case 'cron':
      return `Cron ${record.expression}（${record.timeZone}）`
    default:
      return '未知规则'
  }
}

function reminderTimeZone(record: any): string | null {
  const zone = record?.timeZone
  return typeof zone === 'string' && zone !== '' ? zone : null
}

/** Normalize one `ScheduleCatalogEntry` (record + session binding + status). */
export function toRow(entry: any): ReminderRow | null {
  const id = typeof entry?.id === 'string' ? entry.id : ''
  if (id === '') return null
  const sessionId = typeof entry?.sessionId === 'string' ? entry.sessionId : ''
  const lastDelivery = entry?.lastDelivery ?? null
  return {
    source: 'reminder',
    key: unifiedKey(id),
    id,
    sessionId,
    title: typeof entry?.title === 'string' ? entry.title : '（未命名提醒）',
    prompt: typeof entry?.prompt === 'string' ? entry.prompt : '',
    status: entry?.status === 'inactive' ? 'inactive' : 'active',
    kind: typeof entry?.kind === 'string' ? entry.kind : 'at',
    scheduledAt: typeof entry?.scheduledAt === 'string' ? entry.scheduledAt : '',
    timeZone: reminderTimeZone(entry),
    rule: describeReminder(entry),
    lastDeliveredAt:
      typeof lastDelivery?.deliveredAt === 'string' ? lastDelivery.deliveredAt : null,
    lastMessageId: typeof lastDelivery?.messageId === 'string' ? lastDelivery.messageId : null,
  }
}

/**
 * Read every Host reminder. A failing Host service must not blank the page: the
 * caller keeps its own tasks and shows the reason with a retry control.
 */
export async function readReminders(ctx: AnyCtx): Promise<ReminderRead> {
  const service = reminderService(ctx)
  if (service === undefined) {
    return { rows: [], error: '宿主没有 schedule 服务，原生提醒不可用' }
  }
  if (typeof service.catalog !== 'function') {
    return { rows: [], error: '宿主 schedule 服务没有 catalog 方法，无法读取原生提醒' }
  }
  try {
    const entries = await service.catalog()
    const rows: ReminderRow[] = []
    for (const entry of Array.isArray(entries) ? entries : []) {
      const row = toRow(entry)
      if (row !== null) rows.push(row)
    }
    rows.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
    return { rows, error: null }
  } catch (error) {
    return { rows: [], error: `读取原生提醒失败：${(error as Error).message}` }
  }
}

/** Delivery records for one reminder — delivery only, never "the job ran". */
export async function readHistory(
  ctx: AnyCtx,
  id: string,
  sessionId: string,
  limit?: number,
): Promise<ReminderHistory> {
  const service = reminderService(ctx)
  if (service === undefined || typeof service.history !== 'function') {
    throw new Error('宿主没有 schedule.history，无法读取投递记录')
  }
  const wanted = Number.isSafeInteger(limit) ? Math.min(Math.max(Number(limit), 1), 100) : DEFAULT_HISTORY_LIMIT
  const result = await service.history({ sessionId, id, limit: wanted })
  if (result === null || typeof result !== 'object') {
    throw new Error('宿主 schedule.history 返回了意外结果')
  }
  if (result.code === 'schedule_not_found') throw new Error('提醒已不存在（可能已被删除）')
  if (result.code === 'delivery_cursor_not_found') throw new Error('投递游标不存在')
  const records: ReminderDelivery[] = []
  for (const item of Array.isArray(result.records) ? result.records : []) {
    records.push({
      scheduledAt: typeof item?.scheduledAt === 'string' ? item.scheduledAt : '',
      deliveredAt: typeof item?.deliveredAt === 'string' ? item.deliveredAt : '',
      messageId: typeof item?.messageId === 'string' ? item.messageId : '',
      prompt: typeof item?.prompt === 'string' ? item.prompt : null,
    })
  }
  return {
    records,
    earlierRecordsUnavailable: result.earlierRecordsUnavailable === true,
    earlierRecordsPruned: result.earlierRecordsPruned === true,
    retention:
      result.retention === undefined || result.retention === null
        ? null
        : { days: Number(result.retention.days), records: Number(result.retention.records) },
    nextBefore: typeof result.nextBefore === 'string' ? result.nextBefore : null,
  }
}

function timingChange(change: ReminderTimingChange): any {
  switch (change.kind) {
    case 'at':
      if (change.at === undefined) throw new Error('单次提醒需要 at')
      return { kind: 'at', at: change.at }
    case 'every':
      if (!Number.isFinite(Number(change.every_seconds))) throw new Error('固定间隔需要 every_seconds')
      return { kind: 'every', every_seconds: Number(change.every_seconds) }
    case 'daily':
      if (change.daily === undefined) throw new Error('每天提醒需要 daily')
      return { kind: 'daily', daily: change.daily }
    case 'weekly':
      if (change.weekly === undefined) throw new Error('每周提醒需要 weekly')
      return { kind: 'weekly', weekly: change.weekly }
    case 'cron':
      if (change.cron === undefined) throw new Error('Cron 提醒需要 cron 表达式')
      return { kind: 'cron', cron: change.cron }
    default:
      throw new Error(`未知的提醒规则类型：${String((change as { kind?: string }).kind)}`)
  }
}

/**
 * Edit one reminder through the Host's own compare-and-set update: the caller
 * must send the record it observed, so a concurrent change is refused instead of
 * silently overwritten.
 */
export async function updateReminder(ctx: AnyCtx, input: ReminderUpdateInput): Promise<any> {
  const service = reminderService(ctx)
  if (service === undefined || typeof service.update !== 'function') {
    throw new Error('宿主没有 schedule.update，无法修改原生提醒')
  }
  const observed = await observedRecord(service, input.id, input.sessionId)
  const request: any = { sessionId: input.sessionId, id: input.id, expected: observed }
  if (typeof input.title === 'string') request.title = input.title
  if (typeof input.prompt === 'string') request.prompt = input.prompt
  if (input.change !== undefined) request.change = timingChange(input.change)
  const result = await service.update(request)
  if (result === null || typeof result !== 'object') {
    throw new Error('宿主 schedule.update 返回了意外结果')
  }
  if (result.updated === true) return result.record
  switch (result.code) {
    case 'schedule_not_found':
      throw new Error('提醒已不存在（可能已被删除）')
    case 'schedule_ended':
      throw new Error('提醒已经结束，无法修改')
    case 'schedule_conflict':
      throw new Error('提醒刚刚被改动过，请刷新后再试')
    default:
      throw new Error(result.message ?? `修改提醒失败：${String(result.code ?? 'unknown')}`)
  }
}

/** Delete one reminder; the Host keeps queued messages, we do not touch them. */
export async function deleteReminder(
  ctx: AnyCtx,
  id: string,
  sessionId: string,
): Promise<{ deleted: boolean }> {
  const service = reminderService(ctx)
  if (service === undefined || typeof service.delete !== 'function') {
    throw new Error('宿主没有 schedule.delete，无法删除原生提醒')
  }
  const result = await service.delete({ sessionId, id })
  if (result === null || typeof result !== 'object') {
    throw new Error('宿主 schedule.delete 返回了意外结果')
  }
  if (result.deleted === true) return { deleted: true }
  if (result.code === 'schedule_not_found') throw new Error('提醒已不存在（可能已被删除）')
  return { deleted: false }
}

async function observedRecord(service: any, id: string, sessionId: string): Promise<any> {
  if (typeof service.list === 'function') {
    const rows = await service.list({ sessionId })
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.id === id) return row
    }
  }
  const entries = typeof service.catalog === 'function' ? await service.catalog() : []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.id === id) {
      const { sessionId: _session, status: _status, lastDelivery: _last, ...record } = entry
      return record
    }
  }
  throw new Error('提醒已不存在（可能已被删除）')
}
