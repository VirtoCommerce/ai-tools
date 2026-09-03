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
| [`test-model.md`](test-model.md) | Step 1e — the fault model: why Part 0 comes first, the eight rules the scenario table must satisfy, the ten-clause gate, worked references | Building or reviewing a Test Model |
| [`authoring.md`](authoring.md) | Steps 2–3 — oracle loading, Artifacts A/B/C1/C2, the scaffold + KEEP gate, the per-surface fan-out (3b), review/auto-fix | Authoring cases, or changing how they are authored |
| [`close-out.md`](close-out.md) | Step 5 **spine** — AC/DoD reconciliation, the verdict table, the release regression (5r), the severity floor on filing | Deciding what the run concluded |
| [`triage.md`](triage.md) | **5a** — correlate, validate evidence, classify, provenance, severity, dedup | Turning raw results into findings |
| [`reporting.md`](reporting.md) | **5e · 5f · 5h** — the release gate, the tracker comment, `summary.json`, the checklist, the transition, the docs | Delivering the run |
| [`promotion.md`](promotion.md) | **5g** — the `Draft → Automated` flip | A FULL run that authored cases |
| [`axes.md`](axes.md) | The four pre-flight axes as ONE mechanism — the contract they share, and the fail-CLOSED/fail-OPEN split the old "same discipline" phrasing hid | Adding an axis, or deciding whether one runs on FAST |
| [`visual-axis.md`](visual-axis.md) | The visual axis — the `visual_surface` derivation, surface → axes → executor, the invariant-blocks/spec-advises verdict rule, the browser budget | A UI-visible ticket, or changing how design/a11y is scheduled |
| [`contract-refresh.md`](contract-refresh.md) | The contract-refresh axis — the `contract_surface` derivation at `1b` 2d, the two-artifacts/two-commands split, `UNKNOWN` never falling back, drift as a `1e` input | A ticket touching GraphQL/xAPI, or changing when the schema + fixtures are refreshed |
| [`coverage-triage.md`](coverage-triage.md) | The coverage-triage axis — the `coverage_surface` derivation at `1b` 2e, Step 2a's four dispositions, and why a `RE-BASE` is resolved BY the run rather than before it | A change that renames, moves or removes something existing cases already assert |
| [`exploratory-lane.md`](exploratory-lane.md) | Step 3x — the discovery lane: why it runs beside 3a and before authoring, the five charter sources, the four routed outputs | A FULL run, or changing when discovery happens |
| [`modes.md`](modes.md) | `--epic` and `--iterate` (5k) | Running either opt-in mode |
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
| 5d below-floor findings | nothing minor was found | `Not filed (below severity floor): None` |
| A checklist condition with no case | condition covered | list it as uncovered |
| An absent `contract` block | the schema was fresh | record `contract_surface` + its sources, or `UNKNOWN` |

## Effort routing, and why the FAST/FULL line sits where it does

FAST used to drop only the two `1` agents and the verifiers while keeping the Test Model, both sweeps, the
whole Step-2 oracle load, case authoring and all seven phases of Step 5 — everything expensive was marked
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

*When in doubt, take FULL* — a real regression is worse missed than a fast run saved.

## The verifier, in one place

The FULL path dispatches a **fresh `qa-lead-orchestrator` in §Verifier Mode**
([`.claude/agents/qa-lead-orchestrator.md`](../../agents/qa-lead-orchestrator.md)) **four times: Step 3,
Step 5b, Step 5e and Step 5g — three of which are hard STOPs.** 5e's Feature-Release-Gate ratification is
the non-blocking one: it re-derives the recommendation, it does not hold the close-out. What makes the
verifier independent rather than ceremonial:

- It **re-derives evidence from source** — re-runs the deterministic core (`suites:review`, `td:validate`,
  `compute-metrics.ts --gate feature`), re-opens the evidence artifacts, and delegates any live re-check to
  a specialist on a **different browser lane** than the doer used.
- It never APPROVEs on the doer's summary, and biases **when-in-doubt-REJECT**.
- It is **never** the inline orchestrator running the pipeline and **never the step's own doer** —
  dispatching it is a scoped single-gate check, not handing off the orchestration.
- **Loop = 1 round.** `REJECT → REASONS + FIX → the doer fixes → re-verify once`. Still not APPROVE →
  **STOP** for a human. A persistent REJECT never silently proceeds.

Every other step — 1, 2, 4, 5d, 5f, 5h — and the entire FAST path self-check inline. Diagram + role/hand-off detail:
`docs/qa-test-flow.md`.

## Concurrency — the unit to save is a ROUND-TRIP, not a second

Measured on vcst-qa, 2026-09-02, so the optimisation is aimed at the right thing: **every deterministic
script in this pipeline costs 1–2 s except one.**

| Script | Wall clock |
|---|---|
| `schema:refresh` / `schema:check` (live introspection) | **~8.5 s** |
| `graphql:fixtures:validate:refresh` (74 documents) | ~1.8 s |
| `suites:lint` (corpus-wide) | ~1.9 s |
| `td:validate` | ~1.3 s |
| `regression:select` | ~1.2 s |

