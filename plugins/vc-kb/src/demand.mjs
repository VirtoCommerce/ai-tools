// The open loop: what the base has been asked and nobody has written back about, and what it has
// served that nobody has said held.
//
// WHY THIS EXISTS. Three live runs consulted the base in their first minutes and wrote to it from
// their closing report, with hours in between and no contact either way. Run 03's shape exactly:
// four `deliver` calls at tool call 7-10 of 319, five `capture` calls at 266-269 and 312, every one
// of them with KB_PHASE=report. The writing was reconstruction from memory, so whatever a run
// learned and then superseded was never written at all.
//
// A brief cannot fix that. Runs 01 and 02 were told in so many words to consult the base, and
// front-loaded anyway. What was missing is that a question only existed in the asker's head:
// nothing outlived the moment it was asked. So the door keeps it.
//
// IT RECORDS EVERY QUESTION, NOT ONLY THE MISSES, and that is a measured decision rather than a
// cautious one. Across all three runs the base was asked 23 questions and missed ZERO of them --
// `kb deliver` always found something. A MISS-only loop would have stayed empty through every run
// this experiment has done. MISS is a COVERAGE signal; whether an answer actually settled the
// question is something only the asker knows, and run 03 wrote it down plainly for a question the
// base "answered": the role values "are data and not contract, so the derived plane structurally
// cannot hold them". Served is not answered.
//
// IT LIVES WITH THE BASE, NOT WITH THE SESSION. An unanswered question is a fact about the CORPUS
// -- its demand signal -- not about whoever happened to ask. Beside the base, the next agent
// inherits it, a question left open on Tuesday is still open on Friday, and the record survives the
// thing that has failed in all three runs: an agent remembering.
//
// `demand.jsonl` is deliberately NOT under `derived/`. The extractor neither writes nor wipes it,
// `kb check` never byte-compares it and `kb validate` does not gate it: it is a log of what people
// wanted, not a claim about the platform, and nothing in it is ever served as an answer.

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const DEMAND_FILE = 'demand.jsonl';

const demandPath = (base) => join(base, DEMAND_FILE);

// "How do I X?" and "how do i x" are one question, and two rows for them would make the list lie
// about how often the base has been asked -- and that count is the whole coverage signal.
//
// Trailing punctuation goes too, which is where this parts company with the journal's question
// hash. The journal records what was asked, verbatim-ish, for a measurement someone reads later; a
// stray question mark there costs nothing. Here the key decides whether a capture CLOSES a row, and
// a row left open because the asker typed "?" and the writer did not is a loop that quietly stops
// closing. Same normalization otherwise, deliberately: case and whitespace, and nothing cleverer.
// Stemming or synonyms would start closing questions nobody answered.
const normalize = (q) => String(q ?? '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?!.\s]+$/, '');
export const questionKey = (q) => createHash('sha256').update(normalize(q)).digest('hex').slice(0, 12);

function read(base) {
  const p = demandPath(base);
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A corrupt line is skipped rather than thrown on. This is append-only bookkeeping; failing
      // a `deliver` because one line of it is malformed would be the tail wagging the dog.
    }
  }
  return out;
}

// Append-only, never rewritten in place: two agents can work against one base at once, and a
// read-modify-write would silently drop one of their rows.
function append(base, row) {
  try {
    appendFileSync(demandPath(base), `${JSON.stringify(row)}\n`);
    return true;
  } catch {
    return false;
  }
}

export function recordAsk(base, question, { miss = false, at = new Date().toISOString() } = {}) {
  if (!question) return null;
  const key = questionKey(question);
  append(base, { kind: 'ask', key, question, miss, at });
  return key;
}

/**
 * An experiential entry was served. Recorded so the loop can ask later whether it held: a
 * confirmation is the only thing that moves an entry from one agent's report to something two runs
 * have seen, and it is the step every run so far has skipped.
 *
 * Derived entries are not recorded. They are regenerated from the deployment and byte-gated, so
 * "did it hold" is already answered by `kb check` and a human confirmation would add nothing.
 */
export function recordUses(base, served, { at = new Date().toISOString() } = {}) {
  const rows = (served ?? []).filter((s) => s.plane === 'experiential' && s.id);
  for (const r of rows) append(base, { kind: 'use', id: r.id, at });
  return rows.map((r) => r.id);
}

export function recordSettled(base, id, { at = new Date().toISOString() } = {}) {
  return id ? append(base, { kind: 'settled', id, at }) : false;
}

/**
 * Questions asked that nobody has since written anything about, newest first.
 *
 * `asked` counts repeats. A question that keeps coming back and has still produced no entry is the
 * strongest coverage signal this base makes on its own, and it is the number that should decide
 * what gets written next.
 */
