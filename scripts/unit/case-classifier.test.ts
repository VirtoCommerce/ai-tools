// Unit tests for scripts/lib/case-classifier.ts — the per-case lane decision.
//
// The expensive failure this guards is one-directional. Routing a machine-ready row to the
// browser costs wall-clock. Routing a row the runner CANNOT parse to the runner produces a
// BLOCKED that reads as a product failure — the runner reports a verdict on a subset of the
// case's own steps, and nobody can tell from the report. So most of these tests assert
// FAIL-CLOSED: on any doubt the answer must be `browser`, which is the status quo.
//
// Run: `npx tsx --test scripts/unit/case-classifier.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  blockerHistogram,
  classifyCase,
  classifySuiteCases,
  CLASSIFIER_VERSION,
  isUiReady,
  type ClassifiableRow,
} from "../lib/case-classifier.ts";
import { isCanonicalHeader, parseSuite } from "../test-cases/append-test-cases-to-suite.ts";
import { loadManifest } from "../../ci/lib/suite-manifest.ts";
import { classifyLane } from "../../ci/lib/lane-classifier.ts";

/**
 * A minimal runner-native case, in the grammar the runner actually parses (see the
 * gold-standard suite 050i): the op tag stands alone and the query follows on indented
 * lines; assertions carry `label=`.
 */
function machineRow(over: Partial<ClassifiableRow> = {}): ClassifiableRow {
  return {
    ID: "GQL-001",
    Steps: ["[GQL-OP cart]", "  query { cart { id itemsQuantity } }", "[GQL-EXEC cart]"].join("\n"),
    Assertions: "[ERRORS label=cart] errors[] empty",
    Automation_Status: "Automated",
    ...over,
  };
}

const codesOf = (row: ClassifiableRow) => classifyCase(row).blockers.map((b) => b.code);

// ---- the happy path ----------------------------------------------------------------

test("a fully runner-native case routes to the machine lane with no blockers", () => {
  const v = classifyCase(machineRow());
  assert.equal(v.lane, "machine");
  assert.deepEqual(v.blockers, [], "a machine verdict must carry no blockers");
  assert.equal(v.id, "GQL-001");
});

test("blockers are empty EXACTLY when the lane is machine", () => {
  // The invariant the rest of the pipeline relies on to explain itself.
  const rows = [
    machineRow(),
    machineRow({ Steps: "[ACT] click the 'Sign up' button" }),
    machineRow({ Automation_Status: "Manual" }),
    machineRow({ Steps: "" }),
  ];
  for (const r of rows) {
    const v = classifyCase(r);
    assert.equal(v.blockers.length === 0, v.lane === "machine", `${v.lane} with ${v.blockers.length} blockers`);
  }
});

// ---- each blocker code -------------------------------------------------------------

test("EX-200: an explicit Manual is respected, not overruled by the compiler", () => {
  // Suite 050h's WISH-009 is the worked example: a human decided a person runs it. A
  // classifier that "knows better" here silently deletes that decision.
  const v = classifyCase(machineRow({ Automation_Status: "Manual" }));
  assert.equal(v.lane, "manual");
  assert.deepEqual(codesOf(machineRow({ Automation_Status: "Manual" })), ["EX-200"]);
  // Case-insensitive, whitespace-tolerant — the column has 23 distinct values in the corpus.
  assert.equal(classifyCase(machineRow({ Automation_Status: "  manual " })).lane, "manual");
  // But only the EXACT value opts out. Free text that merely contains it does not.
  assert.notEqual(classifyCase(machineRow({ Automation_Status: "Draft (was Manual)" })).lane, "manual");
});

test("EX-201: an explicit Deprecated is excluded from BOTH lanes, not executed", () => {
  // Measured failure, 050m in REG-2026-08-26-1631: three Deprecated rows were dispatched and
  // scored like live cases. SR-GQL-053 ("UNREACHABLE at API layer") FAILed against the suite's
  // pass rate and was triaged as a fixable assertion defect; SR-GQL-029 ("statuses[] arg
  // removed") and SR-GQL-038 "PASSed" while asserting nothing anyone intends to support.
  const v = classifyCase(machineRow({ Automation_Status: "Deprecated" }));
  assert.equal(v.lane, "deprecated", "a retired case must not be dispatched to a runner OR an agent");
  assert.deepEqual(v.blockers.map((b) => b.code), ["EX-201"]);
  assert.match(v.blockers[0].detail, /Deprecated/, "it must carry its reason, never a bare exclusion");
  assert.equal(v.family, "none", "family is not judged: the row's grammar is never parsed");
  // Whitespace/case tolerance matches EX-200 — the corpus ratchet normalises spellings, and a
  // lowercase `deprecated` was one of the 39 case-variants it fixed.
  assert.equal(classifyCase(machineRow({ Automation_Status: " deprecated " })).lane, "deprecated");
});