Total deterministic script time across a whole FULL run is well under a minute. So **squeezing script
wall-clock is not where the time is** — parallelising 2d's pair saves 1.8 s, and that is close to the
ceiling for this kind of win. Two things actually cost:

1. **Round-trips.** A numbered list of independent operations, walked one tool call per turn, spends a
   full model turn per item. `1b` has **seven** independent probes/reads; done one at a time that is
   seven turns to accomplish ~3 s of work. Batching them into one message is worth far more than every
   script optimisation in the table above, combined.
2. **Agent dispatches and regression runs**, which are minutes to tens of minutes each. The two largest
   structural wins in the pipeline are both about *what a long-running job overlaps*, not about making it
   faster: **3x runs inside 3a's wall-clock** (one browser lane against a browserless seeder), and **C2
   runs inside 5d + drafting 5e** instead of on the critical path to a verdict that discards its result by
   its own provenance rules ([`close-out.md`](close-out.md) §5r).

   The pipeline already parallelises the dispatches where it can — `1c ‖ 1d ‖ the 2-load oracle read` in
   one message, Step 3's `3a ‖ 3x ‖ B` wave, Step 3b one batch per execution surface, and Step 4's
   execution agents inside the max-3 browser cap. That work is done; do not re-derive it.

**So the rule is: independent operations go out in ONE message; dependent ones state what they consume.**
This is the harness's own guidance applied per step, not a new mechanism.

### `1b` is two I/O waves, not nine steps

| Wave | Contains | Consumes |
|---|---|---|
| **A** — one message | item 1 env health · item 2 build/version (both GitHub reads + the `/api/platform/modules` probe) · item 2-release release-ledger read · item 2b's local reads (suite manifest, repo-router) · item 3 sprint resolve → item 4 duplicate check | only `1a`'s fetch |
| *(no I/O)* | derive **2b** `layer`, then **2c** `visual_surface` and **2e** `coverage_surface` — pure computation over what Wave A returned | Wave A |
| **B** — one message | **2d**'s two refreshers, concurrently ([`contract-refresh.md`](contract-refresh.md) §2) · **2e**'s `npm run tc:scope`, **scope + risk terms ONLY** ([`coverage-triage.md`](coverage-triage.md) §4) | `2b`'s token |

**Wave B's scan takes no `--cases` / `--also-ids`.** Those model what will execute, and neither input
exists yet: Artifact A is authored at Step 3, and the `RE-BASE` ids are the *output* of the disposition
this scan feeds. Passing them would mark every future Draft row `FILTERED_OUT` — the failure Step 2a
exists to prevent. The run-fate prediction is made at the **Step-3 gate re-run**, where both exist.

Two more waves follow the same test, and both were serial for no reason anyone had measured:

| Wave | Contains | Consumes |
|---|---|---|
| **Step 1c/1d + 2-load** — one message | `1c` ‖ `1d` ‖ **the domain-keyed oracle text** (`BL-*` / `ECL-*` / `E2E-*` / `VC-*` / the UI + a11y set) | only `1a`'s domains + `1b`'s tokens — **nothing `1c` returns**, which is why waiting a full dispatch wave to open a markdown file was pure latency. Only `2-topup` (the VirtoOZ gap fill) is genuinely downstream |
| **Step 3** — one message | `3a` test-data ‖ **`3x` discovery** ‖ `B` checklist | `1e` + Step 2. `3a` is browserless, `3x` takes exactly one lane, `B` is pure authoring — mutually independent. **Artifact A alone waits on all three** |

Items 3 → 4 stay ordered inside Wave A as the command states. They are both local globs costing
milliseconds, so splitting them buys nothing — **and that is the general test: parallelise where the
operations are independent *and* the cost is real.** Reordering something free to look concurrent is
churn.

### What must NOT be parallelised — each for a reason the repo paid for

Do not read the above as "parallelise everything." Every entry here is a place where concurrency has a
known cost, and three were measured:

| Never | Because |
|---|---|
| `2d` concurrently with `1c` / `1d` / `1e` / the 3b pack | they READ what it writes; a refresh that races its readers is a refresh that did nothing |
| Two writers on one suite CSV — the Step-3b append stays **serial**, `suites:sync` runs **once** | `suites:lint`/`sync` hard-fail on a parse error anywhere in the corpus, so N parallel writers multiply a tree-wide outage by N and block every other author in the tree (`.claude/rules/regression.md` §WORKING IN A SHARED TREE — measured: one mid-write invalid CSV blocked two sessions' gates for ~15 min) |
| `suites:sync` ‖ `suites:lint` | lint reads what sync wrote |
| Artifact A ‖ 3a, or Artifact A ‖ 3x | cases are authored against fixtures that already resolve **and against the model 3x amended**. Authoring beside the discovery lane produces cases written from the guesses the lane exists to replace — the lane's value is entirely in the order ([`exploratory-lane.md`](exploratory-lane.md) §2) |
| `3x` ‖ Step 4's execution agents | the lane closes before Artifact A, which closes before Step 4, so the max-3 cap holds **by construction** and needs no arbitration. Overlap them and it does not |
| Two suites ‖ on one disposable fixture set | **measured**: `075d` lost 5 of 34 cases to fixtures suite `083d` had already consumed on the same accounts. Serialise with a re-seed between, or give each its own accounts (`.claude/rules/test-data.md` §The scope of "isolated") |
| More than 3 browser agents, or two agents on one session | the lane cap is hard, and a shared session means agents fighting over navigation and cookies |
| A verifier ‖ its own doer | the verifier re-derives evidence *after* the doer's write; concurrent, it verifies a half-finished step. The three gates are sequential by design |
| `--iterate` rounds | test → fix → deploy → re-test is inherently serial |

## Agent dispatch — routing and the prompt contract

| Affected area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search, mobile | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL, backend | `qa-backend-expert` | `playwright-edge` |
| Storybook components, accessibility, design system, the `vs. DESIGN` spec diff | `ui-ux-expert` | Chrome DevTools MCP |
| Cross-browser, debugging | `qa-testing-expert` | `playwright-firefox` |
| **Step-3x discovery (FULL)** — **invoke `/qa-exploratory ticket <ticket-key>`**, do not hand-roll a session | that command's own | `playwright-chrome` / `playwright-edge` — **never firefox** |

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
  P0 extra pass is SEQUENCED, never a fourth concurrent lane** — run `checklist → visual → C1` and state
  the order chosen, which is what Step 4 already instructs. Counting the lanes before dispatching is part
  of the step, not an afterthought.
- **A P0 / critical-revenue ticket must NOT go to `qa-testing-expert` on its default lane.** That default
  is `playwright-firefox`, and `.claude/rules/agents.md` states the harder rule: *"never schedule a
  click-driven suite on firefox — cart, checkout, merge, PDP interaction, sign-in, or **any** Admin SPA
  suite"* (confirmed 6×; a firefox placement costs a whole wasted attempt, not a degraded one). A P0
  critical-revenue flow **is** click-driven by definition, so the two rules pointed in opposite
  directions. **Resolution: the extra P0 pass runs on a free chrome/edge lane** — that file's hard rule
  outranks its own per-agent default table, exactly as `/qa-exploratory` already overrides it. If no
  chromium lane is free, **QUEUE**; never fall back to firefox.

`visual_surface` is derived at `1b` item 2c, recorded with its sources, and replaces the undefined
*"UI/component"* trigger this table used to carry — a phrase no gate ever checked was applied. The lane's
targets, the three axes it runs, the verdict vocabulary and the browser-budget ordering all live in
[`visual-axis.md`](visual-axis.md); **do not restate them here.**

Each ticket-agent prompt must carry: the ticket ID; **Artifact A** (target suite path + row IDs);
**Artifact B** checklist; **test data** (the `@td()`/`{{VAR}}` the cases use, confirmed seeded — never
hardcode IDs, `.claude/rules/test-data.md`); the **`BL-*`** rule text + **`ECL-*`** patterns from Step 2;
the browser server; env URLs; the screenshot path; and the evidence-capture policy. **Artifact C is NOT in
the agent prompt** — it goes to `/qa-regression` (`feedback_long_runner_sessions_unreliable`).

```
Test <ticket-key> on the [backend/frontend].

Context: [what changed]
Environment: {FRONT_URL} / {BACK_URL}   Browser: {BROWSER_SERVER}
Screenshot output: reports/tickets/{SPRINT}/<ticket-key>/screenshots/

Test cases (Artifact A): <target-suite.csv> — rows [IDs]
Testing checklist (Artifact B): [from Step 3]
Test data: [the @td()/{{VAR}} the cases use — confirmed seeded; resolve at runtime, never hardcode]

Scope: run ONLY the cases + checklist above. Do NOT run regression suites in this session.

Business Rules (must verify): BL-CART-001: [text]; BL-PAY-003: [text]
Edge cases to cover: ECL-1.1: [pattern]

Evidence policy: .claude/skills/qa-evidence/evidence-capture-policy.md — screenshots on failures + final
state of critical flows; console errors only; network 4xx/5xx + >2s; HAR always.

Always-on bug detection (shared-instructions §Always-On Bug Detection): the checklist is the floor, not
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
| `summary.json` (incl. `timing`, `bugs_not_filed`) | `reports/tickets/{SPRINT}/<ticket-key>/` | 6 |
| `testing-checklist.md` (Artifact B) | same folder | 6 |
| Evidence screenshots | same folder `screenshots/` | 6 |
| Test Model (FULL only) | `reports/ba/test-models/<TICKET>-<date>.md` | 3 |
| New test cases | `regression/suites/<layer>/<module>/*.csv` | 2 |
| Discovery session report (3x, FULL only) | `reports/exploratory/SBTM-<ticket-key>-<date>.md` | 8 |

`ac-analysis.md` and `test-execution-report.md` are **terminal-only** and have no reader beyond their own
run — the AC table lives in working context and is folded into the one Step-5 chat report. Authoring plans
and staged CSVs live in the scratchpad and are not artifacts.
