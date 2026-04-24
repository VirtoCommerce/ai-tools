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

### C-008: Implicit case ordering in Preconditions `[High]`
- **Detection:** `Preconditions` says "after running <ID>", "following <ID>", "requires <ID> to have passed", or similar phrases that describe prior-case execution rather than required state. ISTQB rule: cases must be independent — preconditions are expressed as **state**, not as prior test runs.
- **Bad:** `Preconditions: CART-007 must be run first`
- **Good:** `Preconditions: cart contains {{TEST_SKU}} at quantity 1, user logged in as {{USER_EMAIL}}`
- **Allowed exception:** `Preconditions: state from <ID>` is permitted **only** when it unambiguously references the end-state of another case that itself has an enumerated state description. This is the codified form of DUP-004 (avoid-repetition-by-reference), not an escape hatch for order-dependence.
- **Auto-fixable:** No — requires restating the flow as explicit state.

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

### DV-006: Invalid GraphQL query/mutation name `[Blocker]`
- **Detection:** (GraphQL suites only) Steps contain a query or mutation name that does not exist in the live schema. Reference: `agents/knowledge/graphql-schema.md`.
- **Bad:** `mutation { createCart(storeId: "...") { id } }` — `createCart` does not exist
- **Good:** `query { cart(storeId: "..." currencyCode: "USD") { id } }` — `cart` query exists and auto-creates
- **Auto-fixable:** No — requires understanding the correct alternative operation.

### DV-007: Missing command wrapper on GraphQL mutation `[Blocker]`
- **Detection:** (GraphQL suites only) A mutation uses direct args instead of the `command` input wrapper.
- **Bad:** `mutation { addItem(cartId: "..." productId: "..." quantity: 1) { id } }`
- **Good:** `mutation { addItem(command: { cartId: "..." productId: "..." quantity: 1 }) { id } }`
- **Auto-fixable:** Yes — wrap args in `command: { ... }`.

### DV-008: Wrong GraphQL argument name `[Blocker]`
- **Detection:** (GraphQL suites only) Query/mutation uses an argument name that doesn't exist on that operation.
- **Bad:** `products(keyword: "laptop")` — should be `query`; `products(facetQuery: "brand")` — should be `facet`
- **Check:** Compare arg names against `graphql-schema.md` query/mutation signatures.
- **Auto-fixable:** Yes — replace with correct arg name from schema.

### DV-009: Wrong GraphQL response field name `[Critical]`
- **Detection:** (GraphQL suites only) Assertions or inline queries reference fields that don't exist on the return type.
- **Bad:** `totals { subTotal { amount } }` on CartType (flat field, not nested), `facets { values }` on ProductConnection (use `term_facets { terms }`), `availability` on VariationType (use `availabilityData`), `shippingAddress` on CustomerOrderType (use `addresses[]`)
- **Check:** Compare response field names against `graphql-schema.md` type definitions.
- **Auto-fixable:** Yes — replace with correct field name.

### DV-010: Invalid field in GraphQL input type `[Critical]`
- **Detection:** (GraphQL suites only) Mutation command contains a field that doesn't exist on the input type.
- **Bad:** `createOrganization(command: { name: "...", storeId: "..." })` — `InputCreateOrganizationType` has no `storeId`
- **Check:** Compare command fields against `graphql-schema.md` input type definitions.
- **Auto-fixable:** Yes — remove the invalid field.

### DV-011: Wrong MoneyType field structure `[Critical]`
- **Detection:** (GraphQL suites only) Query/assertion uses `currencyCode` directly on a MoneyType field instead of `currency { code }`.
- **Bad:** `listPrice { amount currencyCode }`
- **Good:** `listPrice { amount currency { code } }`
- **Auto-fixable:** Yes — replace `currencyCode` with `currency { code }`.

