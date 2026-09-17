// A written claim that the CONTRACT refutes.
//
// THE CASE THIS EXISTS FOR. Three written entries and every run brief since run 07 asserted "an
// order cannot be deleted on this platform — only cancelled", while the derived plane had carried
// `DELETE /api/order/customerOrders` (operation `OrderModule_DeleteOrdersByIds`) since the day it
// was first extracted. Twelve runs, three run briefs and a controlled comparison rode on it, and
// nothing noticed, because the gate checks that entries are well-formed and that indexes match
// their contents -- never that a written claim survives the contract sitting beside it.
// `measurements/kb-comparison-2026-09/FINDING-orders-are-deletable.md` ends by asking for this.
//
// ANCHORS CANNOT DO IT, and that is the first thing anyone would try. The flow carrying the false
// claim is anchored on `/cart`, `/search` and `/account/orders` -- not on the delete route. A check
// comparing an entry's anchors against the derived plane finds nothing. The contradiction is
// between the entry's PROSE and a coordinate it never names, so the check has to be over prose.
//
// IT LOOKS FOR ONE SHAPE ONLY: a claim that something CANNOT be done, where the contract publishes
// an operation that does it. That narrowness is the whole reason it is usable -- a general
// consistency check between prose and a schema is a research problem, and this is a grep with a
// map. It will miss most disagreements between the planes. It catches the one that has actually
// cost this project something.
//
// MEASURED, 2026-09-16 (measurements/kb-contradiction-2026-09/):
//   live corpus   1 flag over 70 active written entries, and it is the real defect
//   synthetic     3 of 3 planted contradictions caught, each citing the right coordinate;
//                 2 of 2 legitimate impossibility claims left alone
//
// IT IS A NOTICE, NEVER A FAILURE. A claim the contract appears to refute is sometimes true anyway:
// an operation can be published and permission-gated, or documented and broken. Whether the entry
// is wrong is a judgement, and a gate that FAILED on it would be answered by deleting the sentence
// rather than by checking the platform -- which is the opposite of what this is for.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseEntry } from './frontmatter.mjs';
import { DERIVED_ENTRIES } from './planes.mjs';

// A verb in the shape a claim of impossibility uses, mapped to what would DO it. Deliberately
// short: each pair is one a REST contract can actually contradict, and a longer list adds verbs no
// route expresses.
const VERBS = [
  { forms: ['deleted', 'delete', 'removed', 'remove'], method: 'DELETE', ops: ['delete', 'remove'] },
  { forms: ['created', 'create', 'added', 'add'], method: 'POST', ops: ['create', 'add'] },
  { forms: ['edited', 'edit', 'changed', 'change', 'updated', 'update', 'modified'], method: 'PUT', ops: ['update', 'edit', 'patch'] },
];

// THE OBJECT SITS ON EITHER SIDE OF THE VERB, and the first version only looked on one. "An order
// cannot be deleted" puts it before; "You cannot delete a promotion" puts it after, and there the
// only word before `cannot` is `you`. Both forms are ordinary English and a check that caught one
// of them would look like it worked.
//   1 noun before `cannot`   2 verb   3 noun after it
//   4 verb after "no way to" 5 noun after that
//   6 verb after "is not possible to"
const IMPOSSIBLE = /\b(?:(\w+)\s+)?(?:can\s*not|cannot|can't|could\s*not|couldn't)\s+(?:be\s+)?(\w+)(?:\s+(?:a|an|the)\s+(\w+))?|there\s+is\s+no\s+way\s+to\s+(\w+)(?:\s+(?:a|an|the)\s+(\w+))?|(?:is|are)\s+not\s+possible\s+to\s+(\w+)/gi;

// The singular/plural pair a route is likely to spell: `order` appears in `/api/order/customerOrders`.
function stems(noun) {
  const n = String(noun).toLowerCase();
  const out = new Set([n]);
  if (n.endsWith('s')) out.add(n.slice(0, -1)); else out.add(`${n}s`);
  return [...out].filter((x) => x.length > 3);
}

/** Every operation the derived plane publishes, as method + route + operationId. */
export function publishedOperations(base) {
  const dir = join(base, DERIVED_ENTRIES);
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    let data;
    try { ({ data } = parseEntry(readFileSync(join(dir, f), 'utf8'), f)); } catch { continue; }
    for (const a of data.anchors ?? []) {
      const m = /^([A-Z]+)\s+(\/.+)$/.exec(String(a.coordinate ?? ''));
      if (!m) continue;
      out.push({ id: data.id, method: m[1], route: m[2].toLowerCase(), operationId: String(a.operationId ?? '') });
    }
  }
  return out;
}

/**
 * Claims of impossibility in `body` that an operation in `ops` appears to refute.
 *
 * Sentence by sentence, because the object of the claim is the noun in the same clause: over a
 * whole body, `order` three paragraphs from `cannot` produced a match that meant nothing.
 */
export function contradictions(body, ops) {
  const out = [];
  for (const sentence of String(body).split(/(?<=[.;!?])\s+|\n/)) {
    for (const m of sentence.matchAll(IMPOSSIBLE)) {
      const verbWord = (m[2] ?? m[4] ?? m[6] ?? '').toLowerCase();
      const verb = VERBS.find((v) => v.forms.includes(verbWord));
      if (!verb) continue;
      const named = [m[1], m[3], m[5]].filter(Boolean).map((x) => x.toLowerCase());
      // With no noun in the clause, every long word in the sentence is a candidate. That trades
      // precision for catching the sentence this was built from, which names its object three
      // words earlier than the pattern reaches.
      const candidates = named.length ? named : sentence.toLowerCase().match(/[a-z]{4,}/g) ?? [];
      // RANKED, not first-found. The first version cited `PATCH /api/order/shipments/{id}` for "a
      // customer order cannot be updated", because that route contains `order` too. A reader handed
      // the wrong coordinate checks it, finds it irrelevant, and stops trusting the check -- so a
      // whole path segment beats a substring and a shorter route beats a longer one.
      const hit = ops
        .filter((o) => (o.method === verb.method || verb.ops.some((v) => o.operationId.toLowerCase().includes(v)))
          && candidates.some((n) => stems(n).some((s) => o.route.includes(s))))
        .map((o) => {
          const segs = o.route.split('/').filter(Boolean);
          const exact = candidates.some((n) => stems(n).some((s) => segs.includes(s)));
          const inLast = candidates.some((n) => stems(n).some((s) => (segs.at(-1) ?? '').includes(s)));
          return { o, score: (exact ? 4 : 0) + (inLast ? 2 : 0) - segs.length * 0.1 };
        })
        .sort((a, b) => b.score - a.score)[0]?.o;
      if (!hit) continue;
      out.push({
        sentence: sentence.trim(),
        verb: verbWord,
        coordinate: `${hit.method} ${hit.route}`,
        operationId: hit.operationId || null,
        via: hit.id,
      });
      break;
    }
  }
  return out;
}
