# Postman MCP — Collection Builder Guide

Complete reference for agents building and running Postman collections via Postman MCP tools. Read this file **in full** before making any Postman MCP tool call.

---

## Table of Contents

1. [Postman MCP Tools Overview](#1-postman-mcp-tools-overview)
2. [Prerequisite: Get the Workspace ID](#2-prerequisite-get-the-workspace-id)
3. [Variable Scoping Rules](#3-variable-scoping-rules)
4. [.env → Postman Variable Mapping](#4-env--postman-variable-mapping)
5. [Creating an Environment](#5-creating-an-environment)
6. [Creating a Collection](#6-creating-a-collection)
7. [Adding Requests to a Collection](#7-adding-requests-to-a-collection)
8. [Authentication Pattern](#8-authentication-pattern)
9. [Request Chaining with Test Scripts](#9-request-chaining-with-test-scripts)
10. [GraphQL Requests](#10-graphql-requests)
11. [Running a Collection](#11-running-a-collection)
12. [Common Mistakes and Fixes](#12-common-mistakes-and-fixes)
13. [Quick-Copy Examples](#13-quick-copy-examples)

---

## 1. Postman MCP Tools Overview

| Tool | Purpose | Required Parameters |
|------|---------|-------------------|
| `getWorkspaces` | List workspaces (get workspace ID) | — |
| `getCollections` | List collections in a workspace | `workspace` |
| `getCollection` | Get full collection detail | `collectionId` |
| `getEnvironments` | List environments | `workspace` (optional) |
| `getEnvironment` | Get environment detail with variables | `environmentId` |
| `createEnvironment` | Create environment with variables | `workspace`, `environment.name`, `environment.values[]` |
| `createCollection` | Create a full collection (folders + requests) | `workspace`, `collection.info`, `collection.item[]` |
| `createCollectionRequest` | Add a single request to existing collection | `collectionId`, request fields |
| `runCollection` | Execute a collection | `collectionId` (full owner-qualified ID) |
| `putCollection` | Update an existing collection | `collectionId`, full collection object |
| `putEnvironment` | Update an existing environment | `environmentId`, full environment object |

**Key constraint:** Most tools require a `workspace` ID. Always call `getWorkspaces` first.

---

## 2. Prerequisite: Get the Workspace ID

**Every session must start here.** You cannot create collections or environments without a workspace ID.

```
Call: getWorkspaces()
Response: { workspaces: [{ id: "abc-123", name: "VirtoPlatform", type: "team" }, ...] }
→ Use the "VirtoPlatform" workspace ID for all subsequent calls.
```

If no workspace exists or user hasn't specified, ask: "Which Postman workspace should I use?"

**Store the workspace ID** — you'll pass it to `createCollection`, `createEnvironment`, `getCollections`, etc.

---

## 3. Variable Scoping Rules

Postman has three variable scopes. Using the wrong scope is the #1 source of broken collections.

| Scope | Set With | Use For | Example |
|-------|----------|---------|---------|
| **Environment** | `pm.environment.set("key", value)` | Credentials, URLs, store config — shared across collections | `baseUrl`, `admin`, `adminPassword`, `authToken` |
| **Collection** | `pm.collectionVariables.set("key", value)` | Entity IDs from chained requests — isolated to this collection | `catalogId`, `productId`, `priceListId` |
| **Local** | `pm.variables.set("key", value)` | Temporary values within a single request | Loop counters, computed values |

### Critical Rules

1. **URLs and credentials → Environment variables.** These come from `.env` and are reused across collections.
2. **Entity IDs from request chaining → Collection variables.** These are created during execution and scoped to one collection run.
3. **`authToken` → Environment variable** (type: `secret`). Set by the auth request's test script, consumed by all subsequent requests via `{{authToken}}`.
4. **Never put secrets in collection variables** — collection variables are visible in the collection JSON export.
5. **Reference syntax is the same** — `{{variableName}}` in URLs, headers, and bodies. Postman resolves in order: local → collection → environment → global.

---

## 4. .env → Postman Variable Mapping

Map project `.env` variables to Postman environment variables. Agent must read `.env` values at skill execution time.

### QA Profile

| Postman Variable | .env Source | Type | Description |
|-----------------|-------------|------|-------------|
| `baseUrl` | `BACK_URL` | `default` | Platform API base URL |
| `frontUrl` | `FRONT_URL` | `default` | Storefront URL |
| `storeId` | `STORE_ID` | `default` | Store identifier |
| `admin` | `ADMIN` | `default` | Admin username/email |
| `adminPassword` | `ADMIN_PASSWORD` | `secret` | Admin password |
| `userEmail` | `USER_EMAIL` | `default` | Regular user email |
| `userPassword` | `USER_PASSWORD` | `secret` | Regular user password |
| `user2Email` | `USER2_EMAIL` | `default` | Second test user email |
| `user2Password` | `USER2_PASSWORD` | `secret` | Second test user password |
| `userVirto` | `USER_VIRTO` | `default` | Virto admin user |
| `userVirtoPassword` | `USER_VIRTO_PASSWORD` | `secret` | Virto admin password |
| `cultureName` | `CULTURE_NAME` | `default` | Default `en-US` |
| `currencyCode` | `CURRENCY_CODE` | `default` | Default `USD` |
| `authToken` | _(empty)_ | `secret` | Set by auth request test script |

### Staging Profile

| Postman Variable | .env Source | Type |
|-----------------|-------------|------|
| `baseUrl` | `VIRTO_START_BACK` | `default` |
| `frontUrl` | `VIRTO_START_FRONT` | `default` |
| _(rest same as QA)_ | | |

### Postman API Key

The `POSTMAN_API_KEY` from `.env` is used by the MCP server itself for authentication — agents do NOT need to pass it in API calls. The MCP server handles this automatically.

---

## 5. Creating an Environment

Use `createEnvironment` to create a Postman environment from `.env` values.

**Tool call structure:**

```json
{
  "workspace": "<workspace-id>",
  "environment": {
    "name": "VC QA Environment",
    "values": [
      { "key": "baseUrl", "value": "https://admin-vcst-qa.paas.govirto.com", "type": "default", "enabled": true },
      { "key": "frontUrl", "value": "https://vcst-qa.paas.govirto.com", "type": "default", "enabled": true },
      { "key": "storeId", "value": "vcst-qa", "type": "default", "enabled": true },
      { "key": "admin", "value": "admin@example.com", "type": "default", "enabled": true },
      { "key": "adminPassword", "value": "****", "type": "secret", "enabled": true },
      { "key": "cultureName", "value": "en-US", "type": "default", "enabled": true },
      { "key": "currencyCode", "value": "USD", "type": "default", "enabled": true },
      { "key": "authToken", "value": "", "type": "secret", "enabled": true }
    ]
  }
}
```

**Rules:**
- Read actual values from `.env` at execution time — the examples above are placeholders
- Set `type: "secret"` for passwords, tokens, API keys
- Set `enabled: true` for all variables
- Always include `authToken` with empty value — it gets populated by the first request's test script
- Name convention: `VC {Environment} Environment` (e.g., "VC QA Environment", "VC Staging Environment")

---

## 6. Creating a Collection

Use `createCollection` with the full v2.1.0 schema. This creates the collection with folders and requests in one call.

**Minimal valid collection structure:**

```json
{
  "workspace": "<workspace-id>",
  "collection": {
    "info": {
      "name": "VC API — <Purpose>",
      "description": "Created by QA agent. Purpose: <what this collection tests>",
      "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "auth": {
      "type": "bearer",
      "bearer": [
        { "key": "token", "value": "{{authToken}}", "type": "string" }
      ]
    },
    "variable": [
      { "key": "catalogId", "value": "", "description": "Set by Create Catalog request" },
      { "key": "productId", "value": "", "description": "Set by Create Product request" }
    ],
    "item": [
      {
        "name": "00-Auth",
        "description": "Authentication — must run first",
        "item": [
          {
            "name": "Get OAuth2 Token",
            "request": {
              "auth": { "type": "noauth" },
              "method": "POST",
              "url": "{{baseUrl}}/connect/token",
              "header": [
                { "key": "Content-Type", "value": "application/x-www-form-urlencoded" }
              ],
              "body": {
                "mode": "urlencoded",
                "urlencoded": [
                  { "key": "grant_type", "value": "password" },
                  { "key": "username", "value": "{{admin}}" },
                  { "key": "password", "value": "{{adminPassword}}" },
                  { "key": "scope", "value": "openid offline_access" }
                ]
              }
            },
            "event": [
              {
                "listen": "test",
                "script": {
                  "type": "text/javascript",
                  "exec": [
                    "pm.test('Auth: Status 200', function () {",
                    "    pm.response.to.have.status(200);",
                    "});",
                    "",
                    "var jsonData = pm.response.json();",
                    "pm.test('Auth: Token received', function () {",
                    "    pm.expect(jsonData.access_token).to.be.a('string');",
                    "});",
                    "",
                    "pm.environment.set('authToken', jsonData.access_token);"
                  ]
                }
              }
            ]
          }
        ]
      },
      {
        "name": "01-Tests",
        "description": "Test requests go here",
        "item": []
      }
    ]
  }
}
```

### Required Elements Checklist

- [ ] `info.schema` — MUST be `"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"`
- [ ] `auth` — Collection-level Bearer auth with `{{authToken}}`
- [ ] `variable` — Collection variables for entity IDs (initially empty)
- [ ] First request — OAuth2 token with `auth: { type: "noauth" }` (overrides collection auth)
- [ ] Token request test script — `pm.environment.set('authToken', ...)` (NOT `pm.collectionVariables`)
- [ ] Every subsequent request — inherits collection-level Bearer auth automatically

### Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Collection | `VC API — <Purpose>` | `VC API — Catalog CRUD` |
| Auth folder | `00-Auth` | |
| Setup folder | `01-Setup` | |
| Test folder | `02-Tests` or `02-<Domain>` | `02-Pricing` |
| Verify folder | `03-Verify` | |
| Cleanup folder | `04-Cleanup` | |

---

## 7. Adding Requests to a Collection

Use `createCollectionRequest` to add individual requests to an existing collection.

### REST API Request (POST with JSON body)

```json
{
  "collectionId": "<collection-id>",
  "folderId": "<folder-id>",
  "name": "Create Physical Catalog",
  "method": "POST",
  "url": "{{baseUrl}}/api/catalog/catalogs",
  "headerData": [
    { "key": "Content-Type", "value": "application/json" },
    { "key": "Authorization", "value": "Bearer {{authToken}}" }
  ],
  "dataMode": "raw",
  "rawModeData": "{\"name\": \"AGENT-TEST-Catalog-{{$timestamp}}\", \"languages\": [{\"languageCode\": \"en-US\", \"isDefault\": true}], \"isVirtual\": false}",
  "dataOptions": { "raw": { "language": "json" } },
  "events": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('Catalog created: 200 or 201', function () {",
          "    pm.expect(pm.response.code).to.be.oneOf([200, 201]);",
          "});",
          "",
          "var jsonData = pm.response.json();",
          "pm.collectionVariables.set('catalogId', jsonData.id);",
          "console.log('Created catalog: ' + jsonData.id);"
        ]
      }
    }
  ]
}
```

### REST API Request (GET)

```json
{
  "collectionId": "<collection-id>",
  "folderId": "<folder-id>",
  "name": "Get Product by ID",
  "method": "GET",
  "url": "{{baseUrl}}/api/catalog/products/{{productId}}?responseGroup=Full",
  "headerData": [
    { "key": "Authorization", "value": "Bearer {{authToken}}" }
  ],
  "events": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('Product found: 200', function () {",
          "    pm.response.to.have.status(200);",
          "});",
          "",
          "var jsonData = pm.response.json();",
          "pm.test('Product is active', function () {",
          "    pm.expect(jsonData.isActive).to.be.true;",
          "});"
        ]
      }
    }
  ]
}
```

### Form-Urlencoded Request (Auth Token)

```json
{
  "collectionId": "<collection-id>",
  "name": "Get OAuth2 Token",
  "method": "POST",
  "url": "{{baseUrl}}/connect/token",
  "auth": { "type": "noauth" },
  "headerData": [
    { "key": "Content-Type", "value": "application/x-www-form-urlencoded" }
  ],
  "dataMode": "urlencoded",
  "data": [
    { "key": "grant_type", "value": "password", "type": "text", "enabled": true },
    { "key": "username", "value": "{{admin}}", "type": "text", "enabled": true },
    { "key": "password", "value": "{{adminPassword}}", "type": "text", "enabled": true },
    { "key": "scope", "value": "openid offline_access", "type": "text", "enabled": true }
  ],
  "events": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('Auth successful', function () {",
          "    pm.response.to.have.status(200);",
          "});",
          "var jsonData = pm.response.json();",
          "pm.environment.set('authToken', jsonData.access_token);"
        ]
      }
    }
  ]
}
```

### DELETE Request

```json
{
  "collectionId": "<collection-id>",
  "folderId": "<cleanup-folder-id>",
  "name": "Delete Catalog",
  "method": "DELETE",
  "url": "{{baseUrl}}/api/catalog/catalogs/{{catalogId}}",
  "headerData": [
    { "key": "Authorization", "value": "Bearer {{authToken}}" }
  ],
  "events": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('Catalog deleted: 200 or 204', function () {",
          "    pm.expect(pm.response.code).to.be.oneOf([200, 204]);",
          "});"
        ]
      }
    }
  ]
}
```

---

## 8. Authentication Pattern

Every collection uses the same auth flow. This is non-negotiable.

### Flow

1. **First request in collection** = `POST {{baseUrl}}/connect/token`
2. Request has `auth: { type: "noauth" }` to override collection-level Bearer auth
3. Body is `urlencoded` with `grant_type=password&username={{admin}}&password={{adminPassword}}&scope=openid offline_access`
4. Test script extracts token: `pm.environment.set('authToken', jsonData.access_token)`
5. All subsequent requests inherit `Authorization: Bearer {{authToken}}` from collection-level auth

### Why `pm.environment.set` (NOT `pm.collectionVariables.set`) for the token?

The token is shared across the collection via environment scope. If you use `pm.collectionVariables.set`, the Bearer auth at collection level (`{{authToken}}`) may not resolve correctly in all contexts. Environment variables take precedence in header resolution.

### RBAC — Switching Users Mid-Collection

To test with different roles, add a "Switch User" request that re-authenticates:

```javascript
// Test script in "Switch to Buyer User" request:
pm.test('Buyer auth successful', function () {
    pm.response.to.have.status(200);
});
var jsonData = pm.response.json();
pm.environment.set('authToken', jsonData.access_token);
// Now all subsequent requests run as the buyer user
```

URL-encoded body uses `{{userEmail}}` and `{{userPassword}}` instead of admin credentials.

---

## 9. Request Chaining with Test Scripts

Request chaining = one request's output becomes the next request's input. This is how you build workflows.

### Pattern: Extract ID from Create Response

```javascript
// Test script after POST /api/catalog/catalogs
pm.test('Catalog created', function () {
    pm.expect(pm.response.code).to.be.oneOf([200, 201]);
});

var jsonData = pm.response.json();
pm.collectionVariables.set('catalogId', jsonData.id);
console.log('Stored catalogId: ' + jsonData.id);
```

Next request uses `{{catalogId}}` in its URL or body.

### Pattern: Extract from Array Response

```javascript
// Test script after POST /api/inventory/fulfillmentcenters/search
pm.test('FFCs found', function () {
    pm.response.to.have.status(200);
});

var jsonData = pm.response.json();
pm.test('At least one FFC exists', function () {
    pm.expect(jsonData.results).to.be.an('array').that.is.not.empty;
});

pm.collectionVariables.set('ffcId', jsonData.results[0].id);
```

### Pattern: Conditional Flow (Skip/Abort)

```javascript
// Pre-request script: check if a previous step succeeded
var catalogId = pm.collectionVariables.get('catalogId');
if (!catalogId) {
    console.warn('SKIP: catalogId not set — previous step may have failed');
    pm.execution.skipRequest();
}
```

### Pattern: Wait + Poll (Search Reindex)

```javascript
// Test script for "Poll Index Status"
var jsonData = pm.response.json();
var isCompleted = jsonData.every(task => task.processedCount === task.totalCount);

if (!isCompleted) {
    // Retry after 3 seconds (Postman collection runner delay)
    setTimeout(function () {}, 3000);
    postman.setNextRequest(pm.info.requestName); // re-run this request
} else {
    pm.test('Reindex completed', function () {
        pm.expect(isCompleted).to.be.true;
    });
}
```

---

## 10. GraphQL Requests

Virto Commerce xAPI uses GraphQL at `{{baseUrl}}/graphql`.

### Using `createCollectionRequest` with GraphQL

```json
{
  "collectionId": "<collection-id>",
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
          "",
          "var jsonData = pm.response.json();",
          "",
          "pm.test('GraphQL: No errors', function () {",
          "    pm.expect(jsonData.errors).to.be.undefined;",
          "});",
          "",
          "pm.test('GraphQL: Products returned', function () {",
          "    pm.expect(jsonData.data.products.totalCount).to.be.above(0);",
          "});"
        ]
      }
    }
  ]
}
```

### GraphQL in `createCollection` (inline)

When building GraphQL requests inside `createCollection`'s `item[]` array, use the `body.graphql` format:

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

### GraphQL Error Handling

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

## 11. Running a Collection

### Get the Collection ID

After `createCollection`, the response includes the collection's ID. You can also find it via:

```
getCollections(workspace: "<workspace-id>")
→ Returns array of { id, name, uid, ... }
→ The `uid` field is the full owner-qualified ID needed for runCollection
```

### Execute

```json
{
  "collectionId": "<owner-id>-<collection-uuid>",
  "environmentId": "<environment-id>",
  "requestTimeout": 60000,
  "scriptTimeout": 5000
}
```

**Parameters:**
- `collectionId` — **required**, format: `{ownerId}-{uuid}` (the `uid` from getCollections)
- `environmentId` — optional but strongly recommended for variable substitution
- `abortOnError: false` — continue on errors (default, recommended for test runs)
- `stopOnFailure: false` — continue on test failures (default, recommended)
- `requestTimeout: 60000` — 60s per request (increase for search reindex polling)

### Interpreting Results

The `runCollection` response includes:
- **stats** — total requests, assertions, pass/fail counts
- **executions** — per-request results with response codes, timings, assertion outcomes
- **failures** — list of failed assertions with request name, assertion name, error message

Report template:

```
## Collection Run: <name>
**Environment:** <env name>
**Requests:** X total | Y passed | Z failed
**Assertions:** X total | Y passed | Z failed
**Duration:** Xms

### Failed Assertions
| Request | Assertion | Error |
|---------|-----------|-------|
| Create Product | Status 201 | Expected 201 but got 500 |

### Timings
| Request | Duration |
|---------|----------|
| Get Token | 234ms |
| Create Catalog | 456ms |
```

---

## 12. Common Mistakes and Fixes

### Mistake 1: Hardcoded URLs
```
BAD:  "url": "https://admin-vcst-qa.paas.govirto.com/api/catalog/catalogs"
GOOD: "url": "{{baseUrl}}/api/catalog/catalogs"
```

### Mistake 2: Missing Schema
```
BAD:  "info": { "name": "My Collection" }
GOOD: "info": { "name": "My Collection", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" }
```
The `schema` field is **required** by the Postman API. Without it, `createCollection` will fail.

### Mistake 3: Token in Collection Variables
```
BAD:  pm.collectionVariables.set('authToken', jsonData.access_token);
GOOD: pm.environment.set('authToken', jsonData.access_token);
```
The collection-level `auth.bearer` resolves `{{authToken}}` — environment scope is more reliable for this.

### Mistake 4: Auth on Token Request
```
BAD:  Token request inherits collection-level Bearer auth → sends expired/empty token → 401
GOOD: Token request has auth: { type: "noauth" } to override collection auth
```

### Mistake 5: Wrong Body Format for Auth
```
BAD:  dataMode: "raw", rawModeData: '{"grant_type":"password",...}'  (sends JSON to /connect/token)
GOOD: dataMode: "urlencoded", data: [{key: "grant_type", value: "password"}, ...]
```
The `/connect/token` endpoint expects `application/x-www-form-urlencoded`, NOT JSON.

### Mistake 6: Missing Content-Type Header
```
BAD:  POST with JSON body but no Content-Type header → server rejects or misinterprets
GOOD: headerData: [{ "key": "Content-Type", "value": "application/json" }]
```

### Mistake 7: Forgetting Workspace ID
```
BAD:  createCollection({ collection: {...} })  → creates in random personal workspace
GOOD: createCollection({ workspace: "<workspace-id>", collection: {...} })
```

### Mistake 8: Using Wrong Collection ID Format
```
BAD:  runCollection({ collectionId: "33823532-ab9e-41c9-b6fd-12d0fd459b8b" })  → 404
GOOD: runCollection({ collectionId: "12345-33823532ab9e41c9b6fd12d0fd459b8b" })
```
`runCollection` requires the `uid` format (owner-qualified), not just the UUID.

### Mistake 9: GraphQL Variables with Unresolved Postman Variables
```
BAD:  "variables": "{\"storeId\": \"{{storeId}}\"}"  ← Postman resolves {{storeId}} in the string
GOOD: This actually works — Postman resolves {{variables}} inside graphqlModeData.variables strings
```
This is NOT a mistake — Postman does resolve `{{variables}}` inside GraphQL variable strings. Just make sure the environment has the values set.

### Mistake 10: Forgetting Test Scripts
```
BAD:  Create request with no test script → can't chain to next request, no pass/fail tracking
GOOD: Every request has at least a status code assertion in its test script
```

---

## 13. Quick-Copy Examples

### Example A: Complete Auth-Only Collection (Minimal)

Use this as a starting point for any new collection.

```json
{
  "workspace": "WORKSPACE_ID_HERE",
  "collection": {
    "info": {
      "name": "VC API — Auth Test",
      "description": "Verifies OAuth2 token acquisition and basic auth flows",
      "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "auth": {
      "type": "bearer",
      "bearer": [{ "key": "token", "value": "{{authToken}}", "type": "string" }]
    },
    "item": [
      {
        "name": "Get Admin Token",
        "request": {
          "auth": { "type": "noauth" },
          "method": "POST",
          "url": "{{baseUrl}}/connect/token",
          "header": [{ "key": "Content-Type", "value": "application/x-www-form-urlencoded" }],
          "body": {
            "mode": "urlencoded",
            "urlencoded": [
              { "key": "grant_type", "value": "password" },
              { "key": "username", "value": "{{admin}}" },
              { "key": "password", "value": "{{adminPassword}}" },
              { "key": "scope", "value": "openid offline_access" }
            ]
          }
        },
        "event": [{
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "var data = pm.response.json();",
              "pm.test('Token received', () => pm.expect(data.access_token).to.be.a('string'));",
              "pm.environment.set('authToken', data.access_token);"
            ]
          }
        }]
      },
      {
        "name": "Verify Token — Get Store",
        "request": {
          "method": "GET",
          "url": "{{baseUrl}}/api/stores/{{storeId}}"
        },
        "event": [{
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('Store accessible with token: 200', () => pm.response.to.have.status(200));",
              "var data = pm.response.json();",
              "pm.test('Store ID matches', () => pm.expect(data.id).to.eql(pm.environment.get('storeId')));"
            ]
          }
        }]
      },
      {
        "name": "Invalid Credentials — Expect 400",
        "request": {
          "auth": { "type": "noauth" },
          "method": "POST",
          "url": "{{baseUrl}}/connect/token",
          "header": [{ "key": "Content-Type", "value": "application/x-www-form-urlencoded" }],
          "body": {
            "mode": "urlencoded",
            "urlencoded": [
              { "key": "grant_type", "value": "password" },
              { "key": "username", "value": "nonexistent@example.com" },
              { "key": "password", "value": "wrongpassword" },
              { "key": "scope", "value": "openid offline_access" }
            ]
          }
        },
        "event": [{
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('Invalid creds rejected: 400', () => pm.response.to.have.status(400));"
            ]
          }
        }]
      }
    ]
  }
}
```

### Example B: CRUD Workflow with Chaining

```json
{
  "workspace": "WORKSPACE_ID_HERE",
  "collection": {
    "info": {
      "name": "VC API — Catalog CRUD",
      "description": "Create, Read, Update, Delete a catalog with request chaining",
      "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "auth": {
      "type": "bearer",
      "bearer": [{ "key": "token", "value": "{{authToken}}", "type": "string" }]
    },
    "variable": [
      { "key": "catalogId", "value": "", "description": "Created catalog ID" }
    ],
    "item": [
      {
        "name": "00-Auth",
        "item": [{
          "name": "Get Token",
          "request": {
            "auth": { "type": "noauth" },
            "method": "POST",
            "url": "{{baseUrl}}/connect/token",
            "header": [{ "key": "Content-Type", "value": "application/x-www-form-urlencoded" }],
            "body": {
              "mode": "urlencoded",
              "urlencoded": [
                { "key": "grant_type", "value": "password" },
                { "key": "username", "value": "{{admin}}" },
                { "key": "password", "value": "{{adminPassword}}" },
                { "key": "scope", "value": "openid offline_access" }
              ]
            }
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Auth OK', () => pm.response.to.have.status(200));",
            "pm.environment.set('authToken', pm.response.json().access_token);"
          ]}}]
        }]
      },
      {
        "name": "01-Create",
        "item": [{
          "name": "Create Catalog",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/api/catalog/catalogs",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\"name\": \"AGENT-TEST-Catalog\", \"languages\": [{\"languageCode\": \"en-US\", \"isDefault\": true}], \"isVirtual\": false}",
              "options": { "raw": { "language": "json" } }
            }
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Created', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));",
            "pm.collectionVariables.set('catalogId', pm.response.json().id);"
          ]}}]
        }]
      },
      {
        "name": "02-Read",
        "item": [{
          "name": "Get Catalog",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/api/catalog/catalogs/{{catalogId}}"
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Found', () => pm.response.to.have.status(200));",
            "pm.test('Name matches', () => pm.expect(pm.response.json().name).to.include('AGENT-TEST'));"
          ]}}]
        }]
      },
      {
        "name": "03-Update",
        "item": [{
          "name": "Update Catalog Name",
          "request": {
            "method": "PUT",
            "url": "{{baseUrl}}/api/catalog/catalogs",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\"id\": \"{{catalogId}}\", \"name\": \"AGENT-TEST-Catalog-Updated\", \"languages\": [{\"languageCode\": \"en-US\", \"isDefault\": true}], \"isVirtual\": false}",
              "options": { "raw": { "language": "json" } }
            }
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Updated', () => pm.response.to.have.status(200));"
          ]}}]
        }]
      },
      {
        "name": "04-Delete",
        "item": [{
          "name": "Delete Catalog",
          "request": {
            "method": "DELETE",
            "url": "{{baseUrl}}/api/catalog/catalogs/{{catalogId}}"
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Deleted', () => pm.expect(pm.response.code).to.be.oneOf([200, 204]));"
          ]}}]
        },
        {
          "name": "Verify Deleted",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/api/catalog/catalogs/{{catalogId}}"
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Gone: 404', () => pm.response.to.have.status(404));"
          ]}}]
        }]
      }
    ]
  }
}
```

### Example C: Environment Creation (QA)

```json
{
  "workspace": "WORKSPACE_ID_HERE",
  "environment": {
    "name": "VC QA Environment",
    "values": [
      { "key": "baseUrl",       "value": "VALUE_FROM_BACK_URL",       "type": "default", "enabled": true },
      { "key": "frontUrl",      "value": "VALUE_FROM_FRONT_URL",      "type": "default", "enabled": true },
      { "key": "storeId",       "value": "VALUE_FROM_STORE_ID",       "type": "default", "enabled": true },
      { "key": "admin",         "value": "VALUE_FROM_ADMIN",          "type": "default", "enabled": true },
      { "key": "adminPassword", "value": "VALUE_FROM_ADMIN_PASSWORD", "type": "secret",  "enabled": true },
      { "key": "userEmail",     "value": "VALUE_FROM_USER_EMAIL",     "type": "default", "enabled": true },
      { "key": "userPassword",  "value": "VALUE_FROM_USER_PASSWORD",  "type": "secret",  "enabled": true },
      { "key": "cultureName",   "value": "en-US",                     "type": "default", "enabled": true },
      { "key": "currencyCode",  "value": "USD",                       "type": "default", "enabled": true },
      { "key": "authToken",     "value": "",                          "type": "secret",  "enabled": true }
    ]
  }
}
```

Replace `VALUE_FROM_*` with actual values read from `.env` at execution time.

---

## Endpoint Quick Reference

Common Virto Commerce API endpoints for building collections. Full reference in `qa-seed-data/test-data-generation.md`.

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Auth token | POST | `{{baseUrl}}/connect/token` |
| Health check | GET | `{{baseUrl}}/health` |
| Get store | GET | `{{baseUrl}}/api/stores/{{storeId}}` |
| Search stores | POST | `{{baseUrl}}/api/stores/search` |
| Create catalog | POST | `{{baseUrl}}/api/catalog/catalogs` |
| Get catalog | GET | `{{baseUrl}}/api/catalog/catalogs/{{catalogId}}` |
| Create product | POST | `{{baseUrl}}/api/catalog/products` |
| Get product | GET | `{{baseUrl}}/api/catalog/products/{{productId}}?responseGroup=Full` |
| Search products | POST | `{{baseUrl}}/api/catalog/search/products` |
| Create price list | POST | `{{baseUrl}}/api/pricing/pricelists` |
| Set prices | PUT | `{{baseUrl}}/api/products/prices` |
| Set inventory | PUT | `{{baseUrl}}/api/inventory/products/{{productId}}` |
| Create member | POST | `{{baseUrl}}/api/members` |
| Create user | POST | `{{baseUrl}}/api/platform/security/users/create` |
| Reindex | POST | `{{baseUrl}}/api/search/indexes/index` |
| GraphQL xAPI | POST | `{{baseUrl}}/graphql` |
