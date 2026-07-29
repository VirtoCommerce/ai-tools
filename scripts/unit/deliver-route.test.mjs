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
import { classifyGithubTokenKind, GITHUB_UPSTREAM_REMEDY } from "../../plugins/vc-fix/skills/project-init/probe-lib.mjs";

// ─── classifyGithubTokenKind (VCST-5582 A — the token-kind probe) ────────────────
// GitHub returns X-OAuth-Scopes for CLASSIC tokens (even when the scope list is empty) and
// omits it entirely for fine-grained ones — that header is the discriminator. Only a classic
// token (or a gh browser session) can fork / fork-PR / issue-create on a repo it does not own.
const hdr = (scopes) => new Map([["x-oauth-scopes", scopes]]) && { get: (k) => (k.toLowerCase() === "x-oauth-scopes" ? scopes : null) };
const noHdr = { get: () => null };

test("classifyGithubTokenKind: the github_pat_ prefix is definitively fine-grained (never fork-capable)", () => {
  const r = classifyGithubTokenKind("github_pat_11ABCDE", hdr("repo,gist")); // even WITH a scope header
  assert.equal(r.kind, "fine-grained");
  assert.equal(r.forkCapable, "no", "a fine-grained token is structurally incapable, whatever the scopes claim");
  assert.equal(r.remedy, GITHUB_UPSTREAM_REMEDY);
});

test("classifyGithubTokenKind: no X-OAuth-Scopes header ⇒ fine-grained", () => {
  const r = classifyGithubTokenKind("some-opaque-token", noHdr);
  assert.equal(r.kind, "fine-grained");
  assert.equal(r.forkCapable, "no");
});

test("classifyGithubTokenKind: an X-OAuth-Scopes header ⇒ classic, and the scope list is returned", () => {
  const r = classifyGithubTokenKind("ghp_abc", hdr("repo, gist, read:org"));
  assert.equal(r.kind, "classic");
  assert.deepEqual(r.scopes, ["repo", "gist", "read:org"]);
  assert.equal(r.forkCapable, "yes");
  assert.equal(r.remedy, "", "nothing to remedy when the token can do the job");
});

test("classifyGithubTokenKind: a classic token with an EMPTY scope header is classic but not fork-capable", () => {
  const r = classifyGithubTokenKind("ghp_abc", hdr(""));
  assert.equal(r.kind, "classic");
  assert.equal(r.forkCapable, "no", "the header was present (scopes known) and carries neither repo nor public_repo");
});

test("classifyGithubTokenKind: public_repo alone is enough for the upstream path", () => {
  assert.equal(classifyGithubTokenKind("ghp_abc", hdr("public_repo")).forkCapable, "yes");
});

test("the remedy prescribes ONE classic `repo` token — not a two-token decision tree", () => {
  // A single classic `repo` PAT covers BOTH jobs (the client's own repos, private included, AND
  // the VirtoCommerce upstream), so onboarding asks for exactly one value. The split-by-axis
  // setup remains only as the exception for an org that forbids classic PATs.
  assert.match(GITHUB_UPSTREAM_REMEDY, /ONE CLASSIC token with the `repo` scope/);
  assert.match(GITHUB_UPSTREAM_REMEDY, /covers both/i);
  assert.match(GITHUB_UPSTREAM_REMEDY, /gh auth login/, "the no-token alternative is offered");
  assert.doesNotMatch(GITHUB_UPSTREAM_REMEDY, /public_repo/, "the primary recipe is `repo`, not a scope the operator must reason about");
});

test("scaffold-secrets: the .env.local comment names ONE classic `repo` token, in 3 lines like every other secret", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const rel of ["plugins/vc-fix/skills/project-init/scaffold-secrets.mjs", ".claude/skills/project-init/scaffold-secrets.mjs"]) {
    const src = readFileSync(join(root, rel), "utf8");
    const entry = src.slice(src.indexOf("  GITHUB_FIX_BUGS_TOKEN: {"), src.indexOf("  ADO_PAT: {"));
    const fields = entry.split("\n").filter((l) => /^\s+(what|why|where):/.test(l));
    // Same shape as JIRA_API_TOKEN / ADO_PAT: one line each, no multi-line block.
    assert.equal(fields.length, 3, `${rel}: exactly what/why/where`);
    assert.doesNotMatch(entry, /where: \[/, `${rel}: no multi-line where[] block in the operator's env file`);
    assert.match(entry, /classic, NOT fine-grained/, `${rel}: the token TYPE is unambiguous`);
    const where = entry.split("\n").find((l) => /^\s+where:/.test(l));
    assert.match(where, /Tokens \(classic\)/, `${rel}: where to click`);
    // The dropdown trap: on the "Tokens (classic)" page the Generate button still offers
    // fine-grained FIRST. Naming the classic item verbatim is what makes the path followable.
    assert.match(where, /Generate new token \(classic\)/, `${rel}: the exact dropdown item is named`);
    // …and the path ends in the scope to tick, exactly like ADO_PAT's `where:`.
    assert.match(where, /Scope: repo\./, `${rel}: the scope is part of the click path`);
    // Nothing beyond the path: `gh auth login` would contradict the operator's own PAT choice.
    assert.doesNotMatch(where, /gh auth login|SECOND item/, `${rel}: where: carries no advice`);
    // The defect being fixed: fine-grained + a classic-only scope in the same instruction.
    assert.doesNotMatch(entry, /Fine-grained\. Perms: Contents \+ Pull requests = Read\/Write \(public_repo/, `${rel}: the old impossible instruction is gone`);
  }
});

