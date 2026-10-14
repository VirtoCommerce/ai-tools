# Pre-flight as one skill over one fact core — design

Date: 2026-10-08 · Ticket: [VCST-6225](https://virtocommerce.atlassian.net/browse/VCST-6225) (blocks VCST-6223) · Branch: `claude/preflight-step-040aa0` · Status: design, awaiting review

## 1. Problem

The environment/build pre-flight — env health, `declared` vs `deployed` build, release-ledger Δ,
duplicate-run check, doc/kb grounding — is restated in eight `.claude/` commands. A shared source
exists (`.claude/templates/agent-dispatch.md` §Pre-Flight Checklist / §Build Verification /
§Duplicate Detection Guard / §Context7 Pre-Flight), but commands **paraphrase** it instead of citing
it, and the copies have drifted:

| Drift | Where |
|---|---|
| Reads only `declared` from `vc-deploy-dev`, no `deployed` probe — the thing `preflight.md` calls ground truth | `qa-smoke`, `qa-test-lifecycle`, `qa-exploratory` (whose own item 3a then cites "the `deployed` probe from item 2", which does not exist) |
| Grounding order differs: Context7-first vs VirtoOZ vs `kb_ask` | `agent-dispatch.md`, `qa-test-lifecycle`, `qa-smoke` vs `ba-analyze`, `qa-domain-map` vs `qa-test-fast` |
| Release-ledger Δ present in some, absent in others | `qa-test`, `qa-regression`, `qa-exploratory` only |
| Duplicate-check semantics differ (2 h window vs same build) | `qa-test` vs `qa-test-fast` |
| Suite module gating driven by a hand-set `MODULES_ENABLED` (default "all" ⇒ gates nothing) | `ci/lib/suite-manifest.ts` — a transcribed constant (`.claude/rules/test-data.md` GOLDEN RULE) |
| No baseline for "what changed since the last regression run"; `reports/deploy-state-cache.json` is one hand-written snapshot from 2026-08-06 | `qa-regression` |

**Goal: stop the drift.** One implementation of the facts, one statement of each policy, and
commands that consume a result instead of restating a procedure. Shrinking command bodies
(BUDGET-004) is a welcome side effect, not the goal.

## 2. Decisions taken

| # | Decision | Rejected alternative |
|---|---|---|
| D1 | The single copy lives in `.claude/`; the `vc-fix` plugin keeps its own Step 0s untouched | plugin-hosted (one copy for both surfaces); byte-mirrored in both |
| D2 | Skill **+ script**: deterministic facts and policy are code, the LLM half is `SKILL.md` | prose-only skill (that is what `agent-dispatch.md` already was); script-only |
| D3 | **One fact core, two consumers**: change-scoped (ticket) and build-scoped (regression). Shared facts, separate policies | one script with a `kind → policy` table growing per-kind branches |
| D4 | `storefrontVisible` is in the core from day one | defer |
| D5 | MCP availability is part of pre-flight, with per-consumer minimum requirements held as data | `qa-env-check`'s "all three Playwright servers required for everyone" |
| D6 | One skill with two entry points (change-scoped / build-scoped CLI) | regression calling code without the skill |
| D7 | **CI regression (`ci/run-regression.ts`, `ci/`) is out of scope.** Nothing under `ci/` is modified; shared `ci/lib/*` is only imported | a headless path |
| D8 | The skill is named **`preflight`** (no `qa-` prefix, like `kb-report` / `prompt-review`): `/ba-analyze` consumes it too, so it is not QA-only. No name collision in `.claude/` or `plugins/` | `qa-preflight` |

## 3. Architecture

```
/preflight  (SKILL.md — the LLM half: MCP level 3, kb → VirtoOZ → Context7, interpretation)
   ├─ step 1, change-scoped ─► npm run preflight -- --for <…>          (scripts/preflight/cli.ts)
   └─ step 1, build-scoped  ─► npm run regression:plan -- <sel> --preflight  (scripts/regression/preflight.ts)
                                         both ─► scripts/lib/env-facts.ts  (fact core, no policy)
```

Split rule: **anything deterministic is code; anything that needs a session (MCP tools, docs,
asking the user) is the skill.** A command cannot paraphrase a JSON result.

## 4. Fact core — `scripts/lib/env-facts.ts`

`getEnvFacts({ env, components?, storefront? })` — an importable, read-only function. **No policy:**
it never says OK/WARN/BLOCK; consumers decide.

| Fact | Source (existing code reused) | Rule |
|---|---|---|
| `config.missing[]` | the layered `.env` loader (`config.js`) | distinguishes "probe failed" from "`BACK_URL` unset" |
| `health` | `platformHealthy()` — `scripts/deploy/lib/live.ts` | `UP` / `DOWN` |
| `declared` | `fetchFile()` — `scripts/deploy/lib/github.ts`, `vc-deploy-dev` branch per `TEST_ENV` | unavailable ⇒ `UNKNOWN` |
| `deployed` | `probeAdminToken()` + `probeLiveModules()` — `live.ts` (status-carrying variants of `getAdminToken`/`liveModules`) | failed probe ⇒ `UNKNOWN` with the HTTP status, **never** a fallback to `declared`. **`deployed.platform`** comes from `probePlatformVersion()` — the anonymous Admin root page embeds `platformVersion` (kb `KB-B858E12A`); the modules API has no Platform entry and `/api/platform/version` is 404. No version in the page ⇒ `UNKNOWN: admin-page: <status>`. *(Amended 2026-10-12: the phase-1 design said "no live source"; the first `/preflight` run asked the kb and found one.)* |
| `storefrontVisible` | the `InitializeApplication` replay in `scripts/maintenance/probe-store-capabilities.mjs` (extract to a reusable function) | anonymous; "installed but the storefront cannot see it" |
| `drift[]` | `declared` vs `deployed` per module | deploy in flight / failed / partial |
| `ledger` | `.claude/knowledge/domain/release-ledger.md` §1 table, §2 rows, frontmatter `stale_after_days`; `cmpSemver()` from `refresh-release-ledger.mjs` | `releasedNotDeployed[]`, `breaking[]` (for `components`), `stale` |
| `observedAt` | clock | lets a consumer compare snapshots |

Guarantees: read-only; no secret in the output (the token lives inside the call); every source can
independently be `UNKNOWN` without failing the others. Module identity: platform ids
(`VirtoCommerce.Cart`) ↔ ledger repos (`vc-module-cart`) ↔ manifest `requiresModules` slugs are
mapped through an **existing** mapping (`REPO_PROFILES` / `module-suite-map.md` /
`resolveSuiteSource` in `ci/lib/affected-suites.ts`) — never a new hand-written table.

Not in the core: tickets, sprints, duplicates, suites, kb, docs, MCP.

## 5. Change-scoped pre-flight

**Consumers:** `/qa-test` (1b items 1, 2, 2-release, 3, 4), `/qa-test-fast` (Step 0),
`/qa-exploratory`, `/qa-test-lifecycle`, `/qa-domain-map`, `/ba-analyze`.

**CLI** — `npm run preflight -- --for <ticket|ticket-fast|exploratory|lifecycle|domain-map|ba> [--ticket KEY]
[--components A,B] [--domain slug] [--expect Module.Id@version] [--storefront] [--json]`. Exit `0`
OK/WARN only, `1` usage error, `2` any BLOCK, `3` the script could not run. `ticket-fast` shares
`ticket`'s policy and differs only in its MCP requirements (§7). Adds to the core:

- `sprint` — `reports/tickets/Sprint-current` else the latest `SprintXX-XX` (`--for ticket` only);
- `duplicate` — the prior run, its verdict **and its build**, so each consumer can apply its own
  "same window" or "same build" rule from one fact;
- `expect` — is the PR's artifact deployed (today a prose sentence in `qa-test`);
- `mcp[]` — levels 1–2 (§7);
- `checks[]` — `{id, status: OK|WARN|BLOCK|UNKNOWN, why}` from the change-scoped policy, which
  lives **once, in code**:

| `--for` | health DOWN | duplicate: window · where | `expect` not deployed |
|---|---|---|---|
| `ticket` | BLOCK (a question arises only from a BLOCK — §8a) | 2 h · `reports/tickets/*/<KEY>/summary.json` | BLOCK-on-deploy → offer `/qa-deploy-pr` (ask) |
| `exploratory` | WARN | 24 h · `reports/exploratory/SBTM-*`, same domain | — |
| `lifecycle` | WARN | 24 h · `reports/test-lifecycle/TLC-*`, same scope | — |
| `domain-map`, `ba` | WARN | — | — |

`ledger.breaking` in a component under test is reported as a fact; what it means is the
consumer's (e.g. `/qa-test` forces FULL — its rule, not pre-flight's).