test("EX-201 is EXACT-match only — excluding a case runs against fail-closed", () => {
  // Every other doubt in this module routes to `browser`, which costs a slot and no coverage.
  // This one direction DELETES coverage, so a fuzzy match here is the expensive kind of wrong:
  // a live case whose status merely mentions the word would silently stop being tested.
  for (const status of [
    "Deprecated pending review",
    "Not Deprecated",
    "Draft (was Deprecated)",
    "Semi-Automated",
    "Quarantined",
  ]) {
    const v = classifyCase(machineRow({ Automation_Status: status }));
    assert.notEqual(v.lane, "deprecated", `"${status}" must fall through to the compiler`);
    assert.equal(v.lane, "machine", `"${status}" is a runner-native case and must still run`);
  }
});

test("Manual and Deprecated stay SEPARATE lanes — one expects a human, the other nobody", () => {
  // Folding Deprecated into `manual` would make the manual count (838 corpus-wide, quoted in
  // the burn-down) claim a person is expected to run a retired case. Same rule that keeps
  // UNROUTABLE out of `browser`.
  const rows: ClassifiableRow[] = [
    machineRow({ ID: "A-001" }),
    machineRow({ ID: "A-002", Automation_Status: "Manual" }),
    machineRow({ ID: "A-003", Automation_Status: "Deprecated" }),
    machineRow({ ID: "A-004", Steps: "[ACT] click the 'Sign up' button" }),
  ];
  const r = classifySuiteCases(rows);
  assert.deepEqual(r.machine, ["A-001"]);
  assert.deepEqual(r.manual, ["A-002"]);
  assert.deepEqual(r.deprecated, ["A-003"]);
  assert.deepEqual(r.browser, ["A-004"]);
  // Exhaustive: the merger derives its planned set from these four lists, so a case in none of
  // them would be a case nothing can report on.
  assert.equal(
    r.machine.length + r.browser.length + r.manual.length + r.deprecated.length,
    rows.length,
    "every case lands in exactly one lane",
  );
});

test("the corpus's Deprecated cases are all excluded, and none of them is silent", () => {
  // Derived, not pinned to 050m: a test naming a suite goes red when someone fixes that suite.
  // What must hold is that no `Deprecated` row anywhere is left executable, and that every one
  // carries EX-201 so the lanes file can explain the exclusion.
  let seen = 0;
  for (const suite of loadManifest().suites) {
    if (!existsSync(suite.file)) continue;
    const raw = readFileSync(suite.file, "utf-8").replace(/^﻿/, "");
    if (!isCanonicalHeader(raw)) continue;
    let rows;
    try {
      rows = parseSuite(raw).rows;
    } catch {
      continue;
    }
    for (const row of rows) {
      if ((row.Automation_Status ?? "").trim().toLowerCase() !== "deprecated") continue;
      seen++;
      const v = classifyCase(row as never);
      assert.equal(v.lane, "deprecated", `${suite.id} ${row.ID} is retired but still routable`);
      assert.deepEqual(v.blockers.map((b) => b.code), ["EX-201"], `${suite.id} ${row.ID}`);
    }
  }
  assert.ok(seen > 0, "no Deprecated case in the corpus — retire this test or point it at a fixture");
});

test("EX-002: an empty Steps cell is browser, never machine", () => {
  assert.deepEqual(codesOf(machineRow({ Steps: "   " })), ["EX-002"]);
  assert.equal(classifyCase(machineRow({ Steps: "" })).lane, "browser");
});

