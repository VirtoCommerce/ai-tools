#!/usr/bin/env node
/**
 * scripts/seed-data/cms/seed-pagebuilder-shared-components.mjs
 *
 * Provisions the VCST-4933 Page Builder SHARED COMPONENTS fixture set on the target env,
 * idempotently, in dependency order:
 *
 *   1. four shared components (multi / single / unused-deletable / used-undeletable)
 *   2. six pages (master, two published consumers, a Draft consumer, the delete-holder, the
 *      A/B control), each filled from the content fixture with `{ref}` markers resolved into
 *      real 3-key linked placements, then published (except the deliberately-Draft one)
 *   3. seven permission roles + Manager accounts differing ONLY on the four
 *      builder:shared-components:* permissions (plus one StoreId-mismatch CONTROL account)
 *
 * Teardown runs the exact reverse (accounts+roles -> pages -> components) and DELETES, so it is
 * genuinely zero-residue: a shared component cannot be deleted while a page still references it,
 * which is why pages must go first.
 *
 * Single source of truth: ./shared-components-specs.mjs (side-effect-free).
 * Content fixture: test-data/cms/shared-components-content.json.
 * Runtime ids (page groupIds, component ids, user ids, role ids) -> aliases.<env>.json.
 *
 *   TEST_ENV=vcptcore npm run seed:pb-shared
 *   TEST_ENV=vcptcore npm run seed:pb-shared -- --dry-run --verbose
 *   TEST_ENV=vcptcore npm run seed:pb-shared -- --verify     # live delivery + token + usage proof
 *   TEST_ENV=vcptcore npm run seed:pb-shared:teardown
 *
 * --verify EXITS NON-ZERO when a proof cannot be made. A published page that does not DELIVER its
 * text on the storefront fails here rather than reaching a tester as a phantom product bug — the
 * 2026-09-16 blank-render incident (block type "Text", capitalised) was exactly that.
 *
 * Flags: --dry-run, --verbose, --teardown, --verify.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, DRY_RUN, TEARDOWN,
  ROOT, BACK_URL, FRONT_URL, STORE_ID, writeEnvAliasOverride,
} from '../../lib/seed-common.mjs';
import {
  COMPONENTS, PAGES, PERMISSION_USERS, STATUS, CONTENT_FILE, RENDERING_BLOCK_TYPES,
  SC_USER_PASSWORD_VAR, SC_USER_PASSWORD_FALLBACK,
  userEmail, roleId, roleName, rolePermissions, excludedPermissions, roleBody, accountBody,
  buildComponentCreateBody, buildContentDoc, buildPageContentBody, createGroupedBody, draftBody,
  expectedUsage, pageRefs, isLinkedPlacement, validateFixtureShape,
} from './shared-components-specs.mjs';

const VERIFY = process.argv.includes('--verify');
const SECONDARY_STORE = process.env.STORE_ID_SECONDARY || null;

// ── fixture ──────────────────────────────────────────────────────────────────
let _fixture = null;
function fixture() {
  if (_fixture) return _fixture;
  const p = join(ROOT, CONTENT_FILE);
  if (!existsSync(p)) throw new Error(`content fixture ${CONTENT_FILE} not found`);
  _fixture = JSON.parse(readFileSync(p, 'utf8'));
  const problems = validateFixtureShape(_fixture);
  if (problems.length) throw new Error(`fixture is not seedable:\n   - ${problems.join('\n   - ')}`);
  return _fixture;
}

// ── raw helpers (content is served as text/plain, which seed-common's JSON api() cannot READ) ──
let _tok = null;
async function token() {
  if (_tok) return _tok;
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: process.env.ADMIN, password: process.env.ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`admin /connect/token -> ${res.status}`);
  _tok = (await res.json()).access_token;
  return _tok;
}
async function rawGet(path) {
  const r = await fetch(`${BACK_URL}${path}`, { headers: { Authorization: `Bearer ${await token()}` } });
  const t = await r.text();
  try { return { status: r.status, doc: t ? JSON.parse(t) : null }; } catch { return { status: r.status, doc: null }; }
}

// ── shared components ────────────────────────────────────────────────────────
async function searchComponents() {
  const r = await api('POST', '/api/page-builder-shared-components/search', { storeId: STORE_ID, take: 500 }, { expectStatus: [200, 201] });
  return r?.results || r?.items || [];
}
const getComponent = (id) => api('GET', `/api/page-builder-shared-components/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
const deleteComponent = (id) => api('DELETE', `/api/page-builder-shared-components/${encodeURIComponent(id)}`, null, { expectStatus: [200, 204, 404] });

async function ensureComponent(spec, live) {
  const doc = fixture().components[spec.alias];
  const existing = live.find((c) => c.name === spec.name);
  if (DRY_RUN) {
    log(`  [DRY] would ${existing ? 'reconcile' : 'CREATE'} component ${spec.name} (${doc.content.length} section(s))`);
    return existing?.id || `dry-${spec.alias}`;
  }
  if (existing?.id) {
    // Idempotent: re-post the fixture content so a drifted component is healed to the contract.
    await api('POST', `/api/page-builder-shared-components/${encodeURIComponent(existing.id)}/content`, buildContentDoc(doc), { expectStatus: [200, 201, 204] });
    log(`  ↻ reuse component ${spec.name} (${existing.id}) — content re-applied (${doc.content.length} section(s))`);
    return existing.id;
  }
  const res = await api('POST', '/api/page-builder-shared-components', buildComponentCreateBody(spec, doc, { storeId: STORE_ID }), { expectStatus: [200, 201] });
  const id = res?.id || (await searchComponents()).find((c) => c.name === spec.name)?.id;
  if (!id) throw new Error(`create component ${spec.name}: no id returned`);
  log(`  ✓ create component ${spec.name} (${id}) — ${doc.content.length} section(s)`);
  return id;
}

// ── pages ────────────────────────────────────────────────────────────────────
async function searchPages() {
  const r = await api('POST', '/api/page-builder-pages/search', { storeId: STORE_ID, take: 500 }, { expectStatus: [200] });
  return r?.results || r?.items || [];
}
const getGrouped = (id) => api('GET', `/api/page-builder-pages/grouped/${id}`, null, { expectStatus: [200, 404] });
const upsertGrouped = (body) => api('POST', '/api/page-builder-pages/grouped', body, { expectStatus: [200, 201, 204] });
const publishPage = (id) => api('POST', `/api/page-builder-pages/grouped/publishing/${id}?publish=true`, null, { expectStatus: [200, 201, 204] });
const deletePage = (id) => api('DELETE', `/api/page-builder-pages/grouped/${id}`, null, { expectStatus: [200, 204, 404] });
const postPageContent = (id, body) => api('POST', `/api/page-builder-pages/grouped/${id}/content`, body, { expectStatus: [200, 201, 204] });

async function ensurePage(spec, live, componentIds) {
  const doc = fixture().pages[spec.alias];
  const body = buildPageContentBody(spec, doc, componentIds);
  const existing = live.find((p) => p.name === spec.name && p.status !== STATUS.ARCHIVED);
  if (DRY_RUN) {
    const refs = pageRefs(doc);
    log(`  [DRY] would ${existing ? 'reconcile' : 'CREATE'} page ${spec.name} @ ${spec.permalink} — ${body.content.length} item(s), ${refs.length} linked placement(s), target ${spec.expectStatus}`);
    return existing?.id || `dry-${spec.alias}`;
  }
  let id = existing?.id;
  if (!id) {
    const res = await upsertGrouped(createGroupedBody(spec, { storeId: STORE_ID }));
    id = res?.id || (await searchPages()).find((p) => p.name === spec.name)?.id;
    if (!id) throw new Error(`create page ${spec.name}: no groupId returned`);
    log(`  ✓ create page ${spec.name} (${id}) @ ${spec.permalink}`);
  } else {
    verbose(`reuse page ${spec.name} (${id})`);
  }
  // Content + status in one pass: Draft (so the write lands on the draft projection) -> content ->
  // publish when the spec wants Published. A bare publish on an empty draft drains content.
  const full = await getGrouped(id);
  if (full) await upsertGrouped(Object.assign(draftBody(full), { permalink: spec.permalink, cultureName: spec.culture }));
  await postPageContent(id, body);
  if (spec.expectStatus === STATUS.PUBLISHED) await publishPage(id);
  const after = await getGrouped(id);
  const placements = body.content.filter(isLinkedPlacement).length;
  log(`  ${existing ? '↻ reconcile' : '✓ seeded'} ${spec.name} — ${after?.status || '?'} @ ${spec.permalink}, ${body.content.length} item(s) incl. ${placements} linked placement(s)`);
  return id;
}

// ── permission users ─────────────────────────────────────────────────────────
function scPassword() {
  const raw = process.env[SC_USER_PASSWORD_VAR];
  return (raw && String(raw).trim()) || SC_USER_PASSWORD_FALLBACK;
}
async function findRole(u) {
  const r = await api('POST', '/api/platform/security/roles/search', { keyword: roleName(u), take: 50 }, { expectStatus: [200] });
  return (r?.results || []).find((x) => x.id === roleId(u) || x.name === roleName(u)) || null;
}
async function findUser(email) {
  const s = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 10 }, { expectStatus: [200, 201] });
  return (s?.results || []).find((x) =>
    (x.userName || '').toLowerCase() === email.toLowerCase() || (x.email || '').toLowerCase() === email.toLowerCase()) || null;
}
const getUserById = async (id) => (id ? api('GET', `/api/platform/security/users/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] }) : null);

/** Which store a role's account is bound to. The CONTROL role gets the OTHER store on purpose. */
function storeFor(u) {
  return u.storeScoped ? STORE_ID : (SECONDARY_STORE || `${STORE_ID}-NO-SUCH-STORE`);
}

