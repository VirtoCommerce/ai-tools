# GraphQL Mutation Validation Checklist

**Context:** PR #130 (VCST-4691) added `InputValidationOptions` / `AddressValidator` to `vc-module-profile-experience-api` to prevent XSS injection. This caused regression (VCST-4802) and exposed gaps where validation is missing (VCST-4803, VCST-4804). This checklist covers ALL storefront GraphQL mutations that need verification for:

1. **Regression** — Does the new validation break existing flows? (like VCST-4802)
2. **Coverage gap** — Is InputValidation applied at all? (like VCST-4804)
3. **Field-level gap** — Are all user-controlled fields validated? (like VCST-4803)

**Date:** 2026-03-23
**Related tickets:** VCST-4691 (original XSS fix), VCST-4802 (regression), VCST-4803 (phones gap), VCST-4804 (shipment gap), VCST-4814 (duplicate of 4802)

---

## Legend

| Status | Meaning |
|--------|---------|
| BUG | Known bug filed |
| NEEDS TEST | Not yet verified — needs manual/automated test |
| OK | Validated, working correctly |
| N/A | Not applicable (read-only or no user input fields) |

---

## 1. xProfile Module (`vc-module-profile-experience-api`) — HAS InputValidation (PR #130)

These mutations have `AddressValidator` and/or `NewContactValidator`. Verify they don't break existing data.

| # | Mutation | InputType | User-Controlled Fields | Validation Status | JIRA | Test Case |
|---|----------|-----------|----------------------|-------------------|------|-----------|
| 1 | `updateMemberAddresses` | `InputUpdateMemberAddressType` | firstName, lastName, name, line1, line2, city, phone, email, description | **BUG** — rejects existing addresses with digits in name | VCST-4802 | GQL-032 |
| 2 | `updateContact` | `InputUpdateContactType` | firstName, lastName, phones[], emails[] | **BUG** — phones[] has NO validation (accepts XSS) | VCST-4803 | GQL-031 |
| 3 | `createContact` | `InputCreateContactType` | firstName, lastName, phones[], about | **NEEDS TEST** — same validator as updateContact, phones[] likely unvalidated | — | — |
| 4 | `createOrganization` | `InputCreateOrganizationType` | name, description, addresses[] | **NEEDS TEST** — name validated (GQL-030 passes), but description and nested addresses[] need verification | — | GQL-030 |
| 5 | `updateOrganization` | `InputUpdateOrganizationType` | name, description, addresses[] | **NEEDS TEST** — same concern as createOrganization | — | — |
| 6 | `inviteUser` | `InputInviteUserType` | emails[], message, roleId | **NEEDS TEST** — message field could accept HTML injection | — | CUST-077 |
| 7 | `requestRegistration` | `InputRequestRegistrationType` | firstName, lastName, email, organization | **NEEDS TEST** — this was the ORIGINAL XSS vector (VCST-4691). Verify fix works AND doesn't break legitimate names with apostrophes/hyphens (O'Brien, Smith-Jones) | VCST-4691 | — |
| 8 | `updatePersonalData` | `InputUpdatePersonalDataType` | firstName, lastName | **NEEDS TEST** — uses NameValidationPattern, verify names with special chars | — | — |
| 9 | `changePassword` | `InputChangePasswordType` | oldPassword, newPassword | **NEEDS TEST** — passwords may contain special chars by design; verify validator doesn't reject valid passwords | — | — |
| 10 | `confirmEmail` | — | token | N/A — no free-text user input | — | — |
| 11 | `sendVerifyEmail` | — | — | N/A | — | — |
| 12 | `lockOrganizationContact` | — | contactId | N/A — ID only | — | — |
| 13 | `unlockOrganizationContact` | — | contactId | N/A — ID only | — | — |

---

## 2. xCart Module (`vc-module-experience-api` / XPurchase) — NO InputValidation

These mutations go through XPurchase module which has NO `InputValidationOptions`. All address/text fields are vulnerable.

