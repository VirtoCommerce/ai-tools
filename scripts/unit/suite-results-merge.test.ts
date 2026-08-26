// Unit tests for scripts/lib/suite-results-merge.ts.
//
// This module is the one place per-case lane routing can lose data, so its invariants are
// tested directly rather than inferred from a green run. Splitting a suite across two
// writers introduces exactly two new failure modes, and both of them are QUIET:
//
//   - a case reported by nobody   -> the suite looks smaller, greener and faster
//   - a case reported by both     -> one verdict is silently discarded, counts are inflated
//
// Neither shows up as an error anywhere else in the pipeline, which is why one is forced
// into a visible BLOCKED and the other is a hard error that refuses to publish.
//
// Run: `npx tsx --test scripts/unit/suite-results-merge.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSuiteResults, type Fragment, type MergeInput } from "../lib/suite-results-merge.ts";

function frag(lane: Fragment["lane"], cases: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): Fragment {
  return {
    lane,
    source: `suite-050h-results.${lane}.json`,
    envelope: { suiteId: "050h", completedAt: "2026-08-26T10:00:00Z", testCases: cases, ...extra },
  };
}

function input(over: Partial<MergeInput> = {}): MergeInput {
  return {
    suiteId: "050h",
    suiteName: "GraphQL Wishlist",
    planned: [
      { id: "WISH-001", lane: "machine" },
      { id: "WISH-002", lane: "machine" },
      { id: "WISH-008", lane: "browser" },
      { id: "WISH-009", lane: "manual" },
    ],
    fragments: [
      frag("machine", [{ id: "WISH-001", status: "PASS" }, { id: "WISH-002", status: "FAIL" }]),
      frag("browser", [{ id: "WISH-008", status: "PASS" }]),
    ],
    ...over,
  };
}

const byId = (env: Record<string, unknown>, id: string) =>
  (env.testCases as Array<Record<string, unknown>>).find((c) => c.id === id);

// ---- invariant 1: no case may be lost ---------------------------------------------

test("a planned case no fragment reported becomes a visible BLOCKED, not an absence", () => {
  const r = mergeSuiteResults(
    input({ fragments: [frag("machine", [{ id: "WISH-001", status: "PASS" }])] }),
  );
  const lost = byId(r.envelope, "WISH-002")!;
  assert.equal(lost.status, "BLOCKED");
  assert.match(String(lost.notes), /lane_lost/);
  assert.equal(lost.lane, "machine", "the lost row must name the lane that owed it");
  assert.equal((r.envelope.testCases as unknown[]).length, 4, "every planned case is present");
});

test("a whole lane dying does not shrink the suite", () => {
  // The dangerous version of the above: if the merger derived its case set from the
  // fragments, a crashed machine lane would produce a smaller, greener, faster suite.
  const r = mergeSuiteResults(input({ fragments: [frag("browser", [{ id: "WISH-008", status: "PASS" }])] }));
  assert.equal(r.envelope.totalCases, 4);
  assert.equal(r.envelope.blocked, 2, "both machine cases must surface as BLOCKED");
  assert.equal(r.envelope.passed, 1);
});

test("an explicitly Manual case is SKIPPED with its reason, never quietly missing", () => {
  const r = mergeSuiteResults(input());
  const manual = byId(r.envelope, "WISH-009")!;
  assert.equal(manual.status, "SKIPPED");
  assert.equal(manual.lane, "manual");
  assert.match(String(manual.notes), /Automation_Status=Manual/);
});

test("a Deprecated case is SKIPPED with its OWN reason, never lane_lost and never 'Manual'", () => {
  // The merge invariant this guards: `planned` is authoritative, so a newly-excluded case must
  // be materialised here or it reads as `lane_lost` — a lane that died — which is exactly the
  // alarm the deprecation is NOT. And it must not borrow the Manual note: telling a reader a
  // person is expected to run a retired case is the same lie, one step later.
  const r = mergeSuiteResults(
    input({
      planned: [
        { id: "SR-GQL-011", lane: "machine" },
        { id: "SR-GQL-029", lane: "deprecated" },
        { id: "WISH-009", lane: "manual" },
      ],
      fragments: [frag("machine", [{ id: "SR-GQL-011", status: "PASS" }])],
    }),
  );
  assert.deepEqual(r.errors, []);
  const dep = byId(r.envelope, "SR-GQL-029")!;
  assert.equal(dep.status, "SKIPPED");
  assert.equal(dep.lane, "deprecated", "the row must name its own lane, not machine or manual");
  assert.match(String(dep.notes), /Deprecated/);
  assert.match(String(dep.notes), /EX-201/, "the reason code makes the exclusion traceable to the classifier");
  assert.doesNotMatch(String(dep.notes), /lane_lost/);
  assert.doesNotMatch(String(dep.notes), /Manual/);

  // Counted as a skip, and visible in the per-lane counts a determinism trend is read from.
  assert.equal(r.envelope.totalCases, 3);
  assert.equal(r.envelope.skipped, 2, "the Manual and the Deprecated case both count as skips");
  assert.deepEqual(r.envelope.lanes, { machine: 1, deprecated: 1, manual: 1 });
});

