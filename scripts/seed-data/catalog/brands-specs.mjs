/**
 * brands-specs.mjs — side-effect-free source of truth for `seed-brands.mjs` and its drift guard
 * `validate-brands-data.mjs`. No env load, no network, no main().
 *
 * Source: the Brands catalog VirtoCommerce/vc-sample-data added to the B2B sample store (PR #19,
 * VCST-3286): `Setup/B2BSampleStore/VirtoCommerce.Catalog.json` at merge commit
 * b08ab90e7766056abbdfc031974c3e9d05b8441a, git-LFS object
 * sha256:a1b209f82c465dbe72b0771ab8f77586e5f66cf4b6b40062573ea3c39a6a9989 (92 887 102 bytes).
 * `test-data/catalogs/brands.csv` carries its 19 brand categories (code, name, Featured flag,
 * description) and `test-data/uploads/brands/` the logo + banner of each, extracted verbatim from it.
 *
 * How the storefront reads it (the contract this fixture serves):
 *   - store settings `Catalog.BrandStoreSetting.{BrandsEnabled,BrandCatalogId,BrandPropertyName}` turn
 *     `/brands` on and name the catalog + the product property whose VALUE is matched to a brand
 *     category NAME;
 *   - each brand is a top-level category of that catalog: image group `Logo` (the tile) and `Banner`
 *     (the brand page header), a `FullReview` description, a store-scoped SEO record;
 *   - the "Top brands" logo row is driven by a Boolean CATEGORY property named `Featured` — without it
 *     `/brands` is a plain A–Z list with no logos;
 *   - the catalog itself needs a store-scoped SEO record `brands`, or `/brands` resolves to 404.
 */
import { extname } from 'node:path';

export const CSV_PATH = 'test-data/catalogs/brands.csv';
export const IMAGE_DIR = 'test-data/uploads/brands';
export const CSV_COLUMNS = ['brand_code', 'brand_name', 'featured', 'description', 'logo_file', 'banner_file', 'notes'];

/**
 * Platform asset folder the images are uploaded to — one half of the TEARDOWN MARKER (`isOurCategory`):
 * a category is "ours" when its code carries `CODE_PREFIX` or one of its image urls lies in this folder.
 * Brand NAMES are real (no AGENT-TEST prefix — the storefront matches them to product property values),
 * so an env-owned brand of the same name is never touched, never deleted.
 */
export const ASSET_FOLDER = 'catalog/agent-test-brands';

/** Name of the catalog the seeder creates when the store has no brand catalog configured. */
export const OWNED_CATALOG_SUFFIX = 'Brands';

export const SETTING = Object.freeze({
  enabled: 'Catalog.BrandStoreSetting.BrandsEnabled',
  catalogId: 'Catalog.BrandStoreSetting.BrandCatalogId',
  propertyName: 'Catalog.BrandStoreSetting.BrandPropertyName',
});
/** The sample store's value; used only when the env has none set. */
export const DEFAULT_BRAND_PROPERTY = 'Brand';

export const FEATURED_PROPERTY = 'Featured';

/**
 * Category CODE of a seeded brand. Prefixed so `td:reconcile` check [7] (every category of an
 * AGENT-TEST-SEED-* catalog carries the family prefix) holds, and so a seeded brand is recognisable
 * by code as well as by its marker image. The storefront never shows the code — brand URLs come from
 * the SEO slug (`brand_code`), and products match a brand by NAME.
 */
export const CODE_PREFIX = 'AGENT-TEST-SEED-BRAND-';
export const categoryCode = (row) => `${CODE_PREFIX}${row.brand_code}`;

/** The `pinned-links` menu entry the theme prepends inside the "All products" mega-menu. */
export const PINNED_LIST = 'pinned-links';
export const PINNED_LINK = Object.freeze({ title: 'Brands', url: '/brands', priority: 100 });

export const CONTENT_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export const contentTypeFor = (file) => CONTENT_TYPES[extname(file).toLowerCase()] || null;

/** Case/whitespace-insensitive brand-name key — the same key the storefront match is forgiving about. */
export const nameKey = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const isOurImage = (img) => String(img?.url || '').includes(`/${ASSET_FOLDER}/`);
export const isOurCategory = (cat) => String(cat?.code || '').startsWith(CODE_PREFIX) || (cat?.images || []).some(isOurImage);

export const isTrue = (v) => /^true$/i.test(String(v ?? '').trim());

/** The value a store setting carries, whichever shape the API answered in. */
export const settingValue = (settings, name) => {
  const s = (settings || []).find((x) => x.name === name);
  return s ? (s.value ?? s.values ?? null) : undefined;
};

/**
 * Store-setting changes needed for `/brands` to work against `catalogId`. Never overrides a brand
 * catalog or property name the env already configured — the caller resolves `catalogId` from the
 * existing setting first. Returns `[{ name, from, to }]` (empty = already in shape).
 */
