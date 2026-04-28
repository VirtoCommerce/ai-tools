# Test Case Lifecycle Report — TLC-2026-04-28-2050

## Summary

- **Input:** PR #8 — `https://github.com/VirtoCommerce/vc-module-x-pickup/pull/8`
- **Input Type:** change-source
- **Date:** 2026-04-28 20:50
- **JIRA:** VCST-4707 — `[BOPIS] Pre-selection fails for pickup locations outside first 50 results (pagination bug)` (Bug, High, Ready-for-test)
- **PR Title:** VCST-4707: Include selected pickup locations
- **Platform:** 3.1025.0
- **Theme:** vc-theme-b2b-vue 2.48.0-pr-2269 (deployed PR theme)
- **Module under test:** `VirtoCommerce.XPickup_3.1001.0-pr-8-3380` (artifact deployed at vcst-qa, confirmed via `backend/packages.json` on `vcst-qa` branch)
- **Verdict:** **APPROVED WITH WARNINGS**

---

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 PR analyzed, 5 affected suites identified, change inventory built |
| 2. Sync | test-management-specialist | Done | 10 cases reviewed, 1 INCOMPLETE (BOPIS-087 — diff presented), 9 VALID |
| 3. Analyze & Generate | test-management-specialist | Done | 2 critical gaps closed: 2 cases generated (BOPIS-091 + GQL-094) |
| 4. Review & Fix | test-management-specialist | Done | 8 findings (B:0, C:0, H:0, M:1, L:1), 2 auto-fixed |
| 5. Verify | qa-testing-expert | Done | Fix VERIFIED live (Edge fallback used; Firefox not installed); 270s budget |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 8/9 gates PASS, 1 WARN (G9 sync partial) |

---

## Change Inventory

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|---------------|----------|--------------|
| VirtoCommerce.XPickup | backend / graphql xAPI | 3 .cs files + 1 build prop | None | `IncludeLocationIds` field on `MultipleProductsPickupLocationSearchCriteria` — confirmed cart pickup location IDs always returned in `cartPickupLocations` response, prepended at `items[0]` regardless of paging/keyword/filter |

**Files changed:**
- `Directory.Build.props` — NuGet audit suppression (test-irrelevant)
- `src/VirtoCommerce.XPickup.Core/Models/MultipleProductsPickupLocationSearchCriteria.cs` — added `IList<string> IncludeLocationIds`
- `src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryHandler.cs` — populates `IncludeLocationIds` from `cart.Shipments[].PickupLocationId` (distinct, non-null)
- `src/VirtoCommerce.XPickup.Data/Services/ProductPickupLocationService.cs` — ensures missing `IncludeLocationIds` are prepended to result, ordered by `PickupLocation.Name`

---

## Sync Results (Phase 2)

| Case ID | Suite | Classification | Action | Notes |
|---------|-------|----------------|--------|-------|
| BOPIS-087 | 036 | INCOMPLETE | enrich-assertion (diff ready) | Add reopen pre-selection assertion + cartPickupLocations network check + VCST-4707 reference. **Not yet applied** — awaiting user confirmation. |
| BOPIS-082 | 038 | VALID | no-update | Mid-checkout location change. Optional: add VCST-4707 to References for traceability. |
| BOPIS-002 / 016 / 026 / 073 | 036 / 037 | VALID | no-update | Single first-page location flows; fix is additive. |
| BOPIS-080 / 083 / 090 | 038 | VALID | no-update | Guest BOPIS / pickup-to-delivery / cart-level toggle — unaffected. |
| SMK-024 | 042 | VALID (deferred enrichment) | no-update | Smoke budget concern; deeper signal already covered by BOPIS-091. |

74 cases across the affected suites are unaffected.

### BOPIS-087 — Proposed Diff (NOT yet applied)

**Add to Steps (after the existing Confirm step):**
```
[ACT] click 'Select pickup location' again to reopen modal
[WAIT] pickup location modal reopens
[ASSERT] radio button next to the previously-selected location is checked
[ASSERT] that location appears at the top of the list without scrolling (prepended at index 0)
```

**Add to Assertions:**
```
[STATE] previously-confirmed location pre-selected (radio checked) when modal reopens — BL-BOPIS-008-PROPOSED
```

**Add to Cross_Layer_Checks:**
```
[NETWORK] browser_network_requests: cartPickupLocations response on modal reopen contains confirmed location at items[0] despite no filter applied
```

**Update References:** add `VCST-4707; PR vc-module-x-pickup#8; BL-BOPIS-008-PROPOSED`

---

## Coverage Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total BOPIS cases | 96 | 97 | +1 |
| Total xCart GraphQL cases | (existing) | +1 | +1 |
| Cases referencing VCST-4707 | 0 | 2 | +2 |
| `cartPickupLocations` xAPI coverage | 0 | 1 | +1 |
| Pagination-pre-selection invariant tests | 0 | 1 (Frontend) + 1 (GraphQL) | +2 |

