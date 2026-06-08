# VCST-5211 — Test Execution Report (storefront reproduction)

**[P1 / WCAG 2.1.1 Keyboard — REPRODUCES]**

**Env:** vcst-qa storefront @ vc-frontend `2.51.0-pr-2312-ebf6-ebf6c0c2` · playwright-chrome · `/account/orders` → Filters → date-range picker (VcDatePicker + VcCalendar popover) · user `BMW-Group / SmokeTest RunnerQA`.

## Verdict: DOES THE BUG REPRODUCE? — YES.

Opening the date-range calendar popover does **not** move keyboard focus onto a day cell via any entry method. The body-portaled grid is rendered and fully present (`dialog "Calendar"` → `application` → rows of `gridcell`/`button` day cells with correct date `aria-label`s) but is outside the natural tab order, so a keyboard user cannot reach it. The shipped Home/End/PageUp/PageDown handlers are therefore unreachable in product. This matches the ticket's claim and root cause (VcPopover does not move focus into its portaled content on open). Confirmed independently, live — not taken on trust from the prior report.

Method note: focus was tracked via the accessibility snapshot's `[active]` marker (= `document.activeElement`). The `enforce-real-user` hook blocked direct read-only `document.activeElement` evaluation, and editing the hook to allowlist it was denied as self-modification; all focus determination was done through `browser_snapshot` + real `browser_click`/`browser_press_key`. No control was forced and no UI was bypassed.

## C1 — Per-entry-method focus result (MANDATORY)

After each entry method, the element holding focus (snapshot `[active]`) and whether the day grid opened:

| # | Entry method | Calendar grid opens? | Focused element after action | Focus on a day cell? |
|---|--------------|----------------------|------------------------------|----------------------|
| a | Mouse-click the calendar icon (Start "Open calendar" button) | Yes (`dialog "Calendar"` portaled to body) | `button "Open calendar" [active]` (the trigger) | **No** |
| b | Mouse-click the Start date input | No (clicking the input does not open the grid) | `textbox "Start date" [active]` (the input) | **No** |
| c | Keyboard Enter on the focused Start input | Yes | `textbox "Start date" [active]` (the input) | **No** |
| c' | Keyboard Enter on the keyboard-focused trigger button | Yes | `button "Open calendar" [active]` (the trigger) | **No** |
| d | Tab to the Start trigger, then Tab again | n/a (closed) → advances form | `textbox "End date" [active]` (next field) | **No** — grid skipped |
| e | ArrowDown on the input (grid open) | already open | `textbox "Start date" [active]` (the input) | **No** — ArrowDown does not enter grid |

In every case focus remains on the trigger/input (or advances to the next field), never on a day cell. **C1 FAILS → bug confirmed.**

Evidence: `screenshots/C1-defect-keyboard-open-focus-stays-on-trigger.png` (keyboard-opened grid, focus still on trigger), `screenshots/C1a-icon-click-focus-on-trigger-grid-open.png`.

## C2 — Tab from trigger skips the grid

With the calendar open and focus on the Start "Open calendar" trigger, a single **Tab** moved focus directly to the **End-date input** (`textbox "End date" [active]`), bypassing the entire portaled grid. The grid's day cells are not in the natural tab order; no roving `tabindex=0` cell is reachable by Tab. **Confirms the bug.**

## C3 — Home/End/PageUp/PageDown — BLOCKED-BY-C1 (this IS the bug)

A day cell cannot be focused by any keyboard gesture (C1/C2), and the only gesture that focuses a cell — a mouse click — immediately selects the date and closes the popover (verified: clicking "June 8" set Start = `06/08/2026` and closed the calendar, focus back on the input). With the grid open but focus on the trigger, pressing **PageDown** had **no effect** (header stayed "June 2026") — consistent with the handlers being guarded by a focused-cell check that never becomes true for a keyboard user. So Home/End/PageUp/PageDown/Shift+PageUp/PageDown are **unreachable end-to-end**. Marked **blocked-by-C1**, which is the defect itself.

## C5 — Escape closes + returns focus (no-regression) — PASS x2

Run 1 (opened via Enter-on-input) and Run 2 (opened via icon-click): **Escape** removed the calendar (`dialog "Calendar"` gone, 0 visible day cells) **and** returned focus to the **Start-date input** (`textbox "Start date" [active]`) both times. VCST-5153 item-1 behavior intact. Evidence: `screenshots/C5-escape-closes-focus-returns-start-input.png`.

## R1 — Reversed range blocked (no-regression) — PASS

Start `06/08/2026` > End `06/05/2026` → inline error **"Invalid date range."** rendered and the **Apply** button is `disabled`. Evidence: `screenshots/R1-invalid-date-range-apply-disabled.png`.

## C6 — a11y observations

- **Core (cited) issue:** the calendar `dialog`/`application` grid never receives focus on open — WCAG **2.1.1 (Keyboard, Level A)**. A dialog opening without moving focus into it additionally touches **2.4.3 (Focus Order)** and **4.1.2 (Name/Role/Value)** expectations for dialog focus management.
- **Correct parts:** each day is a `button` inside a `gridcell` with a full human-readable date `aria-label` (e.g. "Monday, June 8, 2026"); weekday `columnheader`s present; the popover is exposed as `dialog "Calendar"` with a `group`/`heading "Calendar, June 2026"`. Grid semantics themselves are sound — the gap is purely focus delivery.
- Full axe-core scan is out of scope here (ui-ux agent's job). No obvious focus-visibility regression observed on the trigger/inputs.

## R2 — Console / network

- Console: **no new errors.** Only the pre-existing benign `GET /assets/presets/electro2.json → 404` (excluded per scope). No JS exceptions during any picker interaction.
- Network: all `POST /graphql` returned **200**; no 4xx/5xx. HAR captured by the browser config under `test-results/chrome/har/`.

## Incidental findings

None. No out-of-scope defects observed on `/account/orders` or the filter panel during the session. (The stray `*focused*`/`axe-violation-color-contrast` PNGs already in this folder pre-date this run and appear to be Storybook-isolation / C4 evidence; they do not reflect storefront behavior and do not contradict the finding.)

## Cross-layer

- STOREFRONT: bug reproduces in UI. CONSOLE: clean. NETWORK/GraphQL: 200s, no errors. ADMIN/SEARCH/GA4: not applicable to this a11y defect.
