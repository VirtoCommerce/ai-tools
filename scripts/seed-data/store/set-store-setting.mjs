#!/usr/bin/env node
/**
 * set-store-setting.mjs — flip ONE store setting SAFELY (GET → merge → PUT the FULL body).
 *
 *   TEST_ENV=vcst npm run store:set -- --name Loyalty.Missions.Enable --value false
 *   TEST_ENV=vcst npm run store:set -- --name Loyalty.Missions.Enable --value true --store B2B-store
 *   TEST_ENV=vcst npm run store:set -- --name Stores.TaxCalculationEnabled --value false --dry-run
 *   TEST_ENV=vcst npm run store:set -- --list                       # print current settings
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────
 * `PUT /api/stores` REPLACES the entity. On 2026-08-27 suite 075d's store-toggle cases
 * (MSN-010/017/018) hand-rolled a partial body —
 *     PUT /api/stores {"id":"B2B-store","catalog":"…","name":"B2B-store",
 *                      "settings":[{"name":"Loyalty.Missions.Enable","value":false}]}
 * — which nulled `defaultCurrency`, `defaultLanguage`, `url` and `secureUrl` on the shared env,
 * twice in one afternoon; the second took the storefront down.
 *
 * The correct shape already existed, in exactly one place: `setMissionsEnabled()` in
 * loyalty/seed-loyalty-missions.mjs, which reads the store and spreads it
 * (`{...store, settings: settings.map(...)}`). That is why no seeder ever reproduced the bug.
 * This generalises that one correct implementation so the next person who needs a store toggle
 * has a right path to reach for instead of hand-rolling a partial PUT.
 *
 * Three things make it safe rather than merely convenient:
 *   1. FULL-BODY MERGE — the live store is read and spread; only the one setting's `value` moves.
 *      No field can be dropped by omission, because nothing is omitted.
 *   2. PRE-WRITE REFUSAL — `fieldsLostByWrite()` (store-defaults-specs.mjs) re-checks the composed
 *      body against the live one and ABORTS if any required default would regress. This is a
 *      belt-and-braces guard on the merge itself: it would have refused suite 075d's body outright.
 *   3. SETTING MUST ALREADY EXIST — a name the store does not declare is a typo or an undeployed
 *      module, and inventing the row would write a setting nothing reads. It aborts and says so.
 *
 * It does NOT add/remove settings, and it does not touch anything but `settings[].value`.
 */

import {
  DRY_RUN, VERBOSE, STORE_ID, api, auth, assertSafeTarget, log,
} from '../../lib/seed-common.mjs';
import {
  fieldsLostByWrite, mergeSettingValue, coerceSettingValue, REQUIRED_FIELD_NAMES,
} from './store-defaults-specs.mjs';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const NAME = flag('--name');
const RAW_VALUE = flag('--value');
const TARGET_STORE = flag('--store') || STORE_ID;
const LIST = argv.includes('--list');

(async () => {
  console.log(`🔧 Store setting${DRY_RUN ? ' [DRY RUN]' : ''} — store ${TARGET_STORE}`);
  assertSafeTarget();
  await auth();

  const store = await api('GET', `/api/stores/${encodeURIComponent(TARGET_STORE)}`, null, { expectStatus: [200, 404] });
  if (!store?.id) { console.error(`ABORT: store "${TARGET_STORE}" does not exist on this env.`); process.exit(2); }

  const settings = store.settings || [];
  if (LIST) {
    for (const s of settings.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      console.log(`  ${s.name} = ${JSON.stringify(s.value)} (${s.valueType})`);
    }
    console.log(`  — ${settings.length} setting(s) on ${store.id}`);
    process.exit(0);
  }

  if (!NAME || RAW_VALUE === null) {
    console.error('ABORT: --name <Setting.Name> and --value <v> are required (or --list).');
    process.exit(2);
  }

  const current = settings.find((s) => s.name === NAME);
  if (!current) {
    console.error(
      `ABORT: store "${store.id}" declares no setting named "${NAME}".\n`
      + '  A setting this store does not carry is a typo or a module that is not deployed on this env.\n'
      + `  Inventing the row would write a setting nothing reads. Run with --list to see the ${settings.length} real names.`,
    );
    process.exit(2);
  }

  let desired;
  try { desired = coerceSettingValue(RAW_VALUE, current.valueType); }
  catch (e) { console.error(`ABORT: ${e.message}`); process.exit(2); }

  if (current.value === desired) {
    log(`✓ ${NAME} already ${JSON.stringify(desired)} on ${store.id} — no write`);
    process.exit(0);
  }

  // (1) FULL-BODY MERGE — spread the live store; move exactly one settings[].value.
  const next = mergeSettingValue(store, NAME, desired);

  // (2) PRE-WRITE REFUSAL — a required default may never regress through a store write.
  const lost = fieldsLostByWrite(store, next);
  if (lost.length) {
    console.error(
      `ABORT: the composed body would blank ${lost.join(', ')} on "${store.id}".\n`
      + '  PUT /api/stores REPLACES the entity — this is the 2026-08-27 storefront outage. Refusing to write.',
    );
    process.exit(2);
  }
  if (VERBOSE) log(`  required defaults preserved: ${REQUIRED_FIELD_NAMES.map((f) => `${f}=${JSON.stringify(next[f])}`).join(' · ')}`);

  if (DRY_RUN) {
    log(`[DRY] would set ${NAME}: ${JSON.stringify(current.value)} → ${JSON.stringify(desired)} on ${store.id} (full-body PUT, ${settings.length} setting(s) preserved)`);
    process.exit(0);
  }

  await api('PUT', '/api/stores', next, { expectStatus: [200, 204] });

  // (3) READ-BACK — prove the write landed AND that nothing else moved.
  const after = await api('GET', `/api/stores/${encodeURIComponent(TARGET_STORE)}`, null, { expectStatus: [200] });
  const got = (after?.settings || []).find((s) => s.name === NAME)?.value;
  const regressed = REQUIRED_FIELD_NAMES.filter((f) => !after?.[f] && store?.[f]);
  if (regressed.length) {
    console.error(`FAILED: ${regressed.join(', ')} is now blank on "${store.id}" after the write — restore it immediately (see npm run td:reconcile:store).`);
    process.exit(1);
  }
  if (got !== desired) {
    console.error(`FAILED: ${NAME} reads back as ${JSON.stringify(got)}, expected ${JSON.stringify(desired)}.`);
    process.exit(1);
  }
  log(`✓ ${NAME}: ${JSON.stringify(current.value)} → ${JSON.stringify(desired)} on ${store.id} (required defaults intact)`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
