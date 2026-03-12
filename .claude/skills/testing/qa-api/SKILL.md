---
description: "[Testing] REST API & GraphQL xAPI — reference lookup, test execution, and test case generation."
argument-hint: "ref <module> | test <scope> | cases <scope>"
---

# /qa-api — API & GraphQL Testing

Three modes in one skill: look up API reference, execute tests, or write test cases.

## Usage

```
/qa-api ref xCart                      # Look up xCart GraphQL queries & mutations
/qa-api ref xCatalog                   # Look up xCatalog product/category queries
/qa-api ref auth                       # Authentication token flow reference
/qa-api ref pageContext                # xFrontend pageContext query reference
/qa-api ref store                      # Store settings & StoreResponseType fields

/qa-api test catalog                   # Execute REST catalog API tests (Suite 14 subset)
/qa-api test graphql cart              # Execute xCart GraphQL mutation tests (Suite 15 subset)
/qa-api test auth                      # Execute authentication endpoint tests
/qa-api test full                      # Execute full API test suite (Suite 14 + Suite 15)

/qa-api cases xCart addCoupon          # Write test cases for addCoupon mutation
/qa-api cases REST catalog CRUD        # Write test cases for catalog REST CRUD
/qa-api cases auth                     # Write test cases for auth endpoints
/qa-api cases graphql error-handling   # Write test cases for GraphQL error scenarios
```

## Supporting Files

- **xapi-query-ref.md** — Ready-to-use GraphQL queries, mutations, and REST request templates for all xAPI modules (xCart, xCatalog, xOrder, xCMS, xProfile, xFrontend) plus store settings and authentication.
- **test-cases-api-graphql.md** — Existing REST API (Suite 14) and GraphQL xAPI (Suite 15) test cases with validations and execution patterns.
- **api-test-case-patterns.md** — Coverage checklists and writing guide for generating new test cases in enriched CSV format. Read this when in `cases` mode.

## Mode: `ref` — API Reference Lookup

1. Read `xapi-query-ref.md` for the requested module or operation
2. Return ready-to-use query/mutation with variables and auth headers
3. Supplement with Context7 (`/virtocommerce/vc-docs`) for any fields not in the local ref

**xAPI Modules:**

| Module | Purpose | Key Operations |
|--------|---------|----------------|
| **xCart** | Shopping cart | addItem, removeItem, changeItemQuantity, addCoupon, clearCart, addOrUpdateShipment, addOrUpdatePayment |
| **xCatalog** | Products & categories | products, product, categories, searchProducts |
| **xOrder** | Order management | createOrderFromCart, orders, order, changeOrderStatus |
| **xCMS** | Content management | pages, menus, contentItems |
| **xProfile** | User profiles & orgs | me, organization, contacts, updateProfile |
| **xFrontend** | Storefront bootstrap | pageContext (store + user + slug + white-labeling in one call) |

**REST API Sections:**

| Section | Base Path |
|---------|-----------|
| Authentication | `/connect/token` |
| Catalog | `/api/catalog/` |
| Pricing | `/api/pricing/` |
| Inventory | `/api/inventory/` |
| Orders | `/api/order/` |
| Customers | `/api/contacts/`, `/api/members/` |
| Marketing | `/api/marketing/` |
| Platform | `/api/platform/` |
| Search | `/api/search/` |
| Stores | `/api/stores/` |

**Rules:**
- GraphQL xAPI runs on `{BACK_URL}/graphql`
- Always check `errors[]` in GraphQL responses — HTTP 200 ≠ success
- REST pagination: `skip` + `take` → `totalCount` in response
- Auth header for all requests: `Authorization: Bearer {token}`

---

## Mode: `test` — Execute Tests

Delegate to `qa-backend-expert` agent with scope and credentials.

1. **Identify scope** from argument: endpoint, module name, `graphql`, or `full`
2. **Read test patterns** from `test-cases-api-graphql.md`
3. **Delegate** to `qa-backend-expert` via Task tool:
   - Pass `BACK_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` from environment
   - Agent uses Postman MCP or `browser_evaluate` fetch calls
4. **Output:** Pass/fail per endpoint, response codes, timings, full request/response on failure

**REST API (Suite 14) coverage:**
- Authentication: token issuance, refresh, invalid credentials
- CRUD: catalog, pricing, inventory, orders, customers, marketing
- Error handling: 400, 401, 403, 404, 500 with structured error bodies
- Pagination: skip/take boundaries, totalCount accuracy
- Security headers: CORS, X-Content-Type-Options, no version disclosure

**GraphQL xAPI (Suite 15) coverage:**
- Queries: xCatalog products/categories, xOrder orders, xProfile me/org
- Mutations: xCart addItem/removeItem/addCoupon, xOrder createOrderFromCart
- Error handling: partial errors (HTTP 200 + errors[]), validation errors, auth failures
- Performance: product search <500ms, nested queries <1000ms

---

## Mode: `cases` — Write Test Cases

Generate test cases in **enriched CSV format** for `test-management-specialist`.

1. **Read `api-test-case-patterns.md`** for coverage checklists and tag reference
2. **Read `xapi-query-ref.md`** for the exact query/mutation signature to put in Steps
3. **Identify layer** from argument (REST → use `[HTTP]`/`[AUTH]`/`[SETUP]` tags; GraphQL → use `[GQL]`/`[VAR]` tags)
4. **Apply coverage checklist** from `api-test-case-patterns.md` for the requested scope
5. **Output test cases** in enriched CSV columns:
   `ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status`

**Key rules for API test cases:**
- Every mutation test MUST include `[API] errors[] is empty` in `Cross_Layer_Checks`
- Every test needs at least 2 `Failure_Signals` (timeout signal + API error signal)
- Use `[ROUNDTRIP]` cross-layer check: mutate then query to confirm persistence
- Cover both happy path AND at least 2 negative cases per operation
- `Test_Data` column: `{{VAR}}` bindings only — no freeform text
- Use `[STATUS]` assertions for REST, `[ERRORS]` + `[DATA]` for GraphQL

---

## Environment Variables

Always use env vars — never hardcode:
- `BACK_URL` — platform backend URL
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — admin credentials
- `USER_EMAIL`, `USER_PASSWORD` — regular user credentials
- `STORE_ID` — store identifier
- `CULTURE_NAME` — default `en-US`
- `CURRENCY_CODE` — default `USD`
