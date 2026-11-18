# Sprint 26-22 · W2 Sales Rep hub — report

**Owner:** Elena Kutasina · **Sub-task:** VCST-6798 · **Env:** vcst · **Lane:** playwright-edge, slot 3
**Runs (`--by-priority`):** REG-2026-11-11-1938-W2 (Critical, theme alpha.2642 — hub did not start, see below) · REG-2026-11-11-2018-W2 (Critical) · REG-2026-11-11-2227-W2 (High) · REG-2026-11-11-2211-W2 (Medium/Low, 106 finished 2026-11-12)
**Build of the counted runs:** Platform 3.1097.0 · **theme 2.62.0-alpha.2647** (redeployed mid-release; `release.json` names alpha.2642) · VirtoCommerce.SalesRep 3.1023.0 · Xapi 3.1031.0-pr-70-108f
**Seed:** `seed:sales-rep`, `seed:sales-rep-docs`, `seed:sales-rep-tasks` (re-seeded before each 106 pass), `seed:sales-rep-call` (orgs created, its xAPI verification failed)

## Verdict

**All 417 cases run: 303 PASS · 4 FAIL · 105 BLOCKED · 5 SKIPPED. No new product defect in this release.** The 4 FAILs are Low and pre-date the release (2 are VCST-6220); every BLOCKED is a lane limit, shared-stand limit, data or env-config gap. All triaged.

| Suite | Critical P/F/B/S | High P/F/B/S | Medium+Low P/F/B/S |
|-------|------------------|--------------|--------------------|
| 089 My Customers | 12/0/2/0 | 17/0/11/0 | 16/0/16/1 |
| 091 Customer Profile | 14/0/0/1 | 23/0/5/0 | 26/1/3/0 |
| 093 Hub Dashboard | 13/0/5/0 | 28/0/6/1 | 17/0/9/0 |
| 090 My Sales Reps | 5/0/0/0 | 8/0/2/0 | 5/0/2/0 |
| 112 Activity & Insights | 2/0/3/0 | 5/0/8/0 | 3/0/7/0 |
| 097 Customer Orders | 5/0/0/0 | 23/0/4/1 | 15/1/2/0 |
| 106 Tasks | 3/0/0/0 | 20/0/2/0 (SR-TK-044 re-run: PASS) | 24/2/8/0 |
| 093b Plugin Delivery | 2/0/1/0 | 5/0/4/0 | 1/0/3/0 |
| 091c Customer Coupons | 1/0/0/0 | 3/0/0/0 | 7/0/3/1 |

## First run on alpha.2642 — delivery issue, the hub did not start

The stand was delivered with theme 2.62.0-alpha.2642, older than SalesRep 3.1023.0 (vc-module-sales-rep#24, VCST-6078) needs: the module uses `@vc-frontend/core` layout exports that arrived in vc-frontend#2552. All 68 non-manual Critical cases failed or blocked; the plugin did not start and showed no console error. Delivery redeployed the theme as alpha.2647 and the hub works. Ledger OBS-SR-PLUGIN-CORE = ENV_CONFIG (delivery), not a product defect. Evidence: `REG-2026-11-11-1938-W2/evidence/SR-HD-001/`, kb KB-35AC70AD, KB-D09A7347.

## Real bugs and decisions

| Ledger row | Finding | Verdict | New in release |
|------------|---------|---------|----------------|
| 091 SR-CP-053 | Customer profile sends two identical SalesRepCustomer requests per mount (KB-E9DE91F6) | REAL_BUG, filed **VCST-6813** (Low) | no |
| 106 SR-TK-024 | Focus drops to the page body after Enter on Mark as complete / Reopen (KB-1AC3D57E) | DUPLICATE VCST-6220 (item 1; its AC names this case) | no |
| 097 SR-CO-051 | Keyboard day pick returns focus to the date input, not "Open calendar" (KB-21C241D2). Reset filters by keyboard now keeps focus (VCST-6220 item 2 partly fixed); by mouse it still drops to BODY | DUPLICATE VCST-6220 (its AC requires this case to pass) | no |
| 106 SR-TK-022 | Due dates month heading clipped at 1440px in es/pt (declared VCST-6077 divergence); pt weekday headers also overlap (not declared) | PENDING_DECISION | no |

## BLOCKED / SKIPPED — causes and fixes

| Cases | Verdict | Cause | Fix |
|-------|---------|-------|-----|
| 41 across all suites (+ 097 SR-CO-047 skipped) | TEST_DEFECT | Need interception, throttling, touch, drag, measurement, zoom, axe or timezone emulation — impossible in the agent lane | Playwright `.spec` twins |
| 21: 089 SR-FE-057…075, 091 SR-CP-007, 088 | NOT_TESTABLE | Call-customer (VCST-6256) is not in this release; no call control on vcst | Re-run when VCST-6256 ships |
| 15: 112 SR-ACT-* | ENV_CONFIG | GA collection runs, but the GA Data API read-back is not configured on vcst B2B-store | Configure it, or declare it in `config/suite-requirements.json` |
| 14: SalesRep.Enabled toggle, shared rep/org/cart, store-wide coupons, API-written layouts, 106 SR-TK-026 | NOT_TESTABLE | Would change state the other lanes share | Own persona or isolated stand |
| 16 | DATA | Absent on vcst: 1000+ YTD orders, >10 reps per org, filter chips, Top-sellers rules, prior-period orders, coupon ending at midnight, ORG_SR_CALL_MULTI, SR_REP_NOCUSTOMERS_ORGCTX password, … | Extend the sales-rep seeders |
| 091 SR-CP-047, 091c SR-CP-078 · 093 SR-HD-091 | BY_DESIGN / NOT_TESTABLE | Manual · deprecated | — |

## Other observations

- 093 SR-HD-043: the known keyboard-grab defect still reproduces.
- 093b: cold full-page hub loads showed an empty page for 7–20 s (vcst baseline 1.1–1.6 s); lane overhead not ruled out — re-measure on a clean lane.
- 097: the raw i18n key `Sales_rep.navigation.link` flashes in the Corporate rail on first load (Low).
- Case text behind the UI (passed anyway) — repair via `/qa-review-tests --fix` (ledger OBS-SR-STALE-TEXT): 093 SR-HD-002, 046 (WEEK card is position 3 of 6), 097 SR-CO-001, 025 (password key), 106 SR-TK-030, 089 table columns / "Send email", layout ops (`SaveLayout`/`GetLayout`, scope `salesRepCustomerProfile`), "My recent orders", "Search by name", `/graphql` endpoint; 106 SR-TK-054 and 059 are column-shifted in the CSV.
- `seed:sales-rep-tasks` can only build its fixture set between 05:00Z and 21:00Z (UTC-day offsets vs Europe/Moscow browser day); outside that window it refuses.
- Image requests to `starmarket-platform.demo.govirto.com` fail DNS (env content, not product).
- State mutated by cases was restored (layouts, Document library settings, language, carts, an order status, tasks). 089 SR-FE-036, 039 and 091 SR-CP-025 send real email/push broadcasts by design.
