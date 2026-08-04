/**
 * membership-alias-specs.mjs — side-effect-free source of truth for mapping a seeded
 * organization-memberships.csv row onto the `@td()` alias it backs.
 *
 * WHY (VCST-5281): the cross-org fixtures (`MULTI_ORG_TF_BR` and its frontend-lane twin
 * `MULTI_ORG_TF_BR_ALT`) expose FOUR runtime, server-assigned GUIDs — the contact id (`id`), the
 * security-account id (`userId`), and one `OrganizationMembership` id per org. Those are exactly the
 * values the multi-env rule forbids in a committed CSV (`.claude/rules/test-data.md` §Seed writeback),
 * so they must land in `test-data/aliases.<env>.json`. Until now `seedMemberships()` returned them and
 * nobody persisted them: `MULTI_ORG_TF_BR`'s overlay entry was captured BY HAND, which is precisely
 * the silent-failure mode `td:reconcile` [11] exists to catch (a torn-down + re-seeded fixture leaves
 * `@td(ALIAS.id)` pointing at a deleted entity, the assertion just never matches, and the case reads
 * as a product bug).
 *
 * The mapping is DECLARED IN THE CSV, not mirrored here — two columns on
 * `test-data/b2b/organization-memberships.csv` carry it:
 *
 *   alias                 the @td() alias this row's ACCOUNT backs (same value on every row of the
 *                         account; `id`/`userId` are account-level, so any row can supply them)
 *   membership_id_field   the alias field this row's PER-ORG membership id writes to
 *
 * So the CSV stays the single source of truth: adding a cross-org fixture is two rows + one alias,
 * with no code change and no second list to keep in sync.
 *
 * Importing this module has no side effects (no env read, no fs, no network), so the seeder, the
 * drift-guard validator (`td:validate:b2b`) and the unit tests all import the same functions.
 */

/** CSV columns this spec reads. Exported so the validator names the same strings. */
export const ALIAS_COLUMN = 'alias';
export const MEMBERSHIP_FIELD_COLUMN = 'membership_id_field';
export const STATUS_COLUMN = 'membership_status';

