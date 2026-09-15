#!/usr/bin/env node
/**
 * PostToolUse hook: hand the agent what the base already holds about wherever it just went.
 *
 *   .claude/settings.json → hooks.PostToolUse[].hooks[] → { "type": "command", "command":
 *     "node C:/_VIRTO/vc-kb-lab/hooks/arrive.mjs" }
 *
 * Reads the hook payload on stdin, pulls every string out of the tool call, and looks for
 * coordinates the base is anchored on. A URL is a coordinate; a route in a curl command is a
 * coordinate. Nothing is asked and nothing has to be remembered.
 *
 * WHAT IT IS WORTH, MEASURED. Replayed over three runs' archived tool logs, restricted to entries
 * that existed BEFORE each run: it would have fired once in run 02's 172 calls and twice in run
 * 03's 319. That is close to nothing, and it is the honest headline -- this does not, today, fix
 * the front-loading it was built for.
 *
 * What it does show is where the value comes from. Run 03's own two entries, anchored on
 * `/company/members`, match nine of its calls -- meaning the NEXT run doing UI work gets them at
 * the moment it arrives on that page. The derived plane is anchored on GraphQL type and field
 * names, which never appear in a browser URL, so 590 entries contribute almost nothing here. The
 * mechanism pays in proportion to how many entries are anchored on routes agents actually travel,
 * and there are currently two.
 *
 * Shipped anyway because it costs one file and gets better on its own as the experiential plane
 * grows. Not shipped as a solution: the measurement above is in `measurements/kb-arrival-2026-09/`
 * and should be re-run after the next UI-heavy run rather than assumed.
 *
 * FAILS SILENT, ALWAYS. A hook that can break a tool call is a hook that gets removed, and this one
 * runs on every call an agent makes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildArrivalIndex, arrivalsFor, textOf } from '../src/arrive.mjs';
import { resolveBase } from '../src/base.mjs';

const BASE = resolveBase({ here: fileURLToPath(new URL('..', import.meta.url)) });

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return;
  }

  const text = textOf(payload.tool_input ?? payload.toolInput ?? {});
  if (!text) return;

  let hits;
  try {
    hits = arrivalsFor(text, buildArrivalIndex(BASE), { limit: 3 });
  } catch {
    return;
  }
  if (!hits.length) return;

  // A flow arrives by COORDINATE even though it is unreachable by WORDS from `ask` -- the two
  // questions are separated on purpose, and standing on /cart is the moment a procedure anchored
  // there is worth most. It is labelled as what it is, and pointed at the verb that can serve it:
  // telling a reader to run `kb deliver` on a flow is a remedy that refuses in turn, which is the
  // dead end this project has already fixed twice.
  const LABEL = { experiential: 'written by an agent', flow: 'a procedure — `kb how`' };
  const lines = [
    'The knowledge base holds entries anchored on a coordinate you just touched:',
    ...hits.map((h) => `  @kb(${h.id})  ${h.subject}  [${LABEL[h.plane] ?? 'derived from the contract'}]  — anchored on ${h.coordinate}`),
    'Read one with `node bin/kb.mjs deliver "<your question>"` — or `kb how "<what you are trying to do>"`',
    'for a procedure, which `deliver` deliberately cannot reach. You can also open the file directly.',
    // Said here rather than left implicit: an experiential entry is one agent's belief until a
    // second agent says otherwise, and confirming is the step every run so far has skipped.
    ...(hits.some((h) => h.plane === 'experiential')
      ? ['An agent-written entry is one observation until someone else confirms it. If it holds, `kb confirm <id> --deployment <name>`; if it does not, `kb dispute`.']
      : []),
  ];

  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: lines.join('\n'),
    },
  })}\n`);
}

try {
  main();
} catch {
  // deliberately silent: see the header
}
