# `vc-test` — one testing flow for any Virto Commerce project

> **Status: for review.** Brainstormed with the owner on 2026-10-15; every decision in §2 is the owner's.
> Builds on the `/qa-test` redesign ([spec](2026-10-09-qa-test-strategy-redesign.md), D1–D12) and on
> `/ticket-context` ([spec](2026-10-08-ticket-context-design.md)). Supersedes the 2026-10-15 plan that turned
> `/qa-test-fast` into the prototype; that plan was withdrawn before execution. Designed in VCST-6249;
> implementation tracked in VCST-6385.
>
> **Updated 2026-10-21 for VCST-6402** (`vc-init` + `vc-secrets`, merged after this design): onboarding and the
> profile moved from `vc-fix` to `vc-init`, and no token sits in a file any more — a process receives one only
> through the `$VC_RUN` bridge. U2 and §4, §6, §6a, §7, §8, §9, §10 and §12 follow; U19–U23 are the adaptation,
> confirmed by the owner on 2026-10-21 (U23 settles the one question it opened, §13).

## 1. Problem and goal

Testing a ticket today takes `/qa-test` FAST, `/qa-test` FULL or `/qa-test-fast`, chosen by ticket type rather
than risk, and none of them reaches a client: the whole QA toolset lives in this repository's `.claude/`. The two
pieces the redesign is built on — `/ticket-context` (one gated context bundle) and `/qa-test-strategy` (an
approved, floor-checked test strategy) — exist and are validated, but nothing composes them into a run.

**Goal.** One command that tests a ticket end to end by **calling the existing skills in order** —
`/ticket-context` → `/qa-test-strategy` → only the artifacts the approved strategy selected → triage → verdict —
distributed as a plugin so it works on **any Virto Commerce project**: the platform project here and a client's
project with its own modules, theme, tracker, repositories and stand. Scalable (a new artifact is a registry
entry, not an orchestrator rewrite), secure, fast and token-efficient. FAST, FULL and `/qa-test-fast` are
removed once the new command has passed validation (§10 P4).

**Non-goals.**
- Not a rewrite of the skills it calls. Changes to them are the minimum the composition needs (§10).
- Not a change to `/qa-verify-fix`, `/qa-hotfix-check` or `/qa-fix` — separate jobs (redesign §2).
- **No regression in this project** (U7): no regression lane over the existing corpus, no coverage triage, no repair of stale cases. Writing and running the ticket's new cases is in (U18).
  Client suites may look nothing like ours; regression is the next large step.
- No client-side domain-map or mind-map builders (U6) — the next step into the knowledge store this design
  creates.

## 2. Decisions (owner, 2026-10-15)

