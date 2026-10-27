# vc-test P1a — the `vc-init` change (profile `test` block, pinned GraphQL read, script runner) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `vc-init` release (0.3.3 → 0.4.0, tag `vc-init--v0.4.0`) that gives `vc-test` the three things P1 needs
from onboarding. First, a `test` block in the profile. Second, the one GraphQL read `/ticket-context` makes,
admitted through the bridge (B8). Third, a bridge tool that runs `.spec` files and node check scripts with the
current environment's test-user passwords and never a token (U32, B10).

**Architecture:** All three are changes to `plugins/vc-init/` only. The bridge stays a single dispatcher
(`bridge/run.mjs`). The new tool's rules live in a new pure module, `bridge/runner.mjs`, so `allowlist.mjs` and
`run.mjs` grow by a few lines each. Every refusal is covered by a committed test under `plugins/vc-init/bridge/`,
which `CLAUDE.md` exempts from the temporary-test rule. Everything else gets a temporary test.

**Tech Stack:** Node 18+ ES modules, `node:test`; no new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U19–U21, U32, B8, B10, §4 (the `vc-init` row), §7, §8, §10 P1.

## P1 is four plans

P1 spans four subsystems, so it is four plans, each with its own working, tested deliverable. Each later plan is
written when the one before it merges, against the code that merge left.

| Plan | Delivers | Needs |
|---|---|---|
| **P1a (this)** | `vc-init` 0.4.0: profile `test` block, B8, the U32/B10 runner tool | — |
| P1b | `vc-fix` bump: the tracker CLIs' read commands the connectors call (`jira.mjs`: issue with fields, comments, attachments, links; `ado.mjs`: work item with `relations[]`, Azure Repos PR iterations, changes, threads) | — |
| P1c | `vc-test` as a real plugin: manifest with `vc-init >=0.4.0` + `vc-fix` dependencies, marketplace entry, read-only profile loader, `/vc-test:init`, the full `capabilities.mjs`, F6 via `/api/platform/modules`, `knowledge-store.mjs` with committed tests | P1a |
| P1d | `ticket-context` and `qa-test-strategy` moved, with `ticket-context-analyst` and `strategy-verifier`; tracker/host connectors behind `$VC_RUN`; Azure against recorded responses; the `fetch` agent and the host-governed route; the "unavailable is not doubt" floor rule; the VCST-5097 regression check | P1a, P1b, P1c |

P0's benchmark (B7) has not run. The owner chose on 2026-10-26 to start P1 without waiting for it.

## Global Constraints

- **Committed tests only under `plugins/vc-init/bridge/`.** Profile and declaration code outside `bridge/` gets temporary tests (`scripts/unit/tmp-<name>.test.mjs`), run red then green and deleted before the commit (`CLAUDE.md` NO CODE ⇒ NO UNIT TEST).
- **Run the bridge tests with `node --test "plugins/vc-init/bridge/*.test.mjs"`.** CI runs them from `.github/workflows/unit-tests.yml`. All of them stay green at every commit.
- Exit codes are the bridge's existing ones: 64 refused, 69 unavailable, 70 internal error, 78 host-governed. Do not add new ones.
- **A field added to `PROFILE_DEFAULTS` is added to `plugins/vc-fix/scripts/lib/project-profile.mjs` in the same commit** (`plugins/CLAUDE.md`).
- No hardcoded hosts, paths or env names. Script roots and environments come from the profile's `test` block; the env comes from `currentEnv()`.
- **Release** (`docs/release-process.md`): Step 1 sets `plugins/vc-init/.claude-plugin/plugin.json` to `0.4.0` and adds a `CHANGELOG.md` entry. After merge, Step 5a runs `claude plugin tag --push` from `plugins/vc-init/`, because `vc-fix`, `vc-perf` and later `vc-test` depend on it.
- `npm run context:check` and `npm test` green before the PR.

## Review Focus

1. **A token reaching a runner child.** If `GH_TOKEN`, `GITHUB_TOKEN`, `ADO_PAT` or `JIRA_API_TOKEN` is exported in the caller's shell, or bound in a mis-edited task, the runner's child environment must still hold none of them. Test in Task 3.
2. **A script path that escapes the roots.** `..` segments, an absolute path elsewhere, or a symlink or Windows junction inside a root that points outside it are refused. The check runs after `realpathSync`, never on the string. Test in Task 3.
3. **A GraphQL document that is almost the pinned one.** A different variable value is admitted. These are refused: one changed byte, a `mutation`, a second operation, `-F query=@file`, a variable read from a file (`-F o=@C:\…` would post a local file to GitHub), or a repeated variable. Test in Task 2.
4. **`TEST_ENV` names an environment the `test` block does not list**, for example a production stand. The runner refuses before any vc-secrets task starts, on both routes. Test in Task 3.
5. **A schema-3 profile written before the `test` block existed** keeps loading, reconciling and merging as before. The runner refuses with "run /vc-test:init" and never treats an absent block as "every env allowed". Tests in Tasks 1 and 3.

