# Live API Probe — scoped `/graphql/sales-rep` on vcst-qa (pr-4) — restored 2026-07-28

Rep `agent-test-sr-primary@example.com` (`SR_REP_PRIMARY`), store `B2B-store`, store-bound token grant (storeId param). Cross-customer scope. Probed 2026-07-23.

## Contract invariants — CONFIRMED GREEN (ground-truth for generated cases)
| Behavior | Probe | Result |
|---|---|---|
| Order sort rules | `salesRepOrderSortRules` | `recent`, `total` |
| Customer sort rules | `salesRepCustomerSortRules` | `my-last-orders`, `ytd-purchases`, `name` |
| Top-seller sort rules | `salesRepTopSellerSortRules` | `by-units`, `by-revenue` |
| Order filter rules | `salesRepOrderFilterRules` | Cancelled, Completed, Custom, New, Payment required, Pending, Processing, ReadyForPickup |
| Cart filter rules | `salesRepCartFilterRules` | `active-carts` |
| Customer filter rules | `salesRepCustomerFilterRules` | `All` (single baseline) |
| Top-seller filter rules | `salesRepTopSellerFilterRules` | category **GUIDs** as `name`, category label as `localizedName` |
| Unsupported sort direction | `salesRepOrders(sort:"recent:asc")` | error `extensions.code=ARGUMENT`, data null |
| `by-units:asc` rejected | `salesRepTopSellers(sort:"by-units:asc")` | error `ARGUMENT` |
| `ytd-purchases:asc` / `total:asc` / `name:desc` | valid | 200, reordered (total:asc → 42→55→60 asc) |
| Unknown sort name | `salesRepOrders(sort:"NONSENSE")` | default order, `totalCount:8`, no error |
| Unknown filter fails closed | `salesRepOrders(filter:"BOGUS_XYZ")` | `totalCount:0` (baseline 8) |
| YoY null percent (prev=0) | `comparison(prev 2025)` | `totalChange.amount=816`, `totalChangePercent=null`, `countChange=9`, `countChangePercent=null` |
| take over max | `salesRepTopSellers(take:11/15)` | clamped, no error |
| Money shape | statistics | `{amount, formattedAmount}` e.g. `$816.00`; `currencyCode:USD` |
| EUR override | `currencyCode:"EUR"` | `currencyCode:"EUR"`, `€816.00` (rate ≈1.0 on vcst-qa) |
| `customerSalesReps(sort:"name:asc")` | plain member sort | **200, accepts** (exempt from named vocab, NOT rejected) |

## Seed reality (post-enrichment 2026-07-23; note: seeder code lost in reset)
- assignedCustomers=5, orderingCustomers=4, newCustomers=5.
- Order stats: MTD=YTD=lifetime (all orders dated the seed day) — temporal deltas NOT verifiable; YoY prev=0/null%.
- Active carts 2 (after enrichment; $90, lastCartDate set). Top sellers up to 10 distinct products (take:5 cap, take:15→10 clamp). USD + EUR.

## Correction flags for generated 050m cases
- `customerSalesReps` sort case: assert 200/accepts, NOT rejection.
- currency-override case: assert `currencyCode` echo + `formattedAmount` symbol, NOT a converted amount.
- take>10 case: assert rows ≤10 and no error (clamp).
