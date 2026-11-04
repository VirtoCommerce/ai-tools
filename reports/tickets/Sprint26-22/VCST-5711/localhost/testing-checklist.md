# VCST-5711 — verification checklist (verify-fix flow)

**Ticket:** [Storefront][A11y] Cart: delivery/payment selectors and placeholder images fail accessibility checks · Bug · Medium · Ready for test
**Fix:** VirtoCommerce/vc-frontend#2632 (open, head `4c61e29f`) — `aria-required` removed from the `role="button"` trigger of `vc-select`; `alt=""` on the method images in `shipping-details-section.vue` / `billing-details-section.vue`.
**Fixed build (GREEN):** `localhost` — local theme `vc-theme-b2b-vue-2.62.0-pr-2632-4c61-4c61e29f.zip`, API proxied to vcst-qa (store `B2B-store`).
**Pre-fix build (RED):** vcst-qa storefront — theme `2.62.0-pr-2622-caac` (no fix). Same backend, same user, same cart.
**Oracle:** axe-core WCAG A/AA scan of `/cart`, signed in, cart with items (`scripts/lib/axe-runner.ts` `axeRunSnippet()`); BL-A11Y-002, BL-A11Y-004, BL-A11Y-001.

## Fix confirmation
| # | Check | Expected | Result |
|---|---|---|---|
| 1 | RED: axe `/cart` on vcst-qa (pre-fix) | `aria-allowed-attr` on the delivery + payment `role="button"` triggers; `image-alt` on method image(s) | |
| 2 | GREEN ×3: axe `/cart` on localhost | 0 `aria-allowed-attr` and 0 `image-alt` on those nodes, in 3 consecutive runs | |
| 3 | Root cause: DOM of the two triggers + method images | triggers `role="button"` with no `aria-required`; method `<img>` carry `alt=""`; method name is visible text beside each image | |

## Regression
| # | Check | Expected | Result |
|---|---|---|---|
| 4 | Delivery-method selector, keyboard + mouse | opens, lists methods, a choice updates the cart; Enter/Space opens, Escape closes (BL-A11Y-001) | |
| 5 | Payment-method selector, same | same | |
| 6 | Triggers' accessible name | non-empty and names the selected method (BL-A11Y-002) | |
| 7 | A `role="combobox"` `vc-select` on cart/checkout, if one is required | keeps `aria-required="true"` (PR claims only the button trigger lost it) | |
| 8 | Console on `/cart` | no new errors vs the RED run | |

## Edge / scope
| # | Check | Expected | Result |
|---|---|---|---|
| 9 | Product placeholder image in a cart line (named in the description, not in the PR) | `alt` present — else a scope gap of the fix | |
| 10 | Any other axe Critical/Serious on `/cart` (BL-A11Y-004) | listed; new vs pre-existing stated by comparing RED and GREEN | |
