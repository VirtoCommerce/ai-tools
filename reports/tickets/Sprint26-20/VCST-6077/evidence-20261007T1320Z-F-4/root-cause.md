# F-4 — root-cause worksheet

**Verdict:** REPRODUCED on NEW; NOT_REPRODUCED on BASELINE → **IN-SCOPE** (regression introduced by PR #2536).

1. **Symptom:** ru Upcoming / Completed / Overdue chips render ellipsized ("Предстоящ…", "Выполненн…", "Просрочен…") at 1920.
2. **Lowest failing layer (proven):** vc-frontend `sales-rep-task-status.vue` — the PR adds an icon (+ gap) inside a `truncate` VcChip, shrinking the label box to 80px, while the status column stays a fixed `w-36` (144px → 112px content). The baseline pill had no icon and ~100px for the label, so the same strings fit (95/95, 97/97, 100/100).
3. **Alternatives ruled out:** viewport — the column is fixed, not fluid; data — same static i18n strings on both builds; "Notes has room" — only ≈32px of slack at 1920; the constraint is the fixed status column, not competition with Notes.
4. **Fix direction:** widen / auto-size the status column (e.g. `w-40`), or drop the icon / allow the label to take the slack.
5. **Owning layer / repo:** vc-frontend, sales-rep module. **Confidence:** HIGH.
