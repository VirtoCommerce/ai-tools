// Unit tests for the quote-state fixtures + orders-specs.mjs quote logic (VCST-5482).
// Pure — no env, no network. Run: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUOTE_FIXTURES, quoteNumber, QUOTE_MARK,
  finalizeQuoteBody, applyCatalogItems, validateFixtureShape,
} from '../seed-data/orders/orders-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const loadFixture = (rel) => JSON.parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'));

test('quoteNumber builds a deterministic AGENT-TEST-QTE key', () => {
  assert.equal(quoteNumber('ACCEPTED'), `${QUOTE_MARK}-ACCEPTED`);
});

test('finalizeQuoteBody stamps the target status + submitter attribution', () => {
  const spec = QUOTE_FIXTURES.find((s) => s.key === 'ACCEPTED');
  const body = finalizeQuoteBody(spec, { number: quoteNumber('ACCEPTED'), status: 'PLACEHOLDER', items: [{ sku: 'X', quantity: 1 }] },
    { customerId: 'user-9', customerName: 'Org Buyer', organizationId: 'org-2' });
  assert.equal(body.status, spec.quoteStatus, 'status from the spec');
  assert.equal(body.customerId, 'user-9');
  assert.equal(body.organizationId, 'org-2');
});

test('applyCatalogItems overlays real products onto quoted line items', () => {
  const fixture = { items: [{ sku: 'PH', productId: 'p', name: 'ph', quantity: 10, listPrice: 49.99 }] };
  const out = applyCatalogItems(fixture, [{ id: 'real-1', sku: 'REAL-1', name: 'Real 1', catalogId: 'cat-1' }]);
  assert.equal(out.items[0].productId, 'real-1');
  assert.equal(out.items[0].sku, 'REAL-1');
  assert.equal(out.items[0].quantity, 10, 'quantity kept');
  assert.equal(out.items[0].listPrice, 49.99, 'listPrice kept');
});

test('every committed quote fixture passes validateFixtureShape (spec ↔ fixture in sync)', () => {
  for (const spec of QUOTE_FIXTURES) {
    const obj = loadFixture(spec.fixtureFile);
    const { ok, problems } = validateFixtureShape(spec, obj, 'quote');
    assert.ok(ok, `${spec.alias}: ${problems.join('; ')}`);
  }
});

test('QUOTE fixtures declare the adminPriced / buyerAccepted transition flags', () => {
  const adminResp = QUOTE_FIXTURES.find((s) => s.key === 'ADMIN-RESPONSE');
  const accepted = QUOTE_FIXTURES.find((s) => s.key === 'ACCEPTED');
  assert.equal(adminResp.adminPriced, true);
  assert.equal(adminResp.buyerAccepted, false);
  assert.equal(accepted.adminPriced, true);
  assert.equal(accepted.buyerAccepted, true);
});
