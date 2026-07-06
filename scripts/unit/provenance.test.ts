// Unit tests for ci/lib/provenance.ts — the frontend "client customization vs platform
// bug" decision + delivery policy. Pure (type-only import of repo-router, no side effects).
// Run: `npx tsx --test scripts/unit/provenance.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFrontendProvenance, frontendDeliveryPlan } from "../../ci/lib/provenance.ts";

// ---- classifyFrontendProvenance ---------------------------------------------

test("client-only anchor (custom component) ⇒ client HIGH", () => {
  const v = classifyFrontendProvenance({ anchorInClient: true, anchorInUpstream: false, filesIdentical: null });
  assert.equal(v.ownership, "client");
  assert.equal(v.confidence, "HIGH");
});

test("anchor in both but DIFFERS ⇒ client HIGH (customization introduced the bug)", () => {
  const v = classifyFrontendProvenance({ anchorInClient: true, anchorInUpstream: true, filesIdentical: false });
  assert.equal(v.ownership, "client");
  assert.equal(v.confidence, "HIGH");
});

test("anchor identical to unmodified upstream ⇒ platform HIGH", () => {
  const v = classifyFrontendProvenance({
    anchorInClient: true, anchorInUpstream: true, filesIdentical: true, fixedOnUpstreamHead: false,
  });
  assert.equal(v.ownership, "platform");
  assert.equal(v.confidence, "HIGH");
  assert.equal(v.bailClass, undefined);
});

test("identical + already fixed on upstream HEAD ⇒ platform + already-fixed-upstream", () => {
  const v = classifyFrontendProvenance({
    anchorInClient: true, anchorInUpstream: true, filesIdentical: true, fixedOnUpstreamHead: true,
  });
  assert.equal(v.ownership, "platform");
  assert.equal(v.bailClass, "already-fixed-upstream");
});

test("anchor not found in client ⇒ client LOW (containment-first STOP)", () => {
  const v = classifyFrontendProvenance({ anchorInClient: false, anchorInUpstream: true, filesIdentical: null });
  assert.equal(v.ownership, "client");
  assert.equal(v.confidence, "LOW");
});

test("in both but content uncomparable ⇒ client LOW (containment-first)", () => {
  const v = classifyFrontendProvenance({ anchorInClient: true, anchorInUpstream: true, filesIdentical: null });
  assert.equal(v.ownership, "client");
  assert.equal(v.confidence, "LOW");
});

// ---- frontendDeliveryPlan ---------------------------------------------------

test("client-owned ⇒ fix + PR on the client repo", () => {
  const p = frontendDeliveryPlan({ ownership: "client" });
  assert.equal(p.action, "fix-client-fork");
});

test("platform-owned ⇒ contribute the fix upstream (fork-PR to VirtoCommerce)", () => {
  const p = frontendDeliveryPlan({ ownership: "platform" });
  assert.equal(p.action, "upstream-contribution");
});

test("platform-owned + already fixed upstream ⇒ stop-upgrade (sync the fork, don't re-fix)", () => {
  const p = frontendDeliveryPlan({ ownership: "platform", bailClass: "already-fixed-upstream" });
  assert.equal(p.action, "stop-upgrade");
});