No report file of its own (`.claude/rules/reports.md` §1): the consumer embeds the JSON as a
`preflight` block in its `summary.json` or report header.

## 6. Build-scoped pre-flight (regression)

**Consumers:** `/qa-regression`, `/qa-smoke`. **Home:** `scripts/regression/preflight.ts`, invoked
as `npm run regression:plan -- <selection> --preflight`; its gating result removes suites from the
plan. Imports `ci/lib/manifest-preflight.ts`, `ci/lib/suite-manifest.ts` — modifies nothing in `ci/`.

| # | Check | Source | Status |
|---|---|---|---|
| 1 | env alive | core `health` | DOWN ⇒ BLOCK |
| 2 | every suite has a CSV and an executor | `preflightManifest()` (existing) | BLOCK, all problems at once |
| 3 | no active run | `regression:reap` classification | ACTIVE ⇒ BLOCK · STALLED ⇒ BLOCK naming `regression:reap:apply` (never applies it itself) |
| 4 | **module gating derived, not configured** | `requiresModules` × `deployed` (entry → module id per §14); plus `storefrontVisible` for `layer: frontend` suites | missing ⇒ suite removed from the schedule as `NOT_DEPLOYED` (BLOCKED-on-deploy, never FAIL). `deployed: UNKNOWN` ⇒ no gating, WARN (fail-open). An entry that resolves to no module id ⇒ UNKNOWN `unmapped-requires:<entry>` row naming its suites; the suite runs (fail-open). `MODULES_ENABLED`, when set, still applies (existing behaviour) and is recorded |
| 5 | **what moved since the baseline** | `deployed` now vs `reports/regression/baseline.<env>.json` | `changedSince[]` → the suites requiring them are named "false-failure risk" in the report header. No baseline ⇒ `baseline: UNKNOWN`, no Δ, not an error |
| 6 | ⚠ BREAKING in the selected suites' components | core `ledger` | WARN, false-failure risk (replaces `qa-regression` Step 0.4 prose) |
| 7 | drift on the selected suites' modules | core `drift` | **BLOCK** (one question: wait · proceed as is · stop — §8a rule 7). Drift only on modules no selected suite requires ⇒ WARN, no question (§14) |
| 8 | smoke gate integrity | `npm run suites:gates` | `smoke` only; unmapped cases ⇒ verdict provisional |
| 9 | browser lanes | `mcp[]` levels 1–2 (§7) | pool = live lanes; WARN with the projected duration when fewer than 3 |

**The baseline is written at close, not at pre-flight.** `regression:close` writes
`reports/regression/baseline.<env>.json` (`deployed` snapshot + `runId`) **only for a completed
run** — a run that died mid-way must not become the next run's baseline. It replaces
`reports/deploy-state-cache.json`.

Output: `reports/regression/<RUN_ID>/preflight.json` + the report header.

## 7. MCP availability

**Three levels, two executors:**

| Level | Question | Checked by |
|---|---|---|
| 1 CONFIGURED | present in `.mcp.json` | CLI (user/claude.ai-level servers are invisible to it) |
| 2 READY | no `/^<.*>$/` placeholder, env reference resolves, `@playwright/mcp` pinned (not `@latest`), firefox config carries the occlusion flag | CLI (rules already in `qa-env-check` §4 and `.claude/rules/agents.md`) |
| 3 CONNECTED | the tools are callable in **this** session | skill only: `ToolSearch select:` + one cheap read probe per required server |

**Requirement classes:** `REQ` — absent ⇒ BLOCK · `REQ↘` — required with a named fallback ⇒
WARN naming it · `OPT` — enables a lane; absent ⇒ that lane `SKIPPED`, **never PASS**.

**Normative source: `.claude/skills/preflight/mcp-requirements.json`** (consumer → server →
class + fallback + condition). Read by both CLIs (levels 1–2) and by the skill (which servers to
probe at level 3). The table below is the agreed initial content, illustrative only once the file
exists:

| Server | Fallback | ticket | ticket FAST | exploratory | lifecycle | domain-map | ba | regression | smoke |
|---|---|---|---|---|---|---|---|---|---|
| tracker (Atlassian; ADO via `ado.mjs`) | REST `JIRA_API_TOKEN` → user pastes | REQ↘ | REQ↘ | OPT¹ | — | — | OPT¹ | — | — |
| github | `gh` / `GIT_TOKEN` REST | REQ↘ | REQ↘ | — | REQ↘ | REQ↘ | REQ↘ | — | — |
| kb | `npm run kb -- ask` | REQ↘ | REQ↘ | REQ↘ | REQ↘ | REQ↘ | REQ↘ | OPT | REQ↘ |
| VirtoOZ | Context7 | REQ↘ | REQ↘ | REQ↘ | REQ↘ | REQ² | REQ² | — | OPT |
| Playwright lanes | next lane in chain | ≥1 REQ, 3 wanted³ | 1 REQ | 1 REQ (charter lane) | ≥1 when Regression phase runs | 1 (firefox) REQ↘ | OPT | ≥1 REQ, pool = live³ | 1 REQ (chrome) |
| Chrome DevTools | — | OPT (`visual_surface`) | OPT (`--visual`) | — | — | — | — | — | — |
| Azure / App Insights | `APPINSIGHTS_*` keys | OPT | OPT | — | — | — | — | OPT | OPT |

¹ `ticket` / `docs ticket` mode only. ² Neither VirtoOZ nor Context7 ⇒ BLOCK: these commands exist
to ground in the published guides. ³ Fewer than 3 is not an error — the run serialises; it is a WARN
with a projected duration *before* start.

Tracker absent on a ticket run: the run proceeds on a pasted ticket, and the status hop and the
closing comment are recorded as explicit `SKIPPED` in `summary.json`.

Output block: `mcp: [{server, level: CONFIGURED|READY|CONNECTED|ABSENT, via: "mcp"|"fallback:<name>",
class, status}]` — the consumer records **through what** it actually worked.

The skill never edits `.mcp.json` and never restarts a server; for a missing server it says in one
line what to add and that a restart is required.

## 8. The skill — `.claude/skills/preflight/`

`SKILL.md` (born under BUDGET-004's 19,000 chars) + `mcp-requirements.json`. Numbered steps:

1. Run the CLI for the consumer's scope (change-scoped or build-scoped).
2. MCP level 3 for the consumer's `REQ`/`REQ↘` servers: `ToolSearch select:` + one read probe; fill
   `mcp[].level`/`via`.
3. **Ground in the order `CLAUDE.md` fixes** — `mcp__kb__kb_ask` with the coordinate in the question
   (page path, GraphQL operation, endpoint) → VirtoOZ via `/vc-docs` → Context7 only as a fallback.
   Record hit ids; a miss never blocks (`.claude/knowledge/agents/authoring-standard.md` §5).
4. Interpret: `UNKNOWN` is never upgraded to a value · a BLOCK is one question to the user · a WARN
   is named in one line · consumer-specific meanings (e.g. BREAKING ⇒ FULL) are handed back as facts.
5. Show the output (§8a). On a non-OK row, offer remediation and run the loop (§8b) — never fix
   without the user choosing to.
6. Return one compact block to the consumer: facts + `mcp[]` + kb/doc hit ids + `remediations[]`.

Deliberately **not** in the skill: the axes 2b–2g, the 2-map prior-art read, ticket classification
and routing — all `/qa-test` mechanics.

## 8a. Output form — one form for every consumer

Today there is none: `qa-env-check` prints sectioned tables + `READY`/`NOT READY`, `/project-init`
a bordered readiness table, and `agent-dispatch.md` + eight commands one sentence ("warn user with
specific failure, ask whether to proceed") re-worded each time. **The output form drifts exactly as
the checks did, and is fixed the same way: the CLI renders it from `checks[]`; Claude does not
compose it.**

**Clean — one line:**

```
Preflight · vcst · VCST-1234 · Platform 3.1057.0 · Theme 2.55.0 · READY (14 checks OK)
```

**Problems — header, verdict, non-OK rows only:**

```
Preflight · vcst · ticket VCST-1234 · 2026-10-08 14:02
Build: Platform 3.1057.0 (declared) · Theme 2.55.0 · drift: none · ledger: fresh

NOT READY — 1 blocker · 2 warnings · 11 checks OK

| # | Status  | Check     | Found                                                      | Who          | Do                                  |
|---|---------|-----------|------------------------------------------------------------|--------------|-------------------------------------|
| 1 | BLOCK   | expect    | vc-module-cart 3.1006.0-pr-812 not deployed (has 3.1005.0) | me, with OK  | /qa-deploy-pr VCST-1234, or wait    |
| 2 | WARN    | duplicate | tested 47 min ago, same build, verdict FAIL                | you          | re-run overwrites reports/tickets/… |
| 3 | UNKNOWN | deployed  | /api/platform/modules → 401                                | you          | ADMIN_PASSWORD in .env.local        |
```

Rules:

1. **Quiet when clean, loud when not.** OK rows collapse into a count.
2. **Verdict vocabulary is `qa-env-check`'s:** `READY` / `NOT READY`. Never `BLOCKED` — that is a
   test-run verdict, not an environment one.
3. **Every non-OK row has a `Who` and a `Do`** — who can act (§8b) and a concrete command or
   setting, never "investigate". Both come from code: each `check id` carries its remedy, so one
   problem gets one piece of advice in every consumer.
4. **`UNKNOWN` is its own status and never renders as OK** — "never fall back to `declared`",
   applied to display.
5. **`Found` states values** (versions, minutes, HTTP codes), not adjectives. No secret ever.
6. **JSON goes to `summary.json`, this text goes to chat.** The text is never stored, so it can change
   without breaking a reader.
7. **At most one question, and only when there is a BLOCK.** A WARN never asks. (Hence `ticket` +
   health DOWN is a BLOCK in §5, not "WARN → ask": a question has one origin.)

The CLI prints this by default and raw data with `--json`. The skill (§8 step 5) shows the CLI block
**verbatim** and appends, in the same columns, only the rows the CLI cannot see: MCP level 3
(`mcp:kb · WARN · not connected · working via npm run kb -- ask`) and grounding misses.

## 8b. Remediation — diagnose, fix, re-check

A user handed a blocker table asks Claude to "fix it" or "find out why". So each non-OK row needs two
things the table alone does not give: **who** can fix it, and **how to find the cause first**.

**Pre-flight itself stays read-only.** Remediation is a separate step the user opts into. A
pre-flight that repaired things on the fly would give a different answer for an unchanged
environment, and its output would stop being evidence.

**Actors.** The line between `me` and `you` is drawn by the safety rules, not by convenience.

| Actor | When | Examples |
|---|---|---|
| `me` | read-only, or local and reversible | wait for an in-flight deploy and re-check · create the sprint folder |
| `me, with OK` | outward-facing, a shared environment, or a tracked file | `/qa-deploy-pr` (deploys to a shared env) · `regression:reap:apply` · `releases:refresh` (rewrites a tracked file) · a manifest edit |
| `you` | secrets, OAuth, a session restart, a decision | a password in `.env.local` · authorising an MCP server · restarting after an `.mcp.json` edit · "re-run the duplicate or not" |

Claude never types or substitutes a password or token and never falls back to a different token
when one fails; for a credential problem it hands over paste-ready text (which variable, which file,
where the value comes from). It cannot start an OAuth flow.

**Diagnosis.** Each check carries a read-only recipe that turns a symptom into a cause, because
different causes have different fixes. Example — `deployed → 401`: which variable resolves and from
which `.env` layer (never printing the value) → what `/connect/token` answers → "password unset" vs
"password rejected".

**Loop.**

```
table → "I can fix #2 myself; #1 needs your OK (deploys the PR to vcst); #3 only you can do: paste … into .env.local"
      → one question: [fix what you can] [find the cause first] [proceed as is] [stop]
      → diagnose / fix
      → RE-RUN the whole pre-flight (seconds) → new table
      → at most 2 rounds, then hand over with a summary
```

The whole pre-flight is re-run, not just the failed check: one fix can move another (a PR redeploy
changes `drift`), and a partial re-run could leave a stale verdict looking fresh. The two-round cap
mirrors G5 in `.claude/knowledge/execution/quality-gates.md`: an environment that is not fixed in two
rounds is infrastructure, not configuration, and goes to a human.

**Record.** `summary.json.preflight.remediations[]` — `{check, found, diagnosis, action, actor,
approvedBy, result}`. An environment repaired during a run changes the conditions the verdict was
reached under; a reader of the report must be able to see that.

**Catalog — data in code, next to the policy.** Per `check id`: `{diagnose[], remedy: {actor,
action}}`. The agreed starting set (normative once it is in code):

| Check | Diagnose (`me`) | Remedy | Actor |
|---|---|---|---|
| `config.missing` | which `.env` layer lacks the variable | secret → `.env.local` · URL → `.env.<env>` | `you` · `me, with OK` |
| `health` DOWN | `/health` detail, deploy Action status in `vc-deploy-dev` | wait and re-check · switch `TEST_ENV` | `me` · `you` |
| `deployed` UNKNOWN | 401: unset vs rejected · 5xx: environment | credentials · wait | `you` · `me` |
| `declared` UNKNOWN | `gh auth status` | `gh auth login` | `you` |
| `drift` | `gh run list` on the env branch: in flight vs failed | wait · re-run the deploy | `me` · `me, with OK` |
| `expect` | is the PR artifact built, is it in `packages.json` | `/qa-deploy-pr` | `me, with OK` |
| `ledger` stale | — | `npm run releases:refresh` + commit | `me, with OK` |
| `duplicate` | the prior run's verdict and build | re-run (overwrites) · commit the prior first | `you` |
| active run | `regression:reap` | wait · `regression:reap:apply` when STALLED | `me` · `me, with OK` |
| `mcp` not connected | `ToolSearch` | restart the session · the fallback already works | `you` |
| `mcp` needs OAuth | — | authorise in `/mcp` or the claude.ai connector settings | `you` |
| lanes < 3 | which lanes are alive | proceed serially | `you` (decision) |

## 9. Migration

### Phase 1 — core + change-scoped (PR 1)

| File | Change |
|---|---|
| new | `scripts/lib/env-facts.ts`, `scripts/preflight/cli.ts`, `npm run preflight`, `.claude/skills/preflight/{SKILL.md,mcp-requirements.json}` |
| `skills/README.md` | add `preflight/` to the flat layout listing, among the root-level untagged skills |
| `commands/qa-test.md` + `skills/qa-test/intake.md` (renamed from `preflight.md`) | 1b items 1, 2, 2-release, 3, 4 → cite the skill; axes and 2-map stay. One header line in `intake.md`: env/build pre-flight is `/preflight`, this file is the intake around it (renamed from `preflight.md` — "preflight" now means only `/preflight`; inbound links updated). **Also fix:** the 2b–2g table has 5 rows under a "six axes" heading and says "all five"/"other three"; 2g derives *after* wave A while 2-map *in* wave A consumes it (2g needs only `1a`'s slug + one frontmatter read, so it moves before wave A); wave-A list omits 2-map and names only 2b/2c/2e/2f; duplicated "and the order is the point"; transcribed "63 `/qa-checklist` domains" |
| `commands/qa-test-fast.md` | Step 0 item 2 and the `kb_ask` of item 5 → skill; prior artifacts, domain slug stay |
| `commands/qa-exploratory.md` | Step 0 items 1, 2, 3, the Δ of 3a, 4 → skill; 5/5a stay |
| `commands/qa-test-lifecycle.md` | Pre-Flight 1–3 → skill; 4 (`schema:refresh`) stays |
| `commands/qa-domain-map.md` | Step 1 versions, docs, kb → skill; prior art, suites, schema stay |
| `commands/ba-analyze.md` | Step 0 items 1 (VirtoOZ) and 3 (MCP availability) → skill; fix the two items both numbered "3." |
| `templates/agent-dispatch.md` | §Pre-Flight Checklist and §Context7 Pre-Flight → a pointer to the skill (removes the "Context7 first" that contradicts `CLAUDE.md`); §Duplicate Detection Guard loses the rows the skill now owns. **§Build Verification keeps its doctrine** (precedence of the four sources, the disagreement table — eleven files cite it); only its two procedural subsections become a pointer |
| `/vc-fix:qa-env-check endpoints` calls in `.claude/` commands | replaced by core `health`; the full `qa-env-check` stays for onboarding |

### Phase 2 — build-scoped (PR 2)

- `scripts/regression/preflight.ts` + `--preflight` on `regression:plan`.
- `regression:close` writes `baseline.<env>.json` for completed runs only.
- `commands/qa-regression.md` Step 0 and `commands/qa-smoke.md` Step 0 → skill (build-scoped entry);
  smoke's Context7 item becomes the kb → VirtoOZ order.
- Delete `reports/deploy-state-cache.json` and its references.
- **Done** in this PR — decisions in §14; plan `docs/superpowers/plans/2026-10-12-preflight-phase-2.md`.

## 10. Out of scope

The `vc-fix` plugin entirely (`qa-bug`, `qa-verify-fix`, `qa-fix`, `qa-monitoring`, its
`qa-env-check`, its own `agent-dispatch.md` copy) · CI regression and everything under `ci/` · the
axes 2b–2g · per-case `test-execution-preflight.md`.

## 11. Verification

- `npm run context:check` — paths, `§` anchors, BUDGET-004. `qa-test`, `qa-regression` and
  `qa-test-lifecycle` are in `.prompt-size-baseline.json` and may only shrink; the migration shrinks
  them, so refresh with `npm run context:check:baseline`.
- **Temporary** unit tests on the derivations — drift, ledger Δ, module-id mapping, `UNKNOWN` never
  replaced by `declared`, change-scoped policy, module gating, baseline Δ — run, then **deleted
  before commit** (`CLAUDE.md` NO CODE ⇒ NO UNIT TEST; nothing new is committed under `scripts/unit/`).
- Live on `vcst`: `npm run preflight -- --for ticket --ticket <recent key>`; phase 2 adds
  `npm run regression:plan -- smoke --preflight`.

## 12. Decisions taken in the phase-1 plan

Plan: `docs/superpowers/plans/2026-10-08-preflight-phase-1.md`.

- **Module id ↔ repo:** the `projectUrl` that `/api/platform/modules` already returns, via
  `repoFromProjectUrl()`; `moduleIdToRepoGuess()` only when it is absent, flagged `repoGuessed`.
  Both are imported from `plugins/vc-fix/skills/qa-fix-routing/module-registry.ts` — no new table.
  The `requiresModules` mapping is phase 2's — decided in §14 (`resolveSuiteSource()` does **not** own
  it: it deliberately refuses to turn a slug into a repo).
- **`probe-store-capabilities.mjs`** stays a CLI, as a thin wrapper over `scripts/lib/storefront-caps.mjs`.
- **`mcp-requirements.json`** is validated by its loader, failing loud on a malformed file. No schema
  file and no new gate.
- **CORE required vars** move out of `config.js` into `scripts/lib/env-core.js`, which both read —
  the core cannot import `config.js`, which prints and exits on a missing variable.

## 13. Dependency — `/ticket-context` (VCST-6223, design in ai-tools PR #413)

Two designs written the same day each invented a deployment check. In Jira, VCST-6225 **blocks**
VCST-6223, but the real dependency is partial — one block of five:

| `/ticket-context` | Duplicates | Dependency |
|---|---|---|
| D3 `lib/deploy-check.mjs` — PR's module version vs `/api/platform/modules`, own credential | core `deployed` + change-scoped `expect` | **Yes.** It calls `getEnvFacts()` instead of a second probe |
| `chain_deployed`, the `NOT DEPLOYED` blocker | the same facts; `UNKNOWN` is never upgraded | yes |
| "Prior runs on the same ticket" (Known ground) | `duplicate`, loosely — context there, a duplicate check here | no; may stay as is |
| Ticket / Materials / Known ground / Gaps | — | none; can proceed in parallel now |

So **phase 1's fact core lands first**, and the implementation plan orders it as its first task, so
the `Change` block can build on it as early as possible. Nothing else in VCST-6223 waits.

**Unresolved tension — D1 vs `/ticket-context` Phase 5.** This design keeps pre-flight in `.claude/`
only (D1). `/ticket-context` plans to move to the `vc-fix` plugin (its Phase 5), and a plugin cannot
reference the repo root's `scripts/lib/`. When that move happens, either the core is copied into the
plugin deliberately (as `knowledge/` already is) or D1 is revisited and the core moves to the plugin.
Not blocking: Phase 5 is triggered only when a client deployment needs it. Decide then, in both specs.

## 14. Phase-2 design decisions (2026-10-12)

Settled before the phase-2 plan, from what phase 1 and its first live runs showed.

**D9 — drift on a selected suite's module is a BLOCK.** §6 row 7 said "WARN; one question", which
contradicts §8a rule 7 (a question arises only from a BLOCK). Drift is `declared ≠ deployed`: a deploy
in flight, failed or partial. Mid-regression a landing deploy restarts the platform and fails dozens of
suites falsely, which costs hours of run. So drift on a module that a **selected** suite requires is a
BLOCK with the one question (wait · proceed as is · stop); "proceed as is" covers a permanent drift (a
hand-pinned module) where waiting is pointless. Drift on modules no selected suite requires stays a WARN
and asks nothing. Platform drift (§4) counts as touching every suite.

**D10 — `requiresModules` resolves to a module id by one rule; the manifest carries exact ids where the
rule cannot.** Measured on `main` 2026-10-12: 30 distinct values across 72 of 154 suites, in two
vocabularies — 25 short names (`sales-rep`) and 5 full ids (`VirtoCommerce.UCP`).

- **Rule:** an entry that is a full id (`VirtoCommerce.*`) is used as is (case-insensitive); otherwise
  `VirtoCommerce.` + PascalCase(entry) (`sales-rep` → `VirtoCommerce.SalesRep`). That resolves 26 of 30.
- **No fuzzy matching, ever.** "Contains" resolves `cms` to `VirtoCommerce.XCms`, but the `cms` suites
  (059, 060, 060b) are Page Builder: gating on it would drop or keep suites on someone else's module.
- **The four the rule cannot resolve get exact ids in `config/test-suites.json`** (11 suites):

  | Entry | Suites | Module id | Why the rule fails |
  |---|---|---|---|
  | `returns` | 014c, 050o, 073, 073a, 073b | `VirtoCommerce.Return` | plural |
  | `cms` | 059, 060, 060b | `VirtoCommerce.PageBuilderModule` | the area name, not the module |
  | `import-export` | 064, 064b | `VirtoCommerce.CatalogCsvImportModule` | three modules fit the name; tags `csv`, `catalog` |
  | `channels` | 076 | `VirtoCommerce.CatalogPublishing` | no module of that name (`/api/channels/`) |

  The plan confirms each id against the suite's own steps before writing it. This is not a transcribed
  constant: it records the suite author's declaration in the form that has a source of truth (the
  `module.manifest` id). A side table `slug → id` was rejected as a second vocabulary that drifts.
- **Unresolvable entry ⇒** an UNKNOWN `unmapped-requires:<entry>` row naming its suites; the suite runs.
- **Risk recorded, not fixed (D7):** `ci/lib/suite-manifest.ts` compares `requiresModules` to
  `MODULES_ENABLED` as strings. With `MODULES_ENABLED` unset (the default) nothing changes; a CI run that
  sets it to short names would skip the 11 suites above. Whoever next sets `MODULES_ENABLED` uses ids for
  those entries.
- The schema description of `requiresModules` in `config/test-suites.schema.json` says it holds "VC
  modules … e.g. ['cms', …]"; the plan updates it to the rule above.

**D11 — the platform version is live** (amended §4, PR #424): `deployed.platform` comes from the Admin
page, so the platform takes part in drift (D9) and in the release-ledger Δ like any module.
