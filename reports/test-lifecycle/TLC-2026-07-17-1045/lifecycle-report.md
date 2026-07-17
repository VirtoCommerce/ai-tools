# Test Case Lifecycle Report — TLC-2026-07-17-1045

## Summary
- **Input:** `module https://github.com/VirtoCommerce/vc-module-sales-rep` (module-level)
- **Input Type:** change-source (module deploy change)
- **Date:** 2026-07-17 10:45
- **Env:** **vcst-qa** (`vcst-qa.govirto.com`) — module now deployed here (previously vcptcore-only)
- **Build:** Platform `3.1044.0` · SalesRep module `3.1000.0-pr-2-8c40` · theme `vc-theme-b2b-vue 2.54.0-pr-2380-e719` · XOrder 3.1007.0 / Customer 3.1014.0 / Xapi 3.1013.0
- **Verdict:** **APPROVED WITH WARNINGS** for 050m/089/090 (+ new SR-CP-021). **091 (Customer Profile) BLOCKED** — profile route absent on the deployed theme (deploy/version gap, not a defect).

## Scope
Module-level: all 4 sales-rep suites. Review/gap depth focused on the two suites merged in PR #123 **without prior review** — 090 (My Sales Reps) & 091 (Customer Profile). Light re-check on 050m/089 (synced 8h ago in TLC-2026-07-17-0437).

| Suite | Cases | Surface | Phase 5 |
|-------|------|---------|---------|
| 050m | 39 | scoped GraphQL `/graphql/sales-rep` | Money shape VERIFIED; attribution BLOCKED (no data) |
| 089 | 29 | storefront My Customers (rep) | **VERIFIED** |
| 090 | 20 | storefront My Sales Reps (buyer) | **VERIFIED** |
| 091 | 21 (+1) | storefront Customer Profile (rep) | **BLOCKED** (route 404 on pr-2380) |

## Phase Results
| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 4 suites; module moved vcptcore→also vcst-qa; env pins removed; vcst-qa seeded |
| 2. Sync | test-management-specialist | Done | 44 cases de-vcptcore-pinned (env-agnostic); dangling memory citation removed |
| 3. Analyze & Generate | test-management-specialist | Done | +1 case (SR-CP-021 per-org-locked no-leak); 5 gaps fixture-blocked |
| 4. Review & Fix | test-management-specialist | Done | Data Validity 100%; 2 Medium coverage gaps (both fixture-blocked) |
| 5. Verify | qa-testing-expert | Partial | 089+090 VERIFIED; 091 BLOCKED; Money shape CONFIRMED; attribution BLOCKED |
| 6. Approve | orchestrator | **APPROVED w/ WARNINGS** | 8/9 gates PASS; G8 partial |

## Key Findings
1. **090 (buyer) VERIFIED** — as ACME_BUYER, `/company/sales-reps` shows exactly the 2 active B2B-store reps serving ACME (Ava Adams, Priya Rao); Tess Flow (cross-org), Blake Barr (blocked), Lena Park (locked) correctly excluded. Guest → redirect to `/sign-in`.
2. **089 (rep) VERIFIED** — My Customers list renders the 4 served orgs.
3. **Open Q — gating rule (grounded live):** the "Sales reps" link is gated by **organization membership** (the account-sidebar "Corporate" section), NOT a special permission — both a rep and a plain Purchasing Agent see it; a personal/non-corporate user has no Corporate section. (`PROPOSED-BL-SR-UI-GATE` should say "org membership".)
4. **Open Q — nested Money `total` CONFIRMED** — `total` is `MoneyType!` on both `salesRepOrders` and `salesRepCustomers.lastOrder`; a flat scalar select is rejected, nested `{amount,formattedAmount,currency{code,symbol}}` validates (200, no errors). Schema also confirms `SalesRepOrder` has **no `customerName`** field (use `organizationName`) — the 050m cases already select `organizationName`.
5. **⚠️ 091 Customer Profile — BLOCKED (deploy/version gap).** `/company/my-customers/{orgId}` returns the SPA 404 on the deployed theme **pr-2380**, and the in-app row click is a no-op — the profile route is not registered in that theme build. The feature was confirmed on theme **pr-2383**; pr-2380 is deployed. **All SR-CP-* (incl. new SR-CP-021) are Draft/blocked until pr-2383+ deploys.** Not a product bug and not a test defect — recorded as a deploy-blocker note in SR-CP-001. No ticket filed.
6. **⚠️ Order-attribution data gap.** `salesRepOrders` totalCount=**0** and every `salesRepCustomers.lastOrder`=**null**, despite the seeder creating ACME orders — so the storefront shows "My last order = —" and no order-level assertion (rep-attribution SR-GQL-011, order rows/totals in 091, 089 last-order) can be value-verified. Needs investigation: seed doesn't attribute orders to the rep in the way `salesRepOrders` expects, **or** the query attributes differently than assumed. Value-level order coverage stays blocked until resolved.
7. **Admin embedded-app characterized (no suite exists).** `/#!/workspace/embedded-app/vc-sales-rep` (vc-shell micro-frontend) loads clean. Tabs: Dashboard · Sales Reps (list) · Blocked · Not-assigned Reps · Organizations · Not-assigned Orgs. **Rep-detail blade is where a rep↔org assignment is made** ("Served organizations" multi-select) — the admin action that drives storefront My Customers + buyer Sales-Reps; Block = the buyer-list exclusion. → author `Backend/sales-rep/092-*` (scenarios below).
8. **Cosmetic:** reps have no seeded phone → 090 Phone column blank.

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 15-col CSV; rows 050m=39, 089=29, 090=20, 091=21 |
| G2 Determinism | PASS | Only pre-existing suite-wide GraphiQL-UI conventions fire |
| G3 Completeness | PASS | Preconditions/assertions/failure-signals present |
| G4 Testability | PASS | Falsifiable assertions |
| G5 Data Validity | PASS | `@td()` 129/129 (050m) + 15/15 (089) + 23/23 (090) + 43/43 (091); 0 hardcoded GUIDs |
| G6 Coverage | PASS (rec) | PROPOSED-BL-SR-* refs on all cases |
| G7 Duplication | PASS (rec) | No same-layer dupes |
| G8 Environment | **PARTIAL** | 089+090 VERIFIED; Money shape CONFIRMED; **091 BLOCKED (theme)**; order-attribution BLOCKED (seed) |
| G9 Sync | PASS | All env-pins removed; module-suite-map gap closed |

