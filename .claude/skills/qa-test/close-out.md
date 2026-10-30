# Step 5 — the close-out SPINE: reconcile → verdict → release regression → file

> **Before posting any tracker comment, read `knowledge/execution/tracker-ops.md` §0 — the GOLDEN RULE.**

Methodology for `/qa-test` Step 5. The command states the phase order and the gates; this file and its
three siblings are the detail. **5-triage before 5-verdict is load-bearing:** the verdict is expressed in
terms of a finding's *provenance* ([`triage.md`](triage.md)) and the AC/DoD state `5-verdict` reconciles before
it decides (5-verdict.1 below), so neither can be skipped or reordered ahead of it.

FAST runs 5-triage → 5-verdict → 5-file → 5-report → **5-status**, and stops there; a FAST ticket that needs documentation gets `/qa-docs <ticket-key>` by hand. **5-docs** and `5-docs-map` are FULL-only — 5-docs calls `/qa-docs`, and `5-docs-map` writes back what `1c` reported, a step FAST does not run. (**`5r` and `5g` were removed 2026-09-10**; **`5b` was FOLDED INTO `5-verdict` 2026-09-16** — its label is retired, never reused, and the reconciliation itself survives as `5-verdict.1`: [`decisions`](../../../docs/decisions/qa-test-evolution.md) §Folding 5b into 5-verdict.) The reconciliation runs on **both** paths — it is
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
| **this file** | **5-verdict** (a pointer: the rules live in the vc-test plugin's `verdict-rules.md`) · **5-file** — filing | deciding what the run concluded |
| [`reporting.md`](reporting.md) | **5-report · 5-status · 5-docs · 5-docs-map** — release gate, comment, `summary.json`, checklist, transition, docs, the domain-map write-back | delivering it |

---


## 5-verdict. Reconcile AC & DoD, then decide the verdict

One phase, two moves: **5-verdict.1** closes the AC/DoD question against what the run observed, **5-verdict.2** reads the
verdict off it. They were `5b` and `5c` until 2026-09-16 — two phases with a hard-STOP verifier dispatch
between them. The dispatch is gone and the reconciliation is not; the letters went with the relabel below.

### 5-verdict.1 Compare AC & DoD vs implementation

*The rules live in the vc-test plugin: `plugins/vc-test/skills/qa-test-strategy/verdict-rules.md` §Reconcile — AC & DoD vs implementation*

### 5-verdict.2 Decide verdict

*The rules live in the vc-test plugin: `plugins/vc-test/skills/qa-test-strategy/verdict-rules.md` §Decide the verdict*

---

---

## 5-file. File bugs — with confirmation, and a severity floor

File the confirmed, non-duplicate real bugs from 5-triage, each carrying a `## Fix Routing` hint. **Ask before
filing.** Each filed bug carries `found-by-agent` + `found-in-testing` — or `reported-by-human` for a finding the
user brought in (`.claude/knowledge/execution/tracker-ops.md` §Labels on bugs Claude files). Pass
`found-by:agent-testing <ticket-key>` in every `/vc-fix:qa-bug` call below, except for a finding the user brought in —
without it `qa-bug` records the bug as a human's.

**`--iterate`: 5-file runs PER ROUND, for new findings only.** A round that files nothing cannot fix
anything — `/vc-fix:qa-fix` needs a filed ticket — so skipping 5-file in round 2 dead-ends the loop at its own
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

1. Its **`{RUN_DIR}/bugs/low/` draft stays** (a below-floor finding is `Low`/P3 by definition, so `low/` is always its folder — `.claude/rules/reports.md` §1a) (5-triage's `--fix` pass wrote it, or write it here). That is the
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
| **IN-SCOPE** | **Sub-task of `<ticket-key>`** — `/vc-fix:qa-bug … sub-task-of:<ticket-key>` |
| **PRE-EXISTING** | **Link only, no new ticket** — `/vc-fix:qa-bug … link-only:<existing-bug-key>`, linked to `<ticket-key>` |
| **OUT-OF-SCOPE incidental** | Its **own standalone ticket** + a *related* link back to `<ticket-key>` |
| **`BL-A11Y-*` on a functional / feature / E2E ticket** | Its **own standalone ticket** + a *related* link — the same shape as an OUT-OF-SCOPE incidental, and for the same reason. **Never a Sub-task**: a Sub-task asserts the parent caused it, and an inherited contrast or naming defect was not caused by this story. It keeps its **real severity** (never downgraded to look non-blocking) and does **not** fail 5-verdict ([`triage.md`](triage.md) §7a) |

**Every bug reaches `/vc-fix:qa-bug` already investigated.** 5-triage's two `/qa-triage-results` passes ran each
confirmed bug through `vc-fix:qa-investigate` (its Phase 4). So the chain is always *triage → investigate →
`qa-bug`*, and 5-file is its last link:
- **C1 bug** — already drafted by the `--fix` pass. Pass its draft as the basis.
- **Checklist / exploratory / visual bug** — returned by the `ticket` pass with its package. Call `/vc-fix:qa-bug`
  with that package, per [`routing-and-fix.md`](../../../plugins/vc-test/skills/qa-triage-results/routing-and-fix.md) §The `/qa-bug` brief.

Neither one is re-investigated. A bug that triage left `needs-review` is not filed. A test-defect still routes to
`/qa-review-tests <suite> --fix`, never to the tracker.

**Gate (inline self-check):** every IN-SCOPE bug **at or above the floor** is a Sub-task; every PRE-EXISTING
match is linked, not re-filed; **every below-floor `Low` has a draft AND a line in the 5-report comment** (a `Low`
in neither place was dropped, the one outcome the floor must not produce); no real bug was downgraded to a
test-defect; and **no severity moved between 5-triage and here**.

---