/**
 * ── OrganizationMembership.Status — the per-org status VCST-5281 introduces ──────────────────────
 *
 * THE ONLY copy of the legal set in this repo. The seeder (user-provision.mjs) and the drift guard
 * (validate-b2b-data.mjs) both import it; never re-list these strings anywhere else.
 *
 * GROUNDED IN TWO INDEPENDENT SOURCES, not memory — both re-verified 2026-08-03 and in agreement:
 *
 * [1] SOURCE — vc-module-customer @ 2605501d984ab747b839b0aec16595c7674a967e
 *     ("VCST-5281: Fixed 403 error", 2026-08-03; PR #312. NOTE: not on `dev` yet — reading
 *     ModuleConstants.cs from the default branch finds NO MembershipStatuses class at all, so the
 *     commit-pinned ref above is load-bearing, not decoration.)
 *   src/VirtoCommerce.CustomerModule.Core/ModuleConstants.cs
 *     MembershipStatuses.Invited/Approved/Rejected/Deleted  (const string, exactly these four)
 *     MembershipStatuses.ManuallySelectableStatuses = { Invited, Approved, Rejected, Deleted }
 *     MembershipStatuses.BlockingStatuses           = { Invited, Rejected, Deleted }
 *     MembershipStatuses.ReinvitableStatuses        = { Rejected, Deleted }
 *     Settings.General.OrganizationMembershipStatuses = SettingDescriptor {
 *       Name = "Customer.OrganizationMembershipStatuses", IsDictionary = true,
 *       DefaultValue = MembershipStatuses.Approved,          // ← the platform's OWN default
 *       AllowedValues = MembershipStatuses.ManuallySelectableStatuses }
 *   src/VirtoCommerce.CustomerModule.Core/Model/OrganizationMembership.cs
 *     public string Status { get; set; }
 *     ResolveEffectiveStatus(membershipStatus, memberStatus) =>
 *       membershipStatus (if non-empty) ?? memberStatus (if non-empty) ?? Approved
 *
 * [2] LIVE — vcst-qa @ VirtoCommerce.Customer 3.1021.0-pr-312-2605 (the build carrying [1]):
 *     GET /api/platform/settings/Customer.OrganizationMembershipStatuses
 *       → { isDictionary: true, defaultValue: "Approved",
 *           allowedValues: ["Invited","Approved","Rejected","Deleted"] }
 *     Deliberately NOT the same list as Customer.ContactStatuses, which on the same env allows SIX
 *     values (Deleted, New, Locked, Invited, Rejected, Approved). A CONTACT status is not a
 *     MEMBERSHIP status: "New"/"Locked" are legal globally but are NOT in the membership set, and
 *     because they are also absent from BlockingStatuses they fall through as non-blocking. Never
 *     copy a value across the two vocabularies.
 *
 * WHY `Approved` IS THE FIXTURE DEFAULT: it is the platform's own `DefaultValue` for the setting and
 * the terminal value of ResolveEffectiveStatus, and it is the ONLY one of the four that is not in
 * BlockingStatuses — so it is the single value that leaves a fixture able to sign in.
 *
 * WHY A COMMITTED FIXTURE MUST NOT LEAVE THE CELL BLANK (the VCST-5281 follow-up this file gates):
 * blank ⇒ null ⇒ ResolveEffectiveStatus falls through to the CONTACT's status, so the per-org status
 * a suite asserts on is then a SIDE EFFECT of a different entity. That is unobservable from the
 * fixture row, and it silently changes meaning if the contact's status is ever edited. The wire
 * behaviour of blank is deliberately unchanged (still ⇒ null / key omitted — see
 * normalizeMembershipStatus), because that is what makes a re-seed able to HEAL a row back to
 * "no override"; what changed is that a COMMITTED row may no longer *declare* blank. That policy is
 * enforced by findStatusProblems() (⇒ `td:validate:b2b` [9]), not by the wire layer.
 *
 * The "no per-org override" cell is NOT lost by requiring a status: the VCST-5281 test model reduces
 * membership-row-EXISTENCE out as a dependent axis ("subsumed by which side of ?? supplied the
 * value") and covers the no-override case at D14 with a fixture that has NO membership row at all
 * (ORG_ASSOC_ONLY_NO_GLOBAL). A row that exists therefore always has something concrete to say.
 *
 * ASYMMETRIC SERVER-SIDE VALIDATION (read from the controller, worth knowing before trusting it):
 * `PUT .../{id}` rejects an illegal status with 400 — but ONLY when the incoming status is non-empty
 * AND differs from the stored one. `POST` (Create) does NOT validate at all. So an illegal status on
 * a NEW membership would be persisted silently; that is why findStatusProblems() gates it statically
 * at `npm run td:validate:b2b` instead of relying on the platform to refuse it.
 */
/** Provenance of the legal set — quoted in gate output so a failure names its own oracle. */
export const STATUS_SOURCE_REF = 'vc-module-customer@2605501d ModuleConstants.MembershipStatuses + live GET /api/platform/settings/Customer.OrganizationMembershipStatuses';
/** The platform setting that publishes the vocabulary live (re-verifiable on any env). */
export const STATUS_SETTING_NAME = 'Customer.OrganizationMembershipStatuses';
export const MEMBERSHIP_STATUSES = Object.freeze({
  INVITED: 'Invited', APPROVED: 'Approved', REJECTED: 'Rejected', DELETED: 'Deleted',
});
/** ModuleConstants.MembershipStatuses.ManuallySelectableStatuses — the legal set for the CSV cell. */
export const MANUALLY_SELECTABLE_STATUSES = Object.freeze([
  MEMBERSHIP_STATUSES.INVITED, MEMBERSHIP_STATUSES.APPROVED, MEMBERSHIP_STATUSES.REJECTED, MEMBERSHIP_STATUSES.DELETED,
]);
/** ModuleConstants.MembershipStatuses.BlockingStatuses — effective status here ⇒ org access BLOCKED. */
export const BLOCKING_STATUSES = Object.freeze([
  MEMBERSHIP_STATUSES.INVITED, MEMBERSHIP_STATUSES.REJECTED, MEMBERSHIP_STATUSES.DELETED,
]);
/** ModuleConstants.MembershipStatuses.ReinvitableStatuses — a membership here can be re-invited. */
export const REINVITABLE_STATUSES = Object.freeze([
  MEMBERSHIP_STATUSES.REJECTED, MEMBERSHIP_STATUSES.DELETED,
]);
/**
 * The status a happy-path fixture declares. NOT an arbitrary pick: it is the platform's own
 * `DefaultValue` for Customer.OrganizationMembershipStatuses, the terminal fallback of
 * ResolveEffectiveStatus, and the only non-blocking member of the legal set.
 */
