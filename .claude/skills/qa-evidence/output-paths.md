# Test Artifact Output Paths

> **This file is a pointer. The policy lives in [`.claude/knowledge/execution/reports-policy.md`](../../knowledge/execution/reports-policy.md)** (reachable as `.claude/rules/reports.md §N` — that stub keeps the section numbers).
>
> Read it for: the ten report categories and their paths (§1), where artifacts must NOT go (§1, closing block), severity foldering of `reports/bugs/open/` (§1a), size caps (§2), screenshot rules and per-scope budgets (§5), console/network/HAR evidence (§6), **naming conventions including the `FAIL` marker and `--iterate` round suffix (§7)**, and retention (§9).
>
> This stub is kept at its original path so the existing references across commands, skills, agent definitions and historical sprint artifacts continue to resolve.

## Why this file is a pointer

It was a **second, diverging copy** of the report policy — the exact failure its sibling
[`evidence-capture-policy.md`](evidence-capture-policy.md) was converted to a pointer to prevent
("three places to update, three places to fall out of sync"). This one was missed in that pass and
drifted, measured 2026-09-19:

| | this file (before) | `reports-policy.md` |
|---|---:|---:|
| mentions of the `FAIL` screenshot marker | **0** | 24 |
| mentions of `testing-checklist.md` | **0** | 6 |
| mentions of `design-report.md` | **0** | 3 |
| mentions of the `--iterate` round suffix | **0** | 2 |

It also contradicted the policy outright on what `/qa-test` persists — this file said *"only
`summary.json` persists"*, where `reports-policy.md` §6 requires `summary.json` +
`testing-checklist.md` + `screenshots/` (+ `design-report.md` when the visual lane ran). An agent
reading this file named failure screenshots without the `FAIL` marker and never wrote Artifact B.

Two of its rules existed nowhere else and were promoted into `reports-policy.md` §1 rather than
deleted: the `reports/` vs `test-results/` separation, and the "never create `reports/<TICKET>/` at
the repo root" guard.

Three of its conventions were **dropped as fiction**, verified against the live tree on 2026-09-19:
`reports/bugs/api-traces/` (does not exist), `reports/checklists/` (does not exist; it described
itself as reserved), and `screenshots/desktop/` + `screenshots/mobile/` subfolders (**0 of 15**
ticket screenshot directories use them — real runs write flat, descriptively-named files).

## Not to be confused with the plugin copy

`plugins/vc-fix/skills/qa-evidence/output-paths.md` is a **different, still-canonical file** and is
deliberately NOT a pointer. `vc-fix` ships no `knowledge/execution/reports-policy.md` — it carries
its own two-category `.claude/rules/reports.md` — so a client install needs the standalone document.
It is also *ahead* of this one: it owns the `/qa-bug` browser-capture chain
(`reports/bugs/screenshots/_incoming/<browser>/` → `<bug-slug>/`, pinned as the Playwright MCP
`--output-dir` by `/project-init`'s `gen-mcp.mjs`), which `scripts/unit/gen-mcp-evidence.test.mjs`
asserts against. Do not sync the two.
