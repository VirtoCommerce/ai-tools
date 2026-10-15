#!/usr/bin/env node
/**
 * seed-sales-rep-perf.mjs — the Sales Rep PERFORMANCE dataset (VCST-5755 AC-5).
 *
 * One DEDICATED rep (SR_REP_PERF) serving 15 DEDICATED orgs (AGENT-TEST-SR-PERF-ORG-01..15) in
 * B2B-store, and N rep-created orders (AGENT-TEST-SRPERF-000001..N) spread over org / status /
 * product lines / intended date. Shape, rationale and the discriminating-power guard live in
 * sales-rep-perf-specs.mjs (single source of truth); this file only resolves and POSTs.
 *
 * Transport (reused from seed-sales-rep.mjs / seed-sales-rep-stats.mjs, not reinvented):
 *   rep + memberships  POST /api/sales-rep (module creates the account + per-org memberships)
 *   orgs               POST /api/members
 *   orders             POST /api/order/customerOrders, customerId = the rep's ApplicationUser id
 *                      (what the creator-scoped statistics match — NOT the Contact id, BL-SR-002)
 *   products           live-discovered from the store via the storefront xAPI as the rep
 *
 * Resumable + idempotent: existing orders are enumerated by number prefix (the search keyword is a
 * prefix match) and only MISSING indices 1..N are created — a crashed 50k run is restarted with the
 * same command. Teardown is batched and restartable: it re-searches page 0 and deletes until empty.
 *
 * Flags:
 *   --count N            target number of orders (indices 1..N); required for a seed run
 *   --concurrency C      parallel order POSTs (default 1)
 *   --ladder 1x10,5x30   measured batches "<concurrency>x<orders>"; escalation stops at the first
 *                        5xx/429 or a p95 > 3x the first step's (remaining batches run at the last
 *                        good concurrency). Overrides --concurrency.
 *   --verify             after seeding, query the rep's scoped xAPI and compare with the spec
 *   --dry-run · --verbose · --teardown [--batch B=5] [--concurrency C=5]
 *
 * Run:      TEST_ENV=vcptcore npm run seed:sales-rep-perf -- --count 100 --ladder 1x10,5x30,10x60 --verify
 * Teardown: TEST_ENV=vcptcore npm run seed:sales-rep-perf:teardown
 */
import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import {
  assertSafeTarget, auth, api, log, verbose, writeEnvAliasOverride, resetSecurityPassword,
  idsParam, DRY_RUN, TEARDOWN, BACK_URL,
} from '../../lib/seed-common.mjs';
import {
  PERF_REP, PERF_ORG_NAMES, PERF_ORG_PREFIX, PERF_ORDER_MARK, PERF_STORE, PERF_CURRENCY, PERF_PRODUCT_SLOTS,
  MAX_COUNT, perfOrderSpec, perfOrderTotal, buildPerfItems, datasetProfile, datasetShortfalls,
  parsePerfOrderIndex, percentile,
} from './sales-rep-perf-specs.mjs';

const argv = process.argv.slice(2);
const argVal = (name, dflt = null) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const COUNT = argVal('--count') != null ? parseInt(argVal('--count'), 10) : null;
const CONCURRENCY = Math.max(1, parseInt(argVal('--concurrency', '1'), 10) || 1);
const LADDER = argVal('--ladder');
// Teardown defaults = the fastest shape measured on vcptcore-qa 2026-10-12: 5 parallel DELETEs of 5 ids
// (~1.3 orders/s) beat one DELETE of 25 ids (~0.36/s) and 10 parallel single-id DELETEs (~0.63/s).
const BATCH = Math.max(1, parseInt(argVal('--batch', '5'), 10) || 5);
const TD_CONCURRENCY = Math.max(1, parseInt(argVal('--concurrency', '5'), 10) || 5);
const VERIFY = argv.includes('--verify');
const REP_PASSWORD = process.env.SR_REP_PASSWORD || process.env.TEST_USER_PASSWORD || 'Password1!';

