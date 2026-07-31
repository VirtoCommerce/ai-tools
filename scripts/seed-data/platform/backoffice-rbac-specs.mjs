/**
 * scripts/seed-data/platform/backoffice-rbac-specs.mjs
 *
 * SINGLE source of truth (side-effect-free) for the back-office RBAC test account that
 * suites 059/060 CMS-123 + CMS-124 need: a PLATFORM (back-office / Manager) account that
 * authenticates but LACKS the Page Builder UPDATE permission, so:
 *   - CMS-123 (059): the restricted user opens the page-builder-shell and Save/Load/Clone
 *     are hidden/disabled;
 *   - CMS-124 (059): the restricted user's Bearer token gets HTTP 403 (not 401, not 500,
 *     not 204) on POST /api/page-builder-pages/grouped/{tgt}/content/{src}.
 *
 * Importing this module has NO side effects (no env load, no network) so the seeder, the
 * drift-guard validator, and the unit tests can all import the same definitions.
 *
 * Permission model (verified live on vcst-qa 2026-07-21, module VirtoCommerce.PageBuilderModule
 * 3.1017.0): the Page Builder permission group is `builder:*` — access/read/create/update/
 * delete/publish/templates/theme. The test's informal "page-builder:update" IS `builder:update`.
 * The restricted role is deliberately READ-ONLY page builder: it can enter the back office and
 * open the designer (builder:access + builder:read) but cannot write (no update/create/delete/
 * publish), which is exactly the boundary CMS-123/124 assert.
 *
 * No runtime GUID lives here (VCST-5406 / .claude/rules/test-data.md): the role_id is a stable
 * business key; the account's runtime platform user id is written to aliases.<env>.json by the
 * seeder (writeEnvAliasOverride).
 */

export const AGENT_PREFIX = 'AGENT-TEST-';

// The single permission the tests hinge on — must be ABSENT from the restricted role.
export const EXCLUDED_PERMISSION = 'builder:update';

// Every Page Builder WRITE permission the restricted role must NOT hold (superset of the one
// the copy endpoint checks — excluding all of them guarantees a 403 regardless of which the
// server enforces).
export const EXCLUDED_PERMISSIONS = [
  'builder:update', 'builder:create', 'builder:delete', 'builder:publish',
  'builder:templates', 'builder:theme',
];

// Read-only page-builder permission set: enough to authenticate into the back office and open
// the designer, nothing that can mutate/copy/publish a page.
export const RESTRICTED_ROLE = {
  role_id: 'AGENT-TEST-Restricted-CMS-Viewer',
  role_name: 'AGENT-TEST-Restricted-CMS-Viewer',
  description: 'AGENT-TEST restricted back-office role for CMS RBAC tests (CMS-123/124): read-only Page Builder, NO builder:update. Safe to delete.',
  permissions: ['builder:access', 'builder:read'],
};

// The restricted back-office account. Email is an env-invariant AGENT-TEST business key (same on
// every env, like LOYALTY_VIP_USER / LOCKOUT_TEST_USERS); the password is a secret resolved from
// .env.local at seed time (never committed). userType 'Manager' = back-office user; isAdministrator
// MUST be false so permission checks actually apply (an administrator bypasses them → would get 204,
// not the 403 CMS-124 asserts).
export const RESTRICTED_ACCOUNT = {
  aliasName: 'RESTRICTED_CMS_ADMIN',
  email: 'AGENT-TEST-restricted-cms@test.virtocommerce.com',
  userType: 'Manager',
  isAdministrator: false,
  passwordVar: 'RESTRICTED_CMS_ADMIN_PASSWORD',
  passwordFallback: 'Password1!', // localhost-safe default (mirrors user-provision.mjs PW_FALLBACK)
};

// The copy endpoint CMS-124 probes; the seeder's --verify step calls it with the restricted token
// and asserts 403. Group ids are irrelevant to the AUTHORIZE gate (it runs before handler binding).
export const COPY_ENDPOINT = (tgt, src) =>
  `/api/page-builder-pages/grouped/${encodeURIComponent(tgt)}/content/${encodeURIComponent(src)}`;

