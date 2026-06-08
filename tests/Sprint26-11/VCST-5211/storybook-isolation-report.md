# VCST-5211 — Storybook Isolation Report (VcCalendar keyboard grid)

**Ticket:** VCST-5211 (To Do, unfixed) · P1 · WCAG 2.1.1 · UI Kit VcCalendar/VcDatePicker
**Env:** Storybook https://vcst-qa-storybook.govirto.com (UP/200) · Chrome DevTools MCP · theme preset "Default" (toolbar)
**Component:** `Components / Molecules / VcCalendar` (Reka UI based — cells are `div[role=button][data-reka-calendar-cell-trigger]`)
**Stories used:** `KeyboardBoundsWithDisabledDates` (min=2026-06-10, max=2026-06-20, Jun 14 disabled) + `Default` (unbounded) to disambiguate month/year nav.

## Verdict

Hypothesis **CONFIRMED**. In isolation a click on a day cell keeps focus on that cell
(`document.activeElement` = the day `div`, not closed/lost), and **every** PR #2312 key handler fires and moves
the roving day focus correctly. The shipped year binding is **Shift+PageUp/PageDown**, not Ctrl. This proves the
PR #2312 code is correct; the storefront defect is purely the integration gap (VcPopover never delivers focus into
the grid), exactly as the ticket states.

## C4 — Per-key navigation (real keypresses, focus read from `document.activeElement`)

Bounds story unless noted. "→ X" = focused cell after the key.

| Key | Start cell | Result | Works? | Notes |
|-----|-----------|--------|--------|-------|
| ArrowRight | Jun 17 | → Jun 18 | YES | +1 day |
| ArrowLeft | Jun 18 | → Jun 17 | YES | −1 day |
| ArrowDown | Jun 17 | stays Jun 17 | YES | +7 = Jun 24 is > max; clamped, focus retained (not lost) |
| ArrowUp | Jun 17 | → Jun 10 | YES | −7 day; lands on min boundary |
| Home | Jun 19 | → Jun 14 (Sun) | YES | start of week (firstDayOfWeek=0) |
| End | Jun 14 | → Jun 20 (Sat) | YES | end of week |
| Ctrl+Home | Jun 20 | → Jun 10 | YES | first of month, clamped to min |
| Ctrl+End | Jun 10 | → Jun 20 | YES | last of month, clamped to max |
| PageUp | Jun 20 | → Jun 10 (June) | YES | prev month; clamped to min in-range date |
| PageDown | Jun 10 | → Jun 20 (June) | YES | next month; clamped to max in-range date |
| Shift+PageUp | Jun 20 | → Jun 10 (June) | YES | prev year; clamped to min |
| Shift+PageDown | Jun 10 | → Jun 20 (June) | YES | next year; clamped to max |

**Unbounded (`Default` story) — clean month/year proof:**

| Key | Result | Header |
|-----|--------|--------|
| PageDown | Jun 17 → **Jul 17** | July 2026 |
| PageUp | Jul 17 → **Jun 17** | June 2026 |
| Shift+PageDown | Jun 17 2026 → **Jun 17 2027** | June 2027 |
| Shift+PageUp | Jun 17 2027 → **Jun 17 2026** | June 2026 |

**All 12 keys operable in isolation.** No key was inert.

## C7 — Year modifier is Shift, NOT Ctrl (CONFIRMED)

- `Shift+PageDown`/`Shift+PageUp` → **year** ±1 (June 2026 ⇄ June 2027). Verified on unbounded story.
- `Ctrl+PageDown` Jun 17 → **Jul 17** (month +1), `Ctrl+PageUp` → **Jun 17** (month −1). Ctrl does **not** change the year — it falls through to month behavior.
- **Conclusion:** shipped code binds the year change to **Shift+PageUp/PageDown** per WAI-ARIA APG, contradicting the parent AC text that said "Ctrl". The implementation is correct; the AC wording is wrong.

## Disabled-date bounds — focus not trapped/lost

Navigating onto out-of-range or disabledDate cells never lost focus: arrow/Home/page keys either clamp at the
boundary (focus stays on a valid in-range cell) or land on a disabled-but-focusable cell (e.g. Home → Sun Jun 14,
a disabledDate, received focus as a roving target — APG disabled-but-focusable pattern). At no point did
`document.activeElement` leave the grid or become `<body>`. No keyboard trap observed.

## C6 — axe-core (Storybook a11y addon, calendar open)

`KeyboardBoundsWithDisabledDates`: **Violations 1 · Passes 22 · Inconclusive 0.**

| Rule | Impact | Count | Element | Detail |
|------|--------|-------|---------|--------|
| `color-contrast` (WCAG 1.4.3) | Serious | 1 | selected day cell `div[aria-label="Wednesday, June 17, 2026"]` (`.vc-calendar__day`, `data-selected=true`) | fg `#ffffff` on bg `#f99e24` = **2.11:1** (needs 4.5:1), 14px bold |

**Zero violations in the keyboard / ARIA / focus rule families** — the relevant area for VCST-5211 is clean.

## Incidental findings (always-on, verified)

1. **[Design-system, Medium — NOT VCST-5211]** Selected-day highlight fails text contrast: white-on-coffee-orange
   = 2.11:1 (axe Serious). Pre-existing brand-token issue on the `data-selected` pill, unrelated to PR #2312's
   keyboard work. Audited under "Default" preset; project a11y gate is Coffee-only, but `#f99e24` is a cross-theme
   brand accent, so it should be confirmed on Coffee before filing separately. Not the keyboard defect.
2. **[Observation, not filed]** Grid container is `role="application"` with day cells `role="button"`, and the
   focused/selected cell exposes **no `aria-selected`/`aria-current`** to the a11y tree (`data-selected` is a
   data-attr only). This differs from the WAI-ARIA APG date grid (`role=grid`/`gridcell` + `aria-selected`). A
   screen reader would not announce "selected". Design choice in the Reka primitive — flagging for awareness, not
   filing; screen-reader output verification is not available in this toolkit.

**Positives:** focus-visible ring present on the roving cell (3px solid outline). Roving tabindex works (focused cell = `tabindex 0`, others `-1`). Console clean — no errors/warnings (R2).

## Evidence
- `focus-before-jun17.png` — initial cell focus after click
- `focus-after-home-jun14.png` — Home moved focus to start-of-week
- `default-grid-focused-jun17.png` — unbounded grid, roving focus
- `axe-violation-color-contrast.png` — axe addon: 1 violation (color-contrast)
