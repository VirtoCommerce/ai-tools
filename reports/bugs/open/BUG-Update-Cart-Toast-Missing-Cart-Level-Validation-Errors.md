# BUG: Update-cart silently no-ops when server rejects with cart-level `validationErrors[]` — no toast surfaced

## Status: READY_TO_SUBMIT

**Severity:** Medium (UX gap — silent failure)
**Component:** Storefront Frontend / Cart / Configurable Products / `add-to-cart.vue` validation surface
**Browser:** Playwright Chrome (en-US, 1920x1080)
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1025.0
**Theme Version:** 2.48.0-pr-2272-f40a-f40a2483
**Module Versions:** VirtoCommerce.XCart 3.1011.0-pr-113-b17e, VirtoCommerce.Cart 3.1003.0, VirtoCommerce.Catalog 3.1020.0, VirtoCommerce.Xapi 3.1006.0
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-04-29
**Reported By:** QA Agent (qa-frontend-expert) — surfaced during VCST-4987 round-2 verification
**Discovered in:** VCST-4987 (Configurable products preset maxLength) verification round 2

## Summary

When the user submits an Update on a configurable cart line with a `customText` that exceeds the section's `maxLength` and does not match any preset, the server (XCart `3.1011.0-pr-113-b17e`, post-PR-#113) correctly rejects the change and returns a cart-level `validationErrors[]` entry with `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED`. However, the storefront raises **no toast and no inline error**. The user sees the Update Cart click silently do nothing — the persisted state remains the prior valid value, but the user is given no feedback on why their submission was ignored.

The root cause appears to be in `client-app/shared/cart/components/add-to-cart.vue` `getConfigurableValidationErrors()` — it filters to errors whose `objectId` matches `product.id` or `lineItem.id`, but the cart-level error for this case has `objectType: "ProductConfigurationSection"` and `objectId` = the section UUID, so it is filtered out. Additionally, `items[].validationErrors[]` for the affected line is `[]` (server only returns the cart-level error), so the secondary read path also yields nothing.

## Steps to Reproduce

1. Sign in to https://vcst-qa-storefront.govirto.com as the main storefront user.
2. Navigate to `/products-with-options/configurations/off-road-bike`.
3. Add the configurable product to cart (e.g., select TEST_QA preset and click Add-to-cart).
4. Open the cart (or the configured line in cart) and click Edit on the configured line.
5. In the Text1 Custom-input field, type a 7-character non-preset value (e.g., `ZZZZZZZ`).
6. Observe the inline counter (`7/5`) — purely visual, does not block.
7. Click Update Cart.

## Expected Result

- A user-visible toast (or inline error banner) appears explaining that the Update was rejected because the customText exceeds the maximum allowed length.
- Cart state remains unchanged (server rejected the update — confirmed working).
- User can correct the value and retry.

## Actual Result

- Update Cart click appears to "do nothing" — no toast, no inline banner, no console message visible to the user.
- Cart state correctly remains at the prior valid value (TEST_QA), confirmed by re-opening the line.
- The only signal something is wrong is the inline `7/5` counter on the input field — easy to miss, and ambiguous (the user does not know the click was processed and rejected).
- Under the hood: `ChangeCartConfiguredItem` returns HTTP 200 with a payload containing:
  ```json
  "validationErrors": [{
    "errorCode": "CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED",
    "errorMessage": "Configuration section CustomText exceeds the maximum allowed length of 5 characters",
    "objectId": "b7c05532-c5cc-4ebb-b208-bcd36bea4e1a",
    "objectType": "ProductConfigurationSection"
  }],
  "items": [{ ..., "validationErrors": [], "configurationItems": [{ "customText": "TEST_QA" }] }]
  ```

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `add-to-cart.vue#getConfigurableValidationErrors` filters cart-level errors by `objectId === product.id` or `objectId === lineItem.id` — but `objectId` here is the section UUID, so the error is dropped. No toast fired. |
| 2. Backend Admin | N/A | Not applicable. |
| 3. GraphQL xAPI | PASS | `ChangeCartConfiguredItem` correctly returns the cart-level validation error and does NOT persist the invalid value. Server symmetry working as intended. |
| 4. Platform REST | N/A | Cart mutations go through XCart GraphQL only. |

**Owning layer:** Layer 1 (vc-frontend — `add-to-cart.vue` toast surface).

## Root Cause Analysis

`getConfigurableValidationErrors()` in `client-app/shared/cart/components/add-to-cart.vue` (introduced by PR #2272):

```ts
const cartValidationErrors =
  updatedCart?.validationErrors
    ?.filter(
      (error) =>
        (error.objectId === product.value.id && error.objectType === ValidationErrorObjectType.CatalogProduct) ||
        (lineItemId && error.objectId === lineItemId && error.objectType === ValidationErrorObjectType.LineItem),
    )
    .map(translate)
    .filter(Boolean) ?? [];
```

The filter recognizes `CatalogProduct` and `LineItem` object types but not `ProductConfigurationSection` (the actual `objectType` returned by the XCart `ConfigurationItemValidator` for a section-level violation). The cart-level error is dropped before `displayErrorMessage()` can be called.

## Suggested Fix

Either:
1. **Frontend:** extend `getConfigurableValidationErrors()` to also accept errors whose `objectType` is `ProductConfigurationSection` and whose `objectId` matches one of the product's known section IDs. This keeps the filter scoped to "errors relevant to this configurable product" while admitting the section-level violation.
2. **Backend:** additionally surface the section-level error on `items[].validationErrors[]` so the existing items-based path picks it up. This would also help downstream consumers.

Option 1 is cheaper and more localized.

## Impact

- **User impact:** A user attempting to correct an over-length custom value via the cart-edit flow gets no feedback on why their submission was ignored. This is a worse UX than client-side blocking — the click appears broken.
- **Severity rationale:** Medium — the persisted state remains correct (server symmetry works), so there's no data integrity issue. But the silent failure undermines the recovery path for the very flow VCST-4987's server-side fix targets.
- **Workaround:** None at the user level. The inline `N/maxLength` counter on the Custom input is the only visual cue.

## Evidence

Captured during VCST-4987 round-2 verification at `tests/Sprint-current/VCST-4987/run-2-2026-04-29/`:
- `screenshots/edit-cart-overlength-toast.png` — viewport during/after the Update click; no toast region populated
- `screenshots/edit-cart-overlength-toast-fullpage.png` — full-page screenshot confirming no toast or inline error anywhere
- `graphql-evidence.json` — captured `ChangeCartConfiguredItem` response with the cart-level `validationErrors[0]` containing `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` and `objectType: "ProductConfigurationSection"`
- `network-graphql-overlength.txt` — full mutation request + response

## References

- Parent ticket: VCST-4987 (verified 2026-04-29 with this gap noted)
- Round-2 verification: `tests/Sprint-current/VCST-4987/run-2-2026-04-29/verification-report.md` (Checklist #5 PARTIAL)
- Frontend code: `client-app/shared/cart/components/add-to-cart.vue` `getConfigurableValidationErrors()`
- Server validator: `vc-module-x-cart` `ConfigurationItemValidator.ValidateSectionTypeText` (returns `ProductConfigurationSection` `objectType`)
