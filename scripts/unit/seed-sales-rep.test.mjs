// Unit tests for the Sales-Rep credential self-heal (VCST-5406 SR drift fix) and the VCST-5367
// saved-layout fixture spec. Covers the pure/importable surface: the resetSecurityPassword DI helper
// (seed-common), the SALES_REP / SALES_REP_NOCUSTOMERS registry entries (user-roles), and
// sales-rep-layout-specs.mjs (disposable-layout allowlist, preference-name model, served-org parser,
// CSV column contract). Pure — no env, no network (the api is a mock passed by DI). Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetSecurityPassword } from '../../scripts/lib/seed-common.mjs';
import { resolveRole, roleByKey } from '../../scripts/lib/user-roles.mjs';
import { roleUsers } from '../../scripts/lib/user-provision.mjs';
import {
  LAYOUT_REP, MIN_SERVED_ORGS_FOR_LAYOUT, DISPOSABLE_LAYOUT_REP_KEYS, isDisposableLayoutRep,
  LAYOUT_PREF_PREFIX, LAYOUT_SCOPES, layoutPreferenceName, isLayoutPreference,
  parseServedOrgs, SALES_REPS_COLUMNS, RUNTIME_ID_COLUMNS, GUID_RE, REP_EMAIL_RE,
} from '../../scripts/seed-data/sales-rep/sales-rep-layout-specs.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repRows = (() => {
  const lines = readFileSync(join(REPO, 'test-data', 'sales-rep', 'sales-reps.csv'), 'utf8')
    .replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    const out = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const head = split(lines[0]);
  return { head, rows: lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v]))) };
})();

function apiSpy(response = { succeeded: true, errors: [] }) {
  const calls = [];
  const api = async (method, path, body, opts) => { calls.push({ method, path, body, opts }); return response; };
  return { api, calls };
}

test('resetSecurityPassword POSTs the admin reset endpoint with a camelCase body and returns true', async () => {
  const { api, calls } = apiSpy();
  const ok = await resetSecurityPassword(api, 'agent-test-sr-primary@example.com', 'S3cret!!');
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.method, 'POST');
  assert.equal(c.path, '/api/platform/security/users/agent-test-sr-primary%40example.com/resetpassword');
  assert.equal(c.body.newPassword, 'S3cret!!');
  assert.equal(c.body.forcePasswordChangeOnNextSignIn, false, 'never forces a password change on next sign-in (runner logs in headless)');
  assert.deepEqual(c.opts, { expectStatus: [200] });
});

test('resetSecurityPassword reads success from the SecurityResult body (200 + succeeded:false → false, no throw)', async () => {
  const { api } = apiSpy({ succeeded: false, errors: [{ description: 'Password too weak' }] });
  const ok = await resetSecurityPassword(api, 'x@example.com', 'weak', { silent: true });
  assert.equal(ok, false, 'a 200 with succeeded:false is a failure, not a pass');
});

test('resetSecurityPassword is a no-op guard when userName or password is missing', async () => {
  const { api, calls } = apiSpy();
  assert.equal(await resetSecurityPassword(api, '', 'p'), false);
  assert.equal(await resetSecurityPassword(api, 'x@example.com', ''), false);
  assert.equal(calls.length, 0, 'never calls the API without both a userName and a password');
});

test('SALES_REP and SALES_REP_NOCUSTOMERS are org-kind roles keyed to TEST_USER_PASSWORD', () => {
  for (const key of ['SALES_REP', 'SALES_REP_NOCUSTOMERS']) {
    const def = roleByKey(key);
    assert.equal(def.passwordVar, 'TEST_USER_PASSWORD', `${key} resolves its secret from TEST_USER_PASSWORD`);
    assert.equal(def.kind, 'org', `${key} is an org account (created by seed-sales-rep, not the generic user seeders)`);
    assert.equal(def.required, false, `${key} is optional (module deployed only on QA envs)`);
  }
  const primary = resolveRole(roleByKey('SALES_REP'), { SALES_REP_EMAIL: 'p@ex.com', TEST_USER_PASSWORD: 'pw' });
  assert.equal(primary.email, 'p@ex.com');
  assert.equal(primary.password, 'pw');
  const nocust = resolveRole(roleByKey('SALES_REP_NOCUSTOMERS'), { SALES_REP_NOCUSTOMERS_EMAIL: 'n@ex.com', TEST_USER_PASSWORD: 'pw' });
  assert.equal(nocust.email, 'n@ex.com');
  assert.equal(nocust.password, 'pw');
});

test('the SR org-roles are NOT provisioned by the generic personal-user seeder (kind org is filtered out)', () => {
  const emails = roleUsers().map((u) => u.email.toLowerCase());
  assert.ok(!emails.includes('agent-test-sr-primary@example.com'), 'SR primary is not a personal customer role');
  assert.ok(!emails.includes('agent-test-sr-nocustomers@example.com'), 'SR nocustomers is not a personal customer role');
});

// ── VCST-5367 saved-layout fixture (sales-rep-layout-specs.mjs) ───────────────

test('the disposable-layout allowlist contains ONLY SR_REP_LAYOUT — never a shared rep', () => {
  assert.deepEqual(DISPOSABLE_LAYOUT_REP_KEYS, ['SR_REP_LAYOUT']);
  assert.equal(isDisposableLayoutRep('SR_REP_LAYOUT'), true);
  for (const shared of ['SR_REP_PRIMARY', 'SR_REP_ACME2', 'SR_REP_LOCKED', 'SR_REP_BLOCKED',
    'SR_REP_EXCLUSIVE_TECHFLOW', 'SR_REP_NOCUSTOMERS', 'SR_REP_PAGING', 'SR_REP_SECOND_STORE']) {
    assert.equal(isDisposableLayoutRep(shared), false,
      `${shared} must not be wiped — SR_REP_PRIMARY's never-saved (null) layout baseline backs ~40 cases`);
  }
  assert.equal(isDisposableLayoutRep(''), false);
  assert.equal(isDisposableLayoutRep(undefined), false);
  assert.equal(isDisposableLayoutRep(' SR_REP_LAYOUT '), true, 'tolerates CSV whitespace');
});

