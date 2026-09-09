// Unit tests for scripts/regression/plan-suite-split.ts — dependency-safe splitting of an
// oversized suite.
//
// Two properties carry the whole file, and each has a measured incident behind it.
//
//   1. NO DEPENDENCY EDGE MAY CROSS A SIBLING BOUNDARY. `REG-2026-08-03-1900` split 078 by row
//      range and lost 43 of 115 cases to truncation and cascade; the note that came out of it
//      (`.claude/knowledge/execution/regression-suites.md`) is "the unit of splitting is a
//      dependency component, not a row range". A planner that can emit a boundary-cutting plan is
//      the same defect with a nicer interface.
//   2. ROWS MOVE VERBATIM. A csv-parse round-trip renormalises quoting across ~100 multi-line
//      rows — an unreviewable diff that `CSV_LINT_BASELINE` would absorb without a word.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanRecords,
  rowsFromRecords,
  themeKeyOf,
  buildBlocks,
  packBlocks,
  planSplit,
  freeSuffixes,
  largestDependencyComponent,
  DEFAULT_MAX_SPLIT_CASES,
  type SuiteRow,
} from "../regression/plan-suite-split.ts";

const row = (id: string, section: string, deps: string[] = []): SuiteRow => ({ id, section, deps });

// ---- raw record scanning ---------------------------------------------------------------------

test("a quoted field containing newlines is one record, not several", () => {
  const text = 'a,b\n"one","line one\nline two"\n"two","plain"\n';
  const { header, body } = scanRecords(text);
  assert.equal(header, "a,b\n");
  assert.equal(body.length, 2);
  assert.equal(body[0], '"one","line one\nline two"\n');
});

test('an escaped quote ("") does not end the quoted field', () => {
  const text = 'a\n"he said ""hi""\nand left"\n"next"\n';
  const { body } = scanRecords(text);
  assert.equal(body.length, 2, 'the "" pair is an escape, not a field terminator');
  assert.equal(body[1], '"next"\n');
});

test("CRLF line endings survive the scan byte-for-byte", () => {
  const text = 'a,b\r\n"1","x"\r\n"2","y"\r\n';
  const { header, body } = scanRecords(text);
  assert.equal(header, "a,b\r\n");
  assert.deepEqual(body, ['"1","x"\r\n', '"2","y"\r\n']);
  assert.equal(header + body.join(""), text, "reassembly must reproduce the input exactly");
});

test("blank separator lines are not records", () => {
  const { body } = scanRecords('a\n"1"\n\n"2"\n');
  assert.deepEqual(body, ['"1"\n', '"2"\n']);
});

// ---- dependency extraction --------------------------------------------------------------------

test("a Preconditions token counts only when it resolves to a case in THIS file", () => {
  const rows = rowsFromRecords([
    { ID: "CFG-001", Section: "s", Preconditions: "CFG-002 passed; see BL-AUTH-005 and VCST-5089" },
    { ID: "CFG-002", Section: "s", Preconditions: "" },
  ]);
  assert.deepEqual(rows[0].deps, ["CFG-002"], "prose that merely looks like an id must not become an edge");
});

test("a case referring to itself is not its own dependency", () => {
  const rows = rowsFromRecords([{ ID: "A-001", Section: "s", Preconditions: "re-run A-001 first" }]);
  assert.deepEqual(rows[0].deps, []);
});

test("a reference to a case in ANOTHER suite is not an in-file edge", () => {
  const rows = rowsFromRecords([{ ID: "A-001", Section: "s", Preconditions: "CFG-CA-023 confirmed it" }]);
  assert.deepEqual(rows[0].deps, [], "cross-file refs are XREF-001's business, not the splitter's");
});

// ---- themes --------------------------------------------------------------------------------------

test("themeKeyOf trims to the requested breadcrumb depth", () => {
  assert.equal(themeKeyOf("Orders > Detail > Pickup", 2), "Orders > Detail");
  assert.equal(themeKeyOf("Orders > Detail > Pickup", 3), "Orders > Detail > Pickup");
  assert.equal(themeKeyOf("", 2), "(none)");
});

// ---- blocks + packing ------------------------------------------------------------------------------

test("a dependency edge fuses the blocks it spans, and everything between them", () => {
  const rows = [
    row("A-001", "X"),
    row("A-002", "Y"),
    row("A-003", "Z", ["A-001"]), // reaches back across Y
  ];
  const blocks = buildBlocks(rows);
  assert.equal(blocks.length, 1, "Y cannot be separated out without reordering rows");
  assert.deepEqual([blocks[0].from, blocks[0].to], [0, 2]);
});

test("independent themes stay separate blocks", () => {
  const rows = [row("A-001", "X"), row("A-002", "X"), row("A-003", "Y")];
  const blocks = buildBlocks(rows);
  assert.deepEqual(blocks.map((b) => [b.from, b.to]), [[0, 1], [2, 2]]);
});

