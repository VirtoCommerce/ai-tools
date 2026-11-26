#!/usr/bin/env node
/**
 * seed-order-date-filter.mjs — the /account/orders date-range filter buyer (VCST-5097, suite 014
 * ORD-084/085/086/088/089/091/094).
 *
 * One dedicated personal storefront Customer (no organization) on {{buyer.store}} whose order list is
 * nothing but this fixture: a MULTI day (6 orders) and a SINGLE day (1 order). Data:
 * test-data/orders/order-date-filter.json; rules: order-date-filter-specs.mjs.
 *
 * createdDate cannot be set (KB-971BC129: POST and PUT both keep the server instant — re-measured on
 * vcst 2026-11-26), so the two days are two real seed days. Each run places at most ONE group, in
 * `dayOrder`, and only when it lands >= minDayGapHours after the previous group and inside the declared
 * month relation. Until the last group is placed the alias says `status: pending` and `nextRunFrom`.
 * A placed group is never recreated while it is valid; a group that is lost or broken is rebuilt at the
 * run instant, and every LATER group is discarded with it (it would no longer follow it).
 *
 * Orders are user-scoped: customerId = the ApplicationUser id (as seed-sales-rep.mjs Phase 4), no
 * organizationId, so the buyer's own /account/orders lists them. Read-back: as the buyer, the storefront
 * GraphQL `orders` query must return exactly the fixture's numbers.
 *
 * Runtime ids, createdDate instants, the UTC dates and order numbers per day land in
 * test-data/aliases.<env>.json under ORD_DATE_FILTER_BUYER; the fixture holds business keys only.
 * Flags: --dry-run · --verbose · --teardown
 * Exit code: 1 when any read-back, day-contract or teardown-residue check fails (one RESULT line).
 */
import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, ROOT, BACK_URL, DRY_RUN, VERBOSE, TEARDOWN, TEST_ENV,
  writeEnvAliasOverride, verifyRemoved, discoverLineCandidates, findOrdersByExactNumber,
} from '../../lib/seed-common.mjs';
import {
  setFlags, authenticate, findUserByEmail, findContactByEmail, ensureMembershipContact, ensureSecurityAccount, deleteUserByEmail, passwordFor,
} from '../../lib/user-provision.mjs';
import {
  loadFixture, orderNumber, allOrderNumbers, planPlacement, dateAt, groupDayProblems, ALIAS, SEED_SCRIPT,
} from './order-date-filter-specs.mjs';

