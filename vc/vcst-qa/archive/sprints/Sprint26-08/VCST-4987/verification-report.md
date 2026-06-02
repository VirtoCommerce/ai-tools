# VCST-4987 — Fix Verification Report

## Verdict
**FIX_INCOMPLETE**

The client-side `section.maxLength` validation was removed per PR #2268 as intended. Client-side UI now correctly allows Add-to-cart to be enabled when TEST_QA (7 chars) is selected in a 5-char-max Text section — and no client error is shown. However the **server still enforces `maxLength=5`** via `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` in the `AddItem` mutation, and the cart silently does not receive the line item. This is the PR's acknowledged "Medium Risk" and is observable end-to-end in this environment:

- From the PDP, TEST_QA → click Add-to-cart → **no UI error, no toast, cart remains empty**
- From the cart edit flow (`/products-with-options/configurations/off-road-bike?lineItemId=...`), TEST_QA → click Update cart → **server accepts (ChangeCartConfiguredItem), cart line item shows "Selected text: TEST_QA"**

This inconsistency means the user can place an order containing a configuration value that the server's Add flow would reject — and, separately, a user attempting direct add-to-cart experiences a silent no-op. The new UX (no error message on silent failure) is worse than the original bug, which at least told the user what was wrong.

## Build under test
- Theme: 2.48.0-pr-2268-fe2b-fe2b1cc2 (confirmed in footer Ver string)
- Platform: 3.1022.0 | XCart: 3.1009.0 | Cart: 3.1003.0 | Catalog: 3.1020.0 | Xapi: 3.1006.0
- Verification date: 2026-04-23
- Browser: playwright-chrome (isolated context, Chromium)
- Storefront: https://vcst-qa-storefront.govirto.com
- Account: mutykovaelena@gmail.com (Org: Bence and Family)
- Tester: qa-frontend-expert

## STR Results (3 runs)

Expected: Select TEST_QA preset → Add-to-cart enabled, no error (PASS) → click Add-to-cart → item added to cart (FAIL required for verification).

| Run | Step 5 (no error, button enabled) | Step 6 (item added to cart) | Evidence |
|-----|-----------------------------------|-----------------------------|----------|
| 1 | PASS | **FAIL (silent)** | `screenshots/run1-step5-test_qa-selected.png`, `screenshots/run1-step6-cart-with-testqa.png` (cart empty) |
| 2 | PASS | **FAIL (silent)** | `screenshots/run2-step5-testqa-selected.png`, `screenshots/run2-step6-post-atc.png`, `screenshots/run2-cart-page.png` (cart empty) |
| 3 | PASS | **FAIL (silent)** | `screenshots/run3-step5-testqa-selected.png`, GraphQL log confirms `AddItem` returns `itemsQuantity:0, items:[]` with `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` |

Step 5 passes — the fix from PR #2268 is effective client-side. Step 6 fails consistently because the server enforces maxLength=5 regardless of client bypass, and the UI does not surface the resulting validation error.

## Edit-cart flow
**PASS (with concerns)** — The edit-cart path behaves differently from the direct Add path:

- Added Off-Road Bike with Custom input "abc" (3 chars) → cart line item id `91f7aea4-eba9-4cd5-9f73-ad99bec65d5d` (PASS)
- On the cart-edit URL, switched Custom → TEST_QA radio → toast "The product configuration has been changed" appears → Update cart button becomes active
- Clicked Update cart → `ChangeCartConfiguredItem` mutation returns 200 with `items[0]` present, no validation errors
- Cart page `/cart` → Components list expanded → shows "1. Selected text: TEST_QA"

So the fix works end-to-end in the edit flow, but the server's differing validation between `AddItem` and `ChangeCartConfiguredItem` creates an inconsistency: the user can save TEST_QA into an existing line item, but cannot create a new line item with TEST_QA.

Evidence: `screenshots/edit-cart-switch-to-testqa.png`, `screenshots/edit-cart-after-update-to-testqa.png`, `screenshots/cart-components-expanded.png`.

## Secondary defect (textbox clearing on Custom → preset switch)
**NOT_FIXED** (as expected — out of PR scope).

Observed: with Custom input containing "abc" and then TEST_QA radio selected, the Custom textbox still displays "abc" (see `edit-cart-switch-to-testqa.png` left pane — the greyed Custom row still reads "abc" with 3/5 counter). Report only — not a blocker, but the original bug description lists this as a known issue.

## Regression checks

| # | Check | Result | Evidence / Notes |
|---|-------|--------|------------------|
| BF-1 | Sign-in works | PASS | Landed on `/` with account menu showing "Bence and Family / Elena Mutykova" |
| BF-3 | No new JS console errors on product page or during Add-to-cart | PASS | Only 404s for an unrelated image (`dbda0d851ea04067995d4f0fd8144509_sm`, cached Honda bike JPG). No JS exceptions, no Vue warnings. |
| BF-6 | No 4xx/5xx during normal flows (except server validation returning 200 with errors) | PASS | All `/graphql` calls returned HTTP 200. Validation errors delivered in payload (`data.addItem.validationErrors[]`), not HTTP status. |
| Reg-4 | Custom input "abc" (3 chars, within maxLength) → Add-to-cart succeeds | PASS | `AddItem` → `itemsQuantity:1, items:[{id:91f7aea4...}]`, `validationErrors:[]`. Cart count badge went 0 → 1. See `regression-custom-abc-success.png`. |
| Reg-5 | Required check: leaving Text1 un-selected keeps Add-to-cart disabled | PASS | On initial load of the product page, "Text1 *" section carries "Complete all required options to finalize your selection" and the sidebar Add-to-cart button is `[disabled]` in the accessibility tree. Once any radio (preset or custom with text) is selected the button becomes enabled. |
| Reg-6 | Negative — long custom text "ABCDEFGH" (8 chars) | INFERRED FAIL | Not re-executed explicitly, but the TEST_QA (7 chars) path already demonstrates the server's behavior: the server enforces maxLength=5 and silently rejects oversize values. 8 chars would hit the same `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED`. Note the client textbox caps input at 5 chars via `0/5` counter, so 8 chars cannot physically be typed into Custom input — the PR's Medium Risk materializes only for preset labels ≥6 chars (TEST_QA, New12 is OK, Long text… is 139 chars). |
| Reg-7 | Sanity on another configurable product | NOT_RUN | Skipped; primary evidence is server-side and applies to all configurable products with `maxLength<label.length`. |

