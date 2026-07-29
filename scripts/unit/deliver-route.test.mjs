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
  findFindingIssue,
  purgeSession,
  probeWithRetry,
  ROUTES,
  main,
} from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";

// A readable-stream shim so main() can be driven with a struct on "stdin" in-process.
function stdinOf(obj) {
  const text = obj == null ? "" : (typeof obj === "string" ? obj : JSON.stringify(obj));
  return { isTTY: false, async *[Symbol.asyncIterator]() { if (text) yield text; } };
}
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

// ── item 4 — the pr/fork-pr routes were REMOVED ────────────────────────────────────────
// These cases previously expected `route: "pr"` / `"fork-pr"`. Both branches were HAND-OFFS that
// sent nothing, so the more rights a token had the LESS got delivered: on the reproduction a
// `maintain` token produced `sent: false, handoff: true` while an issues-only token auto-filed. A
// self-check contribution is a telemetry report, not a code change, so every authenticated token
// with issue rights now files an Issue. The SCENARIOS are preserved — only the expected route
// moved — and `item 4: no probe shape can produce a pr/fork-pr route` below pins the removal.
test("resolveRoute: push/maintain/admin permission → issue (was: pr)", () => {
  for (const perm of ["push", "maintain", "admin"]) {
    const r = resolveRoute({ token: "t", probe: { ok: true, perm } });
    assert.equal(r.route, "issue", perm);
    assert.match(r.reason, /Issue, not a code PR/, "the reason explains why push rights still file an Issue");
  }
});

// ── VCST-5582 A — no optimistic capability default (still enforced) ────────────────────
// The old rule was `canFork = !scopesKnown || /(repo|public_repo)/.test(scopes)`, while
// resolveGithubToken() leaves `scopes` EMPTY for every PAT — so every PAT routed `fork-pr`,
// including a fine-grained one GitHub structurally forbids from forking someone else's repo.
// The fork route is gone, but the no-optimistic-default rule still governs `issue` vs `local`.
test("resolveRoute: a PROVEN upstream-capable token without push → issue (was: fork-pr)", () => {
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read", login: "u", tokenKind: "classic", forkCapable: "yes" } }).route, "issue");
  // Legacy probe shape (no forkCapable field) + a scope string that clearly grants upstream rights.
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read" }, scopes: "repo,gist" }).route, "issue");
  assert.equal(resolveRoute({ token: "t", probe: { ok: true, perm: "read" }, scopes: "public_repo" }).route, "issue");
});

test("item 4: no probe shape can produce a pr/fork-pr route any more", () => {
  const probes = [
    { ok: true, perm: "admin" }, { ok: true, perm: "maintain" }, { ok: true, perm: "push" },
    { ok: true, perm: "read", forkCapable: "yes", tokenKind: "classic", login: "u" },
    { ok: true, perm: "read", forkCapable: "unknown", tokenKind: "classic" },
    { ok: true, perm: "read", forkCapable: "no", tokenKind: "fine-grained" },
    { ok: true, perm: "read", forkCapable: "no", tokenKind: "classic" },
  ];
  for (const probe of probes) {
    const { route } = resolveRoute({ token: "t", probe, scopes: "repo" });
    assert.ok(ROUTES.includes(route), `${JSON.stringify(probe)} → ${route}`);
  }
});

test("resolveRoute: a PAT with EMPTY scopes must NOT silently route fork-pr (AC 1)", () => {
  // This is the exact defect: unknown capability used to mean "assume fork works".
  const r = resolveRoute({ token: "github_pat_xyz", probe: { ok: true, perm: "pull(read-only)", login: "u" }, scopes: "" });
  assert.notEqual(r.route, "fork-pr", "unknown fork capability must never be optimistically assumed");
  assert.equal(r.route, "issue", "it falls to the least-privileged upstream route instead");
  assert.match(r.reason, /could not be confirmed|classic/i, "and the reason carries the remedy");
});

