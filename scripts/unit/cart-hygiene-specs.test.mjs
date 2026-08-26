import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CART_NAME, isShoppingCart, groupKey, planGroup, findExposed,
} from '../seed-data/carts/cart-hygiene-specs.mjs';

const cart = (o) => ({ customerId: 'C1', storeId: 'B2B-store', currency: 'USD', type: null, ...o });

test('isShoppingCart: only a genuinely null/undefined type competes', () => {
  assert.equal(isShoppingCart(cart({ type: null })), true);
  assert.equal(isShoppingCart(cart({ type: undefined })), true);
  // The null-vs-"" trap: the platform tests `x.Type == null`, so "" does NOT compete.
  assert.equal(isShoppingCart(cart({ type: '' })), false);
  assert.equal(isShoppingCart(cart({ type: 'Wishlist' })), false);
  assert.equal(isShoppingCart(cart({ type: 'SavedForLater' })), false);
  // Unvalidated types observed live must not be treated as shopping carts either.
  assert.equal(isShoppingCart(cart({ type: 'CreatedFromWishlist' })), false);
  assert.equal(isShoppingCart(cart({ type: 'cart' })), false);
});

test('groupKey separates the identity tuple the resolver keys on', () => {
  assert.notEqual(groupKey(cart({ currency: 'EUR' })), groupKey(cart({ currency: 'USD' })));
  assert.notEqual(groupKey(cart({ storeId: 'other' })), groupKey(cart()));
  assert.notEqual(groupKey(cart({ customerId: 'C2' })), groupKey(cart()));
});

test('a single shopping cart is never reported as exposed', () => {
  assert.deepEqual(findExposed([cart({ id: 'a', name: DEFAULT_CART_NAME })]), []);
});

test('discriminated carts never make an account exposed', () => {
  const carts = [
    cart({ id: 'a', name: DEFAULT_CART_NAME }),
    cart({ id: 'w', name: 'My list', type: 'Wishlist' }),
    cart({ id: 's', name: 'Saved for later', type: 'SavedForLater' }),
    cart({ id: 'e', name: 'legacy', type: '' }),
  ];
  assert.deepEqual(findExposed(carts), []);
});

test('the default-named cart is kept, the competitor is surplus', () => {
  const exposed = findExposed([
    cart({ id: 'other', name: 'AGENT-TEST-secondcart', modifiedDate: '2026-08-26T10:00:00Z' }),
    cart({ id: 'def', name: DEFAULT_CART_NAME, modifiedDate: '2026-01-01T00:00:00Z' }),
  ]);
  assert.equal(exposed.length, 1);
  // Kept despite being older: mutations resolve `default`, so keeping anything else strands the writes.
  assert.equal(exposed[0].keep.id, 'def');
  assert.equal(exposed[0].keptBecause, 'named-default');
  assert.deepEqual(exposed[0].surplus.map((c) => c.id), ['other']);
});

test('legacy duplicate defaults: keep the most recently touched one', () => {
  const exposed = findExposed([
    cart({ id: 'old', name: DEFAULT_CART_NAME, modifiedDate: '2025-09-17T00:00:00Z' }),
    cart({ id: 'new', name: DEFAULT_CART_NAME, modifiedDate: '2026-03-24T00:00:00Z' }),
  ]);
  assert.equal(exposed[0].keep.id, 'new');
  assert.deepEqual(exposed[0].surplus.map((c) => c.id), ['old']);
});

test('no default present: keep most recent, everything else is surplus', () => {
  const exposed = findExposed([
    cart({ id: 'a', name: 'Saved for later', modifiedDate: '2026-05-19T00:00:00Z' }),
    cart({ id: 'b', name: 'probe', modifiedDate: '2026-05-20T00:00:00Z' }),
  ]);
  assert.equal(exposed[0].keptBecause, 'most-recent');
  assert.equal(exposed[0].keep.id, 'b');
});

test('surplus carrying line items is flagged risky (never silently discarded)', () => {
  const exposed = findExposed([
    cart({ id: 'def', name: DEFAULT_CART_NAME }),
    cart({ id: 'full', name: 'probe', items: [{ id: 'li' }] }),
    cart({ id: 'empty', name: 'probe2', itemsCount: 0 }),
  ]);
  assert.deepEqual(exposed[0].risky.map((c) => c.id), ['full']);
});

test('carts in different tuples are not conflated', () => {
  const exposed = findExposed([
    cart({ id: 'a', name: DEFAULT_CART_NAME }),
    cart({ id: 'b', name: 'other', currency: 'EUR' }),
  ]);
  assert.deepEqual(exposed, []);
});

// --- fixture protection (derived from the alias registry, never hardcoded) ---
import { collectAliasRefs, isProtected } from '../seed-data/carts/cart-hygiene-specs.mjs';

test('collectAliasRefs flattens every string leaf of the alias registry', () => {
  const refs = collectAliasRefs(
    { SR_STATS_CART_ACME: { _inline: true, id: '', name: 'AGENT-TEST-SR-CART-ACME' } },
    { SR_STATS_CART_ACME: { id: '463c6a87-feb8-4856-bc57-129ffc80cb42' } },
  );
  assert.ok(refs.has('AGENT-TEST-SR-CART-ACME'));
  assert.ok(refs.has('463c6a87-feb8-4856-bc57-129ffc80cb42'));
  assert.ok(!refs.has(''), 'empty strings must not become a wildcard protector');
});

test('isProtected matches on runtime id OR business-key name', () => {
  const refs = collectAliasRefs({ A: { id: 'cart-guid-1', name: 'FIXTURE-CART' } });
  assert.equal(isProtected(cart({ id: 'cart-guid-1', name: 'default' }), refs), true);
  assert.equal(isProtected(cart({ id: 'other', name: 'FIXTURE-CART' }), refs), true);
  assert.equal(isProtected(cart({ id: 'other', name: 'default' }), refs), false);
  assert.equal(isProtected(cart({ id: 'x', name: 'y' }), new Set()), false);
});

test('a fixture-referenced surplus cart is guarded, not swept', () => {
  const refs = collectAliasRefs({ A: { name: 'AGENT-TEST-SR-CART-ACME' } });
  const exposed = findExposed([
    cart({ id: 'def', name: DEFAULT_CART_NAME }),
    cart({ id: 'fix', name: 'AGENT-TEST-SR-CART-ACME' }),
    cart({ id: 'junk', name: 'probe' }),
  ], { refs });
  assert.deepEqual(exposed[0].guarded.map((c) => c.id), ['fix']);
  // still reported as surplus so the exposure is visible; the runnable just refuses to delete it
  assert.ok(exposed[0].surplus.some((c) => c.id === 'fix'));
});

test('guarded is empty when no refs are supplied (back-compat)', () => {
  const exposed = findExposed([cart({ id: 'a', name: DEFAULT_CART_NAME }), cart({ id: 'b', name: 'x' })]);
  assert.deepEqual(exposed[0].guarded, []);
});