test("browser prose stays on the browser lane — whichever grammar judges it", () => {
  // This input has [NAV]/[ACT] drivers, so since classifier 1.1.0 it is judged by the UI grammar
  // and blocks on its prose operands (EX-010/EX-102) rather than on "no runner op" (EX-011).
  // The lane is what this test is about; asserting the specific code here was asserting the
  // mechanism, and the mechanism moved for a good reason.
  const v = classifyCase(
    machineRow({ Steps: "[NAV] {{FRONT_URL}}/cart\n[ACT] click 'Checkout'", Assertions: "[DOM] order confirmation visible" }),
  );
  assert.equal(v.lane, "browser");
  assert.equal(v.family, "ui");
  assert.ok(v.blockers.length > 0);
  assert.equal(isUiReady(v), false);
});

test("EX-011: a case with NO driver tag of either family is untyped prose", () => {
  // The genuine EX-011 shape: nothing to execute in either grammar. This is the corpus's 84%.
  const v = classifyCase(
    machineRow({ Steps: "Open the cart page\nClick Checkout", Assertions: "order confirmation visible" }),
  );
  assert.equal(v.lane, "browser");
  assert.equal(v.family, "gql", "no UI driver, so it falls through to the GraphQL grammar");
  assert.ok(v.blockers.some((b) => b.code === "EX-011"), JSON.stringify(v.blockers));
});

test("EX-010: a step line the executor's parser cannot type blocks the case", () => {
  // The runner would skip the line silently and then report a verdict on the rest — the
  // case would look decided when it was only partly executed.
  const v = classifyCase(
    machineRow({ Steps: "[GQL-OP c]\n  query { cart { id } }\n[GQL-EXEC c]\n[TOTALLY-MADE-UP] do a thing" }),
  );
  assert.equal(v.lane, "browser");
  assert.ok(v.blockers.some((b) => b.code === "EX-010"), JSON.stringify(v.blockers));
});

test("EX-003: structurally invalid op blocks are caught by the executor's own validator", () => {
  // A [GQL-OP] with no matching [GQL-EXEC] never sends anything.
  const v = classifyCase(machineRow({ Steps: "[GQL-OP cart]\n  query { cart { id } }" }));
  assert.equal(v.lane, "browser");
  assert.ok(v.blockers.some((b) => b.code === "EX-003"), JSON.stringify(v.blockers));
});

test("EX-101: a case with nothing scoreable to assert can never be machine", () => {
  // `layout-runner.ts`'s rule, applied one step earlier: silence is never a pass. The
  // runner's verdict is `failed === 0 && results.length > 0`, so a case with zero parsed
  // assertions would otherwise be judged by nothing at all.
  const v = classifyCase(machineRow({ Assertions: "" }));
  assert.equal(v.lane, "browser");
  assert.ok(v.blockers.some((b) => b.code === "EX-101"));
});

test("EX-102: ONE prose assertion among scoreable ones is enough to block", () => {
  // This is the rule most worth being strict about. The runner would score the parseable
  // predicate, find nothing failed, and return PASS — a green earned by not understanding
  // the other assertions.
  const v = classifyCase(
    machineRow({
      Assertions: "[ERRORS label=cart] errors[] empty\n[DATA label=cart] the cart looks about right to a human",
    }),
  );
  assert.equal(v.lane, "browser", "a mixed assertion block must not be machine-executed");
  assert.ok(v.blockers.some((b) => b.code === "EX-102"), JSON.stringify(v.blockers));
});

test("a blocker's detail names the offending token, so a burn-down is actionable", () => {
  const v = classifyCase(machineRow({ Steps: "[GQL-OP c]\n  q\n[GQL-EXEC c]\n[NOPE] x" }));
  const b = v.blockers.find((x) => x.code === "EX-010")!;
  assert.ok(b.detail.length > 0, "a blocker with no detail cannot be acted on");
  assert.ok(/NOPE/i.test(b.detail), `detail should name the tag, got "${b.detail}"`);
});

// ---- suite-level shape -------------------------------------------------------------

test("classifySuiteCases partitions every case exactly once, in CSV order", () => {
  const rows: ClassifiableRow[] = [
    machineRow({ ID: "A-001" }),
    machineRow({ ID: "A-002", Automation_Status: "Manual" }),
    machineRow({ ID: "A-003", Steps: "[ACT] click 'x'" }),
    machineRow({ ID: "A-004" }),
  ];
  const r = classifySuiteCases(rows);
  assert.deepEqual(r.machine, ["A-001", "A-004"], "machine ids keep CSV order");
  assert.deepEqual(r.manual, ["A-002"]);
  assert.deepEqual(r.browser, ["A-003"]);
  assert.equal(r.machine.length + r.browser.length + r.manual.length, rows.length);
  assert.equal(r.verdicts.length, rows.length);
});

