#!/usr/bin/env node
/**
 * set-membership-lock.mjs — apply / verify / tear down the ORG-MEMBERSHIP LOCK state a VCST-5317
 * variant needs, on ONE lane, via the REST lock endpoints.
 *
 * Design rationale, the lane split, the source-grounded predicate, the session-termination semantics
 * and the safety allowlist all live in `membership-lock-specs.mjs` — read that first; this file is the
 * thin resolve → write → read-back → measure runner.
 *
 * Usage:
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-lock.mjs --lane frontend --state V2
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-lock.mjs --lane backend  --state V4
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-lock.mjs --lane frontend --state V4B --expires-in 120
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-lock.mjs --lane frontend --verify
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-lock.mjs --lane frontend --teardown
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-lock.mjs --teardown --all-lanes
 *
 * npm:  seed:membership-lock · seed:membership-lock:teardown · seed:membership-lock:verify
 *
 * TEARDOWN IS THE SAFETY STORY, so it is available three ways and never depends on the happy path:
 *   · `--teardown` (optionally `--all-lanes`) restores V1 on every leg it can reach;
 *   · applying `--state V1` is the same operation by another name;
 *   · `--verify` exits non-zero on any residue, so a gate can detect a leaked lock without writing.
 * A lock left behind is exactly the residue that poisons a later suite: it terminates the fixture's
 * sessions on every subsequent lock transition and makes an unrelated suite fail at sign-in.
 */
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv, loadAliases, ROOT,
  DRY_RUN, TEARDOWN,
} from '../../lib/seed-common.mjs';
import {
  LANES, LANE_NAMES, LOCK_STATES, STATE_NAMES, RESTING_STATE, LOCK_KINDS, MEMBERSHIP_CSV,
  LOCK_CACHE_TTL_MS, SETTLE_TOLERANCE_MS, LOCK_CACHE_TTL_SOURCE_REF, LOCK_PREDICATE_SOURCE_REF,
  laneLegs, planState, legStateMatches, isCurrentlyLocked, disagreesWithServer, describeMembership,
  assertWritable, otherLane, tokenSurvivesState, buildAppliedRecord, V6_IS_READ_ONLY,
} from './membership-lock-specs.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => (has(f) ? argv[argv.indexOf(f) + 1] : d);

const LANE = val('--lane');
const ALL_LANES = has('--all-lanes');
const VERIFY = has('--verify');
const NO_SETTLE = has('--no-settle');
const EMIT_JSON = has('--json');
const EXPIRES_IN = val('--expires-in') ? Number(val('--expires-in')) * 1000 : null;
const STATE = TEARDOWN ? RESTING_STATE : val('--state');
const TEST_ENV = process.env.TEST_ENV || 'vcst';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `loadAliases()` reads the COMMITTED base only, and every runtime id this script needs — the lane's
 * `userId`, its contact `id`, both membership ids — lives in the per-env overlay by design (the
 * multi-env writeback rule: a runtime GUID must never sit in a committed file). So layer the overlay
 * field-by-field the way the `@td()` resolver does, or every lookup here comes back empty on an env
 * that is in fact fully seeded.
 */
function loadLayeredAliases() {
  const base = loadAliases();
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  if (!existsSync(p)) { verbose(`no aliases.${TEST_ENV}.json overlay`); return base; }
  const overlay = JSON.parse(readFileSync(p, 'utf8'));
  const merged = { ...base };
  for (const [alias, fields] of Object.entries(overlay)) {
    if (alias.startsWith('_')) continue;
    merged[alias] = { ...(base[alias] || {}), ...fields };
  }
  return merged;
}

/* ── resolution ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Resolve a lane's legs LIVE: the CSV declares which orgs and which alias fields, the platform
 * supplies the membership + org ids. Nothing here is transcribed.
 */
