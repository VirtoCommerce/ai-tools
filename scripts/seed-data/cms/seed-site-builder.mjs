#!/usr/bin/env node
/**
 * scripts/seed-data/cms/seed-site-builder.mjs
 *
 * Site Builder (VirtoCommerce.SiteBuilder) fixtures the VCST-6571 / VCST-6572 runs lacked:
 *
 *   SB_THEME_B2B               a PUBLISHED theme on the store that differs visibly from the storefront's
 *                              built-in templates: header announcement bar, generated palette, a product
 *                              template rule (product type → template with a marker section).
 *   SB_STORE_EDITOR            back-office editor scoped to one store, no builder:theme/templates/publish.
 *   SB_THEME_EDITOR_NOPUBLISH  the same plus builder:theme + builder:templates, still no builder:publish.
 *
 * Declarations: test-data/aliases.json (SB_*). Pure helpers: ./site-builder-specs.mjs. Runtime values →
 * aliases.<env>.json. Credentials → test-accounts.local.json through accountSet (never a literal).
 *
 * THEME publications are append-only and the theme has no git history on vcst, so the seed records the
 * state it FOUND — per file, its content or "absent" — in results/seed-state/ (gitignored) before its first
 * write, builds every later run from that found state (re-runs never stack), and teardown puts each file
 * back as found (an absent file is deleted through the Content API), then publishes once more. The restored
 * state is therefore a new publication number; both numbers are logged and written back.
 *
 * Preconditions the seed checks and refuses on: the store has a schema catalog (only the storefront's
 * designer preview uploads one — open the store once in the Site Builder designer), and the theme has no
 * pending drafts that are not ours (a publish would ship them).
 *
 *   TEST_ENV=vcst npm run seed:site-builder [-- --dry-run] [--only SB_THEME_B2B,SB_STORE_EDITOR]
 *   TEST_ENV=vcst npm run seed:site-builder:teardown [-- --only …]
 */
import '../../lib/sync-stdio.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, DRY_RUN, TEARDOWN, ONLY, ROOT, BACK_URL, ADMIN, ADMIN_PASSWORD,
  writeEnvAliasOverride, resetSecurityPassword,
} from '../../lib/seed-common.mjs';
import { accountSet, isGeneratedPassword, resolvePassword } from '../../lib/user-provision.mjs';
import { resolveBuilderRoutes } from './builder-routes.mjs';
import {
  THEME_ALIAS, EDITOR_ALIASES, ALL_ALIASES, themeFiles, themePath, parseFile, stringify,
  paletteRequest, desiredFiles, sameJson, snapshotMarkers, roleBody, accountBody, lostScopes,
  themeProblems, editorProblems,
} from './site-builder-specs.mjs';

const ENV = process.env.TEST_ENV || 'vcst';
const DECL = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const want = ONLY ? new Set(String(ONLY).split(',').map((s) => s.trim()).filter(Boolean)) : new Set(ALL_ALIASES);
for (const a of want) if (!ALL_ALIASES.includes(a)) throw new Error(`--only: unknown alias ${a} (known: ${ALL_ALIASES.join(', ')})`);

/* ── raw HTTP (endpoints whose POST is a read, and token-per-user probes) ─── */
async function token(username, password) {
  const r = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username, password }),
  });
  return r.ok ? (await r.json()).access_token : null;
}
let _admin = null;
const adminToken = async () => (_admin ||= await token(ADMIN, ADMIN_PASSWORD));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Theme reads lag writes: theme/status and designer/theme-file can answer stale for ~20 s after a save or a
 * publish, and a read right after a publish has answered 500 (VCST-6571 X14; seen again 2026-11-19 on a
 * teardown whose publish then shipped only part of the drafts). Reads retry a 5xx; writes are followed by
 * waitFor() on the state they should produce.
 */
