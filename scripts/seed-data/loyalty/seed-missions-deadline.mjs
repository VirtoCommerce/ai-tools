/**
 * seed-missions-deadline.mjs — the per-run VCST-5957 mission set: the deadline ladder
 * (daysRemaining 1/15/16/30/31), a Completed mission with 15 days left, an expired-not-swept mission,
 * and a PerSku mission with a deleted (no-availabilityData) target. Rationale, the fixture inventory
 * and every vacuity rule live in `missions-deadline-specs.mjs` (imported, never restated). This file is
 * the I/O half: guard -> reuse-or-mint -> pre missions -> reader order -> post missions -> verify as the
 * reader -> prove teardown on an invisible probe -> write back.
 *
 * Usage (TEST_ENV-aware; never runs against ENV_RISK=production):
 *   node scripts/seed-data/loyalty/seed-missions-deadline.mjs [--dry-run] [--verbose] [--fresh]
 *   node scripts/seed-data/loyalty/seed-missions-deadline.mjs --observe          # read-only: the reader's view now
 *   node scripts/seed-data/loyalty/seed-missions-deadline.mjs --teardown [--run <yyyymmddHHMM>] [--dry-run]
 *
 * IDEMPOTENT: a run that is still inside its validity window and still reads correctly is REUSED
 * (no writes). Otherwise a new run is minted and every EARLIER VCST5957 run is archived first — a
 * stale ladder on the same page reads as an off-by-one.
 *
 * THE ORDER IS REAL AND STAYS. One `POST /api/order/customerOrders` for the reader (status New, the
 * 083d unit product x1) is the only way to give an account progress. It advances EVERY Published
 * mission the reader qualifies for; the seeder predicts and records which ones it completes
 * (`MSN_DL_RUN.order_co_completed`) and aborts before ordering if the line product is a PerSku
 * target anywhere the reader can see. Teardown does not delete it (precedent: seed-org-loyalty's
 * funding order) — removing an order is itself an accrual event whose reversal is a separate behaviour.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, STORE_ID, BACK_URL, DRY_RUN, TEARDOWN, VERBOSE,
  log, verbose, assertSafeTarget, auth, api, idsParam, assetUrlOk, buildStoreSeo,
  writeEnvAliasOverride, verifyRemoved,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import { readLoyaltyBalance } from './loyalty-earn.mjs';
import { STORE_SETTING, buildGoalNode, buildConditionNode, buildRewardNode } from './missions-specs.mjs';
import {
  NAME_PREFIX, RUN_ALIAS, READER_ALIAS, TARGETS, READER_ORDER, BANNER_FROM_ALIAS, MISSIONS, TEARDOWN_PROBE,
  newRunId, missionName, isOurMissionName, runIdFromName, windowFor, validUntil, predictDaysRemaining,
  buildBody, validateSpecShape, judgeReaderView,
} from './missions-deadline-specs.mjs';

const argv = process.argv.slice(2);
const FRESH = argv.includes('--fresh');
const OBSERVE = argv.includes('--observe');
const RUN_ARG = argv.includes('--run') ? argv[argv.indexOf('--run') + 1] : null;
const NODES = { goal: buildGoalNode, condition: buildConditionNode, reward: buildRewardNode };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Overlay (raw, so an absent overlay is a first-seed state, not a throw) ── */
const ENV = process.env.TEST_ENV || 'vcst';
const readJson = (rel) => { const p = join(ROOT, rel); try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; } };
const BASE = readJson('test-data/aliases.json');
const td = (k) => ({ ...(BASE[k] || {}), ...(readJson(`test-data/aliases.${ENV}.json`)[k] || {}) });

