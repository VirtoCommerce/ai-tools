// Unit tests for scripts/maintenance/sync-storefront-selectors.mjs and the module it generates.
//
// WHY THESE ASSERTIONS. The generator replaces two hand-written selector documents, and the
// diff that motivated it is the test's real subject: against vc-frontend@dev, 24 of the 78
// selectors those documents asserted DO NOT EXIST in the source — including
// `main-layout.top-header.account-menu-button` and
// `main-layout.top-header.account-menu.sign-out-button`, which the preflight doc presented as
// "verified live" and which `[PRE:SIGNIN_AS]` / `[PRE:SIGNOUT]` reach from 1,572 cases. The
// real ids are `account-menu` and `sign-out-button`.
//
// So the load-bearing test is not "extraction works" — it is that a fabricated selector is
// REJECTED and a real one is accepted, because that is what stops a locator being written
// against an element that was never there.
//
// Run: `npx tsx --test scripts/unit/storefront-selectors.test.mjs` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSelectors } from "../maintenance/sync-storefront-selectors.mjs";
import {
  STATIC_SELECTORS,
  SELECTOR_PATTERNS,
  TEST_ID_ATTRIBUTE,
  UNRESOLVED_BINDINGS,
  isKnownSelector,
  testIdSelector,
  SOURCE,
} from "../lib/storefront-selectors.generated.ts";

/** Run the extractor over in-memory sources, so no fixture files are needed. */
function extract(sources) {
  const files = Object.keys(sources);
  return extractSelectors(files, (f) => sources[f], "");
}

// ---- extraction ------------------------------------------------------------------

test("a static attribute becomes a literal, with the file that declares it", () => {
  const r = extract({ "a.vue": `<div data-test-id="add-to-cart-button">x</div>` });
  assert.deepEqual(r.staticNames, [{ name: "add-to-cart-button", file: "a.vue" }]);
  assert.deepEqual(r.patterns, []);
  assert.deepEqual(r.unresolved, []);
});

test("a bound attribute is NEVER read as a static literal", () => {
  // `:data-test-id="foo"` is an expression. Reading it as the name "foo" is precisely the
  // fabrication this file exists to prevent.
  const r = extract({ "a.vue": `<div :data-test-id="item.dataTestId">x</div>` });
  assert.deepEqual(r.staticNames, []);
  assert.equal(r.unresolved.length, 1);
  assert.match(r.unresolved[0].reason, /bare expression/);
});

test("a template literal yields a PREFIX, never a whole name", () => {
  // `filter-price` was one of the 24 phantom selectors — invented by someone reading
  // `filter-${facet.paramName}` and writing a plausible suffix.
  const r = extract({ "a.vue": '<div :data-test-id="`filter-${facet.paramName}`">x</div>' });
  assert.deepEqual(r.patterns, [{ prefix: "filter-", template: "`filter-${facet.paramName}`", file: "a.vue" }]);
  assert.deepEqual(r.staticNames, [], "a template must not contribute a literal");
});

test("a template with no static prefix is unresolved, not a wildcard", () => {
  const r = extract({ "a.vue": '<div :data-test-id="`${kind}-button`">x</div>' });
  assert.deepEqual(r.patterns, []);
  assert.equal(r.unresolved.length, 1);
  assert.match(r.unresolved[0].reason, /empty static prefix/);
});

test("an attribute that merely ENDS in data-test-id is not matched", () => {
  const r = extract({ "a.vue": `<div my-data-test-id="nope" data-test-id="yes">x</div>` });
  assert.deepEqual(r.staticNames.map((s) => s.name), ["yes"]);
});

test("the same selector in two files is recorded once, attributed to the first", () => {
  const r = extract({ "a.vue": `<i data-test-id="dup">`, "b.vue": `<i data-test-id="dup">` });
  assert.deepEqual(r.staticNames, [{ name: "dup", file: "a.vue" }]);
});

test("output is sorted, so the generated file is stable across runs", () => {
  const r = extract({ "a.vue": `<i data-test-id="zeta"><i data-test-id="alpha">` });
  assert.deepEqual(r.staticNames.map((s) => s.name), ["alpha", "zeta"]);
});

test("no sources yields empty sets rather than throwing", () => {
  const r = extract({});
  assert.deepEqual(r, { staticNames: [], patterns: [], unresolved: [] });
});

// ---- the generated module --------------------------------------------------------

test("the attribute is the one spelling that exists in the source", () => {
  // test-execution-preflight.md said "a few legacy spots may use data-testid … either should
  // work". Measured against the source: `data-testid` has ZERO occurrences, static or bound.
  assert.equal(TEST_ID_ATTRIBUTE, "data-test-id");
  assert.equal(testIdSelector("account-menu"), '[data-test-id="account-menu"]');
});

