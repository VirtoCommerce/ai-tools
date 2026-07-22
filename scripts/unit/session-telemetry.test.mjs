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
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync, utimesSync } from "node:fs";
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
// A top-level STRING content record — a system/hook echo (e.g. the `tsc` PostToolUse output).
// This is the UNTIED hook_failure path: no tool_use_id, so classify()'s recovery check can't see
// it resolve. Matches HOOK_FAILURE_RE.
function hookEcho(ts, text) {
  return JSON.stringify({ timestamp: ts, message: { content: text } });
}
function appendLines(transcriptPath, lines) {
  appendFileSync(transcriptPath, lines.map((l) => l + "\n").join(""));
}
// The explicit terminal-step completion signal a skill emits as its LAST action. Bash-invoked
// (no hook stdin), so it resolves the session from the newest .state.json in `home` (one per home
// here) unless `--session` is given. This is what arms the clean line for the NEXT terminal Stop.
function complete(home, skill, extraEnv = {}) {
  return execFileSync(process.execPath, [HOOK, "complete", "--skill", skill], {
    input: "",
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home, ...extraEnv },
  });
}

function readSpans(home, sid) {
  const p = join(home, ".vc-fix", "diagnostics", `${sid}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const spansOf = (records, kind, name) => records.filter((r) => r.type === "span" && r.kind === kind && r.name === name);

// ─── capture gate (OPT-IN) ───────────────────────────────────────────────────────
test("capture gate: selfDiagnostics:false is an explicit opt-out (no .vc-fix/ created)", () => {
  const home = setupHome({ selfDiagnostics: false });
  try {
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: "gate-off", transcript_path: transcriptPath });
    run(home, "prompt", { session_id: "gate-off", transcript_path: transcriptPath, prompt: "/qa-bug something" });
    run(home, "finalize", { session_id: "gate-off", transcript_path: transcriptPath, reason: "stop" });
    assert.ok(!existsSync(join(home, ".vc-fix")), ".vc-fix/ must never be created when selfDiagnostics is explicitly false");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("capture gate: OPT-IN — an absent project-profile.json is a full no-op (no .vc-fix/)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-telemetry-noprofile-"));
  try {
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    // No project-profile.json — exactly the state DURING /project-init BEFORE its §0b consent
    // step writes the flag. Opt-in ⇒ capture is OFF until selfDiagnostics:true is written, so
    // the hook must be a full no-op here and create nothing.
    run(home, "init", { session_id: "no-profile", transcript_path: transcriptPath });
    run(home, "prompt", { session_id: "no-profile", transcript_path: transcriptPath, prompt: "/project-init" });
    run(home, "finalize", { session_id: "no-profile", transcript_path: transcriptPath, reason: "stop" });
    assert.ok(!existsSync(join(home, ".vc-fix")), "absent profile ⇒ capture OFF (opt-in) — no .vc-fix/ created");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("capture gate: OPT-IN — a profile WITHOUT a selfDiagnostics field is a full no-op", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-telemetry-noflag-"));
  try {
    // A profile exists but never opted in (no selfDiagnostics field). Any non-`true` value —
    // including absent — must read as OFF.
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ projectType: "native-platform" }));
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: "no-flag", transcript_path: transcriptPath });
    run(home, "prompt", { session_id: "no-flag", transcript_path: transcriptPath, prompt: "/qa-bug something" });
    run(home, "finalize", { session_id: "no-flag", transcript_path: transcriptPath, reason: "stop" });
    assert.ok(!existsSync(join(home, ".vc-fix")), "absent selfDiagnostics field ⇒ capture OFF (opt-in)");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("capture gate: OPT-IN — selfDiagnostics:true captures (the flag /project-init §0b writes on Yes)", () => {
  const home = setupHome(); // selfDiagnostics: true — the state after §0b consent = Yes
  try {
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: "opt-in", transcript_path: transcriptPath });
    run(home, "prompt", { session_id: "opt-in", transcript_path: transcriptPath, prompt: "/project-init" });
    run(home, "finalize", { session_id: "opt-in", transcript_path: transcriptPath, reason: "stop" });
    assert.ok(existsSync(join(home, ".vc-fix")), "selfDiagnostics:true ⇒ capture ON");
    const recs = readSpans(home, "opt-in");
    assert.ok(recs.some((r) => r.type === "session_start"), "session_start is recorded once the flag is set");
    assert.equal(spansOf(recs, "command", "project-init").length, 1, "the /project-init command span is captured");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("capture gate: VC_FIX_DIAG_CAPTURE=off forces a full no-op even with selfDiagnostics true", () => {
  const home = setupHome(); // selfDiagnostics: true
  try {
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: "kill-switch", transcript_path: transcriptPath }, { VC_FIX_DIAG_CAPTURE: "off" });
    assert.ok(!existsSync(join(home, ".vc-fix")), "the env kill-switch disables capture entirely");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── opt-in mid-run: /project-init's OWN run surfaces its clean line via `complete` ──
// Reproduces the LEO deployment (2026-07-22): capture starts OFF (no profile), /project-init's
// §0b consent step writes selfDiagnostics:true MID-session, so the `/project-init` prompt (fired
// before the flag) opened NO command span. pluginActivity must still be true — the explicit
// `complete --skill project-init` signal proves the plugin ran — so the clean line surfaces.
test("opt-in mid-run: a `complete` signal surfaces the clean line even with no command span", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-telemetry-midrun-"));
  try {
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    // 1) capture OFF at session start — no profile yet (init/prompt are full no-ops).
    run(home, "init", { session_id: "midrun", transcript_path: transcriptPath });
    run(home, "prompt", { session_id: "midrun", transcript_path: transcriptPath, prompt: "/project-init" });
    assert.ok(!existsSync(join(home, ".vc-fix")), "capture is off until the flag is written");
    // 2) §0b writes the flag mid-run → capture turns ON.
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ projectType: "client", selfDiagnostics: true }));
    // 3) the rest of the run: only tool ops (no Skill, no command span — the /project-init prompt
    //    was missed while capture was off). A `record` firing creates the state + captures them.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "b1", "Bash", { command: "node gen-profile.mjs --self-diagnostics true" }),
      toolResult("2026-01-01T00:00:01Z", "b1", false, "[gen-profile] wrote project-profile.json"),
      toolUse("2026-01-01T00:00:02Z", "b2", "Bash", { command: "node verify-access.mjs" }),
      toolResult("2026-01-01T00:00:03Z", "b2", false, "Readiness: all PASS — READY"),
    ]);
    run(home, "record", { session_id: "midrun", transcript_path: transcriptPath });
    assert.ok(existsSync(join(home, ".vc-fix")), "capture is on once the flag exists");
    // 4) terminal step: /project-init signals completion, then the turn ends.
    complete(home, "project-init");
    const out = run(home, "finalize", { session_id: "midrun", transcript_path: transcriptPath, reason: "stop" });

    const dec = JSON.parse(out);
    assert.equal(dec.decision, "block", "the clean line must surface for /project-init's own run");
    assert.match(dec.reason, /no plugin issues detected/i);

    const fin = finalizeOf(readSpans(home, "midrun"));
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.pluginActivity, true, "the `complete` signal establishes pluginActivity despite no command span");
    assert.equal(fin.decision.completeSignalled, true);
    assert.equal(fin.decision.surfaced, true);
    // No command span exists (the /project-init prompt predated the flag) — the tool spans are still captured.
    assert.equal(spansOf(readSpans(home, "midrun"), "command", "project-init").length, 0, "no command span for the missed prompt");
    assert.ok(spansOf(readSpans(home, "midrun"), "tool", "Bash").length >= 1, "tool spans are captured from the flag write onward");
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

// ─── untied hook_failure co-occurring with a recovered op must NOT be `recovered` ──
test("classify: an untied hook_failure alongside a self-corrected op-keyed error is `failed`, not `recovered`", () => {
  const home = setupHome();
  try {
    const sid = "untied-hookfail";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-50" });
    appendLines(transcriptPath, [
      // A Read that fails then succeeds on the SAME target (same arg_hash) → op-keyed error that
      // self-corrects → allErrorsRecovered() would say "recovered".
      toolUse("2026-01-01T00:00:00Z", "r1", "Read", { file_path: "a.ts" }),
      toolResult("2026-01-01T00:00:01Z", "r1", true, "transient read error"),
      toolUse("2026-01-01T00:00:02Z", "r2", "Read", { file_path: "a.ts" }),
      toolResult("2026-01-01T00:00:03Z", "r2", false, "file contents"),
      // …but an UNTIED tsc hook_failure (no tool_use_id) never resolved → must force `failed`.
      hookEcho("2026-01-01T00:00:04Z", "error TS2322: Type 'string' is not assignable to type 'number'"),
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const cmd = spansOf(readSpans(home, sid), "command", "qa-fix");
    assert.equal(cmd.length, 1);
    assert.ok(cmd[0].signals.hook_failure >= 1, "the untied hook_failure was recorded");
    assert.equal(cmd[0].outcome, "failed", "an untied, never-resolved hook_failure must veto `recovered` even when another op self-corrected");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("classify (control): the SAME self-corrected op WITHOUT the untied hook_failure is `recovered`", () => {
  // Isolates the veto: drop only the hookEcho line from the test above. The Read fail→ok pair alone
  // must classify `recovered` — proving the `failed` verdict there comes from sawUntiedFailure, not
  // from the retry failing to register as recovered.
  const home = setupHome();
  try {
    const sid = "untied-control";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-51" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "r1", "Read", { file_path: "a.ts" }),
      toolResult("2026-01-01T00:00:01Z", "r1", true, "transient read error"),
      toolUse("2026-01-01T00:00:02Z", "r2", "Read", { file_path: "a.ts" }),
      toolResult("2026-01-01T00:00:03Z", "r2", false, "file contents"),
      // NO hookEcho — the only difference from the veto test.
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    const cmd = spansOf(readSpans(home, sid), "command", "qa-fix");
    assert.equal(cmd.length, 1);
    assert.equal(cmd[0].outcome, "recovered", "the self-corrected Read pair alone is `recovered` (no untied failure to veto it)");
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

// ─── secret redaction — the hook's hard invariant (public-repo delivery) ────────────
test("redaction: secrets in a tool_result never reach a span's details[].snippet or the block reason", () => {
  const home = setupHome();
  try {
    const sid = "redact-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-42" });
    // Realistic failing tool_result bodies that echo credentials — a 401 echoing the sent
    // Authorization header, a curl dumping a JSON body + a card number. These flow into the
    // span's details[].snippet, which is persisted to <sid>.jsonl and (via deliver) a PUBLIC repo.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "b1", "Bash", { command: "gh pr create" }),
      toolResult("2026-01-01T00:00:01Z", "b1", true, "HTTP 401: sent Authorization: Bearer opaqueLEAKtokenAAAA1234567890"),
      toolUse("2026-01-01T00:00:02Z", "b2", "Bash", { command: "curl api" }),
      // a JSON password, a STANDALONE gh token (not inside the Authorization header, so the
      // gh-token rule — not the auth rule — must catch it), and a card number.
      toolResult("2026-01-01T00:00:03Z", "b2", true, 'body {"password":"LEAKPASSs3cret"} tok ghp_LEAKTOKENabcdef1234567890 card 4111 1111 1111 1111'),
      // ADO Basic auth (base64(":"+PAT)) — the exact header probe-lib emits; the OLD rule left this
      // blob behind. Plus a DB connection-string password, an Azure AccountKey, and a JWT.
      toolUse("2026-01-01T00:00:04Z", "b3", "Bash", { command: "ado call" }),
      toolResult("2026-01-01T00:00:05Z", "b3", true, "HTTP 401 Authorization: Basic dXNlcjpMRUFLYmFzaWNQQVQ="),
      toolUse("2026-01-01T00:00:06Z", "b4", "Bash", { command: "psql" }),
      toolResult("2026-01-01T00:00:07Z", "b4", true, "url postgres://svc:LEAKdbpw@h/x key AccountKey=LEAKacct== jwt eyJLEAKhdrABCDEFGHIJKLMNOP.z"),
      // JSON-QUOTED Authorization header (axios/requests/curl error dumps) — the old rule stopped
      // `\S+` at `"Bearer` and LEAKED the token (PR #143 review, Lenajava1). The value now carries an
      // optional opening quote so the credential is consumed.
      toolUse("2026-01-01T00:00:08Z", "b5", "Bash", { command: "node call" }),
      toolResult("2026-01-01T00:00:09Z", "b5", true, 'error {"headers":{"Authorization":"Bearer LEAKjsonquotedTOKEN9876543210"}}'),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const recs = readSpans(home, sid);
    const snippets = recs.filter((r) => r.type === "span").flatMap((r) => (r.details || []).map((d) => d.snippet || ""));
    const haystack = snippets.join("  ") + "  " + out; // details + the surfaced block reason
    for (const secret of [
      "opaqueLEAKtokenAAAA1234567890", "ghp_LEAKTOKENabcdef1234567890", "LEAKPASSs3cret", "4111 1111 1111 1111",
      "dXNlcjpMRUFLYmFzaWNQQVQ=",                              // Basic-auth base64 blob (ADO PAT)
      "LEAKdbpw", "LEAKacct==", "eyJLEAKhdrABCDEFGHIJKLMNOP",  // conn-string pw, Azure AccountKey, JWT
      "LEAKjsonquotedTOKEN9876543210",                        // JSON-quoted "Authorization":"Bearer …"
    ]) {
      assert.ok(!haystack.includes(secret), `secret must be redacted from spans + block reason, but leaked: ${secret}`);
    }
    // Prove redaction actually ran (not merely truncated away): the markers are present.
    const joined = snippets.join(" ");
    assert.ok(/«redacted»/.test(joined), "authorization/password value replaced with the redaction marker");
    assert.ok(/«gh-token»/.test(joined), "the GitHub token shape was redacted");
    assert.ok(/«pan»/.test(joined), "the card number was redacted");
    assert.ok(/«jwt»/.test(joined), "the JWT was redacted");
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
    // Not just silent — silent for the RIGHT reason: the flagged span is still tracked
    // (flaggedTotal ≥ 1), nothing FRESH remained (freshCount 0), and it was withheld because we
    // already surfaced this turn — not because the span was dropped or re-classified clean.
    const last = finalizesOf(readSpans(home, sid)).pop();
    assert.equal(last.decision.surfaced, false);
    assert.equal(last.decision.freshCount, 0, "the signature was already seen → no fresh finding");
    assert.ok(last.decision.flaggedTotal >= 1, "the flagged span is still tracked, not dropped");
    assert.equal(last.decision.suppressReason, "already-surfaced");
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
    complete(home, "qa-env-check", LINE_OFF); // /qa-env-check finished its terminal step
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, LINE_OFF);

    // With the line silenced the clean path never resumes the agent → empty stdout.
    assert.equal(out.trim(), "", "VC_FIX_DIAG_LINE=off → a clean turn must not block/resume the agent");

    const fin = finalizeOf(readSpans(home, sid));
    assert.ok(fin && fin.decision, "finalize must carry a decision object");
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.pluginActivity, true, "a /qa-env-check command ran");
    assert.equal(fin.decision.completeSignalled, true, "the terminal-step signal was recorded");
    assert.equal(fin.decision.surfaced, false, "line off = silent-but-recorded");
    assert.equal(fin.decision.suppressReason, "line-off");
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
    complete(home, "qa-env-check"); // terminal step reached → arm the clean line
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const dec = JSON.parse(out);
    assert.equal(dec.decision, "block", "default: a completed clean plugin turn resumes to print the line");
    assert.match(dec.reason, /no plugin issues detected/i);
    assert.doesNotMatch(dec.reason, /vc-self-check|run the/i, "the clean line must not trigger a skill");

    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.completeSignalled, true);
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
    complete(home, "qa-env-check");
    const first = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(JSON.parse(first).decision, "block");
    // The resumed print-turn's own Stop fires finalize again with NO new UserPromptSubmit —
    // promptedThisTurn is still set AND the completion marker was consumed, so it must NOT
    // re-block (else an infinite resume loop).
    const second = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(second.trim(), "", "a repeat finalize in the same turn must not re-block");
    // The resume-turn's own Stop (marker consumed, promptedThisTurn set) must be audited as
    // already-surfaced — NOT misreported as awaiting-completion (the marker is null because we
    // consumed it, not because the run is still mid-flight).
    const last = finalizesOf(readSpans(home, sid)).pop();
    assert.equal(last.decision.suppressReason, "already-surfaced");
    assert.notEqual(last.decision.suppressReason, "awaiting-completion");
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
    complete(home, "qa-env-check", LINE_OFF);
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

