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
 * /api/order/customerOrders, idempotent by EXACT deterministic number; on drift the replacement is
 * created FIRST and the old order deleted after — judgeExistingOrder in orders-specs.mjs defines drift).
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
  ROOT, DRY_RUN, TEARDOWN, ONLY, writeEnvAliasOverride, verifyRemoved,
  findOrdersByExactNumber, readProductsById, discoverLineCandidates,
} from '../../lib/seed-common.mjs';
import {
  ORDER_FIXTURES, orderNumber, resolveTokens, finalizeOrderBody, applyCatalogItems, fitsLineQuantity, judgeExistingOrder,
  duplicateLineProducts,
} from './orders-specs.mjs';

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

/** Line-item candidates for a NEW order — discovered lazily (only when an order is actually created
 * or rebuilt), once per run. See seed-common.mjs discoverLineCandidates. */
let _candidates = null;
async function lineCandidates(maxItems) {
  if (!_candidates) _candidates = await discoverLineCandidates(api, maxItems * 5);
  return _candidates;
}

async function ensureOrder(spec, owner, maxItems) {
  const number = orderNumber(spec.key);
  const raw = loadFixture(spec.fixtureFile);
  const { obj, unresolved } = resolveTokens(raw, process.env);
  if (unresolved.length) { log(`  WARN: order ${number} — unresolved env token(s) ${unresolved.join(', ')} — skip`); return null; }

  // Idempotency: EXACT number match (the search keyword is a prefix match — kb KB-F7E4DB8E), newest
  // first. Older exact-number hits are residue of a create-then-delete whose delete failed.
  const hits = (await findOrdersByExactNumber(api, number))
    .sort((a, b) => String(b.createdDate || '').localeCompare(String(a.createdDate || '')));
  const [existing, ...dupes] = hits;

  if (existing) {
    // Judge the EXISTING order (owner, status, quantity multiset, products still exist and admit their
    // quantity, shipment address) — never against what this run would pick from the catalog today.
    const full = await api('GET', `/api/order/customerOrders/${existing.id}`);
    const productsById = await readProductsById(api, (full?.items || []).map((i) => i.productId));
    const { rebuild, reasons } = judgeExistingOrder(spec, obj, full, productsById, { ownerId: owner.id });
    if (!rebuild) {
      log(`  order ${number} exists and is a valid instance of the fixture → ${existing.id} (kept)`);
      await removeSuperseded(number, dupes);
      writeEnvAliasOverride({ [spec.alias]: { id: existing.id, number } });
      return existing.id;
    }
    log(`  order ${number} ${DRY_RUN ? 'WOULD BE REBUILT' : 'rebuilding'}: ${reasons.join('; ')}`);
  }

  // Point line items at real catalog products that exist on this env and admit each line's quantity.
  const products = await lineCandidates(maxItems);
  if (!products.length && !DRY_RUN) log('  WARN: no catalog products discovered — line items keep synthetic placeholders (seed catalog first for reorder/PDP-link cases).');
  const withItems = applyCatalogItems(obj, products);
  if (products.length) {
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const it of withItems.items || []) {
      if (!fitsLineQuantity(byId.get(it.productId), Number(it.quantity))) log(`  WARN: order ${number} line ${it.sku} qty ${it.quantity} — no discovered product admits it (min/max/stock); reorder cases on it will fail`);
    }
    // One product on two lines is not a WARN: a reorder merges them, so the cases on this order cannot
    // decide anything. Refuse before the create — the existing order (if any) stays in place.
    const dup = duplicateLineProducts(withItems.items);
    if (dup.length) throw new Error(`order ${number}: no ${(withItems.items || []).length} DISTINCT discovered products admit the line quantities (${dup.join(', ')} would repeat) — seed the catalog, then re-run`);
  }
  const body = finalizeOrderBody(spec, withItems, { customerId: owner.id, customerName: owner.name || obj.customerName });

  if (DRY_RUN) {
    log(`  [DRY] order ${number} would be ${existing ? 'created, then the old one deleted' : 'created'}`);
    return existing?.id || null;
  }

  // CREATE FIRST, then delete the old one: a failed create leaves the old (still referenced) order in
  // place, never an overlay pointing at a deleted id.
  const created = await api('POST', '/api/order/customerOrders', body);
  if (!created?.id) throw new Error(`order ${number}: create returned no id — the existing order (if any) was left in place`);
  writeEnvAliasOverride({ [spec.alias]: { id: created.id, number } });
  log(`  order ${number} (${spec.orderStatus}, shipment ${spec.shipmentStatus}) → ${created.id}`);
  await removeSuperseded(number, [existing, ...dupes].filter(Boolean));
  return created.id;
}

/** Delete superseded exact-number orders; a failure is reported, and the next run removes it as a dupe. */
async function removeSuperseded(number, orders) {
  for (const o of orders) {
    if (o?.number !== number) continue; // belt-and-braces: never delete another fixture's order
    if (DRY_RUN) { log(`  [DRY] would delete superseded ${number} ${o.id}`); continue; }
    try {
      await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
      log(`  deleted superseded ${number} ${o.id}`);
    } catch (e) {
      log(`  WARN: could not delete superseded ${number} ${o.id} (${String(e.message).slice(0, 120)}) — the overlay names the new order; the next run removes this one`);
    }
  }
}

async function teardown() {
  log('TEARDOWN — deleting only AGENT-TEST-ORD-* orders (exact number match)');
  for (const spec of ORDER_FIXTURES) {
    const number = orderNumber(spec.key);
    for (const o of await findOrdersByExactNumber(api, number)) {
      await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
      log(`  deleted order ${number} ${o.id}`);
    }
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const spec of ORDER_FIXTURES) n += (await findOrdersByExactNumber(api, orderNumber(spec.key))).length;
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

  // Line items are discovered lazily, only for an order that is actually created or rebuilt; each
  // order writes its own alias as soon as it is settled (a later throw cannot orphan an earlier one).
  const maxItems = Math.max(1, ...specs.map((s) => (loadFixture(s.fixtureFile).items || []).length));
  for (const spec of specs) await ensureOrder(spec, owner, maxItems);
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Order-state seed complete. Runtime GUIDs written to aliases.<env>.json.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
