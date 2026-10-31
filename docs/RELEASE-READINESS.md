# First public beta assessment — 2026-10-31

**Decision: suitable for a public beta; stable 1.0 is not yet justified.**

The project has an implemented execution engine, native UI integration,
persisted run history, artifact delivery, and meaningful local regressions.
Release preparation adds the missing public packaging and contributor material.

## Verified during preparation

| Check | Evidence and scope |
| --- | --- |
| Strict TypeScript checking | Passed with the checked-in compiler configuration |
| Engine regressions | 211 assertions passed using a fake host and temporary files |
| HTTP/store/security regressions | 44 assertions passed, including trust denial, preview isolation, diagnostic gating and repair backup |
| Production build | Host ESM/shim and client module-loader bundle built |
| Client smoke | Component/loader stand-in passed; both native/custom registration orders and unload restoration covered |
| Package validation | 11 reviewed runtime/documentation files; unpacked host entry imports successfully; no install/prepare build hook |
| Clean source directory | Frozen-lockfile installation, gate and package check passed without the existing node_modules |
| DSH package installation | Installed the release tarball using the bundled DSH 0.2.1-rc.5 command in an isolated DSH home/profile |
| Dependency audit | No reported advisories at preparation time; see current CI for later results |
| Publication hygiene | Candidate source/docs scanned for common token patterns and personal machine paths; local Markdown targets checked |
| Installed screenshots | Two original images supplied by the maintainer; task list and creation form on macOS |

These repository checks do not make a paid model request. They do not establish
live-provider reliability or output quality. GitHub Actions results should be
read separately from the local results above.

## Changes made for publication

- Added Chinese/English project entry points, installation/upgrade/removal
  instructions, architecture and compatibility notes, and the supplied images.
- Added the BSD-3-Clause license already declared by the package, third-party
  notices, contribution/community/security policies, issue/PR templates, and CI.
- Disabled diagnostic probes by default and made the session-creating tool probe
  POST-only, including when diagnostics are enabled.
- Handled host cancellation failures and cleaned up cancellation fallback timers.
- Preserved partially invalid stores before repair and restricted new Unix state
  files to their owner.
- Removed an unused Cordis peer declaration that caused an installation warning;
  the plugin uses injected host services and imports no Cordis implementation.
- Added a package-content check and prebuilt files for tagged GitHub installs.

## Remaining evidence needed for stability

Resolve the earlier unexplained long-run timeout observation; run prolonged
real-host acceptance; obtain independent installation feedback; and validate
additional host/platform combinations and accessibility. The full scope is in
[COMPATIBILITY.md](COMPATIBILITY.md). No critical-job or 1.0 reliability claim is
made by this beta.

Private development notes, backups, test homes and real DSH task/session data
are excluded from the public repository. GitHub publication does not reinstall
or enable the plugin in the maintainer's normal DSH profile.
