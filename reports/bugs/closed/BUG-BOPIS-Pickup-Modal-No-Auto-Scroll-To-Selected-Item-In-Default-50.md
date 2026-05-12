# BUG: BOPIS Pickup Modal Does Not Auto-Scroll to Selected Item When It Is Inside the Default 50

## Status: FIXED (verified 2026-05-07 via PR #2283)

**Severity:** Medium (P2)
**Component:** Storefront — Cart / BOPIS Pick Points modal (`vc-frontend`)
**Browser:** Microsoft Edge (Chromium, Playwright MCP)
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1025.0
**Theme Version:** vc-theme-b2b-vue-2.48.0-pr-2272-f40a-f40a2483
**Module Versions:** XPickup 3.1001.0-pr-8-3380, XCart 3.1011.0-pr-113-b17e, Xapi 3.1006.0
**USER_EMAIL:** .env (test-carlos.rodriguez-20260310@test-agent.com — agent slot 3, BuildRight org)
**USER_PASSWORD:** .env (TestPass123!)
**Date:** 2026-04-29
**Reported By:** QA Agent (qa-testing-expert)

## Summary

The recent fix delivered under VCST-4565 (Theme PR-2272 + XPickup 3.1001.0-pr-8) restored selection state and visibility on modal reopen — but **only for pickup locations that fall outside the default 50-item page**. Those are pinned at position 1 server-side, so they are visible at `scrollTop=0`.

For pickup locations that are **already inside** the default 50 (e.g., a US location at position 25 or 49), the modal reopens with `scrollTop=0` and the selected item rendered at its native list position (~2,700px or ~5,200px below the visible viewport). The radio is correctly checked, the info panel and map are correctly populated, but the user cannot **see** their selection without manually scrolling — the very B4 (Scroll Reset) sub-bug that the parent ticket intended to fix.

## Steps to Reproduce

### Prerequisites
- B2B user with cart having ≥ 1 item (no country filter applied)
- Cart configured for Pickup delivery

### Reproduction Steps
1. Navigate to `/cart` and ensure "Pickup" delivery option is selected.
2. Click the pencil/edit icon next to the current pickup location → "Pick points" modal opens with the default 50-item list.
3. **Scroll the list down** to a mid or end-of-list item (e.g., position 25 or 49). Do NOT use any country filter.
4. Click the radio next to the chosen item (e.g., **Chrysler Building- Main_2** at index 25, or **Lower East Side*Michigan** at index 49).
5. Click **"Pick up here"** to confirm. Verify the cart updates with the new pickup address.
6. Click the pencil icon **again** to reopen the modal.
7. **Observe** — the list is at the top (`scrollTop = 0`), but the selected item is at its native position deep in the list and is not visible.

## Expected Result

On reopen, the list should auto-scroll so the selected item is centered (or at minimum visible) in the viewport — equivalent UX to the current behavior for international locations that are pinned at position 1.

## Actual Result

| Selection | Native position | scrollTop on reopen | Selected item top (px) | Viewport ends (px) | Visible without scrolling? |
|-----------|-----------------|---------------------|------------------------|---------------------|----------------------------|
| Chrysler Building- Main_2 (mid) | 25 of 50 | 0 | 2724 | 912 | **NO** |
| Lower East Side*Michigan (end) | 49 of 50 | 0 | 5178 | 912 | **NO** |
| Westend Foxpost / Hungary (outside 50) — control | pinned at 1 | 0 | 278 | 912 | YES |

The radio is correctly checked, the info panel auto-opens, and the map zooms to the correct coordinates in **all** cases — so state restoration is working except for the list scroll position.

## Evidence

Screenshots: `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/screenshots/desktop/scroll-to-mid-end-2026-04-29-edge-carlos/`

| # | File | Description |
|---|------|-------------|
| 06 | `06-mid-list-selection.png` | List scrolled to mid; Chrysler Building- Main_2 selected (radio checked) |
| 07 | `07-cart-after-mid-confirm.png` | Cart shows the mid-list pickup address confirmed |
| 08 | `08-modal-reopened-mid.png` | **BUG** — modal reopened, list at top, Chrysler not visible |
| 09 | `09-modal-reopened-mid-scrolled.png` | Same modal manually scrolled down to find selected Chrysler |
| 10 | `10-end-list-selection.png` | List scrolled to end; Lower East Side*Michigan (index 49) selected |
| 11 | `11-modal-reopened-end.png` | **BUG** — modal reopened, list at top, end item ~5178px below |

