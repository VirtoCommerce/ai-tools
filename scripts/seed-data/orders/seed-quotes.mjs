#!/usr/bin/env node
/**
 * seed-quotes.mjs — Quote (RFQ) STATE fixtures (VCST-5482).
 *
 * Provisions the non-feature-gated quote states suite 015 needs and that were DEFERRED for lack of a
 * seeder (QUOTE_WITH_ADMIN_RESPONSE, ACCEPTED_QUOTE — ~15 blocked cases). Thin resolve-tokens → POST
 * over the Swagger-shaped QuoteRequest fixtures in test-data/quotes/*.json; all non-body logic
 * (target status, owner alias, line contract, the @td() aliases) lives in orders-specs.mjs.
 *
 * ENDPOINT CONTRACT — the VirtoCommerce.Quote module's REST route + status vocabulary are confirmed
 * LIVE (quality-gates G6). They are centralized in QUOTE_ENDPOINTS below and the status strings in
 * orders-specs.mjs, so a correction is a one-line edit that every consumer follows. The module must be
 * deployed and Quotes enabled on the store (Quotes.EnableQuotes) — run with the matching TEST_ENV.
 * Business keys (AGENT-TEST-QTE-* number) stay in the fixture; the runtime quote GUID is written to
 * aliases.<env>.json.
 *
 * OWNER — the account suite 015 signs in as (orders-specs.mjs QUOTE_OWNER_ALIAS → users.csv row →
 * live login id + its organization). Both customerId (the LOGIN id, not the contact id) and
 * organizationId must match, or the buyer's quote list never shows the quote (orders-specs.mjs
 * QUOTE_FIXTURES comment). An unresolvable owner ABORTS: an ownerless quote is how
 * REG-2026-10-05-1521 lost 13 cases.
 *
 * IDEMPOTENCY — an existing exact-number quote is kept when owner, organization, status and line
 * count all match the spec; otherwise it is REPLACED (create the new one first, prove it, then delete
 * the old), so a failed create never leaves the alias pointing at nothing.
 *
 * Flags: --dry-run (reads only), --verbose, --teardown (delete only AGENT-TEST-QTE-* quotes), --only <KEY>.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, loadAliases, loadCsv,
  ROOT, DRY_RUN, TEARDOWN, ONLY, STORE_ID, writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts,
} from '../../lib/seed-common.mjs';
import {
  QUOTE_FIXTURES, QUOTE_OWNER_ALIAS, quoteNumber, resolveTokens, finalizeQuoteBody, applyCatalogItems, applyCatalogPrices,
  validateQuoteFixtureContract,
} from './orders-specs.mjs';

// VirtoCommerce.Quote module REST surface. Confirmed live at G6 against the module swagger
// (docs/VirtoCommerce.Quote/swagger.json, vcst 2026-07-20): every route is under /api/quote/requests
// — NOT /api/quote (the earlier guess 404'd on create; search 404'd silently under expectStatus).
// A dedicated `PUT /api/quote/requests/{id}/status?status=<value>` also exists for status-only changes.
const QUOTE_ENDPOINTS = {
  search: '/api/quote/requests/search',
  create: '/api/quote/requests',
  update: '/api/quote/requests',
  byId: (id) => `/api/quote/requests/${id}`,
  delete: (ids) => `/api/quote/requests?ids=${ids}`,
  setStatus: (id, status) => `/api/quote/requests/${id}/status?status=${encodeURIComponent(status)}`,
};

function loadFixture(relPath) {
  return JSON.parse(readFileSync(join(ROOT, 'test-data', relPath), 'utf8'));
}

/**
 * Resolve the quote OWNER from the alias suite 015 signs in as: aliases.json → users.csv row (email +
 * org business key) → live login id + contact → the organization. The organization must be one the
 * contact belongs to; when the contact has several, the users.csv org row's name picks it. Throws
 * (never returns a partial owner) — see the header.
 */
