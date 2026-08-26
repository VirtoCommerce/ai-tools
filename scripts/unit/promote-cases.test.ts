// Unit tests for the deterministic Draft → Automated promoter
// (`scripts/test-cases/promote-cases.ts`).
//
// Two things are being defended here, and they fail in opposite directions.
//
// THE WRITE must not corrupt a suite. The promoter edits CSVs that the repo's own appender
// documents as partly un-rewritable (inner-quote irregularities, mixed EOLs), so the tests
// assert BYTE preservation of every untouched row — not merely that the file still parses.
// A test that only re-parsed would pass on a rewrite that renormalised every quote in the
// file, which is precisely the diff nobody can review.
//
// THE DECISION must stay fail-closed. Every hold rule gets a fixture that would promote if
// the rule were removed, because a gate whose only test is "the happy path promotes" passes
// just as happily when the gate does nothing — the same reasoning the Automation_Status
// ratchet tests are written from.
//
// Run: `npx tsx --test scripts/unit/promote-cases.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXECUTING_LANES,
  PROMOTION_SOURCE,
  PROMOTION_TARGET,
  applyCellEdits,
  fieldSpans,
  flakinessFrom,
  groundingReasons,
  planSuite,
  quoteField,
  replaceFields,
  runOrderKey,
  spansAgreeWith,
  stampReferences,
  type CellEdit,
  type RunCase,
  type SuitePlanInput,
} from "../test-cases/promote-cases.ts";
import { COLUMNS, type Row } from "../test-cases/append-test-cases-to-suite.ts";
import { AUTOMATION_STATUSES } from "../test-cases/lint-test-cases.ts";
import type { TriageStore } from "../lib/regression-triage.ts";

// ---- fixtures ---------------------------------------------------------------------

/** A row that lints clean at `Automated` — the baseline every hold test perturbs. */
function cleanRow(id: string, status = PROMOTION_SOURCE, over: Partial<Row> = {}): Row {
  const row: Row = {
    ID: id,
    Title: `Case ${id}`,
    Section: "Promotion",
    Priority: "Medium",
    Business_Rule: "",
    Edge_Case_Refs: "",
    Preconditions: "",
    Test_Data: "",
    Steps: '[NAV] Open the "Catalog" page',
    Assertions: "the page renders {DOC}",
    Cross_Layer_Checks: "",
    Failure_Signals: "",
    Cleanup: "",
    References: "",
    Automation_Status: status,
  } as Row;
  return { ...row, ...over };
}

function csvOf(rows: Row[], eol = "\n"): string {
  const line = (cells: string[]) =>
    cells.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
  return (
    [line([...COLUMNS]), ...rows.map((r) => line(COLUMNS.map((c) => r[c] ?? "")))].join(eol) + eol
  );
}

function planInput(over: Partial<SuitePlanInput> & { rawText: string }): SuitePlanInput {
  return {
    suiteId: "999",
    file: "regression/suites/Fixture/999-fixture.csv",
    runCases: new Map<string, RunCase>(),
    ambiguousIds: new Set<string>(),
    isFlaky: () => false,
    greenRuns: () => 1,
    minGreenRuns: 1,
    csvNewerThanRun: false,
    strictMtime: false,
    ...over,
  };
}

const pass = (lane = "machine"): RunCase => ({ status: "PASS", lane });

// ---- the target vocabulary is the DECLARED one ------------------------------------

test("promotion source and target are both canonical Automation_Status values", () => {
  // A promoter that wrote a value the linter rejects would fail suites:lint on its own output.
  assert.ok(AUTOMATION_STATUSES.has(PROMOTION_SOURCE));
  assert.ok(AUTOMATION_STATUSES.has(PROMOTION_TARGET));
});

test("only the two executing lanes can earn Automated", () => {
  assert.deepEqual([...EXECUTING_LANES].sort(), ["browser", "machine"]);
});

// ---- field surgery ----------------------------------------------------------------

test("fieldSpans locates plain, quoted, comma-bearing and newline-bearing fields", () => {
  const body = 'A-001,"has, comma",plain,"multi\nline","say ""hi"""';
  const fields = ["A-001", "has, comma", "plain", "multi\nline", 'say "hi"'];
  assert.ok(spansAgreeWith(body, fields));
  assert.equal(fieldSpans(body).length, 5);
});

