# Evidence index — VCST-6077 SR-CO-051 (customer-orders date picker and Reset filters focus)

**Env:** TEST_ENV=vcst · vcst-qa backend (shared) · NEW = `http://localhost`, theme `2.59.0-pr-2536-c2de-c2de2cd2` · BASELINE = deployed storefront, footer `Ver. 2.59.0.` · Edge 1920 (split layout) · sales rep `@td(SR_REP_PRIMARY.email)` · 2026-10-07 13:26–13:29Z
**Trace ID:** n/a. Client-only focus defect; the SalesRepCustomerOrders refetch succeeds.

PR #2519 (VCST-6001, VcDateRangePicker) was merged at 2026-10-07T07:41:47Z. The baseline build already renders the same Filters > Created date 'Custom date' Start/End picker, including 'Open calendar: Start date'.

| Step (1920, keyboard only) | NEW | BASELINE |
|---|---|---|
| (a) Filters, Tab ×4 to 'Open calendar: Start date', Enter, ArrowLeft, ArrowUp, Enter on 29 Sep | focus on the INPUT combobox 'Start date' (value 09/29/2026) | same |
| Apply by keyboard | focus on the 'Filters' button | same |
| (b) Tab ×2 to the chip-row 'Reset filters', Enter | activeElement BODY, `:focus` matches 0, chip gone | same |

Screenshots: screenshots/new-after-reset-filters-focus-body.png, screenshots/baseline-after-reset-filters-focus-body.png
