/**
 * Built-in task templates. Each one is a real, runnable task definition:
 * the AI-news template is the acceptance scenario (daily 09:00 in the user's
 * zone, search the web, write a dated HTML brief into the chosen folder).
 */

import type { TaskTemplate } from '../shared/types.ts'

const AI_NEWS_PROMPT = [
  '请生成今天的「AI 新闻 HTML 日报」。',
  '',
  '要求：',
  '1. 使用 web_search 工具检索最近 24 小时的 AI 行业新闻，至少检索 3 个不同角度的关键词（例如大模型发布、AI 产品、开源模型、行业投融资）。',
  '2. 只保留确有来源链接的条目，按重要性排序，挑选 8–12 条。',
  '3. 为每条生成：一句话摘要、来源名称、可直接点击的来源链接、发布时间。',
  '4. 输出为一个自包含的 HTML 文件，文件名 `ai-news-<YYYY-MM-DD>.html`，写在当前工作文件夹根目录。页面要求：中文字体友好、卡片式布局、顶部显示生成日期与条目数量、每条包含序号/标题/摘要/来源链接；不引用任何外部 CSS 或 JS。',
  '5. 页面底部列出本次检索使用的关键词。',
  '6. 完成后，把本次收录的条目标题与链接追加记录到跨次数据目录的 `seen.json`，下次运行先读取它，跳过已经收录过的条目，避免重复。',
  '',
  '完成后用一句话说明本次生成了多少条、文件路径是什么。',
].join('\n')

export const TEMPLATES: TaskTemplate[] = [
  {
    id: 'ai-news-html',
    name: 'AI 新闻 HTML 日报',
    description: '每天在任务时区的固定时间检索 AI 新闻，生成带日期、摘要、来源链接的 HTML 日报文件。',
    task: {
      name: 'AI 新闻 HTML 日报',
      prompt: AI_NEWS_PROMPT,
      schedule: { kind: 'daily', time: '09:00' },
      sessionMode: 'independent',
      missedPolicy: 'catchup',
      maxRetries: 1,
      timeoutMinutes: 20,
      permission: { approval: 'never', sandbox: 'workspace-write' },
    },
  },
  {
    id: 'folder-weekly-report',
    name: '工作文件夹周报',
    description: '每周固定时间扫描指定文件夹的近期改动，生成一份 Markdown 周报。',
    task: {
      name: '工作文件夹周报',
      prompt: [
        '请为当前工作文件夹生成一份周报。',
        '',
        '要求：',
        '1. 用 glob/grep/read 浏览当前文件夹里最近 7 天改动过的文件，理解它们在做什么。',
        '2. 输出 `weekly-<YYYY-MM-DD>.md`，包含：本周改动概览、主要模块进展、待办与风险、下一步建议。',
        '3. 只写事实，不臆测没有依据的内容；引用具体文件路径。',
      ].join('\n'),
      schedule: { kind: 'weekly', time: '18:00', weekdays: [5] },
      sessionMode: 'persistent',
      missedPolicy: 'skip',
      maxRetries: 0,
      timeoutMinutes: 30,
      permission: { approval: 'never', sandbox: 'workspace-write' },
    },
  },
  {
    id: 'blank',
    name: '空白任务',
    description: '从零填写提示词与调度规则。',
    task: {
      name: '新任务',
      prompt: '',
      schedule: { kind: 'daily', time: '09:00' },
      sessionMode: 'independent',
      missedPolicy: 'catchup',
      maxRetries: 1,
      timeoutMinutes: 20,
      permission: { approval: 'never', sandbox: 'workspace-write' },
    },
  },
]

export function findTemplate(id: string | null | undefined): TaskTemplate | null {
  if (id === null || id === undefined) return null
  return TEMPLATES.find((entry) => entry.id === id) ?? null
}
