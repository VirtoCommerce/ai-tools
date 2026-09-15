#!/usr/bin/env node
/**
 * validate-multiorg-balance-data.mjs — DRIFT / VACUITY GUARD for the multi-organization loyalty
 * balance fixture (LOYORG-E2E-003, suite 083e). STATIC only (no network).
 * `npm run td:validate:multiorg-balance`; exits 1 on a hard problem.
 *
 * What it protects, and why each check earns its place:
 *
 *  [1] The DECLARED plan is still DISCRIMINATING (`planProblems`). This is the one that matters.
 *      The set can stay perfectly well-formed, seed cleanly and resolve every `@td()` while
 *      answering nothing: equalise two earn quantities and the leak becomes invisible; make one an
 *      exact multiple of another and a double-count reads as the other pool; make one the sum of
 *      the other two and a cross-organization pooling bug reads as the third. Every one of those is
 *      a one-cell edit that no other gate in this repo can see.
 *
 *  [2] The SEEDED state is still discriminating — the same predicate applied to the figures the
 *      last seed actually recorded in `aliases.<env>.json`. [1] cannot see this: balances EARN
 *      upward and can never be reset, so a later unrelated run (or a re-seed) can push one pool
 *      onto an exact multiple of another long after the plan was last touched, and the case then
 *      silently stops discriminating. This is a HARD failure, not a warning — a recorded triple
 *      that cannot decide the question is worse than none, because a case will assert on it.
 *
 *  [3] The alias contract: `MULTI_ORG_LOY_POOLS` exists, is `_inline`, exposes exactly the field
 *      names the spec declares, and every one of them is EMPTY in the committed base. An unseeded
 *      env must resolve them to "" (a clear miss), never to another env's value.
 *
 *  [4] No runtime GUID and no password literal in the committed base (the multi-env rule +
 *      td:reconcile secret hygiene). A balance figure is not a GUID, but the org ids are, and they
 *      are exactly the kind of value that gets "helpfully" pasted in.
 *
 *  [5] The actor contract: `MULTI_ORG_TF_BR_ALT` still exists, still declares BOTH organization
 *      ids and a `{{VAR}}` password, and is still the FRONTEND-lane twin. The seeder authenticates
 *      as it and reads those two ids; a rename or a lane swap there breaks this fixture silently,
 *      and the backend twin `MULTI_ORG_TF_BR` must never be substituted (the two lanes own
 *      independent OrganizationMembership rows).
 *
 *  [6] Informational: what each env overlay carries today, and what the recorded triple implies —
 *      including the reading each of the three modelled implementations would produce, so a
 *      reviewer can see at a glance that they are distinct.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTOR_ALIAS, POOL_ALIAS, POOLS, ALIAS_FIELDS, RUNTIME_ALIAS_FIELDS,
  MODE_SETTING, planProblems, divergenceProblems, classifyReading,
} from './multiorg-balance-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readJson = (rel) => (existsSync(join(ROOT, rel)) ? JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) : null);

const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => console.log(`  ⚠ ${m}`);
const ok = (m) => console.log(`  ✓ ${m}`);

const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const VAR_TOKEN_RE = /^\{\{\s*[A-Z0-9_]+\s*\}\}$/;

console.log(`\n🏢 td:validate:multiorg-balance — ${POOL_ALIAS} (LOYORG-E2E-003 / suite 083e)\n`);

const aliases = readJson('test-data/aliases.json');
if (!aliases) { console.error('ABORT: test-data/aliases.json not found'); process.exit(2); }

/* ── [1] the declared plan ─────────────────────────────────────────────────────────────────── */
console.log('[1] The declared earn plan is discriminating');
const plan = planProblems();
if (plan.length) plan.forEach(fail);
else {
  ok(`${POOLS.map((p) => `${p.key} x${p.qty}`).join(' | ')} — no quantity is equal to, an exact multiple of, `
    + 'the sum of, or the difference of the others');
  for (const p of POOLS) console.log(`      ${p.key.padEnd(11)} decides: ${p.decides}`);
}

