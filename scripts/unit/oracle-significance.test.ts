// Unit tests for scripts/knowledge/oracle-significance.ts — the significance model that
// sets `/qa-review-oracles` promotion ORDER and the promotion BAR, plus the ECL pattern-row
// parser that feeds it. Pure functions only (both CLIs are main()-guarded).
// Run: `npx tsx --test scripts/unit/oracle-significance.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demandPoints,
  eclBusinessValue,
  gate,
  meetsBar,
  productValueOf,
  valueGate,
  normalizeFrequency,
  rankOrder,
  scoreBl,
  scoreEcl,
  tierFor,
  NON_INVARIANT_PREFIXES,
  PROMOTION_BAR,
  type EclRow,
} from "../knowledge/oracle-significance.ts";
import { parseLibrary } from "../knowledge/lint-ecl.ts";

const bl = (over: Partial<Parameters<typeof scoreBl>[0]> = {}) =>
  scoreBl({ id: "BL-CART-001", severity: "P1-data", citingCases: 0, inOracle: true, ...over });

const row = (over: Partial<EclRow> = {}): EclRow => ({ frequency: "Medium", status: "[OBSERVED]", blRefs: [], ...over });

// ---- demand is laddered, not linear ------------------------------------------

test("demand: bracket boundaries, and 0 cases scores nothing", () => {
  assert.equal(demandPoints(0).points, 0);
  assert.equal(demandPoints(1).points, 10);
  assert.equal(demandPoints(2).points, 10);
  assert.equal(demandPoints(3).points, 20);
  assert.equal(demandPoints(9).points, 20);
  assert.equal(demandPoints(10).points, 30);
  assert.equal(demandPoints(29).points, 30);
  assert.equal(demandPoints(30).points, 40);
});

test("demand saturates, so a huge cluster cannot outrank the model by arithmetic alone", () => {
  // 362 citing cases is the real ECL-14.1 figure; it must score the same as 30.
  assert.equal(demandPoints(362).points, demandPoints(30).points);
});

test("demand is defensive about junk input", () => {
  assert.equal(demandPoints(-5).points, 0);
  assert.equal(demandPoints(3.7).points, 20);
});

// ---- BL: severity, floors, caps ----------------------------------------------

test("BL: a P0 never falls below the promotion bar, even uncited", () => {
  const s = bl({ severity: "P0-revenue", citingCases: 0 });
  assert.equal(s.tier, "T2");
  assert.ok(meetsBar(s.tier), "an uncited P0 is still worth carrying");
});

test("BL: a low-severity uncited invariant lands below the bar — the prune signal", () => {
  const s = bl({ severity: "P2-ux", citingCases: 0 });
  assert.equal(s.tier, "T3");
  assert.equal(meetsBar(s.tier), false);
});

test("BL: demand alone can lift a P2 back over the bar", () => {
  assert.equal(bl({ severity: "P2-ux", citingCases: 30 }).tier, "T2");
});

test("BL: an untagged ENTRY is capped at T3 however much cites it — unassessable is never significant", () => {
  const s = bl({ severity: "", citingCases: 200 });
  assert.equal(s.tier, "T3");
  assert.match(s.caps.join(" "), /unclassified severity/);
  assert.match(s.unresolved.join(" "), /no severity tag/);
});

test("BL: an untagged CANDIDATE rides demand to T2 but can never reach T1 unclassified", () => {
  const s = scoreBl({ id: "BL-L10N-001", severity: "", citingCases: 200, inOracle: false });
  assert.equal(s.tier, "T2");
  assert.match(s.caps.join(" "), /ceiling T2 until triangulation assigns a severity tag/);
});

test("BL: the same candidate reaches T1 once triangulation assigns a P0 tag", () => {
  assert.equal(scoreBl({ id: "BL-L10N-001", severity: "P0-revenue", citingCases: 200, inOracle: false }).tier, "T1");
});

test("BL: BL-CROSS carries the oracle's own cross-domain premium", () => {
  const cross = scoreBl({ id: "BL-CROSS-002", severity: "P1-data", citingCases: 3, inOracle: true });
  const plain = scoreBl({ id: "BL-CART-002", severity: "P1-data", citingCases: 3, inOracle: true });
  assert.equal(cross.score - plain.score, 10);
});

