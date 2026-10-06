// What a capture turned away at the door should say so that the FIRST retry lands (VCST-6156).
//
// The door's verdicts (`anchorProblems`, the required-field check) were already right; what they
// said was not enough. Measured 2026-09-30 .. 10-06: 56 captures refused at the door, and after
// VCST-6102 every one of them an `unstructured` anchor -- 16 of the last 19 a one-word screen label
// ("Checkout", "Payment method"). The refusal named the accepted FORMS; the agent still had to work
// out that the label belonged in `claim` and which coordinate replaced it. This module says that, per
// rejected anchor, from the anchor's SHAPE -- and proposes coordinates the writer's own text already
// names, which is the one concrete coordinate the door can derive without guessing.
//
// THE GATE IS NOT LOOSENED HERE. Nothing in this file accepts an anchor `anchorProblems` refused;
// it only words the refusal. And none of it reaches the log: a hint quotes the rejected value, and a
// rejected value is by definition one nobody vetted (the log carries kinds and shapes only).
//
// The normative statement of the contract is `.claude/knowledge/execution/kb-capture-contract.md`;
// the strings here are the door's short form of it and cite it rather than restate it.

import { anchorShape, deeperByRoot, normalizeAnchor } from './coordinates.mjs';
import { SURFACES } from './index-load.mjs';
import { coordinatesIn } from './query.mjs';

export { CONTRACT } from './contract.mjs';
import { CONTRACT } from './contract.mjs';

const LABEL_FIX = 'a label is not a coordinate: put it in `claim`, and anchor the fact at the route of the page it '
  + 'was on (/account/orders) or the request it sent (POST /api/carts, Mutation.addCoupon)';

/** Where each required field's value comes from -- said when the field is missing. */
export const FIELD_SOURCE = {
  subject: 'one line stating the fact, as a claim',
  question: 'the question this entry answers, as the next agent would ask it, coordinate included',
  claim: 'what you did and what happened; button labels and menu paths go here',
  deployment: 'the stand you observed it on, spelled as the base spells it -- the `on <stand>` of an evidence '
    + 'line kb_ask / kb_show printed (vcst_qa, vcptcore_stable); not the bare TEST_ENV value (`vcst` is not `vcst_qa`)',
  anchor: 'the route or request the behaviour lives at (/account/orders, POST /api/carts, Query.products)',
};

export const SCOPE_SOURCE = `at least one axis=value, e.g. surface=<${SURFACES.join(' | ')}>`;

/**
 * The fix for ONE rejected anchor, worded from its kind and shape. `deeper` lists coordinates the
 * corpus already holds under a one-segment root, so a namespace refusal can show what a full route
 * looks like there; it is illustration, never a suggestion to adopt one of them.
 */
export function anchorFix(problem, { deeper = [] } = {}) {
  if (problem.kind === 'menu-path') {
    return 'keep the menu path in `claim`; anchor = the REST call the blade sent (HAR / Network panel)';
  }
  if (problem.kind === 'local-path') {
    return 'send the route as typed: through kb_capture (MCP), or prefix the CLI with MSYS_NO_PATHCONV=1';
  }
  const shape = anchorShape(problem.normalized ?? problem.coordinate);
  if (shape.type === 'path' && shape.segments === 0) {
    return 'the root is not a place: name the route of the page';
  }
  if (shape.type === 'path') {
    const seen = deeper.length ? ` -- the base holds e.g. ${deeper.join(', ')}` : '';
    return `a namespace, not a place: name the full route or endpoint you hit${seen}`;
  }
  if (shape.type === 'dotted') {
    return 'a dotted coordinate needs a name on both sides of the dot (Query.products, Mutation.addCoupon)';
  }
  return LABEL_FIX;
}

/**
 * Coordinates the capture's OWN text names that are not already among its anchors. Agents often
 * write the route into the question ("What does /cart show when …") and then anchor at a label; the
 * route they meant is right there. Only structured coordinates qualify -- the same test the door uses.
 */
export function anchorsInText(input, { namespaces } = {}) {
  // Compared NORMALISED: `{FRONT_URL}/cart` already passed is `/cart` in the text (PR #400 review).
  const have = new Set((input.anchors ?? []).map((a) => normalizeAnchor(typeof a === 'string' ? a : a?.coordinate ?? '')));
  const out = [];
  for (const field of ['subject', 'question', 'claim']) {
    // Before the corpus is read (`namespaces` unknown) a one-segment page (`/cart`) is still proposed:
    // the label refusal is exactly where an agent wrote the page in its question (PR #400 review). If it
    // turns out to be a namespace, the retry is refused with the namespace hint -- a suggestion, not a pass.
    for (const { raw } of coordinatesIn(input[field], { namespaces: namespaces ?? new Set() })) {
      if (!have.has(normalizeAnchor(raw)) && !out.includes(raw)) out.push(raw);
    }
  }
  return out.slice(0, 3);
}

/** Up to `limit` coordinates the corpus holds under a one-segment root, shortest first. */
export function deeperUnder(rows, root, limit = 3) {
  // The walk is `coordinates.mjs` `deeperByRoot`, shared with `namespaceRoots` (PR #400 review).
  const seg = String(root).replace(/^[A-Za-z]+\s+/, '').split('/').filter(Boolean)[0]?.toLowerCase();
  const found = [...(deeperByRoot(rows, { activeOnly: true }).get(seg)?.values() ?? [])];
  return found.sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, limit);
}

/**
 * The refusal's guidance, attached to the result the caller sees (never to the log line):
 *   problems[].fix  per rejected anchor
 *   suggest         coordinates the writer's own text names
 *   missing         { field: source } for each missing required field
 *   contract        where the whole contract is written
 */
export function doorHints(result, input, { rows = null, namespaces } = {}) {
  const problems = (result.problems ?? []).map((p) => {
    // The ROUTE, verb dropped: `POST /api` roots the same coordinates as `/api`, and `deeperUnder`
    // compares against corpus keys with their verbs dropped too (PR #400 review).
    const root = anchorShape(p.normalized ?? p.coordinate).type === 'path'
      ? String(p.normalized ?? '').replace(/^[A-Za-z]+\s+/, '') : '';
    const deeper = rows && root && root !== '/' ? deeperUnder(rows, root) : [];
    return { ...p, fix: anchorFix(p, { deeper }) };
  });
  const suggest = problems.length || result.missing?.includes('anchor') ? anchorsInText(input, { namespaces }) : [];
  const missing = Object.fromEntries((result.missing ?? []).map((f) => [f, f === 'scope' ? SCOPE_SOURCE : FIELD_SOURCE[f]]));
  return {
    ...result,
    ...(problems.length ? { problems } : {}),
    ...(suggest.length ? { suggest } : {}),
    ...(Object.keys(missing).length ? { missing } : {}),
    contract: CONTRACT,
  };
}
