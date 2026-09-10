/**
 * membership-lock-specs.mjs — side-effect-free source of truth for the ORG-MEMBERSHIP LOCK AXIS
 * (VCST-5317: is a currently-locked membership surfaced in the storefront org switcher?).
 *
 * Importing this module has NO side effects (no env read, no fs, no network), so the runner
 * (`set-membership-lock.mjs`), the drift guard (`validate-membership-lock-data.mjs`) and the unit
 * tests (`scripts/unit/membership-lock.test.mjs`) all import the same functions.
 *
 * ── WHAT THIS IS, AND WHY IT IS NOT A SEEDER ─────────────────────────────────────────────────────
 * Lock is RUNTIME-ONLY state on an OrganizationMembership row that ALREADY EXISTS. No alias in the
 * registry declares a lock field and none should: every variant VCST-5317 needs is a different,
 * MUTUALLY EXCLUSIVE state of the same two membership pairs. So this is a STATE SETTER in the shape
 * of `sales-rep/set-rep-account-lock.mjs`, not an additive find-or-create seeder: there is nothing to
 * create, nothing to write back but the applied state, and the resting state (V1, fully unlocked) is
 * the thing teardown restores.
 *
 * Consequence for `AGENT-TEST-` prefixing: this module creates NO entity, so it introduces no name to
 * prefix. Its safety story is not the prefix — it is the ALLOWLIST in `assertWritable()` below.
 *
 * ── WHY LOCKING AN EXISTING MEMBERSHIP, NEVER CREATING ONE ───────────────────────────────────────
 * Open High `reports/bugs/open/critical-high/BUG-backend-provisioned-membership-not-linked-to-contact-organizations.md`:
 * `POST /api/customer/organization-memberships` creates the row but never links `contact.organizations`
 * — which is EXACTLY the switcher's data source (`me.contact.organizations`). A freshly-created
 * membership can therefore be invisible to the surface under test, producing a false negative. Both
 * lane accounts already own both memberships, so nothing needs creating.
 *
 * ── THE LANE SPLIT IS MANDATORY ──────────────────────────────────────────────────────────────────
 * An `OrganizationMembership` row is keyed on (userId, organizationId) and carries the per-org
 * `status` + `isLocked` this run mutates. `test-data/aliases.json` reserves `MULTI_ORG_TF_BR` for the
 * BACKEND/GraphQL lane and `MULTI_ORG_TF_BR_ALT` for the FRONTEND/UI lane precisely so two lanes never
 * eat each other's lock state. `--lane` has NO DEFAULT for that reason.
 *
 * ── THE WRITE PATH IS REST, NEVER xAPI ──────────────────────────────────────────────────────────
 * `POST {BACK_URL}/api/customer/organization-memberships/{id}/lock` + `.../unlock`
 * (`OrganizationMembershipController.cs:117-133`, both `[Authorize(OrgMembershipPermissions.Update)]`
 * ⇒ permission `customer:organization-membership:update`). The xAPI mutations
 * `lockOrganizationContact` / `unlockOrganizationContact` return **Forbidden** for an org-maintainer
 * token — open High `BUG-graphql-changeorganizationcontactrole-forbidden-possible-regression-VCST-5028.md`.
 *
 * ── SIDE EFFECT THAT IS NOT OPTIONAL TO KNOW ────────────────────────────────────────────────────
 * `RevokeTokenOrganizationMembershipChangedEventHandler.cs:16-39` calls `TerminateAllUserSessions(userId)`
 * — GLOBALLY, not scoped to the locked org. Its guard is a POST-STATE predicate
 * (`EntryState.Modified when changedEntry.NewEntry.IsCurrentlyLocked || <status crossing into blocking>`),
 * NOT a transition detector. Read off that source, verified against it:
 *   · lock (→ currently locked)                    ⇒ sessions terminated
 *   · unlock (→ not currently locked)              ⇒ NOT terminated
 *   · lock with a PAST LockoutEnd (V4)             ⇒ NOT terminated (IsCurrentlyLocked is false)
 *   · any edit while ALREADY currently locked      ⇒ re-terminates (post-state, so not direction-scoped)
 *   · membership DELETED                           ⇒ terminated unconditionally
 * So a case must acquire its token AFTER a lock that lands `IsCurrentlyLocked=true`, and may reuse a
 * pre-existing token across a V4 or an unlock. `TOKEN_SURVIVES_STATE` encodes this per state.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 1. THE PREDICATE — mirrored from source, not re-derived from the ticket's prose
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Provenance of `isCurrentlyLocked`. Quoted in gate output so a failure names its own oracle.
 * vc-module-customer @ branch `dev`, src/VirtoCommerce.CustomerModule.Core/Model/OrganizationMembership.cs:22
 *   public bool IsCurrentlyLocked => IsLocked && (!LockoutEnd.HasValue || LockoutEnd.Value > DateTime.UtcNow);
 * The SQL-side predicate in OrganizationMembershipSearchService.cs:243 agrees exactly (strict `>`),
 * so there is no DB/in-memory divergence to model.
 */
