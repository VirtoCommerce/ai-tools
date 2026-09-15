// The flow plane, and the one thing it exists to guarantee: a procedure and a fact are never in
// the same ranked list.
//
// This is not a design preference. Measured 2026-09-14 on the live base: one flow entry written
// into the EXPERIENTIAL plane as an ordinary capture cleared the relevance floor on 18 of 34 replay
// rows and took rank 1 on two questions it had nothing to do with — "which endpoint lists the
// payment methods a store has enabled" and one about how the storefront xAPI scopes an order query.
// Four comparably long FACTS disturb 6–7 rows each, so it is not a length effect: a procedure is
// ABOUT the generic nouns of a journey, and no threshold reaches that.
//
// A separate index alone would not have fixed it either — derived and captured already have
// separate indexes and still compete, because `ask` concatenates both and sorts by raw score. The
// separation that works is a separate QUESTION, which is what these tests hold in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { validate } from '../src/validate.mjs';
import { ask, how, flowsMatching } from '../src/resolve.mjs';
import {
  capture, confirm, retire, reanchor, CaptureRefused, loadEntry, readFlows, readCaptured,
  fingerprint, rebuildCapturedArtifacts,
} from '../src/capture.mjs';
import { DERIVED_ENTRIES, FLOWS_DIR, FLOWS_INDEX, FLOWS_CATALOG, CAPTURED_DIR } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-flows-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), JSON.stringify(buildIndex([]), null, 2) + '\n');
  mkdirSync(join(dir, 'derived'), { recursive: true });
  writeFileSync(join(dir, 'derived', 'pin.json'), JSON.stringify({
    deployment: 'vcptcore_stable', pin: 'c2f9c438eba4cd95', platformVersion: '3.1007.26',
  }));
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const ORDER_FLOW = {
  flow: true,
  subject: 'placing an order on the storefront',
  question: 'how do I place an order on this storefront',
  claim: 'Checkout happens ON the cart page: there is no /checkout route. Open /cart, choose a delivery method, choose a payment method, then Place order. The order lands at /account/orders.',
  refutableBy: 'observation',
  anchors: ['/cart', '/search'],
  appliesTo: ['surface=storefront-ui'],
  deployment: 'vcptcore_stable',
  at: '2026-09-14T00:00:00Z',
};

// The fact below deliberately shares the vocabulary a procedure is made of. Before the split, this
// is the collision: one of them wins a list both of them are in.
const PAYMENT_FACT = {
  subject: 'the amount a payment is for is not the payment total',
  question: 'which endpoint lists the payment methods a store has enabled',
  claim: 'PaymentIn.sum carries the amount owed while PaymentIn.total reads 0, and the Admin renders both on one blade.',
  refutableBy: 'observation',
  anchors: ['PaymentIn.sum'],
  appliesTo: ['surface=rest'],
  deployment: 'vcptcore_stable',
  at: '2026-09-14T00:00:00Z',
};

// --- the separation ------------------------------------------------------------------------------

test('a flow is written to its own store, never into captured/', () => {
  const dir = makeBase();
  const r = capture(dir, ORDER_FLOW);
  assert.ok(existsSync(join(dir, FLOWS_DIR, `${r.id}.md`)), 'the flow lands in flows/');
  assert.ok(!existsSync(join(dir, CAPTURED_DIR, `${r.id}.md`)), 'and nowhere else');
  assert.equal(loadEntry(dir, r.id).data.plane, 'flow');
  assert.equal(readFlows(dir).length, 1);
  assert.equal(readCaptured(dir).length, 0);
  drop(dir);
});

test('`ask` cannot reach a flow, which is the whole mechanism', () => {
  const dir = makeBase();
  capture(dir, ORDER_FLOW);
  const res = ask(dir, 'how do I place an order on this storefront', { limit: 3 });
  assert.equal(res.miss, true, 'the flow exists and ask must still miss — it is not ask\'s corpus');
  assert.ok(!res.searched.includes('flow'));
  drop(dir);
});

test('`how` serves it, and cannot reach a fact', () => {
  const dir = makeBase();
  const flow = capture(dir, ORDER_FLOW);
  const fact = capture(dir, PAYMENT_FACT);

  const h = how(dir, 'how do I place an order on this storefront');
  assert.equal(h.miss, false);
  assert.deepEqual(h.results.map((r) => r.id), [flow.id]);

  const a = ask(dir, 'which endpoint lists the payment methods a store has enabled');
  assert.equal(a.miss, false);
  assert.deepEqual(a.results.map((r) => r.id), [fact.id], 'the fact answers its own question, undisturbed');
  drop(dir);
});

