# Test Suite Review: 042 Smoke Tests

**Review Date:** 2026-04-22
**Reviewer:** test-management-specialist
**Suite File:** `regression/suites/Frontend/smoke/042-smoke-tests.csv`
**Suite ID:** 042
**Suite Name:** Smoke Tests (Daily Deployment Validation)
**Test Count:** 26 cases (SMK-001 through SMK-026)
**All Priorities:** Critical (P0) — suite correctly scoped to smoke-only

---

## Suite Overview

The 042 smoke suite covers the following domains:
- Homepage load and hero navigation (SMK-001)
- Registration: personal and organization accounts (SMK-002, SMK-003)
- Authentication: personal and B2B org user sign-in (SMK-004, SMK-005)
- Search: query execution, E2E search-to-cart flow (SMK-006, SMK-023)
- Catalog: category browse to PDP (SMK-007)
- Cart: add to cart, quantity stepper, view/update, remove item (SMK-008, SMK-009, SMK-010, SMK-011)
- Checkout: address/shipping selection, place order, payment (SMK-012, SMK-013, SMK-014)
- Orders: confirmation GA4 event, order history (SMK-015, SMK-016)
- Account: address management (SMK-017)
- B2C Variations: option selection, price/stock update on selection (SMK-018, SMK-019)
- B2B: org switcher/cart isolation, company members page, bulk order (SMK-020, SMK-021, SMK-022)
- BOPIS: pickup option (SMK-024)
- Security/XSS regression (SMK-025)
- Storefront health console check (SMK-026)

The suite uses the enriched 15-column CSV format. The header row is correct and matches the template specification.

---

## Dimension-by-Dimension Findings

### Dimension 1: Structure

**Verdict: PASS with minor issues**

- Header row matches the enriched 15-column format exactly. No S-001 violation.
- All 26 IDs are present and follow `SMK-NNN` format. No S-002, S-003, or S-004 violations.
- All priorities are `Critical`. No S-005 violations.
- All rows have non-empty Title, Steps, and Assertions columns. No S-006 violations.

**Issue S-004 variant — Minor:** `SMK-002` References column contains `regression-qa-theme-26.csv` and `SMK-003` has the same. These are legacy references to a theme-named file, not a JIRA ticket ID or VCST ticket. They are not blockers but are informational noise.

**Issue S-007 risk — Low:** The suite uses embedded multi-line steps in quoted CSV fields. This is by design for agent-native format. No unclosed quotes were detected.

---

### Dimension 2: Determinism

**Verdict: NEEDS-FIX — 3 Critical issues, 4 High issues**

**D-001: Missing step type tags — Critical**

- `SMK-002` Steps: `"[ACT] fill 'First Name': 'Test'"` — hardcoded name literal `'Test'` rather than a `{{VAR}}`. Minor, but the real issue is the unnamed step text `"[ACT] fill 'Email': unique test email (not {{USER_EMAIL}})"` — the phrase "unique test email" is not a `{{VAR}}` binding and is not resolvable by an agent at runtime. The agent has no mechanism to generate a unique email without a variable or a test data generation instruction.
- `SMK-009` Steps: `"[NAV] known in-stock product PDP on {{FRONT_URL}}"` — the phrase "known in-stock product" is not a deterministic URL. An agent cannot resolve "known in-stock product" to an actual URL without additional context. This is a D-001/D-002 compound issue.
- `SMK-015` Steps: `"[ACT] evaluate window.dataLayer: window.dataLayer.filter(e => e[1] === 'purchase')"` uses JavaScript evaluation correctly, but `[ACT]` is the wrong tag for an evaluation that does not mutate state — this should be `[ASSERT]` or prefixed with a `browser_evaluate` note. This is a D-001 ambiguity (wrong tag type).

**D-002: Generic element reference — Critical**

