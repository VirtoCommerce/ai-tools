# C35a — Evidence index: the Availability cell's accessible name omits the quantity

**Verdict:** REPRODUCED. 3/3 cells on BASELINE and 3/3 cells on PR, with identical results. The issue is PRE-EXISTING and OUT-OF-SCOPE for VCST-5880. **Scope: compare-only symptom; the cause is in a shared component.** The root cause sits in the shared `in-stock.vue` (`title` attribute on the chip). The quantity loss itself only appears where that chip is the content of a table cell, which today means `/compare`.

**Env:** TEST_ENV=vcst (`vcst_qa`), guest, Edge via playwright-edge, 1280x900, 2026-10-12. The builds and data are the same as in `../C23b/evidence-index.md`. Layer: storefront markup/ARIA only.

## STR
1. As a guest, add `@td(PROD_CMP_A)`, `@td(PROD_CMP_B)` and `@td(PROD_LONGNAME)` to compare.
2. Open `/compare`.
3. Inspect the Availability row. It visibly shows stock chips "12", "340" and "60".
4. Read the computed accessible name of each cell from the Chromium native accessibility tree (CDP `Accessibility.getFullAXTree`).

## Measurements
| Source | Build | Availability cell name | Chip node |
|---|---|---|---|
| Chromium native AX tree (CDP) | BASELINE | `cell "In stock"` ×3 | `group "In stock"` (name from `title`) |
| Chromium native AX tree (CDP) | PR | `cell "In stock"` ×3 | `group "In stock"` |
| Playwright aria snapshot (Playwright's own accname JS) | BASELINE | `cell "12"`, `cell "340"`, `cell "60"` | `generic "In stock"` wrapping text "12" |
| DOM | BASELINE and PR | — | `.vc-chip` `title="In stock"`, no `aria-label`, no `role`, text "12"/"340"/"60" |

**Scope check, off compare** (PR build, CDP): the catalog card on the Group A category page has 4 chips, `group "In stock"` with child text 25/12/340/60, and the PDP of `@td(PROD_CMP_A)` has `group "In stock"` with child text 12. Neither has a cell parent, so nothing collapses the chip into one name. There the quantity stays in the tree as text inside a group labelled "In stock", which is the intended reading.

Note the two engines disagree. Chromium, and therefore Edge and Chrome screen-reader users, gets "In stock" with no quantity. Playwright's accname gets "12" with no stock label. Each loses half of the visible meaning.

## Artifacts
- `dom-base-compare.txt`: the BASELINE Playwright snapshot of `/compare` (Availability row at L186-205).
- `../../screenshots/inv-base-1280-compare-header.png`: the Availability row with the 12 / 340 / 60 chips.
- `../../screenshots/inv-pr-1280-catalog-primary-secondary-tokens.png`: the same chip on catalog cards (25 / 12 / 340).

## kb
- `KB-95685F89` **confirmed** on `vcst_qa`, with a note on the Chromium vs Playwright difference and the off-compare scope.