async function resolveLane(lane) {
  const rows = loadCsv(`test-data/${MEMBERSHIP_CSV}.csv`);
  const declared = laneLegs(rows, lane);
  const aliases = loadLayeredAliases();
  const alias = LANES[lane];
  const userId = String(aliases?.[alias]?.userId || '').trim();
  if (!userId) {
    throw new Error(
      `alias ${alias} has no resolved userId on ${TEST_ENV} — @td(${alias}.userId) is empty.\n`
      + `  Seed the account first: TEST_ENV=${TEST_ENV} node scripts/seed-data/b2b/seed-company-users.mjs cross-org --only ${alias}`,
    );
  }

  // The lane's OWN memberships, straight from the platform. This search result IS the allowlist.
  const found = await api('POST', '/api/customer/organization-memberships/search', { userId, take: 50 }, { expectStatus: [200, 201] });
  const live = found?.results || found?.items || [];
  if (!live.length) throw new Error(`no OrganizationMembership rows for ${alias} (userId ${userId}) on ${TEST_ENV}`);

  const legs = declared.map((d) => {
    const m = live.find((x) => String(x.organizationName || '').trim() === d.orgName);
    if (!m) {
      throw new Error(
        `lane "${lane}": CSV row ${d.membershipRowId} declares org "${d.orgName}" but ${alias} has no membership there.\n`
        + `  live orgs: ${live.map((x) => x.organizationName).join(', ')}`,
      );
    }
    return { ...d, membershipId: m.id, orgId: m.organizationId, live: m };
  });

  const activeOrgId = await resolveActiveOrg(alias, aliases, legs);
  return { lane, alias, userId, legs, activeOrgId, allowedIds: legs.map((l) => l.membershipId) };
}

/**
 * Which org is the account CURRENTLY sitting in?
 *
 * This is load-bearing, not cosmetic: V2 ("lock a NON-active org") and V5 ("lock the ACTIVE org") are
 * defined relative to it, so getting it wrong silently swaps the two variants and both cases pass or
 * fail for the wrong reason.
 *
 * Read from the CONTACT entity (`currentOrganizationId`), which is what a fresh password grant
 * resolves the org claim from. Measured on vcst 2026-09-09: BuildRight for BOTH lane accounts, and
 * `me.contact.organization.id` in a real session agrees — i.e. it is NOT TechFlow, which the VCST-5317
 * authoring plans assume. Falls back to `organizations[0]` when the field is null (the platform's own
 * fallback), and reports which path was taken so the assumption is never invisible.
 */
async function resolveActiveOrg(alias, aliases, legs) {
  const contactId = String(aliases?.[alias]?.id || '').trim();
  if (!contactId) { log(`WARN: ${alias} has no resolved contact id — cannot determine the active org`); return null; }
  const c = await api('GET', `/api/members/${contactId}`, null, { expectStatus: [200, 404] });
  const current = String(c?.currentOrganizationId || '').trim();
  const fallback = String((c?.organizations || [])[0] || '').trim();
  const chosen = current || fallback;
  const name = legs.find((l) => l.orgId === chosen)?.orgName || chosen || '(none)';
  log(`active org: ${name} (${chosen || 'unresolved'}) via ${current ? 'contact.currentOrganizationId' : 'organizations[0] fallback'}`);
  if (!current && fallback) log('  NOTE: currentOrganizationId is null, so this is the PLATFORM\'S fallback, not a pinned choice — a sign-in could land elsewhere');
  return chosen || null;
}

/* ── writes ──────────────────────────────────────────────────────────────────────────────────── */

const getMembership = (id) => api('GET', `/api/customer/organization-memberships/${id}`, null, { expectStatus: [200, 404] });

/**
 * Apply one leg. Read back ALWAYS — never trust the 200.
 *
 * `SetLockState` returns null for an unknown id (`OrganizationMembershipService.cs:115-119`), and the
 * controller wraps that in `Ok(...)`, so an id typo answers **200 OK with a null body** rather than
 * 404. A run that trusted the status code would report success over having done nothing.
 */
