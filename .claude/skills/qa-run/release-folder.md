# Release regression — a bundle regression split into waves that several QA run in parallel

The contract behind [`/qa-test-plan stable <N>`](../../knowledge/execution/test-plan/stable-mode.md) (the plan) and
[`/qa-run stable:<N> <wave>`](waves.md) (the run). It is the single source for the folder
layout, every field, the verdict vocabulary and the rules that let two or three QA test one bundle
on one environment at the same time. The commands cite it; they do not restate it.

## 1. Why this exists

A stable-bundle regression is several days of work and several thousand cases. Stable 16 ran as one
person's session and stopped at wave 3 of 8 when that person's usage ran out — and at that moment
the plan, the progress and every triage decision sat in `reports/regression/`, which is gitignored.
Nobody else could continue it, and the next run would have re-triaged the same failures from
scratch.

So a release regression keeps **everything a second person needs in git**, in one folder per
release, and splits the work into **waves** that are independent enough to run side by side.

## 2. The folder — `regression/releases/<release>/`

`<release>` is lower-case and dash-separated: `stable-16`, `stable-17`. The folder is tracked
(`.gitattributes` pins it to LF). Raw run output never goes here — it stays in the owner's local
`reports/regression/<runId>/` (gitignored), and a filed bug carries its own evidence in the tracker.

| Path | Written by | What it is |
|---|---|---|
| `release.json` | planner, once | The machine-readable plan: release, ticket, baseline, bundle, env, waves (§3) |
| `PLAN.md` | planner, once | The human plan: how the scope was decided, waves, prerequisites, env gaps |
| `module-diff.json` | planner | `npm run release:diff` output for the two bundles — the raw facts behind the scope |
| `scope.json` | planner | One row per in-scope component: versions, class (§4), wave, suites, what changed, tickets |
| `waves/<W>/state.json` | that wave's owner only | Who holds the wave, its status, run ids, totals, what was not run (§5) |
| `waves/<W>/ledger.csv` | that wave's owner only | One row per triaged finding — filed or not (§6) |
| `waves/<W>/report.md` | that wave's owner only | The wave report: results per suite, what the failures were, BLOCKED causes, what is left |
| `PROGRESS.md` | **generated** — `npm run release:status -- <release> --write` | The overview. Never edited by hand |

**One author per file.** Every hand-written file has exactly one author. `PROGRESS.md` is the one file
every wave PR touches, and it is generated: `release:check` fails when it is not what `--write` would
produce, and CI checks a PR's merge commit — so a wave PR that raced another one is told to rebase and
re-run `--write`, and a stale overview never reaches `main`. This is the suite rule
([`regression-suites.md`](../../knowledge/execution/regression-suites.md) §Working concurrently on suites) applied to the release
folder.

`npm run release:check -- <release>` validates all of it (shapes, vocabularies, required fields). A
wave PR does not go up while it fails, and CI runs `release:check -- --all` on every PR
(`.github/workflows/gates.yml`), so a broken ledger cannot reach `main`.

## 3. `release.json`

```json
{
  "release": "stable-16", "ticket": "VCST-6042", "baseline": "stable-15",
  "bundle": { "repo": "VirtoCommerce/vc-modules", "from": "v15", "to": "v16", "pr": "<bundle PR url>" },
  "env": { "testEnv": "vcptcore_regression", "platform": "3.1076.1", "theme": "2.59.0" },
  "waves": [
    { "id": "W0", "title": "Smoke gate", "suites": ["042", "078"], "modules": ["Platform"] },
    { "id": "C-platform", "title": "Platform — critical", "tier": "critical", "suites": ["095", "020"], "dependsOn": ["W0"] },
    { "id": "H-platform", "title": "Platform — high", "tier": "high", "suites": ["095", "020"], "dependsOn": ["C-platform"] },
    { "id": "WX", "title": "Exclusive window", "suites": ["096"], "dependsOn": ["H-platform"], "exclusive": ["096"] }
  ]
}
```

- **W0 is always the smoke gate** and every other wave depends on it: a broken job engine or a
  failed login stops the release before anyone spends a wave on it.