async function ensurePermissionUser(u) {
  const email = userEmail(u);
  const store = storeFor(u);
  const perms = rolePermissions(u);
  if (DRY_RUN) {
    log(`  [DRY] would ensure role ${roleId(u)} (${perms.length} perms, LACKS ${excludedPermissions(u).join(', ') || 'nothing'}) + account ${email} @ StoreId=${store}`);
    return { userId: `dry-${u.alias}`, roleId: roleId(u) };
  }
  await api('PUT', '/api/platform/security/roles', roleBody(u), { expectStatus: [200, 201, 204] });
  const existing = await findUser(email);
  if (existing?.id) {
    const full = (await getUserById(existing.id)) || existing;
    let dirty = false;
    if (!(full.roles || []).some((r) => r.id === roleId(u))) { full.roles = [{ id: roleId(u), name: roleName(u) }]; dirty = true; }
    if (full.isAdministrator) { full.isAdministrator = false; dirty = true; }
    if (full.storeId !== store) { full.storeId = store; dirty = true; }
    if (dirty) await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
    log(`  ↻ reuse ${u.key} (${email}) — role ${roleId(u)}, StoreId=${store}${dirty ? ' [reconciled]' : ''}`);
    return { userId: existing.id, roleId: roleId(u) };
  }
  const res = await api('POST', '/api/platform/security/users/create', accountBody(u, { password: scPassword(), storeId: store }));
  if (res && res.succeeded === false) throw new Error(`create ${email}: ${JSON.stringify(res.errors)}`);
  const fresh = await findUser(email);
  if (!fresh?.id) throw new Error(`created ${email} but could not resolve its id`);
  log(`  ✓ create ${u.key} (${email}) — Manager, isAdministrator=false, StoreId=${store}, LACKS ${excludedPermissions(u).join(', ') || 'nothing'}`);
  return { userId: fresh.id, roleId: roleId(u) };
}

