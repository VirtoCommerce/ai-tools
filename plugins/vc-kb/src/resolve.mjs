// The resolver, and the verbs that read it.
//
// The contract below is the machine-facing one (ADR §9.5). Its point is that a caller can always
// tell three states apart: an answer, an absence of coverage, and an absence of the base itself.
// Collapsing the last two is the specific failure the `degraded` flag exists to prevent — an
// unreadable index reported as a coverage gap makes the corpus look worse than it is, and makes
// an outage invisible.
//
// Step 2 adds the second plane. Two indexes are searched, not one, because the derived plane is
// REGENERATED and byte-gated while the experiential plane is WRITTEN and maintained: folding them
// into one file would mean every capture broke `kb check` for a reason that has nothing to do with
// the contract it gates.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadIndex, tokenize, SEARCH_OPTIONS } from './index-build.mjs';
import { parseEntry } from './frontmatter.mjs';
import { CAPTURED_DIR, CAPTURED_INDEX, FLOWS_DIR, FLOWS_INDEX, confirmationsOf, disputesOf, isDisputed, observedOn, readPin } from './capture.mjs';
import { DERIVED_INDEX } from './planes.mjs';

// Function words carry no evidence that a result is about the question. Without excluding them,
// "how do I bake sourdough bread" returns /api/sitemaps at top trust, because `do` matched
// `doExport` and `does` fuzzily matched `download`. A confidently served irrelevant answer is the
// same failure as an invented one: the reader cannot tell it from a real hit.
export const FUNCTION_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'get',
  'has', 'have', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'this', 'to', 'was', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'you', 'your',
  // The MEDIUM, not the subject. This base's derived plane IS the GraphQL schema and the REST
  // contract, so every entry in it says `graphql` or `api` somewhere and the word discriminates
  // nothing -- the surface is a scope axis, not a search term. Left in, it is worse than useless:
  // `gql-type-graphqlsettingstype` is the one entry with `graphql` in its SUBJECT, a short field,
  // so a rare-term-in-a-short-field score put it top for "how does the cart show an applied
  // promotion discount in GraphQL?", where it was the only content term that entry matched at all.
  // `graph` and `ql` are here because the tokenizer splits PascalCase: GraphQL arrives as three
  // terms, and excluding only the whole one leaves the halves doing the same useless work.
  'graphql', 'graph', 'ql', 'gql', 'api',
]);

// A result earns its place by matching CONTENT terms of the question exactly. Prefix and fuzzy
// matches buy recall and are kept for ranking, but on their own they are not evidence.
//
// THREE, not one. The floor was one term from the first day and the principle it was written for --
// "evidence that this result is about the question" -- is not what one term of eleven shows. Two
// live consequences, both measured rather than argued:
//
//   r1.2  "how does the storefront cart show an applied promotion discount in GraphQL?" was served
//         two experiential entries from runs 04 and 05, one about order-discount rounding and one
//         about UserType.lockedState. Their evidence was `show` and `discount`, and `show` and
//         `storefront`. Both cleared a one-term floor; the entry that had served the row fell out.
//   r3.2  the Admin REST order table, which both blind graders independently called off-topic and
//         the wrong surface, led the list on `order` and `orders` alone -- one word in two forms.
//
// `min(3, size)` because a query IS sometimes one term: `InputAddItemType` is a whole question, and
// a floor that demanded three of it would answer nothing. A query cannot be asked to supply
// evidence it does not contain.
//
// Measured over the 23 questions three runs asked (measurements/kb-retrieval-2026-09/): five rows
// change, none loses an entry it was using, and the off-topic entries the two graders named drop
// from two to one. Floors at two terms and at proportional coverage were both tried and are in the
// README with what each cost.
function contentMatches(hit, queryTerms) {
  return Object.keys(hit.match).filter((t) => queryTerms.has(t));
}

// The number of exact content terms a hit must carry to be served at all.
export const relevanceFloor = (queryTerms) => Math.min(3, queryTerms.size);

const PROTOCOL =
  'The base is a lens, never ground truth. Reality outranks it. Cite @kb(id) for load-bearing use, ' +
  'and verify in proportion to blast radius.';

