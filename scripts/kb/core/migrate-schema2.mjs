// Schema-2 migration of the base (VCST-6122 M2): one PLAN per entry in, entry files and the index out.
//
// A model writes the plan -- whether an entry is one fact or several, its retrieval card, its
// surfaces -- and this module is the part that must not have opinions: ids, evidence, file bytes and
// the index are derived here, the same way on every run. That split is what makes the migration
// RE-RUNNABLE: the base keeps moving on `main` while the plans are written, so the files are rebuilt
// from the plans against a fresh `main` rather than hand-merged (the base is public; a merge mistake
// there is a published one).
//
// Three rules the output is checked against, every one a promise VCST-6122 makes:
//   1. EVERY OLD ID STILL RESOLVES. A split parent keeps its file, becomes `status: superseded` and
//      names its children in `supersededBy`; `show` still serves it (Decision 2).
//   2. TRUST IS NOT RESET BY A MIGRATION NOBODY OBSERVED. A child inherits the parent's evidence
//      verbatim, each item marked `splitFrom: <parent>` so the provenance survives the move.
//   3. A CARD USES THE VOCABULARY. A concept the vocabulary does not hold is refused, never written:
//      a new concept is a vocabulary edit, reviewed like an entry (Decision 4).

import { createHash } from 'node:crypto';

import { mintId } from './canonical.mjs';
import { parseEntry, stringifyFrontmatter } from './frontmatter.mjs';
import { SURFACES } from './index-load.mjs';

export const MIN_QUESTIONS = 3;

/** The version of an entry a plan was written from: its text with line endings normalised. */
export const entryHash = (text) => createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

const surfaceItems = (surfaces) => surfaces.map((value) => ({ axis: 'surface', value }));
const withSurfaces = (appliesTo, surfaces) => [
  ...(appliesTo ?? []).filter((a) => a?.axis !== 'surface'),
  ...surfaceItems(surfaces),
];
const card = (p) => ({
  questions: p.questions.map((text) => ({ text: String(text).trim() })),
  concepts: p.concepts.map((id) => ({ id })),
});

/** What is wrong with one card, as messages; empty when it may be written. */
function cardProblems(where, p, concepts) {
  const out = [];
  const qs = (p.questions ?? []).map((q) => String(q).trim()).filter(Boolean);
  if (qs.length < MIN_QUESTIONS) out.push(`${where}: ${qs.length} question(s), at least ${MIN_QUESTIONS} needed`);
  if (new Set(qs.map((q) => q.toLowerCase())).size !== qs.length) out.push(`${where}: a question is repeated`);
  if (!(p.concepts ?? []).length) out.push(`${where}: no concept`);
  for (const c of p.concepts ?? []) if (!concepts.has(c)) out.push(`${where}: concept "${c}" is not in the vocabulary`);
  if (!(p.surface ?? []).length) out.push(`${where}: no surface`);
  for (const s of p.surface ?? []) if (!SURFACES.includes(s)) out.push(`${where}: surface "${s}" is not one of ${SURFACES.join(', ')}`);
  return out;
}

/**
 * Apply the plans to the entries.
 *
 * @param {Map<string,string>} files  entry path -> current text, for every entry in the base
 * @param {object[]} plans            one per entry to migrate (see the M2 brief)
 * @param {{concepts: {id:string}[]}} vocabulary
 * @returns {{writes: Map<string,string>, created: string[], superseded: string[], problems: string[]}}
 *   `writes` holds only files whose bytes change. Nothing is returned for writing when `problems`
 *   is non-empty -- a half-applied migration is the one outcome worse than none.
 */
export function migrate(files, plans, vocabulary) {
  const concepts = new Set((vocabulary?.concepts ?? []).map((c) => c.id));
  const byId = new Map();
  for (const [path, text] of files) {
    const { data, body } = parseEntry(text, path);
    byId.set(String(data.id), { path, text, data, body });
  }
  const writes = new Map();
  const created = [];
  const superseded = [];
  const problems = [];
  const seen = new Set();

  for (const plan of plans) {
    const parent = byId.get(plan.id);
    if (!parent) { problems.push(`${plan.id}: not in the base`); continue; }
    if (seen.has(plan.id)) { problems.push(`${plan.id}: planned twice`); continue; }
    seen.add(plan.id);
    if (parent.data.status !== 'active') { problems.push(`${plan.id}: status is ${parent.data.status}, only active entries migrate`); continue; }
    // A plan is written from one version of the entry and carries its hash. The base moves on while
    // plans are written -- confirms, disputes, anchor corrections -- and a split child's body is a
    // COPY of the parent's prose, so applying a plan to a newer entry would silently publish the old
    // text. A stale plan is refused; re-plan that one entry.
    if (plan.basedOn !== entryHash(parent.text)) { problems.push(`${plan.id}: the entry changed since its plan was written (basedOn ${plan.basedOn ?? 'missing'}), re-plan it`); continue; }

    if (plan.action === 'keep') {
      problems.push(...cardProblems(plan.id, plan, concepts));
      const next = { ...parent.data, ...card(plan), appliesTo: withSurfaces(parent.data.appliesTo, plan.surface) };
      writes.set(parent.path, `${stringifyFrontmatter(next)}\n${parent.body}`);
      continue;
    }
    if (plan.action !== 'split') { problems.push(`${plan.id}: unknown action "${plan.action}"`); continue; }

    const children = plan.children ?? [];
    if (children.length < 2) problems.push(`${plan.id}: a split needs at least two children`);
    const parentAnchors = new Set((parent.data.anchors ?? []).map((a) => a.coordinate));
    const ids = [];
    children.forEach((child, i) => {
      const where = `${plan.id} child ${i + 1}`;
      const subject = String(child.subject ?? '').trim();
      if (!subject) { problems.push(`${where}: no subject`); return; }
      const id = mintId(subject);
      if (byId.has(id) || ids.includes(id)) { problems.push(`${where}: id ${id} is already taken`); return; }
      problems.push(...cardProblems(where, child, concepts));
      for (const a of child.anchors ?? []) if (!parentAnchors.has(a)) problems.push(`${where}: anchor "${a}" is not one of the parent's`);
      if (!String(child.body ?? '').trim()) problems.push(`${where}: empty body`);
      ids.push(id);
      const entry = {
        id,
        subject,
        plane: parent.data.plane,
        question: String(child.question ?? '').trim() || undefined,
        ...card(child),
        status: 'active',
        appliesTo: withSurfaces(parent.data.appliesTo, child.surface),
        anchors: (child.anchors ?? []).map((coordinate) => ({ coordinate })),
        ...(parent.data.arrivesAt ? { arrivesAt: parent.data.arrivesAt } : {}),
        evidence: (parent.data.evidence ?? []).map((e) => ({ ...e, splitFrom: plan.id })),
      };
      const path = `entries/${id}.md`;
      writes.set(path, `${stringifyFrontmatter(entry)}\n${String(child.body).replace(/\s+$/, '')}\n`);
      created.push(id);
    });
    const retired = { ...parent.data, status: 'superseded', supersededBy: ids.map((id) => ({ id })) };
    writes.set(parent.path, `${stringifyFrontmatter(retired)}\n${parent.body}`);
    superseded.push(plan.id);
  }

  for (const [path, text] of [...writes]) if (files.get(path) === text) writes.delete(path);
  return problems.length ? { writes: new Map(), created: [], superseded: [], problems } : { writes, created, superseded, problems };
}
