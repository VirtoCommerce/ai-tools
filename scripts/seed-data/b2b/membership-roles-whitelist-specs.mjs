/**
 * membership-roles-whitelist-specs.mjs — side-effect-free source of truth for the STORE-LEVEL
 * MEMBERSHIP-ROLES WHITELIST fixture (`Customer.MembershipRolesWhitelist` on tenant `Store`/B2B-store).
 *
 * Importing this module has NO side effects (no env read, no fs, no network), so the runner
 * (`set-membership-roles-whitelist.mjs`), the drift guard (`validate-b2b-data.mjs`) and the unit
 * tests (`scripts/unit/membership-roles-whitelist.test.mjs`) all import the same functions.
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────────────────────────
 * A STATE SETTER on a platform SETTING, in the shape of `set-membership-lock.mjs` — not an additive
 * find-or-create seeder. There is no entity to create and nothing to name, so `AGENT-TEST-` has
 * nothing to prefix here; the safety story is (1) the write touches exactly ONE settings key, and
 * (2) teardown restores the CAPTURED PRE-STATE rather than a hardcoded "clean" value.
 *
 * ── THE MECHANISM, MEASURED LIVE ON vcst 2026-09-18 + READ FROM SOURCE ──────────────────────────
 * The v2 settings API separates the dictionary POOL from the SELECTED value, and the LEGACY v1 API
 * conflates them. Getting this backwards is the single most likely way to write the wrong field:
 *
 *   GET  /api/platform/settings/v2/tenant/Store/schema        -> [{name, allowedValues, ...}]
 *          `allowedValues` = the POOL (what the operator may pick from). For this setting it is the
 *          HARDCODED C# literal, NOT anything stored per store.
 *   GET  /api/platform/settings/v2/tenant/Store/{id}/values   -> flat { settingName: value }
 *          a dictionary setting's value is the ARRAY of SELECTED entries. THIS is the whitelist.
 *   POST /api/platform/settings/v2/tenant/Store/{id}/values   <- flat { settingName: value }
 *          a PARTIAL MERGE: only the supplied keys move (measured — all 106 keys survived a
 *          single-key POST). It does NOT validate against the pool (measured — an out-of-pool role
 *          name was accepted and persisted).
 *
 * The legacy `GET /api/platform/settings` reports the SELECTED set in its `allowedValues` field,
 * which is why BL-B2B-011 says "content lives in allowedValues, never value". That is correct FOR V1
 * and inverted for V2. Both readings agree on the same underlying data; only the field name differs.
 *
 * ── EMPTY DOES NOT MEAN THE SAME THING AT STORE SCOPE ────────────────────────────────────────────
 * BL-B2B-011 records "an EMPTY whitelist means NO restriction -> ALL roles". That is true at GLOBAL
 * scope. At STORE scope it is NOT, and the difference is load-bearing for teardown:
 *   rolesPickerService.js (vc-module-customer@dev Scripts/services/rolesPickerService.js)
 *     var storeValues = (values && values[options.whitelistSettingId]) || [];
 *     if (storeValues.length) { whitelist = storeValues; reapplyWhitelist(); }
 * An EMPTY store value is falsy-length, so the store override is SKIPPED and the picker falls back
 * to the GLOBAL whitelist. On this environment the global value is `[]`, so global-empty then means
 * all roles — but that is two hops, not one, and a deployment with a non-empty global whitelist
 * would behave completely differently. Clearing this store key to empty is therefore NOT a neutral
 * teardown; it is a third behavioural state. Teardown restores the captured pre-state.
 */

import { GRANTING_ROLES, PERM_ACCESS } from '../sales-rep/sales-rep-docs-specs.mjs';

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 1. IDENTITY — the setting, the tenant, the alias
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export const SETTING_NAME = 'Customer.MembershipRolesWhitelist';
export const TENANT_TYPE = 'Store';

/**
 * The `@td()` alias this fixture owns. Runtime/observed fields are EMPTY in the committed base and
 * are supplied per env by `aliases.<env>.json` (the multi-env writeback rule) — a whitelist is live
 * state, and the captured pre-state is by definition per-environment.
 */
export const ALIAS = 'B2B_STORE_MEMBERSHIP_ROLES';

/**
 * Fields the alias declares.
 *
 * ── FIELD SHAPES, AND WHY TWO OF THEM ARE JSON-ARRAY-SHAPED STRINGS ────────────────────────────
 * `@td(ALIAS.field)` substitutes a field's value as RAW TEXT (`scripts/lib/test-data-resolver.ts`),
 * so the shape of the stored string decides what a case can do with it:
 *
 *   · `org_roles` / `seeded_values` / `sales_rep_roles` are SEMICOLON-JOINED DISPLAY strings
 *     ("A;B;C"). They read well in a Steps cell and in a log line. They CANNOT be embedded in a
 *     REST body as a JSON array — substituted unquoted they are a syntax error, quoted they are one
 *     string containing semicolons. They are kept exactly as they are: the `[10]` guard, the unit
 *     tests and the 027b cases all read them today.
 *   · `pre_state`, `seeded_values_json` and `narrowed_values` are JSON-ARRAY-SHAPED strings
 *     (`["A","B"]`). Substituted UNQUOTED into a request body they serialize as a real array, which
 *     is what a `POST .../values` body and a Cleanup restore need. `pre_state` set this convention;
 *     the two new fields follow it rather than inventing a second one.
 *
 * Every runtime field is EMPTY in the committed base and is supplied per env by `aliases.<env>.json`.
 */
