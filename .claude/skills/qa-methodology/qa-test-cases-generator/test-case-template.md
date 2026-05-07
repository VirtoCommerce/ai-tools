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

**Independence rule (ISTQB):** express required **state**, never a prior case's execution. Cases must be independent.
- ❌ Forbidden: `after running CART-007`, `following CART-007`, `requires CART-007 to have passed`
- ✅ Allowed: enumerate the state (`user logged in as {{USER_EMAIL}}, cart contains {{TEST_SKU}} at qty=1`)
- ✅ Allowed (reference form — avoid repetition): `state from CART-007 (user logged in, {{TEST_SKU}} in cart, qty=1)` — the parenthesized summary describes the state; the ID is a shortcut to that state, not an execution dependency

**When to use `state from <ID>`:** if the first ≥70% of your setup steps would duplicate another earlier case in the same suite. Reference instead of restating — but ALWAYS include the state summary in parentheses so a reader does not need to open the referenced case to understand the starting conditions.

Examples:
- `User logged in as {{USER_EMAIL}}, cart empty`
- `B2C variation product with VirtoFrontend_UI_Layout=B2C property exists in catalog`
- `{{FRONT_URL}} accessible, search index healthy`
- `state from CART-007 (user logged in, {{TEST_SKU}} in cart qty=1, mini-cart visible)`

**`[PRE:*]` Execution Tags (imperative — runner performs these actions):**

Place `[PRE:*]` tags at the top of the Preconditions cell, one per line, before any plain-text conditions. The runner processes each tag left-to-right before executing Steps. Full tag vocabulary and decision tree: `.claude/agents/knowledge/test-execution-preflight.md`.

| Tag | When to Use |
|-----|-------------|
| `[PRE:CLEAR_SESSION]` | First test in a new user-context block (different user than previous test) |
| `[PRE:SIGNIN_AS:<alias>]` | Every test that requires a specific user identity (B2B org user, personal user, admin) |
| `[PRE:SWITCH_ORG:<alias>]` | Test requires a specific org context; place after SIGNIN_AS |
| `[PRE:RESET_CART]` | Test is cart-sensitive and prior tests may have left items in cart |
| `[PRE:SIGNOUT]` | Explicit sign-out required (standalone, without immediate re-sign-in) |
| `[PRE:CLEAR_CACHE]` | Post-deploy test immediately following a module hotfix |
| `[PRE:VERIFY_AUTH:<alias>]` | Assert session identity without changing it |

**Rule:** test cases that require specific auth/org/cart state MUST use `[PRE:*]` tags rather than prose preconditions the runner may ignore.

Example Preconditions cell value:
```
[PRE:CLEAR_SESSION]
[PRE:SIGNIN_AS:TECHFLOW_ADMIN]
[PRE:RESET_CART]
1. Org has ≥2 active addresses seeded across ≥2 countries.
2. Cart shipping section is visible.
```

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

> **Logout convention (GOLDEN RULE, see BL-AUTH-007):** "Sign out" / "Logout" in Steps or Cleanup always means the storefront account-menu popup sequence — click user name in top header → click **Logout** in popup (selector `data-testid="main-layout.top-header.account-menu.sign-out-button"`). NEVER write Steps like `Navigate to /sign-out` or `Click logout button in header` — no such page or header-level button exists. Runners execute the popup sequence regardless of how loosely the Step is phrased.

### References
**Source of demand** for the test — JIRA ticket IDs, requirement IDs, or user-story links. Space or comma separated.

- **Required for Critical/High cases** — must contain at least one `VCST-XXXX`, `REQ-*`, or user-story link
- `BL-*` IDs belong in `Business_Rule`, NOT here (they are internal invariants, not requirements)
- Infrastructure/smoke cases with no originating ticket use the placeholder `smoke-baseline` (never leave empty)

Examples: `VCST-4499`, `VCST-3387 VCST-4499`, `REQ-PAY-007`, `smoke-baseline`

### Automation_Status
Dual-purpose field: **review state** + **execution mode**.

| Value | Meaning | Included in regression? |
|-------|---------|-------------------------|
| `Draft` | Just generated, not yet reviewed. Default output of `/qa-test-cases-generator`. | **No** — excluded from all regression selections |
| `Reviewed` | Passed `/qa-review-tests` ≥ PASS WITH WARNINGS AND peer-approved (human or `qa-lead-orchestrator`), but execution mode not yet assigned | Yes — eligible for manual execution |
| `Automated` | Reviewed + MCP-executable by an agent | Yes |
| `Manual` | Reviewed + requires human execution (no MCP path) | Yes (manual test runs only) |
| `Semi-Automated` | Reviewed + partially automated (agent sets up, human verifies) | Yes (manual test runs only) |

**Promotion rule (ISTQB peer-review principle):** a case moves from `Draft` → `Reviewed` only when:
1. `/qa-review-tests` returns verdict ≥ PASS WITH WARNINGS (zero Blockers, ≤3 Critical findings), AND
2. A human reviewer or `qa-lead-orchestrator` explicitly approves.

From `Reviewed`, the author assigns the execution mode (`Automated` / `Manual` / `Semi-Automated`) based on MCP-executability.

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

