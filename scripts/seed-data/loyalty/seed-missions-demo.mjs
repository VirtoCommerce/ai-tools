#!/usr/bin/env node
/**
 * seed-missions-demo.mjs — the presentation-grade LOYALTY MISSIONS dataset (missions-demo-specs.mjs,
 * data in test-data/loyalty/missions-demo/missions-demo.json).
 *
 * Six store-wide missions (order count, order value, featured SKUs; ending soon / this month / open)
 * and nine real orders placed by four of the sales-rep demo's buyers after the missions exist, so that
 * /account/missions shows every card state: completed with the reward in Points history, part-way,
 * and not started (three buyers place nothing).
 *
 * ATOMIC BY NECESSITY. Progress cannot be written, reset or reversed, and every order feeds every
 * active mission. So the set is either reused WHOLE (all missions match the fixture, all orders exist
 * and were placed against these mission ids) or rebuilt WHOLE: delete the demo orders and missions,
 * recreate the missions, re-place the orders. A partial rebuild would double-count on the survivors.
 * Points already granted stay in the buyers' ledgers — nothing in the module can remove them.
 *
 * DEPENDS ON THE SALES-REP DEMO for organizations and buyer accounts (its ledger). `npm run seed:demo`
 * orders the families.
 *
 * Flags: --dry-run · --verbose · --teardown · --fresh (force a whole rebuild)
 */

import "../../lib/sync-stdio.mjs";
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, STORE_ID, DRY_RUN, TEARDOWN,
  assertSafeTarget, auth, api, log, verbose, verifyRemoved, writeEnvAliasOverride,
  discoverCatalogProducts, uploadAsset, assetUrlOk,
} from '../../lib/seed-common.mjs';
import {
  DEMO_ORGS, SR_DEMO_LEDGER_KEY, isDemoSafeProduct, BANNERS, bannerSourceRel, BANNER_CONTENT_TYPE,
  DEMO_MISSIONS, DEMO_PROGRESS_ORDERS, FEATURED_FROM, DEMO_MSN_LEDGER_KEY, DEMO_MSN_BANNER_FOLDER, MISSIONS_PROFILE, PROGRESS,
  demoMsnMarker, isDemoMsnMarker, demoMsnOrderNumber, contactByKey, ordersInPlaceOrder, featuredSlots, productNeedByOrg,
  buildDemoMissionBody, missionMatches, windowOpen, buildDemoMsnOrderBody, expectedProgress, demoMissionProblems,
} from './missions-demo-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const FRESH = process.argv.includes('--fresh');
const PROGRESS_TIMEOUT_MS = 240000;

const overlay = () => {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
};
const readLedger = () => overlay()[DEMO_MSN_LEDGER_KEY] || { entities: [] };
const writeLedger = (entities) => writeEnvAliasOverride({
  [DEMO_MSN_LEDGER_KEY]: { profile: MISSIONS_PROFILE.demo, env: TEST_ENV, marker: 'DEMO-MSN', generated: new Date().toISOString(), entities },
});

function salesRepDemoBase() {
  const l = overlay()[SR_DEMO_LEDGER_KEY];
  const orgs = {}; const buyers = {};
  for (const e of l?.entities || []) {
    if (e.type === 'organization') orgs[e.key] = { id: e.id, name: e.name };
    if (e.type === 'account') buyers[e.key] = { userId: e.id, email: e.email, orgId: e.orgId };
  }
  return { present: !!l, orgs, buyers };
}

// ---- banners ---------------------------------------------------------------------------------

async function bannerUrls() {
  const listed = DRY_RUN ? [] : ((await api('GET', `/api/assets?folderUrl=${encodeURIComponent(DEMO_MSN_BANNER_FOLDER)}`, null, { expectStatus: [200, 201] }))?.results || []);
  const urls = {};
  for (const [key, b] of Object.entries(BANNERS)) {
    const hit = listed.find((x) => x.name === b.file);
    if (hit?.url && await assetUrlOk(hit.url)) { urls[key] = hit.url; continue; }
    urls[key] = (await uploadAsset(DEMO_MSN_BANNER_FOLDER, b.file, readFileSync(join(ROOT, bannerSourceRel(key))), BANNER_CONTENT_TYPE)).url;
    log(`banner ${b.file} → ${DEMO_MSN_BANNER_FOLDER}`);
  }
  return urls;
}

// ---- products ----------------------------------------------------------------------------------

