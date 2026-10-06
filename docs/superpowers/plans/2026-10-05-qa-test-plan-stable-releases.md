# /qa-test-plan Stable-Release Planning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/qa-test-plan` from sprint-only to stable-release planning. It should turn a `VirtoCommerce/vc-modules` bundle diff (vN-1 → vN) into an acceptance + upgrade-path plan that runs on `vcptcore-regression`, and also produce a forecast of the next stable.

**Architecture:** "A script computes, the prompt asks and relays", following the same pattern as `bundle:check`, `deploy:upgrade` and `hotfix:deliver`. Three new deterministic scripts do the mechanical work:
- `release:scope` diffs the bundles and traces release → PR → Jira.
- `deploy:bundle` opens one PR on `vc-deploy-dev` that pins the environment to a bundle.
- `release:compare` diffs the baseline regression run against the after-deploy run.

The command becomes a thin router over three on-demand prompt files: sprint mode, stable mode, and the shared plan sections.

**Tech Stack:** TypeScript run via `npx tsx` (ES modules, `.ts` import extensions as in `scripts/deploy/**`), Node 22 `fetch`, `node:test` for TEMPORARY tests, GitHub REST v3, Jira REST v3 (`scripts/lib/jira-search.ts`), markdown prompt files.

**Spec:** There is no separate spec file. The design was agreed in conversation on 2026-10-05: the user chose **Approach 1**, plans C (acceptance + upgrade) + D (forecast), A first, with deploy option B (our tooling opens the deploy PR). It is summarised in §Design below. Tracker: **VCST-6177** (epic VCST-5204 "Agentic QA"). First real use: **Stable 16 = VCST-6042**, bundle PR `VirtoCommerce/vc-modules#78`, branch `feat/VCST-6042-stable-16-bundle`.

## Design (agreed)

| Decision | Value |
|---|---|
| Invocation | `/qa-test-plan stable <N> [--ref <branch>]` · `/qa-test-plan stable next` · sprint forms unchanged |
| Scope source | `bundles/v{N-1}` vs `bundles/vN` in `VirtoCommerce/vc-modules`. The previous bundle = the previous numeric key of `bundles/stable.json` on `master` |
| Test environment | `vcptcore_regression` (TEST_ENV form). Today it runs Stable 15 (Platform 3.1039.12) |
| Run sequence | A baseline regression on vN-1 → B `deploy:bundle` PR (a human merges) → C same regression + upgrade checks → D `release:compare` |
| Regression scope | **Every feature ticket in the release**, Done or not. `release:cases` maps each to the suites and cases that cover it. Waves: **W1** Critical of every related suite → **W2** High → **W3** the release's direct cases that are neither (option C, 2026-10-05). The same waves run in A and C |
| Plan output | `vc/shared/docs/Release plans/stable-{N}-test-plan.md` + `stable-{N}-summary.json` + `stable-{N}-scope.json` |
| Forecast output | `vc/shared/docs/Release plans/stable-next-forecast-{YYYY-MM-DD}.md` + `-scope.json` (no summary, no regression consumer) |
| Regression consumer | `/qa-regression stable:N` reads `stable-{N}-summary.json` → `suitesActivated[]` |
| Out of scope (YAGNI) | `/qa-exploratory stable:N` (charters are run by hand from the plan), sprint names on tickets, PR-file-level suite selection |

## Global Constraints

- Work on branch `feat/qa-test-plan-stable-releases` off `main`. **The user has pre-staged `reports/tickets/Sprint26-20/VCST-5670/*`. Never commit it.** Commit only with an explicit pathspec: `git commit -F - -- <paths…>`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **NO CODE ⇒ NO UNIT TEST; code ⇒ a TEMPORARY test.** Write it under `scripts/unit/tmp-*.test.ts`, run it with `npx tsx --test <file>`, and **delete it before the commit**. No new `scripts/unit/` file is committed (`.claude/knowledge/execution/when-to-write-a-test.md`). The existing `scripts/unit/deploy-pr-artifact.test.ts` and `npm test` must stay green.
- GOLDEN RULE (`.claude/rules/test-data.md`): no transcribed values.
  - Bundle numbers, versions, ticket keys, suite IDs and repo names come from `vc-modules`, `config/module-repo-map.json`, `modules_v3.json`, Jira or `config/test-suites.json`.
  - The Jira project comes from `JIRA_PROJECT_KEY` and the base URL from `JIRA_BASE_URL` (both in `.env.vcst`).
- GitHub reads use `GIT_TOKEN` from `.env.local`. Never print a token.
- **No outward writes during implementation.** Run `deploy:bundle` in dry-run only. Never pass `--apply`, never merge, and create no Jira or GitHub writes.
- BUDGET-004: every command, agent and `SKILL.md` stays ≤ 19,000 chars, or ≤ its entry in `scripts/maintenance/.prompt-size-baseline.json`. Today `qa-test-plan.md` is at 23,258 and `qa-regression.md` at 40,251, and both are shrink-only. `npm run context:check` must be green after every prompt task.
- Counts (modules, suites, PRs) are never written into prose. The scripts print them.

## Review Focus

1. **The target bundle lives only on a PR branch.** Every `vc-modules` read for the target (package.json, breaking_changes.md) must carry `--ref`. A read at `master` silently diffs the wrong bundle or 404s. *Pinned in Task 5 (fake reader asserts the ref).*
2. **Release lists contain noise.** `v`-prefixed tags, drafts, prereleases, non-numeric tags, and support-line hotfixes of the *old* line released after the cut (3.1029.7 when moving 3.1029.6 → 3.1048.0) must all be filtered out. Otherwise PRs get double-listed. *Pinned in Task 2.*
3. **One non-existent key in a Jira `key in (…)` query fails the whole query.** The bad key must end up `unknown` without taking its neighbours with it. A missing-credentials error must stop the lookup, not trigger a bisection storm. *Pinned in Task 4.*
4. **Odd environment manifest shapes.** An env pin that is an AzureBlob prerelease of a bundle module must PROMOTE. An env-only blob pin with `--remove-extra` must BLOCK, not be kept silently. A downgrade must BLOCK without `--allow-downgrade`. *Pinned in Task 7.*
5. **Run folders hold lane fragments.** `suite-X-results.browser.json` sits next to the merged `suite-X-results.json`, and a suite may exist in only one run. Only merged envelopes may be read, and NEW/DROPPED must be reported, not crashed on. *Pinned in Task 6.*

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/release-trace.ts` (new) | GitHub reader + release → PR → tracker-key tracing. Shared by `bundle:check` and `release:scope` |
| `scripts/hotfix/bundle-version-check.ts` (modify) | Imports tracing from the lib; behaviour unchanged |
| `scripts/release/types.ts` (new) | The `ReleaseScope` contract |
| `scripts/release/bundle-diff.ts` (new) | Pure: bundle → components, component diff, versions-in-range |
| `scripts/release/breaking.ts` (new) | Pure: index `breaking_changes.md` (sections, module rows) |
| `scripts/release/classify.ts` (new) | Pure: cycle tickets, PR class, Jira lookup with bisection |
| `scripts/release/scope.ts` (new) | Network assembly of a `ReleaseScope` |
| `scripts/release/release-scope.ts` (new) | CLI `npm run release:scope` |
| `scripts/release/release-cases.ts` (new) | CLI + core `npm run release:cases`: release features → related suites + cases, run waves |
| `scripts/regression/filter-cases.ts` (modify) | export `tierOf` (the single Critical/P0 alias table) |
| `scripts/release/compare-runs.ts` (new) | CLI + core `npm run release:compare` |
| `scripts/deploy/lib/manifest.ts` (modify) | `add` / `remove` edit modes |
| `scripts/deploy/bundle/plan.ts` (new) | Pure: env manifest × bundle → pin plan |
| `scripts/deploy/bundle/cli.ts` (new) | `vc-deploy.ts bundle` |
| `scripts/deploy/upgrade/cli.ts`, `upgrade/plan.ts`, `vc-deploy.ts` (modify) | export `gitAuthor` / `checkAsset`; dispatch `bundle` |
| `package.json` (modify) | `release:scope`, `release:compare`, `deploy:bundle` |
| `.claude/commands/qa-test-plan.md` (rewrite) | Thin router, both modes |
| `.claude/knowledge/execution/test-plan/sprint-mode.md` (new) | Sprint pipeline, moved verbatim |
| `.claude/knowledge/execution/test-plan/plan-sections.md` (new) | Shared: risk, delegation, gap-diff, charters, shared rules (moved verbatim) |
| `.claude/knowledge/execution/test-plan/stable-mode.md` (new) | Stable + forecast pipeline |
| `.claude/commands/qa-regression.md` (modify) | `stable:N`; §1c shrinks to a pointer |
| `.claude/knowledge/execution/regression-selection.md` (modify) | §Plan-driven selection (moved 1c + `stable:N`) |
| `.claude/rules/regression.md` (modify) | One selection-table row |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
cd "c:/Users/mutyk/My Projects/ai-tools"
git checkout -b feat/qa-test-plan-stable-releases
git status --short   # expect the user's pre-staged VCST-5670 files listed — leave them alone
```

---

### Task 1: Extract release tracing into `scripts/lib/release-trace.ts`

**Files:**
- Create: `scripts/lib/release-trace.ts`
- Modify: `scripts/hotfix/bundle-version-check.ts`. Delete its `loadToken` (75-86), `ghJson`/`extractTaskKeys`/`resolvePr`/`traceVersionBump` (191-251) and `mapPool` (252-264), the `JIRA_KEY_RE`, `PrRef` and `VersionTrace` declarations, and the now-unused `parseDotenv` import.
- Test (temporary): `scripts/unit/tmp-release-trace.test.ts`

**Interfaces:**
- Produces:
  - `OWNER`, `JIRA_KEY_RE`, `PrRef`, `VersionTrace`, `GhReader`
  - `loadGitToken(repoRoot: string): string | undefined`
  - `makeGhReader(token: string | undefined, userAgent: string): GhReader`
  - `extractTaskKeys(...texts): string[]`, `prNumbersFromBody(body: string): number[]`
  - `resolvePr(gh, repo, num, jiraBase): Promise<PrRef>`
  - `traceVersionBump(gh, repo, tag, prevTag, jiraBase): Promise<VersionTrace>`
  - `mapPool<T,R>(items, size, fn): Promise<R[]>`
- `GhReader` = `{ hasToken: boolean; json(urlOrPath): Promise<any|null>; all(path, maxPages?): Promise<any[]>; file(repo, path, ref): Promise<string|null> }`

- [ ] **Step 1: Capture `bundle:check` output BEFORE the refactor** (the behaviour-identity reference)

```bash
npm run bundle:check -- v15 --json > "$TEMP/bundle-before.json"; echo "exit=$?"
```
Expected: exit 0 or 1 (1 = hotfixes available). Exit 2 means a token or rate-limit problem; fix that first.

- [ ] **Step 2: Write the temporary failing test**

```ts
// scripts/unit/tmp-release-trace.test.ts — TEMPORARY, delete before commit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTaskKeys, prNumbersFromBody, makeGhReader } from '../lib/release-trace.ts';

test('PR numbers from both VC release-note styles, sorted, unique', () => {
  const body = '* persist ConfigurationItem.SectionName (#190)\n* https://github.com/VirtoCommerce/vc-module-cart/pull/192\n* dup (#190)';
  assert.deepEqual(prNumbersFromBody(body), [190, 192]);
});

test('tracker keys: PROJECT-NUMBER only, deduped, .NET identifiers ignored', () => {
  assert.deepEqual(extractTaskKeys('VCST-6042: Stable 16', 'feat/VCST-6042-x', 'see VP-9216 and IJobCancellationToken'), ['VCST-6042', 'VP-9216']);
});

test('file() reads at the requested ref with the raw media type', async () => {
  const seen: { url: string; accept: string }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => { seen.push({ url, accept: init.headers.Accept }); return new Response('{"a":1}', { status: 200 }); }) as any;
  try {
    const gh = makeGhReader(undefined, 'test');
    assert.equal(await gh.file('vc-modules', 'bundles/v16/package.json', 'feat/VCST-6042-stable-16-bundle'), '{"a":1}');
  } finally { globalThis.fetch = orig; }
  assert.match(seen[0].url, /\/repos\/VirtoCommerce\/vc-modules\/contents\/bundles\/v16\/package\.json\?ref=feat%2FVCST-6042-stable-16-bundle$/);
  assert.equal(seen[0].accept, 'application/vnd.github.raw');
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx tsx --test scripts/unit/tmp-release-trace.test.ts`
Expected: FAIL, `Cannot find module '../lib/release-trace.ts'`

- [ ] **Step 4: Create `scripts/lib/release-trace.ts`**

```ts
/**
 * release-trace.ts — GitHub release → PR → tracker-key provenance.
 *
 * Shared by `bundle:check` (scripts/hotfix/bundle-version-check.ts: where a hotfix came from) and
 * `release:scope` (scripts/release/release-scope.ts: what a stable bundle carries). Extracted from
 * bundle-version-check.ts on 2026-10-05 so the two can never trace a version differently.
 *
 * Auth: GIT_TOKEN (fallback GITHUB_TOKEN / GITHUB_PERSONAL_ACCESS_TOKEN) from .env.defaults / .env.local /
 * process.env. Unauthenticated works but GitHub caps it at 60 req/h.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

export const OWNER = 'VirtoCommerce';
// PROJECT-NUMBER (VCST-4932, VP-9195): key 2–10 upper-alnum starting with a letter, so .NET identifiers don't match.
export const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;

export interface PrRef { number: number; title: string; url: string; taskKeys: string[]; taskUrls: string[] }
export interface VersionTrace {
  version: string; date: string | null; releaseUrl: string | null; prs: PrRef[];
  commitTaskKeys?: string[]; source?: 'release-notes' | 'commit-compare';
}

/** The three GitHub reads every caller needs. An interface so a test can fake GitHub. */
export interface GhReader {
  readonly hasToken: boolean;
  /** GET an api.github.com URL or path → JSON; null on 404; throws on rate limit or any other error. */
  json(urlOrPath: string): Promise<any | null>;
  /** Every page of a list endpoint (per_page=100), up to maxPages; [] on 404. */
  all(path: string, maxPages?: number): Promise<any[]>;
  /** Raw text of a VirtoCommerce repo file at a ref; null on 404. */
  file(repo: string, path: string, ref: string): Promise<string | null>;
}

export function loadGitToken(repoRoot: string): string | undefined {
  // Layered and light on purpose: config.js runs the full required-var validator and exits when a test var is missing.
  for (const f of ['.env.defaults', '.env.local']) {
    const p = resolve(repoRoot, f);
    if (!existsSync(p)) continue;
    for (const [k, v] of Object.entries(parseDotenv(readFileSync(p)))) if (!process.env[k]) process.env[k] = v;
  }
  return process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}

const api = (p: string) => (p.startsWith('http') ? p : `https://api.github.com${p}`);

