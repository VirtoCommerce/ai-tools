// Unit tests for the PageBuilder qa-* page fixture pure logic (pagebuilder-pages-specs.mjs).
// Pure — no env, no network. Run: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_PAGES, STATUS, pickCanonical, permalinkConflict, draftBody, permalinkBody, findGuidLeaks, updateBody, isoOffsetDays, pickPromoteCandidate, pickByNameCulture, familyDuplicates, parseContentDoc, blockCount, buildContentBody, maxDiscover, createGroupedBody,
} from '../seed-data/cms/pagebuilder-pages-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const spec = (alias) => CANONICAL_PAGES.find((p) => p.alias === alias);

test('5 canonical pages with unique aliases + permalinks', () => {
  assert.equal(CANONICAL_PAGES.length, 5);
  assert.equal(new Set(CANONICAL_PAGES.map((p) => p.alias)).size, 5);
  assert.equal(new Set(CANONICAL_PAGES.map((p) => p.permalink)).size, 5);
});

test('pickCanonical matches EXACT name only — never a "(copy)"/"-2" drift', () => {
  const pages = [
    { id: 'g1', name: 'QA Homepage Spring Sale', cultureName: 'en-US', status: 'Archived', permalink: '/qa-homepage-spring-sale' },
    { id: 'g2', name: 'QA Homepage Spring Sale (copy)', cultureName: 'en-US', status: 'Published', permalink: '/qa-homepage-spring-sale-copy' },
    { id: 'g3', name: 'QA Homepage Spring Sale Updated', cultureName: 'en-US', status: 'Published', permalink: '/x' },
  ];
  const chosen = pickCanonical(pages, spec('PB_HOMEPAGE'));
  assert.equal(chosen.id, 'g1'); // exact name, not the copy/updated variants
});

test('pickCanonical prefers culture match, then non-Archived', () => {
  const pages = [
    { id: 'de', name: 'QA Return Policy', cultureName: 'de-DE', status: 'Published', permalink: '/x' },
    { id: 'enA', name: 'QA Return Policy', cultureName: 'en-US', status: 'Archived', permalink: '/y' },
    { id: 'enP', name: 'QA Return Policy', cultureName: 'en-US', status: 'Published', permalink: '/z' },
  ];
  assert.equal(pickCanonical(pages, spec('PB_RETURN_POLICY')).id, 'enP');
});

test('pickCanonical returns null when only drifted copies exist', () => {
  const pages = [{ id: 'c', name: 'QA Return Policy (copy)', cultureName: 'en-US', status: 'Published', permalink: '/p' }];
  assert.equal(pickCanonical(pages, spec('PB_RETURN_POLICY')), null);
});

test('permalinkConflict flags a different page occupying the expected slot', () => {
  const chosen = { id: 'me', permalink: '/other' };
  const pages = [chosen, { id: 'them', name: 'QA Rückgaberichtlinie', cultureName: 'de-DE', status: 'Published', permalink: '/qa-return-policy' }];
  const c = permalinkConflict(pages, spec('PB_RETURN_POLICY'), chosen);
  assert.equal(c.id, 'them');
});

test('permalinkConflict ignores an ARCHIVED page at the slot (it does not render — no real conflict)', () => {
  const chosen = { id: 'me', permalink: '/other' };
  const pages = [chosen, { id: 'stale', name: 'QA Return Policy (obsolete-probe)', cultureName: 'en-US', status: 'Archived', permalink: '/qa-return-policy' }];
  assert.equal(permalinkConflict(pages, spec('PB_RETURN_POLICY'), chosen), null);
  // but a PUBLISHED different page at the slot is still a conflict
  pages[1].status = 'Published';
  assert.equal(permalinkConflict(pages, spec('PB_RETURN_POLICY'), chosen).id, 'stale');
});

test('draftBody sets group + nested page statuses to Draft (deep copy)', () => {
  const full = { status: 'Archived', permalink: '/p', pages: [{ status: 'Archived' }] };
  const b = draftBody(full);
  assert.equal(b.status, STATUS.DRAFT);
  assert.equal(b.pages[0].status, STATUS.DRAFT);
  assert.equal(full.status, 'Archived'); // original untouched
});

test('permalinkBody sets the new permalink without mutating the source', () => {
  const full = { status: 'Published', permalink: '/old' };
  assert.equal(permalinkBody(full, '/new').permalink, '/new');
  assert.equal(full.permalink, '/old');
});

test('isoOffsetDays computes a future/past ISO timestamp relative to a base', () => {
  const base = Date.parse('2026-07-21T00:00:00Z');
  assert.equal(isoOffsetDays(7, base), '2026-07-28T00:00:00.000Z');
  assert.ok(isoOffsetDays(-1, base) < isoOffsetDays(1, base));
});

test('updateBody applies a patch without mutating the source', () => {
  const full = { name: 'A', permalink: '/a', pages: [{ id: 1 }] };
  const b = updateBody(full, { name: 'B', permalink: '/b' });
  assert.equal(b.name, 'B'); assert.equal(b.permalink, '/b');
  assert.equal(full.name, 'A'); assert.equal(full.pages[0].id, 1);
});

