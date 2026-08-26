// Unit tests for scripts/test-cases/report-executability.ts — the reporting + ratchet layer
// over the per-case classifier.
//
// Two things are worth guarding here, and neither is the table itself:
//
//   1. The RATCHET must fail on a DROP and not on a gain. It answers a different question from
//      `suites:lint` ("did determinism regress?" vs "is the manifest in sync?"), so a change
//      that makes cases unroutable cannot ride in behind a routine `suites:sync`.
//   2. UNROUTABLE must never be silently folded into `browser`. A legacy 11-column suite is
//      not "a browser suite" — it is a suite nothing can classify, and counting it as browser
//      would hide 274 cases behind a number that looks like a deliberate choice.
//
// Run: `npx tsx --test scripts/unit/report-executability.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";

import { CLASSIFIER_VERSION } from "../lib/case-classifier.ts";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyseCorpus,
  analyseSuite,
  burnDownBuckets,
  describeRebaseline,
  findDeterminismDrops,
  totals,
} from "../test-cases/report-executability.ts";
import { COLUMNS } from "../test-cases/append-test-cases-to-suite.ts";
import { loadManifest } from "../../ci/lib/suite-manifest.ts";

const scratch = mkdtempSync(join(tmpdir(), "exec-report-"));
let seq = 0;