test("a fragment that reports a Deprecated case anyway is kept and WARNED about, not dropped", () => {
  // A stale lanes plan, or a browser CSV written before the exclusion landed. A case that
  // actually ran is more trustworthy than a plan; but the disagreement must be visible, because
  // it means an agent spent a slot on a retired row.
  const r = mergeSuiteResults(
    input({
      planned: [{ id: "SR-GQL-029", lane: "deprecated" }],
      fragments: [frag("browser", [{ id: "SR-GQL-029", status: "FAIL" }])],
    }),
  );
  assert.deepEqual(r.errors, []);
  const row = byId(r.envelope, "SR-GQL-029")!;
  assert.equal(row.status, "FAIL", "the real verdict is not overwritten by the plan");
  assert.equal(row.lane, "browser", "the row is stamped with the lane that actually ran it");
});

// ---- invariant 2: no case may be counted twice ------------------------------------

test("a case reported by two lanes is a HARD error and names both sources", () => {
  const r = mergeSuiteResults(
    input({
      fragments: [
        frag("machine", [{ id: "WISH-001", status: "PASS" }]),
        frag("browser", [{ id: "WISH-001", status: "FAIL" }]),
      ],
    }),
  );
  assert.equal(r.errors.length, 1, JSON.stringify(r.errors));
  assert.match(r.errors[0], /WISH-001/);
  assert.match(r.errors[0], /machine\.json/);
  assert.match(r.errors[0], /browser\.json/);
});

test("a repeated id WITHIN one fragment is a retry — the later verdict wins, no error", () => {
  const r = mergeSuiteResults(
    input({
      fragments: [
        frag("machine", [
          { id: "WISH-001", status: "FAIL" },
          { id: "WISH-001", status: "PASS", notes: "passed on retry" },
        ]),
      ],
    }),
  );
  assert.deepEqual(r.errors, []);
  assert.equal(byId(r.envelope, "WISH-001")!.status, "PASS");
});

// ---- invariant 3: every row names its lane ----------------------------------------

test("every row carries a lane — without it no determinism trend can be computed", () => {
  const r = mergeSuiteResults(input());
  for (const c of r.envelope.testCases as Array<Record<string, unknown>>) {
    assert.ok(c.lane, `${c.id} has no lane`);
  }
  assert.deepEqual(r.envelope.lanes, { machine: 2, browser: 1, manual: 1 });
});

test("the fragment's lane overrides a stale lane already in the row", () => {
  const r = mergeSuiteResults(
    input({ fragments: [frag("machine", [{ id: "WISH-001", status: "PASS", lane: "browser" }])] }),
  );
  assert.equal(byId(r.envelope, "WISH-001")!.lane, "machine");
});

// ---- invariant 4: counts are recomputed, never summed -----------------------------

test("counts come from the rows, not from the fragments' own headers", () => {
  // Fragment headers claim nonsense on purpose. Summing them would give 99 passed.
  const r = mergeSuiteResults(
    input({
      fragments: [
        frag("machine", [{ id: "WISH-001", status: "PASS" }, { id: "WISH-002", status: "FAIL" }], { passed: 50, totalCases: 50 }),
        frag("browser", [{ id: "WISH-008", status: "PASS" }], { passed: 49, totalCases: 49 }),
      ],
    }),
  );
  assert.equal(r.envelope.passed, 2);
  assert.equal(r.envelope.failed, 1);
  assert.equal(r.envelope.skipped, 1);
  assert.equal(r.envelope.totalCases, 4);
  assert.equal(r.envelope.passRate, "50.0%");
});

