#!/usr/bin/env tsx
/**
 * Test-isolation fix for the GraphQL xCart suites (050b1–b5).
 *
 * Problem: cart ops authored without an explicit `cartName` let `clearCart`,
 * `cart()` and `addItem` resolve to DIFFERENT carts (the storefront's "active"
 * cart can be a regenerating named cart, e.g. AGENT-TEST-ORDER-013), so a
 * case's pre_clear never empties the cart its read-back queries, and prior
 * suites' residual cart state contaminates later ones.
 *
 * Fix: insert an explicit, consistent `cartName: "default"` into every
 * cartName-accepting op that LACKS one. Existing cartName values (the
 * intentional multi-cart tests in 050b3) are never modified.
 *
 * Operates on the RAW CSV text (not a parse→stringify round-trip) so the diff
 * is limited to the inserted cartName substrings — all other quoting/formatting
 * is byte-preserved. CSV fields escape quotes by doubling them, so the inserted
 * literal uses doubled quotes: cartName: ""default"".
 *
 * Usage:
 *   npx tsx scripts/migrate-cart-name-isolation.ts [suiteFilter...]            # dry-run
 *   npx tsx scripts/migrate-cart-name-isolation.ts [suiteFilter...] --apply    # write
 */
import { readFileSync, writeFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const DIR = "regression/suites/Backend/graphql";
const ALL_SUITES = [
  "050b1-graphql-xcart-basic.csv",
  "050b2-graphql-xcart-items.csv",
  "050b3-graphql-xcart-lifecycle.csv",
  "050b4-graphql-xcart-cross-domain.csv",
  "050b5-graphql-xcart-validation.csv",
];
const filters = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SUITES = filters.length ? ALL_SUITES.filter((s) => filters.some((f) => s.includes(f))) : ALL_SUITES;

// mutations whose Input*Type accepts cartName (createOrderFromCart=cartId,
// mergeCart=secondCartId are intentionally excluded)
const CART_MUTATIONS = [
  "clearCart", "addItem", "addBulkItemsCart", "updateCartQuantity",
  "changeCartItemQuantity", "changeCartItemPrice", "removeCartItem", "removeCartItems",
  "addCoupon", "removeCoupon", "addOrUpdateCartShipment", "addOrUpdateCartPayment",
  "changeComment", "addOrUpdateCartItems",
];
// raw form: CSV escapes embedded quotes by doubling them
const CART_NAME = 'cartName: ""default"" ';

/** Index just past the matching closer for an opener at `open`. */
function matchClose(s: string, open: number, oc: string, cc: string): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === oc) depth++;
    else if (s[i] === cc) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Insert cartName into mutation `command: { ... }` blocks lacking it. */
function fixMutations(text: string): { out: string; n: number } {
  let out = text, n = 0;
  for (const mut of CART_MUTATIONS) {
    let from = 0;
    while (true) {
      const opIdx = out.indexOf(`${mut}(command:`, from);
      if (opIdx === -1) break;
      const brace = out.indexOf("{", opIdx);
      if (brace === -1) { from = opIdx + mut.length; continue; }
      const end = matchClose(out, brace, "{", "}");
      if (end === -1) { from = brace + 1; continue; }
      const block = out.slice(brace, end + 1);
      if (!/cartName/.test(block)) {
        out = out.slice(0, brace + 1) + " " + CART_NAME + out.slice(brace + 1);
        n++;
        from = brace + 1 + CART_NAME.length + 1;
      } else {
        from = end + 1;
      }
    }
  }
  return { out, n };
}

/** Insert cartName into `cart( ... )` entity-query blocks lacking it. */
function fixCartQuery(text: string): { out: string; n: number } {
  let out = text, n = 0, from = 0;
  while (true) {
    const idx = out.indexOf("cart(", from);
    if (idx === -1) break;
    const prev = out[idx - 1];
    if (prev && /[A-Za-z]/.test(prev)) { from = idx + 5; continue; } // clearCart(, etc.
    const close = matchClose(out, idx + 4, "(", ")");
    if (close === -1) { from = idx + 5; continue; }
    const block = out.slice(idx, close + 1);
    if (!/cartName/.test(block) && /storeId/.test(block)) { // cart() entity query, not carts()
      out = out.slice(0, idx + 5) + CART_NAME + out.slice(idx + 5);
      n++;
      from = idx + 5 + CART_NAME.length;
    } else {
      from = close + 1;
    }
  }
  return { out, n };
}

let grand = 0;
for (const file of SUITES) {
  const path = `${DIR}/${file}`;
  const raw = readFileSync(path, "utf-8");
  const a = fixMutations(raw);
  const b = fixCartQuery(a.out);
  const n = a.n + b.n;
  grand += n;
  console.log(`${file.replace("-graphql-xcart", "").replace(".csv", "").padEnd(16)} inserts=${n}`);
  if (APPLY && n > 0) writeFileSync(path, b.out);
}
console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"} — total cartName inserts: ${grand}`);
if (!APPLY) console.log("Re-run with --apply to write.");
