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
 * Is this coordinate specific enough to be matched inside a sentence?
 *
 * The shape test (`/`, `.` or a space) is necessary and not sufficient: `/api` passes it and is
 * still a namespace rather than a place. So a path must carry at least two segments, which is the
 * same threshold `namespaceOf` uses when it names a family.
 */
export function isStructuredCoordinate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (!/[/. ]/.test(s)) return false;

  const verbed = /^[A-Za-z]+\s+(\S+)$/.exec(s);
  const path = verbed ? verbed[1] : s;
  if (path.startsWith('/')) {
    // "/company/members" -> 2 segments, a place. "/api" -> 1, a namespace.
    return path.split('/').filter(Boolean).length >= 2;
  }
  // "Query.organizationContacts" -- a dotted coordinate needs something on both sides of the dot.
  if (path.includes('.')) return /[A-Za-z0-9]\.[A-Za-z0-9]/.test(path);
  // Anything else structured only by a space (a UI label like "Add to cart") is not a lookup key.
  return false;
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
 * (anchors AND scope), and it is a separate question from this one.
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
export function anchorProblems(anchors) {
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
    if (!isStructuredCoordinate(normalizeAnchor(raw))) {
      out.push({
        coordinate: raw,
        kind: 'unstructured',
        why: 'too coarse to match in free text — a coordinate needs two path segments '
          + '(/company/members, not /api) or a dotted type (Query.organizationContacts).',
      });
    }
  }
  return out;
}

export { namespaceOf, normalizeAnchor };
