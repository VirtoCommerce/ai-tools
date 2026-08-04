// Tests for VCST-5582 B1 — comment/issue TEMPLATE PARITY in
// plugins/vc-fix/skills/vc-self-check/deliver.mjs.
//
// The reproduction: dedup matched three findings to one pre-existing LEGACY issue (#174) and posted
// three bare "+1 occurrence" comments carrying NO location — because the "## Where" evidence block
// lived only in the issue-body template. A deduped finding therefore reached the maintainer with no
// root cause. Fix: the comment carries the SAME Where block, suppressed only when the target issue
// already has that evidence (matched on WHERE_MARKER + a content hash). So the FIRST comment on an
// evidence-less/legacy issue is full; repeat occurrences stay a short counter. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { withTempHome } from "./_test-helpers.mjs";
import {
  main, buildWhereBlock, occurrenceCommentBody, buildFindingIssue, WHERE_MARKER,
} from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";

const SID = "s-where-1";
// A finding whose provenance survives validation: pluginFile EXISTS on disk (discover-tracker.mjs),
// offendingLiteral is a real substring of it, and proposedFix references only plugin paths.
const FINDING = {
  skill: "project-init", subject: "tracker_field_contract", blockedDeliverable: false, verdict: "DEGRADED",
  severity: "S2", outcome: "degraded", signalClass: "none", struggle: [], errorCode: "UNKNOWN",
  toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
  pluginFile: "skills/project-init/discover-tracker.mjs",
  pluginLine: 232,
  offendingLiteral: "$expand=all",
  vendorHttpStatus: 400,
  proposedFix: "the field contract now uses $expand=all in discover-tracker.mjs",
};
const structOf = () => ({
  schemaVersion: 3, sessionId: SID, pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32",
  feedback: { up: 0, down: 0 }, sessionCount: 2, findings: [FINDING],
});

