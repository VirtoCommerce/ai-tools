// Unit tests for the consent + issue-rendering pieces of
// plugins/vc-fix/skills/vc-self-check/deliver.mjs after the PR #172 rework:
//   - feedbackMode           — the feedback.mode consent gate (project-profile.json)
//   - buildFindingIssue      — ONE issue per finding, enum + vendor-provenance fields only (§7)
//   - recordFindingDecision  — the compact per-finding record in state.json (the ONLY persistence)
// The former DIAG/DELIVERY report artifacts are gone (item 2), so `readSessionRecords`/`buildDraft`
// were removed; the jsonl→struct reduction now lives in the diagnostician subagent + reduce(). Pure
// module-level imports, no child process. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildFindingIssue,
  feedbackMode,
  recordFindingDecision,
  readFindingRecords,
  findingAlreadyDecided,
} from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";
import { validateUpstream } from "../../plugins/vc-fix/skills/vc-self-check/upstream-reduce.mjs";

function withHome(home, fn) {
  const prev = process.env.VC_FIX_HOME;
  process.env.VC_FIX_HOME = home;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.VC_FIX_HOME;
    else process.env.VC_FIX_HOME = prev;
  }
}
function tempHome(fn) {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try { return withHome(home, () => fn(home)); }
  finally { rmSync(home, { recursive: true, force: true }); }
}

// ─── feedbackMode ────────────────────────────────────────────────────────────────
test("feedbackMode: defaults to 'ask' when no project-profile.json exists", () => {
  tempHome(() => assert.equal(feedbackMode(), "ask"));
});

test("feedbackMode: reads a valid mode from project-profile.json", () => {
  tempHome((home) => {
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode: "auto" } }));
    assert.equal(feedbackMode(), "auto");
  });
});

test("feedbackMode: an invalid/garbage mode value falls back to 'ask', never 'auto'", () => {
  tempHome((home) => {
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode: "yolo" } }));
    assert.equal(feedbackMode(), "ask");
  });
});

