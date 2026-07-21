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

/** security/users/create body for the restricted Manager account (role attached globally). */
export function accountBody({ email, password, roleId, roleName, storeId }) {
  return {
    userName: email,
    email,
    password,
    storeId,
    userType: RESTRICTED_ACCOUNT.userType,
    isAdministrator: RESTRICTED_ACCOUNT.isAdministrator,
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

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
/** Scan text for a runtime platform GUID that must never be committed to a spec/fixture. */
export function findGuidLeaks(text) {
  return (String(text).match(new RegExp(GUID_RE, 'gi')) || []);
}
