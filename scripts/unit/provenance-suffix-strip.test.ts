// Unit tests for the provenance-suffix strip — the defect that made PRF-GQL-072 /
// PRF-GQL-076 report FAIL while the value under test was CORRECT.
//
// Authors write a grounding tag (Dim 10 / GRD-001) at the end of an assertion, and
// very often follow it with a parenthetical justification:
//
//   [DATA label=x] body.results[?organizationId={{ORG_ID}}].status = "Rejected" {SPEC} (REST cross-layer confirmation)
//
// PROVENANCE_SUFFIX_RE was anchored on `{TAG}$`, so a tag followed by a note never
// matched and the whole tail — including the expected value's own closing quote —
// stayed inside the operand. The predicate then compared against
// `Rejected" {SPEC} (…)` and failed against a correct actual of `Rejected`.
// 126 assertion lines across 12 suites were mis-comparing this way.
//
// Run: `npx tsx --test scripts/unit/provenance-suffix-strip.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAssertion, type Assertion } from "../lib/graphql-assertions.ts";

function dataAssertion(predicate: string): Assertion {
  return { raw: `[DATA label=r] ${predicate}`, kind: "DATA", label: "r", predicate };
}
function respond(body: unknown) {
  return new Map<string, any>([["r", { data: body, errors: [] }]]);
}

test("tag followed by a parenthetical note is stripped — the regression case", () => {
  const a = dataAssertion(
    'data.status = "Rejected" {SPEC} (REST cross-layer confirmation of the xAPI mutation effect)'
  );
  const r = evaluateAssertion(a, respond({ status: "Rejected" }), {});
  assert.equal(r.passed, true, `expected PASS, got: expected=${r.expected} actual=${r.actual}`);
  assert.ok(!r.expected.includes("{SPEC}"), "provenance tag leaked into the expected operand");
  assert.ok(!r.expected.includes("cross-layer"), "note leaked into the expected operand");
});

test("bare tag with no note still strips (the pre-existing behaviour)", () => {
  const r = evaluateAssertion(dataAssertion('data.status = "Rejected" {BL}'), respond({ status: "Rejected" }), {});
  assert.equal(r.passed, true);
});

test("no tag at all is untouched", () => {
  const r = evaluateAssertion(dataAssertion('data.status = "Rejected"'), respond({ status: "Rejected" }), {});
  assert.equal(r.passed, true);
});

test("a genuine mismatch still FAILS — the fix must not make everything pass", () => {
  const a = dataAssertion('data.status = "Rejected" {SPEC} (note)');
  const r = evaluateAssertion(a, respond({ status: "Approved" }), {});
  assert.equal(r.passed, false, "a wrong value must still fail after stripping");
});

// NOTE: an expected value that itself contains parentheses — `= "a (b)"` — does not
// evaluate today (the top-level operand splitter treats the parens as grouping and
// yields `lhs=? rhs=?`). That is a PRE-EXISTING evaluator limitation, unrelated to
// provenance stripping: it fails identically with and without a tag. What this test
// pins is the part the strip owns — the tag is removed and the expected operand is
// left clean — without asserting a comparison capability the evaluator lacks.
test("value containing parentheses: the tag is still stripped cleanly", () => {
  const r = evaluateAssertion(dataAssertion('data.label = "a (b)" {DOC}'), respond({ label: "a (b)" }), {});
  assert.equal(r.expected, 'data.label = "a (b)"', "the {DOC} tag must not survive into the operand");
  assert.ok(!r.expected.includes("{DOC}"));
});

test("a note containing nested parentheses is fully stripped", () => {
  const a = dataAssertion('data.status = "Rejected" {SPEC} (per BL-B2B-012 (the membership rule))');
  const r = evaluateAssertion(a, respond({ status: "Rejected" }), {});
  assert.equal(r.passed, true);
});

test("every grounding tag spelling is handled", () => {
  for (const tag of ["SPEC", "BL", "DOC", "OBSERVED", "HYPOTHESIS"]) {
    const a = dataAssertion(`data.status = "Rejected" {${tag}} (why)`);
    const r = evaluateAssertion(a, respond({ status: "Rejected" }), {});
    assert.equal(r.passed, true, `tag {${tag}} was not stripped`);
  }
});

// 2026-09-01 — the same defect, second spelling: a rationale introduced by a DASH
// instead of parentheses. Measured against the live evaluator before the fix, only
// [DATA] EQUALITY broke; COUNT comparisons and `is null` were tolerant. So the same
// assertion passed one way and failed the other, and the failure was a permanent
// silent FAIL that reads exactly like a product defect.

test("tag followed by an EM-DASH rationale is stripped — the 2026-09-01 regression case", () => {
  const a = dataAssertion('data.count = 34 {SPEC} \u2014 narrowed from the whole-history total, which co-completing missions move');
  const r = evaluateAssertion(a, respond({ count: 34 }), {});
  assert.equal(r.passed, true, `expected PASS, got: expected=${r.expected} actual=${r.actual}`);
  assert.ok(!r.expected.includes("{SPEC}"), "provenance tag leaked into the expected operand");
  assert.ok(!r.expected.includes("narrowed"), "dash-led rationale leaked into the expected operand");
});

test("en-dash and double-hyphen rationales strip too", () => {
  for (const dash of ["\u2013", "--"]) {
    const r = evaluateAssertion(dataAssertion(`data.status = "Completed" {BL} ${dash} per the reward-grant path`), respond({ status: "Completed" }), {});
    assert.equal(r.passed, true, `dash ${JSON.stringify(dash)} did not strip: expected=${r.expected}`);
  }
});

test("a quoted value survives a dash-led rationale", () => {
  const r = evaluateAssertion(dataAssertion('data.status = "Rejected" {DOC} \u2014 the note must not eat the closing quote'), respond({ status: "Rejected" }), {});
  assert.equal(r.passed, true, `expected PASS, got expected=${r.expected} actual=${r.actual}`);
});

test("a NON-dash, NON-parenthesised tail is left in place and fails loudly", () => {
  // Deliberate: that shape is a malformed assertion, not a rationale. A loud failure is
  // the correct outcome — the point of this fix is that a wrong answer must not arrive quietly.
  const r = evaluateAssertion(dataAssertion('data.count = 34 {SPEC} and also something else'), respond({ count: 34 }), {});
  assert.equal(r.passed, false, "a malformed tail must not be silently swallowed");
});
