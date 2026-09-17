/**
 * `bl:render` — the BL oracle page is generated from the records, and this is the derivation.
 *
 * Worth a unit test by the repo's own rule (`when-to-write-a-test.md`): it computes output, and a
 * wrong implementation writes something no human wrote down. The byte-compare gate catches drift in
 * the LIVE corpus; these catch the shapes the live corpus does not happen to contain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { split, render } from "../knowledge/render-bl.mjs";

const PAGE = [
  "---",
  "applicability: reference",
  "---",
  "",
  "# Business Logic Invariants",
  "",
  "## Domain 1: Pricing (BL-PRICE)",
  "",
  "### BL-PRICE-001: Discount stacking order `[P0-revenue]`",
  "- **Rule:** Sale, then tier, then coupon.",
  "### BL-PRICE-002: Rounding `[P1-data]`",
  "- **Rule:** Half-up to two decimals.",
  "",
  "",
  "## Domain 2: Cart (BL-CART)",
  "",
  "### BL-CART-001: Max quantity `[P1-data]`",
  "- **Rule:** Refuse above stock.",
  "",
].join("\n");

test("a page splits into an authored scaffold and one body per rule", () => {
  const { scaffold, bodies } = split(PAGE);
  assert.equal(bodies.size, 3);
  assert.match(scaffold, /^---\napplicability: reference/);
  assert.match(scaffold, /## Domain 2: Cart \(BL-CART\)/);
  assert.match(scaffold, /<!--RULE BL-PRICE-001-->/);
  assert.ok(!scaffold.includes("Half-up to two decimals"), "rule text leaves the scaffold entirely");
});

// THE ROUND TRIP IS THE WHOLE CONTRACT. 413 references across 172 files and five parsers depend on
// this page's exact shape; a renderer that is merely close rewrites 217 invariants silently.
test("scaffold + bodies reproduce the page byte for byte", () => {
  const { scaffold, bodies } = split(PAGE);
  const { text, missing, unused } = render(scaffold, bodies);
  assert.deepEqual(missing, []);
  assert.deepEqual(unused, []);
  assert.equal(text, PAGE);
});

// The blank lines between entries are NOT uniform in the real page: some entries are followed
// immediately by the next heading, two are followed by a pair. An earlier renderer normalised them
// to one and was wrong in both directions on five of the 217.
test("the blank lines between entries are the page's, and are preserved exactly", () => {
  const { scaffold, bodies } = split(PAGE);
  assert.equal(render(scaffold, bodies).text, PAGE);
  assert.ok(PAGE.includes("- **Rule:** Sale, then tier, then coupon.\n### BL-PRICE-002"), "none here");
  assert.ok(PAGE.includes("- **Rule:** Half-up to two decimals.\n\n\n## Domain 2"), "and two here");
});

// A rule in the corpus with no marker would be INVISIBLE on the page while still being in the base.
test("a rule with no marker fails loudly rather than being dropped", () => {
  const { scaffold, bodies } = split(PAGE);
  bodies.set("BL-CART-099", "### BL-CART-099: New `[P1-data]`\n- **Rule:** Something.\n");
  const { unused } = render(scaffold, bodies);
  assert.deepEqual(unused, ["BL-CART-099"]);
});

test("a marker with no rule fails loudly rather than rendering an empty section", () => {
  const { scaffold, bodies } = split(PAGE);
  bodies.delete("BL-PRICE-002");
  const { missing, text } = render(scaffold, bodies);
  assert.deepEqual(missing, ["BL-PRICE-002"]);
  assert.match(text, /<!--RULE BL-PRICE-002-->/, "the marker survives, so the failure is visible in the diff too");
});
