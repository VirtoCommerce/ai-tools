#!/usr/bin/env node
/**
 * scripts/seed-data/white-labeling/validate-white-labeling-data.mjs — static drift guard for the white-labeling
 * fixtures (npm run td:validate:white-labeling). No network.
 *
 * Fails when a declaration would make its case decide nothing:
 *  - the enabled-but-EMPTY organization (FR-1) fills a branding column, or lacks a maintainer AND an employee
 *    (FWL-003 needs the member, FWL-075 the maintainer — one account cannot be both), or its employee also
 *    belongs to a branded organization (then the fallback would be ambiguous);
 *  - an upload asset (FR-5) is not the format its row claims, is oversized, or two assets share the same
 *    accept/reject pair (the set would stop telling the widgets apart);
 *  - the disposable triple (FR-3) is not a disabled record behind a maintainer, or its aliases / npm scripts drift;
 *  - a runtime value (a GUID, an absolute URL) leaks into a committed white-labeling CSV — image URLs belong to
 *    aliases.<env>.json, read back from the live record by the seeder.
 * Informational: what the current env's overlay carries.
 */
import "../../lib/sync-stdio.mjs";
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  WL_DIR, ORGS_FILE, USERS_FILE, ASSETS_FILE, RECORD_STATES, EMPTY_RECORD_STATE, recordPlan, filledBrandingColumns,
  LIVE_URL_COLUMNS, DISPOSABLE, STORE_WITHOUT_WL_ALIAS, ASSET_EXT, ASSET_MAX_BYTES, magicMatches,
} from './white-labeling-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const csv = (p) => parse(read(p), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
const aliases = JSON.parse(read('test-data/aliases.json'));
const scripts = JSON.parse(read('package.json')).scripts || {};
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const section = (name, list) => { if (list.length) list.forEach((p) => { problems.push(`${name}: ${p}`); console.log(`  ✗ ${name}: ${p}`); }); else ok(name); };
const truthy = (v) => /^true$/i.test(String(v || '').trim());

console.log('=== validate white-labeling fixtures (static drift guard) ===');
const orgs = csv(`${WL_DIR}/organizations.csv`);
const users = csv(`${WL_DIR}/users.csv`);
const assets = csv(`${WL_DIR}/test-assets.csv`);
const orgById = new Map(orgs.map((r) => [r.org_id, r]));
const roleList = (u) => String(u.roles || '').split(';').map((s) => s.trim());
const orgList = (u) => String(u.org_id || '').split(';').map((s) => s.trim()).filter(Boolean);

// 1. Organizations: prefix, record_state vocabulary, alias row ↔ alias declaration
section('organizations: AGENT-TEST- names, known record_state, alias declared per row', orgs.flatMap((r) => [
  ...(!String(r.org_name).startsWith('AGENT-TEST-') ? [`${r.org_id} "${r.org_name}" lacks the AGENT-TEST- prefix (teardown would not sweep it)`] : []),
  ...(!RECORD_STATES.includes(String(r.record_state || '').trim()) ? [`${r.org_id} record_state "${r.record_state}" is not one of ${RECORD_STATES.map((s) => `"${s}"`).join(', ')}`] : []),
  ...(r.alias_name && aliases[r.alias_name]?.filter?.org_id !== r.org_id ? [`${r.org_id}: alias ${r.alias_name} is not declared over this row`] : []),
]));