export const DEFAULT_MEMBERSHIP_STATUS = MEMBERSHIP_STATUSES.APPROVED;

/**
 * CSV cell → wire value. Blank / whitespace / absent ⇒ `null` (today's behaviour), so a CSV with no
 * `membership_status` column at all is unchanged. Never returns `''` — an empty string would defeat
 * ResolveEffectiveStatus's `IsNullOrEmpty` check in a confusing way and is not a legal value.
 */
export function normalizeMembershipStatus(raw) {
  const s = String(raw ?? '').trim();
  return s === '' ? null : s;
}

/** Blank (⇒ null) is legal; otherwise the value must be in ManuallySelectableStatuses (case-sensitive). */
export function isLegalMembershipStatus(raw) {
  const s = normalizeMembershipStatus(raw);
  return s === null || MANUALLY_SELECTABLE_STATUSES.includes(s);
}

/** True when this declared status would leave the fixture BLOCKED from the org at seed time. */
export function isBlockingMembershipStatus(raw) {
  const s = normalizeMembershipStatus(raw);
  return s !== null && BLOCKING_STATUSES.includes(s);
}

/**
 * Per-org status resolution, mirroring the `roles` grammar the org-scoped CSVs already use
 * (`roles` is `;`-joined and INDEX-PARALLEL with `org_id`, VCST-5028), so a multi-org row can differ
 * per org exactly as roles do:
 *
 *   ""                      → every org inherits the contact status (null)
 *   "Invited"               → ONE value applies to EVERY org (the roles[0] fallback shape)
 *   "Invited;;Approved"     → strictly index-parallel: org0=Invited, org1=null (inherit), org2=Approved
 *
 * The `;`-form is deliberately NOT given the roles' `|| parts[0]` fallback: a role can never be
 * blank, so falling back is safe there — but a BLANK status is a meaningful value ("inherit"), so
 * copying parts[0] into a deliberately-blank slot would silently override an org the author left
 * alone. Once the author opts into the list form, every slot means exactly what it says.
 */
export function resolveMembershipStatusForIndex(cell, index = 0) {
  const raw = String(cell ?? '');
  if (!raw.includes(';')) return normalizeMembershipStatus(raw); // single value (or blank) for every org
  return normalizeMembershipStatus(raw.split(';')[index]);       // index-parallel; blank slot ⇒ null
}

/** Split a `;`-joined status cell into its declared slots (single value ⇒ one slot). */
function statusSlots(cell) {
  const raw = String(cell ?? '');
  return raw.includes(';') ? raw.split(';') : [raw];
}

/**
 * Does this row cause the seeder to create at least one OrganizationMembership?
 *
 * The gate needs this because `membership_status` is REQUIRED on a row that creates a membership and
 * FORBIDDEN on one that does not — a status on a row that creates no membership is inert (the seeder
 * never sends it anywhere), and an inert declaration is worse than none: it reads as coverage.
 *
 * The role cell is the mechanism, not a proxy for it. `provisionContactLogins` /
 * `seedInlineOrgUsers` pair each org with its index-parallel role and then `.filter(p => p.roleName)`,
 * so an empty role cell provably yields ZERO membership rows (that is exactly how
 * ORG_ASSOC_ONLY_NO_GLOBAL is built). For organization-memberships.csv the gating column is
 * `role_id`, and one row is one membership.
 *
 * `roleCol = null` ⇒ caller does not model roles (unit tests exercising the status grammar alone);
 * every row is then treated as membership-creating, which is the stricter reading.
 */
