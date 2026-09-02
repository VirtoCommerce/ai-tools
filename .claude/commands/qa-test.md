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
| Steps 2–3 — oracles, the three artifacts, scaffold + fan-out | [`skills/qa-test/authoring.md`](../skills/qa-test/authoring.md) |
| Step 5 — triage, verdict, filing, report, promotion | [`skills/qa-test/close-out.md`](../skills/qa-test/close-out.md) |
| `--epic` · `--iterate` | [`skills/qa-test/modes.md`](../skills/qa-test/modes.md) |
| Verifier mode · agent routing · the agent prompt contract · what persists | [`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) |

## Usage
```
/qa-test <ticket-key>                    # Test a specific tracker ticket
/qa-test <ticket-key-1> <ticket-key-2>   # Test multiple tickets
/qa-test checkout flow                   # Test a feature area by name
/qa-test PR #789                         # Test changes in a GitHub PR
/qa-test <ticket-key> --iterate          # Bounded test→fix→re-test loop (default 2 rounds; --max-rounds N)
/qa-test --epic VCST-100                 # Test a parent Epic's child stories in series
```

**Argument normalization — there is no argv parser, so state what you resolved.** This command is a prompt,
not a script: an ambiguous spelling is resolved by *reading*, so resolve it explicitly and say so in one
line before Step 1, rather than acting on a guess.

| Written | Read as | Note |
|---|---|---|
| `--iterate` | `--iterate --max-rounds 2` | 2 is the default |
| `--iterate N` / `--iterate=N` | `--iterate --max-rounds N` | the obvious intent; accept it, don't refuse |
| `--max-rounds N` with no `--iterate` | **`--iterate --max-rounds N`** | a round cap is meaningless without the loop |
| a second bare token that is not a ticket key, `PR #N`, or a flag | **STOP and ask** | never silently fold it into the target or a flag value |

`--iterate` and `--epic` **compose** (the loop tries to fix a failing child story before the chain
continues). Neither flag changes the FAST/FULL routing — that comes only from ticket type × status at `1a`.

---

## Routing — two axes, decided at 1a

Single source of truth for both matrices:
[`.claude/knowledge/execution/ticket-routing.md`](../knowledge/execution/ticket-routing.md). **Cite it,
never restate it here.**

1. **FLOW** — which pipeline runs at all: `verify-fix` · `hotfix-verify` · `feature-test`.
2. **EFFORT** — FAST or FULL. Applies **only** within `feature-test`.

| Flow | Ticket | Action |
|---|---|---|
| `verify-fix` | a **fix-ready** Bug | **Run `/qa-verify-fix` inline** (§1a). Steps 2–5 do not run. |
| `hotfix-verify` | a **hotfix-ready** Bug | **STOP** with a one-line pointer: `Run /qa-hotfix-check <ticket-key>`. File nothing; transition nothing. |
| `feature-test` | Story / Task / Technical task / Epic, and a **not-fixed** Bug | The five steps below, at the resolved effort. |
| — | a **Sub-task** | Resolve the parent and re-enter this classification as the **parent's** type × status. |

A `not-fixed` Bug runs FAST to reproduce and characterize the defect live with fresh evidence — there is no
fix to *verify* yet; state that the next step is `/qa-fix <ticket-key>`.

**Effort:** FULL for a new feature / Story / Epic, P0–P1, cross-layer, ≥2 domains, a critical-revenue flow,
or an unclear surface. FAST for a bug fix / copy-tweak / config / Technical task that is P2–P3, single-layer,
single-domain, obvious surface. **When in doubt, take FULL** — a real regression is worse missed than a fast
run saved. Why the line sits there, and the two deliberate consequences: [`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) §Effort routing.

---

## The FAST path, in full

Stated once, completely. **Everything after this section is the FULL path.**

```
1a  route + fetch (comments + attachments, always)   → name the parent Epic in one line, no sibling analysis
1b  pre-flight, sprint, duplicate check              → incl. 2b layer + 2c visual_surface
2   load the affected domains' BL-* rule TEXT; route ONE execution agent (+ the visual lane). Stop there.
3   Artifact B checklist (conditions from 1a's ACs) + Artifact C scope + test data (3a) if needed
4   one execution agent runs the checklist; the visual lane if visual_surface; then the change-scoped
    regression (no --also-ids)
5a  triage · 5b reconcile AC/DoD · 5c verdict · 5d file (severity floor) · 5e report · 5f status · 5h docs
```

**The one exception to "one execution agent": the visual lane.** When `1b` item 2c derives
`visual_surface: true`, FAST **also** dispatches `ui-ux-expert` for the design + accessibility pass
([`skills/qa-test/visual-axis.md`](../skills/qa-test/visual-axis.md)). This is a deliberate, chosen change to
FAST's cost promise, not an oversight: a `.scss`-only PR, an icon migration or a P2 restyle is by
construction *single-layer, single-domain, obvious surface, P2* — so **the class of change most likely to
break the UI is exactly the class that routes here**, and a one-agent functional checklist cannot see a
contrast failure, a token collision or a control that drifted from the design. The cost is one agent on a
fourth browser lane; the alternative was a path that verified everything about a restyle except how it
looks. FAST is otherwise unchanged — still no cases, no Test Model, no verifier.

**Not run on FAST:** `1c` / `1d` agents · the `1e` Test Model and `1e-plan` · the archetype / UIP / `VC-*`
sweeps · Artifact A authoring (so **no new test cases and no new regression coverage** — the route back in is
`/qa-test-lifecycle`) · `5g` promotion · every independent verifier dispatch (each gate is an inline
self-check).

**Still run on FAST, and load-bearing:** the `BL-*` rule text (the correctness oracle the checklist asserts
against — dropping it makes a FAST verdict ungrounded rather than merely cheap) · the ticket comments and
attachments · `5b` (it produces the verdict) · the committed `testing-checklist.md`, which is the run's
**only** durable record · **the visual lane when `visual_surface: true`** (see the block above), whose
conditions become checklist rows for exactly that reason.

**`--iterate` is valid on FAST, and this is where it earns most.** 5k needs a filed bug and a
change-scoped regression, and FAST produces both — it just has no authored cases to re-run, so round N+1
re-runs the **failed checklist items** plus the regression, **re-scoped to the fix’s own diff** rather
than the ticket's, and the checklist is **appended to** per round rather than overwritten — on FAST it is
the only durable record, so rewriting a round-1 FAIL as a round-2 PASS deletes the proof the defect
existed. FAST is the bug-fix / tweak path, so it is the
likelier place to want a fix-and-retest loop at all. What stays off on FAST inside the loop: the verifier
re-ratification in 5k step 3, exactly as at every other FAST gate.

**Gate (FAST, inline):** the checklist covers every atomic condition; `npm run td:validate` is green. No
`suites:review` — nothing was authored.

---

## Quality gates — FULL path

A step passes its gate or **STOPS**. Three are hard-STOP gates verified by a **fresh
`qa-lead-orchestrator` in §Verifier Mode**; every other gate, and the whole FAST path, self-checks inline.

| Gate | Where | Verified by |
|---|---|---|
| Model complete | 1e (9 clauses) | inline (doer's own check) |
| **Artifacts reviewed + data seeded** | Step 3 | **fresh `qa-lead` verifier — hard STOP** |
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

**Fetch first** — every later sub-part depends on these fields.

- **Tracker ticket** — Atlassian MCP `getJiraIssue` (summary, Type, Priority, Status, Components, ACs). Not
  configured → ask the user to paste the details. Linked PR → GitHub MCP `get_pull_request` +
  `get_pull_request_files`. Confirm the ticket is in a testable status.
- **Read the ticket comments (both paths, always).** The description is the plan; the **comments are what
  actually happened** — the real repro, PO/dev clarifications, scope changes, "fixed in build X" /
  "reopened because…" notes, and prior QA findings the description never carries. Fold the load-bearing
  facts into the Test Model's `Ticket signals`; a comment that narrows the repro or moves the goalposts
  changes what you test. On a PR, review threads flag the reviewer's own risk areas.
- **Analyze the attachments (both paths, always).** Screenshots, mockups, logs, HAR and short videos are
  primary evidence — **open them**, don't just note they exist. A screenshot usually shows the exact
  expected-vs-actual (seeds 5b and each case's assertion); a design mockup is the visual oracle; a
  log/HAR/stack trace narrows the repro and the affected layer. Download each attachment and `Read` it.
  Reference the concrete finding, not the filename. An attachment that can't be fetched is a **noted gap**,
  never a silent skip.
- **Resolve the parent Epic** (FULL only; on FAST name it in one line). Fetch the Epic (summary +
  Epic-level ACs) and its child-story list with statuses, then classify the siblings: **Done** = the
  integration surface this story plugs into (its seams must still work → fold into the checklist +
  regression selection); **In-progress / blocked** = dependencies (a hard one may force a BLOCKED verdict or
  a stubbed boundary — say which); **this story** = the slice under test. Place the story in the Epic's
  end-to-end flow. Lands in the model's `Epic context`. No parent Epic ⇒ skip with a one-line note.
- **A PR** — map extensions: `.cs`/`.csproj` → Backend, `.vue`/`.ts`/`.tsx`/`.jsx` → Frontend,
  `.css`/`.scss` → Styling. This is the coarse read; `1b` item 2b refines it into the layer token set
  (`storefront`/`admin-spa`/`api`/`module`/`platform`) using the repo identity, which the extension
  alone cannot give — a `.cs` file is `api` in `*ExperienceApi*` and `module` anywhere else.
  **A feature name** — use it to determine the affected areas.
- **Identify applicable domain(s)** — map to the 63 `/qa-checklist` domains.

**Then classify and route** — per `ticket-routing.md`, which owns the matrix:

1. **Normalize the type** — JIRA `fields.issuetype.name` / Azure `System.WorkItemType` per `tracker-ops.md`
   §5a, mapped to a canonical type through the profile's `workItemTypes` map. For a PR / bare feature, infer
   from diff size + surface.
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
The feature-test authoring/AC-reconcile/promotion machinery (Steps 2, 3, 5b, 5g) is **not** run — a fix-ready
Bug needs its fix verified, not new cases authored. The run ends at the verify-fix verdict.

**Fail-safe (per `ticket-routing.md` §6):** if a `fix-ready` Bug has no STR **and** no linked fix PR,
`verify-fix` has nothing to prove RED→GREEN against → fall back to the `feature-test` FAST path and note
the missing repro basis, rather than forcing an empty verification.

#### 1b — Pre-flight, sprint resolution & duplicate check

Per `.claude/templates/agent-dispatch.md`:

1. **Environment health** — `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version** — GitHub MCP `get_file_contents` on `backend/packages.json` + `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`, or the branch matching `TEST_ENV`). Record platform + theme + ticket-relevant module versions — this is the **`declared`** (git) state. Then probe `GET {{BACK_URL}}/api/platform/modules` for the **`deployed`** state, which is the ground truth and routinely differs (deploy in flight, failed, or partially applied). A failed probe records `deployed: UNKNOWN` — **never** fall back to `declared`. **PR testing:** confirm the PR's artifact version appears in `packages.json`/`artifact.json`; if not deployed → offer `/qa-deploy-pr <ticket-key>` (**ask first**) or warn and ask whether to wait.
2a. **Recent-release check** — read `.claude/knowledge/domain/release-ledger.md` §1 + the newest §2 month(s) for the ticket's component(s), and record the Δ vs `deployed` in `summary.json` as `releasedThrough`. Full precedence rule: `agent-dispatch.md § Build Verification`. Three consequences, and they are the reason this step exists rather than being a header field:
   - **A ⚠ BREAKING change in the component under test forces FULL**, whatever `1a` scored. `ticket-routing.md` says *when in doubt → FULL*; a contract that moved last month is doubt with a date on it, and a FAST run would author no cases and write no Test Model against it.
   - **It feeds `1d`'s AC↔implementation check a third leg.** That check is otherwise static — ACs vs *this* PR's diff — and a breaking change elsewhere in the same component is invisible to that diff while being the likeliest cause of a DRIFT nobody owns.
   - **Released ≠ deployed.** A capability the ledger records that the probe does not carry is `NOT_DEPLOYED` → BLOCKED-on-deploy, never a FAIL and never a filed bug. And the ledger carries **no behaviour**, so it can never ground an assertion as `{DOC}`; that stays `{OBSERVED}`.
2b. **Resolve the LAYER — derived, never asked, never defaulted.** Derived HERE and persisted at 5e.3
    (with the rest of `summary.json`); 5e.0 resolves everything downstream of it and 5f only points.
    It lands as `summary.json.layer`
    with the ordered sources that voted in `release.layer_source[]`. It is resolved here, not at 5f, so
    one derivation serves both the FAST/FULL decision (`ticket-routing.md` already routes cross-layer →
    FULL) and the release note 5f points at, whose whole routing axis is the layer
    (`.claude/knowledge/ba/virto-doc-style.md` §9). Token set: `storefront` · `admin-spa` · `api` ·
    `module` · `platform` · `cross-layer`.

    Take the **union of sources 1 and 2**; if it has more than one member, `layer = cross-layer` and the
    members go in `release.layers[]`. Sources 3–5 are fallbacks, used only when 1 and 2 both yield
    nothing.

    | # | Source | Yields |
    |---|---|---|
    | 1 | **The PR diff** — the extension map in `1a`, refined by repo identity through `ci/lib/repo-router.ts` `REPO_PROFILES` + `resolveOwningSubApp()` | `vc-frontend` → `storefront`; `vc-platform` → `platform`; `vc-module-*` → `module`, narrowed to `admin-spa` on a `moduleFrontendSubApps` path or `**/Scripts/**` + blade markup, and to `api` on `*ExperienceApi*` / `*.Web/Controllers` |
    | 2 | **`regression.suites[]` → `config/test-suites.json`** | `layer: frontend` → `storefront`, `layer: backend` → `module`; per-suite `concern: api` → `api`, `concern: admin` → `admin-spa`; tags `admin-spa`/`xapi`/`graphql`/`storefront` refine. **Read the DATA, not the manifest's declared `concerns` enum** — the rows carry `e2e` and `graphql` too, which the enum does not list |
    | 3 | **`build`** — which of `theme` / `relevant_modules` / `platform` actually moved | theme only → `storefront`; a module → `module`; platform → `platform`. Weakest: a deploy bumps versions this ticket never touched |
    | 4 | **`bugs_filed[]` → fix PR → repo kind** | the same rule as source 1, applied to the fix rather than the change |
    | 5 | **The ticket's own Components** → `.claude/knowledge/execution/module-suite-map.md` | weakest of all — human-curated and drifts |

    **Three loud failures, and none of them is a default.**
    - No source yields a token ⇒ `layer: null`, `layer_source: ["UNRESOLVED"]`, and 5f refuses the
      fragment (`release.refusal: "layer-unresolved"`) and names **no** command. **Never default to
      `storefront`** — a wrong layer routes the note to the wrong audience, which is worse than no note.
    - Sources 1 and 2 disagree while `1a` routed the ticket single-layer FAST ⇒ `layers_conflict: true`,
      surfaced in the fragment’s own footer, not only in JSON. That is a contradiction between the
      routing decision and the layer, and a human should read it.
    - `layer_source[]` is **always** populated. Following `releasedThrough`’s own rule: null means the
      source was not consulted, which is a gap, not a zero.
2c. **Resolve `visual_surface` — same block, same discipline.** Does this ticket change something a human
    LOOKS AT? Derived here, never asked, never defaulted; lands as `summary.json.visual.surface` with
    `visual.surface_source[]`. It is **one token replacing two undefined phrases** — the old *"UI/component"*
    dispatch trigger and the old *"for a UI surface"* oracle condition, neither of which anything checked was
    applied. Derivation table, the three axes it schedules, and the verdict rules:
    [`skills/qa-test/visual-axis.md`](../skills/qa-test/visual-axis.md).

    In short: `true` when the diff touches `.vue`/`.scss`/`.css`/`.html`/blade markup/icons or tokens, **or**
    the derived layer is `storefront`/`admin-spa`, **or** a target suite is `layer: frontend`. `api`/`module`/
    `platform` alone ⇒ `false`. **`unresolved` is treated as `true`** — the one place this axis fails open,
    in the same direction as *when in doubt, take FULL*: a wrongly-skipped visual pass leaves no trace, a
    wrongly-run one costs one agent.

    **It is a LANE trigger, not an EFFORT trigger** — it never forces FAST → FULL. A P2 restyle stays FAST
    and gains the lane.
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
the scenario table must satisfy, the nine-clause gate and the worked references:**
[`skills/qa-test/test-model.md`](../skills/qa-test/test-model.md). Read the latter before writing the model —
the gate below is only its checklist.

**Gate (inline, 9 clauses — every one contradictable):** flow/type/path set + atomic conditions + BL/ECL/
domains/risk areas · `Value chain` complete **with the `flowchart` in the file** · `Mechanism coverage
matrix` with **no blank cells** + `Reverse edges` resolved · first scenario row is the `Technique:FLOW`
journey · `Condition space` states factors, classes, constraints and raw N · `Reduction` states `N → M` **and
names what it dropped** · every row carries all five (cell · defect hypothesis · archetype · technique ·
oracle) · every oracle is `{BL}`/`{SPEC}`/`{DOC}` or says what would make it one · `Archetype sweep`
resolved (covered or **WAIVED with a reason** — silence is not a waiver).

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
[`skills/qa-test/authoring.md`](../skills/qa-test/authoring.md) §The KEEP gate.

---

## Step 2 — Plan

Enrich the Step-1 model with the knowledge it doesn't carry, then route agents. This *completes* the model;
it does not re-derive what Step 1 populated. Skip anything `1c` already returned.

Load, for the identified domains, the **actual rule text and patterns** (not just IDs): `business-logic.md`
`BL-*` · `e-commerce-edge-cases-library.md` `ECL-*` · the domain checklists via `/qa-checklist` ·
`skills/qa-plan/e2e-scenario-catalog.md` `E2E-*` (the suite-traceability backbone for Artifact C) ·
`oracles/vc-bug-catalog.md` `VC-*` (each entry's `Detection probe` is a ready-made scenario) · **when `1b`
item 2c derived `visual_surface: true`**, the `BL-UI-*` **and `BL-A11Y-001..004`** invariants +
`critical-ui-scope.md` + `qa-design` §State-Stress + the generated selectors **and design tokens** ·
`modern-web-attack-surface.md` §`UIP-*`. Then query VirtoOZ docs via `/vc-docs` — **skip when
`1c` delegated to `ba-system-analyzer`**, topping up specific gaps only.

The condition is the derived token, not a judgment call — *"for a UI surface"* used to be an unchecked
phrase. `BL-A11Y-001..004` are new to this load and are all **P1**: the pipeline previously carried no
accessibility oracle at any step.

Per-source detail and the sweep-resolution rules:
[`skills/qa-test/authoring.md`](../skills/qa-test/authoring.md) §Step 2. Agent routing table:
[`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) §Agent dispatch.

**Gate (inline):** every affected domain has its `BL-*`/`ECL-*`/`E2E-*`/`VC-*` loaded and an agent routed;
**every in-domain defect-shaped `VC-*` entry is either a scenario row or an explicit N/A**; the `Archetype
sweep` is resolved; **when `visual_surface: true`** the `UIP sweep` is resolved, the UI + a11y oracles are
loaded, and the visual lane is routed. (Verified as part of Step 3's gate — no standalone verifier pass
here.)

---

## Step 3 — Write, Review & Provision

Three artifacts, in this order. **3a runs first**, dispatched by the orchestrator, because cases are authored
against fixtures that already resolve.

| | Artifact | Owner | Lands |
|---|---|---|---|
| **3a** | Test data | **orchestrator dispatches `test-data-engineer`** (`/qa-generate-data` → `/qa-seed-data`) — never sub-delegated by the specialist | seeded env, green `td:validate` |
| **A** | Test cases (FULL only) | `test-management-specialist` | `regression/suites/<layer>/<module>/*.csv` as `Draft` |
| **B** | Testing checklist (both paths) | `test-management-specialist`, or the orchestrator inline for a single-surface tweak | `reports/tickets/{SPRINT}/<ticket-key>/testing-checklist.md` |
| **C** | Regression scope | orchestrator | the `/qa-regression` invocation Step 4 runs |

**Artifact A in three moves** — full rules in
[`skills/qa-test/authoring.md`](../skills/qa-test/authoring.md):

1. **Split the targets by EXECUTION SURFACE and name every target suite up front.** The surface decides the
   lane, the agent and the browser, so a feature spanning API/GraphQL + an Admin blade + the storefront needs
   one suite per surface (admin twin takes an `A` suffix: `CAT-`/`CATA-`). Symptom of getting this wrong:
   after `suites:sync`, a change that touched a blade shows `lanes: {browser: 0}`.
2. **Scaffold, don't hand-type.** `npm run tc:alloc` once, then `npm run tc:scaffold -- --plan … --id-block
   … --out <staged>.csv` derives ten of the fifteen columns and leaves `Preconditions`/`Steps`/`Assertions`
   for the author; `npm run suites:review -- <staged>.csv` names each unfilled one. With ≥2 target suites,
   fan authoring out **one batch per surface** (§3b in the skill — batches are file-disjoint, IDs are
   pre-allocated, the orchestrator owns the `[JOURNEY]` case and appends serially).
3. **Append as `Draft`** via `append-test-cases-to-suite.ts … --check-global-ids` (never a hand-rolled
   append). Each row stamps `Archetype:<TOKEN> · Technique:<TOKEN>` in `References` — the appender rejects a
   row without them. `Draft` is required, not a placeholder; the runner does not skip it, so Step 4 executes
   these cases and 5g promotes them.

**Artifact C — case-scoped, not suite-scoped, inside a 40-minute window.** `npm run regression:select --
--repo <repo> --changed-files <file> --target 40 --json` for the suites (it refuses to trim the P0 +
`critical-ui-scope` risk floor), then `--cases critical --also-ids <new Draft case IDs>` for the cases.
**State the predicted makespan and every suite `--target` excluded** — the cost model is documented as wrong
by ×18–×88 for runner-native suites, so the number is a hint, not a fact.

**Review & auto-fix (FULL only):** every newly authored case through `/qa-review-tests file <target-suite>
--fix`, deterministic core first, under Phase 4b's write-scope ceiling + revert-on-regression. A case that
can't pass review is flagged, not shipped.

**Gate (Artifacts reviewed + data seeded — hard STOP):** new cases pass the review dimensions (0 blocker /
0 critical); **every atomic condition + risk area maps to a case or checklist item**; required data seeded to
a green `td:validate`. **Independent verification (1 round):** a fresh `qa-lead` verifier **re-runs
`suites:review`** on the touched suite and **re-runs `td:validate`** — not the author's word — then re-reads
the Test Model and confirms each atomic condition has a covering case. REJECT on any blocker/critical or
uncovered condition → REASONS + FIX → doer (+ `test-data-engineer`) fixes → re-verify once → STOP.

---

## Step 4 — Execute

Read env URLs from `config.js` (`FRONT_URL`, `BACK_URL`). **Record the test-window start timestamp** — the
interval until agents return is the App Insights correlation window (5a).

**Move the ticket to the in-testing status (JIRA only, no confirmation).** It is the direct, reversible
consequence of invoking `/qa-test`, changes no content, and is a hard Jira precondition for closing the
ticket at 5f. Discover the transition **live** (`tracker-ops.md` §live transition discovery); match on the
transition's `to.name` (in-testing), not its own `name` (VC-internal VCST: `On QA` → `Testing`). Skip with a
one-line note when the tracker MCP isn't configured, the ticket is already in-testing, or no in-testing
transition exists; **never** route through `Cancelled`/`On hold`; a bare feature name / PR has nothing to
transition. **`tracker.kind = azure`: skip** — Azure Boards sets `System.State` directly, so 5f has no
reachability precondition.

**Execute in order — checklist first, then the scoped regression:**

1. **Checklist + ticket cases** — launch the applicable specialist agent(s) **in a single message** to run
   Artifact B's checklist and the Artifact-A cases. **FAST = one agent, checklist only** (plus the visual
   lane below). Prompt contract: [`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) §Agent dispatch.

1b. **Visual lane — when `visual_surface: true`, both paths.** In the **same single message** as (1),
   dispatch **`ui-ux-expert`** on **Chrome DevTools MCP** for the design + accessibility pass: WCAG 2.2 AA /
   `BL-A11Y-*` · design-system consistency (tokens, no literals) · the `vs. DESIGN` spec diff against
   `DESIGN_SYSTEM_PROJECT_ID`. **Dispatch the agent — do not invoke `/qa-design`**, which is
   `disable-model-invocation: true` and is in any case only a shell that delegates to this same agent; the
   brief cites the `/qa-design` skill as its methodology. Targets, brief contents, verdict vocabulary and
   the SKIPPED rule: [`skills/qa-test/visual-axis.md`](../skills/qa-test/visual-axis.md). It writes a
   per-ticket `design-report.md` (reports category 6) and its machine half into `summary.json.visual`.
2. **Change-scoped regression (Artifact C)** — as its own **`/qa-regression <ids> --cases critical
   --also-ids <new Draft case IDs>`** run (it owns suite→agent assignment, the browser pool, retries and the
   run report). Capture its **`RUN_ID`** (5e records it; the release-gate feed keys its ≥80% floor off it) **and its
   wall-clock** — the 40-minute window is a claim about time, and an unrecorded one cannot be checked.
   **Carry the run's Scope Exclusions into the Step-5 report**: a suite that contributed zero Critical cases
   and a suite that passed look identical otherwise.

**All three draw on the same max-3-concurrent-browser cap.** If the checklist agents + the visual lane +
regression lanes exceed 3, run **checklist → visual → regression** and **state the order chosen**: the ticket
verdict is the priority, the visual lane feeds it (5c), and regression feeds the release gate (5e). Never
place the visual lane on `playwright-firefox` — the pass is click- and hover-driven.

**Gate (Execution evidenced — inline):** every atomic condition carries **PASS or FAIL evidence**
(screenshots for critical flows, console/network/trace for failures); the regression track produced a
**RUN_ID + pass rate**; **when `visual_surface: true`, the visual lane reported** — each of its three axes
carries a verdict or an explicit `SKIPPED` **with a reason**. Reject any "PASS" with no artifact — "all
passed" without evidence is not a pass — and re-capture before Step 5. **A silently absent visual axis is
not a clean one**; that is the same rule, applied to the axis rather than to a case.

---

## Step 5 — Report

Seven ordered phases, plus **`5k`** — the bounded loop that repeats them, on `--iterate` only.
**5a before 5b before 5c is load-bearing:** the verdict is expressed in terms of a
finding's provenance (5a) and the reconciled AC/DoD state (5b). Full methodology:
[`skills/qa-test/close-out.md`](../skills/qa-test/close-out.md).

| | Phase | In one line | Gate |
|---|---|---|---|
| **5a** | Triage | Triage the Artifact-C run via **`/qa-triage-results <RUN_ID> --fix`** (never from scratch), correlate App Insights for the window, validate evidence quality, then classify → provenance → severity → dedup every remaining finding | — |
| **5b** | Reconcile AC & DoD **live** | Close `1d`'s static hypothesis against what the agents observed; resolve every DoD item; compute both percentages **from the actual counts** | **hard STOP** + verifier |
| **5c** | Verdict | PASS / PASS WITH NOTES / FAIL / BLOCKED, derived from 5a + 5b — **no new judgment** | — |
| **5d** | File bugs | **Ask first.** **Severity floor: `Critical`/`High`/`Medium` only** — a `Low` keeps its `reports/bugs/open/` draft, is named in the 5e comment and `summary.json.bugs_not_filed`, and gets no tracker item, in either shape. Relationship by provenance: IN-SCOPE → Sub-task · PRE-EXISTING → link only · OUT-OF-SCOPE → standalone + related | inline |
| **5e** | Report | Feed + independently ratify the Feature Release Gate · post the tracker comment (**incl. the mandatory `Not filed (below severity floor)` line, `None` when empty**) · persist `summary.json` + update the checklist in place with verdicts · output the one chat report | verifier |
| **5f** | Change status | **After** the report. PASS → TESTED · FAIL → REOPEN with failures + bug links. **TESTED is the terminal state this command may reach — never Done or Cancelled** | — |
| **5h** | Publish documentation | **After** TESTED, **both paths**. Write the §3/§4/§5 guides for the surface the ticket moved into `reports/ba/`, then post them as **ONE tracker comment with a section per audience** — audiences from the §9.1 layer row, size caps and the three refusals (`layer-unresolved` · `not-deployed` · `not-user-visible`) in [`knowledge/ba/virto-doc-style.md`](../knowledge/ba/virto-doc-style.md) §10. Not a release note: no version literals, and the audience is a floor rather than the only one. **A non-`PASS` verdict scopes this step rather than refusing it** — document the passing paths, omit the failing ones, carry the `Not documented` line and the verbatim verdict; the step already runs only after a human transitioned the ticket to TESTED. Ask before posting; refuse rather than pad | inline |
| **5k** | Iterate (`--iterate` only) | The bounded test → fix → re-test loop. **Per round:** 5a–5d + a short round-delta comment + `summary.json` + an appended checklist section. **At loop exit, once:** 5e in full → 5f → 5h → 5g. So a `--iterate` run posts **one** QA-Complete comment and makes **one** transition, whatever the round count. Which durable step runs per round vs at exit, and why each: [`skills/qa-test/modes.md`](../skills/qa-test/modes.md) §5k | round cap · deploy confirm · G0 BAIL → STOP |
| **5g** | Promote (FULL only) | Harvest `{OBSERVED}` via `--verify --fix`, re-derive G10, then flip `Draft → Automated` via **`npm run tc:promote`** — never by hand-editing the cell. Runs **last and non-blocking**: the close-out is already delivered | **hard STOP** + verifier |

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
- **What persists:** `summary.json` + `testing-checklist.md` + evidence screenshots under
  `reports/tickets/{SPRINT}/<ticket-key>/`; the FULL-path Test Model to `reports/ba/test-models/`; new test
  cases to `regression/suites/`. `ac-analysis.md` and `test-execution-report.md` are **never written** — the
  AC table lives in working context and every finding is delivered once, in the Step-5 chat report. Full
  table: [`skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) §What persists.
- **Severity floor on filing (5d): `Critical`/`High`/`Medium` only.** A `Low` is dropped from the tracker,
  never from the run, and never re-graded to move it across the line. It is also outside `--iterate`:
  `/qa-fix` needs a filed ticket, so 5k only fixes what 5d filed — in **every** round, not just the
  first ([`skills/qa-test/modes.md`](../skills/qa-test/modes.md) §5k).
- App Insights correlation (5a) reuses `/qa-monitoring`'s query + dedup + triage machinery scoped to the
  window (no separate live-repro); resolve resources from `APPINSIGHTS_*`, skip gracefully when
  unconfigured; a correlated error gets no separate `BUG-AI-*` draft (5d's `/qa-bug` owns it).
