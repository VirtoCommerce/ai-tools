# Test Case Lifecycle Report — TLC-2026-04-23-1230

## Summary

| Field | Value |
|---|---|
| **Input** | `VCST-4710` (JIRA story — 4 linked PRs) |
| **Input Type** | change-source |
| **Date** | 2026-04-23 12:30 |
| **Verdict** | **APPROVED WITH WARNINGS** |
| **Platform** | `3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704` (PR #2987 deployed) |
| **Theme** | `vc-theme-b2b-vue-2.48.0-pr-2219-d5f9-d5f99481` (PR #2219 deployed) |
| **Key modules** | `VirtoCommerce.Customer 3.1007.0-alpha.976-vcst-4710` (PR #293) • `VirtoCommerce.ProfileExperienceApiModule 3.1005.0-pr-129-03f6` (PR #129) |

---

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | Input type: change-source. 8 suites mapped (6 primary + 2 secondary). Change inventory: 4 PRs, 2 backend modules + 1 frontend theme + 1 platform; all deployed |
| 2. Sync | test-management-specialist | Done | 87 cases scanned → 75 VALID / 5 STALE / 3 INCOMPLETE / 0 BROKEN / 4 NEW_NEEDED |
| 3. Analyze & Generate | test-management-specialist | Done | 52 scenarios considered; 30 generated (P0+P1 only), 22 deferred (P2/P3) |
| 4. Review & Fix | test-management-specialist | Done | 0 auto-fix needed; all 9 gates PASS except G6 (WARN: 2 BL gaps drafted as proposals) |
| 5. Verify | qa-testing-expert | Done | 6 VERIFIED / 3 CHANGED (defects confirmed) / 0 BROKEN / 0 BLOCKED. Browser fallback: firefox→edge→chrome |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 8/9 gates PASS, 1 WARN, 0 FAIL |

---

## Change Inventory

| Module / Component | Layer | PR | Version (deployed) | Breaking | Key additions |
|---|---|---|---|---|---|
| vc-platform | Platform Core | #2987 | 3.1023.0-pr-2987 | No (internal) | `TEntity: IEntity` relaxed generic constraint |
| vc-module-customer | Backend (customer) | #293 | 3.1007.0-alpha.976 | No | `IAddressService` + `IAddressSearchService`, facet aggregation, `Address : IEntity`, address domain events, favorite-ordering |
| vc-module-profile-experience-api | GraphQL xAPI | #129 | 3.1005.0-pr-129-03f6 | No | NEW queries `currentCustomerAddresses`, `currentOrganizationAddresses`, `checkDuplicateAddress`; populated `term_facets` |
| vc-frontend | Storefront | #2219 | 2.48.0-pr-2219-d5f9 | No | `useCustomerAddresses`, `useCurrentOrganizationAddresses` composables; `select-address-modal.vue` `paginationMode="server"`; deprecates legacy composables |

**Affected APIs:**
- NEW GraphQL: `currentCustomerAddresses(after, first, sort, countryCodes, regionIds, cities, keyword)` — confirmed in refreshed `graphql-schema.md`
- NEW GraphQL: `currentOrganizationAddresses(... same args)` — confirmed
- NEW GraphQL: `checkDuplicateAddress(memberId, address) → { isDuplicated }` — confirmed

**Affected pages:** `/cart` (shipping details), `/account/addresses`, `/account/company/info`

---

## Sync Results (Phase 2)

| Case ID | Suite | Classification | Action | Source |
|---------|-------|---------------|--------|--------|
| CHK-003 | 011-checkout-flow | STALE | Updated steps+assertions from legacy dropdown to new search/facet popup; Cross_Layer_Checks moved from `GET /account/addresses` to `currentCustomerAddresses` | VCST-4710 |
| CHK-035 | 013-checkout-b2b | STALE | Cross_Layer_Checks updated from legacy REST to `currentOrganizationAddresses` GraphQL | VCST-4710 |
| CHK-058 | 011-checkout-flow | INCOMPLETE | Added GraphQL cross-layer check for pre-selection (isFavorite default sort) | VCST-4710 |
| CHK-059 | 011-checkout-flow | STALE | Steps updated to open new popup modal; assertions added for 3-facet panel + search input presence | VCST-4710 |
| CHK-060 | 011-checkout-flow | STALE | Pagination pattern updated from client-side "Show more" to server-side cursor (`after`/`first`) | VCST-4710 |

**VALID (false-positive protection):** GQ-046, GQ-047 in 050d continue to test plain `contact.addresses[]` field access (get-all) — the legacy field still exists in the live schema and was not removed. No update applied.

All 5 updated cases carry `References: "Synced: VCST-4710 (2026-04-23)"` and `Automation_Status: synced`. Diffs saved in `phase-2-4-results.json`.

---

## Coverage Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Cases in scope | 87 | 117 | +30 |
| P0 (Critical) cases | — | 9 new | +9 |
| P1 (High) cases | — | 21 new | +21 |
| BL/ECL coverage on new cases | N/A | 28 of 30 (93%) | — |
| Sync freshness | stale | current | ✓ |

---

## New Cases Generated (30)

### Storefront — `tests/Sprint-current/VCST-4710/test-cases/VCST-4710-storefront.csv` (20 cases)

| ID | Title | Priority | Covers |
|---|---|---|---|
| SF-001 | Keyword search — happy path filters list | Critical | AC-2a |
| SF-002 | Keyword search — case-insensitive match | High | AC-2b |
| SF-003 | Country facet selection filters list | Critical | AC-3b |
| SF-004 | Country multi-select | High | AC-3c |
| SF-005 | State/Province facet selection | High | AC-4b |
| **SF-006** | **City facet values are city names, NOT postal codes** (Defect #2) | **Critical** | AC-5a |
| SF-007 | All 3 facets combined | High | AC-3+4+5 |
| **SF-008** | **Column headers wired, aria-sort transitions** (Defect #1) | **Critical** | AC-1a/1h |
| SF-009 | Default sort — B2C personal account (lastName asc) | High | AC-1f |
| SF-010 | Default sort — B2B org account (isFavorite desc) | High | AC-1g |
| SF-011 | Empty state — no addresses saved | High | AC-6a |
| SF-012 | Empty state — filter produces no results | High | AC-6b |
| **SF-013** | **Search input aria-label references address context** (Defect #3) | **High** | AC-10c |
| **SF-014** | **Mobile 375px — all 3 facets accessible, no clip** (Defect #4) | **High** | AC-9a |
| SF-015 | Mobile card layout renders | High | AC-9b |
| SF-016 | Search + facet combination | High | AC-2c |
| SF-017 | Keyboard navigation tab order | High | AC-10b |
| SF-018 | Focus management on open/close | High | AC-10e |
| SF-019 | Backward compat — `addresses.vue` page works | Critical | AC-12a |
| SF-020 | useCheckout assigns shipping address correctly | Critical | AC-12c |

### GraphQL — `tests/Sprint-current/VCST-4710/test-cases/VCST-4710-graphql.csv` (8 cases)

| ID | Title | Priority | Covers |
|---|---|---|---|
| GQ-001 | currentCustomerAddresses happy-path returns `items` + `term_facets` | Critical | AC-2a / API contract |
| GQ-002 | currentCustomerAddresses with keyword arg filters results | Critical | AC-2a server-side |
| GQ-003 | currentCustomerAddresses with countryCodes/regionIds/cities facet args | Critical | AC-3..5 server-side |
| GQ-004 | currentCustomerAddresses sort arg honored | High | AC-1 server-side |
| GQ-005 | currentOrganizationAddresses returns org scope (not personal) | Critical | AC-12 scope |
| GQ-006 | Auth — 401 without bearer token | High | AC-10 security |
| GQ-007 | Auth — 403 querying different org | High | AC-12 security scope |
| GQ-008 | checkDuplicateAddress returns `isDuplicated: true/false` | High | AC-13 |

### Admin/REST — `tests/Sprint-current/VCST-4710/test-cases/VCST-4710-admin.csv` (2 cases)

| ID | Title | Priority | Covers |
|---|---|---|---|
| ADM-001 | `/api/contacts/search` regression after PR #293 | High | generic CRUD constraint change (PR #2987) |
| ADM-002 | Address CRUD via admin UI — backward compat | High | PR #293 Address-as-IEntity migration |

---

## Environment Verification (Phase 5)

| Target | Case | Result | Details |
|---|---|---|---|
| Popup reachability | — | **VERIFIED** | New 3-facet popup opens from `data-test-id="select-address-button"` on /cart |
| City facet values | SF-006 | **VERIFIED (likely PASS)** | Elena's Croatia/Canada addresses show city names ("Dubrovnik", "ewfwe"). **⚠ Needs re-check on Emily Johnson's US address (10001/New York)** before confirming defect #2 is fixed |
| Column sort wired | SF-008 | **CHANGED — defect #1 CONFIRMED** | All 4 `<th>` have `cursor: auto`, `aria-sort="none"`, no click handler |
| Search aria-label | SF-013 | **CHANGED — defect #3 CONFIRMED** | `aria-label="Search pickup locations"` still deployed |
| Mobile CITY clip | SF-014 | **CHANGED — defect #4 CONFIRMED** | CITY button clipped on right edge at 375×667 |
| Keyword search | SF-001 | **VERIFIED** | `"Old"` → list filtered 2→1 |
| Country facet | SF-003 | **VERIFIED** | Multi-select checkboxes + count badges live |
| GraphQL schema | GQ-001 | **VERIFIED** | `currentCustomerAddresses`, `currentOrganizationAddresses`, `checkDuplicateAddress` all confirmed via live introspection |
| STALE case CHK-059 | — | **VERIFIED** | All 4 `data-test-id` attributes (`filter-country/region/city`, `search-keyword-input`) present in DOM |

**Browser deviation:** `playwright-firefox` and `playwright-edge` both crashed with closed-context errors; Phase 5 fell back to `playwright-chrome`. Not blocking. (Possibly related to memory note: Firefox requires `locale: en-US` — worth re-checking MCP config.)

**Console baseline on /cart:** 4 external-CDN 404s (jewelry + auto images) — pre-existing, not related to VCST-4710. 0 application JS errors during flow.

**Evidence:** `tests/Sprint-current/VCST-4710/evidence/phase5-verify/` (5 screenshots) + `tests/Sprint-current/VCST-4710/evidence/ui-flows/` (16 BA-pipeline screenshots).

---

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | **PASS** | 0 Blocker findings across all 30 new + 8 updated cases |
| G2 Determinism | **PASS** | 0 Critical findings; step tags, data-test-ids, explicit DOM refs |
| G3 Completeness | **PASS** | 0 High findings; preconditions, assertions, failure signals, cleanup all populated |
| G4 Testability | **PASS** | 0 Critical; all assertions falsifiable |
| G5 Data Validity | **PASS** | 0 Critical/Blocker; `{{VAR}}` tokens used; DV-006..DV-011 GraphQL checks pass |
| G6 BL/ECL Coverage | **WARN** | 28/30 (93%) mapped. 2 gaps: SF-006 and SF-008 have no existing `BL-*` invariant. **2 BL proposals drafted** (see `bl-proposals.md`) |
| G7 Duplication | **PASS** | No same-layer duplicates. Dedupe cross-checked against 011/013/028/050d/026 |
| G8 Environment | **PASS (with caveat)** | 0 BROKEN. 3 CHANGED are **defects confirmed still in deployed build**, not test-case problems — these are input to bug filing, not fix-in-tests |
| G9 Sync | **PASS** | 5 STALE + 3 INCOMPLETE updated with diffs; 0 BROKEN encountered |

**Overall verdict:** **APPROVED WITH WARNINGS**
- All required gates pass
- G6 WARN is informational only — BL-proposal flow is designed to capture new invariants; not a blocker for regression
- G8 CHANGED items are **feature defects**, not test artefacts — they must be filed as bugs but do not block approval of the test-case set

---

## Must Fix (before running regression on new cases)

| # | Issue | Who | Action |
|---|---|---|---|
| 1 | **OQ-5 (seed data)** — TechFlow org has only 1 address; cannot run SF-004/007/009/010/012, GQ-003/004/005 | QA / DevOps | Seed a test org with ≥20 addresses across ≥3 countries / ≥5 states / ≥10 cities |
| 2 | **OQ-2 (defect #2 scope)** — confirm whether City-facet-vs-postal fix is in-scope for VCST-4710 or a separate ticket. SF-006 Phase-5 check on Elena's EU data shows city names; Emily's US/10001 data needed to confirm conclusively | BA / Dev | Login as Emily Johnson / TechFlow → open popup → inspect CITY dropdown |
| 3 | **Defects #1, #3, #4 confirmed still deployed** — file as 3 linked sub-bugs on VCST-4710 | QA | 3 JIRA Bug tickets: (a) column headers not interactive; (b) aria-label wrong; (c) mobile CITY clip |

## Should Fix (improves quality, not blocking)

| # | Issue | Who | Action |
|---|---|---|---|
| 1 | Review `bl-proposals.md` and fold approved invariants into `business-logic.md` | BA / Dev | 2 new BL proposals: human-readable facet labels + aria-sort implementation requirement |
| 2 | Firefox/Edge MCP browsers crashed during Phase 5 | Infra | Check Firefox config for `locale: "en-US"` per memory `feedback_playwright_locale.md` |
| 3 | Confirm storefront `/graphql` vs admin `{{BACK_URL}}/ui/graphiql` — GQ test cases use admin GraphiQL UI as execution harness; live storefront traffic uses `{FRONT_URL}/graphql` | BA / QA | Add a note to GQ preconditions clarifying which endpoint executes the queries in production vs. how tests exercise them |
| 4 | 22 deferred scenarios (P2/P3) — full sort matrix (SORT-001..007 blocked by defect #1 fix), PERF-001/002 (blocked by OQ-5 seed), PRESEL-001 (blocked by OQ-10), SEARCH-009 Enter-key (blocked by OQ-3) | QA | Generate on follow-up run once blockers clear |

---

## Files Modified

### Created
- `tests/Sprint-current/VCST-4710/test-cases/VCST-4710-storefront.csv` (20 cases)
- `tests/Sprint-current/VCST-4710/test-cases/VCST-4710-graphql.csv` (8 cases)
- `tests/Sprint-current/VCST-4710/test-cases/VCST-4710-admin.csv` (2 cases)
- `reports/test-lifecycle/TLC-2026-04-23-1230/phase-2-4-results.json`
- `reports/test-lifecycle/TLC-2026-04-23-1230/lifecycle-report.md` (this file)
- `reports/test-lifecycle/TLC-2026-04-23-1230/lifecycle-summary.json`
- `reports/test-lifecycle/TLC-2026-04-23-1230/bl-proposals.md`

### Evidence added
- `tests/Sprint-current/VCST-4710/evidence/phase5-verify/` — 5 screenshots

### Sync updates (diffs recorded in phase-2-4-results.json; write-back to production CSVs pending approver sign-off)
- `regression/suites/Frontend/checkout/011-checkout-flow.csv` — CHK-003, CHK-058, CHK-059, CHK-060
- `regression/suites/Frontend/checkout/013-checkout-b2b.csv` — CHK-035

---

## Business Logic Proposals

2 new BL invariants drafted — see `bl-proposals.md`. Drafts only, NOT applied to `business-logic.md`:

- **PROPOSED-BL-CHK-014** `[P1-data]` — Facet labels in selection popups must be human-readable (city names), not raw code values (postal codes). Source: VCST-4710 Defect #2 / BA report.
- **PROPOSED-BL-CHK-015** `[P0-revenue]` — When a column header declares `aria-sort`, sort behavior must be implemented (click toggles ascending/descending). Source: VCST-4710 Defect #1 / BA report.

---

## Next Steps

1. **Seed 20+ addresses** in an org test account (resolves OQ-5; unblocks 7 scenarios)
2. **File 3 bug tickets** for defects #1, #3, #4 (linked to VCST-4710, marked BLOCKS on regression)
3. **Re-verify defect #2** on Emily Johnson account with US addresses (10001/New York)
4. **Review and apply BL proposals** (optional, 2 new invariants + clarify the 2 G6 gaps)
5. **Run regression** once seed data available: `/qa-regression suite 011,013,050d + tests/Sprint-current/VCST-4710/test-cases/*` or fold VCST-4710-*.csv into 011/013/050d after sign-off
6. **Fix Firefox MCP locale** if the crash recurs
7. **Sign off VCST-4710** once defects #1/#3/#4 close, defect #2 confirmed, and blockers cleared
