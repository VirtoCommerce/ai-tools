#!/usr/bin/env node
/**
 * seed-quotes.mjs — Quote (RFQ) STATE fixtures for suite 015 (VCST-5482; reworked 2026-10-15).
 *
 * A thin resolve → create → transition → verify → write-back over orders-specs.mjs QUOTE_FIXTURES,
 * which is the single source of truth for the states, their purpose and the platform facts behind
 * them (read its QUOTE STATE FIXTURES header before changing anything here).
 *
 * WHAT IT PRODUCES — every QUOTE_FIXTURES state once PER agent-pool B2B buyer (quote-buyers.mjs):
 *   - customerId = the buyer's LOGIN id and organizationId = the buyer's LIVE organization — the two
 *     keys the buyer's quote list filters on (KB-874B24DD);
 *   - languageCode = the store's default language (KB-97C03EB4);
 *   - real in-stock catalog products from the store's catalog, list price from the live pricing engine
 *     (POST /api/pricing/evaluate), admin proposal = catalog x proposalRatio (strictly lower);
 *   - the OOS state's first line is the permanent OOS fixture product (@td(PROD_OOS), resolved by SKU);
 *   - statuses walked through PUT /api/quote/requests/{id}/status in statusPath order.
 * Then it READS BACK every quote and judges it with quoteDriftProblems, and (unless --no-buyer-check)
 * signs in ONCE as each buyer and proves through xAPI that the buyer's list holds every quote seeded
 * for that buyer and that `quote(id)` opens. Runtime ids → aliases.<env>.json: the default slot's id /
 * number / buyer_email / expiration_date, plus `<field>_slot<n>` for every slot.
 *
 * IDEMPOTENCY — find by exact number; reuse only when quoteDriftProblems finds nothing (status, owner,
 * org, language, expiry class, line count, proposal below list, OOS line); otherwise delete + rebuild.
 * A consumed disposable quote (Approved/Declined by a case) therefore always rebuilds. An APPROVED
 * quote placed a real customer order: that order is NOT deleted here (it is the case's evidence).
 *
 * Flags: --dry-run (reads only) · --verbose · --teardown (delete every AGENT-TEST-QTE-* quote, zero
 *        residue) · --only <KEY|ALIAS> · --slot <n> · --no-buyer-check
 *
 * Run: TEST_ENV=vcst npm run seed:quotes · Guard: npm run td:validate:orders · Live: npm run td:reconcile
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, loadAliases, loadCsv,
  ROOT, DRY_RUN, TEARDOWN, ONLY, BACK_URL, STORE_ID, writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import {
  QUOTE_FIXTURES, QUOTE_MARK, DEFAULT_PROPOSAL_RATIO,
  quoteNumberForSlot, quoteExpiration, priceQuoteLines, quoteDriftProblems, quoteFixtureSetProblems,
  resolveTokens, finalizeQuoteBody, applyCatalogItems,
} from './orders-specs.mjs';
import { poolBuyerRows, resolveQuoteBuyer, slotField, DEFAULT_QUOTE_SLOT } from './quote-buyers.mjs';

const argv = process.argv.slice(2);
const SLOT_ONLY = argv.includes('--slot') ? argv[argv.indexOf('--slot') + 1] : null;
const BUYER_CHECK = !argv.includes('--no-buyer-check');

// VirtoCommerce.Quote REST surface (confirmed live on vcst, 2026-07-20 and 2026-10-15).
const QUOTE_ENDPOINTS = {
  search: '/api/quote/requests/search',
  create: '/api/quote/requests',
  byId: (id) => `/api/quote/requests/${id}`,
  delete: (ids) => `/api/quote/requests?${ids.map((i) => `ids=${encodeURIComponent(i)}`).join('&')}`,
  setStatus: (id, status) => `/api/quote/requests/${id}/status?status=${encodeURIComponent(status)}`,
};

const loadFixture = (rel) => JSON.parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'));

/** Every quote whose number starts with the domain mark (paged). */
async function listMarked() {
  const out = [];
  for (let skip = 0; ; skip += 100) {
    const r = await api('POST', QUOTE_ENDPOINTS.search, { keyword: QUOTE_MARK, skip, take: 100 }, { expectStatus: [200, 201] });
    const page = (r?.results || []).filter((q) => String(q.number || '').startsWith(`${QUOTE_MARK}-`));
    out.push(...page);
    if ((r?.results || []).length < 100) break;
  }
  return out;
}

