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

**Fast vs full path (feature-test only).** A bug fix / copy-tweak / config / Technical task that is P2–P3,
single-layer and single-domain takes the **FAST** path — it skips the `1c` BA-context and `1d` story-review
agents, authors minimal cases, runs one execution agent, and self-checks inline (no independent verifier). A
new feature / Story / Epic, anything P0–P1, cross-layer, ≥2 domains, a critical-revenue flow, or an unclear
surface takes the **FULL** path — `1c ‖ 1d` concurrently, full authoring, and the two hard-STOP independent
verifiers. **When in doubt → FULL.**

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
    note over Orch,V: FULL path only: 3 hard-STOP GATES — Step 3, Step 5b, Step 5g (fresh qa-lead, re-derives from source). 1 round: REJECT to reason+fix, re-verify once, then STOP. Other steps + the whole FAST path self-check inline

    note over Orch,BA1: Step 1 · sub-parts 1a-1e (each consumes the prior)
    note over Orch: 1a · Fetch, classify TYPE×STATUS, ROUTE flow then fast/full
    Orch->>TR: Fetch ticket (type, STATUS, priority, ACs, PR diff) + COMMENTS + ATTACHMENTS + parent EPIC & siblings (both paths)
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
    else FAST path
        Orch->>Orch: Gather context inline; skip story review (note it)
    end
    Orch->>Orch: 1e · Build TEST MODEL (AC table + test scenarios + user-flow diagram)
    note over Orch: Gate 1 = inline self-check (no verifier dispatch)

    note over Orch: Step 2 · Plan — enrich the model (BL, ECL, E2E, docs), route agents
    Orch->>Orch: Load BL/ECL/E2E (+ VirtoOZ docs if inline)

    note over Orch,TDE: Step 3 · Write, Review, Provision (reuse lifecycle skills)
    Orch->>TMS: Hand off Test Model (scenarios + user-flow diagram)
    alt New feature / Story
        TMS->>TMS: Author new cases (A) from scenarios/diagram
    else Bug / enhancement
        TMS->>TMS: Map existing + gap-author (A)
    end
    TMS->>TMS: Append new cases to regression/suites as Draft; Checklist (B) + regression selection (C)
    TMS->>RT: Review + auto-fix new cases (--fix)
    RT-->>TMS: Fixed cases (or flag unshippable)
    opt Cases need un-fixtured data
        TMS->>TDE: generate + seed data
        TDE-->>TMS: seeded, green td:validate
    end
    TMS-->>Orch: Draft cases in suite + Artifacts B + C + aliases
    alt FULL path
        Orch->>V: GATE 3 · re-run suites:review + td:validate (hard STOP)
        V-->>Orch: APPROVE (REJECT: uncovered condition or blocker to fix, 1 round)
    else FAST path
        Orch->>Orch: inline self-check (same two cores)
    end

    note over Orch,REG: Step 4 · Execute — checklist first, THEN scoped regression (one 3-browser budget, no exploratory)
    Orch->>TR: Transition to in-testing (Jira, unconfirmed - precondition)
    Orch->>EX: Checklist + ticket cases + data (NO suite IDs)
    Orch->>REG: Artifact C as its own run (runs the new Draft cases too - the "latest test")
    EX-->>Orch: Pass/fail, evidence, bugs
    REG-->>Orch: RUN_ID + pass rate (feeds the release gate)
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
    Orch->>Orch: persist summary.json + output chat report

    note over Orch,TR: Step 5f · Change status (strictly after the report is posted)
    Orch->>TR: TESTED (pass) / REOPEN (fail)
    Orch-->>User: Verdict + report + next steps
