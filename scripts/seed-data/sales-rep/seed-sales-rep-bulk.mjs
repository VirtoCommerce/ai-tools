#!/usr/bin/env node
/**
 * seed-sales-rep-bulk.mjs — BULK-VOLUME orders for the plain rep SR_REP_PRIMARY (089 SR-FE-052 and the
 * hub's large-number layout). Shape, sizing and the discriminating-power guard: sales-rep-bulk-specs.mjs.
 *
 * What it touches, and nothing else:
 *   orgs        AGENT-TEST-SR-BULK-ORG-01 / -02 (find-or-create, POST /api/members)
 *   membership  SR_REP_PRIMARY gains those two orgs (GET + PUT /api/sales-rep, other memberships and
 *               fields untouched). The rep itself is NEVER created, renamed, re-passworded or deleted,
 *               and its layouts / tasks / carts are not read or written.
 *   orders      AGENT-TEST-SRBULK-000001..N, customerId = SR_REP_PRIMARY's ApplicationUser id (what the
 *               creator-scoped statistics match, BL-SR-002). Products live-discovered from the store.
 *
 * Resumable + idempotent like seed-sales-rep-perf.mjs (whose transport it mirrors): existing orders are
 * enumerated by number prefix and only the MISSING indices are created.
 *
 * Teardown order (bottom-up): orders -> drop ONLY the two bulk orgs from the rep -> delete the orgs
 * (an org deleted while still served stays dangling in the rep record, KB-843D0515).
 * NOTE: removing a served org via PUT /api/sales-rep can end the rep's live storefront sessions
 * (KB-1B066196) — run the teardown when nobody is mid-run as SR_REP_PRIMARY.
 *
 * Flags: --count N (default BULK_DEFAULT_COUNT) · --concurrency C (default 5) · --verify ·
 *        --dry-run · --verbose · --teardown [--batch B=5] [--concurrency C=5]
 *
 * Run:      TEST_ENV=vcptcore npm run seed:sales-rep-bulk -- --verify
 * Teardown: TEST_ENV=vcptcore npm run seed:sales-rep-bulk:teardown
 */
import '../../lib/sync-stdio.mjs';
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv, writeEnvAliasOverride, idsParam,
  DRY_RUN, TEARDOWN, BACK_URL,
} from '../../lib/seed-common.mjs';
import { buildStatisticsWindows } from './sales-rep-stats-specs.mjs';
import {
  BULK_REP_KEY, BULK_STORE, BULK_CURRENCY, BULK_ORDER_MARK, BULK_ORGS, BULK_CUSTOMER_NAME, BULK_DEFAULT_COUNT,
  BULK_PRODUCT_SLOTS, BULK_DATASET_ALIAS, bulkOrderSpec, bulkOrderTotal, buildBulkItems, bulkProfile,
  bulkShortfalls, parseBulkOrderIndex,
} from './sales-rep-bulk-specs.mjs';

const argv = process.argv.slice(2);
const argVal = (name, dflt = null) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const COUNT = argVal('--count') != null ? parseInt(argVal('--count'), 10) : BULK_DEFAULT_COUNT;
const CONCURRENCY = Math.max(1, parseInt(argVal('--concurrency', '5'), 10) || 5);
const BATCH = Math.max(1, parseInt(argVal('--batch', '5'), 10) || 5);
const VERIFY = argv.includes('--verify');
const REP_PASSWORD = process.env.SR_REP_PASSWORD || process.env.TEST_USER_PASSWORD || 'Password1!';

const now = () => performance.now();

function repRow() {
  const row = loadCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === BULK_REP_KEY);
  if (!row) throw new Error(`rep_key ${BULK_REP_KEY} missing from test-data/sales-rep/sales-reps.csv`);
  return row;
}

// ---- orgs -------------------------------------------------------------------

async function findOrgByName(name) {
  const res = await api('POST', '/api/members/search', { keyword: name, memberType: 'Organization', take: 20, deep: true });
  return (res?.results || []).find((m) => m.name === name) || null;
}

