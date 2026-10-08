#!/usr/bin/env node
/**
 * seed-org-returns.mjs — VCST-5884 (returns step 3: "My Organization Returns"). Provisions the
 * organizations, accounts, memberships, dedicated roles and returnable orders declared in
 * org-returns-specs.mjs, plus the TWO returns no case may create or mutate (another organization's
 * submitted return; a legacy store-less admin return). Read the spec module's header first — it says
 * why the organization-level holder needs its own organization and what is deliberately NOT seeded.
 *
 * WRITES ONLY AGENT-TEST- ENTITIES. Roles are PUT-upserted on a PINNED `agent-test-…` id; no
 * pre-existing role is ever edited or granted to (the buyers are ASSIGNED the existing org-employee
 * role, which is not modified). No store setting, notification template or SMTP setting is touched;
 * the Return.* settings of the store are READ and printed so a run can record them.
 *
 * Flags: --dry-run · --verbose · --teardown · --only <PERSONA_KEY|ALIAS> · --fresh (rebuild orders) · --verify (read-only probe)
 * Usage: TEST_ENV=vcst npm run seed:returns:org   ·   TEST_ENV=vcst npm run seed:returns:org:teardown
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, ROOT, BACK_URL, STORE_ID, DRY_RUN, TEARDOWN, ONLY,
  writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts, findOrdersByExactNumber, resetSecurityPassword, idsParam,
} from '../../lib/seed-common.mjs';
import {
  resolveTokens, applyReturnCatalogItems, finalizeReturnOrderBody, buildReturnPhase2Body, diagnoseSeededOrder,
  LINE_ROLE_X, LINE_ROLE_Y, RETURN_WINDOW_DAYS_ASSUMED,
} from './orders-specs.mjs';
import {
  ROLES, ORGS, PERSONAS, FIXTURE_GAPS, OTHER_RETURN, OTHER_RETURN_REF, BASE_ROLE, PASSWORD_VAR, ORDER_TEMPLATE_FIXTURE,
  VIEW_PERMISSION, fullNameOf, emailOf, orgEmailOf, upperVariant, orgOrderNumber, toOrderSpec, shapeOrgOrder,
  expectedCanView, validateOrgReturnsFixtureSet,
} from './org-returns-specs.mjs';

const FRESH = process.argv.includes('--fresh');
const VERIFY_ONLY = process.argv.includes('--verify');
const TEST_ENV = process.env.TEST_ENV || 'vcst';
const template = JSON.parse(readFileSync(join(ROOT, 'test-data', ORDER_TEMPLATE_FIXTURE), 'utf8'));
const roleByKey = Object.fromEntries(ROLES.map((r) => [r.key, r]));
const orgByKey = Object.fromEntries(ORGS.map((o) => [o.key, o]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function overlay() {
  try { return JSON.parse(readFileSync(join(ROOT, `test-data/aliases.${TEST_ENV}.json`), 'utf8')); } catch { return {}; }
}

/* ── storefront identity ─────────────────────────────────────────────────────────────────────── */

async function tokenFor(login, password, organizationId = null) {
  const body = { grant_type: 'password', username: login, password, scope: 'offline_access', storeId: STORE_ID };
  if (organizationId) body.organization_id = organizationId;
  const res = await fetch(`${BACK_URL}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: (() => { try { const j = JSON.parse(text); return j.error_description || j.error; } catch { return text.slice(0, 120); } })() };
  const token = JSON.parse(text).access_token;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const perms = [].concat(claims.permission || []);
  return { ok: true, token, organizationId: claims.organization_id || claims.organizationId || null, permissions: perms };
}

async function gql(query, variables, token) {
  const res = await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }) });
  return res.json();
}

/* ── roles ───────────────────────────────────────────────────────────────────────────────────── */

// The roles SEARCH returns every role with an EMPTY permissions[] and GET /roles/{id} answers 204, so
// both read paths look like "no permissions" (measured on vcst 2026-10-08). GET /roles/{NAME} is the one
// that returns them — existence via search, content via the by-name GET.
async function findRoleById(id, name) {
  const r = await api('POST', '/api/platform/security/roles/search', { keyword: name, take: 50 });
  const hit = (r?.results || []).find((x) => x.id === id || x.name === name);
  if (!hit) return null;
  const full = await api('GET', `/api/platform/security/roles/${encodeURIComponent(hit.name)}`, null, { expectStatus: [200, 204, 404] });
  return full?.id ? full : hit;
}

async function ensureRole(spec) {
  const live = await findRoleById(spec.id, spec.name);
  if (live && (live.id !== spec.id || !String(live.name).startsWith('AGENT-TEST-'))) {
    throw new Error(`role "${spec.name}" resolves to ${live.id} (${live.name}) — not this seeder's pinned AGENT-TEST role; refusing to write`);
  }
  const want = [...spec.permissions].sort();
  const have = (live?.permissions || []).map((p) => p.name).sort();
  if (live && JSON.stringify(want) === JSON.stringify(have)) { verbose(`reuse role ${spec.id}`); return; }
  await api('PUT', '/api/platform/security/roles', { id: spec.id, name: spec.name, permissions: spec.permissions.map((name) => ({ name })) }, { expectStatus: [200, 201, 204] });
  log(`  ${live ? '↻ reconcile' : '✓ create'} role ${spec.id} [${want.join(', ')}]`);
  if (DRY_RUN) return;
  const back = await findRoleById(spec.id, spec.name);
  const got = (back?.permissions || []).map((p) => p.name).sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`role ${spec.id} read back with [${got}] != [${want}]`);
}

