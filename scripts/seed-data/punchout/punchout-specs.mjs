/**
 * punchout-specs.mjs — single source of truth for the VCST-5886 Punchout cXML test data.
 *
 * SIDE-EFFECT-FREE: no env load, no network, no main(). Imported by seed-punchout.mjs (provision +
 * live verify), validate-punchout-data.mjs (static drift guard) and the teardown-scope unit test.
 *
 * What it declares, and where each value's source of truth is:
 *
 *  1. CONFIGURATIONS — the `Punchout:Configurations` entries are PLATFORM APP SETTINGS, deployed
 *     per env through vc-deploy-dev `infra/environments.yml` (qa1: vc-deploy-dev#6693, then #6926 —
 *     Punchout PR #2 validates the options at platform START and refuses a configuration without an
 *     `Id` or a `StoreId`, so #6926 added Ids qa1-punchout-0..2 and REMOVED configuration 3; its alias
 *     stays registered as RETIRED so a case still citing it resolves to "" + a reason). There is no
 *     REST endpoint that reads them back, so the deployment is the source of truth and this module
 *     records what was deployed, keyed by TEST_ENV, with its provenance. The seeder writes these
 *     facts to aliases.<env>.json ONLY for an env listed here — every other env resolves them to ""
 *     (a clear miss, never qa1's values). The facts the seeder CAN observe without opening a session
 *     are re-probed live by `seed-punchout.mjs --verify` (VERIFY_PROBES below).
 *     The SharedSecret VALUE is never here: the alias carries the `{{VAR}}` token
 *     (`{{PUNCHOUT_SHARED_SECRET_<n>}}`), promoted by config.js from `.env.local`
 *     `PUNCHOUT_SHARED_SECRET_<n>_<TEST_ENV>`.
 *
 *  2. MAPPINGS — punchout user mappings (`/api/punchout-user-mappings`).
 *     - REQUISITION `AGENT-TEST-PO-300` → a DEDICATED buyer this seeder provisions (contact + Customer
 *       account + ONE org membership, VCST-5887). Exists because {{USER_EMAIL}} is shared by every run
 *       and holds a dozen named carts, so "the cart sent = the default cart" was unobservable on it.
 *       Its carts are emptied by `--reset-buyer-carts` (case Setup + Cleanup). Owned: teardown deletes
 *       mapping, membership, account and contact.
 *     - DEFAULT  `AGENT-TEST-PO-100` → the {{USER_EMAIL}} persona (contact in exactly ONE org — the
 *       single-org side of the org-resolution pair; MULTI_ORG is the other side). CREATED BY /qa-test 1r, deleted at
 *       run close-out. This seeder only REGISTERS it (writes its ids) and must NEVER create, change or
 *       delete it — see PROTECTED_EXTERNAL_IDS / teardownMappingTargets().
 *     - MULTI_ORG `AGENT-TEST-PO-200` → the {{MULTI_ORG_USER_EMAIL}} persona (contact in two orgs).
 *       Owned by this seeder (find-or-create, teardown deletes it by id).
 *
 *  3. BACK-OFFICE ROLES + ACCOUNTS — Manager accounts (isAdministrator=false so the gate applies).
 *     Permission sets are source-derived from vc-module-punchout#1 @ fbb9918a:
 *       - PunchoutUserMappingController: search/GET/new = punchout:read, POST = punchout:create,
 *         PUT = punchout:update, DELETE = punchout:delete.
 *       - Admin SPA widget `member-punchout-user-mapping-widget` registered on `customerDetail2` with
 *         `permission: 'punchout:read'`; the blade gates Save on `punchout:update`, Delete on
 *         `punchout:delete`; the "no security account" warning reads `blade.member.securityAccounts`
 *         (customer module payload — NO platform:security:read needed).
 *     `platform:access` is NOT a registered permission on this build (GET /api/platform/security/
 *     permissions, qa1 2026-10-01) — base back-office entry comes from userType Manager, exactly as the
 *     rbac fixtures document. To open Companies & contacts at all: customer:access + customer:read.
 *     Passwords are `{{DEFAULT_TEST_PASSWORD}}` tokens (resolved from .env.local at seed time).
 */

export const SEED_PREFIX = 'AGENT-TEST-';

// ── 1. Configurations ───────────────────────────────────────────────────────────────────────────

