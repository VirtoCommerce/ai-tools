// Unit tests for `derivesClickDriven` in scripts/test-cases/sync-test-suites.ts.
//
// This function encodes a JUDGEMENT — "would firefox be able to run this suite" — as data, so
// the scheduler stops re-deriving it from prose scattered across `.claude/rules/agents.md`,
// the manifest's `defaults._comment_fallbackChain`, and `browserPool[1].constraint`.
//
// It got that judgement WRONG on the first attempt, which is why these tests exist. The naive
// version tested for the mere presence of `[ACT]` and marked suite 049 (Platform API)
// click-driven. But `[ACT]` is overloaded: in a storefront suite it means click/fill, while all
// 37 of 049's `[ACT]` lines are REST calls (`[ACT] POST {{BACK_URL}}/api/pricing/evaluate`).
// The recorded run REG-2026-08-24-1806 contains a human making the same call by hand and
// getting it right — suite 049 scheduled on firefox with the note
// "REST/HTTP tags only, no clicking - safe on firefox". The oracle below is that human.
//
// Run: `npx tsx --test scripts/unit/click-driven-derivation.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { derivesClickDriven } from "../test-cases/sync-test-suites.ts";

const scratch = mkdtempSync(join(tmpdir(), "click-driven-"));

/** Write a throwaway CSV and derive from it. */
function derive(body: string): boolean | null {
  const path = join(scratch, `s-${Math.abs(hash(body))}.csv`);
  writeFileSync(path, body, "utf-8");
  return derivesClickDriven(path);
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ---- the 049 regression: `[ACT]` is not automatically a click -----------------------

test("an [ACT] that is an HTTP call is NOT a click", () => {
  assert.equal(derive("[ACT] POST {{BACK_URL}}/api/pricing/evaluate with productId=X"), false);
  assert.equal(derive("[ACT] GET {{BACK_URL}}/api/platform/modules"), false);
  assert.equal(derive("[ACT] DELETE /api/catalog/products/123"), false);
  assert.equal(derive("[ACT] POST graphql query { cart { id } }"), false);
});

test("an [ACT] that names a UI gesture IS a click", () => {
  assert.equal(derive("[ACT] click the main-menu 'All products' entry"), true);
  assert.equal(derive("[ACT] fill 'First name': 'Test'"), true);
  assert.equal(derive("[ACT] select size option 'Medium'"), true);
  assert.equal(derive("[ACT] hover the product card"), true);
  assert.equal(derive("[ACT] type '5' into the quantity spinbutton"), true);
});

test("a UI [PRE:*] primitive alone marks the suite click-driven", () => {
  for (const tag of ["[PRE:SIGNIN_AS]", "[PRE:SWITCH_ORG]", "[PRE:RESET_CART]", "[PRE:SIGNOUT]"]) {
    assert.equal(derive(`${tag} something\n[ACT] GET /api/x`), true, `${tag} should force true`);
  }
});

test("a non-UI [PRE:*] primitive does not by itself mark a suite click-driven", () => {
  // CLEAR_SESSION / CLEAR_CACHE are storage operations, not clicks.
  assert.equal(derive("[PRE:CLEAR_SESSION]\n[ACT] GET {{BACK_URL}}/api/x"), false);
  assert.equal(derive("[PRE:CLEAR_CACHE]\n[ACT] POST /api/y"), false);
});

test("a pure GraphQL runner-native suite is not click-driven", () => {
  assert.equal(
    derive("[GQL-OP q]\n  query { me { id } }\n[GQL-EXEC q]\n[GQL-CAPTURE q.data.me.id -> ID]"),
    false,
  );
});

test("a mixed suite is click-driven if ANY case clicks", () => {
  assert.equal(derive("[ACT] GET /api/x\n[ACT] click 'Add to cart'\n[ACT] POST /api/y"), true);
});

test("an unreadable file returns null so the declared value is kept, not cleared", () => {
  assert.equal(derivesClickDriven(join(scratch, "does-not-exist.csv")), null);
});

test("an empty CSV is not click-driven", () => {
  assert.equal(derive(""), false);
});

// ---- agreement with the real corpus + the recorded human judgement -----------------

const manifest = JSON.parse(readFileSync("config/test-suites.json", "utf-8")) as {
  suites: Array<{ id: string; file: string; name: string; clickDriven?: boolean }>;
};

function suite(id: string) {
  const s = manifest.suites.find((x) => x.id === id);
  assert.ok(s, `manifest is missing suite ${id}`);
  return s;
}

test("049 Platform API is firefox-safe — matching the human note in REG-2026-08-24-1806", () => {
  const s = suite("049");
  assert.equal(derivesClickDriven(s.file), false);
  assert.equal(s.clickDriven ?? false, false, "the manifest must carry the derived value");
});

test("storefront suites that obviously click are marked", () => {
  for (const id of ["001", "002", "039"]) {
    const s = suite(id);
    assert.equal(derivesClickDriven(s.file), true, `${id} (${s.name}) should be click-driven`);
  }
});

test("the deterministic and GraphQL suites are firefox-safe", () => {
  for (const id of ["048c", "050a"]) {
    const s = suite(id);
    assert.equal(derivesClickDriven(s.file), false, `${id} (${s.name}) should not be click-driven`);
  }
});

test("the manifest's stored clickDriven agrees with a fresh derivation for EVERY suite", () => {
  const drift = manifest.suites
    .map((s) => ({ id: s.id, stored: s.clickDriven ?? false, derived: derivesClickDriven(s.file) }))
    .filter((s) => s.derived !== null && s.derived !== s.stored);
  assert.deepEqual(
    drift,
    [],
    `run \`npm run suites:sync\`: ${drift.map((d) => `${d.id} stored=${d.stored} derived=${d.derived}`).join(", ")}`,
  );
});

test("the split is meaningful — neither everything nor nothing clicks", () => {
  const clicking = manifest.suites.filter((s) => s.clickDriven).length;
  assert.ok(clicking > 10, `only ${clicking} click-driven suites — the derivation looks broken`);
  assert.ok(
    clicking < manifest.suites.length - 10,
    `${clicking}/${manifest.suites.length} click-driven — an over-broad rule bars usable firefox lanes`,
  );
});
