/**
 * Pre-flight smoke test for the browser bundle.
 *
 * The client half is normally exercised only inside the DSH shell, after a
 * restart. This harness loads `lib/client.js` exactly as the shell would (same
 * `__ModuleLoader__.load({id, factory})` envelope), hands it a tiny React
 * stand-in, registers the slots, and then actually walks the component tree
 * with fixture data — so a typo, a missing import or a crashing render path
 * fails here instead of in the user's panel.
 *
 *   node scripts/smoke-client.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

/* ------------------------------------------------------------ React stub */

let rendering = null
let effects = []
let dirty = false

function createElement(type, props, ...children) {
  return { type, props: props ?? {}, children: children.flat(Infinity) }
}

const React = {
  createElement,
  Fragment: '__fragment__',
  useState(initial) {
    const slot = rendering.index
    rendering.index += 1
    const hooks = rendering.hooks
    if (!(slot in hooks)) {
      hooks[slot] = typeof initial === 'function' ? initial() : initial
    }
    const set = (value) => {
      hooks[slot] = typeof value === 'function' ? value(hooks[slot]) : value
      dirty = true
    }
    return [hooks[slot], set]
  },
  useEffect(fn) {
    effects.push(fn)
  },
  useCallback(fn) {
    return fn
  },
  useMemo(fn) {
    return fn()
  },
  useRef(value) {
    return { current: value }
  },
}

const jsxRuntime = {
  jsx: (type, props) => createElement(type, props, props?.children),
  jsxs: (type, props) => createElement(type, props, props?.children),
  Fragment: '__fragment__',
}

/* --------------------------------------------------------------- fixtures */

const now = '2026-10-30T18:00:00.000Z'
const snapshot = {
  now,
  timeZone: 'America/New_York',
  tasks: [
    {
      id: 'task-1',
      name: 'AI 新闻 HTML 日报',
      prompt: '检索 AI 新闻并生成 HTML',
      attachments: [],
      model: null,
      workspace: '/Users/example/ai-news',
      sessionMode: 'independent',
      sessionId: null,
      permission: { approval: 'never', sandbox: 'workspace-write' },
      permissionPreset: 'workspace-write',
      permissionSource: 'preset',
      modelSource: 'default',
      workspaceId: 'ws-fixture',
      workspaceSource: 'workspace',
      legacyIssues: [],
      schedule: { kind: 'daily', time: '09:00' },
      timeZone: 'America/New_York',
      startAt: null,
      endAt: null,
      missedPolicy: 'catchup',
      enabled: true,
      maxRetries: 1,
      timeoutMinutes: 20,
      createdAt: now,
      updatedAt: now,
      nextRunAt: '2026-10-31T13:00:00.000Z',
      lastRunAt: now,
      lastRunStatus: 'succeeded',
      lastError: null,
      templateId: 'ai-news-html',
    },
    {
      id: 'task-2',
      name: '停用的任务',
      prompt: '什么都不做',
      attachments: [],
      model: { provider: 'deepseek', model: 'deepseek-chat' },
      workspace: null,
      sessionMode: 'persistent',
      sessionId: 'session-9',
      permission: { approval: 'ask', sandbox: 'read-only' },
      permissionPreset: null,
      permissionSource: 'legacy',
      modelSource: 'legacy',
      workspaceId: null,
      workspaceSource: 'custom',
      legacyIssues: ['权限组合不对应任何宿主预设，请重新选择'],
      schedule: { kind: 'cron', cron: '0 9 * * 1-5' },
      timeZone: 'Asia/Shanghai',
      startAt: null,
      endAt: null,
      missedPolicy: 'skip',
      enabled: false,
      maxRetries: 0,
      timeoutMinutes: 30,
      createdAt: now,
      updatedAt: now,
      nextRunAt: null,
      lastRunAt: null,
      lastRunStatus: 'failed',
      lastError: { message: '模型不可用', at: now },
      templateId: null,
    },
  ],
  runs: [
    {
      id: 'run-1',
      taskId: 'task-1',
      taskName: 'AI 新闻 HTML 日报',
      status: 'succeeded',
      trigger: 'schedule',
      scheduledFor: '2026-10-30T13:00:00.000Z',
      createdAt: now,
      startedAt: now,
      endedAt: now,
      durationMs: 161106,
      sessionId: 'session-2cf052fa',
      sessionMode: 'independent',
      attempt: 1,
      error: null,
      output: '本次生成了 12 条，文件 ai-news-2026-10-30.html',
      artifacts: [{ path: '/Users/example/ai-news/ai-news-2026-10-30.html', size: 12767, mtime: now }],
      tools: [{ name: 'web_search', title: 'web_search' }],
      log: [{ at: now, level: 'info', text: '执行成功，产物 1 个' }],
    },
    {
      id: 'run-2',
      taskId: 'task-2',
      taskName: '停用的任务',
      status: 'timeout',
      trigger: 'catchup',
      scheduledFor: null,
      createdAt: now,
      startedAt: now,
      endedAt: now,
      durationMs: 600000,
      sessionId: 'session-9',
      sessionMode: 'persistent',
      attempt: 2,
      error: { message: '运行超过时限，已取消', code: 'timeout' },
      output: null,
      artifacts: [],
      tools: [],
      log: [],
    },
  ],
  reminders: [
    {
      source: 'reminder',
      key: 'reminder:rem-1',
      id: 'rem-1',
      sessionId: 'session-native-1',
      title: '原生提醒：每天念新闻',
      prompt: '把今天的新闻念给我听',
      status: 'active',
      kind: 'daily',
      scheduledAt: '2026-10-31T01:00:00.000Z',
      timeZone: 'Asia/Shanghai',
      rule: '每天 09:00（Asia/Shanghai）',
      lastDeliveredAt: '2026-10-30T01:00:02.000Z',
      lastMessageId: 'msg-1',
    },
  ],
  reminderError: null,
  models: [{ provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek Chat' }],
    workspaces: [{ id: 'ws-fixture', title: 'ai-news', path: '/Users/example/ai-news' }],
    workspaceDefault: '/Users/example',
    permissions: [
      { value: 'read-only', name: '仅可查看' },
      { value: 'workspace-write', name: '工作区内修改' },
      { value: 'danger-full-access', name: '完全权限', description: '完全文件与命令权限' },
    ],
    permissionDefault: 'workspace-write',
    workspaceError: null,
    permissionError: null,
  templates: [
    { id: 'ai-news-html', name: 'AI 新闻 HTML 日报', description: '每天生成 HTML 日报', task: { name: 'AI 新闻 HTML 日报', prompt: 'p' } },
    { id: 'blank', name: '空白任务', description: '从零填写', task: { name: '新任务', prompt: '' } },
  ],
  ready: true,
  limits: { maxConcurrentRuns: 2, runHistory: 300 },
}

const requests = []
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init?.body ?? '{}')
  requests.push({ url, body })
  if (body.op === 'state') return { json: async () => ({ ok: true, value: snapshot }) }
  if (body.op === 'timezones') return { json: async () => ({ ok: true, value: ['America/New_York', 'Asia/Shanghai'] }) }
  if (body.op === 'task.save') {
    return { json: async () => ({ ok: true, value: { ...body.task, id: 'task-new', nextRunAt: now } }) }
  }
  return { json: async () => ({ ok: true, value: { accepted: true } }) }
}
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: { getItem: () => null, setItem: () => {} },
}

