/**
 * sales-rep-docs-specs.mjs — side-effect-free source of truth for the VCST-5730
 * "Shared Document Library for Sales Reps" test data.
 *
 * Importing this module has NO side effects (no env read, no network, no main()), so the seeder
 * (seed-sales-rep-docs.mjs), the drift guard (validate-sales-rep-docs-data.mjs) and the unit tests
 * (scripts/unit/seed-sales-rep-docs.test.mjs) all import the same declarations.
 *
 * WHY the documents live HERE and not in a CSV (the flat-row-to-CSV rule in
 * .claude/knowledge/execution/test-data-authoring.md section 4): a document fixture is not just a
 * row — its FILE BYTES are part of the fixture, and they are synthesized deterministically by the
 * generators below (a valid PDF / OOXML / PNG / JPEG / opaque blob at a declared size). A CSV mirror
 * of the same 12 rows would be the "second hand-maintained mirror" the authoring rule forbids, so
 * the spec module is the single source and the documents' @td aliases are INLINE aliases whose ids
 * arrive from the aliases.<env>.json overlay. The two REPS, by contrast, are genuinely flat rows
 * with hand-authored prose, so they live in test-data/sales-rep/document-reps.csv.
 *
 * Deployed contract this is shaped to (vc-module-sales-rep @ 16a2c23622 = the build live on
 * vcptcore-qa as VirtoCommerce.SalesRep 3.1004.0-pr-12-16a2; NOT branch head, which renamed things):
 *   Step 1  POST /api/files/{UPLOAD_SCOPE}           multipart, returns [{ id, name, size, ... }]
 *   Step 2  POST /api/sales-rep/documents            { fileId, category, name, summary, pageCount, previewUrl }
 *   pin     POST /api/sales-rep/documents/{id}/pin   — IsPinned is FORCED false on create, so a
 *                                                      pinned fixture is always a second call
 *   read    POST /api/sales-rep/documents/search     { category, isPinned, keyword, skip, take, sortInfos }
 *   delete  DELETE /api/sales-rep/documents?ids=...  (deletes the blob too)
 * Category is REQUIRED (SalesRepDocumentMetadataValidator: NotEmpty, max 32 chars, none of
 * <>:"/\|?*, no "..", no control chars) — an uncategorised document cannot exist on this build.
 */

import zlib from 'node:zlib';

/** The file-experience-api upload scope the module claims files from (ModuleConstants.DocumentsScope). */
export const UPLOAD_SCOPE = 'sales-rep-documents';

/** Every seeded entity carries this prefix so teardown sweeps exactly what we made. */
export const SEED_PREFIX = 'AGENT-TEST-';

/** Category length + character rules, mirrored from the deployed validator. */
export const CATEGORY_MAX_LENGTH = 32;
const INVALID_CATEGORY_CHARS = '<>:"/\\|?*';
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
const NON_ASCII_RE = /[^\u0000-\u007f]/;

/** Page sizes the library must be able to page at. 12 documents makes "exactly N" and "N + 1"
 *  reachable for BOTH (page 1 full at 5 and at 10; a 6th and an 11th row exist). */
export const PAGE_SIZES = [5, 10];

// ---------------------------------------------------------------------------
// Reps (CSV-backed — test-data/sales-rep/document-reps.csv)
// ---------------------------------------------------------------------------

/** Exact committed column contract. The seeder and every @td alias map columns by name, so a
 *  silent rename/insert breaks resolution — the guard asserts order + names. */
export const DOC_REPS_COLUMNS = [
  'rep_key', 'email', 'first_name', 'last_name', 'full_name', 'store', 'served_orgs',
  'role_name', 'extra_role_name', 'password', 'contact_id', 'user_id', 'seeded', 'test_purpose',
];

/** Columns that hold a RUNTIME platform GUID — must stay EMPTY in the committed CSV
 *  (.claude/rules/test-data.md: ids belong in aliases.<env>.json). */
export const DOC_REPS_RUNTIME_ID_COLUMNS = ['contact_id', 'user_id'];

/** Module-seeded role names (SalesRepRoleSeeder @ 16a2c23622). */
export const ROLE_SALES_REP = 'Sales Representative';              // sales-rep:access
export const ROLE_ADVANCED = 'Advanced Sales Representative';      // sales-rep:access + documents:read
export const ROLE_DOCS_MANAGER = 'Sales Rep Documents Manager';    // documents:write ONLY