export function openQuestions(base) {
  const byKey = new Map();
  for (const row of read(base)) {
    // `buried` settles a row exactly as `closed` and `dropped` do: the question has an answer
    // and the loop is no longer waiting on it. What makes it a different KIND is what it says
    // about WHY, which is the part the ranking work needs and the other two throw away.
    if (row.kind !== 'ask' && row.kind !== 'closed' && row.kind !== 'dropped' && row.kind !== 'buried') continue;
    const cur = byKey.get(row.key) ?? { key: row.key, question: row.question, asked: 0, missed: 0, settledBy: null, at: row.at };
    if (row.kind === 'ask') {
      cur.asked += 1;
      if (row.miss) cur.missed += 1;
      cur.question = row.question ?? cur.question;
      cur.at = row.at ?? cur.at;
    } else {
      cur.settledBy = row.kind === 'closed' ? (row.id ?? 'a capture')
        : row.kind === 'buried' ? `buried under retrieval; ${row.id} answers it`
          : 'dropped';
      cur.reason = row.reason ?? null;
    }
    byKey.set(row.key, cur);
  }
  return [...byKey.values()].filter((d) => !d.settledBy).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * Close every open question this capture answers.
 *
 * Matched on the QUESTION, not on anchors and not on wording similarity. Anchors were the obvious
 * alternative and are wrong: a capture anchored on `Query.cart` would close every open question
 * that ever touched the cart, and closing a question nobody answered is worse than leaving it open
 * -- it deletes the demand signal while the gap is still there. An exact normalized match closes
 * only what the writer literally set out to answer; everything else stays open, visibly.
 */
export function closeQuestions(base, { question, id }, { at = new Date().toISOString() } = {}) {
  if (!question || !id) return [];
  const key = questionKey(question);
  const closed = openQuestions(base).filter((d) => d.key === key);
  for (const d of closed) append(base, { kind: 'closed', key: d.key, question: d.question, id, at });
  return closed;
}

/**
 * Close a question without an entry.
 *
 * "If you learn nothing worth recording, record nothing" is the standing instruction and a real
 * outcome, so the loop has to have somewhere to put it -- otherwise every question a run decided
 * was not worth writing up stays on the list forever and the list stops being read. Dropping is
 * recorded rather than erased: how often questions are asked and then judged not worth an entry is
 * itself worth being able to count.
 */
export function dropQuestion(base, key, { reason = null, at = new Date().toISOString() } = {}) {
  const q = openQuestions(base).find((d) => d.key === key || d.key.startsWith(key));
  if (!q) return null;
  append(base, { kind: 'dropped', key: q.key, question: q.question, reason, at });
  return q;
}

/**
 * Close a question whose answer the base ALREADY HELD and did not serve.
 *
 * The third outcome, and the commonest one. `closeQuestions` records "somebody wrote the answer"
 * and `dropQuestion` records "there was nothing worth writing"; neither fits the case where the
 * corpus holds the answer and retrieval buried it under entries that merely share the words. Before
 * this verb that case had nowhere to go: dropping it says the question was not worth answering,
 * which is false and deletes the signal, and leaving it open says the base has a gap, which is also
 * false and sends the next writer to write a duplicate.
 *
 * IT IS THE LABELLED DATA THE RANKING PROBLEM HAS NEVER HAD. Fourteen candidate rules were measured
 * on 2026-09-16 against 34 held-out rows, of which five are rows where a run said the answer was
 * buried -- and two of those five are still buried, with no way to get more of them except by
 * waiting for another run to be failed the same way. Every `buried` row is one more, produced by a
 * reader doing the review the drift forces anyway. `measurements/kb-missdrift-2026-09/` is what
 * consumes them.
 */
export function buriedQuestion(base, key, { id, reason = null, at = new Date().toISOString() } = {}) {
  if (!id) throw new Error('buried needs the entry that should have been served');
  const q = openQuestions(base).find((d) => d.key === key || d.key.startsWith(key));
  if (!q) return null;
  append(base, { kind: 'buried', key: q.key, question: q.question, id, reason, at });
  return { ...q, id };
}

/**
 * Every question whose answer the corpus held and did not serve, with the entry that should have
 * been served. This is a held-out set that grows by being used.
 */
export function buriedQuestions(base) {
  const out = [];
  for (const row of read(base)) if (row.kind === 'buried') out.push({ key: row.key, question: row.question, want: row.id, reason: row.reason ?? null, at: row.at });
  return out;
}

/** Experiential entries served and not since confirmed or disputed by anyone. */
export function unconfirmedUses(base) {
  const seen = new Map();
  for (const row of read(base)) {
    if (row.kind === 'use') seen.set(row.id, row.at);
    else if (row.kind === 'settled') seen.delete(row.id);
  }
  return [...seen.entries()].map(([id, at]) => ({ id, at })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * The one line every other verb prints. Short on purpose: a reminder that takes a paragraph gets
 * skipped, and this one has to survive being seen a hundred times in a session.
 */
export function loopBanner(base) {
  const open = openQuestions(base);
  const uses = unconfirmedUses(base);
  if (!open.length && !uses.length) return null;
  const parts = [];
  if (open.length) parts.push(`${open.length} question(s) asked and nothing written back`);
  if (uses.length) parts.push(`${uses.length} observation(s) served and not confirmed — ${uses.slice(0, 3).map((u) => u.id).join(', ')}`);
  return `open loop: ${parts.join(' · ')} — \`kb demand\``;
}
