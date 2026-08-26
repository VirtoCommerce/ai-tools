#!/usr/bin/env node
/**
 * seed-sales-rep.mjs — Sales Rep test data (VCST-5293 / VCST-4907 / VCST-5304 / VCST-5308).
 *
 * Seeds the fixtures the scoped xAPI suite `050m-graphql-sales-rep.csv` needs, driven by the
 * vc-module-sales-rep REST API (POST /api/sales-rep) + the customer-module org-membership API
 * + the orders API. Business keys live in test-data/sales-rep/*.csv; runtime platform GUIDs are
 * written to test-data/aliases.<env>.json (never committed into the CSV).
 * NOTE: aliases.<env>.json is a COMMITTED shared overlay — after a reseed that changes rep GUIDs,
 * re-commit it so teammates/CI resolve the same @td(SR_REP_*.id) values. A stale overlay resolves
 * to deleted/old entities. (Order GUIDs are NOT written to the overlay — orders resolve by number.)
 *
 * The module is deployed on the QA environments (vcst, vcptcore) — run with the matching `TEST_ENV`.
 *
 * Phases (idempotent, look-up-then-create):
 *   1. Owner contact for ACME (distinct from the reps) + enrich ACME org (ownerId, businessCategory, address).
 *   2. 5 sales reps + their served-org memberships (POST /api/sales-rep).
 *   3. Block SR_REP_BLOCKED's account; lock SR_REP_LOCKED's ACME membership;
 *      wipe the DISPOSABLE-layout rep's persisted SalesRepLayout.* preferences (VCST-5367).
 *   4. Orders per org across stores + statuses (POST /api/order/customerOrders).
 *   5. Write-back: contact/user/membership/owner GUIDs -> aliases.<env>.json.
 *
 * VCST-5367 saved layout: `salesRepLayout`/`saveSalesRepLayout` persist a Customer-module
 * CustomerPreference named `SalesRepLayout.{scope}[.{storeId}]` on the CALLER'S OWN user id. Only
 * SR_REP_LAYOUT's is disposable (allowlist in sales-rep-layout-specs.mjs) — the seeder resets it to
 * never-saved on every reseed so the "never saved => query returns null" precondition is reproducible,
 * and SR_REP_PRIMARY's null baseline (relied on by ~40 cases) is never written.
 *
 * Flags: --dry-run (reads only), --verbose, --teardown (delete only what this seeder created), --only <rep_key|order_key>.
 */
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv, loadAliases,
  writeEnvAliasOverride, syncEnvAliases, csvBool, DRY_RUN, TEARDOWN, ONLY, STORE_ID, verifyRemoved,
  discoverCatalogProducts, resetSecurityPassword, idsParam,
} from '../../lib/seed-common.mjs';
import {
  parseServedOrgs, isDisposableLayoutRep, isLayoutPreference, LAYOUT_PREF_PREFIX, LAYOUT_SCOPES,
  repFixtureStatus,
} from './sales-rep-layout-specs.mjs';
// The rolling-window + recency rules for test-data/sales-rep/sales-rep-orders.csv. `windowDaysFor` /
// `isFresh` / `CSV_KEY` were USED below (the freshness idempotency term, the alias write-back) but
// never imported, so this module carried three unresolved free variables: any run that reached
// `ensureOrder` with an existing order threw `ReferenceError: windowDaysFor is not defined`, i.e.
// every re-seed after the first. Wiring the import is what makes the freshness term actually execute.
import {
  CSV_KEY as ORDERS_CSV_KEY, windowDaysFor, isFresh,
  NEWEST_IN_ORG, newestRows, isStrictlyNewest,
} from './sales-rep-orders-specs.mjs';
import { hasStaleLockout } from '../../lib/user-provision.mjs';

const OWNER_NAME = 'AGENT-TEST-SR-Owner-Acme';
const OWNER_PHONE = '+1-206-555-0142';
const REP_PASSWORD = process.env.SR_REP_PASSWORD || process.env.TEST_USER_PASSWORD || 'Password1!';
// Restricted admin (Manager) users for the 092 admin-suite permission-negative cases.
const ADMIN_USER_PASSWORD = process.env.SR_ADMIN_PASSWORD || REP_PASSWORD;

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

