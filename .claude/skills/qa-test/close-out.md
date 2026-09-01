# Step 5 — the close-out: triage → reconcile → verdict → file → report → status → promote

Methodology for `/qa-test` Step 5. The command states the phase order and the gates; this file is the
detail. **5a before 5b before 5c is load-bearing:** the verdict is expressed in terms of a finding's
*provenance* (5a) and the reconciled AC/DoD state (5b), so neither can be skipped or reordered ahead of it.

FAST runs 5a → 5f and stops. `5g` promotes cases a FAST run never authored. `5b` still runs on FAST — the
AC/DoD reconciliation is what produces the verdict, and dropping it would leave `5c` deciding on nothing.

---

## 5a. Triage — correlate → validate evidence → classify → provenance → severity → dedup

Everything the run can surface a finding from is triaged **before** anything is filed: the Artifact-C
regression run's own FAILs, checklist-track agent-reported bugs, and correlated App-Insights signals.

### 0. Triage the Artifact-C run through `/qa-triage-results`, not from scratch

The change-scoped run already has a `RUN_ID` with evidence bundles (`traces/*-FAIL-trace.json`, screenshots,
HAR). Invoke **`/qa-triage-results <RUN_ID> --fix`** instead of re-deriving the taxonomy ad hoc. That
command owns: deterministic collection (`triage:collect`), per-batch classification via
`ci/agents/regression-triage-agent.md`, live verification of HIGH-confidence `REAL_BUG`s, auto-application
of confirmed test-case fixes via `/qa-review-tests --fix` for the *existing* Artifact-C suites (Step 3's own
`--fix` pass only covers the newly-authored rows), and drafting confirmed bugs to `reports/bugs/`.

Two side effects `/qa-test` gets nowhere else: the cross-run **flakiness history**
(`triage:history` → `reports/regression/history.json`) and the fingerprint dedup store.

Fold its `triage-report.md` tables (confirmed bugs / test-case fixes / dismissed) directly into this
phase's finding list — **do not reclassify a finding it already resolved.** It never files a tracker ticket;
5d owns filing. Skip with a one-line note if Artifact C was skipped (no RUN_ID).

### 1. Correlate App Insights logs for the test window

Catches backend errors the UI test *triggered but didn't surface*: 5xx, failed dependencies, exceptions,
GraphQL `errors[]` inside a 200. This reuses `/qa-monitoring`'s machinery scoped to the window — **query →
dedup → triage**, with no separate live-repro, because the agents were already live.

Pre-flight App Insights access (Azure MCP `applicationinsights`, or `APPINSIGHTS_APP_ID_*` +
`APPINSIGHTS_API_KEY_*`); if neither is configured → **skip with a one-line note**, never block the verdict.
Query each affected layer with the `ci/monitoring/queries/` probes scoped to the window (+2 min buffer).
Dedup **labels** novelty against `reports/monitoring/.seen-fingerprints.json` (read-only). Classification
goes to `qa-backend-expert` via `ci/agents/monitor-triage-agent.md` → `REAL_BUG | KNOWN_ISSUE | NOISE |
CONFIG_GATED | THIRD_PARTY | TRANSIENT` + severity + confidence (ambiguous → NEEDS_REVIEW).

A HIGH-confidence `REAL_BUG` enters the finding list with evidence attached (signature + portal link); it
gets **no separate `BUG-AI-*` draft** — 5d's `/qa-bug` owns it.

### 2. Validate evidence quality

| Check | Action if missing |
|---|---|
| Agent claims PASS but no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Get evidence before it enters the finding list |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| A bug candidate has no reproducible evidence bundle | Get it, or carry in as LOW-confidence — never file unevidenced at 5d |
| `BL-*` listed in the prompt but not mentioned in results | Flag as untested — request verification |
| HIGH-confidence `REAL_BUG` in the window not reflected in agent results | Surface it — the UI test missed a backend error; carry into the finding list |

### 3. Classify findings that have no RUN_ID