function loadPlane(base, file, { requiredWhen }) {
  const path = join(base, file);
  if (!existsSync(path)) {
    return requiredWhen()
      ? { degraded: { reason: `${file} is missing while its corpus holds entries` } }
      : { index: null };
  }
  try {
    return { index: loadIndex(JSON.parse(readFileSync(path, 'utf8'))) };
  } catch (e) {
    return { degraded: { reason: `${file} unreadable: ${e.message}` } };
  }
}

const storeHasEntries = (base, dir) => {
  const abs = join(base, dir);
  return existsSync(abs) && readdirSync(abs).some((f) => f.endsWith('.md'));
};
const capturedHasEntries = (base) => storeHasEntries(base, CAPTURED_DIR);

export function openBase(base) {
  const derivedPath = join(base, DERIVED_INDEX);
  if (!existsSync(derivedPath)) {
    return { degraded: { reason: `no index at ${derivedPath}; run \`kb extract\`` } };
  }
  let derived;
  try {
    derived = loadIndex(JSON.parse(readFileSync(derivedPath, 'utf8')));
  } catch (e) {
    return { degraded: { reason: `index unreadable: ${e.message}` } };
  }
  const captured = loadPlane(base, CAPTURED_INDEX, { requiredWhen: () => capturedHasEntries(base) });
  if (captured.degraded) return { degraded: captured.degraded };
  // The flow index is deliberately NOT opened here. `ask` must not be able to reach it even by
  // accident: that is the whole of the separation, and a field on this object is how it would leak.
  return { derived, captured: captured.index, pin: readPin(base) };
}

export function openFlows(base) {
  const flows = loadPlane(base, FLOWS_INDEX, { requiredWhen: () => storeHasEntries(base, FLOWS_DIR) });
  if (flows.degraded) return { degraded: flows.degraded };
  return { flows: flows.index, pin: readPin(base) };
}

// Trust on the experiential plane is a COUNT and an AXIS LIST, and nothing else. ADR §6.2's
// weighted model is deliberately absent from this step: a number produced by weights nobody has
// measured looks like a measurement, and this base has already been wrong once about a constant
// that felt obviously right.
function experientialTrust(data) {
  const axes = (data.appliesTo ?? []).map((s) => `${s.axis}=${s.value}`);
  const confirmations = confirmationsOf(data);
  const disputes = disputesOf(data);
  if (disputes > 0) {
    return {
      level: 'disputed',
      confirmations,
      disputes,
      axes,
      reasons: [`${disputes} observation(s) contradict this entry; read them before relying on it`],
    };
  }
  return {
    level: confirmations > 1 ? 'confirmed' : 'single-observation',
    confirmations,
    disputes: 0,
    axes,
    reasons: [
      `${confirmations} independent observation(s)`,
      axes.length ? `scoped to ${axes.join(', ')}` : 'no scope axis recorded',
    ],
  };
}

