---
description: "Test a tracker ticket, feature area, or PR. Step 1a routes by ticket type × status (per ticket-routing.md) to the right flow — a fix-ready Bug runs /qa-verify-fix inline, else feature-test at a fast or full path — dispatches specialist agents, correlates App Insights logs for the test window, and produces a verdict. --iterate drives a bounded test→fix→re-test loop; --epic runs a series of sibling stories with cross-story integration."
argument-hint: "<ticket-key> | feature name | PR #NNN | --epic <EPIC-KEY> [--iterate [--max-rounds N]]"
disable-model-invocation: true
---

# /qa-test — Test a Tracker Ticket or Feature

Analyze scope, dispatch specialist agents, collect results, and produce a verdict. You run this orchestration inline — do NOT delegate to another orchestrator agent.

## Usage
```
/qa-test <ticket-key>                    # Test a specific tracker ticket
/qa-test <ticket-key-1> <ticket-key-2>   # Test multiple tickets
/qa-test checkout flow                   # Test a feature area by name
/qa-test PR #789                         # Test changes in a GitHub PR
/qa-test <ticket-key> --iterate          # Bounded test→fix→re-test loop (default 2 rounds; --max-rounds N)
/qa-test --epic VCST-100                  # Test a parent Epic's child stories in series (ordered, state carried, cross-story E2E)
```

---

## Pipeline: Context · Story · Test Model → Plan → Write·Review·Provision → Execute → Report

Step `1a` routes on **two axes** — first **FLOW** (which pipeline), then, only within the `feature-test`
flow, **EFFORT** (FAST vs FULL, how much of Steps 1/3/5 runs). Both are decided by the ticket's
**type × status** per the single source of truth,
[`.claude/knowledge/execution/ticket-routing.md`](../knowledge/execution/ticket-routing.md) — cite it,
never restate its matrix here:

1. **FLOW** — `verify-fix` · `hotfix-verify` · `feature-test`. A fix-ready **Bug** is a *verification*,
   not a feature test — it runs `/qa-verify-fix` inline (§1a); a hotfix-status Bug points to
   `/qa-hotfix-check`; a Sub-task inherits its parent; everything else is a `feature-test` and continues
   through the five steps below.
2. **EFFORT** — the FAST/FULL table below, which applies **only** to the `feature-test` flow.

| Path (feature-test only) | When | What runs |
|---|---|---|
| **FAST** | Bug fix / copy-tweak / config / Technical task; **P2–P3**, single-layer, single-domain, obvious surface | Skip `1c` BA context + `1d` story review; minimal case authoring; **one** execution agent; **inline self-checks only** (no independent verifier); no exploratory |
| **FULL** | New feature / Story / Epic; **P0–P1**; cross-layer; ≥2 domains; critical-revenue flow; unclear surface | `1c` ‖ `1d` (concurrent) → full Test Model → full authoring → both hard-STOP independent verifiers |

**When in doubt, take the FULL path** (fail-safe: a real regression is worse missed than a fast run saved).

## Quality-gate model

The full path runs a **fresh `qa-lead-orchestrator` instance in §Verifier Mode**
(`.claude/agents/qa-lead-orchestrator.md`) at **two hard-STOP gates only** — Step 3 (artifacts + data)
and Step 5 (triage + verdict, and the Feature Release Gate). It re-derives evidence from source (re-runs
the deterministic core, re-opens evidence, or delegates a live re-check on a **different browser lane**),
never APPROVEs on the doer's summary, and biases **when-in-doubt-REJECT**. It is **never** the inline
orchestrator running this pipeline and **never the step's own doer** — dispatching it is a scoped
single-gate check, not handing off the orchestration.

- **Loop = 1 round:** `REJECT → REASONS + FIX → the step's doer fixes → re-verify once`. Still not
  APPROVE → **STOP** for a human (a persistent REJECT never silently proceeds).
- **Every other step, and the entire FAST path, self-checks inline** — no separate verifier dispatch.
- Diagram + role/hand-off detail: `docs/qa-test-flow.md`.

## Epic mode (`--epic <EPIC-KEY>`) — a series of sibling stories

`--epic` wraps the per-story pipeline to test a whole Epic's child stories **in series**, because a story is
usually one slice whose value only appears in the A→B→C chain. It is a thin orchestration over the same
five steps — it does not change any step's internals.

1. **Resolve + order.** Fetch the Epic and its child stories (`getJiraIssue` on the Epic → children).
   Test only the **testable** ones (Done / Ready-for-test / in the deploy under test); note the rest as
   not-yet-testable. **Order by dependency** — the Epic's flow (A creates → B approves → C converts), read
   from the story order / links / the `1a` Epic-context analysis. State the order chosen.
2. **Run each story through the normal pipeline, in order** (each keeps its own fast/full routing + gates),
   and **carry state forward**: story N's seeded exit state is story N+1's entry precondition — the quote
   `A` created is the one `B` approves. Seed once, cumulatively; don't reset between siblings. A story that
   FAILs or is BLOCKED **halts the chain at that point** (a downstream story that depends on it can't be
   trusted) — report where it stopped; `--iterate` may be combined to try fixing the failing story before
   continuing.
3. **Cross-story E2E.** After the last story, run the **full Epic journey end-to-end** (A→B→C in one flow)
   as the integration proof — the thing no single-story run covers.
4. **Roll up (5h).** Per-story verdicts **plus an Epic verdict**: all child stories GO + the cross-story
   E2E clean + 0 open P0 across the Epic → the Epic's feature is releasable. Recommendation only; a human
   ships. Persist a per-story `summary.json` each, plus an Epic roll-up (`summary.json.epic`).

Human gates are unchanged — every per-story gate still fires, and merge/release stay the human's. Without
`--epic`, a single ticket still gets its **Epic context** (Step 1a) and integration coverage vs Done
siblings, just not the serial multi-story chain.

### Step 1 — Gather Context, Story & Test Model

