# VCST-6153: Fix verification on the storefront (Top sellers numbers wrap mid-number)

**Verdict: FIX VERIFIED.** The wrap no longer reproduces in 3 of 3 runs, and items 1-4 and 6-8 pass. Item 5 fails
because the sibling *Recent orders* widget has the same defect. That widget is outside the PR's diff, so this is
not a regression from the fix. Item 9 is blocked because only 5 rows exist (`take: 5`). Item 10 passes.
Read-only run: nothing was posted to Jira and no ticket was transitioned.

| | |
|---|---|
| Env | vcptcore-qa · store `B2B-store` · `playwright-chrome` · 2026-10-06 |
| Theme (seen on the storefront) | footer `Ver. 2.59.0-pr-2537-faa8-faa8dd9e`, which matches the deploy pin |
| Fix | vc-frontend PR #2537 @ `faa8dd9e`. Diff (GitHub API): only `client-app/modules/sales-rep/components/top-sellers.vue` (+14/-2) |
| Rep | `@td(SR_REP_PRIMARY.email)` ("Priya Rao"). Signed in on the first try with the `SR_REP_PASSWORD` secrets key |
| Customer used | `AGENT-TEST-Org-TechFlow-20260310` · `96f109a7-9010-4691-b6a1-bef25cca3d04`. It has the most rows (5) and the widest revenue (`$2,397.00`) of the rep's 5 customers |
| Original repro org | Contoso `3af19e5f-…` is **not served** by this rep: "Customer not found or not in your customers." (`00-contoso-profile-probe.png`) |

