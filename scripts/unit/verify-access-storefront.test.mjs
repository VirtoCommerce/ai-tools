// Unit tests for the storefront-user login readiness check (D2) —
// plugins/vc-fix/skills/project-init/verify-access.mjs `probeStorefrontLogin`.
//
// A storefront shopper is NOT a platform user, so the plain platform password grant (no storeId)
// 400s by construction — a right and a wrong password were then indistinguishable and the row
// degraded to a "verify manually" WARN that resolved nothing (the /project-init §3 S2 anti-pattern).
// The fix falls back to the REAL storefront login (a STORE-SCOPED OAuth grant) and reports PASS/FAIL
// on THAT. Network is injected, so no live platform is needed.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeStorefrontLogin } from "../../plugins/vc-fix/skills/project-init/verify-access.mjs";

// A fake fetch: the no-storeId grant 400s (the storefront-only shopper), the store-scoped grant
// resolves per config. Records calls so a test can prove the fallback actually fired.
function fakeFetch({ storeScopedOk = true, storeScopedStatus = 400, storeScopedBody = "" } = {}) {
  const calls = [];
  const impl = async (_url, opts) => {
    const body = String(opts?.body || "");
    const hasStore = /(^|&)storeId=/.test(body);
    calls.push({ hasStore });
    if (!hasStore) return { ok: false, status: 400, text: async () => "invalid_grant" };
    if (storeScopedOk) return { ok: true, status: 200, text: async () => "{}" };
    return { ok: false, status: storeScopedStatus, text: async () => storeScopedBody };
  };
  impl.calls = calls;
  return impl;
}

test("D2: a 400 on the platform grant reaches the STORE-SCOPED fallback and PASSes when it succeeds", async () => {
  const impl = fakeFetch({ storeScopedOk: true });
  const v = await probeStorefrontLogin({ back: "https://back", store: "B2B-store", email: "shopper@x.com", password: "pw", fetchImpl: impl });
  assert.equal(v.status, "PASS");
  assert.match(v.detail, /store-scoped/);
  assert.match(v.detail, /storeId=B2B-store/);
  // proves the fallback actually fired: two calls, the second store-scoped
  assert.equal(impl.calls.length, 2);
  assert.equal(impl.calls[0].hasStore, false, "first is the plain platform grant");
  assert.equal(impl.calls[1].hasStore, true, "second is the store-scoped storefront grant");
});

test("D2: a wrong storefront password FAILs the axis (never a 'verify manually' WARN)", async () => {
  const impl = fakeFetch({ storeScopedOk: false, storeScopedStatus: 400, storeScopedBody: "invalid_grant" });
  const v = await probeStorefrontLogin({ back: "https://back", store: "B2B-store", email: "shopper@x.com", password: "wrong", fetchImpl: impl });
  assert.equal(v.status, "FAIL", "a probed axis resolves to PASS/FAIL, never 'verify manually'");
  assert.match(v.detail, /invalid_grant/);
});

test("D2: a storefront user who IS a platform user PASSes on the first grant (no fallback needed)", async () => {
  const impl = async () => ({ ok: true, status: 200, text: async () => "{}" });
  const v = await probeStorefrontLogin({ back: "https://back", store: "B2B-store", email: "admin@x.com", password: "pw", fetchImpl: impl });
  assert.equal(v.status, "PASS");
  assert.match(v.detail, /platform token/);
});

test("D2: WARN ONLY for the genuinely-inconclusive cases — no store, or endpoint unreachable", async () => {
  const noStore = await probeStorefrontLogin({
    back: "https://back", store: "", email: "s@x.com", password: "pw",
    fetchImpl: async () => ({ ok: false, status: 400, text: async () => "invalid_grant" }),
  });
  assert.equal(noStore.status, "WARN");
  assert.match(noStore.detail, /STORE_ID/);

  const unreachable = await probeStorefrontLogin({
    back: "https://back", store: "B2B-store", email: "s@x.com", password: "pw",
    fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
  });
  assert.equal(unreachable.status, "WARN");
  assert.match(unreachable.detail, /unreachable/);
});
