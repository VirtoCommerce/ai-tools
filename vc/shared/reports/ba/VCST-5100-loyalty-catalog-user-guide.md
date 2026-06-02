# Loyalty Catalog — User Guide

**Feature:** Loyalty Catalog browsing (VCST-5100)
**Applies to:** Store administrators (Admin SPA) and storefront customers

---

## Overview

The Loyalty Catalog is a dedicated section of the storefront where products are priced in loyalty points (PTS) rather than your store's standard currency. Customers with points can browse a separate product grid at `/loyalty-catalog`, see prices displayed in PTS on every product card and product page, and navigate the catalog using the same category structure as the standard store. The catalog is fully isolated — browsing it does not affect prices or links in the standard store at `/catalog`. Loyalty catalog browsing is available in two store modes: **Mixed Cart** (standard and loyalty catalogs coexist) and **Loyalty Store** (loyalty-focused store).

> **Current scope:** Browsing and viewing prices in PTS is the feature delivered in this release. Adding products to the cart and checking out in points, and searching for products from within the loyalty catalog, are separate follow-up stories and are not yet available.

---

## Part A — Administrator Guide: Set Up Loyalty Catalog Browsing

### Prerequisites

You need Admin SPA access with permissions to edit Stores, Pricing, and Loyalty modules.

### Step 1 — Enable loyalty and set the mode

1. In the left navigation, click **Stores**.
2. Select the store you want to configure (e.g. **B2B-store**).
3. In the store detail blade, scroll to find the **Loyalty settings** widget and click it.
   *See: `tests/Sprint-current/VCST-5100/screenshots/LOY-019-loyalty-settings.png`*
4. Set **Enable Loyalty** to **On** (blue toggle).
5. In the **Loyalty Mode** dropdown, choose **Mixed Cart** or **Loyalty Store** (see the mode reference table below).
   *See: `tests/Sprint-current/VCST-5100/screenshots/LOY-020-mode-options.png`*
6. In the **Loyalty Currency** field, type your points currency code (e.g. `PTS`). This field must not be empty.
7. Click **Save** at the top of the blade.

#### Loyalty Mode reference

| Mode | `/loyalty-catalog` accessible | Standard `/catalog` accessible | Typical use case |
|------|-------------------------------|--------------------------------|-----------------|
| **Mixed Cart** | Yes | Yes | Run both a standard USD catalog and a loyalty catalog side by side |
| **Loyalty Store** | Yes | Yes (route still works) | Loyalty-focused store where points catalog is the primary offering |
| **Coupon Redemption** | No (404) | Yes | Points are redeemed as coupon codes at checkout; no browse catalog |
| **Payment Method** | No (404) | Yes | Points used as a payment method at checkout; no browse catalog |

#### When does the loyalty catalog route become accessible?

| Condition | Result |
|-----------|--------|
| Enable Loyalty = Off (any mode) | 404 — catalog not accessible |
| Enable Loyalty = On, Mode = Coupon Redemption | 404 |
| Enable Loyalty = On, Mode = Payment Method | 404 |
| Enable Loyalty = On, Mode = Mixed Cart or Loyalty Store, Currency = empty | 404 |
| Enable Loyalty = On, Mode = Mixed Cart or Loyalty Store, Currency set (e.g. PTS) | Catalog accessible to all visitors |

The catalog is not login-gated. Guests and signed-in customers see the same behavior.

---

### Step 2 — Create a PTS price list and price your products

Products only appear in the loyalty catalog if they carry a price in your loyalty currency (PTS). Products without a PTS price are not shown.

1. In the left navigation, click **Pricing**.
2. Click **Add** to create a new price list. Give it a descriptive name (e.g. **Loyalty PTS price list**) and set the currency to **PTS**.
3. Add price entries for each product you want to appear in the loyalty catalog, entering the PTS amount.
4. Assign the price list to your store and catalog (virtual catalog root for your store).
5. Save.

> **Note:** Only products with a PTS price greater than 0 are displayed in the loyalty catalog grid. Products priced at 0 PTS are filtered out.

---

### Step 3 — Create loyalty programs (conditions and rewards)

Loyalty programs define when customers earn points, not what they can buy with them. Browsing the catalog does not earn points; points accrue when an order meets the program's conditions.

1. In the left navigation, click **More**, then click **Loyalty**.
2. The **Loyalty programs** blade opens.
3. Click **Add** to create a new program.
4. Fill in the required fields:
   - **Name** — required; the Save button is disabled until a name is entered.
   - **Store** — select the store this program applies to.
   - **Active** — toggle on to make the program live.
   - **Priority** — lower numbers run first when multiple programs apply.
   - **Start date / End date** — optional date range for the program to be active.
5. Under **If any of the following criteria**, click **Add condition** to add earning rules. Available conditions:
   - **Order status is** — award points when the order reaches a specific status (New, Pending, Payment required, ReadyForPickup, Completed, Cancelled, Custom).
   - **Order total** — award points when the order value meets a threshold.
   - **Is first order** — award points on the customer's first purchase.
   - **Is recurring order** — award points on repeat purchases.
   - **Is registration** — award points when a customer registers.
   You can add multiple conditions; any matching condition triggers the reward.
6. Under **Get the following loyalty rewards**, configure what customers receive:
   - **fixed points** — a flat points amount per qualifying order.
   - **% of order value as points** — a percentage of the order total converted to points.
7. Click **Save**.
   *See: `tests/Sprint-current/VCST-5100/screenshots/loy011-rewards.png`*

---

### Troubleshooting (admin)

