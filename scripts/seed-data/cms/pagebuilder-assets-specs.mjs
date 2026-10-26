/**
 * scripts/seed-data/cms/pagebuilder-assets-specs.mjs
 *
 * SINGLE source of truth (side-effect-free) for the VCST-5726 Page Builder ASSET LIBRARY fixture
 * set: the folder tree, the file names, the deterministic shuffled upload order, the reference
 * pages and the reference counts each asset must report. Imported by the seeder
 * (seed-pagebuilder-assets.mjs) and the drift guard (validate-pagebuilder-assets-data.mjs).
 *
 * Fixture root = <store Page Builder asset folder>/AGENT-TEST-VCST5726. The store folder is the one
 * the Asset Library shell roots at — POST /api/page-builder-assets/search {folderUrl:
 * "/stores/<storeId>/Page Builder"} — so the root is DERIVED from the env's STORE_ID
 * (storeAssetRoot), never transcribed. No runtime GUID lives here (page/component ids go to
 * aliases.<env>.json).
 *
 * Every fixture is built so a WRONG implementation is observable (.claude/rules/test-data.md
 * SECOND RULE):
 *   P500     500 PNGs uploaded in a SEEDED SHUFFLE, so name order ≠ upload (created/modified) order.
 *   MIXED    20 PDF + 480 PNG; an image-accept picker must show 480, first = asset-020.png
 *            (an implementation that ignores acceptedTypes shows 500, first = asset-000.pdf).
 *   FOLDERS  25 sub-folders + 30 files: totalCount 55 ≠ fileCount 30.
 *   DEEP     5-level chain + 4 sibling branches at l1 — a recursive crawl issues many requests,
 *            and the only referenced file sits at the bottom (l5).
 *   EMPTY    zero children.
 *   TPL      template-literal names; a renderer that evaluates `{{= … }}` sets window.__vcst5726.
 *   REFS     asset-007 → 1 page, asset-025 → 3 pages, asset-499 → 2 pages + 2 shared components
 *            (totals 1 / 3 / 4 — pairwise distinct across p500),
 *            deep/…/l5/d5-a.png → 1 page. Every other asset → 0.
 */
import zlib from 'node:zlib';

export const TICKET = 'VCST-5726';
export const ROOT_NAME = 'AGENT-TEST-VCST5726';
export const PAGE_PREFIX = 'AGENT-TEST-VCST5726-ref-';
export const PERMALINK_PREFIX = '/agent-test-vcst5726-ref-';
export const SC_PREFIX = 'AGENT-TEST-VCST5726-sc-';
export const SHUFFLE_SEED = 5726;

/** The store's Page Builder asset folder — what the Asset Library shell roots at. */
export const storeAssetRoot = (storeId) => `/stores/${storeId}/Page Builder`;
/** The fixture root under it. */
export const fixtureRoot = (storeId) => `${storeAssetRoot(storeId)}/${ROOT_NAME}`;

const pad = (n, w) => String(n).padStart(w, '0');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/* ── Folder specs ─────────────────────────────────────────────────────────────
 * `rel` is relative to the fixture root. `files` = file names directly in that folder.
 * `subfolders` = EMPTY child folders created through POST /api/assets/folder (names must be
 * lowercase/digits/single dashes — the folder validator; verified live 2026-10-14). */