function suiteFile(rows: string[], header: readonly string[] = COLUMNS): string {
  const dir = join(scratch, `s${seq++}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "001-fixture.csv");
  writeFileSync(path, [header.join(","), ...rows].join("\n") + "\n");
  return path;
}

/** A runner-native row in the grammar the runner actually parses. */
function machineRow(id: string, status = "Automated"): string {
  const c = COLUMNS.map(() => "");
  c[0] = id;
  c[1] = "t";
  c[3] = "High";
  c[8] = `"[GQL-OP a]\n  query { cart { id } }\n[GQL-EXEC a]"`;
  c[9] = '"[ERRORS label=a] errors[] empty"';
  // Overridable so the Deprecated/Manual opt-outs can be exercised on a row that WOULD
  // otherwise be machine-executable — the whole point is that the status overrules the grammar.
  c[14] = status;
  return c.join(",");
}

function proseRow(id: string, status = "Draft"): string {
  const c = COLUMNS.map(() => "");
  c[0] = id;
  c[1] = "t";
  c[3] = "High";
  c[8] = "[ACT] click the sign-up button";
  c[9] = "[DOM] the page looks right to a human";
  c[14] = status;
  return c.join(",");
}

// ---- classification pass-through --------------------------------------------------

test("a mixed suite reports its split without folding anything together", () => {
  const r = analyseSuite({ id: "X", name: "x", file: suiteFile([machineRow("A-001"), proseRow("A-002"), proseRow("A-003", "Manual")]) });
  assert.equal(r.machine, 1);
  assert.equal(r.browser, 1);
  assert.equal(r.manual, 1);
  assert.equal(r.unroutable, 0);
});

test("a legacy 11-column suite is UNROUTABLE, never counted as browser", () => {
  // Counting it as browser would hide it behind a number that reads like a decision.
  const legacy = ["ID", "Title", "Section", "Priority", "Type", "Estimate", "Preconditions", "Steps", "Expected Result", "References", "Automation_Status"];
  const file = suiteFile(["LEG-001,t,s,High,Functional,5m,none,[GQL-OP x],ok,,Draft", "LEG-002,t,s,High,Functional,5m,none,[GQL-OP x],ok,,Draft"], legacy);
  const r = analyseSuite({ id: "X", name: "x", file });
  assert.equal(r.unroutable, 2);
  assert.equal(r.machine, 0);
  assert.equal(r.browser, 0, "an unclassifiable suite is not a browser suite");
});

test("a missing file contributes nothing rather than throwing", () => {
  const r = analyseSuite({ id: "X", name: "x", file: join(scratch, "does-not-exist.csv") });
  assert.deepEqual({ m: r.machine, b: r.browser, u: r.unroutable }, { m: 0, b: 0, u: 0 });
});

test("totals include unroutable in the denominator", () => {
  // Otherwise determinism would be computed against a corpus that quietly excludes the cases
  // nothing can read — flattering, and wrong.
  const t = totals([
    { id: "a", name: "", file: "", machine: 10, browser: 10, manual: 0, deprecated: 0, unroutable: 0, hasOwnRunner: false, verdicts: [] },
    { id: "b", name: "", file: "", machine: 0, browser: 0, manual: 0, deprecated: 0, unroutable: 20, hasOwnRunner: false, verdicts: [] },
  ]);
  assert.equal(t.cases, 40);
  assert.equal(t.determinismPct, 25);
});

// ---- burn-down buckets ------------------------------------------------------------

test("a prose-on-both-sides case lands in `both`, not in a cheap bucket", () => {
  const r = analyseSuite({ id: "X", name: "x", file: suiteFile([proseRow("A-001")]) });
  const b = burnDownBuckets([r]);
  assert.equal(b.both, 1);
  assert.equal(b.assertionsOnly, 0);
  assert.equal(b.stepsOnly, 0);
});

test("an explicitly Manual case is its own bucket — never counted as convertible backlog", () => {
  const r = analyseSuite({ id: "X", name: "x", file: suiteFile([proseRow("A-001", "Manual")]) });
  assert.equal(burnDownBuckets([r]).manual, 1);
});

test("a Deprecated case is its own bucket and its own count, never folded into Manual", () => {
  // Two different facts: `manual` is "a person runs this" (out of scope by intent), `deprecated`
  // is "nobody runs this" (out of scope by definition — converting one would be effort spent on
  // a case scheduled for deletion). Adding them would make both numbers unusable.
  const r = analyseSuite({
    id: "X",
    name: "x",
    file: suiteFile([machineRow("A-001"), proseRow("A-002", "Manual"), machineRow("A-003", "Deprecated")]),
  });
  assert.equal(r.machine, 1, "a retired row must NOT be counted as machine-executable");
  assert.equal(r.manual, 1);
  assert.equal(r.deprecated, 1);
  assert.equal(r.browser, 0);
  const b = burnDownBuckets([r]);
  assert.equal(b.deprecated, 1);
  assert.equal(b.manual, 1);
  assert.equal(b.assertionsOnly + b.stepsOnly + b.both, 0, "a retired case is never convertible backlog");
});

test("totals include deprecated in the denominator, so determinism is not flattered", () => {
  // Dropping retired cases out of `cases` entirely would RAISE the reported determinism
  // percentage — the same flattery the unroutable guard above exists to prevent.
  const t = totals([
    { id: "a", name: "", file: "", machine: 10, browser: 10, manual: 0, deprecated: 0, unroutable: 0, hasOwnRunner: false, verdicts: [] },
    { id: "b", name: "", file: "", machine: 0, browser: 0, manual: 0, deprecated: 20, unroutable: 0, hasOwnRunner: false, verdicts: [] },
  ]);
  assert.equal(t.cases, 40);
  assert.equal(t.deprecated, 20);
  assert.equal(t.determinismPct, 25);
});

test("the real corpus's cheap tranche is small — a finding, not an under-count", () => {
  // An earlier estimate put ~365 cases one assertion-rewrite away from determinism. That came
  // from a proxy metric (does the assertion CONTAIN a comparison operator) and does not
  // survive the executor's own parser: a storefront `[DOM] cart icon visible` can never be
  // scoreable by a GraphQL predicate scorer. The real figure is in the tens, which is why the
  // next gain has to come from a DOM grammar rather than an authoring push.
  const b = burnDownBuckets(analyseCorpus());
  assert.ok(
    b.assertionsOnly + b.stepsOnly < 200,
    `cheap tranche grew to ${b.assertionsOnly + b.stepsOnly} — if real, the burn-down text needs updating`,
  );
  assert.ok(b.both > 2000, `expected the bulk to be prose on both sides, got ${b.both}`);
});

// ---- the ratchet ------------------------------------------------------------------

/** See lane-planner.test.ts: a bare "npx" ENOENTs on win32, so run tsx's CLI via node. */
const TSX_CLI = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));

function runCheck() {
  return spawnSync(
    process.execPath,
    [TSX_CLI, join("scripts", "test-cases", "report-executability.ts"), "--check"],
    { encoding: "utf-8", env: process.env },
  );
}

test("--check passes when the manifest matches the live classification", () => {
  const r = runCheck();
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /machine-executable/);
});

test("the manifest's recorded lane counts agree with the live classifier", () => {
  // If they drift, `suites:lint` fails first — this asserts the two stay one answer, which is
  // the whole reason the counts are recorded rather than re-derived per consumer.
  const manifest = loadManifest();
  const live = new Map(analyseCorpus().map((r) => [r.id, r]));
  for (const s of manifest.suites) {
    const r = live.get(s.id);
    if (!r) continue;
    const recorded = s.lanes?.machine ?? 0;
    assert.equal(recorded, r.machine, `${s.id}: manifest says ${recorded} machine cases, classifier says ${r.machine}`);
  }
});

test("every suite the manifest credits with machine cases actually has some", () => {
  // Guards the present-only-when-nonzero convention: a `lanes` block on a pure-browser suite
  // would make the planner reserve a machine lane for nothing.
  const manifest = loadManifest();
  for (const s of manifest.suites) {
    if (!s.lanes) continue;
    assert.ok(s.lanes.machine > 0, `${s.id} carries a lanes block with zero machine cases`);
  }
});

// ---- the ratchet's decision, tested on a DROP -------------------------------------

test("a suite that LOST machine cases is a drop", () => {
  const { drops, gains } = findDeterminismDrops([{ id: "050d", machine: 40 }], new Map([["050d", 46]]));
  assert.deepEqual(drops, [{ id: "050d", was: 46, now: 40 }]);
  assert.deepEqual(gains, []);
});

test("a suite that GAINED machine cases is not a failure — determinism only ratchets up", () => {
  const { drops, gains } = findDeterminismDrops([{ id: "050d", machine: 49 }], new Map([["050d", 46]]));
  assert.deepEqual(drops, []);
  assert.deepEqual(gains, [{ id: "050d", was: 46, now: 49 }]);
});

test("an unchanged suite is neither", () => {
  const r = findDeterminismDrops([{ id: "050d", machine: 46 }], new Map([["050d", 46]]));
  assert.deepEqual(r, { drops: [], gains: [] });
});

test("a suite absent from the manifest counts as zero, so its first machine case is a gain", () => {
  const { gains } = findDeterminismDrops([{ id: "new", machine: 3 }], new Map());
  assert.deepEqual(gains, [{ id: "new", was: 0, now: 3 }]);
});

test("a suite whose machine cases fall to zero is still reported, not dropped from the list", () => {
  // The worst case: a suite leaves the machine lane entirely. If it vanished from the
  // comparison the loss would read as "that suite was always browser".
  const { drops } = findDeterminismDrops([{ id: "087", machine: 0 }], new Map([["087", 12]]));
  assert.deepEqual(drops, [{ id: "087", was: 12, now: 0 }]);
});

test("a suite with its own runner is NOT counted as UI authoring backlog", () => {
  // 048c declares `runner: layout-runner` and is already deterministic at the suite level, but
  // its steps carry 29 [NAV] lines alongside the layout grammar ([VIEWPORT], [PROBE:*], [SNAP],
  // [REFLOW]) — and [NAV] alone was enough to make the per-case family detector claim all 29 of
  // its cases as UI work needing authoring. They need none. The manifest is the authority here,
  // never the file's tags: the tags are exactly what produced the wrong answer.
  const uiVerdict = {
    id: "X-1",
    lane: "browser" as const,
    family: "ui" as const,
    blockers: [{ code: "EX-010" as const, detail: "" }],
  };
  const withRunner = totals([
    { id: "048c", name: "", file: "", machine: 0, browser: 1, manual: 0, deprecated: 0, unroutable: 0, hasOwnRunner: true, verdicts: [uiVerdict] },
  ]);
  assert.equal(withRunner.uiFamily, 0);

  const without = totals([
    { id: "042", name: "", file: "", machine: 0, browser: 1, manual: 0, deprecated: 0, unroutable: 0, hasOwnRunner: false, verdicts: [uiVerdict] },
  ]);
  assert.equal(without.uiFamily, 1);
});

test("the manifest records the classifier version its lane counts were measured under", () => {
  // Without this the ratchet cannot tell a determinism REGRESSION from a legitimate RE-BASELINE.
  // It compares live counts against the manifest, so a commit that changes the classifier AND
  // refreshes the counts lowers the baseline alongside the fact and the drop vanishes. That
  // happened on this branch: classifier 1.1.0 -> 1.2.0 with machine 559 -> 555, reported `OK`.
  const meta = (loadManifest() as unknown as { _meta: { classifierVersion?: string } })._meta;
  assert.equal(
    meta.classifierVersion,
    CLASSIFIER_VERSION,
    "run `npm run suites:sync` — the recorded classifier version must match the code's",
  );
});

test("an unchanged classifier says nothing — no noise on a routine run", () => {
  assert.deepEqual(describeRebaseline("1.2.0", "1.2.0", 555, 555), []);
});

test("a version bump that LOWERS the total says so, and names both numbers", () => {
  // The case that went silent on this branch: 1.1.0 -> 1.2.0, machine 559 -> 555.
  const lines = describeRebaseline("1.1.0", "1.2.0", 559, 555);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /classifier 1\.1\.0 -> 1\.2\.0: machine 559 -> 555 \(-4\)/);
  assert.match(lines[1], /re-baseline, not a caught regression/);
});

test("a version bump that RAISES the total is reported without the warning", () => {
  const lines = describeRebaseline("1.1.0", "1.2.0", 555, 559);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /machine 555 -> 559 \(\+4\)/);
});

test("an unrecorded baseline is named as such, not treated as a match", () => {
  // A manifest predating the stamp must not silently pass as though it agreed.
  const lines = describeRebaseline(undefined, "1.2.0", 555, 555);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /classifier unrecorded -> 1\.2\.0/);
});

test("reporting a re-baseline did NOT replace the gate — a per-suite drop still fails", () => {
  // The reporting is additive. findDeterminismDrops is what exits non-zero, and it still does.
  const { drops } = findDeterminismDrops(
    [{ id: "050m", machine: 116 }],
    new Map([["050m", 123]]),
  );
  assert.deepEqual(drops, [{ id: "050m", was: 123, now: 116 }]);
});