Five ordered sub-parts (each consumes the one before it, so don't reorder): `1a` fetch, classify & route
→ `1b` pre-flight → `1c` context (FULL) → `1d` story review (FULL) → `1e` Test Model. Story analysis is
**part of this step**: its AC table is a field of the Test Model, the single hand-off to
`test-management-specialist` (Step 3).

#### 1a — Fetch the scope, classify the type × status, route the flow & path

**Fetch first** — every later sub-part depends on these fields.

- **JIRA tickets** — Atlassian MCP `getJiraIssue` (summary, Type, Priority, Status, Components, ACs). If not configured, ask the user to paste the details. Linked PR → GitHub MCP `get_pull_request` + `get_pull_request_files`. Confirm the ticket is in a testable status.
- **Read the ticket comments (both paths, always).** The description is the plan; the **comments are what actually happened** — the real repro, PO/dev clarifications, scope changes, "fixed in build X" / "reopened because…" notes, and prior QA findings the description never carries. Fetch them (Atlassian MCP `getJiraIssue` with the comment field, or `mcp__atlassian__getJiraIssue`/`fetch`; for a PR, `get_pull_request_comments` + review comments). Fold the load-bearing facts into the Test Model `Ticket signals` field (1e) — a comment that narrows the repro or moves the goalposts changes what you test. On a PR, review threads flag the reviewer's own risk areas.
- **Analyze the attachments (both paths, always).** Screenshots, mockups, logs, HAR, and short videos attached to the ticket are primary evidence — don't just note they exist, **open them.** A screenshot usually shows the exact **expected-vs-actual** (seeds the 5b reconciliation and each case's assertion); a **design mockup** is the visual oracle (feeds a `/qa-design`/Figma comparison in execution); a **log/HAR/stack trace** narrows the repro and the affected layer. Download each attachment (its content URL) and `Read` it (images render; parse text logs). Reference the concrete finding, not the filename. If an attachment can't be fetched, note the gap — don't silently skip it.
- **Resolve the parent Epic (when the ticket has one).** A Story is usually one slice of an Epic, not a standalone unit. If `getJiraIssue` returns a parent/epic link, fetch the **Epic** (summary + Epic-level ACs) and its **child-story list with statuses**, and classify the siblings: **Done** = the integration surface this story plugs into (its seams must still work → fold into the checklist + regression selection); **In-progress / blocked** = dependencies (a hard one this story needs may force a BLOCKED verdict or a stubbed boundary — say which); **this story** = the slice under test. Place the story in the Epic's end-to-end flow (what comes before it, what consumes its output). This lands in the Test Model `Epic context` field (1e). Both paths do this (it is a cheap read); no parent Epic ⇒ skip with a one-line note.
- **A PR** — GitHub MCP `get_pull_request` + `get_pull_request_files`; map extensions: `.cs`/`.csproj` → Backend, `.vue`/`.ts`/`.tsx`/`.jsx` → Frontend, `.css`/`.scss` → Styling.
- **A feature name** — use it to determine which areas are affected.
- **Identify applicable domain(s)** — map to the 63 `/qa-checklist` domains.

**Classify the type × status, then route the FLOW — per
[`.claude/knowledge/execution/ticket-routing.md`](../knowledge/execution/ticket-routing.md)** (the single
source of truth for the routing matrix; do **not** restate it here):

1. **Normalize the type** — resolve the JIRA `Type` (`fields.issuetype.name`) / Azure `System.WorkItemType`
   per `tracker-ops.md` §5a, then map to a canonical type (`Story` / `Bug` / `Task` / `Technical task` /
   `Sub-task` / `Epic`) through the profile's `workItemTypes` map. For a PR / bare feature, infer from diff
   size + surface.
2. **Normalize the status to a role** — `fix-ready` / `hotfix-ready` / `not-fixed` / `testable`, resolved
   live (`defect-lifecycle-workflow.md` §2 + `tracker-ops.md` §Live transition discovery). Never hardcode a
   status name.
3. **Look up the FLOW** in `ticket-routing.md` §4, then the **EFFORT** (FAST/FULL) in §5 when the flow is
   `feature-test`. Record **flow + type + path** — all three are `summary.json` fields (5g); the path gates
   Steps 1c/1d, 3 and 5. Fail-safe defaults (§6): unresolvable → `feature-test` FULL; when in doubt → FULL.

Then branch on the resolved FLOW:

- **`feature-test`** (Story / Task / Technical task / Epic, and a `not-fixed` Bug) → continue to `1b` and
  run the five-step pipeline at the resolved FAST/FULL effort. (A `not-fixed` Bug runs FAST to
  reproduce/characterize the defect live and attach fresh evidence — there is no fix to *verify* yet;
  state the next step is `/qa-fix <ticket-key>`.) This is the rest of this document.
