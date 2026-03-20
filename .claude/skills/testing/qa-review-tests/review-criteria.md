# Test Case Review Criteria Catalog

Detailed review criteria for the `/qa-review-tests` skill. Each criterion has a severity, description, detection rule, and examples of good vs bad patterns.

---

## Dimension 1: Structure

Validates CSV format integrity. A structural issue prevents the test case from being parsed or executed at all.

### S-001: Missing or malformed header row `[Blocker]`
- **Detection:** First row does not match either the 15-column enriched format or the legacy 11-column format.
- **Bad:** `ID,Name,Steps,Expected` (missing columns)
- **Good:** `ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions,Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup,References,Automation_Status`

### S-002: Missing test case ID `[Blocker]`
- **Detection:** `ID` column is empty for a data row.
- **Bad:** `,Add to Cart,Smoke > Cart,...`
- **Good:** `SMK-007,Add to Cart,Smoke > Cart,...`

### S-003: Duplicate test case ID `[Blocker]`
- **Detection:** Two or more rows share the same ID within one file.
- **Impact:** Ambiguous test results — cannot distinguish which case passed/failed.

### S-004: Invalid ID format `[High]`
- **Detection:** ID does not match `PREFIX-NNN` pattern (letters + hyphen + digits).
- **Bad:** `7`, `test_cart_add`, `CART007`
- **Good:** `CART-007`, `SMK-001`, `API-032`

### S-005: Invalid priority value `[High]`
- **Detection:** Priority is not one of: `Critical`, `High`, `Medium`, `Low`.
- **Bad:** `P0`, `Important`, `1`, empty
- **Good:** `Critical`, `High`

### S-006: Empty required field `[High]`
- **Detection:** `Title`, `Steps`, or `Assertions`/`Expected Result` is empty.
- **Impact:** Agent cannot execute the test case.

### S-007: CSV parsing error `[Blocker]`
- **Detection:** Unescaped commas, unclosed quotes, or mismatched column count in a row.
- **Impact:** Entire row (and possibly subsequent rows) misread.

---

## Dimension 2: Determinism

Ensures two different AI agents would execute the test case the same way and reach the same verdict.

### D-001: Missing step type tags `[Critical]`
- **Detection:** Step line does not start with `[NAV]`, `[ACT]`, `[WAIT]`, `[SCROLL]`, `[KEY]`, `[ASSERT]`, `[HTTP]`, `[GQL]`, `[BLADE]`, `[GRID]`, `[SAVE]`, `[AUTH]`, `[SETUP]`, `[TEARDOWN]`.
- **Bad:** `Navigate to the cart page`
- **Good:** `[NAV] {{FRONT_URL}}/cart`
- **Auto-fixable:** Yes — infer tag from verb (navigate→NAV, click/fill/select→ACT, wait→WAIT)

### D-002: Generic element reference `[Critical]`
- **Detection:** Step references UI element by generic description instead of label, text, or role.
- **Bad:** `[ACT] click the submit button`
- **Good:** `[ACT] click 'Place Order'`
- **Bad:** `[ACT] fill in the email field`
- **Good:** `[ACT] fill 'Email': {{USER_EMAIL}}`

### D-003: Ambiguous action verb `[High]`
- **Detection:** Step uses verbs like "check", "ensure", "validate", "verify" without specifying the mechanism.
- **Bad:** `[ACT] check the cart is updated`
- **Good:** `[ASSERT] cart badge text = '3'` (this should be in Assertions column, not Steps)

### D-004: Missing WAIT after state-changing ACT `[Critical]`
- **Detection:** An `[ACT]` that triggers navigation, form submission, or data mutation is NOT followed by a `[WAIT]`.
- **Bad:**
  ```
  [ACT] click 'Add to Cart'
  [ACT] click 'Proceed to Checkout'
  ```
- **Good:**
  ```
  [ACT] click 'Add to Cart'
  [WAIT] success notification visible OR cart badge increments
  [ACT] click 'Proceed to Checkout'
  ```
- **Auto-fixable:** Partially — can insert `[WAIT] page/element loads` but may need human to specify exact wait condition.