async function findByNumber(number) {
  const r = await api('POST', QUOTE_ENDPOINTS.search, { keyword: number, take: 20 }, { expectStatus: [200, 201] });
  const hit = (r?.results || []).find((q) => q.number === number);
  return hit ? api('GET', QUOTE_ENDPOINTS.byId(hit.id)) : null;
}

async function teardown() {
  const all = await listMarked();
  if (DRY_RUN) { log(`DRY RUN: would delete ${all.length} ${QUOTE_MARK}-* quote(s)`); return; }
  for (let i = 0; i < all.length; i += 20) await api('DELETE', QUOTE_ENDPOINTS.delete(all.slice(i, i + 20).map((q) => q.id)), null, { expectStatus: [200, 204] });
  const residue = await verifyRemoved(async () => (await listMarked()).length);
  log(`Teardown: deleted ${all.length} ${QUOTE_MARK}-* quote(s); residue ${residue}`);
  if (residue) throw new Error(`teardown left ${residue} ${QUOTE_MARK}-* quote(s) behind`);
}

/** The permanent OOS fixture product, resolved by its SKU through the PROD_OOS alias (never a literal). */
async function resolveOosProduct(catalogId) {
  const a = loadAliases().PROD_OOS;
  if (!a?.file) throw new Error('alias PROD_OOS is missing from aliases.json — the OOS quote needs it');
  const [[col, want]] = Object.entries(a.filter);
  const row = loadCsv(`test-data/${a.file}.csv`).find((r) => r[col] === want);
  const sku = row?.[a.fields.sku];
  if (!sku) throw new Error(`PROD_OOS: no ${a.file}.csv row with ${col}=${want}`);
  const r = await api('POST', '/api/catalog/search/products', { searchPhrase: sku, catalogId, take: 10, responseGroup: 'ItemInfo' }, { expectStatus: [200, 201] });
  const p = (r?.items || []).find((x) => x.code === sku);
  if (!p) throw new Error(`PROD_OOS (${sku}) is not in the store catalog — run npm run seed:products first`);
  const inv = await api('POST', '/api/inventory/search', { productIds: [p.id], take: 50 }, { expectStatus: [200, 201] });
  const available = (inv?.results || []).reduce((n, i) => n + Math.max(0, (i.inStockQuantity || 0) - (i.reservedQuantity || 0)), 0);
  if (available > 0) log(`  WARN: PROD_OOS (${sku}) has ${available} unit(s) available right now — QUOTE_PROPOSAL_OOS is NOT out of stock until it is re-zeroed (npm run seed:products); the consuming case must guard (BLOCKED, not FAIL)`);
  return { id: p.id, sku, name: p.name, catalogId: p.catalogId, minQuantity: p.minQuantity ?? 0, maxQuantity: p.maxQuantity ?? 0, available };
}

/** In-stock, priced, real products from the store's catalog — line candidates for every quote. */
async function lineCandidates(catalogId, excludeId) {
  const found = (await discoverCatalogProducts(api, 10, { catalogId, realOnly: true })).filter((p) => p.id !== excludeId);
  return found;
}

async function evaluatePrices(catalogId, ids) {
  if (!ids.length) return new Map();
  const ev = await api('POST', '/api/pricing/evaluate', { storeId: STORE_ID, catalogId, productIds: ids, currency: 'USD' }, { expectStatus: [200, 201] });
  return new Map((Array.isArray(ev) ? ev : []).filter((e) => Number(e.list) > 0).map((e) => [e.productId, Number(e.list)]));
}

async function buyerCheck(buyer, numbers, languageCode, sampleId) {
  const password = resolvePassword(buyer.passwordRaw);
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: buyer.email, password, scope: 'offline_access', storeId: STORE_ID }),
  });
  const token = (await res.json().catch(() => ({}))).access_token;
  // ONE attempt only — a retry loop against a shared account is how accounts get locked.
  if (!token) return [`slot ${buyer.slot}: buyer sign-in failed (${res.status}) — not retried; check the b2b_password variable of that pool row in .env.local`];
  const gql = async (query, variables) => (await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }),
  })).json();
  const v = { s: STORE_ID, c: languageCode, cur: 'USD' };
  const list = await gql('query($s:String!,$c:String!,$cur:String!,$k:String){quotes(storeId:$s,cultureName:$c,currencyCode:$cur,keyword:$k,first:200){items{number}}}', { ...v, k: QUOTE_MARK });
  if (list.errors) return [`slot ${buyer.slot}: quotes query errored ${JSON.stringify(list.errors.map((e) => e.message))}`];
  const seen = new Set((list.data?.quotes?.items || []).map((q) => q.number));
  const missing = numbers.filter((n) => !seen.has(n));
  const problems = missing.length ? [`slot ${buyer.slot}: ${missing.length} seeded quote(s) NOT in the buyer's list: ${missing.join(', ')}`] : [];
  const one = await gql('query($id:String!,$s:String!,$c:String!,$cur:String!){quote(id:$id,storeId:$s,cultureName:$c,currencyCode:$cur){id status}}', { ...v, id: sampleId });
  if (one.errors || !one.data?.quote?.id) problems.push(`slot ${buyer.slot}: quote(id) did not open ${sampleId}: ${JSON.stringify(one.errors?.map((e) => e.message) || one.data)}`);
  return problems;
}

