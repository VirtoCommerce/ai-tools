# Steps 1a–1b — fetch, classify, route, and the two pre-flight waves

Split out of [`../../commands/qa-test.md`](../../commands/qa-test.md), which keeps the ordered list and the
gate and cites this file for the detail. Read it when you are running `1a`/`1b`, or changing what the
pipeline establishes before it dispatches anything.

**Everything downstream depends on this step and nothing here is optional.** `1a` decides which pipeline
runs at all; `1b` establishes what build it runs against and derives the five axes. A wrong answer here is
not corrected later — it is inherited by every step that follows.

The **derivation contract for the five axes** (2b–2f) is [`axes.md`](axes.md); this file covers the fetch,
the classification, the routing branch, the **opening status hop** that closes `1a`, and the wave
structure.

**`1a` ends with the OPENING STATUS HOP** — on the `feature-test` branch only, after routing, `qa-lead`
moves the ticket to its in-testing status with no confirmation. Rules, skips and the record:
[`.claude/knowledge/execution/ticket-status-transitions.md`](../../knowledge/execution/ticket-status-transitions.md).
It is here rather than at Step 4 because *in testing* means **QA owns this ticket**, which is true when the
run is accepted — at Step 4 the board read the ticket as unclaimed through `1a`-`3`, i.e. through the
context gathering, the Test Model, authoring and seeding that are 30+ minutes of real QA work on FULL.

---

## 1a — Fetch the scope, classify type × status, route

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
   `feature-test`. Record **flow + type + path** — all three are `summary.json` fields, persisted at 5e.3; the path gates
   Steps 1c/1d, 3 and 5. Fail-safe defaults (§6): unresolvable → `feature-test` FULL; when in doubt → FULL.

Then branch on the resolved FLOW:

- **`feature-test`** (Story / Task / Technical task / Review task / Epic, and a `not-fixed` Bug) → continue to `1b` and
  run the five-step pipeline at the resolved FAST/FULL effort. (A `not-fixed` Bug runs FAST to
  reproduce/characterize the defect live and attach fresh evidence — there is no fix to *verify* yet;
  state the next step is `/qa-fix <ticket-key>`.) This is the rest of this document.