const roleRef = (k) => (k === 'BASE' ? { roleId: BASE_ROLE.id, roleName: BASE_ROLE.name } : { roleId: roleByKey[k].id, roleName: roleByKey[k].name });

/* ── organizations ───────────────────────────────────────────────────────────────────────────── */

async function findOrg(spec, knownId) {
  if (knownId) {
    const byId = await api('GET', `/api/organizations/${knownId}`, null, { expectStatus: [200, 204, 404] }).catch(() => null);
    if (byId?.id && byId.name === spec.name) return byId;
  }
  const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: spec.name, take: 20 });
  const hit = (r?.results || []).find((x) => x.name === spec.name);
  return hit ? api('GET', `/api/organizations/${hit.id}`) : null;
}

async function ensureOrg(spec, knownId) {
  const email = orgEmailOf(spec);
  let org = await findOrg(spec, knownId);
  if (!org) {
    const created = await api('POST', '/api/members', {
      memberType: 'Organization', name: spec.name, emails: email ? [email] : [], status: 'Approved',
      description: `AGENT-TEST VCST-5884 organization returns fixture (${spec.key})`,
    });
    log(`  ✓ create org ${spec.name} (${created?.id})`);
    if (DRY_RUN) return { id: `dry-${spec.key}`, name: spec.name };
    org = await api('GET', `/api/organizations/${created.id}`);
  }
  const wantRoles = spec.orgRoles.map((k) => ({ organizationId: org.id, ...roleRef(k) }));
  const haveRoleIds = (org.roles || []).map((r) => r.roleId).sort();
  const wantEmails = email ? [email] : [];
  const dirty = JSON.stringify(haveRoleIds) !== JSON.stringify(wantRoles.map((r) => r.roleId).sort())
    || JSON.stringify(org.emails || []) !== JSON.stringify(wantEmails);
  if (dirty) {
    await api('PUT', '/api/organizations', { ...org, emails: wantEmails, roles: wantRoles }, { expectStatus: [200, 204] });
    log(`  ↻ org ${spec.name}: emails [${wantEmails}] org-level roles [${wantRoles.map((r) => r.roleId)}]`);
    if (!DRY_RUN) {
      const back = await api('GET', `/api/organizations/${org.id}`);
      if (JSON.stringify((back.roles || []).map((r) => r.roleId).sort()) !== JSON.stringify(wantRoles.map((r) => r.roleId).sort())) throw new Error(`org ${spec.name}: org-level roles did not take (${JSON.stringify(back.roles)})`);
      if (JSON.stringify(back.emails || []) !== JSON.stringify(wantEmails)) throw new Error(`org ${spec.name}: emails did not take (${JSON.stringify(back.emails)})`);
      org = back;
    }
  } else verbose(`reuse org ${spec.name}`);
  return org;
}

/* ── accounts, contacts, memberships ─────────────────────────────────────────────────────────── */

async function findUser(login) {
  const s = await api('POST', '/api/platform/security/users/search', { keyword: login, take: 10 });
  const hit = (s?.results || []).find((u) => (u.userName || '').toLowerCase() === login.toLowerCase());
  return hit?.id ? api('GET', `/api/platform/security/users/id/${hit.id}`, null, { expectStatus: [200, 204, 404] }).catch(() => hit).then((u) => u?.id ? u : hit) : null;
}

