/**
 * validate-reviews-data.mjs — DRIFT / VACUITY GUARD for the customer-review moderation corpus
 * (REVIEW_PRODUCT, seeded by seed-reviews.mjs for suites 086 / 087 / 088).
 *
 * STATIC only (no network). `npm run td:validate:reviews`; exits 1 on any hard problem.
 *
 *   1. The declared corpus can still discriminate (reviews-specs.validateReviewSpecs): >= MIN_APPROVED
 *      Approved spanning ratings 1..5, a New and a Rejected next to them, unique user suffixes.
 *   2. The alias contract: REVIEW_PRODUCT registered with every field the cases read, and NO runtime
 *      GUID or count committed into the base aliases.json.
 *   3. The env overlay, when seeded: approved_count >= MIN_APPROVED, new_count >= 1, rejected_count >= 1,
 *      and the host is not a product another committed review fixture (REV_*) owns by slug.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALIAS_FIELDS, MIN_APPROVED, validateReviewSpecs, reservedReviewSlugs } from './reviews-specs.mjs';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ALIAS = 'REVIEW_PRODUCT';
const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);

console.log('\n[1] reviews-specs.mjs: the corpus can still make the approved-only cases FAIL');
const spec = validateReviewSpecs();
for (const p of spec) fail(p);
if (!spec.length) ok('>= 6 Approved across ratings 1..5, plus 1 New and 1 Rejected, unique users');

console.log(`\n[2] aliases.json: ${ALIAS} registered, field-complete, nothing runtime committed`);
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const def = aliases[ALIAS];
if (!def) fail(`${ALIAS} is not registered — every @td(${ALIAS}.*) passes through unresolved`);
else {
  const missing = ALIAS_FIELDS.filter((f) => !(def.fields && f in def.fields));
  if (missing.length) fail(`${ALIAS}.fields is missing: ${missing.join(', ')}`);
  const committed = ALIAS_FIELDS.filter((f) => String(def[f] ?? '').trim());
  if (committed.length) fail(`${ALIAS} commits runtime value(s) for ${committed.join(', ')} in the BASE aliases.json — they belong in aliases.<env>.json only`);
  if (!missing.length && !committed.length) ok(`${ALIAS}: ${ALIAS_FIELDS.length} fields declared, all empty in the base`);
}

const env = resolveTestEnv('vcst');
console.log(`\n[3] aliases.${env}.json: the seeded corpus still discriminates`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
const ov = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8'))[ALIAS] : null;
if (!ov?.id) warn(`${ALIAS} has no overlay on ${env} — run \`TEST_ENV=${env} npm run seed:reviews\` (informational)`);
else {
  const n = (k) => Number(ov[k]);
  if (!(n('approved_count') >= MIN_APPROVED)) fail(`${ALIAS}.approved_count=${ov.approved_count} < ${MIN_APPROVED}`);
  if (!(n('new_count') >= 1)) fail(`${ALIAS}.new_count=${ov.new_count ?? 'absent'} — no New review to hide; re-seed`);
  if (!(n('rejected_count') >= 1)) fail(`${ALIAS}.rejected_count=${ov.rejected_count ?? 'absent'} — no Rejected review to hide; re-seed`);
  if (ov.slug && reservedReviewSlugs(aliases).has(ov.slug)) fail(`${ALIAS} is hosted on ${ov.slug}, which another REV_* fixture owns — its reviews inflate the served total past approved_count`);
  if (!problems.length) ok(`${ALIAS}: ${ov.approved_count} Approved + ${ov.new_count} New + ${ov.rejected_count} Rejected on a host no other fixture owns`);
}

console.log(`\n=== reviews drift/vacuity check: ${problems.length} hard problem(s) ===`);
process.exit(problems.length ? 1 : 0);