export function rowCreatesMembership(row, roleCol = null) {
  if (!roleCol) return true;
  return String(row?.[roleCol] ?? '').split(';').some((s) => s.trim() !== '');
}

/**
 * Drift guard for the `membership_status` column (consumed by `td:validate:b2b`). Shared by ALL THREE
 * membership-creating sources — organization-memberships.csv, b2b/users.csv and
 * white-labeling/users.csv — so the legal set is enforced wherever a status can be written, from one
 * list.
 *
 * Hard-fails:
 *   · an illegal value (POST does not validate server-side — see the header note);
 *   · a MISSING status on a row that creates a membership (incl. a blank slot inside the `;`-form) —
 *     the fixture would seed status=null and silently inherit the contact's status;
 *   · a status DECLARED on a row that creates no membership — inert, and misleading;
 *   · an arity mismatch against `org_id` for the `;`-form.
 * Returns blocking-status rows separately so the validator can WARN — a deliberately-blocked fixture
 * is legitimate (it is the whole point of Invited/Rejected/Deleted representatives), but it must be
 * visible rather than a surprise.
 *
 * @param rows    parsed CSV rows
 * @param source  { label, idCol, emailCol, orgCol, roleCol } — `orgCol` non-null enables the
 *                index-parallel grammar + the arity check (a row that owns several orgs); `roleCol`
 *                non-null enables the required/inert split. Defaults describe
 *                organization-memberships.csv, where one row IS one org.
 */
export function findStatusProblems(rows, source = {}) {
  const {
    label = 'membership', idCol = 'membership_id', emailCol = 'user_email',
    orgCol = null, roleCol = null,
  } = source;
  const problems = [];
  const blocking = [];
  for (const row of rows || []) {
    const raw = row?.[STATUS_COLUMN];
    if (raw === undefined) continue; // column absent entirely → nothing to check (back-compat)
    const tag = `${row[idCol]} (${row[emailCol]})`;
    const slots = statusSlots(raw);
    const creates = rowCreatesMembership(row, roleCol);

    // A row that creates no membership must declare nothing — the value could never be sent.
    if (!creates) {
      if (slots.some((s) => normalizeMembershipStatus(s) !== null)) {
        problems.push(`${label} ${tag}: ${STATUS_COLUMN}="${String(raw).trim()}" is declared but this row creates NO OrganizationMembership (its ${roleCol} cell is empty, so the seeder pairs no org with a role) — the value is inert and reads as coverage that does not exist; leave ${STATUS_COLUMN} blank`);
      }
      continue;
    }

    const illegal = slots.filter((s) => normalizeMembershipStatus(s) !== null && !isLegalMembershipStatus(s));
    if (illegal.length) {
      problems.push(`${label} ${tag}: ${STATUS_COLUMN}="${String(raw).trim()}" contains an illegal OrganizationMembership status (${illegal.map((s) => `"${s.trim()}"`).join(', ')}) — each slot must be one of: ${MANUALLY_SELECTABLE_STATUSES.join(', ')} (${STATUS_SOURCE_REF})`);
      continue;
    }

    // REQUIRED: a seeded membership must carry a concrete per-org status, never inherit by omission.
    const blankSlots = slots.map((s, i) => [s, i]).filter(([s]) => normalizeMembershipStatus(s) === null);
    if (blankSlots.length) {
      const where = slots.length > 1 ? ` (blank slot(s) at index ${blankSlots.map(([, i]) => i).join(', ')})` : '';
      problems.push(`${label} ${tag}: ${STATUS_COLUMN} is blank${where} but this row seeds an OrganizationMembership — a blank cell seeds status=null, which makes the per-org status a side effect of the CONTACT's status instead of a declared fixture property. Declare a concrete value: ${MANUALLY_SELECTABLE_STATUSES.join(', ')} (happy path ⇒ ${DEFAULT_MEMBERSHIP_STATUS})`);
      continue;
    }

    // Arity: mirror the roles rule — a multi-value list must be index-parallel with org_id.
    if (orgCol && slots.length > 1) {
      const orgCount = String(row[orgCol] ?? '').split(';').map((s) => s.trim()).filter(Boolean).length;
      if (orgCount && slots.length !== orgCount) {
        problems.push(`${label} ${tag}: ${STATUS_COLUMN} declares ${slots.length} value(s) for ${orgCount} org(s) — a multi-value list must be index-parallel with ${orgCol} (or use ONE value to apply it to every org)`);
        continue;
      }
    }

    for (const s of slots) {
      if (isBlockingMembershipStatus(s)) blocking.push(`${label} ${tag}: ${STATUS_COLUMN} declares "${normalizeMembershipStatus(s)}" — a BLOCKING status; this fixture is seeded WITHOUT org access by design`);
    }
  }
  return { problems, blocking };
}

