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
function run(home, sub, ev, extraEnv = {}) {
  return execFileSync(process.execPath, [HOOK, sub], {
    input: JSON.stringify(ev),
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home, ...extraEnv },
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

// ─── silent_suspect: clean close, real work, no expected-output marker ───────────
test("classify: a clean close with real work but none of the skill's expected-output markers is `silent_suspect`", () => {
  const home = setupHome();
  try {
    const sid = "silent-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-7" });

    // /qa-fix made 2 real edits but never opened a PR and never printed a BAIL marker —
    // the worst mode: closed clean, no error, no expected output. opCount (2) ≥ SILENT_MIN_OPS.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Edit", { file_path: "a.cs" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "edited"),
      toolUse("2026-01-01T00:00:02Z", "tu2", "Edit", { file_path: "b.cs" }),
      toolResult("2026-01-01T00:00:03Z", "tu2", false, "edited"),
    ]);

    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const records = readSpans(home, sid);
    const cmd = spansOf(records, "command", "qa-fix");
    assert.equal(cmd.length, 1);
    assert.equal(cmd[0].outcome, "silent_suspect");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── Fix B: a near-empty command turn is NOT silent_suspect (min-activity floor) ──
test("classify: a command that closes with < SILENT_MIN_OPS ops is NOT silent_suspect (deferred/trivial turn)", () => {
  const home = setupHome();
  try {
    const sid = "minops-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-8" });

    // Only one op then the agent yields (e.g. it asked the user a clarifying question) —
    // a trivial/deferred turn, not a "task done wrong". Must NOT flag as silent_suspect.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "ticket.md" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "some ticket text"),
    ]);

    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const records = readSpans(home, sid);
    const cmd = spansOf(records, "command", "qa-fix");
    assert.equal(cmd.length, 1);
    assert.notEqual(cmd[0].outcome, "silent_suspect", "a < SILENT_MIN_OPS turn must not be flagged silent");
    assert.equal(cmd[0].outcome, "success");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── Fix A: a read-only skill with many reads + its expected output is NOT degraded ──
test("classify: a read-only skill (many reads, no decisive op) that produced its expected output is `success`, not degraded", () => {
  const home = setupHome();
  try {
    const sid = "readonly-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });

    // 9 consecutive Read ops (would trip SEARCH_THRASH_RUN=8 under the old sawDecisive-only
    // guard) but the skill produced its readiness table (expected output) → progress → clean.
    const lines = [];
    for (let i = 0; i < 9; i++) {
      lines.push(toolUse(`2026-01-01T00:00:0${i}Z`, `tu${i}`, "Read", { file_path: `f${i}.env` }));
      lines.push(toolResult(`2026-01-01T00:00:0${i}Z`, `tu${i}`, false, "VAR=value"));
    }
    lines.push(assistantText("2026-01-01T00:00:10Z", "Readiness table: all checks PASS — READY."));
    appendLines(transcriptPath, lines);

    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const records = readSpans(home, sid);
    const cmd = spansOf(records, "command", "qa-env-check");
    assert.equal(cmd.length, 1);
    assert.equal(cmd[0].outcome, "success", "expected output = progress; must not be search_thrash/low_yield degraded");
    assert.deepEqual(cmd[0].struggle, [], "no struggle sub-signal should fire");
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

// ─── decision moment (Task 2.1): every finalize records a decision verdict ──────────
const finalizeOf = (records) => records.find((r) => r.type === "finalize");

test("decision record: a clean plugin turn is recorded clean + not surfaced (no visible line)", () => {
  const home = setupHome();
  try {
    const sid = "decision-clean";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "export const env = {...}"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all checks PASS — READY."),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    // Clean path never resumes the agent → empty stdout (no decision:block).
    assert.equal(out.trim(), "", "a clean turn must not block/resume the agent");

    const fin = finalizeOf(readSpans(home, sid));
    assert.ok(fin && fin.decision, "finalize must carry a decision object");
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.pluginActivity, true, "a /qa-env-check command ran");
    assert.equal(fin.decision.surfaced, false, "clean = silent-but-recorded");
    assert.equal(fin.decision.suppressReason, "clean");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("decision record: a finding is recorded flagged + surfaced (visible line via block)", () => {
  const home = setupHome();
  try {
    const sid = "decision-flagged";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-3" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Bash", { command: "gh pr create" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", true, "permission denied: token missing pull-request scope"),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    assert.equal(JSON.parse(out).decision, "block", "a fresh finding surfaces via decision:block");

    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "flagged");
    assert.equal(fin.decision.freshCount, 1);
    assert.equal(fin.decision.surfaced, true);
    assert.equal(fin.decision.suppressReason, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── VC_FIX_DIAG_LINE=always — opt-in visible line on a clean plugin turn ───────────
const ALWAYS = { VC_FIX_DIAG_LINE: "always" };

test("VC_FIX_DIAG_LINE=always: a clean plugin turn resumes the agent to print the no-issues line", () => {
  const home = setupHome();
  try {
    const sid = "line-always-clean";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath }, ALWAYS);
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" }, ALWAYS);
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, ALWAYS);

    const dec = JSON.parse(out);
    assert.equal(dec.decision, "block", "always mode resumes the agent on a clean plugin turn");
    assert.match(dec.reason, /no issues detected/i);
    assert.doesNotMatch(dec.reason, /vc-self-check|run the/i, "the clean line must not trigger a skill");

    const fin = readSpans(home, sid).find((r) => r.type === "finalize");
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.surfaced, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("VC_FIX_DIAG_LINE=always: a plain dev turn (no plugin activity) is NOT resumed", () => {
  const home = setupHome();
  try {
    const sid = "line-always-noact";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath }, ALWAYS);
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "refactor this" }, ALWAYS);
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "u.ts" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "code"),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, ALWAYS);
    assert.equal(out.trim(), "", "no plugin activity → no line even in always mode");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("VC_FIX_DIAG_LINE=always: the clean line blocks at most once per turn (no resume loop)", () => {
  const home = setupHome();
  try {
    const sid = "line-always-loop";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath }, ALWAYS);
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" }, ALWAYS);
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    const first = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, ALWAYS);
    assert.equal(JSON.parse(first).decision, "block");
    // The resumed print-turn's own Stop fires finalize again with NO new UserPromptSubmit —
    // promptedThisTurn is still set, so it must NOT re-block (else an infinite resume loop).
    const second = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, ALWAYS);
    assert.equal(second.trim(), "", "a repeat finalize in the same turn must not re-block");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("decision record: a plain dev turn (no plugin skill/command) is recorded no-plugin-activity", () => {
  const home = setupHome();
  try {
    const sid = "decision-noact";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "please refactor this function" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "util.ts" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "export function x() {}"),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    assert.equal(out.trim(), "", "a no-plugin turn must not block");
    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.pluginActivity, false, "no plugin skill/command ran");
    assert.equal(fin.decision.suppressReason, "no-plugin-activity");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