### DV-013: Hardcoded entity ID / GUID `[High]`
- **Detection:** Steps, Assertions, Preconditions, or Test_Data contain a UUID/GUID literal (`[0-9a-f]{8}-[0-9a-f]{4}-...`) or numeric entity ID that refers to a product, catalog, category, user, organization, or order. Exception: documented **environment constants** in `.claude/agents/knowledge/catalog.md` or `knowledge/store-settings.md` (e.g., virtual-catalog root `fc596540...`, store ID `B2B-store`) are allowed because they are stable across deploys.
- **Impact:** QA environment is re-seeded frequently; hardcoded GUIDs become "not found" → false BLOCKED/FAIL. Root cause from the Golden Rule memory: #1 source of false failures.
- **Bad:** `productId: 58b856c7-da60-460f-afe0-3b2e7a03a2d6`
- **Good:** "any in-stock product from B2B virtual catalog (`category.subtree:fc596540...`) — resolve first card on category page at runtime" OR `@td(PRODUCT_BIKE.id)` via the `@td()` resolver.
- **Auto-fixable:** No — requires domain choice on how to resolve.

### DV-014: Hardcoded SKU or product identifier `[High]`
- **Detection:** Steps, Assertions, or Test_Data contain a literal SKU like `KC3000-1TB`, a product name like `Kingston KC3000 1TB`, or a variant code that is not the generic `{{TEST_SKU}}` placeholder or a `TEST-*` seeded pattern. Exception: product fixtures explicitly seeded for the suite under `test-data/products/*.csv` and resolved via `@td(ALIAS.field)`.
- **Impact:** Catalog re-imports rename products; hardcoded SKUs break the test without indicating a real defect.
- **Bad:** `[NAV] {{FRONT_URL}}/product/kingston-kc3000-1tb` with assertion `[DOM] title = 'Kingston KC3000 1TB'`
- **Good:** "Any simple product SKU" OR `@td(CFG_TSHIRT.sku)` OR a regex shape assertion `[NAV] URL matches /product/[a-z0-9-]+`
- **Auto-fixable:** No — requires resolver wiring or generic phrasing.

### DV-015: Hardcoded user email or literal identity `[High]`
- **Detection:** Steps or Preconditions contain a literal email (e.g., `john.smith.2024@example.com`, `test-emily.johnson-20260310@test-agent.com`) instead of the agent-user-pool slot reference or a known `{{*_EMAIL}}` env var. The canonical pool at `test-data/users/agent-user-pool.csv` is referenced **by role/slot**, never by literal email. Throwaway users use pattern `{purpose}-{timestamp}@test-agent.com` generated at runtime.
- **Impact:** Pool accounts get rotated and re-seeded; stale literal emails lead to login failure → false BLOCKED.
- **Bad:** `[ACT] fill 'Email': test-emily.johnson-20260310@test-agent.com`
- **Good:** `[ACT] fill 'Email': {{ORG_USER_EMAIL}}` OR "Login as any TechFlow org maintainer (pool slot 2)"
- **Auto-fixable:** Partial — literal emails matching known env vars can be replaced; unknown emails need manual review.

### DV-016: Exact-value assertion on environment-dependent data `[High]`
- **Detection:** Assertions contain literal prices (e.g., `$99.99`, `subtotal = 299.99`), literal order numbers (`CO260421-00005`), literal URL slugs (`/product/kingston-kc3000`), literal section titles derived from catalog content, or literal count values tied to current catalog state. The Golden Rule: assert **structural invariants** (ordering, math identity, relation, shape/regex), never the literal.
- **Impact:** Product data, pricing, and slugs change over time; assertions fail without any product defect. Pattern is #2 cause of false failures after hardcoded GUIDs.
- **Bad examples:**
  - `[MATH] subtotal = $299.99`
  - `[NAV] URL is /product/kingston-kc3000-1tb`
  - `[DOM] section title = 'Rear wheel 26 double-wall'`
  - `[STATE] order number = CO260421-00005`