test("an empty suite classifies cleanly instead of throwing", () => {
  const r = classifySuiteCases([]);
  assert.deepEqual(r, { machine: [], browser: [], manual: [], deprecated: [], verdicts: [] });
});

test("blockerHistogram counts each case once per distinct code", () => {
  // Two EX-010s in one case is one case needing attention, not two.
  const row = machineRow({ Steps: "[GQL-OP c]\n  q\n[GQL-EXEC c]\n[NOPE] a\n[ALSO-NOPE] b" });
  const h = blockerHistogram([classifyCase(row)]);
  assert.deepEqual(h, [{ code: "EX-010", count: 1 }]);
});

test("CLASSIFIER_VERSION is a semver string — a lanes file records it to detect staleness", () => {
  assert.match(CLASSIFIER_VERSION, /^\d+\.\d+\.\d+$/);
});

// ---- against the real corpus -------------------------------------------------------
//
// These are the numbers the whole change exists for. Asserted against the actual suites so
// a regression in the classifier shows up as a drop in routable rows rather than as a
// quieter run nobody questions.

const manifest = loadManifest();

function classifyRealSuite(file: string) {
  const parsed = parseSuite(readFileSync(file, "utf-8").replace(/^﻿/, ""));
  return classifySuiteCases(parsed.rows as unknown as ClassifiableRow[]);
}

test("the corpus has a meaningful machine-executable share", () => {
  let cases = 0;
  let machine = 0;
  for (const s of manifest.suites) {
    let r;
    try { r = classifyRealSuite(s.file); } catch { continue; }
    cases += r.verdicts.length;
    machine += r.machine.length;
  }
  assert.ok(cases > 4000, `expected the full corpus, saw ${cases} cases`);
  assert.ok(
    machine >= 520,
    `machine-executable rows dropped to ${machine} of ${cases} — the classifier got stricter, or cases regressed`,
  );
});

test("mixed suites strand machine-ready rows on the browser lane — the thing this fixes", () => {
  let stranded = 0;
  const suites: string[] = [];
  for (const s of manifest.suites) {
    if (classifyLane(s) !== "browser") continue; // already on a machine lane
    let r;
    try { r = classifyRealSuite(s.file); } catch { continue; }
    if (r.machine.length > 0) {
      stranded += r.machine.length;
      suites.push(s.id);
    }
  }
  assert.ok(stranded >= 150, `expected >= 150 stranded rows, found ${stranded} in ${suites.join(",")}`);
  assert.ok(suites.includes("050d") && suites.includes("050h"), `expected the known mixed suites, got ${suites}`);
});

test("050d agrees with the human judgement recorded in REG-2026-08-24-1806", () => {
  // That run's notes put 050d on the browser lane by hand, with the reason: 46 of its 49
  // cases are runner-native and 3 are not. The classifier must reach the same split — this
  // is the one place the corpus records a person doing this job correctly.
  const suite = manifest.suites.find((s) => s.id === "050d")!;
  const r = classifyRealSuite(suite.file);
  assert.equal(r.machine.length, 46, "050d's machine count no longer matches the recorded human split");
  assert.equal(r.browser.length + r.manual.length, 3);
});

test("087 has no browser cases at all — a whole suite can leave the browser pool", () => {
  // 12 machine + 3 explicitly Manual. Under the all-or-nothing suite rule this occupies a
  // browser slot to run zero browser cases.
  const suite = manifest.suites.find((s) => s.id === "087")!;
  const r = classifyRealSuite(suite.file);
  assert.equal(r.browser.length, 0, "087 gained a browser case — it can no longer skip the browser pool");
  assert.ok(r.machine.length >= 12);
  assert.ok(r.manual.length >= 1, "its Manual cases must still be reported, never silently dropped");
});

// =============================================================================================
// The UI family (classifier 1.1.0)
// =============================================================================================

test("family: a case with a UI driver is judged against the UI grammar, not the GraphQL one", () => {
  const v = classifyCase({
    ID: "UI-001",
    Steps: "[NAV] {{FRONT_URL}}/cart\n[ACT] click role=button name='Checkout'",
    Assertions: "[DOM] css='.vc-checkout' visible",
  });
  assert.equal(v.family, "ui");
});

