/**
 * validate-missions-deadline-data.mjs — drift + VACUITY guard for the VCST-5957 deadline/availability
 * mission set. STATIC: reads test-data/aliases.json, test-data/aliases.<env>.json and the
 * side-effect-free spec module. No network (the live half is the seeder's own reader-view verify and
 * `--observe`).
 *
 *   [1] the spec is decidable — every ladder edge present, each pair straddles its band with ONE difference
 *   [2] the committed base declares every alias, with every runtime field EMPTY and no GUID anywhere
 *   [3] the base's authored fields equal the spec (one source of truth, the base only mirrors it)
 *   [4] the overlay shadows no authored key (an overlay value wins field-by-field over the base)
 *   [5] a seeded run is coherent: names carry the run handle, valid_until = seeded_at + slack
 *   [6] the OBSERVED seed-time readings are the ones the spec declared — and still discriminate:
 *       DUE_15/DUE_16 and DUE_30/DUE_31 read different bands, DONE_SOON read Completed at DUE_15's days
 *   [w] a run past valid_until is a WARNING, not a failure: the set is time-terminal by design
 *
 * Exit 0 clean, 1 on any problem.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MISSIONS, MISSION_BY_ALIAS, RUN_ALIAS, TARGETS, ALL_ALIASES, NAME_PREFIX, DAY_OFFSET_SLACK_HOURS,
  runtimeFieldsFor, validateSpecShape, severityFor,
} from './missions-deadline-specs.mjs';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENV = resolveTestEnv('vcst');
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const problems = [];
const warnings = [];
const read = (rel) => { const p = join(ROOT, rel); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };

// [1]
for (const p of validateSpecShape()) problems.push(`[1] ${p}`);

// [2] + [3]
const base = read('test-data/aliases.json') || {};
const authoredFor = (name) => {
  if (name === RUN_ALIAS) return { name_prefix: NAME_PREFIX };
  if (name === TARGETS.GONE.aliasName) return { sku: TARGETS.GONE.sku, name: TARGETS.GONE.name };
  const m = MISSION_BY_ALIAS[name];
  return {
    key: m.key, goal_type: m.goal.type,
    goal_target: m.goal.type === 'PerSkuGoal' ? (m.goal.all ? 'PerSkuAll' : 'PerSkuAny') : String(m.goal.count ?? m.goal.value),
    reward: m.reward, days_remaining: m.days === null ? '' : String(m.days),
    expected_status: m.expect.status, expected_severity: m.expect.severity,
  };
};
for (const name of ALL_ALIASES) {
  const e = base[name];
  if (!e) { problems.push(`[2] ${name} is not declared in test-data/aliases.json`); continue; }
  for (const f of runtimeFieldsFor(name)) {
    if (!(f in e)) problems.push(`[2] ${name}.${f} is missing from the base (it must exist, empty, so @td() resolves to "" on an unseeded env)`);
    else if (e[f] !== '') problems.push(`[2] ${name}.${f} = ${JSON.stringify(e[f])} in the COMMITTED base — runtime values belong in aliases.<env>.json`);
  }
  for (const [k, v] of Object.entries(e)) {
    if (k.startsWith('_') || k === 'fields') continue;
    if (GUID_RE.test(String(v))) problems.push(`[2] ${name}.${k} carries a GUID in the committed base`);
    if (!e.fields?.[k]) problems.push(`[2] ${name}.${k} is not exposed in ${name}.fields — @td(${name}.${k}) cannot resolve`);
  }
  for (const [k, want] of Object.entries(authoredFor(name))) {
    if (String(e[k]) !== String(want)) problems.push(`[3] ${name}.${k} = ${JSON.stringify(e[k])}, spec says ${JSON.stringify(want)}`);
  }
}

// [4] .. [6]
const overlay = read(`test-data/aliases.${ENV}.json`) || {};
for (const name of ALL_ALIASES) {
  const o = overlay[name];
  if (!o) continue;
  const runtime = runtimeFieldsFor(name);
  for (const k of Object.keys(o)) {
    if (k.startsWith('_') || k === 'fields' || runtime.includes(k)) continue;
    problems.push(`[4] aliases.${ENV}.json ${name}.${k} shadows an AUTHORED base field — remove it from the overlay`);
  }
}
const run = overlay[RUN_ALIAS];
if (!run?.run_id) {
  warnings.push(`no ${RUN_ALIAS}.run_id on ${ENV} — the set has not been seeded there (expected between runs)`);
} else {
  const slack = Date.parse(run.valid_until) - Date.parse(run.seeded_at);
  if (slack !== DAY_OFFSET_SLACK_HOURS * 3600 * 1000) problems.push(`[5] valid_until - seeded_at = ${slack} ms, expected ${DAY_OFFSET_SLACK_HOURS} h`);
  const reading = {};
  for (const m of MISSIONS) {
    const o = overlay[m.aliasName] || {};
    const want = `${NAME_PREFIX}-${run.run_id}-${m.key}`;
    if (o.name !== want) problems.push(`[5] ${m.aliasName}.name = ${JSON.stringify(o.name)}, expected ${want} (a mission from another run on the same alias)`);
    if (o.run_id !== run.run_id) problems.push(`[5] ${m.aliasName}.run_id ${o.run_id} != ${RUN_ALIAS}.run_id ${run.run_id}`);
    if (m.expect.observational) continue;
    const d = o.days_remaining_at_seed === '' || o.days_remaining_at_seed === undefined ? undefined : Number(o.days_remaining_at_seed);
    reading[m.aliasName] = { days: d, completed: o.status_at_seed === 'Completed' };
    if (d !== m.days) problems.push(`[6] ${m.aliasName}: daysRemaining observed at seed ${o.days_remaining_at_seed}, spec declares ${m.days}`);
    if (o.status_at_seed !== m.expect.status) problems.push(`[6] ${m.aliasName}: status observed at seed ${o.status_at_seed}, spec declares ${m.expect.status}`);
  }
  const sev = (a) => severityFor({ daysRemaining: reading[a]?.days, completed: reading[a]?.completed });
  for (const [a, b] of [['MSN_DL_DUE_15', 'MSN_DL_DUE_16'], ['MSN_DL_DUE_30', 'MSN_DL_DUE_31'], ['MSN_DL_DUE_15', 'MSN_DL_DONE_SOON']]) {
    if (reading[a] && reading[b] && sev(a) === sev(b)) problems.push(`[6] observed ${a}/${b} both read ${sev(a)} — the pair no longer discriminates`);
  }
  if (Date.parse(run.valid_until) <= Date.now()) {
    warnings.push(`run ${run.run_id} expired at ${run.valid_until}: every MSN_DL_DUE_* band has shifted. Re-seed before reading it, `
      + `and archive it: node scripts/seed-data/loyalty/seed-missions-deadline.mjs --teardown --run ${run.run_id}`);
  }
}

for (const w of warnings) console.log(`  ⚠ ${w}`);
if (problems.length) {
  console.log(`✗ missions-deadline: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`✓ missions-deadline: ${ALL_ALIASES.length} aliases, spec decidable, base clean${run?.run_id ? `, run ${run.run_id} coherent` : ''} (${ENV})`);
