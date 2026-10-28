/**
 * sanity-specs.mjs — the single source of truth for the VCST-6475 Sanity fixture (suite 114,
 * vc-module-sanity: several document types, several datasets, a signed webhook).
 *
 * SIDE-EFFECT-FREE: no env load, no network, no main(). Imported by seed-sanity.mjs (provision),
 * validate-sanity-data.mjs (td:validate:sanity drift guard) and sign-webhook.mjs (case-step CLI).
 *
 * WHERE THE DATA LIVES
 *   - The documents live in a Sanity PROJECT, not in the platform. The project id is per env and is
 *     read at run time from {{SANITY_QA_PROJECT_ID}} (.env.<env>); it is never written here.
 *   - Document ids are business keys we choose (AGENT-TEST-6475-*), identical on every env, so they
 *     sit in the committed test-data/aliases.json. The two ASSETS are server-generated (id + CDN
 *     url, the url carries the project id), so they land only in test-data/aliases.<env>.json.
 *
 * WHAT THE FIXTURE DISCRIMINATES (td:validate:sanity owns every one of these)
 *   - CONFLICT: one id in BOTH datasets with DIFFERENT titles → the priority rule is observable.
 *   - LANDING_IN_PROD: type `landing` in `production`, where the cases' type list excludes it, but
 *     the same type IS listed for `qa-secondary` → a per-dataset type filter is observable (a global
 *     filter would index it).
 *   - UNLISTED: a type listed for no dataset → never indexed under any configuration the cases use.
 *   - PAGE_B: no permalink, only seo.slug → permalink fallback is observable.
 *   - SETTINGS: a non-page type with no slug at all.
 *   - DRAFT_A: `drafts.<page-a>` with a DIFFERENT title from the published page-a → draft vs
 *     published is observable.
 *   - FOOTER: strong refs to page-a/page-b/settings + one WEAK ref to a missing doc + a nested ref
 *     → link resolution of found / slug-less / missing targets is observable.
 *   - Any reference whose target is not in the same dataset of this fixture MUST be `_weak: true`:
 *     Sanity rejects a strong dangling reference with 409 (verified live 2026-10-28).
 */
import zlib from 'node:zlib';

export const TICKET = 'VCST-6475';
export const SEED_PREFIX = 'AGENT-TEST-6475-';
export const DRAFT_PREFIX = 'drafts.';
/** Sanity HTTP API version the seeder speaks (a protocol choice, not a platform value). */
export const SANITY_API_VERSION = 'v2021-10-21';
/** Env var names — the values are resolved by the caller through process.env, never here. */
export const ENV = Object.freeze({
  projectId: 'SANITY_QA_PROJECT_ID',
  writeToken: 'SANITY_QA_WRITE_TOKEN',
  readToken: 'SANITY_QA_READ_TOKEN',
  webhookSecrets: ['SANITY_QA_WEBHOOK_SECRET_0', 'SANITY_QA_WEBHOOK_SECRET_1'],
});

export const DATASETS = Object.freeze({ primary: 'production', secondary: 'qa-secondary' });

/**
 * The per-dataset documentTypes the suite configures in the store's Sanity.Projects setting.
 * Declared here so the guard can prove LANDING_IN_PROD / UNLISTED stay outside the right list.
 * The suite reads them through @td(SANITY_DS.primaryTypes / secondaryTypes).
 */
export const DATASET_TYPES = Object.freeze({
  [DATASETS.primary]: Object.freeze(['virtoPage', 'footerNavigation']),
  [DATASETS.secondary]: Object.freeze(['landing', 'virtoPage']),
});

/** Tiny solid-red RGB PNG (w×h). Pure — same bytes every call, so Sanity dedups the upload. */
export function tinyPng(w = 4, h = 3) {
  const table = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w * 3 + 1) + 1 + x * 3] = 255;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Assets, uploaded into the PRIMARY dataset. `filename` is the teardown handle (originalFilename). */
