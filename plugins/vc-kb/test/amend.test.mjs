// `kb amend` — correcting one step of a flow without destroying its identity.
//
// BUILT ON EVIDENCE, not anticipation. Two consecutive runs walked KB-AFB2D3C5, found gaps in its
// steps, and could record neither: `dispute` is for a claim an observation contradicts and an
// omission contradicts nothing, and `supersede` mints the id from the subject — which for a flow IS
// the goal, the one thing that does not change when step 4 turns out to be incomplete. Both runs
// confirmed the flow and put the gap in a report instead. One gap survived only because its author
// filed it separately as an ordinary fact; the other exists nowhere.
//
// This is the `reanchor` argument one level along: an anchor is an address rather than a claim, and
// a flow's steps are not its identity either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { validate } from '../src/validate.mjs';
import { how } from '../src/resolve.mjs';
import {
  capture, amend, confirm, retire, reanchor, loadEntry, fingerprint,
  confirmationsOf, CaptureRefused,
} from '../src/capture.mjs';
import { DERIVED_ENTRIES, FLOWS_DIR } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-amend-'));
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

const FLOW = {
  flow: true,
  subject: 'an order placed on the storefront',
  question: 'how do I place an order on this storefront',
  claim: 'STEP 1 - find a product. STEP 2 - add it. STEP 3 - check out on /cart: there is no /checkout route.',
  refutableBy: 'observation',
  anchors: ['/cart'],
  appliesTo: ['surface=storefront-ui'],
  deployment: 'vcptcore_stable',
  at: '2026-09-14T00:00:00Z',
};
const FACT = {
  subject: 'the amount a payment is for is not its total',
  question: 'what does PaymentIn.sum carry',
  claim: 'PaymentIn.sum carries the amount owed while PaymentIn.total reads 0.',
  refutableBy: 'observation',
  anchors: ['PaymentIn.sum'],
  appliesTo: ['surface=rest'],
  deployment: 'vcptcore_stable',
  at: '2026-09-14T00:00:00Z',
};

const body = (dir, id) => loadEntry(dir, id).body;

// --- what it is for -------------------------------------------------------------------------------

test('a step is corrected and the identity does not move', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  const before = loadEntry(dir, id).data;
  const fpBefore = fingerprint(before);

  amend(dir, id, {
    step: 3,
    note: '`/checkout/completed` DOES exist, as the post-placement landing page. What has no route is checkout itself.',
    deployment: 'vcptcore_stable',
  });

  const after = loadEntry(dir, id).data;
  assert.equal(after.id, id, 'the id others cite survives');
  assert.equal(after.subject, before.subject, 'the goal is untouched');
  assert.equal(fingerprint(after), fpBefore, 'and so is the fingerprint — this is the whole point');
  assert.match(body(dir, id), /## Amendments/);
  assert.match(body(dir, id), /\*\*Step 3\*\*.*checkout\/completed/s);
  assert.match(body(dir, id), /STEP 3 - check out on \/cart/, 'the original steps are still there to read');
  drop(dir);
});

// The reason amend writes no evidence row, encoded. Run 09 confirmed this flow AND wanted to amend
// it; if amending also counted, one walk by one agent would have registered as two independent
// observations, and the confirmation count is the entire trust model on this plane.
test('amending does not raise the confirmation count', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  const was = confirmationsOf(loadEntry(dir, id).data);

  amend(dir, id, { step: 3, note: 'a correction', deployment: 'vcptcore_stable' });
  assert.equal(confirmationsOf(loadEntry(dir, id).data), was, 'amending is partly disagreeing, and must not read as agreement');

  confirm(dir, id, { deployment: 'vcptcore_stable' });
  assert.equal(confirmationsOf(loadEntry(dir, id).data), was + 1, 'confirming still does exactly what it did');
  drop(dir);
});

test('the amendment carries the version it was observed on', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  const r = amend(dir, id, { step: 3, note: 'a correction', deployment: 'vcptcore_stable' });
  assert.equal(r.stamp.source, 'pin');
  assert.match(body(dir, id), /platform 3\.1007\.26/, 'so an amendment is as attributable as an evidence row');
  drop(dir);
});

test('several amendments accumulate under one heading, each naming its step', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  amend(dir, id, { step: 1, note: 'the quantity stepper IS the add-to-cart control', deployment: 'vcptcore_stable' });
  amend(dir, id, { step: 3, note: 'two delivery options exist, not one', deployment: 'vcptcore_stable' });
  const b = body(dir, id);
  assert.equal(b.match(/## Amendments/g).length, 1, 'one errata section, not one per amendment');
  assert.match(b, /\*\*Step 1\*\*/);
  assert.match(b, /\*\*Step 3\*\*/);
  drop(dir);
});

test('an amended flow is still served, and the amendment is searchable with it', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  amend(dir, id, { step: 3, note: 'the delivery method panel needs a shipping address selected first', deployment: 'vcptcore_stable' });
  const h = how(dir, 'how do I place an order on this storefront');
  assert.equal(h.miss, false);
  assert.equal(h.results[0].id, id);
  assert.match(h.results[0].body, /shipping address selected first/, 'the index was rebuilt, so the correction is reachable');
  assert.equal(validate(dir).ok, true);
  drop(dir);
});

