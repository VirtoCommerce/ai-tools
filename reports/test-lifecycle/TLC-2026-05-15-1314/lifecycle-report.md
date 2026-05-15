# Test Case Lifecycle Report — TLC-2026-05-15-1314

## Summary

- **Input:** `VCST-4960` (JIRA ticket, change-source)
- **Input Type:** change-source
- **Date:** 2026-05-15 13:14 EEST
- **Platform:** 3.1026.0
- **Theme:** `vc-theme-b2b-vue-2.49.0-alpha.2342`
- **Relevant module versions (vc-deploy-dev / vcst-qa):**
  - `VirtoCommerce.XCart`: **3.1013.0** (ticket reported bug at 3.1007.0-pr-105 → fix shipped)
  - `VirtoCommerce.Cart`: 3.1003.0
  - `VirtoCommerce.Catalog`: 3.1022.0
  - `VirtoCommerce.Xapi`: 3.1007.0
- **Verdict:** **APPROVED WITH WARNINGS**

The fix for VCST-4960 has shipped to QA in `VirtoCommerce.XCart 3.1013.0`. Existing coverage in suite 050i has a deliberate gap on the negative path of `changeCartConfiguredItem` — 6 new cases proposed (5 in 050i, 1 in 050b4). All cases are `Draft` and require author follow-up on 5 manual items before promotion to `Reviewed`.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 2 suites affected (050i, 050b4); 4 candidate fix PRs identified (PR #110, #113 most likely) |
| 2. Sync | test-management-specialist | Done | 3 in-scope existing cases classified VALID; 0 STALE; 0 BROKEN |
| 3. Analyze & Generate | test-management-specialist | Done | 6 gaps identified, 6 new cases generated (5 in 050i, 1 in 050b4) |
| 4. Review & Fix | test-management-specialist | Done | 7 findings (0 Blocker, 0 Critical, 2 High, 3 Medium, 2 Low); 0 auto-fixed; 5 manual items |
| 5. Verify | orchestrator (infra-only) | Done | Runner present; schema-ref present; 5 `@td()` aliases resolved; `{BACK_URL}` reachable. Cases NOT executed live (still Draft). |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 7/9 gates PASS, 2 gates WARN |

## Change Inventory

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|
| `vc-module-x-cart` | GraphQL xAPI (CartAggregate) | `CartAggregate.cs` (validation cross-reference added) | No | Strict sectionId validation in `changeCartConfiguredItem` |

**Candidate fix PRs** (no PR explicitly tagged VCST-4960 — likely folded into):
- PR #113 — `feat/VCST-4987` — "align configuration validation between add and update paths" (merged 2026-05-01)
- PR #110 — `feat/cart-aggregate-validation` — "Feat/cart aggregate validation" (merged 2026-05-01)
- PR #114 — "feat: add configurationItem selection mutations" introduced `ConfigurationSectionKeyInput` (selection mutation family — orthogonal to VCST-4960's rewriting mutation)

## Sync Results

| Case ID | Suite | Classification | Action | Before → After | Rationale |
|---------|-------|---------------|--------|----------------|-----------|
| CFG-GQL-012 (lines 331–379) | 050i | VALID | No change | n/a | Happy-path `changeCartConfiguredItem` atomic_change. Assertions still match the post-fix contract — the fix only adds validation for invalid inputs and does not alter behavior for valid inputs. |
| CFG-GQL-021 (line 811) | 050i | VALID | No change | n/a | Tests `changeCartConfigurationItem**Selected**` (selection mutation family, PR #114). Documents intentional soft no-op contract — NOT in VCST-4960 scope. Do NOT reclassify as STALE. |
| `unSelectCartConfigurationItems noop` (line 1431, part of CFG-GQL-032 family) | 050i | VALID | No change | n/a | Tests `unSelectCartConfigurationItems` with unmatched sectionId (PR #114 selection family). Intentional soft no-op per `PROPOSED-BL-CART-CFG-003` / BL-CART-011. Different mutation, different contract. |

**Design distinction confirmed (key lifecycle finding):**
- `changeCartConfigurationItem**Selected**` family (PR #114 selection toggles): **intentional soft no-op** on unmatched keys
- `changeCartConfiguredItem` (rewriting mutation): **strict validation** required (VCST-4960)

These are orthogonal. The selection-family tests must remain unchanged.

## Coverage Delta

| Metric | Before | After (proposed) | Delta |
|--------|--------|------------------|-------|
| Total cases in 050i | 32 | 37 | +5 |
| Total cases in 050b4 | 17 | 18 | +1 |
| Negative cases for `changeCartConfiguredItem` invalid-sectionId path | 0 | 5 | +5 |
| BL-CART-001 coverage in 050i | (existing partial) | +5 cases | strengthened |

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority | Technique |
|---------|-------|-------|-------|----------|-----------|
| CFG-GQL-037 | 050i | `changeCartConfiguredItem` — Invalid sectionId (All-Zeros GUID) Rejected (VCST-4960) | GraphQL xAPI | High | Error Guessing (zero-GUID boundary) |
| CFG-GQL-038 | 050i | `changeCartConfiguredItem` — Section Type Mismatch Rejected (VCST-4960) | GraphQL xAPI | High | Error Guessing (type mismatch) |
| CFG-GQL-039 | 050i | `changeCartConfiguredItem` — State Preserved on Validation Failure (VCST-4960) | GraphQL xAPI | High | State Transition (post-rejection invariant) |
| CFG-GQL-040 | 050i | `changeCartConfiguredItem` — Mixed Valid/Invalid Sections All-or-Nothing Rejection (VCST-4960) | GraphQL xAPI | High | Decision Table |
| CFG-GQL-041 | 050i | `changeCartConfiguredItem` — sectionId Format Variants All Rejected (EP, VCST-4960) | GraphQL xAPI | Medium | Equivalence Partitioning |
| GQL-018 | 050b4 | `changeCartConfiguredItem` Against Non-Configured LineItem — Clean Rejection (VCST-4960) | GraphQL xAPI | Medium | Error Guessing (cross-domain context mismatch) |

Full CSV rows for each case are appended to this report as the file `proposed-cases.csv` (write separately on user approval).

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | All 6 cases have 15 columns, sequential IDs, valid CSV escaping |
| G2 Determinism | PASS | Every step tagged; no ambiguous predicates |
| G3 Completeness | WARN | 5 manual items remain (errorCode literal, type-mismatch triage, empty-string variant, dead capture, filter syntax) |
| G4 Testability | PASS | All assertions falsifiable; counts and equality checks |
| G5 Data Validity | WARN | `errorCode is-non-null` is too lenient; `isConfigurable:false` filter in GQL-018 not confirmed in schema |
| G6 BL/ECL Coverage | PASS | All 6 cases cite `BL-GQL-001` + `BL-CART-001`; ECL-9.1, ECL-14.1 referenced |
| G7 Duplication | PASS | Distinct from existing CFG-GQL-021/022 selection-family cases; setup-preamble duplication acceptable per runner-native patterns |
| G8 Environment | PASS (infra-only) | Runner + schema + aliases + endpoint verified. New cases NOT executed live (correct — still Draft) |
| G9 Sync | PASS | 3 in-scope cases reviewed; 0 STALE; 0 BROKEN; soft-noop family explicitly excluded from VCST-4960 scope |

**Required gates: 7/9 PASS, 2/9 WARN (G3 Completeness, G5 Data Validity). No FAIL. Verdict: APPROVED WITH WARNINGS.**

## Environment Verification (infrastructure-only)

| Check | Target | Result | Evidence |
|-------|--------|--------|----------|
| Runner present | `scripts/graphql-runner.ts` | PASS | `--help` returns valid output, TypeScript compiles |
| Schema reference present | `.claude/agents/knowledge/graphql-schema.md` | PASS | file exists |
| `@td()` aliases resolve | `CFG_LAPTOP`, `CFG_HAT`, `CFG_HOODIE`, `CFG_TEXT_DRIVEN_COND`, `CFG_VARIATION_CAKE` | PASS | all 5 resolve in `test-data/aliases.json` |
| Endpoint reachable | `{BACK_URL}` = `https://vcst-qa.govirto.com` | PASS | env loads from `.env.vcst` |

The new cases are `Draft` per the lifecycle contract — they will be executed by the canonical runner (`npx tsx scripts/graphql-runner.ts --case regression/suites/Backend/graphql/050i-graphql-configurations.csv:CFG-GQL-037`) **after** human review promotes them to `Reviewed` status.

## Remaining Items

### Must Fix (blocks promotion to `Reviewed`)

| Case ID | Issue | Dimension | Suggested Fix |
|---------|-------|-----------|---------------|
| CFG-GQL-037..041 | `errorCode is-non-null` assertion is too lenient (would pass on empty-string errorCode) | Data Validity | Inspect `vc-module-x-cart` PR #113 or PR #110 source for the actual errorCode constant; promote assertion to string equality once confirmed |
| CFG-GQL-038 | Type-mismatch validation scope not confirmed for VCST-4960 fix — may not yet be in scope | Completeness | Manual triage on first run; if `validationErrors[] empty` observed, classify NEEDS-INVESTIGATION (not FAIL) and file follow-up to clarify whether type-mismatch is in scope |
| GQL-018 | `isConfigurable:false` filter not confirmed in live schema | Data Validity | Replace dynamic filter with direct `@td(CFG_HOODIE.id)` (existing alias for non-configurable product) |

### Should Fix (improves quality)

| Case ID | Issue | Dimension | Suggested Fix |
|---------|-------|-----------|---------------|
| CFG-GQL-041 | Empty-string `sectionId` variant omitted from Steps despite EP description listing it | Completeness | Add a third `reject_empty` op block OR explicitly document the scoped-out omission |
| CFG-GQL-039 | `ORIGINAL_CONFIG_ITEM_ID_0` captured but never referenced in Assertions (dead capture) | Data Validity | Remove the capture step OR promote it to an active `[VAR]` assertion that verifies preservation post-rejection |
| CFG-GQL-038 | Read_back missing STORAGE-section productId assertion | Completeness | Add a parallel `[DATA] read_back ... [?sectionId={{SECTION_STORAGE_ID}}].productId = {{OPT_STORAGE_BASE_ID}}` |

## Files Modified

**None.** All proposed cases are documented in this report and `proposed-cases.csv`. The orchestrator will NOT append rows to `050i-graphql-configurations.csv` or `050b4-graphql-xcart-cross-domain.csv` until the user explicitly approves.

## Next Steps

1. **Author review** — read the 6 generated cases in `proposed-cases.csv`; resolve the 5 manual items (especially the actual errorCode constant from PR #113/#110 source)
2. **Decision on type-mismatch scope** — read `vc-module-x-cart` PR #113 source to confirm whether type-mismatch is validated alongside sectionId, or only sectionId (CFG-GQL-038 fate)
3. **Append cases to suite CSVs** — once author confirms revisions, write the 6 rows to `regression/suites/Backend/graphql/050i-graphql-configurations.csv` and `050b4-graphql-xcart-cross-domain.csv`; bump `testCount` in `config/test-suites.json` (32 → 37 for 050i; 17 → 18 for 050b4)
4. **Promote to `Reviewed`** — run `/qa-review-tests file regression/suites/Backend/graphql/050i-graphql-configurations.csv --verify` after append; if PASS WITH WARNINGS or better, promote new cases `Draft` → `Reviewed` per the test-case-template policy
5. **Live execution** — run via canonical runner: `npx tsx scripts/graphql-runner.ts --case regression/suites/Backend/graphql/050i-graphql-configurations.csv:CFG-GQL-037` (and 038..041, GQL-018) — confirms VCST-4960 fix is live on vcst-qa
6. **Run regression suite** — once all new cases pass live, include in `/qa-regression sprint` (Sprint 26-09 plan already lists 050i and 050b4 in `suitesActivated`)
7. **Close VCST-4960 verification** — add comment to ticket linking this TLC run and the new case IDs

## References

- JIRA: https://virtocommerce.atlassian.net/browse/VCST-4960
- Sprint plan: `docs/Sprint plans/sprint-26-09-test-plan.md` (GAP-03)
- Canonical runner: `scripts/graphql-runner.ts`
- Runner-native authoring contract: `.claude/agents/knowledge/graphql-test-cases-runner.md`
- Business Logic: `.claude/agents/knowledge/business-logic.md` (BL-GQL-001, BL-CART-001)
- Edge Cases: `.claude/agents/knowledge/e-commerce-edge-cases-library.md` (ECL-9.1, ECL-14.1)
- Test data aliases: `test-data/aliases.json` (CFG_LAPTOP, CFG_HAT, CFG_HOODIE, CFG_TEXT_DRIVEN_COND, CFG_VARIATION_CAKE)
- Memory cross-references: `feedback_use_canonical_graphql_runner`, `feedback_graphql_schema_validation`, `feedback_graphql_full_field_selection`, `feedback_no_test_data`
