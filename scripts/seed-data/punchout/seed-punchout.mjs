#!/usr/bin/env node
/**
 * seed-punchout.mjs — provision the VCST-5886 Punchout cXML fixtures (spec: punchout-specs.mjs).
 *
 * WHAT IT DOES
 *   - REGISTERS the 1r mapping AGENT-TEST-PO-100 ({{USER_EMAIL}}) — reads its ids, never creates,
 *     changes or deletes it (owned by /qa-test 1r, removed at run close-out).
 *   - PROVISIONS the dedicated buyer AGENT-TEST-punchout-buyer@… (VCST-5887): contact + Customer
 *     account (password {{B2B_USER_PASSWORD}}) + ONE org membership (Purchasing agent) in the org of
 *     the {{USER_EMAIL}} persona, and FIND-OR-CREATES its mapping AGENT-TEST-PO-300.
 *   - FIND-OR-CREATES mapping AGENT-TEST-PO-200 for the {{MULTI_ORG_USER_EMAIL}} persona (contact in
 *     ≥2 orgs), after checking that persona can sign in (not passwordExpired, not locked, grant OK).
 *   - UPSERTS roles AGENT-TEST-Punchout-Reader (customer:access+read, punchout:read) and
 *     AGENT-TEST-Punchout-None (customer:access+read only) and their Manager accounts
 *     (isAdministrator=false, password {{DEFAULT_TEST_PASSWORD}}).
 *   - CATALOG FIXTURES (VCST-5887, punchout-specs §5): two OWNED products in the category of the
 *     standard fixture PROD-001 (derived live — no catalog/category is written) — the
 *     UoM product (MeasureUnit "box") and its plain sibling (no MeasureUnit) — stocked on config 0's
 *     store main FFC, priced ONLY by two OWNED store-scoped lists AGENT-TEST-Punchout-USD (config 0 +
 *     config 1 stores) and AGENT-TEST-Punchout-EUR (config 0 store), then reindexed.
 *   - CONFIG-1 STORE FFC: sets config 1's store mainFulfillmentCenterId to config 0's store main FFC
 *     ONLY when it has none, via GET → change that field → PUT the FULL body → GET + diff every other
 *     field (must be identical). The previous value is recorded in the overlay; teardown restores it.
 *   - WRITES runtime ids + this env's deployed configuration facts to test-data/aliases.<env>.json.
 *
 * USAGE
 *   TEST_ENV=<env> node scripts/seed-data/punchout/seed-punchout.mjs [--dry-run] [--verbose]
 *   TEST_ENV=<env> node scripts/seed-data/punchout/seed-punchout.mjs --verify-only   (live checks, no writes)
 *   TEST_ENV=<env> node scripts/seed-data/punchout/seed-punchout.mjs --only catalog [--dry-run]
 *       seeds + verifies ONLY the §5 catalog fixtures (products, price lists, config-1 store FFC)
 *   TEST_ENV=<env> node scripts/seed-data/punchout/seed-punchout.mjs --teardown [--only requisition|catalog]
 *   TEST_ENV=<env> node scripts/seed-data/punchout/seed-punchout.mjs --reset-buyer-carts
 *       deletes EVERY cart of the dedicated buyer (default, named, saved-for-later, lists), asserts
 *       zero remain, then lets xAPI mint the empty `default` cart as the buyer. A case's Setup and
 *       Cleanup run it (npm run seed:punchout:reset-carts) to start from "only an empty default cart".
 *   A seed always ends with the live verify (permission boundary + session-free cXML probes).
 *
 * SAFETY: assertSafeTarget (ENV_RISK=production aborts). Teardown deletes only the OWNED mappings (by
 * id, teardownMappingTargets() excludes AGENT-TEST-PO-100), the buyer's carts + membership + account +
 * contact, the two AGENT-TEST back-office accounts (by name — KB-FB8014EB) and the two AGENT-TEST
 * roles, the two products + two price lists (with their assignments), restores config 1's store FFC
 * field if this seeder set it and nobody changed it since, then asserts zero residue. The reused
 * personas ({{USER_EMAIL}}, {{MULTI_ORG_USER_EMAIL}}) are never written. The ONLY store write is that
 * one guarded FFC field; no store setting or app setting is written. Verify probes are chosen so NO
 * PunchoutSession row is created.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import {
  assertSafeTarget, auth, api, log, verbose, verifyRemoved, writeEnvAliasOverride,
  DRY_RUN, TEARDOWN, ONLY, STORE_ID, BACK_URL, ROOT, buildStoreSeo, idsParam, loadCsv,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONFIG_SPECS, DEPLOYED_CONFIGS, configOverlayFields, retiredOverlayFields, MAPPING_SPECS, PROTECTED_EXTERNAL_IDS,
  mappingBody, teardownMappingTargets, personaEmailVarFor, personaOverlayFields, BACKOFFICE_SPECS, roleBody, accountBody, isProvisionedBuyer, buyerCartTargets,
  VERIFY_PROBES, buildSetupRequest, cxmlStatusCode, SEED_PREFIX,
  PRODUCT_SPECS, PRODUCT_PLACEMENT, PRODUCT_MIN_STOCK, PRICELIST_SPECS, assignmentName, priceRows, productBody,
  STORE_FFC_SPEC, planStoreFfc, planStoreFfcRestore, diffStore, teardownProductTargets,
} from './punchout-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const VERIFY_ONLY = process.argv.includes('--verify-only');
const RESET_CARTS = process.argv.includes('--reset-buyer-carts');
const MAPPINGS = '/api/punchout-user-mappings';
const failures = [];
const fail = (m) => { failures.push(m); log(`✗ ${m}`); };
const ok = (m) => log(`✓ ${m}`);

/**
 * True when VirtoCommerce.Punchout answers. An env without the module 404s the route (null body) —
 * that is a deployment shape, not an error, so the caller skips with exit 0. Any OTHER status
 * (401/403/5xx) throws: a broken env must not masquerade as "module absent".
 */
