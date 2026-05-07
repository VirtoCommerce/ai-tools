# Postman MCP — GraphQL Request Authoring

How to write GraphQL queries and mutations into Postman collection requests, plus how to verify field names against the live xAPI schema **before** writing them.

> **Schema verification is mandatory.** VC xAPI field names don't always match docs or conventions. Before writing any GraphQL query or mutation, consult the canonical schema reference and run introspection to confirm.

---

## 1. Required Reading — Before Any GraphQL Authoring

| Reference | Purpose |
|-----------|---------|
| [`.claude/agents/knowledge/graphql-schema.md`](../../../agents/knowledge/graphql-schema.md) | **Canonical xAPI schema reference** — queries, mutations, input types, return types from live introspection. **MUST be consulted before writing or reviewing GraphQL.** |
| [`.claude/agents/knowledge/graphql-test-cases-runner.md`](../../../agents/knowledge/graphql-test-cases-runner.md) | Authoring contract for runner-native GraphQL test cases (CSV format consumed by `scripts/graphql-runner.ts`). Postman collections are an alternative; the runner is preferred for assertion-rich GraphQL test cases. |
| [`.claude/agents/knowledge/order-creation-matrix.md`](../../../agents/knowledge/order-creation-matrix.md) | Order/cart/shipment mutation prerequisites — userId, shipment price matching, etc. |
| [`.claude/agents/knowledge/api-auth.md`](../../../agents/knowledge/api-auth.md) | OAuth2 token endpoint and headers — same as REST. |

### When to use Postman vs. the GraphQL Runner

| Use Postman MCP collections when… | Use `scripts/graphql-runner.ts` when… |
|-----------------------------------|---------------------------------------|
| Quick exploration, RBAC variations, manual flow runs | Writing repeatable test cases with rich assertions |
| Sharing a query bundle with a non-coder reviewer | The case lives in a `regression/suites/Backend/graphql/` CSV |
| Mock-server scaffolding | You need `[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]` tag grammar, `@td()` resolution, and structured evidence capture |

The gold-standard runner-native suite is `regression/suites/Backend/graphql/050i-graphql-configurations.csv`.

---

## 2. Endpoints

| Endpoint | Path |
|----------|------|
| GraphQL runtime (POST queries/mutations here) | `{{baseUrl}}/graphql` |
| GraphiQL UI (interactive playground) | `{{baseUrl}}/ui/graphiql` |

> `/xapi/graphql` is **not** valid in this project — only `/graphql`.

---

## 3. Schema Introspection

Run these introspection queries via Postman (or GraphiQL) to discover and verify schema. Add an introspection request as the first item in any GraphQL test folder so the schema is verified before running real queries.

| Pattern | Query | Use Case |
|---------|-------|----------|
| Check input fields | `{ __type(name: "InputAddItemType") { inputFields { name type { name } } } }` | Before writing mutations |
| Check output fields | `{ __type(name: "CartType") { fields { name type { name kind ofType { name } } } } }` | Before writing queries |
| List all mutations | `{ __schema { mutationType { fields { name args { name type { name } } } } } }` | Discover available mutations |
| List all queries | `{ __schema { queryType { fields { name args { name type { name } } } } } }` | Discover available queries |

If introspection contradicts `graphql-schema.md`, trust the live introspection — and update the knowledge file.

---

## 4. GraphQL Request via `createCollectionRequest`

