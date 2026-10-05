---
name: qa-test
description: "[QA Methodology] Methodology for the /qa-test ticket-testing lifecycle — the Test Model (fault model), case authoring and per-surface fan-out, and the Step-5 close-out. The command is the orchestration shell; this skill holds the reasoning behind each step. Read the file for the step you are in."
argument-hint: "(read by /qa-test — not usually invoked directly)"
disable-model-invocation: true
---

# `/qa-test` methodology

[`/qa-test`](../../commands/qa-test.md) is the orchestration shell: what runs, in what order, and the
gate each step must clear. **This skill is the reasoning** — why each rule exists, what it was measured
against, and what goes wrong without it. Same split as
[`/qa-design`](../../commands/qa-design.md) ↔ [`skills/qa-design/`](../qa-design/SKILL.md).

The command is normative and self-sufficient for running the pipeline. Read the file here for the step
you are in when you need to make a judgment call the command's gate does not settle, or when you are
about to change how a step works.

| File | Covers | Read it when |
|---|---|---|
| [`preflight.md`](preflight.md) | Steps **1a–1b** — the fetch, the classify/route branch, the two I/O waves | Running or changing pre-flight |
| [`../qa-test-model/test-model.md`](../qa-test-model/test-model.md) | Step 1e — moved to `/qa-test-model`, which 1e invokes. The fault model: why Part 0 comes first, the eight rules the scenario table must satisfy, Part 0r, the gate, worked refs | Building or reviewing a Test Model |
| [`authoring.md`](authoring.md) | Steps 2–3 — oracle loading, Artifacts A/B/C1, the scaffold + KEEP gate, the per-surface fan-out (3b), review/auto-fix | Authoring cases, or changing how they are authored |
| [`close-out.md`](close-out.md) | Step 5 **spine** — AC/DoD reconciliation, the verdict table, the severity floor on filing | Deciding what the run concluded |
| [`triage.md`](triage.md) | **5-triage** — correlate, validate evidence, classify, provenance, severity, dedup | Turning raw results into findings |
| [`reporting.md`](reporting.md) | **5-report · 5-status · 5-docs** — the release gate, the tracker comment, `summary.json`, the checklist, the transition | Delivering the run |
| [`axes.md`](axes.md) | The six pre-flight axes as ONE mechanism — the contract they share, and the fail-CLOSED/fail-OPEN split the old "same discipline" phrasing hid | Adding an axis, or deciding whether one runs on FAST |
| [`visual-axis.md`](visual-axis.md) | The visual axis — the `visual_surface` derivation, surface → axes → executor, the invariant-blocks/spec-advises verdict rule, the browser budget | A UI-visible ticket, or changing how design/a11y is scheduled |
| [`contract-refresh.md`](contract-refresh.md) | The contract-refresh axis — the `contract_surface` derivation at `1b` 2d, the two-artifacts/two-commands split, `UNKNOWN` never falling back, drift as a `1e` input | A ticket touching GraphQL/xAPI, or changing when the schema + fixtures are refreshed |
| [`coverage-triage.md`](coverage-triage.md) | The coverage-triage axis — the `coverage_surface` derivation at `1b` 2e, the `2a` phase's four dispositions, and why a `RE-BASE` is resolved BY the run rather than before it | A change that renames, moves or removes something existing cases already assert |
| [`exploratory-lane.md`](exploratory-lane.md) | Step 3x — the discovery lane: why it runs beside 3a and before authoring, the five charter sources, the four routed outputs | A FULL run, or changing when discovery happens |
| [`modes.md`](modes.md) | `--epic` and `--iterate` (5-loop) | Running either opt-in mode |
| [`sequencing.md`](sequencing.md) | Ordering (what may move) and concurrency (what batches, what must stay serial) | Changing the step order, or batching / parallelising a step |
| [`context-wave.md`](context-wave.md) | Steps 1r · 1c · 1c-map · 1d — the FULL-only context wave: briefs, returns, what each carries | A FULL run's context dispatches |
| [`dispatch-pack.md`](dispatch-pack.md) | What a brief carries as TEXT and what stays a PATH | Writing any dispatch brief |
| [`ui-kit-class.md`](ui-kit-class.md) | The `ui-kit` shape class — when the change IS the design system | A design-system / token / primitive change |
| [`technical-change.md`](technical-change.md) | The `technical-change` FLOW — a refactor, migration or dependency bump | A change with no user-facing subject |
| [`../../templates/test-model.md`](../../templates/test-model.md) | The Test Model fill-in shape + the authoring-plan JSON shape | Writing the model or a plan |

