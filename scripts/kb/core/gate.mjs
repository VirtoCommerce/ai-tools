// THE DISPUTE GATE (VCST-6221, decision 2026-10-13): is this disagreement a contradiction, or the same
// behaviour seen on a different build or setup?
//
// IT LABELS, IT DOES NOT DECIDE. The replay of every dispute a judge had settled (91 items,
// bench/variant-replay.mjs) showed that no rule over build versions separates "the behaviour changed
// between versions" from "the claim was wrong": the two sides of a real contradiction almost always ran
// different versions of the very module that owns the behaviour, and an automatic variant would have
// hidden 29-53% of real errors from the judge. So a disagreement on another build is still a DISPUTE --
// recorded, queued for the judge, counted -- but a SOFT one: `contested: "<what differs>"`. Readers see
// "contested on another build" instead of DISPUTED and the trust label is not lowered; the judge gets the
// build difference already computed. Same build, or anything unknown, stays a hard DISPUTE.
//
// The rule (`RELEVANCE`) is the replay's best on the 2026-10-08 round: 19 of 21 scoped items soft, the
// other two had identical reconstructed builds (a setting, or a PR build no manifest names).

import { supportOf } from './index-build.mjs';
import { ownersIndex } from './owners.mjs';
import { rulesWith } from './relevance.mjs';
import { buildDiff, classifyDisagreement } from './variant.mjs';

export const RELEVANCE = 'anchors+named';
const SUMMARY_MAX = 300;

/** The difference, as a reader reads it: `VirtoCommerce.Return 3.1003.0 vs 3.1001.0; theme a vs b`. */
export function summarize(diffs) {
  const text = diffs.map((d) => `${d.part} ${d.a ?? 'absent'} vs ${d.b ?? 'absent'}`).join('; ');
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1).replace(/;[^;]*$/, '')}; …` : text;
}

/**
 * `{ contested }` when the disagreement is soft, else null (a hard dispute).
 *  - `entry`: the entry's frontmatter (anchors, subject, evidence);
 *  - `observation`: `{ build, snapshot, conditions }` of the disagreeing observation;
 *  - `readBuild(pin)`: the snapshot the base holds for a supporting item's pin, or null;
 *  - `backUrl`: the observer's stand, to read module ownership from.
 */
export async function softDispute({ entry, observation, readBuild, backUrl, owners = ownersIndex }) {
  if (!observation?.build || !observation.snapshot) return null; // nothing to compare with: hard
  const builds = { [observation.build]: observation.snapshot };
  const support = supportOf(entry.evidence ?? []).filter((e) => !e.investigation);
  for (const s of support) {
    if (s.build && !builds[s.build]) {
      const snap = await readBuild(s.build);
      if (snap) builds[s.build] = snap;
    }
  }
  // Ownership is only asked of modules whose version differs from some supporting build.
  const mine = observation.snapshot.modules ?? {};
  const differing = new Set();
  for (const s of support) {
    const theirs = builds[s.build]?.modules;
    if (!theirs) continue;
    for (const id of new Set([...Object.keys(mine), ...Object.keys(theirs)])) if (mine[id] !== theirs[id]) differing.add(id);
  }
  const index = backUrl && differing.size
    ? await owners(backUrl, [...differing].filter((id) => mine[id]).map((id) => ({ id, version: mine[id] })))
    : { paths: {}, schemas: {} };
  const relevance = rulesWith(index)[RELEVANCE](entry, builds);
  const r = classifyDisagreement({
    observation: { build: observation.build, conditions: observation.conditions ?? null },
    support: support.map((s) => ({ build: s.build && builds[s.build] ? s.build : null, conditions: s.conditions ?? null })),
    builds,
    relevance,
  });
  return r.verdict === 'variant' ? { contested: summarize(r.diffs) } : null;
}

// ── build-aware ask (VCST-6221 step 2) ──────────────────────────────────────────────────────────

const base3 = (v) => String(v ?? '').split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
const cmpVersion = (a, b) => {
  const x = base3(a); const y = base3(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/**
 * Where a hit's support was observed, relative to the ASKER's build: `{ label: 'your build' }`,
 * `{ label: 'an older build' | 'a newer build' | 'a different build', diff }` (over the parts relevant to
 * the entry, `diff` as `summarize` prints it, the asker's version first), or `{ label: 'an unknown build' }`.
 * Same comparison as the dispute gate, read the other way.
 */
export async function buildLabel({ entry, asker, readBuild, backUrl, owners = ownersIndex }) {
  if (!asker?.build || !asker.snapshot) return { label: 'an unknown build' };
  const builds = { [asker.build]: asker.snapshot };
  const support = supportOf(entry.evidence ?? []).filter((e) => !e.investigation && e.build);
  for (const s of support) if (!builds[s.build]) { const snap = await readBuild(s.build); if (snap) builds[s.build] = snap; }
  const known = support.filter((s) => builds[s.build]);
  if (!known.length) return { label: 'an unknown build' };
  if (known.some((s) => s.build === asker.build)) return { label: 'your build' };
  const mine = asker.snapshot.modules ?? {};
  const differing = new Set();
  for (const s of known) for (const [id, v] of Object.entries(builds[s.build].modules ?? {})) if (mine[id] !== v) differing.add(id);
  for (const id of Object.keys(mine)) if (known.some((s) => builds[s.build].modules?.[id] !== mine[id])) differing.add(id);
  const index = backUrl && differing.size
    ? await owners(backUrl, [...differing].filter((id) => mine[id]).map((id) => ({ id, version: mine[id] })))
    : { paths: {}, schemas: {} };
  const relevance = rulesWith(index)[RELEVANCE](entry, builds);
  // Nothing the entry depends on could be named (an anchor no module's swagger declares, no page, no
  // GraphQL): there is nothing to compare, which is not the same as "your build".
  if (relevance.known === false) return { label: 'an unknown build' };
  let nearest = null;
  for (const s of known) {
    const d = buildDiff(asker.snapshot, builds[s.build], relevance);
    if (!d.length) return { label: 'your build' };
    if (!nearest || d.length < nearest.length) nearest = d;
  }
  const signs = nearest.filter((d) => d.a && d.b).map((d) => Math.sign(cmpVersion(d.a, d.b)));
  const label = signs.length && signs.every((x) => x > 0) ? 'an older build'
    : signs.length && signs.every((x) => x < 0) ? 'a newer build' : 'a different build';
  return { label, diff: summarize(nearest) };
}