async function moduleInstalled() {
  const r = await api('GET', `${MAPPINGS}/new`, null, { expectStatus: [200, 404] });
  return !!(r && typeof r === 'object' && 'externalId' in r);
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
  if (isProvisionedBuyer(spec)) return ensureBuyer(spec);
  const emailVar = personaEmailVarFor(spec, TEST_ENV);
  const email = process.env[emailVar];
  if (!email) { fail(`${spec.alias}: {{${emailVar}}} is not set for TEST_ENV=${TEST_ENV}`); return null; }
  const user = await getUser(email);
  if (!user) { fail(`${spec.alias}: persona {{${emailVar}}} has no security account`); return null; }
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
  if (spec.maxOrganizations && (orgs.length < 1 || orgs.length > spec.maxOrganizations)) {
    fail(`${spec.alias}: persona contact is in ${orgs.length} org(s), must be 1..${spec.maxOrganizations} (single-org side of the pair)`);
  }
  if (user.passwordExpired) fail(`${spec.alias}: persona account is passwordExpired`);
  if (!notLocked(user)) fail(`${spec.alias}: persona account is locked until ${user.lockoutEnd}`);
  if (spec.owned && !isProvisionedBuyer(spec)) {
    const pw = process.env[`${personaEmailVarFor(spec, TEST_ENV).replace(/_EMAIL$/, '')}_PASSWORD`];
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
      ...(spec.personaEmailVar ? personaOverlayFields(spec, TEST_ENV) : {}), id: mapping.id, userId: user.id, memberId: contact.id,
      currentOrganizationId: current, otherOrganizationId: other, organizationCount: orgs.length,
      ...(isProvisionedBuyer(spec) ? { organizationId: current } : {}),
    },
  };
}

// ── dedicated punchout buyer (VCST-5887) ─────────────────────────────────────────────────────

const hasEmail = (m, email) => (m?.emails || []).some((e) => String(e).toLowerCase() === email.toLowerCase());
/**
 * The buyer contact by email. The member SEARCH is index-backed and lags (measured on qa1: a contact
 * whose account was just deleted was invisible to it), so the id this env's overlay recorded is tried
 * FIRST by direct GET — that is what keeps both find-or-create and the zero-residue check honest.
 */
async function findContactByEmail(email, alias = buyerSpec()?.alias) {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  const known = alias && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8'))[alias]?.memberId : '';
  if (known) { const m = await getMember(known); if (hasEmail(m, email)) return m; }
  const r = await api('POST', '/api/members/search', { memberType: 'Contact', keyword: email, take: 20 }, { expectStatus: [200] });
  return (r?.results || []).find((m) => hasEmail(m, email)) || null;
}
const buyerSpec = () => MAPPING_SPECS.find(isProvisionedBuyer);

/**
 * Find-or-create the buyer's contact + Customer account + single org membership. The org is the ONE
 * org of the {{organizationFromPersonaVar}} persona (derived live, never transcribed); currency and
 * language come from the store. Returns { user, contact } like personaFor(), or null after fail().
 */