/* ── [3] the alias contract ────────────────────────────────────────────────────────────────── */
console.log(`\n[3] ${POOL_ALIAS} alias contract`);
const pool = aliases[POOL_ALIAS];
if (!pool) {
  fail(`${POOL_ALIAS} is not registered in test-data/aliases.json — every @td(${POOL_ALIAS}.*) in the corpus resolves to nothing.`);
} else {
  if (pool._inline !== true) fail(`${POOL_ALIAS} is not _inline — it has no backing CSV, so it must declare its values inline.`);
  const declared = Object.keys(pool.fields || {});
  const missingField = ALIAS_FIELDS.filter((f) => !declared.includes(f));
  const extraField = declared.filter((f) => !ALIAS_FIELDS.includes(f));
  if (missingField.length) fail(`${POOL_ALIAS}.fields is missing ${missingField.join(', ')} — a case referencing them gets a dead @td().`);
  if (extraField.length) fail(`${POOL_ALIAS}.fields declares ${extraField.join(', ')}, which the spec does not — nothing writes them, so they resolve to "".`);
  if (!missingField.length && !extraField.length) ok(`fields{} matches the spec exactly (${ALIAS_FIELDS.length} field(s))`);

  const notEmpty = RUNTIME_ALIAS_FIELDS[POOL_ALIAS].filter((f) => String(pool[f] ?? '').trim() !== '');
  if (notEmpty.length) {
    fail(`${POOL_ALIAS} carries a non-empty RUNTIME value in the COMMITTED base for ${notEmpty.join(', ')}. `
      + 'Runtime values belong in aliases.<env>.json only — a committed one resolves on an env that was never seeded, '
      + 'so a suite reads another environment\'s figures and reports a confident wrong result.');
  } else ok(`all ${RUNTIME_ALIAS_FIELDS[POOL_ALIAS].length} runtime field(s) are EMPTY in the committed base`);

  if (!String(pool._notes || '').trim()) fail(`${POOL_ALIAS} has no _notes — the fixture's stated limits are part of the fixture.`);
  else {
    const notes = String(pool._notes);
    const required = [
      ['the divergence rule', /divergen|multiple|SECOND RULE/i],
      ['the no-reset limit', /cannot be reset|READ-ONLY|read-only/i],
      ['the store-mode dependency', new RegExp(MODE_SETTING.replace(/\./g, '\\.'), 'i')],
    ];
    const absent = required.filter(([, re]) => !re.test(notes)).map(([label]) => label);
    if (absent.length) fail(`${POOL_ALIAS}._notes no longer states ${absent.join(' / ')} — a consumer would assume a contract this fixture cannot honour.`);
    else ok('_notes still states the divergence rule, the no-reset limit and the store-mode dependency');
  }
}

/* ── [4] committed-base hygiene ────────────────────────────────────────────────────────────── */
console.log('\n[4] No runtime GUID or password literal in the committed base');
let hygiene = 0;
for (const [k, v] of Object.entries(pool || {})) {
  if (k.startsWith('_') || k === 'fields' || typeof v !== 'string') continue;
  if (GUID_RE.test(v.trim())) { fail(`${POOL_ALIAS}.${k} is a runtime GUID in the committed base — it belongs in aliases.<env>.json.`); hygiene++; }
  if (/password/i.test(k) && v.trim() && !VAR_TOKEN_RE.test(v.trim())) { fail(`${POOL_ALIAS}.${k} is a password literal — use a {{VAR}} token.`); hygiene++; }
}
if (!hygiene) ok('clean');

