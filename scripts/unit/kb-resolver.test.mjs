// The kb resolver: client precedence, the explicit MISS, and containment (VCST-5818).
//
// Two properties here are not conveniences:
//
//   THE PRECEDENCE ORDER IS EXACT. suppress > override > extend > new > platform. If
//   `override` ever won over `suppress`, an agent would test a rule this deployment has
//   switched off and file the resulting failure as a bug.
//
//   A MISS IS AN OBJECT. An agent that greps and finds nothing concludes no rule exists
//   and invents one. Handed {outcome: "MISS", searched: [...]} it knows the corpus was
//   asked and had no answer. Silence and absence must not look alike.
//
// Containment (§2a) is demonstrated by an actual refusal, not asserted in prose: the
// platform-bound path THROWS on a client-scope entry.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { KB_FIXTURES, copyRoot, withTempDir, kbModule } from "./_kb-helpers.mjs";

const { resolveId, resolveForPlatform, assertPlatformSafe, lookup } = await kbModule("resolve.mjs");
const { KbContainmentError } = await kbModule("kb-paths.mjs");

const PLATFORM = join(KB_FIXTURES, "platform");
const CLIENT = join(KB_FIXTURES, "client");
const both = { platform: PLATFORM, client: CLIENT };

test("with no client overlay, an id resolves to the platform base", () => {
  const r = resolveId("BL-CART-010", { platform: PLATFORM });
  assert.equal(r.outcome, "platform");
  assert.equal(r.found, true);
  assert.equal(r.entry.scope, "platform");
  assert.match(r.body, /excludes tax/);
});

test("a client override wins over the platform base and carries its quote", () => {
  const r = resolveId("BL-AUTH-004", both);
  assert.equal(r.outcome, "override");
  assert.equal(r.entry.id, "CL-AUTH-001");
  assert.equal(r.base.id, "BL-AUTH-004", "the base stays visible — an override is a delta, not a deletion");
  assert.match(r.quotes, /five consecutive failed sign-in attempts/);
  assert.match(r.body, /three/);
});

test("a suppress hides the platform rule and surfaces WHY", () => {
  const r = resolveId("FLOW-CHECKOUT-001", both);
  assert.equal(r.outcome, "suppressed");
  assert.match(r.reason, /B2B-only/);
  assert.equal(r.base.id, "FLOW-CHECKOUT-001");
  assert.match(r.note, /Do not test it here/);
});

test("an extend merges the platform body with the client addition, both marked", () => {
  const r = resolveId("LOC-PDP-002", both);
  assert.equal(r.outcome, "extend");
  assert.match(r.body, /accessible name\s+is "Add to Cart"/);
  assert.match(r.body, /sticky bottom bar/);
  assert.match(r.body, /client extension: CL-PDP-001/);
});

test("client-only knowledge resolves under its own id", () => {
  const r = resolveId("CL-NEW-001", both);
  assert.equal(r.outcome, "client-new");
  assert.equal(r.entry.scope, "client");
  assert.equal(r.base, null);
});

test("suppress beats override on the same target — the precedence order is exact", async () => {
  await withTempDir(async (dir) => {
    const client = copyRoot("client", join(dir, "client"));
    const fm = (id, relation, extra) => [
      "---", "id: " + id, "title: Rival client entry", "scope: client", "kind: invariant",
      'appliesTo: "*"', "relation: " + relation, "status: active",
      "audited:", "  date: 2026-08-28", "  source: live", "  ref: run/1",
      extra, "---", "", "Body for " + id, "",
    ].filter(Boolean).join("\n");
    mkdirSync(join(client, "confirmed"), { recursive: true });
    writeFileSync(join(client, "confirmed", "CL-RIVAL-001.md"),
      fm("CL-RIVAL-001", "override BL-CART-012", "quotes: |\n  minimum order quantity"), "utf8");
    writeFileSync(join(client, "confirmed", "CL-RIVAL-002.md"),
      fm("CL-RIVAL-002", "suppress BL-CART-012", "reason: this deployment has no minimum order quantity"), "utf8");

    const r = resolveId("BL-CART-012", { platform: PLATFORM, client });
    assert.equal(r.outcome, "suppressed");
    assert.equal(r.entry.id, "CL-RIVAL-002");
  });
});

