#!/usr/bin/env node
/**
 * kb-flush — publish the knowledge base queue WHEN THE AGENT FINISHES, not when a clock says so.
 *
 * THE SIGNAL THE SERVER CANNOT SEE. The MCP server is a child process speaking JSON-RPC: it sees
 * requests and nothing around them. "The agent finished its task" does not exist inside it — the
 * same boundary that made `parent_tool_use_id` unavailable in PLAN §7. So the server's own rules
 * are both approximations: `OWN_FLUSH_AFTER_MS` needs a LATER request to fire, and the 60s timer
 * publishes on a clock rather than on the event anybody cares about.
 *
 * `Stop` IS that event, and we found it by accident: `kb-harvest.mjs` wrote a row per turn, which
 * looked like a bug in the harvester and was in fact the harness telling us that `Stop` fires at the
 * end of every assistant turn. That is as close to "the agent finished" as this system can observe.
 *
 * PRIMARY AND BACKSTOP, not either/or. A hook can be absent — unregistered, a CLI-only session, a
 * machine whose settings nobody merged — so the server's timer stays exactly where it is. Together:
 * normally published the moment the work ends, and in the worst case within a minute.
 *
 * TWO THINGS IT MUST NOT DO, and both are the reason it is shaped like this:
 *
 * 1. IT MUST NOT DELAY THE TURN. A push is a network commit — one to two seconds. A hook the
 *    harness waits for would add that to the end of every single answer. So this does one cheap
 *    filesystem check and, if there is anything to send, spawns a DETACHED push that outlives it
 *    and exits immediately. The hook itself is tens of milliseconds.
 * 2. IT MUST NOT WRITE TO STDOUT. A Stop hook's stdout is a control channel; stray text there can
 *    change what the session does. Everything here is silent, and it exits 0 whatever happens — a
 *    flush that can fail a session is worse than a flush that is late.
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

function queueHasWork(dir) {
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      if (statSync(join(dir, name)).size > 0) return true;
    }
  } catch { /* no queue directory yet — nothing has ever been asked */ }
  return false;
}

function main() {
  // Read and discard the payload: the hook contract sends one, and leaving it unread can make the
  // harness see a broken pipe. We need nothing from it — the queue is per machine, not per session.
  try { readFileSync(0, 'utf8'); } catch { /* no stdin — fine */ }

  const dir = process.env.KB_QUEUE_DIR || join(tmpdir(), 'claude-kb-queue');
  if (!queueHasWork(dir)) return;

  // `$CLAUDE_PROJECT_DIR` is set for hooks; resolving from this file is the fallback that survives
  // being invoked from somewhere else.
  const root = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..');

  const child = spawn(process.execPath, [join(root, 'scripts', 'kb', 'kb.mjs'), 'push'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
}

try { main(); } catch { /* a flush must never fail a session */ }
process.exit(0);
