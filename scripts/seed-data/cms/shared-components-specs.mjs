/**
 * scripts/seed-data/cms/shared-components-specs.mjs
 *
 * SINGLE machine-readable source of truth (side-effect-free) for the VCST-4933 Page Builder
 * SHARED COMPONENTS fixture set: the master/origin page, the linked-placement consumer pages,
 * the Draft consumer, the A/B control page, the four shared components, and the seven
 * permission users the AC8 / Part-0r role axis needs.
 *
 * Importing this module has NO side effects (no env load, no network) so the seeder, the
 * drift-guard validator and the unit tests all share the same definitions.
 *
 * Block-type contract (the trap this fixture set exists to avoid). A prior session authored
 * Page Builder fixtures through REST with block type "Text" (capitalised). The REST API accepts
 * it; the theme has NO renderer for it, so every such page renders BLANK on the storefront with
 * zero console errors — and was very nearly filed as a Critical product bug against this ticket.
 * Rendering block types are LOWERCASE: title | text | image | predefined-product-list. The two
 * this fixture uses (title, text) are transcribed from a page PROVEN to render on this env,
 * /qa-homepage-spring-sale. RENDERING_BLOCK_TYPES below is the gate.
 *
 * Live REST contract (verified on vcptcore-qa 2026-09-16, VirtoCommerce.PageBuilderModule
 * 3.1025.0-pr-159-7361):
 *   components  POST   /api/page-builder-shared-components  { storeId, name, content }
 *                      -> 201 + the created object (id). `content` MUST be a JSON OBJECT
 *                      ({settings,content[]}); an array or a stringified doc both come back
 *                      400 "StoreId, Name, and Content are required."
 *               GET    /api/page-builder-shared-components/{id}          (populates usagePages)
 *               GET    /api/page-builder-shared-components/{id}/content
 *               POST   /api/page-builder-shared-components/{id}/content  (save content)
 *               PUT    /api/page-builder-shared-components/{id}          { storeId, name } (rename)
 *               DELETE /api/page-builder-shared-components/{id}          -> 204
 *               POST   /api/page-builder-shared-components/search { storeId, take }
 *                      -> usagePages is ALWAYS [] here (includePages:false) BY DESIGN; only the
 *                         by-id GET populates it. usageCount IS populated by search.
 *   pages       POST   /api/page-builder-pages/grouped  — REQUIRES a `pages: []` key (omitting it
 *                      is a 500 NullReferenceException, not a 400)
 *               POST   /api/page-builder-pages/grouped/{groupId}/content
 *               POST   /api/page-builder-pages/grouped/publishing/{groupId}?publish=true
 *               DELETE /api/page-builder-pages/grouped/{groupId}  -> true zero-residue teardown
 *
 * No runtime GUID lives here (VCST-5406 / .claude/rules/test-data.md): names, permalinks, role
 * ids and emails are env-invariant business keys; every runtime id (page groupId, component id,
 * platform user id, role id) is written to aliases.<env>.json by the seeder.
 */

export const AGENT_PREFIX = 'AGENT-TEST-';

/** The LOWERCASE block types this theme actually renders. Anything else renders blank. */
export const RENDERING_BLOCK_TYPES = Object.freeze(['title', 'text', 'image', 'predefined-product-list']);

/** Content fixture (nested, API-shaped — never a CSV). */
export const CONTENT_FILE = 'test-data/cms/shared-components-content.json';

export const STATUS = { PUBLISHED: 'Published', DRAFT: 'Draft', ARCHIVED: 'Archived' };

// ============================================================================
// SHARED COMPONENTS
// ============================================================================
//
// DELETION IS TERMINAL (test model Part 0 "Fixture lifecycle"): scenarios #21 and #22 CONSUME the
// component they delete, so each gets its OWN component that no other scenario touches. SC_MULTI /
// SC_SINGLE are the reusable ones (usage is reversible via remove/detach, so they may be shared).
export const COMPONENTS = [
  {
    alias: 'SC_MULTI',
    name: 'AGENT-TEST-SC-Multi-Trio',
    arity: 'multi',
    role: 'multi-section (3) component used on SEVERAL pages — VA multi-section, VC used-many (#1,#7,#9,#11,#12,#16,#17)',
  },
  {
    alias: 'SC_SINGLE',
    name: 'AGENT-TEST-SC-Single',
    arity: 'single',
    role: 'single-section component — the VA single-section boundary partition (#2)',
  },
  {
    alias: 'SC_UNUSED',
    name: 'AGENT-TEST-SC-Unused-Deletable',
    arity: 'single',
    role: 'UNUSED (usage 0) — reserved for the delete-SUCCEEDS case (#21). Nothing may reference it.',
  },
  {
    alias: 'SC_USED',
    name: 'AGENT-TEST-SC-Used-Undeletable',
    arity: 'single',
    role: 'USED (usage 1, held by PB_SC_DELETE_HOLDER only) — reserved for the delete-BLOCKED case (#22).',
  },
];

