// Loading and validating the two files that make a directory a base: `kb.json` and the indexes
// it declares (PLAN §2).
//
// The manifest carries the plane -> index map, which is the extension point: when a `rules` plane
// arrives it gets `index-rules.json` and ONE manifest line, and `entries/` does not move, because
// the id is globally unique. So this loads whatever the manifest declares rather than the single
// filename v1 happens to have -- five lines now, instead of a migration later.
//
// Validation is strict and it STOPS (PLAN §12 rule 2). A directory whose `kb.json` is absent or
// unparseable is not a base, and the only correct response is to say so and stop -- never to carry
// on with an empty index, which would present as "the base holds nothing on this" and is the exact
// confusion §3.5 exists to prevent.

import { normalizeAnchor } from './anchors.mjs';

/** Rows carry everything needed to RANK an entry and nothing needed to READ one (PLAN §2). */
const REQUIRED_ROW_FIELDS = ['id', 'path', 'subject'];

/**
 * @typedef {object} IndexRow
 * @property {string} id
 * @property {string} path
 * @property {string} subject
 * @property {string} [question]
 * @property {string[]} anchors      raw, as written
 * @property {string[]} anchorKeys   normalised -- the identity and ranking key
 * @property {string[]} scope        `axis=value`, normalised and sorted
 * @property {string} plane
 * @property {string} status
 * @property {number} trust          confirmations, computed at write time from evidence[]
 * @property {number} disputed
 * @property {string} index          which declared index this row came from
 */

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** An anchor may be a bare string or `{coordinate}`; both mean one place. */
const anchorText = (a) => String(typeof a === 'string' ? a : a?.coordinate ?? '').trim();

/** Scope axes are compared as `axis=value`, lowercased, de-duplicated and sorted. */
export function normalizeScope(scope) {
  const out = new Set();
  for (const item of asArray(scope)) {
    const text = typeof item === 'string'
      ? item
      : item && typeof item === 'object' ? `${item.axis}=${item.value}` : '';
    const trimmed = String(text).trim().toLowerCase();
    if (trimmed && trimmed.includes('=')) out.add(trimmed);
  }
  return [...out].sort();
}

/** One raw index row -> the shape everything above this file uses. */
export function normalizeRow(raw, { index = 'index.json' } = {}) {
  const anchors = asArray(raw.anchors).map(anchorText).filter(Boolean);
  return {
    id: String(raw.id),
    path: String(raw.path),
    subject: String(raw.subject ?? ''),
    question: String(raw.question ?? ''),
    anchors,
    anchorKeys: [...new Set(anchors.map(normalizeAnchor).filter(Boolean))].sort(),
    scope: normalizeScope(raw.scope ?? raw.appliesTo),
    plane: String(raw.plane ?? 'experiential'),
    status: String(raw.status ?? 'active'),
    trust: Number.isFinite(raw.trust) ? raw.trust : 0,
    disputed: Number.isFinite(raw.disputed) ? raw.disputed : 0,
    index,
  };
}

/**
 * Read and validate `kb.json` alone. Split out of `loadIndex` so `reindex` — which needs the manifest
 * and rebuilds the indexes from the entries — can run when an index is exactly what is broken
 * (PR #313 review 2).
 *
 * @returns {Promise<{state:'ok', manifest: object, names: string[]} | {state:'no-base'|'unreachable', why: string}>}
 */
export async function loadManifest(reader) {
  const manifestRead = await reader.readManifest();
  if (!manifestRead.ok) {
    // `missing` here is rule 2: the thing we were told is a base is not one. STOP.
    return manifestRead.reason === 'missing'
      ? { state: 'no-base', why: `no kb.json at ${reader.locator} (${manifestRead.detail})` }
      : { state: 'unreachable', why: `could not read kb.json: ${manifestRead.detail}` };
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestRead.text);
  } catch (err) {
    return { state: 'no-base', why: `kb.json at ${reader.locator} is not JSON: ${err.message}` };
  }

  // The plane -> index map. A manifest with none declared is a base with no retrieval surface,
  // which is a malformed base and not an empty one.
  const declared = manifest.indexes && typeof manifest.indexes === 'object' ? manifest.indexes : null;
  const names = declared ? [...new Set(Object.values(declared).map(String))] : [];
  if (!names.length) return { state: 'no-base', why: `kb.json at ${reader.locator} declares no indexes` };
  return { state: 'ok', manifest, names };
}

/**
 * Read `kb.json`, then every index it declares, and return the merged catalogue.
 *
 * @returns {Promise<{state:'ok', manifest: object, rows: IndexRow[], indexes: string[]}
 *                 | {state:'no-base'|'unreachable', why: string}>}
 */
export async function loadIndex(reader) {
  const m = await loadManifest(reader);
  if (m.state !== 'ok') return m;
  const { manifest, names } = m;

  const rows = [];
  for (const name of names) {
    const read = await reader.readIndex(name);
    if (!read.ok) {
      // A DECLARED index that is absent is a broken base, not an empty one -- and an index we
      // could not fetch is emphatically not an index with no matches.
      return read.reason === 'missing'
        ? { state: 'no-base', why: `kb.json declares ${name}, which is not in the base` }
        : { state: 'unreachable', why: `could not read ${name}: ${read.detail}` };
    }
    let parsed;
    try {
      parsed = JSON.parse(read.text);
    } catch (err) {
      return { state: 'no-base', why: `${name} is not JSON: ${err.message}` };
    }
    for (const raw of asArray(parsed.entries)) {
      if (!raw || typeof raw !== 'object') continue;
      const missing = REQUIRED_ROW_FIELDS.filter((f) => !raw[f]);
      if (missing.length) return { state: 'no-base', why: `${name}: a row is missing ${missing.join(', ')}` };
      rows.push(normalizeRow(raw, { index: name }));
    }
  }

  return { state: 'ok', manifest, rows, indexes: names };
}

/**
 * Rows a question may be answered from.
 *
 * Retired entries are excluded from RETRIEVAL and kept for everything else: the migration leaves
 * them out of the new base entirely (PLAN §10), but a base that does hold one must not return it,
 * and `show KB-…` on one must still work -- a reader who has an id in hand is entitled to see what
 * is behind it, including that it was retired.
 */
export const retrievable = (rows) => rows.filter((r) => r.status === 'active');
