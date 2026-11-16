# qa-suite-sync — Phase 5, verify on the stand

Supporting file for [`qa-suite-sync`](SKILL.md). Read it at Phase 5.

### Phase 5 — VERIFY (Live Environment Check)

**Runs when:** any new or changed case is in scope. A **target** is every case whose row this run wrote or
edited — appended, rewritten, synced, enriched, re-pointed. A target is checked by **executing it**, not by
walking part of it.

**Pre-flight:** re-run `/preflight lifecycle --domain <scope>` — a `health` row that is not OK (a WARN for lifecycle) ⇒ skip with warning.
Seed the approved data profiles of `DataProfile:`-stamped targets first (`models.md` §Phase 5).

#### 5a — The scoped run: execute every target, once, as one recorded run

```
/qa-regression <the targets' suite ids> --ids <every target id> --no-promote
```

on the env this session is bound to. **One run, one `RUN_ID`** — the run's per-case verdicts are G8's
evidence, and the same `RUN_ID` is what `qa-case-promotion` promotes from (SKILL.md, after step 10). A live check
that leaves only prose cannot be re-derived, and promotion is one-way in practice
([`regression-promotion.md`](../../knowledge/execution/regression-promotion.md)): the run is what makes
"verified live" a record rather than a claim, without executing the cases a second time just to promote.

- **`--ids` is the exact set** — no tier, no caps; a target is executed whole or comes back BLOCKED with its
  reason. `--no-promote`: this run is delegated, so `/qa-regression` Step 6.5 is skipped — promotion needs the
  harvest (5c) and an approval first, which are not that step's to do.
- **Author proofs** (`generate.md` 3c step 9) do not replace it: they are the author checking their own rows,
  with no recorded verdict. Every target runs here anyway.
- **One browser at a time**: the run's lanes are the regression lanes, so nothing else that drives a
  browser (an author proof, 5b) runs beside it. Shared windows (a store mode, an org setting) are opened
  and restored by the cases themselves, or the case is BLOCKED (`NEEDS_WINDOW`) — never FAIL.

**A FAIL is classified, not "fixed":**

| The run says | It means | Action |
|---|---|---|
| PASS | the case holds on this build | G8 evidence; promotable after 5c + approval |
| FAIL on a `{SPEC}`/`{DOC}`/`{BL}`/`Catches:` assertion | the product disagrees with a grounded expectation | **ENV-008, bug candidate** — keep it red, `bugCandidates[]` (below). Never rewrite the assertion to pass |
| FAIL on a `{HYPOTHESIS}` assertion | the guess was wrong | rewrite to the observed behaviour (recorded) or drop it — step 7 |
| FAIL from the case's mechanics (a step that cannot execute, a selector, a dead `@td()`) | a case defect | fix in step 7 |
| BLOCKED | precondition or window not met | environment finding, not a case defect; re-run when it is met |

**The run is the last thing that may change a target's behaviour.** A case whose Steps, Preconditions or
assertion *text* changes after the run (a step-7 fix, a `{HYPOTHESIS}` rewrite) is no longer what the run
executed: it goes back into step 7's re-run, a new scoped run over **those ids only**, with its own
`RUN_ID`. Tag-only edits (5c) do not invalidate the run. `tc:promote` cannot tell the two apart — its
`PR-014` (CSV newer than the run) is file-level and only a warning by default — so this ordering rule is
what keeps the evidence honest; **record per target which `RUN_ID` last executed it.**

#### 5b — The residual live check: what executing a case cannot see

Dispatch `qa-testing-expert` (`playwright-firefox`, fallback `playwright-edge`) **after** 5a, only for:
1. **Staleness spot-checks** (change-driven only) — Phase 2 reclassifications of cases this run did NOT
   change: does the element / page / flow they name still exist?
2. **Label drift on existing cases** the change's pages show (CHANGED: element renamed or moved).
3. **Page reachability + console baseline** on each unique URL in scope (max 20 pages) — JS errors and
   failed requests that no case asserts.

Its caps (`maxPages`, `totalBudget`) bound one round; an item it does not reach is `UNCHECKED`, listed by ID
in the report. Nothing to check ⇒ skip 5b and say so. 5b never stands in for 5a: a target is verified only by
the run.

#### 5c — Harvest: turn what the run observed into grounded tags

A case PASSES only when every one of its assertions held, so a PASS grounds them all. Re-dispatch
`test-management-specialist` (the run's one CSV writer, `briefs.md` `harvest`) with the `RUN_ID` and the
per-case verdicts: in each PASSED target, every `{HYPOTHESIS}` / unconfirmed-`{SPEC}` assertion becomes
`{OBSERVED} (<env> <date>, <RUN_ID>)` through the byte-preserving cell editor, then 4a re-lints the suite
(clears GRD-001, so promotion's `PR-007` will not hold it). A FAILED or BLOCKED target is not harvested; a
refuted assertion is ENV-008 — never `{OBSERVED}`. This edits tags only, so the run stays valid (5a).
**Do not use `/qa-review-tests --verify` for this:** it walks the cases live a second time, which is the
duplicate execution 5a removes. `qa-case-promotion` step 1 then finds nothing left to harvest and
re-derives G10 instead of performing it.

**5b result classification:**

| Finding | Severity | Action |
|---|---|---|
| VERIFIED | — | Environment-compatible |
| CHANGED | Critical | Element renamed/moved → label fix (step 7) |
| BROKEN | Blocker | Page error or flow blocked → investigate |
| BLOCKED | High | Precondition can't be met → may be env issue |

Screenshots captured for every CHANGED/BROKEN/BLOCKED finding and every FAIL of 5a.

**Filing a bug** (SKILL.md step 8). No subagent and no run files anything. You (the orchestrator) collect
`bugCandidates[]` — 5a's ENV-008 FAILs and the Phase 2 contradictions of a `DECLARED` rule
(`blProposals.stale[]`) — put them to the user as one list, and file each confirmed one only through
`/vc-fix:qa-bug`, with the found-by labels of `.claude/rules/reports.md` §0b. Then run 4c (`review.md`):
the bug key each filing returned is what it writes into `suspect_reason`. Declined candidates are listed in the report.

---
