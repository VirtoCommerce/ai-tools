// The knowledge guard hook (VCST-5818) — PreToolUse escalation and its two exemptions.
//
// The guard's job is to make the resolver the only door; its RISK is that a hook which
// blocks work can wreck a session. So two things are tested with equal weight: that the
// escalation actually escalates, and that every degenerate input still ends in "allow".
//
// The Bash-less-subagent exemption is not a nicety. An agent without Bash cannot run the
// resolver, so denying it a read leaves it with no path forward at all — it cannot unblock
// itself. Detection is best-effort and errs toward NOT denying, which is why the test
// asserts the DENY threshold degrades to "context" rather than that detection is perfect.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { HOOKS_DIR, withTempDir, hookModule } from "./_kb-helpers.mjs";

const { classify, classifyAccess, isBashlessSubagent, renderDecision, loadConfig, readState, writeState, DEFAULT_CONFIG } =
  await hookModule("kb-guard.mjs");

const CONFIG = DEFAULT_CONFIG;
const grep = (overrides) => Object.assign({
  session_id: "s1",
  tool_name: "Grep",
  tool_input: { pattern: "BL-CART", path: ".claude/knowledge/oracles" },
}, overrides);

/** Escalate a fresh session n times and return the last decision. */
function escalate(n, event = grep()) {
  const state = { version: 1, sessions: {} };
  let decision;
  for (let i = 0; i < n; i++) {
    decision = classify(event, CONFIG, state, {});
    state.sessions[event.session_id] = { count: decision.count, at: "now" };
  }
  return decision;
}

test("escalation states: 1 nudges, 3 gives mandatory context, 5 denies", () => {
  assert.equal(escalate(1).action, "nudge");
  assert.equal(escalate(2).action, "nudge");
  assert.equal(escalate(3).action, "context");
  assert.equal(escalate(4).action, "context");
  assert.equal(escalate(5).action, "deny");
  assert.equal(escalate(9).action, "deny");
  assert.equal(escalate(5).count, 5);
});

test("the count is per session, so one session's searches never deny another", () => {
  const state = { version: 1, sessions: { other: { count: 9, at: "now" } } };
  const decision = classify(grep({ session_id: "mine" }), CONFIG, state, {});
  assert.equal(decision.action, "nudge");
  assert.equal(decision.count, 1);
});

test("only a knowledge access is counted", () => {
  const state = { version: 1, sessions: {} };
  const elsewhere = classify(grep({ tool_input: { pattern: "TODO", path: "src/components" } }), CONFIG, state, {});
  assert.equal(elsewhere.action, "allow");
  assert.equal(elsewhere.counted, false);

  assert.equal(classifyAccess({ tool_name: "Edit", tool_input: { file_path: ".knowledge/platform/confirmed/x.md" } }, CONFIG).hit, false,
    "the guard governs READS that bypass the resolver, not writes");
});

test("a Grep or Glob over a knowledge root is a bypass; a Bash search over one is too", () => {
  assert.equal(classifyAccess(grep(), CONFIG).hit, true);
  assert.equal(classifyAccess({ tool_name: "Glob", tool_input: { pattern: ".knowledge/**/*.md" } }, CONFIG).hit, true);
  assert.equal(classifyAccess({ tool_name: "Bash", tool_input: { command: 'grep -r "BL-CART" .knowledge/platform' } }, CONFIG).hit, true);
  assert.equal(classifyAccess({ tool_name: "Bash", tool_input: { command: "npm test" } }, CONFIG).hit, false);
  assert.equal(classifyAccess({ tool_name: "Bash", tool_input: { command: "grep -r TODO src/" } }, CONFIG).hit, false);
});

test("invoking the resolver is never counted against the caller — it IS the door", () => {
  const viaNpm = { tool_name: "Bash", tool_input: { command: 'npm run kb:resolve -- --topic "cart tax" --platform-root .knowledge/platform' } };
  assert.equal(classifyAccess(viaNpm, CONFIG).hit, false);
  const viaNode = { tool_name: "Bash", tool_input: { command: "node plugins/vc-fix/skills/kb/resolve.mjs \"@kb(BL-CART-010)\" --platform-root .knowledge/platform" } };
  assert.equal(classifyAccess(viaNode, CONFIG).hit, false);
});

test("contract by-name reads are exempt, and a raw knowledge read is not", () => {
  const exemptIndex = { tool_name: "Read", tool_input: { file_path: ".knowledge/platform/knowledge-index.json" } };
  const exemptBrain = { tool_name: "Read", tool_input: { file_path: ".knowledge/client/brain.json" } };
  const exemptDir = { tool_name: "Read", tool_input: { file_path: ".knowledge/platform/exam/goldens.json" } };
  for (const e of [exemptIndex, exemptBrain, exemptDir]) {
    const access = classifyAccess(e, CONFIG);
    assert.equal(access.hit, false, e.tool_input.file_path + " should be exempt");
    assert.equal(access.byName, true);
  }
  const raw = { tool_name: "Read", tool_input: { file_path: ".knowledge/platform/confirmed/BL-CART-010.md" } };
  assert.equal(classifyAccess(raw, CONFIG).hit, true);

  const state = { version: 1, sessions: { s1: { count: 9, at: "now" } } };
  assert.equal(classify(exemptIndex, CONFIG, state, {}).action, "allow", "an exempt read never denies, whatever the count");
});