/** Idempotent role upsert body (PUT /api/platform/security/roles). */
export function roleBody(role = RESTRICTED_ROLE) {
  return {
    id: role.role_id,
    name: role.role_name,
    description: role.description,
    permissions: role.permissions.map((name) => ({ name })),
  };
}

/**
 * security/users/create body for a restricted Manager account (role attached globally).
 * `account` defaults to RESTRICTED_ACCOUNT so existing callers keep the CMS behaviour; the
 * catalog-link fixture passes CATALOG_LINK_ACCOUNT (also Manager / isAdministrator=false).
 */
export function accountBody({ email, password, roleId, roleName, storeId, account = RESTRICTED_ACCOUNT }) {
  return {
    userName: email,
    email,
    password,
    storeId,
    userType: account.userType,
    isAdministrator: account.isAdministrator,
    roles: [{ id: roleId, name: roleName }],
  };
}

/**
 * Assert the restricted role's permission set is correct — used by the validator AND the unit
 * tests. Returns nothing; throws with a clear message on any violation.
 */
export function assertRolePermissions(permissions = RESTRICTED_ROLE.permissions) {
  const set = new Set(permissions);
  const leaked = EXCLUDED_PERMISSIONS.filter((p) => set.has(p));
  if (leaked.length) {
    throw new Error(`restricted role must NOT carry write permission(s): ${leaked.join(', ')}`);
  }
  if (!set.has('builder:read') || !set.has('builder:access')) {
    throw new Error('restricted role must include builder:access + builder:read (so it can open the designer read-only)');
  }
}

// ============================================================================
// CATALOG Map/Link RBAC fixture (VCST-5318) — a products-only "Map" linker.
// ============================================================================
//
// VCST-5318 gates the catalog Map/Link picker with two new permissions:
// `catalog:categories:link` and `catalog:products:link` (verified present on
// vc-module-catalog 3.1036.0-pr-898 / vcptcore-qa 2026-07-17). This fixture is the
// PRODUCTS-ONLY linker the suite asserts against: it can link products/items into a
// virtual catalog but CANNOT link categories — i.e. it holds `catalog:products:link`
// and deliberately EXCLUDES `catalog:categories:link` (the whole point of the gate).
//
// Rationale for the exact permission set (from the VCST-5318 live AC analysis):
//   - The restriction is SOURCE-TYPE keyed — granting only products:link makes products
//     selectable and categories blocked (backend Forbid + picker row-dimming). So the
//     single excluded permission IS the boundary the tests hinge on.
//   - `*:create` perms are included because reaching the "Map" flow (virtual catalog →
//     Add (+) → "Link" → "Choose categories and items for mapping" picker) is CREATE-gated
//     (`canCreateCatalogItem`); a pure link-only role cannot reach the picker at all. So a
//     usable products-only linker needs catalog:create + the per-type create perms.
//   - Base back-office entry comes from the Manager account type (userType: Manager). An
//     assignable `platform:access` permission exists only on some builds, so this role does
//     NOT hard-depend on it — do not add it to the set.
//
// Same no-hardcode contract as the CMS fixture: no runtime GUID here; the role_id/email are
// stable business keys, and the account's runtime platform user id + role id are written to
// aliases.<env>.json by the seeder (writeEnvAliasOverride).

// The single permission the CATALOG_LINK_RESTRICTED fixture hinges on — must be ABSENT.
export const CATALOG_LINK_EXCLUDED_PERMISSION = 'catalog:categories:link';

// Every catalog link/write permission the products-only linker must NOT hold. Only the
// category-link perm is excluded (products:link is precisely what it DOES hold). Derived from
// the singular constant so the two can never drift apart.
export const CATALOG_LINK_EXCLUDED_PERMISSIONS = [CATALOG_LINK_EXCLUDED_PERMISSION];

// The catalog permissions a usable products-only linker MUST hold (base access + read + the
// create perms that gate the Map flow + the products link perm). Update/create allow reaching
// and using the Map picker; products:link is the productive boundary.
export const CATALOG_LINK_REQUIRED_PERMISSIONS = [
  'catalog:access', 'catalog:read',
  'catalog:categories:read', 'catalog:products:read',
  'catalog:update', 'catalog:create',
  'catalog:categories:create', 'catalog:products:create',
  'catalog:products:link',
];

