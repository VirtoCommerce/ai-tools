#!/usr/bin/env node
/**
 * seed-punchout.mjs — provision the VCST-5886 Punchout cXML fixtures (spec: punchout-specs.mjs).
 *
 * WHAT IT DOES
 *   - REGISTERS the 1r mapping AGENT-TEST-PO-100 ({{USER_EMAIL}}) — reads its ids, never creates,
 *     changes or deletes it (owned by /qa-test 1r, removed at run close-out).
 *   - FIND-OR-CREATES mapping AGENT-TEST-PO-200 for the {{MULTI_ORG_USER_EMAIL}} persona (contact in
 *     ≥2 orgs), after checking that persona can sign in (not passwordExpired, not locked, grant OK).
 *   - UPSERTS roles AGENT-TEST-Punchout-Reader (customer:access+read, punchout:read) and
 *     AGENT-TEST-Punchout-None (customer:access+read only) and their Manager accounts
 *     (isAdministrator=false, password {{DEFAULT_TEST_PASSWORD}}).
 *   - WRITES runtime ids + this env's deployed configuration facts to test-data/aliases.<env>.json.
 *
 * USAGE
 *   TEST_ENV=<env> node scripts/seed-data/punchout/seed-punchout.mjs [--dry-run] [--verbose]
 *   TEST_ENV=<env> node scripts/seed-data/punchout/seed-punchout.mjs --verify-only   (live checks, no writes)
 *   TEST_ENV=<env> node scripts/seed-data/punchout/seed-punchout.mjs --teardown
 *   A seed always ends with the live verify (permission boundary + session-free cXML probes).
 *
 * SAFETY: assertSafeTarget (ENV_RISK=production aborts). Teardown deletes only the OWNED mapping (by
 * id, teardownMappingTargets() excludes AGENT-TEST-PO-100), the two AGENT-TEST accounts (by name —
 * KB-FB8014EB) and the two AGENT-TEST roles, then asserts zero residue. No store, store setting or
 * app setting is ever written. Verify probes are chosen so NO PunchoutSession row is created.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import {
  assertSafeTarget, auth, api, log, verbose, verifyRemoved, writeEnvAliasOverride,
  DRY_RUN, TEARDOWN, STORE_ID, BACK_URL,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import {
  CONFIG_SPECS, DEPLOYED_CONFIGS, configOverlayFields, MAPPING_SPECS, PROTECTED_EXTERNAL_IDS,
  mappingBody, teardownMappingTargets, BACKOFFICE_SPECS, roleBody, accountBody,
  VERIFY_PROBES, buildSetupRequest, cxmlStatusCode,
} from './punchout-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const VERIFY_ONLY = process.argv.includes('--verify-only');
const MAPPINGS = '/api/punchout-user-mappings';
const failures = [];
const fail = (m) => { failures.push(m); log(`✗ ${m}`); };
const ok = (m) => log(`✓ ${m}`);

async function moduleInstalled() {
  try { await api('GET', `${MAPPINGS}/new`, null, { expectStatus: [200] }); return true; } catch (e) { verbose(e.message); return false; }
}

const searchMappings = (criteria) => api('POST', `${MAPPINGS}/search`, { take: 50, ...criteria }, { expectStatus: [200] });

async function getUser(userName) {
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(userName)}`, null, { expectStatus: [200, 404] });
  return u && u.id ? u : null;
}
async function findUserBySearch(email) {
  const s = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 10 }, { expectStatus: [200] });
  return (s?.users || s?.results || []).find((u) => (u.userName || '').toLowerCase() === email.toLowerCase()) || null;
}
async function getMember(id) {
  const m = await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 404] });
  return m && m.id === id ? m : null;
}

async function grant(fields) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', ...fields }),
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, token: j.access_token || null, error: j.error_description || j.error || null };
}

const notLocked = (u) => !u.lockoutEnd || new Date(u.lockoutEnd).getTime() <= Date.now();

// ── mappings ─────────────────────────────────────────────────────────────────────────────────

async function personaFor(spec) {
  const email = process.env[spec.personaEmailVar];
  if (!email) { fail(`${spec.alias}: {{${spec.personaEmailVar}}} is not set for TEST_ENV=${TEST_ENV}`); return null; }
  const user = await getUser(email);
  if (!user) { fail(`${spec.alias}: persona {{${spec.personaEmailVar}}} has no security account`); return null; }
  const contact = user.memberId ? await getMember(user.memberId) : null;
  if (!contact) { fail(`${spec.alias}: persona account has no contact (memberId=${user.memberId || 'null'})`); return null; }
  return { user, contact };
}

async function registerMapping(spec) {
  const persona = await personaFor(spec);
  if (!persona) return null;
  const { user, contact } = persona;
  const orgs = contact.organizations || [];
  if (spec.minOrganizations && orgs.length < spec.minOrganizations) {
    fail(`${spec.alias}: persona contact is in ${orgs.length} org(s), needs ≥${spec.minOrganizations}`);
  }
  if (user.passwordExpired) fail(`${spec.alias}: persona account is passwordExpired`);
  if (!notLocked(user)) fail(`${spec.alias}: persona account is locked until ${user.lockoutEnd}`);
  if (spec.owned) {
    const pw = process.env[`${spec.personaEmailVar.replace(/_EMAIL$/, '')}_PASSWORD`];
    if (pw) {
      const g = await grant({ username: user.userName, password: pw, storeId: STORE_ID });
      if (g.token) ok(`${spec.alias}: persona password sign-in OK (store ${STORE_ID})`);
      else fail(`${spec.alias}: persona sign-in failed ${g.status} ${g.error}`);
    } else log(`! ${spec.alias}: no persona password var set — sign-in not probed`);
  }

  const found = (await searchMappings({ externalIds: [spec.externalId] }))?.results || [];
  let mapping = found.find((m) => m.externalId === spec.externalId) || null;

  if (!spec.owned) {
    if (!mapping) { fail(`${spec.alias}: ${spec.externalId} does not exist — it is created by /qa-test 1r, not by this seeder (FIXTURE-GAP)`); return null; }
    if (mapping.userId !== user.id) fail(`${spec.alias}: ${spec.externalId} maps user ${mapping.userId}, persona is ${user.id}`);
    if (!mapping.isActive) fail(`${spec.alias}: ${spec.externalId} is INACTIVE — every L1+ case would 401`);
    ok(`${spec.alias}: registered existing ${spec.externalId} (${mapping.id}) — not owned, untouched`);
  } else if (mapping) {
    const drift = mapping.userId !== user.id || mapping.memberId !== contact.id || !mapping.isActive;
    if (drift && !VERIFY_ONLY) {
      mapping = await api('PUT', MAPPINGS, { ...mapping, ...mappingBody(spec, user) }, { expectStatus: [200, 204] }) || { ...mapping, ...mappingBody(spec, user) };
      ok(`${spec.alias}: reconciled ${spec.externalId} (${mapping.id}) → active, user ${user.id}`);
    } else if (drift) fail(`${spec.alias}: ${spec.externalId} drifted (user/member/active)`);
    else ok(`${spec.alias}: reuse ${spec.externalId} (${mapping.id})`);
  } else if (VERIFY_ONLY) {
    fail(`${spec.alias}: ${spec.externalId} missing — run the seed`); return null;
  } else {
    const byUser = (await searchMappings({ userIds: [user.id] }))?.results || [];
    if (byUser.length) { fail(`${spec.alias}: persona already mapped as ${byUser.map((m) => m.externalId).join(',')} — refusing to create a second mapping`); return null; }
    mapping = await api('POST', MAPPINGS, mappingBody(spec, user), { expectStatus: [200, 201] });
    if (DRY_RUN) { log(`✓ ${spec.alias}: create (dry) ${spec.externalId}`); return null; }
    ok(`${spec.alias}: created ${spec.externalId} (${mapping.id}) for user ${user.id}`);
  }

  const current = contact.currentOrganizationId || contact.defaultOrganizationId || orgs[0] || '';
  const other = orgs.find((o) => o !== current) || '';
  return {
    [spec.alias]: {
      id: mapping.id, userId: user.id, memberId: contact.id,
      currentOrganizationId: current, otherOrganizationId: other, organizationCount: orgs.length,
    },
  };
}

// ── back-office roles + accounts ─────────────────────────────────────────────────────────────

async function ensureRole(role) {
  const s = await api('POST', '/api/platform/security/roles/search', { keyword: role.name, take: 50 }, { expectStatus: [200] });
  const existing = (s?.results || []).find((r) => r.name === role.name);
  if (!VERIFY_ONLY) await api('PUT', '/api/platform/security/roles', { ...roleBody(role), id: existing?.id || role.id }, { expectStatus: [200, 201, 204] });
  // roles/search returns permissions:[] for every role — only GET roles/{name} carries them.
  const found = DRY_RUN && !existing ? null
    : await api('GET', `/api/platform/security/roles/${encodeURIComponent(role.name)}`, null, { expectStatus: [200, 404] });
  const after = found && found.id ? found : null;
  if (!after) { if (!DRY_RUN) fail(`role ${role.name} not found after upsert`); return existing?.id || role.id; }
  const live = new Set((after.permissions || []).map((p) => p.name || p.id));
  const want = new Set(role.permissions);
  const same = live.size === want.size && [...want].every((p) => live.has(p));
  if (same) ok(`role ${role.name} (${after.id}) permissions = [${role.permissions.join(', ')}]`);
  else fail(`role ${role.name} live permissions [${[...live].join(', ')}] ≠ spec [${role.permissions.join(', ')}]`);
  return after.id;
}

async function ensureAccount(spec, roleId) {
  const password = resolvePassword(spec.passwordToken);
  let user = await getUser(spec.email) || await findUserBySearch(spec.email);
  if (!user && !VERIFY_ONLY) {
    const res = await api('POST', '/api/platform/security/users/create', accountBody(spec, { password, storeId: STORE_ID, roleId }));
    if (res && res.succeeded === false) throw new Error(`create ${spec.email}: ${JSON.stringify(res.errors)}`);
    if (DRY_RUN) { log(`✓ create account (dry) ${spec.email}`); return null; }
    user = await getUser(spec.email) || await findUserBySearch(spec.email);
    if (!user) throw new Error(`created ${spec.email} but cannot resolve it`);
    ok(`account ${spec.email} created (${user.id}) — Manager, isAdministrator=false, role ${spec.role.name}`);
  } else if (!user) { fail(`account ${spec.email} missing — run the seed`); return null; }
  const roleNames = (user.roles || []).map((r) => r.name);
  const drift = user.isAdministrator || roleNames.length !== 1 || roleNames[0] !== spec.role.name || user.userType !== 'Manager';
  if (drift && !VERIFY_ONLY) {
    await api('PUT', '/api/platform/security/users', { ...user, isAdministrator: false, userType: 'Manager', roles: [{ id: roleId, name: spec.role.name }] }, { expectStatus: [200, 204] });
    ok(`account ${spec.email} reconciled → Manager, isAdministrator=false, only ${spec.role.name}`);
  } else if (drift) fail(`account ${spec.email} drifted (roles=[${roleNames}], admin=${user.isAdministrator}, type=${user.userType})`);
  else ok(`account ${spec.email} (${user.id}) — role ${spec.role.name}`);
  return { [spec.alias]: { user_id: user.id, role_id: roleId } };
}

// ── live verify ──────────────────────────────────────────────────────────────────────────────

async function verifyBoundary(spec) {
  const g = await grant({ username: spec.email, password: resolvePassword(spec.passwordToken), scope: 'offline_access' });
  if (!g.token) { fail(`${spec.alias}: back-office sign-in failed ${g.status} ${g.error}`); return; }
  const call = async (method, path, body) => (await fetch(`${BACK_URL}${path}`, {
    method, headers: { Authorization: `Bearer ${g.token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  })).status;
  const search = await call('POST', `${MAPPINGS}/search`, { take: 1 });
  // A DELETE of an id that cannot exist: if the gate were open it deletes nothing.
  const write = await call('DELETE', `${MAPPINGS}?ids=AGENT-TEST-no-such-mapping`);
  const line = `${spec.alias}: search → ${search} (want ${spec.expect.search}), DELETE → ${write} (want ${spec.expect.write})`;
  if (search === spec.expect.search && write === spec.expect.write) ok(line); else fail(line);
}

async function verifyProbes(mappingIds) {
  for (const p of VERIFY_PROBES) {
    const cfg = CONFIG_SPECS.find((c) => c.index === p.config);
    const secret = process.env[cfg.secretVar];
    if (!secret) { log(`! skip probe (no {{${cfg.secretVar}}} on ${TEST_ENV}): ${p.name}`); continue; }
    const identity = p.identity || MAPPING_SPECS.find((m) => m.alias === p.mapping)?.externalId;
    if (p.mapping && !mappingIds[p.mapping]) { log(`! skip probe (${p.mapping} not provisioned): ${p.name}`); continue; }
    const xml = buildSetupRequest({
      secret, identity, domain: p.domain, returnUrl: p.returnUrl, buyerCookie: 'AGENT-TEST-seed-verify',
      payloadId: `agent-test-seed-${Date.now()}@agent-test`, timestamp: new Date().toISOString(), supplierUrl: `${BACK_URL}/api/punchout/cxml`,
    });
    const res = await fetch(`${BACK_URL}/api/punchout/cxml`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml });
    const code = cxmlStatusCode(await res.text());
    if (code === '200') fail(`probe OPENED A SESSION (cXML 200) — spec says it cannot: ${p.name}`);
    else if (code === p.expectCode) ok(`probe ${p.name} [cXML ${code}]`);
    else fail(`probe ${p.name}: got HTTP ${res.status} cXML ${code}`);
  }
}

async function verifyStores(deployed) {
  for (const [idx, d] of Object.entries(deployed.configs)) {
    if (!d.storeId) continue;
    const st = await api('GET', `/api/stores/${encodeURIComponent(d.storeId)}`, null, { expectStatus: [200, 404] });
    const exists = !!(st && st.id);
    if (exists !== d.storeExists) { fail(`config ${idx}: store ${d.storeId} exists=${exists}, spec says ${d.storeExists}`); continue; }
    if (!exists) { ok(`config ${idx}: store ${d.storeId} absent, as declared`); continue; }
    const enabled = (st.settings || []).find((s) => s.name === 'Punchout.Enabled')?.value;
    const url = st.secureUrl || st.url;
    if (enabled === true && url) ok(`config ${idx}: store ${d.storeId} Punchout.Enabled=true, url set`);
    else fail(`config ${idx}: store ${d.storeId} Punchout.Enabled=${enabled}, url=${url || '(none)'} — cases expecting a 200 setup will fail`);
  }
}

// ── teardown ─────────────────────────────────────────────────────────────────────────────────

async function teardown() {
  const owned = MAPPING_SPECS.filter((m) => m.owned);
  const found = (await searchMappings({ externalIds: owned.map((m) => m.externalId) }))?.results || [];
  const ids = teardownMappingTargets(found);
  if (ids.length) {
    await api('DELETE', `${MAPPINGS}?${ids.map((i) => `ids=${encodeURIComponent(i)}`).join('&')}`, null, { expectStatus: [200, 204] });
    log(`✓ deleted mapping(s) ${ids.join(', ')}`);
  } else log('  no owned mapping to delete');
  for (const spec of BACKOFFICE_SPECS) {
    if (await getUser(spec.email) || await findUserBySearch(spec.email)) {
      await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(spec.email)}`, null, { expectStatus: [200, 204, 404] });
      log(`✓ deleted account ${spec.email}`);
    }
    const s = await api('POST', '/api/platform/security/roles/search', { keyword: spec.role.name, take: 50 }, { expectStatus: [200] });
    const role = (s?.results || []).find((r) => r.name === spec.role.name);
    if (role) { await api('DELETE', `/api/platform/security/roles?ids=${encodeURIComponent(role.id)}`, null, { expectStatus: [200, 204, 404] }); log(`✓ deleted role ${spec.role.name}`); }
  }
  const residue = await verifyRemoved(async () => {
    const m = teardownMappingTargets((await searchMappings({ externalIds: owned.map((x) => x.externalId) }))?.results || []);
    let n = m.length;
    for (const spec of BACKOFFICE_SPECS) {
      if (await getUser(spec.email) || await findUserBySearch(spec.email)) n++;
      const r = await api('POST', '/api/platform/security/roles/search', { keyword: spec.role.name, take: 50 }, { expectStatus: [200] });
      if ((r?.results || []).some((x) => x.name === spec.role.name)) n++;
    }
    return n;
  });
  const protectedLeft = ((await searchMappings({ externalIds: [...PROTECTED_EXTERNAL_IDS] }))?.results || []).length;
  log(`  protected mapping(s) still present (must be untouched): ${protectedLeft}/${PROTECTED_EXTERNAL_IDS.size}`);
  const clear = {};
  for (const m of owned) clear[m.alias] = { id: '', userId: '', memberId: '', currentOrganizationId: '', otherOrganizationId: '', organizationCount: 0 };
  for (const b of BACKOFFICE_SPECS) clear[b.alias] = { user_id: '', role_id: '' };
  writeEnvAliasOverride(clear);
  if (residue) { console.error(`TEARDOWN RESIDUE: ${residue} entity(ies) remain`); process.exit(1); }
  log('Teardown complete — zero residue.');
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────

async function main() {
  assertSafeTarget();
  await auth();
  if (!(await moduleInstalled())) { console.error(`VirtoCommerce.Punchout is not installed on ${TEST_ENV} (GET ${MAPPINGS}/new failed) — nothing to seed.`); process.exit(1); }
  if (TEARDOWN) { await teardown(); return; }

  const writeback = {};
  const deployed = DEPLOYED_CONFIGS[TEST_ENV];
  if (deployed) {
    for (const spec of CONFIG_SPECS) writeback[spec.alias] = { ...configOverlayFields(spec, deployed.configs[spec.index]), source: deployed.source };
    await verifyStores(deployed);
  } else log(`! no deployed Punchout configuration declared for ${TEST_ENV} — PUNCHOUT_CONFIG_* facts resolve to "" here`);

  const mappingIds = {};
  for (const spec of MAPPING_SPECS) {
    const w = await registerMapping(spec);
    if (w) { Object.assign(writeback, w); mappingIds[spec.alias] = w[spec.alias].id; }
  }
  for (const spec of BACKOFFICE_SPECS) {
    const roleId = await ensureRole(spec.role);
    const w = await ensureAccount(spec, roleId);
    if (w) Object.assign(writeback, w);
  }

  if (!VERIFY_ONLY) writeEnvAliasOverride(writeback);
  if (!DRY_RUN) {
    log('\n  [verify] permission boundary + session-free cXML probes');
    for (const spec of BACKOFFICE_SPECS) await verifyBoundary(spec);
    await verifyProbes(mappingIds);
  }
  if (failures.length) { console.error(`\n${failures.length} problem(s):\n - ${failures.join('\n - ')}`); process.exit(1); }
  log(DRY_RUN ? 'DRY RUN complete.' : VERIFY_ONLY ? 'Verify complete — all green.' : 'Seed complete — all green.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
