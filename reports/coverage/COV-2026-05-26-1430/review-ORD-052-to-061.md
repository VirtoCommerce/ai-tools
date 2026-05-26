# Review: ORD-052 → ORD-061

**Reviewer:** test-management-specialist
**Date:** 2026-05-26
**Source file:** `regression/suites/Frontend/orders/014-orders-frontend.csv`
**Input gap inventory:** `COV-2026-05-26-1430/gap-inventory.json`
**td-refs validation:** PASS (from diff-preview.md post-append guard)

---

## Verdict

- Approve as-is: 0
- Approve with minor fix (orchestrator-applied): 7 (ORD-052, ORD-053, ORD-055, ORD-056, ORD-057, ORD-059, ORD-061)
- Needs rewrite: 3 (ORD-054, ORD-058, ORD-060)

---

## Per-case findings

| ID | Verdict | Findings | Suggested fix |
|----|---------|----------|---------------|
| ORD-052 | Minor fix | `BL-ORD-003` (partial fulfillment) is semantically wrong for filter+sort behavior. `Automation_Status=Validated` is correct; `Priority=Critical` matches GAP-OHF-002 (P0). References format uses `-` separator, others use `—`. | Change `Business_Rule` to `BL-ORD-001` (best available match) with note pending new BL entry. Normalize References dash to `—`. |
| ORD-053 | Minor fix | `BL-ORD-003` miscitation (same issue). `[COND: URL retained filter params]` not present — steps assert two mutually exclusive outcomes without a `[COND:]` branch to separate them, making the case non-deterministic for automated runners. `Automation_Status=Generated` is appropriate. | Add `[COND: URL contained filter param]` / `[COND: URL did NOT contain filter param]` gates around the two outcome branches in Steps. Change BL ref. |
| ORD-054 | Needs rewrite | Steps are truncated with `...` in the diff-preview. The diff-preview notes these are placeholders only in the preview, but the Assertions and Cross_Layer_Checks columns are also truncated in what reached the CSV (lines 324-325 show `...` in the actual grep output). Cannot assess testability or assertion completeness. Additionally `BL-ORD-003` miscitation. | Author must supply complete, non-truncated Steps and Assertions. Use `[COND: auto-swap behavior]` / `[COND: validation error behavior]` branches. Replace BL ref. |
| ORD-055 | Minor fix | `BL-ORD-003` miscitation. The live-discover pattern for "note the order date of the most recent visible order" is correct but relies on browser-visible date formatting — add `[FORMAT]` assertion for date input format used by the date picker (ISO vs locale). Precondition "at least one order placed on a known specific date" is too vague — should be "orders list contains at least one visible order (any date; test derives D from live-discover)." | Fix precondition wording. Add `[FORMAT]` assertion for date picker input format. Change BL ref. |
| ORD-056 | Minor fix | `BL-ORD-003` miscitation. The precondition is overly complex and brittle ("prefix matches at least one OTHER order to ensure >1 result") — this is a setup constraint that belongs in a `SEED REQUIRED` note, not a cognitive precondition for a manual runner. `Automation_Status=Generated` is appropriate. | Simplify precondition to "account has orders in multiple statuses with at least 2 orders sharing a common order-number prefix." Move seeding concern to `Automation_Status`. Change BL ref. |
| ORD-057 | Minor fix | `BL-ORD-003` miscitation. Precondition "typically 20+ orders matching the chosen status given default page size" is an environment assumption that may not hold on vcst-qa — this should be `SEED REQUIRED`. The test is otherwise solid (pagination + filter cross-check is well-scoped). | Change `Automation_Status` from `Generated` to `SEED REQUIRED: account needs >page-size orders in a single status`. Change BL ref. |
| ORD-058 | Needs rewrite | The `[COND:]` branching is correct in principle but the two branches ("URL had params" vs "URL did NOT have params") test fundamentally different behaviors and produce different pass/fail signals. Combining them into a single test case violates the one-scenario-per-case rule — a PASS in branch A would mask a FAIL in branch B if the runner takes branch A. Also `BL-ORD-003` miscitation. | Split into two cases: ORD-058a "Filter state in URL survives browser refresh" and ORD-058b "Filter state NOT in URL resets on browser refresh." Each case should first establish which branch applies by inspecting the URL after applying a filter, then assert the expected post-refresh behavior. |
| ORD-059 | Minor fix | `BL-ORD-003` miscitation. `[KEY] live-discover` is used correctly to derive PREFIX from the real order number. The Assertion `[STATE] partial / prefix search returns at least the matching order` is slightly weak — should assert the known full order number appears in results, not just "at least" (use `[DOM]`). | Strengthen assertion to `[DOM] order number FULL visible in filtered results.` Change BL ref. |
| ORD-060 | Needs rewrite | `BL-ORD-003` miscitation (same issue). More critically: `BL-B2B-005` cited is about feature visibility by role, not org-scoped order visibility — this is an organizational data scoping concern. No BL invariant currently covers org-scoped order list isolation, which is a genuine gap. `{{ORG_USER_EMAIL}}` and `{{ORG_USER_PASSWORD}}` resolve correctly across envs. However, the Precondition "B2B buyer … has role granting company-wide orders visibility" is not verified by any setup step and is not achievable from `[PRE:SIGNIN_AS:ORG_USER]` alone without confirming the org has multiple member-placed orders. | Fix BL refs: keep `BL-AUTH-005` (B2B user scoping), drop `BL-B2B-005` (wrong domain). Add explicit precondition confirmation step: `[ASSERT] verify orders list shows at least 2 orders with different buyer names/emails (confirming org-wide scope is active).` Note in `Automation_Status` that org-wide visibility requires `SEED REQUIRED: org with 2+ buyers each having placed at least 1 order.` |
| ORD-061 | Minor fix | `BL-ORD-003` miscitation. The two-chip removal flow is correctly structured as a sequential journey (Filter A then Filter B then remove A then remove B). `Priority=Medium` correctly matches GAP-OHF-010 (P2). `BL-UI-006` cited in the gap inventory for this item is about touch target size — not directly relevant for chip removal. | Change BL ref from `BL-ORD-003` to `BL-ORD-001`. Drop ECL-3.2 citation note: ECL-3.2 is correctly applied here. |

