// Unit tests for the previously-untested security-relevant helpers in
// plugins/vc-fix/skills/vc-self-check/deliver.mjs (PR #143 review round 2, Suggestion 2):
//   - isAllowedUpstreamRepo — the destination allowlist (misroute guard, A3)
//   - resolveRoute          — the PR / fork-pr / issue / local routing matrix
//   - findDuplicateIssue    — the upstream dedup match (fetch stubbed, no network)
//   - purgeSession          — the "delete ONLY this session, never others" guarantee
// Pure / injectable where possible; findDuplicateIssue stubs globalThis.fetch. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withTempDir, withTempHome } from "./_test-helpers.mjs";
import {
  isAllowedUpstreamRepo,
  resolveRoute,
  findDuplicateIssue,
  purgeSession,
  main,
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
const isSearch = (url) => String(url).includes("/search/issues");
// Route the stub by endpoint: Search API returns {items:[...]}, the list endpoint returns [...].
const routed = ({ search = { items: [] }, list = [] } = {}) => async (url) =>
  isSearch(url) ? okJson(search) : okJson(list);
const marker = "vc-fix-selfcheck-fp: deadbeef";
const match = { number: 2, html_url: "u2", body: `report\n<!-- ${marker} -->` };

test("findDuplicateIssue: no token → null without any network call", async () => {
  let called = false;
  await withFetch(async () => { called = true; return okJson([]); }, async () => {
    assert.equal(await findDuplicateIssue({ repo: "VirtoCommerce/x", token: null, fp: "abc" }), null);
  });
  assert.equal(called, false, "must not hit the network when there is no token");
});

test("findDuplicateIssue: the Search API finds the fingerprint even past 100 open issues (DED1)", async () => {
  let searched = false;
  await withFetch(async (url) => { if (isSearch(url)) searched = true; return isSearch(url) ? okJson({ items: [{ number: 1, html_url: "u1", body: "noise" }, match] }) : okJson([]); }, async () => {
    const hit = await findDuplicateIssue({ repo: "VirtoCommerce/x", token: "t", fp: "deadbeef" });
    assert.deepEqual(hit, { number: 2, url: "u2" });
  });
  assert.ok(searched, "must query the Search API (not just the first-100 list)");
});

test("findDuplicateIssue: falls back to the list scan when Search misses (recent / rate-limited)", async () => {
  await withFetch(routed({ search: { items: [] }, list: [{ number: 9, html_url: "u9", body: "x" }, match] }), async () => {
    const hit = await findDuplicateIssue({ repo: "VirtoCommerce/x", token: "t", fp: "deadbeef" });
    assert.deepEqual(hit, { number: 2, url: "u2" });
  });
});

test("findDuplicateIssue: skips PRs, returns null on no match / non-ok / network error", async () => {
  // a PR whose body matches is skipped, on BOTH the search and the list endpoint
  const pr = { number: 3, html_url: "u3", body: `<!-- ${marker} -->`, pull_request: {} };
  await withFetch(routed({ search: { items: [pr] }, list: [pr] }), async () => {
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

// ─── T1: deliver main() send gate — end-to-end (PR #143 R2) ──────────────────────────────
// The composition that decides whether telemetry is POSTed to a PUBLIC repo was untested; a
// mutation removing the mode==="off" block or inverting the --confirm gate passed the whole
// suite. This drives main() with a stubbed fetch and asserts on whether a createIssue POST fired.
function writeDiag(home) {
  const dir = join(home, ".vc-fix", "diagnostics");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "DIAG-s1-20260101T000000Z.md"), [
    "# DIAG — s1", "- Session: s1 · Plugin: 0.8.1", "## Findings",
    "| Skill | Verdict | Sev | Outcome | Signal | Root | Fix |",
    "| /qa-fix (command) | BROKEN | S1 | failed | perm denied | auth | check token |",
  ].join("\n"));
}
async function driveMain(home, argv, { mode = "ask" } = {}) {
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode } }));
  writeDiag(home);
  const calls = [];
  const prev = { fetch: globalThis.fetch, tok: process.env.GITHUB_FIX_BUGS_TOKEN, exit: process.exitCode, write: process.stdout.write };
  process.env.GITHUB_FIX_BUGS_TOKEN = "test-token"; // short-circuits resolveGithubToken (no gh subprocess)
  process.stdout.write = () => true; // swallow the plan JSON
  globalThis.fetch = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    calls.push({ url: String(url), method });
    if (method === "POST") return okJson({ number: 42, html_url: "http://issue/42" });
    if (String(url).includes("/search/issues")) return okJson({ items: [] });
    if (String(url).includes("/issues")) return okJson([]);
    return okJson({ permissions: {} }); // probe
  };
  let exitCode;
  try { await main(argv); exitCode = process.exitCode; }
  finally {
    globalThis.fetch = prev.fetch; process.stdout.write = prev.write; process.exitCode = prev.exit;
    if (prev.tok === undefined) delete process.env.GITHUB_FIX_BUGS_TOKEN; else process.env.GITHUB_FIX_BUGS_TOKEN = prev.tok;
  }
  return { posted: calls.some((c) => c.method === "POST" && c.url.includes("/issues")), calls, exitCode };
}

test("main: a non-VirtoCommerce --repo is refused before ANY network (misroute guard)", async () => {
  await withTempHome(async (home) => {
    const r = await driveMain(home, ["--json", "--repo", "attacker/x", "--as", "issue", "--confirm"], { mode: "auto" });
    assert.equal(r.posted, false);
    assert.equal(r.calls.length, 0, "a refused repo must not hit the network at all");
    assert.equal(r.exitCode, 2);
  });
});
test("main: feedback.mode=off never sends, even with --confirm (hard no-send)", async () => {
  await withTempHome(async (home) => {
    const r = await driveMain(home, ["--json", "--as", "issue", "--confirm"], { mode: "off" });
    assert.equal(r.posted, false, "mode=off must not POST an issue");
    assert.equal(r.calls.length, 0, "mode=off returns before any network");
  });
});
test("main: ask mode WITHOUT --confirm is a dry run (no POST)", async () => {
  await withTempHome(async (home) => {
    const r = await driveMain(home, ["--json", "--as", "issue"], { mode: "ask" });
    assert.equal(r.posted, false, "ask + no --confirm must be a dry run");
  });
});
test("main: ask mode WITH --confirm files the issue; auto files without --confirm", async () => {
  await withTempHome(async (home) => {
    assert.equal((await driveMain(home, ["--json", "--as", "issue", "--confirm"], { mode: "ask" })).posted, true, "ask + --confirm ⇒ POST");
  });
  await withTempHome(async (home) => {
    assert.equal((await driveMain(home, ["--json", "--as", "issue"], { mode: "auto" })).posted, true, "auto ⇒ POST without --confirm");
  });
});
