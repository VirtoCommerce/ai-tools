#!/usr/bin/env node
/**
 * validate-punchout-data.mjs — static drift guard for the VCST-5886 Punchout fixtures
 * (`npm run td:validate:punchout`). No network.
 *
 *  [1] alias registry   every alias in punchout-specs.mjs is registered in aliases.json, inline, with
 *                       the spec's business fields (externalId / email / role / permissions / tokens)
 *  [2] secret hygiene   every sharedSecret / password field is a bare {{VAR}} token; NO actual
 *                       PUNCHOUT_SHARED_SECRET_* value from .env.local appears in any committed
 *                       test-data alias file or punchout script
 *  [3] no GUID leak     base aliases.json carries no runtime GUID for these aliases
 *  [4] role boundary    each role holds its mustHave, none of its mustNotHave; reader and no-punchout
 *                       DIFFER by exactly punchout:read (else BSC-2 vs BSC-3 is undecidable)
 *  [5] config divergence per deployed env: config 0 vs 1 differ on store, both checks and both
 *                       lifetimes; 2 = nonexistent store; 3 = no store; four distinct secret vars
 *  [6] secret divergence the four secret VALUES of each env in .env.local are pairwise distinct (a
 *                       shared secret would make "each secret selects its own configuration" vacuous)
 *  [8] probe/permission predictions  every VERIFY_PROBE's expected cXML code is RE-DERIVED from the
 *                       deployed config + mapping specs (check order: StoreId present → sender domain →
 *                       return URL → mapping → store exists); every account's expected REST status is
 *                       re-derived from its permissions; the protected set is exactly the not-owned specs
 *  [7] overlay coherence for a seeded env, the overlay's config facts equal configOverlayFields(),
 *                       ids are GUIDs, and the multi-org persona has two DIFFERENT org ids
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import {
  CONFIG_SPECS, DEPLOYED_CONFIGS, configOverlayFields, MAPPING_SPECS, PROTECTED_EXTERNAL_IDS,
  BACKOFFICE_SPECS, SEED_PREFIX, secretToken, VERIFY_PROBES,
} from './punchout-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TOKEN_RE = /^\{\{\s*[A-Z0-9_]+\s*\}\}$/;
const problems = []; const notes = [];
const fail = (m) => problems.push(m);
const note = (m) => notes.push(m);
const section = (n, t) => console.log(`\n[${n}] ${t}`);
const done = (before) => console.log(problems.length === before ? '  ✓ ok' : `  ✗ ${problems.length - before} problem(s)`);

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));

// [1]
let b = problems.length; section(1, 'alias registry');
for (const c of CONFIG_SPECS) {
  const a = aliases[c.alias];
  if (!a) { fail(`${c.alias} not registered in aliases.json`); continue; }
  if (!a._inline) fail(`${c.alias} must be _inline`);
  if (a.sharedSecret !== secretToken(c)) fail(`${c.alias}.sharedSecret must be ${secretToken(c)}`);
  if (a.sharedSecret_var !== c.secretVar) fail(`${c.alias}.sharedSecret_var must be ${c.secretVar}`);
  if (a.index !== c.index) fail(`${c.alias}.index must be ${c.index}`);
  for (const f of ['storeId', 'senderDomain', 'allowedReturnUrl', 'tokenLifetime', 'sessionLifetime']) {
    if (a[f] !== '') fail(`${c.alias}.${f} must be "" in the base registry (env-specific; overlay supplies it)`);
  }
}
for (const m of MAPPING_SPECS) {
  const a = aliases[m.alias];
  if (!a) { fail(`${m.alias} not registered`); continue; }
  if (a.externalId !== m.externalId) fail(`${m.alias}.externalId ${a.externalId} ≠ spec ${m.externalId}`);
  if (a.persona_email_var !== m.personaEmailVar) fail(`${m.alias}.persona_email_var ≠ ${m.personaEmailVar}`);
  if (a.owned_by_seeder !== m.owned) fail(`${m.alias}.owned_by_seeder ≠ ${m.owned}`);
  if (!m.externalId.startsWith(SEED_PREFIX)) fail(`${m.alias}: externalId lacks ${SEED_PREFIX}`);
}
if (new Set(MAPPING_SPECS.map((m) => m.externalId)).size !== MAPPING_SPECS.length) fail('mapping externalIds are not unique (DB index is unique)');
if ([...PROTECTED_EXTERNAL_IDS].some((x) => MAPPING_SPECS.find((m) => m.externalId === x)?.owned)) fail('a protected externalId is marked owned');
for (const s of BACKOFFICE_SPECS) {
  const a = aliases[s.alias];
  if (!a) { fail(`${s.alias} not registered`); continue; }
  if (a.email !== s.email || a.login !== s.email) fail(`${s.alias}.email/login ≠ ${s.email}`);
  if (!s.email.startsWith(SEED_PREFIX)) fail(`${s.alias}: email lacks ${SEED_PREFIX}`);
  if (a.role !== s.role.name) fail(`${s.alias}.role ≠ ${s.role.name}`);
  if (a.permissions !== s.role.permissions.join(',')) fail(`${s.alias}.permissions ≠ spec [${s.role.permissions}]`);
  if (a.password !== s.passwordToken) fail(`${s.alias}.password must be ${s.passwordToken}`);
}
done(b);

// [2]
b = problems.length; section(2, 'secret hygiene');
for (const name of [...CONFIG_SPECS.map((c) => c.alias), ...BACKOFFICE_SPECS.map((s) => s.alias)]) {
  const a = aliases[name] || {};
  for (const f of ['sharedSecret', 'password']) if (f in a && !TOKEN_RE.test(String(a[f]))) fail(`${name}.${f} is not a {{VAR}} token`);
}
const envLocal = join(ROOT, '.env.local');
const secretValues = [];
if (existsSync(envLocal)) {
  const parsed = parseDotenv(readFileSync(envLocal));
  for (const [k, v] of Object.entries(parsed)) if (/^PUNCHOUT_SHARED_SECRET_\d+(_|$)/.test(k) && v) secretValues.push({ k, v });
}
if (!secretValues.length) note('no PUNCHOUT_SHARED_SECRET_* in .env.local — literal-leak scan and [6] skipped');
const scanFiles = [
  ...readdirSync(join(ROOT, 'test-data')).filter((f) => /^aliases(\..+)?\.json$/.test(f)).map((f) => join(ROOT, 'test-data', f)),
  ...readdirSync(join(ROOT, 'scripts/seed-data/punchout')).map((f) => join(ROOT, 'scripts/seed-data/punchout', f)),
];
for (const f of scanFiles) {
  const t = readFileSync(f, 'utf8');
  for (const { k, v } of secretValues) if (t.includes(v)) fail(`${f.replace(ROOT, '.')} contains the VALUE of ${k} — remove it, use the {{VAR}} token`);
}
done(b);

// [3]
b = problems.length; section(3, 'no runtime GUID in the base registry');
for (const name of [...CONFIG_SPECS, ...MAPPING_SPECS, ...BACKOFFICE_SPECS].map((x) => x.alias)) {
  const a = aliases[name] || {};
  for (const [f, v] of Object.entries(a)) if (!f.startsWith('_') && typeof v === 'string' && GUID_RE.test(v)) fail(`${name}.${f} carries a GUID in aliases.json — it belongs in aliases.<env>.json`);
}
done(b);

// [4]
b = problems.length; section(4, 'role permission boundary');
for (const s of BACKOFFICE_SPECS) {
  const set = new Set(s.role.permissions);
  for (const p of s.mustHave) if (!set.has(p)) fail(`${s.role.name} lacks required ${p}`);
  for (const p of s.mustNotHave) if (set.has(p)) fail(`${s.role.name} holds forbidden ${p}`);
  for (const p of ['customer:access', 'customer:read']) if (!set.has(p)) fail(`${s.role.name} lacks ${p} — it cannot open Companies & contacts`);
  if (s.role.permissions.some((p) => p === '*' || /^platform:security:/.test(p))) fail(`${s.role.name} holds a broad/security permission`);
  if (!s.role.id.startsWith(SEED_PREFIX) || !s.role.name.startsWith(SEED_PREFIX)) fail(`${s.role.name}: lacks ${SEED_PREFIX}`);
}
const [reader, none] = ['BACKOFFICE_PUNCHOUT_READ', 'BACKOFFICE_NO_PUNCHOUT'].map((a) => BACKOFFICE_SPECS.find((s) => s.alias === a));
if (reader && none) {
  const diff = reader.role.permissions.filter((p) => !none.role.permissions.includes(p));
  const extra = none.role.permissions.filter((p) => !reader.role.permissions.includes(p));
  if (diff.join() !== 'punchout:read' || extra.length) fail(`reader vs no-punchout must differ by exactly punchout:read (got +[${diff}] -[${extra}])`);
  if (reader.expect.search === none.expect.search) fail('reader and no-punchout expect the same search status — BSC-2 vs BSC-3 undecidable');
}
done(b);

// [5]
b = problems.length; section(5, 'configuration divergence');
if (new Set(CONFIG_SPECS.map((c) => c.secretVar)).size !== CONFIG_SPECS.length) fail('secret vars are not distinct');
for (const [env, d] of Object.entries(DEPLOYED_CONFIGS)) {
  if (!d.source) fail(`${env}: deployment has no provenance (source)`);
  const f = Object.fromEntries(CONFIG_SPECS.map((c) => [c.index, configOverlayFields(c, d.configs[c.index])]));
  if (!f[0] || !f[1]) { fail(`${env}: configs 0 and 1 must both be declared`); continue; }
  for (const k of ['storeId', 'senderDomainCheck', 'returnUrlCheck', 'tokenLifetime', 'sessionLifetime']) {
    if (f[0][k] === f[1][k]) fail(`${env}: config 0 and 1 share ${k}=${f[0][k]} — the per-config selection is undecidable on it`);
  }
  if (!(f[0].senderDomainCheck && f[0].returnUrlCheck)) fail(`${env}: config 0 must have BOTH optional checks on`);
  if (f[1].senderDomainCheck || f[1].returnUrlCheck) fail(`${env}: config 1 must have both optional checks off`);
  if (!(f[1].tokenLifetimeMinutes < f[0].tokenLifetimeMinutes)) fail(`${env}: config 1 token lifetime must be shorter than config 0's`);
  if (!(f[1].tokenLifetimeMinutes < f[1].sessionLifetimeMinutes)) fail(`${env}: config 1 token must die before its session (else "token dead, session alive" is unreachable)`);
  if (!f[0].storeExists || !f[1].storeExists) fail(`${env}: configs 0/1 must target existing stores`);
  if (!f[2] || !f[2].storeId || f[2].storeExists) fail(`${env}: config 2 must name a store that does NOT exist`);
  if (f[2] && !f[2].storeId.startsWith(SEED_PREFIX)) fail(`${env}: config 2's fake store id must carry ${SEED_PREFIX}`);
  if (!f[3] || f[3].storeId) fail(`${env}: config 3 must have no StoreId`);
}
done(b);

// [6]
b = problems.length; section(6, 'secret value divergence (.env.local, values never printed)');
const bySuffix = {};
for (const { k, v } of secretValues) {
  const m = /^PUNCHOUT_SHARED_SECRET_(\d+)(?:_(.+))?$/.exec(k);
  if (m) (bySuffix[m[2] || '(base)'] ||= []).push({ i: m[1], v });
}
for (const [suffix, list] of Object.entries(bySuffix)) {
  const seen = new Map();
  for (const { i, v } of list) { if (seen.has(v)) fail(`${suffix}: secrets ${seen.get(v)} and ${i} are IDENTICAL`); seen.set(v, i); }
  if (list.length < CONFIG_SPECS.length) note(`${suffix}: only ${list.length}/${CONFIG_SPECS.length} secrets declared`);
}
done(b);

// [7]
b = problems.length; section(7, 'overlay coherence (informational for unseeded envs)');
for (const env of Object.keys(DEPLOYED_CONFIGS)) {
  const p = join(ROOT, `test-data/aliases.${env}.json`);
  const ov = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  if (!CONFIG_SPECS.some((c) => ov[c.alias])) { note(`${env}: not seeded yet (npm run seed:punchout)`); continue; }
  for (const c of CONFIG_SPECS) {
    const want = configOverlayFields(c, DEPLOYED_CONFIGS[env].configs[c.index]);
    for (const [k, v] of Object.entries(want)) if (JSON.stringify(ov[c.alias]?.[k]) !== JSON.stringify(v)) fail(`${env} overlay ${c.alias}.${k}=${JSON.stringify(ov[c.alias]?.[k])} ≠ spec ${JSON.stringify(v)} — re-run the seed`);
    if (ov[c.alias]?.sharedSecret !== undefined) fail(`${env} overlay ${c.alias} must not carry sharedSecret`);
  }
  for (const m of MAPPING_SPECS) {
    const o = ov[m.alias] || {};
    if (!o.id) { note(`${env}: ${m.alias} not provisioned (empty id) — seed it before the cases run`); continue; }
    for (const f of ['id', 'userId', 'memberId']) if (!GUID_RE.test(o[f] || '')) fail(`${env} overlay ${m.alias}.${f} is not a GUID`);
    if (m.minOrganizations) {
      if (!(o.organizationCount >= m.minOrganizations)) fail(`${env} overlay ${m.alias}.organizationCount=${o.organizationCount} < ${m.minOrganizations}`);
      if (!o.currentOrganizationId || !o.otherOrganizationId || o.currentOrganizationId === o.otherOrganizationId) fail(`${env} overlay ${m.alias}: current and other organization must be two different ids (the org-switch case needs a target)`);
    }
  }
  for (const s of BACKOFFICE_SPECS) if (!ov[s.alias]?.user_id) note(`${env}: ${s.alias} not provisioned`); else if (!GUID_RE.test(ov[s.alias].user_id)) fail(`${env} overlay ${s.alias}.user_id is not a GUID`);
}
done(b);

// [8]
b = problems.length; section(8, 'probe + permission predictions re-derived from the declarations');
const notOwned = MAPPING_SPECS.filter((m) => !m.owned).map((m) => m.externalId).sort();
if (JSON.stringify([...PROTECTED_EXTERNAL_IDS].sort()) !== JSON.stringify(notOwned)) fail(`PROTECTED_EXTERNAL_IDS [${[...PROTECTED_EXTERNAL_IDS]}] ≠ not-owned mappings [${notOwned}]`);
for (const [name, a] of Object.entries(aliases)) if (a && a.owned_by_seeder === false && !PROTECTED_EXTERNAL_IDS.has(a.externalId)) fail(`${name} is not owned by the seeder but ${a.externalId} is not protected from teardown`);
for (const s of BACKOFFICE_SPECS) {
  const set = new Set(s.role.permissions);
  const wantSearch = set.has('punchout:read') ? 200 : 403;
  const wantWrite = ['punchout:create', 'punchout:update', 'punchout:delete'].some((p) => set.has(p)) ? null : 403;
  if (s.expect.search !== wantSearch) fail(`${s.alias}: expect.search ${s.expect.search} but its permissions imply ${wantSearch}`);
  if (wantWrite !== null && s.expect.write !== wantWrite) fail(`${s.alias}: expect.write ${s.expect.write} but its permissions imply ${wantWrite}`);
}
for (const m of MAPPING_SPECS) if (!VERIFY_PROBES.some((p) => p.provesMapping && p.mapping === m.alias)) fail(`${m.alias}: no session-free probe proves this mapping is active (needs a provesMapping:true probe)`);
const allowed = (url, pattern) => (pattern.endsWith('*')
  ? url.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase())
  : url.toLowerCase() === pattern.toLowerCase());
for (const [env, d] of Object.entries(DEPLOYED_CONFIGS)) {
  for (const p of VERIFY_PROBES) {
    const c = d.configs[p.config];
    if (!c) { fail(`${env}: probe "${p.name}" names undeclared config ${p.config}`); continue; }
    // Check order (source + KB-62D97984): StoreId present → sender domain → return URL → mapping → store exists.
    const predict = (mapped) => {
      if (!c.storeId) return '500';
      if (c.senderDomain && String(p.domain).toLowerCase() !== c.senderDomain.toLowerCase()) return '401';
      if (c.allowedReturnUrls.length && !(p.returnUrl && c.allowedReturnUrls.some((x) => allowed(p.returnUrl, x)))) return '400';
      if (!mapped) return '401';
      if (!c.storeExists) return '500';
      return '200';
    };
    const mapped = !!(p.mapping && MAPPING_SPECS.some((m) => m.alias === p.mapping));
    const code = predict(mapped);
    if (p.provesMapping && predict(false) === code) fail(`${env}: probe "${p.name}" claims to prove the mapping, but an unmapped identity would get the same ${code}`);
    if (code === '200') fail(`${env}: probe "${p.name}" would OPEN A SESSION — verify probes must be decided before the success path`);
    else if (code !== p.expectCode) fail(`${env}: probe "${p.name}" expects ${p.expectCode}, declarations predict ${code}`);
  }
}
done(b);

console.log(`\n=== td:validate:punchout — ${problems.length} problem(s), ${notes.length} note(s) ===`);
for (const n of notes) console.log(`  · ${n}`);
for (const p of problems) console.log(`  ✗ ${p}`);
process.exit(problems.length ? 1 : 0);