test("the generated surface is substantial and self-describing", () => {
  assert.ok(STATIC_SELECTORS.length >= 150, `only ${STATIC_SELECTORS.length} static selectors — extraction regressed`);
  assert.ok(SELECTOR_PATTERNS.length >= 5);
  assert.equal(SOURCE.staticCount, STATIC_SELECTORS.length);
  assert.equal(SOURCE.patternCount, SELECTOR_PATTERNS.length);
  assert.equal(SOURCE.unresolvedCount, UNRESOLVED_BINDINGS.length);
  assert.match(SOURCE.commit, /^[0-9a-f]{40}$|local checkout/);
});

test("the REAL auth selectors are present — the pair the preflight doc got wrong", () => {
  assert.ok(isKnownSelector("account-menu"));
  assert.ok(isKnownSelector("sign-out-button"));
});

test("the structurally impossible selectors are REJECTED — the whole point", () => {
  // Each of these is asserted by a knowledge file today and matches nothing in the source: no
  // static value, no template prefix, and no UI-kit test-id prop either.
  //
  // SIX entries were removed from this list on 2026-08-26 because they were never phantoms:
  // sign-up-first-name-input, sign-up-email-input, sign-up-confirm-password-input,
  // global-search-query-input, search-keyword-input and payment-method-selector are all declared
  // via UI-kit props (`test-id-input=`, `test-id-dropdown=`), which the generator did not read.
  // So this test was PINNING the generator's blind spot in place and calling it a finding — the
  // most expensive shape of wrong, because it makes the error look verified. What remains below
  // is genuinely absent, and note the pattern in it: the `main-layout.` and `sign-in-page.`
  // entries are real controls under the WRONG PREFIX (the live ids are `account-menu`,
  // `sign-out-button`, `email-input`, `password-input`, `login-button`), which is a different
  // defect from "no test id exists" and needs a different fix in the case that cites it.
  const impossible = [
    "main-layout.top-header.account-menu-button",
    "main-layout.top-header.account-menu.sign-out-button",
    "sign-in-page.email-input",
    "sign-in-page.password-input",
    "sign-in-page.login-button",
    "pickup-locations-modal",
  ];
  for (const p of impossible) {
    assert.equal(isKnownSelector(p), false, `${p} does not exist in vc-frontend but was accepted`);
  }
});

test("a plausible INSTANTIATION of a real pattern is accepted, and that is correct", () => {
  // `filter-price` is absent from the static list but matches `filter-${facet.paramName}`, so
  // it may well exist at runtime for a facet named "price". Calling it a phantom — as a naive
  // diff against the static values does — would be the same overreach in the other direction.
  assert.ok(isKnownSelector("filter-price"));
  assert.ok(isKnownSelector("variations-8033482-button"));
});

test("the REAL sign-in fields carry no test id at all — the reason the docs invented some", () => {
  // `vc-input.vue` CAN emit one (`:data-test-id="testIdInput"`, an optional prop), which is why
  // it shows up in UNRESOLVED_BINDINGS — but sign-in-form.vue does not pass it. The fields are
  // addressable by name/type/label, and no amount of naming discipline produces a test id that
  // was never rendered. This is why `isKnownSelector` false must read as "unverified", not
  // "invalid".
  assert.ok(isKnownSelector("login-button"), "the submit button DOES have one");
  assert.equal(isKnownSelector("sign-in-page.email-input"), false);
  assert.ok(UNRESOLVED_BINDINGS.length > 0, "the opt-in prop surface must be recorded, not hidden");
});

test("a template prefix ALONE is not a selector — only prefix + a suffix is", () => {
  // Otherwise `filter-` itself would validate, and the point of a prefix is that something
  // follows it at runtime.
  const withSuffix = `${SELECTOR_PATTERNS[0].prefix}something`;
  assert.ok(isKnownSelector(withSuffix));
  assert.equal(isKnownSelector(SELECTOR_PATTERNS[0].prefix), false);
});

test("unresolved bindings are recorded with a reason and a location", () => {
  // A non-zero count means the real surface is WIDER than STATIC_SELECTORS, so an unknown
  // selector is "unverified", never "invalid". Consumers need to be able to see that.
  for (const u of UNRESOLVED_BINDINGS) {
    assert.ok(u.expr.length > 0);
    assert.ok(u.file.endsWith(".vue") || u.file.endsWith(".ts"), `odd location ${u.file}`);
    assert.ok(u.reason.length > 0);
  }
});