/**
 * Clear a STALE platform lockout on a rep account (idempotent, non-fatal).
 *
 * A password reset does NOT clear a non-empty `LockoutEnd` or reset `accessFailedCount`, so a rep
 * that collected failed logins stays unauthenticable AFTER a credential-repairing reseed — the
 * exact state REG-2026-08-24-1806 hit, where 104 cases in 050m were BLOCKED at
 * `POST /connect/token`. Symmetrical with `ensureSecurityAccount()`'s stale-lockout branch, which
 * already does this for the CSV-driven b2b users.
 *
 * `status` comes from `repFixtureStatus(row)`, so SR_REP_BLOCKED — whose lockout is the fixture —
 * is excluded by `hasStaleLockout()` itself rather than by a branch here.
 */
async function clearRepStaleLockout(email, status) {
  if (!email || DRY_RUN) return false;
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  if (!u || !u.id || !hasStaleLockout(u, status)) return false;
  u.lockoutEnd = null; u.lockoutEnabled = false; u.accessFailedCount = 0;
  await api('PUT', '/api/platform/security/users', u, { expectStatus: [200, 204] });
  log(`  ↻ cleared stale lockout on ${email}`);
  return true;
}

/* ── VCST-5367 persisted layout (CustomerPreference SalesRepLayout.{scope}[.{storeId}]) ───────────
 * The layout the storefront saves is a Customer-module preference on the CALLER'S OWN ApplicationUser,
 * reachable from this seeder via POST /api/customer-preferences/search + DELETE /api/customer-preferences.
 * Deleting the rep does NOT cascade it (the row is keyed on the security account, not the Contact), so
 * the seeder wipes it explicitly — forward (restore the never-saved precondition) and at teardown
 * (zero residue). Only reps on the DISPOSABLE_LAYOUT_REP_KEYS allowlist are ever touched. */

/** The rep's persisted SalesRepLayout.* preference rows ([] when none / module route absent). */
async function findLayoutPreferences(userId) {
  if (!userId) return [];
  const res = await api('POST', '/api/customer-preferences/search', { userId, take: 100 }, { expectStatus: [200, 201, 404] });
  return (res?.results || res?.items || []).filter((p) => isLayoutPreference(p?.name));
}

