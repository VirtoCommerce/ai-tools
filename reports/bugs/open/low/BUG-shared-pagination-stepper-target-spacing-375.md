# At 375 px, VcPagination page buttons sit 0 px apart and the VcQuantityStepper buttons 1 px from the input — below the 8 px target spacing — **P3**

## Status: CONFIRMED (live: 4v playwright-edge, 2026-10-01)
**Found by:** agent — testing VCST-5957 (`/qa-test` visual lane)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-5957 QA comment.
**Oracle:** `BL-UI-006` (spacing) · **Provenance:** OUT-OF-SCOPE. These are shared UI-kit components that PR #2524 did not touch; seen on `/account/missions` and the SKU mission modal.

| Component | Measured at 375 px | Note |
|---|---|---|
| `VcPagination` | buttons 2–5: 32×32, **0 px** gap between neighbours | passes the 24 px size gate (WCAG 2.5.8); fails the 8 px spacing rule |
| `VcQuantityStepper` | 32×32 buttons, **1 px** to the input | same |

## Evidence
`reports/tickets/Sprint26-19/VCST-5957/screenshots/4v-missions-page-375.png`, `4v-sku-modal-375.png` · `reports/tickets/Sprint26-19/VCST-5957/design-report.md` U1/U2.

## Fix Routing
`VirtoCommerce/vc-frontend` · `client-app/ui-kit` (VcPagination, VcQuantityStepper). Every consumer is affected, not just missions.