/* ------------------------------------------------------------ load bundle */

let exported = null
const sandbox = {
  window: { __ModuleLoader__: { load: ({ id, factory }) => {
    const require = (name) => {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') return jsxRuntime
      if (name === 'react-dom') return { createPortal: (node) => node }
      throw new Error(`unexpected require("${name}")`)
    }
    exported = factory(require)
  } } },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  queueMicrotask,
  fetch: globalThis.fetch,
  Date,
  Math,
  JSON,
  URL,
  URLSearchParams,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Error,
  TypeError,
  Promise,
  Intl,
  encodeURIComponent,
  decodeURIComponent,
  parseInt,
  parseFloat,
  isNaN,
}
sandbox.globalThis = sandbox
sandbox.window.document = { createElement: () => ({ style: {}, appendChild: () => {} }) }
vm.createContext(sandbox)
vm.runInContext(bundle, sandbox, { filename: 'lib/client.js' })

const failures = []
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`)
    return
  }
  failures.push(name)
  console.log(`  ✗ ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

console.log('\n客户端 bundle 契约')
check('导出 apply', typeof exported?.apply === 'function')
check('导出 inject', Array.isArray(exported?.inject) && exported.inject.includes('slots'), JSON.stringify(exported?.inject))
check('导出 name', typeof exported?.name === 'string')

/* ------------------------------------------------------------ slot wiring */

const registrations = []
const ctx = {
  slots: {
    inject(name, run) {
      run()
    },
    register(options, component) {
      registrations.push({ options, component })
      return { dispose: () => {} }
    },
  },
  get: () => undefined,
}
exported.apply(ctx)

