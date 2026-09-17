// Two retrieval settings that three live runs paid for, pinned so a change cannot quietly undo
// them. Both come from defects agents hit doing real work, not from inspection:
//
//   * run 01 was served `gql-type-graphqlsettingstype` as the FIRST answer to a question about
//     cart discounts, on the strength of the word "GraphQL" -- the one content term that entry
//     matched at all, in a base whose derived plane is entirely GraphQL and REST.
//   * run 02 asked a question its own base answered, was given three type tables instead, and
//     found the entry by reading `kb stat` by hand. Its note: "Resolver ranking issue, not a
//     content gap."
//
// See measurements/kb-retrieval-2026-09/ for the 23-row measurement these two settings come from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex, SEARCH_OPTIONS, tokenize } from '../src/index-build.mjs';
import { stringifyFrontmatter } from '../src/frontmatter.mjs';
import { ask } from '../src/resolve.mjs';
import { DERIVED_ENTRIES, CAPTURED_DIR, CAPTURED_INDEX } from '../src/planes.mjs';

// A base holding exactly the entries a case needs.
//
// THE FIXTURES MOVED TO THE WRITTEN PLANE ON 2026-09-16, and the reason is that the defect they were
// built from can no longer happen. Both cases above are a CONTRACT table crowding out a written
// entry, and the contract plane left the ranked list that day — it is reached by naming a coordinate
// now, not by sharing words. So the specific crowding these tests were written against is prevented
// structurally, which is a stronger guarantee than the floor, and is pinned separately below.
//
// What is left for these tests to hold is the floor itself, which still governs written-against-
// written. Keeping them on the derived plane would have made three passing tests that exercise
// nothing: every fixture would return no results, and two of the three assert on which result leads.
function baseWith(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-retrieval-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  mkdirSync(join(dir, CAPTURED_DIR), { recursive: true });

  const docs = entries.map(({ id, subject, body }) => {
    const path = `${CAPTURED_DIR}/${id}.md`;
    const question = `What is the contract of ${subject}?`;
    const data = {
      id,
      subject,
      plane: 'experiential',
      question,
      status: 'active',
      refutableBy: 'observation',
      anchors: [{ coordinate: subject }],
      evidence: [{ method: 'extraction', deployment: 'vcptcore_stable', pin: '0000000000000000' }],
    };
    writeFileSync(join(dir, path), `${stringifyFrontmatter(data)}\n\n${body}\n`);
    return { id, subject, question, text: body, path };
  });

  // The contract index still has to EXIST: `openBase` reports a missing one as a DEGRADED base,
  // which is a different answer from a coverage miss and would mask every assertion below. It is
  // empty, because these cases are about the written plane now.
  writeFileSync(join(dir, 'derived-index.json'), `${JSON.stringify(buildIndex([]), null, 2)}\n`);
  writeFileSync(join(dir, CAPTURED_INDEX), `${JSON.stringify(buildIndex(docs), null, 2)}\n`);
  return dir;
}
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

test('an entry matching only the name of the medium is not an answer about the subject', () => {
  const dir = baseWith([
    // The shape that beat everything: `graphql` in a SHORT field makes it a rare term in this one
    // entry, and rare-term-in-short-field is the highest-scoring thing BM25 knows.
    { id: 'KB-11111111', subject: 'gql-type-graphqlsettingstype', body: 'GraphQL settings. keepAliveInterval, useSubscriptions.' },
    // Written out the way the real entry reads. The one-line version this fixture used to carry
    // said `discounts` and `discountTotal` and never the singular `discount`, so once the floor
    // asked for three exact content terms the fixture stopped clearing it either -- and a fixture
    // too thin to be served is not evidence about ranking.
    { id: 'KB-22222222', subject: 'gql-type-carttype', body: 'CartType carries discounts, discountTotal, items and currency. A cart-level discount applied to the cart shows here.' },
  ]);

  const r = ask(dir, 'how does the cart show an applied discount in GraphQL?', { limit: 3 });
  const served = r.results.map((x) => x.id);
  assert.ok(!served.includes('KB-11111111'),
    'an entry whose only content match is the word GraphQL must not be served in a GraphQL base');
  assert.deepEqual(served, ['KB-22222222']);
  drop(dir);
});

// The second property -- that breadth does not beat aboutness -- cannot honestly be pinned in a
// unit test. It is a statistical property of a 590-document corpus: BM25's term weights come from
// how rare a term is ACROSS the index, so on a two-document fixture the scores mean nothing and a
// passing assertion would be passing for the wrong reason. Building a fixture large enough to make
// it behave would be building a corpus until the test agreed with me.
//
// So the setting is pinned instead, and the behaviour is measured where it can be: the 23-row
// replay in measurements/kb-retrieval-2026-09/, against the real base, run by hand. This assertion
// catches a silent revert; it does not pretend to catch a regression.
test('the per-term floor stays at zero, because breadth is what this corpus is full of', () => {
  assert.equal(SEARCH_OPTIONS.bm25.d, 0,
    'BM25+ `d` pays a document for containing a term at all, and 303 of 590 derived entries are '
    + 'wide type tables, so that pays breadth. Changing it means re-running the 23-row replay.');
});

