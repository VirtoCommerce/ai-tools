# Frontend Test Cases: Checkout Flows

> Extracted from qa-frontend-expert agent. Read on demand during checkout testing.

---

## TC_CHECKOUT_GUEST_001 — Guest Checkout (CRITICAL)

```markdown
Prerequisites:
- Products in cart
- Payment gateway in test mode
- Test credit card available

STEP 1: Initiate Checkout
1. From cart, click "Proceed to Checkout"
   Expected:
   - Checkout page loads
   - Progress indicator visible (Step 1 of 4, etc.)
   - Guest checkout option available
2. Select "Checkout as Guest"
   Expected: Email field appears
3. Enter email: guest-test@example.com
   Expected: Email validates, can proceed

STEP 2: Shipping Address
4. Fill shipping address (First/Last Name, Address, City, State, ZIP, Country, Phone)
   Expected:
   - All fields accept input
   - Required fields marked with *
   - Real-time validation (zip format, phone format)
   - State dropdown filters by country
5. Click "Continue to Shipping Method"
   Expected: Form validates, proceeds

STEP 3: Shipping Method
6. View shipping options (Standard/Express/Next Day with costs and ETAs)
7. Select "Standard Shipping"
   Expected: Radio selects, total updates, ETA shows
8. Click "Continue to Payment"

STEP 4: Payment
9. View payment form (Card number, Expiry, CVV, Name, Billing address)
10. Select "Billing address same as shipping" → auto-filled
11. Enter payment details (test card: 4242 4242 4242 4242)
    Expected: Card formats, brand icon shows, Luhn validation
12. Review order summary (items, subtotal, shipping, tax, total)

STEP 5: Place Order
13. Click "Place Order"
    Expected: Loading state, button disabled during processing
14. Order confirmation page
    Expected: Success message, order number, details, delivery date, "Continue Shopping", cart cleared
15. Check confirmation email (within 2 minutes)

EDGE CASES:
- Back button during checkout → data preserved
- Session timeout → error/redirect
- Payment failure (declined card 4000 0000 0000 0002) → error, stay on payment, retry
- Invalid email → validation error
- Incomplete address → cannot proceed
- Rapid "Place Order" clicks → single order created

Mobile Testing (CRITICAL):
- All steps accessible at 375px
- Forms usable with mobile keyboard
- Input fields large enough to tap
- Dropdown selectors work
- Payment form works
- No horizontal scrolling
- "Place Order" always visible
- Auto-zoom disabled on focus

Performance:
- Each step loads < 1s
- Form validation < 300ms
- Payment processing 2-5s
- Confirmation loads immediately

Browser Testing:
- Chrome, Safari, Firefox, Edge, iOS Safari: full flow works
```

---

## TC_CHECKOUT_REGISTERED_001 — Registered User Checkout

```markdown
Prerequisites:
- User account with saved addresses/payment methods
- Products in cart

Steps:
1. Log in, navigate to cart, click "Checkout"
   Expected: Skip email step, saved addresses appear
2. Select saved shipping address
   Expected: Auto-filled, can edit or add new
3. Continue through shipping method
4. At payment: saved payment methods shown, CVV still required
5. Complete order
   Expected: Confirmation, order in account history
6. Account → Order History: order listed, details accessible, reorder/track/invoice

Additional Tests:
- "Use a different address" → add new, save for future
- "Save this card" → tokenized, appears next time
```

---

## TC_CHECKOUT_B2B_001 — B2B Checkout

```markdown
Prerequisites:
- B2B organization member account
- Organization budget/credit limit configured
- Approval workflow configured

Steps:
1. Log in as B2B customer
2. Add items (large order, e.g., $5,000)
3. Proceed to checkout
   Expected: Organization name, "Billing to: [Org]", PO number field
4. Enter PO Number: "PO-2026-001"
5. If exceeds approval threshold:
   Expected: Warning, order as "Pending Approval", email to approver
6. Complete checkout → confirmation with pending status
7. Log in as approver → approval queue → view details
8. Approve order → status changes, processing begins, buyer notified

Budget Test:
- Budget $10,000, spent $8,000, order $3,000 → error or requires approval
```