// `reference` is the deployment the DERIVED plane was projected from -- what this base is a base
// ABOUT. An observation made somewhere else may still hold here, and may not; what matters is that
// the difference is visible at the point of use rather than buried in an evidence row.
function answerFor(base, hit, reference = null) {
  const abs = join(base, hit.path);
  const { data, body } = parseEntry(readFileSync(abs, 'utf8'), hit.path);
  // A flow is written through the same door and earns trust the same way -- one observation until
  // somebody walks it again -- so everything below that says "experiential" means "written by an
  // agent rather than projected", and a flow is that too.
  const experiential = data.plane === 'experiential' || data.plane === 'flow';

  const confirming = (data.evidence ?? []).filter((e) => !e.contradicts && e.at).map((e) => e.at).sort();
  const disputes = (data.evidence ?? []).filter((e) => e.contradicts);

  return {
    id: data.id,
    subject: data.subject,
    plane: data.plane,
    question: data.question,
    trust: experiential
      ? experientialTrust(data)
      : {
        // A derived fact is a projection of its source, so it is served at the top label by
        // definition — and the reason is stated rather than assumed, because the label is the
        // same shape the experiential plane has to earn above.
        level: 'top',
        confirmations: null,
        disputes: 0,
        axes: (data.appliesTo ?? []).map((a) => Object.entries(a).map(([k, v]) => `${k}=${v}`).join(' ')),
        reasons: ['derived plane: regenerated from the source, not maintained as a belief'],
      },
    freshness: experiential
      // Read off the observations. verificationDue stays null because the rotation sweep that
      // would set it is step 3's, not because nothing was recorded.
      ? { lastConfirmed: confirming.at(-1) ?? null, verificationDue: null }
      // The derived plane has no re-verification clock: it does not go stale, it goes regenerated.
      : { lastConfirmed: null, verificationDue: null },
    provenance: experiential
      ? `observed @ ${observedOn(data).map((o) => `${o.deployment}${o.platformVersion ? `:${o.platformVersion}` : ''}`).join(', ')}`
      : `derived @ ${data.evidence?.[0]?.deployment ?? '?'}:${data.evidence?.[0]?.pin ?? '?'}`,
    disputed: disputes.length
      ? { count: disputes.length, notes: disputes.map((d) => ({ note: d.note ?? null, deployment: d.deployment ?? null, at: d.at ?? null })) }
      : null,
    // Observed somewhere other than the deployment this base describes. Every seeded entry in the
    // corpus was recorded on an unversioned developer stack while the derived plane is pinned to a
    // release, so a whole plane of answers was being served as if it were about the same system.
    // Named, never filtered: an observation from another deployment is still the best thing the
    // base has about a coordinate no contract covers.
    observedElsewhere: experiential && reference && !observedOn(data).some((o) => o.deployment === reference)
      ? { reference, observedOn: observedOn(data).map((o) => o.deployment) }
      : null,
    clientDelta: null,
    path: hit.path,
    anchors: data.anchors ?? [],
    appliesTo: data.appliesTo ?? [],
    refutableBy: data.refutableBy,
    body,
    score: hit.score,
    protocol: PROTOCOL,
  };
}

/**
 * `kb how` -- the procedural plane, and NOTHING else.
 *
 * This is the whole mechanism, and it is a separate question rather than a separate ranking. A
 * third index on its own would not have worked: derived and captured already have separate indexes
 * and still compete, because `ask` concatenates both and sorts by raw score. What removes the
 * competition is that these two verbs read disjoint corpora -- `ask` never sees a flow and `how`
 * never sees a fact.
 *
 * Measured on 2026-09-14, which is why this exists at all: one flow written into the experiential
 * plane as an ordinary capture cleared the relevance floor on 18 of 34 replay rows and led two of
 * them, against 6-7 for four comparably long facts. The cause is that a procedure is ABOUT the
 * generic nouns of a journey, so no threshold and no cap reaches it -- only not being in the same
 * list does.
 *
 * The floor is the same one `ask` uses. A procedural question is still a question, and nothing
 * measured says it should be easier to match.
 */
export function how(base, question, { limit = 2 } = {}) {
  const opened = openFlows(base);
  if (opened.degraded) {
    return { miss: true, question, searched: ['flow'], results: [], degraded: opened.degraded };
  }
  const queryTerms = new Set(
    tokenize(question).map((t) => t.toLowerCase()).filter((t) => t.length > 1 && !FUNCTION_WORDS.has(t)),
  );
  const raw = opened.flows ? opened.flows.search(question, SEARCH_OPTIONS) : [];
  const floor = relevanceFloor(queryTerms);
  const hits = raw
    .filter((h) => contentMatches(h, queryTerms).length >= floor)
    .sort((a, b) => b.score - a.score);

  if (!hits.length) {
    return {
      miss: true,
      question,
      searched: ['flow'],
      results: [],
      degraded: null,
      note: opened.flows
        ? `No flow matches ${floor} content term${floor === 1 ? '' : 's'} of this question. ` +
          'If you work one out, record it with `kb capture --flow` so the next run walks it instead of finding it.'
        : 'This base holds no flows yet. Record one with `kb capture --flow`.',
    };
  }
  return {
    miss: false,
    question,
    searched: ['flow'],
    pin: opened.pin?.pin ?? null,
    results: hits.slice(0, limit).map((h) => answerFor(base, h, opened.pin?.deployment ?? null)),
    degraded: null,
  };
}

