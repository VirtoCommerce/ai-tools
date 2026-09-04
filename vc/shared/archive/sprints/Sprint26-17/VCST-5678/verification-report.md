# VCST-5678 — Fix Verification

**Ticket:** VCST-5678 · Bug · Low · `[vc-shell] VcScheduler: all-day event's accessible name is off by one day (exclusive vs inclusive end date)`
**Fix:** vc-shell PR [#288](https://github.com/VirtoCommerce/vc-shell/pull/288) (`a51c1356f`) — merged to `main` 2026-08-12
**Verdict: VERIFIED** — 2026-08-25

## Env

**`@vc-shell/framework`** (vc-shell — separate product, not the storefront). Affected 2.4.0, fixed **2.5.0**.
Source `main @ 324cd9b09` (= v2.5.0); live on hosted Storybook `assets/iframe-1uXuqCDm.js`, built 2026-08-19 10:28 GMT.
No linked fix PR was on the ticket — located from `main`'s history.

## Summary

`MonthEventBar` formatted `event.end` raw while `MonthEventPopover` subtracted 1 ms first, so a one-day all-day event
announced a two-day range on the chip and one day in the popover. Both surfaces now report the **last inclusive day**.
The fix also covers `SchedulerTimelineView.ariaLabel` — the second occurrence the ticket flagged — plus
`useTimelineTimeGrid.ts`, and the docs now state the rule explicitly.

## RED → GREEN (unit)

The ticket noted "no existing test covers this (`MonthEventBar.test.ts` only asserts the title substring)". PR #288
added that coverage in both places.

| Phase | Source | Result |
|---|---|---|
| **RED** | `MonthEventBar.vue` + `SchedulerTimelineView.vue` + `useTimelineTimeGrid.ts` @ parent of #288, tests unchanged | **3 failed / 18 passed (21)** |
| **GREEN** | `main @ 324cd9b09` | **21 passed (21)** |

RED failures are the off-by-one in all three shapes:
- `expected 'Summer Sale: Jul 15, 2026 – Jul 16, 2…' not to contain 'Jul 16, 2026'` — the single-day case
- `expected 'Summer Sale: Jul 15, 2026 – Jul 18, 2…' to be '… – Jul 17, 2026'` — the multi-day case
- `expected 'Promo: Jan 13, 2021, 12:00 AM – Jan 1…' to be 'Promo: Jan 13, 2021'` — the timeline-view case

Evidence: `evidence/red-prefix.txt`, `evidence/green-fixed.txt`.

## Live verification — story `data-display-vcscheduler--editing-flow`

The story renders empty ("No events yet. Click a day to add one."), so no pre-existing all-day event was available.
One was created through the real UI: `New event` → title `One Day AllDay` → dialog defaults (All day **on**,
Start `7/15/2026`, End `7/16/2026`) → `Save`.

| Surface | Value (verbatim) |
|---|---|
| Chip `aria-label` (`div.vc-scheduler__event-bar`) | **`One Day AllDay: Jul 15, 2026`** |
| Quick-info popover body (`.vc-popover__content`) | **`July 15th, 2026`** |

Both describe the same single day; no phantom `– Jul 16, 2026`. The chip also occupies only the July 15 cell visually.
Escape closes the quick-info popover and leaves focus on the chip.

Screenshot: `screenshots/5678-chip-and-quickinfo-same-single-day.png`. Console: only the benign preload warning.

## Incidental defect found while verifying — filed separately

In the same story: creating an all-day event with **End = Start** (`7/15/2026` both) saves without complaint — the
dialog closes and the "No events yet…" empty state disappears, so the event *did* enter state — but **no chip renders
in any cell and no event button exists in the a11y tree**. The end date is exclusive internally, so End = Start is a
zero-length event; the editor allows it with no validation and no feedback, leaving an invisible, unreachable record.

This is a **different defect from the one under test** (the editor's write path, not an `aria-label` format), so it does
not fail this ticket — filed as its own ticket and linked. Evidence:
`screenshots/5678-x-saved-end-equals-start-no-chip.png`.

## Regression

Full vc-scheduler + vc-popover suite at `main`: **213 passed (213) across 31 files**, 3 consecutive runs. Framework
typecheck clean.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123 regression
suites cover the storefront only — none cover vc-shell. Screen-reader announcement output was **not** verified (no
NVDA/JAWS/VoiceOver available); the AT claims rest on the measured `aria-label` and popover text.
