// Unit tests for the OBSERVATION LAYER (VCST-5582 H) in plugins/vc-fix/hooks/session-telemetry.mjs
// — the capture/judgement/surfacing split.
//
// The defect these lock down: the collector used to CAPTURE and JUDGE in one step. `emitSpan`'s
// non-success test was simultaneously the retention, analysis-scope and surfacing decision (only
// `state.flagged[]` reached /vc-self-check), so a signal the deterministic classifier did not
// recognise at span close CEASED TO EXIST. A real /project-init run printed a WARN in its own
// readiness table (the Azure Bug field contract was never scanned — HTTP 400, stderr, exit 0) and
// self-diagnosed `no plugin issues detected` with spanCounts:{success:31}, flagged:[].
//
// Same harness as session-telemetry.test.mjs: drive the ACTUAL hook as a child process, one
// invocation per hook firing, JSON event on stdin, an isolated temp VC_FIX_HOME per scenario.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/hooks/session-telemetry.mjs");

function run(home, sub, ev, extraEnv = {}) {
  return execFileSync(process.execPath, [HOOK, sub], {
    input: JSON.stringify(ev),
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home, ...extraEnv },
  });
}
// The `obs` subcommand — the INSIDE channel a plugin script uses to report its own structured
// verdict (verify-access's readiness rows, discover-tracker's failed scans). Bash-invoked, so it
// resolves the session from the newest .state.json; the payload is a JSON array on stdin.
function obs(home, records, args = [], extraEnv = {}) {
  return execFileSync(process.execPath, [HOOK, "obs", ...args], {
    input: JSON.stringify(records),
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home, ...extraEnv },
  });
}
function complete(home, skill) {
  return execFileSync(process.execPath, [HOOK, "complete", "--skill", skill], {
    input: "",
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home },
  });
}
function purge(home, args = []) {
  return execFileSync(process.execPath, [HOOK, "purge-inactive", ...args], {
    input: "",
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home },
  });
}

function setupHome({ selfDiagnostics = true, projectType = "client" } = {}) {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-obs-"));
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ projectType, selfDiagnostics }));
  writeFileSync(join(home, "transcript.jsonl"), "");
  return home;
}
const tp = (home) => join(home, "transcript.jsonl");
const appendLines = (path, lines) => appendFileSync(path, lines.map((l) => l + "\n").join(""));

function toolUse(ts, id, name, input) {
  return JSON.stringify({ timestamp: ts, message: { content: [{ type: "tool_use", id, name, input }] } });
}
function toolResult(ts, id, isError, text) {
  return JSON.stringify({ timestamp: ts, type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: [{ type: "text", text }] }] } });
}
// A tool_result WITH the structured `toolUseResult` sidecar Claude Code records for Bash:
// { stdout, stderr, interrupted, isImage, noOutputExpected }. The collector used to read only
// message.content[], so the whole stderr channel was invisible — which is exactly how a script that
// warns to stderr and exits 0 produced a "clean" self-diagnosis.
function toolResultSidecar(ts, id, isError, text, sidecar) {
  return JSON.stringify({
    timestamp: ts, type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: [{ type: "text", text }] }] },
    toolUseResult: { stdout: text, stderr: "", interrupted: false, isImage: false, ...sidecar },
  });
}
function sidechainResult(ts, id, text) {
  return JSON.stringify({
    timestamp: ts, type: "user", isSidechain: true,
    message: { content: [{ type: "tool_result", tool_use_id: id, is_error: true, content: [{ type: "text", text }] }] },
  });
}