export const ASSET_SPECS = Object.freeze([
  { key: 'image', alias: 'SANITY_ASSET_IMAGE', kind: 'images', sanityType: 'sanity.imageAsset', filename: 'AGENT-TEST-6475.png', contentType: 'image/png', bytes: () => tinyPng(4, 3) },
  { key: 'file', alias: 'SANITY_ASSET_FILE', kind: 'files', sanityType: 'sanity.fileAsset', filename: 'AGENT-TEST-6475.txt', contentType: 'text/plain', bytes: () => Buffer.from('AGENT-TEST-6475 file asset') },
]);
export const ASSET_FILENAME_PREFIX = 'AGENT-TEST-6475';

const id = (k) => `${SEED_PREFIX}${k}`;
const slug = (current) => ({ _type: 'slug', current });
const ref = (target, weak = false) => ({ _type: 'reference', _ref: target, ...(weak ? { _weak: true } : {}) });
/** A reference target that exists nowhere — kept weak, so Sanity accepts it. */
export const MISSING_DOC_ID = id('does-not-exist');
/** An asset ref that is not a real asset — kept weak (asset-resolution negative). */
export const BAD_ASSET_REF = 'image-notvalid';

/**
 * Document declarations. `build(assets)` returns the Sanity document; `assets` is
 * { image: <asset id>, file: <asset id> } (placeholders on a dry run). `alias` + `aliasFields`
 * are what aliases.json carries — the validator proves they equal the document.
 */
