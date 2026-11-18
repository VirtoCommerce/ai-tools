#!/usr/bin/env node
/**
 * seed-sales-rep-call.mjs — VCST-6256 "Call a customer" fixtures (vc-module-sales-rep PR #37).
 *
 * Provisions the dedicated rep SR_REP_CALL and the eleven AGENT-TEST-SR-Call-NN orgs it ALONE serves,
 * each with the contacts / org phones / default-address phone its variant needs. The shape and the
 * expected phone list per org live in sales-rep-call-specs.mjs (single source of truth); this file
 * only resolves, creates, heals and verifies.
 *
 * Order matters for V4 (ownerless org): the resolver picks the OLDEST non-rep contact member, so the
 * rep's own contact must be OLDER than the V4 buyer contact, or the fixture stops proving the
 * rep-exclusion branch. The seeder checks the two createdDates on every run and recreates the buyer
 * contact if the rep was (re)created after it.
 *
 * Served-org mechanism is the module's own (same as seed-sales-rep / seed-rep-only-org): the org list
 * in POST/PUT /api/sales-rep; the module creates the granting OrganizationMembership.
 *
 * Runtime GUIDs → aliases.<env>.json (SR_REP_CALL.id/user_id, ORG_SR_CALL_*.id/platform_id/
 * primary_contact_id). Never a GUID in a committed file.
 *
 * Usage:
 *   TEST_ENV=vcptcore npm run seed:sales-rep-call             # seed + live verify as the rep
 *   TEST_ENV=vcptcore npm run seed:sales-rep-call -- --verify-only
 *   TEST_ENV=vcptcore npm run seed:sales-rep-call:teardown    # rep → contacts → orgs, zero residue
 * Flags: --dry-run, --verbose, --teardown, --verify-only, --no-verify.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, BACK_URL, DRY_RUN, TEARDOWN,
  writeEnvAliasOverride, resetSecurityPassword, idsParam, verifyRemoved, ROOT,
} from '../../lib/seed-common.mjs';
import {
  CALL_REP, CALL_ORGS, CALL_PREFIX, CALL_STORE, PAGE_SIZE,
  callShortfalls, expectedPhones, expectedPrimaryContact, expectedPhoneField, normalizePhone, defaultIsStatic,
} from './sales-rep-call-specs.mjs';

const REP_PASSWORD = process.env.SR_REP_PASSWORD || process.env.TEST_USER_PASSWORD || 'Password1!';
const VERIFY_ONLY = process.argv.includes('--verify-only');
const NO_VERIFY = process.argv.includes('--no-verify');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** This env's overlay (runtime ids) — {} when absent. */
function loadOverlay() {
  const p = join(ROOT, `test-data/aliases.${process.env.TEST_ENV || 'vcst'}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}

// ---- lookups -------------------------------------------------------------------------------------

async function searchByKeyword(keyword, memberType) {
  const res = await api('POST', '/api/members/search', { keyword, memberType, take: 100, deep: true });
  return res?.results || [];
}
async function findByName(name, memberType) {
  return (await searchByKeyword(name, memberType)).find((m) => (m.name === name || m.fullName === name) && m.memberType === memberType) || null;
}
async function getMember(id) {
  if (!id) return null;
  const m = await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 404] });
  return m && m.id === id ? m : null;
}
/** Prefer the overlay id (survives index lag), else a name search. */
async function resolveMember(name, memberType, overlayId) {
  const byId = await getMember(overlayId);
  if (byId && (byId.name === name || byId.fullName === name)) return byId;
  const hit = await findByName(name, memberType);
  return hit ? getMember(hit.id) : null;
}
async function findRep() {
  const res = await api('POST', '/api/sales-rep/search', { keyword: CALL_REP.email, take: 20, skip: 0 });
  const mine = (r) => (r.emails || []).some((e) => String(e).toLowerCase() === CALL_REP.email) || r.userName === CALL_REP.email;
  for (const r of res?.results || []) {
    if (mine(r)) return api('GET', `/api/sales-rep/${r.id}`);
    const full = await api('GET', `/api/sales-rep/${r.id}`, null, { expectStatus: [200, 404] });
    if (full && mine(full)) return full;
  }
  const byName = (res?.results || []).length ? null : await api('POST', '/api/sales-rep/search', { keyword: CALL_REP.fullName, take: 20, skip: 0 });
  const hit = (byName?.results || []).find((r) => r.fullName === CALL_REP.fullName);
  return hit ? api('GET', `/api/sales-rep/${hit.id}`) : null;
}
const sameList = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

// ---- seed ----------------------------------------------------------------------------------------

async function ensureOrg(spec, overlayId) {
  let org = await resolveMember(spec.name, 'Organization', overlayId);
  if (!org) {
    const created = await api('POST', '/api/members', {
      memberType: 'Organization', name: spec.name, businessCategory: 'Test Call', status: 'Active',
      phones: spec.orgPhones, addresses: [{ ...spec.address }],
    });
    log(`org created: ${spec.name} (${created?.id})`);
    return DRY_RUN ? created : getMember(created.id);
  }
  const a = (org.addresses || []).find((x) => x.isDefault) || (org.addresses || [])[0];
  const drift = !sameList(org.phones, spec.orgPhones) || !a || (a.phone || '') !== (spec.address.phone || '') || (org.addresses || []).length !== 1;
  if (drift) {
    org.phones = [...spec.orgPhones];
    org.addresses = [{ ...(a || {}), ...spec.address }];
    await api('PUT', '/api/members', org, { expectStatus: [200, 204] });
    org = await getMember(org.id);
    log(`org healed: ${spec.name}`);
  } else verbose(`org ok: ${spec.name}`);
  return org;
}

async function ensureRep(orgs) {
  const served = orgs.map((o) => ({ organizationId: o.id, organizationName: o.name }));
  let rep = await findRep();
  if (!rep) {
    const roles = await api('GET', '/api/sales-rep/roles');
    const role = (roles || []).find((r) => r.name === 'Sales Representative') || (roles || [])[0];
    if (!role) throw new Error('no sales-rep role on this env (GET /api/sales-rep/roles is empty)');
    rep = await api('POST', '/api/sales-rep', {
      firstName: CALL_REP.firstName, lastName: CALL_REP.lastName, fullName: CALL_REP.fullName,
      emails: [CALL_REP.email], storeId: CALL_REP.store, password: REP_PASSWORD,
      roleId: role.id, isLocked: false, organizations: served,
    });
    log(`rep created: ${CALL_REP.aliasName} (${rep?.id}) serving ${served.length} org(s)`);
    if (DRY_RUN) return rep;
    rep = await api('GET', `/api/sales-rep/${rep.id}`);
  } else {
    const want = new Set(served.map((o) => o.organizationId));
    const have = new Set((rep.organizations || []).map((o) => o.organizationId));
    const missing = served.filter((o) => !have.has(o.organizationId));
    const foreign = (rep.organizations || []).filter((o) => !want.has(o.organizationId));
    if (missing.length || foreign.length) {
      // Drop foreign / deleted orgs too: a deleted org left in the list makes the PUT 500 (FK), and a
      // foreign org would add a row to a page that must show exactly these customers.
      rep.organizations = [...(rep.organizations || []).filter((o) => want.has(o.organizationId)), ...missing];
      delete rep.password;
      await api('PUT', '/api/sales-rep', rep, { expectStatus: [200, 204] });
      rep = await api('GET', `/api/sales-rep/${rep.id}`);
      log(`rep healed: +${missing.length} / -${foreign.length} served org(s)`);
    } else log(`rep exists: ${CALL_REP.aliasName} (${rep.id}) serving ${have.size} org(s)`);
    await resetSecurityPassword(api, CALL_REP.email, REP_PASSWORD, { silent: true });
  }
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(CALL_REP.email)}`, null, { expectStatus: [200, 404] });
  if (u?.id && !u.emailConfirmed && !DRY_RUN) { u.emailConfirmed = true; await api('PUT', '/api/platform/security/users', u, { expectStatus: [200, 204] }); }
  // The rep's OWN contact gets a phone (spec: it must never surface as a customer number).
  const contact = await getMember(rep.id);
  if (contact && !sameList(contact.phones, CALL_REP.phones)) {
    contact.phones = [...CALL_REP.phones];
    await api('PUT', '/api/members', contact, { expectStatus: [200, 204] });
    const back = await getMember(rep.id);
    if (!sameList(back?.phones, CALL_REP.phones) || back?.firstName !== CALL_REP.firstName) throw new Error(`rep contact phone write did not stick: ${JSON.stringify(back?.phones)} / name ${back?.firstName}`);
    log(`rep contact phone set: ${CALL_REP.phones.join(', ')}`);
  }
  return { ...rep, userId: u?.id || rep.userId, createdDate: contact?.createdDate };
}

