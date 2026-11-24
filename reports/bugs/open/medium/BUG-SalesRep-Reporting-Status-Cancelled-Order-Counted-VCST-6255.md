# BUG: [Sales Rep Hub][Reporting] An order set to "Cancelled" through the admin Status dropdown is still counted in Sales, Orders and AOV, while the page says cancelled orders are excluded — Medium

## Status: SUBMITTED
**Found by:** agent — testing VCST-6255
**Tracker:** [VCST-6683](https://virtocommerce.atlassian.net/browse/VCST-6683) (Sub-task of VCST-6255; labels found-by-agent, found-in-testing)

**Severity:** Medium (P2), graded at triage · **Type:** Functional / data correctness · **Relationship:** Sub-task of VCST-6255 (IN-SCOPE, AC4)
**Env:** vcptcore (`{{FRONT_URL}}`, Admin Shell `{{BACK_URL}}/apps/admin-shell`), playwright-chrome / playwright-edge 1920x1080, 2026-11-03/04
**Build:** platform 3.1093.0 · VirtoCommerce.SalesRep 3.1017.0-pr-28-9f00 (vc-module-sales-rep PR #28) · theme 2.62.0-pr-2624-0539 · AdminShell 3.1003.0-pr-4-4aa6
**Oracle:** VCST-6255 AC4 ("orders in the Cancelled status are not counted in Sales, Orders or AOV anywhere on the page"); the page's own legend note and footnote ("Cancelled orders excluded" / "cancelled orders are excluded")

## Summary
The Reporting page (`/company/customer-sales`) excludes an order only when its `isCancelled` flag is set. An order whose status is changed to **Cancelled** with the Status dropdown in the Admin Shell order blade keeps `isCancelled = false`, so it stays in the rep's Sales, Orders and AOV figures, while both charts and the footnote tell the rep that cancelled orders are excluded. The "Cancelled filter-rule slice" safety net that the ticket's Data section describes is not in the shipped code.

## How the order gets into this state (real path, verified 2026-11-04)
1. Admin Shell → Orders → open an order (status New).
2. In the **Status** dropdown pick **Cancelled** (the dropdown offers the store's `Order.Status` dictionary: Processing, Completed, Payment required, Pending, New, Cancelled) and click **Save**. Do not use the "Cancel document" toolbar action.
3. `GET /api/order/customerOrders/{id}` → `status: "Cancelled"`, `isCancelled: false`, `cancelledDate: null`.
An integration (ERP) that writes only the status produces the same state. Only "Cancel document" sets both the status and the flag; the server never derives the flag from the status.

## Steps to reproduce
1. As a sales rep (@td(SR_REP_PRIMARY)), note Reporting → Customer = TechFlow → current month: Sales / Orders.
2. Take an order the rep created for TechFlow this month and set its status to Cancelled via the admin Status dropdown (above).
3. Reload Reporting with the same selection.

## Expected
The order leaves Sales, Orders and AOV in every tile, bar, tooltip and table row (AC4), consistent with the "Cancelled orders excluded" note.

## Actual
The figures do not change. Observed with fixture `@td(SR_MTD_ORDER_STATUS_CANCELLED)` (status Cancelled, isCancelled false, $555.50): TechFlow November shows **$1,557 / 2 orders** (AOV $778) instead of **$1,001 / 1** (AOV $1,001); All customers shows 4 / $1,957 instead of 3 / $1,402. Same for a pre-existing AcmeCorp October order ($80). A flag-cancelled order (`@td(SR_MTD_ORDER_FLAG_CANCELLED)`, $777.70) is correctly excluded.

![TechFlow Q4 — status-only Cancelled order counted](../../../tickets/Sprint26-22/VCST-6255/vcptcore/screenshots/4a-B16-techflow-q4-status-cancelled-counted.png)
![Admin Shell — status Cancelled saved without the cancel flag](../../../tickets/Sprint26-22/VCST-6255/vcptcore/screenshots/probe-admin-status-cancelled-no-flag.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront (plugin) | FAIL | checklist B16, C1 SR-RPT-004 (REG-2026-11-04-1130), 3x session |
| 2. Backend Admin | state reachable | Admin Shell Status dropdown → Cancelled + Save leaves isCancelled false |
| 3. GraphQL xAPI | as designed today | `salesRepCustomerOrderStatistics` excludes only `IsCancelled`/`IsPrototype` (BL-SR-005) |
| 4. Platform REST | n/a | — |

## Root Cause Analysis
- Statistics: `RepOrderScopeQueryExtensions.ApplyRepScope` filters `!IsPrototype && !IsCancelled`; `Status` is filtered only when a named filter rule is passed.
- Plugin: `SalesRepMonthlyOrderStatistics` sends no `filter`, and `useSalesRepReporting.test.ts` asserts that no variable mentions "cancel" — the ticket's safety-net subtraction of the `Cancelled` filter-rule slice was dropped.
- Order module: the Status dropdown and the "Cancel document" action are two separate paths; only the second sets `IsCancelled`.

## Fix options (product decision)
1. Plugin: subtract the `Cancelled` filter-rule slice per month, as the ticket's Data section describes.
2. Statistics: exclude `Status = Cancelled` as well as the flag.
3. Order module: picking Cancelled in the Status dropdown sets `IsCancelled` (or the dropdown hides Cancelled and routes to "Cancel document").
