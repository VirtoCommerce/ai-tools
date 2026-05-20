# /qa-design — /account/lists

**Date:** 2026-05-20
**Target type:** Page
**Target:** /account/lists
**Matrix scope:** LAYOUT-PAGE-CLS-LISTS-001, LAYOUT-SPC-001, LAYOUT-OVF-006 (BL-UI-006 n/a)
**Storefront URL:** https://vcst-qa-storefront.govirto.com/account/lists
**Viewports:** 375 / 768 / 1280
**Auth:** mutykovaelena@gmail.com (Max-Spenser org, 11 wishlists present)
**Build:** Ver. 2.49.0-pr-2292-bcfc-bcfcf0cc

---

## Invariant Results

| Invariant | 1280 px | 768 px | 375 px |
|-----------|---------|--------|--------|
| BL-UI-001 CLS | PASS (0.045, 6 shifts) | FAIL (0.113, 3 shifts) | PASS (0.040, 4 shifts incl. Slow 3G) |
| BL-UI-002 spacing | FAIL | FAIL | FAIL |
| BL-UI-004 overflow | PASS | PASS | PASS |

**Overall: 2 FAIL invariants. 1 PASS invariant.**

---

## Findings

### [BL-UI-001] CLS exceeds threshold at 768 px

- **Viewport:** 768 px
- **Measured CLS:** 0.113 (threshold ≤ 0.1), 3 layout shifts
- **Suspected source:** Two independent async resolvers fire during page load at this breakpoint — the header ship-to address selector (resolves from null to "Select address") and the wishlists data fetch (list cards arriving asynchronously). Both push content below them, contributing shifts that accumulate above the 0.1 threshold.
- **Skeleton swap note:** The header did not shift during the skeleton → list-card content swap at 375 px under Slow 3G (Δtop = 0, Δleft = 0). The 768 px CLS is not caused by the wishlists skeleton mechanism itself but by earlier async resolvers in the page shell.
- **Evidence:** `storefront/viewport-768/lists-page-768-cls-fail.png`
- **Not reproduced at:** 1280 px (CLS 0.045), 375 px (CLS 0.040 fast + 0.040 Slow 3G)

---

### [BL-UI-002] Off-grid spacing tokens — FAIL at all viewports

Five distinct CSS token violations found. All are systemic — the same hardcoded non-grid values appear regardless of viewport. Recommend one rollup bug rather than five separate per-viewport reports.

**Token 1 — `account-shell` paddingBottom: 36 px**
- Element: `div.vc-container.account-shell`
- Property: `paddingBottom: 36px`
- Off-grid: 36 px is not in {0, 4, 8, 12, 16, 20, 24, 32, 40, 48, ...}. Nearest valid values: 32 or 40.
- Viewports affected: 1280, 768
- Evidence: `storefront/viewport-1280/lists-page-1280-populated.png`

**Token 2 — `link-lists__wrapper` paddingLeft: 10 px**
- Element: `div.link-lists__wrapper`
- Property: `paddingLeft: 10px`
- Off-grid: 10 px not in grid. Nearest valid values: 8 or 12.
- Viewports affected: 1280, 768, 375 (consistent across all)
- Evidence: `storefront/viewport-375/lists-page-375.png`

**Token 3 — `link-lists__item` marginTop: 2 px**
- Element: `div.link-lists__item.vc-menu-item`
- Property: `marginTop: 2px`
- Off-grid: 2 px not in grid. Nearest valid values: 0 or 4. First item in each group computes 0 px; items 2–9 all compute 2 px.
- Viewports affected: 1280, 768, 375 (consistent; sidebar link list in `aside > section`)
- Evidence: `storefront/viewport-1280/lists-page-1280-populated.png`

**Token 4 — `lists__items` gap: 10 px (desktop only)**
- Element: `div.lists__items`
- Property: `gap: 10px` / `rowGap: 10px`
- Off-grid: 10 px not in grid. Nearest valid values: 8 or 12. Present at 1280 px where element renders as `display: grid`; at 768 px and 375 px the element switches to `display: block` and gap computes to `normal` (not applicable).
- Viewports affected: 1280 only
- Evidence: `storefront/viewport-1280/lists-page-1280-populated.png`

**Token 5 — `wishlist-card__date` gap: 6 px (tablet and mobile)**
- Element: `div.wishlist-card__date`
- Property: `gap: 6px` / `rowGap: 6px` / `columnGap: 6px`
- Off-grid: 6 px not in grid. Nearest valid values: 4 or 8. Present on every wishlist card row at tablet and mobile breakpoints.
- Viewports affected: 768, 375
- Evidence: `storefront/viewport-768/lists-page-768.png`, `storefront/viewport-375/lists-page-375.png`

---

### [BL-UI-004] Overflow — PASS at all viewports

No horizontal document scroll at any tested viewport. Reported clipped children are all by-design:

- `div.vc-container__bg` y-clipped: decorative background layer with `overflow: hidden`; contains no user content.
- `a.footer-link` x-clipped at 768 px: `text-overflow: ellipsis` + `white-space: nowrap` with `scrollWidth === clientWidth` at integer precision (111 px); no content is actually cut.
- `a.wishlist-card__title` x-clipped at 375 px: `text-overflow: ellipsis` + `white-space: nowrap`; long list name truncates with visible ellipsis indicator. Intentional.

---

## Notes

- **Skeleton swap (375 px, Slow 3G):** Header bounding rect was identical before and after wishlists data resolved (top: 0, left: 0, width: 375, height: 90 at both snapshots). No shift from the skeleton mechanism.
- **Spacing violations are systemic:** Tokens 2, 3, and 5 appear identically at all three tested viewports. Tokens 1 and 4 are breakpoint-specific but share the same pattern of hardcoded non-grid px values. File as one rollup bug against `/account/lists` spacing rather than per-viewport issues.
- **BL-UI-006 n/a:** Touch-target audit excluded per matrix scope (covered transitively under component-level audits).
- **By-design behaviors (`project_lists_feature_design_intent`):** None of the three by-design items (disabled Create List at `listsLimit`, view-only Settings fields, share URL inside Settings dialog) were encountered during this layout-stability audit.
