# Postman MCP — Verifying and Executing Collections

The MCP authors collections; it does not run them. This file covers the verify checklist (MCP-side audit) and the four ways to actually execute (out-of-band).

---

## 1. Get the Collection ID

After `createCollection`, the response includes the collection's ID. You can also find it via:

```
getCollections({ workspace: "<workspace-id>", name: "<filter>" })
→ Returns array of { id, name, uid, owner, ... }
→ uid format: "<OWNER_ID>-<UUID>" (e.g. "12345-33823532ab9e41c9b6fd12d0fd459b8b")
```

---

## 2. Verify the Collection (MCP-side audit)

Fetch the full payload before handing off to a runner:

```
getCollection({ collectionId: "<owner-uid>", model: "full" })
```

> The default `getCollection` response is a lightweight **collection map** — metadata + recursive itemRefs only. Pass `model: "full"` to inspect bodies, headers, and scripts.

### Audit checklist

- [ ] `info.schema === "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"`
- [ ] `info.name` is non-empty
- [ ] First request has `auth: { type: "noauth" }` (token request must override Bearer)
- [ ] Token request's test script calls `pm.environment.set('authToken', ...)`
- [ ] Collection-level `auth.bearer[0].value === "{{authToken}}"`
- [ ] Every non-auth request inherits Bearer (no per-request `auth` override unless intentional)
- [ ] Every request has a `test` event with at least one status-code assertion
- [ ] No hardcoded URLs, credentials, or entity IDs — only `{{variable}}` references (see [test-data-fixtures.md](test-data-fixtures.md))
- [ ] All chained entity IDs (e.g. `{{catalogId}}`) are written by an earlier request's test script
- [ ] GraphQL requests verified against [`graphql-schema.md`](../../../agents/knowledge/graphql-schema.md) (see [graphql-authoring.md](graphql-authoring.md))

---

## 3. Executing a Collection (out-of-band)

The Postman MCP server has no execution tool. Pick one of these runners:

### 3.1 Newman (recommended for CI)

```bash
# 1) Export collection + environment from Postman as JSON (manual: UI → Export)
# 2) Run with newman
npx newman run <collection.json> -e <environment.json> \
  --reporters cli,json --reporter-json-export results.json \
  --timeout-request 60000
```

Newman is the canonical Node-based runner. Reads the same v2.1.0 JSON the MCP produces.

### 3.2 Postman CLI (server-side, results in Postman UI)

```bash
postman login --with-api-key <POSTMAN_API_KEY>
postman collection run <collectionId> --environment <environmentId>
```

### 3.3 Postman Monitor (scheduled — full toolset only)

```
createMonitor({
  collectionId: "<owner-uid>",
  environmentId: "<env-id>",
  schedule: { cron: "0 */1 * * *", timezone: "UTC" },
  name: "Hourly smoke"
})
```
Then `runMonitor({ monitorId })` for a one-off trigger.

### 3.4 Postman desktop/web Runner

Open the collection → click `Run` → select environment.

---

## 4. Interpreting Newman Results

```
## Collection Run: <name>
**Runner:** Newman
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

## 5. API Discovery — Swagger & GraphQL

### Swagger / OpenAPI (REST endpoints)

| Resource | URL |
|----------|-----|
| Swagger UI | `{{baseUrl}}/docs/index.html` |
| OpenAPI JSON | `{{baseUrl}}/docs/VirtoCommerce.Platform/swagger.json` |

Use Swagger to:
- Discover available REST endpoints and their parameters
- Verify request/response schemas before building Postman requests
- Check which fields are required vs optional
- Find module-specific APIs (each VC module exposes its own swagger doc)

### GraphQL Introspection (xAPI)

See [graphql-authoring.md](graphql-authoring.md) §3 for the introspection query patterns. Always introspect before authoring — VC xAPI field names don't always match docs.

---

## 6. Endpoint Quick Reference

Common Virto Commerce API endpoints for building collections.

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Auth token | POST | `{{baseUrl}}/connect/token` |
| Health check | GET | `{{baseUrl}}/health` |
| **Swagger UI** | GET | `{{baseUrl}}/docs/index.html` |
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
| **GraphQL xAPI** | POST | `{{baseUrl}}/graphql` |
| **GraphiQL UI** | GET | `{{baseUrl}}/ui/graphiql` |

> Platform health endpoint is `{{baseUrl}}/health` (NOT `/api/platform/healthcheck`). Returns JSON with Modules, Cache, Redis, SQL Server status. On Windows curl needs `-sk` for the SSL cert.
