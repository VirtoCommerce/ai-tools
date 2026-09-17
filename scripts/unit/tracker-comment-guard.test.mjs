// Tests for the GOLDEN RULE enforcement layer — ONE tracker comment per ticket
// per run (.claude/knowledge/execution/tracker-ops.md §0).
//
// WHY THESE EXIST. The rule was written after a run posted FIVE comments to one
// ticket in an hour (VCST-5378, 2026-09-17). A written rule was not enough: that
// same run also broke tracker-ops.md §5a's existing "Markdown, not wiki markup"
// ban, because it never opened the file. So the rule is enforced by a PreToolUse
// hook and a helper script, and what is tested here is the DERIVATION — the
// allow/block decision and the ledger bookkeeping — not the rule text.
//
// The hooks are driven as child processes over stdin, exactly as Claude Code
// invokes them. No network is reached: the helper is only exercised on paths that
// die in its own guards, before any request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRE = join(ROOT, ".claude/hooks/enforce-one-tracker-comment.mjs");
const POST = join(ROOT, ".claude/hooks/record-tracker-comment.mjs");
const HELPER = join(ROOT, "scripts/tracker/comment.mjs");

/** Run a hook in an isolated CLAUDE_PROJECT_DIR so the real ledger is never touched. */
function runHook(file, payload, dir) {
  try {
    return execFileSync("node", [file], {
      input: typeof payload === "string" ? payload : JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
  } catch (e) {
    return `THREW: ${e.message}`;
  }
}

function tempProject(t) {
  const dir = join(ROOT, `.fix-workspace/.tracker-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const ledgerPath = (dir) => join(dir, ".tracker-comments.json");
const seed = (dir, obj) => writeFileSync(ledgerPath(dir), JSON.stringify(obj, null, 2));
const readLedger = (dir) => (existsSync(ledgerPath(dir)) ? JSON.parse(readFileSync(ledgerPath(dir), "utf8")) : {});

const commentEvent = (ticket, session) => ({
  tool_name: "mcp__atlassian__addCommentToJiraIssue",
  tool_input: { issueIdOrKey: ticket, commentBody: "body" },
  session_id: session,
});

test("PreToolUse: the FIRST comment of a run is allowed", (t) => {
  const dir = tempProject(t);
  assert.equal(runHook(PRE, commentEvent("VCST-1", "run-A"), dir).trim(), "");
});

test("PreToolUse: a SECOND comment for the same ticket in the same run is blocked", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "109824", run_id: "run-A", posted_at: "2026-09-17T13:00:00Z" } });
  const out = JSON.parse(runHook(PRE, commentEvent("VCST-1", "run-A"), dir));
  assert.equal(out.decision, "block");
  // the block must be actionable: it names the exact amend invocation
  assert.match(out.reason, /--amend 109824/);
  assert.match(out.reason, /tracker-ops\.md §0/);
});

test("PreToolUse: a NEW run gets its own comment", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "109824", run_id: "run-A", posted_at: "x" } });
  assert.equal(runHook(PRE, commentEvent("VCST-1", "run-B"), dir).trim(), "");
});

test("PreToolUse: a different ticket in the same run is allowed", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "109824", run_id: "run-A", posted_at: "x" } });
  assert.equal(runHook(PRE, commentEvent("VCST-2", "run-A"), dir).trim(), "");
});

test("PreToolUse: unrelated tools are ignored", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "1", run_id: "run-A", posted_at: "x" } });
  assert.equal(runHook(PRE, { tool_name: "Edit", tool_input: {}, session_id: "run-A" }, dir).trim(), "");
});

test("PreToolUse: malformed input fails OPEN — a hook bug never blocks work", (t) => {
  const dir = tempProject(t);
  assert.ok(!runHook(PRE, "not json", dir).includes('"decision":"block"'));
});

test("PostToolUse: records the comment id so the guard has state", (t) => {
  const dir = tempProject(t);
  runHook(POST, { ...commentEvent("VCST-1", "run-A"), tool_response: { id: "109824" } }, dir);
  assert.equal(readLedger(dir)["VCST-1"].comment_id, "109824");
  assert.equal(readLedger(dir)["VCST-1"].run_id, "run-A");
});

test("PostToolUse: keeps the FIRST comment of a run — the one everything amends", (t) => {
  const dir = tempProject(t);
  runHook(POST, { ...commentEvent("VCST-1", "run-A"), tool_response: { id: "111" } }, dir);
  runHook(POST, { ...commentEvent("VCST-1", "run-A"), tool_response: { id: "222" } }, dir);
  assert.equal(readLedger(dir)["VCST-1"].comment_id, "111");
});

test("PostToolUse: handles a stringified tool_response", (t) => {
  const dir = tempProject(t);
  runHook(POST, { ...commentEvent("VCST-1", "r"), tool_response: JSON.stringify({ id: "555" }) }, dir);
  assert.equal(readLedger(dir)["VCST-1"].comment_id, "555");
});

// --- helper script: guards that must fire before any network call -----------
function runHelper(args, dir) {
  try {
    return execFileSync("node", [HELPER, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
  } catch (e) {
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

test("helper: refuses a second post in the same run and prints the amend command", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "109824", run_id: "local", posted_at: "x" } });
  const out = runHelper(["--ticket", "VCST-1", "--body", "hello", "--dry-run"], dir);
  assert.match(out, /GOLDEN RULE/);
  assert.match(out, /--amend 109824/);
});

test("helper: --force-new overrides the guard and records the reason", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "109824", run_id: "local", posted_at: "x" } });
  const out = runHelper(["--ticket", "VCST-1", "--body", "hello", "--dry-run", "--force-new", "PO asked"], dir);
  assert.match(out, /force-new: PO asked/);
});

test("helper: rejects a Jira WIKI markup body (tracker-ops.md §5a, VCST-5212)", (t) => {
  const dir = tempProject(t);
  const out = runHelper(["--ticket", "VCST-1", "--body", "h1. Title\n{code}x{code}", "--dry-run"], dir);
  assert.match(out, /WIKI markup/);
});

// --- Jira body format: wiki markup in a Markdown Jira (tracker-ops.md §5a) ---
// The incident: VCST-5378 comment 109823, a whole report posted as h2./||/{code},
// 200 OK, rendered as literal text. Detection must be NARROW — §5c REQUIRES wiki
// image syntax, and {{VAR}} is the repo's test-data token syntax.
import { findWikiMarkup, wikiMarkupRefusal } from "../lib/jira-body-format.mjs";

const FORMAT_HOOK = join(ROOT, ".claude/hooks/enforce-jira-markdown.mjs");

test("format: flags h1.–h6. headings", () => {
  assert.equal(findWikiMarkup("h2. My heading\nbody").length, 1);
  assert.match(wikiMarkupRefusal("h2. My heading"), /h1\.–h6\. heading/);
});

test("format: flags {code} / {noformat} / {panel} blocks and || tables", () => {
  assert.ok(findWikiMarkup("{code:sql}\nselect 1\n{code}").length >= 1);
  assert.ok(findWikiMarkup("{noformat}x{noformat}").length >= 1);
  assert.ok(findWikiMarkup("{panel}x{panel}").length >= 1);
  assert.ok(findWikiMarkup("|| a || b ||\n| 1 | 2 |").length >= 1);
});

test("format: clean Markdown passes", () => {
  const md = "## Heading\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```\ncode\n```\n\n**bold** and `mono`";
  assert.deepEqual(findWikiMarkup(md), []);
  assert.equal(wikiMarkupRefusal(md), null);
});

test("format: does NOT flag Jira image syntax — §5c REQUIRES it", () => {
  assert.deepEqual(findWikiMarkup("Screenshot:\n!evidence.png|width=700!\n"), []);
});

test("format: does NOT flag {{VAR}} test-data tokens", () => {
  assert.deepEqual(findWikiMarkup("Use {{B2B_USER_PASSWORD}} from .env.local"), []);
});

test("format: does NOT flag wiki markup QUOTED inside a fenced block", () => {
  assert.deepEqual(findWikiMarkup("Do not write this:\n```\nh2. heading\n|| a || b ||\n```\n"), []);
});

test("format: the refusal names the line and the Markdown replacement", () => {
  const r = wikiMarkupRefusal("intro\n\nh3. Findings\n");
  assert.match(r, /line\s+3/);
  assert.match(r, /use `#`, `##`/);
  assert.match(r, /§5a/);
});

test("format hook: blocks a wiki-markup comment before it posts", (t) => {
  const dir = tempProject(t);
  const out = JSON.parse(runHook(FORMAT_HOOK, {
    tool_name: "mcp__atlassian__addCommentToJiraIssue",
    tool_input: { issueIdOrKey: "VCST-1", commentBody: "h2. Report\n|| a || b ||" },
    session_id: "run-A",
  }, dir));
  assert.equal(out.decision, "block");
  assert.match(out.reason, /WIKI markup/);
  assert.match(out.reason, /--amend/);   // points at amending, not re-posting
});

test("format hook: lets a clean Markdown comment through", (t) => {
  const dir = tempProject(t);
  const out = runHook(FORMAT_HOOK, {
    tool_name: "mcp__atlassian__addCommentToJiraIssue",
    tool_input: { issueIdOrKey: "VCST-1", commentBody: "## Report\n\n| a | b |\n| --- | --- |\n\n!shot.png|width=700!" },
    session_id: "run-A",
  }, dir);
  assert.equal(out.trim(), "");
});

test("format hook: fails OPEN on malformed input", (t) => {
  const dir = tempProject(t);
  assert.ok(!runHook(FORMAT_HOOK, "not json", dir).includes('"decision":"block"'));
});

// --- the run-identity gap, found by live-testing the rule 2026-09-17 -----------
// The helper runs from a shell where CLAUDE_SESSION_ID is not exported, so it stores
// run_id "local"; the hook sees the event's real session id. A naive equality check
// allowed the exact incident sequence: post via the helper, then post again via MCP.
test("PreToolUse: a helper-written 'local' entry still blocks an MCP post", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "109833", run_id: "local", posted_at: "x" } });
  const out = JSON.parse(runHook(PRE, commentEvent("VCST-1", "8bdbafab-real-session-id"), dir));
  assert.equal(out.decision, "block");
  assert.match(out.reason, /--amend 109833/);
});

test("PreToolUse: blocks when the event carries no session id at all", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "1", run_id: "run-A", posted_at: "x" } });
  const ev = commentEvent("VCST-1", undefined);
  delete ev.session_id;
  const out = runHook(PRE, ev, dir);
  assert.match(out, /"decision":"block"/);
});

test("PreToolUse: still allows a PROVABLY different run", (t) => {
  const dir = tempProject(t);
  seed(dir, { "VCST-1": { comment_id: "1", run_id: "run-A", posted_at: "x" } });
  assert.equal(runHook(PRE, commentEvent("VCST-1", "run-B"), dir).trim(), "");
});
