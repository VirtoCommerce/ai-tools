# `/vc-test:qa-goal` — goal-driven testing of a non-trivial ticket (design)

Status: draft for approval · 2026-11-13 · owner: QA · plugin: `vc-test` (distributed to clients)

## 1. Intent

Some tickets cannot be tested by a fixed pipeline: they have no acceptance criteria, the real change
lives in a component the ticket does not link, or the first hour is research, not testing. The trial
run of VCST-6032 (oNX MCP server, 2026-11-13) showed the shape that works for them:

1. agree a **goal** and a **checkable done-criterion** first;
2. **research** freely (ticket materials, PRs, adjacent repositories, knowledge base, read-only live
   probes) until the criteria can be written down;
3. **derive the acceptance criteria** with their source, and have a person approve them together
   with the strategy;
4. **test** with the freedom to re-plan when a finding opens a new branch;
5. an **independent judge** re-checks the result before the verdict is final.

That run found two Medium defects — one of them in a repository the ticket never linked — that a
route-by-ticket-type pipeline would not have looked at. `qa-goal` makes that way of working
repeatable, for this team and for client teams that install `vc-test`.

## 2. Goals, non-goals, anti-goals

**Goals**
- One command, `/vc-test:qa-goal <TICKET> [<env>]`, for a ticket a person judges non-trivial.
- Flexible order inside fixed guard rails: research and testing may alternate; the rails do not move.
- Every acceptance criterion ends with a result and evidence, or a GAP with a reason.
- An independent, read-only judge gives APPROVE / REJECT before the verdict is final.
- Works on a client project: Jira or Azure Boards, GitHub or Azure Repos, the client's own stands,
  accounts and knowledge store; nothing client-specific ever leaves the project.

**Non-goals**
- Replacing `/qa-test` (this repo) or `/vc-test:qa-ticket`. Modernising `/qa-test` is separate work.
- Writing regression suites, Playwright specs or test-data seeders.
- Filing bugs, posting tracker comments or changing ticket status by itself — each is a proposal the
  person approves (stop S3).

**Anti-goals** (would make it a failure even if it "works")
- Research that never ends, or a run that spends past its budget without stopping.
- A verdict written from memory rather than from recorded evidence.
- A judge that ratifies: one that reads the drafter's summary instead of the evidence.
- A client's names, data, hosts, code or credentials reaching the public knowledge base, a log the
  vendor reads, or a file outside the run's write zones.

## 3. Constraints (from the plugin and the repo)

- **Distributed plugin rules** (`plugins/CLAUDE.md`): no path into this repo's `.claude/`; working state
  under `outputRoot()`, never the plugin cache; tracker and code-host reads only through `$VC_RUN`, or the
  `fetch` agent on a host-governed project; depends on `vc-init` and `vc-fix` as `vc-test` already does.
- **Knowledge**: reads and writes go through `lib/knowledge-store.mjs` — project store first, platform
  store second; a client run never writes the platform store or the public `kb`. On the vendor's own
  platform project the `kb` MCP tools are used as today.
- **Writes to a stand** only where `/vc-test:init` declared the env `writable` (`lib/capabilities.mjs`);
  every created entity goes through `lib/ledger.mjs`, and close-out runs `lib/teardown.mjs`.
- **Write zones**: the run registers its files in `lib/artifacts.json`; `write-zones.mjs snapshot` at
  start and `check` at close; a file outside the zones makes the run BLOCKED.