// ─── recordFindingDecision / readFindingRecords (the ONLY local persistence, item 2) ──
const stateFile = (home, sid) => join(home, ".vc-fix", "diagnostics", `${sid}.state.json`);
function seedState(home, sid, obj = {}) {
  const dir = join(home, ".vc-fix", "diagnostics");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}.state.json`), JSON.stringify(obj));
}
const FIND = { skill: "qa-bug", subject: "ado_create_workitem", severity: "S1", verdict: "BROKEN" };

test("recordFindingDecision: writes a compact record; readFindingRecords reads it back", () => {
  tempHome((home) => {
    seedState(home, "s1", { selfCheckSeen: true });
    recordFindingDecision("s1", FIND, { decision: "declined" });
    const recs = readFindingRecords("s1");
    assert.equal(recs.length, 1);
    assert.equal(recs[0].key, "qa-bug/ado_create_workitem");
    assert.equal(recs[0].decision, "declined");
    assert.equal(recs[0].severity, "S1");
    // the existing state fields are preserved (not clobbered)
    assert.equal(JSON.parse(readFileSync(stateFile(home, "s1"), "utf8")).selfCheckSeen, true);
  });
});

test("recordFindingDecision: decision 'sent' CLEARS the entry (the issue is the source of truth)", () => {
  tempHome((home) => {
    seedState(home, "s1");
    recordFindingDecision("s1", FIND, { decision: "pending" });
    assert.equal(readFindingRecords("s1").length, 1);
    recordFindingDecision("s1", FIND, { decision: "sent", issueNumber: 42 });
    assert.equal(readFindingRecords("s1").length, 0, "a sent finding leaves no stale 'already sent' record");
  });
});

test("findingAlreadyDecided: true after declined/sent, false while pending or unseen", () => {
  tempHome((home) => {
    seedState(home, "s1");
    assert.equal(findingAlreadyDecided("s1", FIND), false);
    recordFindingDecision("s1", FIND, { decision: "pending" });
    assert.equal(findingAlreadyDecided("s1", FIND), false, "pending is not decided — it may still be offered");
    recordFindingDecision("s1", FIND, { decision: "declined" });
    assert.equal(findingAlreadyDecided("s1", FIND), true);
  });
});

test("recordFindingDecision: no state file ⇒ no-op, never throws (capture off)", () => {
  tempHome(() => {
    assert.doesNotThrow(() => recordFindingDecision("nope", FIND, { decision: "pending" }));
    assert.deepEqual(readFindingRecords("nope"), []);
    assert.ok(!existsSync(stateFile(process.env.VC_FIX_HOME, "nope")));
  });
});

// ─── buildFindingIssue (ONE issue per finding — §7 body) ─────────────────────────────
const structOf = (over = {}) => validateUpstream({
  schemaVersion: 3, pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32",
  findings: over.findings ?? [],
  feedback: over.feedback ?? { up: 0, down: 0 },
  sessionCount: over.sessionCount ?? 1,
});
const brokenFinding = (over = {}) => ({
  skill: "qa-bug", subject: "ado_create_workitem", blockedDeliverable: true, verdict: "BROKEN",
  severity: "S1", outcome: "failed", signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX",
  toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1, ...over,
});

test("buildFindingIssue: title + per-finding marker key on (skill, subject)", () => {
  const struct = structOf({ findings: [brokenFinding()] });
  const b = buildFindingIssue({ finding: struct.findings[0], struct, route: "issue" });
  assert.equal(b.key, "qa-bug/ado_create_workitem");
  assert.match(b.title, /\[vc-fix self-check\] qa-bug\/ado_create_workitem BROKEN/);
  assert.match(b.body, /<!-- vc-fix-finding: qa-bug\/ado_create_workitem -->/);
  assert.match(b.body, /<!-- vc-fix-severity: S1 -->/);
});

test("buildFindingIssue (§7): the one-finding table has NO Outcome column, and states the impact", () => {
  const struct = structOf({ findings: [brokenFinding()] });
  const b = buildFindingIssue({ finding: struct.findings[0], struct, route: "issue" });
  assert.match(b.body, /\| Sev \| Skill \| Subject \| Verdict \| Impact \| Signal \| Error \|/);
  assert.doesNotMatch(b.body, /\bOutcome\b/, "the Outcome column that read 'success' next to BROKEN is gone");
  assert.match(b.body, /\| S1 \| qa-bug \| ado_create_workitem \| BROKEN \| blocked the deliverable \| tool_error \| HTTP_4XX \|/);
});

test("buildFindingIssue (§7): Struggle/Repo render ONLY when populated", () => {
  const bare = buildFindingIssue({ finding: structOf({ findings: [brokenFinding()] }).findings[0], struct: structOf(), route: "issue" });
  assert.doesNotMatch(bare.body, /Struggle:/);
  assert.doesNotMatch(bare.body, /Repo kind:/);
  const rich = structOf({ findings: [brokenFinding({ struggle: ["retry_storm"], repoKind: "backend", retries: 2 })] });
  const b = buildFindingIssue({ finding: rich.findings[0], struct: rich, route: "issue" });
  assert.match(b.body, /Struggle: `retry_storm`/);
  assert.match(b.body, /Repo kind: `backend`/);
  assert.match(b.body, /Retries: 2/);
});

test("buildFindingIssue (§5 provenance): a Where block renders the vendor-provenance fields", () => {
  const f = brokenFinding({
    pluginFile: "skills/project-init/discover-tracker.mjs", pluginLine: 232,
    codeExcerpt: "?$expand=Properties`;", offendingLiteral: "$expand=Properties",
    apiShape: "GET {base}/{project}/_apis/wit/…", proposedFix: "drop $expand=Properties",
    vendorErrorTypeKey: "RuleValidationException", vendorHttpStatus: 400,
  });
  // buildFindingIssue renders whatever the finding carries (validateUpstream already gated it)
  const struct = { pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32", sessionCount: 1, feedback: { up: 0, down: 0 } };
  const b = buildFindingIssue({ finding: f, struct, route: "issue" });
  assert.match(b.body, /## Where/);
  assert.match(b.body, /skills\/project-init\/discover-tracker\.mjs:232/);
  assert.match(b.body, /\$expand=Properties/);
  assert.match(b.body, /Vendor error identity: typeKey `RuleValidationException`.*HTTP 400/);
  assert.match(b.body, /Proposed fix: drop \$expand=Properties/);
});

test("buildFindingIssue: the containment note is ACCURATE to the v3 rule (not 'NO file paths')", () => {
  const struct = structOf({ findings: [brokenFinding()] });
  const b = buildFindingIssue({ finding: struct.findings[0], struct, route: "issue" });
  // D1 (VCST-5582): the ~200-word paragraph is now ONE line linking the ADR — but it still names the
  // containment guarantee accurately (vendor-provenance, default-deny) and never overclaims.
  assert.match(b.body, /Containment/);
  assert.match(b.body, /vendor-provenance/i);
  assert.match(b.body, /adr-upstream-default-deny\.md/, "the containment detail lives in the ADR now, linked");
  assert.doesNotMatch(b.body, /NO file paths/, "the old overclaiming note is gone");
});
test("D1: the issue body no longer carries the ~200-word containment paragraph", () => {
  const struct = structOf({ findings: [brokenFinding()] });
  const b = buildFindingIssue({ finding: struct.findings[0], struct, route: "issue" });
  // The paragraph that was LONGER than the finding in #180–#183 is gone; the body stays compact.
  assert.doesNotMatch(b.body, /Enum\/number fields come from a closed/, "the boilerplate paragraph is removed");
});

test("buildFindingIssue: operator feedback renders as COUNTS only", () => {
  const struct = structOf({ findings: [brokenFinding()], feedback: { up: 2, down: 3 } });
  const b = buildFindingIssue({ finding: struct.findings[0], struct, route: "issue" });
  assert.match(b.body, /## Operator feedback/);
  assert.match(b.body, /👍 2 · 👎 3/);
});