```json
{
  "collectionId": "<bare-uuid>",
  "name": "Query Products (xCatalog)",
  "method": "POST",
  "url": "{{baseUrl}}/graphql",
  "headerData": [
    { "key": "Content-Type", "value": "application/json" },
    { "key": "Authorization", "value": "Bearer {{authToken}}" }
  ],
  "dataMode": "graphql",
  "graphqlModeData": {
    "query": "query Products($storeId: String!, $cultureName: String, $currencyCode: String, $first: Int) {\n  products(storeId: $storeId, cultureName: $cultureName, currencyCode: $currencyCode, first: $first) {\n    totalCount\n    items {\n      id\n      name\n      code\n      availabilityData { isAvailable inStockQuantity }\n      price { list { amount formattedAmount } actual { amount } }\n    }\n  }\n}",
    "variables": "{\"storeId\": \"{{storeId}}\", \"cultureName\": \"{{cultureName}}\", \"currencyCode\": \"{{currencyCode}}\", \"first\": 10}"
  },
  "events": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('GraphQL: Status 200', function () {",
          "    pm.response.to.have.status(200);",
          "});",
          "var jsonData = pm.response.json();",
          "pm.test('GraphQL: No errors', function () {",
          "    pm.expect(jsonData.errors).to.be.undefined;",
          "});",
          "pm.test('GraphQL: Products returned', function () {",
          "    pm.expect(jsonData.data.products.totalCount).to.be.above(0);",
          "});"
        ]
      }
    }
  ]
}
```

---

## 5. GraphQL Inside `createCollection` (inline body)

When building GraphQL requests inside `createCollection`'s `item[]` array, use `body.mode: "graphql"` with `body.graphql.query` and `body.graphql.variables`:

```json
{
  "name": "Add Item to Cart",
  "request": {
    "method": "POST",
    "url": "{{baseUrl}}/graphql",
    "header": [
      { "key": "Content-Type", "value": "application/json" },
      { "key": "Authorization", "value": "Bearer {{authToken}}" }
    ],
    "body": {
      "mode": "graphql",
      "graphql": {
        "query": "mutation AddItem($command: InputAddItemType!) { addItem(command: $command) { id itemsCount items { id name quantity } } }",
        "variables": "{\"command\": {\"storeId\": \"{{storeId}}\", \"cultureName\": \"{{cultureName}}\", \"currencyCode\": \"{{currencyCode}}\", \"cartName\": \"default\", \"productId\": \"{{productId}}\", \"quantity\": 1}}"
      }
    }
  },
  "event": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "var jsonData = pm.response.json();",
          "pm.test('No GraphQL errors', function () {",
          "    pm.expect(jsonData.errors).to.be.undefined;",
          "});",
          "pm.test('Item added to cart', function () {",
          "    pm.expect(jsonData.data.addItem.itemsCount).to.be.above(0);",
          "});",
          "pm.collectionVariables.set('cartId', jsonData.data.addItem.id);"
        ]
      }
    }
  ]
}
```

> **`{{variables}}` resolves inside `graphql.variables` strings.** Postman expands them server-side before sending. Make sure the environment defines every variable referenced in the variables JSON string.

---

## 6. GraphQL Error Handling

GraphQL returns HTTP 200 even on errors. Always check `errors[]`:

```javascript
pm.test('No GraphQL errors', function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.errors).to.be.undefined;
});
```

For negative tests (expecting errors):

```javascript
pm.test('GraphQL returns validation error', function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.errors).to.be.an('array').that.is.not.empty;
    pm.expect(jsonData.errors[0].message).to.include('expected error substring');
});
```

---

## 7. Common GraphQL Gotchas (project-specific)

These are documented in shared memory (`feedback_graphql_*` entries) — read them before authoring:

- **`products` filter requires `category.subtree:<B2B_VIRTUAL_CATALOG_ID>`** as a base filter. The active virtual catalog root ID changes — re-verify before hardcoding. Current (2026-04-30): `9238c387-d779-40cb-b27d-5496a670a924`. Cross-check `test-data/aliases.json` BOPIS entry's `testProductCatalogId` field.
- **Cart mutations need `userId`.** See order-creation-matrix.md for the exact requirements.
- **Shipment add/update needs price matching the rate** — mismatched price returns ApolloError that looks like a code bug but is data validation.
- **Happy-path queries use full field selection.** Minimal field selection is allowed only for counter probes, roundtrips, or dedicated schema-coverage tests.

---

## 8. Storefront-Specific Auth (Anonymous Cart)

Some xAPI queries/mutations work anonymously (no Bearer token) — e.g., guest cart lookup. For those requests override the collection-level Bearer auth:

```json
"auth": { "type": "noauth" }
```

Authenticated queries inherit `Authorization: Bearer {{authToken}}` automatically; no per-request auth field needed.
