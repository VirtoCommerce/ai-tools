---
applicability: universal
applicability_rationale: "The QA team's every-run rules — classification, observation, grounding, real-user browsing, evidence, sign-off. Deployment specifics live in the topic files it points to and in test-data/, never here."
---

# Shared Agent Instructions — Virto Commerce QA

**Every QA agent reads this file at the start of every run** (qa-frontend-expert, qa-backend-expert,
qa-testing-expert, test-management-specialist, vc-test:ui-ux-expert). It holds only what applies to every
run; each section names the topic file to open when a step needs the detail. Agent prompts cite it and
never restate it.

Your prompt is four layers — business logic (invariants), domain knowledge (judgment), skill set
(technique), design decisions (constraints). This file is the part of them every QA agent shares.

## Judge — Pass/Fail Classification

Every finding is classified against: **RULES** (BL-* invariants), **CONTRACT** (Swagger / GraphQL
introspection — API work), **SPEC** (the ticket's AC), **BASELINE** (known-good behaviour from the
regression suites), **HEURISTICS** (domain knowledge — "this shouldn't happen").

- **PASS ✅** → log it, move on.
- **FAIL ❌** → capture evidence, file the bug with a severity.
- **AMBIGUOUS ⚠️** → flag it to your dispatcher (`qa-lead-orchestrator` in a team run) with context and
  evidence. Examples: a changed label (intentional?), a new console warning (harmful?), 5% slower (noise?).

## Business Logic Reference

The BL oracle is one domain per `knowledge/oracles/bl/<slug>.yaml`. Read it with
`npm run bl:extract -- --domain <d>` (`bl:extract:list` prints the domains), never the generated markdown.
Observed behaviour that violates an invariant is a FAIL even when no ticket spec covers it.

**A brief that already contains an extract is the source — do not re-read the oracle.** An extract
(`bl:extract`, `ecl:extract`) is the oracle's own text, sliced verbatim, and says which ids it holds. It
is a SUBSET: work that touches a domain it does not cover means asking for that scope or reading the
oracle — "not in my extract" never means "no rule applies". No extract in the brief ⇒ read the oracle for
the domains your task touches. A packed fragment stamped with a rev is only as current as that rev; one
stamped `UNKNOWN` is a hypothesis. What may travel in a brief:
[`skills/qa-test/dispatch-pack.md`](../../../skills/qa-test/dispatch-pack.md).

## Always-On Bug Detection — Continuous Observation (MANDATORY, every agent, every run)

The script is the floor of your attention, never the ceiling. Whatever the task — a case, a checklist
item, a suite, a fix verification, a smoke — watch every channel on every screen after every action:

| Layer | What to notice |
|-------|----------------|
| Visual / UI | Layout break, overlap, clipping, off-grid spacing, CLS/shift, broken image, wrong/missing state, absent empty state |
| Functional | Wrong result, stale data, control that does nothing, state not persisting, miscalculated total, broken navigation |
| Console | JS exception, unhandled rejection, Vue/Angular warning tied to behavior, CSP violation |
| Network | 4xx/5xx, GraphQL `errors[]` inside HTTP 200, request > 2s, duplicate or missing call |
| API / data | Schema mismatch, cascade failure, orphaned record, wrong status code |
| A11y | Missing label/alt, broken tab order, no focus indicator, low contrast, target size below gate |
| Performance | LCP/CLS/TTI over budget, visible jank, memory growth on repeat open/close |

- **Out-of-scope bugs are reported, separately.** A defect unrelated to the current case gets evidence and
  its own report, cross-linked to where you saw it; the case's verdict stays decided by its own assertions.
- **Pursue every "huh."** An unexpected observation gets a follow-up before you dismiss it.
- **This widens what you look at, not what you call a defect** — the Live-Verification Policy below still
  governs filing (a disabled control is validation working; an API-only repro is not a UI defect).
- **Discovery pass — ticket / feature / PR work only, not bulk regression:** ~5–10 min of surprise-seeking
  plus one adversarial tour or persona, aiming for one scenario the existing cases miss. Method:
  `/qa-exploratory`, `/qa-sbtm`; known patterns: `knowledge/oracles/vc-bug-catalog.md`.

## Self-Check & Verify Work (MANDATORY, every agent, every run)

A tool call succeeding is not proof. Before you report: **re-read what you changed** (no stale selector,
renamed field, dangling link, wrong CSV column count); **run the gate that exists for it** (`td:validate`,
CSV validation, fixture validation) and read the result; **reconcile against live or source**, never memory;
**report honestly** — what you verified and how, what failed or was skipped. Expect an independent checker
to re-derive your result (in `/qa-test`, `qa-lead-orchestrator` in verifier mode): cite case ids, leave the
evidence file, name the command that proves the claim.

## Product behaviour — ask VirtoOZ, never guess (MANDATORY, every agent, every run)

For how the platform is **supposed** to behave, ground in this order: **(1)** this repo's knowledge — the
domain map `knowledge/domain/<slug>.md`, the BL/ECL oracles, `.claude/ROUTING.md`; **(2)** VirtoOZ (connector;
which tool answers which question: [`../../execution/doc-sources.md`](../../execution/doc-sources.md));
**(3)** the module repo's `README.md` + `docs/` at the deployed version's tag; **(4)** live / source.
For what the platform **does**, `kb_ask` comes before step 3 and before grepping an oracle — your lifecycle
carries the ASK and BANK steps. Rule: [`CLAUDE.md`](../../../../CLAUDE.md) §Essential Rules → *Product context*.

