#!/usr/bin/env node
/**
 * seed-edge-cases.mjs — provision the four genuinely-missing edge-case regression fixtures that
 * block suites 006 / 011 / 014 (see edge-cases-specs.mjs for the full contract).
 *
 * ADDITIVE + ISOLATED by construction:
 *   - F1 reuses the existing AGENT-TEST filler orgs (organizations.csv ORG-009..019, resolved by their
 *     pinned platform_id — NEVER by name search, NEVER created here: they belong to seed:b2b) and only
 *     ADDS the personas' memberships; it never mutates an org or the impersonation target.
 *   - F2 creates a brand-NEW org (never TechFlow/BuildRight), so its 22 addresses can never collide
 *     with shared data; it is found again by the overlay-pinned id, and teardown deletes the whole org.
 *   - F3 discontinues only a DEDICATED throwaway product it created — no shared catalog item changes.
 *   - F4 creates a NEW personal account — the real external mailbox is never touched.
 *
 * Builds on scripts/lib/user-provision.mjs (shared OAuth + idempotent member/account/membership CRUD)
 * and seed-common.mjs (prod guard + aliases.<env>.json writeback + verifyRemoved). Runtime GUIDs go
 * ONLY to test-data/aliases.<env>.json; committed sources carry business keys only.
 *
 * Usage:
 *   node scripts/seed-data/edge-cases/seed-edge-cases.mjs [all|multi-org|addr22|discontinued|personal]
 *        [--teardown] [--dry-run] [--verbose]
 */

import {
  assertSafeTarget, writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts, findOrdersByExactNumber,
  loadCsv, idsParam, ROOT, DRY_RUN, TEARDOWN, log, verbose,
} from '../../lib/seed-common.mjs';
import {
  authenticate, getApi, ensureMemberIndex, setFlags,
  findUserByEmail, findMemberById, findContactById, ensureMembershipContact, ensureSecurityAccount,
  ensureOrgMembership, searchMemberships, stripSeededGlobalRoles, deleteUserByEmail,
  resolvePassword, isPasswordDeclared,
} from '../../lib/user-provision.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  PW_TOKEN, STORE_ID_DEFAULT,
  resolveFillerOrgs, BOUNDARY_ROLE, MULTI_ORG_PERSONAS,
  ADDR22_ORG_NAME, ADDR22_ORG_EMAIL, ADDR22_ADMIN, ADDR22_TARGET_TOTAL, buildAddr22Addresses,
  DISC_ORDER_NUMBER, DISC_PRODUCT, DISC_BUYER, DISCONTINUED_ORDER_ALIAS, buildDiscontinuedOrderBody,
  PERSONAL_NON_ORG,
} from './edge-cases-specs.mjs';

const argv = process.argv.slice(2);
const KINDS = ['all', 'multi-org', 'addr22', 'discontinued', 'personal'];
const kind = KINDS.find((k) => argv.includes(k)) || 'all';
const VERBOSE = argv.includes('--verbose');
setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
const wants = (k) => kind === 'all' || kind === k;
const TEST_ENV = process.env.TEST_ENV || 'vcst';
const ENV_FILE = `.env.${TEST_ENV}`;
const STORE_ID = process.env.STORE_ID || STORE_ID_DEFAULT;
const PW = resolvePassword(PW_TOKEN);
const RECONCILE = isPasswordDeclared(PW_TOKEN);
const isDry = (id) => !id || String(id).startsWith('dry-');

/* ── Overlay helpers ─────────────────────────────────────────────────────────── */
function readOverlay() {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}
function removeOverlayAliases(names) {
  if (DRY_RUN || !names.length) return;
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  if (!existsSync(p)) return;
  const cur = JSON.parse(readFileSync(p, 'utf8'));
  let removed = 0;
  for (const n of names) if (cur[n]) { delete cur[n]; removed++; }
  if (removed) { writeFileSync(p, `${JSON.stringify(cur, null, 2)}\n`); log(`  ✓ removed ${removed} overlay alias(es) from aliases.${TEST_ENV}.json`); }
}

