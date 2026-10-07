# `/qa-env-upgrade` as a script-backed skill: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the draft `/qa-env-upgrade` command with a skill backed by a deterministic script. The script comes from renaming and extending `scripts/deploy/deploy-pr-artifact.ts`.

**Architecture:**
- **Script.** `deploy-pr-artifact.ts` becomes `scripts/deploy/vc-deploy.ts`, with two subcommands: `pr` (the existing `/qa-deploy-pr` core, unchanged in behaviour) and `upgrade` (new).
  - The env resolution, GitHub I/O, minimal-diff manifest editing, delivery and live checks move into `scripts/deploy/lib/`. Both subcommands share them.
  - `upgrade` runs in three phases: **plan** (read-only network work, writes a plan JSON), **table** (a pure function of the plan and the operator's decisions) and **apply** (edit, check by value, deliver ONE PR).
- **Skill.** `.claude/skills/qa-env-upgrade/` handles only the parts that need a person: the per-feature questions, showing the table and the single yes/no.

**Tech Stack:** TypeScript run by `tsx` (and by `node --experimental-transform-types`), Node `fetch`, the `gh` CLI for writes, `node:test` for temporary tests.

**Spec:** the draft command at `cc7f15a5` — `git show cc7f15a5:.claude/commands/qa-env-upgrade.md` (deleted in Task 9). Each section number below (§1–§7) refers to that file.

## Global Constraints

- **Unit tests are TEMPORARY** (repo rule `.claude/knowledge/execution/when-to-write-a-test.md` RULE 2, chosen over writing-plans' TDD-commit default by the user on 2026-10-05):
  - Write each test as `scripts/unit/_tmp-<name>.test.ts`, run it red → green, and **delete it before the commit**.
  - Never commit a new `scripts/unit/` file.
  - The one committed test, `scripts/unit/deploy-pr-artifact.test.ts`, keeps its **filename**. Only its import line changes.
- **Imports use explicit `.ts` extensions, and type-only imports use `import type`.** The script also runs under `node --experimental-transform-types` (`claude schedule/cowork-verify-task-prompt.md`).
- **Typecheck after every task:** `npx tsc --noEmit -p ci/tsconfig.json` (its `include` covers `../scripts/**/*.ts`). Expected: no output, exit 0.
- **Compare versions numerically per component** (`3.1009.0` > `3.999.0`), never as strings.
- **Never transcribe versions, module lists or env→branch mappings.** Read the feed, `config/module-repo-map.json` (`platformRepo`, `themeRepo`, `modules`) and `.env.<env>` live each run.
- **Writes go through `gh`'s keyring token, never `GIT_TOKEN`** (the existing `/qa-deploy-pr` routing: the fine-grained PAT has no write on `vc-deploy-dev`). Reads use `GIT_TOKEN` through `fetch`. This deliberately departs from draft §7, which wrote with `GIT_TOKEN`.
- **The script never merges.** `--apply` is the only path that writes.
- **Plan and decision files go in the session scratchpad,** never in the repo.
- **Prompt budget:** `SKILL.md` stays well under 19,000 chars (BUDGET-004). `npm run context:check` must be green.

## Review Focus

1. **Irregular manifest text** — CRLF endings, tab indents, single-line `{ "BlobName": … }` entries, the last array element removed. Expected: the minimal edit keeps the EOL and indentation, and an unrecognised shape returns `null`, so apply STOPs instead of reformatting. Tests: Task 3.
2. **Version ordering and BlobName splitting** — `3.1009.0` vs `3.999.0`, and `VirtoCommerce.Foo_3.1.0-pr-12-ab12cd.zip` split at the FIRST `_` that is followed by a digit. Tests: Task 4.
3. **The env runs a theme RELEASE at or above the dev `package.json` version.** Expected: `AHEAD` (keep), never `BEHIND` (which would be a downgrade to an alpha). Test: Task 6.
4. **The env branch changes between plan and apply.** Expected: delivery returns `stale`, nothing is written, and the operator is told to re-run. Test: Task 2.
5. **The decisions file leaves out a group, or names an unknown group or value.** Expected: a missing group means *keep* (never write what was not approved); an unknown key or value is a tool error (exit 2). Test: Task 8.

---

## File Structure

```
scripts/deploy/
  vc-deploy.ts            NEW  entry: `pr` | `upgrade` dispatch, isMain guard, Exit → exitCode
  lib/
    exit.ts               NEW  Exit, fail(), sleep()
    env.ts                NEW  REPO_ROOT, OWNER, defaults, BRANCH_MAP, loadEnvFiles, readEnvFile,
                               envFilePath, resolveEnvCoords, EnvCoords
    github.ts             NEW  token, ghHeaders, ghJson, fetchFile, Http (+ makeHttp), GhCli (+ realGhCli)
    manifest.ts           NEW  Target/tagOf, pinnedModule, applyModule, applyPlatform, countChangedLines,
                               text surgery (moved), editPackagesText, editThemeText, THEME_URL_RE,
                               + bumpGhReleaseText, removeBlobEntryText, insertGhReleaseText,
                               editUpgradeText, verifyUpgradeEdit (new)
    deliver.ts            NEW  deliverPr() — branch, commits, PR, fork fallback, stale-snapshot gate
    live.ts               NEW  getAdminToken, liveModules, platformHealthy
  pr/
    pr.ts                 NEW  runPr(args) — the old main(), Jira lookup, artifactFromPrBody, parsePrRef,
                               parsePlatformFlag, platformTargetFromTag
  upgrade/
    types.ts              NEW  Status, Change, Row, QuestionGroup, Decisions, UpgradePlan
    versions.ts           NEW  cmpVersion, baseOf, parseVersion, splitBlobName, trackerKey
    pins.ts               NEW  readPins, isBlobSource, isGhSource, blobBase
    feed.ts               NEW  FeedEntry, isRelease, latestRelease
    classify.ts           NEW  prRelease, classifyModule, classifyPlatform
    theme.ts              NEW  parseBlobList, matchRun, themePinKind, resolveThemeTarget, classifyTheme
    checks.ts             NEW  COUPLED, resolveEndState (fixed point)
    plan.ts               NEW  buildPlan (network), finalize (pure), renderTable, renderPrBody, renderCommitMessage
    cli.ts                NEW  runUpgrade(args)
  deploy-pr-artifact.ts   DELETE (git mv → split)
scripts/unit/deploy-pr-artifact.test.ts   MODIFY import line only
package.json                              MODIFY deploy:pr*, + deploy:upgrade
.claude/skills/qa-env-upgrade/SKILL.md    NEW
.claude/skills/qa-env-upgrade/reference.md NEW
.claude/commands/qa-env-upgrade.md        DELETE
.claude/ROUTING.md, .claude/skills/README.md, .claude/commands/qa-deploy-pr.md,
.claude/skills/qa-deploy-pr/SKILL.md, docs/repo-findings-backlog.md,
claude schedule/cowork-verify-task-prompt.md                     MODIFY path references
```

---

### Task 1: Split `deploy-pr-artifact.ts` into modules behind `vc-deploy.ts pr` (pure refactor)

**Files:**
- Create: `scripts/deploy/vc-deploy.ts`, `scripts/deploy/lib/{exit,env,github,manifest,live}.ts`, `scripts/deploy/pr/pr.ts`
- Delete: `scripts/deploy/deploy-pr-artifact.ts`
- Modify: `scripts/unit/deploy-pr-artifact.test.ts:1,5,9`, `package.json:253-254`

**Interfaces:**
- Produces:
  - `lib/env.ts`: `REPO_ROOT`, `OWNER`, `loadEnvFiles(env)`, `readEnvFile(path)`, `envFilePath(env): string`, `resolveEnvCoords(env, pw?): EnvCoords`, `interface EnvCoords`
  - `lib/github.ts`: `setToken(t)`, `getToken()`, `ghHeaders()`, `ghJson(url)`, `fetchFile(c, path): Promise<ManifestFile>`, `enc(path)`, `interface ManifestFile`, plus the gh write helpers (`ghUser`, `accountPermission`, `canWrite`, `refSha`, `ensureFork`, `createRef`, `commitViaGh`, `createPr`, `gh`, `ghApi`)
  - `lib/manifest.ts`: everything the committed test imports (`applyModule`, `applyPlatform`, `bumpPlatformText`, `countChangedLines`, `editPackagesText`, `editThemeText`, `pinnedModule`, `removeGhReleaseEntry`, `upsertBlobEntry`), plus `Target`, `Kind`, `tagOf`, `THEME_URL_RE`, and the internal helpers it now exports (`splitLines`, `sourceBlockRange`, `indentOf`, `detectIndentUnit`, `escRe`, `subLiteral`)
  - `lib/exit.ts`: `class Exit { code }`, `fail(msg, tag = 'deploy-pr'): never`, `sleep(ms)`
  - `pr/pr.ts`: `runPr(args: string[]): Promise<void>`, `artifactFromPrBody`, `parsePrRef`, `parsePlatformFlag`, `platformTargetFromTag`, `PrRef`

- [ ] **Step 1: Capture the before-refactor behaviour.** Every command below is a read-only dry run, so the outputs are safe to keep.

```bash
mkdir -p "$SCRATCH/t1"   # SCRATCH = the session scratchpad
npx tsx scripts/deploy/deploy-pr-artifact.ts --module=VirtoCommerce.Catalog=3.1048.0-alpha.2573 --env=vcst --json > "$SCRATCH/t1/before-module.json"; echo "exit $?"
npx tsx scripts/deploy/deploy-pr-artifact.ts --platform=3.1076.0 --env=vcst --json > "$SCRATCH/t1/before-platform.json"; echo "exit $?"
npx tsx scripts/deploy/deploy-pr-artifact.ts --env=vcst > "$SCRATCH/t1/before-empty.txt" 2>&1; echo "exit $?"   # expect exit 1, "No artifacts resolved"
npx tsx --test scripts/unit/deploy-pr-artifact.test.ts 2>&1 | tail -3                                            # expect "# pass 77", "# fail 0"
```

- [ ] **Step 2: Move the code.** Use `git mv scripts/deploy/deploy-pr-artifact.ts scripts/deploy/pr/pr.ts` so history follows the bulk of the file. Then cut these line ranges **verbatim** out of `pr/pr.ts` into the new modules. The line numbers are those of the file at `cc7f15a5`.

| Lines | Content | Goes to |
|---|---|---|
| 84–89, 95 | `__dirname`, `REPO_ROOT`, `OWNER`, `DEPLOY_REPO_DEFAULT`, `PACKAGES_PATH_DEFAULT`, `THEME_PATH_DEFAULT`, `BRANCH_MAP` (+ its comment 92–94) | `lib/env.ts` (export `REPO_ROOT`, `OWNER`) |
| 145–148 | `interface EnvCoords` | `lib/env.ts` (export) |
| 152–172, 178–205 | `loadEnvFiles`, `readEnvFile`, `resolveEnvCoords` | `lib/env.ts` (export all three) |
| 149 | `interface ManifestFile` | `lib/github.ts` (export) |
| 173–176, 208–214 | `TOKEN`, `ghHeaders`, `ghJson` | `lib/github.ts` (export; `TOKEN` gets `setToken`/`getToken` accessors) |
| 311–316, 360 | `fetchFile`, `enc` | `lib/github.ts` (export) |
| 559–599 | `GH_ENV`, `gh`, `ghApi`, `ghUser`, `accountPermission`, `canWrite`, `refSha`, `ensureFork`, `createRef`, `commitViaGh`, `createPr` | `lib/github.ts` (export all) |
| 98, 109–120 | `THEME_URL_RE`, `type Kind`, `interface Target`, `tagOf` | `lib/manifest.ts` (export) |
| 317–358, 362–557 | `pinnedModule` … `editThemeText` | `lib/manifest.ts` (export the helpers listed above as well) |
| 601–622 | `getAdminToken`, `liveModules`, `platformHealthy` | `lib/live.ts` (export) |
| 624–626 | `sleep`, `Exit`, `fail` | `lib/exit.ts` (export; `fail` gains an optional `tag` parameter, default `'deploy-pr'`) |
| 894–898 | `isMain` guard + `main().catch` | `vc-deploy.ts` (rewritten, Step 4) |

What stays in `pr/pr.ts`:
- the doc header (lines 1–76): replace line 2 with ` * vc-deploy.ts pr — deploy a change's PR artifacts` and line 49 with ` *   npx tsx scripts/deploy/vc-deploy.ts pr <ticket-key> [options]`
- `JIRA_BASE`, `ARTIFACT_RE`, `PR_URL_RE`, `PLATFORM_IMAGE_TAG_RE`, `SEMVER_PREFIX_RE`
- `platformTargetFromTag`, `parsePlatformFlag`, the Jira functions, `artifactFromPrBody`, `artifactFromPr`, `parsePrRef`
- `main`, renamed to `export async function runPr(args: string[])`, with line 630 (`const args = process.argv.slice(2);`) removed
- in `runPr`, line 641 becomes `setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN); if (!getToken()) fail(...)`
- line 651's usage string becomes `vc-deploy.ts pr <ticket-key> ...`
- line 90 (`POLL`) is unused: delete it

Give each new module this kind of header:

```ts
// scripts/deploy/lib/manifest.ts — minimal-diff editing of vc-deploy-dev's backend/packages.json and
// theme/artifact.json. Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.
```

Imports in `pr/pr.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OWNER, REPO_ROOT, loadEnvFiles, resolveEnvCoords } from '../lib/env.ts';
import { accountPermission, canWrite, commitViaGh, createPr, createRef, ensureFork, fetchFile, getToken, gh, ghJson, ghUser, refSha, setToken } from '../lib/github.ts';
import { THEME_URL_RE, countChangedLines, editPackagesText, editThemeText, pinnedModule, tagOf } from '../lib/manifest.ts';
import type { Target } from '../lib/manifest.ts';
import { getAdminToken, liveModules, platformHealthy } from '../lib/live.ts';
import { Exit, fail } from '../lib/exit.ts';
```

Remove any of these that TypeScript reports as unused in Step 5. `lib/env.ts` must compute `REPO_ROOT` as `resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')`, because the file is now one directory deeper.

- [ ] **Step 3: Pull the env-file path out of `resolveEnvCoords`** (lines 181–182) so the upgrade CLI can STOP when the file is missing:

```ts
/** The .env file that describes `env`: stable/regression live in .env.vcptcore_<key>, everything else in .env.<env>. */
export function envFilePath(env: string): string {
  const vcpt = /^vcptcore[_-](stable|regression)$/i.exec(env);
  return resolve(REPO_ROOT, vcpt ? `.env.vcptcore_${vcpt[1].toLowerCase()}` : `.env.${env}`);
}
```

…and in `resolveEnvCoords`, replace those two lines with `const e = readEnvFile(envFilePath(env));`.

- [ ] **Step 4: Write the entry point** `scripts/deploy/vc-deploy.ts`:

```ts
/**
 * vc-deploy.ts — the deterministic core for changing what a vc-deploy-dev env branch deploys.
 *
 *   vc-deploy.ts pr <ticket-key> [...]   deploy a change's PR prerelease artifacts   (/qa-deploy-pr)
 *   vc-deploy.ts upgrade --env=<env> ... bring an env up to the latest releases     (/qa-env-upgrade)
 *
 * Each subcommand documents its own flags in its module header (pr/pr.ts, upgrade/cli.ts).
 * Neither ever merges: a human merges the deploy PR, and the merge deploys.
 */
import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Exit } from './lib/exit.ts';
import { runPr } from './pr/pr.ts';

const USAGE = 'Usage: vc-deploy.ts <pr|upgrade> [...]  (see pr/pr.ts and upgrade/cli.ts)';

export async function dispatch(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub === 'pr') return runPr(rest);
  if (sub === 'upgrade') return (await import('./upgrade/cli.ts')).runUpgrade(rest);
  console.error(`[vc-deploy] unknown subcommand "${sub ?? ''}". ${USAGE}`);
  throw new Exit(2);
}

// Guarded so the module can be imported (e.g. by unit tests) without running the CLI.
const isMain = (() => {
  try { return !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]); } catch { return false; }
})();
if (isMain) {
  dispatch(process.argv.slice(2)).catch((e) => {
    if (e instanceof Exit) { process.exitCode = e.code; return; }
    console.error(`[vc-deploy] fatal: ${e.message}`);
    process.exitCode = 2;
  });
}
```

`upgrade/cli.ts` does not exist until Task 8. The dynamic `import()` keeps `pr` working, and typechecks, until then. Add a temporary stub `scripts/deploy/upgrade/cli.ts` containing `export async function runUpgrade(_args: string[]): Promise<void> { throw new Error('vc-deploy upgrade: not implemented yet'); }`. Task 8 replaces it.

- [ ] **Step 5: Re-point the committed test and the npm scripts.**

`scripts/unit/deploy-pr-artifact.test.ts`:
- line 1: `// Unit tests for scripts/deploy/lib/manifest.ts + pr/pr.ts — the deterministic core behind /qa-deploy-pr.`
- line 9: `const mod = { ...(await import("../deploy/lib/manifest.ts")), ...(await import("../deploy/pr/pr.ts")) };`

`package.json`:

```json
    "deploy:pr": "npx tsx scripts/deploy/vc-deploy.ts pr",
    "deploy:pr:apply": "npx tsx scripts/deploy/vc-deploy.ts pr --apply",
```

- [ ] **Step 6: Verify the behaviour is identical.**

```bash
npx tsc --noEmit -p ci/tsconfig.json                                   # no output
npx tsx --test scripts/unit/deploy-pr-artifact.test.ts 2>&1 | tail -3  # "# pass 77", "# fail 0"
npx tsx scripts/deploy/vc-deploy.ts pr --module=VirtoCommerce.Catalog=3.1048.0-alpha.2573 --env=vcst --json > "$SCRATCH/t1/after-module.json"; echo "exit $?"
npx tsx scripts/deploy/vc-deploy.ts pr --platform=3.1076.0 --env=vcst --json > "$SCRATCH/t1/after-platform.json"; echo "exit $?"
npx tsx scripts/deploy/vc-deploy.ts pr --env=vcst > "$SCRATCH/t1/after-empty.txt" 2>&1; echo "exit $?"
diff "$SCRATCH/t1/before-module.json" "$SCRATCH/t1/after-module.json" && diff "$SCRATCH/t1/before-platform.json" "$SCRATCH/t1/after-platform.json" && diff "$SCRATCH/t1/before-empty.txt" "$SCRATCH/t1/after-empty.txt" && echo IDENTICAL
node --experimental-transform-types --no-warnings scripts/deploy/vc-deploy.ts pr --env=vcst; echo "exit $?"   # same "No artifacts resolved", exit 1 — proves the node runner path
npx tsx scripts/deploy/vc-deploy.ts bogus; echo "exit $?"              # "[vc-deploy] unknown subcommand", exit 2
```

Expected: `IDENTICAL` and the exit codes from Step 1. If the env branch moved between the two runs, the JSON can differ only in the `current` fields. Re-run both before/after commands back to back to confirm.

- [ ] **Step 7: Commit.**

```bash
git add scripts/deploy package.json scripts/unit/deploy-pr-artifact.test.ts
git status --porcelain scripts/unit   # only " M scripts/unit/deploy-pr-artifact.test.ts"
git commit -m "refactor(deploy): split deploy-pr-artifact.ts into lib/ modules behind vc-deploy.ts pr

Pure move: same dry-run output, same exit codes, same 77 tests.
Prepares the shared core for vc-deploy.ts upgrade (/qa-env-upgrade).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Extract delivery into `lib/deliver.ts` (injectable, snapshot-gated)

**Files:**
- Create: `scripts/deploy/lib/deliver.ts`
- Modify: `scripts/deploy/lib/github.ts` (add `Author` support to `commitViaGh`, add `realGhCli`), `scripts/deploy/pr/pr.ts` (the APPLY block, old lines 810–880)
- Test (temporary): `scripts/unit/_tmp-deliver.test.ts`

**Interfaces:**
- Consumes: `EnvCoords` (Task 1), the gh write helpers (Task 1)
- Produces:

```ts
export interface Author { name: string; email: string }
export interface GhCli {
  user(): string | null;
  permission(owner: string, repo: string, me: string): string;
  refSha(owner: string, repo: string, branch: string): string | null;
  ensureFork(owner: string, repo: string, me: string): Promise<boolean>;
  mergeUpstream(me: string, repo: string, branch: string): void;
  createRef(owner: string, repo: string, branch: string, sha: string): boolean;
  fileText(owner: string, repo: string, path: string, ref: string): Promise<string | null>;
  commit(owner: string, repo: string, path: string, text: string, branch: string, message: string, author?: Author): boolean;
  createPr(owner: string, repo: string, base: string, head: string, title: string, body: string): { ok: boolean; url?: string; note: string };
}
export const realGhCli: GhCli;                       // in lib/github.ts
export interface DeliverFile { path: string; text: string; snapshot?: string }
export interface DeliverRequest {
  coords: EnvCoords; headBranch: string; uniqueBranch?: boolean; title: string; message?: string; body: string;
  files: DeliverFile[]; author?: Author; forkOwner?: string; log?: (line: string) => void;
}
export type DeliverResult =
  | { kind: 'pr'; url: string; note: string; headBranch: string; compareUrl: string; direct: boolean; account: string; perm: string }
  | { kind: 'pushed-no-pr'; note: string; headBranch: string; compareUrl: string; direct: boolean; account: string; perm: string }
  | { kind: 'partial'; headBranch: string; compareUrl: string; writeOwner: string; committed: string[]; failed: string[] }
  | { kind: 'handoff'; reason: string }
  | { kind: 'stale'; path: string };
export class DeliverError extends Error {}
export async function deliverPr(req: DeliverRequest, cli?: GhCli): Promise<DeliverResult>;
```

- [ ] **Step 1: Write the failing temporary test** `scripts/unit/_tmp-deliver.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliverPr } from '../deploy/lib/deliver.ts';
import type { GhCli } from '../deploy/lib/github.ts';

const coords = { env: 'vcst', deployOwner: 'VirtoCommerce', deployRepo: 'vc-deploy-dev', branch: 'vcst-qa', packagesPath: 'backend/packages.json', themePath: 'theme/artifact.json', backUrl: '', admin: 'admin', password: 'x' };

function fakeCli(over: Partial<GhCli> & { refs?: Record<string, string>; head?: string } = {}) {
  const calls: string[] = [];
  const refs: Record<string, string> = { 'VirtoCommerce/vc-deploy-dev@vcst-qa': 'base', ...(over.refs ?? {}) };
  const cli: GhCli = {
    user: () => 'me', permission: () => 'write',
    refSha: (o, r, b) => refs[`${o}/${r}@${b}`] ?? null,
    ensureFork: async () => true, mergeUpstream: () => {},
    createRef: (o, r, b, sha) => { calls.push(`ref ${o}/${r}@${b}`); refs[`${o}/${r}@${b}`] = sha; return true; },
    fileText: async () => over.head ?? 'SNAP',
    commit: (_o, _r, path, _t, branch) => { calls.push(`commit ${path}@${branch}`); return true; },
    createPr: (_o, _r, base, head) => { calls.push(`pr ${head}→${base}`); return { ok: true, url: 'https://x/pull/1', note: 'opened' }; },
    ...over,
  };
  return { cli, calls };
}

test('stale snapshot: nothing is written', async () => {
  const { cli, calls } = fakeCli({ head: 'CHANGED' });
  const r = await deliverPr({ coords, headBranch: 'env-upgrade-vcst-qa-20261005', title: 't', body: 'b', files: [{ path: 'backend/packages.json', text: 'NEW', snapshot: 'SNAP' }] }, cli);
  assert.deepEqual(r, { kind: 'stale', path: 'backend/packages.json' });
  assert.deepEqual(calls, []);
});

test('uniqueBranch: a taken name gets -2, then -3', async () => {
  const { cli, calls } = fakeCli({ refs: { 'VirtoCommerce/vc-deploy-dev@env-upgrade-x': 's', 'VirtoCommerce/vc-deploy-dev@env-upgrade-x-2': 's' } });
  const r = await deliverPr({ coords, headBranch: 'env-upgrade-x', uniqueBranch: true, title: 't', body: 'b', files: [{ path: 'backend/packages.json', text: 'NEW', snapshot: 'SNAP' }] }, cli);
  assert.equal(r.kind, 'pr');
  assert.equal((r as any).headBranch, 'env-upgrade-x-3');
  assert.deepEqual(calls, ['ref VirtoCommerce/vc-deploy-dev@env-upgrade-x-3', 'commit backend/packages.json@env-upgrade-x-3', 'pr env-upgrade-x-3→vcst-qa']);
});

test('no write permission → fork head spec owner:branch', async () => {
  const { cli, calls } = fakeCli({ permission: () => 'read', refs: { 'me/vc-deploy-dev@vcst-qa': 'forkbase' } });
  const r = await deliverPr({ coords, headBranch: 'h', title: 't', body: 'b', files: [{ path: 'p', text: 'x' }] }, cli);
  assert.equal(r.kind, 'pr');
  assert.ok(calls.includes('ref me/vc-deploy-dev@h'));
  assert.ok(calls.includes('pr me:h→vcst-qa'));
});

test('second file fails → partial, no PR', async () => {
  const { cli, calls } = fakeCli({ commit: (_o, _r, path) => path === 'a' });
  const r = await deliverPr({ coords, headBranch: 'h', title: 't', body: 'b', files: [{ path: 'a', text: '1' }, { path: 'b', text: '2' }] }, cli);
  assert.equal(r.kind, 'partial');
  assert.deepEqual([(r as any).committed, (r as any).failed], [['a'], ['b']]);
  assert.ok(!calls.some((c) => c.startsWith('pr ')));
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx tsx --test scripts/unit/_tmp-deliver.test.ts`. Expected: FAIL with `Cannot find module '../deploy/lib/deliver.ts'`.

- [ ] **Step 3: Add author support and `realGhCli` to `lib/github.ts`.**

Change `commitViaGh` to take an author, and keep its body otherwise unchanged:

```ts
export interface Author { name: string; email: string }
export function commitViaGh(owner: string, repo: string, path: string, text: string, branch: string, message: string, author?: Author): boolean {
  let sha: string | null = null;
  try { sha = ghApi(`repos/${owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`).sha ?? null; } catch { /* new file */ }
  const args = ['api', '--method', 'PUT', `repos/${owner}/${repo}/contents/${enc(path)}`, '-f', `message=${message}`, '-f', `content=${Buffer.from(text, 'utf8').toString('base64')}`, '-f', `branch=${branch}`];
  if (sha) args.push('-f', `sha=${sha}`);
  if (author) for (const who of ['author', 'committer']) args.push('-f', `${who}[name]=${author.name}`, '-f', `${who}[email]=${author.email}`);
  try { gh(args); return true; } catch (e: any) { console.error('[vc-deploy] commit failed:', String(e.stderr || e.message || e).slice(0, 240)); return false; }
}
```

Then add the `GhCli` interface exactly as listed under Interfaces, and:

```ts
export const realGhCli: GhCli = {
  user: ghUser,
  permission: accountPermission,
  refSha,
  ensureFork,
  mergeUpstream: (me, repo, branch) => { try { gh(['api', '--method', 'POST', `repos/${me}/${repo}/merge-upstream`, '-f', `branch=${branch}`]); } catch { /* fork may already be current */ } },
  createRef,
  fileText: async (owner, repo, path, ref) => {
    const j = await ghJson(`https://api.github.com/repos/${owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`);
    return j?.content ? Buffer.from(j.content, 'base64').toString('utf8') : null;
  },
  commit: commitViaGh,
  createPr,
};
```

- [ ] **Step 4: Write `lib/deliver.ts`.** It is the old APPLY block, generalised:

```ts
// scripts/deploy/lib/deliver.ts — open ONE deploy PR into an env branch of vc-deploy-dev.
// Direct same-repo branch when the account has write, else a branch on its fork. Never merges.
import type { EnvCoords } from './env.ts';
import { canWrite, realGhCli } from './github.ts';
import type { Author, GhCli } from './github.ts';

export interface DeliverFile { path: string; text: string; snapshot?: string }
export interface DeliverRequest {
  coords: EnvCoords; headBranch: string; uniqueBranch?: boolean; title: string; message?: string; body: string;
  files: DeliverFile[]; author?: Author; forkOwner?: string; log?: (line: string) => void;
}
export type DeliverResult =
  | { kind: 'pr'; url: string; note: string; headBranch: string; compareUrl: string; direct: boolean; account: string; perm: string }
  | { kind: 'pushed-no-pr'; note: string; headBranch: string; compareUrl: string; direct: boolean; account: string; perm: string }
  | { kind: 'partial'; headBranch: string; compareUrl: string; writeOwner: string; committed: string[]; failed: string[] }
  | { kind: 'handoff'; reason: string }
  | { kind: 'stale'; path: string };
export class DeliverError extends Error {}

export async function deliverPr(req: DeliverRequest, cli: GhCli = realGhCli): Promise<DeliverResult> {
  const c = req.coords, log = req.log ?? (() => {});
  const me = req.forkOwner || cli.user();
  if (!me) throw new DeliverError('Could not resolve the GitHub account — is `gh` authenticated? (run `gh auth status`).');
  // The plan was computed from a snapshot; if the env branch moved since, the approved diff is stale.
  for (const f of req.files) {
    if (f.snapshot === undefined) continue;
    if ((await cli.fileText(c.deployOwner, c.deployRepo, f.path, c.branch)) !== f.snapshot) return { kind: 'stale', path: f.path };
  }
  const perm = cli.permission(c.deployOwner, c.deployRepo, me);
  const direct = canWrite(perm);
  const baseSha = cli.refSha(c.deployOwner, c.deployRepo, c.branch);
  if (!baseSha) throw new DeliverError(`Could not read ${c.deployOwner}/${c.deployRepo}@${c.branch} head — check the branch name for env "${c.env}".`);
  let writeOwner: string;
  if (direct) {
    writeOwner = c.deployOwner;
    log(`[apply] direct (perm=${perm}) on ${c.deployOwner}/${c.deployRepo} → ${c.branch}`);
  } else {
    log(`[apply] account "${me}" has no write (perm=${perm}) on ${c.deployOwner}/${c.deployRepo} — forking`);
    if (!(await cli.ensureFork(c.deployOwner, c.deployRepo, me))) return { kind: 'handoff', reason: 'Could not create/find your fork.' };
    cli.mergeUpstream(me, c.deployRepo, c.branch);
    writeOwner = me;
  }
  let headBranch = req.headBranch;
  if (req.uniqueBranch) for (let n = 2; cli.refSha(writeOwner, c.deployRepo, headBranch) !== null; n++) headBranch = `${req.headBranch}-${n}`;
  const headSpec = direct ? headBranch : `${me}:${headBranch}`;
  const branchSha = direct ? baseSha : (cli.refSha(me, c.deployRepo, c.branch) || baseSha);
  // Surface (not silently resolve) a concurrent run on a deterministic branch name: the commits below overwrite it.
  const headExistedBefore = !req.uniqueBranch && cli.refSha(writeOwner, c.deployRepo, headBranch) !== null;
  const compareUrl = `https://github.com/${c.deployOwner}/${c.deployRepo}/compare/${c.branch}...${headSpec.replace(':', '%3A')}?expand=1`;
  if (!cli.createRef(writeOwner, c.deployRepo, headBranch, branchSha)) return { kind: 'handoff', reason: 'Could not create the deployment branch.' };
  if (headExistedBefore) {
    log(`\n⚠ Branch ${writeOwner}/${c.deployRepo}@${headBranch} already existed before this run.`);
    log(`  Possible concurrent run for the same ticket+env — the commits below will`);
    log(`  overwrite whatever is currently on that branch (no merge). If unsure, stop and compare first:`);
    log(`  ${compareUrl}`);
  }
  const committed: string[] = [], failed: string[] = [];
  for (const f of req.files) (cli.commit(writeOwner, c.deployRepo, f.path, f.text, headBranch, req.message ?? req.title, req.author) ? committed : failed).push(f.path);
  if (failed.length) return committed.length
    ? { kind: 'partial', headBranch, compareUrl, writeOwner, committed, failed }
    : { kind: 'handoff', reason: 'A commit failed (push rights?).' };
  const pr = cli.createPr(c.deployOwner, c.deployRepo, c.branch, headSpec, req.title, req.body);
  return pr.ok
    ? { kind: 'pr', url: pr.url!, note: pr.note, headBranch, compareUrl, direct, account: me, perm }
    : { kind: 'pushed-no-pr', note: pr.note, headBranch, compareUrl, direct, account: me, perm };
}
```

- [ ] **Step 5: Re-point `runPr`'s APPLY block at `deliverPr`.**
  - Replace old lines 810–872 (from `const me = flag('fork-owner')…` through the `createPr` call) with the code below.
  - Remove the now-unused gh helper imports from `pr/pr.ts`.
  - The `handoff()` function body stays as it is.

```ts
  // ── APPLY (gated write; DIRECT same-repo PR when the account has write, else a fork PR) ──
  const headBranch = `${key || 'deploy'}-${c.branch}-deployment`; // vc-ci "<TICKET>-<branch>-deployment" convention
  const body = [ /* old lines 820–826, unchanged */ ].join('\n');
  const files = [
    ...(pkgTouched ? [{ path: c.packagesPath, text: newPkgText }] : []),
    ...(newThemeText ? [{ path: c.themePath, text: newThemeText }] : []),
  ];
  let r: DeliverResult;
  try { r = await deliverPr({ coords: c, headBranch, title, body, files, forkOwner: flag('fork-owner'), log: asJson ? undefined : (l) => console.log(l) }); }
  catch (e) { if (e instanceof DeliverError) fail(e.message); throw e; }
  if (r.kind === 'handoff') { console.error(`[deploy-pr] ${r.reason}`); return handoff(); }
  if (r.kind === 'stale') fail(`unexpected stale result for ${r.path}`); // pr mode passes no snapshot
  if (r.kind === 'partial') {
    console.error(`[deploy-pr] ⚠ PARTIAL commit — the branch is now in an inconsistent state (push rights?).`);
    for (const p of r.committed) console.error(`  ${p}: committed`);
    for (const p of r.failed) console.error(`  ${p}: FAILED`);
    console.error(`[deploy-pr] Inspect/fix directly on ${r.writeOwner}/${c.deployRepo}@${r.headBranch}, or delete that branch and re-run:`);
    console.error(`  ${r.compareUrl}`);
    throw new Exit(1);
  }
  const pr = r.kind === 'pr' ? { ok: true, url: r.url, note: r.note } : { ok: false, note: r.note };
  if (asJson) { console.log(JSON.stringify({ env, branch: c.branch, account: r.account, direct: r.direct, perm: r.perm, headBranch: r.headBranch, bundle, pr, compareUrl: r.compareUrl, applied: true }, null, 2)); throw new Exit(0); }
  console.log(`\n✅ Committed to ${r.direct ? c.deployOwner : r.account}/${c.deployRepo}@${r.headBranch} (${pkgMinimal ? 'minimal diff' : 'reserialized'})`);
  // …old lines 875–879 unchanged, reading `pr` and `r.compareUrl`
```

One message changes: a partial commit now lists the file paths (`backend/packages.json`) instead of the fixed labels (`packages.json`, `theme/artifact.json`). That is intended.

- [ ] **Step 6: Run the tests until green.**

```bash
npx tsx --test scripts/unit/_tmp-deliver.test.ts 2>&1 | tail -3       # "# fail 0"
npx tsx --test scripts/unit/deploy-pr-artifact.test.ts 2>&1 | tail -3 # "# pass 77"
npx tsc --noEmit -p ci/tsconfig.json
npx tsx scripts/deploy/vc-deploy.ts pr --module=VirtoCommerce.Catalog=3.1048.0-alpha.2573 --env=vcst --json | diff - "$SCRATCH/t1/before-module.json" && echo IDENTICAL
```

Do NOT run `--apply`: it opens a real PR.

- [ ] **Step 7: Delete the temporary test and commit.**

```bash
rm scripts/unit/_tmp-deliver.test.ts
git status --porcelain scripts/unit   # empty
git add scripts/deploy && git commit -m "refactor(deploy): deliverPr() — shared, injectable delivery with a stale-snapshot gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Upgrade edits — bump, promote AzureBlob → GithubReleases, check by value

**Files:**
- Modify: `scripts/deploy/lib/manifest.ts` (append)
- Create: `scripts/deploy/upgrade/pins.ts`, `scripts/deploy/upgrade/versions.ts` (only `splitBlobName` for now; Task 4 fills in the rest of the file)
- Test (temporary): `scripts/unit/_tmp-upgrade-edit.test.ts`

**Interfaces:**
- Consumes: `splitLines`, `sourceBlockRange`, `indentOf`, `detectIndentUnit`, `escRe`, `upsertBlobEntry`, `bumpPlatformText` (Task 1)
- Produces:

```ts
// upgrade/versions.ts
export function splitBlobName(name: string): { id: string; version: string } | null;
// upgrade/pins.ts
export interface Pin { id: string; version: string; source: 'AzureBlob' | 'GithubReleases' }
export function readPins(json: any): { pins: Pin[]; duplicates: string[] };
export const isBlobSource: (s: any) => boolean;
export const isGhSource: (s: any) => boolean;
export function blobBase(json: any): string;   // "<ServiceUri>/<Container>", no trailing slash
// lib/manifest.ts
export type ManifestEditMode = 'release-bump' | 'blob-bump' | 'promote' | 'platform';
export interface ManifestChange { id: string; to: string; mode: ManifestEditMode }
export function bumpGhReleaseText(text: string, id: string, version: string): string | null;
export function removeBlobEntryText(text: string, id: string): string | null;
export function insertGhReleaseText(text: string, id: string, version: string): string | null;
export function editUpgradeText(text: string, changes: ManifestChange[]): { text: string } | { error: string };
export function verifyUpgradeEdit(origText: string, newText: string, changes: ManifestChange[]): string[];
```

- [ ] **Step 1: Write the failing temporary test** `scripts/unit/_tmp-upgrade-edit.test.ts`. The fixture is built from code, and every expected value is computed from it rather than typed in.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpGhReleaseText, editUpgradeText, insertGhReleaseText, removeBlobEntryText, verifyUpgradeEdit } from '../deploy/lib/manifest.ts';
import { readPins } from '../deploy/upgrade/pins.ts';

const manifest = (eol = '\n', ind = '  ') => [
  '{',
  `${ind}"PlatformVersion": "3.1000.0",`,
  `${ind}"PlatformImage": "ghcr.io/virtocommerce/platform",`,
  `${ind}"PlatformImageTag": "3.1000.0",`,
  `${ind}"Sources": [`,
  `${ind}${ind}{`,
  `${ind}${ind}${ind}"Name": "AzureBlob",`,
  `${ind}${ind}${ind}"ServiceUri": "https://vc3prerelease.blob.core.windows.net",`,
  `${ind}${ind}${ind}"Container": "packages",`,
  `${ind}${ind}${ind}"Modules": [`,
  `${ind}${ind}${ind}${ind}{`,
  `${ind}${ind}${ind}${ind}${ind}"BlobName": "VirtoCommerce.Cart_3.900.0-pr-12-abc1234.zip"`,
  `${ind}${ind}${ind}${ind}},`,
  `${ind}${ind}${ind}${ind}{ "BlobName": "VirtoCommerce.Private_3.800.0.zip" }`,
  `${ind}${ind}${ind}]`,
  `${ind}${ind}},`,
  `${ind}${ind}{`,
  `${ind}${ind}${ind}"Name": "GithubReleases",`,
  `${ind}${ind}${ind}"ModuleSources": ["https://raw.githubusercontent.com/VirtoCommerce/vc-modules/master/modules_v3.json"],`,
  `${ind}${ind}${ind}"Modules": [`,
  `${ind}${ind}${ind}${ind}{`,
  `${ind}${ind}${ind}${ind}${ind}"Id": "VirtoCommerce.Catalog",`,
  `${ind}${ind}${ind}${ind}${ind}"Version": "3.1000.0"`,
  `${ind}${ind}${ind}${ind}}`,
  `${ind}${ind}${ind}]`,
  `${ind}${ind}}`,
  `${ind}]`,
  '}', '',
].join(eol);

const pinOf = (text: string, id: string) => readPins(JSON.parse(text)).pins.find((p) => p.id === id);
const changedLines = (a: string, b: string) => a.split(/\r?\n/).filter((l, i) => l !== b.split(/\r?\n/)[i]).length;

test('bumpGhReleaseText changes exactly the one Version line', () => {
  const t = manifest();
  const out = bumpGhReleaseText(t, 'VirtoCommerce.Catalog', '3.1048.0')!;
  assert.equal(pinOf(out, 'VirtoCommerce.Catalog')?.version, '3.1048.0');
  assert.equal(changedLines(t, out), 1);
});

test('promote: AzureBlob entry removed, GithubReleases entry inserted, CRLF + tabs kept', () => {
  for (const [eol, ind] of [['\n', '  '], ['\r\n', '\t']] as const) {
    const t = manifest(eol, ind);
    let out = removeBlobEntryText(t, 'VirtoCommerce.Cart')!;
    out = insertGhReleaseText(out, 'VirtoCommerce.Cart', '3.901.0')!;
    assert.deepEqual(pinOf(out, 'VirtoCommerce.Cart'), { id: 'VirtoCommerce.Cart', version: '3.901.0', source: 'GithubReleases' });
    assert.equal(readPins(JSON.parse(out)).duplicates.length, 0);
    assert.equal(out.includes('\r\n'), eol === '\r\n');
    if (eol === '\r\n') assert.ok(!/[^\r]\n/.test(out), 'no bare LF in a CRLF file');
    const inserted = out.split(eol).find((l) => l.includes('"Id": "VirtoCommerce.Cart"'))!;
    const sibling = out.split(eol).find((l) => l.includes('"Id": "VirtoCommerce.Catalog"'))!;
    assert.equal(inserted.match(/^[ \t]*/)![0], sibling.match(/^[ \t]*/)![0]);
  }
});

test('removing the LAST AzureBlob element drops the trailing comma of the previous one', () => {
  const out = removeBlobEntryText(manifest(), 'VirtoCommerce.Private')!;
  JSON.parse(out); // throws on a dangling comma
  assert.equal(pinOf(out, 'VirtoCommerce.Private'), undefined);
});

test('Id prefix does not match a longer Id', () => {
  assert.equal(removeBlobEntryText(manifest(), 'VirtoCommerce.Car'), null);
});

test('editUpgradeText + verifyUpgradeEdit: approved set only', () => {
  const t = manifest();
  const changes = [
    { id: 'Platform', to: '3.1076.0', mode: 'platform' as const },
    { id: 'VirtoCommerce.Catalog', to: '3.1048.0', mode: 'release-bump' as const },
    { id: 'VirtoCommerce.Cart', to: '3.901.0', mode: 'promote' as const },
    { id: 'VirtoCommerce.Private', to: '3.801.0', mode: 'blob-bump' as const },
  ];
  const r = editUpgradeText(t, changes);
  assert.ok('text' in r);
  assert.deepEqual(verifyUpgradeEdit(t, r.text, changes), []);
  // an edit that changed something NOT approved is caught
  const sneaky = r.text.replace('"Container": "packages"', '"Container": "other"');
  assert.match(verifyUpgradeEdit(t, sneaky, changes).join('\n'), /source header/);
  // an approved change that did not land is caught
  assert.match(verifyUpgradeEdit(t, t, changes).join('\n'), /VirtoCommerce\.Catalog: expected 3\.1048\.0/);
});

test('unrecognised shape → error, never a reformat', () => {
  const oneLine = JSON.stringify(JSON.parse(manifest()));
  const r = editUpgradeText(oneLine, [{ id: 'VirtoCommerce.Cart', to: '3.901.0', mode: 'promote' }]);
  assert.ok('error' in r);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx tsx --test scripts/unit/_tmp-upgrade-edit.test.ts`. Expected: FAIL with `Cannot find module '../deploy/upgrade/pins.ts'`.

- [ ] **Step 3: Write `upgrade/versions.ts`** (only `splitBlobName` for now) **and `upgrade/pins.ts`.**

```ts
// scripts/deploy/upgrade/versions.ts
/** `<Id>_<version>.zip` → Id + version, split at the FIRST `_` followed by a digit (draft §2). */
export function splitBlobName(name: string): { id: string; version: string } | null {
  const m = /^(.+?)_(\d.*)\.zip$/i.exec(name);
  return m ? { id: m[1], version: m[2] } : null;
}
```

```ts
// scripts/deploy/upgrade/pins.ts — read every module pin of a parsed packages.json, whatever its shape.
import { splitBlobName } from './versions.ts';

export interface Pin { id: string; version: string; source: 'AzureBlob' | 'GithubReleases' }
export const isBlobSource = (s: any): boolean => s?.Name === 'AzureBlob' || String(s?.ServiceUri ?? '').includes('vc3prerelease');
export const isGhSource = (s: any): boolean => !isBlobSource(s) && /github/i.test(String(s?.Name ?? ''));

/** One pin per Id. An Id seen twice (both sources, or twice in one) is reported in `duplicates`
 *  and keeps its FIRST pin. An explicit `Version` wins over the BlobName-derived one. */
export function readPins(json: any): { pins: Pin[]; duplicates: string[] } {
  const seen = new Map<string, Pin>(), dups = new Set<string>();
  for (const s of json?.Sources ?? []) {
    const source = isBlobSource(s) ? 'AzureBlob' : isGhSource(s) ? 'GithubReleases' : null;
    if (!source) continue;
    for (const m of s.Modules ?? []) {
      const fromBlob = typeof m?.BlobName === 'string' ? splitBlobName(m.BlobName) : null;
      const id = m?.Id ?? fromBlob?.id, version = m?.Version ?? fromBlob?.version;
      if (!id || version === undefined) continue;
      if (seen.has(id)) dups.add(id); else seen.set(id, { id, version: String(version), source });
    }
  }
  return { pins: [...seen.values()], duplicates: [...dups] };
}

export function blobBase(json: any): string {
  const s = (json?.Sources ?? []).find(isBlobSource);
  const uri = String(s?.ServiceUri ?? 'https://vc3prerelease.blob.core.windows.net').replace(/\/$/, '');
  return `${uri}/${s?.Container ?? 'packages'}`;
}
```

- [ ] **Step 4: Append the edit functions to `lib/manifest.ts`.** Put the two `import` lines with the file's other imports at the top. Everything else goes at the end of the file.

```ts
// (top of file)
import { readPins } from '../upgrade/pins.ts';
import type { Pin } from '../upgrade/pins.ts';

// ── upgrade edits (vc-deploy.ts upgrade) ────────────────────────────────────────────────────────
// Same contract as the surgery above: edit the RAW text, keep EOL and indentation, and return null
// on any shape that is not recognised. Unlike `pr`, `upgrade` never falls back to a reserialize —
// a null STOPs the apply (draft §7: "keep line endings, indentation and odd whitespace exactly").
export type ManifestEditMode = 'release-bump' | 'blob-bump' | 'promote' | 'platform';
export interface ManifestChange { id: string; to: string; mode: ManifestEditMode }

const GH_SOURCE_RE = /"Name"\s*:\s*"[^"]*github[^"]*"/i;
const BLOB_SOURCE_RE = /"Name"\s*:\s*"AzureBlob"|"ServiceUri"\s*:\s*"[^"]*vc3prerelease/;
const setVersion = (l: string, v: string) => l.replace(/("Version"\s*:\s*")[^"]*(")/, (_m, a, b) => a + v + b);

/** Change the "Version" of the one GithubReleases entry whose "Id" is `id`. */
export function bumpGhReleaseText(text: string, id: string, version: string): string | null {
  const { lines, eol } = splitLines(text);
  const gh = sourceBlockRange(lines, GH_SOURCE_RE);
  if (!gh) return null;
  const idRe = new RegExp(`"Id"\\s*:\\s*"${escRe(id)}"`);
  const hits = lines.map((l, i) => (i >= gh[0] && i <= gh[1] && idRe.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) return null;
  const at = hits[0];
  if (/"Version"\s*:/.test(lines[at])) { lines[at] = setVersion(lines[at], version); return lines.join(eol); }
  const field = indentOf(lines[at]);
  for (const step of [1, -1]) {
    for (let i = at + step; i >= 0 && i < lines.length && !/^[ \t]*[{}[\]]/.test(lines[i]) && indentOf(lines[i]) === field; i += step) {
      if (/"Version"\s*:/.test(lines[i])) { lines[i] = setVersion(lines[i], version); return lines.join(eol); }
    }
  }
  return null;
}

/** Remove the one AzureBlob entry owned by `id` (by "Id" or by a "BlobName": "<id>_<digit>…"). */
export function removeBlobEntryText(text: string, id: string): string | null {
  const { lines, eol } = splitLines(text);
  const blob = sourceBlockRange(lines, BLOB_SOURCE_RE);
  if (!blob) return null;
  const own = new RegExp(`"BlobName"\\s*:\\s*"${escRe(id)}_\\d|"Id"\\s*:\\s*"${escRe(id)}"`, 'i');
  const hits = lines.map((l, i) => (i > blob[0] && i < blob[1] && own.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 0) return null;
  let open = -1, close = -1;
  if (/^[ \t]*\{.*\}[ \t]*,?[ \t]*$/.test(lines[hits[0]])) {          // single-line entry
    if (hits.length !== 1) return null;
    open = close = hits[0];
  } else {
    for (let i = hits[0]; i > blob[0]; i--) if (/^[ \t]*\{[ \t]*$/.test(lines[i])) { open = i; break; }
    for (let i = hits[0]; i < blob[1]; i++) if (/^[ \t]*\},?[ \t]*$/.test(lines[i])) { close = i; break; }
    if (open < 0 || close < 0 || hits.some((h) => h < open || h > close)) return null; // two entries own it → don't guess
  }
  const hadComma = /,[ \t]*$/.test(lines[close]);
  lines.splice(open, close - open + 1);
  if (!hadComma) {                                                       // it was the last element
    for (let i = open - 1; i >= 0; i--) {
      if (!/\S/.test(lines[i])) continue;
      if (/\},[ \t]*$/.test(lines[i])) lines[i] = lines[i].replace(/,([ \t]*)$/, '$1');
      break;
    }
  }
  return lines.join(eol);
}

/** Insert `{ "Id", "Version" }` as the FIRST element of GithubReleases.Modules, indented like its siblings. */
export function insertGhReleaseText(text: string, id: string, version: string): string | null {
  const { lines, eol } = splitLines(text);
  const gh = sourceBlockRange(lines, GH_SOURCE_RE);
  if (!gh) return null;
  let modAt = -1;
  for (let i = gh[0] + 1; i < gh[1]; i++) if (/"Modules"\s*:\s*\[/.test(lines[i])) { modAt = i; break; }
  if (modAt < 0 || /\]/.test(lines[modAt].replace(/"(?:\\.|[^"\\])*"/g, '""'))) return null; // one-line array → unknown shape
  const unit = detectIndentUnit(lines);
  let first = modAt + 1;
  while (first < gh[1] && !/\S/.test(lines[first])) first++;
  const empty = /^[ \t]*\][ \t]*,?[ \t]*$/.test(lines[first]);
  const brace = empty ? indentOf(lines[modAt]) + unit : indentOf(lines[first]);
  const field = !empty && /^[ \t]*\{[ \t]*$/.test(lines[first]) ? indentOf(lines[first + 1]) : brace + unit;
  lines.splice(first, 0, `${brace}{`, `${field}"Id": "${id}",`, `${field}"Version": "${version}"`, `${brace}}${empty ? '' : ','}`);
  return lines.join(eol);
}

export function editUpgradeText(text: string, changes: ManifestChange[]): { text: string } | { error: string } {
  let t: string | null = text;
  const fail = (c: ManifestChange) => ({ error: `${c.id} (${c.mode} → ${c.to}): manifest shape not recognised — no minimal edit possible` });
  for (const c of changes) {
    if (c.mode === 'platform') t = bumpPlatformText(t!, c.to, c.to);
    else if (c.mode === 'release-bump') t = bumpGhReleaseText(t!, c.id, c.to);
    else if (c.mode === 'blob-bump') t = upsertBlobEntry(t!, c.id, `${c.id}_${c.to}.zip`);
    else continue;
    if (t == null) return fail(c);
  }
  // Promotions are inserted at the top in reverse Id order, so they end up ascending.
  for (const c of changes.filter((x) => x.mode === 'promote').sort((a, b) => (a.id < b.id ? 1 : -1))) {
    t = removeBlobEntryText(t!, c.id); if (t == null) return fail(c);
    t = insertGhReleaseText(t, c.id, c.to); if (t == null) return fail(c);
  }
  return { text: t! };
}

/** Problems with `newText`, compared BY VALUE (never `!==` on arrays — bc0701f5): the pin set equals
 *  the original plus exactly `changes`, no Id sits in two places, and no other top-level key or
 *  source header moved. [] means the edit is exactly what was approved. */
export function verifyUpgradeEdit(origText: string, newText: string, changes: ManifestChange[]): string[] {
  let a: any, b: any;
  try { a = JSON.parse(origText); b = JSON.parse(newText); } catch (e: any) { return [`result does not parse: ${e.message}`]; }
  const problems: string[] = [];
  const before = new Map(readPins(a).pins.map((p) => [p.id, p]));
  const afterRead = readPins(b), after = new Map(afterRead.pins.map((p) => [p.id, p]));
  if (afterRead.duplicates.length) problems.push(`Id in two places: ${afterRead.duplicates.join(', ')}`);
  const want = new Map<string, Pin>(before);
  for (const c of changes) {
    if (c.mode === 'platform') continue;
    want.set(c.id, { id: c.id, version: c.to, source: c.mode === 'blob-bump' ? 'AzureBlob' : 'GithubReleases' });
  }
  for (const id of new Set([...want.keys(), ...after.keys()])) {
    const w = want.get(id), g = after.get(id);
    if (!g) problems.push(`${id}: missing after the edit`);
    else if (!w) problems.push(`${id}: added by the edit`);
    else if (g.version !== w.version || g.source !== w.source) problems.push(`${id}: expected ${w.version} (${w.source}), got ${g.version} (${g.source})`);
  }
  const strip = (j: any) => ({ ...j, Sources: (j.Sources ?? []).map((s: any) => ({ ...s, Modules: undefined })) });
  const platform = changes.find((c) => c.mode === 'platform')?.to;
  const expectTop = strip({ ...a, ...(platform ? { PlatformVersion: platform, ...('PlatformImageTag' in a ? { PlatformImageTag: platform } : {}) } : {}) });
  if (JSON.stringify(expectTop) !== JSON.stringify(strip(b))) problems.push('a top-level key or a source header changed');
  return problems;
}
```

- [ ] **Step 5: Run the tests until green.**

```bash
npx tsx --test scripts/unit/_tmp-upgrade-edit.test.ts 2>&1 | tail -3        # "# fail 0"
npx tsx --test scripts/unit/deploy-pr-artifact.test.ts 2>&1 | tail -3       # "# pass 77"
npx tsc --noEmit -p ci/tsconfig.json
```

If `promote … CRLF + tabs kept` fails on the indent assertion, the cause is `insertGhReleaseText` reading `field` from the wrong line. Print `out` and compare the two lines; do not loosen the assertion.

- [ ] **Step 6: Delete the temporary test and commit.**

```bash
rm scripts/unit/_tmp-upgrade-edit.test.ts
git status --porcelain scripts/unit   # empty
git add scripts/deploy && git commit -m "feat(deploy): minimal-diff upgrade edits + value-based verification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Versions, feed and shared types

**Files:**
- Modify: `scripts/deploy/upgrade/versions.ts`
- Create: `scripts/deploy/upgrade/feed.ts`, `scripts/deploy/upgrade/types.ts`
- Test (temporary): `scripts/unit/_tmp-versions.test.ts`

**Interfaces:**
- Produces:

```ts
// versions.ts
export function cmpVersion(a: string, b: string): number;          // -1 | 0 | 1, numeric per component
export const baseOf: (v: string) => string;                       // leading dotted digits
export type PinKind = 'release' | 'pr' | 'alpha' | 'branch-alpha' | 'unknown';
export interface ParsedVersion { raw: string; base: string; kind: PinKind; pr?: number; alpha?: number; branch?: string }
export function parseVersion(raw: string): ParsedVersion;
export function trackerKey(...texts: (string | undefined | null)[]): string | undefined;
// feed.ts
export interface FeedDep { Id: string; Version: string; Optional?: boolean }
export interface FeedVersion { Version: string; VersionTag?: string; PlatformVersion?: string; PackageUrl?: string; Dependencies?: FeedDep[] | null }
export interface FeedEntry { Id: string; ProjectUrl?: string; Versions: FeedVersion[] }
export const DEFAULT_FEED_URL: string;
export function isRelease(v: FeedVersion): boolean;
export function latestRelease(e: FeedEntry): FeedVersion | null;
// types.ts — see Step 3
```

- [ ] **Step 1: Write the failing temporary test** `scripts/unit/_tmp-versions.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseOf, cmpVersion, parseVersion, splitBlobName, trackerKey } from '../deploy/upgrade/versions.ts';
import { isRelease, latestRelease } from '../deploy/upgrade/feed.ts';

test('cmpVersion is numeric per component', () => {
  assert.equal(cmpVersion('3.1009.0', '3.999.0'), 1);
  assert.equal(cmpVersion('3.999.0', '3.1009.0'), -1);
  assert.equal(cmpVersion('3.10.0', '3.10.0'), 0);
  assert.equal(cmpVersion('3.10', '3.10.0'), 0);
});

test('parseVersion kinds', () => {
  assert.deepEqual(parseVersion('3.900.0'), { raw: '3.900.0', base: '3.900.0', kind: 'release' });
  assert.equal(parseVersion('3.900.0-pr-12-abc1234').pr, 12);
  assert.equal(parseVersion('3.1053.0-pr-3092-2588-vcst-5532-2588d613').pr, 3092);
  assert.equal(parseVersion('3.900.0-alpha.77').alpha, 77);
  assert.deepEqual([parseVersion('3.900.0-alpha.77-vcst-1234-x').kind, parseVersion('3.900.0-alpha.77-vcst-1234-x').branch], ['branch-alpha', 'vcst-1234-x']);
  assert.equal(parseVersion('3.900.0-rc1').kind, 'unknown');
  assert.equal(parseVersion('garbage').kind, 'unknown');
  assert.equal(baseOf('3.900.0-pr-12-abc'), '3.900.0');
});

test('splitBlobName splits at the FIRST _ followed by a digit', () => {
  assert.deepEqual(splitBlobName('VirtoCommerce.Foo_3.1.0-pr-12-ab12cd.zip'), { id: 'VirtoCommerce.Foo', version: '3.1.0-pr-12-ab12cd' });
  assert.deepEqual(splitBlobName('VirtoCommerce.Foo_Bar_3.1.0.zip'), { id: 'VirtoCommerce.Foo_Bar', version: '3.1.0' });
  assert.equal(splitBlobName('no-version.zip'), null);
});

test('trackerKey from PR title or branch, upper-cased', () => {
  assert.equal(trackerKey('VCST-1234: fix cart'), 'VCST-1234');
  assert.equal(trackerKey(undefined, 'vcst-5532-loyalty'), 'VCST-5532');
  assert.equal(trackerKey('bump deps'), undefined);
});

test('a version with VersionTag or a vc3prerelease URL is NOT a release', () => {
  const rel = { Version: '3.10.0', VersionTag: '', PackageUrl: 'https://github.com/VirtoCommerce/vc-module-x/releases/download/3.10.0/X_3.10.0.zip' };
  const alpha = { Version: '3.11.0', VersionTag: 'alpha.5', PackageUrl: 'https://vc3prerelease.blob.core.windows.net/packages/X_3.11.0-alpha.5.zip' };
  const disguised = { Version: '3.12.0', VersionTag: '', PackageUrl: 'https://vc3prerelease.blob.core.windows.net/packages/X_3.12.0.zip' };
  assert.deepEqual([isRelease(rel), isRelease(alpha), isRelease(disguised)], [true, false, false]);
  assert.equal(latestRelease({ Id: 'X', Versions: [alpha, rel, disguised] })?.Version, '3.10.0');
  assert.equal(latestRelease({ Id: 'X', Versions: [alpha] }), null);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx tsx --test scripts/unit/_tmp-versions.test.ts`. Expected: FAIL, `cmpVersion` is not exported.

- [ ] **Step 3: Implement.** Append to `upgrade/versions.ts`:

```ts
/** Numeric per-component compare of dotted versions (3.1009.0 > 3.999.0). Pass BASES — suffixes are not ordered here. */
export function cmpVersion(a: string, b: string): number {
  const pa = baseOf(a).split('.').map(Number), pb = baseOf(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
export const baseOf = (v: string): string => /^\d+(?:\.\d+)*/.exec(v.trim().replace(/^v/, ''))?.[0] ?? v;

export type PinKind = 'release' | 'pr' | 'alpha' | 'branch-alpha' | 'unknown';
export interface ParsedVersion { raw: string; base: string; kind: PinKind; pr?: number; alpha?: number; branch?: string }
/** Pin kinds (draft §4): X.Y.Z · X.Y.Z-pr-<N>-… · X.Y.Z-alpha.<N> · X.Y.Z-alpha.<N>-<branch> · anything else. */
export function parseVersion(raw: string): ParsedVersion {
  const v = raw.trim();
  const m = /^(\d+\.\d+\.\d+)(?:-(.+))?$/.exec(v);
  if (!m) return { raw: v, base: v, kind: 'unknown' };
  const [, base, suffix] = m;
  if (!suffix) return { raw: v, base, kind: 'release' };
  let s: RegExpExecArray | null;
  if ((s = /^pr-(\d+)(?:-.+)?$/i.exec(suffix))) return { raw: v, base, kind: 'pr', pr: +s[1] };
  if ((s = /^alpha\.(\d+)$/i.exec(suffix))) return { raw: v, base, kind: 'alpha', alpha: +s[1] };
  if ((s = /^alpha\.(\d+)-(.+)$/i.exec(suffix))) return { raw: v, base, kind: 'branch-alpha', alpha: +s[1], branch: s[2] };
  return { raw: v, base, kind: 'unknown' };
}
/** First tracker key (PROJ-123) in any of the texts — PR title, then branch name. */
export function trackerKey(...texts: (string | undefined | null)[]): string | undefined {
  for (const t of texts) { const m = /\b([A-Za-z][A-Za-z0-9]{1,9}-\d{2,})\b/.exec(t ?? ''); if (m) return m[1].toUpperCase(); }
  return undefined;
}
```

`upgrade/feed.ts`:

```ts
// scripts/deploy/upgrade/feed.ts — VirtoCommerce/vc-modules modules_v3.json: the module release feed.
import { cmpVersion } from './versions.ts';

export interface FeedDep { Id: string; Version: string; Optional?: boolean }
export interface FeedVersion { Version: string; VersionTag?: string; PlatformVersion?: string; PackageUrl?: string; Dependencies?: FeedDep[] | null }
export interface FeedEntry { Id: string; ProjectUrl?: string; Versions: FeedVersion[] }
/** The feed's location (not a value it holds); override with VC_MODULES_FEED_URL. */
export const DEFAULT_FEED_URL = 'https://raw.githubusercontent.com/VirtoCommerce/vc-modules/master/modules_v3.json';
/** A release: empty VersionTag AND a GitHub release-download PackageUrl. `Version` alone carries no suffix even for alphas. */
export const isRelease = (v: FeedVersion): boolean =>
  !v.VersionTag && /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//.test(v.PackageUrl ?? '');
export function latestRelease(e: FeedEntry): FeedVersion | null {
  return e.Versions.filter(isRelease).sort((a, b) => cmpVersion(b.Version, a.Version))[0] ?? null;
}
```

`upgrade/types.ts`:

```ts
// scripts/deploy/upgrade/types.ts — the plan contract between the three phases and the skill.
import type { ManifestEditMode } from '../lib/manifest.ts';

export type Status =
  | 'EQUAL' | 'BEHIND' | 'AHEAD' | 'PRERELEASE→RELEASE' | 'PRERELEASE?'
  | 'NOT_IN_FEED' | 'NO_RELEASE' | 'DUPLICATE'
  | 'DEP_CONFLICT' | 'PLATFORM_FLOOR' | 'COUPLED' | 'BLOCKED_ASSET';
export type Kind = 'module' | 'platform' | 'theme';
export interface Change {
  component: string; kind: Kind; from: string; to: string;
  mode: ManifestEditMode | 'theme';
  status: 'BEHIND' | 'PRERELEASE→RELEASE';
  platformFloor?: string;
  deps: { Id: string; Version: string }[];   // non-optional dependencies of the TARGET version
  assetUrl: string; assetOk: boolean; assetNote?: string;
}
export interface Row {
  component: string; kind: Kind; current: string; source?: 'AzureBlob' | 'GithubReleases';
  latest: string | null; status: Status; note: string;
  trackerKey?: string; prUrl?: string; downgrade?: boolean;
  change?: Change;    // proposed without asking (BEHIND, PRERELEASE→RELEASE)
  replace?: Change;   // offered by a PRERELEASE? question
}
export interface QuestionGroup { key: string; components: string[]; recommended: 'keep' | 'replace'; lines: string[] }
export type Decision = 'keep' | 'replace';
/** group key → one decision for the group, or per component. A group not listed is KEEP. */
export type Decisions = Record<string, Decision | Record<string, Decision>>;
export interface UpgradePlan {
  schema: 1; env: string; deployOwner: string; deployRepo: string; branch: string;
  packagesPath: string; themePath: string; fetchedAt: string; feedUrl: string; platformLatest: string;
  snapshot: { packages: string; theme: string | null };
  rows: Row[]; questions: QuestionGroup[];
  openUpgradePrs: { number: number; url: string; head: string }[];
  live: Record<string, string> | null; notes: string[];
}
```

- [ ] **Step 4: Run the tests until green.**

```bash
npx tsx --test scripts/unit/_tmp-versions.test.ts 2>&1 | tail -3   # "# fail 0"
npx tsc --noEmit -p ci/tsconfig.json
```

- [ ] **Step 5: Delete the temporary test and commit.**

```bash
rm scripts/unit/_tmp-versions.test.ts && git status --porcelain scripts/unit   # empty
git add scripts/deploy/upgrade && git commit -m "feat(deploy): upgrade versions, feed reader and plan types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Classify modules and the platform (incl. "does a release contain this PR?")

**Files:**
- Modify: `scripts/deploy/lib/github.ts` (add `Http` + `makeHttp`)
- Create: `scripts/deploy/upgrade/classify.ts`
- Test (temporary): `scripts/unit/_tmp-classify.test.ts`

**Interfaces:**
- Consumes: `Pin` (Task 3), `parseVersion`, `cmpVersion`, `baseOf`, `trackerKey`, `FeedEntry`, `latestRelease`, `Row`, `Change` (Task 4)
- Produces:

```ts
// lib/github.ts
export interface Http {
  gh(path: string): Promise<any | null>;              // GitHub REST with the token; null on 404
  ghAll(path: string, maxPages?: number): Promise<any[]>; // array endpoints, per_page=100, follows Link
  getText(url: string): Promise<string | null>;       // anonymous
  getJson(url: string): Promise<any | null>;          // anonymous
  head(url: string, headers?: Record<string, string>): Promise<{ status: number; lastModified?: string }>; // anonymous, follows redirects
}
export function makeHttp(): Http;
// upgrade/classify.ts
export interface PrRelease { state: 'open' | 'closed' | 'merged' | 'missing'; title: string; url: string; mergeSha?: string; releasedIn?: string }
export async function prRelease(http: Http, repo: string, pr: number, pinBase: string): Promise<PrRelease>;
export interface ClassifyCtx { http: Http; feed: Map<string, FeedEntry>; repoOf(id: string): string | null; blobBase: string; isPrivate(repo: string): Promise<boolean> }
export async function classifyModule(pin: Pin, duplicate: boolean, ctx: ClassifyCtx): Promise<Row>;
export async function classifyPlatform(json: any, latest: string, platformRepo: string, http: Http): Promise<Row>;
```

`repo` is always `owner/name`. `repoOf()` resolves `config/module-repo-map.json` `modules[id]` (a bare name, prefixed with `VirtoCommerce/`) and falls back to the feed's `ProjectUrl`.

- [ ] **Step 1: Write the failing temporary test** `scripts/unit/_tmp-classify.test.ts`. It uses a fake `Http` keyed by path.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyModule, prRelease } from '../deploy/upgrade/classify.ts';
import type { Http } from '../deploy/lib/github.ts';

const fakeHttp = (routes: Record<string, any>): Http => ({
  gh: async (p) => routes[p] ?? null,
  ghAll: async (p) => routes[p] ?? [],
  getText: async () => null, getJson: async () => null, head: async () => ({ status: 200 }),
});
const rel = (v: string) => ({ Version: v, VersionTag: '', PlatformVersion: '3.1000.0', PackageUrl: `https://github.com/VirtoCommerce/vc-module-cart/releases/download/${v}/VirtoCommerce.Cart_${v}.zip`, Dependencies: [{ Id: 'VirtoCommerce.Core', Version: '3.800.0', Optional: false }, { Id: 'X', Version: '9.0.0', Optional: true }] });
const feed = new Map([['VirtoCommerce.Cart', { Id: 'VirtoCommerce.Cart', ProjectUrl: 'https://github.com/VirtoCommerce/vc-module-cart', Versions: [rel('3.905.0')] }]]);
const ctx = (http: Http, priv = false) => ({ http, feed, repoOf: () => 'VirtoCommerce/vc-module-cart', blobBase: 'https://blob/packages', isPrivate: async () => priv });
const releases = ['3.899.0', '3.901.0', '3.905.0'].map((t) => ({ tag_name: t, draft: false, prerelease: false }));

test('release pin: EQUAL / BEHIND / AHEAD', async () => {
  const c = ctx(fakeHttp({}));
  assert.equal((await classifyModule({ id: 'VirtoCommerce.Cart', version: '3.905.0', source: 'GithubReleases' }, false, c)).status, 'EQUAL');
  const behind = await classifyModule({ id: 'VirtoCommerce.Cart', version: '3.900.0', source: 'GithubReleases' }, false, c);
  assert.deepEqual([behind.status, behind.change?.mode, behind.change?.to], ['BEHIND', 'release-bump', '3.905.0']);
  assert.deepEqual(behind.change?.deps, [{ Id: 'VirtoCommerce.Core', Version: '3.800.0' }]); // optional deps dropped
  assert.equal((await classifyModule({ id: 'VirtoCommerce.Cart', version: '3.999.0', source: 'GithubReleases' }, false, c)).status, 'AHEAD');
});

test('merged PR contained in the first release ≥ pin → PRERELEASE→RELEASE, promoted', async () => {
  const http = fakeHttp({
    '/repos/VirtoCommerce/vc-module-cart/pulls/12': { merged_at: '2026-01-01', state: 'closed', title: 'VCST-10: x', html_url: 'u', merge_commit_sha: 'm' },
    '/repos/VirtoCommerce/vc-module-cart/releases': releases,
    '/repos/VirtoCommerce/vc-module-cart/compare/3.901.0...m': { status: 'behind' },
  });
  const r = await classifyModule({ id: 'VirtoCommerce.Cart', version: '3.900.0-pr-12-abc1234', source: 'AzureBlob' }, false, ctx(http));
  assert.deepEqual([r.status, r.change?.mode, r.change?.to, r.trackerKey], ['PRERELEASE→RELEASE', 'promote', '3.905.0', 'VCST-10']);
});

test('private repo: release target stays in AzureBlob (blob-bump on the blob URL)', async () => {
  const http = fakeHttp({ '/repos/VirtoCommerce/vc-module-cart/pulls/12': { merged_at: 'x', title: '', html_url: 'u', merge_commit_sha: 'm' }, '/repos/VirtoCommerce/vc-module-cart/releases': releases, '/repos/VirtoCommerce/vc-module-cart/compare/3.901.0...m': { status: 'identical' } });
  const r = await classifyModule({ id: 'VirtoCommerce.Cart', version: '3.900.0-pr-12-abc', source: 'AzureBlob' }, false, ctx(http, true));
  assert.deepEqual([r.change?.mode, r.change?.assetUrl], ['blob-bump', 'https://blob/packages/VirtoCommerce.Cart_3.905.0.zip']);
});

test('hotfix cherry-pick without -x is found by "(#N)" in the latest release commits', async () => {
  const http = fakeHttp({
    '/repos/VirtoCommerce/vc-module-cart/pulls/12': { merged_at: 'x', title: '', html_url: 'u', merge_commit_sha: 'm' },
    '/repos/VirtoCommerce/vc-module-cart/releases': releases,
    '/repos/VirtoCommerce/vc-module-cart/compare/3.901.0...3.905.0': { commits: [{ commit: { message: 'fix: thing (#12)\n\nbody' } }] },
  });
  assert.equal((await prRelease(http, 'VirtoCommerce/vc-module-cart', 12, '3.900.0')).releasedIn, '3.905.0');
});

test('open PR → PRERELEASE? with a replace offer; downgrade flagged when the release is lower', async () => {
  const http = fakeHttp({ '/repos/VirtoCommerce/vc-module-cart/pulls/12': { merged_at: null, state: 'open', title: 'VCST-90 y', html_url: 'u' } });
  const r = await classifyModule({ id: 'VirtoCommerce.Cart', version: '3.910.0-pr-12-abc', source: 'AzureBlob' }, false, ctx(http));
  assert.deepEqual([r.status, r.replace?.to, r.downgrade, r.trackerKey], ['PRERELEASE?', '3.905.0', true, 'VCST-90']);
});

test('alpha: release ≥ base → PRERELEASE→RELEASE "by version"; DUPLICATE and NOT_IN_FEED never change', async () => {
  const c = ctx(fakeHttp({}));
  const a = await classifyModule({ id: 'VirtoCommerce.Cart', version: '3.905.0-alpha.3', source: 'AzureBlob' }, false, c);
  assert.equal(a.status, 'PRERELEASE→RELEASE'); assert.match(a.note, /by version/);
  assert.equal((await classifyModule({ id: 'VirtoCommerce.Cart', version: '3.905.0', source: 'AzureBlob' }, true, c)).status, 'DUPLICATE');
  assert.equal((await classifyModule({ id: 'Client.Custom', version: '1.0.0', source: 'GithubReleases' }, false, c)).status, 'NOT_IN_FEED');
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx tsx --test scripts/unit/_tmp-classify.test.ts`. Expected: FAIL, the module is not found.

- [ ] **Step 3: Add `Http` / `makeHttp` to `lib/github.ts`.**

```ts
export interface Http {
  gh(path: string): Promise<any | null>;
  ghAll(path: string, maxPages?: number): Promise<any[]>;
  getText(url: string): Promise<string | null>;
  getJson(url: string): Promise<any | null>;
  head(url: string, headers?: Record<string, string>): Promise<{ status: number; lastModified?: string }>;
}
const apiUrl = (p: string) => (p.startsWith('http') ? p : `https://api.github.com${p}`);
export function makeHttp(): Http {
  return {
    gh: (p) => ghJson(apiUrl(p)),
    async ghAll(p, maxPages = 10) {
      const out: any[] = [];
      let url: string | null = `${apiUrl(p)}${p.includes('?') ? '&' : '?'}per_page=100`;
      for (let i = 0; url && i < maxPages; i++) {
        const res: Response = await fetch(url, { headers: ghHeaders() });
        if (res.status === 404) return out;
        if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limited (HTTP ${res.status}).`);
        if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
        out.push(...(await res.json()));
        url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
      }
      return out;
    },
    async getText(u) { const r = await fetch(u); return r.ok ? r.text() : null; },
    async getJson(u) { const r = await fetch(u); return r.ok ? r.json() : null; },
    async head(u, headers = {}) {
      const r = await fetch(u, { method: 'HEAD', redirect: 'follow', headers });
      return { status: r.status, lastModified: r.headers.get('last-modified') ?? undefined };
    },
  };
}
```

- [ ] **Step 4: Write `upgrade/classify.ts`.**

```ts
// scripts/deploy/upgrade/classify.ts — one Row per pinned module and for the platform (draft §4–§5).
import type { Http } from '../lib/github.ts';
import type { Pin } from './pins.ts';
import type { FeedEntry, FeedVersion } from './feed.ts';
import { latestRelease } from './feed.ts';
import type { Change, Row } from './types.ts';
import { baseOf, cmpVersion, parseVersion, trackerKey } from './versions.ts';

export interface PrRelease { state: 'open' | 'closed' | 'merged' | 'missing'; title: string; url: string; mergeSha?: string; releasedIn?: string }

const releaseTags = async (http: Http, repo: string): Promise<string[]> =>
  (await http.ghAll(`/repos/${repo}/releases`))
    .filter((r: any) => !r.draft && !r.prerelease && /^v?\d+\.\d+\.\d+$/.test(r.tag_name))
    .map((r: any) => r.tag_name as string)
    .sort((a, b) => cmpVersion(a, b));

/** Which release (if any) contains PR #pr. First the tags ≥ the pin's base, ascending, by ancestry;
 *  then "(#N)" in the latest release's own commits (hotfix cherry-picks are made without -x). */
export async function prRelease(http: Http, repo: string, pr: number, pinBase: string): Promise<PrRelease> {
  const p = await http.gh(`/repos/${repo}/pulls/${pr}`);
  if (!p) return { state: 'missing', title: '', url: `https://github.com/${repo}/pull/${pr}` };
  const base = { title: String(p.title ?? ''), url: String(p.html_url ?? '') };
  if (!p.merged_at) return { ...base, state: p.state === 'open' ? 'open' : 'closed' };
  const tags = await releaseTags(http, repo);
  for (const tag of tags.filter((t) => cmpVersion(t, pinBase) >= 0)) {
    const c = await http.gh(`/repos/${repo}/compare/${tag}...${p.merge_commit_sha}`);
    if (c && (c.status === 'behind' || c.status === 'identical')) return { ...base, state: 'merged', mergeSha: p.merge_commit_sha, releasedIn: tag };
  }
  if (tags.length >= 2) {
    const c = await http.gh(`/repos/${repo}/compare/${tags[tags.length - 2]}...${tags[tags.length - 1]}`);
    const re = new RegExp(`\\(#${pr}\\)`);
    if ((c?.commits ?? []).some((x: any) => re.test(String(x?.commit?.message ?? '').split('\n')[0]))) return { ...base, state: 'merged', mergeSha: p.merge_commit_sha, releasedIn: tags[tags.length - 1] };
  }
  return { ...base, state: 'merged', mergeSha: p.merge_commit_sha };
}

export interface ClassifyCtx { http: Http; feed: Map<string, FeedEntry>; repoOf(id: string): string | null; blobBase: string; isPrivate(repo: string): Promise<boolean> }

async function moduleChange(pin: Pin, target: FeedVersion, status: Change['status'], ctx: ClassifyCtx): Promise<Change> {
  const repo = ctx.repoOf(pin.id);
  // A release pinned in AzureBlob stays there (private repo: the deploy downloads anonymously, so a
  // GithubReleases pin of it 404s). A prerelease in AzureBlob is promoted unless its repo is private.
  const stayInBlob = pin.source === 'AzureBlob' && (parseVersion(pin.version).kind === 'release' || !repo || (await ctx.isPrivate(repo)));
  const mode = pin.source === 'GithubReleases' ? 'release-bump' : stayInBlob ? 'blob-bump' : 'promote';
  return {
    component: pin.id, kind: 'module', from: pin.version, to: target.Version, mode, status,
    platformFloor: target.PlatformVersion,
    deps: (target.Dependencies ?? []).filter((d) => !d.Optional).map((d) => ({ Id: d.Id, Version: d.Version })),
    assetUrl: mode === 'blob-bump' ? `${ctx.blobBase}/${pin.id}_${target.Version}.zip` : String(target.PackageUrl),
    assetOk: false, // decided by the plan's download check (plan.ts), never assumed
  };
}

export async function classifyModule(pin: Pin, duplicate: boolean, ctx: ClassifyCtx): Promise<Row> {
  const row: Row = { component: pin.id, kind: 'module', current: pin.version, source: pin.source, latest: null, status: 'EQUAL', note: '' };
  if (duplicate) return { ...row, status: 'DUPLICATE', note: 'pinned in both sources — fix by hand' };
  const v = parseVersion(pin.version);
  const repo = ctx.repoOf(pin.id);
  const entry = ctx.feed.get(pin.id);
  const pr = v.kind === 'pr' && repo ? await prRelease(ctx.http, repo, v.pr!, v.base) : null;
  const key = trackerKey(pr?.title, v.branch);
  if (!entry) return { ...row, status: 'NOT_IN_FEED', note: 'custom, client or private module', trackerKey: key, prUrl: pr?.url };
  const latest = latestRelease(entry);
  if (!latest) return { ...row, status: 'NO_RELEASE', note: 'feed holds only alpha versions' };
  row.latest = latest.Version;
  if (v.kind === 'release') {
    const d = cmpVersion(v.base, latest.Version);
    if (d === 0) return { ...row, status: 'EQUAL' };
    if (d > 0) return { ...row, status: 'AHEAD', note: 'newer than the latest release — never downgraded' };
    return { ...row, status: 'BEHIND', change: await moduleChange(pin, latest, 'BEHIND', ctx) };
  }
  const downgrade = cmpVersion(latest.Version, v.base) < 0;
  const ask = async (note: string): Promise<Row> =>
    ({ ...row, status: 'PRERELEASE?', note, trackerKey: key, prUrl: pr?.url, downgrade, replace: await moduleChange(pin, latest, 'PRERELEASE→RELEASE', ctx) });
  if (v.kind === 'pr') {
    if (!pr || pr.state === 'missing') return ask(`PR #${v.pr} not found`);
    if (pr.state !== 'merged') return ask(pr.state === 'open' ? 'PR open' : 'PR closed unmerged');
    if (!pr.releasedIn) return ask('merged, not released yet');
    return { ...row, status: 'PRERELEASE→RELEASE', note: `PR #${v.pr} is in ${pr.releasedIn}`, trackerKey: key, prUrl: pr.url, change: await moduleChange(pin, latest, 'PRERELEASE→RELEASE', ctx) };
  }
  if (v.kind === 'alpha') {
    // X.Y.Z-alpha.N precedes release X.Y.Z: the last alpha of a version is built minutes before its release.
    if (!downgrade) return { ...row, status: 'PRERELEASE→RELEASE', note: `by version (release ${latest.Version} ≥ ${v.base})`, change: await moduleChange(pin, latest, 'PRERELEASE→RELEASE', ctx) };
    return ask(`alpha of ${v.base}, no release ≥ it yet`);
  }
  if (v.kind === 'branch-alpha') return ask(`feature branch \`${v.branch}\``);
  return ask('unrecognised suffix');
}

/** Platform: not in the feed. A PlatformImageTag that is not plain X.Y.Z, or differs from PlatformVersion, is a prerelease image. */
export async function classifyPlatform(json: any, latest: string, platformRepo: string, http: Http): Promise<Row> {
  const version = String(json.PlatformVersion ?? ''), tag = json.PlatformImageTag !== undefined ? String(json.PlatformImageTag) : version;
  const current = tag !== version ? `${version} (image ${tag})` : version;
  const row: Row = { component: 'Platform', kind: 'platform', current, latest, status: 'EQUAL', note: '' };
  const change = (status: Change['status']): Change => ({ component: 'Platform', kind: 'platform', from: tag, to: latest, mode: 'platform', status, deps: [], assetUrl: '', assetOk: false });
  const t = parseVersion(tag);
  if (t.kind === 'release' && tag === version) {
    const d = cmpVersion(version, latest);
    return d === 0 ? row : d > 0 ? { ...row, status: 'AHEAD', note: 'never downgraded' } : { ...row, status: 'BEHIND', change: change('BEHIND') };
  }
  const pr = t.kind === 'pr' ? await prRelease(http, platformRepo, t.pr!, t.base) : null;
  if (pr?.releasedIn) return { ...row, status: 'PRERELEASE→RELEASE', note: `PR #${t.pr} is in ${pr.releasedIn}`, prUrl: pr.url, trackerKey: trackerKey(pr.title), change: change('PRERELEASE→RELEASE') };
  return { ...row, status: 'PRERELEASE?', note: pr ? (pr.state === 'open' ? 'PR open' : pr.state === 'merged' ? 'merged, not released yet' : `PR ${pr.state}`) : 'prerelease image', prUrl: pr?.url, trackerKey: trackerKey(pr?.title, tag), downgrade: cmpVersion(latest, baseOf(tag)) < 0, replace: change('PRERELEASE→RELEASE') };
}
```

- [ ] **Step 5: Run the tests until green.**

```bash
npx tsx --test scripts/unit/_tmp-classify.test.ts 2>&1 | tail -3   # "# fail 0"
npx tsc --noEmit -p ci/tsconfig.json
```

- [ ] **Step 6: Delete the temporary test and commit.**

```bash
rm scripts/unit/_tmp-classify.test.ts && git status --porcelain scripts/unit
git add scripts/deploy && git commit -m "feat(deploy): classify module + platform pins against the latest releases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Theme — the newest GREEN dev alpha

**Files:**
- Create: `scripts/deploy/upgrade/theme.ts`
- Test (temporary): `scripts/unit/_tmp-theme.test.ts`

**Interfaces:**
- Consumes: `Http` (Task 5), `escRe` (Task 1), `cmpVersion` (Task 4), `Row`, `Change` (Task 4), `PrRelease`-style PR lookup through `http.gh`
- Produces:

```ts
export interface Alpha { name: string; n: number; lastModified: string }
export interface PublishRun { runId: number; headSha: string; conclusion: string | null; start: number; end: number }
export interface ThemeTarget { url: string; name: string; version: string; n: number; headSha: string }
export function parseBlobList(xml: string, pkgName: string, version: string): { alphas: Alpha[]; next: string | null };
export function matchRun(a: Alpha, runs: PublishRun[]): PublishRun | null;
export function themePinKind(url: string, pkgName: string): { kind: 'release' | 'alpha' | 'branch-alpha' | 'pr' | 'unknown'; version?: string; n?: number; pr?: number; branch?: string };
export async function resolveThemeTarget(http: Http, repo: string, blobBase: string, workflowFile: string): Promise<{ target: ThemeTarget | null; pkgName: string; version: string; notes: string[] }>;
export async function classifyTheme(http: Http, repo: string, currentUrl: string | null, t: { target: ThemeTarget | null; pkgName: string; version: string }): Promise<Row>;
```

- [ ] **Step 1: Write the failing temporary test** `scripts/unit/_tmp-theme.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTheme, matchRun, parseBlobList, themePinKind } from '../deploy/upgrade/theme.ts';
import type { Http } from '../deploy/lib/github.ts';

const N = 'vc-theme-b2b-vue';
const blob = (name: string, lm: string) => `<Blob><Name>${name}</Name><Properties><Last-Modified>${lm}</Last-Modified></Properties></Blob>`;

test('parseBlobList keeps plain alphas of this version, sorted by N numerically', () => {
  const xml = `<EnumerationResults><Blobs>${blob(`${N}-2.40.0-alpha.9.zip`, 'Fri, 02 Oct 2026 10:00:00 GMT')}${blob(`${N}-2.40.0-alpha.10.zip`, 'Fri, 02 Oct 2026 11:00:00 GMT')}${blob(`${N}-2.40.0-alpha.11-feature-x.zip`, 'Fri, 02 Oct 2026 12:00:00 GMT')}</Blobs><NextMarker>abc</NextMarker></EnumerationResults>`;
  const r = parseBlobList(xml, N, '2.40.0');
  assert.deepEqual(r.alphas.map((a) => a.n), [10, 9]);
  assert.equal(r.next, 'abc');
});

test('matchRun: Last-Modified inside the publish-step window', () => {
  const runs = [{ runId: 1, headSha: 'a', conclusion: 'success', start: Date.parse('2026-10-02T10:59:00Z'), end: Date.parse('2026-10-02T11:01:00Z') }];
  assert.equal(matchRun({ name: 'x', n: 10, lastModified: 'Fri, 02 Oct 2026 11:00:00 GMT' }, runs)?.runId, 1);
  assert.equal(matchRun({ name: 'x', n: 9, lastModified: 'Fri, 02 Oct 2026 10:00:00 GMT' }, runs), null);
});

test('themePinKind', () => {
  assert.deepEqual(themePinKind(`https://github.com/VirtoCommerce/vc-frontend/releases/download/2.39.0/${N}-2.39.0.zip`, N), { kind: 'release', version: '2.39.0' });
  assert.equal(themePinKind(`https://blob/packages/${N}-2.40.0-alpha.7.zip`, N).n, 7);
  assert.equal(themePinKind(`https://blob/packages/${N}-2.40.0-alpha.7-feature-x.zip`, N).kind, 'branch-alpha');
  assert.equal(themePinKind(`https://blob/packages/${N}-2.40.0-pr-1234-abcdef0.zip`, N).pr, 1234);
});

const http: Http = { gh: async () => null, ghAll: async () => [], getText: async () => null, getJson: async () => null, head: async () => ({ status: 200 }) };
const target = { url: `https://blob/packages/${N}-2.40.0-alpha.10.zip`, name: `${N}-2.40.0-alpha.10.zip`, version: '2.40.0', n: 10, headSha: 'h' };
const t = { target, pkgName: N, version: '2.40.0' };

test('theme statuses — incl. a RELEASE at or above the dev version is AHEAD, never a downgrade', async () => {
  const s = async (url: string) => (await classifyTheme(http, 'VirtoCommerce/vc-frontend', url, t)).status;
  assert.equal(await s(target.url), 'EQUAL');
  assert.equal(await s(`https://blob/packages/${N}-2.40.0-alpha.9.zip`), 'BEHIND');
  assert.equal(await s(`https://blob/packages/${N}-2.40.0-alpha.12.zip`), 'AHEAD');
  assert.equal(await s(`https://github.com/VirtoCommerce/vc-frontend/releases/download/2.39.0/${N}-2.39.0.zip`), 'BEHIND');
  assert.equal(await s(`https://github.com/VirtoCommerce/vc-frontend/releases/download/2.40.0/${N}-2.40.0.zip`), 'AHEAD');
  assert.equal(await s(`https://blob/packages/${N}-2.40.0-alpha.7-feature-x.zip`), 'PRERELEASE?');
  assert.equal((await classifyTheme(http, 'VirtoCommerce/vc-frontend', target.url, { ...t, target: null })).status, 'NO_RELEASE');
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx tsx --test scripts/unit/_tmp-theme.test.ts`. Expected: FAIL, the module is not found.

- [ ] **Step 3: Write `upgrade/theme.ts`.**

```ts
// scripts/deploy/upgrade/theme.ts — the storefront theme target: the newest dev alpha whose CI run is GREEN (draft §3).
// Theme alphas are not in the feed or in GitHub releases; they are blobs in vc3prerelease. The blob
// name carries no sha, so the ONLY link from an alpha to its CI run is time: the blob's Last-Modified
// falls inside one run's "Publish to Blob" step window. Runs are found per commit (`?head_sha=`):
// listing them with `branch=dev&event=push` returned nothing newer than two weeks back (measured 2026-10-02).
import type { Http } from '../lib/github.ts';
import { escRe } from '../lib/manifest.ts';
import type { Change, Row } from './types.ts';
import { cmpVersion, trackerKey } from './versions.ts';

export interface Alpha { name: string; n: number; lastModified: string }
export interface PublishRun { runId: number; headSha: string; conclusion: string | null; start: number; end: number }
export interface ThemeTarget { url: string; name: string; version: string; n: number; headSha: string }

export function parseBlobList(xml: string, pkgName: string, version: string): { alphas: Alpha[]; next: string | null } {
  const re = new RegExp(`^${escRe(pkgName)}-${escRe(version)}-alpha\\.(\\d+)\\.zip$`); // a longer suffix is a feature-branch build
  const alphas: Alpha[] = [];
  for (const b of xml.matchAll(/<Blob>([\s\S]*?)<\/Blob>/g)) {
    const name = /<Name>([^<]+)<\/Name>/.exec(b[1])?.[1], lm = /<Last-Modified>([^<]+)<\/Last-Modified>/.exec(b[1])?.[1];
    const m = name ? re.exec(name) : null;
    if (m && lm) alphas.push({ name: name!, n: +m[1], lastModified: lm });
  }
  return { alphas: alphas.sort((a, b) => b.n - a.n), next: /<NextMarker>([^<]+)<\/NextMarker>/.exec(xml)?.[1] ?? null };
}

export function matchRun(a: Alpha, runs: PublishRun[]): PublishRun | null {
  const t = Date.parse(a.lastModified);
  return runs.find((r) => t >= r.start && t <= r.end) ?? null;
}

export function themePinKind(url: string, pkgName: string): { kind: 'release' | 'alpha' | 'branch-alpha' | 'pr' | 'unknown'; version?: string; n?: number; pr?: number; branch?: string } {
  const file = decodeURIComponent(url.split('/').pop() ?? '');
  const p = escRe(pkgName);
  let m: RegExpExecArray | null;
  if (/\/releases\/download\//.test(url) && (m = /-(\d+\.\d+\.\d+)\.zip$/.exec(file))) return { kind: 'release', version: m[1] };
  if ((m = new RegExp(`^${p}-(\\d+\\.\\d+\\.\\d+)-pr-(\\d+)`).exec(file))) return { kind: 'pr', version: m[1], pr: +m[2] };
  if ((m = new RegExp(`^${p}-(\\d+\\.\\d+\\.\\d+)-alpha\\.(\\d+)\\.zip$`).exec(file))) return { kind: 'alpha', version: m[1], n: +m[2] };
  if ((m = new RegExp(`^${p}-(\\d+\\.\\d+\\.\\d+)-alpha\\.(\\d+)-(.+)\\.zip$`).exec(file))) return { kind: 'branch-alpha', version: m[1], n: +m[2], branch: m[3] };
  return { kind: 'unknown' };
}

export async function resolveThemeTarget(http: Http, repo: string, blobBase: string, workflowFile: string): Promise<{ target: ThemeTarget | null; pkgName: string; version: string; notes: string[] }> {
  const info = await http.gh(`/repos/${repo}`);
  const branch = String(info?.default_branch ?? 'dev');
  const file = await http.gh(`/repos/${repo}/contents/package.json?ref=${encodeURIComponent(branch)}`);
  if (!file?.content) throw new Error(`theme: cannot read ${repo}/package.json@${branch}`);
  const pkg = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  const pkgName = String(pkg.name), version = String(pkg.version);
  const alphas: Alpha[] = [];
  for (let marker: string | null = '', i = 0; marker !== null && i < 20; i++) {
    const xml = await http.getText(`${blobBase}?restype=container&comp=list&prefix=${encodeURIComponent(`${pkgName}-${version}-alpha.`)}${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`);
    if (xml == null) throw new Error(`theme: blob listing failed at ${blobBase}`);
    const page = parseBlobList(xml, pkgName, version);
    alphas.push(...page.alphas);
    marker = page.next;
  }
  alphas.sort((a, b) => b.n - a.n);
  const notes: string[] = [];
  const runs: PublishRun[] = [];
  const commits = await http.ghAll(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}`, 2);
  let ci = 0;
  for (const a of alphas) {
    let run = matchRun(a, runs);
    while (!run && ci < commits.length) {
      const sha = String(commits[ci++].sha);
      for (const r of (await http.gh(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=20`))?.workflow_runs ?? []) {
        if (!String(r.path ?? '').endsWith(workflowFile) || r.event !== 'push' || r.head_branch !== branch) continue;
        for (const j of (await http.gh(`/repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`))?.jobs ?? []) {
          for (const s of j.steps ?? []) {
            if (/publish.*blob/i.test(String(s.name)) && s.started_at && s.completed_at) {
              runs.push({ runId: r.id, headSha: r.head_sha, conclusion: r.conclusion, start: Date.parse(s.started_at), end: Date.parse(s.completed_at) });
            }
          }
        }
      }
      run = matchRun(a, runs);
    }
    if (!run) { notes.push(`${a.name}: no ${workflowFile} publish step found for it`); continue; }
    // A red run can still have published (it failed after the publish step): such an alpha exists but is never the target.
    if (run.conclusion === 'success') return { target: { url: `${blobBase}/${a.name}`, name: a.name, version, n: a.n, headSha: run.headSha }, pkgName, version, notes };
    notes.push(`${a.name}: run ${run.runId} concluded ${run.conclusion} — not a target`);
  }
  return { target: null, pkgName, version, notes };
}

export async function classifyTheme(http: Http, repo: string, currentUrl: string | null, t: { target: ThemeTarget | null; pkgName: string; version: string }): Promise<Row> {
  const file = (u: string) => decodeURIComponent(u.split('/').pop() ?? u);
  const row: Row = { component: 'Theme', kind: 'theme', current: currentUrl ? file(currentUrl) : 'absent', latest: t.target ? t.target.name : null, status: 'EQUAL', note: '' };
  if (!t.target) return { ...row, status: 'NO_RELEASE', note: `no green ${t.version} dev alpha` };
  if (!currentUrl) return { ...row, status: 'NOT_IN_FEED', note: 'theme file has no recognisable URL' };
  const target = t.target;
  const change = (status: Change['status']): Change => ({ component: 'Theme', kind: 'theme', from: currentUrl, to: target.url, mode: 'theme', status, deps: [], assetUrl: target.url, assetOk: false });
  const k = themePinKind(currentUrl, t.pkgName);
  const ask = (note: string, extra: Partial<Row> = {}): Row => ({ ...row, status: 'PRERELEASE?', note, replace: change('PRERELEASE→RELEASE'), ...extra });
  if (k.kind === 'release') return cmpVersion(k.version!, target.version) >= 0
    ? { ...row, status: 'AHEAD', note: `release ${k.version} ≥ dev ${target.version} — never downgraded to an alpha` }
    : { ...row, status: 'BEHIND', change: change('BEHIND') };
  if (k.kind === 'alpha') {
    const d = cmpVersion(k.version!, target.version) || Math.sign(k.n! - target.n);
    return d === 0 ? row : d > 0 ? { ...row, status: 'AHEAD', note: 'newer alpha than the target (its run was not green) — kept' } : { ...row, status: 'BEHIND', change: change('BEHIND') };
  }
  if (k.kind === 'pr') {
    const p = await http.gh(`/repos/${repo}/pulls/${k.pr}`);
    const key = trackerKey(p?.title);
    if (p?.merged_at) {
      const c = await http.gh(`/repos/${repo}/compare/${p.merge_commit_sha}...${target.headSha}`);
      if (c && (c.status === 'ahead' || c.status === 'identical')) return { ...row, status: 'PRERELEASE→RELEASE', note: `PR #${k.pr} is in ${target.name}`, prUrl: p.html_url, trackerKey: key, change: change('PRERELEASE→RELEASE') };
    }
    return ask(p ? (p.merged_at ? 'merged, not in the target alpha' : `PR ${p.state}`) : `PR #${k.pr} not found`, { prUrl: p?.html_url, trackerKey: key });
  }
  if (k.kind === 'branch-alpha') return ask(`feature branch \`${k.branch}\``, { trackerKey: trackerKey(k.branch) });
  return ask('unrecognised theme URL');
}
```

- [ ] **Step 4: Run the tests until green.**

```bash
npx tsx --test scripts/unit/_tmp-theme.test.ts 2>&1 | tail -3   # "# fail 0"
npx tsc --noEmit -p ci/tsconfig.json
```

- [ ] **Step 5: Delete the temporary test and commit.**

```bash
rm scripts/unit/_tmp-theme.test.ts && git status --porcelain scripts/unit
git add scripts/deploy && git commit -m "feat(deploy): theme target = newest green dev alpha, matched to its CI run by publish window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-state checks to a fixed point

**Files:**
- Create: `scripts/deploy/upgrade/checks.ts`
- Test (temporary): `scripts/unit/_tmp-checks.test.ts`

**Interfaces:**
- Consumes: `Change` (Task 4), `cmpVersion`, `baseOf` (Task 4)
- Produces:

```ts
export const COUPLED: string[][];
export interface Dropped { change: Change; status: 'DEP_CONFLICT' | 'PLATFORM_FLOOR' | 'COUPLED' | 'BLOCKED_ASSET'; reason: string }
export interface Resolution { accepted: Change[]; dropped: Dropped[]; passes: number }
export function resolveEndState(current: Map<string, string>, changes: Change[], atLatest: Set<string>, coupled?: string[][]): Resolution;
```

`current` maps each component (module Id, or `'Platform'`) to its version on the env. `atLatest` holds the components that are already `EQUAL`.

- [ ] **Step 1: Write the failing temporary test** `scripts/unit/_tmp-checks.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEndState } from '../deploy/upgrade/checks.ts';
import type { Change } from '../deploy/upgrade/types.ts';

const ch = (component: string, to: string, over: Partial<Change> = {}): Change =>
  ({ component, kind: component === 'Platform' ? 'platform' : 'module', from: '0', to, mode: 'release-bump', status: 'BEHIND', deps: [], assetUrl: 'u', assetOk: true, ...over });

test('a blocked dependency cascades: B blocked → A (needs B) drops → C (needs A) drops, 3 passes', () => {
  const current = new Map([['Platform', '3.1000.0'], ['A', '1.0.0'], ['B', '1.0.0'], ['C', '1.0.0']]);
  const r = resolveEndState(current, [
    ch('B', '2.0.0', { assetOk: false }),
    ch('A', '2.0.0', { deps: [{ Id: 'B', Version: '2.0.0' }] }),
    ch('C', '2.0.0', { deps: [{ Id: 'A', Version: '2.0.0' }] }),
  ], new Set());
  assert.deepEqual(r.accepted, []);
  assert.deepEqual(r.dropped.map((d) => [d.change.component, d.status]), [['B', 'BLOCKED_ASSET'], ['A', 'DEP_CONFLICT'], ['C', 'DEP_CONFLICT']]);
  assert.match(r.dropped[1].reason, /needs B ≥ 2\.0\.0; end state has 1\.0\.0/);
  assert.equal(r.passes, 3);
});

test('platform floor: a module needing a newer platform drops when the platform cannot move', () => {
  const current = new Map([['Platform', '3.1000.0'], ['A', '1.0.0']]);
  const ok = resolveEndState(current, [ch('Platform', '3.1076.0'), ch('A', '2.0.0', { platformFloor: '3.1076.0' })], new Set());
  assert.equal(ok.accepted.length, 2);
  const blocked = resolveEndState(current, [ch('Platform', '3.1076.0', { assetOk: false }), ch('A', '2.0.0', { platformFloor: '3.1076.0' })], new Set());
  assert.deepEqual(blocked.dropped.map((d) => d.status), ['BLOCKED_ASSET', 'PLATFORM_FLOOR']);
});

test('coupled pair moves together; a partner already at its latest release does not block', () => {
  const pair = [['X', 'Y']];
  const current = new Map([['Platform', '1.0.0'], ['X', '1.0.0'], ['Y', '1.0.0']]);
  assert.deepEqual(resolveEndState(current, [ch('X', '2.0.0')], new Set(), pair).dropped.map((d) => d.status), ['COUPLED']);
  assert.equal(resolveEndState(current, [ch('X', '2.0.0')], new Set(['Y']), pair).accepted.length, 1);
  assert.equal(resolveEndState(current, [ch('X', '2.0.0'), ch('Y', '2.0.0')], new Set(), pair).accepted.length, 2);
});

test('a dependency on a PR-build pin is compared by its base', () => {
  const current = new Map([['Platform', '1.0.0'], ['A', '1.0.0'], ['B', '2.0.0-pr-5-abc']]);
  assert.equal(resolveEndState(current, [ch('A', '2.0.0', { deps: [{ Id: 'B', Version: '2.0.0' }] })], new Set()).accepted.length, 1);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx tsx --test scripts/unit/_tmp-checks.test.ts`. Expected: FAIL, the module is not found.

- [ ] **Step 3: Write `upgrade/checks.ts`.**

```ts
// scripts/deploy/upgrade/checks.ts — judge the PROPOSED END STATE, to a fixed point (draft §6.2).
// A failed check drops its change, and dropping one can break another (a dependant now needs a version
// that will not be deployed; a coupled partner loses its pair) — so after any drop, recompute and
// re-run every check until a pass drops nothing. A dropped change keeps the reason it FIRST failed for.
import type { Change } from './types.ts';
import { baseOf, cmpVersion } from './versions.ts';

/** Modules that deploy as a pair: both move, or neither (team rule; extend here, nowhere else). */
export const COUPLED: string[][] = [['VirtoCommerce.XCMS', 'VirtoCommerce.PageBuilderModule']];

export interface Dropped { change: Change; status: 'DEP_CONFLICT' | 'PLATFORM_FLOOR' | 'COUPLED' | 'BLOCKED_ASSET'; reason: string }
export interface Resolution { accepted: Change[]; dropped: Dropped[]; passes: number }

export function resolveEndState(current: Map<string, string>, changes: Change[], atLatest: Set<string>, coupled: string[][] = COUPLED): Resolution {
  const dropped: Dropped[] = changes.filter((c) => !c.assetOk)
    .map((c) => ({ change: c, status: 'BLOCKED_ASSET' as const, reason: `not downloadable anonymously${c.assetNote ? ` (${c.assetNote})` : ''}: ${c.assetUrl}` }));
  let active = changes.filter((c) => c.assetOk);
  for (let passes = 1; ; passes++) {
    const end = new Map(current);
    for (const c of active) end.set(c.component, c.to);
    const platform = baseOf(end.get('Platform') ?? '0');
    const drop = new Map<Change, Dropped>();
    for (const c of active) {
      if (c.kind !== 'module') continue;
      if (c.platformFloor && cmpVersion(c.platformFloor, platform) > 0) {
        drop.set(c, { change: c, status: 'PLATFORM_FLOOR', reason: `needs Platform ≥ ${c.platformFloor}; end state has ${platform}` });
        continue;
      }
      const bad = c.deps.find((d) => end.has(d.Id) && cmpVersion(baseOf(end.get(d.Id)!), d.Version) < 0);
      if (bad) drop.set(c, { change: c, status: 'DEP_CONFLICT', reason: `needs ${bad.Id} ≥ ${bad.Version}; end state has ${end.get(bad.Id)}` });
    }
    for (const group of coupled) {
      const pinned = group.filter((id) => current.has(id));
      if (pinned.length < 2) continue;
      const moving = active.filter((c) => pinned.includes(c.component) && !drop.has(c));
      const stuck = pinned.filter((id) => !moving.some((m) => m.component === id) && !atLatest.has(id));
      if (moving.length && stuck.length) for (const c of moving) drop.set(c, { change: c, status: 'COUPLED', reason: `${group.join(' + ')} move together; ${stuck.join(', ')} does not move` });
    }
    if (drop.size === 0) return { accepted: active, dropped, passes };
    dropped.push(...drop.values());
    active = active.filter((c) => !drop.has(c));
  }
}
```

- [ ] **Step 4: Run the tests until green.**

```bash
npx tsx --test scripts/unit/_tmp-checks.test.ts 2>&1 | tail -3   # "# fail 0"
npx tsc --noEmit -p ci/tsconfig.json
```

- [ ] **Step 5: Delete the temporary test and commit.**

```bash
rm scripts/unit/_tmp-checks.test.ts && git status --porcelain scripts/unit
git add scripts/deploy && git commit -m "feat(deploy): fixed-point end-state checks (platform floor, deps, coupled, downloadable)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Plan, finalize, render, and the `upgrade` CLI

**Files:**
- Create: `scripts/deploy/upgrade/plan.ts`
- Replace: `scripts/deploy/upgrade/cli.ts` (the Task 1 stub)
- Modify: `package.json` (add `deploy:upgrade`)
- Test (temporary): `scripts/unit/_tmp-plan.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7
- Produces:

```ts
// plan.ts
export interface RepoMap { platformRepo: string; themeRepo: string; modules: Record<string, string> }
export async function buildPlan(c: EnvCoords, http: Http, opts: { repoMap: RepoMap; feedUrl: string; themeWorkflow: string; now: Date }): Promise<UpgradePlan>;
export interface Finalized { accepted: Change[]; dropped: Dropped[]; passes: number; approved: Set<string>; kept: Row[] }
export function finalize(plan: UpgradePlan, decisions: Decisions): Finalized;   // throws Error on an unknown key/value
export function renderTable(plan: UpgradePlan, f: Finalized): string;
export function renderCommitMessage(plan: UpgradePlan, f: Finalized, trailers: string[]): { title: string; message: string };
export function renderPrBody(plan: UpgradePlan, f: Finalized, footer: string): string;
// cli.ts
export async function runUpgrade(args: string[]): Promise<void>;
```

**CLI contract** (the skill relies on exactly this):

```
vc-deploy.ts upgrade --env=<env> --plan-out=<file> [--json]                 PLAN  — read-only; exit 0, 2 tool error
vc-deploy.ts upgrade --plan=<file> [--decisions=<file>] [--json]             TABLE — pure; exit 0, 2 bad decisions
vc-deploy.ts upgrade --plan=<file> [--decisions=<file>] --apply \
                     [--trailer=<line>]... [--pr-footer=<text>]             APPLY — exit 0 PR opened, 1 nothing to change / stale / blocked, 2 tool error
```

- [ ] **Step 1: Write the failing temporary test** `scripts/unit/_tmp-plan.test.ts`. It covers the pure half, `finalize` and the renderers, against a hand-built plan.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalize, renderCommitMessage, renderTable } from '../deploy/upgrade/plan.ts';
import type { Change, UpgradePlan } from '../deploy/upgrade/types.ts';

const change = (component: string, from: string, to: string, over: Partial<Change> = {}): Change =>
  ({ component, kind: 'module', from, to, mode: 'release-bump', status: 'BEHIND', deps: [], assetUrl: 'u', assetOk: true, ...over });
const plan: UpgradePlan = {
  schema: 1, env: 'vcst', deployOwner: 'VirtoCommerce', deployRepo: 'vc-deploy-dev', branch: 'vcst-qa',
  packagesPath: 'backend/packages.json', themePath: 'theme/artifact.json', fetchedAt: '2026-10-05T10:00:00Z', feedUrl: 'f', platformLatest: '3.1076.0',
  snapshot: { packages: '{}', theme: null }, openUpgradePrs: [], live: null, notes: [],
  rows: [
    { component: 'Platform', kind: 'platform', current: '3.1076.0', latest: '3.1076.0', status: 'EQUAL', note: '' },
    { component: 'A', kind: 'module', current: '1.0.0', latest: '2.0.0', status: 'BEHIND', note: '', change: change('A', '1.0.0', '2.0.0') },
    { component: 'B', kind: 'module', current: '1.5.0-pr-3-abc', latest: '1.4.0', status: 'PRERELEASE?', note: 'PR open', trackerKey: 'VCST-7', downgrade: true, replace: change('B', '1.5.0-pr-3-abc', '1.4.0', { mode: 'promote', status: 'PRERELEASE→RELEASE' }) },
    { component: 'C', kind: 'module', current: '1.0.0', latest: '1.0.0', status: 'EQUAL', note: '' },
  ],
  questions: [{ key: 'VCST-7', components: ['B'], recommended: 'keep', lines: [] }],
};

test('a group missing from decisions is KEEP', () => {
  const f = finalize(plan, {});
  assert.deepEqual(f.accepted.map((c) => c.component), ['A']);
  assert.deepEqual(f.kept.map((r) => r.component), ['B']);
});

test('replace adds the group; per-module form works', () => {
  assert.deepEqual(finalize(plan, { 'VCST-7': 'replace' }).accepted.map((c) => c.component).sort(), ['A', 'B']);
  assert.deepEqual(finalize(plan, { 'VCST-7': { B: 'replace' } }).accepted.map((c) => c.component).sort(), ['A', 'B']);
});

test('unknown group, unknown component or unknown value is an error', () => {
  assert.throws(() => finalize(plan, { 'VCST-999': 'replace' }), /unknown group/);
  assert.throws(() => finalize(plan, { 'VCST-7': { Z: 'replace' } }), /not in group/);
  assert.throws(() => finalize(plan, { 'VCST-7': 'maybe' as any }), /keep.*replace/);
});

test('table collapses EQUAL rows and counts; commit message lists each change', () => {
  const f = finalize(plan, {});
  const table = renderTable(plan, f);
  assert.match(table, /^Env: vcst · VirtoCommerce\/vc-deploy-dev@vcst-qa · feed fetched 2026-10-05T10:00:00Z · platform latest 3\.1076\.0/);
  assert.match(table, /1 other module already match/);
  assert.match(table, /1 to change · 2 equal · 1 kept · 0 blocked/);
  const { title, message } = renderCommitMessage(plan, f, ['Co-Authored-By: X <x@y>']);
  assert.equal(title, 'vcst: upgrade to latest releases (1 component)');
  assert.match(message, /- A: 1\.0\.0 → 2\.0\.0\n\nCo-Authored-By: X <x@y>$/);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx tsx --test scripts/unit/_tmp-plan.test.ts`. Expected: FAIL, the module is not found.

- [ ] **Step 3: Write `upgrade/plan.ts`.**

```ts
// scripts/deploy/upgrade/plan.ts — build the plan (network, read-only), then finalize/render (pure).
import type { EnvCoords } from '../lib/env.ts';
import type { Http } from '../lib/github.ts';
import { fetchFile } from '../lib/github.ts';
import { THEME_URL_RE } from '../lib/manifest.ts';
import { getAdminToken, liveModules } from '../lib/live.ts';
import { classifyModule, classifyPlatform } from './classify.ts';
import type { FeedEntry } from './feed.ts';
import { blobBase, readPins } from './pins.ts';
import { classifyTheme, resolveThemeTarget } from './theme.ts';
import { resolveEndState } from './checks.ts';
import type { Dropped } from './checks.ts';
import type { Change, Decision, Decisions, QuestionGroup, Row, UpgradePlan } from './types.ts';

export interface RepoMap { platformRepo: string; themeRepo: string; modules: Record<string, string> }
const full = (bare: string) => (bare.includes('/') ? bare : `VirtoCommerce/${bare}`);

/** HEAD 200 anonymously — the deploy downloads without a token, and one 404 rolls back the whole install. */
async function checkAsset(http: Http, c: Change, platformImage: string | undefined, platformRepo: string): Promise<void> {
  if (c.kind === 'platform') {
    const zip = `https://github.com/${platformRepo}/releases/download/${c.to}/VirtoCommerce.Platform.${c.to}.zip`;
    c.assetUrl = zip;
    const zipOk = (await http.head(zip)).status === 200;
    let imgOk = true;
    if (platformImage) {
      const path = platformImage.replace(/^ghcr\.io\//, '');
      const tok = (await http.getJson(`https://ghcr.io/token?scope=repository:${path}:pull`))?.token;
      imgOk = !!tok && (await http.head(`https://ghcr.io/v2/${path}/manifests/${c.to}`, {
        Authorization: `Bearer ${tok}`,
        Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json',
      })).status === 200;
    }
    c.assetOk = zipOk && imgOk;
    if (!c.assetOk) c.assetNote = [!zipOk && 'platform zip', !imgOk && `image ${platformImage}:${c.to}`].filter(Boolean).join(' + ');
    return;
  }
  c.assetOk = (await http.head(c.assetUrl)).status === 200;
}

function groupQuestions(rows: Row[]): QuestionGroup[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const asked = r.status === 'PRERELEASE?';
    const companion = r.status === 'NOT_IN_FEED' && r.trackerKey; // shown in the group, never changed
    if (!asked && !companion) continue;
    const key = r.trackerKey ?? r.component;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups].filter(([, rs]) => rs.some((r) => r.status === 'PRERELEASE?')).map(([key, rs]) => ({
    key,
    components: rs.filter((r) => r.status === 'PRERELEASE?').map((r) => r.component),
    recommended: rs.every((r) => r.status !== 'PRERELEASE?' || /closed unmerged/.test(r.note)) ? 'replace' : 'keep',
    lines: rs.map((r) => r.replace
      ? `${r.component}: ${r.current} → release ${r.replace.to}${r.downgrade ? ' (DOWNGRADE)' : ''} — ${r.note}${r.prUrl ? ` ${r.prUrl}` : ''}`
      : `${r.component}: ${r.current} — ${r.status}, stays as is${r.prUrl ? ` ${r.prUrl}` : ''}`),
  }));
}

export async function buildPlan(c: EnvCoords, http: Http, opts: { repoMap: RepoMap; feedUrl: string; themeWorkflow: string; now: Date }): Promise<UpgradePlan> {
  const repoFull = `${c.deployOwner}/${c.deployRepo}`;
  if (!(await http.gh(`/repos/${repoFull}/branches/${encodeURIComponent(c.branch)}`))) {
    throw new Error(`branch ${repoFull}@${c.branch} not found for env "${c.env}" (tried DEPLOY_BRANCH, BRANCH_MAP, then the env name with _→-)`);
  }
  const openUpgradePrs = (await http.ghAll(`/repos/${repoFull}/pulls?state=open&base=${encodeURIComponent(c.branch)}`))
    .filter((p: any) => String(p.head?.ref ?? '').startsWith('env-upgrade-'))
    .map((p: any) => ({ number: p.number, url: p.html_url, head: p.head.ref }));
  const pkg = await fetchFile(c, c.packagesPath);
  const theme = await fetchFile(c, c.themePath).catch(() => null);
  const feedArr = await http.getJson(opts.feedUrl);
  if (!Array.isArray(feedArr)) throw new Error(`module feed unreadable: ${opts.feedUrl}`);
  const feed = new Map<string, FeedEntry>(feedArr.map((e: FeedEntry) => [e.Id, e]));
  const platformRepo = full(opts.repoMap.platformRepo), themeRepo = full(opts.repoMap.themeRepo);
  const latestRel = await http.gh(`/repos/${platformRepo}/releases/latest`);
  if (!latestRel?.tag_name) throw new Error(`no latest release on ${platformRepo}`);
  const platformLatest = String(latestRel.tag_name).replace(/^v/, '');

  const base = blobBase(pkg.json);
  const privacy = new Map<string, boolean>();
  const ctx = {
    http, feed, blobBase: base,
    repoOf: (id: string) => (opts.repoMap.modules[id] ? full(opts.repoMap.modules[id]) : /github\.com\/([^/]+\/[^/]+)/.exec(feed.get(id)?.ProjectUrl ?? '')?.[1] ?? null),
    // Unknown visibility (404 to this token) counts as private: keeping a pin in AzureBlob never 404s the deploy.
    isPrivate: async (repo: string) => { if (!privacy.has(repo)) privacy.set(repo, (await http.gh(`/repos/${repo}`))?.private !== false); return privacy.get(repo)!; },
  };
  const { pins, duplicates } = readPins(pkg.json);
  const rows: Row[] = [await classifyPlatform(pkg.json, platformLatest, platformRepo, http)];
  for (const p of pins) rows.push(await classifyModule(p, duplicates.includes(p.id), ctx));
  const notes: string[] = [];
  if (theme) {
    const t = await resolveThemeTarget(http, themeRepo, base, opts.themeWorkflow);
    notes.push(...t.notes);
    rows.push(await classifyTheme(http, themeRepo, THEME_URL_RE.exec(theme.text)?.[0] ?? null, t));
  }
  for (const r of rows) for (const c of [r.change, r.replace]) if (c) await checkAsset(http, c, pkg.json.PlatformImage, platformRepo);

  let live: Record<string, string> | null = null;
  const token = c.backUrl ? await getAdminToken(c) : null;
  if (token) live = await liveModules(c, token);
  return {
    schema: 1, env: c.env, deployOwner: c.deployOwner, deployRepo: c.deployRepo, branch: c.branch,
    packagesPath: c.packagesPath, themePath: c.themePath, fetchedAt: opts.now.toISOString(), feedUrl: opts.feedUrl, platformLatest,
    snapshot: { packages: pkg.text, theme: theme?.text ?? null },
    rows, questions: groupQuestions(rows), openUpgradePrs, live, notes,
  };
}

export interface Finalized { accepted: Change[]; dropped: Dropped[]; passes: number; approved: Set<string>; kept: Row[] }

export function finalize(plan: UpgradePlan, decisions: Decisions): Finalized {
  const valid = (d: unknown): d is Decision => d === 'keep' || d === 'replace';
  for (const [key, d] of Object.entries(decisions)) {
    const g = plan.questions.find((q) => q.key === key);
    if (!g) throw new Error(`decisions: unknown group "${key}" (groups: ${plan.questions.map((q) => q.key).join(', ') || 'none'})`);
    if (typeof d === 'string') { if (!valid(d)) throw new Error(`decisions["${key}"]: must be "keep" or "replace"`); continue; }
    for (const [comp, v] of Object.entries(d)) {
      if (!g.components.includes(comp)) throw new Error(`decisions["${key}"]: "${comp}" is not in group ${key}`);
      if (!valid(v)) throw new Error(`decisions["${key}"]["${comp}"]: must be "keep" or "replace"`);
    }
  }
  const decisionFor = (r: Row): Decision => {
    const g = plan.questions.find((q) => q.components.includes(r.component));
    const d = g ? decisions[g.key] : undefined;
    return d === undefined ? 'keep' : typeof d === 'string' ? d : d[r.component] ?? 'keep';
  };
  const proposed: Change[] = [], approved = new Set<string>(), kept: Row[] = [];
  for (const r of plan.rows) {
    if (r.change) proposed.push(r.change);
    else if (r.status === 'PRERELEASE?' && r.replace) {
      if (decisionFor(r) === 'replace') { proposed.push(r.replace); approved.add(r.component); } else kept.push(r);
    }
  }
  const current = new Map(plan.rows.filter((r) => r.kind !== 'theme').map((r) => [r.component, r.kind === 'platform' ? r.current.split(' ')[0] : r.current]));
  const atLatest = new Set(plan.rows.filter((r) => r.status === 'EQUAL').map((r) => r.component));
  const res = resolveEndState(current, proposed, atLatest);
  return { ...res, approved, kept };
}

const statusOrder = (r: Row, f: Finalized): number =>
  r.kind === 'platform' ? 0 : f.accepted.some((c) => c.component === r.component) ? 1 : (f.kept.includes(r) || r.status === 'AHEAD') ? 2 : f.dropped.some((d) => d.change.component === r.component) ? 3 : 4;

export function renderTable(plan: UpgradePlan, f: Finalized): string {
  const out = [`Env: ${plan.env} · ${plan.deployOwner}/${plan.deployRepo}@${plan.branch} · feed fetched ${plan.fetchedAt} · platform latest ${plan.platformLatest}`, '',
    '| Component | On env | Live | Latest release | Status | Action / note |', '|---|---|---|---|---|---|'];
  const equal = plan.rows.filter((r) => r.status === 'EQUAL' && r.kind !== 'platform');
  const shown = plan.rows.filter((r) => !equal.includes(r)).sort((a, b) => statusOrder(a, f) - statusOrder(b, f) || a.component.localeCompare(b.component));
  for (const r of shown) {
    const acc = f.accepted.find((c) => c.component === r.component);
    const drop = f.dropped.find((d) => d.change.component === r.component);
    const status = drop ? drop.status : acc && f.approved.has(r.component) ? 'PRERELEASE→RELEASE' : r.status;
    const action = acc ? `→ ${r.kind === 'theme' ? acc.to.split('/').pop() : acc.to}${f.approved.has(r.component) ? ' (you approved)' : ''}`
      : drop ? `${f.approved.has(r.component) ? 'you approved → release; ' : ''}blocked: ${drop.reason}` : r.note || '—';
    const live = r.kind === 'module' ? (plan.live?.[r.component.toLowerCase()] ?? '?') : '—';
    out.push(`| ${r.component} | ${r.current} | ${live} | ${r.latest ?? '—'} | ${status} | ${action} |`);
  }
  out.push('', `${equal.length} other module${equal.length === 1 ? '' : 's'} already match.`);
  const equalCount = plan.rows.filter((r) => r.status === 'EQUAL').length;
  out.push(`${f.accepted.length} to change · ${equalCount} equal · ${f.kept.length} kept · ${f.dropped.length} blocked`);
  out.push(`Checks (${f.passes} pass${f.passes === 1 ? '' : 'es'}): ${['BLOCKED_ASSET', 'PLATFORM_FLOOR', 'DEP_CONFLICT', 'COUPLED'].map((s) => `${s} ${f.dropped.filter((d) => d.status === s).length}`).join(' · ')}`);
  if (plan.notes.length) out.push('', ...plan.notes.map((n) => `note: ${n}`));
  return out.join('\n');
}

export function renderCommitMessage(plan: UpgradePlan, f: Finalized, trailers: string[]): { title: string; message: string } {
  const n = f.accepted.length;
  const title = `${plan.env}: upgrade to latest releases (${n} component${n === 1 ? '' : 's'})`;
  const lines = f.accepted.map((c) => `- ${c.component}: ${c.kind === 'theme' ? c.from.split('/').pop() : c.from} → ${c.kind === 'theme' ? c.to.split('/').pop() : c.to}`);
  return { title, message: [title, '', ...lines, ...(trailers.length ? ['', ...trailers] : [])].join('\n') };
}

export function renderPrBody(plan: UpgradePlan, f: Finalized, footer: string): string {
  const changed = f.accepted.map((c) => {
    const r = plan.rows.find((x) => x.component === c.component)!;
    return `| ${c.component} | ${r.current} | ${c.kind === 'theme' ? c.to.split('/').pop() : c.to} | ${c.status}${r.prUrl ? ` — ${r.prUrl}` : ''}${f.approved.has(c.component) ? ' (operator approved)' : ''} |`;
  });
  const keptRows = [
    ...f.kept.map((r) => `| ${r.component} | ${r.current} | kept on purpose — ${r.note}${r.prUrl ? ` ${r.prUrl}` : ''} |`),
    ...f.dropped.map((d) => `| ${d.change.component} | ${d.change.from} | ${d.status}: ${d.reason} |`),
  ];
  const equal = plan.rows.filter((r) => r.status === 'EQUAL').length;
  return [
    `Upgrade **${plan.env}** (\`${plan.branch}\`) to the latest releases. Feed fetched ${plan.fetchedAt}; platform latest ${plan.platformLatest}.`, '',
    '### Changed', '', '| Component | Was | Now | Why |', '|---|---|---|---|', ...changed, '',
    ...(keptRows.length ? ['### Kept on purpose', '', '| Component | On env | Reason |', '|---|---|---|', ...keptRows, ''] : []),
    `The other ${equal} component(s) already match. Checks ran to a fixed point in ${f.passes} pass(es).`, '',
    '**A human merges this PR; the merge triggers the deploy.** Right after it the env can serve the OLD build for a minute or two —',
    'check `/api/platform/modules` only after the deploy Action is green **and** the versions have actually changed.',
    ...(footer ? ['', footer] : []),
  ].join('\n');
}
```

- [ ] **Step 4: Write `upgrade/cli.ts`**, replacing the stub.

```ts
/**
 * vc-deploy.ts upgrade — bring a vc-deploy-dev env up to the latest RELEASED modules + platform and
 * the newest GREEN dev alpha of the storefront theme (/qa-env-upgrade). Three phases:
 *
 *   --env=<env> --plan-out=<file> [--json]            PLAN  (read-only network; writes the plan JSON)
 *   --plan=<file> [--decisions=<file>] [--json]       TABLE (pure: end state + checks + the table)
 *   --plan=<file> [--decisions=<file>] --apply        APPLY (edit, check by value, ONE deploy PR; never merges)
 *       [--trailer=<line>]... [--pr-footer=<text>] [--fork-owner=<login>]
 *
 * --decisions: { "<group key>": "keep" | "replace" | { "<component>": "keep" | "replace" } }; a group
 * not listed is KEEP. Exit: 0 ok · 1 nothing to change / stale / blocked · 2 tool error or bad input.
 * Never adds or removes a module, never downgrades, never calls an alpha a release.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT, envFilePath, loadEnvFiles, resolveEnvCoords } from '../lib/env.ts';
import { getToken, makeHttp, setToken } from '../lib/github.ts';
import { THEME_URL_RE, editThemeText, editUpgradeText, verifyUpgradeEdit } from '../lib/manifest.ts';
import type { ManifestChange } from '../lib/manifest.ts';
import { DeliverError, deliverPr } from '../lib/deliver.ts';
import { Exit, fail } from '../lib/exit.ts';
import { DEFAULT_FEED_URL } from './feed.ts';
import { buildPlan, finalize, renderCommitMessage, renderPrBody, renderTable } from './plan.ts';
import type { Finalized, RepoMap } from './plan.ts';
import type { Decisions, UpgradePlan } from './types.ts';

const TAG = 'env-upgrade';

function gitAuthor(): { name: string; email: string } | undefined {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim();
    const email = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim();
    return name && email ? { name, email } : undefined;
  } catch { return undefined; }
}

export async function runUpgrade(args: string[]): Promise<void> {
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const flags = (n: string) => args.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.split('=').slice(1).join('='));
  const has = (n: string) => args.includes(`--${n}`);
  const asJson = has('json');
  const planPath = flag('plan');

  if (!planPath) {
    const env = flag('env');
    if (!env) fail('--env=<env> is required (TEST_ENV form, e.g. vcst, vcptcore_qa1). It is never defaulted.', TAG);
    if (!existsSync(envFilePath(env))) fail(`no env file for "${env}" (${envFilePath(env)})`, TAG);
    loadEnvFiles(env);
    setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
    if (!getToken()) fail('No GIT_TOKEN — a PAT with read on VirtoCommerce repos (read .env.local).', TAG);
    const repoMap = JSON.parse(readFileSync(resolve(REPO_ROOT, 'config/module-repo-map.json'), 'utf8')) as RepoMap;
    const plan = await buildPlan(resolveEnvCoords(env), makeHttp(), {
      repoMap, feedUrl: process.env.VC_MODULES_FEED_URL || DEFAULT_FEED_URL, themeWorkflow: flag('theme-workflow') || 'theme-ci.yml', now: new Date(),
    }).catch((e) => fail(e.message, TAG));
    const out = flag('plan-out');
    if (out) writeFileSync(out, JSON.stringify(plan, null, 2));
    if (asJson) { console.log(JSON.stringify({ planOut: out ?? null, openUpgradePrs: plan.openUpgradePrs, questions: plan.questions, notes: plan.notes }, null, 2)); throw new Exit(0); }
    console.log(`Plan for ${plan.env} (${plan.deployOwner}/${plan.deployRepo}@${plan.branch})${out ? ` → ${out}` : ''}`);
    for (const p of plan.openUpgradePrs) console.log(`⚠ open upgrade PR #${p.number} into ${plan.branch}: ${p.url}`);
    for (const q of plan.questions) { console.log(`\nQuestion ${q.key} (recommended: ${q.recommended})`); for (const l of q.lines) console.log(`  · ${l}`); }
    if (!plan.questions.length) console.log('No questions — every prerelease pin has a release, or there are none.');
    throw new Exit(0);
  }

  let plan: UpgradePlan, decisions: Decisions;
  try {
    plan = JSON.parse(readFileSync(planPath, 'utf8'));
    decisions = flag('decisions') ? JSON.parse(readFileSync(flag('decisions')!, 'utf8')) : {};
  } catch (e: any) { fail(`cannot read plan/decisions: ${e.message}`, TAG); }
  if (plan.schema !== 1) fail(`plan schema ${plan.schema} is not supported — re-run the PLAN phase`, TAG);
  let f: Finalized;
  try { f = finalize(plan, decisions); } catch (e: any) { fail(e.message, TAG); }

  if (!has('apply')) {
    console.log(asJson ? JSON.stringify({ accepted: f.accepted, dropped: f.dropped, kept: f.kept.map((r) => r.component), passes: f.passes }, null, 2) : renderTable(plan, f));
    throw new Exit(0);
  }
  if (f.accepted.length === 0) { console.log(`${plan.env} is up to date — nothing to change.`); throw new Exit(1); }

  // ── APPLY ──
  loadEnvFiles(plan.env);
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
  const coords = resolveEnvCoords(plan.env);
  if (`${coords.deployOwner}/${coords.deployRepo}@${coords.branch}` !== `${plan.deployOwner}/${plan.deployRepo}@${plan.branch}`) {
    fail(`env "${plan.env}" now resolves to ${coords.deployOwner}/${coords.deployRepo}@${coords.branch}, the plan was for ${plan.deployOwner}/${plan.deployRepo}@${plan.branch} — re-plan`, TAG);
  }
  const pkgChanges: ManifestChange[] = f.accepted.filter((c) => c.kind !== 'theme').map((c) => ({ id: c.component, to: c.to, mode: c.mode as ManifestChange['mode'] }));
  const files: { path: string; text: string; snapshot: string }[] = [];
  if (pkgChanges.length) {
    const r = editUpgradeText(plan.snapshot.packages, pkgChanges);
    if ('error' in r) fail(`STOP — ${r.error}`, TAG);
    const problems = verifyUpgradeEdit(plan.snapshot.packages, r.text, pkgChanges);
    if (problems.length) fail(`STOP — the edit is not exactly what was approved:\n  ${problems.join('\n  ')}`, TAG);
    files.push({ path: plan.packagesPath, text: r.text, snapshot: plan.snapshot.packages });
  }
  const themeChange = f.accepted.find((c) => c.kind === 'theme');
  if (themeChange) {
    if (plan.snapshot.theme == null) fail('STOP — theme change approved but the plan has no theme snapshot', TAG);
    const te = editThemeText(plan.snapshot.theme, themeChange.to);
    if (!te.from || !THEME_URL_RE.test(te.text)) fail('STOP — theme file has no recognisable URL to replace', TAG);
    files.push({ path: plan.themePath, text: te.text, snapshot: plan.snapshot.theme });
  }
  const { title, message } = renderCommitMessage(plan, f, flags('trailer'));
  const body = renderPrBody(plan, f, flag('pr-footer') ?? '');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let r;
  try {
    r = await deliverPr({ coords, headBranch: `env-upgrade-${plan.branch}-${stamp}`, uniqueBranch: true, title, message, body, files, author: gitAuthor(), forkOwner: flag('fork-owner'), log: (l) => console.log(l) });
  } catch (e) { if (e instanceof DeliverError) fail(e.message, TAG); throw e; }
  if (r.kind === 'stale') { console.error(`[${TAG}] STOP — ${r.path} changed on ${plan.branch} since the plan. Someone changed the env; re-run from the PLAN phase.`); throw new Exit(1); }
  if (r.kind === 'handoff') {
    console.error(`[${TAG}] ${r.reason} — nothing was written. Web edit:`);
    for (const p of files) console.error(`  https://github.com/${plan.deployOwner}/${plan.deployRepo}/edit/${plan.branch}/${p.path}`);
    throw new Exit(1);
  }
  if (r.kind === 'partial') { console.error(`[${TAG}] ⚠ PARTIAL commit on ${r.writeOwner}/${plan.deployRepo}@${r.headBranch}: committed ${r.committed.join(', ')}; FAILED ${r.failed.join(', ')}. Fix or delete the branch: ${r.compareUrl}`); throw new Exit(1); }
  if (r.kind === 'pushed-no-pr') { console.log(`Branch pushed, PR not opened (${r.note}). Open it: ${r.compareUrl}`); throw new Exit(1); }
  // The PR must carry only the files we wrote.
  const prNumber = Number(/\/pull\/(\d+)/.exec(r.url)?.[1]);
  const prFiles = prNumber ? (await makeHttp().ghAll(`/repos/${plan.deployOwner}/${plan.deployRepo}/pulls/${prNumber}/files`)).map((x: any) => x.filename) : [];
  const extra = prFiles.filter((p: string) => !files.some((x) => x.path === p));
  console.log(`✅ PR ${r.note}: ${r.url}`);
  console.log('A human merges it; the merge deploys. Check /api/platform/modules only after the deploy Action is green AND the versions changed.');
  if (extra.length) { console.error(`⚠ the PR also touches ${extra.join(', ')} — review before anyone merges`); throw new Exit(1); }
  throw new Exit(0);
}
```

- [ ] **Step 5: Add the npm script.** In `package.json`, after `deploy:pr:apply`:

```json
    "deploy:upgrade": "npx tsx scripts/deploy/vc-deploy.ts upgrade",
```

- [ ] **Step 6: Run the tests until green.**

```bash
npx tsx --test scripts/unit/_tmp-plan.test.ts 2>&1 | tail -3        # "# fail 0"
npx tsx --test scripts/unit/deploy-pr-artifact.test.ts 2>&1 | tail -3
npx tsc --noEmit -p ci/tsconfig.json
```

- [ ] **Step 7: Dry-run against a real env (read-only; nothing is written).** Use vcst, where draft run `VirtoCommerce/vc-deploy-dev#6697` is the reference.

```bash
npm run deploy:upgrade -- --env=vcst --plan-out="$SCRATCH/plan.json"; echo "exit $?"   # exit 0, prints questions + open upgrade PRs
npm run deploy:upgrade -- --plan="$SCRATCH/plan.json"; echo "exit $?"                  # exit 0, prints the table
echo '{"NOT-A-GROUP":"replace"}' > "$SCRATCH/bad.json"
npm run deploy:upgrade -- --plan="$SCRATCH/plan.json" --decisions="$SCRATCH/bad.json"; echo "exit $?"   # exit 2, "unknown group"
npm run deploy:upgrade -- --plan="$SCRATCH/plan.json" --json | node -e 'const j=JSON.parse(require("fs").readFileSync(0));console.log(j.accepted.length, j.dropped.length, j.passes)'
npm run deploy:upgrade; echo "exit $?"                                                 # exit 2, "--env=<env> is required"
```

Check the printed table against the live env by hand:
- Pick three `BEHIND` rows and confirm each "Latest release" value in `modules_v3.json`.
- Confirm the platform row's latest equals `gh api repos/VirtoCommerce/vc-platform/releases/latest --jq .tag_name`.
- Confirm the theme row's target alpha is from a green `theme-ci.yml` run on the theme repo's Actions page.

Any mismatch is a bug in Tasks 4–7: fix it there, rerun that task's temporary test, and come back. Do NOT run `--apply` in this task.

- [ ] **Step 8: Delete the temporary test and commit.**

```bash
rm scripts/unit/_tmp-plan.test.ts && git status --porcelain scripts/unit
git add scripts/deploy package.json && git commit -m "feat(deploy): vc-deploy.ts upgrade — plan / table / apply phases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The skill, removing the command, and the references

**Files:**
- Create: `.claude/skills/qa-env-upgrade/SKILL.md`, `.claude/skills/qa-env-upgrade/reference.md`
- Delete: `.claude/commands/qa-env-upgrade.md`
- Modify: `.claude/ROUTING.md:33,78`, `.claude/skills/README.md` (tree + table), `.claude/commands/qa-deploy-pr.md:35`, `.claude/skills/qa-deploy-pr/SKILL.md:24`, `docs/repo-findings-backlog.md:28`, `claude schedule/cowork-verify-task-prompt.md:33`

**Interfaces:**
- Consumes: the CLI contract from Task 8

- [ ] **Step 1: Write `.claude/skills/qa-env-upgrade/SKILL.md`.**

````markdown
---
name: qa-env-upgrade
description: "[QA Methodology] Upgrade a deployed environment to the LATEST RELEASED modules + platform and the newest GREEN dev alpha of the storefront theme. Compares the env's vc-deploy-dev backend/packages.json with VirtoCommerce/vc-modules modules_v3.json (modules) and the latest vc-platform release (platform), and theme/artifact.json with the newest vc-frontend dev alpha whose Theme CI run is green; moves PR/alpha pins to the release that contains them and ASKS only where no release does; prints ONE table; asks once before opening ONE deploy PR. Use when asked to bring an env up to date / 'обновить стенд до последних релизов'. Read-only until the operator's yes; never merges — a human merges to deploy."
argument-hint: "<env>"
disable-model-invocation: true
---

# /qa-env-upgrade — bring an environment up to the latest releases

```
/qa-env-upgrade vcst                 # vcst-qa
/qa-env-upgrade vcptcore_qa1         # any env that has a .env.<env> file
```

What the operator gets, in order: **questions** only where a pin has no release yet → **one table**
(nothing written yet; they can stop here) → **one yes/no** → on yes, **a PR link**. A human with merge
rights on `vc-deploy-dev` merges it; the merge deploys.

Out of scope: adding or removing modules, hotfix delivery (`/qa-hotfix-check`), deploying a ticket's
PR builds (`/qa-deploy-pr`).

**Deterministic core: `npm run deploy:upgrade`** (`scripts/deploy/vc-deploy.ts upgrade`; flags and exit
codes in its `upgrade/cli.ts` header). The script does every comparison, check and edit. This skill
asks, shows, and relays — **it never re-derives a version, a status or a check by hand**, and never
edits the manifest itself. Status meanings and why each rule exists: [`reference.md`](reference.md).

**Safety contract.** Steps 1–4 only read. Step 5 is the only write, and only after the operator's yes.
Never merge, never force-push, never touch a branch other than the named env's.

Requires `GIT_TOKEN` (read on VirtoCommerce repos) and an authenticated `gh` (writes use its keyring
token; without write on `vc-deploy-dev` the script uses a fork, else prints web-edit links).

## 1. Plan (read-only)

`$ARGUMENTS` = the env in `TEST_ENV` form. No env → STOP and ask; never default to one.

```bash
npm run deploy:upgrade -- --env=<env> --plan-out=<scratchpad>/env-upgrade-<env>.plan.json --json
```

Exit 2 → show the error and stop (missing env file, branch not found, token, rate limit).
`openUpgradePrs` not empty → list them and ask whether to go on (two upgrade PRs on one branch conflict).

## 2. Questions — one per feature group

For each entry of `questions` (≤4 per `AskUserQuestion` call): header = the group `key`; the question
shows every `lines[]` entry verbatim (pins, PR links and state, the release it would become, DOWNGRADE
where flagged). Options, the recommended one first and labelled *(Recommended)* per the group's
`recommended`:

- *Keep the PR/alpha builds* → `"keep"`
- *Replace with release* → `"replace"`
- *Decide per module* → ask one follow-up per component, record `{ "<component>": "keep" | "replace" }`

Write the answers to `<scratchpad>/env-upgrade-<env>.decisions.json` as
`{ "<key>": "keep" | "replace" | { … } }`. No questions → skip the file.

## 3. Table

```bash
npm run deploy:upgrade -- --plan=<plan> --decisions=<decisions>
```

Show the output **verbatim** — it is the table, the counts and the check results. A *Replace* the checks
blocked is marked "you approved → release; blocked: …" in it; say so in one line.

## 4. One yes/no

"Open a deploy PR into `<branch>` with these N changes? A human merges." The counts line has N.
`0 to change` → say the env is up to date and stop.

## 5. On yes — apply

```bash
npm run deploy:upgrade -- --plan=<plan> --decisions=<decisions> --apply \
  --trailer="<this session's commit attribution line>" --pr-footer="<this session's PR attribution>"
```

- exit 0 → report the PR URL and the merge note below.
- exit 1 → relay the message: *stale* means someone changed the env since step 1 — offer to start
  over from step 1; a web-edit link means no write path — hand the links over.
- exit 2 → relay the error; nothing was written unless the message says PARTIAL.

**Merge note:** a human merges; the merge triggers the deploy. Right after it the env can serve the
OLD build for a minute or two, so check `/api/platform/modules` only after the deploy Action is green
**and** the versions have actually changed.

## Never

- Never downgrade, never add or remove a module, never call an alpha a release.
- Never write before the step-4 yes; never merge; never edit another env's branch.
- Never hand-edit the manifest or work around a script STOP — report it.
- Never transcribe versions, module lists or env→branch mappings into this file.
````

- [ ] **Step 2: Write `.claude/skills/qa-env-upgrade/reference.md`.** It is read on demand, for explaining a row to the operator or for changing the script.

```markdown
# /qa-env-upgrade — reference (read on demand)

The rules below are implemented in `scripts/deploy/upgrade/`; this file explains them. If the two
disagree, the code is what runs — fix whichever is wrong, in the same commit.

## Statuses

| Status | Meaning | Action |
|---|---|---|
| `EQUAL` | release pin == latest release | none (collapsed into one line) |
| `BEHIND` | release pin < latest release | → latest release |
| `AHEAD` | pin > latest release (or a theme release ≥ the dev version) | none — never downgrade |
| `PRERELEASE→RELEASE` | PR/alpha pin, a release containing it exists | → latest release |
| `PRERELEASE?` | PR/alpha pin, no release contains it | asked (feature group) |
| `NOT_IN_FEED` | Id absent from `modules_v3.json` (custom, client, private) | none |
| `NO_RELEASE` | feed holds only alphas / no green theme alpha | none |
| `DUPLICATE` | Id pinned in both sources | none — fix by hand |
| `DEP_CONFLICT` | a non-optional dependency would be below its required version in the end state | not bumped |
| `PLATFORM_FLOOR` | target needs a newer platform than the end state has | not bumped |
| `COUPLED` | `XCMS` + `PageBuilderModule` must move together (`upgrade/checks.ts` `COUPLED`) | not bumped |
| `BLOCKED_ASSET` | target not downloadable anonymously (zip, blob or ghcr image) | not bumped |

## Why the rules are what they are

- **A release is an empty `VersionTag` AND a GitHub release-download `PackageUrl`.** An alpha's `Version`
  field carries no suffix, so `Version` alone cannot tell them apart.
- **The platform is not in the feed** — its target is `vc-platform`'s latest non-draft, non-prerelease release.
- **A release can sit in `AzureBlob`** — private repos: the deploy downloads anonymously, so a
  `GithubReleases` pin of them 404s. Their target is checked and moved inside `AzureBlob`. A repo whose
  visibility the token cannot see is treated as private (a blob pin never 404s the deploy).
- **PR → release by ancestry, then by `(#N)`.** Hotfix cherry-picks are made without `-x`, so the merge
  sha alone misses them.
- **Alpha `X.Y.Z-alpha.N` precedes release `X.Y.Z`** — matched "by version": the last alpha of a version
  is built minutes before its release.
- **Theme target = newest GREEN dev alpha.** The blob name has no sha; the only link to its CI run is the
  blob's `Last-Modified` inside the run's *Publish to Blob* step window. Runs are listed per commit
  (`?head_sha=`), because `branch=dev&event=push` returned nothing newer than two weeks back (measured
  2026-10-02). A red run can still have published — that alpha is never the target.
- **Checks run on the END STATE, to a fixed point** — after the operator's answers, because a *Replace*
  changes what the end state is. One deploy 404 rolls back the whole install, hence the download check.
- **Moving only part of a feature to releases breaks it** — hence one question per tracker key, with
  the theme row and any `NOT_IN_FEED` PR build of the same key shown in the group.
- **The edit is checked BY VALUE** (`JSON.stringify`): an array compared with `!==` always differs (bc0701f5).
- **The PR goes into the env branch only:** a contents `PUT` without `branch` writes to the repo's default branch, with no review.
```

- [ ] **Step 3: Delete the command and update the references.**

```bash
git rm .claude/commands/qa-env-upgrade.md
grep -rn "qa-env-upgrade\|deploy-pr-artifact" .claude docs "claude schedule" package.json --include=*.md --include=*.json | grep -v "docs/superpowers/plans/" | grep -v CHANGELOG
```

Edit each hit:
- `.claude/ROUTING.md:33`: change the type column from `Command` to `Skill`. Leave line 78's bullet as it is (it describes the behaviour, which is unchanged).
- `.claude/skills/README.md`:
  - add the tree line `├── qa-env-upgrade/                  # [QA Methodology]  Upgrade an env to the latest releases (one deploy PR)` after `qa-deploy-pr/`
  - add the table row `| /qa-env-upgrade | Bring a deployed env up to the latest released modules + platform and the newest green theme alpha; asks only where no release exists; one deploy PR, never merges | SKILL.md (orchestration) + reference.md (statuses, rationale); core scripts/deploy/vc-deploy.ts upgrade |` after the `/qa-deploy-pr` row
- `.claude/commands/qa-deploy-pr.md:35` and `.claude/skills/qa-deploy-pr/SKILL.md:24`: `scripts/deploy/deploy-pr-artifact.ts` → `scripts/deploy/vc-deploy.ts pr` (core in `scripts/deploy/pr/pr.ts` + `scripts/deploy/lib/`)
- `docs/repo-findings-backlog.md:28`: replace the path the same way.
- `claude schedule/cowork-verify-task-prompt.md:33`: `scripts/deploy/deploy-pr-artifact.ts <KEY>` → `scripts/deploy/vc-deploy.ts pr <KEY>`

Leave `CHANGELOG.md` as it is: it is history.

- [ ] **Step 4: Run the gates.**

```bash
npm run context:check; echo "exit $?"          # exit 0 — no dangling path, SKILL.md under budget
wc -c .claude/skills/qa-env-upgrade/SKILL.md   # well under 19000
npx tsc --noEmit -p ci/tsconfig.json
npm test 2>&1 | tail -4                        # "# fail 0"
git status --porcelain scripts/unit            # empty
```

If `context:check` reports a `DOC-*` rule against `SKILL.md`, fix the file. Never add a baseline entry for a new file.

- [ ] **Step 5: End-to-end check with the operator (live).** Run `/qa-env-upgrade vcst` in a fresh session.
  - Answer the questions.
  - Confirm the table matches Task 8 Step 7.
  - Answer **No** at the yes/no.
  - Confirm nothing was written: `git -C . status` is clean, and no new `env-upgrade-*` branch exists on `vc-deploy-dev` (`gh api repos/VirtoCommerce/vc-deploy-dev/branches --paginate --jq '.[].name' | grep env-upgrade-`).

  A **Yes** run opens a real PR. Do it only when the operator wants the env upgraded.

- [ ] **Step 6: Commit.**

```bash
git add -A .claude docs/repo-findings-backlog.md "claude schedule/cowork-verify-task-prompt.md"
git commit -m "feat(skills): /qa-env-upgrade becomes a script-backed skill

The command's procedure moves into vc-deploy.ts upgrade (plan / table / apply);
the skill keeps only the questions, the table and the one yes/no.
Delivery reuses /qa-deploy-pr's gh-keyring path instead of a GIT_TOKEN PUT.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
