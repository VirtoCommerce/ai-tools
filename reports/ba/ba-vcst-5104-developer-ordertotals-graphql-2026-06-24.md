# Mixed-Cart Loyalty Orders — `orderTotals` GraphQL Reference

This guide explains how to query per-currency order totals for mixed-cart loyalty orders via the Virto
Commerce xAPI GraphQL endpoint. By the end you will be able to retrieve the USD and PTS breakdowns from
`CustomerOrderType.orderTotals`, handle the single-currency case, and correctly interpret business errors
for insufficient loyalty balance.

## Prerequisites

- **GraphQL endpoint**: `POST {{BACK_URL}}/graphql`
- **Auth**: OAuth2 Bearer token (password grant). Full flow: `.claude/agents/knowledge/api/api-auth.md`.
- **Schema reference**: `.claude/agents/knowledge/api/graphql-schema.md` — verified by live introspection
  on `{{BACK_URL}}/graphql` (2026-06-24).
- **Basic knowledge** of GraphQL queries and HTTP Bearer auth.

## Quick Start

### Step 1: Obtain a Bearer token

```bash
curl -s -X POST "{{BACK_URL}}/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&scope=offline_access" \
  -d "username=@td(LOYALTY_VIP_USER.email)" \
  -d "password=@td(LOYALTY_VIP_USER.password)" \
  -d "storeId=B2B-store" \
  | jq -r '.access_token'
```

Set the result as `TOKEN` for the calls below. An admin token (`@td(ADMIN_DEFAULT.username)` /
`@td(ADMIN_DEFAULT.password)`) returns orders for any customer; a customer token is scoped to that
customer's own orders.

### Step 2: Query the order with `orderTotals`

```graphql
query GetOrderWithTotals($orderNumber: String!) {
  order(number: $orderNumber) {
    id
    number
    status
    createdDate
    currency { code symbol exchangeRate }

    # Top-level totals: primary currency (USD) ONLY
    total         { amount formattedAmount currency { code symbol } }
    subTotal      { amount formattedAmount currency { code symbol } }
    taxTotal      { amount formattedAmount currency { code symbol } }
    discountTotal { amount formattedAmount currency { code symbol } }

    # Per-currency breakdown (null or empty on pre-feature orders)
    orderTotals {
      isDefaultTotalCurrency
      total         { amount formattedAmount currency { code symbol } }
      subTotal      { amount formattedAmount currency { code symbol } }
      taxTotal      { amount formattedAmount currency { code symbol } }
      discountTotal { amount formattedAmount currency { code symbol } }
    }

    items {
      id productId sku name quantity
      price        { amount formattedAmount currency { code } }
      extendedPrice { amount formattedAmount currency { code } }
    }

    inPayments {
      id number status gatewayCode
      sum { amount formattedAmount currency { code } }
    }
  }
}
```

Variables:

```json
{ "orderNumber": "@td(RECENT_ORDER.number)" }
```

Execute it by POSTing `{ "query": "<the query above>", "variables": { "orderNumber": "…" } }` as JSON
to `{{BACK_URL}}/graphql` with `Authorization: Bearer $TOKEN` (escape newlines when inlining the query
into a curl `-d` string), or paste it into GraphiQL at `{{BACK_URL}}/ui/graphiql`.

---

## Type Reference

### `CustomerOrderType.orderTotals`

`orderTotals: [OrderTotalType]` — nullable list. Returns `null` or `[]` for orders created before this
feature was deployed. For post-deployment orders:

- **Single-currency order**: one element, `isDefaultTotalCurrency: true`.
- **Mixed-currency loyalty order**: two elements — element 0 is the primary (USD) leg, element 1 is the
  secondary (PTS) leg.

### `OrderTotalType`

| Field | Type | Description |
|-------|------|-------------|
| `isDefaultTotalCurrency` | `Boolean!` | `true` = primary store currency (USD); `false` = secondary currency (PTS). |
| `total` | `MoneyType!` | Grand total for this currency leg. |
| `subTotal` | `MoneyType!` | Line-items subtotal before shipping, tax, discounts. |
| `taxTotal` | `MoneyType!` | Tax portion for this leg. |
| `discountTotal` | `MoneyType!` | Discount amount for this leg. |

### `MoneyType` (relevant fields)

| Field | Type | Notes |
|-------|------|-------|
| `amount` | `Decimal!` | Raw numeric value. |
| `formattedAmount` | `String!` | Locale-formatted string, e.g. `"$420.00"` or `"PTS 10.00"`. |
| `currency` | `CurrencyType!` | Select `code` and `symbol`; avoid `name` — known resolver issue on some orders. |

### `CurrencyType` (safe fields)

```graphql
currency { code symbol exchangeRate }
```

!!! warning
    Do **not** select `currency { name }` on `MoneyType` fields inside `orderTotals`. The `name`
    resolver has a known `INVALID_OPERATION` error on certain order configurations. Use `code` and
    `symbol` instead.

---

## Sample Responses

### Single-currency order (`orderTotals` length 1)

