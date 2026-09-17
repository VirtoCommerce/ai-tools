# Viewing Your Organization's Shared Loyalty Points

### Introduction
If your store runs a loyalty program for organizations, points earned by any member of your company go
into **one shared points balance** — not into your own personal account. Any member of your organization
can view that balance and spend from it.

### Prerequisites
- You are **signed in** to your account.
- Your account is a member of an organization, and your store's loyalty program is enabled.

### View your organization's points balance
1. Open **Account → Points history**.
2. At the top of the page you will see: **"Balance: {points}"** — for example, **"Balance: 133334"**.

   ![Points history page showing the organization's shared balance and its activity table](../tickets/Sprint26-18/VCST-5024/screenshots/vcst-5024-docs-verify-points-history-pooled-133334.png)
   *Every member of your organization who opens this page sees the same balance — it's your company's
   shared pool, not a personal total.*

!!! note "Is this my own balance?"
    No. This balance belongs to your whole organization. Any colleague who is a member of the same
    organization earns into it through their own purchases, and any member can spend from it — the number
    you see is not yours alone.

### Buy points-priced products
1. Open the **loyalty catalog** from the store menu (or go to `/loyalty-catalog`). Points-priced products
   are listed with their price in points (for example, **PTS 1**) and marked **In stock**.

   ![Loyalty catalog showing products priced in points](../tickets/Sprint26-18/VCST-5024/screenshots/vcst-5024-docs-verify-loyalty-catalog-PTS-under-USD-selector.png)
   *You do not need to change your store currency first — loyalty catalog products are always priced and
   sold in points.*

2. Use the product's **quantity stepper** (the **+** button) to add it to your cart — there is no
   separate "Add to cart" button on this page.
3. Open your **Cart**. A cart holding only points products lists them under **"Products in PTS"**, and
   **Place order** is disabled with the message: **"Add a regular product to check out."** This is
   expected — a cart cannot be settled entirely in points.
4. Add at least one regular, money-priced product to the same cart. The message clears.
5. Your order summary now shows two totals side by side — a money total and a separate **"Total in PTS"**
   block.

   ![Cart with a money total and a separate points total](../tickets/Sprint26-18/VCST-5024/screenshots/vcst-5024-docs-verify-mixed-cart-dual-totals.png)
   *Your points items are never mixed into your money total, or the other way round.*

6. Fill in your delivery and payment details as usual, then click **Place order**.

!!! note "Do I need to switch my store currency first?"
    No. Products in the loyalty catalog are always priced and sold in points, so you can add them to your
    cart no matter what currency your storefront is currently showing.

### Troubleshooting
- **A points history entry doesn't say who on my team made it** — that's expected today. Every earn and
  mission reward is listed, but the page does not yet show which colleague's order or activity produced
  each entry.
- **I don't see a loyalty catalog link** — the loyalty program must be enabled for your store and your
  organization. Contact your store administrator.

---
*Verified on localhost @ Platform `3.1071.0-pr-3108-016f`, `VirtoCommerce.Loyalty 3.1008.0-pr-17-973e` ·
VCST-5024 verdict: NOT REACHED — the 5b gate REJECTED on re-verification (its single fix round); the run
stopped and handed to a human · Not documented: placing the order itself — cart assembly and the
dual-total summary were verified in the storefront, but completing checkout and actually spending
organization points was verified only via the API in this run, not by placing a real order through the
storefront; which colleague caused a given points-history row (not exposed anywhere) ·
Evidence: `reports/tickets/Sprint26-18/VCST-5024/`*
