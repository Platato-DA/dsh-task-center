# Desktop startup recovery — 2026-11-02

The local linked installation was restored and rebuilt. With Task Center enabled
at its original link path, the desktop Host became ready in **4.189 seconds**,
the plugin ping returned **200 / pong=true**, and a further 30 seconds of
observation showed no sustained CPU spin. The desktop frontend was also checked.

## What was established

The repeatable failure in this investigation was a local file-availability
problem. Several files in the iCloud-managed checkout had macOS `SF_DATALESS`
(`0x40000000`) set. Reads of `src/index.ts`, `lib/impl.js`, build scripts and Git
metadata timed out. The failing Host remained inside native
`uv_fs_read -> read`; after startup activity its sampled CPU was 0%.

The implementation is required by **`lib/index.js:5`**, with a second,
cache-busting import at **`lib/index.js:7`**. An unavailable implementation file
can therefore block module loading before `apply()` executes. A failed
`Debugger.pause` request alone does not distinguish a native synchronous read
from a JavaScript loop.

A copy of the published `0.1.0-beta.2` files in an ordinary local directory became
ready in 1.864 seconds and passed the plugin ping and 30-second observation.
After the unavailable files were restored from their indexed Git blobs and the
original checkout was rebuilt, the original link path also passed. The original
files and Git metadata were preserved before restoration; some originals remain
cloud placeholders, so their unavailable bytes were not independently read.

All eight `src/host/*.ts` files and `src/index.ts` matched the rebuilt source
map's `sourcesContent`. The rebuilt runtime files were newer than every source
file and byte-identical to the versioned build. Directory modification dates
alone did not establish a stale bundle. No scheduler behavior change was needed
for the successful local recovery. The previously reported JavaScript CPU loop
was **not reproduced or assigned a source line** in this investigation.

## Reproduce the startup check

The repository now includes a macOS desktop probe based on the desktop Host's
IPC startup contract. It requires an explicit profile directory:

```sh
npm run verify:boot -- /path/to/profile 20000 30000
```

The arguments are profile directory, boot deadline in milliseconds and
observation time after ready in milliseconds. `DSH_DESKTOP_APP` can select an
existing app installation. The default app path is
`/Applications/DeepSeek Harness.app`; the verified Host version is `0.2.1-rc.5`.
Use a quiet profile when checking idle CPU: enabled tasks and other plugins can
start work when their Host boots.

The probe checks the plugin's required local files for `SF_DATALESS` before
launching, reports `READY` or a bounded failure, checks the enabled plugin's ping,
observes CPU, redacts URL tokens and cleans up its own Host process group. Five
consecutive samples at or above 90% CPU after a five-second settling period
produce `CPU_SPIN`. A nonzero exit identifies a failed check.

For two-profile comparison, copy the same profile configuration and change only
the Task Center bundle entry. Preserve the real profile and data before making
recovery changes. If cloud-only files cannot download, preserve those originals
before restoring reviewed files. A checkout outside iCloud-managed Desktop or
Documents avoids dependence on cloud materialization for plugin startup.

## Recorded local results

| Case | Outcome | Time to ready |
| --- | --- | --- |
| Original unavailable link files | HANG, stopped after 20 seconds | — |
| Recovered checkout, Task Center excluded | READY | 3,080 ms |
| Recovered checkout, Task Center included | READY; ping 200; 30-second observation passed | 4,189 ms |
| Probe against preserved cloud-only implementation | UNAVAILABLE_FILE, exit 1 before Host launch | — |

The final enabled-profile sample spent 1,516 of 1,687 main-thread samples in
`uv__io_poll -> kevent` (macOS's event wait). Startup CPU spikes settled; the
30-second observation did not show continuous saturation. These measurements
cover startup and short idle observation, rather than long-running scheduled
model execution.

Both controlled profile runs still reported the official experimental
inspector's `globalThis.fetch` accessor activation warning. The excluded run
also reported a DS Bot GitHub connector negotiation failure during shutdown.
Both Hosts reached ready; those separate warnings were retained in the local
logs and were not changed by this recovery.
