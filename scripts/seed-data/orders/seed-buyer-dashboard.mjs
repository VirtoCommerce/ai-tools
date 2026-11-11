#!/usr/bin/env node
/**
 * seed-buyer-dashboard.mjs — buyer /account/dashboard statistics fixtures (VCST-6078).
 *
 * Seven dedicated AGENT-TEST buyers, each owning the orders that make ONE dashboard distinction
 * decidable (data: test-data/orders/buyer-dashboard.json; rules: buyer-dashboard-specs.mjs):
 *   STATS    — two creation waves (prev, cur) whose orderStatistics comparison moves count +50% while
 *              revenue moves -66.69%; plus a flag-cancelled, a status-"Cancelled"-but-not-flagged,
 *              a prototype and an off-organization order, all with distinct totals.
 *   LARGE    — AOV >= 1,000,000 (card overflow).
 *   EUR      — orders in EUR and USD (conversion by the platform rate).
 *   TWOSTORE — orders in B2B-store and a second store (store scoping).
 *   NOORG    — personal buyer with no organization (no-org scope).
 *   UNCFG    — one order in a currency the platform no longer configures: the seeder creates the
 *              ISO test currency XTS, places the order, then REMOVES the currency (the README's
 *              "currency removed" edge). A currency that never existed is refused by the Orders
 *              module (POST → 500 "Sequence contains no matching element", measured 2026-11-09).
 *              The create → place → remove path runs in try/finally: XTS is removed even on failure.
 *   LAYOUT   — orders in New / Processing / Completed / Cancelled (status only) for the saved-layout
 *              cases; the ONLY buyer whose account-dashboard layout a case may change.
 * Every buyer's account-dashboard layout preference (Layout.accountDashboard[.{storeId}], KB-AC688064)
 * is deleted on every (re)seed and at teardown, so each starts never-saved.
 *
 * Rate-dependent expectations: the fixture declares its figures at declaredRates (EUR = expected.fxRate).
 * When the env's live rate differs, the env-correct value of every aliased rate-dependent expectation
 * is written to aliases.<env>.json, which the resolver layers over the fixture field by field.
 *
 * HARD LIMIT: CustomerOrder.createdDate is server-assigned (KB-971BC129, re-measured on this build):
 * every order lands at the seed instant, so no storefront card can show a non-null delta from this
 * data. The wave instants are written to aliases.<env>.json so the API comparison can be asked over
 * them, and every dashboard expectation is valid for the day of the seed (re-seed with --refresh).
 *
 * Exit code: every READ-BACK DIFFERS, read-back MISMATCH / NO DATA, buyer sign-in failure, GraphQL
 * error, layout left behind and teardown residue is counted; the run prints one RESULT line and exits
 * 1 unless the count is zero.
 *
 * Runtime ids + createdDate land in test-data/aliases.<env>.json; the fixture holds business keys.
 * Flags: --dry-run · --verbose · --teardown · --refresh (recreate every order at "now")
 *        --only <BUYER>  seed one buyer; with --teardown remove ONLY that buyer's orders, layout
 *                        preferences, user, and the orgs no other buyer uses
 *        --heal-eur-persona  opt-in: reset the shared {{EUR_USER_EMAIL}} persona's password to
 *                        {{EUR_USER_PASSWORD}} (no forced change) + read back passwordExpired and a
 *                        token grant. Never runs by default — it changes a shared account.
 *
 * Opt-in DEMO targets (fixture `demoTargets`, e.g. JOHN_DEMO): `--only JOHN_DEMO` adds plain orders for an
 * EXISTING env persona ({{USER_EMAIL}}) so its own dashboard shows WEEK/MTD figures; `--teardown --only
 * JOHN_DEMO` removes exactly those orders. The persona, its org and its carts are never touched; the
 * default seed does not create demo orders, the default teardown does remove them.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, ROOT, BACK_URL, DRY_RUN, VERBOSE, TEARDOWN, ONLY, TEST_ENV,
  writeEnvAliasOverride, verifyRemoved, discoverLineCandidates, resetSecurityPassword,
  findOrdersByExactNumber as findOrdersShared, findCustomerPreferences, resetCustomerPreferences,
} from '../../lib/seed-common.mjs';
import {
  setFlags, authenticate, findUserByEmail, ensureMembershipContact, ensureSecurityAccount,
  searchMemberships, ensureOrgMembership, roleIdByName, deleteUserByEmail, findMemberById, findOrgByName,
} from '../../lib/user-provision.mjs';
import {
  loadFixture, orderNumber, orderOrgKey, aliasFor, allOrderNumbers, fixtureProblems,
  expectedFigures, expectedComparison, demoTargets, demoOrderNumber, demoOrderNumbers, demoAdded,
  buyerOrderNumbers, buyerOrgKeys, orgKeysOwnedOnlyBy, isAccountDashboardLayoutPreference,
  ACCOUNT_DASHBOARD_LAYOUT_SCOPE, liveExpectationOverrides,
} from './buyer-dashboard-specs.mjs';

const REFRESH = process.argv.includes('--refresh');
const HEAL_EUR_PERSONA = process.argv.includes('--heal-eur-persona');
const fx = loadFixture();
const overlayPath = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
const overlay = () => (existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {});
const buyersInScope = () => Object.entries(fx.buyers).filter(([k]) => !ONLY || k === ONLY);
const UNCFG = fx.unconfiguredCurrency;
const DEMO = ONLY ? demoTargets(fx)[ONLY] || null : null;
const ALIASES = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));

// Every check that can fail without throwing is counted here; the run exits non-zero unless it is empty.
const problems = [];
function problem(msg) { problems.push(msg); log(`⚠ ${msg}`); }

function writeOverlay(ov) { writeFileSync(overlayPath, `${JSON.stringify(ov, null, 2)}\n`); }

/** Replace (not merge) one alias's overlay entry, so a field an earlier seed wrote (a rate override) cannot linger. */
function replaceOverlayEntry(alias, fields) {
  if (DRY_RUN) return;
  const ov = overlay();
  if (ov[alias]) { delete ov[alias]; writeOverlay(ov); }
  writeEnvAliasOverride({ [alias]: fields });
}

