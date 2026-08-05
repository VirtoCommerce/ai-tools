#!/usr/bin/env node
/**
 * probe-sales-rep-statistics.mjs — READ-ONLY oracle probe for the Sales Rep statistics widgets.
 *
 * Queries the scoped sales-rep endpoint (`POST /graphql/sales-rep`) AS THE REP, over exactly the
 * windows the storefront's `buildStatisticsWindows()` asks for (shared spec:
 * sales-rep-stats-specs.mjs), and prints what each widget SHOULD display. That output is the oracle
 * for the browser re-verification — it separates "the API returns nothing" from "the UI drops a
 * value the API returned".
 *
 * Writes NOTHING: no entities, no aliases, no reports. Safe to re-run at will.
 *
 * Usage:  TEST_ENV=vcptcore node scripts/seed-data/sales-rep/probe-sales-rep-statistics.mjs [--rep <rep_key>] [--json]
 */
import { assertSafeTarget, log, loadCsv, BACK_URL, STORE_ID } from '../../lib/seed-common.mjs';
import { buildStatisticsWindows, COMPARISON_AXES } from './sales-rep-stats-specs.mjs';

const argv = process.argv.slice(2);
const REP_KEY = argv.includes('--rep') ? argv[argv.indexOf('--rep') + 1] : 'SR_REP_PRIMARY';
const AS_JSON = argv.includes('--json');
const REP_PASSWORD = process.env.SR_REP_PASSWORD || process.env.TEST_USER_PASSWORD || 'Password1!';

/** Rep identity comes from the committed CSV business key — never a literal in this script. */
function repRow(key) {
  const row = loadCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === key);
  if (!row) throw new Error(`rep_key ${key} not found in test-data/sales-rep/sales-reps.csv`);
  return row;
}
function orgRow(key) {
  return loadCsv('test-data/b2b/organizations.csv').find((r) => r.org_id === key) || null;
}

