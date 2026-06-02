# Phase 4 Review Findings — Suite 050c (GraphQL xOrder)

**Run ID:** TLC-2026-05-16-0106  
**Date:** 2026-05-16  
**Cases reviewed:** ORD-GQL-011, ORD-GQL-012, ORD-GQL-013  
**Schema snapshot:** `graphql-schema.md` (refreshed 2026-05-15, 86 queries / 134 mutations / 36 types)  
**Review criteria source:** `.claude/skills/testing/qa-review-tests/review-criteria.md`

---

## 1. Per-Case Findings Table

| Case | Dimension | Severity | Criterion | Issue | Fix Action |
|------|-----------|----------|-----------|-------|-----------|
| ORD-GQL-011 | D6: BL/ECL | High | REQ-001 | `References` contains only `xAPI; graphql-schema.md — …` — no JIRA ticket or REQ-* ID. Priority = Critical requires a source-of-demand link. | Manual: add JIRA ticket (e.g., sprint story or infra baseline ref). Proposed: `References: xAPI; graphql-schema.md — CustomerOrderType, MoneyType, CurrencyType; xapi-regression-baseline` as interim placeholder. |
| ORD-GQL-012 | D6: BL/ECL | High | REQ-001 | Same issue — `References` has no JIRA/REQ-* ID. Priority = Critical. | Same as above. |
| ORD-GQL-013 | D6: BL/ECL | High | REQ-001 | Same issue — `References` has no JIRA/REQ-* ID. Priority = High. | Same as above. |
_(No Low findings — Cleanup column correctly populated as `none — pure read` in all three cases.)_
| ORD-GQL-013 | D9: Technique | Medium | TC-001 | Suite has only one positive query case per `GraphQL > xOrder` section; no negative case (e.g., `order(number: "INVALID")` → errors[] non-empty). However, the `GraphQL > xOrder > Schema Coverage` sub-section has only 1 case — exempt from TC-001 per the <3-case rule. Cross-suite coverage: XCC-GQL-016 in 050g covers unauthorized-orders gate (BL-GQL-004). | Informational — no action required given cross-suite coverage. Track as future enhancement. |

**Dimension 1 (Structure):** PASS — header row correct, IDs unique and well-formed (`ORD-GQL-0NN`), no CSV parsing errors, all required columns populated.

**Dimension 2 (Determinism):** PASS — all Steps use runner-native tags (`[AUTH]`, `[GQL-OP]`, `[GQL-EXEC]`, `[GQL-CAPTURE]`). Labels are consistent across OP/EXEC/CAPTURE/Assertions. `[ROUNDTRIP]` and `[MATH]` used correctly as info-only tags (§4.7). No browser-mode tags present in a runner-native suite.

**Dimension 3 (Completeness):** PASS — all three cases have `Cleanup: none — pure read` (correct for read-only queries). All three cases have `[ERRORS label=…] errors[] empty` on every GQL-EXEC. Preconditions fully describe required state. Failure_Signals are specific and informative. `[ROUNDTRIP]` cross-layer checks present as info markers.

**Dimension 4 (Testability):** PASS — all verdict-critical assertions use specific `[ERRORS]`/`[DATA]`/`[COUNT]` predicates with concrete path + predicate shapes. No vague "response is correct" language. `[ROUNDTRIP]` and `[MATH]` in Assertions correctly classified as info-only. The `[ERRORS label=order_full] errors[] empty — every CustomerOrderType field…` assertion in ORD-GQL-013 is the correct machine-evaluable predicate; the descriptive comment after `empty` is prose only (runner reads the predicate form `errors[] empty`).

**Dimension 5 (Data Validity):**

Schema validation results:

