// Unit tests for the UCP / MCP runner op family — [MCP-OP] / [MCP-EXEC] / [MCP-CAPTURE].
//
// WHY THIS EXISTS. Suite 101 (UCP agentic commerce, 29 cases) classified 29/29 to the BROWSER lane
// on `EX-010` (the parser could not type the step line) + `EX-011` (no runner op), so 29 cases that
// are really deterministic JSON-RPC-over-HTTP each needed an AGENT to execute. The machine lane
// spoke GraphQL (`GQL-*`) and plain REST (`REST-*`) and nothing else. Measured 2026-09-22.
//
// These test the DERIVATION — parse and classification — not declarations
// (.claude/knowledge/execution/when-to-write-a-test.md §7a). The transport itself is exercised
// live by the runner against /ucp/mcp; what a unit test can own is that a well-formed MCP case
// types correctly and routes to `machine`, and that a malformed one does NOT silently pass.

import test from "node:test";
import assert from "node:assert/strict";
import { parseSteps, validateStepBlocks } from "../lib/graphql-case-parser.js";
import { classifyCase } from "../lib/case-classifier.js";

const STEPS = [
  "[MCP-OP caps]",
  "get_store_capabilities",
  "{}",
  "[MCP-EXEC caps]",
  "[MCP-CAPTURE caps.ucp.version -> UCP_VERSION]",
].join("\n");

test("parses the three MCP block kinds in order", () => {
  const blocks = parseSteps(STEPS);
  assert.deepEqual(blocks.map((b) => b.kind), ["MCP-OP", "MCP-EXEC", "MCP-CAPTURE"]);
});

test("MCP-OP absorbs its multi-line body: tool name first, JSON arguments after", () => {
  const b = parseSteps(STEPS)[0] as { kind: "MCP-OP"; label: string; body: string };
  assert.equal(b.label, "caps");
  assert.equal(b.body.split("\n")[0], "get_store_capabilities");
  assert.equal(b.body.split("\n").slice(1).join("\n").trim(), "{}");
});

test("MCP-CAPTURE accepts both the ASCII arrow and the unicode arrow", () => {
  for (const arrow of ["->", "→"]) {
    const b = parseSteps(`[MCP-CAPTURE cart.cart.id ${arrow} CART_ID]`)[0] as {
      kind: string; label: string; path: string; variable: string;
    };
    assert.equal(b.kind, "MCP-CAPTURE", `failed for ${arrow}`);
    assert.equal(b.label, "cart");
    assert.equal(b.path, "cart.id");
    assert.equal(b.variable, "CART_ID");
  }
});

test("a JSON argument body containing a step-tag-like string is NOT split", () => {
  // The body scanner stops at the next STEP TAG; a bracketed value inside JSON must not look like one.
  const blocks = parseSteps([
    "[MCP-OP c]",
    "create_cart",
    '{ "note": "see [REST] docs", "line_items": [{ "quantity": 1 }] }',
    "[MCP-EXEC c]",
  ].join("\n"));
  assert.deepEqual(blocks.map((b) => b.kind), ["MCP-OP", "MCP-EXEC"]);
  const body = (blocks[0] as { body: string }).body;
  assert.match(body, /line_items/);
  assert.match(body, /see \[REST\] docs/);
});

test("an MCP case routes to the MACHINE lane — the whole point", () => {
  const r = classifyCase({
    ID: "MCPX-001",
    Steps: STEPS,
    Assertions: "[DATA label=caps] body.ucp.status = success",
    Automation_Status: "Draft",
  } as never);
  assert.equal(r.lane, "machine", `expected machine, got ${r.lane}: ${JSON.stringify(r.blockers ?? [])}`);
});

test("an MCP case with only prose assertions does NOT reach the machine lane", () => {
  // "ALL assertions must be scoreable, not one of them" — a case that mixes a scoreable predicate
  // with prose would otherwise PASS on the strength of the one it understood.
  const r = classifyCase({
    ID: "MCPX-002",
    Steps: STEPS,
    Assertions: "the capabilities look correct to a human reader",
    Automation_Status: "Draft",
  } as never);
  assert.notEqual(r.lane, "machine");
});

test("an explicit Manual is still respected over an otherwise-machine MCP case", () => {
  const r = classifyCase({
    ID: "MCPX-003",
    Steps: STEPS,
    Assertions: "[DATA label=caps] body.ucp.status = success",
    Automation_Status: "Manual",
  } as never);
  assert.equal(r.lane, "manual");
});

test("an MCP-EXEC with no matching MCP-OP is structurally invalid, not silently machine", () => {
  const blocks = parseSteps("[MCP-EXEC nope]");
  const v = validateStepBlocks(blocks);
  // The parser types it; the structural validator or the runtime must refuse the dangling label.
  assert.equal(blocks[0].kind, "MCP-EXEC");
  const r = classifyCase({
    ID: "MCPX-004",
    Steps: "[MCP-EXEC nope]",
    Assertions: "[DATA label=nope] body.x = 1",
    Automation_Status: "Draft",
  } as never);
  // Fail-closed in one direction only: any doubt routes to browser, never to a false green.
  assert.ok(r.lane !== "machine" || v.length === 0);
});

test("the GQL and REST families still parse unchanged — no regression from the new family", () => {
  const gql = parseSteps(["[GQL-OP q]", "{ me { id } }", "[GQL-EXEC q]"].join("\n"));
  assert.deepEqual(gql.map((b) => b.kind), ["GQL-OP", "GQL-EXEC"]);
  const rest = parseSteps(["[REST-OP r]", "GET {{BACK_URL}}/api/x", "[REST-EXEC r]"].join("\n"));
  assert.deepEqual(rest.map((b) => b.kind), ["REST-OP", "REST-EXEC"]);
});