| # | Question | Decision |
|---|---|---|
| U1 | Where does the single flow live? | A **new command**; FAST, FULL and `/qa-test-fast` are removed after validation — "we are moving away from FAST/FULL" |
| U2 | How does it reach clients? | A **new plugin `vc-test`** (working name) that depends on `vc-init` and `vc-fix`, like `vc-perf` does (U19). Canonical copies live in the plugin; this repository uses the plugin, with no duplicate under `.claude/` |
| U3 | What is in v1? | **Core + adapters.** Core: context, strategy, test model, checklist, exploratory, visual lane, triage, investigate, `qa-bug`, verdict. Adapters run when the project has what they need and otherwise record a `SKIP` with the reason |
| U4 | Trackers and code hosts | A **connector interface** with **four connectors in v1 (P1)**: Jira, GitHub, Azure Boards, Azure Repos. Azure is validated on a real client Azure DevOps project, not a sandbox (owner, 2026-10-15, revising the first answer "Jira + GitHub first") |
| U5 | "Any project" means | **Any Virto Commerce project**. Platform facts may be relied on: `/api/platform/modules`, the `vc-frontend` layout for the ui-kit, xAPI, VirtoOZ, the public kb |
| U6 | Knowledge | **Two stores, one interface** (§6). A client run reads its project store first, then the platform store, and writes **only** to its project store. Domain/mind-map builders for clients come next |
| U7 | Regression | **Out of this project.** F5 still fires, but records the cases at risk and the follow-up instead of requiring a run (§5.3). Repairing stale cases goes with it; new cases do not (U18) |
| U8 | Orchestrator shape | **Registry + planner**: `artifacts.json` declares the artifacts, `plan-run.mjs` computes the waves, the command executes the plan |
| U9 | Removal timing and validation stages | Build → **stage 1**: validate on 3–5 native-platform tickets → remove FAST/FULL/`/qa-test-fast` → **stage 2**: validate on the real client project → release to clients |
| U11 | Where the run asks a human | **Two points only.** *Before execution*: approve the strategy (and, on the same build, re-run or reuse). *After the verdict*: `qa-bug` runs for each confirmed bug and asks its own "create a tracker ticket?" question (`qa-bug` is used as it is), then the run asks once whether to post the tracker comment. Nothing asks between the two points; `--yes` answers only the first |
| U12 | How much of the bundle the strategy reads | **The whole bundle**, so nothing is missed; the token cost is accepted |
| U13 | Who writes the checklist | **The orchestrator, inline** — it already holds the bundle and the strategy, and a subagent would need them retold |
| U14 | `qa-triage-results` cannot be called by the Skill tool (`disable-model-invocation: true`) | **Remove the flag** in the plugin's canonical copy |
| U15 | Round N ≥ 2 | **A delta strategy that proves the fixes**: the diff from the last tested commit; every bug from round N−1 is a risk with its original reproduction as a checklist item, decided `FIXED` / `NOT FIXED`, plus a risk for what sits next to the fix; every unresulted risk carries over; the verdict lists each prior bug's result |
| U16 | May the run create or change data on the stand? | **Yes, only on a non-production stand** the profile declares as such and the probe matches; otherwise the run is read-only and every item that needs a write is BLOCKED with that reason. Everything created is deleted by ledger id |
| U17 | Test-data building in v1 | **The whole family moves into the plugin in v1, refactored** (owner, revising "seeders as an adapter"): `qa-test-data-model`, `qa-generate-data`, `qa-seed-data` (skill + command), the `test-data-engineer` agent and the seeding engine become the plugin's canonical copies and work on a client's project too. This repository's domain seeders and fixtures stay here as the platform project's **content**, as a client's live in the client's project. The refactor makes the family lighter, adapted to any project and flexible (§6a) |
| U18 | Write new test cases, and run them? | **Yes — after the verdict, then one run of the new cases only** (owner, revising redesign D2 for this flow). The single author is the **`test-management-specialist` agent** (fresh context, Sonnet; its brief is file paths — checklist with results and evidence, strategy, bug reports — so nothing is retold, and the orchestrator never writes the corpus): cases from the passing checklist items and from every bug's reproduction (`Catches:` that bug). One wave runs only the new cases. A new case that fails is a defect **of the case** — fixed or marked, never a change to the verdict, which was decided on the checklist. Cases land in the project's agent-native corpus; a client's own suites (Playwright, TestRail, …) are untouched |
| U10 | Committed tests | An exception like `plugins/vc-secrets/`: the knowledge-store write router and the write-zone check get **committed** tests; everything else follows the repository rule (temporary tests, deleted before commit) |

**Adaptation to VCST-6402 (owner, 2026-10-21).**

| # | Question | Decision |
|---|---|---|
| U19 | What does `vc-test` depend on? | **`vc-init` and `vc-fix`** (`vc-secrets` comes in through `vc-init`). `vc-init` owns `/project-init`, `project-profile.json` (schema 3) and `$VC_RUN`; `vc-fix` keeps `qa-bug`, `qa-checklist`, `qa-investigate` and the `qa-*-expert` agents. No profile ⇒ STOP "run /project-init", like `vc-fix` and `vc-perf`; the silent native-platform defaults are gone |
| U20 | How does a connector get its token? | **Only through `$VC_RUN`.** No connector reads `JIRA_API_TOKEN`, `GIT_TOKEN` or an `authEnv` variable from the environment. The bridge hands a process one group's secret, so the tracker fetch and the host fetch are **two bridge calls** (`jira` or `ado`; `gh` or `ado`), each writing its raw responses to a file the bundle step reads. A session login (`gh auth login`, `az login`, Atlassian OAuth) is used where the project declared no PAT task, as the bridge already does |
| U21 | What does `/vc-test:init` own? | **Only `vc-test`'s own settings**, written through `vc-init`'s `profile-set.mjs --merge 'test=…'`: which environments are non-production (U16) and the knowledge-store path (§6). Test accounts and their passwords are `vc-init`'s: `/project-init --add-user` / `--add-env`, the password in `vc-secrets` or `.env.local` as the operator chose there. `/vc-test:init` checks that every role the flow needs has an account and points to `--add-user` for a missing one; it never writes a password |
| U22 | A host-governed project (`governance.host` set) | The bridge refuses every token-bearing tool there, and `governance.stand.writable` is `false`. `vc-test` honours both: the stand is read-only whatever `/vc-test:init` declared, and the connectors go through the host's servers (U23) |
| U23 | How does the context step read the tracker and the code host there? | **In v1, through the host's MCP servers, by the orchestrator.** A script cannot call an MCP tool, so the orchestrator replaces the two bridge fetches of §7: it reads the issue and the PRs through the servers the profile maps (`governance.servers.tracker`, `governance.servers.codeHost`) and writes **the same raw files**, in the same schema, that the bridge route writes. The bundle step and everything after it do not know which route ran |

## 3. The shape

