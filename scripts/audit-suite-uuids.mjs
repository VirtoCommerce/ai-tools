#!/usr/bin/env node
/**
 * Extract every UUID from regression/suites/**\/*.csv, deduplicate, and probe each
 * against vcst-qa to determine if it still resolves. Outputs JSON to
 * tests/reseed-2026-05-18/suite-uuid-audit.json + a human summary.
 *
 * Read-only. Safe to re-run.
 *
 * Strategy:
 *  1. Walk regression/suites/ recursively (excluding _legacy/)
 *  2. For each .csv file, extract UUID-shaped strings (both 36-char dashed and 32-char un-dashed)
 *  3. Dedupe across files; keep file+line index per UUID
 *  4. For each unique UUID, probe in this order until one returns:
 *       a. /api/members/{id}                      → org/contact
 *       b. /api/catalog/products/{id}             → product
 *       c. /api/catalog/categories/{id}           → category
 *       d. /api/catalog/products/configurations/{id} → configuration
 *       e. /api/platform/security/users/{id}      → user (by ID, not username)
 *     Record entity type + name for alive UUIDs; mark "unknown" for the rest.
 *  5. Write JSON report + markdown summary.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { config } from 'dotenv';
config();

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SUITES = 'regression/suites';
const OUT_JSON = 'tests/reseed-2026-05-18/suite-uuid-audit.json';
const OUT_MD = 'tests/reseed-2026-05-18/suite-uuid-audit.md';

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{32}\b/gi;

function walkCsv(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_legacy')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walkCsv(p, acc);
    else if (name.endsWith('.csv')) acc.push(p);
  }
  return acc;
}

const files = walkCsv(SUITES);
console.log(`Scanning ${files.length} suite CSVs...`);

// Map<uuid, {refs: [{file, line}], isCompactForm}>
const found = new Map();
for (const f of files) {
  const text = readFileSync(f, 'utf-8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].matchAll(UUID_RE);
    for (const m of matches) {
      const id = m[0].toLowerCase();
      if (!found.has(id)) found.set(id, { refs: [], isCompactForm: !id.includes('-') });
      found.get(id).refs.push({ file: relative('.', f).replace(/\\/g, '/'), line: i + 1 });
    }
  }
}

console.log(`Found ${found.size} unique UUID-shaped strings across ${files.length} files`);

async function auth() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  return (await res.json()).access_token;
}

const token = await auth();
const headers = { 'Authorization': `Bearer ${token}` };

async function probe(id) {
  // Try multiple endpoints to identify what this UUID is
  const candidates = [
    { type: 'member', path: `/api/members/${id}`, nameField: 'name' },
    { type: 'product', path: `/api/catalog/products/${id}`, nameField: 'name' },
    { type: 'category', path: `/api/catalog/categories/${id}`, nameField: 'name' },
    { type: 'configuration', path: `/api/catalog/products/configurations/${id}`, nameField: 'name' },
    { type: 'user', path: `/api/platform/security/users/${id}`, nameField: 'userName' },
    { type: 'role', path: `/api/platform/security/roles/${id}`, nameField: 'name' },
  ];
  for (const c of candidates) {
    try {
      const r = await fetch(`${BACK_URL}${c.path}`, { headers });
      if (r.ok) {
        const j = await r.json();
        if (j && (j.id || j[c.nameField])) {
          return { alive: true, type: c.type, name: j[c.nameField] || j.name || null };
        }
      }
    } catch {}
  }
  return { alive: false };
}

let alive = 0, dead = 0, done = 0;
const total = found.size;
const startTime = Date.now();

for (const [id, info] of found.entries()) {
  const result = await probe(id);
  info.alive = result.alive;
  info.type = result.type;
  info.name = result.name;
  done++;
  if (result.alive) alive++; else dead++;
  if (done % 10 === 0 || done === total) {
    const eta = Math.round((Date.now() - startTime) / done * (total - done) / 1000);
    process.stdout.write(`\r  probed ${done}/${total} (alive=${alive} dead=${dead}, ETA ${eta}s)   `);
  }
}
console.log();

// Build report
mkdirSync('tests/reseed-2026-05-18', { recursive: true });
const report = { date: '2026-05-18', total: found.size, alive, dead, byFile: {}, byType: {}, dead_ids: [], alive_ids: [] };

for (const [id, info] of found.entries()) {
  const entry = { id, alive: info.alive, type: info.type, name: info.name, refs: info.refs };
  if (info.alive) {
    report.alive_ids.push(entry);
    report.byType[info.type] = (report.byType[info.type] || 0) + 1;
  } else {
    report.dead_ids.push(entry);
  }
  for (const ref of info.refs) {
    if (!report.byFile[ref.file]) report.byFile[ref.file] = { alive: 0, dead: 0 };
    if (info.alive) report.byFile[ref.file].alive++; else report.byFile[ref.file].dead++;
  }
}

writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

// Markdown summary
let md = `# Suite UUID Audit — 2026-05-18\n\n`;
md += `**Total UUIDs:** ${report.total} (alive ${report.alive} / dead ${report.dead})\n\n`;
md += `## By entity type\n\n| Type | Count |\n|---|---|\n`;
for (const [t, c] of Object.entries(report.byType).sort((a,b)=>b[1]-a[1])) md += `| ${t} | ${c} |\n`;
md += `\n## Per file\n\n| File | Alive | Dead | Total |\n|---|---:|---:|---:|\n`;
for (const [f, c] of Object.entries(report.byFile).sort((a,b)=>b[1].dead-a[1].dead)) {
  md += `| \`${f}\` | ${c.alive} | ${c.dead} | ${c.alive+c.dead} |\n`;
}
md += `\n## Dead UUIDs (first 50)\n\n| UUID | First reference |\n|---|---|\n`;
for (const e of report.dead_ids.slice(0, 50)) {
  md += `| \`${e.id}\` | \`${e.refs[0].file}:${e.refs[0].line}\` |\n`;
}
md += `\n## Alive UUIDs by type — first 30\n\n| UUID | Type | Name |\n|---|---|---|\n`;
for (const e of report.alive_ids.slice(0, 30)) {
  md += `| \`${e.id}\` | ${e.type} | ${(e.name || '').slice(0,60)} |\n`;
}
writeFileSync(OUT_MD, md);

console.log(`\nReport: ${OUT_JSON} + ${OUT_MD}`);
console.log(`Summary: ${alive}/${found.size} alive (${Math.round(alive/found.size*100)}%), ${dead} dead`);