test("fieldSpans keeps the trailing empty field a record ending in a comma has", () => {
  assert.ok(spansAgreeWith("A-001,x,", ["A-001", "x", ""]));
});

test("spansAgreeWith rejects a field list that does not describe the text", () => {
  // The scanner is a SECOND reading of the same bytes; this is the check that stops it
  // silently disagreeing with csv-parse and splicing over the wrong range.
  assert.equal(spansAgreeWith("A-001,x,y", ["A-001", "x"]), false);
  assert.equal(spansAgreeWith("A-001,x,y", ["A-001", "x", "z"]), false);
});

test("replaceFields swaps only the named field and preserves the CR of a CRLF record", () => {
  const raw = 'A-001,"has, comma",Draft\r';
  const out = replaceFields(raw, ["A-001", "has, comma", "Draft"], new Map([[2, "Automated"]]));
  assert.equal(out, 'A-001,"has, comma",Automated\r');
});

test("replaceFields quotes a new value that needs it", () => {
  const raw = "A-001,x,Draft";
  const out = replaceFields(raw, ["A-001", "x", "Draft"], new Map([[1, "a, b"]]));
  assert.equal(out, 'A-001,"a, b",Draft');
  assert.equal(quoteField('say "hi"'), '"say ""hi"""');
});

test("replaceFields refuses a record whose fields it cannot locate", () => {
  assert.equal(replaceFields("A-001,x", ["A-001", "x", "y"], new Map([[0, "z"]])), null);
});

// ---- whole-file edits -------------------------------------------------------------

test("applyCellEdits flips one status and leaves every other byte identical", () => {
  const text = csvOf([cleanRow("A-001"), cleanRow("A-002"), cleanRow("A-003")]);
  const res = applyCellEdits(text, new Map([["A-002", { Automation_Status: "Automated" }]]));
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.applied, ["A-002"]);

  const before = text.split("\n");
  const after = res.text.split("\n");
  assert.equal(before.length, after.length);
  for (let i = 0; i < before.length; i++) {
    if (i === 2) assert.notEqual(after[i], before[i]);
    else assert.equal(after[i], before[i], `line ${i + 1} must be byte-identical`);
  }
  assert.ok(after[2].endsWith(",Automated"));
});

test("applyCellEdits preserves CRLF line endings", () => {
  const text = csvOf([cleanRow("A-001"), cleanRow("A-002")], "\r\n");
  const res = applyCellEdits(text, new Map([["A-001", { Automation_Status: "Automated" }]]));
  assert.deepEqual(res.errors, []);
  assert.ok(res.text.includes(",Automated\r\n"));
  assert.equal(res.text.split("\r\n").length, text.split("\r\n").length);
});

test("applyCellEdits survives a row whose fields carry commas, quotes and newlines", () => {
  const gnarly = cleanRow("A-002", PROMOTION_SOURCE, {
    Title: 'He said "go", then left',
    Steps: "[NAV] Open the \"Catalog\" page\n[ACT] Click the \"Save\" button",
    References: "Synced: PR #880 (2026-05-27)",
  });
  const text = csvOf([cleanRow("A-001"), gnarly]);
  const res = applyCellEdits(
    text,
    new Map([
      [
        "A-002",
        {
          Automation_Status: "Automated",
          References: stampReferences(gnarly.References, "REG-2026-08-26-1631", "2026-08-26"),
        },
      ],
    ]),
  );
  assert.deepEqual(res.errors, []);
  assert.ok(res.text.includes("Promoted: REG-2026-08-26-1631 (2026-08-26)"));
  assert.ok(res.text.includes("Synced: PR #880 (2026-05-27)"));
  assert.ok(res.text.includes('He said ""go"", then left'));
});

test("applyCellEdits refuses a non-canonical header and writes nothing", () => {
  const text = "ID,Title,Steps\nA-001,x,y\n";
  const res = applyCellEdits(text, new Map([["A-001", { Automation_Status: "Automated" }]]));
  assert.ok(res.errors.length);
  assert.equal(res.text, text);
  assert.deepEqual(res.applied, []);
});

