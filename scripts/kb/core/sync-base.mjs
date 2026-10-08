// Bring a long-lived base branch (the schema-2 migration, VCST-6122) up to date with base `main`
// while the team keeps writing to `main`.
//
// WHY A TOOL AND NOT `git merge`. The branch rewrites entries (cards, splits, merges) that `main`
// keeps appending evidence to (confirm, dispute, re-observation). Git sees two edits of one file and
// either conflicts or auto-merges text it does not understand: evidence `main` appended to an entry the
// branch SUPERSEDED lands on a retired file nobody counts, and a merge survivor collects the same
// session twice. The safe case is narrow and checkable: `main` only APPENDED evidence. Then the branch
// version of each entry wins, `main`'s new items are appended, and items for a superseded entry are
// handed to its successor(s) -- tagged exactly as merge-entries / migrate-schema2 tag them. The one
// in-place edit also accepted is a judge closing a dispute (`RESOLUTION_FIELDS`, VCST-6179): it is
// carried onto every branch copy of that item. A judge PR that edits an entry's BODY is still a
// changed body, so a branch syncs after it only by hand -- one judge branch at a time.
// Anything else (a changed body, subject, anchor or status on `main`; a deleted entry) is refused and
// named, because only a person can say which side is right.
//
// Pure: takes file texts, returns writes and problems. Git lives in scripts/kb/sync-base.mjs.

import { parseEntry, stringifyFrontmatter } from './frontmatter.mjs';
import { RESOLUTION_FIELDS } from './index-build.mjs';

/** One evidence item's identity: the same observation appended on two sides is one item. */
export const evidenceKey = (e) => `${e?.at ?? ''}|${e?.by ?? ''}|${e?.note ?? ''}|${e?.contradicts ? 1 : 0}`;

const ids = (v) => (!v ? [] : typeof v === 'string' ? [v] : v.map((x) => (typeof x === 'object' ? x.id : x)));
const withoutEvidence = (data) => JSON.stringify({ ...data, evidence: undefined });
const lf = (t) => String(t).replace(/\r\n/g, '\n');

const resolutionOf = (e) => Object.fromEntries(RESOLUTION_FIELDS.filter((f) => e?.[f] !== undefined).map((f) => [f, e[f]]));
const sameResolution = (a, b) => JSON.stringify(resolutionOf(a)) === JSON.stringify(resolutionOf(b));

/**
 * What `main` did to one entry since the merge base: `{ fresh: [items], resolutions: [items] }` when
 * it only appended evidence and/or closed disputes, or `{ problem }` when it changed anything else.
 *
 * A JUDGE'S RESOLUTION IS THE ONE IN-PLACE EDIT an evidence item gets (VCST-6179): `kb:disputes
 * resolve` writes `RESOLUTION_FIELDS` onto the contradicting item. `evidenceKey` does not see them, so
 * before this they passed as "nothing changed" and the branch version -- the dispute still open --
 * was written over git's merge: the verdict vanished on the branch and the branch's later merge
 * reverted it on main. They are returned here and carried onto the branch's copy of the item.
 */
export function evidenceOnlyChange(id, baseText, mainText) {
  const b = parseEntry(lf(baseText), id);
  const m = parseEntry(lf(mainText), id);
  if (b.body.trim() !== m.body.trim()) return { problem: `${id}: main changed the body` };
  if (withoutEvidence(b.data) !== withoutEvidence(m.data)) return { problem: `${id}: main changed a field other than evidence` };
  const baseItems = b.data.evidence ?? [];
  const mainItems = m.data.evidence ?? [];
  const before = baseItems.map(evidenceKey);
  const after = mainItems.map(evidenceKey);
  if (before.some((k, i) => after[i] !== k)) return { problem: `${id}: main removed or reordered evidence` };
  const resolutions = mainItems.slice(0, before.length)
    .filter((e, i) => Object.keys(resolutionOf(e)).length && !sameResolution(e, baseItems[i]));
  return { fresh: mainItems.slice(before.length), resolutions };
}

/**
 * Re-flag merged evidence: an item carried in by a merge (`mergedFrom`) from a session that the entry
 * already counts is the same observer twice (`duplicateSession`, not counted by countEvidence).
 */
export function flagDuplicateSessions(evidence = []) {
  const seen = new Set(evidence.filter((e) => !e.mergedFrom && !e.contradicts && e.by && !e.duplicateSession).map((e) => e.by));
  return evidence.map((e) => {
    if (!e.mergedFrom || e.contradicts || !e.by) return e;
    const dup = seen.has(e.by);
    seen.add(e.by);
    return dup && !e.duplicateSession ? { ...e, duplicateSession: true } : e;
  });
}

/**
 * @param {{changed: Map<string,{base:string, main:string}>, branch: Map<string,string>}} input
 *   changed: entry path -> its text at the merge base and on main, for every entry main MODIFIED;
 *   branch:  entry path -> the branch's text, for every entry on the branch.
 * @returns {{writes: Map<string,string>, problems: string[], extended: string[], handedOff: string[], resolvedOn?: string[]}}
 */
