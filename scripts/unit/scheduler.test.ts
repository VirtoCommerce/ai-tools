// Unit tests for ci/lib/scheduler.ts — LPT ordering, continuous refill, slot affinity and
// the budget ledger.
//
// The regression being locked out: `chunkArray(validSuites, MAX_PARALLEL)` +
// `await Promise.all(batch)` is a barrier per fixed batch, so each batch costs its slowest
// suite and a freed slot is never refilled. The makespan assertions below run against the
// REAL manifest, so the gain is measured rather than asserted about.
//
// Run: `npx tsx --test scripts/unit/scheduler.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BudgetLedger,
  orderLpt,
  runLanePool,
  simulateBatchBarrierMakespan,
  simulateMakespan,
  slotAccepts,
  type PoolSlot,
  type SchedulableSuite,
} from "../../ci/lib/scheduler.ts";

interface ManifestSuite {
  id: string;
  estimatedMinutes: number;
  testCount: number;
}

const manifest = JSON.parse(readFileSync("config/test-suites.json", "utf-8")) as {
  suites: ManifestSuite[];
  selections: Record<string, { all?: true; include?: string[]; exclude?: string[] }>;
};

function fullSelection(): ManifestSuite[] {
  const rule = manifest.selections.full;
  const excluded = new Set(rule.exclude ?? []);
  return manifest.suites.filter((s) => !excluded.has(s.id));
}

// ---- ordering ----------------------------------------------------------------------

test("orderLpt sorts longest-first and breaks ties deterministically", () => {
  const ordered = orderLpt([
    { id: "b", estimatedMinutes: 10 },
    { id: "c", estimatedMinutes: 50 },
    { id: "a", estimatedMinutes: 10 },
  ]);
  assert.deepEqual(
    ordered.map((s) => s.id),
    ["c", "a", "b"],
    "50 first, then the 10s in id order — an unstable sort would make makespan tests flaky",
  );
});

test("orderLpt does not mutate its input", () => {
  const input = [
    { id: "a", estimatedMinutes: 1 },
    { id: "b", estimatedMinutes: 9 },
  ];
  orderLpt(input);
  assert.deepEqual(
    input.map((s) => s.id),
    ["a", "b"],
  );
});

// ---- makespan against the real corpus ---------------------------------------------

test("full: continuous refill + LPT beats the fixed-batch barrier by a wide margin", () => {
  const suites = fullSelection();
  const total = suites.reduce((sum, s) => sum + s.estimatedMinutes, 0);
  assert.equal(suites.length, 120, "manifest drift: full's suite count changed");
  assert.equal(total, 2787, "manifest drift: full's total estimate changed");

  const pool = simulateMakespan(orderLpt(suites), 3).makespanMinutes;
  const barrier = simulateBatchBarrierMakespan(suites, 3);

  assert.ok(pool < barrier, `pool ${pool} should beat barrier ${barrier}`);
  assert.ok(
    pool <= barrier * 0.75,
    `expected at least a 25% saving, got pool ${pool} vs barrier ${barrier}`,
  );
  // The plan's headline figure: ~13.5 h against ~23.4 h. Assert with margin so a manifest
  // tweak does not fail the build, but tightly enough to catch a scheduler regression.
  assert.ok(pool <= 960, `expected <= 960 min at P=3, got ${pool}`);
  assert.ok(barrier >= 1300, `expected the barrier to be >= 1300 min, got ${barrier}`);
});

test("full: LPT packing is within a few percent of the theoretical floor", () => {
  const suites = fullSelection();
  const total = suites.reduce((sum, s) => sum + s.estimatedMinutes, 0);
  const floor = total / 3;
  const pool = simulateMakespan(orderLpt(suites), 3).makespanMinutes;
  assert.ok(
    pool <= floor * 1.05,
    `LPT should be within 5% of the floor (${floor.toFixed(0)}), got ${pool}`,
  );
  // Corollary worth stating in a test: there is nothing left for a smarter bin-packer.
});

test("more lanes shorten the makespan monotonically", () => {
  const ordered = orderLpt(fullSelection());
  const at = (n: number) => simulateMakespan(ordered, n).makespanMinutes;
  assert.ok(at(3) > at(4), "P=4 must beat P=3");
  assert.ok(at(4) > at(6), "P=6 must beat P=4");
});

test("simulateMakespan handles empty and single-slot inputs", () => {
  assert.equal(simulateMakespan([], 3).makespanMinutes, 0);
  assert.equal(simulateMakespan([{ estimatedMinutes: 7 }], 1).makespanMinutes, 7);
  // Concurrency 0 must not divide by zero or return Infinity.
  assert.equal(simulateMakespan([{ estimatedMinutes: 7 }], 0).makespanMinutes, 7);
});

