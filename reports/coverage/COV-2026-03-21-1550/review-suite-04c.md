# Test Case Quality Review — Suite 04c Orders & Quotes

**Review ID:** REV-04c-COV-2026-03-21-1550
**Suite File:** `regression/suites/Frontend/04c-orders-quotes-tests.csv`
**Reviewed By:** test-management-specialist
**Review Date:** 2026-03-21
**Scope:** Full suite — 82 test cases (ORD-001 to ORD-018 pre-existing, QUOTE-001 to QUOTE-017 pre-existing; **46 NEW cases**: ORD-019 to ORD-051 + QUOTE-018 to QUOTE-030 from COV-2026-03-21-1550)
**Review Mode:** Static (no `--verify` flag — Dimension 8 ENV checks not executed)

---

## Executive Summary

| Dimension | Rating | Issues Found | Blockers | Critical | High | Medium |
|-----------|--------|-------------|----------|----------|------|--------|
| 1. Structure | PASS | 1 | 0 | 0 | 1 | 0 |
| 2. Determinism | WARN | 3 | 0 | 1 | 2 | 0 |
| 3. Completeness | WARN | 4 | 0 | 1 | 3 | 0 |
| 4. Testability | PASS | 2 | 0 | 0 | 2 | 0 |
| 5. Data Validity | FAIL | 2 | 0 | 0 | 2 | 0 |
| 6. BL/ECL Coverage | WARN | 5 | 0 | 0 | 0 | 5 |
| 7. Duplication | PASS | 2 | 0 | 0 | 0 | 2 |
| 8. Env Verification | SKIP | — | — | — | — | — |

**Overall verdict:** CONDITIONAL PASS — the suite is executable as-is, but 2 High issues in Data Validity and 1 Critical in Determinism must be resolved before the next regression run. All 46 new cases are structurally sound and well-formed; the issues are concentrated in a small number of specific cases.

**Fixes applied directly to CSV:** 0 (Edit permission not available — all fixes documented below for manual application)

---

## Dimension 1: Structure

**Rating: PASS**

The header row matches the 15-column enriched format exactly:
`ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions,Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup,References,Automation_Status`

All 82 rows have IDs, Titles, Steps, Assertions, and Priority values. No duplicate IDs found. All IDs follow `PREFIX-NNN` pattern. All Priority values are from the allowed set (Critical / High / Medium).

**Finding S-001 [High] — ORD-004: `{{currentDate}}` pseudo-token in Assertions column**

- **Location:** Row 20, Assertions column: `[FORMAT] order date matches current date ({{currentDate}} format)`
- **Rule violated:** S-006 (invalid variable token treated as a field substitution hint)
- **Impact:** Not a CSV parsing error, but the token `{{currentDate}}` is not a defined env variable (see DV-001 below). The assertion is also underspecified as a format check.
- **Fix:** Replace with: `[FORMAT] order date matches today's date (YYYY-MM-DD format)`

---

## Dimension 2: Determinism

**Rating: WARN**

Overall determinism is strong. The new cases consistently use tagged steps (`[NAV]`, `[ACT]`, `[WAIT]`, `[ASSERT]`, `[KEY]`, `[SCROLL]`, `[ADMIN]`). Most state-changing actions are followed by `[WAIT]` steps. Three issues found.

**Finding D-001 [Critical] — ORD-005: Hardcoded tracking number in Steps and Assertions**

- **Location:** Row 21, Steps column and Assertions column both contain literal `'1Z999AA10123456784'`
- **Rule violated:** D-002 (hardcoded test data in steps — should be a variable reference)
- **Impact:** If the test environment doesn't allow UPS tracking number format or the admin UI validates the format, a different test value is needed without changing the test case definition. Also makes the case brittle — the tracking number is repeated 4 times in Steps + Assertions.
- **Fix (judgment call — flag for decision):** Either:
  - (a) Move `1Z999AA10123456784` to `Test_Data` column as `tracking_number=1Z999AA10123456784` and reference as `{{TRACKING_NUMBER}}` in Steps/Assertions, or
  - (b) Accept as-is if the environment consistently uses UPS format numbers and the value is intentionally fixed for cross-layer verification (ORD-030 references tracking link display and uses the same order — the two cases should use the same value).