test("applyCellEdits refuses a short row rather than shifting its columns", () => {
  // relax_column_count lets a malformed row through the parser; writing into it by index
  // would land the status in whatever field happens to sit last.
  const text = csvOf([cleanRow("A-001")]).replace(/\n$/, "") + "\nA-002,only,three\n";
  const res = applyCellEdits(text, new Map([["A-002", { Automation_Status: "Automated" }]]));
  assert.ok(res.errors.some((e) => e.includes("A-002")));
  assert.equal(res.text, text);
});

test("applyCellEdits rejects an unknown column name", () => {
  const text = csvOf([cleanRow("A-001")]);
  const res = applyCellEdits(text, new Map([["A-001", { Nope: "x" } as CellEdit]]));
  assert.ok(res.errors.some((e) => e.includes("Nope")));
  assert.equal(res.text, text);
});

test("applyCellEdits is a no-op when no edit targets an existing id", () => {
  const text = csvOf([cleanRow("A-001")]);
  const res = applyCellEdits(text, new Map([["Z-999", { Automation_Status: "Automated" }]]));
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.applied, []);
  assert.equal(res.text, text);
});

// ---- the decision: the happy path -------------------------------------------------

test("a Draft case that PASSed on an executing lane is promotable", () => {
  const d = planSuite(
    planInput({
      rawText: csvOf([cleanRow("A-001")]),
      runCases: new Map([["A-001", pass()]]),
    }),
  );
  assert.equal(d.refusal, null);
  assert.equal(d.cases.length, 1);
  assert.equal(d.cases[0].promote, true);
  assert.equal(d.cases[0].to, PROMOTION_TARGET);
  assert.deepEqual(d.cases[0].reasons, []);
});

test("a browser-lane PASS is promotable too — an agent is not a human", () => {
  const d = planSuite(
    planInput({
      rawText: csvOf([cleanRow("A-001")]),
      runCases: new Map([["A-001", pass("browser")]]),
    }),
  );
  assert.equal(d.cases[0].promote, true);
});

// ---- the decision: every hold rule ------------------------------------------------

test("a row that is not exactly Draft is out of scope, not reported as held", () => {
  for (const status of ["Automated", "Reviewed", "Manual", "Deprecated", "draft", ""]) {
    const d = planSuite(
      planInput({
        rawText: csvOf([cleanRow("A-001", status)]),
        runCases: new Map([["A-001", pass()]]),
      }),
    );
    assert.deepEqual(d.cases, [], `${status || "<empty>"} must not be considered`);
  }
});

test("PR-002 — a Draft case the run never reported stays Draft", () => {
  const d = planSuite(planInput({ rawText: csvOf([cleanRow("A-001")]) }));
  assert.equal(d.cases[0].promote, false);
  assert.match(d.cases[0].reasons[0], /^PR-002/);
});

test("PR-003 — only PASS promotes", () => {
  for (const status of ["FAIL", "BLOCKED", "SKIPPED", "PENDING", "UNKNOWN", "EMPTY"]) {
    const d = planSuite(
      planInput({
        rawText: csvOf([cleanRow("A-001")]),
        runCases: new Map([["A-001", { status, lane: "machine" }]]),
      }),
    );
    assert.equal(d.cases[0].promote, false, status);
    assert.match(d.cases[0].reasons[0], /^PR-003/);
  }
});

test("PR-004 — a PASS on a lane that never dispatches is refused, not discounted", () => {
  for (const lane of ["manual", "deprecated"]) {
    const d = planSuite(
      planInput({
        rawText: csvOf([cleanRow("A-001")]),
        runCases: new Map([["A-001", pass(lane)]]),
      }),
    );
    assert.equal(d.cases[0].promote, false, lane);
    assert.match(d.cases[0].reasons[0], /^PR-004/);
  }
});

test("PR-005 — a flaky case is never promoted on a green run", () => {
  const d = planSuite(
    planInput({
      rawText: csvOf([cleanRow("A-001")]),
      runCases: new Map([["A-001", pass()]]),
      isFlaky: () => true,
    }),
  );
  assert.equal(d.cases[0].promote, false);
  assert.match(d.cases[0].reasons[0], /^PR-005/);
});

