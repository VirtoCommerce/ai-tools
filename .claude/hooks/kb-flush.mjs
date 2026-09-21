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
import { REACH_IDLE_MS, advanceReach, idleReaches } from '../../scripts/kb/core/reach.mjs';
import { sessionId } from '../../scripts/kb/core/queue.mjs';

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
  // THE PAYLOAD IS NOW READ, not discarded. It carries `session_id` and `transcript_path`, and
  // those two are the only way this system can learn how much work a session did — the base sees
  // only what was asked of it, so without them a session that never asked is indistinguishable from
  // a session that never ran, and the ratio everybody actually wants has no denominator.
  // It is still read unconditionally and still never re-emitted: an unread stdin can leave the
  // harness with a broken pipe, and a malformed payload must not cost the turn.
  let payload = null;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { /* no stdin, or not JSON — fine */ }

  const dir = process.env.KB_QUEUE_DIR || join(tmpdir(), 'claude-kb-queue');

  // THE IDENTITY COMES FROM `sessionId()`, NOT FROM THE PAYLOAD, and the difference is not cosmetic:
  // they are two different identifiers. The hook payload's `session_id` is the TRANSCRIPT's id
  // (`52b778cc-…`), while every queue file, every log line and therefore every ask this report joins
  // against is keyed on the short key `sessionId()` derives from `CLAUDE_CODE_HOST_SESSION_ID`
  // (`f3d05dd3…`, 8 characters of the part that VARIES — see `queue.mjs`). Measured here before
  // this shipped: keying reach on the payload produces `52b778cc` against asks filed under the
  // queue key, so the join matches NOTHING — every session reports as unaccounted and the panel
  // silently says "not measured" forever. Only `transcript_path` is taken from the payload.
  const session = sessionId(process.env);

  // Counting is cheap and unconditional: cursor-based, so each turn reads only the bytes appended
  // since the last one, and it stores integers — never a name, an argument or a result. `reach.mjs`
  // carries what is read and what deliberately is not.
  if (payload?.transcript_path) {
    try {
      advanceReach({ dir, session, transcriptPath: payload.transcript_path });
    } catch { /* accounting must never cost a turn */ }
  }

  // A SESSION THAT NEVER ASKED STILL HAS TO REACH THE BASE, which is exactly the case the old
  // early return dropped: no queue work meant no push, so the sessions worth knowing about were the
  // ones that could never report themselves. A finished session's counters are queue work now.
  const stale = idleReaches(dir, { session, idleMs: REACH_IDLE_MS }).length > 0;
  if (!queueHasWork(dir) && !stale) return;

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
