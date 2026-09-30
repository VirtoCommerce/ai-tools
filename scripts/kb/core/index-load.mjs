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
import { anchorKind } from './coordinates.mjs';

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
 * @property {(string|null)[]} anchorKinds  parallel to `anchors`, derived (coordinates.mjs `anchorKind`)
 * @property {string[]} scope        `axis=value`, normalised and sorted
 * @property {string[]} surfaces     canonical, derived from `scope` (SURFACES)
 * @property {string} plane
 * @property {string} status
 * @property {string[]} supersededBy ids; empty unless the entry was retired or split
 * @property {string[]} questions    the retrieval card's questions (schema 2); empty on a schema-1 row
 * @property {string[]} concepts     vocabulary concept ids (schema 2); empty on a schema-1 row
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

/**
 * `surface` as a closed set (VCST-6122 Decision 5). The corpus spells the axis eighteen ways; the
 * table maps every spelling that names ONE of these six unambiguously (UCP and the vendor portal are
 * surfaces of their own; background jobs are observed through the platform REST API). A spelling it does not
 * list -- `api` names UCP on some entries and the platform REST API on others -- canonicalises to
 * nothing, which the per-entry migration (M2) resolves by reading the entry, never by guessing here.
 *
 * DERIVED AT LOAD, not stored in the index: a client from before this change rebuilds every row it
 * touches without the field, so a stored copy would flap between the two versions on every push.
 */
export const SURFACES = ['storefront-ui', 'xapi', 'rest', 'admin-ui', 'ucp', 'vendor-ui'];
export const SURFACE_SPELLINGS = {
  // Every canonical value spells itself -- derived, so a value added to SURFACES cannot be missed.
  ...Object.fromEntries(SURFACES.map((s) => [s, s])),
  xapi: 'xapi', 'storefront-xapi': 'xapi', 'graphql-xapi': 'xapi', graphql: 'xapi',
  rest: 'rest', 'rest-api': 'rest', 'platform-api': 'rest', 'platform-rest': 'rest', 'backend-api': 'rest', 'admin-api': 'rest',
  'background-jobs': 'rest',
  'admin-ui': 'admin-ui', 'admin-spa': 'admin-ui',
  'ucp-mcp': 'ucp', 'ucp-rest': 'ucp',
  'vendor-portal-ui': 'vendor-ui',
};

/** The canonical surfaces of a normalised scope, in SURFACES order. */
export function surfacesOf(scope) {
  const out = new Set();
  for (const item of scope ?? []) {
    const m = /^surface=(.+)$/.exec(item);
    if (m && SURFACE_SPELLINGS[m[1]]) out.add(SURFACE_SPELLINGS[m[1]]);
  }
  return SURFACES.filter((s) => out.has(s));
}

/** `supersededBy`, `concepts`: a bare id, a list of ids, or a list of `{id}` -- one list of ids. */
export const idList = (v) => asArray(v).map((x) => String(typeof x === 'object' && x ? x.id ?? '' : x ?? '').trim()).filter(Boolean);

/** `questions`: a list of `{text}` or of bare strings -- one list of texts. */
export const textList = (v) => asArray(v).map((x) => String(typeof x === 'object' && x ? x.text ?? '' : x ?? '').trim()).filter(Boolean);

/** One raw index row -> the shape everything above this file uses. */
export function normalizeRow(raw, { index = 'index.json' } = {}) {
  const anchors = asArray(raw.anchors).map(anchorText).filter(Boolean);
  const scope = normalizeScope(raw.scope ?? raw.appliesTo);
  return {
    id: String(raw.id),
    path: String(raw.path),
    subject: String(raw.subject ?? ''),
    question: String(raw.question ?? ''),
    anchors,
    anchorKeys: [...new Set(anchors.map(normalizeAnchor).filter(Boolean))].sort(),
    // Parallel to `anchors`, derived here for the reason `surfaces` is (see SURFACES).
    anchorKinds: anchors.map(anchorKind),
    scope,
    surfaces: surfacesOf(scope),
    plane: String(raw.plane ?? 'experiential'),
    status: String(raw.status ?? 'active'),
    supersededBy: idList(raw.supersededBy),
    questions: textList(raw.questions),
    concepts: idList(raw.concepts),
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
 * Index schema 1 and 2 are read by the same path: schema 2 only ADDS optional row fields
 * (`questions`, `concepts`, `supersededBy`), every one of which defaults to empty, so a schema-1 row
 * is a schema-2 row without a card. That is what lets the data migrate after the client (VCST-6122
 * Decision 8) -- and why nothing here compares `schema`.
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
