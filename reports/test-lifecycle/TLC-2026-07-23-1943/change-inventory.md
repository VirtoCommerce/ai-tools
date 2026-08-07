# Change Inventory & Authoritative Contract — TLC-2026-07-23-1943 (restored 2026-07-28)

**Feature:** Sales Rep — Hub Dashboard + Customer Sales-Data statistics (epic VCST-5142)
**Env deployed (vcst-qa):** Platform `3.1046.0` · theme `vc-theme-b2b-vue-2.54.0-pr-2395` (PR #2395) · module `VirtoCommerce.SalesRep_3.1000.0-pr-4` (PR #4)
**Storefront:** https://vcst-qa-storefront.govirto.com/ · **Admin:** https://vcst-qa.govirto.com/

## Tickets
- VCST-5309 [BE] View customer sales data → `salesRepCustomerOrderStatistics` + inline `salesRepCustomers.orderStatistics`
- VCST-5362 [BE] Hub Dashboard → `salesRepCustomerCartStatistics`, `salesRepCustomerCounts`, filter rules
- VCST-5368 Customer profile — Top products → `salesRepTopSellers` + top-seller sort/filter rules
- VCST-5485 [FE] Hub Dashboard → dashboard widgets

## BREAKING (drives sync)
- **`salesRepOrderStatuses` query REMOVED** → replaced by the **filter-rule** vocabulary (`salesRepOrderFilterRules` → named rules `New`, composite `inactive`).
- `salesRepOrders` gains `sort` (rule; default `recent`; `total`, `total:asc`) + `filter` + `period{from,to}`.
- `salesRepCustomers` gains `sort` (`my-last-orders` default / `ytd-purchases` / `name`, each `:asc/:desc`) + `filter` + inline aliased `orderStatistics(from,to){total{amount formattedAmount} count}` (no N+1) + `accountId`, `accountType`, structured `address{line1 city regionName postalCode countryCode}`, `lastOrder{number createdDate status statusDisplayValue total{amount formattedAmount currency{code}} itemsCount itemsQuantity}`.

## NEW GraphQL surface (all on `POST /graphql/sales-rep`; authenticated + creator/membership scoped)
- **`salesRepCustomerOrderStatistics(organizationId?, currencyCode?, cultureName?)`** — aliased `period(from,to,filter?)` → `total{amount formattedAmount}`, `count`, `average{amount formattedAmount}`, `lastOrderDate`, `firstOrderDate`; no-bound period → all-time; `comparison(current,previous)` → `totalChange{amount formattedAmount}`, `totalChangePercent`, `countChange`, `countChangePercent`, `averageChange{amount}`, `averageChangePercent`. Omit orgId → cross-customer. Inclusive UTC bounds, no truncation, per-request coalescing. `%` null when previous=0. Cancelled/prototype excluded from baseline.
- **`salesRepCustomerCartStatistics(currencyCode?, cultureName?)`** — same period/comparison shape; `filter` = cart kind, default `active-carts` (non-empty non-wishlist); fields `count` (primary), `total{amount formattedAmount}`, `lastCartDate`.
- **`salesRepCustomerCounts`** — `assignedCustomers`, `period(from,to,filter?){orderingCustomers newCustomers}`, `comparison{orderingCustomersChange orderingCustomersChangePercent newCustomersChange}`.
- **`salesRepTopSellers(storeId, organizationId?, sort?, period?, take?, cultureName?, filter?)`** — `sort` `by-units`(default)/`by-revenue`; `take` default 5, max 10 (clamped); category `filter`; row `rank/productId/name/sku/imageUrl/units/revenue{amount formattedAmount currency{code}}` from line-item snapshot.
- **Filter-rule discovery** `salesRepOrderFilterRules`/`salesRepCartFilterRules`/`salesRepCustomerFilterRules`/`salesRepTopSellerFilterRules` `(storeId,cultureName){name localizedName}`; omit→baseline; unknown name→fail CLOSED.
- **Sort-rule discovery** `salesRepOrderSortRules`/`salesRepCustomerSortRules`/`salesRepTopSellerSortRules`; unknown name→default; unsupported direction→ERROR `ARGUMENT`; `customerSalesReps` accepts plain `sort` but exempt from named vocab.

## Data-isolation invariant (ALL queries)
Every figure counts only the carts/orders the calling rep CREATED, within the orgs they SERVE. Assert on every case (negative: another rep / unserved org → no data). Anonymous → auth error.

## BL-SR mapping to tag new cases (already promoted in business-logic.md Domain 20)
BL-SR-001 period(UTC/all-time/coalesce) · BL-SR-002 creator+membership scope (P0) · BL-SR-003 comparison null-% · BL-SR-004 currency echo/convert · BL-SR-005 cancelled/prototype excluded · BL-SR-006 cart active-carts/count · BL-SR-007 counts assigned≥period · BL-SR-008 top sellers sort/take-clamp/snapshot · BL-SR-009 filter fail-closed · BL-SR-010 sort default/direction-error/customerSalesReps-exempt.

## Existing 050m baseline (before regeneration)
54–56 cases covering `customerSalesReps`, `salesRepCustomers`, `salesRepCustomer`, `salesRepOrders`, `salesRepOrderStatuses` (removed). Gap = all statistics/counts/top-sellers/filter+sort rules + salesRepCustomers inline orderStatistics + salesRepOrders sort/filter/period.
