// Consolidation: the two-stage mechanism the dedup measurement supports.
//
//   stage 1, candidates: entries that name a coordinate in common. Cheap, and it raises pairs that
//     wording cannot -- in the measurement, one pair of records stating the same fact had question
//     similarity 0.00 and was raised here by the coordinate alone.
//   stage 2, decision: the SCOPE screens. Different scope means two facts that merging would fuse
//     into one entry asserting both, which is the failure this whole step exists to avoid. Equal
//     scope means only that this failure was not detected -- seeding 37 measured facts found two
//     pairs with identical scope and one shared coordinate that are plainly different facts. So
//     the last step is a writer naming the merge; the tool never performs one on its own.
//
// A merge is a union, never a pick. Two of the fifteen must-collapse pairs in the measurement were
// containments -- one record's claim was a superset of the other's -- so a consolidation that keeps
// one file and deletes the other loses a claim that someone paid to learn.

import { normalizeAnchor, readCaptured, loadEntry, rebuildCapturedArtifacts, confirmationsOf, capturedDir, CAPTURED_DIR } from './capture.mjs';
import { stringifyFrontmatter } from './frontmatter.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const scopeSet = (data) => [...new Set((data.appliesTo ?? []).map((s) => `${s.axis}=${s.value}`))].sort();
const coordSet = (data) => [...new Set((data.anchors ?? []).map((a) => normalizeAnchor(a.coordinate)).filter(Boolean))].sort();
const firstSeen = (data) => (data.evidence ?? []).map((e) => e.at ?? '').sort()[0] ?? '';

/**
 * Candidate groups: one group per coordinate that more than one active entry names.
 *
 * NOT a transitive closure. Seeding 37 measured facts showed why: a generic coordinate like
 * `POST /graphql` is named by entries that have nothing else to do with each other, and chaining
 * through it fused seven unrelated entries -- the plural mutation root and four sales-rep grid
 * facts -- into one "candidate group" no reader could act on. Every member of a group here shares
 * the SAME named coordinate with every other member, which is a claim a reader can check.
 */
export function candidates(base) {
  const entries = readCaptured(base).filter((e) => e.data.status === 'active');
  const byCoord = new Map();
  for (const e of entries) {
    for (const c of coordSet(e.data)) {
      if (!byCoord.has(c)) byCoord.set(c, []);
      byCoord.get(c).push(e);
    }
  }

  return [...byCoord.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([coordinate, members]) => {
      members.sort((a, b) => firstSeen(a.data).localeCompare(firstSeen(b.data)) || a.data.id.localeCompare(b.data.id));
      const scopes = members.map((m) => scopeSet(m.data).join(' '));
      const scopeAgrees = scopes.every((s) => s === scopes[0]);
      const axes = new Map();
      for (const m of members) {
        for (const s of m.data.appliesTo ?? []) {
          if (!axes.has(s.axis)) axes.set(s.axis, new Set());
          axes.get(s.axis).add(String(s.value));
        }
      }
      const differingAxes = [...axes.entries()].filter(([, v]) => v.size > 1).map(([axis, v]) => ({ axis, values: [...v].sort() }));
      // An axis one member records and another does not is a difference too, and the more dangerous
      // one: it is the shape of the measurement's decisive pair, where one record simply did not
      // say which principal it was about.
      const missingAxes = [...axes.keys()]
        .filter((axis) => members.some((m) => !(m.data.appliesTo ?? []).some((s) => s.axis === axis)))
        .sort();
      return {
        coordinate,
        members: members.map((m) => ({
          id: m.data.id, subject: m.data.subject, rel: m.rel,
          scope: scopeSet(m.data), coordinates: coordSet(m.data),
          confirmations: confirmationsOf(m.data),
        })),
        // Necessary for a merge, never sufficient. See consolidate() below.
        scopeAgrees: scopeAgrees && missingAxes.length === 0,
        differingAxes,
        missingAxes,
      };
    })
    .sort((a, b) => a.coordinate.localeCompare(b.coordinate));
}

export class MergeRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'MergeRefused';
  }
}

/**
 * Report candidates, and merge only a group a writer has NAMED.
 *
 * There is no blanket apply, and that is a correction the seeding forced. Over 37 measured facts,
 * agreeing scope proposed three merges and TWO of them were wrong:
 *
 *   * the password grant and the impersonation grant on `POST /connect/token` -- same principal,
 *     same surface, different facts. Merging them asserts that one call does both.
 *   * where an order stores a configuration, and what an order leaves behind -- same surface, same
 *     `CustomerOrder`, two unrelated claims.
 *
 * The axis that separates the first pair is the grant, and NEITHER entry records it, so no check
 * over recorded scope could have caught it: `missingAxes` only sees an axis one member wrote and
 * another did not. Scope agreement is necessary and not sufficient, and the gap is not closable by
 * a better rule over what is written down. So consolidation proposes and a writer decides -- the
 * same leash as capture, for the same measured reason.
 */
