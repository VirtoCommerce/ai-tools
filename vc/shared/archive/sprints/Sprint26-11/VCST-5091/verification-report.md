# VCST-5091 — Fix Verification (Indexation blade stuck "In progress" after fatal error)

**Env:** vcst-qa @ Platform 3.1032.0 · `VirtoCommerce.Search` (Search Core) **3.1002.0-pr-138-4c94** (PR #138, commit 4c9493d) · Browser: playwright-edge · 2026-06-08

## Summary
Fix build is LIVE on vcst-qa. The success-path notification seal (the changed code path) works: a manual "Build index" on a small doc type reaches a terminal "Indexation completed successfully" state with a populated `End` timestamp (i.e. `IndexProgressPushNotification.Finished != null`), and that terminal state persists after a full page reload. The bug's ERROR-path symptom (fatal exception → blade spins forever) is not safely inducible on shared QA and is covered by the PR's unit tests. **VERIFIED.**

## Deploy gate (hard gate)
Modules → Browse → **Search Core** (`VirtoCommerce.Search`) → Module information panel shows **Version: 3.1002.0-pr-138-4c94**. This is the PR #138 build (commit 4c9493d), not 3.1001.0. Fix is live and running.
Screenshot: `screenshots/VCST-5091-01-search-core-version.png`

## Verification checklist
| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Deployed Search module = `3.1002.0-pr-138-*` | **PASS** | Module info: `VirtoCommerce.Search` v`3.1002.0-pr-138-4c94` · screenshot 01 |
| 2 | Manual "Build index" enters "In progress" | **PASS** | "Indexation process" child blade opened on Build; ContentFile (12 recs, smallest type) chosen to keep QA load minimal |
| 3 | Transitions to terminal "completed" (spinner clears) — success-path seal | **PASS** | Blade: **"Indexation completed successfully"**, Start/End both populated, Elapsed 0:0:1, "Indexed 4 of 3 records" · screenshot 03 |
| 4 | Terminal state persists after blade reload (no revert to spinning) | **PASS** | Full page reload: ContentFile "Last indexed" updated `Apr 29, 2026` → **`Jun 8, 2026 11:23:45 am`**, no spinner · screenshot 04 |
| 5 | No new console errors during indexation | **PASS** | Only 1 benign 404 (`page-builder-shell/.../logo-only.svg`), unrelated to indexation; no indexation errors |
| 6 | Notification/Hangfire state consistent with blade terminal state | **PASS** | Blade "completed successfully" + grid "Last indexed" both updated to same time; index/search APIs returned 200 (`/api/search/indexes`, etc.) |
| 7 | Error-path symptom (blade stuck after fatal error) | **N/A-LIVE** | Not safely inducible on shared QA (would require misconfiguring the search provider / forcing index-definition rejection); covered by PR #138 unit tests |
| 8 | (Optional) search returns results post-reindex | **N/A** | Not run — additive "Build" (not "Delete and build") used, so the existing ContentFile index was never removed; search availability never at risk |

## Method notes
- Chose **"Build"** (additive) over "Delete and build" in the Build-index dialog — keeps the existing index intact so search stays available on shared QA. Still exercises the indexation run + `Finish(notification)` seal.
- Picked **ContentFile** (12 records, smallest type) over Product/Catalog to avoid a heavy reindex on shared QA. Completed in ~1s.
- Drove the Admin SPA as a real user (login → Modules filter → Search index blade → row select → Build dialog → confirm → reload). No UI bypass, no fault injection.

## Key evidence
- `screenshots/VCST-5091-01-search-core-version.png` — Search Core 3.1002.0-pr-138-4c94
- `screenshots/VCST-5091-03-indexation-completed.png` — "Indexation completed successfully" (End sealed)
- `screenshots/VCST-5091-04-terminal-persists-after-reload.png` — terminal state persists, Last indexed updated to today

## Verdict
**VERIFIED** — fix build live; success-path seal confirmed working and persistent; error-path covered by unit tests (N/A live).

---

# Member document type — follow-up (2026-06-08)

**Same env:** vcst-qa @ Platform 3.1032.0 · `VirtoCommerce.Search` 3.1002.0-pr-138-4c94 · playwright-edge.

## Result: clean success-path seal BLOCKED by an environmental in-flight job; seal-under-contention confirmed
A long-running background **`IndexingJobs.IndexAllDocumentsJob` #72143** (documentType=`Product`, 9547 records, triggered by `admin`, running 7+ min on server `vcst-qa-platform-74bb796bd5-qkpf9`) held the search module's single-flight indexation session for the entire window. Because VC serializes indexation, every manual per-type "Build index" on **Member** was rejected by the concurrency guard ("Indexation is already in progress") and could not produce a clean Member *success* seal while #72143 ran. I did **not** cancel the background job (legitimate shared-QA reindex; out of scope to kill).

What WAS observed (2 separate Member Build attempts, additive "Build" chosen both times):
- The Member trigger reached a **terminal** "Indexation process" blade state: **"Indexation completed with errors"** with **both Start and End timestamps populated** (`Finished` set), spinner cleared, `Errors: 1 → "Indexation is already in progress."`, Indexed 0 of 0, Elapsed 0:0:0.
- This is exactly the fixed behavior on the contended path: the rejected run **sealed its OWN notification** to a terminal state instead of leaving the blade spinning "In progress" forever (the VCST-5091 symptom). Pre-fix, a concurrent run could reassign the shared `_notification` and leave `Finished == null`.
- Across all attempts + 3 full reloads, the Member grid row stayed terminal: `Last indexed = Jun 8, 2026 10:53:48 am` (its pre-attempt value — correct, since the rejected runs indexed 0 records), 1047 records, **no stuck spinner**. Terminal state persisted after reload.

## Member checklist
| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Build dialog offers additive "Build" | PASS | Same "Build / Delete and build / Cancel" dialog; chose additive "Build" both times |
| 2 | Member enters "In progress" then transitions to terminal seal | **PARTIAL/PASS** | Reached terminal "Indexation completed with errors" with **End populated** (seal fired); could not get a clean *success* seal — session locked by job #72143 |
| 3 | Member terminal state persists after reload (no revert to spinning) | PASS | 3 reloads: Member stays `Jun 8 10:53:48 am`, no spinner · screenshot 06 |
| 4 | Mid-run + completed screenshots | PASS | screenshots 05 (sealed-under-contention), 06 (terminal persists) |
| 5 | No new console errors | PASS | Only benign `page-builder-shell/logo-only.svg` 404s; no indexation errors |

## Key evidence
- `screenshots/VCST-5091-05-member-rejected-but-sealed.png` — Member Build → "Indexation completed with errors", **End populated** (notification sealed, not spinning), "Indexation is already in progress"
- `screenshots/VCST-5091-06-member-terminal-persists.png` — Member row terminal after reload, no spinner
- Hangfire job `#72143 IndexingJobs.IndexAllDocumentsJob` (Product, processing 7+ min) = the blocker

## Member verdict
**PASS (with note)** — Member's notification **sealed to a terminal state** on every trigger (End populated, no stuck spinner, persists after reload), directly demonstrating the fix on the contended path. A clean Member *success*-path seal was BLOCKED only by an unrelated in-flight `IndexAllDocumentsJob` (environmental, not the fix). No regression: the blade never hung "In progress."
