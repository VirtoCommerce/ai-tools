# Postman MCP — Collections, Requests, Auth, and Chaining

How to build a v2.1.0 collection from scratch: schema requirements, request shapes, the OAuth2 token flow, and entity-ID chaining via test scripts. For GraphQL bodies see [graphql-authoring.md](graphql-authoring.md).

---

## 1. Creating a Collection

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
- [ ] `info.name` — minLength 1; cannot be empty
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

## 2. Adding Requests to a Collection

Use `createCollectionRequest` to add individual requests to an existing collection. **Note:** `collectionId` here is the **bare UUID**, not the owner-qualified UID — see [mcp-tools.md](mcp-tools.md#3-collection-id-formats).

### REST API Request (POST with JSON body)

```json
{
  "collectionId": "<bare-uuid>",
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
  "collectionId": "<bare-uuid>",
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
  "collectionId": "<bare-uuid>",
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
  "collectionId": "<bare-uuid>",
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

## 3. Authentication Pattern

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

## 4. Request Chaining with Test Scripts

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
    setTimeout(function () {}, 3000);
    postman.setNextRequest(pm.info.requestName); // re-run this request
} else {
    pm.test('Reindex completed', function () {
        pm.expect(isCompleted).to.be.true;
    });
}
```
