// Unit tests for rep-only-org-specs.mjs pure logic (ORG_REP_ONLY fixture).
// Pure — no env, no network. Run: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REP_ONLY_ORG, buildOrgBody, orgAlreadyServed, appendServedOrg, removeServedOrg,
} from '../seed-data/sales-rep/rep-only-org-specs.mjs';

test('spec carries an AGENT-TEST- prefixed org name and the primary rep key', () => {
  assert.match(REP_ONLY_ORG.name, /^AGENT-TEST-/);
  assert.equal(REP_ONLY_ORG.repKey, 'SR_REP_PRIMARY');
  assert.equal(REP_ONLY_ORG.aliasName, 'ORG_REP_ONLY');
});

test('buildOrgBody produces an Organization member with a default shipping address and NO members', () => {
  const body = buildOrgBody();
  assert.equal(body.memberType, 'Organization');
  assert.equal(body.name, REP_ONLY_ORG.name);
  assert.equal(body.status, 'Active');
  assert.equal(body.addresses.length, 1);
  assert.equal(body.addresses[0].isDefault, true);
  assert.equal(body.addresses[0].countryCode, 'USA');
  // No buyer contacts — the org body never seeds contact members.
  assert.equal(body.contacts, undefined);
});

test('buildOrgBody does not alias the spec address (no shared mutation)', () => {
  const body = buildOrgBody();
  body.addresses[0].city = 'MUTATED';
  assert.equal(REP_ONLY_ORG.address.city, 'Seattle');
});

test('orgAlreadyServed detects membership by organizationId', () => {
  const orgs = [{ organizationId: 'a' }, { organizationId: 'b' }];
  assert.equal(orgAlreadyServed(orgs, 'b'), true);
  assert.equal(orgAlreadyServed(orgs, 'z'), false);
  assert.equal(orgAlreadyServed(undefined, 'x'), false);
});

test('appendServedOrg adds a new org without mutating the input and is idempotent', () => {
  const orgs = [{ organizationId: 'a', organizationName: 'A' }];
  const next = appendServedOrg(orgs, { id: 'b', name: 'B' });
  assert.equal(next.length, 2);
  assert.deepEqual(next[1], { organizationId: 'b', organizationName: 'B' });
  assert.equal(orgs.length, 1, 'input not mutated');
  // Idempotent — appending an already-served org is a no-op (no duplicate).
  assert.equal(appendServedOrg(next, { id: 'b', name: 'B' }).length, 2);
});

test('removeServedOrg strips exactly the target org (teardown symmetry)', () => {
  const orgs = [{ organizationId: 'a' }, { organizationId: 'b' }, { organizationId: 'c' }];
  const next = removeServedOrg(orgs, 'b');
  assert.deepEqual(next.map((o) => o.organizationId), ['a', 'c']);
  assert.equal(orgs.length, 3, 'input not mutated');
});
