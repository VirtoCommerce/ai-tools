#!/usr/bin/env node
/**
 * seed-sales-rep.mjs — Sales Rep test data (VCST-5293 / VCST-4907 / VCST-5304 / VCST-5308).
 *
 * Seeds the fixtures the scoped xAPI suite `050m-graphql-sales-rep.csv` needs, driven by the
 * vc-module-sales-rep REST API (POST /api/sales-rep) + the customer-module org-membership API
 * + the orders API. Business keys live in test-data/sales-rep/*.csv; runtime platform GUIDs are
 * written to test-data/aliases.<env>.json (never committed into the CSV).
 *
 * The module is deployed on the QA environments (vcst, vcptcore) — run with the matching `TEST_ENV`.
 *
 * Phases (idempotent, look-up-then-create):
 *   1. Owner contact for ACME (distinct from the reps) + enrich ACME org (ownerId, businessCategory, address).
 *   2. 5 sales reps + their served-org memberships (POST /api/sales-rep).
 *   3. Block SR_REP_BLOCKED's account; lock SR_REP_LOCKED's ACME membership.
 *   4. Orders per org across stores + statuses (POST /api/order/customerOrders).
 *   5. Write-back: contact/user/membership/owner GUIDs -> aliases.<env>.json.
 *
 * Flags: --dry-run (reads only), --verbose, --teardown (delete only what this seeder created), --only <rep_key|order_key>.
 */
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv, loadAliases,
  writeEnvAliasOverride, syncEnvAliases, csvBool, DRY_RUN, TEARDOWN, ONLY, STORE_ID, verifyRemoved,
} from '../lib/seed-common.mjs';

const OWNER_NAME = 'AGENT-TEST-SR-Owner-Acme';
const OWNER_PHONE = '+1-206-555-0142';
const REP_PASSWORD = process.env.SR_REP_PASSWORD || process.env.TEST_USER_PASSWORD || 'Password1!';

// ---- helpers ---------------------------------------------------------------

/** b2b/organizations business key (ORG-001) -> { id: platform GUID, name }. */
function orgMap() {
  const map = {};
  for (const r of loadCsv('test-data/b2b/organizations.csv')) {
    map[r.org_id] = { id: r.platform_id, name: r.org_name, businessCategory: r.business_category, city: r.city, region: r.region_name, country: r.country_name, countryCode: r.country_code, line1: r.address_line1, postal: r.postal_code };
  }
  return map;
}

async function findMemberByName(name) {
  const res = await api('POST', '/api/members/search', { keyword: name, take: 20, deep: true });
  const results = res?.results || res?.members || [];
  return results.find((m) => (m.name === name || m.fullName === name)) || null;
}

async function findRepByFullName(fullName) {
  const res = await api('POST', '/api/sales-rep/search', { keyword: fullName, take: 50, skip: 0 });
  const rows = res?.results || res?.salesReps || res?.items || [];
  return rows.find((r) => (r.fullName === fullName || r.name === fullName)) || null;
}

async function resolveSalesRepRoleId() {
  const roles = await api('GET', '/api/sales-rep/roles');
  if (!Array.isArray(roles) || roles.length === 0) return null;
  // Prefer the module's default seeded role name; else the first granting role.
  return (roles.find((r) => r.name === 'Sales Representative') || roles[0]).id;
}

// ---- phase 0: ensure served orgs exist (pinned platform_id, like seedOrgs) --
// The B2B orgs are only partially seeded on vcptcore (the shared seed:b2b path has an
// unrelated auth bug there), so this seeder self-provisions any missing served org with
// its pinned platform GUID rather than depending on that seeder.

async function memberExists(id) {
  const res = await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 404] });
  return res && res.id === id; // VC returns 200 + empty body for a missing member
}

const PAGING_PREFIX = 'AGENT-TEST-SR-Paging-';