async function ensureBulkOrgs() {
  const out = [];
  for (const o of BULK_ORGS) {
    let m = await findOrgByName(o.name);
    if (!m) {
      if (DRY_RUN) { log(`[DRY] would create org ${o.name}`); out.push({ ...o, id: null }); continue; }
      m = await api('POST', '/api/members', {
        memberType: 'Organization', name: o.name, status: 'Active', businessCategory: 'AGENT-TEST Bulk',
        outerId: `AGENT-TEST-SR-BULK:${o.key}`,
        addresses: [{ addressType: 'Shipping', line1: `${o.index} Bulk Ave`, city: 'Seattle', regionName: 'WA', countryName: 'United States', countryCode: 'USA', postalCode: '98101', isDefault: true }],
      });
      log(`org created: ${o.name} (${m?.id})`);
    } else verbose(`org exists: ${o.name} (${m.id})`);
    out.push({ ...o, id: m?.id });
  }
  return out;
}

// ---- rep (existing; membership only) ------------------------------------------

async function findRep(email, fullName) {
  const res = await api('POST', '/api/sales-rep/search', { keyword: fullName, take: 50, skip: 0 });
  for (const r of res?.results || []) {
    const full = await api('GET', `/api/sales-rep/${r.id}`, null, { expectStatus: [200, 404] });
    if (full && ((full.emails || []).some((e) => String(e).toLowerCase() === email) || full.userName === email)) return full;
  }
  return null;
}

async function ensureMembership(rep, orgs) {
  const have = new Set((rep.organizations || []).map((o) => o.organizationId));
  const missing = orgs.filter((o) => !o.id || !have.has(o.id));
  if (!missing.length) { log(`rep ${BULK_REP_KEY} already serves both bulk orgs (${have.size} org(s) total)`); return; }
  if (DRY_RUN) { log(`[DRY] would add ${missing.length} bulk org(s) to ${BULK_REP_KEY}'s served orgs`); return; }
  const body = { ...rep, organizations: [...(rep.organizations || []), ...missing.map((o) => ({ organizationId: o.id, organizationName: o.name }))] };
  delete body.password;
  await api('PUT', '/api/sales-rep', body, { expectStatus: [200, 204] });
  log(`rep ${BULK_REP_KEY}: added ${missing.length} bulk org membership(s)`);
}

async function dropMembership(rep, orgIds) {
  const drop = new Set(orgIds);
  const keep = (rep.organizations || []).filter((o) => !drop.has(o.organizationId));
  if (keep.length === (rep.organizations || []).length) return 0;
  if (DRY_RUN) return (rep.organizations || []).length - keep.length;
  const body = { ...rep, organizations: keep };
  delete body.password;
  await api('PUT', '/api/sales-rep', body, { expectStatus: [200, 204] });
  return (rep.organizations || []).length - keep.length;
}

async function resolveUserId(email) {
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  return u?.id || null;
}

// ---- storefront xAPI as the rep -----------------------------------------------

async function repToken(email) {
  // Bare password grant + storeId (the scoped sales-rep grant needs storeId; vcptcore-qa has been
  // seen rejecting a correct password when extra params are sent).
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password: REP_PASSWORD, storeId: BULK_STORE }),
  });
  if (!res.ok) throw new Error(`rep token failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function gql(token, query, endpoint = '/graphql') {
  const res = await fetch(`${BACK_URL}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors) throw new Error(`GraphQL: ${JSON.stringify(body.errors.map((e) => e.message)).slice(0, 300)}`);
  return body.data || {};
}

