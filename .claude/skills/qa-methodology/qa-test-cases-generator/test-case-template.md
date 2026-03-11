# Test Case Template — Agent-Native CSV Format

Defines the enriched CSV column specification for all regression suites. Replaces the legacy TestRail format. Designed for AI agents executing tests via MCP browser tools.

---

## Column Specification

```
ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status
```

### Removed from legacy format
- `Type` — always "Functional"; removed as noise
- `Estimate` — human-time estimate; irrelevant to agents

### New columns
- `Business_Rule` — why this test exists (BL-* invariant ID)
- `Edge_Case_Refs` — ECL section(s) this test covers
- `Test_Data` — `{{VAR}}` bindings only, separated from preconditions
- `Assertions` — explicit, checkable predicates (separated from Steps)
- `Cross_Layer_Checks` — API / console / network verification
- `Failure_Signals` — patterns to watch for before final assertion fails
- `Cleanup` — state restoration after test

---

## Column Definitions

### ID
Format: `SUITE-NNN` (e.g., `SMK-001`, `CART-014`, `API-032`). Stable identifier. Never reuse or renumber.

### Title
Short, action-oriented label. Pattern: `[Subject] — [Action/Scenario]`. Examples:
- `Add to Cart — Product Page`
- `Checkout — Duplicate Order on Double-Click`
- `B2C Variation — Price Updates on Option Switch`

### Section
Hierarchy path: `Suite > Domain > Sub-area`. Examples:
- `Smoke > Cart`
- `Cart > Add > Quantity`
- `Payment > CyberSource > Form Validation`

### Priority
`Critical` | `High` | `Medium` | `Low`

Maps to P0/P1/P2/P3:
- `Critical` = P0 — must pass before deployment
- `High` = P1 — must pass before sprint release
- `Medium` = P2 — should pass
- `Low` = P3 — nice to have

### Business_Rule
One or more `BL-*` invariant IDs from `business-logic.md`, comma-separated.
This tells the agent *why* the test exists and how to classify ambiguous results.

Examples: `BL-CART-001`, `BL-PRICE-001, BL-PRICE-004`, `BL-ORD-001`

Leave blank only for pure UI/UX tests with no mapped invariant.

### Edge_Case_Refs
One or more ECL section references from `e-commerce-edge-cases-library.md`, comma-separated.
Format: `ECL-[section].[subsection]`

Examples: `ECL-1.2`, `ECL-7.3, ECL-2.1`, `ECL-14.3`

Tells the agent which known failure patterns to actively look for during execution.

### Preconditions
Human-readable state requirements before the test can run. Use `{{VAR}}` for env-bound values.

Examples:
- `User logged in as {{USER_EMAIL}}, cart empty`
- `B2C variation product with VirtoFrontend_UI_Layout=B2C property exists in catalog`
- `{{FRONT_URL}} accessible, search index healthy`

### Test_Data
Explicit `{{VAR}}` bindings only. Comma-separated `key={{VAR}}` pairs.
Do NOT put freeform text here — only structured variable bindings the agent will substitute.

Available env variables (from `.env`): `FRONT_URL`, `BACK_URL`, `USER_EMAIL`, `USER_PASSWORD`,
`ORG_USER_EMAIL`, `ORG_USER_PASSWORD`, `TEST_CARD_NUMBER`, `TEST_CARD_EXP`, `TEST_CARD_CVV`,
`TEST_SKU`, `STORE_ID`, `CULTURE_NAME`, `CURRENCY_CODE`, `ADMIN_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`

Example: `email={{USER_EMAIL}}, password={{USER_PASSWORD}}, sku={{TEST_SKU}}, front_url={{FRONT_URL}}`

### Steps
Typed action steps only — no assertions here (those go in `Assertions`).
Each step on its own line, prefixed with a type tag.

**Step type tags:**

