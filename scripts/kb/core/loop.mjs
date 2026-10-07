// Did the session's misses come back to the base? (VCST-6156)
//
// The loop the base exists for is "ask -> nothing -> find out -> capture". Measured on the published
// log 2026-09-30 .. 10-06: of 30 sessions with a miss, 8 wrote nothing back afterwards, and under the
// verdict ranker every ask is `ambiguous`, so an agent that neither picks (`kb_show --ask`) nor
// rejects (`kb_none`) leaves an ask whose outcome nobody can read. Both are invisible to the agent
// while it works and obvious at the end of its turn -- which is where `kb-remind` asks about them.
//
// READS ONLY THE SESSION'S LOOP JOURNAL (`<session>.loop.ndjson`, `core/queue.mjs` `loopPath`): an
// append-only record of asks, picks, rejections and writes. The queue itself is flushed at every
// `Stop`, so it cannot answer "was this ever written back"; and the journal is append-only so that no
// kb process of the session can erase another's line. A client that predates it writes nothing there,
// so it can produce no reminder at all -- never a false one.
//
// LENIENT ON PURPOSE FOR A MISS. An agent rephrases one need four or five times and then writes ONE
// entry, and a write's `after` points at the last ask only -- so ANY write later in the session closes
// every earlier miss. A reminder that fires on a need that was in fact written back would teach the
// agent to ignore it; one that misses an occasional unrelated gap costs nothing.
//
// STRICT FOR AN UNCLOSED LIST (VCST-6191). An `ambiguous` list is closed by a choice -- `kb_show` or
// `kb_none` -- and by nothing else. A later confirm or capture used to close it too, which silenced the
// reminder in exactly the case it exists for: on 2026-10-06 (`kb:report`, lists panel) 17 of 38 lists
// were left unclosed and 12 of those were written about anyway, from the list excerpt. `report-analyse.mjs` `resolveVerdicts` already
// read such an ask as `unclosed`; hook and report now read it one way. A list closed by `kb_none` is a
// miss again, and a later write closes it like any miss.

import { CONTRACT } from './contract.mjs';


/**
 * THE AGENT'S LAST WORD on one `ambiguous` ask, from the `show` / `none` records that point at it.
 * The LAST one counts, because the tool contract invites a look before the verdict: `kb_show --ask h`
 * to read a candidate, then `kb_none --ask h` because it did not answer. Reading "any pick" made that
 * ask look answered -- the very miss this exists to catch. Returns `{ verdict: 'picked', ids }` (the
 * picks after the last `none`), `{ verdict: 'none' }`, or `{ verdict: 'open' }`. `ids` is empty for
 * journal records, which carry no entry id; the report's log lines do.
 */
export function lastWord(pointed) {
  const said = (pointed ?? [])
    .filter((o) => o.kind === 'none' || (o.kind === 'show' && o.state === 'answer'))
    .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
  if (!said.length) return { verdict: 'open', ids: [] };
  const lastNone = said.map((o) => o.kind).lastIndexOf('none');
  const picks = said.slice(lastNone + 1);
  if (!picks.length) return { verdict: 'none', ids: [] };
  return { verdict: 'picked', ids: picks.map((o) => o.id).filter(Boolean).map(String) };
}

/**
 * ask `at` -> the `show` / `none` records that speak to it -- ONE rule for the reminder and for
 * `report-analyse.mjs` `unhelpful`, which must read a pick the same way (PR #400 review). A record
 * names its ask by `after`; a handle-less `show` is the pick for the latest ask when that ask is
 * `ambiguous` -- the reading `kb_none` already gives a handle-less call.
 *
 * A LENIENT HEURISTIC for that handle-less show: by time, so with a background subagent or a batched
 * wave sharing the session key, one agent's pick can close another agent's list -- the failure
 * `none()` documents for its own handle-less call. A missed reminder, never a false one.
 *
 * KNOWN LIMIT: an ask's identity is its millisecond `at` (it is also the public ask handle M6 labels
 * on). `at` strictly increases within one kb process, but two processes on one session key can log
 * in the same millisecond; one agent's `kb_none`, or one raise, then also covers the other's ask.
 * Changing the handle's shape would change the M6 data, so it is left, and it can only hide a
 * reminder, never invent one.
 */
export function pointersByAsk(records) {
  const sorted = (Array.isArray(records) ? records : [])
    .filter((r) => r && typeof r.at === 'string')
    .sort((a, b) => a.at.localeCompare(b.at));
  const pointed = new Map();
  let latestAsk = null;
  // A handle-less show is a pick from the latest list only when that list SHOWED its entry (VCST-6191):
  // an entry opened from an answer, a capture hint or another list is not a choice from this one.
  // Applied only when both sides name the ids; a journal record from before they were journalled keeps
  // the old reading. Log lines always named them: re-read this way, 2026-10-06 is unchanged (17 of 38
  // lists unclosed in the lists panel).
  const fromList = (ask, show) => !Array.isArray(ask.shown) || !show.id
    || ask.shown.some((s) => String(s).toUpperCase() === String(show.id).toUpperCase());
  for (const r of sorted) {
    if (r.kind === 'ask') { latestAsk = r; continue; }
    if (r.kind !== 'show' && r.kind !== 'none') continue;
    // ...and only while that list is still OPEN: a handle-less show after the agent closed it would
    // otherwise rewrite its `kb_none` into a pick -- exactly what the confirm gate's advice to open an
    // entry would trigger. Re-opening a closed list takes its handle (`--ask`), deliberately.
    const target = r.after ? String(r.after)
      : (r.kind === 'show' && latestAsk?.state === 'ambiguous' && fromList(latestAsk, r)
        && lastWord(pointed.get(String(latestAsk.at))).verdict === 'open' ? String(latestAsk.at) : null);
    if (target) pointed.set(target, [...(pointed.get(target) ?? []), r]);
  }
  return pointed;
}

