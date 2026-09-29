#!/usr/bin/env node
// PostToolUse hook — records the comment id after a successful MCP post, so the
// PreToolUse guard has state to check.
//
// Rule source: knowledge/execution/tracker-ops.md §0.
//
// Without this the guard only binds comments posted through
// a scripted path, and a comment posted straight through the
// Atlassian MCP would leave no trace — so the NEXT one would sail through. This
// closes that loop: whichever path posts the first comment, the second is blocked.
//
// Writes .tracker-comments.json (gitignored): ticket -> {comment_id, run_id, posted_at}.
// Never overwrites an existing entry for the same ticket+run — the first comment
// of a run is the one that gets amended.
//
// Fails OPEN on any error — a hook bug must never block legitimate work.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const LEDGER = resolve(ROOT, ".tracker-comments.json");

/** The MCP result may arrive as an object or as a JSON string. */
function commentIdFrom(response) {
  if (!response) return null;
  let r = response;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { return null; } }
  if (r?.id) return String(r.id);
  // some harnesses wrap the payload in content[].text
  const text = Array.isArray(r?.content) ? r.content.map(c => c?.text).filter(Boolean).join("") : null;
  if (text) { try { return String(JSON.parse(text).id ?? "") || null; } catch { return null; } }
  return null;
}

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  if ((event.tool_name ?? "") !== "mcp__atlassian__addCommentToJiraIssue") process.exit(0);

  const ticket = event.tool_input?.issueIdOrKey;
  if (!ticket) process.exit(0);

  const id = commentIdFrom(event.tool_response ?? event.tool_result);
  if (!id) process.exit(0);

  const run = event.session_id ?? process.env.CLAUDE_SESSION_ID ?? "local";

  let ledger = {};
  try { ledger = JSON.parse(readFileSync(LEDGER, "utf8")); } catch { /* first write */ }

  // keep the FIRST comment of a run — that is the one everything else amends
  if (ledger[ticket]?.run_id === run) process.exit(0);

  ledger[ticket] = { comment_id: id, run_id: run, posted_at: new Date().toISOString(), via: "mcp" };
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  process.exit(0);
} catch (err) {
  process.stderr.write(`record-tracker-comment hook error: ${err?.message ?? err}\n`);
  process.exit(0);
}
