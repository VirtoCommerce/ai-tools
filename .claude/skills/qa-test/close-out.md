# Step 5 — the close-out SPINE: reconcile → verdict → release regression → file

> **Before posting any tracker comment, read `.claude/knowledge/execution/tracker-ops.md` §0 — the GOLDEN RULE.**

Methodology for `/qa-test` Step 5. The command states the phase order and the gates; this file and its
three siblings are the detail. **5-triage before 5-verdict is load-bearing:** the verdict is expressed in
terms of a finding's *provenance* ([`triage.md`](triage.md)) and the AC/DoD state `5-verdict` reconciles before
it decides (5-verdict.1 below), so neither can be skipped or reordered ahead of it.

FAST runs 5-triage → 5-verdict → 5-file → 5-report → 5-status → **5-docs**, and stops there. Only `5-docs-map` is FULL-only — it writes back what `1c` reported, and `1c` is a step FAST does not run. (**`5r` and `5g` were removed 2026-09-10**; **`5b` was FOLDED INTO `5-verdict` 2026-09-16** — its label is retired, never reused, and the reconciliation itself survives as `5-verdict.1`: [`decisions`](../../../docs/decisions/qa-test-evolution.md) §Folding 5b into 5-verdict.) The reconciliation runs on **both** paths — it is
what produces the verdict, and dropping it would leave `5-verdict` deciding on nothing.

**On an `--iterate` run these phases do not all fire once.** Per round: **5-triage–5-file**, plus a round-delta
comment, `summary.json`, and an appended checklist section. **Once, at loop exit:** 5-report in full → 5-status → 5-docs → 5-docs-map. So a `--iterate` run posts ONE QA-Complete comment and makes ONE transition, whatever the round count.
The per-round assignment table — and the reason for each row — is owned by [`modes.md`](modes.md) §5-loop and is
not restated here. **The phases whose cadence the loop changes** carry a one-line `--iterate` clause
pointing at it — 5-triage, 5-file, 5-report.1, 5-report.2, 5-report.3, 5-report.4, 5-status and 5-docs. 5-verdict and 5-report.5 run once per round with
no change, so they carry none. Without the flag, read this file
straight through.

---

## The close-out, in four files

This file is the **spine**: the phase order above, plus the phase that produces the verdict itself
(5-verdict — reconcile, then decide) and the one that acts on it (5-file). The rest is one file per job, so a reader opens what the
step they are in actually needs rather than 680 lines of everything:

| File | Owns | Read it when |
|---|---|---|
| [`triage.md`](triage.md) | **5-triage** — correlate, validate evidence, classify, provenance, severity, dedup | turning raw results into findings |
| **this file** | **5-verdict · 5-file** — reconcile, verdict, filing | deciding what the run concluded |
| [`reporting.md`](reporting.md) | **5-report · 5-status · 5-docs · 5-docs-map** — release gate, comment, `summary.json`, checklist, transition, docs, the domain-map write-back | delivering it |

---


## 5-verdict. Reconcile AC & DoD, then decide the verdict

One phase, two moves: **5-verdict.1** closes the AC/DoD question against what the run observed, **5-verdict.2** reads the
verdict off it. They were `5b` and `5c` until 2026-09-16 — two phases with a hard-STOP verifier dispatch
between them. The dispatch is gone and the reconciliation is not; the letters went with the relabel below.

### 5-verdict.1 Compare AC & DoD vs implementation

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
  (`.claude/skills/qa-metrics/quality-metrics-catalog.md`) — not invented ad hoc, and not attributed to a
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
criteria were not ([`decisions`](../../../docs/decisions/qa-test-evolution.md) §Folding 5b into 5-verdict).

### 5-verdict.2 Decide verdict

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
  ([`triage.md`](triage.md) §7a). It is **named** in the 5-report report and the checklist, so a PASS is never
  read as *"no accessibility problems here"*. **Carve-out:** where accessibility is what the ticket is
  *for* — an a11y/WCAG remediation ticket, ACs naming an accessibility outcome, a `/qa-accessibility` run —
  it blocks normally. The test is the ticket's own ACs, never the finding's severity.
