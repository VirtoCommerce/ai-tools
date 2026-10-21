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
>
> **Updated 2026-10-21 from the developers' trial of `/qa-test-fast`** and a measurement of four real runs (§2b):
> a run was too expensive for what it found. U24–U34 make it lighter, cheaper and aimed at significant bugs;
> U15 (rounds) and U18 (new cases) are revised; B1–B7, and B8–B12 from the review, are the author's calls, open to correction. §3, §4, §4.1, §5.1, §8, §9, §10 and §12 follow.
>
> **Updated 2026-10-21 (second pass) from the developers' chat** and a fifth, much larger run (VCST-6314, §2b):
> checks are layered from cheap to expensive, starting with a review of the diff (layer 0), every run has a
> budget, and developers get their own command. U35–U55 are the owner's (U43–U46 place the strategy, the maps and
> the data model in the layers; U47–U49 keep the run aimed at significant bugs); U31 is revised by U35. §3a describes the
> developer command; §2b and §13 follow.

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
| U10 | Committed tests | An exception like `plugins/vc-secrets/`: the knowledge-store write router and the write-zone check get **committed** tests; everything else follows the repository rule (temporary tests, deleted before commit) |
| U11 | Where the run asks a human | **Two points only.** *Before execution*: approve the strategy (and, on the same build, re-run or reuse). *After the verdict*: `qa-bug` runs for each confirmed bug — from its investigation's output, U50 — and asks its own "create a tracker ticket?" question (`qa-bug` is used as it is), then the run asks once whether to post the tracker comment. Nothing asks between the two points; `--yes` answers only the first |
| U12 | How much of the bundle the strategy reads | **The whole bundle**, so nothing is missed; the token cost is accepted |
| U13 | Who writes the checklist | **Revised 2026-10-21 (O2): a new narrow agent**, not the orchestrator. The checklist stays, but thin: one row per AC and per strategy risk, naming its proof — a `.spec` or API check id, the exploratory charter, or a `ui-checks` item — so `trace.mjs` and the verdict can show AC → proof. The agent's brief is file paths only (strategy, `change-map.json`); it writes the checklist and then the `.spec` and API checks its rows name. The developer command has no checklist: the change map is its plan (U45). *(Was:)* **The orchestrator, inline** — it already holds the bundle and the strategy, and a subagent would need them retold |
| U14 | `qa-triage-results` cannot be called by the Skill tool (`disable-model-invocation: true`) | **Remove the flag** in the plugin's canonical copy |
| U15 | Round N ≥ 2 | **Revised 2026-10-21: a refresh, not a re-run** (§3). Nothing round 1 built is rebuilt — no `/ticket-context`, no new strategy, no test model or maps. The round fetches only what changed, re-runs every prior bug's reproduction (`FIXED` / `NOT FIXED`), checks what sits next to the fix and finishes what was left unresulted. Anything new in the ticket is **appended** to the strategy without asking, and human point 1 is skipped. *(Was: a delta strategy built anew each round.)* |
| U16 | May the run create or change data on the stand? | **Yes, only on a non-production stand** the profile declares as such and the probe matches; otherwise the run is read-only and every item that needs a write is BLOCKED with that reason. Everything created is deleted by ledger id |
| U17 | Test-data building in v1 | **The whole family moves into the plugin in v1, refactored** (owner, revising "seeders as an adapter"): `qa-test-data-model`, `qa-generate-data`, `qa-seed-data` (skill + command), the `test-data-engineer` agent and the seeding engine become the plugin's canonical copies and work on a client's project too. This repository's domain seeders and fixtures stay here as the platform project's **content**, as a client's live in the client's project. The refactor makes the family lighter, adapted to any project and flexible (§6a) |
| U18 | Write new test cases, and run them? | **Revised 2026-10-21 (U27):** a new case is a passing scripted check kept as a `.spec` file — it already ran in the run, so there is **no separate new-case wave**. The `test-management-specialist` still writes the case's CSV row (description, `Catches:`), linked to its `.spec` by case id. The `.spec` suite sits next to the CSV suite; its layout and the CSV↔`.spec` sync rule come from the separate suites-reorganization design. *(Was:)* **Yes — after the verdict, then one run of the new cases only** (owner, revising redesign D2 for this flow). The single author is the **`test-management-specialist` agent** (fresh context, Sonnet; its brief is file paths — checklist with results and evidence, strategy, bug reports — so nothing is retold, and the orchestrator never writes the corpus): cases from the passing checklist items and from every bug's reproduction (`Catches:` that bug). One wave runs only the new cases. A new case that fails is a defect **of the case** — fixed or marked, never a change to the verdict, which was decided on the checklist. Cases land in the project's agent-native corpus; a client's own suites (Playwright, TestRail, …) are untouched |

**Adaptation to VCST-6402 (owner, 2026-10-21).**

| # | Question | Decision |
|---|---|---|
| U19 | What does `vc-test` depend on? | **`vc-init` and `vc-fix`** (`vc-secrets` comes in through `vc-init`). `vc-init` owns `/project-init`, `project-profile.json` (schema 3) and `$VC_RUN`; `vc-fix` keeps `qa-bug`, `qa-checklist`, `qa-investigate` and the `qa-*-expert` agents. No profile ⇒ STOP "run /project-init", like `vc-fix` and `vc-perf`; the silent native-platform defaults are gone |
| U20 | How does a connector get its token? | **Only through `$VC_RUN`.** No connector reads `JIRA_API_TOKEN`, `GIT_TOKEN` or an `authEnv` variable from the environment. The bridge hands a process one group's secret, so the tracker fetch and the host fetch are **two bridge calls** (`jira` or `ado`; `gh` or `ado`), each writing its raw responses to a file the bundle step reads. A session login (`gh auth login`, `az login`, Atlassian OAuth) is used where the project declared no PAT task, as the bridge already does. One GitHub read the bridge refuses today, the review-thread count, needs a narrow allowlist change (B8) |
| U21 | What does `/vc-test:init` own? | **Only `vc-test`'s own settings**, written through `vc-init`'s `profile-set.mjs --merge 'test=…'`: which environments are non-production (U16) and the knowledge-store path (§6). Test accounts and their passwords are `vc-init`'s: `/project-init --add-user` / `--add-env`, the password in `vc-secrets` or `.env.local` as the operator chose there. `/vc-test:init` checks that every role the flow needs has an account and points to `--add-user` for a missing one; it never writes a password |
| U22 | A host-governed project (`governance.host` set) | The bridge refuses every token-bearing tool there, and `governance.stand.writable` is `false`. `vc-test` honours both: the stand is read-only whatever `/vc-test:init` declared, and the connectors go through the host's servers (U23) |
| U23 | How does the context step read the tracker and the code host there? | **In v1, through the host's MCP servers, by the orchestrator.** A script cannot call an MCP tool, so the orchestrator replaces the two bridge fetches of §7: it reads the issue and the PRs through the servers the profile maps (`governance.servers.tracker`, `governance.servers.codeHost`) and writes **the same raw files**, in the same schema, that the bridge route writes. The bundle step and everything after it do not know which route ran. The orchestrator dispatches the fetch; a fresh fetch agent does it, so the raw responses never enter the orchestrator's context (B9) |

