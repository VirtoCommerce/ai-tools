// WHO WROTE A ROW, SET BY THE TOOL, NEVER TYPED.
//
// Until 2026-09-16 `--by` was a free string. Fifteen evidence rows in the live corpus carried
// `by: round2-arm-B` and the like, with round-minute timestamps such as `2026-09-15T09:00:00.000Z`.
// No arm ever ran a writing verb. Those rows were typed by the author on 2026-09-16, reading arm
// reports, and dated to when the arm had run. The second independent review found it; this module
// is the fix it asked for.
//
// That one practice corrupted three instruments at once:
//
//   1. TRUST. `experientialTrust` counts distinct `by` values as independent parties. Three entries
//      stood at `confirmed` on one party's transcription of three reports -- precisely the
//      self-confirmation the independence rule had been written days earlier to stop.
//   2. THE ARRIVAL REPLAY. It counts an entry as pre-existing if its first `at:` predates the run.
//      A row dated to the run it was transcribed from reads as help that was already there.
//   3. EVERY NUMBER DOWNSTREAM. "Adding nine delivery addresses moved arrivals 295 -> 316" is 246
//      -> 246 once the pre-existence filter is applied, and the "two calls" gained by mining were
//      one backdated entry. Both are zero.
//
// The rule now: the tool writes `by` and `at`. A writer may say where a claim was READ FROM
// (`from`), which is a path that has to exist and can be audited; a writer may not say who
// observed it or when. The corpus can hold "arm B's report says X". It must not hold "arm B
// confirmed X".

import { existsSync } from 'node:fs';
import { isAbsolute, resolve as resolvePath } from 'node:path';
import { hostname, userInfo } from 'node:os';
import { createHash } from 'node:crypto';

export class ProvenanceRefused extends Error {}

/**
 * The party writing this row, as the tool sees it -- not as the writer describes it.
 *
 * A session id is the cheapest identity that a writer cannot choose for itself. It is a proxy for
 * a party, not a person: two sessions of the same model are counted as two, which overstates
 * independence, and one session writing all day is counted as one, which is the failure that
 * actually happened. Overstating is the direction to err in only because the alternative -- a
 * writer naming its own witnesses -- has already produced three false `confirmed` entries here.
 */
export function sessionParty(env = process.env) {
  const id = env.CLAUDE_CODE_SESSION_ID ?? env.KB_SESSION_ID ?? '';
  if (!id) return null;
  return `session:${id.replace(/-/g, '').slice(0, 8)}`;
}

/**
 * Who to stamp on a row when no session names itself.
 *
 * `sessionParty` returns null outside a Claude Code session, and it should: an invented session id
 * is worse than none. But null on the row is what let ONE actor confirm their own entry — a plain
 * terminal, a CI job or a script writes two authorless rows, `partiesOf` cannot tell them apart,
 * counts two, and the entry reaches `confirmed`, which is the licence to act without re-verifying.
 * Reproduced 2026-09-18 in two commands.
 *
 * A machine is a coarser identity than a session and it is a REAL one — not invented, just less
 * precise. It errs in the safe direction: two different people working on one machine read as one
 * party, never as two. Rows written before this carry no author and keep the permissive reading
 * they were graded under, so nothing already in the corpus moves.
 */
export function writerParty(env = process.env) {
  const named = sessionParty(env);
  if (named) return named;
  const who = `${hostname()}|${userInfo().username}`;
  return `machine:${createHash('sha256').update(who).digest('hex').slice(0, 8)}`;
}

/**
 * A row transcribed out of a report says so, and names a file that exists.
 *
 * This is the honest shape for what the fifteen rows were doing. It keeps the signal -- three arms
 * really did rediscover KB-27B4CD10 independently, which is the least contaminated demand signal
 * this project has -- while making the claim auditable: the path is on disk and a reader can open
 * it and disagree. A `by` string naming an arm was neither.
 */
