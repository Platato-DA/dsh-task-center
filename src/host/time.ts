/**
 * Time-zone-aware schedule arithmetic for the task engine.
 *
 * Every recurrence is evaluated against the *task's own IANA zone*: a daily
 * 09:00 task keeps firing at 09:00 local wall-clock time across DST changes,
 * which instant-only math would drift. A non-existent wall time (spring forward)
 * is skipped exactly like Vixie cron does; an ambiguous one (fall back) resolves
 * to the earlier instant so a task still runs once.
 *
 * No DSH or third-party imports: this file is pure and unit-testable.
 */

import type { ScheduleSpec } from '../shared/types.ts'

const MINUTE = 60_000
/**
 * Wall-clock scans walk *days*, not minutes: a sparse expression such as
 * `0 0 29 2 *` is up to four years away, which a bounded minute walk can never
 * reach. Five years covers the worst leap-year gap with slack.
 */
const DAY_SCAN_LIMIT = 5 * 366

export interface WallParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** ISO weekday, 1 = Monday .. 7 = Sunday. */
  weekday: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone)
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    formatterCache.set(timeZone, cached)
  }
  return cached
}

/** Throw a descriptive error when `timeZone` is not a usable IANA zone. */
export function assertTimeZone(timeZone: string): string {
  if (typeof timeZone !== 'string' || timeZone.length === 0) throw new Error('time zone is required')
  if (timeZone === 'UTC') return timeZone
  try {
    formatter(timeZone)
  } catch {
    throw new Error(`"${timeZone}" is not a known IANA time zone`)
  }
  return timeZone
}

/** List the IANA zones this runtime can format in, `UTC` first. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  const zones = typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : []
  return ['UTC', ...zones.filter((zone) => zone !== 'UTC')]
}

/** Read the wall-clock parts of one instant inside `timeZone`. */
export function wallParts(instantMs: number, timeZone: string): WallParts {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs))
  const field: Record<string, string> = {}
  for (const part of parts) field[part.type] = part.value
  const hour = Number(field.hour) % 24
  return {
    year: Number(field.year),
    month: Number(field.month),
    day: Number(field.day),
    hour,
    minute: Number(field.minute),
    weekday: WEEKDAY_INDEX[field.weekday ?? 'Mon'] ?? 1,
  }
}

/** Wall-clock offset of `timeZone` at one instant, in milliseconds east of UTC. */
function offsetAt(instantMs: number, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs))
  const field: Record<string, string> = {}
  for (const part of parts) field[part.type] = part.value
  const asUtc = Date.UTC(
    Number(field.year),
    Number(field.month) - 1,
    Number(field.day),
    Number(field.hour) % 24,
    Number(field.minute),
    Number(field.second),
  )
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * Convert one wall-clock stamp inside `timeZone` to an instant.
 * @returns the earliest matching instant, or `null` when that wall time does
 *   not exist in the zone (a spring-forward gap).
 */
export function wallToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number | null {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0)
  const candidates: number[] = []
  let guess = target - offsetAt(target, timeZone)
  for (let pass = 0; pass < 3; pass += 1) guess = target - offsetAt(guess, timeZone)
  for (const shift of [0, -MINUTE * 60, MINUTE * 60]) {
    const candidate = guess + shift
    const parts = wallParts(candidate, timeZone)
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute &&
      !candidates.includes(candidate)
    ) {
      candidates.push(candidate)
    }
  }
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

function parseClock(value: string | null | undefined, label: string): { hour: number; minute: number } {
  const text = (value ?? '').trim()
  const match = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (match === null) throw new Error(`${label} must be HH:mm, got "${text}"`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new Error(`${label} must be a valid time of day, got "${text}"`)
  return { hour, minute }
}

const CRON_ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
}

export interface CronFields {
  expression: string
  minutes: Set<number>
  hours: Set<number>
  daysOfMonth: Set<number>
  months: Set<number>
  daysOfWeek: Set<number>
  /** A restricted day-of-month plus a restricted day-of-week means OR (Vixie). */
  dayOr: boolean
}

function parseField(
  raw: string,
  label: string,
  min: number,
  max: number,
  normalize?: (value: number) => number,
): Set<number> {
  const values = new Set<number>()
  for (const chunk of raw.split(',')) {
    const piece = chunk.trim()
    if (piece.length === 0) throw new Error(`cron ${label} field has an empty term`)
    const [rangeText, stepText] = piece.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) throw new Error(`cron ${label} step must be a positive integer`)
    let start: number
    let end: number
    if (rangeText === '*') {
      start = min
      end = max
    } else if (rangeText !== undefined && rangeText.includes('-')) {
      const [from, to] = rangeText.split('-')
      start = Number(from)
      end = Number(to)
    } else {
      start = Number(rangeText)
      end = stepText === undefined ? start : max
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) throw new Error(`cron ${label} term "${piece}" is not numeric`)
    if (start < min || end > max || start > end) throw new Error(`cron ${label} term "${piece}" is outside ${min}-${max}`)
    for (let value = start; value <= end; value += step) values.add(normalize === undefined ? value : normalize(value))
  }
  return values
}

