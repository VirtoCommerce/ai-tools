// Focused unit tests for the Fix 3 (LEO 2026-07-22) scrubber change in
// plugins/vc-fix/skills/vc-self-check/deliver.mjs: the delivery scrubber must block ONLY client
// data and NEVER withhold references to the plugin's OWN symbols / files. The camelCase heuristic
// was widened (lowercase-first camelCase is a code identifier, not a client proper noun) and a
// plugin-symbol allowlist was added — while the HARD client-data gates (configured client terms,
// paths/URLs/emails/tickets, secret redaction) stay fully intact.
//
// SEPARATE FILE (not deliver-feedback.test.mjs): deliver.mjs's clientTerms() memoizes
// project-profile.json PER PROCESS on the first scrub call. node --test runs each test file in its
// own process, so setting VC_FIX_HOME here — BEFORE the first isClientSpecific() call — lets the
// configured-client-org case (cell #3) read a real test profile deterministically.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Set up a client profile and point VC_FIX_HOME at it BEFORE importing deliver (its clientTerms()
// is lazy — memoized on first call — so this is picked up as long as no scrub ran yet).
const HOME = mkdtempSync(join(tmpdir(), "vc-fix-scrub-"));
writeFileSync(join(HOME, "project-profile.json"), JSON.stringify({ projectType: "client", clientOrg: "leocorp" }));
process.env.VC_FIX_HOME = HOME;

const { isClientSpecific, scrubText } = await import("../../plugins/vc-fix/skills/vc-self-check/deliver.mjs");

test.after(() => { try { rmSync(HOME, { recursive: true, force: true }); } catch {} });

// ─── plugin internals survive (Fix 3 core) ──────────────────────────────────────────
test("cell #1: `finalize deferred, pendingSubagents:1 but agent_calls:0` is NOT client-specific", () => {
  const cell = "1× finalize deferred, pendingSubagents:1 but agent_calls:0";
  assert.equal(isClientSpecific(cell), false, "plugin symbols (pendingSubagents/agent_calls) must not read as client data");
  assert.equal(scrubText(cell), cell, "the cell survives scrubbing verbatim (nothing removed)");
});

test("cell #2: `hooks/session-telemetry.mjs — subagent open/close accounting` is NOT client-specific", () => {
  const cell = "hooks/session-telemetry.mjs — subagent open/close accounting";
  assert.equal(isClientSpecific(cell), false, "a plugin-file reference + lowercase prose must survive");
  assert.equal(scrubText(cell), cell, "the plugin-file reference survives scrubbing verbatim");
});

test("Fix 3: assorted lowercase-first plugin symbols survive on shape alone", () => {
  for (const sym of ["sawPluginSpan", "anySkillSeen", "openOps", "roleStates", "currentCommand", "freshOpenAgents"]) {
    assert.equal(isClientSpecific(`the ${sym} accounting drifted`), false, `${sym} must not be flagged as client data`);
  }
});

// ─── hard client-data gates stay intact (MUST NOT regress) ───────────────────────────
test("cell #3: a configured client org (from the test profile) IS client-specific and is redacted", () => {
  const cell = "finalize ran inside the leocorp custom checkout module";
  assert.equal(isClientSpecific(cell), true, "a configured client org must be flagged");
  assert.ok(!/leocorp/i.test(scrubText(cell)), "the configured client org must be scrubbed from any outbound text");
});

test("cell #3b: the client org is redacted even inside an underscore/dot/hyphen-joined identifier", () => {
  for (const cell of ["LEOCORP_API_KEY handling", "leocorp.cart.service threw", "leocorp-theme-fork build"]) {
    assert.equal(isClientSpecific(cell), true, `client org inside a derived identifier must be flagged: ${cell}`);
    assert.ok(!/leocorp/i.test(scrubText(cell)), `client org must be scrubbed: ${cell}`);
  }
});

test("cell #4: `AcmeCorp.CartController threw at C:\\src\\Cart.cs` IS client-specific and is withheld", () => {
  const cell = "AcmeCorp.CartController threw at C:\\src\\Cart.cs";
  assert.equal(isClientSpecific(cell), true, "a PascalCase client class + a Windows source path must be flagged");
  const scrubbed = scrubText(cell);
  assert.ok(!/C:\\src/.test(scrubbed), "the client source path must be scrubbed");
});

test("Fix 3: a PascalCase client class name is still flagged (heuristic not over-narrowed)", () => {
  assert.equal(isClientSpecific("the CartController service"), true, "Capital-first compound (client class) stays flagged");
  assert.equal(isClientSpecific("the Contoso integration"), true, "single Capitalized proper noun stays flagged");
});

// REGRESSION GUARD (3 independent reviewers, BLOCKER): a LOWERCASE-first camelCase CLIENT identifier
// must stay withheld. An earlier draft narrowed the shape rule to Capital-first only, which leaked
// exactly these (client source symbols are overwhelmingly lowercase-first camelCase, and layer-1's
// alphanumeric boundary does NOT match an org fused into a camelCase token). The shape rule is BROAD
// again; the plugin-symbol allowlist (asserted above) is what spares the plugin's OWN camelCase.
test("Fix 3 (regression): a lowercase-first camelCase CLIENT identifier is withheld", () => {
  // arbitrary client code symbols (not the configured org, not plugin symbols)
  for (const id of ["orderSyncService", "checkoutTotals", "customerTaxProfile", "useAcmeCheckout"]) {
    assert.equal(isClientSpecific(`root cause: ${id} returned null`), true, `client identifier ${id} must be withheld`);
  }
  // the configured org fused into a camelCase identifier (no separator) — the exact leak reviewers found
  for (const id of ["leocorpCheckout", "leocorpService", "useLeocorpCart"]) {
    assert.equal(isClientSpecific(`the ${id} broke`), true, `org-fused camelCase ${id} must be withheld`);
  }
  // and the plugin's OWN lowercase-first camelCase symbols must STILL survive (the allowlist)
  for (const sym of ["pendingSubagents", "freshOpenAgents", "sawPluginSpan", "openOps"]) {
    assert.equal(isClientSpecific(`the ${sym} counter`), false, `plugin symbol ${sym} must survive`);
  }
});

test("cell #5: an embedded JWT / PAT is redacted regardless of the shape rules", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  const pat = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (const secret of [jwt, pat]) {
    const cell = `token=${secret} in the finalize record`;
    assert.ok(!scrubText(cell).includes(secret), `redact() must scrub the secret: ${secret.slice(0, 12)}…`);
    assert.equal(isClientSpecific(cell), true, "a redacted secret makes the cell client-specific (withheld)");
  }
});
