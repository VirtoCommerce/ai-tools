#!/usr/bin/env node
/**
 * seed-quotes.mjs — Quote (RFQ) STATE fixtures (VCST-5482).
 *
 * Provisions the non-feature-gated quote states suite 015 needs and that were DEFERRED for lack of a
 * seeder (QUOTE_WITH_ADMIN_RESPONSE, ACCEPTED_QUOTE — ~15 blocked cases). Thin resolve-tokens → POST
 * over the Swagger-shaped QuoteRequest fixtures in test-data/quotes/*.json; all non-body logic
 * (target status, admin-priced / buyer-accepted flags, the @td() aliases) lives in orders-specs.mjs.
 *
 * ENDPOINT CONTRACT — the VirtoCommerce.Quote module's REST route + status vocabulary are confirmed
 * LIVE on first run (quality-gates G6). They are centralized in QUOTE_ENDPOINTS below and the status
 * strings in orders-specs.mjs, so a correction is a one-line edit that every consumer follows. The
 * module must be deployed and Quotes enabled on the store (Stores.EnableQuotes) — run with the
 * matching TEST_ENV. Business keys (AGENT-TEST-QTE-* number) stay in the fixture; the runtime quote
 * GUID is written to aliases.<env>.json.
 *
 * Flags: --dry-run (reads only), --verbose, --teardown (delete only AGENT-TEST-QTE-* quotes), --only <KEY>.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose,
  ROOT, DRY_RUN, TEARDOWN, ONLY, writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts,
} from '../../lib/seed-common.mjs';
import { QUOTE_FIXTURES, quoteNumber, resolveTokens, finalizeQuoteBody, applyCatalogItems } from './orders-specs.mjs';

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

/** Resolve the submitting org user's ApplicationUser (login) id + name by email. */
async function resolveSubmitter(email) {
  if (!email) return { id: null, name: null };
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  return u && u.id ? { id: u.id, name: u.userName || email } : { id: null, name: null };
}

async function ensureQuote(spec, submitter, products) {
  const number = quoteNumber(spec.key);
  const raw = loadFixture(spec.fixtureFile);
  const { obj, unresolved } = resolveTokens(raw, process.env);
  if (unresolved.length) { log(`  WARN: quote ${number} — unresolved env token(s) ${unresolved.join(', ')} — skip`); return null; }
  // Point quoted line items at real catalog products that exist on this env.
  const withItems = applyCatalogItems(obj, products);
  const body = finalizeQuoteBody(spec, withItems, { customerId: submitter.id, customerName: submitter.name || obj.customerName });

  // Idempotency: match by our deterministic number; rebuild on status drift.
  const found = await api('POST', QUOTE_ENDPOINTS.search, { keyword: number, take: 1 }, { expectStatus: [200, 201, 404] });
  const existing = (found?.results || [])[0];
  if (existing) {
    if (existing.status === spec.quoteStatus) { verbose(`quote ${number} exists (status ok) → ${existing.id}`); return existing.id; }
    await api('DELETE', QUOTE_ENDPOINTS.delete(existing.id), null, { expectStatus: [200, 204] });
    log(`  quote ${number} rebuilding (status ${existing.status}→${spec.quoteStatus})`);
  }

  const created = await api('POST', QUOTE_ENDPOINTS.create, body, { expectStatus: [200, 201] });
  const id = created?.id || (DRY_RUN ? `dry-${spec.key}` : null);
  // Admin per-line pricing / buyer-accept are already encoded in the fixture body (proposalPrices +
  // target status). The create body's `status` persists directly on vcst (confirmed via read-back),
  // but for platforms/versions that ignore status on create we re-assert via the module's dedicated
  // status-only route (PUT /api/quote/requests/{id}/status?status=…), which is the verified-shape path.
  if (id && !DRY_RUN && (spec.adminPriced || spec.buyerAccepted)) {
    const full = created?.id ? created : await api('GET', QUOTE_ENDPOINTS.byId(id), null, { expectStatus: [200, 404] });
    if (full && full.status !== spec.quoteStatus) {
      await api('PUT', QUOTE_ENDPOINTS.setStatus(id, spec.quoteStatus), null, { expectStatus: [200, 204] });
      verbose(`quote ${number} status re-asserted → ${spec.quoteStatus}`);
    }
  }
  log(`  quote ${number} (${spec.quoteStatus}${spec.adminPriced ? ', admin-priced' : ''}${spec.buyerAccepted ? ', accepted' : ''}) → ${id || '(created)'}`);
  return id;
}

async function teardown() {
  log('TEARDOWN — deleting only AGENT-TEST-QTE-* quotes');
  for (const spec of QUOTE_FIXTURES) {
    const number = quoteNumber(spec.key);
    const found = await api('POST', QUOTE_ENDPOINTS.search, { keyword: number, take: 5 }, { expectStatus: [200, 201, 404] });
    for (const q of (found?.results || [])) {
      await api('DELETE', QUOTE_ENDPOINTS.delete(q.id), null, { expectStatus: [200, 204] });
      log(`  deleted quote ${number}`);
    }
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const spec of QUOTE_FIXTURES) {
      const r = await api('POST', QUOTE_ENDPOINTS.search, { keyword: quoteNumber(spec.key), take: 5 }, { expectStatus: [200, 201, 404] });
      n += (r?.results || []).length;
    }
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
  const submitter = await resolveSubmitter(process.env.ORG_USER_EMAIL);
  if (!submitter.id && !DRY_RUN) {
    log(`WARN: could not resolve submitter from ORG_USER_EMAIL="${process.env.ORG_USER_EMAIL || ''}" — quotes will be created without a submitter. Ensure the org user exists, then re-run.`);
  } else if (submitter.id) {
    verbose(`quotes submitted by ${submitter.name} (${submitter.id})`);
  }

  // Real catalog products for the quoted line items — env-resilient, not hardcoded.
  const maxItems = Math.max(1, ...specs.map((s) => (loadFixture(s.fixtureFile).items || []).length));
  const products = await discoverCatalogProducts(api, maxItems);
  if (products.length) verbose(`quoted items use ${products.length} real catalog product(s): ${products.map((p) => p.sku).join(', ')}`);
  else if (!DRY_RUN) log('  WARN: no catalog products discovered — quoted items keep synthetic placeholders (seed catalog first).');

  const writeback = {};
  for (const spec of specs) {
    const id = await ensureQuote(spec, submitter, products);
    if (id && !String(id).startsWith('dry-')) writeback[spec.alias] = { id, number: quoteNumber(spec.key) };
  }
  writeEnvAliasOverride(writeback);
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Quote-state seed complete. Runtime GUIDs written to aliases.<env>.json.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
