#!/usr/bin/env node
// PreToolUse hook — blocks creating a Jira Bug without the origin labels.
//
// Rule source: .claude/knowledge/execution/tracker-ops.md §Labels on bugs Claude files.
// Logic: scripts/lib/jira-bug-labels.mjs (shared with its unit test).
//
// WHY A HOOK. Who found a bug, and during what, is known only at the moment it is
// filed; afterwards every Claude-filed bug looks like the human reporter's own. A
// prose rule would be applied by some runs and not others, which makes the count
// it feeds (docs/bug-detection-requirements.md §10) worthless.
//
// Fails OPEN on any error — a hook bug must never block legitimate work.

import { readFileSync } from "node:fs";
import { bugLabelRefusal } from "../../scripts/lib/jira-bug-labels.mjs";

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const refusal = bugLabelRefusal(event.tool_name ?? "", event.tool_input);
  if (!refusal) process.exit(0);
  process.stdout.write(JSON.stringify({ decision: "block", reason: refusal }));
  process.exit(0);
} catch (err) {
  process.stderr.write(`enforce-bug-labels hook error: ${err?.message ?? err}\n`);
  process.exit(0);
}
