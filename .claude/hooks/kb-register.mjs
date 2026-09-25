#!/usr/bin/env node
/**
 * kb-register — a SessionStart hook that puts the `kb` MCP server into this machine's `.mcp.json`,
 * so a teammate who pulls the branch needs to run nothing at all.
 *
 * THE GAP IT CLOSES. Everything else this system needs travels in git: the `CLAUDE.md` line, the
 * flush hook, the CLI. The one thing that cannot is the MCP server's registration — `.mcp.json` is
 * gitignored (VCST-5774 D2) and `.claude/settings.json` CANNOT declare MCP servers. That last one
 * was re-measured on Claude Code 2.1.275 rather than quoted: a sandbox with `mcpServers` in
 * `settings.json` and no `.mcp.json` does not list the server at all. So `npm run kb:install` was
 * the whole answer, and it is a command somebody has to remember to run.
 *
 * WHAT IT DOES NOT FIX, measured in the same sandbox: **MCP servers bind BEFORE SessionStart hooks
 * run.** The hook created a correct `.mcp.json`, and the session it ran in still answered "NO" when
 * asked whether it had a `mcp__kb__` tool. So the honest promise is ZERO STEPS, NOT ZERO RESTARTS:
 * pull, open a session, restart, and the tools are there — pre-approved, with nothing typed and no
 * dialog. The restart is inherent to how MCP binds and every server in this repo needs it.
 *
 * IT MUST PRINT NOTHING. A SessionStart hook's stdout is injected into the session as context, so
 * the install script's own report would land in every session's window forever. This wrapper exists
 * for that reason alone — `install()` is imported, not spawned.
 *
 * It is safe to run on every session because it is a no-op after the first: it merges exactly the
 * `kb` key, leaves every other server byte-for-byte, refuses a `.mcp.json` that does not parse
 * rather than rewriting it, and does not touch the file at all when nothing changed.
 */
import { install, uninstall } from '../../scripts/kb/install-mcp.mjs';
import { kbDisabled } from '../../scripts/kb/core/queue.mjs';

// `KB_ENABLED=0` is the durable off switch: removed, not merely not-added, so opting out is one
// setting (`.claude/settings.local.json` `env`) and survives every later session start.
try { if (kbDisabled(process.env)) uninstall(); else install(); } catch { /* a registration must never fail a session start */ }
process.exit(0);
