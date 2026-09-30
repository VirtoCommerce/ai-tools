// Unit tests for the origin labels on bugs Claude files (scripts/lib/jira-bug-labels.mjs) and the
// PreToolUse hook that enforces them (.claude/hooks/enforce-bug-labels.mjs).
// Rule: .claude/knowledge/execution/tracker-ops.md §Labels on bugs Claude files.
// Run: `npx tsx --test scripts/unit/jira-bug-labels.test.mjs` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bugLabelRefusal } from "../lib/jira-bug-labels.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".claude/hooks/enforce-bug-labels.mjs");
const CREATE = "mcp__Atlassian_Rovo__createJiraIssue";
const bug = (labels) => ({ projectKey: "VCST", issueTypeName: "Bug", summary: "x", additional_fields: { labels } });

test("valid label sets pass: an agent finding with its origin, or a human report alone", () => {
  assert.equal(bugLabelRefusal(CREATE, bug(["found-by-agent", "found-in-regression", "xapi"])), null);
  assert.equal(bugLabelRefusal(CREATE, bug(["found-by-agent", "found-in-testing"])), null);
  assert.equal(bugLabelRefusal(CREATE, bug(["reported-by-human"])), null);
});

test("who found it is required", () => {
  assert.match(bugLabelRefusal(CREATE, bug([])), /must say who found it/);
  assert.match(bugLabelRefusal(CREATE, bug(["found-in-testing"])), /must say who found it/);
});

test("an agent finding needs exactly one origin", () => {
  assert.match(bugLabelRefusal(CREATE, bug(["found-by-agent"])), /needs when it was found/);
  assert.match(bugLabelRefusal(CREATE, bug(["found-by-agent", "found-in-testing", "found-in-regression"])), /not both/);
});

test("agent and human at once are refused", () => {
  assert.match(bugLabelRefusal(CREATE, bug(["found-by-agent", "reported-by-human", "found-in-testing"])), /cannot be both/);
});

test("non-bugs and other tools are not touched", () => {
  assert.equal(bugLabelRefusal(CREATE, { ...bug([]), issueTypeName: "Task" }), null);
  assert.equal(bugLabelRefusal("mcp__atlassian__addCommentToJiraIssue", bug([])), null);
  assert.equal(bugLabelRefusal("mcp__Atlassian_MCP__executeWrite", { name: "editJiraIssue", inputs: bug([]) }), null);
});

test("the executeWrite route and the other label locations are read", () => {
  assert.match(bugLabelRefusal("mcp__Atlassian_MCP__executeWrite", { name: "createJiraIssue", inputs: bug([]) }), /who found it/);
  const viaFields = { projectKey: "VCST", fields: { issuetype: { name: "bug" }, labels: ["reported-by-human"] } };
  assert.equal(bugLabelRefusal(CREATE, viaFields), null);
});

test("the settings.json matcher fires on every Atlassian connector's create tools, and nothing else", () => {
  const settings = JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8"));
  const entry = settings.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes("enforce-bug-labels")));
  const matcher = new RegExp(entry.matcher);
  for (const server of ["atlassian", "Atlassian_Rovo", "Atlassian_MCP", "claude_ai_Atlassian_MCP"]) {
    assert.ok(matcher.test(`mcp__${server}__createJiraIssue`), `${server} createJiraIssue`);
    assert.ok(matcher.test(`mcp__${server}__executeWrite`), `${server} executeWrite`);
  }
  assert.ok(!matcher.test("mcp__claude_ai_Atlassian_MCP__editJiraIssue"));
  assert.ok(!matcher.test("mcp__github__create_issue"));
});

test("the claude.ai connector's own shape — issueType + top-level labels — is read", () => {
  const input = { projectKey: "VCST", issueType: "Bug", summary: "x", labels: ["found-by-agent", "found-in-testing"] };
  assert.equal(bugLabelRefusal("mcp__claude_ai_Atlassian_MCP__createJiraIssue", input), null);
  assert.match(bugLabelRefusal("mcp__claude_ai_Atlassian_MCP__createJiraIssue", { ...input, labels: ["xapi"] }), /who found it/);
});

test("labels from every location are combined; an empty array in one does not hide another", () => {
  const split = { issueType: "Bug", labels: ["vc-fix", "qa-autofix"], additional_fields: { labels: ["found-by-agent", "found-in-testing"] } };
  assert.equal(bugLabelRefusal(CREATE, split), null);
  const emptyFirst = { issueType: "Bug", labels: ["reported-by-human"], additional_fields: { labels: [] } };
  assert.equal(bugLabelRefusal(CREATE, emptyFirst), null);
});

test("a Sub-task is checked when it is a bug report, and left alone when it is not", () => {
  const subtask = (extra) => ({ projectKey: "VCST", issueType: "Sub-task", parent: "VCST-1", summary: "x", ...extra });
  const report = "## Steps\n1. go\n\n## Fix Routing (→ /qa-fix)\n- **Owning layer:** Layer 1";
  assert.match(bugLabelRefusal(CREATE, subtask({ description: report })), /who found it/);
  assert.match(bugLabelRefusal(CREATE, subtask({ labels: ["found-by-agent"] })), /needs when it was found/);
  assert.equal(bugLabelRefusal(CREATE, subtask({ description: report, labels: ["found-by-agent", "found-in-testing"] })), null);
  assert.equal(bugLabelRefusal(CREATE, subtask({ description: "As a buyer I want to…" })), null, "a story sub-task");
});

test("a client deployment is never checked", () => {
  assert.equal(bugLabelRefusal(CREATE, bug([]), { projectType: "client" }), null);
  assert.match(bugLabelRefusal(CREATE, bug([]), { projectType: "platform" }), /who found it/);
});

function runHook(input) {
  // No profile file ⇒ the platform defaults, whatever this machine's own project-profile.json says.
  const env = { ...process.env, PROJECT_PROFILE_PATH: join(ROOT, "no-such-profile.json") };
  return spawnSync(process.execPath, [HOOK], { input, encoding: "utf8", env });
}

test("the hook blocks an unlabelled bug and lets a labelled one through", () => {
  const blocked = runHook(JSON.stringify({ tool_name: CREATE, tool_input: bug(["found-by-agent"]) }));
  assert.equal(blocked.status, 0);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  const allowed = runHook(JSON.stringify({ tool_name: CREATE, tool_input: bug(["found-by-agent", "found-in-testing"]) }));
  assert.equal(allowed.stdout, "");
});

test("the hook fails open on a malformed event", () => {
  const r = runHook("not json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
