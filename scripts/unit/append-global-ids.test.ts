// Unit tests for `collectCorpusIds` in scripts/test-cases/append-test-cases-to-suite.ts —
// the cross-suite ID collision scan behind `--check-global-ids`, required by
// /qa-test-lifecycle Phase 6P (gate G12).
//
// Why this exists: the appender's in-suite `existingIds` check cannot see an ID that
// already lives in a DIFFERENT suite, and that is precisely the collision which
// overwrites the other suite's per-case failure evidence at run time
// (memory `reference_case_ids_must_be_globally_unique`).
// Run: `npx tsx --test scripts/unit/append-global-ids.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { COLUMNS, collectCorpusIds } from "../test-cases/append-test-cases-to-suite.js";

const HEADER = COLUMNS.join(",");

/** Minimal 15-column suite CSV holding the given IDs. */
function suiteCsv(ids: string[]): string {
  const row = (id: string) =>
    [id, `Title ${id}`, "Section", "Medium", "BL-X-001", "", "pre", "@td(A.b)", "[UI] x", "[ASSERT] y", "", "sig", "", "", "Draft"].join(",");
  return `${HEADER}\n${ids.map(row).join("\n")}\n`;
}

function withCorpus(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "vc-corpus-"));
  try {
    mkdirSync(join(root, "Frontend", "cart"), { recursive: true });
    mkdirSync(join(root, "Backend", "orders"), { recursive: true });
    writeFileSync(join(root, "Frontend", "cart", "028-cart.csv"), suiteCsv(["CART-001", "CART-002"]));
    writeFileSync(join(root, "Backend", "orders", "017-orders.csv"), suiteCsv(["ORD-001", "CART-001"]));
    writeFileSync(join(root, "Frontend", "cart", "notes.md"), "not a csv — must be ignored");
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("collects IDs recursively across nested suite directories", () => {
  withCorpus((root) => {
    const ids = collectCorpusIds(root);
    assert.deepEqual([...ids.keys()].sort(), ["CART-001", "CART-002", "ORD-001"]);
  });
});

test("maps an ID to EVERY file holding it (so the error can name them)", () => {
  withCorpus((root) => {
    const ids = collectCorpusIds(root);
    assert.equal(ids.get("CART-001")!.length, 2, "CART-001 exists in two suites");
    assert.equal(ids.get("ORD-001")!.length, 1);
  });
});

test("excludeFile drops the target suite — its own IDs are the in-suite check's job", () => {
  withCorpus((root) => {
    const target = join(root, "Frontend", "cart", "028-cart.csv");
    const ids = collectCorpusIds(root, target);
    // CART-002 lived only in the excluded target ⇒ gone. CART-001 survives via the orders suite.
    assert.equal(ids.has("CART-002"), false);
    assert.equal(ids.get("CART-001")!.length, 1);
    assert.match(ids.get("CART-001")![0], /017-orders\.csv$/);
  });
});

test("ignores non-CSV files", () => {
  withCorpus((root) => {
    const ids = collectCorpusIds(root);
    for (const files of ids.values()) for (const f of files) assert.match(f, /\.csv$/);
  });
});

test("a missing root yields an empty map instead of throwing", () => {
  const ids = collectCorpusIds(join(tmpdir(), "vc-corpus-does-not-exist-12345"));
  assert.equal(ids.size, 0);
});

test("header row is never harvested as a case ID", () => {
  withCorpus((root) => {
    assert.equal(collectCorpusIds(root).has("ID"), false);
  });
});
