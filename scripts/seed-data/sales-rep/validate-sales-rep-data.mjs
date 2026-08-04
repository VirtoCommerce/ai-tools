#!/usr/bin/env node
/**
 * validate-sales-rep-data.mjs — STATIC drift guard for the Sales Rep REP fixtures
 * (test-data/sales-rep/sales-reps.csv + their @td aliases). No network, no env writes.
 * Run: npm run td:validate:sales-rep
 *
 * Asserts:
 *  [1] the CSV column contract is exactly SALES_REPS_COLUMNS (order + names) — the seeder and every
 *      @td alias map columns positionally-by-name, so a silent rename/insert breaks resolution;
 *  [2] NO runtime platform GUID anywhere in the committed CSV, and the three runtime-id columns
 *      (contact_id/user_id/membership_locked_id) are EMPTY (.claude/rules/test-data.md — ids belong
 *      in aliases.<env>.json, never in a shared committed fixture);
 *  [3] secret hygiene — no password column, no password literal in any cell;
 *  [4] every seeded rep has a CSV-backed alias in the committed aliases.json wired to
 *      sales-rep/sales-reps + filter rep_key, declaring at least id/user_id/email, and the committed
 *      BASE alias carries no GUID (DV-021);
 *  [5] rep rows are internally coherent: unique rep_key/email/full_name, AGENT-TEST- email convention,
 *      full_name == "first last", every served org key pinned in b2b/organizations.csv,
 *      lock_membership_org (when set) is one of the rep's own served orgs;
 *  [6] the VCST-5367 saved-layout fixture is intact: SR_REP_LAYOUT exists + is seeded, matches the
 *      spec's email/store, serves >= MIN_SERVED_ORGS_FOR_LAYOUT DISTINCT orgs, and is the ONLY
 *      disposable-layout rep — SR_REP_PRIMARY must never be on that allowlist (its never-saved null
 *      baseline is shared by ~40 cases in 050m/089/091/093);
 *  [7] the layout preference-name model has not drifted (SalesRepLayout.{scope}[.{storeId}] and the
 *      prefix matcher the seeder sweeps with).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAYOUT_REP, MIN_SERVED_ORGS_FOR_LAYOUT, DISPOSABLE_LAYOUT_REP_KEYS, isDisposableLayoutRep,
  LAYOUT_PREF_PREFIX, LAYOUT_SCOPES, layoutPreferenceName, isLayoutPreference,
  parseServedOrgs, SALES_REPS_COLUMNS, RUNTIME_ID_COLUMNS, GUID_RE, REP_EMAIL_RE,
  REQUIRED_ALIAS_FIELDS,
} from './sales-rep-layout-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

/** Minimal CSV reader (header row + comma split honoring double quotes). */
function readCsvRaw(rel) {
  const text = readFileSync(join(ROOT, rel), 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    const out = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const header = split(lines[0]);
  const rows = lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i], v])));
  return { header, rows };
}

const CSV_REL = 'test-data/sales-rep/sales-reps.csv';
const { header, rows } = readCsvRaw(CSV_REL);

// [1] column contract
if (header.join(',') !== SALES_REPS_COLUMNS.join(',')) {
  fail(`${CSV_REL} column contract drifted.\n      expected: ${SALES_REPS_COLUMNS.join(',')}\n      actual:   ${header.join(',')}`);
}

// [2] no runtime GUID in the committed CSV; runtime-id columns empty
for (const r of rows) {
  for (const [col, val] of Object.entries(r)) {
    if (typeof val === 'string' && GUID_RE.test(val.trim())) {
      fail(`${CSV_REL} row ${r.rep_key}: column ${col} carries a runtime platform GUID — it belongs in aliases.<env>.json`);
    }
  }
  for (const col of RUNTIME_ID_COLUMNS) {
    if ((r[col] || '').trim() !== '') fail(`${CSV_REL} row ${r.rep_key}: ${col} must be EMPTY in the committed CSV (got "${r[col]}")`);
  }
}

