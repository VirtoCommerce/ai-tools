# /preflight — Phase 1 Implementation Plan (fact core + change-scoped pre-flight)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the env/build pre-flight that six `.claude/` commands each restate with one skill, `/preflight`, backed by a policy-free fact core and a change-scoped CLI.

**Architecture:** `scripts/lib/env-facts.ts` gathers facts (health, declared, deployed, storefront-visible, drift, ledger) by composing existing deploy/ledger code. `scripts/preflight/` turns facts into checks with one change-scoped policy, renders one output form, and is exposed as `npm run preflight`. `.claude/skills/preflight/SKILL.md` is the LLM half: MCP level 3, kb → VirtoOZ → Context7 grounding, interpretation, remediation loop. Six commands and `agent-dispatch.md` then cite the skill instead of restating a procedure.

**Tech Stack:** Node 18+ ES modules, TypeScript run by `tsx`, `node:test` (temporary tests only), `dotenv` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-10-08-preflight-skill-design.md` (VCST-6225). Read §4–§8b and §13 before Task 1.

## Global Constraints

- **NO CODE ⇒ NO UNIT TEST; where there is code, the unit test is TEMPORARY** (`CLAUDE.md` §Essential Rules → Testing). Every test file in this plan is created, run, and **deleted before the task's commit**. Never `git add` a file under `scripts/unit/`. The committed corpus only shrinks.
- **Never transcribe a value that has a source of truth** (`.claude/rules/test-data.md` GOLDEN RULE): required env vars, module ids, MCP requirements, policy windows each live in exactly one place.
- **Read-only.** Nothing in `scripts/lib/env-facts.ts` or `scripts/preflight/` writes a file, a tracker, or a remote. The CLI prints; the consumer stores.
- **`deployed` UNKNOWN is never replaced by `declared`.** Platform version has **no live source** (`/api/platform/modules` has no Platform entry and `/api/platform/version` is 404 — `scripts/hotfix/hotfix-deliver.ts:405-408`), so `deployed.platform` is always `UNKNOWN: no-live-source`.
- **No secret in any output.** Tokens and passwords live only inside a call; diagnostics name a variable and its `.env` layer, never its value.
- **Nothing under `ci/` is modified** (spec D7). `plugins/` is modified by nothing (spec D1); importing two pure functions from `plugins/vc-fix/skills/qa-fix-routing/module-registry.ts` is allowed (the repo already imports plugin modules from `scripts/`).
- **BUDGET-004:** a new `SKILL.md` is born under 19,000 chars; files in `scripts/maintenance/.prompt-size-baseline.json` may only shrink. `npm run context:check` must be green at the end of every task that touches `.claude/`.
- **Exit codes of `npm run preflight`:** `0` OK/WARN only · `1` usage error (bad flag — `scripts/lib/cli-args.ts` behaviour) · `2` any BLOCK · `3` the script itself could not run.
- **Verdict words:** `READY` / `NOT READY`. Never `BLOCKED` in pre-flight output (that is a test-run verdict).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Legacy `summary.json` shapes in the duplicate check.** `date` has day precision only (`"2026-10-06"`) and `build` is free-form (`"UNKNOWN (not probed)"` strings, nested `build.deployed`). Expect: the 2 h window uses the file's mtime, and an unreadable `build` yields `priorBuild: null`, never a crash. Pinned in Task 6.
2. **Prerelease versions in Δ comparisons.** Deployed modules routinely carry `3.1011.0-pr-194-8331`. `cmpSemver` reads the PR suffix as larger numbers, so a PR build of a base version counts as ≥ that release. Expect: a PR build is never reported as "released but not deployed" for its own base version. Pinned in Task 4.
3. **`BACK_URL` unset or `.env.<env>` missing.** Expect: `config.missing` names the variable, `health`/`deployed` are `UNKNOWN` with reason `no-back-url`, and the CLI still renders (exit 2 via the config BLOCK), never throws. Pinned in Task 4.
4. **`.mcp.json` absent (fresh clone).** Expect: project-scope servers report `ABSENT`, user-scope servers report `NOT_VISIBLE` (not ABSENT), and a REQ_FALLBACK server absent is a WARN naming its fallback. Pinned in Task 5.
5. **Storefront probe with `XAPI.Security.ReturnModuleVersion` OFF.** Every version is `""`. Expect: `storefrontVisible.versionsHidden: true` and no module is reported missing on that basis. Pinned in Task 2.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/lib/env-core.js` (create) | the single list of CORE required vars + the `_${TEST_ENV}` suffix promotion | 1 |
| `config.js` (modify) | imports both from `env-core.js` instead of declaring them | 1 |
| `scripts/deploy/lib/live.ts` (modify) | `probeAdminToken`, `probeLiveModules` returning status + `projectUrl`; old functions become wrappers | 1 |
| `scripts/deploy/lib/manifest.ts` (modify) | `listPinnedModules(json)` beside `pinnedModule` | 1 |
| `scripts/lib/storefront-caps.mjs` (create) | anonymous `InitializeApplication` probe as a function that returns, never exits | 2 |
| `scripts/maintenance/probe-store-capabilities.mjs` (modify) | thin CLI over `storefront-caps.mjs` | 2 |
| `scripts/lib/release-ledger-read.ts` (create) | parse `release-ledger.md` §1 table, §2 rows, frontmatter | 3 |
| `scripts/lib/env-facts.ts` (create) | `getEnvFacts()` + pure derivations `computeDrift`, `computeLedgerFacts`, `resolveComponentRepos` | 4 |
| `.claude/skills/preflight/mcp-requirements.json` (create) | normative MCP minimum requirements per consumer | 5 |
| `scripts/preflight/mcp-static.ts` (create) | MCP levels 1–2 from `.mcp.json` + the requirements file | 5 |
| `scripts/preflight/policy.ts` (create) | change-scoped policy + remedy catalog → `checks[]`; sprint + duplicate lookups | 6 |
| `scripts/preflight/render.ts` (create) | the one output form (spec §8a) | 7 |
| `scripts/preflight/cli.ts` (create) + `package.json` `preflight` script | arg parsing, wiring, exit codes | 8 |
| `.claude/skills/preflight/SKILL.md` (create), `.claude/skills/README.md` (modify) | the LLM half (spec §8, §8a, §8b) | 9 |
| `.claude/commands/qa-test.md`, `.claude/skills/qa-test/preflight.md` (modify) | cite the skill; fix the five inconsistencies | 10 |
| `.claude/commands/qa-test-fast.md`, `qa-exploratory.md`, `qa-test-lifecycle.md` (modify) | cite the skill | 11 |
| `.claude/commands/qa-domain-map.md`, `ba-analyze.md`, `.claude/templates/agent-dispatch.md` (modify) | cite the skill; keep `§Build Verification` doctrine | 12 |

---

### Task 1: Fact sources — env core vars, live probe with status, declared module list

**Files:**
- Create: `scripts/lib/env-core.js`
- Modify: `config.js:69-80` (the `coreRequiredVars` array) and the suffix-promotion loop (`config.js`, the block starting `const ENV_SUFFIX =`)
- Modify: `scripts/deploy/lib/live.ts`
- Modify: `scripts/deploy/lib/manifest.ts` (add after `pinnedModule`)
- Temporary test: `scripts/unit/preflight-sources.test.ts` (deleted before commit)

**Interfaces:**
- Produces:
  - `CORE_REQUIRED_VARS: readonly string[]`, `promoteEnvSuffix(testEnv: string): void` from `scripts/lib/env-core.js`
  - `type ProbeStatus = number | 'network' | 'no-back-url'`
  - `probeAdminToken(c: EnvCoords): Promise<{ token: string | null; status: ProbeStatus }>`
  - `interface LiveModule { id: string; version: string; projectUrl?: string }`
  - `probeLiveModules(c: EnvCoords, token: string): Promise<{ ok: true; modules: LiveModule[] } | { ok: false; status: ProbeStatus }>`
  - `listPinnedModules(json: any): { id: string; version: string; source: string }[]`
  - unchanged public behaviour of `getAdminToken`, `liveModules`, `platformHealthy`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/unit/preflight-sources.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeLiveModules, probeAdminToken, liveModules } from "../deploy/lib/live.ts";
import { listPinnedModules } from "../deploy/lib/manifest.ts";
import { CORE_REQUIRED_VARS, promoteEnvSuffix } from "../lib/env-core.js";

const coords = { env: "vcst", deployOwner: "VirtoCommerce", deployRepo: "vc-deploy-dev", branch: "vcst-qa",
  packagesPath: "backend/packages.json", themePath: "theme/artifact.json", backUrl: "https://b.example", admin: "admin", password: "x" };

function stubFetch(status: number, body: unknown) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

test("probeLiveModules keeps projectUrl and the original id case", async () => {
  stubFetch(200, [{ id: "VirtoCommerce.XCart", version: "3.1038.0", projectUrl: "https://github.com/VirtoCommerce/vc-module-x-cart" }]);
  const r = await probeLiveModules(coords, "t");
  assert.deepEqual(r, { ok: true, modules: [{ id: "VirtoCommerce.XCart", version: "3.1038.0", projectUrl: "https://github.com/VirtoCommerce/vc-module-x-cart" }] });
});

test("probeLiveModules reports the HTTP status on failure", async () => {
  stubFetch(401, {});
  assert.deepEqual(await probeLiveModules(coords, "t"), { ok: false, status: 401 });
});

test("probeAdminToken: no BACK_URL is its own status, not a network error", async () => {
  assert.deepEqual(await probeAdminToken({ ...coords, backUrl: "" }), { token: null, status: "no-back-url" });
});

test("liveModules wrapper keeps its lower-cased map contract", async () => {
  stubFetch(200, [{ id: "VirtoCommerce.Cart", version: "3.1005.0" }]);
  assert.deepEqual(await liveModules(coords, "t"), { "virtocommerce.cart": "3.1005.0" });
});

test("listPinnedModules reads Id entries and BlobName-only entries", () => {
  const json = { Sources: [
    { Name: "GithubReleases", Modules: [{ Id: "VirtoCommerce.Cart", Version: "3.1005.0" }] },
    { Name: "AzureBlob", Modules: [{ BlobName: "VirtoCommerce.XCart_3.1038.0-pr-141-b404.zip" }] },
  ] };
  assert.deepEqual(listPinnedModules(json), [
    { id: "VirtoCommerce.Cart", version: "3.1005.0", source: "GithubReleases" },
    { id: "VirtoCommerce.XCart", version: "3.1038.0-pr-141-b404", source: "AzureBlob" },
  ]);
});

test("CORE_REQUIRED_VARS carries BACK_URL and promoteEnvSuffix promotes a per-env key", () => {
  assert.ok(CORE_REQUIRED_VARS.includes("BACK_URL"));
  process.env.SOME_KEY_VCST = "v";
  promoteEnvSuffix("vcst");
  assert.equal(process.env.SOME_KEY, "v");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/preflight-sources.test.ts`
Expected: FAIL — `Cannot find module '../lib/env-core.js'` (and missing exports `probeLiveModules`, `probeAdminToken`, `listPinnedModules`).

- [ ] **Step 3: Create `scripts/lib/env-core.js`**

```js
// scripts/lib/env-core.js — the env facts config.js and the pre-flight core must agree on.
// One list, one promotion rule: config.js used to own both inline, and a second reader
// (scripts/lib/env-facts.ts) would otherwise have had to transcribe them.

/** CORE — must exist for any suite to run (config.js exits 1 when one is missing). */
export const CORE_REQUIRED_VARS = Object.freeze([
  // URLs (both surfaces)
  'FRONT_URL',
  'BACK_URL',
  // Credentials (both surfaces)
  'ADMIN',
  'ADMIN_PASSWORD',
  'USER_EMAIL',
  'USER_PASSWORD',
  // Store context
  'STORE_ID',
]);

/**
 * Per-env override promotion: any key ending in `_${TEST_ENV.toUpperCase()}` is promoted to its
 * base name, so `.env.local` can carry per-env variants (USER_PASSWORD_VIRTOSTART) without leaking
 * them into committed files.
 */
export function promoteEnvSuffix(testEnv) {
  const suffix = `_${String(testEnv).toUpperCase()}`;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith(suffix) && value) process.env[key.slice(0, -suffix.length)] = value;
  }
}
```

- [ ] **Step 4: Make `config.js` use it**

At the top of `config.js`, after the existing imports, add:

```js
import { CORE_REQUIRED_VARS, promoteEnvSuffix } from './scripts/lib/env-core.js';
```

Replace the promotion block (from the comment `// Per-env override promotion:` through the closing `}` of its `for` loop) with:

```js
// Per-env override promotion — rule lives in scripts/lib/env-core.js.
promoteEnvSuffix(TEST_ENV);
```

Replace the whole `const coreRequiredVars = [ … ];` declaration (lines 69–80) with:

```js
const coreRequiredVars = CORE_REQUIRED_VARS; // single source: scripts/lib/env-core.js
```

- [ ] **Step 5: Add the status-carrying probes to `scripts/deploy/lib/live.ts`**

Replace the body of the file below the `import type` line with:

```ts
export type ProbeStatus = number | 'network' | 'no-back-url';
export interface LiveModule { id: string; version: string; projectUrl?: string }

// ── live verify (/api/platform/modules) ─────────────────────────────────────────
/** Admin token plus WHY it failed — pre-flight's diagnosis needs 401 vs 5xx vs no BACK_URL. */
export async function probeAdminToken(c: EnvCoords): Promise<{ token: string | null; status: ProbeStatus }> {
  if (!c.backUrl) return { token: null, status: 'no-back-url' };
  try {
    const r = await fetch(`${c.backUrl}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'password', username: c.admin, password: c.password }) });
    if (r.status !== 200) return { token: null, status: r.status };
    return { token: (await r.json())?.access_token ?? null, status: 200 };
  } catch { return { token: null, status: 'network' }; }
}
export async function getAdminToken(c: EnvCoords): Promise<string | null> {
  return (await probeAdminToken(c)).token;
}
/** Installed modules with their original id case and ProjectUrl (the authoritative id → repo link). */
export async function probeLiveModules(c: EnvCoords, token: string): Promise<{ ok: true; modules: LiveModule[] } | { ok: false; status: ProbeStatus }> {
  if (!c.backUrl) return { ok: false, status: 'no-back-url' };
  try {
    const r = await fetch(`${c.backUrl}/api/platform/modules`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return { ok: false, status: r.status };
    const mods = await r.json();
    const modules: LiveModule[] = [];
    for (const m of Array.isArray(mods) ? mods : []) {
      if (!m?.id) continue;
      modules.push({ id: String(m.id), version: String(m.version ?? ''), ...(m.projectUrl ? { projectUrl: String(m.projectUrl) } : {}) });
    }
    return { ok: true, modules };
  } catch { return { ok: false, status: 'network' }; }
}
export async function liveModules(c: EnvCoords, token: string): Promise<Record<string, string> | null> {
  const r = await probeLiveModules(c, token);
  if (!r.ok) return null;
  const out: Record<string, string> = {};
  for (const m of r.modules) out[m.id.toLowerCase()] = m.version;
  return out;
}
export async function platformHealthy(c: EnvCoords): Promise<boolean> {
  try { return (await fetch(`${c.backUrl}/health`, { redirect: 'manual' })).status === 200; } catch { return false; }
}
```

- [ ] **Step 6: Add `listPinnedModules` to `scripts/deploy/lib/manifest.ts`, directly after `pinnedModule`**

```ts
/** Every pinned module, by the same two rules `pinnedModule` applies to one Id. */
export function listPinnedModules(json: any): { id: string; version: string; source: string }[] {
  const out: { id: string; version: string; source: string }[] = [];
  for (const s of json?.Sources ?? []) for (const m of s?.Modules ?? []) {
    if (m?.Id) { out.push({ id: String(m.Id), version: String(m.Version), source: String(s.Name ?? '') }); continue; }
    if (typeof m?.BlobName === 'string') {
      const bm = m.BlobName.match(/^(.+)_(\d.*)\.zip$/i);
      if (bm) out.push({ id: bm[1], version: bm[2], source: String(s.Name ?? 'AzureBlob') });
    }
  }
  return out;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/preflight-sources.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Run the existing suites that cover the modified files**

Run: `npm test`
Expected: PASS (the deploy and config consumers are unchanged in behaviour).
Run: `npm run env:check`
Expected: same output as before the change (it imports `config.js`).

- [ ] **Step 9: Delete the temporary test, then commit**

```bash
rm scripts/unit/preflight-sources.test.ts
git add scripts/lib/env-core.js config.js scripts/deploy/lib/live.ts scripts/deploy/lib/manifest.ts
git commit -m "feat(preflight): fact sources - env core vars, status-carrying live probe, pinned module list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Storefront capability probe as a library function

**Files:**
- Create: `scripts/lib/storefront-caps.mjs`
- Modify: `scripts/maintenance/probe-store-capabilities.mjs` (the `fixture` + `gql` functions and the first `gql(...)` call)
- Temporary test: `scripts/unit/preflight-storefront.test.mjs` (deleted before commit)

**Interfaces:**
- Produces:
  - `readQueryFixture(root: string, name: string): string`
  - `storefrontGql(backUrl: string, query: string, variables: object): Promise<object>` — throws `Error` on HTTP error or GraphQL `errors`
  - `probeStorefrontModules({ backUrl, domain, root }): Promise<{ ok: true, storeUrl: string, versionsHidden: boolean, modules: { moduleId: string, version: string }[] } | { ok: false, reason: string }>`

- [ ] **Step 1: Write the failing test**

```js
// scripts/unit/preflight-storefront.test.mjs — TEMPORARY. Delete before commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeStorefrontModules } from '../lib/storefront-caps.mjs';

const root = process.cwd();
const ok = (store) => { globalThis.fetch = async () => new Response(JSON.stringify({ data: { store } }), { status: 200 }); };

test('modules sorted, versions kept', async () => {
  ok({ storeUrl: 'https://s', settings: { modules: [{ moduleId: 'VirtoCommerce.XCart', version: '3.1' }, { moduleId: 'VirtoCommerce.Cart', version: '3.0' }] } });
  const r = await probeStorefrontModules({ backUrl: 'https://b', domain: 'd', root });
  assert.equal(r.ok, true);
  assert.deepEqual(r.modules.map((m) => m.moduleId), ['VirtoCommerce.Cart', 'VirtoCommerce.XCart']);
  assert.equal(r.versionsHidden, false);
});

test('ReturnModuleVersion OFF: every version empty ⇒ versionsHidden', async () => {
  ok({ storeUrl: 'https://s', settings: { modules: [{ moduleId: 'A', version: '' }, { moduleId: 'B', version: '' }] } });
  assert.equal((await probeStorefrontModules({ backUrl: 'https://b', domain: 'd', root })).versionsHidden, true);
});

test('no store for the domain is a reason, not an exit', async () => {
  ok(null);
  const r = await probeStorefrontModules({ backUrl: 'https://b', domain: 'nope', root });
  assert.deepEqual(r, { ok: false, reason: 'no-store-for-domain' });
});

test('GraphQL errors are a reason, not an exit', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ message: 'x' }] }), { status: 200 });
  const r = await probeStorefrontModules({ backUrl: 'https://b', domain: 'd', root });
  assert.equal(r.ok, false);
  assert.match(r.reason, /^graphql:/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/preflight-storefront.test.mjs`
Expected: FAIL — `Cannot find module '../lib/storefront-caps.mjs'`.

- [ ] **Step 3: Create `scripts/lib/storefront-caps.mjs`**

```js
// scripts/lib/storefront-caps.mjs — the storefront's own anonymous app-boot query
// (InitializeApplication) as a function. Returns a reason instead of exiting, so the
// pre-flight core can record UNKNOWN and carry on. The query is READ from the schema-gated
// fixture (GOLDEN RULE), never transcribed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** A fixture body without its `#` metadata header. */
export function readQueryFixture(root, name) {
  const p = resolve(root, 'test-data/graphql/queries', `${name}.graphql`);
  return readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n').trim();
}

export async function storefrontGql(backUrl, query, variables) {
  const res = await fetch(`${backUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    const err = new Error(`HTTP ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

export async function probeStorefrontModules({ backUrl, domain, root }) {
  let data;
  try {
    data = await storefrontGql(backUrl, readQueryFixture(root, 'initializeApplicationClient'), { domain });
  } catch (e) {
    return { ok: false, reason: `graphql: ${e.message}` };
  }
  const store = data?.store;
  if (!store) return { ok: false, reason: 'no-store-for-domain' };
  const modules = (store.settings?.modules ?? []).slice().sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  const versionsHidden = modules.length > 0 && modules.every((m) => !m.version);
  return { ok: true, storeUrl: store.storeUrl, versionsHidden, modules };
}
```

- [ ] **Step 4: Make `probe-store-capabilities.mjs` a thin wrapper**

Add to its imports:

```js
import { readQueryFixture, storefrontGql, probeStorefrontModules } from '../lib/storefront-caps.mjs';
```

Replace its `function fixture(name) { … }` and `async function gql(query, variables) { … }` with:

```js
const fixture = (name) => readQueryFixture(ROOT, name);

async function gql(query, variables) {
  try {
    return await storefrontGql(backUrl, query, variables);
  } catch (e) {
    console.error(`GraphQL error (${e.message})`);
    process.exit(1);
  }
}
```

Replace the block from `const data = await gql(fixture('initializeApplicationClient'), { domain });` through `const versionsHidden = …;` with:

```js
const probe = await probeStorefrontModules({ backUrl, domain, root: ROOT });
if (!probe.ok) {
  console.error(probe.reason === 'no-store-for-domain'
    ? `No store resolved for domain "${domain}" — check FRONT_URL / --domain.`
    : `GraphQL error (${probe.reason})`);
  process.exit(1);
}
const store = { storeUrl: probe.storeUrl };
const modules = probe.modules;
const shown = FILTER ? modules.filter((m) => m.moduleId.toLowerCase().includes(FILTER)) : modules;
const versionsHidden = probe.versionsHidden;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/preflight-storefront.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify the CLI is unchanged live**

Run: `npm run store:caps -- --json` (on `TEST_ENV=vcst`)
Expected: the same JSON keys as before (`probedIso, backUrl, domain, storeId, storeUrl, versionsHidden, moduleCount, modules, storeSettings`) and a non-zero `moduleCount`.

- [ ] **Step 7: Delete the temporary test, then commit**

```bash
rm scripts/unit/preflight-storefront.test.mjs
git add scripts/lib/storefront-caps.mjs scripts/maintenance/probe-store-capabilities.mjs
git commit -m "feat(preflight): storefront capability probe as a reusable function

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Release-ledger reader

**Files:**
- Create: `scripts/lib/release-ledger-read.ts`
- Temporary test: `scripts/unit/preflight-ledger.test.ts` (deleted before commit)

**Interfaces:**
- Produces:
  - `interface LedgerLatest { component: string; latest: string; since: string; repo: string }`
  - `interface LedgerRow { month: string; feature: string; component: string; version: string; repo: string; breaking: boolean }`
  - `interface Ledger { generated: string | null; staleAfterDays: number | null; latest: LedgerLatest[]; rows: LedgerRow[] }`
  - `parseLedger(text: string): Ledger`
  - `readLedger(root?: string): Ledger | null` — `null` when the file is absent
  - `LEDGER_PATH: string` (repo-relative `.claude/knowledge/domain/release-ledger.md`)

- [ ] **Step 1: Write the failing test**

```ts
// scripts/unit/preflight-ledger.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLedger, readLedger } from "../lib/release-ledger-read.ts";

const SAMPLE = `---
generated: 2026-09-01
stale_after_days: 45
---

## 1. Latest known version per component

| Component | Latest | Since | Repo |
|---|---|---|---|
| Cart | \`3.1005.0\` | 2026-07 | \`vc-module-cart\` |

## 2. Last 6 months in full

### 2026-09 — September 2026 · [digest](https://x) · edited 2026-09-01

| Feature | Component @ version | Docs |
|---|---|---|
| Plain feature | [Sales Rep 3.1002.0](https://github.com/VirtoCommerce/vc-module-sales-rep/releases/tag/3.1002.0) | — |
| ⚠ **BREAKING** — Invites | [Customer 3.1021.0](https://github.com/VirtoCommerce/vc-module-customer/releases/tag/3.1021.0) | [doc](https://d) |

## 3. Older months — index
| not | a row |
`;

test("frontmatter", () => {
  const l = parseLedger(SAMPLE);
  assert.equal(l.generated, "2026-09-01");
  assert.equal(l.staleAfterDays, 45);
});

test("§1 table", () => {
  assert.deepEqual(parseLedger(SAMPLE).latest, [{ component: "Cart", latest: "3.1005.0", since: "2026-07", repo: "vc-module-cart" }]);
});

test("§2 rows: repo and version from the release URL, BREAKING flag, month", () => {
  const rows = parseLedger(SAMPLE).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { month: "2026-09", feature: "⚠ **BREAKING** — Invites", component: "Customer", version: "3.1021.0", repo: "vc-module-customer", breaking: true });
  assert.equal(rows[0].breaking, false);
});

test("§3 is not read as §2", () => {
  assert.ok(parseLedger(SAMPLE).rows.every((r) => r.month === "2026-09"));
});

test("the real ledger parses to a non-empty §1 and §2", () => {
  const l = readLedger();
  assert.ok(l && l.latest.length > 0 && l.rows.length > 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/preflight-ledger.test.ts`
Expected: FAIL — `Cannot find module '../lib/release-ledger-read.ts'`.

- [ ] **Step 3: Implement `scripts/lib/release-ledger-read.ts`**

```ts
// scripts/lib/release-ledger-read.ts — read-only view of release-ledger.md for the pre-flight core.
// The ledger is GENERATED (scripts/maintenance/refresh-release-ledger.mjs); this reads its two
// machine-shaped parts — §1's table and §2's per-month rows — and never edits it.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LEDGER_PATH = ".claude/knowledge/domain/release-ledger.md";

export interface LedgerLatest { component: string; latest: string; since: string; repo: string }
export interface LedgerRow { month: string; feature: string; component: string; version: string; repo: string; breaking: boolean }
export interface Ledger { generated: string | null; staleAfterDays: number | null; latest: LedgerLatest[]; rows: LedgerRow[] }

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isRow = (line: string) => line.trim().startsWith("|") && !/^\|\s*-/.test(line.trim());
const unTick = (s: string) => s.replace(/`/g, "").trim();

function section(text: string, startRe: RegExp): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

export function parseLedger(text: string): Ledger {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const generated = /^generated:\s*(\S+)/m.exec(fm)?.[1] ?? null;
  const staleRaw = /^stale_after_days:\s*(\d+)/m.exec(fm)?.[1];

  const latest: LedgerLatest[] = [];
  for (const line of section(text, /^## 1\./)) {
    if (!isRow(line)) continue;
    const [component, l, since, repo] = cells(line);
    if (!component || component === "Component") continue;
    latest.push({ component, latest: unTick(l), since, repo: unTick(repo) });
  }

  const rows: LedgerRow[] = [];
  let month = "";
  for (const line of section(text, /^## 2\./)) {
    const m = /^### (\d{4}-\d{2})/.exec(line);
    if (m) { month = m[1]; continue; }
    if (!isRow(line) || !month) continue;
    const [feature, comp] = cells(line);
    const link = /\[(.+?) (\d[^\]]*)\]\(https:\/\/github\.com\/[^/]+\/([^/]+)\/releases\/tag\/[^)]+\)/.exec(comp ?? "");
    if (!link) continue;
    rows.push({ month, feature, component: link[1], version: link[2], repo: link[3], breaking: /BREAKING/.test(feature) });
  }

  return { generated, staleAfterDays: staleRaw ? Number(staleRaw) : null, latest, rows };
}

export function readLedger(root: string = REPO_ROOT): Ledger | null {
  const p = join(root, LEDGER_PATH);
  return existsSync(p) ? parseLedger(readFileSync(p, "utf8")) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/preflight-ledger.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Delete the temporary test, then commit**

```bash
rm scripts/unit/preflight-ledger.test.ts
git add scripts/lib/release-ledger-read.ts
git commit -m "feat(preflight): read-only release-ledger parser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The fact core — `getEnvFacts()`

**Files:**
- Create: `scripts/lib/env-facts.ts`
- Temporary test: `scripts/unit/preflight-env-facts.test.ts` (deleted before commit)

**Interfaces:**
- Consumes: Task 1 (`CORE_REQUIRED_VARS`, `promoteEnvSuffix`, `probeAdminToken`, `probeLiveModules`, `listPinnedModules`), Task 2 (`probeStorefrontModules`), Task 3 (`Ledger`, `readLedger`), existing `resolveEnvCoords`, `loadEnvFiles` (`scripts/deploy/lib/env.ts`), `fetchFile`, `setToken` (`scripts/deploy/lib/github.ts`), `platformHealthy`, `THEME_URL_RE` (`scripts/deploy/lib/manifest.ts`), `cmpSemver` (`scripts/maintenance/refresh-release-ledger.mjs`), `repoFromProjectUrl`, `moduleIdToRepoGuess` (`plugins/vc-fix/skills/qa-fix-routing/module-registry.ts`), `resolveTestEnv` (`scripts/lib/resolve-test-env.js`).
- Produces (everything later tasks use):

```ts
export interface Unknown { unknown: string }               // reason, e.g. "401", "no-back-url", "no-live-source"
export const isUnknown = (v: unknown): v is Unknown => …;
export interface DeployedModule { version: string; repo: string | null; repoGuessed: boolean }
export interface DriftRow { id: string; declared: string | null; deployed: string | null }
export interface ReleasedNotDeployed { component: string; repo: string; released: string; deployed: string | null; feature: string }
export interface LedgerFacts { generated: string | null; stale: boolean | null; releasedNotDeployed: ReleasedNotDeployed[]; breaking: LedgerRow[] }
export interface EnvFacts {
  env: string; observedAt: string; backUrl: string; frontUrl: string;
  config: { missing: string[] };
  health: "UP" | "DOWN" | Unknown;
  declared: { platform: string | null; theme: string | null; modules: Record<string, string> } | Unknown;   // keys: lower-cased module id
  deployed: { platform: Unknown; modules: Record<string, DeployedModule> } | Unknown;                        // keys: lower-cased module id
  storefrontVisible: { versionsHidden: boolean; modules: Record<string, string> } | Unknown | null;          // null = not requested
  drift: DriftRow[] | Unknown;
  ledger: LedgerFacts | Unknown;
  components: { input: string; repo: string | null }[];
}
export interface EnvFactsOptions { env?: string; components?: string[]; storefront?: boolean; now?: Date }
export async function getEnvFacts(opts?: EnvFactsOptions): Promise<EnvFacts>;
export function computeDrift(declared: Record<string, string>, deployed: Record<string, DeployedModule>): DriftRow[];
export function computeLedgerFacts(ledger: Ledger, deployed: Record<string, DeployedModule> | null, repos: string[], now: Date): LedgerFacts;
export function resolveComponentRepos(inputs: string[], ledger: Ledger | null, deployed: Record<string, DeployedModule> | null): { input: string; repo: string | null }[];
```

- [ ] **Step 1: Write the failing test (pure derivations)**

```ts
// scripts/unit/preflight-env-facts.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDrift, computeLedgerFacts, resolveComponentRepos, getEnvFacts, isUnknown } from "../lib/env-facts.ts";
import type { Ledger } from "../lib/release-ledger-read.ts";

const dep = (version: string, repo: string) => ({ version, repo, repoGuessed: false });

test("drift: only modules whose versions differ, both directions, sorted by id", () => {
  const rows = computeDrift(
    { "virtocommerce.cart": "3.1005.0", "virtocommerce.xcart": "3.1038.0", "virtocommerce.only.declared": "1.0.0" },
    { "virtocommerce.cart": dep("3.1005.0", "vc-module-cart"), "virtocommerce.xcart": dep("3.1037.0", "vc-module-x-cart"), "virtocommerce.only.live": dep("2.0.0", "vc-module-only-live") },
  );
  assert.deepEqual(rows, [
    { id: "virtocommerce.only.declared", declared: "1.0.0", deployed: null },
    { id: "virtocommerce.only.live", declared: null, deployed: "2.0.0" },
    { id: "virtocommerce.xcart", declared: "3.1038.0", deployed: "3.1037.0" },
  ]);
});

const ledger: Ledger = {
  generated: "2026-09-01", staleAfterDays: 45,
  latest: [{ component: "Sales Rep", latest: "3.1006.0", since: "2026-09", repo: "vc-module-sales-rep" }],
  rows: [
    { month: "2026-09", feature: "Library", component: "Sales Rep", version: "3.1006.0", repo: "vc-module-sales-rep", breaking: false },
    { month: "2026-09", feature: "⚠ **BREAKING** — Invites", component: "Customer", version: "3.1021.0", repo: "vc-module-customer", breaking: true },
  ],
};

test("ledger: released-not-deployed when deployed is older; BREAKING only for requested repos", () => {
  const f = computeLedgerFacts(ledger, { "virtocommerce.salesrep": dep("3.1003.0", "vc-module-sales-rep") }, ["vc-module-sales-rep"], new Date("2026-10-08"));
  assert.equal(f.releasedNotDeployed.length, 1);
  assert.equal(f.releasedNotDeployed[0].released, "3.1006.0");
  assert.deepEqual(f.breaking, []);
  assert.equal(f.stale, false);
});

test("ledger: a PR build of the released base is NOT released-not-deployed (Review Focus 2)", () => {
  const f = computeLedgerFacts(ledger, { "virtocommerce.salesrep": dep("3.1006.0-pr-21-8964", "vc-module-sales-rep") }, ["vc-module-sales-rep"], new Date("2026-10-08"));
  assert.deepEqual(f.releasedNotDeployed, []);
});

test("ledger: deployed unknown ⇒ the row is reported with deployed null, never compared to declared", () => {
  const f = computeLedgerFacts(ledger, null, ["vc-module-customer"], new Date("2026-10-08"));
  assert.equal(f.breaking.length, 1);
  assert.equal(f.releasedNotDeployed[0].deployed, null);
});

test("ledger: stale past stale_after_days", () => {
  assert.equal(computeLedgerFacts(ledger, null, [], new Date("2026-11-01")).stale, true);
});

test("components resolve by repo, ledger component name, or module id", () => {
  const r = resolveComponentRepos(["vc-module-cart", "sales rep", "VirtoCommerce.Customer", "Nonexistent"], ledger,
    { "virtocommerce.customer": dep("3.1021.0", "vc-module-customer") });
  assert.deepEqual(r, [
    { input: "vc-module-cart", repo: "vc-module-cart" },
    { input: "sales rep", repo: "vc-module-sales-rep" },
    { input: "VirtoCommerce.Customer", repo: "vc-module-customer" },
    { input: "Nonexistent", repo: null },
  ]);
});

test("no BACK_URL: config names it, health/deployed are UNKNOWN, nothing throws (Review Focus 3)", async () => {
  const saved = process.env.BACK_URL;
  process.env.BACK_URL = "";
  const f = await getEnvFacts({ env: "no_such_env_for_test" });
  process.env.BACK_URL = saved;
  assert.ok(f.config.missing.includes("BACK_URL"));
  assert.ok(isUnknown(f.health));
  assert.ok(isUnknown(f.deployed));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/preflight-env-facts.test.ts`
Expected: FAIL — `Cannot find module '../lib/env-facts.ts'`.

- [ ] **Step 3: Implement `scripts/lib/env-facts.ts`**

```ts
// scripts/lib/env-facts.ts — the pre-flight FACT CORE. Read-only, no policy: it never says
// OK/WARN/BLOCK. Every source can be UNKNOWN on its own without failing the others.
// Spec: docs/superpowers/specs/2026-10-08-preflight-skill-design.md §4.
import { basename } from "node:path";
import { CORE_REQUIRED_VARS, promoteEnvSuffix } from "./env-core.js";
import { resolveTestEnv } from "./resolve-test-env.js";
import { loadEnvFiles, resolveEnvCoords, REPO_ROOT } from "../deploy/lib/env.ts";
import { fetchFile, setToken } from "../deploy/lib/github.ts";
import { platformHealthy, probeAdminToken, probeLiveModules } from "../deploy/lib/live.ts";
import { listPinnedModules, THEME_URL_RE } from "../deploy/lib/manifest.ts";
import { probeStorefrontModules } from "./storefront-caps.mjs";
import { readLedger, type Ledger, type LedgerRow } from "./release-ledger-read.ts";
import { cmpSemver } from "../maintenance/refresh-release-ledger.mjs";
import { repoFromProjectUrl, moduleIdToRepoGuess } from "../../plugins/vc-fix/skills/qa-fix-routing/module-registry.ts";

export interface Unknown { unknown: string }
export const isUnknown = (v: unknown): v is Unknown => typeof v === "object" && v !== null && "unknown" in v;
const U = (reason: string): Unknown => ({ unknown: reason });

export interface DeployedModule { version: string; repo: string | null; repoGuessed: boolean }
export interface DriftRow { id: string; declared: string | null; deployed: string | null }
export interface ReleasedNotDeployed { component: string; repo: string; released: string; deployed: string | null; feature: string }
export interface LedgerFacts { generated: string | null; stale: boolean | null; releasedNotDeployed: ReleasedNotDeployed[]; breaking: LedgerRow[] }
export interface EnvFacts {
  env: string; observedAt: string; backUrl: string; frontUrl: string;
  config: { missing: string[] };
  health: "UP" | "DOWN" | Unknown;
  declared: { platform: string | null; theme: string | null; modules: Record<string, string> } | Unknown;
  deployed: { platform: Unknown; modules: Record<string, DeployedModule> } | Unknown;
  storefrontVisible: { versionsHidden: boolean; modules: Record<string, string> } | Unknown | null;
  drift: DriftRow[] | Unknown;
  ledger: LedgerFacts | Unknown;
  components: { input: string; repo: string | null }[];
}
export interface EnvFactsOptions { env?: string; components?: string[]; storefront?: boolean; now?: Date }

/** The base version a PR / prerelease build is built from: 3.1006.0-pr-21-8964 → 3.1006.0. */
const baseOf = (v: string) => v.split("-")[0];

export function computeDrift(declared: Record<string, string>, deployed: Record<string, DeployedModule>): DriftRow[] {
  const ids = [...new Set([...Object.keys(declared), ...Object.keys(deployed)])].sort();
  const rows: DriftRow[] = [];
  for (const id of ids) {
    const d = declared[id] ?? null;
    const l = deployed[id]?.version ?? null;
    if (d !== l) rows.push({ id, declared: d, deployed: l });
  }
  return rows;
}

export function computeLedgerFacts(ledger: Ledger, deployed: Record<string, DeployedModule> | null, repos: string[], now: Date): LedgerFacts {
  const wanted = new Set(repos);
  const deployedByRepo = new Map<string, string>();
  for (const m of Object.values(deployed ?? {})) if (m.repo) deployedByRepo.set(m.repo, m.version);
  const releasedNotDeployed: ReleasedNotDeployed[] = [];
  for (const row of ledger.rows) {
    if (!wanted.has(row.repo)) continue;
    const live = deployed ? deployedByRepo.get(row.repo) ?? null : null;
    // A PR build of the released base counts as having it (Review Focus 2).
    if (live !== null && cmpSemver(baseOf(live), row.version) >= 0) continue;
    releasedNotDeployed.push({ component: row.component, repo: row.repo, released: row.version, deployed: live, feature: row.feature });
  }
  const breaking = ledger.rows.filter((r) => r.breaking && wanted.has(r.repo));
  let stale: boolean | null = null;
  if (ledger.generated && ledger.staleAfterDays !== null) {
    const ageDays = (now.getTime() - new Date(ledger.generated).getTime()) / 86_400_000;
    stale = ageDays > ledger.staleAfterDays;
  }
  return { generated: ledger.generated, stale, releasedNotDeployed, breaking };
}

export function resolveComponentRepos(inputs: string[], ledger: Ledger | null, deployed: Record<string, DeployedModule> | null): { input: string; repo: string | null }[] {
  return inputs.map((input) => {
    const s = input.trim();
    if (/^vc-/i.test(s)) return { input, repo: s.toLowerCase() };
    if (/^VirtoCommerce\./i.test(s)) {
      const live = deployed?.[s.toLowerCase()];
      return { input, repo: live?.repo ?? moduleIdToRepoGuess(s) };
    }
    const byName = ledger?.latest.find((l) => l.component.toLowerCase() === s.toLowerCase());
    return { input, repo: byName?.repo ?? null };
  });
}

export async function getEnvFacts(opts: EnvFactsOptions = {}): Promise<EnvFacts> {
  const env = opts.env ?? resolveTestEnv("vcst");
  const now = opts.now ?? new Date();
  loadEnvFiles(env);
  promoteEnvSuffix(env);
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
  const c = resolveEnvCoords(env);
  const frontUrl = (process.env.FRONT_URL || "").replace(/\/$/, "");
  const missing = CORE_REQUIRED_VARS.filter((v) => !process.env[v]);
  if (!c.backUrl && !missing.includes("BACK_URL")) missing.push("BACK_URL");

  const health: EnvFacts["health"] = c.backUrl ? ((await platformHealthy(c)) ? "UP" : "DOWN") : U("no-back-url");

  // declared — vc-deploy-dev, branch per env
  let declared: EnvFacts["declared"];
  try {
    const pk = await fetchFile(c, c.packagesPath);
    const modules: Record<string, string> = {};
    for (const m of listPinnedModules(pk.json)) modules[m.id.toLowerCase()] = m.version;
    let theme: string | null = null;
    try {
      const th = await fetchFile(c, c.themePath);
      const url = THEME_URL_RE.exec(th.text)?.[0];
      theme = url ? basename(url).replace(/\.zip$/i, "") : null;
    } catch { theme = null; }
    declared = { platform: pk.json.PlatformImageTag ?? pk.json.PlatformVersion ?? null, theme, modules };
  } catch (e) {
    declared = U(`vc-deploy-dev: ${(e as Error).message}`);
  }

  // deployed — the only ground truth; platform has no live source
  let deployed: EnvFacts["deployed"];
  const tok = await probeAdminToken(c);
  if (!tok.token) {
    deployed = U(`token: ${tok.status}`);
  } else {
    const live = await probeLiveModules(c, tok.token);
    if (!live.ok) deployed = U(`modules: ${live.status}`);
    else {
      const modules: Record<string, DeployedModule> = {};
      for (const m of live.modules) {
        const fromUrl = repoFromProjectUrl(m.projectUrl);
        modules[m.id.toLowerCase()] = { version: m.version, repo: fromUrl ?? moduleIdToRepoGuess(m.id), repoGuessed: !fromUrl };
      }
      deployed = { platform: U("no-live-source"), modules };
    }
  }

  let storefrontVisible: EnvFacts["storefrontVisible"] = null;
  if (opts.storefront) {
    if (!c.backUrl || !frontUrl) storefrontVisible = U("no-back-or-front-url");
    else {
      const sf = await probeStorefrontModules({ backUrl: c.backUrl, domain: new URL(frontUrl).host, root: REPO_ROOT });
      storefrontVisible = sf.ok
        ? { versionsHidden: sf.versionsHidden, modules: Object.fromEntries(sf.modules.map((m: { moduleId: string; version: string }) => [m.moduleId.toLowerCase(), m.version])) }
        : U(sf.reason);
    }
  }

  const deployedMods = isUnknown(deployed) ? null : deployed.modules;
  const drift: EnvFacts["drift"] = isUnknown(declared) || !deployedMods
    ? U(isUnknown(declared) ? "declared-unknown" : "deployed-unknown")
    : computeDrift(declared.modules, deployedMods);

  const ledgerDoc = readLedger();
  const components = resolveComponentRepos(opts.components ?? [], ledgerDoc, deployedMods);
  const repos = components.map((x) => x.repo).filter((r): r is string => !!r);
  const ledger: EnvFacts["ledger"] = ledgerDoc ? computeLedgerFacts(ledgerDoc, deployedMods, repos, now) : U("ledger-file-absent");

  return { env, observedAt: now.toISOString(), backUrl: c.backUrl, frontUrl, config: { missing }, health, declared, deployed, storefrontVisible, drift, ledger, components };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/preflight-env-facts.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Smoke the core live (read-only)**

Run: `npx tsx -e "import('./scripts/lib/env-facts.ts').then(async m => console.log(JSON.stringify(await m.getEnvFacts({ components: ['Sales Rep','Customer'], storefront: true }), null, 2)))"`
Expected on `vcst`: `health: "UP"`; `declared.modules` non-empty; `deployed.modules` non-empty with `repo` mostly `repoGuessed: false`; `deployed.platform: { unknown: "no-live-source" }`; `storefrontVisible.modules` non-empty; no password or token anywhere in the output.

- [ ] **Step 6: Delete the temporary test, then commit**

```bash
rm scripts/unit/preflight-env-facts.test.ts
git add scripts/lib/env-facts.ts
git commit -m "feat(preflight): env-facts core - health, declared, deployed, storefront, drift, ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: MCP requirements (data) + static levels 1–2

**Files:**
- Create: `.claude/skills/preflight/mcp-requirements.json`
- Create: `scripts/preflight/mcp-static.ts`
- Temporary test: `scripts/unit/preflight-mcp.test.ts` (deleted before commit)

**Interfaces:**
- Produces:
  - `type Consumer = "ticket" | "ticket-fast" | "exploratory" | "lifecycle" | "domain-map" | "ba" | "regression" | "smoke"`
  - `type ReqClass = "REQ" | "REQ_FALLBACK" | "OPT"`
  - `interface McpRequirements { servers: Record<string, { scope: "project" | "user"; toolSearch: string; fallback: string | null; lane?: boolean }>; consumers: Record<Consumer, Record<string, { class: ReqClass; when?: string }>>; lanes: Record<Consumer, { min: number; want: number }> }`
  - `loadMcpRequirements(root?: string): McpRequirements` — throws with a precise message on a malformed file (validated by hand; no schema dependency)
  - `interface McpStatic { server: string; scope: "project" | "user"; class: ReqClass; level: "ABSENT" | "CONFIGURED" | "READY" | "NOT_VISIBLE"; problem: string | null; fallback: string | null; when?: string }`
  - `checkMcpStatic(consumer: Consumer, reqs: McpRequirements, mcpJson: any | null, readFile: (p: string) => string | null): { servers: McpStatic[]; liveLanes: number; lanes: { min: number; want: number } }`

- [ ] **Step 1: Create the requirements data file**

```json
{
  "_comment": "Normative MCP minimum requirements per pre-flight consumer (spec §7). REQ = absent ⇒ BLOCK; REQ_FALLBACK = absent ⇒ WARN naming the fallback; OPT = absent ⇒ that lane SKIPPED, never PASS. scope=user servers are invisible to the CLI and resolved by the skill (level 3). toolSearch is the ToolSearch query that finds the server's tools.",
  "servers": {
    "atlassian":         { "scope": "user",    "toolSearch": "+atlassian getJiraIssue", "fallback": "Jira REST via JIRA_API_TOKEN, else the user pastes the ticket" },
    "github":            { "scope": "project", "toolSearch": "+github get_pull_request", "fallback": "gh CLI / GIT_TOKEN REST" },
    "kb":                { "scope": "project", "toolSearch": "select:mcp__kb__kb_ask", "fallback": "npm run kb -- ask" },
    "virtooz":           { "scope": "user",    "toolSearch": "PlatformUserGuide StorefrontUserGuide", "fallback": "Context7 /virtocommerce/vc-docs" },
    "context7":          { "scope": "project", "toolSearch": "+context7 query-docs", "fallback": null },
    "playwright-chrome": { "scope": "project", "toolSearch": "+playwright-chrome browser_navigate", "fallback": "next lane in the fallback chain", "lane": true },
    "playwright-edge":   { "scope": "project", "toolSearch": "+playwright-edge browser_navigate", "fallback": "next lane in the fallback chain", "lane": true },
    "playwright-firefox":{ "scope": "project", "toolSearch": "+playwright-firefox browser_navigate", "fallback": "next lane in the fallback chain", "lane": true },
    "chrome-devtools":   { "scope": "user",    "toolSearch": "+Chrome_DevTools take_snapshot", "fallback": null },
    "azure":             { "scope": "user",    "toolSearch": "+azure-mcp applicationinsights", "fallback": "APPINSIGHTS_APP_ID_* + APPINSIGHTS_API_KEY_*" }
  },
  "consumers": {
    "ticket":      { "atlassian": { "class": "REQ_FALLBACK" }, "github": { "class": "REQ_FALLBACK" }, "kb": { "class": "REQ_FALLBACK" }, "virtooz": { "class": "REQ_FALLBACK" }, "chrome-devtools": { "class": "OPT", "when": "visual_surface" }, "azure": { "class": "OPT" } },
    "ticket-fast": { "atlassian": { "class": "REQ_FALLBACK" }, "github": { "class": "REQ_FALLBACK" }, "kb": { "class": "REQ_FALLBACK" }, "virtooz": { "class": "REQ_FALLBACK" }, "chrome-devtools": { "class": "OPT", "when": "--visual" }, "azure": { "class": "OPT" } },
    "exploratory": { "atlassian": { "class": "OPT", "when": "ticket mode" }, "kb": { "class": "REQ_FALLBACK" }, "virtooz": { "class": "REQ_FALLBACK" } },
    "lifecycle":   { "github": { "class": "REQ_FALLBACK" }, "kb": { "class": "REQ_FALLBACK" }, "virtooz": { "class": "REQ_FALLBACK" } },
    "domain-map":  { "github": { "class": "REQ_FALLBACK" }, "kb": { "class": "REQ_FALLBACK" }, "virtooz": { "class": "REQ" }, "playwright-firefox": { "class": "REQ_FALLBACK" } },
    "ba":          { "atlassian": { "class": "OPT", "when": "docs ticket mode" }, "github": { "class": "REQ_FALLBACK" }, "kb": { "class": "REQ_FALLBACK" }, "virtooz": { "class": "REQ" } },
    "regression":  { "kb": { "class": "OPT" }, "azure": { "class": "OPT" } },
    "smoke":       { "kb": { "class": "REQ_FALLBACK" }, "virtooz": { "class": "OPT" }, "azure": { "class": "OPT" } }
  },
  "lanes": {
    "ticket": { "min": 1, "want": 3 }, "ticket-fast": { "min": 1, "want": 1 }, "exploratory": { "min": 1, "want": 1 },
    "lifecycle": { "min": 0, "want": 1 }, "domain-map": { "min": 0, "want": 1 }, "ba": { "min": 0, "want": 0 },
    "regression": { "min": 1, "want": 3 }, "smoke": { "min": 1, "want": 1 }
  }
}
```

Note on `virtooz: REQ` for `domain-map` and `ba`: spec §7 footnote 2 — absent with **no Context7** either ⇒ BLOCK. The CLI cannot see VirtoOZ (user scope); the skill applies the rule at level 3 (Task 9, step 2).

- [ ] **Step 2: Write the failing test**

```ts
// scripts/unit/preflight-mcp.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMcpRequirements, checkMcpStatic } from "../preflight/mcp-static.ts";

const reqs = loadMcpRequirements();
const noFiles = () => null;

test("the shipped requirements file loads and every consumer names only known servers", () => {
  for (const [c, req] of Object.entries(reqs.consumers))
    for (const s of Object.keys(req)) assert.ok(reqs.servers[s], `${c} → unknown server ${s}`);
});

test(".mcp.json absent: project servers ABSENT, user servers NOT_VISIBLE (Review Focus 4)", () => {
  const r = checkMcpStatic("ticket", reqs, null, noFiles);
  assert.equal(r.servers.find((s) => s.server === "github")!.level, "ABSENT");
  assert.equal(r.servers.find((s) => s.server === "atlassian")!.level, "NOT_VISIBLE");
  assert.equal(r.liveLanes, 0);
});

test("placeholder key ⇒ CONFIGURED with a problem, not READY", () => {
  const mcp = { mcpServers: { context7: { type: "http", url: "https://mcp.context7.com/mcp", headers: { CONTEXT7_API_KEY: "<CONTEXT7_API_KEY>" } }, kb: { command: "node", args: ["scripts/kb/mcp.mjs"] } } };
  const r = checkMcpStatic("lifecycle", { ...reqs, consumers: { ...reqs.consumers, lifecycle: { context7: { class: "OPT" }, kb: { class: "REQ_FALLBACK" } } } }, mcp, noFiles);
  const c7 = r.servers.find((s) => s.server === "context7")!;
  assert.equal(c7.level, "CONFIGURED");
  assert.match(c7.problem!, /CONTEXT7_API_KEY/);
  assert.equal(r.servers.find((s) => s.server === "kb")!.level, "READY");
});

test("playwright on @latest is CONFIGURED with a pin problem; pinned is READY and counts as a lane", () => {
  const mcp = { mcpServers: {
    "playwright-chrome": { command: "npx", args: ["@playwright/mcp@latest", "--config", "config/mcp-playwright-chrome.config.json"] },
    "playwright-edge": { command: "npx", args: ["@playwright/mcp@0.0.77", "--config", "config/mcp-playwright-edge.config.json"] },
  } };
  const r = checkMcpStatic("ticket", reqs, mcp, noFiles);
  assert.equal(r.liveLanes, 1);
  assert.match(r.servers.find((s) => s.server === "playwright-chrome")!.problem!, /pinned/);
});

test("firefox without the occlusion flag in its config is not READY", () => {
  const mcp = { mcpServers: { "playwright-firefox": { command: "npx", args: ["@playwright/mcp@0.0.77", "--config", "config/mcp-playwright-firefox.config.json"] } } };
  const r = checkMcpStatic("domain-map", reqs, mcp, () => '{"browser":{}}');
  assert.match(r.servers.find((s) => s.server === "playwright-firefox")!.problem!, /occlusion/);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/preflight-mcp.test.ts`
Expected: FAIL — `Cannot find module '../preflight/mcp-static.ts'`.

- [ ] **Step 4: Implement `scripts/preflight/mcp-static.ts`**

```ts
// scripts/preflight/mcp-static.ts — MCP availability levels 1–2 (spec §7): CONFIGURED (present in
// .mcp.json) and READY (no placeholder, env refs resolve, Playwright pinned, firefox occlusion flag).
// Level 3 — callable in THIS session — is the skill's, never this file's.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REQUIREMENTS_PATH = ".claude/skills/preflight/mcp-requirements.json";

export type Consumer = "ticket" | "ticket-fast" | "exploratory" | "lifecycle" | "domain-map" | "ba" | "regression" | "smoke";
export const CONSUMERS: readonly Consumer[] = ["ticket", "ticket-fast", "exploratory", "lifecycle", "domain-map", "ba", "regression", "smoke"];
export type ReqClass = "REQ" | "REQ_FALLBACK" | "OPT";
export interface McpRequirements {
  servers: Record<string, { scope: "project" | "user"; toolSearch: string; fallback: string | null; lane?: boolean }>;
  consumers: Record<Consumer, Record<string, { class: ReqClass; when?: string }>>;
  lanes: Record<Consumer, { min: number; want: number }>;
}
export interface McpStatic {
  server: string; scope: "project" | "user"; class: ReqClass;
  level: "ABSENT" | "CONFIGURED" | "READY" | "NOT_VISIBLE";
  problem: string | null; fallback: string | null; when?: string;
}

export function loadMcpRequirements(root: string = REPO_ROOT): McpRequirements {
  const raw = JSON.parse(readFileSync(join(root, REQUIREMENTS_PATH), "utf8"));
  const fail = (m: string) => { throw new Error(`${REQUIREMENTS_PATH}: ${m}`); };
  if (!raw?.servers || !raw?.consumers || !raw?.lanes) fail("needs servers, consumers and lanes");
  for (const [name, s] of Object.entries<any>(raw.servers)) {
    if (s.scope !== "project" && s.scope !== "user") fail(`servers.${name}.scope must be project|user`);
    if (typeof s.toolSearch !== "string" || !s.toolSearch) fail(`servers.${name}.toolSearch is required`);
  }
  for (const c of CONSUMERS) {
    if (!raw.consumers[c]) fail(`consumers.${c} is missing`);
    if (!raw.lanes[c]) fail(`lanes.${c} is missing`);
    for (const [s, r] of Object.entries<any>(raw.consumers[c])) {
      if (!raw.servers[s]) fail(`consumers.${c}.${s}: unknown server`);
      if (!["REQ", "REQ_FALLBACK", "OPT"].includes(r.class)) fail(`consumers.${c}.${s}.class must be REQ|REQ_FALLBACK|OPT`);
    }
  }
  return raw as McpRequirements;
}

const PLACEHOLDER = /^<.*>$/;
const ENV_REF = /\$\{([A-Z0-9_]+)\}/g;

function readinessProblem(name: string, entry: any, readFile: (p: string) => string | null): string | null {
  const values: string[] = [
    ...Object.values<string>(entry.env ?? {}),
    ...Object.values<string>(entry.headers ?? {}),
    ...(entry.args ?? []).map(String),
  ];
  for (const v of values) {
    if (PLACEHOLDER.test(v)) return `placeholder value ${v} — set it in .env.local and reference it as \${VAR}`;
    for (const m of v.matchAll(ENV_REF)) if (!process.env[m[1]]) return `\${${m[1]}} does not resolve in the layered .env`;
  }
  if (name.startsWith("playwright-")) {
    const pkg = (entry.args ?? []).map(String).find((a: string) => a.startsWith("@playwright/mcp"));
    if (!pkg || !/@playwright\/mcp@\d/.test(pkg)) return `@playwright/mcp must be pinned to a version, found ${pkg ?? "none"}`;
    if (name === "playwright-firefox") {
      const i = (entry.args ?? []).indexOf("--config");
      const cfgPath = i >= 0 ? entry.args[i + 1] : null;
      const cfg = cfgPath ? readFile(cfgPath) : null;
      if (!cfg || !/window_occlusion_tracking/.test(cfg)) return "firefox config lacks widget.windows.window_occlusion_tracking.enabled=false (restart the server after adding it)";
    }
  }
  return null;
}

export const defaultReadFile = (p: string): string | null => {
  const abs = join(REPO_ROOT, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
};

export function readMcpJson(root: string = REPO_ROOT): any | null {
  const p = join(root, ".mcp.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

export function checkMcpStatic(consumer: Consumer, reqs: McpRequirements, mcpJson: any | null, readFile: (p: string) => string | null = defaultReadFile) {
  const configured = mcpJson?.mcpServers ?? {};
  const servers: McpStatic[] = [];
  const wanted = { ...reqs.consumers[consumer] };
  for (const [name, s] of Object.entries(reqs.servers)) if (s.lane && !wanted[name]) wanted[name] = { class: "OPT" };
  for (const [name, r] of Object.entries(wanted)) {
    const s = reqs.servers[name];
    const base = { server: name, scope: s.scope, class: r.class, fallback: s.fallback, ...(r.when ? { when: r.when } : {}) };
    if (s.scope === "user" && !configured[name]) { servers.push({ ...base, level: "NOT_VISIBLE", problem: null }); continue; }
    if (!configured[name]) { servers.push({ ...base, level: "ABSENT", problem: null }); continue; }
    const problem = readinessProblem(name, configured[name], readFile);
    servers.push({ ...base, level: problem ? "CONFIGURED" : "READY", problem });
  }
  const liveLanes = servers.filter((x) => reqs.servers[x.server].lane && x.level === "READY").length;
  return { servers, liveLanes, lanes: reqs.lanes[consumer] };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/preflight-mcp.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Delete the temporary test, then commit**

```bash
rm scripts/unit/preflight-mcp.test.ts
git add .claude/skills/preflight/mcp-requirements.json scripts/preflight/mcp-static.ts
git commit -m "feat(preflight): MCP minimum requirements as data + static levels 1-2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Change-scoped policy, remedy catalog, sprint and duplicate lookups

**Files:**
- Create: `scripts/preflight/policy.ts`
- Temporary test: `scripts/unit/preflight-policy.test.ts` (deleted before commit)

**Interfaces:**
- Consumes: `EnvFacts`, `isUnknown` (Task 4); `McpStatic`, `Consumer` (Task 5); `cmpSemver`.
- Produces:

```ts
export type ChangeFor = "ticket" | "ticket-fast" | "exploratory" | "lifecycle" | "domain-map" | "ba";
export type Status = "OK" | "WARN" | "BLOCK" | "UNKNOWN";
export type Who = "me" | "me, with OK" | "you";
export interface Check { id: string; status: Status; found: string; who: Who | null; do: string | null; diagnose: string[] }
export interface Duplicate { path: string; ageMinutes: number; verdict: string | null; priorBuild: string | null }
export interface PolicyInput { for: ChangeFor; ticket?: string; domain?: string; expect?: { module: string; version: string }; facts: EnvFacts; mcp: { servers: McpStatic[]; liveLanes: number; lanes: { min: number; want: number } }; sprint: string | null; duplicate: Duplicate | null }
export function resolveSprint(root: string): string | null;
export function findDuplicate(root: string, f: ChangeFor, opts: { ticket?: string; domain?: string; now: Date }): Duplicate | null;
export function buildChecks(input: PolicyInput): Check[];
export const isBlocking = (checks: Check[]) => boolean;
```

Policy (spec §5, §8a rule 7, §8b catalog) — this file is its single statement:

| `--for` | health DOWN | duplicate window · where | `expect` behind |
|---|---|---|---|
| `ticket`, `ticket-fast` | BLOCK | 120 min · `reports/tickets/*/<KEY>/summary.json` (file mtime) | BLOCK |
| `exploratory` | WARN | 1440 min · `reports/exploratory/SBTM-*<domain>*` | WARN |
| `lifecycle` | WARN | 1440 min · `reports/test-lifecycle/TLC-*<domain>*` | WARN |
| `domain-map`, `ba` | WARN | — | WARN |

- [ ] **Step 1: Write the failing test**

```ts
// scripts/unit/preflight-policy.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildChecks, findDuplicate, resolveSprint, isBlocking, type PolicyInput } from "../preflight/policy.ts";
import type { EnvFacts } from "../lib/env-facts.ts";

const facts = (over: Partial<EnvFacts> = {}): EnvFacts => ({
  env: "vcst", observedAt: "2026-10-08T12:00:00Z", backUrl: "https://b", frontUrl: "https://f",
  config: { missing: [] }, health: "UP",
  declared: { platform: "3.1057.0", theme: "t", modules: { "virtocommerce.cart": "3.1006.0" } },
  deployed: { platform: { unknown: "no-live-source" }, modules: { "virtocommerce.cart": { version: "3.1005.0", repo: "vc-module-cart", repoGuessed: false } } },
  storefrontVisible: null, drift: [], ledger: { generated: "2026-09-01", stale: false, releasedNotDeployed: [], breaking: [] }, components: [],
  ...over,
});
const input = (over: Partial<PolicyInput> = {}): PolicyInput => ({
  for: "ticket", facts: facts(), mcp: { servers: [], liveLanes: 3, lanes: { min: 1, want: 3 } }, sprint: "Sprint26-20", duplicate: null, ...over,
});
const byId = (cs: ReturnType<typeof buildChecks>, id: string) => cs.find((c) => c.id === id)!;

test("clean input ⇒ all OK, not blocking", () => {
  const cs = buildChecks(input());
  assert.equal(isBlocking(cs), false);
  assert.ok(cs.every((c) => c.status === "OK"));
});

test("health DOWN is a BLOCK for ticket and a WARN for exploratory", () => {
  assert.equal(byId(buildChecks(input({ facts: facts({ health: "DOWN" }) })), "health").status, "BLOCK");
  assert.equal(byId(buildChecks(input({ for: "exploratory", facts: facts({ health: "DOWN" }) })), "health").status, "WARN");
});

test("expect behind deployed ⇒ BLOCK, who 'me, with OK', do /qa-deploy-pr", () => {
  const c = byId(buildChecks(input({ ticket: "VCST-1", expect: { module: "VirtoCommerce.Cart", version: "3.1006.0-pr-812" } })), "expect");
  assert.equal(c.status, "BLOCK");
  assert.equal(c.who, "me, with OK");
  assert.match(c.do!, /\/qa-deploy-pr VCST-1/);
  assert.match(c.found, /has 3\.1005\.0/);
});

test("deployed 401 ⇒ UNKNOWN, who you, never 'declared' in found", () => {
  const c = byId(buildChecks(input({ facts: facts({ deployed: { unknown: "token: 401" } }) })), "deployed");
  assert.equal(c.status, "UNKNOWN");
  assert.equal(c.who, "you");
  assert.doesNotMatch(c.found, /3\.1006/);
});

test("missing secret var ⇒ BLOCK, who you; missing URL var ⇒ who 'me, with OK'", () => {
  const cs = buildChecks(input({ facts: facts({ config: { missing: ["ADMIN_PASSWORD", "FRONT_URL"] } }) }));
  assert.equal(byId(cs, "config:ADMIN_PASSWORD").who, "you");
  assert.equal(byId(cs, "config:FRONT_URL").who, "me, with OK");
  assert.ok(isBlocking(cs));
});

test("REQ_FALLBACK absent ⇒ WARN naming the fallback; lanes below want ⇒ WARN", () => {
  const cs = buildChecks(input({ mcp: { servers: [{ server: "kb", scope: "project", class: "REQ_FALLBACK", level: "ABSENT", problem: null, fallback: "npm run kb -- ask" }], liveLanes: 1, lanes: { min: 1, want: 3 } } }));
  assert.match(byId(cs, "mcp:kb").found, /npm run kb -- ask/);
  assert.equal(byId(cs, "lanes").status, "WARN");
});

test("duplicate: 2 h window by file mtime; legacy free-form build ⇒ priorBuild null (Review Focus 1)", () => {
  const root = mkdtempSync(join(tmpdir(), "pf-"));
  const dir = join(root, "reports/tickets/Sprint26-20/VCST-9");
  mkdirSync(dir, { recursive: true });
  const f = join(dir, "summary.json");
  writeFileSync(f, JSON.stringify({ date: "2026-10-08", verdict: "FAIL", build: { platform: "UNKNOWN (not probed)" } }));
  const now = new Date();
  const d = findDuplicate(root, "ticket", { ticket: "VCST-9", now });
  assert.equal(d!.verdict, "FAIL");
  assert.equal(d!.priorBuild, null);
  const old = new Date(now.getTime() - 3 * 3600_000);
  utimesSync(f, old, old);
  assert.equal(findDuplicate(root, "ticket", { ticket: "VCST-9", now }), null);
});

test("sprint: Sprint-current wins, else the latest SprintXX-XX, else null", () => {
  const root = mkdtempSync(join(tmpdir(), "pf-"));
  assert.equal(resolveSprint(root), null);
  mkdirSync(join(root, "reports/tickets/Sprint26-19"), { recursive: true });
  mkdirSync(join(root, "reports/tickets/Sprint26-20"), { recursive: true });
  assert.equal(resolveSprint(root), "Sprint26-20");
  mkdirSync(join(root, "reports/tickets/Sprint-current"));
  assert.equal(resolveSprint(root), "Sprint-current");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/preflight-policy.test.ts`
Expected: FAIL — `Cannot find module '../preflight/policy.ts'`.

- [ ] **Step 3: Implement `scripts/preflight/policy.ts`**

```ts
// scripts/preflight/policy.ts — the CHANGE-SCOPED policy and the remedy catalog (spec §5, §8a, §8b).
// The single statement of which fact is OK/WARN/BLOCK for which consumer, and of who can fix it.
// Facts come from scripts/lib/env-facts.ts, which carries no policy.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isUnknown, type EnvFacts } from "../lib/env-facts.ts";
import type { McpStatic } from "./mcp-static.ts";
import { cmpSemver } from "../maintenance/refresh-release-ledger.mjs";

export type ChangeFor = "ticket" | "ticket-fast" | "exploratory" | "lifecycle" | "domain-map" | "ba";
export const CHANGE_FOR: readonly ChangeFor[] = ["ticket", "ticket-fast", "exploratory", "lifecycle", "domain-map", "ba"];
export type Status = "OK" | "WARN" | "BLOCK" | "UNKNOWN";
export type Who = "me" | "me, with OK" | "you";
export interface Check { id: string; status: Status; found: string; who: Who | null; do: string | null; diagnose: string[] }
export interface Duplicate { path: string; ageMinutes: number; verdict: string | null; priorBuild: string | null }
export interface PolicyInput {
  for: ChangeFor; ticket?: string; domain?: string; expect?: { module: string; version: string };
  facts: EnvFacts; mcp: { servers: McpStatic[]; liveLanes: number; lanes: { min: number; want: number } };
  sprint: string | null; duplicate: Duplicate | null;
}

const isTicket = (f: ChangeFor) => f === "ticket" || f === "ticket-fast";
const DUP_WINDOW_MIN: Record<ChangeFor, number | null> = { "ticket": 120, "ticket-fast": 120, "exploratory": 1440, "lifecycle": 1440, "domain-map": null, "ba": null };
const SECRET = /PASSWORD|TOKEN|SECRET|KEY/;

const ok = (id: string, found: string): Check => ({ id, status: "OK", found, who: null, do: null, diagnose: [] });

export function resolveSprint(root: string): string | null {
  const dir = join(root, "reports/tickets");
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  if (names.includes("Sprint-current")) return "Sprint-current";
  const sprints = names.filter((n) => /^Sprint\d{2}-\d{2}$/.test(n)).sort();
  return sprints.at(-1) ?? null;
}

function priorBuildOf(json: any): string | null {
  const p = json?.preflight?.deployed;
  if (p && !p.unknown && p.modules) return `deployed modules @ ${json.preflight.observedAt ?? "?"}`;
  const legacy = json?.build?.deployed?.platform ?? json?.build?.platform;
  return typeof legacy === "string" && !/UNKNOWN/i.test(legacy) ? legacy : null;
}

export function findDuplicate(root: string, f: ChangeFor, opts: { ticket?: string; domain?: string; now: Date }): Duplicate | null {
  const windowMin = DUP_WINDOW_MIN[f];
  if (windowMin === null) return null;
  const candidates: string[] = [];
  if (isTicket(f) && opts.ticket) {
    const base = join(root, "reports/tickets");
    if (existsSync(base)) for (const sprint of readdirSync(base)) {
      const p = join(base, sprint, opts.ticket, "summary.json");
      if (existsSync(p)) candidates.push(p);
    }
  } else if (!isTicket(f) && opts.domain) {
    const [dir, prefix] = f === "exploratory" ? ["reports/exploratory", "SBTM-"] : ["reports/test-lifecycle", "TLC-"];
    const base = join(root, dir);
    if (existsSync(base)) for (const n of readdirSync(base))
      if (n.startsWith(prefix) && n.toLowerCase().includes(opts.domain.toLowerCase())) candidates.push(join(base, n));
  }
  let best: Duplicate | null = null;
  for (const p of candidates) {
    const ageMinutes = Math.round((opts.now.getTime() - statSync(p).mtimeMs) / 60_000);
    if (ageMinutes > windowMin) continue;
    let verdict: string | null = null, priorBuild: string | null = null;
    if (p.endsWith(".json")) {
      try { const j = JSON.parse(readFileSync(p, "utf8")); verdict = j.verdict ?? null; priorBuild = priorBuildOf(j); } catch { /* unreadable ⇒ nulls */ }
    }
    if (!best || ageMinutes < best.ageMinutes) best = { path: p.replace(root, "").replace(/^[\\/]/, "").replace(/\\/g, "/"), ageMinutes, verdict, priorBuild };
  }
  return best;
}

export function buildChecks(i: PolicyInput): Check[] {
  const f = i.facts;
  const checks: Check[] = [];

  // config — a missing CORE var blocks every consumer
  for (const v of f.config.missing) {
    const secret = SECRET.test(v);
    checks.push({ id: `config:${v}`, status: "BLOCK", found: `${v} is not set in any .env layer`,
      who: secret ? "you" : "me, with OK",
      do: secret ? `add ${v} to .env.local (value from the team secret store)` : `add ${v} to .env.${f.env}`,
      diagnose: [`which layer: .env.defaults → .env.${f.env} → .env.local (value never printed)`] });
  }

  // health
  if (isUnknown(f.health)) checks.push({ id: "health", status: "UNKNOWN", found: `not probed: ${f.health.unknown}`, who: "you", do: "set BACK_URL", diagnose: [] });
  else if (f.health === "DOWN") checks.push({ id: "health", status: isTicket(i.for) ? "BLOCK" : "WARN", found: `${f.backUrl}/health is not 200`, who: "me",
    do: "wait for the deploy and re-run, or switch TEST_ENV", diagnose: ["/health detail", `gh run list on vc-deploy-dev for the ${f.env} branch`] });
  else checks.push(ok("health", "UP"));

  // declared
  if (isUnknown(f.declared)) checks.push({ id: "declared", status: "UNKNOWN", found: f.declared.unknown, who: "you", do: "gh auth login, or set GIT_TOKEN in .env.local", diagnose: ["gh auth status"] });
  else checks.push(ok("declared", `Platform ${f.declared.platform ?? "?"} · Theme ${f.declared.theme ?? "?"}`));

  // deployed — UNKNOWN is never upgraded
  if (isUnknown(f.deployed)) {
    const auth = /\b40[13]\b/.test(f.deployed.unknown);
    checks.push({ id: "deployed", status: "UNKNOWN", found: `/api/platform/modules → ${f.deployed.unknown}`, who: auth ? "you" : "me",
      do: auth ? "check ADMIN / ADMIN_PASSWORD in .env.local" : "wait and re-run",
      diagnose: ["which .env layer ADMIN_PASSWORD resolves from (value never printed)", "status of POST /connect/token"] });
  } else checks.push(ok("deployed", `${Object.keys(f.deployed.modules).length} modules probed`));

  // drift
  if (!isUnknown(f.drift) && f.drift.length > 0)
    checks.push({ id: "drift", status: "WARN", found: `${f.drift.length} module(s) differ: ${f.drift.slice(0, 3).map((d) => `${d.id} ${d.declared ?? "—"}→${d.deployed ?? "—"}`).join(", ")}`,
      who: "me", do: "wait for the deploy to settle and re-run", diagnose: [`gh run list on vc-deploy-dev for the ${f.env} branch`] });

  // ledger
  if (!isUnknown(f.ledger)) {
    if (f.ledger.stale) checks.push({ id: "ledger", status: "WARN", found: `release-ledger generated ${f.ledger.generated}, past stale_after_days`, who: "me, with OK", do: "npm run releases:refresh, then commit", diagnose: [] });
    for (const b of f.ledger.breaking)
      checks.push({ id: `breaking:${b.repo}`, status: "WARN", found: `⚠ BREAKING ${b.component} ${b.version} (${b.month})`, who: "me",
        do: "consumer rule applies (/qa-test: run FULL); name it in the report header", diagnose: [] });
    for (const r of f.ledger.releasedNotDeployed)
      checks.push({ id: `not-deployed:${r.repo}`, status: "WARN", found: `${r.component} ${r.released} released, deployed ${r.deployed ?? "UNKNOWN"}`, who: "me",
        do: "treat as NOT_DEPLOYED (BLOCKED-on-deploy), never FAIL", diagnose: [] });
  }

  // expect — is the change under test on the stand
  if (i.expect) {
    const id = i.expect.module.toLowerCase();
    const live = isUnknown(f.deployed) ? null : f.deployed.modules[id]?.version ?? null;
    if (isUnknown(f.deployed)) checks.push({ id: "expect", status: "UNKNOWN", found: `${i.expect.module} — deployed state unknown`, who: null, do: "resolve the deployed check first", diagnose: [] });
    else if (live !== null && cmpSemver(live, i.expect.version) >= 0) checks.push(ok("expect", `${i.expect.module} ${live}`));
    else checks.push({ id: "expect", status: isTicket(i.for) ? "BLOCK" : "WARN", found: `${i.expect.module} ${i.expect.version} not deployed (has ${live ?? "none"})`,
      who: "me, with OK", do: `/qa-deploy-pr ${i.ticket ?? "<KEY>"}, or wait`, diagnose: ["is the PR artifact built", "is it in vc-deploy-dev backend/packages.json"] });
  }

  // sprint (ticket only)
  if (isTicket(i.for)) checks.push(i.sprint ? ok("sprint", i.sprint)
    : { id: "sprint", status: "UNKNOWN", found: "no reports/tickets/SprintXX-XX folder", who: "you", do: "name the sprint folder to create", diagnose: [] });

  // duplicate
  if (i.duplicate) checks.push({ id: "duplicate", status: "WARN",
    found: `ran ${i.duplicate.ageMinutes} min ago${i.duplicate.verdict ? `, verdict ${i.duplicate.verdict}` : ""}${i.duplicate.priorBuild ? `, build ${i.duplicate.priorBuild}` : ""}`,
    who: "you", do: `re-run overwrites ${i.duplicate.path} — commit it first if uncommitted`, diagnose: [] });

  // MCP levels 1–2 (user-scope servers are the skill's)
  for (const s of i.mcp.servers) {
    if (s.level === "READY" || s.level === "NOT_VISIBLE" || s.class === "OPT") continue;
    const id = `mcp:${s.server}`;
    if (s.class === "REQ") checks.push({ id, status: "BLOCK", found: `${s.level}${s.problem ? `: ${s.problem}` : ""}`, who: "you", do: "configure it in .mcp.json, then restart the session", diagnose: [] });
    else checks.push({ id, status: "WARN", found: `${s.level}${s.problem ? `: ${s.problem}` : ""} — working via ${s.fallback}`, who: "you",
      do: s.problem ? "fix the entry in .mcp.json, then restart the session" : "add it to .mcp.json and restart, or keep the fallback", diagnose: [] });
  }
  if (i.mcp.liveLanes < i.mcp.lanes.min) checks.push({ id: "lanes", status: "BLOCK", found: `${i.mcp.liveLanes} Playwright lane(s) ready, ${i.mcp.lanes.min} required`, who: "you", do: "configure a pinned playwright-* server in .mcp.json and restart", diagnose: [] });
  else if (i.mcp.liveLanes < i.mcp.lanes.want) checks.push({ id: "lanes", status: "WARN", found: `${i.mcp.liveLanes} of ${i.mcp.lanes.want} lanes ready — the run serialises`, who: "you", do: "proceed serially, or configure the missing lanes", diagnose: [] });

  return checks;
}

export const isBlocking = (checks: Check[]) => checks.some((c) => c.status === "BLOCK");
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/preflight-policy.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Delete the temporary test, then commit**

```bash
rm scripts/unit/preflight-policy.test.ts
git add scripts/preflight/policy.ts
git commit -m "feat(preflight): change-scoped policy, remedy catalog, sprint and duplicate lookups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The output form

**Files:**
- Create: `scripts/preflight/render.ts`
- Temporary test: `scripts/unit/preflight-render.test.ts` (deleted before commit)

**Interfaces:**
- Consumes: `Check` (Task 6), `EnvFacts`, `isUnknown` (Task 4).
- Produces: `renderHuman(meta: { env: string; for: string; ticket?: string; at: Date }, facts: EnvFacts, checks: Check[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/unit/preflight-render.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHuman } from "../preflight/render.ts";
import type { Check } from "../preflight/policy.ts";

const facts: any = { declared: { platform: "3.1057.0", theme: "vc-theme-b2b-vue-2.55.0" }, deployed: { platform: { unknown: "no-live-source" }, modules: {} }, drift: [], ledger: { stale: false } };
const meta = { env: "vcst", for: "ticket", ticket: "VCST-1", at: new Date("2026-10-08T14:02:00Z") };
const okc = (id: string): Check => ({ id, status: "OK", found: "", who: null, do: null, diagnose: [] });

test("clean ⇒ exactly one line with READY and the OK count; platform labelled declared", () => {
  const out = renderHuman(meta, facts, [okc("health"), okc("deployed")]);
  assert.equal(out.trim().split("\n").length, 1);
  assert.match(out, /READY \(2 checks OK\)/);
  assert.match(out, /Platform 3\.1057\.0 \(declared\)/);
});

test("problems ⇒ NOT READY header, counts, only non-OK rows, Who and Do columns", () => {
  const out = renderHuman(meta, facts, [
    okc("health"),
    { id: "expect", status: "BLOCK", found: "x not deployed", who: "me, with OK", do: "/qa-deploy-pr VCST-1", diagnose: [] },
    { id: "deployed", status: "UNKNOWN", found: "→ token: 401", who: "you", do: "check ADMIN_PASSWORD", diagnose: [] },
  ]);
  assert.match(out, /NOT READY — 1 blocker · 0 warnings · 1 unknown · 1 check OK/);
  assert.match(out, /\| # \| Status +\| Check +\| Found +\| Who +\| Do/);
  assert.doesNotMatch(out, /\| health/);
  assert.match(out, /UNKNOWN/);
});

test("UNKNOWN never renders as OK; a WARN-only run is READY with warnings listed", () => {
  const out = renderHuman(meta, facts, [{ id: "duplicate", status: "WARN", found: "ran 5 min ago", who: "you", do: "re-run overwrites", diagnose: [] }]);
  assert.match(out, /READY — 0 blockers · 1 warning/);
  assert.match(out, /\| duplicate/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/preflight-render.test.ts`
Expected: FAIL — `Cannot find module '../preflight/render.ts'`.

- [ ] **Step 3: Implement `scripts/preflight/render.ts`**

```ts
// scripts/preflight/render.ts — the ONE output form (spec §8a). Claude prints this verbatim;
// it never composes its own table. JSON (--json) is what consumers store.
import { isUnknown, type EnvFacts } from "../lib/env-facts.ts";
import type { Check } from "./policy.ts";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function buildLine(f: EnvFacts): string {
  const d = isUnknown(f.declared) ? null : f.declared;
  const platform = d?.platform ? `Platform ${d.platform} (declared)` : "Platform UNKNOWN";
  const theme = d?.theme ? `Theme ${d.theme}` : "Theme UNKNOWN";
  const drift = isUnknown(f.drift) ? "drift: UNKNOWN" : `drift: ${f.drift.length ? plural(f.drift.length, "module") : "none"}`;
  const ledger = isUnknown(f.ledger) ? "ledger: UNKNOWN" : `ledger: ${f.ledger.stale ? "stale" : "fresh"}`;
  return `${platform} · ${theme} · ${drift} · ${ledger}`;
}

export function renderHuman(meta: { env: string; for: string; ticket?: string; at: Date }, facts: EnvFacts, checks: Check[]): string {
  const okN = checks.filter((c) => c.status === "OK").length;
  const block = checks.filter((c) => c.status === "BLOCK").length;
  const warn = checks.filter((c) => c.status === "WARN").length;
  const unknown = checks.filter((c) => c.status === "UNKNOWN").length;
  const scope = meta.ticket ? `${meta.for} ${meta.ticket}` : meta.for;
  const d = isUnknown(facts.declared) ? null : facts.declared;

  if (block + warn + unknown === 0)
    return `Preflight · ${meta.env} · ${scope} · Platform ${d?.platform ?? "UNKNOWN"} (declared) · Theme ${d?.theme ?? "UNKNOWN"} · READY (${plural(okN, "check")} OK)\n`;

  const verdict = block > 0 ? "NOT READY" : "READY";
  const rows = checks.filter((c) => c.status !== "OK");
  const w = {
    status: Math.max(7, ...rows.map((r) => r.status.length)),
    id: Math.max(5, ...rows.map((r) => r.id.length)),
    found: Math.max(5, ...rows.map((r) => r.found.length)),
    who: Math.max(3, ...rows.map((r) => (r.who ?? "—").length)),
  };
  const line = (n: string, s: string, id: string, found: string, who: string, todo: string) =>
    `| ${n} | ${s.padEnd(w.status)} | ${id.padEnd(w.id)} | ${found.padEnd(w.found)} | ${who.padEnd(w.who)} | ${todo} |`;
  const out = [
    `Preflight · ${meta.env} · ${scope} · ${meta.at.toISOString().slice(0, 16).replace("T", " ")}`,
    `Build: ${buildLine(facts)}`,
    "",
    `${verdict} — ${plural(block, "blocker")} · ${plural(warn, "warning")}${unknown ? ` · ${unknown} unknown` : ""} · ${plural(okN, "check")} OK`,
    "",
    line("#", "Status", "Check", "Found", "Who", "Do"),
    `|---|${"-".repeat(w.status + 2)}|${"-".repeat(w.id + 2)}|${"-".repeat(w.found + 2)}|${"-".repeat(w.who + 2)}|----|`,
    ...rows.map((r, k) => line(String(k + 1), r.status, r.id, r.found, r.who ?? "—", r.do ?? "—")),
  ];
  return out.join("\n") + "\n";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/preflight-render.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Delete the temporary test, then commit**

```bash
rm scripts/unit/preflight-render.test.ts
git add scripts/preflight/render.ts
git commit -m "feat(preflight): the one output form - READY/NOT READY, non-OK rows with Who and Do

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The CLI — `npm run preflight`

**Files:**
- Create: `scripts/preflight/cli.ts`
- Modify: `package.json` `scripts` (add `"preflight": "npx tsx scripts/preflight/cli.ts"` next to `"store:caps"`)

**Interfaces:**
- Consumes: Tasks 4–7.
- Produces: the command `npm run preflight -- --for <ticket|ticket-fast|exploratory|lifecycle|domain-map|ba> [--ticket KEY] [--components A,B] [--domain slug] [--expect Module.Id@version] [--storefront] [--json]`. JSON shape on `--json`: `{ for, ticket, domain, sprint, duplicate, facts, mcp, checks, verdict: "READY" | "NOT READY" }`.

- [ ] **Step 1: Implement `scripts/preflight/cli.ts`**

```ts
// scripts/preflight/cli.ts — change-scoped pre-flight (spec §5). Read-only: prints, never writes.
// Exit: 0 OK/WARN · 1 usage error · 2 any BLOCK · 3 could not run.
import "../lib/sync-stdio.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enumFlag, flagValue, rejectUnknownFlags } from "../lib/cli-args.ts";
import { getEnvFacts } from "../lib/env-facts.ts";
import { checkMcpStatic, loadMcpRequirements, readMcpJson } from "./mcp-static.ts";
import { buildChecks, CHANGE_FOR, findDuplicate, isBlocking, resolveSprint, type ChangeFor } from "./policy.ts";
import { renderHuman } from "./render.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ["--for", "--ticket", "--components", "--domain", "--expect", "--storefront", "--json"], ["--for", "--ticket", "--components", "--domain", "--expect"]);
const forFlag = enumFlag(argv, "--for", CHANGE_FOR) as ChangeFor | undefined;
if (!forFlag) { console.error(`✗ --for is required: ${CHANGE_FOR.join(" | ")}`); process.exit(1); }
const ticket = flagValue(argv, "--ticket");
const domain = flagValue(argv, "--domain");
const components = (flagValue(argv, "--components") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const expectRaw = flagValue(argv, "--expect");
let expect: { module: string; version: string } | undefined;
if (expectRaw) {
  const at = expectRaw.lastIndexOf("@");
  if (at <= 0) { console.error(`✗ --expect expects Module.Id@version, got "${expectRaw}"`); process.exit(1); }
  expect = { module: expectRaw.slice(0, at), version: expectRaw.slice(at + 1) };
}
if ((forFlag === "ticket" || forFlag === "ticket-fast") && !ticket) { console.error("✗ --for ticket needs --ticket <KEY>"); process.exit(1); }

try {
  const now = new Date();
  const facts = await getEnvFacts({ components, storefront: argv.includes("--storefront"), now });
  const mcp = checkMcpStatic(forFlag, loadMcpRequirements(ROOT), readMcpJson(ROOT));
  const sprint = forFlag === "ticket" || forFlag === "ticket-fast" ? resolveSprint(ROOT) : null;
  const duplicate = findDuplicate(ROOT, forFlag, { ticket, domain, now });
  const checks = buildChecks({ for: forFlag, ticket, domain, expect, facts, mcp, sprint, duplicate });
  const verdict = isBlocking(checks) ? "NOT READY" : "READY";
  if (argv.includes("--json")) console.log(JSON.stringify({ for: forFlag, ticket: ticket ?? null, domain: domain ?? null, sprint, duplicate, facts, mcp, checks, verdict }, null, 2));
  else process.stdout.write(renderHuman({ env: facts.env, for: forFlag, ticket, at: now }, facts, checks));
  process.exit(verdict === "NOT READY" ? 2 : 0);
} catch (e) {
  console.error(`✗ preflight could not run: ${(e as Error).message}`);
  process.exit(3);
}
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, directly after `"store:caps": …`, add:

```json
    "preflight": "npx tsx scripts/preflight/cli.ts",
```

- [ ] **Step 3: Usage errors exit 1**

Run: `npm run preflight -- --for nope; echo "exit=$?"`
Expected: `✗ --for expects one of ticket | ticket-fast | …` and `exit=1`.
Run: `npm run preflight -- --for ticket; echo "exit=$?"`
Expected: `✗ --for ticket needs --ticket <KEY>` and `exit=1`.

- [ ] **Step 4: Live run, clean-ish case (read-only)**

Run: `npm run preflight -- --for ba; echo "exit=$?"`
Expected on a healthy `vcst`: either the one-line `READY (…)` form, or `READY — 0 blockers · N warnings` with rows (e.g. `lanes`, an `mcp:*` fallback). `exit=0`. No secret value anywhere in the output.

- [ ] **Step 5: Live run, blocked case (read-only)**

Run: `npm run preflight -- --for ticket --ticket VCST-6225 --components "Sales Rep" --expect VirtoCommerce.SalesRep@99.0.0; echo "exit=$?"`
Expected: `NOT READY — 1 blocker`, an `expect` row `VirtoCommerce.SalesRep 99.0.0 not deployed (has …)` with `Who = me, with OK` and `Do = /qa-deploy-pr VCST-6225, or wait`; `exit=2`.

- [ ] **Step 6: JSON shape**

Run: `npm run preflight -- --for ba --json | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(Object.keys(j).join(' '))"`
Expected: `for ticket domain sprint duplicate facts mcp checks verdict`

- [ ] **Step 7: Commit**

```bash
git add scripts/preflight/cli.ts package.json
git commit -m "feat(preflight): npm run preflight - change-scoped CLI with exit codes 0/1/2/3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The skill — `.claude/skills/preflight/SKILL.md`

**Files:**
- Create: `.claude/skills/preflight/SKILL.md`
- Modify: `.claude/skills/README.md` (the flat layout listing — add `preflight/` among the root-level untagged skills)

**Interfaces:**
- Consumes: the CLI (Task 8), `mcp-requirements.json` (Task 5).
- Produces: `/preflight <for> [args]`, which consumers cite as "`/preflight` (`.claude/skills/preflight/SKILL.md`)".

- [ ] **Step 1: Write `SKILL.md`**

````markdown
---
name: preflight
description: "Environment and build pre-flight before work against a stand: env health, declared vs deployed build, storefront-visible modules, release-ledger Δ, duplicate run, MCP availability — one result and one output form for every consumer, then a diagnose → fix → re-check loop on what is not READY. Use at the start of /qa-test, /qa-test-fast, /qa-exploratory, /qa-test-lifecycle, /qa-domain-map, /ba-analyze. Not for the /qa-test axes 2b–2g, ticket fetching or routing, or per-case [PRE:*] tags."
argument-hint: "<ticket|ticket-fast|exploratory|lifecycle|domain-map|ba> [--ticket KEY] [--components A,B] [--domain slug] [--expect Module.Id@version] [--storefront]"
---

# /preflight — is this stand fit for the work, and what does it run?

The facts and the policy are **code**; this skill is only what code cannot do. Design and
rationale: [`docs/superpowers/specs/2026-10-08-preflight-skill-design.md`](../../../docs/superpowers/specs/2026-10-08-preflight-skill-design.md).
**Pre-flight is read-only.** It never fixes anything on its own — remediation (step 5) is a separate
step the user chooses.

## Step 1 — run the CLI for your scope

```bash
npm run preflight -- --for <for> [--ticket KEY] [--components A,B] [--domain slug] [--expect Module.Id@version] [--storefront] --json
```

- `--components` — the ticket's components (ledger names, `vc-module-*` repos or `VirtoCommerce.*` ids).
- `--expect` — the PR artifact under test (`/qa-test`: the linked PR's module + version).
- `--storefront` — the scope touches the storefront (adds the anonymous `InitializeApplication` probe).
- Exit `0` READY (warnings allowed) · `2` NOT READY · `1` usage error — fix the flags · `3` the script could not run: report its message and STOP, never improvise the facts by hand.

Keep the JSON; the consumer stores it as the `preflight` block of its `summary.json` or report header.

## Step 2 — MCP level 3: what is callable in THIS session

The CLI sees `.mcp.json` only (levels 1–2). For every server the consumer marks `REQ` or
`REQ_FALLBACK` in [`mcp-requirements.json`](mcp-requirements.json) — and every `OPT` server whose
`when` condition holds for this run — run `ToolSearch` with the server's `toolSearch` query, then
**one cheap read** through a returned tool. Record per server
`{server, level: CONNECTED | ABSENT, via: "mcp" | "fallback:<name>"}`.

- Absent `REQ` ⇒ BLOCK. `virtooz` is `REQ` for `domain-map` / `ba`: BLOCK only when **both** VirtoOZ
  and Context7 are absent — these commands exist to ground in the published guides.
- Absent `REQ_FALLBACK` ⇒ WARN naming the fallback, and the run uses it.
- Absent `OPT` ⇒ that lane is `SKIPPED` in the run's record — never PASS.
- A server that needs OAuth: Claude cannot start the flow — the user authorises it in `/mcp` or the claude.ai connector settings.

## Step 3 — ask the knowledge base, then the docs

**This step asks the knowledge base before anything else claims how the platform behaves.** The tool
is **`mcp__kb__kb_ask`** — it is deferred, so load it first:
`ToolSearch select:mcp__kb__kb_ask,mcp__kb__kb_show,mcp__kb__kb_none`. Put the coordinate in the
question — the page path, the GraphQL operation, the endpoint the scope names. Not connected ⇒
`npm run kb -- ask "<coordinate> <question>"`. Close every returned list by `kb_show` or `kb_none`.
A miss (exit 1) never blocks; it means what this run establishes is a later `kb_capture`
([`../../../CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*).

Then VirtoOZ through `/vc-docs` for what the platform is MEANT to do; Context7
(`/virtocommerce/vc-docs`) only as its fallback. Record the kb hit ids and the doc tools used.
Never Context7 first.

## Step 4 — show the result, in the one form

Print the CLI's human output **verbatim** (run it once more without `--json`, or render the same
checks), then append — in the same columns — only the rows the CLI cannot see: step 2's
level-3 MCP rows and step 3's misses. Do not reword a row, do not re-grade it, and never show an
`UNKNOWN` as OK. Form and rules: spec §8a.

- `READY` with no rows ⇒ one line, proceed.
- `READY` with warnings ⇒ name each in one line, proceed. A WARN never asks.
- `NOT READY` ⇒ go to step 5. **At most one question, and only for a BLOCK.**

## Step 5 — remediation: diagnose → fix → re-check

Offer, in one line per row, what you can do and what only the user can — the `Who` column decides:

| `Who` | You may |
|---|---|
| `me` | do it now: read-only, or local and reversible |
| `me, with OK` | do it only after the user says yes: shared env, outward-facing, tracked file |
| `you` | hand over paste-ready text: which variable, which file, where the value comes from |

Never type, substitute or switch a password or token; on a failed credential, hand over the text.
Then ask the one question: **fix what you can · find the cause first · proceed as is · stop.**

- "Find the cause" runs the row's `diagnose[]` recipe (read-only) and reports the cause.
- After any fix, **re-run the whole step 1**, not the one check — a fix can move another fact.
- At most **two** rounds; then hand over with what was tried.
- Record every action in `remediations[]`: `{check, found, diagnosis, action, actor, approvedBy, result}`.

## Step 6 — return one block to the consumer

`{ verdict, facts, checks, mcp (with level-3 rows), kbHits, docs, remediations }`. What a fact
**means** for the consumer is the consumer's rule, not this skill's — e.g. a `breaking:*` row makes
`/qa-test` run FULL; a `not-deployed:*` row is BLOCKED-on-deploy, never a FAIL and never a filed bug.

## Not this skill

The `/qa-test` axes 2b–2g and its 2-map read · ticket fetch, classification and routing · the
per-case `[PRE:*]` tags ([`test-execution-preflight.md`](../../knowledge/execution/test-execution-preflight.md)) ·
the regression pre-flight (`regression:plan --preflight`, phase 2).
````

- [ ] **Step 2: List it in `.claude/skills/README.md`**

In the fenced flat layout listing, add this line beside the other root-level untagged skills (`project-init/`, `prompt-review/`, `vc-self-check/`), keeping the existing column alignment:

```
├── preflight/                       # Env/build pre-flight: facts, MCP availability, one output form
```

In the paragraph that names the root-level untagged skills (`project-init`, `vc-self-check`, `prompt-review`), add `preflight` to that list.

- [ ] **Step 3: Gate**

Run: `npm run context:check`
Expected: PASS — every path in `SKILL.md` resolves, the body is under 19,000 chars, no memory citation.
Run: `node -e "console.log(require('fs').readFileSync('.claude/skills/preflight/SKILL.md','utf8').length)"`
Expected: a number below 19000.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/preflight/SKILL.md .claude/skills/README.md
git commit -m "feat(preflight): the /preflight skill - MCP level 3, kb-first grounding, one output form, remediation loop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Migrate `/qa-test` and fix `qa-test/preflight.md`

**Files:**
- Modify: `.claude/commands/qa-test.md` (§1b, the wave table at the `| Wave | Issue in ONE message |` block and the `2-release's three consequences` paragraph)
- Modify: `.claude/skills/qa-test/preflight.md` (header, §1a line 53, §1b items 1–4 and the axes block 127–160, §2-map lines 176–178)

**Interfaces:**
- Consumes: `/preflight ticket` (Task 9).

- [ ] **Step 1: `qa-test.md` — wave A cites the skill**

Replace the wave-A row of the `| Wave | Issue in ONE message |` table with:

```markdown
| *(before A)* | **2g `domain_map`** — the slug from `1a` + one frontmatter read; no other input, so it derives first |
| **A** | **`/preflight ticket --ticket <KEY> --components <1a components> [--expect <PR module@version>] [--storefront]`** — env health, `declared`/`deployed`, the `2-release` ledger Δ, sprint, duplicate check and MCP availability in one call ([`skills/preflight/SKILL.md`](../skills/preflight/SKILL.md)) · **2-map** the functionality map (below), read in the order 2g set · 2b's local reads |
```

Replace the `*(no I/O)*` row's text `derive the **six** axes — see below. **2g `domain_map` derives FIRST**, because `2-map` in wave A consumes it to decide what to read` with:

```markdown
derive the other **five** axes (2b–2f) from what wave A returned — see below
```

Replace the paragraph starting `**2-release's three consequences**` with:

```markdown
**What `/preflight` returns is a fact; what it means here is this command's.** A `breaking:*` row in
the component under test **forces FULL** · it is a third leg for `1d`'s AC↔implementation check · a
`not-deployed:*` or `expect` row is BLOCKED-on-deploy — never a FAIL, never a filed bug, never `{DOC}`.
Store the skill's block as `summary.json.preflight`.
```

Replace the `**PR testing:** confirm the PR's artifact version is deployed; if not → offer `/qa-deploy-pr <ticket-key>` (**ask first**) or warn and ask whether to wait.` paragraph with:

```markdown
**PR testing:** pass the PR's module and version as `--expect`; a NOT READY `expect` row carries the
`/qa-deploy-pr` remedy and `/preflight` asks before running it.
```

- [ ] **Step 2: `preflight.md` — header pointer**

After the first paragraph (ending `changing what the pipeline establishes before it dispatches anything.`), add:

```markdown
**The env/build pre-flight itself is [`/preflight`](../preflight/SKILL.md)** — this file is the
`1a`–`1b` orchestration around it: fetch, routing, the opening status hop, the axes and `2-map`.
```

- [ ] **Step 3: `preflight.md` §1a — drop the transcribed count**

Replace `- **Identify applicable domain(s)** — map to the 63 `/qa-checklist` domains.` with:

```markdown
- **Identify applicable domain(s)** — map to the `/qa-checklist` domains (`ls .claude/skills/qa-checklist/` for the live list).
```

- [ ] **Step 4: `preflight.md` §1b — waves and items 1–4**

Replace the paragraph starting `**Run this as TWO I/O waves, not nine sequential steps.**` (through `the items gated on a derived token. `2d` is the one that costs real time (~8.6 s); `tc:scope` is ~1 s, and holding it until the disposition buys a round-trip and nothing else.`) with:

```markdown
**Run this as TWO I/O waves.** Before them, derive **2g** (`domain_map`) — it needs only `1a`'s slug and
one frontmatter read, and `2-map` in wave A reads in the order it sets. **Wave A, one message:**
[`/preflight`](../preflight/SKILL.md) `ticket` (env health, `declared`/`deployed`, the ledger Δ, sprint,
duplicate, MCP) · `2-map` · 2b's local reads. Then derive **2b, 2c, 2d, 2e, 2f** from what came back —
pure computation. **Wave B, one message:** `2d`'s two refreshers, `2e`'s `tc:scope` scan and `2f`'s
`td:validate` check — the items gated on a derived token. `2d` costs ~8.6 s; `tc:scope` ~1 s.
```

Replace items `1.` (Environment health), `2.` (Build & version), `2-release.` with its three sub-bullets, `3.` (Resolve current sprint) and `4.` (Duplicate check) — everything from `1. **Environment health**` through the end of the `2-release` sub-bullets, and the `3.`/`4.` lines after the axes block — with this single item placed where item 1 was:

```markdown
1. **`/preflight ticket --ticket <KEY> --components <…> [--expect <PR module@version>] [--storefront]`**
   — one call for env health, `declared` vs `deployed` (a failed probe is `UNKNOWN`, never `declared`),
   the release-ledger Δ, `{SPRINT}`, the duplicate check and MCP availability, in one output form with
   a remediation loop ([`../preflight/SKILL.md`](../preflight/SKILL.md)). Its `breaking:*` rows **force
   FULL**, feed `1d` a third leg, and its `not-deployed:*` / `expect` rows are BLOCKED-on-deploy —
   never a FAIL, never a filed bug, never `{DOC}`. Store the block as `summary.json.preflight`.
```

- [ ] **Step 5: `preflight.md` — the axes block counts six**

In the `2b–2g. **Derive the SIX PRE-FLIGHT AXES**` block: add this row to the end of its table:

```markdown
    | **2g** | `domain_map` | the `1a` slug → `.claude/knowledge/domain/<name>.md` frontmatter (`domain_slug`, `stale_after_days`) + the `.mind-map.json` beside it | **`unresolved` + recommend** — fails OPEN on the build, never blocks | `2-map`'s read order; FULL builds a missing map at `1c-map` |
```

Replace `**Three rules, from `axes.md` §2 — they apply to all five and are not repeated per axis:**` with `**Three rules, from `axes.md` §2 — they apply to all six and are not repeated per axis:**`.

Replace `**Effort (`axes.md` §4): FULL derives and runs all five.` with `**Effort (`axes.md` §4): FULL derives and runs all six.`

Leave `The other **three** — `2c`/`2d`/`2e` — are **opt-in** there` unchanged — it describes FAST's three opt-in axes, which is correct.

- [ ] **Step 6: `preflight.md` §2-map — the duplicated phrase**

Replace the two lines

```
for the rest. It is the step that decides whether the run starts from what is already known or
re-derives it, so its two reads happen **in this order** and the order is the point.

and the order is the point: **the DOMAIN MAP first, then the per-ticket prior art.**
```

with

```
for the rest. It is the step that decides whether the run starts from what is already known or
re-derives it, so its two reads happen **in this order**, and the order is the point: **the DOMAIN
MAP first, then the per-ticket prior art.**
```

- [ ] **Step 7: Gate**

Run: `npm run context:check`
Expected: PASS. If it reports `qa-test.md` shrank under its baseline, run `npm run context:check:baseline` and include `scripts/maintenance/.prompt-size-baseline.json` in the commit (a shrink is the only change the baseline accepts).

- [ ] **Step 8: Commit**

```bash
git add .claude/commands/qa-test.md .claude/skills/qa-test/preflight.md scripts/maintenance/.prompt-size-baseline.json
git commit -m "refactor(qa-test): 1b wave A calls /preflight; fix six-axes table, 2g order, duplicated text, transcribed count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Migrate `/qa-test-fast`, `/qa-exploratory`, `/qa-test-lifecycle`

**Files:**
- Modify: `.claude/commands/qa-test-fast.md` (Step 0 items 2 and 5)
- Modify: `.claude/commands/qa-exploratory.md` (Step 0 items 1, 2, 3, the ledger-Δ half of 3a, 4; and the two Step 0a/0b references to "Steps 0.1–0.5")
- Modify: `.claude/commands/qa-test-lifecycle.md` (§Pre-Flight items 1–3; the two lines in its rules list near the end that restate build verification)

- [ ] **Step 1: `qa-test-fast.md` Step 0**

Replace item `2. **Environment.**` (its full text) with:

```markdown
2. **Environment.** Run [`/preflight`](../skills/preflight/SKILL.md)
   `ticket-fast --ticket <KEY> --components <…> [--expect <PR module@version>]`. It returns env health,
   the deployed build, `{SPRINT}`, the duplicate check (with the prior run's build, so "same build" is
   read from it) and MCP availability, and runs its own remediation loop. A `not-deployed:*` /
   `expect` row is BLOCKED-on-deploy, never a FAIL.
```

Replace item `5. **Ask the base for this run's coordinates.**` (its full text) with:

```markdown
5. **Ask the base for this run's coordinates** — done inside `/preflight` step 3 (kb first, then
   VirtoOZ). Carry its hit ids into Stage 1.
```

- [ ] **Step 2: `qa-exploratory.md` Step 0**

Replace items `1. **Environment health**`, `2. **Build & version verification**` and `3. **Duplicate check**` with:

```markdown
1. **`/preflight exploratory --domain <slug> --components <domain's components> [--storefront]`**
   ([`../skills/preflight/SKILL.md`](../skills/preflight/SKILL.md)) — env health, the **deployed**
   build, the release-ledger Δ, the 24 h duplicate check for this domain and MCP availability, in one
   output form. Record the block in the session report header.
```

In item `3a. **What shipped recently**`, delete its second paragraph's sentence `Two boundaries: the ledger says what was **released upstream**, not what is **deployed** on this env — cross it against the `deployed` probe from item 2 and drop anything `NOT_DEPLOYED`, since a session cannot explore what isn't there.` and replace it with:

```markdown
Two boundaries: the ledger says what was **released upstream**, not what is **deployed** — `/preflight`
already crossed the two; drop every `not-deployed:*` row, since a session cannot explore what isn't there.
```

Replace item `4. **Docs query (VirtoOZ MCP)**`'s first sentence (up to and including its first period) with:

```markdown
4. **Docs query** — done inside `/preflight` step 3 (kb first, then VirtoOZ via `/vc-docs`). For a feature from item 3a, add the targeted VirtoOZ query below.
```

Replace both occurrences of `Steps 0.1–0.5` with `Steps 0.1–0.5 (item 1 is `/preflight`)`.

- [ ] **Step 3: `qa-test-lifecycle.md` §Pre-Flight**

Replace items `1. **Build & version verification**` (with its three sub-bullets), `2. **Duplicate check**` and `3. **Context7 query**` with:

```markdown
1. **`/preflight lifecycle --domain <scope> --components <scope components>`**
   ([`../skills/preflight/SKILL.md`](../skills/preflight/SKILL.md)) — env health, the deployed build,
   the release-ledger Δ, the 24 h duplicate check and MCP availability, then kb → VirtoOZ grounding.
   Include its block in the lifecycle report header (Phase 6) and pass its kb/doc hits to
   `test-management-specialist`.
```

Renumber the remaining item `4. **GraphQL schema refresh**` to `2.`.

In its rules list near the end, replace `- **Build verification before pipeline** — always run pre-flight build verification and include version info in report` with:

```markdown
- **Pre-flight before pipeline** — always run `/preflight lifecycle` and include its block in the report
```

- [ ] **Step 4: Gate**

Run: `npm run context:check`
Expected: PASS. On a reported shrink of `qa-test-lifecycle.md`, run `npm run context:check:baseline` and include the baseline file.

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/qa-test-fast.md .claude/commands/qa-exploratory.md .claude/commands/qa-test-lifecycle.md scripts/maintenance/.prompt-size-baseline.json
git commit -m "refactor(commands): qa-test-fast, qa-exploratory, qa-test-lifecycle call /preflight

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Migrate `/qa-domain-map`, `/ba-analyze`, `agent-dispatch.md`; final gates

**Files:**
- Modify: `.claude/commands/qa-domain-map.md` (Step 1 bullets: environment/deployed versions, the PUBLISHED DOCS bullet's VirtoOZ-access sentence, the `kb_ask` bullet)
- Modify: `.claude/commands/ba-analyze.md` (Step 0 items 1 and the first item `3.`; renumber)
- Modify: `.claude/templates/agent-dispatch.md` (§Context7 Pre-Flight, §Duplicate Detection Guard, §Pre-Flight Checklist, §Build Verification's two procedural subsections)

- [ ] **Step 1: `qa-domain-map.md` Step 1**

Replace the first bullet (`- Environment health and the **deployed** versions of every module in scope …`) with:

```markdown
- **`/preflight domain-map --domain <slug> --components <modules in scope> --storefront`**
  ([`../skills/preflight/SKILL.md`](../skills/preflight/SKILL.md)) — env health, the **deployed**
  versions (a map that does not say which build it describes cannot be checked later), the
  storefront-visible modules, the ledger Δ and MCP availability. Its kb step is this step's
  observed-behaviour read.
```

Replace the bullet starting `- **What the platform was OBSERVED to do — `mcp__kb__kb_ask`, before the live check, not after.**` with:

```markdown
- **What the platform was OBSERVED to do** — `/preflight` step 3 already asked `mcp__kb__kb_ask` with the coordinates in the question; carry its hit ids, and `kb_capture` what this map establishes live ([`../../CLAUDE.md`](../../CLAUDE.md) §Essential Rules → *Product context*).
```

Keep the PUBLISHED DOCS bullet as is: querying **every** guide the domain touches is this command's own rule, beyond `/preflight`'s grounding.

- [ ] **Step 2: `ba-analyze.md` Step 0**

Replace item `1. **VirtoOZ MCP first**` (its full text) with:

```markdown
1. **`/preflight ba --components <scope>`** ([`../skills/preflight/SKILL.md`](../skills/preflight/SKILL.md))
   — MCP availability (VirtoOZ is `REQ`: with neither VirtoOZ nor Context7 there is nothing to ground in)
   and kb → VirtoOZ grounding. Then query the topic-scoped VirtoOZ tool for the target scope
   (`PlatformUserGuide` / `StorefrontUserGuide` / `PlatformDeveloperGuide` / `VirtoCommerce` for sales)
   to build Virto's published terminology and voice before analyzing code.
```

Delete the item `3. Confirm GitHub MCP and browser MCP servers are available (needed for sub-agents).` (covered by `/preflight`). Renumber the remaining `3. **`npm run bl:extract`…` item to `3.` (it was the second `3.`; now it is the only one).

- [ ] **Step 3: `agent-dispatch.md`**

Replace the whole §Context7 Pre-Flight body (from the line after `## Context7 Pre-Flight` through the end of its `Sample Queries by Domain` table) with:

```markdown
Superseded by [`/preflight`](../skills/preflight/SKILL.md) step 3: **kb first, VirtoOZ second, Context7
only as VirtoOZ's fallback** ([`../../CLAUDE.md`](../../CLAUDE.md) §Essential Rules → *Product context*).
Querying Context7 first contradicted that order.
```

In §Duplicate Detection Guard, delete the table rows `Ticket test`, `Exploratory` and `Sync tests`, and add below the table:

```markdown
`/qa-test`, `/qa-test-fast`, `/qa-exploratory` and `/qa-test-lifecycle` run the duplicate check through
[`/preflight`](../skills/preflight/SKILL.md), whose windows live in `scripts/preflight/policy.ts`.
```

Replace the §Pre-Flight Checklist body (the line `Every command that uses a browser SHOULD run these checks before dispatching agents:` and its five numbered items) with:

```markdown
Run [`/preflight`](../skills/preflight/SKILL.md) — env health, `declared`/`deployed`/released-through,
duplicate, MCP availability, one output form and the remediation loop. `/qa-regression` and
`/qa-smoke` keep their own Step 0 until phase 2 (`regression:plan --preflight`).
```

In §Build Verification, replace the two procedural subsections `### How to Fetch Deployed Versions` and `### What to Record` (from the `### How to Fetch Deployed Versions` heading up to, not including, `### Precedence — four sources, routed by QUESTION not by rank`) with:

```markdown
### How to fetch and record it

`/preflight` does it: `declared` from `vc-deploy-dev` (branch per `TEST_ENV`), `deployed` from
`GET {{BACK_URL}}/api/platform/modules`, the storefront-visible modules from the anonymous
`InitializeApplication` probe, and the ledger Δ — code in `scripts/lib/env-facts.ts`. **A failed
probe is `UNKNOWN`, never `declared`.** The Platform version has **no live source** (no Platform
entry in the modules API; `/api/platform/version` is 404), so `deployed.platform` is always
`UNKNOWN` and a report labels `declared` as declared. The sections below — which source answers
which question, and what a disagreement means — are unchanged and still normative.
```

Keep the `## Build Verification` heading and everything from `### Precedence` on: eleven files cite `agent-dispatch.md § Build Verification` for that doctrine.

- [ ] **Step 4: Final gates**

Run: `npm run context:check`
Expected: PASS. On a reported shrink, `npm run context:check:baseline` and include the baseline file.
Run: `npm test`
Expected: PASS (no new committed test; existing suites unaffected).
Run: `git status --porcelain scripts/unit`
Expected: empty — no temporary test survived.
Run: `npm run preflight -- --for ticket --ticket VCST-6225 --components "Sales Rep"; echo "exit=$?"`
Expected: the output form, exit 0 or 2 consistent with the verdict line.

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/qa-domain-map.md .claude/commands/ba-analyze.md .claude/templates/agent-dispatch.md scripts/maintenance/.prompt-size-baseline.json
git commit -m "refactor(commands): qa-domain-map, ba-analyze, agent-dispatch cite /preflight; keep Build Verification doctrine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
