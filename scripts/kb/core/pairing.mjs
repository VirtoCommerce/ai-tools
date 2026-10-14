// WHICH ASK A CAPTURE IS ABOUT -- the pairing both the writer (`verbs.mjs`, the `after` pointer) and
// the report (`report-analyse.mjs`, re-checking historical pointers) apply. Pure: no I/O, no clock.

import { anchorProblems, isSingleSegmentPath, normalizeAnchor } from './coordinates.mjs';
import { MIN_RELATED_WORDS, tokenize } from './rank.mjs';

/** A character that ALWAYS continues a route -- a match may not stop before it. */
const ROUTE = /[a-z0-9/_\-{}%]/;
/** Characters that continue a route only when a route character follows: `?scope=`, `.json`, `&x=`. */
const JOINERS = /[?.&=]/;

/**
 * One trailing path segment that only IDENTIFIES a record of the route: a `{param}` placeholder, a
 * number, or a GUID. `/api/members/{id}` and `/api/members/123` name `/api/members`'s item, which is
 * what an entry anchored on the route is about; `/api/members/search` or `?scope=` is another thing.
 */
// The GUID alternative comes before `\d+`: a GUID can start with digits, and `\d+` would stop at its first letter.
const ID_SEGMENT = /^\/(\{[^}/]*\}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)/;

/**
 * Does the match of a coordinate end here? At the end, at a non-route character, or at a joiner that
 * nothing route-like follows: the `?` that ends a question and the `.` that ends a sentence are ends,
 * the `?` of `?scope=organization` and the `.` of `.json` are not (VCST-6341 review: kb questions end
 * in `?`, so treating every `?` as a query string unpaired the commonest question shape there is).
 */
function endsAt(after) {
  if (!after) return true;
  // A trailing slash is the same route (`/account/returns/`), unless another segment follows it.
  if (after[0] === '/' && !/[a-z0-9_{]/.test(after[1] ?? '')) return true;
  if (ROUTE.test(after[0])) return false;
  return !(JOINERS.test(after[0]) && /[a-z0-9_{]/.test(after[1] ?? ''));
}

/** A question with any scheme://host removed, so `https://host/api/members/1` reads as `/api/members/1`. */
const withoutHosts = (q) => q.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/]+/g, ' ');

/**
 * What may stand right before a route and still leave it a route: nothing, a non-route character, a
 * bare host (`vcst-qa.example.com`, `localhost:5000`) or a stand variable (`$FRONT_URL`, `{BACK_URL}`)
 * -- the spellings agents actually paste. Anything else (`/v2/api/x`, `foo_api/x`) is a longer path.
 */
const HOST_OR_VAR = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?|localhost(?::\d+)?|\$\{?[a-z_][a-z0-9_]*\}?|\{[a-z_][a-z0-9_]*\})$/;
function routeStartsAt(q, i) {
  if (i === 0 || !/[a-z0-9/_\-.}]/.test(q[i - 1])) return true;
  const start = Math.max(q.lastIndexOf(' ', i - 1), q.lastIndexOf('(', i - 1), q.lastIndexOf('`', i - 1), q.lastIndexOf('"', i - 1)) + 1;
  return HOST_OR_VAR.test(q.slice(start, i));
}

function namesExactly(q, c) {
  for (let i = q.indexOf(c); i !== -1; i = q.indexOf(c, i + 1)) {
    if (!routeStartsAt(q, i)) continue;
    const after = q.slice(i + c.length);
    if (endsAt(after)) return true;
    const id = ID_SEGMENT.exec(after);
    if (id && endsAt(after.slice(id[0].length))) return true;
  }
  return false;
}

/**
 * Does `question` name the (lowercased, normalised) coordinate `coord` as a whole token?
 *
 * Every occurrence is tried, not only the first: `/api/carts/merge` must still be found in a
 * question that mentions `/api/carts/merge/preview` earlier and `/api/carts/merge` later. A full
 * URL counts as its path (`withoutHosts`).
 *
 * BORROWED FROM `rank.mjs` `anchorHit`: a verb-prefixed coordinate is also named by its path alone (a
 * question says "why does /api/carts return", not "POST /api/carts"), and a coordinate stored WITH a
 * `{param}` is also named by its stem -- `GET /api/members/{id}` by a question about `/api/members`.
 * A coordinate followed by one ID segment (`ID_SEGMENT`), a trailing slash, a host or a stand variable
 * before it are still named.
 *
 * DELIBERATELY STRICTER THAN `anchorHit`, which matches a substring. The two answer different
 * questions: `anchorHit` asks "is this entry worth SHOWING for the question" -- an entry anchored
 * `/account/returns` is a fair candidate for a question about `?scope=organization`, the same page --
 * while this asks "is this capture ABOUT that ask", where the same prefix charged an answer with an
 * unrelated capture. Tightening `anchorHit` changes retrieval and the verdict's `coordMatch` feature,
 * so it is a ranking change with its own measurement (VCST-6342), not a fix to pairing.
 */
export function namesCoordinate(question, coord) {
  const q = withoutHosts(String(question ?? '').toLowerCase());
  const c = String(coord ?? '').toLowerCase();
  if (!c) return false;
  const path = /^[a-z]+ (\/.+)$/.exec(c)?.[1] ?? null;
  const forms = [c, ...(path ? [path] : [])];
  for (const f of [...forms]) {
    const stem = f.replace(/\/\{[^}]*\}.*$/, '');
    // Never a one- or zero-segment stem: `/api` would name every REST question (anchorHit's own guard).
    if (stem !== f && /\/[^/\s]+\/[^/\s]+/.test(stem)) forms.push(stem);
  }
  return forms.some((f) => namesExactly(q, f));
}

