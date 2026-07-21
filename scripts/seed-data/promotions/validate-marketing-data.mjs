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
 *
 * The pure predicate helpers are exported (no side effects on import) so the unit
 * tests in scripts/unit/validate-marketing-data.test.mjs can exercise them without
 * touching the filesystem or the network.
 *
 * Usage:  npm run td:validate:marketing
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

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

  console.log('\n=== marketing (promotion/coupon) fixture validation ===');
  console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
  if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
  console.log('\nMarketing fixture test-data OK — alphanumeric codes, no GUID leak, aliases resolve, case-fidelity collision-free.');
  process.exit(0);
}

// Only run when executed directly (node/tsx), never on import (unit tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
