# vc-test — preview

One testing flow for a Virto Commerce ticket ([spec](../../docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md)).
It gathers the ticket's context, maps the change, and scores scenarios that hunt significant bugs. You approve the
scenario list at one human point. Each scenario then gets its own agent, and one more agent proves the ACs in the
background. After that come triage, a Medium-only investigation, and a verdict that reports tokens and minutes
per step.

**Preview.** `/vc-test:ticket-context` and `/vc-test:qa-test-strategy` are this plugin's own code. `/vc-test:qa-test-strategy` now
reads no document outside the plugin (the verdict rules and the `knowledge/` copies below); `/vc-test:ticket-context` uses this repository's scripts (`deploy:pr`, `domain:check`, `regression:select`, …) where a project declares them, and records a named SKIP where it does not. It reads the tracker and the code host — Jira or Azure Boards, GitHub or Azure Repos, as `project-profile.json` names them — only through `$VC_RUN`, or, on a host-governed project, through the host's MCP servers: a `fetch` agent answers what
each `prepare` pass could not read, and the orchestrator never sees that content. `/vc-test:qa-ticket` also calls
`/vc-test:qa-triage-results` and, for a Medium bug, `/vc-fix:qa-investigate`; both run from installed plugins. `/vc-test:init` and the scripts below work in any project.