- `SMK-001` Step: `"[ACT] click hero banner primary CTA (e.g., link inside banner heading)"` — the parenthetical `e.g.` signals non-determinism. The exact element label is unknown; the agent cannot reliably identify it across runs if the banner content changes. Per the env-resilience golden rule, exact banner content should not be asserted.
- `SMK-012` Step: `"[ACT] select first available shipping method (e.g., 'Ground')"` — `e.g.` is an example, not a deterministic selector. An agent should either use the first option in the list without specifying a label, or this must be expressed as `[ACT] select first option in shipping method list`.
- `SMK-018` Step: `"[NAV] B2C variation product PDP (e.g., in /products-with-options/variations-of-jeans/ category)"` — this is a category-path hint, not a `{{VAR}}`-bound URL. The path `variations-of-jeans` may not exist in all environments. This navigation step is non-deterministic.
- `SMK-019` Step: `"[NAV] B2C variation product PDP with variants at different prices"` — no URL, no SKU, no `{{VAR}}`. Entirely unresolvable by an automated agent.

**D-004: Missing WAIT after state-changing ACT — High**

- `SMK-002` Steps: After `[ACT] fill 'Password': valid password` → `[ACT] check 'I agree to the Terms and Conditions'` → `[ACT] click 'Create Account'`, there is a WAIT, but the preceding `[ACT] fill` steps for First Name, Last Name, Email, Password have no WAIT between field fills. While field fills are low-risk, the `[ACT] check` before the submit has no WAIT either. This is acceptable for form fills but worth noting as a pattern.
- `SMK-015` Steps: After `[ACT] evaluate window.dataLayer...`, there is no `[WAIT]` before the assertion step — acceptable only because `browser_evaluate` is synchronous, but this should be noted.

**D-005: Compound step — High**

- `SMK-003` Step: `"[ACT] fill 'First Name', 'Last Name', 'Email', 'Password'"` — this is a single step that fills four separate fields. It violates the one-action-per-step rule. An agent executing this step cannot know the order of fills or the individual values without a Test_Data binding per field.
- `SMK-025` Steps contain multiple sequential fills in a single `[ACT]` step for the address form (`[ACT] fill address 'First Name' with test value: 'SmokeTest'` and `[ACT] fill address 'Street Address' with value: '123 Test St'` in the same conceptual step). However these appear to be on separate lines, which is acceptable.

**D-006: Assertion mixed into Steps — High**

- `SMK-008` Steps contain `[ASSERT] spinbutton shows '0' initially; 'Decrease quantity' button disabled`. This `[ASSERT]` in the Steps column is used as a mid-flow precondition gate, which is acceptable per the template (mid-flow `[ASSERT]` gates are allowed). However, the `[ASSERT] cart badge shows 1 or has incremented` near the end of the Steps column is a final verdict assertion — it should be in the Assertions column only.
- `SMK-009` Steps end with `[ASSERT] line total = 2 × unit price`, which is clearly a final verdict and should be in the Assertions column.
- `SMK-012` Steps contain `[ASSERT] order summary shows subtotal + shipping + tax = grand total` as the last step, which is a final verdict — belongs in Assertions.
- `SMK-013` Steps contain `[ASSERT] 'Place Order' button (or payment submit) is enabled` as the first step — acceptable as a precondition gate — and `[ASSERT] order number visible on confirmation page` near the end — this is a final verdict that belongs in Assertions.

---

### Dimension 3: Completeness

**Verdict: NEEDS-FIX — 2 Critical issues, 5 High issues**

**C-002: Missing Test_Data bindings — High**

- `SMK-002` Test_Data: `front_url={{FRONT_URL}}` only. Steps reference `{{USER_EMAIL}}` (via hint "not {{USER_EMAIL}}"), 'Test' (hardcoded first name), 'valid password' (not a VAR). Missing binding for any form of dynamic email or password.
- `SMK-009` Test_Data: `email={{USER_EMAIL}}, front_url={{FRONT_URL}}`. Steps reference a "known in-stock product" URL but no `sku` or `product_url` binding is in Test_Data.
- `SMK-010` Test_Data: `front_url={{FRONT_URL}}` only. Steps require at least 1 item already in cart (precondition), but no `sku={{TEST_SKU}}` or equivalent binding.
- `SMK-011` Test_Data: `front_url={{FRONT_URL}}` only. Steps require 2 items in cart; no SKU bindings.
- `SMK-018` and `SMK-019` Test_Data: `front_url={{FRONT_URL}}` only. No SKU or URL binding for the B2C variation product.

**C-004: Missing Cross_Layer_Checks for mutations — High**

