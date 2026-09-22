# Design & accessibility report — VCST-5732 "[E2E] Sales Rep Task Management"

Env `vcptcore_qa1` · theme `2.58.0-pr-2464-595d` · lane `ui-ux-expert` on Chrome DevTools MCP · 2026-09-17

**Mode: mockup diff, not a token diff.** No Claude Design / DesignSync project exists for this feature, so no token-level expectation was derived and none was guessed. The oracle is the ticket's two attachments — `screenshots/design-81444.png` (dashboard widget) and `design-81445.png` (calendar page).

| Axis | Verdict |
|---|---|
| vs. DESIGN | **FAIL** — 2 substantive deviations, 1 missing region, 6 low-order drifts |
| WCAG 2.2 AA | **FAIL** — 11 failures (1 High, 4 Medium-High, 4 Medium, 2 Low) |
| Design-system consistency | **FAIL (minor)** — dot token 4 px in the grid vs 6 px in the legend; an uppercase transform on the day heading alone |
| Responsive | **PASS** — 390 / 768 / 1440 all clean |
| UX heuristics | **FAIL** — Nielsen #1 (visibility of system status) breaks twice |
| WCAG 2.5.7 Dragging Movements | **SKIPPED** — the drag surface instantiates only in layout-edit mode, which a read-only lane may not enter |
| Screen-reader output | **SKIPPED** — no NVDA/JAWS/VoiceOver in the MCP toolkit; three findings are derived from the accessibility tree, not heard |
| SC 3.2.6 / 3.3.7 / 3.3.8 | **SKIPPED — N/A** to this surface |

## Design deviations

**D1 · Chip counts mix two scopes — High.** The mockup reads `All 20 · Upcoming 10 · Overdue 4 · Completed 6`; 10+4+6 = 20, so `All` is the **global** total while the day panel separately reads "3 of 3 tasks". Live, `All` is the **selected day's** count and the other three are global. On an empty day the row renders `All 0 · Upcoming 10` — a set labelled "All" smaller than its own subset. Reproduced across three day selections and independently at the API layer. Evidence: `live-chips-all-0-empty-day-1440.png`.

**D2 · Day markers are one-per-status, not one-per-task — Medium-High.** The mockup shows **two blue dots on May 12** and **three green dots on May 15** — multiple dots of the *same* status on one day, which is only possible if a dot is a task. Live, Sep 18 (1 task) and Sep 24 (2 tasks) produce byte-identical markup and an identical `Marked: Upcoming` text equivalent. The grid answers "is there anything?" but never "how much?". Evidence: `live-calendar-monthgrid-dots-1440.png`, `B4-month-grid-markers.png`.

**D3 · Breadcrumb absent — Low-Medium.** The mockup shows `Home / My account / Sales Rep Hub / Calendar`; live renders none at any viewport.

**D4–D9 · Low.** Week starts Sunday with 3-letter labels (mockup: Monday, 2-letter) · day heading uppercased and month abbreviated · task titles rendered as blue links rather than near-black bold · all four chip counts painted brand-red where the mockup colours only the selected one · calendar card title missing · dot 4 px in grid vs 6 px in legend.

**Theme — `KNOWN_DIVERGENCE`, not filed.** The mockup's amber primary vs the live `#E52121` red is the store's Red theme preset, not an implementation defect. It does, however, *cause* A6 and A8 below, which **are** filed: a theme explanation does not rescue a WCAG invariant.

**Matches the mockup** (recorded, not assumed): status pill shape and three colours · chip selected/unselected treatment · legend content and order · `New task` filled-primary vs `Today` outlined-secondary · `Add task` placement · row status accent bars · icon choices · day-panel column order · widget heading and `Full calendar →` · today/selected tile treatment. Empty state (`Nothing due on this day`) is not depicted in the mockups and is graded on its own merits: **PASS**.

## Accessibility — filed standalone at their own severity

Per `triage.md` §7a a `BL-A11Y-*` finding on a feature ticket does not fail the functional verdict.