---

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| BOPIS-091 | 036 | VCST-4707 Regression — Confirmed Pagination-Boundary Location Appears at Top of Modal on Reopen | frontend | Critical |
| GQL-094 | 050b1 | xCart Pickup — cartPickupLocations Returns Confirmed Location Regardless of keyword/filter/paging (VCST-4707) | graphql | Critical |

Both cases reference `VCST-4707; PR vc-module-x-pickup#8; BL-BOPIS-008-PROPOSED` and have `Automation_Status: Draft` pending peer review approval.

---

## Context7 / GitHub Documentation Findings

| Module | Topic Queried | Behavior Change Detected | Cases Influenced |
|--------|---------------|--------------------------|------------------|
| vc-module-x-pickup | PR diff (4 files) | New `IncludeLocationIds` semantic — confirmed cart pickup locations always at `items[0]` | BOPIS-091, GQL-094, BOPIS-087 (proposed update) |
| vc-deploy-dev (vcst-qa) | `backend/packages.json` + `theme/artifact.json` | Module artifact deployed: `VirtoCommerce.XPickup_3.1001.0-pr-8-3380.zip` | All — confirms PR is live in QA |
| Live env (vcst-qa) | `cartPickupLocations` GraphQL response | Confirmed location appears at `items[0]` after modal reopen, even with no keyword/filter | BOPIS-091 (live verified), GQL-094 (assertions match observed behavior) |

---

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1: Structure | **PASS** | 0 Blocker findings; CSV format intact, IDs unique, all 15 columns populated for new cases |
| G2: Determinism | **PASS** | 0 Critical findings; runtime LAST_LOCATION resolution avoids hardcoded position; step tags inferred correctly |
| G3: Completeness | **PASS** | 1 Medium finding (≤3 allowed); GQL-094 `first:200` probe assumption mitigated via Failure_Signal entry |
| G4: Testability | **PASS** | 0 Critical findings; assertions are falsifiable (radio checked, items[0].id match, map centered) |
| G5: Data Validity | **PASS** | 0 Critical/Blocker findings; GraphQL schema fully validated (DV-006–DV-011); `cartPickupLocations` signature confirmed; `InputShipmentType.pickupLocationId` confirmed |
| G6: Coverage (Recommended) | **PASS** | Both new cases reference BL-BOPIS-001/004/007 plus the proposed BL-BOPIS-008; >80% BL coverage maintained for P0/P1 |
| G7: Duplication (Recommended) | **PASS** | No same-layer duplicates; BOPIS-091 (frontend) and GQL-094 (graphql) are layer-orthogonal |
| G8: Environment | **PASS** | Fix VERIFIED live; pagination boundary confirmed (102 locations vs 50 batch); zero BROKEN findings; 0 console errors during walkthrough |
| G9: Sync | **WARN** | BOPIS-087 INCOMPLETE — diff presented but not yet applied. Awaiting user confirmation per spec (no `--auto-fix` flag was set). |

**8/9 required gates PASS, 1 WARN (G9, partial sync — non-blocking).**

---

## Environment Verification (Phase 5)

| Check | Verdict | Evidence |
|-------|---------|----------|
| Storefront homepage reachable | VERIFIED | `https://vcst-qa-storefront.govirto.com` loads |
| Authenticated session works | VERIFIED | John Mitchell signed in (org AGENT-TEST-Org-TechFlow-20260310, B2B-store) |
| Cart page loads | VERIFIED | navigated successfully |
| Pickup modal opens | VERIFIED | `01-pickup-modal-opened.png` |
| Pagination boundary exists | VERIFIED | 102 total locations vs `first:50` batch (HUN/CHN/JPN/AU/MYS/MEX/ZAF locations all alphabetically beyond M-cutoff) |
| Pickup location selectable beyond first batch | VERIFIED | Westend Foxpost (HUN, Budapest) — alphabetically last, beyond initial batch |
| Confirmed pickup persists across modal close | VERIFIED | `03-cart-with-westend-confirmed.png` |
| Pre-selection survives modal reopen | **VERIFIED — fix works** | `04-modal-reopened-preselection-at-index-0.png`. 51 radios visible: standard 50 + 1 IncludeLocationIds-injected; selected radio (id `4594df6b-4ecb-47f1-bb68-73c8bbff2564`) is at DOM index 0 and `:checked` |
| `cartPickupLocations` xAPI returns confirmed location at items[0] | **VERIFIED** | `GetCartPickupLocations` op fired on reopen with `first:50, no keyword, no filter` — items[0].id = confirmed location ID |
| Console error baseline | CLEAN | 0 errors, 102 warnings (Vue/i18n dev-mode, unrelated) |