const recordsOf = (home, sid) => {
  const p = join(home, ".vc-fix", "diagnostics", `${sid}.jsonl`);
  return existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const obsOf = (recs) => recs.filter((r) => r.type === "obs");
const finalizesOf = (recs) => recs.filter((r) => r.type === "finalize");
const lastFinalize = (home, sid) => finalizesOf(recordsOf(home, sid)).pop();
const blockOf = (out) => { try { return JSON.parse(out || "{}"); } catch { return {}; } };

// ─── THE REFERENCE DEFECT ─────────────────────────────────────────────────────────
test("reference defect: a self-reported WARN makes the run `attention`, never `clean`", () => {
  const home = setupHome();
  try {
    run(home, "init", { session_id: "ref", transcript_path: tp(home) });
    run(home, "prompt", { session_id: "ref", transcript_path: tp(home), prompt: "/project-init" });
    // What verify-access.mjs now reports for the row it used to only render:
    //   "Tracker bug field contract | WARN | no field contract scanned for Bug — unverified defaults"
    obs(home, [{
      class: "self_reported_warn", subject: "Tracker bug field contract", code: "HTTP_4XX",
      evidence: { snippet: "WARN: no field contract scanned for Bug", httpStatus: 400 },
    }], ["--skill", "project-init"]);
    complete(home, "project-init");
    const out = run(home, "finalize", { session_id: "ref", transcript_path: tp(home), background_tasks: [] });

    const fin = lastFinalize(home, "ref");
    assert.equal(fin.decision.verdict, "attention", "a run containing a WARN can NEVER record itself clean");
    assert.equal(fin.decision.surfaceDecision, "tail-trigger");
    assert.equal(fin.decision.observations.selfReported, 1);
    assert.equal(fin.decision.observations.routing, 1);
    // …and it must actually surface, by running the diagnostician.
    assert.match(blockOf(out).reason || "", /vc-self-check/, "the tail-trigger runs the diagnostician");
    const o = obsOf(recordsOf(home, "ref"));
    assert.equal(o.length, 1);
    assert.equal(o[0].subject, "tracker_bug_field_contract", "the subject is slugified, never free text");
    assert.equal(o[0].evidence.httpStatus, 400);
    assert.equal(o[0].source, "script");
    assert.ok(!("severity" in o[0]) && !("verdict" in o[0]), "capture must have NO way to express importance");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── verdict integrity (the `clean`-with-a-failed-span lie) ───────────────────────
test("verdict integrity: an ALREADY-SURFACED flagged span still forbids `clean`", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "vi", transcript_path: t });
    run(home, "prompt", { session_id: "vi", transcript_path: t, prompt: "/qa-verify-fix VCST-1" });
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "t1", "Bash", { command: "gh pr view 1" }),
      toolResult("2026-07-29T10:00:01.000Z", "t1", true, "fatal: could not read Username"),
    ]);
    // Turn 1: the finding surfaces, so its signature lands in seenSignatures.
    const out1 = run(home, "finalize", { session_id: "vi", transcript_path: t, background_tasks: [] });
    assert.match(blockOf(out1).reason || "", /vc-self-check/);
    assert.equal(lastFinalize(home, "vi").decision.verdict, "attention");

    // Turn 2 (a NEW user turn, so promptedThisTurn resets). Nothing NEW to route — but the run
    // still contains a `failed` span, so the durable record must not call itself clean. Two real
    // sessions on disk in this repo did exactly that (`flagged:[{outcome:"failed"}]` +
    // `verdict:"clean"`), because the verdict was derived from the ROUTING set.
    run(home, "prompt", { session_id: "vi", transcript_path: t, prompt: "what now?" });
    const out2 = run(home, "finalize", { session_id: "vi", transcript_path: t, background_tasks: [] });
    const fin2 = lastFinalize(home, "vi");
    assert.equal(fin2.decision.freshCount, 0, "nothing NEW to route");
    assert.ok(fin2.decision.flaggedTotal > 0, "but the finding is still on the record");
    assert.equal(fin2.decision.verdict, "attention", "verdict describes the RUN, not the routing set");
    assert.equal(blockOf(out2).decision, undefined, "and it does not re-nag");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── the three-state status line ──────────────────────────────────────────────────