// 2. FR-1 / FR-2: the enabled-but-empty organization and its two accounts
const emptyOrgs = orgs.filter((r) => recordPlan(r)?.kind === 'empty');
section('FR-1/FR-2: enabled-but-empty organization is decidable', [
  ...(!emptyOrgs.length ? [`no organization declares record_state=${EMPTY_RECORD_STATE}`] : []),
  ...emptyOrgs.flatMap((o) => {
    const filled = filledBrandingColumns(o);
    const members = users.filter((u) => orgList(u).includes(o.org_id));
    const of = (role) => members.filter((u) => roleList(u)[orgList(u).indexOf(o.org_id)] === role && /^approved$/i.test(u.status) && /^approved$/i.test(u.membership_status || ''));
    const employees = of('Organization employee');
    const maintainers = of('Organization maintainer');
    const brandedElsewhere = employees.filter((u) => orgList(u).some((id) => id !== o.org_id && recordPlan(orgById.get(id) || {})));
    return [
      ...(filled.length ? [`${o.org_id} fills ${filled.join(', ')} — an empty record must carry nothing, or the store fallback is not what is observed`] : []),
      ...(!employees.length ? [`${o.org_id} has no Approved Organization employee (FWL-003's member)`] : []),
      ...(!maintainers.length ? [`${o.org_id} has no Approved Organization maintainer (FWL-075's no-own-logo maintainer)`] : []),
      ...(employees.some((e) => maintainers.includes(e)) ? [`${o.org_id}: one account is both employee and maintainer — the two cases need two personas`] : []),
      ...brandedElsewhere.map((u) => `${u.user_id} also belongs to a branded organization — which branding it sees would not prove the fallback`),
    ];
  }),
]);

// 3. Personas: every users.csv alias declared over its row, password is a {{VAR}} token
section('users: personas declared, password is a {{VAR}} token', users.flatMap((u) => [
  ...(u.alias_name && aliases[u.alias_name]?.filter?.user_id !== u.user_id ? [`${u.user_id}: alias ${u.alias_name} is not declared over this row`] : []),
  ...(u.alias_name && aliases[u.alias_name] && !(aliases[u.alias_name].fields?.email && aliases[u.alias_name].fields?.password) ? [`${u.alias_name} lacks .email/.password — [PRE:SIGNIN_AS] cannot resolve it`] : []),
  ...(!/^\{\{\s*[A-Z0-9_]+\s*\}\}$/.test(u.password || '') ? [`${u.user_id} password is not a {{VAR}} token`] : []),
]));

