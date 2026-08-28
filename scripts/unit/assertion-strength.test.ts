// Unit tests for the T-006 assertion-strength classifier
// (scripts/test-cases/lint-test-cases.ts).
//
// Why this rule exists: measured on this corpus, 1,044 of 1,961 Frontend cases
// (53%) asserted only presence, and a presence check fails only when the element
// is absent entirely — the rarest failure mode. Real bugs render SOMETHING (the
// open bug `non-usd-price-zero-display` renders a literal `£0.00`, so "price is
// visible" passes).
//
// The classifier has to get TWO directions right, and the second is what stops it
// becoming noise: it must flag presence-only cases, and it must NOT flag the
// measurable ones that already exist (048c) or the value-comparing ones
// (CAT-AURL-001). A rule that hits correct cases gets switched off.
// Run: `npx tsx --test scripts/unit/assertion-strength.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAssertionStrength,
  hasDiscriminatingAssertion,
  isUnclassified,
} from "../test-cases/lint-test-cases.js";

test("measurable UI tags are invariants", () => {
  for (const l of [
    "[SHIFT] before vs after topDelta == 0",
    "[TOUCH] belowAA == 0",
    "[SPACING] offGrid == 0",
    "[CLS] value <= 0.1",
    "[ALIGN] heightDrift <= 1",
    "[OVERFLOW] horizontal == false",
    "[IMGDIMS] missingDims == 0",
  ]) {
    assert.equal(classifyAssertionStrength(l), "INV", l);
  }
});

test("[MATH] counts as an invariant only with a formula", () => {
  assert.equal(classifyAssertionStrength("[MATH] line total = unit price × quantity"), "INV");
  // No formula: T-003 already rejects this shape; strength must not rescue it.
  assert.notEqual(classifyAssertionStrength("[MATH] the total looks right"), "INV");
});

test("relations are recognised by tag and by phrasing", () => {
  assert.equal(classifyAssertionStrength("[REL] PDP price == listing price for the same SKU"), "REL");
  for (const l of [
    "[DOM] cart subtotal after removing the line is unchanged from before",
    "[STATE] the end state is identical to the state before the Back navigation",
    "[DOM] tab B's account name is the same as tab A's",
  ]) {
    assert.equal(classifyAssertionStrength(l), "REL", l);
  }
});

test("a derived comparison is DER, not PRES", () => {
  assert.equal(
    classifyAssertionStrength("[DOM] img src host equals @td(STORE_ASSET_TEST_URL.host)"),
    "DER",
  );
  assert.equal(classifyAssertionStrength("[DOM] title equals {{EXPECTED_TITLE}}"), "DER");
});

test("shape checks are falsifiable without a literal", () => {
  for (const l of [
    "[FORMAT] price matches /^\\$\\d+\\.\\d{2}$/",
    "[DOM] rows sorted ascending by name",
    "[COUNT] exactly 3 facets rendered",
    "[FORMAT] all prices display with exactly 2 decimal places",
  ]) {
    const c = classifyAssertionStrength(l);
    assert.ok(c === "SHAPE" || c === "INV", `${l} → ${c}`);
  }
});

test("presence verbs classify as PRES", () => {
  for (const l of [
    "[DOM] Thumbnail strip visible with multiple images",
    "[DOM] Related products section visible below main product info",
    "[DOM] success notification is shown",
    "[STATE] the compare bar appears",
    "[DOM] 'Add to Cart' button disabled before any option selected",
  ]) {
    assert.equal(classifyAssertionStrength(l), "PRES", l);
  }
});

test("a numeric delta on a [DOM] line is an invariant, not presence", () => {
  // The corpus's own good example — it must not be mistaken for PRES just
  // because the line starts with [DOM].
  assert.equal(classifyAssertionStrength("[DOM] cart badge increments by exactly 1"), "INV");
});

test("hasDiscriminatingAssertion: one strong line rescues a presence guard", () => {
  assert.equal(
    hasDiscriminatingAssertion(["[DOM] price is visible", "[DOM] title is displayed"]),
    false,
  );
  assert.equal(
    hasDiscriminatingAssertion([
      "[DOM] price is visible",
      "[REL] PDP price == listing price for the same SKU, both non-zero",
    ]),
    true,
  );
});

test("an empty set is not treated as discriminating", () => {
  assert.equal(hasDiscriminatingAssertion([]), false);
  assert.equal(classifyAssertionStrength("   "), "UNKNOWN");
});

// Regression guards against the two ways this rule could become noise.
test("the real 048c measurable cases all pass the gate", () => {
  const real = [
    ["[VIEWPORT] 1280x900", "[SHIFT] before vs after topDelta == 0", "[SHIFT] before vs after leftDelta == 0"],
    ["[TOUCH] belowAA == 0", "[TOUCH] belowAAA == 0", "[TOUCH] tooClose == 0"],
    ["[ALIGN] heightDrift <= 1"],
  ];
  for (const lines of real) assert.ok(hasDiscriminatingAssertion(lines), lines.join(" | "));
});

test("a presence guard plus a measured invariant passes (the intended authoring shape)", () => {
  assert.ok(
    hasDiscriminatingAssertion([
      "[DOM] the review-form star picker is visible",
      "[MATH] document scrollWidth = document clientWidth at 375px width",
    ]),
  );
});

