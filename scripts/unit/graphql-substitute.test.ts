// Unit tests for scripts/lib/graphql-substitute.ts — the two harness defects
// found by REG-2026-08-24-1806 triage:
//
//   Defect 1 (PUSH-028, runner exit 3 "body is not valid JSON: Bad control
//   character in string literal at position 58"): a [GQL-CAPTURE] scalar is
//   stored with bare String(value) and spliced textually into a [GQL-VARS] JSON
//   body, so a live free-text value holding a newline / quote / backslash makes
//   the body unparsable and kills the case before any assertion runs.
//
//   Defect 2 (CAT-GQL-125, false FAIL): an assertion RHS naming an env var
//   compared the LITERAL "{{CURRENCY_CODE}}" against "USD" — the Steps path
//   resolves {{VAR}} then {{ENV}}, the assertion path did only {{VAR}}.
//
// Run: `npx tsx --test scripts/unit/graphql-substitute.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  substituteVars,
  substituteEnv,
  substituteIntoJson,
  substituteIntoRestOp,
  makeVarLookup,
  withEnvFallback,
  escapeJsonStringInner,
} from "../lib/graphql-substitute.ts";
import { evaluateAssertion, parseAssertions } from "../lib/graphql-assertions.ts";
import type { GraphQLResponse } from "../lib/graphql-executor.ts";

// The pre-fix pipeline, kept verbatim so each test can show WHAT it fixes:
// substituteEnv(substituteVars(body)) → JSON.parse(). Every "before" assertion
// below drives this, so the file is a live reproduction, not just a regression net.
function naiveTwoPass(
  s: string,
  vars: Record<string, string>,
  env: Record<string, string> = {}
): string {
  const first = s.replace(/\{\{(\w+)\}\}/g, (_m, n: string) =>
    Object.prototype.hasOwnProperty.call(vars, n) ? vars[n] : `{{${n}}}`
  );
  return first.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => env[n] ?? `{{${n}}}`);
}

function gqlResponse(data: unknown): GraphQLResponse {
  return { status: 200, ok: true, data, errors: [], rawBody: "", elapsed_ms: 1 };
}

// ─── Defect 1 — [GQL-CAPTURE] scalars spliced into a [GQL-VARS] JSON body ─────

// PUSH-028's exact shape: [GQL-CAPTURE sample.…items.0.shortMessage → KW_REAL]
// then [GQL-VARS keyword_pos] {"keyword": "{{KW_REAL}}"}.
const KEYWORD_TEMPLATE = '{"keyword": "{{KW_REAL}}"}';

test("defect 1 — a captured value with a raw NEWLINE keeps the [GQL-VARS] body parsable", () => {
  const captured = "AGENT-TEST maintenance window\nstarts at 22:00 UTC";

  // before: this is the runtime fatal the run actually hit.
  assert.throws(
    () => JSON.parse(naiveTwoPass(KEYWORD_TEMPLATE, { KW_REAL: captured })),
    /Bad control character|Unexpected|Invalid/i
  );

  // after: parses, and the value survives byte-for-byte.
  const body = substituteIntoJson(KEYWORD_TEMPLATE, makeVarLookup({ KW_REAL: captured }, {}));
  assert.deepEqual(JSON.parse(body), { keyword: captured });
});

test("defect 1 — a captured value with a DOUBLE QUOTE does not terminate the JSON string", () => {
  const captured = 'Order "Rush" shipping enabled';

  // before: the embedded quote closes the string early and corrupts the object.
  const naive = naiveTwoPass(KEYWORD_TEMPLATE, { KW_REAL: captured });
  assert.throws(() => JSON.parse(naive), /Unexpected|Expected/i);

  const body = substituteIntoJson(KEYWORD_TEMPLATE, makeVarLookup({ KW_REAL: captured }, {}));
  assert.deepEqual(JSON.parse(body), { keyword: captured });
});

test("defect 1 — a captured value with a BACKSLASH survives instead of forming an escape", () => {
  const captured = "path C:\\temp\\notice";

  // before: `\t` and `\n` become escape sequences — silently WRONG, not a throw.
  // A silent corruption is the worse half of this defect: the case ran and
  // asserted against a keyword the server never saw.
  const naive = JSON.parse(naiveTwoPass(KEYWORD_TEMPLATE, { KW_REAL: captured })) as {
    keyword: string;
  };
  assert.notEqual(naive.keyword, captured);
  assert.equal(naive.keyword, "path C:\temp\notice");

  const body = substituteIntoJson(KEYWORD_TEMPLATE, makeVarLookup({ KW_REAL: captured }, {}));
  assert.deepEqual(JSON.parse(body), { keyword: captured });
});

