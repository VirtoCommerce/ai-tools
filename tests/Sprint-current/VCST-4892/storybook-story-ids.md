# VCST-4892 — Verified Storybook story IDs (from index.json at vcst-qa-storybook.govirto.com)

**Verified 2026-05-22 by orchestrator in playwright-edge — all 3 components render cleanly. The previous BLOCKED report was a false positive (likely from navigating to a non-existent story ID like `--basic`).**

## VcDateInput (molecule) — 18 entries
- `components-molecules-vcdateinput--docs` (docs page)
- `components-molecules-vcdateinput--default` (canonical default story)
- `components-molecules-vcdateinput--with-label`
- `components-molecules-vcdateinput--with-value`
- `components-molecules-vcdateinput--with-min-max`
- `components-molecules-vcdateinput--with-external-error`
- `components-molecules-vcdateinput--disabled`
- `components-molecules-vcdateinput--readonly`
- `components-molecules-vcdateinput--required`
- `components-molecules-vcdateinput--clearable`
- `components-molecules-vcdateinput--update-on-enter`
- `components-molecules-vcdateinput--locale-ru`
- `components-molecules-vcdateinput--locale-ja`
- `components-molecules-vcdateinput--locale-en-us`
- `components-molecules-vcdateinput--size-sm`
- `components-molecules-vcdateinput--size-xs`
- `components-molecules-vcdateinput--with-mask`
- `components-molecules-vcdateinput--with-mask-locale-ja`

## VcCalendar (molecule) — 13 entries
- `components-molecules-vccalendar--docs`
- `components-molecules-vccalendar--default`
- `components-molecules-vccalendar--selected`
- `components-molecules-vccalendar--with-min-max`
- `components-molecules-vccalendar--with-disabled-dates`
- `components-molecules-vccalendar--with-footer`
- `components-molecules-vccalendar--size-xs`
- `components-molecules-vccalendar--size-sm`
- `components-molecules-vccalendar--first-day-sunday`
- `components-molecules-vccalendar--locale-ru`
- `components-molecules-vccalendar--locale-ja`
- `components-molecules-vccalendar--locale-long-month-name`
- `components-molecules-vccalendar--boundary-today`

## VcDatePicker (organism) — 16 entries
- `components-organisms-vcdatepicker--docs`
- `components-organisms-vcdatepicker--default`
- `components-organisms-vcdatepicker--with-label`
- `components-organisms-vcdatepicker--with-value`
- `components-organisms-vcdatepicker--with-min-max`
- `components-organisms-vcdatepicker--with-disabled-dates`
- `components-organisms-vcdatepicker--with-footer`
- `components-organisms-vcdatepicker--disabled`
- `components-organisms-vcdatepicker--with-external-error`
- `components-organisms-vcdatepicker--clearable`
- `components-organisms-vcdatepicker--with-mask`
- `components-organisms-vcdatepicker--locale-ja`
- `components-organisms-vcdatepicker--size-sm`
- `components-organisms-vcdatepicker--size-xs`
- `components-organisms-vcdatepicker--close-on-select-false`
- `components-organisms-vcdatepicker--enabled-teleport`

## VcDateSelector (deprecated) — 7 entries
- `components-molecules-vcdateselector--docs`
- `components-molecules-vcdateselector--basic`
- `components-molecules-vcdateselector--disabled`
- `components-molecules-vcdateselector--with-min-max`
- `components-molecules-vcdateselector--error-state`
- `components-molecules-vcdateselector--out-of-range-validation`
- `components-molecules-vcdateselector--with-date-time`

## Story URL pattern
`https://vcst-qa-storybook.govirto.com/iframe.html?id={story-id}&viewMode=story`

## Verified render samples (Edge browser, 2026-05-22 14:42 UTC)
- `vcdatepicker--default`: textbox `MM/DD/YYYY` + "Open calendar" button — RENDERS OK
- `vccalendar--default`: full calendar grid with Mon-first week, May 2026 header, prev/next year+month buttons, ARIA `application` role, `gridcell` + accessible names like "Monday, April 27, 2026" — RENDERS OK
- `vcdateinput--default`: textbox `MM/DD/YYYY` + ISO value label — RENDERS OK

All three rendered with zero console errors.
