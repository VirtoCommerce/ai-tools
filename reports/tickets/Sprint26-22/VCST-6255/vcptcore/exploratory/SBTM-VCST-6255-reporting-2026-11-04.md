# Exploratory Session: Sales Rep Reporting (/company/customer-sales), VCST-6255
**Date:** 2026-11-04 (two legs: 23:10–23:16Z Nov 3, 08:05–08:09Z Nov 4; a 30-min MCP hang on browser_resize sat between them)
**Duration:** ~35 min active of the 60-min box | **Lane:** playwright-firefox (current plugin build, no CDN-variant symptoms)
**Platform:** vcptcore-qa, VirtoCommerce.SalesRep 3.1017.0-pr-28-9f00 | **Theme:** 2.62.0-pr-2624-0539-0539704a
**Session type:** [EXP+VAL] | **Discovery technique:** User-flow edge enumeration + surprise-seeking time
**Charter:** ticket mode, Test Model `test-model.md` (mission items 1–5, then the open half). Not covered by 089/093/093b/106 and not in VC-* catalog
**Edge-Case Refs:** ECL-7.x, ECL-12.1, ECL-13.1 | **BL Refs:** BL-SR-002, BL-SR-005, BL-SR-011, BL-SR-012, BL-A11Y-001..004
**Browser TZ:** UTC+3. The query's month windows start at 21:00Z, so the windows are local-time, as R4 states.

## Net-New Scenarios Discovered
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate | Suggested next charter |
|---|---|---|---|---|---|---|
| 1 | Status-only Cancelled order is counted while the page footnote says "cancelled orders are excluded" | new page | AcmeCorp Q4 shows $875 / 7 orders, which includes the $80 status-Cancelled order. TechFlow Nov to date shows $1.6K, which includes SCANCEL $555.50 (the AC4 reading is $1K). The footnote and the chart notes say "excluded". | ECL-13.1, BL-SR-005 | PROMOTE → 093 family (Reporting suite), AC4 case | none |
| 2 | Money tiles drop the trailing zero: "$490.8", "$400.8" | new page | Compact formatter on the tiles. The same value shows as "$401" in the tooltip, so the format is inconsistent across surfaces. | ECL-12.1 | PROMOTE → reporting RENDER case | sweep every compact value |
| 3 | "All orders →" drops the selected customer and period | WAIVED R7 cell | With AcmeCorp + Q4 selected, the link goes to `/company/customer-orders` with no filter: every customer, 100 pages, Cancelled rows included. | NONE | PROMOTE → PARITY case (row 23) | none |
| 4 | Zero-org rep: `statistics: null` renders as a confident all-zero report | row 14 HYPOTHESIS | Page mounts, "All my customers (0)", $0 / 0 / —, no empty-state text and no error. The y-axis is drawn $0–$4 for empty data. | BL-SR-012 | PROMOTE → FALLBACK case (row 14 oracle) | product: empty-state wording? |
| 5 | Period/customer changes use history replace | new page | Back from All orders restores `?period=q4&customer=…` correctly. The next Back leaves the page; Q1→Q2→Q4 were never history entries. | NONE | DECLINE: reasonable design, record as {OBSERVED} | none |
| 6 | Current-month bar is invisible next to a large closed month | new | All, Q4: Nov $1,957 to date with a $14.7K projection, against Oct $2.8M. The to-date bar plus outline renders as a flat dashed line at $0. | NONE | DECLINE: scale artefact, UX question only | none |

## Oracle Feedback
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Contradicted (SPEC vs build) | AC4 / footnote copy vs BL-SR-005 (flag only) | #1, screenshot 3x-03 | caller 5-triage; `/qa-review-oracles bl` if the PO confirms the status rule |
| Candidate new invariant | Reporting with null statistics shows an empty state, not zeros | #4, 3x-09 | `kb_capture`; needs a human source |
| Candidate new pattern | Compact money formatter truncates cents inconsistently with the tooltip | #2, 3x-08 | `/qa-review-oracles ecl` (ECL-12.x) |

## Bugs Found (for caller triage; none filed)
| # | Severity | Title | Evidence | Net-new? |
|---|---|---|---|---|
| 1 | Medium (AC4 conflict, held per model) | Status-only Cancelled orders counted although the page states "cancelled orders are excluded" | 3x-03 | Yes (the UI copy half) |
| 2 | Low | KPI tiles render money with one decimal ("$400.8") | 3x-08 | Yes |
| 3 | Low | All orders link loses the customer/period context | snapshot only | Yes |
| 4 | Low, a11y | "Show as table" is a `generic` element with no role/expanded state. Each chart has two buttons with the same name, "Show last year on …". | a11y tree | Yes |
| 5 | Low | Zero-org rep sees a zero report with no empty state | 3x-09 | Yes |
| 6 | Low (known pattern, SR-HD-108) | The raw key `Sales_rep.navigation.link` flashes in the Corporate rail during first load, here for a REP | 3x-01 | No |

## Risk Areas
- Local-time windows (UTC+3 here): an order at 21:00–23:59Z on the last day of a month lands in the next month for this rep. This is the VC-PLATFORM-005 seam against the Dashboard's YTD.
- The query runs on POST `/graphql` (operation `SalesRepMonthlyOrderStatistics`), not `/graphql/sales-rep`.
- Statistics are cached client-side: a page loaded before the 3a seed kept Nov $0 until a full reload.

## Observations
- Loading state: tiles are dimmed and show a spinner, but the a11y tree reads "$0 / 0 / —" with no busy flag for 2–10 s. The worst case was ?period=bogus&customer=garbage, at ~10 s.
- Tab into the Customer combobox auto-expands the listbox and blanks the shown value. This is likely the shared VcSelect.
- Keyboard: Tab reaches the Oct bar, which shows its tooltip. ArrowRight moves to Nov and stops there (Upcoming Dec is not focusable). Escape dismisses the tooltip.
- 375px: tabs wrap and the table becomes a stacked list; no clipping seen. The table state is not persisted across reloads.

## Questions
- Should status-only Cancelled orders be excluded (AC4) or counted (BL-SR-005)? The footnote text currently promises exclusion.
- Should All orders carry the customer and period, and should it be creator-scoped ("my" orders)?
- On day 4 the tooltip shows "vs Oct -100.0%" (projected $0) and later "-99.5%". Is a MoM % against a projection meaningful this early in the month?

## Charter-from-Gap
- Month-boundary orders (21:00–23:59Z on the last day) as seen by a UTC+3 rep vs a UTC rep, Reporting vs Dashboard YTD.
- Every compact-money surface (tiles, axis, "Average $X / closed month") with non-integer values.
