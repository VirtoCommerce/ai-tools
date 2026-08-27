// Integrity tests for the suite-078 split, and for the XREF-001 rule that makes it safe.
//
// WHY THIS FILE EXISTS. `smoke` and `critical` are the two selections run most often, and
// both were bounded by ONE suite: 078 (115 cases, 83 min) was the entire critical path, so
// the lane pool had nothing to pack and scheduling could not help. 078 is now four
// dependency-closed sibling suites (078/078b/078c/078d), which is what turns 83 min into
// ~39 min — no runtime code involved, just four files where there was one.
//
// A split is only sound while two properties hold, and neither is visible to any existing
// gate:
//
//   1. NO CASE MAY BE LOST. `suites:lint` checks that an ID is not in two files; nothing
//      checked that all 115 are still SOMEWHERE. Dropping a P0 smoke case would show up as
//      a smaller, greener, faster run — the worst possible failure shape.
//   2. NO DEPENDENCY MAY CROSS A FILE. `check-smoke-gates.ts` structurally cannot see this:
//      it builds its case-ID set as the UNION of sibling CSVs in the directory, so a
//      reference from 078b into 078 passes SG-001 as perfectly valid while being a
//      precondition the runner will never establish.
//
// Run: `npx tsx --test scripts/unit/suite-split-integrity.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { findCrossFileCaseRefs } from "../test-cases/sync-test-suites.ts";
import { COLUMNS } from "../test-cases/append-test-cases-to-suite.ts";
import { loadManifest, resolveSelection, type ManifestSuite } from "../../ci/lib/suite-manifest.ts";
import { buildRunPlan } from "../../ci/lib/run-plan.ts";
import { classifyLane } from "../../ci/lib/lane-classifier.ts";

const SMOKE_DIR = join("regression", "suites", "Backend", "smoke");
const SIBLINGS = [
  "078-backend-smoke-tests.csv",
  "078b-backend-smoke-catalog-pricing.csv",
  "078c-backend-smoke-commerce.csv",
  "078d-backend-smoke-content-workflows.csv",
];

/**
 * The pre-split contract: 078 held exactly BSM-001..BSM-115, with no gaps. Written as the
 * range rather than a pasted list precisely because a pasted list can be "fixed" to match
 * a corpus that has lost a case.
 */
const ORIGINAL_IDS = Array.from({ length: 115 }, (_, i) => `BSM-${String(i + 1).padStart(3, "0")}`);

function readRows(file: string): Array<Record<string, string>> {
  return parseCsv(readFileSync(join(SMOKE_DIR, file), "utf-8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false, // strict: a stray comma must fail here, not mid-run
  }) as Array<Record<string, string>>;
}

// ---- the split itself --------------------------------------------------------------

test("every one of the original 115 cases still exists, in exactly one sibling", () => {
  const owner = new Map<string, string>();
  for (const file of SIBLINGS) {
    for (const row of readRows(file)) {
      const id = String(row.ID ?? "").trim();
      assert.ok(id, `${file} has a row with no ID`);
      const prev = owner.get(id);
      assert.equal(prev, undefined, `${id} is in both ${prev} and ${file}`);
      owner.set(id, file);
    }
  }
  assert.deepEqual(
    [...owner.keys()].sort(),
    [...ORIGINAL_IDS].sort(),
    "the union of the four siblings is not the original suite — a P0 smoke case was lost or invented",
  );
});

test("each sibling strict-parses and keeps the canonical 15-column header", () => {
  for (const file of SIBLINGS) {
    const raw = readFileSync(join(SMOKE_DIR, file), "utf-8");
    const header = (
      parseCsv(raw, { bom: true, to_line: 1, relax_column_count: false }) as string[][]
    )[0];
    assert.deepEqual(header, COLUMNS, `${file} header drifted from the enriched 15-column format`);
    assert.doesNotThrow(() => readRows(file), `${file} does not strict-parse`);
  }
});

test("no dependency crosses a sibling boundary", () => {
  // The bootstrap cases (login / bearer token / an org exists / GraphiQL reachable) live
  // only in 078; the other three files restate them as state the runner establishes at
  // suite setup. Any BSM-* reference leaving its own file means that never happens.
  const owner = new Map<string, string>();
  for (const file of SIBLINGS) for (const r of readRows(file)) owner.set(String(r.ID).trim(), file);

  const escapes: string[] = [];
  for (const file of SIBLINGS) {
    for (const row of readRows(file)) {
      for (const [column, value] of Object.entries(row)) {
        for (const m of String(value ?? "").matchAll(/\bBSM-\d+\b/g)) {
          if (m[0] === String(row.ID).trim()) continue;
          const home = owner.get(m[0]);
          if (home && home !== file) escapes.push(`${file} ${row.ID}.${column} -> ${m[0]} (in ${home})`);
        }
      }
    }
  }
  assert.deepEqual(escapes, [], `cross-sibling dependency:\n  ${escapes.join("\n  ")}`);
});