```
/vc-test:qa-ticket <KEY> [--yes] [--dry-run]                         (working name)
 0 PROBE     capabilities.mjs → capabilities.json            what this install can do
             route (type × status role → job) · rounds.mjs   a fourth round STOPs before any context
 1 CONTEXT   /ticket-context <KEY> → bundle.json             parallel analysts, cached 24 h
 2 STRATEGY  /qa-test-strategy (whole bundle) → test-strategy.md   floors · gate · verifier if Critical
             ── HUMAN POINT 1: approve the strategy (--yes) ──
 3 RUN       plan-run.mjs → run-plan.json → waves            only RUN rows, ≤3 browser lanes;
             the checklist is written by the orchestrator inline (U13)
 4 CLOSE     trace.mjs reconcile → /qa-triage-results → qa-investigate → verdict (decided here, final)
 5 CASES     test-management-specialist authors new cases (passing items + bug reproductions) → lint → one wave runs only them
             → Draft / Automated per case; a failing new case is a case defect (U18)
             → verdict.md + HTML (verdict + new cases)
             ── HUMAN POINT 2: qa-bug per confirmed bug (its own question) · post the comment? ──
             → knowledge write-back
```

The command holds the order of calls and pointers, never a rule of its own: every rule lives in the skill
it belongs to and is cited. Body budget: ≤ 8,000 chars (BUDGET-004 is the hard cap; this is the target).

**Routing.** Spec §5 of the redesign, unchanged: a fix-ready Bug ⇒ `/qa-verify-fix`, a hotfix-ready Bug ⇒
`/qa-hotfix-check`, a Sub-task re-enters with its parent, everything else is a test job (a not-fixed Bug's
mission is "reproduce and characterize", next `/qa-fix`). A role the table cannot decide is `unresolved` ⇒ STOP
and ask, never a guess.

**Rounds.** At most three per ticket (D6). Counted before any context from local evidence — every committed
version of the ticket's `summary.json` (distinct builds; validation finding V9: a round overwrites the file, git
history keeps it) and the reconciled round sections of `test-strategy.md` — and recounted from the bundle's
verdict comments once it exists.

**Round N ≥ 2 is a delta that proves the fixes (U15).** The strategy reads round N−1's section: the diff is taken
from the last tested commit; each bug round N−1 found becomes a risk "fixed, and nothing next to it broke" whose
checklist item is the bug's original reproduction, decided `FIXED` or `NOT FIXED`; a second risk covers the code
next to the fix; every unresulted risk carries over. The floors still read the whole PR diff, so they err upward.
`verdict.md` lists every prior bug with its result, and a `NOT FIXED` one is a FAIL of the round.

## 4. Components

| Unit | Does | Depends on |
|---|---|---|
| `commands/qa-ticket.md` | runs steps 0–4 in order, executes `run-plan.json` | everything below, by path |
| `skills/ticket-context/` | **moved** from `.claude/skills/`; connectors extracted (§7) | connectors, `knowledge-store.mjs` (read) |
| `skills/qa-test-strategy/` | **moved**; floors read `capabilities.json` (§5.2); Artifacts rows come from the registry | `artifacts.json`, `capabilities.json` |
| `skills/qa-test-model/`, `qa-exploratory/`, `qa-triage-results/` (ticket mode), `qa-design/` | **moved** canonical copies; `qa-triage-results` loses `disable-model-invocation` (U14) | `vc-fix` agents and skills |
| `vc-fix`: `qa-checklist`, `qa-investigate`, `qa-bug`, `qa-risk`, `qa-evidence`, agents `qa-*-expert` | **reused**; `qa-bug` unchanged. One `vc-fix` version bump for two changes: `qa-checklist` Mode 5 names the risk id in Ref and gains `--from-strategy`; the tracker CLIs the bridge runs (`qa-fix-routing/jira.mjs`, `ado.mjs`) gain the connectors' read commands (§7) | — |
| `vc-init`: `/project-init` (`--add-user`, `--add-env`), `project-profile.json`, `profile-set.mjs`, the `$VC_RUN` bridge, the Playwright lanes `node "$VC_RUN" playwright <lane>` | **reused** (U19–U21). `vc-test` carries a read-only profile loader copy that STOPs on a missing profile or an unknown `schemaVersion`. One change, one `vc-init` version bump: `test` added to `profile-set.mjs` `MERGEABLE` and to the reconcile schema | — |
| `commands/vc-test-init.md` → `/vc-test:init` | writes the `test` block through `profile-set.mjs`; checks accounts per role (U21) | `vc-init` |
| `skills/qa-test-data-model/`, `qa-generate-data/`, `qa-seed-data/` + command, agent `test-data-engineer`, `lib/seed/` engine | **moved and refactored** (§6a, U17); domain seeders stay project content | profile, `capabilities.json`, the project store |
| `skills/qa-test-cases-generator/`, agents `test-management-specialist` and `test-runner-agent`, the suite lint and promote scripts | **moved** (U18): the specialist authors in the agent-native case format, a runner for the new-case wave, `Draft → Automated` promotion. Not the regression orchestration — that stays out (U7) | the project's corpus path from the profile |
| `lib/artifacts.json` | the only list of artifacts (§5.1) | — |
| `lib/capabilities.mjs` | probes the install, writes `capabilities.json` | profile, env, MCP list, project files |
| `lib/plan-run.mjs` | approved strategy + registry + capabilities → `run-plan.json` | the three above |
| `lib/route.mjs` · `lib/rounds.mjs` · `lib/trace.mjs` | routing · round count · checklist↔risk trace and reconciliation | the strategy reader |
| `lib/knowledge-store.mjs` | the one reader/writer of project and platform knowledge (§6) | profile |
| `lib/write-zones.mjs` | at close, checks every changed file against the zones the registry allows | `artifacts.json`, git |