const usesUncfgCurrency = (b) => b.orders.some((o) => o.currency === UNCFG.code);

// ---- organizations ---------------------------------------------------------

/** Reuse by the overlay id first (the member index lags right after a create), then by name. */
async function ensureOrg(orgKey, knownId) {
  const name = fx.orgs[orgKey];
  let org = knownId ? await findMemberById(knownId) : null;
  if (org && org.name !== name) org = null;
  if (!org) org = (await findOrgByName(name)) || null;
  if (org) { verbose(`org ${name} reused (${org.id})`); return org.id; }
  const created = await api('POST', '/api/members', {
    memberType: 'Organization', name, status: 'Approved', description: `AGENT-TEST VCST-6078 buyer dashboard (${orgKey})`,
    emails: [`${name.toLowerCase()}@test-agent.com`],
  });
  log(`org ${name} created → ${created?.id}`);
  return created?.id;
}

// ---- buyers ----------------------------------------------------------------

async function ensureBuyer(key, b, orgIds) {
  const password = process.env[b.passwordVar];
  if (!password) throw new Error(`${key}: ${b.passwordVar} is not set for TEST_ENV=${TEST_ENV} (import config.js layers / .env.local)`);
  const orgId = b.org ? orgIds[b.org] : null;
  const contactId = await ensureMembershipContact(b.email, b.firstName, b.lastName, orgId ? [orgId] : []);
  if (!DRY_RUN) {
    const c = await api('GET', `/api/members/${contactId}`);
    // AGENT-TEST name (the member sweep keys on it) + the buyer's default currency
    const want = { name: `${b.firstName} ${b.lastName}`, fullName: `${b.firstName} ${b.lastName}`, currencyCode: b.currency };
    if (Object.entries(want).some(([f, v]) => c[f] !== v)) await api('PUT', '/api/members', { ...c, ...want }, { expectStatus: [200, 204] });
  }
  const userId = await ensureSecurityAccount(b.email, password, contactId, 'Approved', { reconcilePassword: true });
  if (orgId && !DRY_RUN) {
    const roleId = roleIdByName(b.role);
    await ensureOrgMembership(userId, orgId, fx.orgs[b.org], roleId, await searchMemberships(userId), false, b.email);
  }
  log(`buyer ${key} ${b.email} → user ${userId}, contact ${contactId}, org ${b.org ? fx.orgs[b.org] : '(none)'}`);
  return { userId, contactId, orgId };
}

// ---- account-dashboard layout preference (KB-AC688064) ---------------------
// Keyed on the ApplicationUser id; deleting the user does not cascade it, so it is wiped explicitly.

const layoutLabel = (key) => `${key} layout (${ACCOUNT_DASHBOARD_LAYOUT_SCOPE})`;
const resetLayout = (userId, key) => resetCustomerPreferences(api, userId, isAccountDashboardLayoutPreference, layoutLabel(key));
const findLayout = (userId) => findCustomerPreferences(api, userId, isAccountDashboardLayoutPreference);

// ---- currency XTS (create → place → remove) -------------------------------

