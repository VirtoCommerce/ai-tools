/**
 * seed-org-contract-pricing.mjs — provisions the B2B CONTRACT-PRICING discrimination fixture
 * (VCST-5378 user story 2). Rationale, the measured mechanism and the fixture's own limits live in
 * `org-contract-specs.mjs`; this file is the thin resolve → find-or-create → POST half.
 *
 * WHAT IT CREATES (top-down; teardown reverses it)
 *   1. base pricelist   AGENT-TEST-UCP-Acme-Contract-USD
 *   2. contract         AGENT-TEST-UCP-Acme-Contract (code = the user group its assignments match)
 *   3. link             → module creates <name>-Base (prio 10000) + <name>-Priority (prio 10001)
 *                         assignments, both conditioned on that group, plus the priority pricelist
 *   4. member           the AcmeCorp ORGANISATION joins the contract (group lands on the org)
 *   5. buyer            a DEDICATED AGENT-TEST contact + storefront account inside that org,
 *                         carrying the same group — because xAPI reads groups off the CONTACT,
 *                         not off its organisation (see the LIMITATION block in the spec)
 *   6. prices           the contract tier ladder into the PRIORITY pricelist
 *   7. reindex          the contracted product (Product / documentIds — §5a)
 *
 * FLAGS: --dry-run · --verbose · --teardown · --verify (live two-context price read-back)
 *
 * Usage:
 *   TEST_ENV=vcst npm run seed:org-contract
 *   TEST_ENV=vcst npm run seed:org-contract:verify
 *   TEST_ENV=vcst npm run seed:org-contract:teardown
 */
