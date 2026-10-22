# Suites reorg — M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a regression case runnable as a Playwright `.spec` beside its CSV, expose the runner-native GraphQL/REST cases to Playwright without rewriting them, and prove both on a pilot. No agent is involved at run time.

**Architecture:** There is one `playwright.config.ts` with two projects: `script` for handwritten specs beside each CSV, and `runner`, a single wrapper spec that spawns `graphql-runner` for every machine-lane row. Data reaches a spec only through `regression/lib/data.ts`, and auth only through `regression/lib/fixtures.ts`. Two new lint rules and one `td:validate` rule guard the link and the data. A skill holds the authoring practice, and `test-management-specialist` shrinks under its budget.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), `@playwright/test` ^1.61.1 (already a devDependency), `tsx`, `csv-parse/sync`, and the existing `scripts/lib/*`.

**Spec:** [`docs/superpowers/specs/2026-10-21-suites-reorg-design.md`](../specs/2026-10-21-suites-reorg-design.md) — §9 is the M1 scope, §10 the exit criterion.

## Global Constraints

- **Branch.** Execute on a new branch cut from `main`, never on `qa/VCST-6452-verify-fix`.
- **Unit tests are temporary (repo RULE 2, `.claude/knowledge/execution/when-to-write-a-test.md`).**
  - Every `scripts/unit/tmp-*.test.ts` named below is written, run and **deleted before its task's commit**.
  - No new `scripts/unit/` file is committed.
  - Pilot specs under `regression/suites/**` are corpus cases, not unit tests, and are committed.
- **No hardcoded values (`.claude/rules/test-data.md` GOLDEN RULE).** Browser name, viewport, locale, store,
  culture and currency come from `config/test-suites.json` → `defaults.preferredBrowser` →
  `config/mcp-playwright-<name>.config.json`, or from env. They are never typed into new code.
- **Env access.** Resolve env through `process.env` after importing `config.js`. Never conclude a variable is
  unset from the curated `env` export.
- **Windows spawn.** Spawn `tsx` as `process.execPath` plus the tsx CLI path, as
  `scripts/regression/machine-lane.ts:49-55` does. Never a bare `npx`.
- **GraphQL shapes.** Any GraphQL mutation or query a helper sends (cart reset and add) is taken from the
  introspected schema (`npm run schema:refresh`, `.claude/knowledge/**/graphql-schema.md`) and checked with
  `graphql-runner` validation. Never write one from memory.
- **Case ID in titles.** Every `test()` title is `"<ID>: <Title>"`, so `-g "CART-001:"` matches exactly one
  case.
- **Budgets.** `npm run context:check` must stay green: this covers BUDGET-004 (19,000 chars for an agent, a
  command or a `SKILL.md`) and the always-loaded tier cap.
- **Commit attribution.** End every commit message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Missing env on a fresh clone** (`FRONT_URL` unset): a spec must stop with an error that names the
   variable. It must not navigate to `undefined/cart`. Pinned in Task 1.
2. **An expired or foreign storageState:** the page lands on sign-in and an `expect` fails, which reads as a
   product FAIL. `signedInAs` must verify the session and throw a non-`expect` error, which D8 classes as
   BLOCKED. Pinned in Task 2.
3. **One unparsable or legacy-header suite CSV must not abort wrapper collection for all 160 suites.** The
   wrapper skips that suite with a console warning. Pinned in Task 3.
4. **`-g CART-001` also matches `CART-0010` / `CART-001A`.** The colon in the title and the README command
   prevent it. Pinned in Task 6 (README), and Task 3 asserts the title format.
5. **Specs and wrapper cases mutating the same cart concurrently:** the config sets `workers: 1` and
   `fullyParallel: false`, matching `suites:machine`, which runs sequentially. Pinned in Task 1.

---

### Task 1: Playwright config and the data door

**Files:**
- Create: `playwright.config.ts`
- Create: `regression/lib/data.ts`
- Create: `regression/lib/lane-config.ts`
- Modify: `ci/tsconfig.json` (`include` += `"../regression/**/*.ts"`, `"../playwright.config.ts"`)
- Modify: `.gitignore` (+ `playwright-report/`)
- Modify: `package.json` (`"specs:run": "playwright test --project script"`, `"specs:runner": "playwright test --project runner"`)
- Test (temporary): `scripts/unit/tmp-spec-data.test.ts`

