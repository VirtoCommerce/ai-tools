#!/usr/bin/env node
/**
 * seed-return-orders.mjs — returnable-quantity order fixtures for VCST-5628 (buyer's own returns, step 1).
 *
 * Seven customer orders belonging to ONE B2B buyer, each isolating one input of the returnable-quantity
 * computation. The spec table, the expectations and every drift guard live in orders-specs.mjs
 * (RETURN_ORDER_FIXTURES); this file is the thin resolve-tokens -> POST -> PUT that provisions them.
 *
 * WHY A SEPARATE SEEDER FROM seed-order-states.mjs: that seeder sets orderStatus/shipmentStatus and
 * never sets a shipment DeliveryDate at all (its shipments carry `items: []` and no date). The whole
 * feature keys on DeliveryDate — with no DeliveryDate nothing on the order is returnable, and there is
 * no fallback to the order date — so these fixtures are simply not producible by it.
 *
 * TWO PHASES, both forced by platform behaviour that fails SILENTLY (confirmed live on
 * vcptcore-qa1 2026-09-22):
 *   1. POST /api/order/customerOrders — the platform ASSIGNS line item ids and IGNORES client-supplied
 *      ones, so a create body whose shipment items reference our own ids 500s on a NOT NULL
 *      OrderShipmentItem.LineItemId. Shipment items therefore cannot be linked at create.
 *   2. PUT /api/order/customerOrders — re-PUT the created order with shipments[].items[] carrying the
 *      ASSIGNED lineItemId AND the inline `lineItem` object. With `lineItemId` alone the PUT returns
 *      200 and the shipment item is silently dropped. The same PUT carries the delivery dates and the
 *      line cancellation.
 *
 * NO LITERAL DATES ANYWHERE. Each shipment's date is derived at seed time from the spec's
 * `offsetDays` relative to now, and the resolved instants are recorded in aliases.<env>.json so the
 * validator can tell a fresh fixture from one that has aged out of the return window.
 *
 * SAFETY / CONVENTIONS: assertSafeTarget() prod guard, AGENT-TEST-ORD-RET-* naming (distinct from
 * seed-order-states' AGENT-TEST-ORD-* so neither teardown can sweep the other's orders), idempotent
 * find-or-create with self-heal, runtime GUIDs to aliases.<env>.json only.
 *
 * Flags: --dry-run · --verbose · --teardown · --only <KEY|ALIAS>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose,
  ROOT, BACK_URL, STORE_ID, DRY_RUN, TEARDOWN, ONLY, writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts,
} from '../../lib/seed-common.mjs';
import {
  RETURN_ORDER_FIXTURES, RETURN_LINE_X_ALIAS, RETURN_WINDOW_DAYS_ASSUMED,
  RETURN_ALLOWED_STATUS, RETURN_DISALLOWED_STATUS,
  LINE_ROLE_X, LINE_ROLE_CANCELLED, LINE_ROLE_Y, deliveredTotalFor,
  returnOrderNumber, resolveTokens, applyReturnCatalogItems, finalizeReturnOrderBody,
  buildReturnPhase2Body, diagnoseSeededOrder, deliveryDateFor,
} from './orders-specs.mjs';

const loadFixture = (rel) => JSON.parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'));

/** Storefront password grant for the buyer — this IS the sign-in verification, not a proxy for it. */
async function buyerToken(email, password) {
  if (!email || !password) return { ok: false, reason: 'email or password unresolved from the layered env' };
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password, scope: 'offline_access', storeId: STORE_ID }),
  });
  if (!res.ok) return { ok: false, reason: `${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}` };
  return { ok: true, token: (await res.json()).access_token };
}

async function gql(query, variables, token) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

/**
 * Resolve the buyer every fixture belongs to, and PROVE it can sign in to the storefront. An order the
 * buyer under test cannot see is worthless, so a sign-in failure aborts the seed rather than producing
 * seven unusable orders. Prefers USER_EMAIL, falls back to ORG_USER_EMAIL.
 */
