/**
 * Manager UI for the unifyed『自动化任务』page: tasks that really execute, plus
 * the Host's own Session reminders, in one list.
 *
 * Rendered through the Host's own Slots: it takes over the native panel key
 * (`schedules`), so the shipped sidebar entry keeps its id, position and label
 * and there is still exactly one visible entry. Only React is imported from the
 * shared registry.
 */

import * as React from 'react'

import type {
  ApiResult,
  ReminderDelivery,
  ReminderHistory,
  ReminderRow,
  ReminderTimingChange,
  Run,
  RunStatus,
  RunTrigger,
  StateSnapshot,
  Task,
  TaskTemplate,
} from '../shared/types.ts'
import { describeSchedule, formatInstant } from '../host/time.ts'

const API = '/dsh-task-center/api'
/** The native panel key this page takes over, so the sidebar entry stays. */
const NATIVE_PANEL_ID = 'schedules'
/** The plugin's own former key, kept only so an old selection still lands here. */
const LEGACY_PANEL_ID = 'task-center'
const POLL_MS = 2500

/* --------------------------------------------------------------- transport */

async function call<T>(request: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const response = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'same-origin',
    })
    return (await response.json()) as ApiResult<T>
  } catch (error) {
    return { ok: false, code: 'network', message: `无法连接任务中心：${(error as Error).message}` }
  }
}

function useSnapshot(): { snapshot: StateSnapshot | null; error: string | null; reload: () => void } {
  const [snapshot, setSnapshot] = React.useState<StateSnapshot | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    const result = await call<StateSnapshot>({ op: 'state' })
    if (result.ok) {
      setSnapshot(result.value)
      setError(null)
    } else {
      setError(result.message)
    }
  }, [])
  React.useEffect(() => {
    let alive = true
    const tick = (): void => {
      void call<StateSnapshot>({ op: 'state' }).then((result) => {
        if (!alive) return
        if (result.ok) {
          setSnapshot(result.value)
          setError(null)
        } else {
          setError(result.message)
        }
      })
    }
    tick()
    const handle = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(handle)
    }
  }, [])
  return { snapshot, error, reload: () => void load() }
}

/* ------------------------------------------------------------------ tokens */

const C = {
  base: 'var(--dsw-alias-bg-base)',
  layer1: 'var(--dsw-alias-bg-layer-1)',
  layer2: 'var(--dsw-alias-bg-layer-2)',
  layer3: 'var(--dsw-alias-bg-layer-3)',
  border: 'var(--dsw-alias-border-l2)',
  borderSoft: 'var(--dsw-alias-border-l1)',
  label: 'var(--dsw-alias-label-primary)',
  label2: 'var(--dsw-alias-label-secondary)',
  label3: 'var(--dsw-alias-label-tertiary)',
  caption: 'var(--dsw-alias-label-caption)',
  error: 'var(--dsw-alias-label-error)',
  brand: 'var(--dsw-alias-brand-primary)',
  primary: 'var(--dsw-alias-button-primary-fill)',
  primaryHover: 'var(--dsw-alias-button-primary-hover)',
  onPrimary: 'var(--dsw-alias-label-primary-foreground)',
  hover: 'var(--dsw-alias-interactive-bg-hover)',
  hoverDanger: 'var(--dsw-alias-interactive-bg-hover-danger)',
  success: 'var(--dsw-alias-state-success-primary)',
  successSoft: 'var(--dsw-alias-state-success-tertiary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  warnSoft: 'var(--dsw-alias-state-warn-tertiary)',
  danger: 'var(--dsw-alias-state-error-primary)',
}

const card: React.CSSProperties = {
  background: C.layer1,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 10,
  padding: '14px 16px',
}

const inputStyle: React.CSSProperties = {
  font: 'inherit',
  fontSize: 13,
  color: C.label,
  background: C.layer2,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '6px 10px',
  outline: 'none',
  minWidth: 0,
}

function buttonStyle(kind: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    font: 'inherit',
    fontSize: 12,
    borderRadius: 8,
    padding: '5px 11px',
    cursor: 'pointer',
    border: `1px solid ${kind === 'primary' ? 'transparent' : C.border}`,
    transition: 'background var(--ds-transition-duration, 120ms) var(--ds-ease-in-out, ease)',
    whiteSpace: 'nowrap',
  }
  if (kind === 'primary') {
    return { ...base, background: C.primary, color: C.onPrimary, borderColor: 'transparent' }
  }
  if (kind === 'danger') {
    return { ...base, background: 'transparent', color: C.error, borderColor: C.border }
  }
  return { ...base, background: C.layer2, color: C.label }
}

/* ------------------------------------------------------------------ status */

const STATUS_TEXT: Record<RunStatus, string> = {
  queued: '排队中',
  running: '运行中',
  'waiting-approval': '等待审批',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
  timeout: '超时',
}

function statusColor(status: RunStatus): { fg: string; bg: string } {
  switch (status) {
    case 'succeeded':
      return { fg: C.success, bg: C.successSoft }
    case 'failed':
    case 'timeout':
      return { fg: C.error, bg: C.warnSoft }
    case 'running':
      return { fg: C.brand, bg: C.layer2 }
    case 'waiting-approval':
      return { fg: C.warn, bg: C.warnSoft }
    default:
      return { fg: C.label2, bg: C.layer2 }
  }
}

const TRIGGER_TEXT: Record<RunTrigger, string> = {
  schedule: '定时',
  catchup: '补跑',
  manual: '手动',
  retry: '重试',
}

function StatusBadge({ status }: { status: RunStatus }): React.ReactElement {
  const color = statusColor(status)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        lineHeight: '18px',
        padding: '0 8px',
        borderRadius: 999,
        color: color.fg,
        background: color.bg,
        border: `1px solid ${color.fg}22`,
      }}
    >
      {STATUS_TEXT[status] ?? status}
    </span>
  )
}

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${ms} 毫秒`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} 分` : `${minutes} 分 ${rest} 秒`
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function shortTime(iso: string | null, timeZone: string): string {
  if (iso === null) return '—'
  const at = Date.parse(iso)
  return Number.isFinite(at) ? formatInstant(at, timeZone) : '—'
}

/* -------------------------------------------------------------------- page */

