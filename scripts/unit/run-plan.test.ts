// Unit tests for ci/lib/run-plan.ts and ci/lib/suite-manifest.ts — the plan the interactive
// orchestrator follows.
//
// This is the load-bearing test for the INTERACTIVE regression path. That path is driven by
// `/qa-regression`, which dispatches sub-agents from inside a Claude Code session — no API key,
// no Docker, no `ci/run-regression.ts`. The agents follow a markdown file, so they cannot import
// the scheduling code; they run `npm run regression:plan` and follow its output. Which means the
// plan IS the contract, and it has to be right without anyone running a suite to find out.
//
// Asserted against the real manifest, not a fixture: the whole point is that the numbers
// describe the actual corpus.
//
// Run: `npx tsx --test scripts/unit/run-plan.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMultiEnvFilters,
  expandSelection,
  loadManifest,
  resolveSelection,
  selectionNames,
  type ManifestSuite,
} from "../../ci/lib/suite-manifest.ts";
import { classifyLane } from "../../ci/lib/lane-classifier.ts";
import { buildRunPlan, formatRunPlan, type PlannableSuite } from "../../ci/lib/run-plan.ts";
import { orderLpt } from "../../ci/lib/scheduler.ts";

const manifest = loadManifest();
const CONCURRENCY = { browser: 3, fastpath: 4, deterministic: 2 };

function plannableFor(selection: string): PlannableSuite[] {
  const { ids } = resolveSelection(manifest, selection);
  return ids
    .map((id) => manifest.suites.find((s) => s.id === id))
    .filter((s): s is ManifestSuite => Boolean(s))
    .map((s) => ({
      id: s.id,
      description: s.name,
      lane: classifyLane(s),
      testCount: s.testCount,
      estimatedMinutes: s.estimatedMinutes,
      preferredBrowser: s.preferredBrowser,
      browserDenyList: s.clickDriven ? ["playwright-firefox"] : [],
    }));
}

// ---- selection resolution ----------------------------------------------------------

test("known selections resolve to a non-empty set", () => {
  for (const name of selectionNames(manifest)) {
    const { ids, unknownIds } = resolveSelection(manifest, name);
    assert.deepEqual(unknownIds, [], `selection "${name}" names an unknown suite`);
    assert.ok(ids.length > 0, `selection "${name}" resolved to zero suites`);
  }
});

test("full resolves to the manifest minus its exclude list", () => {
  const { ids } = resolveSelection(manifest, "full");
  assert.equal(ids.length, 124, "manifest drift: full's suite count changed");
  const excluded = (manifest.selections.full as { exclude?: string[] }).exclude ?? [];
  for (const id of excluded) assert.ok(!ids.includes(id), `${id} is excluded from full but resolved`);
});

test("a comma-separated id list is accepted, and a bad id is REPORTED not silently dropped", () => {
  const good = resolveSelection(manifest, "042,078");
  assert.deepEqual(good.unknownIds, []);
  assert.deepEqual(good.ids.sort(), ["042", "078"]);

  const bad = resolveSelection(manifest, "042,ZZZ");
  assert.deepEqual(bad.unknownIds, ["ZZZ"], "an unknown id must surface, not vanish");
});

test("an absent env filter means 'run everything', never 'exclude everything'", () => {
  // No MODULES_ENABLED / STOREFRONT_PROFILE set in this process.
  const all = manifest.suites.map((s) => s.id);
  const { kept, skipped } = applyMultiEnvFilters(manifest, all);
  assert.equal(kept.length, all.length, `filters dropped ${skipped.length} suites with no env set`);
});

test("expandSelection preserves author order for an include list", () => {
  const ids = expandSelection(manifest, { include: ["078", "042", "049"] });
  assert.deepEqual(ids, ["078", "042", "049"], "include order is meaningful and must not be sorted");
});

// ---- the plan ----------------------------------------------------------------------

