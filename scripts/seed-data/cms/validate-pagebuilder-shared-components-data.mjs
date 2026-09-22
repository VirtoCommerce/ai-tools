#!/usr/bin/env node
/**
 * scripts/seed-data/cms/validate-pagebuilder-shared-components-data.mjs  (td:validate:pb-shared)
 *
 * STATIC drift-guard for the VCST-4933 Page Builder SHARED COMPONENTS fixture (no network).
 * Per .claude/rules/test-data.md FOURTH RULE this guard — not a unit test — owns the DECLARED
 * data: block-type validity, the non-vacuity contract, alias-registry completeness and GUID leaks.
 * Asserts:
 *   1. spec coherence — unique aliases/names/permalinks/role ids/emails, permalinks start with '/';
 *   2. fixture shape + NON-VACUITY (validateFixtureShape): only LOWERCASE rendering block types,
 *      distinct section texts, master >= 4 sections, SC_UNUSED usage 0, SC_USED usage > 0,
 *      SC_MULTI used on >= 2 pages, the control page references ZERO components;
 *   3. permission roles differ ONLY on builder:shared-components:* and each "minus one" role is
 *      exactly one verb short — the single-axis divergence that makes a 403 attributable;
 *   4. no runtime GUID / 32-hex component id leaked into the spec module or the content fixture;
 *   5. every alias is registered in test-data/aliases.json and GUID-free;
 *   6. no password literal in the committed fixture (a secret var name only).
 * Exit 1 on any violation.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPONENTS, PAGES, PERMISSION_USERS, STATUS, CONTENT_FILE, SC_PERMISSIONS,
  BUILDER_BASE_PERMISSIONS, SC_USER_PASSWORD_VAR, SC_USER_PASSWORD_FALLBACK,
  userEmail, roleId, rolePermissions, excludedPermissions, validateFixtureShape, findGuidLeaks,
} from './shared-components-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };

console.log('=== validate PageBuilder shared-components fixture (static drift-guard) ===');

// 1. spec coherence
const uniq = (label, values) => {
  const dupes = values.filter((v, i) => values.indexOf(v) !== i);
  if (dupes.length) fail(`duplicate ${label}: ${[...new Set(dupes)].join(', ')}`);
};
uniq('component alias', COMPONENTS.map((c) => c.alias));
uniq('component name', COMPONENTS.map((c) => c.name));
uniq('page alias', PAGES.map((p) => p.alias));
uniq('page name', PAGES.map((p) => p.name));
uniq('page permalink', PAGES.map((p) => p.permalink));
uniq('role id', PERMISSION_USERS.map(roleId));
uniq('user email', PERMISSION_USERS.map(userEmail));
for (const p of PAGES) {
  if (!p.permalink.startsWith('/')) fail(`permalink ${p.permalink} must start with '/'`);
  if (!Object.values(STATUS).includes(p.expectStatus)) fail(`${p.alias}: invalid expectStatus ${p.expectStatus}`);
  if (!p.name.startsWith('AGENT-TEST-')) fail(`${p.alias}: name must carry the AGENT-TEST- prefix`);
}
for (const c of COMPONENTS) if (!c.name.startsWith('AGENT-TEST-')) fail(`${c.alias}: name must carry the AGENT-TEST- prefix`);
if (!PAGES.some((p) => p.expectStatus === STATUS.DRAFT)) fail('no DRAFT page: the Draft-vs-Published pair (#15) needs one');
if (!PAGES.some((p) => p.alias === 'PB_SC_CONTROL')) fail('no A/B control page');
if (!problems.length) ok(`${COMPONENTS.length} components + ${PAGES.length} pages + ${PERMISSION_USERS.length} permission users: unique keys, AGENT-TEST- prefixed, valid statuses`);

// 2. fixture shape + non-vacuity
const cPath = join(ROOT, CONTENT_FILE);
let fixture = null;
if (!existsSync(cPath)) fail(`content fixture ${CONTENT_FILE} not found`);
else {
  fixture = JSON.parse(readFileSync(cPath, 'utf8'));
  const shape = validateFixtureShape(fixture);
  shape.forEach(fail);
  if (!shape.length) ok('content fixture: rendering block types only, distinct section texts, usage divergence intact (UNUSED=0, USED>0, MULTI on >=2 pages, control has 0 refs)');
}

// 3. permission roles — single-axis divergence
const base = new Set(BUILDER_BASE_PERMISSIONS);
let roleBad = false;
for (const u of PERMISSION_USERS) {
  const perms = rolePermissions(u);
  for (const b of BUILDER_BASE_PERMISSIONS) {
    if (!perms.includes(b)) { fail(`${u.key}: missing base permission ${b} — the base must be IDENTICAL across roles or a 403 cannot be pinned on the shared-components gate`); roleBad = true; }
  }
  const extra = perms.filter((p) => !base.has(p) && !SC_PERMISSIONS.includes(p));
  if (extra.length) { fail(`${u.key}: permission(s) outside base+shared-components: ${extra.join(', ')}`); roleBad = true; }
  const missing = excludedPermissions(u);
  if (missing.length !== (u.omit || []).length) { fail(`${u.key}: omit ${JSON.stringify(u.omit)} derives ${missing.length} excluded permission(s) — they must correspond 1:1`); roleBad = true; }
}
const minusOne = PERMISSION_USERS.filter((u) => (u.omit || []).length === 1);
if (minusOne.length !== 3) { fail(`expected exactly 3 "all four minus one" roles (nocreate/noupdate/nodelete), found ${minusOne.length}`); roleBad = true; }
if (!PERMISSION_USERS.some((u) => excludedPermissions(u).length === 0 && u.storeScoped)) { fail('no positive-control role holding all four shared-components permissions'); roleBad = true; }
if (!PERMISSION_USERS.some((u) => excludedPermissions(u).length === SC_PERMISSIONS.length)) { fail('no no-read role lacking all four shared-components permissions'); roleBad = true; }
const control = PERMISSION_USERS.filter((u) => !u.storeScoped);
if (control.length !== 1) { fail(`expected exactly 1 StoreId-mismatch CONTROL role, found ${control.length}`); roleBad = true; }
else if (excludedPermissions(control[0]).length) { fail('the StoreId-mismatch CONTROL must hold ALL four permissions — otherwise its 403 is not attributable to the store scope'); roleBad = true; }
if (!roleBad) ok(`${PERMISSION_USERS.length} roles differ ONLY on builder:shared-components:* (identical ${BUILDER_BASE_PERMISSIONS.length}-permission base); 1 all / 1 read-only / 3 minus-one / 1 none / 1 StoreId CONTROL`);

// 4. GUID leaks
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/cms/shared-components-specs.mjs'), 'utf8');
const specLeaks = findGuidLeaks(specSrc);
if (specLeaks.length) fail(`spec module leaks runtime id(s): ${specLeaks.join(', ')}`);
else ok('spec module carries no runtime GUID / component id (they belong in aliases.<env>.json)');
if (fixture) {
  const fLeaks = findGuidLeaks(JSON.stringify(fixture));
  if (fLeaks.length) fail(`content fixture leaks runtime id(s): ${fLeaks.join(', ')}`);
  else ok('content fixture carries no runtime GUID / component id');
}

// 5. alias registry
const registry = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const aliasNames = [...COMPONENTS.map((c) => c.alias), ...PAGES.map((p) => p.alias), ...PERMISSION_USERS.map((u) => u.alias)];
let aliasBad = false;
for (const name of aliasNames) {
  const a = registry[name];
  if (!a) { fail(`alias ${name} not registered in test-data/aliases.json`); aliasBad = true; continue; }
  const leaks = findGuidLeaks(JSON.stringify(a));
  if (leaks.length) { fail(`alias ${name} carries a runtime id in aliases.json (${leaks.join(', ')}) — belongs in aliases.<env>.json`); aliasBad = true; }
}
if (!aliasBad) ok(`all ${aliasNames.length} aliases registered + runtime-id-free in aliases.json`);

// 6. no password literal
const registrySrc = JSON.stringify(aliasNames.map((n) => registry[n] || {}));
const pwLeak = [specSrc, registrySrc].some((s) => new RegExp(`["'\`]${SC_USER_PASSWORD_FALLBACK.replace(/[.*+?^${}()|[\]\\!]/g, '\\$&')}["'\`]`).test(s.replace(new RegExp(`SC_USER_PASSWORD_FALLBACK\\s*=\\s*'${SC_USER_PASSWORD_FALLBACK.replace(/[.*+?^${}()|[\]\\!]/g, '\\$&')}'`), '')));
if (pwLeak) fail('a password literal appears outside the single documented localhost fallback constant');
else ok(`passwords resolve from {{${SC_USER_PASSWORD_VAR}}} (.env.local) — one documented localhost fallback constant only`);

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
