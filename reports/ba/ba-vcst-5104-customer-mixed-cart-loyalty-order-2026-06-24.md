# Place an Order with a Mixed Cart (Products + Loyalty Points)

### Introduction

A mixed cart lets you buy regular products and loyalty-catalog products in the same checkout. Your card
pays for the regular items in USD; your loyalty points cover the PTS items — both happen in one click.

![Loyalty catalog showing products priced in PTS](screenshots/vcst-5104/02-loyalty-catalog-pts-products.png)
*The Loyalty catalog lists products with PTS prices instead of dollar amounts.*

### Prerequisites

- You are signed in to your account.
- Your account has a loyalty points balance sufficient to cover the PTS items you want to buy.
- You have a valid payment card saved or ready to enter for the USD portion.

---

### Step 1 — Add a loyalty item to your cart

1. Click **Catalog** in the top navigation and select **Loyalty** from the category list.
2. Find the product you want, for example "MOA Star Logo Brass Enamel Shot w/Blue Bottom" priced at
   **10 PTS**.
3. Click **Add to cart**.

### Step 2 — Add a regular product to your cart

4. Browse to any regular category and add a standard product, for example "Animal Crossing New Horizons"
   priced at **$200.00**.
5. Click **Add to cart**.

### Step 3 — Review your mixed cart

6. Open your cart (`{{FRONT_URL}}/cart`). The cart is now in **mixed cart** mode with two separate sections:

   - **Products in PTS** — loyalty items, totalled in points.
   - The standard USD section — regular items, totalled in dollars.

   The order summary on the right shows two blocks:

   - **Total in PTS**: Subtotal / Shipping / Tax / **Total (in PTS)**
   - **Total** (USD): Subtotal / Shipping / Tax / **Total (in USD)**

   ![Mixed cart showing two line-item groups and two total blocks](screenshots/vcst-5104/03-mixed-cart-split-display.png)
   *Your cart shows a "Products in PTS" section alongside the regular USD section, each with its own total.*

!!! note "Why is my cart split into two sections?"
    When your cart contains both regular and loyalty products, the storefront groups them by currency.
    The PTS items form a separate section because they are paid from your loyalty balance, not your card.

!!! note "Which total does my card pay?"
    Your card is charged only for the **Total** (USD) block — the dollar amount shown in the bottom
    totals bar. The **Total in PTS** block is deducted from your loyalty balance at the moment you
    place the order.

### Step 4 — Select delivery and payment

7. Under **Delivery method**, select a shipping option, for example **"Fixed Rate (Ground) $150.00"**.
8. Under **Payment method**, select **"Bank card (CyberSource)"**. The card form appears inline on
   the cart page.
9. Enter your card number, expiry date, CVV, and cardholder name.

   ![Cart with delivery and payment filled, Place Order button enabled](screenshots/vcst-5104/04-cart-ready-to-order.png)
   *Once delivery and payment are filled, the **Place order** button becomes active.*

!!! note "How many points will I spend?"
    The **Total in PTS** block in the order summary shows the exact points amount that will be
    deducted when you place the order. In our example, that is **10 PTS**.

### Step 5 — Place the order

10. Click **Place order**.
11. On success you will see: **"Order CO260624-00019 has been successfully submitted."**

    *(In your session the order number will differ — the message above is our example.)*

    ![Order confirmation message](screenshots/vcst-5104/05-order-confirmation.png)
    *The confirmation page shows your order number and two buttons: "View order" and "Continue shopping".*

12. Click **View order** to see the full order detail with both the USD and PTS totals side by side.

    ![Order detail showing per-currency total blocks](screenshots/vcst-5104/06-order-detail-split-currency.png)
    *Your order detail repeats the split: a "Total in PTS" block alongside the standard USD "Total" block.*

!!! note "Will I still earn points on the cash part of a mixed cart?"
    Yes. After placement, the loyalty engine credits earned points on the USD purchase and deducts
    points for the PTS items — both in the same transaction. You can see both rows in **Account →
    Loyalty Points history**: one **Earned** row (on the USD spend) and one **Redeemed** row
    (for the PTS items), both referencing your order number.

---

### Checking your points balance after the order

13. Go to **Account → Loyalty Points** (`{{FRONT_URL}}/account/loyalty`).

    You will see two new rows for your order:

    - **Redeemed** — the points spent on PTS items (e.g. −10 PTS).
    - **Earned** — points credited on the USD purchase (e.g. +200 PTS).

    ![Points history after the mixed-cart order](screenshots/vcst-5104/07-points-history-after.png)
    *The history shows both the redemption and the earning in the same order, with a net positive balance.*

!!! note "My order history shows only a USD total — where is the points purchase?"
    The order list shows the primary USD total. Open the order detail page to see the
    **Total in PTS** block alongside the USD total.

---

### Troubleshooting

- **Place order is greyed out or blocked** — Make sure you have selected both a delivery method and a
  payment card. If the button remains inactive after filling both, verify your points balance covers
  the PTS total shown in the cart summary.
- **"Insufficient loyalty points" message at placement** — Your balance is lower than the PTS total in
  the cart. Remove some PTS items or top up your balance before retrying.
- **I don't see a "Products in PTS" section** — You may not have added any loyalty-catalog products.
  Open the **Loyalty** category and add at least one PTS-priced item.