/** Permission ids, for the guard's coverage assertions. */
export const PERM_ACCESS = 'sales-rep:access';
export const PERM_DOCS_READ = 'sales-rep-documents:read';
export const PERM_DOCS_WRITE = 'sales-rep-documents:write';

/**
 * Only roles carrying sales-rep:access are "granting" roles, and POST /api/sales-rep SILENTLY falls
 * back to a granting role when `roleId` names a non-granting one (SalesRepService
 * ResolveAssignableRoleAsync: `grantingRoles.FirstOrDefault(r => r.Id == salesRep.RoleId) ?? …`).
 * So a documents:write-only role can never be the rep's create-time role — it has to be added to
 * the ApplicationUser afterwards, which is exactly what `extra_role_name` is for. It survives a
 * reseed because UpdateAccountAsync only strips roles in the GRANTING set.
 */
export const GRANTING_ROLES = [ROLE_SALES_REP, ROLE_ADVANCED];

export function isGrantingRole(name) {
  return GRANTING_ROLES.includes(name);
}

/**
 * The permission set a rep row is EXPECTED to end up holding, derived from its declared roles.
 * Pure — this is what the guard checks the fixture design against, and what a suite case asserts.
 */
export function expectedPermissions(row) {
  const set = new Set();
  for (const name of [row.role_name, row.extra_role_name].filter(Boolean)) {
    if (name === ROLE_SALES_REP) set.add(PERM_ACCESS);
    if (name === ROLE_ADVANCED) { set.add(PERM_ACCESS); set.add(PERM_DOCS_READ); }
    if (name === ROLE_DOCS_MANAGER) set.add(PERM_DOCS_WRITE);
  }
  return [...set].sort();
}

/** The two reps this fixture set owns. */
export const DOC_REP_KEYS = ['SR_REP_DOCS', 'SR_REP_DOCS_WRITER'];

/** Alias fields every rep alias must declare (so a case can log in and assert by id). */
export const REP_REQUIRED_ALIAS_FIELDS = ['id', 'user_id', 'email', 'password'];

/** Sweep convention already used by sales-reps.csv — teardown deletes only these. */
export const REP_EMAIL_RE = /^agent-test-[a-z0-9-]+@example\.com$/;

/** A committed cell may only reference a password by {{VAR}} token, never a literal. */
export const PASSWORD_TOKEN_RE = /^\{\{[A-Z0-9_]+\}\}$/;

/** Runtime platform GUID shapes (dashed + 32-hex "N" format) — must never appear in a committed file. */
export const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{32}\b/i;

// ---------------------------------------------------------------------------
// Byte generators (pure + deterministic — same bytes on every run and every env)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

/** CRC-32 (used by both the PNG chunks and the ZIP entries). */
export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * A valid single-page PDF, optionally padded to `targetSize` bytes with a trailing comment block.
 * Padding is appended AFTER the last object and BEFORE the xref, so object offsets are unaffected
 * and only `startxref` moves — the file stays structurally correct at any size.
 */
export function pdfBytes(title, targetSize = 0) {
  const text = String(title).replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 14 Tf 40 150 Td (${text}) Tj ET\n`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${Buffer.byteLength(stream, 'latin1')}>>\nstream\n${stream}endstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];

  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const tail = (start) => {
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${start}\n%%EOF\n`;
    return xref;
  };

  // Pad deterministically until the total reaches targetSize (never truncates a real object).
  let padding = '';
  if (targetSize > 0) {
    const bodyLen = Buffer.byteLength(body, 'latin1');
    const current = bodyLen + Buffer.byteLength(tail(bodyLen), 'latin1');
    const deficit = targetSize - current;
    if (deficit > 2) padding = `%${'P'.repeat(deficit - 2)}\n`;
  }
  const start = Buffer.byteLength(body + padding, 'latin1');
  return Buffer.from(body + padding + tail(start), 'latin1');
}

/** A stored (uncompressed) ZIP archive from [{ name, data }] — the container both DOCX and XLSX are. */
export function zipBytes(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  // Fixed DOS timestamp (1980-01-01) so the bytes are byte-identical on every run.
  const dosTime = 0;
  const dosDate = 0x0021;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10); cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

const OOXML_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="{TARGET}"/>'
  + '</Relationships>';

