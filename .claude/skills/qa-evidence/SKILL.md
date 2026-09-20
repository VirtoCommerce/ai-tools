---
name: qa-evidence
description: "[QA Method] Evidence capture & report formatting: screenshot rules, 3-tier verbosity, output paths."
argument-hint: "[compact|detailed|signoff]"
---

# /qa-evidence — Evidence Capture & Output Standards

**The capture rules, size caps, screenshot budgets, naming conventions and output paths live in
[`knowledge/execution/reports-policy.md`](../../knowledge/execution/reports-policy.md)** (reachable as
`.claude/rules/reports.md §N`). Read it before any test session. This file routes to it and owns the
one thing it does not cover: the report **verbosity tiers** below.

## Usage
```
/qa-evidence                # Full policy review (capture rules + output paths)
/qa-evidence compact        # Compact reporting tier rules
/qa-evidence detailed       # Detailed reporting tier rules
/qa-evidence signoff        # Sign-off reporting tier rules
```

## Supporting Files

- **[sign-off-templates.md](sign-off-templates.md)** — the real content here: frontend + backend
  sign-off tables, quick status reports (Teams format), approval criteria, escalation triggers.
  Nothing else in the tree carries these.
- **[evidence-capture-policy.md](evidence-capture-policy.md)** — pointer to the report policy.
  Tier-A locked (`docs/versioning.md`), so the path is kept even though the content moved.
- **[output-paths.md](output-paths.md)** — pointer to the report policy. Was a second, diverging
  copy of it until 2026-09-19; see that file for what drifted and what was dropped as fiction.

## Report Verbosity Tiers

**This table is the source of truth for the tiers** — `reports-policy.md` does not define them, and
`qa-metrics/quality-metrics-catalog.md` cites them by name.

| Tier | Use When | Content |
|------|----------|---------|
| **Compact** | Regression suite pass, smoke run | Pass/fail table + bug list only |
| **Detailed** | Sprint testing, tracker ticket testing | Full test case results + evidence |
| **Sign-Off** | Pre-release, stakeholder review | Detailed + summary + risk assessment — use `sign-off-templates.md` |

## What this file deliberately no longer restates

A mandatory-capture table, a skip-capturing list, a per-bug screenshot budget and an output-path
table all used to sit here, duplicating `reports-policy.md` §1, §5.1 and §7. Two of the paths had
gone stale and were **verified dead on 2026-09-19**: `reports/bugs/api-traces/` does not exist, and
there is no root `tests/` directory for "test docs" to go to. That is the cost of a fourth copy, and
the mechanism is the GOLDEN RULE in [`.claude/rules/test-data.md`](../../rules/test-data.md): a
transcribed constant is correct exactly once, then fails silently. Cite the policy; do not restate it.
