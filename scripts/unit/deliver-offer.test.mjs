// Tests for the delivery OFFER contract after the PR #172 rework —
// plugins/vc-fix/skills/vc-self-check/deliver.mjs dry-run plan + the SKILL.md orchestration rules.
//
// The offer used to live in deliver (a DELIVERY-*.md draft + a one-shot fingerprint guard). It now
// lives in the ORCHESTRATOR (SKILL.md): deliver produces a per-finding PLAN on --dry, and the
// orchestrator asks ONE binary AskUserQuestion. The anti-nag guard is the compact per-finding
// record in state.json (a dry run marks each new finding `pending`; a `declined`/`sent` entry means
// "don't re-ask"). No DELIVERY/DIAG files exist any more. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempHome } from "./_test-helpers.mjs";
import { main, readFindingRecords, findingAlreadyDecided } from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SID = "s-offer-1";
const FINDING = {
  skill: "qa-bug", subject: "ado_create_workitem", blockedDeliverable: true, verdict: "BROKEN",
  severity: "S1", outcome: "failed", signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX",
  toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
};
const structOf = (over = {}) => ({
  schemaVersion: 3, sessionId: SID, pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32",
  feedback: over.feedback ?? { up: 0, down: 0 }, sessionCount: 1,
  findings: over.findings ?? [FINDING],
});

