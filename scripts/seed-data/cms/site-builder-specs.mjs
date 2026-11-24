/**
 * scripts/seed-data/cms/site-builder-specs.mjs
 *
 * Side-effect-free source of the Site Builder (VirtoCommerce.SiteBuilder) fixtures that the VCST-6571 /
 * VCST-6572 runs lacked. The business keys are DECLARED in test-data/aliases.json (the SB_* inline aliases);
 * this module only names them and turns a declaration plus a FOUND theme state into request bodies. No env,
 * no network, no fs. Runtime values (publication numbers, catalog hash, discovered product ids, user ids) go
 * to aliases.<env>.json only.
 *
 * Theme contract (VCST-6571 run HARs, B2B-store, 2026-11-19, and the module at 28d00e0):
 *   GET  /api/site-builder/designer/theme-file?storeId&path=<theme>/<file>  → { content|null, eTag }
 *        content null = the store has no such file (the storefront's built-in default applies)
 *   POST /api/site-builder/designer/save?storeId&catalogHash  { themeFiles:[{path,eTag,content}] } → drafts
 *   POST /api/site-builder/theme/publish?storeId&catalogHash → { publication } (append-only; refuses a
 *        palette pair under WCAG AA, @kb(KB-1EE973A2); needs a catalogHash, @kb(KB-620E2625))
 *   POST /api/site-builder/theme/palette?storeId { primary, secondary, tokens } → { light, dark }
 *   POST /api/site-builder/theme/palette/check?storeId { palette:{light,dark}, tokens } → { failures }
 *   GET  /api/site-builder/catalog?storeId → the store's current schema catalog (carries its own `hash`);
 *        only the storefront's designer preview uploads one (PUT /api/site-builder/catalog).
 * Role scope contract @kb(KB-4FEABEDD): builder:read and builder:shared-components:read take a
 * StoreSelectedScope {type, scope, storeId, label}; without storeId — or on a role PUT without id/moduleId —
 * the scope is dropped silently.
 */

export const SB_MODULE_ID = 'VirtoCommerce.SiteBuilder';
export const THEME_ALIAS = 'SB_THEME_B2B';
export const EDITOR_ALIASES = ['SB_STORE_EDITOR', 'SB_THEME_EDITOR_NOPUBLISH'];
export const REUSE_ALIASES = ['SB_WL_ORG_BUYER', 'SB_PERSONAL_BUYER'];
export const PAGE_ALIAS = 'SB_LEGACY_HEADER_PAGE';
export const ALL_ALIASES = [THEME_ALIAS, ...EDITOR_ALIASES];

export const FILES = {
  header: 'sections/header-group.json',
  palette: 'config/palette.json',
  paletteDark: 'config/palette.dark.json',
  rules: 'config/template_rules.json',
};
export const templateFile = (key) => `templates/${key}.json`;
/** Every theme file the theme fixture writes (theme-relative). */
export const themeFiles = (decl) => [FILES.header, FILES.palette, FILES.paletteDark, FILES.rules, templateFile(decl.template.key)];
/** The path the designer endpoints take: the theme name in front. */
export const themePath = (decl, file) => `${decl.theme}/${file}`;

