# Brief — blind (a benchmark dispatch that has no vc-test brief of its own)

In a blind benchmark run (spec U67) the orchestrator gives this file and `CUTOFF` to every dispatch and skill
before the verdict that has no brief here: triage (`qa-triage-results`), each investigation
(`vc-fix:qa-investigate`) and the visual lane (`qa-design`). It is the whole rule — a U-id in it is a label, never
a reason to open the spec. Where the skill's own procedure says otherwise, this file wins.

- **Read only the paths your dispatch names and the one skill it names**, with the files that skill's procedure
  reads — except what the next lines forbid.
- **Never** `docs/superpowers/**`, `.superpowers/**`, `.claude/worktrees/**`, `plugins/vc-test/benchmarks/**`, or
  git history (no `git log`, `show`, `blame`, `diff`). Never resolve a U-id by grepping the spec.
- **No kb** — no `kb_ask`, `kb_show` or `npm run kb`, read or write. **No bug catalog** (`vc-bug-catalog`), nothing
  under `reports/bugs/`, **no tracker** issue or search, and **no earlier run folder** — only this run's `RUN_DIR`.
- **Triage makes no known-issue match** from the catalog or the tracker: each failure is classified on its own
  evidence, and a real one stays real even if it might be filed already.
- File nothing, comment nothing: a bug that would be filed is a line in your return.
