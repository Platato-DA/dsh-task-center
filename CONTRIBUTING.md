# Contributing

中文和 English 的 issue、文档修正和 pull request 都欢迎。

## Before opening a change

- Search existing issues, then describe the problem and the desired behavior.
- Discuss substantial features or DSH compatibility changes in an issue first.
- Report security issues privately using [SECURITY.md](SECURITY.md).
- Never attach API keys, cookies, real task state, full session exports, or
  unredacted personal paths. A minimal reproduction is more useful.

## Development

Use Node.js 22 or newer and pnpm **9.15.9**. The project's package manager is
separate from the pnpm runtime bundled with DSH.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm gate
pnpm check:package
```

`gate` runs strict type checking, the engine/API regressions, a production build,
and a client component/loader smoke test. The smoke test uses a React stand-in;
it does not replace a real DSH UI acceptance test. No model or DSH server is
started by these checks.

An optional elapsed-time check is available as `pnpm verify:timeout --minutes=20`.
It uses the actual engine with controlled host seams, takes about 20 minutes,
and makes no real provider calls. CI runs a short version to keep this verifier
executable; it does not pretend the short run is long-duration acceptance.

## Pull requests

1. Keep changes focused and explain the user-visible result.
2. Add a meaningful regression for changes to scheduling, permissions,
   persistence, transport, or run lifecycle. Documentation corrections do not
   need new tests.
3. Run the commands above. Include the relevant result and limitations.
4. Commit the regenerated `lib/` files when `src/` changes. They are included so
   tagged GitHub installs work without running an installation build script.
5. Update the changelog for behavior changes. Do not change the release version
   or widen `engines.dsh` without a compatibility check.

Use an isolated DSH home/profile for integration work. Do not boot a test
scheduler against an existing personal task store. Real model calls require
the tester's own informed decision; they can incur provider charges.

By contributing, you agree to make your contribution available under this
project's BSD-3-Clause license. Be respectful, discuss code and behavior, and
follow the [community guidelines](CODE_OF_CONDUCT.md).
