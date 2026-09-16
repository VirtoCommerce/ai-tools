// Unit tests for sales-rep-docs-specs.mjs — the VCST-5730 shared-document-library spec module.
// Pure: no env, no network, no live API. Run: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENTS, DOC_REP_KEYS, DOC_REPS_COLUMNS, DOC_REPS_RUNTIME_ID_COLUMNS,
  REQUIRED_CONTENT_TYPES, PAGE_SIZES, LARGE_DOC_SIZE, SEED_PREFIX, UPLOAD_SCOPE,
  CATEGORY_MAX_LENGTH, GUID_RE, PASSWORD_TOKEN_RE, REP_EMAIL_RE,
  ROLE_SALES_REP, ROLE_ADVANCED, ROLE_DOCS_MANAGER,
  PERM_ACCESS, PERM_DOCS_READ, PERM_DOCS_WRITE,
  buildFileBytes, buildCreateRequest, expectedDisplayName, expectedPermissions,
  isGrantingRole, isSeededDocument, isValidCategory, validateDocumentSpecs,
  paginationBoundaries, categoryCounts, pinnedAliases, declaredCategories, declaredContentTypes,
  crc32, pdfBytes, zipBytes, docxBytes, xlsxBytes, pngBytes, jpegBytes, opaqueBytes,
} from '../seed-data/sales-rep/sales-rep-docs-specs.mjs';

// --- spec set health -------------------------------------------------------

test('the spec set is internally healthy (no drift problems)', () => {
  assert.deepEqual(validateDocumentSpecs(), []);
});

test('the upload scope matches the deployed ModuleConstants.DocumentsScope', () => {
  assert.equal(UPLOAD_SCOPE, 'sales-rep-documents');
});

test('16 documents (> the storefront page size of 15), AGENT-TEST- prefixed, aliases unique', () => {
  // 16, not 12: the storefront documents page hardcodes a page size of 15 with no UI control, so at 12
  // fixtures page 2 could never exist and the pagination AC was unverifiable (2026-08-21).
  assert.equal(DOCUMENTS.length, 16);
  assert.ok(DOCUMENTS.length > 15, 'must exceed the storefront page size so a second page exists');
  const aliases = DOCUMENTS.map((d) => d.alias);
  assert.equal(new Set(aliases).size, aliases.length);
  for (const d of DOCUMENTS) assert.ok(d.fileName.startsWith(SEED_PREFIX), d.alias);
});

test('every required content type is covered', () => {
  const declared = declaredContentTypes();
  for (const ct of REQUIRED_CONTENT_TYPES) assert.ok(declared.includes(ct), `missing ${ct}`);
});

test('the fixture count makes page-size AND page-size+1 reachable at every page size', () => {
  for (const b of paginationBoundaries()) {
    assert.ok(b.exact, `cannot fill a page of ${b.size}`);
    assert.ok(b.plusOne, `no row beyond a page of ${b.size}`);
    assert.ok(b.pages >= 2, `only one page at size ${b.size}`);
  }
  assert.deepEqual(PAGE_SIZES, [5, 10]);
});

test('paginationBoundaries is a pure function of the total', () => {
  assert.deepEqual(paginationBoundaries(5).map((b) => [b.size, b.exact, b.plusOne]),
    [[5, true, false], [10, false, false]]);
  assert.deepEqual(paginationBoundaries(11).map((b) => [b.size, b.exact, b.plusOne]),
    [[5, true, true], [10, true, true]]);
});

test('at least 2 categories and at least 1 pinned document', () => {
  assert.ok(declaredCategories().length >= 2);
  assert.ok(pinnedAliases().length >= 1);
  const counts = categoryCounts();
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), DOCUMENTS.length);
});

test('no runtime GUID anywhere in the spec set', () => {
  assert.equal(GUID_RE.test(JSON.stringify(DOCUMENTS)), false);
});

// --- deployed-contract shaping ---------------------------------------------

test('buildCreateRequest omits isPinned — create FORCES it false on the deployed build', () => {
  const spec = DOCUMENTS.find((d) => d.pinned);
  const body = buildCreateRequest(spec, 'file-123');
  assert.equal(Object.keys(body).includes('isPinned'), false,
    'sending isPinned would look effective while the server forces it false');
  assert.equal(body.fileId, 'file-123');
  assert.equal(body.category, spec.category);
  assert.equal(body.name, spec.name);
});

test('buildCreateRequest drops a null pageCount and an empty summary rather than sending nulls', () => {
  const xlsx = DOCUMENTS.find((d) => d.alias === 'SR_DOC_XLSX');
  const body = buildCreateRequest(xlsx, 'f');
  assert.equal('pageCount' in body, false);
  const txt = DOCUMENTS.find((d) => d.alias === 'SR_DOC_TXT');
  const tbody = buildCreateRequest(txt, 'f');
  assert.equal('summary' in tbody, false);
  assert.equal(tbody.name, '');
});

