// src/index.ts
import { homedir } from "node:os";
import { join as join5 } from "node:path";

// src/host/api.ts
import { createReadStream, realpathSync, statSync as statSync2 } from "node:fs";
import { extname, join as join3, resolve as resolve3, sep as sep2 } from "node:path";

// src/host/engine.ts
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";

// src/host/artifacts.ts
import { readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  ".next",
  ".cache",
  ".venv",
  "__pycache__"
]);
function scanArtifacts(root, options) {
  const maxDepth = options.maxDepth ?? 3;
  const maxFiles = options.maxFiles ?? 500;
  const found = [];
  const since = options.sinceMs - 1e3;
  const excluded = (options.exclude ?? []).map((entry) => resolve(entry));
  const walk = (dir, depth) => {
    if (depth > maxDepth || found.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= maxFiles) return;
      if (entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".") || entry.name === "state.json") continue;
      const full = join(dir, entry.name);
      if (excluded.some((prefix) => full === prefix || full.startsWith(`${prefix}${sep}`))) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.mtimeMs < since) continue;
      found.push({
        path: full,
        size: stat.size,
        mtime: new Date(stat.mtimeMs).toISOString()
      });
    }
  };
  walk(root, 0);
  found.sort((left, right) => right.mtime.localeCompare(left.mtime));
  return found;
}

// src/host/templates.ts
var AI_NEWS_PROMPT = [
  "\u8BF7\u751F\u6210\u4ECA\u5929\u7684\u300CAI \u65B0\u95FB HTML \u65E5\u62A5\u300D\u3002",
  "",
  "\u8981\u6C42\uFF1A",
  "1. \u4F7F\u7528 web_search \u5DE5\u5177\u68C0\u7D22\u6700\u8FD1 24 \u5C0F\u65F6\u7684 AI \u884C\u4E1A\u65B0\u95FB\uFF0C\u81F3\u5C11\u68C0\u7D22 3 \u4E2A\u4E0D\u540C\u89D2\u5EA6\u7684\u5173\u952E\u8BCD\uFF08\u4F8B\u5982\u5927\u6A21\u578B\u53D1\u5E03\u3001AI \u4EA7\u54C1\u3001\u5F00\u6E90\u6A21\u578B\u3001\u884C\u4E1A\u6295\u878D\u8D44\uFF09\u3002",
  "2. \u53EA\u4FDD\u7559\u786E\u6709\u6765\u6E90\u94FE\u63A5\u7684\u6761\u76EE\uFF0C\u6309\u91CD\u8981\u6027\u6392\u5E8F\uFF0C\u6311\u9009 8\u201312 \u6761\u3002",
  "3. \u4E3A\u6BCF\u6761\u751F\u6210\uFF1A\u4E00\u53E5\u8BDD\u6458\u8981\u3001\u6765\u6E90\u540D\u79F0\u3001\u53EF\u76F4\u63A5\u70B9\u51FB\u7684\u6765\u6E90\u94FE\u63A5\u3001\u53D1\u5E03\u65F6\u95F4\u3002",
  "4. \u8F93\u51FA\u4E3A\u4E00\u4E2A\u81EA\u5305\u542B\u7684 HTML \u6587\u4EF6\uFF0C\u6587\u4EF6\u540D `ai-news-<YYYY-MM-DD>.html`\uFF0C\u5199\u5728\u5F53\u524D\u5DE5\u4F5C\u6587\u4EF6\u5939\u6839\u76EE\u5F55\u3002\u9875\u9762\u8981\u6C42\uFF1A\u4E2D\u6587\u5B57\u4F53\u53CB\u597D\u3001\u5361\u7247\u5F0F\u5E03\u5C40\u3001\u9876\u90E8\u663E\u793A\u751F\u6210\u65E5\u671F\u4E0E\u6761\u76EE\u6570\u91CF\u3001\u6BCF\u6761\u5305\u542B\u5E8F\u53F7/\u6807\u9898/\u6458\u8981/\u6765\u6E90\u94FE\u63A5\uFF1B\u4E0D\u5F15\u7528\u4EFB\u4F55\u5916\u90E8 CSS \u6216 JS\u3002",
  "5. \u9875\u9762\u5E95\u90E8\u5217\u51FA\u672C\u6B21\u68C0\u7D22\u4F7F\u7528\u7684\u5173\u952E\u8BCD\u3002",
  "6. \u5B8C\u6210\u540E\uFF0C\u628A\u672C\u6B21\u6536\u5F55\u7684\u6761\u76EE\u6807\u9898\u4E0E\u94FE\u63A5\u8FFD\u52A0\u8BB0\u5F55\u5230\u8DE8\u6B21\u6570\u636E\u76EE\u5F55\u7684 `seen.json`\uFF0C\u4E0B\u6B21\u8FD0\u884C\u5148\u8BFB\u53D6\u5B83\uFF0C\u8DF3\u8FC7\u5DF2\u7ECF\u6536\u5F55\u8FC7\u7684\u6761\u76EE\uFF0C\u907F\u514D\u91CD\u590D\u3002",
  "",
  "\u5B8C\u6210\u540E\u7528\u4E00\u53E5\u8BDD\u8BF4\u660E\u672C\u6B21\u751F\u6210\u4E86\u591A\u5C11\u6761\u3001\u6587\u4EF6\u8DEF\u5F84\u662F\u4EC0\u4E48\u3002"
].join("\n");
var TEMPLATES = [
  {
    id: "ai-news-html",
    name: "AI \u65B0\u95FB HTML \u65E5\u62A5",
    description: "\u6BCF\u5929\u5728\u4EFB\u52A1\u65F6\u533A\u7684\u56FA\u5B9A\u65F6\u95F4\u68C0\u7D22 AI \u65B0\u95FB\uFF0C\u751F\u6210\u5E26\u65E5\u671F\u3001\u6458\u8981\u3001\u6765\u6E90\u94FE\u63A5\u7684 HTML \u65E5\u62A5\u6587\u4EF6\u3002",
    task: {
      name: "AI \u65B0\u95FB HTML \u65E5\u62A5",
      prompt: AI_NEWS_PROMPT,
      schedule: { kind: "daily", time: "09:00" },
      sessionMode: "independent",
      missedPolicy: "catchup",
      maxRetries: 1,
      timeoutMinutes: 20,
      permission: { approval: "never", sandbox: "workspace-write" }
    }
  },
  {
    id: "folder-weekly-report",
    name: "\u5DE5\u4F5C\u6587\u4EF6\u5939\u5468\u62A5",
    description: "\u6BCF\u5468\u56FA\u5B9A\u65F6\u95F4\u626B\u63CF\u6307\u5B9A\u6587\u4EF6\u5939\u7684\u8FD1\u671F\u6539\u52A8\uFF0C\u751F\u6210\u4E00\u4EFD Markdown \u5468\u62A5\u3002",
    task: {
      name: "\u5DE5\u4F5C\u6587\u4EF6\u5939\u5468\u62A5",
      prompt: [
        "\u8BF7\u4E3A\u5F53\u524D\u5DE5\u4F5C\u6587\u4EF6\u5939\u751F\u6210\u4E00\u4EFD\u5468\u62A5\u3002",
        "",
        "\u8981\u6C42\uFF1A",
        "1. \u7528 glob/grep/read \u6D4F\u89C8\u5F53\u524D\u6587\u4EF6\u5939\u91CC\u6700\u8FD1 7 \u5929\u6539\u52A8\u8FC7\u7684\u6587\u4EF6\uFF0C\u7406\u89E3\u5B83\u4EEC\u5728\u505A\u4EC0\u4E48\u3002",
        "2. \u8F93\u51FA `weekly-<YYYY-MM-DD>.md`\uFF0C\u5305\u542B\uFF1A\u672C\u5468\u6539\u52A8\u6982\u89C8\u3001\u4E3B\u8981\u6A21\u5757\u8FDB\u5C55\u3001\u5F85\u529E\u4E0E\u98CE\u9669\u3001\u4E0B\u4E00\u6B65\u5EFA\u8BAE\u3002",
        "3. \u53EA\u5199\u4E8B\u5B9E\uFF0C\u4E0D\u81C6\u6D4B\u6CA1\u6709\u4F9D\u636E\u7684\u5185\u5BB9\uFF1B\u5F15\u7528\u5177\u4F53\u6587\u4EF6\u8DEF\u5F84\u3002"
      ].join("\n"),
      schedule: { kind: "weekly", time: "18:00", weekdays: [5] },
      sessionMode: "persistent",
      missedPolicy: "skip",
      maxRetries: 0,
      timeoutMinutes: 30,
      permission: { approval: "never", sandbox: "workspace-write" }
    }
  },
  {
    id: "blank",
    name: "\u7A7A\u767D\u4EFB\u52A1",
    description: "\u4ECE\u96F6\u586B\u5199\u63D0\u793A\u8BCD\u4E0E\u8C03\u5EA6\u89C4\u5219\u3002",
    task: {
      name: "\u65B0\u4EFB\u52A1",
      prompt: "",
      schedule: { kind: "daily", time: "09:00" },
      sessionMode: "independent",
      missedPolicy: "catchup",
      maxRetries: 1,
      timeoutMinutes: 20,
      permission: { approval: "never", sandbox: "workspace-write" }
    }
  }
];