- **Console:** 0 errors during the flow
- **Network:** `GetCartPickupLocations` returns the same default 50-item response for both filtered/unfiltered reopen — no client-side or server-side pin/scroll logic activates when the selected location is already in the default page

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | Reopened modal has `scrollTop = 0` while selected item is at `top: 2724px` (mid) or `top: 5178px` (end); not visible without manual scroll |
| 2. Backend Admin | N/A | Not exercised |
| 3. GraphQL xAPI | **PASS** | `GetCartPickupLocations` returns the correct 50 items including the selected one at its native index; data is correct |
| 4. Platform REST API | N/A | xAPI is the relevant data layer |

**Owning layer:** Layer 1 — `vc-frontend` (Pick Points modal client-side scroll-into-view logic).

## Root Cause Analysis

The PR-2272 fix appears to be **server-side pinning only** — when the cart's confirmed pickup location is outside the default page returned by `GetCartPickupLocations(first: 50)`, the server injects it at position 1, so `scrollTop=0` correctly displays it.

When the location is already inside the default 50, no special positioning happens and the client does not compensate with a scroll. The pickup modal component populates the radio, info panel, and map from cart state but does not call `Element.scrollIntoView()` on the matching list row.

**Suspected fix:** in the modal mount/open lifecycle hook (likely `vc-frontend` `SelectAddressMap` or analogous component), after the list renders and the selected radio is identified, call `scrollIntoView({ block: 'center' })` on its row. This would unify behavior across both data paths (pinned-at-top and native-position).

- Source file: not yet identified — suggested grep on `vc-frontend` for `select-address-map-list` CSS class and the pickup-locations Vue store binding
- Recent changes: PR-2272 (Theme) for VCST-4565 introduced the original state-restoration logic but limited to the server-side path
- App Insights: no server-side errors related to this scenario (data path is healthy)

## Impact

| Impact Area | Description |
|-------------|-------------|
| **Workflow friction** | Users with US-located pickups (the common case in this dataset — 90/100+ locations) must manually scroll up to ~5,200px to confirm their selection on reopen |
| **Inconsistent UX** | Users see fundamentally different reopen behavior depending on where their pickup happens to fall in the default page — feels arbitrary |
| **Regression risk on parent fix** | Stakeholders verifying VCST-4565 against international locations will see the fix working; verifying against US locations will see the legacy broken state — risk of confused triage |
| **Accessibility** | Screen-reader and keyboard users hit the same gap — focus does not move to the selected radio on reopen |

## Reproduction Rate

100% — reproduced for both index 25 and index 49 selections on Edge / Carlos / BuildRight / fresh single-item cart.

## Suggested Fix

Add a client-side `scrollIntoView({ block: 'center', behavior: 'smooth' })` call on the matched radio row in the modal's mount/open hook, after the list is populated and the selected radio is identified by `pickupLocationId`. The server-side pinning path can remain unchanged — this client-side scroll is idempotent for already-pinned items at index 0 (`scrollTop` stays at 0).

## Related Issues

- **JIRA:** [VCST-5029](https://virtocommerce.atlassian.net/browse/VCST-5029) (filed 2026-04-29, linked Relates to VCST-4565)
- **Parent:** VCST-4565 (BOPIS show selected pickup) — Done, partial fix
- **Sibling fix:** `reports/bugs/fixed/BUG-BOPIS-Pickup-PreSelection-Fails-Outside-Pagination-Window.md` — root-cause pagination fix
- **Sibling fix:** `reports/bugs/fixed/BUG-BOPIS-Scroll-To-Selected-Location-After-Reopen.md` — broader state-restoration fix; this bug is a narrower follow-up exposing a remaining gap


## Resolution

- **Fixed in:** vc-frontend PR #2283 — `fix(VCST-5029): add data-address-id to pickup list item for auto-scroll`
- **Fixed version (theme):** `vc-theme-b2b-vue-2.49.0-pr-2283-6610-6610c4af` (deployed to vcst-qa)
- **Verification date:** 2026-05-07
- **Verification method:** STR 3x mid-list (idx 25/31/39) + 3x end-of-list (idx 47/48/49) on `playwright-chrome` via qa-frontend-expert; `boundingBox` viewport-intersection assertion + screenshots; HAR captured
- **Verification verdict:** VERIFIED — 13/13 PASS, 0 FAIL, 0 console errors. Pre-fix `scrollTop=0` symptom fully eliminated; selected row visible without manual scroll on every reopen
- **Adjacent regression:** country filter, info panel + map, server-pinned outside-default-50, cart label updates, idempotent reopen — all unchanged
- **Root-cause patch:** added `:data-address-id="address.id"` to `.select-address-map-list__item` so the existing scroll consumer in `useSelectAddressMap.ts` / `select-address-map-desktop.vue` can target the row via `[data-address-id="<selectedId>"]` and call `scrollIntoView()`
- **Evidence:** `tests/Sprint-current/VCST-5029/`
- **JIRA transition:** Testing → Tested (transition id 8). Final close-to-Done after PR #2283 merge.