/**
 * Coverage report over the legal set for a membership source (consumed by `td:validate:b2b` [9]).
 * A fixture set that only ever declares `Approved` cannot exercise the blocking branch of
 * `MembershipStatuses.IsBlocking`, so the gate reports which of the four values has no representative.
 * Informational by design — a domain genuinely may not need all four — but it must be VISIBLE.
 */
export function statusCoverage(rows, roleCol = null) {
  const byStatus = new Map(MANUALLY_SELECTABLE_STATUSES.map((s) => [s, []]));
  for (const row of rows || []) {
    if (!rowCreatesMembership(row, roleCol)) continue;
    for (const slot of statusSlots(row?.[STATUS_COLUMN])) {
      const s = normalizeMembershipStatus(slot);
      if (s && byStatus.has(s)) byStatus.get(s).push(row);
    }
  }
  const covered = MANUALLY_SELECTABLE_STATUSES.filter((s) => byStatus.get(s).length);
  return { covered, missing: MANUALLY_SELECTABLE_STATUSES.filter((s) => !byStatus.get(s).length), counts: Object.fromEntries([...byStatus].map(([s, r]) => [s, r.length])) };
}

/** Alias fields carrying an ACCOUNT-level runtime id (one value per account, not per org). */
export const ACCOUNT_ID_FIELDS = { contact: 'id', account: 'userId' };

const isRealId = (v) => typeof v === 'string' && v.trim() !== '' && !v.startsWith('dry-');
const lc = (v) => String(v || '').trim().toLowerCase();

/**
 * Build the `writeEnvAliasOverride()` payload for a membership seed run.
 *
 * @param rows    parsed organization-memberships.csv rows (the alias/field declaration)
 * @param results what `seedMemberships()` returned:
 *                [{ membership_id, email, contact_id, user_id, platform_membership_id, ... }]
 * @returns       { ALIAS: { id, userId, <membership_id_field>: <guid> } } — only real ids, only
 *                aliases that were actually seeded in THIS run (so a scoped `--only` seed never
 *                rewrites a fixture it did not touch).
 */
export function buildMembershipAliasUpdates(rows, results) {
  const declBy = new Map();
  for (const r of rows || []) {
    const id = String(r?.membership_id || '').trim();
    if (id) declBy.set(id, r);
  }
  const updates = {};
  for (const res of results || []) {
    const row = declBy.get(String(res?.membership_id || '').trim());
    const alias = String(row?.[ALIAS_COLUMN] || '').trim();
    if (!alias) continue; // row declares no alias → nothing to write back (not an error)
    const target = (updates[alias] ||= {});
    if (isRealId(res.contact_id)) target[ACCOUNT_ID_FIELDS.contact] = res.contact_id;
    if (isRealId(res.user_id)) target[ACCOUNT_ID_FIELDS.account] = res.user_id;
    const field = String(row?.[MEMBERSHIP_FIELD_COLUMN] || '').trim();
    if (field && isRealId(res.platform_membership_id)) target[field] = res.platform_membership_id;
  }
  // Drop aliases that ended up with nothing real to write (a dry run, or a skipped org).
  for (const [alias, fields] of Object.entries(updates)) {
    if (Object.keys(fields).length === 0) delete updates[alias];
  }
  return updates;
}