test("a superseded client override does not shadow the platform base", async () => {
  await withTempDir(async (dir) => {
    const client = copyRoot("client", join(dir, "client"));
    const file = join(client, "confirmed", "CL-AUTH-001.md");
    const { readFileSync } = await import("node:fs");
    writeFileSync(file, readFileSync(file, "utf8").replace("status: active", "status: superseded"), "utf8");
    const r = resolveId("BL-AUTH-004", { platform: PLATFORM, client });
    assert.equal(r.outcome, "platform", "only an ACTIVE client entry is part of the overlay");
  });
});

test("an unknown id returns an explicit MISS object, never an empty answer", () => {
  const r = resolveId("BL-NOPE-999", both);
  assert.equal(r.outcome, "MISS");
  assert.equal(r.found, false);
  assert.equal(r.entry, null);
  assert.equal(r.body, "");
  assert.ok(Array.isArray(r.searched) && r.searched.length === 2, "a MISS names what it searched");
  assert.match(r.note, /do not invent one/i);
});

test("a superseded entry still resolves, and points at what replaced it", () => {
  const r = resolveId("BL-CART-011", { platform: PLATFORM });
  assert.equal(r.outcome, "superseded");
  assert.equal(r.found, true);
  assert.equal(r.supersededBy, "BL-CART-012");
  assert.match(r.body, /minimum order quantity/i);
});

test("a client-scope entry is REFUSED on a platform-bound path — by type, not by care", () => {
  const clientResult = resolveId("CL-NEW-001", both);
  assert.equal(clientResult.entry.scope, "client");

  assert.throws(() => resolveForPlatform("CL-NEW-001", both), KbContainmentError);
  assert.throws(() => assertPlatformSafe(clientResult), (err) => {
    assert.ok(err instanceof KbContainmentError);
    assert.equal(err.code, "KB_CONTAINMENT");
    assert.match(err.message, /promotion contract/);
    return true;
  });

  // The same id resolved through an override also carries client scope, and is refused.
  assert.throws(() => resolveForPlatform("BL-AUTH-004", both), KbContainmentError);
  // A platform-scope answer passes straight through.
  assert.equal(resolveForPlatform("BL-CART-012", { platform: PLATFORM }).outcome, "platform");
});

test("topical lookup ranks deterministically and never returns a shadowed base twice", () => {
  const a = lookup("how many failed sign-in attempts lock an account", both).results;
  const b = lookup("how many failed sign-in attempts lock an account", both).results;
  assert.deepEqual(a, b, "same corpus + same query must give the same ranking");
  assert.equal(a[0].id, "CL-AUTH-001", "the client override answers, not the platform base it replaces");
  assert.equal(a.some((r) => r.id === "BL-AUTH-004"), false, "the shadowed base must not rival its own override");

  const suppressed = lookup("guest checkout flow to order confirmation", both).results;
  assert.equal(suppressed.some((r) => r.id === "FLOW-CHECKOUT-001"), false, "a suppressed rule is not offered as an answer");
});

test("an id typed into the query outranks keyword overlap", () => {
  const r = lookup("what does BL-CART-012 say", { platform: PLATFORM }).results;
  assert.equal(r[0].id, "BL-CART-012");
});

test("a superseded entry ranks below the active one that replaced it", () => {
  const r = lookup("minimum order quantity", { platform: PLATFORM }).results;
  const active = r.findIndex((x) => x.id === "BL-CART-012");
  const old = r.findIndex((x) => x.id === "BL-CART-011");
  assert.ok(active >= 0 && old >= 0 && active < old);
});