export const LOCK_PREDICATE_SOURCE_REF =
  'vc-module-customer@dev Core/Model/OrganizationMembership.cs:22 — IsLocked && (!LockoutEnd.HasValue || LockoutEnd.Value > DateTime.UtcNow)';

/**
 * The lock predicate, mirroring the source above EXACTLY.
 *
 * Two details that are the whole point of mirroring rather than paraphrasing:
 *   · the comparison is STRICT `>` — an instant exactly equal to LockoutEnd reads as NOT locked;
 *   · a null/absent LockoutEnd with IsLocked=true is a PERMANENT lock, not an expired one.
 *
 * The server also returns its own computed `isCurrentlyLocked` (read-only in the OpenAPI schema), and
 * `disagreesWithServer()` below cross-checks the two rather than trusting either alone — which is how
 * a future change to the C# predicate surfaces here as a loud failure instead of silent drift.
 */
export function isCurrentlyLocked(membership, now = Date.now()) {
  if (!membership?.isLocked) return false;
  const raw = membership.lockoutEnd;
  if (raw === null || raw === undefined || raw === '') return true; // permanent
  const end = new Date(raw).getTime();
  if (Number.isNaN(end)) return true; // unparseable ⇒ treat as locked (fail closed, never open)
  return end > now;                   // STRICT — equality reads as not locked
}

