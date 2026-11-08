# VCST-5711 — verification checklist (verify-fix flow)

**Ticket:** [Storefront][A11y] Cart: delivery/payment selectors and placeholder images fail accessibility checks · Bug · Medium · Ready for test
**Fix:** VirtoCommerce/vc-frontend#2632 (open, head `4c61e29f`) — `aria-required` removed from the `role="button"` trigger of `vc-select`; `alt=""` on the method images in `shipping-details-section.vue` / `billing-details-section.vue`.
**Fixed build (GREEN):** `localhost` — local theme `vc-theme-b2b-vue-2.62.0-pr-2632-4c61-4c61e29f.zip`, API proxied to vcst-qa (store `B2B-store`).
**Pre-fix build (RED):** vcst-qa storefront — theme `2.62.0-pr-2622-caac` (no fix). Same backend, same user, same cart.
**Oracle:** axe-core WCAG A/AA scan of `/cart`, signed in, cart with items (`scripts/lib/axe-runner.ts` `axeRunSnippet()`); BL-A11Y-002, BL-A11Y-004, BL-A11Y-001.

## Fix confirmation
| # | Check | Expected | Result |
|---|---|---|---|
| 1 | RED: axe `/cart` on vcst-qa (pre-fix) | `aria-allowed-attr` on the delivery + payment `role="button"` triggers; `image-alt` on method image(s) | **PASS** — `aria-allowed-attr` ×2 (both triggers), `image-alt` ×2 (Fixed Rate (Ground) image, CyberSource icon) |
| 2 | GREEN ×3: axe `/cart` on localhost | 0 `aria-allowed-attr` and 0 `image-alt` on those nodes, in 3 consecutive runs | **PASS** — 0 and 0 in runs 1, 2, 3 |
| 3 | Root cause: DOM of the two triggers + method images | triggers `role="button"` with no `aria-required`; method `<img>` carry `alt=""`; method name is visible text beside each image | **PASS** |

## Regression
| # | Check | Expected | Result |
|---|---|---|---|
| 4 | Delivery-method selector, keyboard + mouse | opens, lists methods, a choice updates the cart; Enter/Space opens, Escape closes (BL-A11Y-001) | **PASS except Space** — Ground↔Air updates shipping and tax; Enter, arrows, Escape and focus ring work; Space does not open it, the same on the pre-fix build |
| 5 | Payment-method selector, same | same | **PASS except Space** — Manual↔CyberSource works; Space as in 4 |
| 6 | Triggers' accessible name | non-empty and names the selected method (BL-A11Y-002) | **FAIL, pre-existing** — name is only "Delivery method" / "Payment method"; the same on the pre-fix build |
| 7 | A `role="combobox"` `vc-select` on cart/checkout, if one is required | keeps `aria-required="true"` (PR claims only the button trigger lost it) | **PASS** — Country and State / Province in the Edit address dialog keep it |
| 8 | Console on `/cart` | no new errors vs the RED run | **PASS** — extra errors only from the local setup (CyberSource CSP, two module manifests 404) |

## Edge / scope
| # | Check | Expected | Result |
|---|---|---|---|
| 9 | Product placeholder image in a cart line (named in the description, not in the PR) | `alt` present — else a scope gap of the fix | **PASS, partial** — no image-less product found for a cart line; the placeholder images in "Saved for later" carry alt = product name on both builds |
| 10 | Any other axe Critical/Serious on `/cart` (BL-A11Y-004) | listed; new vs pre-existing stated by comparing RED and GREEN | **Nothing new** — `button-name` ×1 (edit-address pencil) and `link-in-text-block` ×2 on both builds |

**Verdict: VERIFIED WITH NOTES.** Notes = the pre-existing items in 4–6 and 10, none caused by the fix and none filed.
