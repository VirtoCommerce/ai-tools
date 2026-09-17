// Make the base arrive instead of being visited.
//
// Three runs consulted the base in their first minutes and never again: run 03 asked four questions
// in tool calls 7-10 of 319, then worked for 255 calls without touching it. Consulting is a place
// you go, and once work starts the page already open answers faster than anything you have to go
// and fetch. Telling an agent to go more often has been tried in three briefs and does not work.
//
// So the base comes to the work. This module answers one question: GIVEN WHAT AN AGENT IS ABOUT TO
// DO, what does the base already hold about it? No question is asked and nothing is remembered.
//
// IT MATCHES COORDINATES, NOT PROSE. That is the whole reason this is feasible here and would not
// be in an ordinary knowledge base: every entry in both planes is anchored on coordinates --
// `/company/members`, `POST /api/members/search`, `Mutations.lockOrganizationContact` -- and a tool
// call is made OF coordinates. A URL is a coordinate. A route in a curl command is a coordinate.
// There is no matching of a question against a body, so there is no relevance guesswork, and a hit
// is a hit rather than a ranking.

import { arrivalIndex } from './coordinates.mjs';

// Coordinates that are a single bare word match too much. `organization` is a real GraphQL type,
// and on a substring search it fired on 19 of run 03's 319 calls -- every URL with `organizationId`
// in a query string, none of which was an arrival at the organization type.
//
// So a coordinate has to be STRUCTURED to trigger on its own: a path (`/company/members`), a
// dotted coordinate (`Mutations.lockOrganizationContact`), or a verb-and-route
// (`POST /api/members/search`). Bare type names still match, but only when the text names them
// with a boundary on both sides -- `CartType` in a GraphQL document body, not `cartTypeId` in a
// query string.
// WHAT MAKES A COORDINATE SAFE TO MATCH IN FREE TEXT: a slash, a dot or a space.
// `GET /api/members/{id}`, `CartType.total`, `POST /api/carts` cannot appear in a sentence by
// accident; `promotion` can.
//
// A compound type name like `OrderDiscountType` is safe too, and `ask` accepts one — but the test
// for it CANNOT LIVE HERE, because `normalizeAnchor` lowercases every coordinate before it reaches
// this index, so the internal capital that makes a compound name a name is gone by now. It belongs
// on the asker's own spelling, and it is in `derivedByCoordinate` in resolve.mjs. Tried here first
// on 2026-09-16: the rule could never fire, and a rule that cannot fire reads like a live one.
const isStructured = (coordinate) => /[/.]/.test(coordinate) || coordinate.includes(' ');

// A NAMESPACE IS NOT A PLACE. `POST /api` is a real coordinate -- the derived plane's root entry
// for the REST contract is anchored on it -- and its path form `/api` is a prefix of 675 of the 700
// route coordinates in the index, so it fired on every REST call any agent ever made: 4,038 calls
// replayed on 2026-09-16, and the root entry was the commonest thing "arriving" in eleven of the
// twenty-two logs, saying nothing each time. A route whose path is a proper prefix of most of the
// routes in the index is the index's namespace; standing anywhere in it is not arriving at it.
// `/cart` and `/search` are one segment too and prefix nothing, so they still fire -- they are
// pages, and three flows and five facts are anchored on them.
const routePath = (coordinate) => {
  const lower = coordinate.toLowerCase();
  const m = lower.match(/^[a-z]+ (\/.+)$/);
  return m ? m[1] : lower.startsWith('/') ? lower : null;
};
const namespaces = new WeakMap();
function namespacesOf(index) {
  if (namespaces.has(index)) return namespaces.get(index);
  const paths = [...index.keys()].map(routePath).filter(Boolean);
  const out = new Set();
  for (const p of new Set(paths)) {
    const under = paths.filter((q) => q !== p && q.startsWith(`${p}/`)).length;
    if (under > paths.length / 2) out.add(p);
  }
  namespaces.set(index, out);
  return out;
}

// Word-boundary match, not substring. `organization` must not fire on `organizationId`; the
// boundary after it is `i`, a word character, so it does not.
//
// Both sides are lowered here, and that is not belt-and-braces. `normalizeAnchor` lowercases a
// dotted coordinate but leaves a route alone, so the index holds `mutations.lockorganizationcontact`
// next to `POST /api/members/search` with its verb still in caps. Comparing a lowered haystack
// against the raw key silently matched none of the routes -- the half of the corpus this was built
// for -- and the measurement said 2 hits in 319 calls before the cause was found.
function mentions(haystack, coordinate) {
  const wordish = (c) => c !== '' && /[a-z0-9]/.test(c);
  // The boundary is only required on an edge that is itself a word character. A coordinate that
  // starts with `/` carries its own left boundary, and demanding one in front of it is how this
  // first measured 2 hits in 319 calls: `/company/members` was rejected nine times because the
  // character before it was the `m` of `.com`.
  const needsLeft = wordish(coordinate[0]);
  const needsRight = wordish(coordinate[coordinate.length - 1]);
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(coordinate, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    const after = haystack[at + coordinate.length] ?? '';
    if ((!needsLeft || !wordish(before)) && (!needsRight || !wordish(after))) return true;
    from = at + 1;
  }
}

