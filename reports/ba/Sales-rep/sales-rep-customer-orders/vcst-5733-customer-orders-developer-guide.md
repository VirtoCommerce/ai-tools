# Sales Rep — Customer Orders — Developer Guide

The **Sales Rep** module's scoped xAPI schema now exposes a customer's **complete** order history to a
serving sales representative — every order for that organization, whichever storefront account placed
it — plus the same set combined across every organization the rep serves. This guide covers the two
new queries, **`salesRepCustomerOrders`** (list, paginated and faceted) and **`salesRepCustomerOrder`**
(single order by id), and the authorization model both enforce. By the end you will be able to call
both against the scoped endpoint and read their responses correctly, including the one non-obvious
rule: **a caller who may not see an order gets `null`, not an error.**

!!! note "Module and endpoint"
    Ships in `vc-module-sales-rep` PR #14 (query surface) and `vc-frontend` PR #2444 (storefront
    consumer), against a scoped schema mounted at **`/graphql/sales-rep`** — the default `/graphql`
    schema does not carry these fields.

## Prerequisites

- A Virto Commerce Platform instance with `vc-module-sales-rep` installed and the store's Sales Rep
  feature enabled.
- A storefront account with the **sales-representative** role, serving at least one organization —
  both queries are caller-scoped.
- Familiarity with the platform OAuth2 password grant and GraphQL Relay-style connections. See
  [`salesRepCustomers` — Developer Guide](../ba-vcst-5304-developer-salesrepcustomers-graphql-2026-07-21.md)
  for the token/store-scoping mechanics shared by the whole module.

## Quick Start

### Step 1: Get a scoped token

```bash
curl -X POST "{{BACK_URL}}/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "username=<sales-rep-login>" \
  -d "password=<sales-rep-password>" \
  -d "scope=offline_access" \
  -d "storeId={{STORE_ID}}"
```

### Step 2: List one customer's orders

```bash
curl -X POST "{{BACK_URL}}/graphql/sales-rep" \
  -H "Authorization: Bearer <token-from-step-1>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { salesRepCustomerOrders(organizationId: \"{{ORGANIZATION_ID}}\", storeId: \"{{STORE_ID}}\") { totalCount items { id number status statusDisplayValue organizationId organizationName customerId createdDate total { amount formattedAmount currency { code symbol } } } } }"}'
```

A trimmed, real-shaped response (values illustrative, GUIDs replaced — this exact shape was captured
live on 2026-09-02, `reports/regression/*/graphql-evidence/SR-GQL-121-*.json`):

```json
{
  "data": {
    "salesRepCustomerOrders": {
      "totalCount": 62,
      "items": [
        { "id": "<order-id>", "number": "<order-number-1>", "status": "New",
          "statusDisplayValue": "New", "organizationId": "{{ORGANIZATION_ID}}",
          "organizationName": "<organization-name>", "customerId": "<placing-contact-id>",
          "createdDate": "2026-09-02T15:52:24Z",
          "total": { "amount": 126, "formattedAmount": "$126.00",
                     "currency": { "code": "USD", "symbol": "$" } } },
        { "id": "<order-id-2>", "number": "<order-number-2>", "status": "New",
          "statusDisplayValue": "New", "organizationId": "{{ORGANIZATION_ID}}",
          "organizationName": "<organization-name>", "customerId": "<a-different-contact-id>",
          "createdDate": "2026-09-02T15:52:19Z",
          "total": { "amount": 118, "formattedAmount": "$118.00",
                     "currency": { "code": "USD", "symbol": "$" } } }
      ]
    }
  },
  "errors": []
}
```

**What happens server-side:** the resolver scopes the query to orders whose `organizationId` is one
the caller's rep-membership admits, then returns every order in that organization regardless of who
placed it — `customerId` differs between the two sample items above precisely because one order was
placed by the rep and the other by a different contact on the same account. Omit `organizationId` to
get the combined list across every organization the rep serves.

### Step 3: Fetch one order by id

```bash
curl -X POST "{{BACK_URL}}/graphql/sales-rep" \
  -H "Authorization: Bearer <token-from-step-1>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { salesRepCustomerOrder(id: \"{{ORDER_ID}}\") { id number organizationId customerId status total { formattedAmount } } }"}'
```

