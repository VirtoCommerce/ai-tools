# /preflight — Phase 2 Implementation Plan (build-scoped pre-flight for regression and smoke)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/qa-regression` and `/qa-smoke` a build-scoped pre-flight — derived module gating, drift and baseline Δ, active-run lock, smoke gates — through the same `/preflight` skill and the same fact core, replacing their hand-written Step 0.

**Architecture:** `scripts/regression/requires.ts` resolves each suite's `requiresModules` to a module id and gates it against the fact core; `scripts/regression/baseline.ts` reads/writes the per-env baseline; `scripts/regression/preflight.ts` holds the build-scoped policy and `runRegressionPreflight()`. `regression:plan --preflight` runs it and removes gated suites from the plan; `regression:close` writes the baseline for a completed run. The change-scoped policy is refactored so both policies share one `envChecks()` / `mcpChecks()`.

**Tech Stack:** Node 18+ ES modules, TypeScript via `tsx`, `node:test` (temporary tests only).

**Spec:** `docs/superpowers/specs/2026-10-08-preflight-skill-design.md` — §6, §9 Phase 2, §14 (D9, D10, D11). Branch `claude/preflight-phase-2`, stacked on PR #424 (merge #424 first; rebase this branch on `main` before opening its PR). Ticket VCST-6225.

## Global Constraints

- **NO CODE ⇒ NO UNIT TEST; where there is code, the unit test is TEMPORARY** (`CLAUDE.md` §Essential Rules → Testing). Every test file below is created, run RED → GREEN, and **deleted before the task's commit**. Never `git add` anything under `scripts/unit/`.
- **Nothing under `ci/` is modified** (spec D7). `ci/lib/*` is only imported.
- **`regression:plan` without `--preflight` is unchanged**: same output, same JSON keys, same exit codes `0`/`1`.
- **`deployed` UNKNOWN is never replaced by `declared`**, and when it is UNKNOWN **nothing is gated** (fail-open, a WARN row says so).
- **No fuzzy module matching** (spec D10): an entry resolves by the rule or not at all; an unresolved entry is an UNKNOWN row and the suite **runs**.
- **Read-only**, except two explicit writes a caller asks for: `regression:plan --preflight-out <path>` writes the pre-flight JSON, and `regression:close` writes `reports/regression/baseline.<env>.json` for a **completed** run.
- **No secret in any output.**
- **One question only from a BLOCK** (spec §8a rule 7); drift on a selected suite's module is a BLOCK, drift elsewhere a WARN (D9).
- **BUDGET-004:** `qa-regression.md` and `regression-orchestrator.md` are in `.prompt-size-baseline.json` and may only shrink; `npm run context:check` green at the end of every task touching `.claude/`.
- Exit codes of `regression:plan --preflight`: `0` READY · `1` the selection cannot run (existing meaning) · `2` pre-flight NOT READY · `3` pre-flight could not run.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **`deployed` UNKNOWN (bad credentials, stand down).** Expect: no suite is gated, one WARN `gating` row says why, the plan keeps every suite. Pinned in Task 3.
2. **A `requiresModules` entry nobody can resolve** (a typo, or `channels` before Task 4 fixes it). Expect: an UNKNOWN `unmapped-requires:<entry>` row naming its suites, and those suites stay in the plan. Pinned in Task 3.
3. **A module installed with load errors** (`validationErrors` non-empty — kb `KB-E4699C30`). Expect: suites requiring it are gated as `load-error`, never run against a module that did not load. Pinned in Task 3.
4. **The first run on an env: no baseline file, and a run closed without `preflight.json`.** Expect: an UNKNOWN `baseline` row (not an error), and `regression:close` still closes the run, only reporting that no baseline was written. Pinned in Task 5.
5. **Gating removes every suite of the selection.** Expect: a BLOCK `gating:all` row ("nothing left to run"), not an empty plan reported as runnable. Pinned in Task 6.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/deploy/lib/live.ts` (modify) | `LiveModule` carries `isInstalled` and `loadErrors` | 1 |
| `scripts/lib/env-facts.ts` (modify) | `toDeployedModules()`: drop `isInstalled: false`, keep `loadErrors` | 1 |
| `scripts/preflight/policy.ts` (modify) | export `envChecks()` / `mcpChecks()`; `buildChecks()` composes them, unchanged output | 2 |
| `scripts/regression/requires.ts` (create) | `requiresModules` entry → module id (D10) and per-suite gating | 3 |
| `config/test-suites.json`, `config/test-suites.schema.json` (modify) | exact ids for the 4 entries the rule cannot resolve; schema wording | 4 |
| `scripts/regression/baseline.ts` (create) | read/write `baseline.<env>.json`, Δ vs `deployed` | 5 |
| `scripts/regression/close-run.ts` (modify) | write the baseline after a completed close | 5 |
| `scripts/regression/preflight.ts` (create) | build-scoped policy + `runRegressionPreflight()` | 6 |
| `scripts/regression/plan-run.ts` (modify) | `--preflight`, `--preflight-out`; gated suites leave the plan | 7 |
| `.claude/skills/preflight/SKILL.md` (modify) | build-scoped entry (`regression` / `smoke`) | 8 |
| `.claude/commands/qa-regression.md`, `qa-smoke.md`, `.claude/agents/regression-orchestrator.md`, `.claude/templates/agent-dispatch.md` (modify); `reports/deploy-state-cache.json` (delete) | cite `/preflight`; plan with `--preflight`; close with `regression:close` | 9 |

---

### Task 1: Installed state and load errors on deployed modules

**Files:**
- Modify: `scripts/deploy/lib/live.ts` (`LiveModule`, `probeLiveModules`)
- Modify: `scripts/lib/env-facts.ts` (`DeployedModule`, new `toDeployedModules`, its use in `getEnvFacts`)
- Modify: `scripts/preflight/policy.ts:38-42` (stale `buildFingerprint` comment)
- Temporary test: `scripts/unit/pf2-deployed.test.ts`

**Interfaces:**
- Produces: `interface LiveModule { id: string; version: string; projectUrl?: string; isInstalled?: boolean; loadErrors: string[] }`; `interface DeployedModule { version: string; repo: string | null; repoGuessed: boolean; loadErrors: string[] }`; `toDeployedModules(list: LiveModule[]): Record<string, DeployedModule>` (keys lower-cased ids).
- `liveModules()` (used by vc-deploy) keeps its contract: it still includes every module the API returns.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/unit/pf2-deployed.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeLiveModules } from "../deploy/lib/live.ts";
import { toDeployedModules } from "../lib/env-facts.ts";

const coords = { env: "vcst", deployOwner: "o", deployRepo: "r", branch: "b", packagesPath: "p", themePath: "t", backUrl: "https://b", admin: "a", password: "x" };

test("probeLiveModules keeps isInstalled and validationErrors", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { id: "VirtoCommerce.Cart", version: "3.1", isInstalled: true, validationErrors: [] },
    { id: "VirtoCommerce.Loyalty", version: "3.2", isInstalled: true, validationErrors: ["Module dependency X is incompatible"] },
    { id: "VirtoCommerce.Draft", version: "1.0", isInstalled: false },
  ]), { status: 200 })) as typeof fetch;
  const r = await probeLiveModules(coords, "t");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.modules.map((m) => [m.id, m.isInstalled, m.loadErrors.length]), [
    ["VirtoCommerce.Cart", true, 0], ["VirtoCommerce.Loyalty", true, 1], ["VirtoCommerce.Draft", false, 0],
  ]);
});

test("toDeployedModules drops isInstalled:false and keeps load errors", () => {
  const d = toDeployedModules([
    { id: "VirtoCommerce.Cart", version: "3.1", isInstalled: true, loadErrors: [] },
    { id: "VirtoCommerce.Loyalty", version: "3.2", isInstalled: true, loadErrors: ["incompatible"] },
    { id: "VirtoCommerce.Draft", version: "1.0", isInstalled: false, loadErrors: [] },
    { id: "VirtoCommerce.NoFlag", version: "2.0", loadErrors: [] },
  ]);
  assert.deepEqual(Object.keys(d).sort(), ["virtocommerce.cart", "virtocommerce.loyalty", "virtocommerce.noflag"]);
  assert.deepEqual(d["virtocommerce.loyalty"].loadErrors, ["incompatible"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/pf2-deployed.test.ts`
Expected: FAIL — `does not provide an export named 'toDeployedModules'`.

- [ ] **Step 3: Extend `LiveModule` and `probeLiveModules` in `live.ts`**

Replace `export interface LiveModule { id: string; version: string; projectUrl?: string }` with:

```ts
/** `isInstalled` absent ⇒ treated as installed (older platforms omit it); `loadErrors` ← `validationErrors`. */
export interface LiveModule { id: string; version: string; projectUrl?: string; isInstalled?: boolean; loadErrors: string[] }
```

In `probeLiveModules`, replace the `modules.push({ … })` line with:

```ts
      modules.push({
        id: String(m.id), version: String(m.version ?? ''),
        ...(m.projectUrl ? { projectUrl: String(m.projectUrl) } : {}),
        ...(typeof m.isInstalled === 'boolean' ? { isInstalled: m.isInstalled } : {}),
        loadErrors: Array.isArray(m.validationErrors) ? m.validationErrors.map(String) : [],
      });
```

- [ ] **Step 4: `toDeployedModules` in `env-facts.ts`**

