// Tests for the corpus-wide case-ID uniqueness gate in sync-test-suites.ts
// (`npm run suites:lint`).
//
// Case IDs must be globally unique, not merely unique within a suite: the runner
// keys per-case results and failure evidence by bare case ID
// (`suite-*-results.json` rows, `traces/{TC-ID}-FAIL-trace.json`), so two suites
// declaring `CAT-001` let one overwrite the other's evidence — a real failure can
// read as someone else's pass (memory `reference_case_ids_must_be_globally_unique`).
//
// The load-bearing assertions here are the ones that guard silent wrongness:
//   - a collision across two files must be REPORTED (the whole point of the gate)
//   - a suite that is not strictly CSV-parsable must still be scanned, because
//     several real suites carry unescaped inner double-quotes; a field-parse
//     implementation would throw or skip them and the gate would pass vacuously
//   - CRLF and bare-CR row terminators must both be harvested (the corpus is CRLF
//     per .gitattributes, and some cells carry a bare CR)
//   - the same ID twice in ONE file must NOT be reported as a cross-suite
//     collision (that is the appender's in-suite check, a different rule)
// Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findDuplicateCaseIds, allSuiteCsvs } from "../test-cases/sync-test-suites.js";

const HEADER =
  "ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions," +
  "Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup," +
  "References,Automation_Status";

/** Build a throwaway suite tree; returns its root. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "vc-suites-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body, "utf-8");
  }
  return root;
}

const row = (id: string, title = "t") =>
  `"${id}","${title}","S","Low",,,,,,,,,,,"Draft"`;

// --- the collision it exists to catch -------------------------------------

test("reports a case ID declared in two different suites", () => {
  const root = fixture({
    "Frontend/catalog/001-nav.csv": [HEADER, row("CAT-001"), row("CAT-002")].join("\r\n") + "\r\n",
    "Backend/catalog/051-admin.csv": [HEADER, row("CAT-001"), row("CAT-009")].join("\r\n") + "\r\n",
  });
  try {
    const dups = findDuplicateCaseIds(root);
    assert.equal(dups.length, 1);
    assert.match(dups[0], /case ID "CAT-001" appears in 2 suites/);
    assert.match(dups[0], /001-nav\.csv/);
    assert.match(dups[0], /051-admin\.csv/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean corpus reports nothing", () => {
  const root = fixture({
    "Frontend/catalog/001-nav.csv": [HEADER, row("CAT-001")].join("\r\n") + "\r\n",
    "Backend/catalog/051-admin.csv": [HEADER, row("CATA-001")].join("\r\n") + "\r\n",
  });
  try {
    assert.deepEqual(findDuplicateCaseIds(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports every suite holding a colliding ID, not just the first pair", () => {
  const root = fixture({
    "a/001.csv": [HEADER, row("ORD-001")].join("\r\n") + "\r\n",
    "b/017.csv": [HEADER, row("ORD-001")].join("\r\n") + "\r\n",
    "c/018.csv": [HEADER, row("ORD-001")].join("\r\n") + "\r\n",
  });
  try {
    const dups = findDuplicateCaseIds(root);
    assert.equal(dups.length, 1);
    assert.match(dups[0], /appears in 3 suites/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- silent-wrongness guards ---------------------------------------------

test("still scans a suite that is NOT strictly CSV-parsable", () => {
  // An unescaped inner double-quote inside Assertions: strict csv-parse rejects
  // this file. The gate must not skip it, or a whole suite silently escapes the
  // uniqueness check. Several real suites are in exactly this shape.
  const broken =
    [HEADER, `"CAT-001","t","S","Low",,,,,,"[DOM] shows "26 products" here",,,,,"Draft"`].join(
      "\r\n",
    ) + "\r\n";
  const root = fixture({
    "Frontend/catalog/001-nav.csv": [HEADER, row("CAT-001")].join("\r\n") + "\r\n",
    "Backend/catalog/051-admin.csv": broken,
  });
  try {
    const dups = findDuplicateCaseIds(root);
    assert.equal(dups.length, 1, "collision inside a non-parsable suite must still be found");
    assert.match(dups[0], /CAT-001/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("harvests rows terminated by LF and by a bare CR, not just CRLF", () => {
  const root = fixture({
    "a/lf.csv": [HEADER, row("SRCH-001")].join("\n") + "\n",
    "b/cr.csv": [HEADER, row("SRCH-001")].join("\r") + "\r",
  });
  try {
    assert.equal(findDuplicateCaseIds(root).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the same ID twice in ONE file is not a cross-suite collision", () => {
  // In-suite duplicates are the appender's own check (validateRows); this gate is
  // strictly about one ID spanning two files. Reporting it here would fire a
  // confusing cross-suite error for a single-file problem.
  const root = fixture({
    "a/001.csv": [HEADER, row("CAT-001"), row("CAT-001")].join("\r\n") + "\r\n",
  });
  try {
    assert.deepEqual(findDuplicateCaseIds(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores non-CSV files and a header-only suite", () => {
  const root = fixture({
    "a/001.csv": [HEADER, row("CAT-001")].join("\r\n") + "\r\n",
    "a/notes.md": "CAT-001 mentioned in prose, must not count\n",
    "b/empty.csv": HEADER + "\r\n",
  });
  try {
    assert.deepEqual(findDuplicateCaseIds(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- allSuiteCsvs ---------------------------------------------------------

test("allSuiteCsvs walks nested dirs, returns forward-slash paths, skips non-CSV", () => {
  const root = fixture({
    "Frontend/catalog/001.csv": HEADER + "\r\n",
    "Backend/deep/nest/051.csv": HEADER + "\r\n",
    "README.md": "x",
  });
  try {
    const found = allSuiteCsvs(root).map((f) => f.slice(root.length + 1).replace(/\\/g, "/"));
    assert.deepEqual(found.sort(), ["Backend/deep/nest/051.csv", "Frontend/catalog/001.csv"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allSuiteCsvs returns empty for a missing root instead of throwing", () => {
  assert.deepEqual(allSuiteCsvs(join(tmpdir(), "vc-suites-does-not-exist-xyz")), []);
});

// --- the live corpus ------------------------------------------------------

test("the committed suite corpus has zero cross-suite case-ID collisions", () => {
  // This is the ratchet: the corpus was cleaned (223 collisions resolved), so
  // unlike CSV_LINT_BASELINE there is no pre-existing debt to tolerate.
  assert.deepEqual(findDuplicateCaseIds(), []);
});