/** A minimal, structurally valid .docx (WordprocessingML). */
export function docxBytes(text) {
  return zipBytes([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: OOXML_RELS.replace('{TARGET}', 'word/document.xml') },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>` },
  ]);
}

/** A minimal, structurally valid .xlsx (SpreadsheetML) with one sheet and one inline-string cell. */
export function xlsxBytes(text) {
  return zipBytes([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: OOXML_RELS.replace('{TARGET}', 'xl/workbook.xml') },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${text}</t></is></c></row></sheetData></worksheet>` },
  ]);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** A valid RGB PNG (deterministic gradient) — the "previewable image" branch. */
export function pngBytes(size = 64) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour
  const rowLen = size * 3;
  const raw = Buffer.alloc((rowLen + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (rowLen + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (rowLen + 1) + 1 + x * 3;
      raw[o] = (x * 4) % 256; raw[o + 1] = (y * 4) % 256; raw[o + 2] = 160;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A valid 48x48 baseline JPEG, 399 bytes. Embedded as base64 rather than generated because a
 * correct JPEG needs Huffman + quantisation tables — encoding one in-repo would be far more code
 * than the fixture is worth, and this repo has no image dependency. The structure is asserted by the
 * unit tests (SOI / DQT / SOF0 / DHT / SOS / EOI markers), so a corrupted paste cannot pass silently.
 */
export const JPEG_BASE64 = [
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhl',
  'bXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8',
  'fHx8fHx8fHx8fHx8fHz/wAARCAAwADADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAwQG/8QAFhAAAwAAAAAAAAAA',
  'AAAAAAAAAAID/8QAGQEAAgMBAAAAAAAAAAAAAAAAAwQABQYC/8QAFxEAAwEAAAAAAAAAAAAAAAAAAAECA//aAAwDAQACEQMR',
  'AD8AzCzFWYizFWZYuzjOwlmKsxVmKswTsfzsJZirMRZirME7LDOyFZiLMVZirMjsyedhLMVZirMRZgnZYZ2GsxVmIsxVmCdj',
  '+dkCzFWYqzFWZHZlM7CWYqzEWYqzBOx/Ow1mIsxVmKswTsfzs//Z',
].join('');

export function jpegBytes() {
  return Buffer.from(JPEG_BASE64, 'base64');
}

/** An opaque binary blob — the unknown-extension / icon-fallback branch. */
export function opaqueBytes(seed, size = 2048) {
  const buf = Buffer.alloc(size);
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) & 0xffff;
  for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; buf[i] = (x >>> 16) & 0xff; }
  return buf;
}

// ---------------------------------------------------------------------------
// The 12 documents
// ---------------------------------------------------------------------------

/** ~3 MB: big enough that size formatting / a non-instant download is meaningful, small enough to be
 *  a polite fixture on a shared QA env. */
export const LARGE_DOC_SIZE = 3 * 1024 * 1024;

export const CATEGORY_CATALOGS = 'AGENT-TEST-Catalogs';
export const CATEGORY_CONTRACTS = 'AGENT-TEST-Contracts';
export const CATEGORY_PRICING = 'AGENT-TEST-Pricing';

/**
 * kind -> the generator + the multipart content type. `name` is the metadata display name; a BLANK
 * name deliberately exercises the deployed NormalizeName fallback (displayName := file name).
 */
export const DOCUMENTS = [
  {
    key: 'PDF', alias: 'SR_DOC_PDF', kind: 'pdf',
    fileName: 'AGENT-TEST-Product-Catalog.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Product Catalog 2026', category: CATEGORY_CATALOGS, pinned: true,
    summary: 'Baseline PDF happy path — pinned, so it also anchors the pinned-first default sort.',
    pageCount: 12,
    purpose: 'The canonical readable document: PDF mime, pinned, non-empty summary + pageCount.',
  },
  {
    key: 'DOCX', alias: 'SR_DOC_DOCX', kind: 'docx',
    fileName: 'AGENT-TEST-Contract-Template.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    name: 'AGENT-TEST-Contract Template', category: CATEGORY_CONTRACTS, pinned: false,
    summary: 'Office word-processing document — the long-mime / office-icon branch.',
    pageCount: 4,
    purpose: 'Long OOXML content type (73 chars) — icon mapping and any mime-column truncation.',
  },
  {
    key: 'XLSX', alias: 'SR_DOC_XLSX', kind: 'xlsx',
    fileName: 'AGENT-TEST-Price-List.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    name: 'AGENT-TEST-Price List Q3', category: CATEGORY_PRICING, pinned: false,
    summary: 'Spreadsheet document — distinct icon from the word-processing mime above.',
    pageCount: null,
    purpose: 'Second OOXML mime, and a NULL pageCount (the field is optional on this build).',
  },
  {
    key: 'TXT', alias: 'SR_DOC_TXT', kind: 'txt',
    fileName: 'AGENT-TEST-Release-Notes.txt', contentType: 'text/plain',
    name: '', category: CATEGORY_CONTRACTS, pinned: false,
    summary: '', pageCount: null,
    purpose: 'BLANK metadata name + BLANK summary — proves the deployed NormalizeName fallback '
      + '(displayName := file name) and an empty-summary render. Still sweepable: the FILE name carries the prefix.',
  },
  {
    key: 'PNG', alias: 'SR_DOC_PNG', kind: 'png',
    fileName: 'AGENT-TEST-Brand-Logo.png', contentType: 'image/png',
    name: 'AGENT-TEST-Brand Logo', category: CATEGORY_CATALOGS, pinned: false,
    summary: 'Raster image — the possible-thumbnail/preview branch.', pageCount: null,
    purpose: 'image/png: whether the UI renders an inline preview or falls back to a file icon.',
  },
  {
    key: 'JPG', alias: 'SR_DOC_JPG', kind: 'jpg',
    fileName: 'AGENT-TEST-Warehouse-Photo.jpg', contentType: 'image/jpeg',
    name: 'AGENT-TEST-Warehouse Photo', category: CATEGORY_CATALOGS, pinned: false,
    summary: 'Second image mime — image handling must not be png-only.', pageCount: null,
    purpose: 'image/jpeg alongside image/png, so an image branch keyed on the exact mime is caught.',
  },
  {
    key: 'UNKNOWN_EXT', alias: 'SR_DOC_UNKNOWN_EXT', kind: 'opaque',
    fileName: 'AGENT-TEST-Legacy-Export.zip', contentType: 'application/zip',
    name: 'AGENT-TEST-Legacy Export', category: CATEGORY_CONTRACTS, pinned: false,
    summary: 'Opaque archive — the generic-icon fallback.', pageCount: null,
    purpose: 'Opaque, non-previewable but ALLOWED type: icon fallback and no broken preview. Was .vcqa, '
      + 'changed 2026-08-21 - an out-of-allowlist extension is rejected at upload by the scope guard '
      + '(INVALID_EXTENSION), so an unknown extension can never become a document on this platform.',
  },
  {
    key: 'UNICODE', alias: 'SR_DOC_UNICODE', kind: 'pdf',
    fileName: 'AGENT-TEST-Каталог продукции 2026.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Каталог продукции 2026', category: CATEGORY_CATALOGS, pinned: false,
    summary: 'Cyrillic + spaces in the file name — URL / Content-Disposition encoding of the download.',
    pageCount: 8,
    purpose: 'Non-ASCII AND spaces in one file name: percent-encoding of the blob path, the '
      + 'Content-Disposition filename on download, and keyword search over a Cyrillic name. NOT pinned - the platform enforces a SINGLE pinned document (live-verified 2026-08-20).',
  },
  {
    key: 'LARGE', alias: 'SR_DOC_LARGE', kind: 'pdf-large',
    fileName: 'AGENT-TEST-Large-Spec-Bundle.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Large Spec Bundle', category: CATEGORY_PRICING, pinned: false,
    summary: 'Deliberately large (~3 MB) — size formatting and a non-instant download.',
    pageCount: 240,
    purpose: 'About 3 MB: human-readable size rendering (MB not KB) and a download that is not instant.',
  },
  {
    key: 'FILLER_01', alias: 'SR_DOC_FILLER_01', kind: 'pdf',
    fileName: 'AGENT-TEST-Filler-01.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Filler 01', category: CATEGORY_CATALOGS, pinned: false,
    summary: 'Pagination filler.', pageCount: 1,
    purpose: 'Volume so page 1 fills at both page sizes and a second page exists.',
  },
  {
    key: 'FILLER_02', alias: 'SR_DOC_FILLER_02', kind: 'pdf',
    fileName: 'AGENT-TEST-Filler-02.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Filler 02', category: CATEGORY_CONTRACTS, pinned: false,
    summary: 'Pagination filler.', pageCount: 1,
    purpose: 'Volume so page 1 fills at both page sizes and a second page exists.',
  },
  {
    key: 'FILLER_03', alias: 'SR_DOC_FILLER_03', kind: 'pdf',
    fileName: 'AGENT-TEST-Filler-03.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Filler 03', category: CATEGORY_PRICING, pinned: false,
    summary: 'Pagination filler.', pageCount: 1,
    purpose: 'Volume so page 1 fills at both page sizes and a second page exists.',
  },
  {
    key: 'FILLER_04', alias: 'SR_DOC_FILLER_04', kind: 'pdf',
    fileName: 'AGENT-TEST-Filler-04.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Filler 04', category: CATEGORY_CATALOGS, pinned: false,
    summary: 'Pagination filler.', pageCount: 1,
    purpose: 'Added 2026-08-21: the storefront page size is hardcoded to 15 with no UI control, so the '
      + 'pagination AC was unreachable at 12 fixtures. These push the library past 15 so page 2 exists.',
  },
  {
    key: 'FILLER_05', alias: 'SR_DOC_FILLER_05', kind: 'pdf',
    fileName: 'AGENT-TEST-Filler-05.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Filler 05', category: CATEGORY_CONTRACTS, pinned: false,
    summary: 'Pagination filler.', pageCount: 1,
    purpose: 'Added 2026-08-21: the storefront page size is hardcoded to 15 with no UI control, so the '
      + 'pagination AC was unreachable at 12 fixtures. These push the library past 15 so page 2 exists.',
  },
  {
    key: 'FILLER_06', alias: 'SR_DOC_FILLER_06', kind: 'pdf',
    fileName: 'AGENT-TEST-Filler-06.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Filler 06', category: CATEGORY_PRICING, pinned: false,
    summary: 'Pagination filler.', pageCount: 1,
    purpose: 'Added 2026-08-21: the storefront page size is hardcoded to 15 with no UI control, so the '
      + 'pagination AC was unreachable at 12 fixtures. These push the library past 15 so page 2 exists.',
  },
  {
    key: 'FILLER_07', alias: 'SR_DOC_FILLER_07', kind: 'pdf',
    fileName: 'AGENT-TEST-Filler-07.pdf', contentType: 'application/pdf',
    name: 'AGENT-TEST-Filler 07', category: CATEGORY_CATALOGS, pinned: false,
    summary: 'Pagination filler.', pageCount: 1,
    purpose: 'Added 2026-08-21: the storefront page size is hardcoded to 15 with no UI control, so the '
      + 'pagination AC was unreachable at 12 fixtures. These push the library past 15 so page 2 exists.',
  },
];

/** Content types the fixture set must keep covering — losing one silently drops a UI branch.
 *  application/octet-stream was dropped 2026-08-21: it is UNREACHABLE as a document, because the
 *  upload scope's AllowedExtensions guard rejects an unrecognised extension (INVALID_EXTENSION)
 *  before a file can be registered. application/zip is the allowed opaque stand-in. */
export const REQUIRED_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png',
  'image/jpeg',
  'application/zip',
];

