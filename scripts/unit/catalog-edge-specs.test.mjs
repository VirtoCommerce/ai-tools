/**
 * Unit tests for scripts/seed-data/catalog/catalog-edge-specs.mjs — the three catalog
 * "discrimination" fixtures (CAT-038 org-excluded product, CAT-040 SEO product, CAT-043 empty
 * category).
 *
 * Pure logic only: no network, no env, no fs.
 *
 * Every one of these fixtures is defined by a NEGATIVE property — zero products, not linked into the
 * store catalog, SEO fields not null. A negative property survives any "does it exist?" check, so the
 * tests below are written against the ways each fixture can still EXIST while proving nothing. That
 * is the failure mode REG-2026-08-25-1128 actually hit; plain presence tests would not have caught it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_PREFIX, RUNTIME_FIELDS, EXCLUDED_CATALOG, EMPTY_CATEGORY, EXCLUDED_PRODUCT, SEO_PRODUCT,
  ALL_FIXTURES, buildSeoInfo, buildCategoryBody, buildProductBody,
  validateSeoShape, validateFixtureShape,
} from '../seed-data/catalog/catalog-edge-specs.mjs';

test('the committed spec is clean as authored', () => {
  assert.deepEqual(validateFixtureShape(), []);
  assert.deepEqual(validateSeoShape(), []);
});

test('every fixture carries the AGENT-TEST prefix so teardown sweeps exactly it', () => {
  for (const f of ALL_FIXTURES) assert.ok(f.name.startsWith(SEED_PREFIX), `${f.aliasName}: ${f.name}`);
  assert.ok(EXCLUDED_CATALOG.name.startsWith(SEED_PREFIX));
});

test('no runtime id is baked into the committed spec', () => {
  // Server-assigned ids belong in aliases.<env>.json; one committed here resolves to a nonexistent
  // entity on every other env.
  for (const f of ALL_FIXTURES) {
    for (const field of RUNTIME_FIELDS) assert.ok(!f[field], `${f.aliasName}.${field} must not be pre-set`);
  }
});

/* ── CAT-043: the empty category ─────────────────────────────────────────────── */

test('VACUITY: a category that is allowed to hold products cannot exercise the empty state', () => {
  const problems = validateFixtureShape.call(null);
  assert.deepEqual(problems, []);          // baseline
  // Simulate the drift by asserting the rule the guard applies, since keepEmpty is the only knob.
  assert.equal(EMPTY_CATEGORY.keepEmpty, true,
    'keepEmpty is the fixture\'s ONLY property — a populated category renders a normal listing and CAT-043 passes without ever reaching the empty-state branch');
});

test('the empty category URL is store-relative (an SPA soft-404 answers HTTP 200)', () => {
  assert.ok(EMPTY_CATEGORY.url.startsWith('/'));
  assert.ok(!/^[a-z]+:\/\//i.test(EMPTY_CATEGORY.url));
  assert.ok(!EMPTY_CATEGORY.url.includes('{{'));
  assert.equal(EMPTY_CATEGORY.url, `/${EMPTY_CATEGORY.slug}`);
});

/* ── CAT-038: the org-excluded product ───────────────────────────────────────── */

test('VACUITY: the excluded product must stay UNLINKED from the store catalog', () => {
  // Linking it in is the single edit that silently destroys the case: the product becomes visible to
  // the org user, and CAT-038's discriminating half then asserts something false.
  assert.equal(EXCLUDED_PRODUCT.linkedIntoStoreCatalog, false);
});

test('the excluded product is a REAL product — priced and stocked, not a stub', () => {
  // A zero-price or zero-stock product could be invisible for the WRONG reason, so the case would
  // pass while proving nothing about virtual-catalog scoping.
  assert.ok(EXCLUDED_PRODUCT.listPrice > 0);
  assert.ok(EXCLUDED_PRODUCT.stockQty > 0);
});

test('the two products are distinct — one cannot hold both contradictory properties', () => {
  assert.notEqual(EXCLUDED_PRODUCT.sku, SEO_PRODUCT.sku);
  assert.notEqual(EXCLUDED_PRODUCT.slug, SEO_PRODUCT.slug);
});

/* ── CAT-040: the SEO product ────────────────────────────────────────────────── */

test('validateSeoShape rejects an empty title or description', () => {
  assert.match(validateSeoShape({ ...SEO_PRODUCT, pageTitle: '' })[0], /pageTitle is empty/);
  assert.match(validateSeoShape({ ...SEO_PRODUCT, metaDescription: '   ' })[0], /metaDescription is empty/);
});

test('VACUITY: title and description identical is non-empty yet proves nothing', () => {
  const same = 'AGENT-TEST identical value repeated so that it comfortably clears the length floor.';
  const problems = validateSeoShape({ ...SEO_PRODUCT, pageTitle: same, metaDescription: same });
  assert.ok(problems.some((p) => /identical/.test(p)), problems.join('\n'));
});

test('VACUITY: a short placeholder description is rejected', () => {
  const problems = validateSeoShape({ ...SEO_PRODUCT, metaDescription: 'test' });
  assert.ok(problems.some((p) => /meaningful content/.test(p)), problems.join('\n'));
});

test('the SEO product PDP url is CATEGORY-QUALIFIED, not the bare semanticUrl leaf', () => {
  // The platform stores only the leaf; the storefront routes under the category path. Writing the
  // leaf renders a client-side 404 behind HTTP 200, so a status check cannot catch it downstream.
  assert.ok(SEO_PRODUCT.url.startsWith('/'));
  assert.ok(SEO_PRODUCT.url.endsWith(`/${SEO_PRODUCT.slug}`));
  assert.notEqual(SEO_PRODUCT.url, `/${SEO_PRODUCT.slug}`, 'the url must carry the category segment, not just the slug');
});

/* ── body builders ───────────────────────────────────────────────────────────── */

test('buildSeoInfo carries every field the case reads', () => {
  const seo = buildSeoInfo(SEO_PRODUCT, { storeId: 'B2B-store' });
  assert.equal(seo.semanticUrl, SEO_PRODUCT.slug);
  assert.equal(seo.pageTitle, SEO_PRODUCT.pageTitle);
  assert.equal(seo.metaDescription, SEO_PRODUCT.metaDescription);
  assert.equal(seo.storeId, 'B2B-store');
  assert.equal(seo.languageCode, 'en-US');
  assert.equal(seo.isActive, true);
});

test('buildSeoInfo falls back to the name for a spec with no explicit title', () => {
  const seo = buildSeoInfo(EMPTY_CATEGORY, { storeId: 'B2B-store' });
  assert.equal(seo.pageTitle, EMPTY_CATEGORY.name);
  assert.equal(seo.metaDescription, '');
});

test('buildCategoryBody pins the catalog and leaves the category empty of products', () => {
  const body = buildCategoryBody(EMPTY_CATEGORY, { catalogId: 'cat-1' });
  assert.equal(body.catalogId, 'cat-1');
  assert.equal(body.parentId, null);
  assert.equal(body.code, EMPTY_CATEGORY.code);
  assert.equal(body.isActive, true);
});

test('buildProductBody is buyable and inventory-tracked, so the card renders normally', () => {
  const body = buildProductBody(EXCLUDED_PRODUCT, { catalogId: 'phys-1' });
  assert.equal(body.catalogId, 'phys-1');
  assert.equal(body.code, EXCLUDED_PRODUCT.sku);
  assert.equal(body.isActive, true);
  assert.equal(body.isBuyable, true);
  assert.equal(body.trackInventory, true);
  assert.deepEqual(body.seoInfos, []);
});
