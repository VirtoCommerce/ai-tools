// The two planes were built to stay apart and nothing connected them at all, so an observation
// could contradict a generated contract about the same coordinate and neither side would know.
// These cover the lookup that closes that, and the line it must not cross: it reports, and it
// never decides.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { stringifyFrontmatter } from '../src/frontmatter.mjs';
import { capture, retire } from '../src/capture.mjs';
import { coordinateIndex, derivedFacts } from '../src/coordinates.mjs';
import { DERIVED_ENTRIES, OWNED_ROOTS } from '../src/planes.mjs';

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-crossplane-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), JSON.stringify(buildIndex([]), null, 2) + '\n');
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

// A derived entry as the extractor writes one: generated from introspection, and on a signature
// the stronger source of the two.
function putDerived(dir, { id, subject, coordinates }) {
  const data = {
    id,
    subject,
    plane: 'derived-first',
    question: `What is the contract of ${subject}?`,
    status: 'active',
    refutableBy: 'derivation',
    anchors: coordinates.map((c) => ({ coordinate: c })),
    evidence: [{ method: 'extraction', deployment: 'vcptcore_stable', pin: '0000000000000000' }],
  };
  writeFileSync(join(dir, DERIVED_ENTRIES, `${id}.md`), `${stringifyFrontmatter(data)}\n\ncart(storeId: String!, currencyCode: String!): CartType\n`);
}

const OBSERVATION = {
  subject: 'cart-query-arguments-are-all-optional',
  question: 'What arguments does Query.cart take?',
  claim: 'Query.cart takes storeId, currencyCode, cultureName - all optional.',
  refutableBy: 'observation',
  anchors: ['Query.cart'],
  appliesTo: ['surface=graphql'],
  deployment: 'localhost',
  at: '2026-09-01T00:00:00Z',
};

test('capturing against a coordinate the derived plane already describes reports it back', () => {
  const dir = makeBase();
  putDerived(dir, { id: 'KB-0F2210AE', subject: 'gql-query-cart', coordinates: ['Query.cart'] });

  const r = capture(dir, OBSERVATION);
  assert.equal(r.derived.length, 1);
  assert.equal(r.derived[0].id, 'KB-0F2210AE');
  assert.equal(r.derived[0].coordinate, 'query.cart');
  drop(dir);
});

test('and the capture still goes through, because a contradicted contract is worth recording', () => {
  const dir = makeBase();
  putDerived(dir, { id: 'KB-0F2210AE', subject: 'gql-query-cart', coordinates: ['Query.cart'] });

  // The whole point of reporting rather than refusing: this observation disagrees with a generated
  // contract, and an observation that disagrees with a contract is often the most valuable thing in
  // the corpus. Whether it is that or a misreading is a judgement, and the tool does not make it.
  const r = capture(dir, OBSERVATION);
  assert.ok(r.id, 'the fact is recorded');
  assert.equal(r.derived.length, 1, 'and what it argues with is named');
  drop(dir);
});

test('a coordinate written another way still finds it, because normalization is the same rule', () => {
  const dir = makeBase();
  putDerived(dir, { id: 'KB-11111111', subject: 'rest-connect-token', coordinates: ['POST /connect/token'] });

  // Four spellings of one endpoint appeared in the demand rows. If the cross-plane lookup used a
  // different notion of sameness from the fingerprint, it would answer differently about the same
  // two records — so both go through normalizeAnchor.
  const r = capture(dir, {
    ...OBSERVATION,
    subject: 'token-endpoint-observed',
    anchors: ['POST {BACK_URL}/connect/token'],
    appliesTo: ['surface=platform-rest'],
  });
  assert.equal(r.derived.length, 1);
  assert.equal(r.derived[0].id, 'KB-11111111');
  drop(dir);
});

test('a coordinate nothing derived describes reports nothing, not a near miss', () => {
  const dir = makeBase();
  putDerived(dir, { id: 'KB-0F2210AE', subject: 'gql-query-cart', coordinates: ['Query.cart'] });
  const r = capture(dir, { ...OBSERVATION, subject: 'sales-rep-grid-filters', anchors: ['SalesRepCustomerOrders'] });
  assert.deepEqual(r.derived, [], 'wording similarity is not what this is; a coordinate matches or it does not');
  drop(dir);
});

test('a retired entry is not reported as what the base says, on either plane', () => {
  const dir = makeBase();
  const first = capture(dir, { ...OBSERVATION, subject: 'cart-observation-withdrawn' });
  retire(dir, first.id, { reason: 'withdrawn' });

  const index = coordinateIndex(dir);
  assert.equal(index.get('query.cart'), undefined, 'what nothing serves is not what the base says');
  drop(dir);
});

test('the index spans both planes, so drift detection has one place to ask', () => {
  const dir = makeBase();
  putDerived(dir, { id: 'KB-0F2210AE', subject: 'gql-query-cart', coordinates: ['Query.cart'] });
  capture(dir, OBSERVATION);

  const at = coordinateIndex(dir).get('query.cart');
  assert.equal(at.length, 2);
  assert.deepEqual(at.map((e) => e.plane).sort(), ['derived-first', 'experiential']);
  // `derivedFacts` narrows to one side on purpose: a collision with the experiential plane is the
  // fingerprint's job and answers with a refusal, and this is the other direction.
  assert.deepEqual(derivedFacts(dir, ['Query.cart']).map((e) => e.plane), ['derived-first']);
  drop(dir);
});