const TOKEN_RE = /^color_[a-z]+(_[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const LOGIN_RE = /^agent-test-[a-z0-9-]+$/;
const VAR_RE = /^[A-Z][A-Z0-9_]+$/;

/** Parse a theme file body: null/blank → null, invalid JSON → throws (a file we cannot read we must not overwrite). */
export function parseFile(content, path = 'file') {
  if (content == null || !String(content).trim()) return null;
  try { return JSON.parse(content); } catch (e) { throw new Error(`${path}: not valid JSON (${e.message})`); }
}
export const stringify = (v) => `${JSON.stringify(v, null, 2)}\n`;

/**
 * Header group = the FOUND group with its announcement bar replaced by ours. The catalog allows one
 * announcement bar per group (limit 1). An absent file starts from a bare site header with its schema
 * defaults — the same thing the designer writes — so the storefront header itself is unchanged.
 */
export function buildHeaderGroup(found, decl) {
  const base = found && typeof found === 'object' ? JSON.parse(JSON.stringify(found)) : { type: 'header', name: 'Header', content: [] };
  const items = Array.isArray(base.content) ? base.content.filter((x) => x?.type !== 'announcement-bar') : [];
  if (!items.some((x) => x?.type === 'site-header')) items.unshift({ id: 'siteheader01', type: 'site-header' });
  const a = decl.announcement;
  items.push({
    id: a.section_id, type: 'announcement-bar', home_only: false, background: a.background, color: a.color, anchor: null,
    blocks: [{ id: a.block_id, type: 'announcement', text: a.text, name: null, anchor: null }],
  });
  return { ...base, type: base.type || 'header', name: base.name || 'Header', content: items };
}

/**
 * Template rules = the FOUND rules with our product rule FIRST (the storefront takes the first enabled match).
 * An absent file means the storefront's built-in rules apply; they are declared in the alias
 * (rules_when_absent, provenance there) so writing a file does not silently drop them.
 */
export function buildRules(found, decl) {
  const base = found && typeof found === 'object' ? JSON.parse(JSON.stringify(found)) : { version: 2, conditions: [], ...JSON.parse(JSON.stringify(decl.rules_when_absent || {})) };
  const conditions = new Set(Array.isArray(base.conditions) ? base.conditions : []);
  conditions.add('productType');
  for (const r of base.product || []) for (const k of Object.keys(r?.when || {})) conditions.add(k);
  const product = (Array.isArray(base.product) ? base.product : []).filter((r) => r?.id !== decl.rule.id);
  product.unshift({ id: decl.rule.id, template: decl.template.key, when: { productType: decl.rule.product_type } });
  return { ...base, version: base.version || 2, conditions: [...conditions], product };
}

/** The product template: the product page's main section plus one text section carrying the marker. */
export function buildTemplate(decl) {
  const t = decl.template;
  return {
    settings: { name: t.name, type: 'settings' },
    content: [
      { id: 'productinfo01', type: 'product-info', variationsLayout: 'b2b', anchor: null, blocks: [] },
      { id: 'agenttestsbmarker', type: 'text', heading: 'h2', title: t.marker, text: t.text, anchor: null },
    ],
  };
}

/** The palette generation request: the brand colours + the token lists of the store's schema catalog. */
export function paletteRequest(decl, catalog) {
  const tokens = catalog?.paletteTokens;
  if (!tokens?.light?.length) throw new Error('the schema catalog lists no paletteTokens');
  return { primary: decl.palette.primary, ...(decl.palette.secondary ? { secondary: decl.palette.secondary } : {}), tokens };
}

/** Desired theme files { file → JSON value } from the found values (parsed, null = absent) and a generated palette. */
export function desiredFiles(decl, found, palette) {
  return {
    [FILES.header]: buildHeaderGroup(found[FILES.header], decl),
    [FILES.palette]: palette.light,
    [FILES.paletteDark]: palette.dark,
    [FILES.rules]: buildRules(found[FILES.rules], decl),
    [templateFile(decl.template.key)]: buildTemplate(decl),
  };
}

/** Same JSON value, key order ignored. Pure. */
export function sameJson(a, b) {
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  return JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));
}

/** What a snapshot must show once the fixture is live (and must NOT show after teardown). */
export function snapshotMarkers(decl) {
  return [decl.announcement.text, decl.template.marker, decl.template.key];
}

/* ── Back-office editors (store-scoped Site Builder roles) ─────────────────── */

/** "builder:read@B2B-store" → { name:'builder:read', store:'B2B-store' }. */
export function parsePermissions(list) {
  return String(list || '').split(',').map((s) => s.trim()).filter(Boolean).map((p) => {
    const [name, store] = p.split('@');
    return { name: name.trim(), store: store ? store.trim() : null };
  });
}

/** Role body for PUT /api/platform/security/roles; `id` only once the role exists (the scope needs it). */
export function roleBody(decl, { id = null, moduleId = SB_MODULE_ID } = {}) {
  return {
    ...(id ? { id } : {}),
    name: decl.role,
    description: `AGENT-TEST Site Builder editor (${decl.role}). Seeded by seed:site-builder; safe to delete.`,
    permissions: parsePermissions(decl.permissions).map((p) => ({
      name: p.name, moduleId,
      assignedScopes: p.store ? [{ type: 'StoreSelectedScope', scope: p.store, storeId: p.store, label: p.store }] : [],
    })),
  };
}

export function accountBody(decl, { password, roleId }) {
  return {
    userName: decl.login, email: decl.email, password,
    userType: decl.user_type || 'Manager', isAdministrator: false,
    roles: [{ id: roleId, name: decl.role }],
  };
}

/** Which declared store scopes a role read back from the platform lost (the silent-drop failure). Pure. */
export function lostScopes(decl, role) {
  const live = new Map((role?.permissions || []).map((p) => [p.name, (p.assignedScopes || []).map((s) => s.storeId || s.scope)]));
  return parsePermissions(decl.permissions).filter((p) => p.store && !(live.get(p.name) || []).includes(p.store)).map((p) => `${p.name}@${p.store}`);
}

/* ── Declaration checks (the drift guard and the seeder both run them) ─────── */

