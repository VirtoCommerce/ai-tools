// `arrivesAt` — where a fact is NEEDED, which is not where it is ABOUT.
//
// `anchors` served two masters: it carries identity, it is what the cross-plane check compares
// against the contract, and it is what `reanchor` corrects — and it was also the only thing arrival
// could match on. The password-hash finding belongs to `GET /api/members/{id}` by subject and is
// needed by somebody standing on `/sign-in`. Measured 2026-09-16: agents landed on `/sign-in` 19
// times across the archived logs and nothing ever arrived, while four entries answering sign-in
// questions sat in the corpus, anchored elsewhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { capture, loadEntry, fingerprint, addArrival } from '../src/capture.mjs';
import { coordinateIndex, arrivalIndex, unreachableAnchors } from '../src/coordinates.mjs';
import { arrivalsFor } from '../src/arrive.mjs';
import { validate } from '../src/validate.mjs';
import { DERIVED_ENTRIES } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-arrives-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  mkdirSync(join(dir, 'derived'), { recursive: true });
  writeFileSync(join(dir, 'derived', 'pin.json'), JSON.stringify({ deployment: 'vcptcore_stable', pin: 'p', platformVersion: '3.1007.26' }));
  writeFileSync(join(dir, 'derived-index.json'), `${JSON.stringify(buildIndex([]), null, 2)}\n`);
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const FACT = {
  subject: 'two endpoints disagree about whether a password hash is a secret',
  question: 'can a security account password hash be read back over the REST API',
  claim: 'One endpoint strips it and the other does not.',
  refutableBy: 'observation',
  anchors: ['GET /api/members/{id}'],
  appliesTo: ['surface=rest'],
  deployment: 'vcptcore_stable',
  at: '2026-09-16T00:00:00Z',
};

test('a delivery address is written, and it is not an anchor', () => {
  const dir = makeBase();
  const r = capture(dir, { ...FACT, arrivesAt: ['/sign-in'] });
  const { data } = loadEntry(dir, r.id);
  assert.deepEqual(data.anchors.map((a) => a.coordinate), ['GET /api/members/{id}']);
  assert.deepEqual(data.arrivesAt.map((a) => a.coordinate), ['/sign-in']);
  drop(dir);
});

// Identity is (anchors, scope). If a delivery address could move the fingerprint, then saying where
// a fact is wanted could collide it with a different fact — and the cheapest improvement available
// would become a thing that refuses entries.
test('a delivery address cannot change an entry\'s identity', () => {
  const withOut = fingerprint({ subject: FACT.subject, anchors: [{ coordinate: 'GET /api/members/{id}' }], appliesTo: [{ axis: 'surface', value: 'rest' }], plane: 'experiential' });
  const withIt = fingerprint({ subject: FACT.subject, anchors: [{ coordinate: 'GET /api/members/{id}' }], appliesTo: [{ axis: 'surface', value: 'rest' }], plane: 'experiential', arrivesAt: [{ coordinate: '/sign-in' }] });
  assert.equal(withOut, withIt);
});

test('two facts delivered to one page do not collide', () => {
  const dir = makeBase();
  const a = capture(dir, { ...FACT, arrivesAt: ['/sign-in'] });
  const b = capture(dir, {
    ...FACT,
    subject: 'a null lastLoginDate cannot tell never-tried from tried-and-failed',
    question: 'what does a null lastLoginDate mean',
    anchors: ['UserType.lastLoginDate'],
    arrivesAt: ['/sign-in'],
  });
  assert.notEqual(a.id, b.id);
  drop(dir);
});

test('arrival sees a delivery address; the cross-plane index does not', () => {
  const dir = makeBase();
  capture(dir, { ...FACT, arrivesAt: ['/sign-in'] });
  assert.equal(coordinateIndex(dir).has('/sign-in'), false,
    'the gate asks what a fact is ABOUT, and a storefront page is not a claim about the contract');
  assert.equal(arrivalIndex(dir).has('/sign-in'), true);
  const hits = arrivalsFor('https://storefront.example/sign-in', arrivalIndex(dir));
  assert.equal(hits.length, 1);
  assert.match(hits[0].subject, /password hash/);
  drop(dir);
});

