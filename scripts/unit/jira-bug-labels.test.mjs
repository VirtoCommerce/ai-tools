// Unit tests for the origin labels on bugs Claude files (scripts/lib/jira-bug-labels.mjs) and the
// PreToolUse hook that enforces them (.claude/hooks/enforce-bug-labels.mjs).
// Rule: .claude/knowledge/execution/tracker-ops.md §Labels on bugs Claude files.
// Run: `npx tsx --test scripts/unit/jira-bug-labels.test.mjs` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

function runHook(input) {
  return spawnSync(process.execPath, [HOOK], { input, encoding: "utf8" });
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
