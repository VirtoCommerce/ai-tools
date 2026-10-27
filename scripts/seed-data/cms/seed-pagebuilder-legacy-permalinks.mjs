#!/usr/bin/env node
/**
 * scripts/seed-data/cms/seed-pagebuilder-legacy-permalinks.mjs
 *
 * VCST-6443 fixtures: LEGACY-INVALID PageBuilder page groups (stored permalink violates the PR #178
 * rule) + a back-office user without builder:create. The pages cannot be made through the REST
 * endpoints on a build that has the rule, so they are written through PLATFORM RESTORE: the seeder
 * builds an unencrypted backup holding only its own groups (the shape the platform's own export
 * writes), uploads it to backups/, and runs POST /api/platform/import (@kb(KB-8AD383A4),
 * @kb(KB-0B4DAD09)). The pages are per-run and TERMINAL, so a seed always REPLACES them: leftovers
 * with the same AGENT-TEST name (or at the same permalink) are deleted first, then fresh groups are
 * imported with new ids, which land in aliases.<env>.json only.
 *
 * Verification after a seed: GET /api/page-builder-pages/grouped/{id} returns the permalink
 * byte-identical (+ status/visibility); the SAME permalink sent to create-group-page answers 400 on
 * the target build (the live non-vacuity proof — a 2xx there means the fixture is not legacy-invalid
 * on this build); the no-create user gets 403 on create-group-page with a VALID permalink.
 *
 *   TEST_ENV=vcst npm run seed:pb-legacy-permalinks [-- --dry-run --verbose --only PB_6443_LEGACY_PCT]
 *   TEST_ENV=vcst npm run seed:pb-legacy-permalinks:teardown
 */