const fx = loadFixture();
const B = fx.buyer;
const overlayPath = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
const overlay = () => (existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {});
const problems = [];
const problem = (m) => { problems.push(m); log(`⚠ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- buyer -----------------------------------------------------------------

async function ensureBuyer() {
  if (!process.env[B.passwordVar]) throw new Error(`${B.passwordVar} has no value for TEST_ENV=${TEST_ENV} in test-accounts.local.json`);
  const password = passwordFor(B.passwordVar); // never logged
  const contactId = await ensureMembershipContact(B.email, B.firstName, B.lastName, []);
  if (!DRY_RUN) {
    const c = await api('GET', `/api/members/${contactId}`);
    const want = { name: `${B.firstName} ${B.lastName}`, fullName: `${B.firstName} ${B.lastName}`, currencyCode: B.currency };
    if (Object.entries(want).some(([f, v]) => c[f] !== v)) await api('PUT', '/api/members', { ...c, ...want }, { expectStatus: [200, 204] });
  }
  // reconcilePassword: the account always signs in with the declared variable's value (recorded via accountSet)
  const userId = await ensureSecurityAccount(B.email, password, contactId, 'Approved', { reconcilePassword: true });
  log(`buyer ${B.email} → user ${userId}, contact ${contactId} (personal, no organization)`);
  return { userId, contactId };
}

// ---- orders ----------------------------------------------------------------

const orderSpec = Object.fromEntries(fx.dayOrder.flatMap((g) => fx.days[g].orders.map((o) => [o.key, { ...o, group: g }])));

function matches(full, o, userId) {
  return full && full.customerId === userId && !full.organizationId && full.storeId === B.store && full.currency === B.currency
    && Math.abs((full.total || 0) - o.total) < 0.005 && full.status === o.status && !full.isCancelled && !full.isPrototype;
}

/** Live orders per group: [{ key, id, number, createdDate, ok }] (every hit of an exact number, so duplicates surface). */
async function readLive(userId) {
  const live = {};
  for (const g of fx.dayOrder) {
    live[g] = [];
    for (const o of fx.days[g].orders) {
      for (const h of await findOrdersByExactNumber(api, orderNumber(fx, o.key), { withPrototypes: true })) {
        const full = await api('GET', `/api/order/customerOrders/${h.id}`);
        live[g].push({ key: o.key, id: full.id, number: full.number, createdDate: full.createdDate, ok: matches(full, o, userId) });
      }
    }
  }
  return live;
}

let _product = null;
async function lineProduct() {
  if (_product) return _product;
  const store = await api('GET', `/api/stores/${B.store}`);
  const cands = await discoverLineCandidates(api, 10, { catalogId: store?.catalog || null });
  _product = cands.find((c) => c.trackInventory !== true || (c.availableQuantity ?? 0) > 0) || cands[0] || null;
  if (!_product) throw new Error(`no catalog product discovered in ${B.store}'s catalog for order lines`);
  log(`  line product: ${_product.sku} (${_product.name})`);
  return _product;
}

async function deleteOrders(list) {
  for (const o of list) {
    if (DRY_RUN) { log(`  [DRY] would delete order ${o.number} ${o.id}`); continue; }
    await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
    log(`  deleted order ${o.number} ${o.id}`);
  }
}

/** Seconds to the next quarter hour (a local midnight somewhere); wait past it so one group never straddles it. */
async function avoidQuarterHourEdge() {
  const msToEdge = 15 * 60_000 - (Date.now() % (15 * 60_000));
  if (msToEdge < 90_000) { log(`  waiting ${Math.ceil(msToEdge / 1000) + 5}s past the quarter hour (a group must not straddle a local midnight)`); await sleep(msToEdge + 5000); }
}

async function createGroup(g, owner) {
  const p = await lineProduct();
  await avoidQuarterHourEdge();
  const out = [];
  for (const o of fx.days[g].orders) {
    const number = orderNumber(fx, o.key);
    const created = await api('POST', '/api/order/customerOrders', {
      number, storeId: B.store, customerId: owner.userId, customerName: `${B.firstName} ${B.lastName}`, currency: B.currency, status: o.status,
      organizationId: null, isPrototype: false,
      items: [{ productId: p.id, sku: p.sku, name: p.name, catalogId: p.catalogId, quantity: 1, price: o.total, placedPrice: o.total, extendedPrice: o.total, currency: B.currency }],
    });
    const full = await api('GET', `/api/order/customerOrders/${created.id}`);
    if (!matches(full, o, owner.userId)) problem(`order ${number}: READ-BACK DIFFERS ${JSON.stringify({ total: full.total, status: full.status, customerId: full.customerId, organizationId: full.organizationId })}`);
    log(`  order ${number} ${B.currency} ${o.total} [${o.status}] → ${full.id} @ ${full.createdDate}`);
    out.push({ key: o.key, id: full.id, number: full.number, createdDate: full.createdDate, ok: true });
  }
  const dp = groupDayProblems(out.map((x) => x.createdDate));
  if (dp.length) problem(`${g}: ${dp.join('; ')} — run again to rebuild the group`);
  return out;
}

// ---- read-back as the buyer (storefront GraphQL) ----------------------------

async function buyerToken() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: B.email, password: process.env[B.passwordVar], scope: 'offline_access', storeId: B.store }),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { token: body.access_token } : { error: `${res.status} ${body.error || ''}`.trim() };
}

