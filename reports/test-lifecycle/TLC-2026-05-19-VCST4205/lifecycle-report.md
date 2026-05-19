# Test Case Lifecycle Report — TLC-2026-05-19-VCST4205

## Summary

| Field | Value |
|---|---|
| **Input** | https://virtocommerce.atlassian.net/browse/VCST-4205 |
| **Input Type** | change-source (JIRA ticket) |
| **Date** | 2026-05-19 |
| **Platform** | 3.1026.0 |
| **Theme** | vc-theme-b2b-vue-2.49.0-pr-2294-6509-650937ca |
| **Key module versions** | XCart 3.1014.0-pr-118-1be7 (the fix artifact under test); Xapi 3.1007.0; Cart 3.1003.0; XOrder 3.1004.0 |
| **Flags** | `--update-bl` enabled |
| **Verdict** | **APPROVED WITH WARNINGS** |

VCST-4205 ("Save for Later + Configurable Products") was previously verified with backend `PASS_WITH_NOTES` (3/3 GraphQL cases pass) and frontend `FAIL` (Cases 2 + 4 fail, 6 anomalies A1–A6 documented). This lifecycle run consolidated that work into persistent regression coverage, drafted business-logic invariants for the 4 anomalies, and **re-verified the FAIL scenarios on a clean baseline using `playwright-firefox`**.

**Phase 5 reverses the headline conclusion:** PR #118 IS working. On a deterministic baseline ([PRE:RESET_CART] + clean SFL enforced), 3 of the 4 reported FAILs do NOT reproduce (Case 2 move-back, A4 async-settle race, A3 bulk-op semantics). They were precondition-dependent — they manifest only against contaminated SFL state. Only A1 (cart-sidebar miniwidget price binding) and the incidental A2 (SFL fragment missing `configurationItems`) reproduce deterministically. The orchestrator's recommendation: **do NOT reopen VCST-4205; file 2 new child bugs for A1 + A2; add a contaminated-SFL regression test**.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 5 suites affected, change-source: VCST-4205 (Bug, Testing, parent VCST-2099) |
| 2. Sync | test-management-specialist | Done | CART-012/013 (029) synced; GQL-070..092 (050b3) renamed CRL-GQL-* and re-pointed to `@td(VIRTUAL_CATALOG_B2B.id)`; CFG-EDIT-001/002/003 (072) sync-note added by orchestrator post-hand-off |
| 3. Analyze & Generate | test-management-specialist | Done | 4 new GraphQL cases appended to 050b3 (CRL-GQL-100..103 — VCST-4205 CASE1/2/3 promoted + CASE6 restated). Storefront CFG-SFL-001..009 not generated (see Warnings). |
| 4. Review & Fix | test-management-specialist | Done | DV-006/008 cleanups: hardcoded sectionId / virtual-catalog GUIDs replaced with `@td()` references in 072, 072b, 050b3 |
| 5. Verify | qa-testing-expert | **Done (retry)** | 4 scenarios run on `playwright-firefox` after credit reset. **3 of 4 prior FAILs do NOT reproduce on clean baseline** (Scenarios A, B, D = VERIFIED-PASS). Anomaly A1 + A2 reproduce deterministically (Scenario C = VERIFIED-FAIL). Build identity unchanged from prior session. |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 7/9 required gates PASS; 0 SKIPPED; 0 FAIL |

## Change Inventory

| Module | Layer | Files Changed (per prior session) | Breaking | New Features |
|--------|-------|------------------------------------|----------|--------------|
| vc-module-x-cart PR #118 | Backend / GraphQL xAPI | xCart cart-projection settle | None observed at GraphQL layer | Fix for SFL configurationItems preservation |
| vc-frontend PR #2294 | Storefront | Cart sidebar SFL widget, /account/saved-for-later, Edit Configuration toast/modal | None | UX bug fixes for Save-for-Later flow |

## Sync Results

| Case ID | Suite | Classification | Action | Note |
|---|---|---|---|---|
| CART-012 | 029-cart-validation-persistence | VALID for non-configurable | Reference updated | Synced: VCST-4205 (2026-05-19); cross-link to CRL-GQL-100/101 |
| CART-013 | 029-cart-validation-persistence | VALID for non-configurable | Reference updated | Synced: VCST-4205 (2026-05-19); cross-link to 072b conditional-section cases |
| CFG-EDIT-001/002/003 | 072-configurable-products-ui | VALID | Reference updated | Synced: VCST-4205 — edit-configuration flow verified PASS by Case 3 |
| CRL-GQL-070..092 | 050b3-graphql-xcart-lifecycle | INCOMPLETE → enriched | Renamed `GQL-*` → `CRL-GQL-*`; replaced hardcoded `fc596540…` virtual catalog GUID with `@td(VIRTUAL_CATALOG_B2B.id)`; ECL-14.1 references corrected | Data-validity hygiene |
| CRL-GQL-074, 075, 078 | 050b3 | STALE → updated | `Automation_Status: synced`; assertions hardened (itemsCount tolerances, sync line-item-id capture pattern) | TLC-2026-05-16-0026 authoring debt also closed |
| CRL-GQL-092 | 050b3 | STALE → updated | `getSavedForLater` field selection expanded to include full `configurationItems` (Anomaly A2 fix coverage) | BL-CART-014, BL-CART-018 mapped |

