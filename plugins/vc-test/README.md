# vc-test — preview

One testing flow for a Virto Commerce ticket ([spec](../../docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md)).
It gathers the ticket's context, maps the change, and scores scenarios that hunt significant bugs. You approve the
scenario list at one human point. Each scenario then gets its own agent, and one more agent proves the ACs in the
background. After that come triage, a Medium-only investigation, and a verdict that reports tokens and minutes
per step.

**Preview.** `/vc-test:ticket-context` and `/vc-test:qa-test-strategy` are this plugin's own code, but both still
read documents that live only in a checkout of `ai-tools`: `/vc-test:qa-test-strategy` its technique vocabulary, risk framework,
data rules and visual-axis floors (P2 moves them); `/vc-test:ticket-context` uses this repository's scripts (`deploy:pr`, `domain:check`, `regression:select`, …) where a project declares them, and records a named SKIP where it does not. It reads the tracker and the code host — Jira or Azure Boards, GitHub or Azure Repos, as `project-profile.json` names them — only through `$VC_RUN`, or, on a host-governed project, through the host's MCP servers: a `fetch` agent answers what
each `prepare` pass could not read, and the orchestrator never sees that content. `/vc-test:qa-ticket` also calls
triage and investigation from there (P2 moves them). `/vc-test:init` and the scripts below work in any project.

## Install

```
/plugin install vc-test@ai-tools        # pulls in vc-init (≥ 0.4.1) and vc-fix
/project-init                           # vc-init: the profile, tokens in vc-secrets, test accounts
/vc-test:init                           # vc-test: which envs a run may write to, the knowledge store
```

`vc-test` has its own dependencies: `dotenv` for the env loader it carries, and `@playwright/test` for `.spec`
runs in a project without its own Playwright. In an install, run `npm install --omit=dev --prefix <the plugin's
folder>` once; `/vc-test:init` says so when they are missing. A checkout of this repository already has them.

## What is here

