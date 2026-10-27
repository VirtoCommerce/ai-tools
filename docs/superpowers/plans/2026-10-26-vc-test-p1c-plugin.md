# vc-test P1c — `vc-test` as a real plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `vc-test` 0.1.0, listed in the `ai-tools` marketplace and installable beside `vc-init` ≥ 0.4.0 and
`vc-fix`, with the foundation the P1d flow stands on:
- a read-only profile loader;
- `/vc-test:init`, which writes the profile's `test` block;
- the full capabilities probe;
- F6 from the stand itself (`/api/platform/modules` and the storefront's theme version);
- `knowledge-store.mjs`, with committed tests;
- the pinned Playwright config the P1a runner already points at.

**Architecture:** Everything new is self-contained under `plugins/vc-test/`. That means copies of the libraries it
needs, never a path into the repo root or another plugin (`plugins/CLAUDE.md`). Paths come from
`import.meta.url`, and output goes under `outputRoot()`.

The QA command itself (`/vc-test:qa-ticket`) still calls `/ticket-context` and `/qa-test-strategy` under
`.claude/` until P1d moves them, so this release is a **preview**. It is listed with `defaultEnabled: false`, and
its description says the command needs an `ai-tools` checkout until P1d.

One `vc-init` patch (0.4.1) closes a gap P1a left. F6 needs the admin password, the `runner` tool runs only files
inside the project, and vc-test's own scripts are not in the project. The fix is a fixed allowlist of vc-test
scripts the runner may start, the same pattern as `onboard`'s `ONBOARD_SCRIPTS`.

**Tech Stack:** Node 18+ ES modules; `dotenv` (already `vc-init`'s and `vc-fix`'s, for the copied env loader);
`node:test`.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U2, U5, U10, U16, U19, U21, U22, U32, §4 (components), §5.2, §5.3 (F6), §6, §6a (stand writes), §9, §10 P1. P1 split: [`2026-10-26-vc-test-p1a-vc-init.md`](2026-10-26-vc-test-p1a-vc-init.md) §P1 is four plans.

## Global Constraints

- **Self-contained.** No file under `plugins/vc-test/` that this plan creates or changes imports from `../../../scripts/`, `.claude/` or another plugin. The prototype's two existing repo imports are different: `lib/paths.mjs` is fixed in Task 1, and `score-scenarios.mjs` → `.claude/skills/ticket-context/lib/schema.mjs` stays until P1d moves the skill.
- **Committed tests.**
  - `knowledge-store.mjs` gets committed tests, as the spec's U10 says (owner decision). The repo's rule names only `plugins/vc-secrets/` and `plugins/vc-init/bridge/` as exceptions, so Task 3 adds this one to `CLAUDE.md`, `.claude/knowledge/execution/when-to-write-a-test.md` and `.github/workflows/unit-tests.yml` in the same commit.
  - The `vc-init` change in Task 5 adds committed bridge tests.
  - Everything else gets temporary tests (`scripts/unit/tmp-<name>.test.mjs`), deleted before the commit.
- **No profile ⇒ STOP "run /project-init"** (exit 2), and a newer schema ⇒ STOP (exit 3). No default stands in for a missing profile (U19).
- **The stand is writable only by declaration** (U16, U22). It is writable when the `test` block marks the env `writable: true`, `BACK_URL` is reachable, and the profile's `governance.stand.writable` is not `false`. `ENV_RISK` stops deciding it.
- **No password in any file this plan writes** (U21). `/vc-test:init` checks accounts and points at `/project-init --add-user`; it never asks for or writes a password.
- **Knowledge writes go only through `knowledge-store.mjs`.** A platform write is refused when `projectType` is `client`, text is scrubbed first, and nothing is written outside the store path (§6).
- `npm run context:check`, `npm run docs:index:check` and `npm test` green at every commit. Every prompt file stays under BUDGET-004.
- **Release:**
  - `vc-test` `0.0.1` → `0.1.0` with a marketplace entry (catalog version bump, since the listing changes);
  - `vc-init` `0.4.0` → `0.4.1` and tag `vc-init--v0.4.1` after merge;
  - `vc-test`'s dependency floor is `vc-init >=0.4.1` (the runner's plugin-script mode) and `vc-fix >=0.13.0`. P1d raises it to `>=0.14.0` when it calls the new read commands.

