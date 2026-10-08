## Root-Cause Worksheet — VCST-6077 F-2

1. **Symptom:** after a task mutation on the Sales Rep tasks page, keyboard focus falls to `<body>`.
2. **Lowest failing layer:** storefront UI (vc-frontend). The network is fine: the mutation and the refetch both succeed.
3. **Evidence → claim:** both builds give BODY for every action (see the table in evidence-index). In source, both the old and the new task list pass `:loading` to `VcTable`. Its `<tbody v-if="loading">` swaps the rows for a skeleton during the refetch (vc-table.vue L133 vs L196), which unmounts the focused row control. The row controls are also `:disabled="busy"` while the write runs: the checkbox on `dev`, `SalesRepTaskAction` in the PR.
4. **Why:** the page does not save and restore focus around the refetch, and the skeleton swap destroys the element that had focus.
5. **Alternatives ruled out:** *Introduced by the redesign*: no. The baseline `/company/calendar` gives the same result and uses the same VcTable loading path. *Data or environment drift*: no. Same backend, own task, deterministic (8/8).
6. **Regression archaeology:** not a regression. It predates the redesign (the calendar page has it) and was carried over unchanged.
7. **Confidence:** HIGH for the behaviour. MEDIUM-HIGH for the mechanism, which comes from source and was not instrumented.
8. **Fix routing:** vc-frontend (`repoKind: frontend`). Either restore focus in `client-app/modules/sales-rep/pages/sales-rep-tasks-page.vue` after `toggleCompletion`, `onTaskSaved` and delete, or keep the VcTable rows mounted during a refetch. **Provenance: PRE-EXISTING.** Not counted against the VCST-6077 verdict; candidate for a separate a11y bug (WCAG 2.4.3).