| Query | Operation | Schema status |
|-------|-----------|---------------|
| ORD-GQL-011 | `orders(first: 10, sort: …)` | VALID — `orders` query exists with `first`/`sort` args; `CustomerOrderType` fields `id number status createdDate total` confirmed; `MoneyType { amount currency { code } }` confirmed |
| ORD-GQL-012 | `orders(first: 1)` + `order(number: …)` | VALID — `order` query args `id/number/cultureName` confirmed; all selected fields on `CustomerOrderType` confirmed; `MoneyType` structure correct; `inPayments { paymentMethod { code paymentMethodType } }` confirmed (passes in live run) |
| ORD-GQL-013 | Full `order(number: …)` coverage | VALID per schema introspection — `CustomerOrderType.coupons` present in schema; `CurrencyType.name` present in schema (fields: `name, code, symbol, exchangeRate, customFormatting, englishName, cultureName`). Both fields listed in `graphql-schema.md` type definition. Resolver bugs are a **production defect**, not a schema-authoring error. No DV-009 violation. |

No DV-006, DV-007, DV-008, DV-009, DV-010, DV-011, DV-012, DV-013, DV-014, DV-015, DV-016, or DV-017 violations found.

`{{ORDER_NUMBER}}` is captured at runtime via `[GQL-CAPTURE]` — no hardcoded order numbers. `[AUTH role=ORG_USER]` used throughout — no hardcoded credentials. All URLs use `{{BACK_URL}}` (implicit via runner auth endpoint). No hardcoded entity IDs.

DV-012 (thin field selection): ORD-GQL-011's `list_first` sub-query `orders(first: 1) { items { number } }` is a discovery/capture-only probe — it exists only to capture `ORDER_NUMBER` for the subsequent `order_full` query. This is an explicit permitted exception (per DV-012 criterion 2: "Cross-layer roundtrip querying only the fields needed to match a prior write / capture"). No violation.

**Dimension 6 (BL/ECL):**

| Invariant | Referenced by | Status |
|-----------|---------------|--------|
| BL-GQL-002 (query performance thresholds) | All 3 cases | Referenced; no `[PERF]` assertion present in any case. Low priority — 050g XCC-GQL-018 owns perf testing for orders queries. Medium gap only. |
| BL-GQL-004 (resolver auth gating) | All 3 cases | Referenced; ORD-GQL-011 and ORD-GQL-012 exercise authenticated access (positive side). Negative auth gate covered in 050g XCC-GQL-016. Coverage adequate via cross-suite complementarity. |
| ECL-2.1 (race conditions / stale state) | All 3 cases | Referenced; read-only queries are appropriately used as schema integrity probes, not race-condition tests. |

REQ-001 gap (no JIRA ticket) noted above — High finding, manual fix required.

BL-GQL-001 (error contract): NOT referenced in Business_Rule. ORD-GQL-013 implicitly tests BL-GQL-001 by expecting `errors[] empty` across all fields — however, the live failures for `coupons` and `currency.name` are precisely the BL-GQL-001 violation signal (resolver throws → errors[] non-empty). Consider adding `BL-GQL-001` to the Business_Rule column of ORD-GQL-013. Low/Medium finding — not auto-applied (editorial judgment needed).

**Dimension 7 (Duplication):**

Cross-suite analysis against 050a, 050b1–b4, 050d, 050g, 050i, 050j, 050k:

- 050g (XCC-GQL-015–018): covers error contract, auth gating, and performance for `orders(first:3)` and `orders(first:10)` — these are shallow queries selecting only `totalCount`/`id`/`number`/`status`. ORD-GQL-011 selects a broader field set including `total { amount currency { code } }`. No duplication — complementary depth.
- 050b4 (CRX-GQL-013/024/025/053/054/055): covers `createOrderFromCart` mutation in xOrder domain. None of these cases issue `order(number:…)` detail queries or full schema-coverage probes. No duplication.
- ORD-GQL-011 vs ORD-GQL-012: The `list_first` sub-query in ORD-GQL-012 and ORD-GQL-013 (`orders(first:1) { items { number } }`) is a minimal discovery query, not a duplicate of ORD-GQL-011's list assertion. DUP-001 does NOT apply — different purpose (list-and-assert vs. capture-only).
- ORD-GQL-012 vs ORD-GQL-013: share the same `list_first` + `order(number:…)` skeleton, but ORD-GQL-012 selects an operational subset (useful working fields), while ORD-GQL-013 selects the complete type surface. This is the intended schema-canary / operational-coverage split — NOT a duplicate (different scenarios at different abstraction levels).