/* ── Reader (storefront identity) ─────────────────────────────────────────── */
async function readerSession() {
  const r = td(READER_ALIAS);
  if (!r.email || !r.userId) throw new Error(`${READER_ALIAS} has no email/userId on ${ENV} — run npm run seed:org-loyalty first`);
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    // `storeId` is required: without it the platform answers user_cannot_login_in_store.
    body: new URLSearchParams({ grant_type: 'password', username: r.email, password: resolvePassword(r.password), scope: 'offline_access', storeId: STORE_ID }),
  });
  if (!res.ok) throw new Error(`${READER_ALIAS} sign-in failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  // The PLATFORM clock: every window is computed from it, so this machine's clock cannot shift a band.
  const serverNow = Date.parse(res.headers.get('date'));
  return { token: (await res.json()).access_token, email: r.email, userId: r.userId, serverNow, skewMs: serverNow - Date.now() };
}

const VIEW_QUERY = `query($s:String!,$c:String,$cur:String,$st:[String]){ loyaltyMissionProgress(storeId:$s first:200 cultureName:$c currencyCode:$cur statuses:$st){ totalCount items {
  missionId name status percentage currentValue targetValue daysRemaining missionType endDate rewardPoints { amount }
  items { productId currentQuantity targetQuantity product { id code availabilityData { isActive isAvailable isBuyable isInStock } } } } } }`;

/** The reader's page, exactly as the storefront asks for it (statuses InProgress + Completed). */
async function readerView(session, currency) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ query: VIEW_QUERY, variables: { s: STORE_ID, c: 'en-US', cur: currency, st: ['InProgress', 'Completed'] } }),
  });
  const j = await res.json();
  if (j.errors) throw new Error(`loyaltyMissionProgress failed: ${JSON.stringify(j.errors).slice(0, 300)}`);
  return { items: j.data?.loyaltyMissionProgress?.items || [], at: Date.parse(res.headers.get('date')) || Date.now() };
}

/* ── Missions ─────────────────────────────────────────────────────────────── */
async function ourMissions() {
  const r = await api('POST', '/api/loyalty-missions/search', { keyword: NAME_PREFIX, take: 500 }, { expectStatus: [200, 201] });
  return (r?.results || []).filter((m) => isOurMissionName(m.name));
}

/** Published -> Archived, the one legal transition. DELETE is not used: it 500s once progress exists. */
async function archiveMissions(missions) {
  for (const m of missions) {
    if (m.status === 'Archived') continue;
    if (DRY_RUN) { log(`  would archive ${m.name} [dry-run]`); continue; }
    const full = await api('GET', `/api/loyalty-missions/${m.id}`, null, { expectStatus: [200] });
    await api('PUT', '/api/loyalty-missions', { ...full, status: 'Archived' }, { expectStatus: [200, 204] });
    log(`  archived ${m.name}`);
  }
}

async function createMission(spec, ctx) {
  const body = buildBody(spec, { ...ctx, bannerUrl: ctx.banners[spec.goal.type], nodes: NODES });
  const created = await api('POST', '/api/loyalty-missions', body, { expectStatus: [200, 201] });
  for (const t of spec.targets || []) {
    const productId = ctx.products[t.slot]?.id;
    if (!productId) throw new Error(`${spec.aliasName}: target slot ${t.slot} has no resolved product`);
    await api('POST', '/api/loyalty-mission-goal-items', { missionId: created.id, productId, quantity: t.quantity }, { expectStatus: [200, 201] });
  }
  log(`  ✓ ${spec.aliasName.padEnd(16)} ${body.name}  end=${body.endDate}`);
  return { id: created.id, name: body.name, endDate: body.endDate };
}

/* ── Products ─────────────────────────────────────────────────────────────── */
async function resolveFromAlias(aliasName) {
  const a = td(aliasName);
  if (!a.productId) throw new Error(`${aliasName}.productId is empty on ${ENV} — seed its owner first (npm run seed:loyalty-missions / seed:missions-e2e)`);
  const p = await api('GET', `/api/catalog/products/${a.productId}`, null, { expectStatus: [200] });
  if (!p?.id) throw new Error(`${aliasName} (${a.productId}) no longer exists on ${ENV}`);
  return { id: p.id, sku: p.code, name: p.name, catalogId: p.catalogId, categoryId: p.categoryId, price: Number(a.list_price), currency: a.currency };
}

async function findByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { code, take: 20 }, { expectStatus: [200, 201] });
  return (r?.listEntries || []).find((e) => e.code === code && String(e.type).toLowerCase() === 'product') || null;
}

/** Create the GONE target (it is deleted right after its goal item exists). */
async function createGoneProduct() {
  const spec = TARGETS.GONE;
  const left = await findByCode(spec.sku);
  if (left) await api('DELETE', `/api/catalog/products?${idsParam([left.id])}`, null, { expectStatus: [200, 204] });
  const home = await resolveFromAlias(spec.catalogFromAlias);
  const c = await api('POST', '/api/catalog/products', {
    catalogId: home.catalogId, categoryId: home.categoryId, code: spec.sku, name: spec.name,
    productType: 'Physical', vendor: 'QA', isActive: true, isBuyable: true, trackInventory: false, minQuantity: 1, packSize: 1,
    seoInfos: [buildStoreSeo({ semanticUrl: spec.sku.toLowerCase(), pageTitle: spec.name })],
  }, { expectStatus: [200, 201] });
  return { id: c.id, sku: spec.sku, catalogId: home.catalogId };
}

/* ── Reader order ─────────────────────────────────────────────────────────── */

/** What one order of `lineValue` will complete for the reader. Pure over the pre-order view. */
function predictCoCompletions(items, lineValue, ourNames) {
  const out = [];
  for (const m of items) {
    if (m.status !== 'InProgress' || ourNames.has(m.name)) continue;
    const cur = Number(m.currentValue || 0); const tgt = Number(m.targetValue || 0);
    if (m.missionType === 'OrderCount' && tgt > 0 && cur + 1 >= tgt) out.push(`${m.name}=+${m.rewardPoints?.amount ?? '?'}`);
    // x2 is headroom for tax/shipping the platform adds to order.Total.
    if (m.missionType === 'OrderValue' && tgt > 0 && cur + 2 * lineValue >= tgt) out.push(`${m.name}=+${m.rewardPoints?.amount ?? '?'} (OrderValue, near)`);
  }
  return out;
}

async function placeReaderOrder(session, runId, line, preView) {
  const targetIds = new Set(preView.items.flatMap((m) => (m.items || []).map((i) => i.productId)));
  if (targetIds.has(line.id)) {
    throw new Error(`${READER_ORDER.lineFromAlias} (${line.sku}) is a PerSku target of a mission the reader sees — the order would move a SKU row. Pick another line product.`);
  }
  const number = `${NAME_PREFIX}-${runId}-${READER_ORDER.key}`;
  const body = {
    number, storeId: STORE_ID, currency: line.currency, status: READER_ORDER.status,
    customerId: session.userId, customerName: `AGENT-TEST Missions VCST-5957 (${session.email})`,
    items: [{ sku: line.sku, productId: line.id, catalogId: line.catalogId, name: line.name, quantity: READER_ORDER.quantity, price: line.price, productType: 'Physical', currency: line.currency }],
  };
  const created = await api('POST', '/api/order/customerOrders', body, { expectStatus: [200, 201] });
  log(`  ✓ reader order ${number} → ${created?.id} (${line.sku} x${READER_ORDER.quantity} @ ${line.price} ${line.currency})`);
  return { id: created?.id, number };
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
async function verifyAndReport(session, currency, aliases, goneId) {
  const view = await readerView(session, currency);
  const { problems, readings } = judgeReaderView(view.items, aliases, view.at, goneId);
  for (const spec of MISSIONS) {
    const r = readings[spec.aliasName];
    log(`  ${spec.aliasName.padEnd(16)} ${r?.present === false ? 'ABSENT from the page' : `daysRemaining=${r?.daysRemaining} status=${r?.status} ${r?.percentage}%`}`);
  }
  return { problems, readings, view };
}

async function teardown() {
  const mine = (await ourMissions()).filter((m) => !RUN_ARG || runIdFromName(m.name) === RUN_ARG);
  log(`Teardown: ${mine.filter((m) => m.status !== 'Archived').length} non-archived ${NAME_PREFIX} mission(s)${RUN_ARG ? ` in run ${RUN_ARG}` : ''}`);
  await archiveMissions(mine);
  const gone = await findByCode(TARGETS.GONE.sku);
  if (gone) await api('DELETE', `/api/catalog/products?${idsParam([gone.id])}`, null, { expectStatus: [200, 204] });
  const residue = await verifyRemoved(async () => (await ourMissions())
    .filter((m) => m.status !== 'Archived' && (!RUN_ARG || runIdFromName(m.name) === RUN_ARG)));
  if (residue) throw new Error(`${residue} ${NAME_PREFIX} mission(s) are still not Archived`);
  if (!DRY_RUN) {
    const session = await readerSession();
    const view = await readerView(session, td(READER_ORDER.lineFromAlias).currency);
    const visible = view.items.filter((m) => isOurMissionName(m.name) && (!RUN_ARG || runIdFromName(m.name) === RUN_ARG));
    if (visible.length) throw new Error(`archived, but ${visible.length} still on the reader's page: ${visible.map((m) => m.name).join(', ')}`);
    log('  ✓ zero residue: none non-Archived, none on the reader\'s page (the reader order is kept by design)');
  }
}