// The floor, raised from one term to three on 2026-09-12. The two assertions below are the two
// halves of the same rule: a long question demands real evidence, and a short one cannot be asked
// for evidence it does not contain.
test('a single content term is not evidence about a question that has eight', () => {
  const dir = baseWith([
    // One word in two forms -- `order`, `orders` -- is what put the Admin REST order table at the
    // head of run 03's question about xAPI order scope, where both blind graders called it the
    // wrong surface. It matches; it is not an answer.
    { id: 'KB-33333333', subject: 'rest-api-order-customerorders', body: 'Order and orders routes: search, get, update, delete customer orders.' },
    { id: 'KB-44444444', subject: 'gql-query-organizationorders', body: 'organizationOrders query returns the whole organization’s orders rather than only my own orders, scoped by the storefront user.' },
  ]);

  const served = ask(dir, 'how does the storefront decide whether an order query returns only my orders or the whole organization’s orders', { limit: 3 })
    .results.map((x) => x.id);
  assert.deepEqual(served, ['KB-44444444']);
  drop(dir);
});

test('a one-word question is still answered, because the floor cannot ask for what was not asked', () => {
  const dir = baseWith([
    { id: 'KB-55555555', subject: 'gql-type-inputadditemtype', body: 'InputAddItemType: productId, quantity, storeId, userId.' },
    { id: 'KB-66666666', subject: 'gql-type-carttype', body: 'CartType carries discounts and items.' },
  ]);

  const r = ask(dir, 'InputAddItemType', { limit: 3 });
  assert.equal(r.miss, false, 'a question made of one term asks for one term of evidence');
  assert.equal(r.results[0].id, 'KB-55555555');
  drop(dir);
});

test('a miss says how many content terms it wanted, not that nothing matched at all', () => {
  const dir = baseWith([
    { id: 'KB-77777777', subject: 'rest-api-carts', body: 'Cart routes: search, get, delete.' },
  ]);

  const r = ask(dir, 'how is a promotion reward rounded on the cart total', { limit: 3 });
  assert.equal(r.miss, true);
  assert.match(r.note, /3 content terms/,
    'an absence produced by the floor is a different fact from an absence of any match, and the '
    + 'reader has to be able to tell which one they are looking at');
  drop(dir);
});

// A typographic apostrophe splits, and the em dash does not. Both halves are load-bearing.
//
// r3.2 asks about "the whole organization's orders" with a curly U+2019, which was in no split
// class -- so it tokenized to one term matching nothing, while `gql-query-organizationorders`
// matches a bare `organization` exactly. That row lost its anchor, and six floor variants could not
// reach it because the term they were asked to credit was never produced.
//
// The em dash stays OUT: 1954 occurrences in the live corpus against four for the apostrophe, so
// splitting on it rewrites a byte-gated index for nothing.
test('typographic punctuation splits, except the em dash', () => {
  assert.deepEqual(tokenize('organization’s orders'), ['organization', 's', 'orders']);
  assert.deepEqual(tokenize('organization‘s'), ['organization', 's']);
  assert.deepEqual(tokenize('a “quoted” word'), ['a', 'quoted', 'word']);
  assert.deepEqual(tokenize('one–two'), ['one', 'two']);
  assert.deepEqual(tokenize('and…then'), ['and', 'then']);
  // the em dash is not a separator here, and a spaced one is dropped by processTerm instead
  assert.deepEqual(tokenize('one—two'), ['one—two']);
});

// Verified 2026-09-16 against a copy of the live base, while fixing the flow plane's MISS contract:
// this question already returns MISS, on the floor alone. The discount-row entry it was reported
// to return matches `tax` and `orders` and never `calculated`, and two of three is not the floor.
// Pinned so the floor cannot quietly drop to two and start serving it.
test('a tax question is not answered by an entry that mentions tax about something else', () => {
  const dir = baseWith([
    { id: 'KB-88888888', subject: 'discount-row-withtax-is-never-written', body: 'Is discountAmountWithTax on an order discount row safe to read instead of discountAmount? The discount row discountAmountWithTax is always 0 whatever the store tax configuration; orders on a store with an active 20 percent tax provider still read 0.' },
    { id: 'KB-99999999', subject: 'gql-type-ordershipmenttype', body: 'OrderShipmentType: price, priceWithTax, total, totalWithTax, tax details for orders.' },
  ]);
  const r = ask(dir, 'how is tax calculated on orders', { limit: 3 });
  assert.equal(r.miss, true);
  assert.match(r.note, /3 content terms/);
  drop(dir);
});