test("resolveRoute: a fine-grained token routes to issue, with the remedy", () => {
  const r = resolveRoute({ token: "github_pat_xyz", probe: { ok: true, perm: "pull(read-only)", login: "u", tokenKind: "fine-grained", forkCapable: "no" } });
  assert.equal(r.route, "issue");
  assert.match(r.reason, /fine-grained token/);
  assert.match(r.reason, /classic/i, "the reason names the classic-token remedy");
});

test("resolveRoute: a classic token with NO upstream scope stays local (nothing upstream is possible)", () => {
  // Scopes were READ and carry neither repo nor public_repo → it can neither fork nor open an
  // issue on a public repo, so sending nothing + printing the remedy is the honest outcome.
  const r = resolveRoute({ token: "ghp_xyz", probe: { ok: true, perm: "pull(read-only)", login: "u", tokenKind: "classic", forkCapable: "no" }, scopes: "gist,read:org" });
  assert.equal(r.route, "local");
  assert.match(r.reason, /no repo\/public_repo scope/);
});

test("resolveRoute: a gh-cli session with the repo scope → issue (was: fork-pr)", () => {
  assert.equal(resolveRoute({ token: "gho_xyz", probe: { ok: true, perm: "pull(read-only)", login: "u", tokenKind: "gh-cli", forkCapable: "yes" } }).route, "issue");
});

test("resolveRoute: an explicit override wins over everything", () => {
  assert.equal(resolveRoute({ token: null, override: "issue" }).route, "issue");
});

// ─── item 6 — a transient probe failure must not read as missing rights ───────────
// Observed: a dry run reported `route: local` / "token present but GitHub authentication failed",
// and a confirm run MINUTES later on the SAME token reported `perm: maintain`. The message sends
// the operator off to re-issue a PAT for what was a `gh`/network blip.
test("item 6: probeWithRetry retries once and succeeds on the second attempt", async () => {
  let calls = 0;
  const probe = async () => (++calls === 1 ? { ok: false } : { ok: true, perm: "maintain" });
  const r = await probeWithRetry({ token: "t", repo: "VirtoCommerce/x" }, { probe, delayMs: 0 });
  assert.equal(calls, 2, "the first failure is retried");
  assert.equal(r.ok, true);
  assert.equal(r.perm, "maintain");
  assert.equal(r.retried, true, "and the retry is recorded");
  assert.equal(resolveRoute({ token: "t", probe: r }).route, "issue", "the recovered probe routes normally");
});

test("item 6: a first-attempt success is NOT retried and is not marked retried", async () => {
  let calls = 0;
  const probe = async () => (calls++, { ok: true, perm: "push" });
  const r = await probeWithRetry({ token: "t", repo: "VirtoCommerce/x" }, { probe, delayMs: 0 });
  assert.equal(calls, 1);
  assert.equal(r.retried, undefined);
});

test("item 6: a genuine failure says a retry was attempted", async () => {
  const probe = async () => ({ ok: false });
  const r = await probeWithRetry({ token: "t", repo: "VirtoCommerce/x" }, { probe, delayMs: 0 });
  assert.equal(r.retried, true);
  const { route, reason } = resolveRoute({ token: "t", probe: r });
  assert.equal(route, "local");
  assert.match(reason, /retried once/, "the reason distinguishes a real failure from one unlucky call");
});

test("item 6: a THROWING prober is caught, retried, and never crashes the run", async () => {
  let calls = 0;
  const probe = async () => { calls++; throw new Error("ECONNRESET"); };
  const r = await probeWithRetry({ token: "t", repo: "VirtoCommerce/x" }, { probe, delayMs: 0 });
  assert.equal(calls, 2);
  assert.equal(r.ok, false);
  assert.equal(resolveRoute({ token: "t", probe: r }).route, "local");
});

// ─── item 4/5 — an unknown --as route is rejected, not silently dropped ───────────
test("item 4: --as pr is rejected with the valid route list", async () => {
  const chunks = [];
  const write = process.stdout.write.bind(process.stdout);
  const prevExit = process.exitCode;
  process.stdout.write = (s) => (chunks.push(String(s)), true);
  try {
    await main(["--as", "pr", "--json"]);
  } finally {
    process.stdout.write = write;
  }
  const out = JSON.parse(chunks.join(""));
  assert.match(out.error, /not a code PR/);
  assert.deepEqual(out.validRoutes, ROUTES);
  assert.equal(process.exitCode, 2);
  process.exitCode = prevExit;
});

