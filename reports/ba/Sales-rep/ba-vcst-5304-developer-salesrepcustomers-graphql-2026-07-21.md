# Sales Rep — `salesRepCustomers` GraphQL query — Developer Guide

The **Sales Rep** module (`vc-module-sales-rep`) adds a *scoped* xAPI schema that a signed-in sales
representative uses to work the book of customer organizations they are responsible for. This guide
covers the story's core backend deliverable — the **`salesRepCustomers`** query, which returns the
organizations the calling rep serves, each with an optional **last order** for that rep. By the end you
will be able to authenticate against the scoped endpoint, page/search/sort the customer list, and
hydrate each customer's most-recent order (money, status, line-item count).

!!! note "Module availability"
    The Sales Rep module is deployed on **vcptcore-qa only** (it is absent from vcst-qa and
    virtostart). It ships in `vc-module-sales-rep` PR #2; the storefront consumer is `vc-frontend`
    PR #2380 (Sales Rep hub → **My customers**).

## Prerequisites

- **Virto Commerce Platform**: an instance with `vc-module-sales-rep` installed and the store's
  Sales Rep feature enabled (`SalesRep.Enabled = true` on the target store).
- **A storefront account with the sales-representative role** that serves at least one organization.
  `salesRepCustomers` is caller-scoped — an anonymous or non-rep caller is rejected.
- **The scoped endpoint**, not the default xAPI one. The default xAPI schema at `/graphql` does **not**
  expose the sales-rep types; the module mounts its own schema at `/graphql/sales-rep`.
- Basic familiarity with the platform OAuth2 password grant and GraphQL Relay-style connections.

## Quick Start

### Step 1: Get a scoped access token

The rep authenticates with the platform token endpoint. The **`storeId`** parameter is required — the
sales-rep scope is bound to the store the rep signs into.

```bash
curl -X POST "{{BACK_URL}}/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "username=<sales-rep-login>" \
  -d "password=<sales-rep-password>" \
  -d "scope=offline_access" \
  -d "storeId={{STORE_ID}}"
```

!!! warning "A rep locked in their default organization cannot get a token"
    If the rep's **default** organization is one where their membership is locked, the password grant
    fails with `400 user_is_locked_in_organization`, and an `organization_id` form parameter does **not**
    override it. Sign in against an organization where the rep is active instead.

### Step 2: Call `salesRepCustomers` against the scoped schema

```bash
curl -X POST "{{BACK_URL}}/graphql/sales-rep" \
  -H "Authorization: Bearer <token-from-step-1>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { salesRepCustomers(first: 20, sort: \"organizationName:asc\", storeId: \"{{STORE_ID}}\", cultureName: \"en-US\") { totalCount pageInfo { hasNextPage endCursor } items { organizationId organizationName lastOrder { number createdDate status total { formattedAmount } } } } }"}'
```

The response is a Relay connection of the organizations this rep serves. Interactive exploration is
available in the GraphiQL UI mounted at **`{{BACK_URL}}/ui/graphiql/sales-rep`** (the default GraphiQL
at `/ui/graphiql` introspects only the base xAPI schema and will not show these fields).

## Query arguments

All arguments are optional; omitting them returns the first page of every organization the rep serves,
in the default order.

| Argument | Type | Description | Default |
|----------|------|-------------|---------|
| `first` | `Int` | Page size (number of organizations to return). | server default |
| `after` | `String` | Relay cursor — pass the previous page's `endCursor` (a numeric offset string, e.g. `"2"`). | `null` (first page) |
| `keyword` | `String` | Filters organizations by name / account ID (member search index). | `""` (no filter) |
| `sort` | `String` | Sort expression, `field:direction` — e.g. `organizationName:asc`, `organizationName:desc`. | server default |
| `storeId` | `String` | Scopes each item's `lastOrder` to that store. When `null`, `lastOrder` is the rep's globally most-recent order for the organization. | `null` |
| `cultureName` | `String` | Localizes money (`lastOrder.total.formattedAmount`) and status display values. | store default |

## Response shape

`salesRepCustomers` returns a connection. Each `item` is one customer organization.

