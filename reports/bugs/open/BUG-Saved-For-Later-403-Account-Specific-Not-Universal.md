# BUG UPDATE: Saved For Later 403 Is Account-Specific, Not Universal

## Summary

Follow-up investigation to [BUG-Saved-For-Later-Account-Page-403-Access-Denied.md](BUG-Saved-For-Later-Account-Page-403-Access-Denied.md) and [BUG-SavedForLater-AccountPage-403-WishlistQuery-Mismatch.md](BUG-SavedForLater-AccountPage-403-WishlistQuery-Mismatch.md).

**Key finding: The 403 Access Denied on `/account/saved-for-later` does NOT affect all users.** A brand new company account can access the page without any issues. The bug is **account-specific**, likely tied to the organization/permission configuration of the affected user (`mutykovaelena@gmail.com` / "Coffee shop" organization).

This contradicts the original bug reports which stated the issue affects "ALL logged-in B2B users."

## Severity: High (P1) -- unchanged, but scope is narrower than originally reported

## Environment

| Field | Value |
|-------|-------|
| **Frontend URL** | https://vcst-qa-storefront.govirto.com |
| **Browser** | Google Chrome (Chromium) via Playwright MCP |
| **Viewport** | 1920x1080 (Desktop) |
| **Store** | B2B-store |
| **Storefront Version** | 2.43.0-pr-2188-c129-c1290c2d |
| **Date Tested** | 2026-02-26 |

## Test Accounts Used

| Account | Email | Organization | Result |
|---------|-------|--------------|--------|
| **New account** (created during test) | test.savedlater.qa+20260226183000@yopmail.com | SavedLater Test Corp | **WORKS -- No 403** |
| **Existing account** (original bug) | mutykovaelena@gmail.com | Coffee shop (50+ organizations) | **BROKEN -- 403 Access Denied** |

## Reproduction Steps

### Part 1: Create and Test New Company Account

**Step 1: Register new company account**

1. Navigate to https://vcst-qa-storefront.govirto.com/sign-up
2. Select "Company account" radio button
3. Fill registration form:
   - First Name: Test
   - Last Name: SavedLater
   - Email: test.savedlater.qa+20260226183000@yopmail.com
   - Company: SavedLater Test Corp
   - Password: Password1!
4. Click "Sign up"
5. Registration completes successfully (no email verification required in QA)

Evidence: `02-registration-form-filled.png`, `03-registration-completed.png`

**Step 2: Log in with new account**

1. Navigate to https://vcst-qa-storefront.govirto.com/sign-in
2. Enter email and password from Step 1
3. Click "Log in"
4. Login succeeds -- header shows "SavedLater Test Corp" and "Test SavedLater"

Evidence: `04-new-account-logged-in.png`

**Step 3: Add products to cart**

1. Search for "bolt" in the search bar
2. Click on "Carriage Bolt 1" Steel" product
3. Add to cart (quantity auto-set to 45 due to pack size)
4. Navigate to UNTUCKit eGift Card product page
5. Add 1 unit to cart
6. Cart now shows 2 products (45 bolts + 1 gift card)

Evidence: `05-cart-with-two-products.png`

**Step 4: Save item for later**

1. Navigate to /cart
2. Click "Save for later" on the UNTUCKit eGift Card
3. Item moves to "SAVED FOR LATER" section on the cart page
4. "See all" link and "Move to cart" button are visible

Evidence: `06-cart-saved-for-later-section-visible.png`

**Step 5: Access /account/saved-for-later page**

1. Click "See all" link (points to /account/saved-for-later)
2. **PAGE LOADS SUCCESSFULLY** -- No 403 error
3. Page displays:
   - "SAVED FOR LATER" heading
   - UNTUCKit eGift Card with product details, price ($100.00), quantity selector
   - "Add to cart" button per item
   - "Save changes", "Add all to cart", and "Buy now" action buttons
   - Full account sidebar navigation (Purchasing, Marketing, Corporate, User sections)
4. Console errors: **0 errors**
5. Network: **All GraphQL requests returned HTTP 200 with no errors**

Evidence: `07-account-saved-for-later-page-WORKS-new-account.png`

**RESULT: The /account/saved-for-later page works perfectly for the new account.**

---

### Part 2: Verify Bug Still Exists for Original User

**Step 6: Log out and log in as original user**

1. Log out from new account
2. Navigate to /sign-in
3. Log in as mutykovaelena@gmail.com / Password2!
4. **Immediately redirected to /403** (because returnUrl contained /account/saved-for-later)
5. Header shows "Coffee shop / Elena Mutykova" -- user is authenticated

Evidence: `08-403-access-denied-original-user-after-login.png`

**Step 7: Test all navigation paths to /account/saved-for-later**

| Path | Action | Result |
|------|--------|--------|
| Direct URL | Navigate to /account/saved-for-later | **403 Access Denied** |
| Account sidebar | Dashboard -> Click "Saved for later" in sidebar | **403 Access Denied** |
| Return URL | Login with returnUrl parameter | **403 Access Denied** |

Evidence: `09-403-direct-navigation-original-user.png`, `10-403-sidebar-click-original-user.png`

**Step 8: Verify other account pages work**

1. Navigate to /account/dashboard -- **WORKS**
2. Account sidebar renders correctly with all navigation links
3. Only "Saved for later" link triggers 403

**RESULT: The 403 bug persists for the original user but NOT for a new account.**

---

## Key Differences Between Accounts