Business rules:
- **BL-CART-*** (configured item increments cart count and persists across reload): verified via the abc-custom path — cart badge went 0→1, page reload preserved the line item. **NOT** verified for TEST_QA preset because the item never entered the cart.
- **Required section blocks checkout if empty**: verified — Add-to-cart stays disabled when Text1 is un-selected.

## Server behavior

Direct Add-to-cart from PDP (STR Runs 1–3) fires two mutations per click:

1. `CreateConfiguredLineItem` → HTTP 200, returns computed prices (list 650, sale 650, extended 550) and `id: null`. This is a pricing probe; it does not store anything.
2. `AddItem` → HTTP 200, response body:
   ```json
   {
     "data": {
       "addItem": {
         "id": "907f0bf8-97b3-4c38-a438-eb4b8b6729b9",
         "itemsQuantity": 0,
         "items": [],
         "validationErrors": [
           {"errorCode":"ALL_LINE_ITEMS_UNSELECTED","errorMessage":"All line items unselected. Please select at least one line item."},
           {"errorCode":"CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED","errorMessage":"Configuration section CustomText exceeds the maximum allowed length of 5 characters","objectId":"b7c05532-c5cc-4ebb-b208-bcd36bea4e1a","objectType":"ProductConfigurationSection"}
         ]
       }
     }
   }
   ```

Payload serialization is unchanged (as noted in PR): the preset option value is still sent as `customText: "TEST_QA"` with `type: "Text"`. Field names, shapes, and enum values are stable.

Edit-cart (`?lineItemId=...`) fires `ChangeCartConfiguredItem` instead of `AddItem`, and that mutation **does not** enforce the text maxLength:
```json
{"data":{"changeCartConfiguredItem":{"id":"907f0bf8-...","itemsQuantity":1,"items":[{"id":"91f7aea4-...","sku":"Configuration-INN-69077289","quantity":1,...}]}}}
```
No validationErrors. Cart then shows "Selected text: TEST_QA".

Raw evidence: `tests/Sprint-current/VCST-4987/graphql-response-evidence.json`, `network.har.txt`.

## Console / Network summary
- Console: **0 JS errors** throughout the flow. Only non-blocking 404 image errors and 1 GA4 `ERR_ABORTED` (normal when navigating quickly).
- Network: **0 4xx/5xx on `/graphql`**. All validation failures are delivered as `data.*.validationErrors` in a 200 response, which is the documented VC xAPI pattern — consistent with `business-logic.md`/`platform-patterns.md`.
- Add-to-cart click triggered the expected spinner on the button then reset to enabled state, but no user-facing toast/error for the failure case.

## Recommendation

**REOPEN** with the following asks on the PR / a follow-up ticket:

1. **Surface server validation errors in the UI.** When `addItem` / `createConfiguredLineItem` return `validationErrors[]`, show a toast (or inline error on the section) so users understand why the cart did not update. Today the button loads → unloads → nothing visible changes. This is worse UX than the original client-side block.

2. **Decide the intended contract for text-section `maxLength` vs. preset option labels.** Either:
   - Loosen the server so `AddItem`/`CreateConfiguredLineItem` accept long preset labels (they are admin-authored, not user input, so the maxLength check arguably doesn't apply to them); or
   - Keep the server check but prevent the admin UI from saving preset options whose label exceeds the section maxLength; or
   - Harmonize the frontend so presets with `label.length > section.maxLength` are visually disabled / rejected before submission.

3. **Resolve the `AddItem` vs `ChangeCartConfiguredItem` asymmetry.** Currently the server enforces the text maxLength on add but not on edit. Decide which is canonical and apply consistently.

4. **File a separate ticket for the Custom textbox not clearing on preset switch** (secondary defect noted in original bug; out of this PR's scope).

In the interim, the PR achieves the narrow goal stated in its title — removing the client-side `max_length_exceeded` blocker — but the end-to-end user outcome for the specific TEST_QA-on-off-road-bike case is **still broken**, only now silently instead of with an error.

## Output Artifacts
- `verification-report.md` — this file
- `screenshots/` — 9 screenshots covering STR runs 1-3, edit-cart flow, regression checks
- `graphql-response-evidence.json` — parsed mutation payloads + server responses
- `all-graphql.txt`, `cart-mutations.txt`, `network.har.txt` — raw network capture
- `console.log` — browser console messages
- `pre-atc-snapshot.yml`, `custom-input-snapshot.yml` — accessibility snapshots used for ref resolution
