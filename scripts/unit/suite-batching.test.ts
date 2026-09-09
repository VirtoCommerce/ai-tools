// Unit tests for ci/lib/suite-batching.ts — bounded batching of suites into agent sessions.
//
// The property that matters is the BOUND. The 2026-09-07 audit's §6 item 9 proposed one agent per
// lane, which on `full` is ~1,230 cases in one session; the corpus measures artefactual-BLOCKED at
// 19.9% overall and 28.6% on suites of 81+ cases, so an unbounded session buys tokens by degrading
// the verdict. Every test below exists to keep the bound honest, or to keep a batch dispatchable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { batchSuites, DEFAULT_MAX_BATCH_CASES, type BatchableSuite } from "../../ci/lib/suite-batching.ts";

const s = (id: string, testCount: number, extra: Partial<BatchableSuite> = {}): BatchableSuite => ({
  id,
  testCount,
  estimatedMinutes: testCount,
  ...extra,
});

test("the case budget is never exceeded by a group", () => {
  const batches = batchSuites([s("a", 20), s("b", 20), s("c", 20), s("d", 20)], { maxCases: 60 });
  assert.ok(batches.every((b) => b.suites.length === 1 || b.testCount <= 60), "a grouped batch must fit the budget");
  assert.deepEqual(batches.map((b) => b.testCount).sort((x, y) => y - x), [60, 20]);
});

test("a suite bigger than the budget goes alone and is never split", () => {
  const batches = batchSuites([s("huge", 116), s("x", 10), s("y", 10)], { maxCases: 60 });
  const huge = batches.find((b) => b.suites.some((q) => q.id === "huge"))!;
  assert.equal(huge.suites.length, 1, "an oversized suite must not drag others past the budget");
  assert.equal(huge.testCount, 116, "and must keep all its cases — splitting is suites:lanes' job");
});

test("no batch is longer than the longest suite that already existed", () => {
  // The honest statement of what the bound buys: batching adds no new long session. It does not
  // shorten the worst one either — that needs suite splitting.
  const suites = [s("huge", 116), s("a", 30), s("b", 25), s("c", 20), s("d", 5)];
  const batches = batchSuites(suites, { maxCases: 60 });
  const longestSuite = Math.max(...suites.map((q) => q.testCount ?? 0));
  assert.ok(Math.max(...batches.map((b) => b.testCount)) <= longestSuite);
});

test("suites are grouped only when ONE slot can accept all of them", () => {
  // 039/041 are Payment — CyberSource, both preferredBrowser: playwright-chrome. Mixing a
  // chrome-only suite into a batch with an unconstrained one would strand the batch on a slot that
  // cannot take it — the same class of bug that deferred those two suites entirely.
  const batches = batchSuites(
    [s("039", 10, { preferredBrowser: "playwright-chrome" }), s("041", 10, { preferredBrowser: "playwright-chrome" }), s("free", 10)],
    { maxCases: 60 },
  );
  const withPref = batches.find((b) => b.preferredBrowser === "playwright-chrome")!;
  assert.deepEqual(withPref.suites.map((q) => q.id).sort(), ["039", "041"]);
  assert.ok(batches.every((b) => new Set(b.suites.map((q) => q.preferredBrowser ?? "")).size === 1));
});

test("a deny-list is part of the affinity signature too", () => {
  const batches = batchSuites(
    [s("d1", 10, { browserDenyList: ["playwright-firefox"] }), s("d2", 10, { browserDenyList: ["playwright-firefox"] }), s("open", 10)],
    { maxCases: 60 },
  );
  const denied = batches.find((b) => b.browserDenyList?.includes("playwright-firefox"))!;
  assert.deepEqual(denied.suites.map((q) => q.id).sort(), ["d1", "d2"]);
  assert.ok(!denied.suites.some((q) => q.id === "open"), "an unconstrained suite must not inherit a deny-list");
});

test("batches carry summed cases and minutes so LPT and the caps formulas work unchanged", () => {
  const [batch] = batchSuites([s("a", 10, { estimatedMinutes: 12 }), s("b", 15, { estimatedMinutes: 8 })], { maxCases: 60 });
  assert.equal(batch.testCount, 25);
  assert.equal(batch.estimatedMinutes, 20);
  assert.equal(batch.id, "a+b", "the id names its members so a dispatch log stays readable");
});

test("output is longest-first, and deterministic", () => {
  const input = [s("small", 5), s("big", 50), s("mid", 30)];
  const a = batchSuites(input, { maxCases: 60 }).map((b) => b.id);
  const b = batchSuites(input, { maxCases: 60 }).map((x) => x.id);
  assert.deepEqual(a, b, "same input, same batches");
  assert.deepEqual(a[0], "big", "LPT: the longest unit is dispatched first");
});

test("every input suite appears exactly once", () => {
  const input = [s("a", 30), s("b", 30), s("c", 30), s("d", 1), s("e", 1)];
  const out = batchSuites(input, { maxCases: 60 }).flatMap((b) => b.suites.map((q) => q.id)).sort();
  assert.deepEqual(out, ["a", "b", "c", "d", "e"], "batching must not drop or duplicate a suite");
});

test("an empty input yields no batches, and the default budget is the measured one", () => {
  assert.deepEqual(batchSuites([]), []);
  assert.equal(DEFAULT_MAX_BATCH_CASES, 60, "60 was chosen on measurement — changing it needs a new one");
});