async function main() {
  assertSafeTarget();
  const shape = validateSpecShape();
  if (shape.length) throw new Error(`spec shape:\n  - ${shape.join('\n  - ')}`);
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  const gate = (store.settings || []).find((s) => s.name === STORE_SETTING.missionsSetting);
  if (!(gate?.value === true || (gate?.value == null && gate?.defaultValue === true))) {
    throw new Error(`${STORE_SETTING.missionsSetting} is not true on ${STORE_ID} — the page renders nothing (owned by seed-loyalty-missions.mjs, not written here)`);
  }
  const currencies = { 'store-default': store.defaultCurrency };
  const session = await readerSession();
  log(`Reader ${session.email} (${session.userId}); platform clock ${new Date(session.serverNow).toISOString()} (skew ${session.skewMs} ms)`);

  // OBSERVE / REUSE: is the recorded run still good?
  const run = td(RUN_ALIAS);
  const recorded = Object.fromEntries(MISSIONS.map((m) => [m.aliasName, td(m.aliasName)]));
  recorded[RUN_ALIAS] = run;
  if (OBSERVE || (run.run_id && !FRESH)) {
    log(`Recorded run: ${run.run_id || 'none'} (valid until ${run.valid_until || '—'})`);
    if (run.run_id) {
      const { problems, view } = await verifyAndReport(session, currencies['store-default'], recorded, td(TARGETS.GONE.aliasName).productId);
      const exp = view.items.find((m) => m.name === recorded.MSN_DL_EXPIRED?.name);
      const expired = exp ? `present status=${exp.status} daysRemaining=${exp.daysRemaining}` : 'absent';
      if (OBSERVE) {
        log(`  expired-not-swept: ${expired}`);
        if (!DRY_RUN) writeEnvAliasOverride({ [RUN_ALIAS]: { expired_observation: `${new Date(view.at).toISOString()} ${expired}` } });
        if (problems.length) { log(`  ⚠ ${problems.length} problem(s):\n    - ${problems.join('\n    - ')}`); process.exitCode = 1; }
        return;
      }
      if (!problems.length) { log(`✓ run ${run.run_id} is still valid — reused, nothing written.`); return; }
      log(`  run ${run.run_id} no longer holds (${problems.length} problem(s)) — minting a new one.`);
    }
  }
  if (OBSERVE) return;

  // Resolve everything BEFORE the first write.
  const products = { IN_STOCK: await resolveFromAlias(TARGETS.IN_STOCK.fromAlias), OTHER: await resolveFromAlias(TARGETS.OTHER.fromAlias) };
  const line = await resolveFromAlias(READER_ORDER.lineFromAlias);
  const banners = {};
  for (const [type, alias] of Object.entries(BANNER_FROM_ALIAS)) {
    const url = td(alias).banner_url;
    if (!url || !(await assetUrlOk(url))) throw new Error(`banner for ${type} (${alias}.banner_url) does not serve — run npm run seed:loyalty-missions first; a Published mission can never gain a banner later`);
    banners[type] = url;
  }
  const template = await api('GET', '/api/loyalty-missions/new', null, { expectStatus: [200] });
  const clock = session.serverNow;
  const runId = newRunId(clock);
  const ctx = { template, storeId: STORE_ID, runId, clock, currencies, banners, products };
  log(`Run ${runId}: windows from ${new Date(clock).toISOString()}, ladder valid until ${validUntil(clock)}`);

  // Archive every earlier run first.
  const earlier = (await ourMissions()).filter((m) => m.status !== 'Archived' && runIdFromName(m.name) !== runId);
  if (earlier.length) { log(`Archiving ${earlier.length} mission(s) of earlier VCST5957 runs`); await archiveMissions(earlier); }

  const created = {};
  const ourNames = new Set(MISSIONS.map((m) => missionName(m, runId)));
  const pre = await readerView(session, line.currency);
  const balanceBefore = (await readLoyaltyBalance(api, { userId: session.userId })).balance;

  log('Phase 1 — missions that must exist BEFORE the reader order');
  for (const spec of MISSIONS.filter((m) => m.phase === 'pre')) created[spec.aliasName] = await createMission(spec, ctx);

  log('Phase 2 — the reader order');
  const coCompleted = predictCoCompletions(pre.items, line.price * READER_ORDER.quantity, ourNames);
  log(`  predicted co-completions for the reader: ${coCompleted.length ? coCompleted.join('; ') : 'none'}`);
  const order = await placeReaderOrder(session, runId, line, pre);
  if (!DRY_RUN) {
    let done = null;
    for (let i = 0; i < 40 && !done; i++) {
      await sleep(3000);
      done = (await readerView(session, line.currency)).items.find((m) => m.name === created.MSN_DL_DONE_SOON.name && m.status === 'Completed');
    }
    if (!done) throw new Error(`order ${order.number} placed but ${created.MSN_DL_DONE_SOON.name} did not complete for the reader within 2 min — check the loyalty Hangfire queue; do NOT re-run blindly (the order is real)`);
    log(`  ✓ ${created.MSN_DL_DONE_SOON.name} Completed for the reader (daysRemaining=${done.daysRemaining})`);
  }

  log('Phase 3 — missions that must NOT see the order');
  const gone = await createGoneProduct();
  products.GONE = gone;
  for (const spec of MISSIONS.filter((m) => m.phase === 'post')) created[spec.aliasName] = await createMission(spec, ctx);
  await api('DELETE', `/api/catalog/products?${idsParam([gone.id])}`, null, { expectStatus: [200, 204] });
  const goneDeletedAt = new Date().toISOString();
  log(`  ✓ deleted ${gone.sku} (${gone.id}) — its goal item on ${created.MSN_DL_SKU_NOAVAIL.name} now points at nothing`);

  log('Phase 4 — teardown proof on an invisible probe');
  const probe = await createMission({ ...TEARDOWN_PROBE, aliasName: 'probe' }, ctx);
  await archiveMissions([{ id: probe.id, name: probe.name, status: 'Published' }]);
  if (!DRY_RUN) {
    const back = await api('GET', `/api/loyalty-missions/${probe.id}`, null, { expectStatus: [200] });
    if (back.status !== 'Archived') throw new Error(`teardown proof failed: ${probe.name} is ${back.status} after archive`);
    log(`  ✓ ${probe.name} Published -> Archived`);
  }

  if (DRY_RUN) { log('DRY RUN complete — no writes, no alias writeback.'); return; }

  // Write back, then verify against what was written (one source for both).
  const vu = validUntil(clock);
  const balanceAfter = (await readLoyaltyBalance(api, { userId: session.userId })).balance;
  const writeback = {
    [RUN_ALIAS]: {
      run_id: runId, seeded_at: new Date(clock).toISOString(), valid_until: vu, clock_skew_ms: String(session.skewMs),
      reader_user_id: session.userId, order_id: order.id, order_number: order.number,
      balance_before: String(balanceBefore), balance_after: String(balanceAfter), order_co_completed: coCompleted.join('; '),
      expired_observation: '',
    },
    [TARGETS.GONE.aliasName]: { productId: gone.id, catalogId: gone.catalogId, deleted_at: goneDeletedAt },
  };
  for (const spec of MISSIONS) {
    const c = created[spec.aliasName];
    writeback[spec.aliasName] = { id: c.id, name: c.name, run_id: runId, end_date: c.endDate, valid_until: spec.days === null ? '' : vu };
  }
  writeEnvAliasOverride(writeback);
  const merged = Object.fromEntries(Object.entries(writeback).map(([k, v]) => [k, { ...td(k), ...v }]));

  log('Phase 5 — verify as the reader');
  let result = await verifyAndReport(session, line.currency, merged, gone.id);
  for (let i = 0; i < 5 && result.problems.length; i++) { await sleep(5000); result = await verifyAndReport(session, line.currency, merged, gone.id); }
  const readingsBack = {};
  for (const spec of MISSIONS) {
    const r = result.readings[spec.aliasName] || {};
    readingsBack[spec.aliasName] = {
      days_remaining_at_seed: r.present === false ? 'absent' : String(r.daysRemaining ?? 'null'),
      status_at_seed: r.status || '', percentage_at_seed: r.percentage == null ? '' : String(r.percentage),
    };
  }
  writeEnvAliasOverride(readingsBack);
  if (result.problems.length) throw new Error(`reader view does not hold:\n  - ${result.problems.join('\n  - ')}`);
  log(`Seed complete — run ${runId}, ladder valid until ${vu}. Teardown: node scripts/seed-data/loyalty/seed-missions-deadline.mjs --teardown --run ${runId}`);
  verbose(`predicted daysRemaining at valid_until: ${MISSIONS.filter((m) => m.days).map((m) => `${m.key}=${predictDaysRemaining(created[m.aliasName].endDate, Date.parse(vu) - 1000)}`).join(' ')}`);
}

main().catch((e) => { console.error(`SEED FAILED: ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
