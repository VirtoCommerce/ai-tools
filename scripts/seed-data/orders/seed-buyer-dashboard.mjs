#!/usr/bin/env node
/**
 * seed-buyer-dashboard.mjs — buyer /account/dashboard statistics fixtures (VCST-6078).
 *
 * Six dedicated AGENT-TEST buyers, each owning the orders that make ONE dashboard distinction
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
 * It also heals the shared {{EUR_USER_EMAIL}} persona: admin password reset to {{EUR_USER_PASSWORD}}
 * with forcePasswordChangeOnNextSignIn=false, then a read-back of passwordExpired + a token grant.
 *
 * HARD LIMIT: CustomerOrder.createdDate is server-assigned (KB-971BC129, re-measured on this build):
 * every order lands at the seed instant, so no storefront card can show a non-null delta from this
 * data. The wave instants are written to aliases.<env>.json so the API comparison can be asked over
 * them, and every dashboard expectation is valid for the day of the seed (re-seed with --refresh).
 *
 * Runtime ids + createdDate land in test-data/aliases.<env>.json; the fixture holds business keys.
 * Flags: --dry-run · --verbose · --teardown · --refresh (recreate every order at "now") · --only <BUYER>
 *        --no-persona (skip the EUR persona heal)
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
} from '../../lib/seed-common.mjs';
import {
  setFlags, authenticate, findUserByEmail, ensureMembershipContact, ensureSecurityAccount,
  searchMemberships, ensureOrgMembership, roleIdByName, deleteUserByEmail, findMemberById,
} from '../../lib/user-provision.mjs';
import {
  loadFixture, orderNumber, orderOrgKey, aliasFor, allOrderNumbers, fixtureProblems,
  expectedFigures, expectedComparison, demoTargets, demoOrderNumber, demoOrderNumbers, demoAdded,
} from './buyer-dashboard-specs.mjs';

const REFRESH = process.argv.includes('--refresh');
const NO_PERSONA = process.argv.includes('--no-persona');
const fx = loadFixture();
const overlayPath = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
const overlay = () => (existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {});
const buyersInScope = () => Object.entries(fx.buyers).filter(([k]) => !ONLY || k === ONLY);
const UNCFG = fx.unconfiguredCurrency;
const DEMO = ONLY ? demoTargets(fx)[ONLY] || null : null;

// ---- organizations ---------------------------------------------------------

async function findOrgByExactName(name) {
  const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: name, take: 50 });
  return (r?.results || []).find((m) => m.name === name) || null;
}

/** Reuse by the overlay id first (the member index lags right after a create), then by name. */
async function ensureOrg(orgKey, knownId) {
  const name = fx.orgs[orgKey];
  let org = knownId ? await findMemberById(knownId) : null;
  if (org && org.name !== name) org = null;
  if (!org) org = await findOrgByExactName(name);
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
  if (!(await currencyExists(UNCFG.code))) return;
  await api('DELETE', `/api/currencies?codes=${UNCFG.code}`, null, { expectStatus: [200, 204] });
  log(`currency ${UNCFG.code} removed — orders in it are now in an unconfigured currency`);
}

// ---- orders ----------------------------------------------------------------

/**
 * Exact-number lookup INCLUDING prototypes: customerOrders/search drops IsPrototype orders unless
 * withPrototypes=true (measured 2026-11-09 — the shared findOrdersByExactNumber missed the prototype
 * fixture, so teardown left it behind and a re-seed would have duplicated it).
 */
