#!/usr/bin/env node
/**
 * set-membership-roles-whitelist.mjs — apply / verify / tear down the STORE-LEVEL MEMBERSHIP-ROLES
 * WHITELIST (`Customer.MembershipRolesWhitelist` on tenant `Store`/{STORE_ID}) via the platform's
 * settings **v2 tenant values** endpoint.
 *
 * The mechanism, the v1-vs-v2 field inversion, why an empty store value is NOT a neutral teardown,
 * and the falsifiability argument all live in `membership-roles-whitelist-specs.mjs` — read that
 * first; this file is the thin resolve -> GET -> merge -> POST -> read-back runner.
 *
 * Usage:
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-roles-whitelist.mjs
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-roles-whitelist.mjs --dry-run
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-roles-whitelist.mjs --verify
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-roles-whitelist.mjs --teardown
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-roles-whitelist.mjs --store Electronics
 *   TEST_ENV=vcst node scripts/seed-data/b2b/set-membership-roles-whitelist.mjs --variant narrowed
 *
 * npm: seed:membership-roles · seed:membership-roles:teardown · seed:membership-roles:verify
 *
 * THE NARROWED VARIANT IS A DECLARED TARGET, NOT THE STEADY STATE. A plain apply leaves the store in
 * the FULL seeded set and merely RECORDS `narrowed_values` (= seeded minus the declared omitted role)
 * to the alias overlay, for a case to write during its own run and restore from `seeded_values_json`
 * afterwards. `--variant narrowed` applies it for manual work only and says so loudly.
 *
 * SAFETY — three properties, none of which depends on the happy path:
 *   1. ONE KEY. The POST body carries exactly the one settings key. The endpoint is a partial MERGE
 *      (measured: a single-key POST left all 106 of this store's keys intact), and the runner
 *      re-reads the FULL key set afterwards and aborts if the count moved — so if a platform change
 *      ever turned it into a replace, this run says so instead of silently wiping the store.
 *   2. PRE-STATE CAPTURE IS WRITE-ONCE. Teardown restores what was there BEFORE the fixture. A
 *      second apply must never recapture, or the "original" becomes the fixture's own output and
 *      teardown degrades to a no-op. `capturePreState()` owns that decision.
 *   3. NOTHING IS SEEDED THAT PROVES NOTHING. Every entry is matched against the LIVE roles list and
 *      the sales-rep half is resolved by PERMISSION; a zero-length sales-rep set aborts the run
 *      rather than quietly writing only the org roles.
 */
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  assertSafeTarget, auth, api, log, verbose, loadAliases, ROOT, STORE_ID,
  DRY_RUN, TEARDOWN, writeEnvAliasOverride,
} from '../../lib/seed-common.mjs';
import {
  SETTING_NAME, TENANT_TYPE, ALIAS, ORG_ROLE_NAMES, DESCRIPTOR_POOL, DESCRIPTOR_POOL_SOURCE_REF,
  SALES_REP_GRANT_PERMISSION, DECLARED_GRANTING_ROLES, PICKER_PAGE_SIZE, PICKER_SOURCE_REF,
  REFRESH_REQUIREMENT, FIXTURE_LIMITS, NARROWED_OMITTED_ROLE,
  tenantValuesPath, sameSet, selectSalesRepRoles, buildWhitelist, planWrite,
  capturePreState, planTeardown, entriesOutsideDefaultPage, findRoleProblems, findDecidabilityProblems,
  buildNarrowedValues, toJsonArrayField, parseJsonArrayField, findNarrowingProblems,
} from './membership-roles-whitelist-specs.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => (has(f) ? argv[argv.indexOf(f) + 1] : d);

const VERIFY = has('--verify');
const EMIT_JSON = has('--json');
/**
 * `--variant narrowed` applies the NARROWED target instead of the full seeded set. Manual-work only:
 * it is never the default, and `npm run seed:membership-roles` (no flag) always leaves the store in
 * the full seeded state. The narrowed set is a DECLARED TARGET a case writes during its own run.
 */
const VARIANT = (val('--variant') || 'seeded').toLowerCase();
if (!['seeded', 'narrowed'].includes(VARIANT)) {
  console.error(`--variant must be "seeded" (default) or "narrowed" — got "${VARIANT}"`);
  process.exit(1);
}
const TARGET_STORE = val('--store') || STORE_ID;
const TEST_ENV = process.env.TEST_ENV || 'vcst';
const VALUES_PATH = tenantValuesPath(TARGET_STORE, TENANT_TYPE);

/* ── alias overlay (layered, like the @td() resolver) ─────────────────────────────────────────── */

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

