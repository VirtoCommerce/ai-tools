# `vc-test` — one testing flow for any Virto Commerce project

> **Status: for review.** Brainstormed with the owner on 2026-10-15; every decision in §2 is the owner's.
> Builds on the `/qa-test` redesign ([spec](2026-10-09-qa-test-strategy-redesign.md), D1–D12) and on
> `/ticket-context` ([spec](2026-10-08-ticket-context-design.md)). Supersedes the 2026-10-15 plan that turned
> `/qa-test-fast` into the prototype; that plan was withdrawn before execution. Tracked in VCST-6249.

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
- **No regression in this project** (U7): no regression lane, no coverage triage, no regression-corpus updates.
  Client suites may look nothing like ours; regression is the next large step.
- No client-side domain-map or mind-map builders (U6) — the next step into the knowledge store this design
  creates.

## 2. Decisions (owner, 2026-10-15)

| # | Question | Decision |
|---|---|---|
| U1 | Where does the single flow live? | A **new command**; FAST, FULL and `/qa-test-fast` are removed after validation — "we are moving away from FAST/FULL" |
| U2 | How does it reach clients? | A **new plugin `vc-test`** (working name) that depends on `vc-fix`, like `vc-perf` does. Canonical copies live in the plugin; this repository uses the plugin, with no duplicate under `.claude/` |
| U3 | What is in v1? | **Core + adapters.** Core: context, strategy, test model, checklist, exploratory, visual lane, triage, investigate, `qa-bug`, verdict. Adapters run when the project has what they need and otherwise record a `SKIP` with the reason |
| U4 | Trackers and code hosts | A **connector interface** with **four connectors in v1 (P1)**: Jira, GitHub, Azure Boards, Azure Repos. Azure is validated on a real client Azure DevOps project, not a sandbox (owner, 2026-10-15, revising the first answer "Jira + GitHub first") |
| U5 | "Any project" means | **Any Virto Commerce project**. Platform facts may be relied on: `/api/platform/modules`, the `vc-frontend` layout for the ui-kit, xAPI, VirtoOZ, the public kb |
| U6 | Knowledge | **Two stores, one interface** (§6). A client run reads its project store first, then the platform store, and writes **only** to its project store. Domain/mind-map builders for clients come next |
| U7 | Regression | **Out of this project.** F5 still fires, but records the cases at risk and the follow-up instead of requiring a run (§5.3). The post-verdict corpus update goes with it |
| U8 | Orchestrator shape | **Registry + planner**: `artifacts.json` declares the artifacts, `plan-run.mjs` computes the waves, the command executes the plan |
| U9 | Removal timing and validation stages | Build → **stage 1**: validate on 3–5 native-platform tickets → remove FAST/FULL/`/qa-test-fast` → **stage 2**: validate on the real client project → release to clients |
| U11 | Where the run asks a human | **Two points only.** *Before execution*: approve the strategy (and, on the same build, re-run or reuse). *After the verdict*: `qa-bug` runs for each confirmed bug and asks its own "create a tracker ticket?" question (`qa-bug` is used as it is), then the run asks once whether to post the tracker comment. Nothing asks between the two points; `--yes` answers only the first |
| U12 | How much of the bundle the strategy reads | **The whole bundle**, so nothing is missed; the token cost is accepted |
| U13 | Who writes the checklist | **The orchestrator, inline** — it already holds the bundle and the strategy, and a subagent would need them retold |
| U14 | `qa-triage-results` cannot be called by the Skill tool (`disable-model-invocation: true`) | **Remove the flag** in the plugin's canonical copy |
| U15 | Round N ≥ 2 | **A delta strategy that proves the fixes**: the diff from the last tested commit; every bug from round N−1 is a risk with its original reproduction as a checklist item, decided `FIXED` / `NOT FIXED`, plus a risk for what sits next to the fix; every unresulted risk carries over; the verdict lists each prior bug's result |
| U10 | Committed tests | An exception like `plugins/vc-secrets/`: the knowledge-store write router and the write-zone check get **committed** tests; everything else follows the repository rule (temporary tests, deleted before commit) |

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
 4 CLOSE     trace.mjs reconcile → /qa-triage-results → qa-investigate → verdict → verdict.md + HTML
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
| `vc-fix`: `qa-checklist`, `qa-investigate`, `qa-bug`, `qa-risk`, `qa-evidence`, agents `qa-*-expert`, `project-init`, `project-profile.json` | **reused**; `qa-bug` unchanged. One change, one `vc-fix` version bump: `qa-checklist` Mode 5 names the risk id in Ref and gains `--from-strategy` | — |
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
                          wave 1  test-model ‖ mind-map* ‖ contract-refresh*
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

v1 entries: `test-model`, `mind-map`\*, `contract-refresh`\*, `checklist`, `exploratory`, `checklist-runners`
(storefront + admin/API lanes), `visual`, `verifier`. Adding an artifact = an entry + its skill; the command does
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
| test documentation | strategies, test models, checklists, verdicts, candidate and stale case lists | the flow |
| observed behaviour | kb entries: question, claim, trust, provenance | the flow's close: capture / confirm / dispute |

**v1 backend:** a folder in the client's repository, default `qa-knowledge/`, path set in
`project-profile.json`; git gives history, review and access control. Other backends (a private kb repository,
Confluence) plug into the same interface later. This repository is one configuration of it: project =
`.claude/knowledge/`, platform writes enabled.

**Every write goes through `knowledge-store.mjs`**, which:
- refuses a platform write when `projectType` is `client`, whatever the caller asks;
- scrubs the text with the existing secret scrubber before writing;
- writes only inside the configured store path.