export function transcriptionSource(from, { root = process.cwd() } = {}) {
  if (from === undefined || from === null || from === '') return null;
  const abs = isAbsolute(from) ? from : resolvePath(root, from);
  if (!existsSync(abs)) {
    throw new ProvenanceRefused(
      `--from refused: ${from} does not exist. A transcribed row names the artefact it was read out of, ` +
      'and the point of naming it is that somebody else can open it. A path nothing resolves to is a ' +
      'claim about a report rather than a reference to one.',
    );
  }
  return from.split(String.fromCharCode(92)).join(String.fromCharCode(47));
}

/**
 * The parties behind a set of rows, for counting independence.
 *
 * A transcription's party is the ARTEFACT, not the typist: one author copying three arm reports is
 * three independent observations badly recorded, not one observation. What was wrong before was
 * that the artefact was unnamed and unopenable, so the claim could not be checked. Rows with
 * neither `from` nor `by` -- the 121 rows written before any of this existed -- each count as
 * their own party, which is what they have always done.
 */
/**
 * A row marked `attested: false` is kept and does not vote.
 *
 * `confirm` has never taken a note, so no row in this corpus records what its author saw. That is a
 * gap in the verb, not a verdict on the rows, and it is NOT what this flag is for. A row earns the
 * flag only when somebody has gone to the artefact and established that nothing was observed:
 * round four's `KB-7E35E6BC` row confirms a claim about order timestamps, and the arm's report,
 * archived beside the log, is about pricing and contains no timestamp anywhere.
 *
 * The temptation is to sweep. 40 of the corpus's 47 confirm rows carry no `from`, and demoting all
 * of them takes the licensed set -- two or more parties, not disputed, the set an agent may act on
 * without re-verifying -- from 23 entries to 7. Thirty-seven of those rows carry no author either;
 * they predate `sessionParty` and there is no artefact to check them against. Marking them
 * unattested would be inventing a verdict on rows nobody can read, which is the same move as a
 * writer typing its own witnesses, pointed the other way.
 */
export function isAttested(row) {
  return row.attested !== false;
}

export function partiesOf(rows) {
  rows = rows.filter(isAttested);
  // A SESSION CANNOT VOTE TWICE BY CITING ITSELF. Condition set by the second review when it
  // accepted the artefact rule: `from ?? by` let one session count once for a row it typed unaided
  // and again for a row citing an artefact it had produced. Not present in the data when the rule
  // landed; one line to keep it that way.
  //
  // The test is deliberately crude — a session that wrote an unaided row on an entry gets no extra
  // party for also citing an artefact on it. It over-corrects where the artefact is genuinely
  // somebody else's, and that is the safe direction: this project has already published three
  // `confirmed` entries that rested on one party.
  const unaided = new Set(rows.filter((r) => r.by && !r.from).map((r) => r.by));
  // A row with no `by` counts as its own author, because the tool cannot tell. That is deliberately
  // permissive and it is what keeps this from re-grading the corpus: the rows written before
  // authorship was recorded carry no author, so their levels are untouched. The rule only ever
  // tightens, and only for rows that say who wrote them.
  //
  // COLLAPSING THEM TO ONE PARTY WAS TRIED ON 2026-09-18 AND REVERTED, which is worth recording
  // because the first measurement said it was free. It was taken over `captured` and `rules` only:
  // 0 entries of 318 moved. The FLOW plane was not measured and is where the anonymous rows
  // actually sit — 2 of the 3 flows crossed the `confirmed` threshold (KB-AFB2D3C5 5→1,
  // KB-EB228603 3→1), which also breaks the byte-compared `flows-catalog.md` because the catalog
  // carries the count. Re-grading a published corpus is a decision about the corpus, not a
  // tightening of a tool.
  //
  // The hole it was aimed at is real and is closed at the WRITING end instead, where it costs
  // nothing: see `writerParty` below. Every new row is signed, so two rows by one actor can be seen
  // to be one actor. Legacy rows keep the permissive reading they were graded under.
  const named = new Set();
  let anonymous = 0;
  for (const r of rows) {
    if (r.from && r.by && unaided.has(r.by)) continue;
    const key = r.from ?? r.by;
    if (key) named.add(key); else anonymous += 1;
  }
  return named.size + anonymous;
}
