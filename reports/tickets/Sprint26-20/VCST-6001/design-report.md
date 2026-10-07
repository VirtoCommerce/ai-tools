# VCST-6001 - Step 4v visual lane (design-report)

Change: vc-frontend PR #2519 (storefront build `Ver. 2.59.0-pr-2519-1d9bc6dc`, confirmed in footer). Date 2026-10-06.
Surfaces: Storybook (Chrome DevTools MCP, role-agnostic) + storefront `/company/customer-orders` -> Filters -> Custom date
(`playwright-edge`, signed in as `@td(SR_REP_PRIMARY.email)` with bare key `SR_REP_PASSWORD`; role-gated page rendered real data, not an empty state).
Browser session closed at end; no tracker writes. Dark mode = `prefers-color-scheme: dark` emulation (theme toggle was "auto", which followed it; `html.dark` applied).

## Axis verdicts
| Axis | Verdict |
|---|---|
| a11y (WCAG 2.2 AA) | PASS for the picker; 1 WARN (4.1.3) + 1 FAIL-class contrast in dark (see F1); page-level pre-existing noise listed separately |
| design-system (BL-UI) | PASS on 003/004(date values)/006; FAIL-candidates F2/F3 (drawer placement, overflow) - attribution to PR unproven |
| vs. DESIGN | SKIPPED - ticket carries no Prototype/Claude Design link; no design:extract run. Not a pass. |

## Rows
| Row | Verdict | Evidence |
|---|---|---|
| B12 keyboard | PASS with WARN | Tab: Created date -> Start date -> "Open calendar: Start date". Enter opens the teleported calendar, focus lands on the typed date (Oct 20). ArrowRight+ArrowDown -> Oct 28 (correct). Escape closes calendar only, drawer stays open. 2nd Escape closes drawer, focus returns to the "Filters" trigger. WARN: after calendar Escape focus returns to the Start-date INPUT, not the "Open calendar" button that opened it (BL-A11Y-001 wording "trigger"); also the split clear button is not in the Tab order. |
| B13 no shift on error | PASS | Split 1920: rect Δ = 0 for all 3 inputs, first status row, Apply and dialog before vs after error (dlg 346/440x752.8, Apply top 1051.6, inputs top 440.6/518.6 unchanged). Combined 375: valid vs invalid snapshots identical (status label top 180, last customer row 583.6, Apply 640.8, dlg h 756.8). Row is reserved. `4v-drawer-split-1920-error.png`, `4v-drawer-combined-375-valid.png` |
| B14 contrast | FAIL (dark) / PASS (light) | Light: error text rgb(222,49,49) on white = 4.56:1 (passes only barely; font-size 10px). Focus ring rgb(27,120,155) 1.6px on white ~5:1 PASS. Dark: same red on rgb(10,9,11) = 4.34:1 < 4.5 at 10px -> BL-A11Y-003 FAIL; dark focus ring rgb(142,210,235) PASS. `4v-drawer-split-1280-dark-error.png` |
| B15 targets / clipping | PASS | 375 combined: calendar button 38x38, Reset/Apply 31.2 tall, Close 52x52, applied-filter chip close buttons 28x28 (names "Remove filter ..."). 1024 and 1280 split: date inputs 138px wide, scrollWidth == clientWidth, "10/20/2026" not clipped (VCST-6002 not reproduced). Breadcrumb links are 17px tall (pre-existing, not from PR). `4v-drawer-split-1024.png` |
| B16 axe | PASS (picker) | axe 4.10.2 wcag2a/aa/21/22aa on open drawer with error shown: 0 violations, 0 incomplete. Calendar popover (open): 0/0. Full-page scan found only pre-existing, non-picker items: color-contrast serious x1 (page "Filters" trigger text, background button) + 36 incomplete contrast nodes (header badges, table headers); aria-valid-attr-value (critical, incomplete) on the Filters trigger (aria-haspopup=dialog/controls, VCST-5869 family). None introduced by the picker. |
| B18 Storybook names | PASS | vcinput--clear-button-aria-label: clear button `aria-label="Clear: Start date"`. vcinput--clearable: fallback "Clear". vcdatepicker--default: "Open calendar"; --clearable: "Clear" + "Open calendar" (input labelled Date). vcdaterangepicker--split: "Clear: Start date", "Open calendar: Start date", "Clear: End date", "Open calendar: End date" (+ input labels Start/End date). --clearable (combined): "Clear date range", "Open calendar". Storefront split drawer: "Open calendar: Start date/End date"; combined 375: single "Open calendar" inside group "Date range". |

## Findings (severity guesses)
- F1 (Medium, a11y, likely systemic not PR-specific): VcInputDetails error text uses the same danger red in dark mode, 4.34:1 at 10px (needs 4.5). Light 4.56 is borderline. Token-level; picker inherits it.
- F2 (Medium, BL-UI-004/WCAG 2.4.11 candidate, attribution UNKNOWN): at 375x800 the Filters popover opens with its top ~24px above the viewport under the sticky header (title, "Created date" and the 52px Close button covered; Close top = -24 vs header bottom 90). Seen with the page scrolled (scrollY 284). Also observed at 1024x800 (dlg top -60) when resized while open. A fresh open at 1280x900 / scroll 0 was fine. Not isolated to the picker (no control run on a build without the PR); the reserved error row adds height, so it may contribute.
- F3 (Medium, BL-UI-004, attribution UNKNOWN): at 375 with the drawer open document scrollWidth = 582 > 375 (horizontal scrollbar visible in `4v-drawer-combined-375-reopen.png`); closed drawer = 360 (no overflow). Overflowing node not identified (no element rect beyond the viewport).
- F4 (Low, 4.1.3 WARN): error message container has no role/aria-live; inputs do carry aria-invalid=true and aria-describedby to the details id, so it is read on focus but not announced on appearance.
- F5 (Low, 4.1.2/2.4.x advisory): combined mode exposes one generic "Open calendar" (no field name) and no per-field clear; acceptable under group "Date range", noted because the PR intent was contextual names.
- F6 (Info): split input role is `combobox`, combined inputs `textbox` - inconsistent role by breakpoint.
- Console: 0 errors, 1 warning on the storefront (not investigated).

## Not covered
Real SR output; Coffee/Red preset sweep (storefront theme preset not switched); Storybook error-state/with-footer stories not individually measured (storefront covers the error/footer behaviour); Firefox/Chrome parity.
Screenshots: `reports/tickets/Sprint26-20/VCST-6001/screenshots/4v-*.png` (7 files).
