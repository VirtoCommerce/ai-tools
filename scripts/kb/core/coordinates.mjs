// Which entries name a given coordinate -- rewritten against `index.json` rows.
//
// NOT a drop-in. The lab's `coordinates.mjs` (263 lines) walks four plane DIRECTORIES and parses
// every entry file to build this map, because it had a local corpus on disk. Decision 1 deletes
// the local corpus: here the answer is already in the index, which carries `anchors` and `scope`
// on every row for exactly this reason (PLAN §2). So the WALK is gone and the RULES are kept --
// and the rules are the part that was expensive to learn.
//
// Three of them, all from PLAN §12 rule 3, and each one is a measured false-positive:
//
//   * A COORDINATE MUST BE STRUCTURED TO MATCH IN FREE TEXT -- it needs a `/`, a `.` or a space.
//     `organization` is a real GraphQL type and fired on 19 of one run's 319 calls, all false.
//   * A NAMESPACE IS NOT A PLACE. `/api` is a prefix of 675 of 700 route coordinates, so it fired
//     on every REST call any agent ever made. Two segments carry information; one does not.
//   * A PATH ON ONE MACHINE IS NOT A COORDINATE. Under Git Bash, MSYS rewrites an argument
//     beginning with `/` into a Windows path before the tool starts, so `--anchor /{category}/…`
//     arrives as `C:/Program Files/{category}/…`. One run wrote an entry that way; the correction
//     was mangled identically, by someone who had just read the failure and knew the cause.
//     Knowing about the trap does not help you avoid it, which is the argument for refusing at the
//     door rather than describing it in help text.
//
// Not carried over: `unreachableAnchors`'s `invented` classification, which asks whether a DERIVED
// entry names the coordinate. v1 has no derived plane (PLAN §11), so the question has no answer
// here and a guess at it would be worse than its absence.

import { LOOKS_LIKE_A_LOCAL_PATH, LOOKS_LIKE_A_MENU_PATH, MSYS_REMEDY, namespaceOf, normalizeAnchor } from './anchors.mjs';

/**
 * The one-segment roots the CORPUS uses as namespaces: a root under which two or more distinct
 * deeper anchors live. `/api` is one (it roots most REST anchors); `/cart` is not — it is the page
 * the storefront's whole checkout happens on, and refusing it made KB-50EBEEE9 unreachable by the
 * one question that needed it (SMOKE-2026-09-23-0733: `/cart CyberSource … Place order` missed an
 * entry about exactly that). Derived from the rows, never listed: a hardcoded list of storefront
 * routes would be correct once and stale at the next theme release.
 *
 * @returns {Set<string>} lowercased root segments, without the slash
 */
export function namespaceRoots(rows) {
  return new Set([...deeperByRoot(rows)].filter(([, paths]) => paths.size >= 2).map(([root]) => root));
}

/**
 * The one walk both questions share: lowercased root segment -> Map(lowercased deeper route -> the
 * anchor key as the corpus spells it). `namespaceRoots` counts the routes; `door-hints.mjs`
 * `deeperUnder` shows a few of them (`activeOnly`) as what a full route under a namespace looks like.
 */
export function deeperByRoot(rows, { activeOnly = false } = {}) {
  const deeper = new Map();
  for (const row of rows ?? []) {
    if (activeOnly && row.status && row.status !== 'active') continue;
    for (const key of row.anchorKeys ?? []) {
      const path = routeOf(key);
      if (!path) continue;
      const segs = path.split('/').filter(Boolean);
      if (segs.length < 2) continue;
      const root = segs[0].toLowerCase();
      if (!deeper.has(root)) deeper.set(root, new Map());
      const paths = deeper.get(root);
      if (!paths.has(path.toLowerCase())) paths.set(path.toLowerCase(), String(key));
    }
  }
  return deeper;
}

// The route of a coordinate, with any leading HTTP verb dropped; null when it is not a route.
export function routeOf(raw) {
  const s = String(raw ?? '').trim();
  const path = /^[A-Za-z]+\s+(\S+)$/.exec(s)?.[1] ?? s;
  return path.startsWith('/') ? path : null;
}

/** A one-segment path such as `/cart` — a page or a namespace, which only the corpus can tell. */
export function isSingleSegmentPath(raw) {
  const path = routeOf(raw);
  return Boolean(path) && path.split('/').filter(Boolean).length === 1;
}

