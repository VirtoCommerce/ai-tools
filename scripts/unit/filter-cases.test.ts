// Unit tests for the change-scoped case filter (`scripts/regression/filter-cases.ts`).
//
// The filter narrows a resolved suite CSV to the cases a 40-minute run should execute. Two
// properties matter, and they fail in opposite directions.
//
// THE WRITE must not corrupt a suite. The output is handed straight to `suites:lanes` and then to a
// runner agent, so a field mangled here becomes a wrong step or a wrong assertion downstream, with
// nothing in between to notice. The round-trip test asserts FIELD-level equality across all 15
// columns, not merely that the result still parses — a test that only re-parsed would pass on an
// output that quietly re-quoted or truncated every long `Steps` cell.
//
// THE DROP must never be silent. A case that leaves the run because its `Priority` could not be read
// is a coverage hole with no error anywhere; 11 of 128 suites contribute zero Critical cases, and a
// suite that vanishes without a line is indistinguishable from one that passed. So every exclusion
// path has a test asserting it is REPORTED, not merely that it happened.
//
// Run: `npx tsx --test scripts/unit/filter-cases.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";

import { filterRows, headerLine, parseArgs, renderFiltered } from "../regression/filter-cases.js";
import { isUsableObservation } from "../lib/estimate-calibration.js";
import { mergeSuiteResults } from "../lib/suite-results-merge.js";
import { COLUMNS, parseSuite, type Row } from "../test-cases/append-test-cases-to-suite.js";

/** A row with every canonical column present, so `serialiseRows` round-trips it faithfully. */
function row(over: Partial<Row>): Row {
  const base = Object.fromEntries(COLUMNS.map((c) => [c, ""])) as Row;
  return { ...base, ...over };
}

const HEADER = COLUMNS.map((c) => `"${c}"`).join(",");

test("keeps only the requested tier", () => {
  const rows = [
    row({ ID: "A-1", Priority: "Critical" }),
    row({ ID: "A-2", Priority: "High" }),
    row({ ID: "A-3", Priority: "Critical" }),
    row({ ID: "A-4", Priority: "Low" }),
  ];
  const r = filterRows(rows, { tiers: ["Critical"] });
  assert.deepEqual(r.keptIds, ["A-1", "A-3"]);
  assert.equal(r.droppedCount, 2);
  assert.equal(r.untypeable.length, 0);
});

test("P0 is Critical and P1 is High — the appender's own alias table, not a new opinion", () => {
  const rows = [row({ ID: "A-1", Priority: "P0" }), row({ ID: "A-2", Priority: "P1" })];
  assert.deepEqual(filterRows(rows, { tiers: ["Critical"] }).keptIds, ["A-1"]);
  assert.deepEqual(filterRows(rows, { tiers: ["High"] }).keptIds, ["A-2"]);
});

test("tier match is case- and whitespace-insensitive", () => {
  const rows = [row({ ID: "A-1", Priority: "  critical " }), row({ ID: "A-2", Priority: "CRITICAL" })];
  assert.deepEqual(filterRows(rows, { tiers: ["Critical"] }).keptIds, ["A-1", "A-2"]);
});

test("--also-ids survives a non-Critical priority — this is how the run's new Draft cases stay in", () => {
  const rows = [
    row({ ID: "A-1", Priority: "Critical" }),
    row({ ID: "NEW-9", Priority: "Medium", Automation_Status: "Draft" }),
    row({ ID: "A-2", Priority: "Medium" }),
  ];
  const r = filterRows(rows, { tiers: ["Critical"], alsoIds: ["NEW-9"] });
  assert.deepEqual(r.keptIds, ["A-1", "NEW-9"]);
  assert.deepEqual(r.missingAlsoIds, []);
});

test("an --also-id that matches no row is reported, not silently ignored", () => {
  const r = filterRows([row({ ID: "A-1", Priority: "Critical" })], {
    tiers: ["Critical"],
    alsoIds: ["GHOST-1"],
  });
  assert.deepEqual(r.missingAlsoIds, ["GHOST-1"]);
});