async function repToken(email, storeId) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    // The scoped sales-rep grant requires storeId (see reference_token_endpoint_org_auth_testing).
    body: new URLSearchParams({ grant_type: 'password', username: email, password: REP_PASSWORD, scope: 'offline_access', storeId }),
  });
  if (!res.ok) throw new Error(`rep token failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function gql(token, query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql/sales-rep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors) log(`  GraphQL errors: ${JSON.stringify(body.errors).slice(0, 400)}`);
  return body.data || {};
}

const MONEY = 'amount currencyCode: currency { code } formattedAmount';

/** Build the aliased period+comparison selection the widgets use, over the shared window model. */
function statsSelection(w) {
  const periods = Object.entries(w)
    .map(([k, v]) => `${k}: period(from: "${v.from}", to: "${v.to}") { total { ${MONEY} } count average { ${MONEY} } lastOrderDate firstOrderDate warning }`)
    .join('\n      ');
  const comparisons = COMPARISON_AXES
    .map((a) => `${a.key}: comparison(current: { from: "${w[a.current].from}", to: "${w[a.current].to}" }, previous: { from: "${w[a.previous].from}", to: "${w[a.previous].to}" }) { totalChange { ${MONEY} } totalChangePercent countChange countChangePercent averageChange { ${MONEY} } averageChangePercent }`)
    .join('\n      ');
  return `${periods}\n      ${comparisons}`;
}
function cartSelection(w) {
  const periods = Object.entries(w)
    .map(([k, v]) => `${k}: period(from: "${v.from}", to: "${v.to}") { total { ${MONEY} } count average { ${MONEY} } lastCartDate warning }`)
    .join('\n      ');
  const comparisons = COMPARISON_AXES
    .map((a) => `${a.key}: comparison(current: { from: "${w[a.current].from}", to: "${w[a.current].to}" }, previous: { from: "${w[a.previous].from}", to: "${w[a.previous].to}" }) { totalChange { ${MONEY} } totalChangePercent countChange countChangePercent }`)
    .join('\n      ');
  return `${periods}\n      ${comparisons}`;
}
function countsSelection(w) {
  const periods = Object.entries(w)
    .map(([k, v]) => `${k}: period(from: "${v.from}", to: "${v.to}") { orderingCustomers newCustomers }`)
    .join('\n      ');
  const comparisons = COMPARISON_AXES
    .map((a) => `${a.key}: comparison(current: { from: "${w[a.current].from}", to: "${w[a.current].to}" }, previous: { from: "${w[a.previous].from}", to: "${w[a.previous].to}" }) { orderingCustomersChange orderingCustomersChangePercent newCustomersChange newCustomersChangePercent }`)
    .join('\n      ');
  return `${periods}\n      ${comparisons}`;
}

const money = (m) => (m ? `${m.formattedAmount ?? `${m.amount} ${m.currencyCode ?? ''}`}` : '—');
const pct = (v) => (v === null || v === undefined ? 'NULL' : `${v}%`);

function reportPeriods(label, obj, countKey = 'count', dateKey = 'lastOrderDate') {
  log(`  ${label}`);
  for (const k of Object.keys(buildStatisticsWindows())) {
    const p = obj?.[k];
    if (!p) continue;
    const extra = p[dateKey] ? ` last=${p[dateKey]}` : '';
    const avg = p.average ? ` avg=${money(p.average)}` : '';
    log(`    ${k.padEnd(10)} ${String(p[countKey]).padStart(3)} × total=${money(p.total).padEnd(12)}${avg}${extra}${p.warning ? ` warning=${p.warning}` : ''}`);
  }
}
function reportComparisons(label, obj, fields) {
  log(`  ${label}`);
  for (const a of COMPARISON_AXES) {
    const c = obj?.[a.key];
    if (!c) continue;
    const parts = fields.map(([f, fmt]) => `${f}=${fmt(c[f])}`).join('  ');
    log(`    ${a.key.padEnd(16)} ${parts}${a.pastOnlyPrevious ? '' : ''}`);
  }
}

async function main() {
  assertSafeTarget();
  const rep = repRow(REP_KEY);
  const store = rep.store || STORE_ID;
  const tok = await repToken(rep.email, store);
  const w = buildStatisticsWindows();

  log(`REP ${REP_KEY} <${rep.email}> store=${store}  endpoint=${BACK_URL}/graphql/sales-rep`);
  log(`NOW = ${new Date().toISOString()}`);
  log('WINDOWS (inclusive UTC instants — BL-SR-001):');
  for (const [k, v] of Object.entries(w)) log(`    ${k.padEnd(10)} ${v.from}  ..  ${v.to}`);

  const served = loadCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === REP_KEY)?.served_orgs || '';
  const orgKeys = served.split(';').map((s) => s.trim()).filter((s) => s && !s.startsWith('PAGING:'));

  // ---- cross-customer dashboard (organizationId omitted — BL-SR-008/002) ----
  log('\n=== DASHBOARD (all served orgs; organizationId omitted) ===');
  const dash = await gql(tok, `query {
    orders: salesRepCustomerOrderStatistics(storeId: "${store}") { currencyCode ${statsSelection(w)} }
    carts: salesRepCustomerCartStatistics(storeId: "${store}") { currencyCode ${cartSelection(w)} }
    counts: salesRepCustomerCounts(storeId: "${store}") { assignedCustomers ${countsSelection(w)} }
    topByUnits: salesRepTopSellers(storeId: "${store}", sort: "by-units", take: 10) { rank productId name sku units revenue { ${MONEY} } categoryId }
    topByRevenue: salesRepTopSellers(storeId: "${store}", sort: "by-revenue", take: 10) { rank productId name sku units revenue { ${MONEY} } categoryId }
  }`);

  log(`\n salesRepCustomerOrderStatistics  currencyCode=${dash.orders?.currencyCode}`);
  reportPeriods('periods:', dash.orders);
  reportComparisons('comparisons:', dash.orders, [['totalChange', money], ['totalChangePercent', pct], ['countChange', String], ['countChangePercent', pct], ['averageChange', money], ['averageChangePercent', pct]]);

  log(`\n salesRepCustomerCartStatistics  currencyCode=${dash.carts?.currencyCode}`);
  reportPeriods('periods:', dash.carts, 'count', 'lastCartDate');
  reportComparisons('comparisons:', dash.carts, [['totalChange', money], ['totalChangePercent', pct], ['countChange', String], ['countChangePercent', pct]]);

  log(`\n salesRepCustomerCounts  assignedCustomers=${dash.counts?.assignedCustomers}`);
  for (const k of Object.keys(w)) {
    const p = dash.counts?.[k];
    if (p) log(`    ${k.padEnd(10)} orderingCustomers=${p.orderingCustomers}  newCustomers=${p.newCustomers}`);
  }
  reportComparisons('comparisons:', dash.counts, [['orderingCustomersChange', String], ['orderingCustomersChangePercent', pct], ['newCustomersChange', String], ['newCustomersChangePercent', pct]]);

  for (const [label, rows] of [['by-units', dash.topByUnits], ['by-revenue', dash.topByRevenue]]) {
    log(`\n salesRepTopSellers sort=${label} (${(rows || []).length} rows)`);
    for (const r of rows || []) log(`    #${r.rank} ${String(r.sku).padEnd(16)} units=${String(r.units).padStart(4)}  revenue=${money(r.revenue).padEnd(12)} ${String(r.name).replace(/\s+/g, ' ').slice(0, 40)}`);
  }

  // ---- per served org (customer profile widgets) ----
  for (const key of orgKeys) {
    const o = orgRow(key);
    const orgId = o?.platform_id;
    if (!orgId) { log(`\n=== ORG ${key}: no pinned platform_id in b2b/organizations.csv — skip ===`); continue; }
    const r = await gql(tok, `query {
      orders: salesRepCustomerOrderStatistics(organizationId: "${orgId}", storeId: "${store}") { currencyCode ${statsSelection(w)} }
      carts: salesRepCustomerCartStatistics(organizationId: "${orgId}", storeId: "${store}") { currencyCode ${cartSelection(w)} }
    }`);
    log(`\n=== ORG ${key} (${o.org_name}) ===`);
    reportPeriods('orders periods:', r.orders);
    reportComparisons('orders comparisons:', r.orders, [['totalChange', money], ['totalChangePercent', pct], ['countChange', String], ['countChangePercent', pct]]);
    reportPeriods('carts periods:', r.carts, 'count', 'lastCartDate');
  }

  if (AS_JSON) console.log(JSON.stringify({ windows: w, dashboard: dash }, null, 2));
}
main().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
