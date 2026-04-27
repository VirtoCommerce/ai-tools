# TLC-2026-04-27-1700 — Phase 3 & 4 Summary
**Suite:** 050j — GraphQL xMarketing (promotionCoupons)
**Date:** 2026-04-27
**Cases analyzed:** 13 (MKT-GQL-001 through MKT-GQL-013)
**Module version:** VirtoCommerce.MarketingExperienceApi 3.1001.0
**Live verification:** 2026-04-27, B2B-store, vcst-qa environment

---

## Overall Verdict: PASS WITH WARNINGS

| Category | Count |
|----------|-------|
| Blockers | 0 |
| Criticals | 0 |
| High | 5 (2 auto-fixed) |
| Medium | 6 |
| Auto-fixes applied | 5 |
| MUST-FIX manual items | 2 |
| SHOULD-FIX manual items | 4 |
| Phase 3 gaps (NEW_NEEDED) | 4 (P1) + 1 (P2) |

The suite is **conditionally regression-eligible** pending the 2 MUST-FIX items below.

---

## Phase 3 — Coverage Gap Matrix

| Gap ID | Title | Priority | Recommendation | Notes |
|--------|-------|----------|---------------|-------|
| GAP-001 | Cursor pagination via `pageInfo.endCursor` | P1 | NEW_NEEDED | MKT-GQL-006 uses numeric offset strings; cursor pagination is untested |
| GAP-002 | `edges[].node` / `edges[].cursor` selection | P2 | DEFER | Low business value; consumers use `items[]` |
| GAP-003 | `keyword` filter argument | P1 | NEW_NEEDED | No test exercises keyword filtering |
| GAP-004 | `sort` argument | P2 | NEW_NEEDED | One positive case needed |
| GAP-005 | `currencyCode` argument | P2 | DEFER | Live data shows no effect; resolver likely currency-agnostic |
| GAP-006 | `userId` argument scoping | P1 | NEW_NEEDED | Personalized coupon visibility contract untested |
| GAP-007 | Coupon usage count exhaustion | P2 | DEFER | Requires Admin state manipulation; defer to marketing sprint |
| GAP-008 | Expired coupon exclusion (`endDate` past) | P1 | NEW_NEEDED | ECL-1.3 pattern; needs a past-endDate promotion in QA |
| GAP-009 | E2E coupon case-sensitivity | P1 | DEFER | Covered by 077 CPN-005; would be DUP-002 |
| GAP-010 | MKT-GQL-005 dual error-code assertion | P2 | DEFER | Runner design is intentional |

**New cases to generate (pending orchestrator approval):**
- MKT-GQL-014: Cursor pagination via `pageInfo.endCursor` (P1)
- MKT-GQL-015: `keyword` filter — matching promotions returned (P1)
- MKT-GQL-016: `sort` argument — result order changes (P2)
- MKT-GQL-017: `userId` argument — personalized coupon scoping (P1)
- MKT-GQL-018: Expired promotion exclusion (P1)

---

## Phase 4 — Findings by Dimension

### Dimension 1: Structure — PASS

All 13 cases have correct CSV format, valid IDs (MKT-GQL-NNN), valid Priority values, and all 15 columns populated. No parsing errors.

### Dimension 2: Determinism

| Finding | Severity | Case | Auto-Fixed |
|---------|----------|------|-----------|
| FIND-D-001: Title claimed DataLoader N+1 but test runs sequential queries | High | MKT-GQL-013 | YES |
| FIND-D-002: Preconditions didn't clarify offset vs cursor pagination | High | MKT-GQL-006 | YES |
| FIND-D-003: [MANUAL] step asks operator to find promotion by GUID (not name) | Medium | MKT-GQL-009 | NO |

### Dimension 3: Completeness