```graphql
query SalesRepCustomers {
  salesRepCustomers(
    first: 20
    after: "0"
    keyword: ""
    sort: "organizationName:asc"
    storeId: "{{STORE_ID}}"
    cultureName: "en-US"
  ) {
    totalCount
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    items {
      organizationId
      organizationName
      iconUrl
      address {                # organization's primary address
        line1
        city
        regionName
        postalCode
        countryCode
      }
      lastOrder {              # the CALLING rep's own most-recent order; may be null
        id
        number
        createdDate
        status
        itemsCount
        total {                # nested MoneyType
          amount               # 133.20
          formattedAmount      # "$133.20"  (localized via cultureName)
          currency {
            code                # "USD"
            symbol              # "$"
          }
        }
      }
    }
  }
}
```

!!! warning "`lastOrder.total` is a nested `MoneyType`, not a flat scalar"
    An earlier module build (pr-2380) exposed `total` / `currency` as flat scalars. The finalized
    contract (sales-rep pr-2) makes `total` a **`MoneyType`** object —
    `{ amount, formattedAmount, currency { code, symbol } }`. Select the nested shape.

## Semantics you must not get wrong

These are the invariants the query enforces — verified live on vcptcore-qa (2026-07-17):

1. **Caller-scoped org list.** `items` are exactly the organizations the calling rep serves. An
   organization the rep does not serve never appears. (Verify probe: a rep serving 4 orgs sees exactly
   those 4; a non-served org is excluded.)
2. **`lastOrder` is the rep's *own* last order — not the organization's.** It is the most-recent order
   **placed by the calling rep** for that organization. A co-rep's order, or an admin-seeded order for
   the same organization, does **not** surface here. A rep who has placed no order for an organization
   they serve gets `lastOrder: null` for it. This is a data-isolation boundary, not a convenience default.
3. **`storeId` scopes `lastOrder`.** With `storeId` set, `lastOrder` is the rep's most-recent order
   *in that store*; a newer order in a different store is ignored. With `storeId` omitted/null, it is the
   rep's globally most-recent order for the organization.
4. **Locked-membership organizations are excluded.** If the rep's membership in an organization is
   locked (per-org lock), that organization is dropped from `items`.
5. **Anonymous / non-rep callers are rejected** with an authorization error (message matches `/anonym/i`
   for the anonymous case) — `data.salesRepCustomers` is not returned.

## Extension points

The scoped schema is contributed by the module, so the shape above is the module's public contract:

```text
vc-module-sales-rep/
├── src/                          # domain + GraphQL schema contribution
│   └── ...SalesRep*Query          # salesRepCustomers resolver, org-scope + last-order hydration
└── (mounts)  /graphql/sales-rep   # scoped xAPI endpoint (separate schema from base /graphql)
             /ui/graphiql/sales-rep # GraphiQL bound to the scoped schema
```

Sibling queries in the same scoped schema (documented separately): `customerSalesReps` (the inverse —
the reps serving a caller's organization) and the per-customer profile queries behind VCST-5308
(`salesRepCustomer`, `salesRepOrders`).

## Conclusion / next steps

`salesRepCustomers` is the entry point for any Sales Rep hub integration: authenticate against the
scoped store, page/search the served-organization list, and read each customer's rep-scoped last order.
Keep the two boundaries front of mind — the list is scoped to organizations the rep **serves**, and
`lastOrder` is scoped to the rep's **own** orders (then optionally to a store).

- **Storefront consumer:** `vc-frontend` PR #2380 — Sales Rep hub → **My customers** page.
- **Customer profile page** (built on top of this list): VCST-5308 / VCST-5309 (`salesRepCustomer`,
  `salesRepOrders`).
- **Test coverage:** `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` (SR-GQL-009…014).

---
*Sources / grounding:*
- *JIRA VCST-5304 "[BE] [Sales Rep] Reorganize left rail and show My customers information" (Done; epic VCST-5142 Sales Rep Hub) — assignee K. Iusupov's finalized `salesRepCustomers` contract comment + QA verification comment (A. Mitricheva, 2026-07-17).*
- *Live behavior verified on vcptcore-qa @ sales-rep xAPI pr-2, Theme 2.54.0-pr-2383 (2026-07-17); module `vc-module-sales-rep` PR #2, `vc-frontend` PR #2380.*
- *Contract synced into suite 050m (SR-GQL-009…014): nested `MoneyType`, per-rep `lastOrder` attribution, store scoping, locked-org exclusion.*
- *Terminology grounded against VirtoOZ `B2BExperts` (sales rep serving/servicing customer organizations, acting on their behalf).*
