# BUG: Sales Rep Hub Tasks — the filter row cannot wrap; at 768–898 px Priorities is cut off and the page scrolls sideways

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6157
**Severity:** Medium (a filter control is partly off-screen and the page scrolls horizontally at common tablet / small-laptop widths; usable by scrolling)
**Tracker:** VCST-6702 · **Related:** VCST-6157 (vc-module-sales-rep#33, open) · VCST-6205 (same hub, 320 px empty-state overflow — different component and width)

## Env
- Stand `vcst`, store B2B-store, Chrome (playwright-chrome), sales rep account (`SALES_REP_EMAIL`)
- Platform 3.1094.0 · Theme 2.62.0-pr-2622-caac-caac275a · VirtoCommerce.SalesRep 3.1018.0-pr-33-04e4 (PR #33 head 04e4def, verified live) · VirtoCommerce.TaskManagement 3.1007.0-pr-33-14ff
- Repro rate: 3/3 at 768 px, deterministic (CSS)
- Trace id: none — layout only, every `/graphql` call 200. App Insights: N/A, no server-side layer. HAR: the package names `test-results/chrome/session.har`, which is not on disk.

## Summary
The Customers, Status and Priorities selects added by VCST-6157 sit in a non-wrapping row from the `sm` breakpoint (640 px) with fixed, non-shrinking widths that total 616 px. Where the page gives the row less than that — 768–898 px once the account sidebar appears, and 640–678 px without it — the Priorities select is cut at the right edge and the page scrolls horizontally.

## Steps to reproduce
1. Sign in to the storefront as a sales rep; store B2B-store.
2. Set the viewport to 768 × 1024.
3. Open `/company/tasks`.
4. Look at the filter row under the search box: Customers and Status fit, "All priorities" is cut at the right edge, and a horizontal scrollbar appears.
5. Resize to 640, 678, 700, 898 and 900 px to see the two overflow ranges.

## Actual
- 768 px: `.sales-rep-task-filters` is 485 px wide; its selects are 208 / 176 / 208 px and end at x = 860; `scrollWidth` 860 > `clientWidth` 753.
- Filters overflow their row at **640–678 px** (no sidebar, row 577–615 px) and **768–898 px** (sidebar shown, row 485–615 px); they fit at 700–767 px and from 899 px; below 640 px they stack.
- No console errors or warnings.

![768 px — Priorities cut at the right edge, horizontal scrollbar](../screenshots/SalesRep-Tasks-Filters-Overflow-768/vis2-768-overflow.png)

## Expected
- All three filters stay inside the content column at every width (wrap or shrink); the page never scrolls sideways (BL-UI-004, content boundary).

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | `investigations/VIS-2/screenshots/vis2-768-overflow.png`, `…/dom-768.txt`, `…/console/console.json` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | PASS — every `/graphql` call 200, no `errors[]` | `investigations/VIS-2/network/requests.json` |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — the Sales Rep storefront plugin.

## Root Cause Analysis
- `sales-rep-task-filters.vue`: `.sales-rep-task-filters { @apply flex flex-col gap-3 sm:flex-row; }` — no `flex-wrap`; each select is `sm:w-44 sm:shrink-0`, the multi-selects `sm:w-52` → 208 + 176 + 208 + 2 × 12 = 616 px hard floor.
- `pages/sales-rep-tasks-page.vue` (`&__toolbar`) only goes side by side at `lg:flex-row`, so nothing sizes the column to 616 px between `sm` and `lg`.
- Not by design: nothing in the PR's comments or source accepts the overflow.
- Also observed (Low, same cause family, not filed): at 1024 px the 616 px row leaves the search box 97 px, placeholder cut to "Searc" (`investigations/VIS-2/screenshots/vis2-1024-narrow-search.png`).
- Package: `reports/tickets/Sprint26-22/VCST-6157/vcst/investigations/VIS-2/` (`root-cause.md`, `evidence-index.md`, `source/findings.md`).

## Regression
N/A — `sales-rep-task-filters.vue` is added by PR #33; the previous status control (`sales-rep-task-scope-chips.vue`) is removed by the same PR.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront (module-embedded storefront plugin)
- **Suggested repo:** VirtoCommerce/vc-module-sales-rep (open PR #33, branch `feat/VCST-6157-tasks-by-customer`)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Sales Rep Hub storefront plugin — Tasks filters
- **RCA anchor:** `src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/components/sales-rep-task-filters.vue` (`.sales-rep-task-filters`, `&__select`)
- **Routing confidence:** MEDIUM — overflow measured and cause read from source; no base build to compare
