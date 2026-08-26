/**
 * suite-selection — change-scoped suite selection.
 *
 * Two properties matter more than any narrowing this module does, and both are inversions of
 * rules that hold elsewhere in this codebase:
 *
 *   1. It fails OPEN. Everything else here fails closed (a doubtful case goes to the browser
 *      lane, a doubtful ownership routes to client, a doubtful bug BAILs). Here the expensive
 *      direction is reversed: an unnecessary suite costs its estimatedMinutes, a missing one
 *      ships a regression. So doubt must WIDEN.
 *   2. The risk floor is not negotiable. A time budget must not be able to remove the P0 gate,
 *      because that is the one thing a change-scoped run cannot be allowed to do quietly.
 *
 * Tests are fixture-based for the rules and corpus-based for the claims, so a manifest change
 * cannot leave a documented number stale.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  SELECTOR_VERSION,
  formatSelection,
  manifestVocabulary,
  pathTokens,
  selectSuites,
  type ChangedPath,
  type SelectableSuite,
} from "../lib/suite-selection.ts";
import { loadManifest } from "../../ci/lib/suite-manifest.ts";
import { resolveSuiteSource } from "../test-cases/suite-source-map.ts";

const CONCURRENCY = { browser: 3, fastpath: 4, deterministic: 2 } as const;

function suite(over: Partial<SelectableSuite> & { id: string }): SelectableSuite {
  return {
    name: `Suite ${over.id}`,
    file: `regression/suites/Frontend/x/${over.id}.csv`,
    priority: "P2",
    testCount: 10,
    estimatedMinutes: 10,
    ...over,
  };
}

// ---------------------------------------------------------------------------------------------
// Vocabulary and path tokens — derived, never transcribed
// ---------------------------------------------------------------------------------------------

test("vocabulary comes from the manifest's own domains and tags", () => {
  const vocab = manifestVocabulary([
    suite({ id: "001", domain: "catalog-search", tags: ["catalog", "facets"] }),
    suite({ id: "002", domain: "purchase-flow", tags: ["cart"] }),
  ]);
  assert.deepEqual([...vocab].sort(), ["cart", "catalog", "catalog-search", "facets", "purchase-flow"]);
});

test("pathTokens keeps only words the manifest knows", () => {
  const vocab = new Set(["checkout", "cart"]);
  assert.deepEqual(pathTokens("client-app/shared/checkout/components/x.vue", vocab), ["checkout"]);
  assert.deepEqual(pathTokens("client-app/shared/nothing/here.ts", vocab), []);
});

test("pathTokens splits a hyphenated segment but only on an EXACT vocabulary hit", () => {
  // A prefix match would let `cart` capture `cartridge`, which is how a path map starts lying.
  const vocab = new Set(["configurable", "cart"]);
  assert.deepEqual(pathTokens("client-app/configurable-products/x.vue", vocab), ["configurable"]);
  assert.deepEqual(pathTokens("client-app/cartridge/x.vue", new Set(["cart"])), []);
});

test("pathTokens strips the file extension before matching", () => {
  assert.deepEqual(pathTokens("a/b/cart.ts", new Set(["cart"])), ["cart"]);
});

// ---------------------------------------------------------------------------------------------
// Change scope
// ---------------------------------------------------------------------------------------------

const SUITES: SelectableSuite[] = [
  suite({ id: "001", domain: "catalog-search", tags: ["catalog"], estimatedMinutes: 20 }),
  suite({ id: "028", domain: "purchase-flow", tags: ["cart"], estimatedMinutes: 41 }),
  suite({ id: "036", domain: "purchase-flow", tags: ["checkout"], estimatedMinutes: 30 }),
  suite({ id: "042", domain: "cross-cutting", tags: ["smoke"], priority: "P0", estimatedMinutes: 18 }),
  suite({ id: "099", domain: "marketing", tags: ["promotions"], estimatedMinutes: 25 }),
];
const REPOS = new Map<string, readonly string[]>([
  ["001", ["vc-module-catalog"]],
  ["028", ["vc-frontend"]],
  ["036", ["vc-frontend"]],
  ["042", ["vc-frontend"]],
  ["099", ["vc-module-marketing"]],
]);

test("a module change selects by the manifest's vocabulary, and the repo index only ADDS", () => {
  // `src/VirtoCommerce.CatalogModule.Data/...` yields the token `catalog` (dots + CamelCase +
  // the `Module` suffix are all split), so this narrows rather than widens — the repo index is
  // an additive bonus, never a filter that could remove a vocabulary hit.
  const r = selectSuites({
    suites: SUITES,
    changed: [{ repo: "vc-module-catalog", path: "src/VirtoCommerce.CatalogModule.Data/Services/ProductService.cs" }],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  const ids = r.selected.map((s) => s.id);
  assert.ok(ids.includes("001"), ids.join(","));
  assert.equal(r.widened, false);
  assert.equal(r.selected.find((s) => s.id === "001")?.reasons.some((x) => x.kind === "change"), true);
});

test("a .NET module path yields its domain token — dots, CamelCase and the Module suffix", () => {
  // Without this the primary signal finds nothing anywhere in the backend, and every backend
  // change silently collapses to the risk floor while reporting a scoped run.
  const vocab = new Set(["catalog", "order", "pricing"]);
  assert.deepEqual(
    pathTokens("src/VirtoCommerce.CatalogModule.Data/Services/ProductService.cs", vocab),
    ["catalog"],
  );
  assert.deepEqual(pathTokens("src/VirtoCommerce.OrderModule.Web/Controllers/X.cs", vocab), ["order"]);
});

test("a path segment the manifest knows NARROWS inside the repo", () => {
  const r = selectSuites({
    suites: SUITES,
    changed: [{ repo: "vc-frontend", path: "client-app/shared/checkout/components/x.vue" }],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  const change = r.selected.filter((s) => s.reasons.some((x) => x.kind === "change")).map((s) => s.id);
  // 036 is the checkout suite the token matched; 028 and 042 come in because the (incomplete)
  // repo index also places them in vc-frontend. Union, not intersection.
  assert.ok(change.includes("036"), change.join(","));
  assert.equal(r.widened, false);
  assert.equal(
    r.selected.find((s) => s.id === "036")?.reasons.some((x) => x.detail.includes("checkout")),
    true,
  );
});

test("FAIL-OPEN: nothing matched inside a known repo widens to the whole LAYER, not the repo's few", () => {
  // The inversion, and the reason the fallback is the layer: the repo index is the signal that
  // just failed (it resolves repos for only 44 of 127 suites corpus-wide), so leaning on it here
  // would narrow on the strength of a gap. `vc-frontend` names 7 suites while 53 carry
  // layer: frontend — a repo-based fallback would skip 46 of them.
  const layered: SelectableSuite[] = [
    suite({ id: "A1", layer: "frontend", domain: "d1", estimatedMinutes: 5 }),
    suite({ id: "A2", layer: "frontend", domain: "d2", estimatedMinutes: 5 }),
    suite({ id: "B1", layer: "backend", domain: "d3", estimatedMinutes: 5 }),
  ];
  // Only A1 is placed in the repo by the index — A2 is the suite a repo-based fallback loses.
  const idx = new Map<string, readonly string[]>([["A1", ["vc-frontend"]]]);
  const r = selectSuites({
    suites: layered,
    changed: [{ repo: "vc-frontend", path: "client-app/totally/unknown/thing.ts" }],
    suiteRepos: idx,
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  const ids = r.selected.map((s) => s.id).sort();
  assert.deepEqual(ids, ["A1", "A2"], "the whole frontend layer, and no backend suite");
  assert.equal(r.widened, true);
  assert.deepEqual(r.unmappedPaths, ["vc-frontend/client-app/totally/unknown/thing.ts"]);
});

test("the layer fallback does not leak into another layer", () => {
  const layered: SelectableSuite[] = [
    suite({ id: "A1", layer: "frontend", domain: "d1" }),
    suite({ id: "B1", layer: "backend", domain: "d2" }),
  ];
  const r = selectSuites({
    suites: layered,
    changed: [{ repo: "vc-frontend", path: "x/unknown.ts" }],
    suiteRepos: new Map([["A1", ["vc-frontend"]]]),
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  assert.deepEqual(r.selected.map((s) => s.id), ["A1"]);
});

test("an unknown repo is REPORTED, not silently widened to the whole corpus", () => {
  // Widening on a repo we cannot place at all would select everything on any typo. The risk
  // floor carries the run instead, and the path is named so the mapping gap is fixable.
  const r = selectSuites({
    suites: SUITES,
    changed: [{ repo: "vc-module-somethingelse", path: "src/X.cs" }],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  assert.deepEqual(r.unmappedPaths, ["vc-module-somethingelse/src/X.cs"]);
  assert.deepEqual(r.selected.map((s) => s.id), ["042"], "only the P0 floor");
});

test("no changes at all still runs the risk floor", () => {
  const r = selectSuites({ suites: SUITES, changed: [], suiteRepos: REPOS, concurrency: CONCURRENCY, rotationCount: 0 });
  assert.deepEqual(r.selected.map((s) => s.id), ["042"]);
  assert.equal(r.selected[0].reasons[0].kind, "risk-floor");
});

// ---------------------------------------------------------------------------------------------
// Risk floor, history, rotation
// ---------------------------------------------------------------------------------------------

test("the risk floor covers P0 and critical-ui-scope", () => {
  const withScope = [...SUITES, suite({ id: "048c", tags: ["critical-ui-scope"], estimatedMinutes: 3 })];
  const r = selectSuites({ suites: withScope, changed: [], suiteRepos: REPOS, concurrency: CONCURRENCY, rotationCount: 0 });
  assert.deepEqual(r.selected.map((s) => s.id).sort(), ["042", "048c"]);
});

test("history signals select a suite even with no change touching it", () => {
  const r = selectSuites({
    suites: SUITES,
    changed: [],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
    history: [{ suiteId: "099", flaky: true }, { suiteId: "028", consecutiveDrops: 2 }],
  });
  assert.deepEqual(r.selected.map((s) => s.id).sort(), ["028", "042", "099"]);
});

test("one consecutive drop is not enough — the threshold is two", () => {
  const r = selectSuites({
    suites: SUITES,
    changed: [],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
    history: [{ suiteId: "099", consecutiveDrops: 1 }],
  });
  assert.deepEqual(r.selected.map((s) => s.id), ["042"]);
});

test("an absent history is a no-op, not an error", () => {
  // Documented state today: history.json is un-ignored but no run has written one.
  const r = selectSuites({ suites: SUITES, changed: [], suiteRepos: REPOS, concurrency: CONCURRENCY, rotationCount: 0 });
  assert.equal(r.selected.every((s) => !s.reasons.some((x) => x.kind === "history")), true);
});

test("rotation tops up with the stalest suites, and never double-counts one already selected", () => {
  const r = selectSuites({
    suites: SUITES,
    changed: [],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotation: ["042", "099", "001"],
    rotationCount: 2,
  });
  // 042 is already in via the risk floor, so the top-up spends its two slots on 099 and 001.
  assert.deepEqual(r.selected.map((s) => s.id).sort(), ["001", "042", "099"]);
  assert.equal(r.selected.find((s) => s.id === "042")?.reasons.some((x) => x.kind === "rotation"), false);
});

// ---------------------------------------------------------------------------------------------
// Makespan trimming — and what it may never trim
// ---------------------------------------------------------------------------------------------

test("trimming drops suites until the predicted makespan fits, and names every one", () => {
  const r = selectSuites({
    suites: SUITES,
    changed: [
      { repo: "vc-frontend", path: "client-app/shared/utils/x.ts" },
      { repo: "vc-module-catalog", path: "src/X.cs" },
      { repo: "vc-module-marketing", path: "src/Y.cs" },
    ],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
    targetMinutes: 41,
  });
  assert.ok(r.predictedMakespanMinutes <= 41, `makespan ${r.predictedMakespanMinutes}`);
  assert.ok(r.excluded.length > 0, "something had to go");
  for (const e of r.excluded) assert.match(e.reason, /trimmed to fit 41 min/);
});

test("INVARIANT: trimming can never drop a risk-floor suite", () => {
  // A tight time budget must not be able to remove the P0 gate. Target of 1 minute is
  // deliberately impossible, so the only way to satisfy it would be to drop the floor.
  const r = selectSuites({
    suites: SUITES,
    changed: [{ repo: "vc-frontend", path: "client-app/shared/utils/x.ts" }],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
    targetMinutes: 1,
  });
  assert.ok(r.selected.some((s) => s.id === "042"), "P0 survived");
  assert.ok(r.predictedMakespanMinutes > 1, "and the overrun is reported honestly, not cheated");
});

test("an impossible target terminates rather than looping", () => {
  const r = selectSuites({
    suites: [suite({ id: "042", priority: "P0", estimatedMinutes: 500 })],
    changed: [],
    suiteRepos: new Map([["042", ["vc-frontend"]]]),
    concurrency: CONCURRENCY,
    rotationCount: 0,
    targetMinutes: 1,
  });
  assert.deepEqual(r.selected.map((s) => s.id), ["042"]);
  assert.deepEqual(r.excluded, []);
});

test("no target means no trimming and no excluded list", () => {
  const r = selectSuites({
    suites: SUITES,
    changed: [{ repo: "vc-frontend", path: "client-app/shared/utils/x.ts" }],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  assert.deepEqual(r.excluded, []);
});

test("selection is deterministic — the same input gives the same set twice", () => {
  // A selector that varies cannot be shadow-compared against a full run, which is the only
  // planned way to find out whether it misses regressions.
  const input = {
    suites: SUITES,
    changed: [{ repo: "vc-frontend", path: "client-app/shared/utils/x.ts" }] as ChangedPath[],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotation: ["099", "001"],
    rotationCount: 1,
    targetMinutes: 60,
  };
  const a = selectSuites(input);
  const b = selectSuites(input);
  assert.deepEqual(a, b);
});

test("the report prints the excluded list — coverage debt is never summarised away", () => {
  const r = selectSuites({
    suites: SUITES,
    changed: [{ repo: "vc-frontend", path: "client-app/shared/utils/x.ts" }],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
    targetMinutes: 20,
  });
  const text = formatSelection(r);
  assert.match(text, /EXCLUDED/);
  assert.match(text, /coverage debt, not a pass/);
  for (const e of r.excluded) assert.ok(text.includes(e.id), `${e.id} missing from the report`);
});

test("SELECTOR_VERSION is a comparable semver", () => {
  assert.match(SELECTOR_VERSION, /^\d+\.\d+\.\d+$/);
});

// ---------------------------------------------------------------------------------------------
// Against the real manifest — so a documented claim cannot go stale
// ---------------------------------------------------------------------------------------------

const manifest = loadManifest();

function realSuites(): SelectableSuite[] {
  return manifest.suites.map((s) => ({
    id: s.id,
    name: s.name,
    file: s.file,
    domain: (s as { domain?: string }).domain,
    priority: (s as { priority?: string }).priority,
    tags: (s as { tags?: string[] }).tags,
    testCount: s.testCount,
    estimatedMinutes: (s as { estimatedMinutes?: number }).estimatedMinutes,
    clickDriven: (s as { clickDriven?: boolean }).clickDriven,
    runner: (s as { runner?: string }).runner,
    preferredBrowser: (s as { preferredBrowser?: string }).preferredBrowser,
  }));
}

function realRepoIndex(): Map<string, readonly string[]> {
  const idx = new Map<string, readonly string[]>();
  for (const s of manifest.suites) {
    const src = resolveSuiteSource(s.id, (s as { requiresModules?: string[] }).requiresModules ?? []);
    idx.set(s.id, src.repos);
  }
  return idx;
}

test("CORPUS: the risk floor is the manifest's P0 set plus critical-ui-scope", () => {
  // Derived, not pinned to a number: the plan said "the 9 P0 suites" and the manifest carries a
  // different count, which is exactly why this reads it rather than restating it.
  const suites = realSuites();
  const r = selectSuites({ suites, changed: [], suiteRepos: realRepoIndex(), concurrency: CONCURRENCY, rotationCount: 0 });
  const expected = suites
    .filter((s) => s.priority === "P0" || (s.tags ?? []).includes("critical-ui-scope"))
    .map((s) => s.id)
    .sort();
  assert.deepEqual(r.selected.map((s) => s.id).sort(), expected);
  assert.ok(expected.length >= 10, `only ${expected.length} floor suites — did priority data move?`);
});

test("CORPUS: a single-module change selects far fewer suites than the whole corpus", () => {
  // The claim the whole increment rests on, asserted as an inequality rather than a figure so a
  // manifest edit cannot quietly falsify a hard-coded number.
  const suites = realSuites();
  const r = selectSuites({
    suites,
    changed: [{ repo: "vc-module-catalog", path: "src/VirtoCommerce.CatalogModule.Data/Services/ProductService.cs" }],
    suiteRepos: realRepoIndex(),
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  assert.ok(r.selected.length < suites.length / 2, `${r.selected.length} of ${suites.length} selected`);
  assert.ok(
    r.predictedMakespanMinutes < r.fullMakespanMinutes,
    `${r.predictedMakespanMinutes} vs ${r.fullMakespanMinutes}`,
  );
});

test("CORPUS: the repo index is INCOMPLETE, which is why it is not the primary signal", () => {
  // Measured, and it is the finding that shaped this module: resolveSuiteSource yields modules
  // for most suites but repos for a minority, because reposForModule reports router-matched
  // names only. Asserted as a bound rather than a pinned number so the ratio can improve without
  // a red test — but if it ever became complete, the primary/bonus ordering could be revisited.
  const idx = realRepoIndex();
  const withRepos = [...idx.values()].filter((r) => r.length > 0).length;
  assert.ok(withRepos > 0, "no suite resolves to a repo at all — the index broke");
  assert.ok(
    withRepos < idx.size,
    `the repo index resolved ALL ${idx.size} suites; the primary/bonus signal order assumes it does not`,
  );

  // And the vocabulary signal, which IS complete, must cover every suite.
  const suites = realSuites();
  const uncovered = suites.filter((s) => !s.domain && (s.tags ?? []).length === 0);
  assert.deepEqual(uncovered.map((s) => s.id), [], "a suite with no domain and no tags is invisible to change scope");
});

test("CORPUS: a changed test-case CSV selects the suites it belongs to", () => {
  // This started as a test that such a path must be UNMAPPED. It should not be: editing
  // 028-cart-core.csv is exactly the case where the changed cases ought to run, which is what
  // ci/run-full-cycle.ts Phase 1 → Phase 2 does. The path's own segments carry the answer.
  const r = selectSuites({
    suites: realSuites(),
    changed: [{ repo: "vc-mcp-testing-module", path: "regression/suites/Frontend/cart/028-cart-core.csv" }],
    suiteRepos: realRepoIndex(),
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  assert.ok(r.selected.some((s) => s.id === "028"), "the edited suite itself");
  assert.ok(r.selected.length < realSuites().length / 2, `${r.selected.length} selected`);
});

test("CORPUS: an unknown repo with no usable token leaves exactly the risk floor", () => {
  // Widening on an unplaceable repo would select the whole corpus on any typo, so this branch
  // reports the path instead — and the run is still gated by P0.
  const suites = realSuites();
  const r = selectSuites({
    suites,
    changed: [{ repo: "vc-module-doesnotexist", path: "zzz/qqq.xyz" }],
    suiteRepos: realRepoIndex(),
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  const floor = suites
    .filter((s) => s.priority === "P0" || (s.tags ?? []).includes("critical-ui-scope"))
    .map((s) => s.id)
    .sort();
  assert.deepEqual(r.selected.map((s) => s.id).sort(), floor);
  assert.deepEqual(r.unmappedPaths, ["vc-module-doesnotexist/zzz/qqq.xyz"]);
});

test("the manifest file the corpus tests read actually exists", () => {
  assert.ok(existsSync("config/test-suites.json"));
  assert.ok(readFileSync("config/test-suites.json", "utf-8").length > 0);
});

test("the report prints DISTINCT reason kinds, not one per piece of evidence", () => {
  // A vocabulary hit and a repo-index hit are two pieces of evidence for one reason; printing
  // `change+change` reads like a bug in the selector rather than a detail of the report.
  const r = selectSuites({
    suites: SUITES,
    changed: [{ repo: "vc-frontend", path: "client-app/shared/checkout/x.vue" }],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
  });
  const text = formatSelection(r);
  assert.doesNotMatch(text, /change\+change/);
  assert.match(text, /change/);
});

test("an empty diff still produces a run — the risk floor, and it says so", () => {
  const r = selectSuites({ suites: SUITES, changed: [], suiteRepos: REPOS, concurrency: CONCURRENCY, rotationCount: 0 });
  const text = formatSelection(r);
  assert.match(text, /1 suite\(s\) selected/);
  assert.equal(r.selected.every((s) => s.reasons.every((x) => x.kind === "risk-floor")), true);
});

test("a runner-native suite is NOT trimmed for cost, and the overrun explains itself", () => {
  // The live defect this closes: 050m declares 245 minutes and ran in 2.77
  // (REG-2026-08-26-1631). Trimming sorts by value per minute with estimatedMinutes as the
  // denominator, so `--target 60` excluded a suite that costs under three minutes as too
  // expensive. Keeping it means the target may now be unreachable — which is reported, not hidden.
  const withRunner: SelectableSuite[] = [
    suite({ id: "050m", lane: "fastpath", runner: undefined, estimatedMinutes: 245, domain: "sales-rep" }),
    suite({ id: "099", lane: "browser", estimatedMinutes: 25, domain: "marketing" }),
    suite({ id: "042", lane: "browser", priority: "P0", estimatedMinutes: 18, domain: "cross-cutting" }),
  ];
  const idx = new Map<string, readonly string[]>([["050m", ["vc-module-order"]], ["099", ["vc-module-order"]]]);
  const r = selectSuites({
    suites: withRunner,
    changed: [{ repo: "vc-module-order", path: "src/X.cs" }],
    suiteRepos: idx,
    concurrency: CONCURRENCY,
    rotationCount: 0,
    targetMinutes: 30,
  });
  assert.ok(r.selected.some((s) => s.id === "050m"), "the cheap-but-mis-estimated suite survives");
  assert.ok(r.excluded.every((e) => e.id !== "050m"));
  assert.equal(r.unreliableEstimateMinutes, 245, "and the report can say where the minutes came from");
  assert.match(formatSelection(r), /estimatedMinutes is measurably wrong/);
});

test("a browser suite is still trimmable — the exemption is narrow", () => {
  const r = selectSuites({
    suites: SUITES,
    changed: [{ repo: "vc-frontend", path: "client-app/shared/utils/x.ts" }],
    suiteRepos: REPOS,
    concurrency: CONCURRENCY,
    rotationCount: 0,
    targetMinutes: 20,
  });
  assert.ok(r.excluded.length > 0, "browser suites are ordinary trim candidates");
  assert.equal(r.unreliableEstimateMinutes, 0, "and none of these estimates is flagged unreliable");
});