test('a malformed entry elsewhere in the corpus does not stop a writer recording an observation', () => {
  const dir = makeBase();
  writeFileSync(join(dir, DERIVED_ENTRIES, 'KB-BROKEN0.md'), '---\nnot: valid\n');
  const r = capture(dir, OBSERVATION);
  assert.ok(r.id, 'someone else’s bad file is the gate’s problem, not this writer’s');
  drop(dir);
});

test('the journal records what the writer was shown, not only that a capture happened', () => {
  // Reproducing the run-01 gap: the base argued with capture #12 (anchor Query.cart) and the log
  // kept no trace of it, so an observation recorded in the face of a contradicting contract read
  // exactly like one recorded where the base had nothing to say.
  const dir = makeBase();
  putDerived(dir, { id: 'KB-0F2210AE', subject: 'gql-query-cart', coordinates: ['Query.cart'] });
  const out = mkdtempSync(join(tmpdir(), 'kb-crossplane-out-'));
  spawnSync(process.execPath, [
    fileURLToPath(new URL('../vendor/agent-log/tool-log.mjs', import.meta.url)),
  ], { input: JSON.stringify({ session_id: 'xp', tool_name: 'Bash', tool_input: { command: 'git status' } }), env: { ...process.env, VC_MEASURE_OUT: out }, encoding: 'utf8' });

  const r = spawnSync(process.execPath, [
    fileURLToPath(new URL('../bin/kb.mjs', import.meta.url)),
    'capture', '--base', dir,
    '--subject', OBSERVATION.subject,
    '--question', OBSERVATION.question,
    '--claim', OBSERVATION.claim,
    '--refutable-by', 'observation',
    '--anchor', 'Query.cart', '--scope', 'surface=graphql',
    '--deployment', 'localhost',
  ], { env: { ...process.env, VC_MEASURE_OUT: out, KB_PHASE: 'verify' }, encoding: 'utf8' });
  assert.equal(r.status, 0);

  const f = readdirSync(out).find((x) => /^kb-log-.*\.jsonl$/.test(x));
  const line = JSON.parse(readFileSync(join(out, f), 'utf8').trim().split('\n')[0]);
  assert.equal(line.cross_plane.length, 1);
  assert.equal(line.cross_plane[0].id, 'KB-0F2210AE');
  assert.equal(line.cross_plane[0].coordinate, 'query.cart');
  drop(dir); drop(out);
});

// THE DERIVED PLANE IS READABLE BY ID, AND STILL NOT WRITABLE. Two halves of one rule.
//
// 590 of the base's ~900 entries live here, `kb capture` hands their ids out, and until 2026-09-18
// every one of them answered `is not in <base>. Ids in the catalog are exact; check the line you
// read it from.` -- blaming the reader for a citation the catalog had just printed. Widening
// `loadEntry` would have been the wrong fix: `confirm`/`dispute`/`retire`/`reanchor` write back to
// the file they are handed, and `kb extract` overwrites this one while `validate` byte-compares it.
test('a derived entry opens by id, and the writing verbs still refuse it — with the real reason', async () => {
  const { loadDerivedEntry, loadEntry, noWritableEntry, dispute, CaptureRefused } = await import('../src/capture.mjs');
  const dir = makeBase();
  putDerived(dir, { id: 'KB-0F2210AE', subject: 'gql-query-cart', coordinates: ['Query.cart'] });

  assert.equal(loadEntry(dir, 'KB-0F2210AE'), null, 'the writable stores do not hold it, and must not claim to');
  const e = loadDerivedEntry(dir, 'KB-0F2210AE');
  assert.equal(e.data.subject, 'gql-query-cart', 'but it is readable, which is what `kb show` needs');
  assert.equal(e.regenerated, true, 'and it says it is regenerated, so the caller can warn before a reader reaches for `kb dispute`');

  assert.throws(
    () => dispute(dir, 'KB-0F2210AE', { deployment: 'localhost', note: 'saw otherwise' }),
    (err) => err instanceof CaptureRefused && /DERIVED entry/.test(err.message) && /kb capture/.test(err.message),
    'the refusal names the plane and the verb that DOES keep the observation',
  );
  assert.match(noWritableEntry(dir, 'KB-DEADBEEF'), /^no captured entry/, 'an id that is genuinely absent still reads as absent');
  drop(dir);
});

// A WITHDRAWN ENTRY READ AS A LIVE ONE, because the only thing that said otherwise was the last
// line of the body. `kb show` printed `[experiential]` and `1 confirmation(s)` — both describing
// the entry as it stood BEFORE it was withdrawn — and an agent following one of the thousands of
// suite citations reads top-down and acts on the claim long before reaching the foot of the text.
test('kb show puts a retirement in the first line, not the last', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const KB = fileURLToPath(new URL('../bin/kb.mjs', import.meta.url));
  const { capture, retire } = await import('../src/capture.mjs');

  const dir = makeBase();
  const r = capture(dir, {
    subject: 'a claim that stopped holding', question: 'does it still hold?', claim: 'It did once.',
    refutableBy: 'observation', anchors: ['GET /api/x'], appliesTo: ['surface=rest'], deployment: 'vcptcore_stable',
  });
  retire(dir, r.id, { reason: 'the platform changed under it' });

  const out = execFileSync(process.execPath, [KB, 'show', r.id, '--base', dir], { encoding: 'utf8' });
  const firstTwo = out.split(String.fromCharCode(10)).slice(0, 2).join(String.fromCharCode(10));
  assert.match(firstTwo, /RETIRED/, 'a reader must not have to reach the body to learn this');
  assert.doesNotMatch(firstTwo, /confirmation\(s\)/, 'and must not be shown a trust level the entry no longer carries');
  assert.match(out, /the platform changed under it/, 'the reason travels with the refusal');
  drop(dir);
});