async function applyLeg(ctx, leg) {
  assertWritable(leg.membershipId, ctx.allowedIds, { lane: ctx.lane });

  const before = await getMembership(leg.membershipId);
  if (!before?.id) throw new Error(`membership ${leg.membershipId} does not exist on ${TEST_ENV}`);

  if (legStateMatches(before, leg)) {
    log(`  ${leg.orgName} [${leg.role}] already ${leg.kind} — nothing to do (idempotent)`);
    return { ...leg, changed: false, after: before };
  }
  if (DRY_RUN) {
    log(`  [DRY] ${leg.orgName} [${leg.role}] ${describeMembership(before)}`);
    log(`  [DRY]   would ${leg.kind === LOCK_KINDS.NONE ? 'UNLOCK' : `LOCK (lockoutEnd=${leg.lockoutEnd ?? 'null'})`} => wantCurrentlyLocked=${leg.wantCurrentlyLocked}`);
    return { ...leg, changed: false, after: before, dryRun: true };
  }

  if (leg.kind === LOCK_KINDS.NONE) {
    await api('POST', `/api/customer/organization-memberships/${leg.membershipId}/unlock`, null, { expectStatus: [200, 201, 204] });
  } else {
    // `lockoutEnd: null` is a MEANINGFUL body (permanent), distinct from omitting it — send it explicitly.
    await api('POST', `/api/customer/organization-memberships/${leg.membershipId}/lock`, { lockoutEnd: leg.lockoutEnd ?? null }, { expectStatus: [200, 201, 204] });
  }

  const after = await getMembership(leg.membershipId);
  if (!after?.id) throw new Error(`${leg.orgName}: read-back returned no entity — the write did not land (a null body behind a 200 means the id was not found)`);
  if (!legStateMatches(after, leg)) {
    throw new Error(
      `${leg.orgName}: ${leg.kind} did NOT take effect.\n`
      + `  wanted isLocked=${leg.wantIsLocked} currentlyLocked=${leg.wantCurrentlyLocked} lockoutEnd=${leg.lockoutEnd ?? 'null'}\n`
      + `  got    ${describeMembership(after)}\n`
      + '  check the token carries customer:organization-membership:update',
    );
  }
  if (disagreesWithServer(after)) {
    throw new Error(
      `${leg.orgName}: OUR predicate and the SERVER's computed isCurrentlyLocked DISAGREE — ${describeMembership(after)}.\n`
      + `  ours mirrors ${LOCK_PREDICATE_SOURCE_REF}; a disagreement means the platform predicate changed and\n`
      + '  every lock-axis assertion in this run is reading a different rule than the one it was designed against.',
    );
  }
  log(`  ${leg.orgName} [${leg.role}] -> ${leg.kind}: ${describeMembership(after)}`);
  return { ...leg, changed: true, after };
}

/**
 * MEASURE the staleness window on the cached top-level path, rather than trusting the transcribed
 * 60s figure (the one constant here that cannot be derived — see LOCK_CACHE_TTL_SOURCE_REF).
 *
 * `onlyLocked` is the criterion `GetLockedOrganizationIdsAsync` caches, so polling it until it agrees
 * with the per-entity GET measures the real window. A write busts the region token immediately, so on
 * a lock/unlock this should return ~instantly; a measurably long settle here is itself the finding.
 * Fails when the observed settle exceeds the declared floor + tolerance: that converts a transcribed
 * constant into a drift-guarded one.
 */
async function measureSettle(ctx, plan) {
  const expected = new Set(plan.filter((l) => l.wantCurrentlyLocked).map((l) => l.membershipId));
  const t0 = Date.now();
  const deadline = t0 + LOCK_CACHE_TTL_MS + SETTLE_TOLERANCE_MS;
  let last = null;
  while (Date.now() < deadline) {
    const r = await api('POST', '/api/customer/organization-memberships/search', { userId: ctx.userId, onlyLocked: true, take: 50 }, { expectStatus: [200, 201] });
    const got = new Set((r?.results || []).map((m) => m.id));
    last = [...got];
    if (got.size === expected.size && [...expected].every((id) => got.has(id))) {
      const ms = Date.now() - t0;
      log(`settle: cached onlyLocked path agrees after ${ms} ms (floor ${LOCK_CACHE_TTL_MS} ms)`);
      return ms;
    }
    await sleep(2000);
  }
  throw new Error(
    `settle DRIFT: the cached onlyLocked path still disagrees after ${Date.now() - t0} ms.\n`
    + `  expected locked: [${[...expected].join(', ') || 'none'}]\n  observed locked: [${(last || []).join(', ') || 'none'}]\n`
    + `  declared floor: ${LOCK_CACHE_TTL_MS} ms + ${SETTLE_TOLERANCE_MS} ms tolerance, from ${LOCK_CACHE_TTL_SOURCE_REF}\n`
    + '  either that constant changed upstream, or the region change-token is no longer busted by a lock write.',
  );
}

