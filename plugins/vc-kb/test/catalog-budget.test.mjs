// The catalog is meant to be handed to an agent whole, so how big it may get is a design property.
//
// The redesign replaces retrieval over the written planes with the catalog in the prompt: 78 active
// entries, 13.8 KB, ~3,400 tokens, 1.7% of a 200k window. Capacity is not the constraint and will
// not be — there is room for a thousand rows inside a tenth of that window. What fails first is the
// READING: a list of 78 one-line claims is read, a list of 500 is skimmed, and a skimmed list is
// retrieval again, performed by the reader over rows sorted by a hash.
//
// So the threshold is a guess, and these tests hold it to being an HONEST guess: it says so, it
// does not fail a corpus, and it fires before the problem is hopeless rather than after.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG_BUDGET, catalogBudgetNotice, approxTokens } from '../src/catalog-budget.mjs';

test('a catalog inside its budget produces nothing', () => {
  assert.equal(catalogBudgetNotice({ rows: 89, bytes: 13_796 }), null,
    'the 2026-09-16 corpus must not trip a threshold set at roughly double it');
});

test('either dimension alone trips it, because either alone breaks the reading', () => {
  const manyRows = catalogBudgetNotice({ rows: CATALOG_BUDGET.rows + 1, bytes: 1_000 });
  assert.match(manyRows, /rows against a budget/);
  // A format change can blow the byte budget without adding one entry — the current row spends 60
  // of its 151 bytes on a markdown link nothing in a prompt can click.
  const manyBytes = catalogBudgetNotice({ rows: 10, bytes: CATALOG_BUDGET.bytes + 1 });
  assert.match(manyBytes, /bytes .*against/);
});

test('the notice says the threshold is a guess, and what would replace it', () => {
  const n = catalogBudgetNotice({ rows: 500, bytes: 80_000 });
  assert.match(CATALOG_BUDGET.basis, /guess|not a measurement/,
    'a number nobody measured must say so where it is defined');
  assert.match(n, /guess|not a measurement/, 'and again where it is read');
  assert.match(n, /catalog position/, 'a guess with no way to be replaced is a guess forever');
  assert.match(n, /sorted by id|is a hash/,
    'if attention falls off with position then the order is load-bearing, and today it is a hash');
});

test('it is not about the context window, and the notice refuses to let that be the reading', () => {
  const n = catalogBudgetNotice({ rows: 500, bytes: 80_000 });
  assert.match(n, /not about the context window/i);
  // 80 KB is still only a fifth of a 200k-token window. The point of the budget is that the list
  // stopped being readable long before it stopped fitting.
  assert.ok(approxTokens(80_000) < 40_000);
});
