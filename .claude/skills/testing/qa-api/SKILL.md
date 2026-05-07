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
- **`.claude/agents/knowledge/graphql-schema.md`** — **Authoritative** live introspection snapshot of the GraphQL schema. Lists all queries, mutations, input types, return types, and key rules. Consult this FIRST when writing or reviewing any GraphQL test case.
- **`.claude/agents/knowledge/graphql-test-cases-runner.md`** — **Authoritative** authoring contract for runner-native GraphQL test cases (the format consumed by `scripts/graphql-runner.ts`): full `Steps` / `Assertions` / `Cleanup` tag grammar, predicate shapes, `getByPath` filter syntax, `@td()` resolver, capture chaining, common failure modes, authoring checklist, worked example. Read this BEFORE writing ANY GraphQL test case; gold-standard reference suite is `regression/suites/Backend/graphql/050i-graphql-configurations.csv`.
- **`.claude/skills/testing/qa-postman/test-data-fixtures.md`** — `@td(ALIAS.field)` resolver, [`test-data/aliases.json`](../../../../test-data/aliases.json) registry, and fixture conventions. Read this BEFORE writing entity IDs, SKUs, prices, emails, addresses, or test-card numbers into request bodies — resolve at authoring time, never hardcode.
- **`.claude/skills/testing/qa-postman/SKILL.md`** — Postman MCP entry point (modes, workflow, sub-guide index). The Postman MCP **authors** collections; it does **not** execute them — execution happens via Newman/Postman CLI/Postman Monitor (see `qa-postman/execution.md`).

## MANDATORY: Introspection-First Rule

**NEVER write a GraphQL query, mutation, or filter without verifying it exists in the schema first.** Do not guess field names, mutation names, argument types, or filter syntax.

Before writing ANY GraphQL test case:
1. **Run introspection** to verify the query/mutation exists and check exact args/fields:
   - `{ __schema { queryType { fields { name args { name } } } } }` — list all queries
   - `{ __schema { mutationType { fields { name args { name } } } } }` — list all mutations
   - `{ __type(name: "TypeName") { fields { name type { name ofType { name } } } } }` — check return fields
   - `{ __type(name: "InputTypeName") { inputFields { name type { name ofType { name } kind } } } }` — check input fields
2. **Check `xapi-query-ref.md`** for known-good query templates
3. **Use Context7** (`/virtocommerce/vc-docs`) for any operations not in the local ref
4. **If introspection and ref disagree, trust introspection** — the ref may be stale

**Schema reference:** Consult `.claude/agents/knowledge/graphql-schema.md` — live introspection snapshot with all queries, mutations, input types, and return types. Key rules from the schema:
- `CartType` has **flat** money fields (`subTotal`, `total`, `discountTotal`) — NOT nested under `totals`
- The field is `total` — there is **NO `grandTotal`**
- Products search uses `query` arg — NOT `keyword` (only `brands` uses `keyword`)
- `MoneyType` = `{ amount currency { code } }` — NOT `{ amount currencyCode }`
- `userId` is required per schema type but **inferred from auth token** — omit in variables when authenticated

Common mistakes that introspection prevents:
- Wrong mutation name (`removeItem` vs `removeCartItem`)
- Wrong input type name (`InputConfigurationSectionType` vs `ConfigurationSectionInput`)
- `totals { grandTotal { amount } }` — WRONG. Use `total { amount }` directly
- `products(keyword: "...")` — WRONG. Use `products(query: "...")`
- Invented filter syntax (`filter: "slug:..."` — doesn't exist)
- Wrong field names (`textValue` vs `customText`, `configurationSections` vs `configurationSection`)

---

## Mode: `ref` — API Reference Lookup

1. Read `xapi-query-ref.md` for the requested module or operation
2. **Run introspection** to verify the query/mutation still exists with the documented signature
3. Return ready-to-use query/mutation with variables and auth headers
4. Supplement with Context7 (`/virtocommerce/vc-docs`) for any fields not in the local ref

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

1. **Run introspection** to verify every query/mutation name, argument type, and return field you plan to use
2. **Read `api-test-case-patterns.md`** for coverage checklists and tag reference
3. **Read `xapi-query-ref.md`** for known-good query/mutation templates — cross-check against introspection
4. **Identify layer** from argument (REST → use `[HTTP]`/`[AUTH]`/`[SETUP]` tags; GraphQL → use `[GQL]`/`[VAR]` tags)
5. **Apply coverage checklist** from `api-test-case-patterns.md` for the requested scope
6. **Output test cases** in enriched CSV columns:
   `ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status`

**Key rules for API test cases:**
- Every mutation test MUST include `[API] errors[] is empty` in `Cross_Layer_Checks`
- Every test needs at least 2 `Failure_Signals` (timeout signal + API error signal)
- Use `[ROUNDTRIP]` cross-layer check: mutate then query to confirm persistence
- Cover both happy path AND at least 2 negative cases per operation
- `Test_Data` column: `{{VAR}}` bindings only — no freeform text
- Use `[STATUS]` assertions for REST, `[ERRORS]` + `[DATA]` for GraphQL

**Key rules for GraphQL queries/mutations in Steps:**
- ALL mutations use the `command:` input pattern: `mutation { mutationName(command: { ...fields }) { ...return } }`
- NEVER use individual arguments: `mutation { addItem(cartId: "...", productId: "...")` is WRONG
- Cart mutations require `storeId!` in the command; `userId!` is required per schema type but inferred from auth token
- CartType money fields are **flat**: `subTotal { amount }`, `total { amount }` — NOT `totals { grandTotal { amount } }`
- There is NO `grandTotal` — the field is `total`
- Products search uses `query` arg — NOT `keyword`
- Use correct mutation names per schema (e.g., `removeCartItem` not `removeItem`, `changeCartItemQuantity` not `changeItemQuantity`)
- Consult `.claude/agents/knowledge/graphql-schema.md` for authoritative field names and types
- Verify every query/mutation name and input type via introspection before writing
- **Happy-path field selection (mandatory):** every happy-path query/mutation test MUST request the **full field selection set** of the return type — all non-deprecated scalar fields plus at least one level of expansion for every nested object (`{ amount currency { code } }`, not just `{ amount }`). Null checks, type correctness, and nested resolver correctness are only observable when fields are in the selection set. Minimal selection (`{ id }`, `{ totalCount }`) is allowed ONLY for: (a) counter/invariant probes before/after a mutation, (b) cross-layer roundtrips that match a write, (c) the dedicated "minimal selection" schema-coverage test (one per operation, per the tier rule in `graphql-checklist.md:141-144`). When using a minimal selection, add a comment in Steps naming the role.

---

## Environment Variables

Always use env vars — never hardcode:
- `BACK_URL` — platform backend URL
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — admin credentials
- `USER_EMAIL`, `USER_PASSWORD` — regular user credentials
- `STORE_ID` — store identifier
- `CULTURE_NAME` — default `en-US`
- `CURRENCY_CODE` — default `USD`
