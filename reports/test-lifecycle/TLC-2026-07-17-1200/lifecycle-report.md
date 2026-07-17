# Test Case Lifecycle Report — TLC-2026-07-17-1200

## Summary
- **Input:** `/qa-test-lifecycle 092 --verify --fix` + a triggered **091 DOM re-verify** (theme `pr-2383` now deployed, unblocking the Customer Profile route)
- **Input Type:** direct-scope (suites 092, 091) — Phase 5 verify + Phase 4 fix
- **Date:** 2026-07-17 12:00
- **Env:** vcst-qa · SalesRep `3.1000.0-pr-2-8c40` · Platform `3.1044.0` · theme `vc-theme-b2b-vue 2.54.0-pr-2383-f713`
- **Verdict:** **APPROVED WITH WARNINGS** — the shipped surfaces verified and were promoted; unshipped surfaces (4 admin tabs) held as BLOCKED; 6 product-bug candidates + 2 design questions flagged (no tickets filed — this command never files).

## Phase 5 — live verification
Two live passes (isolated browsers, self-coordinated single-writer on the CSVs):
- **092 Admin embedded-app** — `qa-backend-expert`, playwright-edge. Full mutating flow (create → assign org → **buyer storefront shows rep** → block → **buyer list excludes** → unblock → delete) ran end-to-end with **cross-layer proof** and clean teardown. **Post-run env sweep: 8 reps, 0 orphaned `AGENT-TEST-SR-Admin` reps, 8/8 seeded intact.**
- **091 Customer Profile** — `qa-frontend-expert`, playwright-chrome (read-only). Profile route live on pr-2383; **Orders section renders the populated, recent-first list** (5 ACME orders, dates/statuses/totals), cross-layer total match confirmed.

### Headline build finding (092)
Only **2 of 6 admin tabs are implemented** on pr-2-8c40 — **Dashboard** (stub) + **Sales Reps** (full grid). Blocked / Not-assigned-Reps / Organizations / Not-assigned-Orgs render "This view is coming soon." Underlying data is fine (blocked + 0-org reps are identifiable on the main grid); only the dedicated tab **views** are unshipped.

## Case outcomes (`--fix` applied)
**092 (22 cases):** 13 → `verified` (7 as-is: SR-ADM-005/013/014/015/016/019/022 + 6 edited: 001/002/004/007/008/020) · 4 **BLOCKED** unshipped tabs (009/010/011/012, Draft) · 1 rewritten (003 — required-role gate unreachable: role auto-defaults + re-defaults on Clear, Draft) · 4 unchanged not-exercised (006/017/018/021).
**091 (21 cases):** 12 → `verified` (7 as-is: SR-CP-001/004/008/014/015/019/020 + 5 edited: 005/012/016/017/021) · 2 retargeted-to-shipped kept Draft pending design (006 compact ship-to, 007 name-only contact) · 3 kept Draft (009/010 filter absent, 011 catches a real bug) · 4 not-exercised (002/003/013/018).

Provenance tags on DOM-confirmed assertions were upgraded to `{OBSERVED}` (standard `--verify` grounding effect). `@td()` validation green: 092 30/30, 091 38/38, 089 15/15; 0 hardcoded GUIDs; row/test counts unchanged (092=22, 091=21, 089=29).

## Incidental correctness fixes (found in passing)
- **SR-CP-014** — the 403/permission-wall `{HYPOTHESIS}` was resolved live (a rep opens a served org's order → full details, **no 403**); rewrote to `{OBSERVED}`.
- **089 dangling token** — `{{SR_REP_PASSWORD}}` has **no definition anywhere** (the seeder falls through to `TEST_USER_PASSWORD`); replaced 089's token with `{{TEST_USER_PASSWORD}}` (the var backing the seeded rep + the `SALES_REP` role). One-line fix; would otherwise have broken runner-driven 089 rep logins.

## Product-bug candidates (flagged for triage — not filed)
| # | Sev | Suite | Finding |
|---|-----|-------|---------|
| 1 | Low-Med | 091 | Profile Orders **status not localized** — query selects raw `status`, not `statusDisplayValue`; badges stay English under `/de` (SR-CP-011 catches this) |
| 2 | Minor | 092 | **Duplicate-login create → HTTP 500** + generic error instead of a clean 4xx validation (SR-ADM-004) |
| 3 | Low | 091 | Missing German key `Sales_rep.navigation.link` in the sidebar (SR-CP-016) |
| 4 | Low-UX | 092 | Blocked-column icon labelled **"Active"** for a blocked rep — correct flag, misleading wording under a "Blocked" header (SR-ADM-020) |
| 5 | Cosmetic | 091 | Order-`#` prefix omitted on the profile Orders table (present in list + order-details) (SR-CP-012) |
| 6 | Investigate | 092 | Possible **auto-save on Store-select** before explicit Save — low-confidence, needs a clean re-test (SR-ADM-002) |

## Design-confirm questions (VCST-5308 owners)
- (a) Is the **compact Customer-info card** intended? — profile shows ship-to as city+region only (backend `salesRepCustomer` exposes the full address) and primary contact as **name only**. Gates promotion of SR-CP-006/007.
- (b) Is order-**status filtering** in scope or deferred? — status is currently a display-only per-row badge, no filter (SR-CP-009/010).

## Follow-ups
- Consistency pass: make the abbreviated "Add rep" steps explicitly select the required **Store** across SR-ADM-005/006/007/008/011/017/018/019 (only SR-ADM-002 states it).
- Re-verify SR-ADM-009/010/011/012 once the 4 admin tabs ship.
- Resolve the two design questions → promote SR-CP-006/007 or revise.
- Decide filing of product-bug candidates via `/qa-bug` (#1 + #2 most file-worthy).

## Files modified
- `regression/suites/Backend/sales-rep/092-sales-rep-admin-embedded-app.csv` — 13 promoted, 4 BLOCKED, 1 rewritten, titles corrected
- `regression/suites/Frontend/sales-rep/091-sales-rep-customer-profile-storefront.csv` — 12 promoted, compact-card retargets, SR-CP-014 grounded
- `regression/suites/Frontend/sales-rep/089-sales-rep-my-customers-storefront.csv` — dangling password token fixed (1 line)