async function discoverProducts(token, need) {
  const out = []; const seen = new Set();
  for (let page = 0; page < 20 && out.length < need; page++) {
    const data = await gql(token, `{ products(storeId:"${BULK_STORE}", cultureName:"en-US", currencyCode:"${BULK_CURRENCY}", first: 50, after:"${page * 50}", sort:"code:asc", query:"") {
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

async function listBulkOrders() {
  const map = new Map(); const take = 500;
  for (let skip = 0; ; skip += take) {
    const res = await api('POST', '/api/order/customerOrders/search', { keyword: BULK_ORDER_MARK, take, skip, sort: 'number:asc', responseGroup: 'Default' });
    const rows = res?.results || [];
    for (const o of rows) {
      const idx = parseBulkOrderIndex(o.number);
      if (idx != null) map.set(idx, { id: o.id, customerId: o.customerId, organizationId: o.organizationId });
    }
    if (rows.length < take) break;
  }
  return map;
}

function orderBody(spec, org, userId, products) {
  const items = buildBulkItems(spec, products);
  const total = bulkOrderTotal(spec);
  const addr = (addressType) => ({
    addressType, firstName: 'AGENT-TEST', lastName: 'Bulk', line1: `${org.index} Bulk Ave`, city: 'Seattle',
    regionName: 'WA', countryCode: 'USA', countryName: 'United States', postalCode: '98101',
    phone: '+1-206-555-0100', email: 'agent-test-sr-bulk-order@example.com',
  });
  const ship = addr('Shipping'); const bill = addr('Billing');
  return {
    number: spec.number, storeId: BULK_STORE, organizationId: org.id, organizationName: org.name,
    customerId: userId, customerName: BULK_CUSTOMER_NAME, currency: BULK_CURRENCY, status: spec.status,
    ...(spec.isCancelled ? { isCancelled: true, cancelledDate: new Date().toISOString(), cancelReason: 'AGENT-TEST bulk dataset' } : {}),
    total, subTotal: total, shippingTotal: 0, shippingTotalWithTax: 0, taxTotal: 0,
    items, addresses: [ship, bill],
    shipments: [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground', currency: BULK_CURRENCY,
      organizationId: org.id, organizationName: org.name, price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'New', number: `${spec.number}-S1`, deliveryAddress: ship, items: [],
    }],
    inPayments: [{
      gatewayCode: 'DefaultManualPaymentMethod', currency: BULK_CURRENCY, customerId: userId, customerName: BULK_CUSTOMER_NAME,
      organizationId: org.id, organizationName: org.name, sum: total, price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'New', paymentStatus: 'New', number: `${spec.number}-P1`, billingAddress: bill,
    }],
  };
}

async function createAll(indices, ctx) {
  let next = 0; let ok = 0; let errors = 0; const t0 = now();
  async function worker() {
    while (next < indices.length) {
      const idx = indices[next++];
      const spec = bulkOrderSpec(idx);
      try {
        await api('POST', '/api/order/customerOrders', orderBody(spec, ctx.orgs[spec.orgIndex - 1], ctx.userId, ctx.products));
        ok++;
      } catch (e) {
        errors++;
        if (errors <= 5) log(`  error #${idx}: ${String(e.message).slice(0, 200)}`);
      }
      const done = ok + errors;
      if (done % 100 === 0) log(`  ${done}/${indices.length} (${ok} ok, ${errors} err, ${Math.round((ok / ((now() - t0) / 1000)) * 10) / 10} orders/s)`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, indices.length) }, worker));
  return { ok, errors, sec: Math.round((now() - t0) / 100) / 10 };
}

// ---- verify (as the rep, scoped xAPI) -----------------------------------------