/**
 * The four configurations, env-invariant part: alias name, the env var that holds the secret, and the
 * role each one plays in the test model (VCST-5886-2026-10-01 Parts 1–5). The SECOND RULE pair is
 * 0 vs 1: they must DIFFER on store, on both optional checks and on both lifetimes, or "each
 * SharedSecret selects its own configuration" is undecidable — the guard asserts that divergence.
 */
export const CONFIG_SPECS = [
  { alias: 'PUNCHOUT_CONFIG_0', index: 0, secretVar: 'PUNCHOUT_SHARED_SECRET_0',
    purpose: 'happy path — every optional check ON (sender domain + return-URL allow-list), default-length lifetimes' },
  { alias: 'PUNCHOUT_CONFIG_1', index: 1, secretVar: 'PUNCHOUT_SHARED_SECRET_1',
    purpose: 'checks OFF (no SenderDomain, no AllowedReturnUrls), a DIFFERENT store, short lifetimes (token/session expiry cases)' },
  { alias: 'PUNCHOUT_CONFIG_2', index: 2, secretVar: 'PUNCHOUT_SHARED_SECRET_2',
    purpose: 'StoreId points at a store that does not exist → mapped identity gets cXML 500 (N15)' },
  { alias: 'PUNCHOUT_CONFIG_3', index: 3, secretVar: 'PUNCHOUT_SHARED_SECRET_3',
    purpose: 'RETIRED — was: no StoreId at all → cXML 500 for any identity (N16)',
    retired: 'not deployable since Punchout PR #2 (build 3.1000.0-pr-2): PunchoutOptionsValidator runs at platform start and refuses a configuration without Id/StoreId, so vc-deploy-dev#6926 removed it from vcptcore-qa1 (2026-10-14). Its secret now matches no configuration (cXML 401). The "no StoreId" scenario is a startup failure, not a cXML answer — test it as a deployment check, not with this alias.' },
];

/** Configurations a deployment can actually carry (the retired one is excluded everywhere it is probed). */
export const ACTIVE_CONFIG_SPECS = CONFIG_SPECS.filter((c) => !c.retired);

/** Platform default lifetimes when a configuration omits them (developer notes, VCST-5886). */
export const DEFAULT_TOKEN_LIFETIME = '00:15:00';
export const DEFAULT_SESSION_LIFETIME = '04:00:00';

/**
 * What each env actually deployed. Keyed by TEST_ENV. Only envs listed here get config facts in their
 * overlay. `storeExists` is asserted live by the seeder's --verify (GET /api/stores/{id}).
 */
export const DEPLOYED_CONFIGS = {
  vcptcore_qa1: {
    source: 'vc-deploy-dev#6693 infra/environments.yml (Punchout__Configurations__0..3, 2026-10-01) + #6926 (Ids qa1-punchout-0..2 added, configuration 3 removed, 2026-10-14)',
    configs: {
      0: { id: 'qa1-punchout-0', storeId: 'B2B-store', storeExists: true, senderDomain: 'NetworkId', allowedReturnUrls: ['https://punchoutcommerce.com/*'],
           tokenLifetime: '00:15:00', sessionLifetime: '04:00:00' },
      1: { id: 'qa1-punchout-1', storeId: 'New-super', storeExists: true, senderDomain: '', allowedReturnUrls: [],
           tokenLifetime: '00:02:00', sessionLifetime: '00:10:00' },
      2: { id: 'qa1-punchout-2', storeId: 'AGENT-TEST-no-such-store', storeExists: false, senderDomain: '', allowedReturnUrls: [],
           tokenLifetime: '', sessionLifetime: '' },
    },
  },
  // vcst (vc-deploy-dev#6935) is NOT listed: as of 2026-10-22 the vcst-qa branch's backend/packages.json carries no
  // VirtoCommerce.Punchout module, so its Punchout__Configurations app settings (0..2, no Id; 3 removed) are read by
  // nothing. Re-add an entry here — with the Ids the PR #2 build requires — when the module is deployed there again.
};

/** `{{VAR}}` token for a configuration's secret — the only form a committed file may carry. */
export const secretToken = (spec) => `{{${spec.secretVar}}}`;

/**
 * Overlay fields for one configuration on one env (pure). Effective lifetimes fall back to the
 * platform defaults when the deployment omitted them, so a case asserting "token dies after N minutes"
 * reads the number the platform will actually apply.
 */