Replace `export interface DeployedModule { version: string; repo: string | null; repoGuessed: boolean }` with:

```ts
export interface DeployedModule { version: string; repo: string | null; repoGuessed: boolean; loadErrors: string[] }

/** The deployed module map: lower-cased id → module. A module the API lists as not installed is not deployed. */
export function toDeployedModules(list: LiveModule[]): Record<string, DeployedModule> {
  const modules: Record<string, DeployedModule> = {};
  for (const m of list) {
    if (m.isInstalled === false) continue;
    const fromUrl = repoFromProjectUrl(m.projectUrl);
    modules[m.id.toLowerCase()] = { version: m.version, repo: fromUrl ?? moduleIdToRepoGuess(m.id), repoGuessed: !fromUrl, loadErrors: m.loadErrors };
  }
  return modules;
}
```

Change the `live.ts` import line to also import the type: `import { platformHealthy, probeAdminToken, probeLiveModules, probePlatformVersion, type LiveModule } from "../deploy/lib/live.ts";`

In `getEnvFacts`, replace the block

```ts
      const modules: Record<string, DeployedModule> = {};
      for (const m of live.modules) {
        const fromUrl = repoFromProjectUrl(m.projectUrl);
        modules[m.id.toLowerCase()] = { version: m.version, repo: fromUrl ?? moduleIdToRepoGuess(m.id), repoGuessed: !fromUrl };
      }
      deployed = { platform: livePlatform, modules };
```

with

```ts
      deployed = { platform: livePlatform, modules: toDeployedModules(live.modules) };
```

- [ ] **Step 5: Fix the stale comment in `policy.ts`**

Replace the doc comment above `buildFingerprint` (lines 38–42) with:

```ts
/**
 * A comparable id for the deployed build: `modules:<12 hex of sha1 over the sorted "id@version" lines>`.
 * Modules only, so fingerprints stay comparable with summaries written before the platform version
 * was probed; two runs are on the same build iff their fingerprints are equal strings.
 */
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/pf2-deployed.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Regression check of phase 1**

Run: `npm run preflight -- --for ba` (TEST_ENV=vcst)
Expected: `READY (3 checks OK)` exactly as before.

- [ ] **Step 8: Delete the temporary test, commit**

```bash
rm scripts/unit/pf2-deployed.test.ts
git add scripts/deploy/lib/live.ts scripts/lib/env-facts.ts scripts/preflight/policy.ts
git commit -m "feat(preflight): deployed modules carry install state and load errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Share the environment and MCP checks between the two policies

**Files:**
- Modify: `scripts/preflight/policy.ts` (`buildChecks`, new `envChecks`, `mcpChecks`)
- Temporary test: `scripts/unit/pf2-policy-split.test.ts`

**Interfaces:**
- Produces:

```ts
export interface EnvCheckOptions { healthDown: Status; drift: Status | null }   // drift: null = caller handles drift
export interface EnvCheckResult { checks: Check[]; deployedUnknown: { who: Who; do: string } | null }
export function envChecks(f: EnvFacts, o: EnvCheckOptions): EnvCheckResult;
export function mcpChecks(mcp: PolicyInput["mcp"]): Check[];
```

- `buildChecks()` output is **unchanged** (same rows, same order).