**Browser fallback note:** `playwright-firefox` not installed on the runner host; fell back to `playwright-edge` per the fallback chain. Recommend `npx playwright install firefox` on the QA agent host to keep Firefox primary for the verifier role.

**Evidence directory:** `reports/test-lifecycle/TLC-2026-04-28-2050/evidence/`
- `01-pickup-modal-opened.png`
- `02-westend-selected-before-confirm.png`
- `03-cart-with-westend-confirmed.png`
- `04-modal-reopened-preselection-at-index-0.png`
- `05-network-cartPickupLocations.txt`

---

## Remaining Items

### Must Fix (blocks regression)

*(none — all required gates pass)*

### Should Fix (improves quality)

| Case ID | Issue | Dimension | Suggested Fix |
|---------|-------|-----------|---------------|
| BOPIS-087 | Missing reopen pre-selection assertion + VCST-4707 reference | completeness | Apply the diff in the Sync Results section above (presented for user confirmation per spec). |
| GQL-094 | `first:200` assumes ≤200 locations exist; weakens boundary intent if env grows | determinism | Failure_Signal entry already added; consider parameterizing as `{{MAX_PICKUP_LOCATIONS}}` env var. |
| BOPIS-082 | Could add VCST-4707 to References for traceability (not a functional gap) | completeness | Optional. |
| BOPIS-091 | Test data note: Westend Foxpost (Budapest, HUN) is the canonical sample location and matches the original bug | testability | Add a `[NOTE]` to Preconditions citing Westend Foxpost as a deterministic boundary candidate (HUN is the only Hungary location, alphabetically last, env-stable). |

### Browser/Infrastructure
- `playwright-firefox` not installed on the runner host (fell back to Edge). Run `npx playwright install firefox` to restore Firefox primacy for the qa-testing-expert verifier role.

### Business Logic (advisory)
- **BL-BOPIS-008-PROPOSED:** "Pickup locations confirmed in cart shipments must appear at `items[0]` of `cartPickupLocations` response regardless of paging, keyword, or filter — confirmed location is fetched separately and prepended (no DB-level union; ordered by `PickupLocation.Name`)." Source: VCST-4707 + PR vc-module-x-pickup#8. **NOT applied to `business-logic.md`** (`--update-bl` was OFF). Per `feedback_business_logic_promotion.md`, requires explicit per-entry user approval before promotion.

---

## Files Modified

- `regression/suites/Frontend/bopis/036-bopis-store-selector.csv` — appended `BOPIS-091`
- `regression/suites/Backend/graphql/050b1-graphql-xcart-basic.csv` — appended `GQL-094` (in existing xCart section, no new file created)
- `reports/full-cycle/last-deploy-state.json` — wrote vcst-qa deploy snapshot for future diff-mode runs

---

## Next Steps

- [ ] **Optional:** approve and apply BOPIS-087 diff (Phase 2 INCOMPLETE → reviewed). Run `/qa-test-lifecycle suite 036 --skip-sync --skip-generate` after applying for a post-fix quality re-check, or apply manually.
- [ ] **Recommended:** install Firefox on the QA host (`npx playwright install firefox`) to restore Phase 5 default browser.
- [ ] **Approve generated cases:** BOPIS-091 and GQL-094 are `Draft` — promote to `Reviewed`/`Active` after peer review.
- [ ] **Suggested regression run:** `/qa-regression bopis` (suites 036, 037, 038) once BOPIS-091 is approved — exercises the fix in the standard regression flow.
- [ ] **Verify on QA:** VCST-4707 is `Ready for test`. Phase 5 already validated the fix end-to-end. **Suggest transitioning VCST-4707 → Verified/Done** in JIRA once the approval gate is cleared.
- [ ] **Optional follow-up ticket:** the pickup modal does not expose a user-facing "Load more" / pagination control; locations beyond the initial 50 are reachable only via filter, keyword, or pre-selection. The `IncludeLocationIds` fix addresses the cart-side regression but the broader UX gap remains. Consider filing a separate VCST UX ticket if not already tracked.

---

## Verdict Summary

**APPROVED WITH WARNINGS.**

The PR fix is **functionally verified** end-to-end against vcst-qa. The exact bug scenario (selecting Westend Foxpost in Hungary, beyond the initial 50-result batch, then reopening the modal) now works correctly: pre-selection survives, confirmed location is at `items[0]` of the live `GetCartPickupLocations` response, map centers on Budapest, no stale filter. Two new test cases (BOPIS-091 frontend + GQL-094 GraphQL) lock in the fix as a regression guard. One pending sync update (BOPIS-087) is presented as a diff awaiting user confirmation per the standard non-`--auto-fix` workflow. Quality gates pass 8/9 with one non-blocking WARN. **Cleared for `/qa-regression bopis` once BOPIS-087 is updated.**
