// Sections for the catalog — the structure that lets a list stay read as it grows.
//
// The catalog is handed to an agent whole. What fails as it grows is the reading, not the context
// window: a menu of 120 dishes is unreadable on any size of paper and fine in eight sections.
//
// These tests hold the three decisions that make sections worth having rather than decorative:
// priority runs narrow to broad, the claim outranks the anchors, and the order inside a section is
// evidence rather than a hash.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { topicsOf, fileUnder, sectioned, UNFILED, TOPICS } from '../src/topics.mjs';

test('priority runs narrow to broad, so a discount fact is not an order fact', () => {
  // Measured on the live corpus: filing `orders` first swallowed 26 of 78 entries, because almost
  // every promotion and payment fact mentions an order and almost no order fact mentions a
  // promotion. Reordering moved `orders & shipments` from 26 to 14.
  const { section } = fileUnder({
    subject: 'only the largest cart-subtotal promotion applies, whatever isExclusive says',
    question: 'why did only one promotion apply on this order',
  });
  assert.equal(section, 'promotions & discounts');
});

test('what the entry claims to be about outranks where it points', () => {
  // KB-358A70CB, filed under members & accounts until 2026-09-16 because its anchor is
  // `/account/orders/{id}` — and a URL segment spelled `account` is not a claim about accounts.
  const { section } = fileUnder({
    subject: 'storefront order page projection of the shipment',
    question: 'why does the storefront order page show no shipment',
    anchors: [{ coordinate: '/account/orders/{id}' }],
  });
  assert.equal(section, 'orders & shipments');
});

test('anchors still place an entry whose claim places it nowhere', () => {
  // "the amount a payment is for is not the payment's total" never says order; its anchors do.
  const { section } = fileUnder({
    subject: 'a value that is not what it looks like',
    question: 'why do two numbers disagree',
    anchors: [{ coordinate: 'GET /api/order/customerOrders/{id}' }],
  });
  assert.equal(section, 'orders & shipments');
});

test('a fact the rule cannot place is admitted, not guessed at', () => {
  const { section } = fileUnder({ subject: 'something about nothing in particular', question: 'eh' });
  assert.equal(section, UNFILED,
    'one of the 78 is genuinely unfiled; inventing a topic to capture it would be fitting the rule to the data');
});

test('topics are tags, not folders — the others are reported, not dropped', () => {
  const hits = topicsOf('a coupon applied to a cart changes the order total');
  assert.ok(hits.length > 1, '27 of 78 entries touch more than one topic');
  const { section, also } = fileUnder({ subject: 'a coupon applied to a cart changes the order total' });
  assert.equal(section, hits[0]);
  assert.deepEqual(also, hits.slice(1), 'the rest are named beside the row rather than hidden');
});

// --- ordering inside a section ------------------------------------------------------------------
//
// Until 2026-09-16 the whole catalog was sorted by id, and an id is a hash. If attention falls off
// with position — which the next run measures — then the order was load-bearing and was random.

const entry = (id, subject, confirms, disputes = 0) => ({
  data: { id, subject, question: subject, anchors: [], evidence: [] },
  confirms, disputes,
});
const confirmations = (d) => (d.__confirms ?? 0);
const disputed = (d) => Boolean(d.__disputed);

test('a reader who stops early stops on the contested and the best-attested', () => {
  const mk = (id, c, dis) => ({ data: { id, subject: 'an order total disagrees', __confirms: c, __disputed: dis } });
  const rows = sectioned(
    [mk('KB-00000001', 4, false), mk('KB-00000002', 1, true), mk('KB-00000003', 2, false)],
    { confirmations, disputed },
  );
  const [, entries] = rows[0];
  assert.deepEqual(entries.map((r) => r.entry.data.id), ['KB-00000002', 'KB-00000001', 'KB-00000003'],
    'disputed first — a fact somebody disagrees with is worth reading before a calm one — then by parties');
});

test('unfiled comes last however big it gets', () => {
  const mk = (id, subject) => ({ data: { id, subject, __confirms: 0 } });
  const rows = sectioned(
    [mk('KB-A0000001', 'nothing recognisable'), mk('KB-A0000002', 'nothing recognisable either'),
      mk('KB-A0000003', 'nothing here'), mk('KB-B0000001', 'a promotion')],
    { confirmations, disputed },
  );
  assert.equal(rows.at(-1)[0], UNFILED, 'a reader should meet it as an admission, not as a section');
});

test('every topic has a name a person would use out loud', () => {
  for (const [name] of TOPICS) {
    assert.ok(/^[a-z &]+$/.test(name), `${name} reads like a slug, and a section heading is read by a person`);
  }
});
