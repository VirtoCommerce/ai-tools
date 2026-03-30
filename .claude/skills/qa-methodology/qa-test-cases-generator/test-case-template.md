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

> These tags apply to **Storefront UI** tests. For other layers see: REST API → `[HTTP]` `[AUTH]` `[SETUP]` `[TEARDOWN]`; GraphQL → `[NAV]` `[AUTH]` `[ACT]` `[GQL]` `[READ]` `[SETUP]` `[TEARDOWN]`; Admin UI → `[BLADE]` `[GRID]` `[SAVE]` `[WIDGET]`. Full definitions in the Layer-Specific Formats section below.

| Tag | Meaning | Agent Action |
|-----|---------|-------------|
| `[NAV]` | Navigate to URL | `browser_navigate` |
| `[ACT]` | User action: click, fill, select, hover | `browser_click`, `browser_fill`, `browser_select_option` |
| `[WAIT]` | Wait for condition before proceeding | `browser_wait_for` |
| `[ASSERT]` | Mid-flow inline check — gate before continuing (e.g. verify precondition mid-sequence). NOT a final assertion. Final pass/fail verdicts go in the `Assertions` column. | `browser_snapshot` + evaluate |
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

> These tags apply to **Storefront UI** tests. For other layers: REST API → `[STATUS]` `[BODY]` `[SCHEMA]` `[HEADER]` `[PERF]`; GraphQL → `[ERRORS]` `[DATA]` `[NULL]` `[COUNT]` `[MATH]` `[PERF]`; Admin UI → `[TOAST]` `[FORM]` `[BLADE]` `[GRID]`. Full definitions in the Layer-Specific Formats section below.

| Tag | Checks |
|-----|--------|
| `[DOM]` | Element visible, text content, attribute value, enabled/disabled state |
| `[STATE]` | Application state (logged in, item in cart, order created) |
| `[MATH]` | Numeric calculation verification (also used in GraphQL layer) |
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
[NETWORK] no 4xx/5xx on /graphql during checkout
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
- `4xx/5xx on /graphql (addItem mutation)`
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
"[API] POST /graphql (addItem mutation) returns HTTP 200
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

## Layer-Specific Formats

The base 15-column structure stays the same across all layers. What changes is the **step tags**, **assertion tags**, and **cross-layer check patterns** used inside the columns.

### Layer: REST API

Tests executed via Postman MCP or `browser_evaluate` (fetch). No browser UI interaction.

**Step tags (Steps column):**

| Tag | Meaning | Agent Action |
|-----|---------|-------------|
| `[HTTP]` | Send HTTP request (method + endpoint + body) | Postman MCP `runCollection` or `browser_evaluate` fetch |
| `[AUTH]` | Authenticate and store token | POST to `/connect/token`, save Bearer token |
| `[SETUP]` | Create prerequisite data via API | POST to create test entity |
| `[TEARDOWN]` | Delete test data via API | DELETE to clean up |
| `[WAIT]` | Wait for async processing | Poll or delay |

**Assertion tags (Assertions column):**

| Tag | Checks |
|-----|--------|
| `[STATUS]` | HTTP status code (200, 201, 400, 401, 404) |
| `[BODY]` | Response body field exists, has expected value/type |
| `[SCHEMA]` | Response matches expected JSON structure |
| `[HEADER]` | Response header present/correct (CORS, Content-Type, security headers) |
| `[PERF]` | Response time within threshold |

**Cross-layer (Cross_Layer_Checks column):**

| Tag | Checks |
|-----|--------|
| `[DB]` | Data persisted — verify via GET after POST/PUT |
| `[SEARCH]` | If indexed entity, verify search returns it after reindex lag |
| `[ADMIN]` | Entity visible in Admin SPA after API create/update |
| `[EVENT]` | Platform event fired (check via `/api/platform/pushnotifications`) |

**Worked example:** see `test-case-examples.md` → REST API — API-042

---

### Layer: GraphQL xAPI

Tests executed in the **GraphiQL UI** at `{{BACK_URL}}/ui/graphiql`. GraphiQL uses CodeMirror editors — see `graphiql-interaction.md` for reliable interaction patterns (auth token, editor, execute). Key rules: **HTTP 200 ≠ success** — always check `errors[]`; **all cart mutations require `userId`**; **shipment mutations require `price` matching rate**. See **"GraphQL mutation validation"** section below for mandatory 3-step validation before test case approval.

