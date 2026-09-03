# Step 5g — promote the new cases (FULL only, last, non-blocking)

Split out of [`close-out.md`](close-out.md). Read it when a FULL run authored cases and the close-out has
already been delivered — 5g runs **after** 5e/5f/5h and blocks nothing.

## 5g. Promote the new cases — FULL only, last, non-blocking

**`--iterate`: 5g runs AT LOOP EXIT, ONCE.** `tc:promote` reads `Draft` and writes `Automated` and can
**never re-promote**, so a round-1 flip is irreversible and would ground `{OBSERVED}` in the build that
was wrong. At exit, promote **per `RUN_ID`, `--ids`-scoped to the cases that run actually executed** —
the three invocations and the expected PR-014 warning are in [`modes.md`](modes.md) §5k §5g at loop
exit.

The verdict/report/status close-out (5a–5f) is already complete and delivered to the user before this phase
starts; a slow or REJECTed promotion never delays TESTED/REOPEN. The cases are in the suite as `Draft`,
grounded and promotable only now that Step 4 executed them live via the automated runner.

1. **Harvest:** `/qa-review-tests file <target-suite.csv> --verify --fix` — every assertion this run observed
   live is rewritten `{HYPOTHESIS}` / unconfirmed-`{SPEC}` → `{OBSERVED}`; a **refuted** behaviour surfaces
   as ENV-008, never `{OBSERVED}`.
2. **Resolve each remaining `{HYPOTHESIS}`** with the observed value; one that stayed genuinely unknown is
   reworded as a question and keeps its case at `Draft` — never invent a value.
3. **Re-derive eligibility** (the same G10 the promoter uses): 0 GRD-001 Blocker/High, 0 ENV-008, green
   `td:validate`, every assertion grounded, executed with evidence.
4. **Ask to promote, then flip in place — via the deterministic promoter, never by hand-editing the cell.**
   `npm run tc:promote -- <RUN_ID> --suite <ID> --stamp <ticket-key>` prints the per-case decision, then
   `tc:promote:apply` writes it (`.claude/rules/regression.md` §Post-Run Promotion; core
   `scripts/test-cases/promote-cases.ts`). It re-derives the same G10 as step 3 by linting each row **at its
   target status**, refuses a flaky or non-PASS case with a `PR-*` reason code, and edits only the changed
   fields — the hand path renormalised quoting and could promote on a PASS nobody could re-derive. It writes
   `Automated` only; a case verified via the **manual checklist** (no automated-runner verdict) is still
   `Reviewed`/`Manual` by hand. **Revert (remove) a non-promotable row** so the durable suite doesn't carry
   an ungrounded case that would keep running — **except** a case that failed on a real IN-SCOPE bug, which
   stays `Draft` with a documented reason (valid coverage flagging the open defect). The
   `Promoted: <ticket-key> (YYYY-MM-DD)` `References` stamp is applied by the promoter (appended; never
   clobbering a `Synced:`/`Audited:` stamp). Then `npm run suites:sync && npm run suites:lint`; re-run
   `suites:review -- <target-suite.csv> --fail-on=High` (an append that introduced a new Blocker/Critical is
   reverted).
5. **Record the split** in `summary.json.promotion` (`automated`/`reviewed`/`blocked`/`reverted`).

**Gate (FULL, 1 round):** every `Automated`/`Reviewed` upgrade traces to a real artifact from this run;
every surviving `{HYPOTHESIS}` is resolved or reworded; `suites:lint` green. A fresh `qa-lead` verifier
**re-runs `suites:review`** on the target suite and, for a sample of upgraded assertions, **re-opens the
Step-4 evidence** grounding each `{OBSERVED}`. REJECT any `{OBSERVED}` with no traceable artifact, any
`{HYPOTHESIS}` cleared by an invented value, any case promoted while still carrying a Blocker/Critical →
revert the append → fix → re-verify once → STOP.

**Reverting an append is a row-level edit, NEVER a `git checkout`.** Remove the appended rows with the
same surgical discipline the promoter writes with (locate each record by its own raw text, delete only
those bytes, re-parse and field-compare the survivors), then `suites:sync`. A `git checkout`/`restore`
on the CSV or the manifest is forbidden by `.claude/rules/regression.md` §WORKING IN A SHARED TREE —
several sessions hold uncommitted work in this tree, the manifest in particular is shared state written
by `suites:sync`, and the 2026-08-28 loss was exactly this reflex reaching past its intended target.
For a baseline to diff against, read `git show HEAD:<path>` into the scratchpad.

An ungrounded `{OBSERVED}` is worse than a `Draft` case: it puts a fabricated expectation into permanent
coverage. **The author never self-certifies this** — only `qa-lead-orchestrator` or the user promotes.

`/qa-test-lifecycle` Phase 6P remains the promoter for handoff, re-promotion, and non-`/qa-test` sources.