- [ ] **Step 1: Write the failing test (captures today's row order first)**

```ts
// scripts/unit/pf2-policy-split.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecks, envChecks, mcpChecks, type PolicyInput } from "../preflight/policy.ts";

const facts: any = {
  env: "vcst", observedAt: "x", backUrl: "https://b", frontUrl: "https://f",
  config: { missing: ["ADMIN_PASSWORD"] }, health: "DOWN",
  declared: { platform: "3.1", theme: "t", modules: {} },
  deployed: { unknown: "token: 401" },
  storefrontVisible: { unknown: "no-store-for-domain" },
  drift: [{ id: "virtocommerce.cart", declared: "1", deployed: "2" }],
  ledger: { generated: "2026-09-01", stale: true, breaking: [{ repo: "vc-module-cart", component: "Cart", version: "3.2", month: "2026-09" }], releasedNotDeployed: { unknown: "deployed-unknown" }, noLiveSource: [] },
  components: [{ input: "Nope", repo: null }],
};
const mcp = { servers: [{ server: "kb", scope: "project", class: "REQ_FALLBACK", level: "ABSENT", problem: null, fallback: "npm run kb -- ask" }], liveLanes: 1, lanes: { min: 1, want: 3 }, jsonError: null } as any;
const input: PolicyInput = { for: "ticket", ticket: "VCST-1", expect: { module: "VirtoCommerce.Cart", version: "9.0.0" }, facts, mcp, sprint: null, duplicate: null };

// Row ids buildChecks produced BEFORE the refactor (captured from the committed code in Step 2).
const BEFORE = ["config:ADMIN_PASSWORD", "health", "declared", "deployed", "drift", "ledger", "breaking:vc-module-cart", "component:Nope", "storefront", "expect", "sprint", "mcp:kb", "lanes"];

test("buildChecks keeps its rows and order", () => {
  assert.deepEqual(buildChecks(input).map((c) => c.id), BEFORE);
});

test("envChecks: health status and drift are the caller's", () => {
  const r = envChecks(facts, { healthDown: "WARN", drift: null });
  assert.equal(r.checks.find((c) => c.id === "health")!.status, "WARN");
  assert.ok(!r.checks.some((c) => c.id === "drift"));
  assert.deepEqual(r.deployedUnknown, { who: "you", do: "check ADMIN / ADMIN_PASSWORD in .env.local" });
});

test("mcpChecks: fallback WARN and lanes WARN", () => {
  assert.deepEqual(mcpChecks(mcp).map((c) => [c.id, c.status]), [["mcp:kb", "WARN"], ["lanes", "WARN"]]);
});
```

- [ ] **Step 2: Confirm `BEFORE` against the committed code, then run the test**

`BEFORE` must describe today's behaviour before anything moves. Print what the committed `buildChecks` returns for the same input:

```bash
npx tsx -e "
import('./scripts/preflight/policy.ts').then((m) => {
  const facts = { env: 'vcst', observedAt: 'x', backUrl: 'https://b', frontUrl: 'https://f', config: { missing: ['ADMIN_PASSWORD'] }, health: 'DOWN',
    declared: { platform: '3.1', theme: 't', modules: {} }, deployed: { unknown: 'token: 401' }, storefrontVisible: { unknown: 'no-store-for-domain' },
    drift: [{ id: 'virtocommerce.cart', declared: '1', deployed: '2' }],
    ledger: { generated: '2026-09-01', stale: true, breaking: [{ repo: 'vc-module-cart', component: 'Cart', version: '3.2', month: '2026-09' }], releasedNotDeployed: { unknown: 'deployed-unknown' }, noLiveSource: [] },
    components: [{ input: 'Nope', repo: null }] };
  const mcp = { servers: [{ server: 'kb', scope: 'project', class: 'REQ_FALLBACK', level: 'ABSENT', problem: null, fallback: 'npm run kb -- ask' }], liveLanes: 1, lanes: { min: 1, want: 3 }, jsonError: null };
  console.log(JSON.stringify(m.buildChecks({ for: 'ticket', ticket: 'VCST-1', expect: { module: 'VirtoCommerce.Cart', version: '9.0.0' }, facts, mcp, sprint: null, duplicate: null }).map((c) => c.id)));
});"
```

If the printed array differs from `BEFORE`, set `BEFORE` to the printed array. Then:

Run: `npx tsx --test scripts/unit/pf2-policy-split.test.ts`
Expected: FAIL with `does not provide an export named 'envChecks'`.

- [ ] **Step 3: Extract `envChecks` and `mcpChecks`**

Add after `findDuplicate` in `policy.ts`:

```ts
export interface EnvCheckOptions { healthDown: Status; drift: Status | null }
export interface EnvCheckResult { checks: Check[]; deployedUnknown: { who: Who; do: string } | null }

/** The environment rows both policies share: config, health, declared, deployed, drift, ledger, components, storefront. */
export function envChecks(f: EnvFacts, o: EnvCheckOptions): EnvCheckResult {
  const checks: Check[] = [];
```

Then **move, verbatim,** the body of `buildChecks` from the `// config —` comment through the end of the `// storefront —` block (today's lines 117–200) into `envChecks`, with exactly three edits:

1. In the health `else if (f.health === "DOWN")` push, replace `status: isTicket(i.for) ? "BLOCK" : "WARN"` with `status: o.healthDown`.
2. Wrap the drift block in `if (o.drift !== null) { … }` and replace its `status: "WARN"` with `status: o.drift`.
3. Keep the three `let deployedUnknown…` variables as they are, and end the function with:

```ts
  return { checks, deployedUnknown: deployedUnknownWho && deployedUnknownDo ? { who: deployedUnknownWho, do: deployedUnknownDo } : null };
}

/** MCP levels 1–2 rows (user-scope servers are the skill's) plus the browser-lane row. */
export function mcpChecks(mcp: PolicyInput["mcp"]): Check[] {
  const checks: Check[] = [];
```

then **move, verbatim,** the `// .mcp.json that does not parse` block and the `// MCP levels 1–2` block (today's lines 226–239) into `mcpChecks`, replacing `i.mcp.` with `mcp.`, and end with `return checks;\n}`.

Rewrite `buildChecks` as:

```ts
export function buildChecks(i: PolicyInput): Check[] {
  const f = i.facts;
  const env = envChecks(f, { healthDown: isTicket(i.for) ? "BLOCK" : "WARN", drift: "WARN" });
  const checks: Check[] = [...env.checks];
  const deployedUnknownWho = env.deployedUnknown?.who ?? null, deployedUnknownDo = env.deployedUnknown?.do ?? null;
```

followed by today's `// expect`, `// sprint`, `// duplicate` blocks unchanged (lines 202–224), then:

```ts
  checks.push(...mcpChecks(i.mcp));
  return checks;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/pf2-policy-split.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Live regression check of phase 1**

Run: `npm run preflight -- --for ticket --ticket VCST-6225 --expect VirtoCommerce.SalesRep@99.0.0`
Expected: the same one BLOCK `expect` row as before the refactor; exit 2.

- [ ] **Step 6: Delete the temporary test, commit**

```bash
rm scripts/unit/pf2-policy-split.test.ts
git add scripts/preflight/policy.ts
git commit -m "refactor(preflight): envChecks and mcpChecks shared by both policies, buildChecks unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `requiresModules` → module id, and per-suite gating (D10)

**Files:**
- Create: `scripts/regression/requires.ts`
- Temporary test: `scripts/unit/pf2-requires.test.ts`

**Interfaces:**
- Consumes: `EnvFacts`, `isUnknown` (env-facts), `Ledger` (release-ledger-read), `moduleIdToRepoGuess` (module-registry).
- Produces:

```ts
export interface SuiteRef { id: string; layer?: string; requiresModules?: string[] }
export interface ResolvedModule { id: string; pascal: string }            // id lower-cased, pascal "VirtoCommerce.SalesRep"
export type ReqState = "deployed" | "load-error" | "not-deployed" | "storefront-invisible" | "unmapped";
export interface Gated { suite: string; module: string; state: "load-error" | "not-deployed" | "storefront-invisible" }
export interface GatingResult {
  gated: Gated[];
  unmapped: { entry: string; suites: string[] }[];
  requiredBySuite: Record<string, string[]>;   // suite id → resolved lower-cased module ids
  gatingOff: string | null;                    // reason gating did not run (deployed UNKNOWN), else null
}
export function resolveRequiredModule(entry: string): ResolvedModule;
export function gateSuites(suites: SuiteRef[], facts: EnvFacts, ledger: Ledger | null): GatingResult;
```

- [ ] **Step 1: Write the failing test**

```ts
// scripts/unit/pf2-requires.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRequiredModule, gateSuites } from "../regression/requires.ts";

const dep = (version: string, loadErrors: string[] = []) => ({ version, repo: null, repoGuessed: true, loadErrors });
const facts = (over: any = {}): any => ({
  declared: { platform: "3.1", theme: null, modules: { "virtocommerce.return": "3.1004.0" } },
  deployed: { platform: "3.1", modules: { "virtocommerce.salesrep": dep("3.1013.0"), "virtocommerce.loyalty": dep("3.1", ["incompatible"]), "virtocommerce.pagebuildermodule": dep("3.9") } },
  storefrontVisible: null,
  ...over,
});
const ledger: any = { generated: "2026-09-01", staleAfterDays: 45, rows: [], latest: [{ component: "UCP", latest: "3.1005.0", since: "2026-09", repo: "vc-module-ucp" }] };

test("the rule: full id as is, otherwise VirtoCommerce. + PascalCase", () => {
  assert.deepEqual(resolveRequiredModule("sales-rep"), { id: "virtocommerce.salesrep", pascal: "VirtoCommerce.SalesRep" });
  assert.deepEqual(resolveRequiredModule("VirtoCommerce.UCP"), { id: "virtocommerce.ucp", pascal: "VirtoCommerce.UCP" });
  assert.deepEqual(resolveRequiredModule("virtocommerce.PageBuilderModule"), { id: "virtocommerce.pagebuildermodule", pascal: "VirtoCommerce.PageBuilderModule" });
  assert.equal(resolveRequiredModule("push-messages").id, "virtocommerce.pushmessages");
});

test("gating: deployed runs, load error / declared-only / released-only are gated, unknown entry is unmapped and runs", () => {
  const r = gateSuites([
    { id: "097", requiresModules: ["sales-rep"] },
    { id: "060", requiresModules: ["loyalty"] },
    { id: "073", requiresModules: ["VirtoCommerce.Return"] },
    { id: "120", requiresModules: ["VirtoCommerce.UCP"] },
    { id: "076", requiresModules: ["channels"] },
    { id: "001" },
  ], facts(), ledger);
  assert.deepEqual(r.gated, [
    { suite: "060", module: "virtocommerce.loyalty", state: "load-error" },
    { suite: "073", module: "virtocommerce.return", state: "not-deployed" },
    { suite: "120", module: "virtocommerce.ucp", state: "not-deployed" },
  ]);
  assert.deepEqual(r.unmapped, [{ entry: "channels", suites: ["076"] }]);
  assert.equal(r.gatingOff, null);
  assert.deepEqual(r.requiredBySuite["097"], ["virtocommerce.salesrep"]);
});

test("Review Focus 1: deployed UNKNOWN gates nothing and says why", () => {
  const r = gateSuites([{ id: "097", requiresModules: ["sales-rep"] }], facts({ deployed: { unknown: "token: 401" } }), ledger);
  assert.deepEqual(r.gated, []);
  assert.deepEqual(r.unmapped, []);
  assert.match(r.gatingOff!, /401/);
});

test("storefront: a frontend suite's module the storefront cannot see is gated, unless versions are hidden", () => {
  const sf = (versionsHidden: boolean) => facts({ storefrontVisible: { versionsHidden, modules: { "virtocommerce.loyalty": "3.1" } } });
  const s = [{ id: "098", layer: "frontend", requiresModules: ["sales-rep"] }];
  assert.deepEqual(gateSuites(s, sf(false), ledger).gated, [{ suite: "098", module: "virtocommerce.salesrep", state: "storefront-invisible" }]);
  assert.deepEqual(gateSuites(s, sf(true), ledger).gated, []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/pf2-requires.test.ts`
Expected: FAIL — `Cannot find module '../regression/requires.ts'`.

- [ ] **Step 3: Implement `scripts/regression/requires.ts`**

```ts
// scripts/regression/requires.ts — a suite's `requiresModules` entry → a module id, and gating against
// the fact core (spec §6 row 4, §14 D10). One rule, never fuzzy: "cms" must not become XCms.
import { isUnknown, type EnvFacts } from "../lib/env-facts.ts";
import type { Ledger } from "../lib/release-ledger-read.ts";
import { moduleIdToRepoGuess } from "../../plugins/vc-fix/skills/qa-fix-routing/module-registry.ts";

export interface SuiteRef { id: string; layer?: string; requiresModules?: string[] }
export interface ResolvedModule { id: string; pascal: string }
export type ReqState = "deployed" | "load-error" | "not-deployed" | "storefront-invisible" | "unmapped";
export interface Gated { suite: string; module: string; state: "load-error" | "not-deployed" | "storefront-invisible" }
export interface GatingResult {
  gated: Gated[];
  unmapped: { entry: string; suites: string[] }[];
  requiredBySuite: Record<string, string[]>;
  gatingOff: string | null;
}

/** Full id (any case) as is; otherwise VirtoCommerce. + PascalCase of the kebab entry. */
export function resolveRequiredModule(entry: string): ResolvedModule {
  const s = entry.trim();
  const m = /^virtocommerce\.(.+)$/i.exec(s);
  const pascal = m ? `VirtoCommerce.${m[1]}` : `VirtoCommerce.${s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;
  return { id: pascal.toLowerCase(), pascal };
}

function classify(mod: ResolvedModule, layer: string | undefined, f: EnvFacts, ledgerRepos: Set<string>): ReqState {
  if (isUnknown(f.deployed)) return "unmapped"; // never reached: gateSuites returns early
  const live = f.deployed.modules[mod.id];
  if (live) {
    if (live.loadErrors.length > 0) return "load-error";
    const sf = f.storefrontVisible;
    if (layer === "frontend" && sf && !isUnknown(sf) && !sf.versionsHidden && !(mod.id in sf.modules)) return "storefront-invisible";
    return "deployed";
  }
  if (!isUnknown(f.declared) && mod.id in f.declared.modules) return "not-deployed";
  if (ledgerRepos.has(moduleIdToRepoGuess(mod.pascal))) return "not-deployed";
  return "unmapped";
}

export function gateSuites(suites: SuiteRef[], facts: EnvFacts, ledger: Ledger | null): GatingResult {
  const requiredBySuite: Record<string, string[]> = {};
  for (const s of suites) requiredBySuite[s.id] = (s.requiresModules ?? []).map((e) => resolveRequiredModule(e).id);
  if (isUnknown(facts.deployed)) return { gated: [], unmapped: [], requiredBySuite, gatingOff: `deployed ${facts.deployed.unknown}` };

  const ledgerRepos = new Set((ledger?.latest ?? []).map((l) => l.repo));
  const gated: Gated[] = [];
  const unmappedMap = new Map<string, string[]>();
  for (const s of suites) {
    for (const entry of s.requiresModules ?? []) {
      const mod = resolveRequiredModule(entry);
      const state = classify(mod, s.layer, facts, ledgerRepos);
      if (state === "deployed") continue;
      if (state === "unmapped") unmappedMap.set(entry, [...(unmappedMap.get(entry) ?? []), s.id]);
      else gated.push({ suite: s.id, module: mod.id, state });
    }
  }
  return { gated, unmapped: [...unmappedMap].map(([entry, ids]) => ({ entry, suites: ids })), requiredBySuite, gatingOff: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/pf2-requires.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Live check of the rule against the real manifest**

Run:

```bash
npx tsx -e "
import('./scripts/lib/env-facts.ts').then(async (ef) => {
  const { gateSuites } = await import('./scripts/regression/requires.ts');
  const { readLedger } = await import('./scripts/lib/release-ledger-read.ts');
  const m = JSON.parse(require('fs').readFileSync('config/test-suites.json', 'utf8'));
  const suites = (Array.isArray(m.suites) ? m.suites : Object.entries(m.suites).map(([id, v]) => ({ id, ...v })));
  const facts = await ef.getEnvFacts({ storefront: true });
  const r = gateSuites(suites, facts, readLedger());
  console.log(JSON.stringify({ gated: r.gated, unmapped: r.unmapped, gatingOff: r.gatingOff }, null, 1));
});"
```

Expected on `vcst` **before Task 4**: `unmapped` lists exactly `returns`, `cms`, `import-export`, `channels` (the four D10 exceptions) — or fewer if a resolved module happens to be deployed; `gated` holds only modules that are genuinely absent or erroring on the stand. Record what it prints: Task 4 uses it.

- [ ] **Step 6: Delete the temporary test, commit**

```bash
rm scripts/unit/pf2-requires.test.ts
git add scripts/regression/requires.ts
git commit -m "feat(regression): resolve requiresModules to module ids and gate suites against the deployed build (D10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Exact module ids for the four entries the rule cannot resolve

**Files:**
- Modify: `config/test-suites.json` (`requiresModules` of 014c, 050o, 073, 073a, 073b, 059, 060, 060b, 064, 064b, 076)
- Modify: `config/test-suites.schema.json` (the `requiresModules` description)

This is data: no unit test (`CLAUDE.md` NO CODE ⇒ NO UNIT TEST); `suites:lint` owns it.

- [ ] **Step 1: Confirm each id from the suite's own steps before writing it**

| Entry | Suites | Candidate id | Evidence to read |
|---|---|---|---|
| `returns` | 014c, 050o, 073, 073a, 073b | `VirtoCommerce.Return` | **confirmed**: 073's steps call `/api/return/` and name `VirtoCommerce.Return` 20× |
| `cms` | 059, 060, 060b | `VirtoCommerce.PageBuilderModule` | **confirmed**: 059's steps call `/api/page-builder-pages/grouped/` and name `VirtoCommerce.PageBuilderModule` |
| `import-export` | 064, 064b | `VirtoCommerce.CatalogCsvImportModule` | **to confirm**: the CSVs name no endpoint. Ask the kb (`mcp__kb__kb_ask`, coordinate = the Admin import blade's REST call) and search `org:VirtoCommerce` for the controller the CSV import/export blade calls (GitHub code search) |
| `channels` | 076 | `VirtoCommerce.CatalogPublishing` | **to confirm**: `module-suite-map.md` names `/api/channels/`; search `org:VirtoCommerce "api/channels"` for the module that owns that route |

A candidate that cannot be confirmed is **left as its current entry**: it stays `unmapped` (UNKNOWN row, suite runs). Never write an unconfirmed id — a wrong id gates a suite out on someone else's module, the exact failure D10 rejects.

- [ ] **Step 2: Write the confirmed ids**

For each confirmed row, in `config/test-suites.json` replace the entry inside that suite's `requiresModules` array, e.g. for 073:

```json
"requiresModules": ["VirtoCommerce.Return"],
```

(same edit for 014c, 050o, 073a, 073b; `["VirtoCommerce.PageBuilderModule"]` for 059, 060, 060b; and the two "to confirm" rows only if Step 1 confirmed them).

- [ ] **Step 3: Update the schema description**

In `config/test-suites.schema.json`, replace the `requiresModules` `"description"` value with:

```json
"description": "Module ids this suite requires. Write the full id (`VirtoCommerce.Return`) or its kebab short form (`sales-rep` → `VirtoCommerce.SalesRep`); a short form that does not map by that rule must be the full id. `regression:plan --preflight` gates a suite whose module is not deployed or failed to load; an entry that resolves to no module is reported and the suite runs. `MODULES_ENABLED` (CI) compares these strings as written. Defaults to no requirement if absent.",
```

- [ ] **Step 4: Gates**

Run: `npm run suites:lint`
Expected: PASS.
Re-run Task 3 Step 5's command.
Expected: `unmapped` no longer lists the entries confirmed in Step 1.

- [ ] **Step 5: Commit**

```bash
git add config/test-suites.json config/test-suites.schema.json
git commit -m "chore(suites): exact module ids where the requiresModules rule cannot resolve (D10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The baseline — read, Δ, and write at close

**Files:**
- Create: `scripts/regression/baseline.ts`
- Modify: `scripts/regression/close-run.ts` (`CloseResult`, `closeRun`, CLI print)
- Temporary test: `scripts/unit/pf2-baseline.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Baseline { env: string; runId: string; observedAt: string; platform: string | null; modules: Record<string, string> }
export interface ModuleChange { id: string; from: string | null; to: string | null }   // id "platform" for the platform
export function baselinePath(root: string, env: string): string;
export function readBaseline(root: string, env: string): Baseline | null;
export function baselineDelta(b: Baseline | null, f: EnvFacts): ModuleChange[] | Unknown;   // U("no-baseline") | U("deployed …")
export function baselineFromFacts(f: EnvFacts, env: string, runId: string): Baseline | null;
export function writeBaselineFromRun(root: string, runDir: string, env: string, runId: string): { written: boolean; reason?: string };
```
- `CloseResult` gains `baselineWritten: boolean; baselineSkippedReason?: string`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/unit/pf2-baseline.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baselineDelta, baselineFromFacts, readBaseline, writeBaselineFromRun, baselinePath } from "../regression/baseline.ts";

const m = (version: string) => ({ version, repo: null, repoGuessed: true, loadErrors: [] });
const facts: any = { observedAt: "2026-10-12T10:00:00Z", deployed: { platform: "3.1078.0", modules: { "virtocommerce.cart": m("3.1"), "virtocommerce.salesrep": m("3.1013.0-pr-18") } } };

test("Review Focus 4: no baseline is UNKNOWN, not an error", () => {
  assert.deepEqual(baselineDelta(null, facts), { unknown: "no-baseline" });
});

test("delta: changed, added, removed modules and the platform", () => {
  const b = { env: "vcst", runId: "REG-1", observedAt: "x", platform: "3.1077.0", modules: { "virtocommerce.cart": "3.1", "virtocommerce.salesrep": "3.1012.0", "virtocommerce.gone": "1.0" } };
  assert.deepEqual(baselineDelta(b, facts), [
    { id: "platform", from: "3.1077.0", to: "3.1078.0" },
    { id: "virtocommerce.gone", from: "1.0", to: null },
    { id: "virtocommerce.salesrep", from: "3.1012.0", to: "3.1013.0-pr-18" },
  ]);
});

test("delta: deployed UNKNOWN is UNKNOWN", () => {
  assert.ok("unknown" in (baselineDelta({ env: "vcst", runId: "R", observedAt: "x", platform: null, modules: {} }, { deployed: { unknown: "token: 401" } } as any) as any));
});

test("write at close: from the run's preflight.json; absent file is a reason, not a throw", () => {
  const root = mkdtempSync(join(tmpdir(), "pf2-"));
  const runDir = join(root, "reports/regression/REG-9");
  mkdirSync(runDir, { recursive: true });
  assert.deepEqual(writeBaselineFromRun(root, runDir, "vcst", "REG-9"), { written: false, reason: "no preflight.json in the run folder" });
  writeFileSync(join(runDir, "preflight.json"), JSON.stringify({ facts }));
  assert.deepEqual(writeBaselineFromRun(root, runDir, "vcst", "REG-9"), { written: true });
  const b = readBaseline(root, "vcst")!;
  assert.equal(b.runId, "REG-9");
  assert.deepEqual(b.modules, { "virtocommerce.cart": "3.1", "virtocommerce.salesrep": "3.1013.0-pr-18" });
  assert.ok(existsSync(baselinePath(root, "vcst")));
});

test("baselineFromFacts: deployed UNKNOWN writes nothing", () => {
  assert.equal(baselineFromFacts({ deployed: { unknown: "x" } } as any, "vcst", "R"), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/pf2-baseline.test.ts`
Expected: FAIL — `Cannot find module '../regression/baseline.ts'`.

- [ ] **Step 3: Implement `scripts/regression/baseline.ts`**

```ts
// scripts/regression/baseline.ts — the per-env regression baseline (spec §6 row 5): the deployed build a
// COMPLETED run was planned against. Written at close, never at pre-flight: a run that died mid-way
// must not become the next run's baseline. Replaces reports/deploy-state-cache.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isUnknown, type EnvFacts, type Unknown } from "../lib/env-facts.ts";

export interface Baseline { env: string; runId: string; observedAt: string; platform: string | null; modules: Record<string, string> }
export interface ModuleChange { id: string; from: string | null; to: string | null }

export const baselinePath = (root: string, env: string) => join(root, "reports", "regression", `baseline.${env}.json`);

export function readBaseline(root: string, env: string): Baseline | null {
  const p = baselinePath(root, env);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as Baseline; } catch { return null; }
}

export function baselineFromFacts(f: EnvFacts, env: string, runId: string): Baseline | null {
  if (isUnknown(f.deployed)) return null;
  const modules: Record<string, string> = {};
  for (const [id, m] of Object.entries(f.deployed.modules)) modules[id] = m.version;
  return { env, runId, observedAt: f.observedAt, platform: typeof f.deployed.platform === "string" ? f.deployed.platform : null, modules };
}

export function baselineDelta(b: Baseline | null, f: EnvFacts): ModuleChange[] | Unknown {
  if (!b) return { unknown: "no-baseline" };
  if (isUnknown(f.deployed)) return { unknown: `deployed ${f.deployed.unknown}` };
  const changes: ModuleChange[] = [];
  const nowPlatform = typeof f.deployed.platform === "string" ? f.deployed.platform : null;
  if (b.platform && nowPlatform && b.platform !== nowPlatform) changes.push({ id: "platform", from: b.platform, to: nowPlatform });
  const ids = [...new Set([...Object.keys(b.modules), ...Object.keys(f.deployed.modules)])].sort();
  for (const id of ids) {
    const from = b.modules[id] ?? null, to = f.deployed.modules[id]?.version ?? null;
    if (from !== to) changes.push({ id, from, to });
  }
  return changes;
}

/** Called by regression:close after a COMPLETED close. Reads the run's own preflight.json; never probes. */
export function writeBaselineFromRun(root: string, runDir: string, env: string, runId: string): { written: boolean; reason?: string } {
  const p = join(runDir, "preflight.json");
  if (!existsSync(p)) return { written: false, reason: "no preflight.json in the run folder" };
  let pf: { facts?: EnvFacts };
  try { pf = JSON.parse(readFileSync(p, "utf8")); } catch { return { written: false, reason: "preflight.json does not parse" }; }
  const b = pf.facts ? baselineFromFacts(pf.facts, env, runId) : null;
  if (!b) return { written: false, reason: "the run's pre-flight had no deployed module list" };
  writeFileSync(baselinePath(root, env), JSON.stringify(b, null, 2) + "\n", "utf8");
  return { written: true };
}
```

- [ ] **Step 4: Write the baseline from `close-run.ts`**

Add the import: `import { writeBaselineFromRun } from "./baseline.ts";`

In `export interface CloseResult`, add: `baselineWritten: boolean; baselineSkippedReason?: string;`

In `closeRun`, add `baselineWritten: false` to the two early `return { … }` objects (the not-finished return and the dry-run return), and replace the final two lines

```ts
  const flip = markRunClosed(runId, status, nowIso);
  return { runId, runDir, historyRows, statusWritten: flip.written, statusSkippedReason: flip.reason, warnings };
```

with

```ts
  const flip = markRunClosed(runId, status, nowIso);
  // Baseline only for a run that actually closed as completed (spec §6): a stalled or refused close
  // must not become the next run's comparison point.
  const base = flip.written && status === "completed"
    ? writeBaselineFromRun(process.cwd(), runDir, env, runId)
    : { written: false, reason: flip.written ? `status ${status} is not completed` : "status not written" };
  if (!base.written) warnings.push(`baseline not written: ${base.reason}`);
  return { runId, runDir, historyRows, statusWritten: flip.written, statusSkippedReason: flip.reason,
    baselineWritten: base.written, ...(base.reason ? { baselineSkippedReason: base.reason } : {}), warnings };
```

In `main()`'s human print, after the `status` line add:

```ts
    console.log(`  baseline      : ${r.baselineWritten ? `reports/regression/baseline.${env}.json` : `not written — ${r.baselineSkippedReason ?? "dry run"}`}`);
```

The exit code rule (`!r.statusWritten || r.historyRows === 0`) is **unchanged**: a missing baseline never fails a close (Review Focus 4).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/pf2-baseline.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: `close-run` dry run is unchanged in effect**

Run: `npx tsx scripts/regression/close-run.ts --run-id "$(ls -t reports/regression | grep '^REG-' | head -1)" --dry-run`
Expected: `status : NOT written — dry run`, `baseline : not written — dry run`, nothing written (`git status` clean).

- [ ] **Step 7: Delete the temporary test, commit**

```bash
rm scripts/unit/pf2-baseline.test.ts
git add scripts/regression/baseline.ts scripts/regression/close-run.ts
git commit -m "feat(regression): per-env baseline - Δ vs deployed, written by regression:close for a completed run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The build-scoped policy and `runRegressionPreflight()`

**Files:**
- Create: `scripts/regression/preflight.ts`
- Temporary test: `scripts/unit/pf2-regression-policy.test.ts`

**Interfaces:**
- Consumes: `envChecks`, `mcpChecks`, `Check`, `isBlocking` (policy, Task 2); `gateSuites`, `resolveRequiredModule`, `GatingResult`, `SuiteRef` (Task 3); `readBaseline`, `baselineDelta`, `ModuleChange` (Task 5); `getEnvFacts` (core); `checkMcpStatic`, `loadMcpRequirements`, `readMcpJson` (mcp-static); `classifyRun`, `gatherActivity`, `loadStatus`, `Classification` (`scripts/regression/reap-stalled-run.ts`); `readLedger`.
- Produces:

```ts
export type BuildFor = "regression" | "smoke";
export interface RegressionPolicyInput {
  for: BuildFor; facts: EnvFacts; mcp: PolicyInput["mcp"];
  manifestProblems: { suiteId: string; kind: string; detail: string }[];
  lock: Classification | null; gating: GatingResult; suiteIds: string[];
  changedSince: ModuleChange[] | Unknown; baselineRunId: string | null;
  smokeGates: { ok: boolean; output: string } | null; smokeDuplicate: string | null;
}
export function buildRegressionChecks(i: RegressionPolicyInput): Check[];
export function falseFailureRisk(changes: ModuleChange[] | Unknown, gating: GatingResult): string[];
export interface RegressionPreflight {
  for: BuildFor; selection: string; facts: EnvFacts; mcp: PolicyInput["mcp"]; gating: GatingResult;
  changedSince: ModuleChange[] | Unknown; baselineRunId: string | null; falseFailureRisk: string[];
  checks: Check[]; verdict: "READY" | "NOT READY";
}
export async function runRegressionPreflight(o: {
  for: BuildFor; selection: string; suites: SuiteRef[];
  manifestProblems: { suiteId: string; kind: string; detail: string }[];
  root: string; now?: Date; env?: string;
}): Promise<RegressionPreflight>;
```

Policy (spec §6, §14 D9) — this file is its single statement:

| Row id | Status | When |
|---|---|---|
| env rows | via `envChecks(f, { healthDown: "BLOCK", drift: null })` | always |
| `manifest:<suite>` | BLOCK | each manifest problem (no CSV / no executor) |
| `active-run` | BLOCK | lock `active` (wait) or `stalled` (`regression:reap:apply`, me with OK); `settled`/`no-status` ⇒ OK |
| `drift:<id>` | **BLOCK** | drift on `platform` or on a module a selected suite requires (D9) |
| `drift` | WARN | drift only on modules no selected suite requires |
| `gated:<module>` | WARN | the module's suites leave the plan (state in `found`) |
| `gating:all` | BLOCK | gating removed every suite of the selection (Review Focus 5) |
| `gating` | WARN | `gatingOff` (deployed UNKNOWN): nothing gated |
| `unmapped-requires:<entry>` | UNKNOWN | entry resolves to no module; suites run |
| `baseline` | UNKNOWN / WARN | `no-baseline` (UNKNOWN) · deployed UNKNOWN (UNKNOWN) · N changes since `<runId>` (WARN, false-failure risk) |
| `smoke-gates` | WARN | `suites:gates` non-zero (smoke only): verdict provisional |
| `duplicate` | WARN | a `SMOKE-<today>-*` run folder exists (smoke only) |
| mcp rows | via `mcpChecks(mcp)` | always |

- [ ] **Step 1: Write the failing test**

```ts
// scripts/unit/pf2-regression-policy.test.ts — TEMPORARY. Delete before commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegressionChecks, falseFailureRisk, type RegressionPolicyInput } from "../regression/preflight.ts";

const facts: any = {
  env: "vcst", observedAt: "x", backUrl: "https://b", frontUrl: "https://f", config: { missing: [] }, health: "UP",
  declared: { platform: "3.1", theme: "t", modules: {} }, deployed: { platform: "3.1", modules: {} },
  storefrontVisible: null, drift: [], components: [],
  ledger: { generated: "2026-10-01", stale: false, breaking: [], releasedNotDeployed: [], noLiveSource: [] },
};
const base = (over: Partial<RegressionPolicyInput> = {}): RegressionPolicyInput => ({
  for: "regression", facts, mcp: { servers: [], liveLanes: 3, lanes: { min: 1, want: 3 }, jsonError: null } as any,
  manifestProblems: [], lock: { liveness: "settled", runId: "REG-1", idleMs: null, reason: "completed" },
  gating: { gated: [], unmapped: [], requiredBySuite: { "097": ["virtocommerce.salesrep"], "001": [] }, gatingOff: null },
  suiteIds: ["097", "001"], changedSince: [], baselineRunId: "REG-0", smokeGates: null, smokeDuplicate: null, ...over,
});
const ids = (i: RegressionPolicyInput) => buildRegressionChecks(i).filter((c) => c.status !== "OK").map((c) => `${c.status} ${c.id}`);

test("clean: nothing but OK", () => assert.deepEqual(ids(base()), []));

test("D9: drift on a selected suite's module or the platform is a BLOCK; elsewhere a WARN", () => {
  const f = { ...facts, drift: [{ id: "platform", declared: "3.1", deployed: "3.2" }, { id: "virtocommerce.salesrep", declared: "1", deployed: "2" }, { id: "virtocommerce.other", declared: "1", deployed: "2" }] };
  assert.deepEqual(ids(base({ facts: f })), ["BLOCK drift:platform", "BLOCK drift:virtocommerce.salesrep", "WARN drift"]);
});

test("active run blocks; a stalled one blocks with the reap remedy", () => {
  const c1 = buildRegressionChecks(base({ lock: { liveness: "active", runId: "REG-2", idleMs: 1, reason: "progressed 1 min ago" } })).find((c) => c.id === "active-run")!;
  assert.equal(c1.status, "BLOCK");
  const c2 = buildRegressionChecks(base({ lock: { liveness: "stalled", runId: "REG-2", idleMs: 9e6, reason: "silent" } })).find((c) => c.id === "active-run")!;
  assert.equal(c2.who, "me, with OK");
  assert.match(c2.do!, /regression:reap:apply/);
});

test("gating rows, gating:all, unmapped, gatingOff", () => {
  const g = { gated: [{ suite: "097", module: "virtocommerce.salesrep", state: "not-deployed" as const }], unmapped: [{ entry: "channels", suites: ["076"] }], requiredBySuite: { "097": ["virtocommerce.salesrep"] }, gatingOff: null };
  assert.deepEqual(ids(base({ gating: g, suiteIds: ["097", "001"] })), ["WARN gated:virtocommerce.salesrep", "UNKNOWN unmapped-requires:channels"]);
  assert.deepEqual(ids(base({ gating: g, suiteIds: ["097"] })), ["WARN gated:virtocommerce.salesrep", "BLOCK gating:all", "UNKNOWN unmapped-requires:channels"]);
  assert.deepEqual(ids(base({ gating: { ...g, gated: [], unmapped: [], gatingOff: "deployed token: 401" } })), ["WARN gating"]);
});

test("baseline: none is UNKNOWN; changes are a WARN naming the risk", () => {
  assert.deepEqual(ids(base({ changedSince: { unknown: "no-baseline" }, baselineRunId: null })), ["UNKNOWN baseline"]);
  const c = buildRegressionChecks(base({ changedSince: [{ id: "virtocommerce.salesrep", from: "1", to: "2" }] })).find((x) => x.id === "baseline")!;
  assert.equal(c.status, "WARN");
  assert.match(c.found, /097/);
});

test("false-failure risk: suites requiring a changed module; a platform change risks every suite", () => {
  const g = { gated: [], unmapped: [], requiredBySuite: { "097": ["virtocommerce.salesrep"], "001": [] }, gatingOff: null };
  assert.deepEqual(falseFailureRisk([{ id: "virtocommerce.salesrep", from: "1", to: "2" }], g), ["097"]);
  assert.deepEqual(falseFailureRisk([{ id: "platform", from: "1", to: "2" }], g), ["001", "097"]);
});

test("smoke: gates and same-day duplicate are WARNs", () => {
  assert.deepEqual(ids(base({ for: "smoke", smokeGates: { ok: false, output: "SMK-034 unmapped" }, smokeDuplicate: "SMOKE-2026-10-12-0900" })), ["WARN smoke-gates", "WARN duplicate"]);
});

test("manifest problems are BLOCKs", () => {
  assert.deepEqual(ids(base({ manifestProblems: [{ suiteId: "048c", kind: "no-executor", detail: "no runner" }] })), ["BLOCK manifest:048c"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test scripts/unit/pf2-regression-policy.test.ts`
Expected: FAIL — `Cannot find module '../regression/preflight.ts'`.

- [ ] **Step 3: Implement `scripts/regression/preflight.ts`**

```ts
// scripts/regression/preflight.ts — the BUILD-SCOPED pre-flight (spec §6, §14 D9–D11): one policy for
// /qa-regression and /qa-smoke over the same fact core as the change-scoped one. Read-only.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getEnvFacts, isUnknown, type EnvFacts, type Unknown } from "../lib/env-facts.ts";
import { readLedger } from "../lib/release-ledger-read.ts";
import { envChecks, mcpChecks, isBlocking, type Check, type PolicyInput } from "../preflight/policy.ts";
import { checkMcpStatic, loadMcpRequirements, readMcpJson } from "../preflight/mcp-static.ts";
import { classifyRun, gatherActivity, loadStatus, type Classification } from "./reap-stalled-run.ts";
import { gateSuites, resolveRequiredModule, type GatingResult, type SuiteRef } from "./requires.ts";
import { baselineDelta, readBaseline, type ModuleChange } from "./baseline.ts";

export type BuildFor = "regression" | "smoke";
type Mcp = PolicyInput["mcp"];
export interface RegressionPolicyInput {
  for: BuildFor; facts: EnvFacts; mcp: Mcp;
  manifestProblems: { suiteId: string; kind: string; detail: string }[];
  lock: Classification | null; gating: GatingResult; suiteIds: string[];
  changedSince: ModuleChange[] | Unknown; baselineRunId: string | null;
  smokeGates: { ok: boolean; output: string } | null; smokeDuplicate: string | null;
}
export interface RegressionPreflight {
  for: BuildFor; selection: string; facts: EnvFacts; mcp: Mcp; gating: GatingResult;
  changedSince: ModuleChange[] | Unknown; baselineRunId: string | null; falseFailureRisk: string[];
  checks: Check[]; verdict: "READY" | "NOT READY";
}

const ok = (id: string, found: string): Check => ({ id, status: "OK", found, who: null, do: null, diagnose: [] });

export function falseFailureRisk(changes: ModuleChange[] | Unknown, gating: GatingResult): string[] {
  if (isUnknown(changes) || changes.length === 0) return [];
  const all = Object.keys(gating.requiredBySuite).sort();
  if (changes.some((c) => c.id === "platform")) return all;
  const changed = new Set(changes.map((c) => c.id));
  return all.filter((s) => gating.requiredBySuite[s].some((m) => changed.has(m)));
}

export function buildRegressionChecks(i: RegressionPolicyInput): Check[] {
  const f = i.facts;
  const checks: Check[] = [...envChecks(f, { healthDown: "BLOCK", drift: null }).checks];

  for (const p of i.manifestProblems)
    checks.push({ id: `manifest:${p.suiteId}`, status: "BLOCK", found: `${p.kind}: ${p.detail}`, who: "me, with OK", do: "fix the suite's entry in config/test-suites.json", diagnose: [] });

  if (i.lock?.liveness === "active")
    checks.push({ id: "active-run", status: "BLOCK", found: `${i.lock.runId} is running: ${i.lock.reason}`, who: "me", do: `wait for ${i.lock.runId} to finish, then re-run`, diagnose: ["npm run regression:reap"] });
  else if (i.lock?.liveness === "stalled")
    checks.push({ id: "active-run", status: "BLOCK", found: `${i.lock.runId} is stalled: ${i.lock.reason}`, who: "me, with OK", do: "npm run regression:reap:apply (marks it stalled), then re-run", diagnose: ["npm run regression:reap"] });
  else checks.push(ok("active-run", i.lock ? i.lock.reason : "no run status"));

  // D9: drift on a module a selected suite needs (or the platform) is a BLOCK; elsewhere a WARN.
  if (!isUnknown(f.drift)) {
    const required = new Set(Object.values(i.gating.requiredBySuite).flat());
    const outside: string[] = [];
    for (const d of f.drift) {
      if (d.id === "platform" || required.has(d.id))
        checks.push({ id: `drift:${d.id}`, status: "BLOCK", found: `${d.id} declared ${d.declared ?? "—"}, deployed ${d.deployed ?? "—"}`, who: "me",
          do: "wait for the deploy to settle and re-run, or proceed as is", diagnose: [`gh run list on vc-deploy-dev for the ${f.env} branch`] });
      else outside.push(`${d.id} ${d.declared ?? "—"}→${d.deployed ?? "—"}`);
    }
    if (outside.length) checks.push({ id: "drift", status: "WARN", found: `${outside.length} module(s) no selected suite requires differ: ${outside.slice(0, 3).join(", ")}`, who: "me", do: "name it in the report header", diagnose: [] });
  }

  const byModule = new Map<string, { state: string; suites: string[] }>();
  for (const g of i.gating.gated) {
    const e = byModule.get(g.module) ?? { state: g.state, suites: [] };
    e.suites.push(g.suite);
    byModule.set(g.module, e);
  }
  for (const [mod, e] of byModule)
    checks.push({ id: `gated:${mod}`, status: "WARN", found: `${mod} ${e.state} — suites ${e.suites.join(", ")} leave the plan`, who: "me",
      do: "report them as NOT_DEPLOYED (BLOCKED-on-deploy), never FAIL", diagnose: [] });
  const gatedSuites = new Set(i.gating.gated.map((g) => g.suite));
  if (i.suiteIds.length > 0 && i.suiteIds.every((s) => gatedSuites.has(s)))
    checks.push({ id: "gating:all", status: "BLOCK", found: `every suite of the selection is gated (${i.suiteIds.length}) — nothing left to run`, who: "you", do: "pick another selection, or deploy the missing modules", diagnose: [] });
  if (i.gating.gatingOff)
    checks.push({ id: "gating", status: "WARN", found: `no suite gated: ${i.gating.gatingOff}`, who: "me", do: "every suite runs; resolve the deployed check to gate", diagnose: [] });
  for (const u of i.gating.unmapped)
    checks.push({ id: `unmapped-requires:${u.entry}`, status: "UNKNOWN", found: `resolves to no module (suites ${u.suites.join(", ")} run ungated)`, who: "me, with OK",
      do: "write the full module id in the suites' requiresModules", diagnose: [] });

  if (isUnknown(i.changedSince))
    checks.push({ id: "baseline", status: "UNKNOWN", found: i.changedSince.unknown === "no-baseline" ? "no baseline yet for this env" : `baseline Δ: ${i.changedSince.unknown}`, who: "me",
      do: "written when a completed run is closed with npm run regression:close", diagnose: [] });
  else if (i.changedSince.length > 0) {
    const risk = falseFailureRisk(i.changedSince, i.gating);
    checks.push({ id: "baseline", status: "WARN", found: `${i.changedSince.length} change(s) since ${i.baselineRunId}: ${i.changedSince.slice(0, 3).map((c) => `${c.id} ${c.from ?? "—"}→${c.to ?? "—"}`).join(", ")}; false-failure risk: ${risk.join(", ") || "none selected"}`,
      who: "me", do: "name the risk suites in the report header; a failure there is checked against the change first", diagnose: [] });
  } else checks.push(ok("baseline", `no change since ${i.baselineRunId}`));

  if (i.for === "smoke" && i.smokeGates && !i.smokeGates.ok)
    checks.push({ id: "smoke-gates", status: "WARN", found: `suites:gates failed: ${i.smokeGates.output.split(/\r?\n/).find((l) => l.trim()) ?? "see output"}`, who: "me, with OK",
      do: "reconcile the checklist with the CSV, or report the verdict as provisional", diagnose: ["npm run suites:gates"] });
  if (i.for === "smoke" && i.smokeDuplicate)
    checks.push({ id: "duplicate", status: "WARN", found: `${i.smokeDuplicate} ran today`, who: "you", do: "re-run, or read that run's verdict", diagnose: [] });

  checks.push(...mcpChecks(i.mcp));
  return checks;
}

function smokeDuplicateToday(root: string, now: Date): string | null {
  const dir = join(root, "reports", "regression");
  if (!existsSync(dir)) return null;
  const day = now.toISOString().slice(0, 10);
  return readdirSync(dir).filter((n) => n.startsWith(`SMOKE-${day}`)).sort().at(-1) ?? null;
}

function runSmokeGates(root: string): { ok: boolean; output: string } {
  const r = spawnSync("npx", ["tsx", "scripts/test-cases/check-smoke-gates.ts"], { cwd: root, encoding: "utf8", shell: true });
  return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

export async function runRegressionPreflight(o: {
  for: BuildFor; selection: string; suites: SuiteRef[];
  manifestProblems: { suiteId: string; kind: string; detail: string }[];
  root: string; now?: Date; env?: string;
}): Promise<RegressionPreflight> {
  const now = o.now ?? new Date();
  const required = [...new Set(o.suites.flatMap((s) => (s.requiresModules ?? []).map((e) => resolveRequiredModule(e).pascal)))];
  const facts = await getEnvFacts({ env: o.env, components: required, storefront: o.suites.some((s) => s.layer === "frontend"), now });
  const mcpJson = readMcpJson(o.root);   // { json, error } — same construction as scripts/preflight/cli.ts
  const mcp = { ...checkMcpStatic(o.for, loadMcpRequirements(o.root), mcpJson.json), jsonError: mcpJson.error };
  const regRoot = join(o.root, "reports", "regression");
  const status = loadStatus(regRoot);
  const lock = status?.runId ? classifyRun(status, gatherActivity(regRoot, String(status.runId)), now.getTime()) : classifyRun(status, { newestActivityMs: null }, now.getTime());
  let ledger = null;
  try { ledger = readLedger(o.root); } catch { ledger = null; }
  const gating = gateSuites(o.suites, facts, ledger);
  const baseline = readBaseline(o.root, facts.env);
  const changedSince = baselineDelta(baseline, facts);
  const checks = buildRegressionChecks({
    for: o.for, facts, mcp, manifestProblems: o.manifestProblems, lock, gating, suiteIds: o.suites.map((s) => s.id),
    changedSince, baselineRunId: baseline?.runId ?? null,
    smokeGates: o.for === "smoke" ? runSmokeGates(o.root) : null,
    smokeDuplicate: o.for === "smoke" ? smokeDuplicateToday(o.root, now) : null,
  });
  return {
    for: o.for, selection: o.selection, facts, mcp, gating, changedSince, baselineRunId: baseline?.runId ?? null,
    falseFailureRisk: falseFailureRisk(changedSince, gating), checks, verdict: isBlocking(checks) ? "NOT READY" : "READY",
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test scripts/unit/pf2-regression-policy.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Delete the temporary test, commit**

```bash
rm scripts/unit/pf2-regression-policy.test.ts
git add scripts/regression/preflight.ts
git commit -m "feat(regression): build-scoped pre-flight policy - lock, D9 drift, gating, baseline, smoke gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `regression:plan --preflight`

**Files:**
- Modify: `scripts/regression/plan-run.ts` (`parseArgs`, `main` → async, gating before planning, output, exit)

**Interfaces:**
- Consumes: `runRegressionPreflight`, `RegressionPreflight` (Task 6); `renderHuman` (`scripts/preflight/render.ts`).
- Produces: `npm run regression:plan -- <selection> --preflight [--preflight-out <path>] [--json]`. JSON gains a top-level `preflight` key (the whole `RegressionPreflight`) only with `--preflight`. Gated suites are removed before `buildRunPlan` and listed under `preflight.gating.gated`.

- [ ] **Step 0: Record today's output (before touching the file)**

Run: `npm run regression:plan -- smoke --json > "$TMPDIR/plan-before.json"`

- [ ] **Step 1: Arguments**

In `parseArgs`'s return type add `preflight: boolean; preflightOut: string | null;` and in its returned object:

```ts
    preflight: flags.has("--preflight"),
    preflightOut: (() => { const i = args.indexOf("--preflight-out"); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; })(),
```

and change `const positional = args.filter((a) => !a.startsWith("--"));` to skip the value of `--preflight-out` and the numeric flags' values:

```ts
  const valued = new Set(["--preflight-out", "--browsers", "--fastpath", "--deterministic"]);
  const positional = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
```

- [ ] **Step 2: Imports and async main**

Add imports:

```ts
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { runRegressionPreflight, type RegressionPreflight } from "./preflight.ts";
import { renderHuman } from "../preflight/render.ts";
```

(merge `existsSync` into the existing `fs` import line rather than adding a second one). Change `function main(): void {` to `async function main(): Promise<void> {` and the destructuring line to:

```ts
  const { selection, json, verbose, concurrency, preflight: wantPreflight, preflightOut } = parseArgs(process.argv.slice(2));
```

Replace the last line `if (isCli) main();` with:

```ts
if (isCli) main().catch((e) => { console.error(`✗ regression pre-flight could not run: ${(e as Error).message}`); process.exit(3); });
```

- [ ] **Step 3: Run the pre-flight and gate before planning**

Replace `const plannable: PlannableSuite[] = suites.map((s) => ({` with:

```ts
  let pf: RegressionPreflight | null = null;
  let toPlan = suites;
  if (wantPreflight) {
    pf = await runRegressionPreflight({
      for: selection === "smoke" ? "smoke" : "regression", selection,
      suites: suites.map((s) => ({ id: s.id, layer: s.layer, requiresModules: s.requiresModules })),
      manifestProblems: problems.map((p) => ({ suiteId: p.suiteId, kind: p.kind, detail: p.detail })),
      root: process.cwd(),
    });
    const gated = new Set(pf.gating.gated.map((g) => g.suite));
    toPlan = suites.filter((s) => !gated.has(s.id));
    if (preflightOut) {
      mkdirSync(dirname(preflightOut), { recursive: true });
      writeFileSync(preflightOut, JSON.stringify(pf, null, 2) + "\n", "utf8");
    }
  }

  const plannable: PlannableSuite[] = toPlan.map((s) => ({
```

- [ ] **Step 4: Output and exit**

In the JSON branch, add `...(pf ? { preflight: pf } : {}),` as the first property of `out`, and replace its exit line with:

```ts
    process.exit(problems.length > 0 || plan.capAnomalies.length > 0 ? 1 : pf?.verdict === "NOT READY" ? 2 : 0);
```

In the human branch, directly after `console.log(\`=== Regression plan: ${selection} ===\`);` add:

```ts
  if (pf) {
    process.stdout.write(renderHuman({ env: pf.facts.env, for: pf.for, at: new Date() }, pf.facts, pf.checks));
    if (pf.falseFailureRisk.length) console.log(`False-failure risk (changed since ${pf.baselineRunId}): ${pf.falseFailureRisk.join(", ")}`);
    console.log("");
  }
```

and replace the final `process.exit(0);` with:

```ts
  if (pf?.verdict === "NOT READY") {
    console.error("\nPre-flight NOT READY — see the BLOCK rows above.");
    process.exit(2);
  }
  process.exit(0);
```

- [ ] **Step 5: Without `--preflight` nothing changed**

Run: `npm run regression:plan -- smoke --json > "$TMPDIR/plan-after.json"; node -e "const a=require(process.argv[1]),b=require(process.argv[2]);console.log(JSON.stringify(a)===JSON.stringify(b) ? 'identical' : 'DIFFERENT')" "$TMPDIR/plan-before.json" "$TMPDIR/plan-after.json"`
Expected: `identical` — and no `preflight` key. (Do not use `git stash` for this comparison: the stash stack is shared with other worktrees.)

- [ ] **Step 6: Live with `--preflight` (read-only)**

Run: `npm run regression:plan -- smoke --preflight; echo "exit=$?"`
Expected: the pre-flight form (`Preflight · vcst · smoke · …`) above the plan; on a healthy stand `READY`, an UNKNOWN `baseline` row on the first run, possibly a `smoke-gates` WARN; `exit=0`.

Run: `npm run regression:plan -- 073,097,076 --preflight --json | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.preflight.verdict, JSON.stringify(j.preflight.gating), j.lanes.flatMap(l=>l.dispatchOrder.map(s=>s.id)).join(','))"`
Expected: a verdict, the gating result, and a dispatch list that omits exactly the suites in `gating.gated`.

Run: `ADMIN_PASSWORD_VCST=wrong npm run regression:plan -- 073 --preflight; echo "exit=$?"`
Expected: a WARN `gating` row (nothing gated because deployed is UNKNOWN), 073 still in the plan (Review Focus 1).

- [ ] **Step 7: Commit**

```bash
git add scripts/regression/plan-run.ts
git commit -m "feat(regression): regression:plan --preflight - gated suites leave the plan; --preflight-out for the run folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The skill's build-scoped entry

**Files:**
- Modify: `.claude/skills/preflight/SKILL.md`

- [ ] **Step 1: Frontmatter**

Replace the `argument-hint:` value with:

```yaml
argument-hint: "<ticket|ticket-fast|exploratory|lifecycle|domain-map|ba> [--ticket KEY] [--components A,B] [--domain slug] [--expect Module.Id@version] [--storefront]  |  <regression|smoke> --selection <name|ids> [--out <run-folder>/preflight.json]"
```

and add `/qa-regression, /qa-smoke` to the `description`'s "Use at the start of …" list.

- [ ] **Step 2: Step 1 — the build-scoped CLI**

After the step-1 code block, add:

```markdown
**Build-scoped (`regression`, `smoke`)** runs the regression planner instead:

    npm run regression:plan -- <selection> --preflight --json [--preflight-out reports/regression/<RUN_ID>/preflight.json]

Its JSON carries the pre-flight under `preflight` (same `checks[]`, `verdict`, `facts`) plus the plan.
Exit `2` NOT READY · `1` the selection itself cannot run (unknown id, missing CSV, no executor) · `3`
could not run. Gated suites (`preflight.gating.gated`) are already **out** of the plan: report each as
`NOT_DEPLOYED` (BLOCKED-on-deploy), never FAIL. For step 4, run the same command without `--json`.
```

- [ ] **Step 3: "Not this skill"**

Delete ` · the regression pre-flight (\`regression:plan --preflight\`, phase 2)` from the last section.

- [ ] **Step 4: Gate and commit**

Run: `npm run context:check` → PASS; `wc -c .claude/skills/preflight/SKILL.md` → below 19000.

```bash
git add .claude/skills/preflight/SKILL.md
git commit -m "feat(preflight): build-scoped entry for regression and smoke

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Commands and agents call it; the run closes through `regression:close`

**Files:**
- Modify: `.claude/commands/qa-regression.md` (Step 0 items 1–4; Step 4 item 1)
- Modify: `.claude/commands/qa-smoke.md` (Step 0 items 1–6)
- Modify: `.claude/agents/regression-orchestrator.md` (Step 1.5 command; Step 6 status flip)
- Modify: `.claude/templates/agent-dispatch.md` (the `deploy-state-cache.json` sentence)
- Delete: `reports/deploy-state-cache.json`
- Modify: `docs/superpowers/specs/2026-10-08-preflight-skill-design.md` (§9 Phase 2 → done, one line)

- [ ] **Step 1: `qa-regression.md` Step 0**

Replace items `1.` through `4.` of `### Step 0 — Pre-Flight` (from `1. **Environment health**` through the end of item 4's `**Released ≠ deployed.**` paragraph) with:

```markdown
1. **[`/preflight`](../skills/preflight/SKILL.md) `regression --selection <selection>`** — env health,
   the deployed build, the active-run lock (`regression:reap` classification; a stalled run is offered
   `regression:reap:apply`, with your OK), drift on the selected suites' modules (BLOCK), module gating
   from `requiresModules` × deployed (gated suites leave the plan as `NOT_DEPLOYED`, never FAIL), the Δ
   since this env's baseline (its false-failure-risk suites go in the report header), ⚠ BREAKING for the
   selected suites' components, and MCP lanes — one output form, one question only on a BLOCK.
   **A ledger or baseline entry raises a hypothesis; the evidence decides the verdict** — `/qa-triage-results`'
   `ambiguous → REAL_BUG / CONFIDENCE: LOW` bias is unchanged, and a change alone never moves a failure
   from `REAL_BUG` to `STALE_TEST`.
```

- [ ] **Step 2: `qa-regression.md` Step 4 item 1**

Replace the code block `npm run regression:plan -- <selection> --json` in Step 4 item 1 with:

```bash
npm run regression:plan -- <selection> --preflight --json --preflight-out reports/regression/{RUN_ID}/preflight.json
```

and append to that item: `Exit 2 = pre-flight NOT READY: stop and report. The suites in \`preflight.gating.gated\` are not in the plan — list them in the report as NOT_DEPLOYED. \`preflight.json\` in the run folder is what \`regression:close\` turns into the next run's baseline.`

- [ ] **Step 3: `regression-orchestrator.md` Step 1.5 and Step 6**

In Step 1.5, replace `npm run regression:plan -- <selection> --json` with the same command as Step 2 above, and after its "Exit code 1 means…" sentence add `Exit 2 means the pre-flight is NOT READY — stop and report.`

In Step 6, replace the paragraph `Update \`test-run-status.json\` to \`status: "completed"\` (set \`finishedAt\`). The background watcher …` and the following `**You are the only writer of that flip — nothing deterministic does it for you.** …` paragraph with:

```markdown
Close the run with **one command** — it appends `history.json`, flips `test-run-status.json` to
`completed`, and writes this env's baseline from `preflight.json`:

    npm run regression:close -- --run-id {RUN_ID} --env <TEST_ENV>

Close on EVERY exit path, including an aborted or partially-failed run (`completed` with the failures
recorded). If it refuses because suites are still open on an aborted run, flip `test-run-status.json`
to `completed` by hand (set `finishedAt`) — an abandoned `in_progress` blocks every future run; the
backstop when you cannot is `npm run regression:reap` / `:apply`.
```

- [ ] **Step 4: `qa-smoke.md` Step 0**

Replace items `1.` through `6.` of `### Step 0 — Pre-Flight` with:

```markdown
1. **[`/preflight`](../skills/preflight/SKILL.md) `smoke --selection smoke`** — env health, the deployed
   build (recorded in the smoke report header, Step 4), the active-run lock, drift, smoke **gate
   integrity** (`suites:gates`: a non-zero exit is a WARN — reconcile the checklist against the CSV, or
   report the verdict as provisional, naming the unmapped cases), today's `SMOKE-*` duplicate, MCP, and
   kb → VirtoOZ grounding for the smoke path's coordinates (a red smoke case that the base already
   records is *known behaviour*, not a new regression).
```

- [ ] **Step 5: `agent-dispatch.md` and the cache file**

Replace the sentence starting `Store the fetched deploy state in \`reports/deploy-state-cache.json\`` (line ~220) with:

```markdown
The per-env comparison point is `reports/regression/baseline.<env>.json`, written by `regression:close`
for a completed run (`scripts/regression/baseline.ts`); `reports/deploy-state-cache.json` is retired.
```

Run: `git rm reports/deploy-state-cache.json`
Run: `git grep -n "deploy-state-cache" -- . ':!docs/superpowers'`
Expected: only the sentence just written in `agent-dispatch.md`.

- [ ] **Step 6: Spec §9**

In the spec's `### Phase 2 — build-scoped (PR 2)` list, append: `- **Done** in this PR — decisions in §14; plan `docs/superpowers/plans/2026-10-12-preflight-phase-2.md`.`

- [ ] **Step 7: Gates**

Run: `npm run context:check`
Expected: PASS. `qa-regression.md` and `regression-orchestrator.md` shrank; if `context:check` reports the shrink against the baseline, run `npm run context:check:baseline` and include the baseline file.
Run: `npm test`
Expected: the same pass/fail counts as `main` in this checkout (no new failure).
Run: `git status --porcelain scripts/unit` → empty.

- [ ] **Step 8: Commit**

```bash
git add .claude/commands/qa-regression.md .claude/commands/qa-smoke.md .claude/agents/regression-orchestrator.md .claude/templates/agent-dispatch.md docs/superpowers/specs/2026-10-08-preflight-skill-design.md scripts/maintenance/.prompt-size-baseline.json
git commit -m "refactor(regression): qa-regression and qa-smoke call /preflight; runs close through regression:close; retire deploy-state-cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