export const FOLDERS = [
  { key: 'P500', alias: 'PB_ASSETS_P500', rel: 'p500',
    files: range(0, 499).map((i) => `asset-${pad(i, 3)}.png`), shuffled: true },
  { key: 'MIXED', alias: 'PB_ASSETS_MIXED', rel: 'mixed',
    files: [...range(0, 19).map((i) => `asset-${pad(i, 3)}.pdf`), ...range(20, 499).map((i) => `asset-${pad(i, 3)}.png`)] },
  { key: 'FOLDERS', alias: 'PB_ASSETS_FOLDERS', rel: 'folders',
    files: range(0, 29).map((i) => `file-${pad(i, 2)}.png`), subfolders: range(0, 24).map((i) => `sub-${pad(i, 2)}`) },
  { key: 'EMPTY', alias: 'PB_ASSETS_EMPTY', rel: 'empty', files: [], createEmpty: true },
  { key: 'TPL', alias: 'PB_ASSETS_TPL', rel: 'tpl', files: ['tpl-{{=window.__vcst5726=2}}.png'] },
  // The template-literal FOLDER cannot go through POST /api/assets/folder (name validator 400);
  // it is created implicitly by uploading a marker file into it.
  { key: 'TPL_DIR', alias: 'PB_ASSETS_TPL', aliasField: 'tplFolder', rel: 'tpl-{{=window.__vcst5726=1}}', files: ['tpl-marker.png'] },
];

/* DEEP: deep/l1/l2/l3/l4/l5 with 3 PNGs per level + deep/l1/b1..b4 with 2 PNGs each. */
export const DEEP_LEVELS = 5;
export const DEEP_BRANCHES = 4;
export function deepFolders() {
  const out = [];
  let rel = 'deep';
  for (let l = 1; l <= DEEP_LEVELS; l++) {
    rel += `/l${l}`;
    out.push({ key: `DEEP_L${l}`, rel, files: ['a', 'b', 'c'].map((s) => `d${l}-${s}.png`) });
  }
  for (let b = 1; b <= DEEP_BRANCHES; b++) out.push({ key: `DEEP_B${b}`, rel: `deep/l1/b${b}`, files: [`b${b}-a.png`, `b${b}-b.png`] });
  return out;
}
export const DEEP_ALIAS = 'PB_ASSETS_DEEP';

/** Every folder spec (flat), in creation order. */
export function allFolderSpecs() { return [...FOLDERS, ...deepFolders()]; }

/** Total uploads the fixture needs. */
export function totalFiles() { return allFolderSpecs().reduce((n, f) => n + f.files.length, 0); }

/* ── Expected listing counts per folder (direct children) — the drift guard + the live check ── */
export function expectedCounts(rel) {
  const all = allFolderSpecs();
  const f = all.find((x) => x.rel === rel);
  const fileCount = f ? f.files.length : 0;
  // direct child folders = declared subfolders + spec folders whose parent is `rel`
  const childDirs = new Set(f?.subfolders || []);
  for (const x of all) {
    const parent = x.rel.split('/').slice(0, -1).join('/');
    if (parent === rel) childDirs.add(x.rel.split('/').pop());
  }
  return { fileCount, folderCount: childDirs.size, totalCount: fileCount + childDirs.size };
}

/* ── Deterministic shuffle (mulberry32 + Fisher–Yates) ── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffled(list, seed = SHUFFLE_SEED) {
  const out = [...list]; const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
/** Upload order for a folder spec: shuffled for P500, declared order otherwise. */
export function uploadOrder(spec) { return spec.shuffled ? shuffled(spec.files) : [...spec.files]; }

/* ── References ─────────────────────────────────────────────────────────────
 * Pages reference assets through `image` blocks (the shape the Designer saves — verified live:
 * { type:'image', image:<absolute asset url>, alttext }). Pages are Draft, store-scoped. */
