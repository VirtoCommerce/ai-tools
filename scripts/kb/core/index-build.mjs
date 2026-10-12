// Building `index.json` from entries (PLAN §2 "The index").
//
// One builder, two callers, and that is the point. The MIGRATION writes the index for 89 entries
// it has just transformed; `reindex` rebuilds it from every entry after a botched push or a hand
// edit. If those computed a row differently -- one of them forgetting that `trust` counts only the
// non-contradicting evidence, say -- the repair verb would "fix" the index into a different file
// than the writer produces, and the drift it exists to remove would become permanent. So the row
// is defined once, here, and neither caller is allowed its own opinion of the shape.
//
// WHAT A ROW IS FOR: ranking, dedup and finding. Nothing needed to READ an entry is in it -- that
// is what `path` is for. And `trust`/`disputed` are COMPUTED from `evidence[]` and never declared
// (PLAN §12 rule 5): a declared count is a second copy of something that already has a home, and
// the second copy is the one that goes stale.

import { createHash } from 'node:crypto';

import { idList, normalizeScope, textList } from './index-load.mjs';

/**
 * The two counts, from the evidence itself.
 *
 * Shared with `trustOf` in verbs.mjs, which adds the label and the party count on top. The counts
 * live here because the INDEX is what has to agree with the entry -- `ask` reports a disagreement
 * as drift, and a drift detector built on a second implementation of the thing it compares is a
 * coin toss.
 */
export function countEvidence(evidence = []) {
  // An item a MERGE carried in from a session that had already supported the survivor
  // (`duplicateSession`, merge-entries.mjs) is kept for provenance and not counted: one agent seeing
  // one fact once, filed twice, is one observation, not a corroboration.
  const items = (Array.isArray(evidence) ? evidence : []).filter((e) => !e?.duplicateSession);
  const contradicting = items.filter((e) => e?.contradicts);
  // `disputed` counts the OPEN disputes only. A dispute a judge resolved stays on the entry -- it is
  // the history of the claim -- but it no longer flags it: before this, an entry a human had already
  // settled (KB-27B4CD10, 2026-09-20) was served as DISPUTED forever (VCST-6179).
  const resolved = contradicting.filter(isResolved).length;
  return { trust: supportOf(items).length, disputed: contradicting.length - resolved, resolved };
}

/** The judge's own observation (`kb:disputes observe`): made of the behaviour the verdict settles. */
export const isInvestigation = (e) => e?.investigation === true && !e?.contradicts;

/**
 * The body an evidence item was applied to, as a short hash (`bodyHash` on the item, `amendedFrom` on
 * a `claim-amended` resolution). Line endings and surrounding whitespace do not change a claim.
 */
export const claimHash = (body) => createHash('sha256').update(String(body ?? '').replace(/\r\n/g, '\n').trim()).digest('hex').slice(0, 12);

/**
 * Every time a judge CORRECTED the entry's claim (`claim-amended`): when it was resolved, when the
 * dispute it closed was filed, and -- when the resolution recorded it -- the hash of the body it
 * corrected. Copies of one dispute (a split or merge) give one amendment each; harmless.
 */
export function amendmentsOf(evidence = []) {
  return (Array.isArray(evidence) ? evidence : [])
    .filter((e) => isResolved(e) && e.resolved === 'claim-amended')
    .map((e) => ({ at: Date.parse(String(e.resolvedAt ?? '')), disputeAt: Date.parse(String(e.at ?? '')), from: e.amendedFrom ?? null }));
}

/**
 * Does a supporting item attest the claim AS IT STANDS? A confirmation of the wording a judge later
 * corrected stays on the entry as history and stops counting (VCST-6179 review): an amended entry
 * would otherwise read "well attested" by sessions that never saw the behaviour it now states. The
 * other verdicts do not reset support: under `version-scoped` / `conditions-scoped` / `split` the
 * earlier confirmations saw one true half of what the entry now says.
 *
 * An item PREDATES an amendment when either is true:
 *   - TIME: it was made before the resolution -- or, for the judge's own investigation, which is
 *     written before `resolve` and observes the corrected behaviour, before the dispute it settles
 *     (so the investigation of an EARLIER round does not carry over a later correction);
 *   - BODY: it was applied to the body the amendment corrected (`bodyHash` = `amendedFrom`). This is
 *     what catches a confirmation that reached `main` while the judge's PR was in review: made after
 *     the resolution, of the old wording. `push` stamps `bodyHash` on every item it applies.
 * An item whose `at` does not parse cannot be placed after anything, so it predates.
 */
export function attestsCurrentClaim(e, amendments = []) {
  if (!amendments.length) return true;
  const t = Date.parse(String(e?.at ?? ''));
  return !amendments.some((a) => {
    if (a.from && e?.bodyHash && e.bodyHash === a.from) return true;
    if (!Number.isFinite(t)) return true;
    const edge = isInvestigation(e) ? a.disputeAt : a.at;
    return Number.isFinite(edge) && t <= edge;
  });
}

