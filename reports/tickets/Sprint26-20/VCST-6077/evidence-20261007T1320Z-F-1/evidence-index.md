# F-1 — pt weekday headers overflow in VcCalendar — evidence index

**Env:** TEST_ENV=vcst (backend vcst-qa) · lane playwright-chrome (chromium), DPR 2, light theme
**NEW:** `http://localhost` — footer `Ver. 2.59.0-pr-2536-c2de-c2de2cd2` (vc-frontend PR #2536, OPEN, head c2de2cd2)
**BASELINE:** `{{FRONT_URL}}` — footer `Ver. 2.59.0`; vc-deploy-dev `theme/artifact.json` @ `vcst-qa` = release `vc-theme-b2b-vue-2.59.0.zip` (brief expected 2.59.0-alpha.2548; the stand runs the 2.59.0 release, still pre-#2536: `/company/calendar` route, checkbox column)
**User:** `@td(SR_REP_PRIMARY.email)` · tasks fixture NOT re-seeded
**Raw artifacts (referenced):** HAR `test-results/chrome/har/session.har` · console `test-results/chrome/console-2026-10-07T13-2*.log` · DOM snapshots `test-results/chrome/page-2026-10-07T13-2*.yml`
**Trace ID:** n/a — client-side rendering only; no 4xx/5xx/`errors[]` involved.

| # | Artifact | Where |
|---|---|---|
| 1 | NEW /pt/company/tasks rail (sm) | screenshots/new-pt-tasks-rail-calendar-1920.png |
| 1 | NEW /pt/company/dashboard widget (md) | screenshots/new-pt-dashboard-widget-calendar-1920.png |
| 1 | NEW /pt/company/customer-orders date picker (md) | screenshots/new-pt-customer-orders-datepicker-1920.png |
| 1 | BASELINE /pt/company/calendar (md) | screenshots/baseline-pt-calendar-page-1920.png |
| 1 | BASELINE /pt/company/dashboard widget (md) | screenshots/baseline-pt-dashboard-widget-calendar-1920.png |
| 1 | BASELINE /pt/company/customer-orders date picker (md) | screenshots/baseline-pt-customer-orders-datepicker-1920.png |
| 2 | DOM measurement (th scrollWidth/clientWidth, computed font-size) | table below |
| 13 | Source | vc-frontend `dev` `ui-kit/components/molecules/calendar/vc-calendar.vue` L63-65 (`CalendarHeadCell v-for="day in weekDays"`), L212 `weekdayFormat: "short"` default, L495-500 `.vc-calendar__weekday` = bold uppercase tracking-wider in a fixed `--cell-size` column. PR #2536 diff of this file: padding/border-width tokens + `justify-content: center` only. |

## Measurements (1920px, html lang pt-PT) — th scrollWidth / clientWidth

| Surface | Build | size | dom | seg | ter | qua | qui | sex | sáb |
|---|---|---|---|---|---|---|---|---|---|
| /pt/company/tasks rail | NEW | sm (32px, 10px) | 43/32 | 42/32 | 33/32 | 38/32 | 37/32 | 32/32 | 38/32 |
| /pt/company/dashboard widget | NEW | md (40px, 12px) | 53/40 | 51/40 | 41/40 | 46/40 | 45/40 | 40/40 | 47/40 |
| /pt/company/customer-orders picker | NEW | md | 53/40 | 51/40 | 41/40 | 46/40 | 45/40 | 40/40 | 47/40 |
| /pt/company/calendar | BASELINE | md | 53/40 | 51/40 | 41/40 | 46/40 | 45/40 | 40/40 | 47/40 |
| /pt/company/dashboard widget | BASELINE | md | 53/40 | 51/40 | 41/40 | 46/40 | 45/40 | 40/40 | 47/40 |
| /pt/company/customer-orders picker | BASELINE | md | 53/40 | 51/40 | 41/40 | 46/40 | 45/40 | 40/40 | 47/40 |

Reproduction: 6/6 surfaces, deterministic.
Node `Intl.DateTimeFormat(l, {weekday: "short"})`: pt-PT → domingo, segunda, terça, quarta, quinta, sexta, sábado · pt / pt-BR → dom., seg., … · es-ES → dom, lun, … · ru-RU → вс, пн, … · en-US → Sun, Mon, …
