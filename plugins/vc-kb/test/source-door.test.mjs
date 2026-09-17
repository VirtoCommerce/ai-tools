// The source door, and the one thing it must never become: a confident pointer.
//
// A MISS that names the module a question sits in is more useful than a bare MISS. A MISS that
// names a module for a question about sourdough is the same failure as an invented answer, wearing
// a different hat -- so the gate below, and the test that holds it, matter more than the feature.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex } from '../src/index-build.mjs';
import { stringifyFrontmatter } from '../src/frontmatter.mjs';
import { ask } from '../src/resolve.mjs';
import { locate, sourceDoor, moduleRepos } from '../src/source-door.mjs';
import { DERIVED_ENTRIES } from '../src/planes.mjs';

function baseWith(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-door-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  const docs = entries.map(({ id, subject, body, module: mod, version, coordinate }) => {
    const path = `${DERIVED_ENTRIES}/${id}.md`;
    const question = `What is the contract of ${subject}?`;
    writeFileSync(join(dir, path), `${stringifyFrontmatter({
      id,
      subject,
      plane: 'derived-first',
      question,
      status: 'active',
      refutableBy: 'derivation',
      appliesTo: mod ? [{ module: mod, version }] : [],
      // A REAL coordinate, not the subject slug. Since the contract plane left the ranked list
      // its entries are reached by naming one, and `rest-api-taxes` is an internal slug that
      // carries no structure and that nobody types.
      anchors: [{ coordinate: coordinate ?? subject }],
      evidence: [{ method: 'extraction', deployment: 'vcptcore_stable', pin: '0000000000000000' }],
    })}\n\n${body}\n`);
    return { id, subject, question, text: body, path };
  });
  writeFileSync(join(dir, 'derived-index.json'), `${JSON.stringify(buildIndex(docs), null, 2)}\n`);
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

const ORDERS = {
  id: 'KB-D0000001',
  subject: 'rest-api-order-customerorders',
  coordinate: 'GET /api/order/customerOrders',
  module: 'VirtoCommerce.Orders',
  version: '3.1000.4',
  body: 'Order routes: search, get, update, delete customer orders, invoice, payments.',
};
const TAXES = {
  id: 'KB-D0000002',
  subject: 'rest-api-taxes',
  coordinate: 'GET /api/taxes',
  module: 'VirtoCommerce.Tax',
  version: '3.1000.0',
  body: 'Tax provider routes: evaluate, search, activate a tax provider for a store.',
};

// --- the repository map ---------------------------------------------------------------------------

// `VirtoCommerce.Orders` lives in `vc-module-order`, SINGULAR. A rule that lowercased the module id
// and prefixed it would produce `vc-module-orders` and a 404 no reader could explain, which is why
// the map is generated from the registry the pin already names rather than computed.
test('an irregular repository name comes from the map, not from a rule', () => {
  const l = locate('VirtoCommerce.Orders', '3.1000.4');
  assert.equal(l.repo, 'vc-module-order');
  assert.equal(l.tree, 'https://github.com/VirtoCommerce/vc-module-order/tree/3.1000.4');
  assert.match(l.raw, /raw\.githubusercontent\.com\/VirtoCommerce\/vc-module-order\/3\.1000\.4\/$/);
});

test('the platform is not a module and is still locatable', () => {
  assert.equal(locate('VirtoCommerce.Platform', '3.1007.26').repo, 'vc-platform');
});

test('a module the map does not know is named without a guessed URL', () => {
  const l = locate('Acme.CustomModule', '1.2.3');
  assert.equal(l.module, 'Acme.CustomModule');
  assert.equal(l.version, '1.2.3', 'the installed version is still worth saying');
  assert.equal(l.repo, null);
  assert.equal(l.tree, null, 'a guessed repository is worse than no repository');
});

test('the map records where it came from, so the value can be re-derived rather than trusted', () => {
  const meta = moduleRepos()._meta;
  assert.ok(meta && meta.source.includes('vc-modules'), 'the registry URL travels with the data');
  assert.ok(meta.fetchedAt, 'and so does the date it was read');
});

// --- the gate -------------------------------------------------------------------------------------

test('a question with no exact content match gets no module pointer', () => {
  const dir = baseWith([ORDERS, TAXES]);
  const r = ask(dir, 'how do I bake sourdough bread', { limit: 3 });
  assert.equal(r.miss, true);
  assert.deepEqual(r.source, [], 'fuzzy near-misses are not evidence that a question is about a module');
  drop(dir);
});

test('a MISS on a question that IS about the contract names the module and the installed version', () => {
  const dir = baseWith([ORDERS, TAXES]);
  const r = ask(dir, 'how is tax calculated on customer orders in this deployment', { limit: 3 });
  assert.equal(r.miss, true, 'the floor still refuses to serve an entry that is not an answer');
  const named = r.source.map((d) => `${d.module}@${d.version}`);
  assert.ok(named.includes('VirtoCommerce.Tax@3.1000.0'), `expected the tax module, got ${named.join(', ')}`);
  assert.ok(r.source.every((d) => d.via && d.via.id), 'each pointer says which entry named it');
  drop(dir);
});

test('the version is the one the deployment reports, never a branch', () => {
  const dir = baseWith([ORDERS]);
  const r = ask(dir, 'how are customer orders recalculated', { limit: 3 });
  for (const d of r.source) {
    assert.doesNotMatch(d.tree ?? '', /\/(dev|master|main)$/,
      'two of three arms in round two read `dev`; the whole point of this door is the installed tag');
  }
  drop(dir);
});

test('a HIT carries no door, because the base answered', () => {
  const dir = baseWith([ORDERS, TAXES]);
  // NAMED, not searched. The contract plane left the ranked list on 2026-09-16 and its entries are
  // reached by naming a coordinate. This asked `rest-api-taxes` until then — an internal subject
  // slug, carrying no structure, that nobody would type at a base. What the test is about, that a
  // door is a property of a MISS and not a decoration on an answer, is unchanged.
  const r = ask(dir, 'GET /api/taxes', { limit: 3 });
  assert.equal(r.miss, false);
  assert.equal(r.source, undefined, 'a door is what a MISS says, not a decoration on an answer');
  drop(dir);
});

test('an entry with no module contributes no pointer at all', () => {
  const dir = baseWith([{ id: 'KB-D0000003', subject: 'gql-type-carttotaltype', body: 'CartTotalType: subTotal, total, discountTotal, taxTotal on the cart.' }]);
  const r = ask(dir, 'how is the cart total recalculated by the pricing service', { limit: 3 });
  assert.equal(r.miss, true, 'two matching terms of five is below the floor');
  assert.deepEqual(r.source, [], '471 of 590 derived entries are GraphQL types and carry no module; they say nothing here');
  drop(dir);
});

test('sourceDoor is bounded and refuses an empty candidate list', () => {
  const dir = baseWith([ORDERS]);
  assert.deepEqual(sourceDoor(dir, []), []);
  assert.deepEqual(sourceDoor(dir, [{ evidence: 0, path: `${DERIVED_ENTRIES}/KB-D0000001.md` }]), []);
  assert.equal(sourceDoor(dir, [{ evidence: 2, path: `${DERIVED_ENTRIES}/KB-D0000001.md` }]).length, 1);
  drop(dir);
});