test("an unreadable Priority does not run, and is named", () => {
  const rows = [
    row({ ID: "A-1", Priority: "Critical" }),
    row({ ID: "A-2", Priority: "Coverage Gap Analysis" }),
    row({ ID: "A-3", Priority: "" }),
  ];
  const r = filterRows(rows, { tiers: ["Critical"] });
  assert.deepEqual(r.keptIds, ["A-1"]);
  assert.deepEqual(
    r.untypeable.map((u) => u.id),
    ["A-2", "A-3"],
  );
  // The whole point: it left the run AND it is attributable.
  assert.equal(r.untypeable[0].priority, "Coverage Gap Analysis");
});

test("an --also-id outranks an unreadable Priority", () => {
  const rows = [row({ ID: "A-1", Priority: "???" })];
  const r = filterRows(rows, { tiers: ["Critical"], alsoIds: ["A-1"] });
  assert.deepEqual(r.keptIds, ["A-1"]);
  assert.equal(r.untypeable.length, 0);
});

test("a blank-ID continuation line is not counted as a case", () => {
  const rows = [row({ ID: "A-1", Priority: "Critical" }), row({ ID: "   ", Priority: "Critical" })];
  const r = filterRows(rows, { tiers: ["Critical"] });
  assert.deepEqual(r.keptIds, ["A-1"]);
  assert.equal(r.droppedCount, 0);
});

test("zero matches is a normal outcome, not an error state", () => {
  const r = filterRows([row({ ID: "A-1", Priority: "Medium" })], { tiers: ["Critical"] });
  assert.deepEqual(r.keptIds, []);
  assert.equal(r.droppedCount, 1);
});

test("every field survives the round-trip, including commas, quotes and newlines", () => {
  const nasty = row({
    ID: "A-1",
    Priority: "Critical",
    Title: 'Search for "red", then filter',
    Steps: "1. Open /search\n2. Type {{TERM}}\n3. Press Enter",
    Test_Data: '@td(PROD_A.sku), currency="USD"',
    References: "Archetype:SCOPE · Technique:BVA",
  });
  const src = `${HEADER}\n"x"\n`; // header style only; rows come from `kept`
  const out = renderFiltered(src, [nasty]);
  const parsed = parseSuite(out).rows.filter((r) => r.ID?.trim());
  assert.equal(parsed.length, 1);
  for (const c of COLUMNS) assert.equal(parsed[0][c], nasty[c], `column ${c} drifted`);
});

test("the header line is copied verbatim — quoting style and BOM are not renormalised", () => {
  const bomUnquoted = `﻿${COLUMNS.join(",")}\n`;
  assert.equal(headerLine(bomUnquoted), `﻿${COLUMNS.join(",")}`);
  const out = renderFiltered(bomUnquoted, [row({ ID: "A-1", Priority: "Critical" })]);
  assert.ok(out.startsWith(`﻿${COLUMNS.join(",")}`), "header was rewritten");
});

test("CRLF sources stay CRLF, LF sources stay LF", () => {
  const kept = [row({ ID: "A-1", Priority: "Critical" })];
  const crlf = renderFiltered(`${HEADER}\r\n"x"\r\n`, kept);
  assert.ok(crlf.includes("\r\n"), "CRLF source lost its line endings");
  const lf = renderFiltered(`${HEADER}\n"x"\n`, kept);
  assert.ok(!lf.includes("\r"), "LF source gained a CR");
});

test("an empty result still emits a usable header-only file", () => {
  const out = renderFiltered(`${HEADER}\n"x"\n`, []);
  assert.equal(out, `${HEADER}\n`);
  assert.deepEqual(parseSuite(out).rows, []);
});

// ---------------------------------------------------------------------------
// Argument surface. Exported `parseArgs` rather than a spawned CLI: the house spawn helper
// hardcodes `../../node_modules/tsx/dist/cli.mjs`, which does not exist in a git worktree, and
// four sibling test files fail for exactly that reason. `select-suites.ts` sets the precedent.
// ---------------------------------------------------------------------------

function args(...argv: string[]) {
  return parseArgs(argv);
}

test("a value-taking flag never swallows the next flag as its value", () => {
  // `--out --json` used to create a file literally named "--json" AND leave json unset.
  const r = args("s.csv", "--priority", "Critical", "--out", "--json");
  assert.ok("error" in r, "--out consumed the following flag");
  assert.match((r as { error: string }).error, /--out requires a value/);
});