async function ensureQuote(spec, buyer, ctx) {
  const number = quoteNumberForSlot(spec.key, buyer.slot, DEFAULT_QUOTE_SLOT);
  const fixture = loadFixture(spec.fixtureFile);
  const { obj, unresolved } = resolveTokens(fixture, { ...process.env, QUOTE_BUYER_EMAIL: buyer.email });
  if (unresolved.length) throw new Error(`${spec.alias}: unresolved token(s) ${unresolved.join(', ')}`);
  const expect = { customerId: buyer.userId, organizationId: buyer.organizationId, languageCode: ctx.languageCode, lines: fixture.items.length, oosProductId: ctx.oos?.id };

  const existing = await findByNumber(number);
  if (existing) {
    const drift = quoteDriftProblems(spec, existing, expect, ctx.now);
    if (!drift.length) { verbose(`${number} reused (${existing.id})`); return existing; }
    if (DRY_RUN) { log(`  DRY RUN: ${number} would rebuild — ${drift.join('; ')}`); return existing; }
    await api('DELETE', QUOTE_ENDPOINTS.delete([existing.id]), null, { expectStatus: [200, 204] });
    log(`  ${number} rebuilding — ${drift.join('; ')}`);
  } else if (DRY_RUN) { log(`  DRY RUN: would create ${number} (${spec.statusPath.join(' -> ')})`); return null; }

  let withItems = applyCatalogItems(obj, ctx.candidates);
  if (spec.oosLineIndex !== undefined) {
    const items = [...withItems.items];
    items[spec.oosLineIndex] = { ...items[spec.oosLineIndex], productId: ctx.oos.id, sku: ctx.oos.sku, name: ctx.oos.name, catalogId: ctx.oos.catalogId };
    withItems = { ...withItems, items };
  }
  const { items, missing } = priceQuoteLines(withItems.items, (id) => ctx.prices.get(id), spec.proposalRatio ?? DEFAULT_PROPOSAL_RATIO);
  if (missing.length) throw new Error(`${spec.alias}: no USD catalog price for product(s) ${missing.join(', ')} — a synthetic price would make "proposal differs from catalog" unprovable`);
  const body = finalizeQuoteBody(spec, { ...withItems, items }, {
    status: spec.statusPath[0], number, customerId: buyer.userId, customerName: buyer.email,
    organizationId: buyer.organizationId, organizationName: buyer.organizationName,
    languageCode: ctx.languageCode, expirationDate: quoteExpiration(spec, ctx.now),
  });
  const created = await api('POST', QUOTE_ENDPOINTS.create, body, { expectStatus: [200, 201] });
  if (!created?.id) throw new Error(`${number}: create returned no id`);
  for (const st of spec.statusPath.slice(1)) await api('PUT', QUOTE_ENDPOINTS.setStatus(created.id, st), null, { expectStatus: [200, 204] });
  const live = await api('GET', QUOTE_ENDPOINTS.byId(created.id));
  const drift = quoteDriftProblems(spec, live, expect, ctx.now);
  if (drift.length) throw new Error(`${number} persisted wrong: ${drift.join('; ')}`);
  log(`  + ${number.padEnd(44)} ${spec.quoteStatus.padEnd(13)} ${live.expirationDate ? `exp ${live.expirationDate.slice(0, 10)} ` : ''}${live.id}`);
  return live;
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  const contract = quoteFixtureSetProblems();
  if (contract.length) { console.error('ABORT: QUOTE_FIXTURES no longer satisfies its design contract:'); contract.forEach((p) => console.error(`  - ${p}`)); process.exit(2); }

  // The spec's statuses must exist on THIS platform (Quotes.Status), or a PUT would write a value no UI renders.
  const allowed = (await api('GET', '/api/platform/settings/Quotes.Status', null, { expectStatus: [200, 404] }))?.allowedValues || [];
  const unknown = [...new Set(QUOTE_FIXTURES.flatMap((s) => s.statusPath))].filter((s) => !allowed.includes(s));
  if (unknown.length) throw new Error(`status(es) ${unknown.join(', ')} are not in this platform's Quotes.Status (${allowed.join(', ')})`);

  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  const ctx = { now: new Date(), languageCode: store.defaultLanguage };
  if (!ctx.languageCode) throw new Error(`store ${STORE_ID} has no defaultLanguage — quotes would be created without languageCode (KB-97C03EB4)`);

  const specs = QUOTE_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);
  ctx.oos = specs.some((s) => s.oosLineIndex !== undefined) ? await resolveOosProduct(store.catalog) : null;
  const candidates = await lineCandidates(store.catalog, ctx.oos?.id);
  ctx.prices = await evaluatePrices(store.catalog, [...candidates.map((p) => p.id), ...(ctx.oos ? [ctx.oos.id] : [])]);
  ctx.candidates = candidates.filter((p) => ctx.prices.has(p.id));
  if (!DRY_RUN && ctx.candidates.length < Math.max(...specs.map((s) => loadFixture(s.fixtureFile).items.length))) {
    throw new Error(`only ${ctx.candidates.length} priced catalog product(s) in ${store.catalog} — not enough distinct lines`);
  }
  verbose(`line products: ${ctx.candidates.map((p) => `${p.sku}@${ctx.prices.get(p.id)}`).join(', ')}`);

  const buyers = [];
  for (const row of poolBuyerRows().filter((r) => !SLOT_ONLY || String(r.slot) === String(SLOT_ONLY))) {
    const b = await resolveQuoteBuyer(api, row);
    if (b.error) { log(`  WARN: slot ${b.slot} (${b.email}) skipped — ${b.error}`); continue; }
    if (b.orgCount > 1) log(`  WARN: slot ${b.slot} belongs to ${b.orgCount} organizations — quotes are stamped with the first (${b.organizationName}); the buyer sees them only while that org is current`);
    log(`Buyer slot ${b.slot}: ${b.email} → org ${b.organizationName} (${b.organizationId})`);
    buyers.push(b);
  }
  if (!buyers.length) throw new Error('no agent-pool B2B buyer resolved — nothing to seed for');

  const writeback = {};
  const perBuyerNumbers = new Map(buyers.map((b) => [b.slot, []]));
  const sample = new Map();
  for (const spec of specs) {
    for (const buyer of buyers) {
      const q = await ensureQuote(spec, buyer, ctx);
      if (!q?.id || DRY_RUN) continue;
      perBuyerNumbers.get(buyer.slot).push(q.number);
      if (!sample.has(buyer.slot)) sample.set(buyer.slot, q.id);
      const w = (writeback[spec.alias] ||= { seeded_at: ctx.now.toISOString() });
      w[slotField('id', buyer.slot)] = q.id;
      w[slotField('number', buyer.slot)] = q.number;
      w[slotField('buyer_email', buyer.slot)] = buyer.email;
      w[slotField('expiration_date', buyer.slot)] = q.expirationDate || '';
      if (buyer.slot === DEFAULT_QUOTE_SLOT) Object.assign(w, { id: q.id, number: q.number, buyer_email: buyer.email, expiration_date: q.expirationDate || '' });
    }
  }
  if (DRY_RUN) { log('DRY RUN complete — nothing written.'); return; }

  if (BUYER_CHECK) {
    const problems = [];
    for (const b of buyers) problems.push(...await buyerCheck(b, perBuyerNumbers.get(b.slot), ctx.languageCode, sample.get(b.slot)));
    if (problems.length) { writeEnvAliasOverride(writeback); throw new Error(`buyer-side check failed:\n  ${problems.join('\n  ')}`); }
    log(`Buyer check: every seeded quote is in its buyer's xAPI list and quote(id) opens (${buyers.length} buyer(s))`);
  }
  writeEnvAliasOverride(writeback);
  log(`Quote-state seed complete — ${specs.length} state(s) x ${buyers.length} buyer(s). Runtime ids written to aliases.${process.env.TEST_ENV || 'vcst'}.json.`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