async function ensureContact(p, orgIds, user) {
  const fullName = fullNameOf(p);
  const email = emailOf(p);
  let c = user?.memberId ? await api('GET', `/api/contacts/${user.memberId}`, null, { expectStatus: [200, 204, 404] }).catch(() => null) : null;
  if (!c?.id) {
    const r = await api('POST', '/api/members/search', { memberType: 'Contact', keyword: p.lastName === 'AgentTest' ? fullName : p.lastName, take: 20 });
    c = (r?.results || []).find((x) => x.fullName === fullName && (x.emails || []).map((e) => e.toLowerCase()).join() === (email ? email.toLowerCase() : ''));
    if (c?.id) c = await api('GET', `/api/contacts/${c.id}`);
  }
  if (!c?.id) {
    const created = await api('POST', '/api/members', {
      memberType: 'Contact', firstName: p.firstName, lastName: p.lastName, fullName, name: fullName,
      emails: email ? [email] : [], organizations: orgIds, status: 'Approved', defaultLanguage: 'en-US', currencyCode: 'USD', timeZone: 'America/New_York',
    });
    log(`  ✓ create contact ${fullName} (${created?.id})`);
    return created?.id;
  }
  const orgs = new Set(c.organizations || []);
  const missing = orgIds.filter((id) => !orgs.has(id));
  const emailsOk = JSON.stringify((c.emails || []).map((e) => e.toLowerCase())) === JSON.stringify(email ? [email.toLowerCase()] : []);
  if (missing.length || c.fullName !== fullName || !emailsOk || c.status !== 'Approved') {
    await api('PUT', '/api/members', { ...c, organizations: [...orgs, ...missing], fullName, name: fullName, firstName: p.firstName, lastName: p.lastName, emails: email ? [email] : [], status: 'Approved' }, { expectStatus: [200, 204] });
    log(`  ↻ contact ${fullName}: +${missing.length} org(s)${emailsOk ? '' : ', emails'}`);
  }
  return c.id;
}

async function ensureUser(p, contactId, password) {
  const email = emailOf(p);
  const roles = p.globalRoles.map((k) => ({ id: roleByKey[k].id, name: roleByKey[k].name }));
  let u = await findUser(p.login);
  if (!u) {
    // users/create refuses an account without an email ("Email '' is invalid.", vcst 2026-10-08), so an
    // email-less persona is created WITH a placeholder and the email is removed by the update below —
    // if the platform refuses that too, the persona reports FIXTURE-GAP rather than pretending.
    const body = {
      userName: p.login, password, memberId: contactId, storeId: STORE_ID, userType: 'Customer', isAdministrator: false,
      status: 'Approved', emailConfirmed: true, lockoutEnabled: false, roles,
      email: email || `${p.login}@yopmail.com`,
    };
    const res = await api('POST', '/api/platform/security/users/create', body);
    if (res && res.succeeded === false) throw new Error(`users/create ${p.login}: ${JSON.stringify(res.errors)}`);
    if (DRY_RUN) return `dry-user-${p.key}`;
    u = await findUser(p.login);
    if (!u?.id) throw new Error(`created ${p.login} but cannot read it back`);
    log(`  ✓ create account ${p.login} (${u.id})${roles.length ? ` global roles [${roles.map((r) => r.id)}]` : ''}`);
  }
  const haveRoles = (u.roles || []).map((r) => r.id).sort();
  const dirty = u.memberId !== contactId || u.isAdministrator || JSON.stringify(haveRoles) !== JSON.stringify(roles.map((r) => r.id).sort())
    || (u.email || null) !== (email || null) || u.status !== 'Approved';
  if (dirty && !DRY_RUN) {
    // Our own AGENT-TEST account: the global roles are REPLACED by exactly the spec's.
    const res = await api('PUT', '/api/platform/security/users', { ...u, memberId: contactId, isAdministrator: false, roles, email: email || null, status: 'Approved' }, { expectStatus: [200, 204, 400] }).catch((e) => ({ succeeded: false, errors: [e.message] }));
    if (res && res.succeeded === false) {
      if (!p.noEmail) throw new Error(`update ${p.login}: ${JSON.stringify(res.errors).slice(0, 200)}`);
      verbose(`update ${p.login} refused: ${JSON.stringify(res.errors).slice(0, 200)}`);
    }
    log(`  ↻ account ${p.login}: memberId/roles/email/status reconciled`);
    if (p.noEmail) {
      const back = await findUser(p.login);
      if (back?.email) { p._gap = `the platform keeps an email on the account (${back.email}) — an email-less storefront buyer cannot be provisioned`; log(`  ⚠ FIXTURE-GAP ${p.alias}: ${p._gap}`); }
    }
  }
  const end = u.lockoutEnd ? new Date(u.lockoutEnd).getTime() : 0;
  if (end > Date.now() && !DRY_RUN) {
    await api('POST', `/api/platform/security/users/${u.id}/unlock`, {}, { expectStatus: [200, 201, 204] });
    log(`  ↻ account ${p.login}: cleared a stale ACCOUNT lockout (the membership lock is a different axis)`);
  }
  return u.id;
}

