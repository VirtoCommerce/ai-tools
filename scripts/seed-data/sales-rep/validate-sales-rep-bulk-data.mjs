#!/usr/bin/env node
/**
 * validate-sales-rep-bulk-data.mjs — drift guard for the SR_REP_PRIMARY bulk-volume dataset
 * (sales-rep-bulk-specs.mjs, seeded by seed-sales-rep-bulk.mjs). No network, no writes.
 * Run: npm run td:validate:sr-bulk   (TEST_ENV=<env> also checks that env's overlay)
 *
 *  [1] the default-size dataset still answers the chain's question: bulkShortfalls() is empty
 *      (LARGE org >= 1000 statistics orders and >= $1,000,000; MID org 3-digit; magnitudes DIVERGE;
 *      a cancelled order exists so count != statistics count),
 *  [2] the target rep exists in sales-reps.csv and is seeded,
 *  [3] every created entity name carries the AGENT-TEST- mark,
 *  [4] every status is in the live salesRepOrderFilterRules vocabulary,
 *  [5] the overlay alias is registered in the committed base aliases.json with EMPTY runtime fields,
 *  [6] if aliases.<TEST_ENV>.json carries the dataset: org_ids are two GUIDs and the recorded counts
 *      match the spec at the recorded size (a non-vacuity check on the SEEDED state).
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BULK_REP_KEY, BULK_ORDER_MARK, BULK_ORG_PREFIX, BULK_ORGS, BULK_CUSTOMER_NAME, BULK_DEFAULT_COUNT,
  BULK_STATUS_WEIGHTS, BULK_DATASET_ALIAS, bulkShortfalls, bulkProfile,
} from './sales-rep-bulk-specs.mjs';
import { ROWCAP_STATUS_VOCABULARY, GUID_RE } from './sales-rep-rowcap-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = []; const notes = [];
const fail = (m) => problems.push(m);

// [1]
for (const s of bulkShortfalls(BULK_DEFAULT_COUNT)) fail(`[1] ${s}`);
const prof = bulkProfile(BULK_DEFAULT_COUNT);
notes.push(`default ${BULK_DEFAULT_COUNT} orders: ${prof.perOrg.map((o) => `${o.key} ${o.statsCount} / $${o.statsTotal}`).join('; ')}`);

// [2]
const reps = readFileSync(join(ROOT, 'test-data/sales-rep/sales-reps.csv'), 'utf8').split(/\r?\n/);
const repLine = reps.find((l) => l.startsWith(`${BULK_REP_KEY},`));
if (!repLine) fail(`[2] ${BULK_REP_KEY} missing from test-data/sales-rep/sales-reps.csv`);

// [3]
for (const n of [BULK_ORDER_MARK, BULK_ORG_PREFIX, BULK_CUSTOMER_NAME, ...BULK_ORGS.map((o) => o.name)]) {
  if (!n.startsWith('AGENT-TEST-')) fail(`[3] "${n}" lacks the AGENT-TEST- prefix — teardown sweeps would miss it`);
}

// [4]
for (const s of BULK_STATUS_WEIGHTS) {
  if (!ROWCAP_STATUS_VOCABULARY.includes(s.status)) fail(`[4] status "${s.status}" is not in the salesRepOrderFilterRules vocabulary`);
}

// [5]
const base = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const entry = base[BULK_DATASET_ALIAS];
if (!entry) fail(`[5] ${BULK_DATASET_ALIAS} missing from committed test-data/aliases.json`);
else {
  for (const k of ['org_ids', 'order_count', 'stats_order_count', 'large_stats_total', 'seeded_at']) {
    if (!(k in entry)) fail(`[5] ${BULK_DATASET_ALIAS}.${k} not declared in the base`);
    else if (entry[k] !== '') fail(`[5] ${BULK_DATASET_ALIAS}.${k} must be "" in the committed base — runtime values live in aliases.<env>.json`);
  }
}

// [6]
const env = process.env.TEST_ENV;
const overlayPath = env ? join(ROOT, `test-data/aliases.${env}.json`) : null;
if (overlayPath && existsSync(overlayPath)) {
  const ds = JSON.parse(readFileSync(overlayPath, 'utf8'))[BULK_DATASET_ALIAS];
  if (ds && ds.org_ids) {
    const ids = ds.org_ids.split(';');
    if (ids.length !== BULK_ORGS.length || !ids.every((i) => GUID_RE.test(i))) fail(`[6] ${env}: ${BULK_DATASET_ALIAS}.org_ids is not ${BULK_ORGS.length} GUIDs`);
    const n = parseInt(ds.order_count, 10);
    const seededProf = bulkProfile(n);
    if (String(seededProf.statsCount) !== String(ds.stats_order_count)) fail(`[6] ${env}: stats_order_count ${ds.stats_order_count} != spec ${seededProf.statsCount} at ${n} orders (partial seed? re-run seed:sales-rep-bulk)`);
    const short = bulkShortfalls(n);
    if (short.length) fail(`[6] ${env}: the SEEDED size (${n}) cannot answer the question: ${short.join('; ')}`);
    notes.push(`${env}: ${n} order(s) seeded, statistics ${ds.stats_order_count}, LARGE total $${ds.large_stats_total}`);
  } else notes.push(`${env}: dataset not seeded (no ${BULK_DATASET_ALIAS} values)`);
}

console.log('sales-rep bulk-volume dataset — drift guard');
for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('  OK');