| Factor | New Account (WORKS) | Original Account (BROKEN) |
|--------|--------------------|-----------------------------|
| Email | test.savedlater.qa+...@yopmail.com | mutykovaelena@gmail.com |
| Organization | SavedLater Test Corp (single org) | Coffee shop (50+ organizations) |
| Account age | Brand new (created during test) | Established account with history |
| Organization count | 1 | 50+ |
| Roles/Permissions | Default company account | Complex multi-org assignments |
| Saved items | 1 item (freshly saved) | 2+ items (some with orphaned products) |
| Other account data | None | Orders, lists, quotes, addresses |

## Network Analysis

### New Account -- All Requests Successful

All GraphQL requests on `/account/saved-for-later` returned HTTP 200 with valid data. No `GetWishlist` Forbidden error was observed. This suggests the `GetWishlist` query either:
- Was not called (code path differs for this account/org configuration)
- Was called with a valid wishlist ID (not a cart ID)
- Successfully resolved the saved-for-later list as a valid entity

### Original Account -- Consistent 403

GraphQL API requests returned HTTP 200 status codes, but the frontend routing layer redirected to /403. The previously documented `GetWishlist` Forbidden error pattern likely persists.

## Revised Root Cause Hypothesis

The original bug reports identified a `GetWishlist` query being called with a cart-type ID, causing a Forbidden error. Given the new finding that a fresh account does NOT trigger this behavior, the root cause is likely one of the following:

### Hypothesis 1: Corrupted/Legacy Saved-For-Later List

The original user's saved-for-later list (ID: `92a589a0-2408-4981-896b-02bdd4ab087c`) may have been created under an older version of the platform where saved-for-later was implemented as a wishlist. After a migration or API refactor (the xAPI was revamped July 2024), the entity type changed to CartType, but the old list retains properties that trigger the wishlist code path.

### Hypothesis 2: Multi-Organization Permission Resolution

The original user belongs to 50+ organizations. The permission check on the `GetWishlist` query may fail when the system cannot determine which organization context to use for authorization, while a single-org user resolves unambiguously.

### Hypothesis 3: Orphaned Product Data

The original user has items in the saved-for-later list with `product: null` (e.g., "Vintage Wedding Cake"). This orphaned data may cause the frontend to take a different code path that triggers the `GetWishlist` fallback query.

### Hypothesis 4: Organization-Specific Permissions

The "Coffee shop" organization may lack specific permissions related to saved-for-later/wishlist access that the new "SavedLater Test Corp" organization received by default during creation.

## Updated Impact Assessment

| Original Assessment | Updated Assessment |
|--------------------|-------------------|
| Affects ALL B2B users | Affects specific accounts (confirmed: mutykovaelena@gmail.com) |
| 100% reproduction rate for all users | 100% for affected accounts, 0% for new accounts |
| Complete feature breakage | Account-specific feature breakage |

**The bug is still High/P1** because:
- It completely blocks the affected user from accessing their saved-for-later page
- The root cause is unclear -- other established accounts may also be affected
- It may affect any account that was active before the xAPI refactor
- The workaround (using the cart page widget) is still limited

## Recommended Investigation

1. **Test with additional existing accounts** to determine if the bug affects all pre-existing accounts or only specific ones
2. **Compare the GraphQL requests** between the working and broken accounts using Chrome DevTools HAR capture to see exactly which queries differ
3. **Check the saved-for-later entity type** in the database for both accounts -- is the new account's list a CartType while the old one is a WishlistType (or vice versa)?
4. **Check organization permissions** in Admin SPA for "Coffee shop" vs "SavedLater Test Corp" -- are there differences in role/permission assignments?
5. **Test with the original user in a different organization** -- switch Elena Mutykova to a different default org and retry

## Screenshots

All screenshots saved to:
`tests/Sprint26-04/VCST-4650-bopis-pickup-search-indexing/screenshots/saved-for-later-new-account/`

| # | File | Description |
|---|------|-------------|
| 01 | `01-homepage-existing-user-logged-in.png` | Homepage with Elena Mutykova logged in before logout |
| 02 | `02-registration-form-filled.png` | Registration form with Company account selected, all fields filled |
| 03 | `03-registration-completed.png` | Registration completed confirmation page |
| 04 | `04-new-account-logged-in.png` | Homepage showing "Test SavedLater" / "SavedLater Test Corp" |
| 05 | `05-cart-with-two-products.png` | Cart page with UNTUCKit eGift Card and Carriage Bolt |
| 06 | `06-cart-saved-for-later-section-visible.png` | Cart showing "SAVED FOR LATER" section after saving item |
| 07 | `07-account-saved-for-later-page-WORKS-new-account.png` | /account/saved-for-later loads successfully for new account |
| 08 | `08-403-access-denied-original-user-after-login.png` | 403 error when original user logs in with returnUrl |
| 09 | `09-403-direct-navigation-original-user.png` | 403 error on direct navigation for original user |
| 10 | `10-403-sidebar-click-original-user.png` | 403 error from sidebar click for original user |

## Conclusion

The `/account/saved-for-later` 403 Access Denied bug is **account-specific, not universal**. A brand new company account can access the page without any issues. The bug is confirmed to persist for the `mutykovaelena@gmail.com` account under the "Coffee shop" organization. The most likely root cause is related to the account's multi-organization configuration, legacy saved-for-later data, or organization-specific permissions. Further investigation into the differences between the two accounts' GraphQL request/response patterns is recommended.

## References

- Original bug report: [BUG-Saved-For-Later-Account-Page-403-Access-Denied.md](BUG-Saved-For-Later-Account-Page-403-Access-Denied.md)
- Root cause analysis: [BUG-SavedForLater-AccountPage-403-WishlistQuery-Mismatch.md](BUG-SavedForLater-AccountPage-403-WishlistQuery-Mismatch.md)
- Test account created: test.savedlater.qa+20260226183000@yopmail.com / SavedLater Test Corp
- Storefront version: 2.43.0-pr-2188-c129-c1290c2d