### D-005: Compound step `[High]`
- **Detection:** Single step line contains two or more distinct actions (joined by "and", "then", semicolon).
- **Bad:** `[ACT] click 'Add to Cart' and verify badge updates`
- **Good:** Split into `[ACT] click 'Add to Cart'` + `[WAIT] cart badge increments` (assertion in Assertions column)

### D-006: Assertion mixed into Steps column `[High]`
- **Detection:** Steps column contains `[ASSERT]` tags that are final verdicts (not mid-flow gates).
- **Note:** Mid-flow `[ASSERT]` is acceptable when it gates the next step (e.g., "verify modal loaded before filling form"). Final pass/fail assertions belong in the Assertions column.

---

## Dimension 3: Completeness

Ensures the test case has all information an agent needs to execute independently.

### C-001: Missing preconditions `[High]`
- **Detection:** `Preconditions` column is empty or contains only "none".
- **Impact:** Agent doesn't know required starting state — may fail on setup rather than actual test.
- **Exception:** Smoke tests that start from a clean/anonymous state may legitimately have minimal preconditions.

### C-002: Missing Test_Data bindings `[High]`
- **Detection:** Steps reference `{{VAR}}` tokens but `Test_Data` column doesn't list them.
- **Bad:** Steps: `[NAV] {{FRONT_URL}}/cart` | Test_Data: empty
- **Good:** Steps: `[NAV] {{FRONT_URL}}/cart` | Test_Data: `front_url={{FRONT_URL}}`

### C-003: Insufficient assertions `[High]`
- **Detection:** Fewer than 2 tagged assertions in the Assertions column.
- **Impact:** Test may pass trivially without actually verifying the expected behavior.

### C-004: Missing Cross_Layer_Checks for mutations `[Critical]`
- **Detection:** Steps contain a mutation (form submit, add to cart, place order, create entity) but Cross_Layer_Checks is empty.
- **Impact:** Test may pass on UI level while the backend silently failed.
- **Auto-fixable:** Yes — add `[CONSOLE] no JS errors` + `[NETWORK] no 4xx/5xx` as baseline.

### C-005: Missing errors[] check for GraphQL mutations `[Critical]`
- **Detection:** Steps involve a GraphQL mutation (addItem, removeItem, createOrder, etc.) but Cross_Layer_Checks doesn't include `errors[] is empty`.
- **Impact:** HTTP 200 with `errors[]` populated is a silent failure in xAPI.
- **Auto-fixable:** Yes — add `[API] [mutation] response errors[] is empty`.

### C-006: Missing Failure_Signals `[High]`
- **Detection:** Fewer than 2 failure signals listed.
- **Impact:** Agent doesn't have early warning indicators — waits for final assertion timeout.
- **Auto-fixable:** Yes — generate from Cross_Layer_Checks patterns (e.g., `4xx/5xx on endpoint`, `console.error`).

### C-007: Missing Cleanup `[Medium]`
- **Detection:** `Cleanup` column is empty (not even "none").
- **Impact:** State leakage between tests — cart items, created orders, etc. persist.
- **Auto-fixable:** Yes — infer from steps: mutations that create state → cleanup needed; read-only → `none`.

---

## Dimension 4: Testability

Ensures assertions can be objectively evaluated as PASS or FAIL with no human judgment.

### T-001: Vague assertion predicate `[High]`
- **Detection:** Assertion uses subjective language: "correctly", "properly", "as expected", "looks good", "works", "displays properly".
- **Bad:** `[DOM] page loads correctly`
- **Good:** `[DOM] product title 'Widget A' visible in h1`
- **Bad:** `[STATE] cart updated properly`
- **Good:** `[STATE] cart item count = 3`

### T-002: Missing element specification in DOM assertion `[High]`
- **Detection:** `[DOM]` assertion doesn't specify which element or what text/attribute to check.
- **Bad:** `[DOM] success message shown`
- **Good:** `[DOM] notification contains 'added to cart'`

