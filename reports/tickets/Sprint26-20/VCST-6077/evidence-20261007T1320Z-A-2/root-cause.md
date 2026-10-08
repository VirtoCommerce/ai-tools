# A-2 — root-cause worksheet

**Verdict:** REPRODUCED on NEW and BASELINE → **PRE-EXISTING** (outside PR #2536's change set; the PR only changed the link target).

1. **Symptom:** in dark mode the dashboard Tasks widget "N overdue tasks" link is 3.06:1 on the page background (12px bold needs 4.5:1).
2. **Lowest failing layer:** vc-frontend sales-rep dashboard Tasks widget styling of `.sales-rep-tasks__overdue`, which resolves to `--color-danger-600`; in the coffee dark palette that is #bb1616 (the dark scale inverts — 700 is the light step). Identical class and colour on 2.59.0.
3. **Alternatives ruled out:** PR-introduced — no (baseline identical); light mode — #bb1616 on white passes, so it is a dark-mode token choice; data — n/a.
4. **Fix direction:** a dark-aware text token in the widget (e.g. danger-700 under `.dark`, or a semantic danger-text token that flips).
5. **Owning layer / repo:** vc-frontend (sales-rep dashboard widget; possibly dark preset tokens). **Confidence:** HIGH on provenance, MEDIUM on component-vs-preset ownership.
