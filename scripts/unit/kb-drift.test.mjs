// The client-override drift sensor (VCST-5818).
//
// An override quotes the verbatim platform wording it replaces, and that quote is the
// instrument: comparing it against the current platform entry answers "is this override
// still written against the rule it thinks it is?" deterministically — no LLM, no network,
// no judgment. The three verdicts are genuinely different situations and must stay
// distinguishable, because `ok` needs nothing, `changed` needs a human to re-read the new
// platform rule, and `retired` means the override has nothing left to override at all.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KB_FIXTURES, copyRoot, withTempDir, kbModule } from "./_kb-helpers.mjs";

const { driftCheck, conflicting } = await kbModule("drift-check.mjs");

const PLATFORM = join(KB_FIXTURES, "platform");
const CLIENT = join(KB_FIXTURES, "client");
const verdictOf = (report, id) => (report.results.find((r) => r.id === id) || {}).verdict;

test("the three outcomes are produced from one fixture corpus", () => {
  const report = driftCheck({ platform: PLATFORM, client: CLIENT });

  // ok — CL-AUTH-001 still quotes wording that is present in BL-AUTH-004.
  assert.equal(verdictOf(report, "CL-AUTH-001"), "ok");
  // changed — CL-CART-020 quotes wording BL-CART-010 no longer contains.
  assert.equal(verdictOf(report, "CL-CART-020"), "changed");
  // retired — CL-GONE-001 overrides an id that is not in the platform brain at all.
  assert.equal(verdictOf(report, "CL-GONE-001"), "retired");

  assert.deepEqual(report.counts, { ok: 3, changed: 1, retired: 1 });
  assert.equal(report.ok, false);
});

test("a `changed` verdict carries the quote and points at the current platform entry", () => {
  const report = driftCheck({ platform: PLATFORM, client: CLIENT });
  const changed = report.results.find((r) => r.id === "CL-CART-020");
  assert.match(changed.detail, /the platform rule moved/);
  assert.match(changed.quote, /hides the tax row entirely/);
  assert.match(changed.currentBase, /confirmed\/BL-CART-010\.md:\d+/);
});

test("extend and suppress are checked for a surviving base, but cannot be `changed`", () => {
  const report = driftCheck({ platform: PLATFORM, client: CLIENT });
  assert.equal(verdictOf(report, "CL-PDP-001"), "ok");   // extend LOC-PDP-002
  assert.equal(verdictOf(report, "CL-CHK-001"), "ok");   // suppress FLOW-CHECKOUT-001
  // A client entry with relation `new` depends on nothing upstream and is not reported.
  assert.equal(report.results.some((r) => r.id === "CL-NEW-001"), false);
});

test("a suppress whose platform target disappears is reported as retired", async () => {
  await withTempDir(async (dir) => {
    const platform = copyRoot("platform", join(dir, "platform"));
    const { rmSync } = await import("node:fs");
    rmSync(join(platform, "confirmed", "FLOW-CHECKOUT-001.md"));
    const report = driftCheck({ platform, client: CLIENT });
    assert.equal(verdictOf(report, "CL-CHK-001"), "retired");
    assert.match(report.results.find((r) => r.id === "CL-CHK-001").detail, /nothing left to act on/);
  });
});

test("a platform entry marked retired upstream retires its overrides too", async () => {
  await withTempDir(async (dir) => {
    const platform = copyRoot("platform", join(dir, "platform"));
    const file = join(platform, "confirmed", "BL-AUTH-004.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("status: active", "status: retired\nretiredReason: lockout moved to the identity provider"), "utf8");
    const report = driftCheck({ platform, client: CLIENT });
    assert.equal(verdictOf(report, "CL-AUTH-001"), "retired");
    assert.match(report.results.find((r) => r.id === "CL-AUTH-001").detail, /marked retired upstream/);
  });
});

test("the comparison is whitespace-insensitive — re-wrapping a paragraph is not a wording change", async () => {
  await withTempDir(async (dir) => {
    const platform = copyRoot("platform", join(dir, "platform"));
    const file = join(platform, "confirmed", "BL-AUTH-004.md");
    // Same words, re-wrapped onto one long line.
    const text = readFileSync(file, "utf8").replace(
      "The account is locked after five consecutive failed sign-in attempts and stays locked\nfor fifteen minutes.",
      "The account is locked after five consecutive failed sign-in attempts and stays locked for fifteen minutes.",
    );
    writeFileSync(file, text, "utf8");
    assert.equal(verdictOf(driftCheck({ platform, client: CLIENT }), "CL-AUTH-001"), "ok");
  });
});

test("a superseded client override is not measured — only the active overlay is", async () => {
  await withTempDir(async (dir) => {
    const client = copyRoot("client", join(dir, "client"));
    const file = join(client, "confirmed", "CL-CART-020.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("status: active", "status: superseded"), "utf8");
    const report = driftCheck({ platform: PLATFORM, client });
    assert.equal(report.results.some((r) => r.id === "CL-CART-020"), false);
    assert.equal(report.counts.changed, 0);
  });
});

test("conflicting() gives the sync hook exactly the ids to hold for review", () => {
  const report = driftCheck({ platform: PLATFORM, client: CLIENT });
  assert.deepEqual(conflicting(report).sort(), ["CL-CART-020", "CL-GONE-001"]);
});

test("a clean corpus reports ok with nothing to review", async () => {
  await withTempDir(async (dir) => {
    const client = copyRoot("client", join(dir, "client"));
    const { rmSync } = await import("node:fs");
    rmSync(join(client, "confirmed", "CL-CART-020.md"));
    rmSync(join(client, "confirmed", "CL-GONE-001.md"));
    const report = driftCheck({ platform: PLATFORM, client });
    assert.equal(report.ok, true);
    assert.deepEqual(conflicting(report), []);
  });
});

test("an override that lost its quote is `changed` — an unmeasurable override is not a passing one", async () => {
  await withTempDir(async (dir) => {
    const client = copyRoot("client", join(dir, "client"));
    const file = join(client, "confirmed", "CL-AUTH-001.md");
    const text = readFileSync(file, "utf8").replace(
      /quotes: \|\n(?:  .*\n)+/,
      "quotes: |\n   \n",
    );
    writeFileSync(file, text, "utf8");
    const report = driftCheck({ platform: PLATFORM, client });
    assert.equal(verdictOf(report, "CL-AUTH-001"), "changed");
    assert.match(report.results.find((r) => r.id === "CL-AUTH-001").detail, /the quote is the sensor/);
  });
});
