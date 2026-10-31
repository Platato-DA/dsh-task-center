/**
 * Shared wire contract between the Host task engine and the browser manager UI.
 * Nothing here imports a DSH package: both halves stay dependency-free so the
 * Host bundle keeps working across DSH patch versions.
 */
import type {
  ReminderDelivery,
  ReminderHistory,
  ReminderRow,
  ReminderTimingChange,
} from '../host/reminders.ts'

export type { ReminderDelivery, ReminderHistory, ReminderRow, ReminderTimingChange }

/** Real execution state of one run — delivery is never reported as success. */
export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting-approval'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timeout'

/** Why a run exists, kept separate from its status. */
export type RunTrigger = 'schedule' | 'catchup' | 'manual' | 'retry'

/** Independent: a fresh Session per run. Persistent: one dedicated Session reused. */
export type SessionMode = 'independent' | 'persistent'

/** What to do when a scheduled occurrence was missed while DSH was not running. */
export type MissedPolicy = 'catchup' | 'skip'

/** Timing shapes the form offers; `cron` covers everything the presets do not. */
export type ScheduleKind = 'once' | 'interval' | 'daily' | 'weekly' | 'cron'

export interface ScheduleSpec {
  kind: ScheduleKind
  /** ISO instant for `once`. */
  at?: string | null
  /** Fixed interval length in minutes for `interval`. */
  everyMinutes?: number | null
  /** Local `HH:mm` wall-clock time inside the task time zone for daily/weekly. */
  time?: string | null
  /** ISO weekdays 1=Monday .. 7=Sunday for `weekly`. */
  weekdays?: number[] | null
  /** Five-field cron in the task time zone. */
  cron?: string | null
}

export interface ModelChoice {
  provider: string
  model: string
}

/** One thinking level a provider publishes for a model. */
export interface ReasoningEffortOption {
  id: string
  name: string
  description?: string
}

/** What the provider really advertises: never invent levels the model lacks. */
export interface ReasoningOffer {
  efforts: ReasoningEffortOption[]
  defaultEffort?: string
}

/** A Host-registered workspace the task may run inside. */
export interface WorkspaceEntry {
  id: string
  title: string
  path: string
}

/** One Host permission preset (the native three-mode table). */
export interface PermissionEntry {
  value: string
  name: string
  description?: string
}

/** How a task's working folder was chosen. */
export type WorkspaceSource = 'workspace' | 'custom' | 'task-dir'

/** Where a task's model pin came from. */
export type ModelSource = 'default' | 'explicit' | 'legacy'

/** Whether the permission knobs still match a Host preset. */
export type PermissionSource = 'preset' | 'legacy'

export interface ArtifactRef {
  /** Absolute Host path of a file the run produced or refreshed. */
  path: string
  size: number
  /** ISO mtime. */
  mtime: string
}

export interface RunLogEntry {
  at: string
  level: 'info' | 'warn' | 'error'
  text: string
}

export interface Task {
  id: string
  name: string
  prompt: string
  /** Absolute Host paths of reference files attached at creation time. */
  attachments: string[]
  /** Pinned model. New tasks freeze the Host default at creation time. */
  model: ModelChoice | null
  /** `default` = frozen from the Host default at creation, `explicit` = chosen, `legacy` = pre-migration task. */
  modelSource: ModelSource
  /**
   * Thinking level forwarded with the model choice; `null` keeps the provider
   * default. Only offered when the selected model publishes its levels, so the
   * control is never a switch that does nothing.
   */
  reasoningEffort: string | null
  /**
   * Host-registered workspace the run executes in. When set, the Host resolves
   * the directory from the registry so a rename or move follows automatically.
   */
  workspaceId: string | null
  /** Absolute path used when `workspaceId` is null (custom path or the per-task folder). */
  workspace: string | null
  /** Which of the three folder choices this task uses. */
  workspaceSource: WorkspaceSource
  sessionMode: SessionMode
  /** Dedicated Session id, only for `persistent` mode. */
  sessionId: string | null
  /**
   * Model pin the current persistent Session was created with. A Session keeps
   * the model of its last request, so a changed pin needs a new Session to take
   * effect — this is what makes "switch back to follow the Host default" real.
   */
  sessionModelKey: string | null
  /**
   * Host permission preset applied to this task's Session (the native three
   * modes). `null` means the legacy knob pair below still drives the run.
   */
  permissionPreset: string | null
  /** `preset` when the knobs match a Host preset, `legacy` when they do not. */
  permissionSource: PermissionSource
  /**
   * Legacy knob pair from before preset support. Kept verbatim so an old task
   * never silently changes behaviour; it only drives the run while
   * `permissionPreset` is null.
   */
  permission: {
    /** `ask` waits for a human and therefore normally ends in the run timeout. */
    approval: 'ask' | 'never'
    sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  }
  schedule: ScheduleSpec
  /** IANA zone the schedule is authored and evaluated in. */
  timeZone: string
  /** Validity window start (ISO); `null` means "from now on". */
  startAt: string | null
  /** Validity window end (ISO); `null` means "no end". */
  endAt: string | null
  missedPolicy: MissedPolicy
  enabled: boolean
  /** Failure retries per run (missed-run catch-up is a separate concept). */
  maxRetries: number
  /** Hard run timeout; the run is cancelled and recorded as `timeout`. */
  timeoutMinutes: number
  createdAt: string
  updatedAt: string
  /** Cached next occurrence (ISO) so the tick loop stays cheap. */
  nextRunAt: string | null
  lastRunAt: string | null
  lastRunStatus: RunStatus | null
  /** Last failure surfaced as the card's exception hint. */
  lastError: { message: string; at: string } | null
  /** Template this task was created from, if any. */
  templateId: string | null
  /**
   * Migration notes the editor must show until the user confirms them, e.g. a
   * legacy task whose permission pair matches no Host preset. Never silent.
   */
  legacyIssues: string[]
}

