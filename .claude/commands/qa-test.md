---
description: "Test a tracker ticket, feature area, or PR. Analyzes scope, dispatches specialist agents, correlates App Insights logs for the test window, and produces a verdict."
argument-hint: "<ticket-key> | feature name | PR #NNN"
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
```

---

## Pipeline: Gather Context · Story · Test Model → Plan → Write·Review·Provision → Execute → Report

Every step runs the same contract: **DOER → GATE → INDEPENDENT VERIFIER**.

## Quality-gate model — every step is gated + independently verified

`/qa-test` is a gated lifecycle: each step has an explicit **Gate (pass criteria)** and its output is
checked by an **independent verifier** — a **fresh `qa-lead-orchestrator` instance in verifier mode**
(`.claude/agents/qa-lead-orchestrator.md` §Verifier Mode), **not** the inline orchestrator running this
pipeline and **never the step's own doer**. The verifier re-derives the evidence from source (re-runs the
deterministic core, re-reads the artifact, re-opens the evidence, or delegates a live re-check to a
specialist on a **different browser lane**) — it never APPROVEs on the doer's summary. Bias: **when in
doubt, REJECT.**

- **This does not violate "run inline, don't delegate the orchestration"** (below): the verifier is a
  **scoped single-gate check**, dispatched per step and returning `APPROVE|REJECT`. You are not handing off
  the pipeline — you keep orchestrating; you just add an independent gate between steps.
- **The REJECT loop is: reject → reason + fix → wait → re-verify.** On `REJECT` the verifier returns
  `REASONS` + a concrete `FIX`; you hand that back to the **step's doer** (never to the verifier), the doer
  applies the fix, and the verifier **re-verifies from scratch** on the corrected artifact. **≤2 iterations**;
  still not APPROVE → **STOP** for a human (a persistent REJECT never silently proceeds).
- **Skip a verifier pass only** for a trivial step on a P2/P3 (note the skip in one line); a P0/P1 or any
  revenue-flow step is always verified.
- **Gate ladder at a glance:** Step 1 → *Test Model complete* · Step 3 → *Artifacts reviewed + data seeded*
  · Step 4 → *Execution evidenced + risk areas explored* · Step 5d–5e → *Triage + verdict sound*
  · Step 5h → *Feature Release Gate ratified* · Step 5i → *Promotion evidence grounded* (only when new cases
  were authored). Human stays terminal (TESTED/REOPEN + a GO/NO-GO recommendation; never
  auto-ship/merge/fix).

### Step 1 — Gather Context, Story & Test Model

**One step, five sub-parts, listed in execution order** — each consumes the one before it, so don't
reorder them: `1a` fetch & classify → `1b` pre-flight → `1c` context (BA-gated) → `1d` story review (BA)
→ `1e` build the Test Model. Story analysis is **part of this step**, not a separate one: the AC table it
produces is a field of the Test Model, and the model is the single structured hand-off to
`test-management-specialist` (Step 3) — not scattered notes.

#### 1a — Fetch the scope, then classify the ticket type

**Fetch first.** Every later sub-part depends on these fields: the type gate (below) needs `Type`, the
`1c` BA delegation needs the raw ticket fields + PR diff, the `1b` duplicate check needs the ticket key,
and `1d` needs the ACs.

**For JIRA tickets** — try Atlassian MCP (`getJiraIssue`) first. If Atlassian MCP is not configured, ask the user to paste the ticket details (summary, ACs, components, linked PR):
- Summary, Type, Priority, Status, Components, Acceptance Criteria
- Linked PR: use GitHub MCP `get_pull_request` (owner, repo, pull_number) for PR details and `get_pull_request_files` to see changed files
- Confirm ticket is in a testable status

**For a PR** — use GitHub MCP `get_pull_request` (owner, repo, pull_number) for details + `get_pull_request_files` for changed files:
- Map file extensions to areas: `.cs` / `.csproj` → Backend, `.vue` / `.ts` / `.tsx` / `.jsx` → Frontend, `.css` / `.scss` → Styling

**For a feature name** — use the name to determine which areas are affected.

**Identify applicable domain(s)** — map the ticket/feature to one or more of the 63 domains in `/qa-checklist` (33 storefront + 29 backend/admin + 1 GraphQL).

**Then classify the type — it drives the `1c` gate.** The type determines how much context gathering is
warranted:

| Type | Signal | Context depth |
|------|--------|---------------|
| **New feature / Story** | JIRA Type = Story/Epic; net-new capability; multiple ACs | **Full** — delegate to `ba-system-analyzer` |
| **Enhancement / Task** | JIRA Type = Task; changes existing behavior | **Full if it crosses layers/domains**, else inline |
| **Bug fix** | JIRA Type = Bug; localized regression/defect | **Inline** unless P0/P1 or cross-layer |
| **Copy/UI tweak / config** | one-file, single-surface change | **Inline** |

Resolve the type from the JIRA `Type` field (or, for a PR/feature with no ticket, infer from the diff
size + surface). Record it — it is a `summary.json` field (5g) and the Artifact-A switch in Step 3.

#### 1b — Pre-flight, sprint resolution & duplicate check

Per `.claude/templates/agent-dispatch.md`:

1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version verification** — use GitHub MCP `get_file_contents` to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa` by default; use the branch matching `TEST_ENV` for other envs):
   - Record: platform version (`PlatformVersion`), theme version (from `artifact.json` URL), and modules relevant to the ticket scope
   - **For PR testing:** PRs are deployed to QA while still open. Confirm the PR's build artifact version appears in `packages.json` (modules) or `artifact.json` (theme). If any of the change's artifacts are not deployed → offer to run [`/qa-deploy-pr`](qa-deploy-pr.md) `<ticket-key>` (gathers all the change's fresh artifacts and prepares one gated deploy PR; **ask first**); otherwise warn user and ask whether to wait
3. **Resolve current sprint** — check if `reports/tickets/Sprint-current` exists → use it. Otherwise list `reports/tickets/` and pick the latest `SprintXX-XX` folder. This becomes `{SPRINT}` for all output paths (rooted at `reports/tickets/{SPRINT}/`). Create the folder if it doesn't exist. **Resolve this before the duplicate check** — the check's glob and every output path depend on it.
4. **Duplicate check — across ALL sprints, not just the current one.** Glob `reports/tickets/*/*/summary.json` (every `SprintXX-XX`, per `feedback_duplicate_check_across_all_sprints`) for the same ticket with a `date` in the last 2 hours. The current sprint is the usual hit, but a run straddling a sprint rollover must not hide a duplicate. Per `.claude/rules/reports.md` §1, `summary.json` is the only narrative-adjacent artifact `/qa-test` persists — this is what the scan reads. If found, warn user and show the previous verdict.

#### 1c — Gather ticket context (BA-gated)

**Delegate to `ba-system-analyzer` only when the type + priority/scope warrant it.** A full BA context
pass is a real round-trip (repo + module + live-UI exploration); don't spend it on a small,
well-understood change.

- **Delegate** when: type is **New feature / Story**; OR the ticket is **P0/P1**; OR it **spans both
  layers** (Backend + Frontend); OR it **crosses ≥2 domains**; OR it touches a **critical revenue flow**
  (registration/auth, cart, checkout/payment, orders, B2B multi-org); OR the affected surface is
  **unclear** from the ticket + PR diff alone.
- **Skip** (gather context inline from the `1a` ticket fields + `get_pull_request_files` diff +
  `.claude/knowledge/`) when it is a **bug fix / tweak that is P2/P3, single-layer, single-domain** with
  an obvious surface. Note the skip in one line.

When delegated, `ba-system-analyzer` assembles the full context surrounding the ticket — this is exactly
its charter (repo structure, module inventory, user flows, pain points, from codebase + GitHub module
repos + VC documentation + live UI exploration). Pass it the ticket ID(s)/feature/PR plus the raw ticket
fields and PR diff fetched in `1a`. It returns:
- **Affected surface** — which module(s)/repo(s), storefront vs Admin SPA vs API/GraphQL layer, and the
  concrete code sites the change touches (grounded, not guessed).
- **Related flows & integration boundaries** — the adjacent features and cross-domain seams the ticket
  sits inside (cart ↔ checkout, org ↔ membership, catalog ↔ pricing, …).
- **Known pain points / historical failures** — cross-referenced to `vc-bug-catalog.md` (`VC-*`) and
  prior bug reports, so the model carries the risk areas forward.
- **Docs grounding** — the VirtoOZ/VC-doc references for how the feature is *supposed* to behave.

Run it **read-only** (no JIRA/GitHub writes — `.claude/rules/agents.md` external-write discipline). On
`ba-system-analyzer` internal error, fall back to gathering context inline rather than retrying the same
delegation. Either way, the `1e` Test Model carries the same fields — populated by the BA when
delegated, inline otherwise.

#### 1d — Review the story (BA gap & implementation review)

A strong test run starts from strong ACs. Before writing a single test case, the story under test gets critiqued — and its ACs compared against what was actually built. **Advisory, never blocking.**

Runs when scope is a tracker ticket/story **with acceptance criteria**. Skip (with a one-line note) for a bare feature name or a PR with no governing story.

Dispatch **`ba-story-writer` in review mode (Mode B)** — analyze only, do NOT write a new story, do NOT touch JIRA. Pass:
- `existing_story` — the summary + description + ACs fetched in `1a`
- `jira_ref` + `domains` (from `1a`)
- `implementation: { pr_diff }` — the linked PR's changed files + diff already fetched in `1a` (`get_pull_request_files`). This is the **static** AC↔code comparison; the **live** comparison happens later in Step 5b.

The BA returns (see `ba-story-writer` Mode B):
- **AC Quality Scorecard** — each existing AC: testable? / clarity / smells / KEEP·REWRITE·SPLIT (+ rewrite for each weak one)
- **Weak sides** — concrete rewrites for ambiguous / non-falsifiable / happy-path-only ACs
- **AC ↔ Implementation coverage** — per AC: SATISFIED / DRIFT / NOT-FOUND / CONTRADICTS against the diff, plus **unspecified implementation** (code changes no AC governs)
- **Gap analysis** — missing ACs (error paths, boundaries, guest/B2B variants, NFRs, integration boundaries), each mapped to a `BL-*`/`ECL-*` and phrased as a gap-AC
- **AC → Test traceability seed** — the merged table of atomic testable conditions (story ACs + gap-ACs), each carrying its `Impl verdict`

**Surface to the user inline:** the weak ACs, the DRIFT/CONTRADICTS/scope-creep findings, and the gap-ACs. Then **proceed** — fold the **gap-ACs into the test scope** alongside the story's own ACs, and carry every DRIFT/NOT-FOUND/CONTRADICTS into execution as a thing to verify **live** (a static-diff finding is a suspicion, not a defect).

**Output:** keep the AC traceability table in your working context (per `.claude/rules/reports.md` §1, this is a terminal-only artifact — no `ac-analysis.md` file). It becomes the **AC traceability** row of the `1e` Test Model, is the spine for Step 3 (test cases) and Step 5 (verdict + live reconciliation), and gets folded into the single Step 5 chat report.

#### 1e — Build the Test Model (the Step 1 output)

Distill the `1c` context + the `1d` story analysis + the `1a` scope/domains into one structured model.
This is what Step 3 consumes as its coverage spine — keep it in working context (terminal-only per
`.claude/rules/reports.md` §1, no file):
```
TEST MODEL — <ticket-key>
Ticket:      <ticket-key> | Type: Bug/Story/Task | Priority: P0/P1/P2 | Changed: Backend / Frontend / Both
Context:     [BA-delegated | inline]  (per the 1c type/priority/scope gate)
Affected surface: [module(s)/repo(s), layer(s), code sites]  (from ba-system-analyzer)
Domains:     [Cart, Payment, ...]
Flows & boundaries: [cart ↔ checkout, ...]                    (from ba-system-analyzer)
Risk areas:  [VC-* pain points / historical failures]         (from ba-system-analyzer)
AC traceability: [N atomic conditions — story ACs + gap-ACs, each w/ Impl verdict]  (from 1d)
Business Rules: [BL-CART-001, BL-PAY-003, ...]                (filled in Step 2)
Edge cases:  [ECL-* patterns]                                 (filled in Step 2)
Docs grounding: [VirtoOZ / VC-doc refs]                       (from ba-system-analyzer)
Agents to dispatch: [list]
```
The test model is the single artifact handed to `test-management-specialist` in Step 3 (checklist/case
authoring) and reconciled against live behavior in Step 5b.

**Gate (Test Model complete):** ticket **type classified**; ACs decomposed to **atomic conditions** (story
ACs + gap-ACs); **BL/ECL/domains** identified; **risk areas** present. **Independent verification:** a fresh
`qa-lead` verifier independently re-decomposes the ticket/PR ACs from source and REJECTs if any atomic
condition or `ba-system-analyzer` risk area is missing from the model → doer (Step 1) adds it → re-verify.
(Step 1d's *story* review stays advisory; this gate is on the *model's completeness*, not AC quality.)

---

### Step 2 — Plan

Determine testing strategy: **enrich the Step 1 Test Model** with the knowledge/docs it doesn't already
carry, then route agents. This step *completes* the model — it does not re-derive what Step 1 already
populated. Skip anything the `1c` `ba-system-analyzer` pass already returned.

**Load knowledge files** relevant to the identified domains (read from `.claude/knowledge/`) — fill the
Test Model's `Business Rules` / `Edge cases` fields with the actual rule text + patterns, not just the IDs:
- **business-logic.md** — find all `BL-*` invariants for the affected domains. These become mandatory verification points.
- **e-commerce-edge-cases-library.md** — find `ECL-*` patterns for the domains.
- **domain-checklists.md** / **backend-admin-checklists.md** / **graphql-checklist.md** (via `/qa-checklist`) — identify checklist items for the domains.
- **`.claude/skills/qa-plan/e2e-scenario-catalog.md`** — map the ticket/feature to its `E2E-*` scenario(s) (105 scenarios across 18 domains). Record the matching scenario IDs and their pre-mapped regression suites — this is the suite-traceability backbone the Write step (Step 3) folds into the checklist and Artifact C.

**VirtoOZ docs query** (via the `/vc-docs` skill) — **gated: skip when `1c` delegated to
`ba-system-analyzer`** (its *Docs grounding* already covers this; reuse those refs and only top up a
specific gap). Otherwise — for an inline-gathered ticket — query the affected feature's domain against
the topic-scoped VirtoOZ MCP tool that fits (e.g., `StorefrontDeveloperGuide` for `"cart xAPI mutations"`,
`PlatformDeveloperGuide` for `"order processing workflow"`). VirtoOZ is the primary Virto Commerce
documentation source; fall back to Context7 (`/virtocommerce/vc-docs`, `tokens: 8000`) only if VirtoOZ
returns nothing. Pass findings to agents in Step 4.

**Fold in `ba-system-analyzer` risk areas** (when delegated) — each `VC-*` pain point / historical
failure in the Test Model becomes a mandatory verification point here, alongside the `BL-*` rules.

**Agent routing table:**

| Affected Area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search, mobile | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL, backend | `qa-backend-expert` | `playwright-edge` |
| Storybook components, accessibility, design system | `ui-ux-expert` | Chrome DevTools MCP |
| Cross-browser, exploratory, Figma comparison, debugging | `qa-testing-expert` | `playwright-firefox` |

**Minimum dispatch rules:**
- Backend-only change → `qa-backend-expert` only
- Frontend-only change → `qa-frontend-expert` only
- Both layers → `qa-backend-expert` + `qa-frontend-expert` in parallel
- UI/component change → add `ui-ux-expert`
- P0 ticket or critical revenue flow → add `qa-testing-expert` for cross-browser verification

**Gate (Plan grounded):** every affected domain has its `BL-*`/`ECL-*`/`E2E-*` loaded and an agent routed.
**Independent verification:** light — folded into the Step 3 verifier pass, which REJECTs if a P0/P1
domain's `BL-*` mapping came back empty (a plan that gates nothing). Skip a standalone verifier pass here.

---

### Step 3 — Write, Review & Provision (test-management-specialist)

**Always** dispatch `test-management-specialist` to produce the test artifacts, review/auto-fix them, and provision any test data before execution. This step must complete before Step 4.

**This step runs the same author → review → auto-fix → provision mechanism as `/qa-test-lifecycle`
Phases 3–4 — the owning skills are the single source of truth, and neither command restates them.** Read
them; do not re-derive them from this file:

| Concern | Owner (read it) | Never restate here |
|---|---|---|
| Case authoring contract, 15-column schema, `Automation_Status` enum | `/qa-test-cases-generator` + `.claude/skills/qa-test-cases-generator/test-case-template.md` | column list, enum values |
| Review dimensions, check codes, severities, auto-fix matrix | `.claude/skills/qa-review-tests/SKILL.md` + `review-criteria.md` | the dimension list, a code's severity |
| Behavior-rewrite evidence bar (docs + live + source) | `.claude/skills/qa-review-tests/triangulation-criteria.md` | the evidence bar |
| Test-data design + provisioning | `/qa-generate-data` → `/qa-seed-data` (`test-data-engineer`) | fixture/alias rules |
| Write-scope ceiling + revert-on-regression | `.claude/commands/qa-test-lifecycle.md` §Phase 4b | the ceiling table |

Two things differ from a lifecycle run, and only two: **where the rows land** (here: a *run-scoped*
`reports/tickets/{SPRINT}/<ticket-key>/test-cases.csv`, not `regression/suites/`) and **who may promote**
(never this command — `/qa-test-lifecycle` Phase 6P, see 5i/5j). Everything else is the same job under the
same rules, so a divergence between the two is a bug in whichever file drifted.

The specialist follows the **`/qa-plan` methodology scoped to this ticket** — consult `e2e-scenario-catalog.md` for the `E2E-*` scenarios identified in Step 2 and inherit their regression-suite mappings — but the **output is the lightweight scoped in-context testing checklist below (terminal-only, no file per `.claude/rules/reports.md` §1), NOT a full `/qa-plan` test plan / RTM / TestRail CSV.** Use the catalog for scenario coverage and suite traceability; do not run the full test-planning ceremony (SBTM/test-design/peer-review/Draft→Reviewed promotion) here — Step 4 folds the targeted exploratory charter into execution, and full case authoring belongs to a standalone `/qa-plan` run.

**Consume the Step 1 Test Model** as the coverage spine — the `1d` AC traceability table (one row per atomic condition, story ACs + BA-discovered gap-ACs), plus the `1c` affected surface / flows & boundaries / risk areas that scope where coverage must reach.

The specialist produces **three hand-off artifacts**, then reviews/auto-fixes them and provisions any test data they need, before handing off to the Step 4 execution agents:

**Artifact A — Test cases / scenarios (ticket-type-driven).**
- **New feature / Story** (Test Model `Type`) → **author new** enriched-CSV test cases (and, for a multi-screen journey, `E2E-*`-style scenarios) via `/qa-test-cases-generator` methodology. Derive them from the `1d` AC conditions (story + gap-ACs), the `E2E-*` scenarios, `BL-*` invariants, `ECL-*` patterns, and domain checklists. Write to `reports/tickets/{SPRINT}/<ticket-key>/test-cases.csv` — category 2 (Test cases), the one file this step persists.
- **Bug fix / enhancement with existing coverage** → **map to existing** suite cases (start from the `E2E-*` → suite mappings from Step 2); author **only the gaps** (conditions/risk areas no existing case covers) as new cases in the same `test-cases.csv`.
- **Write the CSV with the deterministic appender, not by hand** —
  `npx tsx scripts/test-cases/append-test-cases-to-suite.ts <test-cases.csv> --rows <new-rows.csv> --check-global-ids --dry-run`
  (drop `--dry-run` on a clean pass). It enforces the 15-column schema, ID format, the
  `Priority`/`Automation_Status` enums, and the boundary newline a hand-rolled append silently corrupts
  (`feedback_csv_append_newline_corruption`). Same writer `/qa-test-lifecycle` 6P uses later, so a promoted
  case is a straight re-append rather than a reformat. Pass `--check-global-ids` **here too**: it rejects a
  case ID that already exists anywhere under `regression/suites/`, and catching that at authoring time is
  far cheaper than at 6P, where the case is otherwise promotion-blocked and has to be re-IDed after the
  fact.
- **This CSV is run-scoped, not durable coverage.** Nothing in the manifest-driven runner reads
  `reports/tickets/**` — a case that stays there never executes again after this run. Promoting cases
  worth keeping into `regression/suites/<layer>/<module>/` + a `config/test-suites.json` entry is
  **`/qa-test-lifecycle` Phase 6P's** job, not this command's. When Step 3 authors new cases, say so and
  name the promotion follow-up in 5j; record the count in `summary.json` so it isn't silently lost.
- **Author them `Automation_Status = Draft` — that is required, not a placeholder.** `Draft → Reviewed`
  needs every assertion grounded with no `{HYPOTHESIS}` **and** a `--verify` pass emitting `{OBSERVED}`,
  which needs a live browser only Step 4 can supply. Authoring `Reviewed` here would bypass the promotion
  gate; a deliberate `{HYPOTHESIS}` (a genuinely unknown expected value, phrased as a question) is legal
  **only** at `Draft`. 5i harvests Step 4's evidence to lift them.

**Artifact B — Testing checklist (always).** A lightweight checklist scoped to the ticket/PR:
- Map **each atomic condition** from the `1d` AC table (story ACs + gap-ACs) to a case (new or existing).
- Fold in the matching `E2E-*` scenario(s) so cross-screen/journey coverage isn't missed.
- Add items for `BL-*` rules, `ECL-*` edge cases, and **each `ba-system-analyzer` risk area** not covered above. Conditions flagged DRIFT / NOT-FOUND / CONTRADICTS get an explicit item to verify them live.
- Flag any condition with no covering case as a gap.

**Artifact C — Regression suite selection (a `/qa-regression` scope, not agent homework).** Determine **which existing regression suites** should run alongside the ticket cases, so the touched surface is checked for regressions. Derive from: the `E2E-*` → suite mappings (Step 2), the Test Model's affected domains + `1c` affected modules/flows, and the `config/test-suites.json` selection groups. Output the concrete suite ID list (e.g. `028,029,030` or a named group like `cart`) with a one-line rationale per suite; scope it to the change — never the full 119-suite set. **Artifact C is a selection, not an execution instruction:** Step 4 runs it as its own `/qa-regression <ids>` run (which owns suite→agent assignment, the 3-lane browser pool, retries, and the run report). Never fold suite IDs into a ticket agent's prompt — a ticket agent running 3 full suites inline violates one-agent-per-suite, the batch-of-3 pool, and the long-runner reliability cap (`feedback_long_runner_sessions_unreliable`).

**Review & auto-fix the authored cases.** Any case **newly authored** in Artifact A is run through `/qa-review-tests file <path> --fix` — the skill owns the dimension set, codes and severities; don't restate them. Start with the deterministic core (`npm run suites:review -- <csv>`, plus `npm run graphql:lint-labels -- <csv>` for GraphQL cases) and spend LLM effort only on the judgment rules it can't decide. Confirmed fixes are auto-applied to `test-cases.csv` **before** the cases go to execution, under `/qa-test-lifecycle` §Phase 4b's write-scope ceiling and its **revert-on-regression** rule: after fixing, re-run `suites:review -- <csv> --fail-on=High` + `npm run td:validate`, and **an auto-fix that introduces a new Blocker/Critical is reverted, not shipped**. Cases only *mapped* to existing suites are already reviewed — skip. A case that can't pass review (ungrounded assertion, unresolvable data) is flagged, not shipped to Step 4.

**Provision test data (only if the cases need it).** If Artifact A's cases assert against entities not already covered by an existing `@td()` fixture, delegate to **`test-data-engineer`**: design the cross-entity combinations via `/qa-generate-data <feature>` (authors the gap fixtures + `@td()` aliases + any seed script), then **seed them** via `/qa-seed-data <domain>` against the test env, ending on a green `td:validate` gate. Reuse existing fixtures wherever they cover a case — author/seed only the gaps. When every case resolves against existing `@td()`/`{{VAR}}` data, **skip** with a one-line note. This must complete (data confirmed seeded) before hand-off, so execution isn't blocked on missing data.

**Output / hand-off:** keep the checklist (B) and regression suite selection (C) in your working context; the reviewed test cases (A) persist to `test-cases.csv`; the seeded test data lives in the env + `aliases.<env>.json`. Pass the cases, checklist, and `@td()` aliases into the Step 4 agent prompts, and the suite list into the Step 4 `/qa-regression` run. Per `.claude/rules/reports.md` §1, B and C are terminal-only (no `testing-checklist.md` file). This step must complete before Step 4.

**Gate (Artifacts reviewed + data seeded):** new cases pass the 11-dimension `/qa-review-tests` (0 blocker /
0 critical); **every atomic condition + risk area maps to a case or checklist item**; required data seeded
to a **green `td:validate`**. **Independent verification (the load-bearing check — author cannot certify
its own coverage):** a fresh `qa-lead` verifier **re-runs `npm run suites:review`** on `test-cases.csv`
itself and **re-runs `npm run td:validate`** (not the author's word), then re-reads the Test Model and
confirms each atomic condition has a covering case. REJECT on any blocker/critical or any uncovered
condition/risk area → return REASONS + FIX (name the case ID / missing condition) → `test-management-specialist`
(+ `test-data-engineer` for data) fixes → re-verify. This gate is a **hard STOP** — do not dispatch Step 4
until it APPROVEs.

---

### Step 4 — Execute

Read environment URLs from `config.js` (`FRONT_URL`, `BACK_URL`).

**Record the test window start** — note the current timestamp before dispatching. The interval from here until execution agents return defines the App Insights correlation window used in Step 5a.

**Move the ticket to the in-testing status (JIRA only, no confirmation needed).** Before dispatching,
transition the ticket from its ready-to-test state into the **in-testing** status, so the board shows it is
actively under test rather than still queued. Status-only — no comment, no assignee change, no side effect
outside the tracker. **Why this one tracker write is unconfirmed while 5f's is not:** it is the direct,
reversible consequence of the user invoking `/qa-test` (the run *is* the testing), it changes no content,
and Jira's graph makes it a hard precondition for closing the ticket at all (below). The 5f closing
transition asserts an *outcome* and stays confirmed. Don't "harmonize" these two by adding a prompt here.

**Applies only when `tracker.kind = jira`** (`project-profile.json`; absent profile ⇒ Jira, the
VC-internal default). Jira gates status changes behind a **transition graph**, which is what makes this
step load-bearing:

- **Discover the transition live** — never hardcode a name or id (`.claude/knowledge/execution/tracker-ops.md`
  §live transition discovery). On the VC-internal VCST workflow the transition out of *Ready for test* is
  named **`On QA`** and lands on status **`Testing`** — the transition name does NOT match the target
  status, so match on the transition's `to.name` (in-testing), never on its own `name`. A client's Jira
  will use different labels.
- **This is a precondition for Step 5f, not a nicety:** on VCST, *Ready for test* offers only `On QA`,
  `go to inprogress`, `On hold`, `Cancelled` — **`Finish test` / `Need fixes` are not reachable until the
  ticket is in the in-testing status.** Skip this and the closing transition fails at the end of the run.
- Skip (with a one-line note) when: the tracker MCP isn't configured, the ticket is already in the
  in-testing status, or no in-testing transition is available from the current status. Never force a path
  through an unrelated status to reach it, and never transition to `Cancelled`/`On hold`.
- Testing a bare feature name or a PR with no ticket → nothing to transition; skip silently.

**`tracker.kind = azure` (Azure Boards): skip this step.** There is no transition graph — state is set
directly (`PATCH …/wit/workitems/<n>`, `/fields/System.State` via `tracker.azure.stateMap`), so the Step 5f
update has **no reachability precondition** and needs no in-testing hop. Set an in-testing state at Step 4
only if the deployment's `stateMap` actually declares one.

**Two parallel tracks, one concurrency budget.**

1. **Ticket cases** — launch the applicable specialist agents **simultaneously** in a single message using the Agent tool (prompt contract below).
2. **Change-scoped regression (Artifact C)** — run the Artifact-C suite IDs as their own **`/qa-regression <ids>`** run. That command owns suite→agent assignment, the browser pool, retries + fallback, and the run report; `/qa-test` just consumes its pass rate. Capture its `RUN_ID` — 5g records it and the 5h Feature Release Gate keys its "change-scoped regression ≥95%" criterion off it.

**Both tracks draw on the same max-3-concurrent-browser-agent cap.** Count the ticket agents plus the regression lanes before dispatching: if the total exceeds 3, run the ticket cases first and the regression selection after they return (the ticket verdict is the priority; regression feeds the release gate, not the verdict). Say which order you chose.

Each ticket-agent prompt must include:
- The ticket ID(s) or feature being tested
- **Test cases (Artifact A)** — the reviewed ticket cases (path to `test-cases.csv` + the relevant rows)
- **Testing checklist (Artifact B)** — the scoped checklist from Step 3
- **Test data** — the `@td()` aliases / `{{VAR}}` the cases use, confirmed seeded in Step 3 (never hardcode IDs — `.claude/rules/test-data.md`)
- **Business rules to verify** — `BL-*` invariant IDs and rule text from Step 2
- **Edge cases to cover** — `ECL-*` patterns from Step 2
- The browser server to use (from routing table in Step 2)
- Environment URLs
- Screenshot output path: `reports/tickets/{SPRINT}/<ticket-key>/screenshots/` (evidence only — no report file, see below)
- Evidence capture policy: `.claude/skills/qa-evidence/evidence-capture-policy.md`

Artifact C is **not** in the agent prompt — it goes to `/qa-regression`.

Example prompt structure:
```
Test <ticket-key> on the [backend/frontend].

Context: [brief description of what changed]
Environment: {FRONT_URL} / {BACK_URL}
Browser: {BROWSER_SERVER}
Screenshot output: reports/tickets/{SPRINT}/<ticket-key>/screenshots/

Test cases (Artifact A): reports/tickets/{SPRINT}/<ticket-key>/test-cases.csv — rows [IDs]
Testing checklist (Artifact B): [from Step 3 output]
Test data: [the @td() aliases / {{VAR}} the cases use — confirmed seeded; resolve at runtime, never hardcode]

Scope note: run ONLY the cases + checklist above. The change-scoped regression suites are a separate
/qa-regression run — do not execute regression suites in this session.

Business Rules (must verify):
- BL-CART-001: [rule text]
- BL-PAY-003: [rule text]

Edge Cases to cover:
- ECL-1.1: [pattern description]

Evidence policy: follow .claude/skills/qa-evidence/evidence-capture-policy.md
- Screenshots: failures + final state of critical flows only
- Console: capture errors, skip noise
- Network: capture 4xx/5xx and slow requests (>2s)
- HAR: always capture

Always-on bug detection (shared-instructions §Always-On Bug Detection): the checklist is the floor, not the ceiling. While executing, hunt across EVERY layer (UI/visual, functional, console, network, GraphQL errors[] inside 200, a11y, perf) and file any incidental defect you see — even one unrelated to this ticket (out-of-scope-bug rule). Pursue every "huh." Verify before filing (disabled control / API-only / by-design are not bugs).

Return your results (pass/fail per case, evidence refs, bugs found) directly in your final response —
per .claude/rules/reports.md §1 do NOT write a test-execution-report.md file; the orchestrator folds
your results into the single Step 5 report.
```

**Targeted exploratory charter (folded into execution).** The scripted cases are the floor, not the
ceiling — execution also runs a focused `/qa-sbtm` exploratory session. **Mandatory for P0/P1 tickets and
critical revenue flows; optional (but recommended) for P2/P3.** It is **not a separate step** — it rides
inside the Step 4 execution agents:

- **Charter** (scoped to the ticket/feature): Mission — explore the changed area and its integration
  boundaries. Type — **Risk** (bug fixes) or **Feature** (new functionality). Heuristic — **SFDPOT** for UI
  changes, **CRISP** for API/backend. Time box ~20 min.
- **Focus areas**, risk-first: the Test Model risk areas (`ba-system-analyzer` `VC-*` pain points / flows &
  boundaries) **probed first**; interaction with adjacent features (e.g. cart ↔ checkout); data edge cases
  not covered by ACs (empty states, max lengths, special chars); error-recovery paths (network failures,
  validation errors, back-button); state persistence across navigation (refresh, deep link, browser back).
- **Who runs it:** fold the charter into **`qa-testing-expert`** (`playwright-firefox`) — the agent Step 2
  already adds for a P0 / critical-revenue flow — as an additional task in the same prompt, not a second
  dispatch. If `qa-testing-expert` isn't otherwise dispatched (a smaller change), fold the charter into the
  primary execution agent's prompt instead of burning a second browser slot.
- **Trade-off you are accepting by folding it in:** exploration runs *concurrently with* execution, so the
  charter can't be steered by what execution surfaces — it is seeded from the Test Model risk areas alone.
  When execution surfaces something the charter should have chased, note it as a **follow-up charter**
  rather than re-dispatching mid-run — **unless** it is a P0/P1 in a critical revenue flow, which warrants a
  second targeted session once a browser slot frees up.
- Log findings in real time, each classified **Bug / Question / Observation / Risk**; follow the evidence
  policy for any bug. Per `.claude/rules/reports.md` §1 do **not** write an `exploratory-session.md` file
  (this is `/qa-test`'s own ticket-scoped charter, not a standalone `/qa-exploratory` / `/qa-sbtm` domain
  session — those still write to `reports/exploratory/`); findings come back in the agent's response and
  fold into the single Step 5 report.

**Gate (Execution evidenced + risk areas explored):** every atomic condition carries **PASS or FAIL
evidence** (screenshots for critical flows, console/network/trace for failures); the `/qa-regression` track
produced a **RUN_ID + pass rate**; and, for a P0/P1 or revenue flow, the exploratory charter ran and **each
Test-Model risk area was probed** (findings classified Bug / Question / Observation / Risk). **Independent
verification:** a fresh `qa-lead` verifier **re-opens the evidence** (screenshots / traces / the regression
`summary.json`) and rejects any "PASS" with **no artifact** ("all passed" without evidence is not a pass);
it **re-runs one critical/revenue case** by delegating to a specialist on a **different browser lane** than
the doer used, confirms the RUN_ID's pass rate against `compute-metrics.ts`, and confirms the charter
**touched every mandated risk area** (not just the happy path). REJECT on any unevidenced PASS, an uncovered
condition, or a skipped mandated risk area → REASONS + FIX → the execution agent re-captures / re-runs the
missed area → re-verify. On a P2/P3 with exploratory skipped, note the skip (no exploratory verifier pass).

---

### Step 5 — Report

Correlate logs, reconcile ACs, **triage**, decide verdict, file, transition, and deliver the summary.
Sub-steps run in this order — 5d before 5e is load-bearing: the verdict is expressed in terms of a
finding's **provenance**, which only exists once triage has assigned it.

**5a. Correlate App Insights logs (test window):**

Catch backend errors the UI test *triggered but didn't surface* — 5xx, failed dependencies, server exceptions, and GraphQL `errors[]` returned inside a 200. This is the `/qa-monitoring` machinery scoped to the test window: **query → dedup → triage**, no separate live-repro phase (the execution agents were already live — an error that fired during their window *is* the repro).

1. **Pre-flight.** Confirm App Insights access the same way `/qa-monitoring` Phase 0 does (Azure MCP `applicationinsights`, **or** `APPINSIGHTS_APP_ID_*` + `APPINSIGHTS_API_KEY_*` set). If neither is configured → **skip this sub-step with a one-line note** ("App Insights not configured — log correlation skipped"); never block the verdict on it.
2. **Query the window.** For each affected layer (frontend → storefront resource, backend → platform resource; resolve from `APPINSIGHTS_*` env vars, never hardcode), run the probe queries from `ci/monitoring/queries/` scoped to the Step 4 window — a relative `ago()` window covering execution start through now, +2 min buffer.
3. **Dedup + triage.** Classify signatures against `reports/monitoring/.seen-fingerprints.json` (read-only here — do not persist). Dedup here is for **labelling, not filtering**: a narrow test window must still surface a SEEN-stable error that fired during it, because the point is *this feature triggered it*; the fingerprint only tells you whether it is novel. Delegate interpretation to `qa-backend-expert` using `ci/agents/monitor-triage-agent.md`: each signal → `REAL_BUG | KNOWN_ISSUE | NOISE | CONFIG_GATED | THIRD_PARTY | TRANSIENT` + severity + confidence. When ambiguous, prefer NEEDS_REVIEW over REAL_BUG.
4. **Hand to 5d.** A HIGH-confidence `REAL_BUG` correlated to the test window enters triage as a finding with evidence already attached (the error fired while the agents exercised this feature, so it is reproduced) — its provenance and verdict weight are decided in 5d/5e like any other. Attach the signature + telemetry portal link; do NOT draft a separate `BUG-AI-*` monitoring report (5f's filing owns it). NEEDS_REVIEW / NOISE / KNOWN_ISSUE → note in the report, don't fail on them.

**5b. Reconcile ACs against live behavior (AC ↔ implementation):**

`1d` compared each AC against the PR *diff* — a hypothesis. Now close it against what the execution agents actually observed **live**; this is the authoritative AC↔implementation check. For each condition in the **`1d` AC traceability table you are carrying in working context** (there is no `ac-analysis.md` — terminal-only per `.claude/rules/reports.md` §1):

- **SATISFIED live** — agents confirmed the feature does what the AC says.
- **DRIFT / CONTRADICTS confirmed live** — filing-grade: the implementation diverges from the AC. Enters 5d triage as a finding, feeds the 5e verdict as a failure, files via 5f. CONTRADICTS-live is the highest-priority finding — surface it explicitly.
- **NOT-FOUND** — agents observed no such behavior → the AC is unbuilt or the path went untested; mark untested and flag.
- **Static suspicion cleared** — a `1d` DRIFT/NOT-FOUND that agents observed working correctly → resolved; note it (the diff was stale, not the behavior).

Carry the reconciled `Impl verdict` forward in working context for the 5e verdict and the final chat report. A diff-only finding never becomes a verdict input until confirmed (or cleared) here.

**5c. Validate evidence quality:**

| Check | Action if Missing |
|---|---|
| Agent claims PASS but provided no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Request evidence before it enters 5d triage |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| A bug candidate has no reproducible evidence bundle (steps + screenshot/console/network) | Get the evidence, or carry it into 5d as LOW-confidence — never file an unevidenced bug in 5f |
| Business rule `BL-*` listed in prompt but not mentioned in results | Flag as untested — request verification |
| **AC condition in the `1d` table (story AC or gap-AC) has no PASS/FAIL evidence** | Flag as untested — verdict cannot be PASS until covered or explicitly waived |
| **AC marked DRIFT/CONTRADICTS at `1d` but not reconciled live (5b)** | Flag — resolve the AC↔implementation status before verdict |
| Exploratory session skipped for P0/P1 ticket | Flag as incomplete — exploratory coverage required |
| HIGH-confidence `REAL_BUG` in the App Insights window (5a) but not reflected in agent results | Surface it — the UI test missed a backend error; carry into 5d |

**5d. Triage every finding (classify → provenance → severity → dedup):**

Everything the run surfaced — failed AC conditions, live-confirmed DRIFT/CONTRADICTS (5b), agent-reported bugs, exploratory findings, correlated App-Insights `REAL_BUG` (5a) — is triaged **before** the verdict is decided, because the verdict (5e) is expressed in terms of provenance. Nothing is filed yet; 5f files.

1. **Classify each finding** using the `/qa-triage-results` taxonomy (`.claude/skills/qa-triage-results/triage-taxonomy.md`): **real product bug** vs **test-defect** (`TEST_STEPS_DEFECT` / `ASSERTION_DEFECT` / `TEST_DATA_DEFECT` / `STALE_TEST`) vs `BY_DESIGN` / `ENV` / `KNOWN_ISSUE`. Ambiguous → real bug / LOW confidence (never relabel a real bug as a test-defect). A test-defect routes to `/qa-review-tests <suite> --fix`, not a bug ticket.
2. **Provenance — pre-existing, or related to this ticket?** For each *real bug*, decide its relationship to the ticket under test (this is what determines whether it fails the ticket vs is filed separately):
   - **PRE-EXISTING** — a matching bug already exists (found in the step-4 dedup below) or the behavior predates this change (reproduces on the pre-change build). → **Link** it to the ticket as related; do **not** re-file and do **not** fail this ticket on it.
   - **IN-SCOPE** — the defect is in what this ticket changed (an unmet AC, a live-confirmed DRIFT/CONTRADICTS, or a regression the ticket's diff introduced). → **Fails this ticket** (feeds the 5e FAIL); file and link as *caused by* / *blocks* the ticket.
   - **OUT-OF-SCOPE (incidental)** — a real defect in an unrelated area found opportunistically (the always-on / out-of-scope-bug rule). → **File separately** via `/qa-bug` as its own ticket; it does **not** fail this ticket's verdict (unless it is a P0 revenue-flow break — surface that explicitly for a human call). Link as *related*, not *blocks*.
   - When in-scope vs incidental is unclear, treat as **IN-SCOPE** (fail-safe: a real regression is worse missed than a false REOPEN).
3. **Severity + priority** — assign per `.claude/skills/qa-defect/` (P0…P3), so the verdict (5e) and the Feature Release Gate (5h) key off real severities.
4. **Dedup** — glob `reports/bugs/**` + all `reports/tickets/Sprint*/` and search the tracker for the same signature (per `feedback_duplicate_check_across_all_sprints`). A match = PRE-EXISTING (step 2): link it, don't re-file.

Output of 5d: every finding carrying `class` + `provenance` + `severity` + `duplicate-of?`. That table is the verdict's input.

**5e. Decide verdict:**

| Decision | Criteria |
|---|---|
| **PASS** | **Every atomic condition in the `1d` AC table (story ACs + folded gap-ACs) carries PASS evidence**, all conditions reconciled SATISFIED-live (5b), all `BL-*` rules verified, **no IN-SCOPE P0/P1 bug** (5d provenance), exploratory session clean, no correlated HIGH-confidence `REAL_BUG` in the test window (5a) |
| **PASS WITH NOTES** | All conditions met & reconciled, only minor P2/P3 or **OUT-OF-SCOPE incidental** bugs tracked as their own tickets, exploratory observations logged, only NEEDS_REVIEW/NOISE/KNOWN_ISSUE in the log window |
| **FAIL** | Any AC condition not met, any AC confirmed DRIFT/CONTRADICTS live (5b), any `BL-*` rule violated, an **IN-SCOPE P0/P1 bug** (5d), or a HIGH-confidence `REAL_BUG` correlated to the test window (5a). *A PRE-EXISTING or OUT-OF-SCOPE incidental bug does not fail this ticket — it's filed/linked separately (the exception: an out-of-scope **P0 revenue-flow break**, surfaced for a human call).* |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

**Gate (Triage + verdict sound):** every finding classified + **provenance** (pre-existing / in-scope /
out-of-scope) + severity + deduped (5d); the verdict follows the table from the reconciled evidence.
**Independent verification (before 5f files anything):** a fresh `qa-lead` verifier **re-classifies a sample
of the findings** — confirming each **IN-SCOPE** call via a live repro delegated to a specialist on a
**different browser lane**, and confirming the dedup — then ratifies the verdict. REJECT if a real bug was
mislabeled a test-defect, an in-scope P0/P1 was under-graded, or the verdict doesn't follow from the
evidence → REASONS + FIX → re-triage → re-verify. Only an APPROVEd triage proceeds to 5f (filing).

**5f. File bugs & transition the tracker (with confirmation):**

**File** the confirmed, non-duplicate real bugs from 5d via `/qa-bug` (reproduce → document → file), tagged with their 5d provenance (in-scope / incidental) and linked to the ticket (*caused by* / *blocks* for in-scope, *related* for incidental). **Ask before filing to the tracker.** Each filed bug carries a `## Fix Routing` hint (repo/layer) so `/qa-fix` can pick it up. A 5d PRE-EXISTING match is linked, not re-filed; a 5d test-defect goes to `/qa-review-tests <suite> --fix`, never a ticket.

**Then transition the ticket.** Ask the user before transitioning. Skip if Atlassian MCP is not configured.

| Outcome | Transition |
|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED |
| FAIL | `Need fixes` → REOPEN with comment listing failures + filed bug links |

**On Jira**, both closing transitions require the ticket to already be in the **in-testing** status — that's
the Step 4 move. If it was skipped there (or the run started from a ticket still at *Ready for test*),
discover the transitions live and do the in-testing move first, then the closing one. **On Azure Boards**
there is no transition graph: set the mapped `System.State` directly (`tracker.azure.stateMap`) — no
in-testing hop required. Either way **TESTED is the terminal state this command may reach — never
transition to Done or Cancelled.**

Add a JIRA comment with (Markdown, never Jira wiki markup; clear, brief, outcome-first, evidence
referenced not inlined — `.claude/knowledge/execution/tracker-ops.md` §5a **Comment & body style**; the block
below is illustrative content, not a literal wire format):
```
QA Complete — [X] cases, [Y] passed, [Z] failed.
AC review: [N] story ACs ([weak]/[ok]), [M] gap-ACs added; AC↔impl: [satisfied]/[drift]/[contradicts]/[not-found].
Change-scoped regression: [suite IDs] — [pass rate] ([RUN_ID]).
Exploratory: [N] findings ([bugs/observations/risks]).
App Insights (test window): [N] correlated signals — [confirmed/needs-review/none].
Business rules verified: [BL-* list].
Bugs: [list or None]. Decision: [verdict].
Evidence: reports/tickets/{SPRINT}/<ticket-key>/screenshots/
```

**5g. Deliver summary:**

Per `.claude/rules/reports.md` §1, `summary.json` and evidence screenshots are the only artifacts this
command persists to disk — everything else (AC table, checklist, execution/exploratory findings) was
carried in-context and goes out in this same Step 5 chat report, not a separate file. Because
`summary.json` is the **only durable record**, it must carry every field a later consumer needs: the 5h
Feature Release Gate reads the regression block, and the case-promotion follow-up (5i) reads
`new_cases_authored`.

Write `reports/tickets/{SPRINT}/<ticket-key>/summary.json`:
```json
{
  "ticket": "<ticket-key>",
  "ticket_type": "Bug|Story|Task|Tweak",
  "verdict": "PASS|PASS_WITH_NOTES|FAIL|BLOCKED",
  "date": "YYYY-MM-DD",
  "environment": "{FRONT_URL}",
  "build": {
    "platform": "{PlatformVersion}",
    "theme": "{theme version}",
    "relevant_modules": {"module-name": "version"}
  },
  "agents_dispatched": ["ba-story-writer", "qa-frontend-expert", "qa-backend-expert"],
  "ac_analysis": {
    "story_acs": 0,
    "weak_acs": 0,
    "gap_acs_added": 0,
    "impl_coverage": { "satisfied": 0, "drift": 0, "contradicts": 0, "not_found": 0 },
    "conditions_total": 0,
    "conditions_with_evidence": 0
  },
  "total_cases": 0,
  "passed": 0,
  "failed": 0,
  "blocked": 0,
  "new_cases_authored": 0,
  "promotion": {
    "eligible": [],
    "blocked": [{ "case": "TC-ID", "reason": "unresolved {HYPOTHESIS} — <what stayed unknown>" }],
    "verify_pass_run": false
  },
  "regression": {
    "suites": [],
    "run_id": null,
    "pass_rate": null,
    "skipped_reason": null
  },
  "bugs_filed": [],
  "business_rules_verified": ["BL-CART-001"],
  "exploratory": {
    "charter": "Risk charter for <ticket-key>",
    "heuristic": "SFDPOT|CRISP",
    "findings": { "bugs": 0, "questions": 0, "observations": 0, "risks": 0 }
  },
  "appinsights": {
    "checked": true,
    "layers": ["frontend", "backend"],
    "window_minutes": 0,
    "signals": { "real_bug": 0, "needs_review": 0, "dismissed": 0 },
    "correlated_failures": []
  },
  "screenshots": "reports/tickets/{SPRINT}/<ticket-key>/screenshots/"
}
```

Output to the user (chat, in full — this IS the report): verdict, the reconciled AC table, testing-checklist
results, the change-scoped regression result, exploratory findings, business rules verified, bugs found
(with provenance), and the screenshot folder path.

**5h. Feed the Feature Release Gate (team go/no-go).** The 5e verdict is the primary input to the
**Feature Release Gate** (`.claude/skills/qa-metrics/quality-gates.md` §1a) — the team's global
"can we release this feature?" decision, owned by `qa-lead-orchestrator`. `/qa-test` itself ends at the
per-ticket **TESTED / REOPEN** transition; it does **not** decide release. Surface the readiness signal:
a PASS/PASS-WITH-NOTES story run **feeds a GO** only if the gate's team-level criteria also hold (0 open
P0, P1s deferred-with-acceptance, change-scoped regression ≥95% — the 5g `regression.pass_rate`, NFRs
clean, smoke PASS); a FAIL/BLOCKED is an automatic **NO-GO**. State which it is and, on anything short of
GO, the blocking criteria. If the Artifact-C regression run was deferred or skipped, say so — the gate
cannot be evaluated on a null pass rate.

**Gate (Feature Release Gate ratified) — the final independent gate:** the §1a criteria yield GO /
CONDITIONAL GO / NO-GO. **Independent verification:** a fresh `qa-lead` verifier **re-evaluates §1a from the
raw inputs** — the 5e verdict, the `reports/bugs/` open-P0/P1 ledger, the regression pass rate via
`npx tsx scripts/regression/compute-metrics.ts --gate feature --run-id <5g regression.run_id> --p0-bugs N --p1-bugs N`
(the `--run-id` is **required** — this gate is defined on the change-scoped Artifact-C run, and the command
refuses to run unscoped rather than silently returning the whole-history pass rate; `--suites <ids>` is the
fallback when the run wasn't recorded under a single id), and the smoke
result — and ratifies or **downgrades** the recommendation. REJECT (downgrade) if any §1a criterion isn't
actually met by the raw inputs → the recommendation is corrected before it reaches the user. This is a
**recommendation only** — a human still decides release; `/qa-test` never ships.

**5i. Harvest promotion evidence (only when Step 3 authored new cases).**

Step 3 authored the ticket cases as `Automation_Status = Draft`, and that is **mandatory, not provisional**.
Promotion to `Reviewed` requires every assertion grounded with **no `{HYPOTHESIS}`** plus a **`--verify` pass
that upgrades assertions to `{OBSERVED}`** (`.claude/agents/qa-lead-orchestrator.md` §Promotion criteria),
and `--verify` is the **only** step permitted to emit `{OBSERVED}`
(`.claude/skills/qa-review-tests/review-criteria.md` Dimension 10). `--verify` needs a live browser — which
**only Step 4 supplies**. So the ordering is forced in both directions: a run that promotes *before*
executing breaks the promotion gate, and a run that executes *without harvesting* throws its own evidence
away — `/qa-test-lifecycle` then finds the cases still `{HYPOTHESIS}`-tagged and correctly refuses them,
silently converting new coverage into a one-shot.

**Step 4's execution IS the `--verify` evidence. Harvest it before handing off:**

1. Run `/qa-review-tests file reports/tickets/{SPRINT}/<ticket-key>/test-cases.csv --verify --fix` so every
   assertion this run observed live is rewritten `{HYPOTHESIS}` / unconfirmed-`{SPEC}` → `{OBSERVED}`. A
   behavior the run **refuted** surfaces as ENV-008 — never as `{OBSERVED}`.
2. **Resolve each remaining `{HYPOTHESIS}`** by recording the value the case was asking about (e.g. which
   error code wins when two blocking predicates apply). One that stayed genuinely unknown must be
   **reworded as a question** and keeps its case at `Draft` — never invent a value to clear the gate.
3. **Classify every new case**: *promotion-eligible* (0 Blocker / 0 Critical, all assertions grounded,
   executed with evidence) vs *blocked*, each blocked one carrying its concrete reason — an unresolved
   `{HYPOTHESIS}`, a FAIL whose expected value is still in doubt, or a condition that never ran.
4. Record the result in `summary.json` `promotion` (5g). This is a **hand-off record, not a substitute for
   the promoter's own gate** — `/qa-test-lifecycle` **Phase 6P** re-derives eligibility from the CSV itself
   (G10: zero GRD-001 Blocker/High, 0 ENV-008, green `td:validate`, then human approval) and will demote an
   "eligible" case that fails re-derivation. It must keep doing so: a promoter that trusted this block would
   let the author certify its own gate. The block exists so the follow-up starts from a known state and so a
   skipped promotion is visible later, never so the gate can be short-circuited.

**`/qa-test` never promotes.** Only `qa-lead-orchestrator` or the user may promote `Draft → Reviewed`, and
`test-management-specialist` never self-promotes (§Promotion scope). This sub-step *prepares* promotion;
**`/qa-test-lifecycle` Phase 6P** performs it (pointed to in 5j). A Dimension-11 CONFIRMED does not promote
`Automation_Status` either — it supplies evidence only.

**Gate (Promotion evidence grounded):** every `{OBSERVED}` upgrade traces to a real artifact from this
run's execution; every surviving `{HYPOTHESIS}` is either resolved with the observed value or reworded as a
question; the eligible/blocked split matches the review output. **Independent verification — this one is
not optional, because an `{OBSERVED}` tag is a claim that a behavior was seen live, and a doer upgrading
its own tags is exactly the hallucination Dimension 10 exists to catch:** a fresh `qa-lead` verifier
**re-runs `npm run suites:review`** on the CSV and, for a sample of the upgraded assertions, **re-opens the
Step-4 evidence** (screenshot / trace / recorded response) that supposedly grounds each one. REJECT any
`{OBSERVED}` with no traceable artifact, any `{HYPOTHESIS}` cleared by an invented value, and any case
marked eligible while still carrying a Blocker/Critical → REASONS + FIX → the doer re-harvests →
re-verify. An ungrounded `{OBSERVED}` is worse than a `Draft` case: it promotes a fabricated expectation
into permanent regression coverage, where it will fail confusingly for years.

**5j. Close the loop — next steps.** `/qa-test` verifies and reports; it never fixes. Name the close-out
paths so nothing stalls:

- **PASS / PASS WITH NOTES** → ticket at TESTED; hand to the **Feature Release Gate** (5h) for the team
  GO/NO-GO. Done.
- **FAIL → REOPEN** → for each filed bug, the close-out loop is:
  `/qa-fix <ticket-key>` (autonomous triage→fix→PR, G0–G7, never auto-merges) → human review + merge +
  deploy → **`/qa-verify-fix <ticket-key>`** (two-phase RED→GREEN re-test + regression, transitions
  TESTED/DONE). A bug too complex/multi-repo for `/qa-fix` (G0 BAIL) is handed to a human, same loop
  resuming at `/qa-verify-fix` once fixed.
- **BLOCKED** → resolve the blocker (env / data / dependency) and **re-run `/qa-test <ticket-key>`** from the
  top; no partial credit.
- **New cases authored (`new_cases_authored` > 0)** → the cases live in the run-scoped
  `reports/tickets/{SPRINT}/<ticket-key>/test-cases.csv` and **no runner will ever pick them up there**.
  5i has already harvested this run's live evidence and split them into promotion-eligible vs blocked, so
  state the follow-up concretely:

  ```bash
  /qa-test-lifecycle <ticket-key> --promote-only
  ```

  That is **`/qa-test-lifecycle` Phase 6P** (`.claude/commands/qa-test-lifecycle.md` §6P) — it globs
  `reports/tickets/*/<ticket-key>/test-cases.csv` across all sprints, re-derives eligibility, and on approval
  appends the eligible cases into `regression/suites/<layer>/<module>/` via `suites:append` + `suites:sync`,
  flipping them `Draft → Reviewed`; each blocked case stays `Draft` in the ticket folder with its 5i reason.
  Drop `--promote-only` if the suites also need a sync/gap pass. Name the counts and the blocked reasons in
  the report. **6P re-derives eligibility from the CSV and still requires human approval** — 5i pre-approves
  nothing (a hand-off record the promoter trusted would be the author certifying its own gate); it only
  means the follow-up isn't starting from zero. Skipping it converts new coverage into a one-shot.

These are pointers, not auto-triggers — `/qa-test` stops here and states the next commands; a human (or a
separate run) owns each follow-up.

---

## Rules

- **Every step is `DOER → GATE → INDEPENDENT VERIFIER`** (see §Quality-gate model). The verifier is a
  **fresh `qa-lead-orchestrator` instance in verifier mode** (`.claude/agents/qa-lead-orchestrator.md`
  §Verifier Mode) — **never** the inline orchestrator running this pipeline and **never the step's own
  doer**. It re-derives evidence from source (re-runs `suites:review`/`td:validate`/`compute-metrics`,
  re-reads the artifact, re-opens the evidence, or delegates a live re-check to a specialist on a
  **different browser lane**), never APPROVEs on the doer's summary, and biases **when-in-doubt-REJECT**.
- **The verifier REJECT loop: reject → REASONS + FIX → wait for the doer's fix → re-verify from scratch.**
  `≤2` iterations; a persistent REJECT is a **STOP for a human**, never a silent proceed. The FIX and the
  re-verify go to the **step's doer**, not the verifier. Step 3's and Step 5d's gates are hard STOPs
  (don't dispatch Step 4 / don't file at 5f until APPROVE). Skip a verifier pass only for a trivial P2/P3
  step (note the skip); P0/P1 and revenue-flow steps are always verified.
- Dispatching a scoped verifier is **not** delegating the orchestration — you keep running `/qa-test`
  inline; the verifier only rules on one gate and returns `APPROVE|REJECT`.
- Follow `.claude/skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, error handling, and JIRA transitions
- **Reference every in-repo file by its real path from the repo root** — `.claude/skills/…`, `.claude/knowledge/…`, `.claude/rules/…`, `.claude/agents/…`, `ci/…`. The bare `skills/…` / `knowledge/…` form is a leftover from when this surface was a plugin and does not resolve today; it is especially harmful inside a sub-agent prompt, where the agent simply fails to read the policy it was told to follow
- **Step 1 is one step with five ordered sub-parts** — `1a` fetch & classify (the fetch must precede the type gate, the BA gate, the duplicate check, and the story review), `1b` pre-flight + sprint resolution + cross-sprint duplicate check (resolve `{SPRINT}` *before* the glob that uses it), `1c` BA-gated context, `1d` story review, `1e` Test Model. Story analysis is **inside** Step 1, not a separate step: its AC traceability table is a Test Model field
- Step 1's `1c` gate: delegate `ba-system-analyzer` for a New feature/Story, any P0/P1, cross-layer, ≥2-domain, critical-revenue-flow, or unclear-surface ticket; gather context **inline** for a P2/P3 single-layer single-domain bug fix or tweak. The Test Model carries the same fields either way. On `ba-system-analyzer` internal error, gather context inline rather than retrying the delegation
- Step 1d BA story review (`ba-story-writer` Mode B) runs for any tracker ticket with ACs — it is **advisory, never blocking**: surface weak ACs / gaps / implementation drift, fold gap-ACs into scope, and keep testing. Skip with a note for a bare feature name or PR with no governing story
- A Step 1d AC↔implementation finding from the PR diff is a **suspicion to verify live** (Step 5b), never a confirmed defect on its own — only a live-confirmed CONTRADICTS/DRIFT fails the verdict (mirrors the no-diff-only-bug rule)
- The Step 1d AC traceability table (kept in-context, not a file) is the verdict spine: a PASS requires PASS evidence for **every** atomic condition (story ACs + folded gap-ACs), all reconciled SATISFIED-live in Step 5b
- `ba-story-writer` in review mode must not write to JIRA/GitHub or author a replacement story — it returns the review only
- Step 2 **enriches** the Step 1 Test Model rather than re-deriving it: load `BL-*` rule text + `ECL-*` patterns + `E2E-*` scenarios, and query VirtoOZ docs **only when `1c` gathered context inline** — when `ba-system-analyzer` was delegated, reuse its docs grounding + risk areas (top up specific gaps only). Pass findings to agents so they test against current module behavior
- Steps 2–3 reuse the `/qa-plan` scenario catalog (`.claude/skills/qa-plan/e2e-scenario-catalog.md`) for `E2E-*` scenario coverage + regression-suite traceability, but produce a scoped in-context testing checklist — **not** a full `/qa-plan` test plan / RTM / TestRail CSV. Full case authoring + peer-review promotion belongs to a standalone `/qa-plan` run, not `/qa-test`
- `test-management-specialist` (Step 3) produces **three hand-off artifacts** — (A) test cases/scenarios (author new for a New feature/Story; map-to-existing + gap-author for a bug/enhancement), (B) a scoped testing checklist, (C) a change-scoped regression **selection** — then **reviews & auto-fixes** any newly authored cases via `/qa-review-tests --fix`, and (only if the cases need data not already in an `@td()` fixture) delegates to `test-data-engineer` to **design + seed** it via `/qa-generate-data` → `/qa-seed-data` (green `td:validate` gate). All of this must complete — cases reviewed, data confirmed seeded — before Step 4
- **Artifact C runs as its own `/qa-regression <ids>` run, never inside a ticket agent's prompt.** `/qa-regression` owns suite→agent assignment, the 3-lane browser pool, retries/fallback, and the run report; folding suites into a ticket agent breaks one-agent-per-suite, the batch-of-3 pool, and the long-runner reliability cap. Both tracks share the max-3-browser cap — if ticket agents + regression lanes exceed 3, run the ticket cases first (they own the verdict) and regression after. Capture the `RUN_ID` + pass rate: it is the 5h gate's input and a `summary.json` field
- **Step 3 runs the same mechanism as `/qa-test-lifecycle` Phases 3–4, and the skills own it.** `/qa-test-cases-generator` + `test-case-template.md` own the authoring contract + the `Automation_Status` enum; `/qa-review-tests` owns the dimensions/codes/severities/auto-fix matrix (and `triangulation-criteria.md` the behavior-rewrite evidence bar); `/qa-generate-data` → `/qa-seed-data` own data prep; `/qa-test-lifecycle` §Phase 4b owns the write-scope ceiling + revert-on-regression rule. **Never restate a dimension, code, severity, column or enum value here** — reference it. Only two things differ between the two commands: where the rows land (run-scoped ticket CSV vs `regression/suites/`) and who may promote (6P only)
- **New cases authored in Step 3 are run-scoped, not durable coverage.** Nothing reads `reports/tickets/**`; promotion into `regression/suites/` + `config/test-suites.json` is **`/qa-test-lifecycle` Phase 6P**, prepared by 5i and stated as a 5j follow-up (`/qa-test-lifecycle <ticket-key> --promote-only`), with the counts recorded in `summary.json`. Both the run-scoped CSV (Step 3) and the promoted rows (6P) are written by the same deterministic appender, `scripts/test-cases/append-test-cases-to-suite.ts` — never a hand-rolled append
- **Promotion is execute-then-promote, and the order is forced by the gate itself.** Cases are authored `Draft` (Step 3) → executed as `Draft` (Step 4) → **5i harvests that execution as the `--verify` evidence** that upgrades assertions to `{OBSERVED}` and resolves each `{HYPOTHESIS}` → `/qa-test-lifecycle` **Phase 6P** promotes only the eligible ones, re-deriving that eligibility itself. `--verify` is the sole emitter of `{OBSERVED}` and needs a browser, so promoting before execution is impossible and executing without harvesting silently strands the coverage. **`/qa-test` prepares promotion but never promotes** — only `qa-lead-orchestrator` or the user may, and `test-management-specialist` never self-promotes. The `Automation_Status = Draft` escalation trigger targets a `/qa-regression` run consuming promoted suite cases, **not** a ticket-scoped run whose cases were reviewed in the same turn
- Step 5 order is load-bearing: **5d triage runs before 5e verdict**, because PASS/FAIL are expressed in terms of a finding's provenance (PRE-EXISTING → link, don't re-file · IN-SCOPE → fails this ticket · OUT-OF-SCOPE incidental → own ticket, doesn't fail this one), which only exists after triage. 5d classifies + assigns provenance/severity + dedups and files **nothing**; 5f files (with confirmation) and transitions. A test-defect routes to `/qa-review-tests --fix`, not a ticket. Only an **in-scope** P0/P1 (or an out-of-scope P0 revenue break) fails the verdict
- `/qa-test` closes the loop by **pointer, not auto-trigger** (5j): FAIL/REOPEN → `/qa-fix <ticket-key>` → human merge/deploy → `/qa-verify-fix <ticket-key>` (RED→GREEN re-test); BLOCKED → resolve blocker → re-run `/qa-test`; new cases → `/qa-test-lifecycle` to promote the 5i-eligible ones. It states the next command and stops — it never fixes or auto-invokes `/qa-fix`
- Ticket status tracks the run: Step 4 moves it into the in-testing status (status-only, **no confirmation** — it is the direct consequence of invoking `/qa-test`, changes no content, and is a hard Jira precondition for closing), 5f closes it to TESTED / REOPEN (**with confirmation** — it asserts an outcome). **Step 4's hop is JIRA-only** (`tracker.kind = jira`); Azure Boards sets `System.State` directly via `stateMap`, so it has no such precondition and Step 4 is skipped. Discover Jira transitions live; the transition name need not match the target status (VC-internal VCST: `On QA` → `Testing`)
- Never use WebKit — not supported on Windows
- Never assign two agents to the same browser server simultaneously
- Read all URLs from config.js / .env — never hardcode
- Max 3 concurrent browser agents — counted across ticket agents **and** regression lanes
- Browser fallback: chrome→firefox, edge→chrome, firefox→edge (max 1 retry)
- If an agent fails with an internal error, fall back to working directly rather than retrying the same delegation
- If Atlassian MCP is unavailable, skip JIRA transitions and ask user for ticket details manually
- Always load `business-logic.md` for the affected domains — agents must know what rules to verify
- **Terminal-only by design** (`.claude/rules/reports.md` §1): Steps 1d/3/4 never write `ac-analysis.md` / `testing-checklist.md` / `test-execution-report.md` / `exploratory-session.md` — 5b reconciles the AC table from **working context**, not from a file. Only `reports/tickets/{SPRINT}/<ticket-key>/summary.json`, evidence screenshots, and (if Step 3 generates new cases) `test-cases.csv` persist to disk; every other finding is carried in-context and delivered once, in the Step 5 chat report
- The exploratory charter is **folded into Step 4 execution** (there is no separate exploratory step) — mandatory for P0/P1 tickets and critical revenue flows, optional for P2/P3. Fold it into `qa-testing-expert`'s prompt (the agent Step 2 already adds for P0/critical-revenue) as an additional task rather than a second dispatch; if `qa-testing-expert` isn't otherwise dispatched, fold it into the primary execution agent's prompt instead of burning a second browser slot. Accept the stated trade-off (the charter runs concurrently with execution, so it is seeded from Test Model risk areas, not from what execution surfaces); a P0/P1 revenue-flow finding execution surfaces may still warrant a second targeted session once a browser slot frees
- App Insights correlation (5a) reuses `/qa-monitoring`'s query + dedup + triage machinery (`ci/monitoring/queries/*.kql`, `reports/monitoring/.seen-fingerprints.json` read-only, `ci/agents/monitor-triage-agent.md`) scoped to the test window — **no separate live-repro phase** (the execution agents already exercised the feature). Dedup **labels** novelty, it does not filter: a SEEN-stable error that fired in the window still surfaces. Resolve resources from `APPINSIGHTS_*`, never hardcode; skip gracefully (don't block the verdict) when App Insights is unconfigured
- A correlated error does NOT get its own `BUG-AI-*` monitoring draft — the test's own bug filing (`/qa-bug` in 5f) owns it, to avoid duplicate reports