/**
 * What one ask and one capture share: the words, and whether the ask names one of the capture's
 * coordinates -- as a whole (`named`) or only as a substring (`prefix`, the pre-VCST-6341 test).
 * ONE measurement for `askAbout` and `pairedOnlyBySubstring`, so the two cannot drift apart.
 */
function relation(question, mine, coords) {
  const q = String(question ?? '');
  return {
    shared: new Set(tokenize(q).filter((t) => mine.has(t))).size,
    named: coords.some((c) => namesCoordinate(q, c)),
    prefix: coords.some((c) => q.toLowerCase().includes(c)),
  };
}

/**
 * The `ask` this capture is ABOUT, as a pointer into the session's own log — or nothing.
 *
 * Panel 6 answers "did the agent go and find out anyway?" and the unhelpful panel "was the answer
 * any use?" by following this pointer, so it has to name the RIGHT ask. It stores that ask's `at`:
 * a POINTER to a line already in this session's log, never a copy of the question — a second copy
 * of a question is a second thing that can disagree with the first.
 *
 * IT USED TO NAME THE LAST ASK, AND THAT WAS WRONG IN BOTH DIRECTIONS (PLAN §23.11). Run `cdb27d99`
 * wrote three captures inside one minute, after one answered ask; all three pointed at it. Measured
 * by the words each capture shares with each of the session's four asks:
 *
 *   KB-D54F3AAB (CFG_* 404s)          the MISS 50 min earlier: 10 · the last ask: 1
 *   KB-7F535D52 (CyberSource flakes)  the last ask: 13 · the nearest other: 7
 *   KB-8BE777BB (org switch header)   at most 2, against any ask
 *
 * So the report read "0 captures after a miss" on the run whose loop had closed exactly as designed,
 * and charged one answer with three captures, two of them about something else. The pointer now
 * goes to the ask the capture shares the most with — ties to the later — and ONLY if that clears
 * the floor `relatedTo` already uses for "speaks to the same thing" (`MIN_RELATED_WORDS`, derived
 * in `rank.mjs`), or the ask names one of the capture's own anchors verbatim — a structured
 * coordinate cannot appear in a question by accident, which is the anchor bonus's own argument. Below the floor there is no
 * pointer: a capture that followed no question is `unprompted`, which is a true reading, and a
 * pointer to the nearest unrelated ask is a false one.
 *
 * ANY ASK OF THE SESSION, not only this agent's. The CFG capture above was written by a subagent
 * about a miss its ORCHESTRATOR hit and handed down in the brief — one session, one loop.
 *
 * A NAMED COORDINATE MUST END WHERE THE QUESTION'S DOES (VCST-6341). The test used to be
 * `q.includes(c)`, so a capture anchored `/account/returns` "named" a question about
 * `/account/returns?scope=organization` -- a different page state, and on 2026-10-12..14 the
 * pointer that charged an answer about returns pagination with a capture about the account
 * sidebar's word-break. `namesCoordinate` requires the match to stop at something that cannot
 * continue a route (space, quote, comma, a closing bracket, the end) -- never `?`, `/`, `{` or
 * another path character.
 *
 * Pure, and exported, because it is the part with a wrong answer.
 *
 * @param {Array<{at: string, q: string}>} asks  the session's asks, any order
 * @param {{text: string, anchors?: Array<string|{coordinate: string}>}} capture
 * @returns {string|null} the chosen ask's `at`
 */
export function askAbout(asks, { text, anchors = [] }) {
  const mine = new Set(tokenize(text));
  const coords = pairingCoords(anchors);
  let best = null;
  for (const a of asks) {
    const { shared, named } = relation(a.q, mine, coords);
    if (!named && shared < MIN_RELATED_WORDS) continue;
    const score = (named ? 1_000 : 0) + shared;
    if (!best || score > best.score || (score === best.score && String(a.at) > best.at)) best = { score, at: String(a.at) };
  }
  return best ? best.at : null;
}

/** The capture's anchors that may NAME an ask: accepted by the door, normalised, never one segment. */
function pairingCoords(anchors) {
  // Only a coordinate the door would ACCEPT names an ask. A one-segment page (`/cart`) sits in half the
  // storefront's questions, and a rejected one names everything: `/` is a substring of every question
  // that mentions a page, which is how a live smoke on 2026-09-23 paired a `capture-invalid` with an
  // unrelated answer. Either still counts as the words it contributes.
  // NORMALISED before it is tested or searched for (PR #313 review 2): an ask carries the plain route,
  // so `{BACK_URL}/api/platform/x` searched for verbatim never matched it and pairing was dead for
  // every prefixed spelling.
  return (anchors ?? []).map((a) => String(typeof a === 'string' ? a : a?.coordinate ?? '').trim())
    .filter((c) => c && !anchorProblems([c]).length)
    .map((c) => normalizeAnchor(c))
    .filter((c) => c && !isSingleSegmentPath(c)).map((c) => c.toLowerCase());
}

/**
 * Was this ask paired with this capture ONLY by the substring match `askAbout` used to make?
 *
 * The report's re-check of a HISTORICAL pointer (VCST-6341), and deliberately narrower than
 * re-running `askAbout`: a pointer written before the word floor existed, or by a client that named
 * the last ask, was a different rule's honest output, and re-judging it by today's whole rule would
 * rewrite the history the rate is computed over. This undoes exactly the one defect fixed here --
 * an anchor that occurred in the question only as the PREFIX of a longer coordinate, with too few
 * shared words to pair on their own -- and nothing else.
 */
export function pairedOnlyBySubstring(question, { text, anchors = [] }) {
  const { shared, named, prefix } = relation(question, new Set(tokenize(text)), pairingCoords(anchors));
  return prefix && !named && shared < MIN_RELATED_WORDS;
}
