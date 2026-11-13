#!/usr/bin/env node
// SessionStart + PostToolUse(browser_close): take the login passwords out of the project's Playwright
// lane HAR files (bridge/har-scrub.mjs has the why).
//
// A lane run through the vc-init bridge scrubs its own HAR in-process. A lane started straight from
// `.mcp.json` (`npx @playwright/mcp … --secrets <file>`) has no such process, so this hook does it:
// right after a `browser_close` (when Playwright has just written the HAR) and at session start (the HAR
// a server wrote when the previous session ended). Values come from the project's `.env.playwright.*`
// and `.env.local`; password-named body fields are masked even without them.
//
// Fail-soft: never blocks a tool call or the session; it prints one line when it masked something.
import { harFilesIn, projectHarTargets, scrubHarFileSync } from "../bridge/har-scrub.mjs";
import { envFilePasswordValues } from "../skills/project-init/lib/passwords.mjs";

try {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const { harPaths, secrets } = projectHarTargets(root, { passwordValues: envFilePasswordValues });
  let masked = 0;
  for (const file of harFilesIn(harPaths)) {
    const r = scrubHarFileSync(file, { secrets });
    if (r.status === "scrubbed") masked += r.masked;
    else if (r.status === "error") process.stderr.write(`[vc-init] could not scrub ${file}: ${r.error}\n`);
  }
  if (masked) process.stderr.write(`[vc-init] masked ${masked} secret value(s) in the Playwright lane HAR files\n`);
} catch (e) {
  process.stderr.write(`[vc-init] HAR scrub skipped: ${e.message}\n`);
}
process.exit(0);