export function TaskCenterPage(props: Record<string, unknown>): React.ReactElement {
  const { snapshot, error, reload } = useSnapshot()
  const [tab, setTab] = React.useState<'tasks' | 'runs'>('tasks')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'enabled' | 'paused'>('all')
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<string[]>([])
  const [editing, setEditing] = React.useState<Task | null>(null)
  const [templatePicker, setTemplatePicker] = React.useState(false)
  const [detailRun, setDetailRun] = React.useState<Run | null>(null)
  const [toast, setToast] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [confirmBulk, setConfirmBulk] = React.useState(false)
  const [runTaskId, setRunTaskId] = React.useState<string>('all')
  const [sourceFilter, setSourceFilter] = React.useState<'all' | 'auto' | 'reminder'>('all')
  const [pickedReminders, setPickedReminders] = React.useState<string[]>([])
  const [reminderDetail, setReminderDetail] = React.useState<ReminderRow | null>(null)

  const openSession = React.useCallback((sessionId: string | null) => {
    if (sessionId === null) return
    const workspace = (props as { uiWorkspace?: { openSession?: (id: string) => void } }).uiWorkspace
    workspace?.openSession?.(sessionId)
  }, [props])

  React.useEffect(() => {
    if (toast === null) return
    const handle = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(handle)
  }, [toast])

  const tasks = snapshot?.tasks ?? []
  const runs = snapshot?.runs ?? []
  const reminders = snapshot?.reminders ?? []
  const reminderError = snapshot?.reminderError ?? null
  const zone = snapshot?.timeZone ?? 'UTC'

  const counts = {
    all: tasks.length + reminders.length,
    enabled: tasks.filter((task) => task.enabled).length + reminders.filter((row) => row.status === 'active').length,
    paused: tasks.filter((task) => !task.enabled).length + reminders.filter((row) => row.status === 'inactive').length,
    auto: tasks.length,
    reminder: reminders.length,
  }

  const matches = (name: string, prompt: string): boolean => {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) return true
    return `${name}\n${prompt}`.toLowerCase().includes(needle)
  }

  type UnifiedRow =
    | { kind: 'auto'; key: string; task: Task; nextAt: string | null }
    | { kind: 'reminder'; key: string; reminder: ReminderRow; nextAt: string | null }

  const rows: UnifiedRow[] = []
  if (sourceFilter !== 'reminder') {
    for (const task of tasks) {
      if (statusFilter === 'enabled' && !task.enabled) continue
      if (statusFilter === 'paused' && task.enabled) continue
      if (!matches(task.name, task.prompt)) continue
      rows.push({ kind: 'auto', key: `auto:${task.id}`, task, nextAt: task.enabled ? task.nextRunAt : null })
    }
  }
  if (sourceFilter !== 'auto') {
    for (const reminder of reminders) {
      const active = reminder.status === 'active'
      if (statusFilter === 'enabled' && !active) continue
      if (statusFilter === 'paused' && active) continue
      if (!matches(reminder.title, reminder.prompt)) continue
      rows.push({
        kind: 'reminder',
        key: reminder.key,
        reminder,
        nextAt: active && reminder.scheduledAt !== '' ? reminder.scheduledAt : null,
      })
    }
  }
  rows.sort((left, right) => {
    if (left.nextAt === null && right.nextAt === null) return left.key.localeCompare(right.key)
    if (left.nextAt === null) return 1
    if (right.nextAt === null) return -1
    return left.nextAt.localeCompare(right.nextAt)
  })
  const visibleTasks = rows

  const act = async (request: Record<string, unknown>, successText?: string): Promise<void> => {
    setBusy(true)
    const result = await call<unknown>(request)
    setBusy(false)
    if (!result.ok) {
      setToast(result.message)
      return
    }
    if (successText !== undefined) setToast(successText)
  }

  const startNew = (templateId: string | null): void => {
    const template = snapshot?.templates.find((entry) => entry.id === templateId) ?? null
    setEditing(draftTask(template, zone))
    setTemplatePicker(false)
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', background: C.base, color: C.label }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 28px 80px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ font: 'inherit', fontSize: 20, fontWeight: 600, margin: 0 }}>自动化任务</h1>
            <div style={{ fontSize: 12, color: C.label2, marginTop: 4 }}>
              自动执行任务到点真正跑起来并落盘产物；对话提醒由原生 schedule 服务投递回原会话。当前时区 {zone}
              {snapshot === null ? ' · 正在连接…' : ''}
            </div>
          </div>
          <button style={buttonStyle('ghost')} onClick={() => setTemplatePicker(true)} disabled={busy}>
            从模板新建
          </button>
          <button style={buttonStyle('primary')} onClick={() => startNew('blank')} disabled={busy}>
            ＋ 新建任务
          </button>
        </header>

        {error !== null ? (
          <div style={{ ...card, marginTop: 14, borderColor: C.danger, color: C.error, fontSize: 12 }}>{error}</div>
        ) : null}

        <nav style={{ display: 'flex', gap: 18, borderBottom: `1px solid ${C.borderSoft}`, margin: '16px 0 18px' }}>
          {(['tasks', 'runs'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                font: 'inherit',
                fontSize: 13,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === key ? C.brand : 'transparent'}`,
                color: tab === key ? C.label : C.label2,
                padding: '6px 2px 8px',
                cursor: 'pointer',
                fontWeight: tab === key ? 600 : 400,
              }}
            >
              {key === 'tasks' ? '任务' : '运行记录'}
              <span style={{ marginLeft: 6, fontSize: 11, color: C.caption }}>
                {key === 'tasks' ? counts.all : runs.length}
              </span>
            </button>
          ))}
        </nav>

        {tab === 'tasks' ? (
          <>
            {reminderError !== null ? (
              <div
                style={{
                  ...card,
                  borderColor: C.warn,
                  color: C.warn,
                  fontSize: 12,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ flex: 1 }}>{reminderError}（自动任务仍可正常使用）</span>
                <button style={buttonStyle()} onClick={() => reload()}>
                  重试
                </button>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: C.caption }}>来源</span>
              {(
                [
                  ['all', '全部', counts.all],
                  ['auto', '自动执行', counts.auto],
                  ['reminder', '对话提醒', counts.reminder],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setSourceFilter(key)}
                  style={{
                    ...buttonStyle(sourceFilter === key ? 'primary' : 'ghost'),
                    borderRadius: 999,
                  }}
                >
                  {label} {count}
                </button>
              ))}
              <div style={{ flex: 1 }} />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: C.caption }}>状态</span>
              {(
                [
                  ['all', '全部', counts.all],
                  ['enabled', '运行中', counts.enabled],
                  ['paused', '已暂停/已结束', counts.paused],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  style={{
                    ...buttonStyle(statusFilter === key ? 'primary' : 'ghost'),
                    borderRadius: 999,
                  }}
                >
                  {label} {count}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称或提示词（两类都搜）"
                style={{ ...inputStyle, width: 220 }}
              />
            </div>

            {selected.length > 0 ? (
              <div
                style={{
                  ...card,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: C.layer2,
                }}
              >
                <span style={{ fontSize: 12, color: C.label2 }}>
                  已选 {selected.length} 项{busy ? ' · 处理中…' : ''}
                </span>
                <div style={{ flex: 1 }} />
                <button
                  style={buttonStyle()}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await act({ op: 'task.bulk', ids: selected, action: 'enable' }, `已批量启用 ${selected.length} 个任务`)
                    setBusy(false)
                    setSelected([])
                  }}
                >
                  批量启用
                </button>
                <button
                  style={buttonStyle()}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await act({ op: 'task.bulk', ids: selected, action: 'pause' }, `已批量暂停 ${selected.length} 个任务`)
                    setBusy(false)
                    setSelected([])
                  }}
                >
                  批量暂停
                </button>
                {confirmBulk ? (
                  <>
                    <span style={{ fontSize: 12, color: C.error }}>删除 {selected.length} 个任务？历史记录会保留</span>
                    <button
                      style={buttonStyle('danger')}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        await act({ op: 'task.bulk', ids: selected, action: 'delete' }, `已批量删除 ${selected.length} 个任务`)
                        setBusy(false)
                        setSelected([])
                        setConfirmBulk(false)
                      }}
                    >
                      {busy ? '删除中…' : '确认批量删除'}
                    </button>
                    <button style={buttonStyle()} disabled={busy} onClick={() => setConfirmBulk(false)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button style={buttonStyle('danger')} disabled={busy} onClick={() => setConfirmBulk(true)}>
                    批量删除
                  </button>
                )}
              </div>
            ) : null}

            {visibleTasks.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '44px 20px', color: C.label2 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  {counts.all === 0
                    ? '还没有任务。可以新建自动任务，或让对话里的 Agent 帮你创建。'
                    : '没有符合筛选条件的任务。'}
                </div>
                <div style={{ fontSize: 12, color: C.caption }}>
                  自动任务会在设定时间用你指定的模型、在指定文件夹里真正执行并留下产物；对话提醒只把消息投递回原会话。
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visibleTasks.map((row) =>
                  row.kind === 'auto' ? (
                    <TaskCard
                      key={row.key}
                      task={row.task}
                      zone={zone}
                      busy={busy}
                      checked={selected.includes(row.task.id)}
                      onCheck={(checked) =>
                        setSelected((current) =>
                          checked ? [...current, row.task.id] : current.filter((id) => id !== row.task.id),
                        )
                      }
                      onToggle={() =>
                        void act({ op: 'task.enabled', id: row.task.id, enabled: !row.task.enabled })
                      }
                      onRun={() => void act({ op: 'run.now', id: row.task.id }, '已加入运行队列')}
                      onEdit={() => setEditing(row.task)}
                      onDuplicate={() => void act({ op: 'task.duplicate', id: row.task.id }, '已复制任务')}
                      onDelete={() => void act({ op: 'task.delete', id: row.task.id }, '已删除任务')}
                      onOpenRuns={() => {
                        setTab('runs')
                        setQuery('')
                        setRunTaskId(row.task.id)
                      }}
                    />
                  ) : (
                    <ReminderCard
                      key={row.key}
                      reminder={row.reminder}
                      zone={zone}
                      busy={busy}
                      checked={pickedReminders.includes(row.reminder.id)}
                      onCheck={(checked) =>
                        setPickedReminders((current) =>
                          checked
                            ? [...current, row.reminder.id]
                            : current.filter((id) => id !== row.reminder.id),
                        )
                      }
                      onOpen={() => setReminderDetail(row.reminder)}
                      onOpenSession={(sessionId) => openSession(sessionId)}
                      onDelete={async () => {
                        const result = await call<unknown>({
                          op: 'reminder.delete',
                          id: row.reminder.id,
                          sessionId: row.reminder.sessionId,
                        })
                        setToast(result.ok ? '已删除提醒' : result.message)
                        if (result.ok) {
                          setPickedReminders((current) => current.filter((id) => id !== row.reminder.id))
                          reload()
                        }
                      }}
                    />
                  ),
                )}
              </div>
            )}

            {pickedReminders.length > 0 ? (
              <div
                style={{
                  ...card,
                  marginTop: 12,
                  background: C.layer2,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 12, color: C.label2 }}>
                  已选 {pickedReminders.length} 条对话提醒 · 原生提醒不支持批量启用/暂停，删除会逐条执行并汇报结果
                </span>
                <div style={{ flex: 1 }} />
                <button
                  style={buttonStyle('danger')}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    const done: string[] = []
                    const failed: string[] = []
                    for (const id of pickedReminders) {
                      const row = reminders.find((entry) => entry.id === id)
                      if (row === undefined) {
                        failed.push(`${id}：已不在列表里`)
                        continue
                      }
                      const result = await call<unknown>({
                        op: 'reminder.delete',
                        id: row.id,
                        sessionId: row.sessionId,
                      })
                      if (result.ok) done.push(row.title)
                      else failed.push(`${row.title}：${result.message}`)
                    }
                    setBusy(false)
                    setPickedReminders([])
                    reload()
                    setToast(
                      failed.length === 0
                        ? `已删除 ${done.length} 条提醒`
                        : `删除 ${done.length} 条，失败 ${failed.length} 条：${failed.join('；')}`,
                    )
                  }}
                >
                  批量删除提醒 {pickedReminders.length}
                </button>
                <button style={buttonStyle()} disabled={busy} onClick={() => setPickedReminders([])}>
                  取消选择
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <RunsView
            runs={runs}
            tasks={tasks}
            zone={zone}
            taskId={runTaskId}
            onTaskId={setRunTaskId}
            onDetail={(run) => setDetailRun(run)}
            onRetry={(run) => void act({ op: 'run.retry', runId: run.id }, '已重新提交')}
            onCancel={(run) => void act({ op: 'run.cancel', runId: run.id }, '已请求停止')}
            onClear={() => void act({ op: 'runs.clear' }, '已清空运行记录')}
          />
        )}
      </div>

      {templatePicker ? (
        <Modal title="从模板新建" onClose={() => setTemplatePicker(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(snapshot?.templates ?? []).map((template) => (
              <button
                key={template.id}
                onClick={() => startNew(template.id)}
                style={{ ...card, textAlign: 'left', cursor: 'pointer', background: C.layer2, border: `1px solid ${C.border}` }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{template.name}</div>
                <div style={{ fontSize: 12, color: C.label2, lineHeight: 1.5 }}>{template.description}</div>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {editing !== null ? (
        <TaskForm
          task={editing}
          snapshot={snapshot}
          uiWorkspace={props.uiWorkspace as { pickDirectory?: () => Promise<unknown> } | undefined}
          onReload={reload}
          onClose={() => setEditing(null)}
          onSaved={(saved, notice) => {
            setEditing(null)
            setToast(
              notice ??
                `已保存「${saved.name}」${saved.nextRunAt === null ? '' : `，下次 ${formatInstant(Date.parse(saved.nextRunAt), saved.timeZone)}（${saved.timeZone}）`}`,
            )
          }}
        />
      ) : null}

      {detailRun !== null ? (
        <RunDetail run={detailRun} zone={zone} onClose={() => setDetailRun(null)} onOpenSession={openSession} />
      ) : null}

      {reminderDetail === null ? null : (
        <ReminderDetail
          reminder={reminderDetail}
          zone={zone}
          onClose={() => setReminderDetail(null)}
          onToast={(text) => setToast(text)}
          onChanged={() => reload()}
        />
      )}

      {toast !== null ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 28,
            transform: 'translateX(-50%)',
            background: 'var(--dsw-alias-toast-bg)',
            color: 'var(--dsw-alias-toast-label)',
            fontSize: 12,
            padding: '8px 16px',
            borderRadius: 999,
            zIndex: 60,
            boxShadow: '0 6px 24px rgba(0,0,0,.18)',
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- task card */

interface TaskCardProps {
  task: Task
  zone: string
  busy: boolean
  checked: boolean
  onCheck: (checked: boolean) => void
  onToggle: () => void
  onRun: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onOpenRuns: () => void
}

/**
 * What the card says about model, folder and permission has to be the truth the
 * scheduler will act on — a label that promises isolation the engine does not
 * deliver is worse than no label.
 */
function modelLabel(task: Task): string {
  if (task.model === null) return '模型：未固化（跟随宿主默认）'
  const effort = task.reasoningEffort === null ? '' : ` · ${task.reasoningEffort}`
  return `模型：${task.model.provider}/${task.model.model}${effort}`
}

function workspaceLabel(task: Task): string {
  if (task.workspaceId !== null) return task.workspace ?? `工作区 ${task.workspaceId}`
  if (task.workspace !== null && task.workspace.trim() !== '') return `${task.workspace}（未登记）`
  return '任务独立目录'
}

const PRESET_LABELS: Record<string, string> = {
  'read-only': '仅可查看',
  'workspace-write': '工作区内修改',
  'danger-full-access': '完全权限',
}

/** Host catalog names may be raw keys; the native UI shows localized titles. */
function presetLabel(entry: { value: string; name: string }): string {
  const mapped = PRESET_LABELS[entry.value]
  return entry.name === entry.value && mapped !== undefined ? mapped : entry.name
}

function permissionLabel(task: Task): string {
  if (task.permissionPreset !== null) return `权限：${PRESET_LABELS[task.permissionPreset] ?? task.permissionPreset}`
  return `权限：旧组合（${task.permission.sandbox} / ${task.permission.approval}）`
}

function TaskCard(props: TaskCardProps): React.ReactElement {
  const { task } = props
  const [confirming, setConfirming] = React.useState(false)
  const next = task.nextRunAt === null ? null : Date.parse(task.nextRunAt)
  const overdue = next !== null && next < Date.now()
  return (
    <div style={{ ...card, opacity: task.enabled ? 1 : 0.72 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(event) => props.onCheck(event.target.checked)}
          style={{ marginTop: 4, accentColor: C.brand }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{task.name}</span>
            <span
              style={{
                fontSize: 11,
                color: task.enabled ? C.success : C.label3,
                background: task.enabled ? C.successSoft : C.layer2,
                borderRadius: 999,
                padding: '0 8px',
                lineHeight: '18px',
              }}
            >
              {task.enabled ? '已启用' : '已暂停'}
            </span>
            {task.sessionMode === 'persistent' ? (
              <span style={{ fontSize: 11, color: C.label2, border: `1px solid ${C.border}`, borderRadius: 999, padding: '0 8px', lineHeight: '18px' }}>
                持续会话
              </span>
            ) : null}
            <span style={{ fontSize: 11, color: C.caption }}>{modelLabel(task)}</span>
            <span style={{ fontSize: 11, color: C.caption }}>{permissionLabel(task)}</span>
          </div>
          <div style={{ fontSize: 12, color: C.label2, marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>规则：{describeSchedule(task.schedule, task.timeZone)}</span>
            <span>下次：{task.enabled ? `${shortTime(task.nextRunAt, task.timeZone)}（${task.timeZone}）` : '已暂停'}</span>
            <span>文件夹：{workspaceLabel(task)}</span>
          </div>
          {task.legacyIssues.length === 0 ? null : (
            <div style={{ fontSize: 11, color: C.warn, marginTop: 4, lineHeight: 1.6 }}>
              需要确认：{task.legacyIssues.join('；')}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.caption, marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>漏跑策略：{task.missedPolicy === 'catchup' ? '补跑最近一次' : '跳过'}</span>
            <span>超时：{task.timeoutMinutes} 分钟</span>
            <span>重试：{task.maxRetries} 次</span>
            <span>有效期：{task.startAt === null && task.endAt === null ? '长期' : `${shortTime(task.startAt, task.timeZone)} → ${shortTime(task.endAt, task.timeZone)}`}</span>
          </div>
          {task.lastError !== null ? (
            <div style={{ fontSize: 12, color: C.error, marginTop: 6, background: C.warnSoft, borderRadius: 6, padding: '4px 8px' }}>
              上次异常：{task.lastError.message}
            </div>
          ) : null}
          {overdue && task.enabled ? (
            <div style={{ fontSize: 11, color: C.warn, marginTop: 6 }}>计划时间已过，等待调度循环处理</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Switch on={task.enabled} onToggle={props.onToggle} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingLeft: 26, flexWrap: 'wrap' }}>
        <button style={buttonStyle('primary')} onClick={props.onRun} disabled={props.busy}>
          立即运行
        </button>
        <button style={buttonStyle()} onClick={props.onEdit} disabled={props.busy}>
          编辑
        </button>
        <button style={buttonStyle()} onClick={props.onDuplicate} disabled={props.busy}>
          复制
        </button>
        <button style={buttonStyle()} onClick={props.onOpenRuns}>
          查看记录
        </button>
        <div style={{ flex: 1 }} />
        {confirming ? (
          <>
            <span style={{ fontSize: 12, color: C.label2, alignSelf: 'center' }}>删除任务（保留历史记录）？</span>
            <button style={buttonStyle('danger')} onClick={props.onDelete}>
              确认删除
            </button>
            <button style={buttonStyle()} onClick={() => setConfirming(false)}>
              取消
            </button>
          </>
        ) : (
          <button style={buttonStyle('danger')} onClick={() => setConfirming(true)}>
            删除
          </button>
        )}
      </div>
    </div>
  )
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }): React.ReactElement {
  return (
    <button
      onClick={onToggle}
      title={on ? '点击暂停' : '点击启用'}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        border: `1px solid ${on ? 'transparent' : C.border}`,
        background: on ? C.success : C.layer3,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 140ms ease',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'var(--dsw-alias-switch-thumb, #fff)',
          transition: 'left 140ms ease',
        }}
      />
    </button>
  )
}

/* --------------------------------------------------------------- runs list */

interface RunsViewProps {
  runs: Run[]
  tasks: Task[]
  zone: string
  onDetail: (run: Run) => void
  onRetry: (run: Run) => void
  onCancel: (run: Run) => void
  onClear: () => void
  /** Current task filter, owned by the page so 「查看记录」can scope it. */
  taskId: string
  onTaskId: (taskId: string) => void
}

function RunsView(props: RunsViewProps): React.ReactElement {
  const [status, setStatus] = React.useState<RunStatus | 'all'>('all')
  const [trigger, setTrigger] = React.useState<RunTrigger | 'all'>('all')
  const taskId = props.taskId
  const filtered = props.runs.filter((run) => {
    if (status !== 'all' && run.status !== status) return false
    if (trigger !== 'all' && run.trigger !== trigger) return false
    if (taskId !== 'all' && run.taskId !== taskId) return false
    return true
  })
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <select style={inputStyle} value={status} onChange={(event) => setStatus(event.target.value as RunStatus | 'all')}>
          <option value="all">全部状态</option>
          {(Object.keys(STATUS_TEXT) as RunStatus[]).map((key) => (
            <option key={key} value={key}>
              {STATUS_TEXT[key]}
            </option>
          ))}
        </select>
        <select style={inputStyle} value={trigger} onChange={(event) => setTrigger(event.target.value as RunTrigger | 'all')}>
          <option value="all">全部触发方式</option>
          {(Object.keys(TRIGGER_TEXT) as RunTrigger[]).map((key) => (
            <option key={key} value={key}>
              {TRIGGER_TEXT[key]}
            </option>
          ))}
        </select>
        <select style={inputStyle} value={taskId} onChange={(event) => props.onTaskId(event.target.value)}>
          <option value="all">全部任务</option>
          {props.tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button style={buttonStyle()} onClick={props.onClear}>
          清空已结束记录
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: C.label2, fontSize: 13 }}>
          还没有运行记录。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((run) => (
            <div key={run.id} style={{ ...card, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusBadge status={run.status} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{run.taskName}</span>
                <span style={{ fontSize: 11, color: C.caption, border: `1px solid ${C.border}`, borderRadius: 999, padding: '0 7px', lineHeight: '17px' }}>
                  {TRIGGER_TEXT[run.trigger] ?? run.trigger}
                </span>
                {run.attempt > 1 ? <span style={{ fontSize: 11, color: C.caption }}>第 {run.attempt} 次</span> : null}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: C.label2 }}>{shortTime(run.startedAt ?? run.createdAt, props.zone)}</span>
                <span style={{ fontSize: 11, color: C.caption }}>{formatDuration(run.durationMs)}</span>
                <button style={buttonStyle()} onClick={() => props.onDetail(run)}>
                  详情
                </button>
                {run.status === 'running' || run.status === 'queued' || run.status === 'waiting-approval' ? (
                  <button style={buttonStyle('danger')} onClick={() => props.onCancel(run)}>
                    停止
                  </button>
                ) : (
                  <button style={buttonStyle()} onClick={() => props.onRetry(run)}>
                    重跑
                  </button>
                )}
              </div>
              {run.error !== null ? (
                <div style={{ fontSize: 12, color: C.error, marginTop: 6 }}>{run.error.message}</div>
              ) : null}
              {run.artifacts.length > 0 ? (
                <div style={{ fontSize: 11, color: C.label2, marginTop: 6 }}>
                  产物 {run.artifacts.length}：{run.artifacts.slice(0, 2).map((item) => item.path.split('/').pop()).join('、')}
                  {run.artifacts.length > 2 ? ' …' : ''}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* -------------------------------------------------------------- run detail */

const LIVE_STATUSES: RunStatus[] = ['queued', 'running', 'waiting-approval']

function RunDetail(props: {
  run: Run
  zone: string
  onClose: () => void
  onOpenSession: (sessionId: string | null) => void
}): React.ReactElement {
  // The record on screen keeps following the Host while it is still live, so
  // status, tool list and artifacts fill in without closing the dialog.
  const [run, setRun] = React.useState<Run>(props.run)
  React.useEffect(() => {
    setRun(props.run)
  }, [props.run])
  React.useEffect(() => {
    if (!LIVE_STATUSES.includes(run.status)) return
    let alive = true
    const tick = (): void => {
      void call<Run>({ op: 'run.detail', runId: run.id }).then((result) => {
        if (alive && result.ok) setRun(result.value)
      })
    }
    const handle = setInterval(tick, 1500)
    return () => {
      alive = false
      clearInterval(handle)
    }
  }, [run.id, run.status])
  return (
    <Modal title={`运行详情 · ${run.taskName}`} onClose={props.onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 12 }}>
        <Field label="状态">
          <StatusBadge status={run.status} />
        </Field>
        <Field label="触发方式">{TRIGGER_TEXT[run.trigger] ?? run.trigger}</Field>
        <Field label="计划时间">{shortTime(run.scheduledFor, props.zone)}</Field>
        <Field label="开始时间">{shortTime(run.startedAt, props.zone)}</Field>
        <Field label="结束时间">{shortTime(run.endedAt, props.zone)}</Field>
        <Field label="耗时">{formatDuration(run.durationMs)}</Field>
        <Field label="超时设置">{run.timeoutMinutes === undefined ? (run.startedAt === null ? '—（尚未开始）' : '—（旧记录未保存）') : `${run.timeoutMinutes} 分钟`}</Field>
        <Field label="截止时间">{shortTime(run.timeoutAt ?? null, props.zone)}</Field>
        <Field label="会话模式">{run.sessionMode === 'persistent' ? '持续会话' : '独立会话'}</Field>
        <Field label="实际模型">
          {run.modelSnapshot === null
            ? '—'
            : `${run.modelSnapshot.provider}/${run.modelSnapshot.model}${run.modelSnapshot.reasoningEffort === null ? '' : ` · ${run.modelSnapshot.reasoningEffort}`}`}
        </Field>
        <Field label="权限预设">{run.permissionPreset ?? '旧组合'}</Field>
        <Field label="执行会话">
          {run.sessionId === null ? (
            '—'
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <code style={{ fontFamily: 'var(--ds-font-family-code, monospace)', fontSize: 11 }}>{run.sessionId}</code>
              <button style={buttonStyle()} onClick={() => props.onOpenSession(run.sessionId)}>
                打开会话
              </button>
            </span>
          )}
        </Field>
      </div>

      {run.error !== null ? (
        <section style={{ marginTop: 16 }}>
          <SectionTitle>错误</SectionTitle>
          <div style={{ fontSize: 12, color: C.error, background: C.warnSoft, borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
            {run.error.message}
            {run.error.code === null ? '' : `（${run.error.code}）`}
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: 16 }}>
        <SectionTitle>产物（{run.artifacts.length}）</SectionTitle>
        {run.artifacts.length === 0 ? (
          <div style={{ fontSize: 12, color: C.label2 }}>本次运行没有在工作文件夹里写入文件。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {run.artifacts.map((artifact) => (
              <div key={artifact.path} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <a
                  href={`/dsh-task-center/artifact?runId=${encodeURIComponent(run.id)}&path=${encodeURIComponent(artifact.path)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: C.brand, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={artifact.path}
                >
                  {artifact.path.split('/').pop()}
                </a>
                <span style={{ fontSize: 11, color: C.caption }}>{formatBytes(artifact.size)}</span>
                <span style={{ fontSize: 11, color: C.caption, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={artifact.path}>
                  {artifact.path}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {run.tools.length > 0 ? (
        <section style={{ marginTop: 16 }}>
          <SectionTitle>调用的工具（{run.tools.length}）</SectionTitle>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {run.tools.map((tool) => (
              <span key={tool.name} style={{ fontSize: 11, background: C.layer2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 7px' }}>
                {tool.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {run.output !== null ? (
        <section style={{ marginTop: 16 }}>
          <SectionTitle>输出</SectionTitle>
          <pre
            style={{
              fontFamily: 'var(--ds-font-family-code, monospace)',
              fontSize: 11,
              lineHeight: 1.6,
              background: 'var(--dsw-alias-markdown-code-block)',
              borderRadius: 8,
              padding: '10px 12px',
              margin: 0,
              whiteSpace: 'pre-wrap',
              maxHeight: 260,
              overflow: 'auto',
            }}
          >
            {run.output}
          </pre>
        </section>
      ) : null}

      <section style={{ marginTop: 16 }}>
        <SectionTitle>执行日志</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflow: 'auto' }}>
          {run.log.map((entry, index) => (
            <div key={`${entry.at}-${index}`} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
              <span style={{ color: C.caption, flexShrink: 0 }}>{shortTime(entry.at, props.zone).slice(11)}</span>
              <span style={{ color: entry.level === 'error' ? C.error : entry.level === 'warn' ? C.warn : C.label2 }}>{entry.text}</span>
            </div>
          ))}
        </div>
      </section>
    </Modal>
  )
}

function Field(props: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <>
      <div style={{ color: C.label2 }}>{props.label}</div>
      <div style={{ minWidth: 0 }}>{props.children}</div>
    </>
  )
}

function SectionTitle(props: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ fontSize: 11, color: C.label3, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
      {props.children}
    </div>
  )
}

/* ------------------------------------------------------------------- modal */

function Modal(props: {
  title: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}): React.ReactElement {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])
  return (
    <div
      onClick={props.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,.32))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 50,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: props.wide === true ? 720 : 560,
          maxWidth: '100%',
          maxHeight: '86vh',
          overflow: 'auto',
          background: C.layer1,
          color: C.label,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,.28)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{props.title}</div>
          <button style={buttonStyle()} onClick={props.onClose}>
            关闭
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- task form */

function draftTask(template: TaskTemplate | null, zone: string): Task {
  const base: Partial<Task> = template === null ? {} : template.task
  const nowIso = new Date().toISOString()
  return {
    id: '',
    name: base.name ?? '新任务',
    prompt: base.prompt ?? '',
    attachments: [],
    model: base.model ?? null,
    reasoningEffort: base.reasoningEffort ?? null,
    workspace: base.workspace ?? null,
    sessionMode: base.sessionMode ?? 'independent',
    sessionId: null,
    sessionModelKey: null,
    permission: base.permission ?? { approval: 'never', sandbox: 'workspace-write' },
    permissionPreset: base.permissionPreset ?? null,
    permissionSource: base.permissionSource ?? 'legacy',
    modelSource: base.modelSource ?? 'default',
    workspaceId: base.workspaceId ?? null,
    workspaceSource: base.workspaceSource ?? 'task-dir',
    legacyIssues: [],
    schedule: base.schedule ?? { kind: 'daily', time: '09:00' },
    timeZone: base.timeZone ?? zone,
    startAt: null,
    endAt: null,
    missedPolicy: base.missedPolicy ?? 'catchup',
    enabled: true,
    maxRetries: base.maxRetries ?? 1,
    timeoutMinutes: base.timeoutMinutes ?? 20,
    createdAt: nowIso,
    updatedAt: nowIso,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastError: null,
    templateId: template?.id ?? null,
  }
}

function TaskForm(props: {
  task: Task
  snapshot: StateSnapshot | null
  uiWorkspace?: { pickDirectory?: () => Promise<unknown> }
  onReload?: () => void
  onClose: () => void
  onSaved: (task: Task, notice?: string) => void
}): React.ReactElement {
  const [draft, setDraft] = React.useState<Task>(() => structuredClone(props.task))
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [zones, setZones] = React.useState<string[]>([])
  const models = props.snapshot?.models ?? []
  // Only a model that publishes thinking levels gets a thinking control: a
  // selector the Host cannot honour would be a fake switch.
  const selectedEntry =
    draft.model === null
      ? null
      : models.find((entry) => entry.provider === draft.model?.provider && entry.model === draft.model?.model) ?? null
  const reasoningOptions = selectedEntry?.reasoning?.efforts ?? []
  const [pendingFull, setPendingFull] = React.useState(false)
  const workspaces = props.snapshot?.workspaces ?? []
  const permissions = props.snapshot?.permissions ?? []
  const workspaceKind: 'task-dir' | 'workspace' | 'custom' =
    draft.workspaceId !== null
      ? 'workspace'
      : draft.workspace !== null && draft.workspace.trim() !== ''
        ? 'custom'
        : 'task-dir'
  const workspacePathHint =
    draft.workspaceId !== null ? (workspaces.find((entry) => entry.id === draft.workspaceId)?.path ?? draft.workspace) : draft.workspace
  const permissionHint =
    draft.permissionPreset === null
      ? null
      : (() => {
          const entry = permissions.find((candidate) => candidate.value === draft.permissionPreset)
          return entry === undefined ? draft.permissionPreset : presetLabel(entry)
        })()
  const permissionError = draft.permissionPreset !== null && permissions.length > 0 && permissionHint === draft.permissionPreset
    ? '这个预设已经不在宿主目录里，请重新选择'
    : null

  // "Choose another folder" must go through the Host: only a registered
  // workspace gives the scheduler a path it can keep in sync after a rename.
  const pickFolder = async (): Promise<void> => {
    setError(null)
    try {
      const ui = props.uiWorkspace
      if (ui === undefined || typeof ui.pickDirectory !== 'function') {
        throw new Error('当前宿主没有目录选择器，请直接填写绝对路径')
      }
      const picked = await ui.pickDirectory()
      const path =
        typeof picked === 'string'
          ? picked
          : typeof (picked as { path?: unknown } | null)?.path === 'string'
            ? String((picked as { path: string }).path)
            : ''
      if (path.trim() === '') throw new Error('宿主没有返回目录路径，请直接填写绝对路径')
      const created = await call<{ workspaceId: string; path: string }>({ op: 'workspace.create', path: path.trim() })
      if (!created.ok) throw new Error(created.message)
      patch({ workspaceId: created.value.workspaceId, workspace: created.value.path })
      props.onReload?.()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  React.useEffect(() => {
    void call<string[]>({ op: 'timezones' }).then((result) => {
      if (result.ok) setZones(result.value)
    })
  }, [])

  const patch = (next: Partial<Task>): void => setDraft((current) => ({ ...current, ...next }))
  const patchSchedule = (next: Partial<Task['schedule']>): void =>
    setDraft((current) => ({ ...current, schedule: { ...current.schedule, ...next } }))

  const save = async (): Promise<void> => {
    setSaving(true)
    const result = await call<Task>({ op: 'task.save', task: draft })
    setSaving(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    props.onSaved(result.value)
  }

  const runLater = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    const saved = await call<Task>({ op: 'task.save', task: draft })
    if (!saved.ok) {
      setSaving(false)
      setError(`保存失败：${saved.message}`)
      return
    }
    const started = await call<Run>({ op: 'run.now', id: saved.value.id })
    setSaving(false)
    if (!started.ok) {
      // Saved but not started: keep the dialog open with the real reason.
      setError(`已保存「${saved.value.name}」，但启动失败：${started.message}`)
      return
    }
    props.onSaved(saved.value, `已保存并开始运行（运行 ${started.value.id}，状态 ${STATUS_TEXT[started.value.status] ?? started.value.status}）`)
  }

  return (
    <Modal title={props.task.id === '' ? '新建定时任务' : '编辑定时任务'} onClose={props.onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Row label="任务名称">
          <input
            style={{ ...inputStyle, width: '100%' }}
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="例如：AI 新闻 HTML 日报"
          />
        </Row>

        <Row label="任务提示词">
          <textarea
            style={{ ...inputStyle, width: '100%', minHeight: 120, resize: 'vertical', lineHeight: 1.6 }}
            value={draft.prompt}
            onChange={(event) => patch({ prompt: event.target.value })}
            placeholder="到点后要真正执行的指令。写清楚要产出的文件与格式。"
          />
        </Row>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Row label="模型">
            <select
              style={{ ...inputStyle, width: '100%' }}
              value={draft.model === null ? '' : `${draft.model.provider}/${draft.model.model}`}
              onChange={(event) => {
                const value = event.target.value
                if (value === '') {
                  patch({ model: null })
                  return
                }
                const [provider, ...rest] = value.split('/')
                patch({ model: { provider: provider ?? '', model: rest.join('/') } })
              }}
            >
              <option value="">跟随默认模型</option>
              {models.map((entry) => {
                const value = `${entry.provider}/${entry.model}`
                return (
                  <option key={value} value={value}>
                    {entry.provider} · {entry.label}
                  </option>
                )
              })}
            </select>
          </Row>
          <Row label="工作文件夹">
            <select
              style={{ ...inputStyle, width: '100%' }}
              value={workspaceKind === 'workspace' ? `ws:${draft.workspaceId ?? ''}` : workspaceKind === 'custom' ? 'custom' : 'task-dir'}
              onChange={(event) => {
                const value = event.target.value
                if (value === 'task-dir') {
                  patch({ workspaceId: null, workspace: null })
                  return
                }
                if (value === 'custom') {
                  patch({ workspaceId: null, workspace: draft.workspace ?? '' })
                  return
                }
                const id = value.slice(3)
                const entry = workspaces.find((candidate) => candidate.id === id)
                patch({ workspaceId: id, workspace: entry?.path ?? draft.workspace })
              }}
            >
              <option value="task-dir">任务独立目录（插件自动创建）</option>
              {workspaces.map((entry) => (
                <option key={entry.id} value={`ws:${entry.id}`}>
                  {entry.title} — {entry.path}
                </option>
              ))}
              <option value="custom">自定义路径（未登记为宿主工作区）</option>
            </select>
            {workspaceKind === 'custom' ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={draft.workspace ?? ''}
                  onChange={(event) => patch({ workspace: event.target.value.trim() === '' ? null : event.target.value, workspaceId: null })}
                  placeholder="绝对路径"
                />
                <button style={buttonStyle()} onClick={() => void pickFolder()}>
                  选择其他文件夹…
                </button>
              </div>
            ) : null}
            <div style={{ fontSize: 11, color: C.caption, lineHeight: 1.5 }}>
              {workspaceKind === 'workspace'
                ? '会按宿主登记的工作区解析真实路径；工作区改名或移动后按宿主最新路径执行，被删除时会明确报错，不会悄悄换目录。'
                : workspaceKind === 'custom'
                  ? '这是一条原始路径，没有登记为宿主工作区：目录被移走时任务会直接失败，不会自动改用其它目录。'
                  : '插件会在自己的数据目录下为本任务建一个独立文件夹，产物只写在这里。'}
              {workspacePathHint === null ? '' : ` 当前：${workspacePathHint}`}
            </div>
          </Row>
        </div>

        {reasoningOptions.length > 0 ? (
          <Row label={`思考档位（${selectedEntry?.label ?? ''} 支持）`}>
            <select
              style={{ ...inputStyle, width: '100%' }}
              value={draft.reasoningEffort ?? ''}
              onChange={(event) => patch({ reasoningEffort: event.target.value === '' ? null : event.target.value })}
            >
              <option value="">跟随模型默认</option>
              {reasoningOptions.map((effort) => (
                <option key={effort.id} value={effort.id} title={effort.description ?? ''}>
                  {effort.name}
                  {selectedEntry?.reasoning?.defaultEffort === effort.id ? '（默认）' : ''}
                </option>
              ))}
            </select>
          </Row>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Row label="会话模式">
            <select
              style={{ ...inputStyle, width: '100%' }}
              value={draft.sessionMode}
              onChange={(event) => patch({ sessionMode: event.target.value as Task['sessionMode'] })}
            >
              <option value="independent">独立会话（每次新建）</option>
              <option value="persistent">持续会话（复用专属会话）</option>
            </select>
          </Row>
          <Row label="任务时区">
            <input
              style={{ ...inputStyle, width: '100%' }}
              list="dsh-task-center-timezones"
              value={draft.timeZone}
              onChange={(event) => patch({ timeZone: event.target.value })}
            />
            <datalist id="dsh-task-center-timezones">
              {zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </Row>
        </div>

        <div style={{ borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>调度配置</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Row label="重复方式">
              <select
                style={{ ...inputStyle, width: '100%' }}
                value={draft.schedule.kind}
                onChange={(event) => patchSchedule({ kind: event.target.value as Task['schedule']['kind'] })}
              >
                <option value="once">单次</option>
                <option value="interval">固定间隔</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="cron">Cron 表达式</option>
              </select>
            </Row>
            <Row label="时间 / 表达式">
              {draft.schedule.kind === 'once' ? (
                <input
                  type="datetime-local"
                  style={{ ...inputStyle, width: '100%' }}
                  value={toZoneInput(draft.schedule.at ?? null, draft.timeZone)}
                  onChange={(event) => patchSchedule({ at: fromZoneInput(event.target.value, draft.timeZone) })}
                />
              ) : null}
              {draft.schedule.kind === 'interval' ? (
                <input
                  type="number"
                  min={1}
                  style={{ ...inputStyle, width: '100%' }}
                  value={draft.schedule.everyMinutes ?? 60}
                  onChange={(event) => patchSchedule({ everyMinutes: Number(event.target.value) })}
                  placeholder="间隔分钟数"
                />
              ) : null}
              {draft.schedule.kind === 'daily' || draft.schedule.kind === 'weekly' ? (
                <input
                  type="time"
                  style={{ ...inputStyle, width: '100%' }}
                  value={draft.schedule.time ?? '09:00'}
                  onChange={(event) => patchSchedule({ time: event.target.value })}
                />
              ) : null}
              {draft.schedule.kind === 'cron' ? (
                <input
                  style={{ ...inputStyle, width: '100%' }}
                  value={draft.schedule.cron ?? '0 9 * * *'}
                  onChange={(event) => patchSchedule({ cron: event.target.value })}
                  placeholder="0 9 * * *"
                />
              ) : null}
            </Row>
          </div>

          {draft.schedule.kind === 'weekly' ? (
            <Row label="每周哪几天">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => {
                  const day = index + 1
                  const active = (draft.schedule.weekdays ?? []).includes(day)
                  return (
                    <button
                      key={day}
                      style={buttonStyle(active ? 'primary' : 'ghost')}
                      onClick={() => {
                        const current = new Set(draft.schedule.weekdays ?? [])
                        if (current.has(day)) current.delete(day)
                        else current.add(day)
                        patchSchedule({ weekdays: [...current].sort((a, b) => a - b) })
                      }}
                    >
                      周{label}
                    </button>
                  )
                })}
              </div>
            </Row>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Row label="有效期">
              <select
                style={{ ...inputStyle, width: '100%' }}
                value={draft.startAt === null && draft.endAt === null ? 'forever' : 'window'}
                onChange={(event) => {
                  if (event.target.value === 'forever') {
                    patch({ startAt: null, endAt: null })
                    return
                  }
                  const start = new Date()
                  const end = new Date(Date.now() + 30 * 24 * 3600 * 1000)
                  patch({ startAt: start.toISOString(), endAt: end.toISOString() })
                }}
              >
                <option value="forever">长期有效</option>
                <option value="window">指定期限</option>
              </select>
            </Row>
            <Row label="错过时的处理">
              <select
                style={{ ...inputStyle, width: '100%' }}
                value={draft.missedPolicy}
                onChange={(event) => patch({ missedPolicy: event.target.value as Task['missedPolicy'] })}
              >
                <option value="catchup">开机后补跑最近一次</option>
                <option value="skip">直接跳过</option>
              </select>
            </Row>
          </div>

          {draft.startAt !== null || draft.endAt !== null ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <Row label="开始于">
                <input
                  type="datetime-local"
                  style={{ ...inputStyle, width: '100%' }}
                  value={toZoneInput(draft.startAt, draft.timeZone)}
                  onChange={(event) => patch({ startAt: fromZoneInput(event.target.value, draft.timeZone) })}
                />
              </Row>
              <Row label="结束于">
                <input
                  type="datetime-local"
                  style={{ ...inputStyle, width: '100%' }}
                  value={toZoneInput(draft.endAt, draft.timeZone)}
                  onChange={(event) => patch({ endAt: fromZoneInput(event.target.value, draft.timeZone) })}
                />
              </Row>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            <Row label="失败重试">
              <input
                type="number"
                min={0}
                max={5}
                style={{ ...inputStyle, width: '100%' }}
                value={draft.maxRetries}
                onChange={(event) => patch({ maxRetries: Number(event.target.value) })}
              />
            </Row>
            <Row label="运行超时（分钟）">
              <input
                type="number"
                min={1}
                style={{ ...inputStyle, width: '100%' }}
                value={draft.timeoutMinutes}
                onChange={(event) => patch({ timeoutMinutes: Number(event.target.value) })}
              />
            </Row>
            <Row label="状态">
              <select
                style={{ ...inputStyle, width: '100%' }}
                value={draft.enabled ? 'on' : 'off'}
                onChange={(event) => patch({ enabled: event.target.value === 'on' })}
              >
                <option value="on">启用</option>
                <option value="off">暂停</option>
              </select>
            </Row>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>权限（宿主原生三档）</div>
          <Row label="权限预设">
            <select
              style={{ ...inputStyle, width: '100%' }}
              value={draft.permissionPreset ?? ''}
              onChange={(event) => {
                const value = event.target.value
                if (value === '') {
                  patch({ permissionPreset: null, permissionSource: 'legacy' })
                  return
                }
                if (value === 'danger-full-access') {
                  setPendingFull(true)
                  return
                }
                patch({ permissionPreset: value, permissionSource: 'preset' })
              }}
            >
              {draft.permissionPreset === null ? (
                <option value="">（未选择预设 · 当前沿用旧组合）</option>
              ) : null}
              {permissions.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {presetLabel(entry)}
                  {entry.description === undefined ? '' : ` — ${entry.description}`}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: C.caption, lineHeight: 1.5 }}>
              预设只应用到本任务的会话，不改动其它会话或宿主默认权限。当前：
              {permissionHint === null ? '旧组合（沙箱 ' + draft.permission.sandbox + ' / 审批 ' + draft.permission.approval + '）' : permissionHint}
            </div>
            {permissionError === null ? null : (
              <div style={{ fontSize: 11, color: C.warn, marginTop: 4 }}>{permissionError}</div>
            )}
            {pendingFull ? (
              <div style={{ marginTop: 10, border: `1px solid ${C.warn}`, borderRadius: 8, padding: '10px 12px', background: C.warnSoft }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>确认启用完全权限？</div>
                <div style={{ fontSize: 11, color: C.label2, lineHeight: 1.6, marginBottom: 8 }}>
                  该任务会在无人值守的情况下拥有完全文件与命令权限，没有任何审批拦截。原生界面对这一档同样要求确认。
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={buttonStyle('primary')}
                    onClick={() => {
                      patch({ permissionPreset: 'danger-full-access', permissionSource: 'preset' })
                      setPendingFull(false)
                    }}
                  >
                    我已了解风险，并愿意继续
                  </button>
                  <button style={buttonStyle()} onClick={() => setPendingFull(false)}>
                    取消
                  </button>
                </div>
              </div>
            ) : null}
          </Row>
        </div>

        <Row label="参考附件（每行一个绝对路径；这是写进提示词的文件引用，不是聊天里的原生附件）">
          <textarea
            style={{ ...inputStyle, width: '100%', minHeight: 54, resize: 'vertical', lineHeight: 1.5 }}
            value={draft.attachments.join('\n')}
            onChange={(event) =>
              patch({ attachments: event.target.value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0) })
            }
            placeholder="/Users/you/notes/brand.md"
          />
        </Row>

        {error !== null ? <div style={{ fontSize: 12, color: C.error }}>{error}</div> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button style={buttonStyle()} onClick={props.onClose}>
            取消
          </button>
          <button style={buttonStyle()} onClick={() => void runLater()} disabled={saving}>
            保存并立即运行
          </button>
          <button style={buttonStyle('primary')} onClick={() => void save()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Row(props: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 11, color: C.label2 }}>{props.label}</div>
      {props.children}
    </div>
  )
}

/** Render an instant as the wall clock of `timeZone`, in the `<input>` shape. */
function toZoneInput(iso: string | null, timeZone: string): string {
  if (iso === null) return ''
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at))
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00'
  const hour = pick('hour') === '24' ? '00' : pick('hour')
  return `${pick('year')}-${pick('month')}-${pick('day')}T${hour}:${pick('minute')}`
}

/** Interpret `<input>` wall clock as a wall clock in `timeZone`. */
function fromZoneInput(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (match === null) return null
  const [, year, month, day, hour, minute] = match
  // Two offset probes are enough to resolve the zone's offset at that wall time.
  const guess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  let instant = guess
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shifted = guess - offsetAt(instant, timeZone)
    if (shifted === instant) break
    instant = shifted
  }
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null
}

function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instant))
  const pick = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0)
  const hour = pick('hour') === 24 ? 0 : pick('hour')
  const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), hour, pick('minute'), pick('second'))
  return asUtc - instant
}


/* ------------------------------------------------------- native reminders */

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function sourceBadge(source: 'auto' | 'reminder'): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '1px 7px',
    borderRadius: 999,
    background: source === 'auto' ? C.successSoft : C.layer3,
    color: source === 'auto' ? C.success : C.label2,
    border: `1px solid ${source === 'auto' ? 'transparent' : C.borderSoft}`,
    whiteSpace: 'nowrap',
  }
}

interface ReminderCardProps {
  reminder: ReminderRow
  zone: string
  busy: boolean
  checked: boolean
  onCheck: (checked: boolean) => void
  onOpen: () => void
  onDelete: () => void
  onOpenSession: (sessionId: string) => void
}

function ReminderCard(props: ReminderCardProps): React.ReactElement {
  const { reminder } = props
  const [confirming, setConfirming] = React.useState(false)
  const next = reminder.scheduledAt === '' ? null : Date.parse(reminder.scheduledAt)
  const overdue = reminder.status === 'active' && next !== null && next < Date.now()
  const color = reminder.status === 'active' ? C.warn : C.label2
  return (
    <div style={{ ...card, background: C.layer1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(event) => props.onCheck(event.target.checked)}
          style={{ marginTop: 4, accentColor: C.brand }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{reminder.title}</span>
            <span style={sourceBadge('reminder')}>对话提醒</span>
            <span style={{ fontSize: 11, color }}>{reminder.status === 'active' ? '投递中' : '已结束'}</span>
            {overdue ? <span style={{ fontSize: 11, color: C.warn }}>已过触发时间，等待投递</span> : null}
          </div>
          <div style={{ fontSize: 12, color: C.label2, marginTop: 6 }}>规则：{reminder.rule}</div>
          <div style={{ fontSize: 12, color: C.label2, marginTop: 2 }}>
            下次：{reminder.scheduledAt === '' ? '—' : shortTime(reminder.scheduledAt, reminder.timeZone ?? props.zone)}
            {reminder.timeZone === null ? '' : `（${reminder.timeZone}）`}
          </div>
          <div style={{ fontSize: 12, color: C.label2, marginTop: 2 }}>
            投递到会话：
            <button
              style={{
                font: 'inherit',
                fontSize: 12,
                background: 'transparent',
                border: 'none',
                color: C.brand,
                cursor: reminder.sessionId === '' ? 'default' : 'pointer',
                padding: 0,
              }}
              disabled={reminder.sessionId === ''}
              onClick={() => props.onOpenSession(reminder.sessionId)}
            >
              {reminder.sessionId === '' ? '（未知会话）' : reminder.sessionId}
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.caption, marginTop: 4 }}>
            原生提醒只负责把消息投递回原会话，不产生执行记录与产物；「已投递」不等于「已执行」。
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button style={buttonStyle()} onClick={props.onOpen} disabled={props.busy}>
          投递记录 / 编辑
        </button>
        <span
          style={{
            ...buttonStyle(),
            color: C.caption,
            cursor: 'not-allowed',
            background: 'transparent',
          }}
          title="原生提醒没有启用/暂停状态，暂停请删除提醒或改用自动执行任务"
          aria-disabled="true"
        >
          暂停（原生不支持）
        </span>
        {confirming ? (
          <>
            <span style={{ fontSize: 12, color: C.error }}>删除这条提醒？已排队的消息不会撤回</span>
            <button style={buttonStyle('danger')} disabled={props.busy} onClick={props.onDelete}>
              确认删除
            </button>
            <button style={buttonStyle()} disabled={props.busy} onClick={() => setConfirming(false)}>
              取消
            </button>
          </>
        ) : (
          <button style={buttonStyle('danger')} disabled={props.busy} onClick={() => setConfirming(true)}>
            删除
          </button>
        )}
      </div>
    </div>
  )
}

interface ReminderDetailProps {
  reminder: ReminderRow
  zone: string
  onClose: () => void
  onToast: (text: string) => void
  onChanged: () => void
}

function ReminderDetail(props: ReminderDetailProps): React.ReactElement {
  const { reminder } = props
  const [history, setHistory] = React.useState<ReminderHistory | null>(null)
  const [historyError, setHistoryError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [title, setTitle] = React.useState(reminder.title)
  const [prompt, setPrompt] = React.useState(reminder.prompt)
  const [kind, setKind] = React.useState<ReminderTimingChange['kind']>(reminder.kind === 'after' ? 'every' : reminder.kind)
  const [time, setTime] = React.useState('09:00')
  const [zone, setZone] = React.useState(reminder.timeZone ?? props.zone)
  const [expression, setExpression] = React.useState('*/15 9-17 * * 1-5')
  const [weekdays, setWeekdays] = React.useState<number[]>([5])
  const [everySeconds, setEverySeconds] = React.useState(3600)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadHistory = React.useCallback(async () => {
    setLoading(true)
    const result = await call<ReminderHistory>({
      op: 'reminder.history',
      id: reminder.id,
      sessionId: reminder.sessionId,
      limit: 50,
    })
    setLoading(false)
    if (result.ok) {
      setHistory(result.value)
      setHistoryError(null)
    } else {
      setHistoryError(result.message)
    }
  }, [reminder.id, reminder.sessionId])

  React.useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const change = (): ReminderTimingChange => {
    const timeZone = zone.trim()
    switch (kind) {
      case 'daily':
        return { kind: 'daily', daily: { time, time_zone: timeZone } }
      case 'weekly':
        return { kind: 'weekly', weekly: { time, time_zone: timeZone, weekdays } }
      case 'cron':
        return { kind: 'cron', cron: { expression, time_zone: timeZone } }
      case 'every':
        return { kind: 'every', every_seconds: everySeconds }
      default:
        return { kind: 'at', at: { date: new Date().toISOString().slice(0, 10), time, time_zone: timeZone } }
    }
  }

  const save = async (withTiming: boolean): Promise<void> => {
    setSaving(true)
    setError(null)
    const result = await call<unknown>({
      op: 'reminder.update',
      id: reminder.id,
      sessionId: reminder.sessionId,
      title,
      prompt,
      ...(withTiming ? { change: change() } : {}),
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    props.onToast(withTiming ? '已保存提醒名称、内容与触发规则' : '已保存提醒名称与内容')
    props.onChanged()
  }

  return (
    <Modal title={`提醒：${reminder.title}`} onClose={props.onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...card, background: C.layer2, fontSize: 12, color: C.label2 }}>
          这是 DSH 原生会话提醒，由原生 schedule 服务投递。它没有执行记录：下面的记录只说明消息在何时投递给哪个会话。
        </div>

        <Field label="名称">
          <input value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} />
        </Field>
        <Field label="内容">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <SectionTitle>触发规则</SectionTitle>
        <Row label="类型">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as ReminderTimingChange['kind'])}
            style={inputStyle}
          >
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="cron">Cron</option>
            <option value="every">固定间隔</option>
            <option value="at">单次</option>
          </select>
        </Row>
        {kind === 'every' ? (
          <Row label="间隔（秒）">
            <input
              type="number"
              min={60}
              value={everySeconds}
              onChange={(event) => setEverySeconds(Number(event.target.value))}
              style={inputStyle}
            />
          </Row>
        ) : kind === 'cron' ? (
          <Row label="Cron 表达式">
            <input value={expression} onChange={(event) => setExpression(event.target.value)} style={inputStyle} />
          </Row>
        ) : (
          <Row label="时间">
            <input value={time} onChange={(event) => setTime(event.target.value)} style={inputStyle} />
          </Row>
        )}
        {kind === 'weekly' ? (
          <Row label="星期">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {WEEKDAY_LABELS.map((label, index) => {
                const day = index + 1
                const active = weekdays.includes(day)
                return (
                  <button
                    key={label}
                    style={buttonStyle(active ? 'primary' : 'ghost')}
                    onClick={() =>
                      setWeekdays((current) =>
                        active ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b),
                      )
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </Row>
        ) : null}
        {kind !== 'every' ? (
          <Row label="时区">
            <input value={zone} onChange={(event) => setZone(event.target.value)} style={inputStyle} />
          </Row>
        ) : null}

        {error !== null ? <div style={{ fontSize: 12, color: C.error }}>{error}</div> : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={buttonStyle('primary')} disabled={saving} onClick={() => void save(false)}>
            只保存名称与内容
          </button>
          <button style={buttonStyle()} disabled={saving} onClick={() => void save(true)}>
            保存并修改触发规则
          </button>
        </div>

        <SectionTitle>投递记录</SectionTitle>
        {loading ? (
          <div style={{ fontSize: 12, color: C.label2 }}>正在读取投递记录…</div>
        ) : historyError !== null ? (
          <div style={{ fontSize: 12, color: C.error }}>
            {historyError}
            <button style={{ ...buttonStyle(), marginLeft: 8 }} onClick={() => void loadHistory()}>
              重试
            </button>
          </div>
        ) : history === null || history.records.length === 0 ? (
          <div style={{ fontSize: 12, color: C.label2 }}>还没有投递记录。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.records.map((record: ReminderDelivery) => (
              <div
                key={`${record.messageId}-${record.deliveredAt}`}
                style={{ ...card, background: C.layer2, padding: '8px 10px', fontSize: 12 }}
              >
                <div style={{ color: C.label }}>
                  已投递 · {shortTime(record.deliveredAt, reminder.timeZone ?? props.zone)}
                </div>
                <div style={{ color: C.label2, marginTop: 2 }}>
                  计划时间 {shortTime(record.scheduledAt, reminder.timeZone ?? props.zone)} · 消息 {record.messageId}
                </div>
                {record.prompt === null ? null : (
                  <div style={{ color: C.caption, marginTop: 4, whiteSpace: 'pre-wrap' }}>{record.prompt}</div>
                )}
              </div>
            ))}
            {history.earlierRecordsPruned ? (
              <div style={{ fontSize: 11, color: C.caption }}>
                更早的记录已被保留策略清理
                {history.retention === null ? '' : `（保留 ${history.retention.days} 天 / ${history.retention.records} 条）`}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** One-line hand-off for a panel selection persisted under the old key. */
function LegacyRedirect(props: Record<string, unknown>): React.ReactElement {
  const selectPanel = (props as { selectPanel?: (id: string) => void }).selectPanel
  React.useEffect(() => {
    selectPanel?.(NATIVE_PANEL_ID)
  }, [selectPanel])
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.base,
        color: C.label2,
        fontSize: 13,
      }}
    >
      自动化任务已并入原生「自动化任务」入口
      <button
        style={{ ...buttonStyle(), marginLeft: 10 }}
        onClick={() => selectPanel?.(NATIVE_PANEL_ID)}
      >
        打开
      </button>
    </div>
  )
}

/* --------------------------------------------------------------- entry bits */


/**
 * Client half. The Host rejects equal key + priority registrations; the lowest
 * priority renders. Shadow the native `schedules` page at -10, leaving its
 * default-priority registration alive regardless of which plugin starts first.
 * The shipped sidebar entry still opens this page without a second entry.
 *
 * The plugin's former key stays registered as a one-line hand-off, so a panel
 * selection persisted before the upgrade still lands on the real page. Both
 * registrations live inside `ctx.slots.inject`, so disposing the plugin gives the
 * native page back.
 */
export function apply(ctx: {
  slots: { inject: (name: string, run: () => unknown) => void; register: (options: Record<string, unknown>, component: unknown) => unknown }
  get?: (name: string, strict?: boolean) => unknown
}): void {
  const get = typeof ctx.get === 'function' ? ctx.get.bind(ctx) : () => undefined
  const uiWorkspace = get('uiWorkspace', false)
  // `layout` is read defensively: a missing service must not stop the page from
  // registering, and the hand-off below is all it is needed for.
  const layout = get('layout', false) as { selectPanel?: (id: string) => void } | undefined
  const selectPanel = (id: string): void => {
    try {
      layout?.selectPanel?.(id)
    } catch {
      /* the shell may be mid-teardown */
    }
  }

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: NATIVE_PANEL_ID, priority: -10, inject: () => ({ uiWorkspace }) },
      TaskCenterPage,
    ),
  )
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: LEGACY_PANEL_ID, inject: () => ({ selectPanel }) },
      LegacyRedirect,
    ),
  )
}

export const source = { nativePanel: NATIVE_PANEL_ID }
export const name = 'dsh-client-task-center'
export const inject = ['slots']