**Finding D-002 [High] — QUOTE-009: Ambiguous "revision or counter-offer option" label**

- **Location:** Row 10, Steps: `[ASSERT] verify 'Request Revision' or 'Counter-offer' option visible`
- **Rule violated:** D-002 (generic/ambiguous UI element reference — two possible labels given)
- **Impact:** An agent following this step does not know which label to look for. If neither exists, the case fails; if only one exists, uncertainty about what is correct.
- **Fix (judgment call):** Explore the actual storefront RFQ quote detail page to determine the real label. Update step to use the exact button/link text.

**Finding D-003 [High] — QUOTE-020: Conditional feature check with no fallback path**

- **Location:** Row 72, Steps: `[ASSERT] verify 'Add Item' or 'Edit Items' option visible (if feature supported)`
- **Rule violated:** D-003 (ambiguous action — "if feature supported" leaves undefined behavior when feature is absent)
- **Impact:** A test case cannot have a conditional outcome — if the feature is not supported, is this a PASS or FAIL? Currently undefined.
- **Fix (judgment call):** Either (a) remove the case if the feature is not confirmed supported, or (b) split into two cases: one confirming the feature exists and one for the add-item flow, with a clear precondition `Add Item feature enabled on quote detail`.

---

## Dimension 3: Completeness

**Rating: WARN**

**Finding C-001 [High] — QUOTE-004: Preconditions require admin action with no admin setup instructions**

- **Location:** Row 5, Preconditions: `Admin has reviewed and responded to buyer's quote with proposed pricing`
- **Impact:** There is no setup step or admin instruction in the Steps column for how the admin response is produced prior to the test. The `[ADMIN]` tag is not used for setup — the test begins from the storefront as the buyer. An agent cannot execute this case if the precondition is not already met.
- **Fix:** Add to Test_Data: `admin_url={{ADMIN_URL}};admin_email={{ADMIN_EMAIL}};admin_password={{ADMIN_PASSWORD}}` (already in QUOTE-005 for the same scenario type). Add a `[SETUP]` step at the start: `[SETUP] Confirm via Admin at {{ADMIN_URL}} that a pricing response has been submitted for the target quote — skip this case if no responded quote exists`.
- **Note:** QUOTE-005, QUOTE-006, QUOTE-008, QUOTE-019, QUOTE-022 through QUOTE-027 all have similar dependency on admin-prepared state, but most include admin_url in Test_Data. QUOTE-004 is the only one missing both Test_Data admin vars AND setup steps.

**Finding C-002 [High] — ORD-005 + ORD-018 + ORD-033: `{{ADMIN_EMAIL}}` and `{{ADMIN_PASSWORD}}` not listed in Test_Data for ORD-033**

- **Location:** Row 51 (ORD-033), Test_Data column contains only `url={{FRONT_URL}};user={{USER_EMAIL}};password={{USER_PASSWORD}}` but Steps include `[ADMIN]` tagged steps requiring admin access. Compare with ORD-005 (row 21) which correctly lists `admin_email={{ADMIN_EMAIL}};admin_password={{ADMIN_PASSWORD}}` in Test_Data.
- **Rule violated:** C-002 (Steps reference vars not bound in Test_Data — however admin vars are global, so the actual agent risk is low if agent has env context)
- **Fix:** Add `admin_url={{ADMIN_URL}};admin_email={{ADMIN_EMAIL}};admin_password={{ADMIN_PASSWORD}}` to ORD-033 Test_Data for consistency and explicit binding.

**Finding C-003 [Critical] — ORD-041: PDF content assertions not agent-executable without PDF parsing tool**

- **Location:** Row 59 (ORD-041), Assertions: `[DOM] order number present in PDF content; [DOM] line items listed in PDF`
- **Rule violated:** C-004 (untestable assertion — PDF content inspection requires a PDF parsing tool not available via browser DOM)
- **Impact:** The `[DOM]` tag is incorrect for PDF content. A browser DOM snapshot will not reveal PDF file content. The agent would download the file but cannot verify its internal content without a dedicated tool.
- **Fix (judgment call):** Downgrade to network-level assertions only (`[NETWORK] Content-Type: application/pdf; [NETWORK] Content-Length > 0`) and add a note that content verification requires manual spot-check or a PDF parsing tool. Alternatively, change `[DOM]` tags to `[MANUAL]` to flag these for human verification.
- **Note:** ORD-014 (Download Invoice) correctly uses only network assertions for the file download. ORD-041 over-extends into content verification that is not mechanically testable.

