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
 * VCST-5367 added a per-user PERSISTED layout — `salesRepLayout` / `saveSalesRepLayout` on the scoped
 * `POST /graphql/sales-rep` — stored as a Customer-module `CustomerPreference` named
 * `SalesRepLayout.{scope}[.{storeId}]` on the CALLER'S OWN user id. The storefront cases (091/093)
 * drag, hide and **Save** blocks, i.e. they MUTATE that preference.
 *
 * `SR_REP_PRIMARY` is the shared happy-path rep that ~40 cases across 050m/089/091/093 depend on, and
 * its layout is verified NEVER-SAVED (both scopes resolve to `null` on vcptcore-qa, 2026-08-04). If
 * layout cases wrote it, those cases would become order-dependent and the "never saved ⇒ query returns
 * null" precondition would stop being reproducible. Hence `SR_REP_LAYOUT`: a rep whose persisted
 * layout is DISPOSABLE — the seeder wipes its `SalesRepLayout.*` preferences on every reseed, so each
 * run starts from the same never-saved baseline, and the primary rep is never touched.
 *
 * TWO SERVED ORGS ARE LOAD-BEARING, not decoration: the `customerProfile` scope needs a customer to
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

/** CustomerPreference name prefix VCST-5367 stores the layout under. */
export const LAYOUT_PREF_PREFIX = 'SalesRepLayout';

/** The layout scopes the storefront persists independently (one preference row each). */
export const LAYOUT_SCOPES = ['dashboard', 'customerProfile'];

/**
 * The CustomerPreference name for a scope: `SalesRepLayout.{scope}` or, store-scoped,
 * `SalesRepLayout.{scope}.{storeId}` (PURE).
 */
export function layoutPreferenceName(scope, storeId = '') {
  const base = `${LAYOUT_PREF_PREFIX}.${scope}`;
  return storeId ? `${base}.${storeId}` : base;
}

/**
 * True when a CustomerPreference row is a VCST-5367 layout row — matched by PREFIX, not by an exact
 * key, so a change in the store-scoping suffix (or a new scope) still gets swept (PURE).
 */
export function isLayoutPreference(name) {
  return new RegExp(`^${LAYOUT_PREF_PREFIX}(\\.|$)`).test(String(name || '').trim());
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