async function ensureBuyer(spec) {
  const b = spec.buyer;
  const source = await getUser(process.env[b.organizationFromPersonaVar] || '');
  const sourceContact = source?.memberId ? await getMember(source.memberId) : null;
  const srcOrgs = sourceContact?.organizations || [];
  if (srcOrgs.length !== 1) { fail(`${spec.alias}: org source {{${b.organizationFromPersonaVar}}} must be in exactly 1 org (is in ${srcOrgs.length})`); return null; }
  const orgId = srcOrgs[0];
  const org = await getMember(orgId);
  const role = await api('GET', `/api/platform/security/roles/${encodeURIComponent(b.orgRoleName)}`, null, { expectStatus: [200, 404] });
  if (!role?.id) { fail(`${spec.alias}: org role "${b.orgRoleName}" does not exist on ${TEST_ENV}`); return null; }
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`, null, { expectStatus: [200] });
  const password = resolvePassword(b.passwordToken);

  let user = await findUserBySearch(b.email) || await getUser(b.email);
  let contact = user?.memberId ? await getMember(user.memberId) : await findContactByEmail(b.email);
  if (!contact) {
    if (VERIFY_ONLY) { fail(`${spec.alias}: buyer contact ${b.email} missing — run the seed`); return null; }
    const name = `${b.firstName} ${b.lastName}`;
    const created = await api('POST', '/api/members', {
      memberType: 'Contact', firstName: b.firstName, lastName: b.lastName, fullName: name, name,
      emails: [b.email], organizations: [orgId], status: 'Approved',
      currencyCode: store.defaultCurrency, defaultLanguage: store.defaultLanguage,
    }, { expectStatus: [200, 201] });
    if (DRY_RUN) { log(`✓ ${spec.alias}: create contact (dry) ${b.email}`); return null; }
    contact = await getMember(created.id);
    ok(`${spec.alias}: contact ${name} created (${contact.id}) in org ${org?.name || orgId}`);
  } else if (JSON.stringify(contact.organizations || []) !== JSON.stringify([orgId])) {
    if (VERIFY_ONLY) fail(`${spec.alias}: buyer contact orgs [${contact.organizations}] ≠ [${orgId}]`);
    else {
      await api('PUT', '/api/members', { ...contact, organizations: [orgId] }, { expectStatus: [200, 204] });
      contact = await getMember(contact.id);
      ok(`${spec.alias}: contact orgs reconciled → [${orgId}]`);
    }
  }
  if (!user) {
    if (VERIFY_ONLY) { fail(`${spec.alias}: buyer account ${b.email} missing — run the seed`); return null; }
    const res = await api('POST', '/api/platform/security/users/create', {
      userName: b.email, email: b.email, password, memberId: contact.id, storeId: STORE_ID,
      userType: 'Customer', isAdministrator: false, status: 'Approved', emailConfirmed: true, lockoutEnabled: false,
    });
    if (res && res.succeeded === false) throw new Error(`create ${b.email}: ${JSON.stringify(res.errors)}`);
    user = await findUserBySearch(b.email) || await getUser(b.email);
    if (!user) throw new Error(`created ${b.email} but cannot resolve it`);
    ok(`${spec.alias}: Customer account ${b.email} created (${user.id})`);
  }
  const full = await getUser(b.email) || user;
  const acctDrift = full.memberId !== contact.id || full.isAdministrator || full.userType !== 'Customer' || (full.roles || []).length > 0;
  if (acctDrift) {
    if (VERIFY_ONLY) fail(`${spec.alias}: buyer account drifted (memberId/admin/userType/global roles)`);
    else {
      await api('PUT', '/api/platform/security/users', { ...full, memberId: contact.id, isAdministrator: false, userType: 'Customer', roles: [] }, { expectStatus: [200, 204] });
      ok(`${spec.alias}: account reconciled → Customer, no global roles, memberId ${contact.id}`);
    }
  }
  if (full.passwordExpired) fail(`${spec.alias}: buyer account is passwordExpired`);
  if (!notLocked(full)) fail(`${spec.alias}: buyer account is locked until ${full.lockoutEnd}`);
  // Org-scoped role only (VCST-5028) — never a global role on the account.
  const ms = (await api('POST', '/api/customer/organization-memberships/search', { userId: user.id, take: 50 }, { expectStatus: [200] }))?.results || [];
  const mine = ms.find((m) => m.organizationId === orgId);
  const roleOk = mine && (mine.roles || []).length === 1 && mine.roles[0].roleId === role.id && !mine.isLocked;
  if (roleOk) ok(`${spec.alias}: buyer ${b.email} (${user.id}) — ${org?.name} / ${role.name}`);
  else if (VERIFY_ONLY) fail(`${spec.alias}: buyer membership in ${org?.name || orgId} missing or not "${b.orgRoleName}"`);
  else if (mine) {
    await api('PUT', `/api/customer/organization-memberships/${encodeURIComponent(mine.id)}`, { ...mine, roles: [{ roleId: role.id, roleName: role.name }], isLocked: false }, { expectStatus: [200, 204] });
    ok(`${spec.alias}: membership reconciled → ${role.name}`);
  } else {
    const m = await api('POST', '/api/customer/organization-memberships', { userId: user.id, organizationId: orgId, organizationName: org?.name, roles: [{ roleId: role.id, roleName: role.name }], isLocked: false });
    ok(`${spec.alias}: membership ${m?.id} → ${org?.name} / ${role.name}`);
  }
  if (source.id === user.id) { fail(`${spec.alias}: buyer resolved to the SAME account as {{${b.organizationFromPersonaVar}}} — isolation collapsed`); return null; }
  const g = await grant({ username: b.email, password, storeId: STORE_ID });
  if (g.token) ok(`${spec.alias}: buyer password sign-in OK (store ${STORE_ID})`);
  else fail(`${spec.alias}: buyer sign-in failed ${g.status} ${g.error}`);
  return { user: await getUser(b.email) || user, contact: await getMember(contact.id) };
}

const searchCarts = async (userId) => (await api('POST', '/api/carts/search', { customerId: userId, take: 200 }, { expectStatus: [200] }))?.results || [];
const deleteCarts = (ids) => api('DELETE', `/api/carts?${ids.map((i) => `ids=${encodeURIComponent(i)}`).join('&')}`, null, { expectStatus: [200, 204] });

/** Empty the dedicated buyer: delete every cart it owns, assert none left, mint the empty default cart. */
async function resetBuyerCarts() {
  const b = buyerSpec().buyer;
  if (!b.email.startsWith(SEED_PREFIX)) throw new Error('refusing to reset carts of a non-AGENT-TEST account');
  const user = await findUserBySearch(b.email) || await getUser(b.email);
  if (!user) { console.error(`buyer ${b.email} not provisioned on ${TEST_ENV} — run npm run seed:punchout`); process.exit(1); }
  const ids = buyerCartTargets(await searchCarts(user.id), user.id);
  if (ids.length && !DRY_RUN) await deleteCarts(ids);
  log(`✓ deleted ${ids.length} cart(s) of ${b.email}`);
  if (DRY_RUN) return;
  const left = buyerCartTargets(await searchCarts(user.id), user.id).length;
  if (left) { console.error(`CART RESET RESIDUE: ${left} cart(s) remain`); process.exit(1); }
  // Mint the empty `default` cart through xAPI as the buyer — the cart the requisition handler reads.
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`, null, { expectStatus: [200] });
  const g = await grant({ username: b.email, password: resolvePassword(b.passwordToken), storeId: STORE_ID });
  if (!g.token) { console.error(`buyer sign-in failed ${g.status} ${g.error}`); process.exit(1); }
  // The `cart` query returns null when no cart exists (it creates nothing); `clearCart` goes through
  // XCart's get-or-create and SAVES, so it is what leaves exactly one persisted, empty `default` cart.
  const query = 'mutation($s:String!,$u:String!,$c:String!,$l:String!){cart:clearCart(command:{storeId:$s,userId:$u,currencyCode:$c,cultureName:$l}){id name itemsQuantity}}';
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { Authorization: `Bearer ${g.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { s: STORE_ID, u: user.id, c: store.defaultCurrency, l: store.defaultLanguage } }),
  });
  const j = await res.json().catch(() => ({}));
  const cart = j?.data?.cart;
  if (!cart) { console.error(`xAPI clearCart failed: ${JSON.stringify(j.errors || j).slice(0, 300)}`); process.exit(1); }
  const after = await searchCarts(user.id);
  log(`✓ xAPI cart "${cart.name}" itemsQuantity=${cart.itemsQuantity}; persisted carts for buyer: ${after.length} [${after.map((c) => `${c.name}:${(c.items || []).length}`).join(', ')}]`);
  if (cart.itemsQuantity !== 0 || after.some((c) => (c.items || []).length) || after.some((c) => c.name !== 'default')) {
    console.error('buyer does NOT hold only an empty default cart after reset'); process.exit(1);
  }
  log('Cart reset complete — buyer holds only an empty default cart.');
}

async function deleteBuyer(email) {
  if (!email.startsWith(SEED_PREFIX)) throw new Error(`refusing to delete non-AGENT-TEST buyer ${email}`);
  const user = await findUserBySearch(email) || await getUser(email);
  const contactId = user?.memberId || (await findContactByEmail(email))?.id || null;
  if (user) {
    const carts = buyerCartTargets(await searchCarts(user.id), user.id);
    if (carts.length) await deleteCarts(carts);
    const ms = ((await api('POST', '/api/customer/organization-memberships/search', { userId: user.id, take: 50 }, { expectStatus: [200] }))?.results || []).map((m) => m.id);
    if (ms.length) await api('DELETE', `/api/customer/organization-memberships?${ms.map((i) => `ids=${encodeURIComponent(i)}`).join('&')}`, null, { expectStatus: [200, 204, 404] });
    await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
    log(`✓ deleted buyer account ${email} (+${carts.length} cart(s), ${ms.length} membership(s))`);
  }
  if (contactId) {
    const c = await getMember(contactId);
    // Ownership = AGENT-TEST name AND the buyer's own email — never a contact a search merely surfaced.
    const mine = c && String(c.name || '').startsWith('AGENT-TEST') && (c.emails || []).some((e) => String(e).toLowerCase() === email.toLowerCase());
    if (c && !mine) throw new Error(`contact ${contactId} ("${c.name}") is not the AGENT-TEST buyer contact — not deleting`);
    if (c) { await api('DELETE', `/api/members?ids=${encodeURIComponent(contactId)}`, null, { expectStatus: [200, 204, 404] }); log(`✓ deleted buyer contact ${contactId}`); }
  }
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

// ── catalog fixtures: UoM product pair, punchout price lists, config-1 store FFC (VCST-5887) ──

const readOverlay = () => {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
};
const liveFfcIds = async () => new Set(((await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 200 }, { expectStatus: [200] }))?.results || []).map((f) => f.id));
const getStore = (id) => api('GET', `/api/stores/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
/** A configuration's store on a deployed env; config 0 falls back to STORE_ID elsewhere. */
const configStore = (idx) => DEPLOYED_CONFIGS[TEST_ENV]?.configs[idx]?.storeId || (idx === 0 ? STORE_ID : '');
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** DB-backed exact-code lookup (/listentries reflects writes at once; the search index lags — KB-5D688448). */
async function findProductByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { keyword: code, take: 200 }, { expectStatus: [200] });
  const hit = (r?.listEntries || r?.results || []).find((p) => p.code === code && p.type === 'product');
  return hit ? { id: hit.id, code: hit.code, name: hit.name } : null;
}