/**
 * Is this coordinate specific enough to be matched inside a sentence?
 *
 * The shape test (`/`, `.` or a space) is necessary and not sufficient: `/api` passes it and is
 * still a namespace rather than a place. So a path carries at least two segments — or ONE, when the
 * caller passes the corpus's `namespaces` (see `namespaceRoots`) and the segment is not among them.
 * Without `namespaces` a one-segment path is refused, which is the conservative answer when the
 * corpus is not at hand.
 */
export function isStructuredCoordinate(raw, { namespaces } = {}) {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (!/[/. ]/.test(s)) return false;

  const verbed = /^[A-Za-z]+\s+(\S+)$/.exec(s);
  const path = verbed ? verbed[1] : s;
  if (path.startsWith('/')) {
    // "/company/members" -> 2 segments, a place. "/api" -> 1, a namespace. "/cart" -> 1, a page,
    // unless the corpus roots deeper anchors under it.
    const segs = path.split('/').filter(Boolean);
    if (segs.length >= 2) return true;
    if (segs.length !== 1 || !namespaces || /[{}]/.test(segs[0])) return false;
    return !namespaces.has(segs[0].toLowerCase());
  }
  // "Query.organizationContacts" -- a dotted coordinate needs something on both sides of the dot.
  if (path.includes('.')) return /[A-Za-z0-9]\.[A-Za-z0-9]/.test(path);
  // Anything else structured only by a space (a UI label like "Add to cart") is not a lookup key.
  return false;
}

/**
 * The SHAPE of a coordinate, for a log that must not carry the coordinate itself (VCST-6102): the
 * type the `isStructuredCoordinate` test reads it as, and how many segments it has. Numbers and an
 * enum only — a rejected anchor is by definition one nobody vetted, and the base is public.
 *
 * `dotted`, not `graphql`: the rule reads any dot-joined token that way (`Query.products`, but also
 * `app.js` or `Query.`), so the shape says what the rule saw rather than guessing what it was meant as.
 *
 * @returns {{type: 'path'|'dotted'|'prose', segments: number}}
 */
export function anchorShape(raw) {
  const s = String(raw ?? '').trim();
  const route = routeOf(s);
  if (route) return { type: 'path', segments: route.split('/').filter(Boolean).length };
  if (!/\s/.test(s) && s.includes('.')) return { type: 'dotted', segments: s.split('.').filter(Boolean).length };
  return { type: 'prose', segments: s.split(/\s+/).filter(Boolean).length };
}

/**
 * normalised coordinate -> the rows that name it.
 *
 * Built from the index rather than from entry bodies, which is the whole saving of decision 1:
 * the lab did 287 small file reads to answer this and called it worth the cost; here it is zero
 * reads, because the index row already carries the anchors.
 */
export function coordinateIndex(rows) {
  const byCoordinate = new Map();
  for (const row of rows) {
    if (row.status && row.status !== 'active') continue;
    for (const key of row.anchorKeys ?? []) {
      if (!key) continue;
      if (!byCoordinate.has(key)) byCoordinate.set(key, []);
      byCoordinate.get(key).push(row);
    }
  }
  return byCoordinate;
}

/**
 * Rows that already name one of these coordinates -- what somebody else observed at this place.
 *
 * SHOWN, NEVER ENFORCED. Two entries sharing a coordinate are usually two honest facts about one
 * place, and that is the normal state of a working corpus. Refusal is the identity check's job
 * (anchors AND scope AND claim), and it is a separate question from this one.
 */
export function neighbours(rows, anchors, { exclude = null } = {}) {
  const index = coordinateIndex(rows);
  const out = [];
  const seen = new Set();
  for (const anchor of anchors ?? []) {
    const key = normalizeAnchor(typeof anchor === 'string' ? anchor : anchor?.coordinate);
    if (!key) continue;
    for (const row of index.get(key) ?? []) {
      if (row.id === exclude || seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ ...row, coordinate: key });
    }
  }
  return out;
}

/**
 * What is wrong with an anchor somebody is about to write, said while the page is still open.
 *
 * That placement is the point: the only party who can tell a misremembered coordinate from a real
 * one is the person who was just looking at the screen. Afterwards, nobody can.
 *
 * @returns {Array<{coordinate: string, kind: 'local-path'|'menu-path'|'unstructured', why: string}>}
 */
