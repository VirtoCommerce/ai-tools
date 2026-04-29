# BUG: Off-Road Bike — Text1 preset option "TEST_QA" unreachable (false maxLength error blocks Add/Update cart)

## Status: FIXED (VCST-4987 — verified 2026-04-29)

## Resolution

- **Verified:** 2026-04-29 (round 2)
- **Verifier:** qa-frontend-expert / Elena Mutykova on vcst-qa
- **Verdict:** VERIFIED_WITH_NOTES — STR 3/3 PASS; original P1 symptom no longer reproduces
- **Fix in:**
  - vc-frontend PR #2272 (`feat(VCST-4987): add validation error handling for configurable products`) — theme `2.48.0-pr-2272-f40a-f40a2483`
  - vc-module-x-cart PR #113 (`VCST-4987: align configuration validation between add and update paths`) — XCart `3.1011.0-pr-113-b17e`
- **Server fix scope:** new `IsPredefinedTextOptionSelected()` helper in `ConfigurationItemValidator.ValidateSectionTypeText` bypasses `maxLength` when `customText` exactly matches a preset option's `text`. `CartAggregate.UpdateConfiguredLineItemAsync` now also runs the validator, restoring AddItem ↔ ChangeCartConfiguredItem symmetry.
- **Frontend fix scope:** `add-to-cart.vue` adds `getConfigurableValidationErrors()` to read cart `validationErrors[]`; `section-text-fieldset.vue` clears the Custom textbox on switch to a preset (the secondary defect in this report).
- **Caveat:** the canonical fix proposed here (serialize preset by `optionId`) was NOT implemented; instead a server-side label-match workaround handles the case. Caveat documented: cannot disambiguate duplicate preset labels within a section. Acceptable for this fix; flagged for future schema work.
- **Evidence:** `tests/Sprint-current/VCST-4987/run-2-2026-04-29/` (verification-report.md, screenshots, graphql-evidence.json)
- **Follow-up filed:** `BUG-Update-Cart-Toast-Missing-Cart-Level-Validation-Errors.md` — Medium UX (toast does not surface cart-level validation errors on rejected Update)

**Severity:** High (P1)
**Component:** Storefront Frontend / Configurable Products / Section rendering (vc-frontend)
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

On the off-road-bike configurable product, the Text1 required section offers two choices: **Custom input** (free text, maxLength=5) and **TEST_QA** (predefined option). Selecting the TEST_QA preset option leaves the section in an error state ("Text must not exceed 5 characters") and **disables Add-to-cart / Update-cart**. The only preset option offered for this required section is therefore unreachable via the UI — users can only configure this product via the Custom input path.

Root-cause hypothesis: the frontend serializes the preset option by placing its display label ("TEST_QA") into the `customText` field rather than referencing the preset's `optionId`. Because "TEST_QA" is 7 characters and the section's `maxLength` is 5, the client-side validator flags it as over-length.

## Steps to Reproduce

1. Log in to `https://vcst-qa-storefront.govirto.com` as the main storefront user from .env.
2. Navigate to `https://vcst-qa-storefront.govirto.com/products-with-options/configurations/off-road-bike`.
3. Expand the Text1 section.
4. Select the **TEST_QA** radio option (do not type anything).
5. Observe the section state and the Add-to-cart button.

## Expected Result

- TEST_QA radio stays selected.
- Section validation is satisfied (green/clean state).
- Add-to-cart button becomes enabled.
- On click, `addItem` mutation fires with the configuration section referencing the TEST_QA option (e.g., via `optionId`), and the line item is created.

## Actual Result

- TEST_QA radio is selected.
- Section shows error **"Text must not exceed 5 characters"**.
- Add-to-cart button is **disabled**.
- Preview `CreateConfiguredLineItem` call serializes the payload as `configurationSections: [{ sectionId: "b7c05532-c5cc-4ebb-b208-bcd36bea4e1a", customText: "TEST_QA", type: "Text" }]` — the preset option is being sent as `customText`, which violates the section's `maxLength=5`.
- Same defect reproduces in the **edit-cart flow**: when a line was added with Custom input and the user edits the line and switches to TEST_QA, Update-cart is disabled and no `changeCartConfiguredItem` mutation fires.