// --- what it refuses ------------------------------------------------------------------------------

test('a fact cannot be amended, and the refusal names the verbs that fit', () => {
  const dir = makeBase();
  const { id } = capture(dir, FACT);
  assert.throws(
    () => amend(dir, id, { step: 1, note: 'more detail', deployment: 'vcptcore_stable' }),
    (e) => e instanceof CaptureRefused
      && /experiential plane, and amend is for flows only/.test(e.message)
      && /dispute/.test(e.message) && /supersede/.test(e.message),
    'a claim IS the entry; appending would make its evidence rows attest to sentences nobody saw',
  );
  drop(dir);
});

test('--step is required, because an amendment with no step is a fact', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  assert.throws(
    () => amend(dir, id, { note: 'something general', deployment: 'vcptcore_stable' }),
    (e) => e instanceof CaptureRefused && /--step is required/.test(e.message) && /kb capture/.test(e.message),
  );
  drop(dir);
});

// Found by run 11, on the verb's second day, in its own report. The doc comment promised every
// amendment carries a stamp; it only did when somebody passed --deployment, and nothing asked. Both
// amendments runs 10 and 11 wrote landed unstamped -- a correction nobody could date or place.
test('--deployment is required, so no amendment can land unattributable', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  assert.throws(
    () => amend(dir, id, { step: 2, note: 'the add control is the quantity stepper' }),
    (e) => e instanceof CaptureRefused && /--deployment is required/.test(e.message),
  );
  // and with it, the stamp is there
  amend(dir, id, { step: 2, note: 'x', deployment: 'vcptcore_stable' });
  assert.match(body(dir, id), /observed vcptcore_stable, platform 3\.1007\.26/);
  drop(dir);
});

test('--note is required', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  assert.throws(
    () => amend(dir, id, { step: 2, deployment: 'vcptcore_stable' }),
    (e) => e instanceof CaptureRefused && /--note is required/.test(e.message),
  );
  drop(dir);
});

test('a retired flow is not improved, and the refusal points at its survivor when there is one', () => {
  const dir = makeBase();
  const { id } = capture(dir, FLOW);
  retire(dir, id, { reason: 'the checkout was rebuilt' });
  assert.throws(
    () => amend(dir, id, { step: 1, note: 'x', deployment: 'vcptcore_stable' }),
    (e) => e instanceof CaptureRefused && /is retired/.test(e.message) && /not improved/.test(e.message),
  );
  drop(dir);
});

test('an id that names nothing is refused rather than creating something', () => {
  const dir = makeBase();
  assert.throws(
    () => amend(dir, 'KB-NOSUCH1', { step: 1, note: 'x' }),
    (e) => e instanceof CaptureRefused && /no entry KB-NOSUCH1/.test(e.message),
  );
  drop(dir);
});

// --- the latent defect this work uncovered --------------------------------------------------------

// `reanchor` computed the fingerprint without the plane, so on a flow it would have used the ANCHOR
// rule — comparing a procedure against facts by a rule that does not apply to it. Latent from the
// day the flow plane shipped, because no flow had been reanchored yet.
test('reanchoring a flow does not move its identity, since a flow is identified by its goal', () => {
  const dir = makeBase();
  const { id } = capture(dir, { ...FLOW, anchors: ['/cart', '/search'] });
  const fpBefore = fingerprint(loadEntry(dir, id).data);

  reanchor(dir, id, { was: '/search', now: '/catalog', reason: 'the store moved its search route' });

  const after = loadEntry(dir, id).data;
  assert.ok(after.anchors.some((a) => a.coordinate === '/catalog'));
  assert.equal(fingerprint(after), fpBefore, 'the goal did not change, so neither did the identity');
  assert.equal(validate(dir).ok, true);
  drop(dir);
});

test('two flows sharing a route still reanchor independently', () => {
  const dir = makeBase();
  const place = capture(dir, { ...FLOW, anchors: ['/cart', '/search'] });
  capture(dir, {
    ...FLOW,
    subject: 'an order cancelled on the storefront',
    question: 'how do I cancel an order',
    claim: 'STEP 1 - open /account/orders. STEP 2 - Cancel.',
    anchors: ['/cart', '/account/orders'],
  });
  // Under the anchor rule these two would be candidates for collision; under the goal rule they
  // are simply two procedures, and moving one's route cannot implicate the other.
  reanchor(dir, place.id, { was: '/search', now: '/catalog', reason: 'route moved' });
  assert.equal(validate(dir).ok, true);
  drop(dir);
});
