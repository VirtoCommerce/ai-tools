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

import { coordinateIndex } from './coordinates.mjs';

// Coordinates that are a single bare word match too much. `organization` is a real GraphQL type,
// and on a substring search it fired on 19 of run 03's 319 calls -- every URL with `organizationId`
// in a query string, none of which was an arrival at the organization type.
//
// So a coordinate has to be STRUCTURED to trigger on its own: a path (`/company/members`), a
// dotted coordinate (`Mutations.lockOrganizationContact`), or a verb-and-route
// (`POST /api/members/search`). Bare type names still match, but only when the text names them
// with a boundary on both sides -- `CartType` in a GraphQL document body, not `cartTypeId` in a
// query string.
const isStructured = (coordinate) => /[/.]/.test(coordinate) || coordinate.includes(' ');

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
export function arrivalsFor(text, index, { limit = 3 } = {}) {
  const hay = String(text ?? '').toLowerCase();
  if (!hay) return [];
  const hits = [];
  for (const [coordinate, entries] of index) {
    if (!isStructured(coordinate)) continue;
    if (!forms(coordinate).some((f) => mentions(hay, f))) continue;
    hits.push({ coordinate, entries });
  }
  // Longest coordinate first: `POST /api/members/search` says more than `/api/members`, and if only
  // one line is going to be read it should be the specific one.
  hits.sort((a, b) => b.coordinate.length - a.coordinate.length);

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

export const buildArrivalIndex = (base) => coordinateIndex(base);
