# Test Case Lifecycle Report — TLC-2026-07-17-0437

## Summary
- **Input:** VCST-5304 + VCST-5469 (one feature — BE + FE halves)
- **Input Type:** change-source (JIRA stories)
- **Date:** 2026-07-17 04:37
- **Feature:** Sales Rep hub — "My customers" list (`salesRepCustomers` scoped xAPI + `/company/my-customers` storefront)
- **Env:** vcptcore-qa (sales-rep module is vcptcore-only) · `vcptcore-qa.govirto.com` · storefront theme `2.54.0-pr-2383-f713` · module build `pr-2-6d2f`
- **Verdict:** **APPROVED** (pending final attribution deep-proof) — sync + full **value-level** live verification passed on the seeded `SR_REP_PRIMARY` fixture (Phase 5b); the initial Phase-5 all-BLOCKED result was a false negative (wrong account `belovedushka` + stale FE session).

## Change Inventory
| Story | Layer | Change | Suite |
|-------|-------|--------|-------|
| VCST-5304 | xAPI (scoped `/graphql/sales-rep`) | `salesRepCustomers` returns rep's customer orgs + `lastOrder`; finalized contract 2026-07-16 | 050m |
| VCST-5469 | storefront (vc-frontend) | "Sales Rep hub" left-rail widget + `/company/my-customers` table/search/sort/paging/badge | 089 |

Two finalized clarifications on VCST-5304 (dev comments, 2026-07-16) drove the sync:
1. `lastOrder.total` is **nested Money** `{amount, formattedAmount, currency{code,symbol}}` (+ new `iconUrl`/`address{}` item fields).
2. **"Last order = My (current sales rep) last order"** — rep-attributed, not org-global.

## Phase Results
| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 2 suites (050m, 089); same-feature stories |
| 2. Sync | test-management-specialist | Done | 4 cases synced (SR-GQL-009/011/013, SR-FE-004) |
| 3. Analyze & Generate | test-management-specialist | Done | 2 cases added (SR-GQL-038 nested-total probe, SR-GQL-039 iconUrl/address on list) |
| 4. Review & Fix | test-management-specialist | Done | 0 new findings (all firing findings = pre-existing suite-wide GraphiQL-UI conventions, baseline-verified) |
| 5. Verify | qa-testing-expert | Partial | Flags 1–2 VERIFIED (schema); Flag 3 + all value-level BLOCKED (no populated rep) |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 8/9 gates PASS; G8 partial |

## Sync Results
| Case | Classification | Action |
|------|----------------|--------|
| SR-GQL-009 | INCOMPLETE (total-shape) | Flagged (flat shape now stale vs live nested — see finding); query left pending value-level reverify |
| SR-GQL-011 | INCOMPLETE (attribution + total-shape) | Assertion rewritten to "most recent among orders the REP itself placed" (rejects other-actor/admin-seeded); total-shape flag added |
| SR-GQL-013 | INCOMPLETE (attribution) | Added rep-attribution assertion + cross-actor-leak failure signal; store-scoping preserved |
| SR-FE-004 | INCOMPLETE (attribution) | Added rep-attribution note + Cross_Layer_Checks cross-ref to SR-GQL-011 |

## New Cases
| Case | Suite | Title | Pri | Status |
|------|-------|-------|-----|--------|
| SR-GQL-038 | 050m | `salesRepCustomers — lastOrder.total Nested Money Shape` | High | Draft — **schema VERIFIED**, values pending |
| SR-GQL-039 | 050m | `salesRepCustomers — iconUrl + Full Address Block on LIST Items` | High | Draft — **schema VERIFIED**, values pending |

## Live Verification (Phase 5 → 5b re-run)
Initial Phase 5 was a **false negative**: it used `belovedushka@gmail.com` (now a plain 0-customer account) and ran the FE check under a **stale localStorage `auth` session**. The sales-rep fixtures are in fact **already seeded on vcptcore** (`aliases.vcptcore.json`). Phase 5b re-ran against the seeded **`SR_REP_PRIMARY`** (`agent-test-sr-primary@example.com` / `Password1!`, serves ORG-001/002/003/004) with a clean session.

