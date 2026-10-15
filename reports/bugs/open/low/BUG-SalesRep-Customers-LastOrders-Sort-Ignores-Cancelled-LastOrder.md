# BUG: Sales Rep "My customers" sorted by last orders ranks a customer as if its newest (cancelled) order did not exist, while showing that order

**Severity:** Low · **Provenance:** OUT-OF-SCOPE (incidental, found during VCST-5755; likely pre-existing — not caused by the cache change) · **Env:** vcptcore-qa, SalesRep 3.1013.0-pr-18-42c1, Platform 3.1078.0 · **Found:** 2026-10-12 by agent (found-by-agent, found-in-testing)

## Steps (rep token, `POST {{BACK_URL}}/graphql/sales-rep`)
1. As `@td(SR_REP_PRIMARY)`, place an order in served org A so it is the rep's newest order anywhere.
2. Admin cancels it: `PUT /api/order/customerOrders` with `isCancelled: true`.
3. Query `salesRepCustomers(sort: "my-last-orders:desc")`.

## Actual
Org A's row shows `lastOrder` = the cancelled order (status `Cancelled`, created today — the newest date in the list), yet the row is ranked **last**, behind orgs whose last orders are ~2 months older. Its position matches A's last *non-cancelled* order. Every read matched its cold twin key on both replicas, so this is not stale cache.

## Expected
The displayed `lastOrder` and the `my-last-orders` sort key use the same scope — both exclude flag-cancelled orders (consistent with `BL-SR-005`) or both include them.

## Impact
The list looks unordered to the rep (newest-looking row at the bottom). No wrong figure. Below the filing floor — draft only.

## Evidence
Run of 2026-10-12 07:53–07:58 UTC; order CO261012-00001 (id `113370f8-bf04-4ce5-81c1-9430477a8ed6`, since deleted). kb: KB-08FAC65C (vcptcore_qa).