## Review Focus

1. **A profile written before the `test` block existed, or one with an empty block.** Capabilities reports `stand.writable: false` with the reason "run /vc-test:init", never a crash and never "writable". Test in Task 4.
2. **`BACK_URL` that points somewhere other than the env the block declares writable**, for example `.env.local` overriding the URL. The stand is read-only with that reason (U16: "the probe only checks the run is pointed at the stand that was declared"). Test in Task 4.
3. **A knowledge write whose slug escapes the store** (`../x`, an absolute path, a path through a junction) or names an unknown kind. It is refused, and nothing is written. Test in Task 3.
4. **`runner plugin <name>` with a name outside the allowlist**, a path, or an extension. It is refused before vc-secrets starts. The script resolves from the trusted vc-test install only on the inner side. Test in Task 5.
5. **A stand whose admin login fails (401), whose `/api/platform/modules` is unreachable, or whose storefront bundle names no version.** `deployed.mjs` reports each as `unknown` with its reason, so F6 fires on doubt (§5.2), never as "not deployed". Test in Task 6.

---

### Task 1: The plugin's base — env resolution and the read-only profile loader

**Files:**
- Create:
  - `plugins/vc-test/scripts/lib/resolve-test-env.js`, `env-layers.mjs`, `load-layered-env.mjs`, `run-dir.mjs`: byte copies of `plugins/vc-fix/scripts/lib/` (the same set `vc-fix` carries; `env-layers.mjs` needs `run-dir.mjs`);
  - `plugins/vc-test/package.json` (`"type": "module"`, `dependencies: { "dotenv": <vc-init's range> }`);
  - `plugins/vc-test/lib/profile.mjs`.
- Modify: `plugins/vc-test/lib/paths.mjs`. Import `resolve-test-env.js` from `../scripts/lib/`, not the repo root.
- Test (temporary): `scripts/unit/tmp-vc-test-profile.test.mjs`

**Interfaces:**
- Produces:
  - `loadProfile({ root = outputRoot() } = {}) => object`. It looks at `PROJECT_PROFILE_PATH`, then `VC_FIX_HOME`, then `<root>/project-profile.json`, the order every `vc-fix` reader uses.
    - It throws `ProfileError` with `code: 2` and "no project-profile.json — run /project-init (vc-init), then /vc-test:init" when the file is missing.
    - It throws `code: 3` when the file is unparsable, or `schemaVersion` is above `SUPPORTED_SCHEMA = 3`.
    - An absent `test` block reads as `{}`.
  - `testBlock(profile) => { environments: Record<string,{writable:boolean, backUrl?:string}>, scriptRoots: string[], knowledgeStore: string|null, platformStore: string|null }`. Missing keys come back empty, never invented. Task 7 writes `backUrl`; Task 3 reads `platformStore`.
  - CLI `node lib/profile.mjs --check` exits 0, 2 or 3 with the message.

- [ ] **Step 1: Write the failing test.**
  - A missing file throws code 2.
  - `{ schemaVersion: 4 }` throws code 3.
  - Bad JSON throws code 3.
  - `{ schemaVersion: 3 }` gives `testBlock` → `{ environments: {}, scriptRoots: [], knowledgeStore: null, platformStore: null }`.
  - `PROJECT_PROFILE_PATH` beats `VC_FIX_HOME`, which beats the root.
  - `paths.mjs` `currentEnv()` still answers `TEST_ENV` first.
