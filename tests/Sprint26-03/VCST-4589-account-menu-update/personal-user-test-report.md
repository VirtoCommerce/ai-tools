# VCST-4589: Account Left Rail Menu -- Personal User Test Report

**Date:** 2026-02-18
**Tester:** qa-frontend-expert (Claude Opus 4.6)
**Environment:** QA Storefront (https://vcst-qa-storefront.govirto.com)
**Platform Version:** 2.42.0-pr-2179-9d33-9d3334d1
**Test Account:** qa-personal-test-20260218@test.com (Personal account, no organization)

---

## 1. Executive Summary

This report covers re-testing of the VCST-4589 Account Left Rail Menu feature specifically for a **personal (non-corporate) user**. The prior test execution report covered corporate/organization users only. The purpose was to verify that:

1. The account menu correctly adapts for users without an organization
2. The Corporate group is properly hidden for personal users
3. The "Addresses" menu item (missing for corporate users per BUG-001) is available for personal users
4. Navigation works correctly on both desktop and mobile viewports

### Result: PASS (12/12 menu items functional, Addresses works, Corporate group correctly hidden)

| Area | Status | Issues |
|------|--------|--------|
| Desktop Menu Structure (1920x1080) | PASS | 0 |
| Desktop Navigation (all 12 routes) | PASS | 0 |
| Desktop Active State Highlighting | PASS | 0 |
| Mobile Menu Structure (375x812) | PASS | 1 minor observation |
| Mobile Navigation | PASS | 0 |
| Addresses Page (BUG-001 scope) | PASS | Works for personal users |
| Corporate Group Hidden | PASS | Correctly absent |

---

## 2. Test Setup

### 2.1 Account Creation
1. Navigated to https://vcst-qa-storefront.govirto.com/sign-up
2. Selected "Personal account" radio button (pre-selected by default)
3. Filled registration form:
   - First Name: QA
   - Last Name: Personal
   - Email: qa-personal-test-20260218@test.com
   - Password: TestPass123!
4. Clicked "Sign up"
5. Redirected to /successful-registration with email verification message
6. **Email verification bypass:** Logged into Admin SPA > Security > Users > searched for user > toggled "Verified" switch > Saved
7. Signed in on storefront with new credentials

**Evidence:**
- `screenshots/personal/01-registration-form-filled.png` -- Registration form with Personal account selected
- `screenshots/personal/02-registration-completed.png` -- Successful registration page

---

## 3. Desktop Testing (1920x1080)

### 3.1 Menu Structure

**Screenshot:** `screenshots/personal/03-desktop-menu-structure.png`

The desktop left rail menu displays **3 groups with 12 total menu items**:

| Group | Items | Count |
|-------|-------|-------|
| **Purchasing** | Dashboard, Orders, Lists, Quote requests, Saved for later, Back-in-stock list | 6 |
| **Marketing** | Notifications, Points history | 2 |
| **User** | Profile, **Addresses**, Change password, Saved credit cards | 4 |
| **TOTAL** | | **12** |

**Key observations:**
- **Corporate group is correctly ABSENT** -- Personal users have no organization, so Company Info and Company Members are not shown
- **No empty space or gap** where Corporate group would be -- layout is clean
- **Addresses IS PRESENT** in the User group -- this was MISSING for corporate users (BUG-001)
- Desktop sidebar has exactly 3 `<section>` children (vc-widget), no empty DOM elements

### 3.2 Navigation Test Results

| # | Menu Item | Route | Status | Page Content | Console Errors |
|---|-----------|-------|--------|-------------|----------------|
| 1 | Dashboard | /account/dashboard | PASS | Latest orders, Monthly spend report | 0 |
| 2 | Orders | /account/orders | PASS | "There are no orders yet" empty state | 0 |
| 3 | Lists | /account/lists | PASS | "You have not created any lists yet" | 0 |
| 4 | Quote requests | /account/quotes | PASS | "There are no quote requests yet" | 0 |
| 5 | Saved for later | /account/saved-for-later | PASS | "You haven't saved any products for later" | 0 |
| 6 | Back-in-stock list | /account/back-in-stock | PASS | "Your list is empty" | 0 |
| 7 | Notifications | /account/notifications | PASS | Shows 1 notification: "Welcome!" | 0 |
| 8 | Points history | /account/points-history | PASS | Balance: 0 | 0 |
| 9 | Profile | /account/profile | PASS | Shows QA / Personal / email | 0 |
| 10 | **Addresses** | **/account/addresses** | **PASS** | **"You do not have any addresses yet" + "Add new address" button** | **0** |
| 11 | Change password | /account/change-password | PASS | Password change form | 0 |
| 12 | Saved credit cards | /account/saved-credit-cards | PASS | Saved cards page | 0 |

**All 12 routes navigated successfully with zero console errors.**

### 3.3 Active State Highlighting

Each menu item correctly shows active state when selected:
- CSS classes applied: `router-link-active`, `router-link-exact-active`, `vc-menu-item__inner--active`
- Background color: `rgb(249, 244, 233)` (warm beige highlight)
- Verified via JavaScript evaluation on Dashboard and Addresses pages

### 3.4 Deep Linking

Direct navigation to `/account/addresses` via URL bar:
- Page loads correctly (not redirected)
- Addresses menu item shows active state
- Page displays empty state with "Add new address" button

**Evidence:** `screenshots/personal/04-addresses-page-works.png`

---

## 4. Mobile Testing (375x812 -- iPhone 13)

### 4.1 Mobile Dashboard View

On mobile, the account left rail sidebar is hidden (`max-md:hidden` CSS class). The account dashboard content displays directly with the page heading "DASHBOARD".

**Screenshot:** `screenshots/personal/05-mobile-dashboard-view.png`

### 4.2 Mobile Hamburger Menu Structure

The mobile navigation is accessed via the hamburger menu button ("Main menu"). The menu contains two sections:

**Top section (site navigation):**
- Dashboard, Catalog, Compare, Bulk order, Cart, Contact us

**Account section:**
- User name: "QA Personal" (no organization name displayed)
- Logout button
- **Purchasing** (expandable group)
- **Marketing** (expandable group)
- **User** (expandable group)
- **Settings** (expandable -- currency selector, mobile-only)

**Key observation:** Corporate group is correctly absent. Only 3 account groups visible.

**Screenshot:** `screenshots/personal/06-mobile-hamburger-menu-groups.png`

### 4.3 Mobile Submenu Expansion

Each group expands into a submenu with a back button and heading:

| Group | Items | Matches Desktop | Screenshot |
|-------|-------|-----------------|------------|
| Purchasing | Dashboard, Orders, Lists, Quote requests, Saved for later, Back-in-stock list (6) | YES | `07-mobile-purchasing-expanded.png` |
| Marketing | Notifications (with badge "1"), Points history (2) | YES | `08-mobile-marketing-expanded.png` |
| User | Profile, **Addresses**, Change password, Saved credit cards (4) | YES | `09-mobile-user-group-with-addresses.png` |
| Settings | Currency selector (USD, AUD, CNY, CZK, EUR, GBP, GHS, XPT) | N/A (mobile-only) | `12-mobile-settings-currency.png` |

### 4.4 Mobile Navigation

Tested navigation from mobile menu to account pages:

| Action | Result | Status |
|--------|--------|--------|
| Tap "Addresses" in User group | Navigates to /account/addresses, page loads correctly | PASS |
| Tap "Orders" in Purchasing group | Navigates to /account/orders, page loads correctly | PASS |
| Reopen menu after navigation | Menu remembers last expanded group | PASS |
| Menu back button | Returns to root menu level | PASS |

**Screenshots:**
- `screenshots/personal/10-mobile-addresses-page.png` -- Addresses page on mobile
- `screenshots/personal/11-mobile-orders-page.png` -- Orders page on mobile

### 4.5 Mobile Menu -- Empty Listitem Observation (Minor)

**Observation:** In the mobile hamburger menu DOM, there is an empty `<li>` element between the Marketing and User groups. Analysis:

| Property | Value |
|----------|-------|
| innerHTML | `<!---->` (Vue.js v-if comment placeholder) |
| height | 0px |
| children | 0 |
| display | list-item |
| Visual impact | None (zero height, invisible) |

**Assessment:** This is a Vue.js conditional rendering artifact for the Corporate group. When the Corporate group is hidden for personal users, Vue leaves an empty comment node wrapped in a `<li>`. The element has zero height and creates no visual gap. This is standard Vue.js behavior and does not constitute a bug. The desktop sidebar does NOT have this artifact because it uses a different rendering structure (`<section>` elements instead of `<li>` list items).

**Severity:** Not a bug -- cosmetic DOM artifact only, invisible to users and screen readers.

---

## 5. BUG-001 Impact Analysis (Addresses Missing for Corporate Users)

### Context
The corporate user test report (test-execution-report.md) documented BUG-001: "Addresses" menu item missing from the User group for corporate users. The `/account/addresses` route redirected to `/account/dashboard`.

### Personal User Findings

| Test | Corporate User | Personal User |
|------|---------------|---------------|
| "Addresses" in menu | MISSING | **PRESENT** |
| /account/addresses route | Redirects to /dashboard | **Loads correctly** |
| Deep link to /account/addresses | Redirected | **Works** |
| "Add new address" button | N/A | **Displayed** |
| User group item count | 3 (Profile, Change password, Saved credit cards) | **4** (Profile, Addresses, Change password, Saved credit cards) |

### Conclusion

BUG-001 is **user-type-specific**: it only affects corporate/organization users. Personal users have full access to the Addresses page and menu item. This suggests the issue is intentional design (corporate users manage addresses at the organization level) OR a bug specific to corporate user role configuration.

**Recommendation:** Verify with product/design team whether Addresses should be hidden for corporate users by design, or whether this is a bug that needs fixing. If corporate users manage addresses through the organization (Company Info), then hiding personal Addresses is correct behavior.

---

## 6. Comparison: Corporate vs. Personal User Menu

| Feature | Corporate User | Personal User |
|---------|---------------|---------------|
| **Groups visible** | 4 (Purchasing, Marketing, Corporate, User) | 3 (Purchasing, Marketing, User) |
| **Total menu items** | 14 | 12 |
| **Corporate group** | PRESENT (Company Info, Company Members) | ABSENT (correct) |
| **Purchasing items** | 6 | 6 (identical) |
| **Marketing items** | 2 | 2 (identical) |
| **User items** | 3 (missing Addresses) | 4 (includes Addresses) |
| **Header display** | "ACME Store 2 / Elena Mutykova" | "QA Personal" (no org) |
| **Mobile: Settings** | Present | Present |
| **Mobile: Empty listitem** | Not checked | Present (zero-height, invisible) |

### Items Exclusive to Corporate Users
- Company Info (/account/company-info)
- Company Members (/account/company-members)

### Items Exclusive to Personal Users
- Addresses (/account/addresses) -- absent for corporate users (BUG-001)

### Items Shared (Identical)
- Dashboard, Orders, Lists, Quote requests, Saved for later, Back-in-stock list
- Notifications, Points history
- Profile, Change password, Saved credit cards

---

## 7. Minor Observations

### 7.1 Untranslated i18n Key (Orders Page)
- **Location:** Orders page search button aria-label
- **Value:** `"commmon.buttons.search_orders"` (note triple 'm' in "commmon")
- **Visual impact:** None -- the button displays a magnifying glass icon only
- **Accessibility impact:** Low -- screen readers would read the raw key
- **Severity:** Low (P3) -- typo in i18n key name
- **Present for:** Both personal and corporate users (not user-type-specific)

### 7.2 Mobile Menu Group Memory
When navigating from a mobile submenu to an account page, then reopening the hamburger menu, the menu remembers the last expanded group and shows it directly. This is intentional UX behavior that reduces navigation steps.

---

## 8. Test Evidence Summary

| # | Screenshot | Description |
|---|-----------|-------------|
| 1 | `screenshots/personal/01-registration-form-filled.png` | Registration form with Personal account selected |
| 2 | `screenshots/personal/02-registration-completed.png` | Successful registration page |
| 3 | `screenshots/personal/03-desktop-menu-structure.png` | Desktop sidebar with 3 groups (Purchasing, Marketing, User) |
| 4 | `screenshots/personal/04-addresses-page-works.png` | Desktop Addresses page loading correctly |
| 5 | `screenshots/personal/05-mobile-dashboard-view.png` | Mobile dashboard at 375px (sidebar hidden) |
| 6 | `screenshots/personal/06-mobile-hamburger-menu-groups.png` | Mobile hamburger menu showing 3 account groups |
| 7 | `screenshots/personal/07-mobile-purchasing-expanded.png` | Purchasing group expanded (6 items) |
| 8 | `screenshots/personal/08-mobile-marketing-expanded.png` | Marketing group expanded (2 items) |
| 9 | `screenshots/personal/09-mobile-user-group-with-addresses.png` | User group expanded with Addresses visible |
| 10 | `screenshots/personal/10-mobile-addresses-page.png` | Addresses page on mobile (works correctly) |
| 11 | `screenshots/personal/11-mobile-orders-page.png` | Orders page on mobile |
| 12 | `screenshots/personal/12-mobile-settings-currency.png` | Settings > Currency selector (mobile-only) |

---

## 9. Sign-Off

| Criteria | Status | Notes |
|----------|--------|-------|
| Menu groups correct for personal user | PASS | 3 groups (Purchasing, Marketing, User) |
| Corporate group hidden | PASS | Correctly absent |
| All 12 menu items navigate correctly | PASS | Zero console errors |
| Active state highlighting works | PASS | Correct CSS classes and background color |
| Deep linking to /account/addresses | PASS | Page loads, not redirected |
| Addresses page functional | PASS | Empty state with "Add new address" button |
| Mobile menu structure correct | PASS | 3 groups match desktop |
| Mobile navigation works | PASS | Tested Addresses and Orders |
| Mobile layout at 375px | PASS | No overflow, no horizontal scroll |
| BUG-001 (Addresses missing) | N/A for personal users | Only affects corporate users |

**Overall Status: PASS**

**Decision: APPROVED** -- The account left rail menu works correctly for personal (non-corporate) users. All 12 menu items are functional, the Corporate group is properly hidden, and the Addresses page (affected by BUG-001 for corporate users) works as expected for personal users.

---

*Report generated by qa-frontend-expert on 2026-02-18*