- **Waves are priority tier × domain group** (`/qa-test-plan stable` Step 3, [`stable-mode.md`](../../knowledge/execution/test-plan/stable-mode.md)): `tier` is `critical`, `high` or
  `rest` (the cases neither tier selects; run through `--cases` / `suites:filter`), and the domain groups split
  each tier between owners. Tier order is a dependency: every `high` wave depends on every `critical` wave, every
  `rest` wave on every `high` wave — `release:check` fails otherwise. A wave without `tier` runs all of its
  suites' cases (W0, the exclusive wave, and plans written before tiers existed, such as Stable 16).
- A wave's `suites` is a plan, not a promise. The owner re-resolves it with `npm run regression:plan`
  when claiming, and records what actually ran in `state.json`.
- `exclusive` names suites that change state the whole environment shares (§7.2). They live in one
  final exclusive wave, which lists them in both its `suites` and its `exclusive`. A wave that has not
  run yet may not contain an exclusive suite (`release:check` fails); a wave that already ran may — it
  skipped that suite's env-wide cases, and the exclusive wave runs exactly those.
- An optional `note` carries what the title cannot (why a wave exists, what it is waiting for).

## 4. Component classes (`scope.json`)

| Class | Meaning | Scope |
|---|---|---|
| `F` | functional change — a feature or a behaviour fix | full regression of its suites |
| `T` | technical only — framework migration, obsolete removal, mapping or perf rework | its suites, with focus on jobs and mapping |
| `N` | new to this stable line | its suites; read the module's docs first |
| `REBUILD` | version bump, no code file changed (`release:diff` status) | out of scope |

`release:diff` decides CODE vs REBUILD mechanically. F vs T is the planner's judgement from the
commit list, the bundle's `release_notes.md` and `breaking_changes.md`.

## 5. `waves/<W>/state.json`

```json
{ "wave": "W3", "owner": "Name Surname", "status": "RUN_DONE",
  "runIds": ["REG-2026-10-15-W3"], "personas": "own .env.local accounts: USER=…, ORG_USER=…",
  "totals": { "planned": 900, "executed": 817, "pass": 498, "fail": 95, "blocked": 221, "skipped": 3, "ambiguous": 0 },
  "untriaged": 29,
  "notRun": [{ "suites": ["056"], "cases": 48, "reason": "not started before the usage limit" }],
  "handovers": [{ "owner": "Previous Owner", "until": "2026-10-16", "note": "stopped at the usage limit" }],
  "evidence": "where the raw run output lives", "updatedAt": "2026-10-16" }
```

- `totals`: whole numbers; `pass + fail + blocked + skipped + ambiguous = executed`, and `executed ≤ planned`.
  `ambiguous` holds what the run could not decide either way.
- `untriaged`: FAILs that have no ledger row yet. Required once the wave has run; `TRIAGED` and `DONE` need 0.
- `personas`: which accounts the owner signs in as (§7.1). Required from `CLAIMED` on, so a parallel owner
  knows which accounts to avoid.
- `notRun`: suite ids from this wave, a case count and the reason. A `BLOCKED` wave must have it.
- `handovers`: earlier owners, appended by whoever continues the wave.

Status moves forward only:

| Status | Means | Set when |
|---|---|---|
| `NOT_STARTED` | nobody holds it | the planner creates the wave |
| `CLAIMED` | an owner holds it, nothing ran yet | `/qa-run stable:<N> <wave> --claim` |
| `RUNNING` | a run is in progress | the first `/qa-regression` of the wave starts |
| `RUN_DONE` | the run finished; triage not done or not complete | the run is consolidated |
| `TRIAGED` | every FAIL has a ledger row (`untriaged` 0); repairs or filing may still be open | triage is written to the ledger |
| `DONE` | triaged, repairs merged, real bugs filed or explicitly deferred | in the wave's own PR once nothing is open in it, or in the PR that closes its last open item |
| `BLOCKED` | cannot proceed; `notRun[].reason` says why | an env or access blocker stops it |

A partly-run wave is handed over as `RUN_DONE` with `notRun` filled in — the next owner continues it
under the same wave id and appends a run id.

## 6. The triage ledger — `waves/<W>/ledger.csv`