async function verify(email, orgs) {
  const tok = await repToken(email);
  const w = buildStatisticsWindows(new Date());
  const ytd = `from:"${w.ytd.from}", to:"${new Date(Date.now() + 60000).toISOString()}"`;
  const prof = bulkProfile(COUNT);
  const dash = await gql(tok, `{ s: salesRepCustomerOrderStatistics(storeId:"${BULK_STORE}") { currencyCode ytd: period(${ytd}) { count total { amount formattedAmount } } } }`, '/graphql/sales-rep');
  const act = await gql(tok, `{ a: salesRepActivities(storeId:"${BULK_STORE}") { totalCount categoryCounts { category count } } }`, '/graphql/sales-rep');
  const cust = await gql(tok, `{ c: salesRepCustomers(storeId:"${BULK_STORE}", first: 50) { totalCount items { organizationId organizationName ytd: orderStatistics(${ytd}) { count total { amount formattedAmount } } } } }`, '/graphql/sales-rep');
  const live = { dashboardYtd: dash?.s?.ytd, activityCategoryCounts: act?.a?.categoryCounts, customers: cust?.c?.totalCount, perOrg: [] };
  log(`verify: dashboard YTD count=${dash?.s?.ytd?.count} total=${dash?.s?.ytd?.total?.formattedAmount} (bulk contributes ${prof.statsCount} / $${prof.statsTotal})`);
  log(`verify: salesRepActivities categoryCounts = ${JSON.stringify(act?.a?.categoryCounts)}`);
  for (const o of orgs) {
    const p = await gql(tok, `{ s: salesRepCustomerOrderStatistics(storeId:"${BULK_STORE}", organizationId:"${o.id}") { ytd: period(${ytd}) { count total { amount formattedAmount } } } }`, '/graphql/sales-rep');
    const row = (cust?.c?.items || []).find((i) => i.organizationId === o.id);
    const exp = prof.perOrg[o.index - 1];
    const got = p?.s?.ytd;
    const match = got?.count === exp.statsCount && Math.abs((got?.total?.amount ?? -1) - exp.statsTotal) < 0.01;
    log(`verify: ${o.name} profile YTD count=${got?.count} total=${got?.total?.formattedAmount} | My-customers row YTD count=${row?.ytd?.count} total=${row?.ytd?.total?.formattedAmount} | spec ${exp.statsCount} / $${exp.statsTotal} ${match ? 'MATCH' : 'MISMATCH'}`);
    live.perOrg.push({ org: o.name, profile: got, row: row?.ytd, expected: { count: exp.statsCount, total: exp.statsTotal }, match });
  }
  log(`verify: salesRepCustomers totalCount=${cust?.c?.totalCount}`);
  return live;
}

// ---- teardown -----------------------------------------------------------------

async function teardown(email, fullName) {
  log(`TEARDOWN — only ${BULK_ORDER_MARK}-* orders, the ${BULK_ORGS.length} AGENT-TEST-SR-BULK orgs and ${BULK_REP_KEY}'s membership in them`);
  let deleted = 0; const t0 = now(); let prevFirst = null;
  for (;;) {
    const res = await api('POST', '/api/order/customerOrders/search', { keyword: BULK_ORDER_MARK, take: 250, skip: 0 });
    const ids = (res?.results || []).filter((o) => parseBulkOrderIndex(o.number) != null).map((o) => o.id);
    if (!ids.length) break;
    if (DRY_RUN) { log(`  [DRY] would delete ${res?.totalCount ?? ids.length} bulk order(s)`); break; }
    if (ids[0] === prevFirst) throw new Error(`order ${ids[0]} survived its delete — stopping (re-run to resume)`);
    prevFirst = ids[0];
    const chunks = []; for (let i = 0; i < ids.length; i += BATCH) chunks.push(ids.slice(i, i + BATCH));
    let ci = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
      while (ci < chunks.length) { const c = chunks[ci++]; await api('DELETE', `/api/order/customerOrders?${idsParam(c)}`, null, { expectStatus: [200, 204] }); }
    }));
    deleted += ids.length;
    log(`  deleted ${deleted} order(s) so far (${Math.round((deleted / ((now() - t0) / 1000)) * 10) / 10}/s)`);
  }
  if (!DRY_RUN) log(`  orders deleted: ${deleted} in ${Math.round((now() - t0) / 100) / 10}s`);

  const orgIds = [];
  for (const o of BULK_ORGS) { const m = await findOrgByName(o.name); if (m?.id) orgIds.push(m.id); }
  const rep = await findRep(email, fullName);
  if (rep && orgIds.length) {
    const n = await dropMembership(rep, orgIds);
    log(`  ${DRY_RUN ? '[DRY] would drop' : 'dropped'} ${n} bulk membership(s) from ${BULK_REP_KEY}`);
  }
  if (orgIds.length) {
    if (!DRY_RUN) await api('DELETE', `/api/members?${idsParam(orgIds)}`, null, { expectStatus: [200, 204] });
    log(`  ${DRY_RUN ? '[DRY] would delete' : 'deleted'} ${orgIds.length} bulk org(s)`);
  }
  if (DRY_RUN) { log('Teardown complete (dry run — no writes).'); return; }

  const ordersLeft = (await api('POST', '/api/order/customerOrders/search', { keyword: BULK_ORDER_MARK, take: 1 }))?.totalCount || 0;
  let orgsLeft = 0; for (const o of BULK_ORGS) if (await findOrgByName(o.name)) orgsLeft++;
  const after = await findRep(email, fullName);
  const servedLeft = (after?.organizations || []).filter((o) => orgIds.includes(o.organizationId)).length;
  const residue = ordersLeft + orgsLeft + servedLeft;
  log(residue === 0 ? '  verifyRemoved: zero residue' : `  WARN verifyRemoved: orders=${ordersLeft} orgs=${orgsLeft} memberships=${servedLeft} (re-run the same command)`);
  log(`  ${BULK_REP_KEY} still exists: ${after ? `yes, serving ${(after.organizations || []).length} org(s)` : 'NO — investigate (this seeder never deletes the rep)'}`);
  writeEnvAliasOverride({ [BULK_DATASET_ALIAS]: { org_ids: '', order_count: '', stats_order_count: '', large_stats_total: '', seeded_at: '' } });
  log('Teardown complete.');
}

