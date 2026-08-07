/**
 * validate-review-variants-data.mjs — STATIC drift guard for the VCST-5487 customer-review
 * render-variant fixtures. No network, no auth: it only reconciles the committed files
 * against the side-effect-free spec module.
 *
 *   npm run td:validate:review-variants
 *
 * Guards, in the order they fail:
 *  [1] every HOSTS key is registered as an alias in the committed test-data/aliases.json;
 *  [2] the committed alias carries an EMPTY `id`/`name` — runtime platform GUIDs belong in
 *      aliases.<env>.json, never in the base registry (the multi-env rule that lets one
 *      checkout run against vcst / vcptcore / virtostart);
 *  [3] the alias `slug` matches the spec's slug exactly (the slug is the only stable handle
 *      the seeder resolves by — a drift here silently seeds onto the wrong product);
 *  [4] the alias `approved_count` matches the number of VARIANTS declared for that host, and
 *      `max_image_count` matches the largest `images` value for it — so a spec edit that
 *      changes the matrix cannot leave the registry advertising a stale shape;
 *  [5] the declared aggregates are still the ones the cases assert: the MATRIX host must
 *      average to a value whose one-decimal rendering is "3.4" AND stay strictly fractional
 *      (an integer average would silently kill the partial-fill assertion), and its review
 *      count must exceed PAGE_SIZE so the pagination case keeps its second page;
 *  [6] the matrix still covers every render variant the redesign distinguishes — at minimum
 *      image counts 0/1/2/3/4, at least one empty body, at least one body over 2000 chars,
 *      and both rating extremes 1 and 5;
 *  [7] no seeded review body or userName leaks a real person's identity — every row must use
 *      the AGENT-TEST convention so `--teardown` sweeps it and nothing collides with real data.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_PREFIX, HOSTS, VARIANTS, expectedAggregates } from './review-variants-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PAGE_SIZE = 5; // vc-frontend client-app/modules/customer-reviews/constants.ts

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const agg = expectedAggregates();

for (const [key, def] of Object.entries(HOSTS)) {
  const a = aliases[key];

  // [1]
  if (!a) { fail(`[1] alias ${key} is not registered in test-data/aliases.json`); continue; }

  // [2] — no runtime GUID in the committed base registry
  for (const field of ['id', 'name']) {
    if (a[field]) fail(`[2] alias ${key}.${field} must be EMPTY in the base registry (runtime value belongs in aliases.<env>.json); found ${JSON.stringify(a[field])}`);
  }

  // [3]
  if (a.slug !== def.slug) fail(`[3] alias ${key}.slug drifted from the spec\n      spec:  ${def.slug}\n      alias: ${a.slug}`);

  // [4]
  const rows = VARIANTS.filter((v) => v.host === key);
  if (String(a.approved_count) !== String(rows.length)) {
    fail(`[4] alias ${key}.approved_count = ${a.approved_count} but the spec declares ${rows.length} variant(s)`);
  }
  const maxImgs = Math.max(0, ...rows.map((v) => v.images));
  if (a.max_image_count !== undefined && String(a.max_image_count) !== String(maxImgs)) {
    fail(`[4] alias ${key}.max_image_count = ${a.max_image_count} but the spec's largest image count for this host is ${maxImgs}`);
  }
}

// [5] — the aggregates the test cases assert
const matrix = agg.REV_VAR_MATRIX;
if (!matrix) {
  fail('[5] REV_VAR_MATRIX disappeared from the spec — the whole render matrix depends on it');
} else {
  if (matrix.displayed !== '3.4') {
    fail(`[5] MATRIX host average now renders as "${matrix.displayed}", not "3.4" — the PDP one-decimal-rounding case asserts 3.4; update the case or restore the rating sum (${matrix.sum}/${matrix.count})`);
  }
  if (Number.isInteger(matrix.average)) {
    fail(`[5] MATRIX host average is now the integer ${matrix.average} — a whole number cannot prove CONTINUOUS partial star fill, which is the core of this PR`);
  }
  if (matrix.count <= PAGE_SIZE) {
    fail(`[5] MATRIX host now has ${matrix.count} review(s) but PAGE_SIZE is ${PAGE_SIZE} — the list would no longer paginate and the 2-page case would silently pass on one page`);
  }
}
if (agg.REV_VAR_ONE_STAR && agg.REV_VAR_ONE_STAR.displayed !== '1.0') {
  fail(`[5] ONE_STAR host now renders "${agg.REV_VAR_ONE_STAR.displayed}" instead of "1.0"`);
}
if (agg.REV_VAR_FIVE_STAR && agg.REV_VAR_FIVE_STAR.displayed !== '5.0') {
  fail(`[5] FIVE_STAR host now renders "${agg.REV_VAR_FIVE_STAR.displayed}" instead of "5.0"`);
}

// [6] — render-variant coverage
const imageCounts = new Set(VARIANTS.map((v) => v.images));
for (const n of [0, 1, 2, 3, 4]) {
  if (!imageCounts.has(n)) fail(`[6] no variant with exactly ${n} image(s) — that render branch would be untested`);
}
if (!VARIANTS.some((v) => v.text.length === 0)) fail('[6] no variant with an EMPTY body — the "rating only" render branch would be untested');
if (!VARIANTS.some((v) => v.text.length > 2000)) fail('[6] no long-form variant (>2000 chars) — the wrapping / card-growth branch would be untested');
for (const r of [1, 5]) {
  if (!VARIANTS.some((v) => v.rating === r)) fail(`[6] no variant at rating ${r} — the star-fill extreme would be untested`);
}
const singleImageHost = Object.keys(HOSTS).find((k) => {
  const rows = VARIANTS.filter((v) => v.host === k);
  return rows.length === 1 && rows[0].images === 1;
});
if (!singleImageHost) {
  fail('[6] no host carries exactly ONE review with exactly ONE image — the modal\'s images.length===1 branch ("1 / 1", no nav, no dots) would be untested');
}

// [7] — teardown / identity hygiene
for (const v of VARIANTS) {
  if (!v.userName.startsWith('AGENT-TEST')) {
    fail(`[7] variant ${v.u} userName "${v.userName}" does not use the AGENT-TEST prefix — teardown and real-data isolation depend on it`);
  }
  if (v.text && !v.text.includes('AGENT-TEST')) {
    warn(`[7] variant ${v.u} body does not mention AGENT-TEST — harmless, but it makes a stray fixture harder to spot in the admin`);
  }
  if (!/^[a-z0-9]+$/i.test(v.u)) fail(`[7] variant key "${v.u}" must be alphanumeric (it becomes the userId suffix "${USER_PREFIX}${v.u}")`);
}
const dupes = VARIANTS.map((v) => v.u).filter((u, i, a) => a.indexOf(u) !== i);
if (dupes.length) fail(`[7] duplicate variant key(s): ${[...new Set(dupes)].join(', ')} — the seeder is idempotent BY key, so a duplicate silently seeds only one of them`);

for (const w of warnings) console.log(`  ⚠ ${w}`);
if (errors.length) {
  console.error(`\n❌ review-variants fixture drift (${errors.length}):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`  ✓ review-variants fixtures OK — ${Object.keys(HOSTS).length} host(s), ${VARIANTS.length} variant(s), image counts {${[...imageCounts].sort().join(',')}}, MATRIX ${matrix.sum}/${matrix.count} → "${matrix.displayed}"`);
