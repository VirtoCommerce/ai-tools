// Unit test for `loadCase` in scripts/graphql/graphql-runner.ts — the BOM asymmetry.
//
// The runner's own linter (`review-graphql-labels.ts`, the GQL-1 step) has always passed
// `bom: true`; the runner that executes what the linter approved did not. So a BOM-prefixed
// suite linted clean and then failed at execution, and the error message pointed at the wrong
// thing: with `columns: true` the first header becomes "﻿ID", every row's `.ID` is
// undefined, and the lookup reports `Case <id> not found` for a case that is plainly there.
//
// 12 of the corpus's suite CSVs carry a BOM. It only became reachable with per-case lane
// routing — before that a suite reached the runner only if EVERY case was runner-native, and
// none of the BOM suites qualified.
//
// Run: `npx tsx --test scripts/unit/runner-csv-bom.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COLUMNS } from "../test-cases/append-test-cases-to-suite.ts";
import { loadCase } from "../graphql/graphql-runner.ts";

const scratch = mkdtempSync(join(tmpdir(), "runner-bom-"));

function writeSuite(name: string, withBom: boolean): string {
  const body = [
    COLUMNS.join(","),
    "GQL-001,first,s,High,,,,,[GQL-EXEC a],[ERRORS label=a] errors[] empty,,,,,Automated",
    "GQL-002,second,s,High,,,,,[GQL-EXEC b],[ERRORS label=b] errors[] empty,,,,,Automated",
  ].join("\n") + "\n";
  const path = join(scratch, name);
  writeFileSync(path, (withBom ? "﻿" : "") + body, "utf-8");
  return path;
}

test("a case in a BOM-prefixed suite is found — the regression this closes", () => {
  const path = writeSuite("bom.csv", true);
  const { row } = loadCase(`${path}:GQL-001`);
  assert.equal(row.ID, "GQL-001");
  assert.equal(row.Title, "first");
});

test("a case in a plain suite is still found — the fix changes nothing else", () => {
  const path = writeSuite("plain.csv", false);
  assert.equal(loadCase(`${path}:GQL-002`).row.ID, "GQL-002");
});

test("a genuinely absent case still reports itself as absent, BOM or not", () => {
  // The point of the fix is that "not found" now means not found. If a BOM could still
  // produce this message, the message would be untrustworthy again.
  for (const withBom of [true, false]) {
    const path = writeSuite(`missing-${withBom}.csv`, withBom);
    assert.throws(() => loadCase(`${path}:GQL-999`), /Case GQL-999 not found/);
  }
});

test("a malformed --case reference is rejected before any file read", () => {
  assert.throws(() => loadCase("no-colon-here"), /--case must be <csv-path>:<ID>/);
});

test("a missing CSV is reported as a missing CSV", () => {
  assert.throws(() => loadCase(`${join(scratch, "nope.csv")}:GQL-001`), /Suite CSV not found/);
});

// ---- the Windows drive-letter regression ------------------------------------------

test("a path containing a colon still parses — a Windows drive letter is not a separator", () => {
  // `--case` used to `split(":")` and take [0] as the path, so on Windows
  // `D:\a\repo\suite.csv:GQL-001` yielded csvPath="D" and the error `Suite CSV not found: D`
  // — pointing nowhere near the cause. `--case` could never work on that platform, and it
  // took running the parser on the Windows leg of CI to notice. Asserted on every platform so
  // the fix cannot regress on a Linux-only run.
  const path = writeSuite("colon.csv", false);
  const drivey = `C:${path}`; // shaped like a Windows absolute path, valid to construct anywhere
  assert.throws(
    () => loadCase(`${drivey}:GQL-001`),
    (e: Error) =>
      // It got past reference-parsing, so the LAST colon was taken as the separator ...
      /Suite CSV not found/.test(e.message) &&
      // ... and the path it reports is the whole thing, not a truncated drive letter.
      // Asserted on the BASENAME, not on the literal `drivey`: the message reports
      // `resolve(csvPath)`, and resolve() rewrites a drive-relative win32 path, so the
      // literal survives on POSIX and does not on Windows. Under the old first-colon
      // split csvPath was "C", whose resolved form carries no basename at all — so the
      // basename still discriminates the bug on both platforms.
      e.message.includes("colon.csv"),
    "the whole path up to the LAST colon must be treated as the path",
  );
  // And the ordinary form keeps working.
  assert.equal(loadCase(`${path}:GQL-001`).row.ID, "GQL-001");
});

test("a reference with no colon at all is still rejected", () => {
  assert.throws(() => loadCase("suite.csv"), /--case must be <csv-path>:<ID>/);
});

test("a trailing colon with no id is rejected rather than read as an empty id", () => {
  assert.throws(() => loadCase("suite.csv:"), /--case must be <csv-path>:<ID>/);
});
