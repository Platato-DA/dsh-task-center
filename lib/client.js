window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-task-center",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		"use strict";
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name2 in all)
		    __defProp(target, name2, { get: all[name2], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
		  // If the importer is in node compatibility mode or this is not an ESM
		  // file that has been converted to a CommonJS file using a Babel-
		  // compatible transform (i.e. "__esModule" has not been set), then set
		  // "default" to the CommonJS "module.exports" for node compatibility.
		  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
		  mod
		));
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.tsx
		var index_exports = {};
		__export(index_exports, {
		  TaskCenterPage: () => TaskCenterPage,
		  apply: () => apply,
		  inject: () => inject,
		  name: () => name,
		  source: () => source
		});
		module.exports = __toCommonJS(index_exports);
		var React = __toESM(require("react"), 1);

		// src/host/time.ts
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

		// src/client/index.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		var API = "/dsh-task-center/api";
		var NATIVE_PANEL_ID = "schedules";
		var LEGACY_PANEL_ID = "task-center";
		var POLL_MS = 2500;
		async function call(request) {
		  try {
		    const response = await fetch(API, {
		      method: "POST",
		      headers: { "content-type": "application/json" },
		      body: JSON.stringify(request),
		      credentials: "same-origin"
		    });
		    return await response.json();
		  } catch (error) {
		    return { ok: false, code: "network", message: `\u65E0\u6CD5\u8FDE\u63A5\u4EFB\u52A1\u4E2D\u5FC3\uFF1A${error.message}` };
		  }
		}
		function useSnapshot() {
		  const [snapshot, setSnapshot] = React.useState(null);
		  const [error, setError] = React.useState(null);
		  const load = React.useCallback(async () => {
		    const result = await call({ op: "state" });
		    if (result.ok) {
		      setSnapshot(result.value);
		      setError(null);
		    } else {
		      setError(result.message);
		    }
		  }, []);
		  React.useEffect(() => {
		    let alive = true;
		    const tick = () => {
		      void call({ op: "state" }).then((result) => {
		        if (!alive) return;
		        if (result.ok) {
		          setSnapshot(result.value);
		          setError(null);
		        } else {
		          setError(result.message);
		        }
		      });
		    };
		    tick();
		    const handle = setInterval(tick, POLL_MS);
		    return () => {
		      alive = false;
		      clearInterval(handle);
		    };
		  }, []);
		  return { snapshot, error, reload: () => void load() };
		}
		var C = {
		  base: "var(--dsw-alias-bg-base)",
		  layer1: "var(--dsw-alias-bg-layer-1)",
		  layer2: "var(--dsw-alias-bg-layer-2)",
		  layer3: "var(--dsw-alias-bg-layer-3)",
		  border: "var(--dsw-alias-border-l2)",
		  borderSoft: "var(--dsw-alias-border-l1)",
		  label: "var(--dsw-alias-label-primary)",
		  label2: "var(--dsw-alias-label-secondary)",
		  label3: "var(--dsw-alias-label-tertiary)",
		  caption: "var(--dsw-alias-label-caption)",
		  error: "var(--dsw-alias-label-error)",
		  brand: "var(--dsw-alias-brand-primary)",
		  primary: "var(--dsw-alias-button-primary-fill)",
		  primaryHover: "var(--dsw-alias-button-primary-hover)",
		  onPrimary: "var(--dsw-alias-label-primary-foreground)",
		  hover: "var(--dsw-alias-interactive-bg-hover)",
		  hoverDanger: "var(--dsw-alias-interactive-bg-hover-danger)",
		  success: "var(--dsw-alias-state-success-primary)",
		  successSoft: "var(--dsw-alias-state-success-tertiary)",
		  warn: "var(--dsw-alias-state-warn-primary)",
		  warnSoft: "var(--dsw-alias-state-warn-tertiary)",
		  danger: "var(--dsw-alias-state-error-primary)"
		};
		var card = {
		  background: C.layer1,
		  border: `1px solid ${C.borderSoft}`,
		  borderRadius: 10,
		  padding: "14px 16px"
		};
		var inputStyle = {
		  font: "inherit",
		  fontSize: 13,
		  color: C.label,
		  background: C.layer2,
		  border: `1px solid ${C.border}`,
		  borderRadius: 8,
		  padding: "6px 10px",
		  outline: "none",
		  minWidth: 0
		};
		function buttonStyle(kind = "ghost") {
		  const base = {
		    font: "inherit",
		    fontSize: 12,
		    borderRadius: 8,
		    padding: "5px 11px",
		    cursor: "pointer",
		    border: `1px solid ${kind === "primary" ? "transparent" : C.border}`,
		    transition: "background var(--ds-transition-duration, 120ms) var(--ds-ease-in-out, ease)",
		    whiteSpace: "nowrap"
		  };
		  if (kind === "primary") {
		    return { ...base, background: C.primary, color: C.onPrimary, borderColor: "transparent" };
		  }
		  if (kind === "danger") {
		    return { ...base, background: "transparent", color: C.error, borderColor: C.border };
		  }
		  return { ...base, background: C.layer2, color: C.label };
		}
		var STATUS_TEXT = {
		  queued: "\u6392\u961F\u4E2D",
		  running: "\u8FD0\u884C\u4E2D",
		  "waiting-approval": "\u7B49\u5F85\u5BA1\u6279",
		  succeeded: "\u6210\u529F",
		  failed: "\u5931\u8D25",
		  cancelled: "\u5DF2\u53D6\u6D88",
		  timeout: "\u8D85\u65F6"
		};
		function statusColor(status) {
		  switch (status) {
		    case "succeeded":
		      return { fg: C.success, bg: C.successSoft };
		    case "failed":
		    case "timeout":
		      return { fg: C.error, bg: C.warnSoft };
		    case "running":
		      return { fg: C.brand, bg: C.layer2 };
		    case "waiting-approval":
		      return { fg: C.warn, bg: C.warnSoft };
		    default:
		      return { fg: C.label2, bg: C.layer2 };
		  }
		}
		var TRIGGER_TEXT = {
		  schedule: "\u5B9A\u65F6",
		  catchup: "\u8865\u8DD1",
		  manual: "\u624B\u52A8",
		  retry: "\u91CD\u8BD5"
		};
		function StatusBadge({ status }) {
		  const color = statusColor(status);
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    "span",
		    {
		      style: {
		        display: "inline-flex",
		        alignItems: "center",
		        gap: 5,
		        fontSize: 11,
		        lineHeight: "18px",
		        padding: "0 8px",
		        borderRadius: 999,
		        color: color.fg,
		        background: color.bg,
		        border: `1px solid ${color.fg}22`
		      },
		      children: STATUS_TEXT[status] ?? status
		    }
		  );
		}
		function formatDuration(ms) {
		  if (ms === null || !Number.isFinite(ms)) return "\u2014";
		  if (ms < 1e3) return `${ms} \u6BEB\u79D2`;
		  const seconds = Math.round(ms / 1e3);
		  if (seconds < 60) return `${seconds} \u79D2`;
		  const minutes = Math.floor(seconds / 60);
		  const rest = seconds % 60;
		  return rest === 0 ? `${minutes} \u5206` : `${minutes} \u5206 ${rest} \u79D2`;
		}
		function formatBytes(size) {
		  if (size < 1024) return `${size} B`;
		  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
		  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
		}
		function shortTime(iso, timeZone) {
		  if (iso === null) return "\u2014";
		  const at = Date.parse(iso);
		  return Number.isFinite(at) ? formatInstant(at, timeZone) : "\u2014";
		}
		function TaskCenterPage(props) {
		  const { snapshot, error, reload } = useSnapshot();
		  const [tab, setTab] = React.useState("tasks");
		  const [statusFilter, setStatusFilter] = React.useState("all");
		  const [query, setQuery] = React.useState("");
		  const [selected, setSelected] = React.useState([]);
		  const [editing, setEditing] = React.useState(null);
		  const [templatePicker, setTemplatePicker] = React.useState(false);
		  const [detailRun, setDetailRun] = React.useState(null);
		  const [toast, setToast] = React.useState(null);
		  const [busy, setBusy] = React.useState(false);
		  const [confirmBulk, setConfirmBulk] = React.useState(false);
		  const [runTaskId, setRunTaskId] = React.useState("all");
		  const [sourceFilter, setSourceFilter] = React.useState("all");
		  const [pickedReminders, setPickedReminders] = React.useState([]);
		  const [reminderDetail, setReminderDetail] = React.useState(null);
		  const openSession = React.useCallback((sessionId) => {
		    if (sessionId === null) return;
		    const workspace = props.uiWorkspace;
		    workspace?.openSession?.(sessionId);
		  }, [props]);
		  React.useEffect(() => {
		    if (toast === null) return;
		    const handle = setTimeout(() => setToast(null), 3200);
		    return () => clearTimeout(handle);
		  }, [toast]);
		  const tasks = snapshot?.tasks ?? [];
		  const runs = snapshot?.runs ?? [];
		  const reminders = snapshot?.reminders ?? [];
		  const reminderError = snapshot?.reminderError ?? null;
		  const zone = snapshot?.timeZone ?? "UTC";
		  const counts = {
		    all: tasks.length + reminders.length,
		    enabled: tasks.filter((task) => task.enabled).length + reminders.filter((row) => row.status === "active").length,
		    paused: tasks.filter((task) => !task.enabled).length + reminders.filter((row) => row.status === "inactive").length,
		    auto: tasks.length,
		    reminder: reminders.length
		  };
		  const matches = (name2, prompt) => {
		    const needle = query.trim().toLowerCase();
		    if (needle.length === 0) return true;
		    return `${name2}
		${prompt}`.toLowerCase().includes(needle);
		  };
		  const rows = [];
		  if (sourceFilter !== "reminder") {
		    for (const task of tasks) {
		      if (statusFilter === "enabled" && !task.enabled) continue;
		      if (statusFilter === "paused" && task.enabled) continue;
		      if (!matches(task.name, task.prompt)) continue;
		      rows.push({ kind: "auto", key: `auto:${task.id}`, task, nextAt: task.enabled ? task.nextRunAt : null });
		    }
		  }
		  if (sourceFilter !== "auto") {
		    for (const reminder of reminders) {
		      const active = reminder.status === "active";
		      if (statusFilter === "enabled" && !active) continue;
		      if (statusFilter === "paused" && active) continue;
		      if (!matches(reminder.title, reminder.prompt)) continue;
		      rows.push({
		        kind: "reminder",
		        key: reminder.key,
		        reminder,
		        nextAt: active && reminder.scheduledAt !== "" ? reminder.scheduledAt : null
		      });
		    }
		  }
		  rows.sort((left, right) => {
		    if (left.nextAt === null && right.nextAt === null) return left.key.localeCompare(right.key);
		    if (left.nextAt === null) return 1;
		    if (right.nextAt === null) return -1;
		    return left.nextAt.localeCompare(right.nextAt);
		  });
		  const visibleTasks = rows;
		  const act = async (request, successText) => {
		    setBusy(true);
		    const result = await call(request);
		    setBusy(false);
		    if (!result.ok) {
		      setToast(result.message);
		      return;
		    }
		    if (successText !== void 0) setToast(successText);
		  };
		  const startNew = (templateId) => {
		    const template = snapshot?.templates.find((entry) => entry.id === templateId) ?? null;
		    setEditing(draftTask(template, zone));
		    setTemplatePicker(false);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { height: "100%", overflow: "auto", background: C.base, color: C.label }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { maxWidth: 1040, margin: "0 auto", padding: "28px 28px 80px" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { style: { font: "inherit", fontSize: 20, fontWeight: 600, margin: 0 }, children: "\u81EA\u52A8\u5316\u4EFB\u52A1" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.label2, marginTop: 4 }, children: [
		            "\u81EA\u52A8\u6267\u884C\u4EFB\u52A1\u5230\u70B9\u771F\u6B63\u8DD1\u8D77\u6765\u5E76\u843D\u76D8\u4EA7\u7269\uFF1B\u5BF9\u8BDD\u63D0\u9192\u7531\u539F\u751F schedule \u670D\u52A1\u6295\u9012\u56DE\u539F\u4F1A\u8BDD\u3002\u5F53\u524D\u65F6\u533A ",
		            zone,
		            snapshot === null ? " \xB7 \u6B63\u5728\u8FDE\u63A5\u2026" : ""
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("ghost"), onClick: () => setTemplatePicker(true), disabled: busy, children: "\u4ECE\u6A21\u677F\u65B0\u5EFA" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("primary"), onClick: () => startNew("blank"), disabled: busy, children: "\uFF0B \u65B0\u5EFA\u4EFB\u52A1" })
		      ] }),
		      error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...card, marginTop: 14, borderColor: C.danger, color: C.error, fontSize: 12 }, children: error }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { style: { display: "flex", gap: 18, borderBottom: `1px solid ${C.borderSoft}`, margin: "16px 0 18px" }, children: ["tasks", "runs"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "button",
		        {
		          onClick: () => setTab(key),
		          style: {
		            font: "inherit",
		            fontSize: 13,
		            background: "transparent",
		            border: "none",
		            borderBottom: `2px solid ${tab === key ? C.brand : "transparent"}`,
		            color: tab === key ? C.label : C.label2,
		            padding: "6px 2px 8px",
		            cursor: "pointer",
		            fontWeight: tab === key ? 600 : 400
		          },
		          children: [
		            key === "tasks" ? "\u4EFB\u52A1" : "\u8FD0\u884C\u8BB0\u5F55",
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: 6, fontSize: 11, color: C.caption }, children: key === "tasks" ? counts.all : runs.length })
		          ]
		        },
		        key
		      )) }),
		      tab === "tasks" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		        reminderError !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "div",
		          {
		            style: {
		              ...card,
		              borderColor: C.warn,
		              color: C.warn,
		              fontSize: 12,
		              marginBottom: 12,
		              display: "flex",
		              alignItems: "center",
		              gap: 10
		            },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { flex: 1 }, children: [
		                reminderError,
		                "\uFF08\u81EA\u52A8\u4EFB\u52A1\u4ECD\u53EF\u6B63\u5E38\u4F7F\u7528\uFF09"
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: () => reload(), children: "\u91CD\u8BD5" })
		            ]
		          }
		        ) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 12, color: C.caption }, children: "\u6765\u6E90" }),
		          [
		            ["all", "\u5168\u90E8", counts.all],
		            ["auto", "\u81EA\u52A8\u6267\u884C", counts.auto],
		            ["reminder", "\u5BF9\u8BDD\u63D0\u9192", counts.reminder]
		          ].map(([key, label, count]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		            "button",
		            {
		              onClick: () => setSourceFilter(key),
		              style: {
		                ...buttonStyle(sourceFilter === key ? "primary" : "ghost"),
		                borderRadius: 999
		              },
		              children: [
		                label,
		                " ",
		                count
		              ]
		            },
		            key
		          )),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 12, color: C.caption }, children: "\u72B6\u6001" }),
		          [
		            ["all", "\u5168\u90E8", counts.all],
		            ["enabled", "\u8FD0\u884C\u4E2D", counts.enabled],
		            ["paused", "\u5DF2\u6682\u505C/\u5DF2\u7ED3\u675F", counts.paused]
		          ].map(([key, label, count]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		            "button",
		            {
		              onClick: () => setStatusFilter(key),
		              style: {
		                ...buttonStyle(statusFilter === key ? "primary" : "ghost"),
		                borderRadius: 999
		              },
		              children: [
		                label,
		                " ",
		                count
		              ]
		            },
		            key
		          )),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "input",
		            {
		              value: query,
		              onChange: (event) => setQuery(event.target.value),
		              placeholder: "\u641C\u7D22\u540D\u79F0\u6216\u63D0\u793A\u8BCD\uFF08\u4E24\u7C7B\u90FD\u641C\uFF09",
		              style: { ...inputStyle, width: 220 }
		            }
		          )
		        ] }),
		        selected.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "div",
		          {
		            style: {
		              ...card,
		              display: "flex",
		              gap: 8,
		              alignItems: "center",
		              marginBottom: 12,
		              padding: "8px 12px",
		              background: C.layer2
		            },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: 12, color: C.label2 }, children: [
		                "\u5DF2\u9009 ",
		                selected.length,
		                " \u9879",
		                busy ? " \xB7 \u5904\u7406\u4E2D\u2026" : ""
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		                "button",
		                {
		                  style: buttonStyle(),
		                  disabled: busy,
		                  onClick: async () => {
		                    setBusy(true);
		                    await act({ op: "task.bulk", ids: selected, action: "enable" }, `\u5DF2\u6279\u91CF\u542F\u7528 ${selected.length} \u4E2A\u4EFB\u52A1`);
		                    setBusy(false);
		                    setSelected([]);
		                  },
		                  children: "\u6279\u91CF\u542F\u7528"
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		                "button",
		                {
		                  style: buttonStyle(),
		                  disabled: busy,
		                  onClick: async () => {
		                    setBusy(true);
		                    await act({ op: "task.bulk", ids: selected, action: "pause" }, `\u5DF2\u6279\u91CF\u6682\u505C ${selected.length} \u4E2A\u4EFB\u52A1`);
		                    setBusy(false);
		                    setSelected([]);
		                  },
		                  children: "\u6279\u91CF\u6682\u505C"
		                }
		              ),
		              confirmBulk ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: 12, color: C.error }, children: [
		                  "\u5220\u9664 ",
		                  selected.length,
		                  " \u4E2A\u4EFB\u52A1\uFF1F\u5386\u53F2\u8BB0\u5F55\u4F1A\u4FDD\u7559"
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		                  "button",
		                  {
		                    style: buttonStyle("danger"),
		                    disabled: busy,
		                    onClick: async () => {
		                      setBusy(true);
		                      await act({ op: "task.bulk", ids: selected, action: "delete" }, `\u5DF2\u6279\u91CF\u5220\u9664 ${selected.length} \u4E2A\u4EFB\u52A1`);
		                      setBusy(false);
		                      setSelected([]);
		                      setConfirmBulk(false);
		                    },
		                    children: busy ? "\u5220\u9664\u4E2D\u2026" : "\u786E\u8BA4\u6279\u91CF\u5220\u9664"
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), disabled: busy, onClick: () => setConfirmBulk(false), children: "\u53D6\u6D88" })
		              ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("danger"), disabled: busy, onClick: () => setConfirmBulk(true), children: "\u6279\u91CF\u5220\u9664" })
		            ]
		          }
		        ) : null,
		        visibleTasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...card, textAlign: "center", padding: "44px 20px", color: C.label2 }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 13, marginBottom: 6 }, children: counts.all === 0 ? "\u8FD8\u6CA1\u6709\u4EFB\u52A1\u3002\u53EF\u4EE5\u65B0\u5EFA\u81EA\u52A8\u4EFB\u52A1\uFF0C\u6216\u8BA9\u5BF9\u8BDD\u91CC\u7684 Agent \u5E2E\u4F60\u521B\u5EFA\u3002" : "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u4EFB\u52A1\u3002" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: C.caption }, children: "\u81EA\u52A8\u4EFB\u52A1\u4F1A\u5728\u8BBE\u5B9A\u65F6\u95F4\u7528\u4F60\u6307\u5B9A\u7684\u6A21\u578B\u3001\u5728\u6307\u5B9A\u6587\u4EF6\u5939\u91CC\u771F\u6B63\u6267\u884C\u5E76\u7559\u4E0B\u4EA7\u7269\uFF1B\u5BF9\u8BDD\u63D0\u9192\u53EA\u628A\u6D88\u606F\u6295\u9012\u56DE\u539F\u4F1A\u8BDD\u3002" })
		        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: visibleTasks.map(
		          (row) => row.kind === "auto" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            TaskCard,
		            {
		              task: row.task,
		              zone,
		              busy,
		              checked: selected.includes(row.task.id),
		              onCheck: (checked) => setSelected(
		                (current) => checked ? [...current, row.task.id] : current.filter((id) => id !== row.task.id)
		              ),
		              onToggle: () => void act({ op: "task.enabled", id: row.task.id, enabled: !row.task.enabled }),
		              onRun: () => void act({ op: "run.now", id: row.task.id }, "\u5DF2\u52A0\u5165\u8FD0\u884C\u961F\u5217"),
		              onEdit: () => setEditing(row.task),
		              onDuplicate: () => void act({ op: "task.duplicate", id: row.task.id }, "\u5DF2\u590D\u5236\u4EFB\u52A1"),
		              onDelete: () => void act({ op: "task.delete", id: row.task.id }, "\u5DF2\u5220\u9664\u4EFB\u52A1"),
		              onOpenRuns: () => {
		                setTab("runs");
		                setQuery("");
		                setRunTaskId(row.task.id);
		              }
		            },
		            row.key
		          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            ReminderCard,
		            {
		              reminder: row.reminder,
		              zone,
		              busy,
		              checked: pickedReminders.includes(row.reminder.id),
		              onCheck: (checked) => setPickedReminders(
		                (current) => checked ? [...current, row.reminder.id] : current.filter((id) => id !== row.reminder.id)
		              ),
		              onOpen: () => setReminderDetail(row.reminder),
		              onOpenSession: (sessionId) => openSession(sessionId),
		              onDelete: async () => {
		                const result = await call({
		                  op: "reminder.delete",
		                  id: row.reminder.id,
		                  sessionId: row.reminder.sessionId
		                });
		                setToast(result.ok ? "\u5DF2\u5220\u9664\u63D0\u9192" : result.message);
		                if (result.ok) {
		                  setPickedReminders((current) => current.filter((id) => id !== row.reminder.id));
		                  reload();
		                }
		              }
		            },
		            row.key
		          )
		        ) }),
		        pickedReminders.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "div",
		          {
		            style: {
		              ...card,
		              marginTop: 12,
		              background: C.layer2,
		              display: "flex",
		              gap: 10,
		              alignItems: "center",
		              flexWrap: "wrap"
		            },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: 12, color: C.label2 }, children: [
		                "\u5DF2\u9009 ",
		                pickedReminders.length,
		                " \u6761\u5BF9\u8BDD\u63D0\u9192 \xB7 \u539F\u751F\u63D0\u9192\u4E0D\u652F\u6301\u6279\u91CF\u542F\u7528/\u6682\u505C\uFF0C\u5220\u9664\u4F1A\u9010\u6761\u6267\u884C\u5E76\u6C47\u62A5\u7ED3\u679C"
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		                "button",
		                {
		                  style: buttonStyle("danger"),
		                  disabled: busy,
		                  onClick: async () => {
		                    setBusy(true);
		                    const done = [];
		                    const failed = [];
		                    for (const id of pickedReminders) {
		                      const row = reminders.find((entry) => entry.id === id);
		                      if (row === void 0) {
		                        failed.push(`${id}\uFF1A\u5DF2\u4E0D\u5728\u5217\u8868\u91CC`);
		                        continue;
		                      }
		                      const result = await call({
		                        op: "reminder.delete",
		                        id: row.id,
		                        sessionId: row.sessionId
		                      });
		                      if (result.ok) done.push(row.title);
		                      else failed.push(`${row.title}\uFF1A${result.message}`);
		                    }
		                    setBusy(false);
		                    setPickedReminders([]);
		                    reload();
		                    setToast(
		                      failed.length === 0 ? `\u5DF2\u5220\u9664 ${done.length} \u6761\u63D0\u9192` : `\u5220\u9664 ${done.length} \u6761\uFF0C\u5931\u8D25 ${failed.length} \u6761\uFF1A${failed.join("\uFF1B")}`
		                    );
		                  },
		                  children: [
		                    "\u6279\u91CF\u5220\u9664\u63D0\u9192 ",
		                    pickedReminders.length
		                  ]
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), disabled: busy, onClick: () => setPickedReminders([]), children: "\u53D6\u6D88\u9009\u62E9" })
		            ]
		          }
		        ) : null
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		        RunsView,
		        {
		          runs,
		          tasks,
		          zone,
		          taskId: runTaskId,
		          onTaskId: setRunTaskId,
		          onDetail: (run) => setDetailRun(run),
		          onRetry: (run) => void act({ op: "run.retry", runId: run.id }, "\u5DF2\u91CD\u65B0\u63D0\u4EA4"),
		          onCancel: (run) => void act({ op: "run.cancel", runId: run.id }, "\u5DF2\u8BF7\u6C42\u505C\u6B62"),
		          onClear: () => void act({ op: "runs.clear" }, "\u5DF2\u6E05\u7A7A\u8FD0\u884C\u8BB0\u5F55")
		        }
		      )
		    ] }),
		    templatePicker ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Modal, { title: "\u4ECE\u6A21\u677F\u65B0\u5EFA", onClose: () => setTemplatePicker(false), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: (snapshot?.templates ?? []).map((template) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		      "button",
		      {
		        onClick: () => startNew(template.id),
		        style: { ...card, textAlign: "left", cursor: "pointer", background: C.layer2, border: `1px solid ${C.border}` },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 }, children: template.name }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: C.label2, lineHeight: 1.5 }, children: template.description })
		        ]
		      },
		      template.id
		    )) }) }) : null,
		    editing !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      TaskForm,
		      {
		        task: editing,
		        snapshot,
		        uiWorkspace: props.uiWorkspace,
		        onReload: reload,
		        onClose: () => setEditing(null),
		        onSaved: (saved, notice) => {
		          setEditing(null);
		          setToast(
		            notice ?? `\u5DF2\u4FDD\u5B58\u300C${saved.name}\u300D${saved.nextRunAt === null ? "" : `\uFF0C\u4E0B\u6B21 ${formatInstant(Date.parse(saved.nextRunAt), saved.timeZone)}\uFF08${saved.timeZone}\uFF09`}`
		          );
		        }
		      }
		    ) : null,
		    detailRun !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RunDetail, { run: detailRun, zone, onClose: () => setDetailRun(null), onOpenSession: openSession }) : null,
		    reminderDetail === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      ReminderDetail,
		      {
		        reminder: reminderDetail,
		        zone,
		        onClose: () => setReminderDetail(null),
		        onToast: (text) => setToast(text),
		        onChanged: () => reload()
		      }
		    ),
		    toast !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "div",
		      {
		        style: {
		          position: "fixed",
		          left: "50%",
		          bottom: 28,
		          transform: "translateX(-50%)",
		          background: "var(--dsw-alias-toast-bg)",
		          color: "var(--dsw-alias-toast-label)",
		          fontSize: 12,
		          padding: "8px 16px",
		          borderRadius: 999,
		          zIndex: 60,
		          boxShadow: "0 6px 24px rgba(0,0,0,.18)"
		        },
		        children: toast
		      }
		    ) : null
		  ] });
		}
		function modelLabel(task) {
		  if (task.model === null) return "\u6A21\u578B\uFF1A\u672A\u56FA\u5316\uFF08\u8DDF\u968F\u5BBF\u4E3B\u9ED8\u8BA4\uFF09";
		  const effort = task.reasoningEffort === null ? "" : ` \xB7 ${task.reasoningEffort}`;
		  return `\u6A21\u578B\uFF1A${task.model.provider}/${task.model.model}${effort}`;
		}
		function workspaceLabel(task) {
		  if (task.workspaceId !== null) return task.workspace ?? `\u5DE5\u4F5C\u533A ${task.workspaceId}`;
		  if (task.workspace !== null && task.workspace.trim() !== "") return `${task.workspace}\uFF08\u672A\u767B\u8BB0\uFF09`;
		  return "\u4EFB\u52A1\u72EC\u7ACB\u76EE\u5F55";
		}
		var PRESET_LABELS = {
		  "read-only": "\u4EC5\u53EF\u67E5\u770B",
		  "workspace-write": "\u5DE5\u4F5C\u533A\u5185\u4FEE\u6539",
		  "danger-full-access": "\u5B8C\u5168\u6743\u9650"
		};
		function presetLabel(entry) {
		  const mapped = PRESET_LABELS[entry.value];
		  return entry.name === entry.value && mapped !== void 0 ? mapped : entry.name;
		}
		function permissionLabel(task) {
		  if (task.permissionPreset !== null) return `\u6743\u9650\uFF1A${PRESET_LABELS[task.permissionPreset] ?? task.permissionPreset}`;
		  return `\u6743\u9650\uFF1A\u65E7\u7EC4\u5408\uFF08${task.permission.sandbox} / ${task.permission.approval}\uFF09`;
		}
		function TaskCard(props) {
		  const { task } = props;
		  const [confirming, setConfirming] = React.useState(false);
		  const next = task.nextRunAt === null ? null : Date.parse(task.nextRunAt);
		  const overdue = next !== null && next < Date.now();
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...card, opacity: task.enabled ? 1 : 0.72 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", gap: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		        "input",
		        {
		          type: "checkbox",
		          checked: props.checked,
		          onChange: (event) => props.onCheck(event.target.checked),
		          style: { marginTop: 4, accentColor: C.brand }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 14, fontWeight: 600 }, children: task.name }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "span",
		            {
		              style: {
		                fontSize: 11,
		                color: task.enabled ? C.success : C.label3,
		                background: task.enabled ? C.successSoft : C.layer2,
		                borderRadius: 999,
		                padding: "0 8px",
		                lineHeight: "18px"
		              },
		              children: task.enabled ? "\u5DF2\u542F\u7528" : "\u5DF2\u6682\u505C"
		            }
		          ),
		          task.sessionMode === "persistent" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.label2, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 8px", lineHeight: "18px" }, children: "\u6301\u7EED\u4F1A\u8BDD" }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.caption }, children: modelLabel(task) }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.caption }, children: permissionLabel(task) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.label2, marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		            "\u89C4\u5219\uFF1A",
		            describeSchedule(task.schedule, task.timeZone)
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		            "\u4E0B\u6B21\uFF1A",
		            task.enabled ? `${shortTime(task.nextRunAt, task.timeZone)}\uFF08${task.timeZone}\uFF09` : "\u5DF2\u6682\u505C"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		            "\u6587\u4EF6\u5939\uFF1A",
		            workspaceLabel(task)
		          ] })
		        ] }),
		        task.legacyIssues.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 11, color: C.warn, marginTop: 4, lineHeight: 1.6 }, children: [
		          "\u9700\u8981\u786E\u8BA4\uFF1A",
		          task.legacyIssues.join("\uFF1B")
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.caption, marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		            "\u6F0F\u8DD1\u7B56\u7565\uFF1A",
		            task.missedPolicy === "catchup" ? "\u8865\u8DD1\u6700\u8FD1\u4E00\u6B21" : "\u8DF3\u8FC7"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		            "\u8D85\u65F6\uFF1A",
		            task.timeoutMinutes,
		            " \u5206\u949F"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		            "\u91CD\u8BD5\uFF1A",
		            task.maxRetries,
		            " \u6B21"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		            "\u6709\u6548\u671F\uFF1A",
		            task.startAt === null && task.endAt === null ? "\u957F\u671F" : `${shortTime(task.startAt, task.timeZone)} \u2192 ${shortTime(task.endAt, task.timeZone)}`
		          ] })
		        ] }),
		        task.lastError !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.error, marginTop: 6, background: C.warnSoft, borderRadius: 6, padding: "4px 8px" }, children: [
		          "\u4E0A\u6B21\u5F02\u5E38\uFF1A",
		          task.lastError.message
		        ] }) : null,
		        overdue && task.enabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: C.warn, marginTop: 6 }, children: "\u8BA1\u5212\u65F6\u95F4\u5DF2\u8FC7\uFF0C\u7B49\u5F85\u8C03\u5EA6\u5FAA\u73AF\u5904\u7406" }) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, { on: task.enabled, onToggle: props.onToggle }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 12, paddingLeft: 26, flexWrap: "wrap" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("primary"), onClick: props.onRun, disabled: props.busy, children: "\u7ACB\u5373\u8FD0\u884C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: props.onEdit, disabled: props.busy, children: "\u7F16\u8F91" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: props.onDuplicate, disabled: props.busy, children: "\u590D\u5236" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: props.onOpenRuns, children: "\u67E5\u770B\u8BB0\u5F55" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
		      confirming ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 12, color: C.label2, alignSelf: "center" }, children: "\u5220\u9664\u4EFB\u52A1\uFF08\u4FDD\u7559\u5386\u53F2\u8BB0\u5F55\uFF09\uFF1F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("danger"), onClick: props.onDelete, children: "\u786E\u8BA4\u5220\u9664" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: () => setConfirming(false), children: "\u53D6\u6D88" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("danger"), onClick: () => setConfirming(true), children: "\u5220\u9664" })
		    ] })
		  ] });
		}
		function Switch({ on, onToggle }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    "button",
		    {
		      onClick: onToggle,
		      title: on ? "\u70B9\u51FB\u6682\u505C" : "\u70B9\u51FB\u542F\u7528",
		      style: {
		        width: 38,
		        height: 22,
		        borderRadius: 999,
		        border: `1px solid ${on ? "transparent" : C.border}`,
		        background: on ? C.success : C.layer3,
		        position: "relative",
		        cursor: "pointer",
		        transition: "background 140ms ease",
		        padding: 0
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		        "span",
		        {
		          style: {
		            position: "absolute",
		            top: 2,
		            left: on ? 18 : 2,
		            width: 16,
		            height: 16,
		            borderRadius: "50%",
		            background: "var(--dsw-alias-switch-thumb, #fff)",
		            transition: "left 140ms ease"
		          }
		        }
		      )
		    }
		  );
		}
		function RunsView(props) {
		  const [status, setStatus] = React.useState("all");
		  const [trigger, setTrigger] = React.useState("all");
		  const taskId = props.taskId;
		  const filtered = props.runs.filter((run) => {
		    if (status !== "all" && run.status !== status) return false;
		    if (trigger !== "all" && run.trigger !== trigger) return false;
		    if (taskId !== "all" && run.taskId !== taskId) return false;
		    return true;
		  });
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: inputStyle, value: status, onChange: (event) => setStatus(event.target.value), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "all", children: "\u5168\u90E8\u72B6\u6001" }),
		        Object.keys(STATUS_TEXT).map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: key, children: STATUS_TEXT[key] }, key))
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: inputStyle, value: trigger, onChange: (event) => setTrigger(event.target.value), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "all", children: "\u5168\u90E8\u89E6\u53D1\u65B9\u5F0F" }),
		        Object.keys(TRIGGER_TEXT).map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: key, children: TRIGGER_TEXT[key] }, key))
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: inputStyle, value: taskId, onChange: (event) => props.onTaskId(event.target.value), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "all", children: "\u5168\u90E8\u4EFB\u52A1" }),
		        props.tasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: task.id, children: task.name }, task.id))
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: props.onClear, children: "\u6E05\u7A7A\u5DF2\u7ED3\u675F\u8BB0\u5F55" })
		    ] }),
		    filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...card, textAlign: "center", padding: "40px 20px", color: C.label2, fontSize: 13 }, children: "\u8FD8\u6CA1\u6709\u8FD0\u884C\u8BB0\u5F55\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: filtered.map((run) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...card, padding: "10px 14px" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusBadge, { status: run.status }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 13, fontWeight: 500 }, children: run.taskName }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.caption, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 7px", lineHeight: "17px" }, children: TRIGGER_TEXT[run.trigger] ?? run.trigger }),
		        run.attempt > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: 11, color: C.caption }, children: [
		          "\u7B2C ",
		          run.attempt,
		          " \u6B21"
		        ] }) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.label2 }, children: shortTime(run.startedAt ?? run.createdAt, props.zone) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.caption }, children: formatDuration(run.durationMs) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: () => props.onDetail(run), children: "\u8BE6\u60C5" }),
		        run.status === "running" || run.status === "queued" || run.status === "waiting-approval" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("danger"), onClick: () => props.onCancel(run), children: "\u505C\u6B62" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: () => props.onRetry(run), children: "\u91CD\u8DD1" })
		      ] }),
		      run.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: C.error, marginTop: 6 }, children: run.error.message }) : null,
		      run.artifacts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 11, color: C.label2, marginTop: 6 }, children: [
		        "\u4EA7\u7269 ",
		        run.artifacts.length,
		        "\uFF1A",
		        run.artifacts.slice(0, 2).map((item) => item.path.split("/").pop()).join("\u3001"),
		        run.artifacts.length > 2 ? " \u2026" : ""
		      ] }) : null
		    ] }, run.id)) })
		  ] });
		}
		var LIVE_STATUSES = ["queued", "running", "waiting-approval"];
		function RunDetail(props) {
		  const [run, setRun] = React.useState(props.run);
		  React.useEffect(() => {
		    setRun(props.run);
		  }, [props.run]);
		  React.useEffect(() => {
		    if (!LIVE_STATUSES.includes(run.status)) return;
		    let alive = true;
		    const tick = () => {
		      void call({ op: "run.detail", runId: run.id }).then((result) => {
		        if (alive && result.ok) setRun(result.value);
		      });
		    };
		    const handle = setInterval(tick, 1500);
		    return () => {
		      alive = false;
		      clearInterval(handle);
		    };
		  }, [run.id, run.status]);
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Modal, { title: `\u8FD0\u884C\u8BE6\u60C5 \xB7 ${run.taskName}`, onClose: props.onClose, wide: true, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 12px", fontSize: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u72B6\u6001", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusBadge, { status: run.status }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u89E6\u53D1\u65B9\u5F0F", children: TRIGGER_TEXT[run.trigger] ?? run.trigger }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u8BA1\u5212\u65F6\u95F4", children: shortTime(run.scheduledFor, props.zone) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u5F00\u59CB\u65F6\u95F4", children: shortTime(run.startedAt, props.zone) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u7ED3\u675F\u65F6\u95F4", children: shortTime(run.endedAt, props.zone) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u8017\u65F6", children: formatDuration(run.durationMs) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u4F1A\u8BDD\u6A21\u5F0F", children: run.sessionMode === "persistent" ? "\u6301\u7EED\u4F1A\u8BDD" : "\u72EC\u7ACB\u4F1A\u8BDD" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u5B9E\u9645\u6A21\u578B", children: run.modelSnapshot === null ? "\u2014" : `${run.modelSnapshot.provider}/${run.modelSnapshot.model}${run.modelSnapshot.reasoningEffort === null ? "" : ` \xB7 ${run.modelSnapshot.reasoningEffort}`}` }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u6743\u9650\u9884\u8BBE", children: run.permissionPreset ?? "\u65E7\u7EC4\u5408" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u6267\u884C\u4F1A\u8BDD", children: run.sessionId === null ? "\u2014" : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 8 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { style: { fontFamily: "var(--ds-font-family-code, monospace)", fontSize: 11 }, children: run.sessionId }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: () => props.onOpenSession(run.sessionId), children: "\u6253\u5F00\u4F1A\u8BDD" })
		      ] }) })
		    ] }),
		    run.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: { marginTop: 16 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionTitle, { children: "\u9519\u8BEF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.error, background: C.warnSoft, borderRadius: 8, padding: "8px 10px", whiteSpace: "pre-wrap" }, children: [
		        run.error.message,
		        run.error.code === null ? "" : `\uFF08${run.error.code}\uFF09`
		      ] })
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: { marginTop: 16 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SectionTitle, { children: [
		        "\u4EA7\u7269\uFF08",
		        run.artifacts.length,
		        "\uFF09"
		      ] }),
		      run.artifacts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: C.label2 }, children: "\u672C\u6B21\u8FD0\u884C\u6CA1\u6709\u5728\u5DE5\u4F5C\u6587\u4EF6\u5939\u91CC\u5199\u5165\u6587\u4EF6\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: run.artifacts.map((artifact) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "a",
		          {
		            href: `/dsh-task-center/artifact?runId=${encodeURIComponent(run.id)}&path=${encodeURIComponent(artifact.path)}`,
		            target: "_blank",
		            rel: "noreferrer",
		            style: { color: C.brand, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
		            title: artifact.path,
		            children: artifact.path.split("/").pop()
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.caption }, children: formatBytes(artifact.size) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.caption, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: artifact.path, children: artifact.path })
		      ] }, artifact.path)) })
		    ] }),
		    run.tools.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: { marginTop: 16 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SectionTitle, { children: [
		        "\u8C03\u7528\u7684\u5DE5\u5177\uFF08",
		        run.tools.length,
		        "\uFF09"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: run.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, background: C.layer2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px" }, children: tool.name }, tool.name)) })
		    ] }) : null,
		    run.output !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: { marginTop: 16 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionTitle, { children: "\u8F93\u51FA" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		        "pre",
		        {
		          style: {
		            fontFamily: "var(--ds-font-family-code, monospace)",
		            fontSize: 11,
		            lineHeight: 1.6,
		            background: "var(--dsw-alias-markdown-code-block)",
		            borderRadius: 8,
		            padding: "10px 12px",
		            margin: 0,
		            whiteSpace: "pre-wrap",
		            maxHeight: 260,
		            overflow: "auto"
		          },
		          children: run.output
		        }
		      )
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: { marginTop: 16 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionTitle, { children: "\u6267\u884C\u65E5\u5FD7" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflow: "auto" }, children: run.log.map((entry, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, fontSize: 11 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: C.caption, flexShrink: 0 }, children: shortTime(entry.at, props.zone).slice(11) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: entry.level === "error" ? C.error : entry.level === "warn" ? C.warn : C.label2 }, children: entry.text })
		      ] }, `${entry.at}-${index}`)) })
		    ] })
		  ] });
		}
		function Field(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: C.label2 }, children: props.label }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { minWidth: 0 }, children: props.children })
		  ] });
		}
		function SectionTitle(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: C.label3, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }, children: props.children });
		}
		function Modal(props) {
		  React.useEffect(() => {
		    const onKey = (event) => {
		      if (event.key === "Escape") props.onClose();
		    };
		    window.addEventListener("keydown", onKey);
		    return () => window.removeEventListener("keydown", onKey);
		  }, [props]);
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    "div",
		    {
		      onClick: props.onClose,
		      style: {
		        position: "fixed",
		        inset: 0,
		        background: "var(--dsw-alias-bg-mask-1, rgba(0,0,0,.32))",
		        display: "flex",
		        alignItems: "center",
		        justifyContent: "center",
		        padding: 24,
		        zIndex: 50
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "div",
		        {
		          onClick: (event) => event.stopPropagation(),
		          style: {
		            width: props.wide === true ? 720 : 560,
		            maxWidth: "100%",
		            maxHeight: "86vh",
		            overflow: "auto",
		            background: C.layer1,
		            color: C.label,
		            border: `1px solid ${C.border}`,
		            borderRadius: 14,
		            boxShadow: "0 24px 64px rgba(0,0,0,.28)",
		            padding: 20
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", marginBottom: 14 }, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 15, fontWeight: 600, flex: 1 }, children: props.title }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: props.onClose, children: "\u5173\u95ED" })
		            ] }),
		            props.children
		          ]
		        }
		      )
		    }
		  );
		}
		function draftTask(template, zone) {
		  const base = template === null ? {} : template.task;
		  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
		  return {
		    id: "",
		    name: base.name ?? "\u65B0\u4EFB\u52A1",
		    prompt: base.prompt ?? "",
		    attachments: [],
		    model: base.model ?? null,
		    reasoningEffort: base.reasoningEffort ?? null,
		    workspace: base.workspace ?? null,
		    sessionMode: base.sessionMode ?? "independent",
		    sessionId: null,
		    sessionModelKey: null,
		    permission: base.permission ?? { approval: "never", sandbox: "workspace-write" },
		    permissionPreset: base.permissionPreset ?? null,
		    permissionSource: base.permissionSource ?? "legacy",
		    modelSource: base.modelSource ?? "default",
		    workspaceId: base.workspaceId ?? null,
		    workspaceSource: base.workspaceSource ?? "task-dir",
		    legacyIssues: [],
		    schedule: base.schedule ?? { kind: "daily", time: "09:00" },
		    timeZone: base.timeZone ?? zone,
		    startAt: null,
		    endAt: null,
		    missedPolicy: base.missedPolicy ?? "catchup",
		    enabled: true,
		    maxRetries: base.maxRetries ?? 1,
		    timeoutMinutes: base.timeoutMinutes ?? 20,
		    createdAt: nowIso,
		    updatedAt: nowIso,
		    nextRunAt: null,
		    lastRunAt: null,
		    lastRunStatus: null,
		    lastError: null,
		    templateId: template?.id ?? null
		  };
		}
		function TaskForm(props) {
		  const [draft, setDraft] = React.useState(() => structuredClone(props.task));
		  const [error, setError] = React.useState(null);
		  const [saving, setSaving] = React.useState(false);
		  const [zones, setZones] = React.useState([]);
		  const models = props.snapshot?.models ?? [];
		  const selectedEntry = draft.model === null ? null : models.find((entry) => entry.provider === draft.model?.provider && entry.model === draft.model?.model) ?? null;
		  const reasoningOptions = selectedEntry?.reasoning?.efforts ?? [];
		  const [pendingFull, setPendingFull] = React.useState(false);
		  const workspaces = props.snapshot?.workspaces ?? [];
		  const permissions = props.snapshot?.permissions ?? [];
		  const workspaceKind = draft.workspaceId !== null ? "workspace" : draft.workspace !== null && draft.workspace.trim() !== "" ? "custom" : "task-dir";
		  const workspacePathHint = draft.workspaceId !== null ? workspaces.find((entry) => entry.id === draft.workspaceId)?.path ?? draft.workspace : draft.workspace;
		  const permissionHint = draft.permissionPreset === null ? null : (() => {
		    const entry = permissions.find((candidate) => candidate.value === draft.permissionPreset);
		    return entry === void 0 ? draft.permissionPreset : presetLabel(entry);
		  })();
		  const permissionError = draft.permissionPreset !== null && permissions.length > 0 && permissionHint === draft.permissionPreset ? "\u8FD9\u4E2A\u9884\u8BBE\u5DF2\u7ECF\u4E0D\u5728\u5BBF\u4E3B\u76EE\u5F55\u91CC\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" : null;
		  const pickFolder = async () => {
		    setError(null);
		    try {
		      const ui = props.uiWorkspace;
		      if (ui === void 0 || typeof ui.pickDirectory !== "function") {
		        throw new Error("\u5F53\u524D\u5BBF\u4E3B\u6CA1\u6709\u76EE\u5F55\u9009\u62E9\u5668\uFF0C\u8BF7\u76F4\u63A5\u586B\u5199\u7EDD\u5BF9\u8DEF\u5F84");
		      }
		      const picked = await ui.pickDirectory();
		      const path = typeof picked === "string" ? picked : typeof picked?.path === "string" ? String(picked.path) : "";
		      if (path.trim() === "") throw new Error("\u5BBF\u4E3B\u6CA1\u6709\u8FD4\u56DE\u76EE\u5F55\u8DEF\u5F84\uFF0C\u8BF7\u76F4\u63A5\u586B\u5199\u7EDD\u5BF9\u8DEF\u5F84");
		      const created = await call({ op: "workspace.create", path: path.trim() });
		      if (!created.ok) throw new Error(created.message);
		      patch({ workspaceId: created.value.workspaceId, workspace: created.value.path });
		      props.onReload?.();
		    } catch (caught) {
		      setError(caught.message);
		    }
		  };
		  React.useEffect(() => {
		    void call({ op: "timezones" }).then((result) => {
		      if (result.ok) setZones(result.value);
		    });
		  }, []);
		  const patch = (next) => setDraft((current) => ({ ...current, ...next }));
		  const patchSchedule = (next) => setDraft((current) => ({ ...current, schedule: { ...current.schedule, ...next } }));
		  const save = async () => {
		    setSaving(true);
		    const result = await call({ op: "task.save", task: draft });
		    setSaving(false);
		    if (!result.ok) {
		      setError(result.message);
		      return;
		    }
		    props.onSaved(result.value);
		  };
		  const runLater = async () => {
		    setSaving(true);
		    setError(null);
		    const saved = await call({ op: "task.save", task: draft });
		    if (!saved.ok) {
		      setSaving(false);
		      setError(`\u4FDD\u5B58\u5931\u8D25\uFF1A${saved.message}`);
		      return;
		    }
		    const started = await call({ op: "run.now", id: saved.value.id });
		    setSaving(false);
		    if (!started.ok) {
		      setError(`\u5DF2\u4FDD\u5B58\u300C${saved.value.name}\u300D\uFF0C\u4F46\u542F\u52A8\u5931\u8D25\uFF1A${started.message}`);
		      return;
		    }
		    props.onSaved(saved.value, `\u5DF2\u4FDD\u5B58\u5E76\u5F00\u59CB\u8FD0\u884C\uFF08\u8FD0\u884C ${started.value.id}\uFF0C\u72B6\u6001 ${STATUS_TEXT[started.value.status] ?? started.value.status}\uFF09`);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Modal, { title: props.task.id === "" ? "\u65B0\u5EFA\u5B9A\u65F6\u4EFB\u52A1" : "\u7F16\u8F91\u5B9A\u65F6\u4EFB\u52A1", onClose: props.onClose, wide: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u4EFB\u52A1\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "input",
		      {
		        style: { ...inputStyle, width: "100%" },
		        value: draft.name,
		        onChange: (event) => patch({ name: event.target.value }),
		        placeholder: "\u4F8B\u5982\uFF1AAI \u65B0\u95FB HTML \u65E5\u62A5"
		      }
		    ) }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u4EFB\u52A1\u63D0\u793A\u8BCD", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "textarea",
		      {
		        style: { ...inputStyle, width: "100%", minHeight: 120, resize: "vertical", lineHeight: 1.6 },
		        value: draft.prompt,
		        onChange: (event) => patch({ prompt: event.target.value }),
		        placeholder: "\u5230\u70B9\u540E\u8981\u771F\u6B63\u6267\u884C\u7684\u6307\u4EE4\u3002\u5199\u6E05\u695A\u8981\u4EA7\u51FA\u7684\u6587\u4EF6\u4E0E\u683C\u5F0F\u3002"
		      }
		    ) }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u6A21\u578B", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "select",
		        {
		          style: { ...inputStyle, width: "100%" },
		          value: draft.model === null ? "" : `${draft.model.provider}/${draft.model.model}`,
		          onChange: (event) => {
		            const value = event.target.value;
		            if (value === "") {
		              patch({ model: null });
		              return;
		            }
		            const [provider, ...rest] = value.split("/");
		            patch({ model: { provider: provider ?? "", model: rest.join("/") } });
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u8DDF\u968F\u9ED8\u8BA4\u6A21\u578B" }),
		            models.map((entry) => {
		              const value = `${entry.provider}/${entry.model}`;
		              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value, children: [
		                entry.provider,
		                " \xB7 ",
		                entry.label
		              ] }, value);
		            })
		          ]
		        }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { label: "\u5DE5\u4F5C\u6587\u4EF6\u5939", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "select",
		          {
		            style: { ...inputStyle, width: "100%" },
		            value: workspaceKind === "workspace" ? `ws:${draft.workspaceId ?? ""}` : workspaceKind === "custom" ? "custom" : "task-dir",
		            onChange: (event) => {
		              const value = event.target.value;
		              if (value === "task-dir") {
		                patch({ workspaceId: null, workspace: null });
		                return;
		              }
		              if (value === "custom") {
		                patch({ workspaceId: null, workspace: draft.workspace ?? "" });
		                return;
		              }
		              const id = value.slice(3);
		              const entry = workspaces.find((candidate) => candidate.id === id);
		              patch({ workspaceId: id, workspace: entry?.path ?? draft.workspace });
		            },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "task-dir", children: "\u4EFB\u52A1\u72EC\u7ACB\u76EE\u5F55\uFF08\u63D2\u4EF6\u81EA\u52A8\u521B\u5EFA\uFF09" }),
		              workspaces.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: `ws:${entry.id}`, children: [
		                entry.title,
		                " \u2014 ",
		                entry.path
		              ] }, entry.id)),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "custom", children: "\u81EA\u5B9A\u4E49\u8DEF\u5F84\uFF08\u672A\u767B\u8BB0\u4E3A\u5BBF\u4E3B\u5DE5\u4F5C\u533A\uFF09" })
		            ]
		          }
		        ),
		        workspaceKind === "custom" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 6 }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "input",
		            {
		              style: { ...inputStyle, flex: 1 },
		              value: draft.workspace ?? "",
		              onChange: (event) => patch({ workspace: event.target.value.trim() === "" ? null : event.target.value, workspaceId: null }),
		              placeholder: "\u7EDD\u5BF9\u8DEF\u5F84"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: () => void pickFolder(), children: "\u9009\u62E9\u5176\u4ED6\u6587\u4EF6\u5939\u2026" })
		        ] }) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 11, color: C.caption, lineHeight: 1.5 }, children: [
		          workspaceKind === "workspace" ? "\u4F1A\u6309\u5BBF\u4E3B\u767B\u8BB0\u7684\u5DE5\u4F5C\u533A\u89E3\u6790\u771F\u5B9E\u8DEF\u5F84\uFF1B\u5DE5\u4F5C\u533A\u6539\u540D\u6216\u79FB\u52A8\u540E\u6309\u5BBF\u4E3B\u6700\u65B0\u8DEF\u5F84\u6267\u884C\uFF0C\u88AB\u5220\u9664\u65F6\u4F1A\u660E\u786E\u62A5\u9519\uFF0C\u4E0D\u4F1A\u6084\u6084\u6362\u76EE\u5F55\u3002" : workspaceKind === "custom" ? "\u8FD9\u662F\u4E00\u6761\u539F\u59CB\u8DEF\u5F84\uFF0C\u6CA1\u6709\u767B\u8BB0\u4E3A\u5BBF\u4E3B\u5DE5\u4F5C\u533A\uFF1A\u76EE\u5F55\u88AB\u79FB\u8D70\u65F6\u4EFB\u52A1\u4F1A\u76F4\u63A5\u5931\u8D25\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u6539\u7528\u5176\u5B83\u76EE\u5F55\u3002" : "\u63D2\u4EF6\u4F1A\u5728\u81EA\u5DF1\u7684\u6570\u636E\u76EE\u5F55\u4E0B\u4E3A\u672C\u4EFB\u52A1\u5EFA\u4E00\u4E2A\u72EC\u7ACB\u6587\u4EF6\u5939\uFF0C\u4EA7\u7269\u53EA\u5199\u5728\u8FD9\u91CC\u3002",
		          workspacePathHint === null ? "" : ` \u5F53\u524D\uFF1A${workspacePathHint}`
		        ] })
		      ] })
		    ] }),
		    reasoningOptions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: `\u601D\u8003\u6863\u4F4D\uFF08${selectedEntry?.label ?? ""} \u652F\u6301\uFF09`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		      "select",
		      {
		        style: { ...inputStyle, width: "100%" },
		        value: draft.reasoningEffort ?? "",
		        onChange: (event) => patch({ reasoningEffort: event.target.value === "" ? null : event.target.value }),
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u8DDF\u968F\u6A21\u578B\u9ED8\u8BA4" }),
		          reasoningOptions.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: effort.id, title: effort.description ?? "", children: [
		            effort.name,
		            selectedEntry?.reasoning?.defaultEffort === effort.id ? "\uFF08\u9ED8\u8BA4\uFF09" : ""
		          ] }, effort.id))
		        ]
		      }
		    ) }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u4F1A\u8BDD\u6A21\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "select",
		        {
		          style: { ...inputStyle, width: "100%" },
		          value: draft.sessionMode,
		          onChange: (event) => patch({ sessionMode: event.target.value }),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "independent", children: "\u72EC\u7ACB\u4F1A\u8BDD\uFF08\u6BCF\u6B21\u65B0\u5EFA\uFF09" }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "persistent", children: "\u6301\u7EED\u4F1A\u8BDD\uFF08\u590D\u7528\u4E13\u5C5E\u4F1A\u8BDD\uFF09" })
		          ]
		        }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { label: "\u4EFB\u52A1\u65F6\u533A", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "input",
		          {
		            style: { ...inputStyle, width: "100%" },
		            list: "dsh-task-center-timezones",
		            value: draft.timeZone,
		            onChange: (event) => patch({ timeZone: event.target.value })
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("datalist", { id: "dsh-task-center-timezones", children: zones.map((zone) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: zone }, zone)) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 }, children: "\u8C03\u5EA6\u914D\u7F6E" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u91CD\u590D\u65B9\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "select",
		          {
		            style: { ...inputStyle, width: "100%" },
		            value: draft.schedule.kind,
		            onChange: (event) => patchSchedule({ kind: event.target.value }),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "once", children: "\u5355\u6B21" }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "interval", children: "\u56FA\u5B9A\u95F4\u9694" }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "daily", children: "\u6BCF\u5929" }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "weekly", children: "\u6BCF\u5468" }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "cron", children: "Cron \u8868\u8FBE\u5F0F" })
		            ]
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { label: "\u65F6\u95F4 / \u8868\u8FBE\u5F0F", children: [
		          draft.schedule.kind === "once" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "input",
		            {
		              type: "datetime-local",
		              style: { ...inputStyle, width: "100%" },
		              value: toZoneInput(draft.schedule.at ?? null, draft.timeZone),
		              onChange: (event) => patchSchedule({ at: fromZoneInput(event.target.value, draft.timeZone) })
		            }
		          ) : null,
		          draft.schedule.kind === "interval" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "input",
		            {
		              type: "number",
		              min: 1,
		              style: { ...inputStyle, width: "100%" },
		              value: draft.schedule.everyMinutes ?? 60,
		              onChange: (event) => patchSchedule({ everyMinutes: Number(event.target.value) }),
		              placeholder: "\u95F4\u9694\u5206\u949F\u6570"
		            }
		          ) : null,
		          draft.schedule.kind === "daily" || draft.schedule.kind === "weekly" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "input",
		            {
		              type: "time",
		              style: { ...inputStyle, width: "100%" },
		              value: draft.schedule.time ?? "09:00",
		              onChange: (event) => patchSchedule({ time: event.target.value })
		            }
		          ) : null,
		          draft.schedule.kind === "cron" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "input",
		            {
		              style: { ...inputStyle, width: "100%" },
		              value: draft.schedule.cron ?? "0 9 * * *",
		              onChange: (event) => patchSchedule({ cron: event.target.value }),
		              placeholder: "0 9 * * *"
		            }
		          ) : null
		        ] })
		      ] }),
		      draft.schedule.kind === "weekly" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u6BCF\u5468\u54EA\u51E0\u5929", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"].map((label, index) => {
		        const day = index + 1;
		        const active = (draft.schedule.weekdays ?? []).includes(day);
		        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "button",
		          {
		            style: buttonStyle(active ? "primary" : "ghost"),
		            onClick: () => {
		              const current = new Set(draft.schedule.weekdays ?? []);
		              if (current.has(day)) current.delete(day);
		              else current.add(day);
		              patchSchedule({ weekdays: [...current].sort((a, b) => a - b) });
		            },
		            children: [
		              "\u5468",
		              label
		            ]
		          },
		          day
		        );
		      }) }) }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u6709\u6548\u671F", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "select",
		          {
		            style: { ...inputStyle, width: "100%" },
		            value: draft.startAt === null && draft.endAt === null ? "forever" : "window",
		            onChange: (event) => {
		              if (event.target.value === "forever") {
		                patch({ startAt: null, endAt: null });
		                return;
		              }
		              const start = /* @__PURE__ */ new Date();
		              const end = new Date(Date.now() + 30 * 24 * 3600 * 1e3);
		              patch({ startAt: start.toISOString(), endAt: end.toISOString() });
		            },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "forever", children: "\u957F\u671F\u6709\u6548" }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "window", children: "\u6307\u5B9A\u671F\u9650" })
		            ]
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u9519\u8FC7\u65F6\u7684\u5904\u7406", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "select",
		          {
		            style: { ...inputStyle, width: "100%" },
		            value: draft.missedPolicy,
		            onChange: (event) => patch({ missedPolicy: event.target.value }),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "catchup", children: "\u5F00\u673A\u540E\u8865\u8DD1\u6700\u8FD1\u4E00\u6B21" }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "skip", children: "\u76F4\u63A5\u8DF3\u8FC7" })
		            ]
		          }
		        ) })
		      ] }),
		      draft.startAt !== null || draft.endAt !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u5F00\u59CB\u4E8E", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "input",
		          {
		            type: "datetime-local",
		            style: { ...inputStyle, width: "100%" },
		            value: toZoneInput(draft.startAt, draft.timeZone),
		            onChange: (event) => patch({ startAt: fromZoneInput(event.target.value, draft.timeZone) })
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u7ED3\u675F\u4E8E", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "input",
		          {
		            type: "datetime-local",
		            style: { ...inputStyle, width: "100%" },
		            value: toZoneInput(draft.endAt, draft.timeZone),
		            onChange: (event) => patch({ endAt: fromZoneInput(event.target.value, draft.timeZone) })
		          }
		        ) })
		      ] }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u5931\u8D25\u91CD\u8BD5", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "input",
		          {
		            type: "number",
		            min: 0,
		            max: 5,
		            style: { ...inputStyle, width: "100%" },
		            value: draft.maxRetries,
		            onChange: (event) => patch({ maxRetries: Number(event.target.value) })
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u8FD0\u884C\u8D85\u65F6\uFF08\u5206\u949F\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "input",
		          {
		            type: "number",
		            min: 1,
		            style: { ...inputStyle, width: "100%" },
		            value: draft.timeoutMinutes,
		            onChange: (event) => patch({ timeoutMinutes: Number(event.target.value) })
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u72B6\u6001", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "select",
		          {
		            style: { ...inputStyle, width: "100%" },
		            value: draft.enabled ? "on" : "off",
		            onChange: (event) => patch({ enabled: event.target.value === "on" }),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "on", children: "\u542F\u7528" }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "off", children: "\u6682\u505C" })
		            ]
		          }
		        ) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 }, children: "\u6743\u9650\uFF08\u5BBF\u4E3B\u539F\u751F\u4E09\u6863\uFF09" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Row, { label: "\u6743\u9650\u9884\u8BBE", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "select",
		          {
		            style: { ...inputStyle, width: "100%" },
		            value: draft.permissionPreset ?? "",
		            onChange: (event) => {
		              const value = event.target.value;
		              if (value === "") {
		                patch({ permissionPreset: null, permissionSource: "legacy" });
		                return;
		              }
		              if (value === "danger-full-access") {
		                setPendingFull(true);
		                return;
		              }
		              patch({ permissionPreset: value, permissionSource: "preset" });
		            },
		            children: [
		              draft.permissionPreset === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\uFF08\u672A\u9009\u62E9\u9884\u8BBE \xB7 \u5F53\u524D\u6CBF\u7528\u65E7\u7EC4\u5408\uFF09" }) : null,
		              permissions.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: entry.value, children: [
		                presetLabel(entry),
		                entry.description === void 0 ? "" : ` \u2014 ${entry.description}`
		              ] }, entry.value))
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 11, color: C.caption, lineHeight: 1.5 }, children: [
		          "\u9884\u8BBE\u53EA\u5E94\u7528\u5230\u672C\u4EFB\u52A1\u7684\u4F1A\u8BDD\uFF0C\u4E0D\u6539\u52A8\u5176\u5B83\u4F1A\u8BDD\u6216\u5BBF\u4E3B\u9ED8\u8BA4\u6743\u9650\u3002\u5F53\u524D\uFF1A",
		          permissionHint === null ? "\u65E7\u7EC4\u5408\uFF08\u6C99\u7BB1 " + draft.permission.sandbox + " / \u5BA1\u6279 " + draft.permission.approval + "\uFF09" : permissionHint
		        ] }),
		        permissionError === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: C.warn, marginTop: 4 }, children: permissionError }),
		        pendingFull ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 10, border: `1px solid ${C.warn}`, borderRadius: 8, padding: "10px 12px", background: C.warnSoft }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 }, children: "\u786E\u8BA4\u542F\u7528\u5B8C\u5168\u6743\u9650\uFF1F" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: C.label2, lineHeight: 1.6, marginBottom: 8 }, children: "\u8BE5\u4EFB\u52A1\u4F1A\u5728\u65E0\u4EBA\u503C\u5B88\u7684\u60C5\u51B5\u4E0B\u62E5\u6709\u5B8C\u5168\u6587\u4EF6\u4E0E\u547D\u4EE4\u6743\u9650\uFF0C\u6CA1\u6709\u4EFB\u4F55\u5BA1\u6279\u62E6\u622A\u3002\u539F\u751F\u754C\u9762\u5BF9\u8FD9\u4E00\u6863\u540C\u6837\u8981\u6C42\u786E\u8BA4\u3002" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		              "button",
		              {
		                style: buttonStyle("primary"),
		                onClick: () => {
		                  patch({ permissionPreset: "danger-full-access", permissionSource: "preset" });
		                  setPendingFull(false);
		                },
		                children: "\u6211\u5DF2\u4E86\u89E3\u98CE\u9669\uFF0C\u5E76\u613F\u610F\u7EE7\u7EED"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: () => setPendingFull(false), children: "\u53D6\u6D88" })
		          ] })
		        ] }) : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u53C2\u8003\u9644\u4EF6\uFF08\u6BCF\u884C\u4E00\u4E2A\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u8FD9\u662F\u5199\u8FDB\u63D0\u793A\u8BCD\u7684\u6587\u4EF6\u5F15\u7528\uFF0C\u4E0D\u662F\u804A\u5929\u91CC\u7684\u539F\u751F\u9644\u4EF6\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "textarea",
		      {
		        style: { ...inputStyle, width: "100%", minHeight: 54, resize: "vertical", lineHeight: 1.5 },
		        value: draft.attachments.join("\n"),
		        onChange: (event) => patch({ attachments: event.target.value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0) }),
		        placeholder: "/Users/you/notes/brand.md"
		      }
		    ) }),
		    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: C.error }, children: error }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: props.onClose, children: "\u53D6\u6D88" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: () => void runLater(), disabled: saving, children: "\u4FDD\u5B58\u5E76\u7ACB\u5373\u8FD0\u884C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("primary"), onClick: () => void save(), disabled: saving, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" })
		    ] })
		  ] }) });
		}
		function Row(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 5 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: C.label2 }, children: props.label }),
		    props.children
		  ] });
		}
		function toZoneInput(iso, timeZone) {
		  if (iso === null) return "";
		  const at = Date.parse(iso);
		  if (!Number.isFinite(at)) return "";
		  const parts = new Intl.DateTimeFormat("en-CA", {
		    timeZone,
		    year: "numeric",
		    month: "2-digit",
		    day: "2-digit",
		    hour: "2-digit",
		    minute: "2-digit",
		    hour12: false
		  }).formatToParts(new Date(at));
		  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "00";
		  const hour = pick("hour") === "24" ? "00" : pick("hour");
		  return `${pick("year")}-${pick("month")}-${pick("day")}T${hour}:${pick("minute")}`;
		}
		function fromZoneInput(value, timeZone) {
		  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
		  if (match === null) return null;
		  const [, year, month, day, hour, minute] = match;
		  const guess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
		  let instant = guess;
		  for (let attempt = 0; attempt < 3; attempt += 1) {
		    const shifted = guess - offsetAt(instant, timeZone);
		    if (shifted === instant) break;
		    instant = shifted;
		  }
		  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
		}
		function offsetAt(instant, timeZone) {
		  const parts = new Intl.DateTimeFormat("en-CA", {
		    timeZone,
		    year: "numeric",
		    month: "2-digit",
		    day: "2-digit",
		    hour: "2-digit",
		    minute: "2-digit",
		    second: "2-digit",
		    hour12: false
		  }).formatToParts(new Date(instant));
		  const pick = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
		  const hour = pick("hour") === 24 ? 0 : pick("hour");
		  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), hour, pick("minute"), pick("second"));
		  return asUtc - instant;
		}
		var WEEKDAY_LABELS = ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"];
		function sourceBadge(source2) {
		  return {
		    fontSize: 11,
		    padding: "1px 7px",
		    borderRadius: 999,
		    background: source2 === "auto" ? C.successSoft : C.layer3,
		    color: source2 === "auto" ? C.success : C.label2,
		    border: `1px solid ${source2 === "auto" ? "transparent" : C.borderSoft}`,
		    whiteSpace: "nowrap"
		  };
		}
		function ReminderCard(props) {
		  const { reminder } = props;
		  const [confirming, setConfirming] = React.useState(false);
		  const next = reminder.scheduledAt === "" ? null : Date.parse(reminder.scheduledAt);
		  const overdue = reminder.status === "active" && next !== null && next < Date.now();
		  const color = reminder.status === "active" ? C.warn : C.label2;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...card, background: C.layer1 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", gap: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		        "input",
		        {
		          type: "checkbox",
		          checked: props.checked,
		          onChange: (event) => props.onCheck(event.target.checked),
		          style: { marginTop: 4, accentColor: C.brand }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 14, fontWeight: 600 }, children: reminder.title }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: sourceBadge("reminder"), children: "\u5BF9\u8BDD\u63D0\u9192" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color }, children: reminder.status === "active" ? "\u6295\u9012\u4E2D" : "\u5DF2\u7ED3\u675F" }),
		          overdue ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: C.warn }, children: "\u5DF2\u8FC7\u89E6\u53D1\u65F6\u95F4\uFF0C\u7B49\u5F85\u6295\u9012" }) : null
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.label2, marginTop: 6 }, children: [
		          "\u89C4\u5219\uFF1A",
		          reminder.rule
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.label2, marginTop: 2 }, children: [
		          "\u4E0B\u6B21\uFF1A",
		          reminder.scheduledAt === "" ? "\u2014" : shortTime(reminder.scheduledAt, reminder.timeZone ?? props.zone),
		          reminder.timeZone === null ? "" : `\uFF08${reminder.timeZone}\uFF09`
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.label2, marginTop: 2 }, children: [
		          "\u6295\u9012\u5230\u4F1A\u8BDD\uFF1A",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "button",
		            {
		              style: {
		                font: "inherit",
		                fontSize: 12,
		                background: "transparent",
		                border: "none",
		                color: C.brand,
		                cursor: reminder.sessionId === "" ? "default" : "pointer",
		                padding: 0
		              },
		              disabled: reminder.sessionId === "",
		              onClick: () => props.onOpenSession(reminder.sessionId),
		              children: reminder.sessionId === "" ? "\uFF08\u672A\u77E5\u4F1A\u8BDD\uFF09" : reminder.sessionId
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: C.caption, marginTop: 4 }, children: "\u539F\u751F\u63D0\u9192\u53EA\u8D1F\u8D23\u628A\u6D88\u606F\u6295\u9012\u56DE\u539F\u4F1A\u8BDD\uFF0C\u4E0D\u4EA7\u751F\u6267\u884C\u8BB0\u5F55\u4E0E\u4EA7\u7269\uFF1B\u300C\u5DF2\u6295\u9012\u300D\u4E0D\u7B49\u4E8E\u300C\u5DF2\u6267\u884C\u300D\u3002" })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), onClick: props.onOpen, disabled: props.busy, children: "\u6295\u9012\u8BB0\u5F55 / \u7F16\u8F91" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		        "span",
		        {
		          style: {
		            ...buttonStyle(),
		            color: C.caption,
		            cursor: "not-allowed",
		            background: "transparent"
		          },
		          title: "\u539F\u751F\u63D0\u9192\u6CA1\u6709\u542F\u7528/\u6682\u505C\u72B6\u6001\uFF0C\u6682\u505C\u8BF7\u5220\u9664\u63D0\u9192\u6216\u6539\u7528\u81EA\u52A8\u6267\u884C\u4EFB\u52A1",
		          "aria-disabled": "true",
		          children: "\u6682\u505C\uFF08\u539F\u751F\u4E0D\u652F\u6301\uFF09"
		        }
		      ),
		      confirming ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 12, color: C.error }, children: "\u5220\u9664\u8FD9\u6761\u63D0\u9192\uFF1F\u5DF2\u6392\u961F\u7684\u6D88\u606F\u4E0D\u4F1A\u64A4\u56DE" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("danger"), disabled: props.busy, onClick: props.onDelete, children: "\u786E\u8BA4\u5220\u9664" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), disabled: props.busy, onClick: () => setConfirming(false), children: "\u53D6\u6D88" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("danger"), disabled: props.busy, onClick: () => setConfirming(true), children: "\u5220\u9664" })
		    ] })
		  ] });
		}
		function ReminderDetail(props) {
		  const { reminder } = props;
		  const [history, setHistory] = React.useState(null);
		  const [historyError, setHistoryError] = React.useState(null);
		  const [loading, setLoading] = React.useState(true);
		  const [title, setTitle] = React.useState(reminder.title);
		  const [prompt, setPrompt] = React.useState(reminder.prompt);
		  const [kind, setKind] = React.useState(reminder.kind === "after" ? "every" : reminder.kind);
		  const [time, setTime] = React.useState("09:00");
		  const [zone, setZone] = React.useState(reminder.timeZone ?? props.zone);
		  const [expression, setExpression] = React.useState("*/15 9-17 * * 1-5");
		  const [weekdays, setWeekdays] = React.useState([5]);
		  const [everySeconds, setEverySeconds] = React.useState(3600);
		  const [saving, setSaving] = React.useState(false);
		  const [error, setError] = React.useState(null);
		  const loadHistory = React.useCallback(async () => {
		    setLoading(true);
		    const result = await call({
		      op: "reminder.history",
		      id: reminder.id,
		      sessionId: reminder.sessionId,
		      limit: 50
		    });
		    setLoading(false);
		    if (result.ok) {
		      setHistory(result.value);
		      setHistoryError(null);
		    } else {
		      setHistoryError(result.message);
		    }
		  }, [reminder.id, reminder.sessionId]);
		  React.useEffect(() => {
		    void loadHistory();
		  }, [loadHistory]);
		  const change = () => {
		    const timeZone = zone.trim();
		    switch (kind) {
		      case "daily":
		        return { kind: "daily", daily: { time, time_zone: timeZone } };
		      case "weekly":
		        return { kind: "weekly", weekly: { time, time_zone: timeZone, weekdays } };
		      case "cron":
		        return { kind: "cron", cron: { expression, time_zone: timeZone } };
		      case "every":
		        return { kind: "every", every_seconds: everySeconds };
		      default:
		        return { kind: "at", at: { date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), time, time_zone: timeZone } };
		    }
		  };
		  const save = async (withTiming) => {
		    setSaving(true);
		    setError(null);
		    const result = await call({
		      op: "reminder.update",
		      id: reminder.id,
		      sessionId: reminder.sessionId,
		      title,
		      prompt,
		      ...withTiming ? { change: change() } : {}
		    });
		    setSaving(false);
		    if (!result.ok) {
		      setError(result.message);
		      return;
		    }
		    props.onToast(withTiming ? "\u5DF2\u4FDD\u5B58\u63D0\u9192\u540D\u79F0\u3001\u5185\u5BB9\u4E0E\u89E6\u53D1\u89C4\u5219" : "\u5DF2\u4FDD\u5B58\u63D0\u9192\u540D\u79F0\u4E0E\u5185\u5BB9");
		    props.onChanged();
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Modal, { title: `\u63D0\u9192\uFF1A${reminder.title}`, onClose: props.onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...card, background: C.layer2, fontSize: 12, color: C.label2 }, children: "\u8FD9\u662F DSH \u539F\u751F\u4F1A\u8BDD\u63D0\u9192\uFF0C\u7531\u539F\u751F schedule \u670D\u52A1\u6295\u9012\u3002\u5B83\u6CA1\u6709\u6267\u884C\u8BB0\u5F55\uFF1A\u4E0B\u9762\u7684\u8BB0\u5F55\u53EA\u8BF4\u660E\u6D88\u606F\u5728\u4F55\u65F6\u6295\u9012\u7ED9\u54EA\u4E2A\u4F1A\u8BDD\u3002" }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: title, onChange: (event) => setTitle(event.target.value), style: inputStyle }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u5185\u5BB9", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "textarea",
		      {
		        value: prompt,
		        onChange: (event) => setPrompt(event.target.value),
		        rows: 3,
		        style: { ...inputStyle, resize: "vertical" }
		      }
		    ) }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionTitle, { children: "\u89E6\u53D1\u89C4\u5219" }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u7C7B\u578B", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		      "select",
		      {
		        value: kind,
		        onChange: (event) => setKind(event.target.value),
		        style: inputStyle,
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "daily", children: "\u6BCF\u5929" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "weekly", children: "\u6BCF\u5468" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "cron", children: "Cron" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "every", children: "\u56FA\u5B9A\u95F4\u9694" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "at", children: "\u5355\u6B21" })
		        ]
		      }
		    ) }),
		    kind === "every" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u95F4\u9694\uFF08\u79D2\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "input",
		      {
		        type: "number",
		        min: 60,
		        value: everySeconds,
		        onChange: (event) => setEverySeconds(Number(event.target.value)),
		        style: inputStyle
		      }
		    ) }) : kind === "cron" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "Cron \u8868\u8FBE\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: expression, onChange: (event) => setExpression(event.target.value), style: inputStyle }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u65F6\u95F4", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: time, onChange: (event) => setTime(event.target.value), style: inputStyle }) }),
		    kind === "weekly" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u661F\u671F", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: WEEKDAY_LABELS.map((label, index) => {
		      const day = index + 1;
		      const active = weekdays.includes(day);
		      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		        "button",
		        {
		          style: buttonStyle(active ? "primary" : "ghost"),
		          onClick: () => setWeekdays(
		            (current) => active ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b)
		          ),
		          children: label
		        },
		        label
		      );
		    }) }) }) : null,
		    kind !== "every" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "\u65F6\u533A", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: zone, onChange: (event) => setZone(event.target.value), style: inputStyle }) }) : null,
		    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: C.error }, children: error }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle("primary"), disabled: saving, onClick: () => void save(false), children: "\u53EA\u4FDD\u5B58\u540D\u79F0\u4E0E\u5185\u5BB9" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle(), disabled: saving, onClick: () => void save(true), children: "\u4FDD\u5B58\u5E76\u4FEE\u6539\u89E6\u53D1\u89C4\u5219" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionTitle, { children: "\u6295\u9012\u8BB0\u5F55" }),
		    loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: C.label2 }, children: "\u6B63\u5728\u8BFB\u53D6\u6295\u9012\u8BB0\u5F55\u2026" }) : historyError !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, color: C.error }, children: [
		      historyError,
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: { ...buttonStyle(), marginLeft: 8 }, onClick: () => void loadHistory(), children: "\u91CD\u8BD5" })
		    ] }) : history === null || history.records.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: C.label2 }, children: "\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
		      history.records.map((record) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "div",
		        {
		          style: { ...card, background: C.layer2, padding: "8px 10px", fontSize: 12 },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: C.label }, children: [
		              "\u5DF2\u6295\u9012 \xB7 ",
		              shortTime(record.deliveredAt, reminder.timeZone ?? props.zone)
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: C.label2, marginTop: 2 }, children: [
		              "\u8BA1\u5212\u65F6\u95F4 ",
		              shortTime(record.scheduledAt, reminder.timeZone ?? props.zone),
		              " \xB7 \u6D88\u606F ",
		              record.messageId
		            ] }),
		            record.prompt === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: C.caption, marginTop: 4, whiteSpace: "pre-wrap" }, children: record.prompt })
		          ]
		        },
		        `${record.messageId}-${record.deliveredAt}`
		      )),
		      history.earlierRecordsPruned ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 11, color: C.caption }, children: [
		        "\u66F4\u65E9\u7684\u8BB0\u5F55\u5DF2\u88AB\u4FDD\u7559\u7B56\u7565\u6E05\u7406",
		        history.retention === null ? "" : `\uFF08\u4FDD\u7559 ${history.retention.days} \u5929 / ${history.retention.records} \u6761\uFF09`
		      ] }) : null
		    ] })
		  ] }) });
		}
		function LegacyRedirect(props) {
		  const selectPanel = props.selectPanel;
		  React.useEffect(() => {
		    selectPanel?.(NATIVE_PANEL_ID);
		  }, [selectPanel]);
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		    "div",
		    {
		      style: {
		        height: "100%",
		        display: "flex",
		        alignItems: "center",
		        justifyContent: "center",
		        background: C.base,
		        color: C.label2,
		        fontSize: 13
		      },
		      children: [
		        "\u81EA\u52A8\u5316\u4EFB\u52A1\u5DF2\u5E76\u5165\u539F\u751F\u300C\u81EA\u52A8\u5316\u4EFB\u52A1\u300D\u5165\u53E3",
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "button",
		          {
		            style: { ...buttonStyle(), marginLeft: 10 },
		            onClick: () => selectPanel?.(NATIVE_PANEL_ID),
		            children: "\u6253\u5F00"
		          }
		        )
		      ]
		    }
		  );
		}
		function apply(ctx) {
		  const get = typeof ctx.get === "function" ? ctx.get.bind(ctx) : () => void 0;
		  const uiWorkspace = get("uiWorkspace", false);
		  const layout = get("layout", false);
		  const selectPanel = (id) => {
		    try {
		      layout?.selectPanel?.(id);
		    } catch {
		    }
		  };
		  ctx.slots.inject(
		    "main",
		    () => ctx.slots.register(
		      { name: "main", key: NATIVE_PANEL_ID, priority: -10, inject: () => ({ uiWorkspace }) },
		      TaskCenterPage
		    )
		  );
		  ctx.slots.inject(
		    "main",
		    () => ctx.slots.register(
		      { name: "main", key: LEGACY_PANEL_ID, inject: () => ({ selectPanel }) },
		      LegacyRedirect
		    )
		  );
		}
		var source = { nativePanel: NATIVE_PANEL_ID };
		var name = "dsh-client-task-center";
		var inject = ["slots"];

		return module.exports;
	}
});