async function familyPool(org, want, claimed, { priced = false } = {}) {
  const found = await discoverCatalogProducts(api, Math.min(want * 10 + 40, 450), { searchPhrase: org.productSearch, withImages: true }).catch(() => []);
  const seen = new Set(); const out = [];
  for (const p of found) {
    const name = String(p.name || '').trim();
    if (!isDemoSafeProduct(p) || claimed.has(p.id)) continue;
    if (org.productMatch && !org.productMatch.test(name)) continue;
    if (org.productExclude && org.productExclude.test(name)) continue;
    if (seen.has(name.toLowerCase())) continue;
    if (priced) {
      const pr = await api('POST', '/api/catalog/products/prices/search', { productIds: [p.id], take: 5 }, { expectStatus: [200, 201] }).catch(() => null);
      if (!(pr?.results || []).some((x) => (x.prices || []).length || x.list != null)) continue;
    }
    seen.add(name.toLowerCase()); out.push(p);
    if (out.length >= want) break;
  }
  out.forEach((p) => claimed.add(p.id));
  return out;
}

/** Featured products (priced, so the storefront's SKU modal can add them to a cart) + one pool per org. */
async function discoverProducts() {
  if (DRY_RUN) return { featured: {}, pools: {} };
  const claimed = new Set();
  const slots = featuredSlots();
  const fOrg = DEMO_ORGS.find((o) => o.key === FEATURED_FROM);
  const fp = await familyPool(fOrg, slots.length, claimed, { priced: true });
  if (fp.length < slots.length) throw new Error(`only ${fp.length}/${slots.length} priced featured product(s) in "${fOrg.productSearch}"`);
  const featured = Object.fromEntries(slots.map((s, i) => [s, fp[i]]));
  const pools = {};
  for (const [orgKey, n] of Object.entries(productNeedByOrg())) {
    pools[orgKey] = await familyPool(DEMO_ORGS.find((o) => o.key === orgKey), n, claimed);
    if (pools[orgKey].length < n) log(`  WARN ${orgKey}: only ${pools[orgKey].length}/${n} products — lines will repeat`);
  }
  return { featured, pools };
}

// ---- missions + orders ---------------------------------------------------------------------------

async function storeMissions() {
  const r = await api('POST', '/api/loyalty-missions/search', { take: 500 }, { expectStatus: [200, 201] });
  return (r?.results || []).filter((m) => !m.storeId || m.storeId === STORE_ID);
}

/** Our missions on this store: ledger ids first, then an exact declared name (an interrupted run). */
async function ourMissions(ledger) {
  const ids = new Set((ledger.entities || []).filter((e) => e.type === 'mission').map((e) => e.id));
  const names = new Set(DEMO_MISSIONS.map((m) => m.name));
  return (await storeMissions()).filter((m) => ids.has(m.id) || names.has(m.name));
}

async function ourOrders(base, ledger) {
  const byId = new Map();
  for (const e of (ledger.entities || []).filter((x) => x.type === 'order')) {
    const o = await api('GET', `/api/order/customerOrders/${e.id}`, null, { expectStatus: [200, 404] });
    if (o?.id && isDemoMsnMarker(o.outerId)) byId.set(o.id, o);
  }
  const buyerIds = Object.values(base.buyers).map((b) => b.userId).filter(Boolean);
  if (buyerIds.length) {
    const r = await api('POST', '/api/order/customerOrders/search', { customerIds: buyerIds, take: 500 }, { expectStatus: [200, 201] });
    for (const o of r?.results || []) if (isDemoMsnMarker(o.outerId) && !byId.has(o.id)) byId.set(o.id, o);
  }
  return [...byId.values()];
}

async function deleteSet(missions, orders) {
  if (orders.length) await api('DELETE', `/api/order/customerOrders?${orders.map((o) => `ids=${o.id}`).join('&')}`, null, { expectStatus: [200, 204] });
  if (missions.length) await api('DELETE', `/api/loyalty-missions?${missions.map((m) => `ids=${encodeURIComponent(m.id)}`).join('&')}`, null, { expectStatus: [200, 204] });
}

async function reusable(ledger, base, ctx, now) {
  const live = await ourMissions(ledger);
  const orders = await ourOrders(base, ledger);
  const byName = new Map(live.map((m) => [m.name, m]));
  const problems = [];
  for (const m of DEMO_MISSIONS) {
    const l = byName.get(m.name);
    const full = l ? await api('GET', `/api/loyalty-missions/${l.id}`) : null;
    if (!full) problems.push(`${m.key} missing`);
    else if (!missionMatches(m, full, { currency: ctx.currency, bannerUrl: ctx.banners[m.banner] })) problems.push(`${m.key} drifted from the fixture`);
    else if (!windowOpen(full, now)) problems.push(`${m.key} window closed`);
  }
  if (live.length !== DEMO_MISSIONS.length) problems.push(`${live.length} demo mission(s) live, ${DEMO_MISSIONS.length} declared`);
  const ledgerMissionIds = (ledger.entities || []).filter((e) => e.type === 'order').map((e) => (e.missionIds || []).slice().sort().join(','));
  const liveIds = live.map((m) => m.id).sort().join(',');
  if (orders.length !== DEMO_PROGRESS_ORDERS.length) problems.push(`${orders.length} progress order(s) live, ${DEMO_PROGRESS_ORDERS.length} declared`);
  else if (ledgerMissionIds.some((s) => s !== liveIds)) problems.push('progress orders were placed against other mission ids');
  return { ok: !problems.length, problems, live, orders };
}