export const DOC_SPECS = Object.freeze([
  {
    key: 'page-a', alias: 'SANITY_DOC_PAGE_A', dataset: DATASETS.primary,
    build: (a) => ({
      _id: id('page-a'), _type: 'virtoPage', title: 'AGENT-TEST 6475 page A', permalink: slug('agent-test-6475-a'),
      visibility: 'Public', cultureName: 'en-US',
      hero: { _type: 'image', asset: ref(a.image) },
      attachment: { _type: 'file', asset: ref(a.file) },
      badAsset: { _type: 'image', asset: ref(BAD_ASSET_REF, true) },
    }),
    aliasFields: (d) => ({ id: d._id, permalink: d.permalink.current, title: d.title, type: d._type, dataset: DATASETS.primary }),
  },
  {
    key: 'page-b', alias: 'SANITY_DOC_PAGE_B', dataset: DATASETS.primary,
    build: () => ({ _id: id('page-b'), _type: 'virtoPage', title: 'AGENT-TEST 6475 page B (seo slug only)', seo: { slug: slug('agent-test-6475-b-seo') }, visibility: 'Public' }),
    aliasFields: (d) => ({ id: d._id, seoSlug: d.seo.slug.current, title: d.title, type: d._type, dataset: DATASETS.primary }),
  },
  {
    key: 'conflict', alias: 'SANITY_DOC_CONFLICT', dataset: DATASETS.primary,
    build: () => ({ _id: id('conflict'), _type: 'virtoPage', title: 'CONFLICT from production', permalink: slug('agent-test-6475-conflict-prod'), visibility: 'Public' }),
    aliasFields: (d) => ({ id: d._id, titlePrimary: d.title, permalinkPrimary: d.permalink.current }),
  },
  {
    key: 'conflict', alias: 'SANITY_DOC_CONFLICT', dataset: DATASETS.secondary,
    build: () => ({ _id: id('conflict'), _type: 'virtoPage', title: 'CONFLICT from qa-secondary', permalink: slug('agent-test-6475-conflict-sec'), visibility: 'Public' }),
    aliasFields: (d) => ({ id: d._id, titleSecondary: d.title, permalinkSecondary: d.permalink.current }),
  },
  {
    key: 'settings', alias: 'SANITY_DOC_SETTINGS', dataset: DATASETS.primary,
    build: () => ({ _id: id('settings'), _type: 'siteSettings', title: 'AGENT-TEST 6475 site settings (no permalink)' }),
    aliasFields: (d) => ({ id: d._id, type: d._type, title: d.title, dataset: DATASETS.primary }),
  },
  {
    key: 'footer', alias: 'SANITY_DOC_FOOTER', dataset: DATASETS.primary,
    build: () => ({
      _id: id('footer'), _type: 'footerNavigation', title: 'AGENT-TEST 6475 footer',
      links: [
        { _key: 'k1', label: 'Page A', internalLink: ref(id('page-a')) },
        { _key: 'k2', label: 'Page B', internalLink: ref(id('page-b')) },
        { _key: 'k3', label: 'Settings (no slug)', internalLink: ref(id('settings')) },
        { _key: 'k4', label: 'Missing doc', internalLink: ref(MISSING_DOC_ID, true) },
      ],
      nested: { deep: { deeper: [{ _key: 'n1', ref: ref(id('page-a')) }] } },
    }),
    aliasFields: (d) => ({ id: d._id, type: d._type, title: d.title, dataset: DATASETS.primary, missingRef: MISSING_DOC_ID }),
  },
  {
    key: 'landing-in-prod', alias: 'SANITY_DOC_LANDING_IN_PROD', dataset: DATASETS.primary,
    build: () => ({ _id: id('landing-in-prod'), _type: 'landing', title: 'AGENT-TEST 6475 landing in production (type not listed for production)', permalink: slug('agent-test-6475-landing-prod') }),
    aliasFields: (d) => ({ id: d._id, type: d._type, permalink: d.permalink.current, dataset: DATASETS.primary }),
  },
  {
    key: 'unlisted', alias: 'SANITY_DOC_UNLISTED', dataset: DATASETS.primary,
    build: () => ({ _id: id('unlisted'), _type: 'qaUnlisted', title: 'AGENT-TEST 6475 unlisted type', permalink: slug('agent-test-6475-unlisted') }),
    aliasFields: (d) => ({ id: d._id, type: d._type, permalink: d.permalink.current, dataset: DATASETS.primary }),
  },
  {
    key: 'draft-a', alias: 'SANITY_DOC_DRAFT_A', dataset: DATASETS.primary,
    build: () => ({ _id: `${DRAFT_PREFIX}${id('page-a')}`, _type: 'virtoPage', title: 'AGENT-TEST 6475 page A — DRAFT edit', permalink: slug('agent-test-6475-a'), visibility: 'Public' }),
    aliasFields: (d) => ({ id: d._id, publishedId: id('page-a'), title: d.title, dataset: DATASETS.primary }),
  },
  {
    key: 'landing', alias: 'SANITY_DOC_LANDING', dataset: DATASETS.secondary,
    build: () => ({ _id: id('landing'), _type: 'landing', title: 'AGENT-TEST 6475 landing (qa-secondary)', permalink: slug('agent-test-6475-landing'), visibility: 'Public' }),
    aliasFields: (d) => ({ id: d._id, type: d._type, permalink: d.permalink.current, title: d.title, dataset: DATASETS.secondary }),
  },
  {
    key: 'sec-page', alias: 'SANITY_DOC_SEC_PAGE', dataset: DATASETS.secondary,
    build: () => ({
      _id: id('sec-page'), _type: 'virtoPage', title: 'AGENT-TEST 6475 page in qa-secondary', permalink: slug('agent-test-6475-sec'), visibility: 'Public',
      crossRef: ref(id('page-a'), true),
    }),
    aliasFields: (d) => ({ id: d._id, type: d._type, permalink: d.permalink.current, title: d.title, dataset: DATASETS.secondary }),
  },
]);

/** Placeholder asset ids for a dry run / the static guard (never sent). */
export const PLACEHOLDER_ASSETS = Object.freeze({ image: 'image-placeholder-4x3-png', file: 'file-placeholder-txt' });

