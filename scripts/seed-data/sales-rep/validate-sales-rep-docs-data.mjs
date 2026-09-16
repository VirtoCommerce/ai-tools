#!/usr/bin/env node
/**
 * validate-sales-rep-docs-data.mjs — STATIC drift guard for the VCST-5730 shared-document-library
 * fixtures. No network, no env writes. Run: npm run td:validate:sales-rep-docs
 *
 * Asserts:
 *  [1] the document spec set is internally healthy (validateDocumentSpecs) — AGENT-TEST- prefixes,
 *      categories legal under the deployed validator, no GUID in the spec;
 *  [2] CONTENT-TYPE / EXTENSION COVERAGE is intact — every REQUIRED_CONTENT_TYPES entry is still
 *      present, extensions are distinct enough to exercise the icon branches, and the unicode +
 *      large + unknown-extension + blank-display-name special cases still exist. Losing one of
 *      these is invisible at run time: the suite still passes, it just stops testing that branch;
 *  [3] the document COUNT still supports BOTH pagination boundaries (page-size and page-size + 1
 *      at every PAGE_SIZES entry) — a fixture deleted "because it looked redundant" silently makes
 *      the paging cases unfalsifiable;
 *  [4] categories >= 2 and pinned >= 1, so category filtering and the pinned-first sort are testable;
 *  [5] the committed reps CSV column contract is exactly DOC_REPS_COLUMNS (order + names);
 *  [6] NO runtime platform GUID anywhere in the committed CSV, and the runtime-id columns
 *      (contact_id / user_id) are EMPTY — ids belong in aliases.<env>.json (.claude/rules/test-data.md);
 *  [7] secret hygiene — every password cell is a {{VAR}} token, never a literal;
 *  [8] rep rows are coherent: unique keys/emails/names, the agent-test-*@example.com sweep
 *      convention, full_name == "first last", served orgs pinned in b2b/organizations.csv, and the
 *      role model holds — role_name is a GRANTING role, extra_role_name is NOT (the module would
 *      strip and re-add a granting extra role on every reseed, so declaring one there is a no-op);
 *  [9] the two reps still form the read/write MATRIX the feature needs: exactly one holding
 *      documents:read and exactly one holding documents:write-without-read;
 * [10] every owned alias is registered in the committed aliases.json with an EMPTY id + its business
 *      key, and carries no GUID (DV-021): rep aliases CSV-backed to sales-rep/document-reps, document
 *      aliases inline with fileName/category/contentType.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOCUMENTS, REQUIRED_CONTENT_TYPES, PAGE_SIZES, SEED_PREFIX, GUID_RE,
  DOC_REPS_COLUMNS, DOC_REPS_RUNTIME_ID_COLUMNS, DOC_REP_KEYS, REP_REQUIRED_ALIAS_FIELDS,
  REP_EMAIL_RE, PASSWORD_TOKEN_RE, PERM_DOCS_READ, PERM_DOCS_WRITE,
  validateDocumentSpecs, paginationBoundaries, declaredCategories, categoryCounts,
  pinnedAliases, declaredContentTypes, expectedPermissions, isGrantingRole, expectedDisplayName,
} from './sales-rep-docs-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPS_CSV = 'test-data/sales-rep/document-reps.csv';
const CSV_KEY = 'sales-rep/document-reps';

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

/** Minimal CSV reader (header row + comma split honouring double quotes). */
function readCsvRaw(rel) {
  const text = readFileSync(join(ROOT, rel), 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
      } else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]);
  const rows = lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i], v])));
  return { header, rows, text };
}

// ---- [1] spec health -------------------------------------------------------
for (const p of validateDocumentSpecs()) fail(`[1] spec: ${p}`);