| Tag | Meaning | Agent Action |
|-----|---------|-------------|
| `[NAV]` | Navigate to URL | `browser_navigate` |
| `[ACT]` | User action: click, fill, select, hover | `browser_click`, `browser_fill`, `browser_select_option` |
| `[WAIT]` | Wait for condition before proceeding | `browser_wait_for` |
| `[ASSERT]` | Inline assertion within a step sequence | `browser_snapshot` + evaluate |
| `[SCROLL]` | Scroll to element or position | `browser_evaluate` scroll |
| `[KEY]` | Press keyboard key | `browser_press_key` |

Example:
```
[NAV] {{FRONT_URL}}/cart
[WAIT] cart page loads with at least 1 item
[ACT] click '+' (increase quantity) on first item
[WAIT] quantity value increments
[ASSERT] line total = previous line total + unit price
[ACT] click 'Remove' icon on item
[WAIT] item removed from list
```

**Rules:**
- Use actual UI labels in quotes: `click 'Add to Cart'` not `click submit button`
- For fill steps: `fill 'Email': {{USER_EMAIL}}`
- One action per line — no compound steps
- WAIT after every ACT that triggers a state change

### Assertions
Explicit, checkable predicates. Each on its own line, prefixed with assertion target tag.

**Assertion target tags:**

| Tag | Checks |
|-----|--------|
| `[DOM]` | Element visible, text content, attribute value, enabled/disabled state |
| `[STATE]` | Application state (logged in, item in cart, order created) |
| `[MATH]` | Numeric calculation verification |
| `[FORMAT]` | Display format (2 decimal places, date format, etc.) |
| `[NAV]` | Current URL matches expected path |

Examples:
```
[DOM] 'Add to Cart' button disabled before any option selected
[DOM] success notification contains 'added' or 'cart' text
[DOM] cart badge increments by exactly 1
[STATE] product SKU appears in cart items
[MATH] line total = unit price × quantity (2 decimal places)
[FORMAT] all prices display with exactly 2 decimal places
[NAV] URL is /order/confirmation after Place Order
```

### Cross_Layer_Checks
API, console, and network verification. Each on its own line, prefixed with layer tag.

**Layer tags:**

| Tag | Checks |
|-----|--------|
| `[API]` | GraphQL mutation/query response, HTTP status, response body |
| `[CONSOLE]` | Browser console — errors, warnings |
| `[NETWORK]` | Network tab — HTTP status codes, failed requests |
| `[ADMIN]` | Verification in admin panel (VC back-office) |
| `[EMAIL]` | Email notification sent (check via Hangfire or test email) |

Examples:
```
[API] addItem mutation returns HTTP 200, errors[] is empty
[API] cart.items contains sku={{TEST_SKU}} after add
[CONSOLE] no TypeError or JS errors during add action
[NETWORK] no 4xx/5xx on /xapi/graphql during checkout
[ADMIN] order appears in admin with status 'New'
[EMAIL] order confirmation email received within 60s
```

**xAPI invariant:** Always check `errors[]` in GraphQL mutation responses — HTTP 200 does NOT mean success in xAPI.

### Failure_Signals
Patterns the agent should watch for during execution as early indicators of failure.
These trigger before the final assertion fails — catching issues sooner.

Comma-separated list of observable signals.

Examples:
- `Spinner visible >5s`
- `4xx/5xx on /xapi/graphql (addItem mutation)`
- `console.error with TypeError`
- `Cart badge unchanged after 3s`
- `errors[] non-empty in GraphQL response`
- `Redirect to /error page`
- `Payment form blank (iframe blocked)`

### Cleanup
What to restore after the test, to avoid state leakage between tests.

Examples:
- `Remove {{TEST_SKU}} from cart (removeCartItem mutation or UI)`
- `Sign out if test signed in as different user`
- `none` (if test leaves no side effects)
- `Cancel created order via admin if order was placed`

### References
JIRA ticket IDs, sprint test IDs, or other test case IDs. Space or comma separated.
Examples: `VCST-4499`, `VCST-3387 VCST-4499`, `BL-CART-001`