**Step tags (Steps column):**

| Tag | Meaning | Agent Action |
|-----|---------|-------------|
| `[NAV]` | Navigate to GraphiQL UI | `browser_navigate` to `{{BACK_URL}}/ui/graphiql` |
| `[AUTH]` | Set Bearer token in Headers tab | Obtain token via POST `{{BACK_URL}}/connect/token`, set in Headers editor via `execCommand('insertText')` — see `graphiql-interaction.md § Setting Auth Token`. MUST verify token appears in Headers panel (not Variables) |
| `[ACT]` | Interact with GraphiQL editor | Click editor → Ctrl+A → Backspace → type query/mutation via `browser_type` |
| `[GQL]` | Execute GraphQL query or mutation | Click Execute (▶) button or press Ctrl+Enter |
| `[READ]` | Read response from response panel | `browser_snapshot` or `browser_evaluate` to extract response JSON |
| `[SETUP]` | Create prerequisite data (cart, user, product) | Execute setup mutations in GraphiQL or REST API |
| `[TEARDOWN]` | Clean up created data | Execute cleanup mutations in GraphiQL or REST API |
| `[WAIT]` | Wait for async processing (reindex, event) | Poll or delay |
| `[VAR]` | Extract value from response for next step | Save `id` from response panel |

**Assertion tags (Assertions column):**

| Tag | Checks |
|-----|--------|
| `[RESPONSE]` | Response panel shows data (no red error banner in GraphiQL) |
| `[ERRORS]` | `errors[]` is empty (or contains expected error for negative tests) |
| `[DATA]` | Response `data` field has expected structure and values |
| `[NULL]` | Specific field is null or non-null as expected |
| `[COUNT]` | `totalCount` or array length matches expectation |
| `[MATH]` | Calculated field (totals, subtotals) matches formula |
| `[PERF]` | Query execution time within threshold |

**Cross-layer (Cross_Layer_Checks column):**

| Tag | Checks |
|-----|--------|
| `[ROUNDTRIP]` | Mutation → clear editor → type query → execute → confirms data persisted |
| `[STOREFRONT]` | Storefront UI reflects the GraphQL state change |
| `[ADMIN]` | Admin SPA shows the entity/change |
| `[CONSOLE]` | No JS errors in GraphiQL during execution |
| `[EVENT]` | Platform events/notifications triggered |

**Worked example:** see `test-case-examples.md` → GraphQL xAPI — GQL-042

---

### Layer: Admin UI

Tests executed via Playwright MCP (Edge or Chrome) against Admin SPA (`{{BACK_URL}}`). Admin uses blade navigation pattern — blades slide in from right.

**Step tags (Steps column):**

| Tag | Meaning | Agent Action |
|-----|---------|-------------|
| `[NAV]` | Navigate to Admin URL or menu item | `browser_navigate` to `{{BACK_URL}}/...` |
| `[BLADE]` | Wait for blade to open/close | `browser_wait_for` blade container |
| `[ACT]` | Click, fill, select in Admin form | `browser_click`, `browser_fill` |
| `[GRID]` | Interact with Admin grid (search, sort, filter, paginate) | Grid-specific selectors |
| `[WIDGET]` | Interact with Admin widget (dashboard card, chart) | Widget-specific selectors |
| `[SAVE]` | Click Save/OK in blade and wait for confirmation | Save + wait for success notification |
| `[WAIT]` | Wait for loading spinner, data refresh | `browser_wait_for` |
| `[KEY]` | Keyboard shortcut in Admin | `browser_press_key` |

**Assertion tags (Assertions column):**

| Tag | Checks |
|-----|--------|
| `[DOM]` | Element visible, text content, form field value |
| `[BLADE]` | Correct blade title, blade count, blade closed |
| `[GRID]` | Row count, cell value, sort order, filter applied |
| `[TOAST]` | Success/error notification message |
| `[FORM]` | Field value persisted after save, validation error shown |
| `[NAV]` | Current URL or breadcrumb matches expected |

