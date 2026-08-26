// Unit tests for ci/lib/lane-classifier.ts — which executor owns a suite.
//
// Two things are being locked out here.
//
// 1. CI had no fast path at all: every runner-native GraphQL suite ran through an LLM driving
//    a browser in headless mode, competing for the very slots the browser suites need, while
//    `scripts/graphql/graphql-runner.ts` could already execute them deterministically.
//
// 2. The classifier must use the STRICT rule (every non-empty Steps cell carries a runner tag),
//    not the tempting "has runner tags and no UI tags". Suite 050d has 46 runner-native cases
//    out of 49; the other 3 carry neither GraphQL nor UI tags. Under the weaker rule the whole
//    suite goes to the runner, which cannot parse those 3 and exits 2 -> BLOCKED. That is a
//    phantom blocker manufactured by misrouting, which is worse than a slow-but-correct lane.
//
// Run: `npx tsx --test scripts/unit/lane-classifier.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyLane, extractStepsCells, isRunnerNative } from "../../ci/lib/lane-classifier.ts";

const scratch = mkdtempSync(join(tmpdir(), "lane-classifier-"));
let seq = 0;

function csvFile(body: string): string {
  const path = join(scratch, `s${seq++}.csv`);
  writeFileSync(path, body, "utf-8");
  return path;
}

const HEADER =
  '"ID","Title","Section","Priority","Business_Rule","Edge_Case_Refs","Preconditions","Test_Data","Steps","Assertions","Cross_Layer_Checks","Failure_Signals","Cleanup","References","Automation_Status"';

function row(id: string, steps: string): string {
  const cell = `"${steps.replace(/"/g, '""')}"`;
  return `${id},T,S,High,,,,,${cell},"[ERRORS label=q] errors[] empty",,,,,Automated`;
}

// ---- extractStepsCells: parser-independent by design -------------------------------

test("picks the Steps column out of a quoted 15-column row", () => {
  const cells = extractStepsCells([HEADER, row("A-001", "[GQL-OP q]\nquery { me { id } }")].join("\n"));
  assert.equal(cells.length, 1);
  assert.match(cells[0], /\[GQL-OP q\]/);
});

test("skips the header row rather than treating 'Steps' as a cell", () => {
  const cells = extractStepsCells([HEADER, row("A-001", "[NAV] go")].join("\n"));
  assert.deepEqual(cells, ["[NAV] go"]);
});

test("handles embedded newlines, commas and doubled quotes inside a cell", () => {
  const steps = '[GQL-OP q]\nquery { productConfiguration(id: ""abc"", a: 1, b: 2) { id } }\n[GQL-EXEC q]';
  const cells = extractStepsCells([HEADER, row("A-001", steps)].join("\n"));
  assert.equal(cells.length, 1, "an embedded newline must not split the record");
  assert.match(cells[0], /"abc"/, "a doubled quote must unescape to one");
  assert.match(cells[0], /a: 1, b: 2/, "an embedded comma must not split the field");
});

test("a UTF-8 BOM does not break extraction", () => {
  const cells = extractStepsCells(["﻿" + HEADER, row("A-001", "[NAV] go")].join("\n"));
  assert.deepEqual(cells, ["[NAV] go"]);
});

