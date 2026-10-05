// Parsing a question before anything ranks it (VCST-6122 Decision 6, step 1).
//
// A question arrives in the asker's words -- "two promo codes on one basket" -- and the base holds the
// fact in its own -- "coupon", "cart". The controlled vocabulary (`vocabulary.json`, Decision 4) is the
// bridge, and this file is the one place it is applied to a question. Three things come out:
//
//   concepts   ids the question's words map to, by alias, and by the vocabulary's typical anchors
//   coords     structured coordinates the question names, with their derived kind
//   unmapped   the content words that map to NOTHING -- the signal that the vocabulary, not the base,
//              is what is missing. It pushes a verdict toward `ambiguous`, never toward `none`.
//
// Deterministic and dependency-free: the same question against the same vocabulary always parses the
// same way, because a parse that wobbles cannot be calibrated.

import { anchorKind, isStructuredCoordinate } from './coordinates.mjs';
import { STOP, tokenize } from './rank.mjs';

/**
 * A light, closed English stemmer: plural and third-person `-s` only. Enough to make "promo codes"
 * meet the alias "promo code" and "baskets" meet "basket"; deliberately not Porter, whose collisions
 * ("organization" -> "organ") would merge concepts the vocabulary keeps apart.
 */
export function stem(token) {
  const t = String(token);
  if (t.length <= 3 || /\d/.test(t)) return t;
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`;
  if (/(?:ss|us|is)$/.test(t)) return t;
  if (/(?:ches|shes|xes|sses)$/.test(t)) return t.slice(0, -2);
  if (t.endsWith('s')) return t.slice(0, -1);
  return t;
}

/** `tokenize` (stop words removed), then stemmed -- the one token rule for questions AND documents. */
export const terms = (text) => tokenize(text).map(stem);

/**
 * Every token, stop words KEPT, stemmed -- the sequence alias phrases are matched against.
 *
 * Matching on `terms` instead is a measured defect: removing `by` turns the alias "order by" (of the
 * concept `sort`) into the single token "order", and every question mentioning an order parsed as a
 * question about sorting. A phrase is matched as it is written.
 */
export const phraseTerms = (text) => String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 1)
  .map((raw) => ({ t: stem(raw), content: !STOP.has(raw) }));

/**
 * The vocabulary, prepared once per base: alias phrases as stemmed token sequences, the ancestor chain
 * of every concept, and the vocabulary's own typical anchors.
 *
 * @param {{concepts: {id:string, parent?:string|null, aliases?:string[], anchors?:string[], label?:string}[]}} json
 */
export function prepareVocabulary(json) {
  const concepts = new Map((json?.concepts ?? []).map((c) => [c.id, c]));
  const phrases = [];
  for (const c of concepts.values()) {
    const names = new Set([...(c.aliases ?? []), c.label ?? '', c.id.replace(/-/g, ' ')]);
    for (const name of names) {
      const toks = phraseTerms(name);
      if (toks.some((x) => x.content)) phrases.push({ seq: toks.map((x) => x.t), id: c.id });
    }
  }
  // Longest first, so "cart line item" wins over "cart" where both would match.
  phrases.sort((a, b) => b.seq.length - a.seq.length || a.id.localeCompare(b.id));
  const ancestors = new Map();
  for (const id of concepts.keys()) {
    const chain = [];
    const seen = new Set([id]);
    for (let p = concepts.get(id)?.parent; p && concepts.has(p) && !seen.has(p); p = concepts.get(p).parent) {
      chain.push(p);
      seen.add(p);
    }
    ancestors.set(id, chain);
  }
  const anchors = [...concepts.values()].flatMap((c) => (c.anchors ?? []).map((a) => ({ anchor: a, id: c.id })));
  return { concepts, phrases, ancestors, anchors };
}

/** Read `vocabulary.json` from a base; absent, unreadable or malformed is an empty vocabulary, never an error. */
export async function readVocabulary(reader) {
  let r;
  try { r = await reader.readIndex('vocabulary.json'); } catch { return { concepts: [] }; }
  if (!r?.ok) return { concepts: [] };
  try {
    const v = JSON.parse(r.text);
    return Array.isArray(v?.concepts) ? v : { concepts: [] };
  } catch { return { concepts: [] }; }
}

/** A concept and every ancestor of it. */
export const withAncestors = (vocab, ids) => [...new Set(ids.flatMap((id) => [id, ...(vocab.ancestors.get(id) ?? [])]))];

// A coordinate in free text: a verb + route, a route, or a dotted name. Trailing punctuation is
// sentence punctuation, not part of the coordinate.
const COORD = /(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+)?\/[A-Za-z0-9_{}./-]+|\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b/g;

/** Structured coordinates the question names, as written, with their derived kind. */
export function coordinatesIn(question, { namespaces } = {}) {
  const out = [];
  for (const m of String(question ?? '').matchAll(COORD)) {
    const raw = m[0].replace(/[.,;:!?)]+$/, '');
    if (!isStructuredCoordinate(raw, { namespaces })) continue;
    out.push({ raw, kind: anchorKind(raw) });
  }
  return out;
}

/** Surface hints: the kind of a named coordinate, or a word that names a surface outright. */
const KIND_SURFACE = { page: 'storefront-ui', 'graphql-op': 'xapi', 'graphql-field': 'xapi', rest: 'rest', blade: 'admin-ui' };
const WORD_SURFACE = {
  storefront: 'storefront-ui', shopper: 'storefront-ui', pdp: 'storefront-ui',
  graphql: 'xapi', xapi: 'xapi', mutation: 'xapi',
  rest: 'rest', endpoint: 'rest', swagger: 'rest',
  admin: 'admin-ui', blade: 'admin-ui', backoffice: 'admin-ui',
  ucp: 'ucp', mcp: 'ucp',
  vendor: 'vendor-ui',
};

/**
 * Parse one question.
 *
 * @returns {{
 *   terms: string[], concepts: string[], expanded: string[], coords: {raw:string, kind:string|null}[],
 *   surfaces: string[], unmapped: string[], unmappedShare: number
 * }}
 *   `concepts` are the ones the words named; `expanded` adds their ancestors. `unmappedShare` is the
 *   share of content terms no alias or coordinate accounts for.
 */
export function parseQuestion(question, vocab, { namespaces } = {}) {
  const text = String(question ?? '');
  const toks = phraseTerms(text);
  const seq = toks.map((x) => x.t);
  const covered = new Array(seq.length).fill(false);
  const found = new Set();
  for (const { seq: p, id } of vocab?.phrases ?? []) {
    for (let i = 0; i + p.length <= seq.length; i++) {
      if (covered.slice(i, i + p.length).some(Boolean)) continue;
      if (p.every((t, j) => seq[i + j] === t)) {
        for (let j = 0; j < p.length; j++) covered[i + j] = true;
        found.add(id);
      }
    }
  }
  const coords = coordinatesIn(text, { namespaces });
  const coordTerms = new Set(coords.flatMap((c) => terms(c.raw)));
  const lower = text.toLowerCase();
  for (const { anchor, id } of vocab?.anchors ?? []) {
    if (coords.some((c) => c.raw.toLowerCase() === String(anchor).toLowerCase()) || (/[./]/.test(anchor) && lower.includes(String(anchor).toLowerCase()))) found.add(id);
  }
  seq.forEach((t, i) => { if (coordTerms.has(t)) covered[i] = true; });

  // Only content words count toward `unmapped`: "the" mapping to no concept says nothing.
  const content = seq.map((_, i) => i).filter((i) => toks[i].content);
  const surfaces = new Set(coords.map((c) => KIND_SURFACE[c.kind]).filter(Boolean));
  for (const i of content) if (WORD_SURFACE[seq[i]]) surfaces.add(WORD_SURFACE[seq[i]]);
  const loose = content.filter((i) => !covered[i]);
  const unmapped = [...new Set(loose.map((i) => seq[i]))];
  const concepts = [...found].sort();
  return {
    terms: content.map((i) => seq[i]),
    concepts,
    expanded: vocab ? withAncestors(vocab, concepts) : concepts,
    coords,
    surfaces: [...surfaces].sort(),
    unmapped,
    unmappedShare: content.length ? loose.length / content.length : 0,
  };
}