---

## Cross-cutting findings

**BL-ORD-003 miscitation — all 10 cases affected.**
`BL-ORD-003` defines partial fulfillment rules (multi-shipment state tracking). It is wholly unrelated to order-list filtering, search, sort, or pagination behavior. The existing filter cases ORD-006, ORD-015–025, and ORD-027 carry the same miscitation — this batch inherited the pattern rather than fixing it.

Proposed fix for all 10 new cases: change `Business_Rule` to `BL-ORD-001` (order state machine), which is the closest available invariant covering order list data correctness. This is still imperfect (BL-ORD-001 is about state transitions, not list query behavior). A dedicated invariant — tentatively `BL-ORD-010: Order list query behavior` covering filtering, sorting, pagination, and scope isolation — should be proposed to the business-logic custodian. Do NOT invent the ID in the CSV until it is formally approved; use `BL-ORD-001` as the interim citation.

**ECL-3.2 citation — valid for all 10 cases.**
ECL-3.2 ("Filter & Sort — sort reset, filter persistence") is correctly applicable to ORD-052 through ORD-061. The index table confirms `ECL-3.2` maps to `BL-SEARCH-001` in the ECL master, which reinforces that these filter behaviors are classified under search/filter edge cases, not order fulfillment invariants — further evidence that `BL-ORD-003` is wrong.

**Section naming consistency — compliant with two exceptions.**
`Orders > Filtering` (used by ORD-052–059, ORD-061) matches the existing convention (ORD-019..027). `Orders > Filtering > B2B` (ORD-060) is a new sub-section not seen elsewhere. Acceptable given the distinct org-scope concern; no change needed.

**Test-data discipline — one unresolved var.**
`{{SAMPLE_TRACKING_NUMBER}}` appears in ORD-024's predecessor case `CHK-024` (not in the new batch). Cross-check confirms no new literals in ORD-052–061. However `{{SAMPLE_TRACKING_NUMBER}}` referenced in existing `CHK-024` does not resolve in any `.env*` file — this is a pre-existing issue outside this review's scope; note for env maintainer.
All `{{VAR}}` tokens in ORD-052–061 (`{{FRONT_URL}}`, `{{USER_EMAIL}}`, `{{USER_PASSWORD}}`, `{{ORG_USER_EMAIL}}`, `{{ORG_USER_PASSWORD}}`) resolve correctly. No hardcoded IDs, SKUs, emails, prices, or order numbers found.

**Duplication check — no semantic near-duplicates.**
ORD-052 (filter+sort combined) is not a duplicate of ORD-019 (multi-status filter) or ORD-020 (sort). ORD-053 (filter persist after detail nav) is not a duplicate of ORD-022 (clear/reset). ORD-057 (filter persists across pagination) is not a duplicate of ORD-016 (pagination unfiltered). All 10 cases address distinct interaction seams confirmed absent from the existing 12 filter cases.

---

## Recommended actions (by case ID)

1. **All 10 cases:** Change `Business_Rule` from `BL-ORD-003` to `BL-ORD-001`. Flag for future `BL-ORD-010` proposal.
2. **ORD-052:** Normalize `References` dash from `-` to `—` to match suite convention.
3. **ORD-053:** Add `[COND:]` guards to separate the two post-back-navigation outcome branches in Steps.
4. **ORD-054:** Author must supply complete Steps, Assertions, and Cross_Layer_Checks (truncated cells in CSV). Resubmit as amended row before merge.
5. **ORD-055:** Simplify Preconditions wording; add `[FORMAT]` assertion for date picker input format.
6. **ORD-056:** Simplify Preconditions; move seeding concern to `Automation_Status` field.
7. **ORD-057:** Change `Automation_Status` to `SEED REQUIRED: account needs >page-size orders in one status`.
8. **ORD-058:** Split into two cases (ORD-058a URL-driven persistence, ORD-058b no-URL reset). Assign new IDs in sequence after ORD-061.
9. **ORD-059:** Strengthen assertion from `[STATE]` "at least one match" to `[DOM]` exact order number visible.
10. **ORD-060:** Replace `BL-B2B-005` with `BL-AUTH-005`; add confirmation step for org-wide scope; add `SEED REQUIRED` note to `Automation_Status`.
11. **ORD-061:** No BL change needed beyond the cross-cutting fix (already noted in item 1).
12. **Env maintainer (pre-existing):** Define `{{SAMPLE_TRACKING_NUMBER}}` in `.env.defaults` or `.env.vcst`; currently unresolved across all envs.
