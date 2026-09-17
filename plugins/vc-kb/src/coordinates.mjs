// Which entries name a given coordinate, across BOTH planes.
//
// The two planes were built to stay apart: one is regenerated from a deployment and byte-gated,
// the other is written by whoever learned something, and folding them into one store would let a
// belief be mistaken for a contract. That separation is right, and it left a hole. Nothing
// connected them at all, so an experiential entry could contradict the derived plane about the
// same coordinate and neither side would ever know.
//
// It happened. `Query.cart` is derived from introspection with `storeId` and `currencyCode`
// REQUIRED; a captured entry said the arguments were all optional; a later run observed them
// required and the disagreement was recorded as two observations disagreeing. It was not that. The
// base held the answer on the plane that cannot be wrong about a signature, and served the wrong
// one above it.
//
// So: a lookup, and nothing more. It reads, it reports, and it decides nothing -- whether two
// claims about one coordinate agree is not a question text can be asked, which is the same reason
// `capture` refuses instead of merging and `consolidate` proposes instead of applying.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { partiesOf } from './provenance.mjs';
import { join } from 'node:path';

import { parseEntry } from './frontmatter.mjs';
import { normalizeAnchor, namespaceOf, LOOKS_LIKE_A_MENU_PATH } from './anchors.mjs';
import { DERIVED_ENTRIES, CAPTURED_DIR, FLOWS_DIR, RULES_DIR } from './planes.mjs';

// planes.mjs and not capture.mjs: this module must not depend on the door at all, which is what
// the import cycle above was about.
// The flow plane is HERE but not in `ask`, and the difference is the point. Arrival is by
// COORDINATE -- an agent standing on /cart -- and a flow anchored on /cart is the most useful thing
// the base can hand it at that moment. Retrieval is by WORDS, and by words a procedure drowns
// facts. Separating the two questions is what lets a flow arrive without competing.
// The normative plane is HERE, and that is the whole point of importing rules into this base rather
// than leaving them in a file beside it. A rule and an observation about one coordinate are the two
// halves nothing has ever held together: with rules in this index, `kb capture` shows the writer the
// rule that already constrains the coordinate they are recording against, and the thirteen places
// where a shipped rule and a walked observation disagree stop being invisible.
const PLANE_DIRS = [[DERIVED_ENTRIES, 'derived-first'], [CAPTURED_DIR, 'experiential'], [FLOWS_DIR, 'flow'], [RULES_DIR, 'normative']];

/**
 * Map of normalized coordinate -> the entries that name it.
 *
 * Built by reading the entry files rather than the search index, because the index stores what is
 * searched (subject, question, body) and a coordinate is none of those. That is 287 small reads on
 * this corpus. Capture is a deliberate, occasional act, and being right about what the base
 * already says is worth more there than being quick.
 */
export function coordinateIndex(base) {
  const byCoordinate = new Map();
  for (const [dir, plane] of PLANE_DIRS) {
    const abs = join(base, dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs).filter((f) => f.endsWith('.md')).sort()) {
      let parsed;
      try {
        parsed = parseEntry(readFileSync(join(abs, file), 'utf8'), `${dir}/${file}`);
      } catch {
        // A file the gate will complain about anyway. A lookup is not the place to raise it: this
        // runs inside `capture`, and refusing to record an observation because some unrelated entry
        // is malformed would punish the writer for someone else's file.
        continue;
      }
      const d = parsed.data;
      if (d.status && d.status !== 'active') continue;
      // Trust travels with the coordinate because the ARRIVAL hook has to choose between entries
      // that share one, and choosing by file order is what it did until 2026-09-16. Computed here
      // rather than in the hook: the file is already open, and a hook that re-read four entries per
      // tool call to rank them is a hook that gets turned off.
      const evidence = d.evidence ?? [];
      const disputes = evidence.filter((e) => e.contradicts).length;
      const supporting = evidence.filter((e) => !e.contradicts);
      // ONE NOTION OF INDEPENDENCE IN THE BASE. This counted distinct `by` values inline until
      // 2026-09-16, which stopped agreeing with `ask` the moment fifteen transcribed rows were
      // relabelled: they all carry one session id and three different `from` artefacts, so the
      // hook ranked KB-5F7C8FC4 as one party while `ask` reported three. Two notions of
      // independence in one base is what `partiesOf` exists to end. Found by the second review.
      const independent = partiesOf(supporting);
      const row = {
        id: d.id,
        subject: d.subject,
        plane: d.plane ?? plane,
        path: `${dir}/${file}`,
        disputed: disputes > 0,
        independent,
      };
      for (const anchor of d.anchors ?? []) {
        const key = normalizeAnchor(anchor?.coordinate);
        if (!key) continue;
        if (!byCoordinate.has(key)) byCoordinate.set(key, []);
        byCoordinate.get(key).push({ ...row });
      }
      // `arrivesAt` is NOT added here. This index feeds the cross-plane checks -- what the contract
      // says about a claim's coordinates, which written entries are neighbours, which anchors
      // nothing can raise -- and all three are questions about what a fact is ABOUT. A delivery
      // address leaking in would make the gate report a missing contract coordinate for a storefront
      // page nobody ever claimed the contract projects. `arrivalIndex` below adds them, for the one
      // caller that wants them.
    }
  }
  return byCoordinate;
}

/**
 * The coordinate index PLUS every delivery address, for the arrival hook and nothing else.
 *
 * Two indexes rather than one flag, because the two questions are genuinely different and a caller
 * that had to remember to pass `{ includeDelivery: false }` would eventually forget. Everything the
 * gate and `capture` do goes through `coordinateIndex`; only arrival goes through this.
 */
export function arrivalIndex(base) {
  const byCoordinate = coordinateIndex(base);
  for (const [dir, plane] of PLANE_DIRS) {
    const abs = join(base, dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs).filter((f) => f.endsWith('.md')).sort()) {
      let parsed;
      try {
        parsed = parseEntry(readFileSync(join(abs, file), 'utf8'), `${dir}/${file}`);
      } catch {
        continue;
      }
      const d = parsed.data;
      if (d.status && d.status !== 'active') continue;
      if (!(d.arrivesAt?.length > 0)) continue;
      const evidence = d.evidence ?? [];
      const supporting = evidence.filter((e) => !e.contradicts);
      const row = {
        id: d.id,
        subject: d.subject,
        plane: d.plane ?? plane,
        path: `${dir}/${file}`,
        disputed: evidence.some((e) => e.contradicts),
        independent: partiesOf(supporting),
        delivery: true,
      };
      for (const at of d.arrivesAt) {
        const key = normalizeAnchor(at?.coordinate ?? at);
        if (!key) continue;
        if (!byCoordinate.has(key)) byCoordinate.set(key, []);
        // An entry that is both anchored here and delivered here is one entry, not two.
        if (byCoordinate.get(key).some((e) => e.id === d.id)) continue;
        byCoordinate.get(key).push(row);
      }
    }
  }
  return byCoordinate;
}

/**
 * What the DERIVED plane already says about these coordinates.
 *
 * Only the derived side is reported, and deliberately so. A collision with the experiential plane
 * is already the fingerprint's job, and it answers with a refusal; this is the other direction,
 * where the base holds a generated contract about the very coordinate someone is about to record
 * an observation against. Nothing is refused on the strength of it -- an observation that
 * contradicts a contract is often the most valuable thing in the corpus, and the writer is the one
 * who can tell that from a misreading.
 */
export function derivedFacts(base, anchors) {
  const index = coordinateIndex(base);
  const out = [];
  const seen = new Set();
  for (const anchor of anchors ?? []) {
    const key = normalizeAnchor(typeof anchor === 'string' ? anchor : anchor?.coordinate);
    if (!key) continue;
    for (const hit of index.get(key) ?? []) {
      if (hit.plane !== 'derived-first' || seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push({ ...hit, coordinate: key });
    }
  }
  return out;
}

/**
 * Entries on the EXPERIENTIAL plane that already name one of these coordinates.
 *
 * The sibling of derivedFacts, and it exists because of a pair the fingerprint gate was right to
 * let through. Run 04 wrote KB-27B4CD10 at 17:52 and KB-4D082C89 at 18:01 -- different anchors,
 * different scope axes, therefore different fingerprints, therefore two distinct facts, which is
 * exactly what they are. But the first carried a causal clause the second refutes, and the author
 * of both never knew it had to go back.
 *
 * Nothing in the corpus can catch that. Deciding it means reading two paragraphs of prose and
 * noticing that a `because` in one is contradicted by an observation in the other; no fingerprint,
 * schema or gate will ever do it. The only party who can is the writer, and only while the page is
 * still open -- which is why this is shown BEFORE the write and not reported afterwards.
 *
 * Shown, never enforced. Two entries sharing a coordinate are usually two honest facts about one
 * place, and that is the normal state of a working corpus.
 */
export function experientialNeighbours(base, anchors, { exclude = null, planes = ['experiential'] } = {}) {
  const index = coordinateIndex(base);
  const want = new Set(planes);
  const out = [];
  const seen = new Set();
  for (const anchor of anchors ?? []) {
    const key = normalizeAnchor(typeof anchor === 'string' ? anchor : anchor?.coordinate);
    if (!key) continue;
    for (const hit of index.get(key) ?? []) {
      if (!want.has(hit.plane) || hit.id === exclude || seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push({ ...hit, coordinate: key });
    }
  }
  return out;
}

/**
 * Written neighbours of a coordinate across BOTH claim-bearing planes -- what somebody OBSERVED
 * there and what somebody RULED about it.
 *
 * The default above stays `experiential` so every existing caller and test keeps its meaning. This
 * is what the door uses, and the difference is the point: a writer recording that a cart-subtotal
 * reward never reaches the line items should be shown `BL-PRICE-001`, which says discounts land on
 * `cart.items[].placedPrice`. One of those two is wrong about this deployment, and neither file
 * could say so while they lived in different repositories.
 *
 * Flows are excluded. A procedure that travels through a coordinate is not a claim about it, and
 * showing three flows on every capture is how a useful warning becomes wallpaper.
 */
export const writtenNeighbours = (base, anchors, opts = {}) =>
  experientialNeighbours(base, anchors, { ...opts, planes: ['experiential', 'normative'] });

/**
 * Which of these anchors nothing will be able to raise, and why.
 *
 * The gate makes the same judgement over the whole corpus; this is it asked about one write, so it
 * can be said to the writer while the page is still open. That placement is the point. The three
 * the gate found had been in the base for a day -- `Mutations.deleteOrganizationContact` written
 * after watching a Delete button, where the schema has `Mutations.deleteContact` -- and the only
 * party who could have caught any of them was the person who had just been looking at the screen.
 *
 * Three kinds, and they are not equally bad:
 *
 *   menu-path   honest about where somebody stood; nothing can raise it. Move it to the body.
 *   invented    no derived entry names it, in a namespace where every sibling resolves. Either a
 *               misspelling or a guess at what a button called. This is the one worth stopping for.
 *   uncovered   a surface this base has never extracted. Not the writer's problem.
 */
export function unreachableAnchors(base, anchors) {
  const index = coordinateIndex(base);
  const derivedNamespaces = new Set();
  for (const [key, hits] of index) {
    if (!hits.some((h) => h.plane === 'derived-first')) continue;
    const ns = namespaceOf(key);
    if (ns) derivedNamespaces.add(ns);
  }

  const out = [];
  for (const anchor of anchors ?? []) {
    const raw = String(typeof anchor === 'string' ? anchor : anchor?.coordinate ?? '');
    const key = normalizeAnchor(raw);
    if (!key) continue;
    if ((index.get(key) ?? []).some((h) => h.plane === 'derived-first')) continue;
    const namespace = namespaceOf(raw);
    const kind = LOOKS_LIKE_A_MENU_PATH.test(raw) ? 'menu-path'
      : (namespace && derivedNamespaces.has(namespace)) ? 'invented'
        : 'uncovered';
    out.push({ coordinate: raw, kind, namespace });
  }
  return out;
}