---

### Task 1: The profile's `test` block

**Files:**
- Modify: `plugins/vc-init/scripts/lib/project-profile.mjs` (`PROFILE_DEFAULTS` gains `test: {}` next to `perf: {}`; the JSDoc typedef and the header list name it)
- Modify: `plugins/vc-fix/scripts/lib/project-profile.mjs` (the same field, same commit)
- Modify: `plugins/vc-init/skills/project-init/profile-set.mjs:43` (`MERGEABLE = ["perf", "test"]`)
- Modify: `plugins/vc-init/skills/project-init/gen-profile.mjs:146-153` (a re-run keeps `existing.test` exactly as it keeps `existing.perf`)
- Test (temporary): `scripts/unit/tmp-vc-init-test-block.test.mjs`

**Interfaces:**
- Produces: the `test` block is an **open map** owned by `vc-test`. `vc-init` keeps it wholesale and never prunes it. Its keys are fixed here because the runner (Task 3) reads two of them:
  - `test.environments: Record<env, { writable: boolean }>`: the environments a run may use.
  - `test.scriptRoots: string[]`: project-relative directories whose files the runner may execute.
  - `test.knowledgeStore: string`: read by P1c only.

  `/vc-test:init` (P1c) is the writer, through `profile-set.mjs --merge 'test=<json>'`.

- [ ] **Step 1: Write the failing test** — in a temp project dir:
  - `profile-set.mjs --merge 'test={"environments":{"vcst":{"writable":true}},"scriptRoots":["reports/tickets"]}'` exits 0 and the file holds the block.
  - A second `--merge 'test={"knowledgeStore":"qa-knowledge/"}'` keeps `environments`, because `--merge` is `deepMerge` (`profile-set.mjs:148`).
  - `reconcile-profile.mjs` on a profile with an unknown key inside `test` keeps that key.
  - `gen-profile.mjs` re-run over a profile with `test` keeps it byte-equal.
  - A profile with no `test` key loads through `readProjectProfile` with `test` equal to `{}`.
- [ ] **Step 2: Run** `npx tsx --test scripts/unit/tmp-vc-init-test-block.test.mjs`. Expected: FAIL on `--merge root "test" is not writable`.
- [ ] **Step 3: Implement** the four edits above.
- [ ] **Step 4: Run** the test (PASS) and `node --test "plugins/vc-init/bridge/*.test.mjs"` (PASS).
- [ ] **Step 5: Delete the test, commit**: `feat(vc-init): a test block in the profile, writable through profile-set --merge (vc-test U21)`.

### Task 2: The pinned GraphQL read (B8)

**Files:**
- Modify: `plugins/vc-init/bridge/allowlist.mjs` (`ghApiWrite`, a new export `PINNED_GRAPHQL`, a new export `checkPinnedGraphql`)
- Test (committed): `plugins/vc-init/bridge/allowlist.test.mjs` (replace the "no GraphQL" assertions in "gh api reads only" with the cases below)

**Interfaces:**
- Produces:
  - `PINNED_GRAPHQL: Readonly<Record<string, { query: string, variables: string[] }>>`. v1 has one entry, `reviewThreads`. Its `query` is byte-equal to the string in `.claude/skills/ticket-context/lib/github.mjs` `unresolvedThreads`: `query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}`. Its `variables` are `["o", "r", "n"]`.
  - `checkPinnedGraphql(rest: string[]) => string | null`: the refusal, or null.
- Consumes (P1d): the `host` connector calls `node "$VC_RUN" gh api graphql -f query=<that string> -F o=<owner> -F r=<repo> -F n=<number>`.

- [ ] **Step 1: Write the failing tests** in `allowlist.test.mjs`:
  - **allowed:**
    - `gh api graphql -f query=<pinned> -F o=VirtoCommerce -F r=vc-platform -F n=3133`;
    - the same with `--jq '.data'` added;
    - the same with `-f query=<pinned>` written as `--raw-field=query=<pinned>`.
  - **refused**, with the reason matched:
    - the pinned query plus one space (`/not a pinned read query/`);
    - `mutation{…}`;
    - two operations in one document;
    - `-F query=@q.graphql` (`/from a file/`);
    - `-F o=@secret.txt` (`/from a file/`);
    - `-F x=1`, an unknown variable;
    - `-F o=a -F o=b`, a repeated variable;
    - a missing `n`;
    - `--input body.json`;
    - `-H 'X: y'`;
    - `-X POST`;
    - `--hostname example.com`;
    - `graphql` with no query at all.
  - The existing "no write method, no body" cases on REST endpoints stay unchanged.