test("three-state line: a genuinely empty record still prints the clean line verbatim", () => {
  const home = setupHome();
  try {
    run(home, "init", { session_id: "cl", transcript_path: tp(home) });
    run(home, "prompt", { session_id: "cl", transcript_path: tp(home), prompt: "/qa-env-check" });
    complete(home, "qa-env-check");
    const out = run(home, "finalize", { session_id: "cl", transcript_path: tp(home), background_tasks: [] });
    const fin = lastFinalize(home, "cl");
    assert.equal(fin.decision.verdict, "clean");
    assert.equal(fin.decision.observations.total, 0, "`clean` requires a literally empty record");
    assert.equal(fin.decision.surfaceDecision, "clean-line");
    assert.match(blockOf(out).reason || "", /vc-fix self-check: no plugin issues detected/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("three-state line: non-routing observations ⇒ `observed` + a COUNT, not silence and not `clean`", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "ob", transcript_path: t });
    run(home, "prompt", { session_id: "ob", transcript_path: t, prompt: "/qa-env-check" });
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "t1", "Bash", { command: "node scripts/probe.mjs" }),
      // exit 0 + a real stderr warning: the shape that used to be completely invisible.
      toolResultSidecar("2026-07-29T10:00:01.000Z", "t1", false, "readiness PASS", { stderr: "warning: falling back to the default store" }),
    ]);
    complete(home, "qa-env-check");
    const out = run(home, "finalize", { session_id: "ob", transcript_path: t, background_tasks: [] });
    const fin = lastFinalize(home, "ob");
    assert.equal(fin.decision.verdict, "observed", "observations exist but none of them routes");
    assert.equal(fin.decision.surfaceDecision, "observed-line");
    assert.ok(fin.decision.observations.visible >= 1);
    assert.equal(fin.decision.observations.routing, 0, "a stderr warning does not justify spending a turn");
    assert.match(blockOf(out).reason || "", /no blocking issues — \d+ observation\(s\) recorded/);
    assert.doesNotMatch(blockOf(out).reason || "", /no plugin issues detected/, "must never claim clean");
    const classes = obsOf(recordsOf(home, "ob")).map((o) => o.class);
    assert.ok(classes.includes("script_stderr"), "stderr on an exit-0 tool is captured");
    assert.ok(classes.includes("self_reported_fallback"), '"falling back to" is a self-reported degradation');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the degradation marker does NOT fire on file content the agent merely READ", () => {
  // This repo's own sources contain the literal marker text ("unverified defaults" lives in
  // discover-tracker.mjs, verify-access.mjs and the oracle), so scanning a Read result would
  // manufacture a self_reported_fallback every time someone opens those files. Capture stays total
  // for signals it can attribute; it must not invent signals out of data the agent looked at.
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "fp", transcript_path: t });
    run(home, "prompt", { session_id: "fp", transcript_path: t, prompt: "/qa-bug x" });
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "t1", "Read", { file_path: "plugins/vc-fix/skills/project-init/discover-tracker.mjs" }),
      toolResult("2026-07-29T10:00:01.000Z", "t1", false, 'console.error("… will fall back to the legacy field set, labelled \\"unverified defaults\\".")'),
    ]);
    run(home, "finalize", { session_id: "fp", transcript_path: t, background_tasks: [] });
    const classes = obsOf(recordsOf(home, "fp")).map((o) => o.class);
    assert.ok(!classes.includes("self_reported_fallback"), "a Read result is data, not our own report");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("harness stderr is its own NOISE class — recorded, but not counted in the visible line", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "hn", transcript_path: t });
    run(home, "prompt", { session_id: "hn", transcript_path: t, prompt: "/qa-env-check" });
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "t1", "Bash", { command: "ls" }),
      toolResultSidecar("2026-07-29T10:00:01.000Z", "t1", false, "readiness PASS", { stderr: "\nShell cwd was reset to C:\\repo\n" }),
    ]);
    complete(home, "qa-env-check");
    run(home, "finalize", { session_id: "hn", transcript_path: t, background_tasks: [] });
    const fin = lastFinalize(home, "hn");
    const o = obsOf(recordsOf(home, "hn"));
    assert.deepEqual(o.map((x) => x.class), ["harness_noise"], "recorded — deciding it is noise is the JUDGE's job");
    assert.equal(fin.decision.observations.total, 1);
    assert.equal(fin.decision.observations.visible, 0, "…but it does not inflate the operator-facing count");
    assert.equal(fin.decision.verdict, "observed", "still not `clean`: the record is not empty");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── exit codes + interrupts ──────────────────────────────────────────────────────