- [ ] **Step 2: Run** `npx tsx --test scripts/unit/tmp-vc-test-profile.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Copy the four libraries byte for byte, then write `profile.mjs`. Check the copies with `diff plugins/vc-fix/scripts/lib/<f> plugins/vc-test/scripts/lib/<f>`. Expected: no output.
- [ ] **Step 4: Run.** Expected: PASS. Then `grep -rn "\.\./\.\./\.\./scripts\|\.claude/" plugins/vc-test/lib/paths.mjs plugins/vc-test/lib/profile.mjs`. Expected: no output.
- [ ] **Step 5: Delete the test, commit**: `feat(vc-test): its own env resolution and a read-only profile loader that stops on a missing profile (U19)`.

### Task 2: The pinned Playwright config the runner uses

**Files:** Create `plugins/vc-test/harness/playwright.config.mjs`. Test (temporary): `scripts/unit/tmp-vc-test-harness.test.mjs`

**Interfaces:**
- Consumes: the P1a runner's contract (`plugins/vc-init/bridge/runner.mjs` `runnerCommand`). The runner runs `playwright test --config <this file> <anchored file filters>`, with the project root as its cwd.
- Produces: a default-exported config. Its `testDir` is `process.cwd()`, never the config's own folder. It has `testMatch: ["**/*.spec.ts", "**/*.spec.mjs", "**/*.spec.js"]`, `screenshot: "only-on-failure"`, `trace: "retain-on-failure"` (`.claude/rules/reports.md` §5.1a), `workers: 1`, and `outputDir` under `<cwd>/.vc-fix/vc-test/playwright-results`.

- [ ] **Step 1: Write the failing test.** Import the config with `process.chdir(<tmp project>)`. Expected:
  - `testDir === <tmp project>`;
  - `outputDir` sits under `<tmp project>/.vc-fix/`;
  - `use.screenshot === "only-on-failure"`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement. Step 4: Run.** Expected: PASS. Then run a smoke check in this repository: put a passing `reports/tickets/tmp-smoke/a.spec.ts` (`test("ok", () => {})`) and run `npx playwright test --config plugins/vc-test/harness/playwright.config.mjs "^.*tmp-smoke[\\/]a\.spec\.ts$"`. Expected: 1 passed. Delete the spec.
- [ ] **Step 5: Delete the test, commit**: `feat(vc-test): the pinned Playwright config the vc-init runner runs — testDir from the project`.

### Task 3: `knowledge-store.mjs` (§6, U10) with committed tests

**Files:**
- Create:
  - `plugins/vc-test/lib/knowledge-store.mjs`;
  - `plugins/vc-test/lib/scrub.mjs`: a byte copy of `.claude/skills/ticket-context/lib/scrub.mjs`. P1d moves `/ticket-context` here, and that copy then becomes the canonical one;
  - `plugins/vc-test/lib/knowledge-store.test.mjs` (**committed**).
- Modify:
  - `CLAUDE.md` §Essential Rules, the NO CODE ⇒ NO UNIT TEST bullet: the exceptions gain "`plugins/vc-test/lib/knowledge-store.mjs` (spec U10: the write router keeps client text out of the public kb)";
  - `.claude/knowledge/execution/when-to-write-a-test.md` (the same exception, one line);
  - `.github/workflows/unit-tests.yml`: a step "vc-test store suite" that runs `node --test "plugins/vc-test/lib/*.test.mjs"` with the same "no file matches" guard as the vc-init step.

**Interfaces:**
- Produces:
  - `KINDS = { rules: "rules/<slug>.yaml", "domain-map": "domain/<slug>.md", "mind-map": "domain/<slug>.mind-map.json", "test-doc": "tests/<slug>.md", aliases: "test-data/aliases.json", observed: "observed/<slug>.json" }`. These are the formats of §6's table.
  - `storeConfig(profile, { root }) => { project: string, platform: string|null, platformWritable: boolean }`:
    - `project` is the absolute `test.knowledgeStore`, default `qa-knowledge/`;
    - `platform` is a local platform folder only where one is configured (`test.platformStore`; this repository sets `.claude/knowledge/`), else `null`, meaning the public kb is reached through its MCP;
    - `platformWritable` is `profile.projectType !== "client"`.
  - `readKnowledge(cfg, kind, slug) => { text, source: "project"|"platform" } | null`. The project store comes first, then the platform folder.
  - `writeKnowledge(cfg, { kind, slug, text, target = "project" }) => { path }`. It throws:
    - `"platform write refused: this is a client project"` for a client project;
    - `"unknown kind"`;
    - `"outside the store"` for a slug that is not `^[a-z0-9][a-z0-9-]*$`, or a resolved path outside the store, checked after realpath.
    
    Text goes through `scrub.mjs` `redactText` with `loadSecretValues(root)` before it is written. The write is a temp file plus rename.

- [ ] **Step 1: Write the failing committed tests** in `knowledge-store.test.mjs`:
  - **client refusal:** a profile with `projectType: "client"` and target `platform` throws and writes nothing;
  - **platform write allowed:** a non-client profile with `platform` configured writes there;
  - **scrub:** text containing a value from the root's `.env.local` `ADMIN_PASSWORD=` is written with that value redacted;
  - **escape refused:** slugs `../x`, `a/b` and `C:\\x` throw; a junction `qa-knowledge/tests` pointing outside throws, and the outside folder stays empty (Review Focus 3);
  - **unknown kind** throws;
  - **read order:** a project file wins over a platform file for the same kind and slug, a platform-only file is read with `source: "platform"`, and `null` comes back when neither exists.
- [ ] **Step 2: Run** `node --test "plugins/vc-test/lib/*.test.mjs"`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement**, then the three rule and CI edits.
- [ ] **Step 4: Run** the store suite (PASS), `npm run context:check` (PASS) and `npm test` (PASS).
- [ ] **Step 5: Commit** (the test stays): `feat(vc-test): knowledge-store — the one reader/writer of project and platform knowledge, client text never to the platform (§6, U10)`.

### Task 4: The full capabilities probe (§5.2, U16, U22)

**Files:** Modify `plugins/vc-test/lib/capabilities.mjs`. Test (temporary): `scripts/unit/tmp-vc-test-capabilities.test.mjs`

**Interfaces:**
- Consumes: `loadProfile` and `testBlock` (Task 1), `storeConfig` (Task 3), and the env loaded through `scripts/lib/load-layered-env.mjs`, which replaces the import of the project's `config.js`.
- Produces: `probe({ env, profile, mcp, root, reach }) => capabilities`. It keeps every key the prototype's `plan-run.mjs` reads (`back-url`, `front-url`, `mcp:<name>`, `missing`) and adds:
  - `tracker: { kind, auth }` from `profile.tracker.kind` and `profile.auth`;
  - `host: { kind, auth }` from `profile.vcs`;
  - `knowledgeStore: { path, exists, domainMaps: string[], mindMaps: string[] }`;
  - `contract-refresh: boolean` (the project's `package.json` has a `schema:refresh` script);
  - `regression-corpus: boolean` (a `regression:select` script, for F5, §5.3);
  - `kb` and `virtooz` (from the MCP list);
  - `governed: boolean`.
  - **`stand: { writable, reason }`** is decided by `standOf({ env, testBlock, governance, reachable })`, replacing the `ENV_RISK` rule. It is writable only when:
    - the env is in `testBlock.environments` with `writable: true`;
    - `governance.stand.writable !== false`;
    - `BACK_URL` answered.
    
    `reason` names the first condition that failed.
- **U16's "pointed at the stand that was declared":** `/vc-test:init` (Task 7) records `environments.<env>.backUrl`. `standOf` refuses when the loaded `BACK_URL` differs from it (Review Focus 2).
- `teardown.mjs` keeps calling `standOf`. Its call site is updated to pass the profile pieces.

- [ ] **Step 1: Write the failing test.**
  - No `test` block gives `writable: false` and "run /vc-test:init" (Review Focus 1).
  - The env listed `writable: false` gives false.
  - Listed `true` with a matching `backUrl` and a reachable stand gives true.
  - A different `BACK_URL` gives false, with a reason naming both URLs.
  - `governance.stand.writable: false` gives false.
  - A `package.json` with `schema:refresh` but no `regression:select` gives `contract-refresh: true` and `regression-corpus: false`.
  - The prototype's keys are still present.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement**, and update `teardown.mjs`'s call. **Step 4: Run.** Expected: PASS. Then `node plugins/vc-test/lib/capabilities.mjs --key VCST-5904 --mcp playwright-chrome` in this repository. Expected: JSON with `stand.reason` saying "run /vc-test:init" (this repository has no `test` block yet).
- [ ] **Step 5: Delete the test, commit**: `feat(vc-test): capabilities probe — connectors, stores, scripts, and a stand writable only by declaration (§5.2, U16)`.

### Task 5: `vc-init` 0.4.1 — the runner starts an allowlisted vc-test script

**Files:**
- Modify: `plugins/vc-init/bridge/runner.mjs`, `plugins/vc-init/bridge/run.mjs`, `plugins/vc-init/README.md`, `plugins/vc-init/.claude-plugin/plugin.json` (`0.4.1`), `CHANGELOG.md`
- Test (committed): `plugins/vc-init/bridge/runner.test.mjs`

**Interfaces:**
- Produces:
  - `RUNNER_PLUGIN_SCRIPTS = Object.freeze(["deployed"])`.
  - `checkRunnerShape` accepts `["plugin", <name>, ...args]` when `name` is in that list. A name with a path separator, a dot or an extension is refused.
  - `prepareRunner` resolves `resolvePluginFile("vc-test", "lib/<name>.mjs", { trustedOnly })`, with `trustedOnly: true` on the inner side. It skips the `scriptRoots` check for this mode only, because the file is plugin-shipped and allowlisted, as `onboard`'s are. The env check stays.
  - The command is `node <that file> ...args`, with the cwd at the project root.

- [ ] **Step 1: Write the failing committed tests.**
  - `["plugin", "deployed"]` is allowed.
  - `["plugin", "other"]`, `["plugin", "../x"]`, `["plugin", "deployed.mjs"]` and `["plugin"]` are refused (Review Focus 4).
  - The outer route with an unlisted env is refused before vc-secrets starts.
  - With a stub resolver, the inner side runs `<vc-test>/lib/deployed.mjs` from the trusted location, and a resolver returning null gives exit 69 naming vc-test.
- [ ] **Step 2: Run** `node --test "plugins/vc-init/bridge/*.test.mjs"`. Expected: FAIL. **Step 3: Implement. Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(vc-init): 0.4.1 — the runner starts an allowlisted vc-test script with the env's passwords (vc-test F6)`.