```json
{
  "data": {
    "order": {
      "id": "<ORDER_ID>",
      "number": "<ORDER_NUMBER>",
      "status": "Processing",
      "orderTotals": [
        {
          "isDefaultTotalCurrency": true,
          "total":         { "amount": 1302.00, "formattedAmount": "$1,302.00", "currency": { "code": "USD", "symbol": "$" } },
          "subTotal":      { "amount":  835.00, "formattedAmount": "$835.00",   "currency": { "code": "USD", "symbol": "$" } },
          "taxTotal":      { "amount":  217.00, "formattedAmount": "$217.00",   "currency": { "code": "USD", "symbol": "$" } },
          "discountTotal": { "amount":    0.00, "formattedAmount": "$0.00",     "currency": { "code": "USD", "symbol": "$" } }
        }
      ]
    }
  }
}
```

### Mixed-currency loyalty order (`orderTotals` length 2)

```json
{
  "data": {
    "order": {
      "id": "<ORDER_ID>",
      "number": "<ORDER_NUMBER>",
      "status": "Processing",
      "orderTotals": [
        {
          "isDefaultTotalCurrency": true,
          "total":         { "amount": 705.60, "formattedAmount": "$705.60",    "currency": { "code": "USD", "symbol": "$"   } },
          "subTotal":      { "amount": 438.00, "formattedAmount": "$438.00",    "currency": { "code": "USD", "symbol": "$"   } },
          "taxTotal":      { "amount": 117.60, "formattedAmount": "$117.60",    "currency": { "code": "USD", "symbol": "$"   } },
          "discountTotal": { "amount":   0.00, "formattedAmount": "$0.00",      "currency": { "code": "USD", "symbol": "$"   } }
        },
        {
          "isDefaultTotalCurrency": false,
          "total":         { "amount": 190.00, "formattedAmount": "PTS 190.00", "currency": { "code": "PTS", "symbol": "PTS" } },
          "subTotal":      { "amount": 190.00, "formattedAmount": "PTS 190.00", "currency": { "code": "PTS", "symbol": "PTS" } },
          "taxTotal":      { "amount":   0.00, "formattedAmount": "PTS 0.00",   "currency": { "code": "PTS", "symbol": "PTS" } },
          "discountTotal": { "amount":   0.00, "formattedAmount": "PTS 0.00",   "currency": { "code": "PTS", "symbol": "PTS" } }
        }
      ]
    }
  }
}
```

!!! tip
    Filter the PTS leg with `orderTotals.find(t => !t.isDefaultTotalCurrency)` and the USD leg with
    `orderTotals.find(t => t.isDefaultTotalCurrency)`. Never rely on array index alone.

---

## Loyalty Points Deduction Contract

Loyalty points are deducted **server-side at `createOrderFromCart`** (placement), not during cart
evaluation or payment processing.

On success, the customer's `loyaltyBalance { currentBalance resultBalance }` reflects the reduced
balance. The loyalty engine simultaneously:

1. **Redeems** points equal to the PTS total (`orderTotals[isDefaultTotalCurrency=false].total.amount`).
2. **Credits earned** points on the USD sub-total according to the active loyalty program (e.g. LOY-001
   ProductPoints: 1 point per $1.00 USD).

Both operations reference the same order number in the loyalty transaction history.

### Insufficient balance — error inside HTTP 200

If the customer's points balance is lower than the PTS total at placement time, the mutation returns HTTP
200 with a business error. **HTTP 200 does NOT mean success for GraphQL** — always inspect `errors[]`.

```json
{
  "errors": [
    {
      "message": "LOYALTY_INSUFFICIENT_BALANCE",
      "extensions": { "code": "LOYALTY_INSUFFICIENT_BALANCE" }
    }
  ],
  "data": { "createOrderFromCart": null }
}
```

!!! warning
    There is **no pre-emptive cart validation** for insufficient points. The storefront does not show a
    banner on the cart page if the balance is borderline. The error is raised at placement only. Design
    client-side flows accordingly — check `errors[]` in the `createOrderFromCart` response before
    treating the order as confirmed.

---

## Conclusion / Next Steps

You can now retrieve the full per-currency breakdown for mixed-cart loyalty orders via `orderTotals`,
distinguish primary from secondary currency legs using `isDefaultTotalCurrency`, and handle the
`LOYALTY_INSUFFICIENT_BALANCE` business error.

Next steps:

- Run the curated fixture queries in `test-data/graphql/` to exercise the order and loyalty flows against
  a seeded environment.
- See `.claude/agents/knowledge/api/graphql-test-cases-runner.md` for the runner-native test format if
  you are authoring conforming GraphQL test cases.
- Consult `.claude/agents/knowledge/api/graphql-schema.md` for the full `CustomerOrderType` field
  inventory, including `inPayments`, `shipments`, and `dynamicProperties`.

---

**Sources:** Live introspection of `CustomerOrderType` / `OrderTotalType` / `MoneyType` / `CurrencyType`
on `{{BACK_URL}}/graphql` (2026-06-24); `.claude/agents/knowledge/api/graphql-schema.md`;
`.claude/agents/knowledge/api/api-auth.md`; vc-module-x-order PR #43; vc-module-order PR #497;
vc-module-loyalty PR #10; vc-frontend PR #2335.