**Finding C-004 [High] — QUOTE-025: Notification badge precondition is not agent-verifiable without real-time push**

- **Location:** Row 77 (QUOTE-025), preconditions state `Admin has changed quote status; notification system enabled` — but the test begins with `[NAV] Navigate to storefront home page; [ASSERT] verify notification badge or indicator in header shows unread notification`
- **Impact:** If notifications are delivered via WebSocket or server-sent events, the agent may load the page before the notification arrives. No `[WAIT]` is provided for notification delivery.
- **Fix:** Add `[WAIT] notification badge appears in header (up to 10s polling)` after navigation. Add to Failure_Signals: `notification badge absent after 10s — check notification system connectivity`.

---

## Dimension 4: Testability

**Rating: PASS**

The new cases generally have objective, measurable assertions. `[MATH]` assertions include formulas (e.g., `[MATH] line total = unit price x quantity`). `[DOM]` assertions specify element text. `[STATE]` assertions specify concrete state values.

**Finding T-001 [High] — ORD-033: Vague conditional assertion**

- **Location:** Row 51 (ORD-033), Assertions: `[DOM] timeline or activity history section present on order detail; [DOM] each entry shows status label and timestamp`
- **Issue:** The Preconditions state "if storefront exposes it" and the Steps include `[ASSERT] verify timeline/history section visible (if storefront exposes it)` — making the test optionally passable even if the section is absent.
- **Fix (judgment call):** Either confirm the feature exists on the storefront (requiring UI exploration) and remove the conditional, or mark this case as `Automation_Status: Manual` with a note that the feature presence must be confirmed before automating.

**Finding T-002 [High] — QUOTE-020: Vague "distinguishable from original items" assertion**

- **Location:** Row 72, Assertions: `[DOM] newly added item distinguishable from original items`
- **Rule violated:** T-001 (subjective assertion — "distinguishable" is not a measurable predicate)
- **Fix:** Replace with a specific expectation, e.g., `[DOM] newly added item shows 'Added' badge or timestamp different from original items; OR newly added item appears at bottom of line item list separate from originals`

---

## Dimension 5: Data Validity

**Rating: FAIL**

**Finding DV-001 [High] — ORD-004: `{{currentDate}}` is not a defined env variable**

