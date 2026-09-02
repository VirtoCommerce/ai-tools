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
| [`test-model.md`](test-model.md) | Step 1e — the fault model: why Part 0 comes first, the eight rules the scenario table must satisfy, the nine-clause gate, worked references | Building or reviewing a Test Model |
| [`authoring.md`](authoring.md) | Steps 2–3 — oracle loading, Artifacts A/B/C, the scaffold + KEEP gate, the per-surface fan-out (3b), review/auto-fix | Authoring cases, or changing how they are authored |
| [`close-out.md`](close-out.md) | Step 5 — triage, AC/DoD reconciliation, the verdict table, the severity floor on filing, the report, promotion | Triaging findings, filing, or promoting |
| [`visual-axis.md`](visual-axis.md) | The visual axis — the `visual_surface` derivation, surface → axes → executor, the invariant-blocks/spec-advises verdict rule, the browser budget | A UI-visible ticket, or changing how design/a11y is scheduled |
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

## Effort routing, and why the FAST/FULL line sits where it does

FAST used to drop only the two `1` agents and the verifiers while keeping the Test Model, both sweeps, the
whole Step-2 oracle load, case authoring and all seven phases of Step 5 — everything expensive was marked
*"both paths, always."* Four of five recorded runs took FAST, so that is the path most of the cost sat on.
The current split makes FAST a checklist and nothing else. Two consequences are deliberate and worth
stating rather than discovering:

- **A FAST run authors no test cases**, so a bug fix no longer contributes regression coverage through
  `/qa-test`. That is the price of the cut; the route back in is `/qa-test-lifecycle`, unchanged. If a fix
  genuinely needs a durable regression case, that is itself a signal to take FULL.
- **The checklist is therefore the run's only durable record** of what was checked — which is why it is
  written to the ticket folder (Artifact B) instead of scrolling past in the terminal.

*When in doubt, take FULL* — a real regression is worse missed than a fast run saved.

## The verifier, in one place

The FULL path dispatches a **fresh `qa-lead-orchestrator` in §Verifier Mode**
([`.claude/agents/qa-lead-orchestrator.md`](../../agents/qa-lead-orchestrator.md)) at three hard-STOP
gates only — Step 3, Step 5b, Step 5g. What makes it independent rather than ceremonial:

- It **re-derives evidence from source** — re-runs the deterministic core (`suites:review`, `td:validate`,
  `compute-metrics.ts --gate feature`), re-opens the evidence artifacts, and delegates any live re-check to
  a specialist on a **different browser lane** than the doer used.
- It never APPROVEs on the doer's summary, and biases **when-in-doubt-REJECT**.
- It is **never** the inline orchestrator running the pipeline and **never the step's own doer** —
  dispatching it is a scoped single-gate check, not handing off the orchestration.
- **Loop = 1 round.** `REJECT → REASONS + FIX → the doer fixes → re-verify once`. Still not APPROVE →
  **STOP** for a human. A persistent REJECT never silently proceeds.

Every other step, and the entire FAST path, self-checks inline. Diagram + role/hand-off detail:
`docs/qa-test-flow.md`.

## Agent dispatch — routing and the prompt contract

| Affected area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search, mobile | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL, backend | `qa-backend-expert` | `playwright-edge` |
| Storybook components, accessibility, design system, the `vs. DESIGN` spec diff | `ui-ux-expert` | Chrome DevTools MCP |
| Cross-browser, debugging | `qa-testing-expert` | `playwright-firefox` |

**Minimum dispatch:** backend-only → `qa-backend-expert`; frontend-only → `qa-frontend-expert`; both → both
in parallel; **`visual_surface: true` → add `ui-ux-expert`** (the visual lane); P0 or critical-revenue → add
`qa-testing-expert`. **FAST → one execution agent** (the single owning specialist) **plus the visual lane
when `visual_surface: true`** — the one documented exception, and the reason for it is in
[`visual-axis.md`](visual-axis.md) §5.

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

`ac-analysis.md` and `test-execution-report.md` are **terminal-only** and have no reader beyond their own
run — the AC table lives in working context and is folded into the one Step-5 chat report. Authoring plans
and staged CSVs live in the scratchpad and are not artifacts.
