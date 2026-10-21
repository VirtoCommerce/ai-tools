#!/usr/bin/env node
/**
 * validate-brands-data.mjs — STATIC drift guard for `test-data/catalogs/brands.csv` (no network).
 * Wired as `td:validate:brands`.
 *
 * Fails when the brand list cannot be seeded as written: a missing column, an empty cell, a brand
 * code that is not a valid slug, a non-boolean `featured`, markup in a description, a logo/banner
 * absent from `test-data/uploads/brands/` or with an unsupported extension, a code / name / file used
 * twice, or a GUID in the CSV (brands are resolved by name per env — a committed id is another env's id).
 * Exit 1 on any violation.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { CSV_PATH, IMAGE_DIR, rowProblems } from './brands-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/i;

console.log('=== validate brands (static drift guard) ===');
const text = readFileSync(join(ROOT, CSV_PATH), 'utf8');
const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
const header = Object.keys(rows[0] || {});
const problems = rowProblems(rows, header, (f) => existsSync(join(ROOT, IMAGE_DIR, f)));
if (GUID_RE.test(text)) problems.push(`${CSV_PATH} contains a GUID — brands are resolved by name, never by a committed id`);

if (problems.length) { problems.forEach((p) => console.log(`  ✗ ${p}`)); process.exit(1); }
console.log(`  ✓ ${rows.length} brands (${rows.filter((r) => /^true$/i.test(r.featured)).length} featured): columns, slugs, files, uniqueness, no GUID`);
