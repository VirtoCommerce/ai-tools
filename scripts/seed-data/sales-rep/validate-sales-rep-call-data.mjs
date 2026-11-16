#!/usr/bin/env node
/**
 * validate-sales-rep-call-data.mjs — drift guard for the VCST-6256 "Call a customer" fixtures
 * (sales-rep-call-specs.mjs, seeded by seed-sales-rep-call.mjs). No network, no writes.
 * Run: npm run td:validate:sr-call   (TEST_ENV=<env> also checks that env's overlay)
 *
 *  [1] NON-VACUITY: callShortfalls() is empty — every variant still discriminates what it exists for
 *      (V1 >= 3 numbers in different spellings; V2 same digits in DIFFERENT text + a distinct masked org
 *      phone; V3 org-labelled single number; V4 ownerless with rep/buyer phones that DIFFER; V5 contact
 *      with 0 numbers; V6 extension; V7 2nd number org-labelled; V8 org+address collapse; > PAGE_SIZE orgs
 *      with a numbered org on page 2; the rep's own phone never an expected number),
 *  [2] every alias is registered `_inline` in the committed base with the spec's name and the DERIVED
 *      expected_* fields (a case asserting @td(ORG_SR_CALL_DUP.expected_phone_count) can never assert a
 *      count the seeder does not produce),
 *  [3] runtime fields (id / platform_id / primary_contact_id / contact_* / rep id+user_id) are EMPTY in
 *      the committed base, and no GUID sits anywhere in the spec module,
 *  [4] the rep alias keeps password_env (no literal) and the spec's email/store,
 *  [5] with TEST_ENV: the overlay carries a GUID for every org and the rep, and primary_contact_id is
 *      set exactly when the spec expects a primary contact.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALL_REP, CALL_ORGS, callShortfalls, orgAliasExpectations, expectedPrimaryContact } from './sales-rep-call-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const problems = []; const notes = [];
const fail = (m) => problems.push(m);

// [1]
for (const s of callShortfalls()) fail(`[1] ${s}`);

// [2] + [3]
const base = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
for (const o of CALL_ORGS) {
  const e = base[o.aliasName];
  if (!e) { fail(`[2] ${o.aliasName} missing from test-data/aliases.json`); continue; }
  if (e._inline !== true || !e._notes) fail(`[2] ${o.aliasName} must be _inline with _notes`);
  if (e.seed !== 'seed:sales-rep-call') fail(`[2] ${o.aliasName}.seed must be seed:sales-rep-call`);
  for (const [k, v] of Object.entries(orgAliasExpectations(o))) {
    if (e[k] !== v) fail(`[2] ${o.aliasName}.${k} = ${JSON.stringify(e[k])}, spec derives ${JSON.stringify(v)}`);
  }
  const runtime = ['id', 'platform_id', 'primary_contact_id', 'default_href', ...o.contacts.map((c) => `contact_${c.key}`)];
  for (const k of runtime) {
    if (!(k in e)) fail(`[3] ${o.aliasName}.${k} not declared in the base`);
    else if (e[k] !== '') fail(`[3] ${o.aliasName}.${k} must be "" in the committed base — runtime ids live in aliases.<env>.json`);
  }
}
const rep = base[CALL_REP.aliasName];
if (!rep) fail(`[2] ${CALL_REP.aliasName} missing from test-data/aliases.json`);
else {
  for (const k of ['id', 'user_id']) if (rep[k] !== '') fail(`[3] ${CALL_REP.aliasName}.${k} must be "" in the committed base`);
  // [4]
  if (rep.password_env !== 'SR_REP_PASSWORD' || 'password' in rep) fail(`[4] ${CALL_REP.aliasName} must carry password_env SR_REP_PASSWORD and no password literal`);
  if (rep.email !== CALL_REP.email || rep.store !== CALL_REP.store || rep.fullName !== CALL_REP.fullName) fail(`[4] ${CALL_REP.aliasName} email/store/fullName drift from the spec`);
}
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/sales-rep/sales-rep-call-specs.mjs'), 'utf8');
if (GUID_RE.test(specSrc)) fail('[3] a GUID literal sits in sales-rep-call-specs.mjs');

// [5]
const env = process.env.TEST_ENV;
const overlayPath = env ? join(ROOT, `test-data/aliases.${env}.json`) : null;
if (overlayPath && existsSync(overlayPath)) {
  const ov = JSON.parse(readFileSync(overlayPath, 'utf8'));
  const seeded = CALL_ORGS.filter((o) => ov[o.aliasName]?.id);
  if (seeded.length === 0) notes.push(`${env}: not seeded (npm run seed:sales-rep-call)`);
  else {
    for (const o of CALL_ORGS) {
      const v = ov[o.aliasName] || {};
      if (!GUID_RE.test(v.id || '') || v.platform_id !== v.id) fail(`[5] ${env}: ${o.aliasName}.id/platform_id not a GUID pair (partial seed?)`);
      const wantPc = !!expectedPrimaryContact(o);
      if (wantPc !== GUID_RE.test(v.primary_contact_id || '')) fail(`[5] ${env}: ${o.aliasName}.primary_contact_id ${wantPc ? 'missing' : 'must be empty'}`);
    }
    if (!GUID_RE.test(ov[CALL_REP.aliasName]?.id || '') || !GUID_RE.test(ov[CALL_REP.aliasName]?.user_id || '')) fail(`[5] ${env}: ${CALL_REP.aliasName}.id/user_id missing`);
    notes.push(`${env}: ${seeded.length}/${CALL_ORGS.length} orgs seeded`);
  }
}

console.log('sales-rep call-a-customer fixtures — drift guard');
for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`  OK (${CALL_ORGS.length} orgs + ${CALL_REP.aliasName})`);