## Query arguments

| Argument | On | Description |
|---|---|---|
| `organizationId` | `salesRepCustomerOrders` | Scope to one served organization; omitted = every served organization |
| `storeId` | both | The store the rep is signed into |
| `cultureName` | both | Localizes `statusDisplayValue` and formatted money |
| `filter` | `salesRepCustomerOrders` | Free-text filter expression (order number, etc.) |
| `facet` | `salesRepCustomerOrders` | Comma-separated facet names to aggregate — **whitelisted server-side**, see below |
| `sort` | `salesRepCustomerOrders` | e.g. `"createddate:desc"`, `"total:asc"` |
| `after` / `first` | `salesRepCustomerOrders` | Relay-style paging |
| `id` | `salesRepCustomerOrder` | The order's id (not its human-readable number) |

Discover the store's own supported filter and sort tokens rather than hardcoding them:
`salesRepOrderFilterRules(storeId, cultureName)` and `salesRepOrderSortRules(storeId, cultureName)`.

## Authorization model — two rules, both server-enforced

### 1. Membership, not authorship, decides visibility

`salesRepCustomerOrders` deliberately returns orders the calling rep did **not** place — visibility is
governed by the rep's **organization membership**, not by who created the order. A locked
per-organization membership excludes only that organization; other served organizations are
unaffected (captured live, `SR-GQL-124-*.json`):

```json
// organizationId = a LOCKED membership
{ "data": { "salesRepCustomerOrders": { "totalCount": 0, "items": [] } }, "errors": [] }
// organizationId = an UNLOCKED membership, same caller
{ "data": { "salesRepCustomerOrders": { "totalCount": 62, "items": [ /* … */ ] } }, "errors": [] }
```

Neither call errors — a locked organization simply resolves to zero rows, never a 4xx.

### 2. An order outside scope resolves `null`, not a 4xx

`salesRepCustomerOrder(id)` is a direct lookup by id, so it is the seam most exposed to a guessed or
leaked id. Captured live (`SR-GQL-129-*.json`): a served order's id returns its data; an id belonging
to an organization the caller does **not** serve returns a **200 OK with `data.salesRepCustomerOrder:
null`** and an empty `errors[]` — identical to a request for an id that does not exist at all.

```json
{ "data": { "salesRepCustomerOrder": null }, "errors": [] }
```

!!! warning "Treat `null` as access-denied-or-not-found, indistinguishably"
    Do not infer from a `null` result whether the id was wrong or merely out of the caller's scope —
    the API does not distinguish the two, by design. Build UI around "not available to you" rather
    than surfacing a 404-style message that implies the id itself is invalid.

### An unknown `facet` name is dropped, never an error

Passing `facet: "xyz_not_a_real_facet"` (or any name outside the module's whitelist, e.g. a raw
`organizationid`) returns the same `totalCount` as an unfaceted call and an empty `term_facets: []` —
captured live, `SR-GQL-125-*.json` / `SR-GQL-127-*.json`. Build a facet UI from
`salesRepOrderFilterRules`'s declared names rather than assuming any field you can select is
aggregatable.

## Errors

GraphQL errors arrive **inside a `200 OK`**, in `errors[]` — a 200 status alone is never proof of
success; check `errors[]` is empty before reading `data`. An authorization refusal on these two
queries specifically does **not** raise an error — see the `null`/zero-row behaviour above.

## Conclusion

`salesRepCustomerOrders` and `salesRepCustomerOrder` give a serving rep a membership-scoped,
creator-agnostic view of a customer's orders, with the same silent-`null` / silent-empty-facet
authorization pattern used elsewhere in this module. For the customer list and dashboard queries this
pairs with, see
[`salesRepCustomers` — Developer Guide](../ba-vcst-5304-developer-salesrepcustomers-graphql-2026-07-21.md).
Live schema reference: `.claude/knowledge/api/graphql-schema.md` (`### Orders` section).

---
*Sources: live GraphQL evidence captured 2026-09-02 (`reports/regression/*/graphql-evidence/SR-GQL-121,124,125,127,129-*.json`),
schema doc `.claude/knowledge/api/graphql-schema.md`. Ticket VCST-5733, verified on `vcst-qa`.*