// ============================================================================
// PAGES
// ============================================================================
//
// `refs` is DERIVED from the content fixture at build time, not declared here — see pageRefs().
export const PAGES = [
  {
    alias: 'PB_SC_MASTER',
    name: 'AGENT-TEST-SC-Master',
    permalink: '/agent-test-sc-master',
    culture: 'en-US',
    expectStatus: STATUS.PUBLISHED,
    role: 'master/origin page: 5 adjacent top-level sections (ALPHA..ECHO) so a 3-section adjacent '
      + 'selection (BRAVO/CHARLIE/DELTA) leaves ONE unselected section on EACH side whose ORDER is '
      + 'checkable afterwards (#1,#3)',
  },
  {
    alias: 'PB_SC_CONSUMER_A',
    name: 'AGENT-TEST-SC-Consumer-A',
    permalink: '/agent-test-sc-consumer-a',
    culture: 'en-US',
    expectStatus: STATUS.PUBLISHED,
    role: 'published consumer page with ONE linked placement of SC_MULTI between two own sections (#6,#7,#12,#16,#17)',
  },
  {
    alias: 'PB_SC_CONSUMER_B',
    name: 'AGENT-TEST-SC-Consumer-B',
    permalink: '/agent-test-sc-consumer-b',
    culture: 'en-US',
    expectStatus: STATUS.PUBLISHED,
    role: 'second published consumer: linked placements of BOTH SC_MULTI and SC_SINGLE — makes '
      + 'SC_MULTI used-on-many and puts the single/multi arity pair on one page (#2,#9,#12)',
  },
  {
    alias: 'PB_SC_CONSUMER_DRAFT',
    name: 'AGENT-TEST-SC-Consumer-Draft',
    permalink: '/agent-test-sc-consumer-draft',
    culture: 'en-US',
    expectStatus: STATUS.DRAFT,
    role: 'DRAFT consumer holding a linked placement — the VF Draft-vs-Published pair with '
      + 'PB_SC_CONSUMER_A (#15). Deliberately never published.',
  },
  {
    alias: 'PB_SC_DELETE_HOLDER',
    name: 'AGENT-TEST-SC-Delete-Holder',
    permalink: '/agent-test-sc-delete-holder',
    culture: 'en-US',
    expectStatus: STATUS.PUBLISHED,
    role: 'the ONLY page referencing SC_USED — isolates the delete-BLOCKED case (#22) so consuming '
      + 'it cannot damage the consumer pages',
  },
  {
    alias: 'PB_SC_CONTROL',
    name: 'AGENT-TEST-SC-Control',
    permalink: '/agent-test-sc-control',
    culture: 'en-US',
    expectStatus: STATUS.PUBLISHED,
    role: 'A/B CONTROL: identical block shapes, ZERO shared components. Any "does not render" claim '
      + 'must be checked against this page first (the 2026-09-16 blank-render was a FIXTURE defect).',
  },
];

// ============================================================================
// PERMISSION USERS (the Part-0r FIXTURE-GAP — the whole AC8 role axis)
// ============================================================================
//
// Every role carries the SAME full page-builder base (so reaching the Designer and saving a page is
// never the variable) and differs ONLY on the four builder:shared-components:* permissions. That
// single-axis divergence is what makes a permission finding attributable (.claude/rules/test-data.md
// SECOND RULE): if the base differed too, a 403 could not be pinned on the shared-components gate.
export const SC_PERMISSIONS = Object.freeze([
  'builder:shared-components:read',
  'builder:shared-components:create',
  'builder:shared-components:update',
  'builder:shared-components:delete',
]);

/** Page Builder base every role holds — the perms the page/designer routes themselves require. */
export const BUILDER_BASE_PERMISSIONS = Object.freeze([
  'builder:access', 'builder:read', 'builder:create', 'builder:update', 'builder:delete', 'builder:publish',
]);

