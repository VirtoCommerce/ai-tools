# BUG: addItem mutation accepts whitespace-only customText in required Text1 section (server validation bypass)

## Status: READY_TO_SUBMIT (filed as VCST-4988)

**Severity:** High
**Component:** GraphQL xAPI / Configurable Products / Cart (VirtoCommerce.XCart)
**Browser:** Firefox (playwright-firefox)
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1022.0
**Theme Version:** 2.48.0-pr-2265-b40c-b40c36d5
**Module Versions:** VirtoCommerce.XCart 3.1009.0, VirtoCommerce.Cart 3.1003.0, VirtoCommerce.Catalog 3.1020.0, VirtoCommerce.Xapi 3.1006.0
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-04-22
**Reported By:** QA Agent (qa-testing-expert)

## Summary

The off-road-bike configurable product has a required Text1 section (free-text, maxLength=5). The storefront UI correctly blocks Add-to-cart when Text1 is empty or whitespace-only. However, the GraphQL `addItem` mutation **silently accepts `customText: "     "` (whitespace-only)** and persists it as a valid line item (`validationErrors: []`, HTTP 200). An empty string (`""`) is correctly rejected with `CONFIGURATION_SECTION_CUSTOM_TEXT_REQUIRED`, so the server is checking `string.IsNullOrEmpty` instead of `string.IsNullOrWhiteSpace`. The resulting cart line renders as `Components list › 1. Selected text:` (blank), and checkout is not reliably blocked.

## Steps to Reproduce

1. Log in to `https://vcst-qa-storefront.govirto.com` as the main storefront user from .env.
2. Navigate to `/products-with-options/configurations/off-road-bike`.
3. Open DevTools console and send a direct `addItem` GraphQL mutation with `configurationSections: [{ sectionId: "b7c05532-c5cc-4ebb-b208-bcd36bea4e1a", type: "Text", customText: "     " }]` (five spaces).

   ```js
   const auth = JSON.parse(localStorage.getItem('auth'));
   fetch('/graphql', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.access_token },
     body: JSON.stringify({
       operationName: 'AddItem',
       variables: { command: {
         storeId: 'B2B-store', userId: '<your userId>',
         cultureName: 'en-US', currencyCode: 'USD',
         productId: '958d0762-404c-4a6f-a45a-46ed4943f5f0',
         quantity: 1,
         configurationSections: [{
           sectionId: 'b7c05532-c5cc-4ebb-b208-bcd36bea4e1a',
           type: 'Text',
           customText: '     '
         }]
       }},
       query: 'mutation AddItem($command: InputAddItemType!) { addItem(command: $command) { id itemsQuantity items { id configurationItems { id customText } } validationErrors { errorCode errorMessage } } }'
     })
   }).then(r => r.json()).then(console.log);
   ```

4. Reload `/cart` and expand Components list for the Off-Road Bike line.

## Expected Result

- Server rejects whitespace-only `customText` with the same `CONFIGURATION_SECTION_CUSTOM_TEXT_REQUIRED` error it returns for an empty string.
- No line item is created.
- Cart state remains unchanged.

## Actual Result

- HTTP 200, `validationErrors: []`.
- Line item is created with `customText: "     "`.
- Cart renders `Components list › 1. Selected text:` (empty, no visual marker).
- Cart page allows continued navigation; the required-section invariant is violated silently.

## Evidence

All screenshots under `reports/bugs/screenshots/`:

- `off-road-bike-text1-01-baseline.png` — PDP baseline
- `off-road-bike-text1-02-expanded.png` — Text1 section expanded (maxLength=5, Custom + TEST_QA)
- `off-road-bike-text1-03-whitespace-5-chars.png` — UI client-side blocks whitespace correctly
- `off-road-bike-text1-04-whitespace-blocked-clientside.png` — zoom: Add-to-cart disabled with whitespace
- `off-road-bike-text1-08-cart-with-whitespace-item.png` — cart with the whitespace-only line item (server bypass succeeded)
- `off-road-bike-text1-09-cart-components-expanded.png` — key evidence: `1. Selected text:` (blank) next to a valid line showing `1. Selected text: abc`
- `off-road-bike-text1-05-network-addItem.txt` — network log

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | PASS | Vue form correctly disables Add/Update-cart on whitespace-only input. "Section is required" shown. Client-side trim works. |
| 2. Backend Admin | N/A | customText is cart-scoped; not surfaced in Admin cart UI. |
| 3. GraphQL xAPI | **FAIL** | `addItem` with `customText: "     "` returns HTTP 200, `validationErrors: []`; line item persisted. Empty-string is correctly rejected — the bug is whitespace-only. |
| 4. Platform REST | N/A | Cart mutations flow through XCart GraphQL only. |

**Owning layer:** Layer 3 (GraphQL xAPI — `VirtoCommerce.XCart` resolver for `addItem` / ConfigurationSectionInput validation)

## Root Cause Analysis

- **Suspected file area:** `VirtoCommerce.XCart` — CartAggregate / ConfigurationSection validation code path that validates `InputAddItemType.configurationSections[].customText` against `ProductConfigurationSection.isRequired`.
- **Suspected cause:** `string.IsNullOrEmpty(customText)` used where `string.IsNullOrWhiteSpace(customText)` is required. The neighbouring empty-string and max-length checks already work correctly; only the whitespace case leaks.
- **Application Insights:** no server-side exception for the successful bypass (expected — HTTP 200).
- **Related fix location:** same CartAggregate input-validation cluster that owns BUG-changeCartConfiguredItem-Accepts-Invalid-SectionId.md. Suggested patch is narrow and low-risk.

## Impact

- **Data integrity:** Cart can contain configurable line items with invalid required-section state.
- **Checkout:** Because the line persists with `validationErrors: []`, downstream checkout/order flows may accept the incomplete configuration, producing an order with a blank required section value.
- **Usability:** Affected carts display `Selected text:` with no visible value, confusing the user.
- **Automation surface:** Any B2B customer using the storefront GraphQL API directly (quote scripts, bulk import, SDK integrations) can create corrupted carts bypassing UI validation.

## References

- JIRA: **VCST-4988** — https://virtocommerce.atlassian.net/browse/VCST-4988
- Companion: BUG-OffRoadBike-Text1-Preset-Option-Unreachable.md (frontend, same section) — **VCST-4987**
- Related family: BUG-changeCartConfiguredItem-Accepts-Invalid-SectionId.md, BUG-Configurable-Toast-Save-Bypasses-Required-Section-Validation.md