// Products-only Map/Link role. Permission set = REQUIRED (there is nothing extra); it EXCLUDES
// catalog:categories:link, which is the whole point of the VCST-5318 gate.
export const CATALOG_LINK_ROLE = {
  role_id: 'AGENT-TEST-Catalog-Link-Restricted',
  role_name: 'AGENT-TEST-Catalog-Link-Restricted',
  description: 'AGENT-TEST products-only catalog Map/Link role for VCST-5318: can link products/items into a virtual catalog but NOT categories (holds catalog:products:link, EXCLUDES catalog:categories:link). Includes catalog:*:create because the Map flow is create-gated. Safe to delete.',
  permissions: [...CATALOG_LINK_REQUIRED_PERMISSIONS],
};

// The restricted back-office (Manager) account that carries the products-only Map/Link role.
// Email is an env-invariant AGENT-TEST business key; the password is a secret resolved from
// .env.local at seed time. userType 'Manager' = back-office user; isAdministrator MUST be false
// so the permission gate actually applies (an administrator bypasses it and could link anything).
export const CATALOG_LINK_ACCOUNT = {
  aliasName: 'CATALOG_LINK_RESTRICTED',
  email: 'AGENT-TEST-catalog-link-restricted@test.virtocommerce.com',
  userType: 'Manager',
  isAdministrator: false,
  passwordVar: 'CATALOG_LINK_RESTRICTED_PASSWORD',
  passwordFallback: 'Password1!', // localhost-safe default (mirrors user-provision.mjs PW_FALLBACK)
};

// The Create-Links endpoint the VCST-5318 backend guard protects; the seeder's --verify step
// posts a CATEGORY link entry with the restricted token and asserts 403 (products:link cannot
// link a category).
//
// The probe MUST use REAL, resolvable ids. This endpoint short-circuits to 200 when the
// referenced entries do not resolve — BEFORE the permission gate evaluates — so a dummy-id
// probe proves nothing: measured 2026-07-31 on vcst-qa, a token holding ZERO catalog
// permissions got 200 on a dummy-id category link, while the same token got 403 on a real
// one. The earlier "the gate is entity-type keyed, so ids need not exist" premise was wrong
// and made this check unable to fail for the right reason. See LINK_PROBE_VCATALOG_NAME.
export const LISTENTRYLINKS_ENDPOINT = '/api/catalog/listentrylinks';

// Single catalog-by-id route: the link probe READS the source catalog through it (to inherit its
// languages instead of hardcoding a locale) and DELETES its temp catalog through it. The id must be
// a PATH segment — the `?ids=` query form returns 405 here. PLAT-079's delete probe reuses it below.
export const CATALOG_BY_ID_ENDPOINT = (id) => `/api/catalog/catalogs/${encodeURIComponent(id)}`;

// The throwaway virtual catalog the link probe links INTO, so the probe never mutates a real
// (storefront-bound) virtual catalog. AGENT-TEST-prefixed and deleted in the probe's `finally`;
// a re-run reuses then deletes a leftover from a crashed run, and --teardown sweeps it.
export const LINK_PROBE_VCATALOG_NAME = 'AGENT-TEST-VERIFY-LINK-PROBE';

/**
 * Assert the products-only Map/Link role's permission set is correct — used by the validator
 * AND the unit tests. Throws with a clear message on any violation.
 */
export function assertCatalogLinkRolePermissions(permissions = CATALOG_LINK_ROLE.permissions) {
  const set = new Set(permissions);
  const leaked = CATALOG_LINK_EXCLUDED_PERMISSIONS.filter((p) => set.has(p));
  if (leaked.length) {
    throw new Error(`catalog-link restricted role must NOT carry ${leaked.join(', ')} — a products-only linker cannot link categories (VCST-5318 boundary)`);
  }
  const missing = CATALOG_LINK_REQUIRED_PERMISSIONS.filter((p) => !set.has(p));
  if (missing.length) {
    throw new Error(`catalog-link restricted role is missing required permission(s): ${missing.join(', ')} (needs base catalog access/read, create perms to reach the Map flow, and catalog:products:link)`);
  }
}