/** Catalog + category of the PRODUCT_PLACEMENT anchor fixture; it must already surface in the store's catalog. */
async function resolvePlacement(store) {
  const P = PRODUCT_PLACEMENT;
  const code = loadCsv(P.csv).find((r) => r[P.keyColumn] === P.key)?.[P.codeColumn];
  const hit = code && await findProductByCode(code);
  if (!hit) { fail(`catalog: placement anchor ${P.key} (${code || 'no sku'}) not found on ${TEST_ENV} — run seed:products first`); return null; }
  const anchor = await api('GET', `/api/catalog/products/${hit.id}`, null, { expectStatus: [200] });
  const inStore = (anchor.outlines || []).some((o) => o.items?.[0]?.id === store.catalog && o.items.some((i) => i.id === anchor.categoryId));
  if (!anchor.categoryId || !inStore) { fail(`catalog: anchor ${P.key}'s category ${anchor.categoryId} is not linked into store catalog ${store.catalog}`); return null; }
  const cat = await api('GET', `/api/catalog/categories/${anchor.categoryId}`, null, { expectStatus: [200] });
  log(`  placement: category "${cat?.name}" (${anchor.categoryId}) of ${P.key}, catalog ${anchor.catalogId} — linked into ${store.catalog}`);
  return { catalogId: anchor.catalogId, categoryId: anchor.categoryId, name: cat?.name || anchor.categoryId };
}