**Interfaces:**
- Produces:
  - `env(name: string): string`: throws `Error("env: <name> is not set (TEST_ENV=<env>)")` when the value is
    empty. Throws `Error("env: <name> is a secret — use the auth fixtures")` when `name` matches
    `/PASSWORD|SECRET|TOKEN|API_KEY/i`.
  - `td(ref: string): string`: takes a `@td(...)` expression and returns
    `new TestDataResolver(<repo>/test-data, process.env.TEST_ENV).resolve(ref)`. When the result still
    contains `@td(`, it throws, with `explainMiss` in the message.
  - `discover`: `export * as discover from "../../scripts/lib/live-discover.js"`.
  - `random`: `export * as random from "../../scripts/lib/random-data.js"`.
  - `laneConfig(): { browserName: string; channel?: string; viewport: {width:number;height:number}; locale?: string }`
    in `lane-config.ts`. It reads `defaults.preferredBrowser` from `config/test-suites.json`, then
    `config/<preferredBrowser with "playwright-" → "mcp-playwright-">.config.json` → `browser.browserName`,
    `browser.launchOptions.channel`, `browser.contextOptions.viewport` and `.locale`.
- Config values: projects `script` (`testMatch: "regression/suites/**/*.spec.ts"`, `use` from `laneConfig()`)
  and `runner` (`testMatch: "regression/lib/runner-cases.spec.ts"`); `workers: 1`; `fullyParallel: false`;
  `outputDir: process.env.RUN_DIR ?? "test-results/specs"`; `use.trace: "retain-on-failure"`;
  `use.screenshot: "only-on-failure"`; `use.video: "off"`. The config imports `./config.js` first.

- [ ] **Step 1: Write the temporary failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { env, td } from "../../regression/lib/data.js";
import { laneConfig } from "../../regression/lib/lane-config.js";