## Checklist

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | STR on the fixed build: numbers do not wrap | **PASS 3/3** | Each run reloads the page and checks both 1300 and 1024 px (run 3 starts at 1024). 15/15 number cells are single-line every time |
| 2 | `nowrap` and a single-line box at 1300 and 1024 px | **PASS** | See the computed-style table below. Also checked 1280 px, the tightest 2-column layout: 0 non-compliant cells |
| 3 | Fix is at column level, shared rule untouched, Product still wraps, no overflow | **PASS** | `top-sellers__number` is on the `th` and `td` of #, Units and Revenue. `tbody` keeps `word-break: break-word`. Product cell is `white-space: normal`, and the 86-character name wraps to 3 lines (1300) or 2 lines (1024). Table scroller `scrollWidth == clientWidth` (543/543, 711/711), and so is the document (1285/1285) |
| 4 | Sorting by Units and Revenue still works and values stay single-line | **PASS** | Revenue: `aria-sort=descending`, sends `sort: by-revenue`, re-ranks rows to `$2,397.00 / $780.00 / $739.94 / $324.00 / $300.00`, 0 wrapped cells. Units: `by-units`, the original order returns, 0 wrapped cells. Sorting is descending only (a second click keeps the order) (`04-…sorted-revenue-1300.png`) |
| 5 | Recent orders widget unaffected: Total single-line, layout unchanged | **FAIL (sibling defect, not a regression)** | At 1300 px, **Total renders `$33.0` / `0`** (71 px cell, `white-space: normal`). Date wraps too (`Aug 17,` / `2026`). At 1024 px, Total stays on one line. The PR does not touch this widget, so this is the same root cause in a second component (`05-…recent-orders-1300.png`) |
| 6 | Mobile at 390 px: every value shown, nothing clipped | **PASS** | No `<table>`. Five `top-sellers__mobile-item` rows, for example `4 \| (146 cm) Atomic… \| JGZ-12806504 · 3 · $2,397.00`. No child element extends past the widget box, and widget and document scroll widths equal their client widths (`06-…390-mobile.png`) |
| 7 | No new console errors | **PASS** | 0 errors across all 12 console logs for the session. The only warning is a clean WebSocket close (code 1000). No App Insights 400 appeared in this run |
| 8 | `salesRepTopSellers` matches the table | **PASS** | The response (request #214: `take: 5`, `sort: by-units`, USD) matches the table for rank, name, SKU, units and `revenue.formattedAmount` on all 5 rows, for example `rank 4 · 3 · "$2,397.00"` |
| 9 | Rank "10" stays on one line | **BLOCKED (data)** | Max rank available is **5**. The widget requests `take: 5`, and every customer of this rep has at most 5 rows (TechFlow 5, AcmeCorp 4, BuildRight 3, AcmeWest 1, RepOnly 0). Setting Max rows to 10 in Edit layout had no effect (see Observations). The fix covers rank through the same class (`#` cell is `nowrap`, 40 px), but 2 digits were not observed |
| 10 | BL-UI alignment unchanged | **PASS** | # is `center` in both `th` and `td`. Units and Revenue are `end` (right). Revenue keeps `font-bold` |

### Computed-style evidence (TechFlow, number cells)

`lines` counts the distinct text-line tops, from a Range over the cell. Measured at viewport widths of 1300, 1024 and 1280 px.

| Viewport | Widget / Product col | # (40 px) | Units (83 px) | Revenue (95 px) | Product name lines |
|---|---|---|---|---|---|
| 1300 | 557 / 324 px | `1..5` nowrap, center, lines=1 | `40,12,9,3,3` nowrap, end, lines=1 | `$140.00 … $2,397.00 … $780.00` nowrap, end, lines=1 | 86-character name = 3 lines; 49-character name = 2 lines |
| 1280 | 537 / 304 px | nowrap, lines=1 | nowrap, lines=1 | nowrap, lines=1 | wraps |
| 1024 | 725 / 492 px | nowrap, lines=1 | nowrap, lines=1 | nowrap, lines=1 | 86-character name = 2 lines |

Header classes: `vc-table__title--align--center top-sellers__number` (#),
`…--align--right …--sortable top-sellers__number` (Units), `… top-sellers__number font-bold` (Revenue).
Cell classes: `vc-table__cell vc-table__cell--align--{center|right} top-sellers__number [font-bold]`.

Layout note: the profile grid has 2 columns from **1280 px** and 1 column at 1279 px and below. At 1024 px the
widget is therefore wider (725 px) than at 1300 px (557 px). The tightest table layout is 1280 px, so it was added.

## Comparison with the RED baseline

Before the fix (`2.59.0-pr-2476-fcf0`, `reports/bugs/screenshots/BUG-salesrep-top-sellers-*-wraps-mid-number.png`),
Revenue rendered as `$1,462.1` / `5`. Now `$2,397.00`, the widest value available here, stays on one line, and
only the Product column takes the lost width (`03-…1280-tightest.png`). The baseline data (Contoso, rank 10) cannot
be reached by this rep, so the comparison uses equivalent values, not identical ones.

## Observations (incidental, not filed)

1. **Recent orders Total and Date wrap mid-value** at 1300 px in the 2-column layout (`$33.0` / `0`). This is
   the same `.vc-table__body { word-break: break-word }` cause in `sales-rep-orders`, which is not covered by
   PR #2537. The bug report's RCA says Recent orders is safe "because its columns are short". That holds for the
   original data but not here, because long order numbers take the width. It needs its own ticket or a follow-up
   PR on that widget's Total and Date columns. Severity is Low, the same as VCST-6153.
2. **Top sellers "Max rows" (Edit layout) seems to have no effect.** Value set to 10 twice, once with `fill` +
   Enter and once with typed keys + Tab, then edit mode was closed. No request was sent, and after a reload
   `SalesRepTopSellers` still sends `take: 5` and the field shows 5 again. Seen once on one account. Needs
   triage: it may be by design, or the setting may not be saved.
3. The Units header shows an **up** chevron while `aria-sort="descending"` (screenshots 01 and 03). This is
   cosmetic and needs a design check.

## Evidence

Screenshots are in `reports/tickets/Sprint26-19/VCST-6153/screenshots/`: `00-contoso-profile-probe.png`,
`01-techflow-top-sellers-1300.png`, `02-techflow-top-sellers-1024.png`, `03-techflow-top-sellers-1280-tightest.png`,
`04-techflow-sorted-revenue-1300.png`, `05-techflow-recent-orders-1300.png`, `06-techflow-top-sellers-390-mobile.png`.
Console logs and network data are in `test-results/chrome/` (console `2026-10-06T07-58…08-05*.log`; GraphQL list `vcst6153-net.txt`).
HAR: `test-results/chrome/har/session.har` (92 MB, written when the browser closed; gitignored).
KB: captured **KB-7C6D6C33** and confirmed **KB-A240F961**. No test data was created, so no teardown was needed.