// [3] secret hygiene
if (header.some((h) => /password|secret|token/i.test(h))) {
  fail(`${CSV_REL} must not declare a credential column (found: ${header.filter((h) => /password|secret|token/i.test(h)).join(', ')}) — reps authenticate with SR_REP_PASSWORD from .env.local`);
}
for (const r of rows) {
  for (const [col, val] of Object.entries(r)) {
    if (typeof val === 'string' && /\bPassword\d\S*/i.test(val) && !/\{\{[A-Z0-9_]+\}\}/.test(val)) {
      fail(`${CSV_REL} row ${r.rep_key}: column ${col} looks like a password literal ("${val.slice(0, 40)}") — use a {{VAR}} token`);
    }
  }
}

// [4] alias registration for every seeded rep
const seeded = rows.filter((r) => /^(true|yes|y|1)$/i.test((r.seeded || '').trim()));
for (const r of rows) {
  const entries = Object.entries(aliases).filter(([, def]) => def && def.file === 'sales-rep/sales-reps' && def.filter?.rep_key === r.rep_key);
  if (entries.length === 0) {
    if (seeded.includes(r)) fail(`rep ${r.rep_key} is seeded=true but has NO CSV-backed alias in test-data/aliases.json — no case can reference it`);
    continue;
  }
  if (entries.length > 1) fail(`rep ${r.rep_key} has ${entries.length} aliases (${entries.map(([n]) => n).join(', ')}) — one alias per row`);
  for (const [name, def] of entries) {
    for (const [field, col] of Object.entries(REQUIRED_ALIAS_FIELDS)) {
      if (def.fields?.[field] !== col) fail(`alias ${name}.fields.${field} must map to "${col}" (got "${def.fields?.[field]}")`);
    }
    for (const [k, v] of Object.entries(def)) {
      if (typeof v === 'string' && GUID_RE.test(v.trim())) {
        fail(`alias ${name}.${k} carries a runtime platform GUID in the COMMITTED aliases.json — it belongs in aliases.<env>.json (DV-021)`);
      }
    }
  }
}

// [5] row coherence
const orgs = Object.fromEntries(readCsvRaw('test-data/b2b/organizations.csv').rows.map((r) => [r.org_id, r]));
for (const field of ['rep_key', 'email', 'full_name']) {
  const seen = new Map();
  for (const r of rows) {
    const key = (r[field] || '').toLowerCase();
    if (seen.has(key)) fail(`duplicate ${field} "${r[field]}" (${seen.get(key)} and ${r.rep_key})`);
    else seen.set(key, r.rep_key);
  }
}
for (const r of rows) {
  if (!REP_EMAIL_RE.test(r.email || '')) fail(`rep ${r.rep_key}: email "${r.email}" breaks the agent-test-*@example.com sweep convention (/qa-seed-data teardown matches on it)`);
  const composed = `${r.first_name} ${r.last_name}`.trim();
  if ((r.full_name || '').trim() !== composed) fail(`rep ${r.rep_key}: full_name "${r.full_name}" != "${composed}" — the seeder looks the rep up BY full_name`);
  const { orgKeys, pagingCount } = parseServedOrgs(r.served_orgs);
  for (const key of orgKeys) {
    const o = orgs[key];
    if (!o) { fail(`rep ${r.rep_key}: served org ${key} not found in test-data/b2b/organizations.csv`); continue; }
    if (!o.platform_id) fail(`rep ${r.rep_key}: served org ${key} has no pinned platform_id — the membership cannot resolve`);
  }
  if (pagingCount && orgKeys.length) fail(`rep ${r.rep_key}: served_orgs mixes PAGING:N with explicit org keys`);
  const lockOrg = (r.lock_membership_org || '').trim();
  if (lockOrg && !orgKeys.includes(lockOrg)) fail(`rep ${r.rep_key}: lock_membership_org ${lockOrg} is not one of its served orgs (${orgKeys.join(';') || 'none'})`);
}