// 4. No runtime value in a committed white-labeling CSV (GUIDs, absolute URLs; image URLs → overlay)
const leaks = [];
for (const [name, rows] of [['organizations.csv', orgs], ['users.csv', users], ['test-assets.csv', assets]]) {
  for (const r of rows) for (const [col, v] of Object.entries(r)) {
    if (String(v).match(GUID_RE)) leaks.push(`${name} ${Object.values(r)[0]}.${col} carries a GUID`);
    if (/^https?:\/\//i.test(String(v))) leaks.push(`${name} ${Object.values(r)[0]}.${col} carries an absolute URL`);
  }
}
for (const r of orgs) for (const col of Object.keys(LIVE_URL_COLUMNS)) if (String(r[col] || '').trim()) leaks.push(`organizations.csv ${r.org_id}.${col} is set — live image URLs come from the record via aliases.<env>.json`);
section('no runtime value in the committed white-labeling CSVs', leaks);

// 5. FR-5: upload assets — real format, small, discriminating
const pairs = new Map();
section('FR-5: upload assets are what they claim and tell the widgets apart', [
  ...(!assets.length ? ['test-assets.csv has no rows'] : []),
  ...assets.flatMap((a) => {
    const rel = `test-data/${a.file}`;
    if (!existsSync(join(ROOT, rel))) return [`${a.asset_id}: ${rel} is missing`];
    const bytes = readFileSync(join(ROOT, rel));
    const size = statSync(join(ROOT, rel)).size;
    const key = `${truthy(a.admin_logo_allowed)}/${truthy(a.admin_favicon_allowed)}`;
    const dup = pairs.get(key); pairs.set(key, a.asset_id);
    return [
      ...(!(ASSET_EXT[a.format] || []).includes(extname(a.file).toLowerCase()) ? [`${a.asset_id}: extension ${extname(a.file)} does not match format ${a.format}`] : []),
      ...(!magicMatches(a.format, bytes) ? [`${a.asset_id}: ${rel} is not a ${a.format} file (magic bytes)`] : []),
      ...(size > ASSET_MAX_BYTES ? [`${a.asset_id}: ${size} bytes > ${ASSET_MAX_BYTES}`] : []),
      ...(dup ? [`${a.asset_id} has the same logo/favicon accept pair (${key}) as ${dup} — the set no longer separates the widgets`] : []),
      ...(a.alias_name && aliases[a.alias_name]?.filter?.asset_id !== a.asset_id ? [`${a.asset_id}: alias ${a.alias_name} is not declared over this row`] : []),
    ];
  }),
]);

// 6. FR-3: the disposable triple — a DISABLED record behind a maintainer; aliases + scripts wired
const da = DISPOSABLE.aliases;
section('FR-3: disposable triple declared', [
  ...(DISPOSABLE.recordIsEnabled !== false ? ['the disposable record must be DISABLED (FWL-077 tests a disabled record)'] : []),
  ...(DISPOSABLE.role !== 'Organization maintainer' ? ['the disposable account must be an Organization maintainer (only a maintainer may change the logo)'] : []),
  ...(!DISPOSABLE.orgPrefix.startsWith('AGENT-TEST-') ? ['disposable org prefix lacks AGENT-TEST-'] : []),
  ...[da.org, da.maintainer].filter((n) => !aliases[n]?._inline).map((n) => `${n} is not declared inline in aliases.json`),
  ...(aliases[da.maintainer] && !(aliases[da.maintainer].fields?.email && aliases[da.maintainer].fields?.password) ? [`${da.maintainer} lacks .email/.password`] : []),
  ...(aliases[da.maintainer] && aliases[da.maintainer].password !== DISPOSABLE.password ? [`${da.maintainer}.password differs from the seeder's ${DISPOSABLE.password}`] : []),
  ...[da.org, da.maintainer].flatMap((n) => String(JSON.stringify(aliases[n] || {})).match(GUID_RE) || []).map((g) => `GUID ${g} committed in a disposable base alias`),
  ...[DISPOSABLE.seed, `${DISPOSABLE.seed}:teardown`].filter((s) => !scripts[s]).map((s) => `npm script ${s} missing`),
]);

// 7. FR-4: store without white labeling — a discovered alias, never a committed id
section('FR-4: STORE_WITHOUT_WL is discovered, not committed', [
  ...(!aliases[STORE_WITHOUT_WL_ALIAS]?._inline ? [`${STORE_WITHOUT_WL_ALIAS} is not declared inline`] : []),
  ...(aliases[STORE_WITHOUT_WL_ALIAS]?.id ? [`${STORE_WITHOUT_WL_ALIAS}.id is committed in aliases.json — it is per env (aliases.<env>.json)`] : []),
  ...(aliases[STORE_WITHOUT_WL_ALIAS]?.seed && !scripts[aliases[STORE_WITHOUT_WL_ALIAS].seed] ? [`seed script ${aliases[STORE_WITHOUT_WL_ALIAS].seed} missing`] : []),
]);

// 8. Informational: the current env's overlay
const env = process.env.TEST_ENV || 'vcst';
const ovPath = join(ROOT, `test-data/aliases.${env}.json`);
if (existsSync(ovPath)) {
  const ov = JSON.parse(readFileSync(ovPath, 'utf8'));
  const missing = [...orgs, ...users].filter((r) => r.alias_name && !ov[`${r.alias_name}_PLATFORM_ID`]?.id).map((r) => r.alias_name);
  info(`${env}: ${missing.length ? `no _PLATFORM_ID yet for ${missing.join(', ')} — run TEST_ENV=${env} npm run seed:white-labeling` : 'every organization and persona has its _PLATFORM_ID'}`);
  info(`${env}: ${STORE_WITHOUT_WL_ALIAS} = ${ov[STORE_WITHOUT_WL_ALIAS]?.id || '(not discovered)'}; disposable ${ov[da.org]?.name ? `armed (${ov[da.org].name})` : 'not armed'}`);
  const withLogo = Object.entries(aliases).filter(([, d]) => d?.file === ORGS_FILE && d.fields?.logo).map(([n]) => n);
  const stale = withLogo.filter((n) => !/^https?:\/\//.test(ov[n]?.logo || ''));
  if (stale.length) info(`${env}: no live logo URL in the overlay for ${stale.join(', ')} — the seed writes it`);
}

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
