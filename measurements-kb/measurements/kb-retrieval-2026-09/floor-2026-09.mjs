// The floor, re-measured after three observed costs from LIVE runs -- questions agents actually
// typed and were refused, none of which is one of the 34 replay rows.
//
//   M1  run 09   "what happens to an existing cart when a promotion is edited"   wants KB-35A09C64
//   M2  me/10    "create a promotion with a coupon code"            FLOW plane   wants KB-EB228603
//   M3  r3.2     "...only my orders or the whole organization's orders?"         wants KB-6FE58084
//
// The ten floors already on record are all about EXACT matches -- count, coverage, rarity. None
// tested letting a PREFIX match earn floor credit, which is M3's mechanism exactly: the entry is
// `gql-query-organizationorders`, the question says `organization's`, prefix:true ranks it and the
// floor gives it nothing.
import { openBase, openFlows, FUNCTION_WORDS } from 'file:///C:/_VIRTO/vc-kb-lab/src/resolve.mjs';
import { tokenize, SEARCH_OPTIONS } from 'file:///C:/_VIRTO/vc-kb-lab/src/index-build.mjs';
import { QUESTIONS } from 'file:///C:/_VIRTO/vc-kb-lab/measurements/kb-retrieval-2026-09/questions.mjs';
import { BAR } from 'file:///C:/_VIRTO/vc-kb-lab/measurements/kb-retrieval-2026-09/grader-bar.mjs';
import { readFileSync } from 'node:fs';

const BASE = 'C:/_VIRTO/vc-knowledge';
const opened = openBase(BASE);
const flows = openFlows(BASE);
const bar = new Map(BAR.map((b) => [b.row, b]));
const was = new Map(JSON.parse(readFileSync('C:/_VIRTO/vc-kb-lab/measurements/kb-retrieval-2026-09/data/baseline.json', 'utf8')).rows.map((r) => [r.row, r]));

const termsOf = (q) => new Set(tokenize(q).map((t) => t.toLowerCase()).filter((t) => t.length > 1 && !FUNCTION_WORDS.has(t)));

// document frequency of a query term, over the derived index, for the rarity variants
const N = opened.derived._documentCount;
const dfCache = new Map();
function df(term) {
  if (dfCache.has(term)) return dfCache.get(term);
  const n = opened.derived.search(term, { prefix: false, fuzzy: 0 }).length;
  dfCache.set(term, n);
  return n;
}

// --- the candidates. Each returns how much floor credit a hit earns. -----------------------------
const exact = (hit, terms) => Object.keys(hit.match).filter((t) => terms.has(t));
// a DOCUMENT term that begins with a query term, where the query term is long enough that the
// coincidence is implausible. `organization` -> `organizationorders` counts; `order` -> `orders`
// is already exact and `id` -> `identity` is below the length bar.
const prefixed = (hit, terms, minLen) => {
  const out = new Set(exact(hit, terms));
  for (const docTerm of Object.keys(hit.match)) {
    for (const q of terms) {
      if (q.length >= minLen && docTerm.length > q.length && docTerm.startsWith(q)) out.add(q);
    }
  }
  return [...out];
};

const CANDIDATES = {
  'A control: exact, min(3,n)':        (h, t) => exact(h, t).length >= Math.min(3, t.size),
  'B exact, min(2,n)':                 (h, t) => exact(h, t).length >= Math.min(2, t.size),
  'C exact or prefix>=6, min(3,n)':    (h, t) => prefixed(h, t, 6).length >= Math.min(3, t.size),
  'D exact or prefix>=8, min(3,n)':    (h, t) => prefixed(h, t, 8).length >= Math.min(3, t.size),
  'E exact min(3,n), OR one rare(df<=3) exact': (h, t) => exact(h, t).length >= Math.min(3, t.size)
      || exact(h, t).some((x) => df(x) <= 3),
  'F exact min(3,n), OR one rare prefix>=6':    (h, t) => exact(h, t).length >= Math.min(3, t.size)
      || prefixed(h, t, 6).some((x) => df(x) <= 3),
};

function serve(q, limit, pass, plane = 'ask') {
  const terms = termsOf(q);
  const idx = plane === 'flow' ? [flows.flows] : [opened.derived, opened.captured];
  const raw = idx.filter(Boolean).flatMap((i) => i.search(q, SEARCH_OPTIONS));
  return raw.filter((h) => pass(h, terms)).sort((a, b) => b.score - a.score).slice(0, limit).map((h) => h.id);
}

const MOTIVATING = [
  { id: 'M1', want: 'KB-35A09C64', limit: 2, plane: 'ask',  q: 'what happens to an existing cart when a promotion is edited' },
  { id: 'M2', want: 'KB-EB228603', limit: 2, plane: 'flow', q: 'create a promotion with a coupon code' },
  { id: 'M3', want: 'KB-6FE58084', limit: 3, plane: 'ask',  q: 'How does the storefront xAPI decide whether an order query returns only my orders or the whole organization\u2019s orders?' },
];

console.log('name'.padEnd(46), 'M1 M2 M3  off-topic  grader-wanted  rows losing anchor');
for (const [name, pass] of Object.entries(CANDIDATES)) {
  const m = MOTIVATING.map((x) => (serve(x.q, x.limit, pass, x.plane).includes(x.want) ? ' y' : ' .'));
  let junk = 0; let wanted = 0; let lost = 0; const lostRows = [];
  for (const q of QUESTIONS) {
    const served = serve(q.q, q.limit, pass);
    const anchor = q.anchor ?? was.get(q.row)?.served[0] ?? null;
    if (anchor && !served.includes(anchor)) { lost += 1; lostRows.push(q.row); }
    const b = bar.get(q.row);
    if (b) {
      junk += b.offTopic.filter((o) => served.includes(o.id)).length;
      wanted += b.missing.filter((w) => served.includes(w.id)).length;
    }
  }
  console.log(name.padEnd(46), m.join(''), ` ${String(junk).padStart(2)}/7`.padEnd(11),
    `${String(wanted).padStart(2)}/10`.padEnd(15), `${lost}  ${lostRows.join(',')}`);
}