/* ── modes ───────────────────────────────────────────────────────────────────────────────────── */

/** Live read of every leg on a lane. Non-zero exit on residue — usable as a gate without writing. */
async function verifyLane(lane) {
  const ctx = await resolveLane(lane);
  log(`lane ${lane} (${ctx.alias}, userId ${ctx.userId}) — resting state is ${RESTING_STATE} (everything unlocked)`);
  let residue = 0; let mismatch = 0;
  for (const leg of ctx.legs) {
    const m = await getMembership(leg.membershipId);
    const role = leg.orgId === ctx.activeOrgId ? 'active' : 'non-active';
    log(`  ${leg.orgName} [${role}] ${leg.membershipId}: ${describeMembership(m)}`);
    if (isCurrentlyLocked(m) || m?.isLocked) {
      residue += 1;
      log('    ^^ RESIDUE — this leg is not at the resting state; run --teardown');
    }
    if (disagreesWithServer(m)) { mismatch += 1; log('    ^^ PREDICATE DISAGREEMENT with the server\'s computed isCurrentlyLocked'); }
  }
  return { residue, mismatch, ctx };
}

async function applyState(lane, stateName) {
  const st = LOCK_STATES[stateName];
  if (!st) throw new Error(`unknown --state "${stateName}" — expected one of: ${STATE_NAMES.join(', ')}`);
  const ctx = await resolveLane(lane);

  log(`lane ${lane} (${ctx.alias}) -> ${stateName}: ${st.label}`);
  verbose(`decides: ${st.decides}`);
  if (st.alsoServes?.length) log(`  also serves: ${st.alsoServes.join(', ')}`);
  const oth = otherLane(lane);
  if (oth) verbose(`the ${oth} lane (${LANES[oth]}) is untouched by this run`);

  const plan = planState(stateName, ctx.legs, ctx.activeOrgId, { offsetMs: EXPIRES_IN });
  for (const leg of plan) assertWritable(leg.membershipId, ctx.allowedIds, { lane });

  if (!tokenSurvivesState(stateName) && !DRY_RUN) {
    log('  NOTE: this state lands IsCurrentlyLocked=true, so ALL of this user\'s sessions are terminated');
    log('        globally (RevokeTokenOrganizationMembershipChangedEventHandler). Acquire tokens AFTER this run.');
  } else if (!DRY_RUN) {
    log('  NOTE: this state does NOT terminate sessions (the post-state is not currently-locked), so a token');
    log('        minted before this run stays valid.');
  }

  const applied = [];
  for (const leg of plan) applied.push(await applyLeg(ctx, leg));

  let settleMs = null;
  if (!DRY_RUN && !NO_SETTLE && applied.some((l) => l.changed)) settleMs = await measureSettle(ctx, plan);

  if (st.shortLived && !DRY_RUN) {
    const end = plan.find((l) => l.lockoutEnd)?.lockoutEnd;
    log(`  ${stateName} EXPIRES AT ${end} — the expiry fires NO write and NO event, so nothing can shorten the wait.`);
    log(`  A case must observe "locked" first, then wait past that instant PLUS the ${LOCK_CACHE_TTL_MS / 1000}s cache floor.`);
  }

  if (!DRY_RUN) emitAppliedRecord({ lane, state: stateName, activeOrgId: ctx.activeOrgId, legs: applied, settleMs });
  return { ctx, applied, settleMs };
}

/**
 * THIS SCRIPT WRITES NO FILES, DELIBERATELY.
 *
 * Two separate reasons, and both matter:
 *
 *  1. Nothing needs writing to `aliases.<env>.json`. Every id a case binds — the four membership ids,
 *     both org ids, the contact and account ids — is ALREADY in the overlay from the membership
 *     seeder. And an ALIAS whose value is a mutable lock state would be a staleness trap: a case
 *     binding `@td(SOMETHING.locked_org)` would read whatever a previous run happened to leave.
 *
 *  2. A per-run results file under `test-data/` is explicitly forbidden. `seed-common.mjs:273-276`
 *     (VCST-5406) removed the `_seed-results-*.json` family and says so in as many words: "Do not
 *     reintroduce a generic results-file writer here — it drifts the test-data tree and the twins."
 *     A lock-state record is exactly that shape.
 *
 * So the applied state is emitted to STDOUT (`--json`) for whoever invoked the run, and the
 * authoritative answer to "what is locked right now?" is `--verify`, which reads the live platform.
 * A record on disk could only ever be a second, staler answer to the same question.
 */