// ─── findFindingIssue (per-finding dedup, open AND closed, fetch stubbed) ─────────
const okJson = (data) => ({ ok: true, json: async () => data });
const isSearch = (url) => String(url).includes("/search/issues");
const KEY = "project-init/tracker_field_contract";
const MARKER = `<!-- vc-fix-finding: ${KEY} -->`;
// A fetch stub routing the Search API vs the list endpoint. Search returns {items}, list returns [].
const stub = ({ search = [], list = [] } = {}) => async (url) => (isSearch(url) ? okJson({ items: search }) : okJson(list));

test("findFindingIssue: no token → null without a network call", async () => {
  let called = false;
  const r = await findFindingIssue({ repo: "VirtoCommerce/x", token: null, key: KEY, fetchImpl: async () => { called = true; return okJson([]); } });
  assert.equal(r, null);
  assert.equal(called, false);
});

test("findFindingIssue: an OPEN exact-marker match is returned as open", async () => {
  const issue = { number: 173, html_url: "u173", state: "open", title: "[vc-fix self-check] x", body: `text\n${MARKER}` };
  const r = await findFindingIssue({ repo: "VirtoCommerce/x", token: "t", key: KEY, fetchImpl: stub({ search: [issue] }) });
  assert.equal(r.number, 173);
  assert.equal(r.state, "open");
  assert.equal(r.legacy, false);
});

test("findFindingIssue (item 3): a CLOSED match is recognised as closed, not refiled", async () => {
  const closed = { number: 119, html_url: "u119", state: "closed", closed_at: "2026-01-01", title: "[vc-fix self-check] x", body: MARKER, milestone: { title: "0.9.0" } };
  const r = await findFindingIssue({ repo: "VirtoCommerce/x", token: "t", key: KEY, fetchImpl: stub({ search: [closed] }) });
  assert.equal(r.number, 119);
  assert.equal(r.state, "closed");
  assert.equal(r.milestone, "0.9.0");
});

test("findFindingIssue: prefers an OPEN issue over a CLOSED one for the same key", async () => {
  const open = { number: 200, html_url: "u200", state: "open", title: "[vc-fix self-check] x", body: MARKER };
  const closed = { number: 119, html_url: "u119", state: "closed", title: "[vc-fix self-check] x", body: MARKER };
  const r = await findFindingIssue({ repo: "VirtoCommerce/x", token: "t", key: KEY, fetchImpl: stub({ search: [closed, open] }) });
  assert.equal(r.number, 200, "the occurrence belongs on the open ticket");
});

test("findFindingIssue (item 3 legacy bridge): a bundled issue with NO per-finding marker matches by key text", async () => {
  // #173/#174 are bundled, report-level-fingerprint issues. The key appears as TEXT in the table,
  // with the self-check title prefix, but there is no `<!-- vc-fix-finding: … -->` marker.
  const bundled = { number: 173, html_url: "u173", state: "open", title: "[vc-fix self-check] onboarding defects", body: `| project-init | ${KEY} | S2 |` };
  const r = await findFindingIssue({ repo: "VirtoCommerce/x", token: "t", key: KEY, fetchImpl: stub({ search: [bundled] }) });
  assert.equal(r.number, 173);
  assert.equal(r.legacy, true, "recognised via the text bridge, flagged legacy");
});

test("findFindingIssue: an unrelated issue merely quoting the key (no self-check prefix) does NOT match", async () => {
  const unrelated = { number: 9, html_url: "u9", state: "open", title: "some human issue", body: `discussing ${KEY} in passing` };
  const r = await findFindingIssue({ repo: "VirtoCommerce/x", token: "t", key: KEY, fetchImpl: stub({ search: [unrelated] }) });
  assert.equal(r, null);
});