| Finding | Severity | Case | Auto-Fixed |
|---------|----------|------|-----------|
| FIND-C-001: POST_TOTAL decrement check is EVIDENCE-only, not automated assertion | High | MKT-GQL-009 | NO |
| FIND-C-002: Introspection test doesn't assert `promotionCoupons` field is present | Medium | MKT-GQL-002 | NO |
| FIND-C-003: Preconditions require complex state not referenced in seed data | Medium | MKT-GQL-007 | NO |

### Dimension 4: Testability

| Finding | Severity | Case | Auto-Fixed |
|---------|----------|------|-----------|
| FIND-T-001: 'null or fallback' predicate is unfalsifiable | High | MKT-GQL-008 | YES |
| FIND-T-002: `totalCount >= 0` assertion is trivially true (always passes) | Medium | MKT-GQL-011 | YES |

### Dimension 5: Data Validity

| Finding | Severity | Case | Auto-Fixed |
|---------|----------|------|-----------|
| FIND-DV-001: BL-GQL-* IDs not defined in business-logic.md (all 13 cases) | Medium | ALL | NO |
| FIND-DV-002: `fc596540...` hardcoded GUID — allowed exception (env constant) | Informational | MKT-GQL-010 | N/A |
| FIND-DV-003: `STORE_DOES_NOT_EXIST` literal — allowed exception (test value) | Informational | MKT-GQL-004 | N/A |
| FIND-DV-004: Magic numbers `after:'0'`/`after:'2'` lack justification | High | MKT-GQL-006 | NO |

### Dimension 6: BL/ECL Coverage

| Finding | Severity | Case | Auto-Fixed |
|---------|----------|------|-----------|
| FIND-BL-001: BL-GQL-* not in business-logic.md (mirrors FIND-DV-001) | Medium | ALL | NO |
| FIND-BL-002: BL-AUTH-005 (RBAC) is approximate semantic fit for auth gating | Medium | 3 cases | NO |
| FIND-BL-003: BL-PRICE-001 for filter correctness — acceptable cross-domain ref | Informational | MKT-GQL-007/009 | N/A |
| FIND-BL-004: ECL-2.1 (race conditions) irrelevant to anonymous auth gate test | Medium | MKT-GQL-003 | NO |

### Dimension 7: Duplication

All 4 duplication findings are **informational only** — expected cross-layer coverage between 050j and 050g/077:

- MKT-GQL-010 vs 077 CPN-005: Same E2E flow, different layers (GraphQL runner vs storefront UI) — DUP-003
- MKT-GQL-003 vs 050g GQL-016: Same auth pattern, different resolvers — DUP-003
- MKT-GQL-011 vs 050g GQL-015: Same error-schema pattern, different types — DUP-003
- MKT-GQL-012 vs 050g GQL-018: Domain-specific vs cross-cutting performance — DUP-003

No action required on any duplication finding.

---

## Auto-Fixes Applied (5 total)

| Case | Fix Summary |
|------|-------------|
| MKT-GQL-011 | `>= 0` → `>= 1` on totalCount assertion; clarified `large_first` errors[] description to match live behavior |
| MKT-GQL-008 | Replaced unfalsifiable 'null or fallback' EVIDENCE predicate with structural invariant |
| MKT-GQL-006 | Added Preconditions note clarifying offset strings vs cursor values; cross-references GAP-001 |
| MKT-GQL-013 | Renamed Title from DataLoader N+1 to Response-Time Consistency; updated Preconditions to accurately describe test scope |

---

## Must-Fix vs Should-Fix Prioritization

### MUST-FIX (gate for Draft → Reviewed promotion)

**1. FIND-C-001 — MKT-GQL-009: Core invariant not in Assertions column**
The deactivate cross-layer test's main assertion (`POST_TOTAL = BASELINE_TOTAL - 1`) lives only in Cross_Layer_Checks as a runner-manual EVIDENCE note. An automated runner will not evaluate this. The test's primary value — verifying Admin deactivation removes the promotion from the API response — is not automatically executable.

