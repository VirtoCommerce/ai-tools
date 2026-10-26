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
 *                       lifetimes; 2 = nonexistent store; every ACTIVE config has a unique Id and a
 *                       StoreId (the platform refuses to start otherwise — vc-deploy-dev#6926); a
 *                       RETIRED config (3) is neither deployed nor probed; distinct secret vars
 *                       The dedicated REQUISITION buyer must stay a different account from every
 *                       other mapping's persona ([1] statically, [7] on the seeded overlay).
 *  [6] secret divergence the four secret VALUES of each env in .env.local are pairwise distinct (a
 *                       shared secret would make "each secret selects its own configuration" vacuous)
 *  [8] probe/permission predictions  every VERIFY_PROBE's expected cXML code is RE-DERIVED from the
 *                       deployed config + mapping specs (check order: StoreId present → sender domain →
 *                       return URL → mapping → store exists); every account's expected REST status is
 *                       re-derived from its permissions; the protected set is exactly the not-owned specs
 *  [7] overlay coherence for a seeded env, the overlay's config facts equal configOverlayFields(),
 *                       ids are GUIDs, and the multi-org persona has two DIFFERENT org ids
 *  [9] catalog fixtures (VCST-5887, specs §5) registry + no GUID in the base; the UoM/plain pair
 *                       DIVERGES on MeasureUnit (UoM non-empty and not the EA fallback, plain empty);
 *                       every product's EUR ≠ USD and the two products differ in each currency; stock
 *                       ≥ the minimum; one owned AGENT-TEST list per currency covering every product;
 *                       the store-FFC write targets config 1's store from config 0's (different,
 *                       existing stores, one field only); seeded overlay ids are GUIDs and coherent
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import {
  CONFIG_SPECS, DEPLOYED_CONFIGS, configOverlayFields, retiredOverlayFields, MAPPING_SPECS, PROTECTED_EXTERNAL_IDS,
  BACKOFFICE_SPECS, SEED_PREFIX, secretToken, VERIFY_PROBES, isProvisionedBuyer,
  PRODUCT_SPECS, PRODUCT_PLACEMENT, PRODUCT_MIN_STOCK, FALLBACK_UOM, PRICELIST_SPECS, STORE_FFC_SPEC,
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
  for (const f of ['configurationId', 'storeId', 'senderDomain', 'allowedReturnUrl', 'tokenLifetime', 'sessionLifetime']) {
    if (a[f] !== '') fail(`${c.alias}.${f} must be "" in the base registry (env-specific; overlay supplies it)`);
  }
  if (c.retired) {
    if (a.retired !== true || !a.retiredReason) fail(`${c.alias} is retired in the spec — the alias must carry retired:true + retiredReason so a citing case reads why it resolves to ""`);
  } else if (a.retired) fail(`${c.alias} is marked retired in aliases.json but not in the spec`);
}
for (const m of MAPPING_SPECS) {
  const a = aliases[m.alias];
  if (!a) { fail(`${m.alias} not registered`); continue; }
  if (a.externalId !== m.externalId) fail(`${m.alias}.externalId ${a.externalId} ≠ spec ${m.externalId}`);
  if (isProvisionedBuyer(m)) {
    const bu = m.buyer;
    if (a.email !== bu.email || a.login !== bu.email) fail(`${m.alias}.email/login ≠ ${bu.email}`);
    if (!bu.email.startsWith(SEED_PREFIX)) fail(`${m.alias}: buyer email lacks ${SEED_PREFIX}`);
    if (a.password !== bu.passwordToken || !TOKEN_RE.test(String(a.password))) fail(`${m.alias}.password must be the token ${bu.passwordToken}`);
    if (a.org_role !== bu.orgRoleName) fail(`${m.alias}.org_role ≠ ${bu.orgRoleName}`);
    if (a.organization_from_persona_var !== bu.organizationFromPersonaVar) fail(`${m.alias}.organization_from_persona_var ≠ ${bu.organizationFromPersonaVar}`);
    if (!m.owned) fail(`${m.alias}: a provisioned buyer must be owned (teardown symmetry)`);
    // SECOND RULE: the buyer exists to be ISOLATED from the shared persona — it must not be a persona var
    // that another mapping already uses, or "the cart sent = this buyer's default cart" is undecidable again.
    if (MAPPING_SPECS.some((o) => o !== m && o.personaEmailVar && process.env[o.personaEmailVar] && process.env[o.personaEmailVar].toLowerCase() === bu.email.toLowerCase())) fail(`${m.alias}: buyer email equals another mapping's persona — isolation collapsed`);
  } else if (a.persona_email_var !== m.personaEmailVar) fail(`${m.alias}.persona_email_var ≠ ${m.personaEmailVar}`);
  if (a.owned_by_seeder !== m.owned) fail(`${m.alias}.owned_by_seeder ≠ ${m.owned}`);
  if (!m.externalId.startsWith(SEED_PREFIX)) fail(`${m.alias}: externalId lacks ${SEED_PREFIX}`);
}
if (new Set(MAPPING_SPECS.map((m) => m.externalId)).size !== MAPPING_SPECS.length) fail('mapping externalIds are not unique (DB index is unique)');
// SECOND RULE: DEFAULT (single org) and MULTI_ORG (≥2 orgs) must not be able to coincide, or the
// org-resolution cases cannot tell "one org → that org" from "several → current/default".
{
  const single = MAPPING_SPECS.find((m) => m.alias === 'PUNCHOUT_MAPPING_DEFAULT');
  const multi = MAPPING_SPECS.find((m) => m.alias === 'PUNCHOUT_MAPPING_MULTI_ORG');
  if (!single?.maxOrganizations || !multi?.minOrganizations || single.maxOrganizations >= multi.minOrganizations) {
    fail(`DEFAULT maxOrganizations (${single?.maxOrganizations}) must be < MULTI_ORG minOrganizations (${multi?.minOrganizations}) — the single/multi-org pair would not diverge`);
  }
  if (single && multi && single.personaEmailVar === multi.personaEmailVar) fail('DEFAULT and MULTI_ORG map the same persona var');
}
for (const name of [...CONFIG_SPECS, ...MAPPING_SPECS, ...BACKOFFICE_SPECS].map((x) => x.alias)) {
  if (aliases[name] && aliases[name].seed !== 'seed:punchout') fail(`${name}.seed must be "seed:punchout" (td:validate prints it as the seed command for an unseeded env)`);
}
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
  // Punchout PR #2 validates the options at platform START (vc-deploy-dev#6926): a configuration
  // without an Id or a StoreId stops the platform, so a declaration carrying one is undeployable.
  const ids = [];
  for (const c of CONFIG_SPECS) {
    const dc = d.configs[c.index];
    if (c.retired) { if (dc) fail(`${env}: ${c.alias} is retired but configuration ${c.index} is still declared deployed`); continue; }
    if (!dc) { fail(`${env}: active ${c.alias} has no deployed declaration`); continue; }
    if (!dc.id) fail(`${env}: configuration ${c.index} has no Id — the platform refuses to start without it`);
    if (!dc.storeId) fail(`${env}: configuration ${c.index} has no StoreId — the platform refuses to start without it`);
    ids.push(dc.id);
  }
  if (new Set(ids).size !== ids.length) fail(`${env}: configuration Ids are not unique [${ids}]`);
}
for (const c of CONFIG_SPECS) if (c.retired && VERIFY_PROBES.some((p) => p.config === c.index)) fail(`${c.alias} is retired but a verify probe still targets it`);
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
    const want = c.retired ? retiredOverlayFields(c) : configOverlayFields(c, DEPLOYED_CONFIGS[env].configs[c.index]);
    for (const [k, v] of Object.entries(want)) if (JSON.stringify(ov[c.alias]?.[k]) !== JSON.stringify(v)) fail(`${env} overlay ${c.alias}.${k}=${JSON.stringify(ov[c.alias]?.[k])} ≠ spec ${JSON.stringify(v)} — re-run the seed`);
    if (ov[c.alias]?.sharedSecret !== undefined) fail(`${env} overlay ${c.alias} must not carry sharedSecret`);
  }
  for (const m of MAPPING_SPECS) {
    const o = ov[m.alias] || {};
    if (!o.id) { note(`${env}: ${m.alias} not provisioned (empty id) — seed it before the cases run`); continue; }
    for (const f of ['id', 'userId', 'memberId']) if (!GUID_RE.test(o[f] || '')) fail(`${env} overlay ${m.alias}.${f} is not a GUID`);
    if (m.maxOrganizations && !(o.organizationCount >= 1 && o.organizationCount <= m.maxOrganizations)) fail(`${env} overlay ${m.alias}.organizationCount=${o.organizationCount} outside 1..${m.maxOrganizations}`);
    if (isProvisionedBuyer(m)) {
      if (!GUID_RE.test(o.organizationId || '')) fail(`${env} overlay ${m.alias}.organizationId is not a GUID`);
      // Isolation is the whole point: the dedicated buyer must be a DIFFERENT account from every other
      // mapping's persona on this env (else its carts are shared again).
      for (const other of MAPPING_SPECS.filter((x) => x !== m)) {
        if (ov[other.alias]?.userId && ov[other.alias].userId === o.userId) fail(`${env} overlay ${m.alias}.userId equals ${other.alias}.userId — the buyer is not isolated`);
      }
    }
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

// [9]
b = problems.length; section(9, 'catalog fixtures — UoM pair, price lists, config-1 store FFC');
const money = (n) => Number(n).toFixed(2);
const catalogAliases = [...PRODUCT_SPECS, ...PRICELIST_SPECS, STORE_FFC_SPEC].map((x) => x.alias);
for (const name of catalogAliases) {
  const a = aliases[name];
  if (!a) { fail(`${name} not registered in aliases.json`); continue; }
  if (!a._inline) fail(`${name} must be _inline`);
  if (a.seed !== 'seed:punchout') fail(`${name}.seed must be "seed:punchout"`);
  for (const [f, v] of Object.entries(a)) if (!f.startsWith('_') && typeof v === 'string' && GUID_RE.test(v)) fail(`${name}.${f} carries a GUID in aliases.json — it belongs in aliases.<env>.json`);
}
for (const p of PRODUCT_SPECS) {
  const a = aliases[p.alias] || {};
  const want = { sku: p.code, code: p.code, name: p.name, measureUnit: p.measureUnit, price_usd: money(p.prices.USD), price_eur: money(p.prices.EUR), stock: String(p.stock), placement: `${PRODUCT_PLACEMENT.key} (${PRODUCT_PLACEMENT.csv})` };
  for (const [f, v] of Object.entries(want)) if (a[f] !== v) fail(`${p.alias}.${f}=${JSON.stringify(a[f])} ≠ spec ${JSON.stringify(v)}`);
  if (a.owned_by_seeder !== true) fail(`${p.alias}.owned_by_seeder must be true (teardown deletes it)`);
  if (!p.code.startsWith(SEED_PREFIX) || !p.name.startsWith(SEED_PREFIX)) fail(`${p.alias}: code/name lacks ${SEED_PREFIX} (teardown's ownership guard would skip it)`);
  if (!(p.stock >= PRODUCT_MIN_STOCK)) fail(`${p.alias}: stock ${p.stock} < ${PRODUCT_MIN_STOCK}`);
  if (!(p.prices.USD > 0 && p.prices.EUR > 0)) fail(`${p.alias}: needs a positive USD and EUR price`);
  if (p.prices.USD === p.prices.EUR) fail(`${p.alias}: USD and EUR amounts are equal — a wrong-currency line would be invisible`);
}
if (new Set(PRODUCT_SPECS.map((p) => p.code)).size !== PRODUCT_SPECS.length) fail('product codes are not unique');
{
  const P = PRODUCT_PLACEMENT;
  const csvPath = join(ROOT, P.csv);
  const head = existsSync(csvPath) ? readFileSync(csvPath, 'utf8').split(/\r?\n/)[0].split(',') : [];
  if (!head.includes(P.keyColumn) || !head.includes(P.codeColumn)) fail(`placement anchor CSV ${P.csv} lacks ${P.keyColumn}/${P.codeColumn}`);
  else if (!readFileSync(csvPath, 'utf8').split(/\r?\n/).some((l) => l.startsWith(`${P.key},`))) fail(`placement anchor ${P.key} is not a row of ${P.csv}`);
}
// SECOND RULE: the pair must disagree on exactly what the cXML case reads.
const uom = PRODUCT_SPECS.filter((p) => p.measureUnit);
const plain = PRODUCT_SPECS.filter((p) => !p.measureUnit);
if (uom.length !== 1 || plain.length !== 1) fail(`need exactly one UoM product and one plain sibling (have ${uom.length}/${plain.length})`);
for (const p of uom) if (p.measureUnit.toUpperCase() === FALLBACK_UOM) fail(`${p.alias}: MeasureUnit "${p.measureUnit}" equals the fallback ${FALLBACK_UOM} — "unit comes from the product" would pass vacuously`);
for (const cur of ['USD', 'EUR']) {
  const amounts = PRODUCT_SPECS.map((p) => p.prices[cur]);
  if (new Set(amounts).size !== amounts.length) fail(`two products share the ${cur} amount — a swapped line would be invisible`);
}
const currencies = PRICELIST_SPECS.map((pl) => pl.currency);
if (new Set(currencies).size !== currencies.length) fail('more than one owned price list per currency');
for (const cur of ['USD', 'EUR']) if (!currencies.includes(cur)) fail(`no owned ${cur} price list`);
for (const pl of PRICELIST_SPECS) {
  const a = aliases[pl.alias] || {};
  if (!pl.name.startsWith(SEED_PREFIX)) fail(`${pl.alias}: name lacks ${SEED_PREFIX}`);
  if (a.name !== pl.name || a.currency !== pl.currency) fail(`${pl.alias}.name/currency ≠ spec`);
  if (a.products !== PRODUCT_SPECS.map((p) => p.alias).join(',')) fail(`${pl.alias}.products must list ${PRODUCT_SPECS.map((p) => p.alias)}`);
  if (!pl.storesFromConfigs.includes(0)) fail(`${pl.alias}: must be assigned to config 0's store (the buyer's store)`);
  if (PRODUCT_SPECS.some((p) => p.prices[pl.currency] == null)) fail(`${pl.alias}: a product has no ${pl.currency} amount`);
}
if (STORE_FFC_SPEC.field !== 'mainFulfillmentCenterId') fail('store FFC write must touch only mainFulfillmentCenterId');
if ((aliases[STORE_FFC_SPEC.alias] || {}).field !== STORE_FFC_SPEC.field) fail(`${STORE_FFC_SPEC.alias}.field ≠ ${STORE_FFC_SPEC.field}`);
for (const [env, d] of Object.entries(DEPLOYED_CONFIGS)) {
  const t = d.configs[STORE_FFC_SPEC.targetConfig];
  const src = d.configs[STORE_FFC_SPEC.sourceConfig];
  if (!t?.storeExists || !src?.storeExists) fail(`${env}: the store-FFC source and target configurations must name existing stores`);
  else if (t.storeId === src.storeId) fail(`${env}: store-FFC target and source are the same store`);
  for (const pl of PRICELIST_SPECS) for (const i of pl.storesFromConfigs) if (!d.configs[i]?.storeExists) fail(`${env}: ${pl.alias} is assigned to config ${i}, which has no existing store`);
  const p = join(ROOT, `test-data/aliases.${env}.json`);
  const ov = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  for (const spec of PRODUCT_SPECS) {
    const o = ov[spec.alias];
    if (!o?.id) { note(`${env}: ${spec.alias} not provisioned (npm run seed:punchout -- --only catalog)`); continue; }
    for (const f of ['id', 'catalogId', 'categoryId']) if (!/^[0-9a-f-]{32,36}$/i.test(o[f] || '')) fail(`${env} overlay ${spec.alias}.${f} is not an id`);
    if (!o.ffcId) fail(`${env} overlay ${spec.alias}.ffcId empty — stock location unknown`);
  }
  for (const pl of PRICELIST_SPECS) {
    const o = ov[pl.alias];
    if (!o?.id) { note(`${env}: ${pl.alias} not provisioned`); continue; }
    if (!GUID_RE.test(o.id)) fail(`${env} overlay ${pl.alias}.id is not a GUID`);
    if (o.currency !== pl.currency) fail(`${env} overlay ${pl.alias}.currency ${o.currency} ≠ ${pl.currency}`);
    const want = pl.storesFromConfigs.map((i) => d.configs[i]?.storeId).join(',');
    if (o.storeIds !== want) fail(`${env} overlay ${pl.alias}.storeIds ${o.storeIds} ≠ ${want}`);
    if ((o.assignmentIds || '').split(',').filter(Boolean).length !== pl.storesFromConfigs.length) fail(`${env} overlay ${pl.alias}: expected ${pl.storesFromConfigs.length} assignment id(s)`);
  }
  const f = ov[STORE_FFC_SPEC.alias];
  if (!f?.storeId) note(`${env}: ${STORE_FFC_SPEC.alias} not provisioned`);
  else {
    if (f.storeId !== t?.storeId || f.sourceStoreId !== src?.storeId) fail(`${env} overlay ${STORE_FFC_SPEC.alias}: store ${f.storeId}←${f.sourceStoreId} ≠ config ${STORE_FFC_SPEC.targetConfig}←${STORE_FFC_SPEC.sourceConfig}`);
    if (!f.ffcId) fail(`${env} overlay ${STORE_FFC_SPEC.alias}.ffcId empty — the store still has no fulfillment center`);
    if (f.owned === true && f.assignedFfcId !== f.ffcId) fail(`${env} overlay ${STORE_FFC_SPEC.alias}: owned but assignedFfcId ≠ ffcId (teardown could not restore)`);
    if (f.owned !== true && (f.assignedFfcId || f.previousValue)) fail(`${env} overlay ${STORE_FFC_SPEC.alias}: not owned but carries a restore record`);
  }
}
done(b);

console.log(`\n=== td:validate:punchout — ${problems.length} problem(s), ${notes.length} note(s) ===`);
for (const n of notes) console.log(`  · ${n}`);
for (const p of problems) console.log(`  ✗ ${p}`);
process.exit(problems.length ? 1 : 0);
