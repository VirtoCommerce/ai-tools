# VCST-4987 Verification Report — Run 2 (2026-04-29)

## Header

- **Ticket:** VCST-4987 — `[Configurable products] The incorrect validation maxLength error disables Add/Update cart`
- **Severity:** High (Bug)
- **Verifier:** qa-frontend-expert (Coffee shop / Elena Mutykova on vcst-qa)
- **Run:** Round 2 (first verification on 2026-04-23 returned FIX_INCOMPLETE)
- **Date / Time:** 2026-04-29 12:45-13:05 UTC
- **Browser / Locale:** Playwright Chrome / en-US (1920x1080)
- **Storefront URL:** https://vcst-qa-storefront.govirto.com
- **Theme version:** `2.48.0-pr-2272-f40a-f40a2483` (head sha `f40a2483`) — vc-frontend PR #2272
- **XCart version:** `3.1011.0-pr-113-b17e` (head sha `b17e8778`) — vc-module-x-cart PR #113
- **Platform:** 3.1025.0  ·  **Cart:** 3.1003.0  ·  **Catalog:** 3.1020.0  ·  **xAPI:** 3.1006.0
- **Verdict:** **VERIFIED_WITH_NOTES**

---

## Summary

The TEST_QA preset selection no longer triggers a false maxLength validation. All three STR runs PASS end-to-end. Server-side symmetry (XCart PR #113) is confirmed: the update path (`changeCartConfiguredItem`) now validates `customText` and rejects oversize values without persisting them, returning `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` in the cart-level `validationErrors[]`. The known frontend "clear-on-switch" defect for `section-text-fieldset.vue` is fixed. **One residual concern (note, not blocker):** when the server rejects an oversize update, no user-visible toast/inline error is surfaced — so the user does not learn why their Update silently no-ops, even though the persisted state remains correct. See "Notes" below.

---

## STR Results — 3-of-3 runs

| # | Step | Run 1 | Run 2 | Run 3 |
|---|------|-------|-------|-------|
| 1 | Sign in as main storefront user | PASS | PASS | PASS |
| 2 | Navigate to /products-with-options/configurations/off-road-bike | PASS | PASS | PASS |
| 3 | Expand Text1 (required, maxLength=5, with TEST_QA preset, label = 7 chars) | PASS | PASS | PASS |
| 4 | Select TEST_QA radio (no Custom typing) | PASS | PASS | PASS |
| 5 | Section state CLEAN, Add-to-cart button ENABLED, no maxLength error | PASS (`run1-step5-…`) | PASS (`run2-step5-…`) | PASS (`run3-step5-…`) |
| 6 | Click Add-to-cart → cart 0→1, button → "UPDATE CART", URL gains `lineItemId`, header now shows TEXT1 = "TEST_QA" | PASS (`run1-step6-…`) | PASS (`run2-step6-…`) | PASS (`run3-step6-…`) |
| 7 | Cart components list shows "1. Selected text: TEST_QA" | PASS (verified between runs) | PASS | PASS |

Cart cleared between runs via Cart > CLEAR CART > YES. Result: 3/3 STR runs pass.

### Generated lineItem IDs (one per run)
- Run 1: `db7c9ed4-4b4d-435d-b270-6abbbae43c83`
- Run 2: `9b1369bb-0e7f-439e-8fbd-6c82c559f324`
- Run 3: `cd1d75d8-56ab-4aea-86f2-67e804086eaf`

---

## Verification Checklist (10 items)

### Fix confirmation

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | STR runs 1-3: TEST_QA preset adds to cart end-to-end (3/3) | **PASS** | screenshots/run1-step6, run2-step6, run3-step6 |
| 2 | `addItem` / `ChangeCartConfiguredItem` response contains no `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` for preset selection | **PASS** | network-graphql-run1.txt; per RUN 1, mutation response was 200 OK with line item created and customText=`TEST_QA` (cart-level `validationErrors: []` for the TEST_QA submission) |
| 3 | Edit-cart parity: line added via Custom "abc" → switch to TEST_QA in edit mode → Update succeeds; cart shows "Selected text: TEST_QA" | **PASS** | screenshots/edit-cart-update-success.png; cart text "1. Selected text: TEST_QA" verified after Update |

### Server symmetry (Ask #4 — update path now validates)

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 4 | Edit-cart with invalid customText (7-char non-preset, e.g. `ZZZZZZZ`/`YYYYYYY`/`WWWWWWW`): server REJECTS with `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` instead of silently persisting | **PASS** | graphql-evidence.json — captured response: `validationErrors[0].errorCode = "CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED"`, `errorMessage = "Configuration section CustomText exceeds the maximum allowed length of 5 characters"`. The persisted `configurationItems[0].customText` remained `TEST_QA` (the prior valid value) — confirming no persistence of invalid input. Both repeated submissions returned the same result. |
| 5 | Validation-error surface (Ask #3): when item #4 fires, the UI shows a toast / inline error referencing the maxLength rule. Cart state for the line should remain unchanged. | **PARTIAL** | screenshots/edit-cart-overlength-toast.png + edit-cart-overlength-toast-fullpage.png. The cart state correctly remains at "Selected text: TEST_QA" (server rejected the update — see #4). However, no user-visible toast/inline error appears in the Notifications region after the Update click. The MutationObserver hook captured `_toastSeen: []` across two attempts. The fix description states `add-to-cart.vue` uses `getConfigurableValidationErrors()` to read `validationErrors[]` from the cart response — this path may be reading from `items[].validationErrors[]` (which is `[]` here) instead of the cart-level `validationErrors[]` (which has the error). User-visible affordance: the inline `7/5` overlength counter on the input is the only signal that something is wrong; nothing tells the user the Update was rejected. **Severity: Medium UX gap, not a regression vs. round-1 behavior** (the original bug was about misclassification, not about toast surfacing). |

### Regression (BF + adjacent)

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 6 | Custom input "abc" (3 chars): Add still works, cart count 0→1, no errors | **PASS** | Verified in Checklist #6 step (cartText="1\nCart" after add) |
| 7 | Required-section empty: Add-to-cart stays disabled | **PASS** | `addToCartDisabled: true` confirmed on fresh page load with Text1 not selected |
| 8 | No new console errors during STR; no 4xx/5xx in HAR for cart graphql endpoints | **PASS** | network.har.txt — only 2 unrelated 404s (image CDN + a CMS file `/api/files/dbda0d851...`). No 4xx/5xx for `/graphql` / `/xapi/graphql`. Console errors are all pre-existing (Apollo `addOrUpdateCartShipment` resolver error and unrelated 404 image loads). |
| 9 | Custom textbox clear on switch: type "abc" in Custom input → switch to TEST_QA → textbox is empty (not retaining "abc") | **PASS** | screenshots/custom-textbox-cleared-on-switch.png — after switching from Custom("abc") → TEST_QA, the input field is `value=""` and counter is `0/5`. Confirms `section-text-fieldset.vue` clear-on-switch fix. |

### Edge case

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 10 | Preset label longer than maxLength edge: TEST_QA = 7 chars vs maxLength = 5. Server `IsPredefinedTextOptionSelected()` should bypass maxLength as long as `customText` exactly matches a known option text. | **PASS** | All 3 STR runs prove the preset is accepted regardless of label length (7 > 5). Additionally, the radio group shows other presets even longer than 5 chars ("Try add text more than 5", "Long text for validation. TEXT…") — they are visible and selectable. The DOM-rendered Custom input counter shows `maxLength=5`, confirmed. |

**Final tally:** 9 PASS / 1 PARTIAL / 0 FAIL / 0 BLOCKED.

---

## Network / GraphQL Evidence

- `network.har.txt` — full network log for the verification session (no 4xx/5xx for graphql)
- `network-graphql-run1.txt` — GraphQL traffic during STR Run 1 (request bodies for add-to-cart)
- `network-graphql-overlength.txt` — captured `ChangeCartConfiguredItem` mutation with customText="ZZZZZZZ"
- `graphql-evidence.json` — response payloads from `ChangeCartConfiguredItem` for the overlength edit path; shows the cart-level `validationErrors[]` containing `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` and the configured line item's `customText` preserved as `TEST_QA`
- `captured-responses.txt` — first-pass capture (subset of graphql-evidence.json)
- `console.log` — full console messages; only pre-existing errors observed (Apollo `addOrUpdateCartShipment` resolver, image 404s)

### Authoritative response excerpt (overlength edit)
```json
"validationErrors": [
  {
    "errorCode": "CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED",
    "errorMessage": "Configuration section CustomText exceeds the maximum allowed length of 5 characters",
    "objectId": "b7c05532-c5cc-4ebb-b208-bcd36bea4e1a",
    "objectType": "ProductConfigurationSection"
  }
],
"items": [{
  "id": "bb66f96d-99a3-48a7-8915-7ee5b060d647",
  "validationErrors": [],
  "configurationItems": [
    { "customText": "TEST_QA", "type": "Text" }
  ]
}]
```

---

## Side Effects

- **Other configurable products:** spot-checked **Vintage Wedding cake** (`/product/c94d730a-…`). Add-to-cart works (cart count 0→1, no errors). No regression introduced by the shared `add-to-cart.vue` change. *PASS*
- **Toast/error message wording:** the raw server message is `"Configuration section CustomText exceeds the maximum allowed length of 5 characters"`. If the toast were surfaced, this user-facing text would be technical — recommend design-system review (not a blocker, per ticket guidance).
- **Custom-input "0/5" counter behavior:** the counter visually turns to `7/5` on overlength typing — that *is* a real-time visual cue, but it does not gate Update Cart on the client. Server-side rejection is the only enforcement.

---

## Residual / Open Concerns (not blockers)

1. **Validation-error surface gap (Checklist #5):** server returns `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` on the cart-level `validationErrors[]` after a rejected `changeCartConfiguredItem`, but the storefront does NOT raise a toast or inline error. The user sees the Update Cart click "do nothing" — the cart state silently remains at the previous valid value. Recommend a follow-up bug to wire the existing toast surface (`add-to-cart.vue#getConfigurableValidationErrors`) to the cart-level errors, not just `items[].validationErrors[]`. Severity: Medium UX, not a regression of VCST-4987's original symptom.

2. **Edit-mode pre-fill of existing customText:** when entering edit mode for a line item that was added via Custom input "abc", the Custom input is rendered empty and no radio is checked (despite the line item's `customText` being "abc" server-side). The user has to re-pick a radio and re-type. This may be a separate UX defect in `useConfigurableProduct.ts` initialization. Out of scope for VCST-4987 verification.

---

## Business Rules Verified

- **BL-CART-***: configurable-line-item add returns full cart (`itemsQuantity: 1`, items[0] with the configured line) — verified end-to-end.
- **BL-CHK-006** (Order total formula): subtract reflects discount and tax — `subTotal: 650, discountTotal: 100, taxTotal: 110, total: 660` — coherent with placedPrice and discount config.
- **VCST-4987 invariant** (preset bypass): `IsPredefinedTextOptionSelected()` correctly bypasses `maxLength` when `customText` exactly matches a known preset's `text` (7-char `TEST_QA` accepted under maxLength=5).
- **VCST-4987 server symmetry**: `CartAggregate.UpdateConfiguredLineItemAsync` now runs `_configurationItemValidator.ValidateAsync` and returns errors instead of persisting — verified by the response evidence (cart unchanged; validation error returned).

## Business Rules Violated

- None at the BL level. The lone open item (toast surfacing) is a UX implementation gap, not a business-logic violation.

---

## Verdict

**VERIFIED_WITH_NOTES** — All STR pass 3/3. The original VCST-4987 P1 bug is fixed end-to-end (TEST_QA preset adds and updates). The asks #3 (frontend reads validationErrors) and #4 (server symmetry) are both implemented, with Ask #3 partially complete (server returns the error and frontend correctly does not persist invalid state, but the toast surfacing for the rejection is silent). No regression of any other configurable-product flow. Recommend acceptance with a follow-up ticket for the toast-surfacing UX.

## Recommendation to Orchestrator

- Mark VCST-4987 as **Verified / Ready for Closure** (the original symptom — disabled Add-to-cart on TEST_QA selection — no longer reproduces).
- File a **separate follow-up bug** (medium severity, UX) for the Update-cart toast not surfacing the cart-level `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` error.
- Optional: file a separate UX-tweak for edit-mode failing to pre-fill the existing customText / radio selection.

---

## Evidence file index (relative to `tests/Sprint-current/VCST-4987/run-2-2026-04-29/`)

```
verification-report.md                            (this file)
verification-summary.json                         (machine-readable summary)
console.log                                       (browser console errors, 14kb)
network.har.txt                                   (network requests summary, 9kb)
network-graphql-run1.txt                          (graphql requests during STR Run 1)
network-graphql-overlength.txt                    (graphql requests during overlength edit)
graphql-evidence.json                             (captured ChangeCartConfiguredItem responses, redacted)
captured-responses.txt                            (first-pass capture, subset of graphql-evidence.json)
screenshots/
  ├── 00-initial-cart-state.png                   (pre-clear cart with apollo error)
  ├── run1-step5-preset-selected-button-enabled.png
  ├── run1-step6-cart-count-1.png
  ├── run2-step5-preset-selected-button-enabled.png
  ├── run2-step6-cart-count-1.png
  ├── run3-step5-preset-selected-button-enabled.png
  ├── run3-step6-cart-count-1.png
  ├── edit-cart-update-success.png                (Checklist #3)
  ├── edit-cart-overlength-toast.png              (Checklist #5 — viewport)
  ├── edit-cart-overlength-toast-fullpage.png     (Checklist #5 — full page; no toast visible)
  └── custom-textbox-cleared-on-switch.png        (Checklist #9)
```