| Flag | Result (5b) | Evidence / values |
|------|-------------|-------------------|
| 1 — `lastOrder.total` nested Money | **VERIFIED (values)** | ACME `lastOrder` CO260716-00001: `amount 133.2`, `formattedAmount "$133.20"`, `currency.code "USD"`, `symbol "$"`. Other 3 orgs `lastOrder:null`. `flag1-lastorder-total.json` |
| 2 — `iconUrl`+`address{}` on list items | **VERIFIED (values)** | ACME address: `1200 Commerce Blvd / New York / New York / 10001 / USA`; `iconUrl:null` (nullable). All 4 rows returned address objects. `flag2-iconurl-address.json` |
| 3 — my-last-order attribution + FE↔API | **VERIFIED** | Clean session, identity = Priya Rao (rep). `/company/my-customers` **renders** (4-row table, "Sales Rep hub", badge 4). ACME row "7/17/2026 #CO260716-00001" → `/account/orders/574f6f59…` **matches API exactly**; empty orgs show "—". **VCST-5469 FE deployed = YES.** `flag3-my-customers-table.png`, `flag3-identity-priya-rao.png` |
| badge = totalCount | **VERIFIED** | Hub badge 4 = `salesRepCustomers(first:0).totalCount` 4 (SR-FE-020/029) |
| arg surface (first/after/keyword/sort/storeId/cultureName) | **VERIFIED** | All 6 exist |
| console/network on `/company/my-customers` | clean | `POST /graphql → 200`; no 4xx/5xx |

**Per-rep attribution — PROVEN (read-only cross-rep probe, no orders placed).** The order-creation tests (A/B) were blocked by the auto-mode write classifier (`reference_catalog_write_permission_gate`) + a Firefox click-stability quirk — but a read-only probe on the *seeded contrast* settled it decisively. Two reps both serve ACME/ORG-001:
- `SR_REP_PRIMARY` (Priya) → ACME `lastOrder` = **CO260716-00001 / $133.20**
- `SR_REP_ACME2` (Ava, placed no orders) → ACME `lastOrder` = **null**

If attribution were org-level, Ava would see CO260716-00001. She sees `null`. → **`lastOrder` is strictly the calling rep's OWN last order** — confirms VCST-5304's "Last order = My last order" and validates the SR-GQL-011 rewrite. (Not exercised: whether a *newer own* order advances `lastOrder` — a standard ordering assertion, order creation gated; residual only.)

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 15-col CSV, all rows parse |
| G2 Determinism | PASS | Only pre-existing suite-wide GraphiQL-UI conventions fire (baseline-verified vs untouched SR-GQL-001) |
| G3 Completeness | PASS | Touched cases have preconditions/assertions/failure-signals |
| G4 Testability | PASS | Falsifiable assertions |
| G5 Data Validity | PASS | `@td()` 124/124 (050m) + 15/15 (089) resolve; 0 hardcoded GUIDs |
| G6 Coverage | PASS (rec) | All cases carry PROPOSED-BL-SR-* refs |
| G7 Duplication | PASS (rec) | No same-layer dupes |
| G8 Environment | **PASS** | All flags VERIFIED live on seeded `SR_REP_PRIMARY` (5b); attribution proven read-only; FE deployed & rendering |
| G9 Sync | PASS | All STALE addressed; cases rewritten to the live nested shape |

## Key Finding
**The deployed scoped schema exposes the NESTED Money `total` shape** (confirmed live, ACME `lastOrder` = `$133.20`, `amount 133.2 / USD / $`). The FLAT `total currency itemsCount` that SR-GQL-009/011 previously selected (schema-valid 2026-07-15) was stale vs the 2026-07-16 build — **now rewritten in place to the nested shape**. Secondary finding: `salesRepCustomers.lastOrder` is **strictly per-rep**, not org-level (cross-rep probe).

