// Unit tests for the previously-untested security-relevant helpers in
// plugins/vc-fix/skills/vc-self-check/deliver.mjs (PR #143 review round 2, Suggestion 2):
//   - isAllowedUpstreamRepo — the destination allowlist (misroute guard, A3)
//   - resolveRoute          — the PR / fork-pr / issue / local routing matrix
//   - findDuplicateIssue    — the upstream dedup match (fetch stubbed, no network)
//   - purgeSession          — the "delete ONLY this session, never others" guarantee
// Pure / injectable where possible; findDuplicateIssue stubs globalThis.fetch. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withTempDir } from "./_test-helpers.mjs";
import {
  isAllowedUpstreamRepo,
  resolveRoute,
  findDuplicateIssue,
  purgeSession,
} from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";

// ─── isAllowedUpstreamRepo (destination allowlist) ───────────────────────────────
test("isAllowedUpstreamRepo: allows VirtoCommerce/* only", () => {
  assert.equal(isAllowedUpstreamRepo("VirtoCommerce/vc-mcp-testing-module"), true);
  assert.equal(isAllowedUpstreamRepo("VirtoCommerce/vc-platform"), true);
  assert.equal(isAllowedUpstreamRepo("virtocommerce/vc-frontend"), true); // case-insensitive org
});

test("isAllowedUpstreamRepo: rejects any non-VirtoCommerce / malformed target (misroute guard)", () => {
  for (const bad of [
    "acme/secret-module",              // a client/personal repo
    "attacker/vc-mcp-testing-module",  // look-alike owner
    "VirtoCommerce",                   // no repo segment
    "VirtoCommerce/vc/extra",          // extra path segment
    "VirtoCommerceEvil/x",             // org is not exactly VirtoCommerce
    "", null, undefined,
  ]) {
    assert.equal(isAllowedUpstreamRepo(bad), false, `must reject: ${bad}`);
  }
});

// ─── resolveRoute (routing matrix) ───────────────────────────────────────────────
test("resolveRoute: no token → local; auth failure → local", () => {
  assert.equal(resolveRoute({ token: null }).route, "local");
  assert.equal(resolveRoute({ token: "t", probe: { ok: false } }).route, "local");
});

test("resolveRoute: push/maintain/admin permission → pr", () => {
  for (const perm of ["push", "maintain", "admin"]) {
    assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm } }).route, "pr", perm);
  }
});

test("resolveRoute: authenticated without push → fork-pr, unless scopes clearly lack repo → issue", () => {
  // no scope info known → assume fork is possible
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read", login: "u" } }).route, "fork-pr");
  // scopes present and include repo → fork-pr
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read" }, scopes: "repo,gist" }).route, "fork-pr");
  // scopes present but NO repo/public_repo → issue-only
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read" }, scopes: "gist,read:org" }).route, "issue");
});

test("resolveRoute: an explicit override wins over everything", () => {
  assert.equal(resolveRoute({ token: null, override: "issue" }).route, "issue");
});

// ─── findDuplicateIssue (dedup match, fetch stubbed) ─────────────────────────────
function withFetch(stub, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = prev; });
}
const okJson = (data) => ({ ok: true, json: async () => data });

test("findDuplicateIssue: no token → null without any network call", async () => {
  let called = false;
  await withFetch(async () => { called = true; return okJson([]); }, async () => {
    assert.equal(await findDuplicateIssue({ repo: "VirtoCommerce/x", token: null, fp: "abc" }), null);
  });
  assert.equal(called, false, "must not hit the network when there is no token");
});

test("findDuplicateIssue: returns the matching open issue by fingerprint marker", async () => {
  const marker = "vc-fix-selfcheck-fp: deadbeef";
  await withFetch(async () => okJson([
    { number: 1, html_url: "u1", body: "unrelated" },
    { number: 2, html_url: "u2", body: `report\n<!-- ${marker} -->` },
  ]), async () => {
    const hit = await findDuplicateIssue({ repo: "VirtoCommerce/x", token: "t", fp: "deadbeef" });
    assert.deepEqual(hit, { number: 2, url: "u2" });
  });
});

test("findDuplicateIssue: skips PRs, returns null on no match / non-ok / network error", async () => {
  // a PR whose body matches is skipped (issues endpoint returns PRs too)
  await withFetch(async () => okJson([
    { number: 3, html_url: "u3", body: "vc-fix-selfcheck-fp: deadbeef", pull_request: {} },
  ]), async () => {
    assert.equal(await findDuplicateIssue({ repo: "VirtoCommerce/x", token: "t", fp: "deadbeef" }), null);
  });
  await withFetch(async () => ({ ok: false }), async () => {
    assert.equal(await findDuplicateIssue({ repo: "VirtoCommerce/x", token: "t", fp: "deadbeef" }), null);
  });
  await withFetch(async () => { throw new Error("network down"); }, async () => {
    assert.equal(await findDuplicateIssue({ repo: "VirtoCommerce/x", token: "t", fp: "deadbeef" }), null);
  });
});

// ─── purgeSession (delete ONLY this session, never others) ───────────────────────
test("purgeSession: removes only the target session's artifacts, leaves other sessions untouched", () => withTempDir((dir) => {
  const sid = "session-aaaaaa";
  const other = "session-bbbbbb";
  const files = [
    `${sid}.jsonl`, `${sid}.state.json`, `DIAG-${sid}-20260726T000000Z.md`,
    `${other}.jsonl`, `${other}.state.json`, `DIAG-${other}-20260726T000000Z.md`,
    `DELIVERY-fp123-20260726T000000Z.md`, `DELIVERY-other-20260726T000000Z.md`,
  ];
  for (const f of files) writeFileSync(join(dir, f), "x");
  const removed = purgeSession({ dir, sid, fp: "fp123" });
  const left = readdirSync(dir).sort();
  // the other session's three files survive; the target's three + its DELIVERY-fp123 are gone
  assert.deepEqual(left, [
    `DELIVERY-other-20260726T000000Z.md`,
    `${other}.jsonl`, `DIAG-${other}-20260726T000000Z.md`, `${other}.state.json`,
  ].sort());
  assert.ok(removed.includes(`${sid}.jsonl`) && removed.includes(`DELIVERY-fp123-20260726T000000Z.md`));
  assert.ok(!removed.some((f) => f.includes(other)), "never reports another session's file as removed");
}));

test("purgeSession: a too-short / empty sid never mass-matches (only the fp path fires)", () => withTempDir((dir) => {
  for (const f of ["a.jsonl", "b.state.json", "DIAG-xyz-1.md", "DELIVERY-fp9-1.md"]) writeFileSync(join(dir, f), "x");
  const removed = purgeSession({ dir, sid: "abc", fp: "fp9" }); // sid length 3 < 6 → sid path disabled
  assert.deepEqual(removed, ["DELIVERY-fp9-1.md"]);
  assert.deepEqual(readdirSync(dir).sort(), ["DIAG-xyz-1.md", "a.jsonl", "b.state.json"]);
}));

test("purgeSession: never throws on a missing dir", () => {
  assert.deepEqual(purgeSession({ dir: join(tmpdir(), "does-not-exist-xyz"), sid: "session-zzzzzz", fp: "x" }), []);
});