// ── live verification ────────────────────────────────────────────────────────
async function gql(query, variables) {
  const r = await fetch(`${FRONT_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

/**
 * Prove a published page DELIVERS: the storefront resolves its permalink AND the delivered
 * pageDocument carries rendering block types (and no leftover componentRef marker). This is the
 * check whose absence produced the 2026-09-16 phantom "blank page" Critical.
 */
async function verifyDelivery(spec, permalinkToId) {
  const slug = await gql(
    'query($p:String!,$s:String!,$c:String!){slugInfo(permalink:$p,storeId:$s,cultureName:$c){entityInfo{id objectType}}}',
    { p: spec.permalink, s: STORE_ID, c: spec.culture },
  );
  const id = slug.json?.data?.slugInfo?.entityInfo?.id;
  if (!id) { log(`  ✗ ${spec.permalink} — storefront slugInfo resolved NOTHING`); return false; }
  const docRes = await gql('query($id:String!){pageDocument(id:$id){content}}', { id });
  const raw = docRes.json?.data?.pageDocument?.content;
  if (!raw) { log(`  ✗ ${spec.permalink} — pageDocument returned no content`); return false; }
  const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const items = doc?.content || [];
  const types = [...new Set(items.map((b) => b?.type))];
  const bad = types.filter((t) => !RENDERING_BLOCK_TYPES.includes(t));
  const marker = items.filter((b) => b?.type === 'componentRef').length;
  permalinkToId[spec.permalink] = id;
  if (bad.length) { log(`  ✗ ${spec.permalink} — delivered NON-RENDERING block type(s): ${bad.join(', ')}`); return false; }
  log(`  ✓ ${spec.permalink} — delivered ${items.length} block(s), types [${types.join(', ')}]${marker ? `, ${marker} UNEXPANDED componentRef` : ''}`);
  return true;
}

async function verifyToken(u) {
  const email = userEmail(u);
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password: scPassword() }),
  });
  if (!res.ok) { log(`  ✗ ${u.key} (${email}) — /connect/token ${res.status}`); return false; }
  log(`  ✓ ${u.key} (${email}) — token OK, LACKS [${excludedPermissions(u).join(', ') || 'nothing'}], StoreId=${storeFor(u)}`);
  return true;
}

async function verifyUsage() {
  const live = await searchComponents();
  const { byPages, byRefs } = expectedUsage(fixture());
  let ok = true;
  for (const c of COMPONENTS) {
    const l = live.find((x) => x.name === c.name);
    if (!l) { log(`  ✗ component ${c.name} not found`); ok = false; continue; }
    const detail = await getComponent(l.id);
    const pages = (detail?.usagePages || []).map((p) => `${p.name}(${p.status})`);
    const zeroExpected = byPages[c.alias] === 0;
    const zeroLive = (l.usageCount || 0) === 0;
    if (zeroExpected !== zeroLive) {
      log(`  ✗ ${c.name} — expected usage ${zeroExpected ? '0' : '>0'} (fixture: ${byPages[c.alias]} page(s)/${byRefs[c.alias]} ref(s)), live usageCount=${l.usageCount}`);
      ok = false;
    } else {
      log(`  ✓ ${c.name} — live usageCount=${l.usageCount} (fixture expects ${byPages[c.alias]} page(s) / ${byRefs[c.alias]} ref(s)); usagePages: ${pages.join(', ') || 'none'}`);
    }
  }
  return ok;
}

// ── seed / teardown ──────────────────────────────────────────────────────────
async function seed() {
  const writeback = {};
  const env = process.env.TEST_ENV || 'vcst';

  log('\n  [1/3] shared components');
  const liveComponents = DRY_RUN ? await searchComponents() : await searchComponents();
  const componentIds = {};
  for (const c of COMPONENTS) {
    componentIds[c.alias] = await ensureComponent(c, liveComponents);
    if (!DRY_RUN) writeback[c.alias] = { _inline: true, component_id: componentIds[c.alias], name: c.name };
  }

  log('\n  [2/3] pages');
  const livePages = await searchPages();
  for (const p of PAGES) {
    const id = await ensurePage(p, livePages, componentIds);
    if (!DRY_RUN) writeback[p.alias] = { _inline: true, group_id: id, permalink: p.permalink };
  }

  log('\n  [3/3] permission users');
  if (!SECONDARY_STORE) log('  ⚠ STORE_ID_SECONDARY is unset — the no-StoreId CONTROL account binds to a non-existent store id (still a valid 403 control, but the cross-store case #25 has no real second store)');
  for (const u of PERMISSION_USERS) {
    const { userId, roleId: rid } = await ensurePermissionUser(u);
    if (!DRY_RUN) {
      writeback[u.alias] = {
        _inline: true, platform_id: userId, user_id: userId, role_id: rid,
        email: userEmail(u), store_id: storeFor(u),
      };
    }
  }

  if (!DRY_RUN && Object.keys(writeback).length) {
    writeEnvAliasOverride(writeback);
    log(`\n  ✓ aliases.${env}.json: wrote ${Object.keys(writeback).length} runtime id(s)`);
  }
}

async function teardown() {
  // REVERSE dependency order: accounts+roles -> pages -> components. A component cannot be deleted
  // while a page still references it, so pages MUST go first for a zero-residue sweep.
  log('\n  [1/3] permission accounts + roles');
  for (const u of [...PERMISSION_USERS].reverse()) {
    const email = userEmail(u);
    const user = await findUser(email);
    if (user?.id && !DRY_RUN) { await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] }); log(`  ✗ deleted account ${email}`); }
    else if (DRY_RUN) log(`  [DRY] would delete ${email} + role ${roleId(u)}`);
    else verbose(`account ${email} already gone`);
    const r = await findRole(u);
    if (r?.id && !DRY_RUN) { await api('DELETE', `/api/platform/security/roles?ids=${encodeURIComponent(r.id)}`, null, { expectStatus: [200, 204, 404] }); log(`  ✗ deleted role ${r.id}`); }
  }

  log('\n  [2/3] pages');
  const livePages = await searchPages();
  for (const p of [...PAGES].reverse()) {
    const hit = livePages.filter((x) => x.name === p.name);
    for (const h of hit) {
      if (DRY_RUN) { log(`  [DRY] would delete page ${p.name} (${h.id})`); continue; }
      await deletePage(h.id);
      log(`  ✗ deleted page ${p.name} (${h.id})`);
    }
    if (!hit.length) verbose(`page ${p.name} already gone`);
  }

  log('\n  [3/3] shared components');
  const liveComponents = await searchComponents();
  for (const c of [...COMPONENTS].reverse()) {
    const hit = liveComponents.filter((x) => x.name === c.name);
    for (const h of hit) {
      if (DRY_RUN) { log(`  [DRY] would delete component ${c.name} (${h.id})`); continue; }
      await deleteComponent(h.id);
      log(`  ✗ deleted component ${c.name} (${h.id})`);
    }
    if (!hit.length) verbose(`component ${c.name} already gone`);
  }

  if (DRY_RUN) return;
  // Zero-residue proof.
  const residue = [];
  const pagesLeft = await searchPages();
  for (const p of PAGES) if (pagesLeft.some((x) => x.name === p.name)) residue.push(`page ${p.name}`);
  const compsLeft = await searchComponents();
  for (const c of COMPONENTS) if (compsLeft.some((x) => x.name === c.name)) residue.push(`component ${c.name}`);
  for (const u of PERMISSION_USERS) if ((await findUser(userEmail(u)))?.id) residue.push(`account ${userEmail(u)}`);
  if (residue.length) { log(`\n  ⚠ RESIDUE: ${residue.join(', ')}`); process.exitCode = 1; }
  else log('\n  ✓ teardown zero-residue (pages + components + accounts/roles removed)');
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); return; }
  await seed();
  log(DRY_RUN ? '\nDRY RUN complete.' : '\nSeed complete.');

  if (VERIFY && !DRY_RUN) {
    const results = [];
    log('\n  [verify] storefront delivery (published pages must DELIVER rendering block types)');
    const permalinkToId = {};
    for (const p of PAGES.filter((x) => x.expectStatus === STATUS.PUBLISHED)) {
      results.push({ name: p.permalink, ok: await verifyDelivery(p, permalinkToId) });
    }
    log('\n  [verify] component usage');
    results.push({ name: 'usage counts', ok: await verifyUsage() });
    log('\n  [verify] permission accounts authenticate');
    for (const u of PERMISSION_USERS) results.push({ name: `token ${u.key}`, ok: await verifyToken(u) });

    const failed = results.filter((r) => !r.ok);
    if (failed.length) { log(`\n  ✗ ${failed.length}/${results.length} proof(s) FAILED: ${failed.map((f) => f.name).join(', ')}`); process.exitCode = 1; }
    else log(`\n  ✓ all ${results.length} live proofs confirmed.`);
  }
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
