# [P1] Admin Dashboard Revenue widget shows $1.08 trillion USD — three corrupt test orders with $5.66T unit price pollute KPI (no sanity cap, no status filter)

**Status:** OPEN
**Severity:** P1 (High) — trust/reporting defect; escalate to P0 if any downstream billing/tax/compliance system consumes `/api/order/dashboardStatistics`
**Component:** `vc-module-order` — `CustomerOrderStatisticService` / Dashboard KPI widget
**Environment:** QA (https://vcst-qa.govirto.com), Platform 3.1022.0
**Investigation run:** REG-2026-04-20-1000
**Discovered during:** BUG_028_036 admin investigation (pre-existing, not caused by negative-qty bug)
**Reporter:** qa-backend-expert
**Date:** 2026-04-22

---

## Summary

The Admin Home/Dashboard "Revenue" widget reports **$1,080,009,436,748.15 USD** — roughly one-thousandth the size of the global GDP — for the default 12-month window. The value is driven almost entirely by **three corrupt test orders** in 2025 Q3, all containing the same SKU `151096` ("Strongbow British Dry Cider") priced at **$5,657,575,852,844 per unit**. The dashboard aggregation in `CustomerOrderStatisticService.CalculateRevenue` / `CalculateOrderAmount` sums raw `InPayment.Sum` values with no sanity cap and no filter on order status, so status=`New`, never-completed, manual-payment test orders flow straight into the "Revenue" headline and chart. Nineteen such outlier orders exist historically (back to 2023-01-10), including one at **$425 trillion USD**.

---

## Steps to Reproduce

1. Log in to Admin SPA at `https://vcst-qa.govirto.com` as `admin` / `Password1!`.
2. Dashboard loads by default on `#!/workspace`.
3. Observe the Revenue widget, Revenue/Quarter chart, AOV/Quarter chart, and Revenue-per-customer KPI.

---

## Actual Result

| KPI | Value displayed |
|-----|----------------|
| **Total Revenue (USD)** | **$1,080,009,436,748.15** |
| Total Revenue (EUR) | 101,754.26 |
| Total Revenue (GBP) | 371.98 |
| Customers | 661 |
| Orders | 3,822 |
| Avg Order Value (USD) | $289,625,107.26 |
| Revenue per Customer (USD) | $2,769,254,966.02 |

Revenue by Quarter (USD):
| Quarter | USD |
|---------|-----|
| 2025 Q2 | $1,751,211.08 |
| **2025 Q3** | **$1,080,002,537,796.84** |
| 2025 Q4 | $4,513,282.68 |
| 2026 Q1 | $381,370.78 |
| 2026 Q2 | $253,086.77 |

Chart renders one spike on 2025 Q3 that dwarfs every other quarter to near-zero.

## Expected Result

| KPI | Expected value (clean) |
|-----|-----------------------|
| Total Revenue (USD) | **~$10,906,441** (≈ $10.9M) |
| 2025 Q3 (USD) | **~$3,165,941** (≈ $3.17M) |
| Avg Order Value (USD) | under $5,000 (consistent with all other quarters 1,127–13,993) |
| Revenue per Customer (USD) | under $5,000 |

No per-order total should exceed a sensible ceiling (e.g., $1B) without an explicit business override.

---

## Root Cause Analysis

### 1. Three poisoned test orders dominate the aggregation

| # | Order | Date | Customer | Status | Total (USD) |
|---|-------|------|----------|--------|-------------|
| 1 | `CO250701-00011` | 2025-07-01 | Max Corp | New | 359,999,998,979.99 |
| 2 | `CO250724-00011` | 2025-07-24 | Anonymous | New | 359,999,998,979.99 |
| 3 | `CO250708-00008` | 2025-07-08 | Max Corp | New | 359,999,998,799.99 |

Sum of the three: **$1,079,999,996,759.97** — equals **99.9997 %** of the 2025 Q3 USD revenue.

Each order contains one line item (SKU `151096`, "Strongbow British Dry Cider") with:
- `price` = **5,657,575,852,844.00** (≈ 5.66 trillion USD per bottle)
- `discountTotal` = 5,357,575,852,844.01 (a discount swallows most of the price)
- `extendedPrice` = 299,999,999,999.99 (net after discount)
- `taxTotal` = 59,999,999,999.998 (20 % VAT on extendedPrice)
- `total` = 359,999,998,979.99

The line-item math is internally consistent (`price − discount = 300B; × 1.2 = 360B`). **The corruption lives at a single layer: the unit-price field stored on the cart-to-order transformation.** The raw number `5,657,575,852,844` has the shape of a misplaced decimal or a JS timestamp pasted into a price field; the likeliest mechanism is a manual admin edit / data-seeding script that injected a very large numeric literal into the `CartLineItem.Price` column.

All three orders use `gatewayCode = "DefaultManualPaymentMethod"`, payment status `New`, `isCancelled = false`, which are the exact fields the KPI aggregation accepts.

### 2. Aggregation has no sanity cap, no status filter, no ledger verification

Source: [`vc-module-order/src/VirtoCommerce.OrdersModule.Data/Services/CustomerOrderStatisticService.cs`](https://github.com/VirtoCommerce/vc-module-order/blob/dev/src/VirtoCommerce.OrdersModule.Data/Services/CustomerOrderStatisticService.cs)

- `CalculateRevenue` → `repository.InPayments.Where(!IsCancelled).GroupBy(Currency).Sum(Sum)` — the only filter is `!IsCancelled`.
- `CalculateOrderAmount` (per-quarter) — same pattern.
- `CalculateAvgOrderValue` — `CustomerOrders.GroupBy(Currency).Average(Total)` — no filter at all, not even `IsCancelled`.
- No check for payment status (`New` vs `Paid` / `Captured`).
- No sanity ceiling on a single row before summing.
- No currency conversion (acceptable here because of the per-currency grouping, but the UI concatenation makes it easy to misread).

### 3. The problem is systemic and historic

Pagination of `/api/order/customerOrders/search` sorted by `total:desc` reveals **19 orders with total > $1,000,000,000 USD** stretching back to 2023-01-10. The largest is `CO230831-00005 = $425,025,404,826,396 USD` (≈ $425 trillion). A cluster of **eight 2023 orders all at exactly $622,333,3… USD** suggests a recurring seed-script bug, not one-off human error. The current dashboard window simply happens to capture the 2025 Q3 subset — the pathology pre-dates it and will recur every time a similarly priced order lands inside the visible window.

### 4. Secondary / internal consistency concern

`subTotal` and `subTotalWithTax` on each poisoned order are **$5.66 T and $6.79 T** respectively — *higher* than the order's own `total` ($360 B). That is because the order stores subTotal BEFORE `discountTotal` is applied, while `total` reflects the post-discount math. This is not a bug per se, but it means if any downstream report pulls `subTotal` directly (e.g., unapplied-discount reconciliation), the numbers would be **even more absurd** than the already-broken dashboard. Worth auditing other consumers of these fields.

---

## Severity Justification

**P1 — High** because:
- Dashboard is the first screen every admin / store manager sees on login — the top-line KPI is visibly broken and erodes trust immediately.
- The figure is cached in `ngStorage-ordersDashboardStatistics` and reused between sessions, so even after cleanup the stale number would linger until refresh.
- No evidence that `/api/order/dashboardStatistics` feeds any billing/tax/compliance/export pipeline (verified only REST, no other consumers observed). If such consumers do exist (ERP/accounting integration), **escalate to P0** immediately because a trillion-dollar figure entering accounting is a serious compliance hazard.
- Not blocking any transactional flow; storefront unaffected.

Not P2/P3: the displayed value is off by **six orders of magnitude** (10^12 vs 10^7). Any user comparing dashboard-to-reality will lose confidence.

---

## Recommended Fix Path

Two complementary fixes (both cheap):

1. **Sanity cap at aggregation layer** (smallest change, highest value):
   In `CalculateRevenue` / `CalculateOrderAmount` / `CalculateAvgOrderValue`, add a configurable cutoff (e.g., `IOptions<DashboardThresholds>.MaxOrderTotal = 1_000_000_000M`) and `Where(x => x.Total <= threshold)` / `Where(p => p.Sum <= threshold)`. Log a warning listing any excluded order IDs so data integrity issues stay visible to operators.

2. **Status filter** (correctness): only include orders with `Status ∈ {Paid, Completed, Captured, Shipped, Delivered}` and payments with `PaymentStatus ∈ {Paid, Captured}`. Status `New` and never-processed `DefaultManualPaymentMethod` payments should not count as revenue. This aligns the KPI with accounting intuition (you haven't earned revenue until the customer actually paid).

3. **(Bonus, optional)** Add a "data health" warning chip on the dashboard widget when any single contributing order exceeds 10 % of the total — surface bad data instead of silently absorbing it.

4. **Data cleanup (manual, pre-fix)**: cancel / delete the 19 historical outlier orders (IDs listed in evidence JSON) OR flag them with `isCancelled=true`. This is a one-shot workaround that de-noises the dashboard without code changes — but does nothing to prevent recurrence.

---

## Sibling Defects (noted, not filed separately)

- **Revenue per customer KPI shows $2.77B per customer** — same root cause; will fix automatically when the Revenue sum is bounded.
- **Avg Order Value 2025 Q3 = $1.47B** — same root cause; a single-currency mean of 736 orders where 3 are at $360B.
- **Chart axis auto-scales to 1.2 trillion** — makes every other quarter look like zero; would self-resolve after fix.
- **`subTotal`/`subTotalWithTax` on each poisoned order** exceed `total` by ~20× (because `subTotal` is pre-discount). If any other report consumes `subTotal`, numbers will be ~18× worse. Recommend a follow-up audit of `subTotal` consumers (xAPI/GraphQL, export/import, accounting connectors).
- **No UI warning** that a dashboard number exceeds the theoretical global payment volume — consider a simple "implausible value" client-side sanity check.

---

## Evidence

- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-dashboard-01-full-dashboard.png` — full dashboard screenshot (Revenue $1.08T visible, Q3 spike chart).
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-dashboard-02-kpi-raw.json` — full KPI payload + 3 outlier orders with line items + 19 historical outliers + source-code references.
- Source: [`CustomerOrderStatisticService.cs`](https://github.com/VirtoCommerce/vc-module-order/blob/dev/src/VirtoCommerce.OrdersModule.Data/Services/CustomerOrderStatisticService.cs)

---

## Suggested JIRA Title

**[P1] Dashboard Revenue KPI sums raw order totals without sanity cap — 3 corrupt test orders with $5.66T/unit price inflate total to $1.08 trillion USD**

## Suggested JIRA Labels

`bug`, `admin-ui`, `dashboard`, `vc-module-order`, `data-integrity`, `pre-existing`, `regression-shield`