/**
 * The items that count as support: not contradicting, not a duplicate, attesting the current claim --
 * and the judge's investigation ONCE PER SESSION. One judge checking three stands is one run, not
 * three corroborations: counted per item, a single `/kb-judge` session made an amended entry
 * "well attested" on its own (VCST-6179 review).
 */
export function supportOf(evidence = []) {
  const items = (Array.isArray(evidence) ? evidence : []).filter((e) => !e?.duplicateSession);
  const amendments = amendmentsOf(items);
  const investigators = new Set();
  return items.filter((e) => {
    if (e?.contradicts || !attestsCurrentClaim(e, amendments)) return false;
    if (!isInvestigation(e) || !e.by) return true;
    if (investigators.has(e.by)) return false;
    investigators.add(e.by);
    return true;
  });
}

/**
 * How a judge closed a dispute (VCST-6179, `/kb-judge`). Written ON the contradicting evidence item,
 * never as an item of its own: a client from before this field still reads the dispute as open
 * (stale, never wrong), where a separate item would be counted by it as one more confirmation.
 *
 *   claim-amended        the dispute was right; the entry's claim was corrected
 *   version-scoped       both sides were right on different builds; the entry names the build range
 *   conditions-scoped    both sides were right under different settings; the entry names the condition
 *   split                the entry held two facts; each now lives in its own entry
 *   dispute-wrong        the entry holds; the dispute misread what it saw
 *
 * A value outside this list resolves nothing -- a typo must not close a dispute silently.
 */
export const RESOLUTIONS = Object.freeze(['claim-amended', 'version-scoped', 'conditions-scoped', 'split', 'dispute-wrong']);
export const isResolved = (e) => Boolean(e?.contradicts) && RESOLUTIONS.includes(e?.resolved);

/** The fields a resolution writes onto a contradicting item -- the only in-place edit an item ever gets. */
export const RESOLUTION_FIELDS = Object.freeze(['resolved', 'resolvedAt', 'resolvedBy', 'resolvedIn', 'resolution', 'amendedFrom']);

/** An anchor is `{coordinate}` or a bare string; both name one place. Rows carry it as written. */
const anchorText = (a) => String(typeof a === 'string' ? a : a?.coordinate ?? '').trim();

/**
 * One entry's frontmatter -> one index row, in the canonical key order.
 *
 * Key order is fixed for the same reason the frontmatter writer fixes it: the index is written by
 * whoever writes an entry, and a row whose keys move produces a diff on every push that touches
 * anything. A diff nobody can read is a diff nobody reviews.
 */
export function buildRow(data, path) {
  const { trust, disputed, resolved } = countEvidence(data.evidence);
  // The card and the retirement pointer are written only when the entry has them. A key on every
  // row would change every row the first time a client from this change pushed, and a client from
  // before it would take the key off again on its next push -- the same row flapping between two
  // shapes until the whole team had pulled (VCST-6122 Decision 8).
  const questions = textList(data.questions);
  const concepts = idList(data.concepts);
  const supersededBy = idList(data.supersededBy);
  return {
    id: String(data.id),
    path,
    subject: String(data.subject ?? ''),
    question: String(data.question ?? ''),
    ...(questions.length ? { questions } : {}),
    ...(concepts.length ? { concepts } : {}),
    anchors: [...new Set((data.anchors ?? []).map(anchorText).filter(Boolean))],
    scope: normalizeScope(data.appliesTo),
    plane: String(data.plane ?? 'experiential'),
    status: String(data.status ?? 'active'),
    ...(supersededBy.length ? { supersededBy } : {}),
    trust,
    disputed,
    // Only when there is one, for the reason the card keys above are optional.
    ...(resolved ? { resolved } : {}),
  };
}

/** Where an entry lives, given its id. One rule, so the index and the writer cannot disagree. */
export const entryPath = (id) => `entries/${id}.md`;

/**
 * The whole index file.
 *
 * Sorted by id, which is neither alphabetical-by-accident nor insertion order: the id is derived
 * from the subject, so sorting by it is stable across machines and across runs, and two people
 * rebuilding the same corpus get the same bytes. `count` is the field `stat` compares against the
 * number of blobs under `entries/` to detect drift in ONE call (PLAN §2).
 */
export function buildIndex(rows, { generated = new Date().toISOString() } = {}) {
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  // Schema 2 is DERIVED from the rows -- any row carrying a card or a retirement pointer -- never
  // chosen by the caller: a pushing client must not turn a migrated index back into schema 1, nor
  // stamp 2 on a base that holds no schema-2 field (VCST-6122 Decision 8).
  const schema = sorted.some((r) => r.questions || r.concepts || r.supersededBy) ? 2 : 1;
  return { schema, generated, count: sorted.length, entries: sorted };
}

/** The manifest. The plane -> index map is the extension point; `entries/` never moves (PLAN §2b). */
export function buildManifest({ indexes = { experiential: 'index.json' } } = {}) {
  return {
    schema: 1,
    idRule: 'KB-<sha256(subject) hex, first 8, uppercased>',
    indexes,
  };
}