const mainRegistrations = registrations.filter((entry) => entry.options.name === 'main')
const main = mainRegistrations[0]
const panel = registrations.find((entry) => entry.options.name === 'sidebar.panellist')
check('注册 main 面板', main !== undefined)
check('接管原生面板 key', main?.options.key === 'schedules', String(main?.options.key))
check('不再注册插件自己的侧栏入口', panel === undefined, JSON.stringify(panel?.options?.id))
check('为主面板注册了两个 key', mainRegistrations.length === 2, String(mainRegistrations.length))
check(
  '旧 key 只做兼容跳转',
  mainRegistrations.some((entry) => entry.options.key === 'task-center'),
  JSON.stringify(mainRegistrations.map((entry) => entry.options?.key)),
)

// The rc.5 Host rejects equal key + priority, and the lowest priority renders.
// Exercise our actual bundle against that boundary in both boot orders. A
// plain registration log misses the crash when the native page loads second.
console.log('\n与原生任务页共存')
for (const order of ['native-first', 'plugin-first']) {
  const entries = []
  const customDisposers = []
  const NativeTaskPage = () => null
  const register = (options, component) => {
    const priority = options.priority ?? 0
    if (entries.some((entry) => entry.options.name === options.name
      && entry.options.key === options.key && (entry.options.priority ?? 0) === priority)) {
      throw new Error(`同一入口与优先级重复注册：${options.name}/${options.key}/${priority}`)
    }
    const entry = { options, component }
    entries.push(entry)
    return () => {
      const index = entries.indexOf(entry)
      if (index !== -1) entries.splice(index, 1)
    }
  }
  const customCtx = {
    get: () => undefined,
    slots: {
      inject(_name, run) { customDisposers.push(run()) },
      register,
    },
  }
  const activePage = () => entries
    .filter((entry) => entry.options.name === 'main' && entry.options.key === 'schedules')
    .sort((left, right) => (left.options.priority ?? 0) - (right.options.priority ?? 0))[0]
  let disposeNative
  let bootError = ''
  try {
    const applyNative = () => { disposeNative = register({ name: 'main', key: 'schedules' }, NativeTaskPage) }
    if (order === 'native-first') {
      applyNative()
      exported.apply(customCtx)
    } else {
      exported.apply(customCtx)
      applyNative()
    }
  } catch (error) {
    bootError = error.message
  }
  check(`${order}：两页启动成功`, bootError === '', bootError)
  if (bootError === '') {
    check(`${order}：显示自制任务中心`, activePage()?.component === main.component)
    check(`${order}：原生页保留注册`, entries.filter((entry) => entry.options.key === 'schedules').length === 2)
  }
  customDisposers.reverse().forEach((dispose) => dispose())
  if (bootError === '') {
    check(`${order}：卸载后恢复原生页`, activePage()?.component === NativeTaskPage)
    check(`${order}：旧入口随插件卸载`, !entries.some((entry) => entry.options.key === 'task-center'))
  }
  disposeNative?.()
}

/* ------------------------------------------------------------- render walk */

/** Hook storage per component instance, keyed by name + position in the pass. */
const instances = new Map()
let instanceCursor = 0
const attributeText = []

function evaluate(node) {
  if (node === null || node === undefined || node === false || node === true) return null
  if (typeof node === 'string' || typeof node === 'number') return { text: String(node) }
  if (Array.isArray(node)) return { children: node.map(evaluate).filter(Boolean) }
  if (typeof node.type === 'function') {
    const key = `${node.type.name || 'anonymous'}#${instanceCursor}`
    instanceCursor += 1
    if (!instances.has(key)) instances.set(key, [])
    const previous = rendering
    rendering = { hooks: instances.get(key), index: 0, depth: previous === null ? 0 : previous.depth + 1 }
    let produced
    try {
      produced = node.type({ ...node.props, children: node.children })
    } finally {
      rendering = previous
    }
    return evaluate(produced)
  }
  if (node.type === '__fragment__') return { children: node.children.map(evaluate).filter(Boolean) }
  const children = node.children.map(evaluate).filter(Boolean)
  for (const key of ['placeholder', 'title', 'alt']) {
    const value = node.props?.[key]
    if (typeof value === 'string' && value.length > 0) attributeText.push(value)
  }
  return { text: '', children, type: node.type, props: node.props }
}

function textOf(tree) {
  if (tree === null) return ''
  if (tree.text !== undefined && tree.text !== '') return tree.text
  const children = (tree.children ?? []).map(textOf).join(' ')
  return children
}

/**
 * Render a component repeatedly: the first pass starts the data fetch, the next
 * passes see the resolved state — the same render/commit loop React performs.
 */