export const ALIAS_RUNTIME_FIELDS = Object.freeze([
  'seeded_values', 'seeded_values_json', 'sales_rep_roles', 'narrowed_values', 'pre_state', 'captured_at',
]);
export const ALIAS_STATIC_FIELDS = Object.freeze(['setting', 'tenant_type', 'org_roles', 'narrowed_omitted_role']);

/** The alias fields whose value must parse as a JSON array of strings when non-empty. */
export const ALIAS_JSON_ARRAY_FIELDS = Object.freeze(['pre_state', 'seeded_values_json', 'narrowed_values']);

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 2. THE VALUES — three authored org roles + a LIVE-RESOLVED sales-rep set
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The three organization roles, as the operator named them.
 *
 * These are NOT free invention and NOT transcribed from a screen: they are exactly the module's own
 * hardcoded `AllowedValues` literal, so each one is guaranteed to be an offerable option:
 *   vc-module-customer@dev src/VirtoCommerce.CustomerModule.Core/ModuleConstants.cs
 *     AllowedValues = ["Organization employee", "Purchasing agent", "Organization maintainer"]
 * The runner still matches every one against the LIVE roles list before writing (`findRoleProblems`)
 * — a whitelist entry that is not a real role is silently invisible in the picker and proves nothing.
 */
export const ORG_ROLE_NAMES = Object.freeze(['Organization employee', 'Purchasing agent', 'Organization maintainer']);

/** The module's hardcoded option pool, mirrored so the divergence guard can compare against it. */
export const DESCRIPTOR_POOL = Object.freeze(['Organization employee', 'Purchasing agent', 'Organization maintainer']);
export const DESCRIPTOR_POOL_SOURCE_REF =
  'vc-module-customer@dev src/VirtoCommerce.CustomerModule.Core/ModuleConstants.cs — Settings.General.MembershipRolesWhitelist.AllowedValues (hardcoded literal; IsDictionary=true, IsPublic=true)';

/**
 * "All sales-rep roles" is a LIVE-RESOLVED set, never a transcribed list.
 *
 * The discriminator is the PERMISSION, not the name, and the difference is not academic — measured
 * live on vcst 2026-09-18, matching on the name would have collected SIX roles that carry ZERO
 * sales-rep permissions (`Sales Rep`, `Sales Executive`, and four `AGENT-TEST-SalesRep-*` fixture
 * roles), while missing nothing the permission predicate finds. The permission is also the module's
 * OWN rule for what counts: only a role carrying `sales-rep:access` is a GRANTING role, and
 * `POST /api/sales-rep` silently substitutes one when handed a non-granting role
 * (SalesRepService.ResolveAssignableRoleAsync).
 */
export const SALES_REP_GRANT_PERMISSION = PERM_ACCESS; // 'sales-rep:access'

/**
 * The granting roles this repo already declares (`sales-rep/sales-rep-docs-specs.mjs`). Used ONLY as
 * a cross-check against the live resolution — live wins, because a deployment may legitimately add a
 * granting role. A divergence is reported, never silently accepted, and never substituted for the
 * live set.
 */
export const DECLARED_GRANTING_ROLES = Object.freeze([...GRANTING_ROLES]);

/**
 * The Admin SPA roles picker fetches a FIXED page of 20 and filters it client-side:
 *   rolesPickerService.js — roles.search({ keyword: keyword || '', take: 20 })
 * So a whitelisted role outside the first 20 of the unfiltered search does NOT render until the
 * tester types a keyword. With 60 roles on vcst this bites. Documented here so a later reader sees
 * "my whitelist entry is missing from the picker" as expected paging, not a defect.
 */
export const PICKER_PAGE_SIZE = 20;
export const PICKER_SOURCE_REF =
  'vc-module-customer@dev Scripts/services/rolesPickerService.js — roles.search({keyword, take: 20}) then filterByWhitelist(); matches whitelist entries against role.name OR role.id, case-insensitively';

/**
 * Whitelist edits only reach the picker after Settings -> Reset cache + a FULL page reload.
 * Stated here because chasing an un-refreshed picker is the classic phantom on this surface.
 */