function stdinOf(obj) {
  const text = JSON.stringify(obj);
  return { isTTY: false, async *[Symbol.asyncIterator]() { yield text; } };
}
function seedProfile(home) {
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode: "ask" }, pluginVersion: "0.8.2" }));
  const dir = join(home, ".vc-fix", "diagnostics");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${SID}.state.json`), JSON.stringify({ sid: SID }));
  // Grounding corpus (VCST-5582 confabulation gate): the ADO field-contract 400 this finding cites is
  // captured by a real collector (discover-tracker emits an HTTP_4XX obs), so vendorHttpStatus stays in
  // the validated struct — keeping the Where-marker stable for the dedup +1 path.
  writeFileSync(join(dir, `${SID}.jsonl`), JSON.stringify({
    type: "obs", class: "http_non2xx", subject: "tracker_field_contract", code: "HTTP_4XX",
    evidence: { snippet: `ADO field contract failed: HTTP ${FINDING.vendorHttpStatus}`, httpStatus: FINDING.vendorHttpStatus },
  }) + "\n");
}

// ─── pure-unit parity ─────────────────────────────────────────────────────────────
test("buildWhereBlock: the issue body and an includeWhere comment carry the SAME block + marker", () => {
  const { lines, marker } = buildWhereBlock(FINDING);
  assert.ok(lines.length, "the finding has provenance ⇒ a non-empty Where block");
  assert.ok(marker.includes(WHERE_MARKER), "a content-hash marker is emitted");
  const issue = buildFindingIssue({ finding: FINDING, struct: structOf() });
  assert.ok(issue.body.includes("## Where") && issue.body.includes(marker), "issue body carries the block + marker");
  const comment = occurrenceCommentBody({ finding: FINDING, struct: structOf(), includeWhere: true });
  assert.ok(comment.includes("## Where") && comment.includes(marker), "an includeWhere comment carries the SAME block + marker");
  assert.ok(comment.includes("$expand=all"), "the offending literal travels in the comment too");
});

test("occurrenceCommentBody: without includeWhere it stays a short counter (no ## Where)", () => {
  const comment = occurrenceCommentBody({ finding: FINDING, struct: structOf(), includeWhere: false });
  assert.ok(comment.includes("+1 occurrence"), "still the short prevalence counter");
  assert.ok(!comment.includes("## Where"), "no Where block when the issue already carries it");
});

// ─── integration: a legacy enum-only issue gets full evidence on the FIRST comment ──
async function driveConfirm(home, { issue, comments = [] }) {
  const prevTok = process.env.GITHUB_FIX_BUGS_TOKEN;
  const prevFetch = globalThis.fetch;
  const prevWrite = process.stdout.write;
  process.env.GITHUB_FIX_BUGS_TOKEN = "ghp_classic_test_token";
  let out = "";
  process.stdout.write = (s) => { out += s; return true; };
  const posted = [];
  const okJson = (d) => ({ ok: true, json: async () => d });
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || "GET").toUpperCase();
    if (u.endsWith("/user")) return { ok: true, status: 200, headers: { get: (k) => (k.toLowerCase() === "x-oauth-scopes" ? "repo" : null) }, json: async () => ({ login: "qa-bot" }) };
    if (method === "POST" && u.includes("/comments")) { posted.push(JSON.parse(opts.body)); return okJson({ id: 1 }); }
    if (u.includes("/search/issues")) return okJson({ items: issue ? [issue] : [] });
    if (u.match(/\/issues\/\d+\/comments/)) return okJson(comments); // commentsCarryMarker read
    if (u.includes("/issues")) return okJson([]); // list fallback
    return { ok: true, headers: { get: () => null }, json: async () => ({ permissions: { push: true } }) };
  };
  globalThis.fetch = fetchImpl;
  try {
    await main(["--json", "--confirm", "--keep", "--session", SID], { stdin: stdinOf(structOf()), fetchImpl });
  } finally {
    globalThis.fetch = prevFetch;
    process.stdout.write = prevWrite;
    if (prevTok === undefined) delete process.env.GITHUB_FIX_BUGS_TOKEN; else process.env.GITHUB_FIX_BUGS_TOKEN = prevTok;
  }
  return { plan: JSON.parse(out.trim().split("\n").pop()), posted };
}

test("a LEGACY enum-only open issue receives FULL evidence on the first +1 comment (#174 regression)", async () => {
  await withTempHome(async (home) => {
    seedProfile(home);
    // #174-shape: our self-check title prefix + the key as text, but NO per-finding marker and NO
    // Where marker — the legacy bridge matches it, and it carries no evidence.
    const legacy = {
      number: 174, html_url: "https://github.com/VirtoCommerce/vc-mcp-testing-module/issues/174", state: "open",
      title: "[vc-fix self-check] project-init/tracker_field_contract DEGRADED",
      body: "Bundled report. skill project-init subject tracker_field_contract. S2.",
    };
    const { plan, posted } = await driveConfirm(home, { issue: legacy, comments: [] });
    const r = plan.findings[0];
    assert.equal(r.plan, "comment", "an OPEN match ⇒ a +1 occurrence comment");
    assert.equal(r.action, "commented");
    assert.equal(posted.length, 1, "exactly one comment posted");
    const body = posted[0].body;
    assert.ok(body.includes("## Where"), "the first comment on an evidence-less issue carries the Where block");
    assert.ok(body.includes("discover-tracker.mjs"), "with the file location");
    assert.ok(body.includes("$expand=all"), "and the offending literal");
    assert.ok(body.includes(WHERE_MARKER), "and the WHERE_MARKER so a later occurrence can suppress it");
  }, "vc-fix-where-legacy-");
});

test("an issue that ALREADY carries the Where marker gets only a short counter", async () => {
  await withTempHome(async (home) => {
    seedProfile(home);
    const { marker } = buildWhereBlock(FINDING);
    const tracked = {
      number: 180, html_url: "https://github.com/VirtoCommerce/vc-mcp-testing-module/issues/180", state: "open",
      title: "[vc-fix self-check] project-init/tracker_field_contract DEGRADED",
      body: `<!-- vc-fix-finding: project-init/tracker_field_contract -->\n${marker}\n## Where\n- Location: discover-tracker.mjs`,
    };
    const { posted } = await driveConfirm(home, { issue: tracked });
    assert.equal(posted.length, 1);
    assert.ok(!posted[0].body.includes("## Where"), "the body already carries the evidence ⇒ short counter, no duplicate block");
  }, "vc-fix-where-tracked-");
});