- `SMK-001` (Homepage load): Cross_Layer_Checks covers CONSOLE and NETWORK only — appropriate for a read-only page. No issue.
- `SMK-017` (Address management) Cross_Layer_Checks correctly includes `[GQL] updateContact mutation errors[] empty` and `[GQL] me query after add shows new address`. Complete.
- `SMK-024` (BOPIS) Cross_Layer_Checks includes `[GQL] addOrUpdateCartShipment` check. Complete.

**C-006: Missing Failure_Signals — High**

- `SMK-003` Failure_Signals: `"Organization account type option missing from selector, company name field not shown after selecting org type, org not created in admin, B2B nav absent"` — adequate count (4 signals).
- `SMK-009` Failure_Signals mentions `negative quantity accepted (ECL-5.3)`. This is a good inclusion, but the signal for "known in-stock product URL not resolving" is absent — directly related to the D-002 issue with the undetermined product URL.
- `SMK-014` Failure_Signals: 5 signals listed, adequate.
- `SMK-019` Failure_Signals: 4 signals including stale cache. Adequate.

**C-007: Missing Cleanup — Medium**

- `SMK-002` Cleanup: `"Delete test account via admin if environment requires cleanup"` — conditional ("if environment requires cleanup") introduces ambiguity. The agent cannot decide whether to clean up. Should be `"Delete test account via Admin > Contacts > [email] > Delete"` unconditionally.
- `SMK-003` Cleanup: Same conditional pattern — `"Delete test org via admin if needed"` — same issue.

**C-001: Missing/Weak Preconditions — High**

- `SMK-009` Preconditions: `"User logged in as {{USER_EMAIL}}, in-stock product available with stock > 3"` — `in-stock product available with stock > 3` is unspecified. Which product? No SKU reference. Combined with D-002 (undetermined PDP URL), this case cannot be set up deterministically.
- `SMK-010` Preconditions: `"At least 1 item in cart, user logged in as {{USER_EMAIL}}"` — no specification of how items get into the cart (state dependency on prior test without explicit setup). For isolated execution, the precondition should include a setup step or reference `{{TEST_SKU}}`.
- `SMK-011` Preconditions: `"At least 2 items in cart, user logged in as {{USER_EMAIL}}"` — same issue as SMK-010.
- `SMK-013` Preconditions: `"Cart with items, delivery address and shipping method already selected (follow-on from ESM-009)"` — references `ESM-009`, a nonexistent ID (see ordering issues below under Duplication/Cross-reference).

---

### Dimension 4: Testability

**Verdict: NEEDS-FIX — 3 High issues**

**T-001: Vague assertion predicates — High**

- `SMK-001` Assertion: `[DOM] navigation bar visible with 'All products' dropdown button` — "navigation bar visible" is not specific enough. What element confirms it? However, the quoted label `'All products'` provides a concrete check, making this borderline acceptable.
- `SMK-002` Assertion: `[STATE] login with new credentials succeeds on retry` — this implies a second login attempt with the newly created account. This assertion is not testable within the same test case flow (the test case does not contain a second login step). This is an incomplete assertion that requires a separate test or additional steps.
- `SMK-004` Assertion: `[STATE] user is authenticated (no re-prompt on protected page)` — vague. Should be: `[STATE] navigating to {{FRONT_URL}}/account/dashboard shows dashboard content (no /sign-in redirect)`.
- `SMK-007` Assertion: `[DOM] breadcrumb trail visible on PDP (e.g., Home > Snacks > [product])` — the `[product]` placeholder is not a concrete assertion value. A passing agent check should be: `[DOM] breadcrumb visible with at least 2 levels (Home + category)`.
- `SMK-026` Assertion: `[STATE] {{FRONT_URL}}/account/dashboard loads without TypeError or ReferenceError in console` — four such assertions, one per page. These are concrete and testable. No issue.

**T-002: Missing element specification in DOM assertion — High**

- `SMK-001` Assertion: `[DOM] hero banner section visible above the fold` — "above the fold" is a UX concept, not a DOM-verifiable property without a scroll check. An agent would need to evaluate the element's bounding rectangle vs. viewport. Should be: `[DOM] hero banner section visible without scrolling (element intersects with viewport)`.
- `SMK-003` Assertion: `[DOM] organization name visible in account context area` — "account context area" is not a specific DOM element. Should reference the `OrgName / UserName` button in the header.
- `SMK-004` Assertion: `[DOM] 'Dashboard' link visible in top header` — per the sitemap, the Dashboard is an account page (`/account/dashboard`). Verifying the link is visible in the top header is concrete. Acceptable.