test("a non-zero exit is captured as its own class with the code as DATA", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "ec", transcript_path: t });
    run(home, "prompt", { session_id: "ec", transcript_path: t, prompt: "/project-init" });
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "t1", "Bash", { command: 'node "$ROOT/skills/project-init/verify-access.mjs"' }),
      toolResultSidecar("2026-07-29T10:00:01.000Z", "t1", true, "Exit code 1\nNOT READY — resolve: Azure DevOps auth", { interrupted: false }),
    ]);
    run(home, "finalize", { session_id: "ec", transcript_path: t, background_tasks: [] });
    const o = obsOf(recordsOf(home, "ec"));
    const exit = o.find((x) => x.class === "script_exit_nonzero");
    assert.ok(exit, "a non-zero exit is a first-class fact, not merely 'some tool errored'");
    assert.equal(exit.evidence.exitCode, 1);
    assert.equal(exit.subject, "verify_access", "the subject is the plugin SCRIPT, not 'bash'");
    assert.equal(lastFinalize(home, "ec").decision.verdict, "attention", "a non-zero script exit routes");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("an interrupted tool is captured", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "int", transcript_path: t });
    run(home, "prompt", { session_id: "int", transcript_path: t, prompt: "/qa-bug x" });
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "t1", "Bash", { command: "npm test" }),
      toolResultSidecar("2026-07-29T10:00:01.000Z", "t1", false, "partial output", { interrupted: true }),
    ]);
    run(home, "finalize", { session_id: "int", transcript_path: t, background_tasks: [] });
    assert.ok(obsOf(recordsOf(home, "int")).some((o) => o.class === "tool_interrupted"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── signals on spans the old pipeline threw away ─────────────────────────────────
test("a RECOVERED error is recorded (S3 'note only' used to mean 'delete') but does not route", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "rec", transcript_path: t });
    run(home, "prompt", { session_id: "rec", transcript_path: t, prompt: "/qa-bug x" });
    // Same tool + same args: fails, then succeeds → classify() = `recovered`, never flagged.
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "t1", "Bash", { command: "gh auth status" }),
      toolResult("2026-07-29T10:00:01.000Z", "t1", true, "could not connect"),
      toolUse("2026-07-29T10:00:02.000Z", "t2", "Bash", { command: "gh auth status" }),
      toolResult("2026-07-29T10:00:03.000Z", "t2", false, "Logged in"),
      toolUse("2026-07-29T10:00:04.000Z", "t3", "Write", { file_path: "reports/bugs/open/BUG-x.md" }),
      toolResult("2026-07-29T10:00:05.000Z", "t3", false, "File written"),
    ]);
    const out = run(home, "finalize", { session_id: "rec", transcript_path: t, background_tasks: [] });
    const recs = recordsOf(home, "rec");
    const cmd = recs.find((r) => r.type === "span" && r.kind === "command");
    assert.equal(cmd.outcome, "recovered", "the classifier's own verdict is unchanged");
    assert.equal(lastFinalize(home, "rec").decision.flaggedTotal, 0, "a recovered span is still not flagged");
    assert.ok(obsOf(recs).some((o) => o.class === "recovered_error"), "but the failure IS now on the record");
    assert.equal(blockOf(out).decision, undefined, "and it must not nag — recovery is correct behaviour");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a sub-agent (sidechain) error becomes an observation and NEVER a span", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "sc", transcript_path: t });
    run(home, "prompt", { session_id: "sc", transcript_path: t, prompt: "/qa-fix VCST-1" });
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "a1", "Task", { subagent_type: "fullstack-backend" }),
      sidechainResult("2026-07-29T10:00:01.000Z", "s1", "error: dotnet build failed"),
      sidechainResult("2026-07-29T10:00:02.000Z", "s2", "error: dotnet build failed"),
      toolResult("2026-07-29T10:00:03.000Z", "a1", false, "opened PR pull/42"),
    ]);
    run(home, "finalize", { session_id: "sc", transcript_path: t, background_tasks: [] });
    const recs = recordsOf(home, "sc");
    const side = obsOf(recs).filter((o) => o.subject === "sidechain");
    assert.equal(side.length, 1, "aggregated by signature — one record however long the sub-agent ran");
    assert.equal(side[0].code, "BUILD_FAILED", "classified through the shared error taxonomy");
    assert.equal(lastFinalize(home, "sc").sidechainOps, 2);
    // Aggregate-only: the sub-agent's ops must not become spans or contaminate the parent's
    // struggle/recovery arithmetic (a different unit of work).
    assert.ok(!recs.some((r) => r.type === "span" && /dotnet/.test(r.name || "")), "no sidechain spans");
    assert.equal(lastFinalize(home, "sc").decision.observations.routing, 0, "and it costs no surfacing");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── aggregation, dedup, caps ─────────────────────────────────────────────────────
