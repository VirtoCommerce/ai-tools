# BUG: "Reset search" on a zero-result page clears only the keyword — the active facet stays applied (contradicts VCST-4121 / VCST-3968)

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-10-28-1013
**Jira:** VCST-6607 (Relates VCST-6417)
**Severity:** Low (a separate "Reset filters" button is the workaround) · **Case:** SRCH-NEW-104 (suite 005) · **Regression task:** VCST-6417

## Env
- vcst (QA storefront), store B2B-store, Firefox, signed-in personal account (anonymous behaves the same per the case)
- Platform 3.1090.0, Theme vc-theme-b2b-vue-2.61.0-alpha.2605 (matches the package)

## Summary
With a keyword and a facet giving 0 results, **Reset search** goes to /catalog with the facet still applied (81 of ~3.6k products). VCST-4121 (Done) expects the reset button to "clear all filters and restore products"; VCST-3968 (Done) fixed "reset search button doesn't reset filters". A separate **Reset filters** button is shown, so the PO should confirm the intended scope.

## Steps to reproduce
1. /search?q=kitchen -> **Categories** -> **TV & Multimedia** (8 results).
2. Replace the keyword with one that matches nothing (keep the facet) -> 0 results, **Reset search** shown.
3. Click **Reset search**.

## Actual
- Lands on /catalog?facets=<TV & Multimedia>: keyword empty, **TV & Multimedia chip still active**, 81 results.

![Before](../../../screenshots/Reset-Search-Keeps-Facets/01-zero-results-keyword-plus-facet.png)
![After Reset search](../../../screenshots/Reset-Search-Keeps-Facets/02-after-reset-search-facet-kept.png)

## Expected
- Reset search clears the keyword and all filters and restores the full product list (VCST-4121 Expected Behavior 3; VCST-3968).

## Not verified
- VCST-4121's own filters-only variant (no keyword): the Firefox lane's click stalled on Reset search; unverified.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | package screenshots/01, 02; dom-zero-results.yml, dom-reset-landing.yml |
| 2-4 | N/A — not probed (client-side routing; no failing request) | |

**Owning layer:** Layer 1 — Storefront

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** catalog / search no-results "Reset search" handler
- **RCA anchor:** not pinned — the handler routes to /catalog keeping the `facets` query parameter
- **Routing confidence:** MEDIUM