/** Parse a five-field Vixie cron expression, leading `@alias` included. */
export function parseCron(expression: string): CronFields {
  const trimmed = expression.trim().replace(/\s+/g, ' ')
  const expanded = CRON_ALIASES[trimmed.toLowerCase()] ?? trimmed
  const fields = expanded.split(' ')
  if (fields.length !== 5) throw new Error(`cron needs five fields, got ${fields.length} in "${expression}"`)
  const [minuteText, hourText, domText, monthText, dowText] = fields as [string, string, string, string, string]
  return {
    expression: trimmed,
    minutes: parseField(minuteText, 'minute', 0, 59),
    hours: parseField(hourText, 'hour', 0, 23),
    daysOfMonth: parseField(domText, 'day-of-month', 1, 31),
    months: parseField(monthText, 'month', 1, 12),
    daysOfWeek: parseField(dowText, 'day-of-week', 0, 7, (value) => (value === 0 ? 7 : value)),
    dayOr: domText !== '*' && dowText !== '*',
  }
}

/**
 * A schedule compiled into two cheap pieces: which local *days* match, and which
 * minute-of-day slots such a day produces. Both search directions then walk days
 * and only look at the slots a day actually has, so a cron that fires once every
 * four years is still found in milliseconds.
 */
interface SchedulePattern {
  dayMatches: (parts: { year: number; month: number; day: number; weekday: number }) => boolean
  /** Ascending, deduplicated minute-of-day (hour * 60 + minute) slots. */
  minutesOfDay: number[]
}

function cronDayMatches(
  fields: CronFields,
  parts: { month: number; day: number; weekday: number },
): boolean {
  if (!fields.months.has(parts.month)) return false
  const dayMatch = fields.daysOfMonth.has(parts.day)
  const weekMatch = fields.daysOfWeek.has(parts.weekday)
  return fields.dayOr ? dayMatch || weekMatch : dayMatch && weekMatch
}

/** Build the wall-clock pattern for one schedule spec. */
function patternFor(spec: ScheduleSpec): SchedulePattern | null {
  switch (spec.kind) {
    case 'daily': {
      const { hour, minute } = parseClock(spec.time, 'daily time')
      return { dayMatches: () => true, minutesOfDay: [hour * 60 + minute] }
    }
    case 'weekly': {
      const { hour, minute } = parseClock(spec.time, 'weekly time')
      const days = new Set((spec.weekdays ?? []).map((day) => (day === 0 ? 7 : day)))
      if (days.size === 0) throw new Error('weekly schedule needs at least one weekday')
      return { dayMatches: (parts) => days.has(parts.weekday), minutesOfDay: [hour * 60 + minute] }
    }
    case 'cron': {
      const fields = parseCron(spec.cron ?? '')
      const slots: number[] = []
      for (const hour of [...fields.hours].sort((a, b) => a - b)) {
        for (const minute of [...fields.minutes].sort((a, b) => a - b)) slots.push(hour * 60 + minute)
      }
      slots.sort((a, b) => a - b)
      return { dayMatches: (parts) => cronDayMatches(fields, parts), minutesOfDay: slots }
    }
    default:
      return null
  }
}

function shiftDay(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const moved = new Date(Date.UTC(year, month - 1, day))
  moved.setUTCDate(moved.getUTCDate() + delta)
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() }
}

/**
 * Walk wall-clock days from `fromMs` and answer the first matching instant in
 * `direction` (`1` = strictly after, `-1` = at or before).
 */
function searchWall(
  fromMs: number,
  timeZone: string,
  pattern: SchedulePattern,
  direction: 1 | -1,
): number | null {
  const start = wallParts(fromMs, timeZone)
  const slots = direction === 1 ? pattern.minutesOfDay : [...pattern.minutesOfDay].reverse()
  for (let offset = 0; offset <= DAY_SCAN_LIMIT; offset += 1) {
    const day = shiftDay(start.year, start.month, start.day, direction * offset)
    const weekday = isoWeekday(day.year, day.month, day.day)
    if (!pattern.dayMatches({ ...day, weekday })) continue
    for (const slot of slots) {
      const instant = wallToInstant(day.year, day.month, day.day, Math.floor(slot / 60), slot % 60, timeZone)
      // A spring-forward gap has no such wall time; cron skips it the same way.
      if (instant === null) continue
      if (direction === 1 ? instant > fromMs : instant <= fromMs) return instant
    }
  }
  return null
}