export function configOverlayFields(spec, deployed) {
  if (!deployed) return null;
  const tokenLifetime = deployed.tokenLifetime || DEFAULT_TOKEN_LIFETIME;
  const sessionLifetime = deployed.sessionLifetime || DEFAULT_SESSION_LIFETIME;
  return {
    deployed: true,
    configurationId: deployed.id || '',
    storeId: deployed.storeId,
    storeExists: deployed.storeExists,
    senderDomain: deployed.senderDomain,
    senderDomainCheck: Boolean(deployed.senderDomain),
    allowedReturnUrl: deployed.allowedReturnUrls[0] || '',
    returnUrlCheck: deployed.allowedReturnUrls.length > 0,
    tokenLifetime,
    sessionLifetime,
    tokenLifetimeMinutes: hhmmssToMinutes(tokenLifetime),
    sessionLifetimeMinutes: hhmmssToMinutes(sessionLifetime),
  };
}

/** Overlay for a RETIRED configuration (pure): every env fact empty, the reason carried. */
export function retiredOverlayFields(spec) {
  return {
    deployed: false, retired: true, retiredReason: spec.retired, configurationId: '', storeId: '', storeExists: false,
    senderDomain: '', senderDomainCheck: false, allowedReturnUrl: '', returnUrlCheck: false,
    tokenLifetime: '', sessionLifetime: '', tokenLifetimeMinutes: null, sessionLifetimeMinutes: null,
  };
}

export function hhmmssToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
}

// ── 2. Mappings ─────────────────────────────────────────────────────────────────────────────────

export const MAPPING_SPECS = [
  // vcst: {{USER_EMAIL}} belongs to no organization there, so the single-org persona is {{ORG_USER_EMAIL}}.
  { alias: 'PUNCHOUT_MAPPING_DEFAULT', externalId: 'AGENT-TEST-PO-100', personaEmailVar: 'USER_EMAIL',
    personaEmailVarByEnv: { vcst: 'ORG_USER_EMAIL' },
    owned: false, maxOrganizations: 1, ownerNote: 'created by /qa-test VCST-5886 step 1r; deleted at run close-out — this seeder only registers it' },
  { alias: 'PUNCHOUT_MAPPING_MULTI_ORG', externalId: 'AGENT-TEST-PO-200', personaEmailVar: 'MULTI_ORG_USER_EMAIL',
    owned: true, minOrganizations: 2, ownerNote: 'seed-punchout.mjs find-or-create; teardown deletes it by id' },
  { alias: 'PUNCHOUT_MAPPING_REQUISITION', externalId: 'AGENT-TEST-PO-300', owned: true, maxOrganizations: 1,
    ownerNote: 'seed-punchout.mjs provisions the buyer AND the mapping (find-or-create); teardown deletes mapping, membership, account, contact',
    buyer: {
      email: 'AGENT-TEST-punchout-buyer@test.virtocommerce.com',
      firstName: 'AGENT-TEST-Punchout', lastName: 'Buyer',
      passwordToken: '{{B2B_USER_PASSWORD}}',
      // The org is DERIVED, never transcribed: the single org of this persona's contact, so the buyer
      // prices exactly like the default punchout persona and differs from it ONLY by owning its carts.
      organizationFromPersonaVar: 'USER_EMAIL',
      orgRoleName: 'Purchasing agent',
    } },
];

/** The mapping whose persona the seeder provisions itself (vs. an existing env persona). */
export const isProvisionedBuyer = (spec) => Boolean(spec && spec.buyer);

/** External ids this seeder must never delete or mutate, whatever a search returns. */
export const PROTECTED_EXTERNAL_IDS = new Set(MAPPING_SPECS.filter((m) => !m.owned).map((m) => m.externalId));

/** The env var naming a mapping's persona on one env (pure). */
export const personaEmailVarFor = (spec, env) => spec.personaEmailVarByEnv?.[env] || spec.personaEmailVar;

/**
 * Persona overlay fields (pure): the `{{VAR}}` tokens a case reads as the mapped buyer, so a suite
 * never names the persona variable itself and stays correct on an env that maps a different one.
 */
export function personaOverlayFields(spec, env) {
  const emailVar = personaEmailVarFor(spec, env);
  const passwordVar = emailVar.replace(/_EMAIL$/, '_PASSWORD');
  return { persona_email_var: emailVar, persona_email: `{{${emailVar}}}`, persona_password: `{{${passwordVar}}}` };
}