/* ── Org lookups (index-independent first) ───────────────────────────────────── */
/**
 * Every Organization whose name is EXACTLY `name`, by a paged scan of the member search WITHOUT a
 * keyword. The keyword search does not match a hyphenated "AGENT-TEST-Org-…" name on vcst (measured
 * 2026-10-05: 0 hits for orgs that exist), so a keyword lookup misses an existing org and re-creates it.
 */
async function findOrgsByExactName(api, name) {
  const out = [];
  for (let skip = 0; ; skip += 500) {
    const r = await api('POST', '/api/members/search', { memberType: 'Organization', take: 500, skip });
    const page = r?.results || [];
    out.push(...page.filter((m) => m?.name === name));
    if (page.length < 500) break;
  }
  return out;
}

/**
 * The Addr22 org: the overlay-pinned ORG_ADDR22.org_id first (GET by id — reliable, no index), then an
 * exact-name scan. Returns `{ org, dupes }` — `dupes` are other exact-name orgs (residue of the old
 * name-search seeder; all of them are this domain's disposable org).
 */
async function resolveAddr22Org(api) {
  const pinned = readOverlay()?.ORG_ADDR22?.org_id;
  const byId = pinned ? await findMemberById(pinned) : null;
  const viaId = byId?.id && byId.name === ADDR22_ORG_NAME ? byId : null;
  if (pinned && !viaId) verbose(`overlay ORG_ADDR22.org_id ${pinned} no longer resolves to ${ADDR22_ORG_NAME}`);
  const byName = await findOrgsByExactName(api, ADDR22_ORG_NAME);
  const org = viaId || byName.sort((a, b) => String(a.createdDate || '').localeCompare(String(b.createdDate || '')))[0] || null;
  return { org, dupes: byName.filter((o) => o.id !== org?.id) };
}

/* ── F1 helpers ──────────────────────────────────────────────────────────────── */
/**
 * Make the persona's org set EXACTLY `orgIds` on both sides xAPI and the admin read — contact.organizations
 * (what the storefront org switcher reads, KB-4EDC989E) and the OrganizationMembership rows — then re-read
 * and THROW unless both equal the set. Extras are removed: the contact and its memberships belong to this
 * persona alone (agent-test- email), so an extra org is drift, never someone else's data. An exactly-10
 * persona silently holding 11 orgs would make the 10/11 boundary case vacuous.
 */
async function ensureExactOrgSet(api, persona, userId, contactId, orgIds) {
  const want = new Set(orgIds);
  const same = (ids) => ids.length === want.size && ids.every((id) => want.has(id));

  // Contact side.
  const contact = await findContactById(contactId);
  if (!contact?.id) throw new Error(`${persona.alias}: contact ${contactId} not readable`);
  const cur = contact.organizations || [];
  const defaultOk = want.has(contact.defaultOrganizationId);
  if (!same(cur) || !defaultOk) {
    const extra = cur.filter((id) => !want.has(id)).length;
    const missing = orgIds.filter((id) => !cur.includes(id)).length;
    if (DRY_RUN) log(`    [DRY] ${persona.alias}: contact.organizations would be set to exactly ${orgIds.length} (+${missing} / -${extra})${defaultOk ? '' : ', default org reset'}`);
    else {
      contact.organizations = [...orgIds];
      if (!defaultOk) contact.defaultOrganizationId = orgIds[0];
      await api('PUT', '/api/members', contact, { expectStatus: [200, 204] });
      log(`    ↻ ${persona.alias}: contact.organizations set to exactly ${orgIds.length} (+${missing} / -${extra})`);
    }
  }

  // Membership side.
  if (isDry(userId)) return;
  let rows = await searchMemberships(userId);
  const extras = rows.filter((m) => m?.id && !want.has(m.organizationId));
  if (extras.length) {
    if (DRY_RUN) log(`    [DRY] ${persona.alias}: would remove ${extras.length} membership(s) outside the declared set`);
    else {
      await api('DELETE', `/api/customer/organization-memberships?${idsParam(extras.map((m) => m.id))}`, null, { expectStatus: [200, 204, 404] });
      log(`    ✗ ${persona.alias}: removed ${extras.length} membership(s) outside the declared set`);
    }
  }
  if (DRY_RUN) {
    const memberOrgs = [...new Set(rows.map((m) => m.organizationId))];
    log(`    ${persona.alias}: live contact orgs ${cur.length}, membership orgs ${memberOrgs.length} (want exactly ${want.size}) — ${same(cur) && same(memberOrgs) ? 'EXACT' : 'would be corrected'}`);
    return;
  }

  // Re-read both sides and fail loud unless they are exactly the declared set.
  const after = await findContactById(contactId);
  rows = await searchMemberships(userId);
  const memberOrgs = [...new Set(rows.map((m) => m.organizationId))];
  const problems = [];
  if (!same(after?.organizations || [])) problems.push(`contact.organizations has ${(after?.organizations || []).length}`);
  if (!same(memberOrgs) || rows.length !== want.size) problems.push(`memberships cover ${memberOrgs.length} org(s) in ${rows.length} row(s)`);
  if (problems.length) throw new Error(`${persona.alias}: org set is not exactly ${want.size} after reconcile — ${problems.join('; ')}`);
}

