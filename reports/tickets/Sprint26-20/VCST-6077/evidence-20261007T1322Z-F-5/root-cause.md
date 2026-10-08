## Root-Cause Worksheet — VCST-6077 F-5

1. **Symptom:** the tab title stays "Virto Commerce" on the Tasks, Dashboard and My customers hub pages (WCAG 2.4.2).
2. **Layer:** storefront UI (vc-frontend), `client-app/modules/sales-rep/pages/*`.
3. **Evidence:** the title table in evidence-index. In source, these pages never call `usePageHead`; customer-orders and customer-profile do.
4. **Why:** these page components never set a page head.
5. **Alternatives ruled out:** *Introduced by PR 2536*: no. The baseline calendar, dashboard and my-customers pages show the same title. *Timing of an async title*: no. Titles were read after 3 s, and the control pages in the same session do get a title.
6. **Regression:** none. All three hub pages have it on both builds.
7. **Confidence:** HIGH.
8. **Fix routing:** vc-frontend (`frontend`). Add `usePageHead` to `sales-rep-tasks-page.vue`, `dashboard.vue` and `my-customers.vue`. **Provenance: PRE-EXISTING.** The new Tasks page inherits it. Out of scope for 6077; one bug covers all the hub pages.