export const REF_ASSETS = [
  { alias: 'PB_ASSET_REF_1', rel: 'p500/asset-007.png', expectedPageRefs: 1, expectedScRefs: 0 },
  { alias: 'PB_ASSET_REF_3', rel: 'p500/asset-025.png', expectedPageRefs: 3, expectedScRefs: 0 },
  { alias: 'PB_ASSET_REF_2', rel: 'p500/asset-499.png', expectedPageRefs: 2, expectedScRefs: 2 },
  { alias: 'PB_ASSET_REF_DEEP', rel: 'deep/l1/l2/l3/l4/l5/d5-a.png', expectedPageRefs: 1, expectedScRefs: 0 },
];
/** page n → the asset rels it embeds. Counts per asset are DERIVED from this (pageRefCounts). */
export const REF_PAGES = [
  { n: 1, assets: ['p500/asset-007.png', 'p500/asset-025.png', 'p500/asset-499.png'] },
  { n: 2, assets: ['p500/asset-025.png', 'p500/asset-499.png'] },
  { n: 3, assets: ['p500/asset-025.png'] },
  { n: 4, assets: ['deep/l1/l2/l3/l4/l5/d5-a.png'] },
];
/** Shared components, each embedding its assets once. SC counts per asset are DERIVED (scRefCounts). */
export const SHARED_COMPONENTS = [
  { n: 1, assets: ['p500/asset-499.png'] },
  { n: 2, assets: ['p500/asset-499.png'] },
];
export const scName = (n) => `${SC_PREFIX}${n}`;
export function scRefCounts() {
  const c = {};
  for (const sc of SHARED_COMPONENTS) for (const a of new Set(sc.assets)) c[a] = (c[a] || 0) + 1;
  return c;
}

export const pageName = (n) => `${PAGE_PREFIX}${n}`;
export const pagePermalink = (n) => `${PERMALINK_PREFIX}${n}`;

/** Derived page-reference count per asset rel. */
export function pageRefCounts() {
  const c = {};
  for (const p of REF_PAGES) for (const a of new Set(p.assets)) c[a] = (c[a] || 0) + 1;
  return c;
}

/** Grouped CREATE body (no id, pages:[] → server assigns groupId + shell). Draft, visible. */
export function createGroupedBody(n, { storeId, culture = 'en-US' }) {
  return { storeId, cultureName: culture, name: pageName(n), permalink: pagePermalink(n), visibility: true, status: 'Draft', pages: [] };
}

/** Page content doc: a title block + one image block per referenced asset. urlOf(rel) → absolute url. */
export function buildPageContent(n, urlOf) {
  const page = REF_PAGES.find((p) => p.n === n);
  const content = [{ id: 'title01', type: 'title', heading: 'h2', title: `${pageName(n)} (${TICKET} asset references)`, subtitle: null, background: null }];
  page.assets.forEach((rel, i) => content.push({ id: `image${pad(i + 2, 2)}`, type: 'image', image: urlOf(rel), alttext: `AGENT-TEST ${rel}`, anchor: null, background: null }));
  return { settings: { header: pageName(n), hideBreadcrumbs: false }, content };
}

/** Shared component body for component n. */
export function buildScBody(n, storeId, urlOf) {
  const sc = SHARED_COMPONENTS.find((x) => x.n === n);
  return { storeId, name: scName(n), content: { settings: {}, content: sc.assets.map((rel, i) => ({ id: `image${pad(i + 1, 2)}`, type: 'image', image: urlOf(rel), alttext: `AGENT-TEST ${rel}`, anchor: null, background: null })) } };
}

/* ── Tiny valid file bytes (pure) ── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** 16x16 RGB PNG, colour keyed by the name — a few hundred bytes, real PNG, distinct per file. */
export function tinyPng(name) {
  const W = 16, H = 16, h = hash(name);
  const rgb = [h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff];
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; const band = (x + y) % 8 < 2; raw[o] = band ? 255 - rgb[0] : rgb[0]; raw[o + 1] = band ? 255 - rgb[1] : rgb[1]; raw[o + 2] = band ? 255 - rgb[2] : rgb[2]; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Minimal valid one-page PDF with a correct xref table. */
export function tinyPdf(label) {
  const text = `AGENT-TEST ${label}`.replace(/[()\\]/g, '');
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${pad(o, 10)} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export function fileBytes(name) {
  return name.endsWith('.pdf') ? { bytes: tinyPdf(name), type: 'application/pdf' } : { bytes: tinyPng(name), type: 'image/png' };
}

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{32}\b/gi;
export function findGuidLeaks(text) { return String(text).match(GUID_RE) || []; }
