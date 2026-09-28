# Data model — AUDIT mode

**Role:** find data declarations that would let a case pass for the wrong reason, or block it for a
reason unrelated to the product. Read-only.

## 1. Checker

`npm run models:check -- --json`, codes TM-020..031 (header of `scripts/maintenance/check-test-models.ts`).
Every error is a finding as-is.

## 2. Judgment checks

| Check | Finding when |
|---|---|
| Vacuous pair | two requirements serving sibling branches (member / outsider, above / below a target) whose `required_state` or `constraints` do not actually differ on the dimension under test (SECOND RULE) |
| Mis-scoped fixture | a `FIXTURE` whose `shared_state` admits the very mutation one of its profiles' cases performs; that is a per-run requirement mislabelled |
| Pooled state | an account-level requirement used where the state is pooled higher up (an org-pooled balance), per `.claude/rules/test-data.md` DISPOSABLE FIXTURES rule 4 |
| Toggle collision | a `STEP` store-level toggle whose `limits` does not name the concurrent suites it disturbs |
| Unfalsifiable discovery | a `DISCOVER` whose `discover_constraints` omit a dimension the node's oracle reads |
| Over-seeding | a profile carrying a requirement outside its node's closure (TM-028 warn), or a profile whose `--plan` pulls in a seeder the path never reads |
| Irreversible state without isolation | `cleanup.via` says the state cannot be undone and names nothing that isolates it |
| Liveness (not checkable yet) | a requirement whose seed-time state (`*_at_seed` overlay fields) no longer holds. Record it as `UNVERIFIED` via `td:reconcile`; a state-liveness check does not exist yet |

## 3. Report

Findings go to chat, in the same finding shape as the mind-map audit
([`../qa-test-mind-map/audit.md`](../qa-test-mind-map/audit.md) §3), with `family: "data"`. Route:
seeder fixes → `/qa-generate-data`; alias or overlay drift → `/qa-seed-data` + `td:reconcile`;
declaration fixes → update mode.