/* ── F1 — multi-org boundary personas ─────────────────────────────────────────── */
async function seedMultiOrg(api) {
  log('\n[F1] Multi-org boundary personas (exactly-10 / exactly-11)…');
  // The filler orgs come from organizations.csv (seed:b2b owns them) and are resolved BY ID.
  // Never created here: a miss is a missing prerequisite, and it fails the run.
  const { orgs: declared, errs } = resolveFillerOrgs(loadCsv('test-data/b2b/organizations.csv'));
  if (errs.length) throw new Error(`filler orgs not declared: ${errs.join('; ')}`);
  const orgs = [];
  const missing = [];
  for (const o of declared) {
    const live = await findMemberById(o.id);
    if (live?.id && live.name === o.name) orgs.push(o);
    else missing.push(`${o.key} ${o.name} (${o.id})${live?.id ? ` — live name is "${live.name}"` : ' — not found'}`);
  }
  if (missing.length) throw new Error(`${missing.length} filler org(s) missing on ${TEST_ENV} — run seed:b2b first, never create them here: ${missing.join('; ')}`);
  log(`  resolved ${orgs.length}/${declared.length} filler org(s) by id (organizations.csv)`);

  for (const persona of MULTI_ORG_PERSONAS) {
    const orgSet = orgs.slice(0, persona.orgCount);
    const orgIds = orgSet.map((o) => o.id);
    const contactId = await ensureMembershipContact(persona.email, persona.firstName, persona.lastName, orgIds);
    const userId = await ensureSecurityAccount(persona.email, PW, contactId, 'Approved', { reconcilePassword: RECONCILE });
    await stripSeededGlobalRoles(persona.email);
    if (!DRY_RUN && !isDry(userId)) {
      const existing = await searchMemberships(userId);
      for (const o of orgSet) {
        await ensureOrgMembership(userId, o.id, o.name, BOUNDARY_ROLE.roleId, existing, false, persona.email, 'Approved');
      }
    }
    if (!isDry(contactId)) await ensureExactOrgSet(api, persona, userId, contactId, orgIds);
    log(`  ✓ ${persona.alias}: ${persona.email} → exactly ${orgSet.length} org membership(s)`);
    // Write per persona: a later persona's throw must not orphan this one's aliases.
    if (!DRY_RUN && !isDry(userId)) {
      const entry = { email: persona.email, password: PW_TOKEN, store_id: STORE_ID, userId, contactId, org_count: persona.orgCount, org_ids: orgIds };
      writeEnvAliasOverride(Object.fromEntries([persona.alias, ...persona.extraAliases].map((a) => [a, { ...entry }])));
      log(`  ✓ aliases overlay: ${[persona.alias, ...persona.extraAliases].join(', ')}`);
    }
  }
}