Item 0 already classified the regression run's own FAILs. The rest — failed ACs (confirmed at 5b, folded
back here), checklist-track agent-reported bugs, App-Insights signals — use the same taxonomy
`/qa-triage-results` uses: real product bug vs test-defect (`TEST_STEPS_DEFECT` / `ASSERTION_DEFECT` /
`TEST_DATA_DEFECT` / `STALE_TEST`) vs `BY_DESIGN` / `ENV` / `KNOWN_ISSUE`.

Ambiguous → **real bug / LOW**, never relabelled as a test-defect. A test-defect routes to
`/qa-review-tests <suite> --fix`, not a ticket.

### 4. Provenance — per real bug

| Provenance | Means | Effect |
|---|---|---|
| **PRE-EXISTING** | dedup match, or reproduces pre-change | link, don't re-file, don't fail this ticket |
| **IN-SCOPE** | in what this ticket changed | fails this ticket; files as a Sub-task at 5d |
| **OUT-OF-SCOPE incidental** | unrelated defect found opportunistically | files as its own standalone ticket + a *related* link; doesn't fail this ticket unless a P0 revenue-flow break |

Unclear → treat **IN-SCOPE** (fail-safe).

### 5. Severity + priority

Per `.claude/skills/qa-defect/` (P0…P3). This is the call 5d's severity floor reads, and it is graded here —
never re-graded at 5d to move a finding across the line.

### 6. Dedup — every finding, regardless of source

Glob `reports/bugs/**` + all `reports/tickets/Sprint*/`, and search the tracker (per
`feedback_duplicate_check_across_all_sprints`). A match = PRE-EXISTING. A `/qa-triage-results`-confirmed bug
still needs this tracker-wide check before 5d can file it.

**Output:** every finding carrying `class` + `provenance` + `severity` + `duplicate-of?`.

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
  against what actually happened this run: "tests pass" → the Artifact-C pass rate; "no regressions" → the
  change-scoped regression result; "accessibility checked" → a `ui-ux-expert` finding if one was dispatched.
  Mark each **MET / NOT-MET / N-A**.
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

Note that filing and failing are separate decisions: a `Medium` files (5d) without failing the ticket.

---

## 5d. File bugs — with confirmation, and a severity floor

File the confirmed, non-duplicate real bugs from 5a, each carrying a `## Fix Routing` hint. **Ask before
filing.**

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

1. Its **`reports/bugs/open/` draft stays** (5a's `--fix` pass wrote it, or write it here). That is the
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

A bug already drafted by 5a's `/qa-triage-results --fix` pass is filed here the same way — pass its draft as
the basis, don't re-investigate. A test-defect still routes to `/qa-review-tests <suite> --fix`, never to the
tracker.

**Gate (inline self-check):** every IN-SCOPE bug **at or above the floor** is a Sub-task; every PRE-EXISTING
match is linked, not re-filed; **every below-floor `Low` has a draft AND a line in the 5e comment** (a `Low`
in neither place was dropped, the one outcome the floor must not produce); no real bug was downgraded to a
test-defect; and **no severity moved between 5a and here**.

---

## 5e. Report

### 1. Feed and independently ratify the Feature Release Gate

The 5c verdict is the primary input to the **Feature Release Gate**
(`.claude/skills/qa-metrics/quality-gates.md` §1a), owned by `qa-lead-orchestrator`. **`/qa-test` does not
decide release.**

A PASS/PASS-WITH-NOTES run **feeds a GO** only if the team-level criteria also hold: 0 open P0, P1s
deferred-with-acceptance, change-scoped regression ≥95% (this phase's own `regression.pass_rate`), NFRs
clean, smoke PASS. A FAIL/BLOCKED is an automatic NO-GO. If the Artifact-C run was deferred or skipped, say
so — the gate cannot be evaluated on a null pass rate.

**Independent verification (FULL):** a fresh `qa-lead` verifier re-evaluates §1a from the raw inputs — the
5c verdict, the `reports/bugs/` open-P0/P1 ledger (now current, since 5d already filed), the regression pass
rate via
`npx tsx scripts/regression/compute-metrics.ts --gate feature --run-id <regression.run_id> --p0-bugs N --p1-bugs N`
(`--run-id` **required**; `--suites <ids>` is the fallback), and the smoke result — and ratifies or
**downgrades**. Recommendation only; a human decides release.

### 2. Post the tracker comment (before the status transition — that is 5f)

Markdown, never wiki markup; outcome-first, evidence referenced not inlined
(`.claude/knowledge/execution/tracker-ops.md` §5a):

```
QA Complete — [X] cases, [Y] passed, [Z] failed.
AC review: [N] story ACs ([weak]/[ok]), [M] gap-ACs; AC↔impl: [satisfied]/[drift]/[contradicts]/[not-found]. AC coverage: [pct]%.
DoD: [met]/[total] ([pct]%), or "none stated".
Change-scoped regression: [suite IDs] — [pass rate] ([RUN_ID]).
Regression triage: [N] confirmed bugs, [M] test-case fixes applied, [K] dismissed.
App Insights (test window): [N] correlated — [confirmed/needs-review/none].
Business rules verified: [BL-* list]. Bugs: [list, with relationship — sub-task/linked/standalone — or None].
Not filed (below severity floor): [N] Low — [one line each + reports/bugs/open/<file>.md], or None.
Release gate: [GO/CONDITIONAL GO/NO-GO recommendation]. Decision: [verdict].
Evidence: reports/tickets/{SPRINT}/<ticket-key>/screenshots/
```

The `Not filed` line is **mandatory and says `None` when there are none** — an omitted line is
indistinguishable from a run that found no Low issues.

### 3. Persist `summary.json` and update the checklist

Write `reports/tickets/{SPRINT}/<ticket-key>/summary.json` per
[`.claude/templates/qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json): `path`, the
AC-analysis + `ac_dod_estimate` block, counts, the `regression` and `regression_triage` blocks, `bugs_filed`
with relationship + severity, `bugs_not_filed`, the `promotion` block for 5g, and the **`timing`** block.
Then **update `testing-checklist.md` in place with each item's verdict**, so the committed file is the
checklist that ran and not the one that was planned.

**`timing` is not bookkeeping.** The 40-minute window and the FAST/FULL split are both claims about cost,
and until a run records its own they stay unfalsifiable — the schema carried 78 keys and not one duration.
Record `started_at`/`finished_at`, per-step minutes, `agent_dispatches`, and the regression run's
**predicted vs actual** minutes. That last pair is what will let `npm run regression:recalibrate` eventually
be trusted: an order-of-magnitude gap is the ×18–×88 `estimatedMinutes` defect surfacing, and it belongs in
the report rather than being inferred months later.

### 4. Output the full chat report

This IS the report: verdict, reconciled AC/DoD table + percentages, checklist results, change-scoped
regression result + triage summary + **Scope Exclusions**, business rules verified, bugs found (with
provenance + relationship), below-floor findings, release-gate recommendation, and the screenshot folder
path.

---

## 5f. Change status — with confirmation, skip if the tracker MCP is unconfigured

Strictly **after** the report is posted.

| Outcome | Transition |
|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED |
| FAIL | `Need fixes` → REOPEN, with a comment listing failures + filed bug links |

On Jira both closing transitions require the in-testing status (the Step 4 move); if that was skipped, do
the in-testing hop first (discover live). On Azure Boards set `System.State` directly. **TESTED is the
terminal state this command may reach — never Done or Cancelled.**

### Close the loop

By default `/qa-test` verifies and reports; it never fixes — it states the next command and stops (pointers,
not auto-triggers). This close-out is the `feature-test` flow's; `verify-fix` already ended at its own
VERIFIED/REOPEN verdict, and `hotfix-verify` handed off before 1b.

- **PASS / PASS WITH NOTES** → ticket TESTED; hand to the Feature Release Gate. Done — 5g still runs
  (non-blocking) if new cases were authored.
- **FAIL → REOPEN** → `/qa-fix <ticket-key>` (autonomous G0–G7, never auto-merges) → human review + merge +
  deploy → `/qa-verify-fix <ticket-key>`. A too-complex/multi-repo bug (G0 BAIL) is handed to a human,
  resuming at `/qa-verify-fix`. Once the fix is deployed, a re-run of `/qa-test <ticket-key>` auto-routes the
  Bug to the `verify-fix` flow, since its status is now `fix-ready`.
- **BLOCKED** → resolve the blocker (env/data/dependency) and **re-run `/qa-test <ticket-key>`** from the
  top; no partial credit.

---

## 5g. Promote the new cases — FULL only, last, non-blocking

The verdict/report/status close-out (5a–5f) is already complete and delivered to the user before this phase
starts; a slow or REJECTed promotion never delays TESTED/REOPEN. The cases are in the suite as `Draft`,
grounded and promotable only now that Step 4 executed them live via the automated runner.

1. **Harvest:** `/qa-review-tests file <target-suite.csv> --verify --fix` — every assertion this run observed
   live is rewritten `{HYPOTHESIS}` / unconfirmed-`{SPEC}` → `{OBSERVED}`; a **refuted** behaviour surfaces
   as ENV-008, never `{OBSERVED}`.
2. **Resolve each remaining `{HYPOTHESIS}`** with the observed value; one that stayed genuinely unknown is
   reworded as a question and keeps its case at `Draft` — never invent a value.
3. **Re-derive eligibility** (the same G10 the promoter uses): 0 GRD-001 Blocker/High, 0 ENV-008, green
   `td:validate`, every assertion grounded, executed with evidence.
4. **Ask to promote, then flip in place — via the deterministic promoter, never by hand-editing the cell.**
   `npm run tc:promote -- <RUN_ID> --suite <ID> --stamp <ticket-key>` prints the per-case decision, then
   `tc:promote:apply` writes it (`.claude/rules/regression.md` §Post-Run Promotion; core
   `scripts/test-cases/promote-cases.ts`). It re-derives the same G10 as step 3 by linting each row **at its
   target status**, refuses a flaky or non-PASS case with a `PR-*` reason code, and edits only the changed
   fields — the hand path renormalised quoting and could promote on a PASS nobody could re-derive. It writes
   `Automated` only; a case verified via the **manual checklist** (no automated-runner verdict) is still
   `Reviewed`/`Manual` by hand. **Revert (remove) a non-promotable row** so the durable suite doesn't carry
   an ungrounded case that would keep running — **except** a case that failed on a real IN-SCOPE bug, which
   stays `Draft` with a documented reason (valid coverage flagging the open defect). The
   `Promoted: <ticket-key> (YYYY-MM-DD)` `References` stamp is applied by the promoter (appended; never
   clobbering a `Synced:`/`Audited:` stamp). Then `npm run suites:sync && npm run suites:lint`; re-run
   `suites:review -- <target-suite.csv> --fail-on=High` (an append that introduced a new Blocker/Critical is
   reverted).
5. **Record the split** in `summary.json.promotion` (`automated`/`reviewed`/`blocked`/`reverted`).

**Gate (FULL, 1 round):** every `Automated`/`Reviewed` upgrade traces to a real artifact from this run;
every surviving `{HYPOTHESIS}` is resolved or reworded; `suites:lint` green. A fresh `qa-lead` verifier
**re-runs `suites:review`** on the target suite and, for a sample of upgraded assertions, **re-opens the
Step-4 evidence** grounding each `{OBSERVED}`. REJECT any `{OBSERVED}` with no traceable artifact, any
`{HYPOTHESIS}` cleared by an invented value, any case promoted while still carrying a Blocker/Critical →
revert the append (`git checkout` target CSV + manifest) → fix → re-verify once → STOP.

An ungrounded `{OBSERVED}` is worse than a `Draft` case: it puts a fabricated expectation into permanent
coverage. **The author never self-certifies this** — only `qa-lead-orchestrator` or the user promotes.

`/qa-test-lifecycle` Phase 6P remains the promoter for handoff, re-promotion, and non-`/qa-test` sources.