async function resolveOwner() {
  const alias = loadAliases()[QUOTE_OWNER_ALIAS];
  const userKey = alias?.filter?.user_id;
  const row = userKey && loadCsv(`test-data/${alias.file}.csv`).find((r) => r.user_id === userKey);
  if (!row?.email) throw new Error(`${QUOTE_OWNER_ALIAS} does not resolve to a users.csv row with an email`);
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(row.email)}`, null, { expectStatus: [200, 404] });
  if (!u?.id || !u.memberId) throw new Error(`owner ${row.email} (${QUOTE_OWNER_ALIAS}) has no login or no contact on this env — seed company-users first`);
  const contact = await api('GET', `/api/members/${u.memberId}`, null, { expectStatus: [200, 404] });
  const orgIds = contact?.organizations || [];
  const orgRow = row.org_id ? loadCsv('test-data/b2b/organizations.csv').find((o) => o.org_id === row.org_id) : null;
  let orgId = null; let orgName = null;
  for (const id of orgIds) {
    const org = await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 404] });
    if (orgIds.length === 1 || (orgRow && org?.name === orgRow.org_name)) { orgId = id; orgName = org?.name || null; break; }
  }
  if (!orgId) throw new Error(`owner ${row.email} belongs to ${orgIds.length} organization(s) and none could be chosen — a quote without its organization is invisible to the buyer`);
  return { id: u.id, name: u.userName || row.email, email: row.email, orgId, orgName };
}

/** Every quote carrying EXACTLY this number (the search keyword is not an exact match), newest first. */
async function findQuotesByNumber(number) {
  const r = await api('POST', QUOTE_ENDPOINTS.search, { keyword: number, take: 50 }, { expectStatus: [200, 201, 404] });
  return (r?.results || []).filter((q) => q.number === number)
    .sort((x, y) => String(y.createdDate || '').localeCompare(String(x.createdDate || '')));
}

/**
 * Why a stored quote is NOT a valid instance of the spec (empty array = keep it). `languageCode` is
 * judged too: a quote without one is listed by the buyer's `quotes` query but `quote(id)` fails with
 * ARGUMENT_NULL — the storefront detail page's "Something went wrong" (vcst, 2026-10-05).
 */
function driftReasons(spec, q, owner, languageCode) {
  const reasons = [];
  if (languageCode && q.languageCode !== languageCode) reasons.push(`languageCode ${q.languageCode} ≠ ${languageCode}`);
  if (q.status !== spec.quoteStatus) reasons.push(`status ${q.status} ≠ ${spec.quoteStatus}`);
  if (q.customerId !== owner.id) reasons.push(`customerId ${q.customerId} ≠ owner ${owner.id}`);
  if (q.organizationId !== owner.orgId) reasons.push(`organizationId ${q.organizationId} ≠ ${owner.orgId}`);
  reasons.push(...validateQuoteFixtureContract(spec, q).problems);
  return reasons;
}

/** Map(productId → the store's live list price) via the pricing engine; empty on failure (fixture prices kept). */
async function catalogListPrices(currency, catalogId, products) {
  if (!products.length) return new Map();
  try {
    const r = await api('POST', '/api/pricing/evaluate', { storeId: STORE_ID, catalogId, currency, productIds: products.map((p) => p.id) });
    return new Map((Array.isArray(r) ? r : []).filter((p) => Number(p.list) > 0).map((p) => [p.productId, Number(p.list)]));
  } catch (e) {
    log(`  WARN: price evaluation failed (${String(e.message).slice(0, 120)}) — quoted lines keep fixture prices`);
    return new Map();
  }
}

async function removeOthers(number, quotes) {
  for (const q of quotes) {
    await api('DELETE', QUOTE_ENDPOINTS.delete(q.id), null, { expectStatus: [200, 204] });
    log(`  removed superseded quote ${number} ${q.id} (owner ${q.customerId || 'none'})`);
  }
}

async function ensureQuote(spec, owner, getProducts) {
  const number = quoteNumber(spec.key);
  const raw = loadFixture(spec.fixtureFile);
  const { obj, unresolved } = resolveTokens(raw, process.env);
  if (unresolved.length) { log(`  WARN: quote ${number} — unresolved env token(s) ${unresolved.join(', ')} — skip`); return null; }

  const hits = await findQuotesByNumber(number);
  let firstDrift = null;
  for (const h of hits) {
    const full = await api('GET', QUOTE_ENDPOINTS.byId(h.id), null, { expectStatus: [200, 404] });
    const reasons = full ? driftReasons(spec, full, owner, obj.languageCode) : ['unreadable'];
    if (!reasons.length) {
      log(`  quote ${number} exists and matches the spec → ${h.id} (kept)`);
      await removeOthers(number, hits.filter((x) => x.id !== h.id));
      return h.id;
    }
    firstDrift ??= reasons;
  }
  if (hits.length) log(`  quote ${number} ${DRY_RUN ? 'WOULD BE REPLACED' : 'replacing'}: ${firstDrift.join('; ')}`);

  // Point quoted line items at real products of the STORE's catalog, priced at the store's live price.
  const { products, catalogId } = await getProducts();
  const withItems = applyCatalogPrices(applyCatalogItems(obj, products), await catalogListPrices(obj.currency, catalogId, products));
  const body = finalizeQuoteBody(spec, withItems, {
    customerId: owner.id, customerName: owner.name, customerEmail: owner.email,
    organizationId: owner.orgId, organizationName: owner.orgName,
  });
  // The non-vacuity contract must hold on what is actually sent, not only on the committed fixture.
  const contract = validateQuoteFixtureContract(spec, body);
  if (!contract.ok) throw new Error(`quote ${number}: priced body breaks its contract — ${contract.problems.join('; ')}`);
  if (DRY_RUN) { log(`  [DRY] would create quote ${number} (${spec.quoteStatus}, ${body.items.length} lines) for ${owner.email}`); return null; }
  const created = await api('POST', QUOTE_ENDPOINTS.create, body, { expectStatus: [200, 201] });
  const id = created?.id;
  if (!id) throw new Error(`quote ${number}: create returned no id`);

  // Read back: the create body's status persists on vcst, but re-assert through the status-only route
  // for any version that ignores it, then fail loud if the stored quote is still not the spec.
  let full = await api('GET', QUOTE_ENDPOINTS.byId(id));
  if (full?.status !== spec.quoteStatus) {
    await api('PUT', QUOTE_ENDPOINTS.setStatus(id, spec.quoteStatus), null, { expectStatus: [200, 204] });
    full = await api('GET', QUOTE_ENDPOINTS.byId(id));
  }
  const left = driftReasons(spec, full || {}, owner, obj.languageCode);
  if (left.length) throw new Error(`quote ${number} (${id}) created but not as specified: ${left.join('; ')}`);

  await removeOthers(number, hits); // create-then-delete: only after the replacement is proven
  log(`  quote ${number} (${spec.quoteStatus}, ${full.items.length} lines, owner ${owner.email} / ${owner.orgName || owner.orgId}) → ${id}`);
  return id;
}

async function teardown() {
  log('TEARDOWN — deleting only AGENT-TEST-QTE-* quotes');
  for (const spec of QUOTE_FIXTURES) {
    const number = quoteNumber(spec.key);
    for (const q of await findQuotesByNumber(number)) {
      await api('DELETE', QUOTE_ENDPOINTS.delete(q.id), null, { expectStatus: [200, 204] });
      log(`  deleted quote ${number} ${q.id}`);
    }
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const spec of QUOTE_FIXTURES) n += (await findQuotesByNumber(quoteNumber(spec.key))).length;
    return n;
  });
  if (residue) log(`  ⚠ ${residue} AGENT-TEST-QTE-* quote(s) still present after teardown`);
  else log('Teardown complete — zero residue.');
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  const specs = QUOTE_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);
  const owner = await resolveOwner();
  log(`quotes owned by ${QUOTE_OWNER_ALIAS} = ${owner.email} (login ${owner.id}) in ${owner.orgName || 'org'} (${owner.orgId})`);

  // Real catalog products for the quoted line items — env-resilient, code-sorted (deterministic), and
  // discovered only when a quote is actually (re)built.
  // Scoped to the store's catalog so every quoted product renders and prices for the buyer.
  let picked = null;
  const maxItems = Math.max(1, ...specs.map((s) => (loadFixture(s.fixtureFile).items || []).length));
  const getProducts = async () => {
    if (picked) return picked;
    const store = await api('GET', `/api/stores/${STORE_ID}`, null, { expectStatus: [200, 404] });
    const catalogId = store?.catalog || null;
    const products = await discoverCatalogProducts(api, maxItems, { catalogId, sort: 'code:asc' });
    if (products.length) verbose(`quoted items use ${products.length} product(s) of catalog ${catalogId}: ${products.map((p) => p.sku).join(', ')}`);
    else if (!DRY_RUN) log('  WARN: no catalog products discovered — quoted items keep synthetic placeholders (seed catalog first).');
    picked = { products, catalogId };
    return picked;
  };

  const writeback = {};
  for (const spec of specs) {
    const id = await ensureQuote(spec, owner, getProducts);
    if (id) writeback[spec.alias] = { id, number: quoteNumber(spec.key) };
  }
  writeEnvAliasOverride(writeback);
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Quote-state seed complete. Runtime GUIDs written to aliases.<env>.json.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
