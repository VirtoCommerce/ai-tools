// Identity and duplicates (PLAN §2). This is in v1, not the next iteration -- because without it
// the design MANUFACTURES the very failure it warns about.
//
// The mechanism, stated plainly: v1's ranking is deliberately dumb (rank.mjs). A dumb ranker
// sometimes misses an entry that is there. But a miss is exit 1, and exit 1 tells the agent "go
// find out and write it down". So a RETRIEVAL failure turns directly into a second entry for a
// fact the base already holds -- and nobody notices, because both entries look fine.
//
// This check turns that inside out. A ranking miss that would have produced a duplicate produces a
// CONFIRMATION instead, and the base gets more trustworthy out of a retrieval failure rather than
// more bloated.
//
// THE TEST IS NOT WORDING SIMILARITY, AND THAT IS MEASURED. In the prior art the wording-similarity
// range of pairs that MUST collapse CONTAINS the range of pairs that must not, and one pair stating
// a single fact scored 0.00. So no similarity threshold decides identity.
//
// BUT ANCHORS + SCOPE ALONE ARE A PLACE, NOT A FACT (VCST-6102). One coordinate holds many honest
// facts, and on 2026-09-28 the anchors+scope-only rule refused 9 captures of which 7 were DIFFERENT
// facts ("vcptcore-qa admin password is expired" as a duplicate of "Sales Rep details blade requires
// first/last name"). At push time 4 of those were then CONVERTED into a confirmation of the unrelated
// incumbent: the new claim was written nowhere and the incumbent gained trust nobody earned.
//
//   > Two records are the same fact when their normalised anchors and scope axes agree AND their
//   > subjects are equal after `claimKey` normalisation (case, whitespace, punctuation).
//
// Equality, not similarity, on purpose: it is the conservative end. A reworded repeat at the same
// coordinate now becomes a second entry, which is visible and cheap to consolidate; the old rule's
// failure was invisible and destroyed a claim. A fuzzy threshold is a separate, measured decision.
//
// THE ACCEPTED LIMIT, stated rather than hidden: an agent that captures the same phenomenon under
// DIFFERENT anchors evades the test and a second entry gets in. That is deliberate -- it fails in
// the safe direction. A duplicate exists visibly, in the catalogue and the report, rather than a
// legitimate second fact being refused invisibly. Merging those is consolidation, and that is
// genuinely next-iteration (PLAN §11) because it needs a corpus that actually has them.

import { normalizeAnchor } from './anchors.mjs';
import { normalizeScope } from './index-load.mjs';

/**
 * The identity key: normalised anchors and scope axes, each sorted, joined so two keys compare as
 * strings. Anchors alone are not enough -- the same coordinate observed on the storefront and in
 * the Admin SPA is two facts, which is what the scope axis is for.
 */
export function identityKey({ anchors = [], scope = [] } = {}) {
  const a = [...new Set(anchors
    .map((x) => normalizeAnchor(typeof x === 'string' ? x : x?.coordinate))
    .filter(Boolean))].sort();
  const s = normalizeScope(scope);
  return `${a.join('|')}::${s.join('|')}`;
}

/** The key of an already-normalised index row. */
export const rowKey = (row) => `${(row.anchorKeys ?? []).join('|')}::${(row.scope ?? []).join('|')}`;

/**
 * The claim half of identity: the subject lowercased, every run of non-letter/non-digit characters
 * collapsed to one space, trimmed. "Cart totals lag, a quantity change." and "cart totals lag a
 * quantity change" are one claim; any change of a WORD is another.
 */
export const claimKey = (subject) => String(subject ?? '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

/**
 * Does the base already hold this fact?
 *
 * Runs TWICE in the shipping design: once at `capture` against the session's cached index, and
 * again at push time against the freshly re-read index. The second run is what makes it race-free
 * rather than merely likely -- session A captures at 10:00, session B's cache predates that and
 * finds nothing at 10:05, and the push-time re-check finds it and converts B's capture into a
 * confirm. The fetch that needs is one the push already makes, so race-free dedup costs nothing.
 *
 * Only ACTIVE rows can block a capture. A retired entry is a fact the base has decided not to
 * serve; refusing a fresh observation on its account would leave the base unable to relearn
 * something it once knew.
 *
 * The CLAIM must agree too (VCST-6102). A row at the same coordinates with a different subject is
 * a different fact: it is never a duplicate, and so never converted into a confirmation at push.
 *
 * @returns {{row: object, key: string}|null}
 */
export function findDuplicate(rows, { anchors, scope, subject }) {
  const key = identityKey({ anchors, scope });
  if (key === '::') return null; // no anchors and no scope is not an identity, it is an empty one
  const claim = claimKey(subject);
  const row = rows.find((r) => r.status === 'active' && rowKey(r) === key && claimKey(r.subject) === claim);
  return row ? { row, key } : null;
}

/** What the writer is told when the capture is refused -- it must name the id and both next verbs. */
/**
 * The door's refusal when the SUBJECT is taken but the coordinates differ (PR #313 review 2). The id
 * is minted from the subject, so writing this capture would either land on the incumbent's id or be
 * refused at push. Said while the writer can still act on it: the two honest moves are to confirm
 * the incumbent (it is the same fact) or to reword the subject (it is a different one).
 */
export function subjectTakenMessage(row, { sameSubject = true } = {}) {
  const anchors = (row.anchors ?? row.anchorKeys ?? []).join(', ');
  return `${row.id} already ${sameSubject ? 'has this exact subject' : 'is the id this subject hashes to, held by a different subject'}`
    + ` at other coordinates (${anchors}).\n`
    + `  ${row.subject}\n`
    + `Read it: kb show ${row.id}\n`
    + `Same fact? confirm it:        kb confirm ${row.id} --deployment <env>\n`
    + 'Different fact? reword the subject so it says what is different, and capture again.';
}

export function refusalMessage(row) {
  const anchors = (row.anchors ?? row.anchorKeys ?? []).join(', ');
  const scope = (row.scope ?? []).join(', ');
  return `${row.id} is already this fact — same subject, same anchors (${anchors}), same scope (${scope}).\n`
    + `  ${row.subject}\n`
    + `Read it: kb show ${row.id}\n`
    + `If it agrees with what you saw, confirm it:  kb confirm ${row.id} --deployment <env>\n`
    + `If it does not, dispute it:                  kb dispute ${row.id} --saw "<what you saw>"`;
}