test("an unrecognised status stays untallied so the gap shows the suite is incomplete", () => {
  const r = mergeSuiteResults(
    input({
      planned: [{ id: "WISH-001", lane: "machine" }, { id: "WISH-002", lane: "machine" }],
      fragments: [frag("machine", [{ id: "WISH-001", status: "PASS" }, { id: "WISH-002", status: "PENDING" }])],
    }),
  );
  const counted = (r.envelope.passed as number) + (r.envelope.failed as number) +
    (r.envelope.blocked as number) + (r.envelope.skipped as number);
  assert.equal(counted, 1);
  assert.equal(r.envelope.totalCases, 2, "the PENDING row is present and counted in the total");
  assert.equal(byId(r.envelope, "WISH-002")!.status, "PENDING", "its status must not be rewritten");
});

// ---- invariant 5: idempotence -----------------------------------------------------

test("merging twice yields byte-identical output — the live watcher may call it mid-run", () => {
  const a = JSON.stringify(mergeSuiteResults(input()).envelope);
  const b = JSON.stringify(mergeSuiteResults(input()).envelope);
  assert.equal(a, b);
});

test("an open fragment leaves completedAt empty so the suite does not look finished", () => {
  // A set `completedAt` tells every reader the envelope is authoritative and stops the live
  // dashboard folding in later per-case rows. Half-merged must not read as done.
  const open = frag("browser", [{ id: "WISH-008", status: "PENDING" }]);
  open.envelope.completedAt = "";
  const r = mergeSuiteResults(input({ fragments: [frag("machine", [{ id: "WISH-001", status: "PASS" }]), open] }));
  assert.equal(r.envelope.completedAt, "");
});

test("all fragments closed sets completedAt to the latest of them", () => {
  const r = mergeSuiteResults(
    input({
      fragments: [
        frag("machine", [{ id: "WISH-001", status: "PASS" }], { completedAt: "2026-08-26T09:00:00Z" }),
        frag("browser", [{ id: "WISH-008", status: "PASS" }], { completedAt: "2026-08-26T11:30:00Z" }),
      ],
    }),
  );
  assert.equal(r.envelope.completedAt, "2026-08-26T11:30:00Z");
});

// ---- plan vs reality --------------------------------------------------------------

test("a case that ran but was not planned is KEPT, and the disagreement is recorded", () => {
  const r = mergeSuiteResults(
    input({ fragments: [frag("machine", [{ id: "WISH-001", status: "PASS" }, { id: "WISH-099", status: "FAIL" }])] }),
  );
  assert.ok(byId(r.envelope, "WISH-099"), "a case that actually ran must never be dropped");
  assert.deepEqual(r.errors, [], "an unplanned case is a disagreement, not a data-loss risk");
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /WISH-099/);
  assert.ok((r.envelope.errors as string[]).some((e) => /WISH-099/.test(e)), "it must reach the report too");
});

test("bugs and errors from every fragment are carried through", () => {
  const r = mergeSuiteResults(
    input({
      fragments: [
        frag("machine", [{ id: "WISH-001", status: "FAIL" }], { bugs: [{ id: "BUG_1" }], errors: ["schema drift"] }),
        frag("browser", [{ id: "WISH-008", status: "FAIL" }], { bugs: [{ id: "BUG_2" }] }),
      ],
    }),
  );
  assert.equal((r.envelope.bugs as unknown[]).length, 2);
  assert.ok((r.envelope.errors as string[]).includes("schema drift"));
});

// ---- degenerate inputs ------------------------------------------------------------

test("no fragments at all: every planned case is BLOCKED, nothing throws", () => {
  const r = mergeSuiteResults(input({ fragments: [] }));
  assert.equal(r.envelope.totalCases, 4);
  assert.equal(r.envelope.blocked, 3);
  assert.equal(r.envelope.skipped, 1, "the Manual case is still SKIPPED, not BLOCKED");
  assert.deepEqual(r.errors, []);
});

test("a fragment with no testCases array is tolerated", () => {
  const broken: Fragment = { lane: "machine", source: "x.json", envelope: { suiteId: "050h" } };
  assert.doesNotThrow(() => mergeSuiteResults(input({ fragments: [broken] })));
});

test("an empty plan with no fragments produces an empty, well-formed envelope", () => {
  const r = mergeSuiteResults({ suiteId: "050h", planned: [], fragments: [] });
  assert.equal(r.envelope.totalCases, 0);
  assert.equal(r.envelope.passRate, "0.0%");
  assert.deepEqual(r.envelope.testCases, []);
});