// --- NEG and quoted literals: added after hand-checking PRICE-021/022/023
// --- against the bug they cover. The first version of the classifier scored
// --- "Both prices with min qty=1 are NOT deleted" as UNKNOWN, i.e. NOT
// --- discriminating — exactly backwards, and it would have flagged a correct
// --- case. A rule that hits correct cases gets switched off, so these are
// --- regression guards, not nice-to-haves.
test("a negative assertion is discriminating, not weak", () => {
  for (const l of [
    "[STATE] order NOT created — cart still intact",
    "[STATE] Over-limit product not added to compare bar",
    "[DOM] Products outside the virtual catalog are not visible",
    "[STATE] the disabled item is not returned by the API",
  ]) {
    assert.equal(classifyAssertionStrength(l), "NEG", l);
    assert.ok(hasDiscriminatingAssertion([l]), l);
  }
});

// A line can carry BOTH a value comparison and a negation. The ladder resolves
// it by precedence — INV outranks NEG — and both are discriminating, so the
// verdict is unaffected either way. Pinned because the `=` lookbehind fix moved
// this real corpus line from NEG to INV, and a silent reclassification of the
// case that motivated the NEG class in the first place should not go unnoticed.
test("a line carrying both a comparison and a negation ranks as the stronger", () => {
  const l = "[STATE] Both prices with min qty=1 are NOT deleted";
  assert.equal(classifyAssertionStrength(l), "INV");
  assert.ok(hasDiscriminatingAssertion([l]));
});

test("negation is checked before presence — 'not visible' is not a presence check", () => {
  assert.equal(classifyAssertionStrength("[DOM] the banner is visible"), "PRES");
  assert.equal(classifyAssertionStrength("[DOM] the banner is not visible"), "NEG");
});

// A quoted literal discriminates, so it clears the gate — but it is NOT `DER`.
// `DER` means "compared against an independently DERIVED value" (@td / {{VAR}} /
// a captured value); a transcribed literal is the opposite of that, and DV-016
// discourages it. Reporting it as the strongest class would have told the author
// the exact thing the data-validity rules are trying to discourage.
test("a quoted expected value counts, but is SHAPE rather than DER", () => {
  const l = "[STATE] Error message shown: 'You must have at least one price per single unit.'";
  assert.equal(classifyAssertionStrength(l), "SHAPE");
  assert.ok(hasDiscriminatingAssertion([l]));
  // ...while a genuinely derived comparison IS DER.
  assert.equal(
    classifyAssertionStrength("[DOM] img src host equals @td(STORE_ASSET_TEST_URL.host)"),
    "DER",
  );
});

// --- Regression guards for the code-review findings. Each of these FAILED
// --- before the fix, and each names the corpus damage it prevents.

// The `=` arm's lookbehind was written `(?<![a-z])` under the /i flag, which
// made it case-insensitive and therefore rejected `=` after ANY letter. `qty = 2`
// passed and `quantity=2` did not — the difference was a space. 3,397 corpus
// assertion lines use the unspaced form and 209 whole cases were hard-rejected
// by the appender with a message calling them "presence-only".
test("an unspaced key=value comparison is a value comparison", () => {
  for (const l of ["quantity=2", "STATUS=200", "[ADMIN] created: name=Bundle; required=false"]) {
    assert.equal(classifyAssertionStrength(l), "INV", l);
  }
  assert.equal(classifyAssertionStrength("qty = 2"), "INV", "the spaced form must keep working");
});

// `count` and `format` as bare nouns laundered pure presence checks into SHAPE,
// so 52 cases passed the gate on a word. They need a comparison context.
test("a bare 'count' or 'format' does not launder a presence check", () => {
  assert.equal(classifyAssertionStrength("[DOM] cart count is visible"), "PRES");
  assert.equal(classifyAssertionStrength("[FORM] dates displayed in correct format"), "PRES");
  // ...but a real count comparison still scores.
  assert.notEqual(classifyAssertionStrength("[COUNT] count = 3"), "PRES");
});

// The classifier was written and tested on Storefront forms only, so 1,651
// corpus lines carrying backend tags fell to UNKNOWN — and UNKNOWN was then
// treated as presence-only, putting live cross-org authorization tests on the
// demotion list.
test("backend assertion shapes are discriminating", () => {
  for (const l of [
    "[STATUS] GET for another user's member id returns 403 Forbidden — not 200",
    "[BODY] 403 response does not include the other user's email, addresses, or organization data",
    "[STATUS] GET .../locked returns HTTP 200 with {locked: true}",
  ]) {
    assert.ok(hasDiscriminatingAssertion([l]), l);
  }
});

// A concrete path IS the expected value. The template documents this exact line
// as class SHAPE, and the classifier used to disagree with the template.
test("a concrete URL/path assertion is SHAPE, matching the template", () => {
  assert.equal(classifyAssertionStrength("[NAV] URL is /order/confirmation after Place Order"), "SHAPE");
});

test("negation covers bare 'no <noun>' and 'not disabled'", () => {
  assert.equal(classifyAssertionStrength("[DOM] no error is shown"), "NEG");
  assert.equal(classifyAssertionStrength("[DOM] Add to Cart button is not disabled"), "NEG");
});

// UNKNOWN and PRES answer different questions. Conflating them let a gap in the
// classifier read as evidence about the case.
test("isUnclassified separates 'cannot read' from 'presence-only'", () => {
  assert.equal(isUnclassified(["the thing happens"]), true);
  assert.equal(isUnclassified(["[DOM] price is visible"]), false, "presence IS classified");
  assert.equal(isUnclassified([]), false, "no assertions is a different finding again");
  assert.equal(isUnclassified(["the thing happens", "[REL] a == b"]), false);
});
