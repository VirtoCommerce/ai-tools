/**
 * `evaluateNumericExpression` — which PATHS an arithmetic/approx DATA assertion can reach.
 *
 * The property under test is that a REST-backed number is as evaluable as a GraphQL one.
 * It was not: `PATH_RE` matched only paths rooted at the literal `data`, so a REST-EXEC
 * assertion — which arrives here with its `<label>.` prefix already stripped, as
 * `body.total` — left a literal path in the expression, failed the charset guard, and
 * returned `undefined`. Every `≈`/arithmetic DATA assertion on a REST body was therefore
 * ALWAYS RED regardless of the product.
 *
 * That is the worst shape a test bug can take: it manufactures a red on correct behaviour,
 * and it does so ONLY on the arithmetic branch — ordering (`<`, `>`) on the same REST path
 * worked — so one suite could compare the same number one way and never the other.
 * Measured 2026-09-14 on suite 075f (LOYORG-008 / LOYORG-018: the product was right both
 * times and a human re-derived the sums by hand).
 *
 * These tests go through the PUBLIC `evaluateAssertion`, not the private helper, so they
 * pin the behaviour a suite author actually gets.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAssertions, evaluateAssertion } from "../lib/graphql-assertions.ts";

/** Build the response shape the runner stores for a REST-EXEC block. */
const restResponse = (body: unknown) => ({ data: { status: 200, ok: true, body } });

/**
 * Evaluate a single assertion line against a response, keyed by the assertion's own
 * label so the label-stripping path in evaluateDataPredicate is exercised too.
 */
function run(line: string, r: unknown) {
  const { assertions } = parseAssertions(line);
  assert.equal(assertions.length, 1, `expected exactly 1 assertion from: ${line}`);
  const a = assertions[0];
  const responses = new Map([[a.label, r as never]]);
  return evaluateAssertion(a, responses, {});
}

test("REGRESSION: arithmetic on a REST body path evaluates instead of always-failing", () => {
  const r = restResponse({ total: 51, before: 49 });
  // The 075f LOYORG-008 shape: "the ledger grew by exactly 2".
  const ok = run("[DATA label=rest_bal] body.total - body.before = 2", r);
  assert.equal(ok.passed, true, `should PASS — got: ${ok.message ?? "(no message)"}`);

  // And it must still FAIL when the product is actually wrong.
  const bad = run("[DATA label=rest_bal] body.total - body.before = 3", r);
  assert.equal(bad.passed, false, "a wrong expectation must still fail");
});

test("a GraphQL `data.*` path keeps working exactly as before", () => {
  const r = { data: { cart: { total: 120, discount: 20 } } };
  assert.equal(run("[DATA] data.cart.total - data.cart.discount = 100", r).passed, true);
  assert.equal(run("[DATA] data.cart.total - data.cart.discount = 99", r).passed, false);
});

test("bracketed and numeric segments resolve (REST-CAPTURE path shapes)", () => {
  const r = restResponse([{ amount: 40 }, { amount: 60 }]);
  assert.equal(run("[DATA label=x] body.[0].amount + body.[1].amount = 100", r).passed, true);
});

test("a path that does not resolve to a number FAILS — it never silently passes", () => {
  const r = restResponse({ total: "not-a-number" });
  const res = run("[DATA label=x] body.total + 1 = 2", r);
  assert.equal(res.passed, false, "an unresolvable operand must not pass");
});

test("a bare word is not treated as a path, so a typo fails rather than resolving oddly", () => {
  const r = restResponse({ total: 10 });
  // `totl` (typo, no dot) must not be looked up as a path and must not pass.
  assert.equal(run("[DATA label=x] totl + 1 = 11", r).passed, false);
});

test("`metadata.x` is matched WHOLE — the old regex matched the `data.x` substring inside it", () => {
  // Latent mis-substitution fixed by rooting the pattern on [A-Za-z_].
  // Here `data` does not exist at all; only `metadata` does. Under the old regex the
  // `data.count` substring was substituted and a stray `meta` was left behind.
  const r = { data: { metadata: { count: 7 } } };
  assert.equal(run("[DATA] metadata.count = 7", r).passed, true);
  assert.equal(run("[DATA] metadata.count + 1 = 8", r).passed, true);
});

test("numeric literals are never mistaken for paths", () => {
  const r = restResponse({ total: 3 });
  assert.equal(run("[DATA label=x] body.total * 1.5 = 4.5", r).passed, true);
});