The skills that move are deleted from `.claude/` in the same phase (U2); this repository's consumers are
repointed to the plugin, and FULL/FAST — the remaining consumers of the moved execution skills — are removed in
P4. Paths inside the plugin resolve through `import.meta.url` / `pluginRoot()`; output paths through
`outputRoot()` (`plugins/CLAUDE.md`).

### 4.1 Data flow

Every hand-off is a file, never a summary in a brief.

```
capabilities.json ─┐
bundle.json ───────┼─► test-strategy.md (approved) ─► plan-run.mjs ─► run-plan.json
artifacts.json ────┘                                                   │
                          wave 1  test-data ‖ test-model ‖ mind-map* ‖ contract-refresh*
                          wave 2  exploratory           (when the strategy says FIRST)
                          wave 3  checklist ── trace.mjs check
                          wave 4  checklist-runners ‖ exploratory (ALONGSIDE) ‖ visual   (≤3 browser lanes)
                                                                       │
        testing-checklist.md + extras.json ─► trace.mjs reconcile ─► triage ─► verdict
```
`*` adapter. Reports land where they do today, `reports/tickets/{SPRINT}/<KEY>/` relative to `outputRoot()`:
`test-strategy.md`, `testing-checklist.md`, `summary.json`, `verdict.md`. `bundle.json`, `capabilities.json`
and `run-plan.json` are working state under `.vc-fix/`, never reports.

## 5. Registry, capabilities, floors

### 5.1 `artifacts.json`

One entry per artifact. The strategy's Artifacts table, its gate and the planner all read it; none keeps its own
list.

```json
{ "id": "exploratory",
  "row": "Exploratory",
  "run": { "skill": "qa-exploratory", "agent": "qa-testing-expert", "model": "sonnet" },
  "needs": ["test-model"],
  "lane": "browser:playwright-firefox",
  "requires": ["browser"],
  "writes": ["reports/exploratory/SBTM-*", "reports/tickets/*/<KEY>/screenshots/**"],
  "order": "strategy" }
```

v1 entries: `test-data`, `test-model`, `mind-map`\*, `contract-refresh`\*, `checklist`, `exploratory`, `checklist-runners`
(storefront + admin/API lanes), `visual`, `verifier`, `case-authoring`, `new-case-run`. Adding an artifact = an entry + its skill; the command does
not change. `model` is per entry (§8).

### 5.2 Capabilities and the rule "unavailable is not doubt"

`capabilities.mjs` answers, once per run, what this install can do: tracker and code-host connectors and their
credentials, `BACK_URL`/`FRONT_URL` reachability, browsers, Chrome DevTools MCP, the kb and VirtoOZ MCP servers,
the project knowledge store and its domain maps / mind maps, and the project's own scripts (`schema:refresh` for
contract refresh).

**Rule.** A floor whose signal *could not be read* fires on doubt (F9, as today). A floor that requires an
artifact the install *cannot run* does not turn that into doubt: the strategy records `SKIP — not available in
this install: <capability>`, the verdict lists it under "not tested, and why", and the residual risk is written
in Out of scope. A `RUN` row whose capability is missing is a planning error `plan-run.mjs` refuses. Nothing is
silently dropped, and a client without our corpus is not handed a floor nothing can execute.

### 5.3 Floor changes

| Floor | Change |
|---|---|
| F2 | reads the domain map from the **project** knowledge store (§6), not from a repository path |
| F5 | **U7:** fires as today when the bundle lists cases at risk, and requires the strategy to list them in Out of scope with their residual risk and the follow-up (`/qa-regression <suites>` where a corpus exists) — not a run. A project with no regression corpus (no `regression:select`) has the capability missing, so F5 records `SKIP — not available in this install` instead of firing on doubt (§5.2) |
| F6 | deployment from `/api/platform/modules` on `BACK_URL` (any VC project) plus the theme version the storefront reports; the repository's `deploy:pr` stays an adapter that adds PR-artifact resolution where present |
| F8 | the ui-kit is recognised by `vc-frontend` layout (U5); a client theme fork keeps that layout |