### T-003: Missing formula in MATH assertion `[High]`
- **Detection:** `[MATH]` assertion states a calculation but doesn't provide the formula.
- **Bad:** `[MATH] total is correct`
- **Good:** `[MATH] line total = unit price x quantity (2 decimal places)`

### T-004: Untestable expected state `[Medium]`
- **Detection:** Assertion references a state that cannot be verified through available tools (DOM, API, console, network).
- **Bad:** `[STATE] email received by user` (no email checking tool)
- **Acceptable:** `[EMAIL] order confirmation email received within 60s` (if email verification is available)

---

## Dimension 5: Data Validity

Ensures all referenced data is valid and resolvable.

### DV-001: Unknown {{VAR}} token `[High]`
- **Detection:** `{{VAR}}` token not in the known env variable set: `FRONT_URL`, `BACK_URL`, `USER_EMAIL`, `USER_PASSWORD`, `ORG_USER_EMAIL`, `ORG_USER_PASSWORD`, `TEST_CARD_NUMBER`, `TEST_CARD_EXP`, `TEST_CARD_CVV`, `TEST_SKU`, `STORE_ID`, `CULTURE_NAME`, `CURRENCY_CODE`, `ADMIN_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- **Impact:** Agent can't resolve the variable — test fails on setup.

### DV-002: Hardcoded URL `[High]`
- **Detection:** Steps or Test_Data contain a full URL (http/https) instead of `{{FRONT_URL}}`, `{{BACK_URL}}`, or `{{ADMIN_URL}}`.
- **Bad:** `[NAV] https://vcst-qa-storefront.govirto.com/cart`
- **Good:** `[NAV] {{FRONT_URL}}/cart`
- **Auto-fixable:** Yes — replace known domains with corresponding `{{VAR}}`.

### DV-003: Hardcoded credentials `[Critical]`
- **Detection:** Steps contain email addresses or passwords as literal text.
- **Bad:** `[ACT] fill 'Email': admin@store.com`
- **Good:** `[ACT] fill 'Email': {{ADMIN_EMAIL}}`
- **Auto-fixable:** Yes — replace with matching `{{VAR}}`.

### DV-004: Referenced product/SKU not in test data `[Medium]`
- **Detection:** Steps reference a specific product name or SKU that isn't in `test-data/` or `{{TEST_SKU}}`.
- **Impact:** Test may fail if product was removed from catalog.
- **Note:** Generic references like "any in-stock product" are acceptable for exploratory-style cases.

### DV-005: Stale admin URL pattern `[Medium]`
- **Detection:** Admin navigation uses URL path that doesn't match current Admin SPA routes.
- **Check:** Compare against known admin route patterns from `agents/knowledge/sitemap.md`.

---

## Dimension 6: BL/ECL Coverage

Validates business logic traceability and edge case coverage.

### BL-001: Missing Business_Rule for Critical/High case `[Medium]`
- **Detection:** Priority is `Critical` or `High` but `Business_Rule` column is empty.
- **Impact:** No traceability to why this test exists — harder to assess regression impact.

### BL-002: Invalid BL-* reference `[Medium]`
- **Detection:** `Business_Rule` contains a BL-* ID that doesn't exist in `business-logic.md`.
- **Impact:** False traceability — the test claims to cover a rule that doesn't exist.

### BL-003: Missing ECL-* for high-risk domain `[Medium]`
- **Detection:** Test is in a P0/P1 domain (payment, cart, checkout, orders) but `Edge_Case_Refs` is empty.
- **Impact:** Edge cases are most valuable in high-risk areas.

### BL-004: Uncovered BL-* invariant `[Medium]`
- **Detection:** A BL-* invariant exists for this domain in `business-logic.md` but no test case in the suite references it.
- **Output:** List as coverage gap in the report.

### BL-005: Uncovered ECL-* pattern `[Medium]`
- **Detection:** An ECL-* pattern is relevant to this domain but no test case references it.
- **Output:** List as coverage gap in the report (informational — not all ECL patterns need coverage).

---

## Dimension 7: Duplication

Identifies redundant test cases that waste execution time without adding coverage value.

