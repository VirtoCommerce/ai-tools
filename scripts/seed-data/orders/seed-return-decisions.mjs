#!/usr/bin/env node
/**
 * seed-return-decisions.mjs — VCST-5883 (buyer's own returns, step 2: agent approve/decline per line +
 * buyer email/push notification). Provisions RETURN_DECISION_FIXTURES (return-decisions-specs.mjs):
 * fresh Completed + delivered AGENT-TEST orders, each carrying the return(s) the tests will DECIDE.
 *
 * THROUGH THE MECHANISM. A buyer-side return is submitted exactly the way the storefront does it, with
 * the buyer's own storefront token: createReturn (Draft) -> File Experience API upload into the
 * `return-attachments` scope, one file per line -> updateReturn(attachmentUrls) -> submitReturn
 * (Draft -> Requested). Writing a `Requested` row through the admin REST PUT would skip exactly the
 * code that emits ReturnRegisteredEmailNotification + the push message the reconcile checks for, and
 * would not stamp Return.LanguageCode the way a real submit does.
 *
 * NEVER AUTHORIZES. The decision is what the tests perform; a decided return is terminal, so the
 * idempotency check REBUILDS any fixture whose return is no longer undecided (re-seedable per run).
 *
 * ORDERS REUSE STEP 1'S BUILDERS (finalizeReturnOrderBody / buildReturnPhase2Body / diagnoseSeededOrder),
 * including its two silent-failure lessons (platform-assigned line ids ⇒ two-phase create; shipment
 * items need the inline lineItem). Never touches step 1's AGENT-TEST-ORD-RET-<A..G> orders.
 *
 * Flags: --dry-run · --verbose · --teardown · --only <KEY|ALIAS> · --fresh (rebuild even when valid)
 * Usage: TEST_ENV=vcptcore_qa1 npm run seed:returns:decisions
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, ROOT, BACK_URL, STORE_ID, DRY_RUN, TEARDOWN, ONLY,
  writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts, makeProductPng,
} from '../../lib/seed-common.mjs';
import {
  resolveTokens, applyReturnCatalogItems, finalizeReturnOrderBody, buildReturnPhase2Body, diagnoseSeededOrder,
  LINE_ROLE_X, LINE_ROLE_Y, RETURN_WINDOW_DAYS_ASSUMED, RETURN_ALLOWED_STATUS,
} from './orders-specs.mjs';
import {
  RETURN_DECISION_FIXTURES, DECISION_TEMPLATE_FIXTURE, DECISION_COLLEAGUE_ALIAS, VIA_XAPI, VIA_ADMIN_PUT,
  decisionOrderNumber, decisionReturnRef, toOrderSpec, shapeDecisionTemplate, buildReturnItems,
  buildAdminReturnBody, diagnoseSeededReturns, decisionAliasRecord, rolesOf,
} from './return-decisions-specs.mjs';

const FRESH = process.argv.includes('--fresh');
// --return-ids <id,id,…> (teardown only): extra AGENT-TEST return ids another lane of the same run left on
// orders this seeder does not own (e.g. step 1's E/G). Passed on the command line, never committed — a
// runtime GUID in a committed file resolves the wrong entity on every other env.
const EXTRA_RETURN_IDS = process.argv.includes('--return-ids')
  ? String(process.argv[process.argv.indexOf('--return-ids') + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : [];
const ATTACHMENT_SCOPE = 'return-attachments';
const template = JSON.parse(readFileSync(join(ROOT, 'test-data', DECISION_TEMPLATE_FIXTURE), 'utf8'));

async function storefrontToken(email, password) {
  if (!email || !password) return { ok: false, reason: 'email or password unresolved from the layered env' };
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password, scope: 'offline_access', storeId: STORE_ID }),
  });
  if (!res.ok) return { ok: false, reason: `${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}` };
  return { ok: true, token: (await res.json()).access_token };
}

async function gql(query, variables, token) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function gqlMutate(label, query, variables, token) {
  if (DRY_RUN) { log(`  [DRY] ${label}`); return null; }
  const r = await gql(query, variables, token);
  if (r.errors?.length) throw new Error(`${label}: ${JSON.stringify(r.errors).slice(0, 400)}`);
  return r.data;
}

/** A platform user who can sign in to the storefront, with contact + org read back through `me`. */
async function signedInPersona(key) {
  const email = process.env[`${key}_EMAIL`]; const password = process.env[`${key}_PASSWORD`];
  const u = email && await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  if (!u?.id) return { ok: false, reason: `${key}_EMAIL=${email || '(unset)'} has no platform account` };
  const t = await storefrontToken(email, password);
  if (!t.ok) return { ok: false, reason: `${email} cannot sign in to ${STORE_ID}: ${t.reason}` };
  const me = await gql('{ me { id contact { id fullName organizationId organizations { items { id name } } } } }', {}, t.token);
  const c = me?.data?.me?.contact;
  return {
    ok: true, key, email, id: u.id, name: u.userName || email, token: t.token, contactId: c?.id || null,
    organizationId: c?.organizationId || null, organizationName: c?.organizations?.items?.[0]?.name || null,
    orgIds: (c?.organizations?.items || []).map((o) => o.id),
  };
}