- **Good examples:**
  - `[MATH] subtotal = line total 1 + line total 2 + ... (2 decimal places)` (math identity)
  - `[MATH] subtotal > 0 AND total = subtotal + tax + shipping` (invariant)
  - `[NAV] URL matches /product/[a-z0-9-]+` (shape/regex)
  - `[FORMAT] order number matches /^CO\d{6}-\d{5}$/` (shape)
  - `[STATE] capture order number from confirmation page → reference as {{ORDER_ID}} in downstream steps` (runtime-captured variable)
- **Auto-fixable:** No — requires choosing the right invariant (identity, ordering, relation, shape).

### DV-017: Hardcoded fixture literal (address, coupon, etc.) `[Medium]`
- **Detection:** Steps or Test_Data contain a literal address (street, city, zip lines), coupon code (`SAVE20`), or similar fixture value that could be resolved via `@td()` against `test-data/`. Exception: one-off values clearly documented as "for this test only" with an inline comment explaining why a fixture was not used.
- **Impact:** Fixtures get refreshed (coupons expire, addresses get reseeded); duplicated literals across cases make updates expensive.
- **Bad:** `[ACT] fill 'Coupon': SAVE20`
- **Good:** `[ACT] fill 'Coupon': @td(COUPON_PERCENTAGE_OFF.code)` OR semantic fixture name documented in `test-data/aliases.json`
- **Auto-fixable:** Partial — reviewer can propose the `@td()` form if a matching alias exists in `test-data/aliases.json`; authoring a new alias requires human action.

### DV-018: Magic number without named constant `[Medium]`
- **Detection:** Steps/Assertions/Failure_Signals contain raw numeric literals for timeouts, quantities, TTLs, thresholds, or retry counts without a short justification/naming comment. Inline regex literals and math formulas are exempt.
- **Impact:** Intent of the number is opaque; tuning is error-prone across cases.
- **Bad:** `[WAIT] 5000ms after click` ; `[ACT] set quantity to 50`
- **Good:** `[WAIT] STEPPER_DEBOUNCE_MS (300) after quantity change` ; `[ACT] set quantity to MAX_QTY_PER_LINE (50) — boundary of BL-CART-003`
- **Auto-fixable:** No — requires the author's domain intent.

### DV-012: Thin field selection on GraphQL happy-path test `[High]`
- **Detection:** (GraphQL suites only) A happy-path query/mutation test requests a minimal selection set (e.g., `{ id }`, `{ totalCount }`, single-field or 2-field subset) without a Steps-column comment identifying it as a permitted exception. Policy: `SKILL.md` (qa-api) → "Happy-path field selection" and `api-test-case-patterns.md` → "Happy Path Patterns".
- **Rule:** Happy-path tests MUST request the full field selection set of the return type — all non-deprecated scalar fields plus at least one level of expansion for every nested object (`{ amount currency { code } }`, not just `{ amount }`).
- **Permitted exceptions** (the Steps column MUST include a comment naming the role):
  1. Counter/invariant probe before/after a mutation (e.g., `{ totalCount }` for duplicate-skip verification)
  2. Cross-layer roundtrip querying only the fields needed to match a prior write
  3. Dedicated "minimal selection" schema-coverage test (one per operation, per `graphql-checklist.md:141-144`)
- **Bad:** `query { currentCustomerAddresses(first: 50) { items { id } } }` on a happy-path test with no exception comment — null checks and nested resolver correctness are not observable.
- **Good:** `query { currentCustomerAddresses(first: 50) { totalCount items { id line1 line2 city countryCode countryName postalCode regionId regionName addressType isFavorite firstName lastName organization phone email } } }` — full contract covered.
- **Good (exception):** `query { currentCustomerAddresses(first: 50) { totalCount } }  # counter probe — <COUNT_BEFORE> vs <COUNT_AFTER> for duplicate-skip invariant` — role named in Steps.
- **Auto-fixable:** Partial — reviewer can expand to full selection from `graphql-schema.md` type definition, but should flag for human confirmation when the test's role is ambiguous (counter probe vs. under-specified happy path).

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

