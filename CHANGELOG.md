# Changelog

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