const now = () => performance.now();
const statusOf = (e) => { const m = /→ (\d{3})/.exec(String(e?.message || e)); return m ? parseInt(m[1], 10) : 0; };

// ---- orgs -------------------------------------------------------------------

async function findOrgByName(name) {
  const res = await api('POST', '/api/members/search', { keyword: name, memberType: 'Organization', take: 20, deep: true });
  return (res?.results || []).find((m) => m.name === name) || null;
}

async function ensurePerfOrgs() {
  const out = [];
  for (const [i, name] of PERF_ORG_NAMES.entries()) {
    let m = await findOrgByName(name);
    if (!m) {
      m = await api('POST', '/api/members', {
        memberType: 'Organization', name, status: 'Active', businessCategory: 'AGENT-TEST Perf',
        outerId: `${PERF_ORG_PREFIX.replace(/-$/, '')}:${String(i + 1).padStart(2, '0')}`,
        addresses: [{ addressType: 'Shipping', line1: `${i + 1} Perf Ave`, city: 'Seattle', regionName: 'WA', countryName: 'United States', countryCode: 'USA', postalCode: '98101', isDefault: true }],
      });
      log(`org created: ${name} (${m?.id})`);
    } else verbose(`org exists: ${name} (${m.id})`);
    out.push({ id: m?.id, name });
  }
  return out;
}

// ---- rep --------------------------------------------------------------------

async function findRep() {
  // Matched by EMAIL (the account key), not fullName: the module derives fullName from first+last.
  const res = await api('POST', '/api/sales-rep/search', { keyword: PERF_REP.email, take: 20, skip: 0 });
  const mine = (r) => (r.emails || []).some((e) => String(e).toLowerCase() === PERF_REP.email) || r.userName === PERF_REP.email;
  for (const r of res?.results || []) {
    if (mine(r)) return r;
    const full = await api('GET', `/api/sales-rep/${r.id}`, null, { expectStatus: [200, 404] });
    if (full && mine(full)) return full;
  }
  return null;
}
async function resolveUserId(email) {
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  return u?.id || null;
}

async function ensurePerfRep(orgs) {
  const served = orgs.filter((o) => o.id).map((o) => ({ organizationId: o.id, organizationName: o.name }));
  const found = await findRep();
  let rep;
  if (!found) {
    const roles = await api('GET', '/api/sales-rep/roles');
    const role = (roles || []).find((r) => r.name === 'Sales Representative') || (roles || [])[0];
    if (!role) throw new Error('no sales-rep role on this env (GET /api/sales-rep/roles is empty)');
    rep = await api('POST', '/api/sales-rep', {
      firstName: PERF_REP.firstName, lastName: PERF_REP.lastName, fullName: PERF_REP.fullName,
      emails: [PERF_REP.email], storeId: PERF_REP.store, password: REP_PASSWORD,
      roleId: role.id, isLocked: false, organizations: served,
    });
    log(`rep created: ${PERF_REP.key} (${rep?.id}) role "${role.name}" serving ${served.length} org(s)`);
  } else {
    rep = await api('GET', `/api/sales-rep/${found.id}`);
    const have = new Set((rep?.organizations || []).map((o) => o.organizationId));
    const missing = served.filter((o) => !have.has(o.organizationId));
    const nameDrift = rep.firstName !== PERF_REP.firstName || rep.lastName !== PERF_REP.lastName;
    if (missing.length || nameDrift) {
      rep.organizations = [...(rep.organizations || []), ...missing];
      Object.assign(rep, { firstName: PERF_REP.firstName, lastName: PERF_REP.lastName, fullName: PERF_REP.fullName });
      delete rep.password;
      await api('PUT', '/api/sales-rep', rep, { expectStatus: [200, 204] });
      rep = await api('GET', `/api/sales-rep/${found.id}`);
      log(`rep ${PERF_REP.key}: healed (${missing.length} membership(s) added${nameDrift ? `, name -> "${rep?.fullName}"` : ''})`);
    } else log(`rep exists: ${PERF_REP.key} (${rep.id}) "${rep.fullName}" serving ${have.size} org(s)`);
    await resetSecurityPassword(api, PERF_REP.email, REP_PASSWORD, { silent: true });
  }
  if (DRY_RUN) return { contactId: rep?.id, userId: null };
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(PERF_REP.email)}`, null, { expectStatus: [200, 404] });
  if (u?.id && !u.emailConfirmed) { u.emailConfirmed = true; await api('PUT', '/api/platform/security/users', u, { expectStatus: [200, 204] }); }
  const userId = u?.id || rep?.userId;
  if (!userId) throw new Error(`no ApplicationUser for ${PERF_REP.email} — orders would be unattributable`);
  return { contactId: rep?.id, userId };
}

// ---- storefront xAPI as the rep ----------------------------------------------

async function repToken() {
  // The scoped sales-rep grant needs storeId. Try the form the sibling seeders use first, then the
  // BARE grant (no scope) — vcptcore-qa has been seen rejecting a correct password when extras are sent.
  for (const extra of [{ scope: 'offline_access' }, {}]) {
    const res = await fetch(`${BACK_URL}/connect/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', username: PERF_REP.email, password: REP_PASSWORD, storeId: PERF_STORE, ...extra }),
    });
    if (res.ok) return (await res.json()).access_token;
    verbose(`rep token (${Object.keys(extra).join(',') || 'bare'}) -> ${res.status}`);
  }
  throw new Error('rep token failed with both grant forms');
}