async function currencyExists(code) {
  return (await api('GET', '/api/currencies')).some((c) => c.code === code);
}
async function ensureCurrency() {
  if (await currencyExists(UNCFG.code)) return;
  await api('POST', '/api/currencies', { code: UNCFG.code, name: UNCFG.name, exchangeRate: UNCFG.exchangeRate, symbol: UNCFG.symbol, isPrimary: false, roundingType: 'Rounding001', midpointRounding: 'AwayFromZero' });
  log(`currency ${UNCFG.code} created (temporarily)`);
}
async function removeCurrency() {
  if (DRY_RUN || !(await currencyExists(UNCFG.code))) return;
  await api('DELETE', `/api/currencies?codes=${encodeURIComponent(UNCFG.code)}`, null, { expectStatus: [200, 204] });
  log(`currency ${UNCFG.code} removed — orders in it are now in an unconfigured currency`);
}
/** Run `fn`, then remove XTS whatever happened — a failed run must not leave the test currency configured. */
async function withCurrencyCleanup(fn) {
  try { return await fn(); } finally {
    try { await removeCurrency(); } catch (e) { problem(`currency ${UNCFG.code} could not be removed: ${String(e.message).slice(0, 200)}`); }
  }
}

// ---- orders ----------------------------------------------------------------

/** Exact-number lookup INCLUDING prototypes (STATS owns a prototype order; without the flag teardown misses it). */
const findOrdersByExactNumber = (number) => findOrdersShared(api, number, { withPrototypes: true });

/**
 * Lookup of an order in the unconfigured currency. With XTS removed, a search whose result holds that
 * order fails (500 "Sequence contains no matching element", measured 2026-11-11), so a writing run
 * re-adds XTS first (the caller's withCurrencyCleanup removes it again). A dry run cannot add it:
 * it reports the order as not inspectable and returns null.
 */
async function findXtsOrders(number) {
  if (!DRY_RUN) { await ensureCurrency(); return findOrdersByExactNumber(number); }
  try { return await findOrdersByExactNumber(number); } catch (e) {
    log(`  [DRY] order ${number} not inspectable while ${UNCFG.code} is removed (${String(e.message).slice(0, 80)}) — a real run re-adds ${UNCFG.code} first`);
    return null;
  }
}
const findOrdersFor = (number, currency) => (currency === UNCFG.code ? findXtsOrders(number) : findOrdersByExactNumber(number));

let _product = null;
async function lineProduct() {
  if (!_product) [_product] = await discoverLineCandidates(api, 1);
  if (!_product) throw new Error('no catalog product discovered for order lines');
  return _product;
}

function matches(full, want) {
  return full && full.customerId === want.customerId && (full.organizationId || null) === want.organizationId
    && full.storeId === want.storeId && full.currency === want.currency && Math.abs((full.total || 0) - want.total) < 0.005
    && full.status === want.status && !!full.isCancelled === want.isCancelled && !!full.isPrototype === want.isPrototype;
}

async function ensureOrder(b, o, owner, orgIds, { force = false } = {}) {
  const number = orderNumber(fx, o.key);
  const orgKey = orderOrgKey(b, o);
  const want = {
    customerId: owner.userId, organizationId: orgKey ? orgIds[orgKey] : null, storeId: o.store, currency: o.currency,
    total: o.total, status: o.status, isCancelled: o.isCancelled === true, isPrototype: o.isPrototype === true,
  };
  const hits = await findOrdersFor(number, o.currency);
  if (hits === null) return null; // dry run, XTS order not inspectable
  for (const h of hits) {
    const full = await api('GET', `/api/order/customerOrders/${h.id}`);
    if (!force && !REFRESH && matches(full, want)) { verbose(`order ${number} kept`); return full; }
  }
  if (DRY_RUN) { log(`  [DRY] order ${number} would be ${hits.length ? 'rebuilt' : 'created'}`); return null; }
  const p = await lineProduct();
  const body = {
    number, storeId: o.store, customerId: owner.userId, customerName: b.email, currency: o.currency, status: o.status,
    organizationId: want.organizationId, organizationName: orgKey ? fx.orgs[orgKey] : null,
    isPrototype: want.isPrototype,
    items: [{ productId: p.id, sku: p.sku, name: `AGENT-TEST ${o.key}`, catalogId: p.catalogId, quantity: 1, price: o.total, placedPrice: o.total, extendedPrice: o.total, currency: o.currency }],
  };
  const created = await api('POST', '/api/order/customerOrders', body);
  let full = await api('GET', `/api/order/customerOrders/${created.id}`);
  if (want.isCancelled && !full.isCancelled) {
    await api('PUT', '/api/order/customerOrders', { ...full, isCancelled: true, cancelledDate: new Date().toISOString(), cancelReason: 'AGENT-TEST VCST-6078 flag-cancelled fixture' }, { expectStatus: [200, 204] });
    full = await api('GET', `/api/order/customerOrders/${created.id}`);
  }
  for (const h of hits) await api('DELETE', `/api/order/customerOrders?ids=${h.id}`, null, { expectStatus: [200, 204] });
  const ok = matches(full, want);
  log(`  order ${number} ${o.currency} ${o.total} [${o.status}${want.isCancelled ? ', IsCancelled' : ''}${want.isPrototype ? ', IsPrototype' : ''}] → ${full.number} @ ${full.createdDate}`);
  if (!ok) problem(`order ${number}: READ-BACK DIFFERS ${JSON.stringify({ total: full.total, isPrototype: full.isPrototype, isCancelled: full.isCancelled, status: full.status })}`);
  return full;
}

