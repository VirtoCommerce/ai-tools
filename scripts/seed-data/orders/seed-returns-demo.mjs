#!/usr/bin/env node
/**
 * seed-returns-demo.mjs — the presentation-grade RETURNS dataset (returns-demo-specs.mjs).
 *
 * Eight delivered orders and eight returns across the sales-rep demo's four customer organizations,
 * one return in every status a buyer or an agent can see (Draft, Requested ×2, Approved,
 * PartiallyApproved, Rejected, Cancelled, Completed) plus two freshly delivered orders with no return,
 * kept for a live Request-return walkthrough. No `AGENT-TEST` string on any rendered surface.
 *
 * THROUGH THE MECHANISM, as seed-return-decisions.mjs does: each return is created, evidenced and
 * submitted with the BUYER'S own storefront token (createReturn -> File Experience API upload ->
 * updateReturn -> submitReturn), cancelled with cancelReturn, and decided by the agent endpoint
 * `POST /api/return/{id}/authorize`. A status written straight through `PUT /api/return` would skip
 * the notifications and the per-line approved quantities the pages render.
 *
 * DEPENDS ON THE SALES-REP DEMO. Organizations and buyer accounts are read from its ledger
 * (`_demo_sales_rep_ledger`); nothing here creates a member. Seed that one first
 * (`npm run seed:demo` does both, in order).
 *
 * TEARDOWN = ledger + marker sweep: every order whose outerId starts `DEMO-RET:` among the demo
 * buyers' orders, every return on those orders (including one a presenter created live), the evidence
 * files (best effort — the File Experience API has no admin delete), then the orders.
 *
 * Flags: --dry-run · --verbose · --teardown · --only <DRO-…|DRET-…> · --fresh (rebuild every order)
 * Usage: TEST_ENV=virtostart npm run seed:returns-demo   ·   … npm run seed:returns-demo:teardown
 */

import "../../lib/sync-stdio.mjs";
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, BACK_URL, STORE_ID, DRY_RUN, TEARDOWN, ONLY,
  assertSafeTarget, auth, api, log, verbose, verifyRemoved, writeEnvAliasOverride,
  discoverCatalogProducts, makeProductPng,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import {
  DEMO_ORGS, DEMO_RET_ORDERS, DEMO_RET_LEDGER_KEY, SR_DEMO_LEDGER_KEY, RETURNS_PROFILE, OUTCOME,
  DEMO_WINDOW_DAYS_ASSUMED, DEMO_RET_REQUIRED_ORDER_STATUS,
  demoRetMarker, isDemoRetMarker, demoRetOrderNumber, retOrderByKey, returnsInSubmitOrder,
  retProductNeedByOrg, isDemoSafeProduct, buildDemoRetOrderBody, buildDemoRetDeliveryBody, orderIsDelivered,
  buildDemoReturnItems, buildDemoAuthorizeBody, authorizedStatusFor, isDecided, isPostDecision, isAgentLogged, demoReturnProblems,
} from './returns-demo-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const FRESH = process.argv.includes('--fresh');
const ATTACHMENT_SCOPE = 'return-attachments';
const CULTURE = 'en-US';

// ---- overlay: our ledger + the sales-rep demo's -------------------------------------

const overlay = () => {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
};
const readLedger = () => overlay()[DEMO_RET_LEDGER_KEY] || { profile: RETURNS_PROFILE.demo, env: TEST_ENV, entities: [] };
const PRIOR = readLedger();
const priorId = (type, key) => (PRIOR.entities || []).find((e) => e.type === type && e.key === key)?.id || null;

function writeLedger(entities) {
  writeEnvAliasOverride({
    [DEMO_RET_LEDGER_KEY]: {
      profile: RETURNS_PROFILE.demo, env: TEST_ENV, marker: 'DEMO-RET', generated: new Date().toISOString(), entities,
    },
  });
}

