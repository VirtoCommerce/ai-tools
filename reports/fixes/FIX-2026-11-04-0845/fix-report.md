# FIX VCST-5711 — cart method selectors: valid ARIA + alt text

- **Ticket:** VCST-5711 (To do → In progress → In review)
- **Repo:** VirtoCommerce/vc-frontend (kind: frontend), base `dev` @ 0bbc3b56
- **Branch:** claude/qa-autofix/VCST-5711
- **PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2632 (labels: bug, claude-code-assisted)
- **Environment:** vcst — FRONT_URL https://vcst-qa-storefront.govirto.com, BACK_URL https://vcst-qa.govirto.com

## Reproduction
- Live step BLOCKED: the built-in browser was signed out of the storefront and the cart was empty. Filling a cart would change data.
- Confirmed from code at dev 0bbc3b56 and by the operator's comment of 2026-11-02 (axe on /cart, theme 2.62.0-pr-2600 and dev 4ce61d0c).
- Root cause: `ui-kit/components/molecules/select/vc-select.vue:45` puts `aria-required` on the `role="button"` trigger. In `shipping-details-section.vue` and `billing-details-section.vue`, the `VcImage` elements have no `alt`.

## Gates
| Gate | Result |
|---|---|
| G0 triage | PASS: small, local a11y fix with no contract change |
| G1 route | vc-frontend (Layer 1, storefront only) |
| G2 RED | vitest + jsdom rendered DOM: 1 VcSelect test and 2 checkout section tests fail before the fix |
| G3 GREEN | the scoped specs pass (86 tests), `validate:types` passes, ESLint shows no new findings |
| G4 review | self-review: minimal diff, no existing test changed |
| G5 CI | see summary.json |
| G6 | needs deploy verification (re-run axe on /cart) |

proof_medium: rendered-DOM (jsdom) · proof_provenance: new tests in the PR · proof_linkage: the asserted attributes are the ones axe flags · g2_proxy: true (jsdom attribute check, not an axe run in a browser)

## Notes for the reviewer
- Switching the trigger to `role="combobox"` would keep the required state for screen readers, but it also changes role-based layout CSS (`vc-dropdown-menu.vue`) and forks. Left out of this fix.
- `select-payment-method-modal.vue` has the same missing `alt`, but it isn't on /cart. Out of scope.