The first half of this file is the **user guide** (what to run, what happens, what you get). The second half,
[What is here](#what-is-here), is the normative file map for whoever changes the plugin.

## Install

```
/plugin install vc-test@ai-tools        # pulls in vc-init (≥ 0.4.1) and vc-fix
/project-init                           # vc-init: the profile, tokens in vc-secrets, test accounts
/vc-test:init                           # vc-test: which envs a run may write to, the knowledge store
```

`vc-test` has its own dependencies: `dotenv` for the env loader it carries, and `@playwright/test` for `.spec`
runs in a project without its own Playwright. In an install, run `npm install --omit=dev --prefix <the plugin's
folder>` once; `/vc-test:init` says so when they are missing. A checkout of this repository already has them.

The plugin installs **disabled** (`defaultEnabled: false`); enable it for the project that uses it.

### What `/vc-test:init` asks

It writes only the profile's `test` block, through vc-init's `profile-set.mjs`; re-running it merges, never replaces.

| Question | Why it matters |
|---|---|
| Which environments may a run create or change data on? | Every other env is read-only. A scenario that needs a write there is `BLOCKED`, never run. Never choose a production stand |
| Where does the project's knowledge store live? | Default `qa-knowledge/` in the project repo. Project knowledge (domain maps, personas) is read and written only there |
| Which statuses mean a Bug is fix-ready, hotfix-ready, not fixed? | `test.routing`: how step 0 routes a Bug to the right job. An unlisted status is asked at run time |
| What may one run spend? | `test.budget` (`qa` / `dev`: tokens and minutes). A run **reports** its spend against it, never stops on it |
| Keep this project's own personas? | Optional `personas.md` in the knowledge store; the visual lane proposes rows later |

Missing accounts are answered with `/project-init --add-user` — `/vc-test:init` never asks for a login or a password.
Test-account logins and passwords live in `test-accounts.local.json` (project root, gitignored); a project that has
not migrated keeps them in `.env.local` or vc-secrets, which still work, and `/project-init --check` migrates them.

## Quick start

```
/vc-test:qa-ticket VCST-1234                 # test one ticket: scenarios + ACs, one approval, a verdict
/vc-test:qa-ticket VCST-1234 vcptcore --yes  # on another env, auto-approve the scenario list
/vc-test:qa-ticket VCST-1234 --dry-run       # stop after the plan: print the waves, run nothing
/vc-test:qa-goal VCST-1234                   # a ticket with no ACs, or one that needs research first

/vc-test:ticket-context VCST-1234            # only the context bundle
/vc-test:qa-test-strategy VCST-1234          # only the strategy (after the bundle)
/vc-test:qa-triage-results ticket VCST-1234  # triage a finished ticket run's checklist
/vc-test:qa-design /cart                     # visual / design / accessibility audit of one page
```

## Which command when

| You have | Run |
|---|---|
| A feature or bug ticket with ACs, ready to test | `/vc-test:qa-ticket <KEY>` |
| A ticket with no ACs, a change in a component the ticket does not link, or one that needs research before a test can be written | `/vc-test:qa-goal <KEY>` — `qa-ticket` prints this hint itself and goes on |
| A pure refactor (one product PR, one layer, no new page / route / operation / migration) | `qa-ticket` stops as `technical-change` and names `/qa-test <KEY>` (scoped regression) then `/qa-test-lifecycle <KEY>`; `--full` runs the scenario hunt anyway |
| A Bug ready for verification or a hotfix check | `qa-ticket` stops at step 0 and names the job (`/vc-fix:qa-verify-fix <KEY>`, `/qa-hotfix-check <KEY>`); a Bug in a status no role lists is asked once |
| Just the analysis, for modelling or planning | `/vc-test:ticket-context`, then `/vc-test:qa-test-strategy` |
| A finished run to triage | `/vc-test:qa-triage-results ticket <KEY>` (or a `RUN_ID` in a project with regression runs) |
| A component, page or flow to audit visually | `/vc-test:qa-design <target>` |

## `/vc-test:qa-ticket` — the run

```
/vc-test:qa-ticket <TICKET> [<env>] [--yes] [--dry-run] [--full]
```

| Flag | Effect |
|---|---|
| `<env>` | the environment to test on (default: the session's bound env) |
| `--yes` | answers human point 1 (the scenario list) — `Status: AUTO (--yes)` |
| `--dry-run` | stops after step 4: prints the waves and what will not run, writes nothing else |
| `--full` | runs the scenario hunt on a change that routes as `technical-change` |

### The steps

| # | Step | What happens |
|---|---|---|
| 0 | Probe | Binds the run folder, routes the ticket (`test` / `verify-fix` / `hotfix-check`), decides the round, reads this install's capabilities (lanes, writable stand), picks the domain slug |
| 1 | Context | `/vc-test:ticket-context` builds the bundle. A PR that is **not deployed** ⇒ verdict `BLOCKED` on deploy, nothing tested |
| 2 | Change map, scenarios | The `change-map` agent maps every AC to code (or NO CODE), hidden code and hotspots, and lists its **suspicions** (file and line, shown to you). A scenarios agent scores candidate scenarios |
| 3 | Strategy — **human point 1** | A strategy agent writes `test-strategy.md`; a Critical risk gets an independent `strategy-verifier`. You approve, change (add, strike, reorder) or name a shared store. Approving also approves the team-channel announcements of any shared-state windows |
| 4 | Plan | `run-plan.json`: the waves, one browser lane per agent, ≤ 3 at once |
| 5 | Waves | One agent per scenario, the background AC run (`checklist` + `ac-checks`), the visual lane, `PIXEL` comparisons where the strategy names them. Every created entity goes to the ledger |
| 6 | Triage | `/vc-test:qa-triage-results ticket <KEY> --min-severity P2`; only Medium+ is investigated (`vc-fix:qa-investigate`). A Low finding is one line under "Noticed" |
| 7 | Verdict | Trace reconciliation, write-zone check, run cost, then `verdict-writer` writes `verdict.md` / `verdict.json` |
| 8 | Human point 2 | Each confirmed Medium+ bug goes through `/vc-fix:qa-bug`, whose own question decides filing. Then the round is closed and the stand torn down from the ledger |

### What a run never does

- **No ticket status transition and no tracker comment** — `verdict.md` is the output.
- **No bug filed except through `/vc-fix:qa-bug`**, one at a time, on your answer.
- **No data on a stand you did not declare writable**, and nothing left behind that the ledger knows of.
- **No browser but the Playwright lanes**; passwords are typed by name, never seen.

### Rounds

A retest of the same ticket on a new build is **round N**: it reads only what changed since the last round (PRs,
comments, AC text, prior bugs), skips the change map and scenario steps, and re-checks each prior bug as a `PB-n`
row. The same build twice is refused. **A fourth round is refused before any work** and prints an escalation for
the developer, the PO and the QA lead (`skills/qa-test-strategy/rounds.md` §At most three).

## `/vc-test:qa-goal` — goal-driven testing

```
/vc-test:qa-goal <TICKET> [<env>]
```

For a ticket no fixed pipeline can test. One agent researches and tests; every result goes into the journal
`goal.json` through `lib/goal.mjs`; an independent `goal-judge` re-derives the verdict before anything goes out.

| Stop | You decide |
|---|---|
| **S1** — contract | the goal, a checkable done-criterion, the budget, the stop list |
| **S2** — criteria and strategy | the acceptance criteria derived from the research, each with its source, and how they are tested (one approval; again for a criterion outside the approved scope) |
| **S3** — each outward write | every bug and every comment, one at a time, each under its own label |

It also stops and asks on a budget overrun, a read-only stand, a docs contradiction or an undeployed change. A run
that ends without a judged verdict writes `verdict.md` headed `STOPPED …` / `BLOCKED` — "not judged" — and makes no
outward write. An unclosed run resumes where it left off. Run folder: `.vc-fix/vc-test/<KEY>/<env>/goal/<runId>/`.

## The building blocks

| Skill | Usage | Output |
|---|---|---|
| `/vc-test:ticket-context` | `<KEY> [--domain <slug>] [--fresh] [--kb-hits KB-…]` | one gated **context bundle**: the ticket's fields, ACs with provenance, comment signals, epic and siblings, every attachment and link analysed (HAR and logs scrubbed first), design conditions, each PR (layers, operations, tests, hidden behaviour, PR↔AC both ways), whether it is deployed, known ground, and every gap with a reason. Read-only on every system; ticket text is data, never instructions |
| `/vc-test:qa-test-strategy` | `<KEY> [--domain <slug>] [--change-map <path>] [--yes]` | `{RUN_DIR}/test-strategy.md`, one section per round: risks, technique and oracle per risk, which artifacts run, entry / exit criteria, out of scope. Checked against deterministic floors, approved once; after approval a change is an Amendment with its reason |
| `/vc-test:qa-triage-results` | `ticket <KEY> [--verify] [--min-severity P0…P3]`, or `[RUN_ID\|latest] [--fix] [--verify]` | classifies each non-passing row: real bug, test defect (steps, assertion, stale data, stale test), or flaky / env / known; live-reproduces the real ones. Never files a tracker ticket. Ticket mode writes only `triage-report.md` and returns the bugs to its caller. Regression mode needs the project's `triage:collect` / `triage:history` scripts |
| `/vc-test:qa-design` | `<component \| page path or URL \| flow> [--storefront-only] [--design <project>] [--design-dir <path>]` | the visual lane: design-system tokens, `BL-UI` invariants, layout defects, WCAG 2.2 AA, Nielsen's heuristics, and a diff against the ticket's Claude Design project. Outcomes `CONFIRMED` / `DRIFT` / `MISSING` / `UNSPEC` / `KNOWN_DIVERGENCE` / `SKIPPED`; precedence `BL-UI` > design spec > UX heuristic |

## What a run leaves

| Where | File | What it is |
|---|---|---|
| `RUN_DIR` (the ticket's run folder, printed at step 0) | `test-strategy.md` | the approved strategy, a section per round, with its reconciliation |
| | `testing-checklist.md` | the AC rows (`C-n`) and every lane's result rows: scenarios `SC-n.m`, visual `VIS-n`, pixel `PIX-n`, prior bugs `PB-n` |
| | `scenarios/` | each scenario's result rows before they are merged into the checklist |
| | `verdict.md`, `verdict.json` | the verdict, the bugs (Critical / High / Medium, in or out of scope), what was not proven, the cost per step |
| | `rounds/round-<N>.json` | the closed round's record, which round N+1 reads |
| `.vc-fix/vc-test/<KEY>/<env>/` (work dir) | `change-map.json`, `delta.json` (round N), `scenarios.json`, `run-plan.json`, `trace.json`, `write-zones.json`, `packages.md` | the hand-off files between steps; every step reads paths, never summaries |

### The verdict

| Verdict | Means |
|---|---|
| **PASS** | every AC condition has PASS evidence reconciled against what the agents saw live; no in-scope P0/P1 bug |
| **PASS WITH NOTES** | all conditions met; only minor or out-of-scope bugs, tracked separately |
| **FAIL** | an AC not met or contradicted live, a DoD item not met, a `BL-*` violated, an in-scope P0/P1 bug, or (round N) a prior bug still not fixed. An out-of-scope incidental bug does not fail the ticket |
| **BLOCKED** | it could not be tested: environment down, not deployed, missing test data, an unresolved dependency, or a write outside the run's zones |

The first line under the heading carries the bug count and the run's share of its budget — information, never a
gate. Full rules: `skills/qa-test-strategy/verdict-rules.md` §Decide the verdict.

## Safety rails

- **Writable by declaration only.** A stand is writable when `/vc-test:init` declared it and `BACK_URL` is that
  stand (`lib/capabilities.mjs`).
- **Ledger and teardown.** Every entity a lane creates, and every setting it changes (with its before / after), is
  appended through `lib/ledger.mjs`; `lib/teardown.mjs` removes exactly those at the end, and names what it could not.
- **Write zones.** `lib/write-zones.mjs` snapshots the tree before the first wave and reports every changed file
  outside the zones of the artifacts that ran — `BLOCKED`, never a silent pass.
- **No tokens held.** Tracker and code-host reads go through vc-init's `$VC_RUN` bridge, or the host's MCP servers
  through the `fetch` agent; passwords reach only the Playwright lanes.
- **Knowledge stays where it belongs.** `lib/knowledge-store.mjs` is the only writer; a client project never writes
  to the platform store, and text is scrubbed first.

## Troubleshooting

| Message | Do |
|---|---|
| `run /project-init` | no `project-profile.json` yet — run vc-init's `/project-init`, then `/vc-test:init` |
| `Cannot find package …` | the plugin's own dependencies: `npm install --omit=dev --prefix "<plugin folder>"` once |
| `$VC_RUN` unset | `/project-init --check`, then restart Claude Code |
| No Playwright lane, or a password name typed as literal text | restart Claude Code or run `/project-init --check` — never switch browsers |
| `NOT DEPLOYED:` / `DEPLOYMENT UNKNOWN:` | the PR is not on the stand (verdict `BLOCKED`) / could not be checked (verdict says "deployment unverified") |
| `Round <N−1> already tested this build` | wait for a new build; a fourth round is refused and escalated |
| `BLOCKED — needs <capability>` | the install lacks a lane, a writable stand or a script that scenario needs — see `capabilities.json` in the work dir |

## What is here

| Path | Does |
|---|---|
| `commands/init.md` | `/vc-test:init`. Writes the profile's `test` block (environments, knowledge store, `test.routing`) through vc-init's `profile-set.mjs` and lists missing accounts with their `/project-init --add-user` command. It never asks for or writes a password |
| `skills/ticket-context/`, `agents/ticket-context-analyst.md` | `/vc-test:ticket-context`: one gated context bundle for one ticket |
| `agents/fetch.md`, `skills/ticket-context/lib/replay.mjs`, `fetch-catalog.json` | The host-governed route: `prepare --raw` answers each read from a raw folder and ends `needs-fetch` with the reads it lacks; the `fetch` agent answers them through the host's servers (read tools only), shaped as the catalog says the bridge would print. A read the servers have no tool for is a gap, never a guess |
| `skills/qa-test-strategy/`, `agents/strategy-verifier.md` | `/vc-test:qa-test-strategy`: the floors, the gate, and an independent read-only verifier on a Critical risk |
| `skills/qa-test-strategy/verdict-rules.md` | The rules that turn a run's results into its verdict: §Reconcile (AC and DoD against what the agents observed), §Decide the verdict, and §Shape (the `verdict.md` skeleton). They moved here from this repository's `/qa-test` close-out §5-verdict and the older fast-path verdict step, with their meaning unchanged; `verdict-writer` and the strategy read this file, and `close-out.md` keeps its headings and points here |
| `knowledge/` | Copies of this repository's documents, so the strategy, the briefs and the agents read them from the plugin. Each names its source in its first line, and the repository copy stays canonical: `test-data.md` (the repository's `rules/test-data.md`), `reports.md` (its `rules/reports.md`), `live-discovery.md` (`knowledge/execution/live-discovery.md`), `oracle-authority.md` (the authority tags, `shared-instructions.md` §5), `test-design-techniques.md` (`qa-test-design`'s §0 vocabulary, §1 selection guide and §1a FLOW), `security-abuse-cases.md` (`qa-test-design`'s SEC technique, which the §0 `SEC` row names), `exploratory-box.md` (`qa-test`'s `exploratory-lane.md` §5), `ui-kit-class.md` (`qa-test`'s F8 signal), `domain-map.md` (the map's shape), `vc-bug-catalog.md`, `debugging-signals.md`, `platform-patterns.md` and `storefront-config-flags.md` (the triage skill's reads; whole files, copied from this repository's knowledge folder, not vc-fix's diverged ones), and `bl-ui.md`, `critical-ui-scope.md`, `storefront-selectors.md` and `wcag-accessibility-checklist.md` (the visual lane's reads; `bl-ui.md` is generated from the BL YAML by `npm run vc-test:design`), and `risk-prioritization-framework.md`, which is the `qa-risk` framework copied from the repository's `skills/qa-risk/`, because `vc-fix:qa-risk` cannot be loaded by an agent (`disable-model-invocation`). A prompt that names a document only this repository has says "(in this repository: …)". `context:check` DOC-009 ratchets a `plugins/vc-test/` file that reads a path under the repository's .claude folder |
| `skills/qa-triage-results/` | `/vc-test:qa-triage-results`, both modes (moved from this repository, P2-5b): `SKILL.md` is the old command's Phases 0–6 behind a mode gate; `methodology.md`, `triage-taxonomy.md`, `routing-and-fix.md` and `live-triage-design.md` are the supporting files. Ticket mode runs in any project; regression mode only where the project's `package.json` has `triage:collect` and `triage:history`. This repository's `/qa-triage-results` is a shim that runs it (needs vc-test ≥ 0.11.0) |
| `lib/triage-collect.mjs` | The ticket-mode collector: the evidence packet of `/vc-test:qa-triage-results` (`source: "checklist"`), identical to what `npm run triage:collect -- --ticket` printed. Run it as `node <plugin>/lib/triage-collect.mjs --ticket <KEY>` |
| `briefs/triage-classifier.md` | The classifier brief (moved from this repository's CI regression-triage agent) |
| `skills/qa-design/`, `agents/ui-ux-expert.md` | `/vc-test:qa-design` and the agent that runs the visual lane (moved from this repository, P2-5c): the design-system, layout, accessibility and Claude Design checks, with `visual-axis.md` (the outcome, landing and blocks table; `CONFIRMED` / `DRIFT` / `MISSING` / `UNSPEC` / `KNOWN_DIVERGENCE` / `SKIPPED`, precedence `BL-UI` > design spec > UX heuristic). The lane runs on a Playwright lane drawn from the pool (`playwright-edge`, `-chrome`, `-firefox`) that the run's wave leaves free; Chrome DevTools and Lighthouse are no longer used. This repository's `/qa-design` is a shim that runs the skill (needs vc-test ≥ 0.12.0) |
| `lib/design/` | The measurement code the visual lane runs in the page, generated from this repository's TypeScript by `npm run vc-test:design` (`vc-test:design:check` fails when a bundle is stale, and runs as a `gates.yml` step): `snippet.mjs` prints a browser snippet to paste into `browser_evaluate`, and `design-spec-extract.mjs` reads a Claude Design project into the spec. A BL YAML edit (`bl/ui.yaml`, `a11y.yaml`, `price`, `cat`, `chk`) changes `knowledge/bl-ui.md`, so run `npm run vc-test:design` after it |
| `commands/qa-ticket.md` | `/vc-test:qa-ticket <KEY> [<env>] [--yes] [--dry-run] [--full]`, the QA run (preview) |
| `lib/profile.mjs` | The read-only profile loader. A missing profile is a STOP ("run /project-init"), never a default |
| `lib/capabilities.mjs` | What this install can do: connectors, stand URLs, MCP servers, the knowledge store, the project's scripts. A stand is writable only by declaration (`test.environments`) and only when `BACK_URL` is the declared stand |
| `lib/deployed.mjs` | F6. It reads module, platform and theme versions from the stand. Run it as `node "$VC_RUN" runner plugin deployed --key <KEY>`, because it needs the admin login. A side it cannot read is UNKNOWN, never "not deployed"; a module the stand has not installed, or disabled on a load error, is never DEPLOYED. No step runs it with `--expect` yet, so on a project without `deploy:pr` F6 produces no `NOT DEPLOYED` line (every PR is DEPLOYMENT UNKNOWN); the producer is deferred to P2 |
| `lib/knowledge-store.mjs` | The one reader and writer of project and platform knowledge. A client project never writes to the platform store, text is scrubbed, and nothing lands outside the store. It has committed tests (`knowledge-store.test.mjs`) |
| `lib/personas.mjs` | The project's own personas file in its knowledge store (`personas.md`: archetypes, segments, persona → account): `--show`, `--init`, `--add --section … --row …`. Writes only through `knowledge-store.mjs` into the project store; the visual lane proposes rows, the operator accepts them |
| `harness/playwright.config.mjs` | The config vc-init's runner runs `.spec` files under. `testDir` is the project |
| `lib/route.mjs` | Step 0: a ticket's type × status role → the job (`test`, `verify-fix`, `hotfix-check`), or `unresolved` (exit 4) so the command asks. Step 1, with `--bundle` (and `--prepare` for the PR diffs: new and renamed files, menu/router changes, extension-point registrations): a non-Bug `test` whose change resolves every refactor signal (`shapeOf`: refactor wording, one product PR on one layer, no new page/route/menu/operation/endpoint, no migration/flag/REST/server-schema change) becomes `technical-change` and the command STOPs naming `/qa-test <KEY>` — the scoped regression plus the case sync — unless `--full`. Fails closed. A status reaches a role only through the profile's `test.routing` (or Azure's `roleStates`), never by name in code; a Sub-task is decided by the connector's `issuetype.subtask`, not its name |
| `lib/trace.mjs` | Step 7: fills the last round's Reconciliation table from the checklist's result rows (`C-n`, `SC-n.m`, `VIS-n`, `PIX-n`, a prior bug's `PB-n`), and reports `unresulted`, `capped`, `unknownRefs` and `acsWithoutRow` |
| `lib/write-zones.mjs` | Steps 5 and 7: snapshots before the first wave and, at close, reports every changed file outside the `writes` zones of the artifacts that ran. A file outside is BLOCKED; no git scope is "not checked", never a clean pass. It has committed tests (`write-zones.test.mjs`) |
| `lib/rounds.mjs` | Round N (`count` · `delta` · `append` · `bundle` · `close`, method `skills/qa-test-strategy/rounds.md`). `count` decides the round before any context is read and STOPs a fourth one with its escalation; `delta` turns `prepare --since` into `delta.json` (which PRs moved, which analysts run, the prior bugs of every round, the out-of-scope bugs' status) and STOPs the same build; `append` writes `## Round N` without asking, a `PB-n` row per prior bug; `bundle` rebuilds round N's bundle (the delta read's text, the TICKET analyst's ACs); `close` writes the round's record `rounds/round-<N>.json` from `verdict.json` |
| `skills/ticket-context/lib/cli.mjs prepare <KEY> --since <record>` | Round N's delta read: each PR `unchanged`, `changed` (diffed from the recorded sha; a force-push reads the whole PR) or `new`, the comments posted after the round closed, whether the AC text changed, and each out-of-scope bug's status. Never cached, never composed into a bundle |
| `agents/change-map.md`, `lib/check-change-map.mjs` | Layer 0's agent: Read, Grep, Glob, no shell and no network. It returns the change map as its one JSON reply; `check-change-map.mjs --agent <id> --out <path> --bundle <bundle.json>` takes the JSON from the transcript of exactly that agent id, runs the schema and coverage checks, and saves it only when they pass: a reply that is not one JSON object, or a map that fails, is exit 2 and leaves no file at `--out` |
| `agents/checklist-writer.md`, `agents/verdict-writer.md` | The two writing agents of a run, with a narrow grant instead of a general-purpose brief: `checklist-writer` (Read, Grep, Glob, Write, Edit, Skill) writes the thin checklist; `verdict-writer` (Read, Write) writes the verdict. Only `change-map`, `checklist-writer` and `verdict-writer` take a `PLUGIN` input (the plugin's folder). A write outside the run's zones is still caught by `write-zones.mjs` |
| `lib/run-cost.mjs` | Tokens and minutes per step of a run, or of any session with `--session-file <path>` (the whole session without `--since`; older subagent layouts are counted, or named as not found, never silently omitted). `--budget qa\|dev` adds one line: the spend against `test.budget`, or against the defaults when the profile has none; a malformed `test.budget` keeps the table and prints `budget: not computed — <error>`. Reported, never a gate |
| `test.budget` (profile) | `qa` and `dev`, each `{ tokens, minutes }`, and an optional `windowTokens`; `/vc-test:init` writes it. `node lib/profile.mjs --budget-defaults` prints the defaults; how they are derived is in `lib/profile.mjs` (`BUDGET_BASELINE`, the measured VCST-6398 run, and `defaultBudget`). `/vc-test:init` refuses a value that is not a positive number. Each step runs on the model its definition declares (spec §8) |
| `commands/qa-goal.md` | `/vc-test:qa-goal <KEY> [<env>]`, goal-driven testing of a ticket the fixed pipeline cannot test (no ACs, a change in a component the ticket does not link, research before any test; preview). A thin command: the probe order, the close order and the S3 labels; the method is the skill |
| `skills/qa-goal/SKILL.md` | The method: the rails, steps 0–9, the stops S1 (contract), S2 (criteria and strategy, one approval) and S3 (each outward write), and the abort close. One mind researches and tests, the journal `goal.json` holds every result, an independent judge re-derives the verdict |
| `skills/qa-goal/goal-contract.md`, `research-loop.md`, `derived-acs.md` | The goal, done-criterion, budget, stop list and verdict shape; the research sources in order, the docs check, the hosts a run may touch and the knowledge write-back; deriving criteria with their sources, the strategy, recording a result and changing a criterion |
| `skills/qa-goal/recipes/oauth-code-flow.md` | A user's OAuth token obtained through a Playwright lane and used for calls as that user; the tokens stay in the run folder until `oauth-code.mjs purge` |
| `lib/goal.mjs`, `lib/goal.schema.json` | The run's journal `goal.json` and its only writer: `init` (resumes the newest unclosed run), `contract`, `checkpoint`, `ac`, `finding`, `strategy`, `replay`, `cost`, `judge`, `close`, and `check --before strategy`, `verdict`, `close` or `write`. It scrubs every string it stores and refuses a token shape (exit 2) |
| `lib/oauth-code.mjs` | The authorization-code + PKCE helper of the recipe (`start`, `redeem`, `refresh`, `mcp`, `http`, `purge`): `redeem` takes only the callback whose `state` this run issued; it never prints a token, a code or a verifier, and `purge` deletes `<run>/.tokens/` |
| `agents/goal-judge.md` | The independent judge of `/vc-test:qa-goal`: Read, Grep, Glob, Bash; re-derives the draft verdict from `goal.json` and the evidence and returns `VERDICT: APPROVE` or `REJECT` with reasons and fixes. Never edits a file |
| `lib/plan-run.mjs`, `score-scenarios.mjs`, `window.mjs`, `teardown.mjs`, … | The run's deterministic steps (P0); see each file's header |
| `briefs/` | One brief per brief-driven dispatch — `scenarios`, `strategy`, `ac-checks`, `scenario-run`, `bug-rerun` — and `ledger.md`, which every lane that may write reads beside its brief |
| `scripts/lib/` | The env loader, copied from vc-fix (`plugins/CLAUDE.md`: a plugin carries its own) |