const iso = (d) => new Date(d).toISOString();
const floorMs = (d) => iso(Math.floor(Date.parse(d)));
const ceilMs = (d) => iso(Math.floor(Date.parse(d)) + 1);
function waveWindow(list) {
  if (!list.length) return null;
  const ds = list.map((x) => x.createdDate).sort();
  return { from: floorMs(ds[0]), to: ceilMs(ds[ds.length - 1]) };
}

async function seedBuyerOrders(key, b, owner, orgIds) {
  const out = {};
  for (const wave of ['prev', 'cur']) {
    for (const o of b.orders.filter((x) => x.wave === wave)) out[o.key] = await ensureOrder(b, o, owner, orgIds);
  }
  // The waves must not interleave: a rebuilt prev order newer than a cur order breaks the comparison split.
  const prev = b.orders.filter((x) => x.wave === 'prev').map((x) => out[x.key]).filter(Boolean);
  const cur = b.orders.filter((x) => x.wave === 'cur').map((x) => out[x.key]).filter(Boolean);
  if (prev.length && cur.length && !DRY_RUN) {
    const maxPrev = prev.map((x) => x.createdDate).sort().at(-1);
    if (cur.some((x) => x.createdDate <= maxPrev)) {
      log(`  ${key}: waves interleave — recreating the cur wave after the prev wave`);
      for (const o of b.orders.filter((x) => x.wave === 'cur')) out[o.key] = await ensureOrder(b, o, owner, orgIds, { force: true });
    }
  }
  return out;
}

// ---- read-back as the buyer (GraphQL orderStatistics) ----------------------

async function buyerToken(email, password, orgId, storeId = fx.buyers.STATS.expected.store) {
  const params = { grant_type: 'password', username: email, password, scope: 'offline_access', storeId };
  if (orgId) params.organization_id = orgId;
  const res = await fetch(`${BACK_URL}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { token: body.access_token } : { error: `${res.status} ${body.error || ''} ${body.error_description || ''}`.trim() };
}

async function gql(token, query) {
  const res = await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query }) });
  return res.json();
}

const PERIOD_SEL = 'count total { amount } average { amount } excludedCount excludedCurrencies firstOrderDate lastOrderDate';

async function readBack(key, b, owner, windows) {
  const tok = await buyerToken(b.email, process.env[b.passwordVar], owner.orgId);
  if (tok.error) return { key, signIn: `FAILED ${tok.error}` };
  const me = await gql(tok.token, '{ me { id userName passwordExpired contact { organizationId } } }');
  const e = b.expected;
  const cmp = windows?.prev && windows?.cur
    ? `cmp: comparison(current:{from:"${windows.cur.from}",to:"${windows.cur.to}"}, previous:{from:"${windows.prev.from}",to:"${windows.prev.to}"}) { countChange countChangePercent totalChange { amount } totalChangePercent }`
    : '';
  const q = `{ store: orderStatistics(storeId:"${e.store}", currencyCode:"${e.currency}") { currencyCode all: period { ${PERIOD_SEL} } ${cmp} }
    allStores: orderStatistics(currencyCode:"${e.currency}") { all: period { ${PERIOD_SEL} } }
    ${e.todayInEur ? `eur: orderStatistics(storeId:"${e.store}", currencyCode:"EUR") { all: period { ${PERIOD_SEL} } }` : ''} }`;
  const r = await gql(tok.token, q);
  return { key, signIn: 'OK', me: me?.data?.me, data: r.data, errors: r.errors?.map((x) => x.message) };
}

function compare(b, rb, rates) {
  const lines = [];
  const e = b.expected;
  const chk = (label, want, got) => {
    if (!got) { lines.push(`    ${label}: NO DATA`); problems.push(`${label}: NO DATA`); return; }
    const g = { count: got.count, total: got.total?.amount, average: got.average?.amount, excludedCount: got.excludedCount, excludedCurrencies: got.excludedCurrencies };
    const bad = ['count', 'total', 'average', 'excludedCount'].filter((f) => want[f] !== undefined && Math.abs((g[f] ?? NaN) - want[f]) > 0.011);
    if (bad.length) problems.push(`${label}: MISMATCH`);
    lines.push(`    ${label}: ${bad.length ? 'MISMATCH' : 'match'} — got ${JSON.stringify(g)}${bad.length ? `, expected ${JSON.stringify(want)}` : ''}`);
  };
  chk(`${e.store}/${e.currency}`, expectedFigures(b, { store: e.store, currency: e.currency, rates }), rb.data?.store?.all);
  chk(`all-stores/${e.currency}`, expectedFigures(b, { store: null, currency: e.currency, rates }), rb.data?.allStores?.all);
  if (e.todayInEur) chk(`${e.store}/EUR`, expectedFigures(b, { store: e.store, currency: 'EUR', rates }), rb.data?.eur?.all);
  if (rb.data?.store?.cmp) {
    const want = expectedComparison(b, { store: e.store, currency: e.currency, rates });
    const got = rb.data.store.cmp;
    const ok = got.countChange === want.countChange && Math.abs(got.countChangePercent - want.countChangePercent) < 0.011
      && Math.abs(got.totalChange.amount - want.totalChange) < 0.011 && Math.abs(got.totalChangePercent - want.totalChangePercent) < 0.011;
    if (!ok) problems.push('comparison(cur vs prev): MISMATCH');
    lines.push(`    comparison(cur vs prev): ${ok ? 'match' : 'MISMATCH'} — got ${JSON.stringify({ ...got, totalChange: got.totalChange.amount })}${ok ? '' : `, expected ${JSON.stringify(want)}`}`);
  }
  return lines;
}

// ---- EUR persona heal (opt-in: --heal-eur-persona) -------------------------

async function healEurPersona() {
  const email = process.env.EUR_USER_EMAIL; const pw = process.env.EUR_USER_PASSWORD;
  if (!email || !pw) { problem('EUR persona: EUR_USER_EMAIL / EUR_USER_PASSWORD not set — --heal-eur-persona could not run'); return null; }
  const before = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  if (!before?.id) { problem(`EUR persona ${email}: account not found`); return null; }
  if (DRY_RUN) { log(`  [DRY] EUR persona: passwordExpired=${before.passwordExpired} — would reset its password to EUR_USER_PASSWORD (no forced change)`); return null; }
  const okReset = await resetSecurityPassword(api, email, pw);
  const after = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`);
  const tok = await buyerToken(email, pw, null);
  const res = { email, reset: okReset, passwordExpiredBefore: before.passwordExpired, passwordExpiredAfter: after.passwordExpired, tokenGrant: tok.error || 'OK' };
  log(`EUR persona ${email}: reset=${okReset} passwordExpired ${before.passwordExpired} → ${after.passwordExpired}; token grant ${res.tokenGrant}`);
  if (!okReset || tok.error) problem(`EUR persona ${email}: heal failed (reset=${okReset}, token ${res.tokenGrant})`);
  return res;
}

