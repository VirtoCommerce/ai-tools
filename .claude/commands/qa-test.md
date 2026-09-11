---
description: "Test a tracker ticket, feature area, or PR. Step 1a routes by ticket type × status (per ticket-routing.md) to the right flow — a fix-ready Bug runs /qa-verify-fix inline, else feature-test at a FAST path (a checklist, plus the design/a11y visual lane when the ticket is UI-visible) or a FULL path (mandatory Test Model, case authoring, independent verifier gates, promotion). Regression is case-scoped to Critical + the run's new cases inside a 40-minute window. Dispatches specialist agents, correlates App Insights logs for the test window, and produces a verdict. --iterate drives a bounded test→fix→re-test loop; --epic runs a series of sibling stories with cross-story integration."
argument-hint: "<ticket-key> | feature name | PR #NNN | --epic <EPIC-KEY> [--iterate [--max-rounds N]]"
disable-model-invocation: true
---

# /qa-test — Test a Tracker Ticket or Feature

Analyze scope, dispatch specialist agents, collect results, and produce a verdict. **You run this
orchestration inline — do NOT delegate to another orchestrator agent.**

This command is the orchestration shell: what runs, in what order, and the gate each step must clear. **The
methodology — why each rule exists and what it was measured against — lives in the
[`/qa-test` skill](../skills/qa-test/SKILL.md).** Read the skill file for the step you are in when you hit
a judgment call a gate does not settle, or when you are about to change how a step works.

