/**
 * barcode-specs.mjs — SINGLE SOURCE OF TRUTH for the VCST-2945 barcode-scanner search fixtures.
 * Side-effect-free (no env, no network, no fs) so the seeder, the drift guard and the unit tests all
 * import the SAME rules.
 *
 * WHAT THE FEATURE DOES (pr909 catalog + pr113 x-catalog + pr2501 theme)
 * ----------------------------------------------------------------------
 * A store carries two settings — Catalog.Search.BarcodeScannerEnabled and BarcodeSearchFields. With no
 * fields a scanned code runs the old full-text search (VCST-2622). With fields, the storefront sends
 * `barcode:"<v>"`, which xCatalog rewrites into an OR of exact term filters over the configured index
 * fields (code / gtin / manufacturerPartNumber / lowercased short-text Product|Variation properties)
 * and widens `is:product` to `is:product,variation`.
 *
 * WHY EACH FIXTURE EXISTS (SECOND RULE — every one makes a link DECIDABLE)
 * ------------------------------------------------------------------------
 * The live env could not answer any of the chain's questions: 35 of 4 749 products carry a GTIN, seven
 * of them share one value in a catalog B2B-store does not expose, no variation has a GTIN and one
 * product has an MPN. So each fixture below is built so the right and the wrong implementation give
 * DIFFERENT observations:
 *
 *   GTIN_UNIQUE    exactly one product holds this GTIN → exact mode must open it (1 hit).
 *   FULLTEXT       G is P1's GTIN AND a whole word in P2's NAME → full text finds ≥2, exact-on-gtin finds 1.
 *                  Equal counts would mean the mode switch changed nothing observable.
 *   GTIN_SHARED    three products share one GTIN → exact mode must LIST, never auto-open (N hits).
 *   CODE_OR        its code is a scan value no GTIN holds, its GTIN differs from GTIN_UNIQUE's → with
 *                  fields [gtin, code] BOTH values must hit; a first-field-only (or AND) build finds 0.
 *   PROP           a Product-type short-text property value on one product → only the lowercased
 *                  property field matches it; it must appear in GET …/barcode-search/store/{id}/fields.
 *   VARIATION_MPN  only the VARIATION carries the MPN and it is OUT OF STOCK while its parent and
 *                  sibling are in stock → a build that does not widen to variations, or that applies
 *                  the in-stock preference, finds nothing.
 *   CASE           a mixed-case code with a strict prefix that must NOT match → separates exact term
 *                  compare from prefix/contains and exposes the provider's case handling. `valueFlipped`
 *                  (every letter's case inverted — DERIVED by flipCase, never transcribed) is the scan a
 *                  case-insensitivity case sends; it shares no letter-case with `value`.
 *   SPECIAL        a QR-like value with `"` and `:` on PROP's property → the escaping path.
 *   REINDEX        a per-seed product whose GTIN a test changes (old must stop, new must start matching).
 *   STALE_FIELD    a second property holding a unique value on its OWN disposable product. A case configures
 *                  it, scans the value (1 hit), DELETES the property, and scans again (0) — without ever
 *                  touching PROP's property, which ~10 other cases read. The next seed re-creates both the
 *                  property and the product's value.
 *   BARCODE_STORE  a dedicated store on B2B-store's catalog: API/xAPI cases own ITS settings, so no
 *                  case ever writes B2B-store's (shared by every runner).
 *
 * WHAT THESE FIXTURES CANNOT DECIDE (stated, not hidden)
 * ------------------------------------------------------
 *   - Provider case folding: vcst-qa's active provider is case-INSENSITIVE (observed 2026-09-28); the
 *     Lucene path (case-sensitive) is not reachable here, so CASE decides "exact vs prefix" but only
 *     one side of "case handling follows the provider".
 *   - BARCODE_STORE's settings are fixture state OWNED BY TESTS: two cases writing them concurrently
 *     collide. Serialise them, and re-seed (which resets scannerEnabled=true, fields=[]) between suites.
 *   - REINDEX / STALE_FIELD are DISPOSABLE per seed: a test mutates them; the next seed restores them.
 *   - Index freshness is NOT automatic here: with Catalog.Search.EventBasedIndexation.Enable=false a
 *     product save or delete does not reach the index by itself. The seeder indexes what it writes and
 *     purges the documents of what it deletes (deletionWindows below); a CASE that mutates a fixture
 *     (REINDEX's gtin, STALE_FIELD's property) must trigger the indexation for its own change.
 *
 * NAMING: products/stores/pricelists carry `AGENT-TEST-` on their NAME; property names must be index-
 * field-safe identifiers (the field name is used verbatim inside a filter expression, where a hyphen is
 * a hazard), so they carry `AGENT_TEST_` instead. Teardown matches exactly these.
 * GTINs use the GS1 restricted-circulation range (prefix 2…) so no real trade item can collide.
 * RUNTIME IDS: product / property / catalog / pricelist GUIDs → aliases.<env>.json only, never here.
 *
 * BARCODE IMAGES (test-data/uploads/barcodes/*.png) were generated ONCE, outside the repo, with
 * bwip-js (EAN-13 / Code 128 / QR) and each was decoded back with zxing-wasm — the library the
 * storefront's `barcode-detector` ponyfill wraps — before being committed. Each PNG carries a tEXt
 * chunk `barcode-value` holding the value it encodes; the drift guard compares that chunk with the
 * spec below, so a changed value with a stale image fails loudly. Regenerate recipe (scratch dir, not
 * the repo): `npm i bwip-js zxing-wasm`, `bwipjs.toBuffer({ bcid, text, scale: 4, includetext: true,
 * paddingwidth: 12, paddingheight: 12 })`, decode with `readBarcodes(buf)`, add the tEXt chunk.
 */