A doc claim in a report, case or verdict is a **verbatim quote with its URL**, or it is not evidence. Live
behaviour contradicting the docs is a **finding** — report both. A released feature VirtoOZ does not
document is a finding too, never "no requirement". Full rules (maturity table, doc drift, closing the loop):
[`grounding.md`](grounding.md).

### Module repo docs

Read the touched module's `README.md` + `docs/` at the tag the stand reports (`/api/platform/modules`),
never `dev`. Mandatory when VirtoOZ is thin, and for a NEW feature. How, provenance, drift:
[`grounding.md`](grounding.md) §Module repo docs — README.md + docs/.

### What VirtoOZ is authoritative FOR

Mechanism, gating and semantics → `{DOC}`. Exact UI strings, control types, layout, counts and ordering →
live only, `{OBSERVED}`. A documented rule binds only to the surface the doc names, and a doc contradicting
an existing case is a trigger to observe, never to overwrite. Full rule and the incident:
[`grounding.md`](grounding.md) §What VirtoOZ is authoritative FOR.

## Live-Verification Policy

Verify against live state, in this order, before authoring, executing or filing:
1. **Resolve test data at runtime — never hardcode** (`{{VAR}}` · `@td()` · `live-discover` ·
   `random-data`; `.claude/rules/test-data.md`).
2. **Validate GraphQL against the live schema** — never trust a count or a snapshot's age you did not check.
3. **Verify selectors and state against the live UI** before relying on an old selector.
4. **Verify source data and design intent before filing** — a disabled state is often a flag, role or rule.
5. **Ground new-feature assertions live** — every assertion carries `{SPEC}`/`{BL}`/`{DOC}`/`{OBSERVED}`;
   a `{HYPOTHESIS}` is phrased as a question.

Each check's detail and commands: [`live-verification.md`](live-verification.md).

## Browser Interaction — Mandatory Real-User Behavior

Drive the browser like a customer: click, type, hover, scroll, wait, use Enter/Tab/Escape; never inject a
URL to skip steps unless the test targets direct navigation; on mobile (≤500 px) open the hamburger before
calling a control missing. `browser_evaluate` / `run_code_unsafe` / `evaluate_script` are blocked by
`hooks/enforce-real-user.mjs` outside its narrow allow-list. Only the Playwright lanes may be used
(`.claude/rules/vc-browser.md`). **Passwords:** type the key's bare NAME (`ORG_USER_PASSWORD`, or
`NAME_<ENV>` on `.env.playwright.all`), never `{{NAME}}` — a miss is silent. Allow-list, password check,
the anti-example: [`browser-rules.md`](browser-rules.md).

### Hard rules — do NOT do these

1. **Never force a disabled or blocked control.** Disabled Save = validation working, NOT a bug. Do not programmatically click, dispatch events, remove `__disabled`/`pointer-events`, or keyboard-force a submit. If the UI blocks the action, the real-user verdict is "blocked by validation," full stop.
2. **Never conflate an API-only repro with a UI-layer defect.** A direct REST/GraphQL call that returns 500 proves the API layer only — it never proves the SPA "has no validation." In the 4-layer table, an API-only finding is Layer-4 FAIL with Layer-2 (Admin SPA) marked PASS/N/A. Label such bugs "API-only (UI blocks this)" in the title.
3. **Never use `browser_evaluate` to read screen content.** Use `browser_snapshot`. The exceptions are extracting a value genuinely not exposed in the DOM tree, the documented GraphiQL JWT paste, GA4 `dataLayer` inspection, or payment-iframe console capture — and each must include an inline comment explaining why a real-user action was insufficient.

## Evidence and output

Screenshots only for a FAIL, a bug report, documentation, visual regression, or a tracker comment that makes
a UI claim; console errors and warnings; 4xx/5xx, slow and `errors[]`-in-200 requests; HAR always in a
browser session; API traces with request + response. Policy:
[`skills/qa-evidence/evidence-capture-policy.md`](../../../skills/qa-evidence/evidence-capture-policy.md).
What may be written to disk, size caps, and the one-comment-per-ticket rule:
[`.claude/rules/reports.md`](../../../rules/reports.md); tracker comment style:
`knowledge/execution/tracker-ops.md` §5a.

## Escalation Triggers (notify qa-lead-orchestrator IMMEDIATELY)

- Checkout flow broken in any browser
- Payment processing fails (any provider)
- Cart state not persisting across refresh
- Security: XSS, open redirect, exposed credentials
- Performance regression: LCP > 4.0s or API > 5s
- Environment unreachable (3+ failures) → halt remaining tests

## Sign-Off Format

```
@qa-lead-orchestrator: [Feature] Testing Complete

**Feature:** [name]  |  **Ticket:** [VCST-XXXX]  |  **Environment:** [QA]

| Area | Status | Issues |
|------|--------|--------|
| [area 1] | pass/warn/fail | [count] |

Bugs: [list with severity]
Decision: [APPROVED / CONDITIONS / BLOCKED]
Blocking: [none or list]
Full report: {RUN_DIR}/test-execution-report.md
```

**APPROVED**: all critical flows pass, no P0/P1 bugs · **CONDITIONS**: minor P2/P3, known issues
documented · **BLOCKED**: a critical flow broken or a P0 bug. Full tables:
`skills/qa-evidence/sign-off-templates.md`.

## Reference (open the table you need, when you need it)

[`qa-reference.md`](qa-reference.md): the knowledge-base directory and domain maps (**testing a feature?
read its domain map first**), the testing scope, the critical regression areas in priority order, the
skill-per-activity table, environment variables, the agent user pool per browser lane, platform constraints.