import {
  STORE_ID, DRY_RUN, TEARDOWN,
  log, verbose, assertSafeTarget, auth, api, loadCsv, loadAliases, writeEnvAliasOverride, verifyRemoved,
  ensureCategoryPath, ensureVirtualCatalog, ensureFulfillmentCenter,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import {
  CONTRACT, CONTRACT_GROUP, BASE_PRICELIST_NAME, ASSORTMENT_PRICELIST_NAME, B2C_CONSUMER_ALIAS,
  CONTRACTED_PRODUCT, CONTROL_PRODUCT, ORG_ONLY_PRODUCT, CONTRACT_BUYER, SEED_PREFIX,
  anonymousTiers, applyGroup, buildAssortmentProductBody, buildBuyerAccountBody,
  buildBuyerContactBody, buildContractBody, buildPriceRows, buildPricelistBody, buildTaggedItemBody,
  contractTiers, isSeededPricingEntity, priceDeltas, validateFixtureShape,
} from './org-contract-specs.mjs';

const argv = process.argv.slice(2);
const VERIFY_ONLY = argv.includes('--verify');

/* ── resolvers ───────────────────────────────────────────────────────────────────────────────── */

/** The contracted organisation's platform id — from the committed CSV, never a literal. */
function orgPlatformId() {
  const rows = loadCsv('test-data/b2b/organizations.csv');
  const row = rows.find((r) => r.org_id === CONTRACT.orgCsvId);
  if (!row?.platform_id) {
    throw new Error(`b2b/organizations.csv has no platform_id for ${CONTRACT.orgCsvId} — @td(${CONTRACT.orgAlias}.platform_id) cannot resolve, so there is no organisation to put on contract`);
  }
  return row.platform_id;
}

/**
 * Resolve a product by EXACT code. `listentries` pages categories and products through one window
 * (categories first), so a truncated response is UNKNOWN, never absence — authoring guide §5a.
 */
async function productByCode(code) {
  const r = await api('POST', '/api/catalog/listentries',
    { responseGroup: 'WithProducts', keyword: code, take: 50, searchInVariations: false },
    { expectStatus: [200] });
  const rows = r?.listEntries || r?.results || [];
  const hit = rows.find((e) => e.code === code && (e.type === 'product' || e.objectType === 'CatalogProduct'));
  if (hit) return { id: hit.id, catalogId: hit.catalog?.id || hit.catalogId };
  if ((r?.totalCount ?? rows.length) > rows.length) {
    throw new Error(`product ${code}: listentries window truncated (${rows.length} of ${r.totalCount}) — treat as UNKNOWN, not absent; narrow the lookup before trusting it`);
  }
  throw new Error(`product ${code} does not exist on this environment — run \`npm run seed:products\` first`);
}

async function findPricelistByName(name) {
  const r = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}&take=200`, null, { expectStatus: [200, 404] });
  return (r?.results || []).find((p) => p.name === name) || null;
}

async function findContract() {
  const r = await api('POST', '/api/contracts/search', { codes: [CONTRACT_GROUP], take: 10 }, { expectStatus: [200] });
  return (r?.results || []).find((c) => c.code === CONTRACT_GROUP) || null;
}

async function findAssignmentsByName() {
  const r = await api('GET', '/api/pricing/assignments?take=500', null, { expectStatus: [200] });
  return (r?.results || []).filter((a) => isSeededPricingEntity(a.name));
}

async function findUser(email) {
  return api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
}

/** Resolve a product by code, returning null instead of throwing when it genuinely does not exist. */
async function findProductByCode(code) {
  try { return await productByCode(code); } catch { return null; }
}

/**
 * The ORG-ONLY assortment product: created, linked into the store's virtual catalog, priced from an
 * UNCONDITIONED pricelist, stocked, then tagged with the contract group so the personalization
 * filter serves it only to a session carrying that group.
 */
async function ensureAssortmentFixture(storeCatalogId) {
  const loc = await ensureCategoryPath(api, ORG_ONLY_PRODUCT.categoryPath);
  let product = await findProductByCode(ORG_ONLY_PRODUCT.sku);
  if (product) verbose(`↻ product ${ORG_ONLY_PRODUCT.sku} (${product.id})`);
  else {
    const created = await api('POST', '/api/catalog/products',
      buildAssortmentProductBody({ catalogId: loc.catalogId, categoryId: loc.categoryId }), { expectStatus: [200, 201] });
    product = { id: created.id, catalogId: loc.catalogId };
    log(`✓ product ${ORG_ONLY_PRODUCT.sku} → ${product.id}`);
  }
  if (loc.catalogId !== storeCatalogId) {
    await api('POST', '/api/catalog/listentrylinks',
      [{ listEntryId: product.id, listEntryType: 'product', catalogId: storeCatalogId, categoryId: loc.categoryId }],
      { expectStatus: [200, 204] });
    verbose(`linked ${ORG_ONLY_PRODUCT.sku} into the store's virtual catalog`);
  }

  // Unconditioned pricelist — see the spec: a group-conditioned one would make the anonymous half
  // fail for "no price" instead of "out of assortment".
  let pl = await findPricelistByName(ASSORTMENT_PRICELIST_NAME);
  if (!pl) {
    pl = await api('POST', '/api/pricing/pricelists',
      buildPricelistBody({ name: ASSORTMENT_PRICELIST_NAME, currency: ORG_ONLY_PRODUCT.currency }), { expectStatus: [200, 201] });
    await api('POST', '/api/pricing/assignments', {
      name: `${ASSORTMENT_PRICELIST_NAME} → ${storeCatalogId}`,
      catalogId: storeCatalogId, pricelistId: pl.id, priority: 150,
      dynamicExpression: { all: true, not: false, id: 'PriceConditionTree', availableChildren: [], children: [] },
    }, { expectStatus: [200, 201] });
    log(`Created ${ASSORTMENT_PRICELIST_NAME} (${pl.id}) + its store-catalog assignment`);
  }
  await api('PUT', '/api/products/prices', [{
    productId: product.id,
    prices: [{ pricelistId: pl.id, productId: product.id, list: ORG_ONLY_PRODUCT.listPrice, minQuantity: 1, currency: ORG_ONLY_PRODUCT.currency }],
  }], { expectStatus: [200, 204] });

  const ffc = await ensureFulfillmentCenter(api);
  if (ffc?.id) {
    await api('PUT', '/api/inventory/plenty', [{
      fulfillmentCenterId: ffc.id, productId: product.id, inStockQuantity: ORG_ONLY_PRODUCT.stockQty, reservedQuantity: 0, status: 'Enabled',
    }], { expectStatus: [200, 204] }).catch((e) => log(`⚠ inventory ${ORG_ONLY_PRODUCT.sku}: ${e.message.slice(0, 110)}`));
  }

  // The tag IS the fixture. PUT creates when the id is absent, so reuse the existing row's id.
  const existing = await api('POST', '/api/personalization/search', { entityIds: [product.id], take: 5 }, { expectStatus: [200] });
  const existingId = existing?.results?.[0]?.id || null;
  await api('PUT', '/api/personalization/taggeditem', buildTaggedItemBody({ productId: product.id, existingId }), { expectStatus: [200, 201, 204] });
  const back = await api('POST', '/api/personalization/search', { entityIds: [product.id], take: 5 }, { expectStatus: [200] });
  const tags = back?.results?.[0]?.tags || [];
  if (!tags.includes(CONTRACT_GROUP)) {
    throw new Error(`${ORG_ONLY_PRODUCT.sku}: the platform stored tags ${JSON.stringify(tags)} — without "${CONTRACT_GROUP}" the product is visible to every session and the assortment half of the fixture proves nothing`);
  }
  log(`✓ ${ORG_ONLY_PRODUCT.sku} tagged ${JSON.stringify(tags)} — org-only assortment`);
  return { ...product, taggedItemId: back.results[0].id, pricelistId: pl.id };
}

