# VCST-6077 - Step 4v visual lane (design / a11y / design-system)

Build: theme `2.59.0-pr-2536-c2de-c2de2cd2` on `http://localhost` (vcst-qa backend). Lane: `playwright-edge`, signed in as `SR_REP_PRIMARY` (existing fixture, role-gated, data-bearing). Read-only: nothing was completed, reopened, edited, created or deleted. Screenshots: `screenshots/4v-*.png`.

## Verdicts

| Axis | Verdict |
|---|---|
| a11y (axe 4.10.2, wcag2a/aa/21/22aa) | WARN - no PR-attributable violation on the Tasks page; see findings A-1..A-3 |
| design-system (B29) | PASS |
| vs. DESIGN (B30) | SKIPPED - ticket links Figma only; no Claude Design project, no `.design-source/<uuid>/` copy, `design:extract` has no source |
| BL-UI-001 CLS | PASS (1440 light 0.026; 375 light 0.065; 375 dark 0.0755, all <= 0.1, close at 375) |
| BL-UI-004 overflow | PASS (375: scrollWidth 360 = viewport minus scrollbar; no element in `main` clips or scrolls horizontally) |
| BL-UI-006 touch targets (375) | WARN - see W-1 |

Presets covered: Coffee light, Coffee dark. **Red-dark: INCONCLUSIVE** - the preset is a server-side (white-labeling) setting, not switchable by a customer; changing it would be a config write, which this read-only lane does not do. Needs a pass on an environment already set to Red.

## Checklist rows

- **B27 PASS** (rows below). Tasks page axe: only `color-contrast` on the shared primary "New task" button (A-1). Day chip clear "x": `<button>` 24x24 (equals the 2.5.8 minimum, zero headroom), Tab-reachable, `aria-label="Clear Oct 14, 2026"` (localized date), focus ring 2px solid. Chip toggles are `button[aria-pressed]`. Rail calendar keyboard: ArrowRight 14 -> 15, ArrowDown -> 22, Home -> start of week (Sun 18), Enter selects (chip became "Oct 18, 2026").
- **B28 WARN on dashboard widget, PASS on Tasks page.** Coffee dark, Tasks page: axe contrast clean except A-1. Hovered row title (the declared VCST-6134 case) measured and NOT reproduced: dark `rgb(234,247,252)` on row bg `rgb(30,32,37)` ~15:1; light `rgb(15,72,94)` on `#ebebeb` ~8:1. KNOWN case did not occur on these rows. Dashboard "N overdue tasks" (`.sales-rep-tasks__overdue`) = `#bb1616` on `#0a090b` = **3.06:1** in dark (A-2); light is fine.
- **B29 PASS.** New classes (`sales-rep-task-action`, `-scope-chips`, `sales-rep-rule-chip`) contain no hex/rgb literals; colours are `var(--color-*)`; spacing 0.25/0.5/1.25/1.5/ rem all on the scale. `VcCalendar`: frameless instances resolve `--vc-calendar-padding:0`, `--vc-calendar-border-width:0` (computed padding 0, border 0); the date-range picker calendar resolves the defaults `.75rem` / `1px` (computed 12px, 1px `rgb(235,235,235)`), so the new tokens did not regress the framed calendar; `__weekrow` `justify-content:center` (picker grid 7x40px in 318px). `margin-inline-start: calc((var(--px) + 2px) * -1)` resolves to -16px (`--px` .875rem = 14px); icon sits at x=884 vs action box x=868; coupled to the button's internal padding (VCST-6133), will drift if `--px` changes.
- **B30 SKIPPED** (reason above); advisory comparison below.

## Findings

| ID | Class | Sev | Evidence |
|---|---|---|---|
| A-1 | a11y_finding, BL-A11Y-003 / WCAG 1.4.3 | High (pre-existing, theme-level, not PR-caused) | Primary button white on `#f99e24` = 2.11:1 ("New task"; also outline-primary orange text on white 2.11:1 on Dashboard/Filters). Coffee `--color-primary-500`. Light, dark, 1440, 375. |
| A-2 | a11y_finding, BL-A11Y-003 | Medium | Dashboard Tasks widget overdue count `#bb1616` on dark bg 3.06:1 (< 4.5). Only in dark. Confirm in the PR diff whether this style is new; widget is touched by the PR. Sibling `stat-widget__delta` 3.74:1 in dark is a different, older widget. |
| A-3 | a11y_finding, WCAG 2.5.8 (AA, spacing exception) | Low / WARN | 375: task title buttons `sales-rep-task-list__title-button` 18px tall (252-292 wide); breadcrumb links 17px. Probably exempt as inline text, not verified. Row actions 38px tall, fine. |
| E-1 | incidental, environment chrome | Low | QA environment-indicator badge (z-21, top centre) covers the header Theme toggle; pointer click on it times out, keyboard works. Env-only, not the product. |
| E-2 | incidental, pre-existing | Low | Date-range popover opens upward over the header icons at 1440. |
| N-1 | note, BL-UI-003 | none | Selecting a calendar day inserts the day chip first and shifts the five rule chips right by ~124px. User-initiated (hadRecentInput), so not a CLS failure; not a defect, recorded for the case author. |

No `BL-UI-*` FAIL, so `invariant_failures` is empty.

## Advisory design comparison (mockup `tasks-desktop-1440.jpg`, never a FAIL)

| Row | Spec (mockup / ticket) | Live | Verdict |
|---|---|---|---|
| A3 status chip | outlined + dot for Upcoming, Completed, Overdue | Upcoming `vc-chip--outline--info` (matches); Completed `tonal--success` and Canceled `tonal--neutral` | Upcoming CONFIRMED; Completed DRIFT (tonal, mockup outlined); Canceled UNSPEC; Overdue not on screen (no overdue row in Today/ this data), SKIPPED |
| A11 rail width | ticket 272px | aside 280px (22rem is the dashboard widget = 352px; Tasks rail measured 280) | DRIFT +8px |
| A14 completed title colour | grey + strikethrough | link colour `rgb(21,95,122)` + line-through | DRIFT |
| Other | mockup week starts Monday; build starts Sunday | locale-driven | UNSPEC |

## Could NOT conclude

- Screen-reader output (no AT in the toolkit); focus order was Tab-walked only for New task -> day chip -> clear x.
- The WCAG 2.2 additions axe does not cover (2.4.11, 2.5.7, 3.2.6, 3.3.7, 3.3.8) were not audited beyond the target-size measurement.
- Red-dark and every non-gated preset (purple-pink, watermelon).
- Focus-drops-to-root after a row action and the Notes textarea name: known, not re-verified.
- axe injected from cdnjs (no CSP block); results are single scans per state, not dynamic rescans after modal open (the task modal was not opened, it mutates only on save).
