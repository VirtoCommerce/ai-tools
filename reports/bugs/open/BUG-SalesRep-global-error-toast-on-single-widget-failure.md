# BUG: A single failed statistics widget raises a page-level error toast

## Status: CONFIRMED — filed as [VCST-5682](https://virtocommerce.atlassian.net/browse/VCST-5682)

**Severity: Low** (UX consistency — nothing is blocked; the page and every healthy widget stay usable).

**Env:** vcptcore-qa @ Theme 2.55.0-pr-2408-0cc5 · store `B2B-store`

## Summary
When exactly one Sales-Rep statistics query fails, the failing widget correctly shows its own inline "Couldn't load…" state and every sibling keeps its real value — but the page **also** raises the global error toast *"Apologies for the inconvenience. Our server is currently experiencing technical issues. Please try again later."* with a "Report a problem" action. A page-level alarm for one degraded card overstates the failure and partly undercuts the per-widget isolation the hub now implements.

## Steps to Reproduce
1. Sign in as a Sales Rep (`@td(SR_REP_PRIMARY)`); open `{{FRONT_URL}}/company/dashboard`.
2. Force **one** `POST /graphql` operation to fail (e.g. `SalesRepCustomerOrderStatistics`), leaving the others to succeed.
3. Observe the widgets **and** the toast area.

**Expected:** the failing widget shows its inline error; the rest of the page is silent — a page-level "our server is down" toast should be reserved for a page-level failure.
**Actual:** the inline per-card error renders correctly **and** the global toast fires. Reproduced on both `/company/dashboard` and `/company/my-customers`, and on both the plain and the search-active failure paths.

Evidence: `reports/tickets/Sprint26-15/VCST-5586/screenshots/SR-HD-057-per-card-error-siblings-render.png`, `SR-FE-053-table-load-failed-replaces-table.png`.

## Provenance
**Pre-existing — NOT introduced by PR #2408 (VCST-5586).** The toast comes from vc-frontend's global Apollo error handling, which predates the change. It became *visible* only now, because before this PR a failed statistics query produced no distinguishable widget state at all. Note that `useSalesRepCustomers` was explicitly updated in that PR with the comment *"No toast; the page's empty view names the failure instead"* — the module's intent is clearly no toast, but the global handler still fires one.

## Fix Routing
`vc-frontend` — global Apollo/error-toast handler. Decide whether a query that a component already renders an error state for should be exempt from the global toast (e.g. an opt-out flag on the query, or suppression when a component has claimed the error). Product/UX call on the desired behaviour before coding.
