// TIER ONE OF EXECUTABLE REFUTATION: has the ground under a licensed claim moved?
//
// The second review asked for this after round four, and its argument does not rest on that run:
// an agent is told it may act on a `confirmed` entry without re-verifying, and nothing mechanical
// checks the entry is still true. During round four the stand moved a patch under the corpus and
// nothing noticed.
//
// The distinction these tests exist to hold: an anchor that NEVER resolved is a coverage gap, which
// `validate` already reports and which is not a finding. An anchor that resolved and stopped is rot.
// In one snapshot they are the same picture and they are opposite conclusions, which is why there
// is a baseline at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { refute, writeBaseline, readBaseline, licensedEntries } from '../src/refute.mjs';
import { capture, confirm } from '../src/capture.mjs';
import { buildIndex } from '../src/index-build.mjs';
import { asAnotherParty } from './parties.mjs';
import { normalizeAnchor } from '../src/anchors.mjs';

function makeBase(coordinates) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-refute-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, 'derived', 'entries'), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), JSON.stringify(buildIndex([]), null, 2) + '\n');
  writeContract(dir, coordinates);
  return dir;
}

function writeContract(dir, coordinates) {
  writeFileSync(join(dir, 'derived', 'entries', 'contract.md'), [
    '---',
    'id: KB-CONTRACT',
    'subject: rest-api-example',
    'plane: derived-first',
    'status: active',
    'anchors:',
    ...coordinates.map((c) => `  - coordinate: ${c}`),
    '---',
    '',
    'The contract.',
    '',
  ].join('\n'));
}

const CLAIM = {
  subject: 'a licensed claim about a coordinate',
  question: 'does the coordinate behave oddly',
  claim: 'It does.',
  refutableBy: 'observation',
  anchors: ['GET /api/example/thing'],
  appliesTo: ['surface=rest'],
  deployment: 'localhost',
  at: '2026-09-16T00:00:00Z',
};

// Only the licensed set is checked, because the licence to act without re-verifying is the whole
// reason the check exists.
function licensedClaim(dir) {
  const { id } = capture(dir, CLAIM);
  asAnotherParty(() => confirm(dir, id, { deployment: 'localhost', note: 'saw the same thing' }));
  return id;
}

test('only entries an agent may act on unverified are checked', () => {
  const dir = makeBase(['GET /api/example/thing']);
  capture(dir, { ...CLAIM, subject: 'an unconfirmed claim', anchors: ['GET /api/example/other'] });
  assert.equal(licensedEntries(dir).length, 0, 'one party is not a licence');

  licensedClaim(dir);
  assert.equal(licensedEntries(dir).length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('a coordinate that resolved and stops resolving is ROT', () => {
  const dir = makeBase(['GET /api/example/thing']);
  const id = licensedClaim(dir);

  writeBaseline(dir);
  assert.deepEqual(readBaseline(dir).entries[id], [normalizeAnchor('GET /api/example/thing')],
    'the baseline records what DID resolve, so a later loss is attributable');

  assert.equal(refute(dir).results[0].verdict, 'holds');

  // The platform renames the route. Nothing about the entry changed.
  writeContract(dir, ['GET /api/example/thingRenamed']);
  const after = refute(dir).results[0];
  assert.equal(after.verdict, 'ROTTED');
  assert.deepEqual(after.lost, [normalizeAnchor('GET /api/example/thing')]);
  rmSync(dir, { recursive: true, force: true });
});

test('a coordinate that never resolved is a coverage gap, not a finding', () => {
  // A storefront route this base has never extracted. `validate` already reports these and is right
  // to call them coverage; counting them as refutations would bury the real ones in noise.
  const dir = makeBase(['GET /api/example/thing']);
  capture(dir, { ...CLAIM, subject: 'a claim about an unextracted surface', anchors: ['/account/orders'] });
  const all = licensedEntries(dir);
  assert.equal(all.length, 0);

  const { id } = capture(dir, { ...CLAIM, subject: 'a second claim about that surface', anchors: ['/account/profile'] });
  asAnotherParty(() => confirm(dir, id, { deployment: 'localhost', note: 'saw it too' }));

  writeBaseline(dir);
  const r = refute(dir);
  const row = r.results.find((x) => x.id === id);
  assert.equal(row.verdict, 'unprojected');
  assert.equal(r.counts.ROTTED ?? 0, 0, 'a surface nobody extracts must never read as rot');
  rmSync(dir, { recursive: true, force: true });
});

test('with no baseline it refuses to judge rather than guessing', () => {
  const dir = makeBase(['GET /api/example/thing']);
  licensedClaim(dir);
  const r = refute(dir);
  assert.equal(r.baseline, null);
  assert.equal(r.results[0].verdict, 'unbaselined',
    'without a baseline, "never resolved" and "stopped resolving" are the same picture');
  rmSync(dir, { recursive: true, force: true });
});

test('the baseline records only what resolved, so fixing extraction never reads as rot', () => {
  // The entry anchors on two coordinates and the contract publishes one. If the baseline recorded
  // the miss as well, the day somebody extends the extractor to cover the second would look like
  // the first one rotting.
  const dir = makeBase(['GET /api/example/thing']);
  const { id } = capture(dir, { ...CLAIM, anchors: ['GET /api/example/thing', 'GET /api/example/missing'] });
  asAnotherParty(() => confirm(dir, id, { deployment: 'localhost', note: 'saw it' }));

  writeBaseline(dir);
  assert.deepEqual(readBaseline(dir).entries[id], [normalizeAnchor('GET /api/example/thing')]);

  writeContract(dir, ['GET /api/example/thing', 'GET /api/example/missing']);
  assert.equal(refute(dir).results[0].verdict, 'holds');
  rmSync(dir, { recursive: true, force: true });
});
