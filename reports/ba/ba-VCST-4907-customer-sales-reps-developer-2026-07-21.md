# My Sales Reps (`customerSalesReps`) — Developer Guide

The **`customerSalesReps`** GraphQL query lets a signed-in B2B company member retrieve the contact
information of every Sales Representative who supports **their own organization** — so a storefront
can render a "My Sales Reps" panel with each rep's name, photo, email, and phone. This guide shows how
to authenticate, run the query, page and filter the results, and integrate it into a storefront.

The query is served by the **Sales Rep** module ([vc-module-sales-rep](https://github.com/VirtoCommerce/vc-module-sales-rep))
on its own **scoped GraphQL schema**, separate from the default xAPI.

## Prerequisites

- **Sales Rep module** installed and running on the platform. The query lives on a scoped endpoint that
  only exists when the module is deployed (today: `vcptcore-qa` only — absent on stores without the module).
- **A store-bound buyer account** that is a **member of an organization**. The organization is read from
  the caller's `organization_id` token claim — there is **no organization argument** — so the account must
  resolve to exactly one organization context.
- **API host**: `{{BACK_URL}}` (already ends in `/`). Do not hardcode it — see `.claude/rules/test-data.md`.
- Basic familiarity with the OAuth2 password grant and GraphQL.

## Quick Start

### Step 1: Get an access token (the `storeId` form param is required)

Store-bound accounts (reps **and** buyers) return **`400 invalid_grant`** on the token endpoint unless the
request carries a **`storeId`** form parameter. This is the single most common integration mistake.

```bash
curl -X POST "{{BACK_URL}}connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=<buyer-email>" \
  --data-urlencode "password=<buyer-password>" \
  --data-urlencode "scope=offline_access" \
  --data-urlencode "storeId=B2B-store"
```

!!! warning "Omitting `storeId` fails with `invalid_grant`"
    Without the `storeId` form param the grant is rejected even though the credentials are valid. Use the
    store the buyer shops in (`B2B-store` in our example; `Electronics` for a secondary store).

The response contains `access_token` — pass it as a bearer token in Step 2.

### Step 2: Run the query

```bash
curl -X POST "{{BACK_URL}}graphql/sales-rep" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  --data '{"query":"query { customerSalesReps { totalCount items { id fullName emails phones } } }"}'
```

The full field selection:

```graphql
query CustomerSalesReps {
  customerSalesReps(first: 20, after: "0", keyword: "", sort: "name:asc", storeId: "B2B-store") {
    totalCount
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    items {
      id
      firstName
      lastName
      middleName
      fullName
      name
      about
      photoUrl
      emails
      phones
    }
  }
}
```

Your list of the caller organization's active Sales Reps is now available in `data.customerSalesReps.items`.

!!! tip "Explore interactively"
    A scoped GraphiQL IDE is available at **`{{BACK_URL}}ui/graphiql/sales-rep`** — set an
    `Authorization: Bearer <token>` header and run the query there before wiring it into code.

## Arguments

All arguments are optional; with none supplied the query returns the first page of the caller
organization's reps in creation order.

| Argument | Type | Description | Default |
|----------|------|-------------|---------|
| `first` | Int | Page size (number of reps to return). | server default |
| `after` | String | Zero-based offset cursor as a string (`"0"`, `"2"`, …). | `"0"` |
| `keyword` | String | Case-insensitive **substring** filter routed to the member search index; matches on the rep's name. | none |
| `sort` | String | `field:direction`, e.g. `name:desc`. **Only the direction is applied today** — see Known limitations. | creation order |
| `storeId` | String | Restrict to reps whose account is bound to this store. **Omit / null = all stores.** | all stores |

## Response

`customerSalesReps` returns a standard connection.

| Field | Type | Notes |
|-------|------|-------|
| `totalCount` | Int | Total reps serving the caller org after filtering. |
| `pageInfo` | Object | `hasNextPage`, `hasPreviousPage`, `startCursor`, `endCursor`. |
| `items` | `[SalesRep]` | The reps on this page (fields below). |

**`SalesRep` item fields**

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (GUID) | The rep's contact id — never empty. |
| `firstName` / `lastName` / `middleName` | String | Individual name parts. |
| `fullName` | String | Composed display name (populated for seeded/real reps). |
| `name` | String | Member `name`. |
| `about` | String | Free-text bio the rep/admin entered. |
| `photoUrl` | String | Avatar URL. **Usually `null`** — the admin blade has no photo control today (see note). |
| `emails` | [String] | Contact emails; the login email is the first entry. |
| `phones` | [String] | Contact phone numbers. |

## Behavior & scoping rules

These are the guarantees the query enforces (validated live on `vcptcore-qa`, suite
`regression/suites/Backend/graphql/050m-graphql-sales-rep.csv`):

- **Organization from the token, not an argument.** The caller's org comes from the `organization_id`
  claim; there is no way to query another organization's reps. A rep who serves only *another* org is
  never returned (no cross-org leak).
- **Active reps only.** A rep is excluded when their **account is blocked** (lockout set) or when their
  **membership in the caller's organization is locked** (a per-org lock, distinct from an account block).
  Disabled/deleted reps are likewise excluded.
- **Anonymous is rejected.** With no bearer token the query returns a GraphQL error (message matches
  `/anonym/i`) — it does not return an empty list.
- **Store scoping.** Rep accounts are store-bound. `storeId: "B2B-store"` returns only reps bound to that
  store; a different `storeId` returns that store's reps; **omitting `storeId` returns reps across all
  stores**. The filter keys on the value, so there is no privileged "default" store.
- **Keyword** is a case-insensitive substring match on the rep's name, resolved through the member search
  index — so a newly created rep must be indexed before it is keyword-findable.

## Storefront integration

- **Show the menu only when the module is present.** The storefront should detect whether the Sales Rep
  module is installed on the backend and, if so, surface the **"Sales Reps"** menu item. Do not gate the
  menu on a hardcoded role name.
- **Keep role/permission logic on the backend.** Any check for "is this account a Sales Rep" or "which
  org does this rep serve" is enforced server-side via the `sales-rep:access` permission and the query's
  scoping — the storefront never re-implements it.
- The buyer-facing storefront view built on this query ships in `vc-frontend`; the counterpart rep-facing
  queries (`salesRepCustomers`, `salesRepCustomer`, `salesRepOrders`, `salesRepOrderStatuses`) live on the
  same scoped schema and are covered by the same suite.

## Known limitations

!!! warning "The `sort` field component is ignored"
    Today only the **direction** in `sort` is applied. `name:asc`, `firstName:asc`, and `lastName:asc` all
    return the same **creation order**; only `:desc` reverses it. Do not rely on sorting by a specific
    field until this is addressed. *(Observed during QA — a product decision, not a filed defect.)*

!!! note "`photoUrl` is usually null"
    The Sales Rep admin blade has no photo/avatar upload control, so `photoUrl` typically resolves to
    `null` unless the underlying contact photo was set through another path. Render a fallback avatar.

## Conclusion

`customerSalesReps` gives a company member a scoped, active-only, store-aware list of the reps who support
their organization — driven entirely by their token, with no org argument to leak across tenants. Pair it
with the module-installed check above to light up a storefront "My Sales Reps" panel. To configure which
reps a member actually sees, see the companion admin guide:
[Make Sales Reps visible to company members](./ba-VCST-4907-sales-rep-visibility-admin-2026-07-21.md).

---
*Sources: JIRA [VCST-4907](https://virtocommerce.atlassian.net/browse/VCST-4907) "[BE] [Organization member] My Sales Reps Contact Information" (Epic VCST-5142 *Sales Rep Hub*) incl. the dev contract comment; live-verified contract in `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` (SR-GQL-001…008) on `vcptcore-qa` (`{{BACK_URL}}` = https://vcptcore-qa.govirto.com/); [VirtoCommerce/vc-module-sales-rep](https://github.com/VirtoCommerce/vc-module-sales-rep). The scoped `/graphql/sales-rep` schema is not in the published developer docs and is not introspectable by the default xAPI tooling.*
