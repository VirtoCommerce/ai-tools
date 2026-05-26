# Order History Date Picker — Live Exploration

## Environment
- URL: `https://vcst-qa-storefront.govirto.com/account/orders`
- Build: Storefront `2.50.0-pr-2291-fed4-fed4fe16` (footer)
- Browser: playwright-firefox @ 1920×1080 (desktop) + 375×812 (mobile probe)
- User: `mutykovaelena@gmail.com` (Emily Johnson, member of `AGENT-TEST-Org-TechFlow-20260310`, 10 orders 3/20/2026 – 5/4/2026, USD, browser locale UTC+2)
- Captured: 2026-05-26T10:26–10:37 UTC

## Control Inventory
- **Container:** Filters popover behind a top-bar **Filters** button on `/account/orders` (collapsed by default; the picker is NOT visible on initial page load).
- **Section heading:** "Orders filters" — picker block labelled **"Created date"** above an order-status checkbox group.
- **Preset combobox** with values: `Custom date` (default), `Last day`, `Last week`, `Last month`, `Last year` — `role=combobox`, `aria-label="Created date"`. When a non-Custom preset is chosen the Start/End custom inputs DISAPPEAR (only the preset combobox remains).
- **Custom-date controls** (visible only when preset = "Custom date"):
  - `<input type="text">` aria-label="Start date", placeholder `MM/DD/YYYY`, **NOT native `type="date"`**, no `min`/`max`, not `readOnly`, accepts typing.
  - Visual em-dash separator "—".
  - `<input type="text">` aria-label="End date", same shape.
  - Each input has an adjacent calendar-icon button `aria-label="Open calendar"`.
- **Form mechanics:** NO `<form>` element. Two buttons at the bottom of the popover: **Reset** and **Apply** (both `disabled` initially, gated by dirty-state vs currently-applied filter).
- **Calendar popup:** clicking "Open calendar" opens a custom **dual-month** range picker (two `<table>` grids side-by-side, both starting on May 2026). Library is **reka-ui** (`data-reka-calendar-cell-trigger` on cells). Each day cell is `role="gridcell"` containing `role="button"` with `aria-label="Sunday, April 26, 2026"` etc. Header has `aria-label="Previous year" / "Previous month" / "Next month" / "Next year"`. Picker also shows the same 5 presets inside (Custom date / Last day / Last week / Last month / Last year) — preset is duplicated between the combobox dropdown and the calendar popup.
- **CSS class root:** `date-filter-select`, `date-filter-select__date`, `date-filter-select__custom`.
- Screenshots: `dp-02-filters-open.png` (popover layout), `dp-03-calendar-open.png` (dual-month calendar).

## Format & Locale
| Aspect | Observed |
|--------|----------|
| Input type | `<input type="text">` (custom; no native `type="date"` even on mobile) |
| Display format | `MM/DD/YYYY` (placeholder; en-US user) |
| Typing allowed | Yes; non-digit/non-slash chars are filtered out client-side (e.g. `abc/xx/yyyy` → `""`) |
| `min`/`max` attrs | None set |
| `maxLength` | -1 (no client cap) |
| Future dates | Accepted (e.g. `12/31/2030` entered without rejection) |
| Locale switch | Not probed (en-US only; risk-flag for future test) |
| Timezone | Server gets `YYYY-MM-DDT22:00:00.000Z` for an en-US 03/01/2026 — browser converts local-midnight to UTC. UTC+2 host in this session. |