test("env throws naming an unset variable", () => {
  delete process.env.ZZ_UNSET;
  assert.throws(() => env("ZZ_UNSET"), /ZZ_UNSET is not set/);
});
test("env refuses secrets", () => {
  process.env.USER_PASSWORD = "x";
  assert.throws(() => env("USER_PASSWORD"), /auth fixtures/);
});
test("td resolves a known alias and throws on a miss", () => {
  assert.ok(td("@td(BUYABLE_NO_MIN_QTY.sku)").length > 0);
  assert.throws(() => td("@td(NO_SUCH_ALIAS_ZZ.sku)"), /NO_SUCH_ALIAS_ZZ/);
});
test("laneConfig comes from the manifest default lane", () => {
  const c = laneConfig();
  assert.equal(typeof c.browserName, "string");
  assert.ok(c.viewport.width > 0);
});
```

- [ ] **Step 2: Run it and see it fail.** Run `npx tsx --test scripts/unit/tmp-spec-data.test.ts`. Expected:
  FAIL with "Cannot find module …/regression/lib/data.js".
- [ ] **Step 3: Implement `data.ts`, `lane-config.ts` and `playwright.config.ts`** using the Interfaces above.
- [ ] **Step 4: Run it and see it pass.** Run the same command. Expected: 4 tests pass.
- [ ] **Step 5: Verify the config loads.** Run `npx playwright test --list`. Expected: exit 0 and
  `Total: 0 tests`, because no specs exist yet.
- [ ] **Step 6: Typecheck.** Run `npx tsc -p ci/tsconfig.json --noEmit`. Expected: no errors in the new
  files.
- [ ] **Step 7: Delete `scripts/unit/tmp-spec-data.test.ts` and commit** the config, `regression/lib/*`,
  `ci/tsconfig.json`, `.gitignore` and `package.json` with the message
  `feat(regression): playwright config and the spec data door (suites reorg M1)`.

---

### Task 2: Auth fixtures

**Files:**
- Create: `regression/lib/fixtures.ts`
- Test (temporary): `regression/suites/Frontend/cart/028-cart-core/TMP-AUTH.spec.ts`. It is deleted before the
  commit, and it never gets a CSV row.

**Interfaces:**
- Consumes: `env()` from Task 1; `resolveRole(role, testDataDir): RoleCredentials` and
  `acquireToken(creds, { backUrl, storeId }): Promise<TokenEntry>` from `scripts/lib/graphql-auth.js`.
- Produces: `export const test = base.extend<{ signedInAs: (role: string) => Promise<Page>; apiAs: (role: string) => Promise<APIRequestContext> }>`,
  plus a re-exported `expect`.
  - **`signedInAs(role)`:**
    - The state file is `test-results/auth/<role>.json`.
    - When the file is missing, it is created by spawning
      `[process.execPath, tsxCli, "scripts/auth/save-storage-state.ts", role]`.
    - It opens a new context with that `storageState` and the HAR option
      `recordHar: { path: <testInfo.outputPath("session.har")>, content: "embed" }`.
    - It navigates to `env("FRONT_URL")` and **throws** `Error("signedInAs(<role>): session not signed in")`
      when the page shows the sign-in form. Use the same `data-test-id` sign-in selectors as
      `save-storage-state.ts:51-62`; import them rather than copying, by exporting them from that file.
    - Credentials never pass through the test.
  - **`apiAs(role)`:** returns `request.newContext({ baseURL: env("BACK_URL"), extraHTTPHeaders: { Authorization: "Bearer <token>" } })`.
    The token is never logged.
- Modify: `scripts/auth/save-storage-state.ts`. Export `EMAIL_SELECTORS` / `PWD_SELECTORS` /
  `SUBMIT_SELECTORS` and keep its CLI behaviour. Check whether `main` runs on import; if it does, add an
  `isCli` guard like `graphql-runner.ts:1668`.

- [ ] **Step 1: Write the temporary spec**

```ts
import { test, expect } from "../../../../lib/fixtures.js";
test("TMP-AUTH: signed-in storefront session", async ({ signedInAs }) => {
  const page = await signedInAs("USER_DEFAULT");
  await expect(page).not.toHaveURL(/sign-in/);
});
test("TMP-AUTH: an empty state file is a fixture error, not an expect failure", async ({ signedInAs }) => {
  await expect(signedInAs("TMP_CORRUPT")).rejects.toThrow(/session not signed in/);
});
```

  For the second test, the step writes `{"cookies":[],"origins":[]}` to `test-results/auth/TMP_CORRUPT.json`
  before it runs.
- [ ] **Step 2: Run it and see it fail.** Run `npx playwright test -g "TMP-AUTH:"`. Expected: FAIL, because
  `lib/fixtures.js` is not found.
- [ ] **Step 3: Implement `fixtures.ts`** and the selector export.
- [ ] **Step 4: Run it and see it pass.** Run the same command. Expected: 2 passed, on `TEST_ENV=vcst`.
- [ ] **Step 5: Check secret hygiene with a scratch script outside the repo.** The script imports `config.js`,
  reads the `USER_DEFAULT` password in process through `resolveRole`, and scans every file under
  `test-results/specs/` for it. It prints only `clean` or the number of files that contain it, never the
  value. Expected: `clean`.
- [ ] **Step 6: Delete `TMP-AUTH.spec.ts` and `TMP_CORRUPT.json`, then commit** with the message
  `feat(regression): signedInAs / apiAs fixtures (suites reorg M1)`.

---

### Task 3: The runner wrapper

**Files:**
- Create: `regression/lib/runner-cases.spec.ts`
- Create: `regression/lib/runner-cases.ts`. It holds the pure enumeration, so the spec file stays thin.
- Test (temporary): `scripts/unit/tmp-runner-cases.test.ts`

**Interfaces:**
- Consumes: `classifyCase(row: ClassifiableRow): CaseVerdict` from `scripts/lib/case-classifier.js`;
  `parseSuite(text): { header; rows }` and `isCanonicalHeader` from
  `scripts/test-cases/append-test-cases-to-suite.js`; the manifest at `config/test-suites.json`
  (`suites[].{id,name,file}`).
- Produces:
  - `listRunnerCases(manifestPath?: string): { suites: Array<{ id: string; name: string; csv: string; cases: Array<{ id: string; title: string }> }>; skipped: Array<{ file: string; reason: string }> }`.
    It returns machine-lane rows only. It never throws for a single bad CSV, which goes to `skipped` instead.
  - `runCase(csv: string, id: string, runId: string): { code: number; stdout: string; stderr: string }`.
    It spawns `graphql-runner.ts --case <csv>:<id> --run-id <runId>`, with the same argv as
    `machine-lane.ts:153-163`.
- The spec registers `test.describe("<suiteId> <name>")` with `test("<id>: <title>")` per case. It maps
  `runCase` exit codes as follows:
  - 0 → return;
  - 1 → `expect.soft` failure carrying the runner's first failed assertion, using `failedAssertionFrom` logic
    (export it from `machine-lane.ts`, don't copy);
  - 2 → `test.skip(true, "browser lane: structural")`;
  - 3 → `throw new Error(stderr)`.
  
  `runId` is `process.env.RUN_ID ?? "SPECS-" + <ISO date-time compact>`.

- [ ] **Step 1: Write the temporary failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { listRunnerCases } from "../../regression/lib/runner-cases.js";

test("lists machine rows of a known runner suite", () => {
  const { suites } = listRunnerCases();
  const s = suites.find((x) => x.id === "050a");
  assert.ok(s && s.cases.length > 0);
  assert.ok(s.cases.every((c) => /^[A-Z0-9-]+$/.test(c.id)));
});
test("a bad CSV is skipped, not thrown", () => {
  const r = listRunnerCases(writeTmpManifestWithBadCsv()); // one entry → scratch CSV with header "foo,bar"
  assert.equal(r.suites.length, 0);
  assert.equal(r.skipped.length, 1);
});
```
- [ ] **Step 2: Run it and see it fail.** Run `npx tsx --test scripts/unit/tmp-runner-cases.test.ts`.
  Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement `runner-cases.ts` and `runner-cases.spec.ts`**, and export `failedAssertionFrom`
  from `machine-lane.ts`.
- [ ] **Step 4: Run it and see it pass.** Run the same command. Expected: 2 tests pass.
- [ ] **Step 5: Run the equivalence check, which is the exit criterion.**
  - Run `npm run suites:lanes -- 050a --run-id EQ1` and then `npm run suites:machine -- 050a --run-id EQ1`.
    Do the same for `050m` and `087`.
  - Then run
    `RUN_ID=EQ1 npx playwright test --project runner -g " (050a|050m|087) " --reporter=json > <scratch>/eq.json`.
  - Compare per-case statuses using a scratch script outside the repo.
  - Expected: every case has the same PASS/FAIL, and every runner exit 2 is `skipped`.
- [ ] **Step 6: Delete the temporary test and commit** with the message
  `feat(regression): runner-cases wrapper — runner-native rows as Playwright tests (suites reorg M1)`.

---

### Task 4: Pilot specs for suite 028

**Files:**
- Create: `regression/lib/cart.ts`
- Create: `regression/suites/Frontend/cart/028-cart-core/CART-001.spec.ts`
- Create: `regression/suites/Frontend/cart/028-cart-core/CART-006.spec.ts`
- Create: `regression/suites/Frontend/cart/028-cart-core/CART-007.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` and `apiAs` from Task 2; `env` and `td` from Task 1.
- Produces:
  - `resetCart(api: APIRequestContext): Promise<void>`;
  - `addToCart(api: APIRequestContext, sku: string, qty: number): Promise<void>`.

  Both POST to `env("BACK_URL") + "/graphql"`. The mutations come from the introspected schema (Global
  Constraints). Store, culture and currency come from `env("STORE_ID")` and the existing env names that the
  CSV runner already uses; find them in `graphql-substitute.ts` or `.env.vcst`.

Each spec implements its CSV row exactly:

- **The row.** Read its Preconditions, Steps, Assertions and Cross_Layer_Checks with
  `npm run suites:filter -- regression/suites/Frontend/cart/028-cart-core.csv --ids CART-001 --out <scratch>`.
- **Preconditions.** `[PRE:SIGNIN_AS:USER_DEFAULT]` becomes `signedInAs("USER_DEFAULT")`.
  `[PRE:RESET_CART]` becomes `resetCart(await apiAs("USER_DEFAULT"))`. CART-006 adds qty 1 and CART-007 adds
  qty 2 through `addToCart`.
- **Data.** The SKU comes from `td("@td(BUYABLE_NO_MIN_QTY.sku)")` and URLs from `env("FRONT_URL")`.
- **Assertions.** Each Assertions item becomes one or more web-first `expect` calls.
  - `[MATH]` items compute from values read off the page, never from a literal price.
  - `[CONSOLE]` and `[NETWORK]` checks from `Cross_Layer_Checks` use `page.on("console")` and
    `page.on("response")` collectors.
- **Locators.** Role, label or text first. Use `scripts/lib/storefront-selectors.generated.ts` for
  `data-test-id`s.

- [ ] **Step 1: Write `cart.ts`.** Validate each mutation by running it once with
  `npx tsx scripts/graphql/graphql-runner.ts --query-inline '<mutation>'`, which does schema validation only.
  Expected: valid.
- [ ] **Step 2: Write the three specs.**
- [ ] **Step 3: Run them.** Run `TEST_ENV=vcst npx playwright test --project script regression/suites/Frontend/cart/028-cart-core`.
  Expected: 3 passed.
- [ ] **Step 4: Prove that a spec fails on its expectation (D9).**
  - Temporarily change CART-006's expected quantity from 2 to 3.
  - Run `-g "CART-006:"`. Expected: 1 failed, and the error is an `expect` error (`toHaveText` / `toHaveValue`
    in the message), not a timeout on an action.
  - Revert the change.
- [ ] **Step 5: Run them twice more.** Expected: 3 passed each time, with no flake.
- [ ] **Step 6: Commit** the specs and `cart.ts` with the message
  `test(regression): pilot specs CART-001/006/007 beside 028 (suites reorg M1)`.

---

### Task 5: Gates — SP-001, SP-002, DV-025 and the audit pathspec

**Files:**
- Modify: `scripts/test-cases/sync-test-suites.ts`. Add next to `findDuplicateCaseIds`, and wire it into
  `main()` as a fatal block in the style of `:784-801`.
- Modify: `scripts/test-data/validate-td-refs.ts`. Add a DV-025 block after DV-024 (`:422-469`), and add its
  hits to `idFatal`.
- Modify: `ci/run-suite-audit.ts:391, :403, :408`. Replace `regression/suites` with
  `"regression/suites/**/*.csv"`, a quoted git pathspec, in all three commands.