test('pickByNameCulture matches exact name + culture', () => {
  const pages = [
    { id: 'de', name: 'QA Rückgaberichtlinie', cultureName: 'de-DE' },
    { id: 'en', name: 'QA Return Policy', cultureName: 'en-US' },
  ];
  assert.equal(pickByNameCulture(pages, 'QA Rückgaberichtlinie', 'de-DE').id, 'de');
  assert.equal(pickByNameCulture(pages, 'QA Return Policy', 'de-DE'), null);
});

test('pickPromoteCandidate picks the closest en-US return-policy drift (Published, shortest permalink)', () => {
  const rp = spec('PB_RETURN_POLICY');
  const pages = [
    { id: 'de', name: 'QA Rückgaberichtlinie', cultureName: 'de-DE', status: 'Published', permalink: '/qa-return-policy' },
    { id: 'copy2', name: 'QA Return Policy (copy 2)', cultureName: 'en-US', status: 'Published', permalink: '/qa-return-policy-copy-2' },
    { id: 'dash2', name: 'QA Return Policy-2', cultureName: 'en-US', status: 'Published', permalink: '/qa-return-policy-2' },
  ];
  assert.equal(pickPromoteCandidate(pages, rp).id, 'dash2'); // en-US, Published, shortest permalink
});

test('familyDuplicates returns return-policy family pages except the kept canonicals, skipping Archived', () => {
  const rp = spec('PB_RETURN_POLICY');
  const pages = [
    { id: 'en', name: 'QA Return Policy', cultureName: 'en-US', status: 'Published', permalink: '/qa-return-policy' },
    { id: 'de', name: 'QA Rückgaberichtlinie', cultureName: 'de-DE', status: 'Published', permalink: '/qa-return-policy' },
    { id: 'copy', name: 'QA Return Policy (copy)', cultureName: 'en-US', status: 'Published', permalink: '/qa-return-policy-copy' },
    { id: 'arch', name: 'QA Return Policy (copy 2)', cultureName: 'en-US', status: 'Archived', permalink: '/qa-return-policy-copy-2' },
    { id: 'other', name: 'QA Homepage Spring Sale', cultureName: 'en-US', status: 'Published', permalink: '/qa-homepage-spring-sale' },
  ];
  const d = familyDuplicates(pages, rp, ['en', 'de']).map((p) => p.id);
  assert.deepEqual(d, ['copy']); // not kept ids, not archived, not the non-family homepage
});

test('parseContentDoc tolerates empty / non-JSON → {content:[]}', () => {
  assert.deepEqual(parseContentDoc(''), { content: [] });
  assert.deepEqual(parseContentDoc('not json'), { content: [] });
  assert.equal(blockCount(parseContentDoc('{"content":[{"type":"title"}]}')), 1);
});

test('buildContentBody assigns deterministic ids + resolves @discover markers (no mutation)', () => {
  const doc = { settings: { header: 'H' }, content: [
    { type: 'title', title: 'T' },
    { type: 'predefined-product-list', skus: '@discover:2' },
  ] };
  const body = buildContentBody(doc, { skus: ['SKU-A', 'SKU-B', 'SKU-C'] });
  assert.equal(body.content[0].id, 'title01');
  assert.equal(body.content[1].id, 'predefinedproductlist02');
  assert.deepEqual(body.content[1].skus, [{ sku: 'SKU-A' }, { sku: 'SKU-B' }]);
  assert.equal(doc.content[1].skus, '@discover:2'); // source untouched
  assert.equal(body.content[0].background, null);
});

test('maxDiscover returns the largest @discover:N across a doc', () => {
  assert.equal(maxDiscover({ content: [{ skus: '@discover:3' }, { skus: '@discover:6' }, { type: 'title' }] }), 6);
  assert.equal(maxDiscover({ content: [{ type: 'title' }] }), 0);
});

test('createGroupedBody builds the verified minimal from-scratch create body (no id, Draft, pages:[])', () => {
  const b = createGroupedBody(spec('PB_HOMEPAGE'), { storeId: 'B2B-store', culture: 'en-US', name: 'QA Homepage Spring Sale', permalink: '/qa-homepage-spring-sale' });
  assert.equal(b.id, undefined);              // server assigns the groupId
  assert.equal(b.storeId, 'B2B-store');
  assert.equal(b.cultureName, 'en-US');
  assert.equal(b.name, 'QA Homepage Spring Sale');
  assert.equal(b.permalink, '/qa-homepage-spring-sale');
  assert.equal(b.status, STATUS.DRAFT);
  assert.equal(b.visibility, true);
  assert.deepEqual(b.pages, []);              // server auto-creates the page shell
  assert.equal('userGroups' in b, false);     // no personalization for PB_HOMEPAGE
  assert.equal('organizationId' in b, false);
});

test('spec module carries no runtime GUID', () => {
  const src = readFileSync(join(ROOT, 'scripts/seed-data/cms/pagebuilder-pages-specs.mjs'), 'utf8');
  assert.deepEqual(findGuidLeaks(src), []);
});
