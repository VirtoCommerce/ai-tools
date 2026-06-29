# Exploratory Session — VCST-5211 (VcDatePicker keyboard operability)

**Charter:** Risk charter (CRISP/SFDPOT) — explore VcDatePicker keyboard operability + integration
boundaries beyond the AC checklist; confirm the focus-entry gap reproduces in a DIFFERENT engine
(Firefox) and surface adjacent a11y/UX gaps.
**Env:** vcst-qa storefront @ build `2.51.0-pr-2312-ebf6-ebf6c0c2` (same PR #2312 line the bug was
filed against; ticket cited `-0edd`, live is a newer `-ebf6` of the same PR). User: main storefront
(`[E2E Test] Contoso Ltd. / SmokeTest RunnerQA`). **Browser: playwright-firefox**, locale en-US.
**Surface:** `/account/orders` → Filters → Created date range picker (VcDatePicker).
**Console:** 0 errors entire session (2 benign warnings). HAR auto-captured under `test-results/firefox/har/`.
**Box:** ~20 min. Read-only `document.activeElement` / `getBoundingClientRect` probes used to report
focus/DOM state (charter-authorized; allowlisted under the real-user hook).

> Firefox-MCP quirk hit as expected: `browser_click` on `/account/orders` toolbar + popover buttons
> times out on the CLS-stability check (CLS is actually 0; not a product bug — per
> `feedback_firefox_cart_dropdown_quirk`). Switched tactic to keyboard activation
> (Tab/Shift+Tab→Enter) + `browser_type` (fill path, no stability gate). All interactions completed
> as a real keyboard user.

---

## Verdicts (the three asks)

1. **Does the core bug reproduce in Firefox? — YES.** Engine-independent.
2. **Keyboard-trap verdict (WCAG 2.1.2): NO TRAP.** Tab and Shift+Tab move freely through and out of
   the open popover; Escape closes the calendar without trapping. VCST-5153 item 1 (Escape closes +
   returns focus, no drop-to-body) **NOT regressed** (one nuance below).
3. Findings classified below.

---

## Focus Area 1 — Core defect: every open gesture (Firefox)

Calendar is a body-portaled `dialog "Calendar"` → `group "Calendar, June 2026"` →
`role="application"` (tabindex=-1) → `rowgroup`/`row`/`gridcell`; each day is a
`<div role="button">` with a full descriptive `aria-label` ("Sunday, May 31, 2026"). Roving
tabindex **is correctly implemented**: exactly ONE cell carries `tabindex=0` (today, Mon Jun 8
2026); 29 cells `tabindex=-1`; 12 adjacent-month cells no tabindex.

| Open gesture (on "Open calendar" trigger) | Calendar opens? | Focus after open | Lands on a day cell? |
|---|---|---|---|
| **Enter** | yes | "Open calendar" trigger | **NO** |
| **ArrowDown** | n/a (stays open) | "Open calendar" trigger | **NO** |
| **Tab** (into open popover) | — | skips grid → **End date input** (`insideCalendarDialog:false`) | **NO** |
| Click (icon/input) | — | not separately re-tested in FF; prior-session shots `C1a` show same: opens, focus on trigger | NO |

