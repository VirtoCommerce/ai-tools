/**
 * punchout-specs.mjs — single source of truth for the VCST-5886 Punchout cXML test data.
 *
 * SIDE-EFFECT-FREE: no env load, no network, no main(). Imported by seed-punchout.mjs (provision +
 * live verify), validate-punchout-data.mjs (static drift guard) and the teardown-scope unit test.
 *
 * What it declares, and where each value's source of truth is:
 *
 *  1. CONFIGURATIONS — the four `Punchout:Configurations` entries are PLATFORM APP SETTINGS, deployed
 *     per env through vc-deploy-dev `infra/environments.yml` (qa1: vc-deploy-dev#6693). There is no
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
    purpose: 'no StoreId at all → cXML 500 for any identity (N16)' },
];

/** Platform default lifetimes when a configuration omits them (developer notes, VCST-5886). */
export const DEFAULT_TOKEN_LIFETIME = '00:15:00';
export const DEFAULT_SESSION_LIFETIME = '04:00:00';

/**
 * What each env actually deployed. Keyed by TEST_ENV. Only envs listed here get config facts in their
 * overlay. `storeExists` is asserted live by the seeder's --verify (GET /api/stores/{id}).
 */
export const DEPLOYED_CONFIGS = {
  vcptcore_qa1: {
    source: 'vc-deploy-dev#6693 infra/environments.yml (Punchout__Configurations__0..3), deployed 2026-10-01',
    configs: {
      0: { storeId: 'B2B-store', storeExists: true, senderDomain: 'NetworkId', allowedReturnUrls: ['https://punchoutcommerce.com/*'],
           tokenLifetime: '00:15:00', sessionLifetime: '04:00:00' },
      1: { storeId: 'New-super', storeExists: true, senderDomain: '', allowedReturnUrls: [],
           tokenLifetime: '00:02:00', sessionLifetime: '00:10:00' },
      2: { storeId: 'AGENT-TEST-no-such-store', storeExists: false, senderDomain: '', allowedReturnUrls: [],
           tokenLifetime: '', sessionLifetime: '' },
      3: { storeId: '', storeExists: false, senderDomain: '', allowedReturnUrls: [],
           tokenLifetime: '', sessionLifetime: '' },
    },
  },
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

export function hhmmssToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
}

// ── 2. Mappings ─────────────────────────────────────────────────────────────────────────────────

export const MAPPING_SPECS = [
  { alias: 'PUNCHOUT_MAPPING_DEFAULT', externalId: 'AGENT-TEST-PO-100', personaEmailVar: 'USER_EMAIL',
    owned: false, maxOrganizations: 1, ownerNote: 'created by /qa-test VCST-5886 step 1r; deleted at run close-out — this seeder only registers it' },
  { alias: 'PUNCHOUT_MAPPING_MULTI_ORG', externalId: 'AGENT-TEST-PO-200', personaEmailVar: 'MULTI_ORG_USER_EMAIL',
    owned: true, minOrganizations: 2, ownerNote: 'seed-punchout.mjs find-or-create; teardown deletes it by id' },
];

/** External ids this seeder must never delete or mutate, whatever a search returns. */
export const PROTECTED_EXTERNAL_IDS = new Set(MAPPING_SPECS.filter((m) => !m.owned).map((m) => m.externalId));

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
  { name: 'config3 + unmapped identity → 500 (no StoreId)',
    config: 3, identity: 'AGENT-TEST-PO-UNMAPPED', domain: 'NetworkId', returnUrl: ALLOWED_RETURN_URL, expectCode: '500' },
];

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