// THE REGRESSION THIS PLANE WAS BUILT FOR. With both in one corpus the flow led this row on
// `payment`, `methods`, `store` and `lists` — four generic terms it carries because a procedure
// mentions the whole journey. Here the flow is not a candidate at all.
test('a procedure can no longer outrank a fact on the generic nouns it happens to contain', () => {
  const dir = makeBase();
  capture(dir, ORDER_FLOW);
  const fact = capture(dir, PAYMENT_FACT);
  const res = ask(dir, 'which endpoint lists the payment methods a store has enabled', { limit: 3 });
  assert.ok(!res.results.some((r) => r.plane === 'flow'), 'no flow may appear in an ask result, ever');
  assert.equal(res.results[0].id, fact.id);
  drop(dir);
});

test('a MISS points at the other verb rather than merging its answer in', () => {
  const dir = makeBase();
  const flow = capture(dir, ORDER_FLOW);
  const res = ask(dir, 'how do I place an order on this storefront');
  assert.equal(res.miss, true);
  const pointed = flowsMatching(dir, 'how do I place an order on this storefront');
  assert.deepEqual(pointed.map((p) => p.id), [flow.id], 'the pointer names it; the result set still does not contain it');
  drop(dir);
});

// --- identity ------------------------------------------------------------------------------------

test('two flows to the same goal at the same scope are one flow', () => {
  const dir = makeBase();
  capture(dir, ORDER_FLOW);
  assert.throws(
    () => capture(dir, { ...ORDER_FLOW, claim: 'A second writer, different steps, same goal.', anchors: ['/basket'] }),
    (e) => e instanceof CaptureRefused && /reaches this goal at this scope/.test(e.message),
    'different anchors must not buy a second copy of one procedure',
  );
  drop(dir);
});

// The case an anchor-based rule gets wrong, and the reason flows are identified by goal: these two
// procedures travel the same routes and are not the same procedure.
test('two flows sharing every route are two flows when the goal differs', () => {
  const dir = makeBase();
  const place = capture(dir, ORDER_FLOW);
  const cancel = capture(dir, {
    ...ORDER_FLOW,
    subject: 'cancelling an order on the storefront',
    question: 'how do I cancel an order I placed',
    claim: 'Open /account/orders, select the order, and use Cancel. The shipment is left New.',
  });
  assert.notEqual(place.id, cancel.id);
  assert.equal(readFlows(dir).length, 2);
  drop(dir);
});

test('scope separates one goal into two flows', () => {
  const dir = makeBase();
  capture(dir, ORDER_FLOW);
  const guest = capture(dir, {
    ...ORDER_FLOW,
    subject: 'placing an order on the storefront as a guest',
    appliesTo: ['surface=storefront-ui', 'principal=anonymous'],
  });
  assert.equal(readFlows(dir).length, 2);
  assert.notEqual(guest.id, undefined);
  drop(dir);
});

test('a flow fingerprint ignores anchors and a fact fingerprint ignores the goal', () => {
  const fp = (d) => fingerprint(d);
  const a = fp({ subject: 'placing an order', anchors: [{ coordinate: '/cart' }], appliesTo: [{ axis: 'surface', value: 'ui' }], plane: 'flow' });
  const b = fp({ subject: 'placing an order', anchors: [{ coordinate: '/totally-different' }], appliesTo: [{ axis: 'surface', value: 'ui' }], plane: 'flow' });
  assert.equal(a, b, 'the routes a procedure travels are not its identity');

  const c = fp({ subject: 'one wording', anchors: [{ coordinate: '/cart' }], appliesTo: [{ axis: 'surface', value: 'ui' }], plane: 'experiential' });
  const d = fp({ subject: 'a completely different wording', anchors: [{ coordinate: '/cart' }], appliesTo: [{ axis: 'surface', value: 'ui' }], plane: 'experiential' });
  assert.equal(c, d, 'a fact is still identified by where it is filed, not by how it is worded');
  assert.notEqual(a, c);
});

// --- lifecycle, shared with the other written plane ----------------------------------------------

