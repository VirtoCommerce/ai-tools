---
name: qa-review-bl
description: "[QA Method] Pipeline entry point for the BL-invariant audit — ALIAS of /qa-review-oracles bl. Called automatically by /qa-test-lifecycle Phase 4c on the BL-* candidates a run surfaced (triangulate against docs + live + source, auto-apply confirmed changes to business-logic.md, reconcile test-case citations). For a manual oracle audit, use /qa-review-oracles."
argument-hint: "all | domain <name> | BL-<ID> | diff [--dry-run]"
---

# /qa-review-bl — alias of `/qa-review-oracles bl`

**This skill is an alias. The methodology lives in [`/qa-review-oracles`](../qa-review-oracles/SKILL.md).**

`/qa-review-bl <args>` is exactly `/qa-review-oracles bl <args>`. **Read
[`../qa-review-oracles/SKILL.md`](../qa-review-oracles/SKILL.md) in full and follow it** with the
axis fixed to **`bl`** — every `bl`-specific file, script, rule code and output path is in that
skill's **Axis contract** table, the `bl` column. Read the file rather than invoking
`/qa-review-oracles`: that skill is `disable-model-invocation: true` (a manual audit stays
user-invoked). This alias is model-invocable only so that `/qa-test-lifecycle` Phase 4c can reach
it — **when a model invokes it, the scope is the `BL-<ID>` candidates Phase 4c passes.** A broader
scope (`all`, `domain <name>`, `diff`) runs only when the user asked for it, because it auto-applies
to `.claude/knowledge/oracles/business-logic.md`.

| `/qa-review-bl …` | ≡ |
|---|---|
| `all` | `/qa-review-oracles bl all` |
| `domain cart` | `/qa-review-oracles bl domain cart` |
| `BL-CART-010` | `/qa-review-oracles bl BL-CART-010` |
| `diff` | `/qa-review-oracles bl diff` |
| `… --dry-run` | `/qa-review-oracles bl … --dry-run` |

## Why the alias exists rather than a rename

`/qa-review-bl` is invoked by name from `/qa-test-lifecycle` **Phase 4c** (automatically — a
silent break there would be invisible) and cited from other prompts and agent definitions
(`grep -rn "qa-review-bl" .claude` lists them). Keeping the name working was cheaper and safer
than editing every call site. New manual work should call `/qa-review-oracles` directly; both
reach the same implementation.

There is deliberately **no ECL alias** — `/qa-review-oracles ecl` is new surface with no legacy
call sites to preserve.
