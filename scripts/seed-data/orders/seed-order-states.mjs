#!/usr/bin/env node
/**
 * seed-order-states.mjs — Order STATE fixtures (VCST-5482).
 *
 * Provisions the non-feature-gated order states that suite 014 needs and that were DEFERRED for lack
 * of a seeder (COMPLETED_ORDER, SHIPPED_ORDER, PROCESSING_ORDER — ~16 blocked cases). Thin
 * resolve-tokens → POST over Swagger-shaped JSON fixtures: the create body lives in
 * test-data/orders/*.json, ALL non-body logic (status/shipment targets, totals normalization, the
 * @td() aliases) lives in orders-specs.mjs so the seeder, the validator, and the unit tests share one
 * source of truth. Order-creation mechanics mirror the proven seed-sales-rep.mjs (POST
 * /api/order/customerOrders, idempotent by deterministic number, delete+recreate on drift).
 *
 * Business keys (the AGENT-TEST-ORD-* number) stay in the committed fixture; the runtime order GUID
 * is written to test-data/aliases.<env>.json (never the fixture). Owner is resolved live from
 * {{USER_EMAIL}} so "my orders" shows them.
 *
 * NOTE: the exact platform status strings are confirmed LIVE on first run (quality-gates G6). If one
 * is wrong, fix it in orders-specs.mjs — the single place every consumer follows.
 *
 * Flags: --dry-run (reads only), --verbose, --teardown (delete only AGENT-TEST-ORD-* orders), --only <KEY>.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose,
  ROOT, DRY_RUN, TEARDOWN, ONLY, writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts,
} from '../../lib/seed-common.mjs';
import { ORDER_FIXTURES, orderNumber, resolveTokens, finalizeOrderBody, applyCatalogItems } from './orders-specs.mjs';

/** Load a Swagger-shaped fixture object from test-data/. */
function loadFixture(relPath) {
  return JSON.parse(readFileSync(join(ROOT, 'test-data', relPath), 'utf8'));
}

/** Resolve the storefront ApplicationUser (login) id + name by email — the id that owns "my orders". */
async function resolveOwner(email) {
  if (!email) return { id: null, name: null };
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  return u && u.id ? { id: u.id, name: u.userName || email } : { id: null, name: null };
}

async function ensureOrder(spec, owner, products) {
  const number = orderNumber(spec.key);
  const raw = loadFixture(spec.fixtureFile);
  const { obj, unresolved } = resolveTokens(raw, process.env);
  if (unresolved.length) { log(`  WARN: order ${number} — unresolved env token(s) ${unresolved.join(', ')} — skip`); return null; }
  // Point line items at real catalog products that exist on this env (reorder / PDP link resolve).
  const withItems = applyCatalogItems(obj, products);
  const body = finalizeOrderBody(spec, withItems, { customerId: owner.id, customerName: owner.name || obj.customerName });

  // Idempotency + self-heal: match by our deterministic number; rebuild if the owner/status drifted.
  const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 1 });
  const existing = (found?.results || [])[0];
  if (existing) {
    const full = await api('GET', `/api/order/customerOrders/${existing.id}`);
    const ownerOk = !owner.id || full?.customerId === owner.id;
    const statusOk = full?.status === spec.orderStatus;
    if (ownerOk && statusOk) {
      verbose(`order ${number} exists (owner + status ok) → ${existing.id}`);
      return existing.id;
    }
    await api('DELETE', `/api/order/customerOrders?ids=${existing.id}`, null, { expectStatus: [200, 204] });
    log(`  order ${number} rebuilding (ownerOk=${ownerOk}, statusOk=${statusOk})`);
  }

  const created = await api('POST', '/api/order/customerOrders', body);
  const id = created?.id || (DRY_RUN ? `dry-${spec.key}` : null);
  log(`  order ${number} (${spec.orderStatus}, shipment ${spec.shipmentStatus}) → ${id || '(created)'}`);
  return id;
}

async function teardown() {
  log('TEARDOWN — deleting only AGENT-TEST-ORD-* orders');
  for (const spec of ORDER_FIXTURES) {
    const number = orderNumber(spec.key);
    const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
    for (const o of (found?.results || [])) {
      await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
      log(`  deleted order ${number}`);
    }
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const spec of ORDER_FIXTURES) {
      const r = await api('POST', '/api/order/customerOrders/search', { keyword: orderNumber(spec.key), take: 5 });
      n += (r?.results || []).length;
    }
    return n;
  });
  if (residue) log(`  ⚠ ${residue} AGENT-TEST-ORD-* order(s) still present after teardown`);
  else log('Teardown complete — zero residue.');
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  const specs = ORDER_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);
  const owner = await resolveOwner(process.env.USER_EMAIL);
  if (!owner.id && !DRY_RUN) {
    log(`WARN: could not resolve owner from USER_EMAIL="${process.env.USER_EMAIL || ''}" — orders will be created without an owner (won't show in "my orders"). Ensure the account exists, then re-run.`);
  } else if (owner.id) {
    verbose(`orders owned by ${owner.name} (${owner.id})`);
  }

  // Real catalog products for the line items (max 2 per order fixture) — env-resilient, not hardcoded.
  const maxItems = Math.max(1, ...specs.map((s) => (loadFixture(s.fixtureFile).items || []).length));
  const products = await discoverCatalogProducts(api, maxItems);
  if (products.length) verbose(`line items use ${products.length} real catalog product(s): ${products.map((p) => p.sku).join(', ')}`);
  else if (!DRY_RUN) log('  WARN: no catalog products discovered — line items keep synthetic placeholders (seed catalog first for reorder/PDP-link cases).');

  const writeback = {};
  for (const spec of specs) {
    const id = await ensureOrder(spec, owner, products);
    if (id && !String(id).startsWith('dry-')) writeback[spec.alias] = { id, number: orderNumber(spec.key) };
  }
  writeEnvAliasOverride(writeback);
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Order-state seed complete. Runtime GUIDs written to aliases.<env>.json.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
