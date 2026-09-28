# Mind map — AUDIT mode

**Role:** find what is wrong or missing in a map without changing it. The checker computes the
structural half. This mode adds the judgment half that no script can compute, and reports both as one
ranked list. Read-only: an audit that edits is an update.

## 1. Run the checker

`npm run models:check -- --json`. Every error is a finding as-is. Map the codes (header of
`scripts/maintenance/check-test-models.ts`) onto the audit's four families:

| Family | Checker codes |
|---|---|
| Structural | TM-002, 003, 004, 009, 010, 012 |
| Behavioural | TM-006, 007, 008, 013 |
| Data | TM-005, and the data-model codes TM-020..031 |
| Coverage / staleness | TM-011, 014, 015, 016, 017, 030 |

## 2. Judgment checks, per node

| Check | Finding when |
|---|---|
| Missing preconditions | a behaviour whose oracle's `Verify` names a precondition the node's `preconditions`/`requires` do not |
| Missing postconditions | a state-changing behaviour with no `state_after` and no `postconditions` |
| Unsupported branch | a branch whose evidence is only `HYPOTHESIS` while its status is not UNVERIFIED (the checker catches CONFIRMED; this catches a wrong DRIFT) |
| Contradictory states | two states of one entity that a source says cannot both hold, reachable from one behaviour |
| Stale DRIFT | a `DRIFT` whose `route` already resolved (the oracle was amended, the kb entry settled) but the node was never updated |
| Negative / boundary / permission gap | a behaviour tied to a `[P0-*]` oracle with no branch of that kind, or with the branch but no stamped case (TM-014) |
| Uncovered high-risk | a node whose oracle is `[P0-revenue]` and whose only linked cases are Draft or Manual |
| Map vs suite disagreement | a case stamped `Behavior:X` whose Title or Assertions describe a different outcome than X |

Rank a node's risk by its highest `oracle_refs` priority tag (`[P0-…]` > `[P1-…]` > `[P2-…]`),
read from the oracle and never stored in the map.

## 3. Report

Findings go to chat. A file is written only if the operator asks, under `reports/knowledge/`
(`.claude/rules/reports.md` §1, BL-audit cap). Each finding:

```json
{ "severity": "high | medium | low", "family": "structural | behavioural | data | coverage", "code": "TM-014 | JUDGE-<short>", "node_id": "…", "message": "…", "route": "update mode | /qa-test-data-model | /qa-review-oracles | author a case" }
```

Severity: an error-level TM code is `high`; a judgment finding on a `[P0-*]` node is `high`; the rest
are `medium` or `low`. Close with one line per route and the node ids it owns. Do not restate counts
the checker already prints.