test("family: a GraphQL-only case is unaffected — no reclassification", () => {
  const v = classifyCase(machineRow());
  assert.equal(v.family, "gql");
  assert.equal(v.lane, "machine", "and it still reaches the machine lane");
});

test("family: a UI driver WINS over GraphQL steps — that is the intended shape", () => {
  // State setup through xAPI, verification through the DOM. A case doing both is a UI case.
  const v = classifyCase({
    ID: "UI-002",
    Steps: [
      "[GQL-OP seed]",
      "  mutation { addItem { id } }",
      "[GQL-EXEC seed]",
      "[NAV] {{FRONT_URL}}/cart",
      "[ACT] click role=button name='Checkout'",
    ].join("\n"),
    Assertions: "[DOM] css='.vc-checkout' visible",
  });
  assert.equal(v.family, "ui");
  assert.equal(isUiReady(v), true, "the GraphQL half is delegated, not re-parsed, so it compiles");
});

test("GUARD: a compiling UI case is NEVER lane 'machine' while no ui-runner exists", () => {
  // machine-lane.ts dispatches every lane==="machine" case to `graphql-runner --case`. Calling a
  // UI case machine today would send it to a runner that cannot parse it — a BLOCKED that reads
  // as a product failure. This is the single most important assertion in this block.
  const v = classifyCase({
    ID: "UI-003",
    Steps: "[NAV] {{FRONT_URL}}/cart\n[ACT] click role=button name='Checkout'",
    Assertions: "[DOM] css='.vc-checkout' visible",
  });
  assert.equal(v.lane, "browser");
  assert.deepEqual(v.blockers.map((b) => b.code), ["EX-300"]);
  assert.equal(isUiReady(v), true);
});

test("isUiReady is false for a UI case that does not compile", () => {
  const v = classifyCase({
    ID: "UI-004",
    Steps: "[NAV] {{FRONT_URL}}/cart\n[WAIT] the cart drawer opens eventually",
    Assertions: "[DOM] cart looks right",
  });
  assert.equal(v.family, "ui");
  assert.equal(isUiReady(v), false);
  assert.ok(v.blockers.length > 1, "several blockers, not the single EX-300");
});

test("isUiReady is false for a GraphQL case, however clean", () => {
  const v = classifyCase(machineRow());
  assert.equal(v.lane, "machine");
  assert.equal(isUiReady(v), false);
});

test("UI: an untypeable step line blocks with EX-010 and its reason", () => {
  const v = classifyCase({
    ID: "UI-005",
    Steps: "[NAV] {{FRONT_URL}}\n[ACT] click the hero banner primary CTA",
    Assertions: "[DOM] css='.x' visible",
  });
  assert.ok(v.blockers.some((b) => b.code === "EX-010"), JSON.stringify(v.blockers));
});

test("UI: EVERY assertion must be scoreable, not one of them", () => {
  // Same rule as the GraphQL branch and for the same reason: a runner whose verdict is
  // "failed === 0 && results.length > 0" would PASS this on the strength of the first line.
  const v = classifyCase({
    ID: "UI-006",
    Steps: "[NAV] {{FRONT_URL}}\n[ACT] click role=link name='Cart'",
    Assertions: "[DOM] css='.a' visible\n[DOM] the totals look plausible",
  });
  assert.ok(v.blockers.some((b) => b.code === "EX-102"), JSON.stringify(v.blockers));
  assert.equal(isUiReady(v), false);
});

test("UI: a [STATE] assertion is scored by the GraphQL scorer, not assumed", () => {
  // Delegation is the point — this module must not grow a second predicate language, and it
  // must not wave a [STATE] line through either.
  const prose = classifyCase({
    ID: "UI-007",
    Steps: "[NAV] {{FRONT_URL}}\n[ACT] click role=link name='Cart'",
    Assertions: "[STATE] the user seems to have a cart",
  });
  assert.ok(prose.blockers.some((b) => b.code === "EX-102"), JSON.stringify(prose.blockers));
});

test("UI: no assertions at all is EX-101, never a silent pass", () => {
  const v = classifyCase({
    ID: "UI-008",
    Steps: "[NAV] {{FRONT_URL}}\n[ACT] click role=link name='Cart'",
    Assertions: "",
  });
  assert.ok(v.blockers.some((b) => b.code === "EX-101"), JSON.stringify(v.blockers));
});