async function ensureCatalogProducts() {
  const store = await getStore(configStore(0));
  const ffcId = store?.mainFulfillmentCenterId;
  if (!ffcId) { fail(`catalog: store ${configStore(0)} has no main fulfillment center — stock would be invisible (run seed:store)`); return null; }
  const loc = await resolvePlacement(store);
  if (!loc) return null;
  const out = {};
  for (const spec of PRODUCT_SPECS) {
    let p = await findProductByCode(spec.code);
    if (p && !String(p.name || '').startsWith(SEED_PREFIX)) { fail(`${spec.alias}: code ${spec.code} is held by a non-AGENT-TEST product "${p.name}" — not touching it`); continue; }
    if (!p) {
      if (VERIFY_ONLY) { fail(`${spec.alias}: product ${spec.code} missing — run the seed`); continue; }
      const created = await api('POST', '/api/catalog/products', productBody(spec, {
        catalogId: loc?.catalogId, categoryId: loc?.categoryId,
        seoInfos: [buildStoreSeo({ semanticUrl: slugOf(spec.name), pageTitle: spec.name })],
      }), { expectStatus: [200, 201] });
      if (DRY_RUN) { log(`✓ ${spec.alias}: create product (dry) ${spec.code}`); continue; }
      p = { id: created.id, code: spec.code, name: spec.name };
      ok(`${spec.alias}: product ${spec.code} created (${p.id}) in ${loc.name}`);
    }
    const full = await api('GET', `/api/catalog/products/${p.id}`, null, { expectStatus: [200] });
    const drift = (full.measureUnit || '') !== spec.measureUnit || !full.isActive || !full.isBuyable || !full.trackInventory;
    if (drift && VERIFY_ONLY) fail(`${spec.alias}: product drifted (measureUnit=${full.measureUnit}, active=${full.isActive}, buyable=${full.isBuyable})`);
    else if (drift && !DRY_RUN) {
      const { variations, ...rest } = full; // KB-969D7E09: never POST variations back
      await api('POST', '/api/catalog/products', { ...rest, measureUnit: spec.measureUnit || null, isActive: true, isBuyable: true, trackInventory: true }, { expectStatus: [200, 201, 204] });
      ok(`${spec.alias}: product reconciled → measureUnit=${JSON.stringify(spec.measureUnit || null)}, active, buyable`);
    } else ok(`${spec.alias}: product ${spec.code} (${p.id}) measureUnit=${JSON.stringify(full.measureUnit ?? null)}`);
    if (!VERIFY_ONLY) {
      await api('PUT', '/api/inventory/plenty', [{ fulfillmentCenterId: ffcId, productId: p.id, inStockQuantity: spec.stock, reservedQuantity: 0, status: 'Enabled' }], { expectStatus: [200, 204] });
    }
    out[spec.alias] = { id: p.id, catalogId: full.catalogId, categoryId: full.categoryId, ffcId };
  }
  return out;
}

