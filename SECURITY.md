# Security policy

## Supported releases

Security fixes currently target the latest **0.1.0 beta**. Host compatibility is
limited to DeepSeek Harness **0.2.1-rc.5**. No security audit or stable-release
guarantee is claimed.

## Report a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/pallwalt/dsh-task-center/security/advisories/new).
Include a minimal reproduction, affected version, impact, and proposed fix if
available. Do not include actual API keys, cookies, task databases, or personal
documents. Do not open an issue with an exploitable proof of concept before
maintainers have had a chance to respond. Response times are best effort.

## Trust boundaries

- The plugin executes Agent tasks through DSH and inherits the permissions of
  those task sessions. A dedicated working directory alone is not an OS sandbox.
- Models, prompts, tool output, and generated files can be untrusted. Review
  task instructions and permissions before enabling unattended execution.
- Chat tools reject requests to set `danger-full-access`. The task editor
  requires human confirmation for that preset. Existing tasks with that preset
  still retain their configured powers.
- HTTP requests must pass the host's `connection.isTrusted(req)` check. Missing
  trust capability fails closed. Keep the DSH host's own access protections in
  place; this plugin does not add a separate identity system.
- GET is limited to reads. POST requires JSON when a content type is present.
- Artifact previews require the file to appear in the selected run record,
  check its real path against the run's workspace, and exclude internal task
  data. HTML/SVG/XML active content receives an opaque-origin sandbox policy.
- Diagnostic operations are off by default. `verify.chat` can create a real
  session, call a model, spend tokens, and create an enabled task; only enable
  diagnostics deliberately in a test environment.
- Timeout and cancellation record the scheduler's outcome and ask the host to
  cancel. They cannot guarantee that a remote provider or detached OS process
  has stopped. Inspect the execution session when cancellation fails.

Task prompts, outputs, file paths, and run history are stored as local JSON,
without application-level encryption. Back them up privately. The plugin does
not implement telemetry; the host and selected model providers have their own
data handling policies.