## The two things that hold the whole pipeline together

**1. The value chain is derived before anything else, and everything hangs off it.** EP, BVA, DT, ST, PW,
CT and EG are all *parameter-space* techniques: each refines a link that has already been named, and none
of them can name the chain. Run against an unnamed chain they faithfully produce per-screen field checks
that are individually well-formed, strongly asserted, and collectively unable to notice the feature does
not work.

Measured on Loyalty Missions (VCST-5320/5346): **127 cases**, of which the 71-case storefront suite placed
**zero** orders and 54 of its cases never left one page; the mechanism end-to-end (order → progress →
completion → points credited) got **11%**; the last link — spending what the feature grants — got **one**
case, written on the final day; **zero `BL-*` invariants existed for the domain**, so the corpus recorded
behaviour instead of judging it; and no model was written at all (`reports/ba/test-models/` was empty).
`npm run tc:rank` scored that storefront suite as *strong* (41 `INV`, 58 `KEEP`) — assertion strength says
whether a check **can fail**, chain coverage says whether anyone **cares if it does**, and only the second
one culls a garbage case.

**2. Silence is never an answer.** Every sweep, matrix cell, waiver, exclusion and below-floor finding is
stated explicitly, because in every one of these places an omission is indistinguishable from a clean
result:

| Place | A blank reads as | So the rule is |
|---|---|---|
| Mechanism coverage matrix cell | covered | scenario # or `GAP` / `WAIVED + reason` |
| Reverse edges | no reverse effect exists | covered by #, or `ABSENT IN PRODUCT` (a finding) |
| Archetype / UIP sweep | not applicable | covered by #, or `WAIVED + reason` |
| Regression Scope Exclusions | the suite passed | name every suite that contributed zero cases |
| 5-file below-floor findings | nothing minor was found | `Not filed (below severity floor): None` |
| A checklist condition with no case | condition covered | list it as uncovered |
| An absent `contract` block | the schema was fresh | record `contract_surface` + its sources, or `UNKNOWN` |

## Effort routing, and why the FAST/FULL line sits where it does

FAST used to drop only the two `1` agents and the verifiers while keeping the Test Model, both sweeps, the
whole Step-2 oracle load, case authoring and every phase of Step 5 — everything expensive was marked
*"both paths, always."* Four of five recorded runs took FAST, so that is the path most of the cost sat on.
The split made FAST a checklist and nothing else.

**Then it grew back, and this is the part worth remembering.** Between 2026-08 and 2026-09-03 four derived
axes were added — visual, contract, coverage, discovery — and three of them were marked to run on FAST,
each with a locally reasonable argument of exactly the same shape: *the change class most likely to break
X is the class FAST routes.* Every one of those arguments is true. Collectively they returned FAST to
**4–6 agent dispatches and 3 external command invocations**, and the phrase *"both paths"* reappeared 15+
times across the surface — one file conceding the axis ran on FAST *"despite FAST being 'a checklist and
nothing else'"*. **A promise that is re-litigated per feature is not a promise**; the cut has to be a
default that a flag opts out of, not a principle each new axis argues past.

So the axes are now **opt-in on FAST** (`--visual` / `--contract` / `--coverage` / `--axes`) and unchanged
on FULL ([`axes.md`](axes.md) §4). The measured position when that was decided: `visual` had run once in
28 runs, `contract` once, `coverage_triage` zero times. **Revisit each at 5+ runs** — the flags are one
keystroke, and the evidence to promote one back is cheap to collect.

Two consequences of the FAST cut are deliberate and worth stating rather than discovering:

- **A FAST run authors no test cases**, so a bug fix no longer contributes regression coverage through
  `/qa-test`. That is the price of the cut; the route back in is `/qa-test-lifecycle`, unchanged. If a fix
  genuinely needs a durable regression case, that is itself a signal to take FULL.
- **The checklist is therefore the run's only durable record** of what was checked — which is why it is
  written to the ticket folder (Artifact B) instead of scrolling past in the terminal.

The tie-break for an unresolvable token is **`ticket-routing.md` §5's, and only there** — this file argues
where the line sits, that one states which side of it an unestablished token falls on. Four copies of that
one sentence is how it got inverted for a day without anything noticing.

## The verifier, in one place