- Test (temporary): `scripts/unit/tmp-spec-gates.test.ts`

**Interfaces:**
- Produces:
  - `export function findSpecLinkErrors(root?: string): string[]` in `sync-test-suites.ts`. It walks
    `*.spec.ts` under `root` (default `regression/suites`) whose parent folder `<stem>` has a sibling
    `<stem>.csv`.
    - **SP-001:** the spec's file-name ID is not a row ID in that CSV, or it has no sibling CSV.
    - **SP-002:** the file does not contain `test("<fileId>:` or `test('<fileId>:`.
    - Message format: `SP-00n <path>: <reason>`.
  - **DV-025** in `validate-td-refs.ts` scans `regression/**/*.spec.ts`, excluding `regression/lib/`. It flags:
    - `https?://`;
    - a GUID (`/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i`);
    - an e-mail (`/[\w.+-]+@[\w-]+\.[\w.]+/`);
    - `EVIDENCE_PATH_RE` or `reports\/`;
    - `process.env`;
    - an import of `config.js`.
    
    Output format: `DV-025 <path>:<line> <hit>`. The rule is fatal unless `--warn-only` is passed.

- [ ] **Step 1: Write the temporary failing test.** It builds a scratch tree in `os.tmpdir()` with
  `x/001-a.csv` (one row `A-001`) and the following specs, then asserts the output:

```ts
// x/001-a/A-001.spec.ts  → test("A-001: ok")           → no error
// x/001-a/A-999.spec.ts  → test("A-999: orphan")       → /SP-001 .*A-999/
// x/001-a/A-001b.spec.ts → test("A-002: wrong title")  → /SP-002/   (and SP-001 for A-001b)
assert.deepEqual(findSpecLinkErrors(tmp).filter(e => e.includes("A-001.spec")), []);
assert.ok(findSpecLinkErrors(tmp).some(e => /SP-001 .*A-999/.test(e)));
```

- [ ] **Step 2: Run it and see it fail.** Run `npx tsx --test scripts/unit/tmp-spec-gates.test.ts`. Expected:
  FAIL, because `findSpecLinkErrors` is not exported.
- [ ] **Step 3: Implement both rules and the pathspec change.**
- [ ] **Step 4: Run it and see it pass.** Expected: PASS.
- [ ] **Step 5: Check the gates on the real tree.** Run `npm run suites:lint` and then `npm run td:validate`.
  Expected: both exit 0 with the pilot specs in place.
- [ ] **Step 6: Check that the gates bite.**
  - Add `const u = "https://example.test";` to CART-001.
  - Run `npm run td:validate`. Expected: `DV-025 … CART-001.spec.ts:<n> https://example.test` and exit 1.
  - Revert the change.
- [ ] **Step 7: Delete the temporary test and commit** with the message
  `feat(gates): SP-001/SP-002 spec link, DV-025 spec hardcode, audit pathspec CSV-only (suites reorg M1)`.

---

### Task 6: The `/qa-test-automation` skill and the docs

**Files:**
- Create: `.claude/skills/qa-test-automation/SKILL.md`. Keep it under 19,000 chars, with frontmatter `name`,
  a `description` that says it is loaded only while writing or repairing a `.spec`, and
  `user-invocable: false` if the repo's other internal skills use that key.
