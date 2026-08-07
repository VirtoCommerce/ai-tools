---
name: qa-review-bl
description: "[QA Method] ALIAS of /qa-review-oracles bl — triangulate each BL invariant against docs + live + source code, auto-apply confirmed changes to business-logic.md, and reconcile test-case coverage. The methodology now lives in the merged qa-review-oracles skill."
argument-hint: "all | domain <name> | BL-<ID> | diff [--dry-run]"
disable-model-invocation: true
---

# /qa-review-bl — alias of `/qa-review-oracles bl`

**This skill is an alias. The methodology lives in [`/qa-review-oracles`](../qa-review-oracles/SKILL.md).**

`/qa-review-bl <args>` is exactly `/qa-review-oracles bl <args>`. Invoke the merged skill and
follow it, with the axis fixed to **`bl`** (oracle `knowledge/oracles/business-logic.md`,
deterministic core `bl:lint`/`bl:audit:collect`, criteria file
[`bl-audit-criteria.md`](../qa-review-oracles/bl-audit-criteria.md), proposals
`reports/ba/bl-proposals-<date>.md`, report `reports/knowledge/BL-AUDIT-<date>.md`).

| `/qa-review-bl …` | ≡ |
|---|---|
| `all` | `/qa-review-oracles bl all` |
| `domain cart` | `/qa-review-oracles bl domain cart` |
| `BL-CART-010` | `/qa-review-oracles bl BL-CART-010` |
| `diff` | `/qa-review-oracles bl diff` |
| `… --dry-run` | `/qa-review-oracles bl … --dry-run` |

## Why the alias exists rather than a rename

`/qa-review-bl` is referenced from `/qa-test-lifecycle` **Phase 4c** (which runs it
automatically — a silent break there would be invisible), `/ba-analyze`, `.claude/rules/*`,
and the `ba-system-analyzer` agent definition. Keeping the name working was cheaper and safer
than editing every call site. New work should call `/qa-review-oracles` directly; both reach
the same implementation.

There is deliberately **no ECL alias** — `/qa-review-oracles ecl` is new surface with no legacy
call sites to preserve.
