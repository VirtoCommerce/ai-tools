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

---

## VERIFIED FIXED — 2026-09-08 (`/qa-test VCST-5831`, verify-fix flow)

**Fix:** vc-frontend **PR #2471** (`fix/VCST-5910-missions`), `sku-mission-modal.vue` styles only — `__item` gains `flex-wrap`; `__stepper-wrap` gains `basis-full` + `ps-[5.5rem]` below `sm`, reverting to `basis-auto items-end ps-0` at `min-width:640px`; new `__actions` wrap container and `__action w-full` stacking.

**Verified on:** theme `2.57.0-pr-2471-6ed5-6ed5dc1b`, deployed to vcst-qa as a prerelease. Confirmed live from the storefront footer and corroborated byte-for-byte against the shipped `/assets/missions-CQrLEBbx.css`.

**Measured at 375 px (3/3 runs byte-identical):**

| Measure | Before | After |
|---|---|---|
| `__info` width | 95 px | **233 px** (2.45×) |
| `__item` `flex-wrap` | `nowrap` | **`wrap`** |
| `__stepper-wrap` `flex-basis` | — | **`100%`** (own row) |

BL-UI-003 / 004 / 005 / 006 all pass; no desktop regression at 768 / 1024 / 1280 / 1920. Full record: `reports/tickets/Sprint26-18/VCST-5831/testing-checklist.md`.

**Two caveats, deliberately recorded rather than dropped:**

1. **The PR is still OPEN/unmerged** — verified against a prerelease build. If that PR is closed unmerged, this bug returns and this file must move back to `open/medium/`.
2. **Residual:** the two product-name cells still render identical visible text (`AGENT-TEST Missions PerSku Targ…`) because `-webkit-line-clamp: 1` caps a now-233 px column at one line. The ticket's *harm* is resolved — each stepper sits on its own row beneath its own fully-visible `SKU #… · $price`, so the row identifies its product, and the ticket's Expected explicitly allowed the reflow branch. `line-clamp: 2` would close the residual. Filed as neither a bug nor a blocker: below the severity floor, named in `summary.json.bugs_not_filed`.