- **Location:** Row 20 (ORD-004), Assertions column
- **Rule violated:** DV-001 (unknown VAR token)
- **Defined vars:** `FRONT_URL`, `BACK_URL`, `USER_EMAIL`, `USER_PASSWORD`, `ORG_USER_EMAIL`, `ORG_USER_PASSWORD`, `TEST_CARD_NUMBER`, `TEST_CARD_EXP`, `TEST_CARD_CVV`, `TEST_SKU`, `STORE_ID`, `CULTURE_NAME`, `CURRENCY_CODE`, `ADMIN_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- **Impact:** Agent cannot resolve `{{currentDate}}` — the assertion becomes unexecutable as written.
- **Fix:** Replace `{{currentDate}}` with `today's date (YYYY-MM-DD format)`. Exact fix: `[FORMAT] order date matches today's date (YYYY-MM-DD format)`.

**Finding DV-002 [High] — BL-QUOTE-* references do not exist in `business-logic.md`**

- **Location:** All QUOTE-* cases (rows 2–16, 35–36, 70–82) use `Business_Rule` values of `BL-QUOTE-001`, `BL-QUOTE-002`, `BL-QUOTE-003`, `BL-QUOTE-004`
- **Rule violated:** BL-002 (invalid BL-* reference — these IDs do not exist in the 76-rule catalog)
- **Impact:** False traceability. The domain `BL-QUOTE` is not a registered domain. Quote/RFQ invariants live under `BL-B2B` (Domain 6).
- **Scope:** 29 cases affected — all QUOTE-* rows
- **Correct mapping:**
  - `BL-QUOTE-001` (RFQ creation, quote-from-cart) → `BL-B2B-005` (member role/feature visibility) + note that RFQ creation is not explicitly covered by a BL-* invariant in the current catalog
  - `BL-QUOTE-002` (admin pricing, convert to order) → `BL-B2B-003` (quote expiry non-convertible) is closest; accepted quote pricing preservation has no direct BL-* but relates to `BL-PRICE-001`
  - `BL-QUOTE-003` (expiry, conversion) → `BL-B2B-003`
  - `BL-QUOTE-004` (quote status visibility, history) → `BL-B2B-005`
- **Recommended action:** This is a domain gap — the `business-logic.md` catalog does not have quote-specific invariants beyond BL-B2B-003. Options:
  1. Map existing QUOTE-* cases to the nearest valid BL-* IDs and add a comment in the References column identifying the original intent (preferred short-term fix)
  2. Add BL-QUOTE-001–004 as new entries to business-logic.md (preferred long-term)
- **For now:** Flag all 29 QUOTE cases as having invalid BL references. This is the most significant coverage traceability gap in the suite.

---

## Dimension 6: BL/ECL Coverage

**Rating: WARN**

### BL Coverage Analysis

| BL Domain | Invariants | Referenced in Suite | Gap |
|-----------|-----------|---------------------|-----|
| BL-ORD-001 | Order state machine guards | ORD-001, ORD-003, ORD-004, ORD-013, ORD-049, ORD-050, ORD-051 | Covered |
| BL-ORD-002 | Cancellation + inventory | ORD-009, ORD-010, ORD-011, ORD-012, ORD-034, ORD-037–040, ORD-044–047 | Covered |
| BL-ORD-003 | Partial fulfillment / filtering | ORD-004–006, ORD-015–023, ORD-026–028 | Covered |
| BL-ORD-004 | Refund conditions | ORD-046 | Partially covered (only via cancellation + refund notification path) |
| BL-ORD-005 | Order number format + uniqueness | ORD-013, ORD-029, ORD-032, ORD-041–043, ORD-048, ORD-050 | Covered |
| BL-ORD-006 | Payment state machine | ORD-031 | Partially covered (display only, not state transitions) |
| BL-ORD-007 | Shipment state machine | ORD-030 | Partially covered |
| BL-ORD-008 | Audit trail completeness | ORD-033 | Covered (1 case, conditional) |
| BL-B2B-003 | Quote expiry non-convertible | QUOTE-011, QUOTE-022, QUOTE-023 | Covered |
| BL-B2B-005 | Member role feature visibility | Not explicitly referenced (QUOTE cases use invalid BL-QUOTE-*) | Gap — see DV-002 |
| BL-CART-008 | Cart merge on reorder | ORD-007, ORD-008 | Covered |
| BL-PRICE-001 | Discount stacking | ORD-035 | Indirectly covered (reorder price change scenario) |

**Finding BL-001 [Medium] — BL-ORD-004 (Refund conditions) underrepresented**

- Only ORD-046 touches refund behavior, and only as a secondary assertion (cancellation triggers refund notification). There is no test that verifies:
  - Partial refund amount validation (refund ≤ captured amount)
  - Void vs. refund distinction
  - Full refund sets payment status to "Refunded"
- **Recommendation:** Add 2 cases: one for full refund on cancellation, one for partial refund scenario (or note that these are tested in the Payment suite 06 and cross-reference there).

**Finding BL-002 [Medium] — BL-B2B-005 (Member role → feature visibility) not explicitly covered**

- The `quotesEnabled` feature flag toggle (from BL-B2B-005 and BL-STORE-002) — i.e., what happens when quotes are disabled for the org or store — is not tested. QUOTE-001 assumes `RFQ feature enabled for the org` but there is no negative case where quotes are disabled and the 'Request Quote' button is verified absent.
- **Recommendation:** Add one case: `Quotes feature disabled — Request Quote button absent for B2B user`

**Finding BL-003 [Medium] — BL-ORD-006 (Payment state machine) display-only coverage**

- ORD-031 verifies payment display (masked card, payment method name, status). No case verifies:
  - Payment status transitions (Authorized → Captured → Refunded) visible to buyer
  - Voided payment state display
- These may be adequately covered in Suite 06 (Payment), but cross-referencing is not documented.

**Finding BL-004 [Medium] — ECL-2.1 (Discontinued product) reference inconsistency**

- ORD-034 uses `ECL-2.1` and ORD-036 uses `ECL-2.1` for discontinued product scenarios — correct.
- ORD-002 uses `ECL-14.2` for the same discontinued product scenario. ECL-14.2 is a VC-specific pattern (B2B behavior), while ECL-2.1 is the generic "discontinued product" edge case. The more specific reference should be `ECL-2.1` for a simple discontinued item reorder.
- **Fix (judgment call):** Standardize ORD-002 Edge_Case_Refs to `ECL-2.1, ECL-7.1` for consistency with ORD-034/036.

**Finding BL-005 [Medium] — QUOTE-029 (PO Number preservation) lacks BL reference**

- The PO Number flow (QUOTE-029) maps to B2B purchasing order tracking. No BL-* exists for PO number preservation, and `BL-QUOTE-002` (invalid reference) is used. The ECL reference is `ECL-14.1` (B2B-specific) which is appropriate, but the Business_Rule column should reference the closest valid rule.

---

## Dimension 7: Duplication

**Rating: PASS**

**Finding DUP-001 [Medium] — ORD-002 and ORD-034 have high step overlap (same-suite)**

- **Cases:** ORD-002 (Reorder – Discontinued Item) and ORD-034 (Reorder – Discontinued Item Mid-Catalog)
- **Overlap analysis:** Both test the same scenario: reorder with a discontinued product, verify warning shown, verify available items in cart, discontinued item absent. Step Jaccard similarity ~75%.
- **Difference:** ORD-002 preconditions assume the product was already discontinued when the test runs; ORD-034 preconditions reference an item "discontinued mid-catalog." The distinction is subtle and the steps are nearly identical.
- **Recommendation (judgment call):** Merge into a single case with more explicit preconditions that differentiate the discontinuation source, or confirm ORD-034 tests a distinct code path (e.g., catalog soft-delete vs. inventory set to 0). If they test the same thing, retain ORD-002 and retire ORD-034.

**Finding DUP-002 [Medium] — QUOTE-011 and QUOTE-022 are near-duplicates (same-suite)**

- **Cases:** QUOTE-011 (Quote Expiry) and QUOTE-022 (Quote Status – Expired Quote Cannot Be Accepted)
- **Overlap analysis:** Both verify: expired quote shows Expired badge, Accept/Convert to Order blocked, new RFQ option available. Step Jaccard ~70%.
- **Difference:** QUOTE-022 is in `Quotes > Status` section and adds the explicit test of clicking Accept and getting an error message. QUOTE-011 is in `Quotes > RFQ` section.
- **Recommendation (judgment call):** Retain both but differentiate clearly. QUOTE-011 should focus on the visual expiry state (badge, date display, disabled buttons). QUOTE-022 should focus on the mutation-level enforcement (attempt acceptance → get error from API). Cross-reference them in References column.

---

## Dimension 8: Environment Verification

**Rating: SKIP**

Static review only — `--verify` flag not requested. ENV dimensions (ENV-001 through ENV-007) are not evaluated. Key items to verify when running with `--verify`:

1. `/account/quotes` page existence — multiple cases depend on this URL
2. Quote feature enabled for `{{ORG_USER_EMAIL}}` account
3. `quotesEnabled` feature flag active in current QA environment
4. `/account/returns` page existence (referenced as "if separate page exists" in ORD-038)
5. Order timeline/history section existence on storefront order detail (ORD-033 is conditional)
6. Notification system enabled and delivering to buyer account

---

## Fix Register

All fixes requiring direct file edits. Listed by priority.

### Fixes to Apply Before Next Regression Run

| # | Case | Column | Rule Violated | Severity | Action |
|---|------|--------|---------------|----------|--------|
| 1 | ORD-004 | Assertions | DV-001 | High | Replace `{{currentDate}}` with `today's date (YYYY-MM-DD format)` |
| 2 | ORD-005 | Steps, Assertions | D-002 | Critical | Move `1Z999AA10123456784` to Test_Data as `tracking_number=1Z999AA10123456784`; replace inline literals with `{{TRACKING_NUMBER}}` |
| 3 | ORD-033 | Test_Data | C-002 | High | Add `admin_url={{ADMIN_URL}};admin_email={{ADMIN_EMAIL}};admin_password={{ADMIN_PASSWORD}}` |
| 4 | ORD-041 | Assertions | C-003 | Critical | Replace `[DOM] order number present in PDF content` and `[DOM] line items listed in PDF` with `[MANUAL] spot-check PDF content contains order number and line items` |

