# Testing Checklist — VCST-4867

## PR: VirtoCommerce/vc-frontend#2241
**Fix:** Raise secure layout header z-index from `z-10` to `z-20` to match common header.
**Root cause:** Dropdown menus in content area rendered above the sticky secure header.

## Environment
- URL: https://localhost:3000/
- Browser: playwright-chrome (chromium)

---

## 1. Bug Verification (Primary)

### 1.1 Checkout page — header z-index
- [ ] Navigate to checkout page (add item to cart first, proceed to checkout)
- [ ] Scroll down so the sticky header is visible at the top
- [ ] Open any dropdown in the content area (e.g., shipping address selector, payment method dropdown)
- [ ] **VERIFY:** The sticky header stays ABOVE the dropdown — dropdown does NOT overlap the header
- [ ] **VERIFY:** Header has correct z-index: inspect element, confirm `z-20` class is present (not `z-10`)

### 1.2 Sign-in page — header z-index
- [ ] Navigate to `/sign-in`
- [ ] **VERIFY:** Sticky header renders correctly with logo and lock icon
- [ ] If any dropdown/popup appears on the page, confirm header stays above it

### 1.3 Sign-up / Registration page
- [ ] Navigate to `/sign-up`
- [ ] **VERIFY:** Sticky header renders correctly
- [ ] Check that form dropdowns (country selector, etc.) do NOT overlap the header when the page is scrolled

### 1.4 Forgot Password page
- [ ] Navigate to `/forgot-password`
- [ ] **VERIFY:** Sticky header renders correctly

## 2. Visual Regression

### 2.1 Header appearance unchanged
- [ ] On checkout page: header has shadow, logo is visible, "Secure Checkout" label with lock icon is present
- [ ] Header is sticky (stays at top when scrolling)
- [ ] No visual differences from before the fix (aside from z-index behavior)

### 2.2 Common header NOT affected
- [ ] Navigate to homepage (common layout, NOT secure layout)
- [ ] **VERIFY:** Main site header still works correctly, dropdowns (account menu, cart popover, language selector) still appear properly
- [ ] **VERIFY:** No z-index regression on the common layout

## 3. Edge Cases

### 3.1 Mobile viewport
- [ ] Resize to mobile viewport (375px width)
- [ ] On checkout page, verify header still sticky and above content
- [ ] "Secure Checkout" text should be hidden on small screens (has `hidden xs:inline` class)

### 3.2 Scroll behavior
- [ ] Fast scroll on checkout page — header remains pinned
- [ ] Long content page — header doesn't flicker or jump

---

## Pass Criteria
- All dropdowns/popups render BELOW the secure header (z-index fix works)
- No visual regression on header appearance
- Common layout header not affected
- Header sticky behavior preserved on all secure-layout pages