async function gql(token, query, endpoint = '/graphql') {
  const t0 = now();
  const res = await fetch(`${BACK_URL}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  const ms = Math.round(now() - t0);
  if (body.errors) throw new Error(`GraphQL: ${JSON.stringify(body.errors.map((e) => e.message)).slice(0, 300)}`);
  return { data: body.data || {}, ms };
}

/** Distinct buyable store products with a catalogId (OrderLineItem.CatalogId is NOT NULL). */
async function discoverProducts(token, need) {
  const out = []; const seen = new Set();
  for (let page = 0; page < 20 && out.length < need; page++) {
    const { data } = await gql(token, `{ products(storeId:"${PERF_STORE}", cultureName:"en-US", currencyCode:"${PERF_CURRENCY}", first: 50, after:"${page * 50}", sort:"code:asc", query:"") {
      items { id code name catalogId imgSrc availabilityData { isBuyable } } } }`);
    const items = data?.products?.items || [];
    if (!items.length) break;
    for (const p of items) {
      if (!p.availabilityData?.isBuyable || !p.code || !p.catalogId || seen.has(p.code)) continue;
      seen.add(p.code);
      out.push({ id: p.id, sku: p.code, name: String(p.name || p.code).replace(/\s+/g, ' ').trim(), catalogId: p.catalogId, imgSrc: p.imgSrc || null });
      if (out.length >= need) break;
    }
  }
  return out;
}

// ---- orders -------------------------------------------------------------------

/** Every existing AGENT-TEST-SRPERF-* order: Map<index, {id, customerId, createdDate}>. */
async function listPerfOrders() {
  const map = new Map(); const take = 500;
  for (let skip = 0; ; skip += take) {
    const res = await api('POST', '/api/order/customerOrders/search', { keyword: PERF_ORDER_MARK, take, skip, sort: 'number:asc', responseGroup: 'Default' });
    const rows = res?.results || [];
    for (const o of rows) {
      const idx = parsePerfOrderIndex(o.number);
      if (idx != null) map.set(idx, { id: o.id, customerId: o.customerId, createdDate: o.createdDate, isCancelled: o.isCancelled });
    }
    if (rows.length < take) break;
  }
  return map;
}

function orderBody(spec, org, userId, products) {
  const items = buildPerfItems(spec, products);
  const total = perfOrderTotal(spec);
  const customerName = `${PERF_REP.fullName}`;
  const addr = (addressType) => ({
    addressType, firstName: 'AGENT-TEST', lastName: 'Perf', line1: `${spec.orgIndex} Perf Ave`, city: 'Seattle',
    regionName: 'WA', countryCode: 'USA', countryName: 'United States', postalCode: '98101',
    phone: '+1-206-555-0100', email: 'agent-test-sr-perf-order@example.com',
  });
  const ship = addr('Shipping'); const bill = addr('Billing');
  return {
    number: spec.number, storeId: PERF_STORE, organizationId: org.id, organizationName: org.name,
    customerId: userId, customerName, currency: PERF_CURRENCY, status: spec.status,
    // Sent on purpose: if the platform ever honours it, the dataset spreads over time on its own.
    createdDate: spec.intendedCreatedDate,
    ...(spec.isCancelled ? { isCancelled: true, cancelledDate: new Date().toISOString(), cancelReason: 'AGENT-TEST perf dataset' } : {}),
    total, subTotal: total, shippingTotal: 0, shippingTotalWithTax: 0, taxTotal: 0,
    items, addresses: [ship, bill],
    // Totals lesson from seed-sales-rep.mjs: zero shipment/payment totals or order.Total drifts.
    shipments: [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground', currency: PERF_CURRENCY,
      organizationId: org.id, organizationName: org.name, price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'New', number: `${spec.number}-S1`, deliveryAddress: ship, items: [],
    }],
    inPayments: [{
      gatewayCode: 'DefaultManualPaymentMethod', currency: PERF_CURRENCY, customerId: userId, customerName,
      organizationId: org.id, organizationName: org.name, sum: total, price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'New', paymentStatus: 'New', number: `${spec.number}-P1`, billingAddress: bill,
    }],
  };
}

/** Create `indices` with `conc` workers; returns per-order samples. */
async function createBatch(indices, conc, ctx) {
  const samples = []; let next = 0;
  const t0 = now();
  async function worker() {
    while (next < indices.length) {
      const idx = indices[next++];
      const spec = perfOrderSpec(idx);
      const body = orderBody(spec, ctx.orgs[spec.orgIndex - 1], ctx.userId, ctx.products);
      const s0 = now();
      try {
        const created = await api('POST', '/api/order/customerOrders', body);
        const ms = now() - s0;
        const back = created?.createdDate ? new Date(created.createdDate) : null;
        const honoured = !!back && Math.abs(back - new Date(spec.intendedCreatedDate)) < 86400000;
        samples.push({ idx, ms, ok: true, honoured, cancelledOk: spec.isCancelled ? created?.isCancelled === true : null });
      } catch (e) {
        samples.push({ idx, ms: now() - s0, ok: false, status: statusOf(e), err: String(e.message).slice(0, 200) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, indices.length) }, worker));
  return { samples, wallMs: now() - t0 };
}

function summarize(label, conc, { samples, wallMs }) {
  const ok = samples.filter((s) => s.ok); const lat = ok.map((s) => s.ms);
  const errs = samples.filter((s) => !s.ok);
  const r = {
    label, concurrency: conc, orders: samples.length, ok: ok.length, errors: errs.length,
    errorStatuses: [...new Set(errs.map((e) => e.status))],
    p50: Math.round(percentile(lat, 50) ?? 0), p95: Math.round(percentile(lat, 95) ?? 0), max: Math.round(Math.max(0, ...lat)),
    ordersPerSec: Math.round((ok.length / (wallMs / 1000)) * 100) / 100, wallSec: Math.round(wallMs / 100) / 10,
    createdDateHonoured: ok.filter((s) => s.honoured).length,
    cancelledFlagPersisted: ok.filter((s) => s.cancelledOk === true).length,
    cancelledFlagLost: ok.filter((s) => s.cancelledOk === false).length,
  };
  log(`[${label}] c=${conc} n=${r.orders} ok=${r.ok} err=${r.errors}${r.errors ? ` ${JSON.stringify(r.errorStatuses)}` : ''}  p50=${r.p50}ms p95=${r.p95}ms max=${r.max}ms  ${r.ordersPerSec} orders/s (${r.wallSec}s)  createdDate honoured ${r.createdDateHonoured}/${r.ok}`);
  for (const e of errs.slice(0, 3)) log(`    error #${e.idx}: ${e.err}`);
  return r;
}

function parseLadder(s) {
  return s.split(',').map((p) => { const [c, n] = p.split('x').map((x) => parseInt(x, 10)); return { conc: c, n }; })
    .filter((x) => x.conc > 0 && x.n > 0);
}

// ---- verify (rep's scoped xAPI) -----------------------------------------------

async function verify(orgs, expectedCount) {
  const tok = await repToken();
  const prof = datasetProfile(expectedCount);
  const from = '2000-01-01T00:00:00.000Z'; const to = new Date(Date.now() + 86400000).toISOString();
  const stats = await gql(tok, `{ s: salesRepCustomerOrderStatistics(storeId:"${PERF_STORE}") { currencyCode all: period(from:"${from}", to:"${to}") { count total { amount } } } }`, '/graphql/sales-rep');
  const again = await gql(tok, `{ s: salesRepCustomerOrderStatistics(storeId:"${PERF_STORE}") { all: period(from:"${from}", to:"${to}") { count } } }`, '/graphql/sales-rep');
  const top = await gql(tok, `{ u: salesRepTopSellers(storeId:"${PERF_STORE}", sort:"by-units", take:10) { sku units } r: salesRepTopSellers(storeId:"${PERF_STORE}", sort:"by-revenue", take:10) { sku units } }`, '/graphql/sales-rep');
  let listed = 0;
  for (const o of orgs) {
    const { data } = await gql(tok, `{ salesRepOrders(organizationId:"${o.id}") { totalCount } }`, '/graphql/sales-rep');
    listed += data?.salesRepOrders?.totalCount || 0;
  }
  const statCount = stats.data?.s?.all?.count;
  log(`verify: salesRepOrders totalCount summed over ${orgs.length} orgs = ${listed} (expect ${expectedCount})`);
  log(`verify: salesRepCustomerOrderStatistics all-time count = ${statCount} (expect ${prof.statsCount} = ${expectedCount} - ${prof.cancelled} cancelled), total=${stats.data?.s?.all?.total?.amount} ${stats.data?.s?.currencyCode} (spec ${prof.statsTotal})`);
  log(`verify: stats query latency ${stats.ms}ms first call, ${again.ms}ms repeat (cache TTL setting untouched); top sellers ${top.ms}ms`);
  log(`verify: top by-units  ${(top.data?.u || []).map((x) => x.sku).join(', ')}`);
  log(`verify: top by-revenue ${(top.data?.r || []).map((x) => x.sku).join(', ')}`);
  return { listed, statCount, expectedStats: prof.statsCount, statsMs: stats.ms, statsRepeatMs: again.ms, topMs: top.ms };
}

async function health() {
  try {
    const res = await fetch(`${BACK_URL}/health`);
    const body = await res.json().catch(() => ({}));
    const bad = Object.entries(body).filter(([, v]) => v?.Status && v.Status !== 'Healthy').map(([k, v]) => `${k}=${v.Status}`);
    log(`health: HTTP ${res.status}, ${Object.keys(body).length} check(s), ${bad.length ? `NOT healthy: ${bad.join(', ')}` : 'all Healthy'}`);
  } catch (e) { log(`health: unreachable (${e.message})`); }
}

// ---- teardown -----------------------------------------------------------------

async function teardown() {
  log(`TEARDOWN — deleting only ${PERF_ORDER_MARK}-* orders, ${PERF_REP.fullName}, ${PERF_ORG_PREFIX}NN orgs`);
  // 1. Orders, bottom-up. Re-search page 0 every round: restartable, no skip drift while deleting.
  let deleted = 0; const t0 = now(); let prevFirst = null;
  for (let round = 0; ; round++) {
    const res = await api('POST', '/api/order/customerOrders/search', { keyword: PERF_ORDER_MARK, take: Math.max(250, BATCH * TD_CONCURRENCY), skip: 0 });
    const ids = (res?.results || []).filter((o) => parsePerfOrderIndex(o.number) != null).map((o) => o.id);
    if (!ids.length) break;
    if (DRY_RUN) { log(`  [DRY] would delete ${res?.totalCount ?? ids.length} perf order(s)`); break; }
    // A delete that silently did nothing would otherwise loop forever on the same page.
    if (ids[0] === prevFirst) throw new Error(`order ${ids[0]} survived its delete — stopping (re-run to resume)`);
    prevFirst = ids[0];
    const chunks = []; for (let i = 0; i < ids.length; i += BATCH) chunks.push(ids.slice(i, i + BATCH));
    // One (slow, ~10s) search feeds many DELETE waves; TD_CONCURRENCY workers drain the chunks.
    let ci = 0;
    await Promise.all(Array.from({ length: Math.min(TD_CONCURRENCY, chunks.length) }, async () => {
      while (ci < chunks.length) { const c = chunks[ci++]; await api('DELETE', `/api/order/customerOrders?${idsParam(c)}`, null, { expectStatus: [200, 204] }); }
    }));
    deleted += ids.length;
    log(`  deleted ${deleted} order(s) so far (${Math.round((deleted / ((now() - t0) / 1000)) * 10) / 10}/s)`);
  }
  if (!DRY_RUN) log(`  orders deleted: ${deleted} in ${Math.round((now() - t0) / 100) / 10}s`);
  // 2. Rep BEFORE its orgs: deleting a served org first leaves it dangling in the rep record.
  const rep = await findRep();
  if (rep?.id) { await api('DELETE', `/api/sales-rep?ids=${rep.id}`, null, { expectStatus: [200, 204] }); log(DRY_RUN ? '  [DRY] would delete rep' : `  deleted rep ${PERF_REP.key}`); }
  // 3. Orgs.
  const orgIds = [];
  for (const name of PERF_ORG_NAMES) { const m = await findOrgByName(name); if (m?.id) orgIds.push(m.id); }
  if (orgIds.length) { await api('DELETE', `/api/members?${idsParam(orgIds)}`, null, { expectStatus: [200, 204] }); log(DRY_RUN ? `  [DRY] would delete ${orgIds.length} org(s)` : `  deleted ${orgIds.length} org(s)`); }
  if (DRY_RUN) { log('Teardown complete (dry run — no writes).'); return; }
  // 4. Zero residue.
  const ordersLeft = (await api('POST', '/api/order/customerOrders/search', { keyword: PERF_ORDER_MARK, take: 1 }))?.totalCount || 0;
  const repLeft = (await findRep()) ? 1 : 0;
  const accountLeft = (await resolveUserId(PERF_REP.email)) ? 1 : 0;
  let orgsLeft = 0; for (const name of PERF_ORG_NAMES) if (await findOrgByName(name)) orgsLeft++;
  const residue = ordersLeft + repLeft + accountLeft + orgsLeft;
  log(residue === 0 ? '  verifyRemoved: zero residue' : `  WARN verifyRemoved: orders=${ordersLeft} rep=${repLeft} account=${accountLeft} orgs=${orgsLeft} (re-run the same command)`);
  writeEnvAliasOverride({ SR_REP_PERF: { id: '', user_id: '' }, SR_PERF_DATASET: { org_ids: '', order_count: '', stats_order_count: '', seeded_at: '' } });
  log('Teardown complete.');
}

// ---- main ---------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  if (!TEARDOWN) {
    if (!Number.isInteger(COUNT) || COUNT < 1) throw new Error('--count N is required (the operator chooses the scale)');
    if (COUNT > MAX_COUNT) throw new Error(`--count ${COUNT} exceeds MAX_COUNT ${MAX_COUNT}`);
    const short = datasetShortfalls(COUNT);
    if (short.length) throw new Error(`a ${COUNT}-order dataset could not answer the chain's question:\n  - ${short.join('\n  - ')}`);
  }
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  const orgs = await ensurePerfOrgs();
  const { contactId, userId } = await ensurePerfRep(orgs);
  log(`rep ${PERF_REP.email} contact=${contactId} ApplicationUser=${userId}`);
  if (DRY_RUN) { const p = datasetProfile(COUNT); log(`[DRY] would create up to ${COUNT} order(s): ${p.lines} lines, ${p.cancelled} cancelled, per-org ${JSON.stringify(p.perOrg)}`); log('DRY RUN complete (no writes).'); return; }

  const products = await discoverProducts(await repToken(), PERF_PRODUCT_SLOTS);
  if (products.length < PERF_PRODUCT_SLOTS) throw new Error(`need ${PERF_PRODUCT_SLOTS} distinct buyable store products, found ${products.length}`);
  verbose(`products: ${products.map((p) => p.sku).join(', ')}`);

  const existing = await listPerfOrders();
  const foreign = [...existing.values()].filter((o) => o.customerId !== userId).length;
  if (foreign) log(`WARN: ${foreign} existing perf order(s) are attributed to another user id — they are not rebuilt here; run the teardown to reset`);
  const missing = []; for (let i = 1; i <= COUNT; i++) if (!existing.has(i)) missing.push(i);
  log(`orders: ${existing.size} present, ${missing.length} to create (target ${COUNT})`);

  const ctx = { orgs, userId, products };
  const results = [];
  if (missing.length) {
    const steps = LADDER ? parseLadder(LADDER) : [{ conc: CONCURRENCY, n: missing.length }];
    let cursor = 0; let goodConc = steps[0].conc; let stopRaising = false; let baseP95 = null;
    for (const [si, step] of steps.entries()) {
      if (cursor >= missing.length) break;
      const isLast = si === steps.length - 1;
      const take = isLast ? missing.length - cursor : Math.min(step.n, missing.length - cursor);
      const conc = stopRaising ? goodConc : step.conc;
      const r = summarize(`step ${si + 1}`, conc, await createBatch(missing.slice(cursor, cursor + take), conc, ctx));
      results.push(r); cursor += take;
      if (baseP95 == null && r.ok) baseP95 = r.p95;
      if (r.errors || (baseP95 && r.p95 > 3 * baseP95)) {
        if (!stopRaising) log(`  escalation stopped at c=${conc} (${r.errors ? `errors ${JSON.stringify(r.errorStatuses)}` : `p95 ${r.p95}ms > 3x ${baseP95}ms`}); continuing at c=${goodConc}`);
        stopRaising = true;
      } else if (!stopRaising) goodConc = conc;
    }
  }

  const after = await listPerfOrders();
  const prof = datasetProfile(COUNT);
  writeEnvAliasOverride({
    SR_REP_PERF: { id: contactId, user_id: userId },
    SR_PERF_DATASET: { org_ids: orgs.map((o) => o.id).join(';'), order_count: String(after.size), stats_order_count: String(prof.statsCount), seeded_at: new Date().toISOString() },
  });
  log(`write-back -> aliases.${process.env.TEST_ENV || 'vcst'}.json: SR_REP_PERF, SR_PERF_DATASET (orders present: ${after.size})`);
  const honoured = [...after.values()].filter((o) => o.createdDate && (Date.now() - new Date(o.createdDate)) > 2 * 86400000).length;
  log(`createdDate: ${honoured}/${after.size} order(s) dated more than 2 days in the past`);
  if (results.length) console.log(`PERF_RESULTS ${JSON.stringify(results)}`);
  if (VERIFY) await verify(orgs, COUNT);
  await health();
  log('Seed complete.');
}
main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