async function findOrder(number) {
  const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
  const hit = (found?.results || []).find((o) => o.number === number);
  return hit?.id ? api('GET', `/api/order/customerOrders/${hit.id}`) : null;
}

async function returnsForOrder(orderId) {
  const r = await api('POST', '/api/return/search', { orderId, take: 50 });
  // Search projections can omit children — re-read each so lineItems/languageCode/attachments are real.
  const out = [];
  for (const x of r?.results || []) out.push(await api('GET', `/api/return/${x.id}`));
  return out;
}

async function deleteFixture(order, returns, buyer) {
  const fileIds = returns.flatMap((r) => (r.lineItems || []).flatMap((l) => (l.attachments || []).map((a) => String(a.url || '').split('/').pop()))).filter(Boolean);
  if (returns.length) await api('DELETE', `/api/return?${returns.map((r) => `ids=${r.id}`).join('&')}`, null, { expectStatus: [200, 204] });
  if (order) await api('DELETE', `/api/order/customerOrders?ids=${order.id}`, null, { expectStatus: [200, 204] });
  // Attachment files: the File Experience API has no REST delete; the owner deletes through xAPI.
  // Best effort — an orphaned scoped file is not an AGENT-TEST entity any search can see.
  if (buyer?.token) {
    for (const id of fileIds) {
      const r = DRY_RUN ? null : await gql('mutation($c:DeleteFileCommandType!){ deleteFile(command:$c) }', { c: { id } }, buyer.token).catch(() => null);
      verbose(`deleteFile ${id}: ${JSON.stringify(r?.errors?.[0]?.message || r?.data || 'dry')}`);
    }
  }
  return fileIds.length;
}

const RETURN_FIELDS = 'id number status items { id orderLineItemId quantity attachments { url } }';

async function uploadEvidence(buyer, fileName) {
  if (DRY_RUN) return `dry://${fileName}`;
  const form = new FormData();
  form.append('file', new Blob([makeProductPng('AGENT-TEST-RET', 1)], { type: 'image/png' }), fileName);
  const res = await fetch(`${BACK_URL}/api/files/${ATTACHMENT_SCOPE}`, { method: 'POST', headers: { Authorization: `Bearer ${buyer.token}` }, body: form });
  const j = await res.json().catch(() => null);
  const info = Array.isArray(j) ? j[0] : j;
  if (!res.ok || !info?.succeeded) throw new Error(`upload ${fileName} → ${ATTACHMENT_SCOPE}: ${res.status} ${JSON.stringify(info).slice(0, 200)}`);
  return info.url;
}