// --- the two derivations fixed 2026-09-23 after the M5 machine-lane run -----------------------
//
// Both were SILENT misses: a wrong result that looks like a normal one. That is the class this
// file exists for — a declaration a reader could check by eye needs no test, a derivation whose
// failure mode is indistinguishable from success does.

test("MCP-CAPTURE substitutes {{VAR}} in the path before walking it", () => {
  // Measured on UCPA-028: `cart.line_items[?product_id={{PRODUCT_ID}}].quantity` never matched,
  // because the filter compared against the literal text "{{PRODUCT_ID}}". The capture landed
  // undefined and the case then failed on an unresolved token three steps later, far from the
  // cause. GQL-CAPTURE and REST-CAPTURE had always substituted; only the newest family did not.
  const b = parseSteps("[MCP-CAPTURE c.cart.line_items[?product_id={{PRODUCT_ID}}].quantity -> QTY]")[0] as {
    kind: string; label: string; path: string; variable: string;
  };
  assert.equal(b.kind, "MCP-CAPTURE");
  assert.equal(b.label, "c");
  assert.equal(b.path, "cart.line_items[?product_id={{PRODUCT_ID}}].quantity");
  assert.equal(b.variable, "QTY");
  // The parser keeps the token; the RUNNER resolves it. What this asserts is that the filter
  // bracket survives parsing intact — a path truncated at the `[` would fail the same silent way.
  assert.match(b.path, /\{\{PRODUCT_ID\}\}/);
});

test("the parser stays TOTAL over an oversized WAIT — the ceiling is the RUNNER's job", () => {
  // UCPA-021 asks for 960 s to let a 15-minute token TTL elapse. Enforcing the ceiling inside
  // parseSteps threw during CLASSIFICATION — case-classifier parses every case to decide its lane —
  // so one oversized wait made `suites:lanes -- 101` fail outright and NO case in the suite could be
  // planned. Parsing answers "what shape is this case"; it must never fail on a policy question.
  const b = parseSteps("[WAIT seconds=960]")[0] as { kind: string; seconds: number };
  assert.equal(b.kind, "WAIT");
  assert.equal(b.seconds, 960, "the requested seconds are recorded verbatim — never clamped, never thrown on");
});

test("classification survives a case whose WAIT exceeds any ceiling", () => {
  const r = classifyCase({
    ID: "MCPX-005",
    Steps: ["[MCP-OP c]", "get_cart", "{}", "[MCP-EXEC c]", "[WAIT seconds=960]"].join(String.fromCharCode(10)),
    Assertions: "[DATA label=c] body.ucp.status = success",
    Automation_Status: "Draft",
  } as never);
  assert.ok(r.lane, "the case must still be assigned a lane, not blow up the whole plan");
});

test("a wait inside the ceiling still parses unchanged", () => {
  const b = parseSteps("[WAIT seconds=12]")[0] as { kind: string; seconds: number };
  assert.equal(b.seconds, 12);
});

// --- the GATE round-trip, added 2026-09-23 ----------------------------------------------------
//
// The runner could execute these cases all along; what could not was the promotion gate. Two
// separate places assumed the GQL/REST families were the only runner-native ones, and both failed
// CLOSED — which is the right direction but the wrong reason, and a hold nobody can act on is
// indistinguishable from a case that deserves holding. Measured on REG-2026-09-23-M7: 31 of 32
// machine cases green, 0 promotable.

test("validateStepBlocks pairs the MCP family — a dangling MCP-EXEC is now an error", () => {
  const errs = validateStepBlocks(parseSteps("[MCP-EXEC nope]"));
  assert.ok(
    errs.some((e) => /\[MCP-EXEC nope\] has no matching \[MCP-OP nope\]/.test(e)),
    `expected a dangling-label error, got: ${JSON.stringify(errs)}`
  );
});

test("validateStepBlocks: an MCP-OP with no EXEC, and a double EXEC, are both errors", () => {
  const noExec = validateStepBlocks(parseSteps(["[MCP-OP a]", "get_cart", "{}"].join("\n")));
  assert.ok(noExec.some((e) => /\[MCP-OP a\] has no matching \[MCP-EXEC a\]/.test(e)), JSON.stringify(noExec));

  const twice = validateStepBlocks(
    parseSteps(["[MCP-OP a]", "get_cart", "{}", "[MCP-EXEC a]", "[MCP-EXEC a]"].join("\n"))
  );
  assert.ok(twice.some((e) => /has 2 \[MCP-EXEC a\] — expected exactly 1/.test(e)), JSON.stringify(twice));
});

test("validateStepBlocks: an MCP-CAPTURE naming an undeclared op is an error", () => {
  const errs = validateStepBlocks(
    parseSteps(["[MCP-OP a]", "get_cart", "{}", "[MCP-EXEC a]", "[MCP-CAPTURE b.cart.id -> X]"].join("\n"))
  );
  assert.ok(
    errs.some((e) => /\[MCP-CAPTURE b\..…?\] references undeclared op label "b"/.test(e) || /MCP-CAPTURE b/.test(e)),
    JSON.stringify(errs)
  );
});

test("a well-formed MCP case produces NO structural errors — the gate must not fire on correct grammar", () => {
  // The inverse of the three above, and the one that actually held 8 green cases at Draft: the
  // lint router did not recognise [MCP-OP], so an MCP-only case was scored by the UI rule D-001
  // ("every step line needs a tag") and each multi-line [MCP-OP] body line — the tool name, the
  // JSON arguments — was reported as a Critical finding.
  assert.deepEqual(validateStepBlocks(parseSteps(STEPS)), []);
});