// ---- opt-in demo targets (an EXISTING env persona) -------------------------
// Orders only: the persona, its organization and its carts are never created, changed or deleted.

async function resolveDemoOwner(key, t) {
  const email = process.env[t.emailVar]; const password = process.env[t.passwordVar];
  if (!email || !password) throw new Error(`${key}: ${t.emailVar} / ${t.passwordVar} not set for TEST_ENV=${TEST_ENV}`);
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  if (!u?.id) throw new Error(`${key}: no security account for ${t.emailVar} on ${TEST_ENV} — this target never creates one`);
  // The org the dashboard scopes to is the TOKEN org, so read it from a storefront token, not the contact list.
  const tok = await buyerToken(email, password, null, t.store);
  if (tok.error) throw new Error(`${key}: storefront sign-in failed (${tok.error})`);
  const me = (await gql(tok.token, '{ me { id contact { id organizationId } } }'))?.data?.me;
  const orgId = me?.contact?.organizationId || null;
  const org = orgId ? await findMemberById(orgId) : null;
  const contact = u.memberId ? await findMemberById(u.memberId) : null;
  log(`${key}: ${t.emailVar} → user ${u.id}, contact ${u.memberId}, token org ${org?.name || orgId || '(none)'}`);
  return { userId: u.id, contactId: u.memberId, customerName: contact?.fullName || contact?.name || email, orgId, orgName: org?.name || null, token: tok.token };
}

let _demoProduct = null;
/** A real, active product of the store's own catalog, in stock (or not inventory-tracked). */
async function demoLineProduct(storeId) {
  if (_demoProduct) return _demoProduct;
  const store = await api('GET', `/api/stores/${storeId}`);
  const cands = await discoverLineCandidates(api, 10, { catalogId: store?.catalog || null });
  _demoProduct = cands.find((c) => c.trackInventory !== true || (c.availableQuantity ?? 0) > 0) || null;
  if (!_demoProduct) throw new Error(`no in-stock product found in ${storeId}'s catalog`);
  log(`  line product: ${_demoProduct.sku} (${_demoProduct.name})${_demoProduct.trackInventory ? `, available ${_demoProduct.availableQuantity}` : ', not tracked'}`);
  return _demoProduct;
}