/** Add/remove CONTRACT_GROUP on a member, idempotently. Returns true when it wrote. */
async function setMemberGroup(memberId, join) {
  const m = await api('GET', `/api/members/${memberId}`, null, { expectStatus: [200, 404] });
  if (!m) return false;
  const next = applyGroup(m.groups, CONTRACT_GROUP, join);
  const same = next.length === (m.groups || []).length && next.every((g, i) => g === (m.groups || [])[i]);
  if (same) { verbose(`${m.name}: groups already ${join ? 'include' : 'exclude'} ${CONTRACT_GROUP}`); return false; }
  m.groups = next;
  if (!DRY_RUN) await api('PUT', '/api/members', m, { expectStatus: [200, 204] });
  log(`${join ? '+' : '−'} group ${CONTRACT_GROUP} on ${m.memberType} "${m.name}"`);
  return true;
}

/* ── seed ────────────────────────────────────────────────────────────────────────────────────── */

async function seed() {
  const problems = validateFixtureShape();
  if (problems.length) {
    console.error('ABORT: the fixture spec is not discriminating — seeding it would provision a vacuous fixture:');
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }

  const ORG_ID = orgPlatformId();
  log(`Store: ${STORE_ID} | org ${CONTRACT.orgAlias} (${ORG_ID}) | group ${CONTRACT_GROUP}`);

  const contracted = await productByCode(CONTRACTED_PRODUCT.sku);
  const control = await productByCode(CONTROL_PRODUCT.sku);
  log(`Contracted product ${CONTRACTED_PRODUCT.sku} = ${contracted.id} | control ${CONTROL_PRODUCT.sku} = ${control.id}`);

  // 1. base pricelist (find-or-create)
  let basePl = DRY_RUN ? null : await findPricelistByName(BASE_PRICELIST_NAME);
  if (basePl) log(`Reusing base pricelist ${BASE_PRICELIST_NAME} (${basePl.id})`);
  else {
    const r = DRY_RUN ? { id: `dry-${BASE_PRICELIST_NAME}` } : await api('POST', '/api/pricing/pricelists', buildPricelistBody(), { expectStatus: [200, 201] });
    basePl = { id: r.id, name: BASE_PRICELIST_NAME };
    log(`Created base pricelist ${BASE_PRICELIST_NAME} (${basePl.id})`);
  }

  // 2. contract (find-or-create)
  let contract = DRY_RUN ? null : await findContract();
  if (contract) log(`Reusing contract ${CONTRACT.name} (${contract.id})`);
  else {
    const r = DRY_RUN ? { id: `dry-contract` } : await api('POST', '/api/contracts', buildContractBody({ storeId: STORE_ID }), { expectStatus: [200, 201] });
    contract = Array.isArray(r) ? r[0] : r;
    log(`Created contract ${CONTRACT.name} (${contract.id})`);
  }

  // 3. link the pricelist → the module derives BOTH assignments (group-conditioned) + the priority pricelist
  if (!DRY_RUN && !(contract.basePricelistAssignmentId && contract.priorityPricelistAssignmentId)) {
    await api('POST', '/api/contracts/prices/linkpricelist', { contractId: contract.id, pricelistId: basePl.id }, { expectStatus: [200, 201, 204] });
    contract = await api('GET', `/api/contracts/${contract.id}`, null, { expectStatus: [200] });
    log(`Linked ${BASE_PRICELIST_NAME} → base ${contract.basePricelistAssignmentId} / priority ${contract.priorityPricelistAssignmentId}`);
  }

  // The per-product contract prices live in the PRIORITY assignment's pricelist (module-created).
  let priorityPlId = null, baseAsg = null, prioAsg = null;
  if (!DRY_RUN) {
    baseAsg = contract.basePricelistAssignmentId
      ? await api('GET', `/api/pricing/assignments/${contract.basePricelistAssignmentId}`, null, { expectStatus: [200, 404] }) : null;
    prioAsg = contract.priorityPricelistAssignmentId
      ? await api('GET', `/api/pricing/assignments/${contract.priorityPricelistAssignmentId}`, null, { expectStatus: [200, 404] }) : null;
    priorityPlId = prioAsg?.pricelistId || null;
    if (!priorityPlId) throw new Error('contract has no priority pricelist assignment — linkpricelist did not complete, so there is nowhere to write contract prices');
    const cond = JSON.stringify(prioAsg?.dynamicExpression?.children || []);
    if (!cond.includes(CONTRACT_GROUP)) {
      throw new Error(`the priority assignment does not condition on "${CONTRACT_GROUP}" — an UNCONDITIONED contract assignment prices the product for EVERYONE, which destroys the anonymous side of the comparison`);
    }
    verbose(`priority pricelist ${priorityPlId}, conditioned on ${CONTRACT_GROUP}`);
  }

  // 4. the organisation joins the contract (writes the group onto the org member)
  if (!DRY_RUN) {
    await api('POST', '/api/contracts/members/add', { contractId: contract.id, contractCode: CONTRACT_GROUP, memberIds: [ORG_ID] }, { expectStatus: [200, 201, 204] });
    await setMemberGroup(ORG_ID, true);
  }

  // 5. the dedicated contract buyer (contact + storefront account), carrying the same group
  let buyerContactId = null, buyerUserId = null;
  if (!DRY_RUN) {
    const existing = await findUser(CONTRACT_BUYER.email);
    if (existing?.memberId) {
      buyerUserId = existing.id; buyerContactId = existing.memberId;
      log(`Reusing contract buyer ${CONTRACT_BUYER.email} (user ${buyerUserId})`);
    } else {
      const contact = await api('POST', '/api/members', buildBuyerContactBody({ orgPlatformId: ORG_ID }), { expectStatus: [200, 201] });
      buyerContactId = contact.id;
      const password = resolvePassword(CONTRACT_BUYER.password);
      const res = await api('POST', '/api/platform/security/users/create', buildBuyerAccountBody({ contactId: buyerContactId, storeId: STORE_ID, password }), { expectStatus: [200, 201] });
      if (res && res.succeeded === false) throw new Error(`create ${CONTRACT_BUYER.email}: ${JSON.stringify(res.errors)}`);
      buyerUserId = res?.id || (await findUser(CONTRACT_BUYER.email))?.id || null;
      log(`Created contract buyer ${CONTRACT_BUYER.email} (contact ${buyerContactId}, user ${buyerUserId})`);
    }
    // The group on the CONTACT is what the storefront actually reads — see the spec's LIMITATION.
    await setMemberGroup(buyerContactId, true);
  }

  // 6. contract prices → the priority pricelist
  const rows = buildPriceRows({ productId: contracted.id, pricelistId: priorityPlId });
  if (!DRY_RUN) {
    await api('POST', '/api/contracts/prices/products', { contractId: contract.id, prices: rows }, { expectStatus: [200, 201, 204] });
    log(`Wrote ${rows.length} contract price row(s): ${rows.map((r) => `${r.list}@min${r.minQuantity}`).join(', ')}`);
  } else {
    log(`[DRY RUN] would write ${rows.length} contract price row(s): ${rows.map((r) => `${r.list}@min${r.minQuantity}`).join(', ')}`);
  }

  // 7. the ORG-ONLY assortment fixture (personalization-tagged)
  let orgOnly = null;
  if (!DRY_RUN) {
    const storeCatalogId = await ensureVirtualCatalog(api, { storeId: STORE_ID });
    orgOnly = await ensureAssortmentFixture(storeCatalogId);
  } else log(`[DRY RUN] would create ${ORG_ONLY_PRODUCT.sku} tagged ${JSON.stringify(ORG_ONLY_PRODUCT.tags)}`);

  // 8. reindex — the storefront reads prices AND personalization tags off the search index
  // (§5a: documentType 'Product' + documentIds; 'CatalogProduct' is accepted and indexes nothing).
  if (!DRY_RUN) {
    try {
      const ids = [contracted.id, control.id, orgOnly?.id].filter(Boolean);
      await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: ids }], { expectStatus: [200, 201, 202, 204] });
      verbose(`queued Product reindex for ${ids.length} product(s)`);
    } catch (e) {
      log(`⚠ reindex trigger failed (${String(e.message).slice(0, 110)}) — run a Product reindex before reading prices back`);
    }
  }

  // 9. writeback — runtime GUIDs ONLY (business keys and prices stay in the committed spec/aliases)
  writeEnvAliasOverride({
    [ORG_ONLY_PRODUCT.aliasName]: {
      id: orgOnly?.id || '',
      catalog_id: orgOnly?.catalogId || '',
      tagged_item_id: orgOnly?.taggedItemId || '',
      pricelist_id: orgOnly?.pricelistId || '',
    },
    [CONTRACT.aliasName]: {
      id: contract.id || '',
      org_platform_id: ORG_ID,
      pricelist_id: basePl.id || '',
      priority_pricelist_id: priorityPlId || '',
      base_assignment_id: contract.basePricelistAssignmentId || '',
      priority_assignment_id: contract.priorityPricelistAssignmentId || '',
    },
    [CONTRACTED_PRODUCT.aliasName]: { id: contracted.id, catalog_id: contracted.catalogId || '' },
    [CONTROL_PRODUCT.aliasName]: { id: control.id, catalog_id: control.catalogId || '' },
    [CONTRACT_BUYER.aliasName]: { id: buyerUserId || '', contact_id: buyerContactId || '' },
  });

  log(DRY_RUN ? 'DRY RUN complete.' : 'Seed complete.');
  for (const d of priceDeltas()) {
    log(`  qty ${String(d.minQuantity).padStart(2)}+  anonymous ${d.anonymous}  →  contract ${d.contract}  (Δ ${d.delta})`);
  }
  if (!DRY_RUN) log('Prove it live: npm run seed:org-contract:verify');
}