**Every triaged finding gets a row, including the ones that are NOT filed.** A finding that was
dismissed and not written down is re-triaged by the next run at full cost; with a row it is
recognised in one lookup. Filed bugs get a row too, so a recurrence is matched to its ticket.

Columns (exact header, in this order):
`case_id,suite,run_id,status,verdict,new_in_release,summary,reason,decided_by,source,follow_up,reopen_when`

| Column | Rule |
|---|---|
| `case_id` | the suite case id; `OBS-<ISSUE>` for a finding that was not a case row (an incidental observation) |
| `status` | the case result: `FAIL` · `BLOCKED` · `SKIPPED` · `OBSERVED` |
| `verdict` | one of the vocabulary below |
| `new_in_release` | `yes` (introduced by this bundle) · `no` (same on the baseline) · `unknown` |
| `summary` | what was seen, one line |
| `reason` | **why** this verdict — the evidence a re-check would start from. Required |
| `decided_by` | who decided — or, for `PENDING_DECISION`, who must decide |
| `source` | where the reason was established: a kb entry id, a doc, a baseline comparison, a run id |
| `follow_up` | starts with the issue key or the PR (`ai-tools#449`); or `OPEN: <what>`; `DRAFT` for a real bug not filed yet — `DRAFT: same defect as <case>, file once` for every case after the first that shows the same defect |
| `reopen_when` | the condition that makes the verdict stale (`fixtures are reseeded`, `the env config changes`) |

| Verdict | Means | `follow_up` must hold | Also |
|---|---|---|---|
| `REAL_BUG` | a product defect | the issue key, or `DRAFT` | filed per the tracker rules (§8) |
| `BY_DESIGN` | the product works as intended; the case or the expectation was wrong | optional | the behaviour goes to the kb (§9) |
| `TEST_DEFECT` | steps, assertion or the case itself is stale | the repair PR, or `OPEN` | |
| `DATA` | a fixture is missing or wrong on this env | the seeder PR, or `OPEN` | |
| `ENV_CONFIG` | the env is configured differently (a header, a key, a module, a stalled index) | the env change, or `OPEN` | add it to `config/suite-requirements.json` with the cases it hit, so the next pre-flight predicts it |
| `NOT_TESTABLE` | cannot be tested on this env at all (no telemetry backend, needs an isolated stand) | — | |
| `DUPLICATE` | an existing issue | the existing key | |
| `FLAKY` | passed on retry / timing noise | — | |
| `PENDING_DECISION` | a human has to rule (intended behaviour, deprecate vs retarget) | — | `decided_by` names who |

`/qa-triage-results` classes map onto it: `REAL_BUG` → `REAL_BUG`; `TEST_STEPS_DEFECT`,
`ASSERTION_DEFECT`, `STALE_TEST` → `TEST_DEFECT`; `TEST_DATA_DEFECT` → `DATA`; `FLAKY` → `FLAKY`;
`ENV` → `ENV_CONFIG` (or `NOT_TESTABLE` when no config change could make it testable);
`KNOWN_ISSUE` → `DUPLICATE` when it names an issue, else `BY_DESIGN`; a candidate that did not reproduce
on re-check → `FLAKY`. A pre-existing defect stays `REAL_BUG` with `new_in_release: no` — "not a regression"
is not "by design".

**Amend, never append.** A row is keyed by `wave + case_id + run_id`; a re-check of the same run
edits that row. A re-run under a new run id may add a row — the old one stays as history.

**The ledger is read BEFORE triage.** `npm run release:status -- <release> --ledger --suites <ids> --with-baseline`
prints every earlier verdict for the wave's suites — this release's and, when its folder exists, the
`baseline` release's. The triage brief carries it as known ground, so a finding that matches a row and
whose `reopen_when` has not happened is cited, not re-derived. Nobody copies another release's rows.

## 7. Running waves in parallel on one environment

Parallel waves are safe when nothing one wave does can change what another wave reads. Three rules
make that true; the planner designs for them and every owner follows them.

### 7.1 Every owner signs in as their own users

