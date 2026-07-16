# Test Case Lifecycle Report — TLC-2026-07-16-0223

## Summary
- **Input:** `VCST-5293` + `https://github.com/VirtoCommerce/vc-frontend/pull/2380`
- **Input Type:** change-source (JIRA story + linked PR)
- **Date:** 2026-07-16
- **Platform:** 3.1043.0 · **Theme:** 2.54.0-pr-2380 (this PR) · **Module:** `VirtoCommerce.SalesRep` pr-2 — deployed **only** on vcptcore-qa
- **Verdict:** **APPROVED WITH WARNINGS** (static gates PASS; live verification **deferred** — no browser MCP connected this session)

**Scope reconciliation.** The two references name **different sibling stories** of epic **VCST-5142 "Sales Rep Hub"**: **VCST-5293** = `[BE] Sales Rep Role - VC-Shell App` (backend, status *Testing*); **VCST-5469** = `[FE] Reorganize left rail + show My customers` (storefront, *Ready for test*) — the story PR #2380 actually implements. The **backend GraphQL** layer was already covered yesterday (`TLC-2026-07-15-1723` → suite `050m`, 35 cases). This run therefore owns the previously-**uncovered storefront UI/E2E layer**: a new suite **`089`** complementing `050m`, not duplicating it.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 2 sibling tickets reconciled; layer = storefront/FE; 1 new suite |
| 2. Sync | — | Skipped | Zero prior Frontend sales-rep coverage — nothing to sync |
| 3. Generate | test-management-specialist | Done | 29 cases across 11 sections |
| 4. Review & Fix | test-management-specialist | Done | `suites:review` PASS (0 Blocker/0 Critical); `validate-td-refs` 15/15 |
| 5. Verify | qa-testing-expert | **BLOCKED (env)** | No browser MCP server connected — 0 cases executed live |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Static gates PASS; G8 environment deferred |

## Change Inventory (PR #2380 @ 11b645c3 — VCST-5469 surface only)
The PR's raw file list is large because its base branch trails `dev`; the **genuine VCST-5469 surface** is:

| Area | Change |
|------|--------|
| `modules/sales-rep/pages/my-customers.vue` | New **My Customers** page (table, search, sort, paging, empty views, order link) |
| `modules/sales-rep/composables/useSalesRepCustomers.ts` | Store-scoped paged query (`PAGE_SIZE=10`, offset-cursor, name sort, page-clamp) |
| `modules/sales-rep/composables/useSalesRepCustomersCount.ts` | **New** unfiltered count-only query for the left-rail badge |
| `modules/sales-rep/api/graphql/queries/salesRepCustomers*` | `salesRepCustomers` + `salesRepCustomersCount` GraphQL docs |
| `modules/sales-rep/{index,routes,constants,menu,types}.ts` | Route `/company/my-customers` (rep-only guard→Dashboard); **"Sales Rep hub"** left-rail section (priority 5, `sales-rep:access`); My-customers links w/ badge |
| `modules/sales-rep/components/link-my-customers{,-mobile}.vue` | Badge link components (desktop + mobile) |
| `modules/sales-rep/locales/*.json` (13) + ui-kit/root locales | i18n keys `sales_rep.my_customers.*`, `sales_rep.hub.*` |
| `shared/account/components/account-navigation*.vue` + `core/composables/useNavigations.ts` | Left-rail widget-registry plumbing (additive) |

Gating: store setting **`SalesRep.Enabled`** (default false) toggles the **storefront UI only** (backend API stays gated by `sales-rep:access`).

**Merged-in from `dev`, NOT this story (excluded from scope):** VCST-4984 (vc-table extension), VCST-5070/5071 (BEM), VCST-5365 (loyalty-validation alert), VCST-4226 (red preset), VCST-5219 (preview language). Each has its own lifecycle.

## ⚠️ Material finding — JIRA description vs. shipped code mismatch
VCST-5469 states *"Standard widgets shall be modified: Purchasing removed, Marketing restructured (Coupons/promotions removed, Points history removed)."* **The code at PR #2380 does none of this** — `account-navigation.vue` renders Purchasing/Marketing/Corporate/User unchanged; the sales-rep module is **purely additive** (`registerAccountSection` for the new hub + a Corporate contact link for VCST-5409). No "Points history" entry even exists in the menu schema to remove. → Either the ticket text is stale/aspirational or the reorg ships in a separate task. Captured as regression guard **SR-FE-023** and flagged for PO/BA. **Recommend a JIRA comment (English) to clarify before sign-off.**

## Coverage Delta
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Frontend sales-rep suites | 0 | 1 (`089`) | +1 |
| Frontend sales-rep cases | 0 | 29 | +29 |
| Proposed BL-UI invariants | 0 | 10 (`PROPOSED-BL-SR-UI-*`) | +10 |

Complements `050m` (backend API) deliberately: 089 tests **rendering / UX / gating / client-side state**; it never re-tests the server-side data-permutation logic 050m owns. One bridge case (SR-FE-029) asserts UI-badge == API `totalCount`.