async function createContact(spec, orgId) {
  const [firstName, ...rest] = spec.fullName.replace(CALL_PREFIX, '').split('-');
  const created = await api('POST', '/api/members', {
    memberType: 'Contact', name: spec.fullName, fullName: spec.fullName,
    firstName: `Call${firstName}`, lastName: rest.join('-') || 'Contact',
    phones: spec.phones, emails: [`${spec.fullName.toLowerCase()}@example.com`],
    organizations: [orgId], status: 'Approved',
  });
  log(`  contact created: ${spec.fullName} (${created?.id})`);
  return DRY_RUN ? created : getMember(created.id);
}

async function ensureContact(spec, orgId, overlayId) {
  let c = await resolveMember(spec.fullName, 'Contact', overlayId);
  if (!c) return createContact(spec, orgId);
  let dirty = false;
  if (!sameList(c.phones, spec.phones)) { c.phones = [...spec.phones]; dirty = true; }
  if (!(c.organizations || []).includes(orgId)) { c.organizations = [...(c.organizations || []), orgId]; dirty = true; }
  if (dirty) { await api('PUT', '/api/members', c, { expectStatus: [200, 204] }); c = await getMember(c.id); log(`  contact healed: ${spec.fullName}`); }
  return c;
}

async function setOwner(org, ownerId) {
  const cur = await getMember(org.id);
  if (!cur || (cur.ownerId || null) === (ownerId || null)) return;
  cur.ownerId = ownerId || null;
  await api('PUT', '/api/members', cur, { expectStatus: [200, 204] });
  log(`  owner of ${cur.name} -> ${ownerId || '(none)'}`);
}

