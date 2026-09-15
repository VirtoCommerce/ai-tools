// Correcting the address without touching the fact.
//
// Three entries in the live corpus are filed under coordinates that resolve to nothing, and until
// this verb nothing could fix any of them. `supersede` mints a new id from the subject, so
// correcting an address meant destroying the number other entries cite — and KB-4A8606CA, one of
// the three, is cited by KB-FA724D31. The base held a known-wrong address for a day because the
// only alternative was to break a reference.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { capture, reanchor, retire, loadEntry, fingerprint, CaptureRefused } from '../src/capture.mjs';
import { ask } from '../src/resolve.mjs';
import { DERIVED_ENTRIES } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-reanchor-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), `${JSON.stringify(buildIndex([]), null, 2)}\n`);
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const FACT = {
  subject: 'storefront-delete-member-detaches-the-contact',
  question: 'What does deleting a member from the storefront roster actually delete?',
  claim: 'It removes the organization membership and nothing else.',
  refutableBy: 'observation',
  anchors: ['Mutations.deleteOrganizationContact', 'GET /company/members'],
  appliesTo: ['surface=storefront-ui'],
  deployment: 'vcptcore_stable',
  at: '2026-09-11T18:02:54Z',
};

test('the coordinate changes, the id and the claim do not', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  const before = loadEntry(dir, first.id);

  const r = reanchor(dir, first.id, {
    was: 'Mutations.deleteOrganizationContact',
    now: 'Mutations.deleteContact',
    reason: 'read off the storefront button, not the schema; deleteOrganizationContact does not exist',
  });

  assert.equal(r.id, first.id, 'the id is what a citation depends on and must survive a correction');
  const after = loadEntry(dir, first.id);
  assert.deepEqual(after.data.anchors.map((a) => a.coordinate), ['Mutations.deleteContact', 'GET /company/members']);
  assert.equal(after.data.subject, before.data.subject);
  assert.deepEqual(after.data.evidence, before.data.evidence, 'nobody observed anything new');
  assert.match(readFileSync(join(dir, after.rel), 'utf8'), /Anchor corrected/);
  assert.match(readFileSync(join(dir, after.rel), 'utf8'), /does not exist/, 'the reason travels with the entry');
  drop(dir);
});

test('the entry is served at the corrected coordinate afterwards', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  reanchor(dir, first.id, { was: 'Mutations.deleteOrganizationContact', now: 'Mutations.deleteContact', reason: 'wrong name' });

  const served = ask(dir, 'What does Mutations.deleteContact remove?', { limit: 3 }).results.map((x) => x.id);
  assert.ok(served.includes(first.id));
  drop(dir);
});

// The one real hazard. Identity is (normalized anchors, scope), so moving an address can make an
// entry collide with one that was already there -- the duplicate the door exists to refuse.
test('a correction that would duplicate an existing entry is refused, and names it', () => {
  const dir = makeBase();
  const mine = capture(dir, FACT);
  const theirs = capture(dir, {
    ...FACT,
    subject: 'a-different-fact-about-the-same-two-places',
    anchors: ['Mutations.deleteContact', 'GET /company/members'],
  });

  assert.throws(
    () => reanchor(dir, mine.id, { was: 'Mutations.deleteOrganizationContact', now: 'Mutations.deleteContact', reason: 'wrong name' }),
    (e) => e instanceof CaptureRefused && new RegExp(theirs.id).test(e.message),
  );
  assert.deepEqual(
    loadEntry(dir, mine.id).data.anchors.map((a) => a.coordinate),
    ['Mutations.deleteOrganizationContact', 'GET /company/members'],
    'a refused correction changes nothing',
  );
  drop(dir);
});

test('a reason is required, because a moved coordinate with none reads as a typo', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  assert.throws(
    () => reanchor(dir, first.id, { was: 'Mutations.deleteOrganizationContact', now: 'Mutations.deleteContact' }),
    /--reason is required/,
  );
  drop(dir);
});

test('an anchor the entry does not carry is refused, and the message lists what it does', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  assert.throws(
    () => reanchor(dir, first.id, { was: 'Query.somethingElse', now: 'Query.cart', reason: 'x' }),
    /is not anchored on .* It carries: Mutations\.deleteOrganizationContact, GET \/company\/members/,
  );
  drop(dir);
});

// Normalization is what decides whether two spellings are one place, so a "correction" inside one
// equivalence class is a no-op dressed as an edit.
test('a change that normalizes to the same coordinate is refused as doing nothing', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  assert.throws(
    () => reanchor(dir, first.id, { was: 'GET /company/members', now: 'GET /company/members/', reason: 'trailing slash' }),
    /nothing would change/,
  );
  drop(dir);
});

test('a retired entry is not corrected in place; the survivor is named instead', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  retire(dir, first.id, { reason: 'out of the way' });
  assert.throws(
    () => reanchor(dir, first.id, { was: 'Mutations.deleteOrganizationContact', now: 'Mutations.deleteContact', reason: 'x' }),
    /is retired/,
  );
  drop(dir);
});

test('the fingerprint moves with the anchor, which is why the clash check exists at all', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  const before = fingerprint(loadEntry(dir, first.id).data);
  reanchor(dir, first.id, { was: 'Mutations.deleteOrganizationContact', now: 'Mutations.deleteContact', reason: 'wrong name' });
  assert.notEqual(fingerprint(loadEntry(dir, first.id).data), before);
  drop(dir);
});