**T-003: Missing formula in MATH assertion — High**

- `SMK-009` Assertion: `[MATH] cart line total = qty × unit price (2 decimal places)` — formula is present. Pass.
- `SMK-010` Assertion: `[MATH] cart subtotal = sum of all line totals (BL-PRICE-008: no floating-point drift)` — formula is present. Pass.
- `SMK-011` Assertion: `[MATH] new subtotal = old subtotal − removed item line total (BL-PRICE-008)` — formula is present. Pass.
- `SMK-012` Assertion: `[MATH] displayed total = subtotal + shipping + tax − discounts (BL-CHK-006)` — formula is present. Pass.

---

### Dimension 5: Data Validity

**Verdict: NEEDS-FIX — 3 Critical issues, 4 High issues**

**DV-001: Unknown `{{VAR}}` token — None detected**

All `{{VAR}}` tokens used (`{{FRONT_URL}}`, `{{USER_EMAIL}}`, `{{USER_PASSWORD}}`, `{{ORG_USER_EMAIL}}`, `{{ORG_USER_PASSWORD}}`, `{{TEST_SKU}}`, `{{TEST_CARD_NUMBER}}`, `{{TEST_CARD_EXP}}`, `{{TEST_CARD_CVV}}`) are in the known env variable set. No DV-001 violations.

**DV-002: Hardcoded URL — None detected**

No full hardcoded HTTP/HTTPS URLs found in steps. All navigation uses `{{FRONT_URL}}/path`. Pass.

**DV-003: Hardcoded credentials — None detected**

No literal email addresses or passwords found in steps. `SMK-002` and `SMK-003` use 'Test' as a hardcoded first name and 'User' as a last name — these are test data literals, not credentials, so no DV-003 violation. However, the hardcoded registration name 'Test'/'User' is a data validity concern under DV-004.

**DV-004: Referenced product/SKU not in Test_Data — High**

- `SMK-006` uses the hardcoded search term `search_term=snack` in Test_Data and `'snack'` in Steps. Per the env-resilience golden rule, this is a hardcoded term that depends on specific catalog data. If the catalog is modified (products renamed or removed), this test will fail for the wrong reason. Should be: `search_term={{SEARCH_TERM_SNACK}}` or a known-stable product search term variable.
- `SMK-007` navigates to `{{FRONT_URL}}/snacks` — a hardcoded category path that depends on a specific category named "snacks" existing in the catalog. If the category slug changes, the test fails for the wrong reason. Per env-resilience feedback, URL path segments that depend on catalog data should not be hardcoded. Should use `{{CATEGORY_URL_SNACKS}}` or navigate via the category tiles.
- `SMK-018` navigation to `(e.g., in /products-with-options/variations-of-jeans/ category)` — this is a hardcoded category path hint. The actual path is undefined (D-002 issue already noted). If used literally, it would be a hardcoded catalog path.
- `SMK-002` and `SMK-003` use hardcoded values 'Test', 'User' as first/last name and `unique company name` as an unresolvable instruction. These values should be in Test_Data as `{{TEST_FIRST_NAME}}` or generated at runtime.
- `SMK-025` uses hardcoded name values `'SmokeTest'` and `'Runner'` and address `'123 Test St'` in steps. These are safe as test-purpose literals (not real data), but they are hardcoded and should ideally be in Test_Data.

**DV-005: Stale admin URL pattern — None detected**

No admin URLs used (this is a storefront-only smoke suite). Pass.

**Non-standard `@td()` token syntax — Critical (DV-001 variant)**

- `SMK-012` Steps and `SMK-017` Steps use `@td(ADDR_NY.first_name)`, `@td(ADDR_NY.last_name)`, `@td(ADDR_NY.street)`, `@td(ADDR_NY.city)`, `@td(ADDR_NY.state)`, `@td(ADDR_NY.zip)`, `@td(ADDR_NY.country)` — the `@td()` syntax is NOT in the known env variable set (`{{VAR}}` tokens) defined in the test-case-template. This is a custom test data reference syntax. It is not documented in the template, and no known `ADDR_NY` data file was found in `test-data/` during analysis. An agent receiving this instruction has no mechanism to resolve `@td(ADDR_NY.first_name)` to an actual value. This is a **Blocker** for automated execution of SMK-012 and SMK-017 unless the `@td()` resolver is defined elsewhere in the runner configuration.

