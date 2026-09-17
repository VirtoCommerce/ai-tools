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
import { CAPTURED_DIR, CAPTURED_INDEX, FLOWS_DIR, FLOWS_INDEX, confirmationsOf, disputesOf, isDisputed, observedOn, readPin, evidenceKinds } from './capture.mjs';
import { DERIVED_INDEX, RULES_DIR, RULES_INDEX } from './planes.mjs';
import { sourceDoor, renderSourceDoor } from './source-door.mjs';
import { coordinateIndex } from './coordinates.mjs';
import { structuredMatches } from './arrive.mjs';
import { partiesOf } from './provenance.mjs';

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

// Which of those exact content matches landed in a GOAL field -- `subject` or `question` -- rather
// than somewhere in the body. For a fact this distinction is weak: a fact's body IS its content.
// For a flow it is the whole question, see `aboutGoal`.
function goalMatches(hit, queryTerms) {
  return Object.entries(hit.match)
    .filter(([t, fields]) => queryTerms.has(t) && fields.some((f) => f === 'subject' || f === 'question'))
    .map(([t]) => t);
}

// A FLOW IS SERVED ONLY WHEN ITS GOAL ACCOUNTS FOR MOST OF THE QUESTION.
//
// The word-count floor above cannot do this job for a procedure, and the independent review of
// 2026-09-16 named the consequence as defect D4: `kb how "cancel an order"` returned the
// order-placement flow, `how "log in to admin"` returned it plus a promotion flow. With three flows
// in the plane, `how` returned the least-bad of three for almost anything, because a flow's STEPS
// mention every noun of a journey -- `cancel`, `Admin`, `log in` -- and two words in a body clear a
// floor of two. The floor measures whether a result is about the question's WORDS. A flow is
// identified by its GOAL (capture.mjs: `fingerprint`), so the question to ask is whether the goal
// is what was asked.
//
// Strict majority, measured on 2026-09-16 against a copy of the live base: every wrong answer
// above becomes MISS; "place an order on the storefront", "how do I place an order", "create a
// promotion with a coupon code", "apply a coupon on the storefront" and each flow's own question
// still return their flow; and a question that names two flows' vocabulary ("how do I put a coupon
// on a promotion and apply it to a cart?") now returns one instead of two. The cost is recall on a
// synonym: `how "checkout"` is a MISS, because no flow's goal says checkout. That is the trade this
// contract makes on purpose -- a MISS costs a lookup, a confident wrong procedure costs the run.
//
// NOT APPLIED TO `ask`. The same rule was measured over the 34 held-out questions three runs
// asked (measurements/kb-retrieval-2026-09/): a majority rule loses the first-ranked entry on 19
// rows, `min(2, size)` on 7, and even one goal term on 2 -- and none of them fixes the one `ask`
// row that motivated trying ("sign in to the Admin platform UI"). A fact's body is its content, so
// a rule about goal fields is a rule about the wrong thing there.
export const aboutGoal = (goalTerms, queryTerms) => goalTerms.length > queryTerms.size / 2;

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
  //
  // THE RULES INDEX IS OPENED, AND THAT IS NOT THE SAME DECISION. A flow is withheld because a
  // procedure and a fact answer different QUESTIONS and must never compete. A rule answers the same
  // question a fact does -- "does a coupon apply to the sale price" IS BL-CART-003 -- so withholding
  // it would mean the base holds the answer and does not hand it over. It is served in its own
  // block rather than in the ranked list, for the reason recorded at `ask`.
  const rules = loadPlane(base, RULES_INDEX, { requiredWhen: () => storeHasEntries(base, RULES_DIR) });
  if (rules.degraded) return { degraded: rules.degraded };
  return { derived, captured: captured.index, rules: rules.index, pin: readPin(base) };
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
  const kinds = evidenceKinds(data);
  if (disputes > 0) {
    return {
      level: 'disputed',
      confirmations,
      disputes,
      kinds,
      axes,
      reasons: [`${disputes} observation(s) contradict this entry; read them before relying on it`],
    };
  }
  // A SOURCE READING DOES NOT CONFIRM AN OBSERVATION, or the reverse, so `confirmed` needs two of
  // one kind and never one of each. Source says what the code does; an observation says what this
  // deployment did. They can agree while the deployment runs a different build -- which is not a
  // hypothetical here: two of round two's three arms read `dev` rather than the installed tag. The
  // two counts are reported side by side rather than blended, because a blended number would be a
  // weight nobody has measured, and this base has been wrong before about a constant that felt
  // obviously right. VCST-5975's fourth acceptance is this rule.
  // INDEPENDENCE, not row count. Two readings by the same author in one sitting are one reading
  // twice, and counting them as confirmation is the self-confirmation this project keeps catching
  // itself at -- "a run helped by its own captures is not evidence of anything" is already the rule
  // the arrival measurement is built on. It was caught here the same way: recording both sides of
  // the password-hash disagreement, two files read minutes apart by one author, flipped the entry
  // to `confirmed`.
  //
  // A row with no `by` counts as its own author, because the tool cannot tell. That is deliberately
  // permissive and it is what keeps this from re-grading the corpus: 121 of the 124 evidence rows
  // written before 2026-09-16 carry no author, so their levels are untouched. The rule only ever
  // tightens, and only for rows that say who wrote them.
  // A TRANSCRIBED ROW IS THE ARTEFACT'S OBSERVATION, NOT THE TYPIST'S. Fifteen rows in the live
  // corpus said `by: round2-arm-B` when no arm ever ran a writing verb -- the author had typed the
  // witness's name. Three entries stood at `confirmed` on that. `partiesOf` counts `from` (a path
  // that exists and can be opened) ahead of `by` (who typed it), so one author transcribing three
  // reports is three parties and one author writing three rows unaided is one.
  const independent = (wantSource) => {
    const rows = (data.evidence ?? []).filter((e) => !e.contradicts && ((e.method === 'source') === wantSource));
    return partiesOf(rows);
  };
  const repeated = Math.max(independent(false), independent(true)) > 1;
  const both = kinds.observation > 0 && kinds.source > 0;
  return {
    level: repeated ? 'confirmed' : 'single-observation',
    confirmations,
    disputes: 0,
    kinds,
    axes,
    reasons: [
      [
        kinds.observation ? `${kinds.observation} observation(s)` : null,
        kinds.source ? `${kinds.source} reading(s) of source at a named tag` : null,
      ].filter(Boolean).join(' and ') || 'no evidence rows',
      ...(both && !repeated
        ? ['an observation and a source reading agree here; that is NOT counted as confirmation — '
          + 'code says what should happen, an observation says what did, and a second of EITHER kind is what confirms']
        : []),
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
    // Provenance names the CHANNEL as well as the place. A row read out of code has no deployment
    // and no pin, so `observedOn` reports it as `?@?` -- which reads like a missing stamp rather
    // than a different kind of evidence, and the whole reason `method: source` exists is that the
    // two must not be indistinguishable.
    provenance: experiential
      ? [
        observedOn(data).some((o) => o.deployment)
          ? `observed @ ${observedOn(data).filter((o) => o.deployment).map((o) => `${o.deployment}${o.platformVersion ? `:${o.platformVersion}` : ''}`).join(', ')}`
          : null,
        ...(data.evidence ?? []).filter((e) => e.method === 'source')
          .map((e) => `read from source @ ${e.module}:${e.version} ${e.path}`),
      ].filter(Boolean).join(' · ')
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
  const { hits, nearGoals, floor } = flowHits(opened, question, queryTerms);

  if (!hits.length) {
    // A flow whose steps mention the words but whose goal is something else is NOT the nearest
    // answer with a caveat; it is a different procedure. Its goal is named so the reader can see
    // what was refused and why, and can tell this MISS from an empty plane.
    const byWords = nearGoals.length
      ? `${nearGoals.length} flow${nearGoals.length === 1 ? '' : 's'} mention${nearGoals.length === 1 ? 's' : ''} these words in ` +
        `${nearGoals.length === 1 ? 'its' : 'their'} steps but ${nearGoals.length === 1 ? 'has' : 'have'} a different goal ` +
        `(${nearGoals.map((g) => `"${g}"`).join('; ')}). A flow is served only when its goal is what you asked. `
      : `No flow matches ${floor} content term${floor === 1 ? '' : 's'} of this question. `;
    return {
      miss: true,
      question,
      searched: ['flow'],
      results: [],
      degraded: null,
      nearGoals,
      note: opened.flows
        ? byWords + 'If you work one out, record it with `kb capture --flow` so the next run walks it instead of finding it.'
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
  return flowHits(opened, question, queryTerms).hits.map((h) => ({ id: h.id, subject: h.subject }));
}

// The one place a flow is judged against a question. `how` serves what this returns and
// `flowsMatching` points at it; two copies of the filter is how the pointer would come to name a
// flow the verb then refuses.
function flowHits(opened, question, queryTerms) {
  const raw = opened.flows ? opened.flows.search(question, SEARCH_OPTIONS) : [];
  const floor = relevanceFloor(queryTerms);
  const byWords = raw.filter((h) => contentMatches(h, queryTerms).length >= floor);
  const hits = byWords
    .filter((h) => aboutGoal(goalMatches(h, queryTerms), queryTerms))
    .sort((a, b) => b.score - a.score);
  const served = new Set(hits.map((h) => h.id));
  const nearGoals = byWords.filter((h) => !served.has(h.id)).sort((a, b) => b.score - a.score).map((h) => h.subject);
  return { hits, nearGoals, floor };
}

// A question only reaches the contract plane by NAMING a coordinate, and this is the cheap guard
// that decides whether it is worth opening 590 files to find out. A coordinate carries a slash
// followed by a path character, or a dotted `Type.field`. Most questions carry neither, and for
// those `ask` never builds the index at all.
const NAMES_A_COORDINATE = /[/][A-Za-z{]|\b[A-Za-z][A-Za-z0-9]*[.][A-Za-z]|\b[A-Za-z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/;

/**
 * Contract entries whose coordinate the question actually names.
 *
 * This is the whole of what the derived plane does for `ask` since it left the ranked list: it is
 * an address book, and you reach an address book by knowing the address. The matching rule is the
 * arrival hook's, imported rather than rewritten, and it requires structure — without that,
 * `Promotion` in an ordinary sentence would resolve to `PromotionType`, which is the obvious way
 * coordinate lookup goes wrong and the reason the review warned about it.
 *
 * Score is a sentinel: these are not ranked against BM25 scores, they are placed ahead of them.
 */
function derivedByCoordinate(base, question) {
  if (!NAMES_A_COORDINATE.test(String(question ?? ''))) return [];
  const full = coordinateIndex(base);
  const derivedOnly = new Map();
  for (const [coordinate, rows] of full) {
    const contract = rows.filter((r) => r.plane === 'derived-first');
    if (contract.length) derivedOnly.set(coordinate, contract);
  }
  const seen = new Set();
  const out = [];
  const take = (coordinate, entries) => {
    for (const e of entries ?? []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push({ id: e.id, path: e.path, subject: e.subject, plane: e.plane, score: Infinity, namedCoordinate: coordinate });
    }
  };

  // Routes and dotted fields: the hook's rule, shared.
  for (const { coordinate, entries } of structuredMatches(question, derivedOnly)) take(coordinate, entries);

  // A BARE TYPE NAME, judged on THE ASKER'S SPELLING and not on the stored coordinate.
  //
  // `normalizeAnchor` lowercases everything before it reaches the index, so `OrderDiscountType` is
  // `orderdiscounttype` there and the internal capital that makes a name a name is gone. It survives
  // in the question. `OrderDiscountType` and `CartTotalType` are not words anybody writes by
  // accident; `Promotion` is, and a single capitalised word never qualifies — which is exactly the
  // failure the review warned about when it suggested coordinate lookup.
  for (const m of String(question ?? '').matchAll(/\b[A-Za-z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/g)) {
    const key = m[0].toLowerCase();
    if (derivedOnly.has(key)) take(key, derivedOnly.get(key));
  }
  return out;
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

  // A PROCEDURAL QUESTION BELONGS TO THE OTHER VERB, and `ask` refuses it rather than answering it
  // with facts that merely share its nouns.
  //
  // The plane separation was built so a procedure and a fact never compete in one ranked list. It
  // was only ever enforced on the CORPUS side -- `ask` never sees a flow -- and that left the other
  // half open: a procedural QUESTION still got answered, out of the fact planes, by whatever
  // mentioned the same journey. Measured 2026-09-16 on the two flow questions the base itself
  // recorded as MISS in its own demand log: "create a percentage-off promotion in the Admin
  // Marketing module" was answered with the REST route table for /api/marketing/promotions plus two
  // unrelated experiential entries, and "create a promotion with a coupon code" the same way, while
  // the flow plane answers both correctly.
  //
  // The test is the goal rule `how` already uses, unchanged: a flow is reached only when a majority
  // of the question's content terms land in its goal. So this cannot fire on a fact question that
  // merely travels through a flow's pages -- that is measured in kb-flowmiss-2026-09 and is the
  // whole reason the goal rule exists.
  //
  // COST, MEASURED, on the 34 held-out rows of kb-retrieval-2026-09: one anchor, r2.4 -- "how do I
  // create a percentage discount promotion in the marketing module" -- which is itself a procedure,
  // is marked NOT-USED by the run that asked it, and is answered by `kb how`. Both blind graders'
  // off-topic and wanted counts are unchanged. See measurements/kb-missdrift-2026-09/.
  const procedural = flowsMatching(base, question);
  if (procedural.length) {
    return {
      miss: true,
      question,
      searched,
      results: [],
      degraded: null,
      procedural,
      note: `This asks how to reach a goal, and ${procedural.length === 1 ? 'a procedure' : 'procedures'} `
        + `for it ${procedural.length === 1 ? 'is' : 'are'} recorded on the flow plane, which \`ask\` cannot serve. `
        + `Run \`kb how "${question}"\`. Facts are not served here instead, because an entry that shares this `
        + 'question\'s nouns is not an answer to it.',
    };
  }
  // THE CONTRACT PLANE IS AN ADDRESS BOOK AND NOT A SEARCH CORPUS, as of 2026-09-16.
  //
  // It is 88% of the corpus by count and 15% of it has ever been used.
  //
  // THIS IS NOT WHAT FIXES THE ADJACENT ANSWERS, and an earlier draft of this comment said it was.
  // The second review counted them: of the nine adjacent answers the drift measurement names, eight
  // are WRITTEN entries and one is derived. `ask "sign in to the Admin platform UI"` still returns
  // three unrelated entries after this change; they are simply all written now. The drift is a
  // vocabulary problem between written entries, fourteen ranking rules failed on it because BM25
  // cannot bridge vocabulary, and the thing aimed at it is the catalog in context — not this.
  //
  // The second independent review put the reason better than the utilisation number does: free-text
  // search over the contract solves a problem the reader does not have. An agent asking what fields
  // `CartTotalType` carries ALREADY KNOWS THE COORDINATE -- introspection or one swagger fetch
  // answers it authoritatively, and the derived entry is a cached copy of that. What the plane is
  // uniquely good for is RESOLVING: module and installed version for a MISS, the cross-plane
  // contradiction check, anchor reachability. All three are keyed lookups.
  //
  // So it leaves the ranked list and stays reachable by exact coordinate. Nothing is deleted; the
  // source door, the gate and `kb check` read it exactly as before.
  const search = (index) => (index ? index.search(question, SEARCH_OPTIONS) : []);
  const floor = relevanceFloor(queryTerms);
  // Kept BEFORE the floor is applied. A MISS has to be able to say "entries matched, and fewer than
  // three of your content terms" rather than "nothing covers this" — those are different facts and
  // the reader acts differently on them. Filtering here and reusing the filtered list below lost
  // that distinction for one commit.
  const writtenRaw = search(opened.captured);
  const written = writtenRaw.filter((h) => contentMatches(h, queryTerms).length >= floor);

  // A coordinate NAMED in the question outranks term overlap, and bypasses the relevance floor: a
  // question that says `Mutations.addItem` has told us what it is about far more precisely than any
  // count of shared words could. `structuredMatches` is the arrival hook's rule, shared rather than
  // reimplemented, and it REQUIRES STRUCTURE -- a `/`, a `.` or a space. That is what stops `kb ask
  // "does a promotion apply"` resolving to `PromotionType` because `Promotion` is both a type name
  // and an ordinary word.
  const named = derivedByCoordinate(base, question);
  const hits = [...named, ...written.sort((a, b) => b.score - a.score)];

  // RULES ARE SERVED, IN THEIR OWN BLOCK, AFTER WHAT SOMEBODY ACTUALLY SAW.
  //
  // Merging them into the ranked list was the obvious thing and would have been wrong: 217 rules
  // against 100 observations, every rule `attested: false` because it was transcribed from a page
  // and nobody has watched one hold, and BM25 does not know the difference. The earned half of the
  // corpus would have been drowned by the asserted half on its first day.
  //
  // A separate block keeps both facts visible at once: what the rule SAYS should happen, and what
  // somebody SAW happen. Where they disagree that is a finding — which is the entire reason the
  // rules are entries at all, rather than a page nobody can contradict.
  const ruleHits = search(opened.rules)
    .filter((h) => contentMatches(h, queryTerms).length >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // A question the observations do not cover but a RULE does is no longer a MISS. It used to be,
  // and that was the base holding the answer while reporting "no entry covers this" — the one
  // output that costs more than silence, aimed at itself.
  if (!hits.length && !ruleHits.length) {
    // An uncovered question returns an explicit MISS. It does not return the nearest thing with
    // the caveat filed off, because a plausible invention is the one output that costs more than
    // silence.
    //
    // What it MAY do is say where the answer lives. The entries that matched but did not clear the
    // floor are not answers and are not served; their `appliesTo` still names the module this
    // question sits in and the version of it installed here. See src/source-door.mjs for why that
    // is worth saying and why it is not a source plane.
    // The contract plane is still SEARCHED here, and still not served. It left the ranked list on
    // 2026-09-16; it did not leave the base. A near-miss on a type table is the signal the source
    // door is built on — its `appliesTo` names the owning module and the version installed here —
    // so taking the plane out of the near-miss pass as well would have removed the one thing it was
    // measured to be good for on the same day it stopped being an answer.
    const raw = [...search(opened.derived), ...writtenRaw];
    const nearMisses = raw
      .map((h) => ({ ...h, evidence: contentMatches(h, queryTerms).length }))
      .filter((h) => h.evidence >= 1)
      .sort((a, b) => b.score - a.score);
    return {
      miss: true,
      question,
      searched,
      results: [],
      degraded: null,
      source: sourceDoor(base, nearMisses),
      note: raw.length
        ? `No entry matches ${floor} content term${floor === 1 ? '' : 's'} of this question. ${raw.length} entr${raw.length === 1 ? 'y' : 'ies'} matched fewer than that, or only function words and fuzzy near-misses, which is not evidence of an answer.`
        : 'No entry covers this question.',
    };
  }
  return {
    miss: false,
    question,
    searched: [...searched, ...(ruleHits.length ? ['normative'] : [])],
    pin: opened.pin?.pin ?? null,
    results: hits.slice(0, limit).map((h) => answerFor(base, h, opened.pin?.deployment ?? null)),
    rules: ruleHits.map((h) => answerFor(base, h, opened.pin?.deployment ?? null)),
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
      for (const p of res.procedural ?? []) out.push(`      @kb(${p.id})  ${p.subject}`);
      out.push(...renderSourceDoor(res.source ?? []));
    }
    return out.join('\n');
  }
  if (!res.results.length && (res.rules ?? []).length) {
    out.push('No observation covers this. What the rules REQUIRE, below — nobody has yet watched it hold here.');
    out.push('');
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
  // A LABELLED BLOCK, AFTER the observations and visibly different from them. 217 transcribed
  // rules beside 100 observed facts, every rule `attested: false`, is a corpus whose asserted half
  // outnumbers its earned half two to one; printing them in one ranked list would teach a reader
  // that the two are interchangeable. They are not — a rule says what SHOULD happen, an
  // observation says what somebody SAW — and where they disagree, that is the finding this plane
  // exists to surface.
  if ((res.rules ?? []).length) {
    out.push(`what the RULES require (${res.rules.length}) — asserted here, not observed:`);
    for (const r of res.rules) {
      out.push(`  ${r.id}  ${r.subject}`);
      out.push(`    watched it NOT hold? \`kb dispute ${r.id}\` — that disagreement is the point`);
    }
    out.push('');
  }
  out.push(`-- ${(res.results[0] ?? res.rules[0]).protocol}`);
  return out.join('\n');
}