async function findOrdersByExactNumber(_api, number) {
  const r = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 100, withPrototypes: true });
  return (r?.results || []).filter((o) => o?.number === number);
}

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
  const hits = await findOrdersByExactNumber(api, number);
  for (const h of hits) {
    const full = await api('GET', `/api/order/customerOrders/${h.id}`);
    if (!force && !REFRESH && matches(full, want)) { verbose(`order ${number} kept`); return full; }
  }
  if (DRY_RUN) { log(`  [DRY] order ${number} would be ${hits.length ? 'rebuilt' : 'created'}`); return null; }
  if (o.currency === UNCFG.code) await ensureCurrency();
  const p = await lineProduct();
  const body = {
    number, storeId: o.store, customerId: owner.userId, customerName: b.email, currency: o.currency, status: o.status,
    organizationId: want.organizationId, organizationName: orgKey ? fx.orgs[orgKey] : null,
    isPrototype: want.isPrototype,
    items: [{ productId: p.id, sku: p.sku, name: `AGENT-TEST ${o.key}`, catalogId: p.catalogId, quantity: 1, price: o.total, placedPrice: o.total, extendedPrice: o.total, currency: o.currency }],
  };
  let created = await api('POST', '/api/order/customerOrders', body);
  let full = await api('GET', `/api/order/customerOrders/${created.id}`);
  if (want.isCancelled && !full.isCancelled) {
    await api('PUT', '/api/order/customerOrders', { ...full, isCancelled: true, cancelledDate: new Date().toISOString(), cancelReason: 'AGENT-TEST VCST-6078 flag-cancelled fixture' }, { expectStatus: [200, 204] });
    full = await api('GET', `/api/order/customerOrders/${created.id}`);
  }
  for (const h of hits) await api('DELETE', `/api/order/customerOrders?ids=${h.id}`, null, { expectStatus: [200, 204] });
  log(`  order ${number} ${o.currency} ${o.total} [${o.status}${want.isCancelled ? ', IsCancelled' : ''}${want.isPrototype ? ', IsPrototype' : ''}] → ${full.number} @ ${full.createdDate}`
    + `${matches(full, want) ? '' : '  ⚠ READ-BACK DIFFERS: ' + JSON.stringify({ total: full.total, isPrototype: full.isPrototype, isCancelled: full.isCancelled, status: full.status })}`);
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

function compare(key, b, rb, rates) {
  const lines = [];
  const e = b.expected;
  const chk = (label, want, got) => {
    if (!got) { lines.push(`    ${label}: NO DATA`); return; }
    const g = { count: got.count, total: got.total?.amount, average: got.average?.amount, excludedCount: got.excludedCount, excludedCurrencies: got.excludedCurrencies };
    const bad = ['count', 'total', 'average', 'excludedCount'].filter((f) => want[f] !== undefined && Math.abs((g[f] ?? NaN) - want[f]) > 0.011);
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
    lines.push(`    comparison(cur vs prev): ${ok ? 'match' : 'MISMATCH'} — got ${JSON.stringify({ ...got, totalChange: got.totalChange.amount })}${ok ? '' : `, expected ${JSON.stringify(want)}`}`);
  }
  return lines;
}

// ---- EUR persona heal ------------------------------------------------------