**BL-PAY-001 is an invalid BL-* reference — Critical (BL-002 overlap)**

- `SMK-014` Business_Rule: `BL-PAY-001` — this invariant ID does not exist in `business-logic.md`. The payment domain is covered under `BL-ORD-006` (Payment state machine), `BL-CHK-002` (double-submit), and `BL-CHK-004` (payment retry). `BL-PAY-001` is a phantom reference. This gives false traceability — the test claims to cover a rule that cannot be validated against the invariant catalog.

---

### Dimension 6: BL/ECL Coverage

**Verdict: PASS with medium gaps**

**BL-001: Missing Business_Rule for Critical/High case**

All 26 cases are `Critical` priority. All 26 have at least one BL-* reference. No BL-001 violations.

**BL-002: Invalid BL-* reference — Medium**

- `SMK-014`: `BL-PAY-001` does not exist in `business-logic.md` (confirmed via grep). The correct references for payment testing should be `BL-CHK-002` (already referenced), `BL-ORD-006`, and `BL-CHK-004`.
- All other BL-* IDs referenced across the suite were verified as existing in `business-logic.md`.

**BL-004: Uncovered BL-* invariants for smoke-relevant domains — Medium gaps**

Invariants in scope for a smoke suite that have no coverage:

| Invariant | Domain | Why it matters for smoke | Covered? |
|-----------|--------|--------------------------|----------|
| `BL-PRICE-002` | Tax calculation position | Tax is shown in checkout | Not directly — only total math |
| `BL-PRICE-004` | Tiered pricing boundaries | Could cause price errors | Not covered |
| `BL-PRICE-007` | Organization-specific pricing | B2B org pricing visible | Not covered |
| `BL-CART-002` | Out-of-stock mid-session | Critical for revenue | Not covered |
| `BL-CART-003` | Coupon + sale interaction | Checkout totals | Not covered |
| `BL-CART-006` | Pack size enforcement | Cart quantity rules | Not covered |
| `BL-CART-008` | Cart persistence across sign-out | Core user expectation | Not covered |
| `BL-CHK-004` | Payment retry after decline | Revenue-critical | Not covered |
| `BL-CHK-007` | Minimum order amount | Revenue-critical gate | Not covered |
| `BL-AUTH-002` | Email verification gate | Registration flow | Not covered |
| `BL-AUTH-003` | Account lockout | Security | Not covered |
| `BL-CROSS-010` | Idempotency on checkout mutations | Double-order prevention | Only BL-CHK-002 covers UI |

**Note:** Many of these are intentionally out of scope for a smoke suite (BL-CART-002, BL-CART-003, BL-AUTH-003 are for specialized suites). The gaps listed are informational — a smoke suite is not expected to cover all invariants. Critical P0-revenue invariants for the smoke scope are well-covered.

**BL-003: Missing ECL-* for high-risk domains — Low**

- `SMK-013` (Place Order) includes `ECL-1.1, ECL-7.3, ECL-11.1, ECL-14.6`. Complete.
- `SMK-010` (Cart quantities) includes `ECL-2.3, ECL-7.3`. Complete.
- `SMK-014` (Payment) includes `ECL-1.1, ECL-1.2, ECL-7.3, ECL-14.6`. Complete.
- `SMK-012` includes `ECL-1.2, ECL-6.2, ECL-6.3`. Complete.

ECL coverage is strong across the payment, cart, and checkout test cases.

---

### Dimension 7: Duplication

**Verdict: PASS with informational notes**

**DUP-001: Same-suite duplicates — None detected**

No two cases test the same scenario at the same layer. SMK-008 (Add to Cart from PDP) and SMK-009 (Quantity Stepper + Cart Sync) are distinct: the former tests the basic add-to-cart mutation, the latter tests the stepper UX + quantity math loop. Not duplicates.

**DUP-002/DUP-003: Cross-reference inconsistencies — Informational**