async function ensureDemoOrder(t, o, owner) {
  const number = demoOrderNumber(t, o);
  const want = { customerId: owner.userId, organizationId: owner.orgId, storeId: t.store, currency: t.currency, total: o.total, status: o.status, isCancelled: false, isPrototype: false };
  const hits = await findOrdersByExactNumber(number);
  for (const h of hits) {
    const full = await api('GET', `/api/order/customerOrders/${h.id}`);
    if (!REFRESH && matches(full, want)) { log(`  order ${number} kept (${full.createdDate})`); return full; }
  }
  if (DRY_RUN) { log(`  [DRY] order ${number} ${t.currency} ${o.total} would be ${hits.length ? 'rebuilt' : 'created'}`); return null; }
  const p = await demoLineProduct(t.store);
  const created = await api('POST', '/api/order/customerOrders', {
    number, storeId: t.store, customerId: owner.userId, customerName: owner.customerName, currency: t.currency, status: o.status,
    organizationId: owner.orgId, organizationName: owner.orgName, isPrototype: false,
    items: [{ productId: p.id, sku: p.sku, name: p.name, catalogId: p.catalogId, quantity: 1, price: o.total, placedPrice: o.total, extendedPrice: o.total, currency: t.currency }],
  });
  const full = await api('GET', `/api/order/customerOrders/${created.id}`);
  for (const h of hits) await api('DELETE', `/api/order/customerOrders?ids=${h.id}`, null, { expectStatus: [200, 204] });
  log(`  order ${number} ${t.currency} ${o.total} [${o.status}] → ${full.id} @ ${full.createdDate}`);
  if (!matches(full, want)) problem(`demo order ${number}: READ-BACK DIFFERS ${JSON.stringify({ total: full.total, customerId: full.customerId, organizationId: full.organizationId })}`);
  return full;
}

async function seedDemo(key, t) {
  log(`DEMO ${key} — ${t.orders.length} orders ${t.orderPrefix}* for the existing persona ${t.emailVar} (orders only)`);
  const owner = await resolveDemoOwner(key, t);
  const orders = {};
  for (const o of t.orders) orders[o.key] = await ensureDemoOrder(t, o, owner);
  if (DRY_RUN) return;
  const window = waveWindow(Object.values(orders).filter(Boolean));
  writeEnvAliasOverride({
    [aliasFor(key)]: {
      user_id: owner.userId, contact_id: owner.contactId, org_id: owner.orgId || '',
      orders: Object.fromEntries(Object.entries(orders).map(([k, o]) => [k, { id: o.id, number: o.number, createdDate: o.createdDate, currency: o.currency, total: o.total, storeId: o.storeId }])),
      window, seededAt: new Date().toISOString(),
    },
  });
  // Read-back as the persona: over the demo orders' own creation window the figures must be exactly
  // what the demo adds (a concurrent order by the same buyer inside that window would show here).
  const want = demoAdded(t);
  const r = await gql(owner.token, `{ s: orderStatistics(storeId:"${t.store}", currencyCode:"${t.currency}") { w: period(from:"${window.from}", to:"${window.to}") { ${PERIOD_SEL} } } }`);
  const g = r?.data?.s?.w;
  const ok = g && g.count === want.count && Math.abs(g.total.amount - want.total) < 0.011;
  if (!ok) problems.push(`${key} demo read-back MISMATCH`);
  log(`READ-BACK as ${t.emailVar} over the demo window: ${ok ? 'match' : 'MISMATCH'} — got ${JSON.stringify(g ? { count: g.count, total: g.total?.amount, average: g.average?.amount } : r?.errors)}, expected ${JSON.stringify(want)}`);
  log(`Remove with: TEST_ENV=${TEST_ENV} npm run seed:buyer-dashboard:teardown -- --only ${key}`);
}

async function deleteDemoOrders(key, t) {
  for (const n of demoOrderNumbers(t)) {
    for (const o of await findOrdersByExactNumber(n)) {
      if (DRY_RUN) { log(`  [DRY] would delete ${key} order ${n} ${o.id}`); continue; }
      await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
      log(`  deleted ${key} order ${n} ${o.id}`);
    }
  }
}

async function demoTeardown(key, t) {
  log(`TEARDOWN DEMO ${key} — orders ${t.orderPrefix}* only (the persona is never touched)`);
  await deleteDemoOrders(key, t);
  if (DRY_RUN) return;
  const ov = overlay(); delete ov[aliasFor(key)]; writeOverlay(ov);
  const residue = await verifyRemoved(async () => {
    let n = 0; for (const num of demoOrderNumbers(t)) n += (await findOrdersByExactNumber(num)).length; return n;
  });
  if (residue) problem(`${residue} ${key} order(s) remain after teardown`); else log(`${key} teardown complete — zero residue.`);
}