## 6. Knowledge: two stores, one interface

| Store | Holds | Read by | Written by |
|---|---|---|---|
| **platform** | how Virto Commerce behaves: the public kb (`VirtoCommerce/vc-knowledge`), VirtoOZ | every project | the **platform project only** |
| **project** | how this project's product behaves | this project | this project |

**Read order:** project first, then platform. When they disagree, the project store wins *for that project* — a
client customisation is not a platform error, so it never becomes a dispute against the platform entry.

**What the project store holds** (the formats used here today):

| Kind | Format | Written by |
|---|---|---|
| business rules | `rules/<slug>.yaml` (the `bl/` shape) | the run proposes (SUSPECT / candidate); a human confirms |
| domain map | `domain/<slug>.md` | a domain-map builder (next phase) |
| mind map | `domain/<slug>.mind-map.json` | a mind-map builder (next phase) |
| test documentation | strategies, test models, checklists, verdicts, the new cases (agent-native corpus), stale case lists | the flow |
| test-data registry | `test-data/aliases.json` — the entities cases assert against by name (§6a) | `/vc-test:init` and the run, by proposal |
| observed behaviour | kb entries: question, claim, trust, provenance | the flow's close: capture / confirm / dispute |

**v1 backend:** a folder in the client's repository, default `qa-knowledge/`, path in the profile's `test` block
(`test.knowledgeStore`, written by `/vc-test:init` through `profile-set.mjs`, U21); git gives history, review and access control. Other backends (a private kb repository,
Confluence) plug into the same interface later. This repository is one configuration of it: project =
`.claude/knowledge/`, platform writes enabled.

**Every write goes through `knowledge-store.mjs`**, which:
- refuses a platform write when `projectType` is `client`, whatever the caller asks;
- scrubs the text with the existing secret scrubber before writing;
- writes only inside the configured store path.

Its tests are committed (U10). v1 fills test documentation, observed behaviour and business-rule proposals —
the things the flow already produces. Domain maps and mind maps are read when present.

## 6a. Test data

The strategy already says what data each risk needs (its Data section: source per risk, the values that must
differ, what is created in the case) and every checklist item carries a Data cell. What the plugin adds is where
that data comes from on any VC project, and the guard that keeps the run off production.

| Layer | Resolved by | Portable? |
|---|---|---|
| `{{VAR}}` — URLs, accounts, store/culture/currency | the layered env; accounts per role (buyer, org admin, sales rep, back-office admin) registered by `/project-init --add-user`, each password in `vc-secrets` or `.env.local` as the operator chose (U21); a browser lane gets them as `config.secrets` through `$VC_RUN`, and an agent types the bare key name | yes |
| `@td(ALIAS.field)` — entities asserted by name | the alias registry in the project store (`test-data/aliases.json`); this repository's `test-data/` is its platform configuration | yes, per project |
| `live-discover` — any entity matching a shape | xAPI / REST queries, identical on every VC platform; the plugin carries its own copy of the discovery library | yes |
| `create-on-fly` — unique `AGENT-TEST-` values created right before use | the platform's GraphQL / REST operations, the random-data library copied into the plugin | yes |
| seeders, fixtures, the data model | the plugin's seeding engine + `/qa-test-data-model`, `/qa-generate-data`, `/qa-seed-data`, `test-data-engineer`; the domain seeders and fixtures are the project's content | yes, after the refactor below (U17) |

**The `test-data` artifact** (registry, wave 1) reads the strategy's Data section and, before any lane opens:
checks every named alias is live, runs only the seeders a Data cell names, and confirms each browser
lane has its own account (one session per agent). A gap is `FIXTURE-GAP` on the items that need it — BLOCKED,
never FAIL.

**Writes to the stand (U16).** `capabilities.json` carries `stand.writable`: true only when the profile's `test`
block declares the environment non-production (`/vc-test:init` asks once; undeclared means read-only), `BACK_URL`
is that declared environment's URL, and `governance.stand.writable` is not `false` (a host-governed project is
read-only, U22). There is no reliable runtime signal of "production", so the declaration is the
authority and the probe only checks the run is pointed at the stand that was declared. Read-only ⇒ `create-on-fly`,
`flip+restore` and seeders are BLOCKED with "stand not declared writable".

**Teardown** is by ledger id only, oldest dependency last, after the bugs are filed — never a prefix sweep,
because persistent fixtures share the prefix. An entity that could not be deleted is named in `verdict.md`.

**The refactor of the family (U17)** — today it is shaped by this repository: `qa-seed-data` alone is ~93,000
chars across four files, and the skills cite this repository's paths, domains and fixtures throughout.