test('expectedDisplayName mirrors the deployed NormalizeName fallback (blank name -> file name)', () => {
  const txt = DOCUMENTS.find((d) => d.alias === 'SR_DOC_TXT');
  assert.equal(txt.name, '');
  assert.equal(expectedDisplayName(txt), txt.fileName);
  const pdf = DOCUMENTS.find((d) => d.alias === 'SR_DOC_PDF');
  assert.equal(expectedDisplayName(pdf), pdf.name);
  assert.equal(expectedDisplayName({ name: '  padded  ', fileName: 'f.pdf' }), 'padded');
});

test('isValidCategory mirrors the deployed validator rules', () => {
  assert.equal(isValidCategory('AGENT-TEST-Catalogs'), true);
  assert.equal(isValidCategory(''), false);
  assert.equal(isValidCategory('x'.repeat(CATEGORY_MAX_LENGTH)), true);
  assert.equal(isValidCategory('x'.repeat(CATEGORY_MAX_LENGTH + 1)), false);
  for (const bad of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a|b', 'a<b', 'a>b', 'a"b', 'a..b']) {
    assert.equal(isValidCategory(bad), false, bad);
  }
  assert.equal(isValidCategory(`a${String.fromCharCode(9)}b`), false);
  for (const d of DOCUMENTS) assert.equal(isValidCategory(d.category), true, d.alias);
});

test('isSeededDocument matches on either name or displayName, and never on a foreign row', () => {
  assert.equal(isSeededDocument({ displayName: 'AGENT-TEST-x', name: null }), true);
  assert.equal(isSeededDocument({ name: 'AGENT-TEST-y' }), true);
  assert.equal(isSeededDocument({ name: 'Customer Price List', displayName: 'Customer Price List' }), false);
  assert.equal(isSeededDocument(null), false);
  assert.equal(isSeededDocument({}), false);
});

test('every document the seeder creates is recognised by the teardown sweep', () => {
  for (const d of DOCUMENTS) {
    assert.equal(isSeededDocument({ displayName: expectedDisplayName(d), name: d.fileName }), true, d.alias);
  }
});

// --- role / permission model ----------------------------------------------

test('granting roles are exactly the sales-rep:access holders', () => {
  assert.equal(isGrantingRole(ROLE_SALES_REP), true);
  assert.equal(isGrantingRole(ROLE_ADVANCED), true);
  // The write-only role carries no sales-rep:access, so POST /api/sales-rep would substitute one.
  assert.equal(isGrantingRole(ROLE_DOCS_MANAGER), false);
});

test('expectedPermissions derives the read fixture and the write-without-read fixture', () => {
  assert.deepEqual(expectedPermissions({ role_name: ROLE_ADVANCED, extra_role_name: '' }),
    [PERM_DOCS_READ, PERM_ACCESS].sort());
  const writer = expectedPermissions({ role_name: ROLE_SALES_REP, extra_role_name: ROLE_DOCS_MANAGER });
  assert.ok(writer.includes(PERM_DOCS_WRITE));
  assert.ok(writer.includes(PERM_ACCESS));
  assert.equal(writer.includes(PERM_DOCS_READ), false, 'the writer fixture must NOT hold :read');
});

test('a plain Sales Representative (every existing SR_REP_* fixture) holds NO document permission', () => {
  const p = expectedPermissions({ role_name: ROLE_SALES_REP, extra_role_name: '' });
  assert.deepEqual(p, [PERM_ACCESS]);
});

test('the rep CSV contract declares the runtime-id columns it must keep empty', () => {
  assert.deepEqual(DOC_REP_KEYS, ['SR_REP_DOCS', 'SR_REP_DOCS_WRITER']);
  for (const c of DOC_REPS_RUNTIME_ID_COLUMNS) assert.ok(DOC_REPS_COLUMNS.includes(c), c);
  assert.ok(DOC_REPS_COLUMNS.includes('password'));
});

test('the committed-cell hygiene patterns behave', () => {
  assert.equal(PASSWORD_TOKEN_RE.test('{{SR_REP_PASSWORD}}'), true);
  assert.equal(PASSWORD_TOKEN_RE.test('Password1!'), false);
  assert.equal(REP_EMAIL_RE.test('agent-test-sr-docs@example.com'), true);
  assert.equal(REP_EMAIL_RE.test('real.person@virtoworks.com'), false);
});

// --- byte generators -------------------------------------------------------

test('crc32 matches the known IEEE check value', () => {
  assert.equal(crc32(Buffer.from('123456789', 'ascii')), 0xcbf43926);
});

test('generators are deterministic — identical bytes across calls', () => {
  for (const d of DOCUMENTS) {
    assert.ok(buildFileBytes(d).equals(buildFileBytes(d)), d.alias);
  }
});