/* ── verify (live, two contexts) ─────────────────────────────────────────────────────────────── */

/**
 * Read the contracted product's price back ANONYMOUSLY and as the contract buyer, and the control
 * product in both contexts. A fixture nobody read back is a declaration, not a fixture.
 *
 * The buyer bearer is minted through the storefront password grant, which needs the `storeId` form
 * field — without it the platform answers 400 `user_cannot_login_in_store`, which reads like a
 * disabled account. Tokens are held in memory only and never written to disk.
 */
async function verifyLive() {
  const FRONT = (process.env.FRONT_URL || '').replace(/\/+$/, '');
  const BACK = (process.env.BACK_URL || '').replace(/\/+$/, '');
  const password = resolvePassword(CONTRACT_BUYER.password);

  const tokRes = await fetch(`${FRONT}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: CONTRACT_BUYER.email, password, scope: 'offline_access', storeId: STORE_ID }),
  });
  if (!tokRes.ok) {
    throw new Error(`contract buyer sign-in failed: ${tokRes.status} ${(await tokRes.text()).slice(0, 180)}`);
  }
  const token = (await tokRes.json()).access_token;
  const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;

  // NOTE: xAPI hangs on an explicit empty `userId:""`; omit the argument for the anonymous read.
  const read = async (productId, bearer) => {
    const q = `{ product(id:"${productId}", storeId:"${STORE_ID}"${bearer ? `, userId:"${userId}"` : ''}, currencyCode:"${CONTRACT.currency}", cultureName:"en-US"){ code price{ list{amount} actual{amount} } } }`;
    const r = await fetch(`${BACK}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({ query: q }),
    });
    const j = await r.json();
    if (j.errors) throw new Error(`xAPI: ${j.errors.map((e) => e.message).join('; ').slice(0, 200)}`);
    return j.data?.product;
  };

  // Search, not a by-id fetch: personalization filters the SEARCH path, which is what a shopper and
  // a UCP `search_products` call both go through.
  const search = async (phrase, bearer) => {
    const q = `{ products(storeId:"${STORE_ID}"${bearer ? `, userId:"${userId}"` : ''}, currencyCode:"${CONTRACT.currency}", cultureName:"en-US", query:${JSON.stringify(phrase)}, first:10){ totalCount items{ code } } }`;
    const r = await fetch(`${BACK}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({ query: q }),
    });
    const j = await r.json();
    if (j.errors) throw new Error(`xAPI: ${j.errors.map((e) => e.message).join('; ').slice(0, 200)}`);
    return (j.data?.products?.items || []).map((i) => i.code);
  };

  const contracted = await productByCode(CONTRACTED_PRODUCT.sku);
  const control = await productByCode(CONTROL_PRODUCT.sku);

  const cAnon = await read(contracted.id, null);
  const cOrg = await read(contracted.id, token);
  const kAnon = await read(control.id, null);
  const kOrg = await read(control.id, token);

  const expectAnon = anonymousTiers()[0].amount;
  const expectContract = contractTiers()[0].amount;
  const fails = [];

  log(`CONTRACTED ${CONTRACTED_PRODUCT.sku}: anonymous ${cAnon?.price?.actual?.amount} | contract buyer ${cOrg?.price?.actual?.amount}`);
  log(`CONTROL    ${CONTROL_PRODUCT.sku}: anonymous ${kAnon?.price?.actual?.amount} | contract buyer ${kOrg?.price?.actual?.amount}`);

  if (cAnon?.price?.actual?.amount !== expectAnon) fails.push(`anonymous read ${cAnon?.price?.actual?.amount} != expected list ${expectAnon}`);
  if (cOrg?.price?.actual?.amount !== expectContract) fails.push(`contract-buyer read ${cOrg?.price?.actual?.amount} != expected contract ${expectContract}`);
  if (cAnon?.price?.actual?.amount === cOrg?.price?.actual?.amount) fails.push('the two contexts read the SAME price — the fixture does not discriminate (test-data.md SECOND RULE)');
  if (kAnon?.price?.actual?.amount !== kOrg?.price?.actual?.amount) {
    fails.push(`control ${CONTROL_PRODUCT.sku} differs across contexts (${kAnon?.price?.actual?.amount} vs ${kOrg?.price?.actual?.amount}) — the buyer is getting a blanket discount, not contract pricing`);
  }

  // Assortment half.
  const phrase = ORG_ONLY_PRODUCT.name;
  const sAnon = await search(phrase, null);
  const sOrg = await search(phrase, token);
  const oAnon = await read((await productByCode(ORG_ONLY_PRODUCT.sku)).id, null);
  log(`ASSORTMENT ${ORG_ONLY_PRODUCT.sku}: anonymous search ${JSON.stringify(sAnon)} | contract buyer search ${JSON.stringify(sOrg)}`);

  // Third context: an AUTHENTICATED buyer who is NOT on the contract (VCST-5378 story 1's consumer).
  // Rules out "authentication itself triggers the discount", which the anonymous side cannot.
  const b2c = loadAliases()[B2C_CONSUMER_ALIAS];
  if (!b2c?.email) log(`⚠ ${B2C_CONSUMER_ALIAS} is not registered — skipping the B2C consumer context`);
  else {
    try {
      const pw = resolvePassword(b2c.password);
      const r = await fetch(`${FRONT}/connect/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'password', username: b2c.email, password: pw, scope: 'offline_access', storeId: b2c.store_id || STORE_ID }),
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
      const bt = (await r.json()).access_token;
      const bUid = JSON.parse(Buffer.from(bt.split('.')[1], 'base64url').toString()).sub;
      const bq = `{ product(id:"${contracted.id}", storeId:"${STORE_ID}", userId:"${bUid}", currencyCode:"${CONTRACT.currency}", cultureName:"en-US"){ price{ actual{amount} } } }`;
      const br = await fetch(`${BACK}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bt}` }, body: JSON.stringify({ query: bq }) });
      const amount = (await br.json())?.data?.product?.price?.actual?.amount;
      log(`B2C CONSUMER (@td(${B2C_CONSUMER_ALIAS}), no organisation): ${CONTRACTED_PRODUCT.sku} = ${amount}`);
      if (amount !== expectAnon) fails.push(`the non-contracted authenticated consumer reads ${amount}, not the anonymous ladder's ${expectAnon} — the discount is not contract-scoped`);
      writeEnvAliasOverride({ [CONTRACTED_PRODUCT.aliasName]: { b2c_consumer_price_at_seed: String(amount ?? '') } });
    } catch (e) {
      log(`⚠ B2C consumer context skipped: ${String(e.message).slice(0, 140)}`);
    }
  }
  if (sAnon.includes(ORG_ONLY_PRODUCT.sku)) fails.push(`${ORG_ONLY_PRODUCT.sku} IS visible to an anonymous search — the personalization tag is not scoping it`);
  if (!sOrg.includes(ORG_ONLY_PRODUCT.sku)) fails.push(`${ORG_ONLY_PRODUCT.sku} is NOT visible to the contract buyer — the fixture is invisible to everyone rather than org-scoped`);
  if (oAnon) fails.push(`${ORG_ONLY_PRODUCT.sku} resolves anonymously by id (${oAnon.code}) — out-of-assortment must not be readable`);

  writeEnvAliasOverride({
    [CONTRACTED_PRODUCT.aliasName]: {
      anonymous_price_at_seed: String(cAnon?.price?.actual?.amount ?? ''),
      contract_price_at_seed: String(cOrg?.price?.actual?.amount ?? ''),
    },
    [CONTROL_PRODUCT.aliasName]: { price_at_seed: String(kAnon?.price?.actual?.amount ?? '') },
    [ORG_ONLY_PRODUCT.aliasName]: {
      anonymous_visible_at_seed: String(sAnon.includes(ORG_ONLY_PRODUCT.sku)),
      contract_visible_at_seed: String(sOrg.includes(ORG_ONLY_PRODUCT.sku)),
    },
  });

  if (fails.length) { for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1); }
  log('✓ live read-back: the contract price and the anonymous price differ, the control product does not,');
  log('  and the org-only product is served to the contract buyer and withheld from an anonymous session.');
}

