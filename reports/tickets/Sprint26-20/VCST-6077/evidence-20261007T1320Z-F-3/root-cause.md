# F-3 — root-cause worksheet

**Verdict:** REPRODUCED on NEW; NOT APPLICABLE on BASELINE (the control did not exist — completion was a label-less checkbox) → **IN-SCOPE** (new UI introduced by PR #2536).

1. **Symptom:** es "Marcar como completada" / ru "Отметить как выполненную" wrap to two centred lines inside a 208px button at 1440 and 1920; the icon is detached at the left.
2. **Lowest failing layer:** vc-frontend `client-app/modules/sales-rep/components/sales-rep-task-action.vue` (new in the PR) inside the fixed `w-56` actions column of the task list. VcButton wraps and centres its content; the column was sized for the en label.
3. **Alternatives ruled out:** by-design — no documented 2-line state; en renders one line; data drift — n/a (static i18n); viewport — identical at 1440/1920 because the column is fixed.
4. `TODO(VCST-6133)` concerns the left-alignment margin hack, not the wrapping — related fragility, separate issue.
5. **Fix direction:** `white-space: nowrap` with a wider/auto column, start-aligned label next to the icon, or shorter es/ru strings.
6. **Owning layer / repo:** vc-frontend, sales-rep module. **Confidence:** HIGH (repro + provenance); impact cosmetic.