export function makeGhReader(token: string | undefined, userAgent: string): GhReader {
  const headers = (accept = 'application/vnd.github+json'): Record<string, string> => ({
    Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': userAgent,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  const check = (res: Response, url: string): void => {
    if (res.status === 403 || res.status === 429) {
      throw new Error(`GitHub rate-limited (HTTP ${res.status}, remaining=${res.headers.get('x-ratelimit-remaining')}). ` +
        (token ? 'Wait for the limit to reset.' : 'Set GIT_TOKEN in .env.local to raise the limit to 5000/h.'));
    }
    if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
  };
  return {
    hasToken: !!token,
    async json(p) {
      const url = api(p);
      const res = await fetch(url, { headers: headers() });
      if (res.status === 404) return null;
      check(res, url);
      return res.json();
    },
    async all(p, maxPages = 10) {
      const out: any[] = [];
      let url: string | null = `${api(p)}${p.includes('?') ? '&' : '?'}per_page=100`;
      for (let i = 0; url && i < maxPages; i++) {
        const res: Response = await fetch(url, { headers: headers() });
        if (res.status === 404) return out;
        check(res, url);
        out.push(...(await res.json()));
        url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
      }
      return out;
    },
    async file(repo, path, ref) {
      const url = api(`/repos/${OWNER}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
      const res = await fetch(url, { headers: headers('application/vnd.github.raw') });
      if (res.status === 404) return null;
      check(res, url);
      return res.text();
    },
  };
}

export function extractTaskKeys(...texts: (string | null | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const t of texts) if (t) for (const m of t.matchAll(JIRA_KEY_RE)) keys.add(m[1]);
  return [...keys];
}

/** PR numbers a VC release body cites: auto-generated ".../pull/<n>" links and bare "(#<n>)" refs. */
export function prNumbersFromBody(body: string): number[] {
  const nums = new Set<number>();
  for (const m of body.matchAll(/\/pull\/(\d+)/g)) nums.add(+m[1]);
  for (const m of body.matchAll(/#(\d+)\b/g)) nums.add(+m[1]);
  return [...nums].sort((a, b) => a - b);
}

/** Fetch the PR, pull its title/branch/body, and extract any tracker keys. */
export async function resolvePr(gh: GhReader, repo: string, num: number, jiraBase: string): Promise<PrRef> {
  const pr = await gh.json(`/repos/${OWNER}/${repo}/pulls/${num}`);
  const taskKeys = pr ? extractTaskKeys(pr.title, pr.head?.ref, pr.body) : [];
  return {
    number: num,
    title: pr?.title ?? '',
    url: pr?.html_url ?? `https://github.com/${OWNER}/${repo}/pull/${num}`,
    taskKeys,
    taskUrls: taskKeys.map((k) => `${jiraBase}/browse/${k}`),
  };
}

/** For one tag: read the release notes, find the PR(s) that produced it, resolve their tasks. Falls back to
 *  diffing prevTag..tag and scanning commit messages when the release has no notes (theme releases: body null). */
export async function traceVersionBump(gh: GhReader, repo: string, tag: string, prevTag: string, jiraBase: string): Promise<VersionTrace> {
  const rel = await gh.json(`/repos/${OWNER}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  const nums = prNumbersFromBody(rel?.body ?? '');
  const base = { version: tag, date: rel?.published_at ?? null, releaseUrl: rel?.html_url ?? null };
  if (nums.length) {
    return { ...base, prs: await Promise.all(nums.map((n) => resolvePr(gh, repo, n, jiraBase))), source: 'release-notes' };
  }
  const cmp = await gh.json(`/repos/${OWNER}/${repo}/compare/${encodeURIComponent(prevTag)}...${encodeURIComponent(tag)}`);
  const prNums = new Set<number>();
  const commitKeys = new Set<string>();
  for (const c of cmp?.commits ?? []) {
    const msg: string = c?.commit?.message ?? '';
    for (const m of msg.matchAll(/(?:^|[\s(])#(\d+)\b/g)) prNums.add(+m[1]);
    for (const k of extractTaskKeys(msg)) commitKeys.add(k);
  }
  const prs = await Promise.all([...prNums].sort((a, b) => a - b).map((n) => resolvePr(gh, repo, n, jiraBase)));
  // PR-derived keys subsume commit ones; only surface commit keys not already covered.
  const fromPrs = new Set(prs.flatMap((p) => p.taskKeys));
  return { ...base, prs, commitTaskKeys: [...commitKeys].filter((k) => !fromPrs.has(k)), source: 'commit-compare' };
}

export async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  return out;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx tsx --test scripts/unit/tmp-release-trace.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Re-point `bundle-version-check.ts` at the lib**

Add after the existing imports:

```ts
import { OWNER, loadGitToken, makeGhReader, mapPool, traceVersionBump } from '../lib/release-trace.ts';
import type { PrRef, VersionTrace } from '../lib/release-trace.ts'; // keep whichever the file still references (tsc in Step 7 tells you)
```

Then make these edits:
- Delete the local `const OWNER = 'VirtoCommerce';`, `JIRA_KEY_RE`, `interface PrRef`, `interface VersionTrace`, `function loadToken`, `async function ghJson`, `function extractTaskKeys`, `async function resolvePr`, `async function traceVersionBump` and `async function mapPool`.
- Delete the `import { parse as parseDotenv } from 'dotenv';` line.
- In `main()`, replace `TOKEN = loadToken();` with:

```ts
  TOKEN = loadGitToken(REPO_ROOT);
  const gh = makeGhReader(TOKEN, 'vc-bundle-version-check');
```

- Replace the trace call (was line 406) with:

```ts
        r.traces = await mapPool(newPatches, concurrency, (p) => traceVersionBump(gh, r.repo!, p.tag, p.prev, JIRA_BASE));
```

Keep `TOKEN`, `ghHeaders`, `tagExists`, `repoExists` and `highestOnLine` local. They are check-specific.

- [ ] **Step 7: Typecheck and verify the behaviour is identical**

```bash
npx tsc --noEmit -p . 2>&1 | grep -E "release-trace|bundle-version-check" ; echo "tsc-filtered-done"
npm run bundle:check -- v15 --json > "$TEMP/bundle-after.json"; echo "exit=$?"
node -e 'const f=p=>{const j=JSON.parse(require("fs").readFileSync(p,"utf8"));delete j.checkedAt;return JSON.stringify(j)};console.log(f(process.env.TEMP+"/bundle-before.json")===f(process.env.TEMP+"/bundle-after.json")?"IDENTICAL":"DIFFERENT")'
```
Expected: no tsc lines for the two files, same exit code as Step 1, and `IDENTICAL`. On `DIFFERENT`, first check whether a module released a new tag between the two runs (re-run Step 1 immediately and compare again). Otherwise fix the refactor.

- [ ] **Step 8: Delete the temporary test and commit**

```bash
rm scripts/unit/tmp-release-trace.test.ts
git add scripts/lib/release-trace.ts scripts/hotfix/bundle-version-check.ts
git commit -F - -- scripts/lib/release-trace.ts scripts/hotfix/bundle-version-check.ts <<'EOF'
refactor(release): extract release→PR→ticket tracing into scripts/lib/release-trace.ts

bundle:check now imports it; release:scope (next) reuses it, so the two can never trace a version
differently. Output verified identical on bundles/v15.

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Scope contract + pure bundle diff

**Files:**
- Create: `scripts/release/types.ts`, `scripts/release/bundle-diff.ts`
- Test (temporary): `scripts/unit/tmp-bundle-diff.test.ts`

**Interfaces:**
- Consumes: `cmpVersion(a,b)` from `scripts/deploy/upgrade/versions.ts`
- Produces (types.ts): `ComponentKind`, `BundleComponent {id, kind, version}`, `DiffStatus`, `ComponentDiff {id, kind, repo, from, to, status}`, `PrClass`, `ScopePr`, `TicketInfo`, `BreakingSection`, `BreakingRow`, `ReleaseScope`
- Produces (bundle-diff.ts):
  - `themeVersionOf(url): string|null`, `bundleComponents(json): BundleComponent[]`
  - `diffBundles(from, to, repoOf): ComponentDiff[]`
  - `versionsInRange(releases, from, to): {version, tag}[]`

- [ ] **Step 1: Write `scripts/release/types.ts`** (types only, no test)

```ts
// scripts/release/types.ts — the release-scope contract: written by release-scope.ts, read by /qa-test-plan stable.
export type ComponentKind = 'module' | 'platform' | 'theme';
export interface BundleComponent { id: string; kind: ComponentKind; version: string }
export type DiffStatus = 'CHANGED' | 'ADDED' | 'REMOVED' | 'SAME';
export interface ComponentDiff { id: string; kind: ComponentKind; repo: string | null; from: string | null; to: string | null; status: DiffStatus }

/** cycle = the release cycle's own tickets (untested by any sprint); feature = a product ticket; untracked = no tracked key. */
export type PrClass = 'cycle' | 'feature' | 'untracked';
export interface ScopePr { component: string; repo: string; version: string; number: number; title: string; url: string; taskKeys: string[]; class: PrClass }
/** done = Jira status CATEGORY is done; null = not looked up or the key is unknown to Jira. */
export interface TicketInfo { key: string; summary: string | null; type: string | null; status: string | null; done: boolean | null }

export interface BreakingSection { heading: string; tickets: string[]; modules: string[] }
export interface BreakingRow { section: string; module: string; version: string | null; cells: Record<string, string> }

export interface ReleaseScope {
  schema: 1;
  mode: 'stable' | 'next';
  generatedAt: string;
  from: { bundle: string; platform: string | null; theme: string | null };
  to: { bundle: string; ref: string; platform: string | null; theme: string | null };
  counts: Record<'changed' | 'added' | 'removed' | 'same' | 'prs' | 'cycle' | 'feature' | 'untracked' | 'ticketsDone' | 'ticketsOpen' | 'ticketsUnknown', number>;
  components: ComponentDiff[];
  prs: ScopePr[];
  cycleTickets: string[];
  tickets: TicketInfo[];
  breaking: { sections: BreakingSection[]; rows: BreakingRow[] } | null;
  notes: string[];
}
```

- [ ] **Step 2: Write the temporary failing test**

```ts
// scripts/unit/tmp-bundle-diff.test.ts — TEMPORARY, delete before commit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleComponents, diffBundles, versionsInRange } from '../release/bundle-diff.ts';

const b15 = { PlatformVersion: '3.1039.12', ThemeB2BVue: 'https://github.com/VirtoCommerce/vc-frontend/releases/download/2.51.1/vc-frontend-2.51.1.zip',
  Sources: [{ Name: 'AzureBlob', Modules: [] }, { Name: 'GithubReleases', Modules: [{ Id: 'VirtoCommerce.Cart', Version: '3.1006.1' }, { Id: 'VirtoCommerce.Gone', Version: '1.0.0' }, { Id: 'VirtoCommerce.Same', Version: '2.0.0' }] }] };
const b16 = { PlatformVersion: '3.1076.0', ThemeB2BVue: 'https://github.com/VirtoCommerce/vc-frontend/releases/download/2.58.0/vc-theme-b2b-vue-2.58.0.zip',
  Sources: [{ Name: 'GithubReleases', Modules: [{ Id: 'VirtoCommerce.Cart', Version: '3.1011.0' }, { Id: 'VirtoCommerce.BackgroundJobs', Version: '3.1052.0' }, { Id: 'VirtoCommerce.Same', Version: '2.0.0' }] }] };

test('components: platform, theme (version from the download URL), modules', () => {
  assert.deepEqual(bundleComponents(b15).map((c) => `${c.kind}:${c.id}@${c.version}`),
    ['platform:Platform@3.1039.12', 'theme:Theme@2.51.1', 'module:VirtoCommerce.Cart@3.1006.1', 'module:VirtoCommerce.Gone@1.0.0', 'module:VirtoCommerce.Same@2.0.0']);
});

test('diff: CHANGED / ADDED / REMOVED / SAME, platform + theme first, modules by id', () => {
  const d = diffBundles(bundleComponents(b15), bundleComponents(b16), (c) => (c.kind === 'module' ? c.id.toLowerCase() : c.kind));
  assert.deepEqual(d.map((r) => `${r.id}:${r.status}:${r.from}->${r.to}`), [
    'Platform:CHANGED:3.1039.12->3.1076.0', 'Theme:CHANGED:2.51.1->2.58.0',
    'VirtoCommerce.BackgroundJobs:ADDED:null->3.1052.0', 'VirtoCommerce.Cart:CHANGED:3.1006.1->3.1011.0',
    'VirtoCommerce.Gone:REMOVED:1.0.0->null', 'VirtoCommerce.Same:SAME:2.0.0->2.0.0']);
});

test('range: (from, to], ascending, drafts/prereleases/non-numeric and OLD-line hotfixes dropped, v-prefix kept as tag', () => {
  const rel = [
    { tag_name: '3.1048.0' }, { tag_name: 'v3.1030.0' }, { tag_name: '3.1029.7' },          // 3.1029.7 = old-line hotfix after the cut
    { tag_name: '3.1029.6' }, { tag_name: '3.1049.0' }, { tag_name: '3.1040.0', draft: true },
    { tag_name: '3.1041.0-alpha.1', prerelease: true }, { tag_name: 'latest' }, { tag_name: '3.1035.1' },
  ];
  assert.deepEqual(versionsInRange(rel, '3.1029.6', '3.1048.0'), [
    { version: '3.1030.0', tag: 'v3.1030.0' }, { version: '3.1035.1', tag: '3.1035.1' }, { version: '3.1048.0', tag: '3.1048.0' }]);
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx tsx --test scripts/unit/tmp-bundle-diff.test.ts`
Expected: FAIL, module not found

- [ ] **Step 4: Write `scripts/release/bundle-diff.ts`**

```ts
// scripts/release/bundle-diff.ts — what changed between two vc-modules stable bundles (pure).
import { cmpVersion } from '../deploy/upgrade/versions.ts';
import type { BundleComponent, ComponentDiff } from './types.ts';

/** The theme version is only in its download URL: .../releases/download/<version>/<file>.zip */
export const themeVersionOf = (url: unknown): string | null => /\/releases\/download\/v?([^/]+)\//.exec(String(url ?? ''))?.[1] ?? null;

export function bundleComponents(json: any): BundleComponent[] {
  const out: BundleComponent[] = [];
  if (json?.PlatformVersion) out.push({ id: 'Platform', kind: 'platform', version: String(json.PlatformVersion) });
  const theme = themeVersionOf(json?.ThemeB2BVue);
  if (theme) out.push({ id: 'Theme', kind: 'theme', version: theme });
  for (const s of Array.isArray(json?.Sources) ? json.Sources : []) {
    for (const m of Array.isArray(s?.Modules) ? s.Modules : []) {
      if (m?.Id && m?.Version) out.push({ id: String(m.Id), kind: 'module', version: String(m.Version) });
    }
  }
  return out;
}

export function diffBundles(from: BundleComponent[], to: BundleComponent[], repoOf: (c: BundleComponent) => string | null): ComponentDiff[] {
  const key = (c: BundleComponent) => `${c.kind}:${c.id}`;
  const before = new Map(from.map((c) => [key(c), c]));
  const after = new Map(to.map((c) => [key(c), c]));
  const rows: ComponentDiff[] = [];
  for (const [k, t] of after) {
    const f = before.get(k);
    rows.push({ id: t.id, kind: t.kind, repo: repoOf(t), from: f?.version ?? null, to: t.version, status: !f ? 'ADDED' : f.version === t.version ? 'SAME' : 'CHANGED' });
  }
  for (const [k, f] of before) if (!after.has(k)) rows.push({ id: f.id, kind: f.kind, repo: repoOf(f), from: f.version, to: null, status: 'REMOVED' });
  const order = { platform: 0, theme: 1, module: 2 } as const;
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id));
}

const lineOf = (v: string) => v.split('.').slice(0, 2).join('.');

/** Release tags strictly above `from` and at most `to`, ascending. Drafts, prereleases and non-numeric tags are
 *  dropped, and so are later hotfixes on `from`'s own line (a support-line patch for the OLD bundle — the new line
 *  carries the same fix from dev, so listing both double-counts it). */
export function versionsInRange(releases: { tag_name?: string; draft?: boolean; prerelease?: boolean }[], from: string, to: string): { version: string; tag: string }[] {
  const out = new Map<string, string>();
  for (const r of releases) {
    if (r.draft || r.prerelease) continue;
    const tag = String(r.tag_name ?? '');
    const v = tag.replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(v)) continue;
    if (lineOf(v) === lineOf(from) && lineOf(v) !== lineOf(to)) continue;
    if (cmpVersion(v, from) > 0 && cmpVersion(v, to) <= 0 && !out.has(v)) out.set(v, tag);
  }
  return [...out].sort((a, b) => cmpVersion(a[0], b[0])).map(([version, tag]) => ({ version, tag }));
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx tsx --test scripts/unit/tmp-bundle-diff.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Delete the temporary test and commit**

```bash
rm scripts/unit/tmp-bundle-diff.test.ts
git add scripts/release/types.ts scripts/release/bundle-diff.ts
git commit -F - -- scripts/release/types.ts scripts/release/bundle-diff.ts <<'EOF'
feat(release): ReleaseScope contract + pure bundle diff

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Index `breaking_changes.md`

**Files:**
- Create: `scripts/release/breaking.ts`
- Test (temporary): `scripts/unit/tmp-breaking.test.ts`

**Interfaces:**
- Consumes: `JIRA_KEY_RE` (Task 1); `BreakingSection`, `BreakingRow` (Task 2)
- Produces: `parseBreaking(md: string, moduleIds: string[]): { sections: BreakingSection[]; rows: BreakingRow[] }`

The formats differ between stables (v15 is wave-shaped headings; v16 is numbered sections plus one module table), so the parser must not depend on heading wording.

- [ ] **Step 1: Write the temporary failing test**

```ts
// scripts/unit/tmp-breaking.test.ts — TEMPORARY, delete before commit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBreaking } from '../release/breaking.ts';

const md = `# Stable 16: Breaking changes

## 3. Removed expired obsolete members (VCST-5901)

text

## 4. Per-module changes from the Stable 16 release (VCST-6042)

| Module (version) | Compile-time changes | Runtime / behavior | Legacy stubs (VC0015) |
|---|---|---|---|
| CatalogPublishing 3.1007.0 | ctor gains \`IBackgroundJob\` | — | \`EvaluateCompletenessJob\` |
| Cart 3.1011.0 | — | recurring jobs: **skipped and logged** | — |
| WebHooks 3.1005.0 | internal | **the 5-second delivery delay is gone** | none |
| NotAModule 1.0.0 | x | y | z |

## Wave 3 — Store (\`3.1005.0\`)
`;

test('sections carry the tickets their heading names', () => {
  const r = parseBreaking(md, ['VirtoCommerce.Cart', 'VirtoCommerce.CatalogPublishing', 'VirtoCommerce.WebHooks', 'VirtoCommerce.Store']);
  assert.deepEqual(r.sections.map((s) => s.tickets), [['VCST-5901'], ['VCST-6042'], []]);
  assert.deepEqual(r.sections[2].modules, ['VirtoCommerce.Store']);
});

test('rows: longest module name wins, header cells keyed, unknown modules skipped', () => {
  const r = parseBreaking(md, ['VirtoCommerce.Cart', 'VirtoCommerce.CatalogPublishing', 'VirtoCommerce.Catalog', 'VirtoCommerce.WebHooks']);
  assert.deepEqual(r.rows.map((x) => `${x.module}@${x.version}`), ['VirtoCommerce.CatalogPublishing@3.1007.0', 'VirtoCommerce.Cart@3.1011.0', 'VirtoCommerce.WebHooks@3.1005.0']);
  assert.equal(r.rows[2].cells['Runtime / behavior'], '**the 5-second delivery delay is gone**');
  assert.equal(r.rows[0].section, '4. Per-module changes from the Stable 16 release (VCST-6042)');
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx tsx --test scripts/unit/tmp-breaking.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Write `scripts/release/breaking.ts`**

```ts
// scripts/release/breaking.ts — index a stable bundle's breaking_changes.md (pure). It INDEXES, never interprets:
// /qa-test-plan reads the file itself; this tells it which sections name which tickets and which module rows exist.
import { JIRA_KEY_RE } from '../lib/release-trace.ts';
import type { BreakingRow, BreakingSection } from './types.ts';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isSeparator = (line: string) => /^[\s|:-]+$/.test(line) && line.includes('---');
const keysIn = (s: string) => [...new Set([...s.matchAll(JIRA_KEY_RE)].map((m) => m[1]))];

export function parseBreaking(md: string, moduleIds: string[]): { sections: BreakingSection[]; rows: BreakingRow[] } {
  const short = new Map(moduleIds.map((id) => [id.replace(/^VirtoCommerce\./, ''), id]));
  // Longest first, so "CatalogPublishing" is tried before "Catalog".
  const names = [...short.keys()].sort((a, b) => b.length - a.length);
  const named = (text: string) => names.filter((n) => new RegExp(`(^|[^A-Za-z0-9])${esc(n)}([^A-Za-z0-9]|$)`).test(text)).map((n) => short.get(n)!);
  const sections: BreakingSection[] = [];
  const rows: BreakingRow[] = [];
  const lines = md.split(/\r?\n/);
  let current: BreakingSection | null = null;
  let header: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = { heading: h[1], tickets: keysIn(h[1]), modules: named(h[1]) };
      sections.push(current);
      header = null;
      continue;
    }
    if (!line.trim().startsWith('|')) { header = null; continue; }
    if (isSeparator(line)) continue;
    if (!header) { if (isSeparator(lines[i + 1] ?? '')) header = cells(line); continue; }
    if (!current) continue;
    const row = cells(line);
    const first = (row[0] ?? '').replace(/`/g, '');
    const name = names.find((n) => new RegExp(`^${esc(n)}(\\s|\\(|$)`).test(first));
    if (!name) continue;
    const module = short.get(name)!;
    rows.push({ section: current.heading, module, version: /(\d+\.\d+\.\d+)/.exec(first)?.[1] ?? null, cells: Object.fromEntries(header.map((k, j) => [k, row[j] ?? ''])) });
    if (!current.modules.includes(module)) current.modules.push(module);
  }
  return { sections, rows };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx tsx --test scripts/unit/tmp-breaking.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Delete the temporary test and commit**

```bash
rm scripts/unit/tmp-breaking.test.ts
git add scripts/release/breaking.ts
git commit -F - -- scripts/release/breaking.ts <<'EOF'
feat(release): index a bundle's breaking_changes.md (sections, tickets, module rows)

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Classify PRs and look up tickets

**Files:**
- Create: `scripts/release/classify.ts`
- Test (temporary): `scripts/unit/tmp-classify.test.ts`

**Interfaces:**
- Consumes: `PrClass`, `ScopePr`, `TicketInfo` (Task 2)
- Produces:
  - `projectOf(key): string`
  - `detectCycleTickets(prs: {repo, taskKeys}[], changedRepos: number, headingTickets: string[], explicit: string[], minShare = 0.25): string[]`
  - `classifyPr(taskKeys, cycle: ReadonlySet<string>, projects: ReadonlySet<string> | null): PrClass`
  - `ticketFromIssue(issue): TicketInfo`
  - `lookupTickets(keys, search: (jql) => Promise<{key, fields}[]>, chunk = 50): Promise<TicketInfo[]>`

- [ ] **Step 1: Write the temporary failing test**

```ts
// scripts/unit/tmp-classify.test.ts — TEMPORARY, delete before commit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPr, detectCycleTickets, lookupTickets } from '../release/classify.ts';

test('cycle = heading tickets ∪ --cycle ∪ keys spread over ≥ minShare of changed repos (and >1 repo)', () => {
  const prs = [
    { repo: 'a', taskKeys: ['VCST-6042'] }, { repo: 'b', taskKeys: ['VCST-6042'] }, { repo: 'c', taskKeys: ['VCST-6042', 'VCST-1'] },
    { repo: 'd', taskKeys: ['VCST-2'] },
  ];
  assert.deepEqual(detectCycleTickets(prs, 4, ['VCST-5901'], ['VCST-9']), ['VCST-5901', 'VCST-6042', 'VCST-9']);
});

test('class: a feature key dominates; only cycle keys = cycle; foreign/no keys = untracked', () => {
  const cycle = new Set(['VCST-6042']);
  const projects = new Set(['VCST']);
  assert.equal(classifyPr(['VCST-6042', 'VCST-5'], cycle, projects), 'feature');
  assert.equal(classifyPr(['VCST-6042'], cycle, projects), 'cycle');
  assert.equal(classifyPr(['VP-9216'], cycle, projects), 'untracked');
  assert.equal(classifyPr([], cycle, null), 'untracked');
});

test('a key Jira rejects is isolated by bisection; its neighbours still resolve', async () => {
  const calls: string[] = [];
  const search = async (jql: string) => {
    calls.push(jql);
    if (jql.includes('VCST-404')) throw new Error('Jira 400: An issue with key VCST-404 does not exist');
    return [...jql.matchAll(/VCST-\d+/g)].map((m) => ({ key: m[0], fields: { summary: 's', issuetype: { name: 'Story' }, status: { name: 'Done', statusCategory: { key: 'done' } } } }));
  };
  const out = await lookupTickets(['VCST-1', 'VCST-404', 'VCST-3'], search, 50);
  assert.deepEqual(out.map((t) => `${t.key}:${t.done}`), ['VCST-1:true', 'VCST-3:true', 'VCST-404:null']);
});

test('missing credentials stop the lookup instead of bisecting', async () => {
  let n = 0;
  const search = async () => { n++; throw new Error('no Jira credentials (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env.local)'); };
  await assert.rejects(lookupTickets(['VCST-1', 'VCST-2', 'VCST-3', 'VCST-4'], search), /credentials/);
  assert.equal(n, 1);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx tsx --test scripts/unit/tmp-classify.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Write `scripts/release/classify.ts`**

```ts
// scripts/release/classify.ts — which PRs belong to the release cycle itself, and which tickets were Done (pure + injected search).
import type { PrClass, ScopePr, TicketInfo } from './types.ts';

export const projectOf = (key: string) => key.slice(0, key.lastIndexOf('-'));

/** The cycle's own tickets: named in a breaking_changes.md heading, passed with --cycle, or spread over at least
 *  `minShare` of the changed repos (a cycle ticket lands in nearly every repo; a feature lands in one or two). */
export function detectCycleTickets(prs: Pick<ScopePr, 'repo' | 'taskKeys'>[], changedRepos: number, headingTickets: string[], explicit: string[], minShare = 0.25): string[] {
  const repos = new Map<string, Set<string>>();
  for (const p of prs) for (const k of p.taskKeys) { if (!repos.has(k)) repos.set(k, new Set()); repos.get(k)!.add(p.repo); }
  const out = new Set([...headingTickets, ...explicit]);
  if (changedRepos > 0) for (const [k, rs] of repos) if (rs.size > 1 && rs.size / changedRepos >= minShare) out.add(k);
  return [...out].sort();
}

/** A feature key dominates: a PR that carries a product ticket carries behaviour, whatever else it touches. */
export function classifyPr(taskKeys: string[], cycle: ReadonlySet<string>, projects: ReadonlySet<string> | null): PrClass {
  const tracked = projects ? taskKeys.filter((k) => projects.has(projectOf(k))) : taskKeys;
  if (tracked.some((k) => !cycle.has(k))) return 'feature';
  return tracked.length ? 'cycle' : 'untracked';
}

/** done=true when Jira's status CATEGORY is done (status names differ per workflow; the category does not). */
export function ticketFromIssue(issue: { key: string; fields: Record<string, any> }): TicketInfo {
  const f = issue.fields;
  return { key: issue.key, summary: f.summary ?? null, type: f.issuetype?.name ?? null, status: f.status?.name ?? null, done: f.status?.statusCategory ? f.status.statusCategory.key === 'done' : null };
}

const unknown = (key: string): TicketInfo => ({ key, summary: null, type: null, status: null, done: null });

/** Chunked `key in (…)` lookups. Jira rejects a whole query when one key does not exist, so a rejected chunk is
 *  halved until the bad key stands alone and is reported unknown. Auth/credential errors are rethrown at once. */
export async function lookupTickets(keys: string[], search: (jql: string) => Promise<{ key: string; fields: Record<string, any> }[]>, chunk = 50): Promise<TicketInfo[]> {
  const out: TicketInfo[] = [];
  async function run(batch: string[]): Promise<void> {
    if (!batch.length) return;
    try {
      const found = await search(`key in (${batch.join(',')})`);
      const got = new Set(found.map((i) => i.key));
      out.push(...found.map(ticketFromIssue), ...batch.filter((k) => !got.has(k)).map(unknown));
    } catch (e) {
      if (/credentials|Jira 40[13]/.test(String((e as Error).message))) throw e;
      if (batch.length === 1) { out.push(unknown(batch[0])); return; }
      const mid = Math.ceil(batch.length / 2);
      await run(batch.slice(0, mid));
      await run(batch.slice(mid));
    }
  }
  for (let i = 0; i < keys.length; i += chunk) await run(keys.slice(i, i + chunk));
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx tsx --test scripts/unit/tmp-classify.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Delete the temporary test and commit**

```bash
rm scripts/unit/tmp-classify.test.ts
git add scripts/release/classify.ts
git commit -F - -- scripts/release/classify.ts <<'EOF'
feat(release): classify release PRs (cycle/feature/untracked) + bisecting Jira lookup

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Assemble the scope + CLI `npm run release:scope`

**Files:**
- Create: `scripts/release/scope.ts`, `scripts/release/release-scope.ts`
- Modify: `package.json` (add `"release:scope": "npx tsx scripts/release/release-scope.ts",` next to `"bundle:check"`)
- Test (temporary): `scripts/unit/tmp-scope.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `GhReader`, `mapPool`, `traceVersionBump`
  - Task 2: `bundleComponents`, `diffBundles`, `versionsInRange`
  - Task 3: `parseBreaking`
  - Task 4: `classifyPr`, `detectCycleTickets`, `lookupTickets`, `projectOf`
  - `DEFAULT_FEED_URL`, `latestRelease`, `FeedEntry` from `scripts/deploy/upgrade/feed.ts`
  - `cmpVersion` from `scripts/deploy/upgrade/versions.ts`
  - `loadEnvFiles` from `scripts/deploy/lib/env.ts`
  - `jiraSearch` from `scripts/lib/jira-search.ts`
- Produces:
  - `previousStable(stableJson, to): string|null`, `latestStable(stableJson): string|null`
  - `buildScope(opts: ScopeOptions, deps: ScopeDeps): Promise<ReleaseScope>`
  - `renderSummary(scope): string`
  - CLI: `release:scope <vN|next> [--ref=…] [--from=vN] [--cycle=K,K] [--no-jira] [--no-trace] [--concurrency=N] [--out=file] [--json]`

- [ ] **Step 1: Write the temporary failing test** (fake GitHub; asserts Review Focus #1, ref threading)

```ts
// scripts/unit/tmp-scope.test.ts — TEMPORARY, delete before commit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScope, previousStable } from '../release/scope.ts';
import type { GhReader } from '../lib/release-trace.ts';

test('previousStable picks the highest numeric key below the target', () => {
  assert.equal(previousStable({ '12': 'x', '14': 'x', '15': 'x', latest: 'x' }, 'v16'), 'v15');
  assert.equal(previousStable({ '15': 'x' }, 'v15'), null);
});

test('target bundle + breaking_changes are read at --ref; the previous bundle at master', async () => {
  const reads: string[] = [];
  const files: Record<string, string> = {
    'bundles/stable.json@master': JSON.stringify({ '15': 'u' }),
    'bundles/v15/package.json@master': JSON.stringify({ PlatformVersion: '1.0.0', Sources: [{ Name: 'GithubReleases', Modules: [{ Id: 'VirtoCommerce.Cart', Version: '3.1.0' }] }] }),
    'bundles/v16/package.json@br': JSON.stringify({ PlatformVersion: '1.0.0', Sources: [{ Name: 'GithubReleases', Modules: [{ Id: 'VirtoCommerce.Cart', Version: '3.2.0' }] }] }),
    'bundles/v16/breaking_changes.md@br': '## 4. Per-module (VCST-6042)\n',
  };
  const gh: GhReader = {
    hasToken: true,
    async file(_repo, path, ref) { reads.push(`${path}@${ref}`); return files[`${path}@${ref}`] ?? null; },
    async all() { return [{ tag_name: '3.2.0' }]; },
    async json(p) {
      if (p.includes('/releases/tags/')) return { body: '* thing (#7)', published_at: null, html_url: null };
      if (p.includes('/pulls/7')) return { title: 'VCST-1: thing', head: { ref: 'x' }, body: '', html_url: 'u' };
      return null;
    },
  };
  const s = await buildScope(
    { to: 'v16', ref: 'br', cycle: [], projects: ['VCST'], trace: true, concurrency: 2, jiraBase: 'https://j', repoRoot: process.cwd(), now: new Date(0) },
    { gh, getJson: async () => [], search: async () => [{ key: 'VCST-1', fields: { summary: 's', issuetype: { name: 'Story' }, status: { name: 'Open', statusCategory: { key: 'new' } } } }] },
  );
  assert.ok(reads.includes('bundles/v16/package.json@br'));
  assert.ok(reads.includes('bundles/v16/breaking_changes.md@br'));
  assert.ok(reads.includes('bundles/v15/package.json@master'));
  assert.deepEqual(s.cycleTickets, ['VCST-6042']);
  assert.deepEqual(s.prs.map((p) => `${p.number}:${p.class}`), ['7:feature']);
  assert.deepEqual(s.tickets.map((t) => `${t.key}:${t.done}`), ['VCST-1:false']);
  assert.equal(s.counts.ticketsOpen, 1);
});
```

Note: `repoRoot: process.cwd()` makes `buildScope` read the real `config/module-repo-map.json`, which maps `VirtoCommerce.Cart`. Run the test from the repo root.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx tsx --test scripts/unit/tmp-scope.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Write `scripts/release/scope.ts`**

```ts
// scripts/release/scope.ts — assemble a ReleaseScope from vc-modules + GitHub releases (+ Jira). Network, read-only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GhReader } from '../lib/release-trace.ts';
import { OWNER, mapPool, traceVersionBump } from '../lib/release-trace.ts';
import { DEFAULT_FEED_URL, latestRelease } from '../deploy/upgrade/feed.ts';
import type { FeedEntry } from '../deploy/upgrade/feed.ts';
import { cmpVersion } from '../deploy/upgrade/versions.ts';
import { bundleComponents, diffBundles, versionsInRange } from './bundle-diff.ts';
import { parseBreaking } from './breaking.ts';
import { classifyPr, detectCycleTickets, lookupTickets, projectOf } from './classify.ts';
import type { BundleComponent, ReleaseScope, ScopePr, TicketInfo } from './types.ts';

export const MODULES_REPO = 'vc-modules';

export interface ScopeOptions {
  to: string;                 // "v16", or "next" (forecast: latest stable → latest releases)
  from?: string;              // default: previous numeric key of bundles/stable.json (next: the latest one)
  ref: string;                // vc-modules ref the TARGET bundle is read at (a stable under review lives on its PR branch)
  cycle: string[];            // extra cycle tickets (--cycle)
  projects: string[] | null;  // tracked Jira projects (JIRA_PROJECT_KEY); null = every key counts
  trace: boolean;
  concurrency: number;
  jiraBase: string;
  repoRoot: string;
  now: Date;
}
export interface ScopeDeps {
  gh: GhReader;
  getJson(url: string): Promise<any | null>;
  search: ((jql: string) => Promise<{ key: string; fields: Record<string, any> }[]>) | null; // null = --no-jira
}

const numericKeys = (j: Record<string, unknown>) => Object.keys(j).filter((k) => /^\d+$/.test(k)).map(Number);
export function previousStable(stableJson: Record<string, unknown>, to: string): string | null {
  const n = Number(/^v?(\d+)$/.exec(to)?.[1] ?? NaN);
  const prior = numericKeys(stableJson).filter((k) => k < n).sort((a, b) => b - a);
  return prior.length ? `v${prior[0]}` : null;
}
export function latestStable(stableJson: Record<string, unknown>): string | null {
  const keys = numericKeys(stableJson).sort((a, b) => b - a);
  return keys.length ? `v${keys[0]}` : null;
}

async function readBundle(gh: GhReader, name: string, ref: string): Promise<any> {
  const text = await gh.file(MODULES_REPO, `bundles/${name}/package.json`, ref);
  if (text == null) throw new Error(`bundles/${name}/package.json not found in ${OWNER}/${MODULES_REPO}@${ref}`);
  return JSON.parse(text);
}

export async function buildScope(opts: ScopeOptions, deps: ScopeDeps): Promise<ReleaseScope> {
  const notes: string[] = [];
  const next = opts.to === 'next';
  // The list of SHIPPED stables lives on master; a stable under review is not in it yet.
  const stableJson = JSON.parse((await deps.gh.file(MODULES_REPO, 'bundles/stable.json', 'master')) ?? '{}');
  const fromName = opts.from ?? (next ? latestStable(stableJson) : previousStable(stableJson, opts.to));
  if (!fromName) throw new Error(`no stable before ${opts.to} in bundles/stable.json — pass --from=vN`);
  const fromJson = await readBundle(deps.gh, fromName, 'master');

  const feedArr = await deps.getJson(DEFAULT_FEED_URL);
  const feed = new Map<string, FeedEntry>((Array.isArray(feedArr) ? feedArr : []).map((e: FeedEntry) => [e.Id, e]));
  if (!feed.size) notes.push('module feed unreadable — repos come from config/module-repo-map.json only');
  const map = JSON.parse(readFileSync(resolve(opts.repoRoot, 'config/module-repo-map.json'), 'utf8')) as { platformRepo: string; themeRepo: string; modules: Record<string, string> };
  const bare = (r: string) => r.replace(/^[^/]+\//, '');
  const repoOf = (c: BundleComponent): string | null =>
    c.kind === 'platform' ? bare(map.platformRepo)
      : c.kind === 'theme' ? bare(map.themeRepo)
        : map.modules[c.id] ? bare(map.modules[c.id])
          : /github\.com\/[^/]+\/([^/#?]+)/.exec(feed.get(c.id)?.ProjectUrl ?? '')?.[1] ?? null;

  const fromComponents = bundleComponents(fromJson);
  let toComponents: BundleComponent[];
  if (next) {
    toComponents = [];
    for (const c of fromComponents) {
      if (c.kind === 'module') {
        const v = feed.has(c.id) ? latestRelease(feed.get(c.id)!)?.Version : undefined;
        if (!v) notes.push(`${c.id}: no release in the module feed — kept at ${c.version}`);
        toComponents.push({ ...c, version: v ?? c.version });
      } else {
        const rel = await deps.gh.json(`/repos/${OWNER}/${repoOf(c)}/releases/latest`);
        toComponents.push({ ...c, version: String(rel?.tag_name ?? c.version).replace(/^v/, '') });
      }
    }
  } else {
    toComponents = bundleComponents(await readBundle(deps.gh, opts.to, opts.ref));
  }
  const components = diffBundles(fromComponents, toComponents, repoOf);
  for (const c of components) if (c.status !== 'SAME' && !c.repo) notes.push(`${c.id}: repo unresolved — its PRs are not traced`);

  const raw: ScopePr[] = [];
  if (opts.trace) {
    const changed = components.filter((c) => c.status === 'CHANGED' && c.repo);
    await mapPool(changed, opts.concurrency, async (c) => {
      const range = versionsInRange(await deps.gh.all(`/repos/${OWNER}/${c.repo}/releases`), c.from!, c.to!);
      if (!range.length) notes.push(`${c.id}: no release between ${c.from} and ${c.to}${cmpVersion(c.to!, c.from!) < 0 ? ' (DOWNGRADE)' : ''}`);
      let prev = c.from!;
      for (const r of range) {
        const t = await traceVersionBump(deps.gh, c.repo!, r.tag, prev, opts.jiraBase);
        prev = r.tag;
        for (const p of t.prs) raw.push({ component: c.id, repo: c.repo!, version: r.version, number: p.number, title: p.title, url: p.url, taskKeys: p.taskKeys, class: 'untracked' });
      }
    });
  } else notes.push('--no-trace: PRs and tickets were not traced');
  const seen = new Set<string>();
  const prs = raw
    .sort((a, b) => a.repo.localeCompare(b.repo) || cmpVersion(a.version, b.version) || a.number - b.number)
    .filter((p) => { const k = `${p.repo}#${p.number}`; if (seen.has(k)) return false; seen.add(k); return true; });

  let breaking: ReleaseScope['breaking'] = null;
  if (!next) {
    const md = await deps.gh.file(MODULES_REPO, `bundles/${opts.to}/breaking_changes.md`, opts.ref);
    if (md) breaking = parseBreaking(md, components.filter((c) => c.kind === 'module').map((c) => c.id));
    else notes.push(`no bundles/${opts.to}/breaking_changes.md at ${opts.ref}`);
  }

  const projects = opts.projects ? new Set(opts.projects) : null;
  if (!projects) notes.push('JIRA_PROJECT_KEY unset — every PROJ-123-shaped token counts as a ticket');
  const cycleTickets = detectCycleTickets(prs, new Set(prs.map((p) => p.repo)).size, breaking ? breaking.sections.flatMap((s) => s.tickets) : [], opts.cycle);
  const cycle = new Set(cycleTickets);
  for (const p of prs) p.class = classifyPr(p.taskKeys, cycle, projects);

  const featureKeys = [...new Set(prs.filter((p) => p.class === 'feature').flatMap((p) => p.taskKeys)
    .filter((k) => !cycle.has(k) && (!projects || projects.has(projectOf(k)))))].sort();
  let tickets: TicketInfo[] = featureKeys.map((key) => ({ key, summary: null, type: null, status: null, done: null }));
  if (!deps.search) notes.push('--no-jira: ticket status unknown');
  else if (featureKeys.length) {
    try { tickets = await lookupTickets(featureKeys, deps.search); } catch (e) { notes.push(`Jira lookup skipped: ${(e as Error).message}`); }
  }

  const n = (s: string) => components.filter((c) => c.status === s).length;
  const ver = (cs: BundleComponent[], kind: string) => cs.find((c) => c.kind === kind)?.version ?? null;
  return {
    schema: 1,
    mode: next ? 'next' : 'stable',
    generatedAt: opts.now.toISOString(),
    from: { bundle: fromName, platform: ver(fromComponents, 'platform'), theme: ver(fromComponents, 'theme') },
    to: { bundle: next ? 'next' : opts.to, ref: next ? 'latest releases' : opts.ref, platform: ver(toComponents, 'platform'), theme: ver(toComponents, 'theme') },
    counts: {
      changed: n('CHANGED'), added: n('ADDED'), removed: n('REMOVED'), same: n('SAME'), prs: prs.length,
      cycle: prs.filter((p) => p.class === 'cycle').length, feature: prs.filter((p) => p.class === 'feature').length, untracked: prs.filter((p) => p.class === 'untracked').length,
      ticketsDone: tickets.filter((t) => t.done === true).length, ticketsOpen: tickets.filter((t) => t.done === false).length, ticketsUnknown: tickets.filter((t) => t.done === null).length,
    },
    components, prs, cycleTickets, tickets, breaking, notes,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx tsx --test scripts/unit/tmp-scope.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the CLI `scripts/release/release-scope.ts`**

```ts
#!/usr/bin/env node
/**
 * release-scope — what a Virto Commerce stable bundle carries, as data. Feeds /qa-test-plan stable.
 *
 *   npm run release:scope -- v16 --ref=feat/VCST-6042-stable-16-bundle --out="vc/shared/docs/Release plans/stable-16-scope.json"
 *   npm run release:scope -- next --out=<file>          # forecast: the latest stable → the latest releases
 *
 * Flags: --ref=<vc-modules ref> (default master; the TARGET bundle only — the previous one is a shipped stable on master)
 *        --from=vN (default: the previous numeric key of bundles/stable.json) · --cycle=KEY[,KEY] (extra cycle tickets)
 *        --no-jira · --no-trace · --concurrency=N (default 8) · --out=<file> · --json (print the scope instead of the summary)
 * Env:   GIT_TOKEN (.env.local) · JIRA_PROJECT_KEY + JIRA_BASE_URL (.env.<TEST_ENV>, default vcst) · JIRA_EMAIL + JIRA_API_TOKEN (.env.local)
 * Exit:  0 scope built · 2 bad usage or a read failed (token, rate limit, missing bundle) — nothing written.
 *
 * It never decides what to TEST — /qa-test-plan does. It answers, deterministically: what changed, which
 * PRs and tickets carried the change, which of those were the release cycle's own, and which tickets Jira has Done.
 */
import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFiles } from '../deploy/lib/env.ts';
import { loadGitToken, makeGhReader } from '../lib/release-trace.ts';
import { buildScope } from './scope.ts';
import type { ReleaseScope } from './types.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const USAGE = 'Usage: npm run release:scope -- <vN|next> [--ref=<branch>] [--from=vN] [--cycle=K,K] [--no-jira] [--no-trace] [--concurrency=N] [--out=<file>] [--json]';

export function renderSummary(s: ReleaseScope): string {
  const c = s.counts;
  const lines = [
    `${s.mode === 'next' ? 'Forecast' : 'Stable'} ${s.from.bundle} → ${s.to.bundle} (${s.to.ref}) · platform ${s.from.platform} → ${s.to.platform} · theme ${s.from.theme} → ${s.to.theme}`,
    `components: ${c.changed} changed · ${c.added} added · ${c.removed} removed · ${c.same} same`,
    `PRs: ${c.prs} (${c.cycle} cycle · ${c.feature} feature · ${c.untracked} untracked) · cycle tickets: ${s.cycleTickets.join(', ') || 'none'}`,
    `feature tickets: ${c.ticketsDone} done · ${c.ticketsOpen} NOT done · ${c.ticketsUnknown} unknown`,
  ];
  const added = s.components.filter((x) => x.status === 'ADDED').map((x) => x.id);
  if (added.length) lines.push(`added: ${added.join(', ')}`);
  const open = s.tickets.filter((t) => t.done === false).map((t) => `${t.key} (${t.status})`);
  if (open.length) lines.push(`NOT done: ${open.join(', ')}`);
  if (s.breaking) lines.push(`breaking_changes.md: ${s.breaking.sections.length} sections · ${s.breaking.rows.length} module rows`);
  for (const n of s.notes) lines.push(`note: ${n}`);
  return lines.join('\n');
}

async function main(argv: string[]): Promise<number> {
  const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const target = argv.find((a) => !a.startsWith('--'));
  if (!target || !(target === 'next' || /^v\d+$/.test(target))) { console.error(USAGE); return 2; }
  loadEnvFiles(process.env.TEST_ENV || 'vcst');
  const token = loadGitToken(REPO_ROOT);
  if (!token) console.error('[release-scope] no GIT_TOKEN — 60 req/h; a stable diff needs several hundred calls');
  let search: ((jql: string) => Promise<{ key: string; fields: Record<string, any> }[]>) | null = null;
  if (!argv.includes('--no-jira')) {
    const { jiraSearch } = await import('../lib/jira-search.ts');
    search = (jql) => jiraSearch(jql, ['summary', 'issuetype', 'status']);
  }
  const projects = (process.env.JIRA_PROJECT_KEY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let scope: ReleaseScope;
  try {
    scope = await buildScope({
      to: target, from: flag('from'), ref: flag('ref') || 'master',
      cycle: (flag('cycle') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      projects: projects.length ? projects : null, trace: !argv.includes('--no-trace'),
      concurrency: Math.max(1, Number(flag('concurrency')) || 8),
      jiraBase: (process.env.JIRA_BASE_URL || 'https://virtocommerce.atlassian.net').replace(/\/$/, ''),
      repoRoot: REPO_ROOT, now: new Date(),
    }, { gh: makeGhReader(token, 'vc-release-scope'), getJson: async (u) => { const r = await fetch(u); return r.ok ? r.json() : null; }, search });
  } catch (e) {
    console.error(`[release-scope] ${(e as Error).message}`);
    return 2;
  }
  const out = flag('out');
  if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify(scope, null, 2) + '\n'); }
  console.log(argv.includes('--json') ? JSON.stringify(scope, null, 2) : `${renderSummary(scope)}${out ? `\n→ ${out}` : ''}`);
  return 0;
}

const isMain = (() => { try { return !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]); } catch { return false; } })();
if (isMain) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
```

Note: the `'https://virtocommerce.atlassian.net'` fallback matches the existing default in `bundle-version-check.ts` (`JIRA_BASE`). It is used only when `JIRA_BASE_URL` is unset.

- [ ] **Step 6: Add the npm script**

In `package.json`, add this line directly after `"bundle:check": …,`:

```json
    "release:scope": "npx tsx scripts/release/release-scope.ts",
```

- [ ] **Step 7: Live run against Stable 16 (read-only)**

```bash
npm run release:scope -- v16 --ref=feat/VCST-6042-stable-16-bundle --out="$TEMP/stable-16-scope.json"; echo "exit=$?"
```
Expected:
- exit 0.
- The summary shows platform `3.1039.12 → 3.1076.0` and theme `2.51.1 → 2.58.0`.
- Added includes `VirtoCommerce.BackgroundJobs`, `VirtoCommerce.OpenTelemetry`, `VirtoCommerce.UCP`, `VirtoCommerce.WhiteLabeling`, `VirtoCommerce.XPickup`.
- The cycle tickets include `VCST-6042` and `VCST-5901`.
- If a module shows `repo unresolved`, add it to `config/module-repo-map.json` (the map is a cache; see `qa-bundle-check` §Maintenance) and re-run.

```bash
npm run release:scope -- next --no-trace --no-jira; echo "exit=$?"
```
Expected: exit 0, `Forecast v15 → next (latest releases)`.

- [ ] **Step 8: Delete the temporary test and commit**

```bash
rm scripts/unit/tmp-scope.test.ts
git add scripts/release/scope.ts scripts/release/release-scope.ts package.json
git commit -F - -- scripts/release/scope.ts scripts/release/release-scope.ts package.json <<'EOF'
feat(release): npm run release:scope — stable bundle diff → PRs → tickets, as data

Diffs bundles/v{N-1} → vN in vc-modules (target read at --ref, since a stable under review lives on
its PR branch), traces every release in each version range to its PRs and tracker keys, separates the
release cycle's own tickets from feature tickets, and asks Jira which feature tickets are Done.
`next` forecasts the latest stable → the latest releases.

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5b: `npm run release:cases`: every feature in the release → suites + cases, Critical/High first

**Why:** the user wants to run regression for **all** features in the stable, not only the untested ones, as a list of related suites *and* cases in priority order. Agreed 2026-10-05, option C:

| Wave | Content |
|---|---|
| **W1** | Critical cases of every related suite |
| **W2** | High cases of every related suite |
| **W3** | The release's own *direct* cases that are not Critical/High (Medium, Low, or an unreadable Priority), so no feature's own test is dropped |

Medium/Low cases of suites related only by module are reported, not run.

A suite is **related** for one of three reasons:

| Relation | Meaning |
|---|---|
| `direct` | One of its rows cites a feature ticket of the release |
| `module` | `regression:select` picked it for a changed component repo with reason `change`/`widened` |
| `floor` | Reason `risk-floor` (P0 / critical-ui-scope; a stable must not break those) |

`history`/`rotation` picks are ignored: they are about the corpus, not the release. A feature ticket with **zero** direct cases is a coverage gap → §5.2.

**Files:**
- Create: `scripts/release/release-cases.ts` (pure core + CLI)
- Modify: `scripts/regression/filter-cases.ts`. Export a `tierOf` lookup over its existing `TIER_OF` map, so the Critical/P0 alias table stays single-sourced.
- Modify: `package.json` (`"release:cases": "npx tsx scripts/release/release-cases.ts",` after `release:scope`)
- Test (temporary): `scripts/unit/tmp-release-cases.test.ts`

**Interfaces:**
- Consumes:
  - `ReleaseScope` (Task 2) and `JIRA_KEY_RE` (Task 1)
  - `parseSuite(text)`, `isCanonicalHeader(rawText)` from `scripts/test-cases/append-test-cases-to-suite.js`
  - the `select-suites.ts --json` output shape (`selected[].id`, `selected[].reasons[].kind`, `widened`)
  - `config/test-suites.json` `suites[]` (`id`, `name`, `file`, `layer`, `priority`)
- Produces:
  - `Tier`, `Why`, `ManifestSuite`, `SuiteRows`, `CaseRef`, `SuiteRef`, `TicketCoverage`, `ReleaseCases`
  - `relatedBySelection(scope, run: (repo, path) => any): { related: Map<string, Set<Why>>; notes: string[] }`
  - `buildReleaseCases(release, suites: SuiteRows[], related, tickets, now): ReleaseCases`
  - CLI `release:cases --scope=<scope.json> [--out=<file>] [--json] [--no-select]`

- [ ] **Step 1: Export the tier lookup from `scripts/regression/filter-cases.ts`**

Directly after the `for (const [tier, spellings] of Object.entries(TIER_ALIASES)) {…}` block that fills `TIER_OF`, add:

```ts
/** The tier a raw Priority cell answers to (`Critical`/`P0` → `critical`, …), or undefined. Shared with release:cases. */
export function tierOf(raw: string): string | undefined {
  return TIER_OF.get(raw.trim().toLowerCase());
}
```

`filter-cases.ts` runs its CLI only when it is the entry script (`isCli` guard), so importing it is safe.

- [ ] **Step 2: Write the temporary failing test**

```ts
// scripts/unit/tmp-release-cases.test.ts — TEMPORARY, delete before commit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReleaseCases, relatedBySelection } from '../release/release-cases.ts';

const suite = (id: string, priority = 'P1') => ({ id, name: `S${id}`, file: `x/${id}.csv`, layer: 'frontend', priority });
const row = (id: string, priority: string, text = '') => ({ id, priority, text });

test('direct rows by ticket key; Critical/High waves over all related suites; W3 = direct non-Critical/High', () => {
  const suites = [
    { suite: suite('010', 'P0'), rows: [row('A-1', 'Critical'), row('A-2', 'High', 'VCST-1 AC2'), row('A-3', 'Medium', 'see VCST-1'), row('A-4', 'Low')] },
    { suite: suite('020'), rows: [row('B-1', 'High'), row('B-2', 'Medium')] },
    { suite: suite('030'), rows: [row('C-1', 'Critical', 'VCST-2'), row('C-2', 'Low', 'VCST-2'), row('C-3', 'oops', 'VCST-2')] },
    { suite: suite('040'), rows: [row('D-1', 'Critical')] },                                  // unrelated: no ticket, no selection
  ];
  const related = new Map([['020', new Set(['module' as const])], ['010', new Set(['floor' as const])]]);
  const tickets = [{ key: 'VCST-1', done: true }, { key: 'VCST-2', done: false }, { key: 'VCST-3', done: false }];
  const r = buildReleaseCases('Stable16', suites, related, tickets, new Date(0));
  assert.deepEqual(r.suites.map((s) => `${s.id}:${s.why.join('+')}`), ['030:direct', '010:direct+floor', '020:module']);
  assert.deepEqual(r.waves.critical, { suites: ['030', '010'], cases: 2 });
  assert.deepEqual(r.waves.high, { suites: ['010', '020'], cases: 2 });
  assert.deepEqual(r.waves.directRest, { suites: ['030', '010'], ids: ['C-2', 'C-3', 'A-3'] }); // run order = suite rank
  assert.deepEqual(r.tickets.map((t) => `${t.key}:${t.cases.join(',')}`), ['VCST-1:A-2,A-3', 'VCST-2:C-1,C-2,C-3', 'VCST-3:']);
  assert.ok(r.notes.some((n) => n.startsWith('030: 1 case(s) with an unreadable Priority')));
});

test('selection: change/widened → module, risk-floor → floor, history/rotation ignored; a failing repo is noted, not fatal', () => {
  const scope: any = { components: [
    { id: 'VirtoCommerce.Cart', kind: 'module', repo: 'vc-module-cart', status: 'CHANGED' },
    { id: 'Theme', kind: 'theme', repo: 'vc-frontend', status: 'CHANGED' },
    { id: 'VirtoCommerce.Same', kind: 'module', repo: 'vc-module-same', status: 'SAME' },
    { id: 'VirtoCommerce.Boom', kind: 'module', repo: 'vc-module-boom', status: 'ADDED' },
  ] };
  const calls: string[] = [];
  const run = (repo: string, path: string) => {
    calls.push(`${repo}:${path}`);
    if (repo === 'vc-module-boom') throw new Error('exit 2');
    return { widened: repo === 'vc-frontend', selected: [
      { id: '028', reasons: [{ kind: 'change' }] }, { id: '001', reasons: [{ kind: 'rotation' }] },
      { id: '011', reasons: [{ kind: 'risk-floor' }, { kind: 'history' }] }] };
  };
  const { related, notes } = relatedBySelection(scope, run);
  assert.deepEqual(calls, ['vc-module-cart:Cart', 'vc-frontend:client-app', 'vc-module-boom:Boom']);
  assert.deepEqual([...related].map(([id, w]) => `${id}:${[...w].join('+')}`).sort(), ['011:floor', '028:module']);
  assert.ok(notes.some((n) => n.startsWith('Theme: nothing mapped')));
  assert.ok(notes.some((n) => n.startsWith('VirtoCommerce.Boom: regression:select failed')));
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx tsx --test scripts/unit/tmp-release-cases.test.ts`
Expected: FAIL, module not found

- [ ] **Step 4: Write `scripts/release/release-cases.ts`**

```ts
#!/usr/bin/env node
/**
 * release-cases — every feature in a stable release → the regression suites and cases that cover it, in run order.
 *
 *   npm run release:cases -- --scope="vc/shared/docs/Release plans/stable-16-scope.json" --out="vc/shared/docs/Release plans/stable-16-cases.json"
 *
 * Related suites: `direct` (a row cites a release feature ticket) · `module` (regression:select picked it for a changed
 * component repo, reason change/widened) · `floor` (reason risk-floor). history/rotation picks are about the corpus,
 * not the release, so they are ignored.
 * Waves (agreed 2026-10-05, VCST-6177): W1 Critical of every related suite → W2 High → W3 the direct cases that are
 * neither (Medium/Low/unreadable), so no feature's own test is dropped. A feature ticket with no direct case is a gap.
 * Flags: --no-select (direct only; skips the per-repo selector calls). Exit: 0 ok · 2 bad input.
 */
import '../lib/sync-stdio.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JIRA_KEY_RE } from '../lib/release-trace.ts';
import { tierOf } from '../regression/filter-cases.ts';
import { isCanonicalHeader, parseSuite } from '../test-cases/append-test-cases-to-suite.js';
import type { ReleaseScope } from './types.ts';

export type Tier = 'critical' | 'high' | 'medium' | 'low';
export type Why = 'direct' | 'module' | 'floor';
export interface ManifestSuite { id: string; name: string; file: string; layer: string; priority: string }
export interface SuiteRows { suite: ManifestSuite; rows: { id: string; priority: string; text: string }[] }
export interface CaseRef { id: string; suite: string; tier: Tier | null; tickets: string[] }
export interface SuiteRef { id: string; name: string; layer: string; suitePriority: string; why: Why[]; counts: Record<Tier, number>; direct: Record<Tier, number> }
export interface TicketCoverage { key: string; done: boolean | null; cases: string[] }
export interface ReleaseCases {
  schema: 1; release: string; generatedAt: string;
  suites: SuiteRef[];
  waves: { critical: { suites: string[]; cases: number }; high: { suites: string[]; cases: number }; directRest: { suites: string[]; ids: string[] } };
  directCases: CaseRef[];
  tickets: TicketCoverage[];
  notes: string[];
}

const zero = (): Record<Tier, number> => ({ critical: 0, high: 0, medium: 0, low: 0 });

/** Which suites regression:select relates to each changed component. `run` returns select-suites' --json output. */
export function relatedBySelection(scope: Pick<ReleaseScope, 'components'>, run: (repo: string, path: string) => any): { related: Map<string, Set<Why>>; notes: string[] } {
  const related = new Map<string, Set<Why>>();
  const notes: string[] = [];
  const add = (id: string, w: Why) => { if (!related.has(id)) related.set(id, new Set()); related.get(id)!.add(w); };
  for (const c of scope.components) {
    if (!c.repo || (c.status !== 'CHANGED' && c.status !== 'ADDED')) continue;
    // The selector tokenises CamelCase and dotted names itself; the theme and platform get their root token.
    const path = c.kind === 'theme' ? 'client-app' : c.kind === 'platform' ? 'platform' : c.id.replace(/^VirtoCommerce\./, '');
    let out: any;
    try { out = run(c.repo, path); } catch (e) { notes.push(`${c.id}: regression:select failed (${String((e as Error).message).split('\n')[0]}) — its module suites are not added`); continue; }
    for (const s of out?.selected ?? []) {
      for (const r of s.reasons ?? []) {
        if (r.kind === 'change' || r.kind === 'widened') add(String(s.id), 'module');
        else if (r.kind === 'risk-floor') add(String(s.id), 'floor');
      }
    }
    if (out?.widened) notes.push(`${c.id}: nothing mapped "${path}" in ${c.repo} — the selector widened to the whole layer`);
  }
  return { related, notes };
}

export function buildReleaseCases(release: string, suites: SuiteRows[], related: ReadonlyMap<string, ReadonlySet<Why>>, tickets: { key: string; done: boolean | null }[], now: Date): ReleaseCases {
  const want = new Set(tickets.map((t) => t.key));
  const byTicket = new Map<string, string[]>(tickets.map((t) => [t.key, []]));
  const notes: string[] = [];
  const refs: SuiteRef[] = [];
  const directCases: CaseRef[] = [];
  for (const { suite, rows } of suites) {
    const why = new Set<Why>(related.get(suite.id) ?? []);
    const counts = zero(), direct = zero();
    let unreadable = 0;
    for (const r of rows) {
      const tier = (tierOf(r.priority) ?? null) as Tier | null;
      if (tier) counts[tier]++; else unreadable++;
      const keys = [...new Set([...r.text.matchAll(JIRA_KEY_RE)].map((m) => m[1]))].filter((k) => want.has(k));
      if (!keys.length) continue;
      why.add('direct');
      if (tier) direct[tier]++;
      directCases.push({ id: r.id, suite: suite.id, tier, tickets: keys });
      for (const k of keys) byTicket.get(k)!.push(r.id);
    }
    if (!why.size) continue;
    if (unreadable) notes.push(`${suite.id}: ${unreadable} case(s) with an unreadable Priority — in no tier wave (direct ones go to W3)`);
    refs.push({ id: suite.id, name: suite.name, layer: suite.layer, suitePriority: suite.priority, why: (['direct', 'module', 'floor'] as Why[]).filter((w) => why.has(w)), counts, direct });
  }
  // Run order: suites with a direct Critical case, then any direct suite, then by manifest priority (P0 first), then most Critical cases.
  const rank = (s: SuiteRef): number[] => [s.direct.critical > 0 ? 0 : 1, s.why.includes('direct') ? 0 : 1, Number(/^p(\d)$/i.exec(s.suitePriority)?.[1] ?? 9), -s.counts.critical];
  refs.sort((a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]; return a.id.localeCompare(b.id); });
  const wave = (t: Tier) => { const s = refs.filter((x) => x.counts[t] > 0); return { suites: s.map((x) => x.id), cases: s.reduce((n, x) => n + x.counts[t], 0) }; };
  const order = new Map(refs.map((s, i) => [s.id, i]));
  const rest = directCases.filter((c) => c.tier !== 'critical' && c.tier !== 'high').sort((a, b) => order.get(a.suite)! - order.get(b.suite)! || a.id.localeCompare(b.id));
  return {
    schema: 1, release, generatedAt: now.toISOString(), suites: refs,
    waves: { critical: wave('critical'), high: wave('high'), directRest: { suites: [...new Set(rest.map((c) => c.suite))], ids: rest.map((c) => c.id) } },
    directCases,
    tickets: tickets.map((t) => ({ key: t.key, done: t.done, cases: byTicket.get(t.key)! })),
    notes,
  };
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function main(argv: string[]): number {
  const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const scopePath = flag('scope');
  if (!scopePath || !existsSync(scopePath)) { console.error('Usage: npm run release:cases -- --scope=<stable-N-scope.json> [--out=<file>] [--json] [--no-select]'); return 2; }
  const scope = JSON.parse(readFileSync(scopePath, 'utf8')) as ReleaseScope;
  const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'config/test-suites.json'), 'utf8')) as { suites: ManifestSuite[] };
  const notes: string[] = [];
  const suites: SuiteRows[] = [];
  for (const s of manifest.suites) {
    const p = resolve(REPO_ROOT, s.file);
    if (!existsSync(p)) { notes.push(`${s.id}: ${s.file} missing`); continue; }
    const text = readFileSync(p, 'utf8');
    if (!isCanonicalHeader(text)) { notes.push(`${s.id}: legacy header — not read`); continue; }
    suites.push({ suite: s, rows: parseSuite(text).rows.map((r: Record<string, string>) => ({ id: r.ID, priority: r.Priority ?? '', text: Object.values(r).join(' ') })) });
  }
  const sel = argv.includes('--no-select') ? { related: new Map<string, Set<Why>>(), notes: ['--no-select: direct cases only'] }
    : relatedBySelection(scope, (repo, path) => JSON.parse(execFileSync(process.execPath, [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), resolve(REPO_ROOT, 'scripts/regression/select-suites.ts'), '--repo', repo, '--path', path, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 })));
  const release = scope.mode === 'next' ? 'StableNext' : `Stable${scope.to.bundle.replace(/^v/, '')}`;
  const r = buildReleaseCases(release, suites, sel.related, scope.tickets.map((t) => ({ key: t.key, done: t.done })), new Date());
  r.notes.unshift(...notes, ...sel.notes);
  const out = flag('out');
  if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify(r, null, 2) + '\n'); }
  if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return 0; }
  const gaps = r.tickets.filter((t) => !t.cases.length).map((t) => t.key);
  console.log([
    `${r.release}: ${r.suites.length} related suites (${r.suites.filter((s) => s.why.includes('direct')).length} direct) · ${r.directCases.length} direct cases`,
    `W1 Critical: ${r.waves.critical.cases} cases in ${r.waves.critical.suites.length} suites → ${r.waves.critical.suites.join(',')}`,
    `W2 High:     ${r.waves.high.cases} cases in ${r.waves.high.suites.length} suites → ${r.waves.high.suites.join(',')}`,
    `W3 Direct:   ${r.waves.directRest.ids.length} cases → --ids ${r.waves.directRest.ids.join(',')}`,
    `Tickets with no direct case (→ §5.2 gaps): ${gaps.length ? gaps.join(', ') : 'none'}`,
    ...r.notes.map((n) => `note: ${n}`),
    ...(out ? [`→ ${out}`] : []),
  ].join('\n'));
  return 0;
}

const isMain = (() => { try { return !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]); } catch { return false; } })();
if (isMain) process.exitCode = main(process.argv.slice(2));
```

The selector is spawned through `node_modules/tsx/dist/cli.mjs` with `process.execPath`, with no shell and no `npx` lookup per call. If that path does not exist in this checkout, use `execFileSync('npx', ['tsx', …], { shell: process.platform === 'win32' })` instead, which is the same fallback the repo's Windows scripts use.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx tsx --test scripts/unit/tmp-release-cases.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Add the npm script and run it on the Stable 16 scope from Task 5 Step 7**

In `package.json`, after `"release:scope": …,`:

```json
    "release:cases": "npx tsx scripts/release/release-cases.ts",
```

```bash
npm run release:cases -- --scope="$TEMP/stable-16-scope.json" --out="$TEMP/stable-16-cases.json"; echo "exit=$?"
```
Expected:
- exit 0, and W1/W2/W3 lines whose suite ids all exist in `config/test-suites.json`.
- A gaps line listing the feature tickets that no case cites.
- A `widened` note for each new module the selector cannot place (e.g. OpenTelemetry). That is the selector failing open by design, not an error.

- [ ] **Step 7: Delete the temporary test and commit**

```bash
rm scripts/unit/tmp-release-cases.test.ts
git add scripts/release/release-cases.ts scripts/regression/filter-cases.ts package.json
git commit -F - -- scripts/release/release-cases.ts scripts/regression/filter-cases.ts package.json <<'EOF'
feat(release): npm run release:cases — release features → suites + cases, Critical/High first

Every feature ticket in a stable maps to the cases that cite it (direct) and the suites the selector
ties to its changed repo (module) or keeps as the risk floor. Run waves: W1 Critical of every related
suite → W2 High → W3 the direct cases that are neither. A ticket no case cites is reported as a gap.

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: `npm run release:compare` — baseline vs after regression delta

**Files:**
- Create: `scripts/release/compare-runs.ts`
- Modify: `package.json` (add `"release:compare": "npx tsx scripts/release/compare-runs.ts",` after `release:scope`)
- Test (temporary): `scripts/unit/tmp-compare-runs.test.ts`

**Interfaces:**
- Produces:
  - `Delta`, `DeltaRow {suite, id, before, after, delta}`, `RunResults = Map<suite, Map<caseId, status>>`
  - `readRun(dir): RunResults`
  - `compareRuns(before, after): { rows: DeltaRow[]; unchanged: number }`
  - CLI `release:compare --baseline=<RUN_ID|dir> --after=<RUN_ID|dir> [--json]`, exit 0 no regression · 1 ≥1 REGRESSED · 2 bad input

- [ ] **Step 1: Write the temporary failing test**

```ts
// scripts/unit/tmp-compare-runs.test.ts — TEMPORARY, delete before commit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compareRuns, readRun } from '../release/compare-runs.ts';

const env = (cases: [string, string][]) => JSON.stringify({ testCases: cases.map(([id, status]) => ({ id, status })) });

test('only merged envelopes are read — lane fragments are ignored', () => {
  const d = mkdtempSync(join(tmpdir(), 'run-'));
  writeFileSync(join(d, 'suite-042-results.json'), env([['C1', 'PASS']]));
  writeFileSync(join(d, 'suite-042-results.browser.json'), env([['C1', 'FAIL']]));
  writeFileSync(join(d, 'suite-042-filter.json'), '{}');
  assert.deepEqual([...readRun(d)].map(([s, m]) => [s, [...m]]), [['042', [['C1', 'PASS']]]]);
});

test('delta classes, NEW/DROPPED across suites, unchanged counted', () => {
  const before = new Map([['042', new Map([['A', 'PASS'], ['B', 'FAIL'], ['C', 'BLOCKED'], ['D', 'PASS'], ['E', 'SKIPPED'], ['G', 'PASS']])], ['050', new Map([['X', 'PASS']])]]);
  const after = new Map([['042', new Map([['A', 'FAIL'], ['B', 'PASS'], ['C', 'FAIL'], ['D', 'PASS'], ['E', 'PASS'], ['F', 'FAIL']])], ['061', new Map([['Y', 'PASS']])]]);
  const r = compareRuns(before, after);
  assert.deepEqual(r.rows.map((x) => `${x.suite}/${x.id}:${x.delta}`), [
    '042/A:REGRESSED', '042/B:FIXED', '042/C:STILL_FAILING', '042/E:OTHER', '042/F:NEW', '042/G:DROPPED', '050/X:DROPPED', '061/Y:NEW']);
  assert.equal(r.unchanged, 1);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx tsx --test scripts/unit/tmp-compare-runs.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Write `scripts/release/compare-runs.ts`**

```ts
#!/usr/bin/env node
/**
 * compare-runs — the stable upgrade verdict: the same regression selection run on the previous stable
 * (baseline) and again after the new bundle is deployed on the SAME env (after), compared per case.
 *
 *   npm run release:compare -- --baseline=REG-2026-10-06-0900 --after=REG-2026-10-08-1400 [--json]
 *
 * A run is a folder under reports/regression/ (or a path). Only the merged per-suite envelopes
 * `suite-<ID>-results.json` are read; `.browser`/`.machine` lane fragments are inputs to that merge.
 * REGRESSED = PASS before, FAIL/BLOCKED after — the only class that blocks a stable by itself.
 * STILL_FAILING is pre-existing; FIXED, OTHER (e.g. SKIPPED transitions), NEW and DROPPED are informational.
 * Exit: 0 no REGRESSED · 1 at least one REGRESSED · 2 bad input (missing or empty run folder).
 * Run folders are pruned after 30 days (reports:prune), so run the after-run inside that window.
 */
import '../lib/sync-stdio.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Delta = 'REGRESSED' | 'FIXED' | 'STILL_FAILING' | 'OTHER' | 'NEW' | 'DROPPED';
export interface DeltaRow { suite: string; id: string; before: string | null; after: string | null; delta: Delta }
export type RunResults = Map<string, Map<string, string>>;

const FAILING = new Set(['FAIL', 'BLOCKED']);

export function readRun(dir: string): RunResults {
  const out: RunResults = new Map();
  for (const f of readdirSync(dir).sort()) {
    const m = /^suite-(.+)-results\.json$/.exec(f);
    if (!m) continue;
    const env = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const cases = new Map<string, string>();
    for (const c of Array.isArray(env.testCases) ? env.testCases : []) if (c?.id) cases.set(String(c.id), String(c.status ?? '').toUpperCase());
    out.set(m[1], cases);
  }
  return out;
}

export function compareRuns(before: RunResults, after: RunResults): { rows: DeltaRow[]; unchanged: number } {
  const rows: DeltaRow[] = [];
  let unchanged = 0;
  for (const suite of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(suite) ?? new Map<string, string>();
    const a = after.get(suite) ?? new Map<string, string>();
    for (const id of [...new Set([...b.keys(), ...a.keys()])].sort()) {
      const sb = b.get(id) ?? null, sa = a.get(id) ?? null;
      const delta: Delta | null =
        sb === null ? 'NEW'
          : sa === null ? 'DROPPED'
            : sb === 'PASS' && FAILING.has(sa) ? 'REGRESSED'
              : FAILING.has(sb) && sa === 'PASS' ? 'FIXED'
                : FAILING.has(sb) && FAILING.has(sa) ? 'STILL_FAILING'
                  : sb !== sa ? 'OTHER' : null;
      if (delta) rows.push({ suite, id, before: sb, after: sa, delta }); else unchanged++;
    }
  }
  return { rows, unchanged };
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const runDir = (v: string) => (existsSync(v) ? v : join(REPO_ROOT, 'reports', 'regression', v));

function main(argv: string[]): number {
  const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const b = flag('baseline'), a = flag('after');
  if (!b || !a) { console.error('Usage: npm run release:compare -- --baseline=<RUN_ID|dir> --after=<RUN_ID|dir> [--json]'); return 2; }
  const runs: RunResults[] = [];
  for (const v of [b, a]) {
    const d = runDir(v);
    if (!existsSync(d)) { console.error(`[release-compare] run folder not found: ${d}`); return 2; }
    const r = readRun(d);
    if (!r.size) { console.error(`[release-compare] no suite-*-results.json in ${d}`); return 2; }
    runs.push(r);
  }
  const { rows, unchanged } = compareRuns(runs[0], runs[1]);
  const count = (d: Delta) => rows.filter((r) => r.delta === d).length;
  if (argv.includes('--json')) console.log(JSON.stringify({ baseline: b, after: a, unchanged, rows }, null, 2));
  else {
    console.log(`baseline ${b} → after ${a}: ${count('REGRESSED')} REGRESSED · ${count('FIXED')} fixed · ${count('STILL_FAILING')} still failing · ${count('OTHER')} other · ${count('NEW')} new · ${count('DROPPED')} dropped · ${unchanged} unchanged`);
    for (const r of rows.filter((x) => x.delta === 'REGRESSED')) console.log(`  REGRESSED ${r.suite}/${r.id}: ${r.before} → ${r.after}`);
  }
  return count('REGRESSED') ? 1 : 0;
}

const isMain = (() => { try { return !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]); } catch { return false; } })();
if (isMain) process.exitCode = main(process.argv.slice(2));
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx tsx --test scripts/unit/tmp-compare-runs.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the npm script and smoke it on two real local runs**

Add after `release:scope` in `package.json`:

```json
    "release:compare": "npx tsx scripts/release/compare-runs.ts",
```

```bash
npm run release:compare -- --baseline=REG-2026-09-30-1536 --after=REG-2026-10-01-1243; echo "exit=$?"
```
Expected: a one-line summary and exit 0 or 1. The two runs cover different suites, so expect mostly NEW/DROPPED. Exit 2 only if a folder is gone.

- [ ] **Step 6: Delete the temporary test and commit**

```bash
rm scripts/unit/tmp-compare-runs.test.ts
git add scripts/release/compare-runs.ts package.json
git commit -F - -- scripts/release/compare-runs.ts package.json <<'EOF'
feat(release): npm run release:compare — per-case delta between two regression runs

The stable upgrade verdict: same selection on the previous stable (baseline) and after the new bundle
is deployed on the same env. REGRESSED (PASS → FAIL/BLOCKED) exits 1.

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: `npm run deploy:bundle` — pin an environment to a stable bundle

**Files:**
- Modify: `scripts/deploy/lib/manifest.ts:266` (type), `:339-358` (`editUpgradeText`), `:360-386` (`verifyUpgradeEdit`)
- Modify: `scripts/deploy/upgrade/cli.ts` (`function gitAuthor` → `export function gitAuthor`). Also update its header line "Never adds or removes a module" to "Never adds or removes a module (`vc-deploy.ts bundle` does, on purpose)".
- Modify: `scripts/deploy/upgrade/plan.ts` (`async function checkAsset` → `export async function checkAsset`)
- Create: `scripts/deploy/bundle/plan.ts`, `scripts/deploy/bundle/cli.ts`
- Modify: `scripts/deploy/vc-deploy.ts` (dispatch + header + USAGE), `package.json` (`"deploy:bundle": "npx tsx scripts/deploy/vc-deploy.ts bundle",` after `deploy:upgrade`)
- Test (temporary): `scripts/unit/tmp-deploy-bundle.test.ts`

**Interfaces:**
- Consumes:
  - `readPins` (`lib/pins.ts`)
  - `isRelease`, `FeedEntry`, `DEFAULT_FEED_URL` (`upgrade/feed.ts`)
  - `cmpVersion` (`upgrade/versions.ts`)
  - `editUpgradeText`, `verifyUpgradeEdit`, `editThemeText`, `ManifestChange`
  - `deliverPr`, `DeliverError`, `fetchFile`, `makeHttp`, `setToken`, `getToken`, `enc`, `realGhCli`, `GhCli`, `Http`
  - `loadEnvFiles`, `envFilePath`, `resolveEnvCoords`, `Exit`, `fail`, `gitAuthor`, `checkAsset`
- Produces:
  - `ManifestEditMode` gains `'add' | 'remove'`
  - `PinStatus`, `PinRow`, `BundlePin {rows, changes, blocked}`
  - `planBundlePin(envJson, bundleJson, feed, {removeExtra, allowDowngrade}): BundlePin`, `renderPinTable(p): string`
  - `runBundle(args, deps?)`

- [ ] **Step 1: Write the temporary failing test**

```ts
// scripts/unit/tmp-deploy-bundle.test.ts — TEMPORARY, delete before commit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editUpgradeText, verifyUpgradeEdit } from '../deploy/lib/manifest.ts';
import { planBundlePin } from '../deploy/bundle/plan.ts';

const ENV = `{
  "ManifestVersion": "2.0",
  "PlatformVersion": "3.1039.12",
  "PlatformImage": "ghcr.io/virtocommerce/platform",
  "PlatformImageTag": "3.1039.12",
  "PlatformAssetUrl": "",
  "Sources": [
    {
      "Name": "AzureBlob",
      "Container": "packages",
      "ServiceUri": "https://vc3prerelease.blob.core.windows.net",
      "Modules": []
    },
    {
      "Name": "GithubReleases",
      "ModuleSources": [
        "https://raw.githubusercontent.com/VirtoCommerce/vc-modules/master/modules_v3.json"
      ],
      "Modules": [
        {
          "Id": "VirtoCommerce.Cart",
          "Version": "3.1006.1"
        },
        {
          "Id": "VirtoCommerce.Legacy",
          "Version": "1.0.0"
        }
      ]
    }
  ]
}
`;
const rel = (Id: string, ...vs: string[]) => [Id, { Id, Versions: vs.map((Version) => ({ Version, PackageUrl: `https://github.com/VirtoCommerce/x/releases/download/${Version}/x.zip` })) }] as const;
const feed = new Map([rel('VirtoCommerce.Cart', '3.1011.0'), rel('VirtoCommerce.BackgroundJobs', '3.1052.0')]) as any;
const bundle = { PlatformVersion: '3.1076.0', PlatformImageTag: '3.1076.0',
  Sources: [{ Name: 'GithubReleases', Modules: [{ Id: 'VirtoCommerce.Cart', Version: '3.1011.0' }, { Id: 'VirtoCommerce.BackgroundJobs', Version: '3.1052.0' }] }] };

test('add + remove edit modes are minimal and verify by value', () => {
  const changes = [
    { id: 'VirtoCommerce.Cart', to: '3.1011.0', mode: 'release-bump' as const },
    { id: 'VirtoCommerce.BackgroundJobs', to: '3.1052.0', mode: 'add' as const },
    { id: 'VirtoCommerce.Legacy', to: '1.0.0', mode: 'remove' as const },
  ];
  const r = editUpgradeText(ENV, changes);
  assert.ok(!('error' in r), JSON.stringify(r));
  assert.deepEqual(verifyUpgradeEdit(ENV, (r as { text: string }).text, changes), []);
  const mods = JSON.parse((r as { text: string }).text).Sources[1].Modules.map((m: any) => `${m.Id}@${m.Version}`);
  assert.deepEqual(mods, ['VirtoCommerce.BackgroundJobs@3.1052.0', 'VirtoCommerce.Cart@3.1011.0']);
});

test('remove of an id not in GithubReleases is an error, not a silent no-op', () => {
  assert.ok('error' in editUpgradeText(ENV, [{ id: 'VirtoCommerce.Nope', to: '1.0.0', mode: 'remove' }]));
});

test('plan: bump, add, env-only kept by default, platform bump', () => {
  const p = planBundlePin(JSON.parse(ENV), bundle, feed, { removeExtra: false, allowDowngrade: false });
  assert.deepEqual(p.blocked, []);
  assert.deepEqual(p.rows.map((r) => `${r.id}:${r.status}`), ['Platform:BUMP', 'VirtoCommerce.Cart:BUMP', 'VirtoCommerce.BackgroundJobs:ADD', 'VirtoCommerce.Legacy:ENV_ONLY']);
  assert.deepEqual(p.changes.map((c) => `${c.id}:${c.mode}`), ['Platform:platform', 'VirtoCommerce.Cart:release-bump', 'VirtoCommerce.BackgroundJobs:add']);
});

test('plan: AzureBlob prerelease of a bundle module PROMOTEs; env-only blob + --remove-extra BLOCKS; downgrade BLOCKS', () => {
  const env = JSON.parse(ENV);
  env.Sources[0].Modules = [{ BlobName: 'VirtoCommerce.Cart_3.1012.0-alpha.3.zip' }, { BlobName: 'VirtoCommerce.Custom_1.0.0-pr-5.zip' }];
  env.Sources[1].Modules = [];
  const p = planBundlePin(env, { ...bundle, PlatformVersion: '3.1000.0', PlatformImageTag: '3.1000.0' }, feed, { removeExtra: true, allowDowngrade: false });
  assert.ok(p.rows.some((r) => r.id === 'VirtoCommerce.Cart' && r.status === 'PROMOTE'));
  assert.ok(p.blocked.some((b) => b.startsWith('VirtoCommerce.Custom is an AzureBlob prerelease pin')));
  assert.ok(p.blocked.some((b) => b.startsWith('Platform 3.1039.12 → 3.1000.0 is a DOWNGRADE')));
});

test('plan: a bundle version that is not a release in the feed BLOCKS (the install would 404)', () => {
  const p = planBundlePin(JSON.parse(ENV), { ...bundle, Sources: [{ Name: 'GithubReleases', Modules: [{ Id: 'VirtoCommerce.Cart', Version: '3.1099.0' }] }] }, feed, { removeExtra: false, allowDowngrade: false });
  assert.ok(p.blocked.some((b) => b.includes('VirtoCommerce.Cart 3.1099.0 is not a release')));
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx tsx --test scripts/unit/tmp-deploy-bundle.test.ts`
Expected: FAIL, `Cannot find module '../deploy/bundle/plan.ts'`

- [ ] **Step 3: Add the `add` / `remove` modes to `scripts/deploy/lib/manifest.ts`**

Replace line 266:

```ts
/** `add` / `remove` are emitted ONLY by `vc-deploy.ts bundle` (a stable can add or drop modules); `upgrade` never adds or removes. */
export type ManifestEditMode = 'release-bump' | 'blob-bump' | 'promote' | 'platform' | 'add' | 'remove';
```

Replace the body of `editUpgradeText` (lines 339-358) with:

```ts
export function editUpgradeText(text: string, changes: ManifestChange[]): { text: string } | { error: string } {
  let t: string | null = text;
  const fail = (c: ManifestChange) => ({ error: `${c.id} (${c.mode} → ${c.to}): manifest shape not recognised — no minimal edit possible` });
  for (const c of changes) {
    if (c.mode === 'platform') t = bumpPlatformText(t!, c.to, c.to);
    else if (c.mode === 'release-bump') t = bumpGhReleaseText(t!, c.id, c.to);
    else if (c.mode === 'blob-bump') t = upsertBlobEntry(t!, c.id, `${c.id}_${c.to}.zip`);
    else if (c.mode === 'remove') { const r = removeGhReleaseEntry(t!, c.id); t = r === t ? null : r; } // unchanged = not in GithubReleases
    else continue;
    if (t == null) return fail(c);
  }
  // Promotions and additions are inserted at the top in reverse Id order, so they end up ascending.
  for (const c of changes.filter((x) => x.mode === 'promote' || x.mode === 'add').sort((a, b) => (a.id < b.id ? 1 : -1))) {
    if (c.mode === 'promote') { t = removeBlobEntryText(t!, c.id); if (t == null) return fail(c); }
    t = insertGhReleaseText(t!, c.id, c.to); if (t == null) return fail(c);
  }
  return { text: t! };
}
```

In `verifyUpgradeEdit`, replace the `for (const c of changes) {…}` loop that builds `want` with:

```ts
  for (const c of changes) {
    if (c.mode === 'platform') continue;
    if (c.mode === 'remove') { want.delete(c.id); continue; }
    want.set(c.id, { id: c.id, version: c.to, source: c.mode === 'blob-bump' ? 'AzureBlob' : 'GithubReleases' });
  }
```

- [ ] **Step 4: Export the two helpers the bundle CLI reuses**

- `scripts/deploy/upgrade/cli.ts`: `function gitAuthor()` → `export function gitAuthor()`.
- `scripts/deploy/upgrade/plan.ts`: `async function checkAsset(` → `export async function checkAsset(`.

- [ ] **Step 5: Write `scripts/deploy/bundle/plan.ts`**

```ts
// scripts/deploy/bundle/plan.ts — pin an env's backend manifest to a vc-modules stable bundle (pure).
import type { ManifestChange } from '../lib/manifest.ts';
import { readPins } from '../lib/pins.ts';
import { isRelease } from '../upgrade/feed.ts';
import type { FeedEntry } from '../upgrade/feed.ts';
import { cmpVersion } from '../upgrade/versions.ts';

export type PinStatus = 'EQUAL' | 'BUMP' | 'DOWNGRADE' | 'PROMOTE' | 'ADD' | 'REMOVE' | 'ENV_ONLY';
export interface PinRow { id: string; env: string | null; bundle: string | null; status: PinStatus }
export interface BundlePin { rows: PinRow[]; changes: ManifestChange[]; blocked: string[] }
export interface PinOptions { removeExtra: boolean; allowDowngrade: boolean }

export function planBundlePin(envJson: any, bundleJson: any, feed: ReadonlyMap<string, FeedEntry>, opts: PinOptions): BundlePin {
  const rows: PinRow[] = [], changes: ManifestChange[] = [], blocked: string[] = [];

  const envV = String(envJson?.PlatformVersion ?? ''), bunV = String(bundleJson?.PlatformVersion ?? '');
  if (!bunV) blocked.push('bundle has no PlatformVersion');
  else if (bundleJson.PlatformImageTag && String(bundleJson.PlatformImageTag) !== bunV) {
    blocked.push(`bundle PlatformImageTag ${bundleJson.PlatformImageTag} ≠ PlatformVersion ${bunV} — the platform edit sets both to the version`);
  } else if (envV === bunV) rows.push({ id: 'Platform', env: envV, bundle: bunV, status: 'EQUAL' });
  else {
    const down = cmpVersion(bunV, envV) < 0;
    rows.push({ id: 'Platform', env: envV, bundle: bunV, status: down ? 'DOWNGRADE' : 'BUMP' });
    if (down && !opts.allowDowngrade) blocked.push(`Platform ${envV} → ${bunV} is a DOWNGRADE (pass --allow-downgrade to approve it)`);
    else changes.push({ id: 'Platform', to: bunV, mode: 'platform' });
  }

  const envRead = readPins(envJson);
  if (envRead.duplicates.length) blocked.push(`env manifest has an Id in two places: ${envRead.duplicates.join(', ')} — fix it by hand first`);
  const env = new Map(envRead.pins.map((p) => [p.id, p]));
  const bundle = readPins(bundleJson).pins;
  const inBundle = new Set(bundle.map((p) => p.id));
  for (const b of bundle) {
    const e = env.get(b.id);
    const requireRelease = () => {
      const ok = feed.get(b.id)?.Versions.some((v) => v.Version === b.version && isRelease(v)) ?? false;
      if (!ok) blocked.push(`${b.id} ${b.version} is not a release in the module feed — the install would fail`);
    };
    if (!e) { rows.push({ id: b.id, env: null, bundle: b.version, status: 'ADD' }); changes.push({ id: b.id, to: b.version, mode: 'add' }); requireRelease(); continue; }
    if (e.source === 'AzureBlob') { rows.push({ id: b.id, env: e.version, bundle: b.version, status: 'PROMOTE' }); changes.push({ id: b.id, to: b.version, mode: 'promote' }); requireRelease(); continue; }
    if (e.version === b.version) { rows.push({ id: b.id, env: e.version, bundle: b.version, status: 'EQUAL' }); continue; }
    const down = cmpVersion(b.version, e.version) < 0;
    rows.push({ id: b.id, env: e.version, bundle: b.version, status: down ? 'DOWNGRADE' : 'BUMP' });
    if (down && !opts.allowDowngrade) { blocked.push(`${b.id} ${e.version} → ${b.version} is a DOWNGRADE (pass --allow-downgrade to approve it)`); continue; }
    changes.push({ id: b.id, to: b.version, mode: 'release-bump' });
    requireRelease();
  }
  for (const e of envRead.pins) {
    if (inBundle.has(e.id)) continue;
    if (!opts.removeExtra) { rows.push({ id: e.id, env: e.version, bundle: null, status: 'ENV_ONLY' }); continue; }
    if (e.source === 'AzureBlob') { blocked.push(`${e.id} is an AzureBlob prerelease pin not in the bundle — --remove-extra removes GithubReleases pins only; remove it by hand`); continue; }
    rows.push({ id: e.id, env: e.version, bundle: null, status: 'REMOVE' });
    changes.push({ id: e.id, to: e.version, mode: 'remove' });
  }
  return { rows, changes, blocked };
}

export function renderPinTable(p: BundlePin): string {
  const shown = p.rows.filter((r) => r.status !== 'EQUAL');
  return [
    '| Component | Env | Bundle | Status |', '|---|---|---|---|',
    ...shown.map((r) => `| ${r.id} | ${r.env ?? '—'} | ${r.bundle ?? '—'} | ${r.status} |`),
    '', `${p.changes.length} to change · ${p.rows.length - shown.length} equal · ${p.rows.filter((r) => r.status === 'ENV_ONLY').length} env-only kept`,
    ...(p.blocked.length ? ['', 'BLOCKED — nothing can be applied until these are resolved:', ...p.blocked.map((b) => `- ${b}`)] : []),
  ].join('\n');
}
```

- [ ] **Step 6: Run the test and confirm it passes, with the existing deploy test still green**

```bash
npx tsx --test scripts/unit/tmp-deploy-bundle.test.ts
npx tsx --test scripts/unit/deploy-pr-artifact.test.ts
```
Expected: both PASS.

- [ ] **Step 7: Write `scripts/deploy/bundle/cli.ts`**

```ts
/**
 * vc-deploy.ts bundle — pin a vc-deploy-dev env to a vc-modules STABLE BUNDLE (/qa-test-plan stable, Phase B).
 *
 *   --env=<env> --bundle=vN [--ref=<vc-modules ref>] [--remove-extra] [--allow-downgrade] [--json]   PLAN (read-only; prints the table)
 *   … --apply [--draft] [--fork-owner=<login>] [--trailer=<line>]…                                   APPLY (ONE deploy PR; never merges)
 *
 * Unlike `upgrade`, this ADDS the modules the bundle carries and the env lacks: a stable can introduce modules
 * (Stable 16 brought BackgroundJobs, without which no job runs once Hangfire is gone). It removes env-only
 * modules only with --remove-extra, and never downgrades without --allow-downgrade.
 * Exit: 0 ok (PLAN printed / PR opened) · 1 APPLY did not finish cleanly, or nothing to change · 2 bad input,
 * a read failed, or the plan is BLOCKED — nothing was written.
 */
import { existsSync } from 'node:fs';
import { DeliverError, deliverPr } from '../lib/deliver.ts';
import { envFilePath, loadEnvFiles, resolveEnvCoords } from '../lib/env.ts';
import { Exit, fail } from '../lib/exit.ts';
import { enc, fetchFile, getToken, makeHttp, realGhCli, setToken } from '../lib/github.ts';
import type { GhCli, Http } from '../lib/github.ts';
import { editThemeText, editUpgradeText, verifyUpgradeEdit } from '../lib/manifest.ts';
import { gitAuthor } from '../upgrade/cli.ts';
import { DEFAULT_FEED_URL } from '../upgrade/feed.ts';
import type { FeedEntry } from '../upgrade/feed.ts';
import { checkAsset } from '../upgrade/plan.ts';
import type { Change } from '../upgrade/types.ts';
import { planBundlePin, renderPinTable } from './plan.ts';

const TAG = 'env-bundle';

export async function runBundle(args: string[], deps: { cli?: GhCli; http?: Http } = {}): Promise<void> {
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const flags = (n: string) => args.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.split('=').slice(1).join('='));
  const has = (n: string) => args.includes(`--${n}`);
  const env = flag('env'), bundle = flag('bundle'), ref = flag('ref') || 'master';
  if (!env) fail('--env=<env> is required (TEST_ENV form, e.g. vcptcore_regression). It is never defaulted.', TAG);
  if (!bundle || !/^v\d+$/.test(bundle)) fail('--bundle=vN is required (e.g. --bundle=v16)', TAG);
  if (!existsSync(envFilePath(env))) fail(`no env file for "${env}" (${envFilePath(env)})`, TAG);
  loadEnvFiles(env);
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
  if (!getToken()) fail('No GIT_TOKEN — a PAT with read on VirtoCommerce repos (read .env.local).', TAG);
  const http = deps.http ?? makeHttp();
  const coords = resolveEnvCoords(env);

  const pkg = await fetchFile(coords, coords.packagesPath).catch((e) => fail(e.message, TAG));
  const bj = await http.gh(`/repos/VirtoCommerce/vc-modules/contents/bundles/${bundle}/package.json?ref=${encodeURIComponent(ref)}`);
  if (!bj?.content) fail(`bundles/${bundle}/package.json not found in VirtoCommerce/vc-modules@${ref}`, TAG);
  const bundleJson = JSON.parse(Buffer.from(bj.content, 'base64').toString('utf8'));
  const feedArr = await http.getJson(process.env.VC_MODULES_FEED_URL || DEFAULT_FEED_URL);
  if (!Array.isArray(feedArr)) fail('module feed unreadable', TAG);
  const feed = new Map<string, FeedEntry>(feedArr.map((e: FeedEntry) => [e.Id, e]));
  const p = planBundlePin(pkg.json, bundleJson, feed, { removeExtra: has('remove-extra'), allowDowngrade: has('allow-downgrade') });

  // The platform zip + image must exist anonymously, or the deploy rolls back.
  const plat = p.changes.find((c) => c.mode === 'platform');
  if (plat) {
    const c = { kind: 'platform', to: plat.to, assetUrl: '', assetOk: false } as unknown as Change;
    await checkAsset(http, c, pkg.json.PlatformImage, 'VirtoCommerce/vc-platform');
    if (!c.assetOk) p.blocked.push(`platform ${plat.to}: ${c.assetNote ?? 'asset'} is not downloadable`);
  }

  const notes: string[] = [];
  const themeUrl = typeof bundleJson.ThemeB2BVue === 'string' ? bundleJson.ThemeB2BVue : null;
  const tj = await http.gh(`/repos/${coords.deployOwner}/${coords.deployRepo}/contents/${enc(coords.themePath)}?ref=${encodeURIComponent(coords.branch)}`);
  const themeText = tj?.content ? Buffer.from(tj.content, 'base64').toString('utf8') : null;
  let themeFile: { path: string; text: string; snapshot: string } | null = null;
  if (!themeUrl) notes.push('the bundle has no ThemeB2BVue — theme not pinned');
  else if (!themeText) notes.push(`no ${coords.themePath} on ${coords.branch} — this env deploys its theme another way; set it to ${themeUrl} by hand`);
  else {
    const te = editThemeText(themeText, themeUrl);
    if (!te.from) notes.push(`${coords.themePath} has no recognisable theme URL — set ${themeUrl} by hand`);
    else if (te.text !== themeText) themeFile = { path: coords.themePath, text: te.text, snapshot: themeText };
  }

  if (has('json')) console.log(JSON.stringify({ env, bundle, ref, rows: p.rows, changes: p.changes, blocked: p.blocked, notes }, null, 2));
  else console.log([`Env: ${env} · ${coords.deployOwner}/${coords.deployRepo}@${coords.branch} → vc-modules/bundles/${bundle} @ ${ref}`, '', renderPinTable(p), ...notes.map((n) => `note: ${n}`)].join('\n'));
  if (!has('apply')) throw new Exit(p.blocked.length ? 2 : 0);
  if (p.blocked.length) fail('STOP — the plan is BLOCKED (see above); nothing was written', TAG);
  if (!p.changes.length && !themeFile) { console.log(`${env} already matches ${bundle} — nothing to change.`); throw new Exit(1); }

  // ── APPLY ──
  const files: { path: string; text: string; snapshot: string }[] = [];
  if (p.changes.length) {
    const r = editUpgradeText(pkg.text, p.changes);
    if ('error' in r) fail(`STOP — ${r.error}`, TAG);
    const problems = verifyUpgradeEdit(pkg.text, r.text, p.changes);
    if (problems.length) fail(`STOP — the edit is not exactly the plan:\n  ${problems.join('\n  ')}`, TAG);
    files.push({ path: coords.packagesPath, text: r.text, snapshot: pkg.text });
  }
  if (themeFile) files.push(themeFile);
  const n = p.changes.length;
  const title = `${env}: pin to Stable ${bundle.slice(1)} bundle (${n} component change${n === 1 ? '' : 's'})`;
  const changed = p.rows.filter((r) => !['EQUAL', 'ENV_ONLY'].includes(r.status));
  const message = [title, '', ...changed.map((r) => `- ${r.id}: ${r.env ?? '—'} → ${r.bundle ?? 'removed'} (${r.status})`), ...(flags('trailer').length ? ['', ...flags('trailer')] : [])].join('\n');
  const body = [
    `Pin **${env}** (\`${coords.branch}\`) to \`vc-modules/bundles/${bundle}/package.json\` @ \`${ref}\`.`, '',
    renderPinTable(p), ...notes.map((x) => `- note: ${x}`), '',
    '**A human merges this PR; the merge triggers the deploy.** Check `/api/platform/modules` only after the deploy Action is green **and** the versions have changed.',
  ].join('\n');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let r;
  try {
    r = await deliverPr({ coords, headBranch: `env-bundle-${coords.branch}-${bundle}-${stamp}`, uniqueBranch: true, title, message, body, files, author: gitAuthor(), forkOwner: flag('fork-owner'), draft: has('draft'), log: (l) => console.log(l) }, deps.cli ?? realGhCli);
  } catch (e) { if (e instanceof DeliverError) fail(e.message, TAG); throw e; }
  if (r.kind === 'pr') {
    console.log(`✅ PR ${r.note}: ${r.url}`);
    console.log('A human merges it; the merge deploys. Check /api/platform/modules only after the deploy Action is green AND the versions changed.');
    throw new Exit(0);
  }
  const why = r.kind === 'stale' ? `STOP — ${r.path} changed on ${coords.branch} since it was read; re-run`
    : r.kind === 'unreadable' ? `STOP — could not re-read ${r.path} to confirm it is unchanged; nothing was written`
      : r.kind === 'handoff' ? `${r.reason} — nothing was written`
        : r.kind === 'partial' ? `⚠ PARTIAL commit on ${r.headBranch}: committed ${r.committed.join(', ')}; FAILED ${r.failed.join(', ')} — ${r.compareUrl}`
          : `branch pushed, PR not opened (${r.note}): ${r.compareUrl}`;
  console.error(`[${TAG}] ${why}`);
  throw new Exit(1);
}
```

- [ ] **Step 8: Wire the subcommand**

In `scripts/deploy/vc-deploy.ts`:
- Add this header line after the `upgrade` line:
  ` *   vc-deploy.ts bundle --env=<env> --bundle=vN  pin an env to a vc-modules stable bundle  (/qa-test-plan stable)`
- Change `USAGE` to `'Usage: vc-deploy.ts <pr|upgrade|bundle> [...]  (see pr/pr.ts, upgrade/cli.ts, bundle/cli.ts)'`.
- Add after the `upgrade` dispatch line:

```ts
  if (sub === 'bundle') return (await import('./bundle/cli.ts')).runBundle(rest);
```

In `package.json`, after `"deploy:upgrade": …,`:

```json
    "deploy:bundle": "npx tsx scripts/deploy/vc-deploy.ts bundle",
```

- [ ] **Step 9: Live dry-run (read-only, NO `--apply`)**

```bash
npm run deploy:bundle -- --env=vcptcore_regression --bundle=v15; echo "exit=$?"
npm run deploy:bundle -- --env=vcptcore_regression --bundle=v16 --ref=feat/VCST-6042-stable-16-bundle; echo "exit=$?"
```
Expected:
- **v15:** near-EQUAL. Today the only known delta is PageBuilderModule, env 3.1022.0 vs bundle 3.1012.1, which shows as DOWNGRADE → BLOCKED → exit 2. That is correct behaviour; it proves the downgrade guard on real data.
- **v16:** Platform BUMP 3.1039.12 → 3.1076.0, five ADD rows (BackgroundJobs, OpenTelemetry, UCP, WhiteLabeling, XPickup) and BUMP rows. There is a theme note, because this env has no `theme/artifact.json` (it deploys `storefront/image.json`). Exit 0 if nothing is BLOCKED.

- [ ] **Step 10: Delete the temporary test, run the full suite, and commit**

```bash
rm scripts/unit/tmp-deploy-bundle.test.ts
npm test 2>&1 | tail -5
git add scripts/deploy/lib/manifest.ts scripts/deploy/upgrade/cli.ts scripts/deploy/upgrade/plan.ts scripts/deploy/bundle/plan.ts scripts/deploy/bundle/cli.ts scripts/deploy/vc-deploy.ts package.json
git commit -F - -- scripts/deploy/lib/manifest.ts scripts/deploy/upgrade/cli.ts scripts/deploy/upgrade/plan.ts scripts/deploy/bundle/plan.ts scripts/deploy/bundle/cli.ts scripts/deploy/vc-deploy.ts package.json <<'EOF'
feat(deploy): npm run deploy:bundle — pin a vc-deploy-dev env to a stable bundle

One PR (never merged) that makes an env's backend manifest equal a vc-modules bundle. Unlike
`upgrade` it adds the modules a stable introduces (Stable 16: BackgroundJobs, OpenTelemetry, UCP,
WhiteLabeling, XPickup); env-only modules are kept unless --remove-extra, downgrades need
--allow-downgrade, and every target must be a release in the module feed. Manifest edits gain
`add` / `remove` modes, verified by value like the others.

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: `npm test` green.

---

### Task 8: Restructure `/qa-test-plan` into a router + three on-demand files

**Files:**
- Create: `.claude/knowledge/execution/test-plan/sprint-mode.md`, `plan-sections.md`, `stable-mode.md`
- Rewrite: `.claude/commands/qa-test-plan.md`
- Modify: any file that cites `qa-test-plan.md` Step/§ anchors (found in Step 1)

No code ⇒ no unit test. The gate is `npm run context:check` (BUDGET-004, dangling paths, `§` headings).

- [ ] **Step 1: Find inbound citations that the move will break**

```bash
grep -rn "qa-test-plan.md *§\|qa-test-plan.md#\|qa-test-plan\` *Step\|qa-test-plan.md\` Step\|/qa-test-plan.*Step [0-9]" .claude CLAUDE.md docs/decisions plugins 2>/dev/null | grep -v worktrees
```
Record every hit. Step 6 re-points each one at the new file that now holds that heading.

- [ ] **Step 2: Create `sprint-mode.md` by moving text VERBATIM from the current command**

Header to write first:

```markdown
# /qa-test-plan — Sprint mode

Read by [`/qa-test-plan`](../../../commands/qa-test-plan.md) when the argument is a sprint (`SprintXX-YY`, `XX-YY`,
`current`, `last`). Shared steps (risk, delegation, gap-diff, charters, shared rules): [`plan-sections.md`](plan-sections.md).
Moved verbatim from the command on 2026-10-05 (VCST-6177); headings unchanged so citations still resolve.
```

Then paste, unchanged and in this order, these line ranges of the current `.claude/commands/qa-test-plan.md`:
- 39 (`## Pipeline: …`)
- 41-51 (Step 0)
- 53-67 (Step 1)
- 71-96 (Step 2)
- 100-122 (Step 3)
- 126-141 (Step 4)
- 175-189 (6a; keep the heading `#### 6a. Orchestrator-written sections` under a new `### Step 6 — Generate Plan Sections` heading, followed by one line: "6b–6d: [`plan-sections.md`](plan-sections.md) §Delegation, §Gap-diff, §Charters.")
- 282-323 (Step 7)
- 325-351 (Output Summary)

Then add `## Sprint-only rules` containing current lines 358-361 and 375 verbatim (MCP-only JIRA, GitHub MCP only, sprint window, Bugs/Stories only, `--no-jira` marking).

- [ ] **Step 3: Create `plan-sections.md` by moving text VERBATIM**

Header:

```markdown
# /qa-test-plan — sections shared by Sprint and Stable mode

Risk, the delegated sections, the checklist gap-diff and the exploratory charters do not depend on where the
scope came from, so both modes apply them unchanged. Moved verbatim from the command on 2026-10-05 (VCST-6177).
Mode-specific inputs are named in [`sprint-mode.md`](sprint-mode.md) and [`stable-mode.md`](stable-mode.md).
```

Then add these sections:
- `## Risk`: current lines 145-167 (Step 5, keep its `### Step 5 — Risk Assessment` heading).
- `## Delegation`: current lines 171-173 + 191-236 (6b).
- `## Gap-diff`: current lines 238-251 (6c).
- `## Charters`: current lines 253-278 (6d).
- `## Shared rules`: current lines 357 and 362-374.

Add one sentence at the top of `## Delegation`: "In Stable mode `jiraDoneItems` is replaced by the stable inputs listed in [`stable-mode.md`](stable-mode.md) §S6; every other field and the Output contract are unchanged."

- [ ] **Step 4: Create `stable-mode.md` with exactly this content**

````markdown
# /qa-test-plan — Stable mode (and Forecast)

Read by [`/qa-test-plan`](../../../commands/qa-test-plan.md) for `stable <N>` and `stable next`. Shared steps:
[`plan-sections.md`](plan-sections.md). Tracker: VCST-6177.

## Why a stable plan is not a big sprint plan

A stable bundle (`VirtoCommerce/vc-modules` → `bundles/vN/`) pins every module, the platform and the theme to one
frozen combination. Almost every feature in it was planned, built and tested in its own sprint on `vcst`. The new
risk in a stable is elsewhere, and the plan puts its depth there instead of spreading it over everything that changed:

1. **The cycle's own changes**, which no sprint tested. These are the release-cycle tickets that touch nearly every
   repo (Stable 16: Hangfire → the job API, VCST-6042; expired obsolete removals, VCST-5901).
2. **The upgrade itself**: an environment holding the previous stable's data, queued and recurring jobs, then vN.
3. **Runtime / behaviour changes** that `breaking_changes.md` declares (new settings, changed job semantics, removed delays).
4. **Modules new to the bundle.**
5. **Feature tickets that reached the bundle without being Done** in Jira.

Everything else the scope shows (feature tickets already Done in a sprint) is covered by the regression run, not by new design.

## S1 — Resolve

- `stable <N>`: target `vN`. `--ref <branch>` is the `vc-modules` ref the target is read at. A stable under review lives on its
  bundle PR branch, not on `master` (Stable 16: `feat/VCST-6042-stable-16-bundle`, PR vc-modules#78). Find it with
  `gh pr list -R VirtoCommerce/vc-modules --search "Stable <N>"` when the user did not give it. The previous bundle is
  the previous numeric key of `bundles/stable.json`, or `--from vM`.
- `stable next`: Forecast (§Forecast below). Stop reading S2–S9.
- **Release ticket:** the bundle PR's title key (Stable 16: VCST-6042). Read it with the Atlassian MCP for status, QA engineer and comments.
- **Output:** `vc/shared/docs/Release plans/stable-{N}-test-plan.md`, `stable-{N}-summary.json`, `stable-{N}-scope.json`, `stable-{N}-cases.json`.
  Create the folder if missing. Duplicate guard as in the command.

## S2 — Scope (deterministic; never re-derived by hand)

```bash
npm run release:scope -- v<N> --ref=<ref> [--from=v<M>] --out="vc/shared/docs/Release plans/stable-<N>-scope.json"
```

Exit 2 ⇒ stop and report the message (token, rate limit, missing bundle). There is **no** fallback to scraping
release pages through MCP: a model asked to list several hundred PRs names plausible ones. Read the printed summary
and the JSON's `notes[]`. An `unresolved` repo goes into `config/module-repo-map.json` (`/qa-bundle-check` §Maintenance), then re-run.

Then read the bundle's own prose, which the scope only indexes:
`gh api "repos/VirtoCommerce/vc-modules/contents/bundles/v<N>/<file>?ref=<ref>" -H "Accept: application/vnd.github.raw"`
for `breaking_changes.md` and `update_path.md`.

## S3 — Ask the base before writing any behaviour claim

S5 writes upgrade checks that state how the platform behaves, so this mode is a Judge
([`../../agents/authoring-standard.md`](../../agents/authoring-standard.md) §5.2).

3. **Ask the base for this run's coordinates.** For each module with a `breaking.rows[]` behaviour cell and each
   ADDED module: `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<Module> <setting / job / endpoint> <question>"`). Record
   hit ids. A miss is not a blocker. Rule: `CLAUDE.md` §Essential Rules → *Product context*.

**Provenance:**
- A check taken from `breaking_changes.md` describes NEW behaviour, so it is `{SPEC}`. The release artifact is its acceptance criterion; VirtoOZ will not have it yet.
- The existing behaviour it modifies is `{DOC}` / `{BL}`, from VirtoOZ (`/vc-docs`) and `bl:extract`.
- A doc contradicting the release artifact is a finding to observe in Phase C, not a reason to rewrite the check.

## S4 — Bucket the scope

| Bucket | From `stable-<N>-scope.json` | Goes to |
|---|---|---|
| Cycle changes | `prs[class=cycle]`, grouped by `component` | §6 upgrade checks: each module whose cycle PR moved jobs → its jobs run after the upgrade (recurring jobs keep their legacy id; manual start / cancel works) |
| Runtime / behaviour rows | `breaking.rows[]` whose runtime/behaviour cell is not `—` | one §6 upgrade check `U-NN` each, `{SPEC}` |
| Legacy stubs | `breaking.rows[]` with a legacy-stub cell not `—`/`none` | §6 `U-NN`: a job queued on v{N-1} still runs after the upgrade |
| New modules | `components[status=ADDED]` | §2.1 + §6 "installed and initialised" + a §3 domain row |
| Removed modules | `components[status=REMOVED]` | §2.4: a suite that touches them now expects removal, not a regression |
| Every feature ticket | `tickets[]` (all of them, Done or not) | the regression scope via `release:cases` (S5): its direct cases + its module suites |
| Not-Done feature tickets | `tickets[done=false]` (+ `done=null`, listed separately) | §2.3 must-test list: run its cases, or `/qa-test <KEY>` before sign-off |
| Feature tickets with no direct case | `stable-<N>-cases.json` `tickets[].cases = []` | §5.2 coverage gap (`GAP-NN`): the feature shipped and no case cites it |
| Untracked PRs | `prs[class=untracked]` | §2.5 list; a reviewer decides whether any title implies behaviour |

## S5 — Risk, suites, gaps, charters

- **Risk:** [`plan-sections.md`](plan-sections.md) §Risk, one row per domain. Stable adjustments:
  - Likelihood +1 (cap 5) for a domain whose modules carry both a cycle change and a runtime row.
  - An ADDED module's domain starts at L ≥ 4.
- **§5.1 suites and cases (regression for every feature in the release):**

  ```bash
  npm run release:cases -- --scope="vc/shared/docs/Release plans/stable-<N>-scope.json" --out="vc/shared/docs/Release plans/stable-<N>-cases.json"
  ```

  Relations: a suite is `direct` (a row cites a release feature ticket), `module` (the selector ties it to a changed repo), or `floor` (P0 / critical-ui risk floor).
  The waves, in this order:

  | Wave | Scope |
  |---|---|
  | **W1** | Critical cases of every related suite |
  | **W2** | High cases of every related suite |
  | **W3** | The direct cases that are neither (Medium/Low/unreadable), so no feature's own test is dropped |

  Medium/Low cases of suites related only by module are reported, not run.

  §5.1 is written as the wave table:
  - 5.1.1 Frontend and 5.1.2 Backend, split by the suite's layer.
  - Columns: `| Suite | Name | Relation | Critical | High | Direct cases | Tickets |`.
  - Rows in the script's run order.
  - Every id comes from the script, never typed.
- **§5.2 / §5.3:** [`plan-sections.md`](plan-sections.md) §Gap-diff and §Charters, over the Critical / High domains.

## S6 — Delegate §5.2, §5.3 and §6

Dispatch `test-management-specialist` per [`plan-sections.md`](plan-sections.md) §Delegation and
[`../../../templates/agent-dispatch.md`](../../../templates/agent-dispatch.md), including its observed-behaviour line.
Replace `jiraDoneItems` with:
- `untestedTickets`: the S4 must-test list with summaries
- `upgradeChecks`: the S4 `U-NN` drafts with module, source row and provenance
- `newModules`, `removedModules`
- `cycleChanges`: component → PR titles
- `breakingChangesPath`: the raw-file `gh api` command from S2

Output adds `section_6_upgrade_checks: [{id, module, check, source, provenance, owner, lane}]`.

## S7 — The run sequence the plan prescribes (plan §4.1; the plan WRITES it, it does not execute it)

The environment is `vcptcore_regression` (TEST_ENV form) unless the user names another.

| Phase | Action | Records |
|---|---|---|
| A — Baseline | `npm run deploy:bundle -- --env=vcptcore_regression --bundle=v<N-1>` (dry-run): the env must match the previous stable. Explain any non-EQUAL row in the plan. Then, on `TEST_ENV=vcptcore_regression`, the waves in order: W1 `/qa-regression stable:<N> --cases critical` → W2 `/qa-regression stable:<N> --cases high` → W3 `/qa-regression <W3 suites> --ids <W3 ids>`. Stop after W1 if it shows a release blocker | `runs.baseline` = the RUN_ID of each wave |
| B — Deploy | `npm run deploy:bundle -- --env=vcptcore_regression --bundle=v<N> --ref=<ref>` (dry-run) → show the table → **ask the user** → re-run with `--apply` → one PR. A human merges it. Wait until `/api/platform/modules` reports the new versions (`/qa-env-upgrade` reference). The theme follows the env's own mechanism when the command prints a theme note | `runs.deployPr` |
| C — After | **Exactly the same waves** as A (same suites, same tiers, same W3 ids), then the §6 upgrade checks (Admin, jobs and settings: `qa-backend-expert` on `playwright-edge`) | `runs.after` = the RUN_ID of each wave |
| D — Compare | Per wave: `npm run release:compare -- --baseline=<A wave run> --after=<C wave run>`. REGRESSED → `/qa-triage-results`. STILL_FAILING is pre-existing and not a stable blocker by itself. Different scope in A and C would make every difference unreadable, so never change a wave between them | verdict per wave in §9 |

Run C within 30 days of A: `reports:prune` deletes older run folders. Phase B is an outward write, so it gets its own explicit yes.

## S8 — Write the plan

Header block as in Sprint mode, with `**Release:** Stable {N} ({from bundle} → v{N}, ref \`{ref}\`)`,
`**Release ticket:** {KEY}`, and `**Target environment:** vcptcore-regression (\`FRONT_URL\` / \`BACK_URL\` of \`.env.vcptcore_regression\`)`.

Sections (keep every heading; write `_None in this release._` when empty):

1. **Release Summary.** From → to bundle, platform and theme, and the scope's counts line (quoted from the script, never retyped).
2. **Scope.**
   - 2.1 New modules
   - 2.2 Breaking & runtime changes
   - 2.3 Feature tickets: every ticket with its direct-case count; not-Done/unknown flagged as must-test; zero-case tickets flagged → §5.2
   - 2.4 Removed modules
   - 2.5 Untracked PRs
   - 2.6 Out of scope
3. **Risk Assessment.**
4. **Test Strategy.** 4.1 Run sequence (S7 table, filled with this release's values), 4.2 Layers matrix, 4.3 Techniques.
5. **Suites, Gaps, Charters.** 5.1.1 Frontend / 5.1.2 Backend, 5.2, 5.3 (with the mandatory "Not chartered (and why)" line).
6. **Upgrade Checks.** Columns: `| ID | Module | Check | Source (breaking_changes.md row / cycle PR) | Provenance | Owner | Lane |`.
7. **Entry / Exit Criteria (go / no-go).**
   - Entry: the Phase A dry-run explained, and the baseline run complete.
   - Exit: zero unexplained REGRESSED; every U-check PASS or accepted by the release owner; every must-test ticket tested or accepted.
8. **Test Data Requirements.**
9. **Run Log.** Baseline RUN_ID · deploy PR · after RUN_ID · compare line. Filled in as the phases run.
10. **Resources / Agent Assignments.**
11. **References.** Bundle PR, `release_notes.md`, `breaking_changes.md`, `update_path.md`, the scope JSON, the release ticket.

**`stable-{N}-summary.json`** (keys exactly as below; values derived, never typed from memory):

```json
{
  "release": "Stable{N}",
  "mode": "stable",
  "bundle": {"from": "v{N-1}", "to": "v{N}", "ref": "{ref}"},
  "platform": {"from": "", "to": ""},
  "theme": {"from": "", "to": ""},
  "environment": "vcptcore_regression",
  "releaseTicket": "VCST-…",
  "cycleTickets": [],
  "componentCounts": {"changed": 0, "added": 0, "removed": 0, "same": 0},
  "untestedTickets": [],
  "upgradeChecks": [{"id": "U-01", "module": "", "check": "", "provenance": "SPEC", "owner": "qa-backend-expert"}],
  "domains": [{"name": "", "score": 0, "level": "Critical|High|Medium|Low"}],
  "suitesActivated": [],
  "waves": {
    "critical": {"suites": [], "cases": 0},
    "high": {"suites": [], "cases": 0},
    "directRest": {"suites": [], "ids": []}
  },
  "ticketsWithoutCases": [],
  "exploratoryCharters": [],
  "runs": {
    "baseline": {"critical": null, "high": null, "directRest": null},
    "deployPr": null,
    "after": {"critical": null, "high": null, "directRest": null},
    "compare": {"critical": null, "high": null, "directRest": null}
  },
  "artifacts": "vc/shared/docs/Release plans/"
}
```

`waves` and `ticketsWithoutCases` are copied from `stable-{N}-cases.json`. `suitesActivated` = the union of the wave suites.
`/qa-regression stable:<N> --cases critical|high` reads `waves.<tier>.suites` and `environment`. Whoever runs a phase updates `runs.*` and §9 in the same edit.

## S9 — Output summary to the user

```
Stable {N} Test Plan — DRAFT  ({from} → v{N} @ {ref})
Platform {a} → {b} · Theme {c} → {d}
Components: {changed} changed · {added} added · {removed} removed
Cycle tickets: … · Feature tickets: {f} ({n} not Done, {g} with no case) · Upgrade checks: {u}
Critical-risk domains: […] · Charters: {e}
W1 Critical: {c1} cases / {s1} suites · W2 High: {c2} / {s2} · W3 direct: {c3}

Plan:    vc/shared/docs/Release plans/stable-{N}-test-plan.md
Summary: vc/shared/docs/Release plans/stable-{N}-summary.json

Next: Phase A → TEST_ENV=vcptcore_regression /qa-regression stable:{N} --cases critical   (then high, then W3)
      Phase B → npm run deploy:bundle -- --env=vcptcore_regression --bundle=v{N} --ref={ref}   (dry-run; --apply needs your yes)
```

## Forecast — `stable next`

Answers "what will the next stable carry, and what should we start testing now?" before the cut.

1. `npm run release:scope -- next --out="vc/shared/docs/Release plans/stable-next-forecast-<YYYY-MM-DD>-scope.json"`.
   This compares the latest shipped stable with the latest release of every module in it, plus the latest platform and theme releases.
2. Write `vc/shared/docs/Release plans/stable-next-forecast-<YYYY-MM-DD>.md` (≤ 120 lines, `.claude/rules/reports.md` §2 spirit):
   1. **What is in flight:** the counts line + the components with the widest version jump.
   2. **Released but not Done:** `tickets[done=false]` → test early on `vcst` with `/qa-test <KEY>`.
   3. **Domains to start regression early:** §Risk over the changed components, without the stable adjustments (no cycle yet).
   4. **Unknowns:** `notes[]`. A module released outside the current bundle is invisible to the forecast (it only follows modules the stable already has); say so.
3. No summary.json and no regression selection. A forecast is a reading aid, not a run scope.
````

- [ ] **Step 5: Rewrite `.claude/commands/qa-test-plan.md` as the router**

````markdown
---
description: "Test plans. Sprint: JIRA Done items + merged PRs → sprint-XX-YY-test-plan.md. Stable: the vc-modules bundle diff (vN-1 → vN) → an acceptance + upgrade-path plan for vcptcore-regression. Forecast (stable next): what the next stable will carry and what to test early."
argument-hint: "SprintXX-YY | XX-YY | current | last | stable <N> [--ref <branch>] | stable next"
disable-model-invocation: true
---

# /qa-test-plan — Sprint and Stable-Release Test Plans

One command, three modes. They differ only in **where the scope comes from**. Risk scoring, suite mapping, gaps
and charters are shared: [`plan-sections.md`](../knowledge/execution/test-plan/plan-sections.md).

| Mode | Invocation | Scope source | Output |
|---|---|---|---|
| Sprint | `/qa-test-plan 26-20` · `Sprint26-20` · `current` · `last` | JIRA Done items + PRs merged in the sprint window | `vc/shared/docs/Sprint plans/sprint-{XX-YY}-test-plan.md` + `-summary.json` |
| Stable | `/qa-test-plan stable 16 [--ref <vc-modules branch>]` | `npm run release:scope` (the bundle diff in `VirtoCommerce/vc-modules`) → `npm run release:cases` (every release feature → suites + cases, Critical/High first) | `vc/shared/docs/Release plans/stable-{N}-test-plan.md` + `-summary.json` + `-scope.json` + `-cases.json` |
| Forecast | `/qa-test-plan stable next` | `npm run release:scope -- next`: latest stable → latest releases | `vc/shared/docs/Release plans/stable-next-forecast-{YYYY-MM-DD}.md` |

You run the orchestration inline. Delegate only the sections the mode file names to `test-management-specialist`,
and never to another orchestrator agent.

## Route

1. **First argument `stable`** → read and follow [`stable-mode.md`](../knowledge/execution/test-plan/stable-mode.md).
2. **Anything else** → read and follow [`sprint-mode.md`](../knowledge/execution/test-plan/sprint-mode.md).
3. If neither parses, ask for the sprint label or the bundle number. Never guess.
4. Both modes then apply [`plan-sections.md`](../knowledge/execution/test-plan/plan-sections.md): §Risk, §Delegation, §Gap-diff, §Charters, §Shared rules.

## Flags

| Flag | Mode | Effect |
|------|------|--------|
| `--no-jira` | both | Sprint: skip Atlassian MCP, build scope from PRs + git log. Stable: skip the ticket-status lookup (tickets read `unknown`) |
| `--frontend` | sprint | Restrict PR review to `VirtoCommerce/vc-frontend` |
| `--from <date>` / `--to <date>` | sprint | Override the sprint window (ISO 8601) |
| `--ref <branch>` | stable | Read the target bundle from a `vc-modules` branch (a stable under review lives on its PR branch) |
| `--from vN` | stable | Compare against a bundle other than the previous entry of `bundles/stable.json` |
| `--draft` | both | `Document status: Draft`, skip the risk-score validation gates |
| `--no-suites` | both | Skip §5.1 suite mapping |
| `--no-sitemap` | sprint | Skip Step 0 (storefront sitemap refresh) |

## Duplicate guard (both modes)

If the target plan file already exists, ask whether to overwrite it or write a `-v2` suffix. Never overwrite silently.

## Next steps the output points at

- Sprint: `/qa-test-cases-generator`, `/qa-test`, `/qa-regression sprint[:XX-YY]`, `/qa-exploratory sprint`.
- Stable: Phase A `/qa-regression stable:<N>` on `vcptcore_regression`, Phase B `npm run deploy:bundle` (dry-run; `--apply` only after the user's yes), Phase C the same regression + upgrade checks, Phase D `npm run release:compare`.
````

- [ ] **Step 6: Re-point every inbound citation from Step 1**

For each hit, replace `qa-test-plan.md` (+ its Step/§) with the new file that holds that heading:
- Steps 0–4, 6a, 7 → `knowledge/execution/test-plan/sprint-mode.md`
- Step 5, 6b, 6c, 6d → `knowledge/execution/test-plan/plan-sections.md`

Use paths relative to the citing file. Keep the step names.

- [ ] **Step 7: Gate**

```bash
node -e 'for (const f of [".claude/commands/qa-test-plan.md"]) console.log(f, require("fs").readFileSync(f,"utf8").length)'
npm run context:check:baseline
npm run context:check; echo "exit=$?"
```
Expected:
- The command is under 19,000 chars.
- `context:check:baseline` removes its baseline entry (it is now under the cap).
- `context:check` exits 0 with no new dangling path, missing script or missing `§` heading.
- If a `§` citation fails, the target heading text was changed. Restore it verbatim.

- [ ] **Step 8: Commit**

```bash
git add .claude/commands/qa-test-plan.md .claude/knowledge/execution/test-plan scripts/maintenance/.prompt-size-baseline.json
git status --short   # also `git add` every file re-pointed in Step 6, by path
git commit -F - -- .claude/commands/qa-test-plan.md .claude/knowledge/execution/test-plan scripts/maintenance/.prompt-size-baseline.json <re-pointed files…> <<'EOF'
feat(qa-test-plan): stable-release mode + forecast; command becomes a router

/qa-test-plan stable <N> plans a stable bundle from the vc-modules diff (release:scope) as an
acceptance + upgrade-path plan on vcptcore-regression: baseline on vN-1 → deploy:bundle PR →
same regression + upgrade checks → release:compare. `stable next` forecasts the next stable.
Sprint mode is unchanged and moved verbatim to knowledge/execution/test-plan/sprint-mode.md;
risk / delegation / gap-diff / charters are shared in plan-sections.md. The command drops under
the BUDGET-004 cap and leaves the shrink-only baseline.

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: `/qa-regression stable:N` + references

**Files:**
- Modify: `.claude/commands/qa-regression.md` (argument-hint line 3, usage block lines 16-21, §1c lines 156-182, selection table lines 403-404, rule at line 431)
- Modify: `.claude/knowledge/execution/regression-selection.md` (new section `## Plan-driven selection — sprint and stable plans`)
- Modify: `.claude/rules/regression.md` (one row in §Selection Groups)

No code ⇒ no unit test. The gate is `context:check`. **`qa-regression.md` is at its baseline (40,251), so the net edit must not add a single character.**

- [ ] **Step 1: Move §1c verbatim into `regression-selection.md`**

Append to `.claude/knowledge/execution/regression-selection.md`:

```markdown
## Plan-driven selection — sprint and stable plans

Read by `/qa-regression` §1c. Moved verbatim from `qa-regression.md` on 2026-10-05 (VCST-6177), plus `stable:N`.

**`stable:N`** reads `vc/shared/docs/Release plans/stable-{N}-summary.json` (`/qa-test-plan stable N`).
- Missing → abort: "No stable plan for {N}. Run /qa-test-plan stable {N} first." There is no static fallback, because a stable's scope is its bundle diff, not a generic group.
- Same `suitesActivated[]` validation, the same `--frontend`/`--backend` layer filter (3a below) and the same resolved-from log (4 below), with `Release:` in place of `Sprint:`.
- A stable plan runs in **waves**.
  - `stable:N --cases critical` resolves `waves.critical.suites` and `stable:N --cases high` resolves `waves.high.suites`. Each keeps only that tier's cases, through the normal `--cases` filter.
  - W3 is not a tier. The plan writes it as an explicit `/qa-regression <waves.directRest.suites> --ids <waves.directRest.ids>`.
  - `stable:N` with no `--cases` runs `suitesActivated[]` whole. Warn that this is broader than the plan's waves.
- The summary's `environment` names where the plan's baseline and after-runs belong (`vcptcore_regression`). Warn when `TEST_ENV` differs: a stable's before/after delta is only meaningful on one env.
- Log the RUN_ID so the operator can record it under `runs.baseline.<wave>` / `runs.after.<wave>`.
```

Then paste current `qa-regression.md` lines 158-182 (from "The static `sprint` selection group…" to step 5) verbatim beneath it.

- [ ] **Step 2: Replace §1c in `qa-regression.md` with a pointer**

Replace lines 156-182 with:

```markdown
**1c. Plan-driven selection** (`sprint`, `sprint:XX-YY`, `stable:N`; skipped with `--no-plan`): run the plan's `summary.json` → `suitesActivated[]` (unknown IDs dropped with a warning), honour `--frontend`/`--backend`, and log the resolved-from line. Resolution order, file locations, the layer filter, the log format and the `stable:N` environment check: [`regression-selection.md`](../knowledge/execution/regression-selection.md) §Plan-driven selection — sprint and stable plans.
```

- [ ] **Step 3: Add `stable:N` to the three short spots**

- Line 3 argument-hint: change `sprint|sprint:XX-YY|full` to `sprint|sprint:XX-YY|stable:N|full`.
- Usage block: add after line 19:
  `/qa-regression stable:16                   # Run a stable plan's suites (vc/shared/docs/Release plans/stable-16-summary.json) — on TEST_ENV=vcptcore_regression, before and after the bundle deploy`
- Selection table: add after the `sprint:XX-YY` row (line 404):
  `| \`stable:N\` | Plan-driven — \`Release plans/stable-{N}-summary.json\` → \`suitesActivated[]\`; no static fallback | Stable release, before + after the bundle deploy |`
- Line 431 rule: change "When selection is `sprint`" to "When selection is `sprint` or `stable:N`" and `sprint-*-summary.json` to `sprint-*` / `stable-*-summary.json`.

- [ ] **Step 4: Measure, and tighten if over**

```bash
node -e 'console.log(require("fs").readFileSync(".claude/commands/qa-regression.md","utf8").length, "≤ 40251 ?")'
```
Expected: ≤ 40,251. If it is over, shorten the new usage line's comment first, then the table row's last cell. Never touch other content to make room.

- [ ] **Step 5: One row in `.claude/rules/regression.md` §Selection Groups**

Add after the `sprint:XX-YY` row:

```markdown
| `stable:N` | **Plan-driven** — `/qa-test-plan stable N` writes `vc/shared/docs/Release plans/stable-{N}-summary.json`; run it on `vcptcore_regression` before and after the bundle deploy, then `npm run release:compare` |
```

- [ ] **Step 6: Gate and commit**

```bash
npm run context:check:baseline
npm run context:check; echo "exit=$?"
npm test 2>&1 | tail -5
git add .claude/commands/qa-regression.md .claude/knowledge/execution/regression-selection.md .claude/rules/regression.md scripts/maintenance/.prompt-size-baseline.json
git commit -F - -- .claude/commands/qa-regression.md .claude/knowledge/execution/regression-selection.md .claude/rules/regression.md scripts/maintenance/.prompt-size-baseline.json <<'EOF'
feat(qa-regression): stable:N plan-driven selection

/qa-regression stable:N runs a stable plan's suitesActivated[] (no static fallback) and warns when
TEST_ENV is not the plan's environment. §1c moved verbatim to regression-selection.md, so the
command shrinks while gaining the selection.

Refs VCST-6177

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Expected: `context:check` exits 0; `npm test` is green; the `qa-regression.md` baseline is equal or lower.

---

### Task 10: End-to-end dry run on Stable 16 (read-only acceptance)

No new files are committed by this task. The plan file for Stable 16 itself is produced by a real `/qa-test-plan stable 16` run, which is the user's call.

- [ ] **Step 1: Scope**

```bash
npm run release:scope -- v16 --ref=feat/VCST-6042-stable-16-bundle --out="$TEMP/stable-16-scope.json"; echo "exit=$?"
node -e 'const s=require(process.env.TEMP+"/stable-16-scope.json");console.log(s.counts, s.cycleTickets, s.breaking && s.breaking.rows.length)'
```
Expected:
- exit 0.
- `counts.added` ≥ 5.
- `cycleTickets` ⊇ `VCST-6042`, `VCST-5901`.
- `breaking.rows.length` ≥ 1 (the Stable 16 §4 table).

- [ ] **Step 1b: Cases and waves**

```bash
npm run release:cases -- --scope="$TEMP/stable-16-scope.json" --out="$TEMP/stable-16-cases.json"; echo "exit=$?"
node -e 'const c=require(process.env.TEMP+"/stable-16-cases.json"), m=new Set(require("./config/test-suites.json").suites.map(s=>s.id));const all=[...c.waves.critical.suites,...c.waves.high.suites,...c.waves.directRest.suites];console.log("unknown suite ids:", all.filter(i=>!m.has(i)), "| W1", c.waves.critical.cases, "W2", c.waves.high.cases, "W3", c.waves.directRest.ids.length, "| tickets w/o case", c.tickets.filter(t=>!t.cases.length).length)'
```
Expected: exit 0, `unknown suite ids: []`, and non-zero W1/W2.

- [ ] **Step 2: Deploy plan (dry-run only)**

```bash
npm run deploy:bundle -- --env=vcptcore_regression --bundle=v16 --ref=feat/VCST-6042-stable-16-bundle --json > "$TEMP/pin16.json"; echo "exit=$?"
node -e 'const p=require(process.env.TEMP+"/pin16.json");console.log(p.rows.filter(r=>r.status==="ADD").map(r=>r.id), p.blocked, p.notes)'
```
Expected: the ADD list contains the five new modules, `blocked` is `[]` (or explained), and the theme note is present.

- [ ] **Step 3: Full gate**

```bash
npm test 2>&1 | tail -3
npm run context:check; echo "exit=$?"
git status --short   # only the user's pre-staged VCST-5670 files may remain staged; no tmp-*.test.ts anywhere
ls scripts/unit/tmp-* 2>/dev/null && echo "TEMP TEST LEFT BEHIND" || echo "clean"
```
Expected: green, exit 0, `clean`.

- [ ] **Step 4: Report to the user**

Report the scope summary line, the pin table counts and every BLOCKED/notes line.

Do NOT open a PR, push, run `--apply`, or comment on Jira. Offer as the next steps:
- (a) push + open the ai-tools PR (Refs VCST-6177)
- (b) run `/qa-test-plan stable 16` for real
- (c) start Phase A on `vcptcore_regression`