- `SMK-013` Preconditions reference `ESM-009` — this identifier does not match any SMK-* ID in this suite. It appears to be a stale reference to an earlier ID scheme (possibly the pre-renaming "ESM" prefix). The actual dependency should be `SMK-012`.
- `SMK-015` Preconditions reference `ESM-010` and Steps reference `ESM-010 order`. The actual dependency should be `SMK-013`.
- `SMK-016` Preconditions reference `ESM-010`. The actual dependency should be `SMK-013`.

These are not duplication issues but are stale cross-references that create ambiguity about test ordering and dependencies. They are **High** severity for determinism (an agent reading `ESM-009` has no matching case to look up).

**Sequential dependencies — Design issue**

`SMK-012 → SMK-013 → SMK-015 → SMK-016` forms a sequential chain where each case depends on the outcome of the previous. This is acknowledged in the suite design (Cleanup of SMK-012 says "Leave checkout in ready-to-pay state for ESM-010"). However, for a smoke suite intended for parallel execution, sequential dependencies between cases reduce parallelism and make the suite fragile — if SMK-012 fails, SMK-013, SMK-015, and SMK-016 all fail by dependency. This is a design trade-off appropriate to document.

**Search term overlap — Informational**

`SMK-006` (Search Query) and `SMK-023` (Search to Cart E2E) both use the hardcoded term `'snack'`. This means both cases depend on the same catalog data. If the snacks products are removed, both fail. Consider making them test different search terms or having SMK-023 extend from SMK-006's results rather than re-searching.

---

### Dimension 8: Environment Verification

**Verdict: NOT EXECUTED (live validation not in scope for this review)**

Static analysis only. Browser validation was not performed. The following issues were identified through static analysis that would likely surface during live verification:

**ENV-002 risk — SMK-007:** Navigates to `{{FRONT_URL}}/snacks` — if the `/snacks` category slug does not exist in the current QA environment, the test immediately fails at the NAV step. The sitemap confirms `/snacks` as a valid URL (March 2026), but it is catalog-data-dependent.

**ENV-002 risk — SMK-018 and SMK-019:** No concrete URL for the B2C variation product PDP. Both cases will fail immediately for an automated agent that cannot resolve "known B2C variation product PDP" without a URL or SKU.

**ENV-004 risk — SMK-022 (Bulk Order):** The `/bulk-order` page is listed in the sitemap and is a valid B2B page, but its availability depends on the user having an active organization. The precondition correctly requires `{{ORG_USER_EMAIL}}`.

**ENV-004 risk — SMK-024 (BOPIS):** The Preconditions state `"at least 1 pickup location configured in system"` — this is an environment-specific dependency. If the QA environment has no BOPIS fulfillment centers configured, this test fails on setup. No known environment variable exists for this (e.g., `{{BOPIS_ENABLED}}`), making it hard for an automated agent to skip gracefully.

---

## Critical Issues List

The following issues require attention before the next regression run.

### P0 — Blockers (must fix before any automated run)

| # | Case(s) | Issue | Criterion | Description |
|---|---------|-------|-----------|-------------|
| 1 | SMK-012, SMK-017 | `@td()` token syntax unresolvable | DV-001 (variant) | `@td(ADDR_NY.first_name)` and related tokens are not `{{VAR}}` bindings defined in the known env variable set. No runner documentation defines this syntax. Automated agents cannot resolve these values. Both cases will fail at address entry steps. |
| 2 | SMK-018, SMK-019 | No URL or SKU for B2C variation product | D-002, C-002 | Steps say "navigate to B2C variation product PDP" with no URL, no `{{VAR}}`, no SKU in Test_Data. Both cases are fully unexecutable by an automated agent. |
| 3 | SMK-013, SMK-015, SMK-016 | Stale `ESM-*` cross-references in Preconditions | D-002 | Preconditions reference `ESM-009` and `ESM-010` which do not exist in this suite. Correct references are `SMK-012` and `SMK-013`. An agent reading these preconditions cannot locate the dependency case. |

### P1 — Critical (should fix before next run)