import { randomUUID } from 'node:crypto';
import {
  assertSafeTarget, auth, api, log, verbose, DRY_RUN, TEARDOWN, ONLY, loadAliases, BACK_URL, ADMIN, ADMIN_PASSWORD,
  uploadAsset, writeEnvAliasOverride, verifyRemoved, resetSecurityPassword,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import {
  TICKET_PREFIX, PAGE_ALIASES, USER_ALIAS, MODULE_ID, STATUS, EMPTY_CONTENT, pageSpecs, moduleExportJson, restoreManifest,
  buildStoredZip, roleBody, accountBody,
} from './pagebuilder-legacy-permalinks-specs.mjs';

const ENV = process.env.TEST_ENV || 'vcst';
const ALIASES = loadAliases();
const only = ONLY ? String(ONLY).split(',').map((s) => s.trim()).filter(Boolean) : null;
if (only) { const unknown = only.filter((a) => !PAGE_ALIASES.includes(a) && a !== USER_ALIAS); if (unknown.length) throw new Error(`--only: unknown alias(es) ${unknown.join(', ')}`); }
const SPECS = pageSpecs(ALIASES, only ? only.filter((a) => a !== USER_ALIAS) : null);
const WANT_USER = !only || only.includes(USER_ALIAS);
const USER = ALIASES[USER_ALIAS];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getGroup = (id) => api('GET', `/api/page-builder-pages/grouped/${encodeURIComponent(id)}`, null, { expectStatus: [200, 204, 404] });

async function rawToken(username, password) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username, password }),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token;
}
async function rawPost(tok, path, body) {
  const res = await fetch(`${BACK_URL}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let json = null; try { json = JSON.parse(text); } catch { /* text/plain or empty body */ }
  return { status: res.status, json, text };
}

async function allPages() {
  const r = await api('POST', '/api/page-builder-pages/search', { take: 1000 }, { expectStatus: [200] });
  return r?.results || r?.items || [];
}

/** AGENT-TEST pages that would collide with a fresh seed: same name, or sitting at a spec permalink. */
function leftovers(pages, specs) {
  const names = new Set(specs.map((s) => s.name));
  const links = new Set(specs.map((s) => s.permalink));
  return pages.filter((p) => String(p.name || '').startsWith(TICKET_PREFIX) && (names.has(p.name) || links.has(p.permalink)));
}

async function deletePages(pages) {
  for (const p of pages) {
    if (DRY_RUN) { log(`  [DRY] would delete "${p.name}" (${p.id})`); continue; }
    await api('DELETE', `/api/page-builder-pages/grouped/${encodeURIComponent(p.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`  x deleted leftover "${p.name}" (${p.id}, ${p.status})`);
  }
}

async function pollNotification(id, label, { tries = 60, every = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    await sleep(every);
    const r = await api('POST', '/api/platform/pushnotifications', { ids: [id], take: 1 }, { expectStatus: [200] });
    const n = (r?.notifyEvents || [])[0];
    if (n?.finished) return n;
  }
  throw new Error(`${label}: notification ${id} did not finish in time`);
}

async function importPages(specs) {
  const ids = Object.fromEntries(specs.map((s) => [s.alias, { groupId: randomUUID(), pageId: randomUUID() }]));
  const newManifest = await api('GET', '/api/platform/export/manifest/new', null, { expectStatus: [200] });
  const mod = (newManifest.modules || []).find((m) => m.id === MODULE_ID);
  if (!mod) throw new Error(`${MODULE_ID} is not installed on ${ENV}`);
  const zip = buildStoredZip([
    { name: 'Manifest.json', data: Buffer.from(JSON.stringify(restoreManifest(newManifest, mod.version), null, 2)) },
    { name: 'PlatformEntries.json', data: Buffer.from('{}') },
    { name: `${MODULE_ID}.json`, data: Buffer.from(JSON.stringify(moduleExportJson(specs, ids))) },
  ]);
  const fileName = `agent-test-6443-legacy-${Date.now()}.zip`;
  if (DRY_RUN) { log(`  [DRY] would import ${specs.length} group(s) via backups/${fileName} (${zip.length} bytes)`); return ids; }
  await uploadAsset('backups', fileName, zip, 'application/zip');
  const fileUrl = `backups/${fileName}`;
  const exportManifest = await api('GET', `/api/platform/export/manifest/load?fileUrl=${encodeURIComponent(fileUrl)}`, null, { expectStatus: [200] });
  const r = await api('POST', '/api/platform/import', { fileUrl, exportManifest, modules: [MODULE_ID], handleSecurity: false, handleSettings: false, handleBinaryData: false }, { expectStatus: [200] });
  const n = await pollNotification((r.notification || r).id, 'import');
  if (n.errorCount) throw new Error(`import finished with ${n.errorCount} error(s): ${JSON.stringify(n.errors).slice(0, 400)}`);
  log(`  + imported ${specs.length} group(s) (job ${n.jobId}, 0 errors)`);
  return ids;
}

/** A stored group matches its spec: permalink byte-identical, status, visibility. */
async function verifyPage(spec, groupId) {
  const g = await getGroup(groupId);
  if (!g?.id) return { ok: false, detail: 'GET grouped -> not found' };
  const checks = [];
  if (g.permalink !== spec.permalink) checks.push(`permalink ${JSON.stringify(g.permalink)} != ${JSON.stringify(spec.permalink)}`);
  if (g.name !== spec.name) checks.push(`name ${g.name}`);
  if (g.status !== spec.status) checks.push(`status ${g.status} != ${spec.status}`);
  if (g.visibility !== spec.visibility) checks.push(`visibility ${g.visibility} != ${spec.visibility}`);
  if (g.storeId !== spec.storeId || g.cultureName !== spec.culture) checks.push(`store/culture ${g.storeId}/${g.cultureName}`);
  return { ok: !checks.length, detail: checks.join('; ') || `${g.status}, visibility ${g.visibility}`, group: g };
}

/**
 * create-group-page with a COMPLETE body (content is required — without it the endpoint answers 400
 * "StoreId, Name and Content are required." for any permalink, @kb(KB-3642CE3E)). Deletes anything
 * it created. Returns { status, reason } where reason is the 400 body.
 */
async function probeCreate(tok, { storeId, culture, permalink, name }) {
  const r = await rawPost(tok, '/api/page-builder-pages/create-group-page', { storeId, cultureName: culture, name, permalink, content: EMPTY_CONTENT });
  if (r.status >= 200 && r.status < 300 && r.json?.id) await api('DELETE', `/api/page-builder-pages/grouped/${encodeURIComponent(r.json.id)}`, null, { expectStatus: [200, 204, 404] });
  return { status: r.status, reason: String(r.text || '').slice(0, 120) };
}
const REQUIRED_MSG = /are required/i;
/** Live non-vacuity: the same permalink must be REJECTED (400, not the missing-field 400) on this build. */
async function verifyRejectedByRest(tok, spec) {
  const r = await probeCreate(tok, { storeId: spec.storeId, culture: spec.culture, permalink: spec.permalink, name: `${TICKET_PREFIX}probe ${spec.alias}` });
  return { ...r, ok: r.status === 400 && !REQUIRED_MSG.test(r.reason) };
}

async function ensureUser() {
  const role = roleBody(USER);
  if (DRY_RUN) { log(`  [DRY] would upsert role "${role.name}" (${role.permissions.map((p) => p.name).join(', ')}) + user ${USER.login}`); return null; }
  await api('PUT', '/api/platform/security/roles', role, { expectStatus: [200, 201, 204] });
  const password = resolvePassword(`{{${USER.password_var}}}`);
  let user = await api('GET', `/api/platform/security/users/${encodeURIComponent(USER.login)}`, null, { expectStatus: [200, 204, 404] });
  if (!user?.id) {
    const res = await api('POST', '/api/platform/security/users/create', accountBody(USER, { password, storeId: SPECS[0]?.storeId || 'B2B-store' }));
    if (res && res.succeeded === false) throw new Error(`create ${USER.login}: ${JSON.stringify(res.errors)}`);
    user = await api('GET', `/api/platform/security/users/${encodeURIComponent(USER.login)}`, null, { expectStatus: [200] });
    log(`  + created user ${USER.login} (${user.id})`);
  } else {
    let dirty = false;
    if (!(user.roles || []).some((r) => r.id === role.id)) { user.roles = [{ id: role.id, name: role.name }]; dirty = true; }
    if (user.isAdministrator) { user.isAdministrator = false; dirty = true; }
    if (dirty) await api('PUT', '/api/platform/security/users', user, { expectStatus: [200, 204] });
    // Keep the password on the declared secret so the case can log in (the account is AGENT-TEST only).
    await resetSecurityPassword(api, USER.login, password);
    log(`  = reused user ${USER.login} (${user.id})${dirty ? ' — role/admin flag reconciled' : ''}`);
  }
  const tok = await rawToken(USER.login, password);
  if (!tok) throw new Error(`${USER.login} cannot log in with the declared ${USER.password_var}`);
  const probe = await probeCreate(tok, { storeId: SPECS[0]?.storeId || 'B2B-store', culture: SPECS[0]?.culture || 'en-US', name: `${TICKET_PREFIX}nocreate probe`, permalink: `/agent-test-6443-nocreate-probe-${Date.now()}` });
  log(`  ${probe.status === 403 ? 'ok' : 'FAIL'} no-create user -> create-group-page (valid permalink) = ${probe.status} (want 403)`);
  return { id: user.id, probe: probe.status };
}

async function seed() {
  const writeback = {};
  let failures = 0;
  if (SPECS.length) {
    const stale = leftovers(await allPages(), SPECS);
    log(`Leftovers: ${stale.length}`);
    await deletePages(stale);
    const ids = await importPages(SPECS);
    if (!DRY_RUN) {
      const adminTok = await rawToken(ADMIN, ADMIN_PASSWORD);
      // Positive control: the identical body with a VALID permalink is accepted, so a 400 below is the permalink.
      const ctl = await probeCreate(adminTok, { storeId: SPECS[0].storeId, culture: SPECS[0].culture, permalink: `/agent-test-6443-control-${Date.now()}`, name: `${TICKET_PREFIX}control probe` });
      log(`  ${ctl.status === 200 ? 'ok  ' : 'FAIL'} control: create-group-page with a valid permalink = ${ctl.status} (want 200, deleted)`);
      if (ctl.status !== 200) failures++;
      log('\n  alias | groupId | stored permalink | state | REST create (want 400)');
      for (const s of SPECS) {
        const v = await verifyPage(s, ids[s.alias].groupId);
        const rest = await verifyRejectedByRest(adminTok, s);
        if (!v.ok || !rest.ok) failures++;
        log(`  ${v.ok && rest.ok ? 'ok  ' : 'FAIL'} ${s.alias} | ${ids[s.alias].groupId} | ${JSON.stringify(v.group?.permalink)} | ${v.detail} | ${rest.status} ${JSON.stringify(rest.reason)}`);
        writeback[s.alias] = { id: ids[s.alias].groupId, page_id: ids[s.alias].pageId, name: s.name, permalink: s.permalink };
      }
    }
  }
  if (WANT_USER) {
    const u = await ensureUser();
    if (u) { writeback[USER_ALIAS] = { id: u.id, login: USER.login, email: USER.email, role: USER.role, password_var: USER.password_var }; if (u.probe !== 403) failures++; }
  }
  writeEnvAliasOverride(writeback);
  if (!DRY_RUN) log(`\n  wrote ${Object.keys(writeback).length} alias(es) to aliases.${ENV}.json`);
  if (failures) throw new Error(`${failures} verification(s) failed — see the table above`);
}

async function teardown() {
  const pages = leftovers(await allPages(), SPECS);
  await deletePages(pages);
  if (WANT_USER && !DRY_RUN) {
    await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(USER.login)}`, null, { expectStatus: [200, 204, 404] });
    await api('DELETE', `/api/platform/security/roles?ids=${encodeURIComponent(USER.role)}`, null, { expectStatus: [200, 204, 404] });
    log(`  x deleted user ${USER.login} + role "${USER.role}"`);
  }
  const residuePages = await verifyRemoved(async () => leftovers(await allPages(), SPECS));
  const residueUser = WANT_USER && !DRY_RUN
    ? ((await api('GET', `/api/platform/security/users/${encodeURIComponent(USER.login)}`, null, { expectStatus: [200, 204, 404] }))?.id ? 1 : 0) : 0;
  const clear = {};
  for (const s of SPECS) clear[s.alias] = { id: '', page_id: '' };
  if (WANT_USER) clear[USER_ALIAS] = { id: '' };
  writeEnvAliasOverride(clear);
  verbose(`residue: pages ${residuePages}, user ${residueUser}`);
  if (residuePages || residueUser) throw new Error(`teardown left residue: ${residuePages} page(s), ${residueUser} user`);
  log('  zero residue');
}

async function main() {
  assertSafeTarget();
  await auth();
  log(`VCST-6443 legacy permalinks on ${ENV}: ${SPECS.length} page(s)${WANT_USER ? ' + no-create user' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (TEARDOWN) await teardown(); else await seed();
  log(DRY_RUN ? 'DRY RUN complete.' : (TEARDOWN ? 'Teardown complete.' : 'Seed complete.'));
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
