# BUG: Indexation blade stays "In progress" after a fatal error during index creation

## Status: CONFIRMED

**Severity:** Medium (functional — Admin UX / observability; no data loss)
**Env:** vcst-qa @ Platform 3.1032.0, VirtoCommerce.Search 3.1001.0
**JIRA:** VCST-5091 (reported by Oleg Zhuk, VC platform dev — full developer RCA on ticket)

## Summary

When a fatal exception is thrown from `ISearchProvider.CreateIndexAsync` (or any point reachable from `IndexingManager.IndexAsync`) during a **manually-triggered** full indexation, the Hangfire job correctly ends as `Succeeded` with `"Indexation completed with errors"` in its console, but the Admin SPA **Search → Indexation** blade keeps spinning **"In progress"** indefinitely. The row only clears on manual blade reopen/refresh, and even then the cached notification can still report unfinished.

## Reproduction

> **Live browser repro is not possible** — the fault must be injected in source and the platform rebuilt. Reproduction is therefore source-confirmed here and is encoded as the Gate-2 failing xUnit test in `/qa-fix`.

1. In `src/VirtoCommerce.SearchModule.Data/Services/IndexingManager.cs`, add a `throw new SearchException(...)` at the top of `CreateIndexAsync` (mirrors Azure/Elastic/OpenSearch rejecting an index definition — suggester analyzer, duplicate field, type mismatch).
2. Build + start the platform (provider-agnostic — platform-side bug).
3. Admin Manager → **Search → Indexation**; click **Build new index** on any document type (enqueues `IndexAllDocumentsJob` via `IndexingJobs.Enqueue` with a non-empty notification `Id`).
4. Observe.

**Expected:** Once the Hangfire job ends, the blade row stops spinning and shows `"Indexation completed with errors"` (+ error count / trace link) — i.e. the same terminal text the Hangfire console shows.

**Actual:** Blade row stays on the spinning **"In progress"** state; never transitions to a terminal/error state without manual reload.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Admin-only feature; storefront does not exercise indexation UI |
| 2. Backend Admin (SPA) | FAIL | Blade `index-progress.js:24` renders spinner while `notification && !notification.finished`; `finished` never arrives on the error path (dev-reported symptom) |
| 3. GraphQL xAPI | N/A | Not in flow |
| 4. Platform REST API | N/A | Push-notification poll returns the notification faithfully — it just has no `Finished`; root cause is the background job, not REST |

