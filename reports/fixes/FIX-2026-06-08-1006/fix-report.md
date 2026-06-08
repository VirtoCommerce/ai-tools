# FIX-2026-06-08-1006 — VCST-5091

**Indexation blade stays "In progress" after a fatal error during index creation**

| | |
|---|---|
| **Ticket** | VCST-5091 (Bug, Medium) |
| **Repo / kind** | VirtoCommerce/vc-module-search · `module` |
| **Branch** | `claude/qa-autofix/VCST-5091` (commits `612e0ad`, `4c9493d`) |
| **PR** | https://github.com/VirtoCommerce/vc-module-search/pull/138 — **OPEN, not merged** |
| **Env at fix time** | Platform 3.1032.0, VirtoCommerce.Search 3.1001.0 (vcst-qa) |
| **Bug report** | `reports/bugs/open/BUG-indexation-blade-stuck-in-progress-VCST-5091.md` |

## Gate results

| Gate | Result | Note |
|------|--------|------|
| G0 Eligibility | PASS | Localized, low-risk, non-breaking, code-fixable |
| G1 Single repo | PASS | `vc-module-search` (module) — RCA anchor verified vs live `dev` |
| G2 Reproduce (RED) | PASS | New xUnit test over real seam; concurrent-job test RED on current code |
| G3 Fix (GREEN) | PASS | 112 tests pass (110 pre-existing unmodified + 2 new); build clean |
| G4 Code review | PASS (APPROVE, HIGH) | `backend-reviewer`; `Start()` return-widening ruled non-blocking |
| G5 CI | PASS | SonarCloud QG green, ci + auto-tests (mysql/postgres/sqlserver) green |
| G6 E2E | DEFERRED | Backend static-only in CI; needs deploy → `/qa-verify-fix VCST-5091` |
| G7 Human review | STOP (as designed) | PR open for human; **never auto-merged** |

## Root cause

`IndexingJobs` is a DI **singleton** holding one **transient** `IndexProgressHandler`, so the handler's `_notification` field is shared across all indexation runs. For manual jobs the seal (`IndexProgressHandler.Finish()`, the only setter of `Finished`) was deferred to `IndexAllDocumentsJob`'s outer `finally`; by the time it ran, a concurrent/second run could have reassigned `_notification`, leaving the earlier run's notification with `Finished == null` forever → Admin blade spins "In progress" (`index-progress.js:24` renders while `!notification.finished`). A lone manual run already sealed correctly — so the reporter's proposed guard-removal alone did **not** fix it; the load-bearing failure mode is the shared-state leak, confirmed empirically by the reproduction test and by the `Module.cs` DI lifetimes.

## Fix (minimal, behavior-preserving)

- `IndexProgressHandler.Start()` now **returns** the run's own notification; added `Finish(notification)` / `Exception(ex, notification)` overloads operating on a captured notification; original no-arg versions kept and delegate.
- `IndexingJobs.RunIndexJobAsync` captures `var notification = Start(...)` in a **local** and always seals **that** notification in the inner `finally` (removed the `if (notificationId.IsNullOrEmpty())` guard); errors routed via `Exception(ex, notification)`. Removed the now-redundant outer `Finish()` in `IndexAllDocumentsJob`.
- Follow-up commit `4c9493d`: extracted a nested ternary (SonarCloud S3358) into a local — byte-for-byte equivalent output — to clear the quality gate.

No public REST/GraphQL/DTO/event/manifest/schema change. Recurring-job path unchanged. BL search-index-lag semantics untouched.

## Tests added

`tests/VirtoCommerce.SearchModule.Tests/IndexationFinishOnErrorTests.cs` (2 tests, real seam via Hangfire `MemoryStorage` + stateful fake push manager):
- single manual job that throws → `Finished != null` + `ErrorCount > 0` (passes on old code — documents the non-defect path)
- second manual job enqueued mid-flight of the first → **both** notifications sealed (**RED → GREEN**)

## Next step

Human review + merge of PR #138. Post-deploy to QA, run `/qa-verify-fix VCST-5091` to close Gate 6 (live "blade stops spinning") and move JIRA to Done.
