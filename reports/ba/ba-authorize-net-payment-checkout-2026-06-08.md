# Paying by Card on the Checkout Page (Authorize.Net)

**Date:** 2026-06-08 | **Feature:** VCST-5162 — Authorize.Net AllowCartPayment | **Env:** vcst-qa · theme 2.51.0-pr-2309

---

### Introduction

When you choose **Bank card (Authorize.Net)** as your payment method, a secure card form appears directly on the checkout page. You enter your card details and click **Place order** — there is no redirect to a separate payment page. Everything happens in one step, on one page.

![The Authorize.Net card form displayed inline on the cart/checkout page](../../../tests/Sprint26-11/VCST-5162/screenshots/A-authorizenet-card-form-empty.png)
*The Authorize.Net card form appears inline on the checkout page once you select Bank card (Authorize.Net).*

---

### Prerequisites

- Your cart must contain at least one item.
- A shipping address must be set.
- A delivery method must be selected in the **Shipping details** section.
- If you want to use a different billing address, uncheck **Same as shipping address** and select or add a billing address before filling in the card form.

---

### Paying by card (Authorize.Net)

1. Add items to your cart and navigate to your **Cart** page (`/cart`).

2. In the **Shipping details** section, confirm your shipping address and select a **Delivery method** from the dropdown.

3. In the **Payment details** section, open the **Payment method** dropdown and select **Bank card (Authorize.Net)**.

4. A **Payment card** section appears below — the card form is on the same page, no redirect occurs.

5. Fill in the four required fields:

   | Field | What to enter |
   |---|---|
   | **Card number** | Your 16-digit (Visa/Mastercard/Discover) or 15-digit (Amex) card number — no spaces needed |
   | **Cardholder name** | Name exactly as it appears on your card |
   | **Expiration date** | Month and year in MM / YY format (2-digit year, e.g. 12/29) |
   | **Security code** | The 3-digit code on the back of your card (4 digits for Amex) |

   As you type, the card-brand icon (Visa, Mastercard, Discover, Amex) updates automatically based on your card number.

6. The **Place order** button in the order summary stays disabled until all four fields are validly filled.

   ![Filled card form with Place order button active in the sidebar](../../../tests/Sprint26-11/VCST-5162/screenshots/B-authorizenet-form-filled-place-order-enabled.png)
   *When all fields are filled correctly, the Place order button becomes active in the Order summary.*

7. Click **Place order**. Your card details are tokenized on your device — they never pass through the store's servers. The payment is processed in the background.

8. On success you will see: **"Order CO… has been successfully submitted."** and a message: "You will be notified via email about the order status change."

   ![Order Completed page confirming order CO260608-00009](../../../tests/Sprint26-11/VCST-5162/screenshots/C-order-confirmation-CO260608-00009.png)
   *The Order Completed page confirms your order number and that your payment was accepted.*

9. Your order is now visible at **Account → Orders** with the status **Processing**.

!!! note "Is my card information secure?"
    The card form uses Authorize.Net's Accept.js library. Your card number, expiry date, and security code are tokenized directly in your browser and sent to Authorize.Net's secure servers. The store never sees or stores your raw card data.

!!! note "Do I get redirected to another page to pay?"
    No. With this checkout, the card form appears directly on the cart page. You complete payment in one step without leaving the page. The browser URL stays on `/cart` while you fill in the form, and moves to the order confirmation page only after the payment succeeds.

!!! note "Why is the expiry date in MM/YY format?"
    The expiry field uses a 2-digit year (e.g. **12/29** for December 2029). Entering a 4-digit year (e.g. 12/2029) will not work — the field will treat it as an expired card. Always use the 2-digit year shown on your physical card.

---

### Troubleshooting

- **Place order remains disabled after filling all fields** — Check that the expiration date uses the MM/YY mask (2-digit year). Also confirm a shipping address and delivery method are set in the **Shipping details** section above — both are required before the button activates.

- **"Declined" or payment failure** — Your bank has rejected the transaction. Check your card number, expiry date, security code, and available balance. You will land on a payment retry page with the option to re-enter your details. Your order is saved — go to **Account → Orders** to find it and try again.

- **"Duplicate transaction" rejection** — Authorize.Net's sandbox blocks identical charge amounts placed within approximately 3 minutes of each other. Add or remove an item to change the cart total, then try again.

- **I don't see the Bank card (Authorize.Net) option in the payment dropdown** — Make sure your cart is not empty and a shipping address is set. If the option is still missing, contact the store's support team — Authorize.Net may not be enabled for your account type or region.

- **The card brand icon does not update as I type** — Check that your card number begins with the correct digit for your card type (4 for Visa, 5 for Mastercard, 6 for Discover, 3 for Amex). Verify you have not entered letters or extra spaces.

---

## Docs update needed

The Virto Commerce Storefront User Guide checkout page (`storefront/user-guide/shopping/checkout-process`) currently describes Authorize.Net as a processor that **adds a separate Payment step** — after clicking Place order, the shopper is taken to a `/checkout/payment` page to click "Pay now". This description is no longer accurate. VCST-5162 (`AllowCartPayment=true`) moves the Authorize.Net card form inline onto the cart page, matching the CyberSource and Skyflow patterns. The published guide should be updated to reflect the inline flow for all three processors.

---

**Sources:**
- Virto Commerce Storefront User Guide — Checkout process: https://docs.virtocommerce.org/storefront/user-guide/shopping/checkout-process
- VCST-5162 — Extend Authorize.Net with AllowCartPayment