Suggested fix:
```
Add to Assertions column:
[COUNT label=after_deactivate] data.promotionCoupons.totalCount = {{BASELINE_TOTAL}} - 1 — deactivated promotion reduces count by 1
[DATA label=after_deactivate] items[].id list does NOT contain {{DEACTIVATED_ID}} — deactivated promotion excluded
```

**2. FIND-DV-001 / FIND-BL-001 — ALL cases: BL-GQL-* not in business-logic.md**
Thirteen cases reference BL-GQL-001, BL-GQL-002, BL-GQL-004 which do not exist in the canonical invariant registry. This is a systematic issue across the entire 050* GraphQL suite family. The fix is to promote these as formal invariants.

Proposed entries for qa-lead-orchestrator approval:
- `BL-GQL-001 [P1-data]`: GraphQL schema contract — all query/mutation names and field selections must match the live schema (DV-006/DV-009). Violation: schema field removed without deprecation.
- `BL-GQL-002 [P1-data]`: Connection/pagination stability — `totalCount` is consistent across pages; no N+1 resolver behavior; pagination args honor first/after contract. Violation: totalCount fluctuates between sequential identical queries.
- `BL-GQL-004 [P1-data]`: Resolver auth gating — protected queries (orders, promotionCoupons, etc.) return `errors[].extensions.code = "Unauthorized"` with `data.field = null` for anonymous callers; HTTP status remains 200. Violation: protected query returns data without auth; hard-gate bypassed.

### SHOULD-FIX (before first regression run execution)

| Priority | Case | Issue |
|----------|------|-------|
| SHOULD-FIX | MKT-GQL-009 | Add `[GQL-CAPTURE]` for `systemName` to aid operator lookup in [MANUAL] step |
| SHOULD-FIX | MKT-GQL-002 | Add automated `[DATA]` assertion that `promotionCoupons` field exists in introspection |
| SHOULD-FIX | MKT-GQL-007 | Reference seed data command in Preconditions for complex environment state |
| SHOULD-FIX | MKT-GQL-003 | Remove ECL-2.1 from Edge_Case_Refs (not relevant to auth gate test) |
| NICE-TO-HAVE | MKT-GQL-006 | Add inline comment explaining magic numbers `after:'0'`/`after:'2'` |

---

## Manifest Consistency Check

The `config/test-suites.json` entry for 050j is consistent:
- `id`: "050j" — correct
- `name`: "GraphQL xMarketing (promotionCoupons)" — correct
- `file`: "regression/suites/Backend/graphql/050j-graphql-xmarketing.csv" — correct
- `testCount`: 13 — correct (matches CSV row count)
- `priority`: "P1" — appropriate for a module-specific GraphQL suite
- `tags`: ["graphql", "xapi", "xmarketing", "promotion-coupons", "marketing", "sprint"] — correct
- `agent`: "qa-backend-expert" — correct for GraphQL runner-native cases

No manifest changes required.

---

## Files Modified

- `regression/suites/Backend/graphql/050j-graphql-xmarketing.csv` — 5 auto-fixes applied (MKT-GQL-006 Preconditions, MKT-GQL-008 EVIDENCE assertion, MKT-GQL-011 Assertions x2, MKT-GQL-013 Title + Preconditions)

---

## Delegation Recommendations

| Item | Assignee | Action |
|------|----------|--------|
| MUST-FIX items | test-management-specialist | Apply before promotion |
| BL-GQL-* promotion | qa-lead-orchestrator | Approve PROPOSED-BL-GQL-001/002/004 |
| GAP-001/003/006/008 new cases | test-management-specialist | Generate MKT-GQL-014 through MKT-GQL-018 after orchestrator approval |
| GAP-004 (sort) new case | test-management-specialist | Generate MKT-GQL-016 (P2 — can defer to next sprint) |
| ENV verification (--verify) | qa-testing-expert | Validate MKT-GQL-007 precondition state exists in QA |