DUP classification: all cross-suite overlaps are DUP-003 (different layers / different depths) — Informational only.

---

## 2. Auto-Fix Application

No auto-fixes applied. The Cleanup column was already correctly populated (`none — pure read`) across all three cases. CSV is unchanged.

`filesModified: []`

---

## 3. ORD-GQL-013 Decision — Option A vs B vs C

**Recommendation: Option A — Keep as-is. File JIRA.**

Rationale:

1. **The test design is correct.** ORD-GQL-013 selects every `CustomerOrderType` field listed in `graphql-schema.md`. Both `CustomerOrderType.coupons` and `CurrencyType.name` appear in the live introspected schema. The test is not wrong — it found a production bug.

2. **The failure mode is exactly what the test was designed to catch.** Schema-coverage probes exist to surface resolver drift. Two resolvers throw `INVALID_OPERATION` at runtime despite being present in the schema. This is the signal ORD-GQL-013 was built to emit.

3. **Option B (split) defers the bug.** A split would create a "green path" case that deliberately avoids the broken fields and a separate "known-fail" case. The "known-fail" label fades into the noise — schema-canary tests that are permanently red get disabled or skipped over time.

4. **Option C (remove fields) hides the bug entirely.** Excluded.

5. **Action required:** File a JIRA bug for both resolver failures:
   - Bug 1: `CustomerOrderType.coupons` resolver throws `INVALID_OPERATION` (path: `order.coupons`)
   - Bug 2: `CurrencyType.name` resolver throws `INVALID_OPERATION` (path: `order.currency.name`)
   Both are exposed consistently across two regression runs (REG-20260515-1438 and REG-20260516-0101).

---

## 4. Manual Action Items

| Priority | Case | Item |
|----------|------|------|
| High | ORD-GQL-011 | Add JIRA ticket or `xapi-regression-baseline` to `References` (REQ-001) |
| High | ORD-GQL-012 | Same — add JIRA/REQ to `References` (REQ-001) |
| High | ORD-GQL-013 | Same — add JIRA/REQ to `References` (REQ-001) |
| High | ORD-GQL-013 | File JIRA bug: `CustomerOrderType.coupons` resolver `INVALID_OPERATION` |
| High | ORD-GQL-013 | File JIRA bug: `CurrencyType.name` resolver `INVALID_OPERATION` |
| Medium | ORD-GQL-013 | Consider adding `BL-GQL-001` to `Business_Rule` (BL-001 gap) |
| Low | Suite 050c | Consider adding a negative case: `order(number: "INVALID-XXXX")` → errors[] non-empty (TC-001 informational) |

---

## 5. Gate Assessment

| Gate | Criterion | Result | Notes |
|------|-----------|--------|-------|
| G1 — Structure | No Blockers | PASS | Header, IDs, CSV format all valid |
| G2 — Determinism | No step-tag issues | PASS | Runner-native tags throughout; label pairing correct |
| G3 — Completeness | No Critical gaps | PASS | Cleanup correctly populated; all ERRORS checks present |
| G4 — Testability | Assertions are falsifiable | PASS | All predicates machine-evaluable |
| G5 — Data Validity | No Blocker/Critical DV findings | PASS | Schema fields validated; no hardcoded IDs; runtime capture used |
| G6 — BL/ECL | No uncovered Critical invariants | PASS | REQ-001 is High (not Critical/Blocker); BL-GQL-002/004 covered |
| G7 — Duplication | No Critical duplication | PASS | Cross-suite overlaps are complementary (DUP-003 Informational) |
| G8 — Env Verify | Phase 5 skipped | N/A | `--skip-verify` flag |
| G9 — Generate | Phase 3 skipped | N/A | `--skip-generate` flag |

**Overall verdict: PASS WITH WARNINGS**
- Zero Blockers
- Zero Criticals
- 3 Highs (all REQ-001 — same pattern, manual fix: add JIRA ticket to References)
- 1 Medium (TC-001 — negative case suggestion, informational)
- 3 Lows (C-007 — auto-fixed)