```

### Diagram 2 — after the verdict (Steps 5e / 5g)

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
        note over Orch,Fix: Per round: /qa-fix (no merge) -> /qa-deploy-pr prerelease (confirm) -> re-run failed cases + regression -> re-verdict. PASS exits to the release gate; cap or G0 BAIL STOPs to a human. Merge + release stay human
    else BLOCKED
        Orch-->>User: Resolve env/data/dependency, re-run /qa-test
    end
    opt Step 3 authored new cases (new_cases_authored > 0) — runs LAST, non-blocking (5a-5f already delivered)
        Orch->>Orch: 5g Harvest Step 4 as --verify evidence (HYPOTHESIS to OBSERVED)
        Orch->>V: GATE 5g · re-run suites:review, re-open the artifact behind each OBSERVED
        V-->>Orch: APPROVE (REJECT: ungrounded OBSERVED or invented value; revert the append)
        Orch->>User: Promote the eligible set? (never automatic)
        User-->>Orch: Approve
        Orch->>Orch: Flip Draft to Automated (ran green under the automated runner) / Reviewed (checklist-only); revert non-promotable rows; suites:sync + suites:lint
    end
```

## Decision gates encoded in the flow

- **Independent verification at the three hard-STOP gates (FULL path).** Step 3 (artifacts + data), Step 5b
  (triage + AC/DoD vs implementation, incl. the quantified estimate), and Step 5g (the promotion flip) run
  `DOER → GATE → INDEPENDENT VERIFIER`. (The Feature Release Gate §1a inside Step 5e is *also* independently
  ratified, but that's the verifier confirming a downstream recommendation off already-gated inputs, not a
  fourth from-scratch gate.) The verifier is a **fresh `qa-lead-orchestrator` instance in
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
- **Step 4 execution order** — **checklist first, then the scoped regression.** Ticket cases + checklist go
  to the specialist agent(s); **Artifact C runs as its own `/qa-regression <ids>` run**, never inside a
  ticket agent's prompt (one-agent-per-suite + the 3-lane pool + the long-runner cap). Because the runner
  does not skip `Draft`, that regression run **executes the new cases appended in Step 3 — the "latest
  test."** Both tracks share the max-3-browser budget; if they don't fit, checklist cases go first (they own
  the verdict). **There is no exploratory charter.**
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
  `/qa-test` states the next command and stops; it never fixes. `5g` (promotion) still runs after, whichever
  branch fires, if Step 3 authored new cases — it never blocks or delays the close-out above.
- **`--iterate` — the bounded test → fix → re-test loop (opt-in, Step 5k)** — with `--iterate` (default
  `--max-rounds 2`) a FAIL is *driven*, not pointed: per round `/qa-test` runs `/qa-fix` for each IN-SCOPE
  fixable bug (G0–G7, **never merges**; a G0 BAIL STOPs to a human) → `/qa-deploy-pr` deploys the fix's
  **prerelease** to the test env (**confirm each deploy**; no merge, so the §2 guard is never touched) →
  re-runs the previously-FAILED cases + the change-scoped regression → re-verdicts. PASS exits to the
  Feature Release Gate (5e); still-FAIL at the cap STOPs with a per-round summary; BLOCKED STOPs. **Merge +
  release are always the human's.** Diagram 2's FAIL branch is one round of this loop.
- **Promotion is append-Draft → execute → harvest → flip, last and non-blocking.** Cases are appended
  `Draft` (Step 3), executed as `Draft` by the automated regression runner (Step 4), and **5g harvests that
  execution as the `--verify` evidence** that upgrades assertions `{HYPOTHESIS}`→`{OBSERVED}` — `--verify`
  is the sole emitter of `{OBSERVED}` and needs a live browser, so promoting before execution is impossible.
  5g runs **after** 5a–5f have already delivered the verdict/report/status-change to the user — it is a
  non-blocking follow-up, never a gate on TESTED/REOPEN. 5g then flips each eligible case `Draft →
  Automated` (green under the automated runner) or `Reviewed`/`Manual` (checklist-only), **reverts
  non-promotable rows**, and leaves a case that failed on a real in-scope bug at `Draft` with a reason. This
  flip is ratified by the fresh `qa-lead` verifier (re-derives G10 from the CSV) + user confirmation — the
  author never self-certifies. The standalone **`/qa-test-lifecycle` Phase 6P** remains the promoter for
  handoff / re-promotion / non-`/qa-test` sources.