/** Delete every SalesRepLayout.* row for a rep, so salesRepLayout(scope:…) resolves to null again. */
async function resetLayoutPreferences(userId, label) {
  if (!userId) {
    // In --dry-run a not-yet-created rep has no account, which is expected — not a warning.
    const msg = `${label} — no ApplicationUser id resolved, cannot reset ${LAYOUT_PREF_PREFIX}.* preferences`;
    if (DRY_RUN) verbose(msg); else log(`  WARN: ${msg}`);
    return 0;
  }
  const rows = await findLayoutPreferences(userId);
  if (rows.length === 0) {
    verbose(`${label}: no ${LAYOUT_PREF_PREFIX}.* preference — already never-saved (${LAYOUT_SCOPES.join(' / ')} resolve to null)`);
    return 0;
  }
  const names = rows.map((r) => r.name).join(', ');
  if (DRY_RUN) { log(`  ${label}: would delete ${rows.length} ${LAYOUT_PREF_PREFIX}.* preference(s): ${names}`); return rows.length; }
  await api('DELETE', `/api/customer-preferences?${idsParam(rows.map((r) => r.id))}`, null, { expectStatus: [200, 204] });
  log(`  ${label}: layout reset to never-saved — deleted ${rows.length} preference(s) (${names})`);
  return rows.length;
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
  for (const r of repRows) parseServedOrgs(r.served_orgs).orgKeys.forEach((k) => needed.add(k));
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
    // Self-heal credential drift: a rep account created BEFORE its password var
    // (SR_REP_PASSWORD / TEST_USER_PASSWORD) was set still authenticates only with the
    // old value, and the module's create-only account path never resets it — so a headless
    // runner using @td() + the registry password 400s invalid_grant. Force-set the password
    // to the current REP_PASSWORD on every reseed (idempotent; scoped to these AGENT-TEST-SR
    // accounts). A newly-created rep already gets REP_PASSWORD at create, so only reuse needs it.
    await resetSecurityPassword(api, row.email, REP_PASSWORD);
  } else {
    const { orgKeys, pagingCount } = parseServedOrgs(row.served_orgs);
    const served = pagingCount
      ? await ensurePagingOrgs(pagingCount)
      : orgKeys.map((k) => orgs[k] ? { organizationId: orgs[k].id, organizationName: orgs[k].name } : null).filter(Boolean);
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
  // Clear a lockout left by an earlier failed-login burst — a reset password alone does not, so
  // without this a credential-repairing reseed still leaves the rep unauthenticable.
  await clearRepStaleLockout(row.email, repFixtureStatus(row));
  // VCST-5367: only the DISPOSABLE-layout rep starts each seed never-saved (both scopes -> null).
  // SR_REP_PRIMARY is deliberately NOT on the allowlist — its null baseline is shared by ~40 cases.
  if (isDisposableLayoutRep(row.rep_key)) {
    await resetLayoutPreferences(rep?.userId || await resolveUserId(row.email), row.rep_key);
  }
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

// ---- phase 3b: restricted admin (Manager) users for suite 092 --------------
// Permission-negative fixtures: a Manager with customer:* but NO platform:security:* (SR-ADM-007/014),
// and a Manager with catalog:read but NO customer:read (SR-ADM-016). isAdministrator MUST be false or
// the role restriction is meaningless. Idempotent: look up by role name / user email before create.

async function ensureRole(roleName, permissions) {
  const search = await api('POST', '/api/platform/security/roles/search', { keyword: roleName, take: 20 }, { expectStatus: [200, 201] });
  const existing = (search?.results || search?.roles || []).find((r) => r.name === roleName);
  if (existing?.id) { verbose(`role exists: ${roleName} (${existing.id})`); return existing; }
  const body = { name: roleName, permissions: permissions.map((p) => ({ name: p, assignedScopes: [] })) };
  await api('PUT', '/api/platform/security/roles', body, { expectStatus: [200, 201, 204] });
  const again = await api('POST', '/api/platform/security/roles/search', { keyword: roleName, take: 20 }, { expectStatus: [200, 201] });
  const created = (again?.results || again?.roles || []).find((r) => r.name === roleName);
  log(`Role created: ${roleName} (${created?.id}) [${permissions.join(', ')}]`);
  return created;
}

async function ensureAdminUser(row) {
  const perms = (row.permissions || '').split(';').map((s) => s.trim()).filter(Boolean);
  const role = await ensureRole(row.role_name, perms);
  const existing = await api('GET', `/api/platform/security/users/${encodeURIComponent(row.user_name)}`, null, { expectStatus: [200, 404] });
  if (existing?.id) {
    log(`Admin user exists: ${row.user_key} (${row.email})`);
    return existing.id;
  }
  const body = {
    userName: row.user_name, email: row.email, password: ADMIN_USER_PASSWORD,
    userType: 'Manager', isAdministrator: false, emailConfirmed: true,
    roles: role ? [role] : [],
  };
  const res = await api('POST', '/api/platform/security/users/create', body, { expectStatus: [200, 201] });
  if (res && res.succeeded === false) throw new Error(`user create failed for ${row.email}: ${JSON.stringify(res.errors || res)}`);
  log(`Admin user created: ${row.user_key} (${row.email}) role=${row.role_name}`);
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(row.email)}`, null, { expectStatus: [200, 404] });
  return u?.id || '';
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

// Placeholder product identity used when the catalog has no discoverable products (dry-run / bare
// env). A real seed overlays live catalog products instead — see ensureOrder / SYNTHETIC_* below.
const SYNTHETIC_CATALOG_ID = 'agent-test-sr';
const SYNTHETIC_PRODUCT_PREFIX = 'agent-test-sr-prod-';
const isSyntheticItem = (it) =>
  it?.catalogId === SYNTHETIC_CATALOG_ID || String(it?.productId || '').startsWith(SYNTHETIC_PRODUCT_PREFIX);

/**
 * `forceRebuild` adds MAXIMALITY as an idempotency term the content checks cannot express: the caller
 * (Phase 4b) has established from the live order set that this row is no longer its org's most recent
 * order, which no property OF the order itself reveals. It is folded into the same conjunction as
 * `freshOk` so the rebuild reuses this function's proven delete-then-create path — deleting here and
 * re-entering would make the fresh search race the deletion through the ES index.
 */
async function ensureOrder(row, orgs, customerId, products = [], { forceRebuild = false } = {}) {
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
    const orgOk = full?.organizationId === org.id && !!full?.organizationName;
    // Status must match the CSV, so a status change (e.g. Failed -> Payment required) rebuilds the
    // stale order instead of being silently ignored. Mirrors seed-order-states.mjs's statusOk gate.
    const statusOk = full?.status === row.status;
    // Auto-upgrade a legacy order whose line items still point at the synthetic placeholder catalog —
    // but only when we actually have real products to swap in (never thrash on a bare/dry-run catalog).
    const itemsOk = products.length === 0
      || ((full?.items || []).length > 0 && !(full.items).some(isSyntheticItem));
    // FRESHNESS — the extra idempotency term for a rolling-window row (rules: sales-rep-orders-specs).
    // Content-based idempotency alone leaves a correct-but-STALE order in place, which is how
    // SR-CP-057 / SR-HD-048 came to assert against an empty window a week after the seed. Since
    // createdDate is server-assigned, the only way to move an order into the window is to recreate it.
    const windowDays = windowDaysFor(row);
    const freshOk = isFresh(full?.createdDate, windowDays);
    if (!forceRebuild && existing.customerId === wantCustomerId && enriched && totalOk && orgOk && statusOk && itemsOk && freshOk) { verbose(`order ${number} exists (attributed + enriched + total + org + status + items${windowDays ? ' + fresh' : ''} ok)`); return; }
    await api('DELETE', `/api/order/customerOrders?ids=${existing.id}`, null, { expectStatus: [200, 204] });
    log(`  order ${number} rebuilding (customerId ${existing.customerId}->${wantCustomerId}, enriched=${!!enriched}, totalOk=${totalOk}, orgOk=${orgOk}, statusOk=${statusOk}, itemsOk=${itemsOk}${windowDays ? `, freshOk=${freshOk} (${windowDays}d window; createdDate=${full?.createdDate})` : ''}${forceRebuild ? ', forceRebuild=true (no longer the org\'s most recent order)' : ''})`);
  }
  const n = Math.max(1, parseInt(row.items_count, 10) || 1);
  const total = parseFloat(row.total);
  // Split the total across n items so the line-item extended prices sum EXACTLY to `total` —
  // assign the rounding remainder to the first item. An even split (round(total/n) for every item)
  // drifts a cent on uneven divisions (e.g. 200/3 → 66.67×3 = 200.01); the platform then recomputes
  // order.Total to 200.01, and the `Math.abs(total - row.total) < 0.01` idempotency check above
  // rebuilds the order on EVERY reseed. remainder-to-first keeps the sum exact.
  const per = Math.round((total / n) * 100) / 100;
  const firstPrice = Math.round((total - per * (n - 1)) * 100) / 100;
  // Point line items at REAL catalog products discovered live on this env, so the seeded order
  // references browsable products (reorder / PDP link / product image resolve) — mirrors
  // seed-order-states.mjs / applyCatalogItems. Price / quantity / currency stay fixture-driven so
  // order.Total == the CSV total; only product IDENTITY comes from the live catalog. Fewer products
  // than items → cycle. If NONE were discovered (dry-run / bare catalog) we fall back to synthetic
  // placeholders — non-browsable, so don't reuse those for reorder tests; seed the catalog first.
  const items = Array.from({ length: n }, (_, i) => {
    const price = i === 0 ? firstPrice : per;
    const p = products.length ? products[i % products.length] : null;
    return p
      ? { sku: p.sku, productId: p.id, catalogId: p.catalogId, name: p.name, quantity: 1, price, productType: 'Physical', currency: 'USD' }
      : { sku: `AGENT-TEST-SR-SKU-${i + 1}`, productId: `${SYNTHETIC_PRODUCT_PREFIX}${i + 1}`, catalogId: SYNTHETIC_CATALOG_ID, name: `AGENT-TEST-SR Item ${i + 1}`, quantity: 1, price, productType: 'Physical', currency: 'USD' };
  });
  const shipAddr = orderAddress(org, 'Shipping');
  const billAddr = orderAddress(org, 'Billing');
  // NOTE on totals: the platform's order-total calculator folds shipment.total and inPayment.total
  // back into order.Total, so a non-zero shipment/payment total inflates the order (observed $120→$255).
  // Keep the structural records (address/shipment/payment) but zero their monetary totals so order.Total
  // stays == the CSV total (preserving the salesRepOrders/lastOrder totals verified in 091). The payment's
  // `sum` carries the amount (mirrors a real order: sum=<amount>, total=0).
  const body = {
    number, storeId: row.store, organizationId: org.id, organizationName: org.name,
    customerId: wantCustomerId, customerName: row.customer_name, currency: 'USD', status: row.status,
    total, subTotal: total, shippingTotal: 0, shippingTotalWithTax: 0, taxTotal: 0, items,
    addresses: [shipAddr, billAddr],
    shipments: [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground', currency: 'USD',
      organizationId: org.id, organizationName: org.name,
      price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'New', number: `${number}-S1`, deliveryAddress: shipAddr, items: [],
    }],
    inPayments: [{
      gatewayCode: 'DefaultManualPaymentMethod', currency: 'USD',
      customerId: wantCustomerId, customerName: row.customer_name, organizationId: org.id, organizationName: org.name,
      sum: total, price: 0, priceWithTax: 0, total: 0, totalWithTax: 0, status: 'New', paymentStatus: 'New',
      number: `${number}-P1`, billingAddress: billAddr,
    }],
  };
  const created = await api('POST', '/api/order/customerOrders', body);
  log(`  order ${number} (${row.status}, ${row.store}, ${n} items) -> ${created?.id || '(created)'}`);
}

// ---- teardown --------------------------------------------------------------

async function teardown(orgs) {
  // `--teardown --only <rep_key|order_key|user_key>` tears down exactly ONE fixture. The QA envs are
  // SHARED, so an unscoped teardown (which also sweeps the paging orgs, the ACME owner contact and the
  // 092 admin users) is the wrong tool for reverting a single rep. Shared infrastructure is swept only
  // in a FULL teardown.
  const scoped = !!ONLY;
  const only = (key) => !ONLY || key === ONLY;
  log(scoped ? `TEARDOWN (scoped to ${ONLY}) — deleting only that AGENT-TEST-SR fixture` : 'TEARDOWN — deleting only AGENT-TEST-SR fixtures');
  // Orders
  for (const row of loadCsv('test-data/sales-rep/sales-rep-orders.csv').filter((r) => only(r.order_key))) {
    const number = `${ORDER_MARK}-${row.order_key}`;
    const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
    for (const o of (found?.results || [])) { await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] }); log(`  deleted order ${number}`); }
  }
  // Reps (cascades to account + memberships). A persisted VCST-5367 layout does NOT cascade —
  // the CustomerPreference is keyed on the ApplicationUser — so wipe it FIRST, while the account
  // (and therefore its id) still resolves, then verify zero residue.
  const layoutResidue = [];
  for (const row of loadCsv('test-data/sales-rep/sales-reps.csv').filter((r) => only(r.rep_key))) {
    if (isDisposableLayoutRep(row.rep_key)) {
      const uid = await resolveUserId(row.email);
      await resetLayoutPreferences(uid, row.rep_key);
      if (uid) layoutResidue.push({ repKey: row.rep_key, uid });
    }
    const rep = await findRepByFullName(row.full_name);
    if (rep?.id) { await api('DELETE', `/api/sales-rep?ids=${rep.id}`, null, { expectStatus: [200, 204] }); log(`  deleted rep ${row.rep_key}`); }
  }
  for (const { repKey, uid } of layoutResidue) {
    const residue = await verifyRemoved(() => findLayoutPreferences(uid));
    log(residue === 0
      ? `  verifyRemoved: ${repKey} has zero ${LAYOUT_PREF_PREFIX}.* residue`
      : `  WARN verifyRemoved: ${repKey} still has ${residue} ${LAYOUT_PREF_PREFIX}.* preference(s)`);
  }
  // Also confirm the rep's LOGIN ACCOUNT went with it (the module cascades Contact -> ApplicationUser;
  // a leftover account would keep the email taken and re-seed a rep that cannot be re-created).
  for (const row of loadCsv('test-data/sales-rep/sales-reps.csv').filter((r) => only(r.rep_key))) {
    const stillThere = await resolveUserId(row.email);
    if (stillThere) log(`  WARN: login account for ${row.rep_key} (${row.email}) still exists after the rep delete`);
    else verbose(`login account for ${row.rep_key} removed with the rep`);
  }
  // Restricted admin (Manager) users + their roles (suite 092 fixtures)
  for (const row of loadCsv('test-data/sales-rep/admin-users.csv').filter((r) => only(r.user_key))) {
    const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(row.email)}`, null, { expectStatus: [200, 404] });
    if (u?.id) { await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(row.user_name)}`, null, { expectStatus: [200, 204] }); log(`  deleted admin user ${row.user_key}`); }
    const search = await api('POST', '/api/platform/security/roles/search', { keyword: row.role_name, take: 20 }, { expectStatus: [200, 201] });
    const role = (search?.results || search?.roles || []).find((r) => r.name === row.role_name);
    if (role?.id) { await api('DELETE', `/api/platform/security/roles?ids=${role.id}`, null, { expectStatus: [200, 204] }); log(`  deleted role ${row.role_name}`); }
  }
  if (scoped) { log('Teardown complete (scoped — shared paging orgs + ACME owner contact left intact).'); return; }
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
  const orderWriteback = {};
  let primaryRepEmail = null;
  for (const row of reps) {
    const { contactId, userId, lockedMembershipId } = await ensureRep(row, orgs, roleId);
    repWriteback[row.rep_key] = { contact_id: contactId || '', user_id: userId || '', membership_locked_id: lockedMembershipId || '' };
    if (row.rep_key === 'SR_REP_PRIMARY') primaryRepEmail = row.email;
  }
  // `--only <order_key>` filters the REP list to empty, which left primaryRepEmail null and made the
  // Phase-4 guard below skip order seeding entirely — so scoping to an order silently seeded nothing.
  // The rep's email is a committed business key, so read it from the CSV rather than depending on
  // this run having happened to process that rep.
  if (!primaryRepEmail) {
    primaryRepEmail = loadCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === 'SR_REP_PRIMARY')?.email || null;
  }

  // Phase 3b — restricted admin (Manager) users for suite 092 permission-negatives
  const adminUsers = loadCsv('test-data/sales-rep/admin-users.csv').filter((r) => csvBool(r.seeded, true) && (!ONLY || r.user_key === ONLY));
  for (const row of adminUsers) {
    try { await ensureAdminUser(row); }
    catch (e) { log(`WARN: admin user ${row.user_key} not seeded (${String(e.message).slice(0, 160)})`); }
  }

  // Phase 4 — orders. salesRepOrders/lastOrder attribute an order to a rep by
  // order.CustomerId == the rep's ApplicationUser (login) id — the value GetCurrentUserId()
  // returns from the JWT — NOT the rep's Contact/member id. Stamp the primary rep's account id
  // so the rep-scoped order queries actually return these orders (VCST-5304/5308).
  const primaryUserId = await resolveUserId(primaryRepEmail);
  if (!primaryUserId) {
    // Fail loud: without the rep's ApplicationUser id every order would fall back to a wrong
    // CustomerId and be invisible to salesRepOrders/lastOrder. Skip order seeding rather than
    // write un-queryable orders; fix the rep account and re-run.
    log('WARN: could not resolve SR_REP_PRIMARY ApplicationUser id — SKIPPING order seeding (orders would not be rep-attributed). Ensure the rep account exists, then re-run.');
  } else {
    verbose(`orders attributed to SR_REP_PRIMARY account id ${primaryUserId}`);
    // Discover real catalog products once (env-resilient, not hardcoded) to back the line items.
    const maxItems = Math.max(1, ...orders.map((r) => parseInt(r.items_count, 10) || 1));
    const products = await discoverCatalogProducts(api, maxItems);
    if (products.length) verbose(`line items use ${products.length} real catalog product(s): ${products.map((p) => p.sku).join(', ')}`);
    else if (!DRY_RUN) log('  WARN: no catalog products discovered — line items keep synthetic placeholders (seed catalog first for reorder/PDP-link cases).');
    for (const row of orders) await ensureOrder(row, orgs, primaryUserId, products);

    // Phase 4b — MAXIMALITY. A row declaring `recency_contract=newest-in-org` must be its org's most
    // recent order, because SR-GQL-013 asserts the GLOBAL (no-storeId) `lastOrder` is the one on the
    // secondary store. `createdDate` is server-assigned, so "newest" can only be produced by POSTing
    // LAST — and this pass runs after every other order precisely so a rolling-window row rebuilt
    // moments ago in the loop above cannot outrank it.
    //
    // This has to be a per-run RE-ASSERTION, not a one-off ordering: a rolling-window row is deleted
    // and recreated at the server's `now` whenever it ages out, and a foreign order on the same org
    // (AGENT-TEST-SRO-TZ-VCST-2104-001, created 2026-08-16 by an unrelated investigation) outranks
    // the fixture just by existing. Reordering the CSV fixes neither. Measured on vcst 2026-08-26:
    // ELEC 2026-08-07T13:49:16Z vs WIN-PROC 2026-08-25T14:23:29Z — four consecutive SR-GQL-013 FAILs.
    //
    // The comparison set is the org's orders ATTRIBUTED TO THIS REP (customerId == the rep's
    // ApplicationUser id), which is exactly what `salesRepCustomers.lastOrder` considers — a different
    // customer's order on the same org is not a rival and must not trigger a pointless rebuild.
    for (const row of newestRows(orders)) {
      const org = orgs[row.org];
      if (!org) { log(`  WARN: ${NEWEST_IN_ORG} row ${row.order_key} — org ${row.org} unknown, skip`); continue; }
      const number = `${ORDER_MARK}-${row.order_key}`;
      // The search runs under --dry-run too (it is a read call), so a dry run REPORTS whether the
      // contract currently holds on this env instead of merely announcing an intention. Only the
      // DELETE + re-post below is suppressed.
      // `keyword` alone is NOT enough: it misses same-org orders whose number does not share the
      // fixture prefix, and those are the ones that silently took the guarantee away.
      const search = await api('POST', '/api/order/customerOrders/search',
        { organizationIds: [org.id], take: 200, sort: 'createdDate:desc' });
      const mine = (search?.results || []).filter((o) => o.customerId === primaryUserId);
      const self = mine.find((o) => o.number === number);
      if (!self) { log(`  WARN: ${NEWEST_IN_ORG} row ${number} not found after seeding — cannot assert recency`); continue; }
      const rivals = mine.filter((o) => o.id !== self.id);
      if (isStrictlyNewest(self.createdDate, rivals.map((o) => o.createdDate))) {
        verbose(`order ${number} is already ${row.org}'s most recent (${self.createdDate}) — contract holds`);
        continue;
      }
      const beatenBy = rivals
        .filter((o) => Date.parse(o.createdDate) >= Date.parse(self.createdDate))
        .map((o) => `${o.number}@${o.createdDate}`);
      log(`  order ${number} ${DRY_RUN ? 'WOULD BE re-posted' : 're-posting'} to satisfy ${NEWEST_IN_ORG} (was ${self.createdDate}, outranked by ${beatenBy.join(', ') || '(tie)'})`);
      if (DRY_RUN) continue;
      await ensureOrder(row, orgs, primaryUserId, products, { forceRebuild: true });
    }

    // Date-contract rows write back their server-assigned id AND createdDate. The date is runtime
    // data, not decoration: it is the only way a later run — or td:validate:sr-orders — can tell that
    // a rolling-window fixture has aged out of the window SR-CP-057 / SR-HD-048 assert against, or
    // that a `newest-in-org` fixture has been outranked (the SR-GQL-013 premise). A row with no
    // date contract is date-agnostic, so recording its instant would be noise.
    const dated = orders.filter((r) => windowDaysFor(r) !== null || newestRows([r]).length > 0);
    for (const row of dated) {
      const number = `${ORDER_MARK}-${row.order_key}`;
      const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 1 });
      const o = (found?.results || [])[0];
      if (o) orderWriteback[row.order_key] = { order_id: o.id, created_date: o.createdDate };
      else log(`  WARN: date-contract order ${number} not found after seeding — its @td alias will resolve empty`);
    }
  }

  // Phase 5 — write-back runtime GUIDs
  syncEnvAliases('sales-rep/sales-reps', repWriteback);
  syncEnvAliases(ORDERS_CSV_KEY, orderWriteback);
  if (ownerId) writeEnvAliasOverride({ SR_OWNER_ACME: { id: ownerId } });

  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Seed complete. Runtime GUIDs written to aliases.<env>.json.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
