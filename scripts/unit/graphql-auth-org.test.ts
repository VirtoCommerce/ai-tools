/**
 * `[AUTH role=X org=Y]` — the per-case organization override.
 *
 * The property under test is NOT "org= parses". It is that an org-scoped token can
 * never be served to a step that asked for a different org. A token carries its org
 * scope inside itself, so a cache keyed on the role alone would hand a step
 * authenticated for org A the token minted for org B — and the request still returns
 * 200, against the wrong organization. That is the failure this grammar exists to
 * prevent, and the only one worth a test.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSteps, type AuthStep } from "../lib/graphql-case-parser.ts";

const auth = (steps: string): AuthStep => {
  const blocks = parseSteps(steps);
  const a = blocks.find((b) => b.kind === "AUTH");
  assert.ok(a, `no AUTH block parsed from: ${steps}`);
  return a as AuthStep;
};

test("bare [AUTH] and [AUTH role=X] keep their existing meaning", () => {
  assert.deepEqual(
    { role: auth("[AUTH]").role, org: auth("[AUTH]").org },
    { role: "", org: undefined }
  );
  const a = auth("[AUTH role=ORG_USER]");
  assert.equal(a.role, "ORG_USER");
  assert.equal(a.org, undefined, "a case that names no org must not acquire one");
});

test("org= is captured, and the arg order does not matter", () => {
  const forward = auth("[AUTH role=ORG_USER org=@td(ORG_TECHFLOW.platform_id)]");
  const reversed = auth("[AUTH org=@td(ORG_TECHFLOW.platform_id) role=ORG_USER]");
  assert.equal(forward.role, "ORG_USER");
  assert.equal(forward.org, "@td(ORG_TECHFLOW.platform_id)");
  assert.deepEqual(
    { role: reversed.role, org: reversed.org },
    { role: forward.role, org: forward.org },
    "arg order must not change the grant — an author should not have to know one"
  );
});

test("a substituted GUID and an unknown arg are both tolerated", () => {
  // The runner substitutes {{VAR}} before parsing, so a literal may legitimately arrive here.
  assert.equal(
    auth("[AUTH role=ORG_USER org=8a9f1c22-0000-4000-8000-000000000001]").org,
    "8a9f1c22-0000-4000-8000-000000000001"
  );
  // An unrecognised key is ignored rather than breaking the whole AUTH step.
  const a = auth("[AUTH role=ORG_USER scope=offline_access]");
  assert.equal(a.role, "ORG_USER");
  assert.equal(a.org, undefined);
});

test("two orgs for one role are two DISTINCT steps, not one reused token", () => {
  const blocks = parseSteps(
    [
      "[AUTH role=MULTI_ORG_USER org=@td(ORG_TECHFLOW.platform_id)]",
      "[AUTH role=MULTI_ORG_USER org=@td(ORG_BUILDRIGHT.platform_id)]",
    ].join("\n")
  ).filter((b) => b.kind === "AUTH") as AuthStep[];

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].role, blocks[1].role, "same user…");
  assert.notEqual(blocks[0].org, blocks[1].org, "…different active org");
});

test("the cache key separates org scopes — the whole point of the change", async () => {
  // TokenCache.key is private, so assert the property through the public surface:
  // a second getToken for a DIFFERENT org must mint a second token, not reuse the first.
  const mod = await import("../lib/graphql-auth.ts");
  const cache = new mod.TokenCache("test-data", { backUrl: "http://unused" });

  const minted: string[] = [];
  // Stub the network + credential resolution: this test is about keying, not OAuth.
  const store = new Map<string, { accessToken: string; expiresAt: number; acquiredAt: number }>();
  (cache as unknown as { cache: typeof store }).cache = store;

  const put = (key: string) => {
    minted.push(key);
    store.set(key, { accessToken: `tok:${key}`, expiresAt: Date.now() + 3_600_000, acquiredAt: Date.now() });
  };
  put("ROLE_A");
  put("ROLE_A@org-1");
  put("ROLE_A@org-2");

  assert.equal(await cache.getToken("ROLE_A"), "tok:ROLE_A");
  assert.equal(await cache.getToken("ROLE_A", "org-1"), "tok:ROLE_A@org-1");
  assert.equal(
    await cache.getToken("ROLE_A", "org-2"),
    "tok:ROLE_A@org-2",
    "org-2 must NOT be served the org-1 token — that request would 200 against the wrong org"
  );

  cache.invalidate("ROLE_A", "org-1");
  assert.equal(store.has("ROLE_A@org-1"), false, "invalidate must target the same composite key");
  assert.equal(store.has("ROLE_A"), true, "…and must not evict the un-scoped token");
});
