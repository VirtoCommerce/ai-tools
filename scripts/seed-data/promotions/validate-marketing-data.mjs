#!/usr/bin/env node
/**
 * scripts/seed-data/promotions/validate-marketing-data.mjs
 *
 * STATIC drift guard for the marketing promotion + coupon fixtures
 * (test-data/promotions/promotions.csv + coupons.csv), matching the multi-env
 * authoring rule in .claude/rules/test-data.md. No network, no env — safe in CI.
 * Coupons resolve by static business key (coupon_id / code) — there is no runtime
 * GUID to persist — so the guard's job is fixture hygiene + the VCST-5233
 * case-fidelity collision invariant, NOT an aliases.<env>.json overlay check.
 *
 * The single source of truth is the two CSVs (the seeder reads them as input);
 * this guard reads the SAME CSVs plus aliases.json and asserts (exit 1 on any):
 *   1. Every coupon code is alphanumeric-only (^[a-zA-Z0-9]+$) — the platform
 *      enforces this on /coupons/add (see changelog_1_5_16).
 *   2. No runtime GUID leaked into either committed CSV (no consumer resolves one;
 *      keeps the fixtures env-invariant).
 *   3. Referential integrity — every coupon's promo_id exists in promotions.csv.
 *   4. Every CSV-backed COUPON_* alias (file "promotions/coupons") selects an
 *      existing coupons.csv row and pins no GUID in the committed base.
 *   5. VCST-5233 case-fidelity invariant for COUPON_LC_CASEFIDELITY: its code
 *      contains a lowercase letter AND its all-uppercase form is not ANY OTHER
 *      coupon code in the fixture set (so uppercasing can never silently match a
 *      different coupon — the 'super'->'SUPER' confound CPN-062 avoids).
 *   6. salesRepCoupons (VCST-6158) sr_* rows: each satisfies its SR_CONTRACTS non-vacuity contract
 *      (distinct promotion/coupon ends on the right side, cap/uses arithmetic, past expiry, future
 *      start, member binding, long code, one coupon per promotion, rolling dates only), has a
 *      CSV-backed alias that declares coupon_guid/promotion_guid + a seed script, and its member_ref
 *      resolves. Overlay ids for the env are informational (UNSEEDED is a warning, not a failure).
 *
 * The pure predicate helpers are exported (no side effects on import) so the unit
 * tests in scripts/unit/validate-marketing-data.test.mjs can exercise them without
 * touching the filesystem or the network.
 *
 * Usage:  npm run td:validate:marketing
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { srContractProblems, isSrRow, resolveMemberRef } from './promotions-specs.mjs';

export const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
export const COUPON_CODE_RE = /^[a-zA-Z0-9]+$/;

/** A stored coupon code counts as "lowercase" for the case-fidelity test when it has ≥1 lowercase letter. */
export const hasLowercaseLetter = (code) => /[a-z]/.test(String(code || ''));

/**
 * Given a code and the full set of coupon codes, return the OTHER code whose value
 * equals this code's all-uppercase form (a collision), or null when collision-free.
 * Comparison is exact/case-sensitive — that mirrors how ValidateCoupon matches at
 * validation time, so an uppercased code can only ever hit a literally-uppercase twin.
 */
export function upperTwinCollision(code, allCodes) {
  const upper = String(code || '').toUpperCase();
  if (upper === code) return null; // already all-uppercase — not a lowercase-stored case
  return allCodes.find((c) => c !== code && c === upper) || null;
}

/** Coupon codes that violate the alphanumeric-only platform constraint. */
export function findBadCouponCodes(couponRows) {
  return couponRows
    .filter((r) => (r.code || '').trim() && !COUPON_CODE_RE.test(r.code.trim()))
    .map((r) => ({ coupon_id: r.coupon_id, code: r.code }));
}

/** Cells across the given rows that contain a runtime platform GUID (should be none). */
export function findGuidLeaks(rows, keyCol) {
  const leaks = [];
  for (const r of rows) {
    for (const [col, val] of Object.entries(r)) {
      if (typeof val === 'string' && GUID_RE.test(val)) leaks.push({ key: r[keyCol], col, value: val });
    }
  }
  return leaks;
}

