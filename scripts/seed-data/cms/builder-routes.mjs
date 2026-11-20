/**
 * scripts/seed-data/cms/builder-routes.mjs
 *
 * Which content-builder module a stand runs, and the REST routes that follow from it. Site Builder
 * (VirtoCommerce.SiteBuilder) replaces Page Builder (VirtoCommerce.PageBuilderModule) and renamed every
 * route family; the request and response shapes the CMS seeders use are unchanged (checked against the
 * vcst swagger of VirtoCommerce.SiteBuilder 3.1000.0-pr-1-28d0, 2026-11-19: search, grouped, grouped/{id},
 * publishing, archive, content, create-group-page, shared-components search/{id}/content, assets
 * search/references). The family is read from /api/platform/modules, never guessed from the env name, so
 * one seeder serves both the Page Builder stands (vcptcore-*, virtostart) and the Site Builder ones (vcst).
 *
 * `routesFor` is pure (the drift guard checks it); `resolveBuilderRoutes` does the one GET.
 */

export const FAMILIES = {
  'site-builder': {
    moduleId: 'VirtoCommerce.SiteBuilder',
    pages: '/api/site-builder-pages',
    shared: '/api/site-builder-shared-components',
    assets: '/api/site-builder-assets',
    // Platform export/import part names (SiteBuilderExportImport.cs at 28d00e0).
    exportPages: 'SiteBuilderPages',
    exportShared: 'SiteBuilderSharedComponents',
  },
  'page-builder': {
    moduleId: 'VirtoCommerce.PageBuilderModule',
    pages: '/api/page-builder-pages',
    shared: '/api/page-builder-shared-components',
    assets: '/api/page-builder-assets',
    exportPages: 'PageBuilderPages',
    exportShared: 'PageBuilderSharedComponents',
  },
};

/** The route set of a family. Pure. */
export function routesFor(family) {
  const r = FAMILIES[family];
  if (!r) throw new Error(`unknown builder family "${family}" (known: ${Object.keys(FAMILIES).join(', ')})`);
  return { family, ...r };
}

/** The family a module list carries: Site Builder wins when both are installed (it owns the storefront then). */
export function familyOf(modules) {
  const installed = new Set((modules || []).filter((m) => m && m.isInstalled !== false).map((m) => m.id));
  if (installed.has(FAMILIES['site-builder'].moduleId)) return 'site-builder';
  if (installed.has(FAMILIES['page-builder'].moduleId)) return 'page-builder';
  return null;
}

/**
 * Read the installed modules and return the route set. Throws when neither builder is installed — a CMS
 * seeder has nothing to talk to then, and silently picking one would only move the failure to a 404.
 * `api` is seed-common's api(); GET is a read, so it runs on --dry-run too.
 */
export async function resolveBuilderRoutes(api) {
  const modules = await api('GET', '/api/platform/modules', null, { expectStatus: [200] });
  const family = familyOf(Array.isArray(modules) ? modules : []);
  if (!family) throw new Error('neither VirtoCommerce.SiteBuilder nor VirtoCommerce.PageBuilderModule is installed on this stand');
  return routesFor(family);
}
