// Coordinate matching for the arrival hook. Every case below is one the measurement got wrong
// first: the numbers said "2 hits in 319 calls" three times over, for three different reasons, and
// each time the bug was in here rather than in the idea.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrivalsFor, textOf } from '../src/arrive.mjs';

const index = new Map([
  ['/company/members', [{ id: 'KB-AAAAAAA1', subject: 'storefront org-role gating', plane: 'experiential' }]],
  ['POST /api/members/search', [{ id: 'KB-BBBBBBB2', subject: 'rest-api-members-search', plane: 'derived-first' }]],
  ['mutations.lockorganizationcontact', [{ id: 'KB-CCCCCCC3', subject: 'gql-mutations-lockorganizationcontact', plane: 'derived-first' }]],
  ['organization', [{ id: 'KB-DDDDDDD4', subject: 'gql-type-organization', plane: 'derived-first' }]],
  ['/api/members', [{ id: 'KB-EEEEEEE5', subject: 'rest-api-members', plane: 'derived-first' }]],
]);

// The first measurement said 2 hits in 319 calls. Nine of the misses were this: `/company/members`
// preceded by the `m` of `.com`, rejected by a word-boundary rule that had no business applying to
// a coordinate that begins with a slash.
test('a path coordinate matches inside a URL, whatever precedes it', () => {
  const hits = arrivalsFor('https://storefront.example.com/company/members', index);
  assert.deepEqual(hits.map((h) => h.id), ['KB-AAAAAAA1']);
});

// The second reason: `normalizeAnchor` lowercases a dotted coordinate and leaves a route alone, so
// the index holds `POST /api/members/search` with its verb in caps beside lowercased type names.
test('a route coordinate matches regardless of the case the index kept it in', () => {
  const hits = arrivalsFor('curl -X POST https://host/api/members/search -d "{}"', index);
  assert.ok(hits.some((h) => h.id === 'KB-BBBBBBB2'));
});

// The reason the first, cruder probe over-reported: 19 of run 03's calls "matched" `organization`
// because the URLs carried an `organizationId` query parameter.
test('a bare word does not fire on a longer identifier that contains it', () => {
  const hits = arrivalsFor('https://host/xapi?organizationId=96f109a7', index);
  assert.deepEqual(hits.map((h) => h.id), [], 'organizationId is not the Organization type');
});

test('a bare word does not fire on its own at all — only structured coordinates trigger', () => {
  const hits = arrivalsFor('the organization has five contacts', index);
  assert.deepEqual(hits.map((h) => h.id), [],
    'a single common word names too much; it takes a path, a dot or a verb to be a coordinate');
});

test('the more specific coordinate is offered first', () => {
  const hits = arrivalsFor('POST /api/members/search', index);
  assert.equal(hits[0].id, 'KB-BBBBBBB2', '`POST /api/members/search` says more than `/api/members`');
  assert.equal(hits[1].id, 'KB-EEEEEEE5');
});

test('a dotted coordinate matches a GraphQL document body', () => {
  const hits = arrivalsFor('mutation { lockOrganizationContact(command: $c) { id } } Mutations.lockOrganizationContact', index);
  assert.ok(hits.map((h) => h.id).includes('KB-CCCCCCC3'));
});

test('nothing in the text means nothing offered, silently', () => {
  assert.deepEqual(arrivalsFor('ls -la', index), []);
  assert.deepEqual(arrivalsFor('', index), []);
  assert.deepEqual(arrivalsFor(null, index), []);
});

// Which field of a tool call holds the coordinate differs per tool, and a new browser or HTTP tool
// would otherwise need this module edited before it worked -- silently returning nothing meanwhile.
test('every string in a tool input is searched, however deeply it is nested', () => {
  const input = { params: { requests: [{ headers: { referer: 'https://host/company/members' } }] } };
  assert.ok(textOf(input).includes('/company/members'));
  assert.deepEqual(arrivalsFor(textOf(input), index).map((h) => h.id), ['KB-AAAAAAA1']);
});

test('an entry anchored on two matching coordinates is still offered once', () => {
  const twice = new Map([
    ['/company/members', [{ id: 'KB-AAAAAAA1', subject: 's', plane: 'experiential' }]],
    ['/company/members/roles', [{ id: 'KB-AAAAAAA1', subject: 's', plane: 'experiential' }]],
  ]);
  assert.equal(arrivalsFor('https://host/company/members/roles', twice).length, 1);
});

// Found by replaying 4,038 archived calls on 2026-09-16: the derived plane's root entry is anchored
// on `POST /api`, whose path is a prefix of 675 of 700 routes, so it "arrived" on every REST call
// any agent ever made and was the commonest arrival in eleven of twenty-two logs. A namespace is
// not a place.
test('a route that is the namespace of most of the index does not fire; a one-segment page still does', () => {
  const wide = new Map([
    ['POST /api', [{ id: 'KB-ROOT0000', subject: 'rest-api', plane: 'derived-first' }]],
    ['GET /api/members', [{ id: 'KB-MEMBERS1', subject: 'rest-api-members', plane: 'derived-first' }]],
    ['POST /api/members/search', [{ id: 'KB-MEMBERS2', subject: 'rest-api-members-search', plane: 'derived-first' }]],
    ['DELETE /api/carts', [{ id: 'KB-CARTS000', subject: 'rest-api-carts', plane: 'derived-first' }]],
    ['/cart', [{ id: 'KB-CARTPAGE', subject: 'the storefront cart page', plane: 'experiential' }]],
  ]);
  assert.deepEqual(arrivalsFor('curl https://host/api/platform/modules', wide).map((h) => h.id), [],
    'a call somewhere under /api is not an arrival at the REST contract as a whole');
  assert.deepEqual(arrivalsFor('curl -X DELETE https://host/api/carts/abc', wide).map((h) => h.id), ['KB-CARTS000'],
    'the specific route still fires, and the root does not ride along with it');
  assert.deepEqual(arrivalsFor('https://host/cart', wide).map((h) => h.id), ['KB-CARTPAGE'],
    '/cart is one segment too, but it prefixes nothing: it is a page, not a namespace');
});