### REQ-001: Missing requirement link for Critical/High case `[High]`
- **Detection:** Priority is `Critical` or `High` but `References` column contains no JIRA ticket (`VCST-XXXX`), requirement ID (`REQ-*`), or user-story link. A lone `BL-*` in References does not satisfy this — BL-* belongs in `Business_Rule`; `References` is for the **source of demand** (ticket, story, acceptance criterion).
- **Impact:** No traceability from test to requirement — cannot answer "which requirement is at risk if this case fails?" or "which cases cover VCST-XXXX?".
- **Bad:** `References: BL-CART-001` (only an internal invariant, no ticket)
- **Good:** `References: VCST-4499` or `References: VCST-4499, VCST-3387`
- **Exception:** Infrastructure/smoke cases with no originating ticket may use `References: smoke-baseline` (explicit placeholder, not empty).
- **Auto-fixable:** No — requires looking up the originating ticket.

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

### DUP-004: Repeated preconditions instead of reference `[Medium]`
- **Detection:** A case's `Steps` column restates a setup flow (login, add-to-cart, create-org) whose first ≥70% of tagged lines match another earlier case in the same suite. ISTQB rule: avoid repetition — reference another case's ID in preconditions instead of duplicating its steps.
- **Bad:** CART-014 restates the 6 login + navigate + add-to-cart steps from CART-007 before testing quantity update.
- **Good:** CART-014 `Preconditions: state from CART-007 (user logged in, {{TEST_SKU}} in cart, qty=1)` and `Steps:` starts from the quantity-update action.
- **Auto-fixable:** Partial — reviewer can detect the overlap and propose the `state from <ID>` preamble, but the reduced Steps block requires human confirmation that no necessary context is lost.
- **Interaction with C-008:** `state from <ID>` references are allowed and are the *correct* way to avoid repetition. Only order-dependent phrasing ("after running <ID>") is forbidden.

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

## Dimension 9: Technique Coverage (Static)

Validates that every feature block covers the ISTQB-minimum mix of design techniques: **positive (happy path) + negative (invalid input / error handling) + boundary (edge of partition)**. Applied per **feature group** (rows sharing the same `Section` parent or `References` ticket), not per individual case.

### TC-001: Feature lacks positive + negative + boundary mix `[Medium]`
- **Detection:** Group rows by `Section` parent (e.g., `Cart > Add`) or by ticket in `References`. For each group with ≥3 cases, check that the set covers:
  1. **At least 1 positive** — a happy-path case (no `error`, `invalid`, `expired`, `rejected`, `fail` keywords in Title).
  2. **At least 1 negative** — an invalid-input / permission-denied / error-state case.
  3. **At least 1 boundary** — when any input in the feature is numeric, ordered, or quantity-based (price, quantity, date range, string length, pagination). If the feature has no ordered inputs, boundary is waived.
- **Groups with <3 cases** are exempt (assumed to be narrow scope — not a feature block).
- **Bad:** A `Cart > Coupon` group with 5 cases, all happy-path variations of valid coupon codes. No invalid-coupon case, no max-discount-cap boundary.
- **Good:** 1× valid coupon applies, 1× expired coupon rejected, 1× coupon exceeds cart subtotal cap (boundary).
- **Output:** List the feature group, which of {positive, negative, boundary} is missing, and suggest a case title seed (e.g., "add: expired-coupon rejection; add: boundary at max-cap").
- **Auto-fixable:** No — generating the missing case requires domain judgment. Hand off to `/qa-test-cases-generator` with the gap as input.

---

## Severity Decision Matrix

| Severity | Criteria | Action Required |
|----------|----------|-----------------|
| **Blocker** | Test case cannot be parsed or executed at all | Must fix before regression run |
| **Critical** | Test case will produce flaky or unreliable results | Should fix before regression run |
| **High** | Test case can execute but may miss real bugs | Fix when convenient |
| **Medium** | Informational finding — coverage or traceability gap | Track for improvement |
| **Informational** | Expected pattern (e.g., cross-layer duplication) | No action needed |