Its tests are committed (U10). v1 fills test documentation, observed behaviour and business-rule proposals —
the things the flow already produces. Domain maps and mind maps are read when present.

## 7. Connectors

`/ticket-context` reads Jira and GitHub today, inline in its `lib/`; Azure Boards is a stub
(`connector-unavailable`) and Azure Repos is not read at all. Both are extracted behind two interfaces, selected
by `project-profile.json` (`tracker.kind`, `vcs.clientHost`):

| Interface | Operations | Jira / GitHub | Azure Boards / Azure Repos |
|---|---|---|---|
| `tracker` | fetch issue, fields (incl. the AC field), comments, attachments, links, parent/epic, status → role; post or amend one comment | today's `jira.mjs` | work-item REST: fields mapped through `tracker.fieldMap`, states → roles through `tracker.azure.roleStates` (already scanned by `/project-init`), attachments and relations from the work item's `relations[]` |
| `host` | find a ticket's PRs; read metadata, files, diff, review threads, merge state | today's `github.mjs` (key search across the profile's orgs) | the work item's native **ArtifactLink** relations to pull requests — a stronger link than a key search — then the Git PR REST endpoints for iterations, changes, diff and threads |

Credentials stay where `vc-fix` keeps them: a PAT from the profile's `authEnv`, else `az login`. v1 keeps
today's Jira/GitHub behaviour byte-for-byte on the platform project (`/ticket-context`'s own gate and the
VCST-5097 bundle are the regression check). The Azure connectors are checked against recorded responses in P1
and live on the client project in P3; the bundle schema does not change — a connector fills the same fields.

Defaults that assume this repository (`DEFAULT_ORG = "VirtoCommerce"`, `TEST_ENV` default `vcst`) become profile
values with those defaults only when no profile exists.

## 8. Security, speed, tokens

**Security**

| Threat | Control |
|---|---|
| client code and secrets in context | `ticket-context` analysts are Read/Grep/Glob only, no network or shell; HAR and logs are scrubbed before they are read; ticket and PR text is data, and anything instructing is listed in `embedded_instructions[]`, never acted on |
| credentials | resolved from the layered env and `.env.local` through the profile; never in a brief; Playwright `--secrets` takes bare key names |
| outward writes | tracker comment only after a yes; no status transition, ever; bugs only through `qa-bug` and its gate; no PR writes; knowledge writes only through `knowledge-store.mjs` |
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
| route `unresolved`, a fourth round, no human and no `--yes` at approval | STOP |
| a subagent's internal error | work directly, no retry of the same delegation (`.claude/rules/agents.md` §Agent Delegation) |
| a browser lane fails | one retry, then the fallback browser |
| a risk without a result after the run | back to execution once, then a deviation with its reason; an unresulted High/Critical caps the verdict below PASS |
| a re-run on the same build | resumes from the first incomplete wave in `run-plan.json`; the approved strategy is reused |
| nobody answers human point 2 (headless, CI) | no bug is filed and no comment is posted; the reports and `verdict.md` are the output |

## 10. Phases

| Phase | Delivers | Checked by |
|---|---|---|
| **P1 Foundation** | plugin manifest, `vc-fix` dependency, marketplace entry; `ticket-context` and `qa-test-strategy` moved; tracker/host interfaces with Jira, GitHub, Azure Boards and Azure Repos; `capabilities.mjs`; F6 via `/api/platform/modules`; `knowledge-store.mjs` (+ committed tests); the "unavailable is not doubt" rule in the floors | `claude plugin validate`; committed store tests; temporary tests for the rest; `/ticket-context` + strategy from the plugin on VCST-5097 reproduce today's bundle and gate result; Azure connectors against recorded responses |
| **P2 Flow** | `artifacts.json`, `plan-run.mjs`, `route.mjs`, `rounds.mjs`, `trace.mjs`, `write-zones.mjs` (+ committed tests); the command with its two human points; execution skills moved (`qa-triage-results` invocable); `qa-checklist` risk ids (`vc-fix` bump); the round-N delta that proves fixes; the join speed-up (O6); per-entry models | `--dry-run` on 3 tickets: wave plan, gates, no outward write |
| **P3 Validation, stage 1 — native platform** | live runs on 3–5 VC tickets in this repository (Story, Review task, Technical task, UI-only, Bug not-fixed) on Jira + GitHub, with the plugin installed the way a client installs it | redesign §8 measures (R3 not slower on a small ticket, R4 nothing FULL ran is lost on a large one, no floor overridden by hand); the platform store receives the kb writes |
| **P4 Removal** — after stage 1 passes | `/qa-test` FAST/FULL, `/qa-test-fast`, `ticket-routing.md` §5–§5d, Artifact A, `3-cases`, `1e-plan` removed; `ci/run-full-cycle.ts`, `ci/run-suite-audit.ts` and the other consumers repointed or cleaned; the plugin tagged for internal use (`docs/release-process.md`) | `npm run context:check`, `npm test`, CI |
| **P5 Validation, stage 2 — real client project** | at least one live run on the **real client Azure DevOps project**, with the plugin installed in the client's checkout | Azure Boards + Azure Repos read end to end; SKIPs for missing adapters; every write inside the client's `outputRoot()` and project store; zero platform writes. Its reports stay in the client's project; only anonymous measures are recorded here. A pass releases the plugin to clients (marketplace description + tag) |

## 11. Out of scope, and what comes next

- **Regression** (U7): the regression lane, coverage triage and staleness check, `regression:select`'s blanket
  selection (V7: 33–91 suites per ticket, because every path token that matches manifest vocabulary widens the
  selection), and the post-verdict corpus update through `/qa-test-lifecycle`. Until then the run hands its
  candidate and stale case lists to the project store's test documentation.
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
