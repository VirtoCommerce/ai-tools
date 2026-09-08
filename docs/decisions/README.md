# docs/decisions — rationale, never loaded

Files here record **why** a rule, pipeline step or design is shaped the way it is: measured incidents, retired designs, the evidence behind a gate. They are read by humans deciding whether to change something. **No agent, command, skill or hook loads them**, and nothing here is normative — the normative text is always the file each entry names in its first lines.

This is the third loading tier described in `CLAUDE.md` §Where the rules live:

| Tier | Where | Cost |
|---|---|---|
| Always loaded | `CLAUDE.md`, `.claude/rules/*.md` | paid on every turn and every subagent dispatch |
| On demand | `.claude/knowledge/**`, skill supporting files, commands | paid only by the step that reads it |
| Never loaded | `docs/decisions/` | zero |

When a rule accretes a *"measured on YYYY-MM-DD …"* paragraph, the rule stays in its tier and the paragraph comes here, with a pointer. Created 2026-09-08 by PR 2 of the agentic-system audit (`docs/agentic-system-audit-2026-09-07.md`).

| File | Moved from |
|---|---|
| `qa-test-evolution.md` | `CLAUDE.md` §Detailed References (the 87 KB design record of `/qa-test`) |
| `self-diagnostics-design.md` | `CLAUDE.md` §Project Overview |
| `regression-history.md` | `.claude/rules/regression.md` §3 (the retired autonomous orchestrator) |
