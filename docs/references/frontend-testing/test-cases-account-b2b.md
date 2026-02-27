# Frontend Test Cases: Customer Account & B2B Features

> Extracted from qa-frontend-expert agent. Read on demand during account/B2B testing.

---

## TC_ACCOUNT_REGISTER_001 — Registration

```markdown
Steps:
1. Click "Sign Up" → Registration form
2. Fill: Email, Password, Confirm Password, First/Last Name, Newsletter, Terms
3. Click "Create Account"
   Expected: Account created, confirmation message, welcome email

Validation Tests:
- Email already exists → "Email already registered"
- Invalid email format → "Enter valid email"
- Weak password → "Password must contain..."
- Passwords don't match → "Passwords must match"
- Terms not accepted → "You must accept terms"

Mobile: Form usable, password visibility toggle, all fields accessible
```

---

## TC_ACCOUNT_LOGIN_001 — Login

```markdown
Steps:
1. Click "Login" → Login form
2. Enter credentials, click "Login"
   Expected: Logged in, redirect to dashboard, header shows "Welcome, [Name]"

Failed Login:
- Wrong password → "Invalid credentials"
- Non-existent email → generic error
- Too many attempts → temporary lock

"Remember Me":
- Check, login, close/reopen browser → still logged in

"Forgot Password":
- Click → enter email → reset email sent → reset link works → set new password → login works
```

---

## TC_ACCOUNT_DASHBOARD_001 — Account Dashboard

```markdown
Steps:
1. Log in → "My Account"
   Expected: Overview, recent orders, quick links (Orders, Addresses, Payments, Settings, Logout)

Order History:
- List with order number, date, total, status, "View Details"
- Order details: items, address, tracking, "Track"/"Reorder"/"Download Invoice"

Addresses:
- Saved addresses, defaults marked, "Add New" button
- Add, edit, delete addresses (with confirmation)

Account Settings:
- Update name, email, password, communication preferences
- Delete account (with confirmation)

B2B Features:
- View organization details and members
- Invite new members (if admin)
- View budget/spending
- View approval history

Quick Order:
- Access form, enter SKUs + quantities or upload CSV
- Add all to cart
```

---

## TC_B2B_QUOTE_001 — Quote Management

```markdown
Steps:
1. Log in as B2B customer
2. Add high-value items to cart
3. Click "Request Quote"
   Expected: Form with cart items, note field, delivery date
4. Submit → Quote created, ID generated, "Pending" status, email sent
5. Account → Quotes: list with number, date, status, value
6. Sales responds (in Admin) → proposal email
7. Customer views proposal: pricing, terms, validity, Accept/Reject/Request Changes
8. Accept → "Convert to Order" → order with quote pricing
```

---

## TC_B2B_QUICK_ORDER_001 — Quick Order / Bulk Order

```markdown
Steps:
1. Navigate to "Quick Order"
   Expected: Multiple input rows (SKU + Quantity)
2. Enter: SKU-001 x10, SKU-002 x25, SKU-003 x5
3. Click "Add to Cart"
   Expected: Valid SKUs added, invalid flagged, success message

CSV Upload:
- Upload CSV → parsed → valid items added, invalid rows reported

Copy/Paste:
- Paste from Excel (SKU [tab] Quantity) → parsed and processed

Edge Cases:
- Non-existent SKU → "SKU not found"
- Out-of-stock → warning
- Invalid quantity → error
```
