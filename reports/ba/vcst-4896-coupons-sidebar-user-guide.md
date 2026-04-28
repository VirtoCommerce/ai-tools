# Discounts and Coupons on Your Cart Page

**Feature:** Coupons sidebar widget (VCST-4896)
**Applies to:** Cart page — all customers (B2B and B2C)

---

## Overview

We have updated the cart page with a new **Discounts and Coupons** section. It replaces the old coupon field that was tucked inside the Order Summary box. The new section gives you a cleaner, more visible place to browse coupons that are available to you, enter a custom coupon code, and see exactly which discount is applied before you check out.

If you are signed in, you will see a personal list of coupons assigned to your account. Guests and signed-in customers alike can always type or paste any coupon code manually.

---

## Where to Find It

Open your cart (`/cart`) and scroll below the **Order Summary** block. The **Discounts and Coupons** section appears directly underneath it.

[screenshot: cart-coupons-section.png]

---

## Applying a Coupon from Your Available List

This section is visible to **signed-in customers only.** If you do not see a coupon list, check that you are logged in.

1. Go to your cart at `/cart`.
2. Scroll below the Order Summary to the **Discounts and Coupons** section.
3. You will see up to **4 coupon cards**. Each card shows the coupon name, a short description, and its expiry date.
4. Find the coupon you want to use and click **Apply**.
5. The card updates immediately — it shows a green checkmark to confirm the coupon is active, and your Order Summary reflects the new total.

> **Note:** Only one coupon can be active at a time. If you already have a coupon applied, applying a new one will automatically remove the previous one first (see [Switching from One Coupon to Another](#switching-from-one-coupon-to-another)).

---

## Applying a Custom Coupon Code

Any customer — including guests — can enter a code manually.

1. In the **Discounts and Coupons** section, locate the **Enter a coupon code** input card (it appears below the list of available coupons, or on its own if you are not signed in).
2. Type or paste your coupon code into the field.
3. Click **Apply**.
4. If the code is valid, your discount is applied and the Order Summary updates.
5. If the code is not recognised, the card switches to a red error state with the message **"This code is not valid."** Check your code and try again (see [Troubleshooting](#troubleshooting)).

**After a page refresh:** If you had a custom code applied before you refreshed, the system automatically re-fills the input field with that code so you do not lose your place.

---

## Removing an Applied Coupon

1. Find the coupon card that shows the green checkmark.
2. Click the **trash icon** on that card.
3. The discount is removed and your Order Summary updates to the full price.

> **Note:** Removing a coupon from the list does **not** clear the text you typed in the custom-code input field. Your typed code stays in the field; you will need to delete it manually if you no longer want to use it.

---

## Switching from One Coupon to Another

Only one coupon can be applied to your cart at a time. When you click **Apply** on a second coupon while one is already active, the system removes the first coupon and then applies the new one automatically — you do not need to remove the old one first.

- Applied coupon A, then click Apply on coupon B: A is removed, B is applied.
- The Order Summary always reflects the currently active coupon only.

---

## Why Did My Discount Change When I Applied a Coupon?

You may occasionally notice that your cart total goes **up** after you apply a coupon. This is not a bug.

The store uses a promotion system that tries to give you the single best deal available on your order. When you add items to your cart, automatic promotions (ones that apply without any code) may already be reducing your total. If you then apply a coupon, the system switches to that coupon-backed discount and removes the previous automatic saving — even if the automatic saving was larger.

**In plain terms:** applying a coupon turns off the automatic promotion that was already helping you. If the coupon's discount is smaller than the automatic promotion it replaced, your total goes up.

**What to do:** If your total is higher after applying a coupon, remove the coupon (click the trash icon) to restore the original automatic promotion. Compare the two totals to decide which is better for your order.

---

## Coupon Expiry

Every coupon card shows its expiry date. Keep this in mind:

- A coupon can expire **between the time you add it to your cart and the time you place your order.**
- If a coupon expires before you complete checkout, the discount is removed automatically at that point and your total is recalculated.
- You will not be charged the wrong amount — the final total shown at checkout is always accurate.

If you notice your discount has disappeared at checkout, the most likely reason is that the coupon expired. Return to your cart and check whether another coupon is available to you.

---

## Where to See All Your Coupons

The sidebar shows up to **4 coupons** at a time. To view your full list, click **View all coupons and promotions** at the bottom of the section. This takes you to `/account/coupons`, where you can see all coupons assigned to your account (up to 16 at once).

> **Note:** The `/account/coupons` page requires you to be signed in.

---

## Troubleshooting

**"This code is not valid" error**

This message appears when the code cannot be applied to your current cart. Common reasons:

- **Typo in the code** — coupon codes are case-sensitive. Double-check each character.
- **The coupon has expired** — check the expiry date on the coupon card or your confirmation email.
- **Wrong store** — some coupons are valid only on specific storefronts or for specific regions.
- **Already used** — single-use coupons cannot be applied a second time.
- **Account-restricted coupon** — the coupon may be assigned to a different customer account.
- **Minimum order not met** — some coupons require a minimum cart value. Add more items and try again.

**I don't see any coupons in the list**

- Make sure you are **signed in**. Guests see only the manual code input, not the personalised list.
- Not every account has targeted coupons. If no coupons appear after signing in, none have been assigned to your account at this time.

**The discount didn't apply on a sale item**

Coupons are calculated on top of the already-discounted (sale or tier) price, not the original list price. If you were expecting a larger saving, this is likely why. Additionally, if an automatic promotion was already applied, the coupon may replace it rather than stack on top of it — see [Why Did My Discount Change When I Applied a Coupon?](#why-did-my-discount-change-when-i-applied-a-coupon).

---

## Frequently Asked Questions

**Can I use more than one coupon on the same order?**
No. Only one coupon can be active per order at a time. Applying a second coupon automatically removes the first. Choose the coupon that gives you the best saving before you check out.

**Does a coupon apply to items that are already on sale?**
Yes. The coupon is applied to the sale price of the item, not the original price. For example, if an item is discounted from $100 to $80, a 10% coupon would save you $8 (10% of $80), not $10.

**I see the same code in my coupon list and in the "Enter a coupon code" field. Do I need to apply it twice?**
No. The system recognises duplicates. Apply the coupon once — either by clicking Apply on the card or by typing the code manually. The result is the same, and the discount is applied only once.

**What happens if my coupon expires while my cart is sitting open?**
Nothing happens immediately. The coupon stays applied until you proceed to checkout. At that point the system checks validity again. If the coupon has expired by then, the discount is removed and your total is recalculated before payment.

**I applied a coupon and now my total is higher than before. What do I do?**
Remove the coupon by clicking the trash icon on the applied card. This restores the automatic promotion that was originally saving you money. Compare the totals with and without the coupon to choose the better deal.