// ---- slot affinity ----------------------------------------------------------------

const firefox: PoolSlot = { id: "2", server: "playwright-firefox" };
const chrome: PoolSlot = { id: "1", server: "playwright-chrome" };
const computeSlot: PoolSlot = { id: "fastpath-1" };

test("a click-driven suite is refused by firefox and accepted by chrome", () => {
  const suite: SchedulableSuite = {
    id: "028",
    lane: "browser",
    estimatedMinutes: 10,
    browserDenyList: ["playwright-firefox"],
  };
  assert.equal(slotAccepts(suite, firefox), false, "firefox cannot click on this storefront");
  assert.equal(slotAccepts(suite, chrome), true);
});

test("preferredBrowser restricts a suite to exactly that server", () => {
  const suite: SchedulableSuite = {
    id: "039",
    lane: "browser",
    estimatedMinutes: 10,
    preferredBrowser: "playwright-chrome",
  };
  assert.equal(slotAccepts(suite, chrome), true);
  assert.equal(slotAccepts(suite, firefox), false, "CyberSource iframes need Chromium");
});

test("a serverless slot accepts anything (fastpath/deterministic lanes)", () => {
  const suite: SchedulableSuite = {
    id: "050a",
    lane: "fastpath",
    estimatedMinutes: 10,
    browserDenyList: ["playwright-firefox"],
    preferredBrowser: "playwright-chrome",
  };
  assert.equal(slotAccepts(suite, computeSlot), true);
});

// ---- budget ledger ----------------------------------------------------------------

test("reserved never exceeds the total, however many concurrent reservations", () => {
  const ledger = new BudgetLedger(10);
  assert.equal(ledger.reserve("a", 4), 4);
  assert.equal(ledger.reserve("b", 4), 4);
  assert.equal(ledger.reserve("c", 4), null, "the third must be refused, not over-committed");
  assert.ok(ledger.reserved <= ledger.total);
  assert.equal(ledger.available, 2);
});

test("settling refunds the unspent head-room to the queue", () => {
  const ledger = new BudgetLedger(10);
  ledger.reserve("a", 8);
  assert.equal(ledger.available, 2);
  ledger.settle("a", 1); // spent far less than reserved
  assert.equal(ledger.totalSpent, 1);
  assert.equal(ledger.available, 9, "the 7 unspent must come back");
});

test("a zero or negative request is refused", () => {
  const ledger = new BudgetLedger(10);
  assert.equal(ledger.reserve("a", 0), null);
  assert.equal(ledger.reserve("b", -1), null);
});

test("exhaustedFor reports whether an amount is still fundable", () => {
  const ledger = new BudgetLedger(10);
  ledger.reserve("a", 9);
  assert.ok(!ledger.exhaustedFor(1));
  assert.ok(ledger.exhaustedFor(2));
});

// ---- the pool ---------------------------------------------------------------------

/** A suite whose `run` resolves after `ticks` macrotask turns, recording dispatch order. */
function tick(n: number): Promise<void> {
  let p = Promise.resolve();
  for (let i = 0; i < n; i++) p = p.then(() => undefined);
  return p;
}

test("a freed slot is refilled immediately — no barrier", async () => {
  const order: string[] = [];
  const suites: SchedulableSuite[] = [
    { id: "slow", lane: "browser", estimatedMinutes: 100 },
    { id: "fast1", lane: "browser", estimatedMinutes: 1 },
    { id: "fast2", lane: "browser", estimatedMinutes: 1 },
    { id: "fast3", lane: "browser", estimatedMinutes: 1 },
  ];

  await runLanePool<string>({
    suites,
    slots: [{ id: "1" }, { id: "2" }],
    run: async (suite) => {
      // `slow` takes many turns; the fast ones resolve promptly.
      await tick(suite.id === "slow" ? 40 : 1);
      order.push(suite.id);
      return suite.id;
    },
  });

  assert.equal(order.length, 4);
  // With a 2-slot barrier the two fast suites in batch 2 could not start until `slow`
  // finished, so `slow` would not be last. Continuous refill puts it last.
  assert.equal(order[order.length - 1], "slow", `slow should finish last, got ${order.join(",")}`);
});