/** Synthesize a document's file bytes (pure, deterministic). */
export function buildFileBytes(spec) {
  switch (spec.kind) {
    case 'pdf': return pdfBytes(spec.fileName);
    case 'pdf-large': return pdfBytes(spec.fileName, LARGE_DOC_SIZE);
    case 'docx': return docxBytes(spec.name || spec.fileName);
    case 'xlsx': return xlsxBytes(spec.name || spec.fileName);
    case 'txt': return Buffer.from(`${spec.fileName}\nVCST-5730 shared document library fixture.\n`, 'utf8');
    case 'png': return pngBytes();
    case 'jpg': return jpegBytes();
    case 'opaque': return opaqueBytes(spec.fileName);
    default: throw new Error(`unknown document kind "${spec.kind}" for ${spec.alias}`);
  }
}

/** The POST /api/sales-rep/documents body for a spec + its uploaded file id (pure).
 *  `isPinned` is deliberately absent — the deployed CreateAsync forces it false; pinning is a
 *  separate POST /{id}/pin call, and sending it here would look effective while doing nothing. */
export function buildCreateRequest(spec, fileId) {
  const body = { fileId, category: spec.category, name: spec.name || '' };
  if (spec.summary) body.summary = spec.summary;
  if (spec.pageCount != null) body.pageCount = spec.pageCount;
  if (spec.previewUrl) body.previewUrl = spec.previewUrl;
  return body;
}

