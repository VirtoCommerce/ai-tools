# VCST-4893: DataTrans Frontend Form Localization — Testing Checklist

## Acceptance Criteria
1. Change frontend language → Datatrans widget should be localized
2. GraphQL payment queries (`initializePayment`, `authorizePayment`, `initializeCartPayment`) must include `StoreId` and `CultureName`

## Frontend Tests (qa-frontend-expert — playwright-chrome)

### AC1: Datatrans Widget Localization
- [ ] **F1**: Default language (EN) — Datatrans payment form displays labels in English
- [ ] **F2**: Switch storefront language to French (FR) → navigate to checkout → select Datatrans → payment form labels/buttons in French
- [ ] **F3**: Switch storefront language to German (DE) → Datatrans form displays in German
- [ ] **F4**: Switch to unsupported language (if any available beyond: en, de, fr, it, es, el, no, da, pl, pt, ru, ja) → Datatrans should fall back to English
- [ ] **F5**: LightBox mode — verify localized labels when language is FR (card number, expiry, CVV fields, error messages)
- [ ] **F6**: Secure Fields mode — verify localized labels when language is FR (if applicable to store config)
- [ ] **F7**: Language persistence — switch to FR, add item, go to checkout, select Datatrans → language persists through the flow
- [ ] **F8**: 3DS OTP page — verify OTP challenge page respects language (if applicable)

### Payment Flow Integrity (regression)
- [ ] **F9**: Complete a Datatrans payment end-to-end in EN (happy path) — Place Order → /checkout/payment → enter card → 3DS OTP (4000) → order created
- [ ] **F10**: Complete a Datatrans payment end-to-end in FR — verify same flow works with localized form

### Business Rules
- [ ] **BL-CHK-004**: Payment retry — if payment declines, user can retry without losing cart/shipping selections
- [ ] **BL-CHK-006**: Order total on confirmation matches checkout total

## Backend Tests (qa-backend-expert — playwright-edge)

### AC2: GraphQL Mutations Include StoreId + CultureName
- [ ] **B1**: Introspect `initializePayment` mutation → verify input type includes `storeId` and `cultureName` fields
- [ ] **B2**: Introspect `authorizePayment` mutation → verify input type includes `storeId` and `cultureName` fields
- [ ] **B3**: Introspect `initializeCartPayment` mutation → verify input type includes `storeId` and `cultureName` fields
- [ ] **B4**: Execute `initializeCartPayment` with `cultureName: "fr"` → verify response succeeds (no validation error)
- [ ] **B5**: Execute `initializeCartPayment` with `cultureName: "en"` → verify response succeeds
- [ ] **B6**: Execute `initializeCartPayment` WITHOUT `cultureName` → verify it still works (backward compatibility)
- [ ] **B7**: Execute `initializePayment` with `cultureName: "fr"` and valid `storeId` → verify Datatrans transaction is initialized with `data-language=fr`
- [ ] **B8**: Verify the Datatrans `data-language` parameter in the response/redirect URL matches the `cultureName` sent

## Edge Cases
- [ ] **E1**: ECL-1.1 — Datatrans requires Place Order → redirect to /checkout/payment (NOT cart page payment form like CyberSource)
- [ ] **E2**: Switch language mid-checkout (after selecting payment but before completing) → Datatrans form should update language
- [ ] **E3**: Datatrans OTP = 4000 for test 3DS verification

## Supported Languages (from Datatrans docs)
en, de, fr, it, es, el, no, da, pl, pt, ru, ja