// [6] the VCST-5367 saved-layout fixture
const layoutRow = rows.find((r) => r.rep_key === LAYOUT_REP.repKey);
if (!layoutRow) {
  fail(`the disposable-layout rep ${LAYOUT_REP.repKey} is missing from ${CSV_REL} — VCST-5367 layout cases would have to write SR_REP_PRIMARY's preference`);
} else {
  if (!seeded.includes(layoutRow)) fail(`${LAYOUT_REP.repKey} must be seeded=true (a layout case needs a live, loginable rep)`);
  if (layoutRow.email !== LAYOUT_REP.email) fail(`${LAYOUT_REP.repKey}: email "${layoutRow.email}" != spec "${LAYOUT_REP.email}"`);
  if (layoutRow.store !== LAYOUT_REP.store) fail(`${LAYOUT_REP.repKey}: store "${layoutRow.store}" != spec "${LAYOUT_REP.store}" (the scoped sales-rep grant needs storeId=${LAYOUT_REP.store})`);
  if (csvBoolish(layoutRow.is_locked)) fail(`${LAYOUT_REP.repKey}: is_locked must be false — a blocked account cannot sign in to save a layout`);
  if ((layoutRow.lock_membership_org || '').trim()) fail(`${LAYOUT_REP.repKey}: lock_membership_org must be empty — a locked membership hides the customer the layout case opens`);
  const served = parseServedOrgs(layoutRow.served_orgs).orgKeys;
  const distinct = new Set(served);
  if (distinct.size < MIN_SERVED_ORGS_FOR_LAYOUT) {
    fail(`${LAYOUT_REP.repKey} serves ${distinct.size} distinct org(s) but needs >= ${MIN_SERVED_ORGS_FOR_LAYOUT}: the customerProfile scope needs a customer to open AND the scope-wide (not per-customer) case needs a second one`);
  }
  const specServed = new Set(LAYOUT_REP.servedOrgKeys);
  for (const k of specServed) if (!distinct.has(k)) fail(`${LAYOUT_REP.repKey}: spec expects served org ${k}, CSV has [${served.join(';')}]`);
  notes.push(`${LAYOUT_REP.repKey} (${layoutRow.email}) serves ${distinct.size} org(s): ${[...distinct].map((k) => `${k}/${orgs[k]?.org_name || '?'}`).join(', ')}`);
}
if (DISPOSABLE_LAYOUT_REP_KEYS.length !== 1 || DISPOSABLE_LAYOUT_REP_KEYS[0] !== LAYOUT_REP.repKey) {
  fail(`DISPOSABLE_LAYOUT_REP_KEYS must stay the single-element allowlist [${LAYOUT_REP.repKey}] (got [${DISPOSABLE_LAYOUT_REP_KEYS.join(', ')}])`);
}
for (const shared of ['SR_REP_PRIMARY', 'SR_REP_ACME2', 'SR_REP_LOCKED', 'SR_REP_BLOCKED', 'SR_REP_EXCLUSIVE_TECHFLOW', 'SR_REP_NOCUSTOMERS', 'SR_REP_PAGING', 'SR_REP_SECOND_STORE']) {
  if (isDisposableLayoutRep(shared)) fail(`${shared} must NOT be treated as a disposable-layout rep — the seeder would wipe a layout other suites depend on (SR_REP_PRIMARY's null baseline backs ~40 cases)`);
}

// [7] preference-name model
if (layoutPreferenceName('dashboard') !== `${LAYOUT_PREF_PREFIX}.dashboard`) fail(`layoutPreferenceName drifted: ${layoutPreferenceName('dashboard')}`);
if (layoutPreferenceName('dashboard', 'B2B-store') !== `${LAYOUT_PREF_PREFIX}.dashboard.B2B-store`) fail(`store-scoped layoutPreferenceName drifted: ${layoutPreferenceName('dashboard', 'B2B-store')}`);
for (const scope of LAYOUT_SCOPES) {
  if (!isLayoutPreference(layoutPreferenceName(scope))) fail(`isLayoutPreference does not match its own key for scope ${scope}`);
  if (!isLayoutPreference(layoutPreferenceName(scope, 'B2B-store'))) fail(`isLayoutPreference does not match the store-scoped key for scope ${scope}`);
}
for (const foreign of ['SalesRepLayoutOther', 'Layout.dashboard', 'PersistedGridState', '']) {
  if (isLayoutPreference(foreign)) fail(`isLayoutPreference must NOT match "${foreign}" — teardown would delete an unrelated CustomerPreference`);
}

function csvBoolish(v) { return /^(true|yes|y|1)$/i.test(String(v || '').trim()); }

// ---- report ----------------------------------------------------------------
console.log('sales-rep rep fixtures — static drift guard');
for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`  OK — ${rows.length} rep row(s) (${seeded.length} seeded), column contract intact, no GUID/secret leak, ${LAYOUT_SCOPES.length} layout scope(s), disposable-layout allowlist = [${DISPOSABLE_LAYOUT_REP_KEYS.join(', ')}].`);