/** Resolve a rep's ApplicationUser (login/security-account) id by email — the id GetCurrentUserId()
 *  returns from the JWT, which salesRepOrders/lastOrder match order.CustomerId against (NOT the
 *  Contact/member id). Returns null if the account is missing. */
async function resolveUserId(email) {
  if (!email) return null;
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  return (u && u.id) ? u.id : null;
}

/** Confirm a rep's account email so it can sign in to the storefront UI (idempotent). */
async function confirmRepEmail(email) {
  if (!email || DRY_RUN) return;
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  if (!u || !u.id || u.emailConfirmed) return;
  u.emailConfirmed = true;
  await api('PUT', '/api/platform/security/users', u, { expectStatus: [200, 204] });
  verbose(`emailConfirmed=true for ${email}`);
}

/** Create/resolve N dedicated paging orgs (no orders, no pinned id) served by a paging rep. Idempotent by name. */
async function ensurePagingOrgs(n) {
  const served = [];
  for (let i = 1; i <= n; i++) {
    const name = `${PAGING_PREFIX}${String(i).padStart(2, '0')}`;
    let m = await findMemberByName(name);
    if (!m) {
      const body = {
        memberType: 'Organization', name, businessCategory: 'Test Paging', status: 'Active',
        addresses: [{ addressType: 'Shipping', line1: `${i} Paging St`, city: 'Seattle', regionName: 'WA', countryName: 'United States', countryCode: 'USA', postalCode: '98101', isDefault: true }],
      };
      m = await api('POST', '/api/members', body);
      log(`Paging org created: ${name} (${m?.id})`);
    } else verbose(`paging org exists: ${name}`);
    if (m?.id) served.push({ organizationId: m.id, organizationName: name });
  }
  return served;
}

async function ensureServedOrgs(orgs, repRows) {
  const needed = new Set();
  for (const r of repRows) (r.served_orgs || '').split(';').map((s) => s.trim()).filter(Boolean).filter((k) => !k.startsWith('PAGING:')).forEach((k) => needed.add(k));
  for (const key of needed) {
    const o = orgs[key];
    if (!o) { log(`WARN: org ${key} not in b2b CSV — skip`); continue; }
    if (await memberExists(o.id)) { verbose(`org ${key} exists (${o.id})`); continue; }
    const body = {
      id: o.id, memberType: 'Organization', name: o.name, businessCategory: o.businessCategory || 'Industrial Distribution',
      status: 'Active',
      addresses: [{ addressType: 'Shipping', line1: o.line1 || '1 Main St', city: o.city || 'New York', regionName: o.region || 'New York', countryName: o.country || 'United States', countryCode: o.countryCode || 'USA', postalCode: o.postal || '10001', isDefault: true }],
    };
    const created = await api('POST', '/api/members', body);
    log(`Org created: ${key} (${created?.id || o.id})`);
  }
}

// ---- phase 1: owner contact + ACME enrichment ------------------------------

async function ensureOwnerContact() {
  let existing = await findMemberByName(OWNER_NAME);
  if (existing) { log(`Owner contact exists: ${existing.id}`); return existing.id; }
  const body = {
    memberType: 'Contact', name: OWNER_NAME, fullName: OWNER_NAME, firstName: 'Olivia', lastName: 'Owner',
    phones: [OWNER_PHONE], emails: ['agent-test-sr-owner-acme@example.com'], status: 'Approved',
  };
  const created = await api('POST', '/api/members', body);
  log(`Owner contact created: ${created?.id}`);
  return created?.id;
}

