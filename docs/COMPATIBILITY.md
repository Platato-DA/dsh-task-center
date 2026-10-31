# Compatibility and known limitations / 兼容性与已知限制

## Supported scope

| Item | First public beta |
| --- | --- |
| Plugin | `0.1.0-beta.1` |
| DeepSeek Harness | Exactly `0.2.1-rc.5` |
| Actual installed screenshots | macOS Desktop, supplied by maintainer on 2026-10-31 |
| Development | Node.js 22+, pnpm 9.15.9 |
| Automated CI | Linux Node 22/24, macOS Node 22; workflow results are visible in Actions |
| UI language | Simplified Chinese; English README provided |
| Distribution | GitHub source/tag and prebuilt Release `.tgz`; not npm |

`engines.dsh` intentionally stays narrow. DSH's session, permission and native
slot APIs are evolving. Passing unit tests on another platform does not establish
host compatibility. Windows, Linux Desktop and web-profile UI acceptance have
not been completed for this release.

## Known limitations

1. **Process-bound scheduler.** DSH must be running. App shutdown, OS sleep,
   suspended event loops and machine downtime can delay execution. There is no
   external daemon or hard real-time guarantee.
2. **Unresolved live timeout observation.** During earlier maintainer testing,
   one 20-minute real-host run failed to finalize on time. Its root cause remains
   unconfirmed. Current code arms timeout before preparation and finalizes before
   awaiting cancellation, with local regression coverage. A fresh long-duration
   live-model test has not been completed; do not use the beta for critical jobs.
3. **Best-effort stopping.** A timeout/cancelled record does not prove a provider
   or detached command has stopped. Retries and queued runs can produce repeated
   side effects; task authors must design for idempotency.
4. **Artifact heuristics.** Discovery uses file modification times (with a one
   second tolerance), depth 3 and at most 500 files. Hidden entries, symlinks and
   common build directories are skipped. It may miss deeper outputs or include
   unrelated concurrent edits. A successful model turn does not validate outputs.
5. **Local state.** Task prompts, paths and output summaries are unencrypted JSON.
   Writes use temporary files and rename, without `fsync`; abrupt power loss may
   still lose recent data. Keep private backups. History is bounded (default 300),
   and clearing history removes the associated preview links, not the files.
6. **Native reminders.** Their host service has no pause switch. The UI disables
   that action explicitly. Updates use compare-and-set; conflicting edits require
   refresh. Deletion does not recall a message already queued for delivery.
7. **Permissions.** Presets apply to task sessions. Legacy unmatched permission
   pairs remain visible for review; they are not silently upgraded. Workspace
   folders do not replace the host's permission controls. Human approval can wait
   until timeout when no person is present.
8. **Preview restrictions.** Active HTML/SVG/XML previews have no script capability
   or same-origin access. External images, scripts and fonts may be blocked;
   self-contained artifacts work best.
9. **Cron subset.** Five fields, at least one minute; no seconds, `L/W/#`, or month
   names. DST gaps skip missing wall times; repeated wall times choose the earlier
   instant. Unusual non-hour DST changes have not received real-host acceptance.
10. **Host-dependent execution.** Missing models, removed workspaces or absent
    per-agent/permission services fail visibly. The plugin has no model fallback,
    provider credential setup or automatic environment repair.
11. **UI and accessibility.** Existing installed UI screenshots and component
    smoke checks are available. No independent accessibility audit, broad device
    matrix or extended reliability soak test is claimed.

## Verification levels

- Source review, type checking, deterministic regressions, build, client smoke,
  dependency audit and package verification are repeatable repository checks.
- The supplied screenshots establish that the plugin has been installed and its
  page/form displayed on the maintainer's Mac.
- Earlier development notes record live execution exercises. They contain
  private local details and are not published as a fresh acceptance result.
- This release preparation does not make a new paid model request or modify the
  maintainer's real task store.

The project is suitable for an explicitly labeled public beta. Stable 1.0 should
wait for independent installation feedback, resolved long-run timeout behavior,
and a wider real-host compatibility and reliability assessment.