/** Documents of one dataset, in declaration order. */
export function docsFor(dataset, assets = PLACEHOLDER_ASSETS) {
  return DOC_SPECS.filter((s) => s.dataset === dataset).map((s) => s.build(assets));
}
export const allDatasets = () => [...new Set(DOC_SPECS.map((s) => s.dataset))];
/** Every document id of a dataset — the exact teardown set (never a wildcard delete). */
export const docIdsFor = (dataset) => docsFor(dataset).map((d) => d._id);

/** One Mutations-API body: all documents of the dataset in ONE transaction (idempotent createOrReplace). */
export function mutationBody(dataset, assets) {
  return { mutations: docsFor(dataset, assets).map((d) => ({ createOrReplace: d })) };
}
export function deleteBody(ids) {
  return { mutations: ids.map((x) => ({ delete: { id: x } })) };
}

/** Every reference in a document (walks nested objects/arrays). */
export function collectRefs(node, out = []) {
  if (Array.isArray(node)) { for (const x of node) collectRefs(x, out); return out; }
  if (node && typeof node === 'object') {
    if (node._type === 'reference' && typeof node._ref === 'string') out.push(node);
    for (const v of Object.values(node)) collectRefs(v, out);
  }
  return out;
}

/**
 * References that Sanity would reject (strong ref to a target not in the same dataset of this
 * fixture, and not one of the uploaded assets). Pure — the guard and the seeder's pre-flight use it.
 */
export function strongDanglingRefs(dataset, assets = PLACEHOLDER_ASSETS) {
  const docs = docsFor(dataset, assets);
  const known = new Set([...docs.map((d) => d._id), ...Object.values(assets)]);
  const bad = [];
  for (const d of docs) for (const r of collectRefs(d)) if (!r._weak && !known.has(r._ref)) bad.push(`${d._id} → ${r._ref}`);
  return bad;
}

/**
 * The static alias registry entries (test-data/aliases.json) derived from the documents. The
 * conflict alias merges its two datasets. Asset aliases carry empty id/url (runtime → overlay).
 */
export function baseAliases() {
  const out = {
    SANITY_DS: {
      primary: DATASETS.primary, secondary: DATASETS.secondary,
      primaryTypes: DATASET_TYPES[DATASETS.primary].join(','),
      secondaryTypes: DATASET_TYPES[DATASETS.secondary].join(','),
    },
  };
  for (const s of DOC_SPECS) out[s.alias] = { ...(out[s.alias] || {}), ...s.aliasFields(s.build(PLACEHOLDER_ASSETS)) };
  for (const a of ASSET_SPECS) out[a.alias] = { id: '', url: '', filename: a.filename, kind: a.kind };
  return out;
}

/** Runtime overlay for aliases.<env>.json from the uploaded asset documents. */
export function overlayAliases(uploaded) {
  const out = {};
  for (const a of ASSET_SPECS) {
    const u = uploaded[a.key];
    if (u?._id) out[a.alias] = { id: u._id, url: u.url || '' };
  }
  return out;
}

/** GROQ: residue of THIS fixture in a dataset (docs by id prefix + assets by filename). */
export const RESIDUE_QUERY = `{"docs": count(*[_id match "*${SEED_PREFIX.slice(0, -1)}*"]), "assets": count(*[_type in ["sanity.imageAsset","sanity.fileAsset"] && originalFilename match "${ASSET_FILENAME_PREFIX}*"])}`;
/** GROQ: our assets (by originalFilename) — the teardown set for assets. */
export const OWN_ASSETS_QUERY = `*[_type in ["sanity.imageAsset","sanity.fileAsset"] && originalFilename match "${ASSET_FILENAME_PREFIX}*"]{_id, originalFilename, url}`;
/** GROQ: documents OUTSIDE this fixture that reference an asset (must be 0 before deleting it). */
export const FOREIGN_REFERRERS_QUERY = `count(*[references($id) && !(_id match "*${SEED_PREFIX.slice(0, -1)}*")])`;

/** Runtime platform GUID shape — must never appear in the spec or the committed base aliases. */
export const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
export const findGuidLeaks = (text) => [...new Set(String(text).match(GUID_RE) || [])];