/** POST /api/punchout-user-mappings body (shape from GET /api/punchout-user-mappings/new). */
export function mappingBody(spec, user) {
  return { isActive: true, externalId: spec.externalId, userId: user.id, userName: user.userName, memberId: user.memberId };
}

/**
 * Teardown scope (pure): from live search results, the mapping ids this seeder may delete — only
 * OWNED specs' externalIds, never a protected one, never an entity whose externalId lacks the seed
 * prefix. A wrong answer here deletes another step's fixture, which is why it is unit-tested.
 */
export function teardownMappingTargets(results = [], specs = MAPPING_SPECS) {
  const owned = new Set(specs.filter((m) => m.owned).map((m) => m.externalId));
  return results
    .filter((r) => r && r.id && typeof r.externalId === 'string')
    .filter((r) => owned.has(r.externalId))
    .filter((r) => !PROTECTED_EXTERNAL_IDS.has(r.externalId))
    .filter((r) => r.externalId.startsWith(SEED_PREFIX))
    .map((r) => r.id);
}

// ── 3. Back-office roles + accounts ─────────────────────────────────────────────────────────────

export const ALL_PUNCHOUT_PERMISSIONS = ['punchout:access', 'punchout:read', 'punchout:create', 'punchout:update', 'punchout:delete'];
export const CONTACTS_BASE_PERMISSIONS = ['customer:access', 'customer:read'];

export const BACKOFFICE_SPECS = [
  {
    alias: 'BACKOFFICE_PUNCHOUT_READ',
    email: 'AGENT-TEST-punchout-reader@test.virtocommerce.com',
    passwordToken: '{{DEFAULT_TEST_PASSWORD}}',
    role: {
      id: 'AGENT-TEST-Punchout-Reader',
      name: 'AGENT-TEST-Punchout-Reader',
      description: 'AGENT-TEST VCST-5886 BSC-2: opens Companies & contacts (customer:access + customer:read) and sees the Punchout user widget (punchout:read). Holds NO punchout:create/update/delete, so Save/Delete must be disabled and POST/PUT/DELETE /api/punchout-user-mappings must 403. Safe to delete.',
      permissions: [...CONTACTS_BASE_PERMISSIONS, 'punchout:read'],
    },
    mustHave: ['punchout:read'],
    mustNotHave: ['punchout:create', 'punchout:update', 'punchout:delete', 'punchout:access'],
    expect: { search: 200, write: 403 },
  },
  {
    alias: 'BACKOFFICE_NO_PUNCHOUT',
    email: 'AGENT-TEST-no-punchout@test.virtocommerce.com',
    passwordToken: '{{DEFAULT_TEST_PASSWORD}}',
    role: {
      id: 'AGENT-TEST-Punchout-None',
      name: 'AGENT-TEST-Punchout-None',
      description: 'AGENT-TEST VCST-5886 BSC-3: opens Companies & contacts (customer:access + customer:read) with NO punchout:* permission, so the Punchout user widget must be hidden and POST /api/punchout-user-mappings/search must 403. Safe to delete.',
      permissions: [...CONTACTS_BASE_PERMISSIONS],
    },
    mustHave: [],
    mustNotHave: [...ALL_PUNCHOUT_PERMISSIONS],
    expect: { search: 403, write: 403 },
  },
];

export const BACKOFFICE_ACCOUNT_TYPE = { userType: 'Manager', isAdministrator: false };

/** PUT /api/platform/security/roles (idempotent upsert keyed by the stable role id). */
export function roleBody(role) {
  return { id: role.id, name: role.name, description: role.description, permissions: role.permissions.map((name) => ({ name })) };
}

/** POST /api/platform/security/users/create body. */
export function accountBody(spec, { password, storeId, roleId }) {
  return {
    userName: spec.email, email: spec.email, password, storeId,
    userType: BACKOFFICE_ACCOUNT_TYPE.userType, isAdministrator: BACKOFFICE_ACCOUNT_TYPE.isAdministrator,
    roles: [{ id: roleId, name: spec.role.name }],
  };
}

// ── 4. Live verify probes that open NO session ──────────────────────────────────────────────────
// Check order in source: secret → sender domain → return URL → user mapping → store. A probe whose
// expected outcome is decided BEFORE the success path writes nothing; config 1's own success path
// would write a PunchoutSession row, so config 1 is verified by the cases, not here.
// `provesMapping: true` = the probe's outcome must CHANGE if the identity were unmapped (guard [8]).

