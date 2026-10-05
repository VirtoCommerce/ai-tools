// Unit tests for the detection trial (REQ-01): the response mutants (scripts/detection/mutants.mjs),
// the scoring (scripts/detection/score.mjs) and the fetch preload (mutant-preload.mjs).
// Derivations only — what a mutant does to a response, how runs become verdicts, and that the
// preload rewrites GraphQL responses and nothing else.
// Run: `npx tsx --test scripts/unit/detection-mutants.test.mjs` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyMutant, applicableMutants } from "../detection/mutants.mjs";
import { scoreTrial, stableCleanCases } from "../detection/score.mjs";

const page = () => ({
  data: {
    products: {
      totalCount: 42,
      items: [
        { id: "a", price: { actual: { amount: 10, currency: { code: "USD" } } }, availabilityData: { isAvailable: true } },
        { id: "b", price: { actual: { amount: 20, currency: { code: "USD" } } }, availabilityData: { isAvailable: true } },
      ],
    },
  },
});

test("TRUNCATE_PAGE keeps totalCount and cuts the page — the catalog paging escape", () => {
  const input = page();
  const { body, applied } = applyMutant("TRUNCATE_PAGE", input);
  assert.equal(applied, true);
  assert.equal(body.data.products.items.length, 1);
  assert.equal(body.data.products.totalCount, 42);
  assert.equal(input.data.products.items.length, 2, "the input is never mutated");
});

test("a list without totalCount is not a page: TRUNCATE_PAGE does not apply, SORT_REVERSED does", () => {
  const list = { data: { cart: { items: [{ id: "x" }, { id: "y" }] } } };
  assert.equal(applyMutant("TRUNCATE_PAGE", list).applied, false);
  const { body, applied } = applyMutant("SORT_REVERSED", list);
  assert.equal(applied, true);
  assert.deepEqual(body.data.cart.items.map((i) => i.id), ["y", "x"]);
});

test("SILENT_ERROR adds an error next to the data and keeps the data", () => {
  const { body, applied } = applyMutant("SILENT_ERROR", page());
  assert.equal(applied, true);
  assert.equal(body.errors.length, 1);
  assert.equal(body.data.products.totalCount, 42);
});

test("money and flag mutants touch every matching node", () => {
  const zero = applyMutant("MONEY_ZERO", page()).body;
  assert.deepEqual(zero.data.products.items.map((i) => i.price.actual.amount), [0, 0]);
  const swapped = applyMutant("CURRENCY_SWAP", page()).body;
  assert.deepEqual(swapped.data.products.items.map((i) => i.price.actual.currency.code), ["EUR", "EUR"]);
  const flipped = applyMutant("FLAG_FLIP", page()).body;
  assert.deepEqual(flipped.data.products.items.map((i) => i.availabilityData.isAvailable), [false, false]);
});

test("a response with no data exercises nothing, so it can never count as caught", () => {
  assert.deepEqual(applicableMutants({ data: null, errors: [{ message: "x" }] }), []);
  assert.deepEqual(
    applicableMutants(page()).sort(),
    ["COUNT_DRIFT", "CURRENCY_SWAP", "DUPLICATE_ITEM", "EMPTY_PAGE", "FLAG_FLIP", "MONEY_ZERO", "SILENT_ERROR", "SORT_REVERSED", "TRUNCATE_PAGE"],
  );
  assert.throws(() => applyMutant("NOPE", page()), /unknown mutant/);
});

test("scoreTrial: killed, survived and not-exercised are distinct, and only killed counts", () => {
  const mutants = [
    { id: "A", archetype: "X", models: "" },
    { id: "B", archetype: "X", models: "" },
    { id: "C", archetype: "X", models: "" },
  ];
  const runs = [
    { mutant: "A", caseId: "c1", exit: 0, applied: true },
    { mutant: "A", caseId: "c2", exit: 1, applied: true },
    { mutant: "B", caseId: "c1", exit: 0, applied: true },
    { mutant: "B", caseId: "c2", exit: 1, applied: false }, // failed, but the mutant never applied
    { mutant: "C", caseId: "c1", exit: 3, applied: false },
  ];
  const r = scoreTrial({ mutants, runs });
  assert.deepEqual(r.mutants.map((m) => m.status), ["KILLED", "SURVIVED", "NOT_EXERCISED"]);
  assert.deepEqual(r.mutants[0].killedBy, ["c2"]);
  assert.equal(r.score, 0.5);
  assert.equal(scoreTrial({ mutants, runs: [] }).score, null);
});

test("stableCleanCases excludes a case that failed or flipped on the clean build", () => {
  const { stable, excluded } = stableCleanCases({ ok: [0, 0], flaky: [0, 1], broken: [1] });
  assert.deepEqual(stable, ["ok"]);
  assert.deepEqual(excluded.map((e) => e.id), ["flaky", "broken"]);
});

test("the preload rewrites a /graphql response and leaves other URLs alone", async () => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(page()));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const preload = pathToFileURL(fileURLToPath(new URL("../detection/mutant-preload.mjs", import.meta.url))).href;
  const script = `
    const g = await (await fetch("http://127.0.0.1:${port}/graphql", { method: "POST" })).json();
    const o = await (await fetch("http://127.0.0.1:${port}/api/other")).json();
    console.log(JSON.stringify([g.data.products.items.length, o.data.products.items.length]));`;
  // spawn asynchronously: a synchronous child would block this process's event loop, and with it
  // the server the child is talking to.
  const out = await new Promise((resolveOut) => {
    execFile(
      process.execPath,
      ["--import", preload, "--input-type=module", "-e", script],
      { env: { ...process.env, DETECTION_MUTANT: "TRUNCATE_PAGE", DETECTION_LOG: "" } },
      (err, stdout, stderr) => resolveOut({ err, stdout, stderr }),
    );
  });
  server.close();
  assert.equal(out.err, null, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout.trim()), [1, 2]);
});
