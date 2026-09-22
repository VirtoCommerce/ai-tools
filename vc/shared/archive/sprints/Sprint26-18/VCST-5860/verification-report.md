# VCST-5860 — Fix Verification: VERIFIED

**Ticket:** [vc-shell] Products blade view-mode toggle buttons have no accessible name (WCAG 4.1.2) · Bug · Medium
**Env:** vcmp-dev Vendor Portal — app `2.1.2-rc.0`, asset build `42234` (2026-09-07 11:14:10 GMT), framework `2.6.0-rc.0`, Chrome, Light theme
**Fix:** `vendor-portal` PR #153 `ea5d3e6c`, merged 2026-09-04 12:55:28 GMT (app layer)

## Verdict

**VERIFIED.** Both toggles now expose an accessible name; `aria-pressed` still tracks correctly.

## Deploy gate — PASS

PR #153 is an ancestor of `vendor-portal@dev` HEAD `d008baba` (2026-09-07 11:03:11 GMT), and the served
asset build `42234` was published 2026-09-07 11:14:10 GMT — after that commit. Corroborated by the
login-footer app version `2.1.2-rc.0`, which matches `dev`'s `package.json`.

## RED baseline

No live RED was possible — the fix was already deployed when the ticket was picked up. Baseline is taken
from the **ticket's own `/qa-bug` capture** (documented fallback; never fabricated):

```html
<button class="vc-button vc-button-secondary vc-button--sm vc-button--selected" type="button" aria-pressed="true">
```
axe `button-name` impact **critical**; ARIA snapshot rendered `group` → `button [pressed]`, `button` — both nameless.

## GREEN — 3 consecutive independent page loads

```html
<button class="vc-button vc-button-secondary vc-button--sm vc-button--selected" type="button" aria-label="Products View" aria-pressed="true">
```

| Instrument | load 1 | load 2 | load 3 |
|---|---|---|---|
| axe `button-name` violations | 0 | 0 | 0 |
| axe `button-name` passes | 34 | 60 | 60 |

- ARIA snapshot: `button "Products View" [pressed]` · `button "Category View"` — both named, the pair still a `group`.
- **Operable by name:** `getByRole('button', { name: 'Products View' })` resolved and clicked successfully — the name is usable as a locator, not merely present.
- `aria-pressed` unchanged and still tracking (`true` on the selected toggle).
- Localised via `PRODUCTS.PAGES.LIST.PRODUCTS_VIEW` / `CATEGORY_VIEW`, resolving to "Products View" / "Category View".

## Limits

- **No AT pass was run** — this is an accessible-name computation, not screen-reader output.
- Light theme only (the portal's default; this product ships Light/Dark/Green and has no Coffee theme, so
  the repo's "audit Coffee only" storefront rule does not apply).

## Evidence

`screenshots/VCST-5860-GREEN-products-view-toggles.png`