export const REFRESH_REQUIREMENT =
  'Admin SPA: Settings -> Reset cache, then a FULL page reload. Without both, the picker serves the previous whitelist.';

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 2b. THE NARROWED VARIANT — a DECLARED TARGET, never the steady state
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────────────────────────
 * FIXTURE_LIMITS records that the seeded set does NOT decide the NARROWING link — "a store override
 * HIDES a role the picker would otherwise offer" — because all three pool roles are whitelisted, so
 * the org half of a filtered picker and an unfiltered one look identical. Deciding that link needs a
 * whitelist that OMITS a role which is otherwise visible.
 *
 * ── WHY IT IS DECLARED HERE RATHER THAN BORROWED FROM `pre_state` ───────────────────────────────
 * The obvious shortcut is to reuse the captured pre-state, which on vcst happens to be
 * `["Organization employee"]` and therefore happens to omit `Purchasing agent`. That is an ACCIDENT
 * of this one environment: `pre_state` is whatever the store held before the first apply, and on
 * another deployment it could be `[]`, or the full pool, or a set that omits nothing the picker
 * shows. A case whose falsification rests on it then silently stops discriminating — it still
 * PASSES, which is the direction that costs a reviewer rather than an author. The narrowing target
 * is therefore DECLARED and DERIVED, not observed.
 *
 * ── WHY THE OMITTED ROLE MUST BE INSIDE THE PICKER'S DEFAULT PAGE ───────────────────────────────
 * The picker fetches a fixed keyword-less page of `PICKER_PAGE_SIZE` and filters client-side
 * (`PICKER_SOURCE_REF`). A role OUTSIDE that page is absent from the un-keyworded picker whether or
 * not it is whitelisted, so its "disappearance" under a narrowed whitelist is a PAGING artifact and
 * proves nothing. Measured live on vcst 2026-09-19 against `roles/search {keyword:'', take:20}`
 * (60 roles total, descending by name): `Purchasing agent` is #19 of 20 — INSIDE the page — while
 * `Organization employee` and `Organization maintainer` are both outside it. Of the three pool
 * roles, `Purchasing agent` is the only admissible choice on this environment.
 *
 * #19 of 20 is a thin margin: two new roles sorting above it would push it out and quietly turn the
 * narrowing evidence into a paging artifact. That is why `findNarrowingProblems()` re-checks the
 * property against the LIVE ordered role list on every apply and ABORTS, rather than the property
 * being asserted once here and assumed forever.
 *
 * ── WHAT THE SEEDER LEAVES BEHIND ───────────────────────────────────────────────────────────────
 * Nothing narrowed. A plain apply leaves the store in the FULL seeded set and merely RECORDS the
 * narrowed target in `narrowed_values` for a case to write during its own run and restore afterwards
 * (from `seeded_values_json`). `--variant narrowed` exists for manual work only; it is never the
 * default and never what `npm run seed:membership-roles` leaves behind.
 */

/**
 * The one pool role the narrowed variant deliberately omits.
 *
 * STATIC declaration, committed: it is the fixture's contract with the case, not live state. Its
 * admissibility conditions — inside `DESCRIPTOR_POOL`, inside `ORG_ROLE_NAMES`, present in the
 * seeded set, and inside the picker's default page LIVE — are enforced by `findNarrowingProblems()`
 * (live, per apply) and by the static half of `findAliasProblems()` (`td:validate:b2b` [10]).
 */
export const NARROWED_OMITTED_ROLE = 'Purchasing agent';

export const NARROWED_OMITTED_ROLE_EVIDENCE =
  'vcst 2026-09-19: POST /api/platform/security/roles/search {keyword:"", take:20} -> 20 of 60 roles, '
  + '"Purchasing agent" at position 19; "Organization employee" and "Organization maintainer" both outside the page.';

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 3. PURE DERIVATION — the builders and transforms the unit tests own
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** The v2 tenant-values path for a store. Encoded — a store id may legally contain a space. */
export function tenantValuesPath(tenantId, tenantType = TENANT_TYPE) {
  const id = String(tenantId || '').trim();
  if (!id) throw new Error('tenantValuesPath: tenantId is required');
  return `/api/platform/settings/v2/tenant/${encodeURIComponent(tenantType)}/${encodeURIComponent(id)}/values`;
}

/** Normalise one whitelist entry for comparison. The picker matches case-insensitively. */
const norm = (v) => String(v ?? '').trim().toLowerCase();

/** Entries as a normalised Set, dropping blanks. */
export function toSet(values) {
  return new Set((Array.isArray(values) ? values : []).map(norm).filter(Boolean));
}

/**
 * Order-independent equality.
 *
 * NOT a stylistic choice: the platform REORDERS a dictionary value on write. Measured — posting
 * `["Organization employee","Sales Representative"]` read back as
 * `["Sales Representative","Organization employee"]`. An order-sensitive comparison would call every
 * successful write a failure, and every idempotent re-run a change.
 */