→ **Bug confirmed engine-independent.** The grid has a valid roving target but `VcPopover` never
moves focus onto it on open, and the body-portaled grid is outside natural Tab flow → Tab jumps over
the whole open calendar to the next field. Home/End/PageUp/PageDown handlers (PR #2312) are therefore
unreachable for a keyboard user. Matches the ticket root cause exactly.
Evidence: `screenshots/VCST-5211-calendar-open-focus-on-trigger.png`.

## Focus Area 2 — Keyboard trap + Escape (VCST-5153 no-regression)

- Tab forward: trigger → End-date input (out of popover, freely). Shift+Tab back: returns to trigger.
  **No trap** either direction.
- Escape: **closes the calendar**, leaves the parent Filters popover open (correctly scoped, no
  over-close), no drop to `<body>`. **Not regressed.**
- *Nuance (Observation, not regression):* Escape returns focus to the **Start-date input**, not to the
  exact "Open calendar" button that was activated. Repro x2. Focus lands on a visible, logical,
  adjacent control in the same field group, so no focus-loss/trap — acceptable, but worth a note since
  the AC text says "returns focus to the trigger."

## Focus Area 3 — Adjacent a11y / integration edges

- **SR semantics gaps (Risk):** the "Open calendar" trigger has **no `aria-haspopup="dialog"` and no
  `aria-expanded`** (both null) — unlike the Filters button which exposes both. A SR user isn't told
  the button opens a dialog or its open/closed state. (WCAG 4.1.2 Name/Role/Value.)
- **Grid role (Risk):** day grid uses **`role="application"`**, not the WAI-ARIA APG
  **`role="grid"`** (no `[role=grid]` present). `application` suppresses the SR's normal grid
  browse-mode navigation — counterproductive for a date grid.
- **No `aria-current="date"`** on today's cell, and no `aria-selected` wiring observed pre-selection.
- **Deep-link / refresh state (Observation):** applied range produces NO URL query params
  (`location.search` empty); on full page reload the filter chips + "Reset filters" are **gone** —
  filters are client-state only, not bookmarkable/shareable and lost on refresh.
- Day cells carry rich, correct `aria-label`s (full weekday + date) — the labelling itself is good.

## Focus Area 4 — Data edges (typed input)

- Typing is a **fully working keyboard path**: a valid range typed into Start+End (blur to commit via
  Tab) enables Apply and applies the filter (chips render, table narrows to 1 order). So a keyboard
  user CAN filter by date by typing — the calendar grid is the only keyboard-dead part. (Important for
  impact: the feature is reachable; the *grid widget* is not.)
- Invalid literal "13/45/2026" (month 13, day 45): input **accepts the string**, **Apply stays
  disabled** (validation gate works — disabled ≠ bug per VCST-5100), but **no `aria-invalid` and no
  visible/announced error** → SR/UX feedback gap.
- Reversed range (Start 06/20 > End 06/08): **Apply correctly disabled**; again no announced reason
  (`aria-invalid` null, no alert text).
- Note: `fill()` set `.value` without firing Vue listeners (Apply stayed disabled until char-by-char
  `pressSequentially` + Tab-blur). Real-user typing works; an automation-only caveat.

## Focus Area 5 — State persistence

- Apply → reopen Filters: (covered indirectly) chips reflect the applied range while in session.
- **Refresh:** filter NOT restored (see Focus Area 3). Navigate-away/back not separately exercised;
  refresh already shows no persistence.

---

## Classified findings

| # | Class | Finding | WCAG / ref |
|---|---|---|---|
| F1 | **Bug (confirms ticket, P1)** | Calendar grid never receives focus on open (Enter/ArrowDown/Tab all leave focus on trigger; Tab skips the body-portaled grid). Reproduced in **Firefox** → engine-independent. Home/End/PgUp/PgDn unreachable. | 2.1.1 (A) |
| F2 | **Risk** | "Open calendar" trigger lacks `aria-haspopup="dialog"` + `aria-expanded` — SR users not told it opens a dialog or its state. | 4.1.2 (A) |
| F3 | **Risk** | Day grid uses `role="application"` instead of `role="grid"`; suppresses SR grid browse-mode. | APG / 4.1.2 |
| F4 | **Observation** | No `aria-current="date"` on today's cell. | APG best practice |
| F5 | **Observation** | Escape returns focus to Start-date input, not the exact "Open calendar" trigger pressed (no trap; acceptable but differs from AC wording). | 2.4.3 |
| F6 | **Observation** | Invalid / reversed range: Apply correctly disabled, but no `aria-invalid` and no announced/visible error reason. | 3.3.1 (A) |
| F7 | **Observation** | Applied date filter not in URL params and lost on page refresh (client-state only; not deep-linkable). | UX / state |
| Q1 | **Question** | Is the typed-input path the intended keyboard-accessible alternative to the grid? If so the grid focus bug is lower practical impact, but the grid widget still fails 2.1.1 on its own. | — |

**No keyboard trap. Zero console errors.** Core P1 defect reproduces engine-independently in Firefox.