/** The shared secret var for all seven accounts (never a literal in committed data). */
export const SC_USER_PASSWORD_VAR = 'PAGEBUILDER_SC_USER_PASSWORD';
export const SC_USER_PASSWORD_FALLBACK = 'Password1!'; // localhost-safe default, mirrors user-provision.mjs

/**
 * `omit` names the shared-components verbs the role must NOT hold; the permission set is DERIVED
 * from SC_PERMISSIONS minus those (see rolePermissions) — never transcribed, so "all four minus
 * one" cannot drift away from the four.
 *
 * `storeScoped:false` is the CONTROL role (BSC-3): it holds every permission but its user.StoreId
 * does NOT match, so it must 403 on every store-scoped route. A uniform 403 there is CORRECT
 * behaviour, and step 2 of BSC-3 (the builder:read pages-search probe) must also 403 before any
 * permission finding may be filed.
 */
export const PERMISSION_USERS = [
  { alias: 'SC_PERM_ALL',      key: 'sc-all',      omit: [],          storeScoped: true,  role: 'holds all four — the positive control (#23, BSC-1)' },
  { alias: 'SC_PERM_READ',     key: 'sc-read',     omit: ['create', 'update', 'delete'], storeScoped: true, role: 'read-only — look but do not touch (#24, BSC-2)' },
  { alias: 'SC_PERM_NOCREATE', key: 'sc-nocreate', omit: ['create'],  storeScoped: true,  role: 'all four minus CREATE (#24)' },
  { alias: 'SC_PERM_NOUPDATE', key: 'sc-noupdate', omit: ['update'],  storeScoped: true,  role: 'all four minus UPDATE (#24)' },
  { alias: 'SC_PERM_NODELETE', key: 'sc-nodelete', omit: ['delete'],  storeScoped: true,  role: 'all four minus DELETE (#24)' },
  { alias: 'SC_PERM_NOREAD',   key: 'sc-noread',   omit: ['read', 'create', 'update', 'delete'], storeScoped: true, role: 'none of the four (#24)' },
  { alias: 'SC_PERM_NOSTORE',  key: 'sc-nostore',  omit: [],          storeScoped: false, role: 'CONTROL: holds all four but user.StoreId does NOT match — must 403 everywhere, which is CORRECT (#26, BSC-3)' },
];

/** Stable, env-invariant business keys derived from the role key (never hand-transcribed). */
export const userEmail = (u) => `${AGENT_PREFIX}${u.key}@test.virtocommerce.com`;
export const roleId = (u) => `${AGENT_PREFIX}PB-SC-${u.key}`;
export const roleName = roleId;

/**
 * DERIVE a role's permission set: the full builder base + the four shared-components permissions
 * minus the omitted verbs. Pure. This is the derivation the unit test covers — a wrong `omit`
 * mapping seeds a role that silently proves nothing.
 */
export function rolePermissions(u) {
  const omit = new Set((u.omit || []).map((v) => `builder:shared-components:${v}`));
  return [...BUILDER_BASE_PERMISSIONS, ...SC_PERMISSIONS.filter((p) => !omit.has(p))];
}

/** The shared-components permissions a role deliberately LACKS (the boundary under test). */
export function excludedPermissions(u) {
  const held = new Set(rolePermissions(u));
  return SC_PERMISSIONS.filter((p) => !held.has(p));
}

/** Idempotent role upsert body (PUT /api/platform/security/roles). */
export function roleBody(u) {
  return {
    id: roleId(u),
    name: roleName(u),
    description: `AGENT-TEST VCST-4933 shared-components role (${u.key}): ${u.role}. Safe to delete.`,
    permissions: rolePermissions(u).map((name) => ({ name })),
  };
}

/**
 * security/users/create body. userType Manager = back-office user; isAdministrator MUST be false or
 * every permission check is bypassed and each role would read as "allowed". `storeId` is the user's
 * StoreId — the CONTROL role gets the OTHER store, which is the whole point of #26.
 */
export function accountBody(u, { password, storeId }) {
  const email = userEmail(u);
  return {
    userName: email,
    email,
    password,
    storeId,
    userType: 'Manager',
    isAdministrator: false,
    roles: [{ id: roleId(u), name: roleName(u) }],
  };
}