async function enrichAcmeOrg(orgs, ownerId) {
  const acme = orgs['ORG-001'];
  const org = await api('GET', `/api/members/${acme.id}`);
  if (!org) { log('WARN: ACME org not found — skipping enrichment'); return; }
  let dirty = false;
  if (ownerId && org.ownerId !== ownerId) { org.ownerId = ownerId; dirty = true; }
  if (!org.businessCategory) { org.businessCategory = acme.businessCategory || 'Industrial Distribution'; dirty = true; }
  // Ensure a default address with City + RegionName so salesRepCustomer.shipTo formats.
  const addr = (org.addresses || [])[0];
  if (!addr) {
    org.addresses = [{ addressType: 'Shipping', line1: acme.line1 || '1200 Commerce Blvd', city: acme.city || 'New York', regionName: acme.region || 'New York', countryName: acme.country || 'United States', countryCode: acme.countryCode || 'USA', postalCode: acme.postal || '10001', isDefault: true }];
    dirty = true;
  } else if (!addr.regionName || !addr.city) {
    addr.regionName = addr.regionName || acme.region || 'New York';
    addr.city = addr.city || acme.city || 'New York';
    dirty = true;
  }
  if (dirty) { await api('PUT', '/api/members', org); log(`ACME org enriched (owner=${org.ownerId}, cat=${org.businessCategory}, city=${(org.addresses||[])[0]?.city})`); }
  else log('ACME org already enriched');
}

// ---- phase 2/3: reps + memberships + block/lock ----------------------------

async function ensureRep(row, orgs, roleId) {
  const existing = await findRepByFullName(row.full_name);
  let rep;
  if (existing) {
    rep = await api('GET', `/api/sales-rep/${existing.id}`);
    log(`Rep exists: ${row.rep_key} (${rep.id})`);
  } else {
    let served;
    if ((row.served_orgs || '').startsWith('PAGING:')) {
      served = await ensurePagingOrgs(parseInt(row.served_orgs.split(':')[1], 10) || 12);
    } else {
      served = (row.served_orgs || '').split(';').map((s) => s.trim()).filter(Boolean)
        .map((k) => orgs[k] ? { organizationId: orgs[k].id, organizationName: orgs[k].name } : null).filter(Boolean);
    }
    const body = {
      firstName: row.first_name, lastName: row.last_name, fullName: row.full_name,
      emails: [row.email], storeId: row.store, password: REP_PASSWORD,
      roleId, isLocked: csvBool(row.is_locked), organizations: served,
    };
    rep = await api('POST', '/api/sales-rep', body);
    log(`Rep created: ${row.rep_key} (${rep?.id}) serving ${served.length} org(s)`);
  }
  // Confirm the account email so the rep can sign in to the storefront UI (idempotent, all reps).
  await confirmRepEmail(row.email);
  // Per-org membership lock (SR_REP_LOCKED): lock the named org's membership.
  let lockedMembershipId = '';
  if (row.lock_membership_org && orgs[row.lock_membership_org]) {
    const lockOrgId = orgs[row.lock_membership_org].id;
    const m = (rep?.organizations || []).find((o) => o.organizationId === lockOrgId);
    if (m?.membershipId) {
      lockedMembershipId = m.membershipId;
      await api('POST', `/api/customer/organization-memberships/${m.membershipId}/lock`, {}, { expectStatus: [200, 201, 204] });
      log(`  locked membership ${m.membershipId} (${row.lock_membership_org})`);
    } else {
      log(`  WARN: no membership for ${row.lock_membership_org} to lock`);
    }
  }
  return { contactId: rep?.id, userId: rep?.userId, lockedMembershipId };
}

// ---- phase 4: orders -------------------------------------------------------

const ORDER_MARK = 'AGENT-TEST';

/** Build an order address (Shipping|Billing) from the served org's address fields. */
function orderAddress(org, addressType) {
  return {
    addressType,
    firstName: 'AGENT-TEST', lastName: 'Buyer',
    line1: org.line1 || '1 Main St',
    city: org.city || 'New York',
    regionName: org.region || 'New York',
    countryCode: org.countryCode || 'USA', countryName: org.country || 'United States',
    postalCode: org.postal || '10001',
    phone: '+1-206-555-0100', email: 'agent-test-sr-order@example.com',
  };
}