| Aim | What it means |
|---|---|
| **Lighter** | each `SKILL.md` keeps only the steps every run needs, under BUDGET-004; recipes per domain, recovery paths and examples move to supporting files read on demand; nothing restates `rules/test-data.md` |
| **Adapted** | paths through `pluginRoot()` / `outputRoot()`; environment, accounts and the stand's writability from the profile and `capabilities.json` (U16); the alias registry and data models in the project store (§6); no VC-catalog names in the method |
| **Flexible** | the engine runs declarative specs: a project's data model names the states it needs, a project seeder is a spec module plugged into the engine, and the engine supplies the generic platform operations (create organization, user, product, price, inventory, order …) through xAPI / REST. A client adds a domain by writing a spec, not by forking the engine |

This repository's seeders become the first project content on the new engine and are the regression check:
`td:validate` and `td:reconcile` stay green on the platform project before and after.

**Passwords for the engine.** Today's seeders read test-user passwords from the env files and do not go through
the bridge, so a role whose password the operator kept in `vc-secrets` is invisible to them. The engine either
runs as a declared `vc-secrets` task (as `vc-init-onboard.<env>` does for onboarding) or logs in only as roles
kept in `.env.local`; P2b picks one, and a role it cannot log in as is `FIXTURE-GAP`, never a prompt for the
password.

The rules themselves — never hardcode, a fixture is designed from the chain's question, evidence output is not a
case's business, create in the case what the environment can take away — travel with the plugin as its own copy
of `.claude/rules/test-data.md`, as `vc-fix` carries its rules (`plugins/CLAUDE.md`).

## 7. Connectors

`/ticket-context` reads Jira and GitHub today, inline in its `lib/`; Azure Boards is a stub
(`connector-unavailable`) and Azure Repos is not read at all. Both are extracted behind two interfaces, selected
by `project-profile.json` (`tracker.kind`, `vcs.clientHost`):