export const FOREIGN_RETURN_URL = 'https://evil.example.com/return';
export const ALLOWED_RETURN_URL = 'https://punchoutcommerce.com/tools/cxml-punchout-return';

export const VERIFY_PROBES = [
  { name: 'config0 + mapped DEFAULT + foreign return URL → 400 (secret selects config 0; allow-list ON)',
    config: 0, mapping: 'PUNCHOUT_MAPPING_DEFAULT', domain: 'NetworkId', returnUrl: FOREIGN_RETURN_URL, expectCode: '400' },
  { name: 'config0 + mapped DEFAULT + domain DUNS → 401 (sender-domain check ON)',
    config: 0, mapping: 'PUNCHOUT_MAPPING_DEFAULT', domain: 'DUNS', returnUrl: ALLOWED_RETURN_URL, expectCode: '401' },
  { name: 'config2 + mapped DEFAULT → 500 (mapping active; nonexistent store)',
    config: 2, mapping: 'PUNCHOUT_MAPPING_DEFAULT', domain: 'NetworkId', returnUrl: ALLOWED_RETURN_URL, expectCode: '500', provesMapping: true },
  { name: 'config2 + mapped MULTI_ORG → 500 (MULTI_ORG mapping is active and recognised)',
    config: 2, mapping: 'PUNCHOUT_MAPPING_MULTI_ORG', domain: 'NetworkId', returnUrl: ALLOWED_RETURN_URL, expectCode: '500', provesMapping: true },
  { name: 'config2 + unmapped identity → 401 (control: the 500 above is the mapping, not the config)',
    config: 2, identity: 'AGENT-TEST-PO-UNMAPPED', domain: 'NetworkId', returnUrl: ALLOWED_RETURN_URL, expectCode: '401' },
  { name: 'config2 + mapped REQUISITION → 500 (dedicated buyer mapping is active and recognised)',
    config: 2, mapping: 'PUNCHOUT_MAPPING_REQUISITION', domain: 'NetworkId', returnUrl: ALLOWED_RETURN_URL, expectCode: '500', provesMapping: true },
];

/**
 * Cart reset scope (pure): from a /api/carts/search page, the cart ids that belong to the dedicated
 * buyer and may be deleted. Every cart type goes (default, named, SavedForLater, wishlists) — the
 * buyer exists only for punchout cases — but never a cart of another customer the search returned.
 */
export function buyerCartTargets(results = [], userId) {
  if (!userId) return [];
  return results.filter((c) => c && c.id && c.customerId === userId).map((c) => c.id);
}

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal PunchOutSetupRequest (cXML 1.2.041) — used only by the seeder's verify probes. */
export function buildSetupRequest({ secret, identity, domain = 'NetworkId', returnUrl, buyerCookie, payloadId, timestamp, supplierUrl }) {
  const bfp = returnUrl == null ? '' : `<BrowserFormPost><URL>${xmlEscape(returnUrl)}</URL></BrowserFormPost>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<cXML payloadID="${xmlEscape(payloadId)}" timestamp="${xmlEscape(timestamp)}" xml:lang="en-US">
<Header>
<From><Credential domain="NetworkId"><Identity>AGENT-TEST-buyer-company</Identity></Credential></From>
<To><Credential domain="NetworkId"><Identity>VirtoCommerce</Identity></Credential></To>
<Sender><Credential domain="${xmlEscape(domain)}"><Identity>${xmlEscape(identity)}</Identity><SharedSecret>${xmlEscape(secret)}</SharedSecret></Credential><UserAgent>AGENT-TEST seed-punchout verify</UserAgent></Sender>
</Header>
<Request deploymentMode="test">
<PunchOutSetupRequest operation="create">
<BuyerCookie>${xmlEscape(buyerCookie)}</BuyerCookie>
${bfp}
<SupplierSetup><URL>${xmlEscape(supplierUrl)}</URL></SupplierSetup>
</PunchOutSetupRequest>
</Request>
</cXML>`;
}

/** cXML Status code from a response body, or null. */
export const cxmlStatusCode = (xml) => (/<Status[^>]*\bcode="(\d+)"/.exec(String(xml || '')) || [])[1] || null;