/** The display name the deployed build will end up storing (NormalizeName: blank -> file name). */
export function expectedDisplayName(spec) {
  return spec.name && spec.name.trim() ? spec.name.trim() : spec.fileName;
}

/** True when a live document row was created by THIS fixture set (teardown scope). */
export function isSeededDocument(doc) {
  if (!doc) return false;
  return [doc.name, doc.displayName].some((n) => typeof n === 'string' && n.startsWith(SEED_PREFIX));
}

/** Distinct categories the fixture set declares. */
export function declaredCategories() {
  return [...new Set(DOCUMENTS.map((d) => d.category))].sort();
}

/** category -> document count (what GET /documents/categories should report for our rows). */
export function categoryCounts() {
  const out = {};
  for (const d of DOCUMENTS) out[d.category] = (out[d.category] || 0) + 1;
  return out;
}

/** Aliases of the documents that must end up pinned. */
export function pinnedAliases() {
  return DOCUMENTS.filter((d) => d.pinned).map((d) => d.alias);
}

/** Distinct content types actually declared. */
export function declaredContentTypes() {
  return [...new Set(DOCUMENTS.map((d) => d.contentType))].sort();
}

/**
 * For each page size: the boundary rows the fixture count makes reachable.
 * `exact` = a full first page; `plusOne` = at least one row beyond it (so a second page exists).
 */