**A1 · Notes textarea has no real accessible name — High** · WCAG 3.3.2, 4.1.2. Root-caused: `aria-labelledby` **points at the control's own id**, so name computation falls through to the placeholder and the accessible name resolves to `"Enter a value"`. There is no `<label>` for Notes at all. Present in **both** the New task and Edit task modals; every other control in both dialogs is correctly named. One-line fix.

**A2 · Required fields not programmatically required — Medium-High** · 3.3.2. `Title`/`Due date` show a visible `*`, but carry `required: false`, no `aria-required`, and an `aria-label` that overrides the label and strips the asterisk — so the marker is exposed by no route.

**A3 · Selected date conveyed by colour alone — Medium-High** · 4.1.2 + 1.4.1. `aria-selected` and `aria-current` are both null; state lives in `data-selected` plus a background colour.

**A4 · No announcement on date change — Medium** · 4.1.3. The day panel fully re-renders while focus stays on the grid; the only `aria-live` region on the page is empty. Nothing is announced.

**A5 · Marker text equivalent omits the count — Medium** · 1.1.1. Same root cause as D2 — `Marked: Upcoming` is identical for a 1-task and a 2-task day.

**A6 · Status dots fail non-text contrast — Medium-High** · 1.4.11 (needs 3:1). Completed `#5BAE7E` on white = **2.69:1**. On the selected day tile `#A22B2B`: Upcoming **1.60:1**, Completed **2.67:1** — visibly a faint ghost. These dots are the only indicator of what a day holds.

**A7 · Secondary meta line fails contrast on row hover — Medium** · 1.4.3. `#737373` on the hovered `#E5E5E5` row = **3.76:1** (4.54:1 at rest — a 1 % margin).

**A8 · Unselected chip counts fail contrast — Medium** · 1.4.3. `#E52121` on the `#F5F5F5` canvas ≈ **4.21:1**. Caused by D7; independently flagged by Lighthouse.

**A9 · `role="application"` on the calendar `<table>` — Medium** · 1.3.1 / 4.1.2. Discards table/grid semantics and forces screen readers out of browse mode; the APG date-picker pattern calls for `role="grid"`, and the `<td role="gridcell">` cells are orphaned from any grid. **Platform-level (`vc-calendar`, shared UI kit) — blast radius exceeds this feature; route accordingly.**

**A10 · Empty `<th>` for the checkbox column — Low** · 1.3.1. Source of Lighthouse's `td-has-header` failure; low impact because each checkbox is well labelled.

**A11 · Roving tabindex parks on the 1st of the month — Low** · 2.4.3 / APG. `tabindex="0"` sits on Sep 1 while the selected+today cell has `tabindex="-1"`.

**Verified passes:** 2.1.1 keyboard (a date is fully selectable by keyboard — Tab → Arrow → Enter) · 2.1.2 no trap · Escape and focus return to the exact trigger · 2.4.7 focus visible (3.68:1) · 2.4.11 focus not obscured (`scroll-padding-top: 128px` exactly matches the sticky header; measured overlap 0 px) · 2.5.8 target size (day cells 40×40 / 32×32; 20 px checkboxes pass via the spacing exception) · modal semantics (`aria-modal`, labelled, initial focus on Title) · checkbox names swap correctly with state · status pill and title-link contrast.

**`Save`-disabled-until-Title — advisory, not an AA failure.** No `aria-describedby`, no error text; a disabled control is out of the tab order, so a screen-reader user is never told why the form will not submit. Graded Medium UX, not a WCAG FAIL, because no error is *detected and described*.

## The methodological note worth carrying forward

**axe-core returned ZERO violations on all three scanned states while 11 genuine AA failures were present** — nine came from the manual layer, two from Lighthouse. The Notes label is the illustrative case: a non-empty but **wrong** accessible name satisfies both automated tools. A green axe run on this feature is not evidence of conformance.

## Out of scope (storefront chrome, pre-existing — file separately)

axe `button-name` **critical** on the header account-menu button at ≤768 px (no accessible name) · Lighthouse `label-content-name-mismatch` on the same control · Lighthouse a11y score for `/company/calendar`: **97**.
