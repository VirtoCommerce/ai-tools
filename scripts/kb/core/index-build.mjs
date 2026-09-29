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

import { normalizeScope } from './index-load.mjs';

/**
 * The two counts, from the evidence itself.
 *
 * Shared with `trustOf` in verbs.mjs, which adds the label and the party count on top. The counts
 * live here because the INDEX is what has to agree with the entry -- `ask` reports a disagreement
 * as drift, and a drift detector built on a second implementation of the thing it compares is a
 * coin toss.
 */
export function countEvidence(evidence = []) {
  const items = Array.isArray(evidence) ? evidence : [];
  const disputed = items.filter((e) => e?.contradicts).length;
  return { trust: items.length - disputed, disputed };
}

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
  const { trust, disputed } = countEvidence(data.evidence);
  return {
    id: String(data.id),
    path,
    subject: String(data.subject ?? ''),
    question: String(data.question ?? ''),
    anchors: [...new Set((data.anchors ?? []).map(anchorText).filter(Boolean))],
    scope: normalizeScope(data.appliesTo),
    plane: String(data.plane ?? 'experiential'),
    status: String(data.status ?? 'active'),
    trust,
    disputed,
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
  return { schema: 1, generated, count: sorted.length, entries: sorted };
}

/** The manifest. The plane -> index map is the extension point; `entries/` never moves (PLAN §2b). */
export function buildManifest({ indexes = { experiential: 'index.json' } } = {}) {
  return {
    schema: 1,
    idRule: 'KB-<sha256(subject) hex, first 8, uppercased>',
    indexes,
  };
}