import { productSlug, storefrontPathForAdHoc } from '../products/standard-specs.mjs';

export const SEED_PREFIX = 'AGENT-TEST';
export const PROPERTY_PREFIX = 'AGENT_TEST_';
export const CATEGORY_PATH = 'Test Fixtures';
export const PRICELIST_NAME = 'AGENT-TEST-Barcode-USD';
export const CURRENCY = 'USD';
export const IMAGE_DIR = 'test-data/uploads/barcodes';
/** Every product name starts with this — the admin full-text probe that counts index documents uses it. */
export const NAME_STEM = `${SEED_PREFIX}-Barcode`;

/** Runtime, server-assigned values — they live ONLY in aliases.<env>.json. */
export const RUNTIME_FIELDS = ['id', 'ids', 'variationId', 'parentId', 'siblingId', 'catalogId', 'propertyId', 'otherId'];

/* ── GTIN arithmetic (derived — this is what the unit test exercises) ─────────────────────────── */

/** GS1 mod-10 check digit for a 12-digit EAN-13 body (also UPC-A via a leading 0). */
export function ean13CheckDigit(body12) {
  const s = String(body12);
  if (!/^\d{12}$/.test(s)) throw new Error(`ean13CheckDigit: expected 12 digits, got "${s}"`);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/** Full EAN-13 for a 12-digit body. */
export const ean13 = (body12) => `${body12}${ean13CheckDigit(body12)}`;

/** True when `code` is 13 digits with a correct check digit. */
export function isValidEan13(code) {
  const s = String(code ?? '');
  return /^\d{13}$/.test(s) && ean13CheckDigit(s.slice(0, 12)) === s[12];
}

/** 12-digit UPC-A for an 11-digit body (UPC-A is EAN-13 with an implied leading 0). */
export const upcA = (body11) => {
  if (!/^\d{11}$/.test(String(body11))) throw new Error(`upcA: expected 11 digits, got "${body11}"`);
  return `${body11}${ean13CheckDigit(`0${body11}`)}`;
};

/* ── the fixture set ─────────────────────────────────────────────────────────────────────────── */

export const STORE = {
  aliasName: 'BARCODE_STORE',
  id: 'AGENT-TEST-BARCODE',
  name: 'AGENT-TEST-Barcode-Store',
  /**
   * Deliberately NOT FRONT_URL: a second store answering to the live storefront's host could take over
   * domain-based store resolution. This store is only ever reached by storeId (REST + xAPI).
   */
  url: 'https://agent-test-barcode-store.example.com',
  /** The per-seed reset state — what the store's barcode settings are after every seed. */
  barcodeDefaults: { scannerEnabled: true, fields: [] },
};

export const PROPERTIES = {
  upc: { key: 'upc', name: `${PROPERTY_PREFIX}BARCODE_UPC`, type: 'Product', valueType: 'ShortText' },
  stale: { key: 'stale', name: `${PROPERTY_PREFIX}BARCODE_STALE`, type: 'Product', valueType: 'ShortText' },
};

/** The name GET …/barcode-search/store/{id}/fields lists a property under (pr909: lowercased). */
export const indexFieldName = (propertyName) => String(propertyName).toLowerCase();

const G_UNIQUE = ean13('294510000001');
const G_FULLTEXT = ean13('294520000001');
const G_SHARED = ean13('294530000001');
const G_CODE_OR = ean13('294540000001');
const G_REINDEX = ean13('294560000001');
const G_REINDEX_NEW = ean13('294560000002');
const UPC_VALUE = upcA('29450000008');
const SPECIAL_VALUE = 'QR:2945"SN"07';
const MPN_VALUE = 'MPN-2945-VAR-A';
const CASE_VALUE = 'QaBc-2945-MiXeD';
const STALE_VALUE = 'QABC-STALE-2945-016';

/**
 * Every product the seeder creates. `role` ties a product to its fixture; `stock` is the quantity on
 * the store's fulfillment center (0 = explicitly out of stock); `props` maps a PROPERTIES key → value.
 */
export const PRODUCTS = [
  { role: 'gtinUnique', sku: 'QA-BC-2945-001', name: 'AGENT-TEST-Barcode-GTIN-Unique', gtin: G_UNIQUE, listPrice: 24.95, stock: 40 },
  { role: 'fulltextTarget', sku: 'QA-BC-2945-002', name: 'AGENT-TEST-Barcode-Fulltext-Target', gtin: G_FULLTEXT, listPrice: 19.5, stock: 25 },
  // The decoy's NAME carries G as a whole, space-delimited word; it has no GTIN of its own.
  { role: 'fulltextDecoy', sku: 'QA-BC-2945-003', name: `AGENT-TEST-Barcode Fulltext Decoy ${G_FULLTEXT}`, listPrice: 21.0, stock: 25 },
  { role: 'shared', sku: 'QA-BC-2945-004', name: 'AGENT-TEST-Barcode-Shared-GTIN-A', gtin: G_SHARED, listPrice: 11.0, stock: 30 },
  { role: 'shared', sku: 'QA-BC-2945-005', name: 'AGENT-TEST-Barcode-Shared-GTIN-B', gtin: G_SHARED, listPrice: 12.0, stock: 30 },
  { role: 'shared', sku: 'QA-BC-2945-006', name: 'AGENT-TEST-Barcode-Shared-GTIN-C', gtin: G_SHARED, listPrice: 13.0, stock: 30 },
  { role: 'codeOr', sku: 'QA-BC-2945-007', name: 'AGENT-TEST-Barcode-Code-OR', gtin: G_CODE_OR, listPrice: 17.25, stock: 20 },
  { role: 'prop', sku: 'QA-BC-2945-008', name: 'AGENT-TEST-Barcode-Property-UPC', props: { upc: UPC_VALUE }, listPrice: 33.0, stock: 20 },
  { role: 'variationParent', sku: 'QA-BC-2945-010', name: 'AGENT-TEST-Barcode-Variation-Parent', listPrice: 45.0, stock: 10 },
  { role: 'variationMpn', parent: 'QA-BC-2945-010', sku: 'QA-BC-2945-011', name: 'AGENT-TEST-Barcode-Variation-MPN', mpn: MPN_VALUE, listPrice: 45.0, stock: 0 },
  { role: 'variationSibling', parent: 'QA-BC-2945-010', sku: 'QA-BC-2945-012', name: 'AGENT-TEST-Barcode-Variation-Sibling', listPrice: 45.0, stock: 15 },
  { role: 'case', sku: CASE_VALUE, name: 'AGENT-TEST-Barcode-Mixed-Case', listPrice: 9.99, stock: 20 },
  { role: 'special', sku: 'QA-BC-2945-014', name: 'AGENT-TEST-Barcode-Special-QR', props: { upc: SPECIAL_VALUE }, listPrice: 14.0, stock: 20 },
  { role: 'reindex', sku: 'QA-BC-2945-015', name: 'AGENT-TEST-Barcode-Reindex', gtin: G_REINDEX, listPrice: 8.0, stock: 20 },
  // Dedicated to STALE_FIELD: nothing else reads this product, so a case may delete its property.
  { role: 'stale', sku: 'QA-BC-2945-016', name: 'AGENT-TEST-Barcode-Stale-Field', props: { stale: STALE_VALUE }, listPrice: 7.5, stock: 20 },
];

/** The barcode images committed next to the fixtures: file → { symbology, value }. */
export const IMAGES = {
  gtinUnique: { file: 'barcode-gtin-unique-ean13.png', bcid: 'ean13', value: G_UNIQUE },
  fulltext: { file: 'barcode-fulltext-ean13.png', bcid: 'ean13', value: G_FULLTEXT },
  shared: { file: 'barcode-gtin-shared-ean13.png', bcid: 'ean13', value: G_SHARED },
  mpn: { file: 'barcode-variation-mpn-code128.png', bcid: 'code128', value: MPN_VALUE },
  special: { file: 'barcode-special-qr.png', bcid: 'qrcode', value: SPECIAL_VALUE },
};
export const imagePath = (key) => `${IMAGE_DIR}/${IMAGES[key].file}`;

const bySku = (sku) => PRODUCTS.find((p) => p.sku === sku);
const byRole = (role) => PRODUCTS.filter((p) => p.role === role);

/** A product's store-relative storefront path under CATEGORY_PATH (derived, never hand-written). */
export const productUrl = (p) => storefrontPathForAdHoc(CATEGORY_PATH, p.name);

/**
 * The STATIC half of every alias — business keys only. The seeder writes the runtime half (ids) to
 * aliases.<env>.json; the guard asserts test-data/aliases.json carries exactly these values.
 */
export function aliasStaticFields() {
  const one = (role) => byRole(role)[0];
  const u = one('gtinUnique');
  const ft = one('fulltextTarget');
  const fd = one('fulltextDecoy');
  const shared = byRole('shared');
  const or = one('codeOr');
  const prop = one('prop');
  const vm = one('variationMpn');
  const cs = one('case');
  const sp = one('special');
  const ri = one('reindex');
  const st = one('stale');
  return {
    BARCODE_STORE: { id: STORE.id, name: STORE.name },
    BARCODE_GTIN_UNIQUE: { sku: u.sku, gtin: u.gtin, slug: productSlug(u.name), url: productUrl(u), image: imagePath('gtinUnique') },
    BARCODE_FULLTEXT_DISCRIM: { gtin: ft.gtin, sku: ft.sku, otherSku: fd.sku, image: imagePath('fulltext') },
    BARCODE_GTIN_SHARED: { gtin: shared[0].gtin, count: String(shared.length), skus: shared.map((p) => p.sku).join(','), image: imagePath('shared') },
    BARCODE_CODE_OR: { sku: or.sku, gtin: or.gtin },
    BARCODE_PROP: { propertyName: indexFieldName(PROPERTIES.upc.name), catalogPropertyName: PROPERTIES.upc.name, value: prop.props.upc, sku: prop.sku },
    BARCODE_VARIATION_MPN: { parentSku: vm.parent, variationSku: vm.sku, siblingSku: one('variationSibling').sku, mpn: vm.mpn, image: imagePath('mpn') },
    BARCODE_CASE: { value: cs.sku, valueFlipped: flipCase(cs.sku), prefix: casePrefix(cs.sku), sku: cs.sku },
    BARCODE_SPECIAL: { value: sp.props.upc, sku: sp.sku, image: imagePath('special') },
    BARCODE_REINDEX: { sku: ri.sku, gtin: ri.gtin, newGtin: G_REINDEX_NEW },
    BARCODE_STALE_FIELD: { name: indexFieldName(PROPERTIES.stale.name), catalogPropertyName: PROPERTIES.stale.name, value: st.props.stale, sku: st.sku },
  };
}

/** Invert the case of every cased character (upper↔lower); uncased characters pass through. */
export const flipCase = (value) => [...String(value)]
  .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
  .join('');

/** The strict prefix of a mixed-case value a case asserts does NOT match: drop the last segment. */
export function casePrefix(value) {
  const s = String(value);
  const cut = s.lastIndexOf('-');
  return cut > 0 ? s.slice(0, cut) : s.slice(0, Math.max(1, s.length - 1));
}

/* ── request builders (pure — the caller supplies resolved ids) ───────────────────────────────── */

/** POST /api/stores body for the dedicated store, copying the live store's resolution roots. */
export function buildStoreBody(source) {
  if (!source?.catalog) throw new Error('buildStoreBody: source store has no catalog');
  if (!source.defaultLanguage || !source.defaultCurrency) throw new Error('buildStoreBody: source store has a null default language/currency');
  const currencies = [source.defaultCurrency];
  const languages = [source.defaultLanguage];
  return {
    id: STORE.id,
    name: STORE.name,
    storeState: 'Open',
    catalog: source.catalog,
    defaultLanguage: source.defaultLanguage,
    languages,
    defaultCurrency: source.defaultCurrency,
    currencies,
    url: STORE.url,
    email: source.email || 'noreply@example.com',
    timeZone: source.timeZone ?? null,
    mainFulfillmentCenterId: source.mainFulfillmentCenterId ?? null,
    additionalFulfillmentCenterIds: [...(source.additionalFulfillmentCenterIds || [])],
  };
}

/**
 * The fields an existing dedicated store must still agree on. Returns the drifted field names — the
 * seeder GET-merge-PUTs the whole entity only when this is non-empty (whole-entity PUT replaces).
 */
export function storeDrift(existing, source) {
  const want = buildStoreBody(source);
  return ['catalog', 'defaultLanguage', 'defaultCurrency', 'url', 'email', 'mainFulfillmentCenterId']
    .filter((k) => (existing?.[k] ?? null) !== (want[k] ?? null))
    .concat((existing?.currencies || []).includes(want.defaultCurrency) ? [] : ['currencies'])
    .concat((existing?.languages || []).includes(want.defaultLanguage) ? [] : ['languages']);
}

/** POST /api/catalog/properties body. */
export function buildPropertyBody(prop, catalogId) {
  return {
    isNew: true, name: prop.name, catalogId, type: prop.type, valueType: prop.valueType,
    dictionary: false, required: false, multivalue: false, multilanguage: false,
  };
}

/** POST /api/catalog/products body (create). `mainProductId` only for a variation. */
export function buildProductBody(p, { catalogId, categoryId, mainProductId = null, storeId }) {
  const body = {
    catalogId, categoryId,
    name: p.name, code: p.sku,
    productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: true,
    gtin: p.gtin || null,
    manufacturerPartNumber: p.mpn || null,
    seoInfos: [{ storeId, languageCode: 'en-US', semanticUrl: productSlug(p.name), pageTitle: p.name, isActive: true }],
  };
  if (mainProductId) body.mainProductId = mainProductId;
  return body;
}

/**
 * Apply the spec's scan fields onto a product read back from the API (GET → mutate → POST). Returns
 * the changed field names so the seeder writes only when something drifted — this is also how a
 * per-seed fixture a test mutated (REINDEX's gtin) is restored.
 */
export function reconcileProduct(full, p, propsByKey = {}) {
  const changed = [];
  const want = { gtin: p.gtin || null, manufacturerPartNumber: p.mpn || null };
  for (const [k, v] of Object.entries(want)) {
    if ((full[k] || null) !== v) { full[k] = v; changed.push(k); }
  }
  for (const [key, value] of Object.entries(p.props || {})) {
    const def = propsByKey[key];
    if (!def?.id) throw new Error(`reconcileProduct: property "${key}" has no resolved id`);
    full.properties = full.properties || [];
    let prop = full.properties.find((x) => x.id === def.id || x.name === def.name);
    if (!prop) { prop = { id: def.id, name: def.name, type: def.type, valueType: def.valueType, values: [] }; full.properties.push(prop); }
    const cur = (prop.values || []).map((v) => v.value);
    if (cur.length !== 1 || cur[0] !== value) {
      prop.values = [{ propertyId: def.id, propertyName: def.name, value, valueType: def.valueType }];
      changed.push(`property:${def.name}`);
    }
  }
  return changed;
}

/** The inventory write per product (store fulfillment center). Pure. */
export const stockPlan = () => PRODUCTS.map((p) => ({ sku: p.sku, quantity: p.stock }));

/** The expected live hit count per exact filter — what the seeder's xAPI proof asserts. Pure. */
export function expectedExactHits() {
  const count = (pred) => PRODUCTS.filter(pred).length;
  const s = aliasStaticFields();
  return [
    { label: 'GTIN_UNIQUE gtin', field: 'gtin', value: s.BARCODE_GTIN_UNIQUE.gtin, hits: count((p) => p.gtin === s.BARCODE_GTIN_UNIQUE.gtin) },
    { label: 'FULLTEXT gtin (exact)', field: 'gtin', value: s.BARCODE_FULLTEXT_DISCRIM.gtin, hits: count((p) => p.gtin === s.BARCODE_FULLTEXT_DISCRIM.gtin) },
    { label: 'GTIN_SHARED gtin', field: 'gtin', value: s.BARCODE_GTIN_SHARED.gtin, hits: count((p) => p.gtin === s.BARCODE_GTIN_SHARED.gtin) },
    { label: 'CODE_OR code', field: 'code', value: s.BARCODE_CODE_OR.sku, hits: 1 },
    { label: 'PROP value', field: s.BARCODE_PROP.propertyName, value: s.BARCODE_PROP.value, hits: count((p) => p.props?.upc === s.BARCODE_PROP.value) },
    { label: 'VARIATION mpn', field: 'manufacturerPartNumber', value: s.BARCODE_VARIATION_MPN.mpn, hits: count((p) => p.mpn === s.BARCODE_VARIATION_MPN.mpn), variations: true },
    { label: 'CASE code', field: 'code', value: s.BARCODE_CASE.value, hits: 1 },
    { label: 'CASE prefix (must be 0)', field: 'code', value: s.BARCODE_CASE.prefix, hits: 0 },
    { label: 'REINDEX gtin', field: 'gtin', value: s.BARCODE_REINDEX.gtin, hits: 1 },
    { label: 'STALE_FIELD value', field: s.BARCODE_STALE_FIELD.name, value: s.BARCODE_STALE_FIELD.value, hits: count((p) => p.props?.stale === s.BARCODE_STALE_FIELD.value) },
  ];
}

/** Escape a value for a quoted filter term (backslash before `\` and `"`). Pure. */
export const quoteFilterValue = (v) => `"${String(v).replace(/[\\"]/g, (c) => `\\${c}`)}"`;

/**
 * Every scan value (code / gtin / mpn / property value), lowercased — the platform compares codes
 * case-insensitively and vcst-qa's provider folds case — mapped to the `<sku>.<field>` that holds it.
 */
export function scanValueOwners(products) {
  const owners = new Map();
  const own = (value, owner) => { const k = String(value ?? '').toLowerCase(); if (!k) return; owners.set(k, [...(owners.get(k) || []), owner]); };
  for (const p of products) {
    own(p.sku, `${p.sku}.code`);
    if (p.gtin) own(p.gtin, `${p.sku}.gtin`);
    if (p.mpn) own(p.mpn, `${p.sku}.mpn`);
    for (const [k, v] of Object.entries(p.props || {})) own(v, `${p.sku}.${k}`);
  }
  return owners;
}

/** Scan values held by more than one owner, except a GTIN shared ONLY by role='shared' products. Pure. */
export function findScanCollisions(products) {
  const sharedGtinOwners = new Set(products.filter((p) => p.role === 'shared' && p.gtin).map((p) => `${p.sku}.gtin`));
  return [...scanValueOwners(products)]
    .filter(([, owners]) => owners.length > 1 && !owners.every((o) => sharedGtinOwners.has(o)))
    .map(([value, owners]) => ({ value, owners }));
}

/* ── index purge (with event-based indexation off, a delete never reaches the index by itself) ─── */

/**
 * The indexation windows that remove the documents of deleted products. POST api/search/indexes/index
 * with explicit documentIds only ever (re)BUILDS documents — a missing product builds nothing and its
 * document stays. With startDate/endDate and no documentIds the Search module instead replays the
 * catalog change feed for that window, whose Deleted operation-log entries become index removals. So
 * each window must CONTAIN every deletion timestamp and should be as narrow as possible (everything
 * else modified inside it is re-indexed too). Timestamps within `gapMs` of each other share a window;
 * each window is padded by `padMs` on both sides. Pure: ISO strings in, ISO strings out.
 */
export function deletionWindows(timestamps, { gapMs = 60_000, padMs = 2_000 } = {}) {
  const t = [...new Set(timestamps.map((x) => {
    const ms = Date.parse(x);
    if (!Number.isFinite(ms)) throw new Error(`deletionWindows: "${x}" is not a timestamp`);
    return ms;
  }))].sort((a, b) => a - b);
  const windows = [];
  for (const ms of t) {
    const last = windows[windows.length - 1];
    if (last && ms - last.to <= gapMs) last.to = ms;
    else windows.push({ from: ms, to: ms });
  }
  return windows.map((w) => ({ startDate: new Date(w.from - padMs).toISOString(), endDate: new Date(w.to + padMs).toISOString() }));
}

/* ── the non-vacuity contract (called by the drift guard) ─────────────────────────────────────── */

/**
 * Every way the fixture set could still exist while deciding nothing. Returns problem strings.
 * Owned by `td:validate:barcode` (FOURTH RULE) — not re-asserted by a unit test.
 */
export function validateFixtureShape() {
  const problems = [];
  const s = aliasStaticFields();
  const lc = (v) => String(v ?? '').toLowerCase();

  for (const p of PRODUCTS) {
    if (!p.name.startsWith(NAME_STEM)) problems.push(`${p.sku}: name "${p.name}" must start with ${NAME_STEM} — teardown sweeps ${SEED_PREFIX}, and the index-orphan probe counts ${NAME_STEM}`);
    if (p.gtin && !isValidEan13(p.gtin)) problems.push(`${p.sku}: gtin ${p.gtin} is not a valid EAN-13 — a real scanner rejects it before search ever runs`);
    if (!(Number(p.listPrice) > 0)) problems.push(`${p.sku}: listPrice must be positive (an unpriced card is unbuyable)`);
    if (!Number.isInteger(p.stock) || p.stock < 0) problems.push(`${p.sku}: stock must be a non-negative integer`);
    for (const f of RUNTIME_FIELDS) if (p[f]) problems.push(`${p.sku}: carries runtime "${f}" in the committed spec`);
  }
  const skus = PRODUCTS.map((p) => lc(p.sku));
  if (new Set(skus).size !== skus.length) problems.push('product codes collide case-insensitively — the platform treats them as one');

  // Scan-value space: every value a case scans must be unique across code / gtin / mpn / property,
  // except the INTENDED collision (the shared GTIN). The decoy's name is not a scan value.
  const scanOwners = scanValueOwners(PRODUCTS);
  for (const c of findScanCollisions(PRODUCTS)) problems.push(`scan value "${c.value}" is held by ${c.owners.join(' + ')} — exact mode could not tell them apart`);

  // GTIN_UNIQUE — exactly one holder.
  if (PRODUCTS.filter((p) => p.gtin === s.BARCODE_GTIN_UNIQUE.gtin).length !== 1) problems.push('BARCODE_GTIN_UNIQUE: gtin must be held by exactly ONE product, or "exact opens the product" cannot be observed');

  // FULLTEXT — exact finds 1, full text finds ≥2.
  const g = s.BARCODE_FULLTEXT_DISCRIM.gtin;
  const target = bySku(s.BARCODE_FULLTEXT_DISCRIM.sku);
  const decoy = bySku(s.BARCODE_FULLTEXT_DISCRIM.otherSku);
  const wordRe = new RegExp(`(^|[^0-9A-Za-z])${g}([^0-9A-Za-z]|$)`);
  if (!decoy || !wordRe.test(decoy.name)) problems.push('BARCODE_FULLTEXT_DISCRIM: the decoy NAME must carry G as a whole word — without it full text and exact both find 1 and the mode switch is unobservable');
  if (decoy?.gtin === g) problems.push('BARCODE_FULLTEXT_DISCRIM: the decoy must NOT hold G as its gtin (exact would then find 2 as well)');
  if (target && target.name.includes(g)) problems.push('BARCODE_FULLTEXT_DISCRIM: G must not appear in the target\'s own name');
  if (PRODUCTS.filter((p) => p.gtin === g).length !== 1) problems.push('BARCODE_FULLTEXT_DISCRIM: G must be exactly one product\'s gtin');

  // GTIN_SHARED — N ≥ 2 so "lists, does not open" is decidable.
  if (Number(s.BARCODE_GTIN_SHARED.count) < 2) problems.push('BARCODE_GTIN_SHARED: fewer than 2 holders — a single hit would auto-open and the case would assert nothing');

  // CODE_OR — both fields carry a value only they match.
  const or = bySku(s.BARCODE_CODE_OR.sku);
  if (or?.gtin === s.BARCODE_GTIN_UNIQUE.gtin) problems.push('BARCODE_CODE_OR: its gtin equals GTIN_UNIQUE\'s — the OR case would see one value match twice');
  if (PRODUCTS.some((p) => p.gtin && lc(p.gtin) === lc(s.BARCODE_CODE_OR.sku))) problems.push('BARCODE_CODE_OR: its code is also a gtin — a gtin-only build would still find it, so OR is not decided');

  // PROP / SPECIAL / STALE.
  for (const def of Object.values(PROPERTIES)) {
    if (!def.name.startsWith(PROPERTY_PREFIX)) problems.push(`property ${def.name}: must start with ${PROPERTY_PREFIX}`);
    if (!/^[A-Za-z0-9_]+$/.test(def.name)) problems.push(`property ${def.name}: must be an identifier — the lowercased name is used verbatim as a filter field`);
    if (!['Product', 'Variation'].includes(def.type) || def.valueType !== 'ShortText') problems.push(`property ${def.name}: pr909 only offers Product/Variation ShortText properties — anything else never reaches /fields`);
  }
  if (PROPERTIES.upc.name === PROPERTIES.stale.name) problems.push('STALE_FIELD must be a different property from PROP, or deleting it breaks PROP');
  if (!/"/.test(s.BARCODE_SPECIAL.value) || !/:/.test(s.BARCODE_SPECIAL.value)) problems.push('BARCODE_SPECIAL: value must contain both `"` and `:` — the escaping path is its only purpose');
  if (PRODUCTS.filter((p) => p.props?.upc === s.BARCODE_PROP.value).length !== 1) problems.push('BARCODE_PROP: value must be on exactly one product');
  // STALE_FIELD — one dedicated product holds the property; deleting it must take the scan 1 → 0.
  const staleHolders = PRODUCTS.filter((p) => p.props?.stale != null);
  const staleOwner = bySku(s.BARCODE_STALE_FIELD.sku);
  if (staleHolders.length !== 1 || staleHolders[0] !== staleOwner) problems.push('BARCODE_STALE_FIELD: exactly ONE product (its `sku`) must carry the stale property, or "delete the property ⇒ 1 → 0" is not what a scan observes');
  if (staleOwner && (staleOwner.role !== 'stale' || staleOwner.parent || staleOwner.props?.upc != null)) problems.push('BARCODE_STALE_FIELD: its product must be dedicated (role=stale, no parent, no PROP value) — deleting its property must not change what any other alias reads');
  if (staleOwner && [staleOwner.sku, staleOwner.gtin, staleOwner.mpn].some((x) => x != null && lc(x) === lc(s.BARCODE_STALE_FIELD.value))) problems.push('BARCODE_STALE_FIELD: the value must live ONLY in the stale property — held by code/gtin/mpn too, the scan would still hit after the property is gone');

  // VARIATION_MPN — only the variation holds it; it is OOS; family has stock elsewhere.
  const vm = bySku(s.BARCODE_VARIATION_MPN.variationSku);
  const parent = bySku(s.BARCODE_VARIATION_MPN.parentSku);
  const sib = bySku(s.BARCODE_VARIATION_MPN.siblingSku);
  if (!vm || vm.parent !== parent?.sku) problems.push('BARCODE_VARIATION_MPN: the MPN holder must be a VARIATION of the parent (mainProductId), not a standalone product');
  if (vm && vm.stock !== 0) problems.push('BARCODE_VARIATION_MPN: the variation must be OUT OF STOCK (0) — the case asserts it opens despite the in-stock preference');
  if (!((parent?.stock || 0) > 0 || (sib?.stock || 0) > 0)) problems.push('BARCODE_VARIATION_MPN: parent or sibling must be in stock, or "OOS variation still opens" is indistinguishable from "whole family unavailable"');
  if (PRODUCTS.filter((p) => p.mpn === s.BARCODE_VARIATION_MPN.mpn).length !== 1) problems.push('BARCODE_VARIATION_MPN: the MPN must be held by the variation alone');
  if (parent?.mpn || sib?.mpn) problems.push('BARCODE_VARIATION_MPN: parent/sibling must carry no MPN');

  // CASE — mixed case, strict prefix, prefix matches nothing.
  const v = s.BARCODE_CASE.value;
  if (v === v.toLowerCase() || v === v.toUpperCase()) problems.push('BARCODE_CASE: value must be MIXED case — a single-case value cannot expose case handling');
  if (!(v.startsWith(s.BARCODE_CASE.prefix) && s.BARCODE_CASE.prefix.length < v.length)) problems.push('BARCODE_CASE: prefix must be a STRICT prefix of value');
  if (scanOwners.has(lc(s.BARCODE_CASE.prefix))) problems.push('BARCODE_CASE: the prefix is itself a scan value — a correct exact build would then find it');
  const f = String(s.BARCODE_CASE.valueFlipped);
  if (f.toLowerCase() !== v.toLowerCase()) problems.push('BARCODE_CASE: valueFlipped must equal value case-insensitively — otherwise a miss proves nothing about case');
  if ([...v].some((c, i) => c.toLowerCase() !== c.toUpperCase() && c === f[i])) problems.push('BARCODE_CASE: valueFlipped must invert the case of EVERY letter — a letter left as-is lets a half-folding build pass');

  // REINDEX — old and new differ, both valid.
  if (s.BARCODE_REINDEX.gtin === s.BARCODE_REINDEX.newGtin || !isValidEan13(s.BARCODE_REINDEX.newGtin)) problems.push('BARCODE_REINDEX: newGtin must be a valid EAN-13 different from gtin');
  if (scanOwners.has(lc(s.BARCODE_REINDEX.newGtin))) problems.push('BARCODE_REINDEX: newGtin is already held by a product');

  // Images — each points at the value its alias names.
  const imgFor = { gtinUnique: s.BARCODE_GTIN_UNIQUE.gtin, fulltext: g, shared: s.BARCODE_GTIN_SHARED.gtin, mpn: s.BARCODE_VARIATION_MPN.mpn, special: s.BARCODE_SPECIAL.value };
  for (const [k, want] of Object.entries(imgFor)) if (IMAGES[k].value !== want) problems.push(`image ${IMAGES[k].file}: encodes "${IMAGES[k].value}", alias value is "${want}"`);

  // Store.
  if (!STORE.name.startsWith(SEED_PREFIX) || !STORE.id.startsWith(SEED_PREFIX)) problems.push('BARCODE_STORE: id and name must start with AGENT-TEST');
  if (STORE.barcodeDefaults.scannerEnabled !== true || STORE.barcodeDefaults.fields.length) problems.push('BARCODE_STORE: the per-seed reset must be the platform default (scannerEnabled=true, fields=[])');

  return problems;
}