/** The captured pre-state for THIS env+store, or null. Stored JSON-encoded (an alias field is a string). */
function readCapture() {
  const a = loadLayeredAliases()[ALIAS] || {};
  const raw = a.pre_state;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/* ── live reads ───────────────────────────────────────────────────────────────────────────────── */

const getValues = () => api('GET', VALUES_PATH, null, { expectStatus: [200] });

/** The store's current whitelist, plus the full key set so a replace can be detected. */
async function readWhitelist() {
  const values = await getValues();
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error(`GET ${VALUES_PATH} did not return a flat { name: value } object — got ${Array.isArray(values) ? 'an array' : typeof values}. The v2 tenant-values contract has changed.`);
  }
  const raw = values[SETTING_NAME];
  return { values, keyCount: Object.keys(values).length, whitelist: Array.isArray(raw) ? raw : (raw == null ? [] : [raw]) };
}

/**
 * Every live role WITH its permissions. `roles/search` does NOT populate `permissions`, so each role
 * is fetched by NAME (`GET /api/platform/security/roles/{roleName}` — the by-id form returns an empty
 * body, which would read as "no permissions" and silently resolve the sales-rep set to zero).
 */
async function readLiveRoles() {
  const found = await api('POST', '/api/platform/security/roles/search', { take: 500 }, { expectStatus: [200, 201] });
  const list = found?.results || found?.items || [];
  if (!list.length) throw new Error('GET roles/search returned no roles — cannot validate any whitelist entry against a live role');
  const out = [];
  for (const r of list) {
    const full = await api('GET', `/api/platform/security/roles/${encodeURIComponent(r.name)}`, null, { expectStatus: [200, 404] });
    out.push({ id: r.id, name: r.name, permissions: (full?.permissions || []).map((p) => p?.name || p).filter(Boolean) });
  }
  return out;
}

/* ── the write ────────────────────────────────────────────────────────────────────────────────── */

/**
 * GET -> merge -> POST -> GET, with the read-back asserting BOTH that the value landed and that
 * nothing else moved. Never trusts the 2xx: the endpoint accepts any string (it does not validate
 * against the dictionary pool), so a 200 says only that the request was well-formed.
 */
async function writeWhitelist(target, { label }) {
  const before = await readWhitelist();
  const plan = planWrite(before.whitelist, target);
  log(`  ${label}: live=[${before.whitelist.join(', ') || '(empty)'}]`);
  log(`  ${label}: want=[${target.join(', ') || '(empty)'}]`);
  if (!plan.changed) { log(`  ${label}: ${plan.reason} — no write`); return { changed: false, before, after: before }; }
  if (DRY_RUN) { log(`  [DRY] would POST ${VALUES_PATH} ${JSON.stringify(plan.body)}`); return { changed: false, before, after: before, dryRun: true }; }

  await api('POST', VALUES_PATH, plan.body, { expectStatus: [200, 201, 204] });

  const after = await readWhitelist();
  if (after.keyCount !== before.keyCount) {
    throw new Error(
      `CRITICAL: this store's tenant-values key count moved ${before.keyCount} -> ${after.keyCount} across a SINGLE-KEY write.\n`
      + '  The v2 tenant-values POST is supposed to be a partial MERGE. If it has become a REPLACE, this store just lost\n'
      + `  ${before.keyCount - after.keyCount} setting(s). Restore them from the pre-state recorded above before doing anything else.`,
    );
  }
  if (!sameSet(after.whitelist, target)) {
    throw new Error(
      `${label}: read-back does NOT match the target.\n`
      + `  wanted [${target.join(', ')}]\n  got    [${after.whitelist.join(', ')}]\n`
      + '  The POST returned 2xx, but this endpoint accepts any string without validating it, so a 2xx is not evidence.',
    );
  }
  log(`  ${label}: read-back OK -> [${after.whitelist.join(', ')}] (${after.keyCount} tenant keys intact)`);
  return { changed: true, before, after };
}

/* ── modes ────────────────────────────────────────────────────────────────────────────────────── */