## Behavior Matrix
| # | Scenario | Inputs | Observed (UI + Network) | Pass/Anomaly | Test? (Priority) |
|---|----------|--------|-------------------------|--------------|------------------|
| B1 | Default state | preset = Custom date, both blank | Apply + Reset disabled; URL clean; no filter sent | Pass | New (P2) |
| B2 | Type Start only | Start=03/01/2026, End= | Apply ENABLED after typing (gated by dirty-state, not "both required"); on Apply → GQL filter `createddate:["...T23:00:00Z" TO]` (no upper bound), all 10 orders returned | Acceptable but undocumented — looks like "from X onward" | New (P2) |
| B3 | Type both, span all data | 03/01/2026 → 05/31/2026 | Apply enabled; on Apply → GQL `createddate:["2026-02-28T23:00:00.000Z" TO]` — **End silently dropped**; all 10 orders returned (happens to be correct shape because range covered everything) | **ANOMALY** (would mask bug if data spilled past end) | New (P0) |
| B4 | Type both, narrow range that excludes some orders | 03/01/2026 → 03/22/2026 | Apply enabled; GQL again `createddate:["2026-02-28T23:00:00.000Z" TO]` (End dropped); response includes 5/4/2026 orders that should have been excluded; **filter is functionally broken for any End-bounded range** | **ANOMALY (likely bug)** | New (P0) — covers correctness |
| B5 | Same-day boundary | 05/04/2026 → 05/04/2026 | Apply enabled; GQL `["2026-05-03T22:00:00.000Z" TO]` (End dropped); 5 orders returned (all from 5/4) — looks correct because no orders exist after 5/4 | Same bug as B3/B4, hidden by data | New (P1) — boundary case |
| B6 | Inverted range (Start > End) | 05/04/2026 → 03/01/2026 | No validation message, no error styling, Apply ENABLED; GQL `["2026-05-03T22:00:00.000Z" TO]` (End dropped) | **ANOMALY** (no client validation for Start > End) | New (P1) |
| B7 | Invalid characters in End | End=`abc/xx/yyyy` | Characters filtered out, End remains empty; Apply stays enabled because Start was already filled | Pass (input mask works) | New (P2) — char-class enforcement |
| B8 | Future Start date | Start=12/31/2030 | Accepted; Apply enabled; no warning | Acceptable but worth a probe | New (P2) |
| B9 | Preset = Last day | preset switched | Custom inputs hide; Apply enabled; GQL `createddate:["2026-05-23T22:00:00.000Z" TO "2026-05-25T21:59:59.999Z"]` — **both bounds sent correctly** | Pass — confirms server CAN handle range; problem is the Custom-date pathway | New (P0) per preset (5 cases) |
| B10 | Preset → Custom switch retains values? | Last day → Custom date | Not directly probed | — | Optional probe |
| B11 | Apply persists across panel reopen | Start=03/01, End=05/31, Apply, reopen | Start persisted, **End was BLANK on reopen** (visual evidence of where the bug is — End is dropped at apply-time, not just at serialization) | **ANOMALY** | Same root cause as B3 |
| B12 | Reset clears both | both filled → Reset | Both inputs cleared (server still holds previous filter until next Apply); Reset also CLOSES the popover (unexpected — popover should remain open with cleared fields) | **Minor UX anomaly** | New (P2) |
| B13 | Click outside popover | popover open, click table heading | Popover closes; entered (but un-applied) values are discarded — confirmed by next reopen showing previously-applied values, not the abandoned ones | Pass (expected dismiss) | New (P2) |

## State / URL
- **Query params:** NONE. Applied filter is **not** reflected in `window.location.search`. Refreshing the page (`F5`) → filter resets to default.
- **Refresh behavior:** Filter NOT preserved across page reload — both URL-less and (apparently) no localStorage persistence. Worth a P2 case.
- **Back-nav behavior:** Not directly probed in the 25-min window (BLOCKED: budget) — needs follow-up.
- **Reset behavior:** Clears Start + End values AND closes the popover (questionable — typically Reset clears fields and leaves the panel open so the user can pick new dates).

## Keyboard / a11y
- Inputs are real `<input>` elements with proper `aria-label="Start date" / "End date"` and `placeholder` — focusable via Tab.
- `Escape` reliably closes the calendar popover.
- Calendar grid cells have correct `role="gridcell"` and per-day `aria-label="Sunday, May 4, 2026"` — screen-reader-friendly.
- Arrow-key navigation inside the calendar grid: **not probed in depth** (reka-ui supports it by default but should be verified — single P1 a11y case worth writing).
- The two visible "Open calendar" buttons share the same `aria-label="Open calendar"` (no disambiguation between Start vs End) — minor a11y nit (P2 case).

