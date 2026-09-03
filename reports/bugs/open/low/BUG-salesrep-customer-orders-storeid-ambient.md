# salesRepCustomerOrders: omitting `storeId` silently aggregates across stores — P3

**Severity:** P3 · **Type:** API contract / ambient-context argument (GraphQL xAPI, scoped `sales-rep` schema)
**Provenance:** PRE-EXISTING pattern (the documented xAPI ambient-context-args hazard)
**Reference:** `reference_xapi_ambient_context_args` — an optional context arg means omitting it returns
`200` with a wrong/wider result, never an error

**Env:** vcst-qa @ Platform 3.1063.0, SalesRep 3.1007.0-pr-14-5569, XOrder 3.1010.0

## Summary
`storeId` is optional on `salesRepCustomerOrders`. Omitted, the query returns orders from **every store**
the rep's served organizations transact in, with no indication that it has widened. Measured in one
session: **95** orders with `storeId` omitted against **94** with `storeId: "B2B-store"`; the extra row was
`AGENT-TEST-SRO-ACME-ELEC`, an order on the **Electronics** store.

Supplied values behave correctly, which is what makes the omission the whole of the problem:

| `storeId` | Result |
|---|---|
| omitted | 95 (includes an Electronics-store order) |
| `B2B-store` | 94 |
| `Electronics` | exactly 1 |
| a bogus value | 0 — fails closed |

**Membership scope still holds throughout**, so this is *not* a cross-organization leak: every row still
belongs to an organization the rep serves. The defect is a silently wider store scope, not a security
boundary failure.

## Steps to Reproduce
1. Obtain a sales-rep token (`storeId={{STORE_ID}}`).
2. `POST /graphql/sales-rep` → `{ salesRepCustomerOrders(cultureName:"{{CULTURE_NAME}}", first:1, facet:"organizationname") { totalCount } }` — **no `storeId`**.
3. Repeat with `storeId: "{{STORE_ID}}"` and compare `totalCount`.
4. Repeat with `storeId: "Electronics"`, then with a bogus store id, to confirm supplied values are honoured and fail closed.

## Expected vs Actual
- **Expected:** either `storeId` is required, or an omitted `storeId` resolves to the caller's store context — not a silent union across stores.
- **Actual:** omitted → cross-store aggregation, `200`, no warning, and the widening is invisible unless you already know the per-store counts.

## Why it is recorded despite being a known pattern
The storefront always sends `storeId`, so the user-facing page is unaffected today. It is recorded because
this surface is **new** and its callers are not all written yet: any future consumer that omits the
argument gets a quietly wrong answer rather than an error, and the counts are close enough (95 vs 94) that
the discrepancy would not be noticed by inspection.

## Notes
Below the `/qa-test` 5d severity floor, so **not filed to the tracker** — recorded in
`reports/tickets/Sprint26-17/VCST-5733/summary.json` `bugs_not_filed[]`. Store isolation for the *rep*
fixture (`SR_REP_SECOND_STORE`, scoped to the Electronics store) was not exercised directly: that alias
carries no resolvable credential pair, so the black-box probe above is the coverage.
