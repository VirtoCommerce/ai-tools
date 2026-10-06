// Bring a long-lived base branch (the schema-2 migration, VCST-6122) up to date with base `main`
// while the team keeps writing to `main`.
//
// WHY A TOOL AND NOT `git merge`. The branch rewrites entries (cards, splits, merges) that `main`
// keeps appending evidence to (confirm, dispute, re-observation). Git sees two edits of one file and
// either conflicts or auto-merges text it does not understand: evidence `main` appended to an entry the
// branch SUPERSEDED lands on a retired file nobody counts, and a merge survivor collects the same
// session twice. The safe case is narrow and checkable: `main` only APPENDED evidence. Then the branch
// version of each entry wins, `main`'s new items are appended, and items for a superseded entry are
// handed to its successor(s) -- tagged exactly as merge-entries / migrate-schema2 tag them.
// Anything else (a changed body, subject, anchor or status on `main`; a deleted entry) is refused and
// named, because only a person can say which side is right.
//
// Pure: takes file texts, returns writes and problems. Git lives in scripts/kb/sync-base.mjs.

import { parseEntry, stringifyFrontmatter } from './frontmatter.mjs';

/** One evidence item's identity: the same observation appended on two sides is one item. */
export const evidenceKey = (e) => `${e?.at ?? ''}|${e?.by ?? ''}|${e?.note ?? ''}|${e?.contradicts ? 1 : 0}`;

const ids = (v) => (!v ? [] : typeof v === 'string' ? [v] : v.map((x) => (typeof x === 'object' ? x.id : x)));
const withoutEvidence = (data) => JSON.stringify({ ...data, evidence: undefined });
const lf = (t) => String(t).replace(/\r\n/g, '\n');

/**
 * What `main` did to one entry since the merge base: `{ fresh: [items] }` when it only appended
 * evidence, or `{ problem }` when it changed anything else.
 */
export function evidenceOnlyChange(id, baseText, mainText) {
  const b = parseEntry(lf(baseText), id);
  const m = parseEntry(lf(mainText), id);
  if (b.body.trim() !== m.body.trim()) return { problem: `${id}: main changed the body` };
  if (withoutEvidence(b.data) !== withoutEvidence(m.data)) return { problem: `${id}: main changed a field other than evidence` };
  const before = (b.data.evidence ?? []).map(evidenceKey);
  const after = (m.data.evidence ?? []).map(evidenceKey);
  if (before.some((k, i) => after[i] !== k)) return { problem: `${id}: main removed or reordered evidence` };
  return { fresh: (m.data.evidence ?? []).slice(before.length) };
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
 * @returns {{writes: Map<string,string>, problems: string[], extended: string[], handedOff: string[]}}
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
    plan.push({ path, id, fresh: r.fresh });
  }
  if (problems.length) return { writes: new Map(), problems, extended: [], handedOff: [] };

  // Own evidence first, for every entry; hand-offs second, so a successor's own new items are in
  // place before the duplicate-session check reads them.
  const extended = [];
  for (const p of plan) if (append(p.path, p.fresh)) extended.push(p.id);
  const handedOff = [];
  for (const p of plan) {
    const me = load(p.path).data;
    if (me.status !== 'superseded' || !p.fresh.length) continue;
    const targets = ids(me.supersededBy);
    const isMerge = targets.length === 1;
    for (const t of targets) {
      const tp = `entries/${t}.md`;
      if (!load(tp)) { problems.push(`${p.id}: its successor ${t} is not on the branch`); continue; }
      append(tp, p.fresh.map((x) => (isMerge ? { ...x, mergedFrom: p.id } : { ...x, splitFrom: p.id })));
    }
    handedOff.push(`${p.id} -> ${targets.join(', ')} (${isMerge ? 'merge' : 'split'})`);
  }
  if (problems.length) return { writes: new Map(), problems, extended: [], handedOff: [] };

  const writes = new Map();
  for (const [path, e] of state) {
    e.data.evidence = flagDuplicateSessions(e.data.evidence ?? []);
    const text = `${stringifyFrontmatter(e.data)}\n${e.body.replace(/^\n?/, '')}`;
    parseEntry(text, path); // must round-trip
    if (lf(branch.get(path)) !== text) writes.set(path, text);
  }
  return { writes, problems, extended, handedOff };
}