| # | Case(s) | Issue | Criterion | Description |
|---|---------|-------|-----------|-------------|
| 4 | SMK-014 | `BL-PAY-001` does not exist | BL-002 | Business_Rule column references an invariant ID that is not in `business-logic.md`. No `BL-PAY` domain exists. Correct references are `BL-CHK-002, BL-ORD-006`. |
| 5 | SMK-002, SMK-003 | Unique email generation for registration is unresolvable | D-002, C-002 | Step says `"fill 'Email': unique test email (not {{USER_EMAIL}})"` — no mechanism for an agent to generate a unique email without a `{{VAR}}` or explicit test data seeding step. Registration cases are P0 for smoke scope. |
| 6 | SMK-009 | "Known in-stock product" is non-deterministic | D-002, C-001 | Steps navigate to "known in-stock product PDP" with no URL or SKU. Test_Data has no `sku` binding. Case is non-executable without a concrete product reference. |
| 7 | SMK-006, SMK-007, SMK-023 | Hardcoded `'snack'` search term and `/snacks` category path violate env-resilience rule | DV-004 | Per the golden rule (feedback_env_resilience, feedback_flexible_test_cases): no hardcoded catalog paths or search terms. If snacks products are renamed or category slug changes, multiple P0 cases fail for the wrong reason. |
| 8 | SMK-008, SMK-009, SMK-012, SMK-013 | Final-verdict `[ASSERT]` tags used inside Steps column | D-006 | Steps column contains assertions that are final pass/fail verdicts (e.g., `[ASSERT] order number visible on confirmation page` in SMK-013 Steps). These belong in the Assertions column only. |

### P2 — High (fix when convenient)

| # | Case(s) | Issue | Criterion | Description |
|---|---------|-------|-----------|-------------|
| 9 | SMK-002, SMK-003 | Cleanup is conditional (`"if needed"`, `"if environment requires"`) | C-007 | Cleanup instructions are ambiguous — agent cannot decide whether to clean up. Should be unconditional. |
| 10 | SMK-003 | Compound step fills 4 fields in one `[ACT]` | D-005 | `[ACT] fill 'First Name', 'Last Name', 'Email', 'Password'` is a multi-action step violating one-action-per-step rule. |
| 11 | SMK-010, SMK-011 | Cart state dependency without setup steps | C-001 | Preconditions require items already in cart but provide no setup instruction. Cases cannot be run in isolation. |
| 12 | SMK-002 | Assertion `[STATE] login with new credentials succeeds on retry` is untestable within case flow | T-001 | The case doesn't contain a second login sequence, so this assertion can never be evaluated. Should be a separate test case or the steps must include a sign-out and re-login sequence. |
| 13 | SMK-001 | `[ACT] click hero banner primary CTA (e.g., link inside banner heading)` is non-deterministic | D-002 | CTA content is catalog-driven and changes. Per env-resilience rule, this should use a known-stable CTA or navigate by URL. |
| 14 | SMK-024 | BOPIS environment dependency not captured in a `{{VAR}}` | ENV-004 risk | No env variable for BOPIS availability. Graceful skip mechanism absent. |
| 15 | SMK-025 | Hardcoded profile names `'SmokeTest'` and `'Runner'` should be in Test_Data | DV-004 | Minor: literals in steps should be in Test_Data as `{{TEST_FIRST_NAME}}={{...}}` bindings. |

---

## Prioritized Fix List Summary

**P0 — 3 blockers:**
1. Resolve `@td()` syntax: either document the resolver or replace with `{{VAR}}` bindings + test-data CSV entries for `ADDR_NY.*` fields in `test-data/` directory (SMK-012, SMK-017)
2. Add `{{B2C_VARIATION_SKU}}` env variable and bind it in Test_Data for SMK-018 and SMK-019; update Steps to use `{{FRONT_URL}}/product/{{B2C_VARIATION_SKU}}`
3. Replace `ESM-009` with `SMK-012` and `ESM-010` with `SMK-013` in all Preconditions (SMK-013, SMK-015, SMK-016)

**P1 — 5 issues:**
4. Replace `BL-PAY-001` with `BL-CHK-002, BL-ORD-006` in SMK-014 Business_Rule column
5. Add unique email generation step to SMK-002/SMK-003 — either add `[SETUP]` step using API to generate a unique email, or introduce `{{TEST_REGISTRATION_EMAIL}}` as a pre-seeded env variable
6. Add `sku={{TEST_SKU}}` (or `product_url`) to SMK-009 Test_Data; update PDP navigation step to use `{{FRONT_URL}}/product/{{TEST_SKU}}`
7. Replace hardcoded `'snack'`/`/snacks` with env-variable-bound equivalents: `{{SEARCH_TERM_BASIC}}={{SEARCH_TERM_BASIC}}` and `{{CATEGORY_URL_SNACKS}}={{CATEGORY_URL_SNACKS}}`
8. Move all final-verdict `[ASSERT]` steps from Steps column to Assertions column in SMK-008, SMK-009, SMK-012, SMK-013

