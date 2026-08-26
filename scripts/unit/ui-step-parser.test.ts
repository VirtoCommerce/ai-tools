/**
 * ui-step-parser — the v1 UI grammar.
 *
 * The property these tests defend is not "the happy path parses". It is that **nothing parses by
 * accident**: every rejection carries a reason, and the shapes that would let a case report PASS
 * having done less than it claims are rejected rather than shrugged at.
 *
 * A parser that accepts too much is worse here than one that accepts too little. Accepting too
 * little costs the saving (the case stays on the browser lane, which is the status quo);
 * accepting too much manufactures a green verdict for a step that did nothing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseSuite } from "../test-cases/append-test-cases-to-suite.ts";

import {
  UI_PARSER_VERSION,
  parseLocator,
  parseUiStepLine,
  parseUiSteps,
  validateUiSteps,
  parseUiAssertionLine,
  parseUiAssertions,
  classifyUiScoreability,
  hasUiDriverTag,
  parsePreconditions,
  classifyCrossLayer,
} from "../lib/ui-step-parser.ts";

// ---------------------------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------------------------

test("locator: role with an accessible name", () => {
  const { locator, error } = parseLocator("role=button name='Sign up'");
  assert.equal(error, undefined);
  assert.deepEqual(locator, { kind: "role", role: "button", name: "Sign up" });
});

test("locator: every key form parses to its own kind", () => {
  const cases: Array<[string, string]> = [
    ["label='First name'", "label"],
    ["placeholder='Search'", "placeholder"],
    ["text='Popular categories'", "text"],
    ["testid='account-menu'", "testid"],
    ["css='.slider-block'", "css"],
  ];
  for (const [input, kind] of cases) {
    const { locator, error } = parseLocator(input);
    assert.equal(error, undefined, `${input}: ${error}`);
    assert.equal(locator?.kind, kind, input);
  }
});

test("locator: nth is parsed off any key and must be a non-negative integer", () => {
  assert.equal(parseLocator("css='.vc-line-item' nth=2").locator?.nth, 2);
  assert.match(parseLocator("css='.x' nth=-1").error ?? "", /non-negative integer/);
  assert.match(parseLocator("css='.x' nth=first").error ?? "", /non-negative integer/);
});

test("locator: two keys is an ERROR, not a silent priority", () => {
  // Picking one would make the author's intent unrecoverable from the CSV, and the reader of the
  // diff would have no way to tell which half the runner honoured.
  const { locator, error } = parseLocator("role=button css='.x'");
  assert.equal(locator, undefined);
  assert.match(error ?? "", /exactly one of/);
});

test("locator: an unknown ARIA role is rejected as a typo", () => {
  assert.match(parseLocator("role=buton name='Go'").error ?? "", /unknown ARIA role 'buton'/);
});

test("locator: an unknown key is named in the error", () => {
  assert.match(parseLocator("selector='.x'").error ?? "", /unknown locator key\(s\) selector/);
});

test("locator: prose is rejected, and the error says what was expected", () => {
  const { locator, error } = parseLocator("the hero banner primary CTA");
  assert.equal(locator, undefined);
  assert.match(error ?? "", /no locator key found/);
  assert.match(error ?? "", /role\|label\|placeholder\|text\|testid\|name\|css/);
});

test("locator: an unknown test id is UNVERIFIED, not invalid", () => {
  // 19 bindings in vc-frontend are bare expressions whose value cannot be read statically, and
  // 10 UI-kit components take an optional test-id prop. Rejecting an unknown id would fail
  // correct implementations — so it parses, and carries the flag.
  const { locator, error } = parseLocator("testid='definitely-not-a-real-selector-xyz'");
  assert.equal(error, undefined);
  assert.equal(locator?.kind, "testid");
  assert.equal(locator && "known" in locator ? locator.known : undefined, false);
});

test("locator: a real generated selector is marked known", () => {
  // Reads through to storefront-selectors.generated.ts, so this also proves the parser is wired
  // to the generated surface rather than a hand-list.
  const { locator } = parseLocator("testid='account-menu'");
  assert.equal(locator && "known" in locator ? locator.known : undefined, true);
});

// ---------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------

test("step: [NAV] accepts an env-interpolated URL and an absolute path", () => {
  assert.equal(parseUiStepLine("[NAV] {{FRONT_URL}}/sign-up").tag, "NAV");
  assert.equal(parseUiStepLine("[NAV] /cart").tag, "NAV");
  assert.equal(parseUiStepLine("[NAV] https://example.test/x").tag, "NAV");
});

test("step: [NAV] rejects prose that drifted in from the Assertions column", () => {
  // Real line from 042: this is an assertion about where a click lands, not a navigation.
  const s = parseUiStepLine("[NAV] hero CTA navigates to a category or catalog page (not 404)");
  assert.equal(s.tag, "UNKNOWN");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /looks like prose, not a URL/);
});

test("step: [WAIT] accepts each of its four forms", () => {
  assert.equal(parseUiStepLine("[WAIT] networkidle").tag, "WAIT");
  assert.equal(parseUiStepLine("[WAIT] 500ms").tag, "WAIT");
  assert.equal(parseUiStepLine("[WAIT] css='.slider-block' visible").tag, "WAIT");
  assert.equal(parseUiStepLine("[WAIT] css='.vc-product-card' count >= 1").tag, "WAIT");
});

test("step: [WAIT] on prose is rejected and the error enumerates the forms", () => {
  // 97 [WAIT] lines in 042, only 16 with a quoted operand — this is the suite's biggest
  // authoring cost, and it has to fail loudly rather than be waved through.
  const s = parseUiStepLine("[WAIT] hero banner visible above the fold");
  assert.equal(s.tag, "UNKNOWN");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /networkidle \| <n>ms \| <locator> visible\|hidden/);
});

test("step: [ACT] click takes no value; fill and select require one", () => {
  const click = parseUiStepLine("[ACT] click role=button name='Sign up'");
  assert.equal(click.tag, "ACT");
  assert.equal(click.tag === "ACT" ? click.value : "x", undefined);

  const fill = parseUiStepLine("[ACT] fill label='First name' = 'Test'");
  assert.equal(fill.tag, "ACT");
  assert.equal(fill.tag === "ACT" ? fill.value : undefined, "Test");
});

test("step: [ACT] fill without a value is rejected — it would type nothing while looking like it typed", () => {
  const s = parseUiStepLine("[ACT] fill label='First name'");
  assert.equal(s.tag, "UNKNOWN");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /'fill' requires " = <value>"/);
});

test("step: [ACT] click WITH a value is rejected rather than ignoring the value", () => {
  // Silently dropping the value would execute a different step than the one written.
  const s = parseUiStepLine("[ACT] click role=button name='Go' = 'something'");
  assert.equal(s.tag, "UNKNOWN");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /takes no value/);
});

test("step: [ACT] splits on the LAST ' = ', so a locator's own '=' survives", () => {
  const s = parseUiStepLine("[ACT] fill placeholder='a = b' = 'v'");
  assert.equal(s.tag, "ACT");
  assert.equal(s.tag === "ACT" ? s.value : undefined, "v");
  assert.equal(s.tag === "ACT" && s.locator.kind === "placeholder" ? s.locator.text : undefined, "a = b");
});

test("step: [ACT] an unknown verb is named", () => {
  const s = parseUiStepLine("[ACT] doubleclick role=button name='X'");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /unknown verb 'doubleclick'/);
});

test("step: [KEY] is a closed set", () => {
  assert.equal(parseUiStepLine("[KEY] Enter").tag, "KEY");
  const s = parseUiStepLine("[KEY] Retrun");
  assert.equal(s.tag, "UNKNOWN");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /not in the accepted key set/);
});

test("step: [SETUP] binds a variable to a real random-data generator", () => {
  const s = parseUiStepLine("[SETUP] reg_email = uniqueEmail('AGENT-TEST-smk002')");
  assert.equal(s.tag, "SETUP");
  assert.equal(s.tag === "SETUP" ? s.variable : "", "reg_email");
  assert.equal(s.tag === "SETUP" ? s.generator : "", "uniqueEmail");
  assert.deepEqual(s.tag === "SETUP" ? s.args : [], ["AGENT-TEST-smk002"]);
});

test("step: [SETUP] refuses a generator that does not exist", () => {
  const s = parseUiStepLine("[SETUP] x = makeItUp('a')");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /unknown generator 'makeItUp'/);
});

test("step: [SETUP] on today's prose form is rejected", () => {
  // The real 042 line. Rejecting it is the point: it is what has to be authored away.
  const s = parseUiStepLine("[SETUP] generate unique email: AGENT-TEST-smk002-{unix_ms}@test.com — store as reg_email");
  assert.equal(s.tag, "UNKNOWN");
});

test("step: [PRE:*] reuses the linter's closed vocabulary, including the parameterised form", () => {
  const p = parseUiStepLine("[PRE:SIGNIN_AS:USER_DEFAULT] ");
  assert.equal(p.tag, "PRE");
  assert.equal(p.tag === "PRE" ? p.primitive : "", "SIGNIN_AS");
  assert.equal(p.tag === "PRE" ? p.arg : "", "USER_DEFAULT");

  assert.equal(parseUiStepLine("[PRE:RESET_CART] ").tag, "PRE");
});

test("step: a [PRE:*] naming a primitive no runner implements is an error", () => {
  // 083b uses [PRE:SIGNIN] and [PRE:SEED]; neither exists. PRE-001 already fires on it, and the
  // parser must agree with the linter rather than accept what the linter rejects.
  for (const bad of ["[PRE:SIGNIN] ", "[PRE:SEED] "]) {
    const s = parseUiStepLine(bad);
    assert.equal(s.tag, "UNKNOWN", bad);
    assert.match(s.tag === "UNKNOWN" ? s.reason : "", /not a declared preflight primitive/);
  }
});

test("step: [NOTE] carries no expectation and blocks nothing", () => {
  const s = parseUiStepLine("[NOTE] use the @td(ADDR_NY.*) values verbatim");
  assert.equal(s.tag, "NOTE");
  assert.deepEqual(validateUiSteps([
    parseUiStepLine("[NAV] {{FRONT_URL}}"),
    parseUiStepLine("[ACT] click role=link name='Cart'"),
    s,
  ]), []);
});

test("step: an untagged line is UNKNOWN with a reason, never skipped", () => {
  const s = parseUiStepLine("Click 'Create'");
  assert.equal(s.tag, "UNKNOWN");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /carries no \[TAG\]/);
});

test("step: an out-of-grammar tag is named rather than ignored", () => {
  const s = parseUiStepLine("[ADMIN] open the Customers blade");
  assert.equal(s.tag, "UNKNOWN");
  assert.match(s.tag === "UNKNOWN" ? s.reason : "", /unknown step tag \[ADMIN\]/);
});

test("step: [ASSERT] inside Steps parses as a mid-step assertion", () => {
  // 42 of these in 042 — a step list that checks something partway through.
  const s = parseUiStepLine("[ASSERT] [DOM] css='.vc-cart' visible");
  assert.equal(s.tag, "ASSERT");
  assert.equal(s.tag === "ASSERT" ? s.assertion.tag : "", "DOM");
});

test("step: parseUiSteps drops blank lines and keeps order", () => {
  const steps = parseUiSteps("[NAV] {{FRONT_URL}}\n\n[WAIT] networkidle\n [KEY] Enter \n");
  assert.deepEqual(steps.map((s) => s.tag), ["NAV", "WAIT", "KEY"]);
});

// ---------------------------------------------------------------------------------------------
// Step-list validation
// ---------------------------------------------------------------------------------------------

test("validate: a step list that never drives the page is an ERROR", () => {
  // Whatever such a case observes is whatever the previous case left behind — the hidden-coupling
  // class the 078 split could not measure. Better to refuse it than to score it.
  const errors = validateUiSteps(parseUiSteps("[WAIT] networkidle\n[ASSERT] [DOM] css='.x' visible"));
  assert.ok(errors.some((e) => /nothing drives the page/.test(e)), errors.join(" | "));
});

test("validate: the first executable step must be [NAV]", () => {
  const errors = validateUiSteps(parseUiSteps("[ACT] click role=button name='X'\n[NAV] {{FRONT_URL}}"));
  assert.ok(errors.some((e) => /must open a page with \[NAV\] first/.test(e)), errors.join(" | "));
});

test("validate: [PRE:*], [SETUP] and [NOTE] may precede the [NAV]", () => {
  const errors = validateUiSteps(parseUiSteps(
    "[PRE:CLEAR_SESSION] \n[SETUP] e = uniqueEmail('AGENT-TEST')\n[NOTE] context\n[NAV] {{FRONT_URL}}/sign-up",
  ));
  assert.deepEqual(errors, []);
});

test("validate: a run-scoped {{var}} with no [SETUP] declaring it is an error", () => {
  // Without this the variable resolves to an empty string and the step runs on "" — a fill that
  // types nothing, or a nav to the site root, either of which can still report PASS.
  const errors = validateUiSteps(parseUiSteps("[NAV] {{FRONT_URL}}/sign-up\n[ACT] fill label='Email' = '{{reg_email}}'"));
  assert.ok(errors.some((e) => /\{\{reg_email\}\} is used but no \[SETUP\] declares it/.test(e)), errors.join(" | "));
});

test("validate: an UPPER_CASE {{VAR}} is an env var and needs no [SETUP]", () => {
  const errors = validateUiSteps(parseUiSteps("[NAV] {{FRONT_URL}}/cart\n[ACT] click role=button name='Checkout'"));
  assert.deepEqual(errors, []);
});

test("validate: a declared [SETUP] variable satisfies its later reference", () => {
  const errors = validateUiSteps(parseUiSteps(
    "[SETUP] reg_email = uniqueEmail('AGENT-TEST')\n[NAV] {{FRONT_URL}}/sign-up\n[ACT] fill label='Email' = '{{reg_email}}'",
  ));
  assert.deepEqual(errors, []);
});

test("validate: every UNKNOWN line's reason surfaces in the error list", () => {
  const errors = validateUiSteps(parseUiSteps("[NAV] {{FRONT_URL}}\n[WAIT] hero banner visible above the fold"));
  assert.ok(errors.some((e) => /networkidle/.test(e)), errors.join(" | "));
});

// ---------------------------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------------------------

test("assertion: [DOM] covers each predicate form", () => {
  const forms = [
    "[DOM] css='.slider-block' visible",
    "[DOM] testid='account-menu' hidden",
    "[DOM] role=button name='Place order' enabled",
    "[DOM] role=button name='Place order' disabled",
    "[DOM] css='.vc-product-card' count >= 1",
    "[DOM] css='.total' text == '$0.00'",
    "[DOM] css='.total' text contains 'Popular'",
    "[DOM] css='.price' text matches /^\\$\\d+\\.\\d{2}$/",
    "[DOM] role=link name='Cart' attr[href] == '/cart'",
  ];
  for (const f of forms) {
    const a = parseUiAssertionLine(f);
    assert.equal(a.tag, "DOM", `${f} → ${a.tag === "UNKNOWN" ? a.reason : ""}`);
  }
});

test("assertion: [DOM] prose is rejected with the predicate menu in the error", () => {
  const a = parseUiAssertionLine("[DOM] hero banner section visible above the fold");
  assert.equal(a.tag, "UNKNOWN");
  assert.match(a.tag === "UNKNOWN" ? a.reason : "", /predicate not recognised|no locator key found/);
});

test("assertion: [NAV] url forms", () => {
  assert.equal(parseUiAssertionLine("[NAV] url == '/account/dashboard'").tag, "NAV");
  assert.equal(parseUiAssertionLine("[NAV] url matches /\\/catalog/").tag, "NAV");
  assert.equal(parseUiAssertionLine("[NAV] lands on the dashboard").tag, "UNKNOWN");
});

test("assertion: an invalid regex is reported, not thrown", () => {
  const a = parseUiAssertionLine("[DOM] css='.x' text matches /([/");
  assert.equal(a.tag, "UNKNOWN");
  assert.match(a.tag === "UNKNOWN" ? a.reason : "", /invalid regex/);
});

test("assertion: a bare word where a /regex/ belongs is rejected", () => {
  const a = parseUiAssertionLine("[FORMAT] num(css='.price') matches two-decimals");
  assert.equal(a.tag, "UNKNOWN");
  assert.match(a.tag === "UNKNOWN" ? a.reason : "", /expected a \/regex\/ literal/);
});

test("assertion: [MATH] compiles an extract-and-literal expression", () => {
  const a = parseUiAssertionLine("[MATH] num(css='.line-total') == num(css='.unit-price') * 2");
  assert.equal(a.tag, "MATH");
  if (a.tag !== "MATH") return;
  assert.equal(a.op, "==");
  assert.equal(a.right.length, 2);
  assert.equal(a.right[0].kind, "extract");
  assert.deepEqual(
    a.right[1],
    { kind: "literal", value: 2, operator: "*" },
  );
});

test("assertion: [MATH] on today's prose form is rejected", () => {
  const a = parseUiAssertionLine("[MATH] line total = unit price × updated quantity (2 decimal places — BL-PRICE-003)");
  assert.equal(a.tag, "UNKNOWN");
});

test("assertion: [MATH] names the offending term rather than failing vaguely", () => {
  const a = parseUiAssertionLine("[MATH] num(css='.a') == subtotal + num(css='.b')");
  assert.equal(a.tag, "UNKNOWN");
  assert.match(a.tag === "UNKNOWN" ? a.reason : "", /term 'subtotal'/);
});

test("assertion: [FORMAT] reads a number and matches it against a pattern", () => {
  const a = parseUiAssertionLine("[FORMAT] num(css='.price') matches /^\\$\\d+\\.\\d{2}$/");
  assert.equal(a.tag, "FORMAT");
});

test("assertion: [STATE] is DELEGATED, not answered here", () => {
  // The GraphQL predicate scorer already owns this vocabulary. Answering either way would be a
  // guess, and a guessed 'scoreable' is how a static verdict starts lying about runtime.
  const a = parseUiAssertionLine("[STATE] me.organization.id is non-null");
  assert.equal(a.tag, "STATE");
  assert.equal(classifyUiScoreability(a), "delegated");
});

test("assertion: scoreability is three-valued and UNKNOWN is unparseable", () => {
  assert.equal(classifyUiScoreability(parseUiAssertionLine("[DOM] css='.x' visible")), "scoreable");
  assert.equal(classifyUiScoreability(parseUiAssertionLine("[DOM] something vague")), "unparseable");
});

test("assertion: an out-of-grammar tag is named", () => {
  const a = parseUiAssertionLine("[ADMIN] user visible under Customers");
  assert.match(a.tag === "UNKNOWN" ? a.reason : "", /unknown assertion tag \[ADMIN\]/);
});

test("assertion: parseUiAssertions keeps order and drops blanks", () => {
  const as = parseUiAssertions("[DOM] css='.a' visible\n\n[NAV] url == '/cart'\n");
  assert.deepEqual(as.map((a) => a.tag), ["DOM", "NAV"]);
});

// ---------------------------------------------------------------------------------------------
// Preconditions and cross-layer — recorded, not gating
// ---------------------------------------------------------------------------------------------

test("preconditions: primitives are extracted and surrounding prose is counted, not rejected", () => {
  // The prose is reviewer-facing state context and stays by design — the 078 split deliberately
  // rewrote case references INTO prose requirements.
  const p = parsePreconditions(
    "[PRE:SIGNIN_AS:USER_DEFAULT]\n[PRE:RESET_CART]\nUser logged in, cart empty. Test product must be USD-currency.",
  );
  assert.deepEqual(p.primitives, [
    { primitive: "SIGNIN_AS", arg: "USER_DEFAULT" },
    { primitive: "RESET_CART" },
  ]);
  assert.equal(p.proseLines, 1);
  assert.deepEqual(p.errors, []);
});

test("preconditions: a bogus primitive is an error even among prose", () => {
  const p = parsePreconditions("[PRE:SEED]\nsome prose");
  assert.equal(p.primitives.length, 0);
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0], /not a declared preflight primitive/);
});

test("cross-layer: observable channels are scoreable, [ADMIN] is not — and neither vanishes", () => {
  const c = classifyCrossLayer(
    "[CONSOLE] no JS errors on load\n[NETWORK] no 4xx/5xx on initial page load\n[GQL] cart query returns no errors\n[API] POST /connect/token returns 200\n[ADMIN] user visible under Customers in admin panel",
  );
  assert.deepEqual(c.scoreable.map((x) => x.channel), ["CONSOLE", "NETWORK", "GQL", "API"]);
  assert.equal(c.unscoreable.length, 1);
  assert.equal(c.unscoreable[0].channel, "ADMIN");
  assert.match(c.unscoreable[0].reason, /separate application — out of ui-runner v1/);
});

test("cross-layer: an unscoreable line is reported, so a runner can call the case partial", () => {
  // The whole reason this returns a list instead of a boolean: a case with unchecked cross-layer
  // items must not be able to report a clean PASS, and the runner can only know that if it is told.
  const c = classifyCrossLayer("[EMAIL] confirmation arrives within 2 min");
  assert.equal(c.scoreable.length, 0);
  assert.equal(c.unscoreable.length, 1);
  assert.match(c.unscoreable[0].reason, /not a channel the UI runner observes/);
});

// ---------------------------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------------------------

test("UI_PARSER_VERSION is a semver string the ratchet can compare", () => {
  assert.match(UI_PARSER_VERSION, /^\d+\.\d+\.\d+$/);
});

test("no parse path throws — every rejection is a value", () => {
  // A throw inside the classifier would take down a whole suite's routing, so the parser has to
  // be total. Includes the shapes most likely to break a regex: empty, tag-only, unbalanced
  // quotes, a lone bracket, and a very long line.
  const nasty = [
    "", "   ", "[", "[]", "[NAV]", "[ACT]", "[ACT] fill label='unclosed = 'v'",
    "[DOM]", "[MATH]", "[MATH] ==", "[SETUP] =", "[PRE:]", "[PRE]", "[WAIT] count >= ",
    "[DOM] css='.x' count >= abc", "[KEY]", "x".repeat(5000), "[NAV] " + "/".repeat(2000),
  ];
  for (const line of nasty) {
    assert.doesNotThrow(() => parseUiStepLine(line), `step: ${JSON.stringify(line.slice(0, 40))}`);
    assert.doesNotThrow(() => parseUiAssertionLine(line), `assertion: ${JSON.stringify(line.slice(0, 40))}`);
  }
  assert.doesNotThrow(() => validateUiSteps(parseUiSteps(nasty.join("\n"))));
  assert.doesNotThrow(() => parsePreconditions(nasty.join("\n")));
  assert.doesNotThrow(() => classifyCrossLayer(nasty.join("\n")));
});

test("CORPUS: suite 042 does not compile TODAY — this is the authoring gap, stated as a number", () => {
  // Not a defect to fix in the parser: it is the measurement that justifies the generator. If a
  // future change makes this pass without 042 being re-authored, the grammar got too permissive.
  // Resolved off import.meta.url, not process.cwd() — a test that only passes when run from the
  // repo root is a test that reports green for the wrong reason somewhere else.
  const file = fileURLToPath(
    new URL("../../regression/suites/Frontend/smoke/042-smoke-tests.csv", import.meta.url),
  );
  if (!existsSync(file)) return; // corpus not present (plugin-only checkout)

  // No cast: parseSuite returns { header, rows }, and an `as unknown as` here previously hid
  // exactly that from the typechecker.
  const { rows } = parseSuite(readFileSync(file, "utf-8"));
  const automatable = rows.filter((r) => (r.Automation_Status ?? "").trim().toLowerCase() !== "manual");

  assert.equal(rows.length, 34, "042 case count");
  assert.equal(automatable.length, 29, "5 cases are explicitly Manual and are never overruled");

  const compiling = automatable.filter((r) => {
    const stepErrors = validateUiSteps(parseUiSteps(r.Steps ?? ""));
    const assertions = parseUiAssertions(r.Assertions ?? "");
    return stepErrors.length === 0 && assertions.length > 0 && assertions.every((a) => a.tag !== "UNKNOWN");
  });
  assert.equal(compiling.length, 0, "042 is prose today; the generator is what changes this");
});

// ---------------------------------------------------------------------------------------------
// Delegated GraphQL blocks inside a UI case
// ---------------------------------------------------------------------------------------------

test("delegated: a [GQL-OP <label>] block absorbs its untagged continuation lines", () => {
  // The GraphQL grammar is MULTI-LINE and brackets its label INSIDE the tag. A purely line-based
  // pass reads the query body as untagged prose and rejects exactly the shape the design depends
  // on — state setup through xAPI, verification through the DOM. Found by a classifier test.
  const steps = parseUiSteps([
    "[GQL-OP seed]",
    "  mutation { addItem { id } }",
    "[GQL-EXEC seed]",
    "[NAV] {{FRONT_URL}}/cart",
    "[ACT] click role=button name='Checkout'",
  ].join("\n"));
  assert.deepEqual(steps.map((s) => s.tag), ["GQL", "GQL", "NAV", "ACT"]);
  assert.match(steps[0].raw, /mutation \{ addItem/, "the body travels with its block");
});

test("delegated: a GQL block may precede the first [NAV] without tripping validation", () => {
  const errors = validateUiSteps(parseUiSteps([
    "[GQL-OP seed]",
    "  mutation { addItem { id } }",
    "[GQL-EXEC seed]",
    "[NAV] {{FRONT_URL}}/cart",
    "[ACT] click role=button name='Checkout'",
  ].join("\n")));
  assert.deepEqual(errors, []);
});

test("delegated: a GQL step is NOT a UI driver", () => {
  // A case whose only actions are GraphQL belongs to the GraphQL family and its existing runner.
  // If a GQL step counted as a driver, every runner-native case would be dragged into the UI
  // family and lose the executor it already has.
  const errors = validateUiSteps(parseUiSteps("[GQL-OP q]\n  query { cart { id } }\n[GQL-EXEC q]"));
  assert.ok(errors.some((e) => /nothing drives the page/.test(e)), errors.join(" | "));
});

test("delegated: the block pattern does not turn a spaced UI tag into a valid tag", () => {
  // GQL_BLOCK_RE accepts a space inside the bracket; TAG_RE must not. Otherwise `[ACT click]`
  // would parse as a tag named "ACT click" and its operand would vanish.
  const s = parseUiStepLine("[ACT click] role=button name='X'");
  assert.equal(s.tag, "UNKNOWN");
});

test("delegated: REST blocks are delegated on the same rule as GQL", () => {
  const steps = parseUiSteps("[REST-OP get]\n  GET /api/x\n[REST-EXEC get]\n[NAV] /cart\n[ACT] click role=link name='Cart'");
  assert.deepEqual(steps.map((s) => s.tag), ["GQL", "GQL", "NAV", "ACT"]);
});

// ---------------------------------------------------------------------------------------------
// Family membership is decided by the TAG, never by whether the operand compiled
// ---------------------------------------------------------------------------------------------

test("hasUiDriverTag: a prose [ACT] still claims the UI family", () => {
  // The bug this closes: isUiDriver only sees a step whose operand PARSED, so a case written
  // entirely in prose had no driver and fell through to the GraphQL family — meaning family
  // membership depended on authoring quality, and the worst-written cases were reported with the
  // wrong grammar's blocker codes. Real line from 042's SMK-013.
  assert.equal(hasUiDriverTag("[ACT] complete the card form per SMK-014"), true);
  assert.equal(parseUiStepLine("[ACT] complete the card form per SMK-014").tag, "UNKNOWN");
});

test("hasUiDriverTag: a prose [NAV] still claims the UI family", () => {
  assert.equal(hasUiDriverTag("[NAV] {{FRONT_URL}}/cart with one item in cart"), true);
});

test("hasUiDriverTag: GraphQL-only steps do not claim it", () => {
  assert.equal(hasUiDriverTag("[GQL-OP q]\n  query { cart { id } }\n[GQL-EXEC q]"), false);
});

test("hasUiDriverTag: untagged prose claims nothing", () => {
  assert.equal(hasUiDriverTag("Open the cart page\nClick Checkout"), false);
});

test("hasUiDriverTag: a [WAIT]/[ASSERT]-only cell is not a driver", () => {
  // Observing without acting is the hidden-coupling shape; it must not claim the family on the
  // strength of a wait.
  assert.equal(hasUiDriverTag("[WAIT] networkidle\n[ASSERT] [DOM] css='.x' visible"), false);
});

test("the tag decides the family, the operand decides whether it compiles", () => {
  // Both halves of the rule, stated as one assertion pair so they cannot drift apart.
  const prose = "[NAV] {{FRONT_URL}}/cart\n[ACT] click the big green button";
  assert.equal(hasUiDriverTag(prose), true, "claims the family");
  assert.ok(
    parseUiSteps(prose).some((s) => s.tag === "UNKNOWN"),
    "and still does not compile",
  );
});

// ---------------------------------------------------------------------------------------------
// name= — overloaded on purpose, and locale-independent
// ---------------------------------------------------------------------------------------------

test("locator: bare name= is the form control's name attribute", () => {
  // Locale-independent, which is the point: vc-frontend's inputs carry name="email" /
  // name="firstName" while their labels are i18n keys, and the language selector is under test.
  const { locator, error } = parseLocator("name='email'");
  assert.equal(error, undefined);
  assert.deepEqual(locator, { kind: "name", attr: "email" });
});

test("locator: name= beside role= is still the accessible-name modifier", () => {
  const { locator } = parseLocator("role=button name='Sign up'");
  assert.deepEqual(locator, { kind: "role", role: "button", name: "Sign up" });
});

test("locator: name= carries nth like any other key", () => {
  assert.equal(parseLocator("name='email' nth=1").locator?.nth, 1);
});

test("locator: name= plus another locator key is still rejected", () => {
  assert.match(parseLocator("name='email' css='.x'").error ?? "", /exactly one of/);
});

test("locator: the generated surface now covers the UI-kit prop form", () => {
  // Regression for a generator gap that inverted a documented finding: 39 test ids reach the DOM
  // through UI-kit props (test-id-input, test-id-dropdown) rather than the data-test-id
  // attribute, and scanning only the attribute hid all of them — then the absence was written up
  // as "sign-up.vue does not pass it", which is false. These five are prop-declared.
  for (const id of [
    "sign-up-password-input",
    "sign-up-email-input",
    "email-input",
    "password-input",
    "global-search-query-input",
  ]) {
    const { locator } = parseLocator(`testid='${id}'`);
    assert.equal(
      locator && "known" in locator ? locator.known : undefined,
      true,
      `${id} should be a known selector — it is declared via a UI-kit test-id prop`,
    );
  }
});
