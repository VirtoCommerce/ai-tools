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
// category-link perm is excluded (products:link is precisely what it DOES hold).
export const CATALOG_LINK_EXCLUDED_PERMISSIONS = ['catalog:categories:link'];

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
// link a category). The [Authorize] gate is entity-type keyed, so a category-typed entry is
// forbidden regardless of whether the referenced ids exist.
export const LISTENTRYLINKS_ENDPOINT = '/api/catalog/listentrylinks';

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

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
/** Scan text for a runtime platform GUID that must never be committed to a spec/fixture. */
export function findGuidLeaks(text) {
  return (String(text).match(new RegExp(GUID_RE, 'gi')) || []);
}