| # | Mutation | InputType | User-Controlled Fields | Validation Status | JIRA | Test Case |
|---|----------|-----------|----------------------|-------------------|------|-----------|
| 14 | `addOrUpdateCartShipment` | `InputAddOrUpdateCartShipmentType` | deliveryAddress.line1, line2, city, phone, firstName, lastName, description | **BUG** — accepts `<script>` in address fields (stored XSS) | VCST-4804 | SEC-XSS-001 |
| 15 | `addOrUpdateCartPayment` | `InputAddOrUpdateCartPaymentType` | billingAddress.line1, line2, city, phone, firstName, lastName | **NEEDS TEST** — same module boundary gap as #14 | — | — |
| 16 | `addItem` | `InputAddItemType` | comment (if supported), dynamicProperties | **NEEDS TEST** — verify no free-text fields accept HTML | — | GQL-006 |
| 17 | `removeCartItem` | `InputRemoveItemType` | — (lineItemId only) | N/A | — | GQL-008 |
| 18 | `changeCartItemQuantity` | `InputChangeCartItemQuantityType` | — (quantity only) | N/A | — | GQL-007 |
| 19 | `clearCart` | `InputClearCartType` | — (cartId only) | N/A | — | — |
| 20 | `addCoupon` | `InputAddCouponType` | couponCode | **NEEDS TEST** — couponCode is user-typed string; verify no injection via coupon field | — | GQL-010 |
| 21 | `removeCoupon` | `InputRemoveCouponType` | couponCode | **NEEDS TEST** — same as above | — | — |
| 22 | `validateCoupon` | `InputValidateCouponType` | couponCode | **QUERY (not mutation)** — couponCode input still worth testing for injection in error responses, but lower risk (read-only) | — | — |
| 23 | `mergeCart` | `InputMergeCartType` | — (cartIds only) | N/A | — | — |
| 24 | `addBulkItemsCart` | `InputAddBulkItemsType` | items[].comment | **NEEDS TEST** — bulk order with comments | — | — |
| 25 | `addItemsCart` | `InputAddItemsType` | items[].comment | **NEEDS TEST** — same concern | — | — |

---

## 3. xOrder Module (`vc-module-experience-api` / XPurchase) — NO InputValidation