// ─── CLI runner (only when invoked directly; importing this module is side-effect-free) ───
function run() {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const problems = [], notes = [];
  const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
  const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
  const ok = (m) => console.log(`  ✓ ${m}`);

  const readCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), {
    columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true,
  });
  const coupons = readCsv('test-data/promotions/coupons.csv');
  const promotions = readCsv('test-data/promotions/promotions.csv');
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const allCodes = coupons.map((c) => (c.code || '').trim()).filter(Boolean);

  // 1. Alphanumeric-only coupon codes.
  console.log('\n[1] Coupon codes are alphanumeric-only (^[a-zA-Z0-9]+$)');
  const bad = findBadCouponCodes(coupons);
  if (bad.length) bad.forEach((b) => fail(`coupon ${b.coupon_id} code "${b.code}" is not alphanumeric-only`));
  else ok(`all ${allCodes.length} coupon codes alphanumeric-only`);

  // 2. No runtime GUID leaked into either committed CSV.
  console.log('\n[2] No runtime GUID in the committed CSVs');
  const cLeaks = findGuidLeaks(coupons, 'coupon_id');
  const pLeaks = findGuidLeaks(promotions, 'promo_id');
  if (cLeaks.length) cLeaks.forEach((l) => fail(`coupons.csv ${l.key}.${l.col} pins a GUID (${l.value})`));
  if (pLeaks.length) pLeaks.forEach((l) => fail(`promotions.csv ${l.key}.${l.col} pins a GUID (${l.value})`));
  if (!cLeaks.length && !pLeaks.length) ok('no GUID leaked into coupons.csv / promotions.csv');

  // 3. Referential integrity — coupon promo_id exists.
  console.log('\n[3] Every coupon promo_id exists in promotions.csv');
  const promoIds = new Set(promotions.map((p) => p.promo_id));
  const orphans = coupons.filter((c) => (c.promo_id || '').trim() && !promoIds.has(c.promo_id.trim()));
  if (orphans.length) orphans.forEach((c) => fail(`coupon ${c.coupon_id} references unknown promo_id "${c.promo_id}"`));
  else ok('all coupons reference an existing promotion');

  // 4. CSV-backed COUPON_* aliases resolve to a real row, pin no GUID.
  console.log('\n[4] CSV-backed coupon aliases resolve, no pinned GUID');
  const byId = new Map(coupons.map((c) => [c.coupon_id, c]));
  const couponAliases = Object.entries(aliases).filter(([, def]) => def && def.file === 'promotions/coupons');
  for (const [name, def] of couponAliases) {
    const wantId = def.filter?.coupon_id;
    if (!wantId) { fail(`alias ${name} has no filter.coupon_id`); continue; }
    if (!byId.has(wantId)) { fail(`alias ${name} → coupon_id ${wantId} not in coupons.csv`); continue; }
    const pinnedGuid = Object.entries(def).find(([k, v]) => !k.startsWith('_') && k !== 'fields' && k !== 'filter' && k !== 'file' && typeof v === 'string' && GUID_RE.test(v));
    if (pinnedGuid) { fail(`alias ${name}.${pinnedGuid[0]} pins a GUID`); continue; }
    ok(`${name} → ${wantId} (code "${byId.get(wantId).code}")`);
  }

  // 5. VCST-5233 case-fidelity invariant for COUPON_LC_CASEFIDELITY.
  console.log('\n[5] COUPON_LC_CASEFIDELITY — lowercase + collision-free uppercase twin');
  const lcAlias = aliases.COUPON_LC_CASEFIDELITY;
  if (!lcAlias) fail('COUPON_LC_CASEFIDELITY alias missing');
  else {
    const row = byId.get(lcAlias.filter?.coupon_id);
    if (!row) fail(`COUPON_LC_CASEFIDELITY → ${lcAlias.filter?.coupon_id} not in coupons.csv`);
    else {
      const code = (row.code || '').trim();
      if (!hasLowercaseLetter(code)) fail(`COUPON_LC_CASEFIDELITY code "${code}" has no lowercase letter (fails /[a-z]/)`);
      else ok(`code "${code}" contains a lowercase letter`);
      const collision = upperTwinCollision(code, allCodes);
      if (collision) fail(`COUPON_LC_CASEFIDELITY code "${code}" uppercases to "${code.toUpperCase()}" which collides with fixture coupon "${collision}"`);
      else ok(`uppercase form "${code.toUpperCase()}" is not another fixture coupon (collision-free in-fixture)`);
    }
  }

  // 6. salesRepCoupons (VCST-6158) fixtures — each sr_* row sits on the right side of the
  //    distinction it exists to test (promotions-specs.mjs SR_CONTRACTS), has its alias, and its
  //    member_ref resolves. Seeded state (the env overlay) is informational.
  console.log('\n[6] salesRepCoupons sr_* fixtures — non-vacuity contract, aliases, member_ref');
  const srProblems = srContractProblems(promotions, coupons);
  srProblems.forEach((p) => fail(p));
  const srRows = coupons.filter(isSrRow);
  if (!srProblems.length) ok(`${srRows.length} sr_* coupon(s) satisfy their contracts (${srRows.map((c) => c.edge_case_type).join(', ')})`);
  for (const c of srRows) {
    const names = couponAliases.filter(([, def]) => def.filter?.coupon_id === c.coupon_id).map(([n]) => n);
    if (!names.length) { fail(`${c.coupon_id} (${c.edge_case_type}) has no promotions/coupons alias — a case cannot @td() it`); continue; }
    for (const n of names) {
      for (const f of ['coupon_guid', 'promotion_guid']) if (!aliases[n].fields?.[f]) fail(`alias ${n} does not declare ${f} — the seeder's runtime ids would not reach aliases.<env>.json`);
      if (!aliases[n].seed) fail(`alias ${n} has no "seed" script — td:validate cannot tell UNSEEDED from broken`);
    }
    if ((c.member_ref || '').trim()) {
      const id = resolveMemberRef(c.member_ref, { aliases, loadCsvFn: (rel) => readCsv(rel) });
      if (!id) fail(`${c.coupon_id} member_ref ${c.member_ref} resolves to no platform_id`);
      else ok(`${c.coupon_id} member_ref ${c.member_ref} resolves`);
    }
  }
  const env = process.env.TEST_ENV || 'vcst';
  const overlayPath = join(ROOT, `test-data/aliases.${env}.json`);
  if (existsSync(overlayPath)) {
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
    const srAliases = couponAliases.filter(([, def]) => def.fields?.coupon_guid).map(([n]) => n);
    const unseeded = srAliases.filter((n) => !overlay[n]?.coupon_guid);
    if (unseeded.length) warn(`aliases.${env}.json has no coupon_guid for ${unseeded.join(', ')} — run TEST_ENV=${env} npm run seed:promotions:sales-rep-coupons`);
    else ok(`aliases.${env}.json carries coupon_guid for all ${srAliases.length} SRCPN aliases`);
  }

  console.log('\n=== marketing (promotion/coupon) fixture validation ===');
  console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
  if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
  console.log('\nMarketing fixture test-data OK — alphanumeric codes, no GUID leak, aliases resolve, case-fidelity collision-free.');
  process.exit(0);
}

// Only run when executed directly (node/tsx), never on import (unit tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
