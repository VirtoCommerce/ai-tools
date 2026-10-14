#!/usr/bin/env node
/**
 * validate-category-images-data.mjs — STATIC drift guard for `test-data/catalogs/category-images.csv`
 * (no network). Wired as `td:validate:category-images`.
 *
 * Fails when the mapping cannot be seeded as written: a missing column, an empty cell, an image file
 * absent from `test-data/uploads/categories images/`, an unsupported extension, the same file or the
 * same category name mapped twice (the seeder would then overwrite one row's image with another's), or
 * a GUID in the CSV (categories are resolved by NAME per env — a committed id is another env's id).
 * Exit 1 on any violation.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { CSV_PATH, IMAGE_DIR, rowProblems } from './category-images-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/i;

console.log('=== validate category images (static drift guard) ===');
const text = readFileSync(join(ROOT, CSV_PATH), 'utf8');
const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
const header = Object.keys(rows[0] || {});
const problems = rowProblems(rows, header, (f) => existsSync(join(ROOT, IMAGE_DIR, f)));
if (GUID_RE.test(text)) problems.push(`${CSV_PATH} contains a GUID — categories are resolved by name, never by a committed id`);

if (problems.length) { problems.forEach((p) => console.log(`  ✗ ${p}`)); process.exit(1); }
console.log(`  ✓ ${rows.length} rows: columns, files, extensions, uniqueness, no GUID`);
