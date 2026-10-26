# Regression suites: an executable `.spec` suite beside each CSV (design)

**Status:** approved for planning by the owner, 2026-10-21. Trimmed the same day to a minimal M1, on the
owner's request: fewer prompts and fewer rules, because every one costs tokens and is one more place to go
wrong. **Grew out of:** the vc-test plugin design (VCST-6385, [spec](2026-10-15-vc-test-plugin-design.md),
PR VirtoCommerce/ai-tools#489).

## 1. Why

`/qa-test-fast` is expensive because an agent drives Playwright step by step for every check, including
checks that passed last time and only need to be re-run. The owner decided:

- a check that **passed** is saved as an executable Playwright or API `.spec`;
- that `.spec` **is** the new test case;
- in round 2, bug reproductions are re-run through their `.spec`, with no agent in the browser.

The `.spec` files sit **beside** each CSV and do not replace it. The CSV stays the readable description of the
case (steps, expectations, `Catches:`). Exploratory and visual checks stay with the agent.

**The measure of success is fewer tokens and fewer invented verdicts.** A re-run costs seconds and no tokens,
and a deterministic script cannot make up a result. Anything this design adds has to pay for itself against
that measure; anything that does not is deferred (§9).

## 2. Goals, non-goals, anti-goals

- **Goals.**
  - A passed deterministic check becomes a re-runnable case with no agent.
  - A person runs any case with `npx playwright test`.
  - Test data reaches a spec only through `{{VAR}}`, `@td()`, `live-discover` and `random-data`.
- **Non-goals.**
  - Bulk conversion of the existing corpus.
  - Moving or renaming any CSV, folder or manifest entry.
  - Replacing `graphql-runner`.
  - Specs for exploratory, visual or `vs. DESIGN` checks.
- **Anti-goals.**
  - A new always-paid prompt: an agent, or a rule in the always-loaded tier, that is not strictly needed.
  - A second hand-maintained copy of the ~640 runner-native GraphQL/REST cases.
  - A password in a trace, a HAR or a committed file.

## 3. Baseline (measured 2026-10-21)

- **Corpus.** 160 CSV suites, with globally unique case IDs (`scripts/test-cases/lint-test-cases.ts:155`).
- **Gates already ignore specs.** Every gate that walks `regression/suites/**` keeps only `.csv` files, so a
  `.spec.ts` beside a CSV breaks nothing. The one exception is `ci/run-suite-audit.ts:391-408`, which runs
  `git status`, `checkout` and `add` over the whole folder.
- **Machine lane.** About 640 runner-native cases already run with no LLM, through `graphql-runner --case`.
  Its exit codes are 0 PASS, 1 FAIL, 2 structural, 3 uncaught. UI rows have no executor (`EX-300`).
- **Playwright is installed but unused.** `@playwright/test` ^1.61.1 is installed, is used nowhere, and has
  no config.
- **Data and auth are already resolvable from code.**
  - Data: `TestDataResolver` (`scripts/lib/test-data-resolver.ts`), `live-discover`, `random-data`, and
    `config.js`.
  - Auth: `scripts/auth/save-storage-state.ts` writes storageState files to the gitignored
    `test-results/auth/` without exposing passwords.
- **`test-management-specialist.md`** is about 27K chars against the 19K BUDGET-004 cap, and is on the
  baseline that may only go down.

## 4. Decisions

| # | Decision | By |
|---|---|---|
| D1 | A CSV row and its spec are one case. The row describes it, the spec executes it | owner |
| D2 | A spec is written when a deterministic check **passed**, or as a bug's reproduction. No agent wave runs cases that have a spec **approved by the D17 fidelity review**; an unreviewed spec keeps its case on the agent lane | owner |
| D3 | Round 2 re-runs each prior bug's reproduction through its spec, with no browser agent | owner |
| D4 | Runner-native GraphQL/REST cases are **not rewritten**. One wrapper spec exposes them to Playwright and executes them with `graphql-runner` (§6) | owner |
| D5 | Layout: a folder named after the CSV stem, beside the CSV, with one file per case, `<CASE-ID>.spec.ts` | my call |
| D6 | The link is the case ID: file name = `test()` title prefix = CSV `ID`. Nothing is written into the CSV or the manifest | my call |
| D7 | The CSV is the truth for **what** is checked and expected. A failing spec is fixed in the spec, never by editing the CSV expectation (`cases-that-catch-bugs.md`) | my call |
| D8 | An `expect` failure is `FAIL`. Any other error is `BLOCKED` with `spec-defect` in its notes: an action or navigation timeout, a fixture or auth failure | my call |
| D9 | A new spec runs **once** after it is written: deterministic, seconds, no agent. A passed check must PASS; a bug reproduction must FAIL on an `expect` | my call |
| D10 | `Automation_Status` gets no new value | my call |
| D11 | **No new agent.** Whoever writes the case writes its spec, which today is `test-management-specialist` (in a vc-test run, the narrow checklist agent — vc-test U55), loading the skill `/qa-test-automation` **only** while writing a spec. The skill costs nothing on any other dispatch | owner |
| D12 | A newly passed API check is written as a runner-grammar CSV row, which needs no spec. A handwritten API spec is only for what the grammar cannot express | my call |
| D13 | A spec runs once, on the suite's `preferredBrowser` or else the manifest default | my call |
| D14 | Harness in this repo first. vc-test gets a self-contained copy in M3, as vc-fix does | owner |
| D15 | A passed check that cannot be scripted gets a CSV row with no spec, and a mini agent wave runs only those rows | owner |
| D16 | `test-management-specialist.md` must get under the 19K cap. Its detail moves into its skills' supporting files, and the spec hand-off is added inside that budget | owner |
| D18 | A spec is written **directly** from source and the generated selectors and run at once; a `playwright-cli` session attached to the paused draft spec (`--debug=cli`, signed in by its own fixtures) is the fallback, and its printed code the draft, not the default — the default has no browser agent per checklist item (vc-test U27, B4, U55) | owner, 2026-10-21 |
| D17 | A new or changed spec passes a **fidelity review** before it replaces the agent in a regression run. It is a new `/qa-review-tests` dimension, done by a fresh agent that is not the spec's author, once per spec change (not per run). It builds the table "row item (Assertions, Cross_Layer_Checks) → `expect` → OK / WEAKENED / MISSING". Any WEAKENED or MISSING item means the case stays on the agent lane. The approval lapses when the spec or its row changes; how that is recorded and detected is the builder's call (§8, M3) | owner |
| D19 | **Spec-first for a case born scriptable — an experiment (M3b), not yet the rule.** The spec is written alone, with the case's contract in its header; the CSV row is **generated** from it as an index, with no prose Steps, and is never hand-edited. Every `expect` names the source of its expectation (AC, `BL-*`, doc), so the expectation still comes from outside the build. Agent-only cases and the existing corpus keep the full hand-written row. Until M3b passes, D1, D6, D7 and D11 hold as written (§8a) | owner, 2026-10-22 |

## 5. Layout

```
regression/
  suites/Frontend/cart/
    028-cart-core.csv            ← unchanged
    028-cart-core/
      CART-001.spec.ts
  lib/
    data.ts                      ← env() · td() · discover · random — the only data door
    fixtures.ts                  ← test.extend: signedInAs(role), apiAs(role)
    runner-cases.spec.ts         ← the wrapper (§6)
playwright.config.ts
```

`playwright.config.ts` has two projects:

- **`script`**: `testMatch: regression/suites/**/*.spec.ts`, using the default browser of
  `config/test-suites.json`.
- **`runner`**: `testMatch: regression/lib/runner-cases.spec.ts`. No browser is launched.

Settings:

- `outputDir`: `RUN_DIR` when set, else the gitignored `test-results/`.
- Trace and screenshot are kept on failure only. HAR is captured, video is off.
- `fullyParallel: false`, because two specs on one disposable fixture must not collide
  (test-data DISPOSABLE FIXTURES rule 4).

## 6. The wrapper (D4)

`regression/lib/runner-cases.spec.ts` reads the manifest, classifies each row with `classifyCase`
(`scripts/lib/case-classifier.ts`), and registers one `test('<ID>: <Title>')` per `machine`-lane row. Each test
spawns `graphql-runner --case <csv>:<ID>` the way `scripts/regression/machine-lane.ts` does.

| Runner exit | Test outcome |
|---|---|
| 0 | pass |
| 1 | fail |
| 2 | skip, annotated "browser lane" |
| 3 | error |

No case is copied, so these cases cannot diverge from their CSV rows. `suites:machine` stays the executor the
orchestrator calls.

## 7. Data, secrets, locators

- **`regression/lib/data.ts`** imports `config.js` and exports:
  - `env(name)`: throws when the value is unset, and refuses names matching
    `/PASSWORD|SECRET|TOKEN|API_KEY/`;
  - `td(ref)`: `TestDataResolver.resolve`, which throws on a miss;
  - `discover`: re-exports `live-discover`;
  - `random`: re-exports `random-data`.
- **Secrets are reachable only through the auth fixtures.** No test types a password.
  - `signedInAs(role)` uses a storageState from `save-storage-state.ts`.
  - `apiAs(role)` is a request context with a token from `resolveRole` + `acquireToken`.
  
  A short-lived test-user session token in the gitignored output folder is handled as the agent-lane HARs are
  today.
- **Locators.** Prefer role, label and text. Use the generated storefront selectors where they exist.

## 8. Authoring and round 2

1. **Writing (default).** The spec is written **directly** from source and the generated storefront selectors
   (`selectors:sync`), with every literal through `data.ts`, and run at once headless (D9). No browser agent
   drives the check first. **Fallback:** only when the selectors cannot be found that way, the author runs the
   item through Playwright MCP and uses the code MCP reports as a draft, kept in the run's gitignored folder
   (D18).
2. **Authoring.** The CSV row is written by `test-management-specialist`; the spec, loading
   `/qa-test-automation`, by whoever writes the case (D11) — in a vc-test run that is the narrow checklist
   agent, which also writes the runner rows (vc-test U55).
3. **The one run (D9).** A spec that does not behave as D9 requires is a defect of the spec. It never changes
   the checklist verdict.
4. **Fidelity review (D17).** A fresh reviewer maps every row item to its `expect`. Until it approves, the case
   keeps running on the agent lane, and a round-2 replay of an unreviewed reproduction is confirmed by the agent.
5. **Rows without a spec (D15)** run in one mini agent wave.
6. **Round 2:** spec `PASS` ⇒ `FIXED`; `expect` `FAIL` ⇒ `NOT FIXED`; `BLOCKED` (spec defect) ⇒ the agent
   replays that row only.

## 8a. Spec-first, the CSV as an index (D19, experiment)

**Why.** Today a scriptable case is written twice: a row with its steps in prose, then a spec with the same
steps in code. That costs the author's tokens twice and leaves two copies that can drift.

**What the row does that must not be lost.**
1. **An expectation independent of the build.** The row states what *should* happen before anyone looks at the
   page. An author who writes only the spec takes both the expectation and the check from the same screen and
   can encode the build as it is — the review of M1 found exactly that in the pilots (an `[API]` check on
   "whichever mutation carried the effect"), and it was the row that showed it. D17 compares the spec with the row.
2. **The metadata the rest of the system reads:** priority (`regression:select`, `suites:filter`, `tc:rank`),
   `Catches:`, `Behavior:`, `BL-*`/`ECL-*` references, coverage and triage.
3. **A description for what no script runs** — visual and exploratory cases stay with the agent.

**The shape under test.**
- The spec's header carries the case's contract: ID, title, priority, `Catches:`, `Behavior:`, and the
  expected outcomes.
- **Every `expect` names its source** in a comment: an AC of the ticket, a `BL-*` id, or a doc page. A gate fails
  an `expect` with no source; this replaces the hand-written row as the guard against encoding the build.
- `suites:sync` generates the CSV row from the header (no prose Steps; `Automation_Status` from the spec's
  state). The generated row is never edited by hand; SP-001/SP-002 still check the link.
- D17 compares the spec with the cited sources instead of with a hand-written row.

**Out of the experiment:** the existing corpus, agent-only cases (full row as today), and runner-grammar API rows (D12).

**M3b exit — decided by numbers, then D1/D6/D7/D11 are revised or D19 is dropped:** the next five new
scriptable cases are written spec-first, and
- tokens per case are measured against the row-then-spec path;
- the D17 review, given a spec with one deliberately weakened `expect`, still grades it WEAKENED without a row;
- `regression:select`, `suites:filter` and `tc:rank` select the generated rows as they select hand-written ones.

## 9. Gates and scripts in M1

| Item | Change |
|---|---|
| `playwright.config.ts`, `regression/lib/{data,fixtures,runner-cases.spec}.ts` | **new** |
| `suites:lint` (`scripts/test-cases/sync-test-suites.ts`) | two fatal checks: **SP-001** a spec whose ID has no row in the sibling CSV; **SP-002** a spec whose file name and `test()` title disagree |
| `td:validate` (`scripts/test-data/validate-td-refs.ts`) | scans `regression/**/*.spec.ts`. **DV-025** (fatal) flags a literal URL, GUID, e-mail, `reports/` path, `process.env` or `config.js` import outside `regression/lib/` |
| `ci/run-suite-audit.ts:391-408` | git pathspecs narrowed to `regression/suites/**/*.csv` |
| `scripts/auth/save-storage-state.ts` | no change: it already takes aliases as arguments, and the fixture calls it for a missing state file |
| `package.json`, `.gitignore`, tsconfig and typecheck-hook scope | entries for the new files |
| `.claude/skills/qa-test-automation/` | **new**. Short `SKILL.md`; locator, waiting, data and anti-flake practice in supporting files |
| `.claude/agents/test-management-specialist.md` | under 19K chars (D16); one line pointing at `/qa-test-automation` |
| Docs | `CLAUDE.md` loses "NOT traditional `.spec.js` files" and stays the same length; `regression-suites.md` gets the layout and D7; `regression/suites/README.md` gets how to run a spec |

**Deferred until M3 shows a need, in measured tokens or measured drift:**

- a source hash that marks a spec stale after a CSV edit;
- the `A<n>` / `X<n>` mapping of expectations;
- `case:show` / `case:run`;
- a `script` lane in `suites:lanes`, `suites:merge` and `tc:promote` (M2);
- CI integration (M4);
- backfill of existing cases.

## 10. Phases

| Phase | Exit criterion |
|---|---|
| **M1 Foundation** (§9) | `npx playwright test --project runner` gives the same verdicts as `suites:machine` on `050a`, `050m` and `087`. Three pilot specs for `028` pass on `vcst`, and one deliberately broken expectation fails as an `expect`. `suites:lint`, `td:validate` and `context:check` are green. `test-management-specialist.md` is under 19K and its baseline entry is deleted |
| **M2 Lane** | `/qa-regression 028` runs the pilot cases through Playwright and sends only the rest to the agent |
| **M3 Authoring** | One real ticket. Round 1 leaves specs for its passed scriptable items and its bug reproductions, and each spec passes the D17 fidelity review, including the three M1 pilots. Round 2 replays the reproductions with no browser agent. Tokens are measured against round 1, counting the review |
| **M3b Spec-first (D19)** | §8a's three checks pass on five new scriptable cases; then D1, D6, D7 and D11 are revised to match, or D19 is dropped |
| **M4 CI** | The CI runner executes existing specs before the agent run |