// ── 5. Catalog fixtures: UoM product pair, punchout price lists, config-1 store FFC (VCST-5887) ─
// Why the punchout seeder owns these rather than seed:products / seed:pricing / seed:store:
//  - seed:products is CSV-driven (test-products.csv) and has no MeasureUnit column; its price lists
//    are date-named, shared by ~100 rows and assigned by CATALOG — a punchout fixture added there
//    would be torn down with (or tear down) unrelated rows.
//  - seed:pricing prices DISCOVERED products in bulk; seed:store configures STORE_ID from stores.csv
//    by a whole-store reconcile. Neither may touch config 1's store (New-super), which is not ours.
// So: two OWNED products, two OWNED store-scoped price lists that price ONLY those products, and one
// guarded field write on config 1's store, all reversed by `--teardown` (also `--only catalog`).
//
// SECOND RULE pairs this section carries:
//  - UoM vs PLAIN: the same shape except MeasureUnit — a distinctive value ('box') vs none, so a cXML
//    <UnitOfMeasure> that ignores the product (always the fallback) FAILS on the UoM line, and one that
//    leaks a non-empty default FAILS on the plain line. 'box' is deliberately not 'EA' (the fallback).
//  - USD vs EUR: every product's EUR amount differs from its USD amount, and the two products differ
//    from each other in both currencies, so a line priced in the wrong currency or swapped with its
//    sibling is visible in the amount alone.

/**
 * Placement is DERIVED, never transcribed: the products go into the catalog + category of the standard
 * fixture this row of test-products.csv names (resolved live by its sku). That category is already in
 * the store's catalog, so the seeder writes no catalog or category. (seed-common ensureCategoryPath is
 * deliberately not used: on an env still on the date-named layout — vcptcore_qa1 — it would create a
 * whole AGENT-TEST-SEED catalog pair.)
 */
export const PRODUCT_PLACEMENT = { csv: 'test-data/products/test-products.csv', keyColumn: 'product_id', key: 'PROD-001', codeColumn: 'sku' };
export const PRODUCT_MIN_STOCK = 100;
export const FALLBACK_UOM = 'EA';

export const PRODUCT_SPECS = [
  { alias: 'PUNCHOUT_PRODUCT_UOM', code: 'AGENT-TEST-PO-UOM-001', name: 'AGENT-TEST-Punchout UoM Box Product',
    measureUnit: 'box', stock: 500, prices: { USD: 24.0, EUR: 21.5 },
    purpose: 'MeasureUnit "box" — the cXML ItemIn UnitOfMeasure must carry the product value, not the EA fallback' },
  { alias: 'PUNCHOUT_PRODUCT_PLAIN', code: 'AGENT-TEST-PO-PLAIN-001', name: 'AGENT-TEST-Punchout Plain Product',
    measureUnit: '', stock: 500, prices: { USD: 12.0, EUR: 10.75 },
    purpose: 'no MeasureUnit — the sibling of the UoM product (fallback side of the pair); plain in-stock EUR line' },
];

/**
 * One OWNED price list per currency, assigned by STORE (not catalog) with an empty condition tree, so
 * every shopper of that store resolves it — and it prices nothing but PRODUCT_SPECS, so no existing
 * product's USD or EUR price can move. `stores` names which configuration's store(s) get an
 * assignment: config 0 (B2B-store) always; the USD list also config 1's store, so a product there is
 * priced once that store has a fulfillment center (EUR is not a currency of config 1's store).
 */
export const PRICELIST_SPECS = [
  { alias: 'PUNCHOUT_PRICELIST_USD', name: 'AGENT-TEST-Punchout-USD', currency: 'USD', priority: 100, storesFromConfigs: [0, 1] },
  { alias: 'PUNCHOUT_PRICELIST_EUR', name: 'AGENT-TEST-Punchout-EUR', currency: 'EUR', priority: 100, storesFromConfigs: [0] },
];
export const assignmentName = (pl, storeId) => `${pl.name} → ${storeId}`;

/** PUT /api/products/prices rows for one product in one owned price list (pure). */
export function priceRows(spec, pricelist, pricelistId, productId) {
  const amount = spec.prices[pricelist.currency];
  if (amount == null) return [];
  return [{ pricelistId, productId, currency: pricelist.currency, list: amount, minQuantity: 1 }];
}

