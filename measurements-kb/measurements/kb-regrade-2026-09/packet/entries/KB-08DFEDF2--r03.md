---
id: KB-08DFEDF2
subject: gql-type-inputchangeorganizationcontactroletype
plane: derived-first
question: What fields does the GraphQL type `InputChangeOrganizationContactRoleType` have, and what type is each?
status: active
refutableBy: derivation
appliesTo:
  - surface: graphql
    platformVersion: 3.1007.26
anchors:
  - coordinate: InputChangeOrganizationContactRoleType
    hash: 5033fbfaaf42
  - coordinate: InputChangeOrganizationContactRoleType.roleIds
    hash: d33cc5fde88a
  - coordinate: InputChangeOrganizationContactRoleType.userId
    hash: 1709a4b32a68
evidence:
  - method: extraction
    deployment: vcptcore_stable
    pin: c2f9c438eba4cd95
---

# InputChangeOrganizationContactRoleType

A GraphQL input object type on this deployment's schema, carrying 2 fields. It is what an operation accepts: a required field left out is refused before anything is attempted.

| field | type | what the schema says |
|---|---|---|
| `roleIds` | `[String!]` | Role IDs or names to be assigned to the user |
| `userId` | `String` | User identifier to be changed |

Generated from `vcptcore_stable` at pin `c2f9c438eba4cd95`. Table: `derived/graphql/gql-type-inputchangeorganizationcontactroletype.json`.
