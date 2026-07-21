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

// ─── namespaced slash command: /vc-fix:qa-env-check must open a command span ─────────
test("command span: a namespaced slash command (/vc-fix:qa-env-check) is recognized as plugin activity", () => {
  const home = setupHome();
  try {
    const sid = "ns-cmd";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    // The installed-plugin invocation form — namespace prefix `vc-fix:` before the command.
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/vc-fix:qa-env-check" });
    // The skill then runs via Bash (as it does live) — no Skill tool_use, only Bash ops.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "b1", "Bash", { command: "node verify-access.mjs" }),
      toolResult("2026-01-01T00:00:01Z", "b1", false, "Readiness: all PASS — READY"),
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const records = readSpans(home, sid);
    const cmd = spansOf(records, "command", "qa-env-check");
    assert.equal(cmd.length, 1, "the namespaced /vc-fix:qa-env-check must open a qa-env-check command span");
    const fin = records.find((r) => r.type === "finalize");
    assert.equal(fin.decision.pluginActivity, true, "a namespaced plugin command IS plugin activity");
    assert.equal(fin.decision.verdict, "clean");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("command span: the <command-name> wrapper form is also recognized", () => {
  const home = setupHome();
  try {
    const sid = "ns-wrap";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "<command-name>/vc-fix:qa-fix</command-name> <command-args>VCST-9</command-args>" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "b1", "Bash", { command: "git status" }),
      toolResult("2026-01-01T00:00:01Z", "b1", false, "clean"),
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(spansOf(readSpans(home, sid), "command", "qa-fix").length, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("/vc-feedback: the namespaced form (/vc-fix:vc-feedback) is captured too", () => {
  const home = setupHome();
  try {
    const sid = "ns-fb";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: '/vc-fix:vc-feedback "wrong repo routed" 👎' });
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    const fb = readSpans(home, sid).filter((r) => r.type === "feedback");
    assert.equal(fb.length, 1);
    assert.equal(fb[0].verdict, "down");
    assert.match(fb[0].text, /wrong repo routed/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── decision moment: every finalize records a decision verdict ──────────────────
const finalizeOf = (records) => records.find((r) => r.type === "finalize");
const finalizesOf = (records) => records.filter((r) => r.type === "finalize");
const LINE_OFF = { VC_FIX_DIAG_LINE: "off" };

test("decision record: a clean plugin turn is recorded clean (line silenced with VC_FIX_DIAG_LINE=off)", () => {
  const home = setupHome();
  try {
    const sid = "decision-clean";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath }, LINE_OFF);
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" }, LINE_OFF);
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "export const env = {...}"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all checks PASS — READY."),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, LINE_OFF);

    // With the line silenced the clean path never resumes the agent → empty stdout.
    assert.equal(out.trim(), "", "VC_FIX_DIAG_LINE=off → a clean turn must not block/resume the agent");

    const fin = finalizeOf(readSpans(home, sid));
    assert.ok(fin && fin.decision, "finalize must carry a decision object");
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.pluginActivity, true, "a /qa-env-check command ran");
    assert.equal(fin.decision.surfaced, false, "line off = silent-but-recorded");
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

// ─── visible clean line — ON by default on a TERMINAL plugin turn ───────────────────
test("clean line (default ON): a clean plugin terminal turn resumes the agent to print the no-issues line", () => {
  const home = setupHome();
  try {
    const sid = "line-default-clean";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const dec = JSON.parse(out);
    assert.equal(dec.decision, "block", "default: a clean plugin turn resumes to print the line");
    assert.match(dec.reason, /no plugin issues detected/i);
    assert.doesNotMatch(dec.reason, /vc-self-check|run the/i, "the clean line must not trigger a skill");

    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.surfaced, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("clean line: a plain dev turn (no plugin activity) is NOT resumed", () => {
  const home = setupHome();
  try {
    const sid = "line-default-noact";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "refactor this" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "u.ts" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "code"),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(out.trim(), "", "no plugin activity → no line");
    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.pluginActivity, false);
    assert.equal(fin.decision.suppressReason, "no-plugin-activity");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("clean line: blocks at most once per turn (no resume loop)", () => {
  const home = setupHome();
  try {
    const sid = "line-default-loop";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    const first = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(JSON.parse(first).decision, "block");
    // The resumed print-turn's own Stop fires finalize again with NO new UserPromptSubmit —
    // promptedThisTurn is still set, so it must NOT re-block (else an infinite resume loop).
    const second = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(second.trim(), "", "a repeat finalize in the same turn must not re-block");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("VC_FIX_DIAG_LINE=off: a clean plugin terminal turn prints nothing (but is still recorded)", () => {
  const home = setupHome();
  try {
    const sid = "line-off-clean";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath }, LINE_OFF);
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" }, LINE_OFF);
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, LINE_OFF);
    assert.equal(out.trim(), "", "VC_FIX_DIAG_LINE=off silences the clean line");
    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.pluginActivity, true);
    assert.equal(fin.decision.surfaced, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── stop_hook_active guard — a Stop from OUR OWN resume-turn must not re-fire ───────
test("stop_hook_active:true suppresses the clean line block", () => {
  const home = setupHome();
  try {
    const sid = "sha-clean";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop", stop_hook_active: true });
    assert.equal(out.trim(), "", "stop_hook_active must suppress the clean line block");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("stop_hook_active:true suppresses the findings block", () => {
  const home = setupHome();
  try {
    const sid = "sha-findings";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-12" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "tu1", "Bash", { command: "gh pr create" }),
      toolResult("2026-01-01T00:00:01Z", "tu1", true, "permission denied: token missing pull-request scope"),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop", stop_hook_active: true });
    assert.equal(out.trim(), "", "stop_hook_active must suppress even the findings block");
    // still recorded flagged, just not surfaced
    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "flagged");
    assert.equal(fin.decision.surfaced, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── checkpoint vs terminal — a Stop while a background sub-agent is still running ──
test("checkpoint (background_tasks): a Stop with a pending bg task records `deferred` and closes nothing", () => {
  const home = setupHome();
  try {
    const sid = "cp-bg";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-13" });
    // A Task handed off to a sub-agent — NO tool_result yet (it's still running).
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "ta1", "Task", { subagent_type: "fullstack-backend", description: "fix bug" }),
    ]);
    const out = run(home, "finalize", {
      session_id: sid, transcript_path: transcriptPath, reason: "stop",
      background_tasks: [{ agent_id: "ta1", agent_type: "fullstack-backend" }],
    });
    assert.equal(out.trim(), "", "a checkpoint Stop must not print anything");

    const recs = readSpans(home, sid);
    const fin = finalizeOf(recs);
    assert.equal(fin.decision.verdict, "deferred");
    assert.equal(fin.decision.suppressReason, "subagent-running");
    assert.equal(fin.decision.surfaced, false);
    assert.ok(fin.decision.pendingSubagents >= 1, "pendingSubagents must be counted");
    assert.equal(spansOf(recs, "command", "qa-fix").length, 0, "the command span must NOT be closed at a checkpoint");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("checkpoint (fallback): an open agent op with no background_tasks field still defers", () => {
  const home = setupHome();
  try {
    const sid = "cp-fallback";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-14" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "ta1", "Task", { subagent_type: "fullstack-frontend", description: "fix" }),
    ]);
    // No background_tasks on the event → must fall back to the open agent op.
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(out.trim(), "", "the open-agent-op fallback must also defer silently");
    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "deferred");
    assert.equal(fin.decision.pendingSubagents, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("E2E: /qa-fix hands off to a background sub-agent (checkpoint), then terminates clean when it returns", () => {
  const home = setupHome();
  try {
    const sid = "e2e-subagent";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-15" });

    // 1) The command hands work to a sub-agent (Task) — no result yet.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "ta1", "Task", { subagent_type: "fullstack-backend", description: "reproduce + fix" }),
    ]);
    // 2) CHECKPOINT Stop — the sub-agent is still running in the background.
    const cp = run(home, "finalize", {
      session_id: sid, transcript_path: transcriptPath, reason: "stop",
      background_tasks: [{ agent_id: "ta1", agent_type: "fullstack-backend" }],
    });
    assert.equal(cp.trim(), "", "the checkpoint must print no line mid-task");
    let recs = readSpans(home, sid);
    assert.equal(spansOf(recs, "command", "qa-fix").length, 0, "command still open at the checkpoint");
    assert.equal(finalizesOf(recs)[0].decision.verdict, "deferred");

    // 3) The sub-agent returns — its Task result lands in the MAIN transcript.
    appendLines(transcriptPath, [
      toolResult("2026-01-01T00:00:05Z", "ta1", false, "Done — opened PR pull/42 with the fix and repro test."),
    ]);
    run(home, "agentstop", { session_id: sid, transcript_path: transcriptPath });

    // 4) TERMINAL Stop — nothing pending now.
    const term = run(home, "finalize", {
      session_id: sid, transcript_path: transcriptPath, reason: "stop", background_tasks: [],
    });
    const dec = JSON.parse(term);
    assert.equal(dec.decision, "block", "the terminal Stop surfaces the clean line once");
    assert.match(dec.reason, /no plugin issues detected/i);

    recs = readSpans(home, sid);
    const cmd = spansOf(recs, "command", "qa-fix");
    assert.equal(cmd.length, 1, "the command span is emitted exactly once, at the terminal Stop");
    assert.notEqual(cmd[0].outcome, "silent_suspect", "the Task result carried expected output → not silent");
    const fins = finalizesOf(recs);
    assert.equal(fins[fins.length - 1].decision.verdict, "clean");
    assert.equal(fins[fins.length - 1].decision.surfaced, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