/* ── F2 — isolated 22-address org + admin persona ──────────────────────────────── */
async function seedAddr22(api) {
  log('\n[F2] Isolated 22-address org (AGENT-TEST-Org-Addr22)…');
  const addresses = buildAddr22Addresses();
  const { org: found, dupes } = await resolveAddr22Org(api);
  let org = found;
  if (dupes.length) log(`  ⚠ ${dupes.length} duplicate ${ADDR22_ORG_NAME} org(s) (${dupes.map((d) => d.id).join(', ')}) — npm run seed:edge-cases:teardown -- addr22 removes them`);
  if (org?.id) {
    if (!DRY_RUN) {
      const full = await api('GET', `/api/members/${org.id}`);
      full.addresses = addresses; // idempotent: our disposable org, replace with the canonical 22
      await api('POST', '/api/members', full, { expectStatus: [200, 201, 204] });
    }
    log(`  ↻ org ${ADDR22_ORG_NAME} (${org.id}) → ${addresses.length} addresses`);
  } else if (DRY_RUN) {
    log(`  [DRY] would create org ${ADDR22_ORG_NAME} with ${addresses.length} addresses (none on ${TEST_ENV} — overlay id + exact-name scan)`);
    org = { id: 'dry-addr22' };
  } else {
    const created = await api('POST', '/api/members', {
      memberType: 'Organization', name: ADDR22_ORG_NAME,
      emails: [ADDR22_ORG_EMAIL], phones: ['+1-555-EDGE-022'], status: 'Approved',
      description: 'AGENT-TEST isolated org carrying 22 addresses for checkout address-book pagination (CHK-059/060). NOT shared — safe to teardown wholesale.',
      addresses,
    });
    if (!created?.id) throw new Error(`create org ${ADDR22_ORG_NAME} returned no id`);
    org = { id: created.id };
    // Pin the id at once: it is the idempotency key every re-run and the teardown resolve by.
    writeEnvAliasOverride({ ORG_ADDR22: { org_id: org.id, org_name: ADDR22_ORG_NAME, count: ADDR22_TARGET_TOTAL } });
    log(`  ✓ created org ${ADDR22_ORG_NAME} (${org.id}) with ${addresses.length} addresses`);
  }

  // Org-Admin persona (org-maintainer) so a suite can sign in as a member of this org.
  const a = ADDR22_ADMIN;
  const contactId = await ensureMembershipContact(a.email, a.firstName, a.lastName, isDry(org.id) ? [] : [org.id]);
  const userId = await ensureSecurityAccount(a.email, PW, contactId, 'Approved', { reconcilePassword: RECONCILE });
  await stripSeededGlobalRoles(a.email);
  if (!DRY_RUN && !isDry(userId)) {
    const existing = await searchMemberships(userId);
    await ensureOrgMembership(userId, org.id, ADDR22_ORG_NAME, a.role.roleId, existing, false, a.email, 'Approved');
  }
  log(`  ✓ ${a.alias}: ${a.email} (org-maintainer @ ${ADDR22_ORG_NAME})`);

  if (!DRY_RUN && !isDry(org.id)) {
    writeEnvAliasOverride({
      ORG_ADDR22: { org_id: org.id, org_name: ADDR22_ORG_NAME, count: ADDR22_TARGET_TOTAL },
      [a.alias]: { email: a.email, password: PW_TOKEN, store_id: STORE_ID, userId, contactId },
    });
    log(`  ✓ aliases overlay: ORG_ADDR22, ${a.alias}`);
  }
}