test("classifyGithubTokenKind: the gh-CLI session takes its scopes from `gh auth status`", () => {
  const r = classifyGithubTokenKind("gho_sessiontoken", noHdr, { via: "gh CLI", scopes: "gist,read:org,repo" });
  assert.equal(r.kind, "gh-cli");
  assert.equal(r.forkCapable, "yes");
});

test("classifyGithubTokenKind: an UNREADABLE capability is 'unknown', never optimistically 'yes'", () => {
  // A gh session whose scopes could not be parsed — not fine-grained, but not proven either.
  const r = classifyGithubTokenKind("gho_sessiontoken", noHdr, { via: "gh CLI" });
  assert.equal(r.kind, "gh-cli");
  assert.equal(r.forkCapable, "unknown");
  assert.equal(r.remedy, GITHUB_UPSTREAM_REMEDY, "an unconfirmed capability still carries the remedy");
});

test("classifyGithubTokenKind: no token at all", () => {
  const r = classifyGithubTokenKind("", noHdr);
  assert.equal(r.kind, "none");
  assert.equal(r.forkCapable, "no");
});

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

// ── VCST-5582 A — no optimistic fork default ───────────────────────────────────────────
// The old rule was `canFork = !scopesKnown || /(repo|public_repo)/.test(scopes)`, while
// resolveGithubToken() leaves `scopes` EMPTY for every PAT — so every PAT routed `fork-pr`,
// including a fine-grained one GitHub structurally forbids from forking someone else's repo.
test("resolveRoute: a PROVEN fork-capable token without push → fork-pr", () => {
  // The probed capability is what earns the fork path.
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read", login: "u", tokenKind: "classic", forkCapable: "yes" } }).route, "fork-pr");
  // Legacy probe shape (no forkCapable field) + a scope string that clearly grants it.
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read" }, scopes: "repo,gist" }).route, "fork-pr");
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read" }, scopes: "public_repo" }).route, "fork-pr");
});

test("resolveRoute: a PAT with EMPTY scopes must NOT silently route fork-pr (AC 1)", () => {
  // This is the exact defect: unknown capability used to mean "assume fork works".
  const r = resolveRoute({ token: "github_pat_xyz", probe: { ok: true, perm: "pull(read-only)", login: "u" }, scopes: "" });
  assert.notEqual(r.route, "fork-pr", "unknown fork capability must never be optimistically assumed");
  assert.equal(r.route, "issue", "it falls to the least-privileged upstream route instead");
  assert.match(r.reason, /could not be confirmed|classic/i, "and the reason carries the remedy");
});

test("resolveRoute: a fine-grained token routes to issue, never fork-pr, with the remedy", () => {
  const r = resolveRoute({ token: "github_pat_xyz", probe: { ok: true, perm: "pull(read-only)", login: "u", tokenKind: "fine-grained", forkCapable: "no" } });
  assert.equal(r.route, "issue");
  assert.match(r.reason, /fine-grained token cannot fork/);
  assert.match(r.reason, /classic/i, "the reason names the classic-token remedy");
});

test("resolveRoute: a classic token with NO upstream scope stays local (nothing upstream is possible)", () => {
  // Scopes were READ and carry neither repo nor public_repo → it can neither fork nor open an
  // issue on a public repo, so sending nothing + printing the remedy is the honest outcome.
  const r = resolveRoute({ token: "ghp_xyz", probe: { ok: true, perm: "pull(read-only)", login: "u", tokenKind: "classic", forkCapable: "no" }, scopes: "gist,read:org" });
  assert.equal(r.route, "local");
  assert.match(r.reason, /no repo\/public_repo scope/);
});

test("resolveRoute: a gh-cli session with the repo scope is fork-capable", () => {
  assert.equal(resolveRoute({ token: "gho_xyz", probe: { ok: true, perm: "pull(read-only)", login: "u", tokenKind: "gh-cli", forkCapable: "yes" } }).route, "fork-pr");
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
