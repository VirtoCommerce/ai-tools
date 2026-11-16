/**
 * sales-rep-layout-specs.mjs — SINGLE SOURCE OF TRUTH for the Sales Rep *saved-layout* fixture
 * (VCST-5367) and for the pure row/preference-name transforms the sales-rep seeder shares with its
 * drift-guard validator and unit tests.
 *
 * Side-effect-free (no env read, no network, no fs) so `seed-sales-rep.mjs`,
 * `validate-sales-rep-data.mjs`, and `scripts/unit/seed-sales-rep.test.mjs` can all import it.
 *
 * WHY A DEDICATED REP
 * -------------------
 * VCST-5367 added a per-user PERSISTED layout, stored as a Customer-module `CustomerPreference` on the
 * CALLER'S OWN user id. Two generations exist on the QA stands at the same time:
 *   - CURRENT (vc-module-sales-rep PR #24 + X-Frontend): the generic X-Frontend `layout` / `saveLayout`
 *     on `/graphql`, preference `Layout.{scope}[.{storeId}]`, rep scopes `salesRepDashboard` /
 *     `salesRepCustomerProfile` (scope rule `[A-Za-z][A-Za-z0-9]{0,63}`, read case-insensitively; the
 *     20-layout cap counts only `Layout.*` rows). `salesRepLayout` / `saveSalesRepLayout` are gone and
 *     old rows are NOT migrated (kb KB-6AF444D9, observed on vcptcore_qa1 2026-11-09).
 *   - LEGACY (stands still on a pre-PR-#24 Sales Rep build): `salesRepLayout` / `saveSalesRepLayout` on
 *     `POST /graphql/sales-rep`, preference `SalesRepLayout.{scope}[.{storeId}]`, scopes `dashboard` /
 *     `customerProfile`.
 * The seeder sweeps BOTH (`isLayoutPreference`), so it needs no per-env switch. The storefront cases
 * (091/093) drag, hide and **Save** blocks, i.e. they MUTATE that preference.
 *
 * `SR_REP_PRIMARY` is the shared happy-path rep that ~40 cases across 050m/089/091/093 depend on, and
 * its layout is verified NEVER-SAVED (both scopes resolve to `null` on vcptcore-qa, 2026-08-04). If
 * layout cases wrote it, those cases would become order-dependent and the "never saved ⇒ query returns
 * null" precondition would stop being reproducible. Hence `SR_REP_LAYOUT`: a rep whose persisted
 * layout is DISPOSABLE — the seeder wipes its rep layout preferences (both generations) on every reseed, so each
 * run starts from the same never-saved baseline, and the primary rep is never touched.
 *
 * TWO SERVED ORGS ARE LOAD-BEARING, not decoration: the customer-profile scope needs a customer to
 * open, and one case proves the saved layout is SCOPE-wide rather than per-customer (arrange on
 * customer A → open customer B → same arrangement). That needs a second served org.
 */

/** The disposable-layout rep. Business keys only — the runtime GUIDs live in aliases.<env>.json. */
export const LAYOUT_REP = {
  repKey: 'SR_REP_LAYOUT',
  aliasName: 'SR_REP_LAYOUT',
  email: 'agent-test-sr-layout@example.com',
  store: 'B2B-store',
  /** Served orgs (business keys into test-data/b2b/organizations.csv). >= 2 by design (see header). */
  servedOrgKeys: ['ORG-001', 'ORG-002'],
};

/** Minimum served orgs the scope-wide (not per-customer) layout case needs. */
export const MIN_SERVED_ORGS_FOR_LAYOUT = 2;

/**
 * Rep keys whose persisted layout the seeder is allowed to WIPE. Deliberately a one-element
 * allowlist: adding `SR_REP_PRIMARY` here would destroy the shared never-saved baseline.
 */
export const DISPOSABLE_LAYOUT_REP_KEYS = [LAYOUT_REP.repKey];

/** True when the seeder may reset this rep's persisted layout preferences. */
export const isDisposableLayoutRep = (repKey) => DISPOSABLE_LAYOUT_REP_KEYS.includes(String(repKey || '').trim());

/** CURRENT: the X-Frontend `saveLayout` preference prefix (vc-module-sales-rep PR #24 onward). */
export const LAYOUT_PREF_PREFIX = 'Layout';

/** CURRENT: the rep layout scopes the storefront persists independently (one preference row each). */
export const LAYOUT_SCOPES = ['salesRepDashboard', 'salesRepCustomerProfile'];

/** LEGACY: the VCST-5367 `saveSalesRepLayout` prefix and scopes (Sales Rep builds before PR #24). */
export const LEGACY_LAYOUT_PREF_PREFIX = 'SalesRepLayout';
export const LEGACY_LAYOUT_SCOPES = ['dashboard', 'customerProfile'];

const withStore = (base, storeId) => (storeId ? `${base}.${storeId}` : base);

/** CURRENT preference name: `Layout.{scope}` or, store-scoped, `Layout.{scope}.{storeId}` (PURE). */
export function layoutPreferenceName(scope, storeId = '') {
  return withStore(`${LAYOUT_PREF_PREFIX}.${scope}`, storeId);
}

/** LEGACY preference name: `SalesRepLayout.{scope}[.{storeId}]` (PURE). */
export function legacyLayoutPreferenceName(scope, storeId = '') {
  return withStore(`${LEGACY_LAYOUT_PREF_PREFIX}.${scope}`, storeId);
}