function emitAppliedRecord({ lane, state, activeOrgId, legs, settleMs }) {
  const rec = buildAppliedRecord({ lane, state, activeOrgId, legs, env: TEST_ENV, settleMs });
  if (EMIT_JSON) console.log(JSON.stringify(rec, null, 2));
  else verbose(`applied: ${rec.laneAlias} ${rec.state} activeOrg=${rec.activeOrgId} settle=${rec.observedSettleMs ?? 'n/a'}ms (pass --json for the full record)`);
}

/** Restore V1 on a lane, then PROVE zero residue by reading every leg back. */
async function teardownLane(lane) {
  log(`\n--- teardown lane ${lane} -> ${RESTING_STATE}`);
  await applyState(lane, RESTING_STATE);
  const { residue, mismatch } = await verifyLane(lane);
  if (residue) throw new Error(`teardown left ${residue} locked leg(s) on lane ${lane} — NOT zero-residue`);
  if (mismatch) throw new Error(`teardown left ${mismatch} predicate disagreement(s) on lane ${lane}`);
  log(`lane ${lane}: zero residue confirmed`);
}

/* ── main ────────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  await auth();

  const lanes = ALL_LANES ? LANE_NAMES : [LANE];
  if (!ALL_LANES && !LANE) {
    throw new Error(
      `--lane is REQUIRED and has no default (one of: ${LANE_NAMES.join(', ')}).\n`
      + '  An OrganizationMembership row is keyed on (userId, organizationId) and carries the per-org isLocked\n'
      + '  this script mutates, so the two lanes must never share an account: '
      + Object.entries(LANES).map(([l, a]) => `${l}=${a}`).join(', ') + '.\n'
      + '  Defaulting it is how one lane silently eats the other lane\'s lock state.',
    );
  }
  for (const l of lanes) if (!LANES[l]) throw new Error(`unknown lane "${l}" — expected one of: ${LANE_NAMES.join(', ')}`);

  if (VERIFY) {
    let residue = 0; let mismatch = 0;
    for (const l of lanes) { const r = await verifyLane(l); residue += r.residue; mismatch += r.mismatch; }
    log(`\nread-only V6 reference (NEVER written by this script): ${V6_IS_READ_ONLY.alias} membership ${V6_IS_READ_ONLY.membershipId}`);
    const v6 = await getMembership(V6_IS_READ_ONLY.membershipId);
    log(`  ${describeMembership(v6)}  <- must stay locked for ${V6_IS_READ_ONLY.dependedOnBy}`);
    if (!isCurrentlyLocked(v6)) { log('  ✗ V6 IS NO LONGER LOCKED — suite 082 depends on it; restore it before running anything'); process.exitCode = 1; }
    if (residue || mismatch) { log(`\nVERIFY FAILED: ${residue} locked leg(s), ${mismatch} predicate disagreement(s)`); process.exitCode = 1; }
    else log('\nVERIFY OK — every lane leg is at the resting state and V6 is intact');
    return;
  }

  if (TEARDOWN) { for (const l of lanes) await teardownLane(l); log(DRY_RUN ? '\nDRY RUN complete.' : '\nTeardown complete.'); return; }

  if (!STATE) throw new Error(`--state is required (one of: ${STATE_NAMES.join(', ')}), or pass --teardown / --verify`);
  if (ALL_LANES) throw new Error('--all-lanes is only for --teardown / --verify: applying one state to BOTH lanes defeats the lane split');
  await applyState(LANE, STATE);
  log(DRY_RUN ? '\nDRY RUN complete.' : `\nApplied ${STATE} to lane ${LANE}. REMEMBER: the resting state is ${RESTING_STATE} — run --teardown when the case is done.`);
}

// Run ONLY when executed, never on import: the unit tests import nothing from here today, but an
// unguarded main() would authenticate against a live environment from any future import.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((e) => { console.error(`SET-MEMBERSHIP-LOCK FAILED: ${e.message}`); process.exit(1); });
}