// ============================================================================
// CONTENT BUILDERS (the derivation — unit-tested)
// ============================================================================

/** Deterministic block id: `<sanitised type><NN>` — never a platform GUID. */
export function blockId(type, index) {
  return `${String(type || 'block').replace(/[^a-z0-9]/gi, '')}${String(index + 1).padStart(2, '0')}`;
}

/** Deterministic placement id for the Nth placement on a page: env-invariant and collision-free. */
export function placementId(pageAlias, index) {
  return `agsc-${String(pageAlias).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ref${String(index + 1).padStart(2, '0')}`;
}

/**
 * A LINKED placement: a top-level page-content item with EXACTLY three keys. An item carrying extra
 * keys (e.g. type:"section" plus a componentRef property) is an ordinary, inert section — the
 * server ignores it — so the key count is part of the contract, not cosmetics.
 */
export function placementItem(id, componentId) {
  return { id, type: 'componentRef', componentRef: componentId };
}

/** Is `item` a real linked placement? type==='componentRef' AND exactly three keys. */
export function isLinkedPlacement(item) {
  return !!item && item.type === 'componentRef' && Object.keys(item).length === 3
    && typeof item.id === 'string' && typeof item.componentRef === 'string';
}

/** The component aliases a page's fixture doc references, in order (derived, never declared). */
export function pageRefs(doc) {
  return (doc?.content || []).filter((b) => b && typeof b.ref === 'string').map((b) => b.ref);
}

/**
 * Build a shared component's CREATE body. `content` must be a JSON OBJECT — an array or a
 * stringified doc is rejected 400 "StoreId, Name, and Content are required" (verified live).
 */
export function buildComponentCreateBody(spec, doc, { storeId }) {
  return { storeId, name: spec.name, content: buildContentDoc(doc) };
}

/** Deep-copy a fixture doc and assign deterministic block ids. Pure; never mutates the fixture. */
export function buildContentDoc(doc) {
  const out = { settings: { ...(doc?.settings || {}) }, content: [] };
  (doc?.content || []).forEach((block, i) => {
    const b = { ...block };
    b.id = blockId(b.type, i);
    if (!('background' in b)) b.background = null;
    out.content.push(b);
  });
  return out;
}

/**
 * Build a PAGE content body, resolving every `{ref:"<ALIAS>"}` marker into a real 3-key linked
 * placement against the runtime component ids. Placement ids are deterministic and numbered over
 * the placements only (so two placements of one component on one page never collide — #18).
 * Throws on an unresolved alias rather than silently emitting a dangling reference.
 */
export function buildPageContentBody(pageSpec, doc, componentIds = {}) {
  const out = { settings: { ...(doc?.settings || {}) }, content: [] };
  let refN = 0;
  (doc?.content || []).forEach((block, i) => {
    if (block && typeof block.ref === 'string') {
      const cid = componentIds[block.ref];
      if (!cid) throw new Error(`page ${pageSpec.alias}: unresolved component ref "${block.ref}"`);
      out.content.push(placementItem(placementId(pageSpec.alias, refN), cid));
      refN += 1;
      return;
    }
    const b = { ...block };
    b.id = blockId(b.type, i);
    if (!('background' in b)) b.background = null;
    out.content.push(b);
  });
  return out;
}

/**
 * DERIVE each component's expected usage count from the page fixtures: the number of PAGES holding
 * at least one reference to it (a page with two placements of one component is still one page in
 * usagePages, but usageCount is per-reference — both are reported, so the seeder states which it
 * observed rather than asserting a product ruling #3/#11 has not been made).
 */
export function expectedUsage(fixture) {
  const byPages = {}; const byRefs = {};
  for (const c of COMPONENTS) { byPages[c.alias] = 0; byRefs[c.alias] = 0; }
  for (const p of PAGES) {
    const refs = pageRefs(fixture?.pages?.[p.alias]);
    const seen = new Set();
    for (const r of refs) {
      if (byRefs[r] === undefined) continue;
      byRefs[r] += 1;
      if (!seen.has(r)) { byPages[r] += 1; seen.add(r); }
    }
  }
  return { byPages, byRefs };
}

/** Grouped-page CREATE body. `pages: []` is MANDATORY — omitting it is a 500 NRE, not a 400. */
export function createGroupedBody(spec, { storeId }) {
  return {
    storeId,
    cultureName: spec.culture,
    name: spec.name,
    permalink: spec.permalink,
    visibility: true,
    status: STATUS.DRAFT,
    pages: [],
  };
}