// CURRENT rows: only the REP scopes, case-insensitive (X-Frontend reads the scope case-insensitively).
// `Layout.*` is X-Frontend's generic store — another scope on the same account (a buyer
// `Layout.dashboard`, say) is not this fixture's to delete.
const CURRENT_LAYOUT_RE = new RegExp(`^${LAYOUT_PREF_PREFIX}\\.(${LAYOUT_SCOPES.join('|')})(\\.|$)`, 'i');
// LEGACY rows: the whole `SalesRepLayout` namespace was rep-only, so it is matched by prefix.
const LEGACY_LAYOUT_RE = new RegExp(`^${LEGACY_LAYOUT_PREF_PREFIX}(\\.|$)`);

/**
 * True when a CustomerPreference row is a REP layout row of EITHER generation (PURE), so one reseed
 * restores never-saved on a stand running the current build and on one still on the legacy build.
 */
export function isLayoutPreference(name) {
  const n = String(name || '').trim();
  return CURRENT_LAYOUT_RE.test(n) || LEGACY_LAYOUT_RE.test(n);
}

/**
 * Parse a `served_orgs` cell (PURE). Two shapes in the CSV:
 *   `ORG-001;ORG-002` → org business keys
 *   `PAGING:12`       → N dynamically-created AGENT-TEST-SR-Paging-NN orgs (SR_REP_PAGING)
 * Shared by the seeder (org provisioning + rep create) and the validator, so the two can't drift.
 */
export function parseServedOrgs(raw) {
  const value = String(raw || '').trim();
  if (/^PAGING:/i.test(value)) {
    return { orgKeys: [], pagingCount: parseInt(value.split(':')[1], 10) || 12 };
  }
  return { orgKeys: value.split(';').map((s) => s.trim()).filter(Boolean), pagingCount: 0 };
}

/** Name prefix of the `PAGING:N` orgs; the i-th (1-based) is `${PAGING_ORG_PREFIX}${i padded to 2}`. */
export const PAGING_ORG_PREFIX = 'AGENT-TEST-SR-Paging-';
export const pagingOrgName = (i) => `${PAGING_ORG_PREFIX}${String(i).padStart(2, '0')}`;

/**
 * SR_UNSERVED_ORG — an org that PROVABLY exists but that SR_REP_PRIMARY does not serve (VCST-5707
 * negative). It is not created on its own: it is one of SR_REP_PAGING's paging orgs, so its existence
 * is proven by `servedBy`'s own customer list. The seeder resolves it by the alias's committed `name`
 * and writes the runtime GUID to aliases.<env>.json only after checking that the org exists, that
 * `servedBy` serves it and that `notServedBy` does not. td:validate:sales-rep [8] checks the same
 * contract against the committed CSV.
 */
export const UNSERVED_ORG = Object.freeze({
  alias: 'SR_UNSERVED_ORG',
  servedBy: 'SR_REP_PAGING',
  notServedBy: 'SR_REP_PRIMARY',
  idFields: Object.freeze(['id', 'platform_id']),
});

/**
 * The account status a rep row DECLARES, in the same vocabulary `user-provision.mjs`
 * `hasStaleLockout()` / `statusFlags()` speak ('Locked' | 'Approved').
 *
 * Why this exists (REG-2026-08-24-1806): a rep account that collects failed logins is left with a
 * non-empty `LockoutEnd` / `accessFailedCount`, and a password reset does NOT clear either — so a
 * re-seed repaired the credential while the account stayed unauthenticable, and the next run failed
 * identically. `ensureSecurityAccount()` already self-heals that for CSV-driven b2b users; the
 * sales-rep seeder took a different code path (direct `resetSecurityPassword`) and had no
 * equivalent, which is the asymmetry this closes.
 *
 * `is_locked=true` (SR_REP_BLOCKED) means the platform lockout IS the fixture under test and must
 * NEVER be cleared — returning 'Locked' makes `hasStaleLockout()` itself refuse, so the exclusion
 * lives in one place instead of being re-implemented as a call-site branch.
 *
 * Loose CSV-boolean semantics deliberately match `seed-common.mjs` `csvBool` ('true'/'yes'/'y'/'1');
 * this module stays dependency-free so the validator and unit tests can import it.
 */
export function repFixtureStatus(row) {
  return /^(true|yes|y|1)$/i.test(String(row?.is_locked ?? '').trim()) ? 'Locked' : 'Approved';
}

/** The exact committed column contract of test-data/sales-rep/sales-reps.csv (order matters). */
export const SALES_REPS_COLUMNS = [
  'rep_key', 'email', 'first_name', 'last_name', 'full_name', 'store', 'served_orgs',
  'is_locked', 'lock_membership_org', 'contact_id', 'user_id', 'membership_locked_id',
  'seeded', 'test_purpose', 'context_org',
];

/** Columns that hold RUNTIME platform GUIDs — must stay EMPTY in the committed CSV (test-data.md). */
export const RUNTIME_ID_COLUMNS = ['contact_id', 'user_id', 'membership_locked_id'];

/** A committed fixture must carry NO runtime platform GUID (those live in aliases.<env>.json). */
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Seeded rep accounts use the AGENT-TEST- sweep convention so /qa-seed-data teardown finds them. */
export const REP_EMAIL_RE = /^agent-test-[a-z0-9.-]*@example\.com$/i;

/** The fields every CSV-backed SR_REP_* alias must declare (id → contact_id is the load-bearing one). */
export const REQUIRED_ALIAS_FIELDS = { id: 'contact_id', user_id: 'user_id', email: 'email' };