/* ── F3 — Completed order with a discontinued item ─────────────────────────────── */
// DB-backed lookup via /listentries — the ES /catalog/search/products index LAGS right after a create
// (a re-run then tries to re-create and 500s on the unique IX_Code_CatalogId). /listentries reflects
// writes immediately (same reliable path seed-common.findCategoryByCode uses). Falls back to the ES
// search for the (rare) case the product exists but is not a list entry the query returns.
async function findProductByCode(api, code, catalogId = null) {
  try {
    const r = await api('POST', '/api/catalog/listentries', { ...(catalogId ? { catalogId } : {}), keyword: code, take: 50 }, { expectStatus: [200, 201, 400, 404] });
    const entries = r?.listEntries || r?.results || [];
    const hit = entries.find((e) => e.type === 'product' && (e.code === code));
    if (hit?.id) return { id: hit.id, code: hit.code, name: hit.name };
  } catch { /* fall through */ }
  const s = await api('POST', '/api/catalog/search/products', { keyword: code, take: 5, responseGroup: 'ItemInfo' }, { expectStatus: [200, 201] });
  return (s?.items || s?.results || []).find((p) => (p.code || p.sku) === code) || null;
}

/**
 * The dedicated product as the existing F3 order references it (its line with sku === DISC_PRODUCT.code
 * → productId → GET by id). Index-independent, so it finds the product even when the overlay never
 * pinned its id and neither /listentries nor the product search can see it — the case where a
 * code lookup misses and a create would 500 on the unique IX_Code_CatalogId.
 */
async function discProductFromOrder(api) {
  for (const o of await findOrdersByExactNumber(api, DISC_ORDER_NUMBER)) {
    const full = await api('GET', `/api/order/customerOrders/${o.id}`);
    const line = (full?.items || []).find((i) => i.sku === DISC_PRODUCT.code && i.productId);
    if (!line) continue;
    const p = await api('GET', `/api/catalog/products/${line.productId}`, null, { expectStatus: [200, 404] });
    if (p?.id && p.code === DISC_PRODUCT.code) return { id: p.id };
  }
  return null;
}