async function verify() {
  const { whitelist, keyCount } = await readWhitelist();
  const captured = readCapture();
  log(`store ${TARGET_STORE} (${TEST_ENV}) — ${keyCount} tenant setting keys`);
  log(`  ${SETTING_NAME} = [${whitelist.join(', ') || '(empty)'}]`);
  log(`  captured pre-state: ${captured ? `[${captured.join(', ') || '(empty)'}]` : '(none — teardown would refuse)'}`);

  const liveRoles = await readLiveRoles();
  const salesRep = selectSalesRepRoles(liveRoles).map((r) => r.name);
  const target = buildWhitelist(ORG_ROLE_NAMES, salesRep);
  const seeded = sameSet(whitelist, target);
  log(`  live sales-rep roles (${SALES_REP_GRANT_PERMISSION}): [${salesRep.join(', ') || 'NONE'}]`);
  log(`  seeded state: ${seeded ? 'PRESENT — the fixture is applied' : 'ABSENT — the whitelist is not the fixture set'}`);

  const missing = whitelist.filter((v) => !liveRoles.some((r) => r.name.toLowerCase() === String(v).trim().toLowerCase()));
  if (missing.length) log(`  ⚠ entries matching NO live role (silently invisible in the picker): ${missing.map((v) => `"${v}"`).join(', ')}`);

  const orderedLiveRoleNames = liveRoles.map((r) => r.name);
  const outside = entriesOutsideDefaultPage(orderedLiveRoleNames, whitelist, PICKER_PAGE_SIZE);
  if (outside.length) log(`  ⚠ outside the picker's default page of ${PICKER_PAGE_SIZE}: ${outside.map((v) => `"${v}"`).join(', ')} — type a keyword to see them`);

  // ── NARROWED VARIANT contract ────────────────────────────────────────────────────────────────
  const ov = loadLayeredAliases()[ALIAS] || {};
  const recordedNarrowed = parseJsonArrayField(ov.narrowed_values, `${ALIAS}.narrowed_values`);
  const recordedSeededJson = parseJsonArrayField(ov.seeded_values_json, `${ALIAS}.seeded_values_json`);
  const omittedPos = orderedLiveRoleNames.findIndex((n) => n.toLowerCase() === NARROWED_OMITTED_ROLE.toLowerCase()) + 1;
  log(`  narrowed_omitted_role: "${NARROWED_OMITTED_ROLE}" — live position ${omittedPos || 'ABSENT'}/${orderedLiveRoleNames.length}`);
  log(`  seeded_values_json:    ${recordedSeededJson ? JSON.stringify(recordedSeededJson) : '(none — re-run apply)'}`);
  log(`  narrowed_values:       ${recordedNarrowed ? JSON.stringify(recordedNarrowed) : '(none — re-run apply)'}`);

  const narrowProblems = findNarrowingProblems({
    seededValues: recordedSeededJson || target, omittedRole: NARROWED_OMITTED_ROLE,
    orderedLiveRoleNames, pageSize: PICKER_PAGE_SIZE, pool: DESCRIPTOR_POOL,
  });
  if (narrowProblems.length) {
    // Loud, and non-zero exit: a narrowed variant that no longer discriminates keeps every case
    // built on it GREEN, so a warning here would be read as noise.
    throw new Error(`NARROWED VARIANT NO LONGER ADMISSIBLE on ${TEST_ENV}:\n  - ${narrowProblems.join('\n  - ')}`);
  }
  if (recordedNarrowed && recordedSeededJson && sameSet(recordedNarrowed, recordedSeededJson)) {
    throw new Error(`${ALIAS}.narrowed_values equals .seeded_values_json — the variant omits nothing and ORGROLE-019 would pass vacuously`);
  }
  log(`  narrowed variant: ADMISSIBLE — "${NARROWED_OMITTED_ROLE}" is inside the picker's default page of ${PICKER_PAGE_SIZE} and inside the seeded set`);

  return { whitelist, captured, seeded, salesRep, liveRoles, missing, outside, recordedNarrowed, recordedSeededJson };
}