// ---- main ---------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  const row = repRow();
  const email = String(row.email).toLowerCase();
  if (!TEARDOWN) {
    const short = bulkShortfalls(COUNT);
    if (short.length) throw new Error(`a ${COUNT}-order bulk dataset could not answer the chain's question:\n  - ${short.join('\n  - ')}`);
  }
  await auth();
  if (TEARDOWN) { await teardown(email, row.full_name); return; }
  const t0 = now();

  const rep = await findRep(email, row.full_name);
  if (!rep) throw new Error(`${BULK_REP_KEY} (${email}) not found live — this seeder never creates it; run seed:sales-rep first`);
  const userId = await resolveUserId(email);
  if (!userId) throw new Error(`no ApplicationUser for ${email} — orders would be unattributable`);
  log(`rep ${BULK_REP_KEY} contact=${rep.id} ApplicationUser=${userId} serving ${(rep.organizations || []).length} org(s)`);

  const orgs = await ensureBulkOrgs();
  await ensureMembership(rep, orgs);
  const prof = bulkProfile(COUNT);
  if (DRY_RUN) {
    for (const o of prof.perOrg) log(`[DRY] ${o.name}: ${o.count} order(s), ${o.cancelled} cancelled -> statistics ${o.statsCount} / $${o.statsTotal}`);
    log(`[DRY] total ${COUNT} order(s); statistics ${prof.statsCount} / $${prof.statsTotal}`);
    log('DRY RUN complete (no writes).');
    return;
  }

  const products = await discoverProducts(await repToken(email), BULK_PRODUCT_SLOTS);
  if (products.length < BULK_PRODUCT_SLOTS) throw new Error(`need ${BULK_PRODUCT_SLOTS} distinct buyable store products, found ${products.length}`);
  verbose(`products: ${products.map((p) => p.sku).join(', ')}`);

  const existing = await listBulkOrders();
  const foreign = [...existing.values()].filter((o) => o.customerId !== userId).length;
  if (foreign) log(`WARN: ${foreign} existing bulk order(s) attributed to another user id — run the teardown to reset`);
  const missing = []; for (let i = 1; i <= COUNT; i++) if (!existing.has(i)) missing.push(i);
  log(`orders: ${existing.size} present, ${missing.length} to create (target ${COUNT}, concurrency ${CONCURRENCY})`);
  if (missing.length) {
    const r = await createAll(missing, { orgs, userId, products });
    log(`created ${r.ok} order(s), ${r.errors} error(s) in ${r.sec}s`);
  }

  const after = await listBulkOrders();
  writeEnvAliasOverride({
    [BULK_DATASET_ALIAS]: {
      org_ids: orgs.map((o) => o.id).join(';'), order_count: String(after.size),
      stats_order_count: String(prof.statsCount), large_stats_total: String(prof.perOrg[0].statsTotal),
      seeded_at: new Date().toISOString(),
    },
  });
  log(`write-back -> aliases.${process.env.TEST_ENV || 'vcst'}.json: ${BULK_DATASET_ALIAS} (orders present: ${after.size})`);
  if (VERIFY) await verify(email, orgs);
  log(`Seed complete in ${Math.round((now() - t0) / 100) / 10}s.`);
}
main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