| Interface | Operations | Jira / GitHub | Azure Boards / Azure Repos |
|---|---|---|---|
| `tracker` | fetch issue, fields (incl. the AC field), comments, attachments, links, parent/epic, status → role; post or amend one comment | today's `jira.mjs` | work-item REST: fields mapped through `tracker.fieldMap`, states → roles through `tracker.azure.roleStates` (already scanned by `/project-init`), attachments and relations from the work item's `relations[]` |
| `host` | find a ticket's PRs; read metadata, files, diff, review threads, merge state | today's `github.mjs` (key search across the profile's orgs) | the work item's native **ArtifactLink** relations to pull requests — a stronger link than a key search — then the Git PR REST endpoints for iterations, changes, diff and threads |

**Credentials go through `$VC_RUN` (U20).** Today `/ticket-context` reads `JIRA_EMAIL`/`JIRA_API_TOKEN` and the
profile's `authEnv` straight from the environment (`lib/profile.mjs`); after VCST-6402 no install keeps a token
there, so the extraction is also the move behind the bridge. Each interface runs as its own bridge call — the
bridge gives a process one group's secret — and the fetch is split from the analysis:

| Step | Runs as | Writes |
|---|---|---|
| tracker fetch | `node "$VC_RUN" jira …` or `node "$VC_RUN" ado …` (group `jira` / `ado`) | raw issue / work-item responses and attachments under `.vc-fix/` |
| host fetch | `node "$VC_RUN" gh …` (read-only `gh api` and `gh pr view`, already allowed) or `node "$VC_RUN" ado …` for Azure Repos | raw PR metadata, files, diffs, threads under `.vc-fix/` |
| bundle | plain `node`, no token | `bundle.json` from the two raw sets |

The bridge runs `vc-fix`'s `qa-fix-routing/jira.mjs` and `ado.mjs` and admits any of their command names (the
host stays pinned to the profile), so the read operations the connectors need — issue with fields, comments,
attachments and links; work item with `relations[]` (`ado get-workitem` exists); Azure Repos PR iterations,
changes and threads — are new commands in those two CLIs (the `vc-fix` bump, §4), with no allowlist change. Writes stay where they are: the one tracker comment goes
through the existing `jira edit-comment` / `ado comment`. v1 keeps today's Jira/GitHub behaviour byte-for-byte
on the platform project (`/ticket-context`'s own gate and the VCST-5097 bundle are the regression check). The
Azure connectors are checked against recorded responses in P1 and live on the client project in P5; the bundle
schema does not change — a connector fills the same fields.

**A host-governed project (U22, U23)** has no bridge route: the bridge refuses every token-bearing tool there.
The orchestrator does the two fetches instead, through the host's MCP servers the profile maps:

| Step | Runs as | Writes |
|---|---|---|
| tracker fetch | the orchestrator, read tools of `governance.servers.tracker` | the same raw files as the bridge route |
| host fetch | the orchestrator, read tools of `governance.servers.codeHost` | the same raw files as the bridge route |
| bundle | plain `node`, unchanged | `bundle.json` |

- **One raw schema for both routes.** The raw files carry the fields the bundle step reads; the orchestrator fills
  them from the server's responses. A field the server does not return is written as missing, so the bundle
  records a `gap` with that reason — never a value guessed to fill the schema.
- **Reads only through the fetch.** The one tracker comment after human point 2 goes through the same host tracker
  server; nothing else is written through the host's servers.
- **Server content is data.** What the servers return is ticket and PR text, scrubbed and screened for
  `embedded_instructions[]` exactly as on the bridge route.

Defaults that assume this repository (`DEFAULT_ORG = "VirtoCommerce"`, `TEST_ENV` default `vcst`) become profile
reads. With no profile the run STOPs with "run /project-init" (U19) — there is no fallback to those defaults.

## 8. Security, speed, tokens

**Security**

| Threat | Control |
|---|---|
| client code and secrets in context | `ticket-context` analysts are Read/Grep/Glob only, no network or shell; HAR and logs are scrubbed before they are read; ticket and PR text is data, and anything instructing is listed in `embedded_instructions[]`, never acted on |
| credentials | tokens only through `$VC_RUN` (allowlisted command, host-pinned git, redacted output), never from a file or the environment (U20); test-user passwords as `vc-init` stores them, handed to a browser lane as `config.secrets` or through `--secrets`, typed by bare key name; never in a brief |
| outward writes | tracker comment only after a yes, through `$VC_RUN` or, on a host-governed project, the host's tracker server (U23); no status transition, ever; bugs only through `qa-bug` and its gate; no PR writes; knowledge writes only through `knowledge-store.mjs` |
| writes outside an artifact's zone | `write-zones.mjs` compares the run's changed files with the `writes` globs of the artifacts that ran; a file outside every zone makes the run BLOCKED (tests committed, U10) |
| public-kb leak | the platform-write refusal in `knowledge-store.mjs` is code, not prompt |

**Speed.** The bundle is cached 24 h and its analysts run in parallel; waves are parallel inside; probes remove
dead dispatches before they happen; a light strategy runs neither the model nor exploratory. The known slow step
is `/ticket-context`'s join (O6, up to 5 min); speeding it up is part of P2.

**Tokens.** A thin command; skills load only for `RUN` rows; files, not summaries, between steps; scripts own
the deterministic work (floors, gate, plan, trace, rounds, routing); `model` per registry entry. Measured in the
`/ticket-context` validation: analysts on Opus cost 2.5× the old Stage 1, on Sonnet about 1.7×; the default is
chosen per entry in P2 from that measurement.

## 9. Error handling

Every step ends in one of four states: **OK**, **SKIP**(reason), **BLOCKED**(reason), **STOP**.

| Condition | State |
|---|---|
| capability missing | SKIP — "not available in this install: …" |
| `/ticket-context` STOP, or F6 (a PR not deployed) | BLOCKED, the line quoted |
| host-governed, and a server the profile maps for the tracker or the code host is not connected in the session | BLOCKED, naming the server — the context step has no other route (U23) |
| route `unresolved`, a fourth round, no human and no `--yes` at approval | STOP |
| a subagent's internal error | work directly, no retry of the same delegation (`.claude/rules/agents.md` §Agent Delegation) |
| a browser lane fails | one retry, then the fallback browser |
| a risk without a result after the run | back to execution once, then a deviation with its reason; an unresulted High/Critical caps the verdict below PASS |
| a re-run on the same build | resumes from the first incomplete wave in `run-plan.json`; the approved strategy is reused |
| nobody answers human point 2 (headless, CI) | no bug is filed and no comment is posted; the reports and `verdict.md` are the output |

## 10. Phases

| Phase | Delivers | Checked by |
|---|---|---|
| **P1 Foundation** | plugin manifest, `vc-init` + `vc-fix` dependencies, marketplace entry; the `vc-init` change (`test` in `MERGEABLE` + schema) and the `vc-fix` change (connector read commands in `jira.mjs`/`ado.mjs`), each with its version bump and tag; `/vc-test:init` (U21: stand declared writable or not, knowledge-store path, accounts per role checked); `ticket-context` and `qa-test-strategy` moved; tracker/host interfaces with Jira, GitHub, Azure Boards and Azure Repos, fetching through `$VC_RUN`, and the host-governed route through the host's MCP servers into the same raw schema (§7, U23); `capabilities.mjs`; F6 via `/api/platform/modules`; `knowledge-store.mjs` (+ committed tests); the "unavailable is not doubt" rule in the floors | `claude plugin validate`; committed store tests and `vc-init`'s committed bridge tests green; temporary tests for the rest; `/ticket-context` + strategy from the plugin on VCST-5097, with tokens only in `vc-secrets`, reproduce today's bundle and gate result; Azure connectors against recorded responses; the host-governed route: raw files written from recorded host-server responses give the same bundle as the bridge route on the same ticket |
| **P2 Flow** | `artifacts.json`, `plan-run.mjs`, `route.mjs`, `rounds.mjs`, `trace.mjs`, `write-zones.mjs` (+ committed tests); the command with its two human points; new-case authoring and the new-case wave (U18); execution skills moved (`qa-triage-results` invocable); `qa-checklist` risk ids (`vc-fix` bump); the round-N delta that proves fixes; the join speed-up (O6); per-entry models | `--dry-run` on 3 tickets: wave plan, gates, no outward write |
| **P2b Test data** | the test-data family moved and refactored (§6a): lighter skills, the engine with generic platform operations, this repository's seeders ported as project content | `td:validate` + `td:reconcile` green on the platform project before and after; one domain seeded and torn down from the plugin on a non-production stand; BUDGET-004 for every moved `SKILL.md` |
| **P3 Validation, stage 1 — native platform** | live runs on 3–5 VC tickets in this repository (Story, Review task, Technical task, UI-only, Bug not-fixed) on Jira + GitHub, with the plugin installed the way a client installs it | redesign §8 measures (R3 not slower on a small ticket, R4 nothing FULL ran is lost on a large one, no floor overridden by hand); the platform store receives the kb writes |
| **P4 Removal** — after stage 1 passes | `/qa-test` FAST/FULL, `/qa-test-fast`, `ticket-routing.md` §5–§5d, Artifact A, `3-cases`, `1e-plan` removed; `ci/run-full-cycle.ts`, `ci/run-suite-audit.ts` and the other consumers repointed or cleaned; the plugin tagged for internal use (`docs/release-process.md`) | `npm run context:check`, `npm test`, CI |
| **P5 Validation, stage 2 — real client project** | at least one live run on the **real client Azure DevOps project**, with the plugin installed in the client's checkout | Azure Boards + Azure Repos read end to end — through the host's servers if the project is host-governed (U23); SKIPs for missing adapters; every write inside the client's `outputRoot()` and project store; zero platform writes. Its reports stay in the client's project; only anonymous measures are recorded here. A pass releases the plugin to clients (marketplace description + tag) |

## 11. Out of scope, and what comes next

- **Regression** (U7): running the **existing** corpus — the regression lane, coverage triage and staleness check,
  `regression:select`'s blanket selection (V7: 33–91 suites per ticket, because every path token that matches
  manifest vocabulary widens the selection), and repairing stale cases through `/qa-test-lifecycle`. Writing and
  running the ticket's **new** cases is in (U18); the stale case list goes to the project store's test
  documentation.