## Mobile (375×812)
- Filter popover renders inline (not as a fullscreen sheet).
- Inputs stay **custom text** (`type="text"`, placeholder `MM/DD/YYYY`) — does NOT fall back to the OS native date picker. This is a deliberate consistency choice but means mobile users can't use OS-native scroll-wheel pickers.
- Input height: **36 px** (`<input>` bounding rect 212×36) — **below the WCAG 2.5.5 / Apple HIG / Material 44×44 touch-target minimum**. Same input is used Desktop + Mobile so probably not seen as a regression, but worth a documented A11y case.
- Calendar popup not probed at 375 px (BLOCKED: budget).

## Network
- **Endpoint:** `POST https://vcst-qa-storefront.govirto.com/graphql`
- **Operation:** `GetOrders` (xAPI)
- **Filter syntax:** Lucene-style range string in the `filter` variable.
  - Custom-date (broken) example: `"createddate:[\"2026-02-28T23:00:00.000Z\" TO]"`
  - Preset (working) example: `"createddate:[\"2026-05-23T22:00:00.000Z\" TO \"2026-05-25T21:59:59.999Z\"]"`
- **Response time:** 250–400 ms typical (well under thresholds).
- **HTTP status:** 200 in every probe; no `errors[]` array in response.
- **Status facet:** server also returns `term_facets[].name="status"` with counts — used to render the sidebar tally + Filters checkboxes.

## Anomalies discovered (potential bugs)
| # | Symptom | Severity | Repro confidence | Linked behavior row |
|---|---------|----------|------------------|---------------------|
| A1 | **Custom Date End is silently dropped from the GraphQL filter on Apply** — only Start is sent (`"createddate:[\"...\" TO]"`), with no upper bound. Reproduced with three different End values (05/31/2026, 03/22/2026, 05/04/2026). Presets (`Last day`, etc.) correctly send both bounds, so the regression is in the Custom-date pathway only. | **P0** | Confirmed (3/3 attempts) | B3, B4, B5, B11 |
| A2 | After Apply with a Custom range, reopening the Filters panel shows the End input **blank** (Start is retained). Suggests the End value is being thrown away at apply-time, not just at serialization. | High | Confirmed | B11 |
| A3 | No client-side validation for **Start > End** (inverted range) — Apply is enabled, no error message, server gets only Start. Combined with A1 this is doubly broken. | Medium | Confirmed | B6 |
| A4 | Clicking **Reset** closes the Filters popover (the panel re-opens via the Filters button with cleared inputs). Reset should typically leave the panel open. | Low/UX | Confirmed | B12 |
| A5 | Mobile input height is 36 px (below 44 px touch-target standard); also no native date-picker fallback on mobile. | Low (a11y) | Confirmed | Mobile section |
| A6 | Both "Open calendar" buttons share the identical `aria-label="Open calendar"` — no Start/End disambiguation for screen-reader users. | Low (a11y) | Confirmed | a11y section |

## Existing-coverage delta
**ORD-017 (Date Range Filter — happy path)** in the orders frontend suite presumably proves the happy-path UI flow: open Filters, pick a date range, see results filtered. It does **not** probe the GraphQL request body (would otherwise have caught A1), the End-dropped bug, the inverted range, preset vs custom serialization, or the empty-End-after-reopen behavior. Re-author scope below assumes ORD-017 stays as the happy-path "smoke" case and the new cases stack adversarial / boundary / a11y on top.

