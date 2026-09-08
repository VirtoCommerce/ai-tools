/**
 * The catalog-wipe guard.
 *
 * `POST /api/catalog/listentries/delete` with an EMPTY `objectIds` deletes EVERY entry in
 * scope rather than none — the mechanism behind this project's bulk-product-deletion
 * incident. Until now the only protection was prose: a comment in seed-standard-products.mjs,
 * another in seed-configurable.mjs, and a line in the /qa-seed-data skill, with THIRTEEN call
 * sites each re-deriving the rule.
 *
 * The dangerous shape is not a typo but an ordinary lookup miss. Several callers pass
 * `objectIds: ids` or `objectIds: hits.map((h) => h.id)` straight from a search; when the
 * search matches nothing that array is `[]` and "delete my fixtures" silently becomes
 * "delete the catalog". Nothing about the request looks wrong, which is why an LLM reviewer
 * is the wrong instrument here and a total invariant is the right one.
 *
 * Every assertion below is about the guard REFUSING before any network call — so these run
 * with no environment, no auth and no server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LIST_ENTRY_TYPES, deleteListEntries } from '../lib/seed-common.mjs';

test('an EMPTY objectIds is refused — the incident case', async () => {
  await assert.rejects(
    () => deleteListEntries([], 'CatalogProduct'),
    /EMPTY objectIds/,
    'this is the call that wipes the catalog; it must never reach the transport',
  );
});

test('the refusal explains what to do instead, not just that it failed', async () => {
  // A guard that only says "no" gets worked around. This one names the correct action:
  // a lookup that found nothing means there is nothing to delete, so skip the call.
  await assert.rejects(() => deleteListEntries([], 'Category'), (e) => {
    assert.match(e.message, /deletes EVERY entry in scope/);
    assert.match(e.message, /skip the call/);
    return true;
  });
});

test('the real-world shape: a lookup that matched nothing', async () => {
  // Verbatim the pattern at seed-loyalty-missions.mjs:1470 and seed-compare.mjs:607.
  const hits = [];
  await assert.rejects(
    () => deleteListEntries(hits.map((h) => h.id), 'CatalogProduct'),
    /EMPTY objectIds/,
  );
});

test('an unset id is refused rather than sent as [undefined]', async () => {
  // `[undefined]` is not a narrow delete — it is an unknown-shaped request built from a
  // variable the caller believed was set. Refuse instead of guessing platform behaviour.
  await assert.rejects(() => deleteListEntries([undefined], 'CatalogProduct'), /not non-empty strings/);
  await assert.rejects(() => deleteListEntries(['ok', null], 'CatalogProduct'), /1 of 2/);
  await assert.rejects(() => deleteListEntries(['   '], 'CatalogProduct'), /not non-empty strings/);
});

test('this is the deliberate difference from idsParam: REFUSE, never filter', async () => {
  // `idsParam` drops falsy ids with .filter(Boolean) because a malformed query param is
  // harmless. Filtering here would turn a partly-bad list into a shorter valid delete, and
  // an all-bad list into the empty request that causes the wipe.
  await assert.rejects(() => deleteListEntries([null, undefined], 'CatalogProduct'), /not non-empty strings/);
});

test('a non-array is refused', async () => {
  await assert.rejects(() => deleteListEntries(undefined, 'CatalogProduct'), /must be an array/);
  await assert.rejects(() => deleteListEntries('prod-1', 'CatalogProduct'), /must be an array/);
});

test('objectType is a closed vocabulary', async () => {
  assert.deepEqual([...LIST_ENTRY_TYPES], ['CatalogProduct', 'Category']);
  await assert.rejects(() => deleteListEntries(['id-1'], 'Product'), /objectType must be one of/);
  await assert.rejects(() => deleteListEntries(['id-1'], undefined), /objectType must be one of/);
});

test('LIST_ENTRY_TYPES is frozen, so a caller cannot widen it at runtime', () => {
  assert.throws(() => { LIST_ENTRY_TYPES.push('Catalog'); });
});