- **Browser**: Playwright lanes only, passwords by NAME through the lane (vc-secrets bridge); no route
  interception, no `evaluate` beyond read-only (the project's real-user hook).
- **Budget**: the profile's `test.budget` through `run-cost.mjs --budget qa`.
- **Body budget**: each `SKILL.md` / command / agent ≤ 19,000 chars; detail goes to supporting files.
- **Tests**: NO CODE ⇒ NO UNIT TEST; a new script gets a temporary test, deleted before commit.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Instructions only — a skill and supporting files, the main agent does everything | Cheapest and most flexible, but nothing enforces "every criterion has a result" or "no write without approval" |
| **B** | **Instructions + one goal journal (`goal.json`) with a checker script; independent judge at the end** | Flexibility of A, plus a deterministic gate where a mistake is expensive; ~1 script + 1 schema + 1 agent |
| C | Orchestrator — a lead researches, specialists test each branch on their own lanes | Lean lead context and parallel branches, but splits research from testing — and the VCST-6032 findings came from one mind doing both |

**Chosen: B**, with the judge added at the end (the person's decision). Testing runs inline in the main
agent by default; a browser-heavy branch may be handed to a specialist on its own lane.

## 5. Design

### 5.1 Files (all under `plugins/vc-test/`)

| File | What |
|---|---|
| `commands/qa-goal.md` | the command: the steps and stops below, ≤ 19 k chars |
| `skills/qa-goal/SKILL.md` | the method, loaded by the command |
| `skills/qa-goal/goal-contract.md` | how to write a goal, a done-criterion, the stops and the budget |
| `skills/qa-goal/research-loop.md` | sources in order, read-only probes, when research is done |
| `skills/qa-goal/derived-acs.md` | deriving criteria without a ticket AC: provenance, discrimination |
| `skills/qa-goal/recipes/oauth-code-flow.md` | getting a user's OAuth token through a lane: the agent signs in on the lane, then hands over to `oauth-code.mjs`; no interception |
| `lib/oauth-code.mjs` | PKCE pair → authorize URL; after the lane sign-in, reads ONLY the redirect-URI entry carrying the run's `state` from the lane HAR, redeems the code, writes the token to `goal/<run-id>/.tokens/<persona>.json`; prints claims (aud, iss, sub name, permissions), never a token, code or password |
| `lib/goal.schema.json` | the journal's shape |
| `lib/goal.mjs` | the only writer and checker of `goal.json` |
| `agents/goal-judge.md` | the independent judge |
| `lib/artifacts.json` | gains the `qa-goal` entry and its `writes` — *superseded, see the note below* |
| `README.md` | file map updated; `plugin.json` minor bump + its `vc-test--v<version>` tag |

**Built differently (plan deviation, `docs/superpowers/plans/2026-11-13-qa-goal.md` §Global Constraints):**
`lib/artifacts.json` is unchanged — `write-zones.mjs` already allows `.vc-fix/**` through `orchestrator.writes`, and
an artifact entry without a strategy row would put `plan-run.mjs` at risk. A run lives under `.vc-fix/`
(`.vc-fix/vc-test/<KEY>/<env>/goal/<runId>/`), and `goal.mjs init` writes the `{"waves":[]}` run plan that
`write-zones.mjs check` reads.

### 5.2 The journal — `{RUN_DIR}/goal.json`

One file per run, written only by `goal.mjs` (agents never edit it by hand). It holds:

- `goal` (one sentence), `done` (the done-criterion), `budget` (from the profile, may be lowered),
  `stops` (the stop list below), `contractApproved` (`who`, `when`).
- `acs[]`: `id`, `text`, `source` (`ticket` · `material:<ref>` · `pr:<ref>` · `doc:<ref>` · `observed`),
  `addedAt` (`contract` · `research` · `during-test` with a reason), `status`
  (`open` · `PASS` · `FAIL` · `PARTIAL` · `GAP`), `evidence[]` (paths under the run folder, or a recorded
  command and its observed output digest), `gapReason`, `findings[]`.
- `findings[]`: `id`, `severity`, `title`, `ac`, `inScope`, `evidence[]`, `docCheck` (what source says it
  should not happen), `kbRef` (project-store or kb id, when recorded).
- `replays[]`: read-only commands the judge may re-run — HTTP GET/HEAD or an unauthenticated call with
  its expected status; never one that needs a token or changes data.
- `checkpoints[]`: each stop passed — `stop`, `decision`, `who`, `when`.
- `cost`: the last `run-cost` reading.

Never in the journal: tokens, codes, passwords, cookies, full response bodies (a digest and a path
instead). `goal.mjs` scrubs the project's secret values the way `knowledge-store.mjs` does.

`goal.mjs` subcommands: `init`, `contract --approve`, `ac add|set`, `finding add|set`, `replay add`,
`checkpoint`, `cost`, and `check --before strategy|write|verdict|close`. `check` prints one JSON object
and exits 0 clean · 2 blocked (names every failing rule) · 1 usage. Rules it enforces:

- **before strategy**: contract approved; at least one AC; every AC has a `source`.
- **before write** (a tracker post, a bug, a status change): the matching S3 checkpoint exists.
- **before verdict**: no AC `open`; every `GAP` has a reason; every `PASS`/`FAIL` has evidence;
  every finding has `severity` and evidence; budget state recorded.
- **before close**: judge verdict recorded; write-zones check run; teardown run or not needed.

### 5.3 The flow and its stops

0. **Probe** — profile, env (`writable` or read-only), lanes (`capabilities.mjs`), budget;
   `write-zones snapshot`; a missing plugin dependency ⇒ the same STOP-with-command `/vc-test:init` uses.
1. **Contract** — draft goal, done-criterion, budget, stops. **S1: the person approves** (or edits).
2. **Context** — `/vc-test:ticket-context` (its bundle, gaps and blockers as they are).
3. **Research loop** — `research-loop.md`: knowledge store / `kb` first, then materials and PRs, then
   adjacent repositories reachable through `$VC_RUN`, then read-only live probes, then source.
   Every claim about product behaviour is checked against the docs source before it is written
   (on the vendor project: VirtoOZ). Research ends when every planned AC has a source and a way to
   test it, or when the budget's research share is spent — then it says what is still unknown.
4. **Criteria + strategy** — derived ACs into the journal; the strategy as `goal.json.strategy[]` through
   `goal.mjs strategy set`, gated by `goal.mjs check --before strategy` (every AC covered by a risk) — no call into
   `/vc-test:qa-test-strategy` (§7). **S2: the person approves the criteria and the strategy together.**
5. **Test loop** — inline, on the approved strategy. A finding that opens a new branch adds an AC
   with `addedAt: during-test` and a reason; a branch outside the approved scope needs S2 again.
   Data created only on a `writable` env, through `ledger.mjs`.
6. **Triage** — inline, no triage skill (§7: no `/vc-test:qa-triage-results`): each Medium-or-worse finding
   is reproduced a second time on the spot and both runs are recorded; Low ones stay as noticed lines.
7. **Draft verdict** — written from `goal.json` only (`goal.mjs check --before verdict` first).
8. **Judge** — `goal-judge`, fresh (§5.4). REJECT ⇒ one fix round ⇒ judge again from scratch;
   a second REJECT ⇒ STOP, hand to a person with both verdicts.
9. **Close** — `write-zones check`, `teardown`, cost; knowledge written back through
   `knowledge-store.mjs` (or the `kb` tools on the vendor project).
   **S3: any outward write — tracker comment, bug, status — is proposed, and done only on a yes.**

Stops that fire at any time: budget reached; a write outside a `writable` env would be needed; live
behaviour contradicts the docs (a finding to confirm, never a silent expectation change); a blocker
from `ticket-context` (`NOT DEPLOYED`).

### 5.4 The judge — `agents/goal-judge.md`

- Fresh, read-only: `Read, Grep, Glob, Bash`. Bash only for `goal.mjs check --before verdict` and the
  journal's `replays[]`, exactly as recorded. No browser, no token, no write, no tracker.
- Inputs: the journal, the run folder, the draft verdict, the contract. **Never** the drafter's
  chat summary.
- Re-derives per AC: does the evidence show the result; is a PASS discriminating (would the wrong
  implementation have produced the same observation — a positive and a negative control where the
  claim is about permissions or access); is each finding reproducible from its evidence; is each GAP
  honest; does the draft verdict follow from the journal; is the done-criterion met.
- Returns `VERDICT: APPROVE|REJECT`, per-AC notes, `FIX`, `CONFIDENCE` — the `strategy-verifier` shape.
  When in doubt, REJECT. Its result is recorded in the journal and quoted in the final verdict.

### 5.5 Output

`{RUN_DIR}/verdict.md` (the `verdict-rules.md` §Shape, ≤ 60 lines) with the criteria table, findings,
not-covered, data touched, the judge's verdict and the cost; `goal.json` beside it. The run folder is
the ticket's run folder of the project (`paths.mjs`), per ticket and env.

## 6. Decided in this conversation

- A thin new skill in `vc-test`, not an extension of `/qa-test` or `/vc-test:qa-ticket`.
- Approach B (journal + checker), inline testing by default.
- An independent judge at the end.
- Shipped to clients as part of `vc-test`.
- The OAuth recipe is a script inside vc-test (option A); the agent never handles the HAR or the token.

## 7. My calls (correct any)

- **Invocation: explicit only.** `disable-model-invocation: true`. Deciding that a ticket is
  non-trivial is a person's call, and the run is expensive and has stops. `/vc-test:qa-ticket` may print a one-line hint
  ("looks like a ticket for `/vc-test:qa-goal`") when its context bundle has no ACs or names a component
  no PR touches; it never starts qa-goal itself. The same hint in this repo's `/qa-test` waits for its modernisation.
- Three human stops: S1 contract, S2 criteria + strategy, S3 each outward write. S1 is short, so the
  person can reject a bad framing before research is paid for.
- **No call into `/vc-test:qa-test-strategy`.** Its gate checks only the bundle's ACs, its Artifacts
  table schedules things qa-goal does not run (suites, visual lane, test model), and it asks its own
  approval. qa-goal writes its strategy as `goal.json.strategy[]` — risk · AC(s) it covers · technique ·
  oracle · account — and `goal.mjs check --before strategy` requires every AC to be covered by a risk.
  It reuses the plugin's knowledge files (`risk-prioritization-framework.md`, `test-design-techniques.md`,
  `security-abuse-cases.md`) only by reference. No shared code changes.
- **Own subfolder, not a round.** A qa-goal run writes under `{RUN_DIR}/goal/<run-id>/` (`goal.json`,
  `verdict.md`, `evidence/`, `judge.md`). It never touches `test-strategy.md`, `testing-checklist.md`,
  `verdict.md` or `rounds/` of the ticket's run folder, so it neither counts toward nor collides with
  `/vc-test:qa-ticket` rounds. `artifacts.json` gets a `qa-goal` entry whose `writes` is exactly that subfolder.
- **No `/vc-test:qa-triage-results`.** Its ticket mode reads only a `testing-checklist.md`. qa-goal tests
  inline, so a Medium-or-worse finding is reproduced a second time on the spot and both runs are recorded.
  The judge checks reproducibility from that evidence.
- **S3 hands over ready text, and files nothing by itself.** On a yes, a bug goes through `/vc-fix:qa-bug`;
  a tracker comment is given as paste-ready text; a status change is out of scope in v1, because no
  client-side write path for it exists.
- **Browser rules are instructions only in v1.** These are: no route interception, `evaluate` only to
  read. vc-test ships no `PreToolUse` hook today, and adding one touches every vc-test command. That is
  a separate change.
- **OAuth tokens (chosen by the person: option A, a script inside vc-test).** The agent never reads the
  lane HAR — it holds the sign-in POST body, password included (seen 2026-11-13). `oauth-code.mjs`
  owns the whole exchange: `start --persona <name> --client <id> --redirect <uri> --resource <uri>`
  prints the authorize URL; the agent drives the sign-in on the lane, closes the page so the HAR is
  written; `redeem --persona <name>` finds the one callback entry whose `state` it issued, redeems the
  code and stores the token. Tools that call an endpoint (`goal.mjs replay` is unauthenticated; an
  authenticated probe uses a small `call.mjs` or `oauth-code.mjs call`) take the persona, never the
  token. `.tokens/` is inside the run's write zone, gitignored with `.vc-fix/`, and deleted at close.
  A public client only; a confidential client secret is out of scope for v1. A route through the
  `$VC_RUN` bridge (token never reachable by the agent) is the later hardening.
- **Host-governed project:** the `fetch` agent answers only catalogued reads, so research outside the
  ticket's links (adjacent repositories) is a GAP with that reason, by design.
- The judge may replay only recorded read-only, unauthenticated commands; anything that needs a
  token or a browser is judged from recorded evidence alone.
- The draft verdict is written by the main agent from the journal, not by `verdict-writer`, whose
  inputs are `qa-ticket`'s files; the shape is shared through `verdict-rules.md`.

## 8. Left to the builder

The exact schema fields' names and enums, the `goal.mjs` internals, the wording of the stop
questions, the budget's research share default, and how the command trims to its body budget.