/** True when OUR predicate and the SERVER's computed field disagree — always a reportable finding. */
export function disagreesWithServer(membership, now = Date.now()) {
  if (typeof membership?.isCurrentlyLocked !== 'boolean') return false; // server did not send it
  return isCurrentlyLocked(membership, now) !== membership.isCurrentlyLocked;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 2. THE STALENESS FLOOR — transcribed BY NECESSITY, and drift-guarded because of it
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The top-level read path bounds its own staleness at ONE MINUTE:
 *   vc-module-customer@dev Data/Services/OrganizationMembershipSearchService.cs:162
 *     cacheEntry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
 *   inside GetLockedOrganizationIdsAsync (declared :147), with the code's own comment at :160-161:
 *     "OnlyLocked embeds DateTime.UtcNow, so a temporary lock (LockoutEnd) can naturally expire
 *      without any write happening to bust the region token above — bound the staleness window"
 *
 * GOLDEN-RULE NOTE, stated plainly because this is the one constant here that IS transcribed:
 * it is an inline literal in a lambda in another repo — not a named constant, not a SettingDescriptor,
 * not bound to IOptions, and `ModuleConstants.cs` has no cache/expiry/TTL setting at all. There is no
 * API to read it from, so it cannot be derived at runtime. What replaces derivation is a DRIFT GUARD:
 * the runner MEASURES the observed settle after every state change (`--settle`) and fails when it
 * exceeds this declared floor by more than SETTLE_TOLERANCE_MS. A platform that changes the TTL then
 * surfaces as one loud failure naming this constant, instead of as flaky cases.
 *
 * A write busts the region change-token immediately (`GenericSearchCachingRegion<OrganizationMembership>`,
 * :158), so this window bites ONLY on a passive expiry — i.e. exactly the V4B state.
 */
export const LOCK_CACHE_TTL_MS = 60_000;
export const LOCK_CACHE_TTL_SOURCE_REF =
  'vc-module-customer@dev Data/Services/OrganizationMembershipSearchService.cs:162 — AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1) (inline literal, no setting key)';
/** Headroom over LOCK_CACHE_TTL_MS before a measured settle is called drift rather than noise. */
export const SETTLE_TOLERANCE_MS = 30_000;

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 3. LANES
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * lane → the `@td()` alias whose account that lane owns. The RESERVATION itself is declared in prose
 * in `test-data/aliases.json` (`MULTI_ORG_TF_BR_ALT._notes`: "MULTI_ORG_TF_BR is reserved for the
 * BACKEND lane … MULTI_ORG_TF_BR_ALT is reserved for the FRONTEND lane"). Prose is not machine-
 * readable, so this map is the executable form of it and `findLaneReservationProblems()` asserts the
 * two still agree — otherwise a future edit to the notes would silently diverge from the code.
 */
export const LANES = Object.freeze({ backend: 'MULTI_ORG_TF_BR', frontend: 'MULTI_ORG_TF_BR_ALT' });
export const LANE_NAMES = Object.freeze(Object.keys(LANES));

/** The membership-declaring CSV — the single source of truth for which rows belong to which alias. */
export const MEMBERSHIP_CSV = 'b2b/organization-memberships';

/**
 * Resolve a lane's membership legs FROM THE CSV, never from a list in this file.
 *
 * `organization-memberships.csv` already carries the mapping in two columns that
 * `membership-alias-specs.mjs` defines: `alias` (which account) and `membership_id_field` (which
 * per-org alias field this row's membership id writes to). So a third lane is two CSV rows plus one
 * entry in LANES — no change here.
 *
 * @returns [{ membershipRowId, orgName, aliasField, roleId, status }] in CSV order
 */
export function laneLegs(rows, lane) {
  const alias = LANES[lane];
  if (!alias) throw new Error(`unknown lane "${lane}" — expected one of: ${LANE_NAMES.join(', ')}`);
  const legs = (rows || [])
    .filter((r) => String(r?.alias || '').trim() === alias)
    .map((r) => ({
      membershipRowId: String(r.membership_id || '').trim(),
      orgName: String(r.org_name || '').trim(),
      aliasField: String(r.membership_id_field || '').trim(),
      roleId: String(r.role_id || '').trim(),
      status: String(r.membership_status || '').trim(),
      email: String(r.user_email || '').trim(),
    }));
  if (legs.length < 2) {
    throw new Error(
      `lane "${lane}" (alias ${alias}) has ${legs.length} membership row(s) in test-data/${MEMBERSHIP_CSV}.csv — `
      + 'the lock axis needs a MULTI-org account (at least two legs) or every multi-org variant is vacuous',
    );
  }
  return legs;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 4. THE STATES — one per VCST-5317 variant, each defined RELATIVE TO THE ACTIVE ORG
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Lock kinds. `lockoutEnd` is what goes on the wire to POST .../{id}/lock:
 *   null      ⇒ permanent            (IsLocked=true,  LockoutEnd=null,   IsCurrentlyLocked=true)
 *   future    ⇒ timed, still live     (IsLocked=true,  LockoutEnd=future, IsCurrentlyLocked=true)
 *   past      ⇒ timed, ALREADY lapsed (IsLocked=true,  LockoutEnd=past,   IsCurrentlyLocked=FALSE)
 * All three verified live on vcst 2026-09-09; `/unlock` clears BOTH fields
 * (`OrganizationMembershipService.cs:122` — `model.LockoutEnd = isLocked ? lockoutEnd : null`).
 */
export const LOCK_KINDS = Object.freeze({ NONE: 'none', PERMANENT: 'permanent', TIMED_FUTURE: 'timed-future', TIMED_PAST: 'timed-past' });

/** Which org slot a state targets. Resolved against the LIVE active org, never against an org name. */
export const TARGETS = Object.freeze({ ACTIVE: 'active', NON_ACTIVE: 'non-active', ALL: 'all', NONE: 'none' });

/**
 * The variant table. Keys are the Test Model's V-numbers (`reports/ba/test-models/VCST-5317-2026-09-09.md`).
 *
 * `target` is deliberately ACTIVE / NON-ACTIVE rather than "TechFlow" / "BuildRight". Measured live on
 * vcst 2026-09-09: `me.contact.organization` is **BuildRight** for BOTH lane accounts (and
 * `contact.currentOrganizationId` agrees), so a state that named an org by name would silently swap V2
 * and V5 the moment the active org drifts — and it is ALREADY the opposite of what the VCST-5317
 * authoring plans assume. Defining the target relative to the live active org makes the distinction
 * hold by construction. See `findDecidabilityProblems()`.
 */
export const LOCK_STATES = Object.freeze({
  V1: {
    variant: 'V1', kind: LOCK_KINDS.NONE, target: TARGETS.NONE, resting: true,
    label: 'baseline — nothing locked',
    decides: 'the baseline every other row is read against: all orgs listed, none flagged, switcher on',
  },
  V2: {
    variant: 'V2', kind: LOCK_KINDS.PERMANENT, target: TARGETS.NON_ACTIVE,
    label: 'permanent lock on a NON-active org (LockoutEnd null)',
    alsoServes: ['V8'],
    decides: 'L2 listed + L3 flag + L5 render + L6 guard + L7 refusal for a lock the user is not sitting in. '
      + 'ALSO the V8 isMultiOrganization flip boundary: a 2-org account with 1 locked leaves EXACTLY ONE '
      + 'selectable org, which is the boundary itself — V8 needs no separate fixture.',
  },
  V3: {
    variant: 'V3', kind: LOCK_KINDS.TIMED_FUTURE, target: TARGETS.NON_ACTIVE,
    label: 'timed lock, LockoutEnd in the FUTURE',
    decides: 'that a live timed lock is indistinguishable from a permanent one at every link except L1 — '
      + 'both read IsCurrentlyLocked=true. Divergence from V4 is the whole point: same IsLocked, opposite flag.',
  },
  V4: {
    variant: 'V4', kind: LOCK_KINDS.TIMED_PAST, target: TARGETS.NON_ACTIVE,
    label: 'timed lock, LockoutEnd ALREADY in the past (seeded pre-expired)',
    decides: 'THE PREDICATE, and only the predicate: IsLocked=true with IsCurrentlyLocked=false. A surface '
      + 'reading raw IsLocked shows the org locked; one reading IsCurrentlyLocked shows it usable — the two '
      + 'readings DIVERGE, so the question is decidable. Precedent: VCST-5374 was this exact confusion. '
      + 'It does NOT decide passive expiry (no lock ever went live in this cache generation) — that is V4B.',
    tokenSurvives: true,
  },
  V4B: {
    variant: 'V4B', kind: LOCK_KINDS.TIMED_FUTURE, target: TARGETS.NON_ACTIVE, shortLived: true,
    label: 'timed lock expiring DURING the run (the passive-expiry reverse edge)',
    decides: 'the reverse edge V4 cannot: that a lapsing LockoutEnd re-enables the row with NO write. '
      + 'Requires observing locked, then waiting past LockoutEnd *and* the cache floor. Costs real wall-clock '
      + 'by construction — the expiry fires no event, so nothing can shorten it.',
  },
  V5: {
    variant: 'V5', kind: LOCK_KINDS.PERMANENT, target: TARGETS.ACTIVE,
    label: 'permanent lock on the org that IS active/current',
    decides: 'the shared-fragment blast radius (contact.organization inherits the flag) and the DEAD-END: '
      + 'the prepended current-org row renders disabled, leaving no selectable row and no recovery path.',
  },
  V7: {
    variant: 'V7', kind: LOCK_KINDS.PERMANENT, target: TARGETS.ALL,
    label: 'EVERY membership locked, multi-org account',
    decides: 'that AC-6 is unreachable through locking: every org is still returned, unfiltered totalCount>1 '
      + 'renders the switcher, and every row is dead — a hard dead-end rather than the specified empty state.',
  },
});

/** V6 (single-org, all locked) is NOT provisionable here — see `V6_IS_READ_ONLY` below. */
export const STATE_NAMES = Object.freeze(Object.keys(LOCK_STATES));
export const RESTING_STATE = 'V1';

/**
 * V6 already exists on the environment and MUST NOT be touched.
 *
 * `IMPERSONATE_TARGET_BLOCKED` (USR-021) is a SINGLE-org account whose only membership is locked
 * permanently — i.e. it is already the V6 shape, not the V2 shape. Verified live on vcst 2026-09-09:
 * it is the ONLY locked membership across TechFlow (27 rows) and BuildRight (10 rows).
 *
 * Suite 082's impersonation-blocked-target condition depends on it. Unlocking it — even transiently,
 * even "just to check" — breaks that suite, and the symptom (a 200 where a block was expected) looks
 * nothing like the cause. So V6 is consumed READ-ONLY and V2 is provisioned elsewhere.
 */
export const V6_IS_READ_ONLY = Object.freeze({
  alias: 'IMPERSONATE_TARGET_BLOCKED',
  membershipId: 'e693f711487f44958105745fc5a12c60',
  userId: '7bc13fe1-fd17-4182-a83c-983189dff115',
  orgName: 'AGENT-TEST-Org-TechFlow-20260310',
  observed: { isLocked: true, lockoutEnd: null, status: 'Approved', isCurrentlyLocked: true },
  dependedOnBy: 'suite 082 (impersonation — blocked target), IMP-049 Part A',
  reason: 'single-org + permanently locked = the V6 variant at rest; also the only locked membership on the env',
});

/** Does a token minted BEFORE this state is applied survive it? (post-state handler semantics.) */
export function tokenSurvivesState(stateName) {
  const st = LOCK_STATES[stateName];
  if (!st) throw new Error(`unknown state "${stateName}"`);
  // Sessions are terminated whenever the NEW state is IsCurrentlyLocked. V1 (unlock) and V4
  // (pre-expired ⇒ IsCurrentlyLocked false) therefore leave existing sessions alone.
  return st.kind === LOCK_KINDS.NONE || st.kind === LOCK_KINDS.TIMED_PAST;
}

/**
 * Wire value for `POST .../{id}/lock` body `lockoutEnd`, given a kind.
 * `offsetMs` is the horizon for the timed kinds; the caller owns it so a case can widen V4B's window.
 * Returns `undefined` for LOCK_KINDS.NONE — that state calls `/unlock`, which takes no body.
 */
export function resolveLockoutEnd(kind, now = Date.now(), offsetMs = null) {
  switch (kind) {
    case LOCK_KINDS.NONE: return undefined;
    case LOCK_KINDS.PERMANENT: return null;
    case LOCK_KINDS.TIMED_FUTURE: return new Date(now + (offsetMs ?? DEFAULT_FUTURE_HORIZON_MS)).toISOString();
    case LOCK_KINDS.TIMED_PAST: return new Date(now - (offsetMs ?? DEFAULT_PAST_HORIZON_MS)).toISOString();
    default: throw new Error(`unknown lock kind "${kind}"`);
  }
}

/**
 * Horizons. Both are comfortably clear of LOCK_CACHE_TTL_MS in their own direction, so neither V3 nor
 * V4 can be misread as the other because of cache lag:
 *   · V3 must still be live after the cache window and for the length of a UI walk ⇒ hours, not minutes.
 *   · V4 must be UNAMBIGUOUSLY lapsed even against a stale cache entry ⇒ well past the floor.
 * V4B deliberately has NO default: a state whose whole purpose is to expire mid-run must have its
 * window chosen explicitly by the caller, so nobody inherits a window that silently does not fit.
 */
export const DEFAULT_FUTURE_HORIZON_MS = 4 * 60 * 60 * 1000; // 4h
export const DEFAULT_PAST_HORIZON_MS = 4 * 60 * 60 * 1000;   // 4h
/** Floor for a V4B window: it must outlast the cache floor, or "still locked" is unobservable. */
export const MIN_SHORTLIVED_WINDOW_MS = LOCK_CACHE_TTL_MS + SETTLE_TOLERANCE_MS;

/**
 * Expand a state into the per-leg plan, given the LIVE active org id.
 *
 * @param stateName  one of STATE_NAMES
 * @param legs       [{ orgId, orgName, membershipId, aliasField }] resolved live for the lane
 * @param activeOrgId  the org the account is currently sitting in (me.contact.organization.id)
 * @param opts       { now, offsetMs }
 * @returns [{ ...leg, kind, lockoutEnd, wantCurrentlyLocked, role }]
 */
export function planState(stateName, legs, activeOrgId, { now = Date.now(), offsetMs = null } = {}) {
  const st = LOCK_STATES[stateName];
  if (!st) throw new Error(`unknown state "${stateName}" — expected one of: ${STATE_NAMES.join(', ')}`);
  if (!Array.isArray(legs) || legs.length < 2) throw new Error('planState needs at least two legs (a multi-org account)');
  if (st.shortLived && offsetMs === null) {
    throw new Error(
      `state ${stateName} expires DURING the run, so its window must be given explicitly `
      + `(--expires-in <seconds>, at least ${Math.ceil(MIN_SHORTLIVED_WINDOW_MS / 1000)}s so the locked phase `
      + `outlasts the ${LOCK_CACHE_TTL_MS / 1000}s cache floor)`,
    );
  }
  if (st.shortLived && offsetMs < MIN_SHORTLIVED_WINDOW_MS) {
    throw new Error(
      `--expires-in ${Math.round(offsetMs / 1000)}s is below the ${Math.ceil(MIN_SHORTLIVED_WINDOW_MS / 1000)}s floor: `
      + `the top-level read path caches locked-org ids for ${LOCK_CACHE_TTL_MS / 1000}s (${LOCK_CACHE_TTL_SOURCE_REF}), `
      + 'so a shorter window can expire before the locked phase is ever observable — the case would be flaky by construction',
    );
  }
  if (st.target !== TARGETS.NONE && !activeOrgId) {
    throw new Error(`state ${stateName} targets the ${st.target} org, so the live active org must be resolved first`);
  }

  return legs.map((leg) => {
    const isActive = leg.orgId === activeOrgId;
    const hit = st.target === TARGETS.ALL
      || (st.target === TARGETS.ACTIVE && isActive)
      || (st.target === TARGETS.NON_ACTIVE && !isActive);
    const kind = hit ? st.kind : LOCK_KINDS.NONE;
    const lockoutEnd = resolveLockoutEnd(kind, now, offsetMs);
    return {
      ...leg,
      role: isActive ? TARGETS.ACTIVE : TARGETS.NON_ACTIVE,
      kind,
      lockoutEnd,
      // What the SERVER should compute once this is applied — the assertion the runner reads back.
      wantCurrentlyLocked: isCurrentlyLocked({ isLocked: kind !== LOCK_KINDS.NONE, lockoutEnd }, now),
      wantIsLocked: kind !== LOCK_KINDS.NONE,
    };
  });
}

/** Is this membership already in the planned state? (idempotency — both fields, never one.) */
export function legStateMatches(membership, plannedLeg, now = Date.now()) {
  if (!membership) return false;
  if (Boolean(membership.isLocked) !== plannedLeg.wantIsLocked) return false;
  if (isCurrentlyLocked(membership, now) !== plannedLeg.wantCurrentlyLocked) return false;
  // A permanent lock and a timed one are both isLocked=true/currentlyLocked=true but are NOT the same
  // fixture: V2 must not silently satisfy V3. Distinguish on whether lockoutEnd is set at all.
  const haveEnd = membership.lockoutEnd !== null && membership.lockoutEnd !== undefined && membership.lockoutEnd !== '';
  const wantEnd = plannedLeg.lockoutEnd !== null && plannedLeg.lockoutEnd !== undefined;
  return haveEnd === wantEnd;
}

/** Human-readable current state of every field that matters, for logs and `--verify`. */
export function describeMembership(m, now = Date.now()) {
  return `isLocked=${String(m?.isLocked ?? '?').padEnd(5)} lockoutEnd=${String(m?.lockoutEnd ?? 'null').padEnd(26)} `
    + `status=${String(m?.status ?? 'null').padEnd(9)} server.isCurrentlyLocked=${String(m?.isCurrentlyLocked ?? '?').padEnd(5)} `
    + `ours=${isCurrentlyLocked(m, now)}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 5. THE SAFETY ALLOWLIST — the whole safety story of this script
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Refuse to write to any membership that is not one of the resolved lane legs.
 *
 * This is an ALLOWLIST BY CONSTRUCTION, not a denylist of things to avoid: the writable set is
 * derived from the lane's own two membership ids (themselves resolved live from the lane account's
 * userId), so EVERY other membership on the environment — all 27 TechFlow rows, all 10 BuildRight
 * rows, and every row belonging to any other user — is refused without needing to be enumerated.
 *
 * `V6_IS_READ_ONLY` is then a SECOND, named check on top. It is redundant against the allowlist by
 * design: it exists so the refusal message names suite 082 and explains WHY, rather than saying
 * "not in the allowlist" about the one membership whose accidental unlocking is most expensive.
 * Testing the list without testing the gate that reads it is how this kind of guard rots
 * (cf. `assertLockable` in sales-rep/set-rep-account-lock.mjs).
 */
export function assertWritable(membershipId, allowedIds, { lane = '?' } = {}) {
  const id = String(membershipId || '').trim();
  if (id === V6_IS_READ_ONLY.membershipId) {
    throw new Error(
      `REFUSING to change membership ${id} — it is ${V6_IS_READ_ONLY.alias} (${V6_IS_READ_ONLY.orgName}).\n`
      + `  It is the ONLY locked membership on this environment and it is depended on by ${V6_IS_READ_ONLY.dependedOnBy}.\n`
      + `  It is also SINGLE-org, so it is the V6 variant at rest — the V6 shape, not the V2 shape.\n`
      + '  Consume it READ-ONLY as V6 and provision V2 on a lane account instead.',
    );
  }
  const allowed = new Set((allowedIds || []).map((v) => String(v || '').trim()).filter(Boolean));
  if (!allowed.has(id)) {
    throw new Error(
      `REFUSING to change membership ${id} — it is not one of lane "${lane}"'s own membership rows `
      + `(${[...allowed].join(', ') || 'none resolved'}).\n`
      + '  The writable set is derived from the lane account\'s live memberships, so anything else belongs to\n'
      + '  another fixture or another lane. Locking a shared membership terminates that user\'s sessions\n'
      + '  globally and the symptom looks nothing like the cause.',
    );
  }
}

/** The other lane's alias — named in the log so a mis-targeted run is obvious at a glance. */
export function otherLane(lane) {
  return LANE_NAMES.find((l) => l !== lane) || null;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 6. DRIFT GUARDS — consumed by validate-membership-lock-data.mjs (`td:validate:membership-lock`)
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The lane reservation declared in `aliases.json` prose must still agree with `LANES` above.
 * Without this, an edit to those `_notes` diverges from the code silently and the lane split — the
 * one thing standing between two concurrent lanes and mutual corruption — becomes decorative.
 */
export function findLaneReservationProblems(aliases = {}) {
  const problems = [];
  const expectations = { backend: /BACKEND lane/i, frontend: /FRONTEND lane/i };
  for (const [lane, alias] of Object.entries(LANES)) {
    const def = aliases[alias];
    if (!def) { problems.push(`lane "${lane}": alias ${alias} does not exist in test-data/aliases.json`); continue; }
    const prose = `${def._comment || ''} ${def._notes || ''}`;
    if (!/reserv/i.test(prose)) {
      problems.push(`lane "${lane}": alias ${alias} no longer documents a lane RESERVATION in _comment/_notes — the lane split is what keeps two concurrent lanes from eating each other's isLocked state, so it must stay stated where a case author will read it`);
      continue;
    }
    const re = expectations[lane];
    if (re && !re.test(prose)) {
      problems.push(`lane "${lane}": alias ${alias} prose does not name it as the ${lane.toUpperCase()} lane (expected /${re.source}/) — LANES in membership-lock-specs.mjs and the aliases.json reservation have diverged`);
    }
  }
  // The two lanes must be DIFFERENT accounts, or the split is a no-op.
  const vals = Object.values(LANES);
  if (new Set(vals).size !== vals.length) problems.push(`LANES maps two lanes onto the same alias (${vals.join(', ')}) — the lane split would be a no-op`);
  return problems;
}

/**
 * SECOND-RULE guard (`.claude/rules/test-data.md` §SECOND RULE): every declared state must be
 * DISCRIMINATING — a state that cannot be told apart from another one makes its variant's question
 * undecidable, and a case built on it is a vacuous pass.
 *
 * This is the guard that FAILS when the discriminating gap collapses, rather than merely asserting
 * the fixture exists.
 */
export function findDecidabilityProblems() {
  const problems = [];
  const st = LOCK_STATES;

  // 1. V3 vs V4 — same isLocked, OPPOSITE isCurrentlyLocked. This gap IS the predicate under test
  //    (the VCST-5374 confusion). If both ever computed the same flag, scenario 8 tests nothing.
  const now = Date.now();
  const live = { isLocked: true, lockoutEnd: resolveLockoutEnd(st.V3.kind, now) };
  const lapsed = { isLocked: true, lockoutEnd: resolveLockoutEnd(st.V4.kind, now) };
  if (isCurrentlyLocked(live, now) !== true) problems.push('V3 (timed-future) does not compute isCurrentlyLocked=true — its lock is not live, so it cannot represent an active timed lock');
  if (isCurrentlyLocked(lapsed, now) !== false) problems.push('V4 (timed-past) does not compute isCurrentlyLocked=false — the whole point of V4 is IsLocked=true with the flag FALSE; without that divergence the raw-IsLocked defect is undetectable');
  if (isCurrentlyLocked(live, now) === isCurrentlyLocked(lapsed, now)) problems.push('V3 and V4 compute the SAME isCurrentlyLocked — the timed-lock boundary has collapsed and scenario 8 is vacuous');

  // 2. V2 vs V5 must target OPPOSITE sides of the active-org distinction, or the "is the locked org
  //    the one I am sitting in?" axis is untested and the two variants silently duplicate.
  if (st.V2.target === st.V5.target) problems.push(`V2 and V5 both target the ${st.V2.target} org — the active-vs-non-active axis has collapsed; V5's dead-end question and V2's non-current question would be the same test`);
  if (st.V5.target !== TARGETS.ACTIVE) problems.push(`V5 must target the ACTIVE org (it is the dead-end variant), not "${st.V5.target}"`);
  if (st.V2.target !== TARGETS.NON_ACTIVE) problems.push(`V2 must target a NON-ACTIVE org, not "${st.V2.target}"`);

  // 3. V7 must lock EVERY leg, or "all memberships locked" is a lie and the AC-6 question is undecidable.
  if (st.V7.target !== TARGETS.ALL) problems.push(`V7 must target ALL legs, not "${st.V7.target}" — otherwise a selectable org survives and it is a V2, not an all-locked dead end`);

  // 4. V1 must be the resting state and must lock nothing.
  if (!st[RESTING_STATE]?.resting) problems.push(`RESTING_STATE is "${RESTING_STATE}" but that state is not marked resting`);
  if (st[RESTING_STATE].kind !== LOCK_KINDS.NONE) problems.push(`resting state ${RESTING_STATE} locks something (kind=${st[RESTING_STATE].kind}) — teardown could never restore a clean environment`);

  // 5. V4B's window must outlast the cache floor, or the passive-expiry observation is unobservable.
  if (MIN_SHORTLIVED_WINDOW_MS <= LOCK_CACHE_TTL_MS) problems.push(`MIN_SHORTLIVED_WINDOW_MS (${MIN_SHORTLIVED_WINDOW_MS}ms) does not exceed the ${LOCK_CACHE_TTL_MS}ms cache floor — a V4B lock could expire before it was ever observable as locked`);

  // 6. The V3/V4 horizons must both clear the cache floor in their own direction, or cache lag can
  //    make one read as the other.
  if (DEFAULT_FUTURE_HORIZON_MS <= LOCK_CACHE_TTL_MS) problems.push(`DEFAULT_FUTURE_HORIZON_MS (${DEFAULT_FUTURE_HORIZON_MS}ms) does not clear the ${LOCK_CACHE_TTL_MS}ms cache floor — a V3 lock could lapse mid-observation`);
  if (DEFAULT_PAST_HORIZON_MS <= LOCK_CACHE_TTL_MS) problems.push(`DEFAULT_PAST_HORIZON_MS (${DEFAULT_PAST_HORIZON_MS}ms) does not clear the ${LOCK_CACHE_TTL_MS}ms cache floor — a V4 lock might still be reported live from a stale cache entry`);

  // 7. Every state must say what it decides — the SECOND RULE's "state the fixture's own limits".
  for (const [name, s] of Object.entries(st)) {
    if (!String(s.decides || '').trim()) problems.push(`state ${name} declares no \`decides\` rationale — a fixture whose question is unstated cannot be shown to be discriminating`);
  }
  return problems;
}

/**
 * Guard the applied-state record's shape (written to the gitignored
 * `test-data/b2b/_seed-results-membership-lock-<env>.json`). Exported so the unit tests pin it.
 */
export function buildAppliedRecord({ lane, state, activeOrgId, legs, env, settleMs = null, now = Date.now() }) {
  return {
    _comment: 'LAST APPLIED org-membership lock state (VCST-5317). EPHEMERAL and gitignored. The RESTING '
      + `state is ${RESTING_STATE} (everything unlocked); this file records what a run last applied, so it goes `
      + 'stale the moment anything else writes. `--verify` reads the live platform and is the only authority.',
    lane,
    laneAlias: LANES[lane],
    state,
    restingState: RESTING_STATE,
    env,
    activeOrgId,
    appliedAt: new Date(now).toISOString(),
    observedSettleMs: settleMs,
    cacheFloorMs: LOCK_CACHE_TTL_MS,
    cacheFloorSource: LOCK_CACHE_TTL_SOURCE_REF,
    predicateSource: LOCK_PREDICATE_SOURCE_REF,
    tokenSurvives: tokenSurvivesState(state),
    legs: (legs || []).map((l) => ({
      membershipId: l.membershipId, orgId: l.orgId, orgName: l.orgName, aliasField: l.aliasField,
      role: l.role, kind: l.kind, lockoutEnd: l.lockoutEnd ?? null,
      wantIsLocked: l.wantIsLocked, wantCurrentlyLocked: l.wantCurrentlyLocked,
    })),
  };
}
