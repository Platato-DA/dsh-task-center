/**
 * Durable state for the task centre: one JSON file next to the other Host
 * storage files, written atomically (temp file + rename) so a crash mid-write
 * cannot truncate the task book. The file is intentionally independent of any
 * DSH storage domain: it must survive DSH upgrades and be readable by hand.
 */

import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Run, Task } from '../shared/types.ts'

const VERSION = 1

export interface PersistedState {
  version: number
  tasks: Task[]
  runs: Run[]
}

export function emptyState(): PersistedState {
  return { version: VERSION, tasks: [], runs: [] }
}

/**
 * Shape guards for the two record kinds.
 *
 * The file is plain JSON a human may edit, so "parses" is not the same as
 * "usable": one `null` in `tasks` used to make the whole plugin fail to start.
 * Only the fields the engine and the UI always dereference are required here;
 * everything else is repaired by migration.
 */
function isTaskRecord(value: unknown): value is Task {
  const task = value as Partial<Task> | null
  return (
    typeof task === 'object' &&
    task !== null &&
    typeof task.id === 'string' &&
    task.id !== '' &&
    typeof task.name === 'string' &&
    typeof task.prompt === 'string' &&
    typeof task.schedule === 'object' &&
    task.schedule !== null &&
    typeof (task.schedule as { kind?: unknown }).kind === 'string'
  )
}

function isRunRecord(value: unknown): value is Run {
  const run = value as Partial<Run> | null
  return (
    typeof run === 'object' &&
    run !== null &&
    typeof run.id === 'string' &&
    run.id !== '' &&
    typeof run.taskId === 'string' &&
    typeof run.status === 'string' &&
    typeof run.trigger === 'string' &&
    Array.isArray(run.log) &&
    Array.isArray(run.artifacts)
  )
}

/**
 * Read + write the plugin's own storage file.
 *
 * Every mutation goes through {@link update} so the in-memory view and the file
 * never disagree: the file is the source of truth after a restart, memory after
 * a mutation.
 */
export class TaskStore {
  readonly file: string
  private state: PersistedState = emptyState()
  private writes = 0
  private lastError: string | null = null

  constructor(file: string) {
    this.file = file
  }

  get tasks(): Task[] {
    return this.state.tasks
  }

  get runs(): Run[] {
    return this.state.runs
  }

  get stats(): { writes: number; lastError: string | null } {
    return { writes: this.writes, lastError: this.lastError }
  }

  /** Load the file, tolerating absence and (loudly) a corrupt payload. */
  load(): { recovered: boolean; message: string | null; dropped: number } {
    try {
      const text = readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(text) as Partial<PersistedState>
      const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
      const rawRuns = Array.isArray(parsed.runs) ? parsed.runs : []
      const tasks = rawTasks.filter(isTaskRecord)
      const runs = rawRuns.filter(isRunRecord)
      const dropped = rawTasks.length - tasks.length + (rawRuns.length - runs.length)
      this.state = { version: VERSION, tasks, runs }
      if (dropped > 0) {
        // Keep the good records and report the rest: guessing at half-written
        // entries is how a corrupt file turns into a silently wrong schedule.
        const backup = `${this.file}.invalid-${Date.now()}.bak`
        copyFileSync(this.file, backup)
        this.lastError = `跳过 ${dropped} 条无法识别的记录 (备份: ${backup})`
        return { recovered: true, message: this.lastError, dropped }
      }
      return { recovered: false, message: null, dropped: 0 }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        this.state = emptyState()
        return { recovered: false, message: null, dropped: 0 }
      }
      // Keep the unreadable file for inspection instead of silently overwriting it.
      const backup = `${this.file}.corrupt-${Date.now()}`
      try {
        renameSync(this.file, backup)
      } catch {
        /* the original is unreadable anyway */
      }
      this.state = emptyState()
      this.lastError = `${(error as Error).message} (备份: ${backup})`
      return { recovered: true, message: this.lastError, dropped: 0 }
    }
  }

  /** Replace the whole state and persist it. */
  replace(tasks: Task[], runs: Run[]): void {
    this.state = { version: VERSION, tasks, runs }
    this.flush()
  }

  /** Persist the current in-memory state. */
  flush(): void {
    const dir = dirname(this.file)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const tmp = join(dir, `.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`)
    writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, this.file)
    this.writes += 1
  }

  /** Remove the state file (used by the tests only). */
  destroy(): void {
    this.state = emptyState()
    try {
      rmSync(this.file, { force: true })
    } catch {
      /* nothing to remove */
    }
  }
}
