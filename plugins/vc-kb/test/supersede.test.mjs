// Correcting yourself. Four runs could already do it -- capture the new fact, then retire the old
// one with --superseded-by -- and not one of them ever did. Run 04 wrote a causal clause at 17:52,
// learned at 18:01 that it was wrong, wrote the correct entry, and left the first one served for a
// day. Two verbs in the right order while the work is still open, and the verb that comes to mind,
// `dispute`, is written for contradicting SOMEONE ELSE.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { capture, supersede, retire, loadEntry, CaptureRefused } from '../src/capture.mjs';
import { experientialNeighbours } from '../src/coordinates.mjs';
import { ask } from '../src/resolve.mjs';
import { DERIVED_ENTRIES } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-supersede-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), `${JSON.stringify(buildIndex([]), null, 2)}\n`);
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const FACT = {
  subject: 'members-roster-status-column',
  question: 'What values can the members roster status column show?',
  claim: 'Active and Blocked.',
  refutableBy: 'observation',
  anchors: ['GET /company/members'],
  appliesTo: ['surface=storefront-ui'],
  deployment: 'vcptcore_stable',
  at: '2026-09-11T17:52:00Z',
};
const BETTER = {
  ...FACT,
  subject: 'members-roster-status-column-has-three-values',
  claim: 'Active, Blocked and Invited.',
  reason: 'the column has a third value the first entry did not know about',
  at: '2026-09-11T18:01:00Z',
};

// The ordinary case, and the one that was impossible before: an entry replaced by a better one
// about exactly the same coordinates at exactly the same scope. Its fingerprint is its own
// replacement's, so the door refused it -- the single case supersede exists for.
test('an entry can be replaced by a better one on the same coordinates and scope', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);

  const second = supersede(dir, first.id, BETTER);
  assert.equal(second.superseded, first.id);
  assert.notEqual(second.id, first.id);

  const old = loadEntry(dir, first.id);
  assert.equal(old.data.status, 'retired');
  assert.equal(old.data.supersededBy, second.id);
  assert.match(readFileSync(join(dir, old.rel), 'utf8'), /third value/, 'the reason is in the body');
  drop(dir);
});

test('only the new entry is served afterwards', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  const second = supersede(dir, first.id, BETTER);

  const served = ask(dir, 'What values can the members roster status column show?', { limit: 5 })
    .results.map((r) => r.id);
  assert.ok(served.includes(second.id));
  assert.ok(!served.includes(first.id), 'a retired entry has left the index');
  drop(dir);
});

// The order is load-bearing: a capture can be refused, and retiring first would leave the base with
// the old fact withdrawn and nothing in its place.
test('a refused capture leaves the old entry untouched', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);

  assert.throws(
    () => supersede(dir, first.id, { ...BETTER, claim: '' }),
    CaptureRefused,
  );
  assert.equal(loadEntry(dir, first.id).data.status, 'active',
    'nothing was withdrawn on the strength of a write that never happened');
  drop(dir);
});

test('a reason is required, because a fact that vanishes without one looks like a mistake', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  const { reason, ...noReason } = BETTER;
  assert.throws(() => supersede(dir, first.id, noReason), /--reason is required/);
  assert.equal(loadEntry(dir, first.id).data.status, 'active');
  drop(dir);
});

test('superseding an already-retired entry names the survivor instead', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  const second = supersede(dir, first.id, BETTER);

  assert.throws(
    () => supersede(dir, first.id, { ...BETTER, subject: 'third-go', reason: 'again' }),
    new RegExp(second.id),
  );
  drop(dir);
});

// The exemption is exactly one id wide. A genuine collision with a THIRD entry must still refuse,
// or supersede would become a way to write past the gate.
test('the fingerprint gate still fires against an entry that is not the one being replaced', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);
  retire(dir, first.id, { reason: 'out of the way for this test' });
  const other = capture(dir, { ...FACT, subject: 'a-different-fact-same-coordinates' });
  const third = capture(dir, { ...FACT, subject: 'third', appliesTo: ['surface=admin-ui'] });

  assert.throws(
    () => supersede(dir, third.id, { ...BETTER, appliesTo: ['surface=storefront-ui'] }),
    new RegExp(other.id),
    'replacing `third` must not let a fact through that collides with `other`',
  );
  drop(dir);
});

// The warning that would have caught run 04's pair. Their questions were worded nothing alike, so
// the near-question check the door already had could not have fired; only the coordinate was shared.
test('entries already written about a coordinate are findable before the next write', () => {
  const dir = makeBase();
  const first = capture(dir, FACT);

  const near = experientialNeighbours(dir, ['GET /company/members']);
  assert.deepEqual(near.map((n) => n.id), [first.id]);
  assert.equal(near[0].coordinate, 'GET /company/members');

  assert.deepEqual(experientialNeighbours(dir, ['GET /company/members'], { exclude: first.id }), []);
  assert.deepEqual(experientialNeighbours(dir, ['Query.somethingElse']), []);
  drop(dir);
});
