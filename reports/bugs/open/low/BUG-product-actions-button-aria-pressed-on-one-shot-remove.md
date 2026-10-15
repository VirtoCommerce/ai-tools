# UI-kit VcProductActionsButton — "Remove from compare" is exposed as a toggle (aria-pressed="false") (WCAG 4.1.2) — P3

## Status: CONFIRMED (3/3 buttons, both builds)
**Found by:** agent — testing VCST-5880 · **PRE-EXISTING**, OUT-OF-SCOPE · kb KB-95685F89
**Severity:** Low/P3 · **BELOW the 5-file severity floor — not filed**, named in the VCST-5880 QA comment

**Env:** vcst-qa, baseline `2.60.0-pr-2511` and PR `2.60.0-pr-2518`.

## Observed
Every compare "Remove from compare" button carries `aria-pressed="false"` (DOM + CDP `pressed=false`), so a one-shot action is announced as a toggle button.

## Root cause
- `client-app/ui-kit/components/molecules/product-actions-button/vc-product-actions-button.vue` declares `ariaPressed?: boolean` (L42) with no default (L49-53).
- Vue's Boolean prop casting turns the omitted prop into `false`, so the guard `ariaPressed !== undefined ? …` (L4) always renders the attribute.
- `compare-table.vue` L139-143 omits the prop.
- The catalog compare toggle (real state) and the wishlist button (explicit `undefined`) are correct.

**Fix direction:** set `ariaPressed` default to `undefined` in `withDefaults`.

## Why Low
Name and action are correct; only the role semantics mislead.

Evidence package: `reports/tickets/Sprint26-20/VCST-5880/investigation/C35b/`.
