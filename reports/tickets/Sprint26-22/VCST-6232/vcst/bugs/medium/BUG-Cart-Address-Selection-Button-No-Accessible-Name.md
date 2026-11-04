# `/cart`: the pencil button that changes the shipping address has no accessible name, so screen readers announce just "button" `[Medium]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6232
**Severity:** Medium (P2; axe rates `button-name` critical) · **Oracle:** WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A) · **Provenance:** pre-existing, NOT caused by VCST-6232 (same on base and PR)
**Tracker:** VCST-6653

**Env:** vcst · theme `2.62.0-pr-2600-a4f2-a4f29534` (classic, preset red) · platform `3.1093.0-pr-3154-4607` · also on base build `4ce61d0c` (localhost:3001, same backend; axe-core 4.10.2 in the VCST-6232 visual lane) · Firefox (this repro), Edge (axe)

## Summary
In the cart's **Shipping details**, the selected shipping address is followed by a small icon-only pencil button that opens the address picker. The button has no text, no `aria-label` and no `title`, and its icon is hidden from assistive technology, so a screen reader announces only "button" and voice-control users cannot name it. WCAG 4.1.2 requires every control to expose a name that says what it does. Not covered by VCST-5711 (that ticket covers only the selects' `aria-required` and the placeholder images' alt text).

## Steps to Reproduce
1. Sign in (`ORG_USER_EMAIL`) with at least one item in the cart and a saved shipping address.
2. Open `/cart` and scroll to **Shipping details → Shipping address**.
3. Inspect the pencil button next to the address (accessibility tree, a screen reader, or axe-core).

## Expected
The button exposes a name that says what it does, e.g. "Edit address" / "Change shipping address", in role `button`.

## Actual
- Accessibility tree (Playwright `browser_snapshot`): `button [ref=…] [box=582,1002,32,32]`: **role button, name empty**.
- DOM: `<button type="button" class="vc-button … vc-button--icon vc-address-selection__button" data-test-id="select-address-button">`; `aria-label` none, `aria-labelledby` none, `title` none, text content `""`; the pencil icon wrapper is `aria-hidden="true"`.
- The visible "Shipping address*" label is not associated with the button.
- axe-core 4.10.2: `button-name` (critical) on `.vc-address-selection__button`, on both builds.

![Shipping address with the unlabelled pencil button](../screenshots/Cart-Address-Selection-Button-No-Accessible-Name/BUG-cart-address-selection-button-no-name.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **FAIL** | snapshot + DOM above; screenshot |
| 2. Backend Admin | N/A | markup-only defect in the storefront component |
| 3. GraphQL xAPI | N/A | no data involved; the button's label is static UI text |
| 4. Platform REST API | N/A | no data involved |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
`VirtoCommerce/vc-frontend` @ `dev` (`11a967d0`), `client-app/shared/common/components/address-selection.vue:14–23`: the address-selected branch renders
`<VcButton v-if="!readonly" :disabled="disabled" variant="outline" icon="pencil" size="xs" class="vc-address-selection__button" data-test-id="select-address-button" @click="$emit('change')" />`
with no `aria-label` and no `title`. VcButton already supports it (`ui-kit/components/molecules/button/vc-button.vue:10` binds `:aria-label="ariaLabel || title"`), and the locale already has suitable strings (e.g. `common.titles.edit_address` = "Edit address"), so the fix is one attribute on this button. The same component is used in `shipping-details-section.vue`, `billing-details-section.vue`, `pages/checkout/review.vue` and `modules/quotes/pages/edit-quote.vue`, so one fix covers every place the button appears.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend shared `AddressSelection` (`shared/common/components/address-selection.vue`), used on /cart, checkout review and quotes
- **RCA anchor:** `client-app/shared/common/components/address-selection.vue:14` (icon-only `VcButton icon="pencil"` with no `aria-label`)
- **Routing confidence:** HIGH
