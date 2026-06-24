# View Multi-Currency Order Totals (Mixed Loyalty Orders)

When a customer places a **mixed cart** order — one that combines regular USD products and loyalty-catalog
products priced in PTS — the platform records a single order with two currency legs. This guide explains
where to find the per-currency breakdown in the Orders module.

## Overview

A mixed-cart order has one primary (USD) total and one secondary (PTS) total. The Orders list and the
order's top-level totals accordion show only the primary USD total. The full per-currency split is
surfaced in the **Line items** accordion, which opens a sub-blade with two totals bars and a **Currency**
column in the line-items table.

!!! note
    This behaviour is delivered by vc-module-order PR #497, vc-module-x-order PR #43,
    vc-module-loyalty PR #10, and vc-frontend PR #2335 — all deployed to vcst-qa on theme 2.52.0-pr-2335.

## View an Order's Per-Currency Totals

To review the USD and PTS breakdown for a mixed-cart order:

1. Click **Orders** in the left sidebar of the Admin SPA (`{{BACK_URL}}`).

2. In the **Customer orders** blade, locate the order. The **Total** and **Currency** columns in the list
   reflect the primary (USD) total only — the PTS leg is not shown in the list view.

   ![Admin orders list showing USD-only total column](screenshots/vcst-5104/08a-admin-orders-list.png)
   *The order list displays "420.00 / USD" for a mixed-cart order; the PTS portion is not shown here.*

3. Click the order row to open the order detail blade — for example, **"AGENT-TEST VIP User's order"**,
   status **Processing**.

4. In the order detail blade, expand the **Totals** accordion. The fields shown here reflect the primary
   currency (USD) only:

   | Field | Example value |
   |-------|--------------|
   | Subtotal | 200.00 |
   | Shipping | 150.00 |
   | Tax | 70.00 |
   | **Total** | **420.00 USD** |

   ![Admin order detail overview with USD-only totals accordion](screenshots/vcst-5104/08b-admin-order-detail-overview.png)
   *The top-level totals accordion shows the primary USD amounts. To see PTS, continue to the next step.*

!!! note
    The top-level totals accordion always reflects the primary store currency. PTS totals appear only in
    the Line items sub-blade (step 5 below).

5. Click the **Line items** accordion (badge shows the number of line items, e.g. **2**). A sub-blade opens.

   At the top of the sub-blade, two totals bars are displayed side by side:

   | Bar | Subtotal | Discount | Tax | Total |
   |-----|----------|----------|-----|-------|
   | **USD** | 200.00 | 0.00 | 40.00 | 240.00 |
   | **PTS** | 10.00 | 0.00 | 0.00 | 10.00 |

   Below the bars, the line items table includes a **Currency** column:

   | Product | Quantity | Currency | Extended price |
   |---------|----------|----------|----------------|
   | Animal Crossing New Horizons… | 1 | USD | 200.00 |
   | MOA Star Logo Brass Enamel Shot… | 1 | PTS | 10.00 |

   ![Admin Line items sub-blade showing USD and PTS totals bars plus Currency column](screenshots/vcst-5104/08-admin-order-line-items-split-currency.png)
   *The Line items sub-blade surfaces the per-currency split: two totals bars (USD and PTS) and a Currency
   column per line item.*

!!! tip
    When a customer reports a mixed-cart discrepancy, compare the two totals bars in the Line items
    sub-blade. The USD bar covers card-charged items; the PTS bar covers loyalty-redeemed items. If the
    PTS bar shows 0.00 but the customer reports redeeming points, check the order's payment records and
    the loyalty module's transaction log.

## Understanding the Points Redemption and Earning

Loyalty points are applied server-side at order creation — not at cart evaluation or payment. For a
mixed-cart order, the loyalty engine performs two operations simultaneously:

- **Redeems** points equal to the PTS total (deducted from the customer's balance).
- **Credits earned** points on the USD sub-total according to the active loyalty program rules.

Both operations are recorded against the same order number in the loyalty transaction history, visible
to the customer under **Account → Loyalty Points**.

!!! note
    If a customer contacts support about an incorrect points balance, confirm the order number and look up
    both the Redeemed and Earned rows in the loyalty history. A mixed-cart order always produces exactly
    two loyalty transactions for the same order number.

---

*****

<div style="display: flex; justify-content: space-between;">
<a href="orders-management.md">← Manage Orders</a>
<a href="loyalty-module-admin.md">Loyalty Module Administration →</a>
</div>

---

**Sources:** Live Admin SPA (`{{BACK_URL}}`) — vcst-qa, theme 2.52.0-pr-2335, 2026-06-24;
VirtoOZ `PlatformUserGuide` — Orders module documentation;
vc-module-order PR #497; vc-module-x-order PR #43; vc-module-loyalty PR #10; vc-frontend PR #2335.