The FULL path dispatches a **fresh `qa-lead-orchestrator` in §Verifier Mode**
([`.claude/agents/qa-lead-orchestrator.md`](../../agents/qa-lead-orchestrator.md)) **twice: Step 3 and
Step 5-report — only the first is a hard STOP.** 5-report ratifies without holding the close-out: it
re-derives the recommendation. (Two more went: `5g` on 2026-09-10 with promotion, `5b` on 2026-09-16 —
folded into `5-verdict` as an inline self-check.) What makes the
verifier independent rather than ceremonial:

- It **re-derives evidence from source** — re-runs the deterministic core (`suites:review`, `td:validate`,
  `compute-metrics.ts --gate feature`), re-opens the evidence artifacts, and delegates any live re-check to
  a specialist on a **different browser lane** than the doer used. **So the verifier is the one dispatch
  that is only half packable:** rule text may be handed to it (an extract is the oracle, verbatim, not a
  reading of it), but the doer's artifacts, script output and observations never may — supplying those
  turns an independent check into a ratification of the doer's own cut
  ([`dispatch-pack.md`](dispatch-pack.md) §Stays a path — or stays out).
- It never APPROVEs on the doer's summary, and biases **when-in-doubt-REJECT**.
- It is **never** the inline orchestrator running the pipeline and **never the step's own doer** —
  dispatching it is a scoped single-gate check, not handing off the orchestration.
- **Loop = 1 round.** `REJECT → REASONS + FIX → the doer fixes → re-verify once`. Still not APPROVE →
  **STOP** for a human. A persistent REJECT never silently proceeds.

Every other step — 1, 2, 4, 5-file, 5-status, 5-docs — and the entire FAST path self-check inline. Diagram + role/hand-off detail:
`docs/qa-test-flow.md`.

## Ordering — what may move, and the three things that may not

Moved to [`sequencing.md`](sequencing.md) §Ordering — read it before changing the step order.

## Concurrency — the unit to save is a ROUND-TRIP, not a second

Moved to [`sequencing.md`](sequencing.md) §Concurrency — read it before batching or parallelising a step; the
never-parallelise table is there.

## Agent dispatch — routing and the prompt contract

| Affected area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search, mobile | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL, backend | `qa-backend-expert` | `playwright-edge` |
| Storybook components, accessibility, design system, the `vs. DESIGN` spec diff | `ui-ux-expert` | Chrome DevTools MCP |
| Cross-browser, debugging | `qa-testing-expert` | `playwright-firefox` |
| **Step-3x discovery (FULL)** — **invoke `/qa-exploratory ticket <ticket-key>`**, do not hand-roll a session | that command's own | any free browser lane (all 3 click since 2026-09-08) |

The last row is a **Step-3 phase, not a Step-4 lane** — it has closed before execution dispatches, so it
never counts against the max-3 cap that governs the rows above it.

**Minimum dispatch — and it is capped at THREE, which the old wording could exceed.** backend-only →
`qa-backend-expert`; frontend-only → `qa-frontend-expert`; both → both in parallel; **`visual_surface: true`
→ add `ui-ux-expert`** (the visual lane); P0 or critical-revenue → **add a second execution pass, not a
fourth agent** (see below). **FAST → one execution agent** (the single owning specialist) **plus the visual
lane when `visual_surface: true`** — the one documented exception, reasoned in
[`visual-axis.md`](visual-axis.md) §5.

**Two hard corrections to what this table used to say:**

- **The cap is 3 and it binds.** `both → both` (2) + `ui-ux-expert` (3) + `qa-testing-expert` (4) exceeded
  `.claude/rules/agents.md`'s *"max 3 concurrent browser agents total (QA + BA combined)"*. A P0
  cross-layer UI ticket hits exactly that combination, so it was not a corner case. **Resolution: the
  P0 extra pass is SEQUENCED, never a fourth concurrent lane** — and since 2026-09-10 the sequence is a
  stated priority order rather than a fixed list: **`3x` > execution (`4a`) > visual (`4v`) > `1r` >
  C1 (`4c`)** ([`qa-test.md`](../../commands/qa-test.md) Step 4). `3x` leads not because it matters more
  than the verdict but because it is upstream of the checklist the verdict rests on. State the order
  chosen. Counting the lanes before dispatching is part of the step, not an afterthought.
