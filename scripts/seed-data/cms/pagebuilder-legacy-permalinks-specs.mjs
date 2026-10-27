/**
 * scripts/seed-data/cms/pagebuilder-legacy-permalinks-specs.mjs
 *
 * Side-effect-free source of the VCST-6443 LEGACY-INVALID PageBuilder fixtures (PR
 * VirtoCommerce/vc-module-pagebuilder#178): page groups whose STORED permalink violates the
 * permalink rule that build adds to POST /api/page-builder-pages/create-group-page and POST/PUT
 * /api/page-builder-pages/grouped (those return 400). Such data can only exist as LEGACY data, so
 * the seeder writes it through PLATFORM RESTORE (POST /api/platform/import), which upserts the
 * module's export JSON by groupId and never runs the controller-side check (@kb(KB-8AD383A4)).
 *
 * The business keys (name, permalink, status, visibility) are DECLARED in test-data/aliases.json
 * (the PB_6443_* inline aliases) — that file is the single source of truth and this module only
 * names which aliases are seeded. The runtime group/page ids are generated per seed and written to
 * aliases.<env>.json only. Importing this module has no side effects (no env, no network, no fs).
 */

export const TICKET_PREFIX = 'AGENT-TEST-6443 ';

/** The page-group aliases the seeder provisions (S10 is declared but unused, so not seeded). */
export const PAGE_ALIASES = [
  'PB_6443_LEGACY_S6', 'PB_6443_LEGACY_S7', 'PB_6443_LEGACY_S8', 'PB_6443_LEGACY_S18',
  'PB_6443_LEGACY_EXP1', 'PB_6443_LEGACY_EXP2', 'PB_6443_LEGACY_PCT', 'PB_6443_LEGACY_LT',
];
export const USER_ALIAS = 'PB_6443_NOCREATE_USER';
export const MODULE_ID = 'VirtoCommerce.PageBuilderModule';
export const EMPTY_CONTENT = JSON.stringify({ settings: {}, content: [] });
export const STATUS = { DRAFT: 'Draft', PUBLISHED: 'Published' };

/** A page spec from its alias declaration; status defaults to Draft, visibility to true. */
export function pageSpec(alias, decl) {
  if (!decl) throw new Error(`${alias}: not declared in test-data/aliases.json`);
  return {
    alias,
    name: decl.name,
    permalink: decl.permalink,
    storeId: decl.store_id,
    culture: decl.culture,
    status: decl.status || STATUS.DRAFT,
    visibility: decl.visibility === undefined ? true : decl.visibility === true,
    invalidBecause: decl.invalid_because,
  };
}

export function pageSpecs(aliases, only = null) {
  const want = only ? new Set(only) : null;
  return PAGE_ALIASES.filter((a) => !want || want.has(a)).map((a) => pageSpec(a, aliases[a]));
}

/**
 * Which classes of the PR #178 rule a permalink breaks. A deliberate MIRROR of the rule, kept only
 * so the drift guard can prove each fixture is non-vacuous (a "legacy-invalid" page whose permalink
 * is actually valid tests nothing). It is NOT the oracle: the seeder's live probe — the same
 * permalink sent to create-group-page must answer 400 on the target build — is.
 */
export function ruleViolations(permalink) {
  const p = String(permalink ?? '');
  const out = [];
  if (/\s/u.test(p)) out.push('whitespace');
  if (/[\p{Cc}\p{Cf}]/u.test(p)) out.push('control/format char');
  const bad = [...new Set([...p].filter((c) => '?#&%\\"<>{}|^`'.includes(c)))];
  if (bad.length) out.push(`reserved char ${bad.join('')}`);
  if (p.includes('//')) out.push('double slash');
  if (p.split('/').some((s) => s === '.' || s === '..')) out.push('dot segment');
  if (p.length > 2048) out.push('longer than 2048');
  return out;
}

/** The module's export JSON for the given specs, in the shape the platform's own export writes. */
export function moduleExportJson(specs, ids) {
  return {
    PageBuilderSharedComponents: [],
    PageBuilderPages: specs.map((s) => ({
      groupId: ids[s.alias].groupId,
      name: s.name,
      permalink: s.permalink,
      storeId: s.storeId,
      cultureName: s.culture,
      visibility: s.visibility,
      variants: [{ pageId: ids[s.alias].pageId, status: s.status, content: EMPTY_CONTENT }],
    })),
  };
}

/** Restore manifest (PascalCase, as Manifest.json is written by the platform) for one module. */
export function restoreManifest(newManifest, moduleVersion) {
  return {
    Author: newManifest.author || 'admin',
    PlatformVersion: newManifest.platformVersion,
    HandleSettings: false, HandleDynamicProperties: false, HandleSecurity: false, HandleBinaryData: false,
    Modules: [{ PartUri: `${MODULE_ID}.json`, Id: MODULE_ID, Version: moduleVersion, Optional: false }],
    Options: [],
    IsEncrypted: false,
  };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A minimal STORED (uncompressed) zip from [{ name, data: Buffer }] — no dependency needed. */
export function buildStoredZip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, data); centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Role + account bodies for the no-create back-office user (PB_6443_NOCREATE_USER). */
export function roleBody(decl) {
  return {
    id: decl.role, name: decl.role,
    description: 'AGENT-TEST VCST-6443: Page Builder without builder:create. Safe to delete.',
    permissions: String(decl.permissions).split(',').map((s) => ({ name: s.trim() })).filter((p) => p.name),
  };
}
export function accountBody(decl, { password, storeId }) {
  return {
    userName: decl.login, email: decl.email, password, storeId,
    userType: decl.user_type || 'Manager', isAdministrator: false,
    roles: [{ id: decl.role, name: decl.role }],
  };
}