// Whether the flow plane holds anything matching, WITHOUT serving it. `ask` uses this to point at
// `kb how` when it has nothing -- a pointer rather than a merged result, because merging is the
// thing this design exists to avoid.
export function flowsMatching(base, question) {
  const opened = openFlows(base);
  if (opened.degraded || !opened.flows) return [];
  const queryTerms = new Set(
    tokenize(question).map((t) => t.toLowerCase()).filter((t) => t.length > 1 && !FUNCTION_WORDS.has(t)),
  );
  const floor = relevanceFloor(queryTerms);
  return opened.flows.search(question, SEARCH_OPTIONS)
    .filter((h) => contentMatches(h, queryTerms).length >= floor)
    .sort((a, b) => b.score - a.score)
    .map((h) => ({ id: h.id, subject: h.subject }));
}

export function ask(base, question, { limit = 3 } = {}) {
  const opened = openBase(base);
  if (opened.degraded) {
    return { miss: true, question, searched: [], results: [], degraded: opened.degraded };
  }
  const searched = ['derived-first', ...(opened.captured ? ['experiential'] : [])];
  const queryTerms = new Set(
    tokenize(question).map((t) => t.toLowerCase()).filter((t) => t.length > 1 && !FUNCTION_WORDS.has(t)),
  );
  const search = (index) => (index ? index.search(question, SEARCH_OPTIONS) : []);
  const raw = [...search(opened.derived), ...search(opened.captured)];
  const floor = relevanceFloor(queryTerms);
  const hits = raw
    .filter((h) => contentMatches(h, queryTerms).length >= floor)
    .sort((a, b) => b.score - a.score);

  if (!hits.length) {
    // An uncovered question returns an explicit MISS. It does not return the nearest thing with
    // the caveat filed off, because a plausible invention is the one output that costs more than
    // silence.
    return {
      miss: true,
      question,
      searched,
      results: [],
      degraded: null,
      note: raw.length
        ? `No entry matches ${floor} content term${floor === 1 ? '' : 's'} of this question. ${raw.length} entr${raw.length === 1 ? 'y' : 'ies'} matched fewer than that, or only function words and fuzzy near-misses, which is not evidence of an answer.`
        : 'No entry covers this question.',
    };
  }
  return {
    miss: false,
    question,
    searched,
    pin: opened.pin?.pin ?? null,
    results: hits.slice(0, limit).map((h) => answerFor(base, h, opened.pin?.deployment ?? null)),
    degraded: null,
  };
}

// An experiential scope row is already a key/value pair; rendering it as "axis=surface value=graphql"
// prints the field names instead of the fact.
const renderScopeRow = (a) => (a.axis !== undefined && a.value !== undefined
  ? `${a.axis}=${a.value}`
  : Object.entries(a).map(([k, v]) => `${k}=${v}`).join(' '));

export function renderAnswer(res) {
  const out = [];
  if (res.miss) {
    out.push(res.degraded ? 'MISS (degraded)' : 'MISS');
    out.push(`  question : ${res.question}`);
    if (res.degraded) {
      out.push(`  degraded : ${res.degraded.reason}`);
      out.push('  This is an infrastructure answer, not a coverage answer.');
    } else {
      out.push(`  searched : ${res.searched.join(', ')}`);
      out.push(`  ${res.note}`);
    }
    return out.join('\n');
  }
  for (const r of res.results) {
    out.push(`${r.id}  ${r.subject}   [${r.plane} · trust: ${r.trust.level}]`);
    out.push(`  question   : ${r.question}`);
    out.push(`  provenance : ${r.provenance}`);
    out.push(`  trust      : ${r.trust.reasons.join('; ')}`);
    out.push(`  appliesTo  : ${r.appliesTo.map(renderScopeRow).join(' | ') || '—'}`);
    out.push(`  refutableBy: ${r.refutableBy}`);
    out.push(`  freshness  : lastConfirmed=${r.freshness.lastConfirmed} verificationDue=${r.freshness.verificationDue}`);
    if (r.disputed) {
      out.push(`  DISPUTED   : ${r.disputed.count} contradicting observation(s)`);
      for (const d of r.disputed.notes) out.push(`      ${d.deployment ?? '?'}: ${d.note ?? '(no note)'}`);
    }
    out.push(`  anchors    : ${r.anchors.length}`);
    out.push(`  path       : ${r.path}`);
    out.push('');
    out.push(r.body.split('\n').map((l) => `  ${l}`).join('\n'));
    out.push('');
  }
  out.push(`-- ${res.results[0].protocol}`);
  return out.join('\n');
}