/** POST /api/catalog/products body (pure — the caller adds the store SEO record). */
export function productBody(spec, { catalogId, categoryId, seoInfos = [] }) {
  return {
    catalogId, categoryId, code: spec.code, name: spec.name, productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: true, measureUnit: spec.measureUnit || null, seoInfos,
  };
}

/**
 * Config 1's store gets ONE fulfillment-center field: its main FFC, set to config 0's store's main FFC
 * (derived live — never a transcribed GUID), only when it has none (null or dangling). An FFC someone
 * else assigned is left alone and not owned. Written GET → change only this field → PUT the FULL body
 * → GET + diff every other field (KB-2CBB229F: PUT /api/stores replaces the whole entity).
 */
export const STORE_FFC_SPEC = {
  alias: 'PUNCHOUT_STORE_FFC_CONFIG_1', targetConfig: 1, sourceConfig: 0, field: 'mainFulfillmentCenterId',
};

/** Store fields a PUT may legitimately change besides the one we set (audit stamps). */
export const STORE_AUDIT_FIELDS = new Set(['modifiedDate', 'modifiedBy']);

/**
 * Decide the store-FFC write (pure). `liveFfcIds` = FFCs that exist; `recorded` = the overlay entry a
 * previous seed wrote ({ owned, assignedFfcId, previousValue }).
 * → { action: 'set'|'none', value, previous, owned }
 */
export function planStoreFfc({ current, desired, liveFfcIds, recorded }) {
  const live = liveFfcIds instanceof Set ? liveFfcIds : new Set(liveFfcIds || []);
  if (current && current === desired && recorded?.owned && recorded.assignedFfcId === desired) {
    return { action: 'none', value: desired, previous: recorded.previousValue ?? '', owned: true };
  }
  if (current && live.has(current)) return { action: 'none', value: current, previous: '', owned: false };
  return { action: 'set', value: desired, previous: current || '', owned: true };
}

/** Decide the teardown restore (pure): only an owned assignment still holding our value is reverted. */
export function planStoreFfcRestore({ current, recorded }) {
  if (!recorded?.owned || !recorded.assignedFfcId) return { action: 'skip', reason: 'not owned by this seeder' };
  if (current !== recorded.assignedFfcId) return { action: 'skip', reason: `changed since the seed (now ${current || 'null'}) — not reverting someone else's value` };
  return { action: 'restore', value: recorded.previousValue || null };
}

/**
 * Deep diff of two store payloads (pure): every path whose value differs, except `allowed` top-level
 * fields and audit stamps at any depth. An array whose elements are all objects with a string `name`
 * (store `settings`) is compared BY NAME, not by index: a full-body PUT /api/stores was observed to
 * return the same 125 settings in a different order (vcptcore_qa1 2026-10-14: Stores.SeoLinksType
 * moved from index 8 to 112), which an index-wise diff reports as hundreds of false changes. Other
 * arrays compare index-wise. Returns [{ path, before, after }].
 */
const byName = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => x && typeof x === 'object' && typeof x.name === 'string');
export function diffStore(before, after, allowed = new Set()) {
  const out = [];
  const walk = (a, b, path) => {
    const key = path[path.length - 1];
    if (path.length === 1 && allowed.has(key)) return;
    if (STORE_AUDIT_FIELDS.has(key)) return;
    if ((byName(a) || byName(b)) && Array.isArray(a) && Array.isArray(b) && (byName(a) || !a.length) && (byName(b) || !b.length)) {
      const ma = new Map(a.map((x) => [x.name, x])); const mb = new Map(b.map((x) => [x.name, x]));
      if (ma.size !== a.length || mb.size !== b.length) { out.push({ path: path.join('.'), before: `${a.length} items`, after: `${b.length} items (duplicate names)` }); return; }
      for (const n of new Set([...ma.keys(), ...mb.keys()])) walk(ma.get(n), mb.get(n), [...path, n]);
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of keys) walk(a[k], b[k], [...path, k]);
      return;
    }
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push({ path: path.join('.'), before: a ?? null, after: b ?? null });
  };
  for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) walk(before?.[k], after?.[k], [k]);
  return out;
}

/** Ownership guard for teardown (pure): only AGENT-TEST products whose code is a spec code. */
export function teardownProductTargets(found = [], specs = PRODUCT_SPECS) {
  const codes = new Set(specs.map((s) => s.code));
  return found.filter((p) => p && p.id && codes.has(p.code) && String(p.name || '').startsWith(SEED_PREFIX)).map((p) => p.id);
}
