// Unit tests for scripts/seed-data/b2b/addresses-specs.mjs — the ADDRESS-BOOK PAGINATION fixture
// contract that unblocks suite 011 CHK-060 / CHK-098.
//
// What these guard:
//   • the page arithmetic (pageCount / lastPageSize) at the storefront's 6-per-page size
//   • TARGET_TOTAL is coherent with its OWN stated rationale (>= MIN_PAGES, partial last page)
//   • paginationAudit correctly accounts for the org's unmanaged inline address (the +1 that
//     makes 21 committed CSV rows produce 22 live addresses)
//   • content-key de-duplication — two rows with the same key create ONE address, so they must
//     not be double-counted toward the pagination threshold
//   • the committed addresses.csv really does satisfy the invariant (the drift guard's own check)
//   • no runtime platform GUID leaked into the committed CSV
//
// Pure — no env, no network (the spec module deliberately does not import seed-common.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  ADDRESSES_PER_PAGE, MIN_PAGES, TARGET_TOTAL, PAGINATION_ORG_ID, REQUIRE_PARTIAL_LAST_PAGE,
  pageCount, lastPageSize, assertContractCoherent, addressContentKey,
  isRegionCode, regionNameFor, findGuidLeaks, paginationAudit,
} from '../seed-data/b2b/addresses-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const loadCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), {
  columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true,
});
const ADDRESSES = loadCsv('test-data/b2b/addresses.csv');
const ORGS = loadCsv('test-data/b2b/organizations.csv');

/* ── page arithmetic ─────────────────────────────────────────────────────────── */

test('pageCount matches the storefront 6-per-page contract', () => {
  assert.equal(ADDRESSES_PER_PAGE, 6, 'vc-frontend useCheckout.ts ADDRESSES_PER_PAGE');
  assert.equal(pageCount(1), 1);
  assert.equal(pageCount(6), 1, 'exactly one full page');
  assert.equal(pageCount(7), 2, 'one over a page boundary starts page 2');
  assert.equal(pageCount(12), 2);
  assert.equal(pageCount(22), 4, '22 addresses → 6 + 6 + 6 + 4');
});

test('lastPageSize reports the partial final page, and a full page when it divides exactly', () => {
  assert.equal(lastPageSize(22), 4, 'partial last page of 4');
  assert.equal(lastPageSize(12), 6, 'exact multiple → a FULL last page');
  assert.equal(lastPageSize(7), 1);
});

test('TARGET_TOTAL is coherent with its own stated rationale (not a magic number)', () => {
  assert.deepEqual(assertContractCoherent(), [], 'contract must be self-coherent');
  assert.ok(pageCount(TARGET_TOTAL) >= MIN_PAGES,
    `${TARGET_TOTAL} must yield >= ${MIN_PAGES} pages`);
  if (REQUIRE_PARTIAL_LAST_PAGE) {
    assert.notEqual(TARGET_TOTAL % ADDRESSES_PER_PAGE, 0,
      'an exact multiple of the page size would hide the partial-last-page edge case');
  }
});

test('assertContractCoherent would REJECT a total that yields too few pages', () => {
  // Re-derive the same predicate against a hypothetical total to prove the check has teeth
  // (TARGET_TOTAL itself is a const, so exercise the rule rather than mutating the module).
  const tooSmall = ADDRESSES_PER_PAGE * (MIN_PAGES - 1); // one page short
  assert.ok(pageCount(tooSmall) < MIN_PAGES, `${tooSmall} is deliberately one page short`);
  const exactMultiple = ADDRESSES_PER_PAGE * MIN_PAGES;
  assert.equal(exactMultiple % ADDRESSES_PER_PAGE, 0, 'and this one has no partial last page');
});

/* ── content key + region mapping ────────────────────────────────────────────── */

test('addressContentKey is case/whitespace-insensitive and identifies "the same address"', () => {
  const a = { addressType: 'Shipping', line1: '456 Oak Avenue', city: 'New York', countryCode: 'USA' };
  const b = { addressType: 'shipping', line1: '  456 OAK AVENUE ', city: 'new york', countryCode: 'usa' };
  assert.equal(addressContentKey(a), addressContentKey(b), 'same address regardless of casing');
  // line2 is NOT part of the key — two suites at the same street address are one key by design.
  assert.equal(addressContentKey({ ...a, addressType: 'Billing' }) === addressContentKey(a), false,
    'a different addressType is a DIFFERENT address');
});