/**
 * `--only <token>` predicate for a scoped membership seed. Matches a row on its membership_id,
 * user_email or alias (case-insensitive substring), so `--only MULTI_ORG_TF_BR_ALT` seeds exactly
 * the twin and leaves the reserved `MULTI_ORG_TF_BR` rows untouched.
 *
 * Substring matching is deliberate but it is NOT prefix-safe: `--only MULTI_ORG_TF_BR` also matches
 * `MULTI_ORG_TF_BR_ALT`. Callers that need one alias exactly should pass the longer token.
 */
export function matchesOnly(row, only) {
  if (!only) return true;
  const t = lc(only);
  return [row?.membership_id, row?.user_email, row?.[ALIAS_COLUMN]].some((v) => lc(v).includes(t));
}

/**
 * Drift guard (consumed by `td:validate:b2b`): the alias/field declaration must be coherent with
 * the committed base `aliases.json`, and the CSV must carry NO runtime GUID.
 *
 * @param rows    parsed organization-memberships.csv rows
 * @param aliases parsed test-data/aliases.json
 * @returns       string[] of hard problems (empty = clean)
 */
export function findAliasDeclarationProblems(rows, aliases = {}) {
  const problems = [];
  const guidRe = /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  const aliasByEmail = new Map();

  for (const row of rows || []) {
    const tag = `${row.membership_id} (${row.user_email})`;

    // No runtime GUID may sit in the committed CSV — it resolves wrong (or nowhere) on every other env.
    for (const [col, val] of Object.entries(row)) {
      if (guidRe.test(String(val || '').trim())) {
        problems.push(`membership ${tag}: column "${col}" holds a runtime GUID "${val}" — membership/contact/account ids live in aliases.<env>.json, not the committed CSV`);
      }
    }

    const alias = String(row[ALIAS_COLUMN] || '').trim();
    const field = String(row[MEMBERSHIP_FIELD_COLUMN] || '').trim();
    if (!alias && !field) continue; // undeclared row: legal, just gets no writeback
    if (!alias) { problems.push(`membership ${tag}: ${MEMBERSHIP_FIELD_COLUMN}="${field}" but no ${ALIAS_COLUMN} — the id has nowhere to write`); continue; }
    if (!field) { problems.push(`membership ${tag}: ${ALIAS_COLUMN}="${alias}" but no ${MEMBERSHIP_FIELD_COLUMN} — this org's membership id would be silently dropped`); continue; }

    const def = aliases[alias];
    if (!def) { problems.push(`membership ${tag}: ${ALIAS_COLUMN}="${alias}" does not exist in test-data/aliases.json`); continue; }
    const declared = def.fields || {};
    for (const f of [field, ACCOUNT_ID_FIELDS.contact, ACCOUNT_ID_FIELDS.account]) {
      if (!(f in declared)) problems.push(`membership ${tag}: alias ${alias} does not declare field "${f}" in its \`fields\` map — the seeder would write an id no @td() reference can read`);
    }

    // One account ⇒ one alias (the account-level id fields would otherwise fight).
    const email = lc(row.user_email);
    const prior = aliasByEmail.get(email);
    if (prior && prior !== alias) problems.push(`account ${email} is declared by TWO aliases (${prior}, ${alias}) — account-level id fields (${ACCOUNT_ID_FIELDS.contact}/${ACCOUNT_ID_FIELDS.account}) would overwrite each other`);
    else aliasByEmail.set(email, alias);
  }

  // Distinct aliases must not share an account, and the per-org fields within one alias must be unique.
  const fieldsByAlias = new Map();
  for (const row of rows || []) {
    const alias = String(row[ALIAS_COLUMN] || '').trim();
    const field = String(row[MEMBERSHIP_FIELD_COLUMN] || '').trim();
    if (!alias || !field) continue;
    const seen = fieldsByAlias.get(alias) || new Map();
    if (seen.has(field)) problems.push(`alias ${alias}: rows ${seen.get(field)} and ${row.membership_id} both write "${field}" — one per-org field per membership row`);
    else seen.set(field, row.membership_id);
    fieldsByAlias.set(alias, seen);
  }
  return problems;
}
