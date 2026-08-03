// Tests for the ROUTING decision in `finalize` —
// plugins/vc-fix/hooks/session-telemetry.mjs (items 7 + 8).
//
// The incident turn cost the operator a whole extra turn and then asked three questions at once.
// Two separate defects:
//
// Item 7 — routing fired on any new signal. `OBS_ROUTING_CLASSES` carried `self_reported_warn`,
// `http_non2xx` and `collector_contention` alongside the genuinely hard classes, and
// `script_exit_nonzero` routed for ANY script — including a client's own failing build, which is
// none of the plugin's business. A run whose command span ended `recovered`, whose deliverable
// landed, and whose findings were all S2/S3 friction still armed the diagnostician. The set is now
// hard (`self_reported_fail`, `degraded_artifact`, plugin-owned `script_exit_nonzero`), and a
// RECURRENCE re-qualifies via `obsSurfacedCount` — a growing count is not a duplicate (§1f rule 5).
//
// Item 8 — three operator questions in one turn (verdict + delivery offer + a three-option
// "clean up vc-fix diagnostic files?"), so the delivery offer had to be re-asked on a later turn.
// Cleanup no longer asks anything.
//
// Routing decides TIMING, never retention: everything below is still RECORDED whatever it routes.
// Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/hooks/session-telemetry.mjs");

