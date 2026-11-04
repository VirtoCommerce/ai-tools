# Testing checklist — VCST-6255 Sales Rep Hub Reporting (vcptcore)

Run folder: reports/tickets/Sprint26-22/VCST-6255/vcptcore · Model: test-model.md (rows #1–28) · Path: FULL
Build: VirtoCommerce.SalesRep 3.1017.0-pr-28-9f00 · theme 2.62.0-pr-2624-0539 · Platform 3.1093.0
Page: **/company/customer-sales** (the ticket's /company/reporting is stale — VCST-6668 moved it)
Accounts (store B2B-store; password = bare NAME `TEST_USER_PASSWORD` on the lanes): @td(SR_REP_PRIMARY.email) ·
@td(SR_REP_PAGING.email) no-data · @td(SR_REP_NOCUSTOMERS.email) zero-org · @td(TECHFLOW_BUYER) non-rep (password via
@td(TECHFLOW_BUYER.password)).
Seeded (3a, 2026-11-03 ~23:15Z, November): SR_MTD_ORDER_WEST_1 $100.50 · _WEST_2 $300.30 (AcmeWest) · _TECH_1 $1,001.00
(TechFlow) · _FLAG_CANCELLED $777.70 IsCancelled=true (AcmeWest) · _STATUS_CANCELLED $555.50 Status=Cancelled flag=false
(TechFlow) · _OTHER_CREATOR $999.90 created by TECHFLOW_BUYER (TechFlow).
Statistics truth (npm run sales-rep:stats, SR_REP_PRIMARY, Nov): All 4 / $1,957.30 (AC4 reading 3 / $1,401.80) ·
AcmeWest 2 / $400.80 · TechFlow 2 / $1,556.50 (AC4 reading 1 / $1,001.00) · AcmeCorp 0. YTD 1,239 / $2,851,596.97.
Closed months: Jul 1/$133.20 · Aug 15/$2,901.47 · Oct 1,219/$2,846,605.00 · all of 2025 = 0.

Result: PASS / FAIL / BLOCKED + evidence ref. Oracle: {SPEC}=ticket AC/description, {BL-*}.

## A. Access and navigation
| # | Condition | Expected | Oracle | Model | Result |
|---|---|---|---|---|---|
| B1 | Hub menu for a rep | "Reporting" is the 2nd item (after Dashboard), chart icon, href /company/customer-sales | {SPEC AC1} | 1 | |
| B2 | Ticket path /company/reporting for a rep | record what renders (404 observed in 3x); the AC text is stale | {SPEC AC1} — doc drift | 1 | |
| B3 | Non-rep TECHFLOW_BUYER: menu | no Sales Rep hub / no Reporting item | {BL-SR-011}{SPEC AC1} | 16 | |
| B4 | Non-rep opens /company/customer-sales?period=q3 | redirected (to /account/dashboard), no figures rendered | {BL-SR-011}{SPEC AC1} | 16 | |
| B5 | Non-rep token → salesRepCustomerOrderStatistics | no figures (HTTP 200, data null) — assert data, not only errors[] | {BL-SR-002}{BL-SR-011} | 17 | |

## B. Defaults and selection (URL state)
| # | Condition | Expected | Oracle | Model | Result |
|---|---|---|---|---|---|
| B6 | First load | "Current year" active, Customer "All my customers (7)" | {SPEC AC2} | 1 | |
| B7 | Each period tab (6m, 12m, year, Q1–Q4) | URL ?period= set; tiles, both charts, table, footnote re-scope; labels never mismatch figures | {SPEC AC3} | 1,6,7 | |
| B8 | Pick AcmeWest, then TechFlow | URL ?customer=<orgId>; Nov tile = $400.80 / 2 orders, then $1,556.50 / 2 (as statistics) | {SPEC AC3}{BL-SR-002} | 2 | |
| B9 | Reload / paste the URL with ?period=q4&customer=<TechFlow> | same selection and figures restored | {SPEC AC3} | 1 | |
| B10 | ?customer=<an org the rep does not serve> and ?customer=garbage | never another org's figures, even transiently; falls back to All | {BL-SR-002 a} | 15 | |
| B11 | ?period=bogus | Current year shown, no error (URL keeps bogus — record) | {SPEC AC3} {OBSERVED baseline} | 20 | |
| B12 | Customer type-to-search "acme" | matches AcmeCorp + AcmeWest; selecting re-scopes | {SPEC toolbar} | 2 | |

## C. Figures (the money)
| # | Condition | Expected | Oracle | Model | Result |
|---|---|---|---|---|---|
| B13 | Q3 (closed only) | Jul $133.20/1, Aug $2,901.47/15, Sep $0/0 in bars, tooltip, table; no current/upcoming column | {SPEC metrics 1–3} | 6 | |
| B14 | 12 months | Dec 2025 … Nov 2026, correct years in labels/table; 2025 months $0 | {SPEC}{BL-SR-001} | 7 | |
| B15 | Flag-cancelled order (AcmeWest $777.70) | NOT counted anywhere (AcmeWest Nov = $400.80) | {BL-SR-005}{SPEC AC4} | 3 | |
| B16 | **Status-only Cancelled (TechFlow $555.50; AcmeCorp Oct $80)** | NOT counted per AC4 — TechFlow Nov $1,001.00 / 1, All Nov $1,401.80 / 3. (3x: page shows $1,556.50 — counted) | {SPEC AC4} vs {BL-SR-005} | 4 | |
| B17 | Buyer-created order (TechFlow $999.90) | NOT counted (creator scope) | {BL-SR-002 b} | 5 | |
| B18 | AOV per month = Sales/Orders | AcmeWest Nov AOV $200.40 (whole-$ display $200); TechFlow per statistics | {SPEC AC5} | 11 | |
| B19 | Zero-order customer RepOnly-Primary | $0 / 0 / AOV "—", no NaN/Infinity anywhere | {SPEC AC5,AC7} | 8 | |
| B20 | Current month tile + bar | "November to date · day X of 30"; projection = to-date × 30 / X; solid bar inside dashed outline (sales chart) | {SPEC metric 4, AC6} | 9 | |
| B21 | AOV chart current month | SPEC "same column states" ⇒ outline expected; record (3x: none) | {SPEC} — DRIFT | 9 | |
| B22 | Tooltip, current month | Revenue to date, Projected month end, vs Oct (projection vs Oct), Revenue Nov 2025 "—" | {SPEC tooltip} | 10 | |
| B23 | No last-year baseline (all 2025 = 0) | no YoY badge anywhere; tooltip LY "—"; no "Infinity"/"NaN"/"+100%" | {SPEC AC7}{BL-SR-003} | 12 | |
| B24 | Percentages | one decimal everywhere a % shows (tooltip MoM, tile "% of the month") | {SPEC AC9} | 1 | |
| B25 | Reporting YTD vs Dashboard YTD (same rep, same minute) | equal | {BL-SR-002}{SPEC} | 22 | |
| B26 | Card + footnote copy | card title per SPEC "My sales" (code: "Sales statistics" — record); footnote "{from} – {to}, current month to {today}. …" | {SPEC layout} | 1 | |
| B27 | KPI tile money format | consistent with tooltip/table (3x: tiles "$400.8") | {SPEC}{BL-SR-013} | 25 | |
| B28 | MoM early in month | record the "vs Oct" % on a small to-date | {HYPOTHESIS} | 28 | |

## D. Data shapes
| # | Condition | Expected | Oracle | Model | Result |
|---|---|---|---|---|---|
| B29 | No-data rep SR_REP_PAGING | zeros, AOV "—", no badges, no error | {BL-SR-012}{SPEC comment 2026-10-29} | 13 | |
| B30 | Zero-org rep SR_REP_NOCUSTOMERS | page opens, "All my customers (0)", zeros, no crash (3x: no empty-state text) | {BL-SR-011}{OBSERVED} | 14 | |
| B31 | Statistics query fails (block /graphql once) | "Couldn't load the report…" panel, toolbar usable, no stale figures | {BL-SR-012} gap-AC G1 | — (3x charter) | |

## E. Chart behaviour, a11y, layout
| # | Condition | Expected | Oracle | Model | Result |
|---|---|---|---|---|---|
| B32 | Last year switch (each chart) | on → smooth line with dots (all-zero here); off → hidden; state survives reload; charts independent | {SPEC AC8} | 21 | |
| B33 | Keyboard | Tab into chart, Arrow keys move, tooltip on focus, Escape closes; table reachable | {BL-A11Y-001,002} | 24 | |
| B34 | "Show as table" + switches a11y | toggle has role/expanded state; switches have distinct names | {BL-A11Y-001,002} | 26 | |
| B35 | Loading state | busy state is announced; figures not presented as real $0 | {BL-SR-012}{BL-A11Y} | 27 | |
| B36 | 375px | one-letter months, badges hidden, table → list, toolbar wraps, nothing clipped | {SPEC narrow}{BL-UI-*} | 18 | |
| B37 | Dark mode + a non-default preset | bars, outline, "Upcoming", badges, grid legible | {SPEC AC10}{BL-A11Y-003} | 19 | |
| B38 | "All orders →" | target and whether period/customer carry (3x: they do not; list is all creators) | {SPEC layout} | 23 | |
| B39 | Plugin labels in de / es | "Reporting" item and page strings translated, no raw keys | {BL-SR-013} | — (3x) | |
| B40 | Console / network on a clean load | no app errors; no 4xx/5xx for plugin chunks or SalesRepMonthlyOrderStatistics | DoD | 1 | |

Not covered (stated): reverse edge "cancel a counted order → month drops" (GAP, no fixture mutation) · last-year
badge/line with real values (unseedable baselines) · future-only quarter (none exists in November) · non-USD store.