// ---- teardown --------------------------------------------------------------

/**
 * `onlyKey` null → every buyer, every org, the demo orders and currency XTS. `onlyKey` set → that
 * buyer's orders, layout preferences and user, plus only the orgs no other buyer uses; XTS only when
 * the buyer owns an order in it. Other buyers' overlay entries and data are left alone.
 */
async function teardown(onlyKey = null) {
  const keys = onlyKey ? [onlyKey] : Object.keys(fx.buyers);
  const numbers = onlyKey ? buyerOrderNumbers(fx, onlyKey) : allOrderNumbers(fx);
  const orgKeys = onlyKey ? orgKeysOwnedOnlyBy(fx, onlyKey) : Object.keys(fx.orgs);
  const touchesXts = keys.some((k) => usesUncfgCurrency(fx.buyers[k]));
  log(`TEARDOWN — ${onlyKey ? `buyer ${onlyKey} only` : 'every AGENT-TEST-BD buyer'}: ${numbers.length} order number(s), `
    + `${keys.length} user(s) + layout preferences, org(s) [${orgKeys.map((k) => fx.orgs[k]).join(', ') || 'none'}]${touchesXts ? `, currency ${UNCFG.code}` : ''}`);

  // ids captured BEFORE deletion: the layout rows are keyed on the user id and survive the user.
  const userIds = {};
  for (const k of keys) userIds[k] = (await findUserByEmail(fx.buyers[k].email))?.id || null;
  const orgIds = {};
  for (const k of orgKeys) orgIds[k] = (await findOrgByName(fx.orgs[k]))?.id || null;

  for (const k of keys) await resetLayout(userIds[k], k);

  const currencyOf = Object.fromEntries(keys.flatMap((k) => fx.buyers[k].orders.map((o) => [orderNumber(fx, o.key), o.currency])));
  const deleteOrders = async () => {
    for (const n of numbers) {
      for (const o of (await findOrdersFor(n, currencyOf[n])) || []) {
        await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
        log(`  ${DRY_RUN ? '[DRY] would delete' : 'deleted'} order ${n} ${o.id}`);
      }
    }
  };
  // An order in a removed currency cannot be searched or deleted: findOrdersFor re-adds XTS, and
  // withCurrencyCleanup removes it again whatever happens.
  if (touchesXts) await withCurrencyCleanup(deleteOrders); else await deleteOrders();

  if (!onlyKey) for (const [k, t] of Object.entries(demoTargets(fx))) await deleteDemoOrders(k, t); // orders only, never the persona
  for (const k of keys) await deleteUserByEmail(fx.buyers[k].email);
  for (const k of orgKeys) {
    if (!orgIds[k]) continue;
    await api('DELETE', `/api/members?ids=${orgIds[k]}`, null, { expectStatus: [200, 204] });
    log(`  ${DRY_RUN ? '[DRY] would delete' : 'deleted'} org ${fx.orgs[k]}`);
  }
  if (!DRY_RUN) {
    const ov = overlay();
    for (const k of [...keys, ...(onlyKey ? [] : Object.keys(demoTargets(fx)))]) delete ov[aliasFor(k)];
    writeOverlay(ov);
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const num of numbers) n += (await findOrdersByExactNumber(num)).length;
    for (const k of keys) {
      if (await findUserByEmail(fx.buyers[k].email)) n += 1;
      n += (await findLayout(userIds[k])).length;
    }
    for (const k of orgKeys) if (orgIds[k] && (await findMemberById(orgIds[k]))?.id) n += 1;
    if (touchesXts && await currencyExists(UNCFG.code)) n += 1;
    return n;
  });
  if (residue) problem(`${residue} residue item(s) after teardown (orders / users / layout preferences / orgs${touchesXts ? ` / currency ${UNCFG.code}` : ''})`);
  else log(`Teardown complete — zero residue (orders, users, layout preferences, orgs${touchesXts ? `, currency ${UNCFG.code}` : ''}).`);
}

// ---- seed ------------------------------------------------------------------