export function syncEvidence({ changed, branch }) {
  const problems = [];
  const state = new Map(); // path -> {data, body}
  const load = (path) => {
    if (!state.has(path)) {
      const text = branch.get(path);
      if (text === undefined) return null;
      const { data, body } = parseEntry(lf(text), path);
      state.set(path, { data, body });
    }
    return state.get(path);
  };
  const append = (path, items) => {
    const e = load(path);
    const have = new Set((e.data.evidence ?? []).map(evidenceKey));
    const add = items.filter((x) => !have.has(evidenceKey(x)));
    e.data.evidence = [...(e.data.evidence ?? []), ...add];
    return add.length;
  };

  const plan = [];
  for (const [path, { base, main }] of changed) {
    const id = path.replace(/^entries\//, '').replace(/\.md$/, '');
    const r = evidenceOnlyChange(id, base, main);
    if (r.problem) { problems.push(r.problem); continue; }
    if (!load(path)) { problems.push(`${id}: main changed it but the branch does not have it`); continue; }
    plan.push({ path, id, fresh: r.fresh, resolutions: r.resolutions });
  }
  if (problems.length) return { writes: new Map(), problems, extended: [], handedOff: [] };

  // Own evidence first, for every entry; hand-offs second, so a successor's own new items are in
  // place before the duplicate-session check reads them.
  const extended = [];
  for (const p of plan) if (append(p.path, p.fresh)) extended.push(p.id);
  // A successor can itself be superseded (merged, then split): follow the chain to the ACTIVE
  // entries, or the evidence lands on a retired file nobody counts.
  const activeSuccessors = (id, from, seen = new Set()) => {
    if (seen.has(id)) { problems.push(`${from}: its successor chain loops at ${id}`); return []; }
    seen.add(id);
    const e = load(`entries/${id}.md`);
    if (!e) { problems.push(`${from}: its successor ${id} is not on the branch`); return []; }
    if (e.data.status !== 'superseded') return [id];
    const next = ids(e.data.supersededBy);
    if (!next.length) { problems.push(`${from}: its successor ${id} is superseded by nothing`); return []; }
    return next.flatMap((n) => activeSuccessors(n, from, seen));
  };
  const handedOff = [];
  for (const p of plan) {
    const me = load(p.path).data;
    if (me.status !== 'superseded' || !p.fresh.length) continue;
    const first = ids(me.supersededBy);
    if (!first.length) { problems.push(`${p.id}: superseded by nothing, so main's new evidence has nowhere to go`); continue; }
    const isMerge = first.length === 1; // the tag names what happened to THIS entry, as migrate-schema2 does
    const targets = [...new Set(first.flatMap((t) => activeSuccessors(t, p.id)))];
    for (const t of targets) append(`entries/${t}.md`, p.fresh.map((x) => (isMerge ? { ...x, mergedFrom: p.id } : { ...x, splitFrom: p.id })));
    handedOff.push(`${p.id} -> ${targets.join(', ')} (${isMerge ? 'merge' : 'split'})`);
  }
  // Disputes main CLOSED in place (VCST-6179): the verdict goes onto every branch copy of the item --
  // the entry's own and, when the branch retired the entry, its successors' (a split or merge copies
  // the item with its `at|by|note` intact). A copy the branch closed DIFFERENTLY is two judges
  // disagreeing, which only a person settles.
  const resolvedOn = [];
  for (const p of plan) {
    if (!p.resolutions.length) continue;
    const me = load(p.path).data;
    const holders = [p.path, ...(me.status === 'superseded'
      ? [...new Set(ids(me.supersededBy).flatMap((t) => activeSuccessors(t, p.id)))].map((t) => `entries/${t}.md`) : [])];
    for (const item of p.resolutions) {
      const key = evidenceKey(item);
      let found = 0;
      for (const h of holders) {
        const e = load(h);
        e.data.evidence = (e.data.evidence ?? []).map((x) => {
          if (!x.contradicts || evidenceKey(x) !== key) return x;
          found += 1;
          if (sameResolution(x, item)) return x;
          if (Object.keys(resolutionOf(x)).length) {
            problems.push(`${p.id}: main resolved the dispute at ${item.at} as ${item.resolved}, the branch's copy in ${h} says ${x.resolved}`);
            return x;
          }
          return { ...x, ...resolutionOf(item) };
        });
      }
      if (!found) problems.push(`${p.id}: main resolved the dispute at ${item.at}, but the branch holds no copy of it`);
      else resolvedOn.push(`${p.id}@${item.at}`);
    }
  }
  if (problems.length) return { writes: new Map(), problems, extended: [], handedOff: [] };

  const writes = new Map();
  for (const [path, e] of state) {
    e.data.evidence = flagDuplicateSessions(e.data.evidence ?? []);
    const text = `${stringifyFrontmatter(e.data)}\n${e.body.replace(/^\n?/, '')}`;
    parseEntry(text, path); // must round-trip
    if (lf(branch.get(path)) !== text) writes.set(path, text);
  }
  return { writes, problems, extended, handedOff, resolvedOn };
}
