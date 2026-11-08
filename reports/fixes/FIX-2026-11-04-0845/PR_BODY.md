## Description

The storefront `/cart` page fails two axe accessibility rules (VCST-5711). Screen-reader users get invalid ARIA on the delivery and payment selectors, and images with no `alt`.

**1. `aria-allowed-attr`: `aria-required` on `role="button"`.** When `VcSelect` has a `#selected`/`#placeholder` slot, its trigger is a `<div role="button">`. `aria-required` is not allowed on that role. This PR drops it from that trigger only. The combobox trigger (the input variant) keeps `aria-required`; a new test pins that. The visible required marker on `VcLabel` is unchanged.

**2. `image-alt`.** The method logos and placeholder images in the delivery and payment selectors (`shipping-details-section.vue`, `billing-details-section.vue`) now have `alt=""`. They are decorative: the method name is the text right next to each image.

Proof (vitest, rendered DOM):
- `vc-select.test.ts`: a required, slotted `VcSelect` renders no `aria-required` on its `role="button"` trigger. RED before, GREEN after.
- `__tests__/method-select-images.test.ts`: every `<img>` in both sections has an `alt` attribute. RED before (on `select-shipping.svg` and `select-payment.svg`), GREEN after. `VcImage` is stubbed to render `alt` only when it is passed, same as the real component.
- No existing test was changed. The other `select` and `checkout` specs still pass (86 tests). `yarn validate:types` passes, and ESLint shows no new findings.

Out of scope, for the reviewer:
- Changing the trigger to `role="combobox"` (the select-only combobox pattern) would keep the required state for screen readers. It would also change the trigger's role for every slotted `VcSelect`, and `vc-dropdown-menu.vue` has a `& > [role="button"]` layout rule. So it is left out of this minimal fix.
- `select-payment-method-modal.vue` has the same missing `alt`, but it isn't on `/cart`.

Needs deploy verification: re-run axe on `/cart` (signed in, cart with items) after deploy. Do not auto-merge.

## Checklist
- [x] Styles stay customizable for client forks: colours from palette/tokens, no !important, no public class or --vc-* token renamed or removed (or listed under Breaking changes).

## Breaking changes

## References
### Jira-link:
https://virtocommerce.atlassian.net/browse/VCST-5711
### Artifact URL:
