# `/qa-test` — Test Flow

Sequence of the `/qa-test VCST-XXXX` pipeline: **Gather Context · Story · Test Model → Plan →
Write·Review·Provision → Execute → Report**. Step `1a` routes on **two axes** — first **FLOW** (which
pipeline), then, within `feature-test`, a **FAST or FULL** path so effort tracks risk; story analysis is a
sub-part of Step 1 (`1d`), not a step of its own, and there is **no separate exploratory step**. Canonical
spec: [`.claude/commands/qa-test.md`](../.claude/commands/qa-test.md); the routing matrix's single source of
truth is [`.claude/knowledge/execution/ticket-routing.md`](../.claude/knowledge/execution/ticket-routing.md).

**Flow routing (decided first, by type × status).** A fix-ready **Bug** (READY FOR TEST / TESTING) is a
*verification*, so `1a` runs `/qa-verify-fix` **inline** (RED→GREEN, VERIFIED/REOPEN) and the five-step
feature-test pipeline below does not run; a hotfix-status Bug points to `/qa-hotfix-check`; a Sub-task
inherits its parent's type; everything else (Story / Task / Technical task / Epic, and a not-yet-fixed Bug)
is a **`feature-test`** and runs the pipeline below.

**Fast vs full path (feature-test only).** The two paths differ sharply in cost.

- **FAST — a checklist, and nothing else.** A bug fix / copy-tweak / config / Technical task that is
  P2–P3, single-layer and single-domain runs `1a`+`1b` → the Artifact B checklist (written to the ticket
  folder) → one execution agent → `5a`–`5f`, then `5h`. It builds **no Test
  Model**, runs **no** archetype/UIP/`VC-*` sweeps, authors **no** test cases, and skips every independent
  verifier and `5h-map`. Two consequences are deliberate: a FAST run adds no regression
  coverage (use `/qa-test-lifecycle` for that), and the checklist is therefore the run's **only** durable
  record — which is why it is a committed file rather than terminal output.
- **FULL — the whole pipeline.** A new feature / Epic, a **Story** (unless it is narrow on all six
  `ticket-routing.md` §5b tokens *and* its surface purpose is already declared), anything P0–P1, cross-layer, ≥2 domains, a
  critical-revenue flow, or an unclear surface runs `1c ‖ 1d` concurrently, **the Test Model (required —
  it is what makes the ticket's context understandable and its documentation adequate)**, full authoring,
  the **two** hard-STOP independent verifiers (`3-cases`, 5b) plus 5e's non-blocking ratification; the `1r`
  reachability pass and — when the domain has no map — `1c-map`, both inside the `1c ‖ 1d` wave.

**The tie-break for an unresolvable token** lives in `.claude/knowledge/execution/ticket-routing.md` §5 and
is deliberately not repeated here.

**Execution is triggered by a CONDITION, not a step number (2026-09-10).** `4a` — the checklist pass that
owns the verdict — dispatches as soon as `3-exec` approves, i.e. as soon as **Artifact B exists and its
data resolves**. **Case authoring keeps running in the background** and nothing waits for it but `4c`.
Before this, the run's longest browser job waited behind Artifact A and the Step-3 verifier, **neither of
which it reads**, and a dead environment was discovered at the end of that wait rather than the start.

**Two things stay AHEAD of the checklist, deliberately.** The Test Model, because a checklist written
against an unnamed value chain produces per-screen checks that cannot notice the feature is broken; and
the **discovery lane**, whose fifth routed output is *conditions the ACs never named* — so `B` carries
items that were **seen** rather than inferred. `3x` is itself a live read of the product, on a scope-sized
30-60 minute box. Rationale: `docs/decisions/qa-test-evolution.md` §Cutting time-to-first-test.

**Regression here is ONE run, and it is the ticket's own exact set.** Step 4 runs **C1** —
`/qa-regression <target suites> --ids <new Draft ids + every Step-2a REPAIR id + every RE-BASE id>` —
**every case this run wrote or changed**. `--ids` IS
the selection; it reads no `Priority` and takes no `--cases`/`--also-ids`.

**There is no release-scoped sweep in this pipeline.** The change-scoped Critical sweep (C2) and its `5r`
step were **removed 2026-09-10** — they answered a *release* question at ~24 runner dispatches, and 5c's
criteria are every one of them a claim about *this ticket*. Cutting a release means running
`/qa-regression … --cases critical` deliberately. Consequence, stated: 5e's release gate ratifies its
change-scoped-regression criterion as **`not-assessed`**, never as a pass, and **never by substituting
C1's number**. Rationale: `docs/decisions/qa-test-evolution.md` §Removing 5r and 5g.

### Diagram 1 — the `/qa-test` run (Steps 1–5)

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'ui-monospace, SFMono-Regular, Menlo, monospace','background':'#eef4f6','primaryColor':'#0d7d8a','primaryBorderColor':'#0a5f6a','primaryTextColor':'#ffffff','lineColor':'#5b6b7a','textColor':'#2b3a45','actorBkg':'#0d7d8a','actorBorder':'#0a5f6a','actorTextColor':'#ffffff','actorLineColor':'#a9c4c8','signalColor':'#54687a','signalTextColor':'#2b3a45','noteBkgColor':'#d3e8ea','noteBorderColor':'#0d7d8a','noteTextColor':'#0e2a2e','sequenceNumberColor':'#ffffff','labelBoxBkgColor':'#e2ecef','labelBoxBorderColor':'#9fb6bd','labelTextColor':'#2b3a45','loopTextColor':'#0a5f6a','activationBkgColor':'#bfe0e3','activationBorderColor':'#0d7d8a'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant Orch as /qa-test
    participant V as qa-lead (verifier)
    participant TR as Tracker
    participant BA1 as ba-system-analyzer
    participant BA2 as ba-story-writer
    participant TMS as test-mgmt-specialist
    participant RT as /qa-review-tests
    participant TDE as test-data-engineer
    participant EX as Execution agents
    participant REG as /qa-regression
    participant TRG as /qa-triage-results
    participant AI as App Insights

    User->>Orch: /qa-test VCST-XXXX
    note over Orch,V: FULL path only: 2 hard-STOP GATES — Step 3, Step 5b (fresh qa-lead, re-derives from source). 5e is a third, NON-blocking dispatch. 1 round: REJECT to reason+fix, re-verify once, then STOP. Other steps + the whole FAST path self-check inline

    note over Orch,BA1: Step 1 · sub-parts 1a-1e (each consumes the prior)
    note over Orch: 1a · Fetch, classify TYPE×STATUS, ROUTE flow then fast/full
    Orch->>TR: Fetch ticket (type, STATUS, priority, ACs, PR diff) + COMMENTS + ATTACHMENTS (both paths); parent EPIC siblings = FULL only
    Orch->>Orch: Route FLOW per ticket-routing.md (fix-ready Bug → /qa-verify-fix inline; hotfix → /qa-hotfix-check; else feature-test), then TYPE + PATH (fast = P2/P3 single-layer bug/tweak/tech-task; else full)
    note over Orch: 1b · Pre-flight, resolve SPRINT, dedup (all sprints)
    alt FULL path
        note over Orch,BA2: 1c + 1d dispatched CONCURRENTLY (both read the 1a fetch)
        par 1c context
            Orch->>BA1: Gather context (read-only)
            BA1-->>Orch: surface, flows, risk (VC-*), docs grounding
        and 1d story review
            Orch->>BA2: Review ACs vs PR diff (no writes)
            BA2-->>Orch: AC scorecard, gap-ACs, AC-vs-impl
        end
        Orch->>Orch: 1e · Build TEST MODEL — REQUIRED, written to reports/ba/test-models/
        note over Orch: Gate 1 = inline self-check (no verifier dispatch)
        note over Orch: Step 2 · enrich the model (BL, ECL, E2E, VC-* probes, archetype + UIP sweeps)
    else FAST path
        Orch->>Orch: Gather context inline; skip story review, skip 1e ENTIRELY (note it)
        note over Orch: Step 2 · load the domains' BL-* only — no sweeps, no VC-* triage
    end

    note over Orch,TDE: Step 3 · Write, Review, Provision (reuse lifecycle skills)
    alt FULL path
        Orch->>TMS: Hand off Test Model (scenarios + user-flow diagram)
        TMS->>TMS: Author new cases (A) — new feature: from scenarios; bug/enhancement: map existing + gap-author
        TMS->>TMS: Append to regression/suites as Draft
        TMS->>RT: Review + auto-fix new cases (--fix)
        RT-->>TMS: Fixed cases (or flag unshippable)
    else FAST path
        note over Orch,TMS: NO Artifact A — a FAST run authors no cases
    end
    TMS->>TMS: Checklist (B) → reports/tickets/{SPRINT}/<TICKET>/testing-checklist.md; regression scope (C)
    opt Cases/checklist need un-fixtured data
        TMS->>TDE: generate + seed data
        TDE-->>TMS: seeded, green td:validate
    end
    TMS-->>Orch: Artifact B file + C scope (+ Draft cases in suite, FULL only)
    alt FULL path
        Orch->>V: GATE 3 · re-run suites:review + td:validate (hard STOP)
        V-->>Orch: APPROVE (REJECT: uncovered condition or blocker to fix, 1 round)
    else FAST path
        Orch->>Orch: inline self-check — checklist covers every condition + td:validate green
    end

    note over Orch,REG: Step 4 · Execute — THREE tracks, each released by its own gate. 4a fires while 1e/3x/A are still running
    note over Orch: GATE 3-exec (INLINE) · checklist covers every condition (or PENDING-A) · td:validate green · named fixtures resolve NOW
    Orch->>EX: 4a · Artifact B checklist + data (NO suite IDs, NO Artifact-A rows) — record time_to_first_test
    EX-->>Orch: Pass/fail, evidence, bugs   ← FIRST EVIDENCE
    Orch->>V: GATE 3-cases · suites:review + every PENDING-A now resolves to a real row (hard STOP)
    V-->>Orch: APPROVE (REJECT: ungrounded row or a surviving PENDING-A, 1 round)
    note over Orch: 4a returned - CHECK the authoring agent. Complete? append, assemble C1 scope, gate. Still running? WAIT, never proceed to 5a
    Orch->>REG: 4c · C1 · /qa-regression <target suites> --ids <new Draft + REPAIR + RE-BASE ids> = every case this run wrote or changed
    REG-->>Orch: RUN_ID + pass rate (5b reconciles against it; the release gate does NOT)
    note over Orch: Gate 4 = inline self-check (every PASS has an artifact); independent re-check happens at the Step-5 verdict gate

    note over Orch,TRG: Step 5a · Triage — /qa-triage-results on the RUN_ID, then correlate + evidence-check
    Orch->>TRG: /qa-triage-results RUN_ID --fix
    TRG-->>Orch: confirmed bugs / test-fixes applied / dismissed (+ flakiness history fed)
    opt App Insights configured
        Orch->>AI: Query window, dedup (label, not filter), triage
        AI-->>Orch: Correlated signals
    end
    Orch->>Orch: classify non-RUN_ID findings + provenance + severity + dedup (files nothing)

    note over Orch,V: Step 5b · Compare AC & DoD vs implementation (quantified estimate via qa-metrics)
    Orch->>Orch: reconcile ACs + DoD items live, compute AC-coverage%/DoD%
    alt FULL path
        Orch->>V: GATE · re-derive AC/DoD table+% AND re-classify a 5a sample (live repro, diff lane)
        V-->>Orch: APPROVE (REJECT: mislabel/under-grade/unsupported %, hard STOP before verdict)
    else FAST path
        Orch->>Orch: inline self-check
    end
    Orch->>Orch: 5c verdict (keyed off 5a provenance + 5b reconciliation)

    note over Orch,TR: Step 5d · File bugs — sub-task (in-scope) / link-only (pre-existing) / standalone (incidental)
    opt Confirmed non-duplicate bugs
        Orch->>TR: 5d file via /qa-bug (confirm, with Fix Routing + relationship)
    end

    note over Orch,TR: Step 5e · Report — feed/ratify release gate, THEN post comment, THEN summary + chat
    Orch->>V: feed + ratify Feature Release Gate (compute-metrics --gate feature)
    V-->>Orch: ratify or downgrade
    Orch->>TR: post QA comment
    Orch->>Orch: persist summary.json (incl. timing) + update testing-checklist.md with verdicts + chat report

    note over Orch,TR: Step 5f · Change status (strictly after the report is posted)
    Orch->>TR: TESTED (pass) / REOPEN (fail)
    note over Orch,TR: Step 5h · Publish documentation — after the transition, BOTH paths (refuses, never guesses)
    Orch->>TR: post the audience-routed guides as ONE comment (or state the refusal)
    opt FULL + a domain map EXISTS (5h-map · non-blocking)
        Orch->>Orch: write back what THIS RUN verified — new §2 surfaces, a D* upgraded live, a G* CLOSED; sets `amended`, never `generated`/`rev`
    end
    Orch-->>User: Verdict + report + next steps
    note over Orch: Cases authored at Step 3 stay Draft — promotion is a later /qa-test-lifecycle pass, not a step of this run
```

### Diagram 2 — after the verdict (Step 5e and the close-out branches)

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'ui-monospace, SFMono-Regular, Menlo, monospace','background':'#eef4f6','primaryColor':'#0d7d8a','primaryBorderColor':'#0a5f6a','primaryTextColor':'#ffffff','lineColor':'#5b6b7a','textColor':'#2b3a45','actorBkg':'#0d7d8a','actorBorder':'#0a5f6a','actorTextColor':'#ffffff','actorLineColor':'#a9c4c8','signalColor':'#54687a','signalTextColor':'#2b3a45','noteBkgColor':'#d3e8ea','noteBorderColor':'#0d7d8a','noteTextColor':'#0e2a2e','sequenceNumberColor':'#ffffff','labelBoxBkgColor':'#e2ecef','labelBoxBorderColor':'#9fb6bd','labelTextColor':'#2b3a45','loopTextColor':'#0a5f6a','activationBkgColor':'#bfe0e3','activationBorderColor':'#0d7d8a'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant Orch as /qa-test verdict
    participant Gate as Feature Release Gate
    participant V as qa-lead (verifier)
    participant Fix as /qa-fix + dev team
    participant VF as /qa-verify-fix
    participant TR as Tracker

    note over Orch,VF: A fix-ready Bug reaches /qa-verify-fix DIRECTLY from Step 1a (run inline) — this FAIL→fix→verify loop is only one way to get there
    alt PASS / PASS WITH NOTES
        Orch->>Gate: 5e Feed verdict + regression pass rate + release criteria
        Gate->>V: Ratify GO/NO-GO (compute-metrics --gate feature --run-id RUN_ID + re-check ledger)
        V-->>Gate: APPROVE or downgrade
        Gate-->>User: GO / CONDITIONAL GO / NO-GO (independently ratified)
    else FAIL, REOPEN  (default: pointer, not auto-trigger)
        Orch-->>User: Next step = /qa-fix
        User->>Fix: /qa-fix VCST-XXXX (G0-G7, no auto-merge)
        Fix-->>User: PR, human review, merge, deploy
        User->>VF: /qa-verify-fix VCST-XXXX
        VF->>VF: RED (pre-fix) to GREEN (fixed) x3 + regression
        VF-->>TR: TESTED, then DONE
    else FAIL  (--iterate: bounded loop, Step 5k, <= max-rounds)
        note over Orch,Fix: Per round: /qa-fix (no merge) -> /qa-deploy-pr prerelease (confirm) -> re-run failed cases (--ids, own run) + regression re-scoped to the FIX diff -> re-verdict. Per round it also FILES new bugs, posts a round delta, rewrites summary.json and APPENDS to the checklist; the release gate, the transition and promotion happen once, at loop exit. PASS exits to the release gate; cap or G0 BAIL STOPs to a human. Merge + release stay human
    else BLOCKED
        Orch-->>User: Resolve env/data/dependency, re-run /qa-test
    end
    opt Step 3 authored new cases (new_cases_authored > 0)
        note over Orch,User: They stay Draft. /qa-test STOPPED PROMOTING 2026-09-10 — the flip is a later /qa-test-lifecycle 6P pass, or a direct /qa-regression run's Step 6.5 (procedure: knowledge/execution/regression-promotion.md)
        Orch-->>User: Next step = /qa-test-lifecycle VCST-XXXX --promote-only
    end
```

## Decision gates encoded in the flow

- **Independent verification at the two hard-STOP gates (FULL path).** Step 3 (artifacts + data) and Step 5b
  (triage + AC/DoD vs implementation, incl. the quantified estimate) run
  `DOER → GATE → INDEPENDENT VERIFIER`. (The Feature Release Gate §1a inside Step 5e is *also* independently
  ratified, but that's the verifier confirming a downstream recommendation off already-gated inputs, not a
  third from-scratch gate. A third hard STOP sat at `5g` until promotion left the pipeline on 2026-09-10.) The verifier is a **fresh `qa-lead-orchestrator` instance in
  §Verifier Mode**, never the pipeline's inline orchestrator and **never the step's own doer**. It re-derives
  evidence from source (re-runs `suites:review`/`td:validate`/`compute-metrics --gate feature`, re-opens the
  evidence, or delegates a live re-check to a specialist on a **different browser lane**), returns
  `APPROVE`/`REJECT`, and on REJECT gives reason + fix → the doer fixes → **re-verify once (1 round), then
  STOP**. **Every other step, and the whole FAST path, self-checks inline** — no verifier dispatch. **Doer ≠
  checker at the gates that matter.**
- **Step 1a routing (two axes)** — first the **FLOW** (`verify-fix` / `hotfix-verify` / `feature-test`) by
  the ticket's **type × status** (single source of truth:
  [`.claude/knowledge/execution/ticket-routing.md`](../.claude/knowledge/execution/ticket-routing.md)),
  then, for `feature-test`, the **FAST vs FULL** path by priority/layer/domain. A fix-ready Bug reaches
  `/qa-verify-fix` **directly from 1a** (not only via the FAIL→fix loop in Diagram 2); a hotfix-status Bug
  points to `/qa-hotfix-check`; a Sub-task inherits its parent. When in doubt → `feature-test` FULL
  (fail-safe).
- **Step 1 ordering** — `1a`–`1e` are sequential dependencies: the fetch (`1a`) must precede the type/route
  gate, the BA delegation, the dedup glob and the story review; `{SPRINT}` is resolved in `1b` *before* the
  duplicate check that globs it (and the check spans **all** sprints). On the full path, `1c` and `1d` are
  **dispatched concurrently** — both consume only the `1a` fetch and are independent.
- **`1a` reads comments + analyzes attachments (both paths)** — the description is the plan, the comments
  are what happened (real repro, PO/dev clarifications, reopen/"fixed in build X" notes, prior QA findings)
  and attachments are primary evidence (a screenshot's expected-vs-actual, a design mockup, a log/HAR that
  narrows the repro). They land in the Test Model's `Ticket signals` field and feed `1c` (the affected code
  site), `1d` (AC-affecting clarifications override a stale description), and Step 5b (the expected-vs-actual
  baseline for AC reconciliation). Open attachments, don't just note them; flag any that can't be fetched.
- **Epic-awareness (both paths) + `--epic` serial mode.** `1a` resolves a story's **parent Epic** (goal +
  Epic-level ACs) and its **child stories with statuses**: Done siblings = the integration surface (add
  seam coverage to Artifact B + their suites to Artifact C), In-progress siblings = dependencies (a hard
  one → possible BLOCKED). It lands in the Test Model `Epic context` field and feeds `1c` (map the seams,
  not just the story's code). **`--epic <EPIC-KEY>`** wraps the pipeline to run the Epic's testable child
  stories **in series** — dependency-ordered, each story's seeded exit state carried into the next, a FAIL
  halting the chain, then a **cross-story E2E** — and rolls the per-story Feature Release Gates into one
  **Epic verdict** (all GO + E2E clean + 0 open P0 across the Epic → releasable). Every per-story gate still
  fires; merge/release stay human.
- **Step 1e Test Model** — carries the AC table **plus a condition space, an explicit reduction
  rationale, a defect-hypothesis scenario matrix (cell · hypothesis · archetype · technique · oracle) and a Mermaid
  user-flow diagram**; that matrix is the artifact `test-management-specialist` authors cases from in Step 3.
- **Step 2 docs gate** — the VirtoOZ docs query is skipped when the BA already returned docs grounding.
- **Step 3 test-quality gate** — newly authored cases pass `/qa-review-tests --fix` (11 dimensions) and are
  **appended into `regression/suites/` as `Draft`**; test data is seeded (green `td:validate`) before
  hand-off. This **reuses the same skills `/qa-test-lifecycle` Phases 3–4 use** (`/qa-test-cases-generator`,
  `/qa-review-tests`, `/qa-generate-data`) — the skills own it and neither command restates a dimension,
  code or enum. `/qa-test` does not spin up the full lifecycle command; it reuses the skills directly.
- **Step 4 execution order** — **the checklist goes first because it is released first.** `4a` carries
  **Artifact B and nothing else**; **Artifact C runs as its own `/qa-regression <ids>` run** (`4c`), never
  inside a ticket agent's prompt (one-agent-per-suite + the 3-lane pool + the long-runner cap). Because the
  runner does not skip `Draft`, that run **executes the new cases appended in Step 3 — the "latest test"** —
  and since 2026-09-10 it is the ONLY thing that does: the Artifact-A rows came out of the agent prompt,
  where they were a second execution that emitted no `RUN_ID` and therefore grounded nothing. **The
  max-3-browser cap still holds by construction on FULL** — `B` is written from what `3x` returns and
  `3-exec` gates on `B`, so execution cannot start while the lane is open — but lanes are counted before
  every dispatch anyway and yield in the order `3x` > execution > visual > `1r` > C1. **There is no
  exploratory charter in a Step-4 prompt.**
- **Step 4 tracker gate** — Jira-only in-testing transition, deliberately unconfirmed (precondition for the
  Step 5f close); the test-window start anchors the Step 5a App Insights correlation.
- **Step 5 order** — `5a` triage (incl. the `/qa-triage-results <RUN_ID> --fix` call on the Artifact-C run)
  runs **before** `5b` AC/DoD reconciliation, which runs **before** `5c` verdict, because PASS/FAIL is
  expressed in terms of a finding's provenance (from `5a`) and the reconciled AC/DoD state (from `5b`). `5a`
  and `5b` file nothing; `5d` files; `5f` transitions.
- **Step 5a triage** — the Artifact-C `RUN_ID`'s own FAILs are triaged via `/qa-triage-results <RUN_ID>
  --fix` (deterministic collect, per-batch classification, live-verify, test-case auto-fix for the
  *existing* suites, flakiness-history feed) instead of ad hoc re-derivation; findings without a RUN_ID
  (failed ACs, checklist-track bugs, App-Insights signals) use the same taxonomy inline. Every finding is
  classified (real bug / test-defect / by-design), given a **provenance** (**PRE-EXISTING** → link, don't
  re-file · **IN-SCOPE** → fails this ticket, files as a tracker **Sub-task** · **OUT-OF-SCOPE incidental**
  → own standalone ticket, doesn't fail this one), given a severity, and **deduped across all sprints + the
  tracker** — all before `5d` files anything via `/qa-bug`. A test-defect routes to `/qa-review-tests
  --fix`, never a ticket. Only an in-scope P0/P1 (or an out-of-scope P0 revenue break) fails the verdict.
- **Step 5b AC/DoD gate** — the Step-5 hard-STOP: reconciles every AC condition live, resolves any DoD items
  the `1e` Test Model deferred, and computes a **quantified estimate** (AC-coverage %, DoD-completion %)
  from the actual condition/checklist counts — `compute-metrics.ts` has no AC/DoD-shaped metric, so this is
  a simple deterministic ratio in `qa-metrics`' own style, not a repurposed regression-pass-rate number. The
  FULL-path verifier re-derives this **and** re-classifies a sample of `5a`'s findings in one dispatch.
- **Step 5d filing — relationship by provenance.** **IN-SCOPE → filed as a tracker Sub-task of the ticket**
  (parent-child; `.claude/knowledge/execution/tracker-ops.md` §5b), replacing a plain link — it *is* this
  ticket's defect. **PRE-EXISTING → linked only, never re-filed.** **OUT-OF-SCOPE incidental → its own
  standalone ticket + a related link (unchanged)**, since it wasn't caused by this ticket's change.
- **Step 5e Report, before Step 5f status change.** The tracker comment (QA Complete summary, incl. the
  AC/DoD percentages, the regression-triage counts, and the release-gate recommendation) is posted **before**
  the TESTED/REOPEN transition — two distinct actions, not bundled.
- **Close-out loop (pointer, not auto-trigger — the default)** — FAIL/REOPEN → `/qa-fix` → human
  merge/deploy → `/qa-verify-fix` (RED→GREEN re-test) → TESTED/DONE; BLOCKED → resolve → re-run `/qa-test`.
  `/qa-test` states the next command and stops; it never fixes. **Promotion is not part of the close-out** —
  cases authored at Step 3 stay `Draft` and a later `/qa-test-lifecycle --promote-only` pass flips them.
- **`--iterate` — the bounded test → fix → re-test loop (opt-in, Step 5k)** — with `--iterate` (default
  `--max-rounds 2`) a FAIL is *driven*, not pointed: per round `/qa-test` runs `/qa-fix` for each IN-SCOPE
  fixable bug (G0–G7, **never merges**; a G0 BAIL STOPs to a human) → `/qa-deploy-pr` deploys the fix's
  **prerelease** to the test env (**confirm each deploy**; no merge, so the §2 guard is never touched) →
  **`5k.0` round entry: probes the deployed build, then re-reads the board** — the ticket’s sub-tasks and
  linked bugs, each fix-ready one verified by an **inline `/qa-verify-fix`**, a VERIFIED one hopping to
  `TESTED` **only when its fix is merged AND in that probed build** (prerelease-green is comment-only;
  every other verdict stays CARRIED and defers its `REOPEN` to loop exit) →
  re-runs the previously-FAILED cases (as their **own** `--ids` run, so the RED→GREEN rate and the gate’s
  ≥80% floor stay two numbers) →
  re-verdicts. **No suite sweep runs inside the loop** — the round's own decision comes from 5c, which never
  depended on one. PASS exits to the Feature Release Gate (5e); still-FAIL at the cap STOPs with a
  per-round summary; BLOCKED STOPs. **Merge + release are always the human's.** Diagram 2's FAIL branch
  is one round of this loop.
  **It re-persists as well as re-runs, and the split is the contract:** per round it files new bugs
  (a bug already filed this run is CARRIED, not re-filed), posts a short round delta, rewrites
  `summary.json` with the round appended to `iterations.per_round[]`, and **appends** a section to the
  checklist; the release gate, the full QA-Complete comment, the tracker transition and `5h`/`5h-map` all
  happen **once, at loop exit** — so a `--iterate` run makes one transition **on the ticket under test**
  and posts one QA-Complete comment whatever the round count (a bug sub-task verified at round entry takes
  its own hop, capped at `TESTED`). Per-round table with the reason for each row:
  [`skills/qa-test/modes.md`](../.claude/skills/qa-test/modes.md) §5k.
- **Promotion is append-Draft → execute → STOP; the flip is a different command.** Cases are appended
  `Draft` (Step 3) and executed as `Draft` by the automated regression runner (Step 4). That execution is the
  `--verify` evidence which upgrades assertions `{HYPOTHESIS}`→`{OBSERVED}` — `--verify` is the sole emitter
  of `{OBSERVED}` and needs a live browser, so promoting before execution is impossible. **`/qa-test`'s own
  `5g` step was REMOVED 2026-09-10**: it was a corpus-wide write sitting at the tail of a ticket run as a
  hard-STOP gate that fired *after* the close-out had been delivered, so it could neither block nor be
  skipped cleanly — and it made two promoters for one corpus. **`/qa-test-lifecycle` Phase 6P is the FULL
  promoter**, for these cases as for handoff, re-promotion and legacy sources — and a **direct**
  `/qa-regression` run flips already-grounded cases at its **Step 6.5**, from the `RUN_ID` it just made
  (same `tc:promote`, no assertion harvest, suppressed with `--no-promote` on the C1 run `/qa-test`
  delegates). 6P harvests the run's
  `RUN_ID`, flips each eligible case `Draft → Automated` (green under the automated runner) or
  `Reviewed`/`Manual` (checklist-only), **reverts non-promotable rows**, and leaves a case that failed on a
  real in-scope bug at `Draft` with a reason — ratified by a fresh `qa-lead` verifier + user confirmation,
  so the author never self-certifies. Procedure:
  `.claude/knowledge/execution/regression-promotion.md` §The full procedure. **The cost, stated:** until
  someone runs that pass — or a direct `/qa-regression` surfaces them at 6.5 — the cases sit at `Draft`,
  which the selections do not treat as maintained coverage.

## Quality gates that apply to a story

The gates are **layered** — the story run produces a verdict, and the **Feature Release Gate** turns that
verdict (plus the team-level release criteria) into the global **GO / NO-GO**:

| Layer | Gate | Verdict | Where |
|-------|------|---------|-------|
| Test artifacts | `/qa-review-tests` 11-dimension quality gate (enforced in Step 3 via `--fix`) | per-dimension | [`skills/qa-review-tests`](../.claude/skills/qa-review-tests/) |
| The story run | Step 5a triage + Step 5b AC/DoD vs implementation (incl. the quantified estimate) + Step 5c verdict — every AC condition carries PASS evidence, all reconciled SATISFIED-live, DoD items MET/N-A, all `BL-*` verified, no **in-scope** P0/P1 bug, no correlated App-Insights REAL_BUG | PASS / PASS WITH NOTES / FAIL / BLOCKED | [`commands/qa-test.md`](../.claude/commands/qa-test.md) §5a–5c |
| **Feature release (team go/no-go)** | **Feature Release Gate** — consumes the story verdict + open-bug ledger + change-scoped regression + NFRs + smoke. Owned by `qa-lead-orchestrator`. *"Can we release this feature?"* | **GO / CONDITIONAL GO / NO-GO** | [`skills/qa-metrics/quality-gates.md`](../.claude/skills/qa-metrics/quality-gates.md) **§1a** |
| Release (folds many features) | Smoke / Sprint Release / Full Release / Hotfix gates | PASS·FAIL / APPROVED·CONDITIONS·BLOCKED | [`skills/qa-metrics/quality-gates.md`](../.claude/skills/qa-metrics/quality-gates.md) |
| Bug auto-fix (if the story spawns a fix) | G0–G7 auto-fix ladder | open PR | [`.claude/knowledge/execution/quality-gates.md`](../.claude/knowledge/execution/quality-gates.md) |

**The feature go/no-go in one line:** a `/qa-test` **PASS**/**PASS WITH NOTES** feeds a **GO** only if
0 open P0, **0 open undeferred P1/High**, change-scoped regression ≥80%, NFRs clean, and smoke PASS all
hold; any P0 bug / **any undeferred High** / unmet AC / `BL-*` violation / regression below the 80% floor / new security
finding, or a `/qa-test` FAIL/BLOCKED, is a **NO-GO**. The floor came down from 95% to 80% on 2026-09-02
and the pass-rate conditional band went with it. A High **declared** deferred (`--p1-deferred N`,
workaround + signed risk acceptance + monitoring plan) caps the gate at **CONDITIONAL GO** rather than
blocking it. Before the pass rate is read at all, the gate checks **completeness** (`quality-gates.md`
§0): >10% of planned cases BLOCKED-and-untriaged returns **CANNOT EVALUATE** (exit 2) — not a NO-GO,
because BLOCKED sits outside the pass-rate denominator and so cannot be judged by it.

---

## Layer, role & hand-off schema

The two sequence diagrams above show *when* things happen. This section shows *who owns what* — the
agent layers, their roles, the typed hand-offs between them, and the exit criteria / DoD that close the
run. The invariant that shapes every layer: **doer ≠ checker** (at the FULL-path hard-STOP gates), and L0
never delegates the orchestration itself.

### Diagram 3 — the five agent layers (swimlane)

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'ui-monospace, SFMono-Regular, Menlo, monospace','primaryColor':'#0d7d8a','primaryBorderColor':'#0a5f6a','primaryTextColor':'#ffffff','lineColor':'#5b6b7a','textColor':'#2b3a45','clusterBkg':'#e2ecef','clusterBorder':'#9fb6bd'}}}%%
flowchart TB
    subgraph L5["L5 · Human (terminal)"]
        H["Reviewer / release owner<br/>TESTED·REOPEN acceptance + GO/NO-GO"]
    end
    subgraph L0["L0 · Orchestration (inline, never delegated)"]
        O["/qa-test<br/>route fast/full · Test Model · summary.json · report"]
    end
    subgraph L1["L1 · Verification (fresh instance, FULL path, Step 3 + Step 5b, hard STOP; Step 5e, non-blocking)"]
        V["qa-lead — Verifier Mode<br/>re-derives from source · APPROVE/REJECT"]
    end
    subgraph L2["L2 · Analysis & Authoring (repo-write only)"]
        BA1["ba-system-analyzer<br/>surface·flows·VC-* risk·docs"]
        BA2["ba-story-writer (Mode B)<br/>AC scorecard·gap-ACs"]
        TMS["test-mgmt-specialist<br/>cases A · checklist B · reg. selection C"]
        RT["/qa-review-tests<br/>11-dim --fix"]
        TDE["test-data-engineer<br/>seed + td:validate"]
    end
    subgraph L3["L3 · Execution (1 agent / browser lane · max 3)"]
        FE["qa-frontend-expert<br/>chrome"]
        BE["qa-backend-expert<br/>edge"]
        UX["ui-ux-expert<br/>DevTools MCP"]
        REG["/qa-regression<br/>Artifact C · own 3-lane pool"]
    end
    subgraph L4["L4 · External systems (read-only except 2 gated writes)"]
        TR["Tracker (Jira/Azure)"]
        AI["App Insights"]
        GH["GitHub / VirtoOZ"]
    end

    H -->|VCST-XXXX| O
    O -->|gate ruling req (Step 3 / Step 5b, full path)| V
    V -.->|APPROVE / REJECT+FIX (1 round)| O
    O -->|context / story / authoring| L2
    L2 -.->|Test Model · A/B/C · seeded data| O
    O -->|checklist + A + data| L3
    O -->|C suite IDs| REG
    L3 -.->|pass/fail · evidence · findings| O
    O -->|fetch · in-testing · TESTED/REOPEN| TR
    O -->|window query| AI
    L2 --> GH
    V -.->|live re-check on a DIFFERENT lane| L3
    O -.->|verdict + report + next steps| H
```

### Layer model

| Layer | Name | Members | Write scope | Governing rule |
|---|---|---|---|---|
| **L0** | Orchestration | `/qa-test` (inline) | in-context + `summary.json`, screenshots; new cases → `regression/suites/` | Runs the pipeline inline — never hands it to another orchestrator; routes fast/full |
| **L1** | Verification | `qa-lead-orchestrator` §Verifier Mode — **fresh per gate, FULL path only** | none (rules only) | Re-derives from source; `APPROVE`/`REJECT`; when-in-doubt → REJECT; **1 round** |
| **L2** | Analysis / Authoring | `ba-system-analyzer`, `ba-story-writer` (B), `test-management-specialist`, `test-data-engineer`, `/qa-review-tests` | **repo only**; BA read-only externally | Context & authoring; no JIRA/GitHub writes |
| **L3** | Execution | `qa-frontend-expert`, `qa-backend-expert`, `ui-ux-expert`, `/qa-regression` | evidence artifacts only | One agent per lane; max 3 concurrent (incl. regression lanes) |
| **L4** | External systems | Tracker, App Insights, GitHub, VirtoOZ MCP | — | Read-only except the 2 gated tracker writes |
| **L5** | Human (terminal) | Reviewer / release owner | — | Owns acceptance + release; `/qa-test` never ships/merges/fixes |

### Role schema (per agent)

| Agent | Layer | Step(s) | Consumes | Produces | Lane |
|---|---|---|---|---|---|
| `/qa-test` | L0 | all | user invocation | route, Test Model, dispatches, `summary.json`, chat report | — |
| `qa-lead` verifier | L1 | 3, 5b (hard STOP) + 5e (non-blocking), full path | doer artifact + `{step, gate_criteria, source_of_truth, cmd?}` | `APPROVE`/`REJECT` + `REASONS`+`FIX` | delegates re-check to a **different** lane |
| `ba-system-analyzer` | L2 | 1c (full path) | ticket fields + PR diff + comment/attachment signals | affected surface, flows, `VC-*` risk, docs grounding | firefox (RO) |
| `ba-story-writer` (B) | L2 | 1d (full path) | existing ACs + PR diff | AC scorecard, gap-ACs, AC↔impl (static), DoD checklist | none |
| `test-management-specialist` | L2 | 3 | Test Model (scenarios + user-flow diagram) | Artifact A (cases → suite as Draft), B (checklist), C (selection) | chrome (seq) |
| `/qa-review-tests` | L2 | 3 (and later, in `/qa-test-lifecycle` 6P) | authored cases | fixed cases / unshippable flag; `--verify` upgrades to `{OBSERVED}` | — |
| `test-data-engineer` | L2 | 3 (cond.) | gap fixtures needed | seeded data, `@td()` aliases, green `td:validate` | none |
| `qa-frontend-expert` | L3 | 4 | checklist + A + `@td()` + BL/ECL | pass/fail + evidence + bugs | chrome |
| `qa-backend-expert` | L3 | 4, 5a | same; triage oracle at 5a | same; App-Insights classification | edge |
| `ui-ux-expert` | L3 | 4 (UI) | component scope | a11y / design findings | DevTools MCP |
| `/qa-regression` | L3 | 4 (track 2) | Artifact-C suite IDs (incl. the new Draft cases) | `RUN_ID` + pass rate | own pool |
| `/qa-triage-results` | L3 | 5a | `RUN_ID` + `--fix` | `triage-report.md` (confirmed bugs / test-fixes applied / dismissed) + flakiness history feed | own pool |

### Hand-off rules (load-bearing)

- **Artifact C never enters a ticket-agent prompt** — it runs as its own `/qa-regression <ids>` run
  (one-agent-per-suite + the 3-lane pool + the long-runner cap), and it is what executes the new Draft cases.
- The verifier's live re-check must use a **lane the doer did not use**.
- A REJECT's `FIX` goes back to the **step's doer**, never to the verifier; the verifier re-checks from
  scratch (re-runs the deterministic core, re-reads the source).
- **1 round** per gate: re-verify once, then **STOP for a human** — a persistent REJECT never silently
  proceeds.

### Gate / exit-criteria schema (per step)

| Step | Gate (pass criteria) | Independent verification | Type |
|---|---|---|---|
| **1** Test Model | type + path set; ACs → atomic conditions; scenarios enumerated; BL/ECL/domains + risk areas present | inline self-check (no verifier dispatch) | inline |
| **2** Plan | every domain has BL/ECL/E2E loaded + agent routed | inline self-check | inline |
| **1r** Reachable at all *(FULL)* | the ticket's surface renders; the change is in the DEPLOYED build; the primary AC path walks shallowly; the assumed accounts/fixtures resolve | inline — **never a PASS/FAIL on the ticket**; `BLOCKED` ends the run before the derivation is paid for | inline |
| **3-exec** Checklist + data ready | every condition maps to a checklist item, an existing case, or an explicit `PENDING-A`; `td:validate` green; every fixture the checklist names resolves NOW | inline (`verify:gate --gate 3-exec`, no `--suite` — Artifact A does not exist yet) | **releases 4a** |
| **3-cases** Authored cases reviewed | new cases pass 11-dim (0 blocker/critical); each case's Steps exercise its title's condition; **every `PENDING-A` now resolves to a real row** | **FULL:** V **re-runs** `suites:review` + `td:validate` (1 round). **FAST:** authors nothing, so this gate does not apply | **HARD STOP · releases 4c** |
| **4** Execution | every condition has PASS/FAIL evidence **and says which pass produced it (4a or 4b)**; regression `RUN_ID`+rate exist (the run also executed the new Draft cases) | inline self-check (independent re-check deferred to Step 5b) | inline |
| **5a** Triage | Artifact-C `RUN_ID`'s FAILs triaged via `/qa-triage-results --fix` (not ad hoc); every other finding classified + provenance + severity + deduped | folded into the Step 5b gate below | inline (no separate dispatch) |
| **5b** AC & DoD vs implementation | every AC condition reconciled; every DoD item resolved MET/NOT-MET/N-A; AC-coverage % + DoD % computed from actual counts | **FULL:** V re-derives the AC/DoD table + both percentages from Step-4 evidence **and** re-classifies a sample of 5a's findings via live repro (diff lane), confirms the RUN_ID rate. **FAST:** inline self-check | **HARD STOP before 5c** |
| **5d** File bugs | IN-SCOPE → Sub-task of the ticket; PRE-EXISTING → linked, not re-filed; incidental → standalone + related link | inline self-check (mechanical — 5b already ratified the provenance/severity calls) | inline |
| **5e** Report → release gate | §1a criteria → GO/CONDITIONAL/NO-GO | **FULL:** V re-evaluates `compute-metrics.ts --gate feature --run-id <RUN_ID>` (scope required; exit 2 = CANNOT EVALUATE, not a failure) + open-bug ledger (now current, post-5d) | ratify/downgrade |
| **5h** Publish documentation | audiences derived from `layer`; size caps honoured; a refusal (`layer-unresolved` / `not-deployed` / `not-user-visible`) is STATED, never a silent skip | inline self-check | inline |
| **5h-map** Domain-map write-back *(FULL, only when a map exists)* | every appended claim is live-`CONFIRMED` with the ticket id; no row deleted, no id renumbered; `amended` moves and `generated`/`rev` do not | inline self-check + `domain:check` + `context:check` | inline, non-blocking |

### End of flow — DoD

A `/qa-test` run is **Done** when all hold:

1. **The two FULL-path hard-STOP gates APPROVED** (`3-cases`, Step 5b) — or the FAST path's inline
   self-checks passed; no gate left at REJECT. **`3-exec` approved** on both paths, with any `PENDING-A`
   it allowed through now closed.
2. **Every atomic condition** (story ACs + gap-ACs) carries PASS/FAIL evidence and is reconciled live, and
   every DoD item is resolved MET/NOT-MET/N-A, with the AC-coverage/DoD percentages computed (5b).
3. **Every finding triaged** (class + provenance + severity + dedup, 5a); confirmed bugs filed with
   confirmation, the right tracker relationship (Sub-task / link / standalone), and `## Fix Routing` (5d).
4. A **verdict** (5c) issued, consistent with the triage + AC/DoD tables.
5. **`summary.json`** persisted (schema at [`.claude/templates/qa-test-summary.schema.json`](../.claude/templates/qa-test-summary.schema.json))
   with `path`, the `ac_dod_estimate` block, the `regression` (C1 only) + `regression_triage` blocks,
   `bugs_filed` (with relationship), `new_cases_authored`, the `domain_map` block, and a **`timing` block
   whose `steps.*` are real minutes** plus `time_to_first_test_minutes` — the number the 2026-09-10
   restructure exists to move, and which was `0`/absent in every run before it.
6. **QA comment posted, then tracker transitioned** to TESTED/REOPEN — the terminal reach; never
   Done/Cancelled (5e then 5f, in that order).
7. **Feature Release Gate fed** (5e) and independently ratified GO/CONDITIONAL/NO-GO.
8. **Documentation published (5h)** — or its refusal stated — and, on FULL with an existing domain map,
   **`5h-map` has written back what the run verified** (or recorded `NOTHING_TO_AMEND`). New cases remain
   `Draft`, with `/qa-test-lifecycle VCST-XXXX --promote-only` named as the next step: promotion is **not**
   part of this run's DoD.
9. **Close-out pointers stated**, never auto-triggered: FAIL/REOPEN → `/qa-fix` → human merge/deploy →
   `/qa-verify-fix`; BLOCKED → resolve → re-run `/qa-test`.
