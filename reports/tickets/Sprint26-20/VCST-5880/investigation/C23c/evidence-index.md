# C23c — Evidence index: selected "Group A" category tab, #fff on #688198

**Verdict:** REPRODUCED on 2 of 2 builds (BASELINE and PR, identical values). The defect is PRE-EXISTING and OUT-OF-SCOPE for VCST-5880. **Scope: systemic**, because a shared solid-secondary token drives both the selected compare tab and the catalog active-filter chip.

**Env:** TEST_ENV=vcst (`vcst_qa`), guest, Edge via playwright-edge, 1280x900, 2026-10-12. The builds and data are the same as in `../C23b/evidence-index.md`. The layer is storefront CSS only; there is no server-side layer.

## STR
1. As a guest, add `@td(PROD_CMP_A)`, `@td(PROD_CMP_B)`, `@td(PROD_LONGNAME)` and `@td(PROD_CMP_C)` to compare.
2. Open `/compare` at 1280 px.
3. Read the selected "Group A" category tab, the solid chip under the page title.

## Measurements
| Surface | Build | Control | Text | Background | Font | Ratio |
|---|---|---|---|---|---|---|
| `/compare` selected tab "Group A 3" (`aria-pressed="true"`) | BASELINE and PR | `vc-button--solid--secondary` xs | #ffffff | `rgb(104,129,152)` #688198 | 12px / 700 | **4.05:1** |
| Catalog active-filter chip "Show in stock" (`/seed-compare-fixtures/…-group-a`, BASELINE) | BASELINE | `vc-chip--solid--secondary` md, content span | #ffffff | #688198 | 14px / 700 | **4.05:1** |
| `/compare` unselected tab "Group C 1" (control) | BASELINE | `vc-button--outline--secondary` | #516477 (secondary-600) | #ffffff | 12px / 700 | 6.11:1, passes |

WCAG 1.4.3 AA needs 4.5:1. At 12 px and 14 px bold, neither text is large. Live token reads: `--vc-button-solid-secondary-bg = #688198`, `--vc-button-solid-secondary-text = #ffffff`, `--color-secondary-500 = #688198`.

## Artifacts
- `../../screenshots/inv-base-1280-compare-header.png` and `../../screenshots/inv-pr-1280-compare-header.png`: the "Group A" tab under the title.
- `../../screenshots/inv-pr-1280-catalog-primary-secondary-tokens.png`: the "Show in stock" solid chip above the product grid.

## kb
None. The brief did not ask for a kb write for C23c, and none was made.