**Cross-layer (Cross_Layer_Checks column):**

| Tag | Checks |
|-----|--------|
| `[API]` | REST/GraphQL confirms admin change persisted |
| `[STOREFRONT]` | Storefront reflects admin change (after reindex if catalog) |
| `[CONSOLE]` | No JS errors in Admin SPA console |
| `[NETWORK]` | No failed API calls (4xx/5xx) in network tab |
| `[SEARCH]` | Search index updated after catalog/pricing changes (30-60s lag) |

**Worked example:** see `test-case-examples.md` → Admin UI — ADM-042

---

### Layer: E2E Cross-Layer Flow

End-to-end tests that span multiple layers. These are the highest-value tests — they verify the full user journey across storefront, API, and admin.

**Step tags:** Combine tags from all layers. Prefix each block with a layer marker:

| Marker | Scope |
|--------|-------|
| `--- STOREFRONT ---` | Steps in the customer-facing storefront |
| `--- API ---` | Direct API/GraphQL verification steps |
| `--- ADMIN ---` | Steps in the Admin SPA |

Within each block, use that layer's step tags (`[NAV]`/`[ACT]` for UI, `[HTTP]`/`[GQL]` for API, `[BLADE]`/`[GRID]` for Admin).

**Assertion tags:** Use all layer assertion tags. Every E2E case MUST have assertions from at least 2 different layers.

**Worked example:** see `test-case-examples.md` → E2E Cross-Layer — E2E-042

---

### Layer Detection Rules

When generating test cases, determine the layer from context:

| Signal | Layer |
|--------|-------|
| REST endpoint (`/api/...`), HTTP methods, Postman | **REST API** |
| GraphQL query/mutation, xAPI, `errors[]` | **GraphQL xAPI** |
| Admin SPA, blade, back-office CRUD, module management | **Admin UI** |
| User journey spanning storefront + API + admin | **E2E Cross-Layer** |
| Storefront-only UI flow | Use the **base format** (existing step tags) |

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

### GraphQL mutation validation — MANDATORY for test case generation

Every GraphQL test case that includes mutations MUST pass a **3-step validation** before approval:

**Step 1: Schema + Source Validation**
1. Introspect live schema (`npm run schema:refresh`) — check `NonNull` (required) fields on all input types used
2. Search module source for **FluentValidation validators** on GitHub: `<CommandName>Validator repo:VirtoCommerce/vc-module-x-*` — these enforce server-side rules NOT visible in the schema (e.g., `CartShipmentValidator` requires `price` to match the shipping rate)
3. Check `vc-frontend` source for how the storefront calls each mutation: `<mutationName> repo:VirtoCommerce/vc-frontend` — this shows the production-proven field set

**Step 2: Live Smoke Execution**
Before finalizing any test case with cart/order mutations, **execute the mutation sequence once** against the live QA environment via GraphiQL or `fetch()`. Record the exact working mutations. This catches:
- Server-side validation not in schema (price matching, address validation)
- Required fields omitted from schema examples
- Environment-specific configuration (available shipping/payment methods, store settings)

**Step 3: Reference Chain**
Every mutation in a test case Steps column must reference one of:
- `graphql-schema.md` — schema-verified field names and types
- `order-creation-matrix.md` — live-verified checkout mutation sequence
- `graphiql-interaction.md` — verified UI interaction patterns
- VC docs or `vc-frontend` source — implementation-verified

**Known pitfalls (discovered via live testing):**
| Pitfall | Root Cause | Fix |
|---------|-----------|-----|
| All cart mutations need `userId` | `InputAddItemType.userId` is `NonNull` | Always include `userId` from `me { id }` query |
| `addOrUpdateCartShipment` VALIDATION error | `CartShipmentValidator` checks `Rate != Price` | Pass `price` matching `availableShippingMethods` rate |
| GraphiQL Headers vs Variables | CodeMirror `setValue()` doesn't update React state | Use `execCommand('insertText')` — see `graphiql-interaction.md` |
| Schema example omits required fields | Introspection script abbreviates | Always check `NonNull` wrapper on input type fields |

> **Migrating from legacy TestRail format?** See `test-case-examples.md` → Migration from Legacy Format.