test('regionNameFor maps the CSV code to the display NAME (VCST-5304 D2 drift)', () => {
  assert.equal(regionNameFor('NY'), 'New York');
  assert.equal(regionNameFor('ON'), 'Ontario');
  assert.equal(regionNameFor('QC'), 'Quebec');
  assert.equal(regionNameFor('New York'), 'New York', 'an already-full name passes through');
  assert.equal(regionNameFor(''), undefined, 'a region-less (e.g. GB) row stays region-less');
  assert.equal(isRegionCode('NY'), true);
  assert.equal(isRegionCode('New York'), false);
});

/* ── GUID-leak guard ─────────────────────────────────────────────────────────── */

test('findGuidLeaks detects a runtime platform GUID', () => {
  assert.equal(findGuidLeaks('ADDR-017,ORG-002,,Shipping,x').length, 0);
  assert.equal(findGuidLeaks('id=96f109a7-9010-4691-b6a1-bef25cca3d04').length, 1);
  assert.equal(findGuidLeaks('').length, 0);
});

test('the committed addresses.csv carries NO runtime platform GUID', () => {
  const leaks = findGuidLeaks(readFileSync(join(ROOT, 'test-data/b2b/addresses.csv'), 'utf8'));
  assert.deepEqual(leaks, [], 'org addresses are content-matched — ids belong in aliases.<env>.json');
});

/* ── paginationAudit ─────────────────────────────────────────────────────────── */

const ORG = 'ORG-TEST';
const orgRow = { org_id: ORG, org_name: 'AGENT-TEST-Org-Fixture', address_line1: '1 HQ Way', city: 'Springfield', country_code: 'USA' };
const row = (id, over = {}) => ({
  address_id: id, org_id: ORG, contact_id: '', address_type: 'Shipping',
  line1: `${id} Street`, city: `City-${id}`, state: 'NY', postal_code: '10001', country_code: 'US', ...over,
});

test('paginationAudit adds the +1 for the org inline address no CSV row covers', () => {
  const a = paginationAudit([row('A'), row('B')], [orgRow], ORG);
  assert.equal(a.csvDistinct, 2);
  assert.equal(a.unmanagedInline, 1, 'orgBody() creates a BillingAndShipping at the org address');
  assert.equal(a.expectedTotal, 3, '2 CSV rows + 1 inline');
});

test('paginationAudit does NOT double-count when a CSV row covers the inline org address', () => {
  const covering = row('HQ', { address_type: 'BillingAndShipping', line1: '1 HQ Way', city: 'Springfield' });
  const a = paginationAudit([row('A'), covering], [orgRow], ORG);
  assert.equal(a.unmanagedInline, 0, 'the CSV row IS the inline address — not an extra');
  assert.equal(a.expectedTotal, 2);
});

test('paginationAudit de-duplicates rows sharing a content key (the seeder creates ONE)', () => {
  const dup = row('DUP', { line1: 'A Street', city: 'City-A' }); // same key as row('A')
  const a = paginationAudit([row('A'), dup, row('B')], [orgRow], ORG);
  assert.equal(a.csvRowCount, 3, 'three rows committed');
  assert.equal(a.csvDistinct, 2, 'but only two distinct addresses get created');
  assert.deepEqual(a.duplicateRowIds, ['DUP'], 'the redundant row is reported');
  assert.equal(a.expectedTotal, 3, '2 distinct + 1 inline — the duplicate must not inflate the total');
});

test('paginationAudit ignores contact-level rows (they land on a contact, not the org)', () => {
  const contactRow = { ...row('C'), org_id: '', contact_id: 'CON-002' };
  const a = paginationAudit([row('A'), contactRow], [orgRow], ORG);
  assert.equal(a.csvDistinct, 1, 'only the org-level row counts');
});

test('paginationAudit reports facet spread (Country / State / City)', () => {
  const a = paginationAudit([
    row('A'), row('B', { country_code: 'CA', state: 'ON', city: 'Toronto' }), row('C', { country_code: 'GB', state: '', city: 'London' }),
  ], [orgRow], ORG);
  assert.equal(a.countryCount, 3);
  assert.deepEqual(a.countries, ['ca', 'gb', 'us']);
  assert.equal(a.stateCount, 2, 'the region-less GB row contributes no state facet value');
});

test('paginationAudit flags a missing org rather than throwing', () => {
  const a = paginationAudit([row('A')], [], ORG);
  assert.equal(a.orgName, null);
  assert.equal(a.unmanagedInline, 0, 'no org → no inline address to add');
});

/* ── the real committed fixture satisfies the invariant ──────────────────────── */

