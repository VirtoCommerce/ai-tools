// A DIFFERENT BUILD OR SETUP, OR A CONTRADICTION? (VCST-6221 step 3)
//
// The first judging round (2026-10-08) settled 60 dispute items and found most of them were not
// contradictions: 21 were the same behaviour observed on a different build or stand setup. A dispute
// marks the entry DISPUTED for every reader and costs a human an investigation, so the door now asks
// first: was this observation made under the conditions the entry's support was made under?
//
//   * SOME supporting observation was made on the same build (as far as the entry's relevant modules
//     go) and under no conflicting declared condition -> the same conditions gave a different result:
//     a DISPUTE, exactly as before.
//   * EVERY supporting observation differs -- a relevant module version, the platform when it is
//     relevant, or a declared condition (`conditions`, VCST-6179) -> a VARIANT: recorded beside the
//     entry, the entry stays as it was, and the agent is told why.
//   * ANYTHING UNKNOWN on the way -> a DISPUTE. Failing closed is the point: a real contradiction
//     filed as a variant is a defect nobody sees, while a variant filed as a dispute costs one look.
//
// WHICH MODULES ARE RELEVANT is the caller's (`relevance`), because it is the part with a measured,
// replaceable answer (`bench/variant-replay.mjs`); this file only compares.

import { parseConditions } from './conditions.mjs';

const lower = (modules = {}) => Object.fromEntries(Object.entries(modules).map(([k, v]) => [k.toLowerCase(), String(v)]));

/**
 * What differs between two builds over the relevant parts: `[{ part, a, b }]`. `relevant` is
 * `{ platform: boolean, theme: boolean, modules: (id) => boolean }`.
 *
 * ONLY WHAT BOTH SIDES KNOW. A version missing on one side is UNKNOWN, never different: a live stamp
 * lists every installed module while a snapshot rebuilt from deploy history lists only the modules the
 * manifest pins, and a platform version the Admin page did not give is null. Counting those as
 * differences turned a contradiction on the same build into a soft dispute -- the one direction the gate
 * must not err in (review of ai-tools#429).
 */
export function buildDiff(a, b, relevant) {
  const out = [];
  if (relevant.platform && a.platform && b.platform && a.platform !== b.platform) out.push({ part: 'platform', a: a.platform, b: b.platform });
  if (relevant.theme && a.theme && b.theme && a.theme !== b.theme) out.push({ part: 'theme', a: a.theme, b: b.theme });
  const ma = lower(a.modules);
  const mb = lower(b.modules);
  for (const id of Object.keys(ma)) {
    if (!relevant.modules(id) || mb[id] == null) continue;
    if (ma[id] !== mb[id]) out.push({ part: id, a: ma[id], b: mb[id] });
  }
  return out;
}

/** Declared conditions that both sides name and disagree on: `[{ part, a, b }]`. Silence is not disagreement. */
export function conditionDiff(a, b) {
  const pa = parseConditions(a);
  const pb = parseConditions(b);
  const out = [];
  for (const k of Object.keys(pa)) {
    const kb = Object.keys(pb).find((x) => x.toLowerCase() === k.toLowerCase());
    if (kb && pa[k] !== pb[kb]) out.push({ part: k, a: pa[k], b: pb[kb] });
  }
  return out;
}

/**
 * `observation` -- `{ build, conditions }` of the new disagreeing observation; `support` -- the entry's
 * supporting evidence, same shape; `builds` -- `pin -> snapshot`; `relevance` -- for this entry.
 * Returns `{ verdict: 'variant' | 'dispute', why, diffs? }`.
 */
export function classifyDisagreement({ observation, support, builds, relevance }) {
  if (!support.length) return { verdict: 'dispute', why: 'the entry has no supporting observation to compare with' };
  const mine = observation.build ? builds[observation.build] : null;
  const diffs = [];
  for (const s of support) {
    const declared = conditionDiff(observation.conditions, s.conditions);
    const theirs = s.build ? builds[s.build] : null;
    if (!declared.length && (!mine || !theirs)) return { verdict: 'dispute', why: 'a supporting observation has no comparable build' };
    const built = mine && theirs ? buildDiff(mine, theirs, relevance) : [];
    if (!declared.length && !built.length) return { verdict: 'dispute', why: 'a supporting observation was made under the same relevant build and conditions' };
    diffs.push([...declared, ...built]);
  }
  // Every supporting observation differs. Name the smallest difference: it is the likeliest cause.
  const nearest = diffs.sort((x, y) => x.length - y.length)[0];
  return { verdict: 'variant', why: 'every supporting observation was made under a different build or setup', diffs: nearest };
}
