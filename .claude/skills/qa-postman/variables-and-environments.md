# Postman MCP — Variables and Environments

Variable scoping rules, `.env` → Postman mapping, and the `createEnvironment` flow. Read [mcp-tools.md](mcp-tools.md) first for the tool surface.

---

## 1. Variable Scoping Rules

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

## 2. `.env` → Postman Variable Mapping

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

> Per-agent test users (`agent-user-pool.csv`, slot-specific `TestAgent1!`/`TestAgent2!`/`TestAgent3!`) live in [test-data-fixtures.md](test-data-fixtures.md). Use those — never hardcode passwords in agent prompts.

---

## 3. Creating an Environment

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
      { "key": "storeId", "value": "B2B-store", "type": "default", "enabled": true },
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
- Name convention: `VC {Environment} Environment` (e.g. `VC QA Environment`, `VC Staging Environment`)

---

## 4. Updating Environments

`putEnvironment` replaces all values:

```json
{
  "environmentId": "<env-id>",
  "environment": {
    "name": "VC QA Environment",
    "values": [ /* full updated array — values not in this array are dropped */ ]
  }
}
```

For partial updates use `patchEnvironment` (full toolset only).