async function readBackAsBuyer(expectedNumbers) {
  const tok = await buyerToken();
  if (tok.error) { problem(`buyer sign-in FAILED (${tok.error})`); return; }
  const q = `{ orders(first:50, sort:"createdDate:desc") { totalCount items { number createdDate } } }`;
  const r = await (await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok.token}` }, body: JSON.stringify({ query: q }) })).json();
  if (r.errors?.length) { problem(`buyer orders query: ${r.errors.map((e) => e.message).join('; ').slice(0, 300)}`); return; }
  const got = (r.data?.orders?.items || []).map((x) => x.number).sort();
  const want = [...expectedNumbers].sort();
  const same = JSON.stringify(got) === JSON.stringify(want);
  log(`read-back as buyer (storefront orders query): ${r.data?.orders?.totalCount} order(s) — ${same ? 'match' : `MISMATCH, expected ${want.join(', ')}`}`);
  if (!same) problem(`buyer orders list ${JSON.stringify(got)} != fixture ${JSON.stringify(want)}`);
}

// ---- seed ------------------------------------------------------------------

async function seed() {
  const owner = await ensureBuyer();
  const live = DRY_RUN && String(owner.userId).startsWith('dry-') ? {} : await readLive(owner.userId);
  const now = new Date().toISOString();
  const plan = planPlacement(fx, live, now);
  plan.reasons.forEach((r) => log(`  ${r}`));
  log(`plan @ ${now}: ${fx.dayOrder.map((g) => `${g}=${plan.actions[g]}`).join(', ')}${plan.discard.length ? `; discard ${plan.discard.join(', ')}` : ''}`);

  for (const g of plan.discard) await deleteOrders(live[g] || []);
  const placed = {};
  for (const g of fx.dayOrder) {
    if (plan.actions[g] === 'keep') { placed[g] = live[g]; log(`${g}: kept (${live[g].length} orders, ${dateAt(live[g][0].createdDate)} UTC)`); }
    else if (plan.actions[g] === 'create') {
      if (DRY_RUN) { log(`  [DRY] ${g}: would create ${fx.days[g].orders.length} order(s) now`); continue; }
      placed[g] = await createGroup(g, owner);
      log(`${g}: created ${placed[g].length} order(s) on ${dateAt(placed[g][0].createdDate)} UTC`);
    } else log(`${g}: PENDING — ${plan.pendingFrom ? 'not placeable in this run (next instant: STATUS line below)' : 'cannot be placed in the first group\'s month any more: tear down and seed again'}`);
  }
  if (DRY_RUN) return;

  const complete = fx.dayOrder.every((g) => placed[g]);
  // The plan's pendingFrom is measured from the plan instant; a group created this run lands a few seconds
  // later, so the next run's earliest instant is taken from the orders actually placed.
  const lastPlaced = [...fx.dayOrder].reverse().find((g) => placed[g]);
  const nextRunFrom = complete ? '' : (plan.pendingFrom === null ? 'teardown-and-reseed'
    : new Date(Math.max(Date.parse(plan.pendingFrom), ...placed[lastPlaced].map((x) => Date.parse(x.createdDate) + fx.minDayGapHours * 3600_000)) + 60_000).toISOString());
  const days = Object.fromEntries(Object.entries(placed).map(([g, list]) => [g, {
    date: dateAt(list[0].createdDate), count: list.length,
    numbers: list.map((x) => x.number).join(','),
    orders: Object.fromEntries(list.map((x) => [x.key, { id: x.id, number: x.number, createdDate: x.createdDate }])),
  }]));
  const multi = fx.dayOrder.find((g) => fx.days[g].role === 'multi');
  const single = fx.dayOrder.find((g) => fx.days[g].role === 'single');
  const firstDate = days[fx.dayOrder[0]]?.date;
  const month = firstDate ? firstDate.slice(0, 7) : '';
  const lastDay = month ? new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10) : '';
  // Replace, not merge: a group discarded this run must not linger in the overlay.
  const ov = overlay(); if (ov[ALIAS]) { delete ov[ALIAS]; writeFileSync(overlayPath, `${JSON.stringify(ov, null, 2)}\n`); }
  writeEnvAliasOverride({
    [ALIAS]: {
      user_id: owner.userId, contact_id: owner.contactId,
      status: complete ? 'complete' : 'pending', nextRunFrom,
      multiDay: days[multi]?.date || '', multiCount: days[multi]?.count || 0, multiOrderNumbers: days[multi]?.numbers || '',
      singleDay: days[single]?.date || '', singleCount: days[single]?.count || 0, singleOrderNumbers: days[single]?.numbers || '',
      totalCount: Object.values(days).reduce((n, d) => n + d.count, 0),
      month, monthFrom: month ? `${month}-01` : '', monthTo: lastDay,
      dayBasis: 'UTC calendar date of createdDate; every group shares one day in every zone UTC-12..UTC+14 and groups are >= 24 h apart',
      days, seededAt: now,
    },
  });
  await readBackAsBuyer(Object.values(placed).flat().map((x) => x.number));
  if (!complete) log(`STATUS pending — ${single} not placed yet. Run again: TEST_ENV=${TEST_ENV} npm run ${SEED_SCRIPT} (at or after ${nextRunFrom})`);
}

// ---- teardown --------------------------------------------------------------

async function teardown() {
  const numbers = allOrderNumbers(fx);
  log(`TEARDOWN — ${numbers.length} order number(s) ${fx.orderPrefix}*, user ${B.email}`);
  for (const n of numbers) await deleteOrders((await findOrdersByExactNumber(api, n, { withPrototypes: true })).map((o) => ({ ...o, number: n })));
  await deleteUserByEmail(B.email);
  if (!DRY_RUN) { const ov = overlay(); delete ov[ALIAS]; writeFileSync(overlayPath, `${JSON.stringify(ov, null, 2)}\n`); }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const num of numbers) n += (await findOrdersByExactNumber(api, num, { withPrototypes: true })).length;
    if (await findUserByEmail(B.email)) n += 1;
    if (await findContactByEmail(B.email)) n += 1;
    return n;
  });
  if (residue) problem(`${residue} residue item(s) after teardown (orders / user)`); else log('Teardown complete — zero residue (orders, user, contact).');
}

// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
  await auth();
  await authenticate();
  log(`${TEARDOWN ? 'TEARDOWN' : 'SEED'} order-date-filter on ${TEST_ENV}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (TEARDOWN) await teardown(); else await seed();
  console.log(problems.length ? `\nRESULT: FAIL — ${problems.length} problem(s)` : '\nRESULT: OK');
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => { console.error(`\nRESULT: ERROR — ${e.message}`); process.exit(1); });