**Loyalty catalog shows a 404 page**
- Check that **Enable Loyalty** is toggled on for the store.
- Check that **Loyalty Mode** is set to **Mixed Cart** or **Loyalty Store** (not Coupon Redemption or Payment Method).
- Check that **Loyalty Currency** is not empty. Save again if you just corrected this.

**A product is missing from the loyalty catalog**
- The product has no PTS price, or its PTS price is 0. Open Pricing, find the Loyalty PTS price list, and add or correct the price entry for that product.
- The PTS price list may not be assigned to the correct store or catalog. Verify the price list assignment.

**Loyalty programs blade is not visible in the More menu**
- The Loyalty module (VirtoCommerce.Loyalty) may not be installed on this platform instance, or your account may not have the required permissions. Contact your platform administrator.

**A program is not awarding points**
- Check that the program's **Active** toggle is on.
- Check the **Start date** and **End date** — if today is outside the range, the program is inactive.
- Verify the condition matches the order status that the order actually reaches.

---

## Part B — Shopper Guide: Browse the Loyalty Catalog

### How to reach the loyalty catalog

The loyalty catalog is at `/loyalty-catalog` on your store. Your store administrator may have added a direct link in the navigation menu or in a banner. You can also bookmark the page directly.

If you visit `/loyalty-catalog` and see a 404 page, the loyalty catalog has not been enabled for your store, or it is configured in a mode that does not support catalog browsing (see the FAQ below).

### What you see in the loyalty catalog

When the loyalty catalog is open, you see a standard product grid with categories on the left.

- Every product card shows its price in **PTS** (your store's loyalty points currency), not in dollars.
- Category links in the sidebar navigate within the loyalty catalog (e.g. `/loyalty-catalog/accessories`), keeping you in the points-priced view throughout.
- Clicking a product card takes you to the product detail page, which also shows the price in PTS.
   *See: `tests/Sprint-current/VCST-5100/screenshots/RETEST-loyalty-grid-PTS-d7bf.png`*
   *See: `tests/Sprint-current/VCST-5100/screenshots/RETEST-PDP-PTS-d7bf.png`*

You do not need to be logged in to browse the loyalty catalog. Both guests and signed-in customers can view it.

### Returning to the standard catalog

Click **All products** or any standard navigation link to return to `/catalog`. The standard store shows prices in your regular currency (e.g. USD) with no points prices. The two views are completely separate — browsing the loyalty catalog has no effect on your standard cart or pricing.

Using your browser's back button from the loyalty catalog also returns you cleanly to the previous page, with no leftover PTS prices in the standard catalog.

### Current limitations — what is not yet available

The following are **not yet supported** in this release and will be added in future updates:

- **Adding items to cart in PTS.** If you use the add-to-cart control on a loyalty catalog product, the item is added to your cart in the standard currency (USD), not in PTS. Cart and checkout in loyalty points is a separate feature in development.
- **Searching for products from within the loyalty catalog.** Using the header search bar while on `/loyalty-catalog` returns standard search results in USD, not loyalty catalog results. Loyalty-scoped search is a separate feature.

Browsing, viewing PTS prices, and navigating by category are fully supported today.

---

## FAQ

**Why do I see a 404 when I go to `/loyalty-catalog`?**
The loyalty catalog is only accessible when your store has Enable Loyalty turned on and the mode set to Mixed Cart or Loyalty Store. If the mode is Coupon Redemption or Payment Method, or if the loyalty currency field is empty, the route is blocked for all users. Contact your store administrator if you believe the catalog should be accessible.

**Why is my cart showing dollar prices after I add a loyalty product?**
Adding a product to the cart currently uses the standard currency (USD). Checkout in loyalty points is not yet available in this release. This is a known limitation and will be addressed in a future update.

**Do I earn points just by browsing the loyalty catalog?**
No. Browsing, viewing products, and navigating categories do not award points. Points are earned when you place a qualifying order that meets a loyalty program's conditions (such as reaching a certain order total or completing a purchase).

**What is the difference between Mixed Cart mode and Loyalty Store mode?**
Both modes make the `/loyalty-catalog` route accessible. In **Mixed Cart**, your standard catalog at `/catalog` remains fully available alongside the loyalty catalog — you can shop in either. In **Loyalty Store**, the store is oriented around the loyalty experience; the standard catalog route still works but the store is designed to direct customers toward the loyalty catalog.

**Where can I see my points balance and history?**
Go to your account and look for **Points history**. This shows points earned and redeemed per order and your running balance. You must be signed in to view this page.

**Why is a product showing in the standard catalog but not the loyalty catalog?**
Products appear in the loyalty catalog only if a store administrator has assigned them a price in the loyalty points currency (PTS). If a product has no PTS price, it is not shown in the loyalty catalog even if it appears in the standard catalog at a USD price.

**Can guests browse the loyalty catalog?**
Yes. The loyalty catalog is not login-gated. Any visitor can browse it as long as the store has loyalty catalog browsing enabled.

**A category I expected to see is missing from the loyalty catalog sidebar.**
The loyalty catalog sidebar shows only categories that contain at least one product with a PTS price. Empty categories are not listed.

---

## Related

- JIRA ticket: [VCST-5100](https://virtocommerce.atlassian.net/browse/VCST-5100)
- Feature build: Loyalty module `3.1002.0-pr-9` · Storefront theme `2.50.0-pr-2296`
- QA execution: `tests/Sprint-current/VCST-5100/backend-execution-report.md`, `tests/Sprint-current/VCST-5100/frontend-execution-report.md`
