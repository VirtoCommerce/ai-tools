import MiniSearch from '../vendor/minisearch.js';

// One index configuration, exported, so the builder and the resolver cannot drift apart. Two
// implementations kept in step by a test is the arrangement nothing in the corpus would detect
// failing, so there is only one.
// Route segments, operationIds and GraphQL type names are what the asker actually types, so the
// tokenizer breaks /api/payment/search, StoreModule_SearchStores and InputAddItemType into
// findable words rather than three unfindable ones.
// TYPOGRAPHIC PUNCTUATION SPLITS TOO, and leaving it out cost a real row. `r3.2` asks "...or the
// whole organization’s orders?" with a curly U+2019, which was in no split class -- so it tokenized
// to the single term `organization’s`, matching nothing, while the straight-quote form gives
// `organization` and matches `gql-query-organizationorders` exactly. That entry sat at rank 5,
// unserved, on the one row whose anchor BOTH blind graders set independently and which run 03 had
// cited by id. With the character split it returns to rank 1.
//
// FOUND BY MEASURING THE FLOOR, WHICH WAS NOT WHAT WAS WRONG. Six floor variants -- counts,
// coverage, rarity, and two that credit a prefix match -- moved that row not at all, because the
// term they were being asked to credit was never produced by the tokenizer.
//
// THE EM DASH IS DELIBERATELY NOT HERE. It appears 1954 times in this corpus, against four for the
// apostrophe and zero for the rest, so adding it would rewrite the byte-gated derived index and turn
// `kb check` red -- and it buys nothing: a spaced `--` already splits on whitespace into a one-
// character term that `processTerm` drops. The five that are here occur zero times in the corpus, so
// this changes only what a QUESTION tokenizes to and leaves every index byte-identical. Both halves
// verified rather than assumed -- the first version of this comment claimed all seven were absent,
// and the index comparison said otherwise within a minute.
const SPLIT = /[\s/.,;:()\[\]{}<>"'`|!?=+*&^%$#@~_‘’“”–…-]+/u;

export function tokenize(string) {
  const out = [];
  for (const chunk of string.split(SPLIT)) {
    if (!chunk) continue;
    out.push(chunk);
    // camelCase and PascalCase carry the nouns: InputAddItemType -> input add item type
    const parts = chunk.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/u);
    if (parts.length > 1) out.push(...parts);
  }
  return out;
}

export const INDEX_OPTIONS = {
  idField: 'id',
  fields: ['subject', 'question', 'text'],
  storeFields: ['id', 'subject', 'question', 'path'],
  tokenize,
  processTerm: (term) => (term.length <= 1 ? null : term.toLowerCase()),
  // No field boosts. Measured over 15 contract questions drawn from the step-0 demand rows, four
  // boost settings and the unboosted default were indistinguishable (top-3 12/15 for every one of
  // them), so a boost here would be a constant chosen for no reason the data can see. What did the
  // work was dedupeTokens below, which removes the length bias at the source.
};

// How the index is QUERIED, next to how it is built, for the same reason the two were put
// together in the first place: a retrieval result is a property of both, and a setting changed in
// one place while the other is reasoned about somewhere else is how a configuration ends up with
// numbers nobody can reproduce.
//
// `prefix` and `fuzzy` buy recall; resolve.mjs then refuses any hit that matched no content term
// of the question exactly, so they cannot on their own put an entry in front of a reader.
export const SEARCH_OPTIONS = {
  prefix: true,
  fuzzy: 0.2,
  combineWith: 'OR',
  // BM25 with the `d` floor removed. `d` is BM25+'s flat per-term bonus: every query term a
  // document contains adds `idf * d` to its score no matter how little the document is about that
  // term. On this corpus that pays BREADTH, and 303 of the 590 derived entries are wide type
  // tables whose whole job is to be broad -- so a question about order discounts was answered with
  // OrderShipmentType, which merely contains the words. Two live runs hit this: run 01 lost the
  // entry that had served it, and run 02 had an experiential entry that answered its question
  // ranked below three type tables and found it by reading `kb stat` by hand.
  //
  // Measured over the 23 questions three runs actually asked
  // (measurements/kb-retrieval-2026-09/). k and b are MiniSearch's defaults and were left alone:
  // moving b to 1 cost three rows the entry that served them, and no subject boost that fixed a
  // third buried row did so without losing a different one.
  bm25: { k: 1.2, b: 0.7, d: 0 },
};

// One occurrence of a term is what says the surface is about it; eleven occurrences say only that
// the surface has eleven operations. Deduplicating the indexed text removes that length bias at
// the source rather than trying to correct for it in the ranking.
export function dedupeTokens(text) {
  const seen = new Set();
  const out = [];
  for (const t of tokenize(text)) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(' ');
}

export function buildIndex(docs) {
  const ms = new MiniSearch(INDEX_OPTIONS);
  // Fixed insertion order keeps the serialized index byte-stable across regenerations.
  ms.addAll([...docs].sort((a, b) => a.id.localeCompare(b.id)).map((d) => ({ ...d, text: dedupeTokens(d.text) })));
  return JSON.parse(JSON.stringify(ms));
}

export function loadIndex(serialized) {
  return MiniSearch.loadJS(serialized, INDEX_OPTIONS);
}

export function renderCatalog(rows, { pin, deployment }) {
  const lines = [
    '# Catalog',
    '',
    `Generated. ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}, all on the derived plane, ` +
      `extracted from \`${deployment}\` at pin \`${pin}\`.`,
    '',
    'This file is the door for a reader that cannot run the resolver: find the row, then read the',
    'one entry file it names.',
    '',
    '| id | subject | question |',
    '|---|---|---|',
  ];
  for (const r of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`| [\`${r.id}\`](${r.path}) | \`${r.subject}\` | ${r.question} |`);
  }
  lines.push('');
  return lines.join('\n');
}
