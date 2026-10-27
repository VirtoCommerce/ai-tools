# Verdict rules

The rules that turn a run's results into its verdict. They moved here from this repository's `/qa-test` close-out
(§5-verdict.1 and §5-verdict.2) and from the `/qa-test-fast` verdict step (the `verdict.md` shape), with the meaning
of today (spec B6): only outbound references changed.

Labels kept verbatim from this repository's `/qa-test`: `5-verdict.1` = §Reconcile, `5-verdict.2` = §Decide the verdict,
`5-triage` = the run's triage, `C1` = the ticket's regression (Artifact C1), `Step 4` = the run's execution step.

## Reconcile — AC & DoD vs implementation

`1d` compared each AC to the *diff* — a hypothesis. This phase closes it against what the agents observed
**live** (the authoritative AC↔implementation check) and adds the DoD confirmation the `1e` model deferred.

### Where the conditions come from, per path

This phase runs on **both** paths — it is what produces the verdict, so 5-verdict has nothing to decide without it.
But FAST builds neither a `1d` AC table nor a `1e` Test Model, so read every `1d`/`1e` reference below as:

- **FULL** — the `1d` AC table (story ACs + gap-ACs) and the `1e` Test Model's `DoD:` field.
- **FAST** — the atomic conditions taken straight from `1a`'s ticket ACs, which are the same conditions
  Artifact B's checklist was built from. The **executed checklist is the condition inventory**, and its
  per-item verdicts are the evidence. DoD comes from the ticket if it declares one, else `none stated` →
  `dod_pct: null`.

**Do not invent a Test Model table to reconcile against on FAST, and do not skip the reconciliation for want
of one** — either would silently degrade the AC-coverage percentage the Feature Release Gate consumes.

### The three moves

- **AC reconciliation** — for each condition in the inventory (working context, no `ac-analysis.md`):
  **SATISFIED live** (confirmed) · **DRIFT / CONTRADICTS confirmed live** (filing-grade; feeds 5-triage item 3 as
  an IN-SCOPE candidate and a 5-verdict FAIL — CONTRADICTS-live is highest priority, surface it explicitly) ·
  **NOT-FOUND** (no such behaviour observed → mark untested and flag) · **static suspicion cleared** (a `1d`
  DRIFT/NOT-FOUND observed working → resolved, the diff was stale). **A diff-only finding is never a verdict
  input until confirmed (or cleared) here.**
