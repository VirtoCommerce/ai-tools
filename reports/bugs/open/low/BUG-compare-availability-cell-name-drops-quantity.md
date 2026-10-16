# Compare — the Availability cell is announced as "In stock" without the visible quantity (WCAG 1.3.1) — P3

## Status: CONFIRMED (3/3 cells, both builds)
**Found by:** agent — testing VCST-5880 · **PRE-EXISTING**, OUT-OF-SCOPE · kb KB-95685F89
**Severity:** Low/P3 · **BELOW the 5-file severity floor — not filed**, named in the VCST-5880 QA comment

**Env:** vcst-qa, baseline `2.60.0-pr-2511` and PR `2.60.0-pr-2518` · Chromium native AX tree (CDP `getFullAXTree`).

## Observed
- Each Availability `cell` is named **"In stock"**. The child `group "In stock"` takes its name from `title`, so the quantity (12 / 340 / 60) is not in the cell name.
- Off compare (catalog card, PDP) the quantity is still read as child text, so the loss is specific to the compare cell.

## Root cause
`client-app/shared/catalog/components/in-stock.vue` L8-21 sets `:title="$t('common.labels.in_stock')"` on the chip and renders the quantity as span text.

**Fix direction:** visually hidden "In stock: N" text instead of the `title`.

## Why Low
The stock state is still announced, and the quantity remains reachable inside the cell.

Evidence package: `reports/tickets/Sprint26-20/VCST-5880/investigation/C35a/`.
