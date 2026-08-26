// Unit tests for `isCanonicalHeader` / `describeHeaderMismatch` in
// scripts/test-cases/append-test-cases-to-suite.ts.
//
// WHY THE GUARD IS SHARED. `parseSuite` maps fields POSITIONALLY, so on one of the 11 surviving
// legacy 11-column suites the legacy `Steps` lands in `Test_Data` and `Expected Result` lands in
// `Steps`. A consumer that then reads a column by name scores confidently-derived nonsense, and
// nothing downstream can tell. The comparison was duplicated across six call sites in four files.
//
// WHY A PREDICATE AND NOT AN `assert`. Those six sites need three different reactions: skip the
// file (`continue` / `return null`), count its rows as unroutable, or refuse loudly (`fail` /
// exit 2). What was duplicated is the COMPARISON, not the reaction — a throwing
// `assertCanonicalHeader` would have been unusable by four of the six, i.e. a seventh variant
// rather than shared code.
//
// Run: `npx tsx --test scripts/unit/canonical-header.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COLUMNS,
  describeHeaderMismatch,
  isCanonicalHeader,
} from "../test-cases/append-test-cases-to-suite.ts";
import { allSuiteCsvs } from "../test-cases/sync-test-suites.ts";

const CANONICAL = COLUMNS.join(",");
const QUOTED = COLUMNS.map((c) => `"${c}"`).join(",");
const LEGACY_11 = "ID,Title,Section,Priority,Type,Estimate,Preconditions,Steps,Expected Result,References,Automation_Status";

// ---- both header styles the corpus actually uses ---------------------------------

test("the unquoted header style is canonical", () => {
  // 51 suites are written this way.
  assert.equal(isCanonicalHeader(`${CANONICAL}\nX-001,t\n`), true);
  assert.equal(describeHeaderMismatch(`${CANONICAL}\n`), null);
});

test("the quoted header style is canonical too", () => {
  // 76 suites are written this way; both must be accepted or half the corpus goes unroutable.
  assert.equal(isCanonicalHeader(`${QUOTED}\nX-001,t\n`), true);
  assert.equal(describeHeaderMismatch(`${QUOTED}\n`), null);
});

test("a BOM is stripped INSIDE — callers must not do it again", () => {
  // Two of the six call sites used to strip it externally and two did not, which reads like a
  // meaningful difference between them. It was not.
  assert.equal(isCanonicalHeader(`﻿${CANONICAL}\n`), true);
  assert.equal(isCanonicalHeader(`﻿${QUOTED}\n`), true);
  assert.equal(describeHeaderMismatch(`﻿${CANONICAL}\n`), null);
});

test("CRLF line endings do not affect the verdict", () => {
  // Every suite CSV is CRLF in the working tree (.gitattributes forces it).
  assert.equal(isCanonicalHeader(`${CANONICAL}\r\nX-001,t\r\n`), true);
});

// ---- rejection, and saying why ---------------------------------------------------

test("a legacy 11-column header is rejected", () => {
  assert.equal(isCanonicalHeader(`${LEGACY_11}\nLEG-001,t\n`), false);
});

test("the mismatch description names the count AND both shapes", () => {
  // The two call sites that report rather than skip print this verbatim, so it has to be
  // actionable on its own.
  const why = describeHeaderMismatch(`${LEGACY_11}\n`);
  assert.ok(why, "a non-canonical header must describe itself");
  assert.match(why!, /11 column\(s\)/);
  assert.match(why!, /expected: ID,Title,Section/);
  assert.match(why!, /found:    ID,Title,Section,Priority,Type/);
});

test("a header with the right count but wrong names is rejected", () => {
  // Column COUNT is not the contract — order and names are, because the read is positional.
  const swapped = [...COLUMNS];
  [swapped[8], swapped[9]] = [swapped[9], swapped[8]]; // Steps <-> Assertions
  assert.equal(isCanonicalHeader(`${swapped.join(",")}\n`), false);
  assert.match(describeHeaderMismatch(`${swapped.join(",")}\n`)!, /15 column\(s\)/);
});

test("an empty file is rejected without throwing", () => {
  assert.doesNotThrow(() => isCanonicalHeader(""));
  assert.equal(isCanonicalHeader(""), false);
  assert.ok(describeHeaderMismatch(""));
});

test("surrounding whitespace in header cells is tolerated", () => {
  // `headerFields` trims, and at least one suite is written with padding.
  assert.equal(isCanonicalHeader(`${COLUMNS.map((c) => ` ${c} `).join(",")}\n`), true);
});

// ---- the corpus invariant --------------------------------------------------------

test("exactly 11 suite CSVs fail the predicate — it got neither stricter nor weaker", () => {
  // Pinned so the refactor that extracted this guard from six inline copies is provably
  // behaviour-preserving. If a header is migrated this number drops and the test is updated
  // deliberately; a change in either direction from a refactor is a bug.
  const failing = allSuiteCsvs().filter((f) => !isCanonicalHeader(readFileSync(f, "utf-8")));
  assert.equal(
    failing.length,
    11,
    `expected 11 legacy-header suites, found ${failing.length}: ${failing.map((f) => f.split("/").pop()).join(", ")}`,
  );
});

test("every suite that passes the predicate also field-parses to the 15 columns", () => {
  // The predicate's promise to its callers: pass it, and reading a column BY NAME is safe.
  for (const f of allSuiteCsvs()) {
    const raw = readFileSync(f, "utf-8");
    if (!isCanonicalHeader(raw)) continue;
    assert.equal(describeHeaderMismatch(raw), null, `${f} passes the predicate but describes a mismatch`);
  }
});
