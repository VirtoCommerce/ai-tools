// Unit tests for scripts/seed-data/overlay-specs.mjs — the allowlist behind td:reconcile check [11]
// (overlay GUID liveness). The whole point of the allowlist is ZERO false positives: probing a
// non-member GUID with the member endpoint would manufacture phantom "stale overlay" failures, the
// exact trap the GOLDEN RULE in .claude/rules/test-data.md warns about. These tests pin that scope.
// Pure — no env, no network. Run: `node --test scripts/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMemberField, selectProbeTargets, GUID_RE } from '../seed-data/overlay-specs.mjs';

const G1 = '51c9bf4b-a86f-4c61-98fb-c3cabaa9992b';
const G2 = '105c2c4e-23be-4258-8691-568a0ff190be';

test('GUID_RE accepts both dashed and dashless platform ids', () => {
  assert.ok(GUID_RE.test(G1));
  assert.ok(GUID_RE.test('1eb2fa8ac6574541afdb525833dadb46'), 'VC also emits dashless 32-hex ids');
  assert.ok(!GUID_RE.test('AGENT-TEST-SRO-ACME-NEW'), 'a business key is not a GUID');
  assert.ok(!GUID_RE.test(''));
});

test('member-kind fields are probeable for any alias', () => {
  assert.equal(isMemberField('SR_REP_PRIMARY', 'contact_id'), true);
  assert.equal(isMemberField('LOYALTY_VIP_USER', 'memberId'), true);
});

test('bare `id` is probeable only for aliases known to hold a member', () => {
  assert.equal(isMemberField('SR_REP_PRIMARY', 'id'), true);
  assert.equal(isMemberField('SR_OWNER_ACME', 'id'), true);
  assert.equal(isMemberField('ORG_REP_ONLY', 'id'), true);
  assert.equal(isMemberField('WL_ELECTRONICS_PLATFORM_ID', 'id'), true, 'a WL ORG alias holds a member id');
  // Not members: a product/pricelist/config/BOPIS alias also uses a bare `id`.
  assert.equal(isMemberField('LOY_SKU_PTS_UNIT', 'id'), false);
  assert.equal(isMemberField('CFG_BIKE', 'id'), false);
});

test('security-ACCOUNT ids are deliberately NOT probed (no reliable by-GUID account lookup)', () => {
  // GET /api/platform/security/users/{guid} returns 200 + null, and the users search ignores `ids`
  // — both verified live 2026-07-29. Check [10] Auth drift covers accounts by authenticating.
  assert.equal(isMemberField('SR_REP_PRIMARY', 'user_id'), false);
  assert.equal(isMemberField('IMPERSONATE_TARGET', 'userId'), false);
  assert.equal(isMemberField('LOYALTY_VIP_USER', 'securityAccountId'), false);
  assert.equal(isMemberField('WL_USER_ELECTRONICS_PLATFORM_ID', 'id'), false, 'a WL USER alias holds an account id');
  assert.equal(isMemberField('ACME_BUYER', 'platform_id'), false, 'b2b users.csv platform_id is the ACCOUNT id');
});

test('`platform_id` is probeable only for ORG_* aliases (the field is overloaded)', () => {
  assert.equal(isMemberField('ORG_ACME', 'platform_id'), true);
  assert.equal(isMemberField('ORG_TECHFLOW', 'platform_id'), true);
  // Address ids also live in a platform_id field — probing them would be a false positive.
  assert.equal(isMemberField('TECHFLOW_ADDR_US_NEW_YORK', 'platform_id'), false);
});

test('non-entity fields and meta keys are never probed', () => {
  for (const f of ['password', 'email', 'sku', 'code', 'number', 'slug', 'url', 'token', 'fields', '_notes']) {
    assert.equal(isMemberField('SR_REP_PRIMARY', f), false, `${f} must not be probed`);
  }
  assert.equal(isMemberField('_meta', 'id'), false);
});

test('selectProbeTargets splits an overlay into probe vs skipped without dropping anything', () => {
  const overlay = {
    _meta: { env: 'vcst' },
    SR_REP_PRIMARY: { id: G1, user_id: G2 },              // id → probe, user_id → skipped (account)
    ORG_ACME: { platform_id: G2, name: 'AGENT-TEST-Org' }, // platform_id → probe, name not a GUID
    LOY_SKU_PTS_UNIT: { id: G1, pricelistId: G2 },        // both skipped (product / pricelist)
    NOT_AN_OBJECT: 'x',
  };
  const { probe, skipped } = selectProbeTargets(overlay);
  assert.deepEqual(probe.map((t) => `${t.alias}.${t.field}`).sort(), ['ORG_ACME.platform_id', 'SR_REP_PRIMARY.id']);
  assert.deepEqual(skipped.map((t) => `${t.alias}.${t.field}`).sort(),
    ['LOY_SKU_PTS_UNIT.id', 'LOY_SKU_PTS_UNIT.pricelistId', 'SR_REP_PRIMARY.user_id']);
  assert.equal(probe.length + skipped.length, 5, 'every GUID is accounted for — probed or explicitly skipped');
  assert.equal(probe[0].id.length, 36, 'the raw id is carried through for the probe');
});

test('selectProbeTargets is empty-safe', () => {
  assert.deepEqual(selectProbeTargets({}), { probe: [], skipped: [] });
  assert.deepEqual(selectProbeTargets(), { probe: [], skipped: [] });
});
