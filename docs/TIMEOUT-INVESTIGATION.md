# Timeout investigation — 2026-10-31

Version: **0.1.0-beta.2**, DSH compatibility: **0.2.1-rc.5**.

## What the old records actually establish

The beta.1 documentation described an unexplained overdue 20-minute run. Reading
the retained run records and the earlier task-definition snapshot corrected
that interpretation:

| Record | Recorded elapsed time | Recorded outcome | Relation to a 20-minute limit |
| --- | --- | --- | --- |
| Long manual run | 989,032 ms (16m 29.032s) | `failed / interrupted` on plugin reload reconciliation | 210,968 ms before 20 minutes |
| Catch-up run cited by the old 02:30 note | 258,574 ms (4m 18.574s) | Manually cancelled | 941,426 ms before 20 minutes |
| Explicit one-minute verification | 60,353 ms | `timeout` | Consistent with its one-minute setting |

The retained task definition used 20 minutes for the first two cases. Old run
records did not capture the effective timeout configuration themselves, so the
later task snapshot cannot prove every historical setting at execution time.
Neither cited record demonstrates a run that remained active for 20 minutes
without timing out. The beta.1 warning and the earlier assertion that this
observed run proved a blocking `cancel()` diagnosis were unsupported.

The private records and personal paths are not published. This table preserves
the relevant timings and outcomes without task prompts, session IDs or machine
paths. The earlier release remains available as an immutable historical version;
this document records the correction.

## Bugs reproduced in the current code

These are separately reproduced defects, not claimed explanations of the old
interrupted run:

1. **A delayed timer could lose to a late success event.** Beta.1 depended on its
   timeout callback and did not recheck the runtime deadline on session events.
   Advancing the controlled clock beyond 20 minutes before delivering a
   successful `turn/end` recorded `succeeded` instead of `timeout`.
2. **Late preparation could still dispatch a model request.** Session creation
   returning after the deadline passed the generation/ownership check and
   continued to the prompt when the timeout callback had not fired yet.
3. **Scheduler recovery did not check active deadlines.** A scheduler tick could
   leave an already overdue run active while waiting for the original timer.
4. **A late cancellation event could terminate the next persistent run.** After
   timeout, a queued run reused the previous session. Delivering the old turn's
   aborted event after the next prompt started incorrectly finalized the new run.
5. **A late creation could replace the newer persistent session.** While A was
   preparing, it could time out and let B create a new session; A returning later
   still overwrote the task cache, causing C to resume A’s unused session.
6. **A pending watchdog could write after unload.** The new deadline watchdog
   yielded without checking the engine generation afterward. Disposing during
   that yield still allowed the old engine to queue and persist another task.

The first three cases failed four regression assertions before the deadline
fix. The fourth failed two assertions before session invalidation. An independent
read-only agent review reproduced the fifth and sixth; four more assertions failed
before their ownership guards were added. The reviewer independently confirmed
both repairs. Red logs are retained locally; the regressions run in the public
test suite.

Node.js does not guarantee exact timer callback timing or ordering. A deadline
must therefore be checked where work resumes and results are consumed, rather
than inferred from whether the timer callback ran first.
([Node.js timer documentation](https://nodejs.org/docs/latest-v22.x/api/timers.html#settimeoutcallback-delay-args))

## Changes

- Capture a deadline at execution start, before asynchronous preparation.
- Recheck it after preparation, before consuming session events, and on ordinary
  scheduler ticks. The optional synthetic scheduling time is not used to expire
  actual running work.
- Keep finalization ahead of best-effort cancellation; a cancellation promise
  that never resolves cannot leave the record active.
- Invalidate a persistent session after timeout or cancellation. A subsequent
  run receives a new session, so old events cannot act on it.
- Fence session-helper writes and resumed watchdog ticks with run/engine
  ownership, including after each asynchronous return.
- Persist `timeoutMinutes` and `timeoutAt` and display them in run details. The
  runtime deadline does not change when someone edits the task mid-run; old
  records without these fields remain readable.

## Verification

The automated engine/API suites contain **284 passing assertions** after the
fix. Coverage includes 16m 29.032s, one millisecond before 20 minutes, exactly 20
minutes, delayed preparation/events, stuck cancellation, persisted deadline
snapshots, task edits, synthetic schedule time, stale persistent events, late
session creation and disposal during watchdog recovery.

An additional verifier uses the actual engine and real elapsed timers with two
controlled host scenarios: session preparation never returns; and prompt plus
cancellation never return. It can be reproduced from a source checkout:

```sh
pnpm install --frozen-lockfile
pnpm verify:timeout --minutes=20
```

It takes about 20 minutes, writes its isolated state and result under `.local/`,
and makes no real provider call. CI uses `--minutes=0.02` to exercise the verifier
without treating that short test as long-duration evidence.

The completed long-run measurements are attached in
[timeout-validation.json](timeout-validation.json).

## Limits of this result

The deadline tests simulate delayed callbacks and ordering; they are not an
actual OS sleep/resume test. The elapsed-time verifier uses instrumented host
seams, not a live DSH desktop or external provider. No new paid model request
or modification to the normal desktop task store is part of this verification.
Event-loop suspension can delay all in-process observers; the engine checks on
recovery. A timeout record and cancellation request cannot prove that a remote
provider or detached command has stopped. The release remains a beta.

## Measured final-engine result

The final engine was checked with real elapsed time on v22.23.1 and
source SHA-256 `d65d4c56f9cb845569b60b2f72a95dc71eb250c7130f5a59d2fa8a998b1bcda0`. Both scenarios used the configured 1,200,000 ms limit:

| Controlled scenario | Recorded duration | Outcome |
| --- | --- | --- |
| Session preparation never returns | 1,200,298 ms | `timeout` |
| Prompt and cancellation never return | 1,200,271 ms | `timeout` |

The stored outcomes were read back from disk. Disposal left zero session
listeners. The packaged runtime source matches this engine hash. The 284 engine/API
assertions also passed using the DSH-provided Node 24.21.0 command environment.
The full elapsed-time run used controlled host seams and no real provider call.