### Automation_Status
`Automated` | `Manual` | `Semi-Automated`

---

## Full Worked Example

### SMK-007 — Add to Cart: Single Product

```csv
SMK-007,
"Add to Cart — Single Product",
"Smoke > Cart",
Critical,
BL-CART-001,
"ECL-2.1, ECL-7.3",
"User logged in as {{USER_EMAIL}}, product {{TEST_SKU}} in stock, cart at known state",
"email={{USER_EMAIL}}, password={{USER_PASSWORD}}, sku={{TEST_SKU}}, front_url={{FRONT_URL}}",
"[NAV] {{FRONT_URL}}/product/{{TEST_SKU}}
[WAIT] 'Add to Cart' button visible and enabled
[ACT] set quantity to 1 (spinbutton value = 1)
[ACT] click 'Add to Cart'
[WAIT] success notification visible OR cart badge increments",
"[DOM] toast/notification contains 'added' or 'cart' text
[DOM] cart icon badge increments by 1
[STATE] product appears in cart (mini-cart or cart page)
[FORMAT] all prices display with exactly 2 decimal places",
"[API] POST /xapi/graphql (addItem mutation) returns HTTP 200
[API] addItem response errors[] is empty (not just HTTP 200)
[API] cart.items contains item with sku={{TEST_SKU}}
[CONSOLE] no TypeError or JS errors during add action
[NETWORK] no 4xx/5xx on addItem request",
"Spinner visible >5s after click, errors[] non-empty in addItem response, cart badge unchanged after 3s, 4xx/5xx on addItem, console TypeError",
"Remove {{TEST_SKU}} from cart after test (removeCartItem mutation or UI)",
VCST-4499,
Automated
```

---

## Writing Guidelines

### Step precision
Write steps as an agent with no prior knowledge would execute them:
- Wrong: `"Navigate to cart and update quantity"`
- Right:
  ```
  [NAV] {{FRONT_URL}}/cart
  [WAIT] cart page loaded
  [ACT] click '+' (increase quantity) on first item
  [WAIT] quantity value increments
  ```

### Assertion separation
Never mix assertions into steps. Wrong:
```
[ACT] click 'Add to Cart'  ← OK
[ACT] verify cart updated  ← WRONG (this is an assertion)
```
Right:
```
Steps: [ACT] click 'Add to Cart'
Assertions: [DOM] cart badge increments by 1
```

### Data binding
Always use `{{VAR}}` syntax — never hardcode URLs, emails, or passwords in steps.
- Wrong: `[NAV] https://vcst-qa-storefront.govirto.com/cart`
- Right: `[NAV] {{FRONT_URL}}/cart`

### Cross-layer invariant: GraphQL errors[]
Every test that calls a mutation MUST include this in Cross_Layer_Checks:
```
[API] [mutation name] response errors[] is empty
```
HTTP 200 from xAPI does not indicate success.

### Failure signals vs assertions
- **Failure signal** = early warning the agent can detect *during* execution (before the final state)
- **Assertion** = final pass/fail verdict on test completion

Include at least 2 failure signals per test — typically: timeout signal + API error signal.

---

## Migration from Legacy Format

| Legacy Column | New Column(s) | Notes |
|---------------|--------------|-------|
| `Type` | — | Removed |
| `Estimate` | — | Removed |
| `Preconditions` | `Preconditions` + `Test_Data` | Split: prose → Preconditions; `{{VAR}}` bindings → Test_Data |
| `Steps` | `Steps` + `Assertions` | Split: actions → Steps (with type tags); expected outcomes → Assertions |
| `Expected Result` | `Assertions` + `Cross_Layer_Checks` | UI assertions → Assertions; API/console → Cross_Layer_Checks |
| — | `Business_Rule` | New — map to BL-* from `business-logic.md` |
| — | `Edge_Case_Refs` | New — map to ECL sections |
| — | `Failure_Signals` | New — early warning patterns |
| — | `Cleanup` | New — state restoration |