/** Buyer path: createReturn -> upload per line -> updateReturn(attachments) -> submitReturn. */
async function submitThroughXapi(spec, rs, buyer, lineIdByRole, reason) {
  const ref = decisionReturnRef(spec.key, rs.ref);
  const created = await gqlMutate(`createReturn ${ref}`, `mutation($c:CreateReturnCommandType!){ createReturn(command:$c){ ${RETURN_FIELDS} } }`, {
    c: {
      orderId: lineIdByRole._orderId, customerReference: ref, customerComment: `AGENT-TEST VCST-5883 ${spec.key}`,
      ...(rs.cultureName ? { cultureName: rs.cultureName } : {}),
      items: buildReturnItems(rs, lineIdByRole, { reason }),
    },
  }, buyer.token);
  const id = created?.createReturn?.id;
  if (!DRY_RUN && !id) throw new Error(`createReturn ${ref}: no id in ${JSON.stringify(created).slice(0, 200)}`);
  const attachmentUrlByRole = {};
  for (const role of Object.keys(rs.lines)) attachmentUrlByRole[role] = await uploadEvidence(buyer, `agent-test-${spec.key.toLowerCase()}-${rs.ref.toLowerCase()}-${role}.png`);
  await gqlMutate(`updateReturn ${ref}`, `mutation($c:UpdateReturnCommandType!){ updateReturn(command:$c){ ${RETURN_FIELDS} } }`, {
    c: { returnId: id, items: buildReturnItems(rs, lineIdByRole, { reason, attachmentUrlByRole }) },
  }, buyer.token);
  const sub = await gqlMutate(`submitReturn ${ref}`, `mutation($c:SubmitReturnCommandType!){ submitReturn(command:$c){ ${RETURN_FIELDS} } }`, { c: { returnId: id } }, buyer.token);
  log(`    ${ref} → ${sub?.submitReturn?.number ?? '(dry)'} ${sub?.submitReturn?.status ?? ''}${rs.cultureName ? ` (cultureName ${rs.cultureName})` : ''}`);
  return id;
}

/** Admin path: the legacy REST upsert, PUT /api/return with no id (domain map G2). */
async function createThroughAdminPut(spec, rs, order, lineByRole) {
  const body = buildAdminReturnBody(rs, spec, order, lineByRole);
  const res = await api('PUT', '/api/return', body, { expectStatus: [200, 201, 204] });
  log(`    ${decisionReturnRef(spec.key, rs.ref)} → admin PUT /api/return (no id) → ${res?.number ?? res?.id ?? '(204, no body)'} ${res?.status ?? ''}`);
  return res?.id ?? null;
}

async function buildOrder(spec, buyer, productsByRole, rolesBySku, now) {
  const orderSpec = toOrderSpec(spec);
  const { obj, unresolved } = resolveTokens(template, process.env);
  if (unresolved.length) throw new Error(`${spec.key}: unresolved env token(s) ${unresolved.join(', ')}`);
  const shaped = applyReturnCatalogItems(shapeDecisionTemplate(spec, obj), productsByRole);
  const body = finalizeReturnOrderBody(orderSpec, shaped, {
    customerId: buyer.id, customerName: buyer.name, organizationId: buyer.organizationId, organizationName: buyer.organizationName,
  }, now);
  const created = await api('POST', '/api/order/customerOrders', body);
  if (DRY_RUN) return null;
  const full = await api('GET', `/api/order/customerOrders/${created.id}`);
  await api('PUT', '/api/order/customerOrders', buildReturnPhase2Body(orderSpec, full, rolesBySku, now), { expectStatus: [200, 204] });
  return api('GET', `/api/order/customerOrders/${created.id}`);
}

function lineMaps(order, rolesBySku) {
  const lineByRole = {}; const lineIdByRole = { _orderId: order?.id };
  for (const li of order?.items || []) { const r = rolesBySku[li.sku]; if (r) { lineByRole[r] = li; lineIdByRole[r] = li.id; } }
  return { lineByRole, lineIdByRole };
}