/** The store's own default currency — the order is placed in it, never in a transcribed code. */
async function storeCurrency(api) {
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`, null, { expectStatus: [200, 404] });
  if (!store?.defaultCurrency) throw new Error(`store ${STORE_ID} has no defaultCurrency on ${TEST_ENV} — cannot place the F3 order`);
  return store.defaultCurrency;
}

async function seedDiscontinued(api) {
  log('\n[F3] Completed order with a discontinued item…');
  // 1) An available shared product (READ ONLY — never mutated) + a catalog to host the dedicated one.
  const discovered = await discoverCatalogProducts(getApi(), 1, { sort: 'code:asc' });
  const available = discovered[0] || null;
  const catalogId = available?.catalogId;
  if (!available && !DRY_RUN) log('  ⚠ no available catalog product discovered — the "available" line falls back to a placeholder');

  // 2) The DEDICATED throwaway product we will discontinue. Idempotency is by the OVERLAY-persisted
  //    product id (a reliable GET-by-id): an unlinked/unindexed product is invisible to both the ES
  //    product search AND /listentries, so a code lookup can't gate the create — a re-run would 500 on
  //    the unique IX_Code_CatalogId. We persist the id the instant it is created, so any re-run reuses
  //    it. The listentries lookup stays as a best-effort fallback for the very first re-run.
  let disc = null;
  const pinnedProductId = readOverlay()?.[DISCONTINUED_ORDER_ALIAS]?.discontinued_product_id;
  if (pinnedProductId) {
    const full = await api('GET', `/api/catalog/products/${pinnedProductId}`, null, { expectStatus: [200, 404] });
    if (full?.id) { disc = { id: full.id }; verbose(`↻ discontinued product via overlay id (${full.id})`); }
  }
  if (!disc) disc = await discProductFromOrder(api);
  if (!disc) disc = await findProductByCode(api, DISC_PRODUCT.code, catalogId);
  if (disc?.id) { log(`  ↻ discontinued product ${DISC_PRODUCT.code} (${disc.id})`); }
  else if (DRY_RUN) { log(`  [DRY] would create product ${DISC_PRODUCT.code}`); disc = { id: 'dry-disc-prod' }; }
  else if (!catalogId) { log('  ⚠ cannot create the dedicated product without a catalogId (no products on env) — skipping F3'); return; }
  else {
    disc = await api('POST', '/api/catalog/products', {
      catalogId, name: DISC_PRODUCT.name, code: DISC_PRODUCT.code,
      productType: 'Physical', vendor: 'QA', isActive: true, isBuyable: true, trackInventory: false,
    }, { expectStatus: [200, 201] });
    log(`  ✓ created dedicated product ${DISC_PRODUCT.code} (${disc?.id})`);
    // Persist immediately — this is the idempotency key for every future re-run.
    if (!isDry(disc?.id)) writeEnvAliasOverride({ [DISCONTINUED_ORDER_ALIAS]: { discontinued_product_id: disc.id } });
  }

  // 3) The AGENT-TEST buyer persona (personal, no org) that owns the order.
  const buyerContactId = await ensureMembershipContact(DISC_BUYER.email, DISC_BUYER.firstName, DISC_BUYER.lastName, []);
  const buyerUserId = await ensureSecurityAccount(DISC_BUYER.email, PW, buyerContactId, 'Approved', { reconcilePassword: RECONCILE });
  await stripSeededGlobalRoles(DISC_BUYER.email);
  log(`  ✓ ${DISC_BUYER.alias}: ${DISC_BUYER.email} (personal buyer)`);
  if (!DRY_RUN && !isDry(buyerUserId)) {
    writeEnvAliasOverride({ [DISC_BUYER.alias]: { email: DISC_BUYER.email, password: PW_TOKEN, store_id: STORE_ID, userId: buyerUserId, contactId: buyerContactId } });
  }

  // 4) The Completed order — EXACT number match (the search keyword is a prefix match, kb
  //    KB-F7E4DB8E); on owner/status drift the replacement is created FIRST, the old one deleted after.
  const hits = (await findOrdersByExactNumber(api, DISC_ORDER_NUMBER))
    .sort((a, b) => String(b.createdDate || '').localeCompare(String(a.createdDate || '')));
  const [existing, ...dupes] = hits;
  let orderId = null;
  let superseded = [...dupes];
  if (existing) {
    const full = await api('GET', `/api/order/customerOrders/${existing.id}`);
    const ownerOk = isDry(buyerUserId) || full?.customerId === buyerUserId;
    if (full?.status === 'Completed' && ownerOk) { orderId = existing.id; log(`  ↻ order ${DISC_ORDER_NUMBER} ok (${orderId})`); }
    else { superseded = [existing, ...dupes]; log(`  order ${DISC_ORDER_NUMBER} ${DRY_RUN ? 'would be rebuilt' : 'rebuilding'} (status=${full?.status}, ownerOk=${ownerOk})`); }
  }
  if (!orderId) {
    if (DRY_RUN) { log(`  [DRY] would create order ${DISC_ORDER_NUMBER} (Completed)`); }
    else {
      const orderBody = buildDiscontinuedOrderBody({
        storeId: STORE_ID, currency: await storeCurrency(api),
        owner: { id: isDry(buyerUserId) ? undefined : buyerUserId, name: `${DISC_BUYER.firstName} ${DISC_BUYER.lastName}`, email: DISC_BUYER.email },
        availableProduct: available,
        discontinuedProduct: !isDry(disc?.id) ? { id: disc.id, sku: DISC_PRODUCT.code, name: DISC_PRODUCT.name, catalogId } : null,
      });
      const created = await api('POST', '/api/order/customerOrders', orderBody);
      if (!created?.id) throw new Error(`order ${DISC_ORDER_NUMBER}: create returned no id — the existing order (if any) was left in place`);
      orderId = created.id;
      log(`  ✓ order ${DISC_ORDER_NUMBER} (Completed) → ${orderId}`);
    }
  }
  if (!DRY_RUN && orderId) {
    writeEnvAliasOverride({
      [DISCONTINUED_ORDER_ALIAS]: { id: orderId, number: DISC_ORDER_NUMBER, discontinued_sku: DISC_PRODUCT.code, ...(isDry(disc?.id) ? {} : { discontinued_product_id: disc.id }) },
    });
  }
  for (const o of superseded) {
    if (o?.number !== DISC_ORDER_NUMBER) continue;
    if (DRY_RUN) { log(`  [DRY] would delete superseded ${DISC_ORDER_NUMBER} ${o.id}`); continue; }
    try { await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] }); log(`  ✗ superseded ${DISC_ORDER_NUMBER} ${o.id}`); }
    catch (e) { log(`  ⚠ could not delete superseded ${DISC_ORDER_NUMBER} ${o.id} (${String(e.message).slice(0, 120)}) — the next run removes it`); }
  }

  // 5) Discontinue the dedicated product AFTER the order captured it (isActive=false, isBuyable=false).
  if (!DRY_RUN && !isDry(disc?.id)) {
    const full = await api('GET', `/api/catalog/products/${disc.id}`, null, { expectStatus: [200, 404] });
    if (full?.id && (full.isActive !== false || full.isBuyable !== false)) {
      full.isActive = false; full.isBuyable = false;
      // Product upsert is POST /api/catalog/products (PUT is 405); posting the full body with its id updates.
      await api('POST', '/api/catalog/products', full, { expectStatus: [200, 201, 204] });
      log(`  ✓ discontinued product ${DISC_PRODUCT.code} (isActive=false, isBuyable=false)`);
    } else verbose('discontinued product already inactive');
  }

  if (!DRY_RUN && orderId) {
    log(`  ✓ aliases overlay: ${DISCONTINUED_ORDER_ALIAS}, ${DISC_BUYER.alias}`);
    log(`  ℹ set ${ENV_FILE} ORDER_WITH_DISCONTINUED_ITEM=${DISC_ORDER_NUMBER} (operator commits)`);
  }
}

/* ── F4 — personal (non-org) replacement ───────────────────────────────────────── */
async function seedPersonal() {
  log('\n[F4] Personal (non-org) replacement for PERSONAL_USER_VIRTO…');
  const p = PERSONAL_NON_ORG;
  const contactId = await ensureMembershipContact(p.email, p.firstName, p.lastName, []);
  const userId = await ensureSecurityAccount(p.email, PW, contactId, 'Approved', { reconcilePassword: RECONCILE });
  await stripSeededGlobalRoles(p.email);
  log(`  ✓ ${p.alias}: ${p.email} (personal, no org)`);
  if (!DRY_RUN && !isDry(userId)) {
    writeEnvAliasOverride({ [p.alias]: { email: p.email, password: PW_TOKEN, store_id: STORE_ID, userId, contactId } });
    log(`  ✓ aliases overlay: ${p.alias}`);
    log(`  ℹ re-point ${ENV_FILE} PERSONAL_USER_VIRTO=${p.email} + PERSONAL_USER_VIRTO_PASSWORD (operator commits)`);
  }
}

/* ── Teardown (bottom-up; deletes ONLY AGENT-TEST entities this domain created) ─── */
async function discProductId(api) {
  let id = readOverlay()?.[DISCONTINUED_ORDER_ALIAS]?.discontinued_product_id || null;
  if (id) { const full = await api('GET', `/api/catalog/products/${id}`, null, { expectStatus: [200, 404] }); if (!full?.id) id = null; }
  if (!id) id = (await discProductFromOrder(api))?.id || null;
  if (!id) { const disc = await findProductByCode(api, DISC_PRODUCT.code); if (disc?.id && (disc.name || '').startsWith('AGENT-TEST')) id = disc.id; }
  return id;
}

async function teardown(api) {
  log('TEARDOWN — removing only edge-case AGENT-TEST fixtures (shared filler orgs are left intact)');
  const overlayNames = [];
  let pinnedProduct = readOverlay()?.[DISCONTINUED_ORDER_ALIAS]?.discontinued_product_id || null;

  if (wants('discontinued')) {
    // order (exact number only) → dedicated product → buyer. The product id is resolved FIRST: the
    // order's line is one of the ways to find it, and the order is about to go.
    const discId = await discProductId(api);
    pinnedProduct = discId;
    for (const o of await findOrdersByExactNumber(api, DISC_ORDER_NUMBER)) {
      await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
      log(`  ✗ order ${DISC_ORDER_NUMBER} ${o.id}`);
    }
    if (discId) {
      try {
        await api('POST', '/api/catalog/listentries/delete', { objectIds: [discId], objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] });
        log(`  ✗ product ${DISC_PRODUCT.code} (${discId})`);
      } catch (e) {
        log(`  ⚠ product ${DISC_PRODUCT.code} (${discId}) NOT deleted: ${String(e.message).slice(0, 160)}`);
      }
    }
    await deleteUserByEmail(DISC_BUYER.email);
    overlayNames.push(DISCONTINUED_ORDER_ALIAS, DISC_BUYER.alias);
  }
  if (wants('addr22')) {
    await deleteUserByEmail(ADDR22_ADMIN.email);
    // Overlay id first, then every exact-name org (duplicates left by the old name-search seeder).
    const { org, dupes } = await resolveAddr22Org(api);
    for (const o of [org, ...dupes].filter(Boolean)) {
      await api('DELETE', `/api/members?ids=${o.id}`, null, { expectStatus: [200, 204, 404] });
      log(`  ✗ org ${ADDR22_ORG_NAME} (${o.id})`);
    }
    overlayNames.push('ORG_ADDR22', ADDR22_ADMIN.alias);
  }
  if (wants('multi-org')) {
    for (const persona of MULTI_ORG_PERSONAS) {
      await deleteUserByEmail(persona.email); // also removes this persona's memberships (not the orgs)
      overlayNames.push(persona.alias, ...persona.extraAliases);
    }
  }
  if (wants('personal')) { await deleteUserByEmail(PERSONAL_NON_ORG.email); overlayNames.push(PERSONAL_NON_ORG.alias); }

  // Residue BEFORE the overlay forgets the ids the residue check resolves by.
  const pinnedOrg = readOverlay()?.ORG_ADDR22?.org_id;
  const residue = await verifyRemoved(async () => {
    let n = 0;
    const emails = [];
    if (wants('discontinued')) {
      emails.push(DISC_BUYER.email);
      n += (await findOrdersByExactNumber(api, DISC_ORDER_NUMBER)).length;
      if (pinnedProduct && (await api('GET', `/api/catalog/products/${pinnedProduct}`, null, { expectStatus: [200, 404] }))?.id) n++;
    }
    if (wants('addr22')) {
      emails.push(ADDR22_ADMIN.email);
      if (pinnedOrg && (await findMemberById(pinnedOrg))?.id) n++;
      n += (await findOrgsByExactName(api, ADDR22_ORG_NAME)).filter((o) => o.id !== pinnedOrg).length;
    }
    if (wants('multi-org')) emails.push(...MULTI_ORG_PERSONAS.map((p) => p.email));
    if (wants('personal')) emails.push(PERSONAL_NON_ORG.email);
    for (const e of emails) if (await findUserByEmail(e)) n++;
    return n;
  });
  if (!residue) removeOverlayAliases(overlayNames);
  log(residue ? `  ⚠ ${residue} edge-case fixture(s) still present after teardown — overlay aliases KEPT so a re-run can find them` : 'Teardown complete — zero residue.');
}

async function main() {
  assertSafeTarget();
  await authenticate();
  await ensureMemberIndex(getApi());
  const api = getApi();
  log(`\n🌱 seed-edge-cases — kind: ${kind}${TEARDOWN ? ' [TEARDOWN]' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (TEARDOWN) { await teardown(api); return; }
  if (wants('multi-org')) await seedMultiOrg(api);
  if (wants('addr22')) await seedAddr22(api);
  if (wants('discontinued')) await seedDiscontinued(api);
  if (wants('personal')) await seedPersonal();
  log(DRY_RUN ? '\nDRY RUN complete (no writes).' : '\nEdge-case seed complete. Runtime GUIDs → aliases.<env>.json.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); if (VERBOSE) console.error(e.stack); process.exit(1); });
