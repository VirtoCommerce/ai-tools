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
| The five derived axes as ONE mechanism (2b–2f) | [`skills/qa-test/axes.md`](../skills/qa-test/axes.md) |
| Ticket status — who moves it, when, on whose authority | [`knowledge/execution/ticket-status-transitions.md`](../knowledge/execution/ticket-status-transitions.md) |
| What already exists on this surface (prior BA analysis, models, domain knowledge) | [`knowledge/domain/functionality-map.md`](../knowledge/domain/functionality-map.md) |
| Steps 2–3 — oracles, the four artifacts, scaffold + fan-out, the C1/C2 regression split | [`skills/qa-test/authoring.md`](../skills/qa-test/authoring.md) |
| Step 3x — the discovery lane (exploratory, concurrent with 3a, before authoring) | [`skills/qa-test/exploratory-lane.md`](../skills/qa-test/exploratory-lane.md) |
| Step 5 — reconcile, verdict, release regression, filing | [`skills/qa-test/close-out.md`](../skills/qa-test/close-out.md) |
| Step 5a — triage · 5e/5f/5h — report, transition, docs · 5g — promotion | [`triage.md`](../skills/qa-test/triage.md) · [`reporting.md`](../skills/qa-test/reporting.md) · [`promotion.md`](../skills/qa-test/promotion.md) |
| `--epic` · `--iterate` | [`skills/qa-test/modes.md`](../skills/qa-test/modes.md) |
| Verifier mode · agent routing · the agent prompt contract · what persists · **concurrency (what batches, what must stay serial)** | [`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) |
| `1b` 2d — the GraphQL schema + fixture refresh | [`skills/qa-test/contract-refresh.md`](../skills/qa-test/contract-refresh.md) |
| Step 2a — triaging the EXISTING corpus against the change | [`skills/qa-test/coverage-triage.md`](../skills/qa-test/coverage-triage.md) |

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
| a second bare token that is not a ticket key, `PR #N`, or a flag | **STOP and ask** | never silently fold it into the target or a flag value |

`--iterate` and `--epic` **compose** (the loop tries to fix a failing child story before the chain
continues). **No flag changes the FAST/FULL routing** — effort comes only from ticket type × status at
`1a`, and an axis is a lane trigger, never an effort trigger.

---

## Execution order — the labels do not sort, so here they are in order

Labels are a **citation contract** (207 references across 36 files outside this command), so they are never
renumbered. That leaves the reading order non-obvious in three places, stated here rather than discovered:
**`5r` runs between `5c` and `5d`**, **`5g` runs last of all**, and `1e-plan`/`2a`/`3x` are steps, not
sub-items.

```
FAST   1a → 1b → 2 → [2a] → 3 → 4 → 5a → 5b → 5c → 5r → 5d → 5e → 5f → 5h
FULL   1a → 1b → 1c ‖ 1d ‖ 2-load → 1e → 1e-plan → 2-topup → 2a
                → 3a ‖ 3x ‖ B → A → C1/C2 scope → 4
                → 5a → 5b → 5c → 5r → 5d → 5e → 5f → 5h → 5g
```

`[2a]` on FAST only under `--coverage`. On `--iterate`, `5k.0` (round entry) + 5a–5d + 5r repeat per round; 5e, 5f, 5h and 5g
fire once, at loop exit ([`skills/qa-test/modes.md`](../skills/qa-test/modes.md) §5k).

---


## Routing — two axes, decided at 1a

**Single source of truth for both matrices:**
[`.claude/knowledge/execution/ticket-routing.md`](../knowledge/execution/ticket-routing.md). **Cite it,
never restate it here.** `1a` resolves them and its own table carries the per-flow branch.

1. **FLOW** — which pipeline runs at all: `verify-fix` · `hotfix-verify` · `feature-test`.
2. **EFFORT** — FAST or FULL, **only** within `feature-test`. FULL for a new feature / Story / Epic, P0–P1,
   cross-layer, ≥2 domains, a critical-revenue flow, or an unclear surface; FAST for a bug fix / copy-tweak /
   config / Technical task that is P2–P3, single-layer, single-domain, obvious surface. **When in doubt, take
   FULL** — a real regression is worse missed than a fast run saved
   ([`SKILL.md`](../skills/qa-test/SKILL.md) §Effort routing).

A `not-fixed` Bug takes `feature-test` **FAST** to reproduce and characterize the defect live with fresh
evidence — there is no fix to *verify* yet; state that the next step is `/qa-fix <ticket-key>`.

---


## The FAST path, in full

Stated once, completely. **Everything after this section is the FULL path.**

```
1a  route + fetch (comments + attachments, always)   → name the parent Epic in one line, no sibling
                                                       analysis; then the opening status hop
1b  pre-flight, sprint, duplicate check              → 2b layer + 2f data_surface always; the
                                                       functionality-map read is mandatory;
                                                       2c/2d/2e derive but do not RUN unless
                                                       their flag is passed
2   load the affected domains' BL-* AND ECL-* rule TEXT (the agent prompt contract requires both);
    route ONE execution agent. Stop there.
3   Artifact B checklist (conditions from 1a's ACs) + C1/C2 scope + 3a ONLY when 2f said so
4   ONE execution agent runs the checklist; then C1 — the exact-set run of any Step-2a RE-BASE ids
    (skipped entirely, and said so, when there are none)
5a  triage · 5b reconcile AC/DoD · 5c verdict → then launch C2 (5r) and run 5d + draft 5e while it
    executes · 5e report · 5f status · 5h docs
```

**FAST is one execution agent.** That is the promise, and it is now kept: **three** of the five derived
axes are **opt-in** here — `--visual` · `--contract` · `--coverage` · `--axes` — and off by default.
`layer` (2b) and `data_surface` (2f) derive and apply on both paths, because neither can add an agent:
2b dispatches nothing, and 2f can only ever *remove* a dispatch. **The opt-in three still *derive*** (each
token and its sources are recorded, so a `false` is auditable); without their flag, none of the three *runs*.

**This restores a promise that had inverted** — the axes had regrown the *"both paths, always"* rule the
FAST/FULL split was created to end. Why, what it cost, and the run counts behind reversing it:
[`SKILL.md`](../skills/qa-test/SKILL.md) §Effort routing · [`axes.md`](../skills/qa-test/axes.md) §4.

**Not run on FAST:** `1c` / `1d` agents · the `1e` Test Model and `1e-plan` · the archetype / UIP / `VC-*`
sweeps · Artifact A authoring (so **no new test cases and no new regression coverage** — the route back in is
`/qa-test-lifecycle`) · **the Step-3x discovery lane** · `5g` promotion · every independent verifier
dispatch (each gate is an inline self-check) · the three opt-in axes unless their flag is passed.

The discovery lane is FULL-only even under a flag: three of its four outputs consume a Test Model and an
authoring batch, and FAST has neither ([`exploratory-lane.md`](../skills/qa-test/exploratory-lane.md) §2).

**Still run on FAST, and load-bearing:** the `BL-*` **and `ECL-*`** rule text (the correctness oracle the
checklist asserts against — dropping it makes a FAST verdict ungrounded rather than merely cheap) · the
ticket comments and attachments · **the `functionality-map.md` read** (a local file read, and the cheapest
way to not re-derive a surface three people have already analysed) · **`2b` `layer`**, which dispatches
nothing and which 5f/5h need · **`2f` `data_surface`**, which can only ever *remove* a dispatch · `5b`
(it produces the verdict) · the committed `testing-checklist.md`, which is the run's **only** durable
record · **`5h`**, whose refusal set makes it free.

**`--iterate` is valid on FAST, and this is where it earns most.** 5k needs a filed bug and a
change-scoped regression, and FAST produces both — it just has no authored cases to re-run, so round N+1
re-runs the **failed checklist items** plus C2, **re-scoped to the fix's own diff** rather than the
ticket's, and the checklist is **appended to** per round rather than overwritten: on FAST it is the only
durable record, so rewriting a round-1 FAIL as a round-2 PASS deletes the proof the defect existed. What
stays off inside the loop: the verifier re-ratification, exactly as at every other FAST gate.

**`5k.0` round entry runs on FAST too — and it is the path that needs it most.** Every bug a FAST round
files comes off a **checklist item**, so it carries no case id and nothing in the RED→GREEN set can ever
speak for it; an inline `/qa-verify-fix` per fix-ready sub-task is the only way such a bug is ever
verified or closed. It is not an exception to FAST's one-execution-agent promise for the same reason the
contract axis is not: the bugs are verified through the flow `1a` already runs inline, not by a new lane.

**Gate (FAST, inline):** the checklist covers every atomic condition; `npm run td:validate` is green; **and
when `--coverage` ran**, every Step-2a `tc:scope` hit is disposed (`REPAIR` fixed **and re-linted with
`suites:review`**, `RE-BASE` in C1's `--ids`). No `suites:review` otherwise — FAST authors nothing.

---


## Quality gates — FULL path

A step passes its gate or **STOPS**. Three are hard-STOP gates verified by a **fresh
`qa-lead-orchestrator` in §Verifier Mode**; every other gate, and the whole FAST path, self-checks inline.

| Gate | Where | Verified by |
|---|---|---|
| Model complete | 1e (10 clauses) | inline (doer's own check) |
| Existing coverage disposed | Step 2a | inline — re-derived at Step 3's gate (`tc:scope`, same args) |
| Discovery folded in | Step 3x (FULL) | inline — never blocks; unreached charter items are named |
| **Artifacts reviewed + data resolved** | Step 3 | **fresh `qa-lead` verifier — hard STOP** |
| Execution evidenced | Step 4 | inline |
| **Triage + AC/DoD sound** | 5b | **fresh `qa-lead` verifier — hard STOP** |
| Filing sound | 5d | inline |
| Feature Release Gate ratified | 5e | fresh `qa-lead` verifier |
| **Promotion sound** | 5g | **fresh `qa-lead` verifier — hard STOP**, non-blocking on the close-out |

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
for `feature-test`, the **EFFORT**. `ticket-routing.md` owns both matrices — **cite it, never restate it.**
Record **flow + type + path**; all three are `summary.json` fields persisted at 5e.3. Fail-safe:
unresolvable → `feature-test` FULL; when in doubt → FULL.

| Flow | Then |
|---|---|
| `feature-test` | continue to `1b` and run the pipeline at the resolved effort — the rest of this document |
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
| *(no I/O)* | derive the five axes — see below |
| **B** | 2d's two refreshers **and** 2e's `tc:scope` scan (scope + risk terms only) **and** 2f's `td:validate` resolution check, concurrently |

**Three consequences of 2-release, which is why it is a step and not a header field:** a **⚠ BREAKING**
change in the component under test **forces FULL** whatever `1a` scored · it gives `1d`'s otherwise-static
AC↔implementation check a third leg · **released ≠ deployed** — a capability the ledger records that the
probe does not carry is `NOT_DEPLOYED` → BLOCKED-on-deploy, never a FAIL and never a filed bug, and the
ledger carries no behaviour so it can never ground an assertion as `{DOC}`.

**2-map — read what already exists on this surface. MANDATORY, both paths.** Read the ticket's domain
section of [`knowledge/domain/functionality-map.md`](../knowledge/domain/functionality-map.md) (generated;
`npm run map:refresh` if `npm run map:check` reports drift). It answers **two** questions and the second is
the one that lets you design a test.

**The bibliography** — carry four things forward: the **prior BA analysis** for this domain, the **prior
test model** for this surface, the **domain knowledge** docs, and the **tickets already tested** here.

**The `Test object` block — what the thing IS.** Purpose (the value chain) · the **operations** you can
perform on it · the **data** whose properties its assertions read · the **variants** that change its
behaviour without changing its code · the **constraints** that must hold, with what a violation costs.
Carry these into `1e`: they are the condition space's raw material, and a `1e` that starts from them is
modelling a mechanism rather than enumerating screens. **You cannot design an experiment on an object
whose properties you do not know** — you can only walk its surfaces, which is the measured Loyalty
Missions failure (127 cases, 71 of them placing zero orders, the mechanism end-to-end at 11%).

**`UNDECLARED` in that block is the run's FIRST finding, not a blank.** Purpose and reverse edges live in
exactly one place — a Test Model Part 0 — so `UNDECLARED` means nobody has written down what this surface
is for (measured: **1 of 13 domains** has a declared purpose). On FULL, establishing it is `1e`'s opening
move and writing the model fills the cell for the next ticket; on FAST, say so in the checklist rather
than inventing one. Name in one line what you found, and **name it when a domain has
none** — `sales-rep` carries 11 prior BA deliverables and 2 tested tickets, `auth-security` carries zero,
and those are different starting positions.

Two limits travel with it. It is a **pointer index, never behaviour** — the same limit
`release-ledger.md` carries, so it can tell you a prior analysis exists and can never ground an assertion
as `{DOC}`. And **every entry is DATED because every entry may be stale**: prior art is a hypothesis about
current behaviour, confirmed against the `2-release` ledger Δ **since that document's date** and a live
check before anything is built on it (the map's own §1 carries the axis table and the
`CONFIRMED`/`DRIFT`/`MISSING`/`UNVERIFIED` verdicts). Reading a stale deliverable and repeating it is
worse than reading none, because it arrives with a written deliverable's authority. Three consumers: the `1c` brief (so
`ba-system-analyzer` starts from the prior analysis instead of re-deriving it), `1e` (**amend the existing
surface model, never fork it** — VCST-5346 already has two), and `5h` (an existing guide for this surface
is amended, never forked).

**PR testing:** confirm the PR's artifact version is deployed; if not → offer `/qa-deploy-pr <ticket-key>`
(**ask first**) or warn and ask whether to wait.

#### 1c — Gather ticket context (FULL path only)

Dispatch `ba-system-analyzer` (read-only, no JIRA/GitHub writes) with the ticket ID(s)/feature/PR + the
raw ticket fields + PR diff **+ the `1a` comment/attachment signals** (a repro in a comment or a log/HAR
attachment often points straight at the affected code site) **+ the `1a` Epic context** (so it maps the
seams between this story and its Done siblings, not just the story's own code) **+ the `2-map` prior art**
— the paths of this domain's existing BA analysis, its prior test model and its domain-knowledge docs,
passed as paths to READ rather than as a summary. `ba-system-analyzer` has always been told to *skim*
`reports/ba/`; being handed the specific files is what turns that into a step, and the agent's own
definition now requires it to report what the prior analysis already settled versus what is new. **On the full path, dispatch
`1c` and `1d` concurrently in a single message** — both consume only the `1a` fetch and are independent. It
returns:
- **Existing functionality (current state)** — **first, and mandatory.** What the scope ALREADY DOES before this ticket, one line per capability, grounded in source/live/docs; plus the prior art it read by path (or the literal `none`), the prior model to amend, what prior analysis already settled, and what is new in this pass. A gap analysis with no baseline is a wish list, and *"is this new behaviour or existing behaviour?"* is the question 5a needs at triage time to assign provenance. **A prior report is a HYPOTHESIS, never the baseline** — it is dated and the product moved after it, so each claim it relies on is triangulated against the **release documentation** (the `2-release` ledger Δ since that document's date — which raises a staleness suspicion and, carrying no behaviour, can never settle one) and a **live check**, then carries `CONFIRMED` / `DRIFT` / `MISSING` / `UNVERIFIED`. A `DRIFT` is a finding about the *document*, not a product bug.
- **The test object** — purpose (the value chain) · **operations** (what can be done to it) · **properties** (what can be observed or varied) · **variants** (what changes its behaviour without changing its code) · **constraints** (`BL-*`/`ECL-*`, with what a violation costs) · **reverse edges**. Seeded from `2-map`'s `Test object` block and completed live. This is `1e`'s condition-space raw material: a model built without it enumerates screens, which is the Loyalty Missions shape. A map `UNDECLARED` is established here or reported as unestablished — **never** guessed.
- **Affected surface** — module(s)/repo(s), storefront vs Admin SPA vs API/GraphQL layer, concrete code sites (grounded, not guessed).
- **Related flows & integration boundaries** — adjacent features / cross-domain seams (cart ↔ checkout, org ↔ membership, …).
- **Known pain points / historical failures** — cross-referenced to `vc-bug-catalog.md` (`VC-*`) + prior bugs.
- **Docs grounding** — VirtoOZ/VC-doc references for how the feature is *supposed* to behave.

**Hand it the contract's REV, not its path.** When `1b` item 2d refreshed, the brief carries
`graphql-schema.md @ <refresh date> — refreshed this run` plus any fixture drift the gate reported. Without
the rev, the agent's own definition tells it the snapshot is of **UNKNOWN age** and to report every field
name it took from the file as unverified — correct, but it costs the run its GraphQL grounding, so it
guesses ([`skills/qa-test/contract-refresh.md`](../skills/qa-test/contract-refresh.md) §4). When 2d recorded
`UNKNOWN`, say so in the brief: contract claims from that snapshot are hypotheses, not grounding.

On internal error, gather context inline (from the `1a` fields + the diff + `.claude/knowledge/`) rather than
retrying the delegation. The `1e` model carries the same fields either way.

### 1d — Review the story (FULL only)

**Advisory, never blocking.** Runs for a ticket/story **with ACs**; skip with a one-line note for a bare
feature name or a PR with no governing story.

Dispatch `ba-story-writer` in review mode (Mode B) — analyze only, no new story, no tracker writes. Pass
`existing_story` (summary + description + ACs from `1a`), any **AC-affecting clarifications from the `1a`
comments** (a comment that redefines expected behavior overrides the stale description), `jira_ref` +
`domains`, and `implementation: { pr_diff }` — this is the **static** AC↔code check; the **live** one is 5b.
It returns: an **AC Quality Scorecard** (per AC: testable? / clarity / smells / KEEP·REWRITE·SPLIT) ·
**weak sides** with rewrites · **AC ↔ Implementation coverage** (SATISFIED / DRIFT / NOT-FOUND / CONTRADICTS
vs the diff, plus unspecified implementation) · **gap analysis** (missing ACs for error paths, boundaries,
guest/B2B, NFRs, integration seams — each mapped to a `BL-*`/`ECL-*` and phrased as a gap-AC) · an **AC →
Test traceability seed** (atomic testable conditions, story ACs + gap-ACs, each with its `Impl verdict`) ·
the **DoD checklist** (each item marked from what is statically inferable now vs flagged **"confirm at
5b"**; skip with a note when there is no DoD section).

**Surface inline** the weak ACs, DRIFT/CONTRADICTS/scope-creep findings and gap-ACs, then **proceed** — fold
gap-ACs into scope and carry every DRIFT/NOT-FOUND/CONTRADICTS into execution as a thing to verify **live**
(a static-diff finding is a suspicion, not a defect). The AC traceability table and the DoD checklist stay in
working context (terminal-only, `.claude/rules/reports.md` §1); they are the spine for Step 3 and 5b.

### 1e — Build the Test Model (FULL only)

Distil `1c` + `1d` + `1a` into the **fault model** Step 3 authors cases from, written to
`reports/ba/test-models/<TICKET>-<date>.md`. **Part 0 — the value chain — is derived FIRST** and drawn in
Mermaid; the condition space is built per link on top of it.

**Shape:** [`.claude/templates/test-model.md`](../templates/test-model.md). **Methodology, the eight rules
the scenario table must satisfy, the ten-clause gate and the worked references:**
[`skills/qa-test/test-model.md`](../skills/qa-test/test-model.md). Read the latter before writing the model —
the gate below is only its checklist.

**Gate (inline, 10 clauses — every one contradictable):** flow/type/path set + atomic conditions + BL/ECL/
domains/risk areas · `Value chain` complete **with the `flowchart` in the file** · `Mechanism coverage
matrix` with **no blank cells** + `Reverse edges` resolved · **the matrix's AXES are derived from the
mechanism, not from the scenario table** (see below) · first scenario row is the `Technique:FLOW`
journey · `Condition space` states factors, classes, constraints and raw N · `Reduction` states `N → M` **and
names what it dropped** · every row carries all five (cell · defect hypothesis · archetype · technique ·
oracle) · every oracle is `{BL}`/`{SPEC}`/`{DOC}` or says what would make it one · the `Archetype sweep`,
`UIP sweep` and `Probes carried in` rows are **PRESENT** in the model.

**Clause 4 is new, and "no blank cells" does not imply it.** A matrix populated by reading your own
scenario list fills completely by construction, so a mechanism with no scenario has no row to be uncovered
in — the check degrades into a restatement. Derive **columns from the chain links** and **rows from the
variants**, where variants are partitioned by the layer that BRANCHES on the thing under test (the union,
when several layers branch differently — not whichever you read first), and only then map scenarios in.
Re-derive after any rewrite of the scenario table: renumbering silently drops rows. Both failure modes hit
one model on VCST-5735 and both presented as a full matrix —
[`skills/qa-test/test-model.md`](../skills/qa-test/test-model.md) §The matrix is only a check.

**The sweeps are present here and RESOLVED at Step 2 — the two are different gates and the ordering is
not negotiable.** Step 2 is what loads the `VC-*` catalog entries and the `UIP-*` probe set, so a `1e` gate
demanding them resolved would demand an answer from inputs that have not been read yet (the template marks
all four rows *"filled in Step 2"* for exactly this reason). What `1e` owns is that the rows **exist**, so
Step 2 cannot quietly skip a sweep nobody wrote a line for.

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

| Always | `business-logic.md` `BL-*` · `e-commerce-edge-cases-library.md` `ECL-*` · the domain checklists via `/qa-checklist` · `skills/qa-plan/e2e-scenario-catalog.md` `E2E-*` (the suite-traceability backbone for C2) · `oracles/vc-bug-catalog.md` `VC-*` — each entry's `Detection probe` is a ready-made scenario |
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
4; a C2-only row not until **5r**, after the verdict is recorded, so it can only amend it) · **`FILTERED_OUT`
is invisible forever unless disposed here — this is the coverage hole** · `NOT_EXECUTING` (explicit
`Manual`/`Deprecated`) is opted out **by intent**, not a hole.

**Dispose every hit — a closed four-value vocabulary:**

| Disposition | Means | Action |
|---|---|---|
| `CONFIRMED` | still correct under the change | nothing |
| `REPAIR` | the row's **mechanics** are stale — renamed selector, moved route, removed arg, dead `@td()` alias — so it cannot execute at all | **fix BEFORE the run**: `/qa-review-tests file <path-to-suite.csv> --fix`, then re-lint |
| `RE-BASE` | the row's **expected value** conflicts with the change | **do NOT rewrite.** Keep the old assertion, carry the row into **C1's `--ids`**, let Step 4 execute it |
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

**One concurrent wave, then Artifact A.** `3a`, `3x` and `B` are mutually independent — `3a` is browserless,
`3x` takes exactly one lane, `B` is pure authoring off `1d`'s ACs — so **dispatch whichever of them apply in
ONE message**. `3a` applies **only when `1b` item 2f derived `data_surface: true`**; when it is `false` the
wave is `3x ‖ B` and the skip is stated with the fixtures that already cover the plan.
Artifact A alone waits on the wave: cases are authored against fixtures that already resolve **and against
the model as amended by 3x**.

```
3a ─┐   ← only when data_surface: true   (else: stated as skipped, with the covering fixtures)
3x ─┼──► A ──► C1/C2 scope
B  ─┘
```

| | Artifact | Owner | Lands |
|---|---|---|---|
| **3a** | Test data — **conditional on `data_surface`** | when `true`: **the orchestrator dispatches `test-data-engineer`** (`/qa-generate-data` → `/qa-seed-data`) — never sub-delegated by the specialist. When `false`: **no dispatch**, and the run states which existing fixtures cover the plan | `true` → seeded env, green `td:validate`. `false` → every planned case resolves against existing `@td()`/`{{VAR}}` data **and** no chain link under test needs a divergence the fixtures do not have ([`authoring.md`](../skills/qa-test/authoring.md) §3a) |
| **3x** | Discovery session (FULL only) | **orchestrator invokes `/qa-exploratory ticket <ticket-key>`** — that command owns the session; this pipeline owns only the charter | model amendments + `summary.json.discovery` + `reports/exploratory/SBTM-<ticket-key>-<date>.md` |
| **A** | Test cases (FULL only) | `test-management-specialist` | `regression/suites/<layer>/<module>/*.csv` as `Draft` |
| **B** | Testing checklist (both paths) | `test-management-specialist`, or the orchestrator inline for a single-surface tweak | `reports/tickets/{SPRINT}/<ticket-key>/testing-checklist.md` |
| **C1** | Ticket regression — the exact set | orchestrator | a `/qa-regression … --ids` run, executed at Step 4 |
| **C2** | Release regression — change-scoped Critical | orchestrator | a `/qa-regression … --cases critical` run, executed at **5r**, after the verdict |

#### 3x — the discovery lane (FULL only)

**Explore the model before authoring against it.** The pipeline derives for four steps and never looks at
the running feature until Step 4 executes cases that are already written — so the model's `{HYPOTHESIS}`
oracles, its `GAP` cells, its unresolved reverse edges, `1d`'s DRIFT ACs and Step-2a's `RE-BASE` rows all
reach authoring as guesses. This lane spends **one browser lane for a hard 25 minutes, inside time 3a is
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

**Dispatch in this order, and state the order chosen:**

| | Track | Notes |
|---|---|---|
| **1** | **Checklist** — the applicable specialist agent(s), **in a single message**, running Artifact B + the Artifact-A cases | **FAST = one agent.** Prompt contract: [`SKILL.md`](../skills/qa-test/SKILL.md) §Agent dispatch |
| **4v** | **Visual lane** — `ui-ux-expert` on Chrome DevTools MCP, in the **same message** as (1) | FULL when `visual_surface: true`; FAST only under `--visual`/`--axes`. **Dispatch the agent, never invoke `/qa-design`.** Axes, targets, the two things the brief must carry, verdicts, the SKIPPED rule: [`visual-axis.md`](../skills/qa-test/visual-axis.md). Writes `design-report.md` + `summary.json.visual` |
| **2** | **C1** — `/qa-regression <suite ids> --ids <new Draft ids + every Step-2a RE-BASE id>` | Its own run; capture `RUN_ID` + wall-clock. **Skip it saying so when the exact set is empty** — an omitted C1 must not read as a passing one |

**C2 does not run here.** The change-scoped Critical sweep answers a *release* question and runs at **5r**,
after the 5c verdict, overlapped with filing and report drafting — the single largest cut to verdict latency
in this pipeline.

**The max-3-concurrent-browser cap binds across all three.** If they would exceed it, sequence
**checklist → visual → C1**: the ticket verdict is the priority and the visual lane feeds it. **Never** put
the visual lane on `playwright-firefox` (click- and hover-driven), and never route a P0 extra pass there
either. Step 3x has already closed, so it never competes for the cap.

**Gate (Execution evidenced — inline):** every atomic condition carries **PASS or FAIL evidence**; C1
produced a **RUN_ID + pass rate** or is recorded as skipped with its reason; **when the visual lane ran**,
each axis applicable to the resolved target carries a verdict or an explicit `SKIPPED` **with a reason**.
Reject any "PASS" with no artifact and re-capture before Step 5. **A silently absent visual axis is not a
clean one.**

---


## Step 5 — Report

Nine ordered phases, plus **`5k`** — the bounded loop that repeats them, on `--iterate` only.
**5a before 5b before 5c is load-bearing:** the verdict is expressed in terms of a
finding's provenance (5a) and the reconciled AC/DoD state (5b). **`5r` deliberately sits AFTER 5c**, because
the change-scoped sweep answers a release question and the verdict never depended on it — and because 5c is
recorded rather than published, an IN-SCOPE C2 finding amends the verdict instead of retracting one. Full
methodology:
[`close-out.md`](../skills/qa-test/close-out.md) (5b · 5c · 5r · 5d) ·
[`triage.md`](../skills/qa-test/triage.md) (5a) · [`reporting.md`](../skills/qa-test/reporting.md)
(5e · 5f · 5h) · [`promotion.md`](../skills/qa-test/promotion.md) (5g).

| | Phase | In one line | Gate |
|---|---|---|---|
| **5a** | Triage | Triage the C1 run via **`/qa-triage-results <RUN_ID> --fix`** (never from scratch), correlate App Insights for the window, validate evidence quality, then classify → provenance → severity → dedup every remaining finding. Fold in the Step-3x lane's bugs — it files none itself | — |
| **5b** | Reconcile AC & DoD **live** | Close `1d`'s static hypothesis against what the agents observed; resolve every DoD item; compute both percentages **from the actual counts** | **hard STOP** + verifier |
| **5c** | Verdict | PASS / PASS WITH NOTES / FAIL / BLOCKED, derived from 5a + 5b — **no new judgment**. It is **recorded, not yet published**: 5e is what publishes | — |
| **5r** | Release regression (C2) | **Launch C2 the moment 5c is recorded**, then run 5d and draft 5e while it executes. On return: `/qa-triage-results` → provenance. Nothing IN-SCOPE → the verdict stands and C2 feeds the release gate only. An IN-SCOPE finding → **amend the verdict once**, file it under 5d's same floor, and 5e reports the amended verdict. Since 5c was never published, nothing is retracted | 5e blocks on it |
| **5d** | File bugs | **Ask first.** **Severity floor: `Critical`/`High`/`Medium` only** — a `Low` keeps its `reports/bugs/open/` draft, is named in the 5e comment and `summary.json.bugs_not_filed`, and gets no tracker item, in either shape. Relationship by provenance: IN-SCOPE → Sub-task · PRE-EXISTING → link only · OUT-OF-SCOPE → standalone + related · **`BL-A11Y-*` on a functional/feature/E2E ticket → standalone + related, at its real severity, and it does NOT fail 5c** ([`triage.md`](../skills/qa-test/triage.md) §7a) | inline |
| **5e** | Report | Feed + independently ratify the Feature Release Gate · post the tracker comment (**incl. the mandatory `Not filed (below severity floor)` line, `None` when empty**) · persist `summary.json` + update the checklist in place with verdicts · output the one chat report | verifier |
| **5f** | Change status | **After** the report, **ask first**, `qa-lead` only. PASS / PASS WITH NOTES → TESTED · FAIL → REOPEN with failures + bug links · **BLOCKED → NO transition + a mandatory comment naming the blocker** (the ticket stays in-testing: TESTED would be a lie and REOPEN files an env blocker into the dev queue). **TESTED is the terminal state this command may reach — never Done or Cancelled.** One row per verdict, the record, and the per-flow ownership: [`ticket-status-transitions.md`](../knowledge/execution/ticket-status-transitions.md) | — |
| **5h** | Publish documentation | **After** TESTED, **both paths**. Write the §3/§4/§5 guides for the surface the ticket moved into `reports/ba/`, then post them as **ONE tracker comment with a section per audience** — audiences from the §9.1 layer row, size caps and the three refusals (`layer-unresolved` · `not-deployed` · `not-user-visible`) in [`knowledge/ba/virto-doc-style.md`](../knowledge/ba/virto-doc-style.md) §10. Not a release note: no version literals, and the audience is a floor rather than the only one. **A non-`PASS` verdict scopes this step rather than refusing it** — document the passing paths, omit the failing ones, carry the `Not documented` line and the verbatim verdict; its precondition is **5f having run**, not the ticket having reached TESTED — a FAIL run transitions to REOPEN and would otherwise refuse exactly the runs this rule exists to scope. Ask before posting; refuse rather than pad. An existing guide for this surface is **amended, never forked** (`2-map` names it) | inline |
| **5k** | Iterate (`--iterate` only) | The bounded test → fix → re-test loop. **Per round (≥2), at the head of the round:** `5k.0` round entry — probe the build, then re-read the board (the ticket's sub-tasks + linked bugs), verify each fix-ready bug with `/qa-verify-fix` **inline**, hop a VERIFIED one to `TESTED` **only if its fix is merged and in the probed build**, then re-run the failed cases / checklist items. **Per round:** 5a–5d + a short round-delta comment + `summary.json` + an appended checklist section. **At loop exit, once:** 5e in full → 5f → 5h → 5g. So a `--iterate` run posts **one** QA-Complete comment and makes **one** transition **on the ticket under test**, whatever the round count — a bug sub-task verified at round entry takes its own hop, capped at `TESTED` ([`ticket-status-transitions.md`](../knowledge/execution/ticket-status-transitions.md) §5a). Which durable step runs per round vs at exit, and why each: [`skills/qa-test/modes.md`](../skills/qa-test/modes.md) §5k | round cap · deploy confirm · G0 BAIL → STOP |
| **5g** | Promote (FULL only) | Harvest `{OBSERVED}` via `--verify --fix`, re-derive G10, then flip `Draft → Automated` via **`npm run tc:promote:apply`** — never by hand-editing the cell, and never via bare `tc:promote`, which is the **dry run** and writes nothing. It writes `Automated` **only**, onto rows that are exactly `Draft`; `Reviewed`/`Manual` stays a human call. Runs **last and non-blocking**: the close-out is already delivered | **hard STOP** + verifier |

**Severity is graded at 5a and never re-graded at 5d** to move a finding across the floor. Filing and
failing stay separate decisions: a `Medium` files without failing the ticket.

**Verifier cadence inside the loop.** On `--iterate`, the **5b** verifier re-ratifies **once per round**
(the verdict gate is what decides whether there is another round), while the **5e** and **5g** verifier
dispatches fire **once, at loop exit** — there is one release, so there is one recommendation and one
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
  unconfigured; a correlated error gets no separate `BUG-AI-*` draft (5d's `/qa-bug` owns it).