test("LPT dispatches the longest suite first", async () => {
  const dispatched: string[] = [];
  await runLanePool<void>({
    suites: [
      { id: "short", lane: "browser", estimatedMinutes: 1 },
      { id: "longest", lane: "browser", estimatedMinutes: 99 },
      { id: "medium", lane: "browser", estimatedMinutes: 50 },
    ],
    slots: [{ id: "1" }],
    onDispatch: (suite) => dispatched.push(suite.id),
    run: async () => {
      await tick(1);
    },
  });
  assert.deepEqual(dispatched, ["longest", "medium", "short"]);
});

test("a suite no slot accepts is DEFERRED with a reason, never forced onto a bad slot", async () => {
  const ran: string[] = [];
  const outcomes = await runLanePool<void>({
    suites: [
      { id: "clicky", lane: "browser", estimatedMinutes: 10, browserDenyList: ["playwright-firefox"] },
    ],
    slots: [firefox],
    run: async (suite) => {
      ran.push(suite.id);
    },
  });
  assert.deepEqual(ran, [], "must not run on a slot that cannot click");
  assert.equal(outcomes.length, 1);
  assert.ok(outcomes[0].deferredReason, "a deferral must carry a reason");
  assert.match(outcomes[0].deferredReason!, /deny-list|preferred/);
});

test("a suite that only ONE slot can take still runs, and others are not starved", async () => {
  const ran: string[] = [];
  await runLanePool<void>({
    suites: [
      { id: "chrome-only", lane: "browser", estimatedMinutes: 99, preferredBrowser: "playwright-chrome" },
      { id: "anywhere", lane: "browser", estimatedMinutes: 10 },
    ],
    slots: [firefox, chrome],
    run: async (suite) => {
      await tick(1);
      ran.push(suite.id);
    },
  });
  assert.deepEqual(ran.sort(), ["anywhere", "chrome-only"], "both must run");
});

test("stopAll defers every remaining suite instead of failing them", async () => {
  let dispatched = 0;
  const outcomes = await runLanePool<void>({
    suites: [
      { id: "a", lane: "browser", estimatedMinutes: 30 },
      { id: "b", lane: "browser", estimatedMinutes: 20 },
      { id: "c", lane: "browser", estimatedMinutes: 10 },
    ],
    slots: [{ id: "1" }],
    canDispatch: () => {
      dispatched += 1;
      return dispatched === 1
        ? { ok: true }
        : { ok: false, stopAll: true, reason: "global budget exhausted" };
    },
    run: async () => {
      await tick(1);
    },
  });

  const deferred = outcomes.filter((o) => o.deferredReason);
  assert.equal(deferred.length, 2, "b and c were never attempted");
  for (const d of deferred) assert.match(d.deferredReason!, /budget exhausted/);
  assert.equal(outcomes.filter((o) => !o.deferredReason).length, 1, "a still ran");
});

test("a per-suite refusal skips that suite only, and the rest keep going", async () => {
  const ran: string[] = [];
  const outcomes = await runLanePool<void>({
    suites: [
      { id: "bad", lane: "browser", estimatedMinutes: 50 },
      { id: "good", lane: "browser", estimatedMinutes: 10 },
    ],
    slots: [{ id: "1" }],
    canDispatch: (suite) => (suite.id === "bad" ? { ok: false, reason: "nope" } : { ok: true }),
    run: async (suite) => {
      ran.push(suite.id);
    },
  });
  assert.deepEqual(ran, ["good"]);
  assert.equal(outcomes.find((o) => o.suite.id === "bad")?.deferredReason, "nope");
});

test("a throwing suite does not wedge the lane", async () => {
  const ran: string[] = [];
  const outcomes = await runLanePool<string>({
    suites: [
      { id: "boom", lane: "browser", estimatedMinutes: 50 },
      { id: "after", lane: "browser", estimatedMinutes: 10 },
    ],
    slots: [{ id: "1" }],
    run: async (suite) => {
      if (suite.id === "boom") throw new Error("kaboom");
      ran.push(suite.id);
      return suite.id;
    },
  });
  assert.deepEqual(ran, ["after"], "the slot must be released and reused");
  assert.equal(outcomes.length, 1, "the throwing suite records no result");
});

test("no slots configured defers everything rather than hanging", async () => {
  const outcomes = await runLanePool<void>({
    suites: [{ id: "a", lane: "browser", estimatedMinutes: 1 }],
    slots: [],
    run: async () => {},
  });
  assert.equal(outcomes.length, 1);
  assert.match(outcomes[0].deferredReason!, /no slot configured/);
});

test("an empty suite list is a no-op", async () => {
  const outcomes = await runLanePool<void>({ suites: [], slots: [{ id: "1" }], run: async () => {} });
  assert.deepEqual(outcomes, []);
});
