# Test Case Lifecycle Report — TLC-2026-07-13-1530

## Summary
- **Input:** VCST-4646, VCST-4529
- **Input Type:** change-source (JIRA tickets)
- **Date:** 2026-07-13 15:30
- **Platform:** 3.1043.0
- **Theme:** vc-theme-b2b-vue **2.53.0-pr-2368** (⚠ a PR build; VCST-4646 was originally QA'd on `pr-2348` / vcptcore-qa — feature confirmed present on this build in Phase 5)
- **Module Versions:** XPickup 3.1002.0 · XCart 3.1025.0 · Xapi 3.1013.0 · Cart 3.1007.0
- **Scope:** BOPIS pickup-location pagination + list filters/keyword search
- **Affected suites:** 036-bopis-store-selector, 037-bopis-cart, 050k-graphql-xpickup
- **Verdict:** **APPROVED WITH WARNINGS**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 3 suites; JIRA-driven; no remote PR links (theme fix rode PR #2348, deployed build pr-2368) |
| 2. Sync | test-management-specialist | Done | 89 VALID, 1 synced (BOPIS-087), 0 BROKEN |
| 3. Analyze & Generate | test-management-specialist | Done | 10 gaps → 21 new cases + 1 fixed; 5 BVA combos designed (design-only) |
| 4. Review & Fix | test-management-specialist | Done | 0 Blocker / 0 Critical / 0 High / 3 Medium; 1 auto-fixed |
| 5. Verify | qa-testing-expert (playwright-edge*) | Done | Load More live & working; 0 BROKEN, 1 CHANGED (improved), 2 known defects noted |
| — Reconcile | test-management-specialist | Done | 16 cases realigned to Phase-5-verified selectors/flows |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Required gates 7/7 PASS; recommended 2/2 PASS |

\*playwright-firefox not installed on this machine → permitted fallback to playwright-edge.

## Change Inventory
| Ticket | Type / Status | Layer | Change | Breaking |
|--------|---------------|-------|--------|----------|
| VCST-4646 | Story / Done | storefront + GraphQL | "Load more" pagination in cart Pick-points modal; `getCartPickupLocationsQuery.graphql` now selects `pageInfo{hasNextPage endCursor}`; cursor reset on keyword+facet; map pins accumulate; client-side `uniqBy` keep-first dedup | No |
| VCST-4529 | Task / Tested | storefront | E2E coverage for pickup List > filters + keyword search | No |

Depends on **VCST-4707** (vc-module-x-pickup#8) — confirmed location prepended at `items[0]` (BL-BOPIS-008), `totalCount` NOT incremented for the prepend.

## Sync Results
| Case ID | Suite | Classification | Action | Before → After |
|---------|-------|---------------|--------|----------------|
| BOPIS-087 | 036 | INCOMPLETE → fixed | Rewrote steps/assertions | ambiguous "button OR infinite scroll" + loadedCount check → explicit Load More button, visibility asserted against `pageInfo.hasNextPage`; +BL-BOPIS-008, +VCST-4646/4707 refs |

**VALID (no change): 89** — 036 (37), 037 (44), 050k (11). No case asserted stale "only 50 shown"/"no Load More"/cursor behavior contradicted by the new build.

## New Cases Generated (21 new + 1 fixed; all `Automation_Status = Draft`)
| Suite | Case IDs | Coverage |
|-------|----------|----------|
| 036 | BOPIS-094, 096–103 | default render+counter, append+pins, hasNextPage-hide, keyword-reset, facet-reset, mobile tab, keyboard/a11y, Enter-submit (pain-pt#1), combined-after-load-more |
| 036 (BVA) | BOPIS-104–108 | boundary totals 50 / 51 / 100 / 101 / 151 (page size 50) |
| 037 | BOPIS-109 | cross-layer: Load-More-selected location persists through checkout |
| 050k | PCK-GQL-132, 133, 134, 135, 138, 139 | prepend totalCount invariant, within-page dedup, `first` cap watchdog, keyword+filter intersection, facet-count cross-check, shipment idempotency |

## Environment Verification (Phase 5)
| Check | Result | Detail |
|-------|--------|--------|
| Feature presence | VERIFIED | Load More + "Showing X of 115" counter present; loads 50/click, appends list + map pins, control removed at last page |
| Keyword + Enter | CHANGED (improved) | Enter **submits** search (old country-facet-dropdown bug resolved on pr-2368) |
| Facet filter | VERIFIED | Narrows list + map, resets cursor, respects active keyword |
| Keyboard / a11y | VERIFIED w/ defect | ArrowKey roving works; radiogroup aria-label is the **raw i18n key** `pages.checkout.shipping.links.select_pickup_point` (untranslated) |
| Mobile (390px) | VERIFIED | List/Map **tab** toggle (`view-map-button`); Load More reachable in List tab |
| Console/network | VERIFIED | No BOPIS errors/4xx/5xx; only unrelated `AGENT-TEST-CFG-*` thumbnail 404s + benign Google-Maps `<gmp-pin>` deprecation warnings |

**Selector facts folded into the cases (reconciliation pass):** two-step Pickup trigger (toggle Pickup → `select-address-button` → dialog); stable ids `pickup-location-section`/`select-address-button`/`pickup-locations-load-more`/`search-keyword-input`/`reset-filters-mobile-button`/`view-map-button`; counter asserted as shape (`"Showing … of N"`, delta 50/click), never the literal 115/102; mobile = tab toggle; a11y assertion targets the raw i18n key as a known-defect.

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 0 Blocker; CSVs structurally valid |
| G2 Determinism | PASS | Stable data-test-ids; 2 Medium execution-notes (below), no Critical |
| G3 Completeness | PASS | 0 High; all BA test-plan bullets covered |
| G4 Testability | PASS | Falsifiable assertions; 5 BVA cases blocked on data-prep (Medium, not Critical) |
| G5 Data Validity | PASS | 0 hardcoded GUIDs/SKUs/prices; only business-key `@td()` aliases |
| G6 Coverage | PASS (rec.) | BL-BOPIS-003/005/007/008 + ECL-14.1/14.2 mapped for P0/P1 |
| G7 Duplication | PASS (rec.) | No ≥70% same-layer overlap; BOPIS-087 updated in place |
| G8 Environment | PASS | 0 BROKEN; Load More live & working on vcst-qa pr-2368 |
| G9 Sync | PASS | All STALE addressed (BOPIS-087); 0 BROKEN to deprecate |

## Remaining Items

### Must Fix (blocks live promotion Draft → Reviewed)
| Item | Detail |
|------|--------|
| Seed BVA fixtures | BOPIS-104–107 need controlled pickup totals via `isActive` toggling on the B2B-store pool → run `/qa-generate-data` then `/qa-seed-data` before these execute live |
| BOPIS-108 (151-total) unreachable | Live active pool = 115; 151 not reachable by toggling down. **Escalated to qa-lead-orchestrator:** seed new location records, prove API-only, or drop the case |
| Live execution | Dry-run + live-run the 21 new cases before promotion — qa-frontend-expert (036/037 P0/P1), qa-backend-expert (`graphql-runner.ts --dry-run` then live on 050k) |

### Should Fix (improves quality)
| Item | Detail |
|------|--------|
| PCK-GQL-133/135 sort assumption | Assume `@td(BOPIS.location51Id)` sits at natural position 51 under default sort (snapshot 2026-04-30, unverified) — confirm before trusting the exact-boundary assertions |
| i18n key defect | `pages.checkout.shipping.links.select_pickup_point` untranslated on the pickup radiogroup — file a minor UI/i18n bug (out of scope for this run) |

## Files Modified
- `regression/suites/Frontend/bopis/036-bopis-store-selector.csv` — fixed BOPIS-087; added BOPIS-094, 096–108 (14 cases); reconciled to live selectors
- `regression/suites/Frontend/bopis/037-bopis-cart.csv` — added BOPIS-109
- `regression/suites/Backend/graphql/050k-graphql-xpickup.csv` — added PCK-GQL-132/133/134/135/138/139 (lint 12/12 clean)
- `config/test-suites.json` — testCount 036: 36→50, 037: 44→45, 050k: 6→12

## Business Logic Note (advisory — `--update-bl` not set, nothing written to business-logic.md)
- **BL-BOPIS-008** — current promoted text covers "confirmed location at `items[0]`" but not the "`totalCount` NOT incremented for the prepend" nuance that PCK-GQL-132 now tests. Worth an amendment via a future `/qa-test-lifecycle --update-bl`.
- **PROPOSED-BL-BOPIS-009..013** (from the VCST-4646 BA comment) are not in `business-logic.md` — treated as candidates only, not cited as canonical in any new case.

## Next Steps
- [ ] Seed BVA pickup fixtures (`/qa-generate-data` → `/qa-seed-data`) and resolve BOPIS-108 with qa-lead-orchestrator
- [ ] Live dry-run + execution of the 21 new cases; promote Draft → Reviewed
- [ ] Run `/qa-regression 036,037,050k` once cases are promoted (part of Sprint 26-13 BOPIS scope, GAP-38)
- [ ] File the minor i18n defect (untranslated pickup radiogroup aria-label)