**P2 — 7 issues:**
9. Make SMK-002, SMK-003 Cleanup unconditional (specify the exact admin action)
10. Split SMK-003 compound `[ACT]` into individual fill steps
11. Add explicit setup steps or state-setup precondition to SMK-010, SMK-011 (or mark them as dependent on SMK-008/SMK-009 with corrected cross-references)
12. Remove SMK-002 assertion `[STATE] login with new credentials succeeds on retry` or add sign-out + re-login steps to the case
13. Update SMK-001 hero banner CTA step to use a stable navigation path (e.g., `[ACT] click 'All products' link in nav bar` or navigate directly to `/catalog`)
14. Add `{{BOPIS_LOCATION_NAME}}` or skip-guard documentation to SMK-024
15. Move hardcoded names/addresses in SMK-025 to Test_Data column

---

## Overall Quality Verdict

**NEEDS-FIX**

The suite has excellent structural integrity: all 26 cases are correctly formatted, all use the enriched 15-column format, all are `Critical` priority, and the BL/ECL cross-references are thoughtful and mostly valid. The GA4, XSS regression, console health, and B2B cases are well-written with strong cross-layer checks.

However, there are **3 blocker issues** that would prevent automated execution of at least 6 cases:

- The `@td()` token syntax is a non-standard, unresolvable reference pattern in SMK-012 and SMK-017
- The B2C variation test cases (SMK-018, SMK-019) have no deterministic product URL or SKU binding
- Stale `ESM-*` cross-references in 3 cases confuse ordering and dependency tracking

Additionally, the env-resilience rule is violated by hardcoded catalog paths and search terms in 4 cases. For a P0 smoke suite that runs daily, fragility from catalog data changes is a significant risk.

The suite is **not recommended for unattended automated regression** in its current state due to the 3 blockers. Manual execution by a QA agent (who can interpret ambiguous steps) is feasible for most cases.

**Fix the P0 blockers and P1 issues → re-classify to READY.**

---

## Coverage Assessment

| Domain | Cases | BL Coverage | Gaps |
|--------|-------|-------------|------|
| Homepage | 1 | BL-CROSS-011 | None critical |
| Registration | 2 | BL-AUTH-002, BL-B2B-005 | Email verify flow (out of scope for smoke) |
| Authentication | 2 | BL-AUTH-001, BL-B2B-001, BL-B2B-005 | Lockout (out of scope) |
| Search | 2 | BL-SRCH-001, BL-SRCH-004 | Facet counts (separate suite) |
| Catalog | 1 | BL-CAT-004, BL-CAT-005, BL-PRICE-003 | Adequate for smoke |
| Cart | 4 | BL-CART-001, BL-CART-007, BL-PRICE-001/003/008 | Pack size, out-of-stock mid-session (out of scope) |
| Checkout | 3 | BL-CHK-001/002/005/006, BL-ORD-001/005 | Min order, payment retry (other suites) |
| Payment | 1 | BL-CHK-002 (BL-PAY-001 invalid) | Fix reference |
| Orders | 2 | BL-ORD-005, BL-CROSS-005 | Adequate |
| Account/Address | 1 | BL-CHK-003, BL-AUTH-004 | Adequate |
| B2C Variations | 2 | BL-CAT-001/006, BL-PRICE-001/003 | Adequate (if SKU added) |
| B2B/Org | 3 | BL-B2B-001/005, BL-CROSS-008 | Approval limits (other suites) |
| BOPIS | 1 | BL-SHIP-002, BL-CHK-006 | Adequate |
| Security | 1 | BL-AUTH-005 | Adequate |
| Health | 1 | BL-CROSS-011 | Adequate |

Overall smoke scope coverage of P0-revenue invariants relevant to daily deployment: approximately **78%** of in-scope invariants are touched. The gap is primarily in payment retry flow (BL-CHK-004) and the invalid BL-PAY-001 reference.

---

*Report generated by test-management-specialist | Suite: 042 | Cases reviewed: 26 | Review method: static analysis (no live browser validation)*