test("no suite is lost between selection and plan", () => {
  for (const selection of ["smoke", "critical", "full"]) {
    const plannable = plannableFor(selection);
    const plan = buildRunPlan(plannable, CONCURRENCY);
    assert.equal(plan.totalSuites, plannable.length, `${selection}: suite count changed in the plan`);
    const planned = new Set(plan.suites.map((s) => s.id));
    for (const s of plannable) assert.ok(planned.has(s.id), `${selection}: ${s.id} vanished from the plan`);
    // And every suite is in exactly one lane.
    const laneTotal = plan.lanes.reduce((sum, l) => sum + l.suites.length, 0);
    assert.equal(laneTotal, plannable.length, `${selection}: a suite is in zero or two lanes`);
  }
});

test("full: the plan reports the barrier saving the scheduler exists to deliver", () => {
  const plan = buildRunPlan(plannableFor("full"), CONCURRENCY);
  const browser = plan.lanes.find((l) => l.lane === "browser")!;
  assert.ok(browser.suites.length > 0);
  assert.ok(
    browser.makespanMinutes < plan.browserBarrierMinutes,
    `pool ${browser.makespanMinutes} should beat barrier ${plan.browserBarrierMinutes}`,
  );
  assert.ok(
    browser.makespanMinutes <= plan.browserBarrierMinutes * 0.8,
    `expected >= 20% saved, got ${browser.makespanMinutes} vs ${plan.browserBarrierMinutes}`,
  );
});

test("full: the fastpath lane is non-empty and takes real load off the browser pool", () => {
  const plan = buildRunPlan(plannableFor("full"), CONCURRENCY);
  const fastpath = plan.lanes.find((l) => l.lane === "fastpath")!;
  assert.ok(fastpath.suites.length >= 10, `expected >= 10 runner-native suites, got ${fastpath.suites.length}`);
  assert.ok(fastpath.cases >= 200, `expected >= 200 cases off the browser lane, got ${fastpath.cases}`);
});

test("the plan reports ZERO cap anomalies for every selection", () => {
  // A cap anomaly means a suite could not finish — the defect derived caps replaced. The
  // planner refuses to dispatch on one, so a regression here would block every run, loudly.
  for (const name of selectionNames(manifest)) {
    const plan = buildRunPlan(plannableFor(name), CONCURRENCY);
    assert.deepEqual(
      plan.capAnomalies,
      [],
      `${name}: ${plan.capAnomalies.map((a) => `${a.id} ${a.problem}`).join("; ")}`,
    );
  }
});

test("deterministic suites are budgeted at zero — they spend no tokens", () => {
  const plan = buildRunPlan(plannableFor("full"), CONCURRENCY);
  for (const s of plan.suites.filter((x) => x.lane === "deterministic")) {
    assert.equal(s.indicativeBudgetUsd, 0, `${s.id} is deterministic and must cost no tokens`);
  }
});

test("more browser lanes shorten the plan; the concurrency knob actually does something", () => {
  const suites = plannableFor("full");
  const at = (n: number) =>
    buildRunPlan(suites, { ...CONCURRENCY, browser: n }).lanes.find((l) => l.lane === "browser")!.makespanMinutes;
  assert.ok(at(3) > at(4));
  assert.ok(at(4) > at(6));
});

// ---- dispatch order ----------------------------------------------------------------

test("dispatch order is longest-first, so the tail starts early", () => {
  const plan = buildRunPlan(plannableFor("full"), CONCURRENCY);
  const browser = plan.lanes.find((l) => l.lane === "browser")!;
  const ordered = orderLpt(browser.suites);
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(
      ordered[i - 1].estimatedMinutes >= ordered[i].estimatedMinutes,
      `order broke at ${i}: ${ordered[i - 1].id} then ${ordered[i].id}`,
    );
  }
  // The corpus's longest browser suite must be first — that is the whole point of LPT.
  const longest = browser.suites.reduce((a, b) => (b.estimatedMinutes > a.estimatedMinutes ? b : a));
  assert.equal(ordered[0].id, longest.id);
});