async function listAssignments() {
  return (await api('GET', '/api/pricing/assignments?take=1000', null, { expectStatus: [200] }))?.results || [];
}
async function findPricelist(name) {
  const r = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}&take=50`, null, { expectStatus: [200] });
  return (r?.results || []).find((p) => p.name === name) || null;
}

async function ensurePricelists(products) {
  const out = {};
  const assignments = await listAssignments();
  for (const pl of PRICELIST_SPECS) {
    let list = await findPricelist(pl.name);
    if (!list) {
      if (VERIFY_ONLY) { fail(`${pl.alias}: price list ${pl.name} missing — run the seed`); continue; }
      list = await api('POST', '/api/pricing/pricelists', { name: pl.name, currency: pl.currency, description: `AGENT-TEST VCST-5887 punchout fixtures (${pl.currency}); prices ONLY the AGENT-TEST-PO-* products. Safe to delete.` }, { expectStatus: [200, 201] });
      if (DRY_RUN) { log(`✓ ${pl.alias}: create price list (dry) ${pl.name} + store assignment(s)`); continue; }
      ok(`${pl.alias}: price list ${pl.name} created (${list.id})`);
    } else if (list.currency !== pl.currency) { fail(`${pl.alias}: ${pl.name} is in ${list.currency}, spec ${pl.currency}`); continue; }
    const stores = pl.storesFromConfigs.map(configStore).filter(Boolean);
    const ids = [];
    for (const storeId of stores) {
      let a = assignments.find((x) => x.pricelistId === list.id && x.storeId === storeId);
      if (!a && !VERIFY_ONLY) {
        a = await api('POST', '/api/pricing/assignments', { name: assignmentName(pl, storeId), pricelistId: list.id, storeId, priority: pl.priority }, { expectStatus: [200, 201] });
        if (DRY_RUN) continue;
        ok(`${pl.alias}: assigned to store ${storeId} (${a?.id})`);
      } else if (!a) { fail(`${pl.alias}: no assignment to store ${storeId}`); continue; }
      if (a.catalogId) fail(`${pl.alias}: assignment ${a.id} is catalog-scoped (${a.catalogId}) — must be store-scoped`);
      ids.push(a.id);
    }
    // Nothing but the punchout products may carry a price in an owned list (USD/EUR of others untouched).
    if (!DRY_RUN) {
      const priced = (await api('POST', '/api/catalog/products/prices/search', { pricelistIds: [list.id], take: 200 }, { expectStatus: [200] }))?.results || [];
      const foreign = priced.filter((x) => !Object.values(products).some((p) => p.id === x.productId));
      if (foreign.length) fail(`${pl.alias}: ${foreign.length} foreign product price(s) in ${pl.name} — the list must price only the punchout products`);
    }
    out[pl.alias] = { id: list.id, currency: pl.currency, storeIds: stores.join(','), assignmentIds: ids.join(',') };
  }
  if (!VERIFY_ONLY && !DRY_RUN) {
    for (const spec of PRODUCT_SPECS) {
      const p = products[spec.alias];
      if (!p) continue;
      const rows = PRICELIST_SPECS.flatMap((pl) => (out[pl.alias] ? priceRows(spec, pl, out[pl.alias].id, p.id) : []));
      await api('PUT', '/api/products/prices', [{ productId: p.id, prices: rows }], { expectStatus: [200, 204] });
      ok(`${spec.alias}: prices ${rows.map((r) => `${r.list} ${r.currency}`).join(', ')}`);
    }
  }
  return out;
}

const ffcSnap = (s) => ({ mainFulfillmentCenterId: s?.mainFulfillmentCenterId ?? null, additionalFulfillmentCenterIds: s?.additionalFulfillmentCenterIds || [], returnsFulfillmentCenterId: s?.returnsFulfillmentCenterId ?? null });

/** GET (caller) → change ONLY `field` → PUT the FULL body → GET + diff every other field (KB-2CBB229F). */
async function putStoreField(before, field, value) {
  await api('PUT', '/api/stores', { ...structuredClone(before), [field]: value }, { expectStatus: [200, 204] });
  const after = await getStore(before.id);
  log(`  store ${before.id} BEFORE ${JSON.stringify(ffcSnap(before))}`);
  log(`  store ${before.id} AFTER  ${JSON.stringify(ffcSnap(after))}`);
  const diff = diffStore(before, after, new Set([field]));
  if ((after?.[field] ?? null) !== value) fail(`store ${before.id}.${field} is ${after?.[field]} after PUT, wanted ${value}`);
  if (diff.length) fail(`store ${before.id}: PUT changed ${diff.length} OTHER field(s): ${diff.slice(0, 10).map((d) => `${d.path} ${JSON.stringify(d.before)}→${JSON.stringify(d.after)}`).join('; ')}`);
  return { after, diff };
}

/** Config 1's store main FFC — set only when it has none; the previous value is recorded for teardown. */
async function ensureStoreFfc() {
  const deployed = DEPLOYED_CONFIGS[TEST_ENV];
  const target = deployed?.configs[STORE_FFC_SPEC.targetConfig]?.storeId;
  const source = deployed?.configs[STORE_FFC_SPEC.sourceConfig]?.storeId;
  if (!target || !source) { log(`! no deployed config ${STORE_FFC_SPEC.targetConfig} store on ${TEST_ENV} — store FFC skipped`); return null; }
  const field = STORE_FFC_SPEC.field;
  const before = await getStore(target);
  const src = await getStore(source);
  if (!before?.id || !src?.id) { fail(`store FFC: store ${target} or ${source} missing`); return null; }
  const plan = planStoreFfc({ current: before[field], desired: src.mainFulfillmentCenterId, liveFfcIds: await liveFfcIds(), recorded: readOverlay()[STORE_FFC_SPEC.alias] });
  if (plan.action === 'set') {
    if (VERIFY_ONLY) { fail(`store FFC: ${target}.${field}=${before[field] ?? null} — run the seed`); return null; }
    if (DRY_RUN) { log(`✓ store FFC (dry): would set ${target}.${field} ${before[field] ?? null} → ${plan.value} (main FFC of ${source})`); return null; }
    const { diff } = await putStoreField(before, field, plan.value);
    if (!diff.length) ok(`store FFC: ${target}.${field} ${before[field] ?? null} → ${plan.value}; every other field identical (diff 0)`);
  } else ok(`store FFC: ${target}.${field}=${plan.value} already set (${plan.owned ? 'owned by this seeder' : 'NOT owned — left alone'})`);
  return { [STORE_FFC_SPEC.alias]: {
    storeId: target, sourceStoreId: source, field, ffcId: plan.value || '',
    assignedFfcId: plan.owned ? plan.value : '', previousValue: plan.owned ? (plan.previous || '') : '', owned: plan.owned,
  } };
}

async function xapi(token, query, variables) {
  const res = await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  return res.json().catch(() => ({}));
}
const PRODUCT_Q = 'query($id:String!,$s:String!,$c:String!,$l:String!){product(id:$id,storeId:$s,currencyCode:$c,cultureName:$l){id code measureUnit price{list{amount}} availabilityData{isBuyable isInStock isAvailable availableQuantity}}}';

/** Read-only xAPI check as the dedicated buyer (no cart is created): price per currency, MeasureUnit, stock, per store. */
async function verifyCatalog(products) {
  const b = buyerSpec().buyer;
  const g = await grant({ username: b.email, password: resolvePassword(b.passwordToken), storeId: STORE_ID });
  if (!g.token) { fail(`catalog verify: buyer sign-in failed ${g.status} ${g.error}`); return; }
  const checks = [];
  for (const pl of PRICELIST_SPECS) for (const idx of pl.storesFromConfigs) if (configStore(idx)) checks.push({ storeId: configStore(idx), currency: pl.currency });
  for (const spec of PRODUCT_SPECS) {
    const p = products[spec.alias];
    if (!p) continue;
    for (const c of checks) {
      const st = await getStore(c.storeId);
      let prod = null;
      for (let i = 0; i < 12 && !prod; i++) { // index lag right after create (KB-5D688448)
        prod = (await xapi(g.token, PRODUCT_Q, { id: p.id, s: c.storeId, c: c.currency, l: st.defaultLanguage }))?.data?.product;
        if (!prod) await new Promise((r) => setTimeout(r, 5000));
      }
      const tag = `${spec.alias} @ ${c.storeId}/${c.currency}`;
      if (!prod) { fail(`${tag}: xAPI product not found (not indexed?)`); continue; }
      const a = prod.availabilityData || {};
      const price = prod.price?.list?.amount;
      const line = `${tag}: list ${price}, measureUnit ${JSON.stringify(prod.measureUnit)}, inStock ${a.isInStock}, available ${a.availableQuantity}, buyable ${a.isBuyable}`;
      const good = price === spec.prices[c.currency] && (prod.measureUnit || '') === spec.measureUnit
        && a.isInStock && a.availableQuantity >= PRODUCT_MIN_STOCK && a.isBuyable;
      if (good) ok(line); else fail(line);
    }
  }
}

async function seedCatalog(writeback) {
  log('\n  [catalog] UoM product pair + punchout price lists + config-1 store FFC');
  const products = await ensureCatalogProducts();
  if (!products) return;
  Object.assign(writeback, products);
  Object.assign(writeback, await ensurePricelists(products));
  const ffc = await ensureStoreFfc();
  if (ffc) Object.assign(writeback, ffc);
  const ids = Object.values(products).map((p) => p.id);
  if (ids.length && !VERIFY_ONLY && !DRY_RUN) {
    await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', rebuild: false, documentIds: ids }], { expectStatus: [200, 204] });
    ok(`reindex triggered for ${ids.length} product(s)`);
  }
  if (!DRY_RUN) await verifyCatalog(products);
}

async function teardownCatalog() {
  const clear = {};
  // 1. config-1 store FFC — restored with the same pattern, only if this seeder set it and nobody changed it.
  const target = DEPLOYED_CONFIGS[TEST_ENV]?.configs[STORE_FFC_SPEC.targetConfig]?.storeId;
  if (target) {
    const field = STORE_FFC_SPEC.field;
    const before = await getStore(target);
    const plan = planStoreFfcRestore({ current: before?.[field] ?? null, recorded: readOverlay()[STORE_FFC_SPEC.alias] });
    if (plan.action === 'restore' && before?.id) {
      const { diff } = await putStoreField(before, field, plan.value);
      if (!diff.length) log(`✓ restored ${target}.${field} ${before[field]} → ${plan.value} (every other field identical)`);
    } else log(`  store FFC: ${plan.reason}`);
    clear[STORE_FFC_SPEC.alias] = { storeId: '', sourceStoreId: '', field: '', ffcId: '', assignedFfcId: '', previousValue: '', owned: false };
  }
  // 2. price lists (their store assignments go with them — asserted in the residue check).
  for (const pl of PRICELIST_SPECS) {
    const list = await findPricelist(pl.name);
    if (list && pl.name.startsWith(SEED_PREFIX)) {
      await api('DELETE', `/api/pricing/pricelists?${idsParam([list.id])}`, null, { expectStatus: [200, 204, 404] });
      log(`✓ deleted price list ${pl.name}`);
    }
    clear[pl.alias] = { id: '', currency: '', storeIds: '', assignmentIds: '' };
  }
  // 3. products — exact code + AGENT-TEST name guard; never an empty objectIds (that deletes everything).
  const found = [];
  for (const spec of PRODUCT_SPECS) { const p = await findProductByCode(spec.code); if (p) found.push(p); }
  const ids = teardownProductTargets(found);
  if (ids.length) {
    await api('POST', '/api/catalog/listentries/delete', { objectIds: ids, objectType: 'CatalogProduct' }, { expectStatus: [200, 204] });
    log(`✓ deleted ${ids.length} product(s)`);
  }
  for (const spec of PRODUCT_SPECS) clear[spec.alias] = { id: '', catalogId: '', categoryId: '', ffcId: '' };
  writeEnvAliasOverride(clear);
  return verifyRemoved(async () => {
    let n = 0;
    for (const spec of PRODUCT_SPECS) { const p = await findProductByCode(spec.code); if (p && teardownProductTargets([p]).length) n++; }
    for (const pl of PRICELIST_SPECS) if (await findPricelist(pl.name)) n++;
    const names = new Set(PRICELIST_SPECS.flatMap((pl) => pl.storesFromConfigs.map((i) => assignmentName(pl, configStore(i)))));
    n += (await listAssignments()).filter((a) => names.has(a.name)).length;
    return n;
  });
}

// ── teardown ─────────────────────────────────────────────────────────────────────────────────

async function teardown() {
  // `--only requisition` scopes the teardown to the dedicated buyer + its mapping, so the buyer can be
  // rebuilt without touching PO-200 or the back-office accounts other runs may be using.
  if (ONLY === 'catalog') {
    const residue = await teardownCatalog();
    if (residue || failures.length) { console.error(`TEARDOWN RESIDUE/PROBLEMS: ${residue} entity(ies) remain; ${failures.join(' | ')}`); process.exit(1); }
    log('Catalog teardown complete — zero residue.');
    return;
  }
  const buyerOnly = ONLY === 'requisition';
  const catalogResidue = buyerOnly ? 0 : await teardownCatalog();
  const owned = MAPPING_SPECS.filter((m) => m.owned && (!buyerOnly || isProvisionedBuyer(m)));
  const backoffice = buyerOnly ? [] : BACKOFFICE_SPECS;
  const found = (await searchMappings({ externalIds: owned.map((m) => m.externalId) }))?.results || [];
  const ids = teardownMappingTargets(found);
  if (ids.length) {
    await api('DELETE', `${MAPPINGS}?${ids.map((i) => `ids=${encodeURIComponent(i)}`).join('&')}`, null, { expectStatus: [200, 204] });
    log(`✓ deleted mapping(s) ${ids.join(', ')}`);
  } else log('  no owned mapping to delete');
  for (const spec of owned.filter(isProvisionedBuyer)) await deleteBuyer(spec.buyer.email);
  for (const spec of backoffice) {
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
    for (const spec of owned.filter(isProvisionedBuyer)) {
      if (await findUserBySearch(spec.buyer.email) || await getUser(spec.buyer.email)) n++;
      if (await findContactByEmail(spec.buyer.email)) n++;
    }
    for (const spec of backoffice) {
      if (await getUser(spec.email) || await findUserBySearch(spec.email)) n++;
      const r = await api('POST', '/api/platform/security/roles/search', { keyword: spec.role.name, take: 50 }, { expectStatus: [200] });
      if ((r?.results || []).some((x) => x.name === spec.role.name)) n++;
    }
    return n;
  });
  const protectedLeft = ((await searchMappings({ externalIds: [...PROTECTED_EXTERNAL_IDS] }))?.results || []).length;
  log(`  protected mapping(s) still present (must be untouched): ${protectedLeft}/${PROTECTED_EXTERNAL_IDS.size}`);
  const clear = {};
  for (const m of owned) {
    clear[m.alias] = { id: '', userId: '', memberId: '', currentOrganizationId: '', otherOrganizationId: '', organizationCount: 0, ...(isProvisionedBuyer(m) ? { organizationId: '' } : {}) };
  }
  for (const b of backoffice) clear[b.alias] = { user_id: '', role_id: '' };
  writeEnvAliasOverride(clear);
  if (residue || catalogResidue || failures.length) { console.error(`TEARDOWN RESIDUE: ${residue + catalogResidue} entity(ies) remain${failures.length ? `; ${failures.join(' | ')}` : ''}`); process.exit(1); }
  log('Teardown complete — zero residue.');
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────

async function main() {
  assertSafeTarget();
  await auth();
  if (!(await moduleInstalled())) {
    // Not an error: the module ships only where it is deployed (vcptcore_qa1, vcst). Nothing is
    // written, so every PUNCHOUT_* alias keeps resolving to "" here — a clear miss, never qa1's ids.
    log(`· VirtoCommerce.Punchout is not installed on ${TEST_ENV} (GET ${MAPPINGS}/new → 404) — punchout fixtures skipped.`);
    return;
  }
  if (TEARDOWN) { await teardown(); return; }
  if (RESET_CARTS) { await resetBuyerCarts(); return; }

  const writeback = {};
  if (ONLY === 'catalog') {
    await seedCatalog(writeback);
    if (!VERIFY_ONLY) writeEnvAliasOverride(writeback);
    if (failures.length) { console.error(`\n${failures.length} problem(s):\n - ${failures.join('\n - ')}`); process.exit(1); }
    log(DRY_RUN ? 'DRY RUN complete (catalog).' : VERIFY_ONLY ? 'Catalog verify complete — all green.' : 'Catalog fixtures complete — all green.');
    return;
  }
  const deployed = DEPLOYED_CONFIGS[TEST_ENV];
  if (deployed) {
    for (const spec of CONFIG_SPECS) {
      const d = deployed.configs[spec.index];
      if (spec.retired) {
        if (d) fail(`${spec.alias} is RETIRED but DEPLOYED_CONFIGS.${TEST_ENV} still declares configuration ${spec.index}`);
        writeback[spec.alias] = { ...retiredOverlayFields(spec), source: deployed.source };
      } else writeback[spec.alias] = { ...configOverlayFields(spec, d), source: deployed.source };
    }
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

  // Catalog fixtures come after the dedicated buyer: their verify reads xAPI as that buyer.
  await seedCatalog(writeback);

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