### DUP-001: Same-suite duplicate `[Medium]`
- **Detection:** Two cases in the same CSV have >80% step overlap AND test the same scenario from the same layer.
- **Heuristic:** Normalize steps (remove tags, lowercase, trim), compute Jaccard similarity on step sets.
- **Note:** Slight variations (different user roles, different products) are NOT duplicates if the variation tests a different code path.

### DUP-002: Cross-suite duplicate (same layer) `[Medium]`
- **Detection:** Two cases in different suites test the same scenario at the same layer (both storefront UI, or both API).
- **Action:** Recommend consolidating into the primary suite for that domain.

### DUP-003: Cross-suite duplicate (different layers) `[Informational]`
- **Detection:** Two cases test the same feature but from different layers (one via UI, one via API).
- **Action:** This is EXPECTED and good practice — flag as informational only, no action needed.

---

## Dimension 8: Environment Verification (Live — `--verify` only)

Requires browser. Delegated to `qa-testing-expert` agent via `playwright-firefox`. Validates that test case steps are executable against the current live environment.

### ENV-001: Page not reachable `[Blocker]`
- **Detection:** `qa-testing-expert` navigates to a URL from the Steps column and gets 404, 500, redirect loop, or timeout.
- **Impact:** Test case will fail immediately on the first NAV step.
- **Evidence:** Screenshot + HTTP status code.

### ENV-002: Referenced UI element missing `[Critical]`
- **Detection:** `qa-testing-expert` visits the page and the element referenced in `[ACT] click 'Button Name'` or `[DOM] element visible` does not exist in the DOM.
- **Impact:** Test case will fail when trying to interact with or assert on a non-existent element.
- **Evidence:** Screenshot of the page + DOM snapshot showing element not found.
- **Common causes:** UI redesign, button renamed, feature flag disabled, element behind a different user role.

### ENV-003: UI element renamed or relocated `[Critical]`
- **Detection:** `qa-testing-expert` finds a similar element with a different label (e.g., test says `'Return'` but page shows `'Request Return'`).
- **Impact:** Test case will fail on element lookup, but the feature still exists — just needs label update.
- **Auto-fixable:** Yes (with `--fix`) — update the label in Steps/Assertions columns.

### ENV-004: Feature not enabled or visible for test user `[High]`
- **Detection:** `qa-testing-expert` logs in with the test user credentials and the expected feature/section/menu item is not visible.
- **Impact:** Test case preconditions cannot be met — all steps after login will fail.
- **Common causes:** Feature flag off, user role missing permission, org-level setting disabled, store config change.

### ENV-005: Login failure with test credentials `[Blocker]`
- **Detection:** `qa-testing-expert` attempts to log in with `{{USER_EMAIL}}`/`{{ORG_USER_EMAIL}}` credentials and login fails.
- **Impact:** All authenticated test cases will fail.
- **Note:** This may be an environment issue, not a test case defect — flag for investigation.

### ENV-006: Console errors on page load `[High]`
- **Detection:** `qa-testing-expert` captures console errors (JS TypeError, 404 for assets, failed API calls) on a page referenced by test cases.
- **Impact:** May cause intermittent failures or incorrect state during test execution.
- **Evidence:** Console log dump + network errors list.

### ENV-007: Flow blocked at intermediate step `[Critical]`
- **Detection:** `qa-testing-expert` walks through the first 3-4 steps of a P0/Critical case and gets blocked (modal doesn't appear, next page doesn't load, action has no effect).
- **Impact:** Test case describes a flow that no longer works as written.
- **Evidence:** Screenshot at the point of blockage + console log.

---

## Severity Decision Matrix

| Severity | Criteria | Action Required |
|----------|----------|-----------------|
| **Blocker** | Test case cannot be parsed or executed at all | Must fix before regression run |
| **Critical** | Test case will produce flaky or unreliable results | Should fix before regression run |
| **High** | Test case can execute but may miss real bugs | Fix when convenient |
| **Medium** | Informational finding — coverage or traceability gap | Track for improvement |
| **Informational** | Expected pattern (e.g., cross-layer duplication) | No action needed |