export interface Run {
  id: string
  taskId: string
  taskName: string
  status: RunStatus
  trigger: RunTrigger
  /** Planned occurrence this run serves (null for manual runs). */
  scheduledFor: string | null
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  durationMs: number | null
  sessionId: string | null
  sessionMode: SessionMode
  /**
   * Working folder this run executed in, recorded at enqueue. Artifact previews
   * authorize against this instead of the task's *current* folder, so history
   * keeps working after the task is edited or deleted.
   */
  workspace: string
  /** Exact model configuration this run actually asked for. */
  modelSnapshot: { provider: string; model: string; reasoningEffort: string | null } | null
  /** Permission preset this run applied; `null` when the legacy pair was used. */
  permissionPreset: string | null
  /** 1 for the first attempt; increments on retry. */
  attempt: number
  /** When a bounded failure retry is due; persisted so a restart keeps it. */
  retryAt: string | null
  error: { message: string; code: string | null } | null
  /** Final assistant text of the turn (bounded). */
  output: string | null
  artifacts: ArtifactRef[]
  tools: Array<{ name: string; title: string }>
  log: RunLogEntry[]
}

export interface ModelCatalogEntry {
  provider: string
  model: string
  label: string
  inputModalities?: string[]
  /** Thinking levels the provider publishes for this model, if any. */
  reasoning: ReasoningOffer | null
}

export interface TaskTemplate {
  id: string
  name: string
  description: string
  task: Partial<Task> & { name: string; prompt: string }
}

/** One consistent snapshot the manager UI renders from. */
export interface StateSnapshot {
  now: string
  timeZone: string
  tasks: Task[]
  runs: Run[]
  models: ModelCatalogEntry[]
  templates: TaskTemplate[]
  /** True while DSH is still binding the web listener. */
  ready: boolean
  limits: { maxConcurrentRuns: number; runHistory: number }
  /** Native Session reminders, merged for display only (never copied). */
  reminders: ReminderRow[]
  /** Non-null when the Host reminder service failed; tasks stay usable. */
  reminderError: string | null
  /** Host-registered workspaces the editor offers. */
  workspaces: WorkspaceEntry[]
  /** Directory the Host would default to, shown as the first suggestion. */
  workspaceDefault: string | null
  /** Native permission presets (read-only / workspace-write / danger-full-access). */
  permissions: PermissionEntry[]
  /** Preset new sessions would get, for the editor's default selection. */
  permissionDefault: string | null
  /** Non-null when a catalog read failed; the rest of the page still works. */
  workspaceError: string | null
  permissionError: string | null
}

export type ApiRequest =
  | { op: 'state' }
  | { op: 'task.save'; task: Task }
  | { op: 'task.delete'; id: string }
  | { op: 'task.enabled'; id: string; enabled: boolean }
  | { op: 'task.bulk'; ids: string[]; action: 'enable' | 'pause' | 'delete' }
  | { op: 'task.duplicate'; id: string }
  | { op: 'run.now'; id: string }
  | { op: 'run.cancel'; runId: string }
  | { op: 'run.retry'; runId: string }
  | { op: 'runs.list'; filter?: RunFilter }
  | { op: 'run.detail'; runId: string }
  | { op: 'runs.clear' }
  | { op: 'models' }
  | { op: 'timezones' }
  | { op: 'tick'; now?: string }
  | { op: 'open.run'; runId: string }
  | { op: 'debug' }
  | { op: 'graph' }
  | { op: 'tools'; sessionId?: string }
  | { op: 'verify.chat'; name?: string; prompt?: string }
  | { op: 'reminder.history'; id: string; sessionId: string; limit?: number }
  | { op: 'reminder.update'; id: string; sessionId: string; title?: string; prompt?: string; change?: ReminderTimingChange }
  | { op: 'reminder.delete'; id: string; sessionId: string }
  | { op: 'session.permission'; sessionId: string }
  | { op: 'workspaces' }
  | { op: 'permissions' }
  | { op: 'workspace.create'; path: string }

export interface RunFilter {
  status?: RunStatus | 'all'
  trigger?: RunTrigger | 'all'
  taskId?: string | 'all'
  limit?: number
}

export interface ApiOk<T> {
  ok: true
  value: T
}

export interface ApiErr {
  ok: false
  code: string
  message: string
}

export type ApiResult<T> = ApiOk<T> | ApiErr
