---
id: KB-B321AACD
subject: gql-mutations-createorderfromcart
plane: derived-first
question: What is the signature of the GraphQL mutation `Mutations.createOrderFromCart`, and what do its inputs require?
status: active
refutableBy: derivation
appliesTo:
  - surface: graphql
    root: Mutations
    platformVersion: 3.1007.26
anchors:
  - coordinate: Mutations.createOrderFromCart
    hash: efe0d8ee7194
  - coordinate: CustomerOrderType
    hash: 15bd3945be9c
  - coordinate: InputCreateOrderFromCartType
    hash: 7dcb7cd0e29c
evidence:
  - method: extraction
    deployment: vcptcore_stable
    pin: c2f9c438eba4cd95
---

# Mutations.createOrderFromCart

A GraphQL mutation field on the root type `Mutations`. The root type names on this deployment are read from introspection, not assumed: `Query` / `Mutations` / `Subscriptions`.

```graphql
createOrderFromCart(command: InputCreateOrderFromCartType!): CustomerOrderType
```

| argument | type | required | what the schema says |
|---|---|---|---|
| `command` | `InputCreateOrderFromCartType!` | yes | — |

Types in this signature: `CustomerOrderType` (OBJECT) — `gql-type-customerordertype`, `InputCreateOrderFromCartType` (INPUT_OBJECT) — `gql-type-inputcreateorderfromcarttype`.

Generated from `vcptcore_stable` at pin `c2f9c438eba4cd95`. Table: `derived/graphql/gql-mutations-createorderfromcart.json`.
