// Unit tests for the VCST-5509 additions to plugins/vc-fix/skills/vc-self-check/deliver.mjs
// as reworked by the default-deny closed-schema redesign: feedback.mode consent gating
// (feedbackMode), the structured /vc-feedback capture readback (readSessionRecords), and
// buildDraft's CLOSED-SCHEMA rendering (it takes a validated UpstreamSignal struct and renders
// enums/counts ONLY — no free text, no operator prose). The fingerprint/findingSig tests moved to
// upstream-reduce.test.mjs (fingerprintStruct); the free-text client-shape scrubbers
// (scrubText/isClientSpecific) were removed as dead code (PR #143 R2 F1) — the closed schema is
// the sole upstream guard, and the shared redact.mjs secret rules are covered by
// session-telemetry.test.mjs. Pure module-level imports, no child process — VC_FIX_HOME is
// set/reset around each test. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDraft,
  feedbackMode,
  readSessionRecords,
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

// ─── feedbackMode ────────────────────────────────────────────────────────────────
test("feedbackMode: defaults to 'ask' when no project-profile.json exists", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    withHome(home, () => assert.equal(feedbackMode(), "ask"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("feedbackMode: reads a valid mode from project-profile.json", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode: "auto" } }));
    withHome(home, () => assert.equal(feedbackMode(), "auto"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("feedbackMode: an invalid/garbage mode value falls back to 'ask', never 'auto'", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode: "yolo" } }));
    withHome(home, () => assert.equal(feedbackMode(), "ask"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── readSessionRecords (the structured jsonl source for reduce) ──────────────────
test("readSessionRecords: splits span / feedback / finalize / session_start records", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    const dir = join(home, ".vc-fix", "diagnostics");
    mkdirSync(dir, { recursive: true });
    const lines = [
      { type: "session_start", sessionId: "s1", pluginVersion: "0.8.1" },
      { type: "span", id: "1", kind: "skill", name: "qa-fix", outcome: "failed" },
      { type: "feedback", sessionId: "s1", verdict: "down", text: "prose that must stay LOCAL" },
      { type: "finalize", sessionId: "s1", decision: { verdict: "flagged" } },
    ];
    writeFileSync(join(dir, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    withHome(home, () => {
      const rec = readSessionRecords("s1");
      assert.equal(rec.pluginVersion, "0.8.1");
      assert.equal(rec.spans.length, 1);
      assert.equal(rec.spans[0].name, "qa-fix");
      assert.equal(rec.feedback.length, 1);
      assert.equal(rec.feedback[0].verdict, "down");
      assert.ok(rec.finalize && rec.finalize.decision.verdict === "flagged");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("readSessionRecords: missing/absent session returns the empty shell, never throws", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    withHome(home, () => {
      const rec = readSessionRecords("nope");
      // `obs` joined the shell when the reducer started consuming the observation stream
      // (the other half of the VCST-5582 H analysis set). The shape is pinned EXACTLY on
      // purpose — the absent path must hand back every key a caller may index, so a consumer
      // can iterate `.obs` without a presence check.
      assert.deepEqual(rec, { spans: [], obs: [], feedback: [], finalize: null, pluginVersion: "unknown" });
      assert.deepEqual(readSessionRecords(null).spans, []);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── buildDraft (CLOSED-SCHEMA rendering — enums + counts ONLY, no free text) ────────
const structOf = (over = {}) => validateUpstream({
  schemaVersion: 1, pluginVersion: "0.8.1",
  findings: over.findings ?? [],
  feedback: over.feedback ?? { up: 0, down: 0 },
  sessionCount: over.sessionCount ?? 1,
});
const brokenFinding = (over = {}) => ({
  skill: "qa-fix", verdict: "BROKEN", severity: "S1", outcome: "failed",
  signalClass: "permission_denied", struggle: [], errorCode: "AUTH_MISSING_SCOPE",
  toolFamily: "github", repoKind: "backend", retries: 1, occurrences: 1, ...over,
});

test("buildDraft: renders a findings row from enum fields only", () => {
  const d = buildDraft({ struct: structOf({ findings: [brokenFinding()] }), route: "issue" });
  assert.match(d.body, /## Findings/);
  // Schema v2 (item 10) leads with severity and names the culprit: `S1 · qa-fix · <subject> · blocked`.
  assert.match(d.body, /S1 \| qa-fix \| \w+ \| (?:blocked|—) \| BROKEN \| failed \| permission_denied \| AUTH_MISSING_SCOPE/);
  assert.match(d.title, /qa-fix\/\w+ BROKEN/);
  assert.ok(d.fingerprint && typeof d.fingerprint === "string");
});

test("buildDraft: operator feedback is COUNTS ONLY — no prose ever reaches the draft", () => {
  // Even if a caller somehow smuggled text-shaped feedback, buildDraft reads only the counts.
  const d = buildDraft({ struct: structOf({ feedback: { up: 2, down: 3 } }), route: "issue" });
  assert.match(d.body, /## Operator feedback/);
  assert.match(d.body, /👍 2 · 👎 3/);
  assert.match(d.title, /operator feedback 👎/);
});

test("buildDraft: a feedback-only draft (no findings) reflects the operator verdict, not OK", () => {
  const d = buildDraft({ struct: structOf({ feedback: { up: 0, down: 1 } }), route: "issue" });
  assert.ok(!/## Findings/.test(d.body));
  assert.match(d.title, /operator feedback 👎/);
});

test("buildDraft: an occurrence count > 1 is annotated on the row", () => {
  const d = buildDraft({ struct: structOf({ findings: [brokenFinding({ occurrences: 4 })], sessionCount: 4 }), route: "issue" });
  assert.match(d.body, /×4 sessions/);
  assert.match(d.body, /Sessions: 4/);
});