async function ensureFixture(spec, ctx) {
  const { buyer, productsByRole, rolesBySku, reason, now } = ctx;
  const number = decisionOrderNumber(spec.key);
  const orderSpec = toOrderSpec(spec);
  let order = await findOrder(number);
  if (order) {
    const returns = await returnsForOrder(order.id);
    const { lineIdByRole } = lineMaps(order, rolesBySku);
    const d1 = diagnoseSeededOrder(orderSpec, order, rolesBySku, { windowDays: ctx.windowDays, now, ownerId: buyer.id });
    const d2 = diagnoseSeededReturns(spec, returns, lineIdByRole);
    if (d1.ok && d2.ok && !FRESH) {
      log(`  ${number} exists, undecided and matching → reuse`);
      return { order, returns, rebuilt: false };
    }
    log(`  ${number} rebuilding — ${FRESH ? '--fresh' : [...d1.problems, ...d2.problems][0]}`);
    await deleteFixture(order, returns, buyer);
  }
  order = await buildOrder(spec, buyer, productsByRole, rolesBySku, now);
  if (DRY_RUN) { log(`  [DRY] would create ${number} + ${spec.returns.length} return(s)`); return { order: null, returns: [], rebuilt: true }; }
  const d = diagnoseSeededOrder(orderSpec, order, rolesBySku, { windowDays: ctx.windowDays, now, ownerId: buyer.id });
  if (!d.ok) throw new Error(`${number} POSTed but did NOT take: ${d.problems.join('; ')}`);
  log(`  ${number} → ${order.id} (languageCode ${order.languageCode}, ${rolesOf(spec).map((r) => `${r}=${spec[r].ordered}${spec[r].measureUnit ? ' ' + spec[r].measureUnit : ''}`).join(', ')})`);
  const { lineByRole, lineIdByRole } = lineMaps(order, rolesBySku);
  for (const rs of spec.returns) {
    if (rs.via === VIA_XAPI) await submitThroughXapi(spec, rs, buyer, lineIdByRole, reason);
    else if (rs.via === VIA_ADMIN_PUT) await createThroughAdminPut(spec, rs, order, lineByRole);
  }
  const returns = await returnsForOrder(order.id);
  const dr = diagnoseSeededReturns(spec, returns, lineIdByRole);
  if (!dr.ok) { log(`  ⚠ ${number}: returns did not land as specified:`); dr.problems.forEach((p) => log(`      - ${p}`)); }
  return { order, returns, rebuilt: true, problems: dr.problems };
}

async function teardown(buyer) {
  const specs = RETURN_DECISION_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);
  if (ONLY && !specs.length) throw new Error(`--only ${ONLY} matches no decision fixture`);
  log(`TEARDOWN — ${specs.map((s) => decisionOrderNumber(s.key)).join(', ')} and their returns`);
  for (const spec of [...specs].reverse()) {
    const order = await findOrder(decisionOrderNumber(spec.key));
    if (!order) { verbose(`${decisionOrderNumber(spec.key)} absent`); continue; }
    const returns = await returnsForOrder(order.id);
    const files = await deleteFixture(order, returns, buyer);
    log(`  deleted ${order.number} + ${returns.length} return(s)${files ? ` (+${files} attachment file(s), best effort)` : ''}`);
  }
  // Extra returns: deleted ONLY if they belong to the buyer under test and sit on an AGENT-TEST order.
  const extraDeleted = [];
  for (const id of EXTRA_RETURN_IDS) {
    const r = await api('GET', `/api/return/${encodeURIComponent(id)}`, null, { expectStatus: [200, 204, 404] });
    if (!r?.id) { log(`  --return-ids ${id}: already gone`); continue; }
    if (!String(r.orderNumber || '').startsWith('AGENT-TEST-') || (buyer && r.customerId !== buyer.id)) {
      log(`  ⚠ --return-ids ${id} (${r.number}) is on ${r.orderNumber} for ${r.customerName} — NOT an AGENT-TEST return of the buyer under test; refusing to delete`);
      continue;
    }
    await deleteFixture(null, [r], buyer);
    extraDeleted.push(id);
    log(`  deleted extra return ${r.number} (${r.status}) on ${r.orderNumber}`);
  }
  const residue = await verifyRemoved(async () => {
    let n = 0;
    for (const id of extraDeleted) n += (await api('GET', `/api/return/${encodeURIComponent(id)}`, null, { expectStatus: [200, 204, 404] }))?.id ? 1 : 0;
    for (const spec of specs) {
      const o = await findOrder(decisionOrderNumber(spec.key));
      if (o) n += 1 + (await api('POST', '/api/return/search', { orderId: o.id, take: 50 }))?.totalCount;
    }
    return n;
  });
  if (residue) { log(`  ⚠ ${residue} decision order(s)/return(s) still present after teardown`); process.exitCode = 1; }
  else log('Teardown complete — zero residue.');
}