export function consolidate(base, { merge = null } = {}) {
  const groups = candidates(base);
  const proposed = groups.filter((g) => g.scopeAgrees);
  const blocked = groups.filter((g) => !g.scopeAgrees);
  if (!merge) return { groups, proposed, blocked, applied: [] };

  const ids = [...new Set(merge)];
  if (ids.length < 2) throw new MergeRefused('merge needs at least two entry ids, named explicitly');

  const chosen = groups.find((g) => ids.every((id) => g.members.some((m) => m.id === id)));
  if (!chosen) {
    throw new MergeRefused(
      `merge refused: ${ids.join(', ')} do not all name one coordinate in common, so they were never ` +
      'proposed as a group. Merging entries that share no coordinate is not consolidation.',
    );
  }
  const scopes = ids.map((id) => chosen.members.find((m) => m.id === id).scope.join(' '));
  if (!scopes.every((s) => s === scopes[0])) {
    throw new MergeRefused(
      `merge refused: the named entries do not agree on scope (${scopes.map((s) => s || '—').join(' | ')}). ` +
      'Merging them would produce one entry asserting both.',
    );
  }

  const applied = [];
  {
    const ordered = chosen.members.filter((m) => ids.includes(m.id));
    const survivorId = ordered[0].id;
    const survivor = loadEntry(base, survivorId);
    const others = ordered.slice(1).map((m) => loadEntry(base, m.id));

    // Union of anchors, keeping the first spelling seen of each coordinate.
    const anchors = [];
    const seenCoord = new Set();
    for (const src of [survivor, ...others]) {
      for (const a of src.data.anchors ?? []) {
        const key = normalizeAnchor(a.coordinate);
        if (seenCoord.has(key)) continue;
        seenCoord.add(key);
        anchors.push(a);
      }
    }

    // Union of evidence. Every observation that was paid for stays an observation.
    const evidence = [survivor, ...others].flatMap((src) => src.data.evidence ?? []);

    // Union of claims, verbatim and attributed. The tool does not decide which wording is better,
    // and it does not decide that two claims say the same thing -- that is exactly what the
    // measurement showed text cannot be asked.
    const claims = [survivor, ...others].map((src) => `### ${src.data.id} — ${src.data.subject}\n\n${src.body.trim()}`);
    const body = `\n${claims.join('\n\n')}\n\n_Consolidated from ${[survivor, ...others].map((s) => s.data.id).join(', ')}: one coordinate set, one scope. ` +
      `Both claims are kept verbatim; if they disagree, that is a dispute, not a merge artefact._\n`;

    const data = { ...survivor.data, anchors, evidence };
    writeFileSync(join(capturedDir(base), `${data.id}.md`), `${stringifyFrontmatter(data)}\n${body}`);

    for (const other of others) {
      other.data.status = 'retired';
      other.data.supersededBy = survivorId;
      const retiredBody = `${other.body.replace(/\s+$/, '')}\n\n**Retired.** Consolidated into ${survivorId}: same coordinates, same scope.\n`;
      writeFileSync(join(capturedDir(base), `${other.data.id}.md`), `${stringifyFrontmatter(other.data)}\n${retiredBody}`);
    }
    applied.push({ survivor: survivorId, retired: others.map((o) => o.data.id), coordinates: [...seenCoord].sort() });
  }
  if (applied.length) rebuildCapturedArtifacts(base);
  return { groups: candidates(base), proposed, blocked, applied };
}

export function renderConsolidation(r, { applied = false } = {}) {
  const out = [];
  if (!r.groups.length) return 'No candidate groups: no two active captured entries name a coordinate in common.';
  out.push(`${r.groups.length} candidate group(s) — entries that name a coordinate in common.`);
  out.push('');
  for (const g of r.groups) {
    out.push(`${g.scopeAgrees ? 'PROPOSED' : 'BLOCKED '}  ${g.coordinate}`);
    for (const m of g.members) {
      out.push(`    ${m.id}  ${m.subject}   scope: ${m.scope.join(' ') || '—'}   confirmations: ${m.confirmations}`);
    }
    if (!g.scopeAgrees) {
      for (const d of g.differingAxes) out.push(`  differs on axis "${d.axis}": ${d.values.join(' vs ')} — two facts, not one`);
      for (const a of g.missingAxes) out.push(`  axis "${a}" is recorded by some members and not others — the silent member's scope is wider than its claim`);
      out.push('  Not merged. Merging these would produce one entry asserting both.');
    } else {
      out.push(`  Scope agrees, which only means no difference was DETECTED. Read both, then, if they`);
      out.push(`  are one fact: kb consolidate --merge ${g.members.map((m) => m.id).join(',')}`);
    }
    out.push('');
  }
  if (r.applied.length) {
    out.push(`Merged: ${r.applied.map((a) => `${a.survivor} <- ${a.retired.join(', ')}`).join(' | ')}`);
  } else {
    out.push(`${r.proposed.length} group(s) proposed, ${r.blocked.length} blocked. Nothing has been written: ` +
      'a merge must be named, because agreeing scope has already been measured proposing wrong ones.');
  }
  return out.join('\n');
}
