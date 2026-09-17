# Organization Loyalty Balance — Developer Guide

## Overview
When a store's `Loyalty.LoyaltyBalanceCalculationMode` is set to **Organization**, the xAPI
`loyaltyBalance` and `loyaltyPointsHistory` GraphQL queries return the calling member's
**organization pool** rather than a personal balance. Scope is resolved server-side from the caller's
organization membership token claim — there is no `organizationId` argument to pass, and one cannot be
forged: a caller-supplied value is silently rewritten to the caller's own organization.

## Prerequisites
- A valid storefront access token for a user who is a member of the organization you're querying.
- `VirtoCommerce.Loyalty >= 3.1008.0-pr-17` deployed on the target store.

## Breaking change: `storeId` is now required
Both `loyaltyBalance` and `loyaltyPointsHistory` now require a `storeId` argument. Omitting it fails
cleanly, with this exact error:

```
Argument 'storeId' of type 'String!' is required for field 'loyaltyBalance' but not provided.
```

Any existing integration calling these fields without `storeId` will break on upgrade. Add `storeId` to
every call before you deploy against a store running this version.

## Querying the balance
```graphql
query LoyaltyBalance($storeId: String!) {
  loyaltyBalance(storeId: $storeId) {
    currentBalance
    resultBalance
  }
}
```

- `currentBalance` — the caller's full balance. Under Organization mode this is the shared organization
  total, identical for every member of that organization.
- `resultBalance` — also returned by this type. This run did not exercise it against an `orderId`, so
  treat its meaning as uncharacterised: in every observation here it returned the same value as
  `currentBalance`. Do not build on an assumed distinction between the two without measuring it.
- There is **no** `balance`, `available`, or `currency` field on this type. Validate field names against
  the live schema before integrating — introspect `{{BACK_URL}}/graphql` directly, or consult
  `.claude/knowledge/api/graphql-schema.md`, which at time of writing has not yet caught up with this
  change.

!!! warning "No per-member breakdown under Organization mode"
    `loyaltyPointsHistory` returns every member's pooled activity, and no field on that result identifies
    which member caused a given row. Do not build a "my points only" view against this endpoint while a
    store is in Organization mode — pooled rows currently cannot be filtered or attributed to an
    individual member.

## Sources
- `.claude/knowledge/api/graphql-schema.md`
- Live introspection: `{{BACK_URL}}/graphql`

---
*Verified on localhost @ Platform `3.1071.0-pr-3108-016f`, `VirtoCommerce.Loyalty 3.1008.0-pr-17-973e` ·
VCST-5024 verdict: NOT REACHED — the 5b gate REJECTED on re-verification (its single fix round); the run
stopped and handed to a human · Not documented: `loyaltyMissionProgress`'s own `storeId` requirement (a
separate contract change, uncovered by any case this run and reported to the operator separately, not
here) · Evidence: `reports/tickets/Sprint26-18/VCST-5024/`*