**Owning layer:** Backend — the `vc-module-search` background-job data layer (C#). The Angular blade behaves correctly given the data it receives; `IndexProgressPushNotification.Finished` is never set on the manual-job error path.

## Root Cause Analysis

Confirmed against live `dev` source:

- `IndexProgressHandler.Finish()` (`IndexProgressHandler.cs:112`) is the **only** place `_notification.Finished` is set. `Exception(ex)` (`:96`) only appends to `Errors` / increments `ErrorCount` — it does **not** set `Finished`.
- In `RunIndexJobAsync` (`IndexingJobs.cs`), the inner `finally` is guarded so it **skips `Finish()` for manual jobs** (non-empty `notificationId`):

  ```csharp
  finally
  {
      // Report indexation summary only for "Recurring job ..."
      if (notificationId.IsNullOrEmpty())
      {
          _progressHandler.Finish();
      }
  }
  ```

  sealing the notification is deferred to the outer `IndexAllDocumentsJob.finally`'s own `_progressHandler.Finish()`.
- That outer `Finish()` is unreliable when the inner one is skipped, via either of two mechanisms the reporter documents: (1) handler **state leak** — `Start()`→`GetNotification()` re-fetches/reuses the notification by Id without resetting `Finished`, so a subsequent run on the same DI instance can leave the polled notification with `Finished == null`; (2) an `AlreadyInProgress`/double-`Finish()` race when the distributed `IndexationJob` lock can't be acquired. On a successful run the symptom is masked because `Progress(...)` pushes `processed == total` before `Finish()` lands; on the error path `Progress(...)` never fires.

**Suggested fix (per reporter):** move `Finish()` out of the `if (notificationId.IsNullOrEmpty())` guard so it always runs in `RunIndexJobAsync`'s inner `finally`, and drop the now-redundant outer `Finish()` in `IndexAllDocumentsJob`. Optional hardening: reset handler state (`_notification`, `_context`, `_progressBar`, count maps) in `Finish()` to prevent cross-invocation leakage. **The exact minimal fix and which of the two failure modes is load-bearing is to be pinned by the Gate-2 reproduction test, not assumed.**

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2/Backend — module background-job data layer (server-side C#; not the Angular blade)
- **Suggested repo:** VirtoCommerce/vc-module-search
- **repoKind:** module
- **Component / module:** Search — `IndexingJobs` / `IndexProgressHandler` background jobs
- **RCA anchor:** `src/VirtoCommerce.SearchModule.Data/BackgroundJobs/IndexingJobs.cs` — `RunIndexJobAsync` inner `finally` guard `if (notificationId.IsNullOrEmpty())`; `IndexProgressHandler.cs:112` `Finish()` (only `Finished` setter)
- **Routing confidence:** HIGH — single repo, anchors verified against live `dev` (`05666f37`, `1b530f3e`)

## Verification 2026-06-08 — VERIFIED_WITH_NOTES

- **Fix / PR:** VirtoCommerce/vc-module-search [PR #138](https://github.com/VirtoCommerce/vc-module-search/pull/138) (commit `4c9493d`) — **open, not yet merged**.
- **Build under test:** `VirtoCommerce.Search 3.1002.0-pr-138-4c94` confirmed running on vcst-qa (Platform 3.1032.0).
- **Result:** success-path seal verified live — manual "Build index" reached terminal "Indexation completed successfully" with `Finished` set, persisted after reload (no stuck spinner). Regression clean. Error-path symptom not safely inducible on shared QA → covered by PR unit tests (concurrent-job test, RED→GREEN). 6/6 live-checkable items PASS.
- **Evidence:** `tests/Sprint26-11/VCST-5091/`.
- **Status held at OPEN** pending human merge of PR #138; move to `fixed/` + Resolution block once merged.

## Verification 2026-06-08 (addendum) — job-process race deliberately reproduced 3/3

Follow-up to the run above, focused on the **race condition between indexation job processes** (one of the two RCA mechanisms — the `AlreadyInProgress` / concurrent-run path that the first run only caught incidentally).

- **Build under test:** `VirtoCommerce.Search 3.1003.0-pr-138-6c22` — **same PR #138, newer commit (6c22)** than the 4c94 build from the morning run; deployed on vcst-qa (Platform 3.1035.0-pr-3051). Commit/version delta flagged, not a blocker.
- **Method:** started a heavy lock-holder (job A = Product, 9550 recs, ~6m41s, additive "Build") then fired a second manual "Build index" on a small doc type **while A was still running** — ContentFile, then Pages, then Member.
- **Result — PASS, 3/3 clean races:** every rejected job B (`Errors: 1 → "Indexation is already in progress."`) sealed **its OWN** notification to a terminal **"Indexation completed with errors"** with **both Start and End populated** (`Finished` set), spinner cleared, and **persisted after full page reload** — i.e. the exact pre-fix symptom (notification stuck "In progress" forever / shared `_notification` never reaching `Finished`) was **not** reproducible. Job A sealed independently (Indexed 9198/9198, End set), unaffected by B's rejection.
- **No regression:** no 5xx; `POST /api/platform/pushnotifications` → 200; only benign `logo-only.svg` 404 + GA `collect` ERR_ABORTED. Job A's `Errors: 65` are pre-existing ES8 data-quality mapping failures (e.g. `[size]` = '46 mm'), unrelated to PR #138.
- **Evidence:** `tests/Sprint26-11/VCST-5091/race-verification-2026-06-08.md` + `screenshots/race-0{1..4}-*.png`.
- **Live coverage status:** success-path seal ✅, contended/`AlreadyInProgress` race-path seal ✅ (now deliberately, 3/3). Only the fatal-`CreateIndexAsync`-exception path remains not safely inducible on shared QA — covered by PR #138 unit tests. **JIRA currently at "Tested".**