test('a delivery address is never reported as an anchor nothing can raise', () => {
  const dir = makeBase();
  const r = capture(dir, { ...FACT, arrivesAt: ['/sign-in'] });
  // `capture` reports back which of the entry's ANCHORS the contract cannot raise. The delivery
  // address must not be in that list: reporting it would be reporting the design, since the field
  // exists precisely so a fact can be wanted where the contract does not reach.
  assert.ok(!r.unreachable.some((u) => String(u.coordinate ?? u).includes('/sign-in')),
    `delivery address leaked into the unreachable-anchor report: ${JSON.stringify(r.unreachable)}`);
  // And the gate says nothing about it either.
  const v = validate(dir);
  assert.equal(v.problems.length, 0, v.problems.join('; '));
  assert.ok(!v.notices.some((n) => n.includes('/sign-in')), v.notices.join('; '));
  // The helper itself is unchanged: asked about a coordinate directly, it still answers honestly.
  assert.ok(unreachableAnchors(dir, [{ coordinate: '/sign-in' }]).length > 0,
    'the helper is not what was changed — what changed is that nothing passes a delivery address to it');
  drop(dir);
});

// --- the ranking -----------------------------------------------------------------------------------
//
// Before this, entries sharing one coordinate were shown in the order their files were read. That
// was invisible until a coordinate held more than the hook shows: `/sign-in` holds four, three are
// shown, and which three was decided by filename.
test('within one coordinate, a disputed entry is offered first', () => {
  const index = new Map([['/sign-in', [
    { id: 'KB-AAAAAAA1', subject: 'calm', plane: 'experiential', independent: 3 },
    { id: 'KB-BBBBBBB2', subject: 'contested', plane: 'experiential', independent: 1, disputed: true },
  ]]]);
  assert.deepEqual(arrivalsFor('/sign-in', index).map((h) => h.id), ['KB-BBBBBBB2', 'KB-AAAAAAA1']);
});

test('then by independent observers, and a written entry before a contract table', () => {
  const index = new Map([['/sign-in', [
    { id: 'KB-CONTRACT', subject: 'route table', plane: 'derived-first', independent: 9 },
    { id: 'KB-THIN0001', subject: 'one sighting', plane: 'experiential', independent: 1 },
    { id: 'KB-SOLID001', subject: 'three sightings', plane: 'experiential', independent: 3 },
  ]]]);
  assert.deepEqual(
    arrivalsFor('/sign-in', index).map((h) => h.id),
    ['KB-SOLID001', 'KB-THIN0001', 'KB-CONTRACT'],
    'the contract is the one thing a reader can always go and read for themselves',
  );
});

test('a more specific coordinate still outranks a better-evidenced entry on a general one', () => {
  const index = new Map([
    ['/api/members', [{ id: 'KB-GENERAL1', subject: 'general', plane: 'experiential', independent: 9 }]],
    ['GET /api/members/{}', [{ id: 'KB-SPECIFIC', subject: 'specific', plane: 'experiential', independent: 1 }]],
  ]);
  assert.equal(arrivalsFor('https://host/api/members/{}', index)[0].id, 'KB-SPECIFIC',
    'where you are standing is the premise of arriving, and the specific coordinate says where that is');
});

// --- retrofitting, which is the whole point ---------------------------------------------------------
//
// 78 entries were written before the field existed, and `/sign-in` was visited 19 times across the
// archived logs with nothing arriving while four of them answered sign-in questions. A field only
// new entries could use would have taken twelve more runs to matter.

test('`arrives` adds a delivery address to an entry that already exists', () => {
  const dir = makeBase();
  const r = capture(dir, FACT);
  const out = addArrival(dir, r.id, { at: '/sign-in', reason: 'somebody debugging a sign-in needs to know the hash is readable elsewhere' });
  assert.deepEqual(out.arrivesAt, ['/sign-in']);
  assert.deepEqual(loadEntry(dir, r.id).data.anchors.map((a) => a.coordinate), ['GET /api/members/{id}'],
    'the anchor is untouched: identity does not move');
  assert.equal(loadEntry(dir, r.id).data.evidence.length, 1,
    'and no evidence row is written — saying where a fact is wanted is not a second sighting of it');
  drop(dir);
});

test('`arrives` refuses without a reason, and refuses a coordinate it already reaches', () => {
  const dir = makeBase();
  const r = capture(dir, FACT);
  assert.throws(() => addArrival(dir, r.id, { at: '/sign-in' }), (e) => /--reason is required/.test(e.message));
  addArrival(dir, r.id, { at: '/sign-in', reason: 'because' });
  assert.throws(() => addArrival(dir, r.id, { at: '/sign-in', reason: 'again' }), (e) => /already arrives/.test(e.message));
  assert.throws(
    () => addArrival(dir, r.id, { at: 'GET /api/members/{id}', reason: 'redundant' }),
    (e) => /already arrives/.test(e.message),
    'an anchor delivers too, so adding it again would put the entry in the list twice',
  );
  drop(dir);
});
