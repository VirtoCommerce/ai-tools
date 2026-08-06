---
description: "ALIAS of /qa-review-oracles bl — audit BL invariants against docs + live + source code, auto-apply confirmed changes to business-logic.md, and reconcile test-case coverage. Gated by a 3-source evidence bar (not human approval); unconfirmed items route to the proposals file."
argument-hint: "all | domain <name> | BL-<ID> | diff [--dry-run]"

---

# /qa-review-bl — alias of `/qa-review-oracles bl`

**This command is an alias.** The BL and ECL oracle audits were merged into one skill on
2026-08-06 because they shared their entire mechanism — same writer (`ba-system-analyzer`),
same three evidence axes, same evidence bar, same auto-apply-vs-proposals split, same
stable-ID contract, same deterministic lint core, same citation cross-reference into
`regression/suites/**`. Only the entry *shape* differs, and that lives in the two criteria files.

`/qa-review-bl <args>` ≡ `/qa-review-oracles bl <args>`. Run
[`/qa-review-oracles`](qa-review-oracles.md) with the axis fixed to **`bl`**:

| `/qa-review-bl …` | ≡ |
|---|---|
| `all` | `/qa-review-oracles bl all` |
| `domain cart` | `/qa-review-oracles bl domain cart` |
| `BL-CART-010` | `/qa-review-oracles bl BL-CART-010` |
| `diff` | `/qa-review-oracles bl diff` |
| `… --dry-run` | `/qa-review-oracles bl … --dry-run` |

Axis `bl` binds: oracle `.claude/knowledge/oracles/business-logic.md` · deterministic core
`bl:audit:collect` / `bl:lint` · suite citation column `Business_Rule` · criteria
[bl-audit-criteria.md](../skills/qa-review-oracles/bl-audit-criteria.md) · proposals
`reports/ba/bl-proposals-<date>.md` · report `reports/knowledge/BL-AUDIT-<date>.md`.

## Why an alias rather than a rename

This name is referenced from `/qa-test-lifecycle` **Phase 4c** — which runs it *automatically*,
so a silent break there would be invisible — plus `/ba-analyze`, `.claude/rules/*`, and the
`ba-system-analyzer` agent definition. Keeping it working was cheaper and safer than editing
every call site. New work should call `/qa-review-oracles` directly.

Full methodology: [`/qa-review-oracles` skill](../skills/qa-review-oracles/SKILL.md).