// ---- the manifest side ------------------------------------------------------------

test("smoke and critical both run all four siblings", () => {
  const manifest = loadManifest();
  for (const selection of ["smoke", "critical"]) {
    const { ids } = resolveSelection(manifest, selection);
    for (const id of ["078", "078b", "078c", "078d"]) {
      assert.ok(ids.includes(id), `${selection} does not run ${id} — part of the P0 smoke gate is missing`);
    }
  }
});

test("the four siblings' declared testCounts sum back to the original 115", () => {
  const manifest = loadManifest();
  const total = ["078", "078b", "078c", "078d"]
    .map((id) => manifest.suites.find((s) => s.id === id))
    .map((s) => {
      assert.ok(s, "a sibling is missing from the manifest — a suite absent from it never runs");
      return s!.testCount;
    })
    .reduce((a, b) => a + b, 0);
  assert.equal(total, 115, "manifest testCounts no longer account for the original suite");
});

test("no sibling introduces a tag that would widen a tag-driven selection", () => {
  // b2b / bopis / payment / whitelabeling / configurable-products are `where: {tag}`
  // selections. 078 carried none of them despite containing such cases, so a sibling
  // picking one up would silently pull P0 smoke cases into an unrelated group.
  const manifest = loadManifest();
  const TAG_DRIVEN = ["b2b", "bopis", "payment", "whitelabeling", "configurable-products"];
  for (const id of ["078", "078b", "078c", "078d"]) {
    const suite = manifest.suites.find((s) => s.id === id)!;
    for (const tag of TAG_DRIVEN) {
      assert.ok(!suite.tags.includes(tag), `${id} carries the selection-driving tag "${tag}"`);
    }
  }
});

test("the split delivers the wall-clock it exists for", () => {
  const manifest = loadManifest();
  const plannable = resolveSelection(manifest, "smoke")
    .ids.map((id) => manifest.suites.find((s) => s.id === id))
    .filter((s): s is ManifestSuite => Boolean(s))
    .map((s) => ({
      id: s.id,
      description: s.name,
      lane: classifyLane(s),
      testCount: s.testCount,
      estimatedMinutes: s.estimatedMinutes,
      preferredBrowser: s.preferredBrowser,
      browserDenyList: s.clickDriven ? ["playwright-firefox"] : [],
    }));
  const plan = buildRunPlan(plannable, { browser: 3, fastpath: 4, deterministic: 2 });
  assert.ok(
    plan.makespanMinutes < 60,
    `smoke makespan is ${plan.makespanMinutes}m; it was 83m when 078 was one suite`,
  );
});

// ---- XREF-001, the rule that keeps this true ---------------------------------------

test("XREF-001 flags a reference that leaves its file, and only that", () => {
  const root = mkdtempSync(join(tmpdir(), "xref-"));
  mkdirSync(join(root, "a"), { recursive: true });
  mkdirSync(join(root, "b"), { recursive: true });
  const header = COLUMNS.join(",");
  const row = (id: string, pre: string) =>
    `${id},t,s,High,,,${pre.includes(",") ? `"${pre}"` : pre},,x,y,,,,,Draft`;

  writeFileSync(
    join(root, "a", "one.csv"),
    [header, row("AAA-001", "Fresh session"), row("AAA-002", "Logged in (AAA-001 passed)")].join("\n") + "\n",
  );
  writeFileSync(
    join(root, "b", "two.csv"),
    [header, row("BBB-001", "Needs AAA-001 done, plus BL-AUTH-005 and VCST-5089")].join("\n") + "\n",
  );

  const refs = findCrossFileCaseRefs(root);
  assert.equal(refs.length, 1, `expected exactly one finding, got ${JSON.stringify(refs)}`);
  assert.equal(refs[0].caseId, "BBB-001");
  assert.equal(refs[0].ref, "AAA-001");
  // AAA-002 -> AAA-001 is same-file and legitimate; BL-AUTH-005 / VCST-5089 resolve to no
  // case at all, so prose that merely looks like an ID can never be a false positive.
});

test("XREF-001 reports nothing for the four siblings except 078's one baselined ref", () => {
  const inSmoke = findCrossFileCaseRefs().filter((r) => r.file.split("/").includes("smoke"));
  const offenders = inSmoke.map((r) => `${r.file}: ${r.caseId} -> ${r.ref}`).sort();
  assert.deepEqual(offenders, [
    // Pre-existing, baselined: BSM-115 documents a store field owned by suite 034.
    "regression/suites/Backend/smoke/078-backend-smoke-tests.csv: BSM-115 -> STORE-052",
    "regression/suites/Frontend/smoke/042-smoke-tests.csv: SMK-034 -> PAY-SKY-009",
    "regression/suites/Frontend/smoke/042-smoke-tests.csv: SMK-034 -> PAY-SKY-016",
  ]);
});