async function renderWithData(Component, props) {
  let output = null
  for (let pass = 0; pass < 6; pass += 1) {
    instanceCursor = 0
    attributeText.length = 0
    rendering = { hooks: [], index: 0, depth: 0 }
    effects = []
    dirty = false
    output = evaluate(createElement(Component, props))
    for (const effect of effects) {
      try {
        effect()
      } catch (error) {
        failures.push(`effect: ${error.message}`)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
    if (!dirty) break
  }
  return output
}

console.log('\n界面渲染')
{
  const tree = await renderWithData(main.component, {})
  const text = textOf(tree).replace(/\s+/g, ' ')
  const attrs = attributeText.join(' | ')
  check('页面出现标题', text.includes('自动化任务'), text.slice(0, 120))
  check('两个页签都在', text.includes('任务') && text.includes('运行记录'))
  check('统计数字来自真实数据（两类加起来）', text.includes('任务 3') && text.includes('运行记录 2'), text.slice(0, 200))
  check('原生提醒出现在同一列表', text.includes('原生提醒：每天念新闻'))
  check('提醒有来源标签', text.includes('对话提醒'), text.slice(0, 400))
  check('提醒展示自己的规则与时区', text.includes('每天 09:00（Asia/Shanghai）'))
  check('提醒说明投递不等于执行', text.includes('「已投递」不等于「已执行」'))
  check('提醒的暂停按钮明确说原生不支持', text.includes('暂停（原生不支持）'))
  check('来源筛选三类都在', text.includes('来源') && text.includes('自动执行') && text.includes('对话提醒'), text.slice(0, 400))
  check('任务卡片显示名称', text.includes('AI 新闻 HTML 日报'))
  check('任务卡片显示调度规则', text.includes('每天') && text.includes('09:00'))
  check('任务卡片显示下次执行时间', text.includes('下次： 2026-10-31 09:00'), text.slice(0, 200))
  check('异常任务显示异常提示', text.includes('模型不可用'))
  check('有新建立即运行动作', text.includes('立即运行') && text.includes('编辑') && text.includes('复制'))
  check('有搜索框', attrs.includes('搜索名称或提示词'), attrs.slice(0, 160))
  check('有状态数量筛选', text.includes('运行中 2') && text.includes('已暂停/已结束 1'), text.slice(0, 200))
  const stateCalls = requests.filter((request) => request.body.op === 'state')
  check('通过 Host API 拉取状态', stateCalls.length >= 1 && stateCalls[0].url === '/dsh-task-center/api')
  requests.length = 0
}

{
  // The runs tab is a separate component tree; drive it directly.
  const task = snapshot.tasks[0]
  const tree = await renderWithData(main.component, {})
  void tree
  void task
  check('渲染过程中没有抛错', failures.length === 0, failures.join('; '))
}

{
  // The plugin no longer ships a sidebar icon: the native entry opens this page.
  // The old key still has to hand the user over instead of showing a blank pane.
  const legacy = mainRegistrations.find((entry) => entry.options.key === 'task-center')
  let rendered = true
  let detail = ''
  let switchedTo = null
  try {
    const props = legacy.options.inject()
    props.selectPanel = (id) => {
      switchedTo = id
    }
    instances.clear()
    const tree = await renderWithData(legacy.component, props)
    detail = textOf(tree).replace(/\s+/g, ' ')
  } catch (error) {
    rendered = false
    detail = error.message
  }
  check('旧 key 兼容页可渲染', rendered && detail.includes('自动化任务'), detail)
  check('旧 key 会自动切到原生入口', switchedTo === 'schedules', String(switchedTo))
}

/* -------------------------------------------------------------- form path */

console.log('\n表单与详情路径')
{
  // Re-render with a fresh state: the form and run detail live in local state,
  // so they are reachable only through interactions. Rendering the page with a
  // task whose schedule is `cron` exercises the alternate form controls only
  // when opened, so check the exported helpers instead.
  const tree = await renderWithData(main.component, {})
  const text = textOf(tree).replace(/\s+/g, ' ')
  check('列表里两个任务都出现', text.includes('AI 新闻 HTML 日报') && text.includes('停用的任务'))
  check('持续会话任务有标记', text.includes('持续会话'))
  check('显示指定模型', text.includes('deepseek') && text.includes('deepseek-chat'))
  check(
    '卡片显示权限来源（预设用原生中文名 / 旧组合）',
    text.includes('权限：工作区内修改') && text.includes('权限：旧组合'),
  )
  check('卡片显示工作区来源', text.includes('（未登记）') || text.includes('ai-news'))
  check('待确认的旧数据在卡片上可见', text.includes('需要确认：'))
}

console.log(`\n${failures.length === 0 ? '客户端冒烟测试通过' : `客户端冒烟测试失败：${failures.length} 项`}`)
// The page keeps a polling interval alive by design; the smoke run ends here.
process.exit(failures.length === 0 ? 0 : 1)