test("exempt directories are project-configurable", async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, "project-profile.json"), JSON.stringify({ knowledge: { guard: { exemptDirs: ["contracts/"] } } }), "utf8");
    const config = loadConfig(dir);
    assert.deepEqual(config.exemptDirs, ["contracts/"]);
    assert.equal(classifyAccess({ tool_name: "Read", tool_input: { file_path: ".knowledge/platform/contracts/api.md" } }, config).hit, false);
    // Everything else keeps its default.
    assert.equal(config.escalation.deny, 5);
  });
});

test("a Bash-less subagent is never denied — it cannot unblock itself", () => {
  const sub = grep({ session_id: "sub", is_sidechain: true });
  assert.equal(isBashlessSubagent(sub, CONFIG), true);

  const state = { version: 1, sessions: { sub: { count: 8, at: "now" } } };
  const decision = classify(sub, CONFIG, state, {});
  assert.equal(decision.action, "context", "the escalation stops one rung short of deny");
  assert.equal(decision.exemption, "bashless-subagent");

  // The main session, with the same count, IS denied.
  const main = grep({ session_id: "main" });
  assert.equal(classify(main, CONFIG, { version: 1, sessions: { main: { count: 8, at: "now" } } }, {}).action, "deny");
});

test("a named agent on the configured bash-less list is exempt even without a sidechain marker", () => {
  const config = Object.assign({}, CONFIG, { assumeSubagentsBashless: false, bashlessAgents: ["doc-reader"] });
  assert.equal(isBashlessSubagent({ agent_type: "doc-reader" }, config), true);
  assert.equal(isBashlessSubagent({ agent_type: "shell-capable" }, config), false);
  assert.equal(isBashlessSubagent({}, config), false);
});

test("the env opt-out short-circuits everything", () => {
  const state = { version: 1, sessions: { s1: { count: 99, at: "now" } } };
  const decision = classify(grep(), CONFIG, state, { VC_FIX_KB_GUARD: "off" });
  assert.equal(decision.action, "allow");
  assert.equal(decision.exemption, "env-opt-out");
  assert.equal(decision.counted, false);
  assert.equal(classify(grep(), CONFIG, state, { VC_FIX_KB_GUARD: "OFF" }).action, "allow");
});

test("the config opt-out disables the guard for a whole project", () => {
  const config = Object.assign({}, CONFIG, { enabled: false });
  const state = { version: 1, sessions: { s1: { count: 99, at: "now" } } };
  assert.equal(classify(grep(), config, state, {}).exemption, "config-opt-out");
});

test("the rendered payloads match the PreToolUse contract", () => {
  assert.equal(renderDecision({ action: "allow" }), "");
  const nudge = JSON.parse(renderDecision({ action: "nudge" }));
  assert.equal(nudge.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.match(nudge.hookSpecificOutput.additionalContext, /kb:resolve/);
  const context = JSON.parse(renderDecision({ action: "context" }));
  assert.match(context.hookSpecificOutput.additionalContext, /explicit MISS/);
  const deny = JSON.parse(renderDecision({ action: "deny" }));
  assert.equal(deny.decision, "block");
  assert.match(deny.reason, /ask the brain first/);
  assert.match(deny.reason, /VC_FIX_KB_GUARD=off/, "a blocked caller is told how to opt out");
});

test("state survives a round trip and is bounded", async () => {
  await withTempDir(async (dir) => {
    const state = { version: 1, sessions: {} };
    for (let i = 0; i < 25; i++) state.sessions["s" + i] = { count: 1, at: "2026-08-" + String(i + 1).padStart(2, "0") };
    writeState(dir, state, Object.assign({}, CONFIG, { maxSessions: 5 }));
    const back = readState(dir);
    assert.equal(Object.keys(back.sessions).length, 5, "the state file is a counter, not a log");
    assert.ok(existsSync(join(dir, ".vc-fix", "kb-guard-state.json")));
  });
});

test("a corrupt state file or profile degrades to defaults instead of throwing", async () => {
  await withTempDir(async (dir) => {
    mkdirSync(join(dir, ".vc-fix"), { recursive: true });
    writeFileSync(join(dir, ".vc-fix", "kb-guard-state.json"), "{ not json", "utf8");
    writeFileSync(join(dir, "project-profile.json"), "also not json", "utf8");
    assert.deepEqual(readState(dir), { version: 1, sessions: {} });
    assert.equal(loadConfig(dir).escalation.deny, 5);
  });
});

test("the hook fails open on every degenerate input", () => {
  const script = join(HOOKS_DIR, "kb-guard.mjs");
  const run = (input) => execFileSync(process.execPath, [script], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  assert.equal(run(""), "", "no stdin at all");
  assert.equal(run("not json"), "", "unparsable stdin");
  assert.equal(run("{}"), "", "an event with no tool");
  assert.equal(run(JSON.stringify({ tool_name: "Grep", tool_input: null })), "", "a null tool_input");
  assert.equal(run(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "src/index.ts" } })), "", "an unrelated read");
});

test("the hook counts a real bypass and writes its state under the event cwd", async () => {
  await withTempDir(async (dir) => {
    const script = join(HOOKS_DIR, "kb-guard.mjs");
    const event = JSON.stringify({ session_id: "hooked", cwd: dir, tool_name: "Grep", tool_input: { pattern: "BL-", path: ".knowledge/platform" } });
    const out = execFileSync(process.execPath, [script], { input: event, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    assert.match(out, /additionalContext/);
    const state = JSON.parse(readFileSync(join(dir, ".vc-fix", "kb-guard-state.json"), "utf8"));
    assert.equal(state.sessions.hooked.count, 1);
    assert.equal(state.sessions.hooked.lastAction, "nudge");
  });
});
