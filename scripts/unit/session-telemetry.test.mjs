// Unit tests for the Tier 0/1/2 span reconstruction + outcome classification rewrite
// (VCST-5509) in plugins/vc-fix/hooks/session-telemetry.mjs. Scope: plugins/vc-fix/ only —
// the .claude/ mirror intentionally still ships the pre-5509 model (see that file's header
// comment), so it has no classify()/detectStruggle() to exercise here.
//
// Drives the ACTUAL hook script as a child process, exactly as Claude Code's hook runner
// does: one `node session-telemetry.mjs <subcommand>` invocation per hook firing, JSON event
// on stdin. Each scenario gets its own temp VC_FIX_HOME (isolates the .vc-fix/ state) and, where
// relevant, a synthetic transcript.jsonl the scanner reads deltas from. Run: `npm test`
// (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/hooks/session-telemetry.mjs");

// VC_FIX_HOME must be passed explicitly in `env` — without it resolveOutputRoot() falls back
// to process.cwd(), which on a dev machine may be a real checkout with its OWN real
// project-profile.json / .vc-fix/, silently redirecting writes there instead of `home`.
function run(home, sub, ev) {
  return execFileSync(process.execPath, [HOOK, sub], {
    input: JSON.stringify(ev),
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home },
  });
}

function setupHome({ selfDiagnostics = true } = {}) {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-telemetry-"));
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ projectType: "native-platform", selfDiagnostics }));
  return home;
}

function toolUse(ts, id, name, input) {
  return JSON.stringify({ timestamp: ts, message: { content: [{ type: "tool_use", id, name, input }] } });
}
function toolResult(ts, id, isError, text) {
  return JSON.stringify({ timestamp: ts, message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: [{ type: "text", text }] }] } });
}
function assistantText(ts, text) {
  return JSON.stringify({ timestamp: ts, message: { content: [{ type: "text", text }] } });
}
function appendLines(transcriptPath, lines) {
  appendFileSync(transcriptPath, lines.map((l) => l + "\n").join(""));
}

function readSpans(home, sid) {
  const p = join(home, ".vc-fix", "diagnostics", `${sid}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const spansOf = (records, kind, name) => records.filter((r) => r.type === "span" && r.kind === kind && r.name === name);

// ─── capture gate ──────────────────────────────────────────────────────────────
test("capture gate: selfDiagnostics !== true is a full no-op (no .vc-fix/ created)", () => {
  const home = setupHome({ selfDiagnostics: false });
  try {
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: "gate-off", transcript_path: transcriptPath });
    run(home, "prompt", { session_id: "gate-off", transcript_path: transcriptPath, prompt: "/qa-bug something" });
    run(home, "finalize", { session_id: "gate-off", transcript_path: transcriptPath, reason: "stop" });
    assert.ok(!existsSync(join(home, ".vc-fix")), ".vc-fix/ must never be created when selfDiagnostics is not === true");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("capture gate: absent project-profile.json is also a full no-op", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-telemetry-noprofile-"));
  try {
    run(home, "init", { session_id: "no-profile", transcript_path: join(home, "transcript.jsonl") });
    assert.ok(!existsSync(join(home, ".vc-fix")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── recovered: same tool+arg_hash fails then succeeds ──────────────────────────
test("classify: a retried invocation that eventually succeeds is `recovered`, not `failed`", () => {
  const home = setupHome();
  try {
    const sid = "recovered-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-bug reproduce this" });

    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Bash", { command: "npm test" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", true, "Error: ENOENT: no such file or directory"),
      toolUse("2026-01-01T00:00:02Z", "tu2", "Bash", { command: "npm test" }),
      toolResult("2026-01-01T00:00:03Z", "tu2", false, "All tests passed"),
      assistantText("2026-01-01T00:00:04Z", "Filed the bug report at reports/bugs/BUG-1.md"),
    ]);

    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const records = readSpans(home, sid);
    const cmd = spansOf(records, "command", "qa-bug");
    assert.equal(cmd.length, 1, "expected exactly one qa-bug command span");
    assert.equal(cmd[0].outcome, "recovered");
    assert.equal(cmd[0].status, "error", "status reflects the raw error signal even though outcome is recovered");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── failed: unrecovered blocking error, no expected output ─────────────────────
test("classify: an unrecovered permission_denied is `failed` and triggers the silent auto-diagnosis block", () => {
  const home = setupHome();
  try {
    const sid = "failed-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-1" });

    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Bash", { command: "gh pr create" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", true, "permission denied: token missing pull-request scope"),
    ]);

    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const records = readSpans(home, sid);
    const cmd = spansOf(records, "command", "qa-fix");
    assert.equal(cmd.length, 1);
    assert.equal(cmd[0].outcome, "failed");
    assert.equal(cmd[0].signals.permission_denied, 1);

    const decision = JSON.parse(out);
    assert.equal(decision.decision, "block", "a NEW failed signature must tail-trigger the silent vc-self-check run");
    assert.match(decision.reason, /vc-self-check/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── silent_suspect: clean close, no expected-output marker ─────────────────────
test("classify: a clean close with none of the skill's expected-output markers is `silent_suspect`", () => {
  const home = setupHome();
  try {
    const sid = "silent-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });

    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "export const env = {...}"),
    ]);

    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const records = readSpans(home, sid);
    const cmd = spansOf(records, "command", "qa-env-check");
    assert.equal(cmd.length, 1);
    assert.equal(cmd[0].outcome, "silent_suspect");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── dedup: the same signature must not re-trigger the block on a later finalize ──
test("tail-trigger dedup: the same flagged signature only blocks once per session", () => {
  const home = setupHome();
  try {
    const sid = "dedup-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-2" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Bash", { command: "gh pr create" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", true, "permission denied: token missing pull-request scope"),
    ]);
    const first = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(JSON.parse(first).decision, "block", "first finalize with a new signature should block");

    // A second Stop firing in the same turn (e.g. the harness fires Stop again with no
    // intervening UserPromptSubmit) — the flagged span from the first firing is still in
    // state.flagged (persisted), but its signature is now in seenSignatures, so it must not
    // re-nag. (A NEW prompt would open a fresh command span with its own signature — that's
    // a different scenario, not a dedup of this one.)
    const second = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(second.trim(), "", "a repeat finalize on an already-seen signature must emit nothing");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── /vc-feedback capture ────────────────────────────────────────────────────────
test("/vc-feedback: an explicit 👎 verdict is recorded as a feedback record, not a command span", () => {
  const home = setupHome();
  try {
    const sid = "feedback-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: '/vc-feedback "the fix broke pagination" 👎' });
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const records = readSpans(home, sid);
    const fb = records.filter((r) => r.type === "feedback");
    assert.equal(fb.length, 1);
    assert.equal(fb[0].verdict, "down");
    assert.match(fb[0].text, /broke pagination/);
    assert.equal(spansOf(records, "command", "vc-feedback").length, 0, "/vc-feedback must not open its own command span");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
