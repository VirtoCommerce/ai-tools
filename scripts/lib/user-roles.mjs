/**
 * scripts/lib/user-roles.mjs
 *
 * Canonical registry mapping each named TEST USER ROLE to the environment
 * variables that carry its identity. This is the single source of truth for
 * "who are the test accounts" — so a seeder creates the SAME account a suite
 * references, on EVERY environment.
 *
 * Why this exists (VCST-5406): user identity used to live in two disconnected
 * places — the env-layered .env.{ENV}/.env.local (emails + per-env-suffixed
 * passwords, promoted by config.js / seed-common.mjs) AND committed test-data
 * CSVs with their own email/password literals that the seeders actually read.
 * On any env other than vcst the seeded account ≠ the {{USER_EMAIL}} / @td()
 * account the suites use, and passwords sat in the repo. Routing every user
 * seeder through this registry (after seed-common has loaded + suffix-promoted
 * the env) fixes both: identity comes from .env.{ENV}, secrets from .env.local.
 *
 * Consumers: reconcile-test-data.mjs (consistency gate), seed-users.mjs,
 * seed-b2b-fixtures.mjs, seed-impersonation-targets.mjs.
 *
 * NOTE: read env AFTER seed-common.mjs (or config.js) has run so the
 * `_${TEST_ENV.toUpperCase()}` suffix promotion has already collapsed per-env
 * secret variants (e.g. ORG_USER_PASSWORD_VCST) onto their base names.
 */

/**
 * @typedef {Object} UserRole
 * @property {string} key            Stable role key (also the {{PREFIX}} / @td() alias stem).
 * @property {string[]} emailVars    Env var names to try in order for the login/email.
 * @property {string} passwordVar    Env var name for the password (secret, .env.local).
 * @property {string} [idVar]        Env var carrying the account's platform GUID, if any.
 * @property {'admin'|'customer'|'org'} kind  Account shape.
 * @property {boolean} required      True = must resolve on every env (a CORE account).
 * @property {string} purpose        One-line description for reports.
 * @property {string} [group]        Customer group the contact must belong to (e.g. 'VIP' for loyalty).
 * @property {string} [currency]     Contact default currencyCode the seeder must set (e.g. 'EUR'); defaults to USD.
 * @property {boolean} [provision]   Admin-kind roles: true = the seeder must CREATE this admin account
 *                                   (e.g. IMPERSONATION_ADMIN). The bootstrap ADMIN has no flag — it
 *                                   already exists and must never be recreated.
 */