async function seed() {
  const short = callShortfalls();
  if (short.length) throw new Error(`spec cannot answer the chain's question:\n  - ${short.join('\n  - ')}`);
  const overlay = loadOverlay();
  const orgs = [];
  for (const spec of CALL_ORGS) orgs.push({ spec, org: await ensureOrg(spec, overlay[spec.aliasName]?.id) });
  const rep = await ensureRep(orgs.map((o) => ({ id: o.org?.id, name: o.spec.name })));
  const writeback = { [CALL_REP.aliasName]: { id: rep?.id || '', user_id: rep?.userId || '' } };
  for (const { spec, org } of orgs) {
    const ids = {};
    for (const cs of spec.contacts) {
      let c = await ensureContact(cs, org.id, overlay[spec.aliasName]?.[`contact_${cs.key}`]);
      // V4: the rep's contact must be OLDER than the non-rep buyer, or the fixture no longer proves
      // that the resolver skips reps (it would pick the buyer for the wrong reason: being oldest).
      if (!DRY_RUN && spec.key === 'V4' && rep?.createdDate && c?.createdDate && Date.parse(c.createdDate) <= Date.parse(rep.createdDate)) {
        log(`  ${cs.fullName} is not younger than the rep contact — recreating it`);
        await api('DELETE', `/api/members?ids=${c.id}`, null, { expectStatus: [200, 204] });
        c = await createContact(cs, org.id);
      }
      ids[cs.key] = c?.id;
    }
    const owner = spec.contacts.find((c) => c.owner);
    if (!DRY_RUN) await setOwner(org, owner ? ids[owner.key] : null);
    const pc = expectedPrimaryContact(spec);
    writeback[spec.aliasName] = {
      id: org?.id || '', platform_id: org?.id || '', primary_contact_id: pc ? (ids[pc.key] || '') : '',
      ...Object.fromEntries(Object.entries(ids).map(([k, v]) => [`contact_${k}`, v || ''])),
    };
  }
  writeEnvAliasOverride(writeback);
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : `Seed complete — ${orgs.length} orgs, rep ${rep?.id}. GUIDs → aliases.<env>.json.`);
}

// ---- teardown (rep → contacts → orgs) --------------------------------------------------------------