## New Cases Generated — `regression/suites/Frontend/sales-rep/089-sales-rep-my-customers-storefront.csv` (Draft)
29 cases · **5 Critical / 12 High / 10 Medium / 2 Low**. Sections: Gating, Table, Order Link, Search, Empty State, Sort, Paging, Hub Badge, Left Rail, Error Handling, Mobile, i18n. IDs SR-FE-001…029 (full list in `lifecycle-summary.json`).

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 29/29 rows, 15 cols, unique IDs, all `Draft` |
| G2 Determinism | PASS | Concrete element/attribute predicates after fixes |
| G3 Completeness | PASS | ≥2 assertions + ≥2 failure-signals per case (auto-fixed 20) |
| G4 Testability | PASS | Vague `[DOM]` predicates rewritten (11) |
| G5 Data Validity | PASS | `validate-td-refs` 15/15 resolve; **0 hardcoded IDs**; new aliases listed below |
| G6 Coverage (rec.) | PASS | 10 BL-UI invariants mapped/proposed |
| G7 Duplication (rec.) | PASS | Thin nav-only overlap accepted (distinct invariants); no cross-suite dup vs 050m |
| G8 Environment | **DEFERRED** | No browser MCP connected — 0 cases verified live |
| G9 Sync | N/A | New suite, no existing cases |

## Phase 5 — Live Verification: BLOCKED (harness, not env/product)
No Playwright / Chrome DevTools MCP server is connected in this session, so no storefront case could execute. Target hosts confirmed **live** (storefront/admin → HTTP 200). **Re-dispatch after connecting a browser server** (project rule: MCP changes require a restart). Preflight data captured for a zero-rework re-run:
- Rep login: `agent-test-sr-primary@example.com` (serves 4 orgs → **expected badge = 4**); password: no `SR_REP_PASSWORD`/`TEST_USER_PASSWORD` in env → fall back to seeder default `Password1!` then `Password1`.
- Non-rep buyer: `ORG_USER_EMAIL` (`agent-test-org-vcpt@test-agent.com`).
- **First check `SalesRep.Enabled` is ON** for the B2B store (else rep-authenticated cases BLOCK).

### Highest-value checks awaiting the re-run
1. **SR-FE-006 order-link/403** (Critical) — the PR author verified *manually only* that opening a customer's last order from My Customers loads without a **403** for a sales-rep session. Must be confirmed by QA.
2. **SR-FE-023 left-rail** — confirm on the live UI that Purchasing/Marketing are still present for the rep (the JIRA-vs-code mismatch above).
3. Verifiable-today subset (21): SR-FE-001,002,003,004,006–012,014,015,020,022,023,024,025,026,027,028,009.
4. **BLOCKED pending seed (8):** SR-FE-005,013,016,017,018,019,021,029 — need a zero-order org, a zero-customer rep, and a rep serving >10 orgs (this rep has 4).

## Remaining Items
### Must do before suite `089` executes green in CI
1. **Register `089`** in `config/test-suites.json` (block below) — recommend **env-scoped to `vcptcore`** (mirrors how `050m` is registered) so it stays out of the default vcst CI selections until seeded.
2. **Register storefront login creds** for the seeded reps in `scripts/lib/user-roles.mjs` (+ set `SR_REP_PASSWORD` in `.env.local`) — `050m` used API tokens; 089 needs real UI sign-in.
3. **Seed the 3 missing fixtures** for the 8 BLOCKED cases: a served org with **zero orders**, a rep with **zero customers** (`SR_REP_NOCUSTOMERS`), a rep serving **>10 orgs** (`SR_REP_PAGING`).
4. **Re-dispatch Phase 5** once a browser MCP is connected.

### Should do
5. **JIRA comment (English)** on VCST-5469 re: the left-rail-removal mismatch (§Material finding).
6. Promote the 10 `PROPOSED-BL-SR-UI-*` into `knowledge/oracles/business-logic.md` after lead sign-off.

## Files Modified
- **Added:** `regression/suites/Frontend/sales-rep/089-sales-rep-my-customers-storefront.csv` (29 cases, Draft)
- `config/test-suites.json` **not** modified (registration deferred — block below).

### Recommended `config/test-suites.json` registration (when seeded)
```json
{
  "id": "089",
  "name": "Sales Rep — My Customers (Storefront)",
  "file": "regression/suites/Frontend/sales-rep/089-sales-rep-my-customers-storefront.csv",
  "domain": "sales-rep", "layer": "frontend", "concern": "ui", "priority": "P1",
  "testCount": 29, "estimatedMinutes": 85, "agent": "qa-frontend-expert",
  "tags": ["storefront","sales-rep","b2b","account-nav","vcptcore-only"],
  "requiresModules": ["sales-rep"], "env": "vcptcore", "customerApplicability": "reference"
}
```

## Next Steps
- [ ] Connect a browser MCP server → re-run Phase 5 (start with SR-FE-006 403 + SR-FE-023 left-rail)
- [ ] Seed the 3 missing fixtures + register rep storefront creds → unblock 8 cases
- [ ] Register `089` (env-scoped) in the manifest
- [ ] Comment on VCST-5469 re: left-rail mismatch