test("every click-driven suite carries the firefox deny-list into the plan", () => {
  const plan = buildRunPlan(plannableFor("full"), CONCURRENCY);
  const clicking = manifest.suites.filter((s) => s.clickDriven).map((s) => s.id);
  let checked = 0;
  for (const s of plan.suites) {
    if (!clicking.includes(s.id)) continue;
    checked++;
    assert.ok(
      s.browserDenyList.includes("playwright-firefox"),
      `${s.id} clicks but the plan would allow it on firefox`,
    );
  }
  assert.ok(checked > 20, `expected many click-driven suites in full, checked ${checked}`);
});

test("039/041 keep their required browser in the plan (cross-origin iframes need Chromium)", () => {
  const plan = buildRunPlan(plannableFor("full"), CONCURRENCY);
  for (const id of ["039", "041"]) {
    const s = plan.suites.find((x) => x.id === id);
    if (!s) continue; // not in `full`
    assert.equal(s.preferredBrowser, "playwright-chrome", `${id} must stay pinned to Chromium`);
  }
});

// ---- rendering ---------------------------------------------------------------------

test("formatRunPlan renders every non-empty lane and the honest comparison", () => {
  const text = formatRunPlan(buildRunPlan(plannableFor("full"), CONCURRENCY));
  assert.match(text, /browser/);
  assert.match(text, /fastpath/);
  assert.match(text, /Predicted wall clock/);
  assert.match(text, /fixed-batch barrier/);
});

test("smoke has no single suite that IS its critical path", () => {
  // This assertion replaces one that asserted the opposite, and the history matters.
  //
  // `smoke` used to be two suites where `078` (115 cases, 83 min) alone was the whole
  // critical path: the pool had nothing to pack, so it could not beat the fixed-batch
  // barrier and the plan correctly printed "0% saved". Reordering was never the lever
  // there — the lever was that one suite.
  //
  // Row-range sharding was the proposed fix and was measured to be unusable: 99 of
  // 078's 115 cases declared a dependency in their Preconditions, 46 of them on a
  // non-bootstrap case, so a row slice would have cut real chains
  // (BSM-005 → 006 → 007, BSM-015 → 042 → 043, …) and turned a slow pass into a fast
  // cascade of BLOCKED. The `[PRE:*]` gate that was supposed to guard it is also
  // unsatisfiable for this suite by design: `test-execution-preflight.md` exempts
  // Admin SPA and API suites, and 078 carries zero `[PRE:*]` tags.
  //
  // 078 was therefore split along its dependency components into four sibling suites
  // (078/078b/078c/078d — the same convention as 092b, 072b/c/d), each self-contained.
  // So what this test now guards is the property that made smoke slow in the first
  // place: no suite may again grow into the entire critical path.
  const plan = buildRunPlan(plannableFor("smoke"), CONCURRENCY);
  const browser = plan.lanes.find((l) => l.lane === "browser")!;
  const longest = Math.max(...browser.suites.map((s) => s.estimatedMinutes));

  assert.ok(
    longest <= 25,
    `a smoke suite grew to ${longest}m — at that size it becomes the critical path again ` +
      `and no amount of scheduling helps; split it along its dependency components`,
  );
  assert.ok(
    browser.makespanMinutes < 50,
    `smoke makespan ${browser.makespanMinutes}m — it was 83m before the 078 split`,
  );
  assert.ok(
    browser.makespanMinutes <= plan.browserBarrierMinutes,
    "the pool must never be slower than the barrier it replaced",
  );
});

test("an empty suite list plans cleanly instead of throwing", () => {
  const plan = buildRunPlan([], CONCURRENCY);
  assert.equal(plan.totalSuites, 0);
  assert.equal(plan.makespanMinutes, 0);
  assert.deepEqual(plan.capAnomalies, []);
  assert.doesNotThrow(() => formatRunPlan(plan));
});