async function apply() {
  const liveRoles = await readLiveRoles();
  log(`live roles: ${liveRoles.length}`);

  // "All sales-rep roles" — resolved LIVE by permission, never transcribed.
  const salesRepRoles = selectSalesRepRoles(liveRoles);
  const salesRep = salesRepRoles.map((r) => r.name);
  log(`sales-rep roles by permission "${SALES_REP_GRANT_PERMISSION}": ${salesRep.length ? salesRep.map((n) => `"${n}"`).join(', ') : 'NONE'}`);
  const nameLooksSalesRep = liveRoles.filter((r) => /sales|rep/i.test(r.name) && !salesRep.includes(r.name)).map((r) => r.name);
  if (nameLooksSalesRep.length) {
    verbose(`EXCLUDED — name looks sales-rep but carries no "${SALES_REP_GRANT_PERMISSION}": ${nameLooksSalesRep.map((n) => `"${n}"`).join(', ')}`);
  }
  const declaredMissing = DECLARED_GRANTING_ROLES.filter((n) => !salesRep.includes(n));
  const liveExtra = salesRep.filter((n) => !DECLARED_GRANTING_ROLES.includes(n));
  if (declaredMissing.length || liveExtra.length) {
    log(`  ⚠ live set diverges from this repo's declared GRANTING_ROLES (sales-rep-docs-specs.mjs).`);
    if (declaredMissing.length) log(`     declared but NOT live: ${declaredMissing.map((n) => `"${n}"`).join(', ')}`);
    if (liveExtra.length) log(`     live but NOT declared:  ${liveExtra.map((n) => `"${n}"`).join(', ')} (live wins — update the declaration)`);
  }

  // Fail loud rather than seed something unfalsifiable.
  const roleProblems = findRoleProblems({ orgRoleNames: ORG_ROLE_NAMES, salesRepRoles, liveRoles });
  if (roleProblems.length) throw new Error(`ROLE RESOLUTION FAILED:\n  - ${roleProblems.join('\n  - ')}`);

  const target = buildWhitelist(ORG_ROLE_NAMES, salesRep);
  const decid = findDecidabilityProblems({ orgRoleNames: ORG_ROLE_NAMES, salesRepRoleNames: salesRep, pool: DESCRIPTOR_POOL });
  if (decid.length) throw new Error(`DECIDABILITY FAILED — this whitelist would not discriminate:\n  - ${decid.join('\n  - ')}`);
  log(`seeded whitelist (${target.length}): [${target.join(', ')}]`);
  log(`  divergence that makes it falsifiable: ${ORG_ROLE_NAMES.length} inside the module's hardcoded pool, ${salesRep.length} OUTSIDE it (${DESCRIPTOR_POOL_SOURCE_REF})`);

  // ── NARROWED VARIANT — derived, guarded LIVE, recorded. Never applied by default. ────────────
  // The live check is the load-bearing one: the omitted role must sit inside the picker's default
  // keyword-less page, or its disappearance under the narrowed whitelist is a PAGING artifact and
  // the case built on it proves nothing while still passing.
  const orderedLiveRoleNames = liveRoles.map((r) => r.name);
  const narrowProblems = findNarrowingProblems({
    seededValues: target, omittedRole: NARROWED_OMITTED_ROLE, orderedLiveRoleNames,
    pageSize: PICKER_PAGE_SIZE, pool: DESCRIPTOR_POOL,
  });
  if (narrowProblems.length) throw new Error(`NARROWED VARIANT INADMISSIBLE — refusing to record a variant that discriminates nothing:\n  - ${narrowProblems.join('\n  - ')}`);
  const narrowed = buildNarrowedValues(target, NARROWED_OMITTED_ROLE);
  const omittedPos = orderedLiveRoleNames.findIndex((n) => n.toLowerCase() === NARROWED_OMITTED_ROLE.toLowerCase()) + 1;
  log(`narrowed variant (${narrowed.length}): [${narrowed.join(', ')}]  — omits "${NARROWED_OMITTED_ROLE}"`);
  log(`  "${NARROWED_OMITTED_ROLE}" is live at position ${omittedPos}/${orderedLiveRoleNames.length}, INSIDE the picker's default page of ${PICKER_PAGE_SIZE} — its disappearance is the whitelist, not paging`);
  log('  DECLARED TARGET ONLY: it is recorded to the alias overlay for a case to write during its own run; this seeder does not apply it.');

  // The applied state. `--variant narrowed` is manual-work only and never the npm-script default.
  const applyTarget = VARIANT === 'narrowed' ? narrowed : target;
  if (VARIANT === 'narrowed') {
    log('');
    log('⚠ --variant narrowed: applying the NARROWED set. This is NOT the fixture\'s steady state.');
    log(`  Re-run \`TEST_ENV=${TEST_ENV} npm run seed:membership-roles\` to restore the full seeded set before leaving the env.`);
    log('');
  }

  // PRE-STATE capture — write-once, and BEFORE the write.
  const before = await readWhitelist();
  const cap = capturePreState(readCapture(), before.whitelist, applyTarget);
  log(`PRE-STATE: [${before.whitelist.join(', ') || '(empty)'}]  (${before.keyCount} tenant keys)`);
  log(`  capture: ${cap.capture ? 'YES' : 'no'} — ${cap.reason}`);
  if (cap.capture && !DRY_RUN) {
    writeEnvAliasOverride({ [ALIAS]: { pre_state: JSON.stringify(cap.value), captured_at: new Date().toISOString() } });
    log(`  recorded to test-data/aliases.${TEST_ENV}.json as ${ALIAS}.pre_state`);
  }

  const res = await writeWhitelist(applyTarget, { label: `${SETTING_NAME}${VARIANT === 'narrowed' ? ' (narrowed variant)' : ''}` });

  if (!DRY_RUN) {
    // seeded_values / sales_rep_roles describe the fixture's STEADY STATE and are written whichever
    // variant is applied — `--variant narrowed` is a temporary manual excursion, not a new steady
    // state, and rewriting them to the narrowed set would make a Cleanup restore the wrong thing.
    writeEnvAliasOverride({
      [ALIAS]: {
        seeded_values: target.join(';'),
        seeded_values_json: toJsonArrayField(target),
        sales_rep_roles: salesRep.join(';'),
        narrowed_values: toJsonArrayField(narrowed),
        // Static, but it MUST be written to the overlay: the @td() resolver's inline path reads only
        // TOP-LEVEL keys of an alias object and never the base entry's nested `fields` documentation
        // bag, so a case referencing .narrowed_omitted_role resolves on an env only if the seeder put
        // it here. Omitting it worked on vcst purely because the key had been added by hand.
        narrowed_omitted_role: NARROWED_OMITTED_ROLE,
      },
    });
    log(`  wrote ${ALIAS}.seeded_values + .seeded_values_json + .sales_rep_roles + .narrowed_values + .narrowed_omitted_role to test-data/aliases.${TEST_ENV}.json`);
  }

  const outside = entriesOutsideDefaultPage(orderedLiveRoleNames, target, PICKER_PAGE_SIZE);
  log('');
  log(`REFRESH REQUIRED: ${REFRESH_REQUIREMENT}`);
  if (outside.length) {
    log(`PICKER PAGING: ${outside.map((v) => `"${v}"`).join(', ')} fall outside the picker's default page of ${PICKER_PAGE_SIZE}.`);
    log(`  ${PICKER_SOURCE_REF}`);
    log('  Their absence from the un-keyworded picker is PAGING, not the whitelist — type a keyword to bring them in.');
  }
  log('');
  log('THIS FIXTURE DOES NOT DECIDE:');
  for (const l of FIXTURE_LIMITS) log(`  · ${l}`);

  if (EMIT_JSON) {
    console.log(JSON.stringify({
      env: TEST_ENV, store: TARGET_STORE, setting: SETTING_NAME, tenantType: TENANT_TYPE,
      preState: res.before.whitelist, seeded: target, salesRepRoles: salesRep,
      variantApplied: VARIANT, applied: applyTarget,
      narrowedOmittedRole: NARROWED_OMITTED_ROLE, narrowed, narrowedOmittedRoleLivePosition: omittedPos,
      changed: res.changed, tenantKeyCount: res.after.keyCount, outsideDefaultPage: outside,
    }, null, 2));
  }
  return res;
}