async function healEurPersona() {
  const email = process.env.EUR_USER_EMAIL; const pw = process.env.EUR_USER_PASSWORD;
  if (!email || !pw) { log('EUR persona: EUR_USER_EMAIL / EUR_USER_PASSWORD not set — skipped'); return null; }
  const before = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  if (!before?.id) { log(`EUR persona ${email}: account not found`); return null; }
  if (DRY_RUN) { log(`  [DRY] EUR persona: passwordExpired=${before.passwordExpired} — would reset its password to EUR_USER_PASSWORD (no forced change)`); return null; }
  const okReset = await resetSecurityPassword(api, email, pw);
  const after = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`);
  const tok = await buyerToken(email, pw, null);
  const res = { email, reset: okReset, passwordExpiredBefore: before.passwordExpired, passwordExpiredAfter: after.passwordExpired, tokenGrant: tok.error || 'OK' };
  log(`EUR persona ${email}: reset=${okReset} passwordExpired ${before.passwordExpired} → ${after.passwordExpired}; token grant ${res.tokenGrant}`);
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
  const hits = await findOrdersByExactNumber(api, number);
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
  log(`  order ${number} ${t.currency} ${o.total} [${o.status}] → ${full.id} @ ${full.createdDate}${matches(full, want) ? '' : '  ⚠ READ-BACK DIFFERS: ' + JSON.stringify({ total: full.total, customerId: full.customerId, organizationId: full.organizationId })}`);
  return full;
}

async function seedDemo(key, t) {
  log(`DEMO ${key} — ${t.orders.length} orders ${t.orderPrefix}* for the existing persona ${t.emailVar} (orders only)`);
  const owner = await resolveDemoOwner(key, t);
  const orders = {};
  for (const o of t.orders) orders[o.key] = await ensureDemoOrder(t, o, owner);
  if (DRY_RUN) { log('DRY RUN complete (no writes).'); return; }
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
  log(`READ-BACK as ${t.emailVar} over the demo window: ${ok ? 'match' : 'MISMATCH'} — got ${JSON.stringify(g ? { count: g.count, total: g.total?.amount, average: g.average?.amount } : r?.errors)}, expected ${JSON.stringify(want)}`);
  log(`Seed complete. Remove with: TEST_ENV=${TEST_ENV} npm run seed:buyer-dashboard:teardown -- --only ${key}`);
}

async function deleteDemoOrders(key, t) {
  for (const n of demoOrderNumbers(t)) {
    for (const o of await findOrdersByExactNumber(api, n)) {
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
  const ov = overlay(); delete ov[aliasFor(key)]; writeFileSync(overlayPath, `${JSON.stringify(ov, null, 2)}\n`);
  const residue = await verifyRemoved(async () => {
    let n = 0; for (const num of demoOrderNumbers(t)) n += (await findOrdersByExactNumber(api, num)).length; return n;
  });
  log(residue ? `⚠ ${residue} ${key} order(s) remain` : `${key} teardown complete — zero residue.`);
}

// ---- teardown --------------------------------------------------------------

async function teardown() {
  log('TEARDOWN — AGENT-TEST-BD-* orders, the six AGENT-TEST-BD buyers + orgs, currency XTS');
  const numbers = allOrderNumbers(fx);
  let needCurrency = false;
  for (const n of numbers) if (n.includes('UNCFG-X') && (await findOrdersByExactNumber(api, n)).length) needCurrency = true;
  if (needCurrency) await ensureCurrency(); // an order in a removed currency may not load for delete
  for (const n of numbers) {
    for (const o of await findOrdersByExactNumber(api, n)) {
      await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
      log(`  deleted order ${n} ${o.id}`);
    }
  }
  await removeCurrency();
  for (const [k, t] of Object.entries(demoTargets(fx))) await deleteDemoOrders(k, t); // orders only, never the persona
  for (const b of Object.values(fx.buyers)) await deleteUserByEmail(b.email);
  for (const name of Object.values(fx.orgs)) {
    const org = await findOrgByExactName(name);
    if (org) { await api('DELETE', `/api/members?ids=${org.id}`, null, { expectStatus: [200, 204] }); log(`  deleted org ${name}`); }
  }
  if (!DRY_RUN) {
    const ov = overlay();
    for (const k of [...Object.keys(fx.buyers), ...Object.keys(demoTargets(fx))]) delete ov[aliasFor(k)];
    writeFileSync(overlayPath, `${JSON.stringify(ov, null, 2)}\n`);
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const num of numbers) n += (await findOrdersByExactNumber(api, num)).length;
    for (const b of Object.values(fx.buyers)) if (await findUserByEmail(b.email)) n += 1;
    if (await currencyExists(UNCFG.code)) n += 1;
    return n;
  });
  log(residue ? `⚠ ${residue} residue item(s) after teardown (orgs are swept by name; the member index may lag)` : 'Teardown complete — zero residue (orders, users, currency).');
}

// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  await auth();
  setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
  await authenticate();
  const problems = fixtureProblems(fx);
  if (problems.length) throw new Error(`fixture contract broken — refusing to seed:\n  - ${problems.join('\n  - ')}`);
  if (DEMO) { if (TEARDOWN) await demoTeardown(ONLY, DEMO); else await seedDemo(ONLY, DEMO); return; }
  if (ONLY && !fx.buyers[ONLY]) throw new Error(`--only ${ONLY}: not a buyer (${Object.keys(fx.buyers).join(', ')}) nor a demo target (${Object.keys(demoTargets(fx)).join(', ')})`);
  if (TEARDOWN) { await teardown(); return; }

  const ov = overlay();
  const orgIds = {};
  const neededOrgs = new Set(buyersInScope().flatMap(([, b]) => [b.org, ...b.orders.map((o) => orderOrgKey(b, o))]).filter(Boolean));
  for (const k of neededOrgs) {
    const known = Object.keys(fx.buyers).map((bk) => ov[aliasFor(bk)]?.org_ids?.[k]).find(Boolean);
    orgIds[k] = await ensureOrg(k, known);
  }

  const live = (await api('GET', '/api/currencies')).filter((c) => c.code !== UNCFG.code);
  const rates = Object.fromEntries(live.map((c) => [c.code, c.exchangeRate]));
  log(`platform currencies (rate to primary): ${live.map((c) => `${c.code}=${c.exchangeRate}`).join(', ')}`);

  const summary = [];
  for (const [key, b] of buyersInScope()) {
    log(`\n— ${key} —`);
    const owner = await ensureBuyer(key, b, orgIds);
    if (DRY_RUN) { await seedBuyerOrders(key, b, owner, orgIds); continue; }
    const orders = await seedBuyerOrders(key, b, owner, orgIds);
    const windows = {
      prev: waveWindow(b.orders.filter((o) => o.wave === 'prev').map((o) => orders[o.key]).filter(Boolean)),
      cur: waveWindow(b.orders.filter((o) => o.wave === 'cur').map((o) => orders[o.key]).filter(Boolean)),
    };
    const orgsUsed = Object.fromEntries([b.org, ...b.orders.map((o) => orderOrgKey(b, o))].filter(Boolean).map((k) => [k, orgIds[k]]));
    writeEnvAliasOverride({
      [aliasFor(key)]: {
        user_id: owner.userId, contact_id: owner.contactId, org_id: owner.orgId || '', org_ids: orgsUsed,
        orders: Object.fromEntries(Object.entries(orders).map(([k, o]) => [k, { id: o.id, number: o.number, createdDate: o.createdDate, currency: o.currency, total: o.total, storeId: o.storeId, isCancelled: !!o.isCancelled, isPrototype: !!o.isPrototype }])),
        windows, seededAt: new Date().toISOString(),
      },
    });
    summary.push({ key, b, owner, windows });
  }
  if (!DRY_RUN && buyersInScope().some(([k]) => k === 'UNCFG')) await removeCurrency();

  const persona = (!NO_PERSONA && !ONLY) ? await healEurPersona() : null;

  if (DRY_RUN) { log('DRY RUN complete (no writes).'); return; }
  log('\nREAD-BACK — orderStatistics as each buyer (token customer + token org)');
  for (const s of summary) {
    const rb = await readBack(s.key, s.b, s.owner, s.windows);
    log(`  ${s.key} sign-in ${rb.signIn}${rb.me ? ` (me.passwordExpired=${rb.me.passwordExpired}, token org=${rb.me.contact?.organizationId || 'none'})` : ''}${rb.errors ? ` errors=${JSON.stringify(rb.errors)}` : ''}`);
    if (rb.data) for (const l of compare(s.key, s.b, rb, rates)) log(l);
  }
  // A removed currency must not take the admin order search down for everyone (VCST-6535 class).
  try { await api('POST', '/api/order/customerOrders/search', { take: 5 }); log('admin order search after XTS removal: OK'); } catch (e) { log(`⚠ admin order search after XTS removal FAILED: ${e.message.slice(0, 200)}`); }
  if (persona) log(`EUR persona: ${JSON.stringify(persona)}`);
  log('Seed complete. Runtime ids → test-data/aliases.' + TEST_ENV + '.json');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
