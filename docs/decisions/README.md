# docs/decisions — rationale, never loaded

Files here record **why** a rule, pipeline step or design is shaped the way it is: measured incidents, retired designs, the evidence behind a gate. They are read by humans deciding whether to change something. **No agent, command, skill or hook loads them**, and nothing here is normative — the normative text is always the file each entry names in its first lines.

This is the third loading tier described in `CLAUDE.md` §Where the rules live:

| Tier | Where | Cost |
|---|---|---|
| Always loaded | `CLAUDE.md`, `.claude/rules/*.md` | paid on every turn and every subagent dispatch |
| On demand | `.claude/knowledge/**`, skill supporting files, commands | paid only by the step that reads it |
| Never loaded | `docs/decisions/` | zero |

When a rule accretes a *"measured on YYYY-MM-DD …"* paragraph, the rule stays in its tier and the paragraph comes here, with a pointer. Created 2026-09-08 by PR 2 of the agentic-system audit (the audit document itself, `docs/agentic-system-audit-2026-09-07.md`, was removed 2026-10-01 in #364; `git show 257b9133^:docs/agentic-system-audit-2026-09-07.md` recovers it).

| File | What it is the rationale for |
|---|---|
| `qa-test-evolution.md` | `/qa-test` — the design record, moved from `CLAUDE.md` §Detailed References |
| `self-diagnostics-design.md` | The `vc-fix` self-diagnostics subsystem — moved from `CLAUDE.md` §Project Overview |
| `regression-history.md` | The retired autonomous orchestrator, the removed `regression.yml`, the shared-tree losses — moved from `.claude/rules/regression.md` §3 |
| `autofix-proof-medium.md` | `/qa-fix` G2 MEDIUM RULE, the `PROOF_*` declarations and the executed-argument rule in G4 (VCST-5940) |
| `unit-test-roi.md` | NO CODE ⇒ NO UNIT TEST and the FOURTH RULE in `.claude/rules/test-data.md` — the mutation measurement behind deleting redundant tests |
| `test-mind-map-and-data-model.md` | `/qa-test-mind-map`, `/qa-test-data-model` and `npm run models:check` (VCST-6090) |
| `kb-write-time-retrieval.md` | The `kb` ranker / verdict at write time (VCST-6122) — milestones and measurements |
| `kb-procedural-plane.md` | **Proposed, not built** — the shape of a procedural plane in the `kb` |
| `kb-knowledge-migration.md` | **Conceptual, not built** — the shape of migrating repo knowledge into the `kb` |