## Files Modified
- `config/test-suites.json` — removed `vcptcore` env pins (all 4 suites) + `vcptcore-only` tag (050m); 091 testCount 20→21
- `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` — 39 rows de-vcptcore-pinned (env-agnostic)
- `regression/suites/Frontend/sales-rep/090-…csv` — de-pinned; removed dangling memory citation
- `regression/suites/Frontend/sales-rep/091-…csv` — de-pinned; **+SR-CP-021** (per-org-locked profile no-leak); deploy-blocker note in SR-CP-001
- `.claude/knowledge/execution/module-suite-map.md` — added the missing **Sales Rep** entry (module map, `sales-rep` selection group, dependency, impact-analysis)
- `test-data/aliases.vcst.json` — seed overlay (runtime GUIDs) — **UNCOMMITTED (local-only)**
- `.env.local` — `B2B_USER_PASSWORD` corrected (gitignored; not committed)

## Cases remain `Draft`
089/090 are live-verified and could be promoted; 091 + the order-level assertions stay Draft pending the theme deploy + attribution fix. Left all Draft for one consistent promotion pass once 091 unblocks.

## Portability / reproducibility (raised this session)
- Seeded runtime GUIDs live only in the **uncommitted** `aliases.vcst.json` — commit the overlay (branch off `main`) so teammates/CI can resolve fixtures.
- **Both** logins are `.env.local` secrets (values never committed): rep = `TEST_USER_PASSWORD`, buyer (`ACME_BUYER`) = `B2B_USER_PASSWORD` (distinct vars — the rep and buyer do NOT share a password). Headless/CI + teammates need both in the **CI secret + team vault** (not committable).

## Next Steps
- [ ] Commit `aliases.vcst.json` overlay + this run's suite/config/knowledge edits (branch off `main`)
- [ ] Provision `TEST_USER_PASSWORD` + `B2B_USER_PASSWORD` in CI/GitHub-Actions secret + team vault
- [ ] Investigate order-attribution: seeded ACME orders not surfaced by `salesRepOrders` (seed vs product)
- [ ] Re-verify all SR-CP-* (091) once theme `2.54.0-pr-2383+` deploys on vcst-qa; then promote
- [ ] Author `Backend/sales-rep/092-*` admin embedded-app suite (see scenarios)
- [ ] (Minor) seed rep phone numbers for 090 Phone-column coverage

## Proposed `092-*` admin embedded-app scenarios
- **P0:** create rep (email/password/role/served-orgs → Save) → appears in list + storefront reflects; assign/unassign served orgs → buyer Sales-Reps list + rep My-Customers count update; block/unblock → excluded from buyer list + Blocked tab; required-field validation (Save disabled w/o Sales Rep role); email-login required/unique.
- **P1:** Not-assigned Reps / Not-assigned Orgs tabs; Organizations-side assignment; search by name/email; pagination (Paul Page = 12 orgs); delete rep; blank password keeps current; profile persistence (phones/emails/addresses/locale); Blocked-column icon semantics.
