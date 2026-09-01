# Featured-SKU mission modal at 375 px truncates **every** product name to `AGENT-TEST…` — the stepper rows become unidentifiable — **P2**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28) · visual review, not an invariant snippet
**Tracker:** VCST-5831 (Subtask of VCST-5346)
**Archetype:** `RENDER`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, chrome, viewport 375 px, signed in.

## Summary
`sku-mission-modal.vue` keeps its item row a three-column `flex-wrap: nowrap` at mobile width. At 375 px the row splits 72 px image + **95 px** info + 128 px stepper, so the product-name cell is too narrow for any real name and all three rows ellipsis to the shared `AGENT-TEST…` prefix. A mobile user sees three identical labels above three quantity steppers and cannot tell which product each stepper controls — the modal's only job. The full name stays in the DOM, so assistive technology gets more information than a sighted user.

## STR
1. Sign in as the loyalty-missions fixture account on `{{FRONT_URL}}`.
2. Set the viewport to **375 px** (or use a phone).
3. Go to `/account/missions`.
4. Open a featured-SKU mission (`AGENT-TEST-MSN-PERSKU-ALL`).
5. Read the three product-name cells.

## Expected vs Actual
- **Expected:** each row identifies its product — the name wraps to a second line, or the row reflows to stack image/name above the stepper, at mobile width.
- **Actual:** all three names render as `AGENT-TEST…`; the info column measures 95 px.

## Evidence
`reports/tickets/Sprint26-17/VCST-5346/screenshots/modal-sku-mobile.png` (compare `modal-sku-desktop.png`, where the same rows read in full).

## Notes
The approved design specifies **no** mobile variant of this modal — design Frame 3 ("Mission detail — SKU-specific") is a 660 px desktop artboard — so this is a design gap as much as an implementation one; a reflow rule needs deciding, not just applying. Raised as `UNSPEC` on the `vs. DESIGN` axis rather than DRIFT.

## Refs
`BL-UI-004` (content boundary) · Nielsen #6 (recognition over recall) · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N1)