- **`verify-fix`** (a `fix-ready` Bug) → **run `/qa-verify-fix` inline (see below)**; do not run Steps 2–5.
- **`hotfix-verify`** (a `hotfix-ready` Bug) → **STOP** with a one-line pointer: `Run /qa-hotfix-check
  <ticket-key>` (hotfix delivery/verification is that command's job). File nothing; transition nothing.
- **`Sub-task`** → resolve the parent work item and re-enter this classification as the **parent's**
  type × status; route on that.

### Flow = `verify-fix` — run `/qa-verify-fix` inline

`/qa-test` **runs the `/qa-verify-fix` pipeline inline** in this same session — **execute its Steps 0–7 as
written** ([`qa-verify-fix.md`](../../commands/qa-verify-fix.md)); do not duplicate or paraphrase them here. The
feature-test authoring / AC-reconcile / promotion machinery is **not** run: a fix-ready Bug needs its fix
verified, not new cases authored. The run ends at the verify-fix verdict.

**Fail-safe (per `ticket-routing.md` §6):** if a `fix-ready` Bug has no STR **and** no linked fix PR,
`verify-fix` has nothing to prove RED→GREEN against → fall back to the `feature-test` FAST path and note
the missing repro basis, rather than forcing an empty verification.

## 1b — Pre-flight, sprint resolution & duplicate check

Per `.claude/templates/agent-dispatch.md`.

**Run this as TWO I/O waves, not nine sequential steps.** Items 1, 2, 2-release, 3→4 and 2b's local reads
consume only `1a`'s fetch, so they are independent: **issue them in ONE message** (wave A). Then derive
`2b`, `2c`, `2e`, `2f` from what came back — pure computation, no tool call. Then **one message** for wave
B: `2d`'s two refreshers **and `2e`'s `tc:scope` scan **and `2f`'s `td:validate` resolution check**, the
items gated on a derived token. `2d` is the
one that costs real time (~8.6 s); `tc:scope` is ~1 s, and holding it until Step 2a buys a round-trip and
nothing else.

**The wave-B scan carries SCOPE and RISK TERMS only — never `--cases`/`--also-ids`.** Those model what
will execute, and at wave B neither input exists: Artifact A is authored at Step 3, and the `RE-BASE` ids
are the *output* of the disposition this very scan feeds. Passing them here would mark every future Draft
row `FILTERED_OUT` — the exact failure the step exists to prevent. The run-fate prediction is made once the
inputs exist, at the **Step-3 gate re-run**. Items 3 → 4 stay ordered as written; both are millisecond globs, so splitting them buys
nothing. Measured rationale and the list of things that must **not** be parallelised — the serial suite
append, one `suites:sync`, no verifier beside its own doer, no two suites on one disposable fixture set:
[`skills/qa-test/SKILL.md`](SKILL.md) §Concurrency.

1. **Environment health** — `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version** — GitHub MCP `get_file_contents` on `backend/packages.json` + `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`, or the branch matching `TEST_ENV`). Record platform + theme + ticket-relevant module versions — this is the **`declared`** (git) state. Then probe `GET {{BACK_URL}}/api/platform/modules` for the **`deployed`** state, which is the ground truth and routinely differs (deploy in flight, failed, or partially applied). A failed probe records `deployed: UNKNOWN` — **never** fall back to `declared`. **PR testing:** confirm the PR's artifact version appears in `packages.json`/`artifact.json`; if not deployed → offer `/qa-deploy-pr <ticket-key>` (**ask first**) or warn and ask whether to wait.
2-release. **Recent-release check** — read `.claude/knowledge/domain/release-ledger.md` §1 + the newest §2 month(s) for the ticket's component(s), and record the Δ vs `deployed` in `summary.json` as `releasedThrough`. Full precedence rule: `agent-dispatch.md § Build Verification`. Three consequences, and they are the reason this step exists rather than being a header field:
   - **A ⚠ BREAKING change in the component under test forces FULL**, whatever `1a` scored. `ticket-routing.md` says *when in doubt → FULL*; a contract that moved last month is doubt with a date on it, and a FAST run would author no cases and write no Test Model against it.
   - **It feeds `1d`'s AC↔implementation check a third leg.** That check is otherwise static — ACs vs *this* PR's diff — and a breaking change elsewhere in the same component is invisible to that diff while being the likeliest cause of a DRIFT nobody owns.
   - **Released ≠ deployed.** A capability the ledger records that the probe does not carry is `NOT_DEPLOYED` → BLOCKED-on-deploy, never a FAIL and never a filed bug. And the ledger carries **no behaviour**, so it can never ground an assertion as `{DOC}`; that stays `{OBSERVED}`.
2b–2f. **Derive the five PRE-FLIGHT AXES — one mechanism, five instances.** Pure computation over
    what wave A returned; no operator input. Single source of truth for the contract they share and the
    ways they differ: [`skills/qa-test/axes.md`](axes.md). **Cite it; do not restate it.**

    | | Token | Derived from | Unresolved ⇒ | When true |
    |---|---|---|---|---|
    | **2b** | `layer` | the PR diff → repo identity (`REPO_PROFILES` + `resolveOwningSubApp()`) · `regression.suites[]` → `config/test-suites.json` · which of theme/module/platform `build` moved · `bugs_filed[]` → fix-PR repo · the ticket's Components → `module-suite-map.md` | **`null` + `UNRESOLVED`** — fails **CLOSED**; **never default to `storefront`** | 5f/5h audience routing |
    | **2c** | `visual_surface` | `.vue`/`.scss`/`.css`/`.html`/blade/icons/tokens in the diff · derived layer `storefront`/`admin-spa` · a target suite `layer: frontend` | `true` | Step 4 dispatches `ui-ux-expert` ([`visual-axis.md`](visual-axis.md)) |
    | **2d** | `contract_surface` | `.graphql`/`*ExperienceApi*`/`*.Web/Controllers`/GraphType files · derived layer `api` · suite tags `graphql`/`xapi` · an AC naming a query/mutation/field | `true` | **both** refreshers, concurrently, in ONE message ([`contract-refresh.md`](contract-refresh.md)) |
    | **2e** | `coverage_surface` | the ticket's `1a` domains + derived layer + the target suites' manifest `domain`/`tags`/`requiresModules` — **never diff paths** (a path token may only ADD a suite) · the observables the change moves · the `BL-*`/`ECL-*` it amends | `true` | `tc:scope` in wave B, **scope + risk terms only** ([`coverage-triage.md`](coverage-triage.md)) |
    | **2f** | `data_surface` | the `1e-plan` rows' (FAST: the Artifact-B conditions') own `@td()`/`{{VAR}}` refs → `npm run td:validate` in wave B · the Part-0 value chain: does any link under test need a **divergence** the existing fixtures lack · the ticket/diff: a new entity type, store/org/role, pricing or inventory shape | `true` | Step **3a** dispatches `test-data-engineer`. **`false` ⇒ no dispatch**, and the run names the fixtures covering the plan ([`authoring.md`](authoring.md) §3a) |

    **The union of 2b's sources 1 and 2 decides `layer`**; more than one member ⇒ `cross-layer`, with the
    members in `release.layers[]` and sources 3–5 used only when 1 and 2 both yield nothing. Sources 1 and
    2 disagreeing while `1a` routed the ticket single-layer FAST ⇒ `layers_conflict: true`, surfaced in the
    fragment's own footer — a contradiction between the routing decision and the layer is for a human.

    **Three rules, from `axes.md` §2 — they apply to all five and are not repeated per axis:** each token
    is **derived, never asked, never defaulted**; each records `<axis>.surface_source[]` **always**, where
    `null` means the source was not consulted (a gap, not a zero); and a **`false` is recorded with its
    sources**, because an omitted block reads as a clean axis. **None of them changes the effort** — an
    axis is a LANE trigger, never an EFFORT trigger, and never promotes FAST → FULL.

    **Effort (`axes.md` §4): FULL derives and runs all five. FAST derives and applies `layer` and
    `data_surface`** — the first because 5f/5h need it and it dispatches nothing, the second because it can
    only ever *remove* a dispatch, so gating it behind a flag would restore the cost it exists to end. The
    other **three** — `2c`/`2d`/`2e` — are **opt-in** there via `--visual` / `--contract` / `--coverage` /
    `--axes`, default off. Each of those has run at most **once in 28 recorded runs**, so mandatory-on-FAST
    was a prediction rather than a measurement; revisit per axis at 5+ runs.

    **2d is the only axis that issues I/O in `1b`, and it must run BEFORE `1c` dispatches** — `1c`, `1d`,
    `1e` and the Step-3b authoring pack all read `graphql-schema.md`, so a refresh after them changes
    nothing. Their briefs then carry the snapshot's **rev**, never just its path. A failed refresh records
    `UNKNOWN` and **never** falls back to the committed snapshot.

    ```bash
    npm run schema:refresh                      # → knowledge/api/graphql-schema.md — ~8.5s
    npm run graphql:fixtures:validate:refresh   # → the runner cache + the fixture gate — ~1.8s
    ```

3. **Resolve current sprint** — use `reports/tickets/Sprint-current` if present, else the latest `SprintXX-XX` folder; create if missing. This is `{SPRINT}` for output paths (`reports/tickets/{SPRINT}/`). Resolve **before** the duplicate check.
4. **Duplicate check — across ALL sprints.** Glob `reports/tickets/*/*/summary.json` (per `feedback_duplicate_check_across_all_sprints`) for the same ticket with a `date` in the last 2 hours. If found, warn user and show the previous verdict.
