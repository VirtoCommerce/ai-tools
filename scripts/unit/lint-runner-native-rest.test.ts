// Unit tests for D-001's "runner-native" exemption — specifically that a PURE-REST
// runner-native case is exempt, not just a GraphQL one.
//
// Background. `lint-test-cases.ts` D-001 enforces the UI/Admin step grammar: one tag
// per line. Runner-native cases are exempt because they are parsed by
// `graphql-case-parser.ts`, whose `[GQL-OP]` / `[REST-OP]` blocks are deliberately
// MULTI-LINE (method+path, headers, `Body: {...}` each on their own line — see
// `.claude/knowledge/api/graphql-test-cases-runner.md` §3.7).
//
// The exemption predicate originally matched `[GQL-OP` only, so a case built entirely
// from `[AUTH]`/`[REST-OP]`/`[REST-EXEC]`/`[REST-CAPTURE]` — legal, runner-executable,
// no GraphQL anywhere — was judged against the single-tag-per-line grammar and emitted
// one false Critical per continuation line. Measured on the corpus at the time of the
// fix: 48 false Criticals in suite 087, 6 in 027b, 2 in 084, plus 23 while authoring
// 075d. All were D-001; D-002 and D-004 counts were unchanged, which is what identified
// them as a single false-positive class rather than real defects being suppressed.
//
// The third test is the load-bearing one: widening the predicate must NOT disable D-001
// for the browser/Admin cases it exists to police. A fix that silences a rule everywhere
// is not a fix.
//
// Run: `npx tsx --test scripts/unit/lint-runner-native-rest.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintRow } from "../test-cases/lint-test-cases.ts";
import { COLUMNS, type Row } from "../test-cases/append-test-cases-to-suite.ts";

/** Build a minimally-valid Row so only the Steps grammar is under test. */
function row(id: string, steps: string, extra: Partial<Row> = {}): Row {
  const base = Object.fromEntries(COLUMNS.map((c) => [c, ""])) as unknown as Row;
  return Object.assign(base, {
    ID: id,
    Title: `case ${id}`,
    Section: "Missions",
    Priority: "High",
    Preconditions: "Admin authenticated",
    Test_Data: "",
    Steps: steps,
    Assertions: "HTTP 200",
    Failure_Signals: "500 response; empty body",
    Cleanup: "none",
    References: "",
    Automation_Status: "Draft",
  }, extra);
}

const d001 = (r: Row) => lintRow(r, 0, new Map()).filter((f) => f.rule === "D-001");

test("a pure-REST runner-native case is exempt from D-001 (no [GQL-OP] anywhere)", () => {
  const steps = [
    "[AUTH admin]",
    "[REST-OP create_mission]",
    "POST {{BACK_URL}}/api/loyalty-missions",
    "Content-Type: application/json",
    'Body: {"name":"AGENT-TEST-MSN","storeId":"{{STORE_ID}}"}',
    "[REST-EXEC create_mission]",
  ].join("\n");

  const findings = d001(row("MSN-001", steps));
  assert.deepEqual(
    findings.map((f) => f.message),
    [],
    "REST-OP continuation lines are the documented multi-line body (§3.7), not untagged steps",
  );
});

test("a GraphQL runner-native case stays exempt (regression guard on the original behaviour)", () => {
  const steps = [
    "[AUTH customer]",
    "[GQL-OP missions]",
    "query { loyaltyMissionProgress { missionId status } }",
    "[GQL-EXEC missions]",
  ].join("\n");

  assert.deepEqual(d001(row("MSN-002", steps)), []);
});

test("D-001 still fires on a genuine UI/Admin case — widening must not disable the rule", () => {
  // No [GQL-OP] and no [REST-OP] => the UI grammar applies, and these untagged
  // prose lines are exactly what D-001 exists to catch.
  const steps = [
    "[NAV] {{BACK_URL}}/#/loyalty-missions",
    "Click the Missions blade",
    "Type a name into the field",
  ].join("\n");

  const findings = d001(row("MSNA-001", steps));
  assert.ok(
    findings.length >= 2,
    `expected D-001 on each untagged prose line, got ${findings.length}`,
  );
});

test("the exemption is keyed on the tag, not on the word REST appearing in prose", () => {
  // A UI case that merely mentions REST must NOT be exempted.
  const steps = [
    "[NAV] {{BACK_URL}}/#/loyalty-missions",
    "Observe the REST call in the network tab",
  ].join("\n");

  assert.ok(
    d001(row("MSNA-002", steps)).length >= 1,
    "prose containing 'REST' must not trigger the runner-native exemption",
  );
});

// --- the SAME class, third family, 2026-09-23 -------------------------------------------------
//
// [MCP-OP] repeated the [REST-OP] story exactly: a new multi-line runner-native block was added to
// the parser, the D-001 exemption predicate was not widened with it, and every MCP-only case was
// scored against the one-tag-per-line UI grammar. The visible cost this time was not a false
// Critical count but a stuck gate — `tc:promote` PR-008 lints a row AT ITS TARGET STATUS, so the
// phantom Critical held 8 cases at Draft that had just run green (REG-2026-09-23-M7: 31 of 32
// machine cases PASS, 0 promotable).
//
// Twice is a pattern, so state it: WIDENING THE PREDICATE IS PART OF ADDING A BLOCK FAMILY. Any
// future `[X-OP]` that carries a multi-line body must be added to `isRunnerGraphql` in the same
// commit as the parser support, or its cases silently fail a rule about a grammar they do not use.

test("a pure-MCP runner-native case is exempt from D-001 (no [GQL-OP]/[REST-OP] anywhere)", () => {
  const steps = [
    "[MCP-OP search1]",
    "search_products",
    '{ "store_id": "{{STORE_ID}}", "query": "{{SEARCH_TERM}}", "limit": 1 }',
    "[MCP-EXEC search1]",
    "[MCP-CAPTURE search1.products.0.id -> PRODUCT_ID]",
  ].join("\n");

  assert.deepEqual(
    d001(row("UCPA-030", steps)),
    [],
    "the tool name and the JSON argument line are [MCP-OP] BODY, not untagged step lines"
  );
});

test("widening for MCP does not disable D-001 for the browser/Admin cases it polices", () => {
  // The load-bearing inverse, same as the REST test above. A case with no runner-native op at all
  // must still be held to one tag per line — a fix that silences a rule everywhere is not a fix.
  const steps = ["[ACT] open the cart page", "click the Checkout button", "[VERIFY] the order summary renders"].join(
    "\n"
  );
  const findings = d001(row("CART-001", steps));
  assert.equal(findings.length, 1, `expected exactly the untagged line to be flagged: ${JSON.stringify(findings)}`);
  assert.match(findings[0].message, /click the Checkout button/);
});

test("an MCP case mixed with GraphQL discovery is exempt too — the common suite-102 shape", () => {
  const steps = [
    "[GQL-OP discover]",
    'query { products(storeId: "{{STORE_ID}}", first: 1) { items { code } } }',
    "[GQL-EXEC discover]",
    "[GQL-CAPTURE discover.data.products.items.0.code -> SEARCH_TERM]",
    "[MCP-OP cart1]",
    "create_cart",
    '{ "store_id": "{{STORE_ID}}", "line_items": [{ "product_id": "{{PRODUCT_ID}}", "quantity": 1 }] }',
    "[MCP-EXEC cart1]",
  ].join("\n");
  assert.deepEqual(d001(row("UCPA-007", steps)), []);
});