async function ensureOrder(row, orgs, customerId) {
  const org = orgs[row.org];
  if (!org) { log(`  WARN: order ${row.order_key} — org ${row.org} unknown, skip`); return; }
  const number = `${ORDER_MARK}-${row.order_key}`;
  const wantCustomerId = customerId || org.id;
  // Idempotency + self-heal: match by our deterministic number. salesRepOrders/lastOrder match
  // order.CustomerId == the rep's ApplicationUser (login) id, so an order seeded with the wrong
  // id (e.g. the pre-fix Contact id) is deleted and recreated with the correct attribution.
  const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 1 });
  const existing = (found?.results || [])[0];
  if (existing) {
    const full = await api('GET', `/api/order/customerOrders/${existing.id}`);
    const enriched = (full?.addresses || []).length && (full?.shipments || []).length && (full?.inPayments || []).length;
    const totalOk = Math.abs((full?.total || 0) - parseFloat(row.total)) < 0.01;
    if (existing.customerId === wantCustomerId && enriched && totalOk) { verbose(`order ${number} exists (attributed + enriched + total ok)`); return; }
    await api('DELETE', `/api/order/customerOrders?ids=${existing.id}`, null, { expectStatus: [200, 204] });
    log(`  order ${number} rebuilding (customerId ${existing.customerId}->${wantCustomerId}, enriched=${!!enriched}, totalOk=${totalOk})`);
  }
  const n = Math.max(1, parseInt(row.items_count, 10) || 1);
  const price = Math.round((parseFloat(row.total) / n) * 100) / 100;
  const items = Array.from({ length: n }, (_, i) => ({
    sku: `AGENT-TEST-SR-SKU-${i + 1}`, productId: `agent-test-sr-prod-${i + 1}`, catalogId: 'agent-test-sr',
    name: `AGENT-TEST-SR Item ${i + 1}`, quantity: 1, price, productType: 'Physical', currency: 'USD',
  }));
  const total = parseFloat(row.total);
  const shipAddr = orderAddress(org, 'Shipping');
  const billAddr = orderAddress(org, 'Billing');
  // NOTE on totals: the platform's order-total calculator folds shipment.total and inPayment.total
  // back into order.Total, so a non-zero shipment/payment total inflates the order (observed $120→$255).
  // Keep the structural records (address/shipment/payment) but zero their monetary totals so order.Total
  // stays == the CSV total (preserving the salesRepOrders/lastOrder totals verified in 091). The payment's
  // `sum` carries the amount (mirrors a real order: sum=<amount>, total=0).
  const body = {
    number, storeId: row.store, organizationId: org.id, customerId: wantCustomerId,
    customerName: row.customer_name, currency: 'USD', status: row.status,
    total, subTotal: total, shippingTotal: 0, shippingTotalWithTax: 0, taxTotal: 0, items,
    addresses: [shipAddr, billAddr],
    shipments: [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground', currency: 'USD',
      price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'New', number: `${number}-S1`, deliveryAddress: shipAddr, items: [],
    }],
    inPayments: [{
      gatewayCode: 'DefaultManualPaymentMethod', currency: 'USD',
      customerId: wantCustomerId, customerName: row.customer_name, organizationId: org.id,
      sum: total, price: 0, priceWithTax: 0, total: 0, totalWithTax: 0, status: 'New', paymentStatus: 'New',
      number: `${number}-P1`, billingAddress: billAddr,
    }],
  };
  const created = await api('POST', '/api/order/customerOrders', body);
  log(`  order ${number} (${row.status}, ${row.store}, ${n} items) -> ${created?.id || '(created)'}`);
}

// ---- teardown --------------------------------------------------------------