// ============================================================================
// SALES REP back-office RBAC fixture (SR-ADM-023 / candidate BL-SREP-003) — a
// read-only Sales Rep admin who can VIEW reps but cannot mutate.
// ============================================================================
//
// Source-verified permission model (vc-module-sales-rep `dev`,
// useSalesRepPermissions/index.ts): the embedded Sales Rep Admin app gates on the
// CUSTOMER module's member permissions, NOT on `sales-rep:access`.
//   - `customer:read`              → ACCESS + read (open the app, list/view reps). THE access gate.
//   - `customer:create/update/delete` → create/edit/delete a rep (the member side of a mutation).
//   - `platform:security:create/update/delete` → the rep's login account (a create/edit/delete
//     also touches the account, so BOTH the member perm AND the account perm are needed to mutate).
//   - `sales-rep:access` only DEFINES a user as a STOREFRONT rep — it does NOT gate the back-office
//     app, so it is deliberately NOT part of this fixture.
//   - isAdministrator=true bypasses ALL permission checks, so the account MUST be a Manager with
//     isAdministrator=false or the gate never applies.
//
// This fixture is the finest gate boundary: it holds ONLY `customer:read` (enough to enter the back
// office and open the Sales Rep app read-only) and EXCLUDES every write perm that would let it
// create/edit/delete a rep or the rep's login account. The single representative boundary permission
// is `customer:update` (editing an existing rep — the canonical "mutate a rep" action); it is a
// member of the full excluded set below, exactly as EXCLUDED_PERMISSION ⊂ EXCLUDED_PERMISSIONS for
// the CMS fixture.
//
// Same no-hardcode contract: no runtime GUID here; role_id/email are stable business keys, and the
// account's runtime platform user id + role id are written to aliases.<env>.json by the seeder.

// The single representative permission the SR-ADM-023 read-only boundary hinges on — must be ABSENT.
export const SALESREP_READONLY_EXCLUDED_PERMISSION = 'customer:update';

// Every WRITE permission the read-only Sales Rep admin must NOT hold: the member-side mutate perms
// AND the account-side (platform:security) mutate perms. Excluding all of them guarantees the app
// cannot create/edit/delete a rep regardless of which perm a given mutate path enforces.
export const SALESREP_READONLY_EXCLUDED_PERMISSIONS = [
  'customer:create', 'customer:update', 'customer:delete',
  'platform:security:create', 'platform:security:update', 'platform:security:delete',
];

// The permission(s) a usable read-only Sales Rep admin MUST hold. `customer:read` is the whole
// access+read gate — nothing else is needed to open the app and view reps.
export const SALESREP_READONLY_REQUIRED_PERMISSIONS = ['customer:read'];

// Read-only Sales Rep admin role: customer:read only. It can enter the back office and open the
// Sales Rep app read-only, but holds no perm that can create/edit/delete a rep or its login account.
export const SALESREP_READONLY_ROLE = {
  role_id: 'AGENT-TEST-SalesRep-ReadOnly',
  role_name: 'AGENT-TEST-SalesRep-ReadOnly',
  description: 'AGENT-TEST read-only Sales Rep admin role for SR-ADM-023 / candidate BL-SREP-003: holds customer:read (opens the Sales Rep back-office app + views reps) but EXCLUDES every mutate perm (customer:create/update/delete + platform:security:create/update/delete) so it cannot create/edit/delete a rep or its login account. Gates on customer member perms, NOT sales-rep:access. Safe to delete.',
  permissions: [...SALESREP_READONLY_REQUIRED_PERMISSIONS],
};