// ─── completion-gated clean line — the PR-143 core behavior ─────────────────────────
// A multi-turn skill (/project-init: interview pause, "fill the files then done" pause) must
// print the clean line EXACTLY ONCE — after its terminal step — and ZERO times on the pauses.
test("clean line (completion-gated): a multi-turn skill is silent on pauses, fires once after `complete`", () => {
  const home = setupHome();
  try {
    const sid = "multiturn-init";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/project-init" });

    // ── Pause 1 (interview): a trivial turn, then the agent yields for the operator's answer.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "r1", "Read", { file_path: "project-profile.json" }),
      toolResult("2026-01-01T00:00:01Z", "r1", false, "no profile yet"),
    ]);
    const pause1 = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(pause1.trim(), "", "no clean line on the interview pause — `complete` was not signalled");
    let fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.pluginActivity, true, "the /project-init command ran");
    assert.equal(fin.decision.completeSignalled, false);
    assert.equal(fin.decision.suppressReason, "awaiting-completion", "clean, active, but no terminal signal yet");

    // ── Pause 2 (the operator answered; not a slash command): another yield, still no `complete`.
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "yes, use the qa env" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:02Z", "r2", "Read", { file_path: ".env.qa" }),
      toolResult("2026-01-01T00:00:03Z", "r2", false, "FRONT_URL=..."),
    ]);
    const pause2 = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(pause2.trim(), "", "still no clean line on the second pause");
    assert.equal(finalizesOf(readSpans(home, sid)).pop().decision.suppressReason, "awaiting-completion");

    // ── Terminal step (Step 9 — Done): the skill signals completion, then the turn ends.
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "looks good, finish" });
    complete(home, "project-init");
    const term = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    const dec = JSON.parse(term);
    assert.equal(dec.decision, "block", "the clean line fires exactly once — after the terminal step");
    assert.match(dec.reason, /no plugin issues detected/i);
    fin = finalizesOf(readSpans(home, sid)).pop();
    assert.equal(fin.decision.completeSignalled, true);
    assert.equal(fin.decision.completedSkill, "project-init");
    assert.equal(fin.decision.surfaced, true);

    // ── The resumed print-turn's own Stop must NOT re-fire (marker consumed + promptedThisTurn).
    const after = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(after.trim(), "", "the clean line never repeats — the completion marker was consumed");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("clean line (completion-gated): the marker is consumed → a later clean turn does NOT re-fire without a new signal", () => {
  const home = setupHome();
  try {
    const sid = "consume-once";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "r1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "r1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    complete(home, "qa-env-check");
    assert.equal(JSON.parse(run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" })).decision, "block", "fires once");

    // A brand-new user turn (NOT a command, no new `complete`) that is otherwise clean must stay silent.
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "thanks" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:03Z", "r2", "Read", { file_path: "notes.md" }),
      toolResult("2026-01-01T00:00:04Z", "r2", false, "notes"),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(out.trim(), "", "no new completion signal → no second clean line (marker was consumed)");
    assert.equal(finalizesOf(readSpans(home, sid)).pop().decision.suppressReason, "awaiting-completion");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── opt-in legacy fallback — VC_FIX_DIAG_LINE_FALLBACK=on ───────────────────────────
const FALLBACK_ON = { VC_FIX_DIAG_LINE_FALLBACK: "on" };
test("fallback (opt-in): an un-migrated skill (no `complete`) fires the clean line at most once per SESSION", () => {
  const home = setupHome();
  try {
    const sid = "fallback-once";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath }, FALLBACK_ON);
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" }, FALLBACK_ON);
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "r1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "r1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    // No `complete` — but the fallback surfaces the line once anyway.
    const first = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, FALLBACK_ON);
    const dec = JSON.parse(first);
    assert.equal(dec.decision, "block", "fallback ON → an un-migrated clean turn still surfaces the line once");
    assert.match(dec.reason, /no plugin issues detected/i);

    // A second clean turn in the same session must NOT re-fire (cleanLineOffered, once-per-session).
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "again" }, FALLBACK_ON);
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:03Z", "r2", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:04Z", "r2", false, "env ok"),
    ]);
    const second = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, FALLBACK_ON);
    assert.equal(second.trim(), "", "the fallback clean line is once-per-session, never per-turn");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("fallback OFF (default): an un-migrated clean turn stays silent (awaiting-completion), never per-turn", () => {
  const home = setupHome();
  try {
    const sid = "fallback-off";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "r1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "r1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(out.trim(), "", "default (fallback off): no `complete` → no clean line");
    assert.equal(finalizeOf(readSpans(home, sid)).decision.suppressReason, "awaiting-completion");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── the `complete` subcommand itself ────────────────────────────────────────────────
test("complete: no-op when capture is disabled (never creates state, never throws)", () => {
  const home = setupHome({ selfDiagnostics: false });
  try {
    // Even with a pre-existing state file, a disabled capture must not touch it.
    const dir = join(home, ".vc-fix", "diagnostics");
    mkdirSync(dir, { recursive: true });
    const statePath = join(dir, "some-session.state.json");
    writeFileSync(statePath, JSON.stringify({ sid: "some-session" }));
    const out = complete(home, "qa-fix");
    assert.equal(out.trim(), "", "complete prints nothing");
    const st = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(st.skillCompletePending, undefined, "capture disabled → the marker is never written");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("complete: targets the newest session state file and writes the { skill, ts } marker", () => {
  const home = setupHome();
  try {
    const dir = join(home, ".vc-fix", "diagnostics");
    mkdirSync(dir, { recursive: true });
    // An older, inactive session's state and the current one — complete must pick the newest.
    const older = join(dir, "older.state.json");
    writeFileSync(older, JSON.stringify({ sid: "older" }));
    utimesSync(older, Date.now() / 1000 - 7200, Date.now() / 1000 - 7200); // 2h old
    const current = join(dir, "current.state.json");
    writeFileSync(current, JSON.stringify({ sid: "current" }));
    complete(home, "qa-fix");
    const cur = JSON.parse(readFileSync(current, "utf8"));
    assert.ok(cur.skillCompletePending, "the newest state file got the marker");
    assert.equal(cur.skillCompletePending.skill, "qa-fix");
    assert.match(cur.skillCompletePending.ts, /^\d{4}-\d\d-\d\dT/, "marker carries an ISO timestamp");
    const old = JSON.parse(readFileSync(older, "utf8"));
    assert.equal(old.skillCompletePending, undefined, "the older session was left untouched");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("complete: still writes the marker under VC_FIX_DIAG_CONSENT=off (consent gates surfacing, NOT capture)", () => {
  const home = setupHome();
  try {
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: "consent-off-complete", transcript_path: transcriptPath }, { VC_FIX_DIAG_CONSENT: "off" });
    complete(home, "project-init", { VC_FIX_DIAG_CONSENT: "off" });
    const st = JSON.parse(readFileSync(join(home, ".vc-fix", "diagnostics", "consent-off-complete.state.json"), "utf8"));
    assert.ok(st.skillCompletePending, "complete is gated on captureEnabled only — consent-off must NOT suppress the marker write");
    assert.equal(st.skillCompletePending.skill, "project-init");
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
    complete(home, "qa-env-check"); // armed — but the resume-turn's own Stop (stop_hook_active) must still suppress it
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop", stop_hook_active: true });
    assert.equal(out.trim(), "", "stop_hook_active must suppress the clean line block");
    assert.equal(finalizeOf(readSpans(home, sid)).decision.suppressReason, "stop-hook-active", "the suppression is audited as stop-hook-active, not awaiting-completion");
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
    // still recorded flagged, just not surfaced — and the suppression reason is accurate
    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "flagged");
    assert.equal(fin.decision.surfaced, false);
    assert.equal(fin.decision.suppressReason, "stop-hook-active", "suppression by our own resume-turn is logged as stop-hook-active, not already-surfaced");
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
    assert.equal(fin.decision.pendingSubagents, 1, "exactly one pending sub-agent");
    assert.equal(spansOf(recs, "command", "qa-fix").length, 0, "the command span must NOT be closed at a checkpoint");
    assert.equal(spansOf(recs, "agent", "fullstack-backend").length, 0, "the open agent op must NOT be drained/emitted at a checkpoint");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("checkpoint (background_tasks isolated): the field defers even with NO open agent op", () => {
  const home = setupHome();
  try {
    const sid = "cp-bg-isolated";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-17" });
    // A COMPLETED op (paired) so openOps is empty → the ONLY pending signal is the field.
    // This isolates the `background_tasks`-driven branch: if the detection fell back to
    // `openAgents` here it would (wrongly) drain instead of defer, failing this test.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "e1", "Edit", { file_path: "a.cs" }),
      toolResult("2026-01-01T00:00:01Z", "e1", false, "edited"),
    ]);
    const out = run(home, "finalize", {
      session_id: sid, transcript_path: transcriptPath, reason: "stop",
      background_tasks: [{ agent_id: "bg1", agent_type: "fullstack-backend" }],
    });
    assert.equal(out.trim(), "", "a field-driven checkpoint must not print");
    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.decision.verdict, "deferred", "background_tasks alone (no open agent op) must defer");
    assert.equal(fin.decision.pendingSubagents, 1);
    assert.equal(spansOf(readSpans(home, sid), "command", "qa-fix").length, 0, "command not closed at checkpoint");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("terminal drain: an orphaned agent op + empty background_tasks must DRAIN, not defer forever", () => {
  const home = setupHome();
  try {
    const sid = "orphan-drain";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath }, LINE_OFF);
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-16" }, LINE_OFF);
    // A sub-agent Task that NEVER returns (orphaned — interrupted/crashed, or its result
    // landed in a skipped sidechain). openAgents === 1, but the platform reports NO pending
    // background task (field present, empty) → this is a TERMINAL Stop and must drain.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "ta1", "Task", { subagent_type: "fullstack-backend", description: "fix" }),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop", background_tasks: [] }, LINE_OFF);
    assert.equal(out.trim(), "", "line off → no stdout");

    const recs = readSpans(home, sid);
    const fins = finalizesOf(recs);
    assert.equal(fins.length, 1, "exactly one finalize (terminal), not an endless defer");
    assert.notEqual(fins[0].decision.verdict, "deferred", "empty background_tasks on a terminal Stop must DRAIN, not defer");
    assert.equal(spansOf(recs, "command", "qa-fix").length, 1, "the trailing command span is closed at the terminal Stop");
    assert.equal(spansOf(recs, "agent", "fullstack-backend").length, 1, "the orphaned agent op is drained (emitted), not lost");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("checkpoint suppresses a findings escalation until the terminal Stop", () => {
  const home = setupHome();
  try {
    const sid = "cp-findings";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-18" });
    // A blocking error (would flag) AND a sub-agent still running in the same turn.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "b1", "Bash", { command: "gh pr create" }),
      toolResult("2026-01-01T00:00:01Z", "b1", true, "permission denied: token missing pull-request scope"),
      toolUse("2026-01-01T00:00:02Z", "ta1", "Task", { subagent_type: "fullstack-backend", description: "fix" }),
    ]);
    // Checkpoint: sub-agent pending → the finding must NOT be surfaced mid-task.
    const cp = run(home, "finalize", {
      session_id: sid, transcript_path: transcriptPath, reason: "stop",
      background_tasks: [{ agent_id: "ta1", agent_type: "fullstack-backend" }],
    });
    assert.equal(cp.trim(), "", "a finding must not be surfaced while a sub-agent is still running");
    assert.equal(finalizesOf(readSpans(home, sid))[0].decision.verdict, "deferred");

    // Sub-agent returns; terminal Stop → NOW the finding surfaces.
    appendLines(transcriptPath, [toolResult("2026-01-01T00:00:05Z", "ta1", false, "done")]);
    run(home, "agentstop", { session_id: sid, transcript_path: transcriptPath });
    const term = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop", background_tasks: [] });
    const dec = JSON.parse(term);
    assert.equal(dec.decision, "block", "the finding surfaces at the terminal Stop");
    assert.match(dec.reason, /vc-self-check/);
    const fins = finalizesOf(readSpans(home, sid));
    assert.equal(fins[fins.length - 1].decision.verdict, "flagged");
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
    complete(home, "qa-fix"); // /qa-fix reached its terminal step (Phase 7 — STOP for human review)

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

// ─── age-cap backstop — prune our own aged artifacts at SessionStart ────────────────
const diagDirOf = (home) => join(home, ".vc-fix", "diagnostics");
function seedFile(dir, name, ageHours, content = "x") {
  const p = join(dir, name);
  writeFileSync(p, content);
  if (ageHours != null) {
    const t = Date.now() / 1000 - ageHours * 3600; // utimesSync numeric = seconds
    utimesSync(p, t, t);
  }
  return p;
}

test("age-cap: SessionStart prunes our aged artifacts (>24h) but keeps fresh, current-session, and stray files", () => {
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    // Aged (48h) artifacts of a PRIOR, undelivered session → must be pruned.
    const oldJsonl = seedFile(dir, "old-session.jsonl", 48);
    const oldState = seedFile(dir, "old-session.state.json", 48);
    const oldDiag = seedFile(dir, "DIAG-old-session-2026.md", 48);
    const oldDelivery = seedFile(dir, "DELIVERY-abcd1234-2026.md", 48);
    // Fresh artifact (in-flight another session) → must survive.
    const freshJsonl = seedFile(dir, "fresh-session.jsonl", 0);
    // An aged artifact of the CURRENT session (a DIAG init won't recreate) → guard must keep it.
    const curDiag = seedFile(dir, "DIAG-cur-session-2026.md", 48);
    // A stray non-artifact file, aged → not our shape, must be left alone.
    const stray = seedFile(dir, "notes.txt", 48);

    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: "cur-session", transcript_path: transcriptPath });

    assert.ok(!existsSync(oldJsonl), "aged .jsonl pruned");
    assert.ok(!existsSync(oldState), "aged .state.json pruned");
    assert.ok(!existsSync(oldDiag), "aged DIAG-*.md pruned");
    assert.ok(!existsSync(oldDelivery), "aged DELIVERY-*.md pruned");
    assert.ok(existsSync(freshJsonl), "fresh artifact kept");
    assert.ok(existsSync(curDiag), "current session's own artifact kept even when aged");
    assert.ok(existsSync(stray), "a stray non-artifact file is never touched");

    // The count is surfaced on the session_start record.
    const start = readSpans(home, "cur-session").find((r) => r.type === "session_start");
    assert.equal(start.prunedOldArtifacts, 4, "4 aged artifacts were reclaimed");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("age-cap: VC_FIX_DIAG_MAX_AGE_H=0 disables the sweep (aged files survive)", () => {
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    const oldJsonl = seedFile(dir, "old-session.jsonl", 48);
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: "cur-session", transcript_path: transcriptPath }, { VC_FIX_DIAG_MAX_AGE_H: "0" });
    assert.ok(existsSync(oldJsonl), "sweep disabled → aged file must survive");
    const start = readSpans(home, "cur-session").find((r) => r.type === "session_start");
    assert.equal(start.prunedOldArtifacts, undefined, "nothing pruned → no count field");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("age-cap: a custom VC_FIX_DIAG_MAX_AGE_H threshold is honored", () => {
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    const twoHrOld = seedFile(dir, "two-hr.jsonl", 2);
    const halfHrOld = seedFile(dir, "half-hr.jsonl", 0.5);
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    // 1-hour cap: the 2h file is stale, the 0.5h file is fresh.
    run(home, "init", { session_id: "cur-session", transcript_path: transcriptPath }, { VC_FIX_DIAG_MAX_AGE_H: "1" });
    assert.ok(!existsSync(twoHrOld), "older than the 1h cap → pruned");
    assert.ok(existsSync(halfHrOld), "younger than the 1h cap → kept");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── resume / compact — a SessionStart mid-command must NOT wipe the open span ──────
test("resume: a SessionStart mid-command carries state over so the command span survives (no false pluginActivity:false)", () => {
  const home = setupHome();
  try {
    const sid = "resume-mid";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath, source: "startup" });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/project-init" });
    // Work done before the context is summarized.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "b1", "Bash", { command: "node discover-repos.mjs" }),
      toolResult("2026-01-01T00:00:01Z", "b1", false, "scanned repos"),
    ]);
    // COMPACT/RESUME fires SessionStart in the MIDDLE of the /project-init command.
    run(home, "init", { session_id: sid, transcript_path: transcriptPath, source: "resume" });
    // Work continues after the resume.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:02Z", "b2", "Bash", { command: "node verify-access.mjs" }),
      toolResult("2026-01-01T00:00:03Z", "b2", false, "project-profile.json written; readiness table: all PASS"),
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop", background_tasks: [] });

    const recs = readSpans(home, sid);
    const cmd = spansOf(recs, "command", "project-init");
    assert.equal(cmd.length, 1, "the command span survives the resume and is emitted exactly once");
    const fin = finalizeOf(recs);
    assert.equal(fin.decision.pluginActivity, true, "plugin activity must NOT be lost across a resume");
    const toolSpans = recs.filter((r) => r.type === "span" && r.kind === "tool");
    assert.ok(toolSpans.length >= 1, "tool spans were captured");
    assert.ok(toolSpans.every((t) => t.parentId === cmd[0].id), "tool spans attribute to the command span, not orphaned (parentId:null)");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("resume: a plain 'startup' SessionStart still fully resets (carry-over is gated to resume/compact)", () => {
  const home = setupHome();
  try {
    const sid = "startup-reset";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath, source: "startup" });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/project-init" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "b1", "Bash", { command: "node x.mjs" }),
      toolResult("2026-01-01T00:00:01Z", "b1", false, "ok"),
    ]);
    // A fresh 'startup' (NOT resume) must wipe the open command span.
    run(home, "init", { session_id: sid, transcript_path: transcriptPath, source: "startup" });
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop", background_tasks: [] }, LINE_OFF);
    const recs = readSpans(home, sid);
    assert.equal(spansOf(recs, "command", "project-init").length, 0, "a startup reset drops the pre-reset command span");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── testEnv enrichment (S3) — recover TEST_ENV passed inline in tool args ───────────
test("testEnv: recovered from an inline TEST_ENV= in tool args onto the finalize record", () => {
  const home = setupHome();
  try {
    const sid = "testenv-1";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    // No TEST_ENV in the hook env → session_start.testEnv is null.
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    const start = readSpans(home, sid).find((r) => r.type === "session_start");
    assert.equal(start.testEnv, null, "not exported to the hook env → null on session_start");
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "b1", "Bash", { command: "TEST_ENV=vcptcore node verify-access.mjs" }),
      toolResult("2026-01-01T00:00:01Z", "b1", false, "Readiness: all PASS"),
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    const fin = finalizeOf(readSpans(home, sid));
    assert.equal(fin.testEnv, "vcptcore", "finalize recovers TEST_ENV from the tool args");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── developer skills — EXPECTED_OUTPUT (defensive; normally sidechain-invisible) ──────
function skillUse(ts, id, skill) {
  return JSON.stringify({ timestamp: ts, message: { content: [{ type: "tool_use", id, name: "Skill", input: { skill } }] } });
}
test("dev skill: a /vc-shell-fix skill span with a red→green test run has its expected output (not silent_suspect)", () => {
  const home = setupHome();
  try {
    const sid = "devskill-ok";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-99" });
    appendLines(transcriptPath, [
      skillUse("2026-01-01T00:00:00Z", "sk1", "vc-shell-fix"),
      toolUse("2026-01-01T00:00:01Z", "e1", "Edit", { file_path: "page-builder-shell/store.ts" }),
      toolResult("2026-01-01T00:00:02Z", "e1", false, "edited"),
      toolUse("2026-01-01T00:00:03Z", "b1", "Bash", { command: "npx vitest run store.spec.ts" }),
      toolResult("2026-01-01T00:00:04Z", "b1", false, "2 passed"),
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    const sk = spansOf(readSpans(home, sid), "skill", "vc-shell-fix");
    assert.equal(sk.length, 1, "the /vc-shell-fix skill span is captured");
    assert.equal(sk[0].outcome, "success", "vitest run + Edit satisfy the DEV_SKILL_OUTPUT markers → not silent_suspect");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("dev skill: a /vc-shell-fix skill span that produced NONE of its markers is silent_suspect (entry is wired)", () => {
  const home = setupHome();
  try {
    const sid = "devskill-silent";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-fix VCST-100" });
    // Two reads, no edit / no test run / no BAIL → no expected-output marker, ≥ SILENT_MIN_OPS.
    appendLines(transcriptPath, [
      skillUse("2026-01-01T00:00:00Z", "sk1", "vc-shell-fix"),
      toolUse("2026-01-01T00:00:01Z", "r1", "Read", { file_path: "a.ts" }),
      toolResult("2026-01-01T00:00:02Z", "r1", false, "file contents"),
      toolUse("2026-01-01T00:00:03Z", "r2", "Read", { file_path: "b.ts" }),
      toolResult("2026-01-01T00:00:04Z", "r2", false, "more contents"),
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    const sk = spansOf(readSpans(home, sid), "skill", "vc-shell-fix");
    assert.equal(sk.length, 1);
    assert.equal(sk[0].outcome, "silent_suspect", "no marker + real work ⇒ silent_suspect (proves the EXPECTED_OUTPUT entry gates, not an absent-entry pass-through)");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── cleanup offer — leftover artifacts from OTHER inactive sessions ────────────────
test("cleanup offer: NOT standalone on a plain dev turn — it rides a diagnostic (clean) surface only", () => {
  // Operator rule (2026-07-22): the deletion offer must come AFTER the no-problems check — never
  // pop out of nowhere on a plain dev turn with no plugin verdict. It rides the clean line / the
  // findings→self-check flow, appended after it.
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    // A prior session's artifacts, 2h old (> the 1h inactivity floor, < the 24h age-cap so
    // they survive the silent prune) → the offer should propose clearing them.
    seedFile(dir, "old-inactive.jsonl", 2);
    seedFile(dir, "old-inactive.state.json", 2);

    const sid = "cur-cleanup";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });

    // The stale counts land on session_start.
    const start = readSpans(home, sid).find((r) => r.type === "session_start");
    assert.equal(start.staleInactiveSessions, 1, "one inactive session detected");
    assert.equal(start.staleInactiveFiles, 2, "two leftover files detected");

    // 1) A plain dev turn (no plugin activity) — the cleanup offer must NOT surface standalone.
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "refactor this" });
    const plain = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(plain.trim(), "", "no plugin verdict → no standalone cleanup offer");
    const finPlain = finalizeOf(readSpans(home, sid));
    assert.equal(finPlain.decision.cleanupOffered, false);
    assert.equal(finPlain.decision.suppressReason, "no-plugin-activity");

    // 2) A clean PLUGIN turn — the clean line fires AND the cleanup offer rides it (after it).
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" });
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "t1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "t1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    complete(home, "qa-env-check");
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });

    const dec = JSON.parse(out);
    assert.equal(dec.decision, "block", "the clean line + cleanup offer surface via decision:block");
    assert.match(dec.reason, /no plugin issues detected/i, "the clean verdict comes FIRST");
    assert.match(dec.reason, /Clean up vc-fix diagnostic files/, "the 3-option AskUserQuestion is set up, AFTER the verdict");
    assert.match(dec.reason, /Delete all sessions \(incl\. this one\)/);
    assert.match(dec.reason, /Delete all except this session/);
    assert.match(dec.reason, /Keep them \(auto-deleted after 24h\)/);
    assert.match(dec.reason, /purge-inactive --all --dir/, "option 1 (all incl. this) ignores the 1h floor");
    assert.match(dec.reason, /purge-inactive --keep "cur-cleanup" --dir/, "option 2 (all except this) keeps the 1h floor → spares a live parallel session");
    assert.doesNotMatch(dec.reason, /purge-inactive --all --keep/, "option 2 must NOT use --all (that would delete a live parallel session)");
    assert.equal(finalizesOf(readSpans(home, sid)).pop().decision.cleanupOffered, true);

    // A repeat finalize (same turn / resume) must NOT re-offer — once per session.
    const second = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(second.trim(), "", "the cleanup offer fires at most once per session");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("cleanup offer: NOT surfaced mid-skill (awaiting-completion) — rides the terminal clean line at the skill's end", () => {
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    seedFile(dir, "old-inactive.jsonl", 2);
    seedFile(dir, "old-inactive.state.json", 2);
    const sid = "cleanup-midskill";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/project-init" });

    // Interview pause — a trivial turn mid-/project-init. pluginActivity is true (the command span
    // closed) but no `complete` yet → awaiting-completion. The cleanup offer MUST NOT interrupt here.
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "r1", "Read", { file_path: "project-profile.json" }),
      toolResult("2026-01-01T00:00:01Z", "r1", false, "no profile yet"),
    ]);
    const pause = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(pause.trim(), "", "no cleanup dialog (and no clean line) mid-onboarding");
    const finPause = finalizeOf(readSpans(home, sid));
    assert.equal(finPause.decision.suppressReason, "awaiting-completion");
    assert.equal(finPause.decision.cleanupOffered, false, "cleanup withheld during the skill");

    // Terminal step — the skill signals completion; the clean line fires AND the cleanup rides it.
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "finish" });
    complete(home, "project-init");
    const term = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    const dec = JSON.parse(term);
    assert.equal(dec.decision, "block");
    assert.match(dec.reason, /no plugin issues detected/i, "the clean line surfaces at the terminal step");
    assert.match(dec.reason, /Clean up vc-fix diagnostic files/, "the cleanup offer rides the same terminal resume");
    assert.equal(finalizesOf(readSpans(home, sid)).pop().decision.cleanupOffered, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("cleanup offer: fresh (<1h) leftover files from a live parallel session are NOT offered", () => {
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    seedFile(dir, "live-parallel.jsonl", 0); // 0h old — a still-live parallel session
    const sid = "cur-nolt";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    run(home, "init", { session_id: sid, transcript_path: transcriptPath });
    const start = readSpans(home, sid).find((r) => r.type === "session_start");
    assert.equal(start.staleInactiveFiles, undefined, "a fresh parallel-session file is below the inactivity floor → not offered");
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "refactor this" });
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" });
    assert.equal(out.trim(), "", "no stale artifacts → no cleanup offer");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("cleanup offer: VC_FIX_DIAG_CONSENT=off suppresses the offer (capture still runs)", () => {
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    seedFile(dir, "old-inactive.jsonl", 2);
    const sid = "cur-consentoff";
    const transcriptPath = join(home, "transcript.jsonl");
    writeFileSync(transcriptPath, "");
    const OFF = { VC_FIX_DIAG_CONSENT: "off" };
    run(home, "init", { session_id: sid, transcript_path: transcriptPath }, OFF);
    // A clean PLUGIN turn that WOULD ride a clean line + cleanup offer — the kill switch must
    // suppress both (so this isn't a vacuous pass on a no-verdict turn post the standalone-removal).
    run(home, "prompt", { session_id: sid, transcript_path: transcriptPath, prompt: "/qa-env-check" }, OFF);
    appendLines(transcriptPath, [
      toolUse("2026-01-01T00:00:00Z", "t1", "Read", { file_path: "config.js" }),
      toolResult("2026-01-01T00:00:01Z", "t1", false, "env ok"),
      assistantText("2026-01-01T00:00:02Z", "Readiness table: all PASS — READY."),
    ]);
    complete(home, "qa-env-check", OFF);
    const out = run(home, "finalize", { session_id: sid, transcript_path: transcriptPath, reason: "stop" }, OFF);
    assert.equal(out.trim(), "", "the kill switch suppresses the cleanup offer (and the clean line)");
    assert.ok(existsSync(join(home, ".vc-fix")), "capture still ran (consent gates surfacing, not capture)");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── purge-inactive subcommand ──────────────────────────────────────────────────
test("purge-inactive: removes inactive-session artifacts, keeps the current session's and fresh files", () => {
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    const oldJ = seedFile(dir, "old-a.jsonl", 2);
    const oldS = seedFile(dir, "old-a.state.json", 2);
    const oldDiag = seedFile(dir, "DIAG-old-a-2026.md", 2);
    const curJ = seedFile(dir, "cur.jsonl", 0); // current session — kept via --keep
    const freshOther = seedFile(dir, "live-b.jsonl", 0); // another session, fresh — kept by the floor
    const out = execFileSync(process.execPath, [HOOK, "purge-inactive", "--keep", "cur", "--dir", dir], { encoding: "utf8" });
    assert.ok(!existsSync(oldJ), "aged .jsonl removed");
    assert.ok(!existsSync(oldS), "aged .state.json removed");
    assert.ok(!existsSync(oldDiag), "aged DIAG-*.md removed");
    assert.ok(existsSync(curJ), "the current session's file is kept (--keep)");
    assert.ok(existsSync(freshOther), "a fresh (<1h) file is kept by the inactivity floor");
    assert.match(out, /Removed 3 inactive/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("purge-inactive --all: ignores the inactivity floor (removes even fresh non-kept files)", () => {
  const home = setupHome();
  try {
    const dir = diagDirOf(home);
    mkdirSync(dir, { recursive: true });
    const freshOther = seedFile(dir, "live-b.jsonl", 0);
    const curJ = seedFile(dir, "cur.jsonl", 0);
    const out = execFileSync(process.execPath, [HOOK, "purge-inactive", "--keep", "cur", "--dir", dir, "--all"], { encoding: "utf8" });
    assert.ok(!existsSync(freshOther), "--all removes even a fresh non-kept file");
    assert.ok(existsSync(curJ), "--keep still protects the current session");
    assert.match(out, /Removed 1 inactive/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
