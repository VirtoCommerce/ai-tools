// Unit tests for the design-stamp gate in
// scripts/test-cases/append-test-cases-to-suite.ts — the deterministic half of
// the `/qa-test` Step 1e contract.
//
// Why this exists: the Test Model that decides WHAT DEFECT a case is designed to
// catch is terminal-only, so no linter can read it. The appender is the single
// door into `regression/suites/` and sees only NEW rows, which makes it the one
// place the decision can be enforced without lighting up the ~4,200 legacy cases.
//
// The gate must fail CLOSED: an unreadable or unparsable vocabulary source is an
// error, never a silent pass — otherwise the rule retires itself the first time
// someone reshapes a markdown table.
// Run: `npx tsx --test scripts/unit/append-design-stamps.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import {
  COLUMNS,
  validateDesignStamps,
  loadDesignVocabulary,
  loadCatalogProbeIds,
  type DesignVocabulary,
  type Row,
} from "../test-cases/append-test-cases-to-suite.js";

const VOCAB: DesignVocabulary = {
  archetypes: new Set(["SCOPE", "STALE", "MONEY"]),
  nonDefectArchetypes: new Set(["BY-DESIGN", "CONVENTION"]),
  techniques: new Set(["EP", "BVA", "DT"]),
};

/**
 * A row that is valid in every respect EXCEPT what the test under it varies.
 *
 * `Assertions` carries a real discriminating line by default. The first version
 * left it empty, which short-circuited the T-006 arm of `validateDesignStamps`
 * — so all twelve stamp tests passed while never reaching it, and the gate went
 * unasserted. A shared fixture has to pick a value, and picking one is what
 * makes that kind of hole visible.
 */
function row(references: string, id = "CART-901"): Row {
  const r = {} as Row;
  for (const c of COLUMNS) r[c] = "";
  r.ID = id;
  r.Title = `Title ${id}`;
  r.Section = "Cart";
  r.Priority = "High";
  r.Automation_Status = "Draft";
  r.References = references;
  r.Assertions = "[REL] PDP price == listing price for the same SKU";
  return r;
}

const OK = "VCST-5281 · Archetype:SCOPE · Technique:BVA";

test("a fully stamped row passes", () => {
  const { errors } = validateDesignStamps([row(OK)], VOCAB);
  assert.deepEqual(errors, []);
});

test("stamps coexist with the existing References stamps", () => {
  const refs = "VCST-5281 · Synced:2026-08-01 · Audited:2026-08-20 · Archetype:STALE · Technique:EP";
  assert.deepEqual(validateDesignStamps([row(refs)], VOCAB).errors, []);
});

test("a missing Archetype stamp is rejected", () => {
  const { errors } = validateDesignStamps([row("VCST-5281 · Technique:EP")], VOCAB);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Archetype:<TOKEN>/);
  assert.match(errors[0], /CART-901/);
});

test("a missing Technique stamp is rejected", () => {
  const { errors } = validateDesignStamps([row("VCST-5281 · Archetype:SCOPE")], VOCAB);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Technique:<TOKEN>/);
});

test("an out-of-vocabulary archetype is rejected and the error lists the vocabulary", () => {
  const { errors } = validateDesignStamps([row("Archetype:FLAKY · Technique:EP")], VOCAB);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not in the vocabulary/);
  assert.match(errors[0], /MONEY, SCOPE, STALE/);
});

test("an invented technique token is rejected", () => {
  const { errors } = validateDesignStamps([row("Archetype:SCOPE · Technique:FUZZ")], VOCAB);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Technique "FUZZ" is not in the vocabulary/);
});

// A catalog entry tagged BY-DESIGN / CONVENTION describes a false-positive guard
// ("filing this is the bug") or an operating fact — neither is a failure shape a
// test case can probe. Accepting it would let a case claim design intent it
// cannot have, which is exactly the vanity stamp the gate exists to prevent.
test("a non-defect archetype cannot be claimed by a test case", () => {
  for (const t of ["BY-DESIGN", "CONVENTION"]) {
    const { errors } = validateDesignStamps([row(`Archetype:${t} · Technique:EP`)], VOCAB);
    assert.equal(errors.length, 1, `${t} should be rejected`);
    assert.match(errors[0], /false-positive guard, not a probeable/);
  }
});

test("every offending row is reported, not just the first", () => {
  const rows = [row(OK, "CART-901"), row("Technique:EP", "CART-902"), row("Archetype:SCOPE", "CART-903")];
  const { errors } = validateDesignStamps(rows, VOCAB);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /CART-902/);
  assert.match(errors[1], /CART-903/);
});