- **A `vs. DESIGN` `DRIFT`/`MISSING`.** Advisory; it appears in the 5-report report and
  `summary.json.visual.advisory[]` and **never moves this verdict.** A run whose only visual finding is
  spec drift is still a PASS.

---

---

## 5-file. File bugs — with confirmation, and a severity floor

File the confirmed, non-duplicate real bugs from 5-triage, each carrying a `## Fix Routing` hint. **Ask before
filing.**

**`--iterate`: 5-file runs PER ROUND, for new findings only.** A round that files nothing cannot fix
anything — `/qa-fix` needs a filed ticket — so skipping 5-file in round 2 dead-ends the loop at its own
precondition. A **CARRIED** finding (5-triage item 4) files nothing and gets one comment on its existing
Sub-task; a carried bug that went green this round is commented and recorded, and deliberately **not**
transitioned (the fix is an unmerged prerelease). The floor is unchanged per round: 5-file still does not
file a `Low` in round 2, which is why below-floor findings stay outside the loop.

### The floor: `Critical` / `High` / `Medium` only

| Severity | = | Tracker item |
|---|---|---|
| `Critical` | P0 | **File** |
| `High` | P1 | **File** |
| `Medium` | P2 | **File** |
| `Low` | P3 | **Do not file** — record it |

It applies to **both** filing shapes: an IN-SCOPE `Low` gets no Sub-task, and an OUT-OF-SCOPE incidental
`Low` gets no standalone ticket. Severity is 5-triage item 5's call, already settled at the 5-verdict gate — 5-file applies
the floor, it does not re-grade to reach it. Nudging a P2 down to P3 to avoid filing, or a P3 up to P2 to
force it, is the one move this rule must not cause.

### A `Low` is dropped from the TRACKER, never from the RUN

Silence is the failure mode this pipeline is built against, so a below-floor finding lands in three places:

1. Its **`reports/bugs/open/low/` draft stays** (a below-floor finding is `Low`/P3 by definition, so `low/` is always its folder — `.claude/rules/reports.md` §1a) (5-triage's `--fix` pass wrote it, or write it here). That is the
   durable record, and what a human promotes from later if the finding recurs or the grade is disputed.
2. **5-report's tracker comment names it** — count plus one line each, under `Not filed (below severity floor)`,
   with the draft path. A reviewer who wants it filed can say so; a reviewer who never sees it cannot.
3. On the **FAST path** the Artifact-B checklist row carries it too, since the checklist is that run's only
   durable record.

Escalate above the floor only on an explicit human instruction in this run ("file the Low ones too") —
never on the agent's own judgment, and never in bulk.

### Relationship by provenance

Mechanics: `.claude/knowledge/execution/tracker-ops.md` §5b.

| Provenance | Relationship |
|---|---|
| **IN-SCOPE** | **Sub-task of `<ticket-key>`** — `/qa-bug … sub-task-of:<ticket-key>` |
| **PRE-EXISTING** | **Link only, no new ticket** — `/qa-bug … link-only:<existing-bug-key>`, linked to `<ticket-key>` |
| **OUT-OF-SCOPE incidental** | Its **own standalone ticket** + a *related* link back to `<ticket-key>` |
| **`BL-A11Y-*` on a functional / feature / E2E ticket** | Its **own standalone ticket** + a *related* link — the same shape as an OUT-OF-SCOPE incidental, and for the same reason. **Never a Sub-task**: a Sub-task asserts the parent caused it, and an inherited contrast or naming defect was not caused by this story. It keeps its **real severity** (never downgraded to look non-blocking) and does **not** fail 5-verdict ([`triage.md`](triage.md) §7a) |

A bug already drafted by 5-triage's `/qa-triage-results --fix` pass is filed here the same way — pass its draft as
the basis, don't re-investigate. A test-defect still routes to `/qa-review-tests <suite> --fix`, never to the
tracker.

**Gate (inline self-check):** every IN-SCOPE bug **at or above the floor** is a Sub-task; every PRE-EXISTING
match is linked, not re-filed; **every below-floor `Low` has a draft AND a line in the 5-report comment** (a `Low`
in neither place was dropped, the one outcome the floor must not produce); no real bug was downgraded to a
test-defect; and **no severity moved between 5-triage and here**.

---