## Quality gates that apply to a story

The gates are **layered** — the story run produces a verdict, and the **Feature Release Gate** turns that
verdict (plus the team-level release criteria) into the global **GO / NO-GO**:

| Layer | Gate | Verdict | Where |
|-------|------|---------|-------|
| Test artifacts | `/qa-review-tests` 11-dimension quality gate (enforced in Step 3 via `--fix`) | per-dimension | [`skills/qa-review-tests`](../.claude/skills/qa-review-tests/) |
| The story run | Step 5a triage + Step 5b AC/DoD vs implementation (incl. the quantified estimate) + Step 5c verdict — every AC condition carries PASS evidence, all reconciled SATISFIED-live, DoD items MET/N-A, all `BL-*` verified, no **in-scope** P0/P1 bug, no correlated App-Insights REAL_BUG | PASS / PASS WITH NOTES / FAIL / BLOCKED | [`commands/qa-test.md`](../.claude/commands/qa-test.md) §5a–5c |
| **Feature release (team go/no-go)** | **Feature Release Gate** — consumes the story verdict + open-bug ledger + change-scoped regression + NFRs + smoke. Owned by `qa-lead-orchestrator`. *"Can we release this feature?"* | **GO / CONDITIONAL GO / NO-GO** | [`skills/qa-metrics/quality-gates.md`](../.claude/skills/qa-metrics/quality-gates.md) **§1a** |
| Release (folds many features) | Smoke / Sprint Release / Full Release / Hotfix gates | PASS·FAIL / APPROVED·CONDITIONS·BLOCKED | [`skills/qa-metrics/quality-gates.md`](../.claude/skills/qa-metrics/quality-gates.md) |
| Bug auto-fix (if the story spawns a fix) | G0–G7 auto-fix ladder | open PR | [`.claude/rules/quality-gates.md`](../.claude/rules/quality-gates.md) |