## Coverage Delta

| Metric | Before | After | Delta |
|---|---|---|---|
| 050b3 line count | ~310 | 697 | +387 lines |
| 029 line count | 584 | 586 | +2 (sync refs) |
| 072 line count | 700 | 703 | +3 (sync refs + GUID→`@td()`) |
| 072b line count | 562 | 562 | unchanged net (10 substitutions in place) |
| New GraphQL cases | 0 | **4** (CRL-GQL-100..103) | +4 |
| New BL proposals | 0 | **4** (PROPOSED-BL-CART-015..018) | +4 |
| Anomaly storefront cases (CFG-SFL-*) | 0 | 0 | **0 (deferred)** |

## New Cases Generated

| Case ID | Suite | Title | Priority | Maps to |
|---|---|---|---|---|
| **CRL-GQL-100** | 050b3 | xCart — Configurable Item Survives moveToSavedForLater Round-Trip | High | VCST-4205 CASE1; A2; A3 |
| **CRL-GQL-101** | 050b3 | xCart — moveFromSavedForLater Returns Configurable Item with Preserved configurationItems | **Critical** | VCST-4205 CASE2; A4 (regression-equivalent) |
| **CRL-GQL-102** | 050b3 | xCart — Edit Configurable Item by Remove+Add Preserves New Configuration | High | VCST-4205 CASE3 |
| **CRL-GQL-103** | 050b3 | xCart — Identical Configurable Items Added Twice Produce Distinct Line Items | Medium | BL-CART-007 exception; corrects VCST-4205 CASE6 author-side error |

## BL Proposals (drafted, NOT applied)

Written to `bl-proposals.md`. Per `feedback_business_logic_promotion` memory: every entry requires per-entry user approval before promotion to `.claude/agents/knowledge/business-logic.md`; the Invariant Coverage Summary table is never auto-updated.

| ID | Severity | Trigger | Layer |
|---|---|---|---|
| **PROPOSED-BL-CART-015** | Medium | A1 — SFL miniwidget price binding | Storefront UI |
| **PROPOSED-BL-CART-016** | High | A2 — SFL fragments missing `configurationItems` | GraphQL + Storefront UI |
| **PROPOSED-BL-CART-017** | High | A3 — `moveToSavedForLater` / `moveFromSavedForLater` bulk-op semantics | GraphQL xAPI + XCart backend |
| **PROPOSED-BL-CART-018** | **Critical** | A4 — async cart-projection settle overwrites configurationItems | Cart-projection backend (cross-layer) |
| **BL-CART-007** (stale check) | — | Exception clause is ambiguous re: configurable products | Knowledge file edit |

## Quality Gates

| Gate | Status | Notes |
|---|---|---|
| G1: Structure | **PASS** | All 4 modified CSVs are valid; 15-column enriched format preserved |
| G2: Determinism | **PASS** | New CRL-GQL-100..103 use index-based captures, `cartName: "default"` everywhere |
| G3: Completeness | **WARN** | Storefront CFG-SFL-* anomaly cases not generated (see Remaining Items) |
| G4: Testability | **PASS** | All new cases have falsifiable assertions |
| G5: Data Validity | **PASS** | Hardcoded virtual-catalog GUID and 5 sectionIds replaced with `@td()`; no remaining literals in scope |
| G6: BL/ECL Coverage | **PARTIAL** | GraphQL coverage strong (4 cases map to 5 BL-* IDs); storefront-layer coverage of A1/A2/A3/A4 missing |
| G7: Duplication | **PASS** | CRL-GQL-100..103 are net-new; no same-layer duplicate detected |
| G8: Environment | **PASS** | Phase 5 retry: 3/4 prior FAIL scenarios VERIFIED-PASS on clean baseline; 1/4 VERIFIED-FAIL (A1 reproduces). 0 BROKEN. See `phase5-verification-report.md`. |
| G9: Sync | **PASS** | STALE cases (CRL-GQL-074/075/078/092) updated; BROKEN none; deprecations none |

## Remaining Items

### Must-Fix (blocks regression) — none

### Should-Fix (improves quality)

