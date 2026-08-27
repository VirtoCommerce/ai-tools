// Unit tests for the Automation_Status corpus ratchet in scripts/test-cases/sync-test-suites.ts.
//
// The vocabulary was never undeclared: `AUTOMATION_STATUSES` has always lived in
// `lint-test-cases.ts` and S-006 has always flagged anything outside it. What was missing was
// enforcement ACROSS the corpus — that linter runs per file and nothing ran it over all 127
// suites — so 22 distinct values accumulated behind a rule that was already written down.
//
// It stopped being cosmetic when per-case lane routing started reading the column: an exact
// `Manual` is an explicit opt-out (case-classifier.ts EX-200), and so is an exact
// `Deprecated` (EX-201 — dispatched to neither lane). A value that only LOOKS
// canonical therefore routes differently from the one it appears to be, which is why a
// case-variant is fatal with no baseline while the 325 semantic stragglers are ratcheted.
//
// Tested against a FIXTURE corpus, not only the real one: a ratchet whose sole test is "the
// repo is currently clean" passes just as happily when the check does nothing.
//
// Run: `npx tsx --test scripts/unit/automation-status-ratchet.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findAutomationStatusDrift } from "../test-cases/sync-test-suites.ts";
import { AUTOMATION_STATUSES } from "../test-cases/lint-test-cases.ts";
import { COLUMNS } from "../test-cases/append-test-cases-to-suite.ts";

const scratch = mkdtempSync(join(tmpdir(), "status-ratchet-"));
let seq = 0;

/** A fixture corpus of one suite whose rows carry the given statuses. */
function corpusWith(statuses: string[], header: readonly string[] = COLUMNS): string {
  const root = join(scratch, `c${seq++}`);
  mkdirSync(root, { recursive: true });
  const rows = statuses.map((s, i) => {
    const cells = header.map(() => "x");
    cells[0] = `X-${String(i + 1).padStart(3, "0")}`;
    cells[header.length - 1] = s;
    return cells.join(",");
  });
  writeFileSync(join(root, "001-fixture.csv"), [header.join(","), ...rows].join("\n") + "\n");
  return root;
}

// ---- the canonical vocabulary is shared, not copied -------------------------------

test("the ratchet reads the SAME set the per-file linter declares", () => {
  // Two copies of a vocabulary is how two enforcers come to disagree.
  for (const v of ["Draft", "Reviewed", "Automated", "Manual", "Semi-Automated", "Deprecated"]) {
    assert.ok(AUTOMATION_STATUSES.has(v), `${v} missing from the declared vocabulary`);
  }
});

test("canonical values and an empty value produce no drift", () => {
  const root = corpusWith([...AUTOMATION_STATUSES, ""]);
  const d = findAutomationStatusDrift(root);
  assert.deepEqual(d.caseVariants, []);
  assert.deepEqual(d.newOrGrown, []);
});

// ---- case-variants: fatal, never baselined ---------------------------------------

test("a case-variant of a canonical value is reported with the value it should be", () => {
  const d = findAutomationStatusDrift(corpusWith(["manual", "manual", "Draft"]));
  assert.equal(d.caseVariants.length, 1, JSON.stringify(d));
  assert.equal(d.caseVariants[0].value, "manual");
  assert.equal(d.caseVariants[0].canonical, "Manual");
  assert.equal(d.caseVariants[0].count, 2);
  assert.deepEqual(d.newOrGrown, [], "a case-variant is not ALSO a new value");
});

test("every canonical value's lowercase form is caught, not just Manual", () => {
  for (const canonical of AUTOMATION_STATUSES) {
    const variant = canonical.toLowerCase();
    if (variant === canonical) continue;
    const d = findAutomationStatusDrift(corpusWith([variant]));
    assert.equal(d.caseVariants[0]?.canonical, canonical, `${variant} not mapped to ${canonical}`);
  }
});

// ---- the ratchet on semantic values ----------------------------------------------

test("an unlisted non-canonical value is reported as new, with allowed 0", () => {
  const d = findAutomationStatusDrift(corpusWith(["totally-invented"]));
  assert.deepEqual(d.newOrGrown, [{ value: "totally-invented", count: 1, allowed: 0 }]);
});

test("a baselined value AT its baseline count is clean", () => {
  // `Quarantined` is baselined at 11.
  const d = findAutomationStatusDrift(corpusWith(Array(11).fill("Quarantined")));
  assert.deepEqual(d.newOrGrown, []);
  assert.deepEqual(d.caseVariants, []);
});

test("a baselined value ABOVE its baseline is reported — the ratchet direction", () => {
  const d = findAutomationStatusDrift(corpusWith(Array(12).fill("Quarantined")));
  assert.deepEqual(d.newOrGrown, [{ value: "Quarantined", count: 12, allowed: 11 }]);
});

test("a baselined value BELOW its baseline is progress, not a failure", () => {
  const d = findAutomationStatusDrift(corpusWith(["Quarantined"]));
  assert.deepEqual(d.newOrGrown, []);
  const shrunk = d.shrunk.find((s) => s.value === "Quarantined");
  assert.deepEqual(shrunk, { value: "Quarantined", count: 1, allowed: 11 });
});

// ---- the legacy-header refusal ---------------------------------------------------

test("a legacy 11-column suite is SKIPPED, not scored on the wrong column", () => {
  // `parseSuite` maps positionally, so on an 11-column file index 14 is not this column at
  // all. Reading it would invent violations out of whatever happens to sit there.
  const legacy = ["ID", "Title", "Section", "Priority", "Type", "Estimate", "Preconditions", "Steps", "Expected Result", "References", "Automation_Status"];
  const d = findAutomationStatusDrift(corpusWith(["totally-invented"], legacy));
  assert.deepEqual(d.newOrGrown, [], "a legacy-header suite must contribute nothing");
  assert.deepEqual(d.caseVariants, []);
});

test("an unparsable suite is skipped rather than throwing", () => {
  const root = join(scratch, "broken");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "001-broken.csv"), `${COLUMNS.join(",")}\nX-001,"unclosed quote\n`);
  assert.doesNotThrow(() => findAutomationStatusDrift(root));
});

// ---- against the real corpus -----------------------------------------------------

test("the real corpus has ZERO case-variants — the state now enforced", () => {
  const d = findAutomationStatusDrift();
  assert.deepEqual(
    d.caseVariants,
    [],
    `case-variant(s) reappeared: ${d.caseVariants.map((v) => `${v.value}->${v.canonical}`).join(", ")}`,
  );
});

test("the real corpus sits exactly at its baseline — no value new or grown", () => {
  const d = findAutomationStatusDrift();
  assert.deepEqual(
    d.newOrGrown,
    [],
    d.newOrGrown.map((v) => `${v.value}: ${v.count} > ${v.allowed}`).join(", "),
  );
});