test("UI: a structural problem is EX-003 and is not double-counted with EX-010", () => {
  // validateUiSteps repeats each UNKNOWN reason; the classifier must not report one bad line
  // twice under two codes, or the histogram overstates the backlog.
  const v = classifyCase({
    ID: "UI-009",
    Steps: "[NAV] {{FRONT_URL}}\n[ACT] click role=link name='Cart'\n[ACT] fill label='Email' = '{{reg_email}}'",
    Assertions: "[DOM] css='.a' visible",
  });
  const ex003 = v.blockers.filter((b) => b.code === "EX-003");
  const ex010 = v.blockers.filter((b) => b.code === "EX-010");
  assert.equal(ex010.length, 0, "every line typed");
  assert.equal(ex003.length, 1, JSON.stringify(v.blockers));
  assert.match(ex003[0].detail, /\{\{reg_email\}\} is used but no \[SETUP\] declares it/);
});

test("Manual still wins over every grammar", () => {
  const v = classifyCase({
    ID: "UI-010",
    Steps: "[NAV] {{FRONT_URL}}\n[ACT] click role=link name='Cart'",
    Assertions: "[DOM] css='.a' visible",
    Automation_Status: "Manual",
  });
  assert.equal(v.lane, "manual");
  assert.equal(v.family, "none");
  assert.deepEqual(v.blockers.map((b) => b.code), ["EX-200"]);
});

test("CORPUS: 768 cases are UI-family and ZERO compile — the authoring bottleneck, as a number", () => {
  // This is the measurement that reorders stage C: a ui-runner built today would execute nothing.
  // If `ready` ever becomes non-zero without a suite being re-authored, the grammar got too
  // permissive; if `family` collapses, the family detection broke.
  const files = manifest.suites.map((x) => x.file).filter((f) => existsSync(f));
  if (files.length === 0) return;
  let family = 0;
  let ready = 0;
  for (const file of files) {
    const raw = readFileSync(file, "utf-8");
    if (!isCanonicalHeader(raw)) continue;
    for (const row of parseSuite(raw).rows) {
      if (!row.ID) continue;
      const v = classifyCase({
        ID: row.ID,
        Steps: row.Steps ?? "",
        Assertions: row.Assertions ?? "",
        Automation_Status: row.Automation_Status,
      });
      if (v.family !== "ui") continue;
      family++;
      if (isUiReady(v)) ready++;
    }
  }
  assert.ok(family > 700, `expected >700 UI-family cases, got ${family}`);
  assert.equal(ready, 0, "no suite is authored into the UI grammar yet");
});

test("family: a UI case written entirely in prose is still UI-family, not GraphQL", () => {
  // Regression: family used to be decided from a SUCCESSFUL parse, so 042's SMK-013/014/015/034
  // — checkout, payment x2 and GA4, the cases most in need of authoring — were filed under the
  // GraphQL grammar and reported with its blocker codes. The tag decides the family.
  const v = classifyCase({
    ID: "SMK-013-like",
    Steps: "[WAIT] cart page with payment section visible\n[ACT] complete the card form per SMK-014\n[ACT] click 'Place Order'",
    Assertions: "[DOM] order confirmation visible",
  });
  assert.equal(v.family, "ui");
  assert.equal(v.lane, "browser");
  assert.ok(v.blockers.some((b) => b.code === "EX-010"), JSON.stringify(v.blockers));
});

test("CORPUS: no case that reaches the machine lane was reclassified into the UI family", () => {
  // The guard on the guard. A GraphQL case carrying an [ACT] tag would now be judged by the UI
  // grammar and could LOSE its machine status — a silent determinism regression the per-suite
  // ratchet would only catch in aggregate.
  const files = manifest.suites.map((x) => x.file).filter((f) => existsSync(f));
  for (const file of files) {
    const raw = readFileSync(file, "utf-8");
    if (!isCanonicalHeader(raw)) continue;
    for (const row of parseSuite(raw).rows) {
      if (!row.ID) continue;
      const v = classifyCase({
        ID: row.ID,
        Steps: row.Steps ?? "",
        Assertions: row.Assertions ?? "",
        Automation_Status: row.Automation_Status,
      });
      if (v.lane === "machine") {
        assert.equal(v.family, "gql", `${row.ID} in ${file} reached the machine lane as family=${v.family}`);
      }
    }
  }
});