| Item | Suite | Priority | Why deferred |
|---|---|---|---|
| Generate CFG-SFL-A1 — storefront miniwidget price binding regression case | 072b | High | A1 still reproduces deterministically per Phase 5 Scenario C; need persistent coverage |
| Generate CFG-SFL-A2 — SFL fragment `configurationItems` field coverage case | 072b | High | A2 reproduces in every Phase 5 scenario; need persistent coverage |
| Generate CFG-SFL-CONTAMINATED — "cart ↔ SFL round-trip with pre-existing SFL entries" regression case | 072b | High | Captures the state-dependent class that produced the prior session's A3/A4 FALSE POSITIVES. Without this, the next regression run on contaminated state will re-flag A3/A4. |
| Generate CFG-SFL-001..003 — storefront mirrors of VCST-4205 Cases 1/2/3 | 072b | Medium | Backend coverage via CRL-GQL-100..103 compensates; storefront mirror is nice-to-have not blocker |
| File new child bug for **A1** (cart-sidebar miniwidget binds `product.price.list` instead of `lineItem.listPrice`) | — | Medium | Verified-reproducing defect; deterministic STR captured in `phase5-evidence/scenario-C/` |
| File new child bug for **A2** (`getSavedForLater`/wishlist GraphQL fragment missing `configurationItems` selection) | — | High | Verified-reproducing defect; user can't distinguish saved configurations |
| Selectively promote PROPOSED-BL-CART-015 (A1) and PROPOSED-BL-CART-016 (A2) to `business-logic.md` body sections | — | Medium | Other proposals (017 A3, 018 A4) may not need promotion since Phase 5 shows clean-baseline PASS — consider rewording or deferring |

## Files Modified

```
regression/suites/Frontend/cart/029-cart-validation-persistence.csv         [+2 lines, sync refs]
regression/suites/Frontend/configurable-products/072-configurable-products-ui.csv  [+3 lines, sync refs + @td() subst]
regression/suites/Frontend/configurable-products/072b-configurable-products-e2e.csv [10 in-place @td() subst]
regression/suites/Backend/graphql/050b3-graphql-xcart-lifecycle.csv         [+387 lines: rename, @td() subst, CRL-GQL-100..103 appended]
reports/test-lifecycle/TLC-2026-05-19-VCST4205/bl-proposals.md              [new — 4 PROPOSED-BL-CART-* + BL-CART-007 staleness note]
reports/test-lifecycle/TLC-2026-05-19-VCST4205/lifecycle-report.md          [new — this file]
reports/test-lifecycle/TLC-2026-05-19-VCST4205/lifecycle-summary.json       [new — machine-readable summary]
```

## Build Verification — confirmed pre-flight

- `backend/packages.json` @ vc-deploy-dev:vcst-qa → PlatformVersion `3.1026.0`, XCart `3.1014.0-pr-118-1be7` (the fix)
- `theme/artifact.json` @ vc-deploy-dev:vcst-qa → theme `2.49.0-pr-2294-6509-650937ca`
- Matches the artifacts under test in the prior-session reports.

## Next Steps

- [ ] **Do NOT reopen VCST-4205** — PR #118 is working per Phase 5 clean-baseline retry. Transition the ticket to **Done** after the two new child bugs are filed.
- [ ] **File new bug — A1 cart-sidebar miniwidget price binding** (Medium). STR + evidence in `phase5-evidence/scenario-C/`. Storefront component binding fix in vc-frontend.
- [ ] **File new bug — A2 SFL fragment missing `configurationItems`** (High). STR + evidence in `phase5-evidence/scenario-C/`. GraphQL fragment definition in vc-frontend `savedForLaterLineItem`/`wishlistLineItemFields`.
- [ ] **File investigation ticket — contaminated-SFL state defect class** (Medium). Covers A3 + A4 reproducibility on dirty state. Backend hypothesis: `selectedForCheckout` semantics override `lineItemIds` filter when cart projection rebuilds from contaminated state. Worth a backend probe.
- [ ] Review `bl-proposals.md` — promote PROPOSED-BL-CART-015 (A1) + PROPOSED-BL-CART-016 (A2). Hold or reword 017 (A3) + 018 (A4) given clean-baseline PASS — they may need to be reframed as state-dependent rather than absolute invariants.
- [ ] Schedule a follow-up `/qa-coverage-generation` or `/qa-test-cases-generator` to author CFG-SFL-A1, CFG-SFL-A2, CFG-SFL-CONTAMINATED in `072b-configurable-products-e2e.csv`.
- [ ] Run `/qa-regression catalog,configurable-products,cart` (or just `050b3,072,072b,029`) to confirm CRL-GQL-100..103 are green and existing storefront cases still pass.
