#!/usr/bin/env node
// PreToolUse hook — enforces the GOLDEN RULE mechanically, for an agent that
// never read it.
//
// Rule source: knowledge/execution/tracker-ops.md §0 — ONE tracker
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
// Ledger: .tracker-comments.json, written by record-tracker-comment.mjs and by
// the PostToolUse recorder (record-tracker-comment.mjs).
//
// Fails OPEN on any error — a hook bug must never block legitimate work.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// Every Atlassian server id: a claude.ai connector registers as mcp__<uuid>__…, and
// addOrEditJiraIssueComment / addCommentToJiraIssue{commentId} EDIT (issue #360).
const TOOL = /^mcp__.+__(addCommentToJiraIssue|addOrEditJiraIssueComment)$/;
// Same default as scripts/tracker/round-guard.mjs ROUND_HOURS_DEFAULT — a plugin hook cannot import it.
const ROUND_HOURS = Number(process.env.TRACKER_ROUND_HOURS) > 0 ? Number(process.env.TRACKER_ROUND_HOURS) : 12;
const isStale = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) && (Date.now() - t) / 3_600_000 >= ROUND_HOURS; };

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const tool = event.tool_name ?? "";

  // Jira via MCP is the only path this hook can see. The helper script guards itself.
  if (!TOOL.test(tool)) process.exit(0);

  const ticket = event.tool_input?.issueIdOrKey;
  if (!ticket) process.exit(0);

  let ledger = {};
  try { ledger = JSON.parse(readFileSync(resolve(ROOT, ".tracker-comments.json"), "utf8")); } catch { process.exit(0); }

  const entry = ledger[ticket];
  if (!entry) process.exit(0);

  // An EDIT through the MCP (commentId present) is not a second comment. It is allowed
  // within a round; editing a ledger comment older than ROUND_HOURS is probably a new
  // round folded into the old one — VCST-5883 — and an edit notifies nobody.
  const editId = event.tool_input?.commentId;
  if (editId) {
    if (String(editId) !== String(entry.comment_id)) process.exit(0);
    // Same over-block stance as a post: an edit from a provably different session is presumed
    // to be a new round too (a same-day retest of a new build) — round-guard.mjs OTHER_RUN_AMEND.
    const editRun = event.session_id ?? process.env.CLAUDE_SESSION_ID ?? null;
    const otherRun = Boolean(editRun && entry.run_id && entry.run_id !== "local" && entry.run_id !== editRun);
    if (!isStale(entry.posted_at) && !otherRun) process.exit(0);
    const why =
      (otherRun && !isStale(entry.posted_at)
        ? `Comment ${editId} on ${ticket} was posted by another session (${entry.posted_at}) — is this a new round? `
        : `Comment ${editId} on ${ticket} is from ${entry.posted_at} (older than ${ROUND_HOURS} h) — is this a new round? `) +
      `An edit notifies nobody. A retest of a NEW build is a new comment (tracker-ops.md §0 rule 5). ` +
      `A correction of the same round: say so to the operator and edit through the REST recipe in tracker-ops.md §0a.`;
    process.stdout.write(JSON.stringify({ decision: "block", reason: why }));
    process.exit(0);
  }

  // No artifact is visible here, so age is the round signal: an old comment means a new round.
  if (isStale(entry.posted_at)) process.exit(0);

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
    `GOLDEN RULE (knowledge/execution/tracker-ops.md §0): ${ticket} already has a comment ` +
    `from this run — comment_id ${entry.comment_id}, posted ${entry.posted_at}.\n\n` +
    `A ticket is a shared inbox: a second comment interrupts the assignee, the reporter and every ` +
    `watcher again, and leaves them to work out which version is current.\n\n` +
    `AMEND that comment instead — new evidence, a retraction, a severity change and a formatting ` +
    `fix are all edits:\n` +
    `(A retest of a NEW build is not an edit — it is a new round and gets a new comment, rule 5.)\n` +
    `  REST PUT /rest/api/3/issue/${ticket}/comment/${entry.comment_id} (Jira), or PATCH the\n` +
    `  work item's /comments/{id} endpoint (Azure Boards) — recipe in tracker-ops.md §0a, or this\n` +
    `  same MCP tool with commentId: ${entry.comment_id} where the connector supports it.\n\n` +
    `A genuinely separate comment needs the OPERATOR to ask for one, for a reason they state (§0).\n` +
    `If you cannot authenticate for the edit, you do NOT fall back to a new comment: say so and\n` +
    `hand the operator the corrected body.`;

  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
} catch (err) {
  process.stderr.write(`enforce-one-tracker-comment hook error: ${err?.message ?? err}\n`);
  process.exit(0);
}
