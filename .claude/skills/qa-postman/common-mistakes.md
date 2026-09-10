# Postman MCP — Common Mistakes and Fixes

Catalog of recurring errors agents make when authoring collections via the Postman MCP. Read before debugging "it's broken but I don't know why."

---

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

### Mistake 8: Mixing the Two Collection ID Formats
Postman exposes two ID forms — picking the wrong one for a tool returns 404 or a confusing error.

| Tool | Required form | Example |
|------|---------------|---------|
| `getCollection`, `putCollection`, `duplicateCollection` | Owner-qualified `<OWNER_ID>-<UUID>` | `12345-33823532ab9e41c9b6fd12d0fd459b8b` |
| `createCollectionRequest`, `updateCollectionRequest`, `createCollectionResponse` | Bare UUID | `33823532-ab9e-41c9-b6fd-12d0fd459b8b` |

`getCollections` returns both: `id` (bare UUID) and `uid` (owner-qualified). When in doubt, log the response of `getCollections` and pick the matching shape for your next call.

### Mistake 9: Calling `runCollection` — then blaming your arguments when it fails
`runCollection` **is** listed in the Postman MCP's `enabledTools` catalog, for both `minimal` and `full`. No endpoint registers it, so the call fails no matter how it is shaped. The trap is the second half: because the catalog lists it, the natural read of a failure is "I passed the wrong parameters," and the next twenty minutes go into fixing a call that can never succeed.

**Check `serverInfo.currentServerTools` from `getEnabledTools`** — that is what is registered; `enabledTools` is only what is advertised ([mcp-tools.md](mcp-tools.md) §1a). For execution see [execution.md](execution.md): Newman by default, or `createMonitor` + `runMonitor` on the full endpoint with the caveats in §3.3.

### Mistake 10: Empty Collection Name
```
BAD:  collection.info.name = ""  → schema validation fails (minLength: 1)
GOOD: collection.info.name = "VC API — <Purpose>"
```

### Mistake 11: GraphQL Variables with Unresolved Postman Variables
```
BAD:  "variables": "{\"storeId\": \"{{storeId}}\"}"  ← assumed Postman won't resolve inside the string
GOOD: This actually works — Postman resolves {{variables}} inside graphqlModeData.variables strings
```
This is NOT a mistake — Postman does resolve `{{variables}}` inside GraphQL variable strings. Just make sure the environment has the values set.

### Mistake 12: Forgetting Test Scripts
```
BAD:  Create request with no test script → can't chain to next request, no pass/fail tracking
GOOD: Every request has at least a status code assertion in its test script
```

### Mistake 13: Treating `getCollection` as the Full Payload
```
BAD:  getCollection({ collectionId })  → returns lightweight collection map only (itemRefs, no request bodies)
GOOD: getCollection({ collectionId, model: "full" })  → returns the complete v2.1.0 payload
```
Audits, exports, and any logic that needs to read request bodies, headers, or scripts MUST pass `model: "full"`.

### Mistake 14: Hardcoded IDs / SKUs / Emails / Prices
```
BAD:  "rawModeData": "{\"productId\": \"P-12345\", \"price\": 999.99}"
GOOD: Resolve via @td(CFG_LAPTOP.id) and @td(CFG_LAPTOP.price) at authoring time, OR seed via API and capture into collection variables
```
Catalog data drifts. Hardcoded IDs silently break. See [test-data-fixtures.md](test-data-fixtures.md).

### Mistake 15: Writing GraphQL Without Schema Verification
Field names you remember from a previous project or the docs are not authoritative. VC xAPI ships fields that aren't always documented and renames others between versions. Run introspection or consult [`graphql-schema.md`](../../knowledge/api/graphql-schema.md) before writing any GraphQL request — see [graphql-authoring.md](graphql-authoring.md).
