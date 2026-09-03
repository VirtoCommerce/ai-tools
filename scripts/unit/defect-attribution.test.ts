// Unit tests for scripts/lib/defect-attribution.ts — the bug -> test-case join.
//
// This parser is the metric that judges the whole assertion-strength change, so
// its failure mode matters more than its coverage: a FALSE attribution is far
// worse than a missed one. A missed one under-reports yield and is visible as a
// small denominator; a false one silently credits a case with catching a bug it
// never caught, which would make the metric unfalsifiable and self-congratulating.
//
// So most of these tests pin the REFUSALS: an invariant id, a ticket key and an
// AC clause all appear in exactly the position a case id appears, and none may
// be promoted into an attribution.
// Run: `npx tsx --test scripts/unit/defect-attribution.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFoundBy,
  expandShorthand,
  indexAttributions,
  collectAttributions,
  type Attribution,
} from "../lib/defect-attribution.js";
import { mkdtempSync, mkdirSync, writeFileSync as writeFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KNOWN = new Set([
  "CUST-090", "B2C-MBR-025", "B2C-MBR-032", "COMP-E2E-023", "CUST-085",
  "PRF-GQL-066", "PRF-GQL-067", "PRF-GQL-068", "PRF-GQL-069",
  "CART-015", "IMP-046", "PRICE-021", "PRICE-022", "PRICE-023", "IMP-013",
]);

/** The real line shapes found in reports/bugs/ when this shipped. */
const REAL = {
  regression: "**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 027 (CUST-090) · triaged `REAL_BUG`",
  multiCase: "**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 008 (B2C-MBR-032, B2C-MBR-025) · triaged `REAL_BUG`",
  shorthand: "**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 050d (PRF-GQL-066, 067, 068, 069) · triaged `REAL_BUG`",
  twoSuites: "**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 027 (CUST-085) + suite 011b (COMP-E2E-023) · triaged `REAL_BUG`",
  prose: "**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 008 (B2C-MBR-025; AC-2 half also seen in B2C-MBR-032) · triaged `REAL_BUG`",
  altRun: "**Found by:** regression run `REG-2026-07-01-1807-082p0`, suite 082 case **IMP-046** (browser: playwright-edge)",
  noCase: "**Found by:** live UCP MCP probe during VCST-5504 review · **Repo:** [vc-module-ucp](https://github.com/VirtoCommerce/vc-module-ucp)",
  casesLine: "**Cases:** IMP-013 (suite 082-auth-impersonation) · BL-AUTH-009",
  pricesLine: "**Cases:** `PRICE-021` (passes — the guard), `PRICE-022` / `PRICE-023` (fail — the bypass), suite `054`",
};

test("parses the canonical regression provenance line", () => {
  const r = parseFoundBy(REAL.regression, KNOWN);
  assert.deepEqual(r.caseIds, ["CUST-090"]);
  assert.deepEqual(r.suiteIds, ["027"]);
  assert.equal(r.runId, "REG-2026-07-30-1040");
  assert.equal(r.source, "regression");
  assert.equal(r.attributed, true);
});

test("several cases in one parenthesised group", () => {
  assert.deepEqual(parseFoundBy(REAL.multiCase, KNOWN).caseIds, ["B2C-MBR-025", "B2C-MBR-032"]);
});

test("shorthand continuation numbers inherit the preceding prefix", () => {
  assert.deepEqual(parseFoundBy(REAL.shorthand, KNOWN).caseIds, [
    "PRF-GQL-066", "PRF-GQL-067", "PRF-GQL-068", "PRF-GQL-069",
  ]);
});

test("two suites named on one line are both captured", () => {
  const r = parseFoundBy(REAL.twoSuites, KNOWN);
  assert.deepEqual(r.suiteIds, ["027", "011b"]);
  assert.deepEqual(r.caseIds, ["COMP-E2E-023", "CUST-085"]);
});

test("an alternative run-id format and a bolded case id still parse", () => {
  const r = parseFoundBy(REAL.altRun, KNOWN);
  assert.equal(r.runId, "REG-2026-07-01-1807-082p0");
  assert.deepEqual(r.caseIds, ["IMP-046"]);
});

test("backticked ids and prose annotations do not defeat the parse", () => {
  assert.deepEqual(parseFoundBy(REAL.pricesLine, KNOWN).caseIds, ["PRICE-021", "PRICE-022", "PRICE-023"]);
});

// --- The refusals. These are the reason the parser validates against the corpus. ---
test("REFUSES an invariant id sitting where a case id would be", () => {
  const r = parseFoundBy(REAL.casesLine, KNOWN);
  assert.deepEqual(r.caseIds, ["IMP-013"]);
  assert.ok(!r.caseIds.includes("BL-AUTH-009"));
  // ...and does not report it as a MISSING case either — it is not a case at all.
  assert.deepEqual(r.unknownCaseIds, []);
});

test("REFUSES a ticket key and an AC clause", () => {
  const r = parseFoundBy(REAL.prose, KNOWN);
  assert.deepEqual(r.caseIds, ["B2C-MBR-025", "B2C-MBR-032"]);
  assert.deepEqual(r.unknownCaseIds, []);
  const t = parseFoundBy(REAL.noCase, KNOWN);
  assert.deepEqual(t.caseIds, []);
  assert.equal(t.attributed, false);
});

test("a case-shaped id that is NOT in the corpus is reported, not silently dropped", () => {
  const line = "**Found by:** `/qa-regression` REG-2026-08-01-0900, suite 999 (GONE-042)";
  const r = parseFoundBy(line, KNOWN);
  assert.deepEqual(r.caseIds, []);
  assert.deepEqual(r.unknownCaseIds, ["GONE-042"]);
  assert.equal(r.attributed, false, "an id that does not exist cannot count as an attribution");
});

test("a bare number outside a case group is never promoted to a case id", () => {
  // `suite 050d` and `2026` and a viewport must not become case ids.
  const line = "**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 050d at 1280 wide";
  const r = parseFoundBy(line, KNOWN);
  assert.deepEqual(r.caseIds, []);
  assert.deepEqual(r.unknownCaseIds, []);
});

test("expandShorthand only expands after a full id", () => {
  assert.deepEqual(expandShorthand("PRF-GQL-066, 067, 068"), ["PRF-GQL-066", "PRF-GQL-067", "PRF-GQL-068"]);
  // No anchor id -> nothing to inherit from.
  assert.deepEqual(expandShorthand("066, 067"), []);
});

test("a report with no provenance line at all is unattributed and unstated", () => {
  const r = parseFoundBy("# Some bug\n\n**Env:** vcst-qa\n\n## Summary\nIt broke.", KNOWN);
  assert.equal(r.attributed, false);
  assert.equal(r.source, "unstated");
  assert.deepEqual(r.caseIds, []);
});

test("provenance is read only from the report head, not from the whole body", () => {
  // A later section quoting a case id must not become an attribution.
  const body = ["# Bug", "", "**Env:** x", ...Array(60).fill("filler"), "**Case:** CART-015"].join("\n");
  assert.equal(parseFoundBy(body, KNOWN).attributed, false);
});

test("indexAttributions derives the run+suite join and keeps unattributed visible", () => {
  const rows: Attribution[] = [
    { bugFile: "open/a.md", lifecycle: "open", runId: "REG-1", suiteIds: ["027"], caseIds: ["CUST-090"], unknownCaseIds: [], source: "regression", attributed: true },
    { bugFile: "open/b.md", lifecycle: "open", runId: "REG-1", suiteIds: ["027"], caseIds: ["CUST-085"], unknownCaseIds: [], source: "regression", attributed: true },
    { bugFile: "open/c.md", lifecycle: "open", suiteIds: [], caseIds: [], unknownCaseIds: [], source: "monitoring", attributed: false },
  ];
  const idx = indexAttributions(rows);
  assert.equal(idx.total, 3);
  assert.equal(idx.attributed, 2);
  // This is what `bugs_found` is derived from — two bugs against one run+suite.
  assert.equal(idx.byRunSuite.get("REG-1::027"), 2);
  assert.equal(idx.byCase.get("CUST-090")?.length, 1);
  // A monitoring bug with no case is signal about where cases AREN'T.
  assert.equal(idx.unattributedBySource.get("monitoring"), 1);
});

// A lifecycle dir may be foldered by severity (`open/critical-high/`, …). The
// collector's original one-level scan read zero `.md` in such an `open/` and
// dropped every open bug from tc:yield / tc:rank / compute-metrics — silently,
// because `open` IS a known lifecycle dir, so the unknown-dir warning never
// fired. These two pin the recursion, and pin that a SEVERITY folder does not
// become a lifecycle.
test("collectAttributions walks severity subfolders inside a lifecycle dir", () => {
  const root = mkdtempSync(join(tmpdir(), "bugs-"));
  mkdirSync(join(root, "open", "critical-high"), { recursive: true });
  mkdirSync(join(root, "open", "low"), { recursive: true });
  mkdirSync(join(root, "open", "screenshots"), { recursive: true });
  mkdirSync(join(root, "fixed"), { recursive: true });
  writeFile(join(root, "open", "critical-high", "BUG-a.md"), ["# a", "", REAL.regression, ""].join("\n"));
  writeFile(join(root, "open", "low", "BUG-b.md"), ["# b", "", "no provenance", ""].join("\n"));
  writeFile(join(root, "open", "screenshots", "BUG-not-a-report.md"), "# nope\n");
  writeFile(join(root, "fixed", "BUG-c.md"), ["# c", "", "no provenance", ""].join("\n"));

  const rows = collectAttributions(root, KNOWN);
  assert.equal(rows.length, 3, "nested reports are collected; NON_REPORT_DIRS is skipped");

  const byFile = new Map(rows.map((r) => [r.bugFile.split("\\").join("/"), r]));
  // Severity is declared INSIDE the report — the folder must not set lifecycle.
  assert.equal(byFile.get("open/critical-high/BUG-a.md")?.lifecycle, "open");
  assert.equal(byFile.get("open/low/BUG-b.md")?.lifecycle, "open");
  assert.equal(byFile.get("fixed/BUG-c.md")?.lifecycle, "fixed");
  // The nested report's provenance still parses, so yield is not lost.
  assert.deepEqual(byFile.get("open/critical-high/BUG-a.md")?.caseIds, ["CUST-090"]);
});

test("a flat lifecycle dir still works after the recursion change", () => {
  const root = mkdtempSync(join(tmpdir(), "bugs-flat-"));
  mkdirSync(join(root, "open"), { recursive: true });
  writeFile(join(root, "open", "BUG-flat.md"), ["# flat", "", REAL.regression, ""].join("\n"));

  const rows = collectAttributions(root, KNOWN);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bugFile.split("\\").join("/"), "open/BUG-flat.md");
  assert.equal(rows[0].lifecycle, "open");
});