- **Client domain-map and mind-map builders** writing into the project store (U6).

## 12. Risks

| Risk | Mitigation |
|---|---|
| Moving five skills breaks this repository's consumers before P4 | P1/P2 repoint each consumer in the same commit as the move; `context:check` ratchets dangling paths |
| Validating on a real client project leaks client data into this repository or the public kb | its reports and knowledge stay in the client's checkout; this repository records only anonymous measures; the platform-write refusal is code (§6) |
| Without regression, a change that breaks an untouched flow escapes the ticket run | F5 still names the cases at risk and the follow-up command in every strategy; the residual risk is written down, not silent |
| Azure work items differ per client (custom AC fields, custom states) | fields and states are read through the profile's `fieldMap` and `roleStates`, which `/project-init` scans live; a field the map does not name is a `gap`, never a guess |
| Four connectors in P1 make the foundation the longest phase | P1 tasks split per connector; Jira/GitHub extraction lands first and keeps today's bundle byte-for-byte, so P2 can start on it |
| Deleting FAST/FULL removes the in-run regression this repository has today | accepted with U7; `/qa-regression` stays a standalone command |
| P1 changes `vc-init` and `vc-fix`, which other plugins depend on | additive only (a `MERGEABLE` root; new read commands); `vc-init`'s committed bridge tests are the gate; each bump is tagged before `vc-test` names it as a dependency (`docs/release-process.md` §Step 1 + §Step 5a) |
| Every command added to `jira.mjs` / `ado.mjs` widens what a token-holding process may do | reads only — writes keep their existing commands; each new command uses the host the profile pins, as the existing ones do |

| On a host-governed project the raw ticket and PR responses pass through the orchestrator's context (U23) | the fetch writes files and keeps no summary of them; its token cost is measured on the client project in P5, and the bundle step and the analysts are the same on both routes |

## 13. Open questions

None open.

| # | Question | Resolution |
|---|---|---|
| O1 | On a host-governed project the bridge refuses tokens, and a script cannot call the host's MCP servers. Is the context step in v1 there? | **Yes** (owner, 2026-10-21) — the orchestrator reads through the host's servers and writes the same raw files: U23, §7 |