/* ── teardown (reverse order; DELETE /api/contracts does NOT cascade) ────────────────────────── */

async function teardown() {
  const ORG_ID = orgPlatformId();

  // buyer first (bottom-up): account + contact
  const user = await findUser(CONTRACT_BUYER.email);
  if (user?.id && !DRY_RUN) {
    const contactId = user.memberId;
    await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(CONTRACT_BUYER.email)}`, null, { expectStatus: [200, 204, 404] });
    if (contactId) await api('DELETE', `/api/members?ids=${encodeURIComponent(contactId)}`, null, { expectStatus: [200, 204, 404] });
    log(`Removed contract buyer ${CONTRACT_BUYER.email}`);
  } else log(`No contract buyer account to remove`);

  // The org-only assortment product: clear its tag FIRST (an orphaned tag would keep scoping
  // whatever product id is reused), then delete the product.
  if (!DRY_RUN) {
    const orgOnly = await findProductByCode(ORG_ONLY_PRODUCT.sku);
    if (orgOnly?.id) {
      const tagged = await api('POST', '/api/personalization/search', { entityIds: [orgOnly.id], take: 5 }, { expectStatus: [200] });
      for (const t of (tagged?.results || [])) {
        await api('PUT', '/api/personalization/taggeditem', buildTaggedItemBody({ productId: orgOnly.id, existingId: t.id, tags: [] }), { expectStatus: [200, 201, 204] });
      }
      await api('DELETE', `/api/catalog/products?ids=${orgOnly.id}`, null, { expectStatus: [200, 204, 404] });
      log(`Removed ${ORG_ONLY_PRODUCT.sku} (tags cleared, product deleted)`);
    }
  }

  const contract = DRY_RUN ? null : await findContract();
  if (contract) {
    if (!DRY_RUN) {
      try { await api('POST', '/api/contracts/members/delete', { contractId: contract.id, contractCode: CONTRACT_GROUP, memberIds: [ORG_ID] }, { expectStatus: [200, 201, 204] }); } catch { /* member may already be gone */ }
      await api('DELETE', `/api/contracts?ids=${contract.id}`, null, { expectStatus: [200, 204, 404] });
    }
    log(`Deleted contract ${CONTRACT.name}`);
  }
  // The organisation keeps every other group it legitimately carries.
  await setMemberGroup(ORG_ID, false);

  // Assignments and pricelists survive the contract's deletion — sweep them by our own names.
  if (!DRY_RUN) {
    const asgs = await findAssignmentsByName();
    for (const a of asgs) {
      await api('DELETE', `/api/pricing/assignments?ids=${a.id}`, null, { expectStatus: [200, 204, 404] });
      log(`Deleted assignment ${a.name}`);
    }
    const pls = await api('GET', '/api/pricing/pricelists?take=500', null, { expectStatus: [200] });
    for (const p of (pls?.results || []).filter((x) => isSeededPricingEntity(x.name))) {
      await api('DELETE', `/api/pricing/pricelists?ids=${p.id}`, null, { expectStatus: [200, 204, 404] });
      log(`Deleted pricelist ${p.name}`);
    }
  }

  const residue = await verifyRemoved(async () => {
    const [asgs, pls, c, u, org, orgOnly] = await Promise.all([
      findAssignmentsByName(),
      api('GET', '/api/pricing/pricelists?take=500', null, { expectStatus: [200] }),
      findContract(),
      findUser(CONTRACT_BUYER.email),
      api('GET', `/api/members/${ORG_ID}`, null, { expectStatus: [200, 404] }),
      findProductByCode(ORG_ONLY_PRODUCT.sku),
    ]);
    return [
      ...asgs,
      ...((pls?.results || []).filter((x) => isSeededPricingEntity(x.name))),
      ...(c ? [c] : []),
      ...(u ? [u] : []),
      ...(orgOnly ? [{ name: ORG_ONLY_PRODUCT.sku }] : []),
      ...(((org?.groups) || []).includes(CONTRACT_GROUP) ? [{ name: `${SEED_PREFIX} group still on ${org.name}` }] : []),
    ];
  });
  if (residue) { console.error(`TEARDOWN INCOMPLETE: ${residue} residual entit(y/ies) — re-run, then inspect.`); process.exit(1); }
  log('Teardown complete — zero residue.');
}

/* ── main ────────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) return teardown();
  if (VERIFY_ONLY) return verifyLive();
  await seed();
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
