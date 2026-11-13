# Reconcile — at close-out, before the verdict

Moved from SKILL.md §Reconcile — at close-out, unchanged (used by `/qa-test-fast` Stage 3, and the single `/qa-test` next).

Not an entry of this skill: the caller runs these steps inline at close-out to fill the round's
reconciliation:

- One row per in-scope risk, plus one per amendment: planned → what ran (checklist item ids, charter
  items, lane, regression case ids) → result → deviation and its reason.
- A planned risk that did not run and has no reason ⇒ back to execution, or listed under *Not tested, and
  why*. It is never dropped; in round 3 it goes to the escalation.
- A High or Critical risk without a result **caps the verdict**: not `PASS`
  ([verdict-rules](verdict-rules.md) §Decide the verdict).
- Copy the counts, the round, the depth label and the candidate cases into `summary.json.strategy`
  (in this repository: keys from `.claude/templates/qa-test-summary.schema.json`).
