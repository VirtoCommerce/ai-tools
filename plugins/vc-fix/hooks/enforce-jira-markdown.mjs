#!/usr/bin/env node
// PreToolUse hook — blocks a Jira comment written in WIKI markup before it posts.
//
// Rule source: knowledge/execution/tracker-ops.md §5a — Markdown, NOT
// Jira wiki markup (VCST-5212).
//
// WHY A HOOK. That rule already existed, with a ticket reference, and a run broke
// it anyway on 2026-09-17: a whole findings report went up as `h2.` / `||` /
// `{code}` (VCST-5378 comment 109823) and rendered as literal text. Wiki markup in
// a Markdown Jira fails SILENTLY — the API returns 200 OK and the reader sees
// garbage — so nothing in the posting path catches it. The author only finds out
// when a teammate says the comment is unreadable, and by then the notification has
// already gone out and the comment cannot be deleted through the MCP.
//
// Detection is deliberately narrow (scripts/lib/jira-body-format.mjs): image
// syntax `!file.png|width=700!` is REQUIRED by §5c and `{{VAR}}` is the repo's
// test-data token syntax — neither is flagged.
//
// Fails OPEN on any error — a hook bug must never block legitimate work.

import { readFileSync } from "node:fs";
import { wikiMarkupRefusal } from "../scripts/lib/jira-body-format.mjs";

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  if ((event.tool_name ?? "") !== "mcp__atlassian__addCommentToJiraIssue") process.exit(0);

  const body = event.tool_input?.commentBody;
  if (typeof body !== "string" || !body) process.exit(0);

  const refusal = wikiMarkupRefusal(body);
  if (!refusal) process.exit(0);

  process.stdout.write(JSON.stringify({
    decision: "block",
    reason:
      `${refusal}\n\n` +
      `    Convert the body to Markdown and post again. If you have already posted a wiki-markup\n` +
      `    comment, AMEND it rather than adding a corrected copy (§0):\n` +
      `      REST PUT to /rest/api/3/issue/<KEY>/comment/<id> — recipe in`,
      `      knowledge/execution/tracker-ops.md §0a (the Atlassian MCP has no edit tool).`,
  }));
  process.exit(0);
} catch (err) {
  process.stderr.write(`enforce-jira-markdown hook error: ${err?.message ?? err}\n`);
  process.exit(0);
}
