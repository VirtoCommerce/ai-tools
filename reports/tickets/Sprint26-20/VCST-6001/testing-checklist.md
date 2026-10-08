# Testing checklist — VCST-6001 `[Sales Rep] Adopt VcDateRangePicker in the customer-orders filter`

- **Path:** FULL · `feature-test` · Story · shape class: not `ui-kit` · Test Model: `reports/ba/test-models/VCST-6001-2026-10-06.md` (+ 3x amendment)
- **Build:** vcptcore-qa, theme `2.59.0-pr-2519-1d9b-1d9bc6dc` (PR vc-frontend#2519 head `1d9bc6dc`); Storybook `vcptcore-qa-storybook` from the same PR
- **Data:** `data_surface: false` — rep `@td(SR_REP_PRIMARY.email)` (secret `SR_REP_PASSWORD`), served orgs incl. `@td(ORG_TECHFLOW.platform_id)`; seeded orders on ≥3 creation days (live-discovered: Aug 16/17/18 2026, `AGENT-TEST-SRO-TZ-VCPTCORE-*`); storefront buyer `{{ORG_USER_EMAIL}}` (secret `ORG_USER_PASSWORD`) for `/account/orders`
- **Routes:** `{{FRONT_URL}}/company/customer-orders` · customer-scoped orders (My customers → customer → All orders) · `{{FRONT_URL}}/account/orders` · Storybook VcInput / VcDatePicker / VcDateRangePicker
- **Discovery:** `reports/exploratory/SBTM-VCST-6001-2026-10-06.md` (3x observations are discovery, not verdict evidence — re-executed below)
- **Regression:** C1 = new SR-CO Draft rows + 2a REPAIR/RE-BASE ids · Feature Release Gate: `not-assessed` (no C2 on /qa-test)

Legend: Track `4a` = qa-frontend-expert (playwright-chrome) · `4v` = ui-ux-expert · Verdict filled at 5-report.

## A. Done-when (story ACs)

| # | Condition | How | Track | Verdict |
|---|---|---|---|---|
| A1 | Filter renders ONE VcDateRangePicker (`fieldset`/class `vc-date-range-picker`), no two independent pickers | open drawer → Custom date; DOM | 4a | PASS — 4a-01 |
| A2 | Exposed as `group "Date range"` in split (1920) AND combined (375) | a11y tree both widths | 4a | PASS |
| A3a | Split: both inputs `aria-haspopup="dialog"` | DOM | 4a | PASS |
| A3b | Combined: the single "Open calendar" button carries `aria-haspopup="dialog"` | DOM | 4a | PASS |
| A4 | `aria-invalid` false at rest → true on start>end → false after correction | type 08/18 → 08/16, then fix | 4a | PASS |
| A5 | <640px combined single field visibly labelled "Date range"; ≥640 split Start/End (639 vs 640) | resize | 4a | PASS — 4a-09 |
| A6 | Clearable (AC3): no in-field clear in either layout; footer Clear empties only the open field and sends no request until Apply. **Decision is recorded only in the PR body, not the ticket** → report as AC3 DRIFT (ticket premise "clearable today" is false: `dev` source has no `clearable`) | calendar footer | 4a | PASS + AC3 DRIFT (decision recorded in comment 111504) |
| A7 | Separator `aria-hidden="true"` in split and combined — **read the DOM attribute**; an a11y snapshot printing "–" is not evidence | DOM | 4a | PASS (DOM) |
| A8 | Chip date text == input text, zero-padded (`Start: 08/01/2026`) for typed and calendar-picked values | apply 08/01–08/17 | 4a | PASS — 4a-02 |
| A9 | Calendar buttons "Open calendar: Start date" / "Open calendar: End date" (split) — distinct | a11y tree | 4a | PASS |
| A10 | Chip close buttons "Remove filter “Start: …”" / "Remove filter “End: …”" — distinct, contextual | a11y tree | 4a | PASS |
| A11 | No duplicate "Clear" names on the surface (no in-field clear exists — stated N/A by construction) | a11y tree | 4a | PASS (N/A by construction) |

## B. Gap conditions (1d gap-ACs + model + 3x)

| # | Condition | How | Track | Verdict |
|---|---|---|---|---|
| B1 | **FLOW:** custom 3-day range (Aug 16–18) filters the cross-customer grid to exactly the live-discovered order count in the window; chips + grid agree | calendar pick → Apply; compare to `salesRepCustomerOrders` totalCount | 4a | PASS — 12/12, 4a-02 |
| B2 | Start>end: message "End date must be on or after start date" shown once under the group, Apply disabled, **no request sent** | typed + calendar | 4a | PASS — 4a-03 |
| B3 | 02/31/2026: invalid, Apply disabled, applied filter unchanged; record message wording + whether drawer Reset can clear the draft | type | 4a | PASS — 4a-04 (Reset disabled when nothing applied: observed) |
| B4 | Start-only applies open-ended `createddate:["…" TO]` + single chip; end-only `[TO "…"]`; totalCount = rows/pages | network | 4a | PASS |
| B5 | Custom(invalid) → Last week → Custom: Apply state correct at each step; no stale invalid draft | toggle | 4a | PASS |
| B6 | Remove one chip of a CUSTOM range: one request, drawer shows the remaining bound | chip × | 4a | PASS |
| B7 | **Remove the Start chip of an APPLIED Last week preset → drawer combobox must not still claim "Last week" while the grid is open-ended** (3x candidate; existing SR-CO-034 EXPECTED-RED ⇒ pre-existing; no BL — proposed invariant) | preset → chip × → reopen | 4a | FAIL — PRE-EXISTING (A/B ab-2), Medium draft, not filed |
| B8 | Reset filters: one request `filter:""`, chips gone, picker empty | Reset | 4a | PASS |
| B9 | Chip day == picked day in a UTC+3 browser (and UTC− if the lane can emulate); preset Last week bounds = rolling local window | network + chips | 4a | PARTIAL — UTC+3 PASS; UTC− NOT REACHED (no tz emulation) |
| B10 | Customer-scoped orders route renders the same picker and filters only that customer | route 2 | 4a | PASS — 4a-06 |
| B11 | Non-en culture (any non-en language the store offers): "Date range" label, Remove-filter names translated, no raw `sales_rep.*`/`ui_kit.*` key; chip format = that locale's input format | language switch | 4a | FAIL — PRE-EXISTING (A/B ab-3), Medium draft, not filed |
| B12 | Keyboard only: Tab → inputs → calendar buttons; Enter opens, arrows move, Esc closes and focus returns to the trigger (teleported calendar) | keyboard | 4a + 4v | PARTIAL — focus returns to input not button (Low, pre-existing) |
| B13 | Error row reserved — no layout shift when the error appears (BL-UI-003), split + combined | measure | 4v | PASS (4v) |
| B14 | Error text / focus ring contrast ≥4.5:1 / ≥3:1, light + dark (BL-A11Y-003) | measure | 4v | FAIL dark 4.34:1 — PRE-EXISTING Low (VCST-5935 family); light 4.58 PASS |
| B15 | Combined field + calendar button touch targets ≥24×24 at 375 (BL-UI-006); no clipping in split at 1024–1280 (VCST-6002 regression, BL-UI-004) | measure | 4v | PASS (4v) |
| B16 | axe-core on the open drawer: 0 critical/serious introduced by the picker | axe | 4v | PASS — 0 violations on drawer/calendar (4v) |
| B17 | **Storefront `/account/orders` (reverse edge of the kit change):** range filter still filters; split calendar buttons now "Open calendar: Start date/End date"; record chip format + "Close chip" names (known PR follow-up, out of scope) | buyer login | 4a | PASS (rep account; buyer login refused) — 4a-10; chips unpadded = PR follow-up |
| B18 | Storybook: `VcInput — Clear Button Aria Label` story renders the custom name; VcDatePicker uses `calendarButtonAriaLabel`, falls back to "Open calendar"/"Clear" when unset; VcDateRangePicker `split` story exposes per-field names | Storybook | 4v | PASS (4v) |
| B19 | Console: no new errors; network: no 4xx/5xx, no GraphQL `errors[]` in 200 on any filter action | throughout | 4a | PASS |

## C. Coverage map — every condition has a home

| Condition | Covered by |
|---|---|
| A1–A11, B1–B19 | this checklist (4a/4v) |
| Durable regression for A2/A3/A7/A8/A9/B1–B5/B9–B12 | SR-CO-039…051 (13 Draft rows, plan `plan-097.json` rows 1–13) — PENDING-A **closed** |
| B7 preset × chip removal | existing **SR-CO-034** (CONFIRMED — same observable, EXPECTED-RED, predates the PR); plan row 14 not authored |
| A10 chip close names | existing SR-CO-037 (CONFIRMED) |
| B6/B8 chip removal / reset requests | existing SR-CO-035 (CONFIRMED) |
| B17 `/account/orders` selectors | 014b ORD-074/078/080 REPAIRED (exact `aria-label='Open calendar'` → prefix match); ORD-076 CONFIRMED |
| B13–B16, B18 | visual lane only (no suite row — Storybook/visual measured per run) |

### Phase 2a — disposition record (Artifact A)

Scans: `tc:scope --domain sales-rep` (8 observables: Invalid date range · Start date · End date · date range · chip · separator · em dash · M/D/YYYY) → 9 suites, 480 rows, 29 hits · `tc:scope --suite 014,014b,015 --observable "Open calendar" --observable "Close chip"` → 150 rows, 11 hits · corpus grep `open calendar` (014, 014b, 015). `unscannable[]`: none. `unmatchedObservables[]`: "Invalid date range", "M/D/YYYY" (sales-rep), "Close chip" (kit).

| Disposition | Ids |
|---|---|
| **REPAIR** (applied, re-linted, no new findings vs HEAD) | ORD-074, ORD-078, ORD-080 |
| **RE-BASE** (old assertion kept, runs in C1) | SR-CO-032 (de-DE chip `Beginn: 1.1.2030` unpadded vs new padded format) |
| **SUPERSEDED** | none |
| **CONFIRMED** | 097: SR-CO-008, 012, 013, 015, 017, 022, 026, 027, 033, 034, 035, 036, 037 · 089: SR-FE-045, 046, 047, 051, 052 · 091: SR-CP-009, 010, 033, 054, 058 · 093: SR-HD-011, 051, 053, 055 · 050m: SR-GQL-092 · 014/014b: ORD-076, ORD-081, ORD-082, ORD-083, ORD-097, ORD-098 (and the two 014 natural-language "Open calendar" steps) · 015: QUOTE-031, QUOTE-032 |

**C1 exact set:** suites `097,014b` · `--ids SR-CO-039..SR-CO-051, SR-CO-032, ORD-074, ORD-078, ORD-080` · `--no-promote`.

## Not covered (stated)

- UTC− browser timezone — covered only if the 4a lane can emulate it; otherwise NOT REACHED.
- Panel title "Filters" vs "Orders filters" — in the ticket's table, not in Done-when; observed only.
- VCST-6002 clipping, VCST-5869 dialog semantics — out of scope per ticket.

## Result — PASS WITH NOTES (2026-10-06)

- C1 `REG-2026-10-06-1457`: 13/17 PASS · SR-CO-047 BLOCKED (UTC−) · SR-CO-051 FAIL (pre-existing focus) · SR-CO-032 FAIL (RE-BASE: date chip now padded = correct; status chip = VCST-6175) · ORD-074 FAIL (stale dual-month expectation → /qa-review-tests --fix)
- Visual: `design-report.md` — a11y PASS (picker) · design-system PASS · vs. DESIGN SKIPPED (no Prototype link)
- **Accessibility findings (do not block):** focus to <body> after chip removal/Reset (Medium, pre-existing, NOT FILED — operator) · focus to input after calendar close (Low) · dark error contrast 4.34:1 (Low, VCST-5935 family)
- **Not filed (operator decision), drafts:** `reports/bugs/open/medium/BUG-SalesRep-CustomerOrders-{Stale-Preset-After-Chip-Removal,Raw-I18n-Key-After-Language-Switch,Mobile-Drawer-Horizontal-Overflow,Focus-Lost-After-Chip-Remove-Reset}.md`
- **Below severity floor (not filed):** footer Clear leaves calendar open (IN-SCOPE, Low) · focus-return target (Low) · dark contrast (Low) · /account/orders chip format (OUT-OF-SCOPE)
- Tracker comment: 111504 · Evidence: `screenshots/`, A/B control `screenshots/ab-*`