async function waitForProgress(missionIds, base) {
  const expected = expectedProgress();
  const deadline = Date.now() + PROGRESS_TIMEOUT_MS;
  let last = [];
  for (;;) {
    const mismatches = [];
    const observed = {};
    for (const [buyerKey, byMission] of Object.entries(expected)) {
      const b = base.buyers[buyerKey];
      if (!b) continue;
      const r = await api('POST', '/api/loyalty-mission-progress/search', { missionIds: Object.values(missionIds), userId: b.userId, take: 50 }, { expectStatus: [200, 201] });
      const rows = r?.results || [];
      observed[buyerKey] = rows;
      for (const [mKey, want] of Object.entries(byMission)) {
        const row = rows.find((x) => x.missionId === missionIds[mKey]);
        const status = row?.status || PROGRESS.NONE;
        const okStatus = want.status === PROGRESS.NONE ? !row || Number(row.currentValue || 0) === 0 : status === want.status;
        const okValue = want.status !== PROGRESS.IN_PROGRESS || Math.abs(Number(row?.currentValue) - want.current) < 0.01;
        if (!okStatus || !okValue) mismatches.push(`${buyerKey}/${mKey}: want ${want.status} ${want.current}/${want.target}, got ${row ? `${status} ${row.currentValue}/${row.targetValue}` : 'no row'}`);
      }
    }
    if (!mismatches.length) return { ok: true, observed };
    last = mismatches;
    if (Date.now() > deadline) return { ok: false, mismatches: last, observed };
    verbose(`progress: ${mismatches.length} pending — waiting`);
    await new Promise((r) => setTimeout(r, 6000));
  }
}

async function teardown(base) {
  const ledger = readLedger();
  const missions = await ourMissions(ledger);
  const orders = await ourOrders(base, ledger);
  log(`TEARDOWN — ${missions.length} mission(s), ${orders.length} progress order(s)`);
  await deleteSet(missions, orders);
  const listed = DRY_RUN ? [] : ((await api('GET', `/api/assets?folderUrl=${encodeURIComponent(DEMO_MSN_BANNER_FOLDER)}`, null, { expectStatus: [200, 201] }).catch(() => null))?.results || []);
  for (const b of Object.values(BANNERS)) {
    if (listed.some((x) => x.name === b.file)) await api('DELETE', `/api/assets?urls=${encodeURIComponent(`${DEMO_MSN_BANNER_FOLDER}/${b.file}`)}`, null, { expectStatus: [200, 204] });
  }
  const residue = await verifyRemoved(async () => (await ourMissions({ entities: [] })).length + (await ourOrders(base, { entities: [] })).length);
  writeLedger([]);
  log('NOTE: mission-reward and program points already granted stay in the buyers\' ledgers — the module has no way to remove them.');
  if (residue) { log(`  ⚠ ${residue} entity/entities still present`); process.exitCode = 1; } else log('Zero residue.');
}