### Judgment Calls — Require QA Lead Decision

| # | Case | Finding | Options |
|---|------|---------|---------|
| 5 | All QUOTE-* (29 cases) | DV-002: invalid BL-QUOTE-* references | (a) Map to BL-B2B-003 / BL-B2B-005 where applicable, note gaps in References column; (b) Add BL-QUOTE-001–004 to business-logic.md catalog |
| 6 | QUOTE-009 | D-002: ambiguous `'Request Revision' or 'Counter-offer'` label | Explore storefront to find actual label; update step |
| 7 | QUOTE-020 | D-003: conditional `if feature supported` step | Remove case OR add explicit precondition confirming feature enabled |
| 8 | QUOTE-025 | C-004: no wait for async notification delivery | Add `[WAIT] notification badge appears (up to 10s)` after initial navigation |
| 9 | QUOTE-004 | C-001: admin setup not verifiable by agent | Add `[SETUP]` step with admin credentials; add admin vars to Test_Data |
| 10 | ORD-033 | T-001: conditional timeline assertion | Confirm feature presence on storefront; remove conditional or set to Manual |
| 11 | QUOTE-020 | T-002: vague "distinguishable" assertion | Specify exact visual distinction expected |
| 12 | ORD-002 vs ORD-034 | DUP-001: ~75% step overlap | Merge or differentiate code paths; confirm distinct scenarios |
| 13 | QUOTE-011 vs QUOTE-022 | DUP-002: ~70% step overlap | Differentiate by focus: visual state vs. API-level enforcement |
| 14 | BL-ORD-004 gap | BL-001: refund conditions undertested | Add 1-2 refund-specific cases or cross-reference Suite 06 |
| 15 | BL-B2B-005 gap | BL-002: quotes-disabled scenario missing | Add negative case for `quotesEnabled=false` |