- [ ] **Step 2: Run** `node --test plugins/vc-init/bridge/allowlist.test.mjs`. Expected: the allowed cases FAIL with "gh api graphql is not allowed".
- [ ] **Step 3: Implement.**
  - In `ghApiWrite`, a `graphql` endpoint returns `checkPinnedGraphql(rest)` instead of the blanket refusal.
  - `checkPinnedGraphql` walks `rest`. It admits exactly one `query` field, given by `-f`, `--raw-field` or `--field` with a literal value, and the pinned entry's variables, each exactly once, as `-F <name>=<value>` or `-f <name>=<value>`. It admits `--jq` or `-q` with its value, and the endpoint itself.
  - Everything else is refused. That includes a value that starts with `@` on any field.
- [ ] **Step 4: Run** all bridge tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(vc-init): admit the one pinned review-threads GraphQL read through the bridge (vc-test B8)`.

### Task 3: The script runner (U32, B10)

**Files:**
- Create: `plugins/vc-init/bridge/runner.mjs` (pure checks and command building)
- Modify:
  - `plugins/vc-init/bridge/allowlist.mjs`: `TOOL_GROUP.runner = "runner"`; `GROUPS` gains `"runner"`; `checkArgv` delegates `runner` to `checkRunnerShape`.
  - `plugins/vc-init/bridge/run.mjs`: the outer and inner routes for `runner`; `GROUP_SECRETS.runner = []`; `buildInnerEnv` takes passwords only for `runner`; `HOST_ROLE.runner = "browsers"`; `USAGE`; `--where`.
  - `plugins/vc-init/skills/project-init/lib/passwords.mjs`: `runnerTask = (env) => \`vc-init-runner.${env}\``, and the launchable regex admits it.
- Test (committed): `plugins/vc-init/bridge/runner.test.mjs`. Extend `run.test.mjs` for the env and route cases.