/** Restore-to-Draft body from a fetched grouped page (used before a content write + publish). */
export function draftBody(full) {
  const body = JSON.parse(JSON.stringify(full));
  body.status = STATUS.DRAFT;
  (body.pages || []).forEach((p) => { p.status = STATUS.DRAFT; });
  return body;
}

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
/** Runtime GUIDs that leaked into a committed file (also catches the 32-hex component id form). */
export function findGuidLeaks(text) {
  const s = String(text);
  return [...(s.match(new RegExp(GUID_RE, 'gi')) || []), ...(s.match(/\b[0-9a-f]{32}\b/gi) || [])];
}

/**
 * Non-vacuity + shape contract over the committed fixture. Returns an array of problem strings
 * (empty = clean). Lives HERE so the drift guard owns it (.claude/rules/test-data.md FOURTH RULE:
 * declared data belongs to td:validate:<domain>, not to a unit test).
 */
export function validateFixtureShape(fixture) {
  const problems = [];
  const texts = [];
  const collect = (doc, where) => {
    for (const b of doc?.content || []) {
      if (b && typeof b.ref === 'string') continue;
      if (!RENDERING_BLOCK_TYPES.includes(b?.type)) {
        problems.push(`${where}: block type "${b?.type}" is not a RENDERING type (${RENDERING_BLOCK_TYPES.join('|')}) — such a page renders BLANK`);
        continue;
      }
      const t = b.type === 'title' ? `${b.title} ${b.subtitle || ''}` : b.text;
      if (!String(t || '').trim()) problems.push(`${where}: block ${b.type} carries no text`);
      texts.push(String(t).trim());
    }
  };

  for (const c of COMPONENTS) {
    const doc = fixture?.components?.[c.alias];
    if (!doc) { problems.push(`component ${c.alias}: no content doc in ${CONTENT_FILE}`); continue; }
    collect(doc, `component ${c.alias}`);
    const n = (doc.content || []).length;
    if (c.arity === 'multi' && n < 3) problems.push(`component ${c.alias}: arity "multi" needs >= 3 sections, has ${n}`);
    if (c.arity === 'single' && n !== 1) problems.push(`component ${c.alias}: arity "single" needs exactly 1 section, has ${n}`);
  }

  const master = fixture?.pages?.PB_SC_MASTER;
  if ((master?.content || []).length < 4) {
    problems.push(`PB_SC_MASTER: needs >= 4 adjacent top-level sections so a 3-section selection leaves an unselected one whose ORDER is checkable, has ${(master?.content || []).length}`);
  }

  for (const p of PAGES) {
    const doc = fixture?.pages?.[p.alias];
    if (!doc) { problems.push(`page ${p.alias}: no content doc in ${CONTENT_FILE}`); continue; }
    collect(doc, `page ${p.alias}`);
    const refs = pageRefs(doc);
    for (const r of refs) if (!COMPONENTS.some((c) => c.alias === r)) problems.push(`page ${p.alias}: ref "${r}" names no component`);
    if (p.alias === 'PB_SC_CONTROL' && refs.length) problems.push('PB_SC_CONTROL is the A/B control — it must reference ZERO shared components');
  }

  // The discriminating gaps. If any of these collapse, the fixture stops being able to fail.
  const { byPages } = expectedUsage(fixture);
  if (byPages.SC_UNUSED !== 0) problems.push(`SC_UNUSED must reach usage 0 (delete-SUCCEEDS case) — ${byPages.SC_UNUSED} page(s) reference it`);
  if (byPages.SC_USED < 1) problems.push('SC_USED must be referenced by at least one page (delete-BLOCKED case)');
  if (byPages.SC_MULTI < 2) problems.push(`SC_MULTI must be used on >= 2 pages (VC used-many) — used on ${byPages.SC_MULTI}`);
  if (byPages.SC_SINGLE < 1) problems.push('SC_SINGLE must be used on >= 1 page');

  const dupes = texts.filter((t, i) => texts.indexOf(t) !== i);
  if (dupes.length) problems.push(`section texts must be DISTINCT (a reorder/drop/partial-expansion must be observable) — duplicated: ${[...new Set(dupes)].join(' | ')}`);

  return problems;
}