export function paginationBoundaries(total = DOCUMENTS.length) {
  return PAGE_SIZES.map((size) => ({
    size,
    exact: total >= size,
    plusOne: total >= size + 1,
    pages: Math.ceil(total / size),
  }));
}

/** True when a category string satisfies the deployed validator. */
export function isValidCategory(category) {
  const c = String(category || '');
  if (!c || c.length > CATEGORY_MAX_LENGTH) return false;
  if (c.includes('..')) return false;
  if ([...c].some((ch) => INVALID_CATEGORY_CHARS.includes(ch))) return false;
  return !CONTROL_CHAR_RE.test(c);
}

/** Structural self-check of the spec set (pure). Returns a list of problems; [] means healthy. */
export function validateDocumentSpecs(docs = DOCUMENTS) {
  const problems = [];
  const seen = new Set();
  for (const d of docs) {
    if (seen.has(d.alias)) problems.push(`duplicate alias ${d.alias}`);
    seen.add(d.alias);
    if (!d.fileName.startsWith(SEED_PREFIX)) problems.push(`${d.alias}: file name lacks the ${SEED_PREFIX} sweep prefix`);
    if (d.name && !d.name.startsWith(SEED_PREFIX)) problems.push(`${d.alias}: display name lacks the ${SEED_PREFIX} sweep prefix`);
    if (!isValidCategory(d.category)) problems.push(`${d.alias}: category "${d.category}" violates the deployed validator`);
    if (!d.contentType) problems.push(`${d.alias}: no contentType`);
    if (GUID_RE.test(JSON.stringify(d))) problems.push(`${d.alias}: a runtime GUID leaked into the spec`);
  }
  for (const ct of REQUIRED_CONTENT_TYPES) {
    if (!docs.some((d) => d.contentType === ct)) problems.push(`content-type coverage lost: no document with ${ct}`);
  }
  if (declaredCategories().length < 2) problems.push('fewer than 2 categories — category filtering is untestable');
  if (docs.filter((d) => d.pinned).length < 1) problems.push('no pinned document — pinned-first sort / isPinned filter is untestable');
  for (const b of paginationBoundaries(docs.length)) {
    if (!b.exact) problems.push(`only ${docs.length} documents — cannot fill a page of ${b.size}`);
    if (!b.plusOne) problems.push(`only ${docs.length} documents — no row beyond a page of ${b.size} (page-size + 1 unreachable)`);
  }
  if (!docs.some((d) => d.kind === 'pdf-large')) problems.push('no large document — size rendering is untestable');
  if (!docs.some((d) => NON_ASCII_RE.test(d.fileName) && d.fileName.includes(' '))) {
    problems.push('no unicode-with-spaces file name — encoding of the download path is untestable');
  }
  if (!docs.some((d) => !d.name)) problems.push('no blank-name document — the display-name fallback is untestable');
  return problems;
}