test("BL: non-invariant prefixes are EXCLUDED at any demand, and name their redirect", () => {
  for (const prefix of Object.keys(NON_INVARIANT_PREFIXES)) {
    const s = scoreBl({ id: `${prefix}-001`, severity: "P0-revenue", citingCases: 400, inOracle: false });
    assert.equal(s.tier, "EXCLUDED", `${prefix} must never be promotable`);
    assert.equal(meetsBar(s.tier), false);
    assert.ok(s.exclusion?.redirect, `${prefix} must say where the traceability goes instead`);
    assert.equal(gate("MISSING", s).apply, false);
    assert.equal(gate("MISSING", s).label, "excluded");
  }
});

// ---- ECL: closed vocabularies only, never prose -------------------------------

test("frequency: the closed vocabulary, with a parenthetical qualifier allowed", () => {
  assert.equal(normalizeFrequency("High").value, "High");
  assert.equal(normalizeFrequency("  low-medium ").value, "Low-Medium");
  assert.equal(normalizeFrequency("High (false bug)").value, "High");
});

test("frequency: an ambiguous or empty cell resolves to null WITH a reason — it never guesses", () => {
  const span = normalizeFrequency("Low/Medium/High");
  assert.equal(span.value, null);
  assert.match(span.reason!, /outside the closed vocabulary/);
  assert.equal(normalizeFrequency("").value, null);
  assert.equal(normalizeFrequency("—").value, null);
});

test("ECL: an unreadable Frequency contributes zero and is reported, not inferred", () => {
  const s = scoreEcl({ id: "ECL-9.9", citingCases: 0, rows: [row({ frequency: "Low/Medium/High" })] });
  assert.equal(s.contributions.find((c) => c.signal === "frequency")!.points, 0);
  assert.equal(s.unresolved.length, 1);
});

test("ECL: status scores by observed SHARE — 'has one observed row' would not discriminate", () => {
  const mostly = scoreEcl({ id: "ECL-1.1", citingCases: 0, rows: [row(), row(), row(), row({ status: "[THEORETICAL]" })] });
  const partly = scoreEcl({ id: "ECL-1.2", citingCases: 0, rows: [row(), row({ status: "[THEORETICAL]" }), row({ status: "[THEORETICAL]" })] });
  const none = scoreEcl({ id: "ECL-1.3", citingCases: 0, rows: [row({ status: "[THEORETICAL]" })] });
  const points = (s: ReturnType<typeof scoreEcl>) => s.contributions.find((c) => c.signal === "status")!.points;
  assert.equal(points(mostly), 25); // 3/4 = 75%, the band boundary
  assert.equal(points(partly), 15); // 1/3 = 33%
  assert.equal(points(none), 5);
  // Just under the boundary must NOT round up into the confirmed band.
  const justUnder = scoreEcl({ id: "ECL-1.4", citingCases: 0, rows: [row(), row(), row({ status: "[THEORETICAL]" }), row({ status: "[THEORETICAL]" })] });
  assert.equal(points(justUnder), 15);
});

test("ECL: a theoretical-only, low-frequency, uncited section sits below the bar", () => {
  const s = scoreEcl({ id: "ECL-9.9", citingCases: 0, rows: [row({ frequency: "Low", status: "[THEORETICAL]" })] });
  assert.equal(s.tier, "T3");
});

test("ECL: a section with no parseable row is capped at T3 rather than scored on demand", () => {
  const s = scoreEcl({ id: "ECL-13.4", citingCases: 400, rows: [] });
  assert.equal(s.tier, "T3");
  assert.match(s.caps.join(" "), /no pattern row parsed/);
});

test("ECL: a BL-linked row adds the normative-testability premium exactly once", () => {
  const linked = scoreEcl({ id: "ECL-14.1", citingCases: 0, rows: [row({ blRefs: ["BL-GQL-001"] }), row({ blRefs: ["BL-GQL-002"] })] });
  const plain = scoreEcl({ id: "ECL-14.2", citingCases: 0, rows: [row(), row()] });
  assert.equal(linked.score - plain.score, 8);
});

// ---- the two value axes -------------------------------------------------------

test("business value comes from the declared severity tag, and nowhere else", () => {
  assert.equal(bl({ severity: "P0-security" }).business, "high");
  assert.equal(bl({ severity: "P0-revenue" }).business, "high");
  assert.equal(bl({ severity: "P1-data" }).business, "medium");
  assert.equal(bl({ severity: "P2-ux" }).business, "low");
  assert.equal(bl({ severity: "" }).business, "unknown");
  assert.equal(bl({ severity: "P9-made-up" }).business, "unknown");
});

