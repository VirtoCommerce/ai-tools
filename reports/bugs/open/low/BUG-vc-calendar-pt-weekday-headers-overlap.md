# BUG: [Storefront][ui-kit] VcCalendar weekday headers overflow and overlap in the `pt` locale ("DOMINGOSEGUNDATERÇA…") — Low

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-10-07-1421

**Severity:** Low (P3) — cosmetic readability defect in one locale; no function lost (days stay clickable, dates correct).
**Env:** TEST_ENV=vcst (backend vcst-qa) · chromium 1920px, DPR 2. Baseline `{{FRONT_URL}}` theme **2.59.0** and PR #2536 build `http://localhost` theme **2.59.0-pr-2536-c2de-c2de2cd2** — identical on both ⇒ **PRE-EXISTING**.
**Relates:** VCST-6077 (found during; PR #2536 only adds one more consumer) · BL-UI-004 (content boundary). Deduped: no tracker ticket, no local draft.

## Summary
With the storefront language set to Portuguese (`pt-PT`), every `VcCalendar` renders its weekday header as full words (DOMINGO, SEGUNDA, TERÇA…) in bold uppercase with letter-spacing inside fixed-width cells. The labels overflow their cells and run into their neighbours, so the header reads as one string.

## Preconditions
Signed in as a sales rep (`@td(SR_REP_PRIMARY.email)`), storefront language Portuguese (`/pt/…`).

## STR
1. Open `/pt/company/dashboard` → Tasks widget calendar (md), **or** `/pt/company/customer-orders` → Filters → Created date → custom range → **Open calendar** (md), **or** (PR #2536 build) `/pt/company/tasks` rail calendar (sm).
2. Look at the weekday header row.

## Expected vs Actual
- **Expected:** weekday labels stay inside their cells (BL-UI-004) — abbreviated, narrow or truncated.
- **Actual:** labels overflow every cell except `sexta`; adjacent labels overlap. Deterministic, 6/6 surfaces.

| size | cell | dom | seg | ter | qua | qui | sex | sáb |
|---|---|---|---|---|---|---|---|---|
| md (12px text) | 40px | 53 | 51 | 41 | 46 | 45 | 40 | 47 |
| sm (10px text) | 32px | 43 | 42 | 33 | 38 | 37 | 32 | 38 |

(`th` scrollWidth in px vs clientWidth = cell.) es-ES / ru-RU / en-US short weekdays are 2–3 chars and fit; pt-BR gives `dom.`, `seg.`.

## Evidence (package kept in place — not copied)
`reports/tickets/Sprint26-20/VCST-6077/evidence-20261007T1320Z-F-1/`
- `evidence-index.md` (measurements, raw HAR/console/DOM paths) · `root-cause.md`
- `screenshots/new-pt-tasks-rail-calendar-1920.png` · `screenshots/new-pt-dashboard-widget-calendar-1920.png` · `screenshots/new-pt-customer-orders-datepicker-1920.png`
- `screenshots/baseline-pt-calendar-page-1920.png` · `screenshots/baseline-pt-dashboard-widget-calendar-1920.png` · `screenshots/baseline-pt-customer-orders-datepicker-1920.png`
- Console/network: no errors, no failed requests — client-side rendering only.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | screenshots + measurements above |
| 2. Backend Admin | N/A | not admin-visible (client-side weekday labels) |
| 3. GraphQL xAPI | N/A | labels come from `Intl`, no xAPI data involved |
| 4. Platform REST API | N/A | no REST call involved |

**Owning layer:** Layer 1 — Storefront (ui-kit).

## Module Versions
Theme 2.59.0 (vc-deploy-dev `theme/artifact.json` @ `vcst-qa`) and 2.59.0-pr-2536-c2de-c2de2cd2. Backend irrelevant (frontend-only).

## Root Cause Analysis
`client-app/ui-kit/components/molecules/calendar/vc-calendar.vue` (vc-frontend `dev`): header cells iterate reka-ui `weekDays` (L63-65), formatted with the default `weekdayFormat: "short"` (L212) → `Intl.DateTimeFormat(locale, {weekday: "short"})`. CLDR pt-PT "short" weekdays are full words. `.vc-calendar__weekday` (L495-500) is bold + uppercase + `tracking-wider` in a fixed `--cell-size` column (2.5rem md / 2rem sm) with no overflow handling. PR #2536 only tokenises padding/border-width and centres the grid — `--cell-size` and weekday text unchanged. Fix direction (not prescribed): `weekdayFormat: "narrow"` (at least for sm/xs), a 2–3 char abbreviation, or truncation of the weekday cell. Detail: package `root-cause.md`.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** ui-kit VcCalendar (molecule) — shared by Tasks rail, dashboard Tasks widget, customer-orders date-range picker
- **RCA anchor:** `client-app/ui-kit/components/molecules/calendar/vc-calendar.vue` L212 `weekdayFormat: "short"`; L495-500 `.vc-calendar__weekday`
- **Routing confidence:** HIGH

**Tracker labels when filed:** `found-by-agent` + `found-in-regression`.