**The feature go/no-go in one line:** a `/qa-test` **PASS**/**PASS WITH NOTES** feeds a **GO** only if
0 open P0, P1s deferred-with-acceptance, change-scoped regression ≥95%, NFRs clean, and smoke PASS all
hold; any P0 bug / unmet AC / `BL-*` violation / regression <93% / new security finding, or a `/qa-test`
FAIL/BLOCKED, is a **NO-GO**.

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
    subgraph L1["L1 · Verification (fresh instance, FULL path, Step 3 + Step 5b + Step 5g)"]
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
    O -->|gate ruling req (Step 3 / Step 5b / Step 5g, full path)| V
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
| `qa-lead` verifier | L1 | 3, 5b, 5g (full path) | doer artifact + `{step, gate_criteria, source_of_truth, cmd?}` | `APPROVE`/`REJECT` + `REASONS`+`FIX` | delegates re-check to a **different** lane |
| `ba-system-analyzer` | L2 | 1c (full path) | ticket fields + PR diff + comment/attachment signals | affected surface, flows, `VC-*` risk, docs grounding | firefox (RO) |
| `ba-story-writer` (B) | L2 | 1d (full path) | existing ACs + PR diff | AC scorecard, gap-ACs, AC↔impl (static), DoD checklist | none |
| `test-management-specialist` | L2 | 3 | Test Model (scenarios + user-flow diagram) | Artifact A (cases → suite as Draft), B (checklist), C (selection) | chrome (seq) |
| `/qa-review-tests` | L2 | 3, 5g | authored cases | fixed cases / unshippable flag; `--verify` upgrades to `{OBSERVED}` | — |
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
| **3** Artifacts + data | new cases pass 11-dim (0 blocker/critical); every condition maps to a case; data green `td:validate` | **FULL:** V **re-runs** `suites:review` + `td:validate` (1 round). **FAST:** inline self-check | **HARD STOP** |
| **4** Execution | every condition has PASS/FAIL evidence; regression `RUN_ID`+rate exist (the run also executed the new Draft cases) | inline self-check (independent re-check deferred to Step 5b) | inline |
| **5a** Triage | Artifact-C `RUN_ID`'s FAILs triaged via `/qa-triage-results --fix` (not ad hoc); every other finding classified + provenance + severity + deduped | folded into the Step 5b gate below | inline (no separate dispatch) |
| **5b** AC & DoD vs implementation | every AC condition reconciled; every DoD item resolved MET/NOT-MET/N-A; AC-coverage % + DoD % computed from actual counts | **FULL:** V re-derives the AC/DoD table + both percentages from Step-4 evidence **and** re-classifies a sample of 5a's findings via live repro (diff lane), confirms the RUN_ID rate. **FAST:** inline self-check | **HARD STOP before 5c** |
| **5d** File bugs | IN-SCOPE → Sub-task of the ticket; PRE-EXISTING → linked, not re-filed; incidental → standalone + related link | inline self-check (mechanical — 5b already ratified the provenance/severity calls) | inline |
| **5e** Report → release gate | §1a criteria → GO/CONDITIONAL/NO-GO | **FULL:** V re-evaluates `compute-metrics.ts --gate feature --run-id <RUN_ID>` (scope required; exit 2 = CANNOT EVALUATE, not a failure) + open-bug ledger (now current, post-5d) | ratify/downgrade |
| **5g** Promotion *(only if new cases authored; runs last, non-blocking)* | every `{OBSERVED}` traces to a real Step-4 artifact; every surviving `{HYPOTHESIS}` resolved or reworded; eligible cases flipped `Draft → Automated`/`Reviewed`, non-promotable reverted | V **re-runs** `suites:review` on the target suite + re-opens the evidence behind a sample of the upgrades; REJECT reverts the append (1 round) | required (never skipped when cases authored) |

### End of flow — DoD

A `/qa-test` run is **Done** when all hold:

1. **The three FULL-path gates APPROVED** (Step 3, Step 5b, Step 5g) — or the FAST path's inline self-checks
   passed; no gate left at REJECT.
2. **Every atomic condition** (story ACs + gap-ACs) carries PASS/FAIL evidence and is reconciled live, and
   every DoD item is resolved MET/NOT-MET/N-A, with the AC-coverage/DoD percentages computed (5b).
3. **Every finding triaged** (class + provenance + severity + dedup, 5a); confirmed bugs filed with
   confirmation, the right tracker relationship (Sub-task / link / standalone), and `## Fix Routing` (5d).
4. A **verdict** (5c) issued, consistent with the triage + AC/DoD tables.
5. **`summary.json`** persisted (schema at [`.claude/templates/qa-test-summary.schema.json`](../.claude/templates/qa-test-summary.schema.json))
   with `path`, the `ac_dod_estimate` block, the `regression` + `regression_triage` blocks, `bugs_filed`
   (with relationship), `new_cases_authored`, and the `promotion` split.
6. **QA comment posted, then tracker transitioned** to TESTED/REOPEN — the terminal reach; never
   Done/Cancelled (5e then 5f, in that order).
7. **Feature Release Gate fed** (5e) and independently ratified GO/CONDITIONAL/NO-GO.
8. **New cases promoted, last and non-blocking** (5g) when `new_cases_authored > 0` — assertions grounded to
   `{OBSERVED}` from this run's own artifacts, each surviving `{HYPOTHESIS}` resolved or reworded, eligible
   cases flipped `Draft → Automated` (or `Reviewed`/`Manual`), non-promotable rows reverted, and the split
   recorded in `summary.json` `promotion` — after, and independent of, the close-out above.
9. **Close-out pointers stated**, never auto-triggered: FAIL/REOPEN → `/qa-fix` → human merge/deploy →
   `/qa-verify-fix`; BLOCKED → resolve → re-run `/qa-test`.