| Need | Read |
|---|---|
| Step 1e — the fault model, its eight rules, its gate | [`skills/qa-test/test-model.md`](../skills/qa-test/test-model.md) · shape: [`templates/test-model.md`](../templates/test-model.md) |
| Steps 1a–1b — the fetch, the routing branch, the two pre-flight waves | [`skills/qa-test/preflight.md`](../skills/qa-test/preflight.md) |
| Steps 1r · 1c · 1c-map · 1d — the FULL-only context wave: briefs, returns, what each carries | [`skills/qa-test/context-wave.md`](../skills/qa-test/context-wave.md) |
| The six derived axes as ONE mechanism (2b–2g) | [`skills/qa-test/axes.md`](../skills/qa-test/axes.md) |
| Ticket status — who moves it, when, on whose authority | [`knowledge/execution/ticket-status-transitions.md`](../knowledge/execution/ticket-status-transitions.md) |
| What already exists on this surface (prior BA analysis, models, domain knowledge) | `reports/ba/` + `reports/ba/test-models/` + `.claude/knowledge/domain/` |
| Steps 2–3 — oracles, the four artifacts, scaffold + fan-out, the C1 ticket-regression scope | [`skills/qa-test/authoring.md`](../skills/qa-test/authoring.md) |
| Step 3x — the discovery lane (exploratory, concurrent with 3a, before authoring) | [`skills/qa-test/exploratory-lane.md`](../skills/qa-test/exploratory-lane.md) |
| Step 5 — reconcile, verdict, filing | [`skills/qa-test/close-out.md`](../skills/qa-test/close-out.md) |
| Step 5a — triage · 5e/5f/5h/5h-map — report, transition, docs, map write-back | [`triage.md`](../skills/qa-test/triage.md) · [`reporting.md`](../skills/qa-test/reporting.md) |
| `--epic` · `--iterate` | [`skills/qa-test/modes.md`](../skills/qa-test/modes.md) |
| Verifier mode · agent routing · the agent prompt contract · what persists · **concurrency (what batches, what must stay serial)** | [`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) |
| `1b` 2d — the GraphQL schema + fixture refresh | [`skills/qa-test/contract-refresh.md`](../skills/qa-test/contract-refresh.md) |
| Step 2a — triaging the EXISTING corpus against the change | [`skills/qa-test/coverage-triage.md`](../skills/qa-test/coverage-triage.md) |
| The `ui-kit` shape class — when the change IS the design system | [`skills/qa-test/ui-kit-class.md`](../skills/qa-test/ui-kit-class.md) |

## Usage
```
/qa-test <ticket-key>                    # Test a specific tracker ticket
/qa-test <ticket-key-1> <ticket-key-2>   # Test multiple tickets
/qa-test checkout flow                   # Test a feature area by name
/qa-test PR #789                         # Test changes in a GitHub PR
/qa-test <ticket-key> --iterate          # Bounded test→fix→re-test loop (default 2 rounds; --max-rounds N)
/qa-test --epic VCST-100                 # Test a parent Epic's child stories in series

# FAST-path axis opt-ins (no effect on FULL, where all four derive and run):
/qa-test <ticket-key> --visual           # + the design / a11y lane
/qa-test <ticket-key> --contract         # + the GraphQL schema + fixture refresh
/qa-test <ticket-key> --coverage         # + tc:scope over the existing corpus
/qa-test <ticket-key> --axes             # all three
```

**Argument normalization — there is no argv parser, so state what you resolved.** This command is a prompt,
not a script: an ambiguous spelling is resolved by *reading*, so resolve it explicitly and say so in one
line before Step 1, rather than acting on a guess.

| Written | Read as | Note |
|---|---|---|
| `--iterate` | `--iterate --max-rounds 2` | 2 is the default |
| `--iterate N` / `--iterate=N` | `--iterate --max-rounds N` | the obvious intent; accept it, don't refuse |
| `--max-rounds N` with no `--iterate` | **`--iterate --max-rounds N`** | a round cap is meaningless without the loop |
| `--axes` | `--visual --contract --coverage` | all three; `layer` derives on both paths regardless |
| any axis flag on a FULL run | **no-op, say so in one line** | FULL already derives and runs all four |
| `--release-regression` | **no longer exists — say so in one line and continue.** Run the sweep deliberately with `/qa-regression` | removed 2026-09-10 with C2/`5r`; see §Execution order |
| a second bare token that is not a ticket key, `PR #N`, or a flag | **STOP and ask** | never silently fold it into the target or a flag value |

`--iterate` and `--epic` **compose** (the loop tries to fix a failing child story before the chain
continues). **No flag changes the FAST/FULL routing** — effort comes only from ticket type × status at
`1a`, and an axis is a lane trigger, never an effort trigger.

---

## Execution order — the labels do not sort, so here they are in order

Labels are a **citation contract** and are never renumbered. `1e-plan`/`2a`/`3x` are steps, not sub-items.

**`5r` (C2) and `5g` (promotion) were REMOVED 2026-09-10**, with `--release-regression`. Their labels are
**retired, never reused**. Neither capability was deleted, only its automatic place here: a release sweep
is a deliberate [`/qa-regression`](qa-regression.md) run, and promotion belongs to that command's
**Step 6.5** + [`/qa-test-lifecycle`](qa-test-lifecycle.md) **6P**. Rationale:
[`decisions`](../../docs/decisions/qa-test-evolution.md) §Removing 5r and 5g.

```
FAST   1a → 1b → 2 → [2a] → 3 → 4 → 5a → 5b → 5c → 5d → 5e → 5f → 5h
FULL   1a → 1b → 1r ‖ 1c ‖ 1d ‖ [1c-map] ‖ 2-load
                → 1e → 1e-plan → 2-topup → 2a
                → 3x  ‖  3a          ← discovery on one lane, seeding browserless beside it
                → B                  ← the checklist, written AFTER discovery has corrected the model
                → 3-exec ────────► 4a ‖ 4v                    ◄── FIRST TEST
                                  ‖ A → append → C1 scope → 3-cases ───► 4c (C1)
                       4a returns ─► CHECK A ─► (still authoring? wait) ─► 4c
                → 5a → 5b → 5c → 5d → 5e → 5f → 5h → [5h-map]
```

`[1c-map]` only when 2g resolves `ABSENT`/`unresolved` on an all-layer chain, and `[5h-map]` only when a map exists and the run verified something to write back — both FULL-only, both non-blocking ([`context-wave.md`](../skills/qa-test/context-wave.md) §1c-map · [`reporting.md`](../skills/qa-test/reporting.md) §5h-map). `[2a]` on FAST only under `--coverage`. On `--iterate`, `5k.0` (round entry) + 5a–5d repeat per round; 5e, 5f, 5h and 5h-map
fire once, at loop exit ([`skills/qa-test/modes.md`](../skills/qa-test/modes.md) §5k).

**Read the FULL shell as lanes that JOIN at 5a, not as a line.** The `‖` columns run at the same time;
only the arrows are ordered. **Execution is triggered by a CONDITION, not a step number** — *the checklist
exists AND its data resolves*, which is what `3-exec` checks — and **`A` runs in the background from that
same moment**. `1e` and `3x` stay ahead of the checklist deliberately; why, and what the reorder cost:
[`SKILL.md`](../skills/qa-test/SKILL.md) §Ordering · [`decisions`](../../docs/decisions/qa-test-evolution.md)
§Cutting time-to-first-test.

---


## Routing — two axes, decided at 1a

**Single source of truth for both matrices:**
[`.claude/knowledge/execution/ticket-routing.md`](../knowledge/execution/ticket-routing.md). **Cite it,
never restate it here.** `1a` resolves them and its own table carries the per-flow branch.

**A THIRD classifier, resolved at `1a` too** — the **`ui-kit` shape class** (§5c) for a design-system /
token-layer / component-primitive change. It changes neither flow nor effort, only what the resolved path
produces, and it is the one that fails CLOSED. Methodology:
[`skills/qa-test/ui-kit-class.md`](../skills/qa-test/ui-kit-class.md).

1. **FLOW** — which pipeline runs at all: `verify-fix` · `hotfix-verify` · `feature-test`.
2. **EFFORT** — FAST or FULL, **only** within `feature-test`. FULL for a new feature / Epic, P0–P1,
   cross-layer, ≥2 domains, a critical-revenue flow, or an unclear surface; FAST for a bug fix / copy-tweak /
   config / Technical task — or a `Review task` contribution whose PR diff is one-file and
   single-surface (`ticket-routing.md` §5a, which also defaults its `coverage` axis ON) — that is
   P2–P3, single-layer, single-domain, obvious surface. **A `Story` is FULL by default and downgrades to
   FAST only when it is narrow on all six §5b tokens** — and never on a surface whose purpose `2-map`
   reports `UNDECLARED`, because a Story is the only step that ever declares one. For a Story that
   downgrade is **provisional at `1a` and confirmed at the end of `1b`** (two tokens resolve there;
   `1b` is identical on both paths, so nothing has been skipped yet) and it moves one way only,
   FAST→FULL — record both in `summary.json.path_route`. **The tie-break when a token will not resolve is
   `ticket-routing.md` §5's, stated only there — read it rather than assuming which way it points.**

A `not-fixed` Bug takes `feature-test` **FAST** to reproduce and characterize the defect live with fresh
evidence — there is no fix to *verify* yet; state that the next step is `/qa-fix <ticket-key>`.

---


## The FAST path, in full

Stated once, completely. **Everything after this section is the FULL path.**

```
1a  route + fetch (comments + attachments, always)   → name the parent Epic in one line, no sibling
                                                       analysis; then the opening status hop
1b  pre-flight, sprint, duplicate check              → 2b layer + 2f data_surface always; the
                                                       prior-art read (2-map) is mandatory;
                                                       2c/2d/2e derive but do not RUN unless
                                                       their flag is passed
2   load the affected domains' BL-* AND ECL-* rule TEXT (the agent prompt contract requires both);
    route ONE execution agent. Stop there.
3   Artifact B checklist (conditions from 1a's ACs) + C1 scope — on FAST the exact set is the
    2a REPAIR + RE-BASE ids only, complete at 2a — + 3a ONLY when 2f said so
    → the 3-exec gate (inline) is what releases execution, here as on FULL
4   ONE execution agent runs the checklist; then C1 — the exact-set run of every case 2a REPAIRed
    or RE-BASEd (skipped entirely, and said so, when there are none). No 1r pass: FAST reaches 4 in minutes,
    so a separate reachability probe would cost more than the wait it removes
5a  triage · 5b reconcile AC/DoD · 5c verdict · 5d file · 5e report · 5f status · 5h docs
```

**FAST is one execution agent.** That is the promise, and it is now kept: **three** of the five derived
axes are **opt-in** here — `--visual` · `--contract` · `--coverage` · `--axes` — and off by default.
`layer` (2b), `data_surface` (2f) and `domain_map` (2g) derive and apply on both paths, because none can
add an agent **to a FAST run**: 2b dispatches nothing, 2f can only ever *remove* a dispatch, and **2g on
FAST recommends a command the operator may decline and dispatches nothing.** On FULL, 2g's `ABSENT` +
all-layer case dispatches the map build beside `1c` (item `1c-map`) — a **FULL-only** addition made in the
wave that was already running two agents, so the FAST promise is untouched. **The opt-in three still *derive*** (each
token and its sources are recorded, so a `false` is auditable); without their flag, none of the three *runs*.

**`5r`/C2 was the largest breach of that promise and was removed outright** (2026-09-10) — a whole suite
selection, ~24 dispatches, **93% of a FAST run's tokens**, for a *release* answer `5c` never depended on.
A release sweep is now a deliberate [`/qa-regression`](qa-regression.md) run; reach beats diff size when
deciding to run one ([`ticket-routing.md`](../knowledge/execution/ticket-routing.md) §5a). Why the axes
had to be cut back at all: [`SKILL.md`](../skills/qa-test/SKILL.md) §Effort routing ·
[`axes.md`](../skills/qa-test/axes.md) §4.

**Not run on FAST:** `1c`/`1d` agents · `1r` · the `1e` Test Model and `1e-plan` · the archetype/UIP/`VC-*`
sweeps · Artifact A authoring (so **no new cases and no new regression coverage** — the route back in is
`/qa-test-lifecycle`) · **the `3x` discovery lane**, FULL-only even under a flag because most of its
outputs consume a model and an authoring batch and FAST has neither
([`exploratory-lane.md`](../skills/qa-test/exploratory-lane.md) §2) · every independent verifier dispatch
(each gate self-checks inline) · the three opt-in axes unless their flag is passed.

**Still run on FAST, and load-bearing:** the `BL-*` **and `ECL-*`** rule text (without it a FAST verdict is
ungrounded, not merely cheap) · ticket comments and attachments · the `2-map` prior-art read · **`2b`
`layer`** (5f/5h need it, it dispatches nothing) · **`2f` `data_surface`** (can only *remove* a dispatch) ·
`5b` (it produces the verdict) · the committed `testing-checklist.md`, the run's **only** durable record ·
**`5h`**, whose refusal set makes it free.

**`--iterate` is valid on FAST and earns most here.** No authored cases, so round N+1 re-runs the **failed
checklist items**, and the checklist is **appended to** per round, never overwritten — it is FAST's only
durable record, so rewriting a round-1 FAIL as a round-2 PASS deletes the proof the defect existed. The
verifier re-ratification stays off, as at every other FAST gate.

**`5k.0` round entry runs on FAST too — and it is the path that needs it most.** Every bug a FAST round
files comes off a **checklist item**, so it carries no case id and nothing in the RED→GREEN set can ever
speak for it; an inline `/qa-verify-fix` per fix-ready sub-task is the only way such a bug is ever
verified or closed. It is not an exception to FAST's one-execution-agent promise for the same reason the
contract axis is not: the bugs are verified through the flow `1a` already runs inline, not by a new lane.

**Gate (FAST, inline):** the checklist covers every atomic condition; `npm run td:validate` is green; **and
when `--coverage` ran**, every Step-2a `tc:scope` hit is disposed (`REPAIR` fixed **and re-linted with
`suites:review`**, **both `REPAIR` and `RE-BASE` in C1's `--ids`**). No `suites:review` otherwise — FAST authors nothing.

---


## Quality gates — FULL path

A step passes its gate or **STOPS**. **Two** are hard-STOP gates verified by a **fresh
`qa-lead-orchestrator` in §Verifier Mode** — Step 3 and 5b; 5e's is a third verifier dispatch that is
**non-blocking**. Every other gate, and the whole FAST path, self-checks inline. (It was three hard STOPs
until `5g` promotion left the pipeline on 2026-09-10.)

| Gate | Where | Verified by |
|---|---|---|
| Reachable at all | 1r (FULL) | inline — **never a PASS/FAIL on the ticket**; `BLOCKED` ends the run early |
| Model complete | 1e (12 clauses) | inline (doer's own check) |
| Existing coverage disposed | Step 2a | inline — re-derived at `3-cases` (`tc:scope`, same args) |
| Discovery folded in | Step 3x (FULL) | inline — never blocks; unreached charter items are named |
| **Checklist + data ready** | **`3-exec`** | **inline** — releases 4a. `npm run verify:gate -- --gate 3-exec` (no `--suite`: nothing is authored yet) |
| **Authored cases reviewed, PENDING-A closed** | **`3-cases`** | **fresh `qa-lead` verifier — hard STOP.** Releases 4c |
| Execution evidenced | Step 4 | inline |
| **Triage + AC/DoD sound** | 5b | **fresh `qa-lead` verifier — hard STOP** |
| Filing sound | 5d | inline |
| Feature Release Gate ratified | 5e | fresh `qa-lead` verifier |

**Loop = 1 round:** `REJECT → REASONS + FIX → the step's doer fixes → re-verify once`. Still not APPROVE →
**STOP** for a human. What makes the verifier independent, and why it is never the step's own doer:
[`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) §The verifier. Diagram: `docs/qa-test-flow.md`.

---

## Step 1 — Gather Context, Story & Test Model

Five ordered sub-parts; each consumes the one before it, so don't reorder. Story analysis is **part of this
step**: its AC table is a field of the Test Model, the single hand-off to `test-management-specialist`.

### 1a — Fetch the scope, classify type × status, route

**Fetch first** — every later sub-part depends on these fields. Detail, and the reason each item is
mandatory: [`skills/qa-test/preflight.md`](../skills/qa-test/preflight.md) §1a.

- **The ticket** (tracker MCP; not configured → ask the user to paste it) + any **linked PR** (diff + files).
- **The comments and the attachments — both paths, always.** The description is the plan; the comments are
  what actually happened, and an attachment is primary evidence that must be **opened**, not noted. An
  attachment that cannot be fetched is a **stated gap**, never a silent skip.
- **The parent Epic** (FULL; one line on FAST) — Done siblings are the integration surface, in-progress ones
  are dependencies.
- **The affected domain(s)** — mapped to the `/qa-checklist` domains.

**Then classify and route.** Normalize the **type** and the **status role** (`fix-ready` / `hotfix-ready` /
`not-fixed` / `testable`, resolved **live** — never a hardcoded status name), then look up the **FLOW** and,
for `feature-test`, the **EFFORT**, then the **SHAPE CLASS** (§5c) off the same diff read.
`ticket-routing.md` owns all three — **cite it, never restate it.** Record **flow + type + path +
`summary.json.shape_class`**; all four are `summary.json` fields persisted at 5e.3. Fail-safe: unresolvable
→ `feature-test` FULL; when in doubt → FULL — **except the shape class, which fails closed** (§5c).

| Flow | Then |
|---|---|
| `feature-test` | continue to `1b` and run the pipeline at the resolved effort — the rest of this document. A `ui-kit` shape class changes what that path produces (§5c) |
| `verify-fix` | **run `/qa-verify-fix` inline — execute its Steps 0–7 as written** ([`qa-verify-fix.md`](qa-verify-fix.md)). Steps 2–5 do not run. **Fail-safe:** a `fix-ready` Bug with no STR *and* no linked fix PR has nothing to prove RED→GREEN against → fall back to `feature-test` FAST and note the missing repro basis |
| `hotfix-verify` | **STOP** — `Run /qa-hotfix-check <ticket-key>`. File nothing; transition nothing |
| a **Sub-task** | resolve the parent and re-enter this classification as the **parent's** type × status |

**Then, on the `feature-test` branch only: move the ticket to the in-testing status — the OPENING HOP.**
`qa-lead` makes it, **no confirmation**: it is the direct, reversible consequence of the operator invoking
this command, and on Jira it is also the precondition both closing transitions need. The full state
machine — the two hops, the confirmation asymmetry, the per-verdict closing table, the `--iterate` rule,
the Azure behaviour and the mandatory record — is
[`knowledge/execution/ticket-status-transitions.md`](../knowledge/execution/ticket-status-transitions.md).
**Cite it; do not restate it.**

**It sits HERE, after routing, and not at Step 4 where it used to.** *In testing* means **QA owns this
ticket now**, which is true the moment the run is accepted — not when the first browser opens. At Step 4
the ticket sat in READY FOR TEST through `1a`–`3` (context, the Test Model, authoring, seeding, the
discovery lane): 30+ minutes of real QA work during which the board said nobody had picked it up, and
nothing stopped a teammate picking it up for real — the `1b` duplicate check guards only against *this
pipeline* re-testing the same ticket within 2 h. A STOP before Step 4 (Step 3 is a hard-STOP gate) now
leaves the ticket in-testing **with a comment saying why nobody is testing it**, which is the honest
state and the same shape as a `BLOCKED` verdict.

**After routing is load-bearing, not incidental:** `verify-fix` owns its own close-out (two flows
transitioning one ticket is how a ticket gets moved twice for one run) and `hotfix-verify` transitions
nothing. The skips are unchanged — tracker MCP unconfigured, already in-testing, no such transition
exists, or the target is a bare feature name / PR.

**Record the hop, or the skip with its reason, in `summary.json.status_transitions[]`** (`at: "1a"`) —
before this record existed, a skipped transition left no trace in any artifact, so "never moved" and
"moved, note lost" were indistinguishable afterwards.

#### 1b — Pre-flight, sprint resolution & duplicate check

**TWO I/O waves, not nine sequential steps** — the round-trip is the unit being saved
([`SKILL.md`](../skills/qa-test/SKILL.md) §Concurrency). Item detail and the reason each exists:
[`preflight.md`](../skills/qa-test/preflight.md) §1b.

| Wave | Issue in ONE message |
|---|---|
| **A** | 1 env health (`/qa-env-check endpoints`) · 2 build & version — `declared` from `vc-deploy-dev`, then the `GET {{BACK_URL}}/api/platform/modules` probe for **`deployed`**, which is ground truth (a failed probe records `UNKNOWN`, **never** falls back to `declared`) · 2-release the release-ledger Δ · **2-map** the functionality map (below) · 2b's local reads · 3 sprint resolve → 4 duplicate check (glob `reports/tickets/*/*/summary.json` across **all** sprints, 2 h window) |
| *(no I/O)* | derive the **six** axes — see below. **2g `domain_map` derives FIRST**, because `2-map` in wave A consumes it to decide what to read |
| **B** | 2d's two refreshers **and** 2e's `tc:scope` scan (scope + risk terms only) **and** 2f's `td:validate` resolution check, concurrently |

**Three consequences of 2-release, which is why it is a step and not a header field:** a **⚠ BREAKING**
change in the component under test **forces FULL** whatever `1a` scored · it gives `1d`'s otherwise-static
AC↔implementation check a third leg · **released ≠ deployed** — a capability the ledger records that the
probe does not carry is `NOT_DEPLOYED` → BLOCKED-on-deploy, never a FAIL and never a filed bug, and the
ledger carries no behaviour so it can never ground an assertion as `{DOC}`.

**2-map — read what already exists on this surface. MANDATORY, both paths.** Two reads, in this order, and
the order is the point: **the DOMAIN MAP first, then the per-ticket prior art.** Read order is decided by
the `domain_map` token (2g), not by prose — the axis derives before this item runs and its four states each
say what to do. Full item, the bibliography, the `Test object` block and the `UNDECLARED` rule:
[`preflight.md`](../skills/qa-test/preflight.md) §2-map. Contract and fail direction:
[`axes.md`](../skills/qa-test/axes.md) §2g. Record the block; **`null` means the axis never ran, which is a
gap, not `ABSENT`.**

Four things it must leave behind, each consumed by a named later step:

| It produces | Consumed by | The rule that makes it load-bearing |
|---|---|---|
| the **domain map** read (or `ABSENT`) | `1e` clauses 11 / 11b | **FULL builds a missing map** at `1c-map`; **FAST recommends and proceeds**. `STALE` is never auto-refreshed. Nothing here blocks |
| the **bibliography** — prior BA analysis · prior test model · domain-knowledge docs · tickets already tested here | the `1c` brief, as **paths to read** | so `ba-system-analyzer` starts from the prior analysis instead of re-deriving it |
| the **`Test object` block** — purpose · operations · data · variants · constraints | `1e`'s condition space | *you cannot design an experiment on an object whose properties you do not know.* A `1e` that skips it enumerates screens — the measured Loyalty Missions failure (127 cases, 71 placing zero orders, the mechanism end-to-end at 11%) |
| an `UNDECLARED` purpose | `1e` (FULL) / the checklist (FAST) | **`UNDECLARED` is the run's FIRST finding, not a blank** (measured: 1 of 13 domains has a declared purpose) |

**Both reads are pointer indexes, never behaviour** — neither can ground an assertion as `{DOC}` — and
**every entry is DATED because every entry may be stale**: prior art is a hypothesis, confirmed against the
`2-release` ledger Δ *since that document's date* plus a live check before anything is built on it. Reading
a stale deliverable and repeating it is worse than reading none, because it arrives with a written
deliverable's authority.

**PR testing:** confirm the PR's artifact version is deployed; if not → offer `/qa-deploy-pr <ticket-key>`
(**ask first**) or warn and ask whether to wait.

#### 1r · 1c · 1c-map · 1d — the context wave (FULL only, ONE message)

All four are dispatched in the **same message** as `2-load` — each consumes only `1a`'s fetch, so they are
separate lanes, not separate waves. Briefs, returns and the rules that decide what each one carries:
[`skills/qa-test/context-wave.md`](../skills/qa-test/context-wave.md).

| Item | Agent / lane | Runs when | Returns | Gate + record |
|---|---|---|---|---|
| **`1r`** reachability | a specialist, one free lane, **~5 min cap** | always on FULL | `REACHABLE` or `BLOCKED(<reason>)`, **nothing else** | **Never evidence for `5c`** — a green `1r` is not a passing condition. On `BLOCKED`: **stop deriving now** — `TaskStop` `3a` and any authoring, record what was aborted, go straight to `5c` BLOCKED → 5e → 5f (no transition, blocker comment required). It never blocks `1c`/`1d`. Record `timing.reachability_minutes` + a one-line verdict; `null` on FULL is a gap, not a zero |
| **`1c`** ticket context | `ba-system-analyzer` (read-only), `playwright-firefox` | always on FULL | existing functionality **first** · the **test object** · affected surface · surfaces the domain map omits · related flows · known pain points · docs grounding | Feeds `1e`'s condition space. **Never edits the domain map** — `5h-map` does that once, after the verdict. On internal error, gather context inline rather than retrying the delegation |
| **`1c-map`** build the map | `ba-system-analyzer`, a **different** free lane | **all four**: FULL · state `ABSENT`/`unresolved` · `all_layer_chain: true` · `STALE` is never auto-refreshed | a new `knowledge/domain/<slug>.md` | Joins **before `1e`**; the run never waits past that. Any failure ⇒ `build_outcome: FAILED`, `state` stays `ABSENT`, proceed as FAST does. **Nothing here blocks, delays a verdict, or becomes a finding about the product** |
| **`1d`** story review | `ba-story-writer` (Mode B — analyze only) | a ticket **with ACs**; else skip with a one-line note | AC quality scorecard · weak sides · AC↔implementation coverage · gap analysis · an AC→test traceability seed · the DoD checklist | **Advisory, never blocking.** Surface the findings inline and **proceed**; a static-diff finding is a suspicion, not a defect. Carry every DRIFT/NOT-FOUND/CONTRADICTS into execution to verify **live** at 5b. The traceability table and DoD stay terminal-only (`.claude/rules/reports.md` §1) |

**Two brief rules that cost a run when they were missed** — the full argument is in `context-wave.md`:
the `1c` brief carries the GraphQL contract's **rev, not its path** (a snapshot of unknown age makes the
agent report every field as unverified, so it guesses), and **`BL-*`/`ECL-*` travel as TEXT while prior art
travels as PATHS** — a digest would pre-answer the triangulation `1c` exists to perform
([`skills/qa-test/dispatch-pack.md`](../skills/qa-test/dispatch-pack.md)).
### 1e — Build the Test Model (FULL only)

Distil `1c` + `1d` + `1a` into the **fault model** Step 3 authors cases from, written to
`reports/ba/test-models/<TICKET>-<date>.md`. **Part 0 — the value chain — is derived FIRST** and drawn in
Mermaid; the condition space is built per link on top of it.

**Shape:** [`.claude/templates/test-model.md`](../templates/test-model.md). **Methodology, the eight rules
the scenario table must satisfy, the twelve-clause gate and the worked references:**
[`skills/qa-test/test-model.md`](../skills/qa-test/test-model.md). Read the latter before writing the model —
the gate below is only its checklist.

**Gate (inline, 12 clauses — every one contradictable):** flow/type/path set + atomic conditions + BL/ECL/
domains/risk areas · `Value chain` complete **with the `flowchart` in the file** · `Mechanism coverage
matrix` with **no blank cells** + `Reverse edges` resolved · **the matrix's AXES are derived from the
mechanism, not from the scenario table** (see below) · first scenario row is the `Technique:FLOW`
journey · `Condition space` states factors, classes, constraints and raw N · `Reduction` states `N → M` **and
names what it dropped** · every row carries all five (cell · defect hypothesis · archetype · technique ·
oracle) · every oracle is `{BL}`/`{SPEC}`/`{DOC}` or says what would make it one · the `Archetype sweep`,
`UIP sweep` and `Probes carried in` rows are **PRESENT** in the model · **11 `Chain position` states this
ticket's chain as a SLICE of the domain chain — the links it touches AND the links it does not** ·
**11b every matrix VARIANT resolves to a surface the domain map enumerates.**

**Clauses 11 and 11b read the `domain_map` token (2g); they never re-derive it.** `PRESENT`/`STALE` ⇒ both
bind against the map's inventory (on `STALE`, a variant resolving only to a stale surface is recorded as
such, not confirmed). **A map `1c-map` built in this run is `PRESENT` from the join** and binds like any
other — record `built_in_run: true`. `ABSENT`/`unresolved` ⇒ both are satisfied by recording
`Domain map: ABSENT — chain position unverified`; absence is **written down, not blocked**.
**`1e` also CONFIRMS 2g's provisional all-layer answer** — Part 0 now exists, so set
`all_layer_confirmed_at: "1e-confirmed"` and correct `all_layer_chain` if the chain disagrees with the
`1b` guess. That correction is the axis working, not a defect.

**Clauses 11, 11b and 4 each exist because a measured run passed every OTHER clause** — VCST-5317 (a
complete matrix covering one predicate of a 35-suite feature, which also authored a Critical case asserting
the ABSENCE of a component that does exist) and VCST-5735 (a matrix populated from its own scenario list,
so complete by construction). The argument for all three, and what to re-derive after any rewrite of the
scenario table: [`test-model.md`](../skills/qa-test/test-model.md) §Why clauses.


### 1e-plan — emit the scenario matrix as an authoring plan

The model is prose and nothing lints it; its scenario **rows** are structured. Write them out as one
**authoring plan JSON per target suite** (scratchpad, not `reports/`) and run the gate:

```bash
npm run tc:scaffold -- --plan <scratchpad>/plan-<layer>.json --check
```

It refuses any row that cannot answer the three KEEP questions — `observable` (what value it READS),
`defect` (what a CUSTOMER would see, no null-hypothesis phrasing), `plausible` (a `VC-*` entry, a filed bug,
or `mechanism: …`). **This is `/qa-test-cases-generator` §6d's cull, moved to before the case is written.**
The plan also carries the sweeps. Field-by-field rules:
[`skills/qa-test/authoring.md`](../skills/qa-test/authoring.md) §Scaffold before authoring.

---

## Step 2 — Plan

Enrich the Step-1 model with the knowledge it doesn't carry, then route agents. Per-source detail and the
sweep-resolution rules: [`skills/qa-test/authoring.md`](../skills/qa-test/authoring.md) §Step 2. Agent
routing: [`SKILL.md`](../skills/qa-test/SKILL.md) §Agent dispatch.

**Two halves, and only the second is ordered after `1c`.** The oracle *text* is keyed on `1a`'s domains and
`1b`'s derived tokens and consumes nothing `1c`/`1d` produce — so **load it in the SAME message that
dispatches `1c ‖ 1d`** (**2-load**) rather than spending a whole dispatch wave before opening a markdown
file. Only the VirtoOZ top-up (**2-topup**) is genuinely downstream: it fills the gaps `ba-system-analyzer`
left, and asking before knowing what those are fetches the same docs twice.

**2-load** — the actual rule **text and patterns**, never just IDs:

| Always | `business-logic.md` `BL-*` · `e-commerce-edge-cases-library.md` `ECL-*` · the domain checklists via `/qa-checklist` · `skills/qa-plan/e2e-scenario-catalog.md` `E2E-*` (the suite-traceability backbone for the regression corpus) · `oracles/vc-bug-catalog.md` `VC-*` — each entry's `Detection probe` is a ready-made scenario |
|---|---|
| **`visual_surface`** | `BL-UI-*` **and `BL-A11Y-001..004`** · `critical-ui-scope.md` · `qa-design` §State-Stress · the generated selectors **and** design tokens · `modern-web-attack-surface.md` §`UIP-*` |
| **`contract_surface`** | the **refreshed** `api/graphql-schema.md` · `api/graphql-test-cases-runner.md` · the `test-data/graphql/index.json` fixture inventory — read it **before** proposing a new fixture (74 ops exist, each with its `usedBy[]`) |

**2-topup** — then VirtoOZ via `/vc-docs`, **skipped when `1c` delegated to `ba-system-analyzer`**; top up
specific gaps only.

**Gate (inline) — FAST:** the domains' `BL-*` **and `ECL-*`** text is loaded (the agent prompt contract
requires both) and one execution agent is routed. The sweeps do not apply — FAST writes no model, so there
is no matrix to resolve into.

**FULL, additionally:** every domain's `BL-*`/`ECL-*`/`E2E-*`/`VC-*` loaded and an agent routed; **every
in-domain defect-shaped `VC-*` is a scenario row or an explicit N/A**; the `Archetype sweep` resolved;
**when `visual_surface`** the `UIP sweep` resolved, the UI + a11y oracles loaded, the visual lane routed;
**when `contract_surface`** the schema loaded here is the one 2d refreshed (or its `UNKNOWN` carried
forward). **Self-checked inline, and nothing downstream re-checks it** — Step 3's gate re-derives the
*artifacts* and the model↔case coverage, never the sweeps or which schema was loaded. This is the only
place they are verified.

---


## Step 2a — Triage existing coverage

**FULL always; FAST only under `--coverage`.** The **scan** ran in wave B; **this step disposes each hit**,
which is what needs Step 2's loaded `BL-*`/`ECL-*` text. It runs **before Step 3** — authoring has to know
which existing rows it is *amending* before it writes a new one. Why the step exists, what `runFate` means,
and why a `RE-BASE` is resolved BY the run rather than before it:
[`skills/qa-test/coverage-triage.md`](../skills/qa-test/coverage-triage.md). **Cite it; do not restate it.**

```bash
npm run tc:scope -- --domain <d>[,<d>] --observable "<phrase>" [--observable "<phrase>"] \
  --oracle <ID>[,<ID>] [--json]          # scope + risk terms ONLY — no --cases / --also-ids
```

Scope needs ≥1 of `--domain`/`--suite`/`--module`; risk terms ≥1 of `--observable` (**one phrase per
flag**)/`--oracle`. **No `--cases`/`--also-ids`** — they model what will execute and neither input exists
yet (Artifact A is Step 3; the `RE-BASE` ids are this step's own output). Run-fate is predicted at the
**Step-3 gate re-run**. Exit `0` = a worklist (empty included) · `1` = bad usage · `2` = a `--suite` could
not be scanned. A legacy 11-column suite is **refused, never scanned** → `unscannable[]`.

**`runFate` is the column this step exists for:** `WILL_RUN` is self-announcing (a C1 row goes red at Step
4) · **`FILTERED_OUT`
is invisible forever unless disposed here — this is the coverage hole** · `NOT_EXECUTING` (explicit
`Manual`/`Deprecated`) is opted out **by intent**, not a hole.

**Dispose every hit — a closed four-value vocabulary:**

| Disposition | Means | Action |
|---|---|---|
| `CONFIRMED` | still correct under the change | nothing |
| `REPAIR` | the row's **mechanics** are stale — renamed selector, moved route, removed arg, dead `@td()` alias — so it cannot execute at all | **fix BEFORE the run**: `/qa-review-tests file <path-to-suite.csv> --fix`, then re-lint |
| `RE-BASE` | the row's **expected value** conflicts with the change | **do NOT rewrite.** Keep the old assertion, carry the row into **C1's `--ids`**, let `4c` execute it |
| `SUPERSEDED` | the change removes the surface the row asserts | **proposal only** — retirement is human (TRI-006) |

**The `REPAIR`/`RE-BASE` split is the load-bearing rule:** the change under test is normally an **unmerged
PR**, so rewriting an expected value *before* the run makes the change its own oracle and the case can then
only pass. `REPAIR` is safe because it moves the **mechanics and not the oracle**.

**Gate (inline):** every hit disposed; every `REPAIR` applied **and re-linted**; every `RE-BASE` in C1's
`--ids` or re-dispositioned **with a reason**; every `unscannable[]` suite and `unmatchedObservables[]` term
**stated**. **This step files no bug** — a hit is a claim about a test case, never about the product; and
`neverAudited` is context, not a verdict. Re-verified at Step 3's hard-STOP gate.

---


## Step 3 — Write, Review & Provision

**`3x` and `3a` go out together; the checklist is written from what `3x` brings back; `A` is
BACKGROUNDED.** That order is the whole restructure, and each arrow earns its place:

```
1e ──► 3x  (discovery, 1 lane, 30-60 min box by scope)  ─┐
       3a  (seeding, BROWSERLESS, beside it) ─┴──► B ──► 3-exec ──► 4a ‖ 4v   ◄── the checklist runs
                                                             └────► A (background) ──► 3-cases ──► 4c
```

Three rules hold this order, and the reasoning for each is in
[`SKILL.md`](../skills/qa-test/SKILL.md) §Ordering:

- **`3x` before `B`** — the checklist carries what discovery *observed*, not what the ACs guessed.
- **`3a` BESIDE `3x`, never after** — `test-data-engineer` is browserless, so seeding fits inside the
  discovery box for free. A fixture need `3x` or `1e-plan` surfaces is a **top-up re-dispatch**, never a
  re-run and never a seeder authored inline ([`authoring.md`](../skills/qa-test/authoring.md) §3a).
- **`A` still waits for both `3a` and `3x`** (never-parallelise, [`SKILL.md`](../skills/qa-test/SKILL.md)
  §Concurrency). What changed is that **nothing waits for `A` to finish except `4c`**.

| | Artifact | Owner | Lands |
|---|---|---|---|
| **3a** | Test data — **conditional on `data_surface`**, dispatched **beside `3x`** (browserless, so the seed runs inside the discovery box) | when `true`: **the orchestrator dispatches `test-data-engineer`** (`/qa-generate-data` → `/qa-seed-data`), never sub-delegated. When `false`: **no dispatch**, and the run names the fixtures that cover the plan | `true` → seeded env, green `td:validate`. `false` → every planned case resolves against existing `@td()`/`{{VAR}}` data **or is live-discoverable**, **and** no chain link under test needs a divergence those values lack ([`authoring.md`](../skills/qa-test/authoring.md) §3a) |
| **3x** | Discovery session (FULL only) | **orchestrator invokes `/qa-exploratory ticket <ticket-key>`** — that command owns the session; this pipeline owns only the charter | model amendments + `summary.json.discovery` + `reports/exploratory/SBTM-<ticket-key>-<date>.md` |
| **A** | Test cases (FULL only) | `test-management-specialist` | `regression/suites/<layer>/<module>/*.csv` as **`Draft`, and they STAY `Draft`** — `/qa-test` no longer promotes (`5g` removed 2026-09-10). The `Draft → Automated` flip happens **outside this run**: [`/qa-test-lifecycle`](qa-test-lifecycle.md) 6P, or a later **direct** [`/qa-regression`](qa-regression.md) at its Step 6.5 |
| **B** | Testing checklist (both paths) — written **after `3x` returns**, so it carries what discovery observed and not only what the ACs named. **One checklist, one execution pass** | `test-management-specialist`, or the orchestrator inline for a single-surface tweak | `reports/tickets/{SPRINT}/<ticket-key>/testing-checklist.md` |
| **C1** | Ticket regression — **the exact set: every case this run wrote or changed** | orchestrator | scope assembled **at A's append** (§C1 — the exact set); one `/qa-regression … --ids` run, executed at `4c` |

**There is no C2.** The change-scoped Critical sweep was removed with `5r` (2026-09-10): it answered a
*release* question, not this ticket's, at ~24 runner dispatches. Cutting a release means running
[`/qa-regression`](qa-regression.md) deliberately — this pipeline no longer decides that for you.

#### C1 — the exact set: every case this run WROTE or CHANGED

**Three id sources, and they become available at different moments.** That is why the scope is a named
step rather than something assembled in passing:

| Source | Disposition | Available at | Why it must execute |
|---|---|---|---|
| **New `Draft` ids** | authored by `A` | **A's append** | a case that never ran is not coverage; it is an untested claim in the corpus |
| **`REPAIR` ids** | fixed **before** the run — a renamed selector, a moved route, a dead `@td()` alias | **`2a`** | **the fix is unverified until it runs.** A repaired case that never executes is exactly the invisible class `2a` exists to find, re-created one step later |
| **`RE-BASE` ids** | assertion kept, resolved **by** the run at 5a | **`2a`** | its old assertion, executed against the change, is the run's most strongly grounded check ([`coverage-triage.md`](../skills/qa-test/coverage-triage.md) §3a) |

**One rule covers all three: *this run wrote or changed it, so this run runs it.*** (`REPAIR` was added
2026-09-10 — [`coverage-triage.md`](../skills/qa-test/coverage-triage.md) §3b.) The scope is assembled
**at A's append**, the first moment all three halves exist, as **one run and one `RUN_ID`** — 5a triages a
single run and promotion grounds `{OBSERVED}` against a single `RUN_ID`.

**When `A` authors nothing, C1's set is complete at `2a`** — the `REPAIR`/`RE-BASE` ids alone — and
`3-cases` has no rows to rule on. **Dispatch C1 then, alongside `4a`, rather than waiting for a gate with
nothing to gate.** State that this is what happened; a C1 that ran early for this reason is not a skipped
gate. **FAST always takes this path**, since it authors no cases.

**An empty set is a SKIP, stated.** No new cases, no `REPAIR`, no `RE-BASE` ⇒ no C1 — say so with the
reason. An omitted C1 reads exactly like a passing one.

#### 3-exec — the gate that releases execution (inline, both paths)

**Run it the moment `B` and `3a` are both done. It is the trigger.** `npm run verify:gate -- --gate 3-exec`
— **no `--suite`**, because Artifact A does not exist yet and that is the point.

| Clause | Met when |
|---|---|
| **Coverage** | every atomic condition maps to a checklist item, an **existing** case, or an explicit **`PENDING-A`** |
| **Data** | `npm run td:validate` green, **and** every fixture the checklist names resolves *right now* — declared is not seeded |
| **Disposition** | every `2a` `tc:scope` hit is disposed — `REPAIR` fixed **and re-linted**, and **both `REPAIR` and `RE-BASE` carried into C1's `--ids`** (§C1). `2a` precedes this gate on both paths, so "not run yet" is not an available answer — a skipped `2a` is stated as skipped |

**`PENDING-A` is a real disposition, not a waiver.** It means *"this condition's covering case is an
Artifact-A row that is still being authored."* It is legal here and **mandatory to close at `3-cases`**,
where the verifier checks that each one now resolves to a real appended row. A `PENDING-A` that survives
`3-cases` is a REJECT, not a note.

**Inline, deliberately — no fresh-verifier dispatch.** Every clause is a script or a list comparison, and
a dispatch here would re-create the wait the restructure removes.

#### 3-cases — the corpus-write gate (fresh `qa-lead` verifier, hard STOP)

Everything that needs the authored rows to exist: `suites:review` 11-dim green with **0 Blocker/Critical**
· each case's Steps actually exercise the condition its title claims · **every `PENDING-A` from `3-exec`
now resolves to a real row** · `tc:scope`'s scope and risk terms match the ones `1b` item 2e derived · when
`data_surface` was `false`, the skip re-derived. `npm run verify:gate -- --gate 3 --suite <csv>`.

**It releases `4c` (C1) and nothing else.** The verdict's own evidence is already being gathered by `4a`
while this gate runs — which is why it can be a hard STOP without holding the run.

#### 3x — the discovery lane (FULL only)

**Explore the model before authoring against it.** The pipeline derives for four steps and never looks at
the running feature until Step 4 executes cases that are already written — so the model's `{HYPOTHESIS}`
oracles, its `GAP` cells, its unresolved reverse edges, `1d`'s DRIFT ACs and Step-2a's `RE-BASE` rows all
reach authoring as guesses. This lane spends **one browser lane for a scope-sized 30-60 minutes, inside time 3a is
already spending**, to turn them into observations first.

**Invoke `/qa-exploratory ticket <ticket-key>`** — its `ticket` charter mode. **This pipeline supplies the
CHARTER; that command runs the SESSION.** Deliberately *not* the visual lane's pattern: `/qa-design` is only
a shell over its agent, whereas `/qa-exploratory` is where the substance is. The charter is derived from
**five sources and nothing else** (unresolved matrix cells · reverse edges · `{HYPOTHESIS}` oracles · `1d`
DRIFT ACs · `RE-BASE` rows), and `ticket` mode **STOPs without a model** rather than improvising.

Four outputs, each routed — **model amendments** (amend, never fork) · **`{HYPOTHESIS}` → `{OBSERVED}`
grounding** per row · **net-new scenarios** with a `Fate`, where `PROMOTE` means authored **in this run** ·
**Oracle Feedback** as proposals. **The lane files no bugs.**

**It never blocks:** the box is hard and Artifact A proceeds on what returned. Every charter source is
**covered or `NOT REACHED + reason`**, a skip is stated, and `summary.json.discovery = null` means the lane
never ran — an empty findings array means it ran and found nothing.

Charter payload, gate and record:
[`skills/qa-test/exploratory-lane.md`](../skills/qa-test/exploratory-lane.md). **Cite it; do not restate it.**

---


## Step 4 — Execute

Read env URLs from `config.js`. **Record the test-window start timestamp** — the interval until agents
return is the App Insights correlation window (5a).

**The opening hop has already happened** — `1a` moved the ticket to in-testing the moment the
`feature-test` route was resolved, so nothing transitions here. If that hop was skipped (no tracker MCP,
a bare feature name, a PR), it stays skipped; 5f does it before closing if Jira needs the reachability.

**Step 4 is no longer a phase that starts after Step 3 — it is three tracks, each released by its own
gate.** `4a` fires as soon as `3-exec` approves, which on FULL is **while case authoring is still
running**.

| | Track | Released by | Notes |
|---|---|---|---|
| **4a** | **Checklist** — the applicable specialist agent(s), **in a single message**, running **Artifact B and nothing else** | `3-exec` | **FAST = one agent.** Prompt contract: [`SKILL.md`](../skills/qa-test/SKILL.md) §Agent dispatch. **Record `timing.time_to_first_test_minutes` at this dispatch** — it is the number this structure exists to move |
| **4v** | **Visual lane** — `ui-ux-expert` on Chrome DevTools MCP, in the **same message** as 4a | `3-exec` | FULL when `visual_surface: true`; FAST only under `--visual`/`--axes`. **Dispatch the agent, never invoke `/qa-design`.** Axes, targets, the two things the brief must carry, verdicts, the SKIPPED rule: [`visual-axis.md`](../skills/qa-test/visual-axis.md). Writes `design-report.md` + `summary.json.visual` |
| **4c** | **C1** — `/qa-regression <suite ids> --ids <new Draft ids + every REPAIR id + every RE-BASE id> --no-promote` | `3-cases` — **or `2a` when `A` authored nothing** (§C1) | Its own run; capture `RUN_ID` + wall-clock. **`--no-promote` is mandatory** — it suppresses `/qa-regression` Step 6.5, which would otherwise promote minutes-old cases from inside the run that authored them, re-creating the placement `5g`'s removal fixed. **Skip C1 saying so when the exact set is empty** — an omitted C1 must not read as a passing one |

**The specialist agent no longer runs the Artifact-A rows.** It ran them *and* `4c` ran them, so every
authored case executed twice — and only `4c` emits the `RUN_ID` that promotion needs, so the agent's copy
grounded nothing ([`regression-promotion.md`](../knowledge/execution/regression-promotion.md)). **Track 4a is the checklist's home;
`4c` is the cases'.** The Scope line in the agent brief now reads *"run ONLY the checklist above"* on both
paths.

### When 4a returns, CHECK THE AUTHORING AGENT — the join is a step, not an assumption

**Backgrounding `A` only works if something explicitly comes back for it.** The moment `4a` returns, the
orchestrator's next act is to establish where authoring stands, and say so:

| `A`'s state | Do |
|---|---|
| **complete** | append (serially, one `suites:sync`) → assemble C1's scope → `3-cases` → dispatch `4c` |
| **still running** | **wait for it** — do not start 5a. Say in one line that the run is holding for authoring, and what is outstanding |
| **authored nothing** | C1's set was already complete at `2a` (§C1). Dispatch `4c` now; `3-cases` has nothing to rule on |
| **aborted** (an early BLOCKED) | no append, no `3-cases`, no `4c`. Record what was aborted and carry the reason into 5a |

**Wait on the completion signal; do not poll.** The harness reports a background agent's completion, so a
timed re-check spends turns to learn what arrives on its own. What is forbidden is the third option —
proceeding to 5a as though authoring had finished because nothing said otherwise. **`A` is backgrounded,
not optional**, and `5a` joins on `4a` ‖ `4v` ‖ `4c`: a verdict reached while `4c` is still outstanding is
a verdict missing a track it claims to have.

### The lane cap no longer holds by construction — count before every dispatch

Until 2026-09-10, `3x` closed before `A`, which closed before Step 4, so at most three lanes could ever be
live and no arbitration rule was needed. **Execution now overlaps `3x`, so that guarantee is gone and the
rule has to be explicit.** Max 3 concurrent browser agents, hard
([`.claude/rules/agents.md`](../rules/agents.md)). Count the live lanes before each dispatch and yield in
this order:

| Priority | Track | Why it outranks the next |
|---|---|---|
| 1 | **3x** discovery | it is upstream of **both** the checklist and authoring — starving it stalls the whole run, not one track |
| 2 | **4a** execution | it *is* the verdict's evidence |
| 3 | **4v** visual | it feeds the same verdict, at 5c |
| 4 | **1r** reachability | cheap and early, and finished long before either |
| 5 | **4c** C1 | released last anyway, and 5a joins on everything |

**`3x` leads not because it matters more than the verdict but because it is UPSTREAM of the checklist the
verdict rests on** — `B` and `A` both wait on it. Contention is small in practice: `3x` is one lane
against a browserless `3a`, and `4a` does not exist yet while it runs.

**Never** put the visual lane on `playwright-firefox` (click- and hover-driven), and never route a P0
extra pass there either.

### An early BLOCKED aborts the background work

If `1r` or `4a` returns BLOCKED — env down, build lacks the change, fixtures unresolvable — **`TaskStop`
the authoring fan-out and `3a`** and record what was aborted. Appended cases stay `Draft` (valid coverage,
free to keep); staged CSVs are discarded. **Never on a FAIL** — a failing feature is exactly when the new
cases matter.

**Gate (Execution evidenced — inline):** every atomic condition carries **PASS or FAIL evidence**, and the
`4c` produced a **RUN_ID + pass rate** or is
recorded as skipped with its reason; **when the visual lane ran**, each axis applicable to the resolved
target carries a verdict or an explicit `SKIPPED` **with a reason**. Reject any "PASS" with no artifact and
re-capture before Step 5. **A silently absent visual axis is not a clean one.**

---

## Step 5 — Report

The ordered close-out phases, plus **`5k`** — the bounded loop that repeats them, on `--iterate` only.
**5a before 5b before 5c is load-bearing:** the verdict is expressed in terms of a
finding's provenance (5a) and the reconciled AC/DoD state (5b). Full methodology:
[`close-out.md`](../skills/qa-test/close-out.md) (5b · 5c · 5d) ·
[`triage.md`](../skills/qa-test/triage.md) (5a) · [`reporting.md`](../skills/qa-test/reporting.md)
(5e · 5f · 5h · 5h-map).

| | Phase | In one line | Gate |
|---|---|---|---|
| **5a** | Triage | Triage the C1 run via **`/qa-triage-results <RUN_ID> --fix`** (never from scratch), correlate App Insights for the window, validate evidence quality, then classify → provenance → severity → dedup every remaining finding. Fold in the Step-3x lane's bugs — it files none itself | — |
| **5b** | Reconcile AC & DoD **live** | Close `1d`'s static hypothesis against what the agents observed; resolve every DoD item; compute both percentages **from the actual counts** | **hard STOP** + verifier |
| **5c** | Verdict | PASS / PASS WITH NOTES / FAIL / BLOCKED, derived from 5a + 5b — **no new judgment**. It is **recorded, not yet published**: 5e is what publishes | — |
| **5d** | File bugs | **Ask first.** **Severity floor: `Critical`/`High`/`Medium` only** — a `Low` keeps its `reports/bugs/open/` draft, is named in the 5e comment and `summary.json.bugs_not_filed`, and gets no tracker item, in either shape. Relationship by provenance: IN-SCOPE → Sub-task · PRE-EXISTING → link only · OUT-OF-SCOPE → standalone + related · **`BL-A11Y-*` on a functional/feature/E2E ticket → standalone + related, at its real severity, and it does NOT fail 5c** ([`triage.md`](../skills/qa-test/triage.md) §7a) | inline |
| **5e** | Report | Feed + independently ratify the Feature Release Gate · post the tracker comment (**incl. the mandatory `Not filed (below severity floor)` line, `None` when empty**) · persist `summary.json` + update the checklist in place with verdicts · output the one chat report | verifier |
| **5f** | Change status | **After** the report, **ask first**, `qa-lead` only. PASS / PASS WITH NOTES → TESTED · FAIL → REOPEN with failures + bug links · **BLOCKED → NO transition + a mandatory comment naming the blocker** (the ticket stays in-testing: TESTED would be a lie and REOPEN files an env blocker into the dev queue). **TESTED is the terminal state this command may reach — never Done or Cancelled.** One row per verdict, the record, and the per-flow ownership: [`ticket-status-transitions.md`](../knowledge/execution/ticket-status-transitions.md) | — |
| **5h** | Publish documentation | **After** TESTED, **both paths**. Write the §3/§4/§5 guides for the surface the ticket moved into `reports/ba/`, then post them as **ONE tracker comment with a section per audience**. Audiences, size caps and the three refusals (`layer-unresolved` · `not-deployed` · `not-user-visible`): [`virto-doc-style.md`](../knowledge/ba/virto-doc-style.md) §10. Not a release note: no version literals. **A non-`PASS` verdict SCOPES this step rather than refusing it** — document the passing paths, carry the `Not documented` line and the verbatim verdict. Precondition is **5f having run**, not TESTED. Ask before posting; refuse rather than pad. An existing guide is **amended, never forked** | inline |
| **5h-map** | Amend the domain map | **FULL only, after 5f, when a map EXISTS.** Write back what this run VERIFIED — §2 surfaces `1c` reached, a `D*` confirmed/refuted **live**, a `G*` closed, a §4 count corrected — one `§7 — Amendments` row per write. **Costs no dispatch.** Live-`CONFIRMED` only; **never deletes a row or renumbers an id**; sets `amended:` and **never `generated:`/`rev:`**. Independent of 5h's refusals. Non-blocking; `NOTHING_TO_AMEND` is a recorded outcome. Mechanism: [`reporting.md`](../skills/qa-test/reporting.md) §5h-map | inline |
| **5k** | Iterate (`--iterate` only) | The bounded test → fix → re-test loop. **Per round (≥2), at the head:** `5k.0` round entry — probe the build, re-read the board, verify each fix-ready bug with `/qa-verify-fix` **inline**, hop a VERIFIED one to `TESTED` **only if merged and in the probed build**, then re-run the failed scope. **Per round:** 5a–5d + a round-delta comment + `summary.json` + an appended checklist section. **At loop exit, once:** 5e in full → 5f → 5h → 5h-map. So a `--iterate` run posts **one** QA-Complete comment and makes **one** transition on the ticket under test, whatever the round count. Per-round table and the reason for each row: [`modes.md`](../skills/qa-test/modes.md) §5k | round cap · deploy confirm · G0 BAIL → STOP |

**Severity is graded at 5a and never re-graded at 5d** to move a finding across the floor. Filing and
failing stay separate decisions: a `Medium` files without failing the ticket.

**Verifier cadence inside the loop.** On `--iterate`, the **5b** verifier re-ratifies **once per round**
(the verdict gate is what decides whether there is another round), while the **5e** verifier
dispatch fires **once, at loop exit** — there is one release, so there is one recommendation and one
promotion. FAST fires none of the three, in the loop exactly as everywhere else.

**Close the loop.** By default `/qa-test` verifies and reports; it never fixes — it states the next command
and stops. PASS → TESTED, hand to the Feature Release Gate. FAIL → REOPEN → `/qa-fix <ticket-key>` → human
review + merge + deploy → `/qa-verify-fix <ticket-key>`. BLOCKED → resolve the blocker and re-run from the
top; no partial credit. With **`--iterate`**, 5k drives that loop itself, bounded — and it re-persists as
well as re-runs: per-round filing, comment, `summary.json` and checklist, with the gate, the transition
and promotion deferred to the exit round
([`skills/qa-test/modes.md`](../skills/qa-test/modes.md) §5k).

---

## Constraints

- Reference every in-repo file by its **real path from the repo root** (`.claude/skills/…`,
  `.claude/knowledge/…`, `.claude/rules/…`, `.claude/agents/…`, `ci/…`) — the bare `skills/…` form does not
  resolve, especially inside a sub-agent prompt.
- Never use WebKit (unsupported on Windows). Never assign two agents to the same browser server
  simultaneously. Fallback: chrome→firefox, edge→chrome, firefox→edge (max 1 retry). **Max 3 concurrent
  browser agents — counted across checklist agents and regression lanes.**
- Read all URLs from `config.js` / `.env` — never hardcode. Always load `business-logic.md` for the affected
  domains.
- If an agent fails with an internal error, fall back to working directly rather than retrying the same
  delegation. If the tracker MCP is unavailable, skip transitions and ask the user for ticket details.
- **What persists:** `summary.json` + `testing-checklist.md` + screenshots under
  `reports/tickets/{SPRINT}/<ticket-key>/`; the FULL-path Test Model to `reports/ba/test-models/`; new
  cases to `regression/suites/`; the 3x session report to `reports/exploratory/`. `ac-analysis.md` and
  `test-execution-report.md` are **never written**. Full table, and the per-axis `summary.json` blocks:
  [`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) §What persists · [`axes.md`](../skills/qa-test/axes.md) §5.
  Validate with `npm run summary:validate`.
- **Severity floor on filing (5d): `Critical`/`High`/`Medium` only.** A `Low` is dropped from the tracker,
  never from the run, and never re-graded to move it across the line. It is also outside `--iterate`:
  `/qa-fix` needs a filed ticket, so 5k only fixes what 5d filed — in **every** round, not just the
  first ([`skills/qa-test/modes.md`](../skills/qa-test/modes.md) §5k).
- App Insights correlation (5a) reuses `/qa-monitoring`'s query + dedup + triage machinery scoped to the
  window (no separate live-repro); resolve resources from `APPINSIGHTS_*`, skip gracefully when
  unconfigured; a correlated error gets no separate `BUG-AI-*` draft (5d's `/vc-fix:qa-bug` owns it). 