function run(home, sub, ev, extraEnv = {}) {
  return execFileSync(process.execPath, [HOOK, sub], {
    input: JSON.stringify(ev), encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home, ...extraEnv },
  });
}
function obs(home, records, args = []) {
  return execFileSync(process.execPath, [HOOK, "obs", ...args], {
    input: JSON.stringify(records), encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home },
  });
}
function complete(home, skill, extraEnv = {}) {
  return execFileSync(process.execPath, [HOOK, "complete", "--skill", skill], {
    input: "", encoding: "utf8", env: { ...process.env, VC_FIX_HOME: home, ...extraEnv },
  });
}
function setupHome() {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-routing-"));
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ projectType: "client", selfDiagnostics: true }));
  writeFileSync(join(home, "transcript.jsonl"), "");
  return home;
}
const tp = (home) => join(home, "transcript.jsonl");
const appendLines = (p, lines) => appendFileSync(p, lines.map((l) => l + "\n").join(""));
const toolUse = (ts, id, name, input) => JSON.stringify({ timestamp: ts, message: { content: [{ type: "tool_use", id, name, input }] } });
const toolResult = (ts, id, isError, text) => JSON.stringify({ timestamp: ts, type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: [{ type: "text", text }] }] } });
const recordsOf = (home, sid) => {
  const p = join(home, ".vc-fix", "diagnostics", `${sid}.jsonl`);
  return existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const lastFinalize = (home, sid) => recordsOf(home, sid).filter((r) => r.type === "finalize").pop();
const obsOf = (home, sid) => recordsOf(home, sid).filter((r) => r.type === "obs");
const blockOf = (out) => { try { return JSON.parse(out || "{}"); } catch { return {}; } };

/** A session that ran a plugin command and completed it — the shape a real /qa-bug run has. */
function pluginSession(home, sid, cmd = "qa-bug", extraEnv = {}) {
  run(home, "init", { session_id: sid, transcript_path: tp(home) }, extraEnv);
  run(home, "prompt", { session_id: sid, transcript_path: tp(home), prompt: `/${cmd}` }, extraEnv);
  return () => complete(home, cmd, extraEnv);
}

// ─── item 7 — routing is a HARD set ──────────────────────────────────────────

test("item 7: a self_reported_warn is RECORDED and forces `attention`, but does not route", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "warn", "project-init");
    obs(home, [{ class: "self_reported_warn", subject: "tracker_field_contract", code: "HTTP_4XX" }], ["--skill", "project-init"]);
    done();
    const out = run(home, "finalize", { session_id: "warn", transcript_path: tp(home) });
    const fin = lastFinalize(home, "warn");
    assert.equal(obsOf(home, "warn").length, 1, "still captured in full");
    assert.equal(fin.decision.verdict, "attention", "the verdict invariant is untouched");
    assert.equal(fin.decision.observations.routing, 0, "but it does not spend a turn");
    assert.notEqual(fin.decision.surfaceDecision, "tail-trigger");
    assert.doesNotMatch(blockOf(out).reason || "", /no plugin issues detected/, "and it is never called clean");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: an http_non2xx is recorded but no longer routes", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "http", "project-init");
    obs(home, [{ class: "http_non2xx", subject: "tracker_probe", code: "HTTP_4XX", evidence: { httpStatus: 400 } }], ["--skill", "project-init"]);
    done();
    run(home, "finalize", { session_id: "http", transcript_path: tp(home) });
    const fin = lastFinalize(home, "http");
    assert.equal(obsOf(home, "http").length, 1);
    assert.equal(fin.decision.observations.routing, 0);
    assert.notEqual(fin.decision.surfaceDecision, "tail-trigger");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: a self_reported_fail DOES route (the hard set)", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "fail", "project-init");
    obs(home, [{ class: "self_reported_fail", subject: "access_verification", code: "AUTH_EXPIRED" }], ["--skill", "project-init"]);
    done();
    const out = run(home, "finalize", { session_id: "fail", transcript_path: tp(home) });
    const fin = lastFinalize(home, "fail");
    assert.equal(fin.decision.observations.routing, 1);
    assert.equal(fin.decision.surfaceDecision, "tail-trigger");
    assert.match(blockOf(out).reason || "", /vc-self-check/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: a degraded_artifact DOES route — the VCST-5582 H reference incident still fires", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "degr", "project-init");
    obs(home, [{ class: "degraded_artifact", subject: "profile_shape", code: "NONE" }], ["--skill", "project-init"]);
    done();
    const fin = (run(home, "finalize", { session_id: "degr", transcript_path: tp(home) }), lastFinalize(home, "degr"));
    assert.equal(fin.decision.observations.routing, 1);
    assert.equal(fin.decision.surfaceDecision, "tail-trigger");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: script_exit_nonzero routes for a PLUGIN-owned script", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "own");
    appendLines(tp(home), [
      toolUse("2026-01-01T00:00:00Z", "t1", "Bash", { command: 'node "$CLAUDE_PLUGIN_ROOT/skills/qa-fix-routing/ado.mjs" create-workitem' }),
      toolResult("2026-01-01T00:00:01Z", "t1", true, "Exit code 1\n[ado] 2 REQUIRED Bug field(s) have no value"),
    ]);
    done();
    run(home, "finalize", { session_id: "own", transcript_path: tp(home) });
    const fin = lastFinalize(home, "own");
    const rec = obsOf(home, "own").find((o) => o.class === "script_exit_nonzero");
    assert.ok(rec, "the observation exists");
    assert.equal(rec.subject, "ado", "attributed to the plugin script, not to `bash`");
    assert.equal(rec.pluginOwned, true);
    assert.ok(fin.decision.observations.routing >= 1, "a plugin script's non-zero exit routes");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: script_exit_nonzero from a CLIENT script is recorded but does NOT route", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "client");
    appendLines(tp(home), [
      toolUse("2026-01-01T00:00:00Z", "t1", "Bash", { command: "npm run build --prefix ./their-app" }),
      toolResult("2026-01-01T00:00:01Z", "t1", true, "Exit code 1\ntheir build broke"),
    ]);
    done();
    run(home, "finalize", { session_id: "client", transcript_path: tp(home) });
    const rec = obsOf(home, "client").find((o) => o.class === "script_exit_nonzero");
    assert.ok(rec, "still captured — routing never decides retention");
    assert.equal(rec.pluginOwned, false);
    const fin = lastFinalize(home, "client");
    assert.equal(fin.decision.observations.routing, 0, "the plugin does not nag about the client's own build");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: a client .mjs under a bare scripts/ dir is NOT plugin-owned (dir-name match is not ownership)", () => {
  // The client's own project has a scripts//skills//hooks/ dir too; a bare dir-name match would
  // wrongly flag `node ./scripts/build.mjs` as ours and arm the diagnostician on the client's build
  // (VCST-5582 review). Ownership is anchored to the installed plugin root — a relative client path
  // resolves under the project cwd, never under pluginRoot, so it is recorded but does NOT route.
  const home = setupHome();
  // Pin the plugin root to a temp dir the client's `./scripts/build.mjs` (resolved against the
  // process cwd) can never fall under — so the assertion holds regardless of the ambient env.
  const env = { CLAUDE_PLUGIN_ROOT: join(home, "plugin-root") };
  try {
    const done = pluginSession(home, "cscript", "qa-bug", env);
    appendLines(tp(home), [
      toolUse("2026-01-01T00:00:00Z", "t1", "Bash", { command: "node ./scripts/build.mjs" }),
      toolResult("2026-01-01T00:00:01Z", "t1", true, "Exit code 1\ntheir client build broke"),
    ]);
    done();
    run(home, "finalize", { session_id: "cscript", transcript_path: tp(home) }, env);
    const rec = obsOf(home, "cscript").find((o) => o.class === "script_exit_nonzero");
    assert.ok(rec, "captured — a bare dir-name match still counts, it just does not route");
    assert.equal(rec.pluginOwned, false, "a client .mjs under scripts/ is NOT the plugin's");
    assert.equal(lastFinalize(home, "cscript").decision.observations.routing, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: recovered_error and harness_noise never route", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "soft");
    obs(home, [
      { class: "recovered_error", subject: "tool_error", code: "UNKNOWN" },
      { class: "harness_noise", subject: "bash", code: "NONE" },
    ], ["--skill", "qa-bug"]);
    done();
    run(home, "finalize", { session_id: "soft", transcript_path: tp(home) });
    const fin = lastFinalize(home, "soft");
    assert.equal(obsOf(home, "soft").length, 2, "both recorded");
    assert.equal(fin.decision.observations.routing, 0, "neither interrupts");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: a routed signature does not re-route until its occurrence count GROWS", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "grow", "project-init");
    const rec = [{ class: "self_reported_fail", subject: "access_verification", code: "AUTH_EXPIRED" }];
    obs(home, rec, ["--skill", "project-init"]);
    done();
    // turn 1 — routes, and records the count it routed at
    run(home, "finalize", { session_id: "grow", transcript_path: tp(home) });
    assert.equal(lastFinalize(home, "grow").decision.freshObsCount, 1);

    // turn 2 — a new user turn, nothing new recorded ⇒ silent (the one-shot guard)
    run(home, "prompt", { session_id: "grow", transcript_path: tp(home), prompt: "next" });
    complete(home, "project-init");
    run(home, "finalize", { session_id: "grow", transcript_path: tp(home) });
    assert.equal(lastFinalize(home, "grow").decision.freshObsCount, 0, "no re-nag on the same count");

    // turn 3 — the SAME signature recurs ⇒ it re-qualifies (a recurrence is not a duplicate)
    run(home, "prompt", { session_id: "grow", transcript_path: tp(home), prompt: "again" });
    obs(home, rec, ["--skill", "project-init"]);
    complete(home, "project-init");
    run(home, "finalize", { session_id: "grow", transcript_path: tp(home) });
    assert.equal(lastFinalize(home, "grow").decision.freshObsCount, 1, "growth re-routes");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 7: a growing NOISE tally never re-routes", () => {
  const home = setupHome();
  try {
    const done = pluginSession(home, "noisy");
    const rec = [{ class: "harness_noise", subject: "bash", code: "NONE" }];
    obs(home, rec, ["--skill", "qa-bug"]);
    done();
    run(home, "finalize", { session_id: "noisy", transcript_path: tp(home) });
    run(home, "prompt", { session_id: "noisy", transcript_path: tp(home), prompt: "more" });
    obs(home, rec, ["--skill", "qa-bug"]);
    obs(home, rec, ["--skill", "qa-bug"]);
    complete(home, "qa-bug");
    run(home, "finalize", { session_id: "noisy", transcript_path: tp(home) });
    assert.equal(lastFinalize(home, "noisy").decision.freshObsCount, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── item 8 — one info line, and cleanup asks nothing ────────────────────────

test("item 8: the cleanup note is a clause on the ONE line, never a question", () => {
  const home = setupHome();
  try {
    // a leftover artifact from another, inactive session
    const dir = join(home, ".vc-fix", "diagnostics");
    const done = pluginSession(home, "cur", "qa-env-check");
    const old = Date.now() - 3 * 3_600_000;
    writeFileSync(join(dir, "other.jsonl"), "{}\n");
    execFileSync(process.execPath, ["-e", `require("fs").utimesSync(${JSON.stringify(join(dir, "other.jsonl"))}, new Date(${old}), new Date(${old}))`]);
    done();
    const out = run(home, "finalize", { session_id: "cur", transcript_path: tp(home) });
    const reason = blockOf(out).reason || "";
    assert.doesNotMatch(reason, /Clean up vc-fix diagnostic files/, "no cleanup question");
    assert.doesNotMatch(reason, /AskUserQuestion/);
    assert.doesNotMatch(reason, /purge-inactive/, "and no deletion command is proposed");
    assert.equal(reason.split("\n").length, 1, "exactly ONE line");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 8: a findings turn is ONE instruction — no second question rides it", () => {
  const home = setupHome();
  try {
    const dir = join(home, ".vc-fix", "diagnostics");
    const done = pluginSession(home, "find", "project-init");
    const old = Date.now() - 3 * 3_600_000;
    writeFileSync(join(dir, "other.jsonl"), "{}\n");
    execFileSync(process.execPath, ["-e", `require("fs").utimesSync(${JSON.stringify(join(dir, "other.jsonl"))}, new Date(${old}), new Date(${old}))`]);
    obs(home, [{ class: "self_reported_fail", subject: "access_verification", code: "AUTH_EXPIRED" }], ["--skill", "project-init"]);
    done();
    const out = run(home, "finalize", { session_id: "find", transcript_path: tp(home) });
    const reason = blockOf(out).reason || "";
    assert.match(reason, /vc-self-check/, "the diagnostician is still armed");
    assert.doesNotMatch(reason, /Clean up vc-fix diagnostic files/, "the cleanup question does not compete with it");
    assert.doesNotMatch(reason, /purge-inactive/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── item 9 — the diagnostician SUBAGENT does not trigger itself ──────────────
// A self-check run (its command span + the diagnostician subagent) must never arm a FRESH
// self-check on that same session — otherwise a client's diagnosis diagnoses its own diagnosis.
// The non-trigger can present as either `self-check-session` (the seen latch) or
// `no-plugin-activity` (a pure self-check turn carries no diagnosable plugin work) — both are
// correct; what matters is that no new diagnostician is armed.
const NON_TRIGGER = new Set(["self-check-session", "no-plugin-activity"]);

test("item 9: spawning the self-check-diagnostician subagent never arms a fresh self-check", () => {
  const home = setupHome();
  try {
    const sid = "diag-subagent";
    run(home, "init", { session_id: sid, transcript_path: tp(home) });
    run(home, "prompt", { session_id: sid, transcript_path: tp(home), prompt: "/vc-self-check latest" });
    appendLines(tp(home), [
      toolUse("2026-01-01T00:00:00Z", "t1", "Task", { subagent_type: "self-check-diagnostician", prompt: "diagnose latest" }),
      toolResult("2026-01-01T00:00:04Z", "t1", false, "returned a finding struct"),
      // even a genuine bash error afterwards must not arm a FRESH self-check on this session
      toolUse("2026-01-01T00:00:05Z", "t2", "Bash", { command: "gh pr create" }),
      toolResult("2026-01-01T00:00:06Z", "t2", true, "permission denied: token missing scope"),
    ]);
    const out = run(home, "finalize", { session_id: sid, transcript_path: tp(home) });
    const fin = lastFinalize(home, sid);
    assert.ok(NON_TRIGGER.has(fin.decision.suppressReason), `expected a non-trigger, got ${fin.decision.suppressReason}`);
    assert.doesNotMatch(blockOf(out).reason || "", /Run the vc-self-check skill/, "no fresh diagnostician is armed");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("item 9: a self-check-diagnostician agent span is not itself flagged (loop guard)", () => {
  const home = setupHome();
  try {
    const sid = "diag-span";
    run(home, "init", { session_id: sid, transcript_path: tp(home) });
    run(home, "prompt", { session_id: sid, transcript_path: tp(home), prompt: "/vc-self-check latest" });
    appendLines(tp(home), [
      toolUse("2026-01-01T00:00:00Z", "t1", "Task", { subagent_type: "self-check-diagnostician" }),
      toolResult("2026-01-01T00:00:05Z", "t1", true, "the subagent errored internally"),
    ]);
    run(home, "finalize", { session_id: sid, transcript_path: tp(home) });
    const fin = lastFinalize(home, sid);
    // The diagnostician's own failure must not surface as a plugin finding to contribute.
    assert.equal((fin.flagged || []).some((f) => /self-check|diagnostician/i.test(f.name || "")), false);
    assert.ok(NON_TRIGGER.has(fin.decision.suppressReason), `expected a non-trigger, got ${fin.decision.suppressReason}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── VCST-5582 C4 — .vc-fix/expected.json suppresses a matching routing observation ────────
test("C4: an expected.json entry suppresses a routing observation (no tail-trigger; still recorded)", () => {
  const home = setupHome();
  try {
    mkdirSync(join(home, ".vc-fix"), { recursive: true }), writeFileSync(join(home, ".vc-fix", "expected.json"), JSON.stringify([
      { class: "degraded_artifact", subject: "profile_shape", reason: "planted regression fixture (VCST-5582 E)" },
    ]));
    const done = pluginSession(home, "supp", "project-init");
    obs(home, [{ class: "degraded_artifact", subject: "profile_shape", code: "NONE" }], ["--skill", "project-init"]);
    done();
    run(home, "finalize", { session_id: "supp", transcript_path: tp(home) });
    const fin = lastFinalize(home, "supp");
    assert.equal(obsOf(home, "supp").length, 1, "still captured in full — suppression is a ROUTING decision, not retention");
    assert.notEqual(fin.decision.surfaceDecision, "tail-trigger", "the expected observation does not arm the diagnostician");
    assert.equal(fin.decision.suppressedByExpected, 1);
    assert.equal(fin.decision.expectedActive, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("C4: a NON-matching expected.json entry does NOT suppress a real routing observation", () => {
  const home = setupHome();
  try {
    mkdirSync(join(home, ".vc-fix"), { recursive: true }), writeFileSync(join(home, ".vc-fix", "expected.json"), JSON.stringify([
      { class: "degraded_artifact", subject: "some_other_subject", reason: "unrelated" },
    ]));
    const done = pluginSession(home, "nomatch", "project-init");
    obs(home, [{ class: "degraded_artifact", subject: "profile_shape", code: "NONE" }], ["--skill", "project-init"]);
    done();
    run(home, "finalize", { session_id: "nomatch", transcript_path: tp(home) });
    const fin = lastFinalize(home, "nomatch");
    assert.equal(fin.decision.surfaceDecision, "tail-trigger", "a real defect still routes past an unrelated suppression");
    assert.equal(fin.decision.expectedActive, 1, "the active-suppression count is still reported (forgotten-entry safety)");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("C4: an EXPIRED expected.json entry does not suppress (auto-retires)", () => {
  const home = setupHome();
  try {
    mkdirSync(join(home, ".vc-fix"), { recursive: true }), writeFileSync(join(home, ".vc-fix", "expected.json"), JSON.stringify([
      { class: "degraded_artifact", subject: "profile_shape", reason: "old fixture", expires: "2000-01-01T00:00:00Z" },
    ]));
    const done = pluginSession(home, "expd", "project-init");
    obs(home, [{ class: "degraded_artifact", subject: "profile_shape", code: "NONE" }], ["--skill", "project-init"]);
    done();
    run(home, "finalize", { session_id: "expd", transcript_path: tp(home) });
    const fin = lastFinalize(home, "expd");
    assert.equal(fin.decision.surfaceDecision, "tail-trigger", "an expired suppression is inert");
    assert.equal(fin.decision.expectedActive, undefined, "no active suppressions");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
