---
description: "Keep regression-suite cases true to the product and take them out of Draft. After a PR, ticket, module update, deploy diff or release — or for a suite or domain — it syncs stale cases (update, rewrite, remove), writes the missing ones, reviews and fixes them, verifies every new or changed case live, and gives a verdict; for a ticket it then promotes the ticket's Draft cases. `promote VCST-XXXX` promotes only. Not for testing a ticket (/qa-test) or running suites (/qa-regression)."
argument-hint: "PR <owner/repo>#N | VCST-XXXX | module <name> | diff | changelog <ver> | suite <ids> | domain <name> | promote VCST-XXXX [--run-id <RUN_ID|latest>]"
---

# /qa-test-lifecycle — keep the suites true, then promote

This command only routes. The work is in two skills; **read the skill's `SKILL.md` whole and follow it** —
read the file, do not invoke it through the Skill tool.

## Usage

```
/qa-test-lifecycle PR VirtoCommerce/vc-module-order#123   # what a PR changed → sync, gaps, review, live check, verdict
/qa-test-lifecycle VCST-1234                              # the same for a ticket's PRs, then promote its Draft cases
/qa-test-lifecycle module orders                          # after a module update
/qa-test-lifecycle diff                                   # what the deploy changed since the last diff run
/qa-test-lifecycle changelog 3.1054.0                     # a platform release
/qa-test-lifecycle suite 04c,06                           # these suites: gaps, review, live check (no change to sync)
/qa-test-lifecycle domain orders                          # every suite of a domain
/qa-test-lifecycle promote VCST-1234                      # promotion only (e.g. after /qa-test)
/qa-test-lifecycle promote VCST-1234 --run-id REG-2026-10-28-1915
```

## Route

| Input | Read and follow |
|---|---|
| `PR <owner/repo>#N`, `module <name>`, `diff`, `changelog <ver>`, `suite <ids>`, `domain <name>` | [`qa-suite-sync`](../skills/qa-suite-sync/SKILL.md) |
| `VCST-XXXX` | [`qa-suite-sync`](../skills/qa-suite-sync/SKILL.md), then [`qa-case-promotion`](../skills/qa-case-promotion/SKILL.md) for the same ticket (it stops by itself when the ticket has nothing in `Draft`) — skip promotion when the sync verdict is NEEDS FIXES or BLOCKED |
| `promote VCST-XXXX [--run-id <RUN_ID\|latest>]` | [`qa-case-promotion`](../skills/qa-case-promotion/SKILL.md) only |

## Rules

- **Every run does the whole job.** There are no flags that skip sync, generation, review or the live
  check; what needs a decision (removing, deprecating or rewriting a case, new cases, a bug) is asked once,
  as one list, inside the skill.
- **Any other argument or `--flag` ⇒ stop and print the Usage block.** The removed flags, so a habit or an
  old doc does not run something else silently: `--skip-sync`, `--skip-generate`, `--skip-data`,
  `--skip-verify`, `--no-auto-fix`, `--layer`, `--report-only`, `--ci` (no replacement — the run does the
  whole job), and `--promote-only` (→ `promote VCST-XXXX`).
- **A bare `PR #N` is not enough** — the PR's repo is part of the input (`qa-suite-sync` `scope.md`).