---

## Coverage Statistics

**Total cases reviewed:** 82
**New cases reviewed (COV-2026-03-21-1550):** 46 (ORD-019 to ORD-051 = 33 cases; QUOTE-018 to QUOTE-030 = 13 cases)
**Pre-existing cases:** 36 (ORD-001 to ORD-018 = 18; QUOTE-001 to QUOTE-017 = 18)

**Priority distribution (all 82 cases):**
- Critical: 9 (11%)
- High: 55 (67%)
- Medium: 18 (22%)

**Issues by case population:**
- New cases with issues: 11 of 46 (24%)
- Pre-existing cases with issues: 5 of 36 (14%)
- New cases that are clean: 35 of 46 (76%)

**BL-* coverage (Orders domain):**
- BL-ORD-001 through BL-ORD-008: 7 of 8 adequately covered (BL-ORD-004 partially)
- BL-B2B-003: covered
- BL-QUOTE-001 to BL-QUOTE-004: invalid references — do not exist in catalog

**Cross-layer check presence:**
- All 82 cases have populated Cross_Layer_Checks column
- All mutation cases include `errors[] is empty` check for GraphQL
- All UI mutation cases include `[CONSOLE] no JS errors` and `[NETWORK] 2xx` baseline checks

---

## Summary for QA Lead

The 46 new cases from COV-2026-03-21-1550 are well-constructed and follow the suite conventions established by the pre-existing cases. The most significant issue is systemic: all 29 QUOTE-* cases reference `BL-QUOTE-001–004` which are not valid entries in `business-logic.md`. This is either a catalog gap (the BL-QUOTE domain needs to be added) or a mapping error (cases should reference BL-B2B-003/005). Resolving this is the highest-priority action before the next sprint sign-off review.

Four fixes should be applied to the CSV before the next regression run (items 1–4 in the fix register). The remaining 11 judgment calls can be scheduled for the next test case maintenance cycle.

No blocker-level structural issues were found. The suite is executable with minor risk from the two High data validity issues.
