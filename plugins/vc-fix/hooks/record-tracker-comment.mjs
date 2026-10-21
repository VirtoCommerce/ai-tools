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

// The run's env, as scripts/lib/resolve-test-env.js resolves it — TEST_ENV, else this session's binding
// (.vc-fix/session-env/<session id>, `npm run env:use`), else .env.test-env, else vcst — inline, because a hook
// runs without node_modules. The ledger keys an entry by ticket AND env: one ticket tested on two envs is two
// runs, each with its own comment. An entry written before the env joined the key is the ticket alone.
function runEnv(sessionId) {
  const fromEnv = process.env.TEST_ENV?.trim();
  if (fromEnv) return fromEnv;
  const read = (f) => { try { return /^\s*TEST_ENV\s*=\s*["']?([a-z0-9_]+)/m.exec(readFileSync(f, "utf8"))?.[1]; } catch { return undefined; } };
  const sid = sessionId ?? process.env.CLAUDE_CODE_SESSION_ID;
  return (sid && /^[A-Za-z0-9-]+$/.test(sid) && read(resolve(ROOT, ".vc-fix", "session-env", sid))) || read(resolve(ROOT, ".env.test-env")) || "vcst";
}

// Every Atlassian server id: a claude.ai connector registers as mcp__<uuid>__…, and
// addOrEditJiraIssueComment / addCommentToJiraIssue{commentId} EDIT (issue #360).
const TOOL = /^mcp__.+__(addCommentToJiraIssue|addOrEditJiraIssueComment)$/;
// Same default as scripts/tracker/round-guard.mjs ROUND_HOURS_DEFAULT — a plugin hook cannot import it.
const ROUND_HOURS = Number(process.env.TRACKER_ROUND_HOURS) > 0 ? Number(process.env.TRACKER_ROUND_HOURS) : 12;
const isStale = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) && (Date.now() - t) / 3_600_000 >= ROUND_HOURS; };

/** The MCP result may arrive as an object or as a JSON string. */
function commentIdFrom(response) {
  if (!response) return null;
  let r = response;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { return null; } }
  if (r?.id ?? r?.commentId) return String(r.id ?? r.commentId);
  // some harnesses wrap the payload in content[].text
  const text = Array.isArray(r?.content) ? r.content.map(c => c?.text).filter(Boolean).join("") : null;
  if (text) { try { const p = JSON.parse(text); return String(p.id ?? p.commentId ?? "") || null; } catch { return null; } }
  return null;
}

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  if (!TOOL.test(event.tool_name ?? "")) process.exit(0);

  const ticket = event.tool_input?.issueIdOrKey;
  if (!ticket) process.exit(0);
  if (event.tool_input?.commentId) process.exit(0); // an edit is not a new comment

  const id = commentIdFrom(event.tool_response ?? event.tool_result);
  if (!id) process.exit(0);

  const run = event.session_id ?? process.env.CLAUDE_SESSION_ID ?? "local";

  let ledger = {};
  try { ledger = JSON.parse(readFileSync(LEDGER, "utf8")); } catch { /* first write */ }

  // keep the FIRST comment of a round — that is the one everything else amends. A stale
  // entry is a previous round, so the guard let this post through and it replaces the entry.
  const key = `${ticket}@${runEnv(event.session_id)}`;
  const prior = ledger[key] ?? ledger[ticket];
  if (prior?.run_id === run && !isStale(prior?.posted_at)) process.exit(0);

  ledger[key] = { comment_id: id, run_id: run, posted_at: new Date().toISOString(), via: "mcp" };
  delete ledger[ticket];
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  process.exit(0);
} catch (err) {
  process.stderr.write(`record-tracker-comment hook error: ${err?.message ?? err}\n`);
  process.exit(0);
}