Tests executed via `browser_evaluate` (fetch), curl, or a Postman collection authored via Postman MCP and run with Newman / Postman CLI (the MCP itself doesn't execute — see `qa-postman/execution.md`). No browser UI interaction.

**Step tags (Steps column):**

| Tag | Meaning | Agent Action |
|-----|---------|-------------|
| `[HTTP]` | Send HTTP request (method + endpoint + body) | `browser_evaluate` fetch, curl, or Newman/Postman CLI run of an authored collection |
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

**Execution is migrating from the GraphiQL UI to a Node runner** (`scripts/graphql-runner.ts`). The runner validates every query against the introspected schema *before* sending (catches DV-006/008/009/010/011 at lint time with zero HTTP cost), executes via direct `fetch` to `/graphql`, and writes JSON evidence — no browser, no CodeMirror brittleness. Key rules stay: **HTTP 200 ≠ success** — always check `errors[]`; **all cart mutations require `userId`**; **shipment mutations require `price` matching rate**.

> **Canonical authoring guide:** `.claude/agents/knowledge/graphql-test-cases-runner.md` is the source-of-truth contract for the runner-native format below — full tag grammar, predicate shapes (including arithmetic / cross-path / OR-AND composition / `[VAR]`), `getByPath()` filter syntax (`[?key=value]`, `[*?key=value]`, `[?key!=value]`, bracket indices), `@td()` resolver (CSV-backed + inline aliases), capture chaining, common failure modes, an authoring checklist, and a worked example. The summary below is correct but minimal — when in doubt, the knowledge file wins. Gold-standard suite: `regression/suites/Backend/graphql/050i-graphql-configurations.csv`.

New cases MUST use the **runner-native format** below. Existing cases with `[NAV]/[ACT]/[GQL]/[READ]` GraphiQL UI tags are **legacy** — migrate on touch.

#### Runner-Native Format (PREFERRED)

Runner-native cases are browser-free. Every GraphQL operation in the Steps column is a block with a short `<label>` tying OP + EXEC + assertions together; multi-op cases list multiple blocks.

**Step tags (Steps column):**

| Tag | Meaning | Runner Action |
|-----|---------|---------------|
| `[AUTH role=<alias>]` | Acquire/use OAuth token for the given role | Fetch `/connect/token` with the role's credentials (cached per run); attach `Authorization: Bearer <token>` to subsequent ops |
| `[GQL-OP <label>]` | Start a GraphQL operation block. Query/mutation text follows on indented lines below | Parse + validate against schema; fail before send on DV-006…DV-011 |
| `[GQL-VARS <label>]` | Optional JSON variables object for that op | Substitute `{{VAR}}` / `@td()` tokens in the JSON body |
| `[GQL-EXEC <label>]` | Execute the op previously defined with this label | POST `{query, variables}` to `/graphql`; record request+response to evidence |
| `[GQL-CAPTURE <label>.<jsonpath> → <VAR>]` | Save a response field as a run-scoped variable for downstream ops | Evaluate JSONPath against the response; bind `{{VAR}}` |
| `[SETUP]` | Create prerequisite data via an op (still runner-native) | Uses `[GQL-OP setup_<n>]` + `[GQL-EXEC setup_<n>]` internally |
| `[TEARDOWN]` | Cleanup ops | Same as setup; always runs even on failure |
| `[WAIT]` | Wait for async processing (reindex, event) | Poll or delay |

**Assertion tags (Assertions column)** — all assertions include `label=<op-label>` to tie back to the op:

| Tag | Checks |
|-----|--------|
| `[ERRORS label=<L>]` | `errors[]` empty (or contains expected error for negative tests) |
| `[DATA label=<L>]` | Response `data` field has expected structure/values — use JSONPath or regex |
| `[NULL label=<L>]` | Specific field is null or non-null as expected |
| `[COUNT label=<L>]` | `totalCount` or array length matches (supports `>= N` / `< N`) |
| `[MATH label=<L>]` | Calculated field matches a formula, not a literal |
| `[PERF label=<L>]` | Response time within threshold (ms) |

**Cross-layer (Cross_Layer_Checks column):**

| Tag | Checks |
|-----|--------|
| `[ROUNDTRIP label=<L>]` | Issue a read op after a write op; runner asserts persistence |
| `[STOREFRONT]` | Storefront UI reflects the GraphQL state change (optional, usually in E2E layer) |
| `[ADMIN]` | Admin REST API confirms the entity/change |
| `[EVENT]` | Platform events/notifications triggered |

**Label rules** — enforced by `/qa-review-tests`:
- Every `[GQL-OP <L>]` must be paired with exactly one `[GQL-EXEC <L>]` later in Steps
- Every `[GQL-VARS <L>]` / `[GQL-CAPTURE <L>.*]` must refer to a declared `<L>`
- Assertions with `label=<L>` must refer to a declared `<L>`
- `<L>` is free-form but SHOULD be semantic: `happy_path`, `xss_name`, `probe_before`, `cleanup`

**Worked example:** see `test-case-examples.md` → GraphQL Runner — GQL-030 (migrated).

#### Legacy Format (GraphiQL UI — for unmigrated cases only)

Retained until all GraphQL suites are migrated. Do NOT use for new cases. The tags below drive a Playwright browser against `{{BACK_URL}}/ui/graphiql` — see `graphiql-interaction.md` for CodeMirror interaction patterns.

**Legacy step tags:** `[NAV]` (navigate to GraphiQL), `[AUTH]` (set Bearer via `execCommand('insertText')`), `[ACT]` (clear/type in editor), `[GQL]` (click Execute), `[READ]` (snapshot response panel), `[VAR]` (extract response field). **Legacy cross-layer:** `[ROUNDTRIP]` (clear editor → query → execute), `[CONSOLE]` (no GraphiQL JS errors).

Legacy cases will be flagged by `/qa-review-tests` (Medium) with a migration suggestion once runner coverage for the module is complete.

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