- **`verify-fix`** (a `fix-ready` Bug) → **run `/qa-verify-fix` inline (see below)**; do not run Steps 2–5.
- **`hotfix-verify`** (a `hotfix-ready` Bug) → **STOP** with a one-line pointer: `Run /qa-hotfix-check
  <ticket-key>` (hotfix delivery/verification is that command's job). File nothing; transition nothing.
- **`Sub-task`** → resolve the parent work item and re-enter this classification as the **parent's**
  type × status; route on that.

##### Flow = `verify-fix` — run `/qa-verify-fix` inline

When the FLOW resolves to `verify-fix`, `/qa-test` **runs the `/qa-verify-fix` pipeline inline** in this
same session (it already runs its orchestration inline and never delegates to another orchestrator — same
model). The single source of truth for that pipeline is
[`.claude/commands/qa-verify-fix.md`](qa-verify-fix.md) — **execute its Steps 0–7 as written; do not
duplicate or paraphrase them here.** In short: pre-flight → fetch + understand the bug → transition to
in-testing → confirm the fix is deployed → **RED→GREEN two-phase reproduction (3×)** → verification
checklist → decide + transition (VERIFIED / REOPEN / …) → evidence page + `verification-summary.json`.
The feature-test authoring/AC-reconcile/promotion machinery (Steps 2, 3, 5i) is **not** run — a fix-ready
Bug needs its fix verified, not new cases authored. The run ends at the verify-fix verdict.

**Fail-safe (per `ticket-routing.md` §6):** if a `fix-ready` Bug has no STR **and** no linked fix PR,
`verify-fix` has nothing to prove RED→GREEN against → fall back to the `feature-test` FAST path and note
the missing repro basis, rather than forcing an empty verification.

#### 1b — Pre-flight, sprint resolution & duplicate check

Per `.claude/templates/agent-dispatch.md`:

1. **Environment health** — `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version** — GitHub MCP `get_file_contents` on `backend/packages.json` + `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`, or the branch matching `TEST_ENV`). Record platform + theme + ticket-relevant module versions. **PR testing:** confirm the PR's artifact version appears in `packages.json`/`artifact.json`; if not deployed → offer `/qa-deploy-pr <ticket-key>` (**ask first**) or warn and ask whether to wait.
3. **Resolve current sprint** — use `reports/tickets/Sprint-current` if present, else the latest `SprintXX-XX` folder; create if missing. This is `{SPRINT}` for output paths (`reports/tickets/{SPRINT}/`). Resolve **before** the duplicate check.
4. **Duplicate check — across ALL sprints.** Glob `reports/tickets/*/*/summary.json` (per `feedback_duplicate_check_across_all_sprints`) for the same ticket with a `date` in the last 2 hours. If found, warn user and show the previous verdict.

#### 1c — Gather ticket context (FULL path only)

Dispatch `ba-system-analyzer` (read-only, no JIRA/GitHub writes) with the ticket ID(s)/feature/PR + the
raw ticket fields + PR diff **+ the `1a` comment/attachment signals** (a repro in a comment or a log/HAR
attachment often points straight at the affected code site) **+ the `1a` Epic context** (so it maps the
seams between this story and its Done siblings, not just the story's own code). **On the full path, dispatch
`1c` and `1d` concurrently in a single message** — both consume only the `1a` fetch and are independent. It
returns:
- **Affected surface** — module(s)/repo(s), storefront vs Admin SPA vs API/GraphQL layer, concrete code sites (grounded, not guessed).
- **Related flows & integration boundaries** — adjacent features / cross-domain seams (cart ↔ checkout, org ↔ membership, …).
- **Known pain points / historical failures** — cross-referenced to `vc-bug-catalog.md` (`VC-*`) + prior bugs.
- **Docs grounding** — VirtoOZ/VC-doc references for how the feature is *supposed* to behave.

On `ba-system-analyzer` internal error, fall back to gathering context inline (from the `1a` fields +
`get_pull_request_files` diff + `.claude/knowledge/`) rather than retrying. The `1e` Test Model carries the
same fields either way. (On the FAST path this whole sub-part is skipped — note it in one line.)

#### 1d — Review the story (FULL path only)

A strong run starts from strong ACs. **Advisory, never blocking.** Runs for a tracker ticket/story **with
ACs**; skip (one-line note) for a bare feature name or a PR with no governing story.

Dispatch `ba-story-writer` in review mode (Mode B) — analyze only, no new story, no JIRA writes. Pass
`existing_story` (summary + description + ACs from `1a`), any **AC-affecting clarifications from the `1a`
comments** (a comment that redefines expected behavior overrides the stale description), `jira_ref` +
`domains`, and `implementation: { pr_diff }` (the linked PR's changed files — this is the **static** AC↔code
check; the **live** one is Step 5b). It returns:
- **AC Quality Scorecard** — per AC: testable? / clarity / smells / KEEP·REWRITE·SPLIT.
- **Weak sides** — rewrites for ambiguous / non-falsifiable / happy-path-only ACs.
- **AC ↔ Implementation coverage** — per AC: SATISFIED / DRIFT / NOT-FOUND / CONTRADICTS vs the diff, plus unspecified implementation.
- **Gap analysis** — missing ACs (error paths, boundaries, guest/B2B, NFRs, integration seams), each mapped to a `BL-*`/`ECL-*` and phrased as a gap-AC.
- **AC → Test traceability seed** — merged table of atomic testable conditions (story ACs + gap-ACs), each with its `Impl verdict`.

**Surface inline** the weak ACs, DRIFT/CONTRADICTS/scope-creep findings, and gap-ACs, then **proceed** —
fold gap-ACs into scope and carry every DRIFT/NOT-FOUND/CONTRADICTS into execution as a thing to verify
**live** (a static-diff finding is a suspicion, not a defect). The AC traceability table stays in working
context (terminal-only per `.claude/rules/reports.md` §1, no `ac-analysis.md`); it is the spine for Step 3
and Step 5.

#### 1e — Build the Test Model (the Step 1 output)

Distill `1c` context + `1d` story analysis + `1a` scope/domains into one structured model — the coverage
spine Step 3 consumes. Keep it in working context (terminal-only, no file):
```
TEST MODEL — <ticket-key>
Ticket:      <ticket-key> | Type: Bug/Story/Task/Technical task/Sub-task/Epic | Status role: fix-ready/not-fixed/testable | Flow: feature-test | Priority: P0/P1/P2 | Path: FAST/FULL | Changed: Backend / Frontend / Both
Context:     [FULL: ba-system-analyzer | FAST/inline]
Affected surface: [module(s)/repo(s), layer(s), code sites]
Ticket signals: [load-bearing facts from COMMENTS + ATTACHMENTS — real repro, PO/dev clarifications, "fixed in build X"/reopen notes, prior QA findings; screenshot expected-vs-actual, design mockup ref, log/HAR repro]   (from 1a)
Epic context: [parent Epic + goal; this story's position in the E2E flow; Done siblings = integration seams to cover; In-progress siblings = dependencies/blockers]   (from 1a; "none" if no parent)
Domains:     [Cart, Payment, ...]
Flows & boundaries: [cart ↔ checkout, ...]
Risk areas:  [VC-* pain points / historical failures]
AC traceability: [N atomic conditions — story ACs + gap-ACs, each w/ Impl verdict]   (from 1d)
Test scenarios: [enumerated positive / negative / edge scenarios for this feature]   ← authored from in Step 3
User-flow diagram: [Mermaid flowchart of the primary + alternate user paths]         ← authored from in Step 3
Business Rules: [BL-CART-001, BL-PAY-003, ...]   (filled in Step 2)
Edge cases:  [ECL-* patterns]                    (filled in Step 2)
Docs grounding: [VirtoOZ / VC-doc refs]
Agents to dispatch: [list]
```
**`Test scenarios` + `User-flow diagram` are the artifact `test-management-specialist` authors test cases
from in Step 3** — enumerate the scenarios that cover the feature's condition space, and draw the user flow
as a Mermaid `flowchart` (primary path + the alternate/error branches a test must exercise). On the FAST
path the scenario list is short and the diagram may be omitted for a single-surface tweak.

**Gate (inline self-check):** ticket **flow + type + path** set (flow = `feature-test` — a `verify-fix` /
`hotfix-verify` route never reaches 1e); ACs decomposed to **atomic conditions**;
scenarios enumerated; **BL/ECL/domains** and **risk areas** present. On the full path, if the model is
missing an atomic condition or a `ba-system-analyzer` risk area, add it before moving on. (No fresh-`qa-lead`
dispatch here — this is the doer's own completeness check.)

---

### Step 2 — Plan

**Enrich the Step 1 Test Model** with the knowledge/docs it doesn't already carry, then route agents. This
*completes* the model — it does not re-derive what Step 1 populated. Skip anything `1c` already returned.

**Load knowledge files** for the identified domains (from `.claude/knowledge/`) — fill the model's
`Business Rules` / `Edge cases` with the actual rule text + patterns, not just IDs:
- **business-logic.md** — the `BL-*` invariants for the domains (mandatory verification points).
- **e-commerce-edge-cases-library.md** — the `ECL-*` patterns.
- **domain-checklists.md** / **backend-admin-checklists.md** / **graphql-checklist.md** (via `/qa-checklist`) — checklist items for the domains.
- **`.claude/skills/qa-plan/e2e-scenario-catalog.md`** — map to the `E2E-*` scenario(s) and inherit their pre-mapped regression suites (the suite-traceability backbone for Step 3's Artifact C).

**VirtoOZ docs query** (via `/vc-docs`) — **skip when `1c` delegated to `ba-system-analyzer`** (reuse its
docs grounding; top up specific gaps only). Otherwise query the affected domain against the topic-scoped
VirtoOZ tool that fits; fall back to Context7 (`/virtocommerce/vc-docs`, `tokens: 8000`) only if VirtoOZ
returns nothing. **Fold in `ba-system-analyzer` risk areas** (when delegated) as mandatory verification
points alongside the `BL-*` rules.

**Agent routing table:**

| Affected Area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search, mobile | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL, backend | `qa-backend-expert` | `playwright-edge` |
| Storybook components, accessibility, design system | `ui-ux-expert` | Chrome DevTools MCP |
| Cross-browser, Figma comparison, debugging | `qa-testing-expert` | `playwright-firefox` |

**Minimum dispatch:** backend-only → `qa-backend-expert`; frontend-only → `qa-frontend-expert`; both →
both in parallel; UI/component → add `ui-ux-expert`; P0 or critical-revenue → add `qa-testing-expert`.
**FAST path → one execution agent** (the single owning specialist).

**Gate (inline self-check):** every affected domain has its `BL-*`/`ECL-*`/`E2E-*` loaded and an agent
routed. (Verified as part of Step 3's gate on the full path — no standalone verifier pass here.)

---

### Step 3 — Write, Review & Provision (test-management-specialist)

Dispatch `test-management-specialist` to author the test artifacts from the **Test Model's scenarios +
user-flow diagram**, review/auto-fix them, and provision any test data — before Step 4.

**This reuses the same skills `/qa-test-lifecycle` Phases 3–4 use — the owning skills are the single source
of truth; neither command restates them. Read them; do not re-derive them here:**

| Concern | Owner (read it) |
|---|---|
| Case authoring contract, 15-column schema, `Automation_Status` enum | `/qa-test-cases-generator` + `.claude/skills/qa-test-cases-generator/test-case-template.md` |
| Review dimensions, check codes, severities, auto-fix matrix | `.claude/skills/qa-review-tests/SKILL.md` + `review-criteria.md` |
| Behavior-rewrite evidence bar (docs + live + source) | `.claude/skills/qa-review-tests/triangulation-criteria.md` |
| Test-data design + provisioning | `/qa-generate-data` → `/qa-seed-data` (`test-data-engineer`) |
| Write-scope ceiling + revert-on-regression | `.claude/commands/qa-test-lifecycle.md` §Phase 4b |

The specialist produces **three hand-off artifacts**, then reviews/auto-fixes them and provisions data:

**Artifact A — Test cases (authored into the durable suites).** Derive cases from the Test Model's
scenarios + user-flow diagram + `1d` AC conditions (story + gap-ACs) + `E2E-*` scenarios + `BL-*` / `ECL-*`
+ domain checklists.
- **New feature / Story** → **author new** enriched-CSV cases.
- **Bug fix / enhancement with existing coverage** → **map to existing** suite cases (start from the Step-2 `E2E-*` → suite mappings); author **only the gaps**.
- **Append into the target `regression/suites/<layer>/<module>/*.csv` as `Automation_Status = Draft`**, using the deterministic appender (never a hand-rolled append):
  `npx tsx scripts/test-cases/append-test-cases-to-suite.ts <target-suite.csv> --rows <new-rows.csv> --check-global-ids --dry-run` (drop `--dry-run` on a clean pass). Existing-suite sync/review edits happen in place. `--check-global-ids` rejects an ID already used anywhere under `regression/suites/`.
- **`Draft` is required, not a placeholder.** These cases are grounded and promotable only after Step 4 executes them live; 5i does the `Draft → Automated` flip (a deliberate `{HYPOTHESIS}` — a genuinely unknown expected value phrased as a question — is legal **only** at `Draft`). The runner does not skip `Draft`, so Step 4's scoped regression *will* run them (that is the point).

**Artifact B — Testing checklist (always, terminal-only).** Map **each atomic condition** from the `1d` AC
table to a case (new or existing); fold in the matching `E2E-*` scenario(s); add items for `BL-*`, `ECL-*`,
and each `ba-system-analyzer` risk area; flag any condition with no covering case. Conditions flagged
DRIFT/NOT-FOUND/CONTRADICTS get an explicit item to verify live. **When the Test Model has `Epic context`,
add an integration item for each seam with a Done sibling** (this story consumes/produces state a sibling
owns — verify the boundary works end-to-end, not just the story in isolation).

**Artifact C — Regression suite selection (a `/qa-regression` scope).** Which existing suites run alongside
the ticket cases so the touched surface is checked for regressions — **plus the target suite(s) that just
received the new Draft cases.** Derive from the `E2E-*` → suite mappings, the Test Model's affected
domains/modules, **the suites covering the Done Epic siblings this story integrates with** (their behavior
must not regress as this slice lands), and `config/test-suites.json` selection groups. Output the concrete suite ID list (e.g.
`028,029,030` or a group like `cart`) with a one-line rationale each; scope it to the change — never the
full 119-suite set. Step 4 runs it as its own `/qa-regression <ids>` run; **never fold suite IDs into a
ticket agent's prompt** (`feedback_long_runner_sessions_unreliable`).

**Review & auto-fix.** Any **newly authored** case runs through `/qa-review-tests file <target-suite> --fix`
— start with the deterministic core (`npm run suites:review -- <csv>`, plus `npm run graphql:lint-labels
-- <csv>` for GraphQL) and spend LLM effort only on the judgment rules. Confirmed fixes apply under
`/qa-test-lifecycle` §Phase 4b's write-scope ceiling + **revert-on-regression** (re-run `suites:review --
<csv> --fail-on=High` + `npm run td:validate`; an auto-fix introducing a new Blocker/Critical is reverted).
A case that can't pass review is flagged, not shipped.

**Provision test data (only if needed).** If cases assert against entities not covered by an existing
`@td()` fixture, delegate to `test-data-engineer`: `/qa-generate-data <feature>` → `/qa-seed-data <domain>`,
ending on a green `td:validate`. Reuse existing fixtures where they cover a case; skip with a one-line note
when every case resolves against existing `@td()`/`{{VAR}}` data. Must complete before hand-off.

**Gate (Artifacts reviewed + data seeded — hard STOP before Step 4):** new cases pass the
`/qa-review-tests` dimensions (0 blocker / 0 critical); **every atomic condition + risk area maps to a case
or checklist item**; required data seeded to a **green `td:validate`**.
- **FULL path — independent verification (1 round):** a fresh `qa-lead` verifier **re-runs `npm run
  suites:review`** on the touched suite and **re-runs `npm run td:validate`** (not the author's word), then
  re-reads the Test Model and confirms each atomic condition has a covering case. REJECT on any
  blocker/critical or uncovered condition/risk area → REASONS + FIX → doer (+ `test-data-engineer`) fixes →
  re-verify once → STOP.
- **FAST path — inline self-check:** the doer runs the same two cores itself; no separate dispatch.

---

### Step 4 — Execute

Read env URLs from `config.js` (`FRONT_URL`, `BACK_URL`). **Record the test-window start timestamp** — the
interval until agents return is the App Insights correlation window (5a).

**Move the ticket to the in-testing status (JIRA only, no confirmation).** It is the direct, reversible
consequence of invoking `/qa-test`, changes no content, and is a hard Jira precondition for closing the
ticket at 5f. Discover the transition **live** — never hardcode (`.claude/knowledge/execution/tracker-ops.md`
§live transition discovery); match on the transition's `to.name` (in-testing), not its own `name` (VC-internal
VCST: `On QA` → `Testing`). Skip (one-line note) when the tracker MCP isn't configured, the ticket is already
in-testing, or no in-testing transition is available; never route through `Cancelled`/`On hold`; a bare feature
name / PR has nothing to transition. **`tracker.kind = azure`: skip** — Azure Boards sets `System.State`
directly (`stateMap`), so 5f has no reachability precondition.

**Execute in order — checklist first, then the scoped regression:**

1. **Checklist + ticket cases** — launch the applicable specialist agent(s) **in a single message** (prompt
   contract below) to run Artifact B's checklist and the Artifact-A cases. FAST path = one agent.
2. **Change-scoped regression (Artifact C)** — run the Artifact-C suite IDs as their own **`/qa-regression
   <ids>`** run (it owns suite→agent assignment, the browser pool, retries, and the run report). Because the
   runner does not skip `Draft`, this run **executes the new cases appended in Step 3 — the "latest test."**
   Capture its `RUN_ID` (5g records it; the 5h gate keys "change-scoped regression ≥95%" off it).

**Both draw on the same max-3-concurrent-browser cap.** If the checklist agents + regression lanes exceed 3,
run the checklist track first and regression after (ticket verdict is priority). State the order chosen.

Each ticket-agent prompt must include: the ticket ID; **Artifact A** (path to the target suite + the rows);
**Artifact B** checklist; **test data** (`@td()`/`{{VAR}}` the cases use, confirmed seeded — never hardcode
IDs, `.claude/rules/test-data.md`); **`BL-*`** rule text + **`ECL-*`** patterns from Step 2; the browser
server (Step 2 routing table); env URLs; screenshot path `reports/tickets/{SPRINT}/<ticket-key>/screenshots/`;
and the evidence-capture policy (`.claude/skills/qa-evidence/evidence-capture-policy.md`). **Artifact C is
NOT in the agent prompt** — it goes to `/qa-regression`.

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

**Gate (Execution evidenced — inline self-check):** every atomic condition carries **PASS or FAIL
evidence** (screenshots for critical flows, console/network/trace for failures); the `/qa-regression` track
produced a **RUN_ID + pass rate**. Reject any "PASS" with no artifact ("all passed" without evidence is not
a pass) and re-capture before moving to Step 5. (No fresh-`qa-lead` dispatch — the independent re-check
happens at the Step-5 verdict gate.)

---

### Step 5 — Report

Correlate logs, reconcile ACs, **triage**, decide verdict, file, transition, deliver the summary, then
promote the new cases. **5d before 5e is load-bearing:** the verdict is expressed in terms of a finding's
**provenance**, which only exists once triage has assigned it.

**5a. Correlate App Insights logs (test window).** Catch backend errors the UI test *triggered but didn't
surface* — 5xx, failed dependencies, exceptions, GraphQL `errors[]` inside a 200. `/qa-monitoring`
machinery scoped to the window: **query → dedup → triage**, no separate live-repro (the agents were already
live). Pre-flight App Insights access (Azure MCP `applicationinsights`, or `APPINSIGHTS_APP_ID_*` +
`APPINSIGHTS_API_KEY_*`); if neither is configured → **skip with a one-line note**, never block the
verdict. Query each affected layer with the `ci/monitoring/queries/` probes scoped to the window (+2 min
buffer). Dedup **labels** novelty against `reports/monitoring/.seen-fingerprints.json` (read-only) — it does
**not** filter: a SEEN-stable error that fired in the window still surfaces. Delegate interpretation to
`qa-backend-expert` via `ci/agents/monitor-triage-agent.md` → each signal `REAL_BUG | KNOWN_ISSUE | NOISE |
CONFIG_GATED | THIRD_PARTY | TRANSIENT` + severity + confidence (ambiguous → NEEDS_REVIEW). A HIGH-confidence
`REAL_BUG` enters 5d with evidence attached (attach the signature + portal link; don't draft a separate
`BUG-AI-*`).

**5b. Reconcile ACs against live behavior.** `1d` compared each AC to the *diff* — a hypothesis. Now close
it against what the agents observed **live** (the authoritative AC↔implementation check). For each condition
in the `1d` AC table (working context, no `ac-analysis.md`):
- **SATISFIED live** — confirmed.
- **DRIFT / CONTRADICTS confirmed live** — filing-grade; enters 5d, feeds a 5e FAIL. CONTRADICTS-live is highest priority — surface it explicitly.
- **NOT-FOUND** — no such behavior observed → mark untested and flag.
- **Static suspicion cleared** — a `1d` DRIFT/NOT-FOUND observed working → resolved (the diff was stale).

A diff-only finding is never a verdict input until confirmed (or cleared) here.

**5c. Validate evidence quality:**

| Check | Action if missing |
|---|---|
| Agent claims PASS but no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Get evidence before it enters 5d |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| A bug candidate has no reproducible evidence bundle | Get it, or carry into 5d as LOW-confidence — never file unevidenced in 5f |
| `BL-*` listed in prompt but not mentioned in results | Flag as untested — request verification |
| AC condition (story or gap-AC) has no PASS/FAIL evidence | Flag untested — verdict can't be PASS until covered or waived |
| AC marked DRIFT/CONTRADICTS at `1d` but not reconciled live (5b) | Flag — resolve the AC↔impl status before verdict |
| HIGH-confidence `REAL_BUG` in the 5a window not reflected in agent results | Surface it — the UI test missed a backend error; carry into 5d |

**5d. Triage every finding (classify → provenance → severity → dedup).** Everything the run surfaced —
failed ACs, live-confirmed DRIFT/CONTRADICTS (5b), agent-reported bugs, correlated App-Insights `REAL_BUG`
(5a) — is triaged **before** the verdict. Nothing is filed yet.
1. **Classify** with the `/qa-triage-results` taxonomy: real product bug vs test-defect (`TEST_STEPS_DEFECT` / `ASSERTION_DEFECT` / `TEST_DATA_DEFECT` / `STALE_TEST`) vs `BY_DESIGN` / `ENV` / `KNOWN_ISSUE`. Ambiguous → real bug / LOW (never relabel a real bug as a test-defect). A test-defect routes to `/qa-review-tests <suite> --fix`, not a ticket.
2. **Provenance** — per *real bug*: **PRE-EXISTING** (dedup match or reproduces pre-change → link, don't re-file, don't fail this ticket) · **IN-SCOPE** (in what this ticket changed → fails this ticket; file + link *caused by* / *blocks*) · **OUT-OF-SCOPE incidental** (unrelated defect found opportunistically → file separately via `/qa-bug`, doesn't fail this ticket unless a P0 revenue-flow break; link *related*). Unclear → treat IN-SCOPE (fail-safe).
3. **Severity + priority** — per `.claude/skills/qa-defect/` (P0…P3).
4. **Dedup** — glob `reports/bugs/**` + all `reports/tickets/Sprint*/` and search the tracker (per `feedback_duplicate_check_across_all_sprints`). A match = PRE-EXISTING.

Output: every finding carrying `class` + `provenance` + `severity` + `duplicate-of?` — the verdict's input.

**5e. Decide verdict:**

| Decision | Criteria |
|---|---|
| **PASS** | Every atomic condition carries PASS evidence, all reconciled SATISFIED-live (5b), all `BL-*` verified, **no IN-SCOPE P0/P1 bug** (5d), no correlated HIGH-confidence `REAL_BUG` in the window (5a) |
| **PASS WITH NOTES** | All conditions met & reconciled; only minor P2/P3 or **OUT-OF-SCOPE incidental** bugs tracked separately; only NEEDS_REVIEW/NOISE/KNOWN_ISSUE in the log window |
| **FAIL** | Any AC not met, any AC confirmed DRIFT/CONTRADICTS live (5b), any `BL-*` violated, an **IN-SCOPE P0/P1 bug** (5d), or a HIGH-confidence `REAL_BUG` correlated to the window (5a). *A PRE-EXISTING / OUT-OF-SCOPE incidental bug does not fail this ticket — except an out-of-scope **P0 revenue-flow break**, surfaced for a human call.* |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

**Gate (Triage + verdict sound — hard STOP before 5f):** every finding classified + provenance + severity
+ deduped; the verdict follows the table from the reconciled evidence. **Independent verification (FULL
path, 1 round):** a fresh `qa-lead` verifier **re-classifies a sample** — confirming each **IN-SCOPE** call
via a live repro on a **different browser lane**, re-running one critical/revenue case, confirming the
RUN_ID pass rate against `compute-metrics.ts`, and confirming the dedup — then ratifies the verdict. REJECT
if a real bug was mislabeled a test-defect, an in-scope P0/P1 under-graded, or the verdict doesn't follow →
REASONS + FIX → re-triage → re-verify once → STOP. (FAST path: the doer self-checks; only an APPROVEd/
self-checked triage proceeds to 5f.)

**5f. File bugs & transition the tracker (with confirmation).** File the confirmed, non-duplicate real bugs
from 5d via `/qa-bug`, tagged with provenance and linked (*caused by*/*blocks* for in-scope, *related* for
incidental), each carrying a `## Fix Routing` hint. **Ask before filing.** A PRE-EXISTING match is linked,
not re-filed; a test-defect goes to `/qa-review-tests <suite> --fix`. **Then transition (ask first; skip if
Atlassian MCP unconfigured):**

| Outcome | Transition |
|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED |
| FAIL | `Need fixes` → REOPEN with a comment listing failures + filed bug links |

On Jira both closing transitions require the in-testing status (the Step 4 move); if skipped, do the
in-testing hop first (discover live). On Azure Boards set `System.State` directly. **TESTED is the terminal
state this command may reach — never Done or Cancelled.** Add a Markdown JIRA comment (never wiki markup;
outcome-first, evidence referenced not inlined — `.claude/knowledge/execution/tracker-ops.md` §5a):
```
QA Complete — [X] cases, [Y] passed, [Z] failed.
AC review: [N] story ACs ([weak]/[ok]), [M] gap-ACs; AC↔impl: [satisfied]/[drift]/[contradicts]/[not-found].
Change-scoped regression: [suite IDs] — [pass rate] ([RUN_ID]).
App Insights (test window): [N] correlated — [confirmed/needs-review/none].
Business rules verified: [BL-* list]. Bugs: [list or None]. Decision: [verdict].
Evidence: reports/tickets/{SPRINT}/<ticket-key>/screenshots/
```

**5g. Deliver summary.** Per `.claude/rules/reports.md` §1, `summary.json` + evidence screenshots are the
only artifacts this command persists (new test cases now live in `regression/suites/`, category 2 — not a
ticket CSV). Write `reports/tickets/{SPRINT}/<ticket-key>/summary.json` per the schema at
`.claude/templates/qa-test-summary.schema.json` (carry `path`, the AC-analysis block, counts, `regression`
block for 5h, and the `promotion` block for 5i). Then output the report **in chat, in full** (this IS the
report): verdict, reconciled AC table, checklist results, change-scoped regression result, business rules
verified, bugs found (with provenance), and the screenshot folder path.

**5h. Feed the Feature Release Gate (team go/no-go).** The 5e verdict is the primary input to the **Feature
Release Gate** (`.claude/skills/qa-metrics/quality-gates.md` §1a), owned by `qa-lead-orchestrator`.
`/qa-test` ends at the per-ticket TESTED/REOPEN transition; it does not decide release. A PASS/PASS-WITH-NOTES
run **feeds a GO** only if the team-level criteria also hold (0 open P0, P1s deferred-with-acceptance,
change-scoped regression ≥95% — the 5g `regression.pass_rate`, NFRs clean, smoke PASS); a FAIL/BLOCKED is an
automatic NO-GO. State which, and on anything short of GO the blocking criteria. If the Artifact-C run was
deferred/skipped, say so — the gate can't be evaluated on a null pass rate.

**Gate (Feature Release Gate ratified — FULL path):** the §1a criteria yield GO / CONDITIONAL GO / NO-GO. A
fresh `qa-lead` verifier **re-evaluates §1a from the raw inputs** — the 5e verdict, the `reports/bugs/`
open-P0/P1 ledger, the regression pass rate via
`npx tsx scripts/regression/compute-metrics.ts --gate feature --run-id <5g regression.run_id> --p0-bugs N --p1-bugs N`
(`--run-id` **required** — the gate is defined on the change-scoped run; `--suites <ids>` is the fallback),
and the smoke result — and ratifies or **downgrades**. This is a **recommendation only** — a human decides
release; `/qa-test` never ships.

**Epic roll-up (`--epic` runs only).** After the last story, combine the per-story gates into one
**Epic-level** recommendation: **all** child stories GO/CONDITIONAL GO + the **cross-story E2E** clean +
**0 open P0 across the whole Epic** → the Epic's feature is releasable. Any child at NO-GO, a broken
cross-story seam, or an open P0 anywhere in the Epic → the Epic is NO-GO (name the blocking story). Still a
recommendation only; record it in `summary.json.epic`.

**5i. Promote the new cases (only when Step 3 authored new cases).** The cases are in the suite as `Draft`,
grounded and promotable only now that Step 4 executed them live via the automated runner.
1. Harvest: `/qa-review-tests file <target-suite.csv> --verify --fix` — every assertion this run observed live is rewritten `{HYPOTHESIS}` / unconfirmed-`{SPEC}` → `{OBSERVED}`; a **refuted** behavior surfaces as ENV-008, never `{OBSERVED}`.
2. Resolve each remaining `{HYPOTHESIS}` with the observed value; one that stayed genuinely unknown is reworded as a question and keeps its case at `Draft` — never invent a value.
3. Re-derive eligibility (the same G10 the promoter uses): 0 GRD-001 Blocker/High, 0 ENV-008, green `td:validate`, every assertion grounded, executed with evidence.
4. **Ask to promote, then flip in place:** each eligible case that **ran green under the Step-4 automated regression** → `Automation_Status: Draft → Automated` (it proved it runs under automation); a case verified only via the manual checklist → `Reviewed`/`Manual`. **Revert (remove) a non-promotable row** so the durable suite doesn't carry an ungrounded case that would keep running — **except** a case that failed on a real IN-SCOPE bug, which stays `Draft` with a documented reason (valid coverage flagging the open defect). Stamp `References` with `Promoted: <ticket-key> (YYYY-MM-DD)` (append; never clobber a `Synced:`/`Audited:` stamp). Then `npm run suites:sync && npm run suites:lint`; re-run `suites:review -- <target-suite.csv> --fail-on=High` (an append that introduced a new Blocker/Critical is reverted).
5. Record the split in `summary.json.promotion` (`automated`/`reviewed`/`blocked`/`reverted`).

**Gate (Promotion sound — FULL path, 1 round):** every `Automated`/`Reviewed` upgrade traces to a real
artifact from this run; every surviving `{HYPOTHESIS}` is resolved or reworded; `suites:lint` green. A fresh
`qa-lead` verifier **re-runs `suites:review`** on the target suite and, for a sample of upgraded assertions,
**re-opens the Step-4 evidence** grounding each `{OBSERVED}`. REJECT any `{OBSERVED}` with no traceable
artifact, any `{HYPOTHESIS}` cleared by an invented value, any case promoted while still carrying a
Blocker/Critical → revert the append (`git checkout` target CSV + manifest) → fix → re-verify once → STOP.
An ungrounded `{OBSERVED}` is worse than a `Draft` case: it puts a fabricated expectation into permanent
coverage. The author never self-certifies this — only `qa-lead-orchestrator` or the user promotes.

**Close the loop.** By default `/qa-test` verifies and reports; it never fixes — it states the next command
and stops (pointers, not auto-triggers). This close-out is the `feature-test` flow's; the `verify-fix`
flow already ended at its own VERIFIED/REOPEN verdict (§1a), and `hotfix-verify` handed off to
`/qa-hotfix-check` before Step 1b:
- **PASS / PASS WITH NOTES** → ticket TESTED; hand to the Feature Release Gate (5h). Done.
- **FAIL → REOPEN** → `/qa-fix <ticket-key>` (autonomous G0–G7, never auto-merges) → human review + merge + deploy → `/qa-verify-fix <ticket-key>`. A too-complex/multi-repo bug (G0 BAIL) is handed to a human, resuming at `/qa-verify-fix`. (Once the fix is deployed, a re-run of `/qa-test <ticket-key>` now auto-routes the Bug to the `verify-fix` flow, since its status is `fix-ready` — §1a.)
- **BLOCKED** → resolve the blocker (env/data/dependency) and **re-run `/qa-test <ticket-key>`** from the top; no partial credit.

**5k. `--iterate` — the bounded test → fix → re-test loop (opt-in).** With `--iterate` (default
`--max-rounds 2`), a FAIL doesn't stop at the pointer — `/qa-test` drives the fix-and-retest cycle itself,
up to the cap, then hands to a human. The initial run is **round 1**. Per round, once the 5e verdict is in:
1. **PASS / PASS WITH NOTES** → exit the loop → Feature Release Gate (5h) → GO/NO-GO recommendation →
   **STOP for the human to merge + release** (never automated). Done.
2. **BLOCKED** → **STOP** — a fix can't clear an env/data/dependency blocker.
3. **FAIL** → **Fix (auto):** for each **IN-SCOPE** bug 5d judged fixable, run `/qa-fix <ticket-key>`
   (autonomous triage→fix→PR, G0–G7, **never merges**). A bug that G0 BAILs (not-auto-fixable / too-complex
   / multi-repo) → **STOP**, hand that bug to a human; the loop cannot fix it. If no in-scope fixable bug
   remains, fall back to the pointer close-out above.
   - **Deploy the prerelease (confirm):** `/qa-deploy-pr <ticket-key>` deploys the fix PR's **prerelease**
     build to the test env — **ask before deploying** (it opens its own gated deploy PR). No merge happens:
     the loop always re-tests an **unmerged prerelease**, so the §2 never-auto-merge triple guard is never
     touched.
   - **Re-test (round N+1):** re-run **only the previously-FAILED cases (RED→GREEN) + the change-scoped
     regression (Artifact C)** against the redeployed env — Step 4 re-scoped, then Steps 5a–5e again (the
     full verdict gate; on the full path the independent verifier re-ratifies, 1 round).
4. **Cap reached** — still FAIL after `--max-rounds` rounds → **STOP** with a per-round summary (what each
   round fixed, what still fails) and hand to a human. **STOP at the cap is a success, not a failure.**

The loop's brakes are a hard **round cap**, a **confirm on every prerelease deploy**, a **G0 BAIL → STOP**,
and the invariant that **merge + release are always the human's**. `/qa-test` still never merges, never
ships. Record the outcome in `summary.json.iterations` (`rounds`, `max_rounds`, `outcome`). **Without
`--iterate`, none of 5k runs** — the pointer close-out above is the whole story.

---

## Constraints

- Reference every in-repo file by its **real path from the repo root** (`.claude/skills/…`, `.claude/knowledge/…`, `.claude/rules/…`, `.claude/agents/…`, `ci/…`) — the bare `skills/…` form does not resolve, especially inside a sub-agent prompt.
- Never use WebKit (unsupported on Windows). Never assign two agents to the same browser server simultaneously. Fallback: chrome→firefox, edge→chrome, firefox→edge (max 1 retry). **Max 3 concurrent browser agents — counted across checklist agents and regression lanes.**
- Read all URLs from `config.js` / `.env` — never hardcode. Always load `business-logic.md` for the affected domains.
- If an agent fails with an internal error, fall back to working directly rather than retrying the same delegation. If Atlassian MCP is unavailable, skip JIRA transitions and ask the user for ticket details.
- **Terminal-only** (`.claude/rules/reports.md` §1): Steps 1d/3/4 never write `ac-analysis.md` / `testing-checklist.md` / `test-execution-report.md`. Only `summary.json` + evidence screenshots persist under `reports/tickets/{SPRINT}/<ticket-key>/`; new test cases persist to `regression/suites/` (category 2). Every other finding is delivered once, in the Step 5 chat report.
- App Insights correlation (5a) reuses `/qa-monitoring`'s query + dedup + triage machinery scoped to the window (no separate live-repro); resolve resources from `APPINSIGHTS_*`, skip gracefully when unconfigured; a correlated error gets no separate `BUG-AI-*` draft (5f's `/qa-bug` owns it).