test("product value comes from demand, with a cross-domain bump", () => {
  assert.equal(productValueOf(0).value, "none");
  assert.equal(productValueOf(1).value, "low");
  assert.equal(productValueOf(3).value, "medium");
  assert.equal(productValueOf(10).value, "high");
  assert.equal(scoreBl({ id: "BL-CROSS-002", severity: "P1-data", citingCases: 1, inOracle: true }).product, "medium");
  assert.equal(scoreBl({ id: "BL-CART-002", severity: "P1-data", citingCases: 1, inOracle: true }).product, "low");
});

test("ECL business value is read from the linked BL invariant, not from the section's prose", () => {
  const rows = [row({ blRefs: ["BL-PRICE-001"] }), row({ blRefs: ["BL-UI-002"] })];
  const sev: Record<string, string> = { "BL-PRICE-001": "P0-revenue", "BL-UI-002": "P2-ux" };
  const v = eclBusinessValue(rows, (id) => sev[id]);
  assert.equal(v.value, "high", "the strongest linked invariant sets the value");
  assert.match(v.note, /BL-PRICE-001/);
});

test("ECL: a section linking no BL invariant is UNDECLARED, never proxied into a business value", () => {
  const v = eclBusinessValue([row({ frequency: "High" }), row()], () => "P0-revenue");
  assert.equal(v.value, "unknown");
  assert.match(v.note, /name the invariant this pattern endangers/);
  // …and that is what blocks growth: a high-frequency, heavily-cited section still cannot
  // promote a NEW entry until it says which invariant it threatens.
  const s = scoreEcl({ id: "ECL-7.1", citingCases: 379, rows: [row({ frequency: "High" })] });
  assert.equal(gate("MISSING", s).label, "undeclared");
  assert.equal(gate("MISSING", s).apply, false);
});

test("ECL: Frequency is exposure, so it lifts the PRODUCT axis, never the business one", () => {
  const high = scoreEcl({ id: "ECL-1.1", citingCases: 1, rows: [row({ frequency: "High", blRefs: ["BL-X-001"] })], blSeverityOf: () => "P1-data" });
  const low = scoreEcl({ id: "ECL-1.2", citingCases: 1, rows: [row({ frequency: "Low", blRefs: ["BL-X-001"] })], blSeverityOf: () => "P1-data" });
  assert.equal(high.business, "medium");
  assert.equal(low.business, "medium", "frequency must not move the business axis");
  assert.equal(high.product, "high", "1 case + observed (+1) + High frequency (+1)");
  assert.equal(low.product, "medium");
});

test("ECL product value moves with the observed share", () => {
  const observed = scoreEcl({ id: "ECL-1.1", citingCases: 1, rows: [row(), row(), row(), row()] });
  const theoretical = scoreEcl({ id: "ECL-1.2", citingCases: 3, rows: [row({ status: "[THEORETICAL]" })] });
  assert.equal(observed.product, "medium", "predominantly observed lifts one level");
  assert.equal(theoretical.product, "low", "theoretical-only drops one level");
});

// ---- the gate: valuable for the BUSINESS *and* for the PRODUCT ------------------

test("valueGate: a P0 promotes at any demand — uncited means untested, not unimportant", () => {
  assert.equal(valueGate("high", "none").apply, true);
  assert.equal(valueGate("high", "none").label, "qualified");
  assert.equal(valueGate("high", "high").label, "high");
});

test("valueGate: a P1 must be earned by product demand", () => {
  assert.equal(valueGate("medium", "medium").apply, true);
  assert.equal(valueGate("medium", "low").apply, false);
  assert.equal(valueGate("medium", "none").apply, false);
});

test("valueGate: demand can no longer buy a low-cost rule into the oracle", () => {
  const s = valueGate("low", "high");
  assert.equal(s.apply, false);
  assert.equal(s.label, "low");
});

test("valueGate: an undeclared business value never promotes, whatever the demand", () => {
  const s = valueGate("unknown", "high");
  assert.equal(s.apply, false);
  assert.equal(s.label, "undeclared");
});