// ---- [2] content-type / extension / special-case coverage ------------------
const declaredTypes = declaredContentTypes();
for (const ct of REQUIRED_CONTENT_TYPES) {
  if (!declaredTypes.includes(ct)) fail(`[2] content-type coverage lost: ${ct} is no longer declared by any document`);
}
const extensions = DOCUMENTS.map((d) => (d.fileName.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase());
const distinctExt = new Set(extensions);
for (const ext of ['pdf', 'docx', 'xlsx', 'txt', 'png', 'jpg', 'zip']) {
  if (!distinctExt.has(ext)) fail(`[2] extension coverage lost: no .${ext} document (icon / preview branch)`);
}
if (!DOCUMENTS.some((d) => d.kind === 'pdf-large')) fail('[2] no large document — size rendering untestable');
if (!DOCUMENTS.some((d) => !d.name)) fail('[2] no blank-display-name document — the NormalizeName fallback is untestable');
const unicodeDocs = DOCUMENTS.filter((d) => [...d.fileName].some((ch) => ch.codePointAt(0) > 127));
if (unicodeDocs.length === 0) fail('[2] no non-ASCII file name — download path encoding untestable');
else if (!unicodeDocs.some((d) => d.fileName.includes(' '))) fail('[2] the non-ASCII file name has no space — test BOTH in one name');

// ---- [3] pagination boundaries --------------------------------------------
for (const b of paginationBoundaries()) {
  if (!b.exact) fail(`[3] ${DOCUMENTS.length} documents cannot fill a page of ${b.size}`);
  if (!b.plusOne) fail(`[3] ${DOCUMENTS.length} documents leave no row beyond a page of ${b.size} — "page size + 1" unreachable`);
}
notes.push(`${DOCUMENTS.length} documents → pages: ${paginationBoundaries().map((b) => `${b.size}/page = ${b.pages}`).join(', ')} (sizes ${PAGE_SIZES.join(', ')})`);

// ---- [4] categories + pinned ---------------------------------------------
const cats = declaredCategories();
if (cats.length < 2) fail(`[4] only ${cats.length} category — category filtering untestable`);
if (pinnedAliases().length < 1) fail('[4] no pinned document — pinned-first sort / isPinned filter untestable');
notes.push(`categories: ${JSON.stringify(categoryCounts())}; pinned: ${pinnedAliases().join(', ')}`);

// ---- [5] CSV column contract ---------------------------------------------
const { header, rows, text: csvText } = readCsvRaw(REPS_CSV);
if (header.length !== DOC_REPS_COLUMNS.length || header.some((h, i) => h !== DOC_REPS_COLUMNS[i])) {
  fail(`[5] ${REPS_CSV} column contract drifted.\n      expected: ${DOC_REPS_COLUMNS.join(',')}\n      actual:   ${header.join(',')}`);
}

// ---- [6] no runtime GUID in the committed CSV ----------------------------
if (GUID_RE.test(csvText)) fail(`[6] a runtime platform GUID is committed in ${REPS_CSV} — move it to aliases.<env>.json`);
for (const r of rows) {
  for (const col of DOC_REPS_RUNTIME_ID_COLUMNS) {
    if ((r[col] || '').trim() !== '') fail(`[6] ${r.rep_key}: ${col} must be EMPTY in the committed CSV (found "${r[col]}")`);
  }
}

// ---- [7] secret hygiene --------------------------------------------------
for (const r of rows) {
  if (!PASSWORD_TOKEN_RE.test((r.password || '').trim())) {
    fail(`[7] ${r.rep_key}: password must be a {{VAR}} token, never a literal (found "${r.password}")`);
  }
}

// ---- [8] rep row coherence ----------------------------------------------
const seededRows = rows.filter((r) => String(r.seeded).toLowerCase() === 'true');
const orgIds = new Set(readCsvRaw('test-data/b2b/organizations.csv').rows.map((r) => r.org_id));
for (const [field, label] of [['rep_key', 'rep_key'], ['email', 'email'], ['full_name', 'full_name']]) {
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r[field])) fail(`[8] duplicate ${label} "${r[field]}"`);
    seen.add(r[field]);
  }
}
for (const r of seededRows) {
  if (!REP_EMAIL_RE.test(r.email)) fail(`[8] ${r.rep_key}: email "${r.email}" breaks the agent-test-*@example.com sweep convention`);
  if (r.full_name !== `${r.first_name} ${r.last_name}`) {
    fail(`[8] ${r.rep_key}: full_name "${r.full_name}" != "${r.first_name} ${r.last_name}" — the seeder looks reps up BY full name`);
  }
  for (const key of (r.served_orgs || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    if (!orgIds.has(key)) fail(`[8] ${r.rep_key}: served org "${key}" is not pinned in b2b/organizations.csv`);
  }
  if (!r.role_name) fail(`[8] ${r.rep_key}: role_name is required`);
  else if (!isGrantingRole(r.role_name)) {
    fail(`[8] ${r.rep_key}: role_name "${r.role_name}" is NOT a granting role — POST /api/sales-rep would silently substitute one`);
  }
  if (r.extra_role_name && isGrantingRole(r.extra_role_name)) {
    fail(`[8] ${r.rep_key}: extra_role_name "${r.extra_role_name}" is a GRANTING role — the module strips and re-adds those every reseed; declare it as role_name`);
  }
}
for (const key of DOC_REP_KEYS) {
  if (!seededRows.some((r) => r.rep_key === key)) fail(`[8] required rep fixture ${key} is missing or not seeded=true`);
}

// ---- [9] the read/write permission matrix -------------------------------
const withRead = seededRows.filter((r) => expectedPermissions(r).includes(PERM_DOCS_READ));
const writeNoRead = seededRows.filter((r) => {
  const p = expectedPermissions(r);
  return p.includes(PERM_DOCS_WRITE) && !p.includes(PERM_DOCS_READ);
});
if (withRead.length < 1) fail(`[9] no rep holds ${PERM_DOCS_READ} — the happy path has no caller`);
if (writeNoRead.length < 1) {
  fail(`[9] no rep holds ${PERM_DOCS_WRITE} WITHOUT ${PERM_DOCS_READ} — the read-gate disjunction `
    + '(Administrator OR :read OR :write) is unfalsifiable');
}
notes.push(`read-capable: ${withRead.map((r) => r.rep_key).join(', ')}; write-without-read: ${writeNoRead.map((r) => r.rep_key).join(', ')}`);

// ---- [10] alias registration -------------------------------------------
for (const r of seededRows) {
  const a = aliases[r.rep_key];
  if (!a) { fail(`[10] no alias "${r.rep_key}" in the committed aliases.json`); continue; }
  if (a.file !== CSV_KEY) fail(`[10] ${r.rep_key}: alias.file is "${a.file}", expected "${CSV_KEY}"`);
  if (a.filter?.rep_key !== r.rep_key) fail(`[10] ${r.rep_key}: alias filter must select rep_key=${r.rep_key}`);
  for (const f of REP_REQUIRED_ALIAS_FIELDS) {
    if (!a.fields?.[f]) fail(`[10] ${r.rep_key}: alias must declare field "${f}"`);
  }
  if (GUID_RE.test(JSON.stringify(a))) fail(`[10] ${r.rep_key}: a GUID is baked into the committed base alias (DV-021)`);
}
for (const spec of DOCUMENTS) {
  const a = aliases[spec.alias];
  if (!a) { fail(`[10] no alias "${spec.alias}" in the committed aliases.json`); continue; }
  if (!a._inline) fail(`[10] ${spec.alias}: document aliases are inline (_inline: true) — the runtime id comes from the overlay`);
  if (a.id !== '') fail(`[10] ${spec.alias}: alias id must be an EMPTY string in the committed base (found ${JSON.stringify(a.id)}) — the seeded id lives in aliases.<env>.json`);
  if (a.fileName !== spec.fileName) fail(`[10] ${spec.alias}: alias fileName "${a.fileName}" drifted from the spec "${spec.fileName}"`);
  if (a.category !== spec.category) fail(`[10] ${spec.alias}: alias category "${a.category}" drifted from the spec "${spec.category}"`);
  if (a.contentType !== spec.contentType) fail(`[10] ${spec.alias}: alias contentType drifted from the spec`);
  if (a.displayName !== expectedDisplayName(spec)) {
    fail(`[10] ${spec.alias}: alias displayName "${a.displayName}" != the value the deployed build will store "${expectedDisplayName(spec)}"`);
  }
  for (const f of ['id', 'fileName', 'displayName', 'category', 'contentType']) {
    if (!a.fields?.[f]) fail(`[10] ${spec.alias}: alias must declare field "${f}"`);
  }
  if (GUID_RE.test(JSON.stringify(a))) fail(`[10] ${spec.alias}: a GUID is baked into the committed base alias (DV-021)`);
}

// ---- report -------------------------------------------------------------
console.log(`\nvalidate-sales-rep-docs-data — ${DOCUMENTS.length} document(s), ${seededRows.length} rep(s), prefix ${SEED_PREFIX}`);
for (const n of notes) console.log(`  note: ${n}`);
if (problems.length === 0) {
  console.log('  PASS — no drift.\n');
  process.exit(0);
}
console.error(`\n  FAIL — ${problems.length} problem(s):`);
for (const p of problems) console.error(`   - ${p}`);
console.error('');
process.exit(1);