export function sameSet(a, b) {
  const sa = toSet(a); const sb = toSet(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}

/**
 * Select the sales-rep roles from a live roles listing by PERMISSION.
 * @param roles [{ name, id, permissions: string[] }]
 * @returns the matching role objects, in the order given
 */
export function selectSalesRepRoles(roles, permission = SALES_REP_GRANT_PERMISSION) {
  const want = norm(permission);
  return (Array.isArray(roles) ? roles : []).filter(
    (r) => (r?.permissions || []).some((p) => norm(typeof p === 'string' ? p : p?.name) === want),
  );
}

/**
 * Compose the whitelist: the three org roles, then the live sales-rep roles.
 * Deduplicated case-insensitively while PRESERVING the first spelling seen — the stored value is a
 * display name and the picker shows it verbatim, so a case fold here would leak into the UI.
 */
export function buildWhitelist(orgRoleNames = ORG_ROLE_NAMES, salesRepRoleNames = []) {
  const out = []; const seen = new Set();
  for (const v of [...orgRoleNames, ...salesRepRoleNames]) {
    const n = norm(v);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(String(v).trim());
  }
  return out;
}

/** The POST body — a partial merge patch carrying exactly one key. */
export function buildWriteBody(values, settingName = SETTING_NAME) {
  if (!Array.isArray(values)) throw new Error('buildWriteBody: values must be an array');
  return { [settingName]: values };
}

/**
 * Idempotency: is a write needed, and what is being written?
 * @returns { changed, body|null, reason }
 */
export function planWrite(liveValues, targetValues, settingName = SETTING_NAME) {
  if (sameSet(liveValues, targetValues)) {
    return { changed: false, body: null, reason: 'live whitelist already equals the target set (order-independent)' };
  }
  return { changed: true, body: buildWriteBody(targetValues, settingName), reason: 'live whitelist differs from the target set' };
}

/**
 * THE CRITICAL DERIVATION — decide whether to capture the pre-state.
 *
 * Teardown restores what was there BEFORE this fixture, so the captured value must be the ORIGINAL,
 * never a previous run's own output. Two ways that goes wrong, both silent:
 *
 *   1. A second `apply` run recaptures, and since the live value is now the SEEDED set, the pre-state
 *      becomes the seeded set — teardown degrades to a no-op and the environment keeps the fixture
 *      forever. This is why an already-captured pre-state is NEVER overwritten.
 *   2. Capturing while live already equals the target would record the target as "original" for the
 *      same reason, so that case is refused too.
 *
 * `writeEnvAliasOverride` merges and never deletes, so a wrong capture is permanent until someone
 * edits the overlay by hand. Capture is therefore write-once.
 *
 * @returns { capture: boolean, value: string[]|null, reason }
 */
export function capturePreState(existingCapture, liveValues, targetValues) {
  const already = existingCapture !== null && existingCapture !== undefined && existingCapture !== '';
  if (already) {
    return { capture: false, value: null, reason: 'pre-state already captured — never overwritten, or teardown would restore this fixture instead of the original' };
  }
  if (sameSet(liveValues, targetValues)) {
    return { capture: false, value: null, reason: 'live already equals the target set — capturing now would record the FIXTURE as the original' };
  }
  return { capture: true, value: [...(liveValues || [])], reason: 'first apply on this env — recording the original whitelist so teardown can restore it' };
}

/**
 * Teardown plan: restore the captured pre-state.
 *
 * Refuses when nothing was captured. "Restore to empty" is NOT the fallback — at store scope an
 * empty value means "skip the override and use the global whitelist", a third behavioural state
 * (see the header). Guessing it would silently change how the picker behaves.
 *
 * @returns { restore: boolean, target: string[]|null, changed: boolean, reason }
 */
export function planTeardown(capturedPreState, liveValues) {
  if (capturedPreState === null || capturedPreState === undefined || capturedPreState === '') {
    return {
      restore: false,
      target: null,
      changed: false,
      reason: 'no pre-state captured for this env — refusing to guess. Restoring to empty is NOT neutral: at store scope an empty value makes the picker fall back to the GLOBAL whitelist. Restore the original by hand, or re-run apply on an env where capture can happen.',
    };
  }
  const target = Array.isArray(capturedPreState) ? capturedPreState : JSON.parse(capturedPreState);
  return {
    restore: true,
    target,
    changed: !sameSet(liveValues, target),
    reason: sameSet(liveValues, target) ? 'live already equals the captured pre-state — nothing to restore' : 'restoring the captured pre-state',
  };
}

/**
 * Which whitelist entries fall OUTSIDE the picker's default (keyword-less) page?
 * Pure, so the runner can report it without the reader having to re-derive the paging rule.
 */
export function entriesOutsideDefaultPage(orderedLiveRoleNames, whitelist, pageSize = PICKER_PAGE_SIZE) {
  const window = new Set((orderedLiveRoleNames || []).slice(0, pageSize).map(norm));
  return (whitelist || []).filter((v) => !window.has(norm(v)));
}

/**
 * THE NARROWING DERIVATION — the seeded set MINUS the one declared omitted role.
 *
 * Throws rather than degrading, on every path where the result would not discriminate. The silent
 * failure this exists to prevent: if the omitted role is simply absent from the seeded set, a
 * filter-and-return would hand back a set IDENTICAL to the seeded one, and a case that writes it
 * and then asserts "the role disappeared from the picker" would be asserting against a whitelist
 * that still contains everything. The write succeeds, the picker is unchanged, and the case's
 * falsification has evaporated with nothing reporting it.
 *
 * @param seededValues the full applied whitelist (the fixture's steady state)
 * @param omittedRole  the pool role to drop
 * @returns string[] — the narrowed target, first-spelling preserved
 */
export function buildNarrowedValues(seededValues, omittedRole = NARROWED_OMITTED_ROLE) {
  const seeded = Array.isArray(seededValues) ? seededValues.filter((v) => norm(v)) : [];
  const want = norm(omittedRole);
  if (!want) throw new Error('buildNarrowedValues: omittedRole is required — a narrowed variant that omits nothing is the seeded set');
  if (!seeded.length) {
    throw new Error('buildNarrowedValues: the seeded set is EMPTY — there is nothing to narrow, and an empty store value is not a narrowing (the picker falls back to the GLOBAL whitelist)');
  }
  const out = seeded.filter((v) => norm(v) !== want).map((v) => String(v).trim());
  if (out.length === seeded.length) {
    throw new Error(
      `buildNarrowedValues: "${omittedRole}" is NOT in the seeded set [${seeded.join(', ')}] — the narrowed variant would be IDENTICAL to the seeded set. `
      + 'A case writing it would observe no change in the picker and still pass its "the role disappeared" assertion vacuously. Refusing to produce it.',
    );
  }
  if (!out.length) {
    throw new Error(
      `buildNarrowedValues: narrowing by "${omittedRole}" removed EVERY entry. An empty store value is not "narrowest" — at store scope it makes the picker `
      + 'SKIP the override and fall back to the GLOBAL whitelist, a different behavioural state entirely (see the header).',
    );
  }
  return out;
}

/**
 * Serialize a value list into the JSON-array-shaped alias-field convention `pre_state` established.
 * `@td()` substitutes the raw string, so this is the only shape that embeds into a REST body.
 */
export function toJsonArrayField(values) {
  if (!Array.isArray(values)) throw new Error('toJsonArrayField: values must be an array');
  return JSON.stringify(values.map((v) => String(v)));
}

/** Read a JSON-array-shaped alias field back. Returns null for absent/blank; throws on malformed. */
export function parseJsonArrayField(raw, fieldName = 'field') {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  if (Array.isArray(raw)) return raw;
  let parsed;
  try { parsed = JSON.parse(String(raw)); } catch {
    throw new Error(`${fieldName} is not JSON-array-shaped ("${raw}") — @td() substitutes it verbatim, so a case embedding it in a REST body would send a syntax error`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${fieldName} parsed to ${typeof parsed}, not an array ("${raw}")`);
  return parsed;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 4. LIVE GUARDS — fail loud rather than seed something that proves nothing
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every whitelist entry must correspond to a REAL live role, and the sales-rep set must be non-empty.
 *
 * Both failures are otherwise silent: `POST .../values` does NOT validate against the pool (measured
 * — an arbitrary string is accepted and persisted), and the picker simply never offers an entry that
 * matches no role. A fixture in that state looks provisioned and decides nothing.
 */
export function findRoleProblems({ orgRoleNames = ORG_ROLE_NAMES, salesRepRoles = [], liveRoles = [] } = {}) {
  const problems = [];
  const byName = new Map((liveRoles || []).map((r) => [norm(r?.name), r]));

  for (const want of orgRoleNames) {
    if (!byName.has(norm(want))) {
      const near = (liveRoles || []).map((r) => r?.name).filter((n) => norm(n).includes(norm(want).split(' ')[0]));
      problems.push(
        `org role "${want}" does not exist in the live roles list — a whitelist entry that matches no role is silently invisible in the picker, so seeding it would prove nothing.`
        + (near.length ? ` Live names containing "${norm(want).split(' ')[0]}": ${near.map((n) => `"${n}"`).join(', ')}` : ''),
      );
    }
  }

  if (!salesRepRoles.length) {
    problems.push(
      `no live role carries "${SALES_REP_GRANT_PERMISSION}" — "all sales-rep roles" resolved to ZERO. Refusing to seed just the org roles, `
      + 'because that silently drops half the requested set and the run would report success. '
      + `Cross-check: this repo declares ${DECLARED_GRANTING_ROLES.map((r) => `"${r}"`).join(', ')} as granting roles.`,
    );
  }
  return problems;
}

/**
 * SECOND-RULE guard (`.claude/rules/test-data.md` §SECOND RULE) — is the composed whitelist
 * DISCRIMINATING, and for WHICH link?
 *
 * The property that makes this fixture falsifiable is a DIVERGENCE across the module's hardcoded
 * pool: the three org roles are INSIDE `DESCRIPTOR_POOL`, the sales-rep roles are OUTSIDE it. So:
 *
 *   · an implementation that filters by the STORED tenant value  -> picker offers all 5
 *   · one that filters by the DESCRIPTOR's AllowedValues literal -> picker offers only the 3 org ones
 *   · one that ignores the store override entirely               -> picker offers ALL roles, because
 *     the GLOBAL value of this setting is [] on this environment and an empty whitelist skips filtering
 *
 * Three implementations, three distinguishable observations. Collapse the divergence — drop the
 * sales-rep half, or let a sales-rep role enter the pool — and the first two become indistinguishable.
 * THAT is what this guard fails on.
 */
export function findDecidabilityProblems({ orgRoleNames = ORG_ROLE_NAMES, salesRepRoleNames = [], pool = DESCRIPTOR_POOL } = {}) {
  const problems = [];
  const poolSet = toSet(pool);

  const orgOutside = orgRoleNames.filter((v) => !poolSet.has(norm(v)));
  if (orgOutside.length) {
    problems.push(
      `org role(s) ${orgOutside.map((v) => `"${v}"`).join(', ')} are NOT in the module's hardcoded pool [${pool.join(', ')}] `
      + `(${DESCRIPTOR_POOL_SOURCE_REF}). The inside/outside split is what makes the three implementations distinguishable — an org role outside the pool blurs it.`,
    );
  }

  if (!salesRepRoleNames.length) {
    problems.push(
      'the sales-rep half of the whitelist is EMPTY, so every entry sits inside the module\'s hardcoded pool. '
      + 'A picker driven by the STORED tenant value and one driven by the descriptor\'s AllowedValues literal would then render IDENTICALLY, '
      + 'and the case built on this fixture is a vacuous pass.',
    );
  }

  const srInside = salesRepRoleNames.filter((v) => poolSet.has(norm(v)));
  if (srInside.length) {
    problems.push(
      `sales-rep role(s) ${srInside.map((v) => `"${v}"`).join(', ')} are INSIDE the module's hardcoded pool — the outside-the-pool divergence has collapsed for them. `
      + 'The whole discriminating property is that these entries could only have come from the stored tenant value.',
    );
  }

  const overlap = orgRoleNames.filter((v) => toSet(salesRepRoleNames).has(norm(v)));
  if (overlap.length) {
    problems.push(`${overlap.map((v) => `"${v}"`).join(', ')} appears in BOTH halves — the two halves must stay disjoint or the divergence is not a divergence`);
  }
  return problems;
}

/**
 * NARROWED-VARIANT admissibility. Pure, so the runner, the drift guard and the tests share it.
 *
 * Fails loud on every way the variant could exist and decide nothing. The live half (`orderedLiveRoleNames`)
 * is optional so the static `td:validate:b2b` guard can run the declaration-only checks with no network.
 *
 * @param seededValues         the full applied whitelist
 * @param omittedRole          the declared role to drop
 * @param orderedLiveRoleNames live role names in the order `roles/search` returns them; omit for static-only
 * @param pageSize             the picker's keyword-less page size
 * @param pool                 the module's hardcoded AllowedValues literal
 */
export function findNarrowingProblems({
  seededValues = [], omittedRole = NARROWED_OMITTED_ROLE, orderedLiveRoleNames = null,
  pageSize = PICKER_PAGE_SIZE, pool = DESCRIPTOR_POOL,
} = {}) {
  const problems = [];
  const want = norm(omittedRole);

  if (!want) {
    problems.push('no narrowed_omitted_role is declared — the narrowed variant would equal the seeded set and decide nothing');
    return problems;
  }

  // 1. It must be a POOL role. Narrowing is only observable for an option the picker would
  //    otherwise offer; dropping a non-pool entry hides nothing an operator could have seen.
  if (!toSet(pool).has(want)) {
    problems.push(
      `narrowed_omitted_role "${omittedRole}" is NOT in the module's hardcoded pool [${pool.join(', ')}] (${DESCRIPTOR_POOL_SOURCE_REF}). `
      + 'The narrowing link is "the store override HIDES an option that would otherwise be offered" — omitting something never offered demonstrates nothing.',
    );
  }

  // 2. It must actually be in the seeded set, or the "narrowed" set is the seeded set.
  if (seededValues.length && !toSet(seededValues).has(want)) {
    problems.push(
      `narrowed_omitted_role "${omittedRole}" is not present in the seeded set [${seededValues.join(', ')}] — removing it changes nothing, `
      + 'so the narrowed variant would be byte-identical to the steady state and a case asserting "the role disappeared" would pass vacuously.',
    );
  }

  // 3. The result must be a real, non-empty narrowing.
  if (seededValues.length) {
    const narrowed = seededValues.filter((v) => norm(v) !== want);
    if (!narrowed.length) {
      problems.push(`narrowing by "${omittedRole}" empties the whitelist — an empty store value makes the picker fall back to the GLOBAL whitelist, which is a different state, not a narrower one`);
    } else if (sameSet(narrowed, seededValues)) {
      problems.push(`the narrowed set equals the seeded set — the divergence the variant exists to create has collapsed`);
    }
  }

  // 4. LIVE: it must sit inside the picker's default keyword-less page, or its disappearance is paging.
  if (Array.isArray(orderedLiveRoleNames)) {
    if (!toSet(orderedLiveRoleNames).has(want)) {
      problems.push(`narrowed_omitted_role "${omittedRole}" matches NO live role — it cannot disappear from a picker it never appears in`);
    } else if (entriesOutsideDefaultPage(orderedLiveRoleNames, [omittedRole], pageSize).length) {
      const pos = orderedLiveRoleNames.findIndex((n) => norm(n) === want) + 1;
      problems.push(
        `narrowed_omitted_role "${omittedRole}" sits at position ${pos} of the live roles list, OUTSIDE the picker's default keyword-less page of ${pageSize} `
        + `(${PICKER_SOURCE_REF}). It is therefore absent from the un-keyworded picker whether or not it is whitelisted, so its disappearance under the narrowed `
        + 'variant would be a PAGING artifact and not evidence of narrowing. Pick a pool role inside the page, or drive the case with a keyword.',
      );
    }
  }
  return problems;
}

/**
 * What this fixture does NOT decide — stated at the fixture, per the SECOND RULE's "state the
 * fixture's own limits", so a green case cannot imply an answer it never gave.
 */
export const FIXTURE_LIMITS = Object.freeze([
  'Its APPLIED state does NOT decide the NARROWING link ("a whitelist hides an org role that would otherwise be offered"). '
  + 'All three pool entries are whitelisted, so the org half of the picker looks identical to an unfiltered one. '
  + `That link is decided by the DECLARED narrowed variant (\`narrowed_values\` = seeded minus "${NARROWED_OMITTED_ROLE}"), which a case WRITES during its own `
  + 'run and restores from `seeded_values_json` afterwards. The seeder records the target and never leaves the store narrowed.',
  'It does NOT decide server-side ENFORCEMENT. Per BL-B2B-011 the whitelist constrains only the Admin UI '
  + 'picker\'s offered options; PUT /api/organizations and changeOrganizationContactRole still accept a '
  + 'non-whitelisted roleId (VCST-5239 EPIC-5239-03 is the planned gate).',
  `It does NOT decide picker PAGING. The picker fetches a fixed page of ${PICKER_PAGE_SIZE} roles and filters client-side `
  + `(${PICKER_SOURCE_REF}), so a whitelisted role outside that window is absent for a reason that has nothing to do with the whitelist.`,
]);

/**
 * STATIC drift guard consumed by `validate-b2b-data.mjs` (`td:validate:b2b`).
 * Grades the COMMITTED declaration only — no network, so it cannot see the live sales-rep set.
 */
export function findAliasProblems(aliases = {}) {
  const problems = [];
  const def = aliases[ALIAS];
  if (!def) {
    problems.push(`alias ${ALIAS} is not registered in test-data/aliases.json — the seeded whitelist would have no @td() handle`);
    return problems;
  }
  if (!def._inline) problems.push(`alias ${ALIAS} must be declared _inline: true (it names a setting, not a CSV row)`);

  const fields = def.fields || {};
  const declared = new Set([...ALIAS_STATIC_FIELDS, ...ALIAS_RUNTIME_FIELDS]);
  for (const f of declared) {
    if (!(f in fields)) problems.push(`alias ${ALIAS} does not declare field "${f}"`);
  }
  // …and nothing BEYOND them. An orphan field in the committed base is a field no seeder writes and
  // no guard grades: it resolves to '' on every env, and a case using it fails in a way that reads
  // as "the seeder did not run". Measured: dropping `narrowed_values` from ALIAS_RUNTIME_FIELDS was
  // caught by nothing at all until this check existed.
  for (const f of Object.keys(fields)) {
    if (!declared.has(f)) {
      problems.push(
        `alias ${ALIAS} declares field "${f}", which is in neither ALIAS_STATIC_FIELDS nor ALIAS_RUNTIME_FIELDS — `
        + 'no seeder writes it and no guard grades it, so it resolves empty on every env',
      );
    }
  }
  // Every JSON-array-shaped field must be a RUNTIME field: the shape exists so a case can embed live
  // state in a request body, and a committed one would embed one env's state everywhere.
  for (const f of ALIAS_JSON_ARRAY_FIELDS) {
    if (!ALIAS_RUNTIME_FIELDS.includes(f)) problems.push(`"${f}" is JSON-array-shaped live state but is not listed in ALIAS_RUNTIME_FIELDS, so it would not be held to the empty-in-the-committed-base rule`);
  }
  // Runtime/observed fields must be EMPTY in the committed base — they are per-env overlay values.
  for (const f of ALIAS_RUNTIME_FIELDS) {
    const v = fields[f];
    if (v !== undefined && String(v).trim() !== '') {
      problems.push(
        `alias ${ALIAS}.${f} is populated in the COMMITTED base ("${v}") — it is per-env live state and belongs only in aliases.<env>.json. `
        + 'A committed value would resolve on every other env to this env\'s whitelist.',
      );
    }
  }
  // Static fields must agree with this module — one source of truth, no hand-maintained mirror.
  if (fields.setting !== undefined && fields.setting !== SETTING_NAME) {
    problems.push(`alias ${ALIAS}.setting is "${fields.setting}" but the spec declares "${SETTING_NAME}"`);
  }
  if (fields.tenant_type !== undefined && fields.tenant_type !== TENANT_TYPE) {
    problems.push(`alias ${ALIAS}.tenant_type is "${fields.tenant_type}" but the spec declares "${TENANT_TYPE}"`);
  }
  if (fields.org_roles !== undefined && fields.org_roles !== ORG_ROLE_NAMES.join(';')) {
    problems.push(`alias ${ALIAS}.org_roles is "${fields.org_roles}" but the spec declares "${ORG_ROLE_NAMES.join(';')}"`);
  }
  if (fields.narrowed_omitted_role !== undefined && fields.narrowed_omitted_role !== NARROWED_OMITTED_ROLE) {
    problems.push(`alias ${ALIAS}.narrowed_omitted_role is "${fields.narrowed_omitted_role}" but the spec declares "${NARROWED_OMITTED_ROLE}"`);
  }
  // The DECLARED omitted role must be admissible on its declaration-only axes — it is a literal, so
  // this is the guard's business and not a unit test's (`.claude/rules/test-data.md` FOURTH RULE).
  for (const p of findNarrowingProblems({ seededValues: [], omittedRole: NARROWED_OMITTED_ROLE, pool: DESCRIPTOR_POOL })) {
    problems.push(`alias ${ALIAS}: ${p}`);
  }
  if (!toSet(ORG_ROLE_NAMES).has(String(NARROWED_OMITTED_ROLE).trim().toLowerCase())) {
    problems.push(
      `the spec's NARROWED_OMITTED_ROLE "${NARROWED_OMITTED_ROLE}" is not one of the authored org roles [${ORG_ROLE_NAMES.join(', ')}] — `
      + 'the narrowed variant is derived from the SEEDED set, so a role the seeder never writes cannot be removed from it',
    );
  }
  if (!String(def._notes || '').trim()) problems.push(`alias ${ALIAS} carries no _notes — a fixture whose limits are unstated reads as deciding more than it does`);
  return problems;
}

/**
 * Grade one env OVERLAY's fields for this alias (`aliases.<env>.json`). Pure — the validator supplies
 * the parsed object. Empty/absent fields are simply "not seeded yet" and are never an error here.
 *
 * What this catches that nothing else can: a `narrowed_values` that has drifted into equality with
 * `seeded_values_json`. That is the exact collapse ORGROLE-019 depends on NOT happening, it is
 * invisible in the seeder's own output (both writes succeed), and the case would keep passing.
 *
 * `omittedRole`/`pool` default to the module's declarations but are PARAMETERS, so the unit tests can
 * exercise this arithmetic on synthetic inputs and stay silent about what the declared values are —
 * that is `td:validate:b2b`'s job (`.claude/rules/test-data.md` FOURTH RULE).
 *
 * @param overlay the `aliases.<env>.json` object for this alias, or undefined
 * @param label   the env file name, for the message
 */
export function findOverlayProblems(overlay, label = 'aliases.<env>.json', { omittedRole = NARROWED_OMITTED_ROLE, pool = DESCRIPTOR_POOL } = {}) {
  const problems = [];
  if (!overlay) return problems;

  const parsed = {};
  for (const f of ALIAS_JSON_ARRAY_FIELDS) {
    try { parsed[f] = parseJsonArrayField(overlay[f], `${label}: ${ALIAS}.${f}`); } catch (e) { problems.push(e.message); parsed[f] = null; }
  }

  const seededJson = parsed.seeded_values_json;
  const narrowed = parsed.narrowed_values;
  const seededDisplay = String(overlay.seeded_values || '').trim();

  // The display string and the JSON form are two renderings of ONE set. A drift between them means a
  // case reading `seeded_values` and a Cleanup restoring `seeded_values_json` disagree about what the
  // steady state is — and the Cleanup wins silently.
  if (seededDisplay && seededJson && !sameSet(seededDisplay.split(';'), seededJson)) {
    problems.push(
      `${label}: ${ALIAS}.seeded_values ("${seededDisplay}") and .seeded_values_json (${JSON.stringify(seededJson)}) describe DIFFERENT sets. `
      + 'They are two renderings of the same applied whitelist; a Cleanup restoring the JSON form would put the store into a state the display form never named.',
    );
  }
  if (seededDisplay && !seededJson) {
    problems.push(
      `${label}: ${ALIAS} has seeded_values but no seeded_values_json — re-run \`npm run seed:membership-roles\` on that env. `
      + 'Without it a case has no JSON-array-shaped handle to restore the full set with, and will hardcode a literal role array instead.',
    );
  }

  if (seededJson && !narrowed) {
    problems.push(`${label}: ${ALIAS} has seeded_values_json but no narrowed_values — the narrowing variant has no @td() handle on that env; re-run the seeder`);
  }
  if (seededJson && narrowed) {
    for (const p of findNarrowingProblems({ seededValues: seededJson, omittedRole, pool })) {
      problems.push(`${label}: ${p}`);
    }
    if (sameSet(narrowed, seededJson)) {
      problems.push(
        `${label}: ${ALIAS}.narrowed_values equals .seeded_values_json (${JSON.stringify(narrowed)}) — the narrowed variant omits NOTHING. `
        + 'A case writing it would see an unchanged picker and still pass its "the role disappeared" assertion.',
      );
    }
    const expected = seededJson.filter((v) => norm(v) !== norm(omittedRole));
    if (!sameSet(narrowed, expected)) {
      problems.push(
        `${label}: ${ALIAS}.narrowed_values is ${JSON.stringify(narrowed)} but seeded minus "${omittedRole}" is ${JSON.stringify(expected)} — `
        + 'the recorded variant is not the declared derivation, so the case and the fixture disagree about which role is supposed to vanish',
      );
    }
  }
  return problems;
}