test("observations aggregate by signature (count bumps, one line) and caps are announced", () => {
  const home = setupHome();
  try {
    run(home, "init", { session_id: "cap", transcript_path: tp(home) });
    run(home, "prompt", { session_id: "cap", transcript_path: tp(home), prompt: "/project-init" });
    // Same class+subject+code three times ⇒ ONE record.
    obs(home, [
      { class: "http_non2xx", subject: "ado_project_id", code: "HTTP_4XX" },
      { class: "http_non2xx", subject: "ado_project_id", code: "HTTP_4XX" },
      { class: "http_non2xx", subject: "ado_project_id", code: "HTTP_4XX" },
    ], ["--skill", "project-init"]);
    // 30 DISTINCT subjects in one class ⇒ the per-class cap (25) refuses the tail.
    obs(home, Array.from({ length: 30 }, (_, i) => ({ class: "self_reported_skip", subject: `check_${i}` })), ["--skill", "project-init"]);
    run(home, "finalize", { session_id: "cap", transcript_path: tp(home), background_tasks: [] });

    const o = obsOf(recordsOf(home, "cap"));
    const http = o.filter((x) => x.class === "http_non2xx");
    assert.equal(http.length, 1, "one line per signature — never one per occurrence");
    const fin = lastFinalize(home, "cap");
    assert.equal(fin.decision.observations.byClass.http_non2xx, 3, "…with the occurrences counted");
    assert.equal(fin.decision.observations.byClass.self_reported_skip, 25, "per-class cap holds");
    assert.ok(o.some((x) => x.class === "capture_truncated"), "TRUNCATION IS NEVER SILENT");
    // Bounded growth: the whole session's jsonl stays small even after 33 observation attempts.
    const bytes = readFileSync(join(home, ".vc-fix", "diagnostics", "cap.jsonl")).length;
    assert.ok(bytes < 40_000, `jsonl stayed bounded (${bytes} bytes)`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── silence guarantees (no regression into nagging) ──────────────────────────────
test("a plain dev turn stays SILENT even when observations were recorded", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "dev", transcript_path: t });
    run(home, "prompt", { session_id: "dev", transcript_path: t, prompt: "fix the typo in README" });
    appendLines(t, [
      toolUse("2026-07-29T10:00:00.000Z", "t1", "Edit", { file_path: "README.md" }),
      toolResult("2026-07-29T10:00:01.000Z", "t1", false, "ok"),
      // The `tsc` PostToolUse echo — an untied hook_failure with no plugin span open.
      JSON.stringify({ timestamp: "2026-07-29T10:00:02.000Z", message: { content: "src/x.ts(3,1): error TS2345: bad" } }),
    ]);
    const out = run(home, "finalize", { session_id: "dev", transcript_path: t, background_tasks: [] });
    const fin = lastFinalize(home, "dev");
    assert.equal(fin.decision.pluginActivity, false);
    assert.equal(fin.decision.suppressReason, "no-plugin-activity");
    assert.equal(blockOf(out).decision, undefined, "no line, no trigger — the plugin never ran");
    assert.ok(obsOf(recordsOf(home, "dev")).some((o) => o.class === "hook_failure"), "but the signal is still CAPTURED");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a multi-turn skill's intermediate pauses never surface anything", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "mt", transcript_path: t });
    run(home, "prompt", { session_id: "mt", transcript_path: t, prompt: "/project-init" });
    obs(home, [{ class: "self_reported_skip", subject: "client repos" }], ["--skill", "project-init"]);
    // Three interview pauses, no completion marker yet.
    for (let i = 0; i < 3; i++) {
      const out = run(home, "finalize", { session_id: "mt", transcript_path: t, background_tasks: [] });
      assert.equal(blockOf(out).decision, undefined, `pause ${i + 1} must be silent`);
      assert.equal(lastFinalize(home, "mt").decision.suppressReason, "awaiting-completion");
    }
    complete(home, "project-init");
    const out = run(home, "finalize", { session_id: "mt", transcript_path: t, background_tasks: [] });
    assert.equal(blockOf(out).decision, "block", "exactly one surfacing, after the terminal step");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("selfCheckSeen no longer silences a LATER finding for the rest of the session", () => {
  const home = setupHome();
  try {
    const t = tp(home);
    run(home, "init", { session_id: "scs", transcript_path: t });
    // The operator ran the diagnostician early (or the collector's own tail-trigger did).
    run(home, "prompt", { session_id: "scs", transcript_path: t, prompt: "/vc-self-check latest" });
    run(home, "finalize", { session_id: "scs", transcript_path: t, background_tasks: [] });
    // A REAL failure happens afterwards. It used to be silenced for the whole session by the
    // session-wide `selfCheckSeen` latch — a lost finding, not just a missing line.
    run(home, "prompt", { session_id: "scs", transcript_path: t, prompt: "/qa-fix VCST-2" });
    appendLines(t, [
      toolUse("2026-07-29T11:00:00.000Z", "t9", "Bash", { command: "gh pr create" }),
      toolResult("2026-07-29T11:00:01.000Z", "t9", true, "Permission for this action was denied by the Claude Code auto mode classifier."),
    ]);
    const out = run(home, "finalize", { session_id: "scs", transcript_path: t, background_tasks: [] });
    assert.equal(blockOf(out).decision, "block", "a later finding must still surface");
    assert.equal(lastFinalize(home, "scs").decision.verdict, "attention");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── evidence protection ──────────────────────────────────────────────────────────
test("evidence protection: purge KEEPS a session whose finding was never diagnosed; --force removes it", () => {
  const home = setupHome();
  try {
    const dir = join(home, ".vc-fix", "diagnostics");
    run(home, "init", { session_id: "keep", transcript_path: tp(home) });
    run(home, "prompt", { session_id: "keep", transcript_path: tp(home), prompt: "/project-init" });
    obs(home, [{ class: "self_reported_fail", subject: "azure devops auth" }], ["--skill", "project-init"]);
    run(home, "finalize", { session_id: "keep", transcript_path: tp(home), background_tasks: [] });
    assert.ok(existsSync(join(dir, "keep.jsonl")));

    // `--all` ignores the inactivity floor and would otherwise delete EVERYTHING, including a
    // session holding an un-analysed finding — destroying the only copy of it.
    const out = purge(home, ["--all", "--dir", dir]);
    assert.ok(existsSync(join(dir, "keep.jsonl")), "an un-diagnosed finding is retained");
    assert.match(out, /Kept 1 session\(s\) holding an un-diagnosed finding/);
    assert.match(out, /--force/, "the retention is explained, with the override");

    // Once a DIAG exists the session is "judged" and may be reclaimed.
    writeFileSync(join(dir, "DIAG-keep-2026-07-29T10-00-00-000Z.md"), "# DIAG\n");
    purge(home, ["--all", "--dir", dir]);
    assert.ok(!existsSync(join(dir, "keep.jsonl")), "a diagnosed session is purgeable");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("evidence protection is SCOPED: a noise-only session is still reclaimable", () => {
  // The wrong bar would be "holds ≥1 observation": with capture-everything an ordinary session
  // routinely records harness_noise, so protecting on that would pin every artifact forever and
  // quietly disable the 24h age-cap — trading one failure mode for another.
  const home = setupHome();
  try {
    const dir = join(home, ".vc-fix", "diagnostics");
    run(home, "init", { session_id: "noise", transcript_path: tp(home) });
    obs(home, [{ class: "harness_noise", subject: "shell_cwd_reset" }, { class: "recovered_error", subject: "bash" }], ["--skill", "qa-bug"]);
    run(home, "finalize", { session_id: "noise", transcript_path: tp(home), background_tasks: [] });
    purge(home, ["--all", "--dir", dir]);
    assert.ok(!existsSync(join(dir, "noise.jsonl")), "noise-only ⇒ not protected, the age-cap still works");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("evidence protection: --force overrides the retention", () => {
  const home = setupHome();
  try {
    const dir = join(home, ".vc-fix", "diagnostics");
    run(home, "init", { session_id: "force", transcript_path: tp(home) });
    obs(home, [{ class: "degraded_artifact", subject: "tracker field contract" }], ["--skill", "project-init"]);
    purge(home, ["--all", "--force", "--dir", dir]);
    assert.ok(!existsSync(join(dir, "force.jsonl")), "--force deletes anyway");
    assert.equal(readdirSync(dir).filter((f) => f.endsWith(".jsonl")).length, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── the capture gate still governs the new channel ───────────────────────────────
test("the `obs` subcommand honours the OPT-IN capture gate (no .vc-fix/ when off)", () => {
  const home = setupHome({ selfDiagnostics: false });
  try {
    obs(home, [{ class: "self_reported_warn", subject: "anything" }], ["--skill", "project-init"]);
    assert.ok(!existsSync(join(home, ".vc-fix")), "capture is opt-in — the inside channel is no exception");
    // …and the env kill-switch too.
    const home2 = setupHome();
    try {
      run(home2, "init", { session_id: "off", transcript_path: tp(home2) });
      obs(home2, [{ class: "self_reported_warn", subject: "anything" }], [], { VC_FIX_DIAG_CAPTURE: "off" });
      assert.equal(obsOf(recordsOf(home2, "off")).length, 0, "VC_FIX_DIAG_CAPTURE=off suppresses capture");
    } finally {
      rmSync(home2, { recursive: true, force: true });
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("an unknown observation class is RECORDED as `unclassified`, never dropped", () => {
  const home = setupHome();
  try {
    run(home, "init", { session_id: "unk", transcript_path: tp(home) });
    obs(home, [{ class: "something_a_future_build_invented", subject: "x" }], ["--skill", "project-init"]);
    const o = obsOf(recordsOf(home, "unk"));
    assert.equal(o.length, 1);
    assert.equal(o[0].class, "unclassified", "losing it would be the very bug this layer exists to fix");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