/**
 * The asks still open, oldest first: `{ at, q, why, call? }`, where `why` is
 *   'miss'        the base held nothing (or the agent's last word was `kb_none`), nothing written after;
 *   'unresolved'  an `ambiguous` list was neither picked from nor rejected, and nothing written after.
 * Picks and rejections are read through `pointersByAsk`. Asks the base could not be READ on
 * (`unreachable`, no base) are not misses. `reminded` lists ask `at`s already raised.
 */
export function openLoops(journal, { reminded = [] } = {}) {
  const records = (Array.isArray(journal) ? journal : [])
    .filter((r) => r && typeof r.at === 'string' && typeof r.kind === 'string')
    .sort((a, b) => a.at.localeCompare(b.at));
  const raised = new Set((Array.isArray(reminded) ? reminded : []).map(String));
  const pointed = pointersByAsk(records);
  const out = [];
  // ONE pass: an ask is closed by any write after it, so only the LAST write matters (PR #400 review).
  const lastWrite = records.reduce((m, r) => (r.kind === 'write' && r.at > m ? r.at : m), '');
  for (const a of records) {
    // EVERY ask is judged, however old: the raised record is unbounded, so an old miss is raised once
    // and never again, and a window would only drop it silently (PR #400 review).
    if (a.kind !== 'ask' || raised.has(a.at)) continue;
    if (a.state !== 'miss' && a.state !== 'ambiguous') continue;
    // This session already captured it and it is still queued: answered, not open.
    if (a.queued) continue;
    const word = lastWord(pointed.get(a.at));
    if (a.state === 'ambiguous' && word.verdict === 'picked') continue;
    // An unclosed list stays open whatever was written after it; a miss is closed by any later write.
    const unclosed = a.state === 'ambiguous' && word.verdict === 'open';
    if (!unclosed && lastWrite > a.at) continue;
    out.push({
      at: a.at, q: String(a.q ?? ''), why: a.state === 'miss' || word.verdict === 'none' ? 'miss' : 'unresolved',
      ...(a.call ? { call: a.call } : {}),
    });
  }
  return out;
}

/**
 * The entries this session has OPENED -- read the body of -- from its journal, newest first: a `show`
 * that answered, and an ask that printed bodies (`opened`). An id seen only in an `ambiguous` list
 * (`shown`) is not opened. `verbs.mjs` `openedThisSession` joins this with the queue; `kb confirm` /
 * `kb dispute` refuse anything outside it (VCST-6191): a confirmation raises the entry's trust for every
 * later reader, so it rests on the whole entry, not on the line a list printed about it.
 */
export function openedIds(journal) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(journal) ? journal : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const r = list[i];
    const ids = r?.kind === 'show' && r.state === 'answer' && r.id ? [r.id]
      : r?.kind === 'ask' && Array.isArray(r.opened) ? r.opened : [];
    for (const id of ids) {
      const key = String(id).toUpperCase();
      if (!seen.has(key)) { seen.add(key); out.push(String(id)); }
    }
  }
  return out;
}

/**
 * The handle of the latest STILL OPEN ask whose list showed `id`, or null: the `--ask` an open of it
 * should carry. A list the agent already closed is not offered: `kb_show --ask` on it would turn the
 * agent's `kb_none` into a pick it never made, in the very pairs M6 recalibrates on (VCST-6191 review).
 */
export function askThatShowed(journal, id) {
  const want = String(id).toUpperCase();
  const pointed = pointersByAsk(journal);
  let at = null;
  for (const r of Array.isArray(journal) ? journal : []) {
    if (r?.kind !== 'ask' || !Array.isArray(r.shown) || !r.shown.some((s) => String(s).toUpperCase() === want)) continue;
    if (lastWord(pointed.get(r.at)).verdict !== 'open') continue;
    if (!at || r.at > at) at = r.at;
  }
  return at;
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
export function reminderText(loops, { contract = CONTRACT } = {}) {
  // An unclosed list is raised even after a write (VCST-6191), so the headline does not claim "nothing
  // was written back" for it: that holds for the misses only.
  const lines = [`kb reminder (not a failure): ${loops.length} question(s) this session left open in the knowledge base -- no answer and nothing written back, or a list never closed:`];
  for (const l of loops.slice(0, LISTED)) {
    lines.push(l.why === 'unresolved'
      ? `- "${clip(l.q)}" -- a list was shown and never closed: kb_show <id> with ask ${l.at}, or kb_none with ask ${l.at}`
      : `- "${clip(l.q)}"`);
  }
  if (loops.length > LISTED) lines.push(`- and ${loops.length - LISTED} more`);
  // A list is closed by a choice, never by a write (VCST-6191): asking the agent to capture it again
  // would turn a list it already wrote about into a duplicate entry. The capture line is for misses.
  if (loops.some((l) => l.why === 'unresolved')) {
    lines.push('Close each list with the entry you relied on (kb_show) or kb_none -- even if you already wrote about it.');
  }
  if (loops.some((l) => l.why !== 'unresolved')) {
    lines.push(`If you or a subagent established a question with no answer live, kb_capture it now (contract: ${contract}). `
      + 'If you did not establish it, say so in one line and finish.');
  }
  lines.push('Each question is raised once.');
  return lines.join('\n');
}