// The read-only Sales Rep back-office (Manager) account. Email is an env-invariant AGENT-TEST
// business key; the password is a secret resolved from .env.local at seed time. userType 'Manager'
// = back-office user; isAdministrator MUST be false so the permission gate actually applies (an
// administrator bypasses every check and could mutate reps freely).
export const SALESREP_READONLY_ACCOUNT = {
  aliasName: 'RESTRICTED_ADMIN_SALESREP_READONLY',
  email: 'AGENT-TEST-restricted-salesrep@test.virtocommerce.com',
  userType: 'Manager',
  isAdministrator: false,
  passwordVar: 'RESTRICTED_SALESREP_ADMIN_PASSWORD',
  passwordFallback: 'Password1!', // localhost-safe default (mirrors user-provision.mjs PW_FALLBACK)
};

// The Platform endpoint the seeder's --verify step reads with the restricted token: it must reflect
// customer:read present and the six write perms absent (isAdministrator=false), proving the gate
// applies to this account. No mutating call is made — verification is read-only.
export const CURRENTUSER_ENDPOINT = '/api/platform/security/currentuser';

/**
 * Assert the read-only Sales Rep admin role's permission set is correct — used by the validator AND
 * the unit tests. Throws with a clear message on any violation.
 */
export function assertSalesRepReadOnlyRolePermissions(permissions = SALESREP_READONLY_ROLE.permissions) {
  const set = new Set(permissions);
  const leaked = SALESREP_READONLY_EXCLUDED_PERMISSIONS.filter((p) => set.has(p));
  if (leaked.length) {
    throw new Error(`read-only Sales Rep role must NOT carry write permission(s): ${leaked.join(', ')} — it must be able to VIEW reps but not mutate them (SR-ADM-023 boundary)`);
  }
  const missing = SALESREP_READONLY_REQUIRED_PERMISSIONS.filter((p) => !set.has(p));
  if (missing.length) {
    throw new Error(`read-only Sales Rep role is missing required permission(s): ${missing.join(', ')} (needs customer:read — the access/read gate for the Sales Rep back-office app)`);
  }
}

// ============================================================================
// SALES REP back-office RBAC matrix — the three DISCRIMINATING fixtures that,
// with the read-only fixture above and the no-access CMS control, exercise the
// COMPLETE SalesRepController permission matrix (api/sales-rep).
// ============================================================================
//
// Source-verified matrix (SalesRepController.cs — multiple [Authorize] = logical AND):
//   - Read   (search / roles / dictionaries / get) → customer:read
//   - Create → customer:create  AND platform:security:create
//   - Update → customer:update  AND platform:security:update
//   - Delete → customer:delete  AND platform:security:delete
//   - Account-ops (block / unblock / set-password) → platform:security:update ONLY
//                 (NOT customer:update) — a distinct permission class
//   - isAdministrator=true bypasses ALL of the above.
//
// The READONLY fixture (customer:read only) and the no-access CMS control cover the two
// extremes. These three isolate the interesting interior of the matrix:
//   ACCOUNTOPS — the account-ops class in isolation (platform:security:update WITHOUT
//                customer:update): block/unblock/set-password succeed, entity Update 403s.
//   MEMBERONLY — the AND from the other side (customer:update WITHOUT platform:security:update):
//                entity Update STILL 403s, and block 403s.
//   FULL       — the permissioned NON-admin positive control: holds the full CRUD + account-ops
//                perm set and is NOT isAdministrator, so it exercises the REAL gate (not the bypass).
//
// The complete Sales Rep permission universe, split by side (member vs account). Declared once so
// every fixture's include/exclude set is derived from the same source and they cannot drift.
export const SALESREP_MEMBER_MUTATE_PERMISSIONS = ['customer:create', 'customer:update', 'customer:delete'];
export const SALESREP_ACCOUNT_MUTATE_PERMISSIONS = ['platform:security:create', 'platform:security:update', 'platform:security:delete'];
export const SALESREP_ALL_MUTATE_PERMISSIONS = [...SALESREP_MEMBER_MUTATE_PERMISSIONS, ...SALESREP_ACCOUNT_MUTATE_PERMISSIONS];

/**
 * Shared permission-set assertion (include-set present + exclude-set absent). The three named
 * asserts below wrap this so each fixture mirrors assertSalesRepReadOnlyRolePermissions while the
 * check logic lives in one place. Throws with a clear message on any violation.
 */
