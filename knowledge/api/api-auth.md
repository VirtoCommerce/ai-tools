---
applicability: universal
applicability_rationale: "VC platform OAuth2 token endpoint pattern. Same for every VC deployment."
---

# Platform API Authentication

## OAuth2 Token Endpoint

```
POST {{BACK_URL}}/connect/token
Content-Type: application/x-www-form-urlencoded
```

### Request Body

```
grant_type=password&scope=offline_access&username={{username}}&password={{password}}&storeId={{storeId}}
```

**No client_id or client_secret required.** The platform uses resource owner password grant without a client application.

### Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| `grant_type` | `password` | Fixed |
| `scope` | `offline_access` | Fixed |
| `username` | `admin` | `.env` → `ADMIN` |
| `password` | Read from `.env` → `ADMIN_PASSWORD` | |
| `storeId` | `B2B-store` | `.env` → `STORE_ID` |

### Example (curl)

```bash
curl -X POST "https://vcst-qa.govirto.com/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&scope=offline_access&username=admin&password=${ADMIN_PASSWORD}&storeId=B2B-store"
```

### Example (browser evaluate / fetch)

```javascript
const response = await fetch('/connect/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=password&scope=offline_access&username=admin&password=${ADMIN_PASSWORD}&storeId=B2B-store'
});
const data = await response.json();
// data.access_token — use as Bearer token
```

### Response

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "..."
}
```

### Using the Token

```
Authorization: Bearer {{access_token}}
```

## Common Mistakes (Do NOT)

- Do NOT add `client_id` or `client_secret` — they are not needed and will cause 400/401 errors
- Do NOT use `grant_type=client_credentials` — use `password` grant
- Do NOT forget `storeId` — required for store-scoped operations
- Do NOT forget `scope=offline_access`

## Storefront User Token

For storefront-context API calls (e.g., GraphQL as a customer):

```
grant_type=password&scope=offline_access&username={{USER_EMAIL}}&password={{USER_PASSWORD}}&storeId=B2B-store
```

## Alternative: Browser-Based Testing

For GraphQL queries, agents can navigate to `/ui/graphiql` in the browser — no token needed (uses session cookies from Admin SPA login). Prefer this for:
- `promotionCoupons` queries
- Introspection queries
- Any read-only GraphQL operations

For REST API tests requiring auth, obtain the token via `fetch()` in `browser_evaluate` after logging into Admin SPA.