async function ensureMemberships(p, userId, orgIdByKey) {
  const live = DRY_RUN && String(userId).startsWith('dry-') ? [] : ((await api('POST', '/api/customer/organization-memberships/search', { userId, take: 50 }))?.results || []);
  const out = {};
  for (const spec of p.memberships) {
    const orgId = orgIdByKey[spec.org];
    const roles = spec.roles.map(roleRef);
    let mem = live.find((x) => x.organizationId === orgId);
    const sameRoles = mem && JSON.stringify((mem.roles || []).map((r) => r.roleId).sort()) === JSON.stringify(roles.map((r) => r.roleId).sort());
    if (!mem) {
      mem = await api('POST', '/api/customer/organization-memberships', { userId, organizationId: orgId, organizationName: orgByKey[spec.org].name, roles, status: spec.status, isLocked: false });
      log(`  ✓ membership ${p.login} → ${orgByKey[spec.org].name} roles [${roles.map((r) => r.roleId)}] status ${spec.status}`);
    } else if (!sameRoles || (mem.status || null) !== spec.status) {
      await api('PUT', `/api/customer/organization-memberships/${mem.id}`, { ...mem, roles, status: spec.status }, { expectStatus: [200, 204] });
      log(`  ↻ membership ${p.login} → ${orgByKey[spec.org].name}: roles [${roles.map((r) => r.roleId)}] status ${spec.status}`);
    }
    const id = mem?.id;
    if (!DRY_RUN && id) {
      let cur = await api('GET', `/api/customer/organization-memberships/${id}`);
      if (spec.locked && !cur.isCurrentlyLocked) {
        await api('POST', `/api/customer/organization-memberships/${id}/lock`, { lockoutEnd: null }, { expectStatus: [200, 201, 204] });
        log(`  ✓ lock membership ${p.login} → ${orgByKey[spec.org].name} (permanent)`);
      } else if (!spec.locked && cur.isLocked) {
        await api('POST', `/api/customer/organization-memberships/${id}/unlock`, null, { expectStatus: [200, 201, 204] });
        log(`  ↻ unlock membership ${p.login} → ${orgByKey[spec.org].name}`);
      }
      cur = await api('GET', `/api/customer/organization-memberships/${id}`);
      const got = { roles: (cur.roles || []).map((r) => r.roleId).sort(), status: cur.status ?? null, locked: !!cur.isCurrentlyLocked };
      const want = { roles: roles.map((r) => r.roleId).sort(), status: spec.status, locked: spec.locked };
      if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`membership ${p.login} → ${spec.org} read back ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    }
    out[spec.org] = id;
  }
  return out;
}

/* ── orders + the two seeded returns ─────────────────────────────────────────────────────────── */

async function returnsOnOrder(orderId) {
  const r = await api('POST', '/api/return/search', { orderId, take: 100 });
  return (r?.results || []).filter((x) => x.orderId === orderId);
}

async function deleteOrderTree(order) {
  const rets = await returnsOnOrder(order.id);
  if (rets.length) await api('DELETE', `/api/return?${idsParam(rets.map((r) => r.id))}`, null, { expectStatus: [200, 204] });
  await api('DELETE', `/api/order/customerOrders?ids=${order.id}`, null, { expectStatus: [200, 204] });
  return rets.length;
}

async function ensureOrder(key, owner, org, ctx) {
  const spec = toOrderSpec(key);
  const number = orgOrderNumber(key);
  const hits = await findOrdersByExactNumber(api, number);
  for (const extra of hits.slice(1)) { await deleteOrderTree(extra); log(`  ✗ duplicate ${number} (${extra.id}) removed`); }
  let order = hits[0] ? await api('GET', `/api/order/customerOrders/${hits[0].id}`) : null;
  if (order) {
    const d = diagnoseSeededOrder(spec, order, ctx.rolesBySku, { windowDays: ctx.windowDays, now: ctx.now, ownerId: owner.customerId });
    const drift = [...d.problems];
    if (order.organizationId !== org.id) drift.push(`organizationId ${order.organizationId} != ${org.id}`);
    if (!drift.length && !FRESH) { verbose(`reuse ${number}`); return { order, rebuilt: false }; }
    const n = await deleteOrderTree(order);
    log(`  ${number} rebuilding — ${FRESH ? '--fresh' : drift[0]} (removed ${n} return(s) on it)`);
  }
  const { obj, unresolved } = resolveTokens(template, process.env);
  if (unresolved.length) throw new Error(`${number}: unresolved env token(s) ${unresolved.join(', ')}`);
  const shaped = applyReturnCatalogItems(shapeOrgOrder(obj, key, owner), ctx.productsByRole);
  const body = finalizeReturnOrderBody(spec, shaped, { customerId: owner?.customerId, customerName: owner?.customerName, organizationId: org.id, organizationName: org.name }, ctx.now);
  const created = await api('POST', '/api/order/customerOrders', body);
  if (DRY_RUN) { log(`  [DRY] would create ${number}`); return { order: null, rebuilt: true }; }
  const full = await api('GET', `/api/order/customerOrders/${created.id}`);
  await api('PUT', '/api/order/customerOrders', buildReturnPhase2Body(spec, full, ctx.rolesBySku, ctx.now), { expectStatus: [200, 204] });
  order = await api('GET', `/api/order/customerOrders/${created.id}`);
  const d = diagnoseSeededOrder(spec, order, ctx.rolesBySku, { windowDays: ctx.windowDays, now: ctx.now, ownerId: owner.customerId });
  if (!d.ok) throw new Error(`${number} POSTed but did NOT take: ${d.problems.join('; ')}`);
  if (order.organizationId !== org.id) throw new Error(`${number}: organizationId ${order.organizationId} != ${org.id}`);
  log(`  ✓ order ${number} (${order.id}) for ${owner.customerName} in ${org.name}`);
  return { order, rebuilt: true };
}

const lineMaps = (order, rolesBySku) => {
  const byRole = {};
  for (const li of order?.items || []) { const r = rolesBySku[li.sku]; if (r) byRole[r] = li; }
  return byRole;
};

async function ensureOtherReturn(order, buyer, password, ctx) {
  const live = await returnsOnOrder(order.id);
  const mine = live.filter((r) => r.customerReference === OTHER_RETURN_REF);
  const keep = mine.find((r) => r.status !== 'Draft');
  if (keep && mine.length === 1) { verbose(`reuse ${keep.number} (${keep.status})`); return keep; }
  if (mine.length) await api('DELETE', `/api/return?${idsParam(mine.map((r) => r.id))}`, null, { expectStatus: [200, 204] });
  if (DRY_RUN) { log('  [DRY] would submit the other organization\'s return'); return null; }
  const t = await tokenFor(buyer.login, password, ctx.orgIdByKey.OTHER);
  if (!t.ok) throw new Error(`${buyer.login} cannot sign in to submit ${OTHER_RETURN.alias}: ${t.status} ${t.error}`);
  const byRole = lineMaps(order, ctx.rolesBySku);
  const items = Object.entries(OTHER_RETURN.requested).map(([role, quantity]) => ({
    orderLineItemId: byRole[role].id, quantity, reasonCode: ctx.reason.code, ...(ctx.reason.requiresComment ? { reasonComment: 'AGENT-TEST other-org return' } : {}),
  }));
  const F = 'id number status';
  const c = await gql(`mutation($c:CreateReturnCommandType!){ createReturn(command:$c){ ${F} } }`, { c: { orderId: order.id, customerReference: OTHER_RETURN_REF, customerComment: 'AGENT-TEST VCST-5884 other organization', items } }, t.token);
  if (c.errors?.length || !c.data?.createReturn?.id) throw new Error(`createReturn (other org): ${JSON.stringify(c.errors || c.data).slice(0, 300)}`);
  const s = await gql(`mutation($c:SubmitReturnCommandType!){ submitReturn(command:$c){ ${F} } }`, { c: { returnId: c.data.createReturn.id } }, t.token);
  if (s.errors?.length) throw new Error(`submitReturn (other org): ${JSON.stringify(s.errors).slice(0, 300)}`);
  const r = await api('GET', `/api/return/${c.data.createReturn.id}`);
  log(`  ✓ other-org return ${r.number} (${r.status}) in ${r.organizationName}`);
  return r;
}

/* ── verification: what the token actually carries ───────────────────────────────────────────── */

async function verifyPersonas(password, orgIdByKey, personas) {
  log('\nSign-in read-back (POST /connect/token, storeId + organization_id) — permission claims per organization:');
  const rows = [];
  for (const p of personas) {
    const plain = await tokenFor(p.login, password);
    rows.push(`  ${p.alias.padEnd(28)} (no org)          → ${plain.ok ? `200 org=${plain.organizationId ?? '-'} return-perms=[${plain.permissions.filter((x) => x.includes(':return:')).join(',')}] total=${plain.permissions.length}` : `${plain.status} ${plain.error}`}`);
    for (const mm of p.memberships) {
      const t = await tokenFor(p.login, password, orgIdByKey[mm.org]);
      const has = t.ok && t.permissions.includes(VIEW_PERMISSION);
      rows.push(`  ${p.alias.padEnd(28)} org ${mm.org.padEnd(13)} → ${t.ok ? `200 return-perms=[${t.permissions.filter((x) => x.includes(':return:')).join(',')}] total=${t.permissions.length}` : `${t.status} ${t.error}`}  (spec: server gate ${expectedCanView(p, mm.org) ? 'OPEN' : 'CLOSED'}${t.ok && has !== expectedCanView(p, mm.org) ? ' — token and gate DISAGREE' : ''})`);
    }
  }
  rows.forEach((r) => console.log(r));
}

/* ── teardown ────────────────────────────────────────────────────────────────────────────────── */

async function teardown(personas) {
  log(`TEARDOWN — ${personas.length} persona(s)${ONLY ? ` (--only ${ONLY})` : ''}, their orders/returns${ONLY ? '' : ', every return snapshotting a seeded organization, the organizations and the two roles'}`);
  const idsBefore = Object.fromEntries(ORGS.map((o) => [o.alias, overlay()[o.alias]?.id]));
  const orderKeys = personas.filter((p) => p.order).map((p) => p.key);
  for (const k of orderKeys) for (const o of await findOrdersByExactNumber(api, orgOrderNumber(k))) log(`  ✗ ${o.number} + ${await deleteOrderTree(o)} return(s)`);
  // Order-less returns (the legacy shape, or anything a case left) still snapshot one of OUR
  // organizations — every return whose organizationId is an AGENT-TEST org of this seeder is ours.
  const orgReturns = async () => {
    const out = [];
    for (const o of ORGS) {
      const id = overlay()[o.alias]?.id;
      if (id) out.push(...(((await api('POST', '/api/return/search', { organizationId: id, take: 100 }))?.results || []).filter((r) => r.organizationId === id)));
    }
    return out;
  };
  if (!ONLY) {
    const left = await orgReturns();
    if (left.length) { await api('DELETE', `/api/return?${idsParam(left.map((r) => r.id))}`, null, { expectStatus: [200, 204] }); log(`  ✗ ${left.length} order-less return(s) in the seeded organizations (${left.map((r) => r.number).join(', ')})`); }
  }
  for (const p of personas) {
    const u = await findUser(p.login);
    if (u?.id) {
      const mems = (await api('POST', '/api/customer/organization-memberships/search', { userId: u.id, take: 50 }))?.results || [];
      if (mems.length) await api('DELETE', `/api/customer/organization-memberships?${idsParam(mems.map((x) => x.id))}`, null, { expectStatus: [200, 204, 404] });
      await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(u.userName)}`, null, { expectStatus: [200, 204, 404] });
      if (u.memberId) await api('DELETE', `/api/members?ids=${encodeURIComponent(u.memberId)}`, null, { expectStatus: [200, 204, 404] });
      log(`  ✗ ${p.login} (account, contact, ${mems.length} membership(s))`);
    }
  }
  if (!ONLY) {
    for (const o of ORGS) {
      const org = await findOrg(o, overlay()[o.alias]?.id);
      if (org?.id && org.name.startsWith('AGENT-TEST-')) { await api('DELETE', `/api/members?ids=${org.id}`, null, { expectStatus: [200, 204, 404] }); log(`  ✗ org ${o.name}`); }
    }
    for (const r of ROLES) {
      const live = await findRoleById(r.id, r.name);
      if (live?.id === r.id) { await api('DELETE', `/api/platform/security/roles?ids=${encodeURIComponent(r.id)}`, null, { expectStatus: [200, 204, 404] }); log(`  ✗ role ${r.id}`); }
    }
  }
  if (DRY_RUN) { log('DRY RUN teardown complete (no writes).'); return; }
  await sleep(1500);
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const k of orderKeys) n += (await findOrdersByExactNumber(api, orgOrderNumber(k))).length;
    for (const p of personas) n += (await findUser(p.login)) ? 1 : 0;
    if (!ONLY) {
      n += (await orgReturns()).length;
      // By id (index-independent) AND by name (catches a duplicate created while the overlay was stale).
      for (const o of ORGS) {
        const id = idsBefore[o.alias];
        if (id && (await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 204, 404] }).catch(() => null))?.id) n += 1;
        n += (await api('POST', '/api/members/search', { memberType: 'Organization', keyword: o.name, take: 5 }))?.results?.filter((x) => x.name === o.name && x.id !== id).length || 0;
      }
      for (const r of ROLES) n += (await findRoleById(r.id, r.name))?.id === r.id ? 1 : 0;
    }
    return n;
  });
  if (residue) { log(`⚠ ${residue} entity(ies) still present after teardown`); process.exitCode = 1; } else log('Teardown complete — zero residue.');
}

