#!/usr/bin/env node
/**
 * PostToolUse hook: hand the agent what the base already holds about wherever it just went.
 *
 *   .claude/settings.json → hooks.PostToolUse[].hooks[] → { "type": "command", "command":
 *     "node \"${CLAUDE_PLUGIN_ROOT}/hooks/arrive.mjs\"" }
 *
 * SHIPPED DISABLED. It is not in this plugin's hooks.json, and the reason is in PORT.md: it runs
 * on every tool call an agent makes, costs 254-286 ms against an 80-84 ms baseline, and buys about
 * one per cent. Wire it by hand, or re-measure and then decide.
 *
 * Reads the hook payload on stdin, pulls every string out of the tool call, and looks for
 * coordinates the base is anchored on. A URL is a coordinate; a route in a curl command is a
 * coordinate. Nothing is asked and nothing has to be remembered.
 *
 * WHAT IT IS WORTH, MEASURED -- replayed over all 22 archived logs (4,038 calls) on 2026-09-16,
 * counting only entries that existed BEFORE each run, in measurements/kb-arrival-2026-09/.
 *
 * Six arms ever went to platform source for an answer (rounds two and three). In every one of them
 * some pre-existing entry would have arrived first -- which is true and says nothing, because in
 * round two what arrived was route tables and what was fetched was C# arithmetic. Judged by
 * SUBJECT: in 3 of 9 source subjects, the entry that answers the question the arm went to source
 * for would have arrived before the fetch. All three are one entry, KB-27B4CD10, handed over at
 * `/company/members` at call 8, 9 and 11 of round three, 5 and 10 calls before arms A and B went
 * to Members.vue for the same thing -- arms that had no base at all and never asked one. The
 * remaining six are the whole of round two and the sign-in mechanism in round three: the corpus
 * holds no mechanism, so nothing on that subject could arrive.
 *
 * It was enabled in NO arm of any round. Every comparison so far measured unprompted recall of a
 * tool, which is near zero for everything. This is the first measurement of the base ARRIVING, and
 * it is a replay, not a run: whether an arm READS what arrives is the next run's question.
 *
 * FAILS SILENT, ALWAYS. A hook that can break a tool call is a hook that gets removed, and this one
 * runs on every call an agent makes.
 */
import { readFileSync } from 'node:fs';
import { buildArrivalIndex, arrivalsFor, textOf } from '../src/arrive.mjs';
import { resolveBase } from '../src/base.mjs';

const BASE = resolveBase();

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
    // `kb`, not `node bin/kb.mjs`: this text is read by an agent standing in a project, where a
    // relative path into the plugin resolves to nothing. The next clause on this line already said
    // `kb how`, so the file was telling the reader two different things about the same door.
    'Read one with `kb deliver "<your question>"` — or `kb how "<what you are trying to do>"`',
    'for a procedure, which `deliver` deliberately cannot reach. You can also open the file directly.',
    // Said here rather than left implicit: an experiential entry is one agent's belief until a
    // second agent says otherwise, and confirming is the step every run so far has skipped.
    ...(hits.some((h) => h.plane === 'experiential')
      ? ['An agent-written entry is one observation until someone else confirms it. If it holds, `kb confirm <id> --deployment <name> --note "<what you saw>"`; if it does not, `kb dispute`.']
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