test("gate: a confirmed MISSING that fails either axis is HELD, not written", () => {
  const p2 = bl({ severity: "P2-ux", citingCases: 200 });
  assert.equal(gate("MISSING", p2).apply, false);
  const p1Uncited = bl({ severity: "P1-ux", citingCases: 0 });
  assert.equal(gate("MISSING", p1Uncited).apply, false);
  const untagged = scoreBl({ id: "BL-L10N-001", severity: "", citingCases: 200, inOracle: false });
  assert.equal(gate("MISSING", untagged).apply, false);
  assert.equal(gate("MISSING", untagged).label, "undeclared");
});

test("gate: the same candidate promotes once triangulation declares the business value", () => {
  const tagged = scoreBl({ id: "BL-L10N-001", severity: "P0-revenue", citingCases: 21, inOracle: false });
  const d = gate("MISSING", tagged);
  assert.equal(d.apply, true);
  assert.equal(d.label, "high", "P0 + 21 citing cases is high value on both axes");
});

test("gate: a correction applies whatever the value — holding it would leave a known-false rule", () => {
  const worthless = bl({ severity: "P2-ux", citingCases: 0 });
  for (const v of ["DRIFT", "CONFIRMED", "DUPLICATE"] as const) assert.equal(gate(v, worthless).apply, true);
});

test("gate: the evidence bar still outranks the value gate", () => {
  const excellent = bl({ severity: "P0-revenue", citingCases: 200 });
  for (const v of ["CONTRADICTORY", "UNGROUNDED", "RETIRE"] as const)
    assert.equal(gate(v, excellent).apply, false, `${v} must route to the proposals file however valuable`);
});

test("tierFor: a cap beats a floor, so P0 + unclassified cannot promote itself", () => {
  assert.equal(tierFor(90, { cap: "T3", floor: "T2" }), "T3");
  assert.equal(tierFor(0, { floor: "T2" }), "T2");
  assert.equal(PROMOTION_BAR, "T2");
  assert.equal(meetsBar("T3"), false);
});

// ---- ordering ----------------------------------------------------------------

test("rankOrder: business, then product, then score, then demand, then id — total and stable", () => {
  const mk = (id: string, citingCases: number, severity: string) => ({
    item: { id, citingCases },
    score: scoreBl({ id, severity, citingCases, inOracle: true }),
  });
  const ordered = rankOrder([
    mk("BL-CART-002", 0, "P2-ux"), // business low
    mk("BL-CART-003", 30, "P0-revenue"), // business high, product high
    mk("BL-CART-004", 0, "P0-revenue"), // business high, product none
    mk("BL-CART-005", 30, "P1-data"), // business medium, product high
  ]);
  assert.deepEqual(ordered.map((r) => r.item.id), ["BL-CART-003", "BL-CART-004", "BL-CART-005", "BL-CART-002"]);
});

// ---- the model's input contract: ECL rows are read by COLUMN NAME -------------

test("parseLibrary: the 7-column chapter shape reads Frequency by name, not by index", () => {
  // The generic tables put Frequency at index 2; the VC-specific ones insert `BL Invariant`
  // and `ECL Ref`, which is exactly where positional parsing starts reading the wrong cell.
  const md = [
    "## 14. VC-Specific Patterns",
    "### 14.1 GraphQL xAPI Error Patterns",
    "| Pattern | Description | Frequency | Impact | BL Invariant | ECL Ref | Status |",
    "|---|---|---|---|---|---|---|",
    "| **Partial data** | errors[] with data | High | silent failure | BL-GQL-001 | ECL-1.1 | [OBSERVED] |",
    "### 14.2 Generic Shape",
    "| Pattern | Description | Frequency | Impact | Status |",
    "|---|---|---|---|---|",
    "| **Index lag** | stale results | Medium | wrong list | [THEORETICAL] |",
  ].join("\n");
  const { sections } = parseLibrary(md);
  assert.equal(sections.length, 2);
  assert.deepEqual(
    sections[0].rows.map((r) => [r.frequency, r.status, r.blRefs]),
    [["High", "[OBSERVED]", ["BL-GQL-001"]]],
  );
  assert.deepEqual(
    sections[1].rows.map((r) => [r.frequency, r.status, r.blRefs]),
    [["Medium", "[THEORETICAL]", []]],
  );
});

test("parseLibrary: a table above the first section defines nothing", () => {
  const md = ["| Pattern | Description | Frequency | Impact | Status |", "|---|---|---|---|---|", "| x | y | Low | z | [OBSERVED] |"].join("\n");
  assert.deepEqual(parseLibrary(md).sections, []);
});