| # | Mutation | InputType | User-Controlled Fields | Validation Status | JIRA | Test Case |
|---|----------|-----------|----------------------|-------------------|------|-----------|
| 26 | `createOrderFromCart` | `InputCreateOrderFromCartType` | — (cartId only) | N/A — but the ORDER inherits addresses from cart (see #14, #15) | — | GQL-013 |
| 27 | `changeOrderStatus` | `InputChangeOrderStatusType` | — (status enum only) | N/A | — | — |

---

## 4. Quote Module — NEEDS ASSESSMENT

| # | Mutation | InputType | User-Controlled Fields | Validation Status | JIRA | Test Case |
|---|----------|-----------|----------------------|-------------------|------|-----------|
| 28 | `createQuoteFromCart` | `InputCreateQuoteFromCartType` | comment | **NEEDS TEST** — comment is free-text user input | — | — |
| 29 | `changeQuoteComment` | `InputChangeQuoteCommentType` | comment | **NEEDS TEST** — free-text, likely no validation | — | — |
| 30 | `approveQuoteRequest` | — | — | N/A | — | — |

---

## 5. Wishlist / Lists Module — NEEDS ASSESSMENT

| # | Mutation | InputType | User-Controlled Fields | Validation Status | JIRA | Test Case |
|---|----------|-----------|----------------------|-------------------|------|-----------|
| 31 | `createWishlist` | `InputCreateWishlistType` | name, description | **NEEDS TEST** — name/description are user-typed; verify no HTML injection | — | — |
| 32 | `changeWishlist` | `InputChangeWishlistType` | name | **NEEDS TEST** — same concern | — | — |
| 33 | `addWishlistItem` | — | — (productId only) | N/A | — | — |
| 34 | `removeWishlistItem` | — | — (itemId only) | N/A | — | — |
| 35 | `moveWishlistItem` | — | — (IDs only) | N/A | — | — |
| 36 | `removeWishlist` | — | — (ID only) | N/A | — | — |

---

## 6. Push Messages & Other — NEEDS ASSESSMENT

| # | Mutation | InputType | User-Controlled Fields | Validation Status | JIRA | Test Case |
|---|----------|-----------|----------------------|-------------------|------|-----------|
| 37 | `markPushMessageRead` | — | — (ID only) | N/A | — | — |
| 38 | `markAllPushMessagesRead` | — | — | N/A | — | — |
| 39 | `changeOrganization` | — | — (orgId only) | N/A | — | — |
| 40 | `addProductToCompare` | — | — (productId only) | N/A | — | — |
| 41 | `clearAllCompareProducts` | — | — | N/A | — | — |

---

## Priority Verification Matrix

### P0 — Active Bugs (fix in progress)

| # | Mutation | Issue | Owner | Status |
|---|---------|-------|-------|--------|
| 1 | `updateMemberAddresses` | VCST-4802: Breaks existing addresses | Anatolii.Vasilev | To Do |
| 2 | `updateContact` (phones[]) | VCST-4803: Accepts XSS in phones | Oleg Zhuk | To Do |
| 14 | `addOrUpdateCartShipment` | VCST-4804: No validation at all (XSS) | Oleg Zhuk | Refinement |

### P1 — High Risk (same module boundary gap, untested)

| # | Mutation | Risk | Recommended Test |
|---|---------|------|-----------------|
| 15 | `addOrUpdateCartPayment` | Billing address has same gap as shipment address | Inject `<script>` in billingAddress.line1, verify rejection |
| 7 | `requestRegistration` | Original XSS vector; verify fix + legitimate names | Register with `O'Brien`, `Jean-Luc`, `José`, verify acceptance |
| 3 | `createContact` | phones[] likely unvalidated (same validator) | Inject `<img onerror>` in phones[], verify rejection |
| 6 | `inviteUser` | message field is free-text | Inject HTML in message, verify sanitization |

### P2 — Medium Risk (free-text fields in other modules)

| # | Mutation | Risk | Recommended Test |
|---|---------|------|-----------------|
| 28 | `createQuoteFromCart` | comment is free-text | Inject HTML in comment |
| 29 | `changeQuoteComment` | comment is free-text | Inject HTML in comment |
| 31 | `createWishlist` | name/description are user-typed | Inject HTML in name |
| 32 | `changeWishlist` | name is user-typed | Inject HTML in name |
| 20 | `addCoupon` | couponCode is user-typed string | Inject `<script>` in couponCode |

### P3 — Low Risk (verify validator doesn't over-restrict)

| # | Mutation | Risk | Recommended Test |
|---|---------|------|-----------------|
| 4 | `createOrganization` | description and nested addresses | Verify `AT&T Corp. #1` accepted (confirmed GQL-030) |
| 5 | `updateOrganization` | same | Same test |
| 8 | `updatePersonalData` | NameValidationPattern may reject legitimate names | Test: `O'Brien`, `Smith-Jones`, `José María`, `Müller` |
| 9 | `changePassword` | Validator shouldn't restrict password chars | Test: password with `<>!"#$%` |

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Active bugs (BUG) | 3 | VCST-4802, 4803, 4804 |
| Needs testing (NEEDS TEST) | 15 | P1: 4, P2: 5, P3: 4, Other: 2 |
| Not applicable (N/A) | 16 | ID-only or no user input |
| Validated OK | 2 | GQL-030, GQL-032 (partial) |
| Query (not mutation) | 1 | `validateCoupon` — read-only, lower XSS risk |
| **Total mutations** | **40** | (+1 query) |

---

*Generated from: JIRA analysis (VCST-4691, 4802, 4803, 4804), xapi-query-ref.md, sitemap.md, test-cases-api-graphql.md, regression suites (050, 027, 077, 028-030, 039-041)*
