/**
 * overlay-specs.mjs — side-effect-free source of truth for WHICH `aliases.<env>.json` fields carry a
 * GUID that can be verified live as a platform MEMBER (contact or organization).
 *
 * Backs `td:reconcile` check [11] (overlay GUID liveness). The overlay is the only legal home for a
 * runtime platform GUID and it is COMMITTED, so a fixture that was torn down and re-seeded leaves the
 * overlay pointing at a DELETED entity until someone re-runs the seeder and commits the refresh. That
 * fails OPEN: an assertion like `items[?id=<stale guid>] is non-null` simply never matches, so the
 * case reads as a product bug instead of a data problem. (Found live on vcst 2026-07-29: every
 * SR_REP_*.id plus SR_OWNER_ACME.id and two LOYALTY_*.memberId values were stale.)
 *
 * ── Why an explicit ALLOWLIST, and why MEMBERS ONLY ────────────────────────────────────────────
 * 1. The overlay holds many entity types — products, pricelists, catalogs, configuration sections,
 *    BOPIS locations, addresses, org-membership ids. Probing those with the member endpoint reports
 *    ~90% false "stale", which is precisely the phantom-failure trap the GOLDEN RULE in
 *    .claude/rules/test-data.md warns about (a wrong gate is worse than no gate).
 * 2. `GET /api/members/{id}` is authoritative and index-independent — the seeders already rely on it
 *    (`memberExists()` in seed-sales-rep.mjs, `findMemberById()` in user-provision.mjs).
 * 3. SECURITY-ACCOUNT ids are deliberately NOT probed: this platform has no reliable by-GUID account
 *    lookup. `GET /api/platform/security/users/{guid}` returns **200 + `null`** (it resolves only by
 *    userName — the same cache-flakiness documented in user-provision.mjs `findUserByEmail`), and
 *    `POST /api/platform/security/users/search` IGNORES an `ids` filter (verified live 2026-07-29: it
 *    returned all 1199 accounts for a bogus GUID). So `user_id` / `userId` / `securityAccountId` and
 *    b2b `platform_id` (which holds the ACCOUNT id, not the contact id) are reported as unverified.
 *    Account-credential health is covered instead by check [10] Auth drift, which authenticates.
 * 4. `platform_id` is overloaded across aliases — account id for b2b users, ADDRESS id for
 *    TECHFLOW_ADDR_*, member id for organizations — so it is allowed only for `ORG_*` aliases.
 *
 * Extending coverage = add a field/alias rule here (and a probe for its endpoint, if new).
 * Importing this module has no side effects, so the reconcile script and its unit tests share it.
 */

/** Fields whose value is always a MEMBER (contact/organization) GUID, for ANY alias. */
export const MEMBER_FIELDS = new Set([
  'contact_id', // sales-rep reps → their Contact
  'memberId',   // loyalty users → their Contact
  'contactId',  // ORG_ASSOC_ONLY_NO_GLOBAL → its Contact (camelCase spelling of the same thing).
                // Its sibling `userId` is a SECURITY-ACCOUNT id and stays unprobeable (header note 3).
]);

/**
 * Aliases whose bare `id` field is a MEMBER GUID. `id` is used by ~59 aliases of every entity type,
 * so it is probeable only for aliases known to hold a member.
 */
export const MEMBER_ID_ALIASES = [
  /^SR_REP_/,          // sales-rep reps → Contact id
  /^SR_OWNER_/,        // sales-rep ACME owner Contact
  /^ORG_REP_ONLY$/,    // rep-only served Organization
  // VCST-5281 cross-org fixtures: `id` is the Contact/member id written by the membership seeder
  // (`userId` alongside it is a SECURITY-ACCOUNT id and stays unprobeable — header note 3). These
  // are torn down + re-seeded per run, which is exactly the stale-overlay case this check exists
  // for: without them, @td(ALIAS.id) can silently point at a deleted contact.
  /^MULTI_ORG_TF_BR/,  // MULTI_ORG_TF_BR + its _ALT twin (the _EMPLOYEE/_MAINTAINER auth aliases carry no `id`)
  /^ORG_TF_ONLY_/,     // single-org invitee / blocking-status-WALK fixtures
  // The three AT-REST blocking-status representatives (MOM-007/008/009 → Invited/Rejected/Deleted).
  // They need this MORE than the others, not less: a `Deleted` membership_status does NOT delete the
  // contact, so the only thing that removes these accounts is teardown — and a teardown+re-seed is
  // precisely what leaves @td(ORG_TF_MBR_*.id) pointing at a deleted contact. Without the probe that
  // is silent: the assertion simply never matches and the case reads as a product bug.
  /^ORG_TF_MBR_/,
];

/**
 * Aliases whose `platform_id` is a MEMBER GUID. Deliberately narrow — see header note 4.
 * `ORG_*` = the b2b/white-labeling organizations (`ORG_ACME`, `ORG_TECHFLOW`, …).
 */
export const MEMBER_PLATFORM_ID_ALIASES = [/^ORG_/];

/**
 * `<NAME>_PLATFORM_ID` aliases written by `writeLiveIdAliases()` hold an ORG member id, EXCEPT the
 * `*_USER_*` ones, which hold a security-account id (not probeable — header note 3).
 */
export const PLATFORM_ID_ALIAS_RE = /_PLATFORM_ID$/;
export const PLATFORM_ID_ACCOUNT_RE = /_USER_/;

/** Fields that are never an entity id (business keys / secrets / URLs) — skipped before any probe. */
export const NON_ENTITY_FIELD_RE = /(^|_)(password|email|sku|code|number|slug|url|token)$/i;

/** A 32-hex platform id, dashed or dashless (VC emits both forms). */
export const GUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** True when (alias, field) is declared probeable via GET /api/members/{id}. */
export function isMemberField(alias, field) {
  if (!alias || alias.startsWith('_') || !field || field.startsWith('_') || field === 'fields') return false;
  if (NON_ENTITY_FIELD_RE.test(field)) return false;
  if (MEMBER_FIELDS.has(field)) return true;
  if (field === 'id') {
    if (MEMBER_ID_ALIASES.some((re) => re.test(alias))) return true;
    return PLATFORM_ID_ALIAS_RE.test(alias) && !PLATFORM_ID_ACCOUNT_RE.test(alias);
  }
  if (field === 'platform_id') return MEMBER_PLATFORM_ID_ALIASES.some((re) => re.test(alias));
  return false;
}

/**
 * Split a parsed overlay into the GUIDs check [11] will probe vs the ones it leaves unverified.
 * Pure: `{ probe: [{alias, field, id}], skipped: [{alias, field, id}] }`.
 */
export function selectProbeTargets(overlay = {}) {
  const probe = [];
  const skipped = [];
  for (const [alias, entry] of Object.entries(overlay)) {
    if (alias.startsWith('_') || !entry || typeof entry !== 'object') continue;
    for (const [field, value] of Object.entries(entry)) {
      if (typeof value !== 'string' || !GUID_RE.test(value.trim())) continue;
      const target = { alias, field, id: value.trim() };
      (isMemberField(alias, field) ? probe : skipped).push(target);
    }
  }
  return { probe, skipped };
}