/* ── [5] the actor contract ────────────────────────────────────────────────────────────────── */
console.log(`\n[5] ${ACTOR_ALIAS} still supplies what the seeder reads`);
const actor = aliases[ACTOR_ALIAS];
if (!actor) {
  fail(`${ACTOR_ALIAS} is not registered — the seeder authenticates as it and reads both organization ids from it.`);
} else {
  for (const f of ['email', 'password', 'store_id', 'org_techflow_id', 'org_buildright_id']) {
    if (!String(actor[f] ?? '').trim()) fail(`${ACTOR_ALIAS}.${f} is empty — the seeder cannot mint an organization-scoped token without it.`);
  }
  if (actor.password && !VAR_TOKEN_RE.test(String(actor.password).trim())) {
    fail(`${ACTOR_ALIAS}.password is a literal, not a {{VAR}} token.`);
  }
  for (const f of ['org_techflow_id', 'org_buildright_id']) {
    const v = String(actor[f] ?? '').trim();
    if (v && !GUID_RE.test(v)) fail(`${ACTOR_ALIAS}.${f} = "${v}" is not a platform GUID — the organization ids are pinned inline on purpose (DV-021 allowlist).`);
  }
  if (String(actor.org_techflow_id) === String(actor.org_buildright_id)) {
    fail(`${ACTOR_ALIAS} declares the SAME id for both organizations — the whole fixture is a switch between two of them.`);
  }
  // The lane reservation is the fixture's other silent-failure mode: the backend twin owns
  // independent OrganizationMembership rows, and a frontend fixture funded through it would have
  // the two lanes eating each other's state.
  const laneNotes = `${actor._comment || ''} ${actor._notes || ''}`;
  if (!/FRONTEND[- ]LANE|FRONTEND lane/i.test(laneNotes)) {
    fail(`${ACTOR_ALIAS} no longer declares itself the FRONTEND-lane twin. This fixture must not be moved onto `
      + 'MULTI_ORG_TF_BR: the two lanes own independent membership rows and would report confident wrong results.');
  } else ok('frontend-lane reservation intact; both organization ids present and distinct');
}

/* ── [2] + [6] the seeded state, per env ───────────────────────────────────────────────────── */
console.log('\n[2] The SEEDED triple is still discriminating (per env overlay)');
const overlays = readdirSync(join(ROOT, 'test-data'))
  .filter((f) => /^aliases\.[a-z0-9_]+\.json$/i.test(f))
  .sort();
let seenAny = false;
for (const file of overlays) {
  const env = file.replace(/^aliases\./, '').replace(/\.json$/, '');
  const rec = readJson(`test-data/${file}`)?.[POOL_ALIAS];
  const has = rec && RUNTIME_ALIAS_FIELDS[POOL_ALIAS].some((f) => String(rec[f] ?? '').trim() !== '');
  if (!has) { warn(`${env}: not seeded (no ${POOL_ALIAS} figures recorded) — LOYORG-E2E-003 must report inconclusive there.`); continue; }
  seenAny = true;
  const triple = {
    TECHFLOW: Number(rec.techflow_balance_at_seed),
    BUILDRIGHT: Number(rec.buildright_balance_at_seed),
    USER: Number(rec.user_balance_at_seed),
  };
  const bad = divergenceProblems(triple);
  if (bad.length) {
    fail(`${env}: the RECORDED triple cannot decide the question (T=${triple.TECHFLOW}, B=${triple.BUILDRIGHT}, U=${triple.USER}):`);
    bad.forEach((b) => console.log(`      • ${b}`));
    console.log('      Re-seed: npm run seed:multiorg-loyalty-balance  (balances only go UP — this earns again).');
  } else {
    ok(`${env}: T=${triple.TECHFLOW} B=${triple.BUILDRIGHT} U=${triple.USER} — discriminating`);
    console.log(`      correct        → ${classifyReading({ first: triple.TECHFLOW, second: triple.BUILDRIGHT, ...triple })}`);
    console.log(`      leak (TF)      → ${classifyReading({ first: triple.TECHFLOW, second: triple.TECHFLOW, ...triple })}`);
    console.log(`      wrong fallback → ${classifyReading({ first: triple.USER, second: triple.USER, ...triple })}`);
    console.log(`      seeded ${rec.seeded_at || '(no timestamp)'} | earn ${rec.earn_sku || '?'} @ ${rec.earn_points_per_unit || '?'} PTS/unit `
      + `| qty T${rec.techflow_earn_qty}/B${rec.buildright_earn_qty}/U${rec.user_earn_qty} | store mode found+restored "${rec.store_mode_at_seed}"`);
  }
}
if (!seenAny) warn('no environment carries seeded figures yet.');

console.log(`\n${problems.length ? `❌ ${problems.length} problem(s)` : '✅ OK'} — td:validate:multiorg-balance\n`);
process.exit(problems.length ? 1 : 0);