test("PR-006 — the green-run floor holds a case with too short a streak", () => {
  const d = planSuite(
    planInput({
      rawText: csvOf([cleanRow("A-001")]),
      runCases: new Map([["A-001", pass()]]),
      greenRuns: () => 1,
      minGreenRuns: 3,
    }),
  );
  assert.equal(d.cases[0].promote, false);
  assert.match(d.cases[0].reasons[0], /^PR-006.*1\/3/);
});

test("PR-007 — an unresolved {HYPOTHESIS} blocks promotion (G10, re-derived from the CSV)", () => {
  const row = cleanRow("A-001", PROMOTION_SOURCE, {
    Assertions: "the total is 42 {HYPOTHESIS}",
  });
  const d = planSuite(
    planInput({ rawText: csvOf([row]), runCases: new Map([["A-001", pass()]]) }),
  );
  assert.equal(d.cases[0].promote, false);
  assert.match(d.cases[0].reasons[0], /^PR-007/);
  // The same row IS legal at Draft — which is exactly why the row must be linted at its
  // TARGET status. Linting it as it stands would clear a hypothesis into permanent coverage.
  assert.deepEqual(groundingReasons(row, "Draft"), []);
  assert.ok(groundingReasons(row, PROMOTION_TARGET).length);
});

test("PR-007 — an untagged sibling assertion in a provenance-adopted case blocks promotion", () => {
  const row = cleanRow("A-001", PROMOTION_SOURCE, {
    Assertions: "the page renders {DOC}\nthe total is right",
  });
  const d = planSuite(
    planInput({ rawText: csvOf([row]), runCases: new Map([["A-001", pass()]]) }),
  );
  assert.equal(d.cases[0].promote, false);
  assert.match(d.cases[0].reasons[0], /^PR-007/);
});

test("PR-008 — a Critical structural defect blocks promotion even on a green run", () => {
  const row = cleanRow("A-001", PROMOTION_SOURCE, { Steps: "open the catalog page" });
  const d = planSuite(
    planInput({ rawText: csvOf([row]), runCases: new Map([["A-001", pass()]]) }),
  );
  assert.equal(d.cases[0].promote, false);
  assert.match(d.cases[0].reasons[0], /^PR-008/);
});

test("PR-009 — an id the run reported twice is ambiguous evidence, never promoted", () => {
  const d = planSuite(
    planInput({
      rawText: csvOf([cleanRow("A-001")]),
      runCases: new Map([["A-001", pass()]]),
      ambiguousIds: new Set(["A-001"]),
    }),
  );
  assert.equal(d.cases[0].promote, false);
  assert.match(d.cases[0].reasons[0], /^PR-009/);
});

test("PR-011 — a legacy header refuses the whole file rather than guessing columns", () => {
  const d = planSuite(planInput({ rawText: "ID,Title,Steps\nA-001,x,y\n" }));
  assert.match(d.refusal ?? "", /^PR-011/);
  assert.deepEqual(d.cases, []);
});

test("PR-014 — a CSV newer than the run warns by default and refuses under --strict-mtime", () => {
  const base = { rawText: csvOf([cleanRow("A-001")]), runCases: new Map([["A-001", pass()]]) };
  const lenient = planSuite(planInput({ ...base, csvNewerThanRun: true }));
  assert.equal(lenient.refusal, null);
  assert.match(lenient.warnings[0], /^PR-014/);
  assert.equal(lenient.cases[0].promote, true);

  const strict = planSuite(planInput({ ...base, csvNewerThanRun: true, strictMtime: true }));
  assert.match(strict.refusal ?? "", /^PR-014/);
  assert.deepEqual(strict.cases, []);
});

test("a mixed suite promotes only the cases that earned it", () => {
  const rows = [
    cleanRow("A-001"), // PASS       → promote
    cleanRow("A-002"), // FAIL       → hold
    cleanRow("A-003", "Automated"), // already promoted → out of scope
    cleanRow("A-004"), // absent     → hold
  ];
  const d = planSuite(
    planInput({
      rawText: csvOf(rows),
      runCases: new Map([
        ["A-001", pass()],
        ["A-002", { status: "FAIL", lane: "machine" }],
        ["A-003", pass()],
      ]),
    }),
  );
  assert.deepEqual(
    d.cases.map((c) => [c.caseId, c.promote]),
    [
      ["A-001", true],
      ["A-002", false],
      ["A-004", false],
    ],
  );
});

// ---- References stamp -------------------------------------------------------------