### Secondary defect (same section, same component)

Switching **Custom input → TEST_QA** does **not clear the Custom textbox**. The UI shows TEST_QA selected while the previous Custom text remains in the textbox, contributing to the stale maxLength error and confusing the user. Expected: switching to a preset option should clear the free-text field.

## Evidence

All screenshots under `reports/bugs/screenshots/`:

- `off-road-bike-text1-switch-01b-testqa-selected-addcart-disabled.png` — TEST_QA selected, Add-to-cart disabled with false maxLength error
- `off-road-bike-text1-switch-02b-fresh-testqa-addcart-blocked.png` — fresh session, TEST_QA only, Add-to-cart blocked (confirms not a stale-state issue)
- `off-road-bike-text1-switch-04-edit-custom-to-testqa-update-blocked.png` — edit-cart flow: switch Custom→TEST_QA, Update-cart disabled
- `off-road-bike-text1-switch-01-custom-to-testqa-blocked.png` — stale textbox evidence (Custom "abc" remains after switching to TEST_QA)
- `off-road-bike-text1-switch-s3-addItem-payload.txt` — network capture of `CreateConfiguredLineItem` with `customText: "TEST_QA"` payload

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | UI serializes preset option label as `customText`; client validator blocks Add-to-cart with false maxLength error. Section preset options are effectively unreachable. |
| 2. Backend Admin | N/A | Configuration section definition is set up in Admin (option TEST_QA, maxLength=5). Admin data itself is consistent; the bug is in how the storefront consumes it. |
| 3. GraphQL xAPI | PASS | `addItem` correctly rejects `customText="TEST_QA"` with `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` — server-side validation is working as intended. The bug is that the frontend is sending the wrong shape. |
| 4. Platform REST | N/A | Cart mutations go through XCart GraphQL only. |

**Owning layer:** Layer 1 (vc-frontend — section rendering / payload serialization for configurable product preset options)

## Root Cause Analysis

- **Suspected component:** `vc-frontend` configurable-product section component. When a preset option is selected in a Text-type section, the component likely copies the option's display label into `customText` instead of setting a distinct `optionId` / selected-option reference in the payload.
- **Why server rejects it:** the xAPI `addItem` resolver applies `maxLength` validation against `customText` regardless of whether the string came from user input or a preset option. Since preset option labels are not bounded by the section's `maxLength`, any preset label longer than maxLength becomes unreachable.
- **Likely fix:** when a preset option is selected, the frontend should emit the payload referencing the option's identifier (not its text label), and the xAPI input schema should model preset selection separately from free-text input. The section UI should also clear the custom textbox when the user switches to a preset option.
- **Related bugs (same area):** BUG-Configurable-Toast-Save-Bypasses-Required-Section-Validation.md, BUG-changeCartConfiguredItem-Accepts-Invalid-SectionId.md, and the companion bug BUG-OffRoadBike-Text1-Whitespace-Bypass.md — together these indicate systemic weakness in configurable-section input handling.

## Impact

- **User impact:** The preset option offered by the merchant for this required section is completely unusable. B2B customers configuring Off-Road Bike are forced into the Custom input path (≤5 chars) — losing the predefined shortcut workflow.
- **Merchant impact:** Any catalog admin defining a Text-type section preset option with a label longer than the section's maxLength will create an unreachable option on the storefront. This makes the Text-type preset feature fragile by design.
- **Workaround:** Choose "Custom input" and type a ≤5-character value.

## References

- JIRA: **VCST-4987** — https://virtocommerce.atlassian.net/browse/VCST-4987
- Related: BUG-OffRoadBike-Text1-Whitespace-Bypass.md (companion, server-side) — **VCST-4988**
- Related: BUG-Configurable-Toast-Save-Bypasses-Required-Section-Validation.md (wedding-cake, similar family)
- Related: BUG-changeCartConfiguredItem-Accepts-Invalid-SectionId.md (xAPI, same family)