export function anchorProblems(anchors, { namespaces } = {}) {
  const out = [];
  for (const anchor of anchors ?? []) {
    const raw = String(typeof anchor === 'string' ? anchor : anchor?.coordinate ?? '').trim();
    if (!raw) continue;
    if (LOOKS_LIKE_A_LOCAL_PATH.test(raw)) {
      out.push({ coordinate: raw, kind: 'local-path', why: MSYS_REMEDY });
      continue;
    }
    if (LOOKS_LIKE_A_MENU_PATH.test(raw)) {
      out.push({
        coordinate: raw,
        kind: 'menu-path',
        why: 'a menu path is honest about where somebody stood, but nothing can ever raise it — '
          + 'no contract diff notices that a blade moved. Move it to the body.',
      });
      continue;
    }
    if (!isStructuredCoordinate(normalizeAnchor(raw), { namespaces })) {
      out.push({
        coordinate: raw,
        kind: 'unstructured',
        why: 'too coarse to match in free text — a coordinate needs two path segments '
          + '(/company/members, not /api), a one-segment page the base does not use as a namespace '
          + '(/cart), or a dotted type (Query.organizationContacts).',
      });
    }
  }
  // THE NORMALISED COORDINATE RIDES ALONG (PR #313 review 2). The verdict above is computed on
  // `normalizeAnchor(raw)`, so any follow-up test on the SAME coordinate must use the same value:
  // testing the raw string made `{FRONT_URL}/cart` and a full URL fail a carve-out that `/cart`
  // passes, although all three normalise to `/cart`. `coordinate` stays raw — it is what the writer
  // typed, and the message has to quote it back.
  return out.map((p) => ({ ...p, normalized: normalizeAnchor(p.coordinate) }));
}

export { namespaceOf, normalizeAnchor };

// ── what kind of place an anchor names (VCST-6122 Decision 5) ─────────────────────────────────

/** The closed set `anchorKind` returns from. `null` means "none of these", never "unknown yet". */
export const ANCHOR_KINDS = ['rest', 'page', 'blade', 'graphql-op', 'graphql-field', 'setting'];

const VERB_ROUTE = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/\S*$/i;
const GRAPHQL_ROOT = /^(?:Query|Mutation|Mutations|Subscription)\.[A-Za-z_]\w*$/;
const GRAPHQL_PATH = /^(?:Query|Mutation|Mutations|Subscription)(?:\.[A-Za-z_]\w*){2,}$/;
const TYPE_FIELD = /^[A-Z][A-Za-z0-9]*\.[a-z_][A-Za-z0-9_]*$/;
const SETTING = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*){2,}$/;

/**
 * The kind of an anchor, DERIVED from the coordinate as written and never typed by the agent: a
 * kind a writer declares is a second copy of what the string already says, and the copy is the
 * part that drifts. Read from the raw text, because normalisation lowercases and `Query.cart` and
 * `CartType.coupons` differ only in case.
 *
 * A route without a verb is a REST route only under `/api/` or `/connect/`; any other leading-slash
 * path is a storefront page. `#!/...` is the Admin SPA's hash route, and a menu path
 * (`Admin SPA: Orders > …`) names a blade as well. `Query.cart.availablePaymentMethods` is a field
 * reached through an operation, so it is a field, not the operation.
 *
 * @returns {string|null} one of ANCHOR_KINDS, or null
 */
export function anchorKind(raw) {
  const s = String(typeof raw === 'string' ? raw : raw?.coordinate ?? '').trim();
  if (!s) return null;
  if (VERB_ROUTE.test(s)) return 'rest';
  if (s.startsWith('#!/') || LOOKS_LIKE_A_MENU_PATH.test(s)) return 'blade';
  if (s.startsWith('/')) return /^\/(?:api|connect)(?:\/|$)/i.test(s) ? 'rest' : 'page';
  if (GRAPHQL_ROOT.test(s)) return 'graphql-op';
  if (GRAPHQL_PATH.test(s) || TYPE_FIELD.test(s)) return 'graphql-field';
  if (SETTING.test(s)) return 'setting';
  return null;
}