// A route coordinate is stored as `POST /api/members/search`, and that exact string appears in
// almost nothing an agent actually writes: `curl -X POST https://host/api/members/search` puts the
// host between the verb and the path. So the path is tried on its own as well.
//
// This drops the verb distinction -- a GET to that route will now offer an entry about the POST.
// That is the right trade: the entry is about the route, and a reader arriving at it is better off
// seeing what the base holds than being told nothing because the method differed.
const forms = (coordinate) => {
  const lower = coordinate.toLowerCase();
  const withoutVerb = lower.match(/^[a-z]+ (\/.+)$/);
  return withoutVerb ? [lower, withoutVerb[1]] : [lower];
};

/**
 * Every string in a tool call, flattened. A URL, a shell command, a GraphQL document body: the
 * coordinate could be in any of them and which field holds it differs per tool, so the shape of
 * each tool's input is deliberately not enumerated here. Enumerating it would mean this module
 * needed editing every time a new browser or HTTP tool appeared, and it would silently return
 * nothing in the meantime.
 */
export function textOf(value, depth = 0) {
  if (depth > 6) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((v) => textOf(v, depth + 1)).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map((v) => textOf(v, depth + 1)).join(' ');
  return '';
}

/**
 * What the base holds about the coordinates named in `text`.
 *
 * `index` is passed in rather than built, because the caller is a hook that runs on every tool call
 * and rebuilding a 3400-coordinate index from 602 files each time would make the agent wait on the
 * base -- which is the one thing that would guarantee this gets turned off.
 */
/**
 * Coordinates from `index` that a piece of text actually NAMES, most specific first.
 *
 * Exported because `ask` needs exactly this rule and must not grow a second one. Structure is
 * required — a coordinate has to carry a `/`, a `.` or a space — which is the whole defence against
 * the obvious failure of coordinate lookup: `Promotion` is a GraphQL type name and also an ordinary
 * English word, and a question containing it is not a question about `PromotionType`.
 */
export function structuredMatches(text, index) {
  const hay = String(text ?? '').toLowerCase();
  if (!hay) return [];
  const hits = [];
  const skip = namespacesOf(index);
  for (const [coordinate, entries] of index) {
    if (!isStructured(coordinate)) continue;
    const path = routePath(coordinate);
    if (path && skip.has(path)) continue;
    if (!forms(coordinate).some((f) => mentions(hay, f))) continue;
    hits.push({ coordinate, entries });
  }
  // Longest coordinate first: `POST /api/members/search` says more than `/api/members`, and if only
  // one line is going to be read it should be the specific one.
  return hits.sort((a, b) => b.coordinate.length - a.coordinate.length);
}

export function arrivalsFor(text, index, { limit = 3 } = {}) {
  const hits = structuredMatches(text, index);
  if (!hits.length) return [];

  // WITHIN one coordinate the order used to be whatever order the files were read in, and that was
  // invisible until a coordinate held more than the hook could show. `/sign-in` holds four entries;
  // three are shown; which three was decided by filename. Ranked now, and each step has a reason:
  //
  //   1  DISPUTED first. An entry somebody has contradicted is the single most important thing to
  //      say to a reader about to rely on it, and it arrives carrying that label.
  //   2  then by how many INDEPENDENT parties have seen it -- the corpus's own trust measure, the
  //      same count `ask` serves, rather than a second notion invented here.
  //   3  then WRITTEN before DERIVED. A contract entry is regenerable and the reader can always go
  //      and read the contract; an agent-written observation exists nowhere else.
  //
  // Coordinate specificity still decides first, above all of this: `POST /api/members/search` says
  // more about where you are standing than `/api/members`, and where you are standing is the whole
  // premise of arriving.
  const rank = (e) => (e.disputed ? 0 : 1);
  const written = (e) => (e.plane === 'derived-first' ? 1 : 0);
  for (const hit of hits) {
    hit.entries = [...hit.entries].sort(
      (a, b) => rank(a) - rank(b)
        || written(a) - written(b)
        || (b.independent ?? 0) - (a.independent ?? 0),
    );
  }

  // An entry is named once even when several of its coordinates matched. The agent is being handed
  // something to read, not a relevance report.
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    for (const e of hit.entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push({ ...e, coordinate: hit.coordinate });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// Delivery addresses included: this is the one caller that wants them.
export const buildArrivalIndex = (base) => arrivalIndex(base);
