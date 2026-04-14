# BUG: Toast "Save" button bypasses required-section validation and persists incomplete configuration

**JIRA:** VCST-4713 (related feature — Conditional sections)
**Severity:** P1 / High
**Environment:** QA — https://vcst-qa-storefront.govirto.com
**Build:** Theme 2.46.0-pr-2225-c823 | Catalog 3.1017.0-pr-871 | XCart 3.1006.0-pr-105
**Browser:** Firefox (playwright-firefox)
**Date found:** 2026-04-13
**Reporter:** qa-testing-expert

## Summary

When a configurable product with conditional required sections has a required section empty, the **Save** button inside the "configuration has been changed" toast notification fires `ChangeCartConfiguredItem` and persists the incomplete configuration to the cart. The main **Update cart** button correctly enforces validation and blocks the mutation — but the toast Save button bypasses that validation, leading to an invalid cart state that blocks checkout.

## Steps to reproduce

1. Log in to the storefront (any org account).
2. Navigate to `/products-with-options/wedding-cakes/sections-with-conditions-wedding-cake`.
3. Select an option in **Base** (e.g., "Top: White / Bottom: White") and **Creme** (e.g., "Buttercreme style: Peach and Blue"). Leave Message untouched.
4. Click **Add to cart**. Line item is created at $93; URL gains `?lineItemId=...`; button label changes to **Update cart**.
5. Still on the PDP, select an option in **Message** (e.g., "Standard Message Tag" $12).
6. Observe: the **Custom text required** section (isRequired=true, type=Text, no predefined options) appears empty with validation error "Section is required".
7. A **toast notification** appears: *"The product configuration has been changed. You can always save it later by clicking 'Update cart' button."* — with a **Save** button inside the toast.
8. Click **Save** in the toast (NOT the main Update cart button).

## Actual result

- `ChangeCartConfiguredItem` mutation fires → **HTTP 200**, no errors in response.
- Payload includes 3 sections (Base, Creme, Message) — **Custom text required section is omitted** despite `isRequired: true`.
- PDP navigates from `?lineItemId=...` back to the base URL → edit mode exits, Update cart button reverts to Add to cart, all selections visually clear. No success toast.
- Cart line item is updated to $105 with Message included.
- Cart page shows a warning: **"Required sections are missing"**; **Place order is disabled**; a "Something went wrong" message appears.

## Expected result

Either:
- The toast Save button should run the same client-side validation as the main Update cart button and block the mutation until all visible required sections are filled, OR
- The server (`ChangeCartConfiguredItem` resolver) should reject the partial configuration with a validation error when a required section is missing.

Ideally **both** (defense in depth). Additionally, the toast should surface a success/error state rather than silently resetting the PDP.

## Evidence

Tests/Sprint-current/VCST-4713/evidence/toast-test/
- `01-base-creme-selected.png`
- `02-message-selected-full-page.png`
- `03-toast-visible-with-save-button.png`
- `04-toast-closeup.png`
- `05-network-after-toast-save.txt` — shows `ChangeCartConfiguredItem` payload with only 3 sections, 200 OK
- `06-after-toast-save-reset.png` — PDP reset state
- `07-cart-after-toast-save.png` — cart with "Required sections are missing" warning
- `08-cart-components-expanded.png` — components list missing Custom text

Full investigation: `tests/Sprint-current/VCST-4713/wedding-cake-investigation.md`

## Comparison of the two buttons (same empty-required state)

| Aspect | Toast Save | Main Update cart |
|---|---|---|
| Mutation fired? | Yes — `ChangeCartConfiguredItem` | No |
| Validation enforced? | **NO** | YES (client-side) |
| HTTP response | 200 OK | N/A |
| Cart updated? | YES (invalid) | No |
| PDP after click | Reset / exits edit mode | Stays in edit mode |
| User feedback | None | None (silent block — Risk P3) |
| Data integrity | **VIOLATED** | Preserved |

## Root cause hypothesis

The toast Save click handler calls `ChangeCartConfiguredItem` directly with the currently-selected sections, bypassing the validation gate that exists on the main Update cart click handler. Additionally, the GraphQL xAPI `ChangeCartConfiguredItem` resolver does not re-validate required sections server-side.

## Related issues

- Toast copy is misleading: "save it later by clicking 'Update cart' button" — but the toast itself has a Save button that behaves differently (and more permissively) than the Update cart button it references.
- Secondary UX risk (tracked separately): main Update cart gives no visible error feedback when validation blocks it — user has no way to tell why the click did nothing.

## Impact

- Cart can be put into an invalid state that blocks checkout.
- Users may believe their changes were saved (edit mode exits, selections clear) and proceed to cart expecting to check out, only to find Place order disabled.
- Conditional-sections feature (VCST-4713) appears correct at the data-model level (dependsOnSectionId works, GraphQL returns correct graph), but the Save-in-toast write path lacks required-section enforcement.

## Suggested fix areas

- `vc-frontend` PR #2225 — toast Save handler should invoke the same validation logic used by the Update cart button before firing `ChangeCartConfiguredItem`.
- `vc-module-x-cart` PR #105 — `ChangeCartConfiguredItem` mutation should validate that every section with `isRequired: true` (and whose dependency parent has a value) is present and non-empty in the input payload; reject with a user-readable error otherwise.
- Toast copy — either remove the Save button (keep only "Update cart") or make the Save button actually synonymous with the Update cart button.
