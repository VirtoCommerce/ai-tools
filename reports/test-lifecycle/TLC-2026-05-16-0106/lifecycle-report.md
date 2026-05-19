# Test Case Lifecycle Report — TLC-2026-05-16-0106

## Summary

| Field | Value |
|---|---|
| **Input** | `050c review, fix` |
| **Input Type** | direct-scope (suite) |
| **Date** | 2026-05-16 01:06 → 01:13 (~7 min wall) |
| **Platform** | 3.1026.0 (Healthy — Modules / Cache / Redis / SQL Server all healthy) |
| **Theme** | vc-theme-b2b-vue-2.49.0-alpha.2342 |
| **Relevant Modules** | VirtoCommerce.XOrder 3.1004.0, VirtoCommerce.Xapi 3.1007.0, VirtoCommerce.Orders 3.1008.0 |
| **Environment** | vcst-qa (BACK_URL = https://vcst-qa.govirto.com) |
| **GraphQL schema** | Refreshed via `npm run schema:refresh` — 86 queries, 134 mutations, 36 types |
| **Verdict** | **APPROVED WITH WARNINGS** |

## Phase Results

| Phase | Agent | Status | Key Metrics |
|---|---|---|---|
| 1. Scope | orchestrator | Done | 1 suite, 3 cases (ORD-GQL-011/012/013) |
| 2. Sync | test-management-specialist | **Skipped** (direct scope) | — |
| 3. Analyze & Generate | test-management-specialist | **Skipped** (review-only) | — |
| 4. Review & Fix | test-management-specialist | Done | 0 Blocker · 0 Critical · 3 High · 1 Medium · 1 Info; 0 auto-fixes applied |
| 5. Verify | qa-testing-expert | **Skipped** (runner-native GraphQL — no browser path) | — |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 7/9 gates PASS, 2 N/A, 0 FAIL |

## Quality Gates

| Gate | Status | Details |
|---|---|---|
| G1 Structure | **PASS** | CSV format valid, IDs unique, all required columns populated |
| G2 Determinism | **PASS** | All steps use proper runner tags (`[AUTH]`, `[GQL-OP]`, `[GQL-EXEC]`, `[GQL-CAPTURE]`) |
| G3 Completeness | **PASS** | All cases have Preconditions, Assertions, Failure_Signals, Cleanup, `[ERRORS]` checks |
| G4 Testability | **PASS** | All predicates are falsifiable; no vague language |
| G5 Data Validity | **PASS** | Schema validation: all selected fields exist in refreshed introspected schema. No `currencyCode`/`currency.code` MoneyType drift. `coupons` + `currency.name` both present in schema — production resolver bug, NOT a test authoring defect (DV-009 does not apply). |
| G6 BL/ECL Coverage | **PASS** | BL-GQL-002, BL-GQL-004, ECL-2.1 all referenced and resolvable |
| G7 Duplication | **PASS** | No same-layer duplicates. 050g perf probes overlap xOrder list queries at different depths (complementary, not duplicate). |
| G8 Environment | **N/A** | Phase 5 skipped (runner-native backend GraphQL — no browser verification path) |
| G9 Sync | **N/A** | Phase 2 skipped (direct scope, no code-change source) |

**Required gates (G1-G5, G8, G9):** 5 PASS, 2 N/A — all required gates that apply pass. 
**Recommended gates (G6, G7):** 2 PASS.

## Findings Detail (Phase 4)

| Severity | Count | Issue Pattern | Action |
|---|---|---|---|
| Blocker | 0 | — | — |
| Critical | 0 | — | — |
| **High** | **3** | REQ-001 — `References` column on each of ORD-GQL-011/012/013 cites schema docs only, no JIRA ticket or REQ-* ID. Priority Critical/High cases should link to source-of-demand. | Manual item — needs JIRA ticket lookup for xOrder coverage requirement |
| Medium | 1 | TC-001 (informational) — no negative case for `order(number:)` query (e.g., non-existent / unauthorized number); 050g XCC-GQL-016 covers auth-gate but not bad-input | Optional enhancement — file as a coverage-gap idea, not a current defect |
| Low | 0 | — | — |
| Info | 1 | DUP-003 — 050g cross-cutting performance probes overlap xOrder list queries; complementary not duplicate | No action — by design |

**Auto-fixes applied:** 0 (suite was already clean — `Cleanup` correctly populated as `none — pure read`, no missing `[ERRORS]` tags, no hardcoded URLs, no MoneyType drift).

**Files modified:** none.

## Critical Finding — ORD-GQL-013 is Working As Designed

ORD-GQL-013 was authored as a deliberate **schema-coverage canary**: it selects every CustomerOrderType scalar + nested-object field defined in `graphql-schema.md` to detect drift. The current failure (2 INVALID_OPERATION errors on `coupons` and `currency.name`) is exactly what it is designed to surface.

| Field | In schema? | In Context7 docs? | Resolver behavior |
|---|---|---|---|
| `CustomerOrderType.coupons` ([String]) | Yes | Yes | Throws `INVALID_OPERATION` |
| `CurrencyType.name` (String) | Yes (first field listed) | **No — undocumented** | Throws `INVALID_OPERATION` |

**Recommendation: Option A — keep ORD-GQL-013 unchanged.** Removing or guarding the failing fields would hide the production bug. The test is a working canary. Two consecutive deterministic failures (REG-20260515-1438 + REG-20260516-0101) confirm a stable resolver defect, not flake.

Option B (split into one full-coverage probe + one defensive subset) was considered and is logged as a "Should Fix" optional enhancement, not auto-applied.

## Context7 Findings

| Module | Topic | Behavior Change Detected | Cases Influenced |
|---|---|---|---|
| xOrder / CurrencyType | Object reference | Official docs at `vc-docs/.../Order/objects/currency-type.md` list **6 fields** (`code, symbol, exchangeRate, customFormatting, englishName, cultureName`) and **omit `name`**, even though `name` IS in the live introspected schema. Suggests `name` is an undocumented/orphan field with no working resolver. | ORD-GQL-013 (failing on `currency.name`) — confirms it as a real backend bug, not a documentation mismatch on the test side. |
| xOrder / CustomerOrderType.coupons | Object reference | `coupons` is documented as `[String]` and present in the live schema. Failure is a production resolver bug, not a schema/docs mismatch. | ORD-GQL-013 — confirms `coupons` is a valid public API field that should resolve. |

## Remaining Items

### Must Fix (blocks regression)
_(none — all required gates pass)_

### Should Fix (improves quality)

| Case ID | Issue | Dimension | Suggested Fix |
|---|---|---|---|
| ORD-GQL-011 | References column lacks JIRA/REQ-* ID for xOrder list coverage requirement | Completeness (REQ-001) | Add JIRA ticket reference (e.g., the original epic that requested xOrder regression coverage) |
| ORD-GQL-012 | Same as above for order detail coverage | Completeness (REQ-001) | Same |
| ORD-GQL-013 | Same as above for schema-coverage probe | Completeness (REQ-001) | Same |
| ORD-GQL-013 | Option B — could split into full-coverage probe + defensive subset | Test design | Optional. Lets green-path move while resolver bug persists. Not auto-applied. |
| Suite 050c | No negative case for `order(number:)` (bad input / unauthorized number) | Coverage | File as coverage-gap enhancement (Medium priority) |

### Production Bugs Exposed by Suite 050c (file or link to existing JIRA)

| Severity | Module | Bug | Reproducer |
|---|---|---|---|
| High | xOrder / xAPI | `CustomerOrderType.coupons` resolver throws `INVALID_OPERATION` on orders with no coupons | `npx tsx scripts/graphql-runner.ts --case regression/suites/Backend/graphql/050c-graphql-xorder.csv:ORD-GQL-013` |
| Medium | xOrder / xAPI (or Currency module) | `CurrencyType.name` resolver throws `INVALID_OPERATION`; field is also undocumented in vc-docs | Same case as above |

## Files Modified

_(none)_

## Next Steps

- [ ] **No regression-blocking action required.** Suite 050c test cases are quality-approved.
- [ ] **File JIRA bug** (or link to existing 2026-05-15 ticket if one exists) for the two `INVALID_OPERATION` resolver errors. Owner: xOrder / xAPI module.
- [ ] **Optional**: enrich `References` column on ORD-GQL-011/012/013 with JIRA ticket IDs for the original coverage requirement.
- [ ] **Optional**: add a negative case for `order(number:)` (bad input + unauthorized number).
- [ ] **When fix lands**: re-run `npx tsx scripts/graphql-runner.ts --case regression/suites/Backend/graphql/050c-graphql-xorder.csv:ORD-GQL-013` to confirm green path.

## Artifacts

- Findings detail: `reports/test-lifecycle/TLC-2026-05-16-0106/review-findings.md`
- Machine-readable summary: `reports/test-lifecycle/TLC-2026-05-16-0106/phase4-result.json`
- This report: `reports/test-lifecycle/TLC-2026-05-16-0106/lifecycle-report.md`
- Refreshed schema (Phase 0 pre-flight): `.claude/agents/knowledge/graphql-schema.md`
- Related regression evidence: `reports/regression/REG-20260516-0101/050c/`