test("stampReferences appends without clobbering a sibling stamp, and is idempotent", () => {
  const once = stampReferences("Synced: PR #880 (2026-05-27)", "VCST-1234", "2026-08-26");
  assert.equal(once, "Synced: PR #880 (2026-05-27) | Promoted: VCST-1234 (2026-08-26)");
  assert.equal(stampReferences(once, "VCST-1234", "2026-08-26"), once);
  assert.equal(stampReferences("", "REG-1", "2026-08-26"), "Promoted: REG-1 (2026-08-26)");
  assert.equal(stampReferences("   ", "REG-1", "2026-08-26"), "Promoted: REG-1 (2026-08-26)");
});

// ---- flakiness --------------------------------------------------------------------

function storeOf(entries: Array<[string, string, Record<string, string>]>): TriageStore {
  const store: TriageStore = { version: 2, updatedAt: "", entries: {} } as TriageStore;
  for (const [suiteId, caseId, outcomes] of entries) {
    store.entries[`k:${suiteId}:${caseId}:${Object.keys(outcomes).join("+")}`] = {
      caseKey: "",
      environment: "vcst",
      suiteId,
      caseId,
      signature: "",
      firstSeen: "",
      lastSeen: "",
      runs: [],
      outcomes: outcomes as Record<string, "PASS" | "FAIL">,
    };
  }
  return store;
}

test("the current run counts as a green run even when the store has never seen it", () => {
  // The regression this exists for: the fingerprint store is filled by a SEPARATE
  // `triage:collect --record`, so promoting straight after a run found an empty streak and
  // the default --min-green-runs 1 held every case in the suite.
  const f = flakinessFrom(storeOf([]), "REG-2026-08-26-1631");
  assert.equal(f.greenRuns("050m", "SR-GQL-033"), 1);
  assert.equal(f.isFlaky("050m", "SR-GQL-033"), false);
});

test("the trailing green streak stops at the last FAIL", () => {
  const store = storeOf([
    [
      "050m",
      "X-001",
      {
        "REG-2026-08-01-1000": "PASS",
        "REG-2026-08-02-1000": "FAIL",
        "REG-2026-08-03-1000": "PASS",
      },
    ],
  ]);
  const f = flakinessFrom(store, "REG-2026-08-04-1000");
  assert.equal(f.greenRuns("050m", "X-001"), 2); // 08-03 + the current run
  assert.equal(f.isFlaky("050m", "X-001"), true); // it has both verdicts on record
});

test("runs are ordered by their embedded date, not by their prefix", () => {
  // SMOKE- sorts before REG- as a string, so raw-id ordering would interleave the timelines
  // and compute a streak over a sequence that never happened.
  assert.equal(runOrderKey("SMOKE-2026-08-05-0900"), "2026-08-05-0900");
  assert.equal(runOrderKey("REG-2026-08-04-1000"), "2026-08-04-1000");
  assert.equal(runOrderKey("no-date-here"), "no-date-here");

  const store = storeOf([
    ["050m", "X-001", { "SMOKE-2026-08-05-0900": "FAIL", "REG-2026-08-04-1000": "PASS" }],
  ]);
  // Newest is the SMOKE FAIL, so without the current run the streak is 0; with it, 1.
  assert.equal(flakinessFrom(store, "REG-2026-08-06-1000").greenRuns("050m", "X-001"), 1);
  assert.equal(flakinessFrom(store).greenRuns("050m", "X-001"), 0);
});

test("a case green on one environment and red on another counts as flaky", () => {
  const store = storeOf([
    ["050m", "X-001", { "REG-2026-08-01-1000": "PASS" }],
    ["050m", "X-001", { "REG-2026-08-02-1000": "FAIL" }],
  ]);
  assert.equal(flakinessFrom(store).isFlaky("050m", "X-001"), true);
});

test("flakiness is scoped per suite and per case", () => {
  const store = storeOf([["050m", "X-001", { "REG-2026-08-01-1000": "FAIL" }]]);
  const f = flakinessFrom(store, "REG-2026-08-02-1000");
  assert.equal(f.greenRuns("050m", "X-001"), 1);
  assert.equal(f.greenRuns("050m", "X-002"), 1);
  assert.equal(f.greenRuns("999", "X-001"), 1);
});
