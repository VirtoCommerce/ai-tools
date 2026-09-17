// EXECUTABLE REFUTATION, TIER ONE: does the ground a licensed claim stands on still exist?
//
// Asked for by the second review after round four. Its argument does not rest on that run: an agent
// is told it may act on a `confirmed` entry without re-verifying, and nothing mechanical checks that
// the entry is still true. During round four itself the stand moved from platform 3.1007.26 to
// .27 underneath the corpus and not one thing noticed -- the arm noticed, in prose.
//
// A FULL refutation re-observes the claim against the deployment, which needs a request and an
// authorized session. This is the half that needs neither, and it is the half that runs today:
//
//   A claim is ABOUT a coordinate. The contract publishes coordinates. If a coordinate a licensed
//   claim is anchored on stops being published, the claim is standing on ground that has moved,
//   whatever it says.
//
// WHY `validate` DOES NOT ALREADY DO THIS. It reports unreachable anchors and calls them coverage:
// "3 experiential entries anchor on /account/orders, which the derived plane does not project ...
// nothing generated will raise them until it does." That is right for a storefront route this base
// has never extracted, and it is exactly wrong for a REST field that existed last week. The two
// look identical in a single snapshot and they are opposite findings — one is a gap in what we
// extract, the other is rot in what we believe. Telling them apart needs a baseline, which is what
// `anchor-baseline.json` is: the set of coordinates that DID resolve, recorded when it was true.
//
// So the verdicts are:
//
// TWO THINGS `holds` DOES NOT COVER, both found by the second review while trying to make the rot
// test fail, and neither disclosed by the verdict until now:
//
//   1. A contract change confined to a PARAMETER SEGMENT is invisible. `normalizeAnchor` collapses
//      the segment, so `/customerOrders/{id}`, `/customerOrders/{orderId}` and even
//      `/customerOrders/{id}-GONE` are one coordinate. That collapse is deliberate and right for
//      identity -- two writers spelling the same parameter differently must not mint two entries --
//      and it means tier one cannot see a rename inside the braces. Renaming a FIXED segment is
//      caught.
//   2. Editing an entry's OWN anchor to something unpublished also reads `holds`, because the
//      baseline is keyed by entry id and compared against the contract, not against the entry's
//      current anchors. That is `validate`'s job and it does it.
//
//   holds       every anchor that resolved at baseline still resolves
//   ROTTED      an anchor resolved at baseline and does not now  -> the claim needs re-observing
//   unprojected never resolved, at baseline or now  -> a coverage gap, not a finding
//   unbaselined no baseline yet  -> says so rather than guessing, and refuses to call it either way

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseEntry } from './frontmatter.mjs';
import { confirmationsOf, isDisputed } from './capture.mjs';
import { normalizeAnchor } from './anchors.mjs';

export const BASELINE = join('derived', 'anchor-baseline.json');

/** Every coordinate the derived plane publishes right now, normalized. */
export function contractCoordinates(base) {
  const out = new Set();
  const dir = join(base, 'derived', 'entries');
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/^ {2}- coordinate: (.+)$/gm)) {
      const c = normalizeAnchor(m[1].trim());
      if (c) out.add(c);
    }
  }
  return out;
}

/**
 * The licensed set: what an agent is permitted to act on without re-verifying. That permission is
 * the whole reason this file exists, so the refutation set is defined by it rather than by a
 * separate list somebody maintains.
 */
export function licensedEntries(base) {
  const dir = join(base, 'captured');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const { data } = parseEntry(readFileSync(join(dir, f), 'utf8'), f);
    if (data.status !== 'active') continue;
    if (confirmationsOf(data) < 2 || isDisputed(data)) continue;
    out.push(data);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const anchorsOf = (data) => (data.anchors ?? []).map((a) => normalizeAnchor(a.coordinate ?? a)).filter(Boolean);

/**
 * Record which anchors resolve TODAY, for every licensed entry.
 *
 * Deliberately records only what resolves. A baseline that also recorded the misses would make a
 * coordinate that was always wrong look like one that rotted the first time somebody fixed the
 * extraction.
 */
export function writeBaseline(base, { now = () => new Date().toISOString() } = {}) {
  const contract = contractCoordinates(base);
  const entries = {};
  for (const data of licensedEntries(base)) {
    const resolving = anchorsOf(data).filter((c) => contract.has(c));
    if (resolving.length) entries[data.id] = resolving;
  }
  const doc = {
    takenAt: now(),
    contractCoordinates: contract.size,
    note: 'Coordinates that DID resolve, per licensed entry. A later extract that loses one is rot, '
      + 'not a coverage gap. Written by `kb refute --baseline`; read by `kb refute`.',
    entries,
  };
  writeFileSync(join(base, BASELINE), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

export function readBaseline(base) {
  const p = join(base, BASELINE);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** Tier one, run. Read-only: it reports, and never edits an entry. */
export function refute(base) {
  const contract = contractCoordinates(base);
  const baseline = readBaseline(base);
  const results = [];

  for (const data of licensedEntries(base)) {
    const anchors = anchorsOf(data);
    const wasResolving = baseline?.entries?.[data.id] ?? null;
    const resolvesNow = anchors.filter((c) => contract.has(c));

    let verdict;
    let lost = [];
    if (!baseline) {
      verdict = 'unbaselined';
    } else if (!wasResolving) {
      // Nothing of this entry ever resolved. That is the storefront-route case validate already
      // reports as coverage, and it is not a refutation.
      verdict = 'unprojected';
    } else {
      lost = wasResolving.filter((c) => !contract.has(c));
      verdict = lost.length ? 'ROTTED' : 'holds';
    }

    results.push({
      id: data.id,
      subject: data.subject,
      verdict,
      anchors: anchors.length,
      resolving: resolvesNow.length,
      lost,
    });
  }

  const counts = results.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {});
  return { baseline: baseline ? { takenAt: baseline.takenAt } : null, results, counts };
}