test("defect 1 — tab, carriage return and a lone control char are all escaped", () => {
  const captured = "a\tb\r\nc\u0001d";
  const body = substituteIntoJson(KEYWORD_TEMPLATE, makeVarLookup({ KW_REAL: captured }, {}));
  assert.deepEqual(JSON.parse(body), { keyword: captured });
});

test("defect 1 — escaping is per-occurrence: several vars in one body", () => {
  const template = '{"topic": "{{T}}", "shortMessage": "{{M}}", "count": {{N}}}';
  const body = substituteIntoJson(
    template,
    makeVarLookup({ T: 'a"b', M: "line1\nline2", N: "3" }, {})
  );
  assert.deepEqual(JSON.parse(body), { topic: 'a"b', shortMessage: "line1\nline2", count: 3 });
});

// ─── Defect 1, the other half — UNQUOTED substitution must stay raw ───────────

test("a capture in an UNQUOTED position is still spliced raw (object round-trip)", () => {
  // The deliberate behaviour the fix must not break: a non-scalar capture is
  // JSON.stringify'd at capture time so it round-trips verbatim into an
  // unquoted slot. Escaping it here would post the JSON as a string literal.
  const captured = '{"a":1,"b":[2,3]}';
  const body = substituteIntoJson(
    '{"payload": {{CAPTURED_OBJ}}}',
    makeVarLookup({ CAPTURED_OBJ: captured }, {})
  );
  assert.deepEqual(JSON.parse(body), { payload: { a: 1, b: [2, 3] } });
});

test("a numeric/boolean scalar in an UNQUOTED position stays a JSON number/boolean", () => {
  const body = substituteIntoJson(
    '{"quantity": {{QTY}}, "selected": {{SEL}}}',
    makeVarLookup({ QTY: "1568", SEL: "true" }, {})
  );
  assert.deepEqual(JSON.parse(body), { quantity: 1568, selected: true });
});

test("a scalar substituted into a GraphQL DOCUMENT body is untouched (not JSON context)", () => {
  // [GQL-OP] bodies keep the context-blind textual path — currencyCode: "{{CURRENCY_CODE}}"
  // is GraphQL source, not JSON, and must not be escaped or quoted by us.
  const doc = 'query { product(id: "{{PROD_ID}}" currencyCode: "{{CURRENCY_CODE}}") { id } }';
  const out = substituteEnv(substituteVars(doc, { PROD_ID: "abc-123" }), {
    CURRENCY_CODE: "USD",
  });
  assert.equal(out, 'query { product(id: "abc-123" currencyCode: "USD") { id } }');
});

test("an already-escaped quote in the template does not confuse the string scanner", () => {
  const template = '{"note": "he said \\"hi\\"", "v": "{{V}}"}';
  const body = substituteIntoJson(template, makeVarLookup({ V: 'x"y' }, {}));
  assert.deepEqual(JSON.parse(body), { note: 'he said "hi"', v: 'x"y' });
});

test("an unknown variable is left verbatim so it stays diagnosable", () => {
  const body = substituteIntoJson(KEYWORD_TEMPLATE, makeVarLookup({}, {}));
  assert.equal(body, KEYWORD_TEMPLATE);
});

test("a captured value containing {{…}} is not re-substituted (no second round)", () => {
  const body = substituteIntoJson(
    KEYWORD_TEMPLATE,
    makeVarLookup({ KW_REAL: "literal {{NOT_A_VAR}} text" }, {})
  );
  assert.deepEqual(JSON.parse(body), { keyword: "literal {{NOT_A_VAR}} text" });
});

test("a bag value carrying an {{ENV}} token still resolves through (Test_Data indirection)", () => {
  // PUSH-028's own Test_Data: `store_id={{STORE_ID}}` — the old two-pass got
  // this via substituteEnv running over substituteVars' output.
  const body = substituteIntoJson(
    '{"storeId": "{{store_id}}"}',
    makeVarLookup({ store_id: "{{STORE_ID}}" }, { STORE_ID: "B2B-store" })
  );
  assert.deepEqual(JSON.parse(body), { storeId: "B2B-store" });
});

test("escapeJsonStringInner returns the string body with no surrounding quotes", () => {
  assert.equal(escapeJsonStringInner('a"b'), 'a\\"b');
  assert.equal(escapeJsonStringInner("a\nb"), "a\\nb");
});

// ─── Defect 1 — the same splice through a [REST-OP] Body: line ────────────────

