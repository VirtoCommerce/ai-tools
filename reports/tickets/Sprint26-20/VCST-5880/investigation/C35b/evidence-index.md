# C35b — Evidence index: "Remove from compare" buttons expose `aria-pressed="false"`

**Verdict:** REPRODUCED. BASELINE 3/3 buttons, PR 3/3 buttons. PRE-EXISTING, OUT-OF-SCOPE for VCST-5880. **Scope: compare-only in today's storefront.** The defect sits in the shared ui-kit `VcProductActionsButton`: every consumer that omits `ariaPressed` gets it, and compare-table's Remove button is the only consumer in vc-frontend that omits it.

**Env:** TEST_ENV=vcst (`vcst_qa`), guest, Edge via playwright-edge, 1280x900, 2026-10-12. Builds and data are the same as in `../C23b/evidence-index.md`. Layer: storefront ARIA only.

## STR
1. As a guest, add `@td(PROD_CMP_A)`, `@td(PROD_CMP_B)` and `@td(PROD_LONGNAME)` to compare.
2. Open `/compare` at 1280 px.
3. Inspect the trash-can button on each product image ("Remove from compare").

## Measurements
| Build | Element | DOM `aria-pressed` | Chromium AX (CDP) |
|---|---|---|---|
| BASELINE | 3 × `.compare-table__product-remove .vc-product-actions-button` | `"false"` ×3 | `button "Remove from compare"`, pressed=`false` ×3, so it is exposed as a toggle button |
| PR | same | `"false"` ×3 | same ×3 |

**Scope check (BASELINE catalog, Group A):**
- Card "Add to Compare" / "Remove from Compare": `aria-pressed` false/true, tracking state. This button really is a toggle, so the value is correct.
- Card wishlist button (guest, disabled): no `aria-pressed`, which is correct. It passes `:aria-pressed="isAuthenticated ? … : undefined"` explicitly.

## Artifacts
- `../C35a/dom-base-compare.txt`: the BASELINE snapshot, with the three `button "Remove from compare"` nodes at L143/L153/L163. The Playwright snapshot omits pressed=false, so the DOM and CDP values above are the evidence.
- `../../screenshots/inv-base-1280-compare-header.png`: the trash-can buttons on the product images.

## kb
- `KB-95685F89` (which also records C35b) **confirmed** on `vcst_qa`.
