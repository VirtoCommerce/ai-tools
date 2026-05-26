# Evidence Capture & Report Verbosity Policy

> **This file is a pointer. The policy lives in [`.claude/rules/reports.md`](../../../rules/reports.md).**
>
> All agents read that single file for: the 4 allowed report categories, hard size caps per report type, required sections, bloat patterns to cut, screenshot capture rules and per-scope budgets, console & network evidence rules, HAR handling, and naming conventions.
>
> This stub is kept at its original path so the 20+ existing references across skills, commands, agent definitions, and historical sprint artifacts continue to resolve.

## Why one file

The report policy used to be split across:
- `.claude/rules/reports.md` — categories + size caps
- this file — verbosity tiers + screenshot/console/HAR/naming
- `.claude/agents/qa/shared-instructions.md` File Output Policy — restating the categories

That was three places to update, three places to fall out of sync, and three places for an agent to skim past. The canonical policy is now consolidated at [`.claude/rules/reports.md`](../../../rules/reports.md). Update only that file.

## Sign-off templates

For pass/fail/conditional sign-off table templates, see [`sign-off-templates.md`](sign-off-templates.md) in this directory.