test("[REST-OP] Body: JSON is escaped while the request line and headers are not", () => {
  // ORGROLE-009/013 shape: create_org.…name → ORG_NAME re-posted in a REST body.
  const block = [
    "POST {{BACK_URL}}/api/organizations",
    "Content-Type: application/json",
    'Body: {"name": "{{ORG_NAME}}", "id": "{{ORG_ID}}"}',
  ].join("\n");

  const out = substituteIntoRestOp(
    block,
    { ORG_NAME: 'Acme "Ltd"\nDivision', ORG_ID: "org-1" },
    { BACK_URL: "https://back.example" }
  );
  const lines = out.split("\n");
  assert.equal(lines[0], "POST https://back.example/api/organizations");
  assert.equal(lines[1], "Content-Type: application/json");
  assert.deepEqual(JSON.parse(lines[2].replace(/^Body:\s*/, "")), {
    name: 'Acme "Ltd"\nDivision',
    id: "org-1",
  });
  // The escaped value must stay on ONE line — parseRestOp reads `Body:` as a
  // single line, so an unescaped newline would truncate the payload silently.
  assert.equal(lines.length, 3);
});

test("[REST-OP] a non-JSON Body (multipart file spec) keeps the plain textual path", () => {
  const block = [
    "POST {{BACK_URL}}/api/files/product-configuration",
    "Content-Type: multipart/form-data",
    "Body: file=@test-data/uploads/{{FILE}} (mimeType: image/png; filename: Logo1.png)",
  ].join("\n");
  const out = substituteIntoRestOp(block, { FILE: "logo.png" }, { BACK_URL: "https://b" });
  assert.match(out, /Body: file=@test-data\/uploads\/logo\.png \(mimeType: image\/png/);
});

// ─── Defect 2 — {{VAR}} in an assertion right-hand side ──────────────────────

test("defect 2 — withEnvFallback resolves an env-backed assertion RHS", () => {
  const merged = withEnvFallback({ product_id: "p-1" }, { CURRENCY_CODE: "USD" });
  assert.equal(merged.CURRENCY_CODE, "USD");
  assert.equal(merged.product_id, "p-1");
});

test("defect 2 — the case bag OVERRIDES env (documented precedence)", () => {
  const merged = withEnvFallback({ CURRENCY_CODE: "EUR" }, { CURRENCY_CODE: "USD" });
  assert.equal(merged.CURRENCY_CODE, "EUR");
});

test("defect 2 — a bag value that is itself an {{ENV}} token resolves through", () => {
  const merged = withEnvFallback({ store_id: "{{STORE_ID}}" }, { STORE_ID: "B2B-store" });
  assert.equal(merged.store_id, "B2B-store");
});

test("defect 2 — CAT-GQL-125's assertion passes with the merged bag and fails without", () => {
  const line = "[DATA label=get_product_usd] data.product.price.actual.currency.code = {{CURRENCY_CODE}}";
  const { assertions } = parseAssertions(line);
  assert.equal(assertions.length, 1);

  const responses = new Map<string, GraphQLResponse>([
    ["get_product_usd", gqlResponse({ product: { price: { actual: { currency: { code: "USD" } } } } })],
  ]);
  const bag = { product_id: "p-1" }; // CURRENCY_CODE lives in .env.defaults, not Test_Data

  // before: the raw bag leaves the token literal — a false FAIL on a passing product.
  const before = evaluateAssertion(assertions[0], responses, bag);
  assert.equal(before.passed, false);
  assert.match(before.expected, /\{\{CURRENCY_CODE\}\}/);

  // after: env fallback makes it compare USD to USD.
  const after = evaluateAssertion(
    assertions[0],
    responses,
    withEnvFallback(bag, { CURRENCY_CODE: "USD" })
  );
  assert.equal(after.passed, true, `expected PASS, got expected=${after.expected} actual=${after.actual}`);
  assert.match(after.expected, /= USD$/);
  assert.doesNotMatch(after.expected, /\{\{/);
});

test("defect 2 — a captured variable in an assertion RHS keeps working unchanged", () => {
  const line = "[DATA label=read_back] data.cart.items[?id={{LINE_ITEM_ID}}].quantity = 1568";
  const { assertions } = parseAssertions(line);
  const responses = new Map<string, GraphQLResponse>([
    ["read_back", gqlResponse({ cart: { items: [{ id: "li-9", quantity: 1568 }] } })],
  ]);
  const r = evaluateAssertion(
    assertions[0],
    responses,
    withEnvFallback({ LINE_ITEM_ID: "li-9" }, { LINE_ITEM_ID: "SHOULD-NOT-WIN" })
  );
  assert.equal(r.passed, true);
});

test("defect 2 — an assertion var known to NOBODY still reports the literal token", () => {
  const line = "[DATA label=x] data.a = {{NEVER_CAPTURED}}";
  const { assertions } = parseAssertions(line);
  const responses = new Map<string, GraphQLResponse>([["x", gqlResponse({ a: "1" })]]);
  const r = evaluateAssertion(assertions[0], responses, withEnvFallback({}, {}));
  assert.equal(r.passed, false);
  assert.match(r.expected, /\{\{NEVER_CAPTURED\}\}/);
});