/** Org ids + buyer logins from the sales-rep demo ledger. Absent ⇒ that demo is not seeded here. */
function salesRepDemoBase() {
  const l = overlay()[SR_DEMO_LEDGER_KEY];
  const orgs = {}; const buyers = {};
  for (const e of l?.entities || []) {
    if (e.type === 'organization') orgs[e.key] = { id: e.id, name: e.name };
    if (e.type === 'account') buyers[e.key] = { userId: e.id, email: e.email, orgId: e.orgId };
  }
  return { present: !!l, orgs, buyers };
}

// ---- storefront identity -------------------------------------------------------------

async function tokenRequest(body) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
  });
  return res.ok ? res.json().catch(() => null) : null;
}

/** A buyer token switched into their organization, as the storefront's org switcher does. Never written to disk. */
async function buyerToken(email, password, organizationId) {
  const t = await tokenRequest({ grant_type: 'password', username: email, password, scope: 'offline_access', storeId: STORE_ID });
  if (!t?.access_token) return null;
  if (!t.refresh_token || !organizationId) return t.access_token;
  const s = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token, organization_id: organizationId, scope: 'offline_access' });
  return s?.access_token || t.access_token;
}

async function gql(token, query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json().catch(() => ({ errors: [{ message: `HTTP ${res.status}` }] }));
}

async function mutate(token, label, query, variables) {
  if (DRY_RUN) { log(`  [DRY] ${label}`); return null; }
  const r = await gql(token, query, variables);
  if (r.errors?.length) throw new Error(`${label}: ${JSON.stringify(r.errors.map((e) => e.message)).slice(0, 400)}`);
  return r.data;
}

const RETURN_FIELDS = 'id number status';

// ---- products --------------------------------------------------------------------------

/** One distinct, on-family, fixture-free product per order line, claimed globally across orgs. */
async function discoverPools(need = retProductNeedByOrg()) {
  if (DRY_RUN) return {};
  const claimed = new Set(); const pools = {};
  for (const org of DEMO_ORGS) {
    const want = need[org.key] || 0;
    if (!want) continue;
    const found = await discoverCatalogProducts(api, Math.min(want * 8 + 40, 450), { searchPhrase: org.productSearch, withImages: true }).catch(() => []);
    const seen = new Set(); const usable = [];
    for (const p of found) {
      if (!isDemoSafeProduct(p) || claimed.has(p.id)) continue;
      const name = String(p.name || '').trim();
      if (org.productMatch && !org.productMatch.test(name)) continue;
      if (org.productExclude && org.productExclude.test(name)) continue;
      const k = name.toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k); usable.push(p);
      if (usable.length >= want) break;
    }
    usable.forEach((p) => claimed.add(p.id));
    pools[org.key] = usable;
    if (usable.length < want) log(`  WARN ${org.name}: only ${usable.length}/${want} product(s) matched "${org.productSearch}"`);
  }
  return pools;
}

// ---- orders ------------------------------------------------------------------------------

async function findOrderByNumber(number) {
  const r = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
  const hit = (r?.results || []).find((o) => o.number === number);
  return hit?.id ? api('GET', `/api/order/customerOrders/${hit.id}`) : null;
}

async function returnsOnOrder(orderId) {
  if (!orderId || String(orderId).startsWith('dry-')) return [];
  const r = await api('POST', '/api/return/search', { orderId, take: 100 });
  const out = [];
  for (const x of r?.results || []) out.push(await api('GET', `/api/return/${x.id}`));
  return out;
}

async function deleteReturns(returns) {
  if (!returns.length) return;
  await api('DELETE', `/api/return?${returns.map((r) => `ids=${encodeURIComponent(r.id)}`).join('&')}`, null, { expectStatus: [200, 204] });
}

/**
 * Find-or-create one delivered order. Rebuilt (with every return on it) when it is not ours, not
 * delivered as declared, has a line count that drifted, or --fresh. Lines are mapped back to their
 * declared position by SKU, so `lineIds[i]` is the order line id of the spec's line i+1.
 */
