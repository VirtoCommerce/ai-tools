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
// THE TEST IS NOT WORDING, AND THAT IS MEASURED. In the prior art the wording-similarity range of
// pairs that MUST collapse CONTAINS the range of pairs that must not, and one pair stating a
// single fact scored 0.00. Anchors and scope are structured and comparable; prose is not.
//
//   > Two records are the same fact when their normalised anchors and their scope axes agree.
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
 * @returns {{row: object, key: string}|null}
 */
export function findDuplicate(rows, { anchors, scope }) {
  const key = identityKey({ anchors, scope });
  if (key === '::') return null; // no anchors and no scope is not an identity, it is an empty one
  const row = rows.find((r) => r.status === 'active' && rowKey(r) === key);
  return row ? { row, key } : null;
}

/** What the writer is told when the capture is refused -- it must name the id and both next verbs. */
export function refusalMessage(row) {
  const anchors = (row.anchors ?? row.anchorKeys ?? []).join(', ');
  const scope = (row.scope ?? []).join(', ');
  return `${row.id} is already this fact — same anchors (${anchors}), same scope (${scope}).\n`
    + `  ${row.subject}\n`
    + `Read it: kb show ${row.id}\n`
    + `If it agrees with what you saw, confirm it:  kb confirm ${row.id} --deployment <env>\n`
    + `If it does not, dispute it:                  kb dispute ${row.id} --saw "<what you saw>"`;
}
