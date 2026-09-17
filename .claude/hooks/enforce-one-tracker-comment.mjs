#!/usr/bin/env node
// PreToolUse hook — enforces the GOLDEN RULE mechanically, for an agent that
// never read it.
//
// Rule source: .claude/knowledge/execution/tracker-ops.md §0 — ONE tracker
// comment per ticket per run; amend it, never append.
//
// WHY A HOOK AND NOT JUST THE RULE. tracker-ops.md §5a already banned Jira wiki
// markup, with a ticket reference, and a run broke it anyway on 2026-09-17 —
// because it never opened the file. The same run posted FIVE comments to one
// ticket in an hour, each individually defensible, collectively spam. A rule
// addressed to judgment-in-the-moment cannot catch a failure of
// judgment-in-the-moment. This is the layer that binds regardless.
//
// It blocks the SECOND `addCommentToJiraIssue` for a ticket within one session,
// and tells the caller how to amend instead. The first post is never blocked.
//
// Ledger: .tracker-comments.json, written by scripts/tracker/comment.mjs and by
// the PostToolUse recorder (record-tracker-comment.mjs).
//
// Fails OPEN on any error — a hook bug must never block legitimate work.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const tool = event.tool_name ?? "";

  // Jira via MCP is the only path this hook can see. The helper script guards itself.
  if (!/^mcp__atlassian__addCommentToJiraIssue$/.test(tool)) process.exit(0);

  const ticket = event.tool_input?.issueIdOrKey;
  if (!ticket) process.exit(0);

  let ledger = {};
  try { ledger = JSON.parse(readFileSync(resolve(ROOT, ".tracker-comments.json"), "utf8")); } catch { process.exit(0); }

  const entry = ledger[ticket];
  if (!entry) process.exit(0);

  // "per run" = per Claude Code session, so a genuinely NEW run gets its own comment.
  //
  // But the two writers disagree about identity: the helper script runs from a shell,
  // where CLAUDE_SESSION_ID is not exported, so it stores run_id "local"; this hook sees
  // the event's real session id. A naive equality check therefore ALLOWED the exact
  // incident sequence — post via the helper, then post again through the MCP (measured
  // 2026-09-17, before this guard). Treat "local" (and a missing session id) as "cannot
  // prove it was a different run", and block: over-blocking costs one --force-new with a
  // reason, under-blocking costs the notification storm this rule exists to stop.
  const thisRun = event.session_id ?? process.env.CLAUDE_SESSION_ID ?? null;
  const provablyDifferentRun = thisRun && entry.run_id && entry.run_id !== "local" && entry.run_id !== thisRun;
  if (provablyDifferentRun) process.exit(0);

  const reason =
    `GOLDEN RULE (.claude/knowledge/execution/tracker-ops.md §0): ${ticket} already has a comment ` +
    `from this run — comment_id ${entry.comment_id}, posted ${entry.posted_at}.\n\n` +
    `A ticket is a shared inbox: a second comment interrupts the assignee, the reporter and every ` +
    `watcher again, and leaves them to work out which version is current.\n\n` +
    `AMEND that comment instead — new evidence, a retraction, a severity change and a formatting ` +
    `fix are all edits:\n` +
    `  npm run tracker:comment -- --ticket ${ticket} --amend ${entry.comment_id} --body-file <path>\n\n` +
    `If the operator has asked for a genuinely separate comment, say so and pass a reason:\n` +
    `  npm run tracker:comment -- --ticket ${ticket} --body-file <path> --force-new "<reason>"`;

  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
} catch (err) {
  process.stderr.write(`enforce-one-tracker-comment hook error: ${err?.message ?? err}\n`);
  process.exit(0);
}