- Create: `.claude/skills/qa-test-automation/writing-a-spec.md`. It covers:
  - layout and naming (D5, D6), the title format, one case per file;
  - preconditions mapped to fixtures, data through `data.ts` only;
  - turning the MCP action log into a spec;
  - the D9 one-run proof;
  - and D7: never edit the CSV expectation.
- Create: `.claude/skills/qa-test-automation/practice.md`. It covers:
  - locator priority;
  - web-first `expect`, with no `waitForTimeout`;
  - `[MATH]` computed from page values;
  - console and network collectors;
  - cleanup through API;
  - an anti-flake checklist.
  
  Take the worked examples from the Task 4 pilots by path; don't paste their code.
- Modify: `CLAUDE.md` §Project Overview. The clause "NOT traditional `.spec.js` files" becomes "agent-run
  CSV cases, with a Playwright `.spec` beside a case once it is deterministic". Keep the line the same length
  or shorter.
- Modify: `.claude/knowledge/execution/regression-suites.md`. Add a section `## Executable specs beside a
  suite`: layout, ID link, D7, D8, and the one-author rule covering the spec folder. Cite the spec; don't
  restate it.
- Modify: `regression/suites/README.md`. Add how to run:
  - `npx playwright test <suite folder>`;
  - `npx playwright test -g "CART-001:"`;
  - `npx playwright test --ui`;
  - `npm run specs:runner -- -g " 050a "`.

- [ ] **Step 1: Write the files.**
- [ ] **Step 2: Run `npm run context:check`.** Expected: exit 0, covering DOC-003 paths, BUDGET-004 and the
  always-loaded cap.
- [ ] **Step 3: Commit** with the message `docs(qa): /qa-test-automation skill, spec layout docs (suites reorg M1)`.

---

### Task 7: The `test-management-specialist` prompt diet

**Files:**
- Modify: `.claude/agents/test-management-specialist.md`. Bring it from ~27,107 chars to under 19,000.
- Create or modify the supporting files of `.claude/skills/qa-test-cases-generator/` that receive the moved
  sections.
- Modify: `scripts/maintenance/.prompt-size-baseline.json`, using `npm run context:check:baseline` only.

**Approach:** move, never delete a rule. Move these sections into supporting files and replace each with a
one-line citation:

- `### Domain References (read on-demand)`;
- `### Frontend Journey Exception`;
- `### Test Design Techniques`;
- `### Additional References (load on-demand)`;
- `### Cross-Layer Verification Checklist`;
- the detail of `### Workflow`.

These stay in the body: the MENTAL MODEL, Single-author discipline, Judge, Scope Boundaries, and every
MANDATORY rule. Add one line: "Writing a `.spec` for a case: load `/qa-test-automation`."

- [ ] **Step 1: Record the rule inventory before the move.** List every bolded or MANDATORY or NEVER/ALWAYS
  line of the current file in a scratch file outside the repo.
- [ ] **Step 2: Move the sections.**
- [ ] **Step 3: Measure.** Run
  `node -e "console.log(require('fs').readFileSync('.claude/agents/test-management-specialist.md','utf8').length)"`.
  Expected: below 19000.
- [ ] **Step 4: Check the rule inventory.** Every line from Step 1 must still be reachable, either in the body
  or behind a citation from it. Run `npm run context:check`. Expected: exit 0, because no citation dangles.
- [ ] **Step 5: Update the baseline.** Run `npm run context:check:baseline`. Expected: the
  `test-management-specialist.md` entry is removed, and `git diff` of the baseline shows only that removal.
- [ ] **Step 6: Commit** with the message
  `refactor(agents): test-management-specialist under BUDGET-004 — detail moved to qa-test-cases-generator (suites reorg M1)`.

---

### Task 8: The M1 exit check

- [ ] **Step 1:** Run `npm test`. Expected: exit 0, and no `tmp-*` files remain under `scripts/unit/`.
- [ ] **Step 2:** Run `npm run suites:lint && npm run td:validate && npm run context:check`. Expected: all
  three exit 0.
- [ ] **Step 3:** Run `TEST_ENV=vcst npx playwright test --project script`. Expected: 3 passed.
- [ ] **Step 4:** Repeat the Task 3 Step 5 equivalence check on a fresh `RUN_ID`. Expected: identical
  verdicts.
- [ ] **Step 5:** Run `git status --short`. Expected: clean. Report the branch and the commit list.