function assertPermissionSet(permissions, { required, excluded, label }) {
  const set = new Set(permissions);
  const leaked = (excluded || []).filter((p) => set.has(p));
  if (leaked.length) {
    throw new Error(`${label} role must NOT carry permission(s): ${leaked.join(', ')} (boundary violation)`);
  }
  const missing = (required || []).filter((p) => !set.has(p));
  if (missing.length) {
    throw new Error(`${label} role is missing required permission(s): ${missing.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// 1. ACCOUNT-OPS: platform:security:update WITHOUT customer:update.
//    Isolates the account-ops class — block/unblock/set-password should SUCCEED (they gate on
//    platform:security:update only), while entity Update should 403 (it also needs customer:update,
//    which this role lacks). Representative boundary = customer:update (the perm whose absence
//    forbids entity Update).
// ---------------------------------------------------------------------------
export const SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS = ['customer:read', 'platform:security:update'];
export const SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSIONS = [
  'customer:create', 'customer:update', 'customer:delete',
  'platform:security:create', 'platform:security:delete',
];
export const SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION = 'customer:update';

export const SALESREP_ACCOUNTOPS_ROLE = {
  role_id: 'AGENT-TEST-SalesRep-AccountOps',
  role_name: 'AGENT-TEST-SalesRep-AccountOps',
  description: 'AGENT-TEST Sales Rep admin role isolating the ACCOUNT-OPS class (SalesRepController matrix): holds customer:read + platform:security:update so block/unblock/set-password succeed, but EXCLUDES customer:update (+ the other member/account mutate perms) so entity Update 403s. Proves account-ops gate on platform:security:update ONLY, not customer:update. isAdministrator=false. Safe to delete.',
  permissions: [...SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS],
};

export const SALESREP_ACCOUNTOPS_ACCOUNT = {
  aliasName: 'RESTRICTED_ADMIN_SALESREP_ACCOUNTOPS',
  email: 'AGENT-TEST-salesrep-accountops@test.virtocommerce.com',
  userType: 'Manager',
  isAdministrator: false,
  passwordVar: 'RESTRICTED_SALESREP_ADMIN_PASSWORD',
  passwordFallback: 'Password1!',
};

export function assertSalesRepAccountOpsRolePermissions(permissions = SALESREP_ACCOUNTOPS_ROLE.permissions) {
  assertPermissionSet(permissions, {
    required: SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS,
    excluded: SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSIONS,
    label: 'account-ops Sales Rep',
  });
}

// ---------------------------------------------------------------------------
// 2. MEMBER-ONLY: customer:update WITHOUT platform:security:update.
//    Proves the AND from the other side — entity Update still 403s (it needs BOTH customer:update
//    AND platform:security:update; this role has only the member side), and block also 403s (it
//    needs platform:security:update). Representative boundary = platform:security:update.
// ---------------------------------------------------------------------------
export const SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS = ['customer:read', 'customer:update'];
export const SALESREP_MEMBERONLY_EXCLUDED_PERMISSIONS = [
  'customer:create', 'customer:delete',
  'platform:security:create', 'platform:security:update', 'platform:security:delete',
];
export const SALESREP_MEMBERONLY_EXCLUDED_PERMISSION = 'platform:security:update';

export const SALESREP_MEMBERONLY_ROLE = {
  role_id: 'AGENT-TEST-SalesRep-MemberOnly',
  role_name: 'AGENT-TEST-SalesRep-MemberOnly',
  description: 'AGENT-TEST Sales Rep admin role proving the Update AND-gate from the member side (SalesRepController matrix): holds customer:read + customer:update but EXCLUDES platform:security:update (+ the other mutate perms), so entity Update STILL 403s (needs the account side too) and block 403s. Complements ACCOUNT-OPS. isAdministrator=false. Safe to delete.',
  permissions: [...SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS],
};

export const SALESREP_MEMBERONLY_ACCOUNT = {
  aliasName: 'RESTRICTED_ADMIN_SALESREP_MEMBERONLY',
  email: 'AGENT-TEST-salesrep-memberonly@test.virtocommerce.com',
  userType: 'Manager',
  isAdministrator: false,
  passwordVar: 'RESTRICTED_SALESREP_ADMIN_PASSWORD',
  passwordFallback: 'Password1!',
};

export function assertSalesRepMemberOnlyRolePermissions(permissions = SALESREP_MEMBERONLY_ROLE.permissions) {
  assertPermissionSet(permissions, {
    required: SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS,
    excluded: SALESREP_MEMBERONLY_EXCLUDED_PERMISSIONS,
    label: 'member-only Sales Rep',
  });
}

// ---------------------------------------------------------------------------
// 3. FULL: the permissioned NON-admin positive control.
//    Holds the full CRUD + account-ops perm set (customer:read/create/update/delete +
//    platform:security:create/update/delete) and is NOT isAdministrator — so a properly permissioned
//    non-admin can do everything by satisfying the real [Authorize] gate, NOT by the admin bypass.
//    There is no excluded permission (excluded set is []); the load-bearing negative assertion is
//    isAdministrator=false.
// ---------------------------------------------------------------------------
export const SALESREP_FULL_REQUIRED_PERMISSIONS = [
  'customer:read',
  ...SALESREP_MEMBER_MUTATE_PERMISSIONS,   // customer:create/update/delete
  ...SALESREP_ACCOUNT_MUTATE_PERMISSIONS,  // platform:security:create/update/delete
];
export const SALESREP_FULL_EXCLUDED_PERMISSIONS = []; // positive control — nothing excluded
export const SALESREP_FULL_EXCLUDED_PERMISSION = null; // no boundary perm; gate is exercised, not bypassed

export const SALESREP_FULL_ROLE = {
  role_id: 'AGENT-TEST-SalesRep-Full',
  role_name: 'AGENT-TEST-SalesRep-Full',
  description: 'AGENT-TEST Sales Rep admin POSITIVE CONTROL (SalesRepController matrix): holds the full CRUD + account-ops perm set (customer:read/create/update/delete + platform:security:create/update/delete) yet is isAdministrator=false, so it exercises the REAL permission gate (not the admin bypass). Proves a properly-permissioned non-admin can create/update/delete a rep and run account-ops. Safe to delete.',
  permissions: [...SALESREP_FULL_REQUIRED_PERMISSIONS],
};

export const SALESREP_FULL_ACCOUNT = {
  aliasName: 'RESTRICTED_ADMIN_SALESREP_FULL',
  email: 'AGENT-TEST-salesrep-full@test.virtocommerce.com',
  userType: 'Manager',
  isAdministrator: false, // load-bearing: the positive control must NOT be an administrator
  passwordVar: 'RESTRICTED_SALESREP_ADMIN_PASSWORD',
  passwordFallback: 'Password1!',
};

export function assertSalesRepFullRolePermissions(permissions = SALESREP_FULL_ROLE.permissions) {
  assertPermissionSet(permissions, {
    required: SALESREP_FULL_REQUIRED_PERMISSIONS,
    excluded: SALESREP_FULL_EXCLUDED_PERMISSIONS,
    label: 'full Sales Rep positive control',
  });
  if (SALESREP_FULL_ACCOUNT.isAdministrator !== false) {
    throw new Error('full Sales Rep positive control MUST be isAdministrator=false — it has to exercise the real gate, not the admin bypass');
  }
}

// ============================================================================
// CATALOG READ-ONLY RBAC fixture (PLAT-079 "Authorization Scopes", suite
// 020-platform-users-roles-settings) — a back-office role that can VIEW the
// catalog but cannot create or delete catalog items.
// ============================================================================
//
// PLAT-079 asserts that a role scoped to catalog:read ONLY still gets a 403
// Forbidden (not 200) when it attempts a catalog CREATE or DELETE — i.e. the
// RBAC gate blocks BOTH mutate directions, not just one. The nearest existing
// fixture, CATALOG_LINK_ROLE above, is the wrong shape for this: it's a
// products-only Map/Link linker that deliberately HOLDS catalog:create (to
// reach the create-gated Map flow) and only excludes catalog:categories:link.
// This fixture is the opposite boundary — read-only, both create AND delete
// excluded.
//
// Same no-hardcode contract as the other fixtures in this file: no runtime
// GUID here; role_id/email are stable business keys, and the account's
// runtime platform user id + role id are written to aliases.<env>.json by the
// seeder (writeEnvAliasOverride).

// The two catalog mutate permissions the read-only role must NOT hold — the
// PLAT-079 boundary hinges on BOTH being absent (create AND delete each 403).
export const CATALOG_READONLY_EXCLUDED_PERMISSIONS = ['catalog:create', 'catalog:delete'];

// Representative excluded permission for the alias's `excluded_permission` field
// (mirrors the SalesRep ACCOUNTOPS/MEMBERONLY pattern — a single representative
// value even though the full exclude-set has more than one member).
export const CATALOG_READONLY_EXCLUDED_PERMISSION = 'catalog:create';

// The permission(s) a usable read-only catalog viewer MUST hold: base access +
// read — enough to enter the back office and view catalog items, nothing more.
export const CATALOG_READONLY_REQUIRED_PERMISSIONS = ['catalog:access', 'catalog:read'];

// Read-only catalog role: catalog:access + catalog:read only. EXCLUDES both
// catalog:create and catalog:delete, which is exactly the PLAT-079 boundary.
export const CATALOG_READONLY_ROLE = {
  role_id: 'AGENT-TEST-Catalog-Read-Only',
  role_name: 'AGENT-TEST-Catalog-Read-Only',
  description: 'AGENT-TEST catalog:read-ONLY back-office role for PLAT-079 (Authorization Scopes): holds catalog:access + catalog:read (view catalog items) but EXCLUDES catalog:create AND catalog:delete — both mutate directions must 403, not just one. Safe to delete.',
  permissions: [...CATALOG_READONLY_REQUIRED_PERMISSIONS],
};

// The restricted back-office (Manager) account that carries the read-only catalog role. Email is
// an env-invariant AGENT-TEST business key; the password is a secret resolved from .env.local at
// seed time. userType 'Manager' = back-office user; isAdministrator MUST be false so the
// permission gate actually applies (an administrator bypasses it and would get 200, not 403).
export const CATALOG_READONLY_ACCOUNT = {
  aliasName: 'CATALOG_READ_ONLY',
  email: 'AGENT-TEST-catalog-readonly@test.virtocommerce.com',
  userType: 'Manager',
  isAdministrator: false,
  passwordVar: 'CATALOG_READ_ONLY_PASSWORD',
  passwordFallback: 'Password1!', // localhost-safe default (mirrors user-provision.mjs PW_FALLBACK)
};

// The catalog endpoints PLAT-079 probes: POST creates a catalog (catalog:create), DELETE removes
// one by id (catalog:delete). The seeder's --verify step calls both with the restricted token and
// asserts 403 on each — here the [Authorize] gate DOES run before handler binding, so a
// nonexistent catalog id still returns 403 for the DELETE probe (measured 2026-07-31 on vcst-qa).
// That is route-specific: LISTENTRYLINKS_ENDPOINT behaves the opposite way — see its note.
export const CATALOG_CREATE_ENDPOINT = '/api/catalog/catalogs';
export const CATALOG_DELETE_ENDPOINT = CATALOG_BY_ID_ENDPOINT;

/**
 * Assert the read-only catalog role's permission set is correct — used by the validator AND the
 * unit tests. Throws with a clear message on any violation.
 */
export function assertCatalogReadOnlyRolePermissions(permissions = CATALOG_READONLY_ROLE.permissions) {
  assertPermissionSet(permissions, {
    required: CATALOG_READONLY_REQUIRED_PERMISSIONS,
    excluded: CATALOG_READONLY_EXCLUDED_PERMISSIONS,
    label: 'read-only catalog (PLAT-079)',
  });
}

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
/** Scan text for a runtime platform GUID that must never be committed to a spec/fixture. */
export function findGuidLeaks(text) {
  return (String(text).match(new RegExp(GUID_RE, 'gi')) || []);
}