async function teardown(orgs) {
  log('TEARDOWN — deleting only AGENT-TEST-SR fixtures');
  // Orders
  for (const row of loadCsv('test-data/sales-rep/sales-rep-orders.csv')) {
    const number = `${ORDER_MARK}-${row.order_key}`;
    const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
    for (const o of (found?.results || [])) { await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] }); log(`  deleted order ${number}`); }
  }
  // Reps (cascades to account + memberships)
  for (const row of loadCsv('test-data/sales-rep/sales-reps.csv')) {
    const rep = await findRepByFullName(row.full_name);
    if (rep?.id) { await api('DELETE', `/api/sales-rep?ids=${rep.id}`, null, { expectStatus: [200, 204] }); log(`  deleted rep ${row.rep_key}`); }
  }
  // Paging orgs (AGENT-TEST-SR-Paging-NN) created for SR_REP_PAGING
  for (let i = 1; i <= 20; i++) {
    const name = `${PAGING_PREFIX}${String(i).padStart(2, '0')}`;
    const m = await findMemberByName(name);
    if (m?.id) { await api('DELETE', `/api/members?ids=${m.id}`, null, { expectStatus: [200, 204] }); log(`  deleted paging org ${name}`); }
  }
  // Owner contact + ACME de-enrichment (only the owner link)
  const owner = await findMemberByName(OWNER_NAME);
  if (owner?.id) {
    const acme = await api('GET', `/api/members/${orgs['ORG-001'].id}`);
    if (acme && acme.ownerId === owner.id) { acme.ownerId = null; await api('PUT', '/api/members', acme); }
    await api('DELETE', `/api/members?ids=${owner.id}`, null, { expectStatus: [200, 204] });
    log('  deleted owner contact + cleared ACME.ownerId');
  }
  log('Teardown complete.');
}

// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  await auth();
  const orgs = orgMap();

  if (TEARDOWN) { await teardown(orgs); return; }

  const reps = loadCsv('test-data/sales-rep/sales-reps.csv').filter((r) => csvBool(r.seeded, true) && (!ONLY || r.rep_key === ONLY));
  const orders = loadCsv('test-data/sales-rep/sales-rep-orders.csv').filter((r) => csvBool(r.seeded, true) && (!ONLY || r.order_key === ONLY));

  // Phase 0 — ensure every served org exists (self-provision missing ones)
  await ensureServedOrgs(orgs, reps);

  // Phase 1
  const ownerId = await ensureOwnerContact();
  await enrichAcmeOrg(orgs, ownerId);

  // Phase 2/3
  const roleId = await resolveSalesRepRoleId();
  log(`Sales Rep role: ${roleId || '(service default)'}`);
  const repWriteback = {};
  let primaryRepEmail = null;
  for (const row of reps) {
    const { contactId, userId, lockedMembershipId } = await ensureRep(row, orgs, roleId);
    repWriteback[row.rep_key] = { contact_id: contactId || '', user_id: userId || '', membership_locked_id: lockedMembershipId || '' };
    if (row.rep_key === 'SR_REP_PRIMARY') primaryRepEmail = row.email;
  }

  // Phase 4 — orders. salesRepOrders/lastOrder attribute an order to a rep by
  // order.CustomerId == the rep's ApplicationUser (login) id — the value GetCurrentUserId()
  // returns from the JWT — NOT the rep's Contact/member id. Stamp the primary rep's account id
  // so the rep-scoped order queries actually return these orders (VCST-5304/5308).
  const primaryUserId = await resolveUserId(primaryRepEmail);
  if (!primaryUserId) log('WARN: could not resolve SR_REP_PRIMARY ApplicationUser id — orders will not be rep-attributed');
  else verbose(`orders attributed to SR_REP_PRIMARY account id ${primaryUserId}`);
  for (const row of orders) await ensureOrder(row, orgs, primaryUserId);

  // Phase 5 — write-back runtime GUIDs
  syncEnvAliases('sales-rep/sales-reps', repWriteback);
  if (ownerId) writeEnvAliasOverride({ SR_OWNER_ACME: { id: ownerId } });

  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Seed complete. Runtime GUIDs written to aliases.<env>.json.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
