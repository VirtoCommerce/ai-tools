# Regression suites: an executable `.spec` suite beside each CSV (design)

**Status:** approved for planning by the owner, 2026-10-21 · **Grew out of:** the vc-test plugin design (VCST-6385,
[spec](2026-10-15-vc-test-plugin-design.md), PR VirtoCommerce/ai-tools#489).
**Inputs:** `regression/suites/`, `config/test-suites.json` and its schema,
`.claude/knowledge/execution/regression-{suites,lanes,promotion,selection}.md`, `.claude/rules/test-data.md`,
the gate scripts named in §11.

## 1. Why

`/qa-test-fast` is expensive because an agent drives Playwright step by step for every check, including
checks that passed last time and only need to be re-run. The owner decided:

- a check that **passed** is saved as an executable Playwright or API `.spec`;
- that `.spec` **is** the new test case, so no separate agent wave runs the new cases;
- in round 2, bug reproductions are re-run through their `.spec`, with no agent in the browser.

The `.spec` files form a separate suite **beside** each CSV, not a replacement for it. The CSV stays the
readable description of the case (steps, expectations, `Catches:`). Exploratory and visual checks stay with
the agent. Regression over the existing corpus is outside vc-test v1, but it must later be able to run these
`.spec` files cheaply.

## 2. Goals, non-goals, anti-goals

**Goals.**
- A passed deterministic check becomes a re-runnable case that costs seconds and no tokens.
- A person finds a case by its ID, understands it from the CSV, and runs it with one command, without an
  agent.
- An agent selects, routes and runs cases with the commands it already uses. Cases with a fresh `.spec` move
  off the browser lane.
- Test data reaches a `.spec` only through `{{VAR}}`, `@td()`, `live-discover` and `random-data`.

**Non-goals.**
- Bulk conversion of the existing corpus (§12 M5 is opt-in and measured).
- Moving or renaming any CSV, suite folder or manifest entry.
- Replacing `graphql-runner` (owner, D4).
- Specs for exploratory, visual or `vs. DESIGN` checks.
- Fixing the manifest schema's existing undeclared fields (`lanes`, `runner`, …). That is a separate
  follow-up.

**Anti-goals: these would be a failure even if everything ran.**
- A `.spec` whose expectations drifted from its CSV row and still passes. That is a vacuous pass with a green
  light on it.
- A brittle locator in round 2 that reports a fixed bug as `NOT FIXED`.
- A password or token written into a trace, a HAR or a committed file.
- A second hand-maintained copy of the ~640 runner-native GraphQL/REST cases.

## 3. Baseline (measured 2026-10-21)

- **Corpus.** 160 CSV suites. 5,421 rows: Automated 1678, Draft 1606, Manual 800, Reviewed 290, empty 419.
- **Case IDs.** Globally unique, regex `scripts/test-cases/lint-test-cases.ts:155`. Results and traces are
  keyed by the bare ID.
- **Gates ignore non-CSV files.** Every gate that walks `regression/suites/**` filters to `.csv`:
  `sync-test-suites.ts allSuiteCsvs`, `validate-td-refs.ts findCSVFiles`, `tc:alloc`. A new `.csv` there is a
  fatal orphan. So a `.spec.ts` beside a CSV breaks nothing today.
  - The one exception is `ci/run-suite-audit.ts:391-408`, which runs `git status`, `checkout` and `add`
    over the whole `regression/suites` directory.
- **Lanes are already per case.** The lanes are machine / browser / manual / deprecated.
  - Machine is `graphql-runner --case <csv>:<ID>`, with no LLM. Its exit codes are 0 PASS, 1 FAIL,
    2 structural (back to the browser lane), 3 uncaught.
  - Lane fragments are merged by `scripts/lib/suite-results-merge.ts`.
  - UI-grammar rows are coded `EX-300`: no executor exists for them.
  - About 640 machine-ready cases sit in 21 mixed suites (`npm run suites:lanes:all`), and pure-machine
    suites add more.
- **Playwright is installed but unused.** `@playwright/test` ^1.61.1 is a devDependency and is imported
  nowhere. There is no `playwright.config.*` and no `*.spec.*` anywhere.
- **Data and auth are already resolvable from code.**
  - Data: `scripts/lib/test-data-resolver.ts` (`TestDataResolver.resolve`, `explainMiss`),
    `scripts/lib/graphql-substitute.ts` (`substituteVars` / `substituteEnv`), `scripts/lib/live-discover.ts`,
    `scripts/lib/random-data.ts`, and `config.js` (the layered loader).
  - Auth: `scripts/auth/save-storage-state.ts` writes storageState files to the gitignored
    `test-results/auth/`, without exposing passwords.
- **The manifest has an executor hook, used once.** `runner` + `runnerCommand` (suite 048c) is read by
  `ci/lib/lane-classifier.ts:130` and selects the deterministic lane.
- **CI routes whole suites.** `ci/run-regression.ts` does not use the per-case `suites:lanes`, `machine` or
  `merge` path. Only `regression-orchestrator` does.

## 4. Decisions

| # | Question | Decision | By |
|---|---|---|---|
| D1 | Spec or CSV as the case? | Both, as one unit. The CSV row describes, the `.spec` executes | owner |
| D2 | When is a spec written? | When a deterministic check **passed**, or as a bug's reproduction. The spec is the new case, and no agent wave runs the new cases that have a spec (rows without one: D16) | owner |
| D3 | Round 2 | Each prior bug's reproduction is re-run through its spec, with no browser agent | owner |
| D4 | Runner-native GraphQL/REST cases | **Not rewritten.** A single wrapper spec exposes them to Playwright and executes them with `graphql-runner` (§7) | owner |
| D5 | Where a spec lives | A folder named after the CSV stem, beside the CSV, with one file per case: `<CASE-ID>.spec.ts` (§5) | my call |
| D6 | How a row links to its spec | By case ID only: file name = test title prefix = CSV `ID`. Nothing is written into the CSV or the manifest, because presence is derived (§6) | my call |
| D7 | Which side is true when they diverge | The CSV, for **what** is checked and expected. The spec is never the reason to change an expectation. A source hash detects drift (§6) | my call |
| D8 | A failing spec | `FAIL` only when an assertion step fails. A failure before or outside the assertions (locator, navigation, auth, timeout) is `BLOCKED` as a spec defect and falls back to the agent (§8) | my call |
| D9 | A new spec is unverified | It runs **once** after authoring: deterministic, seconds, no agent. This is a check of the spec, not the agent wave D2 removed. A passed check must PASS; a bug reproduction must FAIL on an assertion step (§9) | my call, check it |
| D10 | `Automation_Status` | No new value. `Automated` widens to "executable without a human: by an agent, the runner or a spec" | my call |
| D11 | Who writes what | `test-management-specialist` keeps writing the CSV cases. A **new agent, `test-automation-engineer`**, writes the specs. It may read the CSV but never edit it, so a failing spec can only be fixed in the spec, which enforces D7 by role. The one-author-per-suite rule holds as a **sequential hand-over**: the specialist writes the row and hands the suite over, then the engineer writes the spec. The two never work in one suite at the same time (§9) | owner |
| D17 | The engineer's knowledge | A new skill, **`/qa-test-automation`**. Its `SKILL.md` stays short. The practice lives in supporting files: locator priority, web-first `expect` with no fixed waits, the `A<n>` / `X<n>` mapping, the data door and auth fixtures, isolation and cleanup, an anti-flake checklist, and how `vc-frontend` changes typically break a spec. The engineer also owns spec repairs: `STALE`, `spec-defect` from triage, and the M5 backfill. Model: Opus, like the dev agents, because a spec is code | owner (names, split) · my call (model, contents) |
| D18 | `test-management-specialist`'s prompt | **Must shrink.** It is about 27K chars against the 19K BUDGET-004 cap, and is on the baseline that may only go down. Detail moves into its skills' supporting files until the agent definition is under the cap. The hand-over to the engineer is added inside that budget, never on top of it | owner |
| D12 | A newly passed API check | It is written as a **runner-grammar CSV row** (`[GQL-OP]` / `[REST-OP]`), which lands on the machine lane with no spec. A handwritten API spec is only for what the grammar cannot express, such as logic between calls. This follows from D4 | my call |
| D13 | `Cross_Layer_Checks` | They are expectations too. Each item maps to `test.step('X<n>: …')`. `[CONSOLE]` and `[NETWORK]` are scored by fixture collectors. `X<n>` failures are `FAIL` like `A<n>`. The cell is in the hash. `Failure_Signals` is a diagnostic hint, not executed and not hashed | my call |
| D15 | Where the harness is built | **In this repo first (M1–M2)**, where the corpus lives. In M3, vc-test gets its own self-contained copy, as vc-fix does (`plugins/CLAUDE.md`): paths resolve through `outputRoot()` / `pluginRoot()`, and the `SP-*` rules sit in the plugin's copy of the suite lint. Clients get specs with vc-test v1 | owner |
| D16 | A passed check that cannot be scripted | It gets a CSV row with no spec, and **a mini agent wave runs only those rows**, once, after authoring. Rows that have a spec get the deterministic run of D9 instead. This narrows the U18 wave rather than removing it | owner |
| D14 | Browsers | A script-lane case runs **once**, on the suite's `preferredBrowser` or else the manifest default. The per-browser projects exist for people's cross-browser runs; `suites:script` invokes one project, so a fragment never holds one ID twice | my call |

## 5. Layout

```
regression/
  suites/
    Frontend/cart/
      028-cart-core.csv            ← unchanged, the description
      028-cart-core/               ← the suite's spec folder, same stem
        CART-001.spec.ts
        CART-014.spec.ts
  lib/
    data.ts                        ← env() / td() / discover / random — the only data door (§10)
    fixtures.ts                    ← test.extend: signedInAs(role), evidence paths, HAR
    runner-cases.spec.ts           ← the wrapper over runner-native rows (§7)
playwright.config.ts               ← repo root
```

- **Why a folder beside the CSV.** A person browsing a module sees the description and its executables side
  by side. `npx playwright test regression/suites/Frontend/cart/028-cart-core` runs one suite. No gate reads
  the folder until §11 teaches it to.
- **Why one file per case.** Files are added and deleted per case. Two cases never conflict in one file. The
  file name is the link. A deprecated row removes exactly one file.
- **Shared setup** lives in `regression/lib/fixtures.ts`, never in a per-suite helper copied between files.
- **`playwright.config.ts` has two kinds of projects:**
  - **`script`**: `testMatch: regression/suites/**/*.spec.ts`, with one project per browser of the
    manifest's `browserPool`. The browsers, viewport and other lane settings are read from
    `config/test-suites.json` and `config/mcp-playwright-*.config.json`, never transcribed.
  - **`runner`**: `testMatch: regression/lib/runner-cases.spec.ts`. No browser is launched.
  - `outputDir` comes from the run (`RUN_DIR`), with a fallback to the gitignored `test-results/`. Trace is
    kept on failure, screenshots on failure, HAR always, video never (lane configs dropped video
    2026-09-21).

## 6. The link and the truth

- **Link.** The spec `regression/suites/<path>/<stem>/<ID>.spec.ts` declares exactly one
  `test('<ID>: <Title>', …)` and a header:

  ```ts
  // @case CART-001
  // @source sha256:<12 hex>   ← of the row's Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks and Cleanup cells
  ```

  The ID must exist in the sibling CSV, and the row must not be `Deprecated` or `Manual`. A runner-native row
  never gets a handwritten spec, because the wrapper covers it (D4).
- **Coverage of the expectations.** Each item of the row's `Assertions` cell maps to one
  `test.step('A<n>: …')` whose body holds that item's `expect` calls. Lint checks that A1…An are all present,
  so a spec cannot quietly drop an expectation. Each `Cross_Layer_Checks` item maps the same way to
  `X<n>` (D13). Splitting the cells into items is the builder's work: reuse `scripts/lib/ui-step-parser.ts`.
- **Truth.** The CSV is normative for intent: what is set up, done, expected, and what it `Catches:`. The
  spec is normative only for *how*: locators, waits, the order of API calls. Consequences:
  - A row edit, such as a `REPAIR` by `/qa-review-tests --fix` or `/qa-test` 2a, changes the hash. The spec
    becomes **STALE**. Lint warns without failing, so the CSV edit is not blocked. A stale case routes to the
    browser lane until `test-automation-engineer` updates the spec and re-stamps it.
  - Re-stamping without changing the spec to match is the one way to defeat the guard. The re-stamp command
    says so, and `/qa-review-tests` reviews re-stamps.
  - A spec that disagrees with a passing agent run of its CSV row is a **spec** defect. A spec that passes
    where the CSV expectation is not met is also a spec defect. Neither is ever fixed by editing the CSV
    expectation (`cases-that-catch-bugs.md`).

## 7. The wrapper for runner-native cases (D4)

`regression/lib/runner-cases.spec.ts` enumerates the manifest's suites at collection time and classifies
every row with the same classifier `suites:lanes` uses (`scripts/lib/case-classifier.ts`). It registers one
`test('<ID>: <Title>')` per **machine-lane** row, grouped in a `test.describe('<suiteId> <name>')`, and runs
it through `graphql-runner`. Running it in process (the file guards its CLI with `isCli`, and `loadCase` is
exported) or spawning `tsx scripts/graphql/graphql-runner.ts --case <csv>:<ID>` is the builder's choice.

| Runner exit | Playwright outcome |
|---|---|
| 0 | pass |
| 1 | fail, with the runner's failed assertions attached |
| 2 structural | `test.skip`, annotated "routed to browser lane", the same meaning as in `suites:machine` |
| 3 | error |

- **No case is copied.** The CSV row stays the only source for these cases, so they cannot diverge, and the
  runner's validation against the introspected schema is kept.
- **The wrapper is a door, not a second engine.** `suites:machine` stays the lane executor that
  `regression-orchestrator` calls. The two must give identical verdicts, and M1's exit criterion checks that.
- **Possible later step, not promised here:** `suites:machine` itself runs through the wrapper, so that every
  lane reports in one format.

## 8. Lanes, verdicts, results

- **Classification order** in `suites:lanes`:
  1. `Deprecated` / `Manual` → as today.
  2. A **fresh** spec → new lane **`script`**.
  3. Runner-native → `machine`.
  4. Otherwise → `browser`.
  
  A stale spec falls through to `browser` and is listed in `suite-{ID}-lanes.json` as `staleSpec`. Fail-closed
  as today: doubt routes to the browser lane.
- **`suites:script -- <ID> --run-id <R>`** runs the script-lane cases with Playwright (`--project script`,
  exact files) and writes `suite-{ID}-results.script.json` in the existing fragment shape.
  `suite-results-merge.ts` folds it in with `lane: "script"`.
- **How a spec failure is classified (D8):**
  - An `expect` fails inside an `A<n>` or `X<n>` step → `FAIL`, a product verdict.
  - Anything else → `BLOCKED` with `notes: "spec-defect: <reason>"`: a failure before the first A-step, a
    locator or navigation timeout, a fixture or auth failure.
  
  In a run with an agent budget, a blocked case is re-queued to the browser lane in the same run, the way
  `machine-lane.ts` reroutes today: the plan is edited and no script-lane row is written, because the merger
  treats one ID in two fragments as fatal. Otherwise it stays `BLOCKED`. `/qa-triage-results` classifies
  `spec-defect` as a test defect, never as a product bug.
- **Promotion.** `tc:promote` counts a `script` PASS exactly like a browser-lane PASS (Draft → Automated,
  never a demotion).

## 9. Authoring, and round 2

1. **Execution (vc-test / `/qa-test-fast` checklist run).** The specialist runs the item through Playwright
   MCP as today. Each MCP action already returns the Playwright code it ran. For an item that ends `PASS`, or
   for a reproduced bug, the specialist keeps that action log in the run's gitignored working folder.
   - It is not a report file, and it is never quoted into a tracker comment.
   - Where exactly it lives is the builder's choice, within `results/` or the vc-test run folder.
   - Items that are exploratory, visual, `vs. DESIGN`, or have an assertion a script cannot score, keep no
     log and get no spec.
2. **Authoring, in two hand-overs (D11).**
   - **The case.** `test-management-specialist`, in its one U18 dispatch, writes the CSV rows (with
     `Catches:` for a bug), marks which rows have an action log, and hands the suite back.
   - **The spec.** `test-automation-engineer`, dispatched once per suite with file paths only (the CSV, the
     row IDs, the action logs):
     - writes `<ID>.spec.ts` for each row;
     - replaces every observed literal with `env()` / `td()` / `discover` / `random` (§10), keeping UI
       strings as `{OBSERVED}` text locators;
     - stamps the hash.
   
   A row the engineer cannot script, or whose expectation it thinks is wrong, is reported back, never
   edited. It then falls to the mini wave of D16.
3. **The one run (D9)**, run by the engineer. `npm run case:run -- <ID>`, on the same build. A passed check must PASS. A bug
   reproduction must FAIL on an A-step, which is the "prove it fails once" of `cases-that-catch-bugs.md`. Any
   other outcome is a defect of the spec, fixed by the author before close-out. It never changes the verdict,
   which was decided on the checklist (vc-test U18).
   - **Rows without a spec (D16)** run in one mini agent wave: those rows only, once. A failure there is a
     defect of the case, as in U18.
4. **Round N ≥ 2 (vc-test U15).**
   - Every prior bug's reproduction runs through its spec, with no agent: `PASS` ⇒ `FIXED`, A-step `FAIL` ⇒
     `NOT FIXED`, `BLOCKED` (spec defect) ⇒ the agent replays that CSV row in the browser for that item only.
   - The "nothing next to the fix broke" risks stay agent checklist items.
   - The vc-test spec (PR #489) is amended to say this. That amendment is a change to that document, not to
     this one.

## 10. Data, secrets, evidence

- **`regression/lib/data.ts` is the only door.** It imports `config.js` (the layered loader) and exports:
  - `env(name)`: reads `process.env`, throws when the value is unset, and **refuses** names matching
    `/PASSWORD|SECRET|TOKEN|API_KEY/`;
  - `td(ref)`: `TestDataResolver.resolve`, which throws with `explainMiss` on a miss;
  - `discover`: re-exports `live-discover`;
  - `random`: re-exports `random-data`, with the `AGENT-TEST-` prefix so teardown sweeps the data.
- **Secrets are reachable only through the auth fixtures.** No test types a password, so none appears in a
  trace, a HAR or a screenshot.
  - `signedInAs(role)` loads a storageState, generated in `globalSetup` when it is missing. Storefront roles
    use `scripts/auth/save-storage-state.ts`, extended from its fixed alias list to any role. M1 adds the
    Admin SPA sign-in to the same mechanism.
  - `apiAs(role)` is a Playwright `request` context whose bearer token comes from `resolveRole()` in
    `scripts/lib/graphql-auth`, in process and never logged. It is for the rare handwritten API spec (D12).
- **Session tokens in HAR and traces.** They are short-lived tokens of test users and land in the run's
  gitignored output folder, exactly like today's agent-lane HARs. They are never committed and never attached
  to a tracker comment. No new redaction step is added (my call).
- **What lint forbids in a spec:**
  - `process.env` and an import of `config.js` outside `data.ts`;
  - literal URLs, GUIDs, e-mail addresses and password-like strings;
  - any `reports/…` path (THIRD RULE; this is the `DV-024` analogue).
  
  The output location comes from the run (`RUN_DIR`) through the fixture.
- **Locators.** Prefer role, label and text. Use the storefront's generated selectors
  (`scripts/lib/storefront-selectors.generated.ts`) where they exist. A raw CSS selector is allowed and is
  flagged in review.

## 11. Gates and scripts affected

| Script / gate | Change | Phase |
|---|---|---|
| `playwright.config.ts` | **new**, §5 | M1 |
| `regression/lib/{data,fixtures}.ts`, `regression/lib/runner-cases.spec.ts` | **new**, §7, §10 | M1 |
| `scripts/test-cases/show-case.ts` → `case:show`, `case:run` | **new**, §13 | M1 |
| `suites:lint` (`scripts/test-cases/sync-test-suites.ts`) | **new rules `SP-*`**, fatal unless noted: orphan spec (no sibling row) · spec for a `Deprecated` / `Manual` / runner-native row · name / title / `@case` mismatch · missing A-step · spec folder with no sibling CSV · stale hash (**warning**). One spec per row | M1 |
| `td:validate` (`scripts/test-data/validate-td-refs.ts`) | also scans `regression/**/*.spec.ts` for the §10 rules. Every `td()` reference must resolve, the same check DV-013 runs for CSV cells | M1 |
| `ci/run-suite-audit.ts:391-408` | narrow the git pathspecs to `regression/suites/**/*.csv`, so the audit never stages or reverts a spec | M1 |
| `package.json` scripts, `.gitignore` (`playwright-report/`), the TS scope of `.claude/hooks/typecheck-ts-only.mjs` | entries for the new files | M1 |
| `suites:lanes` (`scripts/regression/plan-lanes.ts`) + `scripts/lib/case-classifier.ts` | `script` lane, `staleSpec`, the §8 order | M2 |
| `suites:script` (`scripts/regression/script-lane.ts`) | **new**, §8 | M2 |
| `suites:merge` (`scripts/lib/suite-results-merge.ts`) | accept the `script` fragment | M2 |
| `tc:promote` (`scripts/test-cases/promote-cases.ts`) | `script` PASS counts | M2 |
| `suites:executability` (`scripts/test-cases/report-executability.ts`) | report spec coverage and stale specs | M2 |
| `ci/lib/lane-classifier.ts`, `ci/lib/scheduler.ts`, `ci/run-regression.ts` | run a suite's script-lane cases before its agent run, and hand the agent only the rest | M4 |
| **Unchanged:** `tc:alloc`, `tc:scaffold`, `tc:scope`, `regression:select`, `regression:plan`, `suites:filter`, `suites:machine`, `td:reconcile`, `selectors:sync`, `context:check` (it only sees the doc paths edited below) | — | — |

**Docs and prompts.**

- **`CLAUDE.md` §Project Overview** has the sentence "NOT traditional `.spec.js` files" and must be
  reworded. It is in the always-loaded tier, so the replacement stays one line.
- **`.claude/knowledge/execution/`:**
  - `regression-suites.md`: layout, and the one-author rule covering the spec folder;
  - `regression-lanes.md`: the `script` lane;
  - `regression-promotion.md`;
  - `when-to-write-a-test.md`: a spec is a corpus case, not a `scripts/unit/` test, so RULE 2 does not
    apply to it;
  - `test-data-authoring.md` §Where this rule is enforced.
- **Elsewhere:**
  - `regression/suites/README.md`;
  - `.claude/skills/qa-test-cases-generator/test-case-template.md`, for the `Automated` meaning;
  - **new** `.claude/agents/test-automation-engineer.md` and **new** `.claude/skills/qa-test-automation/`
    (D11, D17), plus a row in `.claude/rules/agents.md` §QA Team (no browser lane: it runs specs through
    Playwright, not through MCP);
  - `test-management-specialist`: the hand-over, and the prompt diet under the 19K cap (D18);
  - `/qa-test-fast` execution (action log);
  - `regression-orchestrator` Step 3 (`suites:script`);
  - `/qa-review-tests` (a spec dimension, including re-stamps);
  - `/qa-triage-results` (`spec-defect`).
- **The vc-test spec** (U15, U18) is amended in PR #489 or a follow-up.

The new gate scripts follow RULE 2: temporary unit tests while they are being built, deleted before commit.

## 12. Migration plan

Nothing moves. No CSV path, folder or manifest entry changes in any phase, so migration means adding specs
and teaching gates about them.

| Phase | Content | Exit criterion |
|---|---|---|
| **M0** | This spec approved | — |
| **M1 Foundation** | config, `regression/lib/*`, the wrapper, `case:show` / `case:run`, the `SP-*` and `td:validate` rules, the audit pathspec, the doc updates; `test-automation-engineer` + `/qa-test-automation` (D17); the `test-management-specialist` prompt diet (D18). **Pilot:** 3 specs, written by `test-automation-engineer`, for `Automated` UI cases with scoreable assertions in `028` (cart core) | `npx playwright test --project runner` gives the same verdicts as `suites:machine` for every case of `050a`, `050m` and `087` in one run. `test-management-specialist.md` is under 19K chars and its baseline entry is deleted. The 3 pilot specs pass on `vcst`. A deliberately broken expectation in one pilot spec fails on an A-step. `suites:lint` and `td:validate` are green |
| **M2 Lane** | §8 in `suites:lanes`, `suites:script`, merge and promote; `regression-orchestrator` Step 3 | `/qa-regression 028` routes the 3 pilot cases to `script` and the merged `suite-028-results.json` keeps its shape. A stale pilot spec routes to `browser` |
| **M3 Authoring** | §9 in `/qa-test-fast` and vc-test (U18 and U15 amended); the vc-test self-contained copy of the harness and the `SP-*` lint (D15); the mini wave for rows without a spec (D16) | One real ticket: round 1 leaves specs for its passed scriptable items and its bug reproductions. Round 2 replays the reproductions through specs with no browser agent. Tokens and wall-clock are measured against the ticket's round 1 |
| **M4 CI** | §11 M4 rows | A CI `smoke` run executes the specs that exist without an agent, and the agent prompt receives only the remaining rows |
| **M5 Backfill** (opt-in) | Convert existing `Automated` browser-lane cases, most-run first, from `history.json` | Decided on M3/M4 cost data, never as a bulk conversion. Out of scope until then |

## 13. Finding, understanding, running

| | A person | An agent |
|---|---|---|
| **Find** | `npm run case:show -- CART-001` prints the suite, CSV path, lane, spec path and its freshness, and the last result from the newest per-case `reports/regression/*/suite-*-results.json` (`history.json` holds per-suite rows only). Browsing works too: the module folder holds `028-cart-core.csv` and `028-cart-core/` | `tc:scope` / `regression:select` / `regression:plan`, unchanged |
| **Understand** | The same `case:show` output renders the row as text (title, preconditions, steps, assertions, `Catches:` / `Behavior:`). The spec reads as one `test.step` per expectation | The CSV row. The spec is read only to repair it |
| **Run** | `npm run case:run -- CART-001 [--headed\|--ui] [--env <TEST_ENV>]` dispatches by lane: `script` → that spec file, `machine` → the wrapper's test, `browser` → prints `/qa-regression --cases CART-001` because it needs an agent. Also `npx playwright test <suite folder>` and `npx playwright test --ui` | `suites:lanes` → `suites:script` + `suites:machine` + the browser agent → `suites:merge`, so the cost lands on the browser lane only |

## 14. Left to the builder

- The in-process or spawned runner call in the wrapper.
- How the `Assertions` cell is split into A-items, and how the hash input is normalised.
- The exact names of the commands and the `SP-*` codes.
- How `globalSetup` decides that a storageState file has expired.
- The `tsconfig` include and the typecheck hook scope.
- Where the action log lives in the run folder.

## 15. Risks

- **Selector rot when `vc-frontend` changes.** A failing locator is `BLOCKED` (spec defect) and falls back
  to the agent, so it never becomes a false `NOT FIXED` (D8). `suites:executability` makes the rot rate
  visible.
- **Version drift between `@playwright/test` and the pinned `@playwright/mcp`.** The action-log code is
  emitted by the MCP's Playwright. The builder pins compatible versions in M1.
- **A pooled or disposable fixture shared by specs that run in parallel.** The DISPOSABLE FIXTURES rule 4
  applies to specs as it does to suites. Script-lane specs of one suite run serially by default
  (`fullyParallel: false`).
