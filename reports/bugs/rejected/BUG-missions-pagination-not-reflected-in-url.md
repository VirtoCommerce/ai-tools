# Paginating `/account/missions` does not change the URL — page 2 is not linkable, not refresh-safe, and Back does not undo it — **P3**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** VCST-5835 (Subtask of VCST-5346)
**Archetype:** `REPLAY`
**Status:** REJECTED

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, chrome, signed in with 13 seeded missions (2 pages).

## Summary
The missions list paginates client-side with no router state: the URL stays `/account/missions` on page 2. Three consequences, in rising order of annoyance — the page cannot be linked or bookmarked; a refresh silently returns the user to page 1; and **Back** leaves the page entirely instead of returning to page 1, so the browser's own undo does the wrong thing.

## STR
1. Sign in as the loyalty-missions fixture account, go to `/account/missions`.
2. Click page **2** in the pagination control. Note the URL is unchanged.
3. Refresh → page 1.
4. Go to page 2 again and press **Back** → leaves `/account/missions` rather than returning to page 1.

## Expected vs Actual
- **Expected:** the active page is in the URL (e.g. `?page=2`), restored on refresh, and Back steps through pagination.
- **Actual:** no URL change; refresh resets; Back exits the page.

## Recommended fix
Bind the current page to a query parameter and read it on mount — the pattern other paginated account pages already use.

## Notes
Layout itself is clean across the page change: measured Δ0 on position and height, one card on page 2, no duplicate missions across the boundary.

## Refs
Nielsen #3 (user control and freedom) · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N9)
