/**
 * Host half of the task centre.
 *
 * Owns the durable task book, the execution engine and the browser API, and
 * releases all three when the fiber unloads (reload / disable / uninstall), so
 * no timer or Session listener outlives the plugin.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

import { registerApi } from './host/api.ts'
import { TaskEngine } from './host/engine.ts'
import { TaskStore } from './host/store.ts'
import { registerTools } from './host/tools.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyCtx = any

export const name = 'dsh-task-center'

/**
 * Host services this plugin needs. `tools` is what makes a task creatable from a
 * plain conversation: the model-visible tools below write into the same store the
 * panel reads. `connection` is optional (read through `ctx.get`) and only used for
 * the Host's request-trust check.
 */
export const inject = ['webServer', 'sessionController', 'tools', 'approval']

export interface Config {
  /** Runs executing at the same time across all tasks. */
  maxConcurrentRuns?: number
  /** How many finished run records to keep. */
  runHistory?: number
  /** Fallback run timeout when a task does not set one. */
  defaultTimeoutMinutes?: number
  /** A tick later than this is treated as a missed occurrence, not a normal one. */
  graceSeconds?: number
  /** Enable diagnostic operations, including probes that can run a real model. */
  diagnostics?: boolean
}

const DEFAULTS: Required<Config> = {
  maxConcurrentRuns: 2,
  runHistory: 300,
  defaultTimeoutMinutes: 20,
  graceSeconds: 90,
  diagnostics: false,
}

export function apply(ctx: AnyCtx, config: Config = {}): void {
  const options = { ...DEFAULTS, ...config }
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const dataRoot = join(home, 'storages', 'dsh-task-center')
  const stateFile = join(dataRoot, 'state.json')
  const log = makeLog(ctx)

  const store = new TaskStore(stateFile)
  const restored = store.load()
  if (restored.recovered) log('warn', `任务存储需要修复：${restored.message ?? ''}`)
  if (restored.dropped > 0) {
    log('warn', `任务存储里有 ${restored.dropped} 条记录无法识别，已跳过；其余记录正常加载`)
  }

  const engine = new TaskEngine(ctx, store, {
    maxConcurrentRuns: options.maxConcurrentRuns,
    runHistory: options.runHistory,
    defaultTimeoutMinutes: options.defaultTimeoutMinutes,
    graceSeconds: options.graceSeconds,
    dataRoot,
    log,
  })

  ctx.effect(() => {
    // A reload can leave an older fiber of this same plugin alive in the process
    // (its HTTP route and timers would duplicate ours). Tear it down first: the
    // registry lives on globalThis so it survives module reloads.
    const previous = installed() as { dispose?: () => void } | undefined
    if (typeof previous?.dispose === 'function') {
      try {
        previous.dispose()
        log('warn', '检测到上一代任务中心仍在运行，已先停掉它再挂载新的')
      } catch {
        /* the old generation is already gone */
      }
    }

    const disposeApi = registerApi(ctx, { engine, store, dataRoot, log, diagnostics: options.diagnostics })
    const disposeTools = registerTools(ctx, { engine, ctx })
    void engine.start().catch((error: Error) => log('error', `任务中心启动失败：${error.message}`))
    log('info', '对话工具已注册：task_create / task_list / task_get / task_update / task_enabled / task_run / task_delete / run_list / run_cancel')

    const dispose = (): void => {
      try {
        disposeTools()
      } catch {
        /* already unregistered */
      }
      try {
        disposeApi()
      } catch {
        /* the route table may be gone on shutdown */
      }
      engine.dispose()
    }
    const record = { dispose }
    install(record)
    return () => {
      if (installed() === record) uninstall()
      dispose()
      log('info', '任务中心已卸载：工具、计时器、会话监听与运行资源已释放')
    }
  }, 'dsh-task-center: engine + api + tools')
}

/* ------------------------------------------------------- single generation */

const INSTALLED = Symbol.for('dsh.task-center.installed')

function installed(): unknown {
  return (globalThis as Record<symbol, unknown>)[INSTALLED]
}

function install(record: { dispose: () => void }): void {
  ;(globalThis as Record<symbol, unknown>)[INSTALLED] = record
}

function uninstall(): void {
  delete (globalThis as Record<symbol, unknown>)[INSTALLED]
}

/** Prefer the Host's logger; fall back to the console for unit-style runs. */
function makeLog(ctx: AnyCtx): (level: 'info' | 'warn' | 'error', text: string) => void {
  return (level, text) => {
    const line = `[task-center] ${text}`
    try {
      const logger = typeof ctx.logger === 'function' ? ctx.logger('task-center') : ctx.logger
      const sink = logger?.[level] ?? logger?.log
      if (typeof sink === 'function') {
        sink.call(logger, line)
        return
      }
    } catch {
      /* fall through to the console */
    }
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }
}
