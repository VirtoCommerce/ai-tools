/**
 * Unit tests for scripts/seed-data/catalog/barcode-specs.mjs (VCST-2945) — the DERIVATIONS only.
 *
 * Pure logic: no network, no env, no fs. The fixture's declared values and its non-vacuity contract
 * (unique vs shared GTIN, full-text decoy, OOS variation, …) are owned by `td:validate:barcode`
 * (FOURTH RULE) and are deliberately NOT restated here. What is tested is what a wrong implementation
 * would compute silently: scan-value collision
 * detection (fed synthetic collisions — the committed spec has none, so the guard alone could never
 * see this logic fail), the filter
 * quoting the live proof depends on, the store body copied from the shared store, and the reconcile
 * step that restores a per-seed fixture a test mutated.
 *
 * The GS1 check digit is NOT tested here: every GTIN it produces is stamped into a committed barcode
 * image, so td:validate:barcode already fails on a wrong digit (td:mutation-check: BOTH → dropped).
 * flipCase is NOT tested here either: BARCODE_CASE.valueFlipped is committed in aliases.json and the
 * guard fails when it stops equalling flipCase(value), and validateFixtureShape independently requires
 * every letter inverted. deletionWindows IS: its output only ever reaches a live index request, where a
 * too-narrow window silently purges nothing and a too-wide one re-indexes half the catalog.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  casePrefix, quoteFilterValue, findScanCollisions,
  buildStoreBody, storeDrift, buildProductBody, reconcileProduct, deletionWindows, STORE,
} from '../seed-data/catalog/barcode-specs.mjs';

test('casePrefix drops the last hyphen segment, and still yields a strict prefix without one', () => {
  assert.equal(casePrefix('QaBc-2945-MiXeD'), 'QaBc-2945');
  assert.equal(casePrefix('AbCdEf'), 'AbCdE');
  assert.equal(casePrefix('A-b'), 'A');
});

test('quoteFilterValue escapes quotes and backslashes inside a quoted term', () => {
  assert.equal(quoteFilterValue('QA-1'), '"QA-1"');
  assert.equal(quoteFilterValue('QR:1"SN"2'), '"QR:1\\"SN\\"2"');
  assert.equal(quoteFilterValue('a\\b'), '"a\\\\b"');
});

const source = {
  catalog: 'cat-1', defaultLanguage: 'en-US', defaultCurrency: 'USD', email: 'noreply@x.test',
  url: 'https://live-storefront.test', mainFulfillmentCenterId: 'ffc-main', additionalFulfillmentCenterIds: ['ffc-2'],
  languages: ['de-DE', 'en-US'], currencies: ['EUR', 'USD'],
};

test('buildStoreBody copies the resolution roots but never the live storefront URL', () => {
  const b = buildStoreBody(source);
  assert.equal(b.catalog, 'cat-1');
  assert.equal(b.defaultLanguage, 'en-US');
  assert.deepEqual(b.languages, ['en-US']);
  assert.equal(b.defaultCurrency, 'USD');
  assert.deepEqual(b.currencies, ['USD']);
  assert.equal(b.mainFulfillmentCenterId, 'ffc-main');
  assert.deepEqual(b.additionalFulfillmentCenterIds, ['ffc-2']);
  assert.notEqual(b.url, source.url, 'a second store on the live host could capture domain-based store resolution');
  assert.ok(b.email);
  b.additionalFulfillmentCenterIds.push('mutated');
  assert.deepEqual(source.additionalFulfillmentCenterIds, ['ffc-2'], 'must not alias the source store array');
});

test('buildStoreBody refuses a source with null defaults instead of seeding a broken store', () => {
  assert.throws(() => buildStoreBody({ ...source, defaultCurrency: null }), /default/);
  assert.throws(() => buildStoreBody({ ...source, catalog: null }), /catalog/);
});

test('storeDrift is empty for a matching store and names each drifted resolution root', () => {
  const ok = { ...buildStoreBody(source), name: STORE.name };
  assert.deepEqual(storeDrift(ok, source), []);
  const broken = { ...ok, defaultCurrency: null, url: null, currencies: [] };
  assert.deepEqual(storeDrift(broken, source).sort(), ['currencies', 'defaultCurrency', 'url'].sort());
});

test('buildProductBody sets mainProductId only for a variation and maps gtin/mpn', () => {
  const p = { sku: 'S1', name: 'AGENT-TEST-X Y', gtin: '4006381333931' };
  const base = buildProductBody(p, { catalogId: 'c', categoryId: 'k', storeId: 'st' });
  assert.equal(base.mainProductId, undefined);
  assert.equal(base.code, 'S1');
  assert.equal(base.gtin, '4006381333931');
  assert.equal(base.manufacturerPartNumber, null);
  assert.equal(base.seoInfos[0].semanticUrl, 'agent-test-x-y');
  assert.equal(base.seoInfos[0].isActive, true, 'an inactive SEO record gives the product no storefront slug');
  assert.equal(base.isActive && base.isBuyable && base.trackInventory, true);
  const v = buildProductBody({ sku: 'S2', name: 'AGENT-TEST-V', mpn: 'M-1' }, { catalogId: 'c', categoryId: 'k', mainProductId: 'parent', storeId: 'st' });
  assert.equal(v.mainProductId, 'parent');
  assert.equal(v.gtin, null);
  assert.equal(v.manufacturerPartNumber, 'M-1');
});

test('reconcileProduct restores a gtin a test changed and reports nothing when already correct', () => {
  const spec = { sku: 'S1', gtin: '4006381333931' };
  const mutated = { gtin: '5901234123457', manufacturerPartNumber: null, properties: [] };
  assert.deepEqual(reconcileProduct(mutated, spec), ['gtin']);
  assert.equal(mutated.gtin, '4006381333931');
  assert.deepEqual(reconcileProduct(mutated, spec), []);
});

test('reconcileProduct writes exactly one value for a property and replaces a stale one', () => {
  const def = { id: 'p1', name: 'AGENT_TEST_BARCODE_UPC', type: 'Product', valueType: 'ShortText' };
  const spec = { sku: 'S', props: { upc: 'V1' } };
  const full = { gtin: null, manufacturerPartNumber: null, properties: [] };
  assert.deepEqual(reconcileProduct(full, spec, { upc: def }), ['property:AGENT_TEST_BARCODE_UPC']);
  assert.deepEqual(full.properties[0].values.map((v) => [v.propertyId, v.value]), [['p1', 'V1']]);
  full.properties[0].values.push({ value: 'extra' });
  assert.deepEqual(reconcileProduct(full, spec, { upc: def }), ['property:AGENT_TEST_BARCODE_UPC']);
  assert.equal(full.properties[0].values.length, 1);
  assert.deepEqual(reconcileProduct(full, spec, { upc: def }), []);
  assert.throws(() => reconcileProduct({}, spec, {}), /no resolved id/);
});

test('deletionWindows contains every deletion, clusters near ones, and splits distant ones', () => {
  const at = ['2026-09-28T13:16:08.4926102Z', '2026-09-28T13:16:06.2752613Z', '2026-09-28T13:16:08.4925122Z', '2026-09-28T15:00:00Z'];
  const w = deletionWindows(at);
  assert.equal(w.length, 2, 'two deletions ~1h45 apart must not share one window (it would re-index everything in between)');
  const ms = (x) => Date.parse(x);
  for (const t of at) assert.ok(w.some((x) => ms(x.startDate) < ms(t) && ms(t) < ms(x.endDate)), `${t} must fall strictly inside a window`);
  assert.equal(ms(w[0].endDate) - ms(w[0].startDate), ms(at[0]) - ms(at[1]) + 4000, 'padded by 2s on each side, no wider');
  assert.deepEqual(deletionWindows(['2026-09-28T10:00:00Z', '2026-09-28T10:00:50Z', '2026-09-28T10:01:40Z']).length, 1, 'a chain of <=60s gaps is one window');
  assert.deepEqual(deletionWindows([]), []);
  assert.throws(() => deletionWindows(['not-a-date']), /not a timestamp/);
});

test('findScanCollisions flags a value held twice across fields and case, but not the shared GTIN', () => {
  const products = [
    { role: 'shared', sku: 'A', gtin: '111' },
    { role: 'shared', sku: 'B', gtin: '111' },
    { role: 'x', sku: 'C', gtin: '222' },
    { role: 'x', sku: 'd-1', mpn: 'M' },
    { role: 'x', sku: 'D-1' },
    { role: 'x', sku: 'E', props: { upc: '222' } },
    { role: 'x', sku: 'F', gtin: '111' },
  ];
  const got = Object.fromEntries(findScanCollisions(products).map((c) => [c.value, c.owners.sort()]));
  assert.deepEqual(got, {
    '111': ['A.gtin', 'B.gtin', 'F.gtin'],
    '222': ['C.gtin', 'E.upc'],
    'd-1': ['D-1.code', 'd-1.code'],
  });
  assert.deepEqual(findScanCollisions(products.slice(0, 3)), [], 'a GTIN shared only by role=shared products is the intended collision');
});