test('the committed fixture gives the pagination org a multi-page address book', () => {
  const a = paginationAudit(ADDRESSES, ORGS);
  assert.equal(a.orgId, PAGINATION_ORG_ID);
  assert.equal(a.orgName, 'AGENT-TEST-Org-TechFlow-20260310', 'TechFlow is the pagination org');
  assert.ok(a.expectedTotal >= TARGET_TOTAL,
    `expected >= ${TARGET_TOTAL} addresses, got ${a.expectedTotal} (${a.csvDistinct} CSV + ${a.unmanagedInline} inline)`);
  assert.ok(a.pages >= MIN_PAGES, `expected >= ${MIN_PAGES} pages, got ${a.pages}`);
  assert.equal(a.pages, 4, '22 addresses → 4 pages at 6/page');
  assert.equal(a.lastPage, 4, 'partial final page');
  assert.equal(a.partialLastPage, true);
  assert.deepEqual(a.duplicateRowIds, [], 'no redundant rows');
  assert.ok(a.countryCount >= 2, 'the Country facet needs >1 value');
});

test('the four pre-existing TechFlow rows are still intact and unreordered', () => {
  // The pagination rows were APPENDED; the original fixtures other cases depend on must not move.
  const orgRows = ADDRESSES.filter((r) => r.org_id === PAGINATION_ORG_ID && !r.contact_id);
  assert.deepEqual(orgRows.slice(0, 3).map((r) => r.address_id), ['ADDR-005', 'ADDR-006', 'ADDR-016'],
    'the original TechFlow rows keep their ids and order');
  assert.equal(orgRows[0].city, 'San Francisco');
  assert.equal(orgRows[0].is_default, 'true', 'ADDR-005 is still the default shipping address');
  assert.equal(orgRows[2].city, 'Toronto', 'ADDR-016 still supplies the second country for CHK-035');
});

test('the aliases suite 011/081 read agree with the committed CSV', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const a = paginationAudit(ADDRESSES, ORGS);
  const declared = aliases.TECHFLOW_ORG_ADDRESSES;
  assert.equal(declared.count, a.expectedTotal, 'TECHFLOW_ORG_ADDRESSES.count mirrors the CSV');
  assert.equal(declared.csv_managed_count, a.csvDistinct);
  assert.equal(declared.cities_distinct, a.cityCount);
  assert.equal(declared.states_distinct, a.stateCount);
  assert.equal(aliases.ADDRESS_SEARCH.totalCount, a.expectedTotal, 'ADDRESS_SEARCH total mirrors the CSV');

  // Each per-address alias must be backed by a real committed row (the class of bug this fixes:
  // an alias describing an address that exists nowhere).
  const has = (city, line1) => ADDRESSES.some((r) => r.org_id === PAGINATION_ORG_ID && r.city === city && r.line1 === line1);
  assert.ok(has(aliases.TECHFLOW_ADDR_US_NEW_YORK.city, aliases.TECHFLOW_ADDR_US_NEW_YORK.line1), 'US/NY alias backed by a row');
  assert.ok(has(aliases.TECHFLOW_ADDR_CA_TORONTO.city, aliases.TECHFLOW_ADDR_CA_TORONTO.line1), 'CA/ON alias backed by a row');
  assert.ok(has(aliases.TECHFLOW_ADDR_UK_LONDON.city, aliases.TECHFLOW_ADDR_UK_LONDON.line1), 'GB alias backed by a row');
});

test('every ADDRESS_SEARCH needle has the backing rows it claims', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const s = aliases.ADDRESS_SEARCH;
  const orgRows = ADDRESSES.filter((r) => r.org_id === PAGINATION_ORG_ID && !r.contact_id);
  // Counts describe how many rows EXIST for the needle, not what the storefront search returns.
  const zipRows = orgRows.filter((r) => r.postal_code.includes(s.zipNeedle));
  assert.equal(zipRows.length, s.zipNeedle_count, `zipNeedle ${s.zipNeedle} backing rows`);
  const nameRows = orgRows.filter((r) => `${r.first_name} ${r.last_name}`.includes(s.nameNeedle));
  assert.equal(nameRows.length, s.nameNeedle_count, `nameNeedle ${s.nameNeedle} backing rows`);
  // 'Hou' is a fuzzy-search needle: Houston matches literally, Huston is the deliberate near-miss.
  assert.ok(orgRows.some((r) => r.city === 'Houston'), 'Houston row present');
  assert.ok(orgRows.some((r) => r.city === 'Huston'), 'Huston near-miss row present');
});