test("a row with too few fields yields nothing instead of a wrong cell", () => {
  // The legacy 11-column schema's 9th field is `References`, not `Steps`.
  const legacy = ["ID,Title,Section,Type,Priority,Estimate,Preconditions,Steps,Expected Result,References,Automation Status",
    "CORE-001,Add unit,Mass,Functional,High,2m,Admin logged in,1. Navigate,New value added,C242728,Katalon"].join("\n");
  const cells = extractStepsCells(legacy);
  // Field 8 of that row is "New value added" (Expected Result) — it must NOT be mistaken for
  // a runner-native Steps cell. Either way it carries no runner tag, so the suite is `browser`.
  assert.equal(isRunnerNative(legacy), false);
  assert.ok(!cells.some((c) => /\[GQL-OP/i.test(c)));
});

test("an empty CSV yields no cells and is not runner-native", () => {
  assert.deepEqual(extractStepsCells(""), []);
  assert.equal(isRunnerNative(""), false);
  assert.equal(isRunnerNative(HEADER), false, "a header-only file must not read as runner-native");
});

// ---- the strict rule ---------------------------------------------------------------

test("all-runner-native => fastpath", () => {
  const csv = [HEADER, row("A-001", "[GQL-OP q]\nquery{me{id}}\n[GQL-EXEC q]"), row("A-002", "[GQL-EXEC r]")].join("\n");
  assert.equal(isRunnerNative(csv), true);
  assert.equal(classifyLane({ file: csvFile(csv) }), "fastpath");
});

test("ONE non-runner case sends the whole suite to the browser lane (the 050d/050h rule)", () => {
  const csv = [
    HEADER,
    row("A-001", "[GQL-OP q]\nquery{me{id}}\n[GQL-EXEC q]"),
    row("A-002", "Sign in manually and eyeball the dashboard"), // no runner tag, no UI tag
  ].join("\n");
  assert.equal(isRunnerNative(csv), false, "a case the runner cannot parse must not be routed to it");
  assert.equal(classifyLane({ file: csvFile(csv) }), "browser");
});

test("a declared runner wins over the CSV contents", () => {
  const csv = [HEADER, row("A-001", "[NAV] go\n[ACT] click 'x'")].join("\n");
  assert.equal(classifyLane({ file: csvFile(csv), runner: "layout-runner" }), "deterministic");
});

test("a missing CSV degrades to the browser lane, never to a runner", () => {
  assert.equal(classifyLane({ file: join(scratch, "absent.csv") }), "browser");
});

// ---- agreement with the real corpus ------------------------------------------------

const manifest = JSON.parse(readFileSync("config/test-suites.json", "utf-8")) as {
  suites: Array<{ id: string; file: string; name: string; runner?: string; testCount: number }>;
};

function lanes() {
  const out = { browser: [] as string[], fastpath: [] as string[], deterministic: [] as string[] };
  for (const s of manifest.suites) out[classifyLane(s)].push(s.id);
  return out;
}

test("048c is the deterministic lane, and it is the only one today", () => {
  assert.deepEqual(lanes().deterministic, ["048c"]);
});

test("the GraphQL suites land in the fastpath lane, off the browser pool", () => {
  const fast = new Set(lanes().fastpath);
  for (const id of ["050a", "050i", "050m", "050j", "050l", "086", "075c"]) {
    assert.ok(fast.has(id), `${id} should be runner-native fastpath`);
  }
  assert.ok(fast.size >= 12, `expected a meaningful fastpath lane, got ${fast.size} suites`);
});

test("the known MIXED suites stay on the browser lane under the strict rule", () => {
  const browser = new Set(lanes().browser);
  // Each of these holds runner-native rows AND at least one that is not — the 188-row cost
  // the strict rule knowingly pays until per-case routing lands.
  for (const id of ["050d", "050h", "027b", "075b", "087"]) {
    assert.ok(browser.has(id), `${id} is mixed and must not be handed wholesale to the runner`);
  }
});

test("storefront suites are never classified as runner-native", () => {
  const fast = new Set(lanes().fastpath);
  for (const id of ["001", "011", "028", "042"]) {
    if (!manifest.suites.some((s) => s.id === id)) continue;
    assert.ok(!fast.has(id), `${id} is a storefront suite and cannot run without a browser`);
  }
});

test("the lane split takes real load off the browser pool", () => {
  const l = lanes();
  const cases = (ids: string[]) =>
    ids.reduce((sum, id) => sum + (manifest.suites.find((s) => s.id === id)?.testCount ?? 0), 0);
  const offloaded = cases(l.fastpath) + cases(l.deterministic);
  assert.ok(offloaded >= 300, `expected >= 300 cases off the browser lane, got ${offloaded}`);
  assert.ok(l.browser.length > 0, "there must still be a browser lane");
});
