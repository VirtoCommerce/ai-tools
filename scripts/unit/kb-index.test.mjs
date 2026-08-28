// The generated kb index and its drift gate (VCST-5818).
//
// knowledge-index.json is generated and never hand-edited; `--check` regenerates in
// memory and byte-compares. That only means something if the generator is deterministic,
// so the determinism assertion below is load-bearing, not a nicety: a timestamp anywhere
// in the output would make `--check` fail on every run and the gate would be switched off
// within a week.
//
// The citation scan reports three distinct things — citedBy, dangling, unparsable — and
// the last one matters most: a suite CSV the scan cannot read is ABSENT from the map in
// both directions, which would otherwise read as "clean" (the BLC-005 lesson from
// scripts/knowledge/lint-bl.ts).
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { KB_SUITES, copyRoot, withTempDir, kbModule } from "./_kb-helpers.mjs";

const { buildIndex, writeIndex, checkIndex, renderIndex, parseCsv, scanCitations } = await kbModule("gen-index.mjs");

const opts = { suites: KB_SUITES };

test("generate then --check is green; mutating a source entry makes --check fail", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    const written = writeIndex(root, opts);
    assert.equal(written.written, true);
    assert.equal(checkIndex(root, opts).ok, true);

    const entry = join(root, "confirmed", "BL-CART-010.md");
    appendFileSync(entry, "\nA sentence that was not there when the index was generated.\n", "utf8");
    const drifted = checkIndex(root, opts);
    assert.equal(drifted.ok, false);
    assert.match(drifted.reason, /stale/);

    writeIndex(root, opts);
    assert.equal(checkIndex(root, opts).ok, true);
  });
});

test("--check fails when the index is missing entirely, rather than passing vacuously", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    const res = checkIndex(root, opts);
    assert.equal(res.ok, false);
    assert.match(res.reason, /generated, never committed by hand/);
  });
});

test("the index is deterministic — no clock, no ordering wobble, no cwd", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    assert.equal(renderIndex(buildIndex(root, opts)), renderIndex(buildIndex(root, opts)));
    assert.equal(/\d{4}-\d{2}-\d{2}T\d{2}:/.test(renderIndex(buildIndex(root, opts))), false, "a timestamp would break the drift gate");

    // The same corpus must render identically from any working directory, or `--check`
    // reports drift that does not exist the first time CI runs from a different cwd.
    const rendered = renderIndex(buildIndex(root, opts));
    const previous = process.cwd();
    try {
      process.chdir(dir);
      assert.equal(renderIndex(buildIndex(root, { suites: opts.suites })), rendered);
    } finally {
      process.chdir(previous);
    }
  });
});

test("citedBy counts come from the Business_Rule / Edge_Case_Refs cells", async () => {
  await withTempDir(async (dir) => {
    const index = buildIndex(copyRoot("platform", join(dir, "platform")), opts);
    // KBF-001 and KBF-002 both cite BL-CART-010.
    assert.equal(index.entries["BL-CART-010"].citedBy, 2);
    assert.equal(index.entries["BL-CART-012"].citedBy, 1);
    assert.equal(index.entries["BL-AUTH-004"].citedBy, 1);
    assert.equal(index.entries["LOC-PDP-002"].citedBy, 1);
    // Cited from an Edge_Case_Refs cell, not a Business_Rule cell — both columns count.
    assert.equal(index.entries["FLOW-CHECKOUT-001"].citedBy, 1);
    // Nothing cites the superseded entry; that is a fact, not an error.
    assert.equal(index.entries["BL-CART-011"].citedBy, 0);
    assert.equal(index.citations.suitesScanned, 1);
  });
});

test("a citation pointing at nothing is reported as dangling, with the citing case", async () => {
  await withTempDir(async (dir) => {
    const index = buildIndex(copyRoot("platform", join(dir, "platform")), opts);
    const ids = index.citations.dangling.map((d) => d.id);
    assert.ok(ids.includes("BL-NOPE-999"));
    const dangling = index.citations.dangling.find((d) => d.id === "BL-NOPE-999");
    assert.deepEqual(dangling.cases, ["KBF-005"]);
  });
});

test("a suite CSV without the citation columns is reported UNPARSABLE, never treated as clean", async () => {
  await withTempDir(async (dir) => {
    const suites = join(dir, "suites");
    mkdirSync(suites, { recursive: true });
    writeFileSync(join(suites, "broken.csv"), "ID,Title,Steps\nX-1,No citation columns here,Do a thing\n", "utf8");
    const index = buildIndex(copyRoot("platform", join(dir, "platform")), { suites });
    assert.equal(index.citations.suitesScanned, 0);
    assert.equal(index.citations.unparsable.length, 1);
    assert.equal(index.citations.unparsable[0].file, "broken.csv", "the path is relative to the suites root, never to the cwd the command ran from");
    assert.match(index.citations.unparsable[0].reason, /ABSENT from the map in both directions/);
  });
});

test("the CSV reader handles quoted cells with embedded commas", () => {
  const rows = parseCsv('a,b\n"one, two",three\n');
  assert.deepEqual(rows[1], ["one, two", "three"]);
  const { counts } = scanCitations(KB_SUITES);
  // KBF-002's Business_Rule cell is the quoted "BL-CART-010, BL-CART-012" pair.
  assert.equal(counts.get("BL-CART-012"), 1);
});

test("PROPOSED-* forward references are not dangling citations", () => {
  const rows = parseCsv("ID,Business_Rule,Edge_Case_Refs\nX-1,PROPOSED-BL-NEW-001,\n");
  assert.equal(rows.length, 2);
  const { counts } = scanCitations(KB_SUITES);
  assert.equal([...counts.keys()].some((k) => k.startsWith("PROPOSED-")), false);
});

test("the index carries the typed fields and the per-scope counts the layer guard reads", async () => {
  await withTempDir(async (dir) => {
    const index = buildIndex(copyRoot("platform", join(dir, "platform")), opts);
    assert.equal(index.counts.total, 6);
    assert.deepEqual(index.counts.byScope, { platform: 6 });
    assert.equal(index.counts.byStatus.superseded, 1);
    const e = index.entries["LOC-PDP-002"];
    assert.equal(e.kind, "locator");
    assert.equal(e.relation, "new");
    assert.equal(e.file, "confirmed/LOC-PDP-002.md", "file paths are posix so an index from CI equals one from Windows");
    assert.ok(e.startLine > 0 && e.endLine >= e.startLine);
  });
});

test("an entry that fails validation is listed as invalid rather than silently dropped", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    const file = join(root, "confirmed", "BL-CART-010.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("kind: invariant", "kind: rumour"), "utf8");
    const index = buildIndex(root, opts);
    assert.equal(index.invalid.length, 1);
    assert.equal(index.invalid[0].file, "confirmed/BL-CART-010.md");
    assert.ok(index.invalid[0].errors.some((e) => e.code === "KBE-002"));
  });
});