test("a trailing value-taking flag is an error, not a silent no-op", () => {
  // This is the dangerous one: it used to exit 0 having written nothing, so the documented
  // in-place call site left the run reading an UNFILTERED csv while reporting a scoped run.
  for (const flag of ["--out", "--priority", "--also-ids", "--scope-out"]) {
    const r = args("s.csv", "--priority", "Critical", flag);
    assert.ok("error" in r, `${flag} with no value was accepted`);
  }
});

test("multi-tier is accepted and split — the docstring advertises it", () => {
  const r = args("s.csv", "--priority", "Critical,High");
  assert.ok(!("error" in r));
  assert.deepEqual((r as { tiers: string[] }).tiers, ["Critical", "High"]);
});

test("every declared tier is a legal --priority value", () => {
  for (const t of ["Critical", "High", "Medium", "Low", "critical", "LOW"]) {
    assert.ok(!("error" in args("s.csv", "--priority", t)), `${t} rejected`);
  }
});

test("usage errors are named, not guessed at", () => {
  assert.match((args("--priority", "Critical") as { error: string }).error, /first argument/);
  assert.match((args("s.csv") as { error: string }).error, /--priority/);
  assert.match((args("s.csv", "--priority", "Urgent") as { error: string }).error, /Urgent/);
  assert.match((args("s.csv", "--priority", "Critical", "--wat") as { error: string }).error, /unknown argument/);
  assert.match((args("a.csv", "b.csv", "--priority", "Critical") as { error: string }).error, /extra argument/);
});

test("--scope-out is parsed and defaults to null", () => {
  assert.equal((args("s.csv", "--priority", "Critical") as { scopeOut: string | null }).scopeOut, null);
  assert.equal(
    (args("s.csv", "--priority", "Critical", "--scope-out", "f.json") as { scopeOut: string | null }).scopeOut,
    "f.json",
  );
});

// ---------------------------------------------------------------------------
// Scope provenance. This is the chain that stopped a 6-of-44 run from calibrating a 44-case suite.
// ---------------------------------------------------------------------------

const frag = (ids: string[]) => [
  {
    lane: "browser" as const,
    source: "suite-004-results.browser.json",
    envelope: { testCases: ids.map((id) => ({ id, status: "PASS" })) },
  },
];

test("an unscoped merge is unchanged — no scope keys appear at all", () => {
  const { envelope } = mergeSuiteResults({
    suiteId: "004",
    planned: [{ id: "A-1", lane: "browser" }],
    fragments: frag(["A-1"]),
  });
  assert.equal(envelope.totalCases, 1);
  assert.equal("scoped" in envelope, false);
  assert.equal("unfilteredTotal" in envelope, false);
});

test("a scoped merge records the UNFILTERED size while totalCases stays the slice", () => {
  const { envelope } = mergeSuiteResults({
    suiteId: "004",
    planned: [{ id: "A-1", lane: "browser" }],
    fragments: frag(["A-1"]),
    caseFilter: { tiers: ["Critical"], keptCases: 1, sourceCases: 44 },
  });
  // The pass rate must be over what the run intended to execute...
  assert.equal(envelope.totalCases, 1);
  // ...but the real denominator has to survive, or nothing downstream can tell this was a slice.
  assert.equal(envelope.scoped, true);
  assert.equal(envelope.unfilteredTotal, 44);
});

test("calibration REJECTS a scoped observation even though its coverage computes to 100%", () => {
  // The whole defect in one assertion: on a scoped run casesReported and totalCases are both the
  // filtered count, so the 95% truncation guard sees 6/6 and waves it through.
  const scoped = { suiteId: "004", runId: "REG-1", durationMinutes: 4, casesReported: 6, totalCases: 6, scoped: true };
  const verdict = isUsableObservation(scoped);
  assert.equal(verdict.usable, false, "a --cases slice was allowed to calibrate the whole suite");
  assert.match(verdict.reason ?? "", /scoped run/);

  // Same numbers without the flag are a legitimate full observation — proving the flag is what
  // does the work, not the counts.
  assert.equal(isUsableObservation({ ...scoped, scoped: false }).usable, true);
});

test("the pre-existing truncation guard still fires on its own terms", () => {
  const truncated = { suiteId: "078", runId: "REG-2", durationMinutes: 9, casesReported: 8, totalCases: 38 };
  const v = isUsableObservation(truncated);
  assert.equal(v.usable, false);
  assert.match(v.reason ?? "", /truncated run/);
});