async function resolveBuyer() {
  const candidates = [
    { key: 'USER_EMAIL', email: process.env.USER_EMAIL, password: process.env.USER_PASSWORD },
    { key: 'ORG_USER_EMAIL', email: process.env.ORG_USER_EMAIL, password: process.env.ORG_USER_PASSWORD },
  ];
  for (const c of candidates) {
    if (!c.email) { verbose(`${c.key} unset — skip`); continue; }
    const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(c.email)}`, null, { expectStatus: [200, 404] });
    if (!u?.id) { log(`  ${c.key}=${c.email} has no platform account — skip`); continue; }
    const t = await buyerToken(c.email, c.password);
    if (!t.ok) { log(`  ${c.key}=${c.email} exists but CANNOT sign in to ${STORE_ID} (${t.reason}) — skip`); continue; }
    const me = await gql('{ me { contact { id name organizationId organizations { items { id name } } } } }', {}, t.token);
    const contact = me?.data?.me?.contact;
    log(`  Buyer: ${c.email} (${c.key}) — storefront sign-in VERIFIED on ${STORE_ID}; org "${contact?.organizations?.items?.[0]?.name || '(none)'}"`);
    return {
      key: c.key, email: c.email, id: u.id, name: u.userName || c.email, token: t.token,
      organizationId: contact?.organizationId || null,
      organizationName: contact?.organizations?.items?.[0]?.name || null,
    };
  }
  return null;
}

/**
 * Read the LIVE return policy and refuse to seed a fixture set designed against a different one.
 * Every offset in the spec table was chosen to sit a known distance from THIS window; if the store's
 * window moved, "40 days ago" may now be inside it and fixture B would be a vacuous pass. The store's
 * policy is the source of truth, the spec's number is an assumption — so disagreement is an abort,
 * never a silent seed (.claude/rules/test-data.md GOLDEN RULE).
 */
async function assertPolicyMatchesDesign(token) {
  const r = await gql(`query($s:String!){ returnPolicy(storeId:$s){ isEnabled windowDays allowedOrderStatuses } }`, { s: STORE_ID }, token);
  const p = r?.data?.returnPolicy;
  if (!p) throw new Error(`returnPolicy(storeId:"${STORE_ID}") returned nothing (${JSON.stringify(r?.errors || r).slice(0, 240)}) — is the Return module installed on this env?`);
  log(`  Live returnPolicy: isEnabled=${p.isEnabled} windowDays=${p.windowDays} allowedOrderStatuses=${JSON.stringify(p.allowedOrderStatuses)}`);
  const bad = [];
  if (!p.isEnabled) bad.push('returns are DISABLED on this store — every fixture would report RETURNS_DISABLED and none of the seven questions would be decidable');
  if (p.windowDays !== RETURN_WINDOW_DAYS_ASSUMED) bad.push(`windowDays is ${p.windowDays}, but the fixture offsets were designed against ${RETURN_WINDOW_DAYS_ASSUMED} — re-derive the offsets in orders-specs.mjs before seeding`);
  if (!(p.allowedOrderStatuses || []).includes(RETURN_ALLOWED_STATUS)) bad.push(`"${RETURN_ALLOWED_STATUS}" is not in allowedOrderStatuses — fixtures A/A2/B/C/E/F would all be ineligible for the wrong reason`);
  if ((p.allowedOrderStatuses || []).includes(RETURN_DISALLOWED_STATUS)) bad.push(`"${RETURN_DISALLOWED_STATUS}" IS in allowedOrderStatuses — fixture D would no longer test ORDER_STATUS_NOT_ALLOWED`);
  if (bad.length) throw new Error(`live return policy disagrees with the fixture design:\n    - ${bad.join('\n    - ')}`);
  return p;
}

/** Find the seeded order by its deterministic number (full body, not the search projection). */
async function findOrder(number) {
  const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
  const hit = (found?.results || []).find((o) => o.number === number) || (found?.results || [])[0];
  if (!hit?.id) return null;
  return api('GET', `/api/order/customerOrders/${hit.id}`);
}

async function ensureOrder(spec, buyer, productsByRole, rolesBySku, windowDays, now) {
  const number = returnOrderNumber(spec.key);
  const existing = await findOrder(number);
  if (existing) {
    const d = diagnoseSeededOrder(spec, existing, rolesBySku, { windowDays, now, ownerId: buyer.id });
    if (d.ok) { log(`  ${number} exists and still matches the spec → ${existing.id}`); return { id: existing.id, order: existing, rebuilt: false }; }
    log(`  ${number} rebuilding — ${d.problems.length} mismatch(es): ${d.problems[0]}`);
    await api('DELETE', `/api/order/customerOrders?ids=${existing.id}`, null, { expectStatus: [200, 204] });
  }

  // ---- phase 1: create (no shipment items — the platform assigns the line item ids) ----
  const raw = loadFixture(spec.fixtureFile);
  const { obj, unresolved } = resolveTokens(raw, process.env);
  if (unresolved.length) throw new Error(`${number}: unresolved env token(s) ${unresolved.join(', ')} — refusing to POST a literal "{{VAR}}"`);
  const withProducts = applyReturnCatalogItems(obj, productsByRole);
  const body = finalizeReturnOrderBody(spec, withProducts, {
    customerId: buyer.id, customerName: buyer.name,
    organizationId: buyer.organizationId, organizationName: buyer.organizationName,
  }, now);
  const created = await api('POST', '/api/order/customerOrders', body);
  if (DRY_RUN) { log(`  [DRY] would create ${number} (${spec.orderStatus}, ${spec.shipments.length} shipment(s))`); return { id: null, order: null, rebuilt: true }; }

  // ---- phase 2: link shipment items to the assigned line ids, stamp dates, cancel the dead line ----
  const full = await api('GET', `/api/order/customerOrders/${created.id}`);
  const phase2 = buildReturnPhase2Body(spec, full, rolesBySku, now);
  await api('PUT', '/api/order/customerOrders', phase2, { expectStatus: [200, 204] });

  const after = await api('GET', `/api/order/customerOrders/${created.id}`);
  const d = diagnoseSeededOrder(spec, after, rolesBySku, { windowDays, now, ownerId: buyer.id });
  if (!d.ok) {
    // A 2xx is not proof — this platform silently no-ops. Report exactly what did not land.
    log(`  ⚠ ${number} POSTed but did NOT fully take:`);
    d.problems.forEach((p) => log(`      - ${p}`));
  }
  const dates = (after.shipments || []).map((s) => `${String(s.number).split('-').pop()}=${s.deliveryDate ? s.deliveryDate.slice(0, 10) : 'none'}`).join(' ');
  log(`  ${number} (${spec.orderStatus}) → ${created.id} | shipments ${dates} | ${d.ok ? 'verified' : 'MISMATCH'}`);
  return { id: created.id, order: after, rebuilt: true, problems: d.problems };
}

async function teardown() {
  // --only narrows the sweep to ONE fixture. Without it a teardown of a single newly added order
  // would take the other six with it, and every case built on them would start reporting "not seeded".
  const specs = RETURN_ORDER_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);
  if (ONLY && !specs.length) throw new Error(`--only ${ONLY} matches no returns fixture`);
  log(`TEARDOWN — deleting only ${specs.map((s) => returnOrderNumber(s.key)).join(', ')}`);
  for (const spec of specs) {
    const number = returnOrderNumber(spec.key);
    const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
    for (const o of (found?.results || [])) {
      if (o.number !== number) continue;
      await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
      log(`  deleted ${number}`);
    }
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const spec of specs) {
      const r = await api('POST', '/api/order/customerOrders/search', { keyword: returnOrderNumber(spec.key), take: 5 });
      n += (r?.results || []).filter((o) => o.number === returnOrderNumber(spec.key)).length;
    }
    return n;
  });
  if (residue) log(`  ⚠ ${residue} AGENT-TEST-ORD-RET-* order(s) still present after teardown`);
  else log('Teardown complete — zero residue.');
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  const now = new Date();
  const specs = RETURN_ORDER_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);

  const buyer = await resolveBuyer();
  if (!buyer) {
    throw new Error('no buyer could be resolved AND signed in on this store. Provision one with `npm run seed:b2b` '
      + 'and set USER_EMAIL / USER_PASSWORD (per-env: *_<TEST_ENV>) — orders belonging to a buyer who cannot sign in are worthless.');
  }
  const policy = await assertPolicyMatchesDesign(buyer.token);

  // THREE distinct real products: lineX (the line under test), F's cancelled line, and G's SECOND
  // eligible line. Distinctness is load-bearing on both counts — same product as lineX and "the
  // cancelled line is excluded" (F) or "the rule is PER LINE" (G) becomes undecidable — and mechanical:
  // rolesBySku maps a sku back to exactly ONE role, so two roles sharing a product would collide.
  const needed = 3;
  const products = await discoverCatalogProducts(api, needed);
  if (products.length < needed && !DRY_RUN) throw new Error(`catalog search returned ${products.length} product(s); the fixtures need ${needed} distinct ones. Seed the catalog first.`);
  const productsByRole = { [LINE_ROLE_X]: products[0], [LINE_ROLE_CANCELLED]: products[1], [LINE_ROLE_Y]: products[2] };
  const rolesBySku = {};
  for (const [role, p] of Object.entries(productsByRole)) if (p?.sku) rolesBySku[p.sku] = role;
  if (Object.keys(rolesBySku).length !== products.filter(Boolean).length) {
    throw new Error(`catalog discovery returned duplicate SKUs (${products.map((p) => p?.sku).join(', ')}) — two roles would collapse onto one product`);
  }
  if (products.length) log(`  lineX = ${products[0].sku} "${products[0].name}" | cancelled line = ${products[1]?.sku} | lineY (2nd eligible) = ${products[2]?.sku}`);

  const writeback = {};
  const results = [];
  for (const spec of specs) {
    const r = await ensureOrder(spec, buyer, productsByRole, rolesBySku, policy.windowDays, now);
    results.push({ spec, ...r });
    if (!r.id) continue;
    const lineX = (r.order?.items || []).find((i) => rolesBySku[i.sku] === LINE_ROLE_X);
    const dead = (r.order?.items || []).find((i) => rolesBySku[i.sku] === LINE_ROLE_CANCELLED);
    const lineY = (r.order?.items || []).find((i) => rolesBySku[i.sku] === LINE_ROLE_Y);
    writeback[spec.alias] = {
      id: r.id,
      number: returnOrderNumber(spec.key),
      lineXItemId: lineX?.id || null,
      ...(dead ? { cancelledLineItemId: dead.id } : {}),
      // A fixture with a SECOND eligible line also publishes its two lines under neutral A/B names, so
      // a case can address each line separately without knowing the internal role vocabulary. lineA IS
      // lineX — one seeded value under two field names, emitted here in one place, never hand-edited.
      ...(spec.lineY ? {
        lineAItemId: lineX?.id || null,
        lineASku: lineX?.sku || null,
        lineAOrderedQuantity: spec.lineX.ordered,
        lineADeliveredQuantity: deliveredTotalFor(spec, LINE_ROLE_X),
        lineBItemId: lineY?.id || null,
        lineBSku: lineY?.sku || null,
        lineBOrderedQuantity: spec.lineY.ordered,
        lineBDeliveredQuantity: deliveredTotalFor(spec, LINE_ROLE_Y),
      } : {}),
      // What was ACTUALLY seeded, so the validator can measure real-time drift instead of guessing.
      // Both fields are read off the order that now EXISTS, never recomputed from this run's `now`:
      // an idempotent re-run REUSES an order seeded days ago, and stamping today's values onto it would
      // reset its apparent age to zero on every re-run — hiding precisely the ageing that
      // validate-orders-data.mjs [6] exists to catch, and doing so silently.
      ...(r.rebuilt ? { seededAt: now.toISOString() } : {}),
      deliveryDates: Object.fromEntries((spec.shipments || []).map((sp) => {
        const live = (r.order?.shipments || []).find((z) => String(z.number || '').endsWith(`-${sp.key}`));
        return [sp.key, live?.deliveryDate ?? deliveryDateFor(sp, now)];
      })),
      windowDaysAtSeed: policy.windowDays,
    };
  }
  if (Object.keys(writeback).length) {
    writeback[RETURN_LINE_X_ALIAS] = {
      productId: products[0]?.id || null,
      sku: products[0]?.sku || null,
      name: products[0]?.name || null,
      cancelledProductId: products[1]?.id || null,
      cancelledSku: products[1]?.sku || null,
      lineYProductId: products[2]?.id || null,
      lineYSku: products[2]?.sku || null,
      seededAt: now.toISOString(),
    };
  }
  writeEnvAliasOverride(writeback);

  const bad = results.filter((r) => r.problems?.length);
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : `Returns order seed complete — ${results.filter((r) => r.id).length}/${specs.length} provisioned. Runtime ids written to aliases.<env>.json.`);
  if (bad.length) {
    log(`⚠ ${bad.length} fixture(s) did not fully take — see the mismatches above. A fixture that was POSTed but did not land is worse than none.`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