### Task 6: `lib/deployed.mjs` — F6 from the stand (§5.3)

**Files:** Create `plugins/vc-test/lib/deployed.mjs`. Test (temporary): `scripts/unit/tmp-vc-test-deployed.test.mjs`

**Interfaces:**
- Produces: a port to plain JS of `scripts/deploy/lib/live.ts`'s `probeAdminToken`, `probeLiveModules`, `parseThemeVersion` and `probeThemeVersion`, unchanged in behaviour.
  - `deployed({ backUrl, frontUrl, admin, password, fetch }) => { platform: { version } | { unknown: reason }, modules: [{ id, version }] | { unknown: reason }, theme: { version } | { unknown: reason } }`.
  - `compareExpected(deployed, expect: [{ id, version }]) => [{ id, expected, live, verdict: "DEPLOYED"|"NOT DEPLOYED"|"UNKNOWN" }]`. `UNKNOWN` comes back whenever that side is unknown, never `NOT DEPLOYED`.
  - CLI `node "$VC_RUN" runner plugin deployed --key <KEY> [--expect <file>]` writes `<WORK>/deployed.json` and prints it. The admin login is `ADMIN` from the env files, and the password is `ADMIN_PASSWORD` from the runner's environment.
- **F6 in the floors:** `qa-test-strategy`'s F6 reads `deployed.json` when it is present (P1d wires the read). This task produces the file only.