async function seed() {
  const ov = overlay();
  const orgIds = {};
  const neededOrgs = new Set(buyersInScope().flatMap(([, b]) => buyerOrgKeys(b)));
  for (const k of neededOrgs) {
    const known = Object.keys(fx.buyers).map((bk) => ov[aliasFor(bk)]?.org_ids?.[k]).find(Boolean);
    orgIds[k] = await ensureOrg(k, known);
  }

  const live = (await api('GET', '/api/currencies')).filter((c) => c.code !== UNCFG.code);
  const rates = Object.fromEntries(live.map((c) => [c.code, c.exchangeRate]));
  log(`platform currencies (rate to primary): ${live.map((c) => `${c.code}=${c.exchangeRate}`).join(', ')}`);

  const summary = [];
  const seedBuyers = async () => {
    for (const [key, b] of buyersInScope()) {
      log(`\n— ${key} —`);
      const owner = await ensureBuyer(key, b, orgIds);
      await resetLayout(owner.userId, key);
      const rateOverrides = liveExpectationOverrides(fx, ALIASES[aliasFor(key)]?.fields, rates);
      if (Object.keys(rateOverrides).length) log(`  ${key}: live rates differ from the fixture's declared rates — env-correct expectations ${DRY_RUN ? 'would be ' : ''}written to aliases.${TEST_ENV}.json: ${JSON.stringify(rateOverrides)}`);
      const orders = await seedBuyerOrders(key, b, owner, orgIds);
      if (DRY_RUN) continue;
      const windows = {
        prev: waveWindow(b.orders.filter((o) => o.wave === 'prev').map((o) => orders[o.key]).filter(Boolean)),
        cur: waveWindow(b.orders.filter((o) => o.wave === 'cur').map((o) => orders[o.key]).filter(Boolean)),
      };
      const orgsUsed = Object.fromEntries(buyerOrgKeys(b).map((k) => [k, orgIds[k]]));
      replaceOverlayEntry(aliasFor(key), {
        ...rateOverrides,
        user_id: owner.userId, contact_id: owner.contactId, org_id: owner.orgId || '', org_ids: orgsUsed,
        orders: Object.fromEntries(Object.entries(orders).map(([k, o]) => [k, { id: o.id, number: o.number, createdDate: o.createdDate, currency: o.currency, total: o.total, storeId: o.storeId, isCancelled: !!o.isCancelled, isPrototype: !!o.isPrototype }])),
        windows, seededAt: new Date().toISOString(),
      });
      summary.push({ key, b, owner, windows });
    }
  };
  // XTS is created mid-run for UNCFG and must be gone at the end, whether the run finished or threw.
  if (buyersInScope().some(([, b]) => usesUncfgCurrency(b))) await withCurrencyCleanup(seedBuyers);
  else await seedBuyers();

  const persona = HEAL_EUR_PERSONA ? await healEurPersona() : null;

  if (DRY_RUN) return;
  log('\nREAD-BACK — orderStatistics as each buyer (token customer + token org)');
  for (const s of summary) {
    const rb = await readBack(s.key, s.b, s.owner, s.windows);
    log(`  ${s.key} sign-in ${rb.signIn}${rb.me ? ` (me.passwordExpired=${rb.me.passwordExpired}, token org=${rb.me.contact?.organizationId || 'none'})` : ''}${rb.errors ? ` errors=${JSON.stringify(rb.errors)}` : ''}`);
    if (rb.signIn !== 'OK') problems.push(`${s.key}: buyer sign-in ${rb.signIn}`);
    if (rb.errors?.length) problems.push(`${s.key}: GraphQL errors`);
    if (rb.data) for (const l of compare(s.b, rb, rates)) log(l);
    const leftover = await findLayout(s.owner.userId);
    if (leftover.length) problem(`${s.key}: ${leftover.length} account-dashboard layout preference(s) still present after the reset`);
  }
  if (summary.some((s) => usesUncfgCurrency(s.b))) {
    // A removed currency must not take the admin order search down for everyone (VCST-6535 class).
    try { await api('POST', '/api/order/customerOrders/search', { take: 5 }); log(`admin order search after ${UNCFG.code} removal: OK`); } catch (e) { problem(`admin order search after ${UNCFG.code} removal FAILED: ${e.message.slice(0, 200)}`); }
  }
  if (persona) log(`EUR persona: ${JSON.stringify(persona)}`);
  log(`Runtime ids → test-data/aliases.${TEST_ENV}.json`);
}

// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  await auth();
  setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
  await authenticate();
  const fp = fixtureProblems(fx);
  if (fp.length) throw new Error(`fixture contract broken — refusing to seed:\n  - ${fp.join('\n  - ')}`);
  if (DEMO) { if (TEARDOWN) await demoTeardown(ONLY, DEMO); else await seedDemo(ONLY, DEMO); return; }
  if (ONLY && !fx.buyers[ONLY]) throw new Error(`--only ${ONLY}: not a buyer (${Object.keys(fx.buyers).join(', ')}) nor a demo target (${Object.keys(demoTargets(fx)).join(', ')})`);
  if (TEARDOWN) { await teardown(ONLY); return; }
  await seed();
}

function finish() {
  const what = TEARDOWN ? 'Teardown' : 'Seed';
  if (DRY_RUN) log(`DRY RUN complete (no writes) — ${problems.length} problem(s).`);
  if (problems.length) {
    console.error(`RESULT: ${what} FAILED — ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`RESULT: ${what} complete — 0 problems.`);
}

main().then(finish).catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