test('the lifecycle verbs work on a flow without being told it is one', () => {
  const dir = makeBase();
  const { id } = capture(dir, ORDER_FLOW);

  const c = confirm(dir, id, { deployment: 'vcptcore_stable' });
  assert.equal(c.confirmations, 2, 'walking a flow again is a confirmation like any other');
  assert.equal(c.stamp.source, 'pin', 'and it is stamped with the version it was walked on');

  reanchor(dir, id, { was: '/search', now: '/catalog', reason: 'the store moved its search route' });
  assert.ok(loadEntry(dir, id).data.anchors.some((a) => a.coordinate === '/catalog'));

  retire(dir, id, { reason: 'the checkout was rebuilt' });
  assert.equal(loadEntry(dir, id).data.status, 'retired');
  assert.equal(how(dir, 'how do I place an order on this storefront').miss, true, 'a retired flow leaves the index');
  drop(dir);
});

// --- the gate ------------------------------------------------------------------------------------

test('validate counts flows and rebuilds their artifacts to compare', () => {
  const dir = makeBase();
  capture(dir, ORDER_FLOW);
  const v = validate(dir);
  assert.equal(v.ok, true, v.problems.join('; '));
  assert.equal(v.flows, 1);
  drop(dir);
});

test('a stale flow index is caught by rebuilding, not by counting ids', () => {
  const dir = makeBase();
  const { id } = capture(dir, ORDER_FLOW);
  // The body changes on disk and nothing rebuilds. The index still mentions exactly the right id,
  // which is why the id-level check cannot see this and only a byte-compare can.
  const p = join(dir, FLOWS_DIR, `${id}.md`);
  writeFileSync(p, readFileSync(p, 'utf8') + '\nA sentence the index has never seen.\n');
  assert.ok(validate(dir).problems.some((x) => new RegExp(FLOWS_INDEX).test(x)), 'stale index must fail the gate');
  rebuildCapturedArtifacts(dir, 'flow');
  assert.equal(validate(dir).ok, true, 'and reindexing must fix it');
  drop(dir);
});

test('a flow citing an entry that does not exist fails the gate', () => {
  const dir = makeBase();
  const { id } = capture(dir, ORDER_FLOW);
  const p = join(dir, FLOWS_DIR, `${id}.md`);
  writeFileSync(p, readFileSync(p, 'utf8').replace('Open /cart', 'First @kb(KB-NOTHERE), then open /cart'));
  rebuildCapturedArtifacts(dir, 'flow');
  assert.ok(
    validate(dir).problems.some((x) => /cites @kb\(KB-NOTHERE\)/.test(x)),
    'a step pointing at nothing reads exactly like one that resolves — that is the defect three anchors sat in this corpus with',
  );
  drop(dir);
});

test('a flow citing a retired entry is a notice, not a failure', () => {
  const dir = makeBase();
  const fact = capture(dir, PAYMENT_FACT);
  const { id } = capture(dir, ORDER_FLOW);
  const p = join(dir, FLOWS_DIR, `${id}.md`);
  writeFileSync(p, readFileSync(p, 'utf8').replace('Open /cart', `See @kb(${fact.id}), then open /cart`));
  rebuildCapturedArtifacts(dir, 'flow');
  assert.equal(validate(dir).ok, true, 'a live citation is fine');

  retire(dir, fact.id, { reason: 'superseded by better observation' });
  const v = validate(dir);
  assert.equal(v.ok, true, 'a retired citation does not fail the corpus');
  assert.ok(v.notices.some((n) => new RegExp(`cites @kb\\(${fact.id}\\)`).test(n)), 'but it is said out loud');
  drop(dir);
});

test('an entry in flows/ that does not declare the flow plane fails the gate', () => {
  const dir = makeBase();
  const { id } = capture(dir, ORDER_FLOW);
  const p = join(dir, FLOWS_DIR, `${id}.md`);
  writeFileSync(p, readFileSync(p, 'utf8').replace('plane: flow', 'plane: experiential'));
  assert.ok(validate(dir).problems.some((x) => /declares plane "experiential"/.test(x)));
  drop(dir);
});

test('an empty flow plane is a legitimate state, on an otherwise empty base', () => {
  const dir = makeBase();
  const v = validate(dir);
  assert.equal(v.ok, true, v.problems.join('; '));
  assert.equal(v.flows, 0);
  assert.equal(how(dir, 'how do I place an order').miss, true);
  assert.ok(!existsSync(join(dir, FLOWS_CATALOG)), 'nothing is written until something is recorded');
  drop(dir);
});