- [ ] **Step 1: Write the failing test** with a stub `fetch`:
  - a 200 token and modules give versions;
  - a 401 on the token gives `modules: { unknown: "admin login 401" }`;
  - a network error gives `{ unknown: "network" }`;
  - a storefront page with no entry script gives `theme: { unknown: "no-entry-script" }`;
  - `compareExpected` with an unknown modules side gives `UNKNOWN` for every expected id (Review Focus 5);
  - a matching version gives `DEPLOYED`, a different one `NOT DEPLOYED`;
  - `parseThemeVersion` matches `live.ts` on the bundle samples its callers handle. Copy two real fixtures from `scripts/unit/` if present, else write one bundle line per format.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement. Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Delete the test, commit**: `feat(vc-test): deployed — module, platform and theme versions from the stand itself, unknown never read as not deployed (F6)`.

### Task 7: `/vc-test:init` (U21)

**Files:** Create `plugins/vc-test/commands/init.md` (target ≤ 6,000 chars) and `plugins/vc-test/lib/init-plan.mjs`. Test (temporary): `scripts/unit/tmp-vc-test-init.test.mjs`

**Interfaces:**
- Consumes:
  - `vc-init`'s `profile-set.mjs --merge 'test=<json>'`, the only writer;
  - `add-user.mjs --list`, the accounts per env and role.
  
  Both are found as `<vcInit>` from `node "$VC_RUN" --where`, the way `/perf-init` finds them.