- **DoD confirmation** *(when `1e`'s `DoD:` field is populated)* — resolve each item flagged "confirm at 5-verdict"
  against what actually happened this run: "tests pass" → **C1's** pass rate; "accessibility checked" → a
  `ui-ux-expert` finding if one was dispatched. Mark each **MET / NOT-MET / N-A**.

  **"No regressions" is resolved from C1 and nothing else.** `/qa-test` runs no release-scoped sweep
  (`5r` removed 2026-09-10), so this DoD item is closed against the **ticket** regression C1 executed at
  Step 4 — and where the reviewer meant a release-wide sweep, it is marked **`not-assessed`** with that
  said out loud, never as a pass. Marking it satisfied on evidence nobody gathered is the failure this
  clause exists to prevent; the sweep is a deliberate `/qa-regression` run, and an IN-SCOPE finding from
  one amends the verdict through 5-verdict's existing
  table. Marking it MET at 5-verdict.1 would be asserting a result no run has produced.
- **Quantified estimate — compute, don't eyeball.** **AC-coverage %** =
  `conditions_with_evidence / conditions_total`; **DoD-completion %** = `dod_met / dod_total` (when a DoD
  exists). Note what the tooling does *not* do: `scripts/regression/compute-metrics.ts` (the `qa-metrics`
  deterministic core) **does not expose an AC/DoD-shaped metric** — it aggregates regression run entries,
  not per-condition or per-checklist-item counts. So this ratio is computed **inline** from the condition
  inventory named above, in the same style `qa-metrics`' catalog uses for its other percentages
  (this repository's `qa-metrics` skill, `quality-metrics-catalog.md`) — not invented ad hoc, and not attributed to a
  script that cannot produce it.

**Gate (inline self-check, both paths — before 5-verdict.2 decides).** Every AC condition reconciled; every DoD
item resolved; both percentages computed rather than asserted; and 5-triage's finding list sound — every finding
classified, provenanced, severity-graded, deduped.

**Self-check against the EVIDENCE, not against a summary of it.** Re-derive the table and both percentages
from the Step-4 artifacts themselves, and run `npm run verify:gate -- --gate 5-verdict --run-id <RUN_ID>` for the
deterministic half (it confirms the C1 pass rate against `compute-metrics.ts` and prints what a script
cannot settle). **Fix before deciding**, never after: a mislabeled condition, a DoD item resolved without
evidence, an unsupported percentage, a **CARRIED bug relabelled PRE-EXISTING** (it would silently stop
failing the ticket that caused it), a real bug mislabeled a test-defect, or an in-scope P0/P1 under-graded.
These were the fresh-`qa-lead` verifier's REJECT criteria; the dispatch was removed 2026-09-16 and the
criteria were not (`docs/decisions/qa-test-evolution.md` §Folding 5b into 5-verdict, in this repository).

## Decide the verdict

| Decision | Criteria |
|---|---|
| **PASS** | Every atomic condition carries PASS evidence, all reconciled SATISFIED-live (5-verdict.1), all DoD items MET/N-A, all `BL-*` verified, **no IN-SCOPE P0/P1 bug** (5-triage), no correlated HIGH-confidence `REAL_BUG` in the window |
| **PASS WITH NOTES** | All conditions met & reconciled; only minor P2/P3 or **OUT-OF-SCOPE incidental** bugs tracked separately; only NEEDS_REVIEW/NOISE/KNOWN_ISSUE in the log window |
| **FAIL** | Any AC not met, any AC confirmed DRIFT/CONTRADICTS live, any DoD item NOT-MET, any `BL-*` violated, an **IN-SCOPE P0/P1 bug**, or a HIGH-confidence `REAL_BUG` correlated to the window. *A PRE-EXISTING / OUT-OF-SCOPE incidental bug does not fail this ticket — except an out-of-scope **P0 revenue-flow break**, surfaced for a human call.* |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

The verdict follows directly from 5-triage's triage output + 5-verdict.1's reconciliation and percentages — **no new
judgment is introduced here.**

**5-verdict.2 RECORDS the verdict; 5-report PUBLISHES it, and they stay two moments.** The gap was opened so an
IN-SCOPE finding arriving after 5-verdict could amend a verdict nobody had read yet — no comment to correct, no
transition to reverse. `5r` was its first consumer and is gone, but the gap costs nothing and still pays:
**5-file files bugs between them**, and any late finding — a filing that reveals a duplicate, a `5-file` bug whose
reproduction contradicts a PASS row — amends a recorded verdict instead of retracting a published one.

Note that filing and failing are separate decisions: a `Medium` files (5-file) without failing the ticket.

**The visual axis reaches this table through `BL-UI-*` only.** *"all `BL-*` verified"* and *"an IN-SCOPE
P0/P1 bug"* carry `BL-UI-006/007` — a clipped, overlapping or unreachable control is functional breakage of
the surface the story shipped, so it fails the ticket by the rules already here and needs no new row.

**Two visual classes are deliberately NOT in this table:**

- **`BL-A11Y-*` on a functional / feature / E2E ticket.** Accessibility is a cross-cutting property of a
  surface, not an acceptance criterion of the story that touched it — and the finding is usually
  pre-existing on the component, inherited by whichever story next edits that file. It is filed as its
  **own standalone ticket** at its **real severity** and **does not fail this verdict**
  (`triage.md` §7a of this repository's `/qa-test` skill). It is **named** in the 5-report report and the checklist, so a PASS is never
  read as *"no accessibility problems here"*. **Carve-out:** where accessibility is what the ticket is
  *for* — an a11y/WCAG remediation ticket, ACs naming an accessibility outcome, a `/qa-accessibility` run —
  it blocks normally. The test is the ticket's own ACs, never the finding's severity.
- **A `vs. DESIGN` `DRIFT`/`MISSING`.** Advisory; it appears in the 5-report report and
  `summary.json.visual.advisory[]` and **never moves this verdict.** A run whose only visual finding is
  spec drift is still a PASS.

## Shape

- **`verdict.md`** — **≤60 lines, in this order, nothing else:**

```markdown
# <TICKET> — <VERDICT>
<one sentence: what was tested, on which build, and the deciding fact>

| AC | Result | Evidence |
|---|---|---|
| AC-1 <short> | PASS | screenshots/<file> |

## Bugs
- <severity> <title> — <the path qa-bug returned> (<tracker key | not filed>)

## Not tested, and why
- <item / charter item> — <reason>
- <node id> — candidate case (passed here, no suite case stamps it)

## Data
Created <n> AGENT-TEST- entities · removed <n> · settings restored and re-read: <list | none>

## Context used
Strategy <path · Round N> · Model <path | SKIP — no MODEL risk> · Checklist <path> · Domain map <state> · Mind map <path | SKIPPED: reason> · Exploratory <SBTM path | ran:false reason> · PRs <repo#n list>
```
