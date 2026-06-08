# VCST-5153 Fix Verification — VcDatePicker / VcCalendar keyboard a11y

**Verdict: FIX_INCOMPLETE** — Item 1 (Escape, WCAG 2.1.2) VERIFIED 3/3. Items 2 & 3 (Home/End, PageUp/Down, WCAG 2.1.1) **NOT keyboard-reachable in the storefront integration** — the calendar grid never receives keyboard focus, so the new handlers cannot be exercised by a real user here. All regressions pass.

**Env:** vcst-qa storefront @ vc-frontend `2.51.0-pr-2312-0edd-0eddbfcd` (PR #2312 deployed). Browser: playwright-chrome. Host: `/account/orders` → Filters → date-range popover (VcDatePicker + VcCalendar). Storybook DOWN (503) — isolation testing not possible.

## Checklist

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Item 1 — Escape closes popover + focus returns to trigger (3/3) | **PASS** | 3/3 below; `item1-escape-closes.png` |
| 2 | Item 2 — Home/End move focus to start/end of week (3/3) | **BLOCKED** | grid not keyboard-focusable in storefront (see root cause) |
| 3 | Item 3 — PgDn/PgUp month; Ctrl/Shift+PgDn/PgUp year (3/3) | **BLOCKED** | same root cause; also STR/impl modifier mismatch (below) |
| 4 | R1 — typing `0` handled | **PASS** | `R1-typing-zero.png`; typed `06/01/2026` + lone `0`, no crash/invalid/console err |
| 5 | R2 — reversed-range UI block intact | **PASS** | `R2-reversed-range.png`; red inputs + **Apply disabled** |
| 6 | R3 — no new console errors | **PASS** | only pre-existing benign `electro2.json` 404; all `/graphql` 200 |
| 7 | Storefront date filter renders + applies range | **PASS** | `checklist7-range-applied.png`; 06/01–06/30 chips, list filtered, 200 |
| 8 | E1 — arrow-key grid navigation works | **BLOCKED** | same root cause (no grid focus entry) |
| 9 | E2 — no residual keyboard trap (Escape is the exit) | **PASS** | Tab moves freely through panel; Escape closes + returns focus; no trap |
| 10 | WCAG 2.1.1 + 2.1.2 overall | **PARTIAL** | 2.1.2 (no trap) met; 2.1.1 grid keys unreachable — see summary |

## Item 1 — Escape (WCAG 2.1.2) — 3/3 PASS
STR: open Start date calendar → press Escape. Each run: calendar grid removed (0 visible cells) **and** focus returned to the Start date input.
- Run 1: 42→closed, focus = "Start date" input ✓
- Run 2: 42→closed, focus = "Start date" input ✓
- Run 3: 42→closed, focus = "Start date" input ✓

Matches the fix: `onEscapeClose(close)` calls `innerInputElement.focus()`, and `@keydown.esc.stop` is bound to the calendar content + trigger button (vc-date-picker.vue PR #2312). Note focus returns to the date **input** (the trigger control), by design — not the icon button.

## Items 2 & 3 + E1 — BLOCKED (root cause)
The fix code is present and correctly wired: `@keydown="onCalendarKeydown"` on VcCalendar, with `getFocusedCellDate()` guarding on a focused day cell (`data-reka-calendar-cell-trigger`). **But the day grid never gets keyboard focus in the storefront date-picker integration**, so the handlers (and reka's own arrow handlers) cannot fire for a real user. Verified across every entry method:
- Open via mouse-click icon / click input / keyboard Enter on icon → focus stays on trigger; grid not focused.
- Tab from trigger → moves to the next filter field (End date), **skipping the grid** — the entire popover content (header nav buttons + 42 day cells) renders in a body-end portal; grid container is `tabindex=-1`, only the roving cell is `tabindex=0` but it is outside the natural Tab flow.
- ArrowDown on trigger/input → no grid entry.
- The only gesture that focuses a day cell (mouse-click a day) immediately selects the date and closes the popover (refocusing the input), so Home/End/PageUp/PageDown/arrows can't be pressed on a focused cell.

Consequence: Items 2, 3 and E1 are **not verifiable end-to-end via the storefront**. They are exercised only by the PR's Storybook story `KeyboardBoundsWithDisabledDates` (standalone VcCalendar, where a click keeps cell focus) — Storybook is down (503), so could not be re-run.

This grid-focus-entry gap is governed by `VcPopover` (no auto-focus into content) and is not changed by PR #2312, so it is likely pre-existing rather than a regression — but it means the WCAG 2.1.1 keyboard-operability goal for grid navigation is not delivered in this storefront context.

**STR vs implementation mismatch (Item 3):** ticket STR says *Ctrl*+PageUp/Down change year. The shipped code uses **Shift**+PageUp/Down for year (per WAI-ARIA APG); Ctrl/Meta is used for Home/End (week→month). If/when grid focus is reachable, test with Shift for year, not Ctrl.

## Regressions
- **R1 PASS** — typed `06/01/2026` (zeros) and a lone `0`; mask handled both, no crash, no invalid state, no new console error.
- **R2 PASS** — Start 06/01/2026 > End 05/01/2026: both inputs show red error borders and **Apply is disabled** — reversed range blocked.
- **R3 PASS** — single benign pre-existing `electro2.json` 404 (theme preset, fires on load); all `/graphql` orders calls 200; GA4 beacons normal.
- **Checklist 7 PASS** — valid range 06/01–06/30/2026 applied; filter chips shown, orders list filtered to June 2026, request 200.
- **E2 PASS** — non-modal popover, Tab moves freely through the filter form (no trap), Escape is the working keyboard exit with focus return. Header Prev/Next month & year buttons work via mouse (June 2026→July 2026→July 2027).

## Recommendation
**FIX_INCOMPLETE.** Item 1 (the WCAG 2.1.2 keyboard-trap fix) is fully verified and shippable. Items 2/3 (WCAG 2.1.1 grid key navigation) cannot be confirmed working for a storefront keyboard user because the calendar grid is not focusable from the popover — recommend either (a) re-verify Items 2/3 in Storybook once it is back up, and (b) file a follow-up so VcDatePicker moves keyboard focus into the grid on open (e.g. VcPopover open-auto-focus to the roving cell), otherwise the added handlers remain unreachable in product. Also align the Item 3 acceptance criterion (year = Shift, not Ctrl).
