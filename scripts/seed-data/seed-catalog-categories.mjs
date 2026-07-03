#!/usr/bin/env node
/**
 * seed-catalog-categories.mjs — Category tree seeder (Categories phase, priority 20 in seed-bootstrap).
 *
 * Thin wrapper over the shared seedCategoryTree() in seed-common.mjs: creates the category hierarchy
 * from test-data/catalogs/categories.csv (STABLE codes AGENT-TEST-SEED-<code>, parents before
 * children) in the physical catalogs, then links each catalog's ROOT categories into the store's
 * virtual catalog so they surface on the storefront. Self-resolves the catalog map (runs as its own
 * process), so it can run standalone or after seed-catalog. Idempotent.
 *
 * Usage:
 *   node scripts/seed-data/seed-catalog-categories.mjs [--dry-run] [--verbose]
 *   TEST_ENV=localhost npm run seed:categories
 */
import { DRY_RUN, log, assertSafeTarget, auth, api, seedCategoryTree } from '../lib/seed-common.mjs';

(async () => {
  console.log(`🗂  Seed Categories${DRY_RUN ? ' [DRY RUN]' : ''}`);
  assertSafeTarget();
  await auth();
  const map = await seedCategoryTree(api);
  log(`Done: ${Object.keys(map).length} categor${Object.keys(map).length === 1 ? 'y' : 'ies'} ensured + roots linked.`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