test("findFindingIssue: skips PRs and falls back to the list scan when Search misses", async () => {
  const pr = { number: 3, html_url: "u3", state: "open", title: "[vc-fix self-check] x", body: MARKER, pull_request: {} };
  const listed = { number: 42, html_url: "u42", state: "open", title: "[vc-fix self-check] x", body: MARKER };
  const r = await findFindingIssue({ repo: "VirtoCommerce/x", token: "t", key: KEY, fetchImpl: stub({ search: [pr], list: [pr, listed] }) });
  assert.equal(r.number, 42);
});

// ─── purgeSession (delete ONLY this session; no report artifacts any more) ────────
test("purgeSession: removes only the target session's jsonl + state, leaves other sessions", () => withTempDir((dir) => {
  const sid = "session-aaaaaa";
  const other = "session-bbbbbb";
  for (const f of [`${sid}.jsonl`, `${sid}.state.json`, `${other}.jsonl`, `${other}.state.json`]) writeFileSync(join(dir, f), "x");
  const removed = purgeSession({ dir, sid });
  assert.deepEqual(readdirSync(dir).sort(), [`${other}.jsonl`, `${other}.state.json`].sort());
  assert.deepEqual(removed.sort(), [`${sid}.jsonl`, `${sid}.state.json`].sort());
}));

test("purgeSession: a too-short / empty sid never mass-matches", () => withTempDir((dir) => {
  for (const f of ["a.jsonl", "b.state.json"]) writeFileSync(join(dir, f), "x");
  assert.deepEqual(purgeSession({ dir, sid: "abc" }), []); // sid length 3 < 6 → disabled
  assert.deepEqual(readdirSync(dir).sort(), ["a.jsonl", "b.state.json"]);
}));

test("purgeSession: never throws on a missing dir", () => {
  assert.deepEqual(purgeSession({ dir: join(tmpdir(), "does-not-exist-xyz"), sid: "session-zzzzzz" }), []);
});