test("a Probe stamp must name a real catalog entry", () => {
  const ids = new Set(["VC-CART-004"]);
  assert.deepEqual(
    validateDesignStamps([row(`${OK} · Probe:VC-CART-004`)], VOCAB, ids).errors,
    [],
  );
  const { errors } = validateDesignStamps([row(`${OK} · Probe:VC-CART-999`)], VOCAB, ids);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /names no entry in vc-bug-catalog/);
});

test("Probe stamps are unvalidated when no catalog id set is supplied", () => {
  assert.deepEqual(validateDesignStamps([row(`${OK} · Probe:VC-ANY-123`)], VOCAB).errors, []);
});

// --- The vocabularies are READ, never transcribed (GOLDEN RULE). These pin the
// --- parser against the real markdown, so a table reshape fails here loudly
// --- rather than silently rejecting every legitimate token at append time.
test("the real vocabularies parse out of the markdown that owns them", () => {
  const v = loadDesignVocabulary();
  // Defect shapes and non-defect guards are kept apart.
  assert.ok(v.archetypes.has("SCOPE"), "SCOPE missing from the defect-shape table");
  assert.ok(v.archetypes.has("RACE"), "RACE missing from the defect-shape table");
  assert.ok(!v.archetypes.has("BY-DESIGN"), "BY-DESIGN must not be a probeable shape");
  assert.ok(v.nonDefectArchetypes.has("BY-DESIGN") && v.nonDefectArchetypes.has("CONVENTION"));
  // Technique tokens come from the skill that owns them.
  for (const t of ["EP", "BVA", "DT", "ST", "PW", "EG"]) assert.ok(v.techniques.has(t), `${t} missing`);
});

test("every catalog entry carries an in-vocabulary Archetype", () => {
  const v = loadDesignVocabulary();
  const known = new Set([...v.archetypes, ...v.nonDefectArchetypes]);
  const ids = loadCatalogProbeIds();
  assert.ok(ids.size >= 50, `expected the full catalog, saw ${ids.size} entries`);
  // Read the catalog once more the same way the loader does, and pair ids to tags.
  const root = resolve(fileURLToPath(import.meta.url), "../../..");
  const md = readFileSync(join(root, ".claude/knowledge/oracles/vc-bug-catalog.md"), "utf-8");
  let cur: string | null = null;
  const tagged = new Set<string>();
  for (const line of md.split("\n")) {
    const h = /^###\s+(VC-[A-Z0-9]+-\d+)/.exec(line);
    if (h) cur = h[1];
    const a = /^- \*\*Archetype:\*\*\s*`([A-Z][A-Z0-9-]*)`/.exec(line);
    if (a && cur) {
      assert.ok(known.has(a[1]), `${cur} has unknown archetype "${a[1]}"`);
      tagged.add(cur);
    }
  }
  const untagged = [...ids].filter((i) => !tagged.has(i));
  assert.deepEqual(untagged, [], `catalog entries with no Archetype: ${untagged.join(", ")}`);
});

// --- The T-006 arm. Every test above runs with `Assertions: ""`, which used to
// --- short-circuit the whole check — so the block whose comment promises "a NEW
// --- presence-only case simply never lands" was asserted by nobody, and an
// --- empty-Assertions row sailed through the single door into the corpus.
function withAsserts(a: string, id = "CART-901"): Row {
  const r = row(OK, id);
  r.Assertions = a;
  return r;
}

test("a new presence-only row is refused at the door", () => {
  const { errors } = validateDesignStamps(
    [withAsserts("[DOM] price is visible\n[DOM] title is displayed")],
    VOCAB,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /presence-only/);
});

test("one discriminating line lets a new row through", () => {
  const r = withAsserts("[DOM] price is visible\n[REL] PDP price == listing price for the same SKU");
  assert.deepEqual(validateDesignStamps([r], VOCAB).errors, []);
});

test("a row asserting NOTHING is refused — worse than presence-only", () => {
  const { errors } = validateDesignStamps([withAsserts("")], VOCAB);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no assertions/);
});

// A gap in the classifier's vocabulary is the classifier's problem. Refusing the
// row would punish the author for a shape we simply have not taught it, so this
// warns and admits.
test("an unreadable assertion form warns but is admitted", () => {
  const r = withAsserts("[WIDGET] the frobnicator reconciles the ledger");
  const res = validateDesignStamps([r], VOCAB);
  assert.deepEqual(res.errors, []);
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /classifier recognises none/);
});

test("a backend status assertion is accepted — it is not presence", () => {
  const r = withAsserts("[STATUS] GET for another user's member id returns 403 Forbidden — not 200");
  assert.deepEqual(validateDesignStamps([r], VOCAB).errors, []);
});