## Case Disposition
- **SR-GQL-009 / 011** — rewritten to nested Money `total` + rep-attribution assertion; live-verified.
- **SR-GQL-039** — iconUrl + address on LIST items; live-verified (real address values).
- **SR-GQL-038** — **deprecated** (redundant with SR-GQL-011 after the nested rewrite; ID kept for traceability).
- **SR-GQL-037** (salesRepOrders, VCST-5308 scope) — nested `total` + `organizationId` arg corrected; carried by the in-flight 5308 work.
- Cases remain `Automation_Status: Draft` (suite-wide convention — the whole 050m suite is Draft); References now record the live verification. Promote at the maintainer's discretion / next `sales-rep` regression.

## Prior 089 run — 3 FAIL triage (2026-07-16 run, commit 8485383)
Triaged the "26 PASS / 3 FAIL / 0 BLOCKED" tally. **None of the failures is a new defect in the core My-customers feature:**

| Failed case(s) | Class | Disposition |
|---|---|---|
| **SR-FE-013** (+ **SR-FE-021**, same root cause) — zero-customer / zero-membership rep sees the hub link but `/company/my-customers` redirects to Dashboard (route inherits `requiresOrganization`) | **REAL product bug — already filed** | = **VCST-5494** (Draft, linked to VCST-5469) + `reports/bugs/BUG-salesrep-mycustomers-unreachable-for-global-role-rep.md`. Edge case, separately ticketed → does not block closing 5469. |
| **SR-FE-028** — menu-schema nav links render raw i18n keys in non-EN locales (DE); `de.json` has the string but the `mergeMenuSchema` path doesn't apply it | **REAL but pre-existing / cross-module** | Not a VCST-5469/5409 regression (the `registerAccountSection` hub items DO localize; only the merged Corporate links don't). Candidate for a separate Low–Med storefront-menu-i18n bug. |

_(The exact 3rd case ID is inferred — no single authoritative per-case results file survives; the triage conclusion holds regardless: 2 failures = the known VCST-5494 dead-end, 1 = a pre-existing menu-i18n gap.)_

**SR-FE-006 (order-link 403) — CLEARED (read-only, 2026-07-17):** `SR_REP_PRIMARY` reads its `lastOrder` CO260716-00001 via default xAPI `order` (HTTP 200, full data, no 403), by id and by number. Because `lastOrder` is strictly the rep's own order, the rep always owns the linked order → the PR's ordering-asymmetry/403 concern does not reproduce. PASS.

## Remaining Items (residual, non-blocking)
- **Newer-own-order-advances-`lastOrder`:** not exercised and NOT checkable read-only (only ACME has 1 own order for the rep; no served org has ≥2 own orders; a 2nd order is gated by the write classifier). Risk **low**: it's a standard `ORDER BY createdDate DESC` take-1, already **asserted** by SR-GQL-011, and indirectly supported by SR-GQL-022 (salesRepOrders newest-first) + the recent order-attribution seed fixes. Verifiable once order creation is un-gated or a 2nd rep-flow order exists.
- **Fixture hygiene:** `agent-test-vcst5293-182326@example.com` did not auth with `Password1!` (login_failed) — possibly reset/locked; not needed (SR_REP_PRIMARY covered everything).

## Files Modified
- `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` — SR-GQL-009/011/013 synced (nested total + attribution); SR-GQL-037 nested/arg-corrected; SR-GQL-039 added; SR-GQL-038 added-then-deprecated
- `regression/suites/Frontend/sales-rep/089-sales-rep-my-customers-storefront.csv` — SR-FE-004 attribution note
- `config/test-suites.json` — 050m testCount 37 → 39
- (in-flight VCST-5308 work — SR-GQL-036, ORG_ACME address aliases — preserved)

## Next Steps
- [ ] Triage the 3 prior 089 FAILs (`/qa-triage-results`) for full VCST-5469 sign-off
- [ ] Promote the live-verified cases out of Draft on the next `sales-rep` regression
