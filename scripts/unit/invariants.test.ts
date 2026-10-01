// Unit tests for scripts/invariants/ — the pure verdicts of the REQ-03 cross-cutting checks.
//
// Each check must pass on a clean listing and fail on every bug class it exists for (the response mutants
// of docs/bug-detection-requirements.md REQ-01): a check that passes a truncated or reordered listing is a
// presence assertion with extra steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageWalk, type WalkedPage } from "../invariants/page-walk.ts";
import { sortSet } from "../invariants/sort-set.ts";
import { layerParity } from "../invariants/layer-parity.ts";

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => `p${from + i}`);
const clean: WalkedPage[] = [
  { ids: ids(1, 3), totalCount: 7 },
  { ids: ids(4, 3), totalCount: 7 },
  { ids: ids(7, 1), totalCount: 7 },
];

test("PAGE-WALK passes a clean walk and catches each paging defect", () => {
  assert.deepEqual(pageWalk(clean, { pageSize: 3 }), { pass: true, violations: [] });
  const fails = (pages: WalkedPage[], re: RegExp, expectedCount?: number) => {
    const v = pageWalk(pages, { pageSize: 3, expectedCount });
    assert.equal(v.pass, false);
    assert.match(v.violations.join("\n"), re);
  };
  fails([clean[0], clean[1]], /totalCount says 7, the pages returned 6/); // last page dropped
  fails([clean[0], clean[0], clean[2]], /appears on page 1 and again on page 2/); // page 2 repeats page 1
  fails([clean[0], { ids: ids(4, 2), totalCount: 7 }, { ids: ids(6, 2), totalCount: 7 }], /page 2 is short/);
  fails([clean[0], { ...clean[1], totalCount: 8 }, clean[2]], /totalCount changed while walking/);
  fails(clean, /the count shown for it was 9/, 9); // facet says 9, listing holds 7
  fails([], /no page was fetched/);
});

test("SORT-SET passes a pure reorder and catches a changed set or a broken order", () => {
  const base = ["a", "b", "c"];
  const asc = [{ id: "b", key: 1 }, { id: "c", key: 2 }, { id: "a", key: 3 }];
  assert.equal(sortSet(base, asc, { direction: "asc" }).pass, true);
  assert.match(sortSet(base, asc.slice(0, 2)).violations.join(), /dropped 1 item\(s\): a/);
  assert.match(sortSet(base, [...asc, { id: "z", key: 4 }]).violations.join(), /added 1 item\(s\): z/);
  assert.match(sortSet(base, [...asc, asc[0]]).violations.join(), /repeats 1 item/);
  assert.match(sortSet(base, asc, { direction: "desc" }).violations.join(), /breaks the desc sort at position 2/);
  assert.equal(sortSet(base, [{ id: "a", key: "Zed" }, { id: "b", key: "alpha" }, { id: "c" }], {}).pass, true); // no direction: membership only
});

test("LAYER-PARITY passes equal layers and catches stale fields and ghost results", () => {
  const listed = new Map([["p1", { name: "Bolt ", price: 10.001 }], ["p2", { name: "Nut", price: 2 }]]);
  const same = new Map([["p1", { name: "Bolt", price: 10 }], ["p2", { name: "Nut", price: 2 }]]);
  assert.equal(layerParity(listed, same, ["name", "price"]).pass, true); // trimmed text, cents
  const stale = new Map([["p1", { name: "Bolt v2", price: 10 }], ["p2", null]]);
  const v = layerParity(listed, stale, ["name", "price"]);
  assert.equal(v.pass, false);
  assert.match(v.violations.join("\n"), /p1: name is "Bolt" in the listing, "Bolt v2" live/);
  assert.match(v.violations.join("\n"), /p2: listed by search but the live read finds no such product/);
  assert.match(layerParity(new Map(), same, ["name"]).violations.join(), /listing is empty/);
});
