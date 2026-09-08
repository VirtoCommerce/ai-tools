# Sales-rep hub "My customers" widget has no month-over-month indicator — High

## Status: CONFIRMED

**Not filed to any tracker** — draft only, awaiting a human decision.

**Env:** vcst-qa @ Platform 3.1064.0, Theme 2.57.0-alpha.2490, SalesRep 3.1008.0-pr-19-5e0f,
XOrder 3.1011.0, Xapi 3.1020.0

**Found by:** suite `093` case `SR-HD-007`, live-verified 2026-09-08 on `playwright-chrome`, signed in as
`SR_REP_PRIMARY` (Priya Rao, context org AcmeCorp, 5 served customers).
**Case:** SR-HD-007
**Archetype:** `OMISSION`

## Summary
`BL-SR-007` requires a month-over-month indicator on the sales-rep hub's customer counters. The **"My
customers"** tile renders its counts with no such indicator at all — no arrow, no percentage, no delta —
while a **sibling tile in the same widget row, loaded in the same page load**, does render one. This is a
storefront query omission, not a missing backend capability: the field the widget would need is already
in the schema, already selected by the sibling query, and already rendered on screen three tiles away.

## Root Cause
The storefront's `SalesRepCustomerCounts` GraphQL document selects exactly four fields and never asks for
a comparison the backend already exposes. Captured on the wire, POST `/graphql` request #137, HTTP 200:

```graphql
query SalesRepCustomerCounts($organizationId: String, $storeId: String, $mtdFrom: DateTime, $mtdTo: DateTime) {
  salesRepCustomerCounts(organizationId: $organizationId, storeId: $storeId) {
    assignedCustomers
    thisMonth: period(from: $mtdFrom, to: $mtdTo) {
      orderingCustomers
      newCustomers
      __typename
    }
    __typename
  }
}
```
Variables: `{"storeId":"B2B-store","mtdFrom":"2026-08-31T22:00:00.000Z","mtdTo":"2026-09-08T21:59:59.999Z"}`

Three facts, together, rule out a timing/data explanation:

1. **No `comparison{...}` block, and no previous-period variables are even declared** in the operation —
   there is no `prevFrom`/`prevTo`. A comparison could not be requested without changing the document.
2. **A sibling query in the same page load selects it and renders it.** `SalesRepCustomerOrderStatistics`
   (request #135) carries three aliased comparison blocks — `mtdVsPrevMonth`, `weekVsPrevWeek`,
   `ytdVsLastYear`, e.g. `mtdVsPrevMonth: comparison(current: {from: $mtdFrom, to: $mtdTo}, previous:
   {from: $prevFrom, to: $prevTo}) @include(if: $withMonthOverMonth) { countChangePercent }` — and the
   **"Orders placed · MTD"** tile renders **`-75% vs last month`**, three tiles to the left of "My
   customers", in the same widget row, same dashboard, same session.
3. **The backend already supports it.** `vc-module-sales-rep@dev` →
   `src/VirtoCommerce.SalesRep.ExperienceApi/Schemas/SalesRepCustomerCountsComparisonType.cs` registers
   `orderingCustomersChange`, `orderingCustomersChangePercent`, `newCustomersChange`,
   `newCustomersChangePercent`, alongside a `SalesRepCustomerCountsComparison` model and a
   `SalesRepCustomerCountsGraphQlTests.cs` component test.

## Expected vs Actual
**Expected:** "My customers" carries the same MoM affordance as its sibling tiles — an arrow/percentage/±N
delta against last month.
**Actual:** `My customers` / **5** / `2 ordered this month` / `0 new customers` — no arrow, no
percentage, no delta of any kind.

## Evidence
`reports/regression/REG-2026-09-07-1342/screenshots/SR-HD-007-my-customers-no-mom.png` — full counters
row; the `-75% vs last month` on the MTD tile and its absence on "My customers" are visible side by side
in one shot.
`reports/regression/REG-2026-09-07-1342/screenshots/SR-HD-007-FAIL-my-customers-no-mom-assigned5.png`

## Notes
SR-HD-007's *other* half — a served-org count that had drifted — was repaired separately and now passes
as a derived relation (5/5/5), so this MoM assertion is the sole remaining reason that case is red.

## Fix Routing
- **Owning layer:** Layer 1 — Storefront
- **Repo:** `VirtoCommerce/vc-frontend` · **repoKind:** `frontend`
- **Component:** sales-rep hub dashboard, `SalesRepCustomerCounts` GraphQL document
- **Routing confidence:** HIGH — select the `comparison{}` block the backend already exposes on
  `salesRepCustomerCounts` and render it, mirroring the sibling `SalesRepCustomerOrderStatistics` query
  already in the same view.

