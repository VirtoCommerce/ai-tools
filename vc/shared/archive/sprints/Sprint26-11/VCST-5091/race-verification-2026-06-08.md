# VCST-5091 — Race-Condition Fix Verification (PR #138)

**Verdict: PASS** — the indexation-job race fix works. Every rejected concurrent run (job B) sealed its OWN `IndexProgressPushNotification` to a terminal state with both Start and End populated; the lock-holder (job A) sealed independently. 3/3 races clean. No stuck "In progress" spinner observed.

**Env:** vcst-qa (`https://vcst-qa.govirto.com`) Admin SPA · Platform 3.1035.0-pr-3051 · **Search Core 3.1003.0-pr-138-6c22** · Edge · 2026-06-08
**Scope:** Search → Index race between concurrent indexation jobs (single-flight `IndexationJob` lock). Additive "Build" only; no "Delete and build"; no fault injection; UI-driven only.

> **Build note (not a blocker):** Spec expected `3.1002.0-pr-138-4c94` (commit 4c9493d). Deployed is `3.1003.0-pr-138-6c22` — **same PR #138, a newer commit (6c22) on the same branch**, minor bumped .1002→.1003. Treated as a PASS on the deploy gate (wildcard `pr-138-*` matches and it is the PR under test); flagging the commit/version delta for your awareness.

## Checklist

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Deploy gate: Search Core = `3.1002.0-pr-138-*` | **PASS** (commit delta flagged) | Module grid + info panel: `3.1003.0-pr-138-6c22`. `race-01-search-core-version.png` |
| 2 | Heavy job A enters "In progress" (holds lock) | **PASS** | Job A (Product, 9550) process blade: "Product: calculating total count" → progress 2350→9198, Start populated, Errors 0 |
| 3 | Concurrent job B rejected by guard | **PASS** | Job B blade: Errors 1 → **"Indexation is already in progress."** (all 3 attempts) |
| 4 | Job B seals OWN notification terminal (End populated, spinner cleared) — **THE FIX** | **PASS** | "Indexation completed with errors", **Start AND End both populated** ("a few seconds ago"), Elapsed 0:0:0, Indexed 0 of 0. `race-02-jobB-rejected-but-sealed.png` |
| 5 | Job B terminal persists after full page reload | **PASS** | After full app reload, notification event log shows job B still "Indexation completed with errors"; no revert to spinning. `race-03-jobB-terminal-persists-after-reload.png` |
| 6 | Job A (lock-holder) seals own terminal state, unaffected | **PASS** | Job A: "Indexation completed with errors", Start "7 minutes ago" + End "a few seconds ago", Elapsed 0:6:41, **Indexed 9198 of 9198**. `race-04-jobA-terminal.png` |
| 7 | Race reproduced N/3 consistently | **3/3** | Job B = ContentFile(12) / Pages(159) / Member(1048), each fired while A still running; all sealed terminally |
| 8 | No new/unexpected console errors or 5xx | **PASS** | Only benign `logo-only.svg` 404 (ignored) + GA `collect` ERR_ABORTED. `POST /api/platform/pushnotifications` → 200. No `/api/search` or poll errors, no 5xx |

## The fix — observed terminal text on rejected job B (identical across all 3 races)
```
Indexation completed with errors
Start  — a few seconds ago
End    — a few seconds ago      ← populated (Finish() ran, notification sealed)
Elapsed— 0:0:0
Indexed 0 of 0 records
Errors: 1
  Indexation is already in progress.
```
End **was populated** on every rejected job B. Pre-fix symptom (spinner stuck on "In progress" forever / shared `_notification` never reaching `Finished`) was **not** reproduced.

## Notes
- Job A's terminal showed `Errors: 65` — pre-existing **data-quality** mapping failures (`failed to parse field [size] of type [integer]`, value '46 mm'/'Medium'; `[width] of type [double]`, value '1,235'). Unrelated to PR #138 — catalog data not matching ES8 numeric field mappings; long-standing, not introduced by the fix.
- All 3 job-B races ran against a single long-running job A (Product, ~6m41s), so each B genuinely hit the live lock.
- No pre-existing background jobs were cancelled. Search remained available (additive Build only).

Screenshots: `tests/Sprint26-11/VCST-5091/screenshots/race-0{1..4}-*.png`