// src/host/time.ts
var MINUTE = 6e4;
var DAY_SCAN_LIMIT = 5 * 366;
var WEEKDAY_INDEX = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7
};
var formatterCache = /* @__PURE__ */ new Map();
function formatter(timeZone) {
  let cached = formatterCache.get(timeZone);
  if (cached === void 0) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short"
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}
function assertTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length === 0) throw new Error("time zone is required");
  if (timeZone === "UTC") return timeZone;
  try {
    formatter(timeZone);
  } catch {
    throw new Error(`"${timeZone}" is not a known IANA time zone`);
  }
  return timeZone;
}
function listTimeZones() {
  const intl = Intl;
  const zones = typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : [];
  return ["UTC", ...zones.filter((zone) => zone !== "UTC")];
}
function wallParts(instantMs, timeZone) {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs));
  const field = {};
  for (const part of parts) field[part.type] = part.value;
  const hour = Number(field.hour) % 24;
  return {
    year: Number(field.year),
    month: Number(field.month),
    day: Number(field.day),
    hour,
    minute: Number(field.minute),
    weekday: WEEKDAY_INDEX[field.weekday ?? "Mon"] ?? 1
  };
}
function offsetAt(instantMs, timeZone) {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs));
  const field = {};
  for (const part of parts) field[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(field.year),
    Number(field.month) - 1,
    Number(field.day),
    Number(field.hour) % 24,
    Number(field.minute),
    Number(field.second)
  );
  return asUtc - Math.floor(instantMs / 1e3) * 1e3;
}
function wallToInstant(year, month, day, hour, minute, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  const candidates = [];
  let guess = target - offsetAt(target, timeZone);
  for (let pass = 0; pass < 3; pass += 1) guess = target - offsetAt(guess, timeZone);
  for (const shift of [0, -MINUTE * 60, MINUTE * 60]) {
    const candidate = guess + shift;
    const parts = wallParts(candidate, timeZone);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}
function parseClock(value, label) {
  const text = (value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (match === null) throw new Error(`${label} must be HH:mm, got "${text}"`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`${label} must be a valid time of day, got "${text}"`);
  return { hour, minute };
}
var CRON_ALIASES = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *"
};
function parseField(raw, label, min, max, normalize) {
  const values = /* @__PURE__ */ new Set();
  for (const chunk of raw.split(",")) {
    const piece = chunk.trim();
    if (piece.length === 0) throw new Error(`cron ${label} field has an empty term`);
    const [rangeText, stepText] = piece.split("/");
    const step = stepText === void 0 ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`cron ${label} step must be a positive integer`);
    let start;
    let end;
    if (rangeText === "*") {
      start = min;
      end = max;
    } else if (rangeText !== void 0 && rangeText.includes("-")) {
      const [from, to] = rangeText.split("-");
      start = Number(from);
      end = Number(to);
    } else {
      start = Number(rangeText);
      end = stepText === void 0 ? start : max;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) throw new Error(`cron ${label} term "${piece}" is not numeric`);
    if (start < min || end > max || start > end) throw new Error(`cron ${label} term "${piece}" is outside ${min}-${max}`);
    for (let value = start; value <= end; value += step) values.add(normalize === void 0 ? value : normalize(value));
  }
  return values;
}
function parseCron(expression) {
  const trimmed = expression.trim().replace(/\s+/g, " ");
  const expanded = CRON_ALIASES[trimmed.toLowerCase()] ?? trimmed;
  const fields = expanded.split(" ");
  if (fields.length !== 5) throw new Error(`cron needs five fields, got ${fields.length} in "${expression}"`);
  const [minuteText, hourText, domText, monthText, dowText] = fields;
  return {
    expression: trimmed,
    minutes: parseField(minuteText, "minute", 0, 59),
    hours: parseField(hourText, "hour", 0, 23),
    daysOfMonth: parseField(domText, "day-of-month", 1, 31),
    months: parseField(monthText, "month", 1, 12),
    daysOfWeek: parseField(dowText, "day-of-week", 0, 7, (value) => value === 0 ? 7 : value),
    dayOr: domText !== "*" && dowText !== "*"
  };
}
function cronDayMatches(fields, parts) {
  if (!fields.months.has(parts.month)) return false;
  const dayMatch = fields.daysOfMonth.has(parts.day);
  const weekMatch = fields.daysOfWeek.has(parts.weekday);
  return fields.dayOr ? dayMatch || weekMatch : dayMatch && weekMatch;
}
function patternFor(spec) {
  switch (spec.kind) {
    case "daily": {
      const { hour, minute } = parseClock(spec.time, "daily time");
      return { dayMatches: () => true, minutesOfDay: [hour * 60 + minute] };
    }
    case "weekly": {
      const { hour, minute } = parseClock(spec.time, "weekly time");
      const days = new Set((spec.weekdays ?? []).map((day) => day === 0 ? 7 : day));
      if (days.size === 0) throw new Error("weekly schedule needs at least one weekday");
      return { dayMatches: (parts) => days.has(parts.weekday), minutesOfDay: [hour * 60 + minute] };
    }
    case "cron": {
      const fields = parseCron(spec.cron ?? "");
      const slots = [];
      for (const hour of [...fields.hours].sort((a, b) => a - b)) {
        for (const minute of [...fields.minutes].sort((a, b) => a - b)) slots.push(hour * 60 + minute);
      }
      slots.sort((a, b) => a - b);
      return { dayMatches: (parts) => cronDayMatches(fields, parts), minutesOfDay: slots };
    }
    default:
      return null;
  }
}
function shiftDay(year, month, day, delta) {
  const moved = new Date(Date.UTC(year, month - 1, day));
  moved.setUTCDate(moved.getUTCDate() + delta);
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}
function searchWall(fromMs, timeZone, pattern, direction) {
  const start = wallParts(fromMs, timeZone);
  const slots = direction === 1 ? pattern.minutesOfDay : [...pattern.minutesOfDay].reverse();
  for (let offset = 0; offset <= DAY_SCAN_LIMIT; offset += 1) {
    const day = shiftDay(start.year, start.month, start.day, direction * offset);
    const weekday = isoWeekday(day.year, day.month, day.day);
    if (!pattern.dayMatches({ ...day, weekday })) continue;
    for (const slot of slots) {
      const instant = wallToInstant(day.year, day.month, day.day, Math.floor(slot / 60), slot % 60, timeZone);
      if (instant === null) continue;
      if (direction === 1 ? instant > fromMs : instant <= fromMs) return instant;
    }
  }
  return null;
}
function isoWeekday(year, month, day) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}
function nextOccurrence({ spec, timeZone, fromMs, anchorMs }) {
  assertTimeZone(timeZone);
  switch (spec.kind) {
    case "once": {
      const instant = spec.at === null || spec.at === void 0 ? Number.NaN : Date.parse(spec.at);
      if (!Number.isFinite(instant)) throw new Error("once schedule needs a valid date and time");
      return instant > fromMs ? instant : null;
    }
    case "interval": {
      const every = Math.floor(Number(spec.everyMinutes ?? 0));
      if (!Number.isFinite(every) || every < 1) throw new Error("interval schedule needs at least one minute");
      const anchor = anchorMs ?? fromMs;
      const stepMs = every * MINUTE;
      if (anchor > fromMs) return anchor;
      const elapsed = fromMs - anchor;
      return anchor + (Math.floor(elapsed / stepMs) + 1) * stepMs;
    }
    default: {
      const pattern = patternFor(spec);
      if (pattern === null) return null;
      return searchWall(fromMs, timeZone, pattern, 1);
    }
  }
}
function previousOccurrence({ spec, timeZone, atMs, anchorMs }) {
  assertTimeZone(timeZone);
  switch (spec.kind) {
    case "once": {
      const instant = spec.at === null || spec.at === void 0 ? Number.NaN : Date.parse(spec.at);
      if (!Number.isFinite(instant)) throw new Error("once schedule needs a valid date and time");
      return instant <= atMs ? instant : null;
    }
    case "interval": {
      const every = Math.floor(Number(spec.everyMinutes ?? 0));
      if (!Number.isFinite(every) || every < 1) throw new Error("interval schedule needs at least one minute");
      const anchor = anchorMs ?? atMs;
      const stepMs = every * MINUTE;
      if (anchor > atMs) return null;
      const steps = Math.floor((atMs - anchor) / stepMs);
      return anchor + steps * stepMs;
    }
    default: {
      const pattern = patternFor(spec);
      if (pattern === null) return null;
      return searchWall(atMs, timeZone, pattern, -1);
    }
  }
}
function withinWindow(instantMs, startAt, endAt) {
  if (startAt !== null && startAt !== void 0) {
    const start = Date.parse(startAt);
    if (Number.isFinite(start) && instantMs < start) return false;
  }
  if (endAt !== null && endAt !== void 0) {
    const end = Date.parse(endAt);
    if (Number.isFinite(end) && instantMs > end) return false;
  }
  return true;
}
var ISO_WEEKDAY_LABEL = ["\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D", "\u5468\u65E5"];
function describeSchedule(spec, timeZone) {
  const suffix = timeZone === "UTC" ? "UTC" : timeZone;
  switch (spec.kind) {
    case "once": {
      const instant = spec.at === null || spec.at === void 0 ? Number.NaN : Date.parse(spec.at);
      if (!Number.isFinite(instant)) return "\u5355\u6B21\u6267\u884C\uFF08\u65F6\u95F4\u672A\u8BBE\u7F6E\uFF09";
      const parts = wallParts(instant, timeZone);
      return `\u5355\u6B21 ${formatDate(parts)} ${pad(parts.hour)}:${pad(parts.minute)}\uFF08${suffix}\uFF09`;
    }
    case "interval": {
      const every = Math.floor(Number(spec.everyMinutes ?? 0));
      return `\u6BCF ${formatEvery(every)}\u6267\u884C\u4E00\u6B21`;
    }
    case "daily": {
      const clock = spec.time ?? "00:00";
      return `\u6BCF\u5929 ${clock}\uFF08${suffix}\uFF09`;
    }
    case "weekly": {
      const days = (spec.weekdays ?? []).slice().sort((a, b) => a - b).map((day) => ISO_WEEKDAY_LABEL[(day === 0 ? 7 : day) - 1]).join("\u3001");
      return `\u6BCF${days === "" ? "\u5468" : days} ${spec.time ?? "00:00"}\uFF08${suffix}\uFF09`;
    }
    case "cron":
      return `Cron ${spec.cron ?? ""}\uFF08${suffix}\uFF09`;
    default:
      return "\u672A\u8BBE\u7F6E";
  }
}
function formatEvery(minutes) {
  if (minutes % (60 * 24) === 0) return `${minutes / (60 * 24)} \u5929`;
  if (minutes % 60 === 0) return `${minutes / 60} \u5C0F\u65F6`;
  return `${minutes} \u5206\u949F`;
}
function formatDate(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
function pad(value) {
  return String(value).padStart(2, "0");
}
function formatInstant(instantMs, timeZone) {
  if (instantMs === null) return "\u2014";
  const parts = wallParts(instantMs, timeZone);
  return `${formatDate(parts)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}
function hostTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// src/host/engine.ts
var MAX_OUTPUT_CHARS = 4e3;
var MODEL_CACHE_MS = 6e4;
var TIMER_CEILING_MS = 3e4;
var RETRY_BACKOFF_MS = 6e4;
var TaskEngine = class {
  ctx;
  store;
  options;
  now;
  active = /* @__PURE__ */ new Map();
  activeByTask = /* @__PURE__ */ new Map();
  bySession = /* @__PURE__ */ new Map();
  queue = [];
  /** Triggers waiting for their task's active run to end (never dropped). */
  deferred = [];
  generation = 0;
  retries = /* @__PURE__ */ new Set();
  timer = null;
  listeners = /* @__PURE__ */ new Set();
  models = [];
  modelsAt = 0;
  started = false;
  disposed = false;
  stopListening = [];
  constructor(ctx, store, options) {
    this.ctx = ctx;
    this.store = store;
    this.options = options;
    this.now = options.clock ?? (() => Date.now());
  }
  /* ------------------------------------------------------------------ life */
  /** Wire host events, restore pending schedules, and fire any missed run. */
  async start() {
    if (this.started) return;
    this.started = true;
    this.generation += 1;
    this.stopListening.push(this.ctx.on("session/event", (session, event) => this.onSessionEvent(session, event)));
    try {
      await this.migrateLegacy();
    } catch (error) {
      this.log("error", `\u8FC1\u79FB\u65E7\u4EFB\u52A1\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7\uFF1A${error.message}`);
    }
    try {
      this.reconcileOrphans();
    } catch (error) {
      this.log("error", `\u6536\u5C3E\u4E0A\u6B21\u672A\u5B8C\u6210\u7684\u8FD0\u884C\u5931\u8D25\uFF1A${error.message}`);
    }
    this.arm();
    this.log("info", `\u4EFB\u52A1\u4E2D\u5FC3\u5DF2\u542F\u52A8\uFF1A${this.store.tasks.length} \u4E2A\u4EFB\u52A1\uFF0C${this.store.runs.length} \u6761\u8FD0\u884C\u8BB0\u5F55`);
    try {
      await this.tick();
    } catch (error) {
      this.log("error", `\u9996\u6B21\u6392\u671F\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7\uFF1A${error.message}`);
    }
  }
  dispose() {
    this.disposed = true;
    this.generation += 1;
    for (const off of this.stopListening.splice(0)) {
      try {
        off();
      } catch {
      }
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const handle2 of this.retries) clearTimeout(handle2);
    this.retries.clear();
    for (const run of this.active.values()) {
      if (run.timeout !== null) clearTimeout(run.timeout);
      if (run.cancelTimeout !== null) clearTimeout(run.cancelTimeout);
      if (run.sessionId !== "") {
        try {
          void Promise.resolve(this.ctx.sessionController?.cancel?.({ sessionId: run.sessionId })).catch(() => {
          });
        } catch {
        }
      }
    }
    this.active.clear();
    this.activeByTask.clear();
    this.bySession.clear();
    this.queue = [];
    this.deferred = [];
    this.listeners.clear();
  }
  /**
   * A fresh engine cannot own a run that a previous process started: nothing is
   * live anymore. Close those records honestly instead of leaving them
   * "running" forever, and drop whatever was still queued.
   */
  reconcileOrphans() {
    const nowIso = new Date(this.now()).toISOString();
    let touched = false;
    for (const run of this.store.runs) {
      if (run.status !== "queued" && run.status !== "running" && run.status !== "waiting-approval") continue;
      const startedMs = run.startedAt === null ? null : Date.parse(run.startedAt);
      run.status = "failed";
      run.endedAt = nowIso;
      run.durationMs = startedMs === null ? null : Math.max(0, this.now() - startedMs);
      run.error = { message: "\u5BBF\u4E3B\u5728\u6267\u884C\u8FC7\u7A0B\u4E2D\u9000\u51FA\u6216\u63D2\u4EF6\u88AB\u91CD\u8F7D\uFF0C\u672C\u6B21\u8FD0\u884C\u672A\u5B8C\u6210", code: "interrupted" };
      run.log.push({ at: nowIso, level: "error", text: "\u542F\u52A8\u65F6\u53D1\u73B0\u4E0A\u6B21\u8FD0\u884C\u6CA1\u6709\u7ED3\u5C40\uFF0C\u6807\u8BB0\u4E3A\u4E2D\u65AD" });
      if (startedMs !== null) {
        try {
          run.artifacts = scanArtifacts(this.workspaceOf(run.taskId), { sinceMs: startedMs, exclude: this.internalPaths() });
        } catch {
        }
      }
      touched = true;
    }
    this.queue = [];
    if (touched) {
      this.persist();
      this.notify();
      this.log("warn", "\u4E0A\u6B21\u9000\u51FA\u65F6\u6709\u8FD0\u884C\u6CA1\u6709\u7ED3\u5C40\uFF0C\u5DF2\u6309\u300C\u4E2D\u65AD\u300D\u6536\u5C3E");
    }
  }
  /** Paths that belong to the plugin itself rather than to a run's deliverables. */
  internalPaths() {
    return [join2(this.options.dataRoot, "state.json"), join2(this.options.dataRoot, "tasks")];
  }
  workspaceOf(taskId) {
    const task = this.store.tasks.find((entry) => entry.id === taskId);
    if (task === void 0) return this.options.dataRoot;
    try {
      return this.resolveWorkspace(task);
    } catch {
      return task.workspace ?? this.options.dataRoot;
    }
  }
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
      }
    }
  }
  log(level, text) {
    this.options.log(level, text);
  }
  persist() {
    if (this.disposed) return;
    try {
      this.store.flush();
    } catch (error) {
      this.log("error", `\u5199\u5165\u4EFB\u52A1\u5B58\u50A8\u5931\u8D25\uFF1A${error.message}`);
    }
  }
  /* -------------------------------------------------------------- snapshot */
  async snapshot() {
    const models = await this.refreshModels();
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
      ...this.hostCatalogs()
    };
  }
  /**
   * Workspace + permission catalogs the editor renders from. Each read is
   * isolated: a broken Host seam must not take the whole page down, it becomes
   * an inline retry hint instead.
   */
  hostCatalogs() {
    let workspaces = [];
    let workspaceDefault = null;
    let workspaceError = null;
    try {
      workspaces = this.workspaceList();
      const working = this.capability("workingDirectory");
      const fallback = working?.defaultDirectory;
      workspaceDefault = typeof fallback === "string" && fallback.length > 0 ? fallback : null;
    } catch (error) {
      workspaceError = `\u8BFB\u53D6\u5BBF\u4E3B\u5DE5\u4F5C\u533A\u5931\u8D25\uFF1A${error.message}`;
    }
    let permissions = [];
    let permissionDefault = null;
    let permissionError = null;
    try {
      const catalog = this.permissionCatalogUnsafe();
      permissions = catalog.options;
      permissionDefault = catalog.defaultPreset;
    } catch (error) {
      permissionError = `\u8BFB\u53D6\u5BBF\u4E3B\u6743\u9650\u9884\u8BBE\u5931\u8D25\uFF1A${error.message}`;
    }
    return { workspaces, workspaceDefault, permissions, permissionDefault, workspaceError, permissionError };
  }
  /**
   * Catalogues on their own, for the form: the page must be able to render the
   * workspace and permission pickers even while the rest of the snapshot loads.
   */
  catalogs() {
    const catalogs = this.hostCatalogs();
    return {
      workspaces: catalogs.workspaces,
      workspaceDefault: catalogs.workspaceDefault,
      permissions: catalogs.permissions,
      permissionDefault: catalogs.permissionDefault
    };
  }
  /**
   * Register a folder as a Host workspace (idempotent) and return its id, so a
   * task can bind to the registry instead of an unmanaged absolute path.
   */
  async registerWorkspace(path) {
    const registry = this.capability("workspaceRegistry");
    if (registry === void 0 || registry === null) {
      throw new Error("\u5BBF\u4E3B\u6CA1\u6709 workspaceRegistry \u670D\u52A1\uFF0C\u65E0\u6CD5\u767B\u8BB0\u5DE5\u4F5C\u533A");
    }
    const target = path.trim();
    if (target === "") throw new Error("\u5DE5\u4F5C\u533A\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A");
    let existing;
    if (typeof registry.resolveByPath === "function") existing = await registry.resolveByPath(target);
    if (existing !== void 0 && existing !== null && typeof existing.id === "string") {
      return { workspaceId: existing.id, path: String(existing.path ?? target) };
    }
    if (typeof registry.create !== "function") throw new Error("\u5BBF\u4E3B workspaceRegistry \u4E0D\u652F\u6301\u767B\u8BB0\u5DE5\u4F5C\u533A");
    let created;
    try {
      created = await registry.create(target);
    } catch (error) {
      throw new Error(`\u767B\u8BB0\u5DE5\u4F5C\u533A\u5931\u8D25\uFF1A${error.message}`);
    }
    if (created === void 0 || created === null || typeof created.id !== "string") {
      throw new Error("\u5BBF\u4E3B\u6CA1\u6709\u8FD4\u56DE\u5DE5\u4F5C\u533A id");
    }
    return { workspaceId: created.id, path: String(created.path ?? target) };
  }
  /**
   * The permission state a Task Session actually carries, read back from the
   * Host's own preset service — evidence for what the run really got.
   */
  async sessionPermission(sessionId) {
    const agent = await this.resolveLiveAgent(sessionId);
    const presets = this.capability("permissionPresets");
    if (presets === void 0 || presets === null) return { preset: null, state: null };
    const preset = typeof presets.current === "function" ? presets.current(agent?.session) : null;
    const state = typeof presets.permissionState === "function" ? presets.permissionState(agent?.session) : null;
    return { preset: preset === void 0 ? null : preset, state };
  }
  /** Registered Host workspaces, in registry order. Throws when the seam is broken. */
  workspaceList() {
    const registry = this.capability("workspaceRegistry");
    if (registry === void 0 || registry === null || typeof registry.list !== "function") {
      throw new Error("\u5BBF\u4E3B\u6CA1\u6709 workspaceRegistry \u670D\u52A1");
    }
    const items = registry.list();
    const listed = Array.isArray(items) ? items : [];
    return listed.map((item) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? item?.id ?? ""),
      path: String(item?.path ?? "")
    })).filter((item) => item.id.length > 0 && item.path.length > 0);
  }
  /** Native permission presets exactly as the Host publishes them. */
  permissionCatalog() {
    return this.permissionCatalogUnsafe();
  }
  permissionCatalogUnsafe() {
    const presets = this.capability("permissionPresets");
    if (presets === void 0 || presets === null || typeof presets.catalog !== "function") {
      throw new Error("\u5BBF\u4E3B\u6CA1\u6709 permissionPresets \u670D\u52A1");
    }
    const catalog = presets.catalog();
    const raw = Array.isArray(catalog?.options) ? catalog.options : [];
    const options = raw.map((option) => ({
      value: String(option?.value ?? ""),
      name: String(option?.name ?? option?.value ?? ""),
      ...typeof option?.description === "string" && option.description.length > 0 ? { description: option.description } : {}
    })).filter((option) => option.value.length > 0);
    const fallback = catalog?.defaultPreset;
    return { options, defaultPreset: typeof fallback === "string" && fallback.length > 0 ? fallback : null };
  }
  /**
   * Freeze the Host default model so a later change of that default cannot move
   * an existing task onto a different model.
   */
  defaultSelection() {
    const service = this.capability("agentDefaultModel");
    try {
      const current = service?.currentSelection?.();
      if (current === void 0 || current === null) return null;
      const provider = typeof current.provider === "string" ? current.provider.trim() : "";
      const model = typeof current.model === "string" ? current.model.trim() : "";
      if (provider.length === 0 || model.length === 0) return null;
      return {
        provider,
        model,
        reasoningEffort: typeof current.reasoningEffort === "string" && current.reasoningEffort.length > 0 ? current.reasoningEffort : null
      };
    } catch {
      return null;
    }
  }
  async refreshModels() {
    const fresh = this.now() - this.modelsAt < MODEL_CACHE_MS;
    if (fresh && this.models.length > 0) return this.models;
    try {
      const catalog = await this.ctx.sessionController?.modelCatalog?.();
      this.models = normalizeCatalog(catalog);
      this.modelsAt = this.now();
    } catch (error) {
      this.log("warn", `\u8BFB\u53D6\u6A21\u578B\u76EE\u5F55\u5931\u8D25\uFF1A${error.message}`);
    }
    return this.models;
  }
  /**
   * What the editor's catalog says right now, used to validate a save. A
   * failing seam yields `null` (= "cannot check"), never an empty allow-list
   * that would reject perfectly good ids.
   */
  taskDefaults() {
    let workspaceIds = null;
    try {
      workspaceIds = new Set(this.workspaceList().map((entry) => entry.id));
    } catch {
      workspaceIds = null;
    }
    let presets = null;
    const presetSpecs = {};
    try {
      const catalog = this.permissionCatalog();
      presets = catalog.options.map((option) => option.value);
      const service = this.capability("permissionPresets");
      for (const name2 of presets) {
        try {
          const spec = service?.resolve?.(name2);
          if (spec !== void 0 && spec !== null) {
            presetSpecs[name2] = { sandbox: String(spec.sandbox ?? ""), approval: String(spec.approval ?? "") };
          }
        } catch {
        }
      }
    } catch {
      presets = null;
    }
    return { model: this.defaultSelection(), workspaceIds, presets, presetSpecs };
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
  async migrateLegacy() {
    const defaults = this.taskDefaults();
    let changed = false;
    for (const task of this.store.tasks) {
      const issues = [];
      if (task.permissionPreset === null) {
        const pair = task.permission ?? { approval: "never", sandbox: "workspace-write" };
        const matched = defaults.presets === null ? null : defaults.presets.find((name2) => {
          const spec = defaults.presetSpecs[name2];
          return spec !== void 0 && spec.sandbox === pair.sandbox && spec.approval === pair.approval;
        }) ?? null;
        if (matched !== null) {
          task.permissionPreset = matched;
          task.permissionSource = "preset";
          changed = true;
        } else {
          task.permissionSource = "legacy";
          issues.push(`\u6743\u9650\u7EC4\u5408\uFF08\u6C99\u7BB1 ${pair.sandbox} / \u5BA1\u6279 ${pair.approval}\uFF09\u4E0D\u5BF9\u5E94\u4EFB\u4F55\u5BBF\u4E3B\u9884\u8BBE\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9`);
        }
      }
      if (task.workspaceId === null && task.workspace !== null && task.workspace.trim() !== "") {
        const registry = this.capability("workspaceRegistry");
        let found;
        try {
          found = await registry?.resolveByPath?.(task.workspace);
        } catch {
          found = void 0;
        }
        if (found !== void 0 && found !== null && typeof found.id === "string") {
          task.workspaceId = found.id;
          task.workspaceSource = "workspace";
          task.workspace = String(found.path ?? task.workspace);
          changed = true;
        } else {
          task.workspaceSource = "custom";
          issues.push(`\u5DE5\u4F5C\u6587\u4EF6\u5939\u662F\u539F\u59CB\u8DEF\u5F84 ${task.workspace}\uFF0C\u672A\u767B\u8BB0\u4E3A\u5BBF\u4E3B\u5DE5\u4F5C\u533A`);
        }
      } else if (task.workspaceId === null && (task.workspace === null || task.workspace.trim() === "")) {
        task.workspaceSource = "task-dir";
      }
      if (task.model === null) {
        task.modelSource = "legacy";
        issues.push("\u6A21\u578B\u672A\u56FA\u5316\uFF08\u8001\u4EFB\u52A1\uFF0C\u8FD0\u884C\u65F6\u8DDF\u968F\u5BBF\u4E3B\u9ED8\u8BA4\u6A21\u578B\uFF09");
      }
      if (JSON.stringify(task.legacyIssues ?? []) !== JSON.stringify(issues)) {
        task.legacyIssues = issues;
        changed = true;
      }
    }
    if (!changed) return;
    try {
      if (existsSync(this.store.file)) {
        copyFileSync(this.store.file, `${this.store.file}.pre-workspace-${this.now()}.bak`);
      }
    } catch (error) {
      this.log("warn", `\u8FC1\u79FB\u524D\u5907\u4EFD\u5931\u8D25\uFF08\u7EE7\u7EED\uFF0C\u6570\u636E\u672A\u6539\uFF09\uFF1A${error.message}`);
    }
    this.persist();
    this.notify();
    this.log("info", "\u5DF2\u6309\u5BBF\u4E3B\u5DE5\u4F5C\u533A\u4E0E\u6743\u9650\u9884\u8BBE\u8FC1\u79FB\u8001\u4EFB\u52A1\uFF1A\u884C\u4E3A\u4FDD\u6301\u4E0D\u53D8\uFF0C\u9700\u786E\u8BA4\u7684\u9879\u76EE\u5DF2\u6807\u5728\u5361\u7247\u7684\u63D0\u793A\u91CC");
  }
  /* ------------------------------------------------------------------ tasks */
  /** Validate + persist one task definition (create or update). */
  saveTask(input) {
    const existing = this.store.tasks.find((task2) => task2.id === input.id);
    let task;
    try {
      task = normalizeTask(input, existing, this.options, this.taskDefaults());
    } catch (error) {
      return { ok: false, code: "invalid_task", message: error.message };
    }
    const scheduleChanged = existing === void 0 || JSON.stringify(existing.schedule) !== JSON.stringify(task.schedule) || existing.timeZone !== task.timeZone || existing.startAt !== task.startAt || existing.endAt !== task.endAt || existing.enabled !== task.enabled;
    task.updatedAt = new Date(this.now()).toISOString();
    const tasks = this.store.tasks.filter((entry) => entry.id !== task.id);
    tasks.push(task);
    this.store.replace(mergeTaskOrder(tasks), this.store.runs);
    if (scheduleChanged) this.recompute(task, this.now());
    this.persist();
    this.notify();
    this.arm();
    return { ok: true, value: task };
  }
  deleteTask(id) {
    const task = this.store.tasks.find((entry) => entry.id === id);
    if (task === void 0) return { ok: false, code: "task_not_found", message: "\u4EFB\u52A1\u4E0D\u5B58\u5728" };
    const activeRunId = this.activeByTask.get(id);
    this.clearRetriesOf(id, "\u4EFB\u52A1\u5DF2\u5220\u9664");
    this.store.replace(
      this.store.tasks.filter((entry) => entry.id !== id),
      this.store.runs
    );
    this.persist();
    this.notify();
    this.arm();
    return { ok: true, value: { id, ...activeRunId === void 0 ? {} : { activeRunId } } };
  }
  setEnabled(id, enabled) {
    const task = this.store.tasks.find((entry) => entry.id === id);
    if (task === void 0) return { ok: false, code: "task_not_found", message: "\u4EFB\u52A1\u4E0D\u5B58\u5728" };
    task.enabled = enabled;
    if (!enabled) this.clearRetriesOf(id, "\u4EFB\u52A1\u5DF2\u6682\u505C");
    task.updatedAt = new Date(this.now()).toISOString();
    this.recompute(task, this.now());
    this.persist();
    this.notify();
    this.arm();
    return { ok: true, value: task };
  }
  bulk(ids, action) {
    let affected = 0;
    for (const id of ids) {
      const result = action === "delete" ? this.deleteTask(id) : this.setEnabled(id, action === "enable");
      if (result.ok) affected += 1;
    }
    return { ok: true, value: { affected } };
  }
  duplicate(id) {
    const task = this.store.tasks.find((entry) => entry.id === id);
    if (task === void 0) return { ok: false, code: "task_not_found", message: "\u4EFB\u52A1\u4E0D\u5B58\u5728" };
    const copy = {
      ...structuredClone(task),
      id: randomUUID(),
      name: `${task.name}\uFF08\u526F\u672C\uFF09`,
      sessionId: null,
      enabled: false,
      createdAt: new Date(this.now()).toISOString(),
      updatedAt: new Date(this.now()).toISOString(),
      nextRunAt: null,
      lastRunAt: null,
      lastRunStatus: null,
      lastError: null
    };
    return this.saveTask(copy);
  }
  /* ------------------------------------------------------------------ runs */
  /** Manual run: ignores the schedule but still respects the queue and timeout. */
  runNow(id) {
    const task = this.store.tasks.find((entry) => entry.id === id);
    if (task === void 0) return { ok: false, code: "task_not_found", message: "\u4EFB\u52A1\u4E0D\u5B58\u5728" };
    const run = this.enqueue(task, "manual", null, this.nextAttemptOf(id));
    return { ok: true, value: run };
  }
  /** 1 for the first try, or one past the newest attempt of that task. */
  nextAttemptOf(taskId) {
    let max = 0;
    for (const run of this.store.runs) {
      if (run.taskId === taskId && run.attempt > max) max = run.attempt;
    }
    for (const item of [...this.queue, ...this.deferred]) {
      if (item.taskId === taskId && item.attempt > max) max = item.attempt;
    }
    return max + 1;
  }
  cancelRun(runId) {
    const active = this.active.get(runId);
    if (active === void 0) {
      const before = this.queue.length + this.deferred.length;
      this.queue = this.queue.filter((item) => item.runId !== runId);
      this.deferred = this.deferred.filter((item) => item.runId !== runId);
      if (this.queue.length + this.deferred.length !== before) {
        this.patchRun(runId, (run) => {
          run.status = "cancelled";
          run.endedAt = new Date(this.now()).toISOString();
          run.error = { message: "\u6392\u961F\u4E2D\u88AB\u53D6\u6D88", code: "cancelled_in_queue" };
        });
        this.persist();
        this.notify();
        return { ok: true, value: { runId } };
      }
      return { ok: false, code: "run_not_active", message: "\u8BE5\u8FD0\u884C\u5DF2\u7ED3\u675F" };
    }
    active.cancelReason = "user";
    this.patchRun(runId, (run) => {
      run.log.push({ at: new Date(this.now()).toISOString(), level: "warn", text: "\u6536\u5230\u505C\u6B62\u8BF7\u6C42\uFF0C\u6B63\u5728\u53D6\u6D88\u5F53\u524D\u8F6E\u6B21" });
    });
    this.notify();
    if (active.cancelTimeout === null) {
      active.cancelTimeout = setTimeout(() => {
        active.cancelTimeout = null;
        void this.finish(active, "cancelled", { message: "\u5DF2\u624B\u52A8\u505C\u6B62\uFF08\u672A\u6536\u5230\u8F6E\u6B21\u7ED3\u675F\u4E8B\u4EF6\uFF09", code: "cancelled" });
      }, 15e3);
      active.cancelTimeout.unref?.();
    }
    this.requestCancellation(active);
    return { ok: true, value: { runId } };
  }
  /** Both synchronous and asynchronous Host cancellation failures are observable. */
  requestCancellation(active) {
    if (active.sessionId === "") return;
    try {
      void Promise.resolve(this.ctx.sessionController?.cancel?.({ sessionId: active.sessionId })).catch(
        (error) => this.log("warn", `\u53D6\u6D88\u8FD0\u884C\u5931\u8D25\uFF1A${error.message}`)
      );
    } catch (error) {
      this.log("warn", `\u53D6\u6D88\u8FD0\u884C\u5931\u8D25\uFF1A${error.message}`);
    }
  }
  retryRun(runId) {
    const run = this.store.runs.find((entry) => entry.id === runId);
    if (run === void 0) return { ok: false, code: "run_not_found", message: "\u8FD0\u884C\u8BB0\u5F55\u4E0D\u5B58\u5728" };
    const task = this.store.tasks.find((entry) => entry.id === run.taskId);
    if (task === void 0) return { ok: false, code: "task_not_found", message: "\u4EFB\u52A1\u5DF2\u88AB\u5220\u9664\uFF0C\u65E0\u6CD5\u91CD\u8DD1" };
    if (this.activeByTask.has(task.id)) return { ok: false, code: "task_busy", message: "\u8BE5\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C" };
    const next = this.enqueue(task, "retry", null, run.attempt + 1);
    return { ok: true, value: next };
  }
  clearRuns() {
    const keep = this.store.runs.filter((run) => this.isLive(run));
    const removed = this.store.runs.length - keep.length;
    this.store.replace(this.store.tasks, keep);
    this.persist();
    this.notify();
    return { ok: true, value: { removed } };
  }
  /** Resolve a task by id, exact name, or an unambiguous name fragment. */
  taskByIdOrName(key) {
    const wanted = key.trim();
    if (wanted.length === 0) return null;
    const byId = this.store.tasks.find((task) => task.id === wanted);
    if (byId !== void 0) return byId;
    const lower = wanted.toLowerCase();
    const exact = this.store.tasks.filter((task) => task.name.toLowerCase() === lower);
    if (exact.length === 1) return exact[0];
    const partial = this.store.tasks.filter((task) => task.name.toLowerCase().includes(lower));
    return partial.length === 1 ? partial[0] : null;
  }
  findRun(runId) {
    return this.store.runs.find((run) => run.id === runId) ?? null;
  }
  /** Run history, newest first, filtered for the 运行记录 tab. */
  listRuns(filter) {
    let runs = [...this.store.runs];
    if (filter?.status !== void 0 && filter.status !== "all") {
      runs = runs.filter((run) => run.status === filter.status);
    }
    if (filter?.trigger !== void 0 && filter.trigger !== "all") {
      runs = runs.filter((run) => run.trigger === filter.trigger);
    }
    if (filter?.taskId !== void 0 && filter.taskId !== "all") {
      runs = runs.filter((run) => run.taskId === filter.taskId);
    }
    runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return runs.slice(0, filter?.limit ?? 200);
  }
  /* -------------------------------------------------------------- scheduler */
  /** Evaluate every enabled task once; safe to call from a timer or a test. */
  async tick(nowMs) {
    const now = nowMs ?? this.now();
    let changed = false;
    changed = this.processDueRetries(now) || changed;
    for (const task of this.store.tasks) {
      if (task === null || typeof task !== "object") continue;
      if (!task.enabled) {
        if (task.nextRunAt !== null) {
          task.nextRunAt = null;
          changed = true;
        }
        continue;
      }
      const scheduled = task.nextRunAt === null ? Number.NaN : Date.parse(task.nextRunAt);
      if (!Number.isFinite(scheduled)) {
        this.recompute(task, now);
        changed = true;
        continue;
      }
      if (scheduled > now) continue;
      if (!withinWindow(now, task.startAt, task.endAt)) {
        this.log("info", `\u4EFB\u52A1\u300C${task.name}\u300D\u8D85\u51FA\u6709\u6548\u671F\u7A97\u53E3\uFF0C\u505C\u6B62\u6392\u671F`);
        this.recompute(task, now);
        changed = true;
        continue;
      }
      const lateMs = now - scheduled;
      if (lateMs <= this.options.graceSeconds * 1e3) {
        this.enqueue(task, "schedule", task.nextRunAt, 1);
      } else if (task.missedPolicy === "catchup") {
        const missed = this.latestMissed(task, now);
        this.log("info", `\u4EFB\u52A1\u300C${task.name}\u300D\u8865\u8DD1\u6700\u8FD1\u4E00\u6B21\u6F0F\u8DD1\uFF08\u8BA1\u5212 ${missed ?? task.nextRunAt}\uFF09`);
        this.enqueue(task, "catchup", missed ?? task.nextRunAt, 1);
      } else {
        this.log("info", `\u4EFB\u52A1\u300C${task.name}\u300D\u9519\u8FC7\u4E00\u6B21\u8BA1\u5212\u6267\u884C\uFF0C\u7B56\u7565\u4E3A\u8DF3\u8FC7`);
      }
      this.recompute(task, now);
      changed = true;
    }
    if (changed) {
      this.persist();
      this.notify();
    }
    this.arm();
  }
  /**
   * Due failure retries, read from the persisted `retryAt` marks so they survive
   * a restart. A retry is cancelled — and says so in the record — when the task
   * was deleted, paused, left its validity window, or is already running.
   */
  processDueRetries(now) {
    let changed = false;
    for (const run of [...this.store.runs]) {
      if (run.retryAt === null) continue;
      const due = Date.parse(run.retryAt);
      if (!Number.isFinite(due) || due > now) continue;
      const task = this.store.tasks.find((entry) => entry.id === run.taskId);
      const blocked = task === void 0 ? "\u4EFB\u52A1\u5DF2\u5220\u9664" : !task.enabled ? "\u4EFB\u52A1\u5DF2\u6682\u505C" : !withinWindow(now, task.startAt, task.endAt) ? "\u4EFB\u52A1\u5DF2\u8D85\u51FA\u6709\u6548\u671F" : this.activeByTask.has(task.id) ? "\u540C\u4E00\u4EFB\u52A1\u4ECD\u5728\u8FD0\u884C" : null;
      run.retryAt = null;
      changed = true;
      if (blocked !== null) {
        run.log.push({
          at: new Date(now).toISOString(),
          level: "warn",
          text: `\u81EA\u52A8\u91CD\u8BD5\u5DF2\u53D6\u6D88\uFF1A${blocked}`
        });
        this.log("info", `\u81EA\u52A8\u91CD\u8BD5\u5DF2\u53D6\u6D88\uFF1A${blocked}`);
        continue;
      }
      if (task === void 0) continue;
      this.log("info", `\u4EFB\u52A1\u300C${task.name}\u300D\u7B2C ${run.attempt + 1} \u6B21\u5C1D\u8BD5\uFF08\u81EA\u52A8\u91CD\u8BD5\uFF09`);
      this.enqueue(task, "retry", run.scheduledFor, run.attempt + 1);
    }
    return changed;
  }
  /** Last occurrence at or before `now` — catch-up runs the newest one only. */
  latestMissed(task, now) {
    const previous = previousOccurrence({
      spec: task.schedule,
      timeZone: task.timeZone,
      atMs: now,
      anchorMs: Date.parse(task.createdAt)
    });
    if (previous === null) return null;
    if (task.startAt !== null && previous < Date.parse(task.startAt)) return null;
    return new Date(previous).toISOString();
  }
  /** Recompute the cached next occurrence from `fromMs`. */
  recompute(task, fromMs) {
    if (!task.enabled) {
      task.nextRunAt = null;
      return;
    }
    const startBound = task.startAt === null ? null : Date.parse(task.startAt);
    const from = startBound === null ? fromMs : fromMs <= startBound ? startBound - 1 : fromMs;
    try {
      const next = nextOccurrence({
        spec: task.schedule,
        timeZone: task.timeZone,
        fromMs: from,
        anchorMs: Date.parse(task.createdAt)
      });
      if (next === null || !withinWindow(next, task.startAt, task.endAt)) {
        task.nextRunAt = null;
        return;
      }
      task.nextRunAt = new Date(next).toISOString();
    } catch (error) {
      task.nextRunAt = null;
      task.lastError = { message: `\u8C03\u5EA6\u89C4\u5219\u65E0\u6CD5\u8BA1\u7B97\uFF1A${error.message}`, at: new Date(this.now()).toISOString() };
    }
  }
  /** One timer for the whole engine, re-armed at the nearest occurrence. */
  arm() {
    if (this.disposed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const task of this.store.tasks) {
      if (task === null || typeof task !== "object") continue;
      if (!task.enabled || task.nextRunAt === null) continue;
      const at = Date.parse(task.nextRunAt);
      if (Number.isFinite(at) && at < nearest) nearest = at;
    }
    for (const run of this.store.runs) {
      if (run.retryAt === null) continue;
      const at = Date.parse(run.retryAt);
      if (Number.isFinite(at) && at < nearest) nearest = at;
    }
    const now = this.now();
    const delay = Number.isFinite(nearest) && nearest > now ? Math.min(nearest - now + 250, TIMER_CEILING_MS) : Math.min(TIMER_CEILING_MS, 5e3);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick().catch((error) => this.log("error", `\u8C03\u5EA6\u5FAA\u73AF\u5F02\u5E38\uFF1A${error.message}`));
    }, Math.max(delay, 500));
    this.timer.unref?.();
  }
  /* ------------------------------------------------------------- run queue */
  enqueue(task, trigger, scheduledFor, attempt) {
    const at = new Date(this.now()).toISOString();
    const run = {
      id: randomUUID(),
      taskId: task.id,
      taskName: task.name,
      status: "queued",
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
      log: [{ at, level: "info", text: `\u5DF2\u5165\u961F\uFF08\u89E6\u53D1\uFF1A${describeTrigger(trigger)}${scheduledFor === null ? "" : `\uFF0C\u8BA1\u5212 ${formatInstant(Date.parse(scheduledFor), task.timeZone)}`}\uFF09` }]
    };
    this.store.replace(
      this.store.tasks,
      pruneRuns([run, ...this.store.runs], this.options.runHistory, (entry) => this.isLive(entry))
    );
    this.queue.push({ runId: run.id, taskId: task.id, trigger, scheduledFor, attempt });
    this.persist();
    this.notify();
    this.pump();
    return run;
  }
  pump() {
    if (this.disposed) return;
    this.releaseDeferred();
    while (this.active.size < this.options.maxConcurrentRuns && this.queue.length > 0) {
      const item = this.queue.shift();
      if (this.activeByTask.has(item.taskId)) {
        this.deferred.push({ ...item, deferred: true });
        if (item.deferred !== true) {
          this.patchRun(item.runId, (run) => {
            run.log.push({
              at: new Date(this.now()).toISOString(),
              level: "info",
              text: "\u540C\u4E00\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u672C\u6B21\u89E6\u53D1\u6392\u961F\u7B49\u5F85\uFF08\u4E0D\u4F1A\u4E22\u5F03\uFF09"
            });
          });
          this.notify();
        }
        continue;
      }
      void this.execute(item);
    }
  }
  /** Move deferred triggers back once their task is idle again. */
  releaseDeferred() {
    if (this.deferred.length === 0) return;
    const waiting = [];
    for (const item of this.deferred) {
      if (this.activeByTask.has(item.taskId)) {
        waiting.push(item);
        continue;
      }
      this.queue.push(item);
    }
    this.deferred = waiting;
  }
  /* -------------------------------------------------------------- execution */
  async execute(item) {
    const task = this.store.tasks.find((entry) => entry.id === item.taskId);
    const run = this.store.runs.find((entry) => entry.id === item.runId);
    if (task === void 0 || run === void 0) return;
    if (this.disposed) return;
    let workspace;
    try {
      workspace = this.ensureWorkspace(task);
    } catch (error) {
      this.failBeforeStart(task, run, error.message);
      return;
    }
    run.workspace = workspace;
    const active = {
      runId: run.id,
      taskId: task.id,
      generation: this.generation,
      sessionId: "",
      sessionMode: task.sessionMode,
      turnId: null,
      workspace,
      startedMs: this.now(),
      timeout: null,
      cancelTimeout: null,
      cancelReason: null,
      texts: [],
      tools: []
    };
    this.active.set(run.id, active);
    this.activeByTask.set(task.id, run.id);
    run.status = "running";
    run.startedAt = new Date(this.now()).toISOString();
    run.log.push({ at: run.startedAt, level: "info", text: `\u5F00\u59CB\u6267\u884C\uFF08\u5DE5\u4F5C\u6587\u4EF6\u5939 ${workspace}\uFF09` });
    this.persist();
    this.notify();
    const timeoutMs = Math.max(20, Math.round(Math.max(0.02, task.timeoutMinutes) * 6e4));
    active.timeout = setTimeout(() => {
      active.timeout = null;
      void this.onTimeout(active, run.id);
    }, timeoutMs);
    active.timeout.unref?.();
    try {
      const sessionId = await this.ensureSession(task, workspace);
      if (!this.isCurrent(active)) return;
      active.sessionId = sessionId;
      run.sessionId = sessionId;
      run.log.push({ at: new Date(this.now()).toISOString(), level: "info", text: `\u4F1A\u8BDD ${sessionId}\uFF08${task.sessionMode === "persistent" ? "\u6301\u7EED\u4F1A\u8BDD" : "\u72EC\u7ACB\u4F1A\u8BDD"}\uFF09` });
      await this.applyModel(task, sessionId, run);
      if (!this.isCurrent(active)) return;
      await this.applyPermission(task, sessionId, run);
      if (!this.isCurrent(active)) return;
      this.bySession.set(sessionId, run.id);
      this.persist();
      this.notify();
      const controller = new AbortController();
      await this.ctx.sessionController.prompt(
        {
          sessionId,
          content: [{ type: "text", text: this.buildPrompt(task, item, workspace) }],
          mode: "queue",
          requestId: run.id,
          clientTimeZone: task.timeZone
        },
        controller.signal
      );
    } catch (error) {
      if (!this.isCurrent(active)) return;
      await this.finish(active, "failed", { message: error.message, code: "prompt_failed" });
    }
  }
  /**
   * Whether this run still owns the engine: not disposed, still registered as
   * active, and from the current generation. Every await is followed by this
   * check so a stopped, timed-out or reloaded run cannot keep going.
   */
  isCurrent(active) {
    return !this.disposed && active.generation === this.generation && this.active.get(active.runId) === active;
  }
  /**
   * The folder one task runs in, resolved through the Host registry when the
   * task points at a registered workspace. A workspace that disappeared is an
   * error, never a silent fallback to some other directory.
   */
  resolveWorkspace(task) {
    if (task.workspaceId !== null) {
      const registry = this.capability("workspaceRegistry");
      if (registry === void 0 || registry === null || typeof registry.get !== "function") {
        throw new Error("\u5BBF\u4E3B\u6CA1\u6709 workspaceRegistry \u670D\u52A1\uFF0C\u65E0\u6CD5\u89E3\u6790\u4EFB\u52A1\u7ED1\u5B9A\u7684\u5DE5\u4F5C\u533A");
      }
      let found;
      try {
        found = registry.get(task.workspaceId);
      } catch (error) {
        throw new Error(`\u8BFB\u53D6\u5DE5\u4F5C\u533A ${task.workspaceId} \u5931\u8D25\uFF1A${error.message}`);
      }
      if (found === void 0 || found === null) {
        throw new Error(`\u4EFB\u52A1\u7ED1\u5B9A\u7684\u5DE5\u4F5C\u533A ${task.workspaceId} \u5DF2\u4E0D\u5728\u5BBF\u4E3B\u91CC\uFF08\u53EF\u80FD\u88AB\u5220\u9664\uFF09\uFF0C\u8BF7\u5728\u7F16\u8F91\u91CC\u91CD\u65B0\u9009\u62E9`);
      }
      const path = String(found.path ?? "").trim();
      if (path.length === 0) throw new Error(`\u5DE5\u4F5C\u533A ${task.workspaceId} \u6CA1\u6709\u53EF\u7528\u8DEF\u5F84`);
      if (task.workspace !== path) {
        task.workspace = path;
        this.persist();
      }
      return path;
    }
    if (task.workspace !== null && task.workspace.trim() !== "") return task.workspace;
    return join2(this.options.dataRoot, "workspaces", task.id);
  }
  /** Enqueue-time path: recorded on the run without throwing a trigger away. */
  resolveWorkspaceQuietly(task) {
    try {
      return this.resolveWorkspace(task);
    } catch (error) {
      this.log("warn", `(task ${task.name}) ${error.message}`);
      return task.workspace ?? join2(this.options.dataRoot, "workspaces", task.id);
    }
  }
  /** Create the working folder if needed and return its absolute path. */
  ensureWorkspace(task) {
    const dir = this.resolveWorkspace(task);
    if (task.workspaceId !== null && !existsSync(dir)) {
      throw new Error(`\u5DE5\u4F5C\u533A\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${dir}\uFF08\u5DE5\u4F5C\u533A\u53EF\u80FD\u88AB\u79FB\u52A8\u6216\u5220\u9664\uFF0C\u8BF7\u4FEE\u590D\u6216\u5728\u7F16\u8F91\u91CC\u91CD\u65B0\u9009\u62E9\uFF09`);
    }
    try {
      mkdirSync(dir, { recursive: true });
    } catch (error) {
      this.log("warn", `\u5DE5\u4F5C\u6587\u4EF6\u5939\u4E0D\u53EF\u7528\uFF08${dir}\uFF09\uFF1A${error.message}`);
    }
    return dir;
  }
  /** Close a run that could not even reach its working folder. */
  failBeforeStart(task, run, message) {
    const at = new Date(this.now()).toISOString();
    run.status = "failed";
    run.startedAt = at;
    run.endedAt = at;
    run.durationMs = 0;
    run.error = { message, code: "workspace_unavailable" };
    run.log.push({ at, level: "error", text: message });
    task.lastRunAt = at;
    task.lastRunStatus = "failed";
    task.lastError = { message, at };
    this.persist();
    this.notify();
  }
  /** Per-task cross-run data folder: the agent's own notebook between runs. */
  dataDir(task, workspace) {
    const base = task.workspace === null && task.workspaceId === null ? this.options.dataRoot : join2(workspace, ".dsh-task-center");
    const dir = join2(base, task.id);
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
    }
    return dir;
  }
  async ensureSession(task, workspace) {
    const controller = this.ctx.sessionController;
    if (task.sessionMode === "persistent" && task.sessionId !== null) {
      let reusable = false;
      try {
        const agent = await this.resolveLiveAgent(task.sessionId);
        const cwd = agent?.session?.header?.cwd;
        if (typeof cwd === "string" && cwd.length > 0 && resolve2(cwd) !== resolve2(workspace)) {
          this.log("warn", `\u6301\u7EED\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u6587\u4EF6\u5939\u662F ${cwd}\uFF0C\u4E0E\u4EFB\u52A1\u8981\u6C42\u7684 ${workspace} \u4E0D\u540C\uFF0C\u6539\u7528\u65B0\u4F1A\u8BDD`);
        } else if (task.sessionModelKey !== modelKey(task)) {
          this.log("info", "\u4EFB\u52A1\u7684\u6A21\u578B\u8BBE\u7F6E\u5DF2\u53D8\u5316\uFF0C\u6301\u7EED\u4F1A\u8BDD\u6539\u7528\u65B0\u4F1A\u8BDD\u4EE5\u4FBF\u751F\u6548");
        } else {
          reusable = true;
        }
      } catch {
        this.log("warn", `\u6301\u7EED\u4F1A\u8BDD ${task.sessionId} \u5DF2\u4E0D\u53EF\u7528\uFF0C\u6539\u4E3A\u65B0\u5EFA`);
      }
      if (!reusable) {
        task.sessionId = null;
        this.persist();
      } else {
        return task.sessionId;
      }
    }
    const created = await controller.create({ cwd: workspace });
    const sessionId = created?.sessionId ?? created?.id;
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new Error("\u5BBF\u4E3B\u672A\u8FD4\u56DE\u4F1A\u8BDD id");
    }
    if (task.sessionMode === "persistent") {
      task.sessionId = sessionId;
      task.sessionModelKey = modelKey(task);
      this.persist();
    }
    return sessionId;
  }
  /**
   * `sessionController.resolveAgent` answers either a live Agent, a `{ agent }`
   * wrapper (the resume path) or `{ error }`. Only the Agent has `.session`, so
   * every caller has to unwrap it before touching the log.
   */
  async resolveLiveAgent(sessionId) {
    const resolved = await this.ctx.sessionController.resolveAgent(sessionId);
    if (resolved === void 0 || resolved === null) throw new Error("\u4F1A\u8BDD\u4E0D\u53EF\u7528");
    if (resolved.error !== void 0) {
      throw new Error(String(resolved.error?.message ?? "\u4F1A\u8BDD\u4E0D\u53EF\u7528"));
    }
    return resolved.agent ?? resolved;
  }
  /**
   * Pin the task's model on its own Session only.
   *
   * `sessionController.selectModel` also writes the choice into the Host-wide
   * default model, which a scheduled task has no business doing. There is no
   * fallback to it: when the per-agent seam is missing the run fails loudly
   * instead of quietly switching models (or switching the user's default).
   */
  async applyModel(task, sessionId, run) {
    const at = () => new Date(this.now()).toISOString();
    const choice = task.model;
    if (choice === null) {
      const effective = this.defaultSelection();
      run.modelSnapshot = effective;
      run.log.push({
        at: at(),
        level: "info",
        text: effective === null ? "\u4EFB\u52A1\u672A\u56FA\u5316\u6A21\u578B\uFF0C\u672C\u6B21\u8DDF\u968F\u5BBF\u4E3B\u9ED8\u8BA4\u6A21\u578B" : `\u4EFB\u52A1\u672A\u56FA\u5316\u6A21\u578B\uFF0C\u672C\u6B21\u8DDF\u968F\u5BBF\u4E3B\u9ED8\u8BA4\u6A21\u578B ${effective.provider}/${effective.model}`
      });
      return;
    }
    const label = `${choice.provider}/${choice.model}${task.reasoningEffort === null ? "" : ` \xB7 ${task.reasoningEffort}`}`;
    try {
      const controller = this.ctx.sessionController;
      const agent = await this.resolveLiveAgent(sessionId);
      let selected = {
        provider: choice.provider,
        model: choice.model,
        ...task.reasoningEffort === null ? {} : { reasoningEffort: task.reasoningEffort }
      };
      const llm = this.ctx.get?.("llm", false);
      if (llm !== void 0 && llm !== null && typeof llm.resolveCallConfig === "function") {
        const resolved = await llm.resolveCallConfig({
          provider: choice.provider,
          model: choice.model,
          ...task.reasoningEffort === null ? {} : { reasoningEffort: task.reasoningEffort }
        });
        selected = {
          provider: resolved.provider,
          model: resolved.model,
          ...resolved.reasoningEffort === void 0 ? {} : { reasoningEffort: resolved.reasoningEffort }
        };
      }
      const agents = controller.agents;
      if (agent === void 0 || agent === null || typeof agents?.selectForNextRequest !== "function") {
        throw new Error("\u5BBF\u4E3B\u7F3A\u5C11 agents.selectForNextRequest\uFF0C\u65E0\u6CD5\u628A\u6A21\u578B\u9489\u5728\u672C\u4F1A\u8BDD\uFF08\u4E0D\u9000\u56DE\u4F1A\u6539\u5168\u5C40\u9ED8\u8BA4\u7684\u63A5\u53E3\uFF09");
      }
      agents.selectForNextRequest(agent, selected);
      run.modelSnapshot = {
        provider: selected.provider,
        model: selected.model,
        reasoningEffort: selected.reasoningEffort ?? null
      };
      run.log.push({ at: at(), level: "info", text: `\u4F7F\u7528\u6A21\u578B ${label}\uFF08\u4EC5\u4F5C\u7528\u4E8E\u672C\u4F1A\u8BDD\uFF0C\u4E0D\u6539\u5BBF\u4E3B\u9ED8\u8BA4\u6A21\u578B\uFF09` });
    } catch (error) {
      run.modelSnapshot = null;
      throw new Error(`\u6307\u5B9A\u6A21\u578B ${label} \u4E0D\u53EF\u7528\uFF1A${error.message}`);
    }
  }
  /**
   * Read an optional Host capability without tripping Cordis' inject guard:
   * a missing service must read as `undefined`, not throw on property access.
   */
  capability(name2) {
    const holder = this.ctx;
    if (typeof holder.get === "function") {
      try {
        const viaGet = holder.get.call(this.ctx, name2, false);
        if (viaGet !== void 0) return viaGet;
      } catch {
      }
    }
    try {
      return holder[name2];
    } catch {
      return void 0;
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
  async applyPermission(task, sessionId, run) {
    const at = () => new Date(this.now()).toISOString();
    try {
      const agent = await this.resolveLiveAgent(sessionId);
      const session = agent?.session;
      if (task.permissionPreset !== null) {
        const presets = this.capability("permissionPresets");
        if (presets === void 0 || presets === null || typeof presets.set !== "function") {
          throw new Error("\u5BBF\u4E3B\u6CA1\u6709 permissionPresets \u670D\u52A1\uFF0C\u65E0\u6CD5\u5E94\u7528\u6743\u9650\u9884\u8BBE");
        }
        presets.resolve(task.permissionPreset);
        presets.set(session, task.permissionPreset);
        run.permissionPreset = task.permissionPreset;
        run.log.push({ at: at(), level: "info", text: `\u6743\u9650\u9884\u8BBE ${task.permissionPreset}\uFF08\u6CBF\u7528\u5BBF\u4E3B\u539F\u751F\u4E09\u6863\uFF09` });
        return;
      }
      if (session !== void 0 && session !== null && typeof session.append === "function") {
        session.append("sandbox/mode", { mode: task.permission.sandbox });
      }
      if (agent !== void 0 && agent !== null) {
        const approval = this.capability("approval");
        if (approval === void 0) throw new Error("\u5BBF\u4E3B\u6CA1\u6709 approval \u670D\u52A1\uFF0C\u65E0\u6CD5\u4E0B\u53D1\u5BA1\u6279\u7B56\u7565");
        approval.setPolicy(agent, task.permission.approval);
      }
      run.permissionPreset = null;
      run.log.push({
        at: at(),
        level: "warn",
        text: `\u6743\u9650\u6CBF\u7528\u65E7\u7EC4\u5408\uFF08\u6C99\u7BB1 ${task.permission.sandbox} / \u5BA1\u6279 ${task.permission.approval}\uFF09\uFF0C\u5EFA\u8BAE\u5728\u7F16\u8F91\u91CC\u6539\u9009\u5BBF\u4E3B\u9884\u8BBE`
      });
    } catch (error) {
      throw new Error(`\u65E0\u6CD5\u4E0B\u53D1\u4EFB\u52A1\u6743\u9650\uFF1A${error.message}`);
    }
  }
  /** The user message one run sends: bounded context, never the whole history. */
  buildPrompt(task, item, workspace) {
    const now = new Date(this.now());
    const data = this.dataDir(task, workspace);
    const targetMs = item.scheduledFor === null ? now.getTime() : Date.parse(item.scheduledFor);
    const targetDate = formatInstant(targetMs, task.timeZone).slice(0, 10);
    const lines = [
      "\u8FD9\u662F\u4E00\u6B21\u7531\u300C\u81EA\u52A8\u5316\u4EFB\u52A1\u4E2D\u5FC3\u300D\u89E6\u53D1\u7684\u81EA\u52A8\u8FD0\u884C\uFF0C\u4E0D\u662F\u4EA4\u4E92\u5F0F\u5BF9\u8BDD\uFF1A\u6CA1\u6709\u4EBA\u4F1A\u56DE\u7B54\u63D0\u95EE\uFF0C\u8BF7\u72EC\u7ACB\u5B8C\u6210\u5E76\u628A\u7ED3\u679C\u5199\u5165\u5DE5\u4F5C\u6587\u4EF6\u5939\u3002",
      "",
      `\u4EFB\u52A1\uFF1A${task.name}`,
      `\u89E6\u53D1\u65B9\u5F0F\uFF1A${describeTrigger(item.trigger)}`,
      `\u8BA1\u5212\u65F6\u95F4\uFF1A${item.scheduledFor === null ? "\u2014" : formatInstant(Date.parse(item.scheduledFor), task.timeZone)}\uFF08${task.timeZone}\uFF09`,
      `\u5F53\u524D\u65F6\u95F4\uFF1A${formatInstant(now.getTime(), task.timeZone)}\uFF08${task.timeZone}\uFF09`,
      `\u672C\u6B21\u8FD0\u884C\u5BF9\u5E94\u7684\u65E5\u671F\uFF1A${targetDate}\uFF08\u6309\u4EFB\u52A1\u65F6\u533A\u7B97\uFF1B\u4EA7\u7269\u6587\u4EF6\u540D\u4E0E\u9875\u9762\u6807\u9898\u91CC\u7684\u65E5\u671F\u8BF7\u7528\u8FD9\u4E00\u5929\uFF09`,
      `\u5DE5\u4F5C\u6587\u4EF6\u5939\uFF1A${workspace}`,
      `\u8DE8\u6B21\u6570\u636E\u76EE\u5F55\uFF1A${data}\uFF08\u4F60\u81EA\u5DF1\u7684\u8BB0\u4E8B\u672C\uFF0C\u8DE8\u8FD0\u884C\u4FDD\u7559\uFF1B\u9700\u8981\u8BB0\u4F4F\u201C\u5DF2\u5904\u7406\u8FC7\u4EC0\u4E48\u201D\u5C31\u5199\u5728\u8FD9\u91CC\uFF0C\u4E0B\u6B21\u8FD0\u884C\u8981\u5148\u8BFB\u53D6\u5B83\uFF0C\u907F\u514D\u91CD\u590D\u52B3\u52A8\u3002\u4E0D\u8981\u5220\u9664\u8BE5\u76EE\u5F55\u3002\uFF09`,
      `\u8C03\u5EA6\u89C4\u5219\uFF1A${describeSchedule(task.schedule, task.timeZone)}`,
      ""
    ];
    if (task.attachments.length > 0) {
      lines.push("\u53C2\u8003\u9644\u4EF6\uFF1A", ...task.attachments.map((path) => `- ${path}`), "");
    }
    lines.push("\u4EFB\u52A1\u5185\u5BB9\uFF1A", task.prompt);
    return lines.join("\n");
  }
  async onTimeout(active, runId) {
    if (!this.active.has(runId)) return;
    active.cancelReason = "timeout";
    this.patchRun(runId, (run) => {
      run.log.push({ at: new Date(this.now()).toISOString(), level: "error", text: "\u8D85\u8FC7\u8FD0\u884C\u65F6\u9650\uFF0C\u6B63\u5728\u53D6\u6D88\u5F53\u524D\u8F6E\u6B21" });
    });
    this.notify();
    await this.finish(active, "timeout", { message: "\u8FD0\u884C\u8D85\u8FC7\u65F6\u9650\uFF0C\u5DF2\u53D6\u6D88", code: "timeout" });
    this.requestCancellation(active);
  }
  /* ------------------------------------------------------------- turn watch */
  onSessionEvent(session, event) {
    const sessionId = session?.id;
    if (typeof sessionId !== "string") return;
    const runId = this.bySession.get(sessionId);
    if (runId === void 0) return;
    const active = this.active.get(runId);
    if (active === void 0) return;
    const type = event?.type;
    const data = event?.data ?? {};
    if (type === "turn/start") {
      if (active.turnId === null) {
        active.turnId = data.turn ?? null;
        this.patchRun(runId, (run) => {
          run.log.push({ at: new Date(this.now()).toISOString(), level: "info", text: "\u6A21\u578B\u8F6E\u6B21\u5F00\u59CB" });
        });
        this.notify();
      }
      return;
    }
    const mine = active.turnId === null || data.turn === void 0 || data.turn === active.turnId;
    if (!mine) return;
    if (type === "tool/call") {
      const name2 = String(data.name ?? "tool");
      active.tools.push({ name: name2, title: typeof data.arguments?.description === "string" ? data.arguments.description : name2 });
      this.patchRun(runId, (run) => {
        run.tools = dedupeTools(active.tools);
      });
      this.notify();
      return;
    }
    if (type === "assistant/message") {
      const text = extractText(data.message);
      if (text.length > 0) {
        active.texts.push(text);
        this.patchRun(runId, (run) => {
          run.output = clip(active.texts.join("\n\n"));
        });
        this.notify();
      }
      return;
    }
    if (type === "approval/asked") {
      this.patchRun(runId, (run) => {
        if (run.status === "running") run.status = "waiting-approval";
        run.log.push({ at: new Date(this.now()).toISOString(), level: "warn", text: `\u7B49\u5F85\u5BA1\u6279\uFF1A${String(data.title ?? data.tool ?? "\u9700\u8981\u6388\u6743")}` });
      });
      this.notify();
      return;
    }
    if (type === "approval/decided") {
      this.patchRun(runId, (run) => {
        if (run.status === "waiting-approval") run.status = "running";
        run.log.push({ at: new Date(this.now()).toISOString(), level: "info", text: `\u5BA1\u6279\u7ED3\u679C\uFF1A${String(data.outcome ?? "unknown")}` });
      });
      this.notify();
      return;
    }
    if (type === "turn/end") {
      const reason = data.reason ?? {};
      if (reason.kind === "completed") {
        void this.finish(active, "succeeded", null);
        return;
      }
      if (reason.kind === "aborted") {
        const cancelled = active.cancelReason === "user";
        void this.finish(
          active,
          cancelled ? "cancelled" : "timeout",
          {
            message: cancelled ? "\u5DF2\u624B\u52A8\u505C\u6B62" : "\u8FD0\u884C\u8D85\u65F6\u6216\u88AB\u5BBF\u4E3B\u4E2D\u6B62",
            code: cancelled ? "cancelled" : "aborted"
          }
        );
        return;
      }
      if (reason.kind === "error") {
        const message = String(reason.error?.message ?? "\u6A21\u578B\u8F6E\u6B21\u5931\u8D25");
        void this.finish(active, "failed", { message, code: reason.error?.code ?? "turn_error" });
        return;
      }
      void this.finish(active, "cancelled", { message: `\u8F6E\u6B21\u88AB\u4E2D\u65AD\uFF08${String(reason.kind)}\uFF09`, code: String(reason.kind) });
    }
  }
  /* -------------------------------------------------------------- finishing */
  async finish(active, status, error) {
    if (!this.active.has(active.runId)) return;
    if (active.generation !== this.generation) return;
    this.active.delete(active.runId);
    this.activeByTask.delete(active.taskId);
    if (active.sessionId !== "") this.bySession.delete(active.sessionId);
    if (active.timeout !== null) clearTimeout(active.timeout);
    if (active.cancelTimeout !== null) clearTimeout(active.cancelTimeout);
    const run = this.store.runs.find((entry) => entry.id === active.runId);
    const task = this.store.tasks.find((entry) => entry.id === active.taskId);
    const nowIso = new Date(this.now()).toISOString();
    if (run !== void 0) {
      run.status = status;
      run.endedAt = nowIso;
      run.durationMs = this.now() - active.startedMs;
      run.error = error;
      run.tools = dedupeTools(active.tools);
      if (active.texts.length > 0) run.output = clip(active.texts.join("\n\n"));
      run.artifacts = scanArtifacts(active.workspace, { sinceMs: active.startedMs, exclude: this.internalPaths() });
      run.log.push({
        at: nowIso,
        level: status === "succeeded" ? "info" : "error",
        text: status === "succeeded" ? `\u6267\u884C\u6210\u529F\uFF0C\u4EA7\u7269 ${run.artifacts.length} \u4E2A` : `\u6267\u884C\u7ED3\u675F\uFF1A${status}${error === null ? "" : ` \u2014 ${error.message}`}`
      });
    }
    if (task !== void 0) {
      task.lastRunAt = nowIso;
      task.lastRunStatus = status;
      task.lastError = status === "succeeded" || error === null ? null : { message: error.message, at: nowIso };
      if (run === void 0 || run.trigger !== "manual") this.recompute(task, this.now());
    }
    if (run !== void 0) run.retryAt = null;
    this.persist();
    this.notify();
    this.arm();
    this.pump();
    if (task !== void 0 && run !== void 0 && (status === "failed" || status === "timeout")) {
      this.scheduleRetry(task, run);
    }
  }
  /**
   * Failure retries are separate from missed-run catch-up and bounded. The
   * deadline is persisted on the run, so a restart keeps the pending retry
   * instead of forgetting it — and `tick` re-checks pause/delete/expiry before
   * it ever fires.
   */
  scheduleRetry(task, run) {
    if (!task.enabled) return;
    if (run.attempt > task.maxRetries) return;
    const delay = RETRY_BACKOFF_MS * run.attempt;
    run.retryAt = new Date(this.now() + delay).toISOString();
    run.log.push({
      at: new Date(this.now()).toISOString(),
      level: "info",
      text: `\u5C06\u5728 ${formatInstant(Date.parse(run.retryAt), task.timeZone)}\uFF08${task.timeZone}\uFF09\u81EA\u52A8\u91CD\u8BD5\u7B2C ${run.attempt + 1} \u6B21`
    });
    this.persist();
    this.notify();
    this.arm();
  }
  /** Drop persisted retry marks for one task, leaving a note in each record. */
  clearRetriesOf(taskId, reason) {
    const stamp = new Date(this.now()).toISOString();
    let cancelled = 0;
    for (const run of this.store.runs) {
      if (run.taskId !== taskId || run.retryAt === null) continue;
      run.retryAt = null;
      run.log.push({ at: stamp, level: "warn", text: `\u81EA\u52A8\u91CD\u8BD5\u5DF2\u53D6\u6D88\uFF1A${reason}` });
      cancelled += 1;
    }
    if (cancelled > 0) this.log("info", `\u81EA\u52A8\u91CD\u8BD5\u5DF2\u53D6\u6D88\uFF1A${reason}\uFF08${cancelled} \u6761\uFF09`);
  }
  /** Runs the engine still owns: in flight, or queued and waiting for a slot. */
  isLive(run) {
    if (this.active.has(run.id)) return true;
    if (this.queue.some((item) => item.runId === run.id)) return true;
    return this.deferred.some((item) => item.runId === run.id);
  }
  patchRun(runId, mutate) {
    const run = this.store.runs.find((entry) => entry.id === runId);
    if (run === void 0) return;
    mutate(run);
    this.persist();
  }
};
function normalizeTask(input, existing, options, defaults) {
  const name2 = String(input.name ?? "").trim();
  if (name2.length === 0) throw new Error("\u8BF7\u586B\u5199\u4EFB\u52A1\u540D\u79F0");
  const prompt = String(input.prompt ?? "").trim();
  if (prompt.length === 0) throw new Error("\u8BF7\u586B\u5199\u4EFB\u52A1\u63D0\u793A\u8BCD");
  if (typeof input.timeZone !== "string" || input.timeZone.length === 0) throw new Error("\u8BF7\u9009\u62E9\u4EFB\u52A1\u65F6\u533A");
  const timeoutMinutes = Number(input.timeoutMinutes ?? options.defaultTimeoutMinutes);
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) throw new Error("\u8FD0\u884C\u8D85\u65F6\u5FC5\u987B\u5927\u4E8E 0 \u5206\u949F");
  const maxRetries = Number(input.maxRetries ?? 1);
  if (!Number.isFinite(maxRetries) || maxRetries < 0 || maxRetries > 5) throw new Error("\u91CD\u8BD5\u6B21\u6570\u9700\u5728 0\u20135 \u4E4B\u95F4");
  const startAt = input.startAt ?? null;
  const endAt = input.endAt ?? null;
  if (startAt !== null && endAt !== null && Date.parse(startAt) >= Date.parse(endAt)) {
    throw new Error("\u6709\u6548\u671F\u7ED3\u675F\u65F6\u95F4\u5FC5\u987B\u665A\u4E8E\u5F00\u59CB\u65F6\u95F4");
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const creating = existing === void 0;
  const requested = normalizeModel(input.model);
  const model = requested ?? (creating ? null : existing?.model ?? null);
  const pinnedModel = model ?? (creating && defaults.model !== null ? { provider: defaults.model.provider, model: defaults.model.model } : null);
  const modelSource = requested !== null ? "explicit" : pinnedModel === null ? "legacy" : creating ? "default" : existing?.modelSource ?? "default";
  const askedEffort = normalizeEffort(input.reasoningEffort);
  const pinnedEffort = creating ? askedEffort ?? (requested === null ? defaults.model?.reasoningEffort ?? null : null) : askedEffort;
  const workspaceId = typeof input.workspaceId === "string" && input.workspaceId.trim().length > 0 ? input.workspaceId.trim() : null;
  if (workspaceId !== null && defaults.workspaceIds !== null && !defaults.workspaceIds.has(workspaceId)) {
    throw new Error(`\u5DE5\u4F5C\u533A ${workspaceId} \u4E0D\u5728\u5BBF\u4E3B\u7684\u5DE5\u4F5C\u533A\u5217\u8868\u91CC\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9`);
  }
  const workspacePath = typeof input.workspace === "string" && input.workspace.trim().length > 0 ? input.workspace.trim() : null;
  const permissionPreset = typeof input.permissionPreset === "string" && input.permissionPreset.trim().length > 0 ? input.permissionPreset.trim() : null;
  if (permissionPreset !== null && defaults.presets !== null && !defaults.presets.includes(permissionPreset)) {
    throw new Error(`\u6743\u9650\u9884\u8BBE ${permissionPreset} \u4E0D\u5728\u5BBF\u4E3B\u76EE\u5F55\u91CC\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9`);
  }
  const presetSpec = permissionPreset === null ? void 0 : defaults.presetSpecs[permissionPreset];
  const legacyKnobs = {
    approval: input.permission?.approval === "ask" ? "ask" : "never",
    sandbox: input.permission?.sandbox === "danger-full-access" || input.permission?.sandbox === "read-only" ? input.permission.sandbox : "workspace-write"
  };
  const knobs = permissionPreset !== null && presetSpec !== void 0 ? {
    approval: presetSpec.approval === "ask" ? "ask" : "never",
    sandbox: presetSpec.sandbox === "danger-full-access" || presetSpec.sandbox === "read-only" ? presetSpec.sandbox : "workspace-write"
  } : legacyKnobs;
  const legacyIssues = (input.legacyIssues ?? existing?.legacyIssues ?? []).filter((issue) => {
    if (typeof issue !== "string") return false;
    if (pinnedModel !== null && issue.startsWith("\u6A21\u578B\u672A\u56FA\u5316")) return false;
    if (permissionPreset !== null && issue.startsWith("\u6743\u9650\u7EC4\u5408")) return false;
    if (workspaceId !== null && issue.startsWith("\u5DE5\u4F5C\u6587\u4EF6\u5939\u662F\u539F\u59CB\u8DEF\u5F84")) return false;
    return true;
  });
  const task = {
    id: typeof input.id === "string" && input.id.length > 0 ? input.id : randomUUID(),
    name: name2,
    prompt,
    attachments: Array.isArray(input.attachments) ? input.attachments.filter((path) => typeof path === "string" && path.length > 0) : [],
    model: pinnedModel,
    modelSource: pinnedModel === null ? "legacy" : modelSource,
    reasoningEffort: pinnedModel === null ? null : pinnedEffort,
    workspaceId,
    workspace: workspacePath,
    workspaceSource: workspaceId !== null ? "workspace" : workspacePath !== null ? "custom" : "task-dir",
    permissionPreset,
    permissionSource: permissionPreset !== null ? "preset" : "legacy",
    legacyIssues,
    sessionMode: input.sessionMode === "persistent" ? "persistent" : "independent",
    sessionId: input.sessionMode === "persistent" ? existing?.sessionId ?? input.sessionId ?? null : null,
    sessionModelKey: input.sessionMode === "persistent" ? existing?.sessionId === (input.sessionId ?? existing?.sessionId) ? existing?.sessionModelKey ?? null : null : null,
    permission: knobs,
    schedule: { ...input.schedule },
    timeZone: input.timeZone,
    startAt,
    endAt,
    missedPolicy: input.missedPolicy === "skip" ? "skip" : "catchup",
    enabled: input.enabled !== false,
    maxRetries,
    timeoutMinutes,
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    nextRunAt: existing?.nextRunAt ?? null,
    lastRunAt: existing?.lastRunAt ?? null,
    lastRunStatus: existing?.lastRunStatus ?? null,
    lastError: existing?.lastError ?? null,
    templateId: input.templateId ?? null
  };
  nextOccurrence({ spec: task.schedule, timeZone: task.timeZone, fromMs: Date.now() - 1e3 });
  if (!existsSync(options.dataRoot)) {
    try {
      mkdirSync(options.dataRoot, { recursive: true });
    } catch {
    }
  }
  return task;
}
function normalizeModel(model) {
  if (model === null || model === void 0) return null;
  const provider = String(model.provider ?? "").trim();
  const name2 = String(model.model ?? "").trim();
  if (provider.length === 0 || name2.length === 0) return null;
  return { provider, model: name2 };
}
function normalizeCatalog(catalog) {
  const entries = [];
  const groups = Array.isArray(catalog?.groups) ? catalog.groups : [];
  for (const group of groups) {
    const provider = String(group?.id ?? "").trim();
    if (provider.length === 0) continue;
    const models = Array.isArray(group?.models) ? group.models : [];
    for (const model of models) {
      const id = String(model?.id ?? "").trim();
      if (id.length === 0) continue;
      entries.push({ provider, model: id, label: String(model?.name ?? id), reasoning: normalizeReasoning(model?.reasoning) });
    }
  }
  const flat = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.models) ? catalog.models : [];
  for (const item of flat) {
    if (item === null || typeof item !== "object") continue;
    const provider = String(item.provider ?? item.providerId ?? "").trim();
    const model = String(item.model ?? item.modelId ?? item.id ?? "").trim();
    if (provider.length === 0 || model.length === 0) continue;
    entries.push({
      provider,
      model,
      label: String(item.label ?? item.name ?? model),
      reasoning: normalizeReasoning(item.reasoning)
    });
  }
  const seen = /* @__PURE__ */ new Set();
  return entries.filter((entry) => {
    const key = `${entry.provider}/${entry.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => `${left.provider}/${left.label}`.localeCompare(`${right.provider}/${right.label}`));
}
function normalizeReasoning(input) {
  if (input === null || input === void 0 || typeof input !== "object") return null;
  const raw = input;
  const listed = Array.isArray(raw.efforts) ? raw.efforts : [];
  const efforts = listed.map((effort) => {
    if (effort === null || typeof effort !== "object") return null;
    const entry = effort;
    const id = String(entry.id ?? "").trim();
    if (id.length === 0) return null;
    return {
      id,
      name: String(entry.name ?? id),
      ...typeof entry.description === "string" && entry.description.length > 0 ? { description: entry.description } : {}
    };
  }).filter((effort) => effort !== null);
  if (efforts.length === 0) return null;
  const defaultEffort = typeof raw.defaultEffort === "string" && raw.defaultEffort.length > 0 ? raw.defaultEffort : void 0;
  return { efforts, ...defaultEffort === void 0 ? {} : { defaultEffort } };
}
function mergeTaskOrder(tasks) {
  return [...tasks].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
function pruneRuns(runs, limit, isLive) {
  const ordered = [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const live = ordered.filter((run) => isLive(run));
  const liveIds = new Set(live.map((run) => run.id));
  const keep = ordered.filter((run) => !liveIds.has(run.id)).slice(0, Math.max(limit, 20));
  return [...live, ...keep].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function normalizeEffort(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "undefined" || trimmed === "null") return null;
  return trimmed;
}
function modelKey(task) {
  if (task.model === null) return null;
  return `${task.model.provider}/${task.model.model}${task.reasoningEffort === null ? "" : `@${task.reasoningEffort}`}`;
}
function dedupeTools(tools) {
  const seen = /* @__PURE__ */ new Set();
  const listed = [];
  for (const tool2 of tools) {
    if (seen.has(tool2.name)) continue;
    seen.add(tool2.name);
    listed.push(tool2);
  }
  return listed;
}
function extractText(message) {
  const content = message?.content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("\n").trim();
}
function clip(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}
\u2026\uFF08\u5DF2\u622A\u65AD\uFF09`;
}
function describeTrigger(trigger) {
  switch (trigger) {
    case "schedule":
      return "\u5B9A\u65F6";
    case "catchup":
      return "\u8865\u8DD1";
    case "manual":
      return "\u624B\u52A8";
    case "retry":
      return "\u91CD\u8BD5";
    default:
      return trigger;
  }
}
function fail(code, message) {
  return { ok: false, code, message };
}

// src/host/reminders.ts
var DEFAULT_HISTORY_LIMIT = 50;
function reminderService(ctx) {
  const holder = ctx;
  if (typeof holder.get === "function") {
    try {
      const viaGet = holder.get.call(ctx, "schedule", false);
      if (viaGet !== void 0) return viaGet;
    } catch {
    }
  }
  try {
    return holder.schedule;
  } catch {
    return void 0;
  }
}
function unifiedKey(id) {
  return `reminder:${id}`;
}
function clockText(value) {
  const raw = typeof value === "string" ? value : "";
  const match = /^(\d{2}:\d{2})(?::00(?:\.0+)?)?$/.exec(raw);
  return match === null ? raw : match[1];
}
function describeReminder(record) {
  switch (record?.kind) {
    case "at":
      return `\u5355\u6B21 ${record.scheduledAt}`;
    case "after":
      return `\u4E00\u6B21\u6027 \xB7 \u521B\u5EFA\u540E ${record.afterSeconds} \u79D2`;
    case "every": {
      const seconds = Number(record.everySeconds);
      if (!Number.isFinite(seconds) || seconds <= 0) return "\u56FA\u5B9A\u95F4\u9694";
      if (seconds % 3600 === 0) return `\u6BCF ${seconds / 3600} \u5C0F\u65F6`;
      if (seconds % 60 === 0) return `\u6BCF ${seconds / 60} \u5206\u949F`;
      return `\u6BCF ${seconds} \u79D2`;
    }
    case "daily":
      return `\u6BCF\u5929 ${clockText(record.time)}\uFF08${record.timeZone}\uFF09`;
    case "weekly": {
      const weekdays = Array.isArray(record.weekdays) ? [...record.weekdays] : [];
      const names = ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"];
      const days = weekdays.sort((a, b) => a - b).map((day) => names[(Number(day) + 6) % 7] ?? String(day)).join("\u3001");
      return `\u6BCF\u5468${days === "" ? "" : ` ${days}`} ${clockText(record.time)}\uFF08${record.timeZone}\uFF09`;
    }
    case "cron":
      return `Cron ${record.expression}\uFF08${record.timeZone}\uFF09`;
    default:
      return "\u672A\u77E5\u89C4\u5219";
  }
}
function reminderTimeZone(record) {
  const zone = record?.timeZone;
  return typeof zone === "string" && zone !== "" ? zone : null;
}
function toRow(entry) {
  const id = typeof entry?.id === "string" ? entry.id : "";
  if (id === "") return null;
  const sessionId = typeof entry?.sessionId === "string" ? entry.sessionId : "";
  const lastDelivery = entry?.lastDelivery ?? null;
  return {
    source: "reminder",
    key: unifiedKey(id),
    id,
    sessionId,
    title: typeof entry?.title === "string" ? entry.title : "\uFF08\u672A\u547D\u540D\u63D0\u9192\uFF09",
    prompt: typeof entry?.prompt === "string" ? entry.prompt : "",
    status: entry?.status === "inactive" ? "inactive" : "active",
    kind: typeof entry?.kind === "string" ? entry.kind : "at",
    scheduledAt: typeof entry?.scheduledAt === "string" ? entry.scheduledAt : "",
    timeZone: reminderTimeZone(entry),
    rule: describeReminder(entry),
    lastDeliveredAt: typeof lastDelivery?.deliveredAt === "string" ? lastDelivery.deliveredAt : null,
    lastMessageId: typeof lastDelivery?.messageId === "string" ? lastDelivery.messageId : null
  };
}
async function readReminders(ctx) {
  const service = reminderService(ctx);
  if (service === void 0) {
    return { rows: [], error: "\u5BBF\u4E3B\u6CA1\u6709 schedule \u670D\u52A1\uFF0C\u539F\u751F\u63D0\u9192\u4E0D\u53EF\u7528" };
  }
  if (typeof service.catalog !== "function") {
    return { rows: [], error: "\u5BBF\u4E3B schedule \u670D\u52A1\u6CA1\u6709 catalog \u65B9\u6CD5\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u539F\u751F\u63D0\u9192" };
  }
  try {
    const entries = await service.catalog();
    const rows = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      const row = toRow(entry);
      if (row !== null) rows.push(row);
    }
    rows.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
    return { rows, error: null };
  } catch (error) {
    return { rows: [], error: `\u8BFB\u53D6\u539F\u751F\u63D0\u9192\u5931\u8D25\uFF1A${error.message}` };
  }
}
async function readHistory(ctx, id, sessionId, limit) {
  const service = reminderService(ctx);
  if (service === void 0 || typeof service.history !== "function") {
    throw new Error("\u5BBF\u4E3B\u6CA1\u6709 schedule.history\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u6295\u9012\u8BB0\u5F55");
  }
  const wanted = Number.isSafeInteger(limit) ? Math.min(Math.max(Number(limit), 1), 100) : DEFAULT_HISTORY_LIMIT;
  const result = await service.history({ sessionId, id, limit: wanted });
  if (result === null || typeof result !== "object") {
    throw new Error("\u5BBF\u4E3B schedule.history \u8FD4\u56DE\u4E86\u610F\u5916\u7ED3\u679C");
  }
  if (result.code === "schedule_not_found") throw new Error("\u63D0\u9192\u5DF2\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\uFF09");
  if (result.code === "delivery_cursor_not_found") throw new Error("\u6295\u9012\u6E38\u6807\u4E0D\u5B58\u5728");
  const records = [];
  for (const item of Array.isArray(result.records) ? result.records : []) {
    records.push({
      scheduledAt: typeof item?.scheduledAt === "string" ? item.scheduledAt : "",
      deliveredAt: typeof item?.deliveredAt === "string" ? item.deliveredAt : "",
      messageId: typeof item?.messageId === "string" ? item.messageId : "",
      prompt: typeof item?.prompt === "string" ? item.prompt : null
    });
  }
  return {
    records,
    earlierRecordsUnavailable: result.earlierRecordsUnavailable === true,
    earlierRecordsPruned: result.earlierRecordsPruned === true,
    retention: result.retention === void 0 || result.retention === null ? null : { days: Number(result.retention.days), records: Number(result.retention.records) },
    nextBefore: typeof result.nextBefore === "string" ? result.nextBefore : null
  };
}
function timingChange(change) {
  switch (change.kind) {
    case "at":
      if (change.at === void 0) throw new Error("\u5355\u6B21\u63D0\u9192\u9700\u8981 at");
      return { kind: "at", at: change.at };
    case "every":
      if (!Number.isFinite(Number(change.every_seconds))) throw new Error("\u56FA\u5B9A\u95F4\u9694\u9700\u8981 every_seconds");
      return { kind: "every", every_seconds: Number(change.every_seconds) };
    case "daily":
      if (change.daily === void 0) throw new Error("\u6BCF\u5929\u63D0\u9192\u9700\u8981 daily");
      return { kind: "daily", daily: change.daily };
    case "weekly":
      if (change.weekly === void 0) throw new Error("\u6BCF\u5468\u63D0\u9192\u9700\u8981 weekly");
      return { kind: "weekly", weekly: change.weekly };
    case "cron":
      if (change.cron === void 0) throw new Error("Cron \u63D0\u9192\u9700\u8981 cron \u8868\u8FBE\u5F0F");
      return { kind: "cron", cron: change.cron };
    default:
      throw new Error(`\u672A\u77E5\u7684\u63D0\u9192\u89C4\u5219\u7C7B\u578B\uFF1A${String(change.kind)}`);
  }
}
async function updateReminder(ctx, input) {
  const service = reminderService(ctx);
  if (service === void 0 || typeof service.update !== "function") {
    throw new Error("\u5BBF\u4E3B\u6CA1\u6709 schedule.update\uFF0C\u65E0\u6CD5\u4FEE\u6539\u539F\u751F\u63D0\u9192");
  }
  const observed = await observedRecord(service, input.id, input.sessionId);
  const request = { sessionId: input.sessionId, id: input.id, expected: observed };
  if (typeof input.title === "string") request.title = input.title;
  if (typeof input.prompt === "string") request.prompt = input.prompt;
  if (input.change !== void 0) request.change = timingChange(input.change);
  const result = await service.update(request);
  if (result === null || typeof result !== "object") {
    throw new Error("\u5BBF\u4E3B schedule.update \u8FD4\u56DE\u4E86\u610F\u5916\u7ED3\u679C");
  }
  if (result.updated === true) return result.record;
  switch (result.code) {
    case "schedule_not_found":
      throw new Error("\u63D0\u9192\u5DF2\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\uFF09");
    case "schedule_ended":
      throw new Error("\u63D0\u9192\u5DF2\u7ECF\u7ED3\u675F\uFF0C\u65E0\u6CD5\u4FEE\u6539");
    case "schedule_conflict":
      throw new Error("\u63D0\u9192\u521A\u521A\u88AB\u6539\u52A8\u8FC7\uFF0C\u8BF7\u5237\u65B0\u540E\u518D\u8BD5");
    default:
      throw new Error(result.message ?? `\u4FEE\u6539\u63D0\u9192\u5931\u8D25\uFF1A${String(result.code ?? "unknown")}`);
  }
}
async function deleteReminder(ctx, id, sessionId) {
  const service = reminderService(ctx);
  if (service === void 0 || typeof service.delete !== "function") {
    throw new Error("\u5BBF\u4E3B\u6CA1\u6709 schedule.delete\uFF0C\u65E0\u6CD5\u5220\u9664\u539F\u751F\u63D0\u9192");
  }
  const result = await service.delete({ sessionId, id });
  if (result === null || typeof result !== "object") {
    throw new Error("\u5BBF\u4E3B schedule.delete \u8FD4\u56DE\u4E86\u610F\u5916\u7ED3\u679C");
  }
  if (result.deleted === true) return { deleted: true };
  if (result.code === "schedule_not_found") throw new Error("\u63D0\u9192\u5DF2\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\uFF09");
  return { deleted: false };
}
async function observedRecord(service, id, sessionId) {
  if (typeof service.list === "function") {
    const rows = await service.list({ sessionId });
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.id === id) return row;
    }
  }
  const entries = typeof service.catalog === "function" ? await service.catalog() : [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.id === id) {
      const { sessionId: _session, status: _status, lastDelivery: _last, ...record } = entry;
      return record;
    }
  }
  throw new Error("\u63D0\u9192\u5DF2\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\uFF09");
}

// src/host/api.ts
var API_PREFIX = "/dsh-task-center";
var MAX_BODY_BYTES = 2 * 1024 * 1024;
var CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf"
};
function registerApi(ctx, deps) {
  const webServer = ctx.webServer;
  if (webServer === void 0 || webServer === null) {
    deps.log("error", "\u5BBF\u4E3B\u6CA1\u6709\u63D0\u4F9B webServer\uFF0C\u7BA1\u7406\u754C\u9762\u63A5\u53E3\u672A\u6302\u8F7D");
    return () => {
    };
  }
  deps.ctx = ctx;
  const disposers = [];
  disposers.push(
    webServer.register({
      kind: "prefix",
      path: API_PREFIX,
      handler: (req, res) => handle(deps, req, res)
    })
  );
  deps.log("info", `\u7BA1\u7406\u63A5\u53E3\u5DF2\u6302\u8F7D\uFF1APOST ${API_PREFIX}/api`);
  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
      }
    }
  };
}
async function handle(deps, req, res) {
  let url;
  try {
    url = new URL(req.url ?? "/", "http://127.0.0.1");
  } catch {
    sendText(res, 400, "bad url");
    return;
  }
  const path = url.pathname;
  const trusted = requestTrusted(deps, req);
  if (trusted !== true) {
    sendText(res, trusted === null ? 503 : 403, "forbidden: untrusted Host request");
    return;
  }
  try {
    if (path === `${API_PREFIX}/api` && (req.method === "POST" || req.method === "GET")) {
      await handleApi(deps, req, res);
      return;
    }
    if (path === `${API_PREFIX}/artifact` && req.method === "GET") {
      handleArtifact(deps, url, res);
      return;
    }
    if (path === `${API_PREFIX}/ping`) {
      sendJson(res, 200, { ok: true, value: { pong: true, version: 2, marker: "b2" } });
      return;
    }
    sendText(res, 404, "not found");
  } catch (error) {
    deps.log("error", `\u63A5\u53E3\u5F02\u5E38\uFF1A${error.message}`);
    sendJson(res, 500, { ok: false, code: "internal", message: error.message });
  }
}
var READ_ONLY_OPS = /* @__PURE__ */ new Set([
  "state",
  "models",
  "timezones",
  "runs.list",
  "run.detail",
  "workspaces",
  "permissions",
  "debug",
  "graph"
]);
var DIAGNOSTIC_OPS = /* @__PURE__ */ new Set([
  "debug",
  "graph",
  "tools",
  "session.permission",
  "tick",
  "verify.chat"
]);
async function handleApi(deps, req, res) {
  let request;
  if (req.method === "GET") {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const op = url.searchParams.get("op") ?? "state";
    if (!READ_ONLY_OPS.has(op)) {
      sendJson(res, 405, { ok: false, code: "method_not_allowed", message: `${op} \u53EA\u80FD\u901A\u8FC7 POST \u8C03\u7528` });
      return;
    }
    request = { op };
  } else {
    const contentType = String(req.headers?.["content-type"] ?? "").toLowerCase();
    if (contentType !== "" && !contentType.includes("application/json")) {
      sendJson(res, 415, { ok: false, code: "unsupported_media_type", message: "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F application/json" });
      return;
    }
    const body = await readBody(req);
    try {
      request = JSON.parse(body);
    } catch {
      sendJson(res, 200, { ok: false, code: "bad_json", message: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON" });
      return;
    }
  }
  const result = await dispatch(deps, request);
  sendJson(res, 200, result);
}
async function dispatch(deps, request) {
  if (DIAGNOSTIC_OPS.has(request?.op) && deps.diagnostics !== true) {
    return fail("diagnostics_disabled", "\u8BCA\u65AD\u63A5\u53E3\u9ED8\u8BA4\u5173\u95ED\uFF1B\u4EC5\u5728\u660E\u786E\u9700\u8981\u65F6\u542F\u7528 diagnostics \u914D\u7F6E");
  }
  const engine = deps.engine;
  const ctx = deps.ctx;
  switch (request?.op) {
    case "state": {
      const snapshot = await engine.snapshot();
      const reminders = await readReminders(ctx);
      return {
        ok: true,
        value: { ...snapshot, reminders: reminders.rows, reminderError: reminders.error }
      };
    }
    case "reminder.history": {
      try {
        const history = await readHistory(ctx, request.id, request.sessionId, request.limit);
        return { ok: true, value: history };
      } catch (error) {
        return fail("reminder_history_failed", error.message);
      }
    }
    case "reminder.update": {
      try {
        const record = await updateReminder(ctx, {
          id: request.id,
          sessionId: request.sessionId,
          title: request.title,
          prompt: request.prompt,
          change: request.change
        });
        const reminders = await readReminders(ctx);
        return {
          ok: true,
          value: { record, reminders: reminders.rows, reminderError: reminders.error }
        };
      } catch (error) {
        return fail("reminder_update_failed", error.message);
      }
    }
    case "reminder.delete": {
      try {
        const result = await deleteReminder(ctx, request.id, request.sessionId);
        const reminders = await readReminders(ctx);
        return {
          ok: true,
          value: { deleted: result.deleted, reminders: reminders.rows, reminderError: reminders.error }
        };
      } catch (error) {
        return fail("reminder_delete_failed", error.message);
      }
    }
    case "task.save":
      return engine.saveTask(request.task);
    case "task.delete":
      return engine.deleteTask(request.id);
    case "task.enabled":
      return engine.setEnabled(request.id, request.enabled);
    case "task.bulk":
      return engine.bulk(request.ids, request.action);
    case "task.duplicate":
      return engine.duplicate(request.id);
    case "run.now":
      return engine.runNow(request.id);
    case "run.cancel":
      return engine.cancelRun(request.runId);
    case "run.retry":
      return engine.retryRun(request.runId);
    case "runs.list":
      return { ok: true, value: engine.listRuns(request.filter) };
    case "run.detail": {
      const run = engine.findRun(request.runId);
      return run === null ? { ok: false, code: "run_not_found", message: "\u8FD0\u884C\u8BB0\u5F55\u4E0D\u5B58\u5728" } : { ok: true, value: run };
    }
    case "runs.clear":
      return engine.clearRuns();
    case "models": {
      const snapshot = await engine.snapshot();
      return { ok: true, value: snapshot.models };
    }
    case "session.permission": {
      try {
        return { ok: true, value: await engine.sessionPermission(request.sessionId) };
      } catch (error) {
        return fail("session_permission_failed", error.message);
      }
    }
    case "workspaces": {
      return { ok: true, value: engine.catalogs().workspaces };
    }
    case "permissions": {
      const catalogs = engine.catalogs();
      return { ok: true, value: { options: catalogs.permissions, defaultPreset: catalogs.permissionDefault } };
    }
    case "workspace.create": {
      try {
        return { ok: true, value: await engine.registerWorkspace(request.path) };
      } catch (error) {
        return fail("workspace_create_failed", error.message);
      }
    }
    case "timezones":
      return { ok: true, value: listTimeZones() };
    case "tick": {
      const at = typeof request.now === "string" ? Date.parse(request.now) : Number.NaN;
      await engine.tick(Number.isFinite(at) ? at : void 0);
      return { ok: true, value: await engine.snapshot() };
    }
    case "debug": {
      const ctx2 = deps.ctx;
      const optional = (name2) => {
        try {
          return ctx2?.get?.(name2, false);
        } catch {
          return void 0;
        }
      };
      const out = { dataRoot: deps.dataRoot, store: deps.store.stats };
      try {
        const sessionController = ctx2?.sessionController;
        out.sessionController = sessionController !== void 0;
        out.modelCatalogFn = typeof sessionController?.modelCatalog;
        const raw = await sessionController?.modelCatalog?.();
        out.rawCatalog = raw === void 0 ? null : JSON.parse(JSON.stringify(raw));
      } catch (error) {
        out.catalogError = error.message;
      }
      try {
        const clientModules = optional("clientModules");
        out.clientModules = clientModules !== void 0;
        out.clientPath = clientModules?.clientPath?.("@dsh-external/dsh-task-center") ?? null;
      } catch (error) {
        out.clientModulesError = error.message;
      }
      try {
        out.agentDefaultModel = optional("agentDefaultModel")?.currentSelection?.() ?? null;
      } catch (error) {
        out.defaultModelError = error.message;
      }
      return { ok: true, value: out };
    }
    case "graph": {
      try {
        const clientModules = ctx.get?.("clientModules", false);
        const graph = clientModules?.graph?.() ?? {};
        const batches = Array.isArray(graph.batches) ? graph.batches : [];
        const rows = batches.map((batch) => ({
          phase: batch?.phase ?? null,
          url: batch?.url ?? null,
          ids: Array.isArray(batch?.ids) ? batch.ids : []
        }));
        return { ok: true, value: { clientPath: clientModules?.clientPath?.("@dsh-external/dsh-task-center") ?? null, rows } };
      } catch (error) {
        return { ok: false, code: "graph_unavailable", message: error.message };
      }
    }
    case "tools": {
      const ctx2 = deps.ctx;
      const tools = ctx2.get?.("tools", false);
      try {
        const globalNames = (tools?.schemas?.() ?? []).map((schema) => String(schema?.name ?? ""));
        let sessionId = typeof request.sessionId === "string" ? request.sessionId : null;
        let sessionNames = null;
        let error = null;
        if (sessionId === null) {
          const created = await ctx2?.sessionController?.create?.({ cwd: deps.dataRoot });
          sessionId = created?.sessionId ?? null;
        }
        if (sessionId !== null) {
          try {
            const agent = await ctx2?.sessionController?.resolveAgent?.(sessionId);
            const live = agent?.agent ?? agent;
            sessionNames = (tools?.schemas?.(live) ?? []).map((schema) => String(schema?.name ?? ""));
          } catch (problem) {
            error = problem.message;
          }
        }
        return { ok: true, value: { globalNames, sessionId, sessionNames, error } };
      } catch (problem) {
        return { ok: false, code: "tools_unavailable", message: problem.message };
      }
    }
    case "verify.chat": {
      const ctx2 = deps.ctx;
      const controller = ctx2?.sessionController;
      const name2 = typeof request.name === "string" && request.name.trim() !== "" ? request.name.trim() : "\u804A\u5929\u521B\u5EFA\u9A8C\u6536";
      const created = await controller?.create?.({ cwd: deps.dataRoot });
      const sessionId = created?.sessionId ?? null;
      if (sessionId === null) return { ok: false, code: "session_unavailable", message: "\u65E0\u6CD5\u521B\u5EFA\u4F1A\u8BDD" };
      const calls = [];
      let done = false;
      const off = ctx2?.on?.("session/event", (session, event) => {
        if (session?.id !== sessionId) return;
        if (event?.type === "tool/call") calls.push(String(event?.data?.name ?? ""));
        if (event?.type === "turn/end") done = true;
      });
      const prompt = typeof request.prompt === "string" && request.prompt.trim() !== "" ? request.prompt.trim() : `\u8BF7\u7528 task_create \u5DE5\u5177\u521B\u5EFA\u8FD9\u4E2A\u5B9A\u65F6\u4EFB\u52A1\uFF0C\u4E0D\u8981\u7528\u522B\u7684\u529E\u6CD5\uFF1A\u540D\u79F0\u300C${name2}\u300D\uFF0C\u6BCF\u5929 09:00 \u6267\u884C\uFF08\u65F6\u533A Asia/Shanghai\uFF09\uFF0C\u63D0\u793A\u8BCD\u300C\u751F\u6210\u4E00\u4EFD\u6D4B\u8BD5\u7528 HTML \u65E5\u62A5\u300D\u3002\u521B\u5EFA\u6210\u529F\u540E\u53EA\u56DE\u590D\u4EFB\u52A1 id \u548C\u540D\u79F0\u3002`;
      await controller?.prompt?.(
        { sessionId, content: [{ type: "text", text: prompt }], mode: "queue", requestId: `verify-chat-${Date.now()}` },
        new AbortController().signal
      );
      const deadline = Date.now() + 24e4;
      while (!done && Date.now() < deadline) await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
      off?.();
      const task = deps.store.tasks.find((entry) => entry.name === name2) ?? null;
      return {
        ok: true,
        value: {
          sessionId,
          finished: done,
          calls,
          usedTaskCreate: calls.includes("task_create"),
          taskCreated: task === null ? null : { id: task.id, name: task.name, schedule: task.schedule, timeZone: task.timeZone }
        }
      };
    }
    case "open.run": {
      const run = engine.findRun(request.runId);
      return run === null ? { ok: false, code: "run_not_found", message: "\u8FD0\u884C\u8BB0\u5F55\u4E0D\u5B58\u5728" } : { ok: true, value: { sessionId: run.sessionId } };
    }
    default:
      return { ok: false, code: "unknown_op", message: `\u672A\u77E5\u64CD\u4F5C ${String(request?.op)}` };
  }
}
function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (error) => reject(error));
  });
}
function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}
function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}
function handleArtifact(deps, url, res) {
  const runId = url.searchParams.get("runId");
  const raw = url.searchParams.get("path");
  if (runId === null || runId.length === 0) {
    sendText(res, 400, "missing runId");
    return;
  }
  if (raw === null || raw.length === 0) {
    sendText(res, 400, "missing path");
    return;
  }
  const run = deps.engine.findRun(runId);
  if (run === null) {
    sendText(res, 404, "run not found");
    return;
  }
  const recorded = run.artifacts.some((artifact) => artifact.path === raw);
  if (!recorded) {
    sendText(res, 403, "not a recorded artifact of this run");
    return;
  }
  let target;
  let stat;
  try {
    target = realpathSync(raw);
    stat = statSync2(target);
  } catch {
    sendText(res, 404, "not found");
    return;
  }
  if (!stat.isFile()) {
    sendText(res, 400, "not a file");
    return;
  }
  const root = runRoot(deps, run);
  if (root !== null) {
    let realRoot;
    try {
      realRoot = realpathSync(root);
    } catch {
      sendText(res, 409, "workspace no longer exists");
      return;
    }
    if (target !== realRoot && !target.startsWith(`${realRoot}${sep2}`)) {
      sendText(res, 403, "artifact outside the run workspace");
      return;
    }
  }
  if (isInternalFile(target, deps)) {
    sendText(res, 403, "plugin state is not a deliverable");
    return;
  }
  const type = CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream";
  const stream = createReadStream(target);
  stream.once("open", () => {
    res.writeHead(200, {
      "content-type": type,
      "content-length": stat.size,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...previewPolicy(target, type)
    });
    stream.pipe(res);
  });
  stream.on("error", (error) => {
    deps.log("warn", `\u8BFB\u53D6\u4EA7\u7269\u5931\u8D25\uFF1A${error.message}`);
    if (!res.headersSent) {
      sendText(res, 500, "cannot read artifact");
      return;
    }
    res.destroy(error);
  });
  res.on("close", () => {
    stream.destroy();
  });
}
function previewPolicy(target, type) {
  const extension = extname(target).toLowerCase();
  const active = type.startsWith("text/html") || type === "image/svg+xml" || type.startsWith("text/xml") || type.startsWith("application/xml") || extension === ".htm" || extension === ".svg" || extension === ".xml" || extension === ".xhtml" || extension === ".mhtml";
  if (!active) return {};
  return {
    "content-security-policy": "sandbox allow-popups allow-popups-to-escape-sandbox allow-downloads; default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; media-src data: blob:",
    "cross-origin-resource-policy": "same-origin"
  };
}
function runRoot(deps, run) {
  if (typeof run.workspace === "string" && run.workspace.length > 0) return run.workspace;
  const task = deps.store.tasks.find((entry) => entry.id === run.taskId);
  return task?.workspace ?? null;
}
function isInternalFile(target, deps) {
  const configured = resolve3(deps.dataRoot);
  const roots = [configured];
  try {
    const real = realpathSync(configured);
    if (real !== configured) roots.push(real);
  } catch {
  }
  for (const root of roots) {
    if (target === join3(root, "state.json")) return true;
    const tasks = join3(root, "tasks");
    if (target === tasks || target.startsWith(`${tasks}${sep2}`)) return true;
  }
  return target.split(sep2).includes(".dsh-task-center");
}
function requestTrusted(deps, req) {
  const ctx = deps.ctx;
  let connection;
  try {
    connection = ctx?.get?.("connection", false);
  } catch {
    return null;
  }
  if (connection === void 0 || connection === null || typeof connection.isTrusted !== "function") return null;
  try {
    return connection.isTrusted(req) === true;
  } catch {
    return false;
  }
}

// src/host/store.ts
import { copyFileSync as copyFileSync2, mkdirSync as mkdirSync2, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join as join4 } from "node:path";
var VERSION = 1;
function emptyState() {
  return { version: VERSION, tasks: [], runs: [] };
}
function isTaskRecord(value) {
  const task = value;
  return typeof task === "object" && task !== null && typeof task.id === "string" && task.id !== "" && typeof task.name === "string" && typeof task.prompt === "string" && typeof task.schedule === "object" && task.schedule !== null && typeof task.schedule.kind === "string";
}
function isRunRecord(value) {
  const run = value;
  return typeof run === "object" && run !== null && typeof run.id === "string" && run.id !== "" && typeof run.taskId === "string" && typeof run.status === "string" && typeof run.trigger === "string" && Array.isArray(run.log) && Array.isArray(run.artifacts);
}
var TaskStore = class {
  file;
  state = emptyState();
  writes = 0;
  lastError = null;
  constructor(file) {
    this.file = file;
  }
  get tasks() {
    return this.state.tasks;
  }
  get runs() {
    return this.state.runs;
  }
  get stats() {
    return { writes: this.writes, lastError: this.lastError };
  }
  /** Load the file, tolerating absence and (loudly) a corrupt payload. */
  load() {
    try {
      const text = readFileSync(this.file, "utf8");
      const parsed = JSON.parse(text);
      const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      const rawRuns = Array.isArray(parsed.runs) ? parsed.runs : [];
      const tasks = rawTasks.filter(isTaskRecord);
      const runs = rawRuns.filter(isRunRecord);
      const dropped = rawTasks.length - tasks.length + (rawRuns.length - runs.length);
      this.state = { version: VERSION, tasks, runs };
      if (dropped > 0) {
        const backup = `${this.file}.invalid-${Date.now()}.bak`;
        copyFileSync2(this.file, backup);
        this.lastError = `\u8DF3\u8FC7 ${dropped} \u6761\u65E0\u6CD5\u8BC6\u522B\u7684\u8BB0\u5F55 (\u5907\u4EFD: ${backup})`;
        return { recovered: true, message: this.lastError, dropped };
      }
      return { recovered: false, message: null, dropped: 0 };
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT") {
        this.state = emptyState();
        return { recovered: false, message: null, dropped: 0 };
      }
      const backup = `${this.file}.corrupt-${Date.now()}`;
      try {
        renameSync(this.file, backup);
      } catch {
      }
      this.state = emptyState();
      this.lastError = `${error.message} (\u5907\u4EFD: ${backup})`;
      return { recovered: true, message: this.lastError, dropped: 0 };
    }
  }
  /** Replace the whole state and persist it. */
  replace(tasks, runs) {
    this.state = { version: VERSION, tasks, runs };
    this.flush();
  }
  /** Persist the current in-memory state. */
  flush() {
    const dir = dirname(this.file);
    mkdirSync2(dir, { recursive: true, mode: 448 });
    const tmp = join4(dir, `.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
    writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}
`, { encoding: "utf8", mode: 384 });
    renameSync(tmp, this.file);
    this.writes += 1;
  }
  /** Remove the state file (used by the tests only). */
  destroy() {
    this.state = emptyState();
    try {
      rmSync(this.file, { force: true });
    } catch {
    }
  }
};

// src/host/tools.ts
function tool(spec) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.schema,
      // The registry hands this back as the model-visible result.
      render: (_args, value) => [{ type: "text", text: spec.render(value) }]
    },
    execute: spec.execute,
    presentCall: (args) => ({
      card: "generic",
      title: spec.name,
      kind: spec.name,
      rawInput: args
    })
  };
}
var SCHEDULE_PARAMS = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["once", "interval", "daily", "weekly", "cron"],
      description: "once=\u5355\u6B21 / interval=\u56FA\u5B9A\u95F4\u9694 / daily=\u6BCF\u5929 / weekly=\u6BCF\u5468 / cron=Cron \u8868\u8FBE\u5F0F"
    },
    time: { type: "string", description: "daily/weekly \u7684\u672C\u5730\u65F6\u95F4\uFF0C24 \u5C0F\u65F6\u5236 HH:mm\uFF0C\u4F8B\u5982 09:00" },
    everyMinutes: { type: "number", description: "interval \u7684\u95F4\u9694\u5206\u949F\u6570" },
    weekdays: { type: "array", items: { type: "number" }, description: "weekly \u7684\u661F\u671F\u51E0\uFF0C1=\u5468\u4E00 \u2026 7=\u5468\u65E5" },
    cron: { type: "string", description: '\u4E94\u5B57\u6BB5 Vixie cron\uFF0C\u4F8B\u5982 "0 9 * * 1-5"' },
    at: { type: "string", description: "once \u7684\u7EDD\u5BF9\u65F6\u95F4\uFF08ISO 8601\uFF0C\u542B\u65F6\u533A\u504F\u79FB\u6216 Z\uFF09" }
  },
  additionalProperties: false
};
var TASK_ROW_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    enabled: { type: "boolean" },
    schedule: { type: "string" },
    timeZone: { type: "string" },
    nextRunAt: { type: "string" },
    lastRunStatus: { type: "string" },
    model: { type: "string" },
    modelSource: { type: "string" },
    workspace: { type: "string" },
    workspaceSource: { type: "string" },
    permission: { type: "string" },
    sessionMode: { type: "string" },
    notes: { type: "string" }
  },
  required: ["id", "name", "enabled"],
  additionalProperties: false
};
function taskRow(engine, task) {
  void engine;
  return {
    id: task.id,
    name: task.name,
    enabled: task.enabled,
    schedule: describeScheduleShort(task),
    timeZone: task.timeZone,
    nextRunAt: task.nextRunAt ?? "",
    lastRunStatus: task.lastRunStatus ?? "",
    model: task.model === null ? "\uFF08\u8DDF\u968F\u5BBF\u4E3B\u9ED8\u8BA4\uFF09" : `${task.model.provider}/${task.model.model}${task.reasoningEffort === null ? "" : ` \xB7 ${task.reasoningEffort}`}`,
    modelSource: task.modelSource === "default" ? "\u521B\u5EFA\u65F6\u56FA\u5316\u7684\u9ED8\u8BA4\u6A21\u578B" : task.modelSource === "explicit" ? "\u663E\u5F0F\u9009\u62E9" : "\u672A\u56FA\u5316\uFF08\u8DDF\u968F\u5BBF\u4E3B\u9ED8\u8BA4\uFF09",
    workspace: task.workspace ?? (task.workspaceId === null ? "" : task.workspaceId),
    workspaceSource: task.workspaceSource === "workspace" ? "\u5BBF\u4E3B\u5DE5\u4F5C\u533A" : task.workspaceSource === "custom" ? "\u81EA\u5B9A\u4E49\u8DEF\u5F84" : "\u4EFB\u52A1\u72EC\u7ACB\u76EE\u5F55",
    permission: task.permissionPreset ?? `\u65E7\u7EC4\u5408\uFF1A\u6C99\u7BB1 ${task.permission.sandbox} / \u5BA1\u6279 ${task.permission.approval}`,
    sessionMode: task.sessionMode === "persistent" ? "\u6301\u7EED\u4F1A\u8BDD" : "\u72EC\u7ACB\u4F1A\u8BDD",
    notes: task.legacyIssues.length === 0 ? "" : task.legacyIssues.join("\uFF1B")
  };
}
async function resolvePreset(engine, raw) {
  if (raw === void 0 || raw === null || String(raw).trim() === "") return null;
  const wanted = String(raw).trim();
  if (wanted === "danger-full-access") {
    throw new Error(
      "\u5B8C\u5168\u6743\u9650\uFF08danger-full-access\uFF09\u4E0D\u80FD\u5728\u5BF9\u8BDD\u91CC\u76F4\u63A5\u5F00\u542F\uFF0C\u8BF7\u5230\u4EFB\u52A1\u4E2D\u5FC3\u7684\u7F16\u8F91\u8868\u5355\u91CC\u624B\u52A8\u786E\u8BA4\u540E\u518D\u542F\u7528"
    );
  }
  const snapshot = await engine.snapshot();
  const available = snapshot.permissions.map((entry) => entry.value);
  if (available.includes(wanted)) return wanted;
  throw new Error(
    available.length === 0 ? "\u5BBF\u4E3B\u6CA1\u6709\u53EF\u7528\u7684\u6743\u9650\u9884\u8BBE" : `\u6743\u9650\u9884\u8BBE ${wanted} \u4E0D\u5728\u5BBF\u4E3B\u76EE\u5F55\u91CC\u3002\u53EF\u9009\uFF1A${available.join(" / ")}`
  );
}
function describeScheduleShort(task) {
  const spec = task.schedule;
  switch (spec.kind) {
    case "once":
      return `\u5355\u6B21 ${spec.at ?? "\u2014"}`;
    case "interval":
      return `\u6BCF ${spec.everyMinutes ?? "?"} \u5206\u949F`;
    case "daily":
      return `\u6BCF\u5929 ${spec.time ?? "\u2014"}`;
    case "weekly":
      return `\u6BCF\u5468 ${(spec.weekdays ?? []).join(",")} \u7684 ${spec.time ?? "\u2014"}`;
    case "cron":
      return `cron ${spec.cron ?? "\u2014"}`;
    default:
      return String(spec.kind);
  }
}
function scheduleFrom(args) {
  const kind = String(args.kind ?? "");
  switch (kind) {
    case "once":
      if (typeof args.at !== "string" || !Number.isFinite(Date.parse(args.at))) {
        throw new Error("kind=once \u9700\u8981 at\uFF08ISO 8601 \u65F6\u95F4\uFF09");
      }
      return { kind, at: args.at };
    case "interval": {
      const every = Number(args.everyMinutes);
      if (!Number.isFinite(every) || every < 1) throw new Error("kind=interval \u9700\u8981 everyMinutes\uFF08\u22651\uFF09");
      return { kind, everyMinutes: every };
    }
    case "daily":
      if (typeof args.time !== "string") throw new Error("kind=daily \u9700\u8981 time\uFF08HH:mm\uFF09");
      return { kind, time: args.time };
    case "weekly": {
      if (typeof args.time !== "string") throw new Error("kind=weekly \u9700\u8981 time\uFF08HH:mm\uFF09");
      const days = Array.isArray(args.weekdays) ? args.weekdays.map((day) => Number(day)) : [];
      if (days.length === 0 || days.some((day) => !Number.isFinite(day) || day < 1 || day > 7)) {
        throw new Error("kind=weekly \u9700\u8981 weekdays\uFF081=\u5468\u4E00 \u2026 7=\u5468\u65E5\uFF09");
      }
      return { kind, time: args.time, weekdays: days };
    }
    case "cron":
      if (typeof args.cron !== "string" || args.cron.trim().length === 0) {
        throw new Error("kind=cron \u9700\u8981 cron\uFF08\u4E94\u5B57\u6BB5\u8868\u8FBE\u5F0F\uFF09");
      }
      return { kind, cron: args.cron.trim() };
    default:
      throw new Error("kind \u5FC5\u987B\u662F once / interval / daily / weekly / cron \u4E4B\u4E00");
  }
}
function callerTimeZone(exec) {
  try {
    const session = exec?.agent?.session;
    const header = session?.requestHeader?.();
    const zone = header?.clientTimeZone;
    if (typeof zone === "string" && zone.length > 0) return zone;
  } catch {
  }
  return hostTimeZone();
}
async function resolveModel(engine, raw) {
  if (raw === null || raw === void 0 || raw === "") return null;
  if (typeof raw !== "string") throw new Error('model \u9700\u8981\u5199\u6210 "provider/model"');
  const wanted = raw.trim();
  const snapshot = await engine.snapshot();
  const entry = snapshot.models.find(
    (item) => `${item.provider}/${item.model}` === wanted || item.model === wanted
  );
  if (entry === void 0) {
    const preview = snapshot.models.slice(0, 6).map((item) => `${item.provider}/${item.model}`).join("\u3001");
    throw new Error(`\u6A21\u578B ${wanted} \u4E0D\u5728\u53EF\u7528\u5217\u8868\u91CC\u3002\u53EF\u9009\u793A\u4F8B\uFF1A${preview}`);
  }
  return { provider: entry.provider, model: entry.model };
}
function findTask(engine, idOrName) {
  const key = idOrName.trim();
  const found = engine.taskByIdOrName(key);
  if (found === null) throw new Error(`\u627E\u4E0D\u5230\u4EFB\u52A1\u300C${key}\u300D\uFF08\u53EF\u7528 task_list \u67E5\u770B\u5168\u90E8\u4EFB\u52A1\uFF09`);
  return found;
}
function renderTaskLine(row) {
  const flags = [
    row.enabled ? "\u5DF2\u542F\u7528" : "\u5DF2\u6682\u505C",
    row.schedule,
    `${row.timeZone}`,
    row.nextRunAt === "" ? "\u65E0\u4E0B\u6B21\u6267\u884C" : `\u4E0B\u6B21 ${row.nextRunAt}`,
    row.lastRunStatus === "" ? "\u4ECE\u672A\u8FD0\u884C" : `\u4E0A\u6B21 ${row.lastRunStatus}`,
    `\u6A21\u578B ${row.model}`,
    row.sessionMode
  ];
  return `- ${row.name}\uFF08${row.id}\uFF09\uFF5C${flags.join("\uFF5C")}`;
}
function buildTools(deps) {
  const { engine } = deps;
  return [
    tool({
      name: "task_create",
      description: "\u5728\u300C\u81EA\u52A8\u5316\u4EFB\u52A1\u4E2D\u5FC3\u300D\u521B\u5EFA\u4E00\u4E2A\u4F1A\u771F\u6B63\u6267\u884C\u7684\u5B9A\u65F6\u4EFB\u52A1\uFF08\u5230\u70B9\u7531 DSH \u81EA\u5DF1\u8DD1\u4E00\u8F6E Agent\uFF0C\u628A\u4EA7\u7269\u5199\u8FDB\u5DE5\u4F5C\u6587\u4EF6\u5939\uFF09\u3002\u4E0E\u754C\u9762\u91CC\u7684\u624B\u5DE5\u8868\u5355\u5171\u7528\u540C\u4E00\u4EFD\u5B58\u50A8\u4E0E\u6821\u9A8C\uFF0C\u521B\u5EFA\u540E\u53EF\u5728\u300C\u81EA\u52A8\u5316\u4EFB\u52A1\u300D\u9762\u677F\u4EA4\u53C9\u7F16\u8F91\u3002",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "\u4EFB\u52A1\u540D\u79F0\uFF0C\u7B80\u77ED\u53EF\u8FA8\u8BA4" },
          prompt: { type: "string", description: "\u5230\u70B9\u540E\u8981\u6267\u884C\u7684\u5B8C\u6574\u6307\u4EE4\uFF08\u5199\u6E05\u4EA7\u51FA\u6587\u4EF6\u4E0E\u683C\u5F0F\uFF09" },
          schedule: SCHEDULE_PARAMS,
          timeZone: { type: "string", description: "IANA \u65F6\u533A\uFF0C\u4F8B\u5982 Asia/Shanghai\uFF1B\u7701\u7565\u65F6\u7528\u8C03\u7528\u65B9\u6240\u5728\u65F6\u533A" },
          workspaceId: { type: "string", description: "\u5BBF\u4E3B\u5DF2\u6CE8\u518C\u5DE5\u4F5C\u533A\u7684 id\uFF08\u63A8\u8350\uFF09\uFF1B\u4E0E workspace \u4E92\u65A5" },
          workspace: { type: "string", description: "\u53EF\u9009\uFF0C\u81EA\u5B9A\u4E49\u6267\u884C\u6587\u4EF6\u5939\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u7701\u7565\u4E14\u65E0 workspaceId \u65F6\u7528\u4EFB\u52A1\u72EC\u7ACB\u76EE\u5F55" },
          model: { type: "string", description: '\u53EF\u9009\uFF0C"provider/model"\uFF1B\u7701\u7565\u5219\u56FA\u5316\u8C03\u7528\u65F6\u7684\u5BBF\u4E3B\u9ED8\u8BA4\u6A21\u578B' },
          reasoningEffort: { type: "string", description: "\u53EF\u9009\u601D\u8003\u6863\u4F4D\uFF0C\u9700\u6240\u9009\u6A21\u578B\u652F\u6301" },
          permissionPreset: { type: "string", description: "\u5BBF\u4E3B\u6743\u9650\u9884\u8BBE\uFF0C\u4F8B\u5982 workspace-write / read-only\uFF1B\u5B8C\u5168\u6743\u9650\u53EA\u80FD\u5728\u4EFB\u52A1\u4E2D\u5FC3\u754C\u9762\u91CC\u624B\u52A8\u786E\u8BA4" },
          sessionMode: { type: "string", enum: ["independent", "persistent"] },
          missedPolicy: { type: "string", enum: ["catchup", "skip"] },
          maxRetries: { type: "number" },
          timeoutMinutes: { type: "number" },
          enabled: { type: "boolean" }
        },
        required: ["name", "prompt", "schedule"],
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: { task: TASK_ROW_SCHEMA, message: { type: "string" } },
        required: ["task", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args, exec) => {
        const zone = typeof args.timeZone === "string" && args.timeZone.trim().length > 0 ? args.timeZone.trim() : callerTimeZone(exec);
        if (!listTimeZones().includes(zone)) throw new Error(`\u672A\u77E5\u65F6\u533A ${zone}\uFF0C\u8BF7\u4F7F\u7528 IANA \u540D\u79F0\uFF0C\u4F8B\u5982 Asia/Shanghai`);
        const model = await resolveModel(engine, args.model);
        const preset = await resolvePreset(engine, args.permissionPreset);
        const draft = {
          id: "",
          name: String(args.name ?? "").trim(),
          prompt: String(args.prompt ?? ""),
          attachments: [],
          model,
          modelSource: model === null ? "legacy" : "explicit",
          reasoningEffort: typeof args.reasoningEffort === "string" ? args.reasoningEffort : null,
          workspaceId: typeof args.workspaceId === "string" && args.workspaceId.trim() !== "" ? args.workspaceId.trim() : null,
          workspace: typeof args.workspace === "string" && args.workspace.trim() !== "" ? args.workspace.trim() : null,
          workspaceSource: typeof args.workspaceId === "string" && args.workspaceId.trim() !== "" ? "workspace" : "custom",
          sessionMode: args.sessionMode === "persistent" ? "persistent" : "independent",
          sessionId: null,
          sessionModelKey: null,
          permissionPreset: preset,
          permissionSource: preset === null ? "legacy" : "preset",
          permission: { approval: "never", sandbox: "workspace-write" },
          legacyIssues: [],
          schedule: scheduleFrom(args.schedule ?? args),
          timeZone: zone,
          startAt: null,
          endAt: null,
          missedPolicy: args.missedPolicy === "skip" ? "skip" : "catchup",
          enabled: args.enabled !== false,
          maxRetries: args.maxRetries === void 0 ? 1 : Number(args.maxRetries),
          timeoutMinutes: args.timeoutMinutes === void 0 ? 20 : Number(args.timeoutMinutes),
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          nextRunAt: null,
          lastRunAt: null,
          lastRunStatus: null,
          lastError: null,
          templateId: null
        };
        const saved = engine.saveTask(draft);
        if (!saved.ok) throw new Error(saved.message);
        const row = taskRow(engine, saved.value);
        return {
          task: row,
          message: `\u5DF2\u521B\u5EFA\u4EFB\u52A1\u300C${row.name}\u300D\uFF08${row.id}\uFF09\u3002
\u89C4\u5219\uFF1A${row.schedule}\uFF5C\u65F6\u533A\uFF1A${row.timeZone}\uFF5C${row.enabled ? "\u5DF2\u542F\u7528" : "\u5DF2\u6682\u505C"}
${row.nextRunAt === "" ? "\u4E0B\u6B21\u6267\u884C\uFF1A\u6682\u65E0\uFF08\u5DF2\u6682\u505C\u6216\u8D85\u51FA\u6709\u6548\u671F\uFF09" : `\u4E0B\u6B21\u6267\u884C\uFF1A${row.nextRunAt}`}
\u6A21\u578B\uFF1A${row.model}\uFF08${row.modelSource}\uFF09\uFF5C\u6743\u9650\uFF1A${row.permission}\uFF5C${row.sessionMode}
\u5DE5\u4F5C\u6587\u4EF6\u5939\uFF1A${row.workspace === "" ? "\uFF08\u4EFB\u52A1\u72EC\u7ACB\u76EE\u5F55\uFF09" : row.workspace}\uFF08${row.workspaceSource}\uFF09` + (row.notes === "" ? "" : `
\u6CE8\u610F\uFF1A${row.notes}`)
        };
      }
    }),
    tool({
      name: "task_list",
      description: "\u5217\u51FA\u300C\u81EA\u52A8\u5316\u4EFB\u52A1\u4E2D\u5FC3\u300D\u91CC\u7684\u4EFB\u52A1\uFF08\u540D\u79F0\u3001\u89C4\u5219\u3001\u4E0B\u6B21\u6267\u884C\u3001\u4E0A\u6B21\u7ED3\u679C\uFF09\u3002\u7528\u4E8E\u56DE\u7B54\u201C\u6211\u6709\u54EA\u4E9B\u5B9A\u65F6\u4EFB\u52A1\u201D\u3002",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", enum: ["all", "enabled", "paused"], description: "\u9ED8\u8BA4 all" },
          query: { type: "string", description: "\u53EF\u9009\uFF0C\u6309\u540D\u79F0\u6216\u63D0\u793A\u8BCD\u6A21\u7CCA\u5339\u914D" }
        },
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: { tasks: { type: "array", items: TASK_ROW_SCHEMA }, message: { type: "string" } },
        required: ["tasks", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args) => {
        const filter = args.filter === "enabled" || args.filter === "paused" ? args.filter : "all";
        const needle = typeof args.query === "string" && args.query.trim().length > 0 ? args.query.trim().toLowerCase() : null;
        const snapshot = await engine.snapshot();
        const rows = snapshot.tasks.filter((task) => filter === "enabled" ? task.enabled : filter === "paused" ? !task.enabled : true).filter((task) => needle === null ? true : `${task.name}
${task.prompt}`.toLowerCase().includes(needle)).map((task) => taskRow(engine, task));
        return {
          tasks: rows,
          message: rows.length === 0 ? "\u5F53\u524D\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u4EFB\u52A1\u3002" : `\u5171 ${rows.length} \u4E2A\u4EFB\u52A1\uFF1A
${rows.map(renderTaskLine).join("\n")}`
        };
      }
    }),
    tool({
      name: "task_get",
      description: "\u8BFB\u53D6\u4E00\u4E2A\u4EFB\u52A1\u7684\u5B8C\u6574\u914D\u7F6E\uFF08\u63D0\u793A\u8BCD\u3001\u8C03\u5EA6\u3001\u65F6\u533A\u3001\u6A21\u578B\u3001\u5DE5\u4F5C\u6587\u4EF6\u5939\u3001\u6743\u9650\u3001\u6700\u8FD1\u4E00\u6B21\u8FD0\u884C\uFF09\u3002",
      parameters: {
        type: "object",
        properties: { idOrName: { type: "string", description: "\u4EFB\u52A1 id \u6216\u4EFB\u52A1\u540D\u79F0" } },
        required: ["idOrName"],
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: { task: TASK_ROW_SCHEMA, prompt: { type: "string" }, message: { type: "string" } },
        required: ["task", "prompt", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args) => {
        const task = findTask(engine, String(args.idOrName ?? ""));
        const row = taskRow(engine, task);
        return {
          task: row,
          prompt: task.prompt,
          message: `${renderTaskLine(row)}
\u6F0F\u8DD1\u7B56\u7565\uFF1A${task.missedPolicy === "catchup" ? "\u8865\u8DD1\u6700\u8FD1\u4E00\u6B21" : "\u8DF3\u8FC7"}\uFF5C\u91CD\u8BD5\uFF1A${task.maxRetries} \u6B21\uFF5C\u8D85\u65F6\uFF1A${task.timeoutMinutes} \u5206\u949F
\u6743\u9650\uFF1Aapproval=${task.permission.approval}\uFF0Csandbox=${task.permission.sandbox}
\u63D0\u793A\u8BCD\uFF1A
${task.prompt}`
        };
      }
    }),
    tool({
      name: "task_update",
      description: "\u4FEE\u6539\u4E00\u4E2A\u5DF2\u5B58\u5728\u7684\u4EFB\u52A1\uFF08\u53EA\u4F20\u8981\u6539\u7684\u5B57\u6BB5\uFF09\u3002\u4E0E\u754C\u9762\u91CC\u7684\u7F16\u8F91\u8868\u5355\u5171\u7528\u540C\u4E00\u4EFD\u6821\u9A8C\uFF1B\u6539\u8C03\u5EA6\u6216\u542F\u7528\u72B6\u6001\u4F1A\u91CD\u7B97\u4E0B\u6B21\u6267\u884C\u65F6\u95F4\u3002",
      parameters: {
        type: "object",
        properties: {
          idOrName: { type: "string", description: "\u4EFB\u52A1 id \u6216\u4EFB\u52A1\u540D\u79F0" },
          name: { type: "string" },
          prompt: { type: "string" },
          schedule: SCHEDULE_PARAMS,
          timeZone: { type: "string" },
          workspaceId: { type: "string", description: '\u5BBF\u4E3B\u5DF2\u6CE8\u518C\u5DE5\u4F5C\u533A id\uFF1B\u4F20 "" \u6E05\u7A7A' },
          workspace: { type: "string", description: '\u81EA\u5B9A\u4E49\u8DEF\u5F84\uFF1B\u4F20 "" \u6E05\u7A7A' },
          model: { type: "string", description: '\u5199\u6210 "provider/model"' },
          reasoningEffort: { type: "string" },
          permissionPreset: { type: "string", description: "\u5BBF\u4E3B\u6743\u9650\u9884\u8BBE\u540D\uFF1B\u5FC5\u987B\u662F\u5BBF\u4E3B\u76EE\u5F55\u91CC\u7684\u503C\uFF08\u5B8C\u5168\u6743\u9650\u4E0D\u5141\u8BB8\u5728\u5BF9\u8BDD\u91CC\u8BBE\u7F6E\uFF09" },
          sessionMode: { type: "string", enum: ["independent", "persistent"] },
          missedPolicy: { type: "string", enum: ["catchup", "skip"] },
          maxRetries: { type: "number" },
          timeoutMinutes: { type: "number" },
          enabled: { type: "boolean" }
        },
        required: ["idOrName"],
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: { task: TASK_ROW_SCHEMA, message: { type: "string" } },
        required: ["task", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args) => {
        const current = findTask(engine, String(args.idOrName ?? ""));
        const next = structuredClone(current);
        if (typeof args.name === "string") next.name = args.name;
        if (typeof args.prompt === "string") next.prompt = args.prompt;
        if (args.schedule !== void 0 && args.schedule !== null) next.schedule = scheduleFrom(args.schedule);
        if (typeof args.timeZone === "string") {
          if (!listTimeZones().includes(args.timeZone)) throw new Error(`\u672A\u77E5\u65F6\u533A ${args.timeZone}`);
          next.timeZone = args.timeZone;
        }
        if (typeof args.workspaceId === "string") {
          next.workspaceId = args.workspaceId.trim() === "" ? null : args.workspaceId.trim();
          next.workspaceSource = next.workspaceId === null ? "custom" : "workspace";
        }
        if (typeof args.workspace === "string") {
          next.workspace = args.workspace.trim() === "" ? null : args.workspace.trim();
          next.workspaceSource = next.workspace === null ? "task-dir" : "custom";
        }
        if (typeof args.permissionPreset === "string") {
          next.permissionPreset = await resolvePreset(engine, args.permissionPreset);
          next.permissionSource = next.permissionPreset === null ? "legacy" : "preset";
        }
        if (args.model !== void 0) {
          next.model = args.model === "default" || args.model === null ? null : await resolveModel(engine, args.model);
          if (next.model === null) next.reasoningEffort = null;
        }
        if (typeof args.reasoningEffort === "string") next.reasoningEffort = args.reasoningEffort;
        if (args.sessionMode === "persistent" || args.sessionMode === "independent") next.sessionMode = args.sessionMode;
        if (args.missedPolicy === "catchup" || args.missedPolicy === "skip") next.missedPolicy = args.missedPolicy;
        if (args.maxRetries !== void 0) next.maxRetries = Number(args.maxRetries);
        if (args.timeoutMinutes !== void 0) next.timeoutMinutes = Number(args.timeoutMinutes);
        if (typeof args.enabled === "boolean") next.enabled = args.enabled;
        const saved = engine.saveTask(next);
        if (!saved.ok) throw new Error(saved.message);
        const row = taskRow(engine, saved.value);
        return {
          task: row,
          message: `\u5DF2\u66F4\u65B0\u4EFB\u52A1\u300C${row.name}\u300D\u3002
${renderTaskLine(row)}`
        };
      }
    }),
    tool({
      name: "task_enabled",
      description: "\u542F\u7528\u6216\u6682\u505C\u4E00\u4E2A\u4EFB\u52A1\u3002\u6682\u505C\u540E\u4E0D\u518D\u89E6\u53D1\u65B0\u7684\u8FD0\u884C\uFF0C\u6B63\u5728\u8FD0\u884C\u7684\u90A3\u6B21\u4E0D\u53D7\u5F71\u54CD\uFF08\u7528 run_cancel \u505C\u6B62\uFF09\u3002",
      parameters: {
        type: "object",
        properties: {
          idOrName: { type: "string", description: "\u4EFB\u52A1 id \u6216\u4EFB\u52A1\u540D\u79F0" },
          enabled: { type: "boolean", description: "true=\u542F\u7528\uFF0Cfalse=\u6682\u505C" }
        },
        required: ["idOrName", "enabled"],
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: { task: TASK_ROW_SCHEMA, message: { type: "string" } },
        required: ["task", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args) => {
        const task = findTask(engine, String(args.idOrName ?? ""));
        const result = engine.setEnabled(task.id, args.enabled === true);
        if (!result.ok) throw new Error(result.message);
        const row = taskRow(engine, result.value);
        return {
          task: row,
          message: `\u4EFB\u52A1\u300C${row.name}\u300D\u5DF2${row.enabled ? "\u542F\u7528" : "\u6682\u505C"}\u3002${row.enabled ? row.nextRunAt === "" ? "\uFF08\u5F53\u524D\u65E0\u4E0B\u6B21\u6267\u884C\uFF0C\u8BF7\u68C0\u67E5\u6709\u6548\u671F\uFF09" : `\u4E0B\u6B21\u6267\u884C\uFF1A${row.nextRunAt}` : ""}`
        };
      }
    }),
    tool({
      name: "task_run",
      description: "\u7ACB\u5373\u8FD0\u884C\u4E00\u4E2A\u4EFB\u52A1\uFF08\u4E0D\u7B49\u8BA1\u5212\u65F6\u95F4\uFF09\u3002\u4F1A\u771F\u5B9E\u542F\u52A8\u4E00\u8F6E Agent\uFF0C\u8FD0\u884C\u8BB0\u5F55\u5728\u300C\u8FD0\u884C\u8BB0\u5F55\u300D\u91CC\u53EF\u67E5\u3002",
      parameters: {
        type: "object",
        properties: { idOrName: { type: "string", description: "\u4EFB\u52A1 id \u6216\u4EFB\u52A1\u540D\u79F0" } },
        required: ["idOrName"],
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: {
          run: {
            type: "object",
            properties: {
              id: { type: "string" },
              taskId: { type: "string" },
              status: { type: "string" },
              trigger: { type: "string" }
            },
            required: ["id", "taskId", "status", "trigger"],
            additionalProperties: false
          },
          message: { type: "string" }
        },
        required: ["run", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args) => {
        const task = findTask(engine, String(args.idOrName ?? ""));
        const result = engine.runNow(task.id);
        if (!result.ok) throw new Error(result.message);
        const run = result.value;
        return {
          run: { id: run.id, taskId: run.taskId, status: run.status, trigger: run.trigger },
          message: `\u5DF2\u628A\u4EFB\u52A1\u300C${task.name}\u300D\u52A0\u5165\u8FD0\u884C\u961F\u5217\uFF08\u8FD0\u884C ${run.id}\uFF0C\u72B6\u6001 ${run.status}\uFF09\u3002\u5728\u300C\u81EA\u52A8\u5316\u4EFB\u52A1 \u2192 \u8FD0\u884C\u8BB0\u5F55\u300D\u53EF\u770B\u5B9E\u65F6\u72B6\u6001\u3001\u5DE5\u5177\u4E0E\u4EA7\u7269\u3002`
        };
      }
    }),
    tool({
      name: "task_delete",
      description: "\u5220\u9664\u4E00\u4E2A\u4EFB\u52A1\u3002\u5386\u53F2\u8FD0\u884C\u8BB0\u5F55\u4F1A\u4FDD\u7559\uFF0C\u4FBF\u4E8E\u8FFD\u6EAF\uFF08\u8BB0\u5F55\u91CC\u4E0D\u542B\u63D0\u793A\u8BCD\u5185\u5BB9\uFF09\u3002",
      parameters: {
        type: "object",
        properties: { idOrName: { type: "string", description: "\u4EFB\u52A1 id \u6216\u4EFB\u52A1\u540D\u79F0" } },
        required: ["idOrName"],
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: { id: { type: "string" }, message: { type: "string" } },
        required: ["id", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args) => {
        const task = findTask(engine, String(args.idOrName ?? ""));
        const result = engine.deleteTask(task.id);
        if (!result.ok) throw new Error(result.message);
        return { id: task.id, message: `\u5DF2\u5220\u9664\u4EFB\u52A1\u300C${task.name}\u300D\u3002\u8FD0\u884C\u5386\u53F2\u4ECD\u7136\u4FDD\u7559\u3002` };
      }
    }),
    tool({
      name: "run_list",
      description: "\u67E5\u770B\u8FD0\u884C\u8BB0\u5F55\uFF08\u72B6\u6001\u3001\u89E6\u53D1\u65B9\u5F0F\u3001\u8017\u65F6\u3001\u4EA7\u7269\u6570\u91CF\uFF09\u3002\u7528\u4E8E\u56DE\u7B54\u201C\u6628\u5929\u90A3\u4E2A\u4EFB\u52A1\u8DD1\u6210\u529F\u4E86\u5417\u201D\u3002",
      parameters: {
        type: "object",
        properties: {
          idOrName: { type: "string", description: "\u53EF\u9009\uFF0C\u53EA\u770B\u67D0\u4E2A\u4EFB\u52A1" },
          status: {
            type: "string",
            enum: ["all", "queued", "running", "waiting-approval", "succeeded", "failed", "cancelled", "timeout"]
          },
          limit: { type: "number", description: "\u6700\u591A\u8FD4\u56DE\u51E0\u6761\uFF0C\u9ED8\u8BA4 10" }
        },
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: {
          runs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                taskName: { type: "string" },
                status: { type: "string" },
                trigger: { type: "string" },
                startedAt: { type: "string" },
                durationMs: { type: "number" },
                artifacts: { type: "number" },
                error: { type: "string" }
              },
              required: ["id", "taskName", "status", "trigger", "startedAt", "durationMs", "artifacts", "error"],
              additionalProperties: false
            }
          },
          message: { type: "string" }
        },
        required: ["runs", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args) => {
        const task = typeof args.idOrName === "string" && args.idOrName.trim() !== "" ? findTask(engine, args.idOrName) : null;
        const runs = engine.listRuns({
          ...task === null ? {} : { taskId: task.id },
          ...typeof args.status === "string" ? { status: args.status } : {},
          ...args.limit === void 0 ? {} : { limit: Math.max(1, Math.min(50, Number(args.limit))) }
        });
        const rows = runs.map((run) => ({
          id: run.id,
          taskName: run.taskName,
          status: run.status,
          trigger: run.trigger,
          startedAt: run.startedAt ?? run.createdAt,
          durationMs: run.durationMs ?? 0,
          artifacts: run.artifacts.length,
          error: run.error?.message ?? ""
        }));
        return {
          runs: rows,
          message: rows.length === 0 ? "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u8FD0\u884C\u8BB0\u5F55\u3002" : rows.map(
            (row) => `- ${row.startedAt}\uFF5C${row.taskName}\uFF5C${row.status}\uFF08${row.trigger === "schedule" ? "\u5B9A\u65F6" : row.trigger === "catchup" ? "\u8865\u8DD1" : row.trigger === "manual" ? "\u624B\u52A8" : "\u91CD\u8BD5"}\uFF09\uFF5C${Math.round(row.durationMs / 1e3)}s\uFF5C\u4EA7\u7269 ${row.artifacts}${row.error === "" ? "" : `\uFF5C\u9519\u8BEF\uFF1A${row.error}`}`
          ).join("\n")
        };
      }
    }),
    tool({
      name: "run_cancel",
      description: "\u505C\u6B62\u4E00\u6B21\u6B63\u5728\u8FD0\u884C\uFF08\u6216\u6392\u961F\u4E2D\uFF09\u7684\u8FD0\u884C\u3002\u5DF2\u7ED3\u675F\u7684\u8BB0\u5F55\u4E0D\u4F1A\u88AB\u6539\u52A8\u3002",
      parameters: {
        type: "object",
        properties: { runId: { type: "string", description: "\u8FD0\u884C\u8BB0\u5F55 id\uFF08run_list \u53EF\u67E5\uFF09" } },
        required: ["runId"],
        additionalProperties: false
      },
      schema: {
        type: "object",
        properties: { runId: { type: "string" }, message: { type: "string" } },
        required: ["runId", "message"],
        additionalProperties: false
      },
      render: (value) => value.message,
      execute: async (args) => {
        const runId = String(args.runId ?? "");
        const result = engine.cancelRun(runId);
        if (!result.ok) throw new Error(result.message);
        return { runId, message: `\u5DF2\u8BF7\u6C42\u505C\u6B62\u8FD0\u884C ${runId}\uFF0C\u72B6\u6001\u4F1A\u5728\u8BB0\u5F55\u91CC\u66F4\u65B0\u3002` };
      }
    })
  ];
}
function registerTools(ctx, deps) {
  const disposers = [];
  for (const definition of buildTools(deps)) {
    disposers.push(ctx.tools.register(definition));
  }
  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {
      }
    }
  };
}

// src/index.ts
var name = "dsh-task-center";
var inject = ["webServer", "sessionController", "tools", "approval"];
var DEFAULTS = {
  maxConcurrentRuns: 2,
  runHistory: 300,
  defaultTimeoutMinutes: 20,
  graceSeconds: 90,
  diagnostics: false
};
function apply(ctx, config = {}) {
  const options = { ...DEFAULTS, ...config };
  const home = process.env.DSH_HOME ?? join5(homedir(), ".dsh");
  const dataRoot = join5(home, "storages", "dsh-task-center");
  const stateFile = join5(dataRoot, "state.json");
  const log = makeLog(ctx);
  const store = new TaskStore(stateFile);
  const restored = store.load();
  if (restored.recovered) log("warn", `\u4EFB\u52A1\u5B58\u50A8\u9700\u8981\u4FEE\u590D\uFF1A${restored.message ?? ""}`);
  if (restored.dropped > 0) {
    log("warn", `\u4EFB\u52A1\u5B58\u50A8\u91CC\u6709 ${restored.dropped} \u6761\u8BB0\u5F55\u65E0\u6CD5\u8BC6\u522B\uFF0C\u5DF2\u8DF3\u8FC7\uFF1B\u5176\u4F59\u8BB0\u5F55\u6B63\u5E38\u52A0\u8F7D`);
  }
  const engine = new TaskEngine(ctx, store, {
    maxConcurrentRuns: options.maxConcurrentRuns,
    runHistory: options.runHistory,
    defaultTimeoutMinutes: options.defaultTimeoutMinutes,
    graceSeconds: options.graceSeconds,
    dataRoot,
    log
  });
  ctx.effect(() => {
    const previous = installed();
    if (typeof previous?.dispose === "function") {
      try {
        previous.dispose();
        log("warn", "\u68C0\u6D4B\u5230\u4E0A\u4E00\u4EE3\u4EFB\u52A1\u4E2D\u5FC3\u4ECD\u5728\u8FD0\u884C\uFF0C\u5DF2\u5148\u505C\u6389\u5B83\u518D\u6302\u8F7D\u65B0\u7684");
      } catch {
      }
    }
    const disposeApi = registerApi(ctx, { engine, store, dataRoot, log, diagnostics: options.diagnostics });
    const disposeTools = registerTools(ctx, { engine, ctx });
    void engine.start().catch((error) => log("error", `\u4EFB\u52A1\u4E2D\u5FC3\u542F\u52A8\u5931\u8D25\uFF1A${error.message}`));
    log("info", "\u5BF9\u8BDD\u5DE5\u5177\u5DF2\u6CE8\u518C\uFF1Atask_create / task_list / task_get / task_update / task_enabled / task_run / task_delete / run_list / run_cancel");
    const dispose = () => {
      try {
        disposeTools();
      } catch {
      }
      try {
        disposeApi();
      } catch {
      }
      engine.dispose();
    };
    const record = { dispose };
    install(record);
    return () => {
      if (installed() === record) uninstall();
      dispose();
      log("info", "\u4EFB\u52A1\u4E2D\u5FC3\u5DF2\u5378\u8F7D\uFF1A\u5DE5\u5177\u3001\u8BA1\u65F6\u5668\u3001\u4F1A\u8BDD\u76D1\u542C\u4E0E\u8FD0\u884C\u8D44\u6E90\u5DF2\u91CA\u653E");
    };
  }, "dsh-task-center: engine + api + tools");
}
var INSTALLED = Symbol.for("dsh.task-center.installed");
function installed() {
  return globalThis[INSTALLED];
}
function install(record) {
  ;
  globalThis[INSTALLED] = record;
}
function uninstall() {
  delete globalThis[INSTALLED];
}
function makeLog(ctx) {
  return (level, text) => {
    const line = `[task-center] ${text}`;
    try {
      const logger = typeof ctx.logger === "function" ? ctx.logger("task-center") : ctx.logger;
      const sink = logger?.[level] ?? logger?.log;
      if (typeof sink === "function") {
        sink.call(logger, line);
        return;
      }
    } catch {
    }
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=impl.js.map