/** @type {UserRole[]} */
export const USER_ROLES = [
  { key: 'ADMIN', emailVars: ['ADMIN_EMAIL', 'ADMIN'], passwordVar: 'ADMIN_PASSWORD', kind: 'admin', required: true, purpose: 'Platform admin / OAuth password grant' },
  { key: 'USER', emailVars: ['USER_EMAIL'], passwordVar: 'USER_PASSWORD', idVar: 'TEST_USER_ID', kind: 'customer', required: true, purpose: 'Primary storefront shopper' },
  { key: 'USER2', emailVars: ['USER2_EMAIL'], passwordVar: 'USER2_PASSWORD', kind: 'customer', required: false, purpose: 'Second shopper — list-sharing / multi-user' },
  // No idVar: ORG_USER's runtime platform id resolves via @td(TECHFLOW_ADMIN.platform_id)
  // (USR-006, auto-written to aliases.{env}.json by the b2b-user seed writeback).
  { key: 'ORG_USER', emailVars: ['ORG_USER_EMAIL'], passwordVar: 'ORG_USER_PASSWORD', kind: 'org', required: false, purpose: 'Single-org B2B member' },
  { key: 'MULTI_ORG_USER', emailVars: ['MULTI_ORG_USER_EMAIL'], passwordVar: 'MULTI_ORG_USER_PASSWORD', kind: 'org', required: false, purpose: 'Multi-org member — org switching' },
  { key: 'EUR_USER', emailVars: ['EUR_USER_EMAIL'], passwordVar: 'EUR_USER_PASSWORD', kind: 'customer', required: false, currency: 'EUR', purpose: 'EUR-currency shopper' },
  { key: 'LOYALTY_VIP_USER', emailVars: ['LOYALTY_VIP_USER_EMAIL'], passwordVar: 'LOYALTY_VIP_USER_PASSWORD', kind: 'customer', required: false, group: 'VIP', purpose: 'Loyalty VIP tier' },
  { key: 'LOYALTY_WHOLESALE_USER', emailVars: ['LOYALTY_WHOLESALE_USER_EMAIL'], passwordVar: 'LOYALTY_WHOLESALE_USER_PASSWORD', kind: 'customer', required: false, group: 'Wholesale', purpose: 'Loyalty wholesale tier' },
  { key: 'LOYALTY_NOBAL_USER', emailVars: ['LOYALTY_NOBAL_USER_EMAIL'], passwordVar: 'LOYALTY_NOBAL_USER_PASSWORD', kind: 'customer', required: false, group: 'VIP', purpose: 'Loyalty zero-balance (insufficient-balance tests)' },
  // Org-scoped impersonation OPERATOR (org-maintainer @ TechFlow, incl. loginOnBehalf). kind:'org'
  // (NOT admin): the account is a CSV-native B2B org member (b2b/users.csv USR-024) — seeded via
  // provisionContactLogins, identity from .env, NOT provisioned by the admin path. No global role.
  { key: 'IMPERSONATION_ADMIN', emailVars: ['IMPERSONATION_ADMIN_EMAIL'], passwordVar: 'IMPERSONATION_ADMIN_PASSWORD', kind: 'org', required: false, purpose: 'Impersonation operator (org-scoped org-maintainer)' },
  { key: 'LOCKOUT_TEST', emailVars: ['LOCKOUT_TEST_EMAIL'], passwordVar: 'LOCKOUT_TEST_PASSWORD', kind: 'customer', required: false, purpose: 'Account-lockout tests' },
  { key: 'SALES_REP', emailVars: ['SALES_REP_EMAIL'], passwordVar: 'TEST_USER_PASSWORD', kind: 'org', required: false, purpose: 'Sales rep — scoped sales-rep xAPI (salesRepCustomers/Customer/Orders/OrderStatuses)' },
  // Sales rep holding the GLOBAL sales-rep role with ZERO org memberships — the myCustomersRoute
  // permission-guard redirect case (089 SR-FE-013a). Same account shape/passwordVar as SALES_REP;
  // seeded by seed-sales-rep.mjs (rep_key SR_REP_NOCUSTOMERS), NOT the generic user seeders (kind
  // 'org' is never provisioned by roleUsers()/adminUsers()). Registered here so td:reconcile's
  // auth-drift guard covers it too.
  { key: 'SALES_REP_NOCUSTOMERS', emailVars: ['SALES_REP_NOCUSTOMERS_EMAIL'], passwordVar: 'TEST_USER_PASSWORD', kind: 'org', required: false, purpose: 'Sales rep with the global sales-rep role but no org memberships (permission-guard redirect)' },
];

/**
 * Resolve one role against an env bag (defaults to process.env — which must have
 * already been suffix-promoted by seed-common.mjs / config.js).
 * @param {UserRole} role
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ key: string, kind: string, required: boolean, purpose: string,
 *            email: string|null, password: string|null, id: string|null,
 *            emailVar: string|null, present: boolean, missing: string[] }}
 */
export function resolveRole(role, env = process.env) {
  const emailVar = role.emailVars.find((v) => env[v] && String(env[v]).trim() !== '') || null;
  const email = emailVar ? String(env[emailVar]).trim() : null;
  const password = env[role.passwordVar] ? String(env[role.passwordVar]) : null;
  const id = role.idVar && env[role.idVar] ? String(env[role.idVar]).trim() : null;
  const missing = [];
  if (!email) missing.push(role.emailVars.join('|'));
  if (!password) missing.push(role.passwordVar);
  return {
    key: role.key, kind: role.kind, required: role.required, purpose: role.purpose,
    group: role.group || null, currency: role.currency || null, provision: role.provision || false,
    email, password, id, emailVar, present: missing.length === 0, missing,
  };
}

/** Resolve every role. @returns {ReturnType<typeof resolveRole>[]} */
export function resolveAllRoles(env = process.env) {
  return USER_ROLES.map((r) => resolveRole(r, env));
}

/** Look up a single role by key (throws if unknown). */
export function roleByKey(key) {
  const r = USER_ROLES.find((x) => x.key === key);
  if (!r) throw new Error(`unknown user role: ${key}`);
  return r;
}