**Lighter, cheaper, aimed at significant bugs (owner, 2026-10-21).** Grounded in the developers' feedback and
the measurement in §2b.

| # | Question | Decision |
|---|---|---|
| U24 | What is a run for? | **Significant bugs, and evidence that the ACs hold.** A significant bug is Medium or worse — access and permissions, money, data loss or leak, a wrong order state, a broken buyer path — wherever the run meets it. A long list of cosmetics is not the goal |
| U25 | Which findings get work? | **Filtered by severity, not by scope.** A Low or cosmetic finding (an a11y nit, copy, spacing) gets one line under "Noticed": no investigation, no screenshot, no bug. A ticket-related Low keeps its reproduction and is offered to `qa-bug`. Medium or worse is investigated and offered to `qa-bug` **even outside the ticket's diff** — every Medium in the measured runs was outside it (§2b) |
| U26 | Where does the browser time go? | **Exploratory is the main browser lane.** Its charter comes from the strategy and points at U24's kinds of failure on the touched surfaces and their neighbours. It always includes an access probe: each touched endpoint is called as an anonymous user and as another user (U33) |
| U27 | How are the ACs proved? | **Cheapest proof first, no browser agent driving the checklist.** Each checklist item is decided by an API/GraphQL check or a Playwright `.spec` script, run by a short-lived agent. A browser agent takes only the items a script cannot decide (a visual judgement), in the `ui-checks` lane. A passing script is kept as the item's `.spec` — the new case (U18) |
| U28 | Evidence | **On failure only.** Screenshots are taken, and the recorded HAR is read, attached and cited, for a FAIL and for a Medium-or-worse finding. A PASS keeps the script's output or a text snapshot. The lanes keep recording HAR (B5); no video is recorded (removed from the lane configs 2026-09-21). A `ui-checks` or visual item the tracker comment cites as a UI claim keeps the screenshot that decided it (B12) |
| U29 | What gets an investigation? | **Medium or worse only.** Triage deduplicates first. A Low gets no investigate agent |
| U30 | The cost shape | **Short agents with a narrow start.** The brief is file paths plus only the skill its step needs. Tool calls are batched, and no agent outlives its one job. The verdict, summary, comment and page are written by a fresh small-context agent, not by the orchestrator. `verdict.md` reports tokens and active minutes per step, read from the session log by a plugin script (`lib/run-cost.mjs`) — the before/after number, with no separate tool to run |
| U31 | One command or a light one for developers? | **Revised 2026-10-21 by U35: a separate developer command on the same engine.** *(Was:)* **One command, depth by risk.** A simple ticket is fast because its strategy selects little, not because someone picked a lighter mode. QA and developers run the same command and find the same bugs |
| U32 | How do `.spec` scripts and API checks get test-user passwords? | **A new `$VC_RUN` bridge tool in `vc-init`** runs `playwright test` and the node check scripts with the run's test-user passwords, as `bridge/playwright-mcp.mjs` does for the browser lanes. A role kept only in `vc-secrets` is therefore usable by a script. The same tool runs the seeding engine, which settles §6a's open choice. It is the first bridge tool that runs code no plugin ships, so it carries the constraints of B10 |
| U33 | Which accounts does the access probe (U26) use? | **Accounts created on the fly.** The "other user" (and the other organization it belongs to) is created right before the probe as an `AGENT-TEST-` entity and deleted by ledger id at teardown. No second account per role is registered in advance. Creating them is a write, so it needs a writable stand (U16); on a stand that is not writable the cross-user probe is BLOCKED with that reason, and the anonymous probe still runs |
| U34 | When has P3 passed on cost? | **At most 50% of the §2b baseline on a comparable ticket**, and every Medium the baseline found on VCST-6398 is found again. The baseline is the per-run total `run-cost.mjs` measures on the §2b sessions (B11) |

**Layered checks, a budget per run, and a developer command (owner, 2026-10-21, second pass).** Grounded in the
developers' chat: VCST-6314 ran past the five-hour limit twice, a developer rated `/qa-test-fast` 1 of 5 ("a plain
review would find the same in minutes", "I fix what I find, I do not want it published", 5,000+ changed files in
the working tree), and the goal of a run is to make sure there are no significant bugs, not to hunt for bugs.

| # | Question | Decision |
|---|---|---|
| U35 | One command or a separate one for developers? | **A separate developer command** (`/vc-test:dev-check`, working name) on the same engine — the same layers, agents and scripts. Its posture differs (§3a): the input is the local diff of the branch (`git diff <base>...HEAD`), a ticket key is optional and only supplies the ACs; no tracker, kb, page or corpus write, and no human point; everything it writes lands outside the working repository |
| U36 | How is a run layered? | **Cheapest first; each layer runs only for the risks the previous one left uncovered.** 0 — review of the diff (U37). 1 — scripted proof: an existing unit test, an API/GraphQL check, a `.spec` (U27). 2 — exploratory in a browser, only for hotspots in a significant zone (U39). 3 — investigation and bug report, Medium or worse only (U29). **Stop rule:** when every hotspot is covered by layers 0–1 and none is in a significant zone, layer 2 does not run and the run ends — **in the developer command only; the QA command keeps an exploratory floor (U47)** |
| U37 | What is layer 0? | **A change map, not a code review.** One short agent reads only the diff and the ACs and writes `change-map.json`: (a) AC ↔ code — the lines that implement each AC; an AC with no code is a FAIL candidate decided without a browser, code with no AC is hidden behaviour to check; (b) hotspots — changed lines with a testable consequence, in the hotspot format of `/ticket-context` CHANGE, each with the cheapest proof that can decide it; (c) a significant-zone tag per hotspot (U39); (d) suspicions from the code — a wrong condition, a missing permission check, a null path — each with its line, a hypothesis that a layer-1 check confirms or refutes, never a bug by itself. In the QA command it runs after the context step and feeds the strategy; on a PR it reuses the CHANGE analysis instead of reading the diff again. It is not `review-pr-virto`, whose subject is NuGet surface compatibility |
| U38 | How much may a run spend? | **A budget set before the run, as a share of the five-hour usage window:** the developer command **15–20%** (layer 0 ≤ 3%, layer 1 ≤ 7%, the rest for layers 2–3), the QA command **50%**. The strategy (QA) or the change map (developer) plans inside it. A QA plan over budget is shown at human point 1 with what it would drop; the developer command, which asks nothing, runs what fits and lists the risks it did not run. U34's relative criterion stays for P3 |
| U39 | What is significant? | **Medium or worse** (U24, U25): access and permissions, money, data loss or leak, a wrong order state, a broken buyer path. Only a hotspot tagged with one of these zones is eligible for layer 2 |
| U40 | Where do the developer command's new cases go? | **Into the run folder, not the corpus.** A passing `.spec` is kept in the run folder with a draft CSV row; QA moves it into the corpus (the `test-management-specialist`, U18), after the fidelity review (U55). The developer command never writes to the corpus or to the developer's working tree |
| U41 | When does the developer see the suspicions from layer 0? | **At once, before layer 1 starts**, labelled *suspected*, with file and line — a developer acts on them while the checks run. The final list marks each one confirmed (with its check) or refuted |
| U42 | One measure of cost | `run-cost.mjs` (U30) reports, per step and per run, **input-equivalent tokens and the share of the five-hour window**. The two numbers quoted in the chat (3.42B against 2.46M) were different measures — every turn's re-read against an agent's final context — and must not be compared again |
| U43 | May a run build or update a domain map, a mind map or the data model? | **No — in a run they are only read.** Updating them is a separate job (`/qa-domain-map`, `/qa-test-mind-map`, `/qa-test-data-model`, after a merge or once a sprint). `mind-map` leaves wave 1 and the registry (§4.1, §5.1). A domain with no map is tested from the diff alone, and the verdict says the map was missing; the run does not build it (VCST-6314 spent 2.5% doing that) |
| U44 | What does layer 0 take from the maps? | **The change map links every hotspot to a mind-map node and to a data profile.** The node gives the neighbours of the change — where the exploratory charter goes (U26) — and the significant zone (U39), taken from the node rather than guessed from code. The data profile from the data model names the state a layer-1 or layer-2 check needs, so the seeder prepares exactly that state (FIFTH RULE still decides seed versus create-in-case). With no map or model, the link is empty and the hotspot falls back to the diff |
| U45 | Where does the strategy sit? | **In the QA command only, with the change map as an input** next to the bundle. Per risk it chooses the layer that proves it — a script (layer 1) or exploratory (layer 2) — inside the 50% budget (U38). The developer command has no strategy: the change map is its plan (§3a) |
| U46 | When is a test model built? | **Only when the strategy selects it** — a large or Critical ticket. For other tickets the change map covers the fault model's role; a light strategy already skips it (§8) |
| U47 | May the QA command skip exploratory? | **No.** Every Medium in the measured runs came from outside the diff (§2b), so a stop rule keyed on the diff would cut exactly the lane that found them, and the mind-map neighbours (U44) help only where a map exists. The QA command always runs a short exploratory charter on the significant zones (U39) of the touched domain, inside its 50% budget; the stop rule (U36) applies to the developer command only |
| U48 | When has P3 passed on finding bugs? | **The run re-finds known significant bugs.** P3 re-runs tickets whose Medium-or-worse bugs were already found (VCST-6398 with VCST-6452, 6453, 6454). A run that misses one fails P3 even inside its budget — cost alone never passes P3 |
| U49 | Do the expensive layers earn their cost? | **Measured against a plain review.** On the same P3 tickets a control run asks only "review the change and check the ACs", and `run-cost.mjs` measures it the same way (U42). If the layered run finds no more significant bugs than the control, layers 2–3 do not earn their cost and the design is revisited before P4 |
| U50 | How is a bug report written? (O3) | **From the investigation's output, with no second investigation, and only for Medium or worse.** `qa-bug` takes the investigation file (reproduction, evidence, root-cause hypothesis) as its input and writes the report from it; it does not reproduce or investigate again. A Low gets no report (U25) — except a ticket-related Low, which keeps its reproduction and is offered to `qa-bug` the same way. Its own "create a tracker ticket?" question stays (U11). VCST-6314 spent 12.9% of the run on `qa-bug` after 27.5% on investigations |
| U51 | How long may the developer command take? | **At most 1–1.5 h of wall clock**, from start to the final list, on a typical ticket. `run-cost.mjs` reports wall clock and active minutes per layer next to tokens and window share (U42). P3 measures both commands on tickets of different sizes — a small fix, a component change, a large multi-PR ticket — and records the times in §2b; a developer run over 1.5 h on a typical ticket fails P3 like a run over budget. For reference: the developer's `/qa-test-fast` run in the chat took about an hour, VCST-6314 took 11 h 34 |
| U52 | When does the developer hear about a problem? | **The moment it is found, not at the end.** Every blocker and every confirmed problem is reported to the developer as soon as it is known, in any layer: a failed AC check, a confirmed suspicion, a Medium-or-worse finding, and a run blocker (stand down, no access, missing account or data). Each report names the file and line where known, the reproduction, and the `.spec` or check that shows it, so the developer can fix it locally and re-run. Extends U41, which covered layer 0's suspicions only |
| U53 | Who runs a kept `.spec` after its run? | **It is the base of the future regression.** A kept `.spec` caught its bug once; unrun, it stays silent at the next break. Running the kept `.spec` set regularly — on a module change, nightly or in CI — is an obligation of this design, specified in the suites-reorganization design ([spec](2026-10-21-suites-reorg-design.md), PR #500) (its M4 CI phase) together with the layout (B1), and it is the regression that replaces the one U7 takes out. Until that design lands, the kept `.spec` are still run by U54 and by a re-run (B15) |
| U54 | Can a person run a kept `.spec` without a full run? | **Yes, in v1: `/vc-test:spec` (working name)** runs one kept `.spec`, a list of them or a folder — from the corpus or a run folder — locally, through U32's bridge tool with the current environment's test-user passwords, under the same constraints (B10). It prints pass/fail per `.spec` with the failure's output; no tracker or kb write, no browser agent, no LLM work beyond starting it. A developer re-checks a case, QA re-checks a moved one |
| U55 | How does vc-test meet the suites-reorganization design (PR #500)? | **Two reconciliations (owner, 2026-10-21).** (1) **Who writes the `.spec`:** in a vc-test run, the narrow agent that writes the thin checklist (U13 revised) writes the `.spec` and the runner rows, and the `test-management-specialist` writes only the CSV rows (U18). The specialist keeps writing specs in this repository's regression work outside a run (D11). Both load the same `/qa-test-automation` skill, so a spec is written by one set of rules. (2) **How a `.spec` comes about:** written directly from source and the generated selectors and run headless at once (U27, B4); recording Playwright code from an MCP browser pass (PR #500 §8) is the fallback when selectors cannot be found that way, not the default — the default path has no browser agent per checklist item. The design's fidelity review (D17) applies: a kept `.spec` replaces the agent in a regression only after it. For the developer command it happens when QA moves the `.spec` into the corpus (U40) |

**Calls made while writing U24–U31 (the author's, not the owner's — correct any that is wrong).**

| # | Gap | Call |
|---|---|---|
| B1 | The `.spec` layout and the CSV ↔ `.spec` link | **Settled by the suites-reorganization design ([spec](2026-10-21-suites-reorg-design.md), PR #500):** a folder named after the CSV stem beside it, one `<CASE-ID>.spec.ts` per case (D5); the link is the case ID, nothing written into the CSV (D6); a passed API check is a runner-grammar CSV row, not a spec (D12); test data only through `regression/lib/data.ts`, passwords only through its auth fixtures. A kept `.spec` runs with the project's own `@playwright/test` when the project has one, else with the plugin's. The harness lives in this repository first and is copied into the plugin in its M3 (D14), with the fixtures moved onto U32's bridge tool instead of `.env.local` |
| B2 | Which prior bugs a round N ≥ 2 re-runs | Only the ticket's own bugs. Out-of-scope and pre-existing bugs have their own tickets: the verdict lists their current status, but they are not re-run and never fail the round — the same rule as today's close-out |
| B3 | Round 1's `bundle.json` is swept after 24 h, and round N needs it | At round 1's close the bundle is copied into the ticket's report folder. Round N's new material is read by the same read-only, scrubbed analysts, scoped to the delta: CHANGE for new commits and PRs, TICKET for new comments. The orchestrator never reads a raw diff inline (§8) |
| B4 | Writing a `.spec` without a browser | The author first uses source and the generated selector surface. Only when those are not enough does it borrow a browser lane, which then counts toward the ≤3 limit. A headless `.spec` run is not an MCP lane and does not count; `ac-checks` runs them one at a time |
| B5 | U28 against `CLAUDE.md` "Always capture HAR" | No conflict: the lanes keep recording HAR, which costs no tokens. U28 governs what is read, attached and cited, and when screenshots are taken: only for a FAIL or a Medium-or-worse finding. `CLAUDE.md` does not change |
| B6 | Where the verdict rules live after P4, and how Medium/Low map to them | The verdict table moves from `.claude/skills/qa-test/close-out.md` into the plugin with today's meaning. An in-scope Critical or High bug is a FAIL; an in-scope Medium is PASS WITH NOTES; an out-of-scope bug never fails the ticket |
| B7 | May the access probe call a mutation? | Only on a writable stand (U16), where its accounts are created anyway (U33). On a stand that is not writable it calls queries and reads only, and lists every mutation it skipped |

**Calls made in review (2026-10-21, the author's, not the owner's — correct any that is wrong).** Each closes a
gap the review of this spec found between a decision above and the code on `main`.

| # | Gap | Call |
|---|---|---|
| B8 | `/ticket-context` counts unresolved review threads through GitHub GraphQL (`lib/github.mjs` `unresolvedThreads`). The bridge refuses `gh api graphql` and every POST (`bridge/allowlist.mjs`), and `gh pr view --json` has no review-thread field, so U20's host fetch cannot read it as the allowlist stands | A narrow `vc-init` allowlist change, part of its P1 bump: `gh api graphql` is admitted only when its `query` field is byte-equal to one of a pinned set of read queries shipped in `vc-init` (v1: the one `reviewThreads { isResolved }` query) and its other fields are that query's variables. Any other document, a mutation, `--input` or a header stays refused; committed allowlist tests cover it. If this is refused, the count is a `gap` on the bridge route and the VCST-5097 regression check excludes that one field |
| B9 | U23 has the orchestrator read raw ticket and PR content, client diffs included, before the scrub and the `embedded_instructions[]` screening — against §8 and B3 | The orchestrator dispatches a **fresh fetch agent** whose tools are the read tools of the two mapped servers plus Write into the raw folder. Its brief is a fixed list of reads; it returns the file paths and, per raw field, present or missing — never content. The bundle step scrubs the raw files before any analyst reads them, as on the bridge route, and the orchestrator never reads them. The fetch agent acts on nothing it reads: it has no tool that writes anywhere else |
| B10 | U32's tool runs agent-written `.spec` files, the project's Playwright config and node scripts while holding passwords — what `bridge/allowlist.mjs` exists to refuse ("runs code the caller chooses") | The tool gets its own group, holding only the current environment's **test-user passwords**, never a tracker or host token (`toolInGroup` keeps the other groups out), and only for an environment the profile's `test` block lists. Its argv is fixed: `playwright test` with the plugin's pinned config, or `node <script>`, on files under the run's folder or the project's corpus path only — no `-e`, `--require`, `--import`, `NODE_OPTIONS` or other config. Its stdout and stderr go through `redact.mjs` with the password values. Residual risk, accepted: a script can read its own environment. The secret is a non-production test-user password an MCP lane can already type, never a token. Committed bridge tests cover every refusal |
| B11 | U34's 50% needs a per-run total, and §2b gives only per-agent ranges and shares | In P2, `run-cost.mjs` is run on the four §2b sessions' transcripts and their per-run totals (tokens, active minutes) are written into §2b. U34 compares against the comparable run: VCST-6398 for a large ticket, VCST-5903 R1 for a component ticket. Until those totals are written, U34 cannot be checked |
| B12 | U28 against `.claude/rules/reports.md` §5.0: a tracker comment that makes a UI claim carries its screenshots inline | No conflict once the claim is named for what decided it. An `ac-checks` PASS is an API or script claim, and the comment states it so ("the `.spec` asserted …"), with no screenshot. A `ui-checks` or visual item is decided by a look, keeps the screenshot that decided it, and the comment embeds it per §5.0. `reports.md` does not change |
| B13 | How U51's 1.5 h splits across the developer command's layers | Layer 0 ≤ 10 min, so the suspicions (U41) reach the developer early; layer 1 ≤ 30 min; layers 2–3 the rest. The measured 14–31 min before the first browser check (§2b) must shrink to layer 0's 10 min. P3's measurements correct the split |
| B14 | Does the developer command go on after a blocker? | **It stops the layers that depend on it.** A run blocker stops the run; a failed AC or a High/Critical finding stops layers 2–3 for that area — the developer will fix and re-run anyway, so testing on top of a known break spends budget for nothing. Independent areas continue. `--keep-going` overrides the stop |
| B15 | What does a re-run after a fix do? | **It is incremental, like a round N ≥ 2 (U15).** It reads the previous run's `change-map.json` and results from the run folder, maps only the diff since that run, re-runs first the checks that failed (by their `.spec`), then the checks whose code changed; a check that passed on unchanged code is not re-run. A re-run must cost a fraction of the first run |

### 2b. Measurement behind U24–U31 (2026-10-21)

Four real `/qa-test-fast` runs: VCST-5903 rounds 1 and 2, VCST-6398 and VCST-2945. VCST-2945 ran the older
command shape and serves as a contrast. Tokens come from the session transcripts, deduplicated per message, and
include every subagent. "Share" is a share of input-equivalent units, not of billing. Per-run totals, which U34
needs, are not recorded here yet; `run-cost.mjs` measures them in P2 (B11).

| Finding | Numbers | Answered by |
|---|---|---|
| Cost is the context re-read on every turn, not the work | every agent starts at 77–110k tokens and lives 100–500 turns at 190–330k; only 27–34% of turns batch tool calls; output is 2–4% of cost | U30 |
| Regression bought nothing about the change | 28.5% (5903 R1) and 45.9% (6398) of a run; 0 failures caused by the change; the rest were old bugs and stale cases | U7 |
| Checklist lanes buy PASS evidence, rarely bugs | 0 bugs for 13% of 6398; 0 new bugs for ~50% of 2945; 2 Lows for 9% of 5903 R1 | U27 |
| Exploratory and visual find the bugs | exploratory found 6 of 11 filed bugs; visual found the one Medium a11y bug | U26 |
| Every Medium came from outside the diff; the change's own defects were Low | Mediums: VCST-6452, 6453, 6454 (and 6094 re-confirmed); ticket defects: 6427, 6428, 6448, 6449, 6098 | U24, U25 |
| Investigations are expensive and often end in a question | ~1.1M units each; 11 investigations confirmed 6 bugs in 6398; 2 of 4 ended as questions in 5903 R1 | U29 |
| Writing happens at peak context | the verdict, bugs and page are written by the orchestrator at 300–400k context, 8–12% of a run | U30 |

**A fifth run, VCST-6314 (20–21 Oct, a developer's `/qa-test-fast`), measured by its operator.** 3,418.6M input
tokens (cache reads 91–99%), 3.1M output, 45 subagents, 21 h 12 of agent time, 11 h 34 wall clock — about 6 h of
it two pauses on the spend limit. A smaller developer run on another ticket took about an hour and 36% of a
five-hour window (18% of the week); its token figure was measured differently (U42).

| Part of VCST-6314 | Share of input | Answered by |
|---|---|---|
| Live investigations (10 agents) | 27.5% | U29, U36 layer 3 |
| Main session — orchestrator, plus the strategy, model, checklist and close-out it wrote (2.5M output) | 18.0% | U30; U13 revised: a narrow agent writes the checklist (O2) |
| `qa-bug` reports and filing (10 agents, 4 h 27) | 12.9% | U50 |
| Regression (orchestrator + 4 runners) | 10.6% | U7 |
| Visual lane / lane A (storefront checklist) | 7.3% / 7.1% | U26, U27 |
| Mind-map update inside the run | 2.5% | U6 (no map builders in a run) |
| The run did not fit the five-hour window twice | — | U38 |

## 3. The shape

```
/vc-test:qa-ticket <KEY> [--yes] [--dry-run]                         (working name)
 0 PROBE     capabilities.mjs → capabilities.json            what this install can do
             route (type × status role → job) · rounds.mjs   a fourth round STOPs before any context
 1 CONTEXT   /ticket-context <KEY> → bundle.json             parallel analysts, cached 24 h
             layer 0: change map from the CHANGE analysis + mind map + data model → change-map.json (U37, U44)
 2 STRATEGY  /qa-test-strategy (whole bundle + change map, U45) → test-strategy.md   floors · gate · verifier if Critical
             ── HUMAN POINT 1: approve the strategy (--yes) ──
 3 RUN       plan-run.mjs → run-plan.json → waves            only RUN rows, ≤3 browser lanes;
             a narrow agent writes the thin checklist, then its .spec/API checks (U13 revised); ACs proved by API checks and
             .spec scripts (U27); exploratory is the main browser lane (U26); evidence on failure only (U28)
 4 CLOSE     trace.mjs reconcile → /qa-triage-results → qa-investigate (Medium+ only, U29) → verdict (decided here, final)
             Low / cosmetic findings → one line under "Noticed" (U25)
 5 CASES     passing .spec checks kept as the new cases; test-management-specialist writes their CSV rows (U18)
             — no separate wave
             → verdict.md + HTML (verdict, new cases, tokens and minutes per step), written by a fresh agent (U30)
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

**Round N ≥ 2 is a refresh, not a re-run (U15).** Round 1's bundle, strategy, test model, maps and checklist with
its results are the round's base. Steps 1 and 2 are not repeated, and human point 1 is skipped.

```
 0 PROBE     as round 1 (route, round count)
 1 REFRESH   rounds.mjs delta: commits since the last tested SHA · tracker comments since the last verdict ·
             the build now deployed (F6)                       a short fetch, not /ticket-context
 2 APPEND    "Round N" section appended to test-strategy.md; round 1's sections are not changed.
             Anything new in the ticket — a new PR, a changed AC, a new area — is appended as risks
             without asking; the appended section still passes the floors (a script, cheap)
 3 RUN       · every prior bug: its reproduction re-run (its .spec where one exists) → FIXED / NOT FIXED
             · a check next to each fix, scoped to the fix's diff
             · items left BLOCKED or unresulted in round N−1
             · the appended risks, by the same rules as round 1 (U25–U29)
 4–5         as round 1; verdict.md lists every prior bug with its result, and NOT FIXED is a FAIL of the round
```

## 3a. The developer command (U35)

```
/vc-test:dev-check [<KEY>] [--base <branch>]                         (working name)
 0 CHANGE MAP  git diff <base>...HEAD (+ the ticket's ACs if <KEY>) → change-map.json      ≤ 3% of the window
               a re-run after a fix maps only the diff since the last run and re-runs failed checks first (B15)
               every blocker and confirmed problem is reported the moment it is found (U52); a blocker
               stops the layers that depend on it (B14)
               hotspots linked to mind-map nodes and data profiles, read only (U43, U44); it is the plan (U45)
               → suspicions shown at once, labelled "suspected" (U41)
 1 PROVE       each hotspot by its cheapest proof: existing unit test · API/GraphQL check · .spec   ≤ 7%
               → stop here when nothing uncovered is in a significant zone (U36)
 2 EXPLORE     exploratory charter on the significant-zone hotspots only (U39)
 3 CONFIRM     qa-investigate, Medium or worse only
               → result: confirmed / refuted suspicions, findings by severity, kept .spec + draft rows,
                 tokens and window share per layer (U42)
```

No tracker, kb, page or corpus write and no human point; everything lands in the run folder outside the
working repository (`QA_OUTPUT_DIR`). A run that would exceed 20% of the window runs what fits and lists the
rest (U38).

## 4. Components

| Unit | Does | Depends on |
|---|---|---|
| `commands/qa-ticket.md` | runs steps 0–4 in order, executes `run-plan.json` | everything below, by path |
| `skills/ticket-context/` | **moved** from `.claude/skills/`; connectors extracted (§7) | connectors, `knowledge-store.mjs` (read) |
| `skills/qa-test-strategy/` | **moved**; floors read `capabilities.json` (§5.2); Artifacts rows come from the registry | `artifacts.json`, `capabilities.json` |
| `skills/qa-test-model/`, `qa-exploratory/`, `qa-triage-results/` (ticket mode), `qa-design/` | **moved** canonical copies; `qa-triage-results` loses `disable-model-invocation` (U14) | `vc-fix` agents and skills |
| `vc-fix`: `qa-checklist`, `qa-investigate`, `qa-bug`, `qa-risk`, `qa-evidence`, agents `qa-*-expert` | **reused**. One `vc-fix` version bump for three changes: `qa-bug` takes an investigation file as its input and does not investigate again (U50); `qa-checklist` Mode 5 names the risk id in Ref and gains `--from-strategy`; the tracker CLIs the bridge runs (`qa-fix-routing/jira.mjs`, `ado.mjs`) gain the connectors' read commands (§7) | — |
| `vc-init`: `/project-init` (`--add-user`, `--add-env`), `project-profile.json`, `profile-set.mjs`, the `$VC_RUN` bridge, the Playwright lanes `node "$VC_RUN" playwright <lane>` | **reused** (U19–U21). `vc-test` carries a read-only profile loader copy that STOPs on a missing profile or an unknown `schemaVersion`. One `vc-init` version bump for three changes: `test` added to `profile-set.mjs` `MERGEABLE` and to the reconcile schema; a bridge tool that runs `playwright test` and node check scripts with the test-user passwords (U32, constrained by B10); the pinned GraphQL read in the allowlist (B8) — each with committed bridge tests | — |
| `commands/vc-test-spec.md` → `/vc-test:spec` | runs kept `.spec` files locally through the U32 bridge tool; pass/fail per file (U54) | `vc-init` bridge |
| `commands/vc-test-init.md` → `/vc-test:init` | writes the `test` block through `profile-set.mjs`; checks accounts per role (U21) | `vc-init` |
| `skills/qa-test-data-model/`, `qa-generate-data/`, `qa-seed-data/` + command, agent `test-data-engineer`, `lib/seed/` engine | **moved and refactored** (§6a, U17); domain seeders stay project content | profile, `capabilities.json`, the project store |
| `skills/qa-test-cases-generator/`, agent `test-management-specialist`, the suite lint and promote scripts | **moved** (U18 revised): the specialist writes the CSV row of each kept `.spec` in the agent-native case format, and `Draft → Automated` promotion follows from the `.spec` having passed. There is no new-case wave, so `test-runner-agent` is not moved. Not the regression orchestration — that stays out (U7) | the project's corpus path from the profile |
| `lib/artifacts.json` | the only list of artifacts (§5.1) | — |
| `lib/capabilities.mjs` | probes the install, writes `capabilities.json` | profile, env, MCP list, project files |
| `lib/plan-run.mjs` | approved strategy + registry + capabilities → `run-plan.json` | the three above |
| `lib/route.mjs` · `lib/rounds.mjs` · `lib/trace.mjs` | routing · round count and the round-N delta (U15) · checklist↔risk trace and reconciliation | the strategy reader, connectors |
| `lib/run-cost.mjs` | tokens and active minutes per step, from the session and subagent logs, into `verdict.md` (U30) | the session log |
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
                          wave 1  test-data ‖ test-model (if selected, U46) ‖ contract-refresh*
                          wave 2  exploratory           (when the strategy says FIRST)
                          wave 3  checklist ── trace.mjs check
                          wave 4  ac-checks (API + .spec, no browser agent) ‖ exploratory (ALONGSIDE) ‖ visual ‖ ui-checks
                                  (≤3 browser lanes; ac-checks takes none)
                                                                       │
        testing-checklist.md + extras.json ─► trace.mjs reconcile ─► triage ─► verdict
```
`*` adapter. Reports land where they do today, the ticket's run folder (`QA_OUTPUT_DIR`, by default
`reports/tickets/<sprint>/<KEY>/<env>/` relative to `outputRoot()`):
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

v1 entries: `test-data`, `test-model`, `contract-refresh`\*, `checklist`, `exploratory`,
`ac-checks` (API/GraphQL checks and Playwright `.spec` scripts, no browser agent, U27), `ui-checks` (a browser agent
for the items a script cannot decide), `visual`, `verifier`, `case-authoring` (CSV rows for the kept `.spec`, U18).
`checklist-runners` and `new-case-run` are gone (2026-10-21). Adding an artifact = an entry + its skill; the command does
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
the bridge, so a role whose password the operator kept in `vc-secrets` is invisible to them. Settled by U32: the
engine runs through the same new `$VC_RUN` tool as the `.spec` scripts and receives the passwords there. A role
it still cannot log in as is `FIXTURE-GAP`, never a prompt for the password.

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
| host fetch | `node "$VC_RUN" gh …` (read-only `gh api` and `gh pr view`, already allowed; the review-thread GraphQL read needs B8) or `node "$VC_RUN" ado …` for Azure Repos | raw PR metadata, files, diffs, threads under `.vc-fix/` |
| bundle | plain `node`, no token | `bundle.json` from the two raw sets |

The bridge runs `vc-fix`'s `qa-fix-routing/jira.mjs` and `ado.mjs` and admits any of their command names (the
host stays pinned to the profile), so the read operations the connectors need — issue with fields, comments,
attachments and links; work item with `relations[]` (`ado get-workitem` exists); Azure Repos PR iterations,
changes and threads — are new commands in those two CLIs (the `vc-fix` bump, §4), with no allowlist change for them. The GitHub side
needs one narrow change (B8). Writes stay where they are: the one tracker comment goes
through the existing `jira edit-comment` / `ado comment`. v1 keeps today's Jira/GitHub behaviour byte-for-byte
on the platform project (`/ticket-context`'s own gate and the VCST-5097 bundle are the regression check). The
Azure connectors are checked against recorded responses in P1 and live on the client project in P5; the bundle
schema does not change — a connector fills the same fields.

**A host-governed project (U22, U23)** has no bridge route: the bridge refuses every token-bearing tool there.
The orchestrator dispatches a fresh fetch agent instead, which reads through the host's MCP servers the profile
maps (B9):

| Step | Runs as | Writes |
|---|---|---|
| tracker fetch | the fetch agent, read tools of `governance.servers.tracker` | the same raw files as the bridge route |
| host fetch | the fetch agent, read tools of `governance.servers.codeHost` | the same raw files as the bridge route |
| bundle | plain `node`, unchanged | `bundle.json` |

- **One raw schema for both routes.** The raw files carry the fields the bundle step reads; the fetch agent fills
  them from the server's responses. A field the server does not return is written as missing, so the bundle
  records a `gap` with that reason — never a value guessed to fill the schema.
- **One write through the host's servers.** The fetch writes nothing outward. The one tracker comment after
  human point 2 goes through the same host tracker server; nothing else is written through the host's servers.
- **Server content is data.** What the servers return is ticket and PR text. The bundle step scrubs it and screens
  it for `embedded_instructions[]` exactly as on the bridge route, and the orchestrator never reads the raw files.

Defaults that assume this repository (`DEFAULT_ORG = "VirtoCommerce"`, `TEST_ENV` default `vcst`) become profile
reads. With no profile the run STOPs with "run /project-init" (U19) — there is no fallback to those defaults.

## 8. Security, speed, tokens

**Security**

| Threat | Control |
|---|---|
| client code and secrets in context | `ticket-context` analysts are Read/Grep/Glob only, no network or shell; HAR and logs are scrubbed before they are read; ticket and PR text is data, and anything instructing is listed in `embedded_instructions[]`, never acted on; on a host-governed project the raw fetch stays in a fetch agent's context, never the orchestrator's (B9) |
| credentials | tokens only through `$VC_RUN` (allowlisted command, host-pinned git, redacted output), never from a file or the environment (U20); test-user passwords as `vc-init` stores them, handed to a browser lane as `config.secrets` or through `--secrets`, typed by bare key name; never in a brief |
| a script run with passwords (U32) | its own bridge group with test-user passwords only, never a token; fixed argv on files under the run's folder or the corpus path; output redacted; committed bridge tests (B10). A script can still read its own environment — accepted for a non-production test-user password |
| outward writes | tracker comment only after a yes, through `$VC_RUN` or, on a host-governed project, the host's tracker server (U23); no status transition, ever; bugs only through `qa-bug` and its gate; no PR writes; knowledge writes only through `knowledge-store.mjs` |
| writes outside an artifact's zone | `write-zones.mjs` compares the run's changed files with the `writes` globs of the artifacts that ran; a file outside every zone makes the run BLOCKED (tests committed, U10) |
| public-kb leak | the platform-write refusal in `knowledge-store.mjs` is code, not prompt |

**Speed.** The bundle is cached 24 h and its analysts run in parallel; waves are parallel inside; probes remove
dead dispatches before they happen; a light strategy skips the test model; exploratory runs whenever the
ticket has a UI or API surface (U26). Steps 0–2 are serial and took 14–31 min before the first browser action in
the measured runs (§2b); round N ≥ 2 skips them (U15). The known slow step is `/ticket-context`'s join (O6, up to
5 min); speeding it up is part of P2.

**Tokens.** A thin command; skills load only for `RUN` rows; files, not summaries, between steps; scripts own
the deterministic work (floors, gate, plan, trace, rounds, routing); `model` per registry entry. Measured in the
`/ticket-context` validation: analysts on Opus cost 2.5× the old Stage 1, on Sonnet about 1.7×; the default is
chosen per entry in P2 from that measurement.

What the cost actually is (§2b): every agent turn re-reads the whole context, so the cost is **turns × context**,
not output. The rules that follow from it (U30):

- **Short agents.** One job per agent. A lane does not run for hundreds of turns: ACs go to scripts (U27), and a
  browser agent gets a bounded charter.
- **A narrow start.** A brief is file paths plus the one skill the step needs, not the repository's whole rule
  tier. A client install starts lighter than this repository, and P2 measures both.
- **Batched tool calls.** Independent reads and probes go out in one turn.
- **Writing in a fresh agent.** The verdict, summary, comment and page are written by an agent that starts
  from the result files, not by the orchestrator at 300–400k context.
- **Fewer, shorter evidence turns.** Screenshots only on failure (U28); investigations only for Medium or worse
  (U29).
- **The number in every verdict.** `lib/run-cost.mjs` writes tokens and active minutes per step, so every change
  to the flow is judged against the 2026-10-21 baseline (§2b).

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
| an AC check cannot be scripted (the result needs a visual judgement) | the item moves to `ui-checks`, never SKIP |
| a script check fails | it is triaged like any FAIL; screenshots and HAR are captured then, by re-running that one check with evidence on (U28) |
| a risk without a result after the run | back to execution once, then a deviation with its reason; an unresulted High/Critical caps the verdict below PASS |
| a re-run on the same build | resumes from the first incomplete wave in `run-plan.json`; the approved strategy is reused |
| nobody answers human point 2 (headless, CI) | no bug is filed and no comment is posted; the reports and `verdict.md` are the output |

## 10. Phases

| Phase | Delivers | Checked by |
|---|---|---|
| **P1 Foundation** | plugin manifest, `vc-init` + `vc-fix` dependencies, marketplace entry; the `vc-init` change (`test` in `MERGEABLE` + schema; the script-runner bridge tool, U32 + B10; the pinned GraphQL read, B8) and the `vc-fix` change (connector read commands in `jira.mjs`/`ado.mjs`), each with its version bump and tag; `/vc-test:init` (U21: stand declared writable or not, knowledge-store path, accounts per role checked); `ticket-context` and `qa-test-strategy` moved; tracker/host interfaces with Jira, GitHub, Azure Boards and Azure Repos, fetching through `$VC_RUN`, and the host-governed route through the host's MCP servers into the same raw schema (§7, U23); `capabilities.mjs`; F6 via `/api/platform/modules`; `knowledge-store.mjs` (+ committed tests); the "unavailable is not doubt" rule in the floors | `claude plugin validate`; committed store tests and `vc-init`'s committed bridge tests green, including every B8 and B10 refusal; temporary tests for the rest; `/ticket-context` + strategy from the plugin on VCST-5097, with tokens only in `vc-secrets`, reproduce today's bundle and gate result; Azure connectors against recorded responses; the host-governed route: raw files written from recorded host-server responses give the same bundle as the bridge route on the same ticket |
| **P2 Flow** | `artifacts.json`, `plan-run.mjs`, `route.mjs`, `rounds.mjs`, `trace.mjs`, `write-zones.mjs` (+ committed tests); the command with its two human points; `ac-checks` (API checks + `.spec` scripts) and `ui-checks` (U27); the kept `.spec` with its CSV row (U18 revised; layout from the suites-reorganization design); the severity filter and Medium-only investigation (U25, U29); exploratory as the main lane with its significant-bug charter and access probe (U26); evidence on failure (U28); the round-N refresh (U15); `run-cost.mjs` and the fresh writing agent (U30), with the §2b per-run totals measured by it (B11); execution skills moved (`qa-triage-results` invocable); `qa-checklist` risk ids (`vc-fix` bump); the join speed-up (O6); per-entry models | `--dry-run` on 3 tickets: wave plan, gates, no outward write |
| **P2b Test data** | the test-data family moved and refactored (§6a): lighter skills, the engine with generic platform operations, this repository's seeders ported as project content | `td:validate` + `td:reconcile` green on the platform project before and after; one domain seeded and torn down from the plugin on a non-production stand; BUDGET-004 for every moved `SKILL.md` |
| **P3 Validation, stage 1 — native platform** | live runs on 3–5 VC tickets in this repository (Story, Review task, Technical task, UI-only, Bug not-fixed) on Jira + GitHub, with the plugin installed the way a client installs it | redesign §8 measures (R3 not slower on a small ticket, R4 nothing FULL ran is lost on a large one, no floor overridden by hand); the platform store receives the kb writes; against the §2b baseline (U34): at most 50% of the comparable run's per-run total (B11), and VCST-6398 re-run finds every Medium the baseline found (VCST-6452, 6453, 6454 — U48; a miss fails P3 whatever the cost); a control plain-review run on the same tickets, and the layered run finds more significant bugs than it (U49); wall clock per command on a small, a component and a large ticket, the developer command at most 1.5 h on a typical one (U51); a round 2 costs a fraction of round 1 |
| **P4 Removal** — after stage 1 passes | `/qa-test` FAST/FULL, `/qa-test-fast`, `ticket-routing.md` §5–§5d, Artifact A, `3-cases`, `1e-plan` removed; `ci/run-full-cycle.ts`, `ci/run-suite-audit.ts` and the other consumers repointed or cleaned; the plugin tagged for internal use (`docs/release-process.md`) | `npm run context:check`, `npm test`, CI |
| **P5 Validation, stage 2 — real client project** | at least one live run on the **real client Azure DevOps project**, with the plugin installed in the client's checkout | Azure Boards + Azure Repos read end to end — through the host's servers if the project is host-governed (U23); SKIPs for missing adapters; every write inside the client's `outputRoot()` and project store; zero platform writes. Its reports stay in the client's project; only anonymous measures are recorded here. A pass releases the plugin to clients (marketplace description + tag) |

## 11. Out of scope, and what comes next

- **Regression** (U7): running the **existing** corpus — the regression lane, coverage triage and staleness check,
  `regression:select`'s blanket selection (V7: 33–91 suites per ticket, because every path token that matches
  manifest vocabulary widens the selection), and repairing stale cases through `/qa-test-lifecycle`. Writing and
  running the ticket's **new** cases is in (U18); the stale case list goes to the project store's test
  documentation. The regular run of the **kept `.spec`** set is not out of scope in principle: it is the next
  regression and is specified in the suites-reorganization design ([spec](2026-10-21-suites-reorg-design.md), PR #500) (U53); a single `.spec` runs today through U54.
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
| P1 changes `vc-init` and `vc-fix`, which other plugins depend on | additive only (a `MERGEABLE` root; new read commands; a new bridge tool and one pinned GraphQL read, B8, B10); `vc-init`'s committed bridge tests are the gate; each bump is tagged before `vc-test` names it as a dependency (`docs/release-process.md` §Step 1 + §Step 5a) |
| Every command added to `jira.mjs` / `ado.mjs` widens what a token-holding process may do | reads only — writes keep their existing commands; each new command uses the host the profile pins, as the existing ones do |
| The script-runner tool (U32) runs code an agent wrote while holding passwords | B10: test-user passwords only, fixed argv and paths, redacted output, committed refusal tests; the residual risk (a script reads its own environment) is limited to a non-production test-user password |
| On a host-governed project the raw ticket and PR responses pass through an agent's context unscrubbed (U23) | a fresh fetch agent holds them, not the orchestrator; it returns paths and present/missing flags only, and the bundle step scrubs before any analyst reads (B9); its token cost is measured on the client project in P5 |
| Scripted AC checks miss what only a human-like look sees | an item a script cannot decide goes to `ui-checks` (§9); exploratory and visual still run in a browser; P3 re-runs a §2b ticket and must find its Mediums again |
| The severity filter drops a Low that mattered | it is never deleted, only not worked: one line under "Noticed" in the verdict, visible to the reader, who can ask for it to be filed |
| Exploratory results vary between runs | its charter comes from the strategy's risks and always contains the access probe, so the high-impact checks are fixed; the free part is where variance is wanted |
| A round N ≥ 2 trusts round 1's context, which may have gone stale | the refresh reads commits, comments and the deployed build since the last verdict; whatever is new is appended as risks without asking (U15) |

## 13. Open questions

None open; O1–O3 are settled.

| # | Question | Resolution |
|---|---|---|
| O1 | On a host-governed project the bridge refuses tokens, and a script cannot call the host's MCP servers. Is the context step in v1 there? | **Yes** (owner, 2026-10-21) — the orchestrator reads through the host's servers and writes the same raw files: U23, §7 |
| O2 | U13 has the orchestrator write the checklist inline, but VCST-6314's main session was 18% of the run at 2.5M output, against U30's short-context rule. Does the checklist move to a fresh agent? | **Yes** (owner, 2026-10-21) — a new narrow agent writes a thin checklist (AC/risk → proof) and the `.spec`/API checks it names: U13 revised |
| O3 | `qa-bug` (U11: used as it is) was 12.9% of VCST-6314. Is the report written from the investigation's output, without a second investigation, and only for Medium or worse? | **Yes** (owner, 2026-10-21): U50 |