async function teardown() {
  const overlay = loadOverlay();
  const rep = await findRep();
  if (rep?.id) {
    // Deleting the rep cascades its account + memberships; do it BEFORE the orgs so no rep record keeps
    // a deleted org (a later PUT of such a rep 500s on the FK).
    await api('DELETE', `/api/sales-rep?ids=${rep.id}`, null, { expectStatus: [200, 204] });
    log(`deleted rep ${CALL_REP.aliasName} (${rep.id})`);
  }
  const ids = new Set();
  for (const spec of CALL_ORGS) {
    const o = overlay[spec.aliasName] || {};
    for (const [k, v] of Object.entries(o)) if ((k === 'id' || k.startsWith('contact_')) && v) ids.add(v);
  }
  for (const m of await searchByKeyword(CALL_PREFIX, 'Contact')) if ((m.name || '').startsWith(CALL_PREFIX)) ids.add(m.id);
  const contactIds = []; const orgIds = [];
  for (const id of ids) {
    const m = await getMember(id);
    if (!m || !String(m.name || '').startsWith(CALL_PREFIX)) continue; // only what this seeder owns
    (m.memberType === 'Contact' ? contactIds : orgIds).push(id);
  }
  for (const m of await searchByKeyword(CALL_PREFIX, 'Organization')) if ((m.name || '').startsWith(CALL_PREFIX) && !orgIds.includes(m.id)) orgIds.push(m.id);
  if (contactIds.length) { await api('DELETE', `/api/members?${idsParam(contactIds)}`, null, { expectStatus: [200, 204] }); log(`deleted ${contactIds.length} contact(s)`); }
  if (orgIds.length) { await api('DELETE', `/api/members?${idsParam(orgIds)}`, null, { expectStatus: [200, 204] }); log(`deleted ${orgIds.length} org(s)`); }
  const blank = { [CALL_REP.aliasName]: { id: '', user_id: '' } };
  for (const spec of CALL_ORGS) blank[spec.aliasName] = { id: '', platform_id: '', primary_contact_id: '', ...Object.fromEntries(spec.contacts.map((c) => [`contact_${c.key}`, ''])) };
  writeEnvAliasOverride(blank);
  const residue = await verifyRemoved(async () => {
    const left = [];
    for (const id of [...contactIds, ...orgIds]) if (await getMember(id)) left.push(id);
    if (await findRep()) left.push('rep');
    const acct = await api('GET', `/api/platform/security/users/${encodeURIComponent(CALL_REP.email)}`, null, { expectStatus: [200, 404] });
    if (acct?.id) left.push('account');
    return left;
  });
  log(residue === 0 ? 'Teardown complete — zero residue.' : `WARN: ${residue} residual entit(ies) — re-run the teardown`);
  if (residue) process.exitCode = 1;
}

// ---- live verify as the rep (scoped xAPI) ----------------------------------------------------------