// ─── deliver main() send gate — end-to-end via a struct on stdin (PR #172) ────────
// The composition that decides whether telemetry is POSTed to a PUBLIC repo. Drives main() with a
// finding struct on "stdin" and a stubbed fetch, and asserts whether a createIssue POST fired.
const STRUCT = {
  schemaVersion: 3, sessionId: "s1", pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32",
  feedback: { up: 0, down: 0 }, sessionCount: 1,
  findings: [{
    skill: "qa-bug", subject: "ado_create_workitem", blockedDeliverable: true, verdict: "BROKEN",
    severity: "S1", outcome: "failed", signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX",
    toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
  }],
};
async function driveMain(home, argv, { mode = "ask", struct = STRUCT, search = [], list = [] } = {}) {
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode }, pluginVersion: "0.8.2" }));
  const calls = [];
  const prev = { tok: process.env.GITHUB_FIX_BUGS_TOKEN, exit: process.exitCode, write: process.stdout.write, fetch: globalThis.fetch };
  process.env.GITHUB_FIX_BUGS_TOKEN = "test-token"; // short-circuits resolveGithubToken (no gh subprocess)
  let captured = "";
  process.stdout.write = (s) => (captured += String(s), true);
  const fetchImpl = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    calls.push({ url: String(url), method });
    if (method === "POST") return okJson({ number: 42, html_url: "http://issue/42" });
    if (method === "PATCH") return okJson({ number: 42 });
    if (isSearch(url)) return okJson({ items: search });
    if (String(url).includes("/issues")) return okJson(list);
    return okJson({ permissions: {} }); // probe (probeGithubUpstream uses the GLOBAL fetch)
  };
  globalThis.fetch = fetchImpl; // so probeWithRetry/probeGithubUpstream is also stubbed (deterministic, offline)
  let exitCode;
  try { await main(argv, { stdin: stdinOf(struct), fetchImpl }); exitCode = process.exitCode; }
  finally {
    process.stdout.write = prev.write; process.exitCode = prev.exit; globalThis.fetch = prev.fetch;
    if (prev.tok === undefined) delete process.env.GITHUB_FIX_BUGS_TOKEN; else process.env.GITHUB_FIX_BUGS_TOKEN = prev.tok;
  }
  // A NEW issue POSTs to `…/issues` (ends with /issues); a +1 comment POSTs to `…/issues/N/comments`.
  // Count only the former as "posted a new issue".
  return { posted: calls.some((c) => c.method === "POST" && /\/issues$/.test(c.url)), calls, exitCode, out: captured };
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
test("main: ask mode WITH --confirm files the NEW issue; auto files without --confirm", async () => {
  await withTempHome(async (home) => {
    assert.equal((await driveMain(home, ["--json", "--as", "issue", "--confirm"], { mode: "ask" })).posted, true, "ask + --confirm ⇒ POST");
  });
  await withTempHome(async (home) => {
    assert.equal((await driveMain(home, ["--json", "--as", "issue"], { mode: "auto" })).posted, true, "auto ⇒ POST without --confirm");
  });
});
test("main (item 3): an OPEN dup is NOT refiled — a +1 comment is posted instead", async () => {
  await withTempHome(async (home) => {
    const open = { number: 173, html_url: "u173", state: "open", title: "[vc-fix self-check] qa-bug/ado_create_workitem BROKEN", body: `<!-- vc-fix-finding: qa-bug/ado_create_workitem -->\n<!-- vc-fix-severity: S1 -->` };
    const r = await driveMain(home, ["--json", "--as", "issue", "--confirm"], { mode: "auto", search: [open] });
    assert.equal(r.posted, false, "an open dup must not be refiled");
    assert.ok(r.calls.some((c) => c.method === "POST" && /\/issues\/173\/comments/.test(c.url)), "a +1 occurrence comment is posted");
  });
});
test("main (item 3): a CLOSED dup is neither refiled nor commented — reported as already fixed", async () => {
  await withTempHome(async (home) => {
    const closed = { number: 119, html_url: "u119", state: "closed", title: "[vc-fix self-check] qa-bug/ado_create_workitem BROKEN", body: `<!-- vc-fix-finding: qa-bug/ado_create_workitem -->` };
    const r = await driveMain(home, ["--json", "--as", "issue", "--confirm"], { mode: "auto", search: [closed] });
    assert.equal(r.posted, false, "a closed/fixed defect must not be refiled");
    assert.ok(!r.calls.some((c) => c.method === "POST"), "and no comment is posted on a closed issue");
    const plan = JSON.parse(r.out.trim().split("\n").pop());
    assert.ok(plan.findings.some((f) => f.plan === "already-fixed"), "reported as already-fixed");
  });
});
test("main (item 6/repro): the SAME defect graded S2 then S1 resolves to ONE issue, escalated", async () => {
  // Reproduces #173/#174: two sessions, same (skill,subject), different severity. The second run
  // sees the first's OPEN issue and escalates it — one ticket, not two.
  await withTempHome(async (home) => {
    const s2 = { ...STRUCT, findings: [{ ...STRUCT.findings[0], severity: "S2", verdict: "DEGRADED", outcome: "degraded", blockedDeliverable: false }] };
    const open = { number: 173, html_url: "u173", state: "open", title: "[vc-fix self-check] qa-bug/ado_create_workitem DEGRADED", body: `<!-- vc-fix-finding: qa-bug/ado_create_workitem -->\n<!-- vc-fix-severity: S2 -->` };
    // second session grades it S1 → sees the S2 open issue → escalates, does NOT refile
    const r = await driveMain(home, ["--json", "--as", "issue", "--confirm"], { mode: "auto", struct: STRUCT, search: [open] });
    assert.equal(r.posted, false, "no second issue for the same (skill,subject)");
    const plan = JSON.parse(r.out.trim().split("\n").pop());
    const f = plan.findings[0];
    assert.equal(f.plan, "comment");
    assert.equal(f.escalatedFrom, "S2", "the escalation from S2→S1 is recorded");
    // a PATCH updates the title verdict, and a +1 comment is posted
    assert.ok(r.calls.some((c) => c.method === "PATCH" && /\/issues\/173$/.test(c.url)), "title upgraded");
    // s2 unused beyond documenting the first-session shape
    void s2;
  });
});
