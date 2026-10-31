# Changelog

## 0.1.0-beta.2 — 2026-10-31

- Enforce each run's captured deadline when asynchronous preparation returns,
  when a session event arrives, and when the scheduler resumes. Late completion
  events cannot bypass a delayed timeout callback.
- Start a fresh persistent session after timeout or cancellation, so a delayed
  end event from the previous run cannot terminate the next queued run.
- Guard late session-helper results and resumed watchdog ticks against writes
  after a timeout, disposal or generation change.
- Save the configured timeout and absolute deadline in run history and show
  them in run details. Existing records remain readable.
- Add deadline-boundary, delayed-callback, nonresponsive-cancellation and
  persistent-session regressions, plus an opt-in real elapsed-time verifier
  using instrumented host seams without a real model provider.
- Correct the beta.1 historical warning: the cited 20-minute runs were
  interrupted or manually cancelled before their deadlines. Those records did
  not establish an overdue 20-minute timeout. See the
  [investigation](docs/TIMEOUT-INVESTIGATION.md).

## 0.1.0-beta.1 — 2026-10-31

First public beta for DeepSeek Harness **0.2.1-rc.5**.

- Run scheduled Agent tasks with per-task models, reasoning effort, workspaces,
  permission presets, independent or persistent sessions, and saved artifacts.
- Support one-off, interval, daily, weekly, and five-field cron schedules with
  IANA time zones, missed-run catch-up, retries, cancellation, and timeouts.
- Combine executable tasks and native conversation reminders in the existing
  Automation page while keeping their storage and behavior separate.
- Provide nine chat tools for task and run management.
- Protect artifact previews with recorded-file authorization, real-path checks,
  internal-file exclusions, and sandbox policies for active content.
- Disable diagnostic operations by default; prevent GET probes from creating
  sessions; handle both synchronous and asynchronous cancellation errors.
- Preserve a backup before repairing partially invalid task stores and write
  task state with owner-only file permissions on Unix.
- Remove an unused Cordis peer declaration; host services are injected without
  importing or installing a second framework instance.
- Add Chinese and English documentation, real installed screenshots, a license,
  contribution and security policies, issue templates, CI, and package checks.

This is a beta, with the boundaries listed in [compatibility and known
limitations](docs/COMPATIBILITY.md). There is no stable 1.0 release yet.
