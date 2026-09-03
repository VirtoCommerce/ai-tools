# Step 5 — the close-out SPINE: reconcile → verdict → release regression → file

Methodology for `/qa-test` Step 5. The command states the phase order and the gates; this file and its
three siblings are the detail. **5a before 5b before 5c is load-bearing:** the verdict is expressed in
terms of a finding's *provenance* ([`triage.md`](triage.md)) and the reconciled AC/DoD state (5b below),
so neither can be skipped or reordered ahead of it.

FAST runs 5a → 5b → 5c → **5r** → 5d → 5e → 5f → **5h**, and stops there. Only `5g` is FULL-only, because it promotes cases a FAST run never authored. `5b` still runs on FAST — the
AC/DoD reconciliation is what produces the verdict, and dropping it would leave `5c` deciding on nothing.

**On an `--iterate` run these phases do not all fire once.** Per round: **5a–5d + 5r**, plus a round-delta
comment, `summary.json`, and an appended checklist section. **Once, at loop exit:** 5e in full → 5f → 5h →
5g. So a `--iterate` run posts ONE QA-Complete comment and makes ONE transition, whatever the round count.
The per-round assignment table — and the reason for each row — is owned by [`modes.md`](modes.md) §5k and is
not restated here. **The phases whose cadence the loop changes** carry a one-line `--iterate` clause
pointing at it — 5a, 5r, 5d, 5e.1, 5e.2, 5e.3, 5e.4, 5f, 5g and 5h. 5b, 5c and 5e.5 run once per round with
no change, so they carry none. Without the flag, read this file
straight through.

---

## The close-out, in four files

This file is the **spine**: the phase order above, plus the three phases that produce the verdict itself
(5b · 5c · 5r) and the one that acts on it (5d). The rest is one file per job, so a reader opens what the
step they are in actually needs rather than 680 lines of everything:

| File | Owns | Read it when |
|---|---|---|
| [`triage.md`](triage.md) | **5a** — correlate, validate evidence, classify, provenance, severity, dedup | turning raw results into findings |
| **this file** | **5b · 5c · 5r · 5d** — reconcile, verdict, the release regression, filing | deciding what the run concluded |
| [`reporting.md`](reporting.md) | **5e · 5f · 5h** — release gate, comment, `summary.json`, checklist, transition, docs | delivering it |
| [`promotion.md`](promotion.md) | **5g** — the `Draft → Automated` flip | a FULL run that authored cases |

---


## 5b. Compare AC & DoD vs implementation

`1d` compared each AC to the *diff* — a hypothesis. This phase closes it against what the agents observed
**live** (the authoritative AC↔implementation check) and adds the DoD confirmation the `1e` model deferred.

### Where the conditions come from, per path

This phase runs on **both** paths — it is what produces the verdict, so 5c has nothing to decide without it.
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
  **SATISFIED live** (confirmed) · **DRIFT / CONTRADICTS confirmed live** (filing-grade; feeds 5a item 3 as
  an IN-SCOPE candidate and a 5c FAIL — CONTRADICTS-live is highest priority, surface it explicitly) ·
  **NOT-FOUND** (no such behaviour observed → mark untested and flag) · **static suspicion cleared** (a `1d`
  DRIFT/NOT-FOUND observed working → resolved, the diff was stale). **A diff-only finding is never a verdict
  input until confirmed (or cleared) here.**