async function teardown() {
  const { whitelist } = await readWhitelist();
  const plan = planTeardown(readCapture(), whitelist);
  if (!plan.restore) throw new Error(`TEARDOWN REFUSED: ${plan.reason}`);
  log(`teardown: live=[${whitelist.join(', ') || '(empty)'}] -> pre-state=[${plan.target.join(', ') || '(empty)'}]`);
  if (!plan.changed) { log(`  ${plan.reason}`); }
  else await writeWhitelist(plan.target, { label: `${SETTING_NAME} (restore)` });

  // Zero-residue proof: re-read and assert the live value IS the captured pre-state.
  if (!DRY_RUN) {
    const after = await readWhitelist();
    if (!sameSet(after.whitelist, plan.target)) {
      throw new Error(`teardown did NOT restore the pre-state — live is [${after.whitelist.join(', ')}], expected [${plan.target.join(', ')}]`);
    }
    log(`  zero-residue confirmed: ${SETTING_NAME} = [${after.whitelist.join(', ') || '(empty)'}] (${after.keyCount} tenant keys intact)`);
  }
}

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  await auth();
  log(`${SETTING_NAME} on tenant ${TENANT_TYPE}/${TARGET_STORE} (${TEST_ENV})${DRY_RUN ? ' [DRY RUN]' : ''}`);

  if (VERIFY) { await verify(); return; }
  if (TEARDOWN) { await teardown(); log(DRY_RUN ? '\nDRY RUN complete.' : '\nTeardown complete.'); return; }
  await apply();
  log(DRY_RUN ? '\nDRY RUN complete.' : '\nApplied. Run with --teardown to restore the captured pre-state.');
}

// Run ONLY when executed, never on import — an unguarded main() would authenticate against a live
// environment from any future import (e.g. a validator reaching for a helper in this file).
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((e) => { console.error(`SET-MEMBERSHIP-ROLES-WHITELIST FAILED: ${e.message}`); process.exit(1); });
}