| Path | Does |
|---|---|
| `commands/init.md` | `/vc-test:init`. Writes the profile's `test` block (environments, knowledge store, `test.routing`) through vc-init's `profile-set.mjs` and lists missing accounts with their `/project-init --add-user` command. It never asks for or writes a password |
| `skills/ticket-context/`, `agents/ticket-context-analyst.md` | `/vc-test:ticket-context`: one gated context bundle for one ticket |
| `agents/fetch.md`, `skills/ticket-context/lib/replay.mjs`, `fetch-catalog.json` | The host-governed route: `prepare --raw` answers each read from a raw folder and ends `needs-fetch` with the reads it lacks; the `fetch` agent answers them through the host's servers (read tools only), shaped as the catalog says the bridge would print. A read the servers have no tool for is a gap, never a guess |
| `skills/qa-test-strategy/`, `agents/strategy-verifier.md` | `/vc-test:qa-test-strategy`: the floors, the gate, and an independent read-only verifier on a Critical risk |
| `commands/qa-ticket.md` | `/vc-test:qa-ticket <KEY> [<env>] [--yes] [--dry-run]`, the QA run (preview) |
| `lib/profile.mjs` | The read-only profile loader. A missing profile is a STOP ("run /project-init"), never a default |
| `lib/capabilities.mjs` | What this install can do: connectors, stand URLs, MCP servers, the knowledge store, the project's scripts. A stand is writable only by declaration (`test.environments`) and only when `BACK_URL` is the declared stand |
| `lib/deployed.mjs` | F6. It reads module, platform and theme versions from the stand. Run it as `node "$VC_RUN" runner plugin deployed --key <KEY>`, because it needs the admin login. A side it cannot read is UNKNOWN, never "not deployed"; a module the stand has not installed, or disabled on a load error, is never DEPLOYED. No step runs it with `--expect` yet, so on a project without `deploy:pr` F6 produces no `NOT DEPLOYED` line (every PR is DEPLOYMENT UNKNOWN); the producer is deferred to P2 |
| `lib/knowledge-store.mjs` | The one reader and writer of project and platform knowledge. A client project never writes to the platform store, text is scrubbed, and nothing lands outside the store. It has committed tests (`knowledge-store.test.mjs`) |
| `harness/playwright.config.mjs` | The config vc-init's runner runs `.spec` files under. `testDir` is the project |
| `lib/route.mjs` | Step 0: a ticket's type × status role → the job (`test`, `verify-fix`, `hotfix-check`), or `unresolved` (exit 4) so the command asks. A status reaches a role only through the profile's `test.routing` (or Azure's `roleStates`), never by name in code; a Sub-task is decided by the connector's `issuetype.subtask`, not its name |
| `lib/trace.mjs` | Step 7: fills the last round's Reconciliation table from the checklist's result rows (`C-n`, `SC-n.m`, `VIS-n`, `PIX-n`, a prior bug's `PB-n`), and reports `unresulted`, `capped`, `unknownRefs` and `acsWithoutRow` |
| `lib/write-zones.mjs` | Steps 5 and 7: snapshots before the first wave and, at close, reports every changed file outside the `writes` zones of the artifacts that ran. A file outside is BLOCKED; no git scope is "not checked", never a clean pass. It has committed tests (`write-zones.test.mjs`) |
| `lib/rounds.mjs` | Round N (`count` · `delta` · `append` · `bundle` · `close`, method `skills/qa-test-strategy/rounds.md`). `count` decides the round before any context is read and STOPs a fourth one with its escalation; `delta` turns `prepare --since` into `delta.json` (which PRs moved, which analysts run, the prior bugs of every round, the out-of-scope bugs' status) and STOPs the same build; `append` writes `## Round N` without asking, a `PB-n` row per prior bug; `bundle` rebuilds round N's bundle (the delta read's text, the TICKET analyst's ACs); `close` writes the round's record `rounds/round-<N>.json` from `verdict.json` |
| `skills/ticket-context/lib/cli.mjs prepare <KEY> --since <record>` | Round N's delta read: each PR `unchanged`, `changed` (diffed from the recorded sha; a force-push reads the whole PR) or `new`, the comments posted after the round closed, whether the AC text changed, and each out-of-scope bug's status. Never cached, never composed into a bundle |
| `agents/change-map.md`, `lib/check-change-map.mjs` | Layer 0's agent: Read, Grep, Glob, no shell and no network. It returns the change map as its one JSON reply; `check-change-map.mjs --agent <id> --out <path> --bundle <bundle.json>` takes the JSON from the transcript of exactly that agent id, runs the schema and coverage checks, and saves it only when they pass: a reply that is not one JSON object, or a map that fails, is exit 2 and leaves no file at `--out` |
| `agents/checklist-writer.md`, `agents/verdict-writer.md` | The two writing agents of a run, with a narrow grant instead of a general-purpose brief: `checklist-writer` (Read, Grep, Glob, Write, Edit, Skill) writes the thin checklist; `verdict-writer` (Read, Write) writes the verdict. Only `change-map`, `checklist-writer` and `verdict-writer` take a `PLUGIN` input (the plugin's folder). A write outside the run's zones is still caught by `write-zones.mjs` |
| `lib/run-cost.mjs` | Tokens and minutes per step of a run, or of any session with `--session-file <path>` (the whole session without `--since`; older subagent layouts are counted, or named as not found, never silently omitted). `--budget qa\|dev` adds one line: the spend against `test.budget`, or against the defaults when the profile has none; a malformed `test.budget` keeps the table and prints `budget: not computed — <error>`. Reported, never a gate |
| `test.budget` (profile) | `qa` and `dev`, each `{ tokens, minutes }`, and an optional `windowTokens`; `/vc-test:init` writes it. `node lib/profile.mjs --budget-defaults` prints the defaults; how they are derived is in `lib/profile.mjs` (`BUDGET_BASELINE`, the measured VCST-6398 run, and `defaultBudget`). `/vc-test:init` refuses a value that is not a positive number. Each step runs on the model its definition declares (spec §8) |
| `lib/plan-run.mjs`, `score-scenarios.mjs`, `window.mjs`, `teardown.mjs`, … | The run's deterministic steps (P0); see each file's header |
| `briefs/` | One brief per brief-driven dispatch — `scenarios`, `strategy`, `ac-checks`, `scenario-run`, `bug-rerun` — and `ledger.md`, which every lane that may write reads beside its brief |
| `scripts/lib/` | The env loader, copied from vc-fix (`plugins/CLAUDE.md`: a plugin carries its own) |