async function main() {
  assertSafeTarget();
  const problems = demoMissionProblems();
  if (problems.length) { console.error('ABORT: the missions demo dataset does not hold together:'); problems.forEach((p) => console.error(`  - ${p}`)); process.exit(2); }
  await auth();
  const base = salesRepDemoBase();
  if (TEARDOWN) { await teardown(base); return; }
  if (!base.present) {
    console.error(`ABORT: no ${SR_DEMO_LEDGER_KEY} in aliases.${TEST_ENV}.json — seed the sales-rep demo first (npm run seed:demo does both).`);
    process.exit(2);
  }
  const missingBuyers = [...new Set(DEMO_PROGRESS_ORDERS.map((o) => o.buyer))].filter((k) => !base.buyers[k]);
  if (missingBuyers.length) { console.error(`ABORT: sales-rep demo ledger lacks buyer(s) ${missingBuyers.join(', ')}`); process.exit(2); }

  // Store config, read — never written (seed-loyalty-missions.mjs owns the settings).
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  const setting = (n) => (store.settings || []).find((s) => s.name === n);
  const enabled = (n) => String(setting(n)?.value ?? setting(n)?.defaultValue) === 'true';
  if (!enabled('Loyalty.Enable') || !enabled('Loyalty.Missions.Enable')) throw new Error(`${STORE_ID}: Loyalty.Enable / Loyalty.Missions.Enable is off — the missions page would not exist`);
  const ctx = { currency: store.defaultCurrency, cultureName: store.defaultLanguage, template: await api('GET', '/api/loyalty-missions/new') };
  ctx.banners = await bannerUrls();
  const fixtures = (await storeMissions()).filter((m) => /AGENT-TEST/i.test(m.name));
  if (fixtures.length) log(`WARN: ${fixtures.length} AGENT-TEST mission(s) are live on ${STORE_ID} and will show beside the demo on every /account/missions page.`);

  const now = new Date();
  const ledger = readLedger();
  const state = DRY_RUN ? { ok: false, problems: ['dry run'], live: [], orders: [] } : await reusable(ledger, base, ctx, now);
  let missionIds = {}; let orderEntities = [];
  if (state.ok && !FRESH) {
    log('Missions demo is live and matches the fixture → reuse.');
    for (const m of DEMO_MISSIONS) missionIds[m.key] = state.live.find((l) => l.name === m.name).id;
    orderEntities = (ledger.entities || []).filter((e) => e.type === 'order');
  } else {
    log(`Rebuilding the whole set — ${FRESH ? '--fresh' : state.problems.join('; ')}`);
    if (state.live.length || state.orders.length) log(`  deleting ${state.live.length} mission(s) + ${state.orders.length} order(s); points already granted stay granted`);
    await deleteSet(state.live, state.orders);
    for (const m of DEMO_MISSIONS) {
      const body = buildDemoMissionBody(m, { ...ctx, storeId: STORE_ID, bannerUrl: ctx.banners[m.banner], now });
      const res = DRY_RUN ? { id: `dry-${m.key}` } : await api('POST', '/api/loyalty-missions', body, { expectStatus: [200, 201] });
      missionIds[m.key] = res.id;
      log(`mission "${m.name}" (${m.goal.type}, ${m.reward} pts)`);
    }
    const { featured, pools } = await discoverProducts();
    for (const m of DEMO_MISSIONS.filter((x) => x.goal.type === 'PerSkuGoal')) {
      for (const it of m.goal.items) {
        if (DRY_RUN) continue;
        await api('POST', '/api/loyalty-mission-goal-items', { missionId: missionIds[m.key], productId: featured[it.slot].id, quantity: it.quantity }, { expectStatus: [200, 201] });
      }
      if (!DRY_RUN) log(`  featured: ${m.goal.items.map((it) => `${it.quantity}× ${featured[it.slot].name.slice(0, 40)}`).join(' + ')}`);
    }
    const cursor = {};
    for (const o of ordersInPlaceOrder()) {
      const contact = contactByKey(o.buyer);
      const b = base.buyers[o.buyer];
      const productsForLines = o.lines.map((l) => {
        if (l.slot) return featured[l.slot];
        const pool = pools[contact.org] || [];
        const i = cursor[contact.org] || 0; cursor[contact.org] = i + 1;
        return pool[i % Math.max(pool.length, 1)];
      });
      if (DRY_RUN) { log(`  [DRY] order ${demoMsnOrderNumber(o.key)} for ${contact.email}`); continue; }
      const body = buildDemoMsnOrderBody(o, { storeId: STORE_ID, currency: ctx.currency, orgId: base.orgs[contact.org].id, customerId: b.userId, productsForLines });
      const res = await api('POST', '/api/order/customerOrders', body, { expectStatus: [200, 201] });
      orderEntities.push({ type: 'order', key: o.key, id: res.id, number: body.number, marker: demoMsnMarker('ORD', o.key), missionIds: Object.values(missionIds) });
      log(`order ${body.number} — ${contact.firstName} ${contact.lastName}, $${body.total}`);
    }
  }

  if (!DRY_RUN) {
    writeLedger([
      ...DEMO_MISSIONS.map((m) => ({ type: 'mission', key: m.key, id: missionIds[m.key], name: m.name })),
      ...orderEntities,
    ]);
    const res = await waitForProgress(missionIds, base);
    if (!res.ok) {
      log('⚠ progress did not reach the fixture\'s expectation:');
      res.mismatches.forEach((x) => log(`    ${x}`));
      process.exitCode = 1;
    } else log('Progress matches the fixture for every (buyer, mission).');
    for (const k of [...new Set(DEMO_PROGRESS_ORDERS.map((o) => o.buyer))]) {
      const bal = await api('GET', `/api/loyalty-program-operation-log/balance/user/${base.buyers[k].userId}`, null, { expectStatus: [200, 404] }).catch(() => null);
      log(`  balance ${contactByKey(k).firstName} ${contactByKey(k).lastName}: ${bal?.balance ?? bal?.currentBalance ?? bal ?? '?'}`);
    }
  }
  log(DRY_RUN ? 'DRY RUN — no writes were made.' : `Ledger → test-data/aliases.${TEST_ENV}.json[${DEMO_MSN_LEDGER_KEY}]. Commit it.`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