function isoWeekday(year: number, month: number, day: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export interface NextRunInput {
  spec: ScheduleSpec
  timeZone: string
  /** Instant the search starts after. */
  fromMs: number
  /** Interval anchor; defaults to `fromMs`. */
  anchorMs?: number | null
}

/** Compute the first occurrence strictly after `fromMs`, or `null` when none. */
export function nextOccurrence({ spec, timeZone, fromMs, anchorMs }: NextRunInput): number | null {
  assertTimeZone(timeZone)
  switch (spec.kind) {
    case 'once': {
      const instant = spec.at === null || spec.at === undefined ? Number.NaN : Date.parse(spec.at)
      if (!Number.isFinite(instant)) throw new Error('once schedule needs a valid date and time')
      return instant > fromMs ? instant : null
    }
    case 'interval': {
      const every = Math.floor(Number(spec.everyMinutes ?? 0))
      if (!Number.isFinite(every) || every < 1) throw new Error('interval schedule needs at least one minute')
      const anchor = anchorMs ?? fromMs
      const stepMs = every * MINUTE
      if (anchor > fromMs) return anchor
      const elapsed = fromMs - anchor
      return anchor + (Math.floor(elapsed / stepMs) + 1) * stepMs
    }
    default: {
      const pattern = patternFor(spec)
      if (pattern === null) return null
      return searchWall(fromMs, timeZone, pattern, 1)
    }
  }
}

export interface PreviousRunInput {
  spec: ScheduleSpec
  timeZone: string
  /** Instant the search starts at (inclusive). */
  atMs: number
  /** Interval anchor; defaults to `atMs`. */
  anchorMs?: number | null
}

/**
 * Last occurrence at or before `atMs`, or `null` when there is none.
 *
 * Used by catch-up: after the Host was closed for days, "run the newest missed
 * occurrence once" must not depend on how far back the gap reaches — the previous
 * implementation stepped forward with a fixed iteration cap and silently reported
 * the 512th occurrence as the newest one.
 */
export function previousOccurrence({ spec, timeZone, atMs, anchorMs }: PreviousRunInput): number | null {
  assertTimeZone(timeZone)
  switch (spec.kind) {
    case 'once': {
      const instant = spec.at === null || spec.at === undefined ? Number.NaN : Date.parse(spec.at)
      if (!Number.isFinite(instant)) throw new Error('once schedule needs a valid date and time')
      return instant <= atMs ? instant : null
    }
    case 'interval': {
      const every = Math.floor(Number(spec.everyMinutes ?? 0))
      if (!Number.isFinite(every) || every < 1) throw new Error('interval schedule needs at least one minute')
      const anchor = anchorMs ?? atMs
      const stepMs = every * MINUTE
      if (anchor > atMs) return null
      const steps = Math.floor((atMs - anchor) / stepMs)
      return anchor + steps * stepMs
    }
    default: {
      const pattern = patternFor(spec)
      if (pattern === null) return null
      return searchWall(atMs, timeZone, pattern, -1)
    }
  }
}

/** True when an instant falls inside the task validity window. */
export function withinWindow(
  instantMs: number,
  startAt: string | null,
  endAt: string | null,
): boolean {
  if (startAt !== null && startAt !== undefined) {
    const start = Date.parse(startAt)
    if (Number.isFinite(start) && instantMs < start) return false
  }
  if (endAt !== null && endAt !== undefined) {
    const end = Date.parse(endAt)
    if (Number.isFinite(end) && instantMs > end) return false
  }
  return true
}

const ISO_WEEKDAY_LABEL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** Human summary of a schedule in a fixed time zone, for cards and logs. */
export function describeSchedule(spec: ScheduleSpec, timeZone: string): string {
  const suffix = timeZone === 'UTC' ? 'UTC' : timeZone
  switch (spec.kind) {
    case 'once': {
      const instant = spec.at === null || spec.at === undefined ? Number.NaN : Date.parse(spec.at)
      if (!Number.isFinite(instant)) return '单次执行（时间未设置）'
      const parts = wallParts(instant, timeZone)
      return `单次 ${formatDate(parts)} ${pad(parts.hour)}:${pad(parts.minute)}（${suffix}）`
    }
    case 'interval': {
      const every = Math.floor(Number(spec.everyMinutes ?? 0))
      return `每 ${formatEvery(every)}执行一次`
    }
    case 'daily': {
      const clock = spec.time ?? '00:00'
      return `每天 ${clock}（${suffix}）`
    }
    case 'weekly': {
      const days = (spec.weekdays ?? []).slice().sort((a, b) => a - b).map((day) => ISO_WEEKDAY_LABEL[(day === 0 ? 7 : day) - 1]).join('、')
      return `每${days === '' ? '周' : days} ${spec.time ?? '00:00'}（${suffix}）`
    }
    case 'cron':
      return `Cron ${spec.cron ?? ''}（${suffix}）`
    default:
      return '未设置'
  }
}

function formatEvery(minutes: number): string {
  if (minutes % (60 * 24) === 0) return `${minutes / (60 * 24)} 天`
  if (minutes % 60 === 0) return `${minutes / 60} 小时`
  return `${minutes} 分钟`
}

function formatDate(parts: WallParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Format an instant as `YYYY-MM-DD HH:mm` inside a zone (card display). */
export function formatInstant(instantMs: number | null, timeZone: string): string {
  if (instantMs === null) return '—'
  const parts = wallParts(instantMs, timeZone)
  return `${formatDate(parts)} ${pad(parts.hour)}:${pad(parts.minute)}`
}

/** IANA zone of this Host process, used as the create-form default. */
export function hostTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
