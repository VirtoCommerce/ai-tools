// Unit tests for scripts/detection/gaps.ts — the REQ-12 gap list. Every function is a derivation over
// fixtures: which keys a suite cites, which BL domain a bug summary lands in, how escapes rank, and which
// mind-map nodes count as uncovered. The command's real figures are internal and never asserted here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignDomain, behaviorGaps, citedKeys, domainTable, domainTerms, escapeGaps, type Bug } from "../detection/gaps.ts";

const ORACLE = [
  "## Domain 2: Cart (BL-CART)",
  "## Domain 3: Checkout (BL-CHK)",
  "## Domain 9: Search (BL-SRCH)",
  "## Domain 25: Agentic Commerce / UCP (BL-UCP)",
].join("\n");
const domains = domainTerms(ORACLE);

const HEADER = "ID,Title,Steps,Assertions,Business_Rule,References";
const suite = `${HEADER}\nCART-001,Add item,step,assert,BL-CART-001,Regression for VCST-1001 and VP-22\n`;

test("citedKeys reads issue keys from any column of any row", () => {
  const keys = citedKeys([suite]);
  assert.ok(keys.has("VCST-1001") && keys.has("VP-22"));
  assert.ok(!keys.has("VCST-1002"));
});

test("a bug lands in the domain whose heading words its summary shares, else unassigned", () => {
  assert.deepEqual(domains.map((d) => d.token), ["cart", "chk", "srch", "ucp"]);
  assert.equal(assignDomain("Cart total wrong after coupon", domains), "cart");
  assert.equal(assignDomain("Checkout button misaligned", domains), "chk");
  assert.equal(assignDomain("Searching by SKU returns nothing", domains), "srch");
  assert.equal(assignDomain("Login page slow", domains), "unassigned");
});

const bugs: Bug[] = [
  { key: "VCST-1001", summary: "Cart loses item", labels: [], resolved: "2026-05-01" },
  { key: "VCST-1002", summary: "Cart total wrong", labels: [], resolved: "2026-06-01" },
  { key: "VCST-1003", summary: "Cart badge stale", labels: ["Support"], resolved: "2026-04-01" },
  { key: "VCST-1004", summary: "Search facet count", labels: [], resolved: "2026-07-01" },
];

test("escapes exclude cited bugs and rank customer-reported first, then newest", () => {
  const gaps = escapeGaps(bugs, citedKeys([suite]), domains);
  assert.deepEqual(gaps.map((g) => g.key), ["VCST-1003", "VCST-1004", "VCST-1002"]);
  assert.equal(gaps[0].support, true);
  assert.match(gaps[0].reason, /customer-reported/);
});

test("the domain table counts closed, cited and escapes, and the gap share per domain", () => {
  const rows = domainTable(bugs, citedKeys([suite]), domains);
  const cart = rows.find((r) => r.domain === "cart")!;
  assert.deepEqual({ ...cart, gapShare: Math.round(cart.gapShare * 100) }, { domain: "cart", closed: 3, cited: 1, escapes: 2, gapShare: 67 });
});

test("behaviour gaps are unstamped behaviours, branches and states, never containers or obsolete nodes", () => {
  const maps = [{ slug: "search", nodes: [
    { id: "srch.search", type: "feature" },
    { id: "srch.page", type: "behavior", name: "Paging" },
    { id: "srch.page.last", type: "branch" },
    { id: "srch.old", type: "branch", status: "OBSOLETE" },
    { id: "srch.empty", type: "state" },
  ] }];
  const gaps = behaviorGaps(maps, new Set(["srch.page"]));
  assert.deepEqual(gaps.map((g) => g.id), ["srch.page.last", "srch.empty"]);
  assert.match(gaps[0].reason, /no case carries Behavior:srch\.page\.last/);
});
