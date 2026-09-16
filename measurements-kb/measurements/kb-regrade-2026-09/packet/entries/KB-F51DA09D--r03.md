---
id: KB-F51DA09D
subject: gql-mutations-changeorganizationcontactrole
plane: derived-first
question: What is the signature of the GraphQL mutation `Mutations.changeOrganizationContactRole`, and what do its inputs require?
status: active
refutableBy: derivation
appliesTo:
  - surface: graphql
    root: Mutations
    platformVersion: 3.1007.26
anchors:
  - coordinate: Mutations.changeOrganizationContactRole
    hash: c7d8e31b9887
  - coordinate: CustomIdentityResultType
    hash: c1b126f55031
  - coordinate: InputChangeOrganizationContactRoleType
    hash: 5ca30cff733b
evidence:
  - method: extraction
    deployment: vcptcore_stable
    pin: c2f9c438eba4cd95
---

# Mutations.changeOrganizationContactRole

A GraphQL mutation field on the root type `Mutations`. The root type names on this deployment are read from introspection, not assumed: `Query` / `Mutations` / `Subscriptions`.

```graphql
changeOrganizationContactRole(command: InputChangeOrganizationContactRoleType!): CustomIdentityResultType
```

| argument | type | required | what the schema says |
|---|---|---|---|
| `command` | `InputChangeOrganizationContactRoleType!` | yes | — |

Types in this signature: `CustomIdentityResultType` (OBJECT) — `gql-type-customidentityresulttype`, `InputChangeOrganizationContactRoleType` (INPUT_OBJECT) — `gql-type-inputchangeorganizationcontactroletype`.

Generated from `vcptcore_stable` at pin `c2f9c438eba4cd95`. Table: `derived/graphql/gql-mutations-changeorganizationcontactrole.json`.
