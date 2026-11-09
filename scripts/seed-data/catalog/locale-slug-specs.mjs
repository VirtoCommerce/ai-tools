/**
 * scripts/seed-data/catalog/locale-slug-specs.mjs
 *
 * SINGLE source of truth for the locale↔slug collision category (L10N-ROUTE-001/002, suite 046,
 * VCST-5144). Side-effect-free — the seeder and the drift guard import the same rules.
 * Data: test-data/catalogs/locale-slug-categories.csv.
 *
 * WHAT MAKES THE CASES DECIDABLE
 *   - The category is TOP-LEVEL on the storefront (linked into the root of the store's virtual
 *     catalog) — the cases enumerate only top-level category links on /catalog.
 *   - Its slug STARTS with a 2-letter code the store actually serves (collision_locale), and the
 *     store has a culture for that code (seo_languages carries <code>-XX). Without both, the
 *     STRUCTURAL GUARD skips the case and the defect stays untested.
 *   - The slug is the SAME in every store language. A language switch may then change only the
 *     locale prefix; any difference in the slug part is the defect, never a legitimately
 *     localized slug — the one confusion that would make an "eaten" slug indistinguishable from a
 *     translated one.
 *   - The slug must not start with the seeders' usual "seed-" prefix (ensureCategoryPath's), which
 *     is why this seeder creates the category itself.
 */

export const CSV_SOURCE = { key: 'catalogs/locale-slug-categories', file: 'catalogs/locale-slug-categories.csv' };
export const RUNTIME_COLUMNS = ['category_id'];
export const SEED_PREFIX = 'AGENT-TEST';
export const SEED_FAMILY = 'AGENT-TEST-SEED'; // == seed-common SEED_FAMILY (kept here: this module must stay import-free)
/** The 2-letter codes the suite-046 cases scan for (their supported_2letter_codes data column). */
export const CASE_CODES = Object.freeze(['de', 'it', 'no', 'pl', 'fi', 'ru', 'es', 'pt', 'fr', 'sv', 'el']);

const str = (v) => String(v ?? '').trim();
const truthy = (v) => /^(true|yes|1)$/i.test(str(v));

export function loadFixtures(rows) {
  return (rows || []).filter((r) => str(r.fixture_key)).map((r) => ({
    key: str(r.fixture_key), name: str(r.category_name), code: str(r.category_code), slug: str(r.slug), url: str(r.url),
    collisionLocale: str(r.collision_locale).toLowerCase(), languages: str(r.seo_languages).split('|').map(str).filter(Boolean),
    seeded: truthy(r.seeded),
  }));
}

/** One SEO record per language, identical slug. `storeId` scoped like every seeded SEO. Pure. */
export function buildSeoInfos(fx, storeId) {
  return fx.languages.map((languageCode) => ({ storeId, languageCode, semanticUrl: fx.slug, pageTitle: fx.name, metaDescription: '', isActive: true }));
}

/** Problems that would make L10N-ROUTE-001/002 skip or pass vacuously. `storeLanguages` optional (live). */
export function validateFixtureShape(rows, storeLanguages = null) {
  const P = [];
  const fxs = loadFixtures(rows);
  if (!fxs.length) return [`${CSV_SOURCE.file}: no fixture rows`];
  const slugs = new Set();
  for (const fx of fxs) {
    const t = `${fx.key}`;
    if (!fx.seeded) P.push(`${t}: seeded=false — the seeder would skip it and the cases keep skipping`);
    if (!fx.name.startsWith(SEED_PREFIX)) P.push(`${t}: category_name must start with ${SEED_PREFIX}`);
    // td:reconcile [7]: every category in a seed catalog must carry the AGENT-TEST-SEED code family.
    if (!fx.code.startsWith(`${SEED_FAMILY}-`)) P.push(`${t}: category_code must start with ${SEED_FAMILY}- (td:reconcile [7] — a seed-catalog category without it is reported as an orphan)`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fx.slug)) P.push(`${t}: slug "${fx.slug}" is not a plain lowercase slug`);
    if (fx.slug.startsWith('seed-')) P.push(`${t}: slug starts with "seed-" — it no longer collides with any locale code`);
    if (!CASE_CODES.includes(fx.collisionLocale)) P.push(`${t}: collision_locale "${fx.collisionLocale}" is not one the cases scan for (${CASE_CODES.join('|')})`);
    if (fx.slug.slice(0, 2) !== fx.collisionLocale) P.push(`${t}: slug "${fx.slug}" does not start with collision_locale "${fx.collisionLocale}" — no collision to test`);
    if (fx.slug.length <= 2 || fx.slug === fx.collisionLocale) P.push(`${t}: slug must be LONGER than the locale code, or nothing is left to be eaten`);
    if (!fx.languages.some((l) => l.toLowerCase().startsWith(`${fx.collisionLocale}-`))) P.push(`${t}: seo_languages has no ${fx.collisionLocale}-XX culture — the collision locale has no slug record`);
    if (new Set(fx.languages).size !== fx.languages.length) P.push(`${t}: seo_languages repeats a language`);
    if (fx.url !== `/${fx.slug}`) P.push(`${t}: url "${fx.url}" must be "/${fx.slug}" (a top-level category route)`);
    if (slugs.has(fx.slug)) P.push(`${t}: slug "${fx.slug}" repeats`); slugs.add(fx.slug);
    if (storeLanguages) {
      const missing = storeLanguages.filter((l) => !fx.languages.includes(l));
      if (missing.length) P.push(`${t}: store language(s) ${missing.join(', ')} have no SEO record — a switch to them may render a different slug or 404`);
      if (!storeLanguages.some((l) => l.toLowerCase().startsWith(`${fx.collisionLocale}-`))) P.push(`${t}: the store serves no ${fx.collisionLocale}-XX culture`);
    }
  }
  return P;
}