async function repToken() {
  // BARE password grant + storeId — vcptcore-qa 401s a correct password when client_id/scope are sent.
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: CALL_REP.email, password: REP_PASSWORD, storeId: CALL_STORE }),
  });
  if (!res.ok) throw new Error(`rep token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}
async function gql(token, query, variables) {
  const res = await fetch(`${BACK_URL}/graphql/sales-rep`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors?.length) throw new Error(`GraphQL: ${JSON.stringify(body.errors.map((e) => e.message)).slice(0, 300)}`);
  return body.data;
}
const FIELDS = 'organizationId organizationName phone address { phone } primaryContact { fullName name phones }';
const LIST_Q = `query($storeId:String,$first:Int,$after:String){ salesRepCustomers(storeId:$storeId, first:$first, after:$after){ totalCount items { ${FIELDS} } } }`;
const ONE_Q = `query($id:String!){ salesRepCustomer(organizationId:$id){ ${FIELDS} } }`;

/** What the storefront would build from a GraphQL node — same algorithm as the spec oracle. */
function phonesFromNode(n) {
  const pcName = n.primaryContact?.fullName || n.primaryContact?.name || '';
  const cands = [
    ...(n.primaryContact?.phones || []).map((x) => ({ name: pcName || n.organizationName, number: x })),
    { name: n.organizationName, number: n.phone }, { name: n.organizationName, number: n.address?.phone },
  ];
  const seen = new Set(); const out = [];
  for (const { name, number } of cands) { const s = (number ?? '').trim(); const k = normalizePhone(s); if (!k || seen.has(k)) continue; seen.add(k); out.push({ name, href: `tel:${k}` }); }
  return out;
}

/**
 * Does a node's phone list match the spec? The contact block is compared as a SET (the platform does
 * not keep the written order of a contact's phones — see defaultIsStatic in the spec); everything else
 * in order, and the default must be what the node's own primaryContact.phones[0] / phone says.
 */
function matchesSpec(node, spec) {
  const got = phonesFromNode(node); const want = expectedPhones(spec);
  const key = (p) => `${p.name}|${p.href}`;
  if (!sameList([...got.map(key)].sort(), [...want.map(key)].sort())) return false;
  if (defaultIsStatic(spec)) return sameList(got.map(key), want.map(key)) && (node.phone ?? null) === expectedPhoneField(spec);
  const first = node.primaryContact?.phones?.[0];
  return got[0]?.href === `tel:${normalizePhone(first)}` && node.phone === first;
}

async function verify() {
  if (DRY_RUN) return true;
  const token = await repToken();
  // Member search is ES-indexed: give a just-seeded org/contact a moment to land.
  let page1; let page2; let all;
  for (let i = 0; i < 6; i++) {
    page1 = (await gql(token, LIST_Q, { storeId: CALL_STORE, first: PAGE_SIZE, after: '0' })).salesRepCustomers;
    page2 = (await gql(token, LIST_Q, { storeId: CALL_STORE, first: PAGE_SIZE, after: String(PAGE_SIZE) })).salesRepCustomers;
    all = [...page1.items, ...page2.items];
    const ok = all.length === CALL_ORGS.length && CALL_ORGS.every((s) => {
      const n = all.find((x) => x.organizationName === s.name);
      return n && matchesSpec(n, s);
    });
    if (ok) break;
    log(`  verify: not settled yet (${all.length}/${CALL_ORGS.length} rows) — waiting for the member index`);
    await sleep(10000);
  }
  let bad = 0; const defaults = {};
  log(`salesRepCustomers totalCount=${page1.totalCount}; page1=${page1.items.length} page2=${page2.items.length} (${page2.items.map((x) => x.organizationName).join(', ')})`);
  for (const s of CALL_ORGS) {
    const n = all.find((x) => x.organizationName === s.name);
    const one = n ? (await gql(token, ONE_Q, { id: n.organizationId })).salesRepCustomer : null;
    const want = expectedPhones(s); const gotL = n ? phonesFromNode(n) : []; const gotD = one ? phonesFromNode(one) : [];
    const pcWant = expectedPrimaryContact(s)?.fullName || null;
    const ok = n && one && matchesSpec(n, s) && matchesSpec(one, s)
      && sameList(gotL.map((p) => p.href), gotD.map((p) => p.href))
      && (n.primaryContact?.fullName || null) === pcWant && (one.primaryContact?.fullName || null) === pcWant;
    if (!ok) bad++;
    if (ok) defaults[s.aliasName] = { default_href: gotL[0]?.href || '' };
    log(`${ok ? 'OK  ' : 'FAIL'} ${s.key.padEnd(3)} ${s.aliasName.padEnd(22)} ${n?.organizationId || '(missing)'}`);
    log(`       phone=${JSON.stringify(n?.phone ?? null)} address.phone=${JSON.stringify(n?.address?.phone ?? null)} primaryContact=${n?.primaryContact ? JSON.stringify({ fullName: n.primaryContact.fullName, phones: n.primaryContact.phones }) : 'null'}`);
    log(`       list→ ${gotL.map((p) => `${p.href}[${p.name}]`).join(' , ') || '(none)'}  | detail→ ${gotD.map((p) => p.href).join(' , ') || '(none)'}  | expected ${want.map((p) => p.href).join(' , ') || '(none)'}`);
  }
  // The persisted default per org (the contact-block order is the platform's, so it is observed, not declared).
  writeEnvAliasOverride(defaults);
  log(bad ? `VERIFY FAILED for ${bad} org(s)` : 'VERIFY OK — every variant returns what the spec expects, as list and as detail.');
  return bad === 0;
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) return teardown();
  if (!VERIFY_ONLY) await seed();
  if (!NO_VERIFY && !(await verify())) process.exitCode = 1;
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