### New scenarios that justify cases (priority-ordered)
- **P0 — Custom Date filter correctness (negative-result):** narrow Custom range that should exclude known later orders; assert returned orders are within range AND that GraphQL filter string contains BOTH `TO "<endIso>"`. Covers A1. (1 case)
- **P0 — Preset filters serialization:** one case per preset (Last day / week / month / year) that confirms the GraphQL filter includes both bounds and result count matches an authored expectation. Distinguishes working-preset path from broken-custom path. (4 cases, can be table-driven)
- **P1 — Same-day boundary:** Custom `Start = End = today` (or `Start = End = <day with known order>`), assert all and only that day's orders are returned. Covers A1+B5. (1 case)
- **P1 — Inverted range validation:** Custom `Start > End`, assert visual error OR auto-swap OR Apply remains disabled (whichever PO decides is the contract). Covers A3. (1 case)
- **P1 — Start-only / End-only semantics:** explicit cases for "fill Start only and Apply" / "fill End only and Apply" — pins down whether Start-only is intentionally "from X onward" or accidentally accepted. Covers B2. (2 cases)
- **P1 — Persistence across reopen + URL:** apply custom range, close panel, reopen, assert both inputs still show entered dates. Sub-case: after Apply, refresh page, assert filter still applied (or not — depends on PO intent). Covers A2 + B11 + URL absence. (2 cases)
- **P2 — Invalid input masking:** type `abc/xx/yyyy` and `02/30/2026` (invalid Feb 30) — assert digits-only and calendar-valid-date masking. Covers B7. (1 case)
- **P2 — Future / far-past date acceptance:** `12/31/2030` and `01/01/1900` boundary probes; assert either acceptance with empty-result or rejection per PO contract. (1–2 cases)
- **P2 — Reset behavior:** Reset should clear without dismissing the panel; assert popover still visible after Reset. Covers A4. (1 case)
- **P2 — Calendar UI interaction:** click "Open calendar", navigate via Previous/Next month buttons, pick Start via click + End via click in the dual-month view, assert input values populate. (1 case)
- **P2 — Outside-click dismiss:** open Filters, type partial Start, click outside the popover, reopen — assert un-applied entries are NOT retained. Covers B13. (1 case)
- **P2 — a11y duplicate aria-label:** assert each "Open calendar" button has a unique accessible name (e.g. "Open Start date calendar"). Covers A6. (1 case)
- **P2 — a11y touch target:** assert date inputs are ≥ 44 px tall on viewport ≤ 768 px. Covers A5. (1 case)
- **P2 — Keyboard nav in calendar grid:** Arrow + Enter to pick a date; Esc closes; Tab progression respects DOM order. (1 case)
- **P2 — Preset → Custom switch:** select Last week, then switch to Custom date, assert Start/End inputs reappear (and whether they're prefilled with the preset's resolved range or blank). (1 case)

**Estimated total new cases:** ~20 (4 P0, 6 P1, 10 P2). A1 alone justifies the entire authoring effort.

## Screenshot index
Canonical evidence (the 5 highest-signal of the captured set):
- `screenshots/dp-02-filters-open.png` — Filters popover layout with both date inputs and preset combobox.
- `screenshots/dp-03-calendar-open.png` — Dual-month calendar popup showing reka-ui structure.
- `screenshots/dp-06-anomaly-end-ignored.png` — UI state right after applying 03/01–03/22 range; result list still contains 5/4/2026 orders.
- `screenshots/dp-08-preset-last-day.png` — "Last day" preset selected; Custom inputs hidden (proves working preset pathway).
- `screenshots/dp-11-mobile-filters-open.png` — 375 px viewport with the same custom inputs (no native picker fallback, 36 px height).

Other screenshots (`dp-01, dp-04, dp-05, dp-07, dp-09, dp-10`) remain in the folder as supporting context but are not referenced in the new cases.

## Blocked / not probed (follow-up for `test-management-specialist` or a second exploration run)
- Browser back-nav from order detail → does the Custom filter persist?
- Calendar popup at 375 px viewport (mobile range picker UX).
- Arrow-key + Enter inside the calendar grid (keyboard a11y).
- Culture switch → does the input format change (DD/MM/YYYY for en-GB? localized month names in the calendar header?).
- Multi-tab behavior (apply filter in tab A, check tab B).