async function waitFor(what, check, { timeoutMs = 90000, everyMs = 5000 } = {}) {
  for (const end = Date.now() + timeoutMs; ;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(everyMs);
  }
}
async function raw(method, path, body, tok, attempt = 0) {
  const r = await fetch(`${BACK_URL}${path}`, {
    method, headers: { Authorization: `Bearer ${tok || await adminToken()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (method === 'GET' && r.status >= 500 && attempt < 4) { await sleep(3000); return raw(method, path, body, tok, attempt + 1); }
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* text body */ }
  return { status: r.status, json, text };
}
const q = (o) => new URLSearchParams(o).toString();

/* ── theme reads ─────────────────────────────────────────────────────────── */
async function readCatalog(storeId) {
  const r = await raw('GET', `/api/site-builder/catalog?${q({ storeId })}`);
  if (r.status === 404) {
    throw new Error(`${storeId} has no schema catalog — open ${storeId} once in the Site Builder designer (the storefront preview uploads it; only it can), then re-run`);
  }
  if (r.status !== 200 || !r.json?.hash) throw new Error(`GET catalog ${storeId} -> ${r.status} (no hash)`);
  return r.json;
}
async function themeStatus(storeId) {
  const r = await raw('GET', `/api/site-builder/theme/status?${q({ storeId })}`);
  if (r.status !== 200) throw new Error(`theme/status ${storeId} -> ${r.status}`);
  return { publication: r.json?.publication ?? null, drafts: r.json?.drafts || [] };
}
async function readThemeFile(decl, file) {
  const r = await raw('GET', `/api/site-builder/designer/theme-file?${q({ storeId: decl.store_id, path: themePath(decl, file) })}`);
  if (r.status !== 200) throw new Error(`theme-file ${file} -> ${r.status}`);
  return { content: r.json?.content ?? null, eTag: r.json?.eTag ?? null };
}
async function readAll(decl) {
  const out = {};
  for (const f of themeFiles(decl)) out[f] = await readThemeFile(decl, f);
  return out;
}
async function snapshot(storeId) {
  const r = await raw('POST', '/graphql', { query: 'query($s:String){ themeSnapshot(storeId:$s, cultureName:"en-US"){ publication content } }', variables: { s: storeId } });
  return r.json?.data?.themeSnapshot || null;
}

/* ── theme writes ────────────────────────────────────────────────────────── */
async function saveFiles(decl, hash, files) {
  const body = { themeFiles: files.map((f) => ({ path: themePath(decl, f.file), eTag: f.eTag, content: f.content })) };
  const r = await raw('POST', `/api/site-builder/designer/save?${q({ storeId: decl.store_id, catalogHash: hash })}`, body);
  if (r.status !== 200) throw new Error(`designer/save -> ${r.status} ${r.text.slice(0, 300)}`);
  // the publish reads the drafts; publishing before they are visible ships only part of them
  await waitFor('the saved drafts to show in theme/status', async () => {
    const st = await themeStatus(decl.store_id);
    return files.every((f) => st.drafts.includes(f.file));
  });
}
/** Publish, then wait until no draft of ours is left — publishing once more if the first publish missed some. */
async function publishSettled(decl, hash, ours) {
  let publication = await publishTheme(decl, hash);
  const left = async () => (await themeStatus(decl.store_id)).drafts.filter((d) => ours.includes(d));
  for (let extra = 0; ; extra++) {
    try { await waitFor('the published drafts to clear', async () => (await left()).length === 0, { timeoutMs: 45000 }); return publication; }
    catch {
      if (extra >= 3) throw new Error(`drafts still pending after publication ${publication}: ${(await left()).join(', ')}`);
      log(`  drafts still pending after publication ${publication} (${(await left()).join(', ')}) — publishing once more`);
      publication = await publishTheme(decl, hash);
    }
  }
}
async function publishTheme(decl, hash, attempt = 0) {
  const r = await raw('POST', `/api/site-builder/theme/publish?${q({ storeId: decl.store_id, catalogHash: hash })}`);
  // a theme file removed moments ago is still listed by the storage for a while: the publish then fails to
  // read it (500 "Could not find file") — it lists right again shortly, so wait and retry
  if (r.status === 500 && /Could not find file/i.test(r.text) && attempt < 8) { await sleep(20000); return publishTheme(decl, hash, attempt + 1); }
  if (r.status !== 200) throw new Error(`theme/publish -> ${r.status} ${r.text.slice(0, 400)}`);
  return r.json.publication;
}
async function discardDrafts(decl, files) {
  const r = await raw('POST', `/api/site-builder/designer/discard?${q({ storeId: decl.store_id })}`, { themeFiles: files.map((f) => themePath(decl, f)) });
  if (![200, 204].includes(r.status)) throw new Error(`designer/discard -> ${r.status} ${r.text.slice(0, 200)}`);
}
/** The Content API url of a live theme file, found by listing (the storage layout is read, not assumed). */
async function locateLiveFile(decl, file) {
  const full = posix.join(decl.theme, file);
  for (const folder of [posix.dirname(`/${full}`), posix.dirname(`/${decl.theme}/${full}`)]) {
    const r = await raw('GET', `/api/content/themes/${encodeURIComponent(decl.store_id)}/search?${q({ folderUrl: folder })}`);
    const hit = (Array.isArray(r.json) ? r.json : []).find((x) => x.type !== 'folder' && x.name === posix.basename(file));
    if (hit) return hit.relativeUrl || `${folder}/${hit.name}`;
  }
  return null;
}
async function deleteLiveFile(decl, file) {
  const url = await locateLiveFile(decl, file);
  if (!url) return `not found (already absent)`;
  const r = await raw('DELETE', `/api/content/themes/${encodeURIComponent(decl.store_id)}?${q({ urls: url })}`);
  if (![200, 204].includes(r.status)) throw new Error(`DELETE content ${url} -> ${r.status} ${r.text.slice(0, 200)}`);
  return `deleted ${url}`;
}

/* ── found-state record (gitignored) ─────────────────────────────────────── */
const statePath = (decl) => join(ROOT, 'results', 'seed-state', `site-builder-theme.${ENV}.${decl.store_id}.json`);
function loadState(decl) {
  const p = statePath(decl);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
function saveState(decl, state) {
  const p = statePath(decl);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`);
}

/* ── product discovery (the rule's subject and its control) ──────────────── */
async function discoverProduct(storeId, productType) {
  const query = 'query($s:String!,$f:String){ products(storeId:$s, cultureName:"en-US", first:5, filter:$f){ items { id code name productType } } }';
  const r = await raw('POST', '/graphql', { query, variables: { s: storeId, f: `productType:${productType}` } });
  const item = (r.json?.data?.products?.items || []).find((p) => p.productType === productType);
  if (!item) throw new Error(`no ${productType} product visible on ${storeId} through xAPI — the rule would decide nothing`);
  return item;
}

/* ── SB_THEME_B2B ────────────────────────────────────────────────────────── */
async function seedTheme(decl) {
  const problems = themeProblems(decl);
  if (problems.length) throw new Error(`SB_THEME_B2B declaration: ${problems.join('; ')}`);
  const storeId = decl.store_id;
  const catalog = await readCatalog(storeId);
  const before = await themeStatus(storeId);
  const ours = new Set(themeFiles(decl));
  const foreign = before.drafts.filter((d) => !ours.has(d));
  if (foreign.length) throw new Error(`${storeId} has pending theme drafts that are not ours (${foreign.join(', ')}) — a publish would ship them; publish or discard them first`);

  const live = await readAll(decl);
  let state = loadState(decl);
  if (!state) {
    state = { captured_at: new Date().toISOString(), store_id: storeId, theme: decl.theme, publication_before: before.publication, files: Object.fromEntries(Object.entries(live).map(([f, v]) => [f, v.content])) };
    if (!DRY_RUN) saveState(decl, state);
    log(`found state recorded (publication ${before.publication ?? 'none'}; absent: ${Object.entries(state.files).filter(([, c]) => c == null).map(([f]) => f).join(', ') || 'none'})${DRY_RUN ? ' [DRY: not written]' : ` → ${statePath(decl).slice(ROOT.length + 1)}`}`);
  } else log(`found state reused from ${state.captured_at} (publication ${state.publication_before ?? 'none'})`);

  const found = Object.fromEntries(Object.entries(state.files).map(([f, c]) => [f, parseFile(c, f)]));
  const gen = await raw('POST', `/api/site-builder/theme/palette?${q({ storeId })}`, paletteRequest(decl, catalog));
  if (gen.status !== 200 || !gen.json?.light) throw new Error(`theme/palette -> ${gen.status} ${gen.text.slice(0, 200)}`);
  const check = await raw('POST', `/api/site-builder/theme/palette/check?${q({ storeId })}`, { palette: gen.json, tokens: catalog.paletteTokens });
  if (check.status !== 200 || (check.json?.failures || []).length) throw new Error(`generated palette fails AA: ${JSON.stringify(check.json?.failures || check.text).slice(0, 300)}`);
  const desired = desiredFiles(decl, found, gen.json);

  const changed = [];
  for (const [file, value] of Object.entries(desired)) {
    const cur = parseFile(live[file].content, file);
    if (!sameJson(cur, value)) changed.push({ file, eTag: live[file].eTag, content: stringify(value) });
  }
  const ruleProduct = await discoverProduct(storeId, decl.rule.product_type);
  const control = await discoverProduct(storeId, decl.rule.control_product_type);
  log(`rule subject ${ruleProduct.code} (${ruleProduct.productType}) · control ${control.code} (${control.productType})`);

  let publication = before.publication;
  if (!changed.length && !before.drafts.length) log(`theme already as declared (publication ${publication}) — no publish`);
  else if (DRY_RUN) log(`[DRY] would save ${changed.map((c) => c.file).join(', ') || '(drafts only)'} and publish (catalog ${catalog.hash})`);
  else {
    if (changed.length) await saveFiles(decl, catalog.hash, changed);
    publication = await publishSettled(decl, catalog.hash, themeFiles(decl));
    log(`published ${changed.length} file(s) → publication ${before.publication ?? 'none'} → ${publication}`);
  }

  if (!DRY_RUN) {
    let snap = null; let missing = [];
    try { await waitFor('the snapshot to carry the markers', async () => { snap = await snapshot(storeId); missing = snapshotMarkers(decl).filter((m) => !String(snap?.content || '').includes(m)); return !missing.length; }); } catch { /* reported below */ }
    const after = await themeStatus(storeId);
    log(`verify: status publication ${after.publication}, drafts ${after.drafts.length}; snapshot publication ${snap?.publication}, markers ${missing.length ? `MISSING ${missing.join(' | ')}` : 'all present'}`);
    if (after.drafts.length || missing.length) throw new Error('theme verification failed — see above');
    writeEnvAliasOverride({ [THEME_ALIAS]: {
      publication_before: state.publication_before, publication_after: publication, publication_restored: null, catalog_hash: catalog.hash,
      found_absent_files: Object.entries(state.files).filter(([, c]) => c == null).map(([f]) => f),
      rule_product_id: ruleProduct.id, rule_product_sku: ruleProduct.code, rule_product_name: ruleProduct.name,
      control_product_id: control.id, control_product_sku: control.code, control_product_name: control.name,
    } });
  }
}

async function teardownTheme(decl) {
  const storeId = decl.store_id;
  let state = loadState(decl);
  if (!state) {
    // Fallback: the alias record lists the files that were absent; enough only when ALL of them were.
    const rec = JSON.parse(readFileSync(join(ROOT, `test-data/aliases.${ENV}.json`), 'utf8'))[THEME_ALIAS] || {};
    const absent = new Set(rec.found_absent_files || []);
    if (!rec.publication_after) { log('SB_THEME_B2B: nothing seeded on this env (no state file, no publication record) — skip'); return; }
    if (!themeFiles(decl).every((f) => absent.has(f))) throw new Error(`no found-state file (${statePath(decl)}) and the alias record does not cover every file — restore by hand`);
    state = { files: Object.fromEntries(themeFiles(decl).map((f) => [f, null])), publication_before: rec.publication_before };
    log('found state rebuilt from the alias record (every touched file was absent)');
  }
  const catalog = await readCatalog(storeId);
  const before = await themeStatus(storeId);
  const ours = themeFiles(decl);
  const ourDrafts = before.drafts.filter((d) => ours.includes(d));
  const foreign = before.drafts.filter((d) => !ours.includes(d));
  if (foreign.length) throw new Error(`pending drafts that are not ours (${foreign.join(', ')}) — the restoring publish would ship them; resolve them first`);
  if (DRY_RUN) { log(`[DRY] would discard ${ourDrafts.length} draft(s), restore ${ours.length} file(s) as found, publish once`); return; }
  if (ourDrafts.length) { await discardDrafts(decl, ourDrafts); log(`discarded drafts: ${ourDrafts.join(', ')}`); }

  const live = await readAll(decl);
  const saves = [];
  const removals = [];
  for (const f of ours) {
    const want = state.files[f];
    if (want == null) { if (live[f].content != null) removals.push(f); }
    else if (!sameJson(parseFile(live[f].content, f), parseFile(want, f))) saves.push({ file: f, eTag: live[f].eTag, content: want });
  }
  // 1) put the found contents back and publish — the rules no longer name our template after this
  if (saves.length) await saveFiles(decl, catalog.hash, saves);
  let restored = await publishSettled(decl, catalog.hash, ours);
  // 2) only now remove the files that were absent (removing first made the publish 500 on a stale listing),
  //    then publish again so the snapshot no longer lists them
  if (removals.length) {
    for (const f of removals) log(`  ${f}: ${await deleteLiveFile(decl, f)}`);
    await waitFor('the removed files to read as absent', async () => {
      for (const f of removals) if ((await readThemeFile(decl, f)).content != null) return false;
      return true;
    });
    restored = await publishSettled(decl, catalog.hash, ours);
  }
  log(`restoring publish → publication ${restored} (found state was publication ${state.publication_before ?? 'none'})`);

  const driftNow = async () => { const a = await readAll(decl); return ours.filter((f) => !sameJson(parseFile(a[f].content, f), parseFile(state.files[f], f))); };
  let drift = [];
  try { await waitFor('the files to read back as found', async () => (drift = await driftNow()).length === 0); } catch { /* reported below */ }
  let snap = null; let left = [];
  try { await waitFor('the snapshot to drop the markers', async () => { snap = await snapshot(storeId); left = snapshotMarkers(decl).filter((m) => String(snap?.content || '').includes(m)); return !left.length; }); } catch { /* reported below */ }
  const st = await themeStatus(storeId);
  log(`verify: files ${drift.length ? `DIFFER ${drift.join(', ')}` : 'all as found'}; drafts ${st.drafts.length}; snapshot ${snap?.publication} markers ${left.length ? `STILL PRESENT ${left.join(' | ')}` : 'gone'}`);
  if (drift.length || left.length || st.drafts.length) throw new Error('theme teardown verification failed — see above (the found-state file is kept)');
  rmSync(statePath(decl), { force: true });
  writeEnvAliasOverride({ [THEME_ALIAS]: { publication_restored: restored, publication_after: null, catalog_hash: null } });
}

/* ── SB_STORE_EDITOR / SB_THEME_EDITOR_NOPUBLISH ─────────────────────────── */
const getRole = (name) => api('GET', `/api/platform/security/roles/${encodeURIComponent(name)}`, null, { expectStatus: [200, 204, 404] });
const getUser = (login) => api('GET', `/api/platform/security/users/${encodeURIComponent(login)}`, null, { expectStatus: [200, 204, 404] });

async function ensureRole(decl, moduleId) {
  // KB-4FEABEDD: a first PUT without id/moduleId keeps the role but drops the store scope — so PUT, read the
  // id back, PUT again with it, and fail loud if a declared scope is still missing.
  await api('PUT', '/api/platform/security/roles', roleBody(decl, { moduleId }), { expectStatus: [200, 201, 204] });
  let role = await getRole(decl.role);
  if (!role?.id) throw new Error(`role ${decl.role} not readable after PUT`);
  await api('PUT', '/api/platform/security/roles', roleBody(decl, { id: role.id, moduleId }), { expectStatus: [200, 201, 204] });
  role = await getRole(decl.role);
  const lost = lostScopes(decl, role);
  if (lost.length) throw new Error(`${decl.role}: store scope dropped by the platform for ${lost.join(', ')}`);
  return role;
}

async function ensureUser(decl, role) {
  const password = resolvePassword(`{{${decl.password_var}}}`);
  let user = await getUser(decl.login);
  if (!user?.id) {
    const res = await api('POST', '/api/platform/security/users/create', accountBody(decl, { password, roleId: role.id }));
    if (res && res.succeeded === false) throw new Error(`create ${decl.login}: ${JSON.stringify(res.errors)}`);
    user = await getUser(decl.login);
    accountSet(decl.login, password, decl.password_var);
    log(`  + user ${decl.login} (${user.id})`);
  } else {
    let dirty = false;
    if ((user.roles || []).length !== 1 || user.roles[0].id !== role.id) { user.roles = [{ id: role.id, name: role.name }]; dirty = true; }
    if (user.isAdministrator) { user.isAdministrator = false; dirty = true; }
    if (dirty) await api('PUT', '/api/platform/security/users', user, { expectStatus: [200, 204] });
    if (isGeneratedPassword(password)) log(`  ⚠ ${decl.login}: password NOT reset — the store has no value for ${decl.password_var}`);
    else { await resetSecurityPassword(api, decl.login, password); accountSet(decl.login, password, decl.password_var); }
    log(`  = user ${decl.login} (${user.id})${dirty ? ' — role/admin flag reconciled' : ''}`);
  }
  return { user, password };
}

/**
 * Probes that change nothing: reads, the palette check (a POST that only computes), and a publish of a page
 * id that does not exist — the permission gate answers before the lookup, so a 403 is the permission and a
 * 404/400 means the user got past it.
 */
async function probeEditor(alias, decl, password) {
  const tok = await token(decl.login, password);
  if (!tok) return [`${alias}: ${decl.login} cannot sign in with ${decl.password_var}`];
  const scoped = decl.permissions.match(/builder:read@([^,\s]+)/)[1];
  const hasTheme = /\bbuilder:theme\b/.test(decl.permissions);
  const pair = { color_body_text: '#1a1a1a', color_body_bg: '#ffffff' };
  const tokens = { light: Object.keys(pair), dark: Object.keys(pair) };
  const notForbidden = (st) => st !== 403 && st !== 401;
  const checks = [
    ['theme/status scoped store', await raw('GET', `/api/site-builder/theme/status?${q({ storeId: scoped })}`, undefined, tok), 200],
    ['pages/search scoped store', await raw('POST', '/api/site-builder-pages/search', { storeId: scoped, take: 1 }, tok), 200],
    ['theme/status other store', await raw('GET', `/api/site-builder/theme/status?${q({ storeId: decl.other_store })}`, undefined, tok), 403],
    ['pages/search other store', await raw('POST', '/api/site-builder-pages/search', { storeId: decl.other_store, take: 1 }, tok), 403],
    ['palette/check (builder:theme)', await raw('POST', `/api/site-builder/theme/palette/check?${q({ storeId: scoped })}`, { palette: { light: pair, dark: pair }, tokens }, tok), hasTheme ? notForbidden : 403],
    ['page publishing (builder:publish)', await raw('POST', `/api/site-builder-pages/grouped/publishing/agent-test-sb-no-such-page?publish=true`, undefined, tok), 403],
  ];
  const out = [];
  for (const [what, r, wantStatus] of checks) {
    const ok = typeof wantStatus === 'function' ? wantStatus(r.status) : r.status === wantStatus;
    const label = typeof wantStatus === 'function' ? 'not 403' : wantStatus;
    log(`    ${ok ? 'ok  ' : 'FAIL'} ${alias} ${what}: ${r.status} (want ${label})`);
    if (!ok) out.push(`${alias} ${what}: ${r.status}, want ${label}`);
  }
  return out;
}

async function seedEditors(aliases, moduleId) {
  const decls = Object.fromEntries(EDITOR_ALIASES.map((a) => [a, DECL[a]]));
  const problems = editorProblems(decls);
  if (problems.length) throw new Error(`editor declarations: ${problems.join('; ')}`);
  const failures = [];
  for (const alias of aliases) {
    const decl = decls[alias];
    if (DRY_RUN) { log(`[DRY] would upsert role "${decl.role}" (${decl.permissions}) + user ${decl.login}, then probe`); continue; }
    const role = await ensureRole(decl, moduleId);
    const { user, password } = await ensureUser(decl, role);
    failures.push(...await probeEditor(alias, decl, password));
    writeEnvAliasOverride({ [alias]: { role_id: role.id, user_id: user.id } });
  }
  if (failures.length) throw new Error(`${failures.length} editor probe(s) failed`);
}

async function teardownEditors(aliases) {
  const residue = [];
  for (const alias of aliases) {
    const decl = DECL[alias];
    const role = await getRole(decl.role);
    if (DRY_RUN) { log(`[DRY] would delete user ${decl.login} and role "${decl.role}"`); continue; }
    await api('DELETE', `/api/platform/security/users?${q({ names: decl.login })}`, null, { expectStatus: [200, 204, 404] });
    if (role?.id) await api('DELETE', `/api/platform/security/roles?${q({ ids: role.id })}`, null, { expectStatus: [200, 204, 404] });
    if ((await getUser(decl.login))?.id) residue.push(`user ${decl.login}`);
    if ((await getRole(decl.role))?.id) residue.push(`role ${decl.role}`);
    writeEnvAliasOverride({ [alias]: { role_id: '', user_id: '' } });
    log(`  x ${alias}: user ${decl.login} + role "${decl.role}"`);
  }
  if (residue.length) throw new Error(`teardown left residue: ${residue.join(', ')}`);
}

async function main() {
  assertSafeTarget();
  await auth();
  const R = await resolveBuilderRoutes(api);
  log(`Site Builder fixtures on ${ENV}: ${[...want].join(', ')}${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  if (R.family !== 'site-builder') { log(`${R.moduleId} is installed, not Site Builder — these fixtures do not apply here; nothing to do`); return; }
  const editors = EDITOR_ALIASES.filter((a) => want.has(a));
  if (TEARDOWN) {
    if (editors.length) await teardownEditors(editors);
    if (want.has(THEME_ALIAS)) await teardownTheme(DECL[THEME_ALIAS]);
  } else {
    if (want.has(THEME_ALIAS)) await seedTheme(DECL[THEME_ALIAS]);
    if (editors.length) await seedEditors(editors, R.moduleId);
  }
  log(DRY_RUN ? 'DRY RUN complete.' : (TEARDOWN ? 'Teardown complete — zero residue.' : 'Seed complete.'));
}

main().catch((e) => { console.error(`SEED FAILED: ${e.message}`); process.exit(1); });

