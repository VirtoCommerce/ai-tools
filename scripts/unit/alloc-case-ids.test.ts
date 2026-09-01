// Unit tests for scripts/test-cases/alloc-case-ids.ts — the pre-fan-out ID
// allocator behind `npm run tc:alloc`.
//
// What this protects: `--check-global-ids` in the appender reads the corpus at
// APPEND time, so two concurrent layer batches both pass the check and then
// both write. A cross-suite duplicate ID silently overwrites the other suite's
// per-case results and failure evidence at run time, which is why allocation
// has to happen ONCE, before the fan-out. The arithmetic below is the whole
// guarantee, so it is tested rather than eyeballed — in particular that blocks
// are contiguous, disjoint, and inclusive at both ends (an off-by-one here
// hands two batches the same id and reintroduces exactly the bug the tool
// exists to prevent).
//
// The round-trip test is the contract with `tc:scaffold`: whatever this prints
// must parse back to the same count on the other side.
// Run: `npx tsx --test scripts/unit/alloc-case-ids.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, formatId, highestUsed, parseBlockArg } from "../test-cases/alloc-case-ids.js";
import { parseIdBlock } from "../test-cases/scaffold-rows.js";

test("highestUsed reads only its own prefix", () => {
  const corpus = ["MSNA-001", "MSNA-023", "MSN-900", "MSNAX-050", "CART-777"];
  assert.equal(highestUsed("MSNA", corpus), 23);
  assert.equal(highestUsed("MSN", corpus), 900);
});

test("highestUsed returns 0 for a prefix nothing uses yet", () => {
  assert.equal(highestUsed("BRAND", ["MSNA-001"]), 0);
});

test("highestUsed ignores ids that only look like the prefix", () => {
  // `MSNA-12a` and `XMSNA-004` are not this prefix's ids; treating either as
  // one would move the allocation window for no reason.
  assert.equal(highestUsed("MSNA", ["MSNA-12a", "XMSNA-004", "MSNA-007"]), 7);
});

test("allocate starts one past the highest used id", () => {
  const [a] = allocate("MSNA", [{ name: "admin", count: 3 }], 23);
  assert.equal(a.start, 24);
  assert.equal(a.end, 26);
  assert.equal(a.first, "MSNA-024");
  assert.equal(a.last, "MSNA-026");
});

test("allocate lays blocks out contiguously and disjointly", () => {
  const blocks = allocate("MSNA", [
    { name: "admin", count: 6 },
    { name: "storefront", count: 4 },
    { name: "graphql", count: 2 },
  ], 23);
  assert.deepEqual(
    blocks.map((b) => [b.start, b.end]),
    [
      [24, 29],
      [30, 33],
      [34, 35],
    ],
  );
  // No id appears in two blocks.
  const seen = new Set<number>();
  for (const b of blocks)
    for (let n = b.start; n <= b.end; n += 1) {
      assert.ok(!seen.has(n), `id ${n} allocated twice`);
      seen.add(n);
    }
  assert.equal(seen.size, 12);
});

test("a single-id block is start === end, not an empty range", () => {
  const [a] = allocate("MSNA", [{ name: "one", count: 1 }], 5);
  assert.equal(a.start, 6);
  assert.equal(a.end, 6);
  assert.equal(a.count, 1);
});

test("allocate on a brand-new prefix starts at 001", () => {
  const [a] = allocate("BRAND", [{ name: "admin", count: 2 }], 0);
  assert.equal(a.first, "BRAND-001");
  assert.equal(a.last, "BRAND-002");
});

test("formatId pads to three digits and does not truncate past them", () => {
  assert.equal(formatId("MSNA", 7), "MSNA-007");
  assert.equal(formatId("MSNA", 1234), "MSNA-1234");
});

test("parseBlockArg accepts <name>=<count> and rejects the rest", () => {
  assert.deepEqual(parseBlockArg("admin=12"), { name: "admin", count: 12 });
  assert.throws(() => parseBlockArg("admin"), /not <name>=<count>/);
  assert.throws(() => parseBlockArg("admin=0"), /at least one id/);
  assert.throws(() => parseBlockArg("=5"), /not <name>=<count>/);
});

test("round trip: every idBlock tc:alloc prints parses back to the same window", () => {
  const blocks = allocate("MSNA", [
    { name: "admin", count: 6 },
    { name: "storefront", count: 4 },
  ], 23);
  for (const b of blocks) {
    const parsed = parseIdBlock(b.idBlock);
    assert.equal(parsed.prefix, "MSNA");
    assert.equal(parsed.start, b.start);
    assert.equal(parsed.count, b.count, `${b.idBlock} must permit exactly ${b.count} rows`);
  }
});
