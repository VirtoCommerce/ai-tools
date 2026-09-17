import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stringifyFrontmatter, parseEntry } from '../src/frontmatter.mjs';
import { groupRest, SPLIT_AT } from '../src/group.mjs';
import { mintId } from '../src/canonical.mjs';
import { hash, stableStringify } from '../src/canonical.mjs';
import { validate } from '../src/validate.mjs';
import { DERIVED_ENTRIES, OWNED_ROOTS } from '../src/planes.mjs';
import { resolveBase } from '../src/base.mjs';

// THE ONE TEST HERE THAT NEEDS A REAL CORPUS asks what retrieval does across hundreds of entries,
// which no fixture can stand in for. It used to name one directory on one machine, so it failed on
// every other one -- reported as a broken tool rather than as a missing base. It now resolves the
// base the same way the door does and SKIPS when there is none, because "no corpus to measure
// against" and "retrieval regressed" are different results and a red test must only ever mean the
// second. This is read-only: `ask()` in resolve.mjs writes nothing; the demand loop is wired in
// bin/kb.mjs, not here.
const LIVE_BASE = resolveBase();
const noCorpus = LIVE_BASE ? false : 'no knowledge base resolved (set KB_BASE, ideally to a COPY)';

const coord = (verb, route, module = 'M') => ({
  coordinate: `${verb} ${route}`, verb, route, module, tag: null, operationId: `${module}_x`, op: {},
});

test('frontmatter round-trips the nested subset the lifecycle needs', () => {
  const fm = {
    id: 'KB-000001',
    subject: 'rest-api-payment',
    plane: 'derived-first',
    question: 'Which endpoints does this deployment serve under /api/payment, and what does each one require?',
    status: 'active',
    refutableBy: 'derivation',
    appliesTo: [{ module: 'VirtoCommerce.Payment', version: '3.1006.0' }],
    anchors: [
      { coordinate: 'POST /api/payment/search', operationId: 'Payment_Search', hash: 'abc123abc123' },
      { coordinate: 'GET /api/payment/{id}', hash: 'def456def456' },
    ],
    evidence: [{ method: 'extraction', deployment: 'localhost', pin: 'deadbeefdeadbeef' }],
  };
  const text = `${stringifyFrontmatter(fm)}\n\nbody text\n`;
  const { data, body } = parseEntry(text);
  assert.deepEqual(data, fm);
  assert.equal(body, '\nbody text\n');
});

test('frontmatter errors rather than half-parsing', () => {
  assert.throws(() => parseEntry('no frontmatter here'), /no frontmatter opener/);
  assert.throws(() => parseEntry('---\nid: KB-1\n  - orphan: 1\n---\nb'), /list item outside a list/);
  assert.throws(() => stringifyFrontmatter({ id: 'KB-1', costIfMissing: 'x' }), /unknown field/);
  assert.throws(
    () => stringifyFrontmatter({ id: 'KB-1', anchors: [{ nested: { a: 1 } }] }),
    /nested/,
  );
});

test('a question containing a colon survives the round trip', () => {
  const fm = { id: 'KB-000002', subject: 's', question: 'What is this: really?', status: 'active' };
  const { data } = parseEntry(`${stringifyFrontmatter(fm)}\n\nx`);
  assert.equal(data.question, 'What is this: really?');
});

test('grouping keys on the route prefix and deepens only above the threshold', () => {
  const small = groupRest([coord('GET', '/api/payment'), coord('POST', '/api/payment/search')]);
  assert.equal(small.length, 1);
  assert.equal(small[0].key, '/api/payment');

  const big = Array.from({ length: SPLIT_AT + 1 }, (_, i) => coord('GET', `/api/catalog/products/${i}`));
  const split = groupRest(big);
  assert.ok(split.length >= 1);
  assert.ok(split.every((g) => g.key.split('/').length === 4), 'oversized group deepened to three segments');
});

test('a prefix served by two modules stays one group, with both modules carried', () => {
  const g = groupRest([
    coord('GET', '/api/catalog/products', 'VirtoCommerce.Catalog'),
    coord('GET', '/api/catalog/products/prices/search', 'VirtoCommerce.Pricing'),
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].modules, ['VirtoCommerce.Catalog', 'VirtoCommerce.Pricing']);
});

