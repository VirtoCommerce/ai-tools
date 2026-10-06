// Did the session's misses come back to the base? (VCST-6156)
//
// The loop the base exists for is "ask -> nothing -> find out -> capture". Measured on the published
// log 2026-09-30 .. 10-06: of 30 sessions with a miss, 8 wrote nothing back afterwards, and under the
// verdict ranker every ask is `ambiguous`, so an agent that neither picks (`kb_show --ask`) nor
// rejects (`kb_none`) leaves an ask whose outcome nobody can read. Both are invisible to the agent
// while it works and obvious at the end of its turn -- which is where `kb-remind` asks about them.
//
// READS ONLY THE LOCAL SIDECAR (`<session>.meta.json`): the asks it remembers and their outcomes.
// The queue itself is flushed at every `Stop`, so it cannot answer "was this ever written back".
//
// LENIENT ON PURPOSE. An agent rephrases one need four or five times and then writes ONE entry, and
// a write's `after` points at the last ask only -- so ANY write later in the session closes every
// earlier miss. A reminder that fires on a need that was in fact written back would teach the agent
// to ignore it; one that misses an occasional unrelated gap costs nothing.

import { metaAsks, metaOutcomes } from './queue.mjs';

const WRITES = new Set(['capture', 'capture-refused', 'confirm', 'dispute']);

/**
 * The asks still open, oldest first: `{ at, q, why }`, where `why` is
 *   'miss'        the base held nothing (or the agent said `kb_none`) and nothing was written after;
 *   'unresolved'  an `ambiguous` list was neither picked from nor rejected, and nothing written after.
 * An `ambiguous` ask the agent picked from (`show` with `state: answer` and `after` = the ask) is
 * answered. Asks the base could not be READ on (`unreachable`, no base) are not misses: there was no
 * answer to get. `reminded` lists ask `at`s already asked about, so each is raised at most once.
 */
export function openLoops(meta, { reminded = meta?.reminded ?? [] } = {}) {
  // A sidecar with no `outcomesSince` was kept by a client that recorded no outcomes, so it cannot say
  // whether anything was written back: it is raised about nothing. Asks before the mark likewise.
  const since = typeof meta?.outcomesSince === 'string' ? meta.outcomesSince : null;
  if (!since) return [];
  const outcomes = metaOutcomes(meta);
  const asked = new Set(Array.isArray(reminded) ? reminded.map(String) : []);
  const out = [];
  for (const a of metaAsks(meta)) {
    if (asked.has(a.at) || a.at < since) continue;
    if (a.state !== 'miss' && a.state !== 'ambiguous') continue;
    if (outcomes.some((o) => WRITES.has(o.kind) && o.at > a.at)) continue;
    const pointed = outcomes.filter((o) => o.after === a.at);
    if (pointed.some((o) => o.kind === 'show' && o.state === 'answer')) continue;
    const rejected = pointed.some((o) => o.kind === 'none');
    out.push({ at: a.at, q: String(a.q ?? ''), why: a.state === 'miss' || rejected ? 'miss' : 'unresolved' });
  }
  return out;
}

const Q_MAX = 110;
const LISTED = 5;
const clip = (q) => (q.length > Q_MAX ? `${q.slice(0, Q_MAX).replace(/\s+\S*$/, '')} …` : q);

/**
 * The reminder, short because a `Stop` hook's reason is read on every turn it fires and the harness
 * truncates hook text well under 2,000 characters. It names the questions, never a verdict on them:
 * the agent is the only party who knows whether it found the answer out.
 *
 * "NOT A FAILURE" IS LITERAL. Claude Code surfaces every blocking Stop hook as "Stop hook error
 * occurred" in its UI (measured 2026-10-06, a live `claude -p` run: `hook_blocking_error`), and there
 * is no non-blocking way for a Stop hook to make the agent take one more step. The operator who opens
 * that notice reads this line first.
 */
export function reminderText(loops, { contract = '.claude/knowledge/execution/kb-capture-contract.md' } = {}) {
  const lines = [`kb reminder (not a failure): ${loops.length} question(s) this session got no answer from the knowledge base, and nothing was written back after them:`];
  for (const l of loops.slice(0, LISTED)) {
    lines.push(l.why === 'unresolved'
      ? `- "${clip(l.q)}" -- a list was shown and never closed: kb_show <id> with ask ${l.at}, or kb_none with ask ${l.at}`
      : `- "${clip(l.q)}"`);
  }
  if (loops.length > LISTED) lines.push(`- and ${loops.length - LISTED} more`);
  lines.push(`If you or a subagent established any of these live, kb_capture it now (contract: ${contract}). `
    + 'If you did not establish it, say so in one line and finish. Each question is raised once.');
  return lines.join('\n');
}