- **DoD confirmation** *(when `1e`'s `DoD:` field is populated)* — resolve each item flagged "confirm at 5b"
  against what actually happened this run: "tests pass" → **C1's** pass rate; "accessibility checked" → a
  `ui-ux-expert` finding if one was dispatched. Mark each **MET / NOT-MET / N-A**.

  **"No regressions" cannot be resolved here — C2 has not run yet.** It is the one DoD item this phase
  cannot close, because 5r launches the change-scoped sweep only once 5c records the verdict. Mark it
  **PENDING-5r** and resolve it there; an IN-SCOPE C2 finding then amends the verdict through 5c's existing
  table. Marking it MET at 5b would be asserting a result no run has produced.
- **Quantified estimate — compute, don't eyeball.** **AC-coverage %** =
  `conditions_with_evidence / conditions_total`; **DoD-completion %** = `dod_met / dod_total` (when a DoD
  exists). Note what the tooling does *not* do: `scripts/regression/compute-metrics.ts` (the `qa-metrics`
  deterministic core) **does not expose an AC/DoD-shaped metric** — it aggregates regression run entries,
  not per-condition or per-checklist-item counts. So this ratio is computed **inline** from the condition
  inventory named above, in the same style `qa-metrics`' catalog uses for its other percentages
  (`.claude/skills/qa-metrics/quality-metrics-catalog.md`) — not invented ad hoc, and not attributed to a
  script that cannot produce it.

**Gate (hard STOP before 5c).** Every AC condition reconciled; every DoD item resolved; both percentages
computed rather than asserted; and 5a's finding list sound — every finding classified, provenanced,
severity-graded, deduped.

**Independent verification (FULL, 1 round):** a fresh `qa-lead` verifier re-derives the AC/DoD table and both
percentages from the Step-4 evidence directly (not the doer's numbers), **re-classifies a sample of 5a's
findings** — confirming each IN-SCOPE call via a live repro on a **different browser lane**, re-running one
critical/revenue case, confirming the RUN_ID pass rate against `compute-metrics.ts`, and confirming the
dedup. REJECT on a mislabeled condition, a DoD item resolved without evidence, an unsupported percentage, a
**CARRIED bug relabelled PRE-EXISTING** (it would silently stop failing the ticket that caused it), a
real bug mislabeled a test-defect, or an in-scope P0/P1 under-graded → REASONS + FIX → re-verify once →
STOP. FAST: inline self-check, same computations.

---

## 5c. Decide verdict

| Decision | Criteria |
|---|---|
| **PASS** | Every atomic condition carries PASS evidence, all reconciled SATISFIED-live (5b), all DoD items MET/N-A, all `BL-*` verified, **no IN-SCOPE P0/P1 bug** (5a), no correlated HIGH-confidence `REAL_BUG` in the window |
| **PASS WITH NOTES** | All conditions met & reconciled; only minor P2/P3 or **OUT-OF-SCOPE incidental** bugs tracked separately; only NEEDS_REVIEW/NOISE/KNOWN_ISSUE in the log window |
| **FAIL** | Any AC not met, any AC confirmed DRIFT/CONTRADICTS live, any DoD item NOT-MET, any `BL-*` violated, an **IN-SCOPE P0/P1 bug**, or a HIGH-confidence `REAL_BUG` correlated to the window. *A PRE-EXISTING / OUT-OF-SCOPE incidental bug does not fail this ticket — except an out-of-scope **P0 revenue-flow break**, surfaced for a human call.* |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

The verdict follows directly from 5a's triage output + 5b's reconciliation and percentages — **no new
judgment is introduced here.**

**5c RECORDS the verdict; 5e PUBLISHES it.** Those were the same moment while the change-scoped sweep ran
at Step 4; they are two moments now that it runs at 5r, and the gap is what makes the split safe. A verdict
that has been recorded and not yet posted to the tracker can be **amended once** by an IN-SCOPE C2 finding
without anything being retracted — no comment to correct, no transition to reverse, no reader who saw the
old answer. Publishing here instead would trade a 40-minute latency win for a retraction risk, which is a
bad trade; deferring the publish costs nothing, because 5e was always the publisher.

Note that filing and failing are separate decisions: a `Medium` files (5d) without failing the ticket.

**The visual axis reaches this table through `BL-UI-*` only.** *"all `BL-*` verified"* and *"an IN-SCOPE
P0/P1 bug"* carry `BL-UI-006/007` — a clipped, overlapping or unreachable control is functional breakage of
the surface the story shipped, so it fails the ticket by the rules already here and needs no new row.

**Two visual classes are deliberately NOT in this table:**

- **`BL-A11Y-*` on a functional / feature / E2E ticket.** Accessibility is a cross-cutting property of a
  surface, not an acceptance criterion of the story that touched it — and the finding is usually
  pre-existing on the component, inherited by whichever story next edits that file. It is filed as its
  **own standalone ticket** at its **real severity** and **does not fail this verdict**
  ([`triage.md`](triage.md) §7a). It is **named** in the 5e report and the checklist, so a PASS is never
  read as *"no accessibility problems here"*. **Carve-out:** where accessibility is what the ticket is
  *for* — an a11y/WCAG remediation ticket, ACs naming an accessibility outcome, a `/qa-accessibility` run —
  it blocks normally. The test is the ticket's own ACs, never the finding's severity.
- **A `vs. DESIGN` `DRIFT`/`MISSING`.** Advisory; it appears in the 5e report and
  `summary.json.visual.advisory[]` and **never moves this verdict.** A run whose only visual finding is
  spec drift is still a PASS.

---

## 5r. Release regression (C2) — launched at the verdict, consumed at the gate

**Launch C2 the instant 5c is recorded, then do 5d and draft 5e while it runs.** Its scope was already
computed at Step 3 ([`authoring.md`](authoring.md) §Artifact C), so this is a dispatch, not a derivation:

```
/qa-regression <the Step-3 C2 suite ids> --cases critical
```

**Why it sits here and not at Step 4.** C2 answers *"did this change break anything else"* — a release
question, consumed by the Feature Release Gate at 5e.1 and by nothing before it. Every criterion in 5c's
table is a claim about **this ticket**: atomic conditions, reconciled ACs, DoD items, `BL-*`, and IN-SCOPE
bugs. A Critical case failing in a neighbouring suite is, by 5a item 4's own provenance rules, PRE-EXISTING
or OUT-OF-SCOPE — and the verdict table already says in as many words that neither fails this ticket. So
the pipeline was spending ~40 minutes, on the critical path to a verdict, to compute an input that the
verdict overwhelmingly discards. Now that time overlaps filing and report drafting instead.

**On return: triage, then one of exactly two outcomes.**

```
/qa-triage-results <C2 RUN_ID> --fix
```

| Outcome | Then |
|---|---|
| No IN-SCOPE finding (the common case) | The 5c verdict **stands**. C2's pass rate feeds 5e.1's ≥80% floor and its Scope Exclusions feed the report. Nothing about the ticket changes |
| An IN-SCOPE finding | **Amend the verdict once** — PASS → PASS WITH NOTES or FAIL by 5c's existing table, no new criteria — file it through 5d under the **same** severity floor, and 5e reports the amended verdict. One amendment round, then STOP: a second C2 to check the amendment is the loop `--iterate` exists for |

**Three rules keep this from becoming a second verdict step.**

- **The amendment uses 5c's table, not a new one.** 5r introduces no criteria; it introduces findings, which
  5a classifies and 5c's existing rows judge. Same discipline as *"no new judgment is introduced"* there.
- **Severity is still graded once**, at 5a, and never re-graded to move a finding across 5d's floor.
- **A skipped C2 is stated.** No suite selection, an unhealthy env, an operator who declined the run — each
  is recorded in `summary.json.regression` with its reason, and 5e.1 then ratifies the gate **without** a
  change-scoped pass rate and says so. An absent regression block reads as a clean sweep, which is §2's
  rule applied to the phase that now runs last.

**`--iterate`:** C2 runs per round, after that round's 5c, for the reason the round cap makes sharp — the
loop decides whether there IS another round from the verdict, so paying for a suite sweep before that
decision buys an answer to a question already settled ([`modes.md`](modes.md) §The two tracks of round N+1).

---

## 5d. File bugs — with confirmation, and a severity floor

File the confirmed, non-duplicate real bugs from 5a, each carrying a `## Fix Routing` hint. **Ask before
filing.**

**`--iterate`: 5d runs PER ROUND, for new findings only.** A round that files nothing cannot fix
anything — `/qa-fix` needs a filed ticket — so skipping 5d in round 2 dead-ends the loop at its own
precondition. A **CARRIED** finding (5a item 4) files nothing and gets one comment on its existing
Sub-task; a carried bug that went green this round is commented and recorded, and deliberately **not**
transitioned (the fix is an unmerged prerelease). The floor is unchanged per round: 5d still does not
file a `Low` in round 2, which is why below-floor findings stay outside the loop.

### The floor: `Critical` / `High` / `Medium` only

| Severity | = | Tracker item |
|---|---|---|
| `Critical` | P0 | **File** |
| `High` | P1 | **File** |
| `Medium` | P2 | **File** |
| `Low` | P3 | **Do not file** — record it |

It applies to **both** filing shapes: an IN-SCOPE `Low` gets no Sub-task, and an OUT-OF-SCOPE incidental
`Low` gets no standalone ticket. Severity is 5a item 5's call, already ratified by the 5b gate — 5d applies
the floor, it does not re-grade to reach it. Nudging a P2 down to P3 to avoid filing, or a P3 up to P2 to
force it, is the one move this rule must not cause.

### A `Low` is dropped from the TRACKER, never from the RUN

Silence is the failure mode this pipeline is built against, so a below-floor finding lands in three places:

1. Its **`reports/bugs/open/low/` draft stays** (a below-floor finding is `Low`/P3 by definition, so `low/` is always its folder — `.claude/rules/reports.md` §1a) (5a's `--fix` pass wrote it, or write it here). That is the
   durable record, and what a human promotes from later if the finding recurs or the grade is disputed.
2. **5e's tracker comment names it** — count plus one line each, under `Not filed (below severity floor)`,
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
| **`BL-A11Y-*` on a functional / feature / E2E ticket** | Its **own standalone ticket** + a *related* link — the same shape as an OUT-OF-SCOPE incidental, and for the same reason. **Never a Sub-task**: a Sub-task asserts the parent caused it, and an inherited contrast or naming defect was not caused by this story. It keeps its **real severity** (never downgraded to look non-blocking) and does **not** fail 5c ([`triage.md`](triage.md) §7a) |

A bug already drafted by 5a's `/qa-triage-results --fix` pass is filed here the same way — pass its draft as
the basis, don't re-investigate. A test-defect still routes to `/qa-review-tests <suite> --fix`, never to the
tracker.

**Gate (inline self-check):** every IN-SCOPE bug **at or above the floor** is a Sub-task; every PRE-EXISTING
match is linked, not re-filed; **every below-floor `Low` has a draft AND a line in the 5e comment** (a `Low`
in neither place was dropped, the one outcome the floor must not produce); no real bug was downgraded to a
test-defect; and **no severity moved between 5a and here**.

---