test('the id is derived from the subject, so two writers converge instead of colliding', () => {
  // No counter, no shared state, no allocation order: the same subject yields the same id on any
  // machine. Two agents recording one fact land on ONE entry, which is the behaviour a knowledge
  // base needs -- a timestamp or a sequence would give them two entries for the same fact.
  assert.equal(mintId('rest-api-payment'), mintId('rest-api-payment'));
  assert.notEqual(mintId('rest-api-payment'), mintId('rest-api-shipping'));
  assert.match(mintId('rest-api-payment'), /^KB-[0-9A-F]{8}$/);
  assert.match(mintId('anything', 'KB-C'), /^KB-C-[0-9A-F]{8}$/);
  // and adding a subject that sorts first does not renumber anything
  const before = mintId('rest-api-payment');
  mintId('rest-api-aaa-new');
  assert.equal(mintId('rest-api-payment'), before);
});

test('the hash is stable under key order and moves on a contract change', () => {
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
  assert.notEqual(hash({ a: 1 }), hash({ a: 2 }));
  assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('the corpus gate is green on an empty corpus', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-empty-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  const r = validate(dir);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.entries, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('the namespace check is a parse, not a prefix compare', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-ns-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  // "KB-C-000001".startsWith("KB") is true; a prefix test would admit a client id here
  const fm = stringifyFrontmatter({
    id: mintId('s', 'KB-C'), subject: 's', plane: 'derived-first', question: 'q',
    status: 'active', refutableBy: 'derivation',
    anchors: [{ coordinate: 'x', hash: 'h' }], evidence: [{ method: 'extraction' }],
  });
  writeFileSync(join(dir, DERIVED_ENTRIES, 'KB-C-000001.md'), `${fm}\n\nbody\n`);
  const r = validate(dir);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /is not <KB>-<8 hex digits>/.test(p)), r.problems.join('; '));
  rmSync(dir, { recursive: true, force: true });
});

test('a question matching only function words is a MISS, not a confident irrelevant answer', { skip: noCorpus }, async () => {
  const { ask } = await import('../src/resolve.mjs');
  const base = LIVE_BASE;
  const off = ask(base, 'how do I bake sourdough bread');
  assert.equal(off.miss, true, 'an off-topic question must MISS');
  assert.equal(off.degraded, null, 'a coverage MISS is not a degraded MISS');

  // THE CONTROL QUESTION CHANGED ON 2026-09-16, and the reason is worth more than the assertion.
  // It used to read "which endpoint lists the payment methods a store has enabled" — a question
  // invented for this test, which no run has ever asked. Eleven entries mined out of the arm reports
  // that day put an experiential entry at its head: the one about an empty Tax providers widget,
  // which matches `store`, `enabled` and `provider` and answers a structurally identical question
  // about a different subject. That is the MISS drift measured in kb-missdrift-2026-09, arriving
  // here by way of the corpus getting bigger — the thing the whole page predicts.
  //
  // Measured before changing this: over the 88 questions runs really asked, those eleven entries
  // lead 5 and every one of the 5 is a question they answer. The displacement is confined to this
  // invented question. So the control moves to `OrderDiscountType fields`, which is row r2.3 of the
  // held-out set — a question a run really typed, whose answer is a contract table and therefore
  // belongs on the derived plane at `top` for a reason rather than by accident.
  const real = ask(base, 'OrderDiscountType fields');
  assert.equal(real.miss, false);
  assert.equal(real.results[0].trust.level, 'top');
});

test('a GraphQL fact is labelled at what can be known, and flagged when it cannot be shown to be a release fact', async () => {
  const { buildGraphqlEntry } = await import('../src/build.mjs');
  const field = { name: 'addItem', args: [], type: { kind: 'OBJECT', name: 'CartType' } };
  const group = { kind: 'graphql', key: 'Mutations.addItem', role: 'mutation', rootType: 'Mutations', field };
  const schema = { roots: { query: 'Query', mutation: 'Mutations', subscription: 'Subscriptions' }, types: new Map() };

  // On a release deployment there is nothing to warn about.
  const clean = buildGraphqlEntry(group, {
    deployment: 'ref', pin: 'p', schema, platformVersion: '3.1007.26', prerelease: [],
  });
  assert.equal(clean.frontmatter.appliesTo[0].platformVersion, '3.1007.26');
  assert.equal(clean.frontmatter.appliesTo[0].prereleaseContributorsPossible, undefined);
  assert.ok(!clean.body.includes('Not merged into the release line'));

  // Introspection publishes no field-to-module attribution, so a deployment running a PR build
  // could be contributing to the schema and it cannot be ruled out. Saying nothing would merge a
  // pre-release fact into the release line silently.
  const risky = buildGraphqlEntry(group, {
    deployment: 'qa', pin: 'p', schema, platformVersion: '3.1064.0',
    prerelease: [{ module: 'VirtoCommerce.ProfileExperienceApiModule', version: '3.1018.0-pr-145' }],
  });
  assert.equal(risky.frontmatter.appliesTo[0].prereleaseContributorsPossible, 1);
  assert.ok(risky.body.includes('Not merged into the release line'));
});