/* ── main ────────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  const v = validateOrgReturnsFixtureSet({ sharedRoleIds: [BASE_ROLE.id] });
  if (!v.ok) throw new Error(`spec is not discriminating — ${v.problems.join('; ')}`);
  await auth();
  const password = process.env[PASSWORD_VAR];
  if (!password) throw new Error(`${PASSWORD_VAR} is unset in the layered env — refusing to create accounts with a fallback password`);
  const personas = PERSONAS.filter((p) => !ONLY || p.key === ONLY || p.alias === ONLY);
  if (ONLY && !personas.length && ONLY !== OTHER_RETURN.alias) throw new Error(`--only ${ONLY} matches no persona`);
  if (TEARDOWN) { await teardown(personas); return; }

  const store = await api('GET', `/api/stores/${STORE_ID}`);
  const setting = (n) => { const s = (store.settings || []).find((x) => x.name === n); return s ? (s.value ?? s.defaultValue) : undefined; };
  log(`Store ${STORE_ID} (read only): Return.ReturnEnabled=${setting('Return.ReturnEnabled')} · Return.NotifyOrganizationEmail=${setting('Return.NotifyOrganizationEmail')} · Return.SendNotifications=${setting('Return.SendNotifications')} · Return.AllowedOrderStatuses=${JSON.stringify(setting('Return.AllowedOrderStatuses'))} · Return.WindowDays=${setting('Return.WindowDays')}`);
  if (VERIFY_ONLY) {
    const ov = overlay();
    const orgIdByKey = Object.fromEntries(ORGS.map((o) => [o.key, ov[o.alias]?.id]));
    await verifyPersonas(password, orgIdByKey, personas);
    return;
  }
  if (setting('Return.ReturnEnabled') !== true) throw new Error(`returns are disabled on ${STORE_ID}`);
  const windowDays = Number(setting('Return.WindowDays')) || RETURN_WINDOW_DAYS_ASSUMED;

  for (const r of ROLES) await ensureRole(r);
  const ov = overlay();
  const orgs = {};
  for (const o of ORGS) orgs[o.key] = await ensureOrg(o, ov[o.alias]?.id);
  const orgIdByKey = Object.fromEntries(Object.entries(orgs).map(([k, o]) => [k, o.id]));

  const products = await discoverCatalogProducts(api, 2);
  if (products.length < 2 && !DRY_RUN) throw new Error('the orders need 2 distinct catalog products');
  const productsByRole = { [LINE_ROLE_X]: products[0], [LINE_ROLE_Y]: products[1] };
  const rolesBySku = {};
  for (const [role, p] of Object.entries(productsByRole)) if (p?.sku) rolesBySku[p.sku] = role;
  const now = new Date();
  const ctx = { productsByRole, rolesBySku, windowDays, now, orgIdByKey };

  const writeback = {};
  for (const o of ORGS) writeback[o.alias] = { id: orgs[o.key].id };
  const ids = {};
  for (const p of personas) {
    log(`\n${p.alias} — ${p.login}`);
    const orgIds = p.memberships.map((x) => orgIdByKey[x.org]);
    const existing = await findUser(p.login);
    const contactId = await ensureContact(p, orgIds, existing);
    const userId = await ensureUser(p, contactId, password);
    const memberships = await ensureMemberships(p, userId, orgIdByKey);
    // Credential: verify by signing in; reset only when the declared password does not work.
    if (!DRY_RUN) {
      const t = await tokenFor(p.login, password);
      if (!t.ok && /invalid|password|credential/i.test(String(t.error))) { await resetSecurityPassword(api, p.login, password); log(`  ↻ password reconciled for ${p.login}`); }
    }
    const rec = { userId, contactId };
    const home = p.memberships[p.memberships.length === 1 ? 0 : 1];
    rec.organizationId = orgIdByKey[home.org]; rec.membershipId = memberships[home.org];
    if (p.key === 'MULTI') Object.assign(rec, { org_x_id: orgIdByKey.HOME, org_y_id: orgIdByKey.VIEWER, org_x_membership_id: memberships.HOME, org_y_membership_id: memberships.VIEWER });
    if (p.order) {
      const owner = { customerId: userId, customerName: fullNameOf(p), email: emailOf(p) };
      const { order, rebuilt } = await ensureOrder(p.key, owner, orgs[p.order], ctx);
      if (order) {
        const byRole = lineMaps(order, rolesBySku);
        Object.assign(rec, {
          orderId: order.id, orderNumber: order.number, orderOrganizationId: order.organizationId,
          lineAItemId: byRole[LINE_ROLE_X]?.id, lineASku: byRole[LINE_ROLE_X]?.sku, lineAOrderedQuantity: byRole[LINE_ROLE_X]?.quantity,
          lineBItemId: byRole[LINE_ROLE_Y]?.id, lineBSku: byRole[LINE_ROLE_Y]?.sku, lineBOrderedQuantity: byRole[LINE_ROLE_Y]?.quantity,
          ...(rebuilt ? { seededAt: now.toISOString() } : {}),
        });
        ids[p.key] = { order, login: p.login };
      }
    }
    writeback[p.alias] = rec;
  }

  for (const g of FIXTURE_GAPS) log(`
⚠ FIXTURE-GAP ${g.alias}: ${g.reason}`);
  if ((!ONLY || ONLY === OTHER_RETURN.alias || ONLY === 'OTHER_BUYER') && ids.OTHER_BUYER) {
    log(`\n${OTHER_RETURN.alias}`);
    const pol = await (async () => { const t = await tokenFor(ids.OTHER_BUYER.login, password, orgIdByKey.OTHER); return t.ok ? (await gql('query($s:String!){ returnReasons(storeId:$s){ code requiresComment } }', { s: STORE_ID }, t.token))?.data : null; })();
    const reason = (pol?.returnReasons || [])[0];
    if (!reason) throw new Error('returnReasons is empty — cannot submit the other-org return');
    const r = await ensureOtherReturn(ids.OTHER_BUYER.order, PERSONAS.find((p) => p.key === 'OTHER_BUYER'), password, { ...ctx, reason });
    if (r) writeback[OTHER_RETURN.alias] = { id: r.id, number: r.number, status: r.status, orderId: ids.OTHER_BUYER.order.id, orderNumber: ids.OTHER_BUYER.order.number, organizationId: r.organizationId };
  }

  if (!DRY_RUN) {
    writeEnvAliasOverride(writeback);
    await verifyPersonas(password, orgIdByKey, personas);
  }
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : `\nOrg-returns seed complete — ${Object.keys(writeback).length} alias(es) written to aliases.${TEST_ENV}.json.`);
  log(`Same-address variant (for the case to write onto ${orgByKey.SAME_ADDRESS.alias}, an AGENT-TEST org): ${upperVariant(orgEmailOf(orgByKey.SAME_ADDRESS))}`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
