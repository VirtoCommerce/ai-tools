// Unit tests for the VCST-5509 additions to plugins/vc-fix/skills/vc-self-check/deliver.mjs
// as reworked by the default-deny closed-schema redesign: feedback.mode consent gating
// (feedbackMode), /vc-feedback capture readback (readSessionFeedback + readSessionRecords),
// scrubText's local defense-in-depth secret redaction, and buildDraft's CLOSED-SCHEMA
// rendering (it now takes a validated UpstreamSignal struct and renders enums/counts ONLY —
// no free text, no operator prose). The fingerprint/findingSig tests moved to
// upstream-reduce.test.mjs (fingerprintStruct). Pure module-level imports, no child process —
// VC_FIX_HOME is set/reset around each test. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDraft,
  feedbackMode,
  readSessionFeedback,
  readSessionRecords,
  scrubText,
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

// ─── readSessionFeedback ─────────────────────────────────────────────────────────
test("readSessionFeedback: reads only feedback-typed records for the given session", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    const dir = join(home, ".vc-fix", "diagnostics");
    mkdirSync(dir, { recursive: true });
    const lines = [
      { type: "session_start", sessionId: "s1" },
      { type: "feedback", sessionId: "s1", verdict: "down", text: "broke pagination" },
      { type: "span", sessionId: "s1", kind: "command" },
      { type: "feedback", sessionId: "s1", verdict: "up", text: "" },
    ];
    writeFileSync(join(dir, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    withHome(home, () => {
      const fb = readSessionFeedback("s1");
      assert.equal(fb.length, 2);
      assert.deepEqual(fb.map((f) => f.verdict), ["down", "up"]);
      assert.equal(fb[0].text, "broke pagination");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("readSessionFeedback: no session id or missing file returns an empty array, never throws", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    withHome(home, () => {
      assert.deepEqual(readSessionFeedback(null), []);
      assert.deepEqual(readSessionFeedback("nope"), []);
    });
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
      assert.deepEqual(rec, { spans: [], feedback: [], finalize: null, pluginVersion: "unknown" });
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
  assert.match(d.body, /qa-fix \| BROKEN \| S1 \| failed \| permission_denied \| AUTH_MISSING_SCOPE/);
  assert.match(d.title, /qa-fix BROKEN/);
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

// ─── scrubText secret redaction — shared hardened rules (PR #143 review, Finding 1) ──────────
// deliver.mjs scrubs every outbound cell before it reaches the PUBLIC upstream. It used to carry
// its OWN pre-#143 `\b(keyword)\b` array that leaked compound-key / Basic-auth / AccountKey / SAS
// shapes; it now shares hooks/redact.mjs with the collector, so these must all be redacted.
test("scrubText: shared redaction covers the shapes deliver's old weak array leaked", () => {
  const cases = [
    ['{"access_token":"AKtokenLEAK1234567890"}', "AKtokenLEAK1234567890"],
    ['{"refresh_token":"RTtokenLEAK1234567890"}', "RTtokenLEAK1234567890"],
    ["client_secret=CSsecretLEAK1234567890", "CSsecretLEAK1234567890"],
    ["aws_secret_access_key=AWSsecretLEAK1234567890", "AWSsecretLEAK1234567890"],
    ['body {"password":"PWjsonLEAK1234"}', "PWjsonLEAK1234"],
    ["HTTP 401 Authorization: Basic dXNlcjpMRUFLYmFzaWNQQVQ=", "dXNlcjpMRUFLYmFzaWNQQVQ="], // base64 PAT blob
    ["conn AccountKey=AcctKeyLEAK1234567890== end", "AcctKeyLEAK1234567890=="],
  ];
  for (const [input, secret] of cases) {
    const out = scrubText(input);
    assert.ok(!out.includes(secret), `scrubText must redact "${secret}" but leaked it: ${out}`);
    assert.ok(/«redacted»/.test(out), `a redaction marker must appear for: ${input}`);
  }
});
