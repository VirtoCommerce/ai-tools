# Evidence index — VCST-6077 F-5 (Sales Rep hub pages keep the default document title)

**Env:** TEST_ENV=vcst · vcst-qa backend (shared) · NEW = `http://localhost`, theme `2.59.0-pr-2536-c2de-c2de2cd2` · BASELINE = deployed storefront, footer `Ver. 2.59.0.` · Edge · sales rep `@td(SR_REP_PRIMARY.email)` · 2026-10-07 13:20–13:26Z
**Trace ID:** n/a. Client-only; no request is involved.

| Page (full load, then 3 s) | NEW `document.title` | BASELINE `document.title` |
|---|---|---|
| /company/tasks (NEW), /company/calendar (BASELINE) | Virto Commerce | Virto Commerce |
| /company/dashboard | Virto Commerce | Virto Commerce |
| /company/my-customers | Virto Commerce | Virto Commerce |
| /company/customer-orders (hub page, control) | QA & Customer orders | QA & Customer orders |
| /account/dashboard (non-hub control) | QA & Dashboard | QA & Dashboard |
| /sign-in (control) | QA & Sign in | QA & Sign in |

Source: in `client-app/modules/sales-rep/pages`, only customer-orders, customer-order-details and customer-profile call `usePageHead`. `dev` `calendar.vue`, `dashboard.vue` and `my-customers.vue` do not, and neither does PR `sales-rep-tasks-page.vue`.
Screenshots are not useful for a tab title; the values above were read from `document.title`.