async function main() {
  assertSafeTarget();
  await auth();
  const buyerR = await signedInPersona('USER');
  if (TEARDOWN) { await teardown(buyerR.ok ? buyerR : null); return; }
  if (!buyerR.ok) throw new Error(`buyer unusable: ${buyerR.reason}`);
  const buyer = buyerR;
  log(`Buyer: ${buyer.email} — storefront sign-in verified; org "${buyer.organizationName}"`);

  const pol = (await gql(`query($s:String!){ returnPolicy(storeId:$s){ isEnabled windowDays allowedOrderStatuses } returnReasons(storeId:$s){ code requiresComment } }`, { s: STORE_ID }, buyer.token))?.data;
  if (!pol?.returnPolicy?.isEnabled) throw new Error(`returns are disabled on ${STORE_ID} — nothing here would be submittable`);
  if (!(pol.returnPolicy.allowedOrderStatuses || []).includes(RETURN_ALLOWED_STATUS)) throw new Error(`"${RETURN_ALLOWED_STATUS}" is not an allowed order status on ${STORE_ID}`);
  // The reason is read LIVE, never assumed: prefer one that requires a comment, so the payload exercises
  // the stricter path (a store whose list has none still seeds).
  const reason = (pol.returnReasons || []).find((r) => r.requiresComment) || pol.returnReasons?.[0];
  if (!reason) throw new Error(`returnReasons(${STORE_ID}) is empty — submitReturn requires a reason on every line`);
  log(`  returnPolicy ${JSON.stringify(pol.returnPolicy)} | reason ${reason.code} (requiresComment=${reason.requiresComment})`);

  const products = await discoverCatalogProducts(api, 2);
  if (products.length < 2 && !DRY_RUN) throw new Error('the fixtures need 2 distinct catalog products');
  const productsByRole = { [LINE_ROLE_X]: products[0], [LINE_ROLE_Y]: products[1] };
  const rolesBySku = {};
  for (const [role, p] of Object.entries(productsByRole)) if (p?.sku) rolesBySku[p.sku] = role;
  if (products[0]?.sku && products[0].sku === products[1]?.sku) throw new Error('catalog discovery returned one sku twice');
  log(`  line A = ${products[0]?.sku} | line B = ${products[1]?.sku}`);

  const now = new Date();
  const ctx = { buyer, productsByRole, rolesBySku, reason, now, windowDays: pol.returnPolicy.windowDays ?? RETURN_WINDOW_DAYS_ASSUMED };
  const specs = RETURN_DECISION_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);
  const writeback = {}; const bad = [];
  for (const spec of specs) {
    const r = await ensureFixture(spec, ctx);
    if (r.problems?.length) bad.push(spec.key);
    if (!r.order) continue;
    const { lineByRole } = lineMaps(r.order, rolesBySku);
    const byRef = Object.fromEntries(spec.returns.map((rs) => [rs.ref, r.returns.find((x) => x.customerReference === decisionReturnRef(spec.key, rs.ref))]));
    writeback[spec.alias] = decisionAliasRecord(spec, r.order, byRef, lineByRole, { seededAt: r.rebuilt ? now.toISOString() : undefined });
  }

  // Same-organization colleague (a second buyer who must NOT be able to act on the first buyer's return).
  if (!ONLY || ONLY === DECISION_COLLEAGUE_ALIAS) {
    const col = await signedInPersona('USER2');
    if (!col.ok) log(`  ⚠ ${DECISION_COLLEAGUE_ALIAS}: ${col.reason} — FIXTURE-GAP`);
    else if (col.id === buyer.id) log(`  ⚠ ${DECISION_COLLEAGUE_ALIAS}: USER2 IS the buyer — FIXTURE-GAP`);
    else if (!buyer.organizationId || !col.orgIds.includes(buyer.organizationId)) log(`  ⚠ ${DECISION_COLLEAGUE_ALIAS}: ${col.email} is NOT in ${buyer.organizationName} — FIXTURE-GAP (provision a same-org contact)`);
    else {
      writeback[DECISION_COLLEAGUE_ALIAS] = {
        userName: col.email, userId: col.id, contactId: col.contactId,
        organizationId: buyer.organizationId, organizationName: buyer.organizationName, envKey: 'USER2',
      };
      log(`  ${DECISION_COLLEAGUE_ALIAS} → ${col.email} (same org "${buyer.organizationName}", verified via me.contact.organizations)`);
    }
  }

  if (!DRY_RUN) writeEnvAliasOverride(writeback);
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : `Return-decision seed complete — ${Object.keys(writeback).length} alias(es) written to aliases.${process.env.TEST_ENV || 'vcst'}.json.`);
  if (bad.length) { log(`⚠ fixture(s) that did not fully take: ${bad.join(', ')}`); process.exitCode = 1; }
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