Carts, wishlists, orders, addresses and loyalty balances belong to a user (or an organization). Two
people testing as the same persona destroy each other's preconditions. Each owner points the persona
variables in **their own** `.env.local` at accounts nobody else uses this release, and writes which in
`state.json` `personas`. Resolve them through `config.js`, never off a single `.env` layer
([`../../rules/test-data.md`](../../rules/test-data.md) §Resolving a variable). A pooled state (an
organization-wide loyalty balance) needs its own organization, not just its own user
([`../../rules/test-data.md`](../../rules/test-data.md) §DISPOSABLE FIXTURES rule 4).

### 7.2 Environment-wide changes run alone, at the end

A case that changes what every other session reads is **exclusive**: store or platform settings
(and never a partial `PUT /api/stores` — it replaces the whole store), recurring-job schedules, a
full reindex or rebuild, a backup restore, a platform restart, re-seeding a fixture set other waves
use. The planner lists them in `release.json` `exclusive` and gathers them into a final exclusive
wave that depends on all the others. Inside a parallel wave such a case is skipped and recorded in
`notRun`, never run "quickly".

### 7.3 Seed once, before the parallel waves

The planner (or the W0 owner) seeds everything the waves need before the first parallel wave
starts. **Nobody re-seeds while another wave is running** (its tracker sub-task in progress, §8) — an observation must outlive the fixture
it was made on ([`../../rules/test-data.md`](../../rules/test-data.md) §DISPOSABLE FIXTURES rules 1–2).
A wave that needs its own disposable data creates it under its own personas and deletes it.

**Browser slots are per machine.** Each owner runs on their own machine, so each has the usual three
Playwright lanes ([`../../rules/agents.md`](../../rules/agents.md) §Parallel Execution). Three owners
on one environment are three times the load on it: watch response times in W0 before planning more.

**The machine lane costs no model tokens.** API suites that `suites:lanes` routes to the machine lane
run deterministically (`npm run suites:machine`); only browser cases and triage need an agent. Running
the machine lanes first, or in CI, is the cheapest way to stretch a usage limit.

## 8. Claiming and handing over a wave

- **The tracker holds who has a wave right now.** Git learns about a claim only when the wave PR merges,
  so the planner creates one sub-task per wave under the release ticket (outward-facing, so only on the
  user's yes) — **required whenever more than one person runs waves**; without them the waves are run by
  one person at a time. Claiming = assigning yourself that sub-task, then `state.json` `CLAIMED` on your
  branch. A running wave = its sub-task in progress; that, not `state.json`, is what §7.3 checks.
- **Before claiming, pull `main` and run `npm run release:status -- <release>`** to see what is merged and
  what is pending a decision, then look at the wave sub-tasks for what is held and running right now.
- **The release ticket gets a new comment per finished wave** (`release:report --post`, [`waves.md`](waves.md) Step 7),
  written by that wave's owner and carrying the whole release as of that wave; the wave sub-task gets the run's own
  dashboard. Their ids are kept in the wave's `state.json` `reports`, so re-posting a wave amends its comments.
  `release.json` `jiraProgressComment` names an older hand-written comment, if any — it is not updated any more.
- **Handing over** a half-done wave: leave it `RUN_DONE` with `notRun` and a "Before the next owner
  continues" section in `report.md`, open the PR, and unassign the sub-task.
- **Bugs** are filed per [`../../rules/reports.md`](../../rules/reports.md) and
  [`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) (labels, one comment per ticket per run, screenshots inline),
  linked to the release ticket, after triage — never straight from a run.

## 9. What goes where

| Kind of knowledge | Lives in |
|---|---|
| Plan, wave state, verdicts, reports | `regression/releases/<release>/` (this contract) |
| What the platform was **observed** to do (a by-design answer, a quirk of a deployment) | the kb — `kb_capture` / `kb_confirm` / `kb_dispute` ([`kb-capture-contract.md`](../../knowledge/execution/kb-capture-contract.md)); public, so nothing client-specific |
| A product defect | the tracker, linked to the release ticket |
| A stale case or fixture | a PR on `regression/suites/**` / `scripts/seed-data/**` |
| Runtime fixture ids for the env | `test-data/aliases.<TEST_ENV>.json` |
| Raw run output (HAR, traces, screenshots, results JSON) | the owner's local `reports/regression/<runId>/` — never git |