test('every document produces a NON-EMPTY file (the deployed CreateAsync rejects a 0-byte file)', () => {
  for (const d of DOCUMENTS) assert.ok(buildFileBytes(d).length > 0, d.alias);
});

test('the PDF generator emits a structurally complete PDF', () => {
  const b = pdfBytes('AGENT-TEST-x.pdf');
  const s = b.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.includes('/Type/Catalog'));
  assert.ok(s.includes('startxref'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  // startxref must point at the actual 'xref' keyword, or a reader rejects the file.
  const declared = Number(s.match(/startxref\s+(\d+)/)[1]);
  assert.equal(s.slice(declared, declared + 4), 'xref');
});

test('the PDF padding hits the requested size exactly and stays structurally valid', () => {
  const b = pdfBytes('AGENT-TEST-big.pdf', LARGE_DOC_SIZE);
  assert.ok(b.length >= LARGE_DOC_SIZE, `${b.length} < ${LARGE_DOC_SIZE}`);
  assert.ok(b.length <= LARGE_DOC_SIZE + 16, `padding overshot: ${b.length}`);
  const s = b.toString('latin1');
  const declared = Number(s.match(/startxref\s+(\d+)/)[1]);
  assert.equal(s.slice(declared, declared + 4), 'xref', 'padding must not break the xref offset');
});

test('the large fixture is the one that is actually large', () => {
  const large = DOCUMENTS.find((d) => d.kind === 'pdf-large');
  assert.ok(buildFileBytes(large).length >= LARGE_DOC_SIZE);
  for (const d of DOCUMENTS.filter((x) => x.kind !== 'pdf-large')) {
    assert.ok(buildFileBytes(d).length < 1024 * 1024, `${d.alias} is unexpectedly large`);
  }
});

test('zipBytes writes a readable local header + central directory + EOCD', () => {
  const z = zipBytes([{ name: 'a.txt', data: 'hello' }]);
  assert.equal(z.readUInt32LE(0), 0x04034b50, 'local file header signature');
  const eocdAt = z.length - 22;
  assert.equal(z.readUInt32LE(eocdAt), 0x06054b50, 'EOCD signature');
  assert.equal(z.readUInt16LE(eocdAt + 10), 1, 'one central directory entry');
  // The stored CRC must be the CRC of the payload, or every unzip tool reports corruption.
  assert.equal(z.readUInt32LE(14), crc32(Buffer.from('hello')));
});

test('docx and xlsx are ZIP containers carrying their required OOXML parts', () => {
  const docx = docxBytes('AGENT-TEST-doc');
  assert.equal(docx.readUInt32LE(0), 0x04034b50);
  const ds = docx.toString('latin1');
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
    assert.ok(ds.includes(part), `docx missing ${part}`);
  }
  const xlsx = xlsxBytes('AGENT-TEST-sheet');
  assert.equal(xlsx.readUInt32LE(0), 0x04034b50);
  const xs = xlsx.toString('latin1');
  for (const part of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/_rels/workbook.xml.rels']) {
    assert.ok(xs.includes(part), `xlsx missing ${part}`);
  }
});

test('pngBytes emits a valid PNG signature, IHDR dimensions and IEND', () => {
  const b = pngBytes(64);
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(b.subarray(12, 16).toString('latin1'), 'IHDR');
  assert.equal(b.readUInt32BE(16), 64);
  assert.equal(b.readUInt32BE(20), 64);
  assert.ok(b.subarray(b.length - 8).toString('latin1').includes('IEND'));
});

test('the embedded JPEG is a structurally complete baseline JPEG (a corrupted paste cannot pass)', () => {
  const b = jpegBytes();
  assert.equal(b.length, 399);
  assert.equal(b.readUInt16BE(0), 0xffd8, 'SOI');
  assert.equal(b.readUInt16BE(b.length - 2), 0xffd9, 'EOI');
  const markers = new Set();
  for (let i = 0; i < b.length - 1; i++) {
    if (b[i] === 0xff && b[i + 1] >= 0xc0 && b[i + 1] <= 0xda) markers.add(b[i + 1]);
  }
  assert.ok(markers.has(0xc0), 'SOF0 (baseline frame) missing');
  assert.ok(markers.has(0xc4), 'DHT (huffman table) missing');
  assert.ok(markers.has(0xda), 'SOS (scan) missing');
  assert.ok(b.toString('latin1').includes('JFIF'));
});

test('opaqueBytes is seed-stable, seed-sensitive, and the requested length', () => {
  assert.ok(opaqueBytes('a', 64).equals(opaqueBytes('a', 64)));
  assert.equal(opaqueBytes('a', 64).equals(opaqueBytes('b', 64)), false);
  assert.equal(opaqueBytes('a', 64).length, 64);
});

test('buildFileBytes rejects an unknown kind loudly instead of writing an empty file', () => {
  assert.throws(() => buildFileBytes({ kind: 'nope', alias: 'X' }), /unknown document kind/);
});