- Produces:
  - `planTestBlock({ envs: string[], answers: { writable: Record<env, boolean>, knowledgeStore, scriptRoots }, env: (name) => { BACK_URL } }) => { test: { environments: { <env>: { writable, backUrl } }, scriptRoots, knowledgeStore } }`. `scriptRoots` defaults to the run-folder root of `QA_OUTPUT_DIR`'s template (the part before its first placeholder) plus the corpus path when `regression/` exists.
  - `accountGaps(listJson, envs) => [{ env, role: "admin"|"user", fix: "/project-init --add-user --env <env> --role <role>" }]`.
- **The command's steps:**
  1. `node lib/profile.mjs --check`. Exit 2 ⇒ STOP "run /project-init".
  2. Read the envs (`add-user.mjs --list`).
  3. Ask once, with every question in one AskUserQuestion:
     - which envs are non-production and may be written to (an undeclared env stays read-only);
     - the knowledge-store path (default `qa-knowledge/`).
  4. Write the block through `profile-set.mjs`.
  5. Print the account gaps with their `--add-user` commands. It never asks for a password and never writes one.
  6. Run `capabilities.mjs` and print `stand`.

- [ ] **Step 1: Write the failing test** for `planTestBlock` and `accountGaps`:
  - two envs, one marked writable, give `writable` true and false with each env's `backUrl`;
  - the scriptRoots default comes from a `QA_OUTPUT_DIR` template;
  - `add-user --list` JSON missing an admin for `vcst` gives one gap with the `--add-user` command.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** `init-plan.mjs`, then the command. **Step 4: Run.** Expected: PASS. Then `wc -c plugins/vc-test/commands/init.md` (< 8,000) and `claude plugin validate plugins/vc-test`.
- [ ] **Step 5: Delete the test, commit**: `feat(vc-test): /vc-test:init — the test block through vc-init's writer, accounts checked, no password (U21)`.

### Task 8: Manifest, marketplace entry, README, release

**Files:**
- `plugins/vc-test/.claude-plugin/plugin.json`:
  - `version` `0.1.0`;
  - `displayName` "Virto Commerce Testing Flow (preview)";
  - `dependencies` `vc-init >=0.4.1`, `vc-fix >=0.13.0`;
  - a `description` that says the QA command needs an `ai-tools` checkout until P1d.
- `.claude-plugin/marketplace.json`: an entry for `vc-test`, source `./plugins/vc-test`, and the catalog `version` bumped (the listing changed).
- `plugins/vc-test/README.md`: install, `/vc-test:init`, the preview limitation, and what each `lib/` script does in one line.
- `CHANGELOG.md`.

- [ ] **Step 1: Edit.** **Step 2: Check** `claude plugin validate plugins/vc-test`, `claude plugin validate plugins/vc-init`, `npm run context:check`, `npm run docs:index:check`, `node --test "plugins/vc-init/bridge/*.test.mjs" "plugins/vc-test/lib/*.test.mjs"` and `npm test`. Expected: all green.
- [ ] **Step 3: Commit**, push and open the PR: `release(vc-test): 0.1.0 preview in the marketplace; vc-init 0.4.1`.
- [ ] **Step 4: After merge**, run `claude plugin tag --push` from `plugins/vc-init/` (`vc-init--v0.4.1`) and from `plugins/vc-test/` (`vc-test--v0.1.0`, so P1d's dependants have a tag to resolve).