async function ensureOrder(spec, base, pools, cursor, now) {
  const number = demoRetOrderNumber(spec.key);
  const buyer = base.buyers[spec.buyer];
  const org = base.orgs[spec.org];
  let order = DRY_RUN ? null : await findOrderByNumber(number);
  if (order && !isDemoRetMarker(order.outerId)) {
    throw new Error(`${number} exists but is not a returns-demo order (outerId "${order.outerId ?? ''}") — refusing to touch it`);
  }
  if (order) {
    const healthy = orderIsDelivered(spec, order) && order.customerId === buyer.userId;
    if (healthy && !FRESH) {
      verbose(`order ${number} exists and is delivered → reuse`);
      return { order, lineIds: lineIdsFor(spec, order, PRIOR_SKUS[spec.key]), rebuilt: false };
    }
    log(`  order ${number} rebuilding — ${FRESH ? '--fresh' : 'not delivered as declared'}`);
    await deleteReturns(await returnsOnOrder(order.id));
    await api('DELETE', `/api/order/customerOrders?ids=${order.id}`, null, { expectStatus: [200, 204] });
  }
  const pool = pools[spec.org] || [];
  const start = cursor[spec.org] || 0;
  const products = pool.slice(start, start + spec.lines.length);
  cursor[spec.org] = start + spec.lines.length;
  if (!DRY_RUN && products.length < spec.lines.length) throw new Error(`${number}: not enough ${spec.org} products for ${spec.lines.length} line(s)`);
  if (DRY_RUN) {
    log(`  [DRY] would create ${number} — ${base.orgs[spec.org]?.name ?? spec.org}, ${spec.lines.length} line(s), delivered ${spec.deliveredDaysAgo}d ago`);
    return { order: { id: `dry-${spec.key}`, number, items: [] }, lineIds: spec.lines.map((_, i) => `dry-line-${i + 1}`), rebuilt: true };
  }
  const body = buildDemoRetOrderBody(spec, { storeId: STORE_ID, orgId: org.id, customerId: buyer.userId, products });
  const created = await api('POST', '/api/order/customerOrders', body);
  const full = await api('GET', `/api/order/customerOrders/${created.id}`);
  const skus = products.map((p) => p.sku);
  await api('PUT', '/api/order/customerOrders', buildDemoRetDeliveryBody(spec, full, skus, now), { expectStatus: [200, 204] });
  order = await api('GET', `/api/order/customerOrders/${created.id}`);
  if (!orderIsDelivered(spec, order)) throw new Error(`${number} POSTed but the delivery did not take (status ${order.status}, shipment items ${order.shipments?.[0]?.items?.length ?? 0})`);
  log(`order ${number} — ${org.name}, ${spec.lines.length} line(s), delivered ${spec.deliveredDaysAgo}d ago, buyer ${buyer.email}`);
  return { order, lineIds: lineIdsFor(spec, order, skus), rebuilt: true, skus };
}

/** SKUs recorded per order on the previous run — the only way to know a reused order's line ORDER. */
const PRIOR_SKUS = Object.fromEntries((PRIOR.entities || []).filter((e) => e.type === 'order').map((e) => [e.key, e.skus || []]));

function lineIdsFor(spec, order, skus = []) {
  const items = order.items || [];
  if (skus.length === spec.lines.length) return skus.map((sku) => items.find((li) => li.sku === sku)?.id || null);
  // No recorded order: fall back to declared quantities, which are distinct within every demo order.
  return spec.lines.map((l) => items.find((li) => li.quantity === l.qty)?.id || null);
}

// ---- returns -----------------------------------------------------------------------------