- **The P0 / critical-revenue extra pass takes any free click-capable lane** — `playwright-firefox`
  included since 2026-09-08, unless `defaults.firefoxClickOk` in `config/test-suites.json` is `false`,
  in which case `browserDenyListFor` denies it (`.claude/rules/agents.md` §Parallel Execution). No
  eligible lane free ⇒ **QUEUE**.

`visual_surface` is derived at `1b` item 2c, recorded with its sources, and replaces the undefined
*"UI/component"* trigger this table used to carry — a phrase no gate ever checked was applied. The lane's
targets, the three axes it runs, the verdict vocabulary and the browser-budget ordering all live in
[`visual-axis.md`](visual-axis.md); **do not restate them here.**

Each ticket-agent prompt must carry: the ticket ID; **Artifact B** checklist; **test data** (the `@td()`/`{{VAR}}` the cases use, confirmed seeded — never
hardcode IDs, `.claude/rules/test-data.md`); the **`BL-*`** rule text + **`ECL-*`** patterns from Step 2
(**cut them, do not re-summarise them**: `npm run bl:extract -- --domain <d>` and
`npm run ecl:extract -- --domain <d>` emit the oracles' own markdown verbatim — what may travel as text
and what must stay a path is [`dispatch-pack.md`](dispatch-pack.md));
the browser server; env URLs; the screenshot path; and the evidence-capture policy. **Artifact C1 is NOT in
the agent prompt** — it goes to `/qa-regression`.

**Artifact A is NOT in the agent prompt either, since 2026-09-10.** It used to be, and `4c`'s C1 run
executed the same rows — so every authored case ran twice, and only C1 emits the `RUN_ID` promotion needs,
so the agent's copy grounded nothing ([`regression-promotion.md`](../../knowledge/execution/regression-promotion.md)). **Track `4a` is the checklist's
home; `4c` is the cases'.** Removing the rows is also what lets `4a` dispatch before authoring has
finished — an agent briefed with rows that do not exist yet cannot start early.

```
Test <ticket-key> on the [backend/frontend].

Context: [what changed]
Environment: {FRONT_URL} / {BACK_URL}   Browser: {BROWSER_SERVER}
Screenshot output: reports/tickets/{SPRINT}/<ticket-key>/<env>/screenshots/

Testing checklist (Artifact B): [from Step 3]
Test data: [the @td()/{{VAR}} the cases use — confirmed seeded; resolve at runtime, never hardcode]

Scope: run ONLY the checklist above. Do NOT run regression suites in this session.

Business Rules (must verify): BL-CART-001: [text]; BL-PAY-003: [text]
Edge cases to cover: ECL-1.1: [pattern]

Evidence policy: .claude/skills/qa-evidence/evidence-capture-policy.md — screenshots on failures + final
state of critical flows; console errors only; network 4xx/5xx + >2s; HAR always.

Always-on bug detection (.claude/knowledge/agents/qa/shared-instructions.md §Always-On Bug Detection): the checklist is the floor, not
the ceiling. Hunt across EVERY layer (UI/visual, functional, console, network, GraphQL errors[] inside
200, a11y, perf); file any incidental defect (out-of-scope-bug rule). Verify before filing (disabled
control / API-only / by-design are not bugs).

Return results (pass/fail per case, evidence refs, bugs found) in your final response — per
.claude/rules/reports.md §1 do NOT write a report file; the orchestrator folds them into the Step 5 report.
```

## What persists

Per [`.claude/rules/reports.md`](../../rules/reports.md) §1 — that file is the single source of truth:

| Artifact | Path | Category |
|---|---|---|
| `summary.json` (incl. `timing`, `bugs_not_filed`) | `reports/tickets/{SPRINT}/<ticket-key>/<env>/` | 6 |
| `testing-checklist.md` (Artifact B) | same folder | 6 |
| Evidence screenshots | same folder `screenshots/` | 6 |
| `design-report.md` — **only when the Step-4 visual lane ran** (`visual_surface: true`) | same folder | 6 |
| Test Model (FULL only) | `reports/ba/test-models/<TICKET>-<date>.md` | 3 |
| New test cases | `regression/suites/<layer>/<module>/*.csv` | 2 |
| Discovery session report (3x, FULL only) | `reports/exploratory/SBTM-<ticket-key>-<date>.md` | 8 |

`ac-analysis.md` and `test-execution-report.md` are **terminal-only** and have no reader beyond their own
run — the AC table lives in working context and is folded into the one Step-5 chat report. Authoring plans
and staged CSVs live in the scratchpad and are not artifacts.