/** Problems in the theme declaration — every one of them would make the fixture decide nothing. */
export function themeProblems(decl) {
  const out = [];
  if (!decl) return ['SB_THEME_B2B not declared in test-data/aliases.json'];
  if (!decl.store_id) out.push('store_id missing');
  if (!decl.theme) out.push('theme missing');
  const a = decl.announcement || {};
  if (!String(a.text || '').startsWith('AGENT-TEST')) out.push('announcement.text must start with AGENT-TEST (it is what a case looks for)');
  for (const k of ['background', 'color']) if (!TOKEN_RE.test(a[k] || '')) out.push(`announcement.${k} must be a palette token (color_*), got ${JSON.stringify(a[k])}`);
  if (a.background && a.background === a.color) out.push('announcement background and text are the same token');
  if (!a.section_id || !a.block_id) out.push('announcement.section_id / block_id missing (stable ids keep the seed idempotent)');
  const p = decl.palette || {};
  if (!HEX_RE.test(p.primary || '')) out.push(`palette.primary must be #rrggbb, got ${JSON.stringify(p.primary)}`);
  if (p.secondary && !HEX_RE.test(p.secondary)) out.push(`palette.secondary must be #rrggbb, got ${JSON.stringify(p.secondary)}`);
  if (p.secondary && p.secondary.toLowerCase() === String(p.primary).toLowerCase()) out.push('palette primary and secondary are the same colour');
  const t = decl.template || {};
  if (!/^product\.agent-test-[a-z0-9-]+$/.test(t.key || '')) out.push(`template.key must be product.agent-test-*, got ${JSON.stringify(t.key)}`);
  if (!String(t.marker || '').startsWith('AGENT-TEST')) out.push('template.marker must start with AGENT-TEST');
  const r = decl.rule || {};
  if (!r.id) out.push('rule.id missing');
  if (!r.product_type || !r.control_product_type) out.push('rule.product_type and rule.control_product_type are both needed');
  else if (r.product_type === r.control_product_type) out.push('rule.product_type equals control_product_type: the rule would match the control product too');
  const absent = decl.rules_when_absent?.product;
  if (!Array.isArray(absent)) out.push('rules_when_absent.product must list the storefront built-in product rules');
  else if (absent.some((x) => x?.id === r.id)) out.push('rules_when_absent already holds our rule id');
  return out;
}

/** Problems in the editor declarations, including the divergence between the two roles. */
export function editorProblems(decls) {
  const out = [];
  const perms = {};
  for (const [alias, d] of Object.entries(decls)) {
    if (!d) { out.push(`${alias} not declared in test-data/aliases.json`); continue; }
    if (!LOGIN_RE.test(d.login || '')) out.push(`${alias}: login must be agent-test-*`);
    if (!String(d.email || '').startsWith(d.login + '@')) out.push(`${alias}: email must be <login>@…`);
    if (!String(d.role || '').startsWith('AGENT-TEST')) out.push(`${alias}: role must start with AGENT-TEST`);
    if (!VAR_RE.test(d.password_var || '')) out.push(`${alias}: password_var must be a variable NAME, never a value`);
    const ps = parsePermissions(d.permissions);
    perms[alias] = new Set(ps.map((p) => p.name));
    const reads = ps.filter((p) => p.name === 'builder:read');
    if (reads.length !== 1 || !reads[0].store) out.push(`${alias}: builder:read must be granted once, scoped to one store`);
    if (perms[alias].has('builder:publish')) out.push(`${alias}: must not hold builder:publish`);
    for (const p of ps) if (p.store && !['builder:read', 'builder:shared-components:read'].includes(p.name)) out.push(`${alias}: ${p.name} takes no store scope (only builder:read and builder:shared-components:read do)`);
    if (!d.other_store) out.push(`${alias}: other_store (a store the scope must refuse) missing`);
    else if (reads[0]?.store === d.other_store) out.push(`${alias}: other_store equals the scoped store`);
  }
  const se = perms.SB_STORE_EDITOR; const te = perms.SB_THEME_EDITOR_NOPUBLISH;
  if (se && se.has('builder:theme')) out.push('SB_STORE_EDITOR must not hold builder:theme');
  if (te && !te.has('builder:theme')) out.push('SB_THEME_EDITOR_NOPUBLISH must hold builder:theme (it is the role that tells theme from publish)');
  if (se && te) {
    const diff = [...te].filter((p) => !se.has(p));
    if (!diff.includes('builder:theme')) out.push('the two roles do not differ by builder:theme — the pair decides nothing');
    if ([...se].some((p) => !te.has(p))) out.push('SB_THEME_EDITOR_NOPUBLISH must hold every SB_STORE_EDITOR permission (it differs only by what it adds)');
  }
  return out;
}

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
export const findGuidLeaks = (text) => String(text).match(GUID_RE) || [];