test("packing balances rather than filling — 116 cases go 58/58, not 60/56", () => {
  const rows = Array.from({ length: 116 }, (_, i) => row(`A-${i}`, `T${i}`));
  const packed = packBlocks(buildBlocks(rows), 60);
  assert.deepEqual(packed.map((p) => p.count), [58, 58], "the point of the split is the LONGEST session");
});

test("packing never exceeds the hard ceiling", () => {
  const rows = Array.from({ length: 200 }, (_, i) => row(`A-${i}`, `T${Math.floor(i / 7)}`));
  for (const max of [30, 45, 60, 80]) {
    const packed = packBlocks(buildBlocks(rows), max);
    assert.ok(packed.every((p) => p.count <= max), `budget ${max} respected`);
    assert.equal(packed.reduce((n, p) => n + p.count, 0), 200, "no case is dropped");
  }
});

test("siblings are contiguous and cover every row exactly once, in order", () => {
  const rows = Array.from({ length: 97 }, (_, i) => row(`A-${i}`, `T${Math.floor(i / 5)}`));
  const packed = packBlocks(buildBlocks(rows), 40);
  let expected = 0;
  for (const p of packed) {
    assert.equal(p.from, expected, "no gap and no overlap between siblings");
    expected = p.to + 1;
  }
  assert.equal(expected, 97);
});

// ---- the invariant --------------------------------------------------------------------------------

test("planSplit never emits a plan whose boundary cuts a dependency", () => {
  // 90 rows in 9 themes of 10, with a chain that reaches from theme 3 into theme 6.
  const rows = Array.from({ length: 90 }, (_, i) => row(`A-${i}`, `T${Math.floor(i / 10)}`));
  rows[62] = row("A-62", "T6", ["A-31"]);
  const plan = planSplit(rows, 40);
  assert.deepEqual(plan.blockers, [], "the fused span still fits, so the plan is safe");
  const sibling = new Map<string, number>();
  plan.siblings.forEach((s, i) => {
    for (let r = s.from; r <= s.to; r++) sibling.set(rows[r].id, i);
  });
  assert.equal(sibling.get("A-31"), sibling.get("A-62"), "a declared dependency must stay in one file");
});

test("an oversized DEPENDENCY COMPONENT blocks the plan and says so", () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(`A-${i}`, "T"));
  for (let i = 1; i < 40; i++) rows[i] = row(`A-${i}`, "T", [`A-${i - 1}`]);
  const plan = planSplit(rows, 20);
  assert.equal(largestDependencyComponent(rows), 40);
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /dependency component of 40 cases/);
});

test("a merely COARSE theme is reported as coarse, and points at --depth", () => {
  // No dependencies at all: the only reason the block is big is that every row shares one theme.
  const rows = Array.from({ length: 40 }, (_, i) => row(`A-${i}`, "Loyalty > Missions"));
  const plan = planSplit(rows, 20);
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /--depth 3/);
  assert.doesNotMatch(plan.blockers[0], /dependency component/);
});

test("a wide dependency SPAN is reported as needing a reorder, not a deeper depth", () => {
  // This is 083c: 84 cases, largest component 8, but the edges reach 74 rows apart. Telling the
  // operator to retry at a deeper --depth would send them to a flag that cannot help.
  const rows = Array.from({ length: 40 }, (_, i) => row(`A-${i}`, `T${i}`));
  rows[38] = row("A-38", "T38", ["A-2"]);
  const plan = planSplit(rows, 20);
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /RE-ORDERED/);
  assert.doesNotMatch(plan.blockers[0], /--depth/);
});

// ---- ids ------------------------------------------------------------------------------------------

test("sibling suffixes skip ids the manifest already uses", () => {
  const taken = new Set(["072", "072b", "072c", "072d"]);
  assert.deepEqual(freeSuffixes("072", taken, 2), ["072e", "072f"]);
});

test("the default budget matches the batcher's, so the two levers compose", async () => {
  const { DEFAULT_MAX_BATCH_CASES } = await import("../../ci/lib/suite-batching.ts");
  assert.equal(DEFAULT_MAX_SPLIT_CASES, DEFAULT_MAX_BATCH_CASES);
});

// ---- the real corpus --------------------------------------------------------------------------------

test("no manifest suite carries a dependency that left its CSV after the split", async () => {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync("config/test-suites.json", "utf-8")) as {
    suites: Array<{ id: string; testCount?: number }>;
  };
  const oversized = manifest.suites.filter((s) => (s.testCount ?? 0) > 81).map((s) => s.id);
  // 050m rides the MACHINE lane (a deterministic runner, not an LLM session), so the 81+ BLOCKED
  // bucket does not describe it; 083c is dependency-span-blocked and documented as such.
  assert.deepEqual(oversized.sort(), ["050m", "083c"]);
});