**Interfaces:**
- Produces, in `runner.mjs`:
  - `checkRunnerShape(args: string[]) => { ok, reason }`. The shape only, with no file system:
    - `args[0]` is `"playwright"` or `"node"`.
    - `playwright` takes one or more paths, each ending `.spec.ts`, `.spec.mjs` or `.spec.js`, and no flag at all.
    - `node` takes one path ending `.mjs` or `.js`, then any arguments for the script.
    - No path starts with `-`, and no argument holds a line break (add `runner` to `checkArgv`'s line-break list).
  - `checkRunnerFiles(args, { projectRoot: string, scriptRoots: string[] }) => { ok, reason, files: string[] }`. It resolves each path against `projectRoot` and runs `realpathSync`. It requires the file to exist and to sit inside the `realpath` of one of `scriptRoots`, each resolved against `projectRoot`. An empty or absent `scriptRoots` is a refusal: `"the profile's test block names no scriptRoots — run /vc-test:init"`.
  - `runnerEnvAllowed(testBlock: object|null, env: string) => { ok, reason }`. Refuses unless `testBlock?.environments?.[env]` exists. The reason names the env and says "run /vc-test:init".
  - `runnerCommand(args, { node, playwrightCli, config, files }) => { command, args }`:
    - `playwright` gives `[playwrightCli, "test", "--config", config, ...files]`;
    - `node` gives `[files[0], ...args.slice(2)]`.
    
    Both use `command: node`, and `cwd` is the project root.
  - `findPlaywright(projectRoot, resolvePluginFile) => { playwrightCli, config } | { error }`:
    - The CLI is `<projectRoot>/node_modules/@playwright/test/cli.js` when present, else `vc-test`'s `node_modules/@playwright/test/cli.js` (spec B1).
    - The config is always `vc-test`'s `harness/playwright.config.mjs`, resolved with `trustedOnly` on the inner side.
    - A missing piece returns an error that names it.
- Route, in `run.mjs`:
  - **outer:** check the argv shape; read the profile's `test` block; refuse with 64 unless the env is allowed (`currentEnv()`, Review Focus 4); check the files.
    - When `runnerTask(env)` is declared, launch that task with `VC_RUN_ARGV`.
    - Otherwise spawn directly with `buildInnerEnv(process.env, "runner")`. The passwords are in `.env.local`, so nothing is injected, but the environment is still the allowlisted one, with no `NODE_OPTIONS`.
  - **inner:** repeat every check against `decls.root`, with `useEnv: false` for the profile. `toolInGroup` keeps `runner` out of every other group and every other tool out of `runner`. Redact output with the password values.

- [ ] **Step 1: Write the failing tests** in `runner.test.mjs`:
  - shape: `[]`, `["bash"]`, `["node"]`, `["node", "-e", "x"]`, `["playwright"]`, `["playwright", "--config", "x.ts", "a.spec.ts"]` and `["playwright", "a.ts"]` are each refused. `["node", "check.mjs", "--flag"]` and `["playwright", "a.spec.ts", "b.spec.mjs"]` are allowed.
  - files, in a temp dir with root `reports/tickets`:
    - a file inside is allowed;
    - `reports/tickets/../../x.mjs` is refused;
    - an absolute path outside is refused;
    - a missing file is refused;
    - a symlink (a junction on Windows, `symlinkSync(target, link, "junction")`) inside the root that points outside is refused (Review Focus 2);
    - `scriptRoots: []` and `undefined` are refused with "run /vc-test:init" (Review Focus 5).
  - env: `runnerEnvAllowed(null, "vcst")` and `runnerEnvAllowed({ environments: { qa: {} } }, "prod")` are refused; `{ environments: { vcst: { writable: false } } }` with `vcst` is allowed. Writability is `vc-test`'s business, not the runner's.
  - `buildInnerEnv({ ...process.env, ADMIN_PASSWORD: "p1", GH_TOKEN: "t", GITHUB_TOKEN: "t", ADO_PAT: "t", JIRA_API_TOKEN: "t", NODE_OPTIONS: "--require x" }, "runner")`: `env.ADMIN_PASSWORD === "p1"`; none of the token names, `GH_TOKEN` or `NODE_OPTIONS` is present; `secrets` holds only `ADMIN_PASSWORD` (Review Focus 1).
  - groups: `toolInGroup("runner", "onboard") === false`, `toolInGroup("gh", "runner") === false`, `toolInGroup("runner", "runner") === true`.
  - `runnerCommand` builds exactly the argv above, and `findPlaywright` prefers the project's CLI over `vc-test`'s.
  - integration, the same pattern as `run.test.mjs`: a temp script under a root prints `process.env.ADMIN_PASSWORD`. Run through `runChild` with the password in `secrets`, the output holds the mask and not `p1`.
- [ ] **Step 2: Run** `node --test plugins/vc-init/bridge/runner.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `runner.mjs` and the wiring above. `passwords.mjs` gets `runnerTask`.
- [ ] **Step 4: Run** all bridge tests. Expected: PASS. Then run `node plugins/vc-init/bridge/run.mjs runner node reports/tickets/nope.mjs` in this repository. Expected: exit 64, naming the missing `test` block or file.
- [ ] **Step 5: Commit**: `feat(vc-init): a runner bridge tool — .spec and node checks with the env's test-user passwords, never a token (vc-test U32, B10)`.

### Task 4: Declare the runner task per password env

**Files:**
- Modify: `plugins/vc-init/skills/project-init/write-secrets-decl.mjs` (`buildDeclarations`: for each env in the password map, add `runnerTask(e)` = `{ command: "node", args: [shim, "--inner", "runner"], env: <that env's password bindings only> }`; a removed env removes its runner task; header comment lists it)
- Modify: `plugins/vc-init/README.md` (the bridge table and the `$VC_RUN` usage list name `runner`)
- Test (committed): `plugins/vc-init/bridge/secrets-decl.test.mjs`

**Interfaces:**
- Consumes: `runnerTask` from Task 3, and the existing `passwordSecret(name, env)`.
- Produces: `vc-init-runner.<env>`, which binds `secret:<password-secret>` per password of that env and **no** token axis, even when the github, ado and jira axes are declared.

- [ ] **Step 1: Write the failing tests**:
  - With `pat: { github: true, jira: true }` and `passwords: { vcst: ["ADMIN_PASSWORD"] }`, `tasks["vc-init-runner.vcst"].env` deep-equals `{ ADMIN_PASSWORD: "secret:<passwordSecret('ADMIN_PASSWORD','vcst')>" }`.
  - Dropping `vcst` from `passwords` removes the task.
  - With no password env, there is no runner task.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** all bridge tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(vc-init): declare vc-init-runner.<env> beside each password env`.

### Task 5: Release 0.4.0

**Files:** `plugins/vc-init/.claude-plugin/plugin.json` (`"version": "0.4.0"`), `CHANGELOG.md` (`[Unreleased]` entry: the `test` block, B8, `runner`)

- [ ] **Step 1: Bump and changelog.** Do not touch `marketplace.json`: the listing does not change (release-process Step 1).
- [ ] **Step 2: Check.** Run `claude plugin validate plugins/vc-init`, `node --test "plugins/vc-init/bridge/*.test.mjs"`, `npm test` and `npm run context:check`. Expected: all green.
- [ ] **Step 3: Commit**, push the branch, and open the PR: `release(vc-init): 0.4.0 — profile test block, pinned GraphQL read, runner tool`.
- [ ] **Step 4: After merge.** From `plugins/vc-init/`, run `claude plugin tag --push`. Expected: the tag `vc-init--v0.4.0` exists (`git tag -l 'vc-init--v*'`).