function stdinOf(obj) {
  const text = obj == null ? "" : JSON.stringify(obj);
  return { isTTY: false, async *[Symbol.asyncIterator]() { if (text) yield text; } };
}
function seedProfile(home, mode = "ask") {
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode }, pluginVersion: "0.8.2" }));
  const dir = join(home, ".vc-fix", "diagnostics");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${SID}.state.json`), JSON.stringify({ sid: SID, selfCheckSeen: true }));
  return dir;
}

/** Drive deliver.main() with the struct on stdin + a stubbed fetch; returns the JSON plan. */
async function drive(home, argv = ["--json", "--session", SID], { struct = structOf(), search = [] } = {}) {
  const calls = [];
  const prev = { fetch: globalThis.fetch, tok: process.env.GITHUB_FIX_BUGS_TOKEN, write: process.stdout.write, exit: process.exitCode };
  let out = "";
  process.env.GITHUB_FIX_BUGS_TOKEN = "ghp_classic_test_token";
  process.stdout.write = (s) => { out += s; return true; };
  const okJson = (d) => ({ ok: true, json: async () => d });
  const fetchImpl = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    calls.push({ url: String(url), method });
    if (method === "POST") return okJson({ number: 42, html_url: "http://issue/42" });
    if (String(url).endsWith("/user")) return { ok: true, status: 200, headers: { get: (k) => (k.toLowerCase() === "x-oauth-scopes" ? "repo, gist" : null) }, json: async () => ({ login: "qa-bot" }) };
    if (String(url).includes("/search/issues")) return okJson({ items: search });
    if (String(url).includes("/issues")) return okJson([]);
    return { ok: true, headers: { get: () => null }, json: async () => ({ permissions: {} }) };
  };
  globalThis.fetch = fetchImpl;
  try { await main(argv, { stdin: stdinOf(struct), fetchImpl }); } finally {
    globalThis.fetch = prev.fetch; process.stdout.write = prev.write; process.exitCode = prev.exit;
    if (prev.tok === undefined) delete process.env.GITHUB_FIX_BUGS_TOKEN; else process.env.GITHUB_FIX_BUGS_TOKEN = prev.tok;
  }
  let plan = null;
  try { plan = JSON.parse(out.trim().split("\n").pop()); } catch { /* non-JSON */ }
  return { plan, out, posted: calls.some((c) => c.method === "POST"), calls };
}

// ─── the dry run IS the plan: nothing sent, per-finding decisions recorded ────────
test("dry: a BROKEN finding in mode=ask plans to FILE and sends NOTHING", async () => {
  await withTempHome(async (home) => {
    seedProfile(home);
    const { plan, posted } = await drive(home);
    assert.equal(posted, false, "the dry plan must never send");
    assert.equal(plan.dryRun, true);
    assert.equal(plan.route, "issue");
    assert.equal(plan.findings[0].plan, "file", "no existing issue ⇒ plan to file a new one");
    assert.match(plan.nextSteps.join("\n"), /--confirm/);
  });
});

test("dry: the DISCLOSURE surface — the plan carries the exact struct that would be sent", async () => {
  await withTempHome(async (home) => {
    seedProfile(home);
    const { plan } = await drive(home);
    // The orchestrator renders `plan.struct` verbatim before the yes/no (SKILL Step 2). It is the
    // validated struct — so the operator sees exactly what travels.
    assert.ok(plan.struct && Array.isArray(plan.struct.findings));
    assert.equal(plan.struct.findings[0].subject, "ado_create_workitem");
    assert.equal(plan.summary.includes("new"), true, "the split summary names the new finding(s)");
  });
});

// ─── the anti-nag guard is now state.json records ─────────────────────────────────
test("dry: a dry run records each new finding as 'pending' (so a later run can retry / not re-ask)", async () => {
  await withTempHome(async (home) => {
    seedProfile(home);
    await drive(home);
    const recs = readFindingRecords(SID);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].key, "qa-bug/ado_create_workitem");
    assert.equal(recs[0].decision, "pending");
    // pending is NOT "decided" — the orchestrator may still offer it this turn.
    assert.equal(findingAlreadyDecided(SID, FINDING), false);
  });
});

// ─── silence rules ────────────────────────────────────────────────────────────────
test("mode=off stays SILENT — nothing planned, nothing sent, no state written", async () => {
  await withTempHome(async (home) => {
    seedProfile(home, "off");
    const { plan, posted } = await drive(home);
    assert.equal(posted, false);
    assert.equal(plan.action, "disabled");
    assert.equal(plan.reason, "feedback.mode=off");
    assert.deepEqual(readFindingRecords(SID), [], "mode=off records nothing");
  });
});

test("no BROKEN/DEGRADED finding + no 👎 ⇒ 'none' (the deliver path is a no-op)", async () => {
  await withTempHome(async (home) => {
    seedProfile(home);
    const { plan, posted } = await drive(home, ["--json", "--session", SID], { struct: structOf({ findings: [] }) });
    assert.equal(posted, false);
    assert.equal(plan.action, "none");
  });
});

test("a DEGRADED finding alone is enough to plan an offer (not only BROKEN)", async () => {
  await withTempHome(async (home) => {
    seedProfile(home);
    const degraded = { ...FINDING, verdict: "DEGRADED", severity: "S2", outcome: "degraded", blockedDeliverable: false };
    const { plan } = await drive(home, ["--json", "--session", SID], { struct: structOf({ findings: [degraded] }) });
    assert.equal(plan.dryRun, true);
    assert.equal(plan.findings[0].plan, "file");
  });
});

test("nothing is EVER sent without --confirm; with it, the Issue route files", async () => {
  await withTempHome(async (home) => {
    seedProfile(home);
    assert.equal((await drive(home, ["--json", "--session", SID])).posted, false, "dry ⇒ no POST");
    assert.equal((await drive(home, ["--json", "--session", SID, "--as", "issue", "--confirm"])).posted, true, "Send ⇒ POST");
  });
});

// ─── the SKILL rules that drive the offer (orchestration contract) ────────────────
test("SKILL.md: the orchestrator asks ONE binary question, spawns the subagent, discloses the struct", () => {
  const md = readFileSync(join(ROOT, "plugins/vc-fix/skills/vc-self-check/SKILL.md"), "utf8");
  assert.match(md, /self-check-diagnostician/, "diagnosis is delegated to the subagent");
  assert.match(md, /Spawn the diagnostician/i);
  assert.match(md, /ONE.*question/i, "one question per turn");
  assert.match(md, /File these in the VirtoCommerce plugin repo\?/, "the single binary question");
  assert.match(md, /disclosure surface/i, "the restated summary is the disclosure surface");
  assert.match(md, /feedback\.mode/);
  // The artifacts are documented as REMOVED (not written / not read), not silently absent.
  assert.match(md, /DIAG-\*\.md.*(?:gone|removed|no local report)|No local report artifacts/i, "the DIAG/DELIVERY removal is stated");
});

test("SKILL.md: the split summary (already-reported vs new) is part of the contract (item 3)", () => {
  const md = readFileSync(join(ROOT, "plugins/vc-fix/skills/vc-self-check/SKILL.md"), "utf8");
  assert.match(md, /already reported/i);
  assert.match(md, /already[- ]fixed|closed\/fixed/i, "a closed match is reported as fixed, not refiled");
  assert.match(md, /one issue per finding/i);
});

test("SKILL.md + command: /project-init no longer asks the delivery mode (item 4)", () => {
  const skill = readFileSync(join(ROOT, "plugins/vc-fix/skills/project-init/SKILL.md"), "utf8");
  const cmd = readFileSync(join(ROOT, "plugins/vc-fix/commands/project-init.md"), "utf8");
  assert.match(skill, /NOT asked here|is NOT asked/i, "§0c documents the removal");
  assert.doesNotMatch(cmd, /--feedback-mode <ask\|auto\|off> from the/, "the interview no longer passes --feedback-mode");
});