test('layoutPreferenceName builds SalesRepLayout.{scope}[.{storeId}]', () => {
  assert.equal(layoutPreferenceName('dashboard'), 'SalesRepLayout.dashboard');
  assert.equal(layoutPreferenceName('customerProfile', 'B2B-store'), 'SalesRepLayout.customerProfile.B2B-store');
  assert.equal(LAYOUT_PREF_PREFIX, 'SalesRepLayout');
  assert.deepEqual(LAYOUT_SCOPES, ['dashboard', 'customerProfile']);
});

test('isLayoutPreference sweeps every layout key shape and nothing else', () => {
  for (const scope of LAYOUT_SCOPES) {
    assert.equal(isLayoutPreference(layoutPreferenceName(scope)), true);
    assert.equal(isLayoutPreference(layoutPreferenceName(scope, 'B2B-store')), true);
  }
  // a future scope / suffix still gets swept (prefix match, not an exact-key list)
  assert.equal(isLayoutPreference('SalesRepLayout.someNewScope.Electronics'), true);
  assert.equal(isLayoutPreference('SalesRepLayout'), true);
  // unrelated preferences must survive teardown
  for (const foreign of ['SalesRepLayoutOther', 'Layout.dashboard', 'PersistedGridState', '', null]) {
    assert.equal(isLayoutPreference(foreign), false, `must not match ${JSON.stringify(foreign)}`);
  }
});

test('parseServedOrgs splits org keys and the PAGING:N form', () => {
  assert.deepEqual(parseServedOrgs('ORG-001;ORG-002'), { orgKeys: ['ORG-001', 'ORG-002'], pagingCount: 0 });
  assert.deepEqual(parseServedOrgs(' ORG-001 ; ORG-002 ;'), { orgKeys: ['ORG-001', 'ORG-002'], pagingCount: 0 });
  assert.deepEqual(parseServedOrgs(''), { orgKeys: [], pagingCount: 0 }, 'SR_REP_NOCUSTOMERS serves nothing');
  assert.deepEqual(parseServedOrgs('PAGING:12'), { orgKeys: [], pagingCount: 12 });
  assert.deepEqual(parseServedOrgs('PAGING:'), { orgKeys: [], pagingCount: 12 }, 'defaults to 12');
});

test('SR_REP_LAYOUT is present in the committed CSV, GUID-free, and serves enough orgs', () => {
  assert.deepEqual(repRows.head, SALES_REPS_COLUMNS, 'CSV column contract');
  const row = repRows.rows.find((r) => r.rep_key === LAYOUT_REP.repKey);
  assert.ok(row, `${LAYOUT_REP.repKey} row exists`);
  assert.equal(row.email, LAYOUT_REP.email);
  assert.equal(row.store, LAYOUT_REP.store);
  assert.equal(row.seeded, 'true');
  assert.equal(row.is_locked, 'false');
  assert.equal(row.lock_membership_org, '');
  assert.ok(REP_EMAIL_RE.test(row.email), 'AGENT-TEST- sweep convention (agent-test-*@example.com)');
  assert.equal(row.full_name, `${row.first_name} ${row.last_name}`, 'the seeder looks the rep up BY full_name');
  const served = parseServedOrgs(row.served_orgs).orgKeys;
  assert.ok(new Set(served).size >= MIN_SERVED_ORGS_FOR_LAYOUT,
    'customerProfile scope needs a customer to open AND the scope-wide case needs a second one');
  assert.deepEqual(served, LAYOUT_REP.servedOrgKeys);
  for (const col of RUNTIME_ID_COLUMNS) assert.equal(row[col], '', `${col} stays empty — runtime GUIDs live in aliases.<env>.json`);
});

test('no committed rep row carries a runtime platform GUID or a password literal', () => {
  for (const row of repRows.rows) {
    for (const [col, val] of Object.entries(row)) {
      assert.ok(!GUID_RE.test(String(val || '').trim()), `${row.rep_key}.${col} must not be a runtime GUID`);
      assert.ok(!/\bPassword\d/i.test(String(val || '')), `${row.rep_key}.${col} must not carry a password literal`);
    }
  }
  assert.ok(!repRows.head.some((h) => /password|secret|token/i.test(h)), 'no credential column');
});

test('SR_REP_LAYOUT is registered as a CSV-backed @td alias with id -> contact_id', () => {
  const aliases = JSON.parse(readFileSync(join(REPO, 'test-data', 'aliases.json'), 'utf8'));
  const def = aliases[LAYOUT_REP.aliasName];
  assert.ok(def, `${LAYOUT_REP.aliasName} registered in test-data/aliases.json`);
  assert.equal(def.file, 'sales-rep/sales-reps');
  assert.deepEqual(def.filter, { rep_key: LAYOUT_REP.repKey });
  assert.equal(def.fields.id, 'contact_id');
  assert.equal(def.fields.user_id, 'user_id');
  assert.equal(def.fields.email, 'email');
  for (const [k, v] of Object.entries(def)) {
    if (typeof v === 'string') assert.ok(!GUID_RE.test(v.trim()), `${LAYOUT_REP.aliasName}.${k} must not pin a GUID in the committed base (DV-021)`);
  }
});