export function planStoreSettings(settings, catalogId) {
  const out = [];
  const enabled = settingValue(settings, SETTING.enabled);
  if (enabled !== true && !isTrue(enabled)) out.push({ name: SETTING.enabled, from: enabled ?? null, to: true });
  const cid = settingValue(settings, SETTING.catalogId);
  if (cid !== catalogId) out.push({ name: SETTING.catalogId, from: cid ?? null, to: catalogId });
  const prop = settingValue(settings, SETTING.propertyName);
  if (!prop || !String(prop).trim()) out.push({ name: SETTING.propertyName, from: prop ?? null, to: DEFAULT_BRAND_PROPERTY });
  return out;
}

/** The three store settings must all be registered (a build without the brand feature has none). */
export const missingSettings = (settings) => Object.values(SETTING).filter((n) => settingValue(settings, n) === undefined);

/** The description goes into `<p>` as HTML; the validator rejects `<`/`>`, this escapes the rest. */
export const htmlText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * The SEO records a re-seed writes: the existing ones, with the record for this store + language
 * replaced by `seo` (so a changed slug, title or description in the CSV reaches a brand that was
 * already seeded). Records for other stores or languages are kept as they are.
 */
export function mergeSeo(existing, seo) {
  const same = (s) => s.storeId === seo.storeId && String(s.languageCode || '').toLowerCase() === String(seo.languageCode || '').toLowerCase();
  const keep = (existing || []).filter((s) => !same(s));
  const prior = (existing || []).find(same);
  return [...keep, prior ? { ...prior, ...seo } : seo];
}

/**
 * Create/update body for one brand category. `urls` = { logo, banner } (uploaded asset urls),
 * `featuredProp` = the catalog's Featured property ({ id }) or null, `seo` = the store-scoped SEO record,
 * `lang` = the store's default language (never a transcribed culture).
 */
export function categoryBody(row, { catalogId, urls, featuredProp, seo, lang, existing = null }) {
  if (!lang) throw new Error("categoryBody: lang is required (the store's defaultLanguage)");
  const images = [
    { url: urls.logo, name: row.logo_file, group: 'Logo', sortOrder: 0, languageCode: null },
    { url: urls.banner, name: row.banner_file, group: 'Banner', sortOrder: 1, languageCode: null },
  ];
  const properties = featuredProp && isTrue(row.featured)
    ? [{
      id: featuredProp.id, name: FEATURED_PROPERTY, catalogId, type: 'Category', valueType: 'Boolean',
      values: [{ propertyId: featuredProp.id, propertyName: FEATURED_PROPERTY, valueType: 'Boolean', value: true }],
    }]
    : [];
  const body = {
    ...(existing || {}),
    catalogId,
    code: categoryCode(row),
    name: row.brand_name,
    isActive: true,
    images,
    descriptions: [{ content: `<p>${htmlText(row.description)}</p>`, descriptionType: 'FullReview', languageCode: lang }],
    properties,
    seoInfos: mergeSeo(existing?.seoInfos, seo),
  };
  if (!existing) body.priority = 0;
  return body;
}

/** Static contract problems for the CSV rows. `fileExists(name)` is injected so this stays pure. */
export function rowProblems(rows, header, fileExists) {
  const out = [];
  const missingCols = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length) out.push(`CSV is missing column(s): ${missingCols.join(', ')}`);
  const seen = { code: new Map(), name: new Map(), file: new Map() };
  const dup = (kind, key, at) => {
    if (seen[kind].has(key)) out.push(`${at}: ${kind} "${key}" already used on row ${seen[kind].get(key)}`);
    else seen[kind].set(key, at);
  };
  rows.forEach((r, i) => {
    const at = `row ${i + 2}`;
    for (const c of ['brand_code', 'brand_name', 'description', 'logo_file', 'banner_file']) if (!r[c]) out.push(`${at}: empty ${c}`);
    if (r.brand_code && !/^[a-z0-9-]+$/.test(r.brand_code)) out.push(`${at}: brand_code "${r.brand_code}" — lowercase letters, digits and dashes only (it is also the SEO slug)`);
    if (!/^(true|false)$/i.test(String(r.featured ?? ''))) out.push(`${at}: featured must be true|false, got "${r.featured}"`);
    if (/[<>]/.test(r.description || '')) out.push(`${at}: description carries markup — the seeder wraps it in <p>`);
    for (const c of ['logo_file', 'banner_file']) {
      const f = r[c];
      if (!f) continue;
      if (!contentTypeFor(f)) out.push(`${at}: ${f} — unsupported extension (${Object.keys(CONTENT_TYPES).join(' ')})`);
      if (!fileExists(f)) out.push(`${at}: ${f} not found in ${IMAGE_DIR}/`);
      dup('file', f.toLowerCase(), at);
    }
    if (r.brand_code) dup('code', r.brand_code, at);
    if (r.brand_name) dup('name', nameKey(r.brand_name), at);
  });
  return out;
}