async function uploadEvidence(token, fileName, seed) {
  if (DRY_RUN) return `dry://${fileName}`;
  const form = new FormData();
  form.append('file', new Blob([makeProductPng(seed, 1)], { type: 'image/png' }), fileName);
  const res = await fetch(`${BACK_URL}/api/files/${ATTACHMENT_SCOPE}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const j = await res.json().catch(() => null);
  const info = Array.isArray(j) ? j[0] : j;
  if (!res.ok || !info?.succeeded) throw new Error(`upload ${fileName} → ${ATTACHMENT_SCOPE}: ${res.status} ${JSON.stringify(info).slice(0, 200)}`);
  return info.url;
}

/** Field name of the cancel reason on CancelReturnCommandType, read from the live schema, never assumed. */
async function cancelReasonField(token) {
  const r = await gql(token, '{ __type(name:"CancelReturnCommandType"){ inputFields { name } } }');
  const names = (r?.data?.__type?.inputFields || []).map((f) => f.name);
  return names.find((n) => /reason/i.test(n)) || null;
}

/** Is a live return already exactly what the spec ends in — status, decisions AND the copy a viewer reads? */
function returnMatches(ret, live) {
  if (!live || live.status !== ret.outcome) return false;
  if (live.customerReference !== ret.reference || live.customerComment !== ret.comment) return false;
  if ((live.rejectReason || null) !== (isDecided(ret.outcome) && authorizedStatusFor(ret) !== OUTCOME.APPROVED ? ret.declineReason || null : null)) return false;
  if (!isDecided(ret.outcome)) return true;
  const byQty = (live.lineItems || []).map((li) => li.approvedQuantity).sort().join(',');
  return byQty === ret.lines.map((l) => l.approve).sort().join(',');
}

/**
 * Carry a decided return to a post-decision status (Processing, Completed) through the same admin
 * edit an agent makes, taking only the steps the return's own available-statuses offer.
 */
async function walkTo(id, target) {
  for (let hop = 0; hop < 4; hop += 1) {
    const cur = await api('GET', `/api/return/${id}`);
    if (cur.status === target) return cur.status;
    const next = await api('GET', `/api/return/${id}/available-statuses`, null, { expectStatus: [200] });
    const opts = (Array.isArray(next) ? next : next?.statuses || []).map((s) => (typeof s === 'string' ? s : s.name || s.value));
    const step = opts.includes(target) ? target : opts.includes(OUTCOME.PROCESSING) ? OUTCOME.PROCESSING : null;
    if (!step) throw new Error(`return ${cur.number} (${cur.status}) offers ${opts.join(', ') || 'nothing'} — cannot reach ${target}`);
    await api('PUT', '/api/return', { ...cur, status: step }, { expectStatus: [200, 204] });
    verbose(`return ${cur.number}: ${cur.status} → ${step}`);
  }
  return (await api('GET', `/api/return/${id}`)).status;
}

async function ensureReturn(ret, ctx) {
  const { orderRes, token, reasons, cancelField } = ctx;
  const spec = retOrderByKey(ret.order);
  const order = orderRes.order;
  // Ledger id first, so a return whose reference was since edited in the spec is still found (and rebuilt).
  const ledgerId = priorId('return', ret.key);
  const existing = (await returnsOnOrder(order.id)).filter((r) => r.id === ledgerId || r.customerReference === ret.reference);
  const live = existing.find((r) => r.id === ledgerId) || existing[0] || null;
  if (live && returnMatches(ret, live) && !FRESH) {
    verbose(`return ${live.number} (${ret.key}) is ${live.status} → reuse`);
    return { type: 'return', key: ret.key, id: live.id, number: live.number, status: live.status, orderId: order.id };
  }
  if (existing.length) {
    log(`  ${ret.key}: rebuilding ${existing.map((r) => `${r.number} (${r.status})`).join(', ')}`);
    await deleteReturns(existing);
  }

  const requiresComment = (code) => !!reasons.find((r) => r.code === code)?.requiresComment;
  if (isAgentLogged(ret)) return finishReturn(ret, ctx, await createAsAgent(ret, order, orderRes.lineIds, requiresComment));
  const created = await mutate(token, `createReturn ${ret.key}`, `mutation($c:CreateReturnCommandType!){ createReturn(command:$c){ ${RETURN_FIELDS} } }`, {
    c: {
      orderId: order.id, customerReference: ret.reference, customerComment: ret.comment, cultureName: CULTURE,
      items: buildDemoReturnItems(ret, orderRes.lineIds, { requiresComment }),
    },
  });
  if (DRY_RUN) { log(`  [DRY] ${ret.key} → ${ret.outcome}`); return { type: 'return', key: ret.key, id: `dry-${ret.key}`, status: ret.outcome }; }
  const id = created?.createReturn?.id;
  if (!id) throw new Error(`createReturn ${ret.key}: no id`);

  if (ret.outcome !== OUTCOME.DRAFT) {
    const attachmentUrlByLine = {};
    for (const l of ret.lines) if (l.evidence) attachmentUrlByLine[l.line] = await uploadEvidence(token, l.evidence, `${ret.key}-${l.line}`);
    await mutate(token, `updateReturn ${ret.key}`, `mutation($c:UpdateReturnCommandType!){ updateReturn(command:$c){ ${RETURN_FIELDS} } }`, {
      c: { returnId: id, items: buildDemoReturnItems(ret, orderRes.lineIds, { attachmentUrlByLine, requiresComment }) },
    });
    await mutate(token, `submitReturn ${ret.key}`, `mutation($c:SubmitReturnCommandType!){ submitReturn(command:$c){ ${RETURN_FIELDS} } }`, { c: { returnId: id } });
  }
  if (ret.outcome === OUTCOME.CANCELLED) {
    const c = { returnId: id, ...(cancelField ? { [cancelField]: ret.cancelReason } : {}) };
    if (!cancelField) log(`  NOTE ${ret.key}: CancelReturnCommandType has no reason field on this build — cancelled without one`);
    await mutate(token, `cancelReturn ${ret.key}`, `mutation($c:CancelReturnCommandType!){ cancelReturn(command:$c){ ${RETURN_FIELDS} } }`, { c });
  }
  return finishReturn(ret, ctx, id);
}

/**
 * The back-office path: an agent logs the return for the buyer (PUT /api/return with no id creates it;
 * there is no POST create — domain map §2a). It lands New, needs no evidence, and can be decided like
 * a Requested one.
 */
async function createAsAgent(ret, order, lineIds, requiresComment) {
  if (DRY_RUN) { log(`  [DRY] agent-logged ${ret.key} → ${ret.outcome}`); return null; }
  const body = {
    storeId: order.storeId, customerId: order.customerId, customerName: order.customerName,
    orderId: order.id, orderNumber: order.number,
    customerReference: ret.reference, customerComment: ret.comment, status: OUTCOME.NEW,
    lineItems: ret.lines.map((l) => {
      const li = (order.items || []).find((x) => x.id === lineIds[l.line - 1]);
      if (!li) throw new Error(`${ret.key}: order has no line ${l.line}`);
      return {
        orderLineItemId: li.id, productId: li.productId, sku: li.sku, name: li.name, measureUnit: li.measureUnit ?? null,
        orderedQuantity: li.quantity, price: li.price, quantity: l.qty,
        reason: l.reason, reasonCode: l.reason, ...(l.reasonComment || requiresComment(l.reason) ? { reasonComment: l.reasonComment || ret.comment } : {}),
      };
    }),
  };
  await api('PUT', '/api/return', body, { expectStatus: [200, 201, 204] });
  const made = (await returnsOnOrder(order.id)).find((r) => r.customerReference === ret.reference);
  if (!made?.id) throw new Error(`agent-logged ${ret.key}: PUT /api/return created nothing findable`);
  return made.id;
}

/** Decide (if the outcome is a decision) and walk on to a post-decision status, then read back. */
async function finishReturn(ret, ctx, id) {
  const { orderRes } = ctx;
  if (DRY_RUN || !id) return { type: 'return', key: ret.key, id: `dry-${ret.key}`, status: ret.outcome };
  const order = orderRes.order;
  const spec = retOrderByKey(ret.order);
  if (isDecided(ret.outcome)) {
    const entity = await api('GET', `/api/return/${id}`);
    await api('POST', `/api/return/${id}/authorize`, buildDemoAuthorizeBody(ret, entity, orderRes.lineIds), { expectStatus: [200, 204] });
    const after = await api('GET', `/api/return/${id}`);
    if (after.status !== authorizedStatusFor(ret)) throw new Error(`authorize ${after.number}: expected ${authorizedStatusFor(ret)}, got ${after.status}`);
  }
  if (isPostDecision(ret.outcome)) await walkTo(id, ret.outcome);

  const final = await api('GET', `/api/return/${id}`);
  if (final.status !== ret.outcome) log(`  ⚠ ${ret.key}: ended ${final.status}, declared ${ret.outcome}`);
  log(`return ${final.number} — ${spec.key}, ${final.status}`);
  return { type: 'return', key: ret.key, id, number: final.number, status: final.status, orderId: order.id };
}

// ---- teardown ----------------------------------------------------------------------------

async function teardown(base) {
  const ledger = readLedger();
  const scopeOrder = ONLY && retOrderByKey(ONLY) ? ONLY : null;
  const scopeReturn = ONLY && !scopeOrder ? ONLY : null;
  log(`TEARDOWN — ledger holds ${ledger.entities?.length || 0} entity/entities${ONLY ? ` (scoped to ${ONLY})` : ''}`);

  if (scopeReturn) {
    const id = (ledger.entities || []).find((e) => e.type === 'return' && e.key === scopeReturn)?.id;
    if (id) await deleteReturns([{ id }]);
    log(`  return ${scopeReturn}: ${id ? 'deleted' : 'not in the ledger'}`);
    writeLedger((ledger.entities || []).filter((e) => !(e.type === 'return' && e.key === scopeReturn)));
    return;
  }

  // Ledger orders + marker sweep over the demo buyers' orders (finds what an interrupted run left).
  const orders = new Map();
  for (const e of (ledger.entities || []).filter((x) => x.type === 'order' && (!scopeOrder || x.key === scopeOrder))) {
    const o = await api('GET', `/api/order/customerOrders/${e.id}`, null, { expectStatus: [200, 404] });
    if (o?.id && isDemoRetMarker(o.outerId)) orders.set(o.id, o);
  }
  const buyerIds = Object.values(base.buyers).map((b) => b.userId).filter(Boolean);
  if (buyerIds.length) {
    const r = await api('POST', '/api/order/customerOrders/search', { customerIds: buyerIds, take: 500 });
    for (const o of r?.results || []) {
      if (!isDemoRetMarker(o.outerId)) continue;
      if (scopeOrder && o.outerId !== demoRetMarker('ORD', scopeOrder)) continue;
      if (!orders.has(o.id)) { orders.set(o.id, o); log(`  marker-orphan ${o.number} (${o.outerId}) — not in the ledger`); }
    }
  }
  for (const spec of DEMO_RET_ORDERS) {
    if (scopeOrder && spec.key !== scopeOrder) continue;
    const o = await findOrderByNumber(demoRetOrderNumber(spec.key));
    if (o && isDemoRetMarker(o.outerId)) orders.set(o.id, o);
  }

  const password = resolvePassword('{{SR_DEMO_BUYER_PASSWORD}}');
  const tokens = new Map();
  let files = 0; let returns = 0;
  for (const o of orders.values()) {
    const rs = await returnsOnOrder(o.id);
    const urls = rs.flatMap((r) => (r.lineItems || []).flatMap((l) => (l.attachments || []).map((a) => a.url))).filter(Boolean);
    await deleteReturns(rs);
    returns += rs.length;
    await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
    // Files: owner-only delete through xAPI. Best effort — an orphaned scoped file is invisible to every page.
    const buyer = Object.values(base.buyers).find((b) => b.userId === o.customerId);
    if (buyer && urls.length && !DRY_RUN) {
      if (!tokens.has(buyer.email)) tokens.set(buyer.email, await buyerToken(buyer.email, password, buyer.orgId));
      const t = tokens.get(buyer.email);
      for (const u of urls) {
        if (!t) break;
        const r = await gql(t, 'mutation($c:DeleteFileCommandType!){ deleteFile(command:$c) }', { c: { id: String(u).split('/').pop() } }).catch(() => null);
        if (!r?.errors?.length) files += 1;
      }
    }
    log(`  deleted ${o.number} + ${rs.length} return(s)`);
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const id of orders.keys()) n += (await api('GET', `/api/order/customerOrders/${id}`, null, { expectStatus: [200, 404] }))?.id ? 1 : 0;
    return n;
  });
  writeLedger(scopeOrder ? (ledger.entities || []).filter((e) => !((e.type === 'order' && e.key === scopeOrder) || (e.type === 'return' && retOrderByKey(e.orderKey)?.key === scopeOrder))) : []);
  log(`Teardown: ${orders.size} order(s), ${returns} return(s), ${files} evidence file(s) removed.`);
  if (residue) { log(`  ⚠ ${residue} order(s) still present`); process.exitCode = 1; } else log('Zero residue.');
}

// ---- main ----------------------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  const problems = demoReturnProblems();
  if (problems.length) {
    console.error('ABORT: the returns demo dataset does not hold together:');
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(2);
  }
  await auth();
  const base = salesRepDemoBase();
  if (TEARDOWN) { await teardown(base); return; }

  if (!base.present) {
    console.error(`ABORT: aliases.${TEST_ENV}.json has no ${SR_DEMO_LEDGER_KEY} — the sales-rep demo (its organizations and buyers) is not seeded here.`);
    console.error(`  Seed it first: TEST_ENV=${TEST_ENV} npm run seed:sales-rep-family -- --profile demo   (or npm run seed:demo for both)`);
    process.exit(2);
  }
  const missing = DEMO_RET_ORDERS.filter((o) => !base.orgs[o.org] || !base.buyers[o.buyer]).map((o) => `${o.key} (${!base.orgs[o.org] ? o.org : o.buyer})`);
  if (missing.length) {
    console.error(`ABORT: the sales-rep demo ledger lacks what these orders stand on: ${missing.join(', ')}. Re-seed the sales-rep demo.`);
    process.exit(2);
  }

  const password = resolvePassword('{{SR_DEMO_BUYER_PASSWORD}}');
  const tokens = {};
  for (const key of new Set(DEMO_RET_ORDERS.map((o) => o.buyer))) {
    const b = base.buyers[key];
    tokens[key] = DRY_RUN ? 'dry' : await buyerToken(b.email, password, b.orgId);
    if (!tokens[key]) throw new Error(`${b.email} cannot sign in to ${STORE_ID} with SR_DEMO_BUYER_PASSWORD — the sales-rep demo set it; check .env.local`);
  }

  // Policy, read live with a buyer token, never assumed.
  const anyToken = Object.values(tokens)[0];
  const pol = DRY_RUN ? null : (await gql(anyToken, 'query($s:String!){ returnPolicy(storeId:$s){ isEnabled windowDays allowedOrderStatuses } returnReasons(storeId:$s, cultureName:"en-US"){ code requiresComment } }', { s: STORE_ID }))?.data;
  if (!DRY_RUN) {
    if (!pol?.returnPolicy?.isEnabled) throw new Error(`returns are disabled on ${STORE_ID} (Return.ReturnEnabled) — nothing here could be submitted`);
    if (!(pol.returnPolicy.allowedOrderStatuses || []).includes(DEMO_RET_REQUIRED_ORDER_STATUS)) throw new Error(`"${DEMO_RET_REQUIRED_ORDER_STATUS}" is not an allowed order status on ${STORE_ID}`);
    if ((pol.returnPolicy.windowDays ?? 0) < DEMO_WINDOW_DAYS_ASSUMED) throw new Error(`window is ${pol.returnPolicy.windowDays} day(s); the delivery offsets assume ${DEMO_WINDOW_DAYS_ASSUMED}`);
    const liveCodes = (pol.returnReasons || []).map((r) => r.code);
    const p2 = demoReturnProblems({ reasonCodes: liveCodes });
    if (p2.length) throw new Error(`the store's return reasons (${liveCodes.join(', ')}) do not cover the dataset:\n  - ${p2.join('\n  - ')}`);
    log(`returnPolicy ${JSON.stringify(pol.returnPolicy)}`);
  }
  const cancelField = DRY_RUN ? 'reason' : await cancelReasonField(anyToken);

  const now = new Date();
  const pools = await discoverPools();
  const cursor = {};
  const entities = [];
  const orderRes = {};
  for (const spec of DEMO_RET_ORDERS) {
    const wantedHere = !ONLY || ONLY === spec.key || returnsInSubmitOrder().some((r) => r.key === ONLY && r.order === spec.key);
    if (!wantedHere) continue;
    orderRes[spec.key] = await ensureOrder(spec, base, pools, cursor, now);
    const o = orderRes[spec.key];
    entities.push({ type: 'order', key: spec.key, id: o.order.id, number: o.order.number, marker: demoRetMarker('ORD', spec.key), skus: o.skus || PRIOR_SKUS[spec.key] || [] });
  }

  for (const ret of returnsInSubmitOrder()) {
    if (ONLY && ONLY !== ret.key && ONLY !== ret.order) continue;
    const spec = retOrderByKey(ret.order);
    entities.push({ ...await ensureReturn(ret, { orderRes: orderRes[ret.order], token: tokens[spec.buyer], reasons: pol?.returnReasons || [], cancelField }), orderKey: ret.order });
  }

  // Report — never write — whether the organization returns view has a holder among the demo buyers.
  if (!DRY_RUN) {
    const roles = await api('POST', '/api/platform/security/roles/search', { keyword: 'Organization maintainer', take: 5 }, { expectStatus: [200, 201] }).catch(() => null);
    const role = (roles?.results || []).find((r) => r.name === 'Organization maintainer');
    const can = (role?.permissions || []).some((p) => (p.name || p) === 'xapi:my_organization:return:view');
    log(can
      ? 'Organization maintainer holds xapi:my_organization:return:view — Margaret Hale / Priya Raman see their colleagues\' returns.'
      : 'NOTE: Organization maintainer lacks xapi:my_organization:return:view on this env — each buyer sees only their own returns. Not changed (a built-in role is not this seeder\'s to edit).');
  }

  const merged = ONLY
    ? [...(readLedger().entities || []).filter((e) => !entities.some((n) => n.type === e.type && n.key === e.key)), ...entities]
    : entities;
  if (!DRY_RUN) writeLedger(merged);
  const byStatus = {};
  entities.filter((e) => e.type === 'return').forEach((e) => { byStatus[e.status] = (byStatus[e.status] || 0) + 1; });
  log('');
  log(`Returns demo: ${entities.filter((e) => e.type === 'order').length} order(s), ${entities.filter((e) => e.type === 'return').length} return(s) — ${JSON.stringify(byStatus)}.`);
  log(DRY_RUN ? 'DRY RUN — no writes were made.' : `Ledger → test-data/aliases.${TEST_ENV}.json[${DEMO_RET_LEDGER_KEY}]. Commit it.`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });

